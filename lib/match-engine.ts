import {
  normalizeMatchSimulatorSettings,
  type MatchSimulatorSettings
} from '@/lib/match-simulator-config';
import {
  applyFormModifier,
  calculateWeightedOverallForRole,
  getBestRoleForPlayer,
  getDefaultPositionOverallConfig,
  normalizePositionOverallConfig,
  normalizePositionRole,
  type PositionOverallConfig,
  type PositionRole
} from '@/lib/position-overall-config';

export type CourtRole = PositionRole;

export type EnginePlayer = {
  id: number;
  name: string;
  position: string;
  overall: number;
  shooting_2pt: number;
  shooting_3pt: number;
  defense: number;
  passing: number;
  rebounding: number;
  dribbling: number;
  speed: number;
  stamina: number;
  experience?: number;
  forma?: number;
  currentStamina?: number;
  assignedRole?: CourtRole;
};

export type QuarterRotation = Record<string, number | null | undefined>;
export type EngineTactics = Partial<Record<'q1' | 'q2' | 'q3' | 'q4', QuarterRotation>>;
export type OffenseStyle = 'BALANCED' | 'RUN_AND_GUN' | 'PAINT_FOCUS';
export type DefenseStyle = 'MAN_TO_MAN' | 'ZONE_2_3' | 'PRESSING';

export type TeamGamePlan = {
  rotations?: EngineTactics | null;
  offenseStyle?: OffenseStyle | string | null;
  defenseStyle?: DefenseStyle | string | null;
};

export type LineupPlayer = {
  id: number;
  name: string;
  position: CourtRole;
  overall: number;
  energy: number;
};

export type MatchEvent = {
  quarter: string;
  time: string;
  home_score: number;
  away_score: number;
  home_q: number;
  away_q: number;
  type: 'info' | 'basket' | 'fail' | 'turnover' | 'foul';
  text: string;
  isHomeAction: boolean;
  teamColor: string;
  attacker?: string;
  assister?: string;
  defender?: string;
  rebounder?: string;
  points?: number;
  freeThrowsMade?: number;
  freeThrowsAttempted?: number;
  isShootingFoul?: boolean;
  homeTeamFouls?: number;
  awayTeamFouls?: number;
  homeLineup: LineupPlayer[];
  awayLineup: LineupPlayer[];
};

export type MatchSimulationResult = {
  events: MatchEvent[];
  finalScore: { home: number; away: number };
  partials: Array<{ home: number; away: number }>;
  finalHomeLineup: LineupPlayer[];
  finalAwayLineup: LineupPlayer[];
};

export type GenerateMatchParams = {
  homeRoster: EnginePlayer[];
  awayRoster: EnginePlayer[];
  homeTactics?: EngineTactics | null;
  awayTactics?: EngineTactics | null;
  homeGamePlan?: TeamGamePlan | null;
  awayGamePlan?: TeamGamePlan | null;
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamColor?: string;
  awayTeamColor?: string;
  settings?: MatchSimulatorSettings | Partial<MatchSimulatorSettings> | null;
  positionOverallConfig?: PositionOverallConfig | Partial<PositionOverallConfig> | null;
};

const roleOrder: CourtRole[] = ['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot'];
const FALLBACK_POSITION_OVERALL_CONFIG = getDefaultPositionOverallConfig();
const OFFENSE_LABELS: Record<OffenseStyle, string> = {
  BALANCED: 'Equilibrado',
  RUN_AND_GUN: 'Run & Gun',
  PAINT_FOCUS: 'Pintura'
};
const DEFENSE_LABELS: Record<DefenseStyle, string> = {
  MAN_TO_MAN: 'Hombre a Hombre',
  ZONE_2_3: 'Zona 2-3',
  PRESSING: 'Presion Alta'
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const normalizePosition = (position: string): CourtRole => normalizePositionRole(position);

export const calculateRoleRating = (
  player: EnginePlayer,
  role: CourtRole,
  positionOverallConfig: PositionOverallConfig = FALLBACK_POSITION_OVERALL_CONFIG
) => {
  const baseRating = calculateWeightedOverallForRole(player, role, positionOverallConfig);
  return applyFormModifier(baseRating, player.forma);
};

const normalizeOffenseStyle = (value: unknown): OffenseStyle => {
  if (value === 'RUN_AND_GUN' || value === 'PAINT_FOCUS') return value;
  return 'BALANCED';
};

const normalizeDefenseStyle = (value: unknown): DefenseStyle => {
  if (value === 'ZONE_2_3' || value === 'PRESSING') return value;
  return 'MAN_TO_MAN';
};

const getPlayerRole = (player: EnginePlayer) => player.assignedRole || normalizePosition(player.position);

const formatGamePlanSummary = (offenseStyle: OffenseStyle, defenseStyle: DefenseStyle) =>
  `${OFFENSE_LABELS[offenseStyle]} / ${DEFENSE_LABELS[defenseStyle]}`;

const mapSlotToRole = (slot: string): CourtRole | null => {
  const s = (slot || '').toLowerCase();
  if (s === 'pg' || s.includes('base')) return 'Base';
  if (s === 'sg' || s.includes('escolta')) return 'Escolta';
  if (s === 'sf' || (s.includes('alero') && !s.includes('ala'))) return 'Alero';
  if (s === 'pf' || (s.includes('ala') && (s.includes('pivot') || s.includes('pívot')))) return 'Ala-Pívot';
  if (s === 'c' || s.includes('pivot') || s.includes('pívot')) return 'Pívot';
  return null;
};

const pickUniqueLineup = (
  players: EnginePlayer[],
  positionOverallConfig: PositionOverallConfig = FALLBACK_POSITION_OVERALL_CONFIG
): EnginePlayer[] => {
  const sorted = [...players].sort((a, b) => {
    const roleA = getBestRoleForPlayer(a, positionOverallConfig);
    const roleB = getBestRoleForPlayer(b, positionOverallConfig);
    const scoreA =
      calculateRoleRating(a, roleA, positionOverallConfig) * ((a.currentStamina ?? 100) / 100);
    const scoreB =
      calculateRoleRating(b, roleB, positionOverallConfig) * ((b.currentStamina ?? 100) / 100);
    return scoreB - scoreA;
  });

  const selectedByRole = new Map<CourtRole, EnginePlayer>();
  const usedIds = new Set<number>();

  for (const player of sorted) {
    const role = getBestRoleForPlayer(player, positionOverallConfig);
    if (!selectedByRole.has(role)) {
      selectedByRole.set(role, player);
      usedIds.add(player.id);
    }
  }

  for (const role of roleOrder) {
    if (selectedByRole.has(role)) continue;
    const replacement = sorted.find(
      (player) => !usedIds.has(player.id) && getBestRoleForPlayer(player, positionOverallConfig) === role
    );
    if (replacement) {
      selectedByRole.set(role, replacement);
      usedIds.add(replacement.id);
    }
  }

  const unique = roleOrder.map((role) => selectedByRole.get(role)).filter(Boolean) as EnginePlayer[];
  if (unique.length >= 5) return unique.slice(0, 5);

  const extras = sorted.filter((player) => !usedIds.has(player.id)).slice(0, 5 - unique.length);
  return [...unique, ...extras];
};

const clearAssignedRoles = (roster: EnginePlayer[]) => {
  roster.forEach((player) => {
    delete player.assignedRole;
  });
};

const toLineupState = (
  lineup: EnginePlayer[],
  positionOverallConfig: PositionOverallConfig = FALLBACK_POSITION_OVERALL_CONFIG
): LineupPlayer[] => {
  return [...lineup]
    .sort((a, b) => roleOrder.indexOf(getPlayerRole(a)) - roleOrder.indexOf(getPlayerRole(b)))
    .map((player) => {
      const role = getPlayerRole(player);
      return {
        id: player.id,
        name: player.name,
        position: role,
        overall: calculateRoleRating(player, role, positionOverallConfig),
        energy: Math.round(player.currentStamina ?? player.stamina ?? 100)
      };
    });
};

const getQuarterLineup = (
  roster: EnginePlayer[],
  quarterIndex: number,
  tactics?: EngineTactics | null,
  positionOverallConfig: PositionOverallConfig = FALLBACK_POSITION_OVERALL_CONFIG
): EnginePlayer[] => {
  const quarterKey = `q${quarterIndex + 1}` as 'q1' | 'q2' | 'q3' | 'q4';
  const fallbackPlayers = pickUniqueLineup(roster, positionOverallConfig);
  const usedIds = new Set<number>();
  const rolePlayers = new Map<CourtRole, EnginePlayer>();

  if (tactics && tactics[quarterKey]) {
    for (const [slot, playerId] of Object.entries(tactics[quarterKey] || {})) {
      const role = mapSlotToRole(slot);
      if (!role || !playerId) continue;
      const player = roster.find((p) => p.id === playerId);
      if (player && !usedIds.has(player.id)) {
        rolePlayers.set(role, player);
        usedIds.add(player.id);
      }
    }
  }

  for (const role of roleOrder) {
    if (rolePlayers.has(role)) continue;
    const candidate =
      fallbackPlayers.find(
        (player) => !usedIds.has(player.id) && getBestRoleForPlayer(player, positionOverallConfig) === role
      ) || fallbackPlayers.find((player) => !usedIds.has(player.id));
    if (candidate) {
      rolePlayers.set(role, candidate);
      usedIds.add(candidate.id);
    }
  }

  return roleOrder
    .map((role) => {
      const player = rolePlayers.get(role);
      if (!player) return null;
      player.assignedRole = role;
      return player;
    })
    .filter(Boolean) as EnginePlayer[];
};

const pickPlayerByRole = (
  players: EnginePlayer[],
  action: 'shoot' | 'rebound' | 'assist' | 'turnover',
  opts?: {
    excludePlayer?: string;
    offenseStyle?: OffenseStyle;
    defenseStyle?: DefenseStyle;
  }
) => {
  let available = players;
  if (opts?.excludePlayer) available = players.filter((player) => player.name !== opts.excludePlayer);
  if (available.length === 0) return players[0];

  const getPosWeight = (role: CourtRole, currentAction: string) => {
    if (currentAction === 'shoot') {
      if (role === 'Base') return 20;
      if (role === 'Escolta' || role === 'Alero') return 25;
      return 15;
    }
    if (currentAction === 'rebound') {
      if (role === 'Pívot') return 35;
      if (role === 'Ala-Pívot') return 25;
      if (role === 'Alero') return 15;
      return 10;
    }
    if (currentAction === 'assist') return role === 'Base' ? 40 : role === 'Escolta' ? 20 : 10;
    return 20;
  };

  const weights = available.map((player) => {
    const role = getPlayerRole(player);
    let baseWeight = getPosWeight(role, action);

    if (action === 'shoot') {
      if (opts?.offenseStyle === 'RUN_AND_GUN') {
        if (role === 'Base' || role === 'Escolta') baseWeight += 10;
        if (role === 'Alero') baseWeight += 5;
        if (role === 'Pívot') baseWeight -= 5;
      } else if (opts?.offenseStyle === 'PAINT_FOCUS') {
        if (role === 'Pívot' || role === 'Ala-Pívot') baseWeight += 12;
        if (role === 'Base' || role === 'Escolta') baseWeight -= 5;
      }
    }

    if (action === 'assist' && opts?.offenseStyle === 'RUN_AND_GUN') {
      if (role === 'Base') baseWeight += 8;
      if (role === 'Escolta' || role === 'Alero') baseWeight += 3;
    }

    if (action === 'rebound' && opts?.offenseStyle === 'PAINT_FOCUS') {
      if (role === 'Pívot' || role === 'Ala-Pívot') baseWeight += 10;
    }

    if (action === 'turnover' && opts?.defenseStyle === 'PRESSING') {
      if (role === 'Base' || role === 'Escolta' || role === 'Alero') baseWeight += 10;
    }

    let statModifier = 1;
    if (action === 'shoot') statModifier = 1 + ((player.shooting_2pt + player.shooting_3pt) / 200);
    if (action === 'rebound') statModifier = 1 + (player.rebounding / 100);
    if (action === 'assist') statModifier = 1 + (player.passing / 100);
    if (action === 'turnover') statModifier = 1 + (player.defense / 100);
    return baseWeight * statModifier;
  });

  const totalWeight = weights.reduce((acc, curr) => acc + curr, 0);
  let randomValue = Math.random() * totalWeight;
  for (let i = 0; i < available.length; i++) {
    randomValue -= weights[i];
    if (randomValue <= 0) return available[i];
  }
  return available[0];
};

const drainLineupStamina = (
  lineup: EnginePlayer[],
  possessionSecs: number,
  isAttackingTeam: boolean,
  settings: MatchSimulatorSettings,
  multiplier = 1
) => {
  lineup.forEach((player) => {
    const role = getPlayerRole(player);
    const roleLoad = role === 'Base' ? 1.1 : role === 'Pívot' ? 0.95 : 1;
    const baseDrain = isAttackingTeam ? settings.drainAttackBase : settings.drainDefenseBase;
    const drain = (baseDrain + possessionSecs * settings.drainPerPossessionSecond) * roleLoad * multiplier;
    const current = player.currentStamina ?? player.stamina ?? 100;
    player.currentStamina = Math.max(0, current - drain);
  });
};

const recoverBenchStamina = (
  roster: EnginePlayer[],
  onCourtIds: Set<number>,
  settings: MatchSimulatorSettings
) => {
  roster.forEach((player) => {
    if (onCourtIds.has(player.id)) return;
    const current = player.currentStamina ?? player.stamina ?? 100;
    player.currentStamina = Math.min(100, current + settings.benchPossessionRecovery);
  });
};

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
};

const formatLineupSummary = (lineup: LineupPlayer[]) => lineup.map((p) => `${p.position}: ${p.name}`).join(', ');

const getTeamStrength = (
  lineup: EnginePlayer[],
  positionOverallConfig: PositionOverallConfig = FALLBACK_POSITION_OVERALL_CONFIG
) =>
  lineup.reduce(
    (acc, player) => acc + calculateRoleRating(player, getPlayerRole(player), positionOverallConfig),
    0
  ) / Math.max(1, lineup.length);

const getThreePointAttemptRate = (baseRate: number, offenseStyle: OffenseStyle) => {
  if (offenseStyle === 'RUN_AND_GUN') return clamp(baseRate + 0.18, 0.05, 0.9);
  if (offenseStyle === 'PAINT_FOCUS') return clamp(baseRate - 0.18, 0.05, 0.9);
  return baseRate;
};

const getAttackDrainMultiplier = (offenseStyle: OffenseStyle) => {
  if (offenseStyle === 'RUN_AND_GUN') return 1.12;
  if (offenseStyle === 'PAINT_FOCUS') return 1.05;
  return 1;
};

const getDefenseDrainMultiplier = (defenseStyle: DefenseStyle) => {
  if (defenseStyle === 'PRESSING') return 1.18;
  if (defenseStyle === 'ZONE_2_3') return 0.97;
  return 1;
};

const getShotTacticalModifier = (
  offenseStyle: OffenseStyle,
  defenseStyle: DefenseStyle,
  isThreePointer: boolean,
  attackerRole: CourtRole
) => {
  let modifier = 0;

  if (offenseStyle === 'RUN_AND_GUN') {
    modifier += isThreePointer ? 6 : -3;
    if (attackerRole === 'Base' || attackerRole === 'Escolta' || attackerRole === 'Alero') modifier += 1.5;
  } else if (offenseStyle === 'PAINT_FOCUS') {
    modifier += isThreePointer ? -5 : 5;
    if (attackerRole === 'Pívot' || attackerRole === 'Ala-Pívot') modifier += 2;
  }

  if (defenseStyle === 'ZONE_2_3') {
    modifier += isThreePointer ? 4 : -5;
  } else if (defenseStyle === 'PRESSING') {
    modifier += isThreePointer ? -1 : -2;
  }

  return modifier;
};

const getTurnoverTacticalModifier = (
  offenseStyle: OffenseStyle,
  defenseStyle: DefenseStyle,
  attackerRole: CourtRole,
  defenderRole: CourtRole
) => {
  let modifier = 0;

  if (offenseStyle === 'RUN_AND_GUN') modifier += 3;
  if (offenseStyle === 'PAINT_FOCUS') modifier -= 1;

  if (defenseStyle === 'PRESSING') {
    modifier += 6;
    if (defenderRole === 'Base' || defenderRole === 'Escolta' || defenderRole === 'Alero') modifier += 2;
  } else if (defenseStyle === 'ZONE_2_3') {
    modifier -= 1;
  }

  if (attackerRole === 'Base' && defenseStyle === 'PRESSING') modifier += 1;

  return modifier;
};

const getFoulTacticalModifier = (
  offenseStyle: OffenseStyle,
  defenseStyle: DefenseStyle,
  attackerRole: CourtRole,
  defenderRole: CourtRole,
  isThreePointer: boolean
) => {
  let modifier = 0;

  if (defenseStyle === 'PRESSING') modifier += 4;
  if (defenseStyle === 'ZONE_2_3') modifier -= 1.5;

  if (offenseStyle === 'PAINT_FOCUS' && !isThreePointer) modifier += 2.5;
  if (offenseStyle === 'RUN_AND_GUN' && isThreePointer) modifier -= 1;

  if (attackerRole === 'Pívot' || attackerRole === 'Ala-Pívot') modifier += 1.5;
  if (defenderRole === 'Base' && !isThreePointer) modifier += 1;

  return modifier;
};

const getOffensiveReboundRate = (
  baseRate: number,
  offenseStyle: OffenseStyle,
  defenseStyle: DefenseStyle
) => {
  let modifier = 0;
  if (offenseStyle === 'PAINT_FOCUS') modifier += 0.08;
  if (offenseStyle === 'RUN_AND_GUN') modifier -= 0.03;
  if (defenseStyle === 'ZONE_2_3') modifier -= 0.04;
  if (defenseStyle === 'PRESSING') modifier += 0.02;
  return clamp(baseRate + modifier, 0.05, 0.7);
};

const getFreeThrowChance = (player: EnginePlayer, settings: MatchSimulatorSettings) => {
  const shootingTouch = player.shooting_2pt * 0.65 + player.shooting_3pt * 0.35;
  const experienceBonus = (player.experience ?? 0) * 0.1;
  return clamp(
    settings.freeThrowBaseChance + (shootingTouch + experienceBonus - 70) * settings.freeThrowSkillImpact,
    45,
    96
  );
};

const attemptFreeThrows = (
  shooter: EnginePlayer,
  attempts: number,
  settings: MatchSimulatorSettings
) => {
  const chance = getFreeThrowChance(shooter, settings);
  let made = 0;

  for (let i = 0; i < attempts; i++) {
    if (Math.random() * 100 < chance) made += 1;
  }

  return made;
};

export const generateMatchSimulation = ({
  homeRoster,
  awayRoster,
  homeTactics,
  awayTactics,
  homeGamePlan,
  awayGamePlan,
  homeTeamName = 'Local',
  awayTeamName = 'Visitante',
  homeTeamColor = '#3b82f6',
  awayTeamColor = '#ef4444',
  settings,
  positionOverallConfig
}: GenerateMatchParams): MatchSimulationResult => {
  const cfg = normalizeMatchSimulatorSettings(settings);
  const ratingConfig = normalizePositionOverallConfig(positionOverallConfig);
  const simHomeRoster = homeRoster.map((player) => ({ ...player, currentStamina: player.stamina || 100 }));
  const simAwayRoster = awayRoster.map((player) => ({ ...player, currentStamina: player.stamina || 100 }));
  const homePlan = {
    rotations: homeGamePlan?.rotations ?? homeTactics,
    offenseStyle: normalizeOffenseStyle(homeGamePlan?.offenseStyle),
    defenseStyle: normalizeDefenseStyle(homeGamePlan?.defenseStyle)
  };
  const awayPlan = {
    rotations: awayGamePlan?.rotations ?? awayTactics,
    offenseStyle: normalizeOffenseStyle(awayGamePlan?.offenseStyle),
    defenseStyle: normalizeDefenseStyle(awayGamePlan?.defenseStyle)
  };

  const events: MatchEvent[] = [];
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const partials = [{ home: 0, away: 0 }, { home: 0, away: 0 }, { home: 0, away: 0 }, { home: 0, away: 0 }];

  let homeScore = 0;
  let awayScore = 0;
  let lastHomeLineupState: LineupPlayer[] = [];
  let lastAwayLineupState: LineupPlayer[] = [];
  let prevHomeOnCourt = new Set<number>();
  let prevAwayOnCourt = new Set<number>();

  for (let q = 0; q < 4; q++) {
    let timeRemaining = cfg.quarterDurationSeconds;
    let isHomeAttacking = q % 2 === 0;
    let homeQScore = 0;
    let awayQScore = 0;
    let homeTeamFouls = 0;
    let awayTeamFouls = 0;

    if (q > 0) {
      simHomeRoster.forEach((player) => {
        const recovery = prevHomeOnCourt.has(player.id) ? cfg.onCourtQuarterRecovery : cfg.benchQuarterRecovery;
        player.currentStamina = Math.min(100, (player.currentStamina || 0) + recovery);
      });
      simAwayRoster.forEach((player) => {
        const recovery = prevAwayOnCourt.has(player.id) ? cfg.onCourtQuarterRecovery : cfg.benchQuarterRecovery;
        player.currentStamina = Math.min(100, (player.currentStamina || 0) + recovery);
      });
    }

    clearAssignedRoles(simHomeRoster);
    clearAssignedRoles(simAwayRoster);

    const homeStarters = getQuarterLineup(simHomeRoster, q, homePlan.rotations, ratingConfig);
    const awayStarters = getQuarterLineup(simAwayRoster, q, awayPlan.rotations, ratingConfig);
    prevHomeOnCourt = new Set(homeStarters.map((player) => player.id));
    prevAwayOnCourt = new Set(awayStarters.map((player) => player.id));

    const getCurrentStates = () => ({
      home: toLineupState(homeStarters, ratingConfig),
      away: toLineupState(awayStarters, ratingConfig)
    });

    const currentStates = getCurrentStates();
    lastHomeLineupState = currentStates.home;
    lastAwayLineupState = currentStates.away;

    events.push({
      quarter: quarters[q],
      time: formatTime(cfg.quarterDurationSeconds),
      home_score: homeScore,
      away_score: awayScore,
      home_q: homeQScore,
      away_q: awayQScore,
      type: 'info',
      isHomeAction: true,
      teamColor: homeTeamColor,
      text:
        `Inicio ${quarters[q]}\n` +
        `${homeTeamName} (${formatGamePlanSummary(homePlan.offenseStyle, homePlan.defenseStyle)}): ${formatLineupSummary(currentStates.home)}\n` +
        `${awayTeamName} (${formatGamePlanSummary(awayPlan.offenseStyle, awayPlan.defenseStyle)}): ${formatLineupSummary(currentStates.away)}`,
      homeLineup: currentStates.home,
      awayLineup: currentStates.away
    });

    while (timeRemaining > 0) {
      const possessionRange = Math.max(1, cfg.possessionMaxSeconds - cfg.possessionMinSeconds + 1);
      const possessionSecs = Math.floor(Math.random() * possessionRange) + cfg.possessionMinSeconds;
      timeRemaining = Math.max(0, timeRemaining - possessionSecs);
      const timeString = formatTime(timeRemaining);

      const attackers = isHomeAttacking ? homeStarters : awayStarters;
      const defenders = isHomeAttacking ? awayStarters : homeStarters;
      const attackColor = isHomeAttacking ? homeTeamColor : awayTeamColor;
      const attackingPlan = isHomeAttacking ? homePlan : awayPlan;
      const defendingPlan = isHomeAttacking ? awayPlan : homePlan;
      const homeOnCourtIds = new Set(homeStarters.map((player) => player.id));
      const awayOnCourtIds = new Set(awayStarters.map((player) => player.id));

      drainLineupStamina(attackers, possessionSecs, true, cfg, getAttackDrainMultiplier(attackingPlan.offenseStyle));
      drainLineupStamina(defenders, possessionSecs, false, cfg, getDefenseDrainMultiplier(defendingPlan.defenseStyle));
      recoverBenchStamina(simHomeRoster, homeOnCourtIds, cfg);
      recoverBenchStamina(simAwayRoster, awayOnCourtIds, cfg);

      const updatedStates = getCurrentStates();
      lastHomeLineupState = updatedStates.home;
      lastAwayLineupState = updatedStates.away;

      const attacker = pickPlayerByRole(attackers, 'shoot', { offenseStyle: attackingPlan.offenseStyle });
      const defender = pickPlayerByRole(defenders, 'turnover', { defenseStyle: defendingPlan.defenseStyle });

      const eventObj: MatchEvent = {
        quarter: quarters[q],
        time: timeString,
        home_score: homeScore,
        away_score: awayScore,
        home_q: homeQScore,
        away_q: awayQScore,
        type: 'fail',
        text: '',
        isHomeAction: isHomeAttacking,
        attacker: attacker.name,
        teamColor: attackColor,
        homeLineup: updatedStates.home,
        awayLineup: updatedStates.away
      };

      const attackerRole = getPlayerRole(attacker);
      const defenderRole = getPlayerRole(defender);
      const isThreePointer =
        Math.random() < getThreePointAttemptRate(cfg.threePointAttemptRate, attackingPlan.offenseStyle);
      const baseChance = isThreePointer ? cfg.baseThreePointChance : cfg.baseTwoPointChance;
      const attackerEnergy = attacker.currentStamina ?? 100;
      const defenderEnergy = defender.currentStamina ?? 100;
      const attackerRating = calculateRoleRating(attacker, attackerRole, ratingConfig);
      const defenderRating = calculateRoleRating(defender, defenderRole, ratingConfig);
      const averageDuelRating = (attackerRating + defenderRating) / 2;
      const averageDuelShotImpact = (averageDuelRating - 60) * cfg.shotAverageQualityImpact;
      const averageDuelTurnoverImpact = (60 - averageDuelRating) * cfg.turnoverAverageQualityImpact;
      const energyShotImpact = (attackerEnergy - 70) * cfg.shotAttackerEnergyImpact;
      const defenseShotImpact = (defenderEnergy - 70) * cfg.shotDefenderEnergyImpact;
      const skillImpact = (attackerRating - defenderRating) * cfg.shotSkillImpact;
      const shotChance = clamp(
        baseChance +
          energyShotImpact -
          defenseShotImpact +
          skillImpact +
          averageDuelShotImpact +
          getShotTacticalModifier(attackingPlan.offenseStyle, defendingPlan.defenseStyle, isThreePointer, attackerRole),
        cfg.shotChanceMin,
        cfg.shotChanceMax
      );
      const foulChance = clamp(
        cfg.foulBaseChance +
          Math.max(0, attackerRating - defenderRating) * 0.1 +
          Math.max(0, 70 - defenderEnergy) * 0.12 +
          getFoulTacticalModifier(
            attackingPlan.offenseStyle,
            defendingPlan.defenseStyle,
            attackerRole,
            defenderRole,
            isThreePointer
          ),
        2,
        45
      );
      const turnoverChance = clamp(
        cfg.turnoverBaseChance +
          Math.max(0, 60 - attackerEnergy) * cfg.turnoverLowEnergyImpact +
          Math.max(0, defenderEnergy - 65) * cfg.turnoverDefenseEnergyImpact +
          averageDuelTurnoverImpact +
          getTurnoverTacticalModifier(attackingPlan.offenseStyle, defendingPlan.defenseStyle, attackerRole, defenderRole),
        cfg.turnoverChanceMin,
        cfg.turnoverChanceMax
      );

      let shouldTogglePossession = true;

      if (Math.random() * 100 < foulChance) {
        const foulingTeamIsHome = !isHomeAttacking;
        const offensiveTeamName = isHomeAttacking ? homeTeamName : awayTeamName;

        if (foulingTeamIsHome) {
          homeTeamFouls += 1;
        } else {
          awayTeamFouls += 1;
        }

        const defensiveTeamFouls = foulingTeamIsHome ? homeTeamFouls : awayTeamFouls;
        const isShootingFoul = Math.random() < cfg.shootingFoulRate;
        const freeThrowAttempts = isShootingFoul
          ? (isThreePointer ? 3 : 2)
          : defensiveTeamFouls >= cfg.bonusTeamFoulLimit
            ? 2
            : 0;

        eventObj.type = 'foul';
        eventObj.defender = defender.name;
        eventObj.isShootingFoul = isShootingFoul;
        eventObj.homeTeamFouls = homeTeamFouls;
        eventObj.awayTeamFouls = awayTeamFouls;

        if (freeThrowAttempts > 0) {
          const madeFreeThrows = attemptFreeThrows(attacker, freeThrowAttempts, cfg);
          eventObj.freeThrowsAttempted = freeThrowAttempts;
          eventObj.freeThrowsMade = madeFreeThrows;
          eventObj.points = madeFreeThrows;

          if (isHomeAttacking) {
            homeScore += madeFreeThrows;
            homeQScore += madeFreeThrows;
          } else {
            awayScore += madeFreeThrows;
            awayQScore += madeFreeThrows;
          }

          const contextLabel = isShootingFoul ? 'falta de tiro' : 'bonus';
          eventObj.text =
            `${defender.name} comete ${contextLabel} sobre ${attacker.name}. ` +
            `${attacker.name} anota ${madeFreeThrows}/${freeThrowAttempts} tiros libres. ` +
            `(${defensiveTeamFouls} faltas de equipo)`;
        } else {
          shouldTogglePossession = false;
          eventObj.text =
            `${defender.name} comete falta sobre ${attacker.name}. ` +
            `${offensiveTeamName} mantiene la posesión. ` +
            `(${defensiveTeamFouls} faltas de equipo)`;
        }
      } else if (Math.random() * 100 < turnoverChance) {
        eventObj.type = 'turnover';
        eventObj.text = `${attacker.name} pierde el balón ante ${defender.name}.`;
      } else if (Math.random() * 100 < shotChance) {
        const points = isThreePointer ? 3 : 2;
        if (isHomeAttacking) {
          homeScore += points;
          homeQScore += points;
        } else {
          awayScore += points;
          awayQScore += points;
        }
        eventObj.type = 'basket';
        eventObj.points = points;
        if (Math.random() < cfg.assistRate) {
          const assister = pickPlayerByRole(attackers, 'assist', {
            offenseStyle: attackingPlan.offenseStyle,
            excludePlayer: attacker.name
          });
          eventObj.assister = assister.name;
          eventObj.text = `${attacker.name} anota de ${points} puntos (asistencia de ${assister.name}).`;
        } else {
          eventObj.text = `${attacker.name} anota de ${points} puntos.`;
        }
      } else {
        eventObj.type = 'fail';
        const reboundTeamIsHome =
          Math.random() <
          getOffensiveReboundRate(
            cfg.offensiveReboundRate,
            attackingPlan.offenseStyle,
            defendingPlan.defenseStyle
          )
            ? isHomeAttacking
            : !isHomeAttacking;
        const reboundPool = reboundTeamIsHome ? homeStarters : awayStarters;
        const rebounder = pickPlayerByRole(reboundPool, 'rebound', {
          offenseStyle: reboundTeamIsHome ? homePlan.offenseStyle : awayPlan.offenseStyle
        });
        eventObj.rebounder = rebounder.name;
        eventObj.text = `${attacker.name} falla el tiro. Rebote de ${rebounder.name}.`;
      }

      eventObj.home_score = homeScore;
      eventObj.away_score = awayScore;
      eventObj.home_q = homeQScore;
      eventObj.away_q = awayQScore;
      events.push(eventObj);

      if (shouldTogglePossession) {
        isHomeAttacking = !isHomeAttacking;
      }
    }

    partials[q] = { home: homeQScore, away: awayQScore };
  }

  if (homeScore === awayScore) {
    const homeStrength = getTeamStrength(pickUniqueLineup(simHomeRoster, ratingConfig), ratingConfig);
    const awayStrength = getTeamStrength(pickUniqueLineup(simAwayRoster, ratingConfig), ratingConfig);
    const homeWinChance = clamp(
      50 + (homeStrength - awayStrength) * cfg.tieBreakerStrengthImpact,
      cfg.tieBreakerMinChance,
      cfg.tieBreakerMaxChance
    );
    const homeWins = Math.random() * 100 < homeWinChance;
    if (homeWins) {
      homeScore += cfg.tieBreakerPoints;
      partials[3].home += cfg.tieBreakerPoints;
    } else {
      awayScore += cfg.tieBreakerPoints;
      partials[3].away += cfg.tieBreakerPoints;
    }

    events.push({
      quarter: 'Q4',
      time: '00:00',
      home_score: homeScore,
      away_score: awayScore,
      home_q: partials[3].home,
      away_q: partials[3].away,
      type: 'basket',
      isHomeAction: homeWins,
      teamColor: homeWins ? homeTeamColor : awayTeamColor,
      text: `Partido igualado hasta el final: ${homeWins ? homeTeamName : awayTeamName} decide en la última posesión.`,
      homeLineup: lastHomeLineupState,
      awayLineup: lastAwayLineupState
    });
  }

  return {
    events,
    finalScore: { home: homeScore, away: awayScore },
    partials,
    finalHomeLineup:
      lastHomeLineupState.length > 0
        ? lastHomeLineupState
        : toLineupState(pickUniqueLineup(simHomeRoster, ratingConfig), ratingConfig),
    finalAwayLineup:
      lastAwayLineupState.length > 0
        ? lastAwayLineupState
        : toLineupState(pickUniqueLineup(simAwayRoster, ratingConfig), ratingConfig)
  };
};
