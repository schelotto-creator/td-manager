import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateMatchSimulation,
  type EnginePlayer,
  type EngineTactics,
  type MatchEvent,
  type TeamGamePlan
} from '@/lib/match-engine';
import { fetchMatchSimulatorSettings } from '@/lib/match-simulator-config';
import { fetchPositionOverallConfig } from '@/lib/position-overall-config';

type TeamId = string;
type TeamSide = 'home' | 'away';

type MatchRow = {
  id: number;
  jornada: number;
  fase?: string | null;
  played: boolean;
  home_team_id: TeamId;
  away_team_id: TeamId;
  home_score: number;
  away_score: number;
  match_date?: string | null;
  home_tactics?: unknown;
  away_tactics?: unknown;
  play_by_play?: unknown;
  simulated_home_score?: number | null;
  simulated_away_score?: number | null;
  simulated_play_by_play?: unknown;
  simulated_player_stats?: unknown;
  simulation_ready_at?: string | null;
};

type TeamRow = {
  id: TeamId;
  nombre: string;
  color_primario?: string | null;
  rotations?: unknown;
  tactic_offense?: string | null;
  tactic_defense?: string | null;
};

type RawPlayerRow = {
  id: number;
  name: string;
  position: string;
  overall: number;
  shooting_2pt?: number | null;
  shooting_3pt?: number | null;
  defense?: number | null;
  passing?: number | null;
  rebounding?: number | null;
  dribbling?: number | null;
  speed?: number | null;
  stamina?: number | null;
  experience?: number | null;
  forma?: number | null;
  team_id: TeamId;
};

type PlayerGameStat = {
  player_id: number;
  team_id: TeamId;
  points: number;
  rebounds: number;
  assists: number;
  turnovers: number;
  efficiency: number;
};

type FinalizeMatchRpcResponse = {
  status?: string;
  warning?: string | null;
};

type FinalizeResult =
  | { status: 'ok'; warning?: string | null }
  | { status: 'already_played'; warning?: string | null };

export type ScheduledMatchesRunSummary = {
  dueCount: number;
  totalDueWithoutLimit: number;
  prepWindowCount: number;
  processed: number;
  simulated: number;
  finalized: number;
  alreadyPlayed: number;
  skipped: number;
  pendingWithoutDate: number;
  warnings: string[];
  errors: Array<{ matchId: number; reason: string }>;
};

type PreparedSimulation = {
  finalHome: number;
  finalAway: number;
  events: MatchEvent[];
  statsRows: PlayerGameStat[];
};

type PrepareSimulationResult =
  | { status: 'ok'; match: MatchRow }
  | { status: 'already_prepared'; match: MatchRow }
  | { status: 'already_played'; match: MatchRow };

const DEFAULT_SCHEDULED_MATCH_PREP_MINUTES = 15;
const MATCH_SELECT_FIELDS =
  'id,jornada,fase,played,home_team_id,away_team_id,home_score,away_score,match_date,home_tactics,away_tactics,play_by_play,simulated_home_score,simulated_away_score,simulated_play_by_play,simulated_player_stats,simulation_ready_at';
const MATCH_SCHEDULE_TIME_ZONE = 'Europe/Madrid';
const MADRID_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: MATCH_SCHEDULE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

const chunkArray = <T>(items: T[], size: number) => {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toErrorText = (error: unknown) => {
  if (!error) return 'Error desconocido';
  if (typeof error === 'string') return error;
  if (isRecord(error)) {
    const message = typeof error.message === 'string' ? error.message : '';
    const details = typeof error.details === 'string' ? error.details : '';
    const hint = typeof error.hint === 'string' ? error.hint : '';
    return [message, details, hint].filter(Boolean).join(' ').trim() || JSON.stringify(error);
  }
  return String(error);
};

const isFinalizeMatchRpcMissing = (error: unknown) => {
  const message = toErrorText(error).toLowerCase();
  const code = isRecord(error) && typeof error.code === 'string' ? error.code.toLowerCase() : '';

  if (code === 'pgrst202' || code === '42883') return true;

  return (
    message.includes('finalize_match_transaction') &&
    (message.includes('could not find the function') ||
      message.includes('no function matches') ||
      message.includes('does not exist') ||
      message.includes('not found'))
  );
};

const hasMissingStandingsColumns = (error: unknown) => {
  const message = toErrorText(error).toLowerCase();
  return (
    message.includes('column clubes.pj does not exist') ||
    message.includes('column clubes.v does not exist') ||
    message.includes('column clubes.d does not exist') ||
    message.includes('column clubes.pts does not exist')
  );
};

const getScheduledMatchPrepMinutes = () => {
  const raw = Number(
    process.env.SCHEDULED_MATCH_PREP_MINUTES ||
      process.env.CRON_MATCH_PREP_MINUTES ||
      DEFAULT_SCHEDULED_MATCH_PREP_MINUTES
  );
  if (!Number.isFinite(raw)) return DEFAULT_SCHEDULED_MATCH_PREP_MINUTES;
  return Math.max(1, Math.min(180, Math.round(raw)));
};

const getMatchDateMs = (match: MatchRow) => {
  if (!match.match_date) return null;
  const parsed = new Date(match.match_date);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : null;
};

const isMatchDueBy = (match: MatchRow, cutoff: Date) => {
  const matchDateMs = getMatchDateMs(match);
  if (matchDateMs === null) return false;
  return matchDateMs <= cutoff.getTime();
};

const getPreparedSimulation = (match: MatchRow): PreparedSimulation | null => {
  if (!Array.isArray(match.simulated_play_by_play)) return null;

  const finalHome = Number(match.simulated_home_score);
  const finalAway = Number(match.simulated_away_score);
  if (!Number.isFinite(finalHome) || !Number.isFinite(finalAway)) return null;

  return {
    finalHome,
    finalAway,
    events: match.simulated_play_by_play as MatchEvent[],
    statsRows: Array.isArray(match.simulated_player_stats)
      ? (match.simulated_player_stats as PlayerGameStat[])
      : []
  };
};

const getFormatterPartNumber = (
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
) => {
  const value = parts.find((part) => part.type === type)?.value;
  return Number(value || '0');
};

const buildUtcDateFromMadridLocal = (
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number
) => {
  const initialUtcGuess = new Date(Date.UTC(year, monthIndex, day, hour, minute, 0));
  const zonedParts = MADRID_DATE_TIME_FORMATTER.formatToParts(initialUtcGuess);
  const actualLocalMs = Date.UTC(
    getFormatterPartNumber(zonedParts, 'year'),
    getFormatterPartNumber(zonedParts, 'month') - 1,
    getFormatterPartNumber(zonedParts, 'day'),
    getFormatterPartNumber(zonedParts, 'hour'),
    getFormatterPartNumber(zonedParts, 'minute'),
    getFormatterPartNumber(zonedParts, 'second')
  );
  const desiredLocalMs = Date.UTC(year, monthIndex, day, hour, minute, 0);
  return new Date(initialUtcGuess.getTime() + (desiredLocalMs - actualLocalMs));
};

const computeMatchDateFromJornada = (jornada: number | null | undefined) => {
  const numericRound = Number(jornada);
  if (!Number.isFinite(numericRound)) return null;

  const round = Math.max(1, Math.trunc(numericRound));
  const weekOffset = Math.floor((round - 1) / 2);
  const isSaturday = round % 2 === 0;
  const daysToAdd = weekOffset * 7 + (isSaturday ? 3 : 0);
  const baseDate = new Date(Date.UTC(2026, 2, 4 + daysToAdd, 0, 0, 0));

  return buildUtcDateFromMadridLocal(
    baseDate.getUTCFullYear(),
    baseDate.getUTCMonth(),
    baseDate.getUTCDate(),
    isSaturday ? 12 : 18,
    30
  );
};

const compareMatchesByDate = (a: MatchRow, b: MatchRow) => {
  const aTime = getMatchDateMs(a) ?? Number.MAX_SAFE_INTEGER;
  const bTime = getMatchDateMs(b) ?? Number.MAX_SAFE_INTEGER;
  if (aTime !== bTime) return aTime - bTime;
  return a.id - b.id;
};

const toEnginePlayer = (player: RawPlayerRow): EnginePlayer => ({
  id: player.id,
  name: player.name,
  position: player.position,
  overall: Number(player.overall || 50),
  shooting_2pt: Number(player.shooting_2pt || 50),
  shooting_3pt: Number(player.shooting_3pt || 50),
  defense: Number(player.defense || 50),
  passing: Number(player.passing || 50),
  rebounding: Number(player.rebounding || 50),
  dribbling: Number(player.dribbling || 50),
  speed: Number(player.speed || 50),
  stamina: Number(player.stamina || 100),
  experience: Number(player.experience || 0),
  forma: Number(player.forma || 80)
});

const buildSyntheticPlayerId = (teamId: TeamId, slotIndex: number) => {
  let hash = 0;
  for (const ch of String(teamId)) {
    hash = (hash * 31 + ch.charCodeAt(0)) % 1_000_000;
  }
  return -1 * (hash * 10 + slotIndex + 1);
};

const buildPlaceholderPlayer = (teamId: TeamId, slotIndex: number): EnginePlayer => ({
  id: buildSyntheticPlayerId(teamId, slotIndex),
  name: `CPU Placeholder ${slotIndex + 1}`,
  position: ['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot'][slotIndex % 5],
  overall: 45,
  shooting_2pt: 45,
  shooting_3pt: 40,
  defense: 45,
  passing: 42,
  rebounding: 44,
  dribbling: 42,
  speed: 46,
  stamina: 100,
  experience: 0,
  forma: 75
});

const ensureSimulationRoster = (teamId: TeamId, roster: EnginePlayer[]) => {
  const output = [...roster];
  while (output.length < 5) {
    output.push(buildPlaceholderPlayer(teamId, output.length));
  }
  return output;
};

const extractTacticsRotations = (source: unknown): EngineTactics | undefined => {
  const candidate = isRecord(source)
    ? (isRecord(source.rotations) ? source.rotations : source)
    : source;

  if (!isRecord(candidate)) return undefined;

  const tactics: EngineTactics = {};
  (['q1', 'q2', 'q3', 'q4'] as const).forEach((q) => {
    const quarter = candidate[q];
    if (!isRecord(quarter)) return;
    const normalized: Record<string, number> = {};
    Object.entries(quarter).forEach(([slot, rawId]) => {
      const playerId = Number(rawId);
      if (Number.isFinite(playerId) && playerId > 0) normalized[slot] = playerId;
    });
    if (Object.keys(normalized).length > 0) tactics[q] = normalized;
  });

  return Object.keys(tactics).length > 0 ? tactics : undefined;
};

const extractTeamGamePlan = (matchTactics: unknown, fallbackTeam?: TeamRow): TeamGamePlan => {
  const rotations =
    extractTacticsRotations(matchTactics) ||
    extractTacticsRotations(fallbackTeam?.rotations);

  const offenseStyle =
    isRecord(matchTactics) && typeof matchTactics.offense === 'string'
      ? matchTactics.offense
      : fallbackTeam?.tactic_offense || undefined;

  const defenseStyle =
    isRecord(matchTactics) && typeof matchTactics.defense === 'string'
      ? matchTactics.defense
      : fallbackTeam?.tactic_defense || undefined;

  return {
    rotations,
    offenseStyle,
    defenseStyle
  };
};

const fetchRosterByTeamIds = async (
  supabaseAdmin: SupabaseClient,
  teamIds: string[]
) => {
  const uniqueTeamIds = [...new Set(teamIds.map((id) => String(id)).filter(Boolean))];
  const allPlayers: RawPlayerRow[] = [];

  for (const batch of chunkArray(uniqueTeamIds, 20)) {
    const { data, error } = await supabaseAdmin
      .from('players')
      .select(
        'id,name,position,overall,shooting_2pt,shooting_3pt,defense,passing,rebounding,dribbling,speed,stamina,experience,forma,team_id'
      )
      .in('team_id', batch);

    if (error) {
      throw new Error(`No se pudieron cargar plantillas: ${toErrorText(error)}`);
    }

    allPlayers.push(...((data as RawPlayerRow[] | null | undefined) || []));
  }

  return allPlayers;
};

const normalizeName = (name: string) => name.trim().toLowerCase();

const buildNameMap = (players: EnginePlayer[]) => {
  const map = new Map<string, EnginePlayer[]>();
  players.forEach((player) => {
    const key = normalizeName(player.name);
    const curr = map.get(key) || [];
    curr.push(player);
    map.set(key, curr);
  });
  return map;
};

const buildPlayerGameStatsFromEvents = (
  events: MatchEvent[],
  homePlayers: EnginePlayer[],
  awayPlayers: EnginePlayer[],
  homeTeamId: TeamId,
  awayTeamId: TeamId
): PlayerGameStat[] => {
  const homeByName = buildNameMap(homePlayers);
  const awayByName = buildNameMap(awayPlayers);
  const byPlayerId = new Map<number, PlayerGameStat>();

  const resolvePlayer = (name: string, preferredSide?: TeamSide) => {
    const key = normalizeName(name);
    const homeCandidates = homeByName.get(key) || [];
    const awayCandidates = awayByName.get(key) || [];

    if (preferredSide === 'home' && homeCandidates.length > 0) {
      return { player: homeCandidates[0], side: 'home' as const, teamId: homeTeamId };
    }
    if (preferredSide === 'away' && awayCandidates.length > 0) {
      return { player: awayCandidates[0], side: 'away' as const, teamId: awayTeamId };
    }
    if (homeCandidates.length > 0 && awayCandidates.length === 0) {
      return { player: homeCandidates[0], side: 'home' as const, teamId: homeTeamId };
    }
    if (awayCandidates.length > 0 && homeCandidates.length === 0) {
      return { player: awayCandidates[0], side: 'away' as const, teamId: awayTeamId };
    }
    if (homeCandidates.length > 0 && awayCandidates.length > 0) {
      const homeCandidate = homeCandidates[0];
      const awayCandidate = awayCandidates[0];
      if (homeCandidate.overall >= awayCandidate.overall) {
        return { player: homeCandidate, side: 'home' as const, teamId: homeTeamId };
      }
      return { player: awayCandidate, side: 'away' as const, teamId: awayTeamId };
    }
    return null;
  };

  const ensureRow = (playerId: number, teamId: TeamId) => {
    const existing = byPlayerId.get(playerId);
    if (existing) return existing;
    const created: PlayerGameStat = {
      player_id: playerId,
      team_id: teamId,
      points: 0,
      rebounds: 0,
      assists: 0,
      turnovers: 0,
      efficiency: 0
    };
    byPlayerId.set(playerId, created);
    return created;
  };

  events.forEach((ev) => {
    const attackSide: TeamSide = ev.isHomeAction ? 'home' : 'away';

    if (ev.attacker) {
      const attacker = resolvePlayer(ev.attacker, attackSide);
      if (attacker) {
        const row = ensureRow(attacker.player.id, attacker.teamId);
        const points = Number(ev.points || 0);
        if (points > 0) {
          row.points += points;
          row.efficiency += points;
        }
        if (ev.type === 'turnover' || ev.type === 'fail') {
          row.turnovers += 1;
          row.efficiency -= 1;
        }
      }
    }

    if (ev.assister) {
      const assister = resolvePlayer(ev.assister, attackSide);
      if (assister) {
        const row = ensureRow(assister.player.id, assister.teamId);
        row.assists += 1;
        row.efficiency += 1;
      }
    }

    if (ev.rebounder) {
      const rebounder =
        resolvePlayer(ev.rebounder, attackSide) ||
        resolvePlayer(ev.rebounder, attackSide === 'home' ? 'away' : 'home');
      if (rebounder) {
        const row = ensureRow(rebounder.player.id, rebounder.teamId);
        row.rebounds += 1;
        row.efficiency += 1;
      }
    }
  });

  return Array.from(byPlayerId.values()).filter(
    (row) =>
      row.player_id > 0 &&
      (row.points > 0 || row.rebounds > 0 || row.assists > 0 || row.turnovers > 0)
  );
};

const buildPayloadFromTemplate = (
  rows: PlayerGameStat[],
  template: {
    match: string;
    player: string;
    team?: string;
    points: string;
    rebounds: string;
    assists: string;
    turnovers?: string;
    efficiency?: string;
  },
  matchId: number
) =>
  rows.map((row) => {
    const payload: Record<string, unknown> = {
      [template.match]: matchId,
      [template.player]: row.player_id,
      [template.points]: row.points,
      [template.rebounds]: row.rebounds,
      [template.assists]: row.assists
    };
    if (template.team) payload[template.team] = row.team_id;
    if (template.turnovers) payload[template.turnovers] = row.turnovers;
    if (template.efficiency) payload[template.efficiency] = row.efficiency;
    return payload;
  });

const persistPlayerStats = async (
  supabaseAdmin: SupabaseClient,
  matchId: number,
  rows: PlayerGameStat[]
) => {
  if (rows.length === 0) return { ok: true as const };

  const templates = [
    {
      match: 'match_id',
      player: 'player_id',
      points: 'points',
      rebounds: 'rebounds',
      assists: 'assists'
    },
    {
      match: 'match_id',
      player: 'player_id',
      team: 'team_id',
      points: 'points',
      rebounds: 'rebounds',
      assists: 'assists',
      turnovers: 'turnovers',
      efficiency: 'efficiency'
    },
    {
      match: 'match_id',
      player: 'player_id',
      team: 'team_id',
      points: 'pts',
      rebounds: 'reb',
      assists: 'ast',
      turnovers: 'tov',
      efficiency: 'val'
    },
    {
      match: 'match_id',
      player: 'player_id',
      team: 'team_id',
      points: 'puntos',
      rebounds: 'rebotes',
      assists: 'asistencias',
      turnovers: 'perdidas',
      efficiency: 'valoracion'
    },
    {
      match: 'game_id',
      player: 'player_id',
      team: 'team_id',
      points: 'points',
      rebounds: 'rebounds',
      assists: 'assists',
      turnovers: 'turnovers',
      efficiency: 'efficiency'
    },
    {
      match: 'partido_id',
      player: 'jugador_id',
      team: 'equipo_id',
      points: 'puntos',
      rebounds: 'rebotes',
      assists: 'asistencias',
      turnovers: 'perdidas',
      efficiency: 'valoracion'
    }
  ] as const;

  let lastError = 'No se pudo inferir esquema de player_stats.';

  for (const template of templates) {
    const payload = buildPayloadFromTemplate(rows, template, matchId);
    const insertRes = await supabaseAdmin.from('player_stats').insert(payload);
    if (!insertRes.error) return { ok: true as const };
    lastError = toErrorText(insertRes.error);

    const duplicate = lastError.toLowerCase().includes('duplicate key');
    if (!duplicate) continue;

    const conflictKeys = [`${template.match},${template.player}`, `${template.player},${template.match}`];
    for (const onConflict of conflictKeys) {
      const upsertRes = await supabaseAdmin.from('player_stats').upsert(payload, { onConflict });
      if (!upsertRes.error) return { ok: true as const };
      lastError = toErrorText(upsertRes.error);
    }
  }

  const aggregatedPayload = rows.map((row) => ({
    player_id: row.player_id,
    team_id: row.team_id,
    games_played: 1,
    ppg: row.points,
    rpg: row.rebounds,
    apg: row.assists,
    efficiency: row.efficiency
  }));

  const fallbackConflicts = ['player_id,team_id', 'player_id'];
  for (const onConflict of fallbackConflicts) {
    const fallbackRes = await supabaseAdmin.from('player_stats').upsert(aggregatedPayload, { onConflict });
    if (!fallbackRes.error) return { ok: true as const };
    lastError = toErrorText(fallbackRes.error);
  }

  return { ok: false as const, error: lastError };
};

const applyRegularSeasonStandings = async (
  supabaseAdmin: SupabaseClient,
  match: MatchRow,
  finalHome: number,
  finalAway: number
) => {
  if ((match.fase || 'REGULAR').toUpperCase() !== 'REGULAR') return;

  const { data: clubs, error } = await supabaseAdmin
    .from('clubes')
    .select('id, pj, v, d, pts')
    .in('id', [match.home_team_id, match.away_team_id]);

  if (error && hasMissingStandingsColumns(error)) {
    // Legacy schemas may not have standings columns yet; skip silently.
    return;
  }

  if (error || !clubs || clubs.length < 2) {
    throw new Error('No se pudo actualizar la clasificación.');
  }

  const homeClub = clubs.find((club) => String(club.id) === String(match.home_team_id));
  const awayClub = clubs.find((club) => String(club.id) === String(match.away_team_id));
  if (!homeClub || !awayClub) throw new Error('Equipos no encontrados para clasificación.');

  const homeWon = finalHome > finalAway;
  const awayWon = finalAway > finalHome;

  const homeUpdate = {
    pj: Number(homeClub.pj || 0) + 1,
    v: Number(homeClub.v || 0) + (homeWon ? 1 : 0),
    d: Number(homeClub.d || 0) + (awayWon ? 1 : 0),
    pts: Number(homeClub.pts || 0) + (homeWon ? 2 : 1)
  };

  const awayUpdate = {
    pj: Number(awayClub.pj || 0) + 1,
    v: Number(awayClub.v || 0) + (awayWon ? 1 : 0),
    d: Number(awayClub.d || 0) + (homeWon ? 1 : 0),
    pts: Number(awayClub.pts || 0) + (awayWon ? 2 : 1)
  };

  const [{ error: homeErr }, { error: awayErr }] = await Promise.all([
    supabaseAdmin.from('clubes').update(homeUpdate).eq('id', homeClub.id),
    supabaseAdmin.from('clubes').update(awayUpdate).eq('id', awayClub.id)
  ]);

  if (homeErr || awayErr) {
    throw new Error(homeErr?.message || awayErr?.message || 'No se pudo guardar la clasificación.');
  }
};

const finalizeMatchPersistence = async (
  supabaseAdmin: SupabaseClient,
  match: MatchRow,
  finalHome: number,
  finalAway: number,
  events: MatchEvent[],
  statsRows: PlayerGameStat[]
): Promise<FinalizeResult> => {
  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('finalize_match_transaction', {
    p_match_id: match.id,
    p_home_score: finalHome,
    p_away_score: finalAway,
    p_play_by_play: events,
    p_player_stats: statsRows
  });

  if (rpcError) {
    if (!isFinalizeMatchRpcMissing(rpcError)) {
      throw new Error(`No se pudo cerrar el partido con transacción: ${toErrorText(rpcError)}`);
    }

    const { data: updatedMatch, error: matchUpdateError } = await supabaseAdmin
      .from('matches')
      .update({
        played: true,
        home_score: finalHome,
        away_score: finalAway,
        play_by_play: events
      })
      .eq('id', match.id)
      .eq('played', false)
      .select('id')
      .maybeSingle();

    if (matchUpdateError) {
      throw new Error(matchUpdateError.message || 'No se pudo guardar el resultado del partido.');
    }
    if (!updatedMatch) {
      return { status: 'already_played', warning: 'Partido ya cerrado por otro proceso.' };
    }

    const statsSave = await persistPlayerStats(supabaseAdmin, match.id, statsRows);
    if (!statsSave.ok) {
      console.warn(`player_stats no guardadas para match ${match.id}: ${statsSave.error}`);
    }

    await applyRegularSeasonStandings(supabaseAdmin, match, finalHome, finalAway);
    return { status: 'ok', warning: 'RPC no disponible, se usó cierre legacy.' };
  }

  const rpcPayload = isRecord(rpcData) ? (rpcData as FinalizeMatchRpcResponse) : {};
  const status = typeof rpcPayload.status === 'string' ? rpcPayload.status : 'ok';
  const warning = typeof rpcPayload.warning === 'string' ? rpcPayload.warning : null;

  if (status === 'already_played') {
    return { status: 'already_played', warning: warning || null };
  }
  if (status !== 'ok') {
    throw new Error(`Respuesta inesperada al cerrar partido: ${status}`);
  }

  return { status: 'ok', warning };
};

const prepareMatchSimulation = async (
  supabaseAdmin: SupabaseClient,
  match: MatchRow,
  prepared: PreparedSimulation,
  now: Date
): Promise<PrepareSimulationResult> => {
  const payload = {
    simulated_home_score: prepared.finalHome,
    simulated_away_score: prepared.finalAway,
    simulated_play_by_play: prepared.events,
    simulated_player_stats: prepared.statsRows,
    simulation_ready_at: now.toISOString()
  };

  const { data: updatedMatch, error: updateError } = await supabaseAdmin
    .from('matches')
    .update(payload)
    .eq('id', match.id)
    .eq('played', false)
    .is('simulated_play_by_play', null)
    .select(MATCH_SELECT_FIELDS)
    .maybeSingle();

  if (updateError) {
    throw new Error(`No se pudo precalcular el partido ${match.id}: ${toErrorText(updateError)}`);
  }

  if (updatedMatch) {
    return { status: 'ok', match: updatedMatch as MatchRow };
  }

  const { data: latestMatch, error: latestMatchError } = await supabaseAdmin
    .from('matches')
    .select(MATCH_SELECT_FIELDS)
    .eq('id', match.id)
    .maybeSingle();

  if (latestMatchError || !latestMatch) {
    throw new Error(
      `No se pudo recuperar el partido ${match.id} tras precálculo: ${toErrorText(latestMatchError)}`
    );
  }

  const normalized = latestMatch as MatchRow;
  if (normalized.played) {
    return { status: 'already_played', match: normalized };
  }

  return { status: 'already_prepared', match: normalized };
};

const clearPreparedSimulation = async (
  supabaseAdmin: SupabaseClient,
  matchId: number
) => {
  const { error } = await supabaseAdmin
    .from('matches')
    .update({
      simulated_home_score: null,
      simulated_away_score: null,
      simulated_play_by_play: null,
      simulated_player_stats: null,
      simulation_ready_at: null
    })
    .eq('id', matchId);

  if (error) {
    throw new Error(`No se pudo limpiar el precálculo del partido ${matchId}: ${toErrorText(error)}`);
  }
};

const persistMissingMatchDate = async (
  supabaseAdmin: SupabaseClient,
  match: MatchRow
) => {
  if (!match.match_date) return { match, updated: false };

  const { data: updatedMatch, error: updateError } = await supabaseAdmin
    .from('matches')
    .update({ match_date: match.match_date })
    .eq('id', match.id)
    .is('match_date', null)
    .select(MATCH_SELECT_FIELDS)
    .maybeSingle();

  if (updateError) {
    throw new Error(`No se pudo guardar match_date para el partido ${match.id}: ${toErrorText(updateError)}`);
  }

  if (updatedMatch) {
    return { match: updatedMatch as MatchRow, updated: true };
  }

  const { data: latestMatch, error: latestMatchError } = await supabaseAdmin
    .from('matches')
    .select(MATCH_SELECT_FIELDS)
    .eq('id', match.id)
    .maybeSingle();

  if (latestMatchError || !latestMatch) {
    throw new Error(
      `No se pudo recuperar el partido ${match.id} tras actualizar su fecha: ${toErrorText(latestMatchError)}`
    );
  }

  const normalizedLatest = latestMatch as MatchRow;
  if (!normalizedLatest.match_date) {
    return {
      match: {
        ...normalizedLatest,
        match_date: match.match_date
      },
      updated: false
    };
  }

  return { match: normalizedLatest, updated: false };
};

export const runScheduledMatches = async (
  supabaseAdmin: SupabaseClient,
  opts?: { now?: Date; maxMatches?: number }
): Promise<ScheduledMatchesRunSummary> => {
  const now = opts?.now || new Date();
  const maxMatches = Math.max(1, Math.min(300, Number(opts?.maxMatches || 40)));
  const prepLeadMinutes = getScheduledMatchPrepMinutes();
  const prepCutoff = new Date(now.getTime() + prepLeadMinutes * 60_000);

  const { count: totalDueWithoutLimit, error: totalDueError } = await supabaseAdmin
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('played', false)
    .not('match_date', 'is', null)
    .lte('match_date', now.toISOString());

  if (totalDueError) {
    throw new Error(`No se pudo contar partidos pendientes: ${toErrorText(totalDueError)}`);
  }

  const { count: pendingWithoutDate, error: nullDateError } = await supabaseAdmin
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('played', false)
    .is('match_date', null);

  if (nullDateError) {
    throw new Error(`No se pudo contar partidos sin fecha: ${toErrorText(nullDateError)}`);
  }

  const { count: prepWindowCount, error: prepWindowError } = await supabaseAdmin
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('played', false)
    .not('match_date', 'is', null)
    .lte('match_date', prepCutoff.toISOString());

  if (prepWindowError) {
    throw new Error(`No se pudo contar partidos en ventana de precálculo: ${toErrorText(prepWindowError)}`);
  }

  let inferredDueWithoutDateCount = 0;
  let inferredPrepWindowCount = 0;
  let recoveredMatchDateCount = 0;
  const inferredCandidateMatches: MatchRow[] = [];

  if (Number(pendingWithoutDate || 0) > 0) {
    const { data: missingDateMatchesData, error: missingDateMatchesError } = await supabaseAdmin
      .from('matches')
      .select(MATCH_SELECT_FIELDS)
      .eq('played', false)
      .is('match_date', null)
      .not('jornada', 'is', null)
      .order('jornada', { ascending: true })
      .order('id', { ascending: true });

    if (missingDateMatchesError) {
      throw new Error(
        `No se pudieron cargar partidos sin fecha programada: ${toErrorText(missingDateMatchesError)}`
      );
    }

    for (const rawMatch of (missingDateMatchesData || []) as MatchRow[]) {
      const inferredMatchDate = computeMatchDateFromJornada(rawMatch.jornada);
      if (!inferredMatchDate) continue;

      const inferredMatch: MatchRow = {
        ...rawMatch,
        match_date: inferredMatchDate.toISOString()
      };

      if (isMatchDueBy(inferredMatch, now)) {
        inferredDueWithoutDateCount += 1;
      }
      if (!isMatchDueBy(inferredMatch, prepCutoff)) {
        continue;
      }

      inferredPrepWindowCount += 1;

      const persisted = await persistMissingMatchDate(supabaseAdmin, inferredMatch);
      inferredCandidateMatches.push(persisted.match);
      if (persisted.updated) recoveredMatchDateCount += 1;
    }
  }

  const { data: candidateMatchesData, error: candidateMatchesError } = await supabaseAdmin
    .from('matches')
    .select(MATCH_SELECT_FIELDS)
    .eq('played', false)
    .not('match_date', 'is', null)
    .lte('match_date', prepCutoff.toISOString())
    .order('match_date', { ascending: true })
    .order('id', { ascending: true })
    .limit(maxMatches);

  if (candidateMatchesError) {
    throw new Error(`No se pudieron cargar partidos pendientes: ${toErrorText(candidateMatchesError)}`);
  }

  const candidateMatches = [...new Map(
    [...((candidateMatchesData || []) as MatchRow[]), ...inferredCandidateMatches]
      .sort(compareMatchesByDate)
      .map((match) => [match.id, match])
  ).values()].slice(0, maxMatches);
  const summary: ScheduledMatchesRunSummary = {
    dueCount: candidateMatches.filter((match) => isMatchDueBy(match, now)).length,
    totalDueWithoutLimit: Number(totalDueWithoutLimit || 0) + inferredDueWithoutDateCount,
    prepWindowCount: Number(prepWindowCount || 0) + inferredPrepWindowCount,
    processed: 0,
    simulated: 0,
    finalized: 0,
    alreadyPlayed: 0,
    skipped: 0,
    pendingWithoutDate: Math.max(0, Number(pendingWithoutDate || 0) - recoveredMatchDateCount),
    warnings: [],
    errors: []
  };

  if (recoveredMatchDateCount > 0) {
    summary.warnings.push(
      `${recoveredMatchDateCount} partidos pendientes recuperaron su match_date automáticamente desde jornada.`
    );
  }

  if (candidateMatches.length === 0) return summary;

  const [settings, positionOverallConfig] = await Promise.all([
    fetchMatchSimulatorSettings(supabaseAdmin),
    fetchPositionOverallConfig(supabaseAdmin)
  ]);

  const teamIds = [...new Set(candidateMatches.flatMap((m) => [String(m.home_team_id), String(m.away_team_id)]))];
  const { data: teamsData, error: teamsError } = await supabaseAdmin
    .from('clubes')
    .select('id,nombre,color_primario,rotations,tactic_offense,tactic_defense')
    .in('id', teamIds);
  if (teamsError) {
    throw new Error(`No se pudieron cargar los equipos: ${toErrorText(teamsError)}`);
  }

  const rosterData = await fetchRosterByTeamIds(supabaseAdmin, teamIds);
  const normalizedTeams = ((teamsData || []) as TeamRow[]).map((team) => [String(team.id), team] as const);
  const teamsById = new Map<string, TeamRow>(normalizedTeams);
  const playersByTeam = new Map<string, EnginePlayer[]>();
  rosterData.forEach((player) => {
    const teamId = String(player.team_id);
    const curr = playersByTeam.get(teamId) || [];
    curr.push(toEnginePlayer(player));
    playersByTeam.set(teamId, curr);
  });

  const matchesById = new Map<number, MatchRow>(candidateMatches.map((match) => [match.id, match]));
  const matchesToPrepare = candidateMatches.filter((match) => getPreparedSimulation(match) === null);

  for (const match of matchesToPrepare) {
    summary.processed += 1;

    try {
      const homeTeam = teamsById.get(String(match.home_team_id));
      const awayTeam = teamsById.get(String(match.away_team_id));

      if (!homeTeam || !awayTeam) {
        summary.skipped += 1;
        summary.errors.push({ matchId: match.id, reason: 'No se encontraron equipos completos.' });
        continue;
      }

      const homeRoster = playersByTeam.get(String(match.home_team_id)) || [];
      const awayRoster = playersByTeam.get(String(match.away_team_id)) || [];
      const simulationHomeRoster = ensureSimulationRoster(String(match.home_team_id), homeRoster);
      const simulationAwayRoster = ensureSimulationRoster(String(match.away_team_id), awayRoster);
      if (homeRoster.length < 5 || awayRoster.length < 5) {
        summary.warnings.push(`match ${match.id}: plantilla incompleta, se usaron placeholders CPU.`);
      }

      const homeGamePlan = extractTeamGamePlan(match.home_tactics, homeTeam);
      const awayGamePlan = extractTeamGamePlan(match.away_tactics, awayTeam);

      const simulation = generateMatchSimulation({
        homeRoster: simulationHomeRoster,
        awayRoster: simulationAwayRoster,
        homeTactics: homeGamePlan.rotations,
        awayTactics: awayGamePlan.rotations,
        homeGamePlan,
        awayGamePlan,
        homeTeamName: homeTeam.nombre,
        awayTeamName: awayTeam.nombre,
        homeTeamColor: homeTeam.color_primario || '#3b82f6',
        awayTeamColor: awayTeam.color_primario || '#ef4444',
        settings,
        positionOverallConfig
      });

      const gameStatsRows = buildPlayerGameStatsFromEvents(
        simulation.events,
        simulationHomeRoster,
        simulationAwayRoster,
        String(match.home_team_id),
        String(match.away_team_id)
      );

      const prepared = await prepareMatchSimulation(
        supabaseAdmin,
        match,
        {
          finalHome: simulation.finalScore.home,
          finalAway: simulation.finalScore.away,
          events: simulation.events,
          statsRows: gameStatsRows
        },
        now
      );

      matchesById.set(match.id, prepared.match);

      if (prepared.status === 'ok') {
        summary.simulated += 1;
      } else if (prepared.status === 'already_played') {
        summary.alreadyPlayed += 1;
      }
    } catch (error) {
      summary.errors.push({ matchId: match.id, reason: toErrorText(error) });
    }
  }

  const matchesToFinalize = Array.from(matchesById.values()).filter(
    (match) => isMatchDueBy(match, now) && getPreparedSimulation(match) !== null
  );

  for (const match of matchesToFinalize) {
    summary.processed += 1;

    try {
      const prepared = getPreparedSimulation(match);
      if (!prepared) {
        summary.skipped += 1;
        summary.errors.push({
          matchId: match.id,
          reason: 'Partido vencido sin replay precalculado disponible.'
        });
        continue;
      }

      const result = await finalizeMatchPersistence(
        supabaseAdmin,
        match,
        prepared.finalHome,
        prepared.finalAway,
        prepared.events,
        prepared.statsRows
      );

      if (result.status === 'already_played') {
        summary.alreadyPlayed += 1;
      } else {
        summary.finalized += 1;
      }

      try {
        await clearPreparedSimulation(supabaseAdmin, match.id);
      } catch (cleanupError) {
        summary.warnings.push(`match ${match.id}: ${toErrorText(cleanupError)}`);
      }

      if (result.warning) summary.warnings.push(`match ${match.id}: ${result.warning}`);
    } catch (error) {
      summary.errors.push({ matchId: match.id, reason: toErrorText(error) });
    }
  }

  return summary;
};
