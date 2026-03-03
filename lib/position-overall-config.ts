import type { SupabaseClient } from '@supabase/supabase-js';

export const POSITION_ROLES = ['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot'] as const;
export type PositionRole = (typeof POSITION_ROLES)[number];

export const OVERALL_STAT_KEYS = [
  'shooting_3pt',
  'shooting_2pt',
  'defense',
  'passing',
  'rebounding',
  'speed',
  'dribbling'
] as const;
export type OverallStatKey = (typeof OVERALL_STAT_KEYS)[number];

export type PositionOverallWeights = Record<OverallStatKey, number>;
export type PositionOverallConfig = Record<PositionRole, PositionOverallWeights>;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const toWeight = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, 0, 1);
};

const roundWeight = (value: number) => Number(value.toFixed(4));

const resolveRoleFromText = (raw: string, fallback: PositionRole | null): PositionRole | null => {
  const text = normalizeText(raw || '');
  if (!text) return fallback;

  if (text === 'pg' || text.includes('base') || text.includes('point guard')) return 'Base';
  if (text === 'sg' || text.includes('escolta') || text.includes('shooting guard')) return 'Escolta';
  if (text === 'sf' || text.includes('small forward') || (text.includes('alero') && !text.includes('ala'))) return 'Alero';
  if (
    text === 'pf' ||
    text.includes('power forward') ||
    text.includes('ala pivot') ||
    text.includes('ala-pivot') ||
    (text.includes('ala') && text.includes('pivot'))
  ) {
    return 'Ala-Pívot';
  }
  if (text === 'c' || text.includes('pivot') || text.includes('center') || text.includes('pivote')) return 'Pívot';

  return fallback;
};

export const DEFAULT_POSITION_OVERALL_CONFIG: PositionOverallConfig = {
  Base: {
    shooting_3pt: 0.15,
    shooting_2pt: 0,
    defense: 0.05,
    passing: 0.35,
    rebounding: 0,
    speed: 0.2,
    dribbling: 0.25
  },
  Escolta: {
    shooting_3pt: 0.35,
    shooting_2pt: 0.2,
    defense: 0.1,
    passing: 0,
    rebounding: 0,
    speed: 0.2,
    dribbling: 0.15
  },
  Alero: {
    shooting_3pt: 0.2,
    shooting_2pt: 0.2,
    defense: 0.2,
    passing: 0.1,
    rebounding: 0.1,
    speed: 0.2,
    dribbling: 0
  },
  'Ala-Pívot': {
    shooting_3pt: 0,
    shooting_2pt: 0.25,
    defense: 0.3,
    passing: 0.05,
    rebounding: 0.3,
    speed: 0.1,
    dribbling: 0
  },
  'Pívot': {
    shooting_3pt: 0,
    shooting_2pt: 0.2,
    defense: 0.35,
    passing: 0,
    rebounding: 0.4,
    speed: 0.05,
    dribbling: 0
  }
};

export const getDefaultPositionOverallConfig = (): PositionOverallConfig =>
  POSITION_ROLES.reduce((acc, role) => {
    acc[role] = { ...DEFAULT_POSITION_OVERALL_CONFIG[role] };
    return acc;
  }, {} as PositionOverallConfig);

const FALLBACK_POSITION_OVERALL_CONFIG = getDefaultPositionOverallConfig();

const sanitizeRoleWeights = (rawWeights: unknown, defaults: PositionOverallWeights): PositionOverallWeights => {
  if (!isRecord(rawWeights)) return { ...defaults };

  const normalized = OVERALL_STAT_KEYS.reduce((acc, stat) => {
    acc[stat] = toWeight(rawWeights[stat], defaults[stat]);
    return acc;
  }, {} as PositionOverallWeights);

  const total = OVERALL_STAT_KEYS.reduce((acc, stat) => acc + normalized[stat], 0);
  if (total <= 0) return { ...defaults };

  return normalized;
};

export const normalizePositionOverallConfig = (raw?: unknown): PositionOverallConfig => {
  const merged = getDefaultPositionOverallConfig();
  if (!isRecord(raw)) return merged;

  Object.entries(raw).forEach(([rawRole, rawWeights]) => {
    const role = resolveRoleFromText(rawRole, null);
    if (!role) return;
    merged[role] = sanitizeRoleWeights(rawWeights, DEFAULT_POSITION_OVERALL_CONFIG[role]);
  });

  return merged;
};

export const serializePositionOverallConfig = (config: PositionOverallConfig): PositionOverallConfig => {
  const normalized = normalizePositionOverallConfig(config);
  return POSITION_ROLES.reduce((acc, role) => {
    const nextRole = {} as PositionOverallWeights;
    OVERALL_STAT_KEYS.forEach((stat) => {
      nextRole[stat] = roundWeight(normalized[role][stat]);
    });
    acc[role] = nextRole;
    return acc;
  }, {} as PositionOverallConfig);
};

export const normalizePositionRole = (position: string): PositionRole =>
  resolveRoleFromText(position, 'Alero') || 'Alero';

export const fetchPositionOverallConfig = async (
  supabaseClient: SupabaseClient<any, 'public', any>
): Promise<PositionOverallConfig> => {
  const { data, error } = await supabaseClient
    .from('position_overall_config')
    .select('settings')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.warn('No se pudo cargar configuración de medias por posición. Se usan valores por defecto.', error);
    return getDefaultPositionOverallConfig();
  }

  if (!data || !isRecord(data.settings)) return getDefaultPositionOverallConfig();
  return normalizePositionOverallConfig(data.settings);
};

type WeightedPlayerStats = Partial<Record<OverallStatKey, number>> & { overall?: number | null };

export const calculateWeightedOverallForRole = (
  player: WeightedPlayerStats,
  role: PositionRole,
  config: PositionOverallConfig = FALLBACK_POSITION_OVERALL_CONFIG
) => {
  const weights = config[role] || FALLBACK_POSITION_OVERALL_CONFIG[role];

  let weightedSum = 0;
  let totalWeight = 0;

  OVERALL_STAT_KEYS.forEach((stat) => {
    const weight = Number(weights[stat] ?? 0);
    if (!Number.isFinite(weight) || weight <= 0) return;
    const rawValue = Number(player[stat] ?? 50);
    const safeValue = Number.isFinite(rawValue) ? rawValue : 50;
    weightedSum += safeValue * weight;
    totalWeight += weight;
  });

  if (totalWeight <= 0) {
    const fallbackOverall = Number(player.overall ?? 50);
    return Math.round(Number.isFinite(fallbackOverall) ? fallbackOverall : 50);
  }

  return Math.round(weightedSum / totalWeight);
};

export const calculateWeightedOverallForPosition = (
  player: WeightedPlayerStats,
  position: string,
  config: PositionOverallConfig = FALLBACK_POSITION_OVERALL_CONFIG
) => {
  const role = normalizePositionRole(position);
  return calculateWeightedOverallForRole(player, role, config);
};

export const getBestRoleAndOverall = (
  player: WeightedPlayerStats,
  config: PositionOverallConfig = FALLBACK_POSITION_OVERALL_CONFIG
) => {
  let bestRole: PositionRole = 'Alero';
  let bestOverall = Number.NEGATIVE_INFINITY;

  POSITION_ROLES.forEach((role) => {
    const roleOverall = calculateWeightedOverallForRole(player, role, config);
    if (roleOverall > bestOverall) {
      bestOverall = roleOverall;
      bestRole = role;
    }
  });

  if (!Number.isFinite(bestOverall)) {
    const fallback = Number(player.overall ?? 50);
    return {
      role: bestRole,
      overall: Math.round(Number.isFinite(fallback) ? fallback : 50)
    };
  }

  return { role: bestRole, overall: bestOverall };
};

export const getBestRoleForPlayer = (
  player: WeightedPlayerStats,
  config: PositionOverallConfig = FALLBACK_POSITION_OVERALL_CONFIG
) => getBestRoleAndOverall(player, config).role;

export const calculateWeightedOverallForBestRole = (
  player: WeightedPlayerStats,
  config: PositionOverallConfig = FALLBACK_POSITION_OVERALL_CONFIG
) => getBestRoleAndOverall(player, config).overall;

export const applyExperienceBonus = (baseOverall: number, experience?: number | null) => {
  const exp = Number(experience);
  const safeExp = Number.isFinite(exp) ? Math.max(0, exp) : 0;
  return Math.min(99, Math.round(baseOverall) + Math.floor(safeExp * 0.05));
};

export const applyFormModifier = (baseOverall: number, forma?: number | null) => {
  const rawForm = Number(forma);
  const safeForm = Number.isFinite(rawForm) ? rawForm : 80;
  const modifier = clamp(safeForm / 80, 0.4, 1.25);
  return Math.round(baseOverall * modifier);
};
