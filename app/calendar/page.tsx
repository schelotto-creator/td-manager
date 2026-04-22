'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CalendarDays, ChevronLeft, ChevronRight, Activity, Trophy, Play, Shield, Filter, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type EscudoForma = 'circle' | 'square' | 'modern' | 'hexagon' | 'classic';
type LigaRow = { id: number; nombre: string; nivel?: number; };
type GrupoRow = { id: number; nombre: string; liga_id: number; };
type TeamId = string;
type MatchTeam = { id: TeamId; nombre: string; color_primario?: string; escudo_forma?: EscudoForma | null; escudo_url?: string | null; };
type TeamStanding = MatchTeam & {
  pj: number;
  v: number;
  d: number;
  pts: number;
};
type CalendarMatchRow = {
  entryId: string;
  id?: number;
  jornada: number;
  fase?: string | null;
  home_score: number;
  away_score: number;
  played: boolean;
  match_date?: string | null;
  home_team: MatchTeam;
  away_team: MatchTeam;
  isProjected?: boolean;
  projectedLabel?: string | null;
  canActivateProjected?: boolean;
  activationBlockedReason?: string | null;
};
type DbMatchRow = {
  id: number;
  jornada: number;
  fase?: string | null;
  home_team_id: TeamId;
  away_team_id: TeamId;
  home_score: number;
  away_score: number;
  played: boolean;
  match_date?: string | null;
};
type BracketPairing = {
  label: string;
  homeSeed: string;
  awaySeed: string;
  home?: TeamStanding;
  away?: TeamStanding;
};
type GroupCalendarContext = {
  allMatches: DbMatchRow[];
  teamById: Map<TeamId, MatchTeam>;
  standings: TeamStanding[];
  actualMaxRound: number;
  regularMaxRound: number;
  regularSeasonComplete: boolean;
  plannedMaxRound: number;
  playoffSemiRound: number;
  playoffFinalRound: number;
  hasPlayoffSlots: boolean;
};
type EnsureGroupPlayoffsResult = {
  created: boolean;
  viewerMatchId: number | null;
};
const buildFallbackTeam = (id: TeamId): MatchTeam => ({ id, nombre: `Equipo ${id}` });
const normalizePhase = (phase?: string | null) => String(phase || 'REGULAR').trim().toUpperCase();
const formatPhaseLabel = (phase?: string | null) =>
  normalizePhase(phase)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const toErrorText = (error: unknown) => {
  if (!error) return 'Error desconocido';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const e = error as { message?: string; details?: string; hint?: string; };
    return e.message || e.details || e.hint || JSON.stringify(error);
  }
  return String(error);
};
const sortStandings = (teams: TeamStanding[]) =>
  [...teams].sort((a, b) => {
    const ptsDiff = Number(b.pts || 0) - Number(a.pts || 0);
    if (ptsDiff !== 0) return ptsDiff;
    const winsDiff = Number(b.v || 0) - Number(a.v || 0);
    if (winsDiff !== 0) return winsDiff;
    const lossesDiff = Number(a.d || 0) - Number(b.d || 0);
    if (lossesDiff !== 0) return lossesDiff;
    return String(a.nombre || '').localeCompare(String(b.nombre || ''));
  });
const dedupeMatches = (matches: DbMatchRow[]) =>
  Array.from(new Map(matches.map((match) => [match.id, match])).values()).sort((a, b) => {
    const roundDiff = Number(a.jornada || 0) - Number(b.jornada || 0);
    if (roundDiff !== 0) return roundDiff;
    return Number(a.id || 0) - Number(b.id || 0);
  });
const buildBracketPairings = (teams: TeamStanding[], startSeed: number): BracketPairing[] => {
  if (teams.length < 4) return [];

  return [
    {
      label: 'Semifinal 1',
      homeSeed: `${startSeed}º`,
      awaySeed: `${startSeed + 3}º`,
      home: teams[0],
      away: teams[3]
    },
    {
      label: 'Semifinal 2',
      homeSeed: `${startSeed + 1}º`,
      awaySeed: `${startSeed + 2}º`,
      home: teams[1],
      away: teams[2]
    }
  ];
};
const buildProjectedPlayoffMatches = (
  context: GroupCalendarContext,
  round: number
): CalendarMatchRow[] => {
  if (!context.hasPlayoffSlots || context.standings.length < 8) return [];

  if (round === context.playoffSemiRound) {
    const semifinalsReady = context.regularSeasonComplete;
    const promotionPairings = buildBracketPairings(context.standings.slice(0, 4), 1);
    const relegationPairings = buildBracketPairings(context.standings.slice(4, 8), 5);

    return [
      ...promotionPairings.map((pairing, index) => ({
        entryId: `projected-promo-sf-${round}-${index}`,
        jornada: round,
        fase: 'PROMO_SF',
        home_score: 0,
        away_score: 0,
        played: false,
        match_date: null,
        home_team: pairing.home || buildFallbackTeam(`projected-promo-home-${index}`),
        away_team: pairing.away || buildFallbackTeam(`projected-promo-away-${index}`),
        isProjected: true,
        projectedLabel: `Ascenso · ${pairing.label} · ${pairing.homeSeed} vs ${pairing.awaySeed}`,
        canActivateProjected: semifinalsReady,
        activationBlockedReason: semifinalsReady ? null : 'Se activa al cerrar la fase regular'
      })),
      ...relegationPairings.map((pairing, index) => ({
        entryId: `projected-releg-sf-${round}-${index}`,
        jornada: round,
        fase: 'RELEG_SF',
        home_score: 0,
        away_score: 0,
        played: false,
        match_date: null,
        home_team: pairing.home || buildFallbackTeam(`projected-releg-home-${index}`),
        away_team: pairing.away || buildFallbackTeam(`projected-releg-away-${index}`),
        isProjected: true,
        projectedLabel: `Permanencia · ${pairing.label} · ${pairing.homeSeed} vs ${pairing.awaySeed}`,
        canActivateProjected: semifinalsReady,
        activationBlockedReason: semifinalsReady ? null : 'Se activa al cerrar la fase regular'
      }))
    ];
  }

  if (round === context.playoffFinalRound) {
    return [
      {
        entryId: `projected-promo-final-${round}`,
        jornada: round,
        fase: 'PROMO_FINAL',
        home_score: 0,
        away_score: 0,
        played: false,
        match_date: null,
        home_team: { id: 'promo-finalist-1', nombre: 'Ganador SF 1' },
        away_team: { id: 'promo-finalist-2', nombre: 'Ganador SF 2' },
        isProjected: true,
        projectedLabel: 'Final ascenso · 1º-4º',
        canActivateProjected: false,
        activationBlockedReason: 'Se define tras las semifinales oficiales'
      },
      {
        entryId: `projected-releg-final-${round}`,
        jornada: round,
        fase: 'RELEG_FINAL',
        home_score: 0,
        away_score: 0,
        played: false,
        match_date: null,
        home_team: { id: 'releg-finalist-1', nombre: 'Ganador SF 1' },
        away_team: { id: 'releg-finalist-2', nombre: 'Ganador SF 2' },
        isProjected: true,
        projectedLabel: 'Final permanencia · 5º-8º',
        canActivateProjected: false,
        activationBlockedReason: 'Se define tras las semifinales oficiales'
      }
    ];
  }

  return [];
};

function EscudoSVG({ forma, color, className }: { forma?: string | null; color?: string | null; className?: string; }) {
  const renderPath = () => {
    switch (forma) {
      case 'circle': return <circle cx="12" cy="12" r="10" />;
      case 'square': return <rect x="3" y="3" width="18" height="18" rx="2" />;
      case 'modern': return <path d="M5 3h14a2 2 0 012 2v10a8 8 0 01-8 8 8 8 0 01-8-8V5a2 2 0 012-2z" />;
      case 'hexagon': return <path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" />;
      default: return <circle cx="12" cy="12" r="10" />;
    }
  };
  return <svg viewBox="0 0 24 24" fill={color || 'currentColor'} className={className}>{renderPath()}</svg>;
}

export default function CalendarPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [jornada, setJornada] = useState(1);
  const [maxRound, setMaxRound] = useState(14);
  const [matches, setMatches] = useState<CalendarMatchRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activatingMatchEntryId, setActivatingMatchEntryId] = useState<string | null>(null);

  const [leagues, setLeagues] = useState<LigaRow[]>([]);
  const [groups, setGroups] = useState<GrupoRow[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  const [myClubId, setMyClubId] = useState<TeamId | null>(null);
  const [myLeagueId, setMyLeagueId] = useState<number | null>(null);
  const [myGroupId, setMyGroupId] = useState<number | null>(null);
  const lastAutomationPulseAtRef = useRef(0);
  const automationPulseInFlightRef = useRef<Promise<boolean> | null>(null);

  const triggerAutomationPulse = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastAutomationPulseAtRef.current < 60_000) return true;
    if (automationPulseInFlightRef.current) return automationPulseInFlightRef.current;

    automationPulseInFlightRef.current = (async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (sessionError || !accessToken) return false;

        const response = await fetch('/api/automation/pulse', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({ maxMatches: 220 })
        });

        if (!response.ok) return false;
        lastAutomationPulseAtRef.current = Date.now();
        return true;
      } catch (error) {
        console.warn('No se pudo lanzar el pulse de automatización.', error);
        return false;
      } finally {
        automationPulseInFlightRef.current = null;
      }
    })();

    return automationPulseInFlightRef.current;
  }, []);

  const groupOptions = useMemo(
    () => groups.filter(g => g.liga_id === selectedLeagueId),
    [groups, selectedLeagueId]
  );

  const selectedLeagueName = useMemo(
    () => leagues.find(l => l.id === selectedLeagueId)?.nombre || 'Liga',
    [leagues, selectedLeagueId]
  );
  const selectedGroupName = useMemo(
    () => groups.find(g => g.id === selectedGroupId)?.nombre || 'Grupo',
    [groups, selectedGroupId]
  );
  const defaultLeagueName = useMemo(
    () => leagues.find(l => l.id === myLeagueId)?.nombre || 'Mi liga',
    [leagues, myLeagueId]
  );
  const defaultGroupName = useMemo(
    () => groups.find(g => g.id === myGroupId)?.nombre || 'Mi grupo',
    [groups, myGroupId]
  );

  const ensureGroupPlayoffs = useCallback(async (groupId: number): Promise<EnsureGroupPlayoffsResult> => {
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) return { created: false, viewerMatchId: null };

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return { created: false, viewerMatchId: null };

      const response = await fetch('/api/competition/ensure-group-playoffs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ groupId })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            result?: { createdMatches?: number; status?: 'ok' | 'skipped' };
            viewerMatchId?: number | null;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        return { created: false, viewerMatchId: null };
      }

      const viewerMatchId = Number(payload.viewerMatchId || 0);
      return {
        created: Number(payload.result?.createdMatches || 0) > 0,
        viewerMatchId: viewerMatchId > 0 ? viewerMatchId : null
      };
    } catch {
      return { created: false, viewerMatchId: null };
    }
  }, []);

  const fetchGroupCalendarContext = useCallback(async (grupoId: number): Promise<GroupCalendarContext> => {
    const { data: teamsData, error: teamsError } = await supabase
      .from('clubes')
      .select('id, nombre, color_primario, escudo_forma, escudo_url')
      .eq('grupo_id', grupoId);

    if (teamsError) {
      throw teamsError;
    }

    const baseTeams = ((teamsData || []) as Array<{
      id: TeamId;
      nombre: string;
      color_primario?: string | null;
      escudo_forma?: EscudoForma | null;
      escudo_url?: string | null;
    }>).map((team) => ({
      id: String(team.id),
      nombre: String(team.nombre || `Equipo ${team.id}`),
      color_primario: team.color_primario || undefined,
      escudo_forma: team.escudo_forma || undefined,
      escudo_url: team.escudo_url || undefined,
      pj: 0,
      v: 0,
      d: 0,
      pts: 0
    }));

    const teamById = new Map<TeamId, MatchTeam>(
      baseTeams.map((team) => [
        team.id,
        {
          id: team.id,
          nombre: team.nombre,
          color_primario: team.color_primario,
          escudo_forma: team.escudo_forma,
          escudo_url: team.escudo_url
        }
      ])
    );

    const teamIds = baseTeams.map((team) => team.id);
    if (teamIds.length === 0) {
      return {
        allMatches: [],
        teamById,
        standings: [],
        actualMaxRound: 0,
        regularMaxRound: 0,
        regularSeasonComplete: false,
        plannedMaxRound: 14,
        playoffSemiRound: 15,
        playoffFinalRound: 16,
        hasPlayoffSlots: false
      };
    }

    const [{ data: homeMatches, error: homeMatchesError }, { data: awayMatches, error: awayMatchesError }] =
      await Promise.all([
        supabase
          .from('matches')
          .select('id, jornada, fase, home_team_id, away_team_id, home_score, away_score, played, match_date')
          .in('home_team_id', teamIds),
        supabase
          .from('matches')
          .select('id, jornada, fase, home_team_id, away_team_id, home_score, away_score, played, match_date')
          .in('away_team_id', teamIds)
      ]);

    const matchesError = homeMatchesError || awayMatchesError;
    if (matchesError) {
      throw matchesError;
    }

    const teamIdSet = new Set(teamIds);
    const allMatches = dedupeMatches([
      ...(((homeMatches || []) as DbMatchRow[]) || []),
      ...(((awayMatches || []) as DbMatchRow[]) || [])
    ]).filter(
      (match) =>
        teamIdSet.has(String(match.home_team_id)) &&
        teamIdSet.has(String(match.away_team_id))
    );

    const regularMatches = allMatches.filter((match) => normalizePhase(match.fase) === 'REGULAR');
    const regularSeasonComplete = regularMatches.length > 0 && regularMatches.every((match) => match.played);
    const statsByTeam = new Map<TeamId, { pj: number; v: number; d: number; pts: number }>(
      teamIds.map((id) => [id, { pj: 0, v: 0, d: 0, pts: 0 }])
    );

    regularMatches
      .filter((match) => match.played)
      .forEach((match) => {
        const homeId = String(match.home_team_id);
        const awayId = String(match.away_team_id);
        const home = statsByTeam.get(homeId);
        const away = statsByTeam.get(awayId);
        if (!home || !away) return;

        home.pj += 1;
        away.pj += 1;

        const homeScore = Number(match.home_score || 0);
        const awayScore = Number(match.away_score || 0);

        if (homeScore > awayScore) {
          home.v += 1;
          home.pts += 2;
          away.d += 1;
          away.pts += 1;
          return;
        }

        if (awayScore > homeScore) {
          away.v += 1;
          away.pts += 2;
          home.d += 1;
          home.pts += 1;
          return;
        }

        home.d += 1;
        away.d += 1;
        home.pts += 1;
        away.pts += 1;
      });

    const standings = sortStandings(
      baseTeams.map((team) => {
        const computed = statsByTeam.get(team.id);
        return {
          ...team,
          pj: computed?.pj || 0,
          v: computed?.v || 0,
          d: computed?.d || 0,
          pts: computed?.pts || 0
        };
      })
    );

    const regularMaxRound = regularMatches.length > 0
      ? Math.max(...regularMatches.map((match) => Number(match.jornada || 0)))
      : 0;
    const actualMaxRound = allMatches.length > 0
      ? Math.max(...allMatches.map((match) => Number(match.jornada || 0)))
      : 0;
    const hasPlayoffSlots = teamIds.length >= 8 && regularMaxRound > 0;
    const playoffSemiRound = regularMaxRound > 0 ? regularMaxRound + 1 : 15;
    const playoffFinalRound = regularMaxRound > 0 ? regularMaxRound + 2 : 16;
    const plannedMaxRound = hasPlayoffSlots
      ? Math.max(actualMaxRound, playoffFinalRound)
      : Math.max(actualMaxRound, regularMaxRound || 14);

    return {
      allMatches,
      teamById,
      standings,
      actualMaxRound,
      regularMaxRound,
      regularSeasonComplete,
      plannedMaxRound,
      playoffSemiRound,
      playoffFinalRound,
      hasPlayoffSlots
    };
  }, []);

  const activateProjectedMatch = useCallback(async (groupId: number, round: number, entryId: string) => {
    if (!myClubId) return;

    setActivatingMatchEntryId(entryId);
    setLoadError(null);

    try {
      const ensured = await ensureGroupPlayoffs(groupId);
      if (ensured.viewerMatchId) {
        router.push(`/match?matchId=${ensured.viewerMatchId}`);
        return;
      }

      const refreshedContext = await fetchGroupCalendarContext(groupId);
      const officialMatch = refreshedContext.allMatches.find(
        (match) =>
          Number(match.jornada || 0) === round &&
          [String(match.home_team_id), String(match.away_team_id)].includes(myClubId)
      );

      if (officialMatch?.id) {
        router.push(`/match?matchId=${officialMatch.id}`);
        return;
      }

      if (!ensured.created) {
        setLoadError('El cruce oficial todavía no está listo. Recarga en unos segundos.');
      }
    } catch (error) {
      setLoadError(toErrorText(error));
    } finally {
      setActivatingMatchEntryId(null);
    }
  }, [ensureGroupPlayoffs, fetchGroupCalendarContext, myClubId, router]);

  const getRoundStateForGroup = useCallback(async (grupoId: number) => {
    try {
      const context = await fetchGroupCalendarContext(grupoId);

      if (context.allMatches.length === 0) {
        return { currentRound: 1, maxRound: context.plannedMaxRound };
      }

      for (let round = 1; round <= context.plannedMaxRound; round++) {
        const roundMatches = context.allMatches.filter((match) => Number(match.jornada || 0) === round);
        if (roundMatches.length === 0) {
          if (
            round <= context.actualMaxRound ||
            (context.hasPlayoffSlots && round > context.regularMaxRound)
          ) {
            return {
              currentRound: round,
              maxRound: context.plannedMaxRound
            };
          }
          continue;
        }

        if (roundMatches.some((match) => !match.played)) {
          return {
            currentRound: round,
            maxRound: context.plannedMaxRound
          };
        }
      }

      return {
        currentRound: context.plannedMaxRound,
        maxRound: context.plannedMaxRound
      };
    } catch (error) {
      console.warn('No se pudo calcular la jornada actual del grupo.', error);
      return { currentRound: 1, maxRound: 14 };
    }
  }, [fetchGroupCalendarContext]);

  const loadMatches = useCallback(async (grupoId: number, j: number, opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      await triggerAutomationPulse();
      let context = await fetchGroupCalendarContext(grupoId);
      if (context.standings.length === 0) {
        setMatches([]);
        return;
      }

      let rawMatches = context.allMatches.filter((match) => Number(match.jornada || 0) === j);
      const isEmptyPlayoffSlot =
        context.hasPlayoffSlots &&
        j > context.regularMaxRound &&
        rawMatches.length === 0;

      if (isEmptyPlayoffSlot) {
        const ensured = await ensureGroupPlayoffs(grupoId);
        if (ensured.created || ensured.viewerMatchId) {
          context = await fetchGroupCalendarContext(grupoId);
          rawMatches = context.allMatches.filter((match) => Number(match.jornada || 0) === j);
        }
      }

      if (rawMatches.length === 0) {
        setMatches(buildProjectedPlayoffMatches(context, j));
        return;
      }

      const normalizedMatches: CalendarMatchRow[] = rawMatches.map((match) => ({
        entryId: `official-${match.id}`,
        id: match.id,
        jornada: match.jornada,
        fase: match.fase || null,
        home_score: match.home_score,
        away_score: match.away_score,
        played: match.played,
        match_date: match.match_date || null,
        home_team: context.teamById.get(String(match.home_team_id)) || buildFallbackTeam(String(match.home_team_id)),
        away_team: context.teamById.get(String(match.away_team_id)) || buildFallbackTeam(String(match.away_team_id)),
      }));

      setMatches(normalizedMatches);
    } catch (e) {
      // Evitamos console.error para no abrir el overlay rojo por errores recuperables.
      console.warn('No se pudieron cargar los partidos para este filtro.', e);
      const detail = toErrorText(e);
      setLoadError(`No se pudieron cargar los partidos (${detail.slice(0, 160)}).`);
      setMatches([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [ensureGroupPlayoffs, fetchGroupCalendarContext, triggerAutomationPulse]);

  const init = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [
        { data: myClub },
        { data: ligas },
        { data: grupos },
      ] = await Promise.all([
        supabase.from('clubes').select('id, league_id, grupo_id').eq('owner_id', user.id).maybeSingle(),
        supabase.from('ligas').select('id, nombre, nivel').order('nivel', { ascending: true }),
        supabase.from('grupos_liga').select('id, nombre, liga_id').order('id', { ascending: true }),
      ]);

      const leaguesData = (ligas || []) as LigaRow[];
      const groupsData = (grupos || []) as GrupoRow[];
      setLeagues(leaguesData);
      setGroups(groupsData);

      if (!myClub) return;

      setMyClubId(String(myClub.id));
      setMyLeagueId(myClub.league_id || null);
      setMyGroupId(myClub.grupo_id || null);

      await triggerAutomationPulse(true);

      const fallbackLeagueId = myClub.league_id || leaguesData[0]?.id || null;
      const fallbackGroupId =
        myClub.grupo_id ||
        groupsData.find(g => g.liga_id === fallbackLeagueId)?.id ||
        groupsData[0]?.id ||
        null;

      setSelectedLeagueId(fallbackLeagueId);
      setSelectedGroupId(fallbackGroupId);

      if (fallbackGroupId) {
        const roundState = await getRoundStateForGroup(fallbackGroupId);
        setJornada(roundState.currentRound);
        setMaxRound(roundState.maxRound);
        await loadMatches(fallbackGroupId, roundState.currentRound);
      }
    } catch (e) {
      console.warn('Error inicializando calendario:', e);
    } finally {
      setLoading(false);
    }
  }, [getRoundStateForGroup, loadMatches, triggerAutomationPulse]);

  useEffect(() => { void init(); }, [init]);

  useEffect(() => {
    if (!selectedLeagueId) return;
    if (!selectedGroupId || !groupOptions.some(g => g.id === selectedGroupId)) {
      setSelectedGroupId(groupOptions[0]?.id || null);
    }
  }, [selectedLeagueId, selectedGroupId, groupOptions]);

  useEffect(() => {
    if (!selectedGroupId) {
      setMatches([]);
      return;
    }
    let isMounted = true;
    (async () => {
      await triggerAutomationPulse();
      const roundState = await getRoundStateForGroup(selectedGroupId);
      if (isMounted) {
        setJornada(roundState.currentRound);
        setMaxRound(roundState.maxRound);
      }
    })();
    return () => { isMounted = false; };
  }, [selectedGroupId, getRoundStateForGroup, triggerAutomationPulse]);

  useEffect(() => {
    if (!selectedGroupId) return;
    void loadMatches(selectedGroupId, jornada);
  }, [selectedGroupId, jornada, loadMatches]);

  useEffect(() => {
    if (!selectedGroupId) return;

    const interval = window.setInterval(() => {
      void loadMatches(selectedGroupId, jornada, { silent: true });
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [selectedGroupId, jornada, loadMatches]);

  const nextRound = () => setJornada(p => Math.min(maxRound, p + 1));
  const prevRound = () => setJornada(p => Math.max(1, p - 1));

  const resetToDefaults = async () => {
    if (!myLeagueId || !myGroupId) return;
    setSelectedLeagueId(myLeagueId);
    setSelectedGroupId(myGroupId);
    await triggerAutomationPulse();
    const roundState = await getRoundStateForGroup(myGroupId);
    setJornada(roundState.currentRound);
    setMaxRound(roundState.maxRound);
  };

  const isShowingDefault = selectedGroupId === myGroupId;
  const currentPhaseLabel = useMemo(() => {
    const distinctPhases = [...new Set(matches.map((match) => normalizePhase(match.fase)))];
    if (distinctPhases.length === 0) return null;

    const allProjected = matches.length > 0 && matches.every((match) => match.isProjected);
    const allSemis = distinctPhases.every((phase) => phase.endsWith('_SF'));
    const allFinals = distinctPhases.every((phase) => phase.endsWith('FINAL'));

    if (allSemis) {
      return allProjected ? 'Semifinales planificadas' : 'Semifinales playoff';
    }
    if (allFinals) {
      return allProjected ? 'Finales planificadas' : 'Finales playoff';
    }
    if (distinctPhases.length !== 1 || distinctPhases[0] === 'REGULAR') return null;
    return formatPhaseLabel(distinctPhases[0]);
  }, [matches]);

  const getJornadaDateStr = (jRound: number) => {
    const baseDate = new Date(2026, 2, 4, 18, 30);
    const weekOffset = Math.floor((jRound - 1) / 2);
    const isSaturday = jRound % 2 === 0;
    const daysToAdd = (weekOffset * 7) + (isSaturday ? 3 : 0);
    baseDate.setDate(baseDate.getDate() + daysToAdd);
    if (isSaturday) baseDate.setHours(12, 30);

    return new Intl.DateTimeFormat('es-ES', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(baseDate) + ' CET';
  };

  const formatKickoff = (match: CalendarMatchRow) => {
    if (match.match_date) {
      const parsed = new Date(match.match_date);
      if (!Number.isNaN(parsed.getTime())) {
        return (
          new Intl.DateTimeFormat('es-ES', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Madrid'
          }).format(parsed) + ' CET/CEST'
        );
      }
    }
    return getJornadaDateStr(match.jornada);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-orange-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-6xl mx-auto relative z-10">
        <header className="mb-8 border-b border-white/5 pb-8">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-3 mb-6">
              <CalendarDays className="text-orange-500" size={32} />
              <h1 className="text-4xl font-black italic uppercase tracking-tighter text-white">Cronograma <span className="text-orange-500">Liga</span></h1>
            </div>
            <div className="mb-6 bg-slate-900/60 border border-white/10 rounded-2xl px-5 py-3 text-center">
              <p className="text-[10px] uppercase tracking-widest font-black text-slate-500">Default automático</p>
              <p className="text-sm font-black text-white mt-1">{defaultLeagueName} • {defaultGroupName} • Jornada actual</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-center">
            <div className="bg-slate-900/50 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-orange-300 mb-3">
                <Filter size={14} />
                <p className="text-[10px] font-black uppercase tracking-widest">Explorar calendario</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select
                  value={selectedLeagueId || ''}
                  onChange={(e) => setSelectedLeagueId(Number(e.target.value))}
                  className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-orange-500"
                >
                  {leagues.map((league) => (
                    <option key={league.id} value={league.id}>{league.nombre}</option>
                  ))}
                </select>
                <select
                  value={selectedGroupId || ''}
                  onChange={(e) => setSelectedGroupId(Number(e.target.value))}
                  className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-orange-500"
                >
                  {groupOptions.map((group) => (
                    <option key={group.id} value={group.id}>{group.nombre}</option>
                  ))}
                </select>
                <button
                  onClick={resetToDefaults}
                  disabled={!myLeagueId || !myGroupId || isShowingDefault}
                  className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black uppercase text-[10px] rounded-xl py-2 transition-colors"
                >
                  <RotateCcw size={12} />
                  Volver a mi grupo
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between w-full lg:w-[420px] bg-slate-900 border border-white/10 rounded-[2rem] p-2 shadow-2xl">
              <button onClick={prevRound} disabled={jornada === 1} className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/5 disabled:opacity-30 transition-all">
                <ChevronLeft />
              </button>
              <div className="text-center">
                <h2 className="text-2xl font-black uppercase tracking-tighter text-white">Jornada {jornada}</h2>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">{getJornadaDateStr(jornada)}</p>
                {currentPhaseLabel && (
                  <p className="text-[10px] text-orange-300 font-black uppercase tracking-widest mt-2">
                    {currentPhaseLabel}
                  </p>
                )}
              </div>
              <button onClick={nextRound} disabled={jornada === maxRound} className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/5 disabled:opacity-30 transition-all">
                <ChevronRight />
              </button>
            </div>
          </div>
        </header>

        {!isShowingDefault && (
          <div className="mb-4 px-4 py-2 rounded-xl border border-amber-500/20 bg-amber-500/10 text-[10px] font-black uppercase tracking-widest text-amber-300">
            Estás viendo otro grupo: {selectedLeagueName} • {selectedGroupName}
          </div>
        )}

        {matches.some((match) => match.isProjected) && (
          <div className="mb-4 px-4 py-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-[10px] font-black uppercase tracking-widest text-cyan-200">
            Playoffs planificados: estos cruces son provisionales y reservan su slot oficial de miércoles o sábado.
          </div>
        )}

        {loadError && (
          <div className="mb-4 px-4 py-2 rounded-xl border border-red-500/20 bg-red-500/10 text-[10px] font-black uppercase tracking-widest text-red-300">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="p-32 text-center flex flex-col items-center">
            <Activity className="w-12 h-12 text-orange-500 animate-spin mb-6" />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Cargando enfrentamientos...</p>
          </div>
        ) : matches.length === 0 ? (
          <div className="p-20 text-center bg-slate-900/50 border border-white/5 rounded-[2rem]">
            <Trophy className="w-16 h-16 text-slate-700 mx-auto mb-4" />
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">No hay partidos para este grupo en esta jornada.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matches.map((m) => {
              const isMyMatch = myClubId === m.home_team?.id || myClubId === m.away_team?.id;

              return (
                <div key={m.entryId} className={`relative flex items-center justify-between p-6 rounded-[2rem] border transition-all ${m.isProjected ? 'bg-cyan-500/5 border-cyan-500/20 border-dashed' : isMyMatch ? 'bg-orange-500/10 border-orange-500/30 shadow-[0_0_20px_rgba(249,115,22,0.1)]' : 'bg-slate-900 border-white/5 hover:border-white/10'}`}>
                  <div className="flex flex-col items-center w-1/3 gap-3">
                    <div className="w-14 h-14">
                      {m.home_team?.escudo_url ? (
                        <img src={m.home_team.escudo_url} className="w-full h-full object-contain drop-shadow-md" alt="Home" />
                      ) : (
                        <EscudoSVG forma={m.home_team?.escudo_forma} color={m.home_team?.color_primario} className="w-full h-full drop-shadow-md" />
                      )}
                    </div>
                    <span className={`text-[11px] font-black uppercase text-center leading-tight ${isMyMatch && myClubId === m.home_team?.id ? 'text-orange-400' : 'text-slate-300'}`}>
                      {m.home_team?.nombre}
                    </span>
                  </div>

                  <div className="flex flex-col items-center justify-center w-1/3">
                    {m.played ? (
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-2">
                          <span className={`text-3xl font-mono font-black ${m.home_score > m.away_score ? 'text-white' : 'text-slate-500'}`}>{m.home_score}</span>
                          <span className="text-slate-600 font-black">-</span>
                          <span className={`text-3xl font-mono font-black ${m.away_score > m.home_score ? 'text-white' : 'text-slate-500'}`}>{m.away_score}</span>
                        </div>
                        <span className="text-[9px] bg-slate-950 px-3 py-1 rounded-full text-slate-500 uppercase tracking-widest font-bold mt-2 border border-white/5">Finalizado</span>
                        {m.id && (
                          <Link href={`/match?matchId=${m.id}`} className="mt-3 flex items-center gap-1 text-[10px] font-black text-cyan-500 uppercase hover:text-cyan-400 transition-colors bg-cyan-500/10 px-3 py-1.5 rounded-lg border border-cyan-500/20">
                            <Play size={10} fill="currentColor" /> Ver Repetición
                          </Link>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <span className={`text-xl font-black ${m.isProjected ? 'text-cyan-300' : 'text-slate-600'}`}>VS</span>
                        <span className={`text-[9px] px-3 py-1 rounded-full uppercase tracking-widest font-bold mt-2 border ${m.isProjected ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' : 'bg-orange-500/10 text-orange-500 border-orange-500/20'}`}>
                          {m.isProjected ? 'Planificado' : 'Pendiente'}
                        </span>
                        {m.projectedLabel && (
                          <span className="mt-2 text-[9px] text-cyan-200 font-bold uppercase tracking-widest text-center">
                            {m.projectedLabel}
                          </span>
                        )}
                        <span className="mt-2 text-[9px] text-slate-400 font-bold uppercase tracking-widest text-center">
                          {m.isProjected ? 'Slot: ' : 'Auto: '}{formatKickoff(m)}
                        </span>
                        {isMyMatch && m.isProjected && selectedGroupId && m.canActivateProjected && (
                          <button
                            onClick={() => void activateProjectedMatch(selectedGroupId, m.jornada, m.entryId)}
                            disabled={activatingMatchEntryId === m.entryId}
                            className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase text-cyan-300 hover:text-cyan-200 transition-colors bg-cyan-500/10 px-3 py-1.5 rounded-lg border border-cyan-500/20 disabled:opacity-50"
                          >
                            {activatingMatchEntryId === m.entryId ? <Activity size={10} className="animate-spin" /> : <Play size={10} fill="currentColor" />}
                            {activatingMatchEntryId === m.entryId ? 'Activando...' : 'Entrar al directo'}
                          </button>
                        )}
                        {isMyMatch && m.isProjected && !m.canActivateProjected && m.activationBlockedReason && (
                          <span className="mt-3 text-[9px] text-amber-300 font-bold uppercase tracking-widest text-center">
                            {m.activationBlockedReason}
                          </span>
                        )}
                        {!m.isProjected && m.id && (
                          <div className="mt-3 flex flex-wrap justify-center gap-2">
                            {isMyMatch && (
                              <Link href={`/tactics?matchId=${m.id}`} className="flex items-center gap-1 text-[10px] font-black text-yellow-500 uppercase hover:text-yellow-400 transition-colors bg-yellow-500/10 px-3 py-1.5 rounded-lg border border-yellow-500/20">
                                <Shield size={10} /> Preparar
                              </Link>
                            )}
                            <Link href={`/match?matchId=${m.id}`} className="flex items-center gap-1 text-[10px] font-black text-emerald-400 uppercase hover:text-emerald-300 transition-colors bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                              <Play size={10} fill="currentColor" /> {isMyMatch ? 'Seguir' : 'Ver Partido'}
                            </Link>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-center w-1/3 gap-3">
                    <div className="w-14 h-14">
                      {m.away_team?.escudo_url ? (
                        <img src={m.away_team.escudo_url} className="w-full h-full object-contain drop-shadow-md" alt="Away" />
                      ) : (
                        <EscudoSVG forma={m.away_team?.escudo_forma} color={m.away_team?.color_primario} className="w-full h-full drop-shadow-md" />
                      )}
                    </div>
                    <span className={`text-[11px] font-black uppercase text-center leading-tight ${isMyMatch && myClubId === m.away_team?.id ? 'text-orange-400' : 'text-slate-300'}`}>
                      {m.away_team?.nombre}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
