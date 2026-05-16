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

const placeholder = (i: number): EnginePlayer => ({
  id: -1 * (i + 1),
  name: `CPU ${i + 1}`,
  position: ['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot'][i % 5],
  overall: 45, shooting_2pt: 45, shooting_3pt: 40, defense: 45,
  passing: 42, rebounding: 44, dribbling: 42, speed: 46, stamina: 100,
  experience: 0, forma: 75,
});

const ensureRoster = (roster: EnginePlayer[]) => {
  const out = [...roster];
  while (out.length < 5) out.push(placeholder(out.length));
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

const patchMatchReplay = async (
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  matchId: number
): Promise<{ ok: boolean; eventsCount?: number; error?: string; alreadyHasReplay?: boolean }> => {
  const { data: match, error: matchErr } = await supabaseAdmin
    .from('matches')
    .select('id,home_team_id,away_team_id,home_score,away_score,play_by_play,home_tactics,away_tactics')
    .eq('id', matchId)
    .maybeSingle();

  if (matchErr || !match) return { ok: false, error: 'Partido no encontrado' };
  if (!(match as any).played) return { ok: false, error: 'El partido aún no está jugado' };

  const existing = (match as any).play_by_play;
  if (Array.isArray(existing) && existing.length > 0) {
    return { ok: true, alreadyHasReplay: true, eventsCount: existing.length };
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
  const homeTeam = teams.find((t: any) => String(t.id) === String(m.home_team_id));
  const awayTeam = teams.find((t: any) => String(t.id) === String(m.away_team_id));
  if (!homeTeam || !awayTeam) return { ok: false, error: 'Equipos no encontrados' };

  const homePlayers = players.filter((p: any) => String(p.team_id) === String(m.home_team_id)).map(toEnginePlayer);
  const awayPlayers = players.filter((p: any) => String(p.team_id) === String(m.away_team_id)).map(toEnginePlayer);

  const simulation = generateMatchSimulation({
    homeRoster: ensureRoster(homePlayers),
    awayRoster: ensureRoster(awayPlayers),
    homeGamePlan: extractGamePlan(m.home_tactics, homeTeam),
    awayGamePlan: extractGamePlan(m.away_tactics, awayTeam),
    homeTeamName: homeTeam.nombre,
    awayTeamName: awayTeam.nombre,
    homeTeamColor: homeTeam.color_primario || '#3b82f6',
    awayTeamColor: awayTeam.color_primario || '#ef4444',
    settings,
    positionOverallConfig: positionConfig,
  });

  if (!simulation.events.length) return { ok: false, error: 'La simulación no generó eventos' };

  const { error: patchErr } = await supabaseAdmin
    .from('matches')
    .update({ play_by_play: simulation.events })
    .eq('id', matchId)
    .eq('played', true);

  if (patchErr) return { ok: false, error: patchErr.message };
  return { ok: true, eventsCount: simulation.events.length };
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
  const rawId = body?.matchId;

  // Mode A: specific matchId
  if (rawId !== undefined && rawId !== null && rawId !== '') {
    const matchId = Number(rawId);
    if (!Number.isFinite(matchId) || matchId <= 0) {
      return NextResponse.json({ error: 'matchId inválido' }, { status: 400 });
    }
    const result = await patchMatchReplay(supabaseAdmin, matchId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    const { ok: _ok, ...rest } = result;
    return NextResponse.json({ ok: true, matchId, ...rest });
  }

  // Mode B: pick next played match with missing play_by_play
  // First look for null, then for empty-array (edge case)
  let nextId: number | null = null;

  const { data: nullMatch, error: nullErr } = await supabaseAdmin
    .from('matches')
    .select('id')
    .eq('played', true)
    .is('play_by_play', null)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nullErr) return NextResponse.json({ error: nullErr.message }, { status: 500 });

  if (nullMatch) {
    nextId = (nullMatch as any).id;
  } else {
    // Fallback: scan a batch for empty-array play_by_play
    const { data: candidateBatch, error: batchErr } = await supabaseAdmin
      .from('matches')
      .select('id, play_by_play')
      .eq('played', true)
      .not('play_by_play', 'is', null)
      .order('id', { ascending: true })
      .limit(200);

    if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 });

    const emptyMatch = ((candidateBatch || []) as any[]).find(
      (m) => Array.isArray(m.play_by_play) && m.play_by_play.length === 0
    );
    nextId = emptyMatch ? emptyMatch.id : null;
  }

  const { count: remaining } = await supabaseAdmin
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('played', true)
    .is('play_by_play', null);

  if (nextId === null) {
    return NextResponse.json({ ok: true, result: 'nothing_to_patch', remaining: remaining ?? 0 });
  }

  const matchId = nextId;
  const result = await patchMatchReplay(supabaseAdmin, matchId);

  const { ok: _ok, ...rest } = result;
  return NextResponse.json({ ok: true, matchId, remaining: Math.max(0, (remaining ?? 0) - 1), ...rest });
}
