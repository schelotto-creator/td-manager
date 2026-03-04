'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  applyFormModifier,
  calculateWeightedOverallForRole,
  calculateWeightedOverallForBestRole,
  fetchPositionOverallConfig,
  getBestRoleForPlayer,
  getDefaultPositionOverallConfig,
  normalizePositionRole,
  type PositionOverallConfig
} from '@/lib/position-overall-config';
import { 
  Users, Save, RefreshCw, Shirt, GripVertical, ArrowLeft, 
  Shield, Swords, Target, Clock, Calendar, Trash2, Wand2, AlertTriangle, Zap, Activity, Flame, Snowflake, Minus, TrendingUp, TrendingDown
} from 'lucide-react';
import Link from 'next/link';

// --- TIPOS ---
type Player = {
  id: number;
  name: string;
  position: string;
  lineup_pos: string;
  overall: number;
  stamina: number;
  forma: number; // NUEVO: La forma del jugador (1-100)
  shooting_3pt: number;
  defense: number;
  passing: number;
  rebounding: number;
  speed: number;
  dribbling: number;
};

type Team = {
  id: number;
  nombre: string; 
  color_primario: string; 
  players: Player[];
  tactic_offense: string;
  tactic_defense: string;
  rotations: any; 
};

const POSITIONS: Record<string, { name: string; x: string; y: string }> = {
  PG: { name: 'BASE', x: '50%', y: '85%' },
  SG: { name: 'ESCOLTA', x: '20%', y: '60%' },
  SF: { name: 'ALERO', x: '80%', y: '60%' },
  PF: { name: 'ALA-PIVOT', x: '35%', y: '30%' },
  C:  { name: 'PIVOT', x: '65%', y: '30%' },
};

const STAMINA_DRAIN_PER_Q = 18; 
const STAMINA_RECOVERY_PER_Q = 12; 

function TacticsBoardContent() {
  const searchParams = useSearchParams();
  const matchId = searchParams.get('matchId');
  const router = useRouter();

  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true); 
  const [draggingPlayerId, setDraggingPlayerId] = useState<number | null>(null);

  const [offense, setOffense] = useState('BALANCED');
  const [defense, setDefense] = useState('MAN_TO_MAN');
  const [rivalName, setRivalName] = useState<string | null>(null);

  const [activeQuarter, setActiveQuarter] = useState<'q1'|'q2'|'q3'|'q4'>('q1');
  const [currentRotation, setCurrentRotation] = useState<Record<string, number | null>>({});
  const [positionOverallConfig, setPositionOverallConfig] = useState<PositionOverallConfig>(getDefaultPositionOverallConfig());

  useEffect(() => {
    loadData();
  }, [matchId]);

  useEffect(() => {
    if (team?.rotations && team.rotations[activeQuarter]) {
        setCurrentRotation(team.rotations[activeQuarter]);
    } else {
        const emptyRot: any = {};
        Object.keys(POSITIONS).forEach(k => emptyRot[k] = null);
        setCurrentRotation(emptyRot);
    }
  }, [activeQuarter, team]);

  const loadData = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            router.push('/login');
            return;
        }

        const { data: myClub } = await supabase.from('clubes').select('*').eq('owner_id', user.id).single();
        if (!myClub) {
            router.push('/onboarding');
            return;
        }

        // Al cargar, nos aseguramos de que todos los jugadores tengan 'forma' (si no la tienen en DB, será 80)
        const [{ data: playersData }, dynamicPositionConfig] = await Promise.all([
            supabase.from('players').select('*').eq('team_id', myClub.id),
            fetchPositionOverallConfig(supabase)
        ]);
        setPositionOverallConfig(dynamicPositionConfig);
        const players = playersData?.map((p) => ({
            ...p,
            position: getBestRoleForPlayer(p, dynamicPositionConfig),
            forma: p.forma || 80,
            overall: calculateWeightedOverallForBestRole(p, dynamicPositionConfig)
        })) || [];

        let loadedOffense = myClub.tactic_offense || 'BALANCED';
        let loadedDefense = myClub.tactic_defense || 'MAN_TO_MAN';
        let loadedRotations = myClub.rotations || {};

        if (matchId) {
            const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single();
            if (match) {
                const isHome = match.home_team_id === myClub.id;
                const rivalId = isHome ? match.away_team_id : match.home_team_id;
                const { data: rival } = await supabase.from('clubes').select('nombre').eq('id', rivalId).single();
                setRivalName(rival?.nombre || 'Rival');

                const specificTactics = isHome ? match.home_tactics : match.away_tactics;
                if (specificTactics) {
                    loadedOffense = specificTactics.offense || loadedOffense;
                    loadedDefense = specificTactics.defense || loadedDefense;
                    loadedRotations = specificTactics.rotations || loadedRotations;
                }
            }
        }

        setTeam({ 
            id: myClub.id, 
            nombre: myClub.nombre, 
            color_primario: myClub.color_primario,
            players: players, 
            tactic_offense: loadedOffense,
            tactic_defense: loadedDefense,
            rotations: loadedRotations 
        });
        setOffense(loadedOffense);
        setDefense(loadedDefense);
        
        if (loadedRotations['q1']) setCurrentRotation(loadedRotations['q1']);

    } catch (e) {
        console.error("Error al cargar la pizarra:", e);
    } finally {
        setLoading(false);
    }
  };

  // --- NUEVO CÁLCULO DE MEDIA CON LA FORMA ESTILO HATTRICK ---
  const calculateRoleRating = (player: Player, slot: string) => {
      const role = normalizePositionRole(slot);
      const baseRating = calculateWeightedOverallForRole(player, role, positionOverallConfig);
      return applyFormModifier(baseRating, player.forma);
  };

  const getEstimatedStamina = (playerId: number) => {
      if (!team) return 100;
      const player = team.players.find(p => p.id === playerId);
      if (!player) return 0;

      let estimated = player.stamina; 
      const quarters = ['q1', 'q2', 'q3', 'q4'];

      for (const q of quarters) {
          if (q === activeQuarter) break; 
          const playedInQ = team.rotations[q] && Object.values(team.rotations[q]).includes(playerId);
          if (playedInQ) {
              estimated = Math.max(0, estimated - STAMINA_DRAIN_PER_Q);
          } else {
              estimated = Math.min(100, estimated + STAMINA_RECOVERY_PER_Q);
          }
      }
      return estimated;
  };

  const getAssignedQuarters = (playerId: number) => {
      if (!team?.rotations) return [] as string[];
      const quarterOrder: Array<'q1'|'q2'|'q3'|'q4'> = ['q1', 'q2', 'q3', 'q4'];
      return quarterOrder
          .filter((q) => team.rotations?.[q] && Object.values(team.rotations[q]).includes(playerId))
          .map((q) => q.toUpperCase());
  };

  const handleClearQuarter = () => {
    if (!team) return;
    const emptyRotation: any = {};
    Object.keys(POSITIONS).forEach(key => emptyRotation[key] = null);
    setCurrentRotation(emptyRotation);
    const updatedRotations = { ...team.rotations, [activeQuarter]: emptyRotation };
    setTeam({ ...team, rotations: updatedRotations });
  };

  const handleAutoFill = () => {
    if (!team) return;
    const newRotation = { ...currentRotation };
    const usedIds = Object.values(newRotation).filter(id => id !== null);
    let availablePlayers = team.players
        .filter(p => !usedIds.includes(p.id))
        .filter(p => getEstimatedStamina(p.id) > 25); 

    Object.keys(POSITIONS).forEach(pos => {
        if (!newRotation[pos]) {
            // El autocompletar ahora tiene en cuenta LA FORMA porque usa calculateRoleRating
            availablePlayers.sort((a, b) => calculateRoleRating(b, pos) - calculateRoleRating(a, pos));
            const bestFit = availablePlayers[0];
            if (bestFit) {
                newRotation[pos] = bestFit.id;
                availablePlayers = availablePlayers.filter(p => p.id !== bestFit.id);
            }
        }
    });

    setCurrentRotation(newRotation);
    const updatedRotations = { ...team.rotations, [activeQuarter]: newRotation };
    setTeam({ ...team, rotations: updatedRotations });
  };

  const handleDragStart = (e: React.DragEvent, playerId: number) => {
    setDraggingPlayerId(playerId);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  
  const handleDropOnCourt = (targetPos: string) => {
    if (draggingPlayerId === null || !team) return;
    const newRotation = { ...currentRotation };

    const sourcePos =
      Object.keys(newRotation).find((pos) => newRotation[pos] === draggingPlayerId) || null;
    const targetPlayerId = newRotation[targetPos];

    if (sourcePos === targetPos) {
      setDraggingPlayerId(null);
      return;
    }

    if (sourcePos) {
      newRotation[sourcePos] =
        targetPlayerId !== null && targetPlayerId !== draggingPlayerId ? targetPlayerId : null;
    }
    newRotation[targetPos] = draggingPlayerId;
    
    setCurrentRotation(newRotation);
    const updatedRotations = { ...team.rotations, [activeQuarter]: newRotation };
    setTeam({ ...team, rotations: updatedRotations });
    setDraggingPlayerId(null);
  };

  const handleDropOnBench = () => {
    if (draggingPlayerId === null || !team) return;
    const newRotation = { ...currentRotation };
    Object.keys(newRotation).forEach(pos => { if (newRotation[pos] === draggingPlayerId) newRotation[pos] = null; });
    setCurrentRotation(newRotation);
    const updatedRotations = { ...team.rotations, [activeQuarter]: newRotation };
    setTeam({ ...team, rotations: updatedRotations });
    setDraggingPlayerId(null);
  };

  const saveAll = async () => {
    if (!team) return;
    setLoading(true);
    const tacticsPayload = { offense, defense, rotations: team.rotations };

    if (matchId) {
        const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single();
        const isHome = match.home_team_id === team.id;
        const updateData = isHome ? { home_tactics: tacticsPayload } : { away_tactics: tacticsPayload };
        await supabase.from('matches').update(updateData).eq('id', matchId);
        alert(`✅ Plan guardado contra ${rivalName}.`);
        router.push('/calendar'); 
    } else {
        await supabase.from('clubes').update({
            tactic_offense: offense,
            tactic_defense: defense,
            rotations: team.rotations 
        }).eq('id', team.id);
        
        if (team.rotations['q1']) {
            await supabase.from('players').update({ lineup_pos: 'BENCH' }).eq('team_id', team.id);
            for (const [pos, playerId] of Object.entries(team.rotations['q1'])) {
                if (playerId) await supabase.from('players').update({ lineup_pos: pos }).eq('id', playerId as number);
            }
        }
        alert('✅ Pizarra Estándar actualizada.');
    }
    setLoading(false);
  };

  const getOverallColor = (ovr: number) => {
    if (ovr >= 90) return 'bg-yellow-500 text-black border-yellow-300';
    if (ovr >= 80) return 'bg-green-500 text-white border-green-400';
    if (ovr >= 70) return 'bg-blue-500 text-white border-blue-400';
    if (ovr >= 60) return 'bg-orange-500 text-white border-orange-400';
    return 'bg-red-600 text-white border-red-500';
  };

  const getFormLabel = (forma: number) => {
    if (forma >= 95) return `On Fire: ${forma}`;
    if (forma >= 85) return `Excelente: ${forma}`;
    if (forma <= 50) return `Crisis: ${forma}`;
    if (forma <= 65) return `Mala Racha: ${forma}`;
    return `Normal: ${forma}`;
  };

  // NUEVO SISTEMA VISUAL DE FORMA (5 NIVELES)
  const renderFormIcon = (forma: number) => {
    if (forma >= 95) return <Flame size={14} className="text-orange-500 animate-pulse" />;
    if (forma >= 85) return <TrendingUp size={14} className="text-green-400" />;
    if (forma <= 50) return <Snowflake size={14} className="text-blue-400" />;
    if (forma <= 65) return <TrendingDown size={14} className="text-yellow-500" />;
    return <Minus size={14} className="text-slate-500" />;
  };

  if (loading) {
      return (
          <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
            <Activity className="text-cyan-500 animate-pulse w-12 h-12 mb-4" />
            <p className="text-slate-500 font-mono text-xs uppercase tracking-widest">Cargando Pizarra...</p>
          </div>
      );
  }
  
  if (!team) return <div className="text-white p-10 text-center">Error al cargar el equipo.</div>;

  const playersOnCourtIds = Object.values(currentRotation).filter(id => id !== null);
  // Ordenar el banquillo primero por Media Efectiva (incluyendo forma)
  const bench = team.players.filter(p => !playersOnCourtIds.includes(p.id))
      .sort((a,b) => calculateRoleRating(b, b.position) - calculateRoleRating(a, a.position));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 flex flex-col items-center relative overflow-hidden">
      
      {/* Luz ambiental */}
      <div 
        className="absolute top-[-10%] right-[-5%] w-96 h-96 rounded-full blur-[120px] pointer-events-none opacity-10"
        style={{ backgroundColor: team.color_primario || '#ea580c' }}
      ></div>

      {/* CABECERA */}
      <div className="w-full max-w-6xl flex flex-col md:flex-row justify-between items-center mb-6 gap-4 relative z-10">
        <div>
           {matchId ? (
               <Link href="/calendar" className="text-blue-400 hover:text-white flex items-center gap-2 mb-2 text-sm font-bold w-fit">
                  <ArrowLeft size={16}/> VOLVER AL CALENDARIO
               </Link>
           ) : (
               <Link href="/" className="text-slate-500 hover:text-white flex items-center gap-2 mb-2 text-sm font-bold w-fit">
                  <ArrowLeft size={16}/> VOLVER AL DESPACHO
               </Link>
           )}
           
           <h1 className="text-3xl font-black italic uppercase tracking-tighter text-white flex items-center gap-3" style={{ color: team.color_primario }}>
             {matchId ? <Calendar /> : <Users />}
             {matchId ? `PREPARANDO VS ${rivalName?.toUpperCase()}` : 'PIZARRA ESTÁNDAR'}
           </h1>
        </div>
        <button onClick={saveAll} disabled={loading} className="text-white px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-xs flex items-center gap-2 shadow-[0_0_15px_rgba(234,88,12,0.3)] transition-all active:scale-95 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 border border-orange-500/50">
          {loading ? <RefreshCw className="animate-spin" size={16}/> : <Save size={16}/>}
          {matchId ? 'GUARDAR PLAN' : 'GUARDAR ESTÁNDAR'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full max-w-6xl items-start relative z-10">
        
        {/* --- IZQUIERDA: CANCHA --- */}
        <div className="lg:col-span-2 flex flex-col relative">
          
          <div className="flex justify-between items-end mb-0 z-10 px-2">
                <div className="flex gap-1">
                    {['q1', 'q2', 'q3', 'q4'].map((q) => (
                        <button key={q} onClick={() => setActiveQuarter(q as any)} className={`px-4 py-2 rounded-t-lg font-black text-xs uppercase tracking-widest flex items-center gap-2 border-t border-x border-white/10 transition-colors ${activeQuarter === q ? 'bg-slate-900 text-cyan-400 border-b-0 translate-y-px' : 'bg-slate-950 text-slate-500 hover:text-white border-b border-white/10'}`}>
                            <Clock size={12} /> {q}
                        </button>
                    ))}
                </div>
                <div className="flex gap-2 mb-2">
                    <button onClick={handleAutoFill} title="IA Auto-completar" className="bg-slate-900 hover:bg-slate-800 text-yellow-400 p-2 rounded-lg border border-white/10 transition-colors shadow-sm active:scale-95 flex items-center gap-1 text-[10px] font-bold uppercase">
                        <Wand2 size={14}/> Auto
                    </button>
                    <button onClick={handleClearQuarter} title="Limpiar cuarto" className="bg-slate-900 hover:bg-red-500/20 text-red-400 p-2 rounded-lg border border-white/10 transition-colors shadow-sm active:scale-95 flex items-center gap-1 text-[10px] font-bold uppercase">
                        <Trash2 size={14}/> Limpiar
                    </button>
                </div>
          </div>

          <div className="h-[600px] bg-slate-900 border-2 border-slate-800 rounded-xl rounded-tl-none relative shadow-2xl overflow-hidden">
            <div className="absolute inset-0 pointer-events-none opacity-10">
               <div className="absolute top-[-10%] left-[10%] right-[10%] h-[60%] border-b-4 border-x-4 border-white rounded-b-full"></div>
               <div className="absolute top-0 left-[35%] right-[35%] h-[40%] border-b-4 border-x-4 border-white bg-white/5"></div>
               <div className="absolute bottom-[-10%] left-[35%] right-[35%] h-[20%] border-4 border-white rounded-full"></div>
            </div>
            
            {Object.entries(POSITIONS).map(([key, pos]) => {
                const playerId = currentRotation[key];
                const player = team.players.find(p => p.id === playerId);
                const effectiveOverall = player ? calculateRoleRating(player, key) : 0;
                const isOutOfPosition = player && effectiveOverall < (player.overall - 5);
                const estimatedStamina = player ? getEstimatedStamina(player.id) : 100;
                const assignedQuarters = player ? getAssignedQuarters(player.id) : [];

                return (
                  <div key={key} onDragOver={handleDragOver} onDrop={() => handleDropOnCourt(key)} className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-all z-10" style={{ left: pos.x, top: pos.y }}>
                    <div 
                      className={`w-40 p-2 rounded-xl border flex items-center gap-3 shadow-xl transition-all relative group ${player ? 'bg-slate-950 border-white/20 hover:border-cyan-500 cursor-grab' : 'bg-slate-800/50 border-dashed border-white/20 hover:bg-slate-800 h-16 justify-center'}`}
                      draggable={!!player}
                      onDragStart={(e) => player && handleDragStart(e, player.id)}
                    >
                      {player ? (
                        <>
                          {/* OVR + FORMA ICON */}
                          <div className="relative">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg border-2 shadow-sm ${getOverallColor(effectiveOverall)}`}>
                                  {effectiveOverall}
                              </div>
                              <div className="absolute -bottom-2 -right-1 bg-slate-900 rounded-full p-0.5 border border-slate-700" title={getFormLabel(player.forma)}>
                                  {renderFormIcon(player.forma)}
                              </div>
                          </div>

                          <div className="flex-1 min-w-0 pl-1">
                              <div className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-0.5 flex justify-between items-center">
                                  {pos.name}
                                  {isOutOfPosition && (
                                    <span title="Fuera de posición natural">
                                      <AlertTriangle size={10} className="text-red-500 animate-pulse" />
                                    </span>
                                  )}
                              </div>
                              <div className="font-bold text-white text-sm truncate leading-tight">{player.name}</div>
                              
                              <div className="flex items-center gap-1 mt-1">
                                  <Zap size={8} className={estimatedStamina < 50 ? 'text-red-500' : 'text-yellow-400'}/>
                                  <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                                      <div className={`h-full ${estimatedStamina < 50 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${estimatedStamina}%` }}></div>
                                  </div>
                                  <span className="text-[9px] font-mono text-slate-400">{estimatedStamina}%</span>
                              </div>
                              <div className="mt-1 text-[8px] text-slate-500 font-bold uppercase tracking-wide truncate">
                                  Q: {assignedQuarters.length > 0 ? assignedQuarters.join(' · ') : '-'}
                              </div>
                          </div>
                          <GripVertical size={14} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-slate-500"/>
                        </>
                      ) : (
                        <div className="text-center">
                          <div className="text-slate-500 text-xs font-black uppercase tracking-widest">{pos.name}</div>
                          <div className="text-[9px] text-slate-600 uppercase mt-1">Arrastra Jugador</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
            })}
          </div>
        </div>

        {/* --- DERECHA: PLAN Y DISPONIBLES --- */}
        <div className="flex flex-col gap-4 h-[640px] w-full">
            
            {/* TÁCTICAS GLOBALES */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4 shadow-lg">
                <h3 className="font-black text-white flex items-center gap-2 text-sm uppercase tracking-widest border-b border-white/10 pb-3">
                    <Swords size={16} className="text-yellow-400"/> {matchId ? 'Plan de Partido' : 'Libro de Jugadas'}
                </h3>
                <div>
                    <label className="text-[10px] text-slate-400 font-bold mb-1.5 flex items-center gap-2"><Target size={12} className="text-cyan-400"/> ESTILO OFENSIVO</label>
                    <select value={offense} onChange={(e) => setOffense(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs font-bold text-white outline-none focus:border-cyan-500 transition-colors">
                        <option value="BALANCED">⚖️ Equilibrado (Por Defecto)</option>
                        <option value="RUN_AND_GUN">🚀 Run & Gun (Tiro Exterior)</option>
                        <option value="PAINT_FOCUS">🔨 Pintura (Poste y Rebote)</option>
                    </select>
                </div>
                <div>
                    <label className="text-[10px] text-slate-400 font-bold mb-1.5 flex items-center gap-2"><Shield size={12} className="text-orange-400"/> DEFENSA</label>
                    <select value={defense} onChange={(e) => setDefense(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs font-bold text-white outline-none focus:border-orange-500 transition-colors">
                        <option value="MAN_TO_MAN">👤 Hombre a Hombre</option>
                        <option value="ZONE_2_3">🏰 Zona 2-3 (Proteger Pintura)</option>
                        <option value="PRESSING">⚡ Presión Alta (Robos/Fatiga)</option>
                    </select>
                </div>
            </div>

            {/* BANQUILLO / DISPONIBLES */}
            <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden min-h-0 shadow-lg" onDragOver={handleDragOver} onDrop={handleDropOnBench}>
              <div className="p-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
                 <div className="flex items-center gap-2 font-black text-white text-xs uppercase tracking-widest"><Shirt size={14} className="text-slate-400"/> Banquillo ({bench.length})</div>
                 <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest border border-white/10 px-2 py-0.5 rounded-full">ENERGÍA {activeQuarter}</span>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar bg-slate-900/50">
                {bench.map(player => {
                    const estStamina = getEstimatedStamina(player.id);
                    // Muestra el rating afectado por la forma
                    const roleRating = calculateRoleRating(player, player.position);
                    const assignedQuarters = getAssignedQuarters(player.id);
                    
                    return (
                        <div 
                          key={player.id} 
                          draggable 
                          onDragStart={(e) => handleDragStart(e, player.id)} 
                          className="bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 p-2.5 rounded-xl flex items-center gap-3 cursor-grab group transition-all"
                        >
                            <div className="relative">
                                <div className={`w-8 h-8 rounded flex items-center justify-center font-black text-xs border shrink-0 ${getOverallColor(roleRating)} shadow-sm`}>
                                    {roleRating}
                                </div>
                                <div className="absolute -bottom-1 -right-1 bg-slate-900 rounded-full p-0.5">
                                    {renderFormIcon(player.forma)}
                                </div>
                            </div>

                            <div className="flex-1 min-w-0 pl-1">
                                <div className="font-bold text-sm text-slate-200 truncate group-hover:text-white transition-colors">
                                  {player.name} <span className="text-[9px] font-normal text-slate-500 ml-1">F:{player.forma}</span>
                                </div>
                                <div className="flex justify-between items-center mt-1">
                                    <span className="text-[9px] bg-slate-800 text-slate-400 uppercase font-black tracking-widest px-1.5 py-0.5 rounded">{player.position}</span>
                                    <div className="flex items-center gap-1.5 min-w-[60px]">
                                        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                            <div className={`h-full ${estStamina < 50 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${estStamina}%` }}></div>
                                        </div>
                                        <span className={`text-[9px] font-mono font-bold ${estStamina < 50 ? 'text-red-400' : 'text-slate-400'}`}>{estStamina}%</span>
                                    </div>
                                </div>
                                <div className="mt-1 text-[8px] text-slate-500 font-bold uppercase tracking-wide truncate">
                                  Q: {assignedQuarters.length > 0 ? assignedQuarters.join(' · ') : '-'}
                                </div>
                            </div>
                            <GripVertical className="text-slate-700 group-hover:text-slate-400 shrink-0" size={14}/>
                        </div>
                    );
                })}
                
                {bench.length === 0 && (
                   <div className="h-full flex flex-col items-center justify-center text-slate-600 text-sm font-bold uppercase tracking-widest opacity-50 py-10">
                     <Shirt size={32} className="mb-3 opacity-50"/> 
                     Rotación Completa
                   </div>
                )}
              </div>
              <div className="p-3 bg-slate-950 border-t border-slate-800 text-center text-[9px] text-slate-500 uppercase font-bold tracking-widest">Arrastra aquí para sustituir</div>
            </div>
        </div>
      </div>
    </div>
  );
}

export default function TacticsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center"><Activity className="text-cyan-500 animate-pulse w-12 h-12 mb-4" /><p className="text-slate-500 font-mono text-xs uppercase tracking-widest">Cargando pizarra...</p></div>}>
      <TacticsBoardContent />
    </Suspense>
  );
}
