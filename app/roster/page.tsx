'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getWeeklySalaryByOvr } from '@/lib/salary';
import {
  applyExperienceBonus,
  calculateWeightedOverallForBestRole,
  fetchPositionOverallConfig,
  getBestRoleForPlayer,
  getDefaultPositionOverallConfig,
  type PositionOverallConfig
} from '@/lib/position-overall-config';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Users, ChevronLeft, Search, X, 
  Target, Shield, Zap, Hand, Activity, DollarSign, Brain, UserMinus, HandCoins
} from 'lucide-react';

// --- TIPOS ---
type Player = {
  id: number;
  name: string;
  nationality: string;
  position: string;
  lineup_pos?: string | null;
  age: number;
  height: number;
  overall: number; 
  efficiency: number; 
  // Atributos
  shooting_3pt: number;
  shooting_2pt: number;
  defense: number;
  passing: number;
  rebounding: number;
  speed: number;
  dribbling: number;
  stamina: number;
  experience: number;
  // Stats de Temporada
  seasonStats?: {
      ppg: number;
      rpg: number;
      apg: number;
      games_played: number;
      efficiency: number;
  };
};

const FLAGS: Record<string, string> = {
  'USA': '🇺🇸', 'ESP': '🇪🇸', 'ARG': '🇦🇷', 'LTU': '🇱🇹', 
  'SVK': '🇸🇰', 'CHN': '🇨🇳', 'FRA': '🇫🇷', 'GER': '🇩🇪'
};

export default function TeamManagement() {
  const router = useRouter();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamCash, setTeamCash] = useState<number | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [releasingId, setReleasingId] = useState<number | null>(null);
  const [sellingId, setSellingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(true);
  const [positionOverallConfig, setPositionOverallConfig] = useState<PositionOverallConfig>(getDefaultPositionOverallConfig());
  
  // Filtros y Ordenación
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [sortConfig, setSortConfig] = useState<{key: keyof Player, direction: 'asc' | 'desc'}>({ key: 'efficiency', direction: 'desc' });

  // Pestañas del Modal
  const [activeTab, setActiveTab] = useState<'attributes' | 'stats'>('attributes');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterAndSortPlayers();
  }, [players, searchTerm, positionFilter, sortConfig]);

  const loadData = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }
        setOwnerId(user.id);

        const { data: myTeam } = await supabase.from('clubes').select('id, league_id, presupuesto').eq('owner_id', user.id).single();
        if (!myTeam) { router.push('/onboarding'); return; }
        setTeamId(myTeam.id);
        setTeamCash(myTeam.presupuesto || 0);

        const [rosterRes, dynamicPositionConfig] = await Promise.all([
          supabase.from('players').select('*').eq('team_id', myTeam.id),
          fetchPositionOverallConfig(supabase)
        ]);
        const roster = rosterRes.data;
        setPositionOverallConfig(dynamicPositionConfig);
        
        let stats = [];
        try {
            const { data, error } = await supabase.from('view_player_season_stats').select('*').eq('team_id', myTeam.id);
            if (!error && data) stats = data;
        } catch (err) { console.warn("Vista de stats no disponible."); }

        if (roster) {
            const enriched = roster.map(p => {
                const pStats = stats?.find((s: any) => s.id === p.id);
                const bestPosition = getBestRoleForPlayer(p, dynamicPositionConfig);
                return {
                    ...p,
                    position: bestPosition,
                    nationality: p.nationality || 'USA', 
                    experience: p.experience || 0, 
                    overall: calculateRealOverall(p, dynamicPositionConfig),
                    efficiency: pStats ? (pStats.efficiency || 0) : 0,
                    seasonStats: pStats ? {
                        ppg: pStats.ppg || 0,
                        rpg: pStats.rpg || 0,
                        apg: pStats.apg || 0,
                        games_played: pStats.games_played || 0,
                        efficiency: pStats.efficiency || 0
                    } : { ppg: 0, rpg: 0, apg: 0, games_played: 0, efficiency: 0 }
                };
            });
            setPlayers(enriched);
        }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const calculateRealOverall = (player: any, config: PositionOverallConfig = positionOverallConfig) => {
      const baseOverall = calculateWeightedOverallForBestRole(player, config);
      return applyExperienceBonus(baseOverall, player.experience);
  };

  const filterAndSortPlayers = () => {
      let temp = [...players];
      if (searchTerm) temp = temp.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
      if (positionFilter !== 'ALL') temp = temp.filter(p => p.position === positionFilter);

      temp.sort((a, b) => {
          // @ts-ignore
          if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
          // @ts-ignore
          if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
      });
      setFilteredPlayers(temp);
  };

  const handleSort = (key: keyof Player) => {
      setSortConfig(prev => ({
          key,
          direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
      }));
  };

  const getSalarioSemanal = (ovr: number) => {
    return getWeeklySalaryByOvr(ovr);
  };

  const getMarketValue = (ovr: number) => Math.floor(Math.pow(1.13, ovr) * 850);
  const DIRECT_SALE_FACTOR = 0.8;
  const getDirectSaleValue = (ovr: number) => Math.floor(getMarketValue(ovr) * DIRECT_SALE_FACTOR);

  const registerIncomeTx = async (params: {
    teamId: string;
    ownerId?: string | null;
    concept: string;
    amount: number;
  }) => {
    const monto = Math.abs(params.amount);
    const basePayload = {
      team_id: params.teamId,
      concepto: params.concept,
      monto,
      tipo: 'INGRESO',
      fecha: new Date().toISOString()
    };

    let { error } = await supabase.from('finance_transactions').insert(basePayload);
    if (!error) return;

    const maybeFechaError = `${error.message || ''} ${error.details || ''}`.toLowerCase();
    if (maybeFechaError.includes('fecha')) {
      const retryNoFecha = await supabase.from('finance_transactions').insert({
        team_id: params.teamId,
        concepto: params.concept,
        monto,
        tipo: 'INGRESO'
      });
      if (!retryNoFecha.error) return;
      error = retryNoFecha.error;
    }

    const errorText = `${error.message || ''} ${error.details || ''}`.toLowerCase();
    if (params.ownerId && errorText.includes('owner_id')) {
      const retry = await supabase.from('finance_transactions').insert({
        team_id: params.teamId,
        concepto: params.concept,
        monto,
        tipo: 'INGRESO',
        fecha: new Date().toISOString(),
        owner_id: params.ownerId
      });
      if (!retry.error) return;
      error = retry.error;
    }

    throw new Error(error.message || 'No se pudo registrar el ingreso financiero.');
  };

  const releasePlayer = async (player: Player) => {
    if (!teamId) return;
    if (sellingId !== null) return;
    if (players.length <= 5) {
      setMessage({ text: '❌ Debes mantener al menos 5 jugadores.', tone: 'error' });
      setTimeout(() => setMessage(null), 2000);
      return;
    }

    if (!confirm(`¿Seguro que quieres echar a ${player.name}? Pasará al Mercado como agente libre.`)) return;

    setReleasingId(player.id);
    try {
      const { error } = await supabase
        .from('players')
        .update({ team_id: null, lineup_pos: null })
        .eq('id', player.id)
        .eq('team_id', teamId);

      if (error) throw error;

      setPlayers(prev => prev.filter(p => p.id !== player.id));
      setSelectedPlayer(null);
      setMessage({ text: `✅ ${player.name} ha sido liberado.`, tone: 'success' });
    } catch (err) {
      console.error(err);
      setMessage({ text: '❌ No se pudo liberar al jugador.', tone: 'error' });
    } finally {
      setReleasingId(null);
      setTimeout(() => setMessage(null), 2000);
    }
  };

  const sellPlayer = async (player: Player, mode: 'market' | 'direct' = 'market') => {
    if (!teamId || teamCash === null) return;
    if (releasingId !== null) return;
    if (players.length <= 5) {
      setMessage({ text: '❌ Debes mantener al menos 5 jugadores.', tone: 'error' });
      setTimeout(() => setMessage(null), 2000);
      return;
    }

    const salePrice = mode === 'direct' ? getDirectSaleValue(player.overall) : getMarketValue(player.overall);
    const modeLabel = mode === 'direct' ? 'venta directa' : 'venta al mercado';
    if (!confirm(`¿Confirmar ${modeLabel} de ${player.name} por ${new Intl.NumberFormat('es-ES').format(salePrice)} €?\nPasará al Mercado como agente libre.`)) return;

    const previousCash = teamCash;
    const newCash = previousCash + salePrice;
    const previousLineup = player.lineup_pos || 'BENCH';

    setSellingId(player.id);
    try {
      const { error: playerError } = await supabase
        .from('players')
        .update({ team_id: null, lineup_pos: null })
        .eq('id', player.id)
        .eq('team_id', teamId);

      if (playerError) throw playerError;

      const { error: budgetError } = await supabase
        .from('clubes')
        .update({ presupuesto: newCash })
        .eq('id', teamId);

      if (budgetError) {
        await supabase.from('players').update({ team_id: teamId, lineup_pos: previousLineup }).eq('id', player.id);
        throw budgetError;
      }

      try {
        await registerIncomeTx({
          teamId,
          ownerId,
          concept: mode === 'direct' ? `Mercado: Venta directa ${player.name}` : `Mercado: Venta ${player.name}`,
          amount: salePrice
        });
      } catch (txError) {
        await Promise.all([
          supabase.from('clubes').update({ presupuesto: previousCash }).eq('id', teamId),
          supabase.from('players').update({ team_id: teamId, lineup_pos: previousLineup }).eq('id', player.id)
        ]);
        throw txError;
      }

      setTeamCash(newCash);
      setPlayers(prev => prev.filter(p => p.id !== player.id));
      setSelectedPlayer(null);
      setMessage({
        text: `✅ ${mode === 'direct' ? 'Venta directa' : 'Venta'}: ${player.name} (+${new Intl.NumberFormat('es-ES').format(salePrice)} €)`,
        tone: 'success'
      });
    } catch (err) {
      console.error(err);
      setMessage({ text: '❌ No se pudo completar la venta.', tone: 'error' });
    } finally {
      setSellingId(null);
      setTimeout(() => setMessage(null), 2500);
    }
  };

  const StatBar = ({ label, value, colorClass = 'bg-blue-500', isPurple = false }: { label: string, value: number, colorClass?: string, isPurple?: boolean }) => (
    <div className="mb-2">
        <div className="flex justify-between text-xs uppercase font-bold mb-1">
            <span className={isPurple ? 'text-purple-400' : 'text-slate-400'}>{label}</span>
            <span className={isPurple ? 'text-purple-300' : 'text-white'}>{value}</span>
        </div>
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full ${colorClass}`} style={{ width: `${value}%` }}></div>
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-slate-100 p-4 md:p-8">
      {message && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest shadow-2xl ${
          message.tone === 'success' ? 'border border-emerald-500/30 text-emerald-300' : 'border border-red-500/30 text-red-300'
        }`}>
          {message.text}
        </div>
      )}
      
      {/* HEADER */}
      <div className="max-w-6xl mx-auto mb-6 flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
            <Link href="/" className="text-slate-500 hover:text-white flex items-center gap-2 mb-2 text-sm font-bold w-fit">
                <ChevronLeft size={16}/> VOLVER
            </Link>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
                <Users className="text-primary"/> PLANTILLA PROFESIONAL
            </h1>
        </div>
        
        <div className="flex gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16}/>
                <input 
                    type="text" 
                    placeholder="Buscar jugador..." 
                    className="w-full bg-black/20 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <select 
                className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none"
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
            >
                <option value="ALL">Todas</option>
                <option value="Base">Base</option>
                <option value="Escolta">Escolta</option>
                <option value="Alero">Alero</option>
                <option value="Ala-Pívot">Ala-Pívot</option>
                <option value="Pívot">Pívot</option>
            </select>
        </div>
      </div>

      {/* TABLA INTERACTIVA */}
      <div className="max-w-6xl mx-auto bg-surface border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
            <div className="p-20 text-center text-slate-500 animate-pulse">Cargando base de datos...</div>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-400 uppercase bg-black/20 border-b border-white/5">
                        <tr>
                            <th className="px-6 py-4 cursor-pointer hover:text-white" onClick={() => handleSort('position')}>Pos</th>
                            <th className="px-6 py-4 cursor-pointer hover:text-white" onClick={() => handleSort('name')}>Nombre</th>
                            <th className="px-6 py-4 cursor-pointer hover:text-white text-center" onClick={() => handleSort('age')}>Edad</th>
                            <th className="px-6 py-4 cursor-pointer hover:text-white text-center" onClick={() => handleSort('height')}>Alt</th>
                            <th className="px-6 py-4 cursor-pointer hover:text-purple-400 text-center" onClick={() => handleSort('experience')}>EXP</th>
                            <th className="px-6 py-4 cursor-pointer hover:text-primary text-center" onClick={() => handleSort('overall')}>Media</th>
                            <th className="px-6 py-4 cursor-pointer hover:text-yellow-400 text-center" onClick={() => handleSort('efficiency')}>VAL</th>
                            <th className="px-6 py-4 text-center text-emerald-400">Salario (Sem)</th>
                            <th className="px-6 py-4 cursor-pointer hover:text-green-400 text-center" onClick={() => handleSort('stamina')}>Físico</th>
                            <th className="px-6 py-4 text-right"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {filteredPlayers.length === 0 ? (
                            <tr><td colSpan={10} className="px-6 py-12 text-center text-slate-500">No se encontraron jugadores.</td></tr>
                        ) : (
                            filteredPlayers.map((player) => (
                                <tr 
                                    key={player.id} 
                                    className="hover:bg-white/5 transition-colors group cursor-pointer"
                                    onClick={() => setSelectedPlayer(player)}
                                >
                                    <td className="px-6 py-4">
                                        <span className="font-mono font-bold text-slate-500 bg-black/30 px-2 py-1 rounded text-xs">
                                            {player.position.substring(0, 3)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-bold text-white text-base flex items-center gap-2">
                                        <span title={player.nationality}>{FLAGS[player.nationality] || '🏳️'}</span>
                                        {player.name}
                                    </td>
                                    <td className="px-6 py-4 text-center text-slate-400">{player.age}</td>
                                    <td className="px-6 py-4 text-center text-slate-400">{player.height} cm</td>
                                    <td className="px-6 py-4 text-center text-purple-400 font-bold font-mono">{player.experience}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`inline-block w-8 py-0.5 rounded text-xs font-bold ${
                                            player.overall >= 85 ? 'bg-primary/20 text-primary border border-primary/50' : 
                                            player.overall >= 70 ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 
                                            'bg-slate-700 text-slate-300'
                                        }`}>{player.overall}</span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`font-mono font-bold ${player.efficiency >= 15 ? 'text-yellow-400' : player.efficiency > 0 ? 'text-white' : 'text-slate-600'}`}>
                                            {player.efficiency > 0 ? player.efficiency.toFixed(1) : '-'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center font-mono text-emerald-400/80 font-bold">
                                        {new Intl.NumberFormat('es-ES').format(getSalarioSemanal(player.overall))}€
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden mx-auto" title={`${player.stamina}%`}>
                                            <div className={`h-full ${player.stamina > 80 ? 'bg-green-500' : 'bg-red-500'}`} style={{width: `${player.stamina}%`}}></div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">VER →</span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        )}
      </div>

      {/* MODAL DE DETALLE */}
      {selectedPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface border border-white/10 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                
                <div className="relative p-6 bg-gradient-to-r from-slate-900 to-black border-b border-white/10 shrink-0">
                    <button onClick={() => setSelectedPlayer(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors p-2"><X size={24} /></button>
                    <div className="flex items-center gap-6">
                        <div className={`w-20 h-20 rounded-xl flex items-center justify-center text-3xl font-display font-bold border-2 ${
                            selectedPlayer.overall >= 80 ? 'bg-green-500/10 border-green-500 text-green-400' : 
                            selectedPlayer.overall >= 70 ? 'bg-blue-500/10 border-blue-500 text-blue-400' : 
                            'bg-slate-700/50 border-slate-600 text-slate-400'
                        }`}>{selectedPlayer.overall}</div>
                        <div>
                            <h2 className="text-3xl font-bold text-white mb-1 flex items-center gap-2">
                                <span title={selectedPlayer.nationality}>{FLAGS[selectedPlayer.nationality] || '🏳️'}</span>
                                {selectedPlayer.name}
                            </h2>
                            <div className="flex flex-wrap gap-3 text-sm text-slate-400 items-center">
                                <span className="flex items-center gap-1"><Zap size={14} className="text-yellow-400"/> {selectedPlayer.position}</span>
                                <span>|</span>
                                <span className="flex items-center gap-1"><DollarSign size={14} className="text-emerald-400"/> {new Intl.NumberFormat('es-ES').format(getSalarioSemanal(selectedPlayer.overall))}€ /sem</span>
                                <span>|</span>
                                <span>{selectedPlayer.age} Años</span>
                                <span>|</span>
                                <span>{selectedPlayer.height} cm</span>
                                <span>|</span>
                                {/* ETIQUETA DE EXPERIENCIA AÑADIDA AQUÍ */}
                                <span className="flex items-center gap-1 text-purple-400 font-bold"><Brain size={14}/> {selectedPlayer.experience} EXP</span>
                            </div>
                            <button
                                onClick={() => releasePlayer(selectedPlayer)}
                                disabled={releasingId === selectedPlayer.id || sellingId !== null}
                                className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-black uppercase tracking-widest transition-colors"
                            >
                                <UserMinus size={14} />
                                {releasingId === selectedPlayer.id ? 'Liberando...' : 'Echar Jugador'}
                            </button>
                            <button
                                onClick={() => sellPlayer(selectedPlayer, 'direct')}
                                disabled={sellingId === selectedPlayer.id || releasingId !== null}
                                className="mt-2 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-black uppercase tracking-widest transition-colors"
                            >
                                <HandCoins size={14} />
                                {sellingId === selectedPlayer.id ? 'Vendiendo...' : `Venta directa ${Math.round((1 - DIRECT_SALE_FACTOR) * 100)}%: ${new Intl.NumberFormat('es-ES').format(getDirectSaleValue(selectedPlayer.overall))} €`}
                            </button>
                            <button
                                onClick={() => sellPlayer(selectedPlayer, 'market')}
                                disabled={sellingId === selectedPlayer.id || releasingId !== null}
                                className="mt-2 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-black uppercase tracking-widest transition-colors"
                            >
                                <HandCoins size={14} />
                                {sellingId === selectedPlayer.id ? 'Vendiendo...' : `Venta mercado: ${new Intl.NumberFormat('es-ES').format(getMarketValue(selectedPlayer.overall))} €`}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex border-b border-white/10 shrink-0">
                    <button onClick={() => setActiveTab('attributes')} className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === 'attributes' ? 'text-primary border-b-2 border-primary bg-white/5' : 'text-slate-500 hover:text-white'}`}>Características</button>
                    <button onClick={() => setActiveTab('stats')} className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === 'stats' ? 'text-primary border-b-2 border-primary bg-white/5' : 'text-slate-500 hover:text-white'}`}>Stats Temporada</button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar bg-black/20 flex-1">
                    {activeTab === 'attributes' ? (
                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <h3 className="text-xs font-bold text-slate-500 uppercase mb-4 flex items-center gap-2"><Target size={14}/> Ofensiva</h3>
                                <StatBar label="Tiro de 3" value={selectedPlayer.shooting_3pt} colorClass="bg-green-500" />
                                <StatBar label="Tiro de 2" value={selectedPlayer.shooting_2pt} colorClass="bg-green-500" />
                                <StatBar label="Pase" value={selectedPlayer.passing} colorClass="bg-blue-400" />
                                <StatBar label="Manejo" value={selectedPlayer.dribbling} colorClass="bg-blue-400" />
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-slate-500 uppercase mb-4 flex items-center gap-2"><Shield size={14}/> Físico y Mental</h3>
                                <StatBar label="Defensa Ext." value={selectedPlayer.defense} colorClass="bg-orange-500" />
                                <StatBar label="Rebote" value={selectedPlayer.rebounding} colorClass="bg-purple-500" />
                                <StatBar label="Velocidad" value={selectedPlayer.speed} colorClass="bg-yellow-400" />
                                <StatBar label="Experiencia" value={selectedPlayer.experience} colorClass="bg-purple-600" isPurple={true} />
                            </div>
                        </div>
                    ) : (
                        <div>
                            {selectedPlayer.seasonStats?.games_played && selectedPlayer.seasonStats.games_played > 0 ? (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="bg-surface p-4 rounded-xl border border-white/10 text-center">
                                            <div className="text-3xl font-display font-bold text-white mb-1">{selectedPlayer.seasonStats.ppg.toFixed(1)}</div>
                                            <div className="text-[10px] uppercase font-bold text-slate-500">Puntos (PPG)</div>
                                        </div>
                                        <div className="bg-surface p-4 rounded-xl border border-white/10 text-center">
                                            <div className={`text-3xl font-display font-bold text-white mb-1`}>{selectedPlayer.seasonStats.rpg.toFixed(1)}</div>
                                            <div className="text-[10px] uppercase font-bold text-slate-500">Rebotes (RPG)</div>
                                        </div>
                                        <div className="bg-surface p-4 rounded-xl border border-white/10 text-center">
                                            <div className="text-3xl font-display font-bold text-white mb-1">{selectedPlayer.seasonStats.apg.toFixed(1)}</div>
                                            <div className="text-[10px] uppercase font-bold text-slate-500">Asistencias (APG)</div>
                                        </div>
                                    </div>
                                    <div className="bg-primary/10 p-5 rounded-xl border border-primary/20 flex justify-between items-center">
                                        <div>
                                            <div className="text-sm font-bold text-primary uppercase mb-1">Valoración Media</div>
                                            <div className="text-xs text-slate-400">Rendimiento global por partido</div>
                                        </div>
                                        <span className="text-4xl font-display font-bold text-white">{selectedPlayer.seasonStats.efficiency.toFixed(1)}</span>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xs text-slate-500">Datos basados en los <strong>{selectedPlayer.seasonStats.games_played}</strong> partidos jugados.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                                    <Activity size={48} className="mb-4 opacity-20"/>
                                    <p>Este jugador aún no ha debutado en la temporada.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
