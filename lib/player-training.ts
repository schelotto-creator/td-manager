import type { SupabaseClient } from '@supabase/supabase-js';

export type TrainingConfig = {
  baseGain: number;
  drDivisor: number;
  ageMultipliers: {
    u22: number;
    u26: number;
    u30: number;
    u34: number;
    v34: number;
  };
};

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  baseGain: 0.8,
  drDivisor: 50,
  ageMultipliers: {
    u22: 1.0,
    u26: 0.65,
    u30: 0.40,
    u34: 0.20,
    v34: 0.08
  }
};

export const TRAINABLE_ATTRIBUTES = [
  'shooting_3pt',
  'shooting_2pt',
  'defense',
  'rebounding',
  'passing',
  'dribbling',
  'speed'
] as const;

export type TrainableAttribute = (typeof TRAINABLE_ATTRIBUTES)[number];

export const TRAINABLE_ATTRIBUTE_LABELS: Record<TrainableAttribute, string> = {
  shooting_3pt: 'Triple',
  shooting_2pt: 'Tiro 2',
  defense: 'Defensa',
  rebounding: 'Rebote',
  passing: 'Pase',
  dribbling: 'Manejo',
  speed: 'Físico'
};

export const getAgeMultiplier = (age: number, config: TrainingConfig): number => {
  if (age < 22) return config.ageMultipliers.u22;
  if (age < 26) return config.ageMultipliers.u26;
  if (age < 30) return config.ageMultipliers.u30;
  if (age < 34) return config.ageMultipliers.u34;
  return config.ageMultipliers.v34;
};

export const computeTrainingDelta = (
  currentValue: number,
  age: number,
  config: TrainingConfig
): number => {
  const ageMultiplier = getAgeMultiplier(age, config);
  return config.baseGain * ageMultiplier * (100 - currentValue) / config.drDivisor;
};

export const isMadridFriday = (date: Date): boolean => {
  const madridStr = date.toLocaleDateString('es-ES', {
    timeZone: 'Europe/Madrid',
    weekday: 'long'
  });
  return madridStr.toLowerCase() === 'viernes';
};

export const fetchTrainingConfig = async (
  supabase: SupabaseClient
): Promise<TrainingConfig> => {
  const { data } = await supabase
    .from('training_config')
    .select('settings')
    .eq('id', 1)
    .maybeSingle();

  if (!data?.settings) return DEFAULT_TRAINING_CONFIG;

  const s = data.settings as Record<string, unknown>;
  return {
    baseGain: typeof s.baseGain === 'number' ? s.baseGain : DEFAULT_TRAINING_CONFIG.baseGain,
    drDivisor: typeof s.drDivisor === 'number' ? s.drDivisor : DEFAULT_TRAINING_CONFIG.drDivisor,
    ageMultipliers: {
      u22: typeof (s.ageMultipliers as any)?.u22 === 'number' ? (s.ageMultipliers as any).u22 : DEFAULT_TRAINING_CONFIG.ageMultipliers.u22,
      u26: typeof (s.ageMultipliers as any)?.u26 === 'number' ? (s.ageMultipliers as any).u26 : DEFAULT_TRAINING_CONFIG.ageMultipliers.u26,
      u30: typeof (s.ageMultipliers as any)?.u30 === 'number' ? (s.ageMultipliers as any).u30 : DEFAULT_TRAINING_CONFIG.ageMultipliers.u30,
      u34: typeof (s.ageMultipliers as any)?.u34 === 'number' ? (s.ageMultipliers as any).u34 : DEFAULT_TRAINING_CONFIG.ageMultipliers.u34,
      v34: typeof (s.ageMultipliers as any)?.v34 === 'number' ? (s.ageMultipliers as any).v34 : DEFAULT_TRAINING_CONFIG.ageMultipliers.v34,
    }
  };
};

export const applyFridayTraining = async (
  supabaseAdmin: SupabaseClient,
  config?: TrainingConfig
): Promise<{ updated: number; errors: number; log: string[] }> => {
  const resolvedConfig = config ?? DEFAULT_TRAINING_CONFIG;
  const log: string[] = [];

  const { data: players, error } = await supabaseAdmin
    .from('players')
    .select('id, age, training_focus, shooting_3pt, shooting_2pt, defense, rebounding, passing, dribbling, speed')
    .not('training_focus', 'is', null);

  if (error || !players) {
    return { updated: 0, errors: 0, log: [`Error fetching players: ${error?.message}`] };
  }

  let updated = 0;
  let errors = 0;

  await Promise.all(
    (players as any[]).map(async (p) => {
      const attr = p.training_focus as TrainableAttribute;
      if (!TRAINABLE_ATTRIBUTES.includes(attr)) return;

      const currentValue = Number(p[attr] ?? 50);
      const age = Number(p.age ?? 25);
      const delta = computeTrainingDelta(currentValue, age, resolvedConfig);
      const newValue = Math.min(99, Math.round((currentValue + delta) * 10) / 10);

      const { error: updateError } = await supabaseAdmin
        .from('players')
        .update({
          [attr]: newValue,
          training_focus: null,
          entrenos_semanales: 0
        })
        .eq('id', p.id);

      if (updateError) {
        errors++;
        log.push(`❌ Player ${p.id}: ${updateError.message}`);
      } else {
        updated++;
        log.push(`✅ Player ${p.id}: ${attr} ${currentValue} → ${newValue}`);
      }
    })
  );

  const { error: resetError } = await supabaseAdmin
    .from('players')
    .update({ entrenos_semanales: 0 })
    .is('training_focus', null);

  if (resetError) {
    log.push(`⚠️ Error resetting entrenos_semanales for unfocused players: ${resetError.message}`);
  }

  return { updated, errors, log };
};
