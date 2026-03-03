import type { SupabaseClient } from '@supabase/supabase-js';

export type LeagueEconomyConfig = {
  sponsorshipBase: number;
  ticketRevenueBase: number;
  venueMaintenance: number;
  trainingCostMultiplier: number;
};

export type LeagueEconomyByLevel = Record<number, LeagueEconomyConfig>;

export const ECONOMY_RULE_LEAGUE_LEVELS = [1, 2, 3] as const;
type EconomyLeagueLevel = (typeof ECONOMY_RULE_LEAGUE_LEVELS)[number];

type EconomyRuleRow = {
  league_level: number;
  sponsorship_base: number;
  ticket_revenue_base: number;
  venue_maintenance: number;
  training_cost_multiplier: number;
};

const FAN_MOOD_DEFAULT = 50;
const FAN_MOOD_EURO_FACTOR = 1000;

const DEFAULT_LEAGUE_ECONOMY_BY_LEVEL: Record<EconomyLeagueLevel, LeagueEconomyConfig> = {
  // Bronce
  1: {
    sponsorshipBase: 250000,
    ticketRevenueBase: 250000,
    venueMaintenance: 25000,
    trainingCostMultiplier: 0.35
  },
  // Plata
  2: {
    sponsorshipBase: 400000,
    ticketRevenueBase: 300000,
    venueMaintenance: 75000,
    trainingCostMultiplier: 0.4
  },
  // Oro
  3: {
    sponsorshipBase: 800000,
    ticketRevenueBase: 600000,
    venueMaintenance: 150000,
    trainingCostMultiplier: 0.45
  }
};

const isSupportedLeagueLevel = (level: number): level is EconomyLeagueLevel =>
  ECONOMY_RULE_LEAGUE_LEVELS.includes(level as EconomyLeagueLevel);

const normalizeLeagueLevel = (leagueLevel?: number | null): EconomyLeagueLevel => {
  const level = Number(leagueLevel || 1);
  return isSupportedLeagueLevel(level) ? level : 1;
};

const sanitizeNumber = (value: unknown, fallback: number, min = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
};

export const getDefaultEconomyByLevel = (): LeagueEconomyByLevel =>
  ECONOMY_RULE_LEAGUE_LEVELS.reduce((acc, level) => {
    acc[level] = { ...DEFAULT_LEAGUE_ECONOMY_BY_LEVEL[level] };
    return acc;
  }, {} as LeagueEconomyByLevel);

const FALLBACK_ECONOMY_BY_LEVEL = getDefaultEconomyByLevel();

export const mapEconomyRowsToConfig = (rows: EconomyRuleRow[] | null | undefined): LeagueEconomyByLevel => {
  const merged = getDefaultEconomyByLevel();
  if (!rows?.length) return merged;

  rows.forEach((row) => {
    const level = Number(row.league_level);
    if (!isSupportedLeagueLevel(level)) return;

    const defaults = DEFAULT_LEAGUE_ECONOMY_BY_LEVEL[level];
    merged[level] = {
      sponsorshipBase: Math.round(sanitizeNumber(row.sponsorship_base, defaults.sponsorshipBase, 0)),
      ticketRevenueBase: Math.round(sanitizeNumber(row.ticket_revenue_base, defaults.ticketRevenueBase, 0)),
      venueMaintenance: Math.round(sanitizeNumber(row.venue_maintenance, defaults.venueMaintenance, 0)),
      trainingCostMultiplier: sanitizeNumber(row.training_cost_multiplier, defaults.trainingCostMultiplier, 0.01)
    };
  });

  return merged;
};

export const fetchEconomyRules = async (
  supabaseClient: SupabaseClient<any, 'public', any>
): Promise<LeagueEconomyByLevel> => {
  const { data, error } = await supabaseClient
    .from('economy_rules')
    .select('league_level, sponsorship_base, ticket_revenue_base, venue_maintenance, training_cost_multiplier');

  if (error) {
    console.warn('No se pudieron cargar reglas económicas dinámicas. Se usan valores por defecto.', error);
    return getDefaultEconomyByLevel();
  }

  return mapEconomyRowsToConfig(data as EconomyRuleRow[] | null);
};

export const getLeagueEconomy = (
  leagueLevel?: number | null,
  economyByLevel: LeagueEconomyByLevel = FALLBACK_ECONOMY_BY_LEVEL
): LeagueEconomyConfig => {
  const level = normalizeLeagueLevel(leagueLevel);
  return economyByLevel[level] || DEFAULT_LEAGUE_ECONOMY_BY_LEVEL[level];
};

export const calculateSponsorshipAndFansIncome = (
  leagueLevel?: number | null,
  fanMood?: number | null,
  economyByLevel: LeagueEconomyByLevel = FALLBACK_ECONOMY_BY_LEVEL
) => {
  const economy = getLeagueEconomy(leagueLevel, economyByLevel);
  const safeFanMood = Number.isFinite(Number(fanMood)) ? Number(fanMood) : FAN_MOOD_DEFAULT;
  return economy.sponsorshipBase + (safeFanMood * FAN_MOOD_EURO_FACTOR);
};

export const calculateTrainingCostByLeague = (
  currentStatValue: number,
  age: number,
  leagueLevel?: number | null,
  economyByLevel: LeagueEconomyByLevel = FALLBACK_ECONOMY_BY_LEVEL
) => {
  const economy = getLeagueEconomy(leagueLevel, economyByLevel);
  const stat = Math.max(1, Number(currentStatValue || 0));
  const ageFactor = Math.max(1, Number(age || 0) - 10);
  return Math.floor(Math.pow(stat, 2) * ageFactor * economy.trainingCostMultiplier);
};
