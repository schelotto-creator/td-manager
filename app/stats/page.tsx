'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Trophy, Target, Activity, Hand, Crown, RefreshCw, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// --- TIPOS ---
type PlayerStats = {
  id: number;
  name: string;
  position: string;
  team_name: string;
  team_id: string; // <-- Ahora el ID del club es UUID (string)
  games_played: number;
  ppg: number; 
  rpg: number; 
  apg: number; 
  efficiency: number; 
};

export default function StatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<PlayerStats[]>([]);
  const [category, setCategory] = useState<'ppg' | 'rpg' | 'apg'>('ppg');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [category]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      
      // Verificamos si el usuario está logueado por seguridad
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      // Consultamos la NUEVA vista SQL que acabamos de crear
      const { data, error } = await supabase
          .from('view_player_season_stats')
          .select('*')
          .order(category, { ascending: false })
          .limit(50);

      if (error) {
          console.error("Error al cargar estadísticas (¿Está creada la vista SQL?):", error.message);
          setStats([]); // Evitamos crasheos si la vista falla
      } else if (data) {
          setStats(data);
      }
    } catch (err) {
      console.error("Error crítico en la carga de stats:", err);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryLabel = () => {
    const labels = { ppg: 'Puntos', rpg: 'Rebotes', apg: 'Asistencias' };
    return labels[category];
  };

  const getValue = (player: PlayerStats) => player[category];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 relative overflow-hidden">
      
      {/* Luces Ambientales de Fondo */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-4xl mx-auto relative z-10">
          {/* CABECERA */}
          <div className="mb-8 text-center relative">
            <Link href="/" className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white flex items-center gap-2 mb-2 text-sm font-bold w-fit transition-colors">
                <ChevronLeft size={16}/> VOLVER
            </Link>
            <h1 className="text-4xl font-black italic uppercase tracking-tighter text-white flex justify-center items-center gap-3">
              <Trophy className="text-yellow-500" size={40}/> LÍDERES DE LA LIGA
            </h1>
            <p className="text-slate-400 mt-2 text-xs font-bold uppercase tracking-widest">Basado en rendimiento oficial verificado</p>
          </div>

          {/* SELECTOR DE CATEGORÍA */}
          <div className="mb-12 flex justify-center gap-2 md:gap-4 flex-wrap">
            {[
              { id: 'ppg', label: 'ANOTADORES', icon: Target, color: 'bg-cyan-600', shadow: 'shadow-[0_0_15px_rgba(6,182,212,0.3)]' },
              { id: 'rpg', label: 'REBOTEADORES', icon: Activity, color: 'bg-orange-600', shadow: 'shadow-[0_0_15px_rgba(234,88,12,0.3)]' },
              { id: 'apg', label: 'ASISTENTES', icon: Hand, color: 'bg-yellow-600', shadow: 'shadow-[0_0_15px_rgba(202,138,4,0.3)]' }
            ].map((cat) => (
              <button 
                key={cat.id}
                onClick={() => setCategory(cat.id as any)}
                className={`px-4 md:px-6 py-3 rounded-xl font-black italic uppercase tracking-widest text-xs flex items-center gap-2 transition-all border ${category === cat.id ? `${cat.color} text-white ${cat.shadow} border-white/20 scale-105` : 'bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800 hover:text-white'}`}
              >
                <cat.icon size={16}/>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
               <RefreshCw className="animate-spin text-cyan-500" size={40}/>
               <span className="text-slate-500 font-mono text-xs uppercase tracking-widest animate-pulse">RECOPILANDO ACTAS OFICIALES...</span>
            </div>
          ) : (
            <>
              {/* PODIO (TOP 3) - Oculto si no hay datos suficientes */}
              {stats.length >= 3 && (
                  <div className="grid grid-cols-3 gap-2 md:gap-4 mb-8 items-end">
                    
                    {/* 2º LUGAR */}
                    <div className="bg-slate-900 border border-slate-800 rounded-t-3xl p-4 flex flex-col items-center relative h-40 justify-end shadow-xl group hover:border-slate-700 transition-colors">
                        <div className="absolute -top-4 w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center font-black text-slate-800 border-4 border-slate-950 shadow-lg">2</div>
                        <div className="text-center w-full">
                            <div className="font-bold text-white text-xs md:text-sm truncate group-hover:text-cyan-400 transition-colors">{stats[1].name}</div>
                            <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-0.5 truncate">{stats[1].team_name}</div>
                            <div className="text-2xl md:text-3xl font-mono font-black text-slate-300 mt-2">{getValue(stats[1])}</div>
                        </div>
                    </div>

                    {/* 1º LUGAR (MVP) */}
                    <div className="bg-gradient-to-t from-slate-900 to-yellow-900/20 border-x border-t border-yellow-500/30 rounded-t-3xl p-4 flex flex-col items-center relative h-56 justify-end shadow-[0_-10px_40px_rgba(234,179,8,0.15)] group">
                        <Crown className="text-yellow-500 mb-4 animate-bounce drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]" size={48} />
                        <div className="text-center w-full">
                            <div className="font-black text-white text-sm md:text-lg truncate group-hover:text-yellow-400 transition-colors">{stats[0].name}</div>
                            <div className="text-[10px] text-yellow-600 font-black uppercase tracking-widest mt-1 truncate">{stats[0].team_name}</div>
                            <div className="text-4xl md:text-6xl font-mono font-black text-white mt-3 drop-shadow-md">{getValue(stats[0])}</div>
                            <div className="text-[9px] text-slate-400 mt-2 uppercase font-bold tracking-widest">{getCategoryLabel()} / P</div>
                        </div>
                    </div>

                    {/* 3º LUGAR */}
                    <div className="bg-slate-900 border border-slate-800 rounded-t-3xl p-4 flex flex-col items-center relative h-32 justify-end shadow-xl group hover:border-slate-700 transition-colors">
                        <div className="absolute -top-4 w-8 h-8 bg-orange-700 rounded-full flex items-center justify-center font-black text-white border-4 border-slate-950 shadow-lg">3</div>
                        <div className="text-center w-full">
                            <div className="font-bold text-white text-xs md:text-sm truncate group-hover:text-orange-400 transition-colors">{stats[2].name}</div>
                            <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-0.5 truncate">{stats[2].team_name}</div>
                            <div className="text-xl md:text-2xl font-mono font-black text-orange-400 mt-2">{getValue(stats[2])}</div>
                        </div>
                    </div>

                  </div>
              )}

              {/* LISTA COMPLETA */}
              <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-950 text-[10px] uppercase text-slate-500 font-bold tracking-widest border-b border-slate-800">
                            <tr>
                                <th className="px-6 py-4 w-16 text-center">Rnk</th>
                                <th className="px-6 py-4">Jugador</th>
                                <th className="px-6 py-4">Franquicia</th>
                                <th className="px-6 py-4 text-center">Partidos</th>
                                <th className="px-6 py-4 text-right pr-8 text-white">{getCategoryLabel().toUpperCase()} / Medio</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {stats.map((player, index) => (
                                <tr key={player.id} className="hover:bg-white/5 transition-colors group">
                                    <td className={`px-6 py-4 text-center font-mono font-bold ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-orange-500' : 'text-slate-600'}`}>
                                        {index + 1}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-white group-hover:text-cyan-400 transition-colors">{player.name}</div>
                                        <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-0.5">{player.position}</div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-400 font-bold">{player.team_name}</td>
                                    <td className="px-6 py-4 text-center text-slate-500 font-mono">{player.games_played}</td>
                                    <td className="px-6 py-4 text-right pr-8 font-black font-mono text-lg text-white group-hover:text-cyan-400 transition-colors">
                                        {getValue(player)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
                {stats.length === 0 && (
                    <div className="p-20 text-center flex flex-col items-center gap-3">
                        <Activity className="text-slate-600 mb-2 w-12 h-12 opacity-50" />
                        <div className="text-white font-bold text-lg uppercase tracking-widest">Sin datos registrados</div>
                        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest max-w-xs leading-relaxed">
                            No hay estadísticas suficientes. Juega partidos en el calendario para llenar esta tabla.
                        </div>
                    </div>
                )}
              </div>
            </>
          )}
      </div>
    </div>
  );
}