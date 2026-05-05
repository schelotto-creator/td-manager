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
  getBestRoleForPlayer,
  getDefaultPositionOverallConfig,
  type PositionOverallConfig
} from '@/lib/position-overall-config';
import {
  TRAINABLE_ATTRIBUTES,
  TRAINABLE_ATTRIBUTE_LABELS,
  type TrainableAttribute
} from '@/lib/player-training';
import { Dumbbell, HeartPulse, DollarSign, ArrowLeft, CheckCircle2, Calendar, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Player = {
  id: number;
  name: string;
  position: string;
  age: number;
  overall: number;
  stamina: number;
  salary: number;
  entrenos_semanales: number;
  training_focus: string | null;
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

const STAMINA_COST = 20;
const MAX_TRAINS_PER_WEEK = 1;

export default function TrainingCenter() {
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [loadingFocusId, setLoadingFocusId] = useState<number | null>(null);
  const [loadingHealId, setLoadingHealId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [economyByLevel, setEconomyByLevel] = useState<LeagueEconomyByLevel>(getDefaultEconomyByLevel());
  const [positionOverallConfig, setPositionOverallConfig] = useState<PositionOverallConfig>(getDefaultPositionOverallConfig());
  const [selectedFocus, setSelectedFocus] = useState<Record<number, TrainableAttribute>>({});

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
      payload = { team_id: params.teamId, concepto: params.concept, monto, tipo: 'GASTO' };
      const retryNoFecha = await supabase.from('finance_transactions').insert(payload);
      if (!retryNoFecha.error) return;
      error = retryNoFecha.error;
    }

    const ownerErr = `${error.message || ''} ${error.details || ''}`.toLowerCase();
    if (params.ownerId && ownerErr.includes('owner_id')) {
      const retry = await supabase.from('finance_transactions').insert({ ...payload, owner_id: params.ownerId });
      if (!retry.error) return;
      error = retry.error;
    }

    throw new Error(error.message || 'No se pudo registrar el gasto financiero.');
  };

  const errText = (err: unknown) => (err instanceof Error ? err.message : 'fallo inesperado');

  const calculateTrainCost = (currentVal: number, age: number, leagueLevel: number) =>
    calculateTrainingCostByLeague(currentVal, age, leagueLevel, economyByLevel);

  const calculateHealCost = (age: number) => {
    const ageFactor = Math.max(1, age - 15);
    return Math.floor(5000 + Math.pow(ageFactor, 2) * 100);
  };

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
          overall: calculateWeightedOverallForBestRole(p, dynamicPositionConfig),
          training_focus: p.training_focus ?? null
        }));
        processedPlayers.sort((a: Player, b: Player) => b.overall - a.overall);

        const initialFocus: Record<number, TrainableAttribute> = {};
        for (const p of processedPlayers) {
          if (p.training_focus && TRAINABLE_ATTRIBUTES.includes(p.training_focus as TrainableAttribute)) {
            initialFocus[p.id] = p.training_focus as TrainableAttribute;
          }
        }
        setSelectedFocus(initialFocus);

        setTeam({ ...myClub, leagueLevel: Number(leagueData?.nivel || 1), players: processedPlayers });
      }
    } catch (e) {
      console.error('Error al cargar gimnasio:', e);
    }
  };

  const setFocus = async (player: Player, attr: TrainableAttribute) => {
    if (!team) return;

    if (player.entrenos_semanales >= MAX_TRAINS_PER_WEEK) {
      setMessage('❌ Ya se asignó un foco esta semana.');
      setTimeout(() => setMessage(null), 2000);
      return;
    }
    if (player.stamina < STAMINA_COST) {
      setMessage('❌ Agotado. Necesita Fisio.');
      setTimeout(() => setMessage(null), 2000);
      return;
    }

    const currentVal = player[attr as keyof Player] as number;
    const cost = calculateTrainCost(currentVal, player.age, team.leagueLevel);

    if (team.presupuesto < cost) {
      setMessage('❌ Sin fondos.');
      setTimeout(() => setMessage(null), 2000);
      return;
    }

    setLoadingFocusId(player.id);

    const newStamina = player.stamina - STAMINA_COST;
    const newEntrenos = player.entrenos_semanales + 1;
    const newCash = team.presupuesto - cost;

    try {
      const { error: playerUpdateError } = await supabase
        .from('players')
        .update({ training_focus: attr, stamina: newStamina, entrenos_semanales: newEntrenos })
        .eq('id', player.id);
      if (playerUpdateError) throw playerUpdateError;

      const { error: budgetError } = await supabase
        .from('clubes')
        .update({ presupuesto: newCash })
        .eq('id', team.id);
      if (budgetError) throw budgetError;

      try {
        await registerExpenseTx({
          teamId: team.id,
          ownerId: team.owner_id,
          concept: `Gimnasio: ${player.name} (Foco: ${TRAINABLE_ATTRIBUTE_LABELS[attr]})`,
          amount: cost
        });
      } catch (txError) {
        await Promise.all([
          supabase.from('players').update({ training_focus: player.training_focus, stamina: player.stamina, entrenos_semanales: player.entrenos_semanales }).eq('id', player.id),
          supabase.from('clubes').update({ presupuesto: team.presupuesto }).eq('id', team.id)
        ]);
        throw txError;
      }

      setSelectedFocus((prev) => ({ ...prev, [player.id]: attr }));
      setTeam({
        ...team,
        presupuesto: newCash,
        players: team.players.map((p) =>
          p.id === player.id
            ? { ...p, training_focus: attr, stamina: newStamina, entrenos_semanales: newEntrenos }
            : p
        )
      });

      setMessage(`✅ ${player.name}: foco en ${TRAINABLE_ATTRIBUTE_LABELS[attr]}. Mejora el viernes.`);
    } catch (err: unknown) {
      setMessage(`❌ Error: ${errText(err)}`);
    } finally {
      setTimeout(() => setMessage(null), 2500);
      setLoadingFocusId(null);
    }
  };

  const healPlayer = async (player: Player) => {
    const cost = calculateHealCost(player.age);
    if (!team) return;
    if (team.presupuesto < cost) { setMessage('❌ Sin dinero para el fisio.'); return; }

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

      const updatedPlayers = team.players.map((p) => (p.id === player.id ? { ...p, stamina: 100 } : p));
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

      <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-center gap-4 relative z-10">
        <div>
          <Link href="/" className="text-slate-500 hover:text-white flex items-center gap-2 mb-2 text-sm font-bold">
            <ArrowLeft size={16} /> VOLVER
          </Link>
          <h1 className="text-3xl font-display font-bold text-white tracking-tighter flex items-center gap-3">
            <Dumbbell size={32} className="text-purple-400" /> CENTRO DE ALTO RENDIMIENTO
          </h1>
          <p className="mt-2 text-xs text-amber-300/90 font-semibold flex items-center gap-1.5">
            <Calendar size={12} /> Elige el foco semanal de cada jugador. La mejora se aplica cada viernes.
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
          const hasFocused = player.entrenos_semanales >= MAX_TRAINS_PER_WEEK;
          const activeFocus = player.training_focus as TrainableAttribute | null;
          const pendingSelection = selectedFocus[player.id];
          const healCost = calculateHealCost(player.age);
          const focusAttr = activeFocus ?? pendingSelection ?? null;
          const focusCost = focusAttr
            ? calculateTrainCost(player[focusAttr as keyof Player] as number, player.age, team.leagueLevel)
            : null;

          return (
            <div
              key={player.id}
              className={`bg-slate-900 border ${hasFocused ? 'border-purple-500/30 bg-slate-900/50' : 'border-slate-800'} rounded-2xl p-5 flex flex-col sm:flex-row gap-6 relative overflow-hidden shadow-lg transition-all group`}
            >
              {hasFocused && (
                <div className="absolute top-0 right-0 p-2 bg-purple-500/20 text-purple-400 rounded-bl-xl border-l border-b border-purple-500/30 z-20">
                  <CheckCircle2 size={16} />
                </div>
              )}

              {/* Left column */}
              <div className="flex flex-col items-center sm:items-start min-w-[140px]">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold mb-2 border-4 bg-slate-950 ${player.overall >= 80 ? 'border-green-400 text-green-400' : 'border-slate-600 text-slate-300'}`}>
                  {player.overall}
                </div>
                <h3 className="font-bold text-white text-center sm:text-left leading-tight truncate w-full group-hover:text-purple-400 transition-colors">{player.name}</h3>
                <div className="flex gap-2 mt-1 mb-4">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-950 px-2 py-0.5 rounded">{player.position}</span>
                  <span className="text-[9px] font-black uppercase bg-purple-500/10 px-2 py-0.5 rounded text-purple-400 border border-purple-500/20">{player.age} AÑOS</span>
                </div>

                <div className="w-full bg-slate-950 rounded-full h-2 mt-auto relative overflow-hidden">
                  <div className={`h-full transition-all ${player.stamina < 50 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${player.stamina}%` }} />
                </div>
                <div className="flex justify-between w-full text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-widest">
                  <span className="flex items-center gap-1">
                    <HeartPulse size={10} className={player.stamina < 50 ? 'text-red-500 animate-pulse' : ''} /> {player.stamina}%
                  </span>
                  <button
                    onClick={() => healPlayer(player)}
                    disabled={loadingHealId === player.id || player.stamina === 100}
                    className="text-red-400 hover:text-white underline decoration-dashed disabled:opacity-30 transition-colors"
                  >
                    FISIO (-{new Intl.NumberFormat('es-ES', { notation: 'compact' }).format(healCost)}€)
                  </button>
                </div>
                <p className="w-full mt-1 text-[9px] text-slate-500 font-semibold">
                  El fisio no cuenta como foco semanal.
                </p>
              </div>

              {/* Right column — focus selector */}
              <div className="flex-1 flex flex-col gap-3 justify-center">
                {hasFocused ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 py-4">
                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl px-6 py-4 text-center w-full">
                      <div className="text-[9px] uppercase tracking-widest text-purple-400 font-black mb-1">Foco semanal</div>
                      <div className="text-xl font-bold text-white">{TRAINABLE_ATTRIBUTE_LABELS[activeFocus!]}</div>
                      <div className="flex items-center justify-center gap-1 mt-2 text-[10px] text-slate-400">
                        <Calendar size={10} /> Mejora aplicada el viernes
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-[9px] uppercase font-black tracking-widest text-slate-500 mb-1">
                      Selecciona el atributo a entrenar esta semana
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {TRAINABLE_ATTRIBUTES.map((attr) => {
                        const val = player[attr as keyof Player] as number;
                        const isSelected = pendingSelection === attr;
                        const attrCost = calculateTrainCost(val, player.age, team.leagueLevel);
                        return (
                          <button
                            key={attr}
                            onClick={() => setSelectedFocus((prev) => ({ ...prev, [player.id]: attr }))}
                            className={`rounded-xl p-2.5 border text-left transition-all ${isSelected ? 'bg-purple-500/20 border-purple-500/60 text-purple-300' : 'bg-slate-950 border-slate-800 hover:border-slate-600 text-slate-400'}`}
                          >
                            <div className="text-[9px] uppercase font-black tracking-widest mb-0.5">{TRAINABLE_ATTRIBUTE_LABELS[attr]}</div>
                            <div className="flex justify-between items-end">
                              <span className="text-sm font-bold text-white">{val}</span>
                              <span className="text-[8px] text-slate-500">-{new Intl.NumberFormat('es-ES', { notation: 'compact' }).format(attrCost)}€</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {pendingSelection && (
                      <button
                        onClick={() => setFocus(player, pendingSelection)}
                        disabled={loadingFocusId === player.id}
                        className="mt-1 w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                      >
                        <Dumbbell size={14} />
                        {loadingFocusId === player.id
                          ? 'Guardando...'
                          : `Entrenar ${TRAINABLE_ATTRIBUTE_LABELS[pendingSelection]} (−${new Intl.NumberFormat('es-ES', { notation: 'compact' }).format(focusCost ?? 0)}€)`}
                      </button>
                    )}

                    {!pendingSelection && (
                      <div className="text-center text-[10px] text-slate-600 font-semibold pt-1">
                        Sin foco asignado esta semana
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
