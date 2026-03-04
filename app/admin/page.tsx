'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Settings, Users, Database, AlertTriangle, Zap, RefreshCcw, DollarSign, Activity, Eye, X, ShieldAlert, Shield, ShieldOff, Trash2, Globe, Terminal, CalendarDays, Trophy, GraduationCap, Target, Github, GitBranch } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NAMES_DB } from '@/lib/names-db';
import { getWeeklySalaryByOvr } from '@/lib/salary';
import { rollAgeAndExperience } from '@/lib/player-generation';
import { CLUB_STATUS, getSeasonDraftPoolTag, SEASON_DRAFT_POOL_PREFIX } from '@/lib/season-draft';
import {
  ECONOMY_RULE_LEAGUE_LEVELS,
  fetchEconomyRules,
  getDefaultEconomyByLevel
} from '@/lib/economy-balance';
import {
  DEFAULT_MATCH_SIMULATOR_SETTINGS,
  fetchMatchSimulatorSettings,
  normalizeMatchSimulatorSettings,
  type MatchSimulatorSettings
} from '@/lib/match-simulator-config';
import {
  POSITION_ROLES,
  fetchPositionOverallConfig,
  getDefaultPositionOverallConfig,
  normalizePositionOverallConfig,
  serializePositionOverallConfig,
  type OverallStatKey,
  type PositionOverallConfig,
  type PositionRole
} from '@/lib/position-overall-config';
import {
  DEFAULT_GITHUB_INTEGRATION_CONFIG,
  fetchGitHubIntegrationConfig,
  normalizeGitHubIntegrationConfig,
  serializeGitHubIntegrationConfig,
  type GitHubIntegrationConfig
} from '@/lib/github-integration-config';

// --- MASIVE DATA GENERATION LISTS (10x Bigger) ---
const CIUDADES = [
  "Madrid", "Barcelona", "Valencia", "Sevilla", "Zaragoza", "Málaga", "Murcia", "Palma", "Bilbao", "Alicante", "Córdoba", "Valladolid", "Vigo", "Gijón", "Granada", "Elche", "Oviedo", "Badalona", "Cartagena", "Jerez", "Pamplona", "Almería", "San Sebastián", "Burgos", "Santander", "Castellón", "Logroño", "Badajoz", "Salamanca", "Huelva", "Lleida", "Tarragona", "León", "Cádiz", "Jaén", "Ourense", "Lugo", "Girona", "Cáceres", "Toledo", "Pontevedra", "Palencia", "Soria", "Segovia", "Ávila", "Cuenca", "Zamora", "Huesca", "Teruel", "Ibiza", "Menorca", "Tenerife", "Canarias", "Andorra",
  "London", "Paris", "Berlin", "Rome", "Athens", "Lisbon", "Amsterdam", "Dublin", "Vienna", "Prague", "Warsaw", "Budapest", "Stockholm", "Oslo", "Copenhagen", "Helsinki", "Brussels", "Monaco", "Milan", "Naples", "Munich", "Frankfurt", "Hamburg", "Lyon", "Marseille", "Porto", "Geneva", "Zurich", "Istanbul", "Moscow", "Kiev",
  "New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego", "Dallas", "Austin", "Miami", "Boston", "Seattle", "Denver", "Atlanta", "Detroit", "Portland", "Memphis", "Orlando", "Brooklyn", "Toronto", "Montreal", "Vancouver", "Mexico City", "Buenos Aires", "Rio", "Sao Paulo", "Santiago", "Bogota", "Lima",
  "Tokyo", "Seoul", "Beijing", "Shanghai", "Bangkok", "Manila", "Sydney", "Melbourne", "Auckland", "Cairo", "Cape Town", "Lagos", "Nairobi", "Dubai", "Doha"
];

const MASCOTAS = [
  "Lions", "Tigers", "Bears", "Eagles", "Sharks", "Panthers", "Wolves", "Bulls", "Hawks", "Knights", "Kings", "Pirates", "Spartans", "Titans", "Vipers", "Falcons", "Ravens", "Scorpions", "Rangers", "Rebels", "Wildcats", "Mustangs", "Dragons", "Celtics", "Lakers", "Heat", "Warriors", "Rockets", "Spurs", "Mavericks", "Clippers", "Suns", "Nuggets", "Jazz", "Blazers", "Thunder", "Timberwolves", "Pelicans", "Grizzlies", "Bucks", "Pacers", "Cavaliers", "Pistons", "Bulls", "Knicks", "Nets", "76ers", "Raptors", "Magic", "Wizards", "Hornets", "Magic",
  "Phantoms", "Griffins", "Gargoyles", "Comets", "Meteors", "Gladiators", "Samurais", "Ninjas", "Vikings", "Pirates", "Corsairs", "Bucaneers", "Crusaders", "Templars", "Paladins", "Warlords", "Chieftains", "Emperors", "Pharaohs", "Sultans", "Tzars", "Shoguns",
  "Cyclones", "Hurricanes", "Tornadoes", "Blizzards", "Avalanches", "Tsunamis", "Volcanoes", "Earthquakes", "Thunders", "Lightnings", "Storms", "Typhoons", "Monsoons", "Infernos", "Wildfires",
  "Cobras", "Pythons", "Boas", "Rattlers", "Gators", "Crocs", "Rhinos", "Hippos", "Elephants", "Mammoths", "Sabertooths", "Gorillas", "Apes", "Chimps", "Baboons", "Kondors", "Vultures", "Owls", "Crows", "Jays", "Cardinals", "Robins", "Bluebirds", "Seagulls", "Pelicans", "Penguins", "Dolphins", "Whales", "Orcas", "Marlins", "Stingrays", "Mantas", "Octopuses", "Squids", "Krakens", "Leviathans", "Hydras", "Basilisks", "Chimera", "Minotaurs", "Centaurs", "Pegasus", "Unicorns", "Phoenixes", "Thunderbirds"
];

const POSITIONS = ["Base", "Escolta", "Alero", "Ala-Pívot", "Pívot"];
const UNIVERSE_TEAM_POSITIONS = ["Base", "Base", "Escolta", "Escolta", "Alero", "Alero", "Ala-Pívot", "Ala-Pívot", "Pívot", "Pívot"];
const NAME_COUNTRIES = Object.keys(NAMES_DB);
const FORMAS = ['modern', 'classic', 'circle', 'hexagon', 'square'];
const COLORES = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#64748b', '#71717a', '#737373', '#78716c', '#1f2937', '#111827', '#0f172a', '#450a0a', '#422006', '#022c22', '#082f49', '#1e1b4b', '#4a044e'];
const DRAFT_POOL_POSITIONS = ["Base", "Escolta", "Alero", "Ala-Pívot", "Pívot"];

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

type AdminEconomyRule = {
  leagueLevel: number;
  sponsorshipBase: number;
  ticketRevenueBase: number;
  venueMaintenance: number;
  trainingCostMultiplier: number;
};

type AdminSection = 'users' | 'operations';

const LEAGUE_LEVEL_LABELS: Record<number, string> = {
  1: 'Bronce',
  2: 'Plata',
  3: 'Oro'
};

const buildAdminEconomyRulesFromConfig = (configByLevel: Record<number, {
  sponsorshipBase: number;
  ticketRevenueBase: number;
  venueMaintenance: number;
  trainingCostMultiplier: number;
}>): AdminEconomyRule[] =>
  ECONOMY_RULE_LEAGUE_LEVELS.map((leagueLevel) => {
    const config = configByLevel[leagueLevel];
    return {
      leagueLevel,
      sponsorshipBase: config?.sponsorshipBase ?? 0,
      ticketRevenueBase: config?.ticketRevenueBase ?? 0,
      venueMaintenance: config?.venueMaintenance ?? 0,
      trainingCostMultiplier: config?.trainingCostMultiplier ?? 0.35
    };
  });

type SimulatorFieldMeta = {
  key: keyof MatchSimulatorSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  hint?: string;
};

type PositionWeightFieldMeta = {
  key: OverallStatKey;
  label: string;
  min: number;
  max: number;
  step: number;
};

const POSITION_WEIGHT_ROLE_LABELS: Record<PositionRole, string> = {
  Base: 'Base',
  Escolta: 'Escolta',
  Alero: 'Alero',
  'Ala-Pívot': 'Ala-Pívot',
  'Pívot': 'Pívot'
};

const POSITION_WEIGHT_FIELDS: PositionWeightFieldMeta[] = [
  { key: 'shooting_3pt', label: 'Triples', min: 0, max: 1, step: 0.01 },
  { key: 'shooting_2pt', label: 'T2', min: 0, max: 1, step: 0.01 },
  { key: 'defense', label: 'Defensa', min: 0, max: 1, step: 0.01 },
  { key: 'passing', label: 'Pase', min: 0, max: 1, step: 0.01 },
  { key: 'rebounding', label: 'Rebote', min: 0, max: 1, step: 0.01 },
  { key: 'speed', label: 'Velocidad', min: 0, max: 1, step: 0.01 },
  { key: 'dribbling', label: 'Bote', min: 0, max: 1, step: 0.01 }
];

const SIMULATOR_FIELD_GROUPS: Array<{
  title: string;
  fields: SimulatorFieldMeta[];
}> = [
  {
    title: 'Ritmo',
    fields: [
      { key: 'quarterDurationSeconds', label: 'Segundos por cuarto', min: 120, max: 1200, step: 1, hint: '600 = 10:00' },
      { key: 'possessionMinSeconds', label: 'Posesión mínima', min: 4, max: 40, step: 1, hint: 'Segundos' },
      { key: 'possessionMaxSeconds', label: 'Posesión máxima', min: 6, max: 45, step: 1, hint: 'Segundos' }
    ]
  },
  {
    title: 'Tiro',
    fields: [
      { key: 'threePointAttemptRate', label: 'Frecuencia triples', min: 0.05, max: 0.8, step: 0.01, hint: '0.35 = 35%' },
      { key: 'assistRate', label: 'Frecuencia asistencias', min: 0.05, max: 0.95, step: 0.01, hint: '0.35 = 35%' },
      { key: 'baseTwoPointChance', label: 'Acierto base T2', min: 5, max: 95, step: 0.1, hint: 'Probabilidad %' },
      { key: 'baseThreePointChance', label: 'Acierto base T3', min: 5, max: 95, step: 0.1, hint: 'Probabilidad %' },
      { key: 'shotAttackerEnergyImpact', label: 'Impacto energía atacante', min: -2, max: 2, step: 0.01 },
      { key: 'shotDefenderEnergyImpact', label: 'Impacto energía defensor', min: -2, max: 2, step: 0.01 },
      { key: 'shotSkillImpact', label: 'Impacto diferencia skill', min: -2, max: 2, step: 0.01 },
      { key: 'shotAverageQualityImpact', label: 'Impacto nivel medio liga', min: 0, max: 2, step: 0.01 },
      { key: 'shotChanceMin', label: 'Suelo prob. tiro', min: 1, max: 95, step: 0.1, hint: 'Probabilidad %' },
      { key: 'shotChanceMax', label: 'Techo prob. tiro', min: 5, max: 99, step: 0.1, hint: 'Probabilidad %' }
    ]
  },
  {
    title: 'Pérdidas y rebote',
    fields: [
      { key: 'turnoverBaseChance', label: 'Pérdida base', min: 0, max: 60, step: 0.1, hint: 'Probabilidad %' },
      { key: 'turnoverLowEnergyImpact', label: 'Impacto fatiga atacante', min: 0, max: 5, step: 0.01 },
      { key: 'turnoverDefenseEnergyImpact', label: 'Impacto energía defensor', min: 0, max: 5, step: 0.01 },
      { key: 'turnoverAverageQualityImpact', label: 'Impacto nivel medio liga', min: 0, max: 2, step: 0.01 },
      { key: 'turnoverChanceMin', label: 'Suelo prob. pérdida', min: 0, max: 95, step: 0.1, hint: 'Probabilidad %' },
      { key: 'turnoverChanceMax', label: 'Techo prob. pérdida', min: 1, max: 99, step: 0.1, hint: 'Probabilidad %' },
      { key: 'offensiveReboundRate', label: 'Rebote ofensivo', min: 0.1, max: 0.9, step: 0.01, hint: '0.55 = 55%' }
    ]
  },
  {
    title: 'Energía',
    fields: [
      { key: 'onCourtQuarterRecovery', label: 'Recuperación titulares/Q', min: 0, max: 100, step: 0.1 },
      { key: 'benchQuarterRecovery', label: 'Recuperación banquillo/Q', min: 0, max: 100, step: 0.1 },
      { key: 'benchPossessionRecovery', label: 'Recuperación banquillo/posesión', min: 0, max: 10, step: 0.01 },
      { key: 'drainAttackBase', label: 'Gasto base en ataque', min: 0, max: 10, step: 0.01 },
      { key: 'drainDefenseBase', label: 'Gasto base en defensa', min: 0, max: 10, step: 0.01 },
      { key: 'drainPerPossessionSecond', label: 'Gasto por segundo de posesión', min: 0, max: 2, step: 0.001 }
    ]
  },
  {
    title: 'Desempate',
    fields: [
      { key: 'tieBreakerStrengthImpact', label: 'Impacto fuerza en desempate', min: 0, max: 10, step: 0.01 },
      { key: 'tieBreakerMinChance', label: 'Suelo victoria local', min: 1, max: 99, step: 0.1, hint: 'Probabilidad %' },
      { key: 'tieBreakerMaxChance', label: 'Techo victoria local', min: 1, max: 99, step: 0.1, hint: 'Probabilidad %' },
      { key: 'tieBreakerPoints', label: 'Puntos de desempate', min: 1, max: 10, step: 1 }
    ]
  }
];

export default function AdminDashboard() {
  const router = useRouter();
  
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({ players: 0, freeAgents: 0, teams: 0 });

  const [usersList, setUsersList] = useState<any[]>([]);
  const [observingUser, setObservingUser] = useState<any | null>(null);
  const [observedRoster, setObservedRoster] = useState<any[]>([]);
  const [economyRules, setEconomyRules] = useState<AdminEconomyRule[]>(
    buildAdminEconomyRulesFromConfig(getDefaultEconomyByLevel())
  );
  const [economyLoading, setEconomyLoading] = useState(false);
  const [economySaving, setEconomySaving] = useState(false);
  const [simulatorSettings, setSimulatorSettings] = useState<MatchSimulatorSettings>(DEFAULT_MATCH_SIMULATOR_SETTINGS);
  const [simulatorLoading, setSimulatorLoading] = useState(false);
  const [simulatorSaving, setSimulatorSaving] = useState(false);
  const [positionOverallConfig, setPositionOverallConfig] = useState<PositionOverallConfig>(getDefaultPositionOverallConfig());
  const [positionConfigLoading, setPositionConfigLoading] = useState(false);
  const [positionConfigSaving, setPositionConfigSaving] = useState(false);
  const [githubConfig, setGithubConfig] = useState<GitHubIntegrationConfig>(DEFAULT_GITHUB_INTEGRATION_CONFIG);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubSaving, setGithubSaving] = useState(false);
  const [githubSyncing, setGithubSyncing] = useState(false);
  const [activeSection, setActiveSection] = useState<AdminSection>('users');

  useEffect(() => {
    const verifyAdmin = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }

        const { data } = await supabase.from('managers').select('is_admin').eq('owner_id', user.id).single();
        
        if (data && data.is_admin === true) {
            setIsAuthorized(true);
            loadStats();
            loadUsers();
            loadEconomyRules();
            loadSimulatorSettings();
            loadPositionOverallConfig();
            loadGitHubConfig();
        } else {
            router.push('/');
        }
    };
    verifyAdmin();
  }, [router]);

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  };

  const getRandomIdentity = () => {
    const nationality = NAME_COUNTRIES[Math.floor(Math.random() * NAME_COUNTRIES.length)];
    const pool = NAMES_DB[nationality];
    const firstName = pool.first[Math.floor(Math.random() * pool.first.length)];
    const lastName = pool.last[Math.floor(Math.random() * pool.last.length)];
    return { nationality, fullName: `${firstName} ${lastName}` };
  };

  const getDraftOvrRangeByPick = (pickIndex: number, totalTeams: number) => {
    const safeTotal = Math.max(1, totalTeams - 1);
    const ratio = pickIndex / safeTotal;

    if (ratio <= 0.25) return { min: 69, max: 80 };
    if (ratio <= 0.5) return { min: 65, max: 75 };
    if (ratio <= 0.75) return { min: 61, max: 71 };
    return { min: 57, max: 67 };
  };

  const buildDraftProspect = ({
    teamId,
    pickIndex,
    totalTeams,
    position,
    directSign
  }: {
    teamId: string;
    pickIndex: number;
    totalTeams: number;
    position: string;
    directSign: boolean;
  }) => {
    const { nationality, fullName } = getRandomIdentity();
    const { min, max } = getDraftOvrRangeByPick(pickIndex, totalTeams);
    const ovr = clamp(Math.floor(Math.random() * (max - min + 1)) + min + Math.floor(Math.random() * 3) - 1, min, max);
    const baseStat = () => clamp(ovr + Math.floor(Math.random() * 15) - 7, 40, 99);
    const { age, experience } = rollAgeAndExperience(18, 20, 'rookie');
    const isGuard = position === 'Base' || position === 'Escolta';

    return {
      team_id: directSign ? teamId : null,
      lineup_pos: directSign ? 'BENCH' : getSeasonDraftPoolTag(teamId),
      name: fullName,
      nationality,
      position,
      age,
      height: isGuard ? Math.floor(Math.random() * 14) + 184 : Math.floor(Math.random() * 16) + 198,
      overall: ovr,
      shooting_3pt: baseStat(),
      shooting_2pt: baseStat(),
      defense: baseStat(),
      passing: baseStat(),
      rebounding: baseStat(),
      speed: baseStat(),
      dribbling: baseStat(),
      stamina: 100,
      experience: Math.max(1, experience),
      salary: getWeeklySalaryByOvr(ovr)
    };
  };

  const loadStats = async () => {
    const { count: playersCount } = await supabase.from('players').select('*', { count: 'exact', head: true });
    const { count: freeAgentsCount } = await supabase.from('players').select('*', { count: 'exact', head: true }).is('team_id', null);
    const { count: teamsCount } = await supabase.from('clubes').select('*', { count: 'exact', head: true });
    
    setStats({ players: playersCount || 0, freeAgents: freeAgentsCount || 0, teams: teamsCount || 0 });
  };

  const loadUsers = async () => {
    try {
        const { data: managers } = await supabase.from('managers').select('*').order('created_at', { ascending: false });
        const { data: clubes } = await supabase.from('clubes').select('*');
        
        if (managers && clubes) {
            const combined = managers.map(m => {
                const club = clubes.find(c => c.owner_id === m.owner_id);
                return { manager: m, club: club || null };
            });
            setUsersList(combined);
        }
    } catch (err) {
        addLog("❌ Error cargando lista de usuarios.");
    }
  };

  const loadEconomyRules = async () => {
    setEconomyLoading(true);
    try {
      const configByLevel = await fetchEconomyRules(supabase);
      setEconomyRules(buildAdminEconomyRulesFromConfig(configByLevel));
    } catch (err: any) {
      addLog(`❌ Error cargando reglas económicas: ${err?.message || 'fallo desconocido'}`);
      setEconomyRules(buildAdminEconomyRulesFromConfig(getDefaultEconomyByLevel()));
    } finally {
      setEconomyLoading(false);
    }
  };

  const updateEconomyRuleField = (
    leagueLevel: number,
    field: keyof Omit<AdminEconomyRule, 'leagueLevel'>,
    rawValue: string
  ) => {
    setEconomyRules((prev) =>
      prev.map((rule) => {
        if (rule.leagueLevel !== leagueLevel) return rule;

        const parsed = Number(rawValue);
        const currentValue = rule[field];
        const safeValue = Number.isFinite(parsed) ? parsed : currentValue;

        if (field === 'trainingCostMultiplier') {
          return { ...rule, [field]: clamp(safeValue, 0.01, 5) };
        }

        return { ...rule, [field]: Math.max(0, Math.round(safeValue)) };
      })
    );
  };

  const saveEconomyRules = async () => {
    if (economySaving) return;

    setEconomySaving(true);
    try {
      const payload = economyRules.map((rule) => ({
        league_level: rule.leagueLevel,
        sponsorship_base: Math.max(0, Math.round(rule.sponsorshipBase)),
        ticket_revenue_base: Math.max(0, Math.round(rule.ticketRevenueBase)),
        venue_maintenance: Math.max(0, Math.round(rule.venueMaintenance)),
        training_cost_multiplier: Number(clamp(rule.trainingCostMultiplier, 0.01, 5).toFixed(4))
      }));

      const { error } = await supabase
        .from('economy_rules')
        .upsert(payload, { onConflict: 'league_level' });

      if (error) throw error;

      addLog('💼 Reglas económicas guardadas en comisionado.');
      await loadEconomyRules();
    } catch (err: any) {
      addLog(`❌ Error guardando reglas económicas: ${err?.message || 'fallo desconocido'}`);
    } finally {
      setEconomySaving(false);
    }
  };

  const loadSimulatorSettings = async () => {
    setSimulatorLoading(true);
    try {
      const settings = await fetchMatchSimulatorSettings(supabase);
      setSimulatorSettings(settings);
    } catch (err: any) {
      addLog(`❌ Error cargando configuración de simulador: ${err?.message || 'fallo desconocido'}`);
      setSimulatorSettings(DEFAULT_MATCH_SIMULATOR_SETTINGS);
    } finally {
      setSimulatorLoading(false);
    }
  };

  const updateSimulatorSetting = (key: keyof MatchSimulatorSettings, rawValue: string) => {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return;
    setSimulatorSettings((prev) => normalizeMatchSimulatorSettings({ ...prev, [key]: parsed }));
  };

  const saveSimulatorSettings = async () => {
    if (simulatorSaving) return;

    setSimulatorSaving(true);
    try {
      const normalized = normalizeMatchSimulatorSettings(simulatorSettings);
      const { error } = await supabase
        .from('match_simulator_config')
        .upsert(
          {
            id: 1,
            settings: normalized
          },
          { onConflict: 'id' }
        );

      if (error) throw error;

      setSimulatorSettings(normalized);
      addLog('🏀 Configuración del simulador guardada.');
    } catch (err: any) {
      addLog(`❌ Error guardando configuración del simulador: ${err?.message || 'fallo desconocido'}`);
    } finally {
      setSimulatorSaving(false);
    }
  };

  const loadPositionOverallConfig = async () => {
    setPositionConfigLoading(true);
    try {
      const config = await fetchPositionOverallConfig(supabase);
      setPositionOverallConfig(config);
    } catch (err: any) {
      addLog(`❌ Error cargando medias por posición: ${err?.message || 'fallo desconocido'}`);
      setPositionOverallConfig(getDefaultPositionOverallConfig());
    } finally {
      setPositionConfigLoading(false);
    }
  };

  const updatePositionOverallField = (role: PositionRole, stat: OverallStatKey, rawValue: string) => {
    setPositionOverallConfig((prev) => {
      const parsed = Number(rawValue);
      const current = prev[role]?.[stat] ?? 0;
      const nextValue = Number.isFinite(parsed) ? clamp(parsed, 0, 1) : current;
      return {
        ...prev,
        [role]: {
          ...prev[role],
          [stat]: nextValue
        }
      };
    });
  };

  const savePositionOverallConfig = async () => {
    if (positionConfigSaving) return;

    setPositionConfigSaving(true);
    try {
      const normalized = normalizePositionOverallConfig(positionOverallConfig);
      const payload = serializePositionOverallConfig(normalized);
      const { error } = await supabase
        .from('position_overall_config')
        .upsert(
          {
            id: 1,
            settings: payload
          },
          { onConflict: 'id' }
        );

      if (error) throw error;

      setPositionOverallConfig(normalized);
      addLog('📊 Configuración de medias por posición guardada.');
    } catch (err: any) {
      addLog(`❌ Error guardando medias por posición: ${err?.message || 'fallo desconocido'}`);
    } finally {
      setPositionConfigSaving(false);
    }
  };

  const loadGitHubConfig = async () => {
    setGithubLoading(true);
    try {
      const config = await fetchGitHubIntegrationConfig(supabase);
      setGithubConfig(config);
    } catch (err: any) {
      addLog(`❌ Error cargando integración GitHub: ${err?.message || 'fallo desconocido'}`);
      setGithubConfig(DEFAULT_GITHUB_INTEGRATION_CONFIG);
    } finally {
      setGithubLoading(false);
    }
  };

  const updateGitHubConfigField = (field: 'owner' | 'repo' | 'branch', rawValue: string) => {
    setGithubConfig((prev) => ({ ...prev, [field]: rawValue }));
  };

  const saveGitHubConfig = async () => {
    if (githubSaving) return;

    setGithubSaving(true);
    try {
      const normalized = normalizeGitHubIntegrationConfig(githubConfig);
      const payload = serializeGitHubIntegrationConfig(normalized);

      const { error } = await supabase
        .from('github_integration_config')
        .upsert(
          {
            id: 1,
            owner: payload.owner,
            repo: payload.repo,
            branch: payload.branch
          },
          { onConflict: 'id' }
        );

      if (error) throw error;

      setGithubConfig((prev) => ({ ...prev, ...normalized }));
      addLog(`🐙 Configuración GitHub guardada (${payload.owner}/${payload.repo}#${payload.branch}).`);
    } catch (err: any) {
      addLog(`❌ Error guardando integración GitHub: ${err?.message || 'fallo desconocido'}`);
    } finally {
      setGithubSaving(false);
    }
  };

  const syncGitHubRepository = async () => {
    if (githubSyncing) return;

    setGithubSyncing(true);
    try {
      const normalized = normalizeGitHubIntegrationConfig(githubConfig);
      const payload = serializeGitHubIntegrationConfig(normalized);

      const { error: saveError } = await supabase
        .from('github_integration_config')
        .upsert(
          {
            id: 1,
            owner: payload.owner,
            repo: payload.repo,
            branch: payload.branch
          },
          { onConflict: 'id' }
        );

      if (saveError) throw saveError;

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error('Tu sesión no tiene access token. Cierra sesión y vuelve a entrar.');
      }

      const response = await fetch('/api/github/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || `Sync GitHub falló (HTTP ${response.status}).`);
      }

      if (result.config) {
        setGithubConfig(normalizeGitHubIntegrationConfig(result.config));
      } else {
        await loadGitHubConfig();
      }

      const shortSha =
        typeof result?.commit?.sha === 'string' && result.commit.sha.length > 0
          ? result.commit.sha.slice(0, 7)
          : 'sin sha';

      addLog(`✅ GitHub sincronizado (${shortSha}) para ${payload.owner}/${payload.repo}#${payload.branch}.`);
    } catch (err: any) {
      addLog(`❌ Error sincronizando GitHub: ${err?.message || 'fallo desconocido'}`);
      await loadGitHubConfig();
    } finally {
      setGithubSyncing(false);
    }
  };

  const formatGitHubSyncDate = (value: string | null) => {
    if (!value) return 'Nunca';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString('es-ES');
  };

  // --- MODO OBSERVADOR Y GESTIÓN DE USUARIOS ---
  const openObserverMode = async (userData: any) => {
      setLoading(true);
      try {
          if (userData.club) {
              const { data: players } = await supabase.from('players').select('*').eq('team_id', userData.club.id);
              setObservedRoster(players || []);
          } else {
              setObservedRoster([]);
          }
          setObservingUser(userData);
          addLog(`👁️ Observando a ${userData.manager.nombre}`);
      } catch (err) {
          addLog("❌ Error al abrir modo observador.");
      } finally {
          setLoading(false);
      }
  };

  const closeObserverMode = () => {
      setObservingUser(null);
      setObservedRoster([]);
  };

  const toggleAdminRole = async (managerId: number, currentStatus: boolean, managerName: string) => {
      if (!confirm(`¿Seguro que quieres ${currentStatus ? 'QUITAR' : 'DAR'} permisos de administrador a ${managerName}?`)) return;
      setLoading(true);
      try {
          const { error } = await supabase.from('managers').update({ is_admin: !currentStatus }).eq('id', managerId);
          if (error) throw error;
          addLog(`🛡️ Permisos actualizados para ${managerName}.`);
          loadUsers();
      } catch (err: any) {
          addLog(`❌ Error: ${err.message}`);
      } finally {
          setLoading(false);
      }
  };

  const deleteUserData = async (managerId: number, clubId: any, managerName: string, authOwnerId: string) => {
      if (!confirm(`⚠️ ANIQUILACIÓN TOTAL ⚠️\nVas a borrar por completo la cuenta de ${managerName} y resetear su equipo a BOT.\n¿Estás absolutamente seguro?`)) return;
      
      setLoading(true);
      addLog(`⚙️ Iniciando protocolo de borrado TOTAL para ${managerName}...`);

      try {
          if (!authOwnerId) throw new Error("Falta el ID de registro del usuario.");

          const { data: userClubs } = await supabase.from('clubes').select('id').eq('owner_id', authOwnerId);
          
          if (userClubs && userClubs.length > 0) {
              for (const club of userClubs) {
                  await supabase.from('players').update({ team_id: null }).eq('team_id', club.id);
                  const randomSuffix = Math.floor(Math.random() * 9999);
                  await supabase.from('clubes').update({
                      owner_id: null,
                      is_bot: true,
                      nombre: `Bot Team ${randomSuffix}`,
                      presupuesto: 500000,
                      color_primario: '#64748b',
                      escudo_forma: 'classic'
                  }).eq('id', club.id);
              }
              addLog(`🤖 Equipo(s) purgado(s) y convertido(s) en Bot.`);
          }

          const { error: errManager } = await supabase.from('managers').delete().eq('owner_id', authOwnerId);
          if (errManager) throw new Error("Fallo al borrar perfiles de mánager.");
          
          const { error: errAuth } = await supabase.rpc('delete_auth_user', { target_uid: authOwnerId });
          if (errAuth) throw new Error("Fallo al borrar la cuenta en Auth.");
          
          addLog(`💀 Cuenta de registro (Auth) aniquilada.`);
          addLog(`🗑️ Usuario ${managerName} borrado permanentemente.`);
          
          loadUsers();
          loadStats();

      } catch (err: any) {
          addLog(`❌ Error crítico: ${err.message}`);
      } finally {
          setLoading(false);
      }
  };

  // --- HERRAMIENTAS DE BASE DE DATOS ---
  const generateRookies = async (amount: number) => {
    if (!confirm(`¿Estás seguro de generar ${amount} jugadores nuevos?`)) return;
    setLoading(true);
    addLog(`Generando ${amount} Rookies...`);

    const newPlayers = [];
    for (let i = 0; i < amount; i++) {
        const { nationality, fullName } = getRandomIdentity();
        const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
        const baseStat = () => Math.floor(Math.random() * 35) + 50;
        const { age, experience } = rollAgeAndExperience(19, 23, 'prospect');
        const baseOverall = 60 + Math.floor(experience * 0.05);

        newPlayers.push({
            name: fullName,
            nationality: nationality || 'USA',
            position: pos,
            age,
            height: Math.floor(Math.random() * 35) + 185,
            shooting_3pt: baseStat(), shooting_2pt: baseStat(),
            defense: baseStat(), passing: baseStat(),
            rebounding: baseStat(), speed: baseStat(),
            dribbling: baseStat(), stamina: Math.floor(Math.random() * 20) + 80,
            experience: Math.max(1, experience),
            overall: baseOverall,
            salary: getWeeklySalaryByOvr(baseOverall),
            team_id: null,
            lineup_pos: null
        });
    }

    try {
        await supabase.from('players').insert(newPlayers);
        addLog(`✅ ${amount} jugadores creados.`);
        loadStats();
    } catch (err: any) { addLog(`❌ Error: ${err.message}`); } 
    finally { setLoading(false); }
  };

  const clearMarket = async () => {
    if (!confirm("⚠️ Esto borrará a los agentes libres. ¿Continuar?")) return;
    setLoading(true);
    try {
        await supabase.from('players').delete().is('team_id', null);
        addLog(`✅ Mercado vaciado.`);
        loadStats();
    } catch (err: any) { addLog(`❌ Error: ${err.message}`); } 
    finally { setLoading(false); }
  };

  // --- BIG BANG: GENERADOR DE UNIVERSO ---
  const generarUniverso = async () => {
    if (!confirm('¿Seguro que quieres generar el universo? Esto rellenará todos los grupos con equipos y 10 jugadores por equipo.')) return;
    
    setIsGenerating(true);
    setProgress(0);
    addLog("Iniciando secuencia de creación de universo (BIG BANG)...");

    try {
      const { data: ligas } = await supabase.from('ligas').select('*');
      const { data: grupos } = await supabase.from('grupos_liga').select('*');
      
      if (!ligas || !grupos) throw new Error("Faltan ligas o grupos en la BD.");
      addLog(`Encontrados ${grupos.length} grupos en ${ligas.length} divisiones.`);

      let gruposProcesados = 0;

      for (const grupo of grupos) {
        addLog(`Analizando ${grupo.nombre}...`);
        
        const liga = ligas.find(l => l.id === grupo.liga_id);
        const minOvr = liga?.min_ovr || 40;
        const maxOvr = liga?.max_ovr || 70;

        const { data: equiposActuales } = await supabase.from('clubes').select('id').eq('grupo_id', grupo.id);
        const cantidadActual = equiposActuales?.length || 0;
        const botsFaltantes = 8 - cantidadActual;

        if (botsFaltantes > 0) {
          addLog(`  -> Faltan ${botsFaltantes} equipos. Generando bots...`);
          
          const nuevosBots = [];
          for (let i = 0; i < botsFaltantes; i++) {
            const ciudad = CIUDADES[Math.floor(Math.random() * CIUDADES.length)];
            const mascota = MASCOTAS[Math.floor(Math.random() * MASCOTAS.length)];
            nuevosBots.push({
              nombre: `${ciudad} ${mascota}`,
              is_bot: true,
              league_id: grupo.liga_id,
              grupo_id: grupo.id,
              color_primario: COLORES[Math.floor(Math.random() * COLORES.length)],
              color_secundario: '#0f172a',
              escudo_forma: FORMAS[Math.floor(Math.random() * FORMAS.length)],
              jersey_home: 'solid',
              jersey_away: 'solid',
              presupuesto: 500000
            });
          }

          const { data: clubesInsertados, error: errClubes } = await supabase
            .from('clubes')
            .insert(nuevosBots)
            .select('id');

          if (errClubes) throw errClubes;

          const todosLosJugadores = [];
          for (const club of clubesInsertados || []) {
            for (let i = 0; i < UNIVERSE_TEAM_POSITIONS.length; i++) {
              const pos = UNIVERSE_TEAM_POSITIONS[i];
              const { nationality, fullName } = getRandomIdentity();
              const { age, experience } = rollAgeAndExperience(22, 33, 'rotation');
              const ovr = Math.floor(Math.random() * (maxOvr - minOvr + 1)) + minOvr;
              const baseStat = () => Math.max(35, Math.min(99, ovr + Math.floor(Math.random() * 10 - 5)));
              const isGuard = pos === 'Base' || pos === 'Escolta';

              todosLosJugadores.push({
                team_id: club.id,
                name: fullName,
                nationality,
                position: pos,
                age,
                height: isGuard ? Math.floor(Math.random() * 15) + 185 : Math.floor(Math.random() * 15) + 200,
                overall: ovr,
                shooting_3pt: baseStat(),
                shooting_2pt: baseStat(),
                defense: baseStat(),
                passing: baseStat(),
                rebounding: baseStat(),
                speed: baseStat(),
                dribbling: baseStat(),
                stamina: 100,
                experience,
                lineup_pos: 'BENCH',
                salary: getWeeklySalaryByOvr(ovr)
              });
            }
          }

          const { error: errPlayers } = await supabase.from('players').insert(todosLosJugadores);
          if (errPlayers) throw errPlayers;
          
          addLog(`  -> ${todosLosJugadores.length} jugadores creados para ${botsFaltantes} equipos.`);
        } else {
          addLog(`  -> Grupo completo (8/8). Saltando...`);
        }

        gruposProcesados++;
        setProgress(Math.round((gruposProcesados / grupos.length) * 100));
      }

      addLog("¡UNIVERSO GENERADO CON ÉXITO! Todos los grupos tienen 8 equipos y plantillas llenas.");
      loadStats();

    } catch (err: any) {
      addLog(`❌ ERROR CRÍTICO: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const iniciarDraftTemporada = async () => {
    if (!confirm('¿Iniciar evento de Draft de Temporada? Se crearán prospectos para usuarios y se bloqueará el inicio de liga hasta que completen su pick.')) return;

    setIsGenerating(true);
    setProgress(0);
    setLogs([]);
    addLog('🎓 Iniciando evento de Draft de Temporada...');

    try {
      const [{ data: grupos, error: gruposError }, { data: clubes, error: clubesError }] = await Promise.all([
        supabase.from('grupos_liga').select('id, nombre'),
        supabase.from('clubes').select('id, nombre, grupo_id, pts, v, d, is_bot, status').not('grupo_id', 'is', null)
      ]);

      if (gruposError) throw gruposError;
      if (clubesError) throw clubesError;
      if (!grupos?.length || !clubes?.length) throw new Error('No hay grupos/equipos disponibles para montar el draft.');

      addLog(`Grupos detectados: ${grupos.length}. Equipos en liga: ${clubes.length}.`);

      // Limpieza de restos de draft de temporada anterior (pool no asignado).
      const { data: oldPool } = await supabase
        .from('players')
        .select('id')
        .is('team_id', null)
        .like('lineup_pos', `${SEASON_DRAFT_POOL_PREFIX}%`);

      if (oldPool && oldPool.length > 0) {
        const chunk = 500;
        for (let i = 0; i < oldPool.length; i += chunk) {
          const ids = oldPool.slice(i, i + chunk).map(p => p.id);
          const { error } = await supabase.from('players').delete().in('id', ids);
          if (error) throw error;
        }
        addLog(`Pool previo eliminado: ${oldPool.length} prospectos.`);
      }

      const humanClubIds: string[] = [];
      const botClubIds: string[] = [];
      const prospectsToInsert: any[] = [];
      let processedGroups = 0;

      for (const grupo of grupos) {
        const teamsInGroup = (clubes || [])
          .filter((c: any) => c.grupo_id === grupo.id && c.status !== CLUB_STATUS.ROOKIE_DRAFT);

        if (teamsInGroup.length === 0) {
          processedGroups++;
          setProgress(Math.round((processedGroups / grupos.length) * 100));
          continue;
        }

        // Peor balance primero (mejor pick).
        teamsInGroup.sort((a: any, b: any) => {
          const ptsDiff = Number(a.pts || 0) - Number(b.pts || 0);
          if (ptsDiff !== 0) return ptsDiff;
          const winsDiff = Number(a.v || 0) - Number(b.v || 0);
          if (winsDiff !== 0) return winsDiff;
          const lossesDiff = Number(b.d || 0) - Number(a.d || 0);
          if (lossesDiff !== 0) return lossesDiff;
          return String(a.id).localeCompare(String(b.id));
        });

        teamsInGroup.forEach((team: any, pickIndex: number) => {
          const teamId = String(team.id);
          if (team.is_bot) {
            botClubIds.push(teamId);
            const randomPos = DRAFT_POOL_POSITIONS[Math.floor(Math.random() * DRAFT_POOL_POSITIONS.length)];
            prospectsToInsert.push(buildDraftProspect({
              teamId,
              pickIndex,
              totalTeams: teamsInGroup.length,
              position: randomPos,
              directSign: true
            }));
          } else {
            humanClubIds.push(teamId);
            DRAFT_POOL_POSITIONS.forEach((position) => {
              prospectsToInsert.push(buildDraftProspect({
                teamId,
                pickIndex,
                totalTeams: teamsInGroup.length,
                position,
                directSign: false
              }));
            });
          }
        });

        processedGroups++;
        setProgress(Math.round((processedGroups / grupos.length) * 100));
      }

      addLog(`Prospectos a crear: ${prospectsToInsert.length}.`);
      const insertChunkSize = 500;
      for (let i = 0; i < prospectsToInsert.length; i += insertChunkSize) {
        const chunk = prospectsToInsert.slice(i, i + insertChunkSize);
        const { error } = await supabase.from('players').insert(chunk);
        if (error) throw error;
      }

      if (humanClubIds.length > 0) {
        const { error } = await supabase
          .from('clubes')
          .update({ status: CLUB_STATUS.SEASON_DRAFT })
          .in('id', humanClubIds);
        if (error) throw error;
      }

      if (botClubIds.length > 0) {
        const { error } = await supabase
          .from('clubes')
          .update({ status: CLUB_STATUS.COMPETING })
          .in('id', botClubIds);
        if (error) throw error;
      }

      addLog(`✅ Draft habilitado para ${humanClubIds.length} equipos de usuario.`);
      addLog(`🤖 Bots auto-firmados: ${botClubIds.length}.`);
      addLog('⛔ La liga queda bloqueada hasta que los usuarios completen su pick en /draft-room.');
      loadStats();
      loadUsers();
    } catch (err: any) {
      addLog(`❌ ERROR DRAFT: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- NUEVO: GENERADOR DE CALENDARIO ---
  const generarCalendario = async () => {
    if (!confirm('¿Seguro que quieres borrar el calendario actual y generar uno nuevo de 14 jornadas para todos los equipos?')) return;
    
    setIsGenerating(true);
    setProgress(0);
    setLogs([]);
    addLog("📅 Iniciando Generador de Calendario (Round Robin)...");

    try {
        const { count: pendingSeasonDraftCount } = await supabase
          .from('clubes')
          .select('*', { count: 'exact', head: true })
          .eq('status', CLUB_STATUS.SEASON_DRAFT);

        if ((pendingSeasonDraftCount || 0) > 0) {
          addLog(`❌ Draft pendiente: ${pendingSeasonDraftCount} equipos aún en estado SEASON_DRAFT.`);
          addLog('Primero completa el draft de temporada y luego genera el calendario.');
          return;
        }

        // 1. Limpiamos partidos antiguos y reseteamos clasificaciones
        await supabase.from('matches').delete().neq('id', 0);
        await supabase.from('clubes').update({ pj: 0, v: 0, d: 0, pts: 0 }).neq('id', 0);
        addLog("Limpiadas clasificaciones y calendarios anteriores.");

        // 2. Extraemos todos los grupos y clubes
        const { data: grupos } = await supabase.from('grupos_liga').select('id');
        const { data: clubes } = await supabase.from('clubes').select('id, grupo_id');
        
        if (!grupos || !clubes) throw new Error("Error cargando BD.");

        const todosLosPartidos = [];
        let gruposProcesados = 0;

        // 3. Generamos los cruces por cada grupo
        for (const grupo of grupos) {
            const equipos = clubes.filter(c => c.grupo_id === grupo.id);
            if (equipos.length !== 8) continue; // Si un grupo no tiene 8, se lo salta por seguridad

            let teamIds = equipos.map(e => e.id);
            const numEquipos = teamIds.length;

            // FASE DE IDA (7 Jornadas)
            for (let r = 0; r < numEquipos - 1; r++) {
                for (let i = 0; i < numEquipos / 2; i++) {
                    let home = teamIds[i];
                    let away = teamIds[numEquipos - 1 - i];
                    
                    // Alternar local/visitante para el equipo que se queda fijo (índice 0)
                    if (i === 0 && r % 2 !== 0) {
                        const temp = home; home = away; away = temp;
                    }

                    // Partido de Ida
                    todosLosPartidos.push({
                        jornada: r + 1,
                        home_team_id: home, away_team_id: away,
                        played: false, fase: 'REGULAR', home_score: 0, away_score: 0
                    });

                    // Partido de Vuelta (Se invierte local/visitante y se suma 7 a la jornada)
                    todosLosPartidos.push({
                        jornada: r + 1 + 7,
                        home_team_id: away, away_team_id: home,
                        played: false, fase: 'REGULAR', home_score: 0, away_score: 0
                    });
                }
                // Rotar array (todos menos el índice 0) para generar el siguiente cruce
                teamIds.splice(1, 0, teamIds.pop());
            }

            gruposProcesados++;
            setProgress(Math.round((gruposProcesados / grupos.length) * 100));
        }

        addLog(`Cálculo terminado: ${todosLosPartidos.length} partidos oficiales listos.`);
        addLog(`Subiendo al servidor en bloques de 500 para evitar saturación...`);

        // 4. Inserción masiva en base de datos (Chunking)
        const chunkSize = 500;
        for (let i = 0; i < todosLosPartidos.length; i += chunkSize) {
            const chunk = todosLosPartidos.slice(i, i + chunkSize);
            const { error } = await supabase.from('matches').insert(chunk);
            if (error) throw error;
        }

        addLog("✅ ¡CALENDARIO GLOBAL COMPLETADO CON ÉXITO!");

    } catch (err: any) {
        addLog(`❌ ERROR: ${err.message}`);
    } finally {
        setIsGenerating(false);
    }
  };

  if (!isAuthorized) {
      return (
          <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-mono text-cyan-500">
              <ShieldAlert size={48} className="mb-4 animate-pulse" />
              <p className="uppercase tracking-widest text-sm font-bold">Verificando Credenciales de Seguridad...</p>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-mono relative">
      
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between mb-8 border-b border-red-500/20 pb-6 gap-4">
        <div>
            <div className="flex items-center gap-3 text-red-500 mb-2">
                <Settings className="animate-spin-slow" />
                <h1 className="text-3xl font-black tracking-widest uppercase">Comisionado</h1>
            </div>
            <p className="text-xs text-slate-500 uppercase tracking-widest">Panel de Control Global • TD Manager</p>
        </div>
        <Link href="/" className="px-6 py-3 bg-slate-900 border border-slate-700 rounded-xl text-[10px] font-black hover:bg-slate-800 transition-colors uppercase tracking-widest">
            Salir al Juego
        </Link>
      </div>

      <div className="max-w-7xl mx-auto mb-8">
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={() => setActiveSection('users')}
            className={`px-4 py-3 rounded-xl border text-left transition-all ${
              activeSection === 'users'
                ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-300'
                : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <Users size={16} />
              Usuarios
            </div>
            <p className="text-[10px] uppercase tracking-widest mt-1 opacity-80">
              Cuentas, roles admin y observador
            </p>
          </button>
          <button
            onClick={() => setActiveSection('operations')}
            className={`px-4 py-3 rounded-xl border text-left transition-all ${
              activeSection === 'operations'
                ? 'bg-orange-500/15 border-orange-400/50 text-orange-300'
                : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <Settings size={16} />
              Comisionado
            </div>
            <p className="text-[10px] uppercase tracking-widest mt-1 opacity-80">
              Universo, draft, calendario, economía y logs
            </p>
          </button>
        </div>
      </div>

      {activeSection === 'users' && (
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldAlert size={20} className="text-cyan-400" /> Usuarios Registrados ({usersList.length})
              </h2>
              <button onClick={loadUsers} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                <RefreshCcw size={12} /> Recargar
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-800">
                  <tr>
                    <th className="pb-3 font-bold">Mánager</th>
                    <th className="pb-3 font-bold">Franquicia</th>
                    <th className="pb-3 font-bold text-right">Dinero</th>
                    <th className="pb-3 font-bold text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {usersList.map((u, i) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="py-4">
                        <div className="font-bold text-white flex items-center gap-2">
                          {u.manager.nombre}
                          {u.manager.is_admin && (
                            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[8px] rounded-full uppercase tracking-widest">
                              Admin
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">Nivel {u.manager.nivel} • XP: {u.manager.xp}</div>
                      </td>
                      <td className="py-4">
                        <div className="font-bold text-orange-400">{u.club?.nombre || 'Sin Club'}</div>
                      </td>
                      <td className="py-4 text-right font-mono text-green-400 pr-4">
                        {u.club ? new Intl.NumberFormat('es-ES', { notation: "compact" }).format(u.club.presupuesto) : '-'} €
                      </td>
                      <td className="py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openObserverMode(u)}
                            className="p-2 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500 hover:text-slate-950 rounded-lg transition-all"
                            title="Ver expediente"
                          >
                            <Eye size={16} />
                          </button>

                          <button
                            onClick={() => toggleAdminRole(u.manager.id, u.manager.is_admin, u.manager.nombre)}
                            className={`p-2 rounded-lg transition-all ${u.manager.is_admin ? 'bg-orange-500/10 text-orange-400 hover:bg-orange-500 hover:text-slate-950' : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-white'}`}
                            title={u.manager.is_admin ? "Quitar Admin" : "Hacer Admin"}
                          >
                            {u.manager.is_admin ? <ShieldOff size={16} /> : <Shield size={16} />}
                          </button>

                          <button
                            onClick={() => deleteUserData(u.manager.id, u.club?.id, u.manager.nombre, u.manager.owner_id)}
                            className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-all"
                            title="Aniquilación Total de Cuenta"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {usersList.length === 0 && (
                    <tr><td colSpan={4} className="py-8 text-center text-slate-500">No hay usuarios registrados aún.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'operations' && (
        <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-12 gap-8">
          <div className="xl:col-span-8 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-900 border border-white/5 p-6 rounded-3xl shadow-xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-cyan-500/10 text-cyan-500 rounded-xl flex items-center justify-center">
                    <Globe size={20} />
                  </div>
                  <div>
                    <h2 className="font-black uppercase text-white tracking-wide">Big Bang</h2>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">Generador de Universo</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mb-6 leading-relaxed">Rellena los 42 grupos con equipos BOT y genera plantillas completas y balanceadas de 10 jugadores automáticamente.</p>
                <button
                  onClick={generarUniverso}
                  disabled={isGenerating || loading}
                  className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black uppercase text-xs tracking-widest rounded-xl transition-all flex justify-center items-center gap-2"
                >
                  {isGenerating ? <Activity className="animate-spin" size={16} /> : <Zap size={16} />}
                  {isGenerating ? 'Generando...' : 'Crear Universo'}
                </button>
              </div>

              <div className="bg-slate-900 border border-white/5 p-6 rounded-3xl shadow-xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-violet-500/10 text-violet-400 rounded-xl flex items-center justify-center">
                    <GraduationCap size={20} />
                  </div>
                  <div>
                    <h2 className="font-black uppercase text-white tracking-wide">Pretemporada</h2>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">Evento de Draft</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                  Activa el draft obligatorio antes del inicio de liga. Usuarios recibirán su pool de rookies y bots firmarán automáticamente.
                </p>
                <button
                  onClick={iniciarDraftTemporada}
                  disabled={isGenerating || loading}
                  className="w-full py-4 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black uppercase text-xs tracking-widest rounded-xl transition-all flex justify-center items-center gap-2"
                >
                  {isGenerating ? <Activity className="animate-spin" size={16} /> : <GraduationCap size={16} />}
                  {isGenerating ? 'Configurando...' : 'Iniciar Draft'}
                </button>
              </div>

              <div className="bg-slate-900 border border-white/5 p-6 rounded-3xl shadow-xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-orange-500/10 text-orange-500 rounded-xl flex items-center justify-center">
                    <CalendarDays size={20} />
                  </div>
                  <div>
                    <h2 className="font-black uppercase text-white tracking-wide">La Liga</h2>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">Generador de Calendario</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mb-6 leading-relaxed">Programa las 14 jornadas de Fase Regular (Ida y Vuelta) para los 42 grupos. Resetea clasificaciones.</p>
                <button
                  onClick={generarCalendario}
                  disabled={isGenerating || loading}
                  className="w-full py-4 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black uppercase text-xs tracking-widest rounded-xl transition-all flex justify-center items-center gap-2"
                >
                  {isGenerating ? <Activity className="animate-spin" size={16} /> : <Trophy size={16} />}
                  {isGenerating ? 'Programando...' : 'Crear Calendario'}
                </button>
              </div>

              <div className="bg-slate-900 border border-white/5 p-6 rounded-3xl shadow-xl">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center">
                      <DollarSign size={20} />
                    </div>
                    <div>
                      <h2 className="font-black uppercase text-white tracking-wide">Economía</h2>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest">Reglas editables por liga</p>
                    </div>
                  </div>
                  <button
                    onClick={loadEconomyRules}
                    disabled={economyLoading || economySaving || isGenerating || loading}
                    className="text-[10px] text-slate-300 hover:text-white uppercase tracking-widest font-bold flex items-center gap-1 disabled:opacity-40"
                  >
                    <RefreshCcw size={12} className={economyLoading ? 'animate-spin' : ''} />
                    Recargar
                  </button>
                </div>

                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  Controla ingresos base, costes fijos y multiplicador del gimnasio para Bronce, Plata y Oro.
                </p>

                <div className="space-y-3 mb-4 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                  {economyRules.map((rule) => (
                    <div key={rule.leagueLevel} className="bg-slate-950 border border-white/5 rounded-xl p-3">
                      <div className="text-[10px] text-emerald-400 font-black uppercase tracking-widest mb-2">
                        Liga {LEAGUE_LEVEL_LABELS[rule.leagueLevel]} (Nivel {rule.leagueLevel})
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">
                          Patrocinio
                          <input
                            type="number"
                            min={0}
                            value={rule.sponsorshipBase}
                            onChange={(e) => updateEconomyRuleField(rule.leagueLevel, 'sponsorshipBase', e.target.value)}
                            className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white outline-none focus:border-emerald-400"
                          />
                        </label>
                        <label className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">
                          Taquilla
                          <input
                            type="number"
                            min={0}
                            value={rule.ticketRevenueBase}
                            onChange={(e) => updateEconomyRuleField(rule.leagueLevel, 'ticketRevenueBase', e.target.value)}
                            className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white outline-none focus:border-emerald-400"
                          />
                        </label>
                        <label className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">
                          Mantenimiento
                          <input
                            type="number"
                            min={0}
                            value={rule.venueMaintenance}
                            onChange={(e) => updateEconomyRuleField(rule.leagueLevel, 'venueMaintenance', e.target.value)}
                            className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white outline-none focus:border-emerald-400"
                          />
                        </label>
                        <label className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">
                          Mult. Training
                          <input
                            type="number"
                            min={0.01}
                            max={5}
                            step={0.01}
                            value={rule.trainingCostMultiplier}
                            onChange={(e) => updateEconomyRuleField(rule.leagueLevel, 'trainingCostMultiplier', e.target.value)}
                            className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white outline-none focus:border-emerald-400"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={saveEconomyRules}
                  disabled={economyLoading || economySaving || isGenerating || loading}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black uppercase text-xs tracking-widest rounded-xl transition-all flex justify-center items-center gap-2"
                >
                  {economySaving ? <Activity className="animate-spin" size={16} /> : <DollarSign size={16} />}
                  {economySaving ? 'Guardando reglas...' : 'Guardar reglas económicas'}
                </button>
              </div>

              <div className="bg-slate-900 border border-white/5 p-6 rounded-3xl shadow-xl lg:col-span-2">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                  <div>
                    <h2 className="font-black uppercase text-white tracking-wide flex items-center gap-2">
                      <Github size={18} className="text-indigo-300" />
                      Integración GitHub
                    </h2>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">
                      Repo editable y sync manual desde comisionado
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={loadGitHubConfig}
                      disabled={githubLoading || githubSaving || githubSyncing || loading || isGenerating}
                      className="px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg border border-white/15 text-slate-300 hover:text-white hover:border-white/30 disabled:opacity-40 flex items-center gap-1"
                    >
                      <RefreshCcw size={12} className={githubLoading ? 'animate-spin' : ''} />
                      Recargar
                    </button>
                    <button
                      onClick={saveGitHubConfig}
                      disabled={githubLoading || githubSaving || githubSyncing || loading || isGenerating}
                      className="px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white flex items-center gap-1"
                    >
                      {githubSaving ? <Activity size={12} className="animate-spin" /> : <Settings size={12} />}
                      {githubSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                      onClick={syncGitHubRepository}
                      disabled={githubLoading || githubSaving || githubSyncing || loading || isGenerating}
                      className="px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white flex items-center gap-1"
                    >
                      {githubSyncing ? <Activity size={12} className="animate-spin" /> : <Github size={12} />}
                      {githubSyncing ? 'Sincronizando...' : 'Sincronizar'}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  Guarda owner/repo/branch aquí y sincroniza el último commit del repositorio usando el token backend (`GITHUB_TOKEN`).
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <label className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">
                    Owner
                    <input
                      type="text"
                      value={githubConfig.owner}
                      onChange={(e) => updateGitHubConfigField('owner', e.target.value)}
                      placeholder="schelotto-creator"
                      className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white outline-none focus:border-indigo-400"
                    />
                  </label>
                  <label className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">
                    Repositorio
                    <input
                      type="text"
                      value={githubConfig.repo}
                      onChange={(e) => updateGitHubConfigField('repo', e.target.value)}
                      placeholder="td-manager"
                      className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white outline-none focus:border-indigo-400"
                    />
                  </label>
                  <label className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">
                    Rama
                    <div className="mt-1 flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 focus-within:border-indigo-400">
                      <GitBranch size={12} className="text-slate-500" />
                      <input
                        type="text"
                        value={githubConfig.branch}
                        onChange={(e) => updateGitHubConfigField('branch', e.target.value)}
                        placeholder="main"
                        className="w-full bg-transparent text-[11px] font-bold text-white outline-none"
                      />
                    </div>
                  </label>
                </div>

                <div className="mt-4 bg-slate-950 border border-white/5 rounded-xl p-3 space-y-2">
                  <div className="text-[10px] text-slate-400 uppercase tracking-widest">
                    Último sync: <span className="text-white font-bold normal-case">{formatGitHubSyncDate(githubConfig.lastSyncedAt)}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-widest">
                    Estado:{' '}
                    <span
                      className={`font-black ${
                        githubConfig.lastSyncStatus === 'success'
                          ? 'text-emerald-300'
                          : githubConfig.lastSyncStatus === 'error'
                          ? 'text-red-300'
                          : 'text-slate-300'
                      }`}
                    >
                      {githubConfig.lastSyncStatus === 'success'
                        ? 'OK'
                        : githubConfig.lastSyncStatus === 'error'
                        ? 'ERROR'
                        : 'SIN EJECUTAR'}
                    </span>
                  </div>
                  {githubConfig.lastCommitSha && (
                    <div className="text-[10px] text-slate-400 uppercase tracking-widest">
                      Commit:{' '}
                      <span className="text-cyan-300 font-bold normal-case">{githubConfig.lastCommitSha.slice(0, 7)}</span>
                      {githubConfig.lastCommitAuthor && (
                        <span className="normal-case text-slate-300"> · {githubConfig.lastCommitAuthor}</span>
                      )}
                    </div>
                  )}
                  {githubConfig.lastCommitMessage && (
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {githubConfig.lastCommitMessage}
                    </p>
                  )}
                  {githubConfig.lastCommitUrl && (
                    <a
                      href={githubConfig.lastCommitUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 uppercase tracking-widest font-bold"
                    >
                      Ver commit en GitHub
                    </a>
                  )}
                  {githubConfig.lastSyncError && (
                    <p className="text-[10px] text-red-300 uppercase tracking-widest">
                      Error: {githubConfig.lastSyncError}
                    </p>
                  )}
                </div>
              </div>

              <div className="bg-slate-900 border border-white/5 p-6 rounded-3xl shadow-xl lg:col-span-2">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                  <div>
                    <h2 className="font-black uppercase text-white tracking-wide flex items-center gap-2">
                      <Target size={18} className="text-fuchsia-300" />
                      Media por Posición
                    </h2>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">
                      Ponderaciones globales para cálculo de OVR en cancha
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={loadPositionOverallConfig}
                      disabled={positionConfigLoading || positionConfigSaving || loading || isGenerating}
                      className="px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg border border-white/15 text-slate-300 hover:text-white hover:border-white/30 disabled:opacity-40 flex items-center gap-1"
                    >
                      <RefreshCcw size={12} className={positionConfigLoading ? 'animate-spin' : ''} />
                      Recargar
                    </button>
                    <button
                      onClick={savePositionOverallConfig}
                      disabled={positionConfigLoading || positionConfigSaving || loading || isGenerating}
                      className="px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-slate-800 disabled:text-slate-500 text-white flex items-center gap-1"
                    >
                      {positionConfigSaving ? <Activity size={12} className="animate-spin" /> : <Settings size={12} />}
                      {positionConfigSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  Ajusta cuánto pesa cada atributo en la media específica de Base, Escolta, Alero, Ala-Pívot y Pívot.
                </p>

                <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1 custom-scrollbar">
                  {POSITION_ROLES.map((role) => (
                    <div key={role} className="bg-slate-950 border border-white/5 rounded-xl p-3">
                      <div className="text-[10px] text-fuchsia-300 font-black uppercase tracking-widest mb-2">
                        {POSITION_WEIGHT_ROLE_LABELS[role]}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {POSITION_WEIGHT_FIELDS.map((field) => (
                          <label key={`${role}-${field.key}`} className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">
                            {field.label}
                            <input
                              type="number"
                              min={field.min}
                              max={field.max}
                              step={field.step}
                              value={positionOverallConfig[role][field.key]}
                              onChange={(e) => updatePositionOverallField(role, field.key, e.target.value)}
                              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white outline-none focus:border-fuchsia-400"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900 border border-white/5 p-6 rounded-3xl shadow-xl lg:col-span-2">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                  <div>
                    <h2 className="font-black uppercase text-white tracking-wide flex items-center gap-2">
                      <Activity size={18} className="text-cyan-400" />
                      Simulador de Partidos
                    </h2>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">
                      Configuración global para exhibition y partidos oficiales
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={loadSimulatorSettings}
                      disabled={simulatorLoading || simulatorSaving || loading || isGenerating}
                      className="px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg border border-white/15 text-slate-300 hover:text-white hover:border-white/30 disabled:opacity-40 flex items-center gap-1"
                    >
                      <RefreshCcw size={12} className={simulatorLoading ? 'animate-spin' : ''} />
                      Recargar
                    </button>
                    <button
                      onClick={saveSimulatorSettings}
                      disabled={simulatorLoading || simulatorSaving || loading || isGenerating}
                      className="px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white flex items-center gap-1"
                    >
                      {simulatorSaving ? <Activity size={12} className="animate-spin" /> : <Settings size={12} />}
                      {simulatorSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>

                <div className="space-y-4 max-h-[560px] overflow-y-auto pr-1 custom-scrollbar">
                  {SIMULATOR_FIELD_GROUPS.map((group) => (
                    <div key={group.title} className="bg-slate-950 border border-white/5 rounded-xl p-4">
                      <h3 className="text-[10px] text-cyan-300 font-black uppercase tracking-[0.18em] mb-3">{group.title}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {group.fields.map((field) => (
                          <label key={field.key} className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">
                            {field.label}
                            <input
                              type="number"
                              min={field.min}
                              max={field.max}
                              step={field.step}
                              value={simulatorSettings[field.key]}
                              onChange={(e) => updateSimulatorSetting(field.key, e.target.value)}
                              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white outline-none focus:border-cyan-400"
                            />
                            {field.hint && (
                              <span className="block mt-1 text-[8px] text-slate-500 normal-case tracking-normal">{field.hint}</span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h2 className="text-sm font-bold text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                <Database size={16} /> Base de Datos Global
              </h2>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-slate-950 p-3 rounded-xl border border-white/5 text-center">
                  <span className="block text-xl font-black text-white">{stats.teams}</span>
                  <span className="text-[9px] text-slate-500 uppercase tracking-widest">Equipos</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-white/5 text-center">
                  <span className="block text-xl font-black text-white">{stats.players}</span>
                  <span className="text-[9px] text-slate-500 uppercase tracking-widest">Jugadores</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => generateRookies(10)} disabled={loading || isGenerating} className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl hover:bg-blue-500/20 text-blue-400 flex flex-col items-center gap-1 disabled:opacity-50 transition-colors">
                  <Zap size={18} /> <span className="text-[9px] font-bold uppercase tracking-widest">+10 Libres</span>
                </button>
                <button onClick={clearMarket} disabled={loading || isGenerating} className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl hover:bg-red-500/20 text-red-400 flex flex-col items-center gap-1 disabled:opacity-50 transition-colors">
                  <AlertTriangle size={18} /> <span className="text-[9px] font-bold uppercase tracking-widest">Purgar Libres</span>
                </button>
              </div>
            </div>
          </div>

          <div className="xl:col-span-4 space-y-6">
            <div className="bg-[#0a0a0a] border border-white/10 rounded-3xl overflow-hidden flex flex-col shadow-2xl min-h-[340px]">
              <div className="bg-white/5 border-b border-white/5 px-4 py-3 flex items-center gap-3">
                <Terminal className="text-slate-400" size={16} />
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Consola de Servidor</span>
              </div>

              {isGenerating && (
                <div className="h-1 w-full bg-slate-900">
                  <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                </div>
              )}

              <div className="flex-1 p-6 font-mono text-xs overflow-y-auto space-y-1 custom-scrollbar flex flex-col-reverse">
                {logs.length === 0 ? (
                  <div className="text-center text-slate-600 my-auto animate-pulse">Esperando comandos...</div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className={`text-[10px] ${log.includes('ERROR') || log.includes('❌') ? 'text-red-400' : log.includes('ÉXITO') || log.includes('✅') || log.includes('🛡️') || log.includes('🤖') || log.includes('🗑️') || log.includes('💀') ? 'text-green-400' : log.includes('⚙️') || log.includes('BIG BANG') || log.includes('📅') ? 'text-yellow-400' : log.includes('⚠️') ? 'text-orange-400' : log.includes('👁️') ? 'text-cyan-400' : 'text-slate-300'}`}>
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODO OBSERVADOR MODAL */}
      {observingUser && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-cyan-500/30 w-full max-w-4xl rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col max-h-[90vh]">
                  
                  <div className="bg-slate-950 p-6 flex justify-between items-center border-b border-white/5">
                      <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-cyan-500/10 text-cyan-400 rounded-full flex items-center justify-center border border-cyan-500/30">
                              <Eye size={24} />
                          </div>
                          <div>
                              <div className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-1">Modo Observador Activo</div>
                              <h2 className="text-2xl font-black italic text-white uppercase">{observingUser.manager.nombre}</h2>
                          </div>
                      </div>
                      <button onClick={closeObserverMode} className="p-3 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-colors">
                          <X size={20} />
                      </button>
                  </div>

                  <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8">
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-slate-950 p-4 rounded-2xl border border-white/5">
                              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Franquicia</div>
                              <div className="text-lg font-bold text-orange-400 truncate">{observingUser.club?.nombre || 'No creada'}</div>
                          </div>
                          <div className="bg-slate-950 p-4 rounded-2xl border border-white/5">
                              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Presupuesto</div>
                              <div className="text-lg font-mono font-bold text-green-400">{new Intl.NumberFormat('es-ES').format(observingUser.club?.presupuesto || 0)} €</div>
                          </div>
                          <div className="bg-slate-950 p-4 rounded-2xl border border-white/5">
                              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Puntos de Talento</div>
                              <div className="text-lg font-bold text-white">{observingUser.manager.puntos_talento || 0}</div>
                          </div>
                      </div>

                      <div>
                          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-white/5 pb-2">Niveles de Habilidad</h3>
                          <div className="flex gap-4">
                              <div className="bg-slate-950 px-4 py-2 rounded-lg border border-white/5 text-xs"><span className="text-slate-500">Ojo Clínico:</span> <span className="text-white font-bold">{observingUser.manager.talento_ojo || 0}/3</span></div>
                              <div className="bg-slate-950 px-4 py-2 rounded-lg border border-white/5 text-xs"><span className="text-slate-500">Lobo de Wall St:</span> <span className="text-white font-bold">{observingUser.manager.talento_lobo || 0}/5</span></div>
                              <div className="bg-slate-950 px-4 py-2 rounded-lg border border-white/5 text-xs"><span className="text-slate-500">Ídolo Local:</span> <span className="text-white font-bold">{observingUser.manager.talento_idolo || 0}/3</span></div>
                          </div>
                      </div>

                      <div>
                          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-white/5 pb-2">Plantilla Actual ({observedRoster.length} Jugadores)</h3>
                          {observedRoster.length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {observedRoster.map(p => (
                                      <div key={p.id} className="flex justify-between items-center bg-slate-950 p-3 rounded-xl border border-white/5">
                                          <div>
                                              <div className="font-bold text-sm text-white">{p.name}</div>
                                              <div className="text-[10px] text-slate-500">{p.position} • {p.age} años</div>
                                          </div>
                                          <div className="w-10 h-10 rounded-full border border-slate-700 flex items-center justify-center font-black text-slate-300">
                                              {p.overall}
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          ) : (
                              <div className="text-center p-8 bg-slate-950 rounded-2xl border border-white/5 text-slate-500 text-sm">
                                  Este equipo no tiene jugadores contratados.
                              </div>
                          )}
                      </div>

                  </div>
              </div>
          </div>
      )}

    </div>
  );
}
