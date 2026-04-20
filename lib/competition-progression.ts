import type { SupabaseClient } from '@supabase/supabase-js';
import { CLUB_STATUS } from '@/lib/season-draft';

type TeamId = string;

type GroupClubRow = {
  id: TeamId;
  nombre: string;
  grupo_id: number | null;
  league_id?: number | null;
  status?: string | null;
  pts?: number | null;
  v?: number | null;
  d?: number | null;
};

type LeagueRow = {
  id: number;
  nombre?: string | null;
  nivel: number;
};

type LeagueGroupRow = {
  id: number;
  nombre?: string | null;
  liga_id: number;
};

type GroupMatchRow = {
  id: number;
  jornada: number;
  fase?: string | null;
  played: boolean;
  home_team_id: TeamId;
  away_team_id: TeamId;
  home_score: number;
  away_score: number;
};

type MatchInsertRow = {
  jornada: number;
  fase: string;
  played: boolean;
  home_team_id: TeamId;
  away_team_id: TeamId;
  home_score: number;
  away_score: number;
};

type BracketPairing = {
  homeTeamId: TeamId;
  awayTeamId: TeamId;
};

export type CompetitionProgressionResult = {
  status: 'ok' | 'skipped';
  groupId: number | null;
  createdMatches: number;
  createdPhases: string[];
  message: string;
};

type SeasonRolloverResult = {
  status: 'ok' | 'skipped';
  message: string;
};

const PHASE = {
  REGULAR: 'REGULAR',
  PROMO_SF: 'PROMO_SF',
  PROMO_FINAL: 'PROMO_FINAL',
  RELEG_SF: 'RELEG_SF',
  RELEG_FINAL: 'RELEG_FINAL'
} as const;

const toErrorText = (error: unknown) => {
  if (!error) return 'Error desconocido';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const e = error as { message?: string; details?: string; hint?: string };
    return e.message || e.details || e.hint || JSON.stringify(error);
  }
  return String(error);
};

const normalizePhase = (phase?: string | null) => String(phase || PHASE.REGULAR).trim().toUpperCase();

const isUniqueViolation = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const maybeCode = 'code' in error ? String((error as { code?: string }).code || '') : '';
  const maybeMessage = 'message' in error ? String((error as { message?: string }).message || '') : '';
  return maybeCode === '23505' || maybeMessage.toLowerCase().includes('duplicate key');
};

const sortStandings = (teams: GroupClubRow[]) =>
  [...teams].sort((a, b) => {
    const ptsDiff = Number(b.pts || 0) - Number(a.pts || 0);
    if (ptsDiff !== 0) return ptsDiff;
    const winsDiff = Number(b.v || 0) - Number(a.v || 0);
    if (winsDiff !== 0) return winsDiff;
    const lossesDiff = Number(a.d || 0) - Number(b.d || 0);
    if (lossesDiff !== 0) return lossesDiff;
    return String(a.nombre || '').localeCompare(String(b.nombre || ''));
  });

const dedupeMatches = (matches: GroupMatchRow[]) =>
  Array.from(new Map(matches.map((match) => [match.id, match])).values()).sort((a, b) => {
    const roundDiff = Number(a.jornada || 0) - Number(b.jornada || 0);
    if (roundDiff !== 0) return roundDiff;
    return Number(a.id || 0) - Number(b.id || 0);
  });

const buildBracketPairings = (teamIds: TeamId[]) => {
  if (teamIds.length < 4) return [] as BracketPairing[];

  return [
    { homeTeamId: teamIds[0], awayTeamId: teamIds[3] },
    { homeTeamId: teamIds[1], awayTeamId: teamIds[2] }
  ];
};

const getWinnerTeamId = (match: GroupMatchRow) => {
  const homeScore = Number(match.home_score || 0);
  const awayScore = Number(match.away_score || 0);
  if (homeScore === awayScore) return null;
  return homeScore > awayScore ? String(match.home_team_id) : String(match.away_team_id);
};

const insertMatches = async (supabaseAdmin: SupabaseClient, rows: MatchInsertRow[]) => {
  if (rows.length === 0) return;

  const { error } = await supabaseAdmin.from('matches').insert(rows);
  if (error) {
    throw new Error(`No se pudieron crear cruces de playoff: ${toErrorText(error)}`);
  }
};

const fetchGroupContext = async (supabaseAdmin: SupabaseClient, groupId: number) => {
  const { data: teams, error: teamsError } = await supabaseAdmin
    .from('clubes')
    .select('id, nombre, grupo_id, league_id, status, pts, v, d')
    .eq('grupo_id', groupId);

  if (teamsError) {
    throw new Error(`No se pudieron cargar los clubes del grupo ${groupId}: ${toErrorText(teamsError)}`);
  }

  const groupTeams = (teams || []) as GroupClubRow[];
  const teamIds = groupTeams.map((team) => String(team.id));
  if (teamIds.length === 0) {
    return { teams: groupTeams, matches: [] as GroupMatchRow[] };
  }

  const [{ data: homeMatches, error: homeMatchesError }, { data: awayMatches, error: awayMatchesError }] =
    await Promise.all([
      supabaseAdmin
        .from('matches')
        .select('id, jornada, fase, played, home_team_id, away_team_id, home_score, away_score')
        .in('home_team_id', teamIds),
      supabaseAdmin
        .from('matches')
        .select('id, jornada, fase, played, home_team_id, away_team_id, home_score, away_score')
        .in('away_team_id', teamIds)
    ]);

  if (homeMatchesError || awayMatchesError) {
    throw new Error(
      `No se pudieron cargar los partidos del grupo ${groupId}: ${toErrorText(homeMatchesError || awayMatchesError)}`
    );
  }

  const teamIdSet = new Set(teamIds);
  const mergedMatches = dedupeMatches([
    ...(((homeMatches || []) as GroupMatchRow[]) || []),
    ...(((awayMatches || []) as GroupMatchRow[]) || [])
  ]).filter(
    (match) =>
      teamIdSet.has(String(match.home_team_id)) &&
      teamIdSet.has(String(match.away_team_id))
  );

  return {
    teams: groupTeams,
    matches: mergedMatches
  };
};

const createSemifinalsIfNeeded = async (
  supabaseAdmin: SupabaseClient,
  standings: GroupClubRow[],
  matches: GroupMatchRow[]
) => {
  const phaseMatches = new Map<string, GroupMatchRow[]>();
  matches.forEach((match) => {
    const phase = normalizePhase(match.fase);
    const current = phaseMatches.get(phase) || [];
    current.push(match);
    phaseMatches.set(phase, current);
  });

  const nextRound = matches.reduce((maxRound, match) => Math.max(maxRound, Number(match.jornada || 0)), 0) + 1;
  const inserts: MatchInsertRow[] = [];
  const createdPhases: string[] = [];

  if ((phaseMatches.get(PHASE.PROMO_SF)?.length || 0) === 0) {
    const topSeeds = standings.slice(0, 4).map((team) => String(team.id));
    const promoPairings = buildBracketPairings(topSeeds);
    if (promoPairings.length === 2) {
      inserts.push(
        ...promoPairings.map((pairing) => ({
          jornada: nextRound,
          fase: PHASE.PROMO_SF,
          played: false,
          home_team_id: pairing.homeTeamId,
          away_team_id: pairing.awayTeamId,
          home_score: 0,
          away_score: 0
        }))
      );
      createdPhases.push(PHASE.PROMO_SF);
    }
  }

  if ((phaseMatches.get(PHASE.RELEG_SF)?.length || 0) === 0) {
    const bottomSeeds = standings.slice(4, 8).map((team) => String(team.id));
    const relegPairings = buildBracketPairings(bottomSeeds);
    if (relegPairings.length === 2) {
      inserts.push(
        ...relegPairings.map((pairing) => ({
          jornada: nextRound,
          fase: PHASE.RELEG_SF,
          played: false,
          home_team_id: pairing.homeTeamId,
          away_team_id: pairing.awayTeamId,
          home_score: 0,
          away_score: 0
        }))
      );
      createdPhases.push(PHASE.RELEG_SF);
    }
  }

  await insertMatches(supabaseAdmin, inserts);
  return {
    createdMatches: inserts.length,
    createdPhases
  };
};

const createFinalsIfNeeded = async (supabaseAdmin: SupabaseClient, matches: GroupMatchRow[]) => {
  const phaseMatches = new Map<string, GroupMatchRow[]>();
  matches.forEach((match) => {
    const phase = normalizePhase(match.fase);
    const current = phaseMatches.get(phase) || [];
    current.push(match);
    phaseMatches.set(phase, current);
  });

  const inserts: MatchInsertRow[] = [];
  const createdPhases: string[] = [];
  const nextRound = matches.reduce((maxRound, match) => Math.max(maxRound, Number(match.jornada || 0)), 0) + 1;

  const promoSemis = phaseMatches.get(PHASE.PROMO_SF) || [];
  const promoFinals = phaseMatches.get(PHASE.PROMO_FINAL) || [];
  if (promoSemis.length === 2 && promoFinals.length === 0 && promoSemis.every((match) => match.played)) {
    const winners = promoSemis.map(getWinnerTeamId).filter(Boolean) as TeamId[];
    if (winners.length === 2 && winners[0] !== winners[1]) {
      inserts.push({
        jornada: nextRound,
        fase: PHASE.PROMO_FINAL,
        played: false,
        home_team_id: winners[0],
        away_team_id: winners[1],
        home_score: 0,
        away_score: 0
      });
      createdPhases.push(PHASE.PROMO_FINAL);
    }
  }

  const relegSemis = phaseMatches.get(PHASE.RELEG_SF) || [];
  const relegFinals = phaseMatches.get(PHASE.RELEG_FINAL) || [];
  if (relegSemis.length === 2 && relegFinals.length === 0 && relegSemis.every((match) => match.played)) {
    const winners = relegSemis.map(getWinnerTeamId).filter(Boolean) as TeamId[];
    if (winners.length === 2 && winners[0] !== winners[1]) {
      inserts.push({
        jornada: nextRound,
        fase: PHASE.RELEG_FINAL,
        played: false,
        home_team_id: winners[0],
        away_team_id: winners[1],
        home_score: 0,
        away_score: 0
      });
      createdPhases.push(PHASE.RELEG_FINAL);
    }
  }

  await insertMatches(supabaseAdmin, inserts);
  return {
    createdMatches: inserts.length,
    createdPhases
  };
};

export const advanceGroupPlayoffsForGroup = async (
  supabaseAdmin: SupabaseClient,
  groupId: number
): Promise<CompetitionProgressionResult> => {
  const { teams, matches } = await fetchGroupContext(supabaseAdmin, groupId);

  if (teams.length < 8) {
    return {
      status: 'skipped',
      groupId,
      createdMatches: 0,
      createdPhases: [],
      message: 'El grupo todavía no tiene 8 equipos; no se generan playoffs.'
    };
  }

  const regularMatches = matches.filter((match) => normalizePhase(match.fase) === PHASE.REGULAR);
  if (regularMatches.length === 0) {
    return {
      status: 'skipped',
      groupId,
      createdMatches: 0,
      createdPhases: [],
      message: 'No hay calendario regular para este grupo.'
    };
  }

  if (regularMatches.some((match) => !match.played)) {
    return {
      status: 'skipped',
      groupId,
      createdMatches: 0,
      createdPhases: [],
      message: 'La fase regular del grupo aún no ha terminado.'
    };
  }

  const standings = sortStandings(teams);
  const semisResult = await createSemifinalsIfNeeded(supabaseAdmin, standings, matches);
  if (semisResult.createdMatches > 0) {
    return {
      status: 'ok',
      groupId,
      createdMatches: semisResult.createdMatches,
      createdPhases: semisResult.createdPhases,
      message: `Se generaron ${semisResult.createdMatches} cruces de semifinales para el grupo ${groupId}.`
    };
  }

  const refreshedContext = await fetchGroupContext(supabaseAdmin, groupId);
  const finalsResult = await createFinalsIfNeeded(supabaseAdmin, refreshedContext.matches);
  if (finalsResult.createdMatches > 0) {
    return {
      status: 'ok',
      groupId,
      createdMatches: finalsResult.createdMatches,
      createdPhases: finalsResult.createdPhases,
      message: `Se generaron ${finalsResult.createdMatches} finales de playoff para el grupo ${groupId}.`
    };
  }

  return {
    status: 'skipped',
    groupId,
    createdMatches: 0,
    createdPhases: [],
    message: 'No había nuevos cruces de playoff pendientes por generar.'
  };
};

const tryClaimAutomationRun = async (
  supabaseAdmin: SupabaseClient,
  runKey: string,
  details: Record<string, unknown>
) => {
  const { error } = await supabaseAdmin.from('automation_runs').insert({
    run_key: runKey,
    run_type: 'season_rollover',
    details
  });

  if (!error) return true;
  if (isUniqueViolation(error)) return false;
  throw new Error(`No se pudo registrar el rollover de temporada: ${toErrorText(error)}`);
};

const updateAutomationRun = async (
  supabaseAdmin: SupabaseClient,
  runKey: string,
  details: Record<string, unknown>
) => {
  const { error } = await supabaseAdmin
    .from('automation_runs')
    .update({ details })
    .eq('run_key', runKey);

  if (error) {
    throw new Error(`No se pudo actualizar el registro del rollover: ${toErrorText(error)}`);
  }
};

const deleteAutomationRun = async (supabaseAdmin: SupabaseClient, runKey: string) => {
  const { error } = await supabaseAdmin.from('automation_runs').delete().eq('run_key', runKey);
  if (error) {
    throw new Error(`No se pudo liberar el bloqueo del rollover: ${toErrorText(error)}`);
  }
};

const getGroupSlotIndex = (groupsByLeague: Map<number, LeagueGroupRow[]>, groupId: number) => {
  for (const groups of groupsByLeague.values()) {
    const slotIndex = groups.findIndex((group) => group.id === groupId);
    if (slotIndex >= 0) return slotIndex;
  }
  return -1;
};

const getCorrespondingHigherGroup = (
  sortedLeagues: LeagueRow[],
  groupsByLeague: Map<number, LeagueGroupRow[]>,
  sourceGroup: LeagueGroupRow
) => {
  const sourceLeagueIndex = sortedLeagues.findIndex((league) => league.id === sourceGroup.liga_id);
  if (sourceLeagueIndex < 0 || sourceLeagueIndex >= sortedLeagues.length - 1) return null;

  const slotIndex = getGroupSlotIndex(groupsByLeague, sourceGroup.id);
  if (slotIndex < 0) return null;

  const higherLeague = sortedLeagues[sourceLeagueIndex + 1];
  const higherGroups = groupsByLeague.get(higherLeague.id) || [];
  const targetGroup = higherGroups[slotIndex];
  if (!targetGroup) return null;

  return {
    league: higherLeague,
    group: targetGroup
  };
};

const getLoserTeamId = (match: GroupMatchRow) => {
  const winnerId = getWinnerTeamId(match);
  if (!winnerId) return null;
  return winnerId === String(match.home_team_id) ? String(match.away_team_id) : String(match.home_team_id);
};

const maybeFinalizeSeasonRollover = async (
  supabaseAdmin: SupabaseClient
): Promise<SeasonRolloverResult> => {
  const [{ data: matches, error: matchesError }, { data: leagues, error: leaguesError }, { data: groups, error: groupsError }, { data: clubs, error: clubsError }] =
    await Promise.all([
      supabaseAdmin
        .from('matches')
        .select('id, jornada, fase, played, home_team_id, away_team_id, home_score, away_score')
        .order('id', { ascending: true }),
      supabaseAdmin.from('ligas').select('id, nombre, nivel').order('nivel', { ascending: true }),
      supabaseAdmin.from('grupos_liga').select('id, nombre, liga_id').order('id', { ascending: true }),
      supabaseAdmin.from('clubes').select('id, nombre, league_id, grupo_id, status')
    ]);

  if (matchesError || leaguesError || groupsError || clubsError) {
    throw new Error(
      toErrorText(matchesError || leaguesError || groupsError || clubsError)
    );
  }

  const allMatches = ((matches || []) as GroupMatchRow[]) || [];
  if (allMatches.length === 0) {
    return {
      status: 'skipped',
      message: 'No hay temporada activa para cerrar.'
    };
  }

  if (allMatches.some((match) => !match.played)) {
    return {
      status: 'skipped',
      message: 'La temporada aún tiene partidos pendientes.'
    };
  }

  const sortedLeagues = ((leagues || []) as LeagueRow[]) || [];
  const allGroups = ((groups || []) as LeagueGroupRow[]) || [];
  const allClubs = ((clubs || []) as GroupClubRow[]) || [];

  const matchesSignature = `season-rollover:max-${Math.max(...allMatches.map((match) => Number(match.id || 0)))}:count-${allMatches.length}`;

  const groupsByLeague = new Map<number, LeagueGroupRow[]>();
  allGroups.forEach((group) => {
    const current = groupsByLeague.get(group.liga_id) || [];
    current.push(group);
    groupsByLeague.set(group.liga_id, current);
  });
  for (const [leagueId, leagueGroups] of groupsByLeague.entries()) {
    groupsByLeague.set(
      leagueId,
      [...leagueGroups].sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
    );
  }

  const matchesByGroup = new Map<number, GroupMatchRow[]>();
  allMatches.forEach((match) => {
    const homeClub = allClubs.find((club) => String(club.id) === String(match.home_team_id));
    const awayClub = allClubs.find((club) => String(club.id) === String(match.away_team_id));
    if (!homeClub?.grupo_id || !awayClub?.grupo_id || homeClub.grupo_id !== awayClub.grupo_id) return;
    const current = matchesByGroup.get(homeClub.grupo_id) || [];
    current.push(match);
    matchesByGroup.set(homeClub.grupo_id, current);
  });

  const promoChampionByGroup = new Map<number, TeamId>();
  const relegatedByGroup = new Map<number, TeamId>();

  for (const group of allGroups) {
    const groupMatches = matchesByGroup.get(group.id) || [];
    const promoFinal = groupMatches.find((match) => normalizePhase(match.fase) === PHASE.PROMO_FINAL);
    const relegFinal = groupMatches.find((match) => normalizePhase(match.fase) === PHASE.RELEG_FINAL);

    if (promoFinal?.played) {
      const winner = getWinnerTeamId(promoFinal);
      if (winner) promoChampionByGroup.set(group.id, winner);
    }

    if (relegFinal?.played) {
      const loser = getLoserTeamId(relegFinal);
      if (loser) relegatedByGroup.set(group.id, loser);
    }
  }

  const moveOperations: Array<{ clubId: TeamId; targetLeagueId: number; targetGroupId: number }> = [];
  const movedClubIds = new Set<TeamId>();

  for (const league of sortedLeagues) {
    const leagueGroups = groupsByLeague.get(league.id) || [];
    for (const sourceGroup of leagueGroups) {
      const higherTarget = getCorrespondingHigherGroup(sortedLeagues, groupsByLeague, sourceGroup);
      if (!higherTarget) continue;

      const promotedClubId = promoChampionByGroup.get(sourceGroup.id);
      const relegatedClubId = relegatedByGroup.get(higherTarget.group.id);
      if (!promotedClubId || !relegatedClubId) continue;
      if (movedClubIds.has(promotedClubId) || movedClubIds.has(relegatedClubId)) continue;

      moveOperations.push(
        {
          clubId: promotedClubId,
          targetLeagueId: higherTarget.league.id,
          targetGroupId: higherTarget.group.id
        },
        {
          clubId: relegatedClubId,
          targetLeagueId: league.id,
          targetGroupId: sourceGroup.id
        }
      );
      movedClubIds.add(promotedClubId);
      movedClubIds.add(relegatedClubId);
    }
  }

  if (moveOperations.length === 0) {
    return {
      status: 'skipped',
      message: 'No se encontraron ascensos/descensos completos para aplicar.'
    };
  }

  const claimed = await tryClaimAutomationRun(supabaseAdmin, matchesSignature, {
    status: 'started',
    match_count: allMatches.length,
    move_operations: moveOperations.length
  });

  if (!claimed) {
    return {
      status: 'skipped',
      message: 'El cierre de temporada ya fue procesado por otro flujo.'
    };
  }

  try {
    const moveResults = await Promise.all(
      moveOperations.map((operation) =>
        supabaseAdmin
          .from('clubes')
          .update({
            league_id: operation.targetLeagueId,
            grupo_id: operation.targetGroupId,
            status: CLUB_STATUS.COMPETING
          })
          .eq('id', operation.clubId)
      )
    );

    const moveError = moveResults.find((result) => result.error)?.error;
    if (moveError) {
      throw new Error(`No se pudieron aplicar ascensos/descensos: ${toErrorText(moveError)}`);
    }

    const { error: resetStandingsError } = await supabaseAdmin
      .from('clubes')
      .update({ pj: 0, v: 0, d: 0, pts: 0 })
      .neq('id', 0);

    if (resetStandingsError) {
      throw new Error(`No se pudieron resetear clasificaciones: ${toErrorText(resetStandingsError)}`);
    }

    const { error: deleteMatchesError } = await supabaseAdmin.from('matches').delete().neq('id', 0);
    if (deleteMatchesError) {
      throw new Error(`No se pudo limpiar el calendario anterior: ${toErrorText(deleteMatchesError)}`);
    }

    await updateAutomationRun(supabaseAdmin, matchesSignature, {
      status: 'ok',
      moved_clubs: moveOperations.length,
      moved_team_ids: moveOperations.map((operation) => operation.clubId)
    });
  } catch (error) {
    await deleteAutomationRun(supabaseAdmin, matchesSignature);
    throw error;
  }

  return {
    status: 'ok',
    message: `Temporada cerrada. Se aplicaron ${moveOperations.length / 2} ascensos/descensos y se reseteó el calendario global.`
  };
};

export const advanceGroupPlayoffsForMatch = async (
  supabaseAdmin: SupabaseClient,
  matchId: number
): Promise<CompetitionProgressionResult> => {
  const { data: match, error: matchError } = await supabaseAdmin
    .from('matches')
    .select('id, home_team_id, away_team_id')
    .eq('id', matchId)
    .maybeSingle();

  if (matchError || !match) {
    throw new Error(`No se pudo cargar el partido ${matchId}: ${toErrorText(matchError)}`);
  }

  const { data: clubs, error: clubsError } = await supabaseAdmin
    .from('clubes')
    .select('id, grupo_id')
    .in('id', [String(match.home_team_id), String(match.away_team_id)]);

  if (clubsError) {
    throw new Error(`No se pudo resolver el grupo del partido ${matchId}: ${toErrorText(clubsError)}`);
  }

  const groupIds = [
    ...new Set(
      (clubs || [])
        .map((club) => club.grupo_id)
        .filter((groupId): groupId is number => typeof groupId === 'number' && Number.isFinite(groupId))
    )
  ];
  if (groupIds.length !== 1) {
    return {
      status: 'skipped',
      groupId: null,
      createdMatches: 0,
      createdPhases: [],
      message: 'No se pudo determinar un grupo único para el partido.'
    };
  }

  const progression = await advanceGroupPlayoffsForGroup(supabaseAdmin, groupIds[0]);
  const rollover = await maybeFinalizeSeasonRollover(supabaseAdmin);

  if (rollover.status === 'ok') {
    return {
      ...progression,
      status: 'ok',
      message: [progression.message, rollover.message].filter(Boolean).join(' ').trim()
    };
  }

  return progression;
};
