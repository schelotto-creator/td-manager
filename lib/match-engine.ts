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
};

export type QuarterRotation = Record<string, number | null | undefined>;
export type EngineTactics = Partial<Record<'q1' | 'q2' | 'q3' | 'q4', QuarterRotation>>;

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
  type: 'info' | 'basket' | 'fail' | 'turnover';
  text: string;
  isHomeAction: boolean;
  teamColor: string;
  attacker?: string;
  assister?: string;
  rebounder?: string;
  points?: number;
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
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamColor?: string;
  awayTeamColor?: string;
  settings?: MatchSimulatorSettings | Partial<MatchSimulatorSettings> | null;
  positionOverallConfig?: PositionOverallConfig | Partial<PositionOverallConfig> | null;
};

const roleOrder: CourtRole[] = ['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot'];
const FALLBACK_POSITION_OVERALL_CONFIG = getDefaultPositionOverallConfig();

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

const toLineupState = (
  lineup: EnginePlayer[],
  positionOverallConfig: PositionOverallConfig = FALLBACK_POSITION_OVERALL_CONFIG
): LineupPlayer[] => {
  const usedIds = new Set<number>();
  const result: LineupPlayer[] = [];

  for (const role of roleOrder) {
    const natural = lineup.find(
      (player) => !usedIds.has(player.id) && getBestRoleForPlayer(player, positionOverallConfig) === role
    );
    if (natural) {
      usedIds.add(natural.id);
      result.push({
        id: natural.id,
        name: natural.name,
        position: role,
        overall: calculateRoleRating(natural, role, positionOverallConfig),
        energy: Math.round(natural.currentStamina ?? natural.stamina ?? 100)
      });
      continue;
    }

    const fallback = lineup.find((player) => !usedIds.has(player.id));
    if (fallback) {
      usedIds.add(fallback.id);
      result.push({
        id: fallback.id,
        name: fallback.name,
        position: role,
        overall: calculateRoleRating(fallback, role, positionOverallConfig),
        energy: Math.round(fallback.currentStamina ?? fallback.stamina ?? 100)
      });
    }
  }

  return result;
};

const getQuarterLineupState = (
  roster: EnginePlayer[],
  quarterIndex: number,
  tactics?: EngineTactics | null,
  positionOverallConfig: PositionOverallConfig = FALLBACK_POSITION_OVERALL_CONFIG
): LineupPlayer[] => {
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
    const candidate = fallbackPlayers.find((player) => !usedIds.has(player.id));
    if (candidate) {
      rolePlayers.set(role, candidate);
      usedIds.add(candidate.id);
    }
  }

  return roleOrder
    .map((role) => {
      const player = rolePlayers.get(role);
      if (!player) return null;
      return {
        id: player.id,
        name: player.name,
        position: role,
        overall: calculateRoleRating(player, role, positionOverallConfig),
        energy: Math.round(player.currentStamina ?? player.stamina ?? 100)
      };
    })
    .filter(Boolean) as LineupPlayer[];
};

const getQuarterLineup = (
  roster: EnginePlayer[],
  quarterIndex: number,
  tactics?: EngineTactics | null,
  positionOverallConfig: PositionOverallConfig = FALLBACK_POSITION_OVERALL_CONFIG
) => {
  const quarterKey = `q${quarterIndex + 1}` as 'q1' | 'q2' | 'q3' | 'q4';
  if (tactics && tactics[quarterKey]) {
    const lineupIds = Object.values(tactics[quarterKey] || {}).filter(Boolean) as number[];
    const exactLineup = roster.filter((player) => lineupIds.includes(player.id));
    const uniqueLineup = pickUniqueLineup(exactLineup, positionOverallConfig);
    if (uniqueLineup.length === 5) return uniqueLineup;
  }
  return pickUniqueLineup(roster, positionOverallConfig);
};

const pickPlayerByRole = (
  players: EnginePlayer[],
  action: 'shoot' | 'rebound' | 'assist' | 'turnover',
  excludePlayer?: string
) => {
  let available = players;
  if (excludePlayer) available = players.filter((player) => player.name !== excludePlayer);
  if (available.length === 0) return players[0];

  const getPosWeight = (position: string, currentAction: string) => {
    if (currentAction === 'shoot') {
      return position.includes('Base') ? 20 : position.includes('Escolta') || position.includes('Alero') ? 25 : 15;
    }
    if (currentAction === 'rebound') {
      return position.includes('Pívot')
        ? 35
        : position.includes('Ala-Pívot')
          ? 25
          : position.includes('Alero')
            ? 15
            : 10;
    }
    if (currentAction === 'assist') return position.includes('Base') ? 40 : position.includes('Escolta') ? 20 : 10;
    return 20;
  };

  const weights = available.map((player) => {
    const baseWeight = getPosWeight(player.position, action);
    let statModifier = 1;
    if (action === 'shoot') statModifier = 1 + ((player.shooting_2pt + player.shooting_3pt) / 200);
    if (action === 'rebound') statModifier = 1 + (player.rebounding / 100);
    if (action === 'assist') statModifier = 1 + (player.passing / 100);
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
  settings: MatchSimulatorSettings
) => {
  lineup.forEach((player) => {
    const role = normalizePosition(player.position);
    const roleLoad = role === 'Base' ? 1.1 : role === 'Pívot' ? 0.95 : 1;
    const baseDrain = isAttackingTeam ? settings.drainAttackBase : settings.drainDefenseBase;
    const drain = (baseDrain + possessionSecs * settings.drainPerPossessionSecond) * roleLoad;
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
    (acc, player) => acc + calculateRoleRating(player, getBestRoleForPlayer(player, positionOverallConfig), positionOverallConfig),
    0
  ) / Math.max(1, lineup.length);

export const generateMatchSimulation = ({
  homeRoster,
  awayRoster,
  homeTactics,
  awayTactics,
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

    const homeStarters = getQuarterLineup(simHomeRoster, q, homeTactics, ratingConfig);
    const awayStarters = getQuarterLineup(simAwayRoster, q, awayTactics, ratingConfig);
    prevHomeOnCourt = new Set(homeStarters.map((player) => player.id));
    prevAwayOnCourt = new Set(awayStarters.map((player) => player.id));

    const getCurrentStates = () => ({
      home: getQuarterLineupState(simHomeRoster, q, homeTactics, ratingConfig),
      away: getQuarterLineupState(simAwayRoster, q, awayTactics, ratingConfig)
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
      text: `Inicio ${quarters[q]}\n${homeTeamName}: ${formatLineupSummary(currentStates.home)}\n${awayTeamName}: ${formatLineupSummary(currentStates.away)}`,
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
      const homeOnCourtIds = new Set(homeStarters.map((player) => player.id));
      const awayOnCourtIds = new Set(awayStarters.map((player) => player.id));

      drainLineupStamina(attackers, possessionSecs, true, cfg);
      drainLineupStamina(defenders, possessionSecs, false, cfg);
      recoverBenchStamina(simHomeRoster, homeOnCourtIds, cfg);
      recoverBenchStamina(simAwayRoster, awayOnCourtIds, cfg);

      const updatedStates = getCurrentStates();
      lastHomeLineupState = updatedStates.home;
      lastAwayLineupState = updatedStates.away;

      const attacker = pickPlayerByRole(attackers, 'shoot');
      const defender = pickPlayerByRole(defenders, 'turnover');

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

      const isThreePointer = Math.random() < cfg.threePointAttemptRate;
      const baseChance = isThreePointer ? cfg.baseThreePointChance : cfg.baseTwoPointChance;
      const attackerEnergy = attacker.currentStamina ?? 100;
      const defenderEnergy = defender.currentStamina ?? 100;
      const attackerRole = normalizePosition(attacker.position);
      const defenderRole = normalizePosition(defender.position);
      const attackerRating = calculateRoleRating(attacker, attackerRole, ratingConfig);
      const defenderRating = calculateRoleRating(defender, defenderRole, ratingConfig);
      const energyShotImpact = (attackerEnergy - 70) * cfg.shotAttackerEnergyImpact;
      const defenseShotImpact = (defenderEnergy - 70) * cfg.shotDefenderEnergyImpact;
      const skillImpact = (attackerRating - defenderRating) * cfg.shotSkillImpact;
      const shotChance = clamp(baseChance + energyShotImpact - defenseShotImpact + skillImpact, cfg.shotChanceMin, cfg.shotChanceMax);
      const turnoverChance = clamp(
        cfg.turnoverBaseChance +
          Math.max(0, 60 - attackerEnergy) * cfg.turnoverLowEnergyImpact +
          Math.max(0, defenderEnergy - 65) * cfg.turnoverDefenseEnergyImpact,
        cfg.turnoverChanceMin,
        cfg.turnoverChanceMax
      );

      if (Math.random() * 100 < turnoverChance) {
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
          const assister = pickPlayerByRole(attackers, 'assist', attacker.name);
          eventObj.assister = assister.name;
          eventObj.text = `${attacker.name} anota de ${points} puntos (asistencia de ${assister.name}).`;
        } else {
          eventObj.text = `${attacker.name} anota de ${points} puntos.`;
        }
      } else {
        eventObj.type = 'fail';
        const reboundTeamIsHome = Math.random() < cfg.offensiveReboundRate ? isHomeAttacking : !isHomeAttacking;
        const reboundPool = reboundTeamIsHome ? homeStarters : awayStarters;
        const rebounder = pickPlayerByRole(reboundPool, 'rebound');
        eventObj.rebounder = rebounder.name;
        eventObj.text = `${attacker.name} falla el tiro. Rebote de ${rebounder.name}.`;
      }

      eventObj.home_score = homeScore;
      eventObj.away_score = awayScore;
      eventObj.home_q = homeQScore;
      eventObj.away_q = awayQScore;
      events.push(eventObj);

      isHomeAttacking = !isHomeAttacking;
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
