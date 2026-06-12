import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { generateMatchSimulation, type EnginePlayer, type TeamGamePlan } from '@/lib/match-engine';
import { fetchMatchSimulatorSettings } from '@/lib/match-simulator-config';
import { fetchPositionOverallConfig } from '@/lib/position-overall-config';
import { shouldFallbackFromFinalizeMatchRpc } from '@/lib/finalize-match-compat';

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

export async function POST(request: NextRequest) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  if (!(await isAdmin(supabaseAdmin, token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const now = new Date();

  // Fetch the next due unplayed match
  const { data: matchData, error: matchErr } = await supabaseAdmin
    .from('matches')
    .select('id,jornada,fase,played,home_team_id,away_team_id,home_score,away_score,match_date,home_tactics,away_tactics,play_by_play')
    .eq('played', false)
    .not('match_date', 'is', null)
    .lte('match_date', now.toISOString())
    .order('match_date', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (matchErr) {
    return NextResponse.json({ ok: false, error: matchErr.message }, { status: 500 });
  }
  if (!matchData) {
    return NextResponse.json({ ok: true, result: 'nothing_due', finalized: 0, pending: 0 });
  }

  const m = matchData as any;

  // Count remaining pending matches
  const { count: pending } = await supabaseAdmin
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('played', false)
    .not('match_date', 'is', null)
    .lte('match_date', now.toISOString());

  const [teamsRes, playersRes, settings, positionConfig] = await Promise.all([
    supabaseAdmin.from('clubes').select('id,nombre,color_primario,rotations,tactic_offense,tactic_defense').in('id', [m.home_team_id, m.away_team_id]),
    supabaseAdmin.from('players').select('id,name,position,overall,shooting_2pt,shooting_3pt,defense,passing,rebounding,dribbling,speed,stamina,experience,forma,team_id').in('team_id', [m.home_team_id, m.away_team_id]),
    fetchMatchSimulatorSettings(supabaseAdmin),
    fetchPositionOverallConfig(supabaseAdmin),
  ]);

  const teams = (teamsRes.data || []) as any[];
  const players = (playersRes.data || []) as any[];
  if (teamsRes.error) {
    return NextResponse.json({ ok: false, error: teamsRes.error.message }, { status: 500 });
  }
  if (playersRes.error) {
    return NextResponse.json({ ok: false, error: playersRes.error.message }, { status: 500 });
  }
  const homeTeam = teams.find((t) => String(t.id) === String(m.home_team_id));
  const awayTeam = teams.find((t) => String(t.id) === String(m.away_team_id));

  if (!homeTeam || !awayTeam) {
    return NextResponse.json({ ok: false, error: `Equipos no encontrados para match ${m.id}` }, { status: 400 });
  }

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

  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('finalize_match_transaction', {
    p_match_id: m.id,
    p_home_score: simulation.finalScore.home,
    p_away_score: simulation.finalScore.away,
    p_play_by_play: simulation.events,
    p_player_stats: [],
  });

  if (rpcError && !shouldFallbackFromFinalizeMatchRpc(rpcError)) {
    return NextResponse.json({ ok: false, error: rpcError.message }, { status: 500 });
  }

  if (rpcError) {
    const { data: updatedMatch, error: updateErr } = await supabaseAdmin
      .from('matches')
      .update({
        played: true,
        home_score: simulation.finalScore.home,
        away_score: simulation.finalScore.away,
        play_by_play: simulation.events,
      })
      .eq('id', m.id)
      .eq('played', false)
      .select('id')
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }
    if (!updatedMatch) {
      return NextResponse.json({
        ok: true,
        result: 'already_played',
        finalized: 0,
        matchId: m.id,
        pending: Math.max(0, (pending ?? 1) - 1),
      });
    }
  } else if ((rpcData as { status?: string } | null)?.status === 'already_played') {
    return NextResponse.json({
      ok: true,
      result: 'already_played',
      finalized: 0,
      matchId: m.id,
      pending: Math.max(0, (pending ?? 1) - 1),
    });
  }

  return NextResponse.json({
    ok: true,
    result: 'finalized',
    finalized: 1,
    matchId: m.id,
    score: `${simulation.finalScore.home}-${simulation.finalScore.away}`,
    eventsCount: simulation.events.length,
    pending: Math.max(0, (pending ?? 1) - 1),
  });
}
