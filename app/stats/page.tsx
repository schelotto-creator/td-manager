'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Trophy,
  Target,
  Activity,
  Hand,
  Crown,
  RefreshCw,
  ChevronLeft,
  Filter,
  RotateCcw
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { filterMatchesBySeason, getLatestSeasonNumber } from '@/lib/match-seasons';

type CategoryKey = 'ppg' | 'rpg' | 'apg' | 'efficiency';

type PlayerStats = {
  id: number;
  name: string;
  position: string;
  team_name: string;
  team_id: string;
  games_played: number;
  ppg: number;
  rpg: number;
  apg: number;
  efficiency: number;
};

type RawPlayerStatsRow = {
  match_id: number;
  player_id: number;
  points: number;
  rebounds: number;
  assists: number;
};

type MatchSeasonRow = {
  id?: number;
  season_number?: number | null;
};

type PlayerMetaRow = {
  id: number;
  name: string;
  position: string;
  team_id: string | null;
};

type LigaRow = { id: number; nombre: string; nivel?: number };
type GrupoRow = { id: number; nombre: string; liga_id: number };
type GroupClubRow = { id: string; nombre: string };

const categories: Array<{
  id: CategoryKey;
  label: string;
  icon: typeof Target;
  color: string;
  shadow: string;
}> = [
  {
    id: 'ppg',
    label: 'ANOTADORES',
    icon: Target,
    color: 'bg-cyan-600',
    shadow: 'shadow-[0_0_15px_rgba(6,182,212,0.3)]'
  },
  {
    id: 'rpg',
    label: 'REBOTEADORES',
    icon: Activity,
    color: 'bg-orange-600',
    shadow: 'shadow-[0_0_15px_rgba(234,88,12,0.3)]'
  },
  {
    id: 'apg',
    label: 'ASISTENTES',
    icon: Hand,
    color: 'bg-yellow-600',
    shadow: 'shadow-[0_0_15px_rgba(202,138,4,0.3)]'
  },
  {
    id: 'efficiency',
    label: 'VALORACIÓN',
    icon: Trophy,
    color: 'bg-emerald-600',
    shadow: 'shadow-[0_0_15px_rgba(16,185,129,0.3)]'
  }
];

const chunkArray = <T,>(items: T[], size: number) => {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const toErrorText = (error: unknown) => {
  if (!error) return 'Error desconocido';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const e = error as { message?: string; details?: string; hint?: string };
    return e.message || e.details || e.hint || JSON.stringify(error);
  }
  return String(error);
};

export default function StatsPage() {
  const router = useRouter();

  const [stats, setStats] = useState<PlayerStats[]>([]);
  const [category, setCategory] = useState<CategoryKey>('ppg');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [leagues, setLeagues] = useState<LigaRow[]>([]);
  const [groups, setGroups] = useState<GrupoRow[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  const [myLeagueId, setMyLeagueId] = useState<number | null>(null);
  const [myGroupId, setMyGroupId] = useState<number | null>(null);
  const [myClubId, setMyClubId] = useState<string | null>(null);
  const [myClubName, setMyClubName] = useState<string>('Mi equipo');
  const [myTeamOnly, setMyTeamOnly] = useState(false);
  const [filtersReady, setFiltersReady] = useState(false);

  const groupOptions = useMemo(
    () => groups.filter((g) => g.liga_id === selectedLeagueId),
    [groups, selectedLeagueId]
  );

  const selectedLeagueName = useMemo(
    () => leagues.find((l) => l.id === selectedLeagueId)?.nombre || 'División',
    [leagues, selectedLeagueId]
  );

  const selectedGroupName = useMemo(
    () => groups.find((g) => g.id === selectedGroupId)?.nombre || 'Grupo',
    [groups, selectedGroupId]
  );

  const defaultLeagueName = useMemo(
    () => leagues.find((l) => l.id === myLeagueId)?.nombre || 'Mi división',
    [leagues, myLeagueId]
  );

  const defaultGroupName = useMemo(
    () => groups.find((g) => g.id === myGroupId)?.nombre || 'Mi grupo',
    [groups, myGroupId]
  );

  const isShowingDefault = selectedLeagueId === myLeagueId && selectedGroupId === myGroupId;

  const getCategoryLabel = () => {
    const labels: Record<CategoryKey, string> = {
      ppg: 'Puntos',
      rpg: 'Rebotes',
      apg: 'Asistencias',
      efficiency: 'Valoración'
    };
    return labels[category];
  };

  const getValue = (player: PlayerStats) => player[category];

  const loadInitialFilters = useCallback(async () => {
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) {
        router.push('/login');
        return;
      }

      const [{ data: myClub }, { data: ligas }, { data: grupos }] = await Promise.all([
        supabase
          .from('clubes')
          .select('id, nombre, league_id, grupo_id')
          .eq('owner_id', user.id)
          .maybeSingle(),
        supabase.from('ligas').select('id, nombre, nivel').order('nivel', { ascending: true }),
        supabase.from('grupos_liga').select('id, nombre, liga_id').order('id', { ascending: true })
      ]);

      const leaguesData = (ligas || []) as LigaRow[];
      const groupsData = (grupos || []) as GrupoRow[];
      setLeagues(leaguesData);
      setGroups(groupsData);

      const fallbackLeagueId = myClub?.league_id || leaguesData[0]?.id || null;
      const fallbackGroupId =
        myClub?.grupo_id ||
        groupsData.find((g) => g.liga_id === fallbackLeagueId)?.id ||
        groupsData[0]?.id ||
        null;

      setMyLeagueId(myClub?.league_id || null);
      setMyGroupId(myClub?.grupo_id || null);
      setMyClubId(myClub?.id ? String(myClub.id) : null);
      setMyClubName(myClub?.nombre ? String(myClub.nombre) : 'Mi equipo');
      setSelectedLeagueId(fallbackLeagueId);
      setSelectedGroupId(fallbackGroupId);
    } finally {
      setFiltersReady(true);
    }
  }, [router]);

  useEffect(() => {
    void loadInitialFilters();
  }, [loadInitialFilters]);

  useEffect(() => {
    if (!selectedLeagueId) return;
    if (!selectedGroupId || !groupOptions.some((g) => g.id === selectedGroupId)) {
      setSelectedGroupId(groupOptions[0]?.id || null);
    }
  }, [selectedLeagueId, selectedGroupId, groupOptions]);

  const fetchStats = useCallback(async () => {
    if (myTeamOnly && !myClubId) {
      setStats([]);
      setLoading(false);
      return;
    }

    if (!myTeamOnly && !selectedGroupId) {
      setStats([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setLoadError(null);

      const groupTeamsQuery = myTeamOnly
        ? supabase.from('clubes').select('id,nombre').eq('id', myClubId as string)
        : supabase.from('clubes').select('id,nombre').eq('grupo_id', selectedGroupId as number);
      const { data: groupTeams, error: groupTeamsError } = await groupTeamsQuery;

      if (groupTeamsError) throw groupTeamsError;

      const clubs = (groupTeams || []) as GroupClubRow[];
      const teamIds = clubs.map((c) => String(c.id));
      const teamNameById = new Map<string, string>(clubs.map((c) => [String(c.id), c.nombre]));

      if (teamIds.length === 0) {
        setStats([]);
        return;
      }

      const { data: viewData, error: viewError } = await supabase
        .from('view_player_season_stats')
        .select('id,name,position,team_name,team_id,games_played,ppg,rpg,apg,efficiency')
        .in('team_id', teamIds)
        .order(category, { ascending: false })
        .limit(50);

      if (!viewError && viewData) {
        setStats((viewData as PlayerStats[]) || []);
        return;
      }

      if (viewError) {
        console.warn(
          'Vista view_player_season_stats no disponible. Se usa cálculo fallback.',
          viewError.message
        );
      }

      const playerMeta: PlayerMetaRow[] = [];
      for (const teamBatch of chunkArray(teamIds, 40)) {
        const { data, error } = await supabase
          .from('players')
          .select('id,name,position,team_id')
          .in('team_id', teamBatch);
        if (error) throw error;
        playerMeta.push(...((data || []) as PlayerMetaRow[]));
      }

      if (playerMeta.length === 0) {
        setStats([]);
        return;
      }

      const playersById = new Map<number, PlayerMetaRow>(
        playerMeta.map((p) => [Number(p.id), p])
      );
      const playerIds = Array.from(playersById.keys());

      const allRows: RawPlayerStatsRow[] = [];
      const pageSize = 1000;
      for (const playerBatch of chunkArray(playerIds, 200)) {
        for (let from = 0; ; from += pageSize) {
          const to = from + pageSize - 1;
          const { data, error } = await supabase
            .from('player_stats')
            .select('match_id,player_id,points,rebounds,assists')
            .in('player_id', playerBatch)
            .range(from, to);

          if (error) throw error;
          const chunk = (data || []) as RawPlayerStatsRow[];
          allRows.push(...chunk);
          if (chunk.length < pageSize) break;
        }
      }

      if (allRows.length === 0) {
        setStats([]);
        return;
      }

      const { data: latestSeasonRows, error: latestSeasonError } = await supabase
        .from('matches')
        .select('season_number')
        .order('season_number', { ascending: false })
        .limit(1);

      if (latestSeasonError) throw latestSeasonError;

      const activeSeasonNumber = getLatestSeasonNumber((latestSeasonRows || []) as MatchSeasonRow[]);
      const statMatchIds = [...new Set(
        allRows
          .map((row) => Number(row.match_id))
          .filter((matchId) => Number.isFinite(matchId))
      )];
      const activeMatchIds = new Set<number>();

      for (const matchBatch of chunkArray(statMatchIds, 200)) {
        const { data, error } = await supabase
          .from('matches')
          .select('id,season_number')
          .in('id', matchBatch);

        if (error) throw error;

        filterMatchesBySeason((data || []) as MatchSeasonRow[], activeSeasonNumber)
          .forEach((match) => {
            const matchId = Number(match.id);
            if (Number.isFinite(matchId)) activeMatchIds.add(matchId);
          });
      }

      const currentSeasonRows = allRows.filter((row) => activeMatchIds.has(Number(row.match_id)));
      if (currentSeasonRows.length === 0) {
        setStats([]);
        return;
      }

      const aggregates = new Map<
        number,
        { matches: Set<number>; rows: number; points: number; rebounds: number; assists: number }
      >();

      currentSeasonRows.forEach((row) => {
        const playerId = Number(row.player_id);
        if (!Number.isFinite(playerId) || !playersById.has(playerId)) return;

        const current = aggregates.get(playerId) || {
          matches: new Set<number>(),
          rows: 0,
          points: 0,
          rebounds: 0,
          assists: 0
        };

        const matchId = Number(row.match_id);
        if (Number.isFinite(matchId)) current.matches.add(matchId);

        current.rows += 1;
        current.points += Number(row.points || 0);
        current.rebounds += Number(row.rebounds || 0);
        current.assists += Number(row.assists || 0);
        aggregates.set(playerId, current);
      });

      const fallbackStats: PlayerStats[] = [];
      aggregates.forEach((agg, playerId) => {
        const player = playersById.get(playerId);
        if (!player) return;

        const games = Math.max(1, agg.matches.size || agg.rows);
        const ppg = Number((agg.points / games).toFixed(1));
        const rpg = Number((agg.rebounds / games).toFixed(1));
        const apg = Number((agg.assists / games).toFixed(1));
        const efficiency = Number(((agg.points + agg.rebounds + agg.assists) / games).toFixed(1));

        fallbackStats.push({
          id: playerId,
          name: player.name,
          position: player.position,
          team_name: player.team_id
            ? teamNameById.get(String(player.team_id)) || 'Sin equipo'
            : 'Sin equipo',
          team_id: player.team_id || '',
          games_played: games,
          ppg,
          rpg,
          apg,
          efficiency
        });
      });

      const metric: CategoryKey = category;
      fallbackStats.sort((a, b) => Number(b[metric] || 0) - Number(a[metric] || 0));
      setStats(fallbackStats.slice(0, 50));
    } catch (error) {
      setStats([]);
      setLoadError(`No se pudieron cargar las estadísticas (${toErrorText(error).slice(0, 160)}).`);
    } finally {
      setLoading(false);
    }
  }, [selectedGroupId, category, myTeamOnly, myClubId]);

  useEffect(() => {
    if (!filtersReady) return;
    void fetchStats();
  }, [filtersReady, fetchStats]);

  const resetToDefaultGroup = () => {
    if (!myLeagueId || !myGroupId) return;
    setSelectedLeagueId(myLeagueId);
    setSelectedGroupId(myGroupId);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-4xl mx-auto relative z-10">
        <div className="mb-8 text-center relative">
          <Link
            href="/"
            className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white flex items-center gap-2 mb-2 text-sm font-bold w-fit transition-colors"
          >
            <ChevronLeft size={16} /> VOLVER
          </Link>
          <h1 className="text-4xl font-black italic uppercase tracking-tighter text-white flex justify-center items-center gap-3">
            <Trophy className="text-yellow-500" size={40} /> LÍDERES DE LA LIGA
          </h1>
          <p className="text-slate-400 mt-2 text-xs font-bold uppercase tracking-widest">
            Basado en rendimiento oficial verificado
          </p>
        </div>

        <div className="mb-8 flex justify-center gap-2 md:gap-4 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-4 md:px-6 py-3 rounded-xl font-black italic uppercase tracking-widest text-xs flex items-center gap-2 transition-all border ${
                category === cat.id
                  ? `${cat.color} text-white ${cat.shadow} border-white/20 scale-105`
                  : 'bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <cat.icon size={16} />
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        <div className="mb-10 bg-slate-900/50 border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-cyan-300">
            <Filter size={14} />
            <p className="text-[10px] font-black uppercase tracking-widest">Filtro de competición</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">División</label>
              <select
                value={selectedLeagueId || ''}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setSelectedLeagueId(Number.isFinite(value) ? value : null);
                }}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-cyan-500"
              >
                {leagues.map((league) => (
                  <option key={league.id} value={league.id}>
                    {league.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Grupo</label>
              <select
                value={selectedGroupId || ''}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setSelectedGroupId(Number.isFinite(value) ? value : null);
                }}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-cyan-500"
              >
                {groupOptions.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={resetToDefaultGroup}
                disabled={!myLeagueId || !myGroupId || isShowingDefault}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black uppercase text-[10px] rounded-xl py-2 transition-colors"
              >
                <RotateCcw size={12} />
                Volver a mi grupo
              </button>
            </div>
          </div>

          <button
            onClick={() => setMyTeamOnly((prev) => !prev)}
            disabled={!myClubId}
            className={`w-full mt-2 flex items-center justify-center gap-2 border rounded-xl py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
              myTeamOnly
                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-800 border-white/10 text-slate-300 hover:bg-slate-700'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {myTeamOnly ? 'Mostrando mi equipo' : `Solo mi equipo: ${myClubName}`}
          </button>

          <div className="text-[10px] uppercase tracking-widest font-black text-slate-500">
            Viendo:{' '}
            <span className="text-slate-300">
              {myTeamOnly ? `Mi equipo • ${myClubName}` : `${selectedLeagueName} • ${selectedGroupName}`}
            </span>
          </div>

          {!isShowingDefault && myLeagueId && myGroupId && (
            <div className="text-[10px] uppercase tracking-widest font-black text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
              Estás viendo otro grupo. Tu grupo por defecto es: {defaultLeagueName} • {defaultGroupName}.
            </div>
          )}
        </div>

        {loadError && (
          <div className="mb-6 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/10 text-red-300 text-[10px] uppercase tracking-widest font-black">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <RefreshCw className="animate-spin text-cyan-500" size={40} />
            <span className="text-slate-500 font-mono text-xs uppercase tracking-widest animate-pulse">
              RECOPILANDO ACTAS OFICIALES...
            </span>
          </div>
        ) : (
          <>
            {stats.length >= 3 && (
              <div className="grid grid-cols-3 gap-2 md:gap-4 mb-8 items-end">
                <div className="bg-slate-900 border border-slate-800 rounded-t-3xl p-4 flex flex-col items-center relative h-40 justify-end shadow-xl group hover:border-slate-700 transition-colors">
                  <div className="absolute -top-4 w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center font-black text-slate-800 border-4 border-slate-950 shadow-lg">
                    2
                  </div>
                  <div className="text-center w-full">
                    <div className="font-bold text-white text-xs md:text-sm truncate group-hover:text-cyan-400 transition-colors">
                      {stats[1].name}
                    </div>
                    <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-0.5 truncate">
                      {stats[1].team_name}
                    </div>
                    <div className="text-2xl md:text-3xl font-mono font-black text-slate-300 mt-2">
                      {getValue(stats[1])}
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-t from-slate-900 to-yellow-900/20 border-x border-t border-yellow-500/30 rounded-t-3xl p-4 flex flex-col items-center relative h-56 justify-end shadow-[0_-10px_40px_rgba(234,179,8,0.15)] group">
                  <Crown
                    className="text-yellow-500 mb-4 animate-bounce drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]"
                    size={48}
                  />
                  <div className="text-center w-full">
                    <div className="font-black text-white text-sm md:text-lg truncate group-hover:text-yellow-400 transition-colors">
                      {stats[0].name}
                    </div>
                    <div className="text-[10px] text-yellow-600 font-black uppercase tracking-widest mt-1 truncate">
                      {stats[0].team_name}
                    </div>
                    <div className="text-4xl md:text-6xl font-mono font-black text-white mt-3 drop-shadow-md">
                      {getValue(stats[0])}
                    </div>
                    <div className="text-[9px] text-slate-400 mt-2 uppercase font-bold tracking-widest">
                      {getCategoryLabel()} / P
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-t-3xl p-4 flex flex-col items-center relative h-32 justify-end shadow-xl group hover:border-slate-700 transition-colors">
                  <div className="absolute -top-4 w-8 h-8 bg-orange-700 rounded-full flex items-center justify-center font-black text-white border-4 border-slate-950 shadow-lg">
                    3
                  </div>
                  <div className="text-center w-full">
                    <div className="font-bold text-white text-xs md:text-sm truncate group-hover:text-orange-400 transition-colors">
                      {stats[2].name}
                    </div>
                    <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-0.5 truncate">
                      {stats[2].team_name}
                    </div>
                    <div className="text-xl md:text-2xl font-mono font-black text-orange-400 mt-2">
                      {getValue(stats[2])}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-950 text-[10px] uppercase text-slate-500 font-bold tracking-widest border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-4 w-16 text-center">Rnk</th>
                      <th className="px-6 py-4">Jugador</th>
                      <th className="px-6 py-4">Franquicia</th>
                      <th className="px-6 py-4 text-center">Partidos</th>
                      <th className="px-6 py-4 text-right pr-8 text-white">
                        {getCategoryLabel().toUpperCase()} / Medio
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {stats.map((player, index) => (
                      <tr key={player.id} className="hover:bg-white/5 transition-colors group">
                        <td
                          className={`px-6 py-4 text-center font-mono font-bold ${
                            index === 0
                              ? 'text-yellow-500'
                              : index === 1
                                ? 'text-slate-300'
                                : index === 2
                                  ? 'text-orange-500'
                                  : 'text-slate-600'
                          }`}
                        >
                          {index + 1}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-white group-hover:text-cyan-400 transition-colors">
                            {player.name}
                          </div>
                          <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-0.5">
                            {player.position}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-400 font-bold">{player.team_name}</td>
                        <td className="px-6 py-4 text-center text-slate-500 font-mono">
                          {player.games_played}
                        </td>
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
                  <div className="text-white font-bold text-lg uppercase tracking-widest">
                    Sin datos registrados
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest max-w-xs leading-relaxed">
                    No hay estadísticas para este filtro ({selectedLeagueName} • {selectedGroupName}).
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
