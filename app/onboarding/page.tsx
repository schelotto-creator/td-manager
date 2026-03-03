"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getWeeklySalaryByOvr } from '@/lib/salary';
import { rollAgeAndExperience } from '@/lib/player-generation';
import { CLUB_STATUS } from '@/lib/season-draft';
import { Trophy, ArrowRight, User, Shield, Loader2, PaintBucket } from 'lucide-react';
import { useRouter } from 'next/navigation';

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

type EscudoProps = {
  forma?: string;
  color?: string;
  className?: string;
};

type BotTeamCandidate = {
  id: string;
  league_id: number | null;
  pts: number | null;
  v: number | null;
  d: number | null;
};

type LigaLevel = {
  id: number;
  nivel: number;
};

function EscudoSVG({ forma, color, className }: EscudoProps) {
  const renderPath = () => {
    switch (forma) {
      case 'circle': return <circle cx="12" cy="12" r="10" />;
      case 'square': return <rect x="3" y="3" width="18" height="18" rx="2" />;
      case 'modern': return <path d="M5 3h14a2 2 0 012 2v10a8 8 0 01-8 8 8 8 0 01-8-8V5a2 2 0 012-2z" />;
      case 'hexagon': return <path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" />;
      default: return <path d="M12 2.17a11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.352-.272-2.644-.759-3.833a.75.75 0 00-.722-.515 11.209 11.209 0 01-7.877-3.08zM12 17.25a5.25 5.25 0 100-10.5 5.25 5.25 0 000 10.5z" clipRule="evenodd" />;
    }
  };
  return (
    <svg viewBox="0 0 24 24" fill={color || 'currentColor'} className={`${className || 'w-full h-full'} drop-shadow-2xl`}>
       {renderPath()}
    </svg>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [managerName, setManagerName] = useState('');
  const [clubName, setClubName] = useState('');
  const [clubForma, setClubForma] = useState('classic');
  const [clubColor, setClubColor] = useState('#ea580c'); 

  const colores = ['#ea580c', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#eab308', '#000000', '#ffffff'];
  const formas = ['classic', 'modern', 'circle', 'hexagon', 'square'];

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: mData } = await supabase.from('managers').select('id').eq('owner_id', user.id).limit(1);
      const { data: cData } = await supabase.from('clubes').select('id, status').eq('owner_id', user.id).limit(1);
      
      if (mData?.[0] && cData?.[0]) {
          if (cData[0].status === CLUB_STATUS.ROOKIE_DRAFT || cData[0].status === CLUB_STATUS.SEASON_DRAFT) {
              router.push('/draft-room');
          } else {
              const { count } = await supabase.from('players').select('*', { count: 'exact', head: true }).eq('team_id', cData[0].id);
              if (count && count > 0) {
                  router.push('/');
              }
          }
      }
    };
    checkUser();
  }, [router]);

  const handleFinishOnboarding = async () => {
    if (!managerName || !clubName) {
      setError("Por favor, rellena todos los campos.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No hay sesión activa");

      const { data: existingManagers } = await supabase.from('managers').select('id').eq('owner_id', user.id).limit(1);
      
      if (!existingManagers?.[0]) {
          const { error: errM } = await supabase.from('managers').insert({
            owner_id: user.id,
            nombre: managerName,
            nivel: 1,
            xp: 0
          });
          if (errM) throw errM;
      }

      const { data: existingClubes } = await supabase.from('clubes').select('id').eq('owner_id', user.id).limit(1);
      let targetClubId = existingClubes?.[0]?.id;

      if (!targetClubId) {
          const { data: botTeams } = await supabase.from('clubes')
            .select('id, league_id, pts, v, d')
            .eq('is_bot', true)
            .is('owner_id', null);

          let botTeam: BotTeamCandidate | null = null;
          if (botTeams && botTeams.length > 0) {
              const leagueIds = [...new Set(botTeams.map(t => t.league_id).filter(Boolean))] as number[];
              const { data: ligasData } = leagueIds.length > 0
                ? await supabase.from('ligas').select('id, nivel').in('id', leagueIds)
                : { data: [] as LigaLevel[] };

              const nivelByLigaId = new Map<number, number>();
              (ligasData || []).forEach(l => nivelByLigaId.set(l.id, l.nivel));

              const sortedBots = [...botTeams].sort((a, b) => {
                  const nivelA = nivelByLigaId.get(a.league_id) ?? 999; // 1 = Bronce (más baja)
                  const nivelB = nivelByLigaId.get(b.league_id) ?? 999;
                  if (nivelA !== nivelB) return nivelA - nivelB;

                  const ptsA = a.pts || 0;
                  const ptsB = b.pts || 0;
                  if (ptsA !== ptsB) return ptsA - ptsB;

                  const vA = a.v || 0;
                  const vB = b.v || 0;
                  if (vA !== vB) return vA - vB;

                  const dA = a.d || 0;
                  const dB = b.d || 0;
                  return dB - dA;
              });

              botTeam = sortedBots[0];
          }

          if (botTeam) {
              targetClubId = botTeam.id;
              const { error: errTakeover } = await supabase.from('clubes').update({
                  owner_id: user.id,
                  nombre: clubName,
                  escudo_forma: clubForma,
                  color_primario: clubColor,
                  is_bot: false, 
                  presupuesto: 1000000,
                  status: CLUB_STATUS.ROOKIE_DRAFT
              }).eq('id', botTeam.id);
              if (errTakeover) throw errTakeover;
          } else {
              const { data: newClubData, error: errC } = await supabase.from('clubes').insert({
                  owner_id: user.id,
                  nombre: clubName,
                  escudo_forma: clubForma,
                  color_primario: clubColor,
                  presupuesto: 1000000,
                  is_bot: false,
                  league_id: 1,
                  status: CLUB_STATUS.ROOKIE_DRAFT
              }).select().limit(1);
              if (errC) throw errC;
              targetClubId = newClubData?.[0]?.id;
          }
      }

      // GENERAR BASE DEL EQUIPO (8 ROTACIÓN CON NACIONALIDADES Y EXPERIENCIA)
      if (targetClubId) {
          await supabase.from('players').delete().eq('team_id', targetClubId);

          const newPlayers = [];
          const basePositions = ["Base", "Escolta", "Alero", "Ala-Pívot", "Pívot", "Base", "Alero", "Pívot"];
          const countries = Object.keys(NAMES_DB);
          
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
              const initialOverall = 55 + Math.floor(exp * 0.05);

              newPlayers.push({
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
                  overall: initialOverall, // Añadimos bonus de experiencia a la media inicial
                  salary: getWeeklySalaryByOvr(initialOverall),
                  team_id: targetClubId,
                  lineup_pos: 'BENCH'
              });
          }
          const { error: errP } = await supabase.from('players').insert(newPlayers);
          if (errP) throw errP;
      }

      router.push('/draft-room');

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Error desconocido';
      setError("Error al crear la franquicia: " + errMsg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden text-slate-200">
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-orange-500/10 rounded-full blur-[120px] translate-x-1/3 translate-y-1/3 pointer-events-none"></div>

      <div className="w-full max-w-2xl relative z-10">
        
        <div className="flex justify-center gap-2 mb-12">
            <div className={`h-2 rounded-full transition-all duration-500 ${step >= 1 ? 'w-16 bg-cyan-500 shadow-[0_0_10px_#06b6d4]' : 'w-4 bg-slate-800'}`}></div>
            <div className={`h-2 rounded-full transition-all duration-500 ${step >= 2 ? 'w-16 bg-orange-500 shadow-[0_0_10px_#f97316]' : 'w-4 bg-slate-800'}`}></div>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl rounded-[3rem] border border-white/5 p-8 md:p-12 shadow-2xl">
          
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl text-xs font-bold mb-8 text-center uppercase tracking-widest">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-6 text-cyan-500">
                  <User size={40} />
                </div>
                <h1 className="text-3xl md:text-4xl font-black italic uppercase tracking-tighter text-white">Firma tu Contrato</h1>
                <p className="text-sm text-slate-400 mt-2 font-medium">La directiva confía en ti. ¿Cómo debemos llamarte, Coach?</p>
              </div>

              <div className="space-y-6 max-w-sm mx-auto">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Nombre y Apellido</label>
                  <input 
                    type="text" 
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    placeholder="Ej: Phil Jackson"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl px-6 py-4 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-bold text-lg text-center"
                    autoFocus
                  />
                </div>
                
                <button 
                  onClick={() => managerName.length > 2 ? setStep(2) : setError("Introduce un nombre válido.")}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-black uppercase text-sm py-4 rounded-2xl mt-4 transition-all flex items-center justify-center gap-2 group"
                >
                  Continuar <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-orange-500/10 border border-orange-500/20 mb-6 text-orange-500">
                  <Shield size={40} />
                </div>
                <h1 className="text-3xl md:text-4xl font-black italic uppercase tracking-tighter text-white">Funda tu Franquicia</h1>
                <p className="text-sm text-slate-400 mt-2 font-medium">Dale una identidad a tu equipo. Empezarás desde lo más bajo.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
                
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Nombre del Equipo</label>
                    <input 
                      type="text" 
                      value={clubName}
                      onChange={(e) => setClubName(e.target.value)}
                      placeholder="Ej: Barcelona Dragons"
                      className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl px-6 py-4 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-bold text-lg"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-1"><PaintBucket size={12}/> Color Principal</label>
                    <div className="flex gap-2 flex-wrap bg-slate-950 p-3 rounded-2xl border border-slate-800">
                      {colores.map(color => (
                        <button 
                          key={color} 
                          onClick={() => setClubColor(color)}
                          className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${clubColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-950' : ''}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Forma del Escudo</label>
                    <div className="flex gap-2 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                      {formas.map(f => (
                        <button 
                          key={f} 
                          onClick={() => setClubForma(f)}
                          className={`flex-1 p-2 rounded-xl transition-all ${clubForma === f ? 'bg-slate-800 ring-1 ring-orange-500' : 'hover:bg-slate-800/50'}`}
                        >
                          <EscudoSVG forma={f} color={clubColor} className="w-6 h-6 mx-auto opacity-80" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center p-8 bg-slate-950/50 rounded-3xl border border-white/5">
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">Previsualización Oficial</p>
                   <div className="w-40 h-40 relative flex items-center justify-center mb-6">
                      <EscudoSVG forma={clubForma} color={clubColor} className="w-full h-full" />
                   </div>
                   <h3 className="text-xl font-black italic uppercase text-white text-center">{clubName || 'Tu Equipo'}</h3>
                   <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Dirigido por {managerName || 'Coach'}</p>
                </div>

              </div>

              <div className="flex gap-4 mt-10">
                <button 
                  onClick={() => setStep(1)}
                  className="px-6 py-4 rounded-2xl font-bold text-sm text-slate-400 hover:bg-slate-800 transition-all uppercase"
                >
                  Volver
                </button>
                <button 
                  onClick={handleFinishOnboarding}
                  disabled={loading || !clubName}
                  className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-black uppercase text-sm py-4 rounded-2xl transition-all flex items-center justify-center gap-2 group shadow-[0_0_20px_rgba(234,88,12,0.3)]"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Trophy className="w-5 h-5" /> Ir al Draft</>}
                </button>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
