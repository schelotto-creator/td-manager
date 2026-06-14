'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
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
import { CLUB_STATUS } from '@/lib/season-draft';
import { filterMatchesBySeason, getLatestSeasonNumber } from '@/lib/match-seasons';

const FLAGS: Record<string, string> = {
  'USA': '🇺🇸', 'ESP': '🇪🇸', 'ARG': '🇦🇷', 'LTU': '🇱🇹', 
  'SVK': '🇸🇰', 'CHN': '🇨🇳', 'FRA': '🇫🇷', 'GER': '🇩🇪'
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
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        router.push('/login');
        return;
      }
      const [dynamicPositionConfig, response] = await Promise.all([
        fetchPositionOverallConfig(supabase),
        fetch('/api/draft/prepare', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`
          }
        })
      ]);
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        club?: any;
        mode?: 'rookie' | 'season';
        roster?: any[];
        candidates?: any[];
      } | null;
      if (response.status === 409) {
        router.push('/');
        return;
      }
      if (!response.ok || !payload?.club || !payload.mode) {
        throw new Error(payload?.error || 'No se pudo preparar el draft.');
      }

      setPositionOverallConfig(dynamicPositionConfig);
      setDraftMode(payload.mode);
      setTeam(payload.club);
      await buildDraftOrder(payload.club);

      const rosterWithOverall = (payload.roster || []).map((p) => ({
        ...p,
        position: getBestRoleForPlayer(p, dynamicPositionConfig),
        overall: calculateOverall(p, dynamicPositionConfig)
      }));
      setCurrentRoster(rosterWithOverall.sort((a, b) => (b.overall || 0) - (a.overall || 0)));

      const draftCandidates = (payload.candidates || []).map((p: any) => ({
        ...p,
        position: getBestRoleForPlayer(p, dynamicPositionConfig),
        overall: calculateOverall(p, dynamicPositionConfig),
        temp_id: p.id,
        db_id: p.id
      }));
      setRookies(draftCandidates.sort((a, b) => (b.overall || 0) - (a.overall || 0)));
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'No se pudo preparar el draft.');
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
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !sessionData.session?.access_token) {
            throw new Error('Sesión no disponible.');
          }
          const response = await fetch('/api/draft/confirm', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionData.session.access_token}`
            },
            body: JSON.stringify({ selectedIds })
          });
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          if (!response.ok) throw new Error(payload?.error || 'No se pudo cerrar el draft.');

          if (draftMode === 'season') {
              const { data: { user: currentUser } } = await supabase.auth.getUser();
              const [{ data: managerRow }, { count: remainingDraft }] = await Promise.all([
                supabase.from('managers').select('is_admin').eq('owner_id', currentUser?.id ?? '').maybeSingle(),
                supabase.from('clubes').select('id', { count: 'exact', head: true }).eq('status', CLUB_STATUS.SEASON_DRAFT)
              ]);
              if (managerRow?.is_admin && (remainingDraft ?? 1) === 0) {
                router.push('/admin');
                return;
              }
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
