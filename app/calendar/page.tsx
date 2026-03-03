'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CalendarDays, ChevronLeft, ChevronRight, Activity, Trophy, Play, Shield, Filter, RotateCcw } from 'lucide-react';
import Link from 'next/link';

type EscudoForma = 'circle' | 'square' | 'modern' | 'hexagon' | 'classic';
type LigaRow = { id: number; nombre: string; nivel?: number; };
type GrupoRow = { id: number; nombre: string; liga_id: number; };
type TeamId = string;
type MatchTeam = { id: TeamId; nombre: string; color_primario?: string; escudo_forma?: EscudoForma | null; escudo_url?: string | null; };
type MatchRow = {
  id: number;
  jornada: number;
  home_score: number;
  away_score: number;
  played: boolean;
  match_date?: string | null;
  home_team: MatchTeam;
  away_team: MatchTeam;
};
type DbMatchRow = {
  id: number;
  jornada: number;
  home_team_id: TeamId;
  away_team_id: TeamId;
  home_score: number;
  away_score: number;
  played: boolean;
  match_date?: string | null;
};
const buildFallbackTeam = (id: TeamId): MatchTeam => ({ id, nombre: `Equipo ${id}` });
const toErrorText = (error: unknown) => {
  if (!error) return 'Error desconocido';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const e = error as { message?: string; details?: string; hint?: string; };
    return e.message || e.details || e.hint || JSON.stringify(error);
  }
  return String(error);
};

function EscudoSVG({ forma, color, className }: { forma?: string | null; color?: string | null; className?: string; }) {
  const renderPath = () => {
    switch (forma) {
      case 'circle': return <circle cx="12" cy="12" r="10" />;
      case 'square': return <rect x="3" y="3" width="18" height="18" rx="2" />;
      case 'modern': return <path d="M5 3h14a2 2 0 012 2v10a8 8 0 01-8 8 8 8 0 01-8-8V5a2 2 0 012-2z" />;
      case 'hexagon': return <path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" />;
      default: return <circle cx="12" cy="12" r="10" />;
    }
  };
  return <svg viewBox="0 0 24 24" fill={color || 'currentColor'} className={className}>{renderPath()}</svg>;
}

export default function CalendarPage() {
  const [loading, setLoading] = useState(true);
  const [jornada, setJornada] = useState(1);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [leagues, setLeagues] = useState<LigaRow[]>([]);
  const [groups, setGroups] = useState<GrupoRow[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  const [myClubId, setMyClubId] = useState<TeamId | null>(null);
  const [myLeagueId, setMyLeagueId] = useState<number | null>(null);
  const [myGroupId, setMyGroupId] = useState<number | null>(null);

  const groupOptions = useMemo(
    () => groups.filter(g => g.liga_id === selectedLeagueId),
    [groups, selectedLeagueId]
  );

  const selectedLeagueName = useMemo(
    () => leagues.find(l => l.id === selectedLeagueId)?.nombre || 'Liga',
    [leagues, selectedLeagueId]
  );
  const selectedGroupName = useMemo(
    () => groups.find(g => g.id === selectedGroupId)?.nombre || 'Grupo',
    [groups, selectedGroupId]
  );
  const defaultLeagueName = useMemo(
    () => leagues.find(l => l.id === myLeagueId)?.nombre || 'Mi liga',
    [leagues, myLeagueId]
  );
  const defaultGroupName = useMemo(
    () => groups.find(g => g.id === myGroupId)?.nombre || 'Mi grupo',
    [groups, myGroupId]
  );

  const getTeamIdsForGroup = useCallback(async (grupoId: number) => {
    const { data } = await supabase.from('clubes').select('id').eq('grupo_id', grupoId);
    return (data || []).map(t => String(t.id));
  }, []);

  const getCurrentRoundForGroup = useCallback(async (grupoId: number) => {
    const teamIds = await getTeamIdsForGroup(grupoId);
    if (teamIds.length === 0) return 1;

    const { data: allMatches, error } = await supabase
      .from('matches')
      .select('jornada, played')
      .in('home_team_id', teamIds);

    if (error) {
      console.warn('No se pudo calcular la jornada actual del grupo.', error);
      return 1;
    }

    const byRound = new Map<number, { total: number; played: number }>();
    (allMatches || []).forEach((m) => {
      const round = Number(m.jornada || 1);
      const curr = byRound.get(round) || { total: 0, played: 0 };
      curr.total += 1;
      if (m.played) curr.played += 1;
      byRound.set(round, curr);
    });

    for (let r = 1; r <= 14; r++) {
      const info = byRound.get(r);
      if (!info || info.played < info.total) return r;
    }
    return 14;
  }, [getTeamIdsForGroup]);

  const loadMatches = useCallback(async (grupoId: number, j: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      const teamIds = await getTeamIdsForGroup(grupoId);
      if (teamIds.length === 0) {
        setMatches([]);
        return;
      }

      const { data: partidos, error } = await supabase
        .from('matches')
        .select('id, jornada, home_team_id, away_team_id, home_score, away_score, played, match_date')
        .eq('jornada', j)
        .in('home_team_id', teamIds)
        .order('id', { ascending: true });

      if (error) throw error;

      const rawMatches = (partidos || []) as DbMatchRow[];
      if (rawMatches.length === 0) {
        setMatches([]);
        return;
      }

      const uniqueTeamIds = [...new Set(rawMatches.flatMap((m) => [String(m.home_team_id), String(m.away_team_id)]).filter(Boolean))];
      if (uniqueTeamIds.length === 0) {
        setMatches([]);
        return;
      }
      const { data: teamsData, error: teamsError } = await supabase
        .from('clubes')
        .select('*')
        .in('id', uniqueTeamIds);

      if (teamsError) throw teamsError;

      const teamById = new Map<TeamId, MatchTeam>();
      (teamsData || []).forEach((team) => {
        const id = String(team.id);
        teamById.set(id, {
          id,
          nombre: String(team.nombre || `Equipo ${team.id}`),
          color_primario: team.color_primario || undefined,
          escudo_forma: (team.escudo_forma as EscudoForma | null) || undefined,
          escudo_url: team.escudo_url || undefined,
        });
      });

      const normalizedMatches: MatchRow[] = rawMatches.map((match) => ({
        id: match.id,
        jornada: match.jornada,
        home_score: match.home_score,
        away_score: match.away_score,
        played: match.played,
        match_date: match.match_date || null,
        home_team: teamById.get(String(match.home_team_id)) || buildFallbackTeam(String(match.home_team_id)),
        away_team: teamById.get(String(match.away_team_id)) || buildFallbackTeam(String(match.away_team_id)),
      }));

      setMatches(normalizedMatches);
    } catch (e) {
      // Evitamos console.error para no abrir el overlay rojo por errores recuperables.
      console.warn('No se pudieron cargar los partidos para este filtro.', e);
      const detail = toErrorText(e);
      setLoadError(`No se pudieron cargar los partidos (${detail.slice(0, 160)}).`);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [getTeamIdsForGroup]);

  const init = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [
        { data: myClub },
        { data: ligas },
        { data: grupos },
      ] = await Promise.all([
        supabase.from('clubes').select('id, league_id, grupo_id').eq('owner_id', user.id).maybeSingle(),
        supabase.from('ligas').select('id, nombre, nivel').order('nivel', { ascending: true }),
        supabase.from('grupos_liga').select('id, nombre, liga_id').order('id', { ascending: true }),
      ]);

      const leaguesData = (ligas || []) as LigaRow[];
      const groupsData = (grupos || []) as GrupoRow[];
      setLeagues(leaguesData);
      setGroups(groupsData);

      if (!myClub) return;

      setMyClubId(String(myClub.id));
      setMyLeagueId(myClub.league_id || null);
      setMyGroupId(myClub.grupo_id || null);

      const fallbackLeagueId = myClub.league_id || leaguesData[0]?.id || null;
      const fallbackGroupId =
        myClub.grupo_id ||
        groupsData.find(g => g.liga_id === fallbackLeagueId)?.id ||
        groupsData[0]?.id ||
        null;

      setSelectedLeagueId(fallbackLeagueId);
      setSelectedGroupId(fallbackGroupId);

      if (fallbackGroupId) {
        const currentRound = await getCurrentRoundForGroup(fallbackGroupId);
        setJornada(currentRound);
        await loadMatches(fallbackGroupId, currentRound);
      }
    } catch (e) {
      console.warn('Error inicializando calendario:', e);
    } finally {
      setLoading(false);
    }
  }, [getCurrentRoundForGroup, loadMatches]);

  useEffect(() => { void init(); }, [init]);

  useEffect(() => {
    if (!selectedLeagueId) return;
    if (!selectedGroupId || !groupOptions.some(g => g.id === selectedGroupId)) {
      setSelectedGroupId(groupOptions[0]?.id || null);
    }
  }, [selectedLeagueId, selectedGroupId, groupOptions]);

  useEffect(() => {
    if (!selectedGroupId) {
      setMatches([]);
      return;
    }
    let isMounted = true;
    (async () => {
      const current = await getCurrentRoundForGroup(selectedGroupId);
      if (isMounted) setJornada(current);
    })();
    return () => { isMounted = false; };
  }, [selectedGroupId, getCurrentRoundForGroup]);

  useEffect(() => {
    if (!selectedGroupId) return;
    void loadMatches(selectedGroupId, jornada);
  }, [selectedGroupId, jornada, loadMatches]);

  const nextRound = () => setJornada(p => Math.min(14, p + 1));
  const prevRound = () => setJornada(p => Math.max(1, p - 1));

  const resetToDefaults = async () => {
    if (!myLeagueId || !myGroupId) return;
    setSelectedLeagueId(myLeagueId);
    setSelectedGroupId(myGroupId);
    const current = await getCurrentRoundForGroup(myGroupId);
    setJornada(current);
  };

  const isShowingDefault = selectedGroupId === myGroupId;

  const getJornadaDateStr = (jRound: number) => {
    const baseDate = new Date(2026, 2, 4, 18, 30);
    const weekOffset = Math.floor((jRound - 1) / 2);
    const isSaturday = jRound % 2 === 0;
    const daysToAdd = (weekOffset * 7) + (isSaturday ? 3 : 0);
    baseDate.setDate(baseDate.getDate() + daysToAdd);
    if (isSaturday) baseDate.setHours(12, 30);

    return new Intl.DateTimeFormat('es-ES', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(baseDate) + ' CET';
  };

  const formatKickoff = (match: MatchRow) => {
    if (match.match_date) {
      const parsed = new Date(match.match_date);
      if (!Number.isNaN(parsed.getTime())) {
        return (
          new Intl.DateTimeFormat('es-ES', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Madrid'
          }).format(parsed) + ' CET/CEST'
        );
      }
    }
    return getJornadaDateStr(match.jornada);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-orange-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-6xl mx-auto relative z-10">
        <header className="mb-8 border-b border-white/5 pb-8">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-3 mb-6">
              <CalendarDays className="text-orange-500" size={32} />
              <h1 className="text-4xl font-black italic uppercase tracking-tighter text-white">Cronograma <span className="text-orange-500">Liga</span></h1>
            </div>
            <div className="mb-6 bg-slate-900/60 border border-white/10 rounded-2xl px-5 py-3 text-center">
              <p className="text-[10px] uppercase tracking-widest font-black text-slate-500">Default automático</p>
              <p className="text-sm font-black text-white mt-1">{defaultLeagueName} • {defaultGroupName} • Jornada actual</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-center">
            <div className="bg-slate-900/50 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-orange-300 mb-3">
                <Filter size={14} />
                <p className="text-[10px] font-black uppercase tracking-widest">Explorar calendario</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select
                  value={selectedLeagueId || ''}
                  onChange={(e) => setSelectedLeagueId(Number(e.target.value))}
                  className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-orange-500"
                >
                  {leagues.map((league) => (
                    <option key={league.id} value={league.id}>{league.nombre}</option>
                  ))}
                </select>
                <select
                  value={selectedGroupId || ''}
                  onChange={(e) => setSelectedGroupId(Number(e.target.value))}
                  className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-orange-500"
                >
                  {groupOptions.map((group) => (
                    <option key={group.id} value={group.id}>{group.nombre}</option>
                  ))}
                </select>
                <button
                  onClick={resetToDefaults}
                  disabled={!myLeagueId || !myGroupId || isShowingDefault}
                  className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black uppercase text-[10px] rounded-xl py-2 transition-colors"
                >
                  <RotateCcw size={12} />
                  Volver a mi grupo
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between w-full lg:w-[420px] bg-slate-900 border border-white/10 rounded-[2rem] p-2 shadow-2xl">
              <button onClick={prevRound} disabled={jornada === 1} className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/5 disabled:opacity-30 transition-all">
                <ChevronLeft />
              </button>
              <div className="text-center">
                <h2 className="text-2xl font-black uppercase tracking-tighter text-white">Jornada {jornada}</h2>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">{getJornadaDateStr(jornada)}</p>
              </div>
              <button onClick={nextRound} disabled={jornada === 14} className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/5 disabled:opacity-30 transition-all">
                <ChevronRight />
              </button>
            </div>
          </div>
        </header>

        {!isShowingDefault && (
          <div className="mb-4 px-4 py-2 rounded-xl border border-amber-500/20 bg-amber-500/10 text-[10px] font-black uppercase tracking-widest text-amber-300">
            Estás viendo otro grupo: {selectedLeagueName} • {selectedGroupName}
          </div>
        )}

        {loadError && (
          <div className="mb-4 px-4 py-2 rounded-xl border border-red-500/20 bg-red-500/10 text-[10px] font-black uppercase tracking-widest text-red-300">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="p-32 text-center flex flex-col items-center">
            <Activity className="w-12 h-12 text-orange-500 animate-spin mb-6" />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Cargando enfrentamientos...</p>
          </div>
        ) : matches.length === 0 ? (
          <div className="p-20 text-center bg-slate-900/50 border border-white/5 rounded-[2rem]">
            <Trophy className="w-16 h-16 text-slate-700 mx-auto mb-4" />
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">No hay partidos para este grupo en esta jornada.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matches.map((m) => {
              const isMyMatch = myClubId === m.home_team?.id || myClubId === m.away_team?.id;

              return (
                <div key={m.id} className={`relative flex items-center justify-between p-6 rounded-[2rem] border transition-all ${isMyMatch ? 'bg-orange-500/10 border-orange-500/30 shadow-[0_0_20px_rgba(249,115,22,0.1)]' : 'bg-slate-900 border-white/5 hover:border-white/10'}`}>
                  <div className="flex flex-col items-center w-1/3 gap-3">
                    <div className="w-14 h-14">
                      {m.home_team?.escudo_url ? (
                        <img src={m.home_team.escudo_url} className="w-full h-full object-contain drop-shadow-md" alt="Home" />
                      ) : (
                        <EscudoSVG forma={m.home_team?.escudo_forma} color={m.home_team?.color_primario} className="w-full h-full drop-shadow-md" />
                      )}
                    </div>
                    <span className={`text-[11px] font-black uppercase text-center leading-tight ${isMyMatch && myClubId === m.home_team?.id ? 'text-orange-400' : 'text-slate-300'}`}>
                      {m.home_team?.nombre}
                    </span>
                  </div>

                  <div className="flex flex-col items-center justify-center w-1/3">
                    {m.played ? (
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-2">
                          <span className={`text-3xl font-mono font-black ${m.home_score > m.away_score ? 'text-white' : 'text-slate-500'}`}>{m.home_score}</span>
                          <span className="text-slate-600 font-black">-</span>
                          <span className={`text-3xl font-mono font-black ${m.away_score > m.home_score ? 'text-white' : 'text-slate-500'}`}>{m.away_score}</span>
                        </div>
                        <span className="text-[9px] bg-slate-950 px-3 py-1 rounded-full text-slate-500 uppercase tracking-widest font-bold mt-2 border border-white/5">Finalizado</span>
                        <Link href={`/match?matchId=${m.id}`} className="mt-3 flex items-center gap-1 text-[10px] font-black text-cyan-500 uppercase hover:text-cyan-400 transition-colors bg-cyan-500/10 px-3 py-1.5 rounded-lg border border-cyan-500/20">
                          <Play size={10} fill="currentColor" /> Ver Repetición
                        </Link>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-black text-slate-600">VS</span>
                        <span className="text-[9px] bg-orange-500/10 text-orange-500 px-3 py-1 rounded-full uppercase tracking-widest font-bold mt-2 border border-orange-500/20">Pendiente</span>
                        <span className="mt-2 text-[9px] text-slate-400 font-bold uppercase tracking-widest text-center">
                          Auto: {formatKickoff(m)}
                        </span>
                        {isMyMatch && (
                          <div className="mt-3 flex flex-wrap justify-center gap-2">
                            <Link href={`/tactics?matchId=${m.id}`} className="flex items-center gap-1 text-[10px] font-black text-yellow-500 uppercase hover:text-yellow-400 transition-colors bg-yellow-500/10 px-3 py-1.5 rounded-lg border border-yellow-500/20">
                              <Shield size={10} /> Preparar
                            </Link>
                            <Link href={`/match?matchId=${m.id}`} className="flex items-center gap-1 text-[10px] font-black text-emerald-400 uppercase hover:text-emerald-300 transition-colors bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                              <Play size={10} fill="currentColor" /> Seguir
                            </Link>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-center w-1/3 gap-3">
                    <div className="w-14 h-14">
                      {m.away_team?.escudo_url ? (
                        <img src={m.away_team.escudo_url} className="w-full h-full object-contain drop-shadow-md" alt="Away" />
                      ) : (
                        <EscudoSVG forma={m.away_team?.escudo_forma} color={m.away_team?.color_primario} className="w-full h-full drop-shadow-md" />
                      )}
                    </div>
                    <span className={`text-[11px] font-black uppercase text-center leading-tight ${isMyMatch && myClubId === m.away_team?.id ? 'text-orange-400' : 'text-slate-300'}`}>
                      {m.away_team?.nombre}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
