import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { generateMatchSimulation, type EnginePlayer, type TeamGamePlan } from '@/lib/match-engine';
import { fetchMatchSimulatorSettings } from '@/lib/match-simulator-config';
import { fetchPositionOverallConfig } from '@/lib/position-overall-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const isAdmin = async (supabaseAdmin: ReturnType<typeof getSupabaseAdmin>, token: string) => {
  const { data: authData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !authData?.user) return false;
  const { data: manager } = await supabaseAdmin
    .from('managers')
    .select('is_admin')
    .eq('owner_id', authData.user.id)
    .maybeSingle();
  return Boolean((manager as any)?.is_admin);
};

const toEnginePlayer = (p: any): EnginePlayer => ({
  id: p.id,
  name: p.name,
  position: p.position,
  overall: Number(p.overall || 50),
  shooting_2pt: Number(p.shooting_2pt || 50),
  shooting_3pt: Number(p.shooting_3pt || 50),
  defense: Number(p.defense || 50),
  passing: Number(p.passing || 50),
  rebounding: Number(p.rebounding || 50),
  dribbling: Number(p.dribbling || 50),
  speed: Number(p.speed || 50),
  stamina: Number(p.stamina || 100),
  experience: Number(p.experience || 0),
  forma: Number(p.forma || 80),
});

const placeholder = (teamId: string, i: number): EnginePlayer => ({
  id: -1 * (i + 1),
  name: `CPU ${i + 1}`,
  position: ['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot'][i % 5],
  overall: 45, shooting_2pt: 45, shooting_3pt: 40, defense: 45,
  passing: 42, rebounding: 44, dribbling: 42, speed: 46, stamina: 100,
  experience: 0, forma: 75,
});

const ensureRoster = (teamId: string, roster: EnginePlayer[]) => {
  const out = [...roster];
  while (out.length < 5) out.push(placeholder(teamId, out.length));
  return out;
};

const extractGamePlan = (tactics: unknown, team: any): TeamGamePlan => {
  const src = (tactics && typeof tactics === 'object') ? tactics as any : {};
  return {
    rotations: src.rotations || (team?.rotations ? team.rotations : undefined),
    offenseStyle: src.offense || team?.tactic_offense || undefined,
    defenseStyle: src.defense || team?.tactic_defense || undefined,
  };
};

export async function POST(request: NextRequest) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  if (!(await isAdmin(supabaseAdmin, token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { matchId?: unknown } | null;
  const matchId = Number(body?.matchId);
  if (!Number.isFinite(matchId) || matchId <= 0) {
    return NextResponse.json({ error: 'matchId inválido' }, { status: 400 });
  }

  const { data: match, error: matchErr } = await supabaseAdmin
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .maybeSingle();

  if (matchErr || !match) {
    return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
  }
  if (!(match as any).played) {
    return NextResponse.json({ error: 'El partido aún no está jugado' }, { status: 400 });
  }

  const existing = (match as any).play_by_play;
  if (Array.isArray(existing) && existing.length > 0) {
    return NextResponse.json({ ok: true, matchId, alreadyHasReplay: true, eventsCount: existing.length });
  }

  const m = match as any;
  const [teamsRes, playersRes, settings, positionConfig] = await Promise.all([
    supabaseAdmin.from('clubes').select('id,nombre,color_primario,rotations,tactic_offense,tactic_defense').in('id', [m.home_team_id, m.away_team_id]),
    supabaseAdmin.from('players').select('id,name,position,overall,shooting_2pt,shooting_3pt,defense,passing,rebounding,dribbling,speed,stamina,experience,forma,team_id').in('team_id', [m.home_team_id, m.away_team_id]),
    fetchMatchSimulatorSettings(supabaseAdmin),
    fetchPositionOverallConfig(supabaseAdmin),
  ]);

  const teams = (teamsRes.data || []) as any[];
  const players = (playersRes.data || []) as any[];
  const homeTeam = teams.find((t) => String(t.id) === String(m.home_team_id));
  const awayTeam = teams.find((t) => String(t.id) === String(m.away_team_id));
  if (!homeTeam || !awayTeam) {
    return NextResponse.json({ error: 'Equipos no encontrados' }, { status: 400 });
  }

  const homePlayers = players.filter((p) => String(p.team_id) === String(m.home_team_id)).map(toEnginePlayer);
  const awayPlayers = players.filter((p) => String(p.team_id) === String(m.away_team_id)).map(toEnginePlayer);
  const homeRoster = ensureRoster(m.home_team_id, homePlayers);
  const awayRoster = ensureRoster(m.away_team_id, awayPlayers);

  const simulation = generateMatchSimulation({
    homeRoster,
    awayRoster,
    homeGamePlan: extractGamePlan(m.home_tactics, homeTeam),
    awayGamePlan: extractGamePlan(m.away_tactics, awayTeam),
    homeTeamName: homeTeam.nombre,
    awayTeamName: awayTeam.nombre,
    homeTeamColor: homeTeam.color_primario || '#3b82f6',
    awayTeamColor: awayTeam.color_primario || '#ef4444',
    settings,
    positionOverallConfig: positionConfig,
  });

  if (!simulation.events.length) {
    return NextResponse.json({ error: 'La simulación no generó eventos' }, { status: 500 });
  }

  const { error: patchErr } = await supabaseAdmin
    .from('matches')
    .update({ play_by_play: simulation.events })
    .eq('id', matchId)
    .eq('played', true);

  if (patchErr) {
    return NextResponse.json({ error: patchErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matchId, eventsCount: simulation.events.length });
}
