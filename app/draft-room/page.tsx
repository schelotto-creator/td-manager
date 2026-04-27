'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { getWeeklySalaryByOvr } from '@/lib/salary';
import { rollAgeAndExperience } from '@/lib/player-generation';
import { useRouter } from 'next/navigation';
import {
  applyExperienceBonus,
  calculateWeightedOverallForBestRole,
  fetchPositionOverallConfig,
  getBestRoleForPlayer,
  getDefaultPositionOverallConfig,
  type PositionOverallConfig
} from '@/lib/position-overall-config';
import {
  GraduationCap,
  Target,
  Shield,
  Activity,
  Hand,
  Zap,
  CheckCircle,
  ChevronRight,
  Users,
  X,
  Brain,
  ListOrdered,
  Trophy
} from 'lucide-react';
import { CLUB_STATUS, getSeasonDraftPoolTag } from '@/lib/season-draft';
import { filterMatchesBySeason, getLatestSeasonNumber } from '@/lib/match-seasons';

const FLAGS: Record<string, string> = {
  'USA': '🇺🇸', 'ESP': '🇪🇸', 'ARG': '🇦🇷', 'LTU': '🇱🇹', 
  'SVK': '🇸🇰', 'CHN': '🇨🇳', 'FRA': '🇫🇷', 'GER': '🇩🇪'
};

const NAMES_DB: Record<string, { first: string[], last: string[] }> = {
  'USA': {
    first: ["Jamal", "Marcus", "Luka", "Kevin", "LeBron", "Kobe", "Michael", "Stephen", "Giannis", "Nikola", "Jayson", "Zion", "Ja", "Trae", "De'Aaron", "Devin", "Anthony", "Damian", "Donovan", "Kyrie", "Jimmy", "Klay", "Paul", "Russell", "Bradley", "DeMar", "Zach", "LaVine", "Julius", "Joel", "Bam", "Deandre", "Rudy", "Clint", "Pascal", "Domantas", "Myles", "Jarrett", "Kristaps", "Vucevic", "Jonas", "Brook", "Ayton", "Mitchell", "Darius", "Shai", "Tyrese", "Dejounte", "LaMelo", "Cade", "Fred", "CJ", "Brandon", "Terry", "D'Angelo", "Malcolm", "John", "Chris", "Kyle", "Kemba", "Goran", "Mike", "Ricky", "Derrick", "Lonzo", "RJ", "Cole", "Tyler", "Jordan", "Collin", "Dennis", "Jalen", "Jaden", "Isaiah", "Evan", "Scottie", "Franz", "Paolo", "Chet", "Jabari", "Keegan", "Bennedict", "Shaedon", "Dyson", "Jeremy", "Victor", "Scoot", "Ausar", "Amen", "Keyonte", "Walker", "Taylor", "Gradey", "Bilal", "Cason", "Dereck", "Khris", "Andrew", "Mikal"],
    last: ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Curry", "Durant", "Tatum", "Jokic", "Embiid", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts", "Gomez", "Phillips", "Evans", "Turner", "Diaz", "Parker", "Cruz", "Edwards", "Collins", "Reyes", "Stewart", "Morris", "Morales", "Murphy", "Cook", "Rogers", "Gutierrez", "Ortiz", "Morgan", "Cooper", "Peterson", "Bailey", "Reed", "Kelly", "Howard", "Ramos", "Kim", "Cox", "Ward", "Richardson", "Watson", "Brooks", "Chavez", "Wood", "James", "Bennett", "Gray", "Mendoza", "Ruiz", "Hughes", "Price", "Alvarez", "Castillo", "Sanders", "Patel"]
  },
  'ESP': {
    first: ["Pau", "Marc", "Ricky", "Juan Carlos", "Sergio", "Rudy", "Willy", "Juancho", "Alex", "Fernando", "Jorge", "Jose", "Alberto", "Carlos", "David", "Javier", "Daniel", "Pablo", "Alvaro", "Adrian", "Mario", "Diego", "Hugo", "Marcos", "Ivan", "Raul", "Ruben", "Victor", "Hector", "Aaron", "Aitor", "Oscar", "Roberto", "Samuel", "Iker", "Cristian", "Ismael", "Guillermo", "Nicolas", "Martin", "Lucas", "Mateo", "Leo", "Alejandro", "Enrique", "Ignacio", "Gonzalo", "Julio", "Andres", "Miguel", "Rafael", "Tomas", "Luis", "Antonio", "Francisco", "Manuel", "Pedro", "Jesus", "Angel", "Vicente", "Eduardo", "Joaquin", "Emilio", "Julian", "Gabriel", "Felipe", "Matias", "Bastian", "Bruno", "Thiago", "Gael", "Izan", "Rodrigo", "Alonso", "Cesar", "Felix", "Jon", "Unai", "Paco", "Brais", "Joan", "Pol", "Biel", "Jan", "Nil", "Oriol", "Xavi", "Aleix", "Arnau", "Gerard", "Albert", "Ferran", "Sergi", "Ricard", "Ramon", "Gorka", "Koke", "Asier", "Mikel"],
    last: ["Gasol", "Navarro", "Rubio", "Llull", "Fernandez", "Hernangomez", "Abrines", "Reyes", "Calderon", "Garbajosa", "Rodriguez", "Garcia", "Martinez", "Lopez", "Sanchez", "Perez", "Gomez", "Martin", "Jimenez", "Ruiz", "Hernandez", "Diaz", "Moreno", "Alvarez", "Muñoz", "Romero", "Alonso", "Gutierrez", "Torres", "Dominguez", "Vazquez", "Ramos", "Gil", "Ramirez", "Serrano", "Blanco", "Suarez", "Molina", "Morales", "Ortega", "Delgado", "Castro", "Ortiz", "Marin", "Sanz", "Iglesias", "Nuñez", "Medina", "Garrido", "Cortes", "Castillo", "Santos", "Lozano", "Guerrero", "Cano", "Prieto", "Mendez", "Cruz", "Calvo", "Gallego", "Vidal", "Leon", "Marquez", "Herrera", "Peña", "Flores", "Cabrera", "Campos", "Vega", "Diez", "Fuentes", "Carrasco", "Caballero", "Nieto", "Aguilar", "Pascual", "Santana", "Herrero", "Lorenzo", "Montero", "Hidalgo", "Gimenez", "Ibañez", "Ferrer", "Duran", "Santiago", "Benitez", "Vargas", "Mora", "Arias", "Carmona", "Crespo", "Roman", "Pastor", "Soto", "Saez", "Velasco", "Soler"]
  },
  'ARG': {
    first: ["Facundo", "Emanuel", "Luis", "Andres", "Leandro", "Pablo", "Fabricio", "Carlos", "Walter", "Nicolas", "Luca", "Gabriel", "Patricio", "Federico", "Matias", "Hernan", "Maximiliano", "Diego", "Franco", "Agustin", "Gaston", "Ignacio", "Tomas", "Julian", "Ezequiel", "Mariano", "Sebastian", "Lucas", "Santiago", "Joaquin", "Rodrigo", "Emiliano", "Luciano", "Martin", "Guillermo", "Alejandro", "Cristian", "Juan", "Marcelo", "Jorge", "Ruben", "Roberto", "Ricardo", "Eduardo", "Claudio", "Fernando", "Julio", "Oscar", "Victor", "Gustavo"],
    last: ["Ginobili", "Scola", "Nocioni", "Campazzo", "Delfino", "Prigioni", "Oberto", "Laprovittola", "Vildoza", "Deck", "Brussino", "Garino", "Fierro", "Delia", "Caffaro", "Bolmaro", "Redivo", "Gallizzi", "Romano", "Vaulet", "Sanchez", "Gomez", "Perez", "Fernandez", "Rodriguez", "Gonzalez", "Garcia", "Martinez", "Lopez", "Romero", "Diaz", "Torres", "Alvarez", "Ruiz", "Ramirez", "Flores", "Benitez", "Acosta", "Medina", "Herrera", "Aguilar", "Rios", "Rojas", "Gimenez", "Peralta", "Castro", "Silva", "Quiroga", "Navarro"]
  },
  'LTU': {
    first: ["Arvydas", "Domantas", "Sarunas", "Jonas", "Mindaugas", "Linas", "Mantas", "Rokas", "Tomas", "Ignas", "Lukas", "Paulius", "Arturas", "Donatas", "Edgaras", "Eimantas", "Gytis", "Martynas", "Tadas", "Vytautas", "Darius", "Gintaras", "Kestutis", "Vaidas", "Zydrunas", "Antanas", "Dainius", "Egidiijus", "Klaidas", "Rimas", "Simas", "Vidas", "Aidas", "Gvidas", "Ovidijus", "Rimantas", "Stepas", "Valdas", "Andrius", "Deividas", "Evaldas", "Gediminas", "Justas", "Karolis", "Laurynas", "Nerijus", "Osvaldas", "Ramunas", "Saulius", "Vilius"],
    last: ["Sabonis", "Valanciunas", "Jasikevicius", "Macijauskas", "Kleiza", "Ilgauskas", "Motiejunas", "Jokubaitis", "Kuzminskas", "Seibutis", "Grigonis", "Gudaitis", "Ulanovas", "Kalnietis", "Brazdeikis", "Kavaliauskas", "Giedraitis", "Dimsa", "Butkevicius", "Masiulis", "Echodas", "Sirvydis", "Tubelis", "Sedekerskis", "Kulboka", "Jankunas", "Maciulis", "Pocius", "Lavrinovic", "Songaila", "Kaukenas", "Kurtinaitis", "Siskauskas", "Stombergas", "Zukauskas", "Timinskas", "Einikis", "Karnisovas", "Praskevicius", "Marciulionis", "Chomicius", "Jovaisa", "Paulauskas", "Urbonas", "Petrauskas", "Kazlauskas", "Stankevicius", "Navickas", "Zilinskas"]
  },
  'SVK': {
    first: ["Marek", "Martin", "Peter", "Juraj", "Tomas", "Milan", "Michal", "Jozef", "Lukas", "Andrej", "Jakub", "Matej", "Filip", "Patrik", "Samuel", "Jan", "Stefan", "Ivan", "Pavol", "Vladimir", "David", "Richard", "Radoslav", "Igor", "Robert", "Lubomir", "Marian", "Miroslav", "Anton", "Frantisek", "Dominik", "Simon", "Adam", "Daniel", "Oliver", "Kristian", "Branislav", "Julius", "Ondrej", "Zdeno", "Boris", "Rastislav", "Vojtech", "Eduard", "Kamil", "Jaroslav", "Gabriel", "Viliam", "Denis", "Alex"],
    last: ["Vesely", "Hamsik", "Skriniar", "Lobotka", "Kucka", "Dubravka", "Pekarik", "Mak", "Weiss", "Duda", "Bozenik", "Hancko", "Vavro", "Suslov", "Hrosovsky", "Bero", "Schranz", "Gyomber", "Valjent", "Tomic", "Rusnak", "Kovár", "Ravas", "Sulla", "Gajanec", "Nemec", "Polak", "Kovac", "Balaz", "Varga", "Gallo", "Mraz", "Horvath", "Sykora", "Urban", "Gajdos", "Ondrus", "Farkas", "Kollar", "Sloboda", "Chovan", "Toth", "Sabo", "Krajcir", "Molnar", "Beno", "Halak", "Chara", "Gaborik", "Hossa"]
  },
  'CHN': {
    first: ["Yao", "Jianlian", "Jeremy", "Yi", "Zhou", "Guo", "Wang", "Mengke", "Sun", "Ding", "Zhao", "Zhelin", "Abudushalamu", "Rui", "Hao", "Wei", "Lei", "Jian", "Peng", "Bin", "Bo", "Chao", "Chen", "Cheng", "Da", "Dong", "Fan", "Feng", "Gang", "Hai", "He", "Heng", "Hong", "Hui", "Jia", "Jie", "Jin", "Jing", "Jun", "Kai", "Kang", "Ke", "Kun", "Li", "Liang", "Lin", "Ling", "Long", "Lu", "Min"],
    last: ["Ming", "Lin", "Qi", "Ailun", "Zhizhi", "Bateer", "Yue", "Yuhang", "Rui", "Hao", "Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Huang", "Zhao", "Wu", "Zhou", "Xu", "Sun", "Ma", "Zhu", "Hu", "Guo", "He", "Gao", "Luo", "Zheng", "Liang", "Xie", "Song", "Tang", "Han", "Feng", "Deng", "Cao", "Peng", "Zeng", "Xiao", "Tian", "Dong", "Yuan", "Pan", "Yu", "Jiang", "Cai"]
  },
  'FRA': {
    first: ["Tony", "Rudy", "Nicolas", "Evan", "Victor", "Boris", "Nando", "Frank", "Guerschon", "Theo", "Kilian", "Sekou", "Elie", "Timothe", "Ousmane", "Tidjane", "Bilal", "Zaccharie", "Rayan", "Alexandre", "Leo", "Hugo", "Mathis", "Arthur", "Louis", "Jules", "Gabriel", "Enzo", "Maxime", "Antoine", "Clement", "Nathan", "Baptiste", "Gabin", "Tom", "Paul", "Pierre", "Jean", "Francois", "Jacques", "Michel", "Claude", "Philippe", "Alain", "Bernard", "Thierry", "Laurent", "Olivier", "Stephane", "Vincent"],
    last: ["Parker", "Gobert", "Batum", "Fournier", "Wembanyama", "Diaw", "De Colo", "Ntilikina", "Yabusele", "Maledon", "Hayes", "Doumbouya", "Okobo", "Luwawu", "Dieng", "Salaun", "Coulibaly", "Risacher", "Rupert", "Sarr", "Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefevre", "Michel", "Garcia", "David", "Bertrand", "Roux", "Vincent", "Morel", "Girard", "Andre", "Mercier", "Dupont", "Lambert", "Bonnet", "Francois", "Martinez"]
  },
  'GER': {
    first: ["Dirk", "Dennis", "Franz", "Moritz", "Maxi", "Daniel", "Johannes", "Isaac", "Paul", "Maodo", "Andreas", "Niels", "Christian", "Robin", "Philipp", "Lukas", "Leon", "Maximilian", "Felix", "Tim", "Jonas", "Julian", "Florian", "Alexander", "David", "Jan", "Simon", "Tobias", "Michael", "Thomas", "Markus", "Stefan", "Matthias", "Martin", "Sebastian", "Frank", "Jens", "Uwe", "Jorg", "Klaus", "Bernd", "Jurgen", "Ralf", "Dieter", "Wolfgang", "Peter", "Hans", "Karl"],
    last: ["Nowitzki", "Schroder", "Wagner", "Kleber", "Theis", "Voigtmann", "Bonga", "Zipser", "Lo", "Hartenstein", "Obst", "Giffey", "Thiemann", "Bartzky", "Pleiss", "Muller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Becker", "Schulz", "Hoffmann", "Schafer", "Koch", "Bauer", "Richter", "Klein", "Wolf", "Neumann", "Schwarz", "Zimmermann", "Braun", "Kruger", "Hofmann", "Hartmann", "Lange", "Schmitt", "Werner", "Krause", "Meier", "Lehmann", "Schmid", "Schulze", "Maier", "Kohler", "Herrmann"]
  }
};

const POSITIONS = ['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot'];

type DraftOrderItem = {
  teamId: string;
  teamName: string;
  isUser: boolean;
  isBot: boolean;
  pick: number;
  wins: number;
  losses: number;
  diff: number;
};
type DraftMatchRow = {
  home_team_id: string | number;
  away_team_id: string | number;
  home_score: number | null;
  away_score: number | null;
  played: boolean;
  fase?: string | null;
  season_number?: number | null;
};

export default function DraftRoom() {
  const router = useRouter();
  const [team, setTeam] = useState<any>(null);
  const [rookies, setRookies] = useState<any[]>([]);
  const [currentRoster, setCurrentRoster] = useState<any[]>([]); 
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [draftMode, setDraftMode] = useState<'rookie' | 'season'>('rookie');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showRoster, setShowRoster] = useState(false); 
  const [draftOrder, setDraftOrder] = useState<DraftOrderItem[]>([]);
  const [userPickNumber, setUserPickNumber] = useState<number | null>(null);
  const [positionFilter, setPositionFilter] = useState<string>('ALL');
  const [sortMode, setSortMode] = useState<'board' | 'ovr' | 'experience'>('board');
  const [positionOverallConfig, setPositionOverallConfig] = useState<PositionOverallConfig>(getDefaultPositionOverallConfig());

  const maxPicks = draftMode === 'season' ? 1 : 2;

  const rookiesBoard = useMemo(() => {
    const filtered = rookies.filter((r) => positionFilter === 'ALL' || r.position === positionFilter);
    const ordered = [...filtered].sort((a, b) => {
      if (sortMode === 'experience') {
        const expDiff = Number(b.experience || 0) - Number(a.experience || 0);
        if (expDiff !== 0) return expDiff;
        return Number(b.overall || 0) - Number(a.overall || 0);
      }
      const ovrDiff = Number(b.overall || 0) - Number(a.overall || 0);
      if (ovrDiff !== 0) return ovrDiff;
      return Number(b.experience || 0) - Number(a.experience || 0);
    });
    return ordered.map((player, index) => ({ ...player, boardRank: index + 1 }));
  }, [rookies, positionFilter, sortMode]);

  useEffect(() => {
    checkStatusAndGeneratePool();
  }, []);

  // --- EL OVERALL AHORA SE BENEFICIA DE LA EXPERIENCIA ---
  const calculateOverall = (player: any, config: PositionOverallConfig = positionOverallConfig) => {
    const baseOverall = calculateWeightedOverallForBestRole(player, config);
    return applyExperienceBonus(baseOverall, player.experience);
  };

  const buildDraftOrder = async (myClub: any) => {
    if (!myClub?.grupo_id) {
      setDraftOrder([
        {
          teamId: String(myClub.id),
          teamName: myClub.nombre || 'Tu equipo',
          isUser: true,
          isBot: false,
          pick: 1,
          wins: 0,
          losses: 0,
          diff: 0
        }
      ]);
      setUserPickNumber(1);
      return;
    }

    const { data: teams, error: teamsError } = await supabase
      .from('clubes')
      .select('id, nombre, is_bot')
      .eq('grupo_id', myClub.grupo_id);

    if (teamsError || !teams || teams.length === 0) {
      setDraftOrder([]);
      setUserPickNumber(null);
      return;
    }

    const teamIds = teams.map((t) => String(t.id));
    const stats = new Map<string, { wins: number; losses: number; diff: number }>();
    teamIds.forEach((id) => stats.set(id, { wins: 0, losses: 0, diff: 0 }));

    const { data: playedMatches } = await supabase
      .from('matches')
      .select('home_team_id, away_team_id, home_score, away_score, played, fase, season_number')
      .in('home_team_id', teamIds)
      .in('away_team_id', teamIds)
      .eq('played', true)
      .eq('fase', 'REGULAR');

    const regularPlayedMatches = (playedMatches || []) as DraftMatchRow[];
    const currentSeasonMatches = filterMatchesBySeason(
      regularPlayedMatches,
      getLatestSeasonNumber(regularPlayedMatches)
    );

    currentSeasonMatches.forEach((match) => {
      const homeId = String(match.home_team_id);
      const awayId = String(match.away_team_id);
      const homeStats = stats.get(homeId);
      const awayStats = stats.get(awayId);
      if (!homeStats || !awayStats) return;

      const homeScore = Number(match.home_score || 0);
      const awayScore = Number(match.away_score || 0);
      homeStats.diff += homeScore - awayScore;
      awayStats.diff += awayScore - homeScore;

      if (homeScore > awayScore) {
        homeStats.wins += 1;
        awayStats.losses += 1;
      } else if (awayScore > homeScore) {
        awayStats.wins += 1;
        homeStats.losses += 1;
      }
    });

    const ordered = [...teams]
      .map((team) => {
        const base = stats.get(String(team.id)) || { wins: 0, losses: 0, diff: 0 };
        return {
          teamId: String(team.id),
          teamName: String(team.nombre || 'Equipo'),
          isUser: String(team.id) === String(myClub.id),
          isBot: Boolean(team.is_bot),
          wins: base.wins,
          losses: base.losses,
          diff: base.diff
        };
      })
      .sort((a, b) => {
        if (a.wins !== b.wins) return a.wins - b.wins;
        if (a.diff !== b.diff) return a.diff - b.diff;
        if (a.losses !== b.losses) return b.losses - a.losses;
        return a.teamName.localeCompare(b.teamName);
      })
      .map((team, index) => ({ ...team, pick: index + 1 }));

    const mine = ordered.find((entry) => entry.isUser);
    setUserPickNumber(mine?.pick || null);
    setDraftOrder(ordered);
  };

  const checkStatusAndGeneratePool = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: myClub } = await supabase.from('clubes').select('*').eq('owner_id', user.id).single();
      if (!myClub) {
        router.push('/');
        return;
      }

      const dynamicPositionConfig = await fetchPositionOverallConfig(supabase);
      setPositionOverallConfig(dynamicPositionConfig);

      const isRookieDraft = myClub.status === CLUB_STATUS.ROOKIE_DRAFT;
      const isSeasonDraft = myClub.status === CLUB_STATUS.SEASON_DRAFT;
      if (!isRookieDraft && !isSeasonDraft) {
        router.push('/');
        return;
      }

      setDraftMode(isSeasonDraft ? 'season' : 'rookie');
      setTeam(myClub);
      await buildDraftOrder(myClub);

      const countries = Object.keys(NAMES_DB);
      let rosterToRender: any[] = [];
      const { data: existingPlayers } = await supabase.from('players').select('*').eq('team_id', myClub.id);

      // En onboarding generamos fondo de armario si el equipo está vacío.
      if (isRookieDraft && (!existingPlayers || existingPlayers.length === 0)) {
        const newPlayers = [];
        const basePositions = ["Base", "Escolta", "Alero", "Ala-Pívot", "Pívot", "Base", "Alero", "Pívot"];

        for (let i = 0; i < 8; i++) {
          const randCountry = countries[Math.floor(Math.random() * countries.length)];
          const fNames = NAMES_DB[randCountry].first;
          const lNames = NAMES_DB[randCountry].last;
          const fName = fNames[Math.floor(Math.random() * fNames.length)];
          const lName = lNames[Math.floor(Math.random() * lNames.length)];

          const pos = basePositions[i];
          const isGuard = pos === 'Base' || pos === 'Escolta';
          const baseStat = () => Math.floor(Math.random() * 20) + 40;
          const { age, experience: exp } = rollAgeAndExperience(22, 33, 'rotation');

          const p: any = {
            name: `${fName} ${lName}`,
            nationality: randCountry,
            position: pos,
            age,
            height: isGuard ? Math.floor(Math.random() * 15) + 185 : Math.floor(Math.random() * 15) + 200,
            shooting_3pt: baseStat(), shooting_2pt: baseStat(),
            defense: baseStat(), passing: baseStat(),
            rebounding: baseStat(), speed: baseStat(),
            dribbling: baseStat(), stamina: 100,
            experience: exp,
            team_id: myClub.id,
            lineup_pos: 'BENCH'
          };

          p.position = getBestRoleForPlayer(p, dynamicPositionConfig);
          p.overall = calculateOverall(p, dynamicPositionConfig);
          p.salary = getWeeklySalaryByOvr(p.overall);
          newPlayers.push(p);
        }

        await supabase.from('players').insert(newPlayers);
        rosterToRender = newPlayers;
      } else {
        rosterToRender = existingPlayers || [];
      }

      const rosterWithOverall = rosterToRender.map((p) => ({
        ...p,
        position: getBestRoleForPlayer(p, dynamicPositionConfig),
        overall: calculateOverall(p, dynamicPositionConfig)
      }));
      setCurrentRoster(rosterWithOverall.sort((a, b) => (b.overall || 0) - (a.overall || 0)));

      if (isSeasonDraft) {
        const poolTag = getSeasonDraftPoolTag(myClub.id);
        const { data: seasonPool } = await supabase
          .from('players')
          .select('*')
          .is('team_id', null)
          .eq('lineup_pos', poolTag);

        // Si por cualquier motivo no existe pool, generamos un fallback mínimo.
        if (!seasonPool || seasonPool.length === 0) {
          const fallbackPool = POSITIONS.map((pos) => {
            const randCountry = countries[Math.floor(Math.random() * countries.length)];
            const fNames = NAMES_DB[randCountry].first;
            const lNames = NAMES_DB[randCountry].last;
            const { age, experience } = rollAgeAndExperience(18, 20, 'rookie');
            const target = Math.floor(Math.random() * 9) + 62;
            const stat = () => Math.max(45, Math.min(99, target + Math.floor(Math.random() * 12) - 6));
            const isGuard = pos === 'Base' || pos === 'Escolta';
            const attributes = {
              shooting_3pt: stat(),
              shooting_2pt: stat(),
              defense: stat(),
              rebounding: stat(),
              passing: stat(),
              speed: stat(),
              dribbling: stat()
            };
            const safeExperience = Math.max(1, experience);
            const bestPosition = getBestRoleForPlayer(
              {
                ...attributes
              },
              dynamicPositionConfig
            );
            const overall = calculateOverall(
              {
                position: bestPosition,
                ...attributes,
                experience: safeExperience
              },
              dynamicPositionConfig
            );
            return {
              team_id: null,
              lineup_pos: poolTag,
              name: `${fNames[Math.floor(Math.random() * fNames.length)]} ${lNames[Math.floor(Math.random() * lNames.length)]}`,
              nationality: randCountry,
              position: bestPosition,
              age,
              height: isGuard ? Math.floor(Math.random() * 14) + 184 : Math.floor(Math.random() * 16) + 198,
              ...attributes,
              experience: safeExperience,
              stamina: 100,
              overall,
              salary: getWeeklySalaryByOvr(overall)
            };
          });
          await supabase.from('players').insert(fallbackPool);
        }

        const { data: refreshedSeasonPool } = await supabase
          .from('players')
          .select('*')
          .is('team_id', null)
          .eq('lineup_pos', poolTag);

        const seasonCandidates = (refreshedSeasonPool || []).map((p: any) => ({
          ...p,
          position: getBestRoleForPlayer(p, dynamicPositionConfig),
          overall: calculateOverall(p, dynamicPositionConfig),
          temp_id: p.id,
          db_id: p.id
        }));

        setRookies(seasonCandidates.sort((a, b) => (b.overall || 0) - (a.overall || 0)));
      } else {
        // Draft de expansión clásico (2 picks)
        const generatedRookies = Array.from({ length: 10 }).map((_, i) => {
          const randCountry = countries[Math.floor(Math.random() * countries.length)];
          const fNames = NAMES_DB[randCountry].first;
          const lNames = NAMES_DB[randCountry].last;

          const fName = fNames[Math.floor(Math.random() * fNames.length)];
          const lName = lNames[Math.floor(Math.random() * lNames.length)];

          const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
          const isGuard = pos === 'Base' || pos === 'Escolta';
          const { age, experience } = rollAgeAndExperience(18, 20, 'rookie');

          const draftPlayer = {
            temp_id: i,
            db_id: null,
            name: `${fName} ${lName}`,
            nationality: randCountry,
            position: pos,
            age,
            height: isGuard ? Math.floor(Math.random() * 15) + 185 : Math.floor(Math.random() * 15) + 200,
            shooting_3pt: Math.floor(Math.random() * 20) + 55,
            shooting_2pt: Math.floor(Math.random() * 20) + 55,
            defense: Math.floor(Math.random() * 20) + 55,
            rebounding: Math.floor(Math.random() * 20) + 55,
            passing: Math.floor(Math.random() * 20) + 55,
            speed: Math.floor(Math.random() * 20) + 55,
            dribbling: Math.floor(Math.random() * 20) + 55,
            experience,
            stamina: 100,
          };

          return {
            ...draftPlayer,
            position: getBestRoleForPlayer(draftPlayer, dynamicPositionConfig),
            overall: calculateOverall(draftPlayer, dynamicPositionConfig)
          };
        });

        setRookies(generatedRookies.sort((a, b) => b.overall - a.overall));
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: number) => {
      if (selectedIds.includes(id)) {
          setSelectedIds(selectedIds.filter(selId => selId !== id));
      } else {
          if (selectedIds.length < maxPicks) setSelectedIds([...selectedIds, id]);
      }
  };

  const confirmDraft = async () => {
      if (selectedIds.length !== maxPicks || !team) return;
      setSaving(true);

      try {
          if (draftMode === 'season') {
              const selected = rookies.find(r => selectedIds.includes(r.temp_id));
              if (!selected?.db_id) throw new Error('No se encontró el pick seleccionado.');

              const poolTag = getSeasonDraftPoolTag(team.id);
              const { error: assignError } = await supabase
                  .from('players')
                  .update({
                    team_id: team.id,
                    lineup_pos: 'BENCH',
                    position: selected.position,
                    overall: selected.overall
                  })
                  .eq('id', selected.db_id)
                  .is('team_id', null)
                  .eq('lineup_pos', poolTag);

              if (assignError) throw assignError;

              const discardIds = rookies
                .filter(r => r.db_id && r.db_id !== selected.db_id)
                .map(r => r.db_id);

              if (discardIds.length > 0) {
                await supabase.from('players').delete().in('id', discardIds);
              }

              await supabase.from('clubes').update({ status: CLUB_STATUS.COMPETING }).eq('id', team.id);
          } else {
              const chosenRookies = rookies.filter(r => selectedIds.includes(r.temp_id)).map(r => {
                  const { temp_id, db_id, ...dbPlayer } = r;
                  return {
                      ...dbPlayer,
                      team_id: team.id,
                      lineup_pos: 'BENCH',
                      salary: getWeeklySalaryByOvr(r.overall)
                  };
              });

              await supabase.from('players').insert(chosenRookies);
              await supabase.from('clubes').update({ status: CLUB_STATUS.COMPETING }).eq('id', team.id);
          }

          router.push('/');
      } catch (e) {
          console.error(e);
          alert("Hubo un error cerrando el draft.");
          setSaving(false);
      }
  };

  if (loading) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-mono text-cyan-500 animate-pulse uppercase tracking-[0.3em]"><GraduationCap size={48} className="mb-4"/> Preparando Draft Combine...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-mono relative overflow-hidden">
      
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-6xl mx-auto relative z-10">
        
        <div className="text-center mb-8 space-y-4">
          <div className="inline-flex items-center justify-center p-3 bg-cyan-500/10 text-cyan-400 rounded-full mb-2 ring-1 ring-cyan-500/30">
            <GraduationCap size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter uppercase text-white">
            {draftMode === 'season' ? 'Draft de Temporada' : 'Draft de Expansión'}
          </h1>
          <p className="text-slate-400 max-w-2xl mx-auto text-sm">
            {draftMode === 'season'
              ? <>Evento anual de reclutamiento. Orden de picks por rendimiento del grupo: el peor balance elige antes. Tú eliges <strong className="text-cyan-400">1 rookie</strong>.</>
              : <>Evento fundacional de tu franquicia. Tienes derecho a elegir <strong className="text-cyan-400">2 rookies</strong> para arrancar el proyecto.</>
            }
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6 mb-8">
          <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-cyan-400 flex items-center gap-2">
                <ListOrdered size={14} /> Orden del Draft
              </h2>
              {userPickNumber && (
                <span className="text-[10px] font-black uppercase tracking-widest bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 px-2 py-1 rounded-lg">
                  Tu pick #{userPickNumber}
                </span>
              )}
            </div>
            <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
              {draftOrder.map((entry) => (
                <div
                  key={entry.teamId}
                  className={`rounded-xl border px-3 py-2 flex items-center justify-between ${
                    entry.isUser
                      ? 'border-cyan-400/50 bg-cyan-500/10'
                      : 'border-white/10 bg-slate-950/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-slate-900 border border-white/15 flex items-center justify-center text-[10px] font-black text-slate-200">
                      {entry.pick}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-black truncate ${entry.isUser ? 'text-white' : 'text-slate-300'}`}>
                        {entry.teamName}
                      </p>
                      <p className="text-[10px] uppercase tracking-widest text-slate-500">
                        {entry.isBot ? 'BOT' : 'Usuario'} • {entry.wins}-{entry.losses} • Diff {entry.diff >= 0 ? '+' : ''}{entry.diff}
                      </p>
                    </div>
                  </div>
                  {entry.isUser && <Trophy size={14} className="text-cyan-300 shrink-0" />}
                </div>
              ))}
              {draftOrder.length === 0 && (
                <div className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-4 text-center text-xs text-slate-500 uppercase tracking-widest font-black">
                  Sin orden disponible
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Big Board</div>
              <select
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                className="bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-[11px] font-bold text-slate-200 outline-none focus:border-cyan-500"
              >
                <option value="ALL">Todas las posiciones</option>
                {POSITIONS.map((position) => (
                  <option key={position} value={position}>{position}</option>
                ))}
              </select>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as 'board' | 'ovr' | 'experience')}
                className="bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-[11px] font-bold text-slate-200 outline-none focus:border-cyan-500"
              >
                <option value="board">Top Board (OVR)</option>
                <option value="ovr">Mayor OVR</option>
                <option value="experience">Mayor experiencia</option>
              </select>
              <button
                onClick={() => setShowRoster(true)}
                className="ml-auto flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-300 hover:text-cyan-400 transition-colors bg-white/5 px-4 py-2 rounded-lg"
              >
                <Users size={16}/> Mi Plantilla ({currentRoster.length})
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-slate-950/70 border border-white/10 rounded-xl px-3 py-2">
                <p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Prospects</p>
                <p className="text-sm font-black text-white">{rookiesBoard.length}</p>
              </div>
              <div className="bg-slate-950/70 border border-white/10 rounded-xl px-3 py-2">
                <p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Tu Pick</p>
                <p className="text-sm font-black text-cyan-300">{userPickNumber ? `#${userPickNumber}` : '-'}</p>
              </div>
              <div className="bg-slate-950/70 border border-white/10 rounded-xl px-3 py-2">
                <p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Picks Totales</p>
                <p className="text-sm font-black text-white">{maxPicks}</p>
              </div>
              <div className="bg-slate-950/70 border border-white/10 rounded-xl px-3 py-2">
                <p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Elegidos</p>
                <p className="text-sm font-black text-emerald-300">{selectedIds.length}/{maxPicks}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="sticky top-4 z-40 bg-slate-900/80 backdrop-blur-md border border-cyan-500/30 p-4 rounded-2xl shadow-2xl flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="text-xs font-black uppercase text-slate-400 tracking-widest hidden sm:block">Picks Usados</div>
              <div className="flex gap-2">
                {Array.from({ length: maxPicks }).map((_, i) => {
                  const pick = i + 1;
                  return (
                    <div key={pick} className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs border ${i < selectedIds.length ? 'bg-cyan-500 border-cyan-400 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.5)]' : 'bg-slate-950 border-slate-700 text-slate-600'}`}>
                      {i < selectedIds.length ? <CheckCircle size={14}/> : pick}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="h-8 w-px bg-white/10 hidden md:block"></div>
            <div className="text-[11px] uppercase tracking-widest font-black text-slate-300 bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2">
              En reloj: <span className="text-cyan-300">{team?.nombre || 'Tu equipo'}</span>
            </div>
          </div>

          <button 
            onClick={confirmDraft}
            disabled={selectedIds.length !== maxPicks || saving}
            className="bg-white text-slate-950 px-8 py-3 rounded-xl font-black uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-cyan-400 transition-all active:scale-95 disabled:opacity-20 disabled:hover:bg-white w-full md:w-auto justify-center"
          >
            {saving ? 'Firmando Contratos...' : (draftMode === 'season' ? 'Confirmar Pick' : 'Confirmar Elección')} <ChevronRight size={16}/>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
            {rookiesBoard.map((player) => {
                const isSelected = selectedIds.includes(player.temp_id);
                const isMaxedOut = selectedIds.length >= maxPicks && !isSelected;

                return (
                    <div 
                        key={player.temp_id}
                        onClick={() => !isMaxedOut && toggleSelection(player.temp_id)}
                        className={`relative bg-slate-900 border-2 rounded-[2rem] p-6 cursor-pointer transition-all duration-300 group
                        ${isSelected ? 'border-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.2)] bg-slate-800' : 
                          isMaxedOut ? 'border-slate-800 opacity-40 cursor-not-allowed' : 
                          'border-slate-800 hover:border-slate-600 hover:-translate-y-1'}`}
                    >
                        {isSelected && (
                            <div className="absolute -top-3 -right-3 bg-cyan-500 text-slate-950 p-2 rounded-full shadow-lg z-20">
                                <CheckCircle size={20} className="fill-current"/>
                            </div>
                        )}
                        <div className="absolute top-3 left-3 text-[10px] font-black uppercase tracking-widest bg-slate-950/90 border border-white/10 px-2 py-1 rounded-lg text-cyan-300">
                          #{player.boardRank}
                        </div>

                        <div className="flex gap-4 items-center border-b border-white/5 pb-4 mb-4">
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black shadow-inner border-2 ${isSelected ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' : 'bg-slate-950 text-slate-300 border-slate-700'}`}>
                                {player.overall}
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <h3 className={`font-black uppercase truncate text-lg flex items-center gap-2 ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                                    <span className="text-xl" title={player.nationality}>{FLAGS[player.nationality] || '🏳️'}</span> {player.name}
                                </h3>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    <span className="text-[9px] font-black uppercase tracking-widest bg-slate-950 px-2 py-1 rounded text-slate-400 border border-white/5">{player.position}</span>
                                    <span className="text-[9px] font-black uppercase tracking-widest bg-cyan-500/10 px-2 py-1 rounded text-cyan-400 border border-cyan-500/20">{player.age}A | {player.height}CM</span>
                                </div>
                            </div>
                        </div>

                        {/* CUADRÍCULA DE 8 STATS PERFECTA (INCLUYE MANEJO Y EXPERIENCIA) */}
                        <div className="grid grid-cols-2 gap-3">
                            <Stat label="Tiro Ext." value={player.shooting_3pt} icon={<Target size={12}/>} />
                            <Stat label="Tiro Int." value={player.shooting_2pt} icon={<Target size={12}/>} />
                            <Stat label="Defensa" value={player.defense} icon={<Shield size={12}/>} />
                            <Stat label="Rebote" value={player.rebounding} icon={<Activity size={12}/>} />
                            <Stat label="Pase" value={player.passing} icon={<Hand size={12}/>} />
                            <Stat label="Manejo" value={player.dribbling} icon={<Hand size={12}/>} />
                            <Stat label="Velocidad" value={player.speed} icon={<Zap size={12}/>} />
                            <Stat label="Experiencia" value={player.experience} icon={<Brain size={12}/>} />
                        </div>
                    </div>
                );
            })}
        </div>
      </div>

      {showRoster && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-slate-900 border border-white/10 w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
                  
                  <div className="flex justify-between items-center p-6 border-b border-white/5 bg-slate-950/50">
                      <div>
                          <h2 className="text-xl font-black uppercase text-white flex items-center gap-2"><Users className="text-cyan-500"/> Fondo de Armario</h2>
                          <p className="text-xs text-slate-400 mt-1">Estos son los jugadores de rotación que ya pertenecen a tu equipo.</p>
                      </div>
                      <button onClick={() => setShowRoster(false)} className="text-slate-500 hover:text-white p-2 transition-colors">
                          <X size={24} />
                      </button>
                  </div>

                  <div className="p-6 overflow-y-auto bg-slate-900/50 space-y-3 custom-scrollbar">
                      {currentRoster.map(p => (
                          <div key={p.id} className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800">
                              <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center font-black text-slate-300 border border-slate-700">
                                      {p.overall}
                                  </div>
                                  <div>
                                      <div className="font-bold text-white uppercase text-sm flex items-center gap-2">
                                          <span title={p.nationality}>{FLAGS[p.nationality] || '🏳️'}</span> {p.name}
                                      </div>
                                      <div className="flex gap-2 mt-1 items-center">
                                          <span className="text-[10px] font-black text-slate-500 tracking-widest">{p.position}</span>
                                          <span className="text-[10px] text-slate-600">|</span>
                                          <span className="text-[10px] font-bold text-slate-500">{p.age}A - {p.height}CM</span>
                                          <span className="text-[10px] text-slate-600">|</span>
                                          <span className="text-[10px] font-bold text-purple-400 flex items-center gap-1"><Brain size={10}/> EXP: {p.experience}</span>
                                      </div>
                                  </div>
                              </div>
                              <div className="text-[10px] uppercase font-black tracking-widest text-slate-600 bg-white/5 px-3 py-1 rounded-full">
                                  Rotación
                              </div>
                          </div>
                      ))}
                  </div>

                  <div className="p-4 border-t border-white/5 bg-slate-950/50 text-center">
                      <button onClick={() => setShowRoster(false)} className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-black uppercase text-xs rounded-xl transition-colors">
                          Cerrar y Volver al Draft
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}

function Stat({ label, value, icon, className = '' }: { label: string, value: number, icon: React.ReactNode, className?: string }) {
    return (
        <div className={`bg-slate-950/50 rounded-xl p-2 flex items-center justify-between border border-white/5 ${className}`}>
            <div className="flex items-center gap-1.5 text-slate-500">
                {icon} <span className="text-[9px] uppercase font-black tracking-tighter">{label}</span>
            </div>
            <span className={`text-xs font-black ${value >= 70 ? 'text-green-400' : value >= 60 ? 'text-white' : 'text-slate-500'}`}>{value}</span>
        </div>
    );
}
