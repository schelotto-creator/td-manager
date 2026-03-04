import type { SupabaseClient } from '@supabase/supabase-js';

export type MatchSimulatorSettings = {
  quarterDurationSeconds: number;
  possessionMinSeconds: number;
  possessionMaxSeconds: number;
  threePointAttemptRate: number;
  assistRate: number;
  offensiveReboundRate: number;
  baseTwoPointChance: number;
  baseThreePointChance: number;
  shotAttackerEnergyImpact: number;
  shotDefenderEnergyImpact: number;
  shotSkillImpact: number;
  shotAverageQualityImpact: number;
  shotChanceMin: number;
  shotChanceMax: number;
  turnoverBaseChance: number;
  turnoverLowEnergyImpact: number;
  turnoverDefenseEnergyImpact: number;
  turnoverAverageQualityImpact: number;
  turnoverChanceMin: number;
  turnoverChanceMax: number;
  onCourtQuarterRecovery: number;
  benchQuarterRecovery: number;
  benchPossessionRecovery: number;
  drainAttackBase: number;
  drainDefenseBase: number;
  drainPerPossessionSecond: number;
  tieBreakerStrengthImpact: number;
  tieBreakerMinChance: number;
  tieBreakerMaxChance: number;
  tieBreakerPoints: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const toInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = asNumber(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(clamp(parsed, min, max));
};

const toFloat = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = asNumber(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, min, max);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const DEFAULT_MATCH_SIMULATOR_SETTINGS: MatchSimulatorSettings = {
  quarterDurationSeconds: 600,
  possessionMinSeconds: 14,
  possessionMaxSeconds: 24,
  threePointAttemptRate: 0.35,
  assistRate: 0.35,
  offensiveReboundRate: 0.55,
  baseTwoPointChance: 51,
  baseThreePointChance: 35,
  shotAttackerEnergyImpact: 0.35,
  shotDefenderEnergyImpact: 0.15,
  shotSkillImpact: 0.16,
  shotAverageQualityImpact: 0.12,
  shotChanceMin: 16,
  shotChanceMax: 72,
  turnoverBaseChance: 7,
  turnoverLowEnergyImpact: 0.22,
  turnoverDefenseEnergyImpact: 0.06,
  turnoverAverageQualityImpact: 0.08,
  turnoverChanceMin: 6,
  turnoverChanceMax: 26,
  onCourtQuarterRecovery: 10,
  benchQuarterRecovery: 24,
  benchPossessionRecovery: 0.22,
  drainAttackBase: 0.62,
  drainDefenseBase: 0.46,
  drainPerPossessionSecond: 0.06,
  tieBreakerStrengthImpact: 0.8,
  tieBreakerMinChance: 35,
  tieBreakerMaxChance: 65,
  tieBreakerPoints: 2
};

export const normalizeMatchSimulatorSettings = (
  raw?: Partial<MatchSimulatorSettings> | null
): MatchSimulatorSettings => {
  const input = raw || {};
  const normalized: MatchSimulatorSettings = {
    quarterDurationSeconds: toInt(input.quarterDurationSeconds, DEFAULT_MATCH_SIMULATOR_SETTINGS.quarterDurationSeconds, 120, 1200),
    possessionMinSeconds: toInt(input.possessionMinSeconds, DEFAULT_MATCH_SIMULATOR_SETTINGS.possessionMinSeconds, 4, 40),
    possessionMaxSeconds: toInt(input.possessionMaxSeconds, DEFAULT_MATCH_SIMULATOR_SETTINGS.possessionMaxSeconds, 6, 45),
    threePointAttemptRate: toFloat(input.threePointAttemptRate, DEFAULT_MATCH_SIMULATOR_SETTINGS.threePointAttemptRate, 0.05, 0.8),
    assistRate: toFloat(input.assistRate, DEFAULT_MATCH_SIMULATOR_SETTINGS.assistRate, 0.05, 0.95),
    offensiveReboundRate: toFloat(input.offensiveReboundRate, DEFAULT_MATCH_SIMULATOR_SETTINGS.offensiveReboundRate, 0.1, 0.9),
    baseTwoPointChance: toFloat(input.baseTwoPointChance, DEFAULT_MATCH_SIMULATOR_SETTINGS.baseTwoPointChance, 5, 95),
    baseThreePointChance: toFloat(input.baseThreePointChance, DEFAULT_MATCH_SIMULATOR_SETTINGS.baseThreePointChance, 5, 95),
    shotAttackerEnergyImpact: toFloat(input.shotAttackerEnergyImpact, DEFAULT_MATCH_SIMULATOR_SETTINGS.shotAttackerEnergyImpact, -2, 2),
    shotDefenderEnergyImpact: toFloat(input.shotDefenderEnergyImpact, DEFAULT_MATCH_SIMULATOR_SETTINGS.shotDefenderEnergyImpact, -2, 2),
    shotSkillImpact: toFloat(input.shotSkillImpact, DEFAULT_MATCH_SIMULATOR_SETTINGS.shotSkillImpact, -2, 2),
    shotAverageQualityImpact: toFloat(input.shotAverageQualityImpact, DEFAULT_MATCH_SIMULATOR_SETTINGS.shotAverageQualityImpact, 0, 2),
    shotChanceMin: toFloat(input.shotChanceMin, DEFAULT_MATCH_SIMULATOR_SETTINGS.shotChanceMin, 1, 95),
    shotChanceMax: toFloat(input.shotChanceMax, DEFAULT_MATCH_SIMULATOR_SETTINGS.shotChanceMax, 5, 99),
    turnoverBaseChance: toFloat(input.turnoverBaseChance, DEFAULT_MATCH_SIMULATOR_SETTINGS.turnoverBaseChance, 0, 60),
    turnoverLowEnergyImpact: toFloat(input.turnoverLowEnergyImpact, DEFAULT_MATCH_SIMULATOR_SETTINGS.turnoverLowEnergyImpact, 0, 5),
    turnoverDefenseEnergyImpact: toFloat(input.turnoverDefenseEnergyImpact, DEFAULT_MATCH_SIMULATOR_SETTINGS.turnoverDefenseEnergyImpact, 0, 5),
    turnoverAverageQualityImpact: toFloat(input.turnoverAverageQualityImpact, DEFAULT_MATCH_SIMULATOR_SETTINGS.turnoverAverageQualityImpact, 0, 2),
    turnoverChanceMin: toFloat(input.turnoverChanceMin, DEFAULT_MATCH_SIMULATOR_SETTINGS.turnoverChanceMin, 0, 95),
    turnoverChanceMax: toFloat(input.turnoverChanceMax, DEFAULT_MATCH_SIMULATOR_SETTINGS.turnoverChanceMax, 1, 99),
    onCourtQuarterRecovery: toFloat(input.onCourtQuarterRecovery, DEFAULT_MATCH_SIMULATOR_SETTINGS.onCourtQuarterRecovery, 0, 100),
    benchQuarterRecovery: toFloat(input.benchQuarterRecovery, DEFAULT_MATCH_SIMULATOR_SETTINGS.benchQuarterRecovery, 0, 100),
    benchPossessionRecovery: toFloat(input.benchPossessionRecovery, DEFAULT_MATCH_SIMULATOR_SETTINGS.benchPossessionRecovery, 0, 10),
    drainAttackBase: toFloat(input.drainAttackBase, DEFAULT_MATCH_SIMULATOR_SETTINGS.drainAttackBase, 0, 10),
    drainDefenseBase: toFloat(input.drainDefenseBase, DEFAULT_MATCH_SIMULATOR_SETTINGS.drainDefenseBase, 0, 10),
    drainPerPossessionSecond: toFloat(input.drainPerPossessionSecond, DEFAULT_MATCH_SIMULATOR_SETTINGS.drainPerPossessionSecond, 0, 2),
    tieBreakerStrengthImpact: toFloat(input.tieBreakerStrengthImpact, DEFAULT_MATCH_SIMULATOR_SETTINGS.tieBreakerStrengthImpact, 0, 10),
    tieBreakerMinChance: toFloat(input.tieBreakerMinChance, DEFAULT_MATCH_SIMULATOR_SETTINGS.tieBreakerMinChance, 1, 99),
    tieBreakerMaxChance: toFloat(input.tieBreakerMaxChance, DEFAULT_MATCH_SIMULATOR_SETTINGS.tieBreakerMaxChance, 1, 99),
    tieBreakerPoints: toInt(input.tieBreakerPoints, DEFAULT_MATCH_SIMULATOR_SETTINGS.tieBreakerPoints, 1, 10)
  };

  normalized.possessionMaxSeconds = Math.max(normalized.possessionMinSeconds, normalized.possessionMaxSeconds);
  normalized.shotChanceMax = Math.max(normalized.shotChanceMin, normalized.shotChanceMax);
  normalized.turnoverChanceMax = Math.max(normalized.turnoverChanceMin, normalized.turnoverChanceMax);
  normalized.tieBreakerMaxChance = Math.max(normalized.tieBreakerMinChance, normalized.tieBreakerMaxChance);

  return normalized;
};

export const fetchMatchSimulatorSettings = async (
  supabaseClient: SupabaseClient<any, 'public', any>
): Promise<MatchSimulatorSettings> => {
  const { data, error } = await supabaseClient
    .from('match_simulator_config')
    .select('settings')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.warn('No se pudo cargar configuración del simulador. Se usan valores por defecto.', error);
    return DEFAULT_MATCH_SIMULATOR_SETTINGS;
  }

  if (!data || !isRecord(data.settings)) return DEFAULT_MATCH_SIMULATOR_SETTINGS;
  return normalizeMatchSimulatorSettings(data.settings as Partial<MatchSimulatorSettings>);
};
