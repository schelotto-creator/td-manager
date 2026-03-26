'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Activity, Calendar, ChevronLeft, FastForward, Pause, Play, ShieldAlert } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  type EnginePlayer,
  type EngineTactics,
  type LineupPlayer,
  type MatchSimulationResult,
  type MatchEvent,
  type TeamGamePlan,
  generateMatchSimulation
} from '@/lib/match-engine';
import {
  DEFAULT_MATCH_SIMULATOR_SETTINGS,
  fetchMatchSimulatorSettings,
  type MatchSimulatorSettings
} from '@/lib/match-simulator-config';
import {
  fetchPositionOverallConfig,
  getDefaultPositionOverallConfig,
  type PositionOverallConfig
} from '@/lib/position-overall-config';

type TeamId = string;
type EscudoForma = 'circle' | 'square' | 'modern' | 'hexagon' | 'classic';

type TeamRow = {
  id: TeamId;
  nombre: string;
  color_primario?: string | null;
  escudo_forma?: EscudoForma | null;
  escudo_url?: string | null;
  rotations?: unknown;
  tactic_offense?: string | null;
  tactic_defense?: string | null;
  pj?: number | null;
  v?: number | null;
  d?: number | null;
  pts?: number | null;
};

type MatchRow = {
  id: number;
  jornada: number;
  fase?: string | null;
  played: boolean;
  match_date?: string | null;
  home_team_id: TeamId;
  away_team_id: TeamId;
  home_score: number;
  away_score: number;
  home_tactics?: unknown;
  away_tactics?: unknown;
  play_by_play?: unknown;
  simulated_play_by_play?: unknown;
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

type ReplayLog = {
  time: string;
  quarter: string;
  text: string;
  type: string;
  isHomeAction: boolean;
  teamColor: string;
};

const DEFAULT_PARTIALS = [
  { home: 0, away: 0 },
  { home: 0, away: 0 },
  { home: 0, away: 0 },
  { home: 0, away: 0 }
];

const parseMatchId = (raw: string | null) => {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const hasReachedOfficialTipoff = (matchDate?: string | null, reference = new Date()) => {
  if (!matchDate) return true;
  const parsed = new Date(matchDate);
  const time = parsed.getTime();
  if (!Number.isFinite(time)) return false;
  return time <= reference.getTime();
};

const formatClockFromSeconds = (totalSeconds: number) => {
  const safe = Math.max(0, Math.round(totalSeconds));
  const min = Math.floor(safe / 60).toString().padStart(2, '0');
  const sec = (safe % 60).toString().padStart(2, '0');
  return `${min}:${sec}`;
};

const buildAssignedQuartersMap = (tactics?: EngineTactics) => {
  const result: Record<number, string[]> = {};
  const quarterOrder: Array<{ key: 'q1' | 'q2' | 'q3' | 'q4'; label: string }> = [
    { key: 'q1', label: 'Q1' },
    { key: 'q2', label: 'Q2' },
    { key: 'q3', label: 'Q3' },
    { key: 'q4', label: 'Q4' }
  ];

  quarterOrder.forEach(({ key, label }) => {
    const rotation = tactics?.[key];
    if (!rotation) return;

    Object.values(rotation).forEach((rawId) => {
      const numericId = Number(rawId);
      if (!Number.isFinite(numericId) || numericId <= 0) return;
      if (!result[numericId]) result[numericId] = [];
      if (!result[numericId].includes(label)) result[numericId].push(label);
    });
  });

  return result;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toReplayLogFromEvent = (ev: MatchEvent): ReplayLog => ({
  time: ev.time || '00:00',
  quarter: ev.quarter || 'Q1',
  text: ev.text || 'Acción sin descripción',
  type: ev.type || 'info',
  isHomeAction: typeof ev.isHomeAction === 'boolean' ? ev.isHomeAction : true,
  teamColor: ev.teamColor || '#3b82f6'
});

const buildLogsFromEvents = (events: MatchEvent[]) => events.map(toReplayLogFromEvent).reverse();

const buildPartialsFromEvents = (events: MatchEvent[]) => {
  const partials = [...DEFAULT_PARTIALS];
  events.forEach((ev) => {
    const qIndex = Number((ev.quarter || 'Q1').replace(/\D/g, '')) - 1;
    if (Number.isNaN(qIndex) || qIndex < 0 || qIndex >= 4) return;
    partials[qIndex] = {
      home: Number(ev.home_q || 0),
      away: Number(ev.away_q || 0)
    };
  });
  return partials;
};

const getReplayEventsForDisplay = (match: MatchRow, reference = new Date()) => {
  const officialReplay = toReplayEvents(match.play_by_play);
  if (officialReplay.length > 0) return officialReplay;

  if (match.played || hasReachedOfficialTipoff(match.match_date, reference)) {
    return toReplayEvents(match.simulated_play_by_play);
  }

  return [] as MatchEvent[];
};

const buildReplaySnapshot = (match: MatchRow, quarterDurationSeconds: number, reference = new Date()) => {
  const replayEvents = getReplayEventsForDisplay(match, reference);
  const replayPartials = replayEvents.length > 0 ? buildPartialsFromEvents(replayEvents) : [...DEFAULT_PARTIALS];
  const firstEvent = replayEvents[0];

  return {
    replayEvents,
    replayPartials,
    homeLineup: firstEvent?.homeLineup || [],
    awayLineup: firstEvent?.awayLineup || [],
    homeScore: match.played && replayEvents.length === 0 ? Number(match.home_score || 0) : 0,
    awayScore: match.played && replayEvents.length === 0 ? Number(match.away_score || 0) : 0,
    displayedQuarter: 'Q1',
    displayedTime: formatClockFromSeconds(quarterDurationSeconds)
  };
};

type TeamSide = 'home' | 'away';

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
  stats_rows_in_payload?: number;
  stats_rows_saved?: number;
};

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
    (row) => row.points > 0 || row.rebounds > 0 || row.assists > 0 || row.turnovers > 0
  );
};

const pickLeaderForMetric = (
  rows: PlayerGameStat[],
  metric: 'points' | 'rebounds' | 'assists' | 'efficiency'
) => {
  const sorted = [...rows].sort((a, b) => {
    const metricDiff = Number(b[metric] || 0) - Number(a[metric] || 0);
    if (metricDiff !== 0) return metricDiff;
    const efficiencyDiff = Number(b.efficiency || 0) - Number(a.efficiency || 0);
    if (efficiencyDiff !== 0) return efficiencyDiff;
    const pointsDiff = Number(b.points || 0) - Number(a.points || 0);
    if (pointsDiff !== 0) return pointsDiff;
    return Number(a.player_id) - Number(b.player_id);
  });

  const top = sorted[0];
  if (!top || Number(top[metric] || 0) <= 0) return null;
  return top;
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

const persistPlayerStats = async (matchId: number, rows: PlayerGameStat[]) => {
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
    const insertRes = await supabase.from('player_stats').insert(payload);
    if (!insertRes.error) return { ok: true as const };
    lastError = toErrorText(insertRes.error);

    const duplicate = lastError.toLowerCase().includes('duplicate key');
    if (!duplicate) continue;

    const conflictKeys = [`${template.match},${template.player}`, `${template.player},${template.match}`];
    for (const onConflict of conflictKeys) {
      const upsertRes = await supabase.from('player_stats').upsert(payload, { onConflict });
      if (!upsertRes.error) return { ok: true as const };
      lastError = toErrorText(upsertRes.error);
    }
  }

  // Fallback: algunos esquemas almacenan stats agregadas por jugador y no por partido.
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
    const fallbackRes = await supabase.from('player_stats').upsert(aggregatedPayload, { onConflict });
    if (!fallbackRes.error) return { ok: true as const };
    lastError = toErrorText(fallbackRes.error);
  }

  return { ok: false as const, error: lastError };
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

const extractTacticsRotations = (source: unknown): EngineTactics | undefined => {
  const candidate = isRecord(source)
    ? (isRecord(source.rotations) ? source.rotations : source)
    : source;

  if (!isRecord(candidate)) return undefined;
  const result: EngineTactics = {};

  (['q1', 'q2', 'q3', 'q4'] as const).forEach((q) => {
    const quarter = candidate[q];
    if (!isRecord(quarter)) return;
    const mapped: Record<string, number | null> = {};
    for (const [slot, value] of Object.entries(quarter)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        mapped[slot] = value;
      } else if (value === null) {
        mapped[slot] = null;
      }
    }
    if (Object.keys(mapped).length > 0) result[q] = mapped;
  });

  return Object.keys(result).length > 0 ? result : undefined;
};

const extractTeamGamePlan = (matchTactics: unknown, fallbackTeam?: TeamRow | null): TeamGamePlan => {
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

const toReplayEvents = (raw: unknown): MatchEvent[] => {
  if (typeof raw === 'string') {
    try {
      return toReplayEvents(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry): MatchEvent | null => {
      if (!isRecord(entry)) return null;
      const quarter = typeof entry.quarter === 'string' ? entry.quarter : 'Q1';
      const time =
        typeof entry.time === 'string'
          ? entry.time
          : typeof entry.minute === 'number'
            ? `${String(entry.minute).padStart(2, '0')}:00`
            : '10:00';
      const homeScore = typeof entry.home_score === 'number' ? entry.home_score : 0;
      const awayScore = typeof entry.away_score === 'number' ? entry.away_score : 0;
      const homeQ = typeof entry.home_q === 'number' ? entry.home_q : 0;
      const awayQ = typeof entry.away_q === 'number' ? entry.away_q : 0;

      return {
        quarter,
        time,
        home_score: homeScore,
        away_score: awayScore,
        home_q: homeQ,
        away_q: awayQ,
        type:
          entry.type === 'basket' || entry.type === 'turnover' || entry.type === 'fail' || entry.type === 'info'
            ? entry.type
            : 'info',
        text: typeof entry.text === 'string' ? entry.text : 'Acción sin descripción',
        isHomeAction: typeof entry.isHomeAction === 'boolean' ? entry.isHomeAction : true,
        teamColor: typeof entry.teamColor === 'string' ? entry.teamColor : '#3b82f6',
        attacker: typeof entry.attacker === 'string' ? entry.attacker : undefined,
        assister: typeof entry.assister === 'string' ? entry.assister : undefined,
        rebounder: typeof entry.rebounder === 'string' ? entry.rebounder : undefined,
        points: typeof entry.points === 'number' ? entry.points : undefined,
        homeLineup: Array.isArray(entry.homeLineup) ? (entry.homeLineup as LineupPlayer[]) : [],
        awayLineup: Array.isArray(entry.awayLineup) ? (entry.awayLineup as LineupPlayer[]) : []
      };
    })
    .filter(Boolean) as MatchEvent[];
};

function EscudoSVG({
  forma,
  color,
  className
}: {
  forma?: EscudoForma | null;
  color?: string | null;
  className?: string;
}) {
  const fill = color || '#06b6d4';
  switch (forma) {
    case 'circle':
      return <svg viewBox="0 0 24 24" fill={fill} className={className}><circle cx="12" cy="12" r="10" /></svg>;
    case 'square':
      return <svg viewBox="0 0 24 24" fill={fill} className={className}><rect x="3" y="3" width="18" height="18" rx="2" /></svg>;
    case 'modern':
      return <svg viewBox="0 0 24 24" fill={fill} className={className}><path d="M5 3h14a2 2 0 012 2v10a8 8 0 01-8 8 8 8 0 01-8-8V5a2 2 0 012-2z" /></svg>;
    case 'hexagon':
      return <svg viewBox="0 0 24 24" fill={fill} className={className}><path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" /></svg>;
    default:
      return <svg viewBox="0 0 24 24" fill={fill} className={className}><circle cx="12" cy="12" r="10" /></svg>;
  }
}

const TeamLogo = ({ team, className = 'w-full h-full' }: { team: TeamRow | null; className?: string }) => {
  if (!team) return <div className={`bg-slate-800 rounded-full ${className}`}></div>;
  if (team.escudo_url) return <img src={team.escudo_url} alt={team.nombre} className={`object-contain ${className}`} />;
  return <EscudoSVG forma={team.escudo_forma} color={team.color_primario} className={className} />;
};

function MatchEnginePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMatchId = parseMatchId(searchParams.get('matchId'));

  const [myClubId, setMyClubId] = useState<string | null>(null);
  const [currentMatch, setCurrentMatch] = useState<MatchRow | null>(null);
  const [homeTeam, setHomeTeam] = useState<TeamRow | null>(null);
  const [awayTeam, setAwayTeam] = useState<TeamRow | null>(null);
  const [homeRoster, setHomeRoster] = useState<EnginePlayer[]>([]);
  const [awayRoster, setAwayRoster] = useState<EnginePlayer[]>([]);
  const [homeTactics, setHomeTactics] = useState<EngineTactics | undefined>(undefined);
  const [awayTactics, setAwayTactics] = useState<EngineTactics | undefined>(undefined);

  const [matchEvents, setMatchEvents] = useState<MatchEvent[]>([]);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [displayedHomeScore, setDisplayedHomeScore] = useState(0);
  const [displayedAwayScore, setDisplayedAwayScore] = useState(0);
  const [displayedQuarter, setDisplayedQuarter] = useState('Q1');
  const [displayedTime, setDisplayedTime] = useState(formatClockFromSeconds(DEFAULT_MATCH_SIMULATOR_SETTINGS.quarterDurationSeconds));
  const [displayedPartials, setDisplayedPartials] = useState([...DEFAULT_PARTIALS]);
  const [displayedHomeLineup, setDisplayedHomeLineup] = useState<LineupPlayer[]>([]);
  const [displayedAwayLineup, setDisplayedAwayLineup] = useState<LineupPlayer[]>([]);
  const [logs, setLogs] = useState<ReplayLog[]>([]);
  const [simulatorSettings, setSimulatorSettings] = useState<MatchSimulatorSettings>(DEFAULT_MATCH_SIMULATOR_SETTINGS);
  const [positionOverallConfig, setPositionOverallConfig] = useState<PositionOverallConfig>(getDefaultPositionOverallConfig());

  const [loading, setLoading] = useState(true);
  const [persisting, setPersisting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [speed, setSpeed] = useState(1);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);
  const finalPartialsRef = useRef([...DEFAULT_PARTIALS]);
  const homeAssignedQuartersMap = useMemo(() => buildAssignedQuartersMap(homeTactics), [homeTactics]);
  const awayAssignedQuartersMap = useMemo(() => buildAssignedQuartersMap(awayTactics), [awayTactics]);
  const playersById = useMemo(() => {
    const map = new Map<number, EnginePlayer>();
    [...homeRoster, ...awayRoster].forEach((player) => map.set(player.id, player));
    return map;
  }, [homeRoster, awayRoster]);
  const teamMetaById = useMemo(() => {
    const map = new Map<TeamId, { name: string; color: string }>();
    if (homeTeam) map.set(homeTeam.id, { name: homeTeam.nombre, color: homeTeam.color_primario || '#06b6d4' });
    if (awayTeam) map.set(awayTeam.id, { name: awayTeam.nombre, color: awayTeam.color_primario || '#ef4444' });
    return map;
  }, [homeTeam, awayTeam]);
  const eventsForLeaderBoard = useMemo(() => {
    if (matchEvents.length === 0) return [] as MatchEvent[];
    if (currentEventIndex <= 0) return currentMatch?.played ? matchEvents : [];
    return matchEvents.slice(0, Math.min(currentEventIndex, matchEvents.length));
  }, [matchEvents, currentEventIndex, currentMatch?.played]);
  const playerStatsForLeaderBoard = useMemo(() => {
    if (!currentMatch || eventsForLeaderBoard.length === 0 || homeRoster.length === 0 || awayRoster.length === 0) {
      return [] as PlayerGameStat[];
    }
    return buildPlayerGameStatsFromEvents(
      eventsForLeaderBoard,
      homeRoster,
      awayRoster,
      currentMatch.home_team_id,
      currentMatch.away_team_id
    );
  }, [eventsForLeaderBoard, homeRoster, awayRoster, currentMatch]);
  const matchLeaders = useMemo(() => {
    const definitions = [
      { key: 'points', label: 'Anotación', suffix: 'PTS' },
      { key: 'rebounds', label: 'Rebotes', suffix: 'REB' },
      { key: 'assists', label: 'Asistencias', suffix: 'AST' },
      { key: 'efficiency', label: 'Valoración', suffix: 'VAL' }
    ] as const;

    return definitions.map((def) => {
      const leader = pickLeaderForMetric(playerStatsForLeaderBoard, def.key);
      if (!leader) {
        return {
          label: def.label,
          suffix: def.suffix,
          value: 0,
          name: 'Sin datos',
          teamName: '-',
          teamColor: '#475569'
        };
      }

      const player = playersById.get(leader.player_id);
      const teamMeta = teamMetaById.get(leader.team_id);

      return {
        label: def.label,
        suffix: def.suffix,
        value: Number(leader[def.key] || 0),
        name: player?.name || `#${leader.player_id}`,
        teamName: teamMeta?.name || String(leader.team_id),
        teamColor: teamMeta?.color || '#475569'
      };
    });
  }, [playerStatsForLeaderBoard, playersById, teamMetaById]);

  const userInCurrentMatch = useMemo(() => {
    if (!currentMatch || !myClubId) return false;
    return currentMatch.home_team_id === myClubId || currentMatch.away_team_id === myClubId;
  }, [currentMatch, myClubId]);

  const canGenerateSimulation = Boolean(currentMatch && !currentMatch.played && userInCurrentMatch);
  const waitingAutoSimulation = Boolean(currentMatch && !currentMatch.played && matchEvents.length === 0);
  const replayReadyBeforeFinalization = Boolean(currentMatch && !currentMatch.played && matchEvents.length > 0);
  const scheduledKickoffLabel = useMemo(() => {
    if (!currentMatch?.match_date) return null;
    const parsed = new Date(currentMatch.match_date);
    if (Number.isNaN(parsed.getTime())) return null;
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
  }, [currentMatch?.match_date]);

  useEffect(() => {
    const loadContext = async () => {
      setLoading(true);
      setLoadError(null);
      setWarning(null);

      try {
        const [loadedSettings, loadedPositionConfig] = await Promise.all([
          fetchMatchSimulatorSettings(supabase),
          fetchPositionOverallConfig(supabase)
        ]);
        setSimulatorSettings(loadedSettings);
        setPositionOverallConfig(loadedPositionConfig);

        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes.user;
        if (!user) {
          router.push('/login');
          return;
        }

        const { data: myClubData } = await supabase
          .from('clubes')
          .select('id')
          .eq('owner_id', user.id)
          .maybeSingle();

        if (!myClubData) {
          setLoadError('No tienes club asignado.');
          return;
        }
        const myTeamId = String(myClubData.id);
        setMyClubId(myTeamId);

        let matchData: MatchRow | null = null;
        if (requestedMatchId) {
          const { data } = await supabase.from('matches').select('*').eq('id', requestedMatchId).maybeSingle();
          matchData = (data as MatchRow | null) || null;
        } else {
          const { data: pendingData } = await supabase
            .from('matches')
            .select('*')
            .or(`home_team_id.eq.${myTeamId},away_team_id.eq.${myTeamId}`)
            .eq('played', false)
            .order('jornada', { ascending: true })
            .limit(1);

          if (pendingData && pendingData[0]) {
            matchData = pendingData[0] as MatchRow;
          } else {
            const { data: playedData } = await supabase
              .from('matches')
              .select('*')
              .or(`home_team_id.eq.${myTeamId},away_team_id.eq.${myTeamId}`)
              .eq('played', true)
              .order('jornada', { ascending: false })
              .limit(1);
            if (playedData && playedData[0]) matchData = playedData[0] as MatchRow;
          }
        }

        if (!matchData) {
          setLoadError('No hay partidos disponibles para mostrar.');
          return;
        }
        setCurrentMatch(matchData);

        const { data: teamsData, error: teamsError } = await supabase
          .from('clubes')
          .select('*')
          .in('id', [matchData.home_team_id, matchData.away_team_id]);

        if (teamsError || !teamsData || teamsData.length < 2) {
          setLoadError('No se pudieron cargar los equipos del partido.');
          return;
        }

        const home = teamsData.find((team) => String(team.id) === String(matchData.home_team_id)) as TeamRow | undefined;
        const away = teamsData.find((team) => String(team.id) === String(matchData.away_team_id)) as TeamRow | undefined;

        if (!home || !away) {
          setLoadError('Información de equipos incompleta.');
          return;
        }

        setHomeTeam(home);
        setAwayTeam(away);

        const { data: rosterRows, error: rosterError } = await supabase
          .from('players')
          .select(
            'id, name, position, overall, shooting_2pt, shooting_3pt, defense, passing, rebounding, dribbling, speed, stamina, experience, forma, team_id'
          )
          .in('team_id', [matchData.home_team_id, matchData.away_team_id]);

        if (rosterError || !rosterRows) {
          setLoadError('No se pudieron cargar las plantillas.');
          return;
        }

        const homePlayers = (rosterRows as RawPlayerRow[]).filter((p) => String(p.team_id) === String(matchData.home_team_id));
        const awayPlayers = (rosterRows as RawPlayerRow[]).filter((p) => String(p.team_id) === String(matchData.away_team_id));
        setHomeRoster(homePlayers.map(toEnginePlayer));
        setAwayRoster(awayPlayers.map(toEnginePlayer));

        const homeGamePlan = extractTeamGamePlan(matchData.home_tactics, home);
        const awayGamePlan = extractTeamGamePlan(matchData.away_tactics, away);
        setHomeTactics(homeGamePlan.rotations || undefined);
        setAwayTactics(awayGamePlan.rotations || undefined);

        const replaySnapshot = buildReplaySnapshot(matchData, loadedSettings.quarterDurationSeconds);
        setMatchEvents(replaySnapshot.replayEvents);
        finalPartialsRef.current = replaySnapshot.replayPartials;
        setDisplayedPartials(replaySnapshot.replayPartials);
        setDisplayedHomeLineup(replaySnapshot.homeLineup);
        setDisplayedAwayLineup(replaySnapshot.awayLineup);
        setDisplayedHomeScore(replaySnapshot.homeScore);
        setDisplayedAwayScore(replaySnapshot.awayScore);
        setDisplayedQuarter(replaySnapshot.displayedQuarter);
        setDisplayedTime(replaySnapshot.displayedTime);
        setCurrentEventIndex(0);
        setLogs([]);
        setIsLive(false);
        setIsFinished(false);
        if (replaySnapshot.replayEvents.length > 0) {
          setLoadError(null);
        }
      } catch (error) {
        console.error(error);
        setLoadError('Error cargando el partido.');
      } finally {
        setLoading(false);
      }
    };

    void loadContext();
  }, [requestedMatchId, router]);

  useEffect(() => {
    if (!currentMatch || currentMatch.played || matchEvents.length > 0 || persisting) return;

    const pollMatch = async () => {
      const { data, error } = await supabase.from('matches').select('*').eq('id', currentMatch.id).maybeSingle();
      if (error || !data) return;

      const refreshedMatch = data as MatchRow;
      const replaySnapshot = buildReplaySnapshot(refreshedMatch, simulatorSettings.quarterDurationSeconds);
      if (!refreshedMatch.played && replaySnapshot.replayEvents.length === 0) return;

      setCurrentMatch(refreshedMatch);
      setMatchEvents(replaySnapshot.replayEvents);
      finalPartialsRef.current = replaySnapshot.replayPartials;
      setDisplayedPartials(replaySnapshot.replayPartials);
      setDisplayedHomeLineup(replaySnapshot.homeLineup);
      setDisplayedAwayLineup(replaySnapshot.awayLineup);
      setDisplayedHomeScore(replaySnapshot.homeScore);
      setDisplayedAwayScore(replaySnapshot.awayScore);
      setDisplayedQuarter(replaySnapshot.displayedQuarter);
      setDisplayedTime(replaySnapshot.displayedTime);
      setCurrentEventIndex(0);
      setLogs([]);
      setIsLive(false);
      setIsFinished(false);
      if (replaySnapshot.replayEvents.length > 0 || refreshedMatch.played) {
        setLoadError(null);
      }
    };

    void pollMatch();
    const interval = window.setInterval(() => {
      void pollMatch();
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [currentMatch, matchEvents.length, persisting, simulatorSettings.quarterDurationSeconds]);

  const applyRegularSeasonStandings = async (match: MatchRow, finalHome: number, finalAway: number) => {
    if ((match.fase || 'REGULAR').toUpperCase() !== 'REGULAR') return;

    const { data: clubs, error } = await supabase
      .from('clubes')
      .select('id, pj, v, d, pts')
      .in('id', [match.home_team_id, match.away_team_id]);

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
      supabase.from('clubes').update(homeUpdate).eq('id', homeClub.id),
      supabase.from('clubes').update(awayUpdate).eq('id', awayClub.id)
    ]);

    if (homeErr || awayErr) {
      throw new Error(homeErr?.message || awayErr?.message || 'No se pudo guardar la clasificación.');
    }
  };

  const fetchPersistedMatch = async (matchId: number) => {
    const { data, error } = await supabase.from('matches').select('*').eq('id', matchId).maybeSingle();
    if (error || !data) {
      throw new Error(error?.message || 'No se pudo recuperar el partido tras guardarlo.');
    }
    return data as MatchRow;
  };

  const finalizeMatchPersistence = async (match: MatchRow, simulation: MatchSimulationResult) => {
    const gameStatsRows = buildPlayerGameStatsFromEvents(
      simulation.events,
      homeRoster,
      awayRoster,
      match.home_team_id,
      match.away_team_id
    );

    const { data: rpcData, error: rpcError } = await supabase.rpc('finalize_match_transaction', {
      p_match_id: match.id,
      p_home_score: simulation.finalScore.home,
      p_away_score: simulation.finalScore.away,
      p_play_by_play: simulation.events,
      p_player_stats: gameStatsRows
    });

    if (rpcError) {
      if (!isFinalizeMatchRpcMissing(rpcError)) {
        throw new Error(`No se pudo cerrar el partido con transacción: ${toErrorText(rpcError)}`);
      }

      const { data: updatedMatch, error: matchUpdateError } = await supabase
        .from('matches')
        .update({
          played: true,
          home_score: simulation.finalScore.home,
          away_score: simulation.finalScore.away,
          play_by_play: simulation.events
        })
        .eq('id', match.id)
        .select('*')
        .single();

      if (matchUpdateError || !updatedMatch) {
        throw new Error(matchUpdateError?.message || 'No se pudo guardar el resultado del partido.');
      }

      const fallbackWarnings = ['No existe la RPC transaccional en Supabase. Se usó guardado legacy.'];
      const statsSave = await persistPlayerStats(match.id, gameStatsRows);
      if (!statsSave.ok) {
        fallbackWarnings.push(`Stats de jugador no guardadas: ${statsSave.error}`);
      }

      await applyRegularSeasonStandings(match, simulation.finalScore.home, simulation.finalScore.away);

      return {
        updatedMatch: updatedMatch as MatchRow,
        warning: fallbackWarnings.join(' ')
      };
    }

    const rpcPayload = isRecord(rpcData) ? (rpcData as FinalizeMatchRpcResponse) : {};
    const status = typeof rpcPayload.status === 'string' ? rpcPayload.status : 'ok';
    const warning = typeof rpcPayload.warning === 'string' ? rpcPayload.warning : null;

    if (status !== 'ok' && status !== 'already_played') {
      throw new Error(`Respuesta inesperada al cerrar partido: ${status}`);
    }

    const updatedMatch = await fetchPersistedMatch(match.id);
    if (status === 'already_played') {
      return {
        updatedMatch,
        warning:
          warning ||
          'El partido ya estaba finalizado por otro proceso. Se mostró el resultado ya guardado.'
      };
    }

    return { updatedMatch, warning };
  };

  const prepareSimulationIfNeeded = async () => {
    if (!currentMatch || !homeTeam || !awayTeam) return false;
    if (matchEvents.length > 0) return true;

    if (currentMatch.played) {
      setLoadError('Este partido no tiene replay guardado.');
      return false;
    }
    if (!canGenerateSimulation) {
      setLoadError('Solo puedes simular partidos de tu equipo.');
      return false;
    }
    if (homeRoster.length < 5 || awayRoster.length < 5) {
      setLoadError('Plantillas insuficientes para simular el partido.');
      return false;
    }

    setPersisting(true);
    try {
      const result = generateMatchSimulation({
        homeRoster,
        awayRoster,
        homeTactics,
        awayTactics,
        homeGamePlan: extractTeamGamePlan(currentMatch.home_tactics, homeTeam),
        awayGamePlan: extractTeamGamePlan(currentMatch.away_tactics, awayTeam),
        homeTeamName: homeTeam.nombre,
        awayTeamName: awayTeam.nombre,
        homeTeamColor: homeTeam.color_primario || '#3b82f6',
        awayTeamColor: awayTeam.color_primario || '#ef4444',
        settings: simulatorSettings,
        positionOverallConfig
      });

      setMatchEvents(result.events);
      finalPartialsRef.current = result.partials;
      setDisplayedPartials(result.partials);
      setDisplayedHomeLineup(result.finalHomeLineup);
      setDisplayedAwayLineup(result.finalAwayLineup);

      const persistence = await finalizeMatchPersistence(currentMatch, result);
      setCurrentMatch(persistence.updatedMatch);
      setWarning(persistence.warning || null);
      setDisplayedHomeScore(0);
      setDisplayedAwayScore(0);
      setDisplayedQuarter('Q1');
      setDisplayedTime(formatClockFromSeconds(simulatorSettings.quarterDurationSeconds));
      setCurrentEventIndex(0);
      setLogs([]);
      setIsFinished(false);
      setLoadError(null);
      return true;
    } catch (error) {
      console.error(error);
      setLoadError(error instanceof Error ? error.message : 'No se pudo simular este partido.');
      return false;
    } finally {
      setPersisting(false);
    }
  };

  useEffect(() => {
    if (!isLive || matchEvents.length === 0) return;

    playTimerRef.current = setInterval(() => {
      if (currentEventIndex >= matchEvents.length) {
        setIsLive(false);
        setIsFinished(true);
        return;
      }

      const ev = matchEvents[currentEventIndex];
      setDisplayedHomeScore(ev.home_score);
      setDisplayedAwayScore(ev.away_score);
      setDisplayedQuarter(ev.quarter || 'Q1');
      setDisplayedTime(ev.time || '00:00');
      if (ev.homeLineup?.length) setDisplayedHomeLineup(ev.homeLineup);
      if (ev.awayLineup?.length) setDisplayedAwayLineup(ev.awayLineup);

      const qIndex = Number((ev.quarter || 'Q1').replace(/\D/g, '')) - 1;
      if (!Number.isNaN(qIndex) && qIndex >= 0 && qIndex < 4) {
        setDisplayedPartials((prev) => {
          const next = [...prev];
          next[qIndex] = { home: ev.home_q || 0, away: ev.away_q || 0 };
          return next;
        });
      }

      setLogs((prev) => [
        {
          time: ev.time || '00:00',
          quarter: ev.quarter || 'Q1',
          text: ev.text || 'Acción sin descripción',
          type: ev.type || 'info',
          isHomeAction: ev.isHomeAction,
          teamColor: ev.teamColor || '#3b82f6'
        },
        ...prev
      ]);
      setCurrentEventIndex((prev) => prev + 1);
    }, 1500 / speed);

    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isLive, speed, currentEventIndex, matchEvents]);

  const handleStartPause = async () => {
    if (isLive) {
      setIsLive(false);
      return;
    }
    if (matchEvents.length === 0) {
      if (currentMatch?.played) {
        setLoadError('Este partido no tiene replay guardado.');
      } else {
        setLoadError(
          `Partido pendiente de simulación automática${
            scheduledKickoffLabel ? ` (${scheduledKickoffLabel})` : ''
          }.`
        );
      }
      return;
    }
    setLoadError(null);
    setIsLive(true);
  };

  const fastForwardToEnd = () => {
    if (matchEvents.length === 0) return;
    setIsLive(false);
    const last = matchEvents[matchEvents.length - 1];
    setDisplayedHomeScore(last.home_score);
    setDisplayedAwayScore(last.away_score);
    setDisplayedQuarter(last.quarter || 'Q4');
    setDisplayedTime(last.time || '00:00');
    const resolvedPartials = buildPartialsFromEvents(matchEvents);
    finalPartialsRef.current = resolvedPartials;
    setDisplayedPartials(resolvedPartials);
    if (last.homeLineup?.length) setDisplayedHomeLineup(last.homeLineup);
    if (last.awayLineup?.length) setDisplayedAwayLineup(last.awayLineup);
    setLogs(buildLogsFromEvents(matchEvents));
    setCurrentEventIndex(matchEvents.length);
    setIsFinished(true);
  };

  const getPlayerPositionOnCourt = (position: LineupPlayer['position'], teamSide: 'home' | 'away') => {
    const homeMap: Record<LineupPlayer['position'], { x: number; y: number }> = {
      Base: { x: 18, y: 50 },
      Escolta: { x: 30, y: 24 },
      Alero: { x: 30, y: 76 },
      'Ala-Pívot': { x: 42, y: 36 },
      'Pívot': { x: 42, y: 64 }
    };
    const awayMap: Record<LineupPlayer['position'], { x: number; y: number }> = {
      Base: { x: 82, y: 50 },
      Escolta: { x: 70, y: 24 },
      Alero: { x: 70, y: 76 },
      'Ala-Pívot': { x: 58, y: 36 },
      'Pívot': { x: 58, y: 64 }
    };
    const point = teamSide === 'home' ? homeMap[position] : awayMap[position];
    return { left: `${point.x}%`, top: `${point.y}%` };
  };

  const getOvrColor = (ovr: number) => {
    if (ovr >= 85) return 'bg-yellow-500 text-slate-900 border-yellow-300';
    if (ovr >= 75) return 'bg-green-500 text-slate-900 border-green-300';
    if (ovr >= 65) return 'bg-blue-500 text-white border-blue-400';
    return 'bg-slate-600 text-white border-slate-500';
  };

  const renderPlayerOnCourt = (
    player: LineupPlayer,
    teamSide: 'home' | 'away',
    color: string,
    assignedQuarters: string[] = []
  ) => {
    const posStyle = getPlayerPositionOnCourt(player.position, teamSide);
    const energy = Math.max(0, Math.min(100, Math.round(player.energy ?? 100)));
    const energyColor = energy >= 70 ? 'bg-emerald-500' : energy >= 40 ? 'bg-amber-400' : 'bg-red-500';

    return (
      <div
        key={`${player.id}-${teamSide}`}
        className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-30 transition-all duration-500"
        style={posStyle}
      >
        <div
          className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-black text-xs md:text-sm border-2 shadow-[0_0_18px_rgba(0,0,0,0.45)] ${getOvrColor(player.overall)}`}
          style={{ borderColor: color }}
        >
          {player.overall}
        </div>
        <div className="mt-1 min-w-[94px] md:min-w-[112px] bg-slate-950/95 px-2 py-1 rounded-lg border border-slate-700/80 shadow-lg text-white">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] md:text-[9px] uppercase tracking-wide text-cyan-300 font-black leading-none">{player.position}</span>
            <span className="text-[8px] md:text-[9px] font-black text-slate-200">E {energy}%</span>
          </div>
          <div className="text-[9px] md:text-[10px] font-bold truncate mt-0.5">{player.name.split(' ').pop()}</div>
          <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wide truncate">
            Q: {assignedQuarters.length > 0 ? assignedQuarters.join(' · ') : '-'}
          </div>
          <div className="mt-1 h-1.5 md:h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
            <div className={`h-full transition-[width] duration-500 ${energyColor}`} style={{ width: `${energy}%` }}></div>
          </div>
        </div>
      </div>
    );
  };

  const quarterTotals = useMemo(() => displayedPartials, [displayedPartials]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <Activity className="text-cyan-500 animate-pulse w-12 h-12 mb-4" />
        <p className="text-slate-500 font-mono text-xs uppercase tracking-widest">Cargando Partido...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 flex flex-col items-center relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-6xl mb-4">
        <Link href="/calendar" className="text-slate-500 hover:text-white flex items-center gap-2 text-sm font-bold uppercase tracking-widest transition-colors w-fit">
          <ChevronLeft size={16} /> Volver al Calendario
        </Link>
      </div>

      <div className="w-full max-w-6xl mb-6 flex flex-wrap justify-between items-center gap-3 bg-slate-900 p-4 rounded-2xl border border-white/5">
        <div className="flex items-center gap-3 text-cyan-400">
          <Calendar size={18} />
          <span className="font-black text-sm uppercase tracking-widest">
            Jornada {currentMatch?.jornada || '-'} {currentMatch?.fase ? `• ${String(currentMatch.fase).toUpperCase()}` : ''}
          </span>
        </div>
        <div className="flex gap-2">
          {[1, 3, 6].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors ${speed === s ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              x{s}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full max-w-6xl bg-slate-900 border border-white/5 p-6 rounded-[2rem] mb-6 shadow-2xl z-10">
        <div className="flex items-center justify-center gap-4 md:gap-8">
          <div className="w-16 h-16 md:w-20 md:h-20"><TeamLogo team={homeTeam} /></div>
          <div className="text-center min-w-[280px] px-4 py-3 rounded-2xl border border-white/10 bg-slate-950/80">
            <div className="text-[10px] font-black uppercase tracking-widest text-cyan-400">{displayedQuarter}</div>
            <div className="flex items-baseline justify-center gap-4 mt-1">
              <span className="text-5xl md:text-6xl font-black font-mono text-white">{displayedHomeScore}</span>
              <span className="text-3xl md:text-4xl font-black font-mono text-slate-500">{displayedTime}</span>
              <span className="text-5xl md:text-6xl font-black font-mono text-white">{displayedAwayScore}</span>
            </div>
          </div>
          <div className="w-16 h-16 md:w-20 md:h-20"><TeamLogo team={awayTeam} /></div>
        </div>
      </div>

      <div className="w-full max-w-6xl mb-6 h-[430px] bg-slate-900 border border-slate-700 rounded-2xl relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-20">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1px] h-full bg-white"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-36 h-36 border border-white rounded-full"></div>
          <div className="absolute top-20 left-8 w-44 h-56 border border-white rounded-xl"></div>
          <div className="absolute top-20 right-8 w-44 h-56 border border-white rounded-xl"></div>
        </div>
        {displayedHomeLineup.map((player) =>
          renderPlayerOnCourt(
            player,
            'home',
            homeTeam?.color_primario || '#06b6d4',
            homeAssignedQuartersMap[player.id] || []
          )
        )}
        {displayedAwayLineup.map((player) =>
          renderPlayerOnCourt(
            player,
            'away',
            awayTeam?.color_primario || '#ef4444',
            awayAssignedQuartersMap[player.id] || []
          )
        )}
      </div>

      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 mb-6">
        <div>
          <div className="flex gap-3 mb-3">
            <button
              onClick={handleStartPause}
              disabled={persisting || !currentMatch || waitingAutoSimulation}
              className={`flex-1 py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all shadow-lg active:scale-95 ${isLive ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40 disabled:hover:bg-cyan-600'}`}
            >
              {persisting ? (
                <>
                  <Activity className="inline mr-2 animate-spin" size={16} />
                  Simulando...
                </>
              ) : isLive ? (
                <>
                  <Pause className="inline mr-2" size={16} />
                  Pausar
                </>
              ) : (
                <>
                  <Play className="inline mr-2" size={16} />
                  {waitingAutoSimulation
                    ? 'Programado (Auto)'
                    : currentEventIndex === 0
                      ? replayReadyBeforeFinalization
                        ? 'Iniciar Directo'
                        : 'Iniciar Repetición'
                      : 'Reanudar'}
                </>
              )}
            </button>

            {!isFinished && matchEvents.length > 0 && (
              <button
                onClick={fastForwardToEnd}
                className="px-6 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center gap-2"
              >
                <FastForward size={16} /> Final
              </button>
            )}
          </div>

          <div className="h-[320px] bg-black/40 rounded-2xl border border-white/5 overflow-y-auto p-4 custom-scrollbar">
            {logs.map((log, i) => (
              <div key={`${log.time}-${i}`} className="flex items-start gap-3 py-2 border-b border-white/5">
                <span className="font-mono text-[10px] uppercase text-slate-600 min-w-[52px]">{log.quarter} {log.time}</span>
                <span className="text-sm text-white whitespace-pre-line">{log.text}</span>
              </div>
            ))}
            {logs.length === 0 && (
              <p className="text-xs uppercase tracking-widest text-slate-500 font-bold py-6 text-center">
                {replayReadyBeforeFinalization
                  ? 'Pulsa iniciar para ver el partido en directo.'
                  : currentMatch?.played
                  ? 'Pulsa iniciar para ver la repetición.'
                  : `Partido pendiente de simulación automática${scheduledKickoffLabel ? ` (${scheduledKickoffLabel})` : ''}.`}
              </p>
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-white/5 rounded-2xl p-4">
          <h3 className="text-xs uppercase tracking-widest text-cyan-400 font-black mb-3">Parciales</h3>
          <div className="grid grid-cols-[1fr_repeat(5,minmax(0,1fr))] gap-2 text-[10px] uppercase font-black tracking-widest text-slate-500">
            <span>Equipo</span>
            <span className="text-center">Q1</span>
            <span className="text-center">Q2</span>
            <span className="text-center">Q3</span>
            <span className="text-center">Q4</span>
            <span className="text-center text-cyan-400">Tot</span>
          </div>
          <div className="mt-2 space-y-2 text-sm">
            <div className="grid grid-cols-[1fr_repeat(5,minmax(0,1fr))] gap-2 items-center">
              <span className="font-bold truncate">{homeTeam?.nombre || 'Local'}</span>
              {quarterTotals.map((q, idx) => <span key={`h-${idx}`} className="text-center font-mono">{q.home}</span>)}
              <span className="text-center font-mono text-cyan-400 font-black">{displayedHomeScore}</span>
            </div>
            <div className="grid grid-cols-[1fr_repeat(5,minmax(0,1fr))] gap-2 items-center">
              <span className="font-bold truncate">{awayTeam?.nombre || 'Visitante'}</span>
              {quarterTotals.map((q, idx) => <span key={`a-${idx}`} className="text-center font-mono">{q.away}</span>)}
              <span className="text-center font-mono text-cyan-400 font-black">{displayedAwayScore}</span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/10">
            <h3 className="text-xs uppercase tracking-widest text-cyan-400 font-black mb-3">Líderes</h3>
            <div className="space-y-2">
              {matchLeaders.map((leader) => (
                <div key={leader.label} className="rounded-xl border border-white/5 bg-slate-950/70 px-3 py-2">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-slate-500 font-black">
                    <span>{leader.label}</span>
                    <span className="font-mono text-cyan-300">{leader.value} {leader.suffix}</span>
                  </div>
                  <div className="text-sm font-bold mt-1 truncate" style={{ color: leader.teamColor }}>
                    {leader.name}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 truncate">
                    {leader.teamName}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="w-full max-w-6xl mb-4 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/10 text-red-300 text-xs uppercase tracking-widest font-black flex items-center gap-2">
          <ShieldAlert size={14} />
          {loadError}
        </div>
      )}

      {warning && (
        <div className="w-full max-w-6xl mb-4 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-300 text-xs uppercase tracking-widest font-black">
          {warning}
        </div>
      )}

      {currentMatch && !currentMatch.played && (
        <div className="w-full max-w-6xl mb-2 px-4 py-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 text-[10px] uppercase tracking-widest font-black">
          {replayReadyBeforeFinalization
            ? 'Partido listo para emitirse en directo. El cierre oficial se consolidará automáticamente.'
            : 'Partido oficial programado: se precalcula antes y se emite en directo a su hora oficial.'}
        </div>
      )}

      {isFinished && (
        <button
          onClick={() => router.push('/calendar')}
          className="mt-4 px-10 py-4 bg-slate-900 border border-white/10 hover:border-cyan-500/50 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl transition-all"
        >
          Volver al Calendario
        </button>
      )}
    </div>
  );
}

export default function MatchEnginePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
          <Activity className="text-cyan-500 animate-pulse w-12 h-12 mb-4" />
          <p className="text-slate-500 font-mono text-xs uppercase tracking-widest">Cargando Partido...</p>
        </div>
      }
    >
      <MatchEnginePageContent />
    </Suspense>
  );
}
