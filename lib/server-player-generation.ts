import {
  applyExperienceBonus,
  calculateWeightedOverallForBestRole,
  getBestRoleForPlayer,
  getDefaultPositionOverallConfig,
  normalizePositionOverallConfig,
  type PositionOverallConfig,
  type PositionRole
} from '@/lib/position-overall-config';
import { getRandomInt, rollAgeAndExperience } from '@/lib/player-generation';
import { getWeeklySalaryByOvr } from '@/lib/salary';

const NAME_POOLS = {
  USA: {
    first: ['Jamal', 'Marcus', 'Kevin', 'Jayson', 'Tyrese', 'Devin', 'Jordan', 'Isaiah'],
    last: ['Smith', 'Johnson', 'Williams', 'Brown', 'Miller', 'Davis', 'Walker', 'Carter']
  },
  ESP: {
    first: ['Pau', 'Sergio', 'Rudy', 'Alex', 'Hugo', 'Iker', 'Mateo', 'Unai'],
    last: ['Garcia', 'Martinez', 'Rubio', 'Navarro', 'Sanchez', 'Vidal', 'Soler', 'Reyes']
  },
  ARG: {
    first: ['Facundo', 'Nicolas', 'Luca', 'Matias', 'Franco', 'Tomas', 'Santiago', 'Joaquin'],
    last: ['Scola', 'Campazzo', 'Gomez', 'Fernandez', 'Romero', 'Acosta', 'Medina', 'Rojas']
  },
  LTU: {
    first: ['Arvydas', 'Domantas', 'Jonas', 'Mantas', 'Rokas', 'Ignas', 'Lukas', 'Tadas'],
    last: ['Sabonis', 'Valanciunas', 'Jokubaitis', 'Grigonis', 'Gudaitis', 'Masiulis', 'Tubelis', 'Jankunas']
  },
  FRA: {
    first: ['Tony', 'Nicolas', 'Evan', 'Victor', 'Theo', 'Kilian', 'Bilal', 'Hugo'],
    last: ['Parker', 'Batum', 'Fournier', 'Diaw', 'Maledon', 'Hayes', 'Martin', 'Dubois']
  },
  GER: {
    first: ['Dirk', 'Dennis', 'Franz', 'Moritz', 'Daniel', 'Johannes', 'Lukas', 'Jonas'],
    last: ['Nowitzki', 'Schroder', 'Wagner', 'Kleber', 'Theis', 'Voigtmann', 'Muller', 'Weber']
  }
} as const;

const COUNTRIES = Object.keys(NAME_POOLS) as Array<keyof typeof NAME_POOLS>;
const POSITIONS: PositionRole[] = ['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot'];
const INITIAL_POSITIONS: PositionRole[] = [
  'Base',
  'Escolta',
  'Alero',
  'Ala-Pívot',
  'Pívot',
  'Base',
  'Alero',
  'Pívot'
];

export type GeneratedPlayer = {
  name: string;
  nationality: string;
  position: PositionRole;
  age: number;
  height: number;
  shooting_3pt: number;
  shooting_2pt: number;
  defense: number;
  passing: number;
  rebounding: number;
  speed: number;
  dribbling: number;
  stamina: number;
  experience: number;
  overall: number;
  salary: number;
  lineup_pos: string;
  team_id: string | null;
};

const randomName = () => {
  const nationality = COUNTRIES[getRandomInt(0, COUNTRIES.length - 1)];
  const pool = NAME_POOLS[nationality];
  return {
    nationality,
    name: `${pool.first[getRandomInt(0, pool.first.length - 1)]} ${pool.last[getRandomInt(0, pool.last.length - 1)]}`
  };
};

const getHeight = (position: PositionRole) =>
  position === 'Base' || position === 'Escolta'
    ? getRandomInt(184, 199)
    : getRandomInt(198, 214);

const buildPlayer = (
  position: PositionRole,
  age: number,
  experience: number,
  stat: () => number,
  teamId: string | null,
  lineupPos: string,
  config: PositionOverallConfig
): GeneratedPlayer => {
  const identity = randomName();
  const attributes = {
    shooting_3pt: stat(),
    shooting_2pt: stat(),
    defense: stat(),
    passing: stat(),
    rebounding: stat(),
    speed: stat(),
    dribbling: stat()
  };
  const bestPosition = getBestRoleForPlayer(attributes, config);
  const baseOverall = calculateWeightedOverallForBestRole(attributes, config);
  const overall = applyExperienceBonus(baseOverall, experience);

  return {
    ...identity,
    ...attributes,
    position: bestPosition || position,
    age,
    height: getHeight(position),
    stamina: 100,
    experience,
    overall,
    salary: getWeeklySalaryByOvr(overall),
    lineup_pos: lineupPos,
    team_id: teamId
  };
};

export const getServerPositionConfig = (raw?: unknown) =>
  raw ? normalizePositionOverallConfig(raw) : getDefaultPositionOverallConfig();

export const generateInitialRoster = (
  teamId: string | null,
  config: PositionOverallConfig = getDefaultPositionOverallConfig()
) =>
  INITIAL_POSITIONS.map((position) => {
    const { age, experience } = rollAgeAndExperience(22, 33, 'rotation');
    return buildPlayer(position, age, experience, () => getRandomInt(40, 59), teamId, 'BENCH', config);
  });

export const generateRookiePool = (
  poolTag: string,
  count = 10,
  config: PositionOverallConfig = getDefaultPositionOverallConfig()
) =>
  Array.from({ length: count }, (_, index) => {
    const position = POSITIONS[index % POSITIONS.length];
    const { age, experience } = rollAgeAndExperience(18, 20, 'rookie');
    return buildPlayer(position, age, Math.max(1, experience), () => getRandomInt(55, 74), null, poolTag, config);
  });

export const generateSeasonFallbackPool = (
  poolTag: string,
  config: PositionOverallConfig = getDefaultPositionOverallConfig()
) =>
  POSITIONS.map((position) => {
    const { age, experience } = rollAgeAndExperience(18, 20, 'rookie');
    const target = getRandomInt(62, 70);
    return buildPlayer(
      position,
      age,
      Math.max(1, experience),
      () => Math.max(45, Math.min(99, target + getRandomInt(-6, 5))),
      null,
      poolTag,
      config
    );
  });
