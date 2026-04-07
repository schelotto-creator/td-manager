import type { MatchEvent } from '@/lib/match-engine';

export type ExperienceStatRow = {
  player_id: number;
  points?: number | null;
  rebounds?: number | null;
  assists?: number | null;
};

export type ExperienceDelta = {
  playerId: number;
  delta: number;
};

const EXPERIENCE_BASE_GAIN = 1;
const EXPERIENCE_BONUS_STEP = 15;
const EXPERIENCE_MAX_BONUS = 2;
export const PLAYER_EXPERIENCE_CAP = 99;

const toSafeNonNegativeInt = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
};

export const getExperiencePerformanceBonus = (row: ExperienceStatRow) => {
  const totalCountingStats =
    toSafeNonNegativeInt(row.points) +
    toSafeNonNegativeInt(row.rebounds) +
    toSafeNonNegativeInt(row.assists);

  return Math.min(EXPERIENCE_MAX_BONUS, Math.floor(totalCountingStats / EXPERIENCE_BONUS_STEP));
};

export const buildMatchExperienceDeltas = (
  events: MatchEvent[],
  statsRows: ExperienceStatRow[]
): ExperienceDelta[] => {
  const participantIds = new Set<number>();

  events.forEach((event) => {
    [...(event.homeLineup || []), ...(event.awayLineup || [])].forEach((player) => {
      const playerId = Number(player.id);
      if (Number.isFinite(playerId) && playerId > 0) participantIds.add(playerId);
    });
  });

  if (participantIds.size === 0) {
    statsRows.forEach((row) => {
      const playerId = Number(row.player_id);
      if (Number.isFinite(playerId) && playerId > 0) participantIds.add(playerId);
    });
  }

  const deltaByPlayerId = new Map<number, number>();
  participantIds.forEach((playerId) => {
    deltaByPlayerId.set(playerId, EXPERIENCE_BASE_GAIN);
  });

  statsRows.forEach((row) => {
    const playerId = Number(row.player_id);
    if (!Number.isFinite(playerId) || playerId <= 0) return;

    const current = deltaByPlayerId.get(playerId) || EXPERIENCE_BASE_GAIN;
    deltaByPlayerId.set(playerId, current + getExperiencePerformanceBonus(row));
  });

  return Array.from(deltaByPlayerId.entries())
    .map(([playerId, delta]) => ({ playerId, delta }))
    .filter((entry) => entry.delta > 0);
};

export const applyExperienceDelta = (currentExperience: unknown, delta: number) => {
  const current = toSafeNonNegativeInt(currentExperience);
  const safeDelta = toSafeNonNegativeInt(delta);
  return Math.min(PLAYER_EXPERIENCE_CAP, current + safeDelta);
};
