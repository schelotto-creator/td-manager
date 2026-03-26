'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getWeeklySalaryByOvr } from '@/lib/salary';
import {
  calculateTrainingCostByLeague,
  fetchEconomyRules,
  getDefaultEconomyByLevel,
  type LeagueEconomyByLevel
} from '@/lib/economy-balance';
import {
  calculateWeightedOverallForBestRole,
  fetchPositionOverallConfig,
  getBestRoleAndOverall,
  getBestRoleForPlayer,
  getDefaultPositionOverallConfig,
  type PositionOverallConfig
} from '@/lib/position-overall-config';
import { Dumbbell, HeartPulse, DollarSign, ArrowLeft, Zap, Target, Shield, Hand, Activity, CheckCircle2, Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Player = {
  id: number;
  name: string;
  position: string;
  age: number; // Necesario para el cálculo de coste
  overall: number; 
  stamina: number;
  salary: number; 
  entrenos_semanales: number;
  shooting_3pt: number;
  shooting_2pt: number;
  defense: number;
  passing: number;
  rebounding: number;
  speed: number;
  dribbling: number;
};

type Team = {
  id: string; 
  nombre: string;
  owner_id?: string | null;
  presupuesto: number;
  leagueLevel: number;
  players: Player[];
};

export default function TrainingCenter() {
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [loadingTrainId, setLoadingTrainId] = useState<number | null>(null);
  const [loadingHealId, setLoadingHealId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [economyByLevel, setEconomyByLevel] = useState<LeagueEconomyByLevel>(getDefaultEconomyByLevel());
  const [positionOverallConfig, setPositionOverallConfig] = useState<PositionOverallConfig>(getDefaultPositionOverallConfig());

  const STAMINA_COST = 25; 
  const MAX_TRAINS_PER_WEEK = 1;

  useEffect(() => {
    fetchTeamData();
  }, []);

  const registerExpenseTx = async (params: {
    teamId: string;
    ownerId?: string | null;
    concept: string;
    amount: number;
  }) => {
    const monto = -Math.abs(params.amount);
    const payloadWithDate = {
      team_id: params.teamId,
      concepto: params.concept,
      monto,
      tipo: 'GASTO',
      fecha: new Date().toISOString()
    };

    let payload: Record<string, unknown> = payloadWithDate;
    let { error } = await supabase.from('finance_transactions').insert(payload);
    if (!error) return;

    const maybeFechaError = `${error.message || ''} ${error.details || ''}`.toLowerCase();
    if (maybeFechaError.includes('fecha')) {
      payload = {
        team_id: params.teamId,
        concepto: params.concept,
        monto,
        tipo: 'GASTO'
      };
      const retryNoFecha = await supabase.from('finance_transactions').insert(payload);
      if (!retryNoFecha.error) return;
      error = retryNoFecha.error;
    }

    const ownerErr = `${error.message || ''} ${error.details || ''}`.toLowerCase();
    if (params.ownerId && ownerErr.includes('owner_id')) {
      const retry = await supabase.from('finance_transactions').insert({
        ...payload,
        owner_id: params.ownerId
      });
      if (!retry.error) return;
      error = retry.error;
    }

    throw new Error(error.message || 'No se pudo registrar el gasto financiero.');
  };

  const errText = (err: unknown) =>
    err instanceof Error ? err.message : 'fallo inesperado';

  const calculateTrainCost = (currentVal: number, age: number, leagueLevel: number) =>
    calculateTrainingCostByLeague(currentVal, age, leagueLevel, economyByLevel);

  // --- NUEVA LÓGICA DE COSTE FISIO BASADO EN EDAD ---
  const calculateHealCost = (age: number) => {
    const ageFactor = Math.max(1, age - 15);
    // Fórmula base 5000 + crecimiento exponencial por edad
    return Math.floor(5000 + (Math.pow(ageFactor, 2) * 100));
  };

  const calculateRealOverall = (player: any, config: PositionOverallConfig = positionOverallConfig) =>
    calculateWeightedOverallForBestRole(player, config);

  const fetchTeamData = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }

        const { data: myClub } = await supabase.from('clubes').select('*').eq('owner_id', user.id).single();
        if (!myClub) { router.push('/onboarding'); return; }

        const [{ data: roster }, { data: leagueData }, dynamicEconomyByLevel, dynamicPositionConfig] = await Promise.all([
          supabase.from('players').select('*').eq('team_id', myClub.id),
          myClub.league_id
            ? supabase.from('ligas').select('nivel').eq('id', myClub.league_id).maybeSingle()
            : Promise.resolve({ data: null }),
          fetchEconomyRules(supabase),
          fetchPositionOverallConfig(supabase)
        ]);
        setEconomyByLevel(dynamicEconomyByLevel);
        setPositionOverallConfig(dynamicPositionConfig);

        if (roster) {
            const processedPlayers = roster.map((p: any) => ({
                ...p,
                position: getBestRoleForPlayer(p, dynamicPositionConfig),
                overall: calculateRealOverall(p, dynamicPositionConfig)
            }));
            processedPlayers.sort((a: Player, b: Player) => b.overall - a.overall);
            setTeam({ ...myClub, leagueLevel: Number(leagueData?.nivel || 1), players: processedPlayers });
        }
    } catch (e) {
        console.error("Error al cargar gimnasio:", e);
    }
  };

  const trainStat = async (player: Player, statName: keyof Player, label: string) => {
    if (!team) return;

    const currentValue = player[statName] as number;
    const cost = calculateTrainCost(currentValue, player.age, team.leagueLevel);

    if (player.entrenos_semanales >= MAX_TRAINS_PER_WEEK) { setMessage("❌ Slot semanal ya utilizado."); return; }
    if (currentValue >= 99) { setMessage(`🔥 ${label} al máximo.`); return; }
    if (player.stamina < STAMINA_COST) { setMessage("❌ Agotado. Necesita Fisio."); return; }
    if (team.presupuesto < cost) { setMessage("❌ Sin fondos."); return; }

    setLoadingTrainId(player.id);

    const newValue = currentValue + 1;
    const newStamina = player.stamina - STAMINA_COST;
    const newEntrenos = player.entrenos_semanales + 1;
    const newCash = team.presupuesto - cost;

    const tempPlayer = { ...player, [statName]: newValue };
    const bestProfile = getBestRoleAndOverall(tempPlayer, positionOverallConfig);
    const newOverall = bestProfile.overall;
    const newPosition = bestProfile.role;
    const newSalary = getWeeklySalaryByOvr(newOverall);

    try {
        const { error: playerUpdateError } = await supabase.from('players').update({ 
            [statName]: newValue,
            stamina: newStamina,
            position: newPosition,
            overall: newOverall,
            salary: newSalary,
            entrenos_semanales: newEntrenos
        }).eq('id', player.id);
        if (playerUpdateError) throw playerUpdateError;

        const { error: budgetUpdateError } = await supabase.from('clubes').update({ presupuesto: newCash }).eq('id', team.id);
        if (budgetUpdateError) throw budgetUpdateError;

        try {
          await registerExpenseTx({
            teamId: team.id,
            ownerId: team.owner_id,
            concept: `Entrenamiento: ${player.name} (+1 ${label})`,
            amount: cost
          });
        } catch (txError) {
          await Promise.all([
            supabase.from('players').update({
              [statName]: currentValue,
              stamina: player.stamina,
              position: player.position,
              overall: player.overall,
              salary: player.salary,
              entrenos_semanales: player.entrenos_semanales
            }).eq('id', player.id),
            supabase.from('clubes').update({ presupuesto: team.presupuesto }).eq('id', team.id)
          ]);
          throw txError;
        }

        const updatedPlayers = team.players.map(p => 
            p.id === player.id
              ? {
                  ...p,
                  [statName]: newValue,
                  stamina: newStamina,
                  position: newPosition,
                  overall: newOverall,
                  salary: newSalary,
                  entrenos_semanales: newEntrenos
                }
              : p
        );
        setTeam({ ...team, presupuesto: newCash, players: updatedPlayers });
        
        setMessage(`✅ ${player.name}: +1 ${label}`);
    } catch (err: unknown) {
        setMessage(`❌ Error en la transacción: ${errText(err)}`);
    } finally {
        setTimeout(() => setMessage(null), 1500);
        setLoadingTrainId(null);
    }
  };

  const healPlayer = async (player: Player) => {
    const cost = calculateHealCost(player.age);
    if (!team) return;
    if (team.presupuesto < cost) { setMessage("❌ Sin dinero para el fisio."); return; }
    
    setLoadingHealId(player.id);
    const newCash = team.presupuesto - cost;

    try {
        const { error: playerHealError } = await supabase.from('players').update({ stamina: 100 }).eq('id', player.id);
        if (playerHealError) throw playerHealError;

        const { error: budgetUpdateError } = await supabase.from('clubes').update({ presupuesto: newCash }).eq('id', team.id);
        if (budgetUpdateError) throw budgetUpdateError;

        try {
          await registerExpenseTx({
            teamId: team.id,
            ownerId: team.owner_id,
            concept: `Fisio: ${player.name} (Recuperación)`,
            amount: cost
          });
        } catch (txError) {
          await Promise.all([
            supabase.from('players').update({ stamina: player.stamina }).eq('id', player.id),
            supabase.from('clubes').update({ presupuesto: team.presupuesto }).eq('id', team.id)
          ]);
          throw txError;
        }

        const updatedPlayers = team.players.map(p => p.id === player.id ? { ...p, stamina: 100 } : p);
        setTeam({ ...team, presupuesto: newCash, players: updatedPlayers });
        
        setMessage(`💊 ${player.name} recuperado.`);
    } catch (err: unknown) {
        setMessage(`❌ Error al acceder al fisio: ${errText(err)}`);
    } finally {
        setTimeout(() => setMessage(null), 1500);
        setLoadingHealId(null);
    }
  };

  if (!team) return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <Dumbbell className="text-purple-500 animate-pulse w-12 h-12 mb-4" />
        <p className="text-slate-500 font-mono text-xs uppercase tracking-widest">Abriendo Instalaciones...</p>
      </div>
  );

  return (
    <div className="min-h-screen bg-background text-slate-100 p-4 md:p-8 relative overflow-hidden">
      
      <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-6xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-center gap-4 relative z-10">
        <div>
           <Link href="/" className="text-slate-500 hover:text-white flex items-center gap-2 mb-2 text-sm font-bold">
              <ArrowLeft size={16}/> VOLVER
           </Link>
           <h1 className="text-3xl font-display font-bold text-white tracking-tighter flex items-center gap-3">
             <Dumbbell size={32} className="text-purple-400"/> CENTRO DE ALTO RENDIMIENTO
           </h1>
           <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">El coste escala según Nivel de Atributo y Edad</p>
           <p className="mt-2 text-xs text-amber-300/90 font-semibold">
             Nota: cada jugador solo puede hacer 1 entrenamiento por semana. El fisio no consume ese límite.
           </p>
        </div>

        {message && (
             <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-primary text-white px-6 py-2 rounded-full font-bold shadow-2xl border border-white/20 animate-in fade-in slide-in-from-top-2">
                {message}
             </div>
        )}

        <div className="bg-purple-900/30 border border-purple-500/30 px-6 py-3 rounded-xl flex items-center gap-3 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
            <DollarSign className="text-purple-400" size={20} />
            <div className="text-2xl font-mono font-bold text-white">
                {new Intl.NumberFormat('es-ES').format(team.presupuesto)} €
            </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
        {team.players.map((player) => {
            const hasTrained = player.entrenos_semanales >= MAX_TRAINS_PER_WEEK;
            const healCost = calculateHealCost(player.age);
            
            return (
              <div key={player.id} className={`bg-slate-900 border ${hasTrained ? 'border-green-500/30 bg-slate-900/50' : 'border-slate-800'} rounded-2xl p-5 flex flex-col sm:flex-row gap-6 relative overflow-hidden shadow-lg transition-all group`}>
                
                {hasTrained && (
                  <div className="absolute top-0 right-0 p-2 bg-green-500/20 text-green-400 rounded-bl-xl border-l border-b border-green-500/30 z-20">
                    <CheckCircle2 size={16} />
                  </div>
                )}

                <div className="flex flex-col items-center sm:items-start min-w-[140px]">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold mb-2 border-4 bg-slate-950 
                        ${player.overall >= 80 ? 'border-green-400 text-green-400' : 'border-slate-600 text-slate-300'}`}>
                        {player.overall}
                    </div>
                    <h3 className="font-bold text-white text-center sm:text-left leading-tight truncate w-full group-hover:text-purple-400 transition-colors">{player.name}</h3>
                    <div className="flex gap-2 mt-1 mb-4">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-950 px-2 py-0.5 rounded">{player.position}</span>
                        <span className="text-[9px] font-black uppercase bg-purple-500/10 px-2 py-0.5 rounded text-purple-400 border border-purple-500/20">{player.age} AÑOS</span>
                    </div>
                    
                    <div className="w-full bg-slate-950 rounded-full h-2 mt-auto relative overflow-hidden">
                        <div className={`h-full transition-all ${player.stamina < 50 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${player.stamina}%` }}></div>
                    </div>
                    <div className="flex justify-between w-full text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-widest">
                        <span className="flex items-center gap-1"><HeartPulse size={10} className={player.stamina < 50 ? 'text-red-500 animate-pulse' : ''}/> {player.stamina}%</span>
                        <button 
                            onClick={() => healPlayer(player)} 
                            disabled={loadingHealId === player.id || player.stamina === 100}
                            className="text-red-400 hover:text-white underline decoration-dashed disabled:opacity-30 transition-colors"
                        >
                            FISIO (-{new Intl.NumberFormat('es-ES', { notation: "compact" }).format(healCost)}€)
                        </button>
                    </div>
                    <p className="w-full mt-1 text-[9px] text-slate-500 font-semibold">
                      El fisio no cuenta como entreno semanal.
                    </p>
                </div>

                <div className={`flex-1 grid grid-cols-2 gap-2 relative ${hasTrained ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                    {['shooting_3pt', 'shooting_2pt', 'defense', 'rebounding', 'passing', 'dribbling'].map((stat) => {
                      const currentVal = player[stat as keyof Player] as number;
                      const cost = calculateTrainCost(currentVal, player.age, team.leagueLevel);
                      const labels: any = { shooting_3pt: 'Triple', shooting_2pt: 'Tiro 2', defense: 'Defensa', rebounding: 'Rebote', passing: 'Pase', dribbling: 'Manejo' };
                      
                      return (
                        <button 
                          key={stat}
                          onClick={() => trainStat(player, stat as keyof Player, labels[stat])} 
                          disabled={loadingTrainId === player.id} 
                          className="bg-slate-950 hover:bg-slate-800 border border-slate-800 p-2 rounded-xl flex items-center gap-2 group/btn active:scale-95 transition-transform"
                        >
                            {stat.includes('shooting') && <Target size={14} className="text-blue-400 shrink-0"/>}
                            {stat === 'defense' && <Shield size={14} className="text-red-400 shrink-0"/>}
                            {stat === 'rebounding' && <Activity size={14} className="text-red-400 shrink-0"/>}
                            {(stat === 'passing' || stat === 'dribbling') && <Hand size={14} className="text-yellow-400 shrink-0"/>}
                            <div className="text-left w-full flex justify-between items-center">
                                <div>
                                    <div className="text-[9px] text-slate-500 uppercase font-bold">{labels[stat]}</div>
                                    <div className="text-sm font-bold text-slate-300">{currentVal}</div>
                                </div>
                                <div className="text-[8px] text-emerald-400 font-bold opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap">
                                  -{new Intl.NumberFormat('es-ES', { notation: "compact" }).format(cost)}€
                                </div>
                            </div>
                        </button>
                      );
                    })}

                    <button 
                        onClick={() => trainStat(player, 'speed', 'Velocidad')}
                        disabled={loadingTrainId === player.id}
                        className="col-span-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 p-2 rounded-xl flex items-center justify-between group/btn active:scale-95 transition-transform"
                    >
                        <div className="flex items-center gap-2">
                            <Zap size={14} className="text-purple-400"/>
                            <div className="text-left">
                                <div className="text-[9px] text-slate-500 uppercase font-bold">Físico (Velocidad)</div>
                                <div className="text-sm font-bold text-slate-300">{player.speed}</div>
                            </div>
                        </div>
                        <div className="text-[10px] font-mono font-bold bg-white/5 px-2 py-1 rounded text-slate-400 opacity-0 group-hover/btn:opacity-100 transition-opacity">
                            -{new Intl.NumberFormat('es-ES', { notation: "compact" }).format(calculateTrainCost(player.speed, player.age, team.leagueLevel))} €
                        </div>
                    </button>
                </div>

                {hasTrained && (
                  <div className="absolute right-4 bottom-4 z-10 pointer-events-none">
                      <div className="bg-slate-950 border border-green-500/50 px-4 py-1.5 rounded-full flex items-center gap-2 shadow-2xl">
                          <Lock size={12} className="text-green-500"/>
                          <span className="text-[10px] font-black uppercase text-green-500 tracking-widest">Entreno semanal hecho</span>
                      </div>
                  </div>
                )}
              </div>
            );
        })}
      </div>
    </div>
  );
}
