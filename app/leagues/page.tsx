'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Globe, Medal, Trophy, ArrowUpCircle, ArrowDownCircle, Filter, RotateCcw } from 'lucide-react';

type EscudoForma = 'circle' | 'square' | 'modern' | 'hexagon' | 'classic';
type LigaRow = { id: number; nombre: string; nivel?: number };
type GrupoRow = { id: number; nombre: string; liga_id: number };
type TeamId = string;
type TeamRow = {
  id: TeamId;
  nombre: string;
  is_bot?: boolean;
  color_primario?: string;
  escudo_forma?: EscudoForma | null;
  escudo_url?: string | null;
  pj?: number;
  v?: number;
  d?: number;
  pts?: number;
};
type CompetitionMatchRow = {
  id: number;
  jornada: number;
  fase?: string | null;
  home_team_id: TeamId;
  away_team_id: TeamId;
  home_score: number;
  away_score: number;
  played: boolean;
};
type CompetitionState = {
  regularPlayedCount: number;
  regularTotalCount: number;
  playoffMatches: CompetitionMatchRow[];
  teamDirectory: Record<TeamId, TeamRow>;
};
type BracketPairing = {
  label: string;
  homeSeed: string;
  awaySeed: string;
  home?: TeamRow;
  away?: TeamRow;
};
type BracketTone = 'green' | 'red';
type PlayoffTab = 'standings' | 'playoffs';
type BracketMatchCardData = {
  id: string;
  label: string;
  homeTeam?: TeamRow;
  awayTeam?: TeamRow;
  homeSeed?: string;
  awaySeed?: string;
  played?: boolean;
  homeScore?: number;
  awayScore?: number;
  footer?: string;
};

const PLAYOFF_PHASE = {
  PROMO_SF: 'PROMO_SF',
  PROMO_FINAL: 'PROMO_FINAL',
  RELEG_SF: 'RELEG_SF',
  RELEG_FINAL: 'RELEG_FINAL'
} as const;

const toErrorText = (error: unknown) => {
  if (!error) return 'Error desconocido';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const e = error as { message?: string; details?: string; hint?: string };
    return e.message || e.details || e.hint || JSON.stringify(error);
  }
  return String(error);
};

const normalizePhase = (phase?: string | null) => String(phase || 'REGULAR').trim().toUpperCase();

const sortMatches = (matches: CompetitionMatchRow[]) =>
  [...matches].sort((a, b) => {
    const phaseDiff = normalizePhase(a.fase).localeCompare(normalizePhase(b.fase));
    if (phaseDiff !== 0) return phaseDiff;
    const roundDiff = Number(a.jornada || 0) - Number(b.jornada || 0);
    if (roundDiff !== 0) return roundDiff;
    return Number(a.id || 0) - Number(b.id || 0);
  });

const dedupeMatches = (matches: CompetitionMatchRow[]) =>
  sortMatches(Array.from(new Map(matches.map((match) => [match.id, match])).values()));

const buildBracketPairings = (teams: TeamRow[], startSeed: number): BracketPairing[] => {
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

const buildPlaceholderTeam = (id: string, nombre: string): TeamRow => ({
  id,
  nombre
});

const getBracketToneClasses = (tone: BracketTone) =>
  tone === 'green'
    ? {
        panel: 'border-green-500/20 bg-green-500/10',
        card: 'border-green-500/15 bg-slate-950/70',
        badge: 'border-green-500/20 bg-green-500/10 text-green-200',
        accent: 'text-green-300',
        connector: 'bg-green-400/45',
        mutedConnector: 'bg-green-400/20'
      }
    : {
        panel: 'border-red-500/20 bg-red-500/10',
        card: 'border-red-500/15 bg-slate-950/70',
        badge: 'border-red-500/20 bg-red-500/10 text-red-200',
        accent: 'text-red-300',
        connector: 'bg-red-400/45',
        mutedConnector: 'bg-red-400/20'
      };

const getTeamFromDirectory = (
  teamDirectory: Record<TeamId, TeamRow>,
  teamId: TeamId
) => teamDirectory[String(teamId)] || buildPlaceholderTeam(String(teamId), `Equipo ${String(teamId)}`);

const getWinnerTeamFromMatch = (
  match: CompetitionMatchRow | undefined,
  teamDirectory: Record<TeamId, TeamRow>
) => {
  if (!match || !match.played) return null;
  const homeScore = Number(match.home_score || 0);
  const awayScore = Number(match.away_score || 0);
  if (homeScore === awayScore) return null;
  return homeScore > awayScore
    ? getTeamFromDirectory(teamDirectory, match.home_team_id)
    : getTeamFromDirectory(teamDirectory, match.away_team_id);
};

const buildOfficialMatchCard = (
  match: CompetitionMatchRow,
  teamDirectory: Record<TeamId, TeamRow>,
  label: string
): BracketMatchCardData => ({
  id: `official-${match.id}`,
  label,
  homeTeam: getTeamFromDirectory(teamDirectory, match.home_team_id),
  awayTeam: getTeamFromDirectory(teamDirectory, match.away_team_id),
  played: match.played,
  homeScore: Number(match.home_score || 0),
  awayScore: Number(match.away_score || 0),
  footer: `Jornada ${match.jornada || '-'}`
});

const buildProjectedMatchCard = (
  pairing: BracketPairing,
  label: string
): BracketMatchCardData => ({
  id: `projected-${label}-${pairing.homeSeed}-${pairing.awaySeed}`,
  label,
  homeTeam: pairing.home,
  awayTeam: pairing.away,
  homeSeed: pairing.homeSeed,
  awaySeed: pairing.awaySeed,
  played: false
});

function TeamBadge({
  team,
  seed,
  tone
}: {
  team?: TeamRow;
  seed?: string;
  tone: BracketTone;
}) {
  const toneClasses = getBracketToneClasses(tone);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 px-3 py-2.5">
      <div className={`min-w-[42px] rounded-xl border px-2 py-1 text-center text-[10px] font-black uppercase tracking-widest ${toneClasses.badge}`}>
        {seed || 'EQ'}
      </div>
      <div className="w-9 h-9 shrink-0 flex items-center justify-center">
        {team?.escudo_url ? (
          <img
            src={team.escudo_url}
            alt={`Escudo ${team.nombre}`}
            className="w-full h-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.4)]"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <EscudoSVG
          forma={team?.escudo_forma}
          color={team?.color_primario}
          className={`w-full h-full drop-shadow-[0_4px_10px_rgba(0,0,0,0.4)] ${team?.escudo_url ? 'hidden' : ''}`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-black uppercase tracking-wide text-white">
          {team?.nombre || 'Por definir'}
        </p>
      </div>
    </div>
  );
}

function BracketMatchCard({
  match,
  tone
}: {
  match: BracketMatchCardData;
  tone: BracketTone;
}) {
  const toneClasses = getBracketToneClasses(tone);

  return (
    <div className={`rounded-[1.6rem] border p-4 shadow-[0_20px_60px_rgba(2,6,23,0.35)] ${toneClasses.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[10px] font-black uppercase tracking-[0.25em] ${toneClasses.accent}`}>
            {match.label}
          </p>
          {match.footer && (
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {match.footer}
            </p>
          )}
        </div>
        <div className="text-right">
          {match.played ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300">
              {match.homeScore} - {match.awayScore}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-300">
              Pendiente
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        <TeamBadge team={match.homeTeam} seed={match.homeSeed} tone={tone} />
        <TeamBadge team={match.awayTeam} seed={match.awaySeed} tone={tone} />
      </div>
    </div>
  );
}

function BracketConnector({ tone }: { tone: BracketTone }) {
  const toneClasses = getBracketToneClasses(tone);

  return (
    <div className="hidden xl:block relative h-[280px]">
      <div className={`absolute left-0 top-[25%] h-px w-1/2 ${toneClasses.connector}`}></div>
      <div className={`absolute left-0 bottom-[25%] h-px w-1/2 ${toneClasses.connector}`}></div>
      <div className={`absolute left-1/2 top-[25%] bottom-[25%] w-px ${toneClasses.connector}`}></div>
      <div className={`absolute left-1/2 top-1/2 h-px w-1/2 ${toneClasses.connector}`}></div>
      <div className={`absolute inset-y-[calc(50%-24px)] right-0 w-px ${toneClasses.mutedConnector}`}></div>
    </div>
  );
}

function BracketSection({
  title,
  subtitle,
  tone,
  status,
  semifinals,
  finalMatch
}: {
  title: string;
  subtitle: string;
  tone: BracketTone;
  status: string;
  semifinals: BracketMatchCardData[];
  finalMatch: BracketMatchCardData;
}) {
  const toneClasses = getBracketToneClasses(tone);

  return (
    <section className={`rounded-[2rem] border p-5 lg:p-6 ${toneClasses.panel}`}>
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className={`text-[10px] font-black uppercase tracking-[0.25em] ${toneClasses.accent}`}>
            {title}
          </p>
          <h5 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">
            {subtitle}
          </h5>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300">
          {status}
        </div>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)] xl:items-center">
        <div className="space-y-4">
          {semifinals.map((match) => (
            <BracketMatchCard key={match.id} match={match} tone={tone} />
          ))}
        </div>

        <BracketConnector tone={tone} />

        <div className="xl:min-h-[280px] xl:flex xl:items-center">
          <div className="w-full">
            <div className="xl:hidden mb-3 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
              <div className={`h-px flex-1 ${toneClasses.connector}`}></div>
              Final
              <div className={`h-px flex-1 ${toneClasses.connector}`}></div>
            </div>
            <BracketMatchCard match={finalMatch} tone={tone} />
          </div>
        </div>
      </div>
    </section>
  );
}

function EscudoSVG({
  forma,
  color,
  className
}: {
  forma?: string | null;
  color?: string | null;
  className?: string;
}) {
  const renderPath = () => {
    switch (forma) {
      case 'circle':
        return <circle cx="12" cy="12" r="10" />;
      case 'square':
        return <rect x="3" y="3" width="18" height="18" rx="2" />;
      case 'modern':
        return <path d="M5 3h14a2 2 0 012 2v10a8 8 0 01-8 8 8 8 0 01-8-8V5a2 2 0 012-2z" />;
      case 'hexagon':
        return <path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" />;
      default:
        return <circle cx="12" cy="12" r="10" />;
    }
  };

  return (
    <svg viewBox="0 0 24 24" fill={color || 'currentColor'} className={className}>
      {renderPath()}
    </svg>
  );
}

export default function LeaguesExplorer() {
  const [loading, setLoading] = useState(true);
  const [standings, setStandings] = useState<TeamRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [competitionState, setCompetitionState] = useState<CompetitionState | null>(null);

  const [leagues, setLeagues] = useState<LigaRow[]>([]);
  const [groups, setGroups] = useState<GrupoRow[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  const [myClubId, setMyClubId] = useState<TeamId | null>(null);
  const [myLeagueId, setMyLeagueId] = useState<number | null>(null);
  const [myGroupId, setMyGroupId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<PlayoffTab>('standings');

  const sortStandings = useCallback((teams: TeamRow[]) => {
    return [...teams].sort((a, b) => {
      const ptsDiff = Number(b.pts || 0) - Number(a.pts || 0);
      if (ptsDiff !== 0) return ptsDiff;
      const winsDiff = Number(b.v || 0) - Number(a.v || 0);
      if (winsDiff !== 0) return winsDiff;
      const lossesDiff = Number(a.d || 0) - Number(b.d || 0);
      if (lossesDiff !== 0) return lossesDiff;
      return String(a.nombre || '').localeCompare(String(b.nombre || ''));
    });
  }, []);

  const loadStandings = useCallback(
    async (grupoId: number) => {
      setLoadError(null);

      const { data: teams, error } = await supabase.from('clubes').select('*').eq('grupo_id', grupoId);

      if (error) {
        console.warn('No se pudo cargar la clasificación del grupo.', error);
        setLoadError(`No se pudo cargar este grupo (${toErrorText(error).slice(0, 160)}).`);
        setStandings([]);
        setCompetitionState(null);
        return;
      }

      const baseTeams = (teams || []) as TeamRow[];
      if (baseTeams.length === 0) {
        setStandings([]);
        setCompetitionState(null);
        return;
      }

      const teamIds = baseTeams.map((team) => String(team.id));
      const teamIdSet = new Set(teamIds);
      const emptyStatsByTeam = new Map<string, { pj: number; v: number; d: number; pts: number }>(
        teamIds.map((id) => [id, { pj: 0, v: 0, d: 0, pts: 0 }])
      );

      const [{ data: homeMatches, error: homeMatchesError }, { data: awayMatches, error: awayMatchesError }] =
        await Promise.all([
          supabase
            .from('matches')
            .select('id,jornada,fase,home_team_id,away_team_id,home_score,away_score,played')
            .in('home_team_id', teamIds),
          supabase
            .from('matches')
            .select('id,jornada,fase,home_team_id,away_team_id,home_score,away_score,played')
            .in('away_team_id', teamIds)
        ]);

      const matchesError = homeMatchesError || awayMatchesError;
      if (matchesError) {
        console.warn('No se pudieron cargar los partidos del grupo.', matchesError);
        setLoadError(`No se pudieron recalcular standings (${toErrorText(matchesError).slice(0, 160)}).`);
        setStandings(sortStandings(baseTeams));
        setCompetitionState(null);
        return;
      }

      const mergedMatches = dedupeMatches([
        ...(((homeMatches || []) as CompetitionMatchRow[]) || []),
        ...(((awayMatches || []) as CompetitionMatchRow[]) || [])
      ]);

      const regularMatches = mergedMatches.filter((match) => {
        const phase = normalizePhase(match.fase);
        return (
          phase === 'REGULAR' &&
          teamIdSet.has(String(match.home_team_id)) &&
          teamIdSet.has(String(match.away_team_id))
        );
      });

      const playedRegularMatches = regularMatches.filter((match) => match.played);

      playedRegularMatches.forEach((match) => {
        const homeId = String(match.home_team_id);
        const awayId = String(match.away_team_id);
        const home = emptyStatsByTeam.get(homeId);
        const away = emptyStatsByTeam.get(awayId);
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

      const derived = baseTeams.map((team) => {
        const computed = emptyStatsByTeam.get(String(team.id));
        if (!computed) return team;
        return {
          ...team,
          pj: computed.pj,
          v: computed.v,
          d: computed.d,
          pts: computed.pts
        };
      });

      const playoffMatches = mergedMatches.filter((match) => normalizePhase(match.fase) !== 'REGULAR');
      const extraTeamIds = [...new Set(playoffMatches.flatMap((match) => [String(match.home_team_id), String(match.away_team_id)]))]
        .filter((teamId) => !teamIdSet.has(teamId));

      const teamDirectory: Record<TeamId, TeamRow> = Object.fromEntries(
        baseTeams.map((team) => [String(team.id), team])
      );

      if (extraTeamIds.length > 0) {
        const { data: extraTeams, error: extraTeamsError } = await supabase
          .from('clubes')
          .select('*')
          .in('id', extraTeamIds);

        if (extraTeamsError) {
          console.warn('No se pudieron resolver rivales externos de playoff.', extraTeamsError);
          setLoadError((current) => current || 'No se pudieron cargar algunos rivales del playoff.');
        } else {
          ((extraTeams || []) as TeamRow[]).forEach((team) => {
            teamDirectory[String(team.id)] = team;
          });
        }
      }

      setCompetitionState({
        regularPlayedCount: playedRegularMatches.length,
        regularTotalCount: regularMatches.length,
        playoffMatches,
        teamDirectory
      });
      setStandings(sortStandings(derived));
    },
    [sortStandings]
  );

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: myClub }, { data: ligas }, { data: grupos }] = await Promise.all([
        supabase.from('clubes').select('id, grupo_id, league_id').eq('owner_id', user.id).maybeSingle(),
        supabase.from('ligas').select('id, nombre, nivel').order('nivel', { ascending: true }),
        supabase.from('grupos_liga').select('id, nombre, liga_id').order('id', { ascending: true })
      ]);

      const leaguesData = (ligas || []) as LigaRow[];
      const groupsData = (grupos || []) as GrupoRow[];
      setLeagues(leaguesData);
      setGroups(groupsData);

      if (!myClub) {
        setStandings([]);
        setCompetitionState(null);
        return;
      }

      setMyClubId(String(myClub.id));
      setMyLeagueId(myClub.league_id || null);
      setMyGroupId(myClub.grupo_id || null);

      const fallbackLeagueId = myClub.league_id || leaguesData[0]?.id || null;
      const fallbackGroupId =
        myClub.grupo_id ||
        groupsData.find((group) => group.liga_id === fallbackLeagueId)?.id ||
        groupsData[0]?.id ||
        null;

      setSelectedLeagueId(fallbackLeagueId);
      setSelectedGroupId(fallbackGroupId);

      if (fallbackGroupId) {
        await loadStandings(fallbackGroupId);
      } else {
        setStandings([]);
        setCompetitionState(null);
      }
    } finally {
      setLoading(false);
    }
  }, [loadStandings]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  const groupOptions = useMemo(
    () => groups.filter((group) => group.liga_id === selectedLeagueId),
    [groups, selectedLeagueId]
  );

  const selectedLeagueName = useMemo(
    () => leagues.find((league) => league.id === selectedLeagueId)?.nombre || 'Liga',
    [leagues, selectedLeagueId]
  );
  const selectedGroupName = useMemo(
    () => groups.find((group) => group.id === selectedGroupId)?.nombre || 'Grupo',
    [groups, selectedGroupId]
  );
  const defaultLeagueName = useMemo(
    () => leagues.find((league) => league.id === myLeagueId)?.nombre || 'Mi liga',
    [leagues, myLeagueId]
  );
  const defaultGroupName = useMemo(
    () => groups.find((group) => group.id === myGroupId)?.nombre || 'Mi grupo',
    [groups, myGroupId]
  );

  useEffect(() => {
    if (!selectedLeagueId) return;
    if (!selectedGroupId || !groupOptions.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(groupOptions[0]?.id || null);
    }
  }, [selectedLeagueId, selectedGroupId, groupOptions]);

  useEffect(() => {
    if (!selectedGroupId) {
      setStandings([]);
      setCompetitionState(null);
      return;
    }
    void loadStandings(selectedGroupId);
  }, [selectedGroupId, loadStandings]);

  const regularPlayedCount = competitionState?.regularPlayedCount || 0;
  const regularTotalCount = competitionState?.regularTotalCount || 0;
  const regularSeasonComplete = regularTotalCount > 0 && regularPlayedCount === regularTotalCount;
  const remainingRegularMatches = Math.max(0, regularTotalCount - regularPlayedCount);

  const projectedPromotionPairings = useMemo(
    () => buildBracketPairings(standings.slice(0, 4), 1),
    [standings]
  );

  const projectedSurvivalPairings = useMemo(
    () => buildBracketPairings(standings.slice(4, 8), 5),
    [standings]
  );

  const teamDirectory = competitionState?.teamDirectory || {};
  const hasOfficialPlayoffs = (competitionState?.playoffMatches.length || 0) > 0;
  const playoffMatchesByPhase = useMemo(() => {
    const grouped = new Map<string, CompetitionMatchRow[]>();
    (competitionState?.playoffMatches || []).forEach((match) => {
      const phase = normalizePhase(match.fase);
      const current = grouped.get(phase) || [];
      current.push(match);
      grouped.set(phase, current);
    });

    return new Map(
      Array.from(grouped.entries()).map(([phase, matches]) => [phase, sortMatches(matches)])
    );
  }, [competitionState]);

  const officialPromotionSemifinals = playoffMatchesByPhase.get(PLAYOFF_PHASE.PROMO_SF) || [];
  const officialPromotionFinal = (playoffMatchesByPhase.get(PLAYOFF_PHASE.PROMO_FINAL) || [])[0];
  const officialRelegationSemifinals = playoffMatchesByPhase.get(PLAYOFF_PHASE.RELEG_SF) || [];
  const officialRelegationFinal = (playoffMatchesByPhase.get(PLAYOFF_PHASE.RELEG_FINAL) || [])[0];

  const promotionSemifinalCards = useMemo(() => {
    if (officialPromotionSemifinals.length > 0) {
      return officialPromotionSemifinals.map((match, index) =>
        buildOfficialMatchCard(match, teamDirectory, `Semifinal ${index + 1}`)
      );
    }

    return projectedPromotionPairings.map((pairing, index) =>
      buildProjectedMatchCard(pairing, `Semifinal ${index + 1}`)
    );
  }, [officialPromotionSemifinals, projectedPromotionPairings, teamDirectory]);

  const relegationSemifinalCards = useMemo(() => {
    if (officialRelegationSemifinals.length > 0) {
      return officialRelegationSemifinals.map((match, index) =>
        buildOfficialMatchCard(match, teamDirectory, `Semifinal ${index + 1}`)
      );
    }

    return projectedSurvivalPairings.map((pairing, index) =>
      buildProjectedMatchCard(pairing, `Semifinal ${index + 1}`)
    );
  }, [officialRelegationSemifinals, projectedSurvivalPairings, teamDirectory]);

  const promotionFinalCard = useMemo<BracketMatchCardData>(() => {
    if (officialPromotionFinal) {
      return buildOfficialMatchCard(officialPromotionFinal, teamDirectory, 'Final');
    }

    return {
      id: 'promotion-final',
      label: 'Final',
      homeTeam:
        getWinnerTeamFromMatch(officialPromotionSemifinals[0], teamDirectory) ||
        buildPlaceholderTeam('promo-winner-sf1', 'Ganador SF1'),
      awayTeam:
        getWinnerTeamFromMatch(officialPromotionSemifinals[1], teamDirectory) ||
        buildPlaceholderTeam('promo-winner-sf2', 'Ganador SF2'),
      homeSeed: officialPromotionSemifinals.length === 0 ? 'SF1' : undefined,
      awaySeed: officialPromotionSemifinals.length === 0 ? 'SF2' : undefined,
      played: false,
      footer: hasOfficialPlayoffs ? 'Pendiente de asignación oficial' : 'Cruce estimado según clasificación actual'
    };
  }, [officialPromotionFinal, officialPromotionSemifinals, teamDirectory, hasOfficialPlayoffs]);

  const relegationFinalCard = useMemo<BracketMatchCardData>(() => {
    if (officialRelegationFinal) {
      return buildOfficialMatchCard(officialRelegationFinal, teamDirectory, 'Final');
    }

    return {
      id: 'relegation-final',
      label: 'Final',
      homeTeam:
        getWinnerTeamFromMatch(officialRelegationSemifinals[0], teamDirectory) ||
        buildPlaceholderTeam('releg-winner-sf1', 'Ganador SF1'),
      awayTeam:
        getWinnerTeamFromMatch(officialRelegationSemifinals[1], teamDirectory) ||
        buildPlaceholderTeam('releg-winner-sf2', 'Ganador SF2'),
      homeSeed: officialRelegationSemifinals.length === 0 ? 'SF1' : undefined,
      awaySeed: officialRelegationSemifinals.length === 0 ? 'SF2' : undefined,
      played: false,
      footer: hasOfficialPlayoffs ? 'Pendiente de asignación oficial' : 'Cruce estimado según clasificación actual'
    };
  }, [officialRelegationFinal, officialRelegationSemifinals, teamDirectory, hasOfficialPlayoffs]);

  const playoffsModeLabel = !regularSeasonComplete
    ? 'Pendiente de cierre regular'
    : hasOfficialPlayoffs
      ? 'Cuadro oficial'
      : 'Cuadro provisional';
  const standingsCardSubtitle = `${selectedLeagueName} • Clasificación Fase Regular`;
  const playoffsCardSubtitle = `${selectedLeagueName} • Cuadro de Playoffs`;
  const promotionStatus = officialPromotionFinal
    ? 'Final oficial publicada'
    : officialPromotionSemifinals.length > 0
      ? 'Semifinales oficiales'
      : 'Proyección actual';
  const relegationStatus = officialRelegationFinal
    ? 'Final oficial publicada'
    : officialRelegationSemifinals.length > 0
      ? 'Semifinales oficiales'
      : 'Proyección actual';
  const isShowingDefault = selectedGroupId === myGroupId;
  const myTeamInSelectedGroup = standings.some((team) => team.id === myClubId);

  const resetToDefaultGroup = () => {
    if (!myLeagueId || !myGroupId) return;
    setSelectedLeagueId(myLeagueId);
    setSelectedGroupId(myGroupId);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-6xl mx-auto relative z-10">
        <header className="mb-10 flex flex-col md:flex-row justify-between items-center gap-6 border-b border-white/10 pb-8">
          <div>
            <h1 className="text-4xl font-black italic uppercase tracking-tighter text-white flex items-center gap-3">
              <Globe className="text-cyan-500" /> Central de Ligas
            </h1>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-3">
              Temporada Regular + Playoffs
            </p>
          </div>

          <div className="bg-slate-900 p-3 rounded-2xl border border-white/5 shadow-2xl text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Default automático</p>
            <p className="text-sm font-black text-white mt-1">
              {defaultLeagueName} • {defaultGroupName}
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-4 space-y-3">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
                Leyenda de Competición
              </p>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-4 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                <span className="text-[10px] font-bold text-slate-300">ZONA PLAYOFF / ASCENSO (Top 4)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-4 bg-slate-600 rounded-full"></div>
                <span className="text-[10px] font-bold text-slate-400">
                  CUADRO DE DESCENSO / PERMANENCIA (5º al 8º)
                </span>
              </div>
            </div>

            <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-4 space-y-3">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                Estado de la fase
              </p>
              <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Regular completada
                </p>
                <p className="mt-2 text-lg font-black text-white">
                  {regularPlayedCount}/{regularTotalCount || 0}
                </p>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                  {regularSeasonComplete
                    ? hasOfficialPlayoffs
                      ? 'Se han detectado cruces oficiales en la base de datos.'
                      : 'La regular ha terminado. Se muestra un cuadro provisional hasta que existan partidos oficiales.'
                    : `Faltan ${remainingRegularMatches} partidos de liga para cerrar el grupo y desbloquear el cuadro.`}
                </p>
              </div>
            </div>

            <div className="bg-slate-900/50 border border-white/10 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-cyan-300">
                <Filter size={14} />
                <p className="text-[10px] font-black uppercase tracking-widest">Explorar ligas</p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Liga</label>
                <select
                  value={selectedLeagueId || ''}
                  onChange={(e) => setSelectedLeagueId(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-cyan-500"
                >
                  {leagues.map((league) => (
                    <option key={league.id} value={league.id}>
                      {league.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Grupo</label>
                <select
                  value={selectedGroupId || ''}
                  onChange={(e) => setSelectedGroupId(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-cyan-500"
                >
                  {groupOptions.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={resetToDefaultGroup}
                disabled={!myLeagueId || !myGroupId || isShowingDefault}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black uppercase text-[10px] rounded-xl py-2 transition-colors"
              >
                <RotateCcw size={12} />
                Volver a mi grupo
              </button>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="bg-slate-900 border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
              <div className="p-8 border-b border-white/5 bg-white/5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-cyan-500/10 rounded-2xl flex items-center justify-center text-cyan-500 border border-cyan-500/20 shadow-inner">
                      {activeTab === 'standings' ? <Medal size={28} /> : <Trophy size={28} />}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter">
                        {selectedGroupName}
                      </h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-1">
                        {activeTab === 'standings' ? standingsCardSubtitle : playoffsCardSubtitle}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300">
                    {playoffsModeLabel}
                  </div>
                </div>

                <div className="mt-6 inline-flex rounded-2xl border border-white/10 bg-slate-950/70 p-1">
                  <button
                    onClick={() => setActiveTab('standings')}
                    className={`px-4 py-2 rounded-[1rem] text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${
                      activeTab === 'standings'
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    Clasificación
                  </button>
                  <button
                    onClick={() => setActiveTab('playoffs')}
                    className={`px-4 py-2 rounded-[1rem] text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${
                      activeTab === 'playoffs'
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    Playoffs
                  </button>
                </div>
              </div>

              {!isShowingDefault && !myTeamInSelectedGroup && (
                <div className="px-8 py-3 text-[10px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-300 border-b border-amber-500/20">
                  Estás viendo otro grupo. Tu equipo está en: {defaultGroupName}.
                </div>
              )}

              {loadError && (
                <div className="px-8 py-3 text-[10px] font-black uppercase tracking-widest bg-red-500/10 text-red-300 border-b border-red-500/20">
                  {loadError}
                </div>
              )}

              {loading ? (
                <div className="p-32 text-center flex flex-col items-center">
                  <div className="w-12 h-12 border-4 border-cyan-500/10 border-t-cyan-500 rounded-full animate-spin mb-6"></div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">
                    Sincronizando...
                  </p>
                </div>
              ) : (
                activeTab === 'standings' ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-white/5 bg-slate-950/40">
                          <th className="px-8 py-5 font-black w-20 text-center">Pos</th>
                          <th className="px-8 py-5 font-black">Club</th>
                          <th className="px-8 py-5 font-black text-center">PJ</th>
                          <th className="px-8 py-5 font-black text-center">V</th>
                          <th className="px-8 py-5 font-black text-center">D</th>
                          <th className="px-8 py-5 font-black text-center">Pts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {standings.map((team, idx) => {
                          const isPlayoffZone = idx < 4;
                          const isDangerZone = idx >= 4;
                          const isMyTeam = team.id === myClubId;

                          return (
                            <tr
                              key={team.id}
                              className={`hover:bg-white/5 transition-colors group relative ${
                                isPlayoffZone ? 'bg-green-500/5' : isDangerZone ? 'bg-red-500/5' : ''
                              } ${isMyTeam ? 'ring-1 ring-cyan-500/40' : ''}`}
                            >
                              <td className="px-8 py-6 text-center font-mono text-sm font-black text-slate-600 relative">
                                {isPlayoffZone && (
                                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                                )}
                                {isDangerZone && (
                                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
                                )}
                                <div className="flex items-center justify-center gap-1">
                                  {idx + 1}
                                  {isPlayoffZone && <ArrowUpCircle size={10} className="text-green-500" />}
                                  {isDangerZone && <ArrowDownCircle size={10} className="text-red-500" />}
                                </div>
                              </td>
                              <td className="px-8 py-6">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 shrink-0 flex items-center justify-center">
                                    {team.escudo_url ? (
                                      <img
                                        src={team.escudo_url}
                                        alt={`Escudo ${team.nombre}`}
                                        className="w-full h-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.4)]"
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                        }}
                                      />
                                    ) : null}
                                    <EscudoSVG
                                      forma={team.escudo_forma}
                                      color={team.color_primario}
                                      className={`w-full h-full drop-shadow-[0_4px_10px_rgba(0,0,0,0.4)] ${
                                        team.escudo_url ? 'hidden' : ''
                                      }`}
                                    />
                                  </div>
                                  <div>
                                    <div className="font-black text-white uppercase text-[13px] tracking-tight group-hover:text-cyan-400 transition-colors flex items-center gap-2">
                                      {team.nombre}
                                      {isMyTeam && (
                                        <span className="text-[7px] text-cyan-300 border border-cyan-500/40 px-1 rounded-sm">
                                          TU EQUIPO
                                        </span>
                                      )}
                                      {isPlayoffZone && (
                                        <span className="text-[7px] text-green-400 border border-green-500/30 px-1 rounded-sm">
                                          ASCENSO
                                        </span>
                                      )}
                                      {isDangerZone && (
                                        <span className="text-[7px] text-red-400 border border-red-500/30 px-1 rounded-sm">
                                          PLAYOUT
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-8 py-6 text-center font-mono text-slate-400 font-bold">
                                {team.pj || 0}
                              </td>
                              <td className="px-8 py-6 text-center font-mono text-green-500/80 font-bold">
                                {team.v || 0}
                              </td>
                              <td className="px-8 py-6 text-center font-mono text-red-500/80 font-bold">
                                {team.d || 0}
                              </td>
                              <td className="px-8 py-6 text-center font-mono font-black text-white text-xl">
                                {team.pts || 0}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {standings.length === 0 && (
                      <div className="p-12 text-center text-slate-500 text-sm font-bold uppercase tracking-widest">
                        No hay equipos en este grupo todavía.
                      </div>
                    )}
                  </div>
                ) : standings.length === 0 ? (
                  <div className="p-12 text-center text-slate-500 text-sm font-bold uppercase tracking-widest">
                    No hay equipos en este grupo todavía.
                  </div>
                ) : (
                  <section className="bg-slate-950/40 px-8 py-8 space-y-5">
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                      <div>
                        <h4 className="text-xl font-black uppercase tracking-tight text-white">
                          Cuadro de cruces
                        </h4>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-1">
                          Ascensos y descensos del grupo seleccionado
                        </p>
                      </div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {playoffsModeLabel}
                      </div>
                    </div>

                    {!regularSeasonComplete ? (
                      <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                          Cuadro bloqueado temporalmente
                        </p>
                        <p className="mt-3 text-sm text-slate-200 leading-relaxed">
                          La fase regular aún no ha terminado en {selectedGroupName}. En cuanto se jueguen todos
                          los partidos del grupo, aquí se abrirá el cuadro de cruces en formato playoff.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="rounded-[1.75rem] border border-cyan-500/15 bg-cyan-500/10 px-5 py-4">
                          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-300">
                            {hasOfficialPlayoffs ? 'Cuadro oficial detectado' : 'Vista provisional'}
                          </p>
                          <p className="mt-2 text-sm text-slate-200 leading-relaxed">
                            {hasOfficialPlayoffs
                              ? 'Los cruces ya existen en base de datos y se representan como bracket oficial.'
                              : 'Los cruces se proyectan a partir de la clasificación actual hasta que el sistema publique los partidos oficiales.'}
                          </p>
                        </div>

                        <BracketSection
                          title="Ascenso"
                          subtitle="Cruces 1º-4º"
                          tone="green"
                          status={promotionStatus}
                          semifinals={promotionSemifinalCards}
                          finalMatch={promotionFinalCard}
                        />

                        <BracketSection
                          title="Permanencia"
                          subtitle="Cruces 5º-8º"
                          tone="red"
                          status={relegationStatus}
                          semifinals={relegationSemifinalCards}
                          finalMatch={relegationFinalCard}
                        />
                      </>
                    )}
                  </section>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
