'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getWeeklySalaryByOvr } from '@/lib/salary';
import { isSeasonDraftPoolTag } from '@/lib/season-draft';
import {
  applyExperienceBonus,
  calculateWeightedOverallForBestRole,
  fetchPositionOverallConfig,
  getBestRoleForPlayer,
  getDefaultPositionOverallConfig,
  type PositionOverallConfig
} from '@/lib/position-overall-config';
import { ShoppingCart as MarketIcon, DollarSign as CashIcon, ArrowLeft as BackIcon, UserPlus as BuyIcon, Eye, Search, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Player = {
  id: number;
  name: string;
  nationality?: string;
  experience?: number;
  position: string;
  age: number;
  height: number;
  overall: number;
  shooting_3pt: number;
  shooting_2pt: number;
  defense: number;
  passing: number;
  rebounding: number;
  speed: number;
  dribbling: number;
  stamina: number;
  price?: number;
};

type Team = {
  id: string;
  name: string;
  cash: number;
};

const ALL_STATS = ['speed', 'stamina', 'shooting_3pt', 'shooting_2pt', 'dribbling', 'defense', 'rebounding', 'passing'];
const SCOUT_COST = 15000;
const FLAGS: Record<string, string> = {
  USA: '🇺🇸',
  ESP: '🇪🇸',
  ARG: '🇦🇷',
  LTU: '🇱🇹',
  SVK: '🇸🇰',
  CHN: '🇨🇳',
  FRA: '🇫🇷',
  GER: '🇩🇪'
};

const getShuffledStats = (seed: number) => {
    const stats = [...ALL_STATS];
    let m = stats.length, t, i;
    let s = seed;
    while (m) {
        const x = Math.sin(s++) * 10000;
        i = Math.floor((x - Math.floor(x)) * m--);
        t = stats[m];
        stats[m] = stats[i];
        stats[i] = t;
    }
    return stats;
}

const getInterval = (val: number, spread: number, seed: number) => {
    const x = Math.sin(seed) * 10000;
    const randomFraction = x - Math.floor(x);
    const offset = Math.floor(randomFraction * (spread + 1)); 
    const min = Math.max(1, val - spread + offset);
    const max = Math.min(99, val + spread + offset);
    return { min, max };
};

export default function TransferMarket() {
  const router = useRouter();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [freeAgents, setFreeAgents] = useState<Player[]>([]);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [positionOverallConfig, setPositionOverallConfig] = useState<PositionOverallConfig>(getDefaultPositionOverallConfig());
  
  const [talentoOjo, setTalentoOjo] = useState<number>(0); 
  const [ojeos, setOjeos] = useState<Record<number, string[]>>({}); 

  const calculateRealOverall = (player: Player, config: PositionOverallConfig = positionOverallConfig) => {
      const baseOverall = calculateWeightedOverallForBestRole(player, config);
      return applyExperienceBonus(baseOverall, player.experience);
  };

  const loadMarketData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setOwnerId(user.id);

    const [{ data: teamsData, error: teamError }, { data: mData, error: managerError }, dynamicPositionConfig] = await Promise.all([
      supabase.from('clubes').select('id, nombre, presupuesto').eq('owner_id', user.id).limit(1),
      supabase.from('managers').select('*').eq('owner_id', user.id).maybeSingle(),
      fetchPositionOverallConfig(supabase)
    ]);
    setPositionOverallConfig(dynamicPositionConfig);

    if (teamError) {
      console.error('Error cargando club en market:', teamError);
      setMessage('❌ No se pudo cargar tu club');
    }
    if (managerError) {
      console.error('Error cargando manager en market:', managerError);
    }

    const teamData = teamsData?.[0];
    
    if (teamData) {
        setMyTeam({ 
            id: teamData.id, 
            name: teamData.nombre, 
            cash: teamData.presupuesto
        });
        setMessage(null);
    } else if (!teamError) {
        setMessage('❌ No tienes club asignado');
    }
    
    if (mData) {
        setTalentoOjo(mData.talento_ojo || 0);
        setOjeos(mData.ojeos || {});
    }

    const { data: players, error: playersError } = await supabase.from('players').select('*').is('team_id', null);
    if (playersError) {
      console.error('Error cargando agentes libres:', playersError);
      setFreeAgents([]);
      return;
    }

    const visibleAgents = (players || []).filter((p) => !isSeasonDraftPoolTag(p.lineup_pos));
    if (visibleAgents.length > 0) {
      const processedAgents = visibleAgents.map(p => {
        const bestPosition = getBestRoleForPlayer(p, dynamicPositionConfig);
        const realOverall = calculateRealOverall(p, dynamicPositionConfig);
        return {
          ...p,
          position: bestPosition,
          nationality: p.nationality || 'USA',
          experience: typeof p.experience === 'number' ? p.experience : 0,
          overall: realOverall,
          price: Math.floor(Math.pow(1.13, realOverall) * 850) 
        };
      });

      processedAgents.sort((a, b) => b.overall - a.overall);
      setFreeAgents(processedAgents);
    } else {
      setFreeAgents([]);
    }
  }, [router]);

  useEffect(() => {
    loadMarketData();
  }, [loadMarketData]);

  const registerExpenseTx = async (params: {
    teamId: string;
    ownerId?: string | null;
    concept: string;
    amount: number;
  }) => {
    const monto = -Math.abs(params.amount);
    const basePayload = {
      team_id: params.teamId,
      concepto: params.concept,
      monto,
      tipo: 'GASTO'
    };

    let { error } = await supabase.from('finance_transactions').insert(basePayload);
    if (!error) return;

    const errText = `${error.message || ''} ${error.details || ''}`.toLowerCase();
    if (params.ownerId && errText.includes('owner_id')) {
      const retry = await supabase.from('finance_transactions').insert({
        ...basePayload,
        owner_id: params.ownerId
      });
      if (!retry.error) return;
      error = retry.error;
    }

    throw new Error(error.message || 'No se pudo registrar el gasto financiero.');
  };

  const errText = (error: unknown) =>
    error instanceof Error ? error.message : 'fallo inesperado';

  const buyPlayer = async (player: Player) => {
    if (!myTeam || !player.price) return;
    if (myTeam.cash < player.price) { alert("❌ Sin fondos."); return; }
    if (!confirm(`¿Fichar a ${player.name} por ${new Intl.NumberFormat('es-ES').format(player.price)} €?`)) return;

    setLoadingId(player.id);
    try {
      const newCash = myTeam.cash - player.price;
      const { error: budgetError } = await supabase.from('clubes').update({ presupuesto: newCash }).eq('id', myTeam.id);
      if (budgetError) throw budgetError;

      const { error: playerError } = await supabase
        .from('players')
        .update({ team_id: myTeam.id, lineup_pos: 'BENCH', position: player.position, overall: player.overall })
        .eq('id', player.id);
      if (playerError) {
        await supabase.from('clubes').update({ presupuesto: myTeam.cash }).eq('id', myTeam.id);
        throw playerError;
      }

      try {
        await registerExpenseTx({
          teamId: myTeam.id,
          ownerId,
          concept: `Mercado: Fichaje ${player.name}`,
          amount: player.price
        });
      } catch (txError) {
        await Promise.all([
          supabase.from('clubes').update({ presupuesto: myTeam.cash }).eq('id', myTeam.id),
          supabase.from('players').update({ team_id: null, lineup_pos: null }).eq('id', player.id)
        ]);
        throw txError;
      }

      setMyTeam({ ...myTeam, cash: newCash });
      setFreeAgents(prev => prev.filter(p => p.id !== player.id));
      setMessage(`✅ Fichaje completado: ${player.name}`);
    } catch (error) {
      console.error(error);
      setMessage(`❌ No se pudo completar el fichaje: ${errText(error)}`);
    } finally {
      setLoadingId(null);
      setTimeout(() => setMessage(null), 2000);
    }
  };

  const getMissingStats = (playerId: number) => {
      const shuffled = getShuffledStats(playerId);
      let nativelyExact = 0;
      if (talentoOjo === 1) nativelyExact = 2;
      if (talentoOjo === 2) nativelyExact = 4;
      if (talentoOjo === 3) nativelyExact = 8;

      const nativelyExactStats = shuffled.slice(0, nativelyExact);
      const scoutedStats = ojeos[playerId] || [];
      const knownStats = [...nativelyExactStats, ...scoutedStats];
      
      return ALL_STATS.filter(s => !knownStats.includes(s));
  };

  const handleScoutPlayer = async (playerId: number) => {
    if (!myTeam || !ownerId) return;
    if (myTeam.cash < SCOUT_COST) { alert("❌ Fondos insuficientes."); return; }
    
    const missing = getMissingStats(playerId);
    if (missing.length === 0) { setMessage('✅ Jugador ya totalmente ojeado'); return; }

    setLoadingId(playerId);
    try {
      const newlyScouted = [...missing].sort(() => 0.5 - Math.random()).slice(0, 2);
      const updatedPlayerOjeos = [...(ojeos[playerId] || []), ...newlyScouted];
      const newOjeosObj = { ...ojeos, [playerId]: updatedPlayerOjeos };
      
      const newCash = myTeam.cash - SCOUT_COST;

      const { error: budgetError } = await supabase.from('clubes').update({ presupuesto: newCash }).eq('id', myTeam.id);
      if (budgetError) throw budgetError;

      const { error: managerError } = await supabase.from('managers').update({ 
          ojeos: newOjeosObj,
      }).eq('owner_id', ownerId);
      if (managerError) {
        await supabase.from('clubes').update({ presupuesto: myTeam.cash }).eq('id', myTeam.id);
        throw managerError;
      }

      try {
        await registerExpenseTx({
          teamId: myTeam.id,
          ownerId,
          concept: 'Mercado: Ojeo de jugador',
          amount: SCOUT_COST
        });
      } catch (txError) {
        await Promise.all([
          supabase.from('clubes').update({ presupuesto: myTeam.cash }).eq('id', myTeam.id),
          supabase.from('managers').update({ ojeos }).eq('owner_id', ownerId)
        ]);
        throw txError;
      }

      setMyTeam({ ...myTeam, cash: newCash });
      setOjeos(newOjeosObj);
      setMessage(`🔍 Ojeo completado: +${newlyScouted.length} stats`);
    } catch (error) {
      console.error(error);
      setMessage(`❌ No se pudo completar el ojeo: ${errText(error)}`);
    } finally {
      setLoadingId(null);
      setTimeout(() => setMessage(null), 2200);
    }
  };

  const renderPlayerStat = (player: Player, statName: string) => {
      const val = player[statName as keyof Player] as number || 100;
      const isScouted = ojeos[player.id]?.includes(statName);
      
      if (isScouted) {
          return <div className="font-mono font-bold text-[10px] text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.4)] whitespace-nowrap">{val}</div>;
      }

      const shuffled = getShuffledStats(player.id);
      const statIndex = shuffled.indexOf(statName);
      const seed = player.id + statName.length;

      if (talentoOjo === 3) {
          return <div className="font-mono font-bold text-[10px] text-white whitespace-nowrap">{val}</div>;
      }
      if (talentoOjo === 2) {
          if (statIndex < 4) return <div className="font-mono font-bold text-[10px] text-white whitespace-nowrap">{val}</div>;
          if (statIndex < 7) {
              const { min, max } = getInterval(val, 4, seed);
              return <div className="font-mono font-bold text-[10px] text-orange-400 drop-shadow-[0_0_5px_rgba(251,146,60,0.4)] whitespace-nowrap">{min}-{max}</div>;
          }
      }
      if (talentoOjo === 1) {
          if (statIndex < 2) return <div className="font-mono font-bold text-[10px] text-white whitespace-nowrap">{val}</div>;
          if (statIndex < 5) {
              const { min, max } = getInterval(val, 6, seed);
              return <div className="font-mono font-bold text-[10px] text-orange-400 drop-shadow-[0_0_5px_rgba(251,146,60,0.4)] whitespace-nowrap">{min}-{max}</div>;
          }
      }
      if (talentoOjo === 0) {
          if (statIndex < 3) {
              const { min, max } = getInterval(val, 8, seed);
              return <div className="font-mono font-bold text-[10px] text-orange-400 drop-shadow-[0_0_5px_rgba(251,146,60,0.4)] whitespace-nowrap">{min}-{max}</div>;
          }
      }

      return <div className="font-mono font-bold text-[10px] text-slate-600/50 animate-pulse whitespace-nowrap">???</div>;
  };

  const getOverallDisplay = (playerId: number, trueOverall: number) => {
      const missing = getMissingStats(playerId);
      if (missing.length === 0) return trueOverall.toString(); 
      
      let spread = 6;
      if (talentoOjo === 1) spread = 4;
      if (talentoOjo === 2) spread = 2;
      if (talentoOjo === 3) spread = 1;
      
      const { min, max } = getInterval(trueOverall, spread, playerId);
      return `${min}-${max}`;
  };

  const getSalarioSemanal = (ovr: number) => {
    return getWeeklySalaryByOvr(ovr);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 relative overflow-hidden">
      
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-orange-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      
      <div className="max-w-6xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
        <div>
           <Link href="/" className="text-slate-500 hover:text-orange-400 flex items-center gap-2 mb-3 text-xs font-black tracking-widest uppercase transition-colors">
              <BackIcon size={14}/> Volver al Despacho
           </Link>
           <h1 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-white flex items-center gap-4">
             <MarketIcon className="text-orange-500" size={36}/> Mercado Abierto
           </h1>
        </div>
        
        <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 shadow-lg">
                <Eye size={14} className={talentoOjo > 0 ? "text-cyan-400 shadow-cyan-500" : "text-slate-600"}/> 
                Ojo Clínico: <span className={talentoOjo > 0 ? "text-cyan-400" : "text-slate-600"}>NIVEL {talentoOjo}</span>
            </div>
            
            {myTeam && (
                <div className="bg-slate-900/80 backdrop-blur-md border border-green-500/30 px-6 py-3 rounded-2xl flex items-center gap-4 shadow-[0_0_20px_rgba(34,197,94,0.15)]">
                    <div className="bg-green-500/10 text-green-400 p-2 rounded-xl"><CashIcon size={22} /></div>
                    <div className="text-2xl font-mono font-black text-white tracking-tight">
                        {new Intl.NumberFormat('es-ES', { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(myTeam.cash)}
                    </div>
                </div>
            )}
        </div>
      </div>
      
      {message && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-cyan-500/30 text-cyan-300 px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest shadow-2xl">
          {message}
        </div>
      )}

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10">
        {freeAgents.map(player => {
            const missingStats = getMissingStats(player.id);
            const isFullyScouted = missingStats.length === 0;
            const displayOvr = getOverallDisplay(player.id, player.overall);
            const isIntervalOvr = displayOvr.includes('-');
            
            return (
            <div key={player.id} className={`relative bg-gradient-to-b from-slate-900 to-slate-950 border rounded-3xl overflow-hidden transition-all duration-300 flex flex-col h-full group ${isFullyScouted ? 'border-green-500/50 shadow-[0_10px_30px_rgba(34,197,94,0.1)] hover:border-green-400' : 'border-white/10 shadow-xl hover:border-orange-500/50 hover:shadow-[0_10px_30px_rgba(234,88,12,0.15)] hover:-translate-y-1'}`}>
                
                <div className="p-6 flex gap-5 items-center relative z-10">
                    {isFullyScouted && <div className="absolute top-4 right-4 bg-green-500/20 border border-green-500/50 text-green-400 text-[8px] font-black px-2 py-1 rounded-md uppercase tracking-widest flex items-center gap-1"><CheckCircle2 size={10}/> Reporte Full</div>}
                    
                    <div className={`h-16 px-4 min-w-[4rem] rounded-2xl flex flex-col items-center justify-center font-black border-2 shadow-inner whitespace-nowrap tracking-tighter ${isIntervalOvr ? 'text-lg md:text-xl' : 'text-2xl'} ${isFullyScouted ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-orange-400 border-orange-500/30 bg-orange-500/10'}`}>
                        {displayOvr}
                    </div>

                    <div className="flex-1 overflow-hidden">
                        <h3 className="font-black italic text-white text-xl leading-tight truncate uppercase tracking-tight">{player.name}</h3>
                        <div className="flex gap-2 mt-2 items-center">
                            <span className="text-[10px] font-black bg-white/5 px-2 py-1 rounded-md text-slate-300 border border-white/10 tracking-widest">{player.position}</span>
                            <span className="text-[10px] font-bold text-slate-400 px-1 py-0.5 whitespace-nowrap">{player.age}A</span>
                            <span className="text-[10px] font-bold text-slate-400 px-1 py-0.5 border-l border-white/10 whitespace-nowrap">{player.height}CM</span>
                        </div>
                        <div className="flex gap-2 mt-2 items-center">
                            <span className="text-[10px] font-bold text-slate-300 bg-white/5 px-2 py-1 rounded-md border border-white/10">
                                {FLAGS[player.nationality || 'USA'] || '🏳️'} {player.nationality || 'USA'}
                            </span>
                            <span className="text-[10px] font-bold text-fuchsia-300 bg-fuchsia-500/10 px-2 py-1 rounded-md border border-fuchsia-500/30">
                                EXP {player.experience || 0}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="px-6 pb-6 flex-1 flex flex-col justify-center">
                    <div className="bg-black/40 rounded-2xl border border-white/5 p-4 grid grid-cols-4 gap-y-4 gap-x-2 text-center">
                        <div className="col-span-2 flex items-center justify-between px-2 border-b border-white/5 pb-2">
                            <div className="text-[10px] text-slate-400 uppercase font-bold">Ritmo</div>
                            {renderPlayerStat(player, 'speed')}
                        </div>
                        <div className="col-span-2 flex items-center justify-between px-2 border-b border-white/5 pb-2">
                            <div className="text-[10px] text-slate-400 uppercase font-bold">Stamina</div>
                            {renderPlayerStat(player, 'stamina')}
                        </div>

                        <div className="col-span-1 flex flex-col items-center justify-center pt-1">
                            <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">T3</div>
                            {renderPlayerStat(player, 'shooting_3pt')}
                        </div>
                        <div className="col-span-1 flex flex-col items-center justify-center pt-1">
                            <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">T2</div>
                            {renderPlayerStat(player, 'shooting_2pt')}
                        </div>
                        <div className="col-span-2 flex items-center justify-between px-2 pt-1 border-l border-white/5">
                            <div className="text-[10px] text-slate-400 uppercase font-bold">Manejo</div>
                            {renderPlayerStat(player, 'dribbling')}
                        </div>

                        <div className="col-span-1 flex flex-col items-center justify-center pt-2 border-t border-white/5">
                            <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">DEF</div>
                            {renderPlayerStat(player, 'defense')}
                        </div>
                        <div className="col-span-1 flex flex-col items-center justify-center pt-2 border-t border-white/5">
                            <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">REB</div>
                            {renderPlayerStat(player, 'rebounding')}
                        </div>
                        <div className="col-span-2 flex items-center justify-between px-2 pt-2 border-t border-l border-white/5">
                            <div className="text-[10px] text-slate-400 uppercase font-bold">Pase</div>
                            {renderPlayerStat(player, 'passing')}
                        </div>
                    </div>
                </div>

                <div className="p-5 mt-auto bg-black/40 border-t border-white/5 flex flex-col gap-4">
                    <div className="flex justify-between items-end px-1">
                        <div className="flex flex-col">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest truncate">Costo Fichaje</span>
                            <span className="text-white font-mono font-black text-lg whitespace-nowrap">
                                {new Intl.NumberFormat('es-ES', { notation: "compact", maximumFractionDigits: 1 }).format(player.price || 0)} <span className="text-orange-500">€</span>
                            </span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest truncate">Salario Semanal</span>
                            <span className="text-emerald-400 font-mono font-black text-sm whitespace-nowrap">
                                {new Intl.NumberFormat('es-ES').format(getSalarioSemanal(player.overall))} <span className="text-[10px]">€</span>
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {!isFullyScouted ? (
                            <button
                                onClick={() => handleScoutPlayer(player.id)}
                                disabled={loadingId === player.id || !myTeam || !ownerId || (myTeam?.cash || 0) < SCOUT_COST}
                                className={`py-3 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-1.5 transition-all border ${(myTeam?.cash || 0) >= SCOUT_COST ? 'border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400' : 'border-slate-800/50 text-slate-600 bg-slate-900/50 cursor-not-allowed'}`}
                                title={
                                  !myTeam
                                    ? 'No se pudo cargar tu club'
                                    : (myTeam.cash < SCOUT_COST
                                        ? `Necesitas ${new Intl.NumberFormat('es-ES').format(SCOUT_COST)} €`
                                        : 'Revelar 2 atributos al azar')
                                }
                            >
                                <Search size={14}/> -15K
                            </button>
                        ) : (
                            <div className="py-3 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-1.5 border border-green-500/20 text-green-500 bg-green-500/5">
                                <CheckCircle2 size={14} /> AL DESCUBIERTO
                            </div>
                        )}

                        <button 
                            onClick={() => buyPlayer(player)}
                            disabled={loadingId === player.id || (myTeam?.cash || 0) < (player.price || 0)}
                            className="bg-white text-slate-950 hover:bg-orange-500 hover:text-white disabled:opacity-20 disabled:hover:bg-white px-2 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-lg"
                        >
                            {loadingId === player.id ? '...' : <><BuyIcon size={14}/> FICHAR</>}
                        </button>
                    </div>
                </div>
            </div>
        )})}
      </div>
    </div>
  );
}
