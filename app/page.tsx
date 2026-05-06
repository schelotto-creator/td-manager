'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Trophy, Calendar, Users, DollarSign, Activity, Star, Shield, Dumbbell, LineChart, PlayCircle, ArrowRight, TrendingDown, TrendingUp, AlertTriangle, Info, Flame } from 'lucide-react';
import Link from 'next/link';
import { CLUB_STATUS } from '@/lib/season-draft';
import { normalizeSeasonNumber } from '@/lib/match-seasons';
import { fetchActivityFeed, ACTIVITY_META, formatRelativeTime, type ActivityEvent } from '@/lib/activity-feed';
import { fetchActiveFlashOpportunity, type FlashOpportunity } from '@/lib/flash-market';
import { getTimeRemaining } from '@/lib/player-market';
import { SCOUT_STATS, SCOUT_STAT_LABELS, getStatDisplay, getOverallDisplay } from '@/lib/scouting-display';

type Manager = {
  nombre: string;
  nivel: number;
  xp?: number;
  talento_ojo?: number;
  ojeos?: Record<string, string[]>;
};

type Club = {
  id: string;
  nombre: string;
  status?: string | null;
  presupuesto: number;
  color_primario?: string | null;
  escudo_forma?: string | null;
  escudo_url?: string | null;
  league_id?: number | null;
  grupo_id?: string | null;
  pj?: number | null;
  v?: number | null;
  d?: number | null;
  pts?: number | null;
};

type NextMatch = {
  jornada: number;
  rival: string;
  isHome: boolean;
};

type InboxItem = {
  id: string;
  type: 'win' | 'loss' | 'warning' | 'info';
  title: string;
  body: string;
  href?: string;
  urgent?: boolean;
};

function EscudoSVG({ forma, color, className }: { forma?: string | null; color?: string | null; className?: string }) {
  const fill = color || '#06b6d4';

  switch (forma) {
    case 'circle':
      return <svg viewBox="0 0 24 24" fill={fill} className={className}><circle cx="12" cy="12" r="10" /></svg>;
    case 'square':
      return <svg viewBox="0 0 24 24" fill={fill} className={className}><rect x="3" y="3" width="18" height="18" rx="2" /></svg>;
    case 'modern':
      return <svg viewBox="0 0 24 24" fill={fill} className={className}><path d="M5 3h14a2 2 0 012 2v10a8 8 0 01-8 8 8 8 0 01-8-8V5a2 2 0 012-2z" /></svg>;
    case 'hexagon':
      return <svg viewBox="0 0 24 24" fill={fill} className={className}><path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" /></svg>;
    default:
      return <svg viewBox="0 0 24 24" fill={fill} className={className}><path d="M12 2.17a11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.352-.272-2.644-.759-3.833a.75.75 0 00-.722-.515 11.209 11.209 0 01-7.877-3.08z" /></svg>;
  }
}

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [manager, setManager] = useState<Manager | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [leagueName, setLeagueName] = useState<string>('Liga en curso');
  const [nextMatch, setNextMatch] = useState<NextMatch | null>(null);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>([]);
  const [seasonStats, setSeasonStats] = useState<{ pj: number; v: number; d: number; pts: number }>({ pj: 0, v: 0, d: 0, pts: 0 });
  const [leaguePosition, setLeaguePosition] = useState<{ pos: number; total: number } | null>(null);
  const [winStreak, setWinStreak] = useState(0);
  const [flashOpportunity, setFlashOpportunity] = useState<FlashOpportunity | null>(null);
  const [claimingFlash, setClaimingFlash] = useState(false);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [talentoOjo, setTalentoOjo] = useState(0);
  const [ojeos, setOjeos] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }

        const { data: mData } = await supabase.from('managers').select('*').eq('owner_id', user.id).limit(1);
        const { data: cData } = await supabase.from('clubes').select('*').eq('owner_id', user.id).limit(1);

        const managerData = mData?.[0] as Manager | undefined;
        const clubData = cData?.[0] as Club | undefined;

        if (!managerData || !clubData) {
          router.push('/onboarding');
          return;
        }

        if (clubData.status === CLUB_STATUS.ROOKIE_DRAFT || clubData.status === CLUB_STATUS.SEASON_DRAFT) {
          router.push('/draft-room');
          return;
        }

        setManager(managerData);
        setClub(clubData);
        setTalentoOjo(Number(managerData.talento_ojo ?? 0));
        setOjeos((managerData.ojeos as Record<string, string[]>) ?? {});

        type MatchResult = { home_team_id: string; away_team_id: string; home_score: number; away_score: number; season_number: number | null; jornada?: number | null };

        const grupoId = clubData.grupo_id;
        const [leagueRes, groupClubsRes, playedMatchesRes] = await Promise.all([
          clubData.league_id
            ? supabase.from('ligas').select('nombre').eq('id', clubData.league_id).maybeSingle()
            : Promise.resolve({ data: null }),
          grupoId
            ? supabase.from('clubes').select('id').eq('grupo_id', grupoId)
            : Promise.resolve({ data: [] }),
          supabase
            .from('matches')
            .select('home_team_id,away_team_id,home_score,away_score,season_number,jornada')
            .eq('played', true)
            .or(`home_team_id.eq.${clubData.id},away_team_id.eq.${clubData.id}`)
            .order('season_number', { ascending: false })
            .order('jornada', { ascending: false })
            .limit(300)
        ]);

        if (leagueRes.data?.nombre) setLeagueName(leagueRes.data.nombre);

        const groupClubIds = ((groupClubsRes.data || []) as { id: string }[]).map(c => String(c.id));

        const playedMatches = (playedMatchesRes.data || []) as MatchResult[];
        const currentSeason = playedMatches.reduce(
          (max, m) => Math.max(max, normalizeSeasonNumber(m.season_number)), 1
        );
        const seasonMatches = playedMatches.filter(
          (m) => normalizeSeasonNumber(m.season_number) === currentSeason
        );
        let sv = 0, sd = 0;
        for (const m of seasonMatches) {
          const isHome = String(m.home_team_id) === String(clubData.id);
          const mine = isHome ? m.home_score : m.away_score;
          const theirs = isHome ? m.away_score : m.home_score;
          if (mine > theirs) sv++; else sd++;
        }
        setSeasonStats({ pj: seasonMatches.length, v: sv, d: sd, pts: sv * 2 + sd });

        // Compute win/loss streak from most-recent matches first (already ordered DESC)
        let streak = 0;
        if (playedMatches.length > 0) {
          const first = playedMatches[0];
          const fHome = String(first.home_team_id) === String(clubData.id);
          const fWon = (fHome ? first.home_score : first.away_score) > (fHome ? first.away_score : first.home_score);
          streak = fWon ? 1 : -1;
          for (let i = 1; i < playedMatches.length; i++) {
            const m = playedMatches[i];
            const isH = String(m.home_team_id) === String(clubData.id);
            const won = (isH ? m.home_score : m.away_score) > (isH ? m.away_score : m.home_score);
            if (won === fWon) { streak += fWon ? 1 : -1; } else { break; }
          }
        }
        setWinStreak(streak);

        if (groupClubIds.length > 1) {
          const { data: groupMatchesData } = await supabase
            .from('matches')
            .select('home_team_id,away_team_id,home_score,away_score,season_number')
            .eq('played', true)
            .in('home_team_id', groupClubIds)
            .in('away_team_id', groupClubIds)
            .limit(500);

          const standings = new Map<string, { v: number; pts: number }>();
          for (const id of groupClubIds) standings.set(id, { v: 0, pts: 0 });

          for (const m of (groupMatchesData || []) as MatchResult[]) {
            if (normalizeSeasonNumber(m.season_number) !== currentSeason) continue;
            const homeWon = m.home_score > m.away_score;
            const h = standings.get(String(m.home_team_id));
            const a = standings.get(String(m.away_team_id));
            if (h) { if (homeWon) { h.v++; h.pts += 2; } else { h.pts += 1; } }
            if (a) { if (!homeWon) { a.v++; a.pts += 2; } else { a.pts += 1; } }
          }

          const sorted = [...standings.entries()].sort(([, a], [, b]) => b.pts - a.pts || b.v - a.v);
          const pos = sorted.findIndex(([id]) => id === String(clubData.id)) + 1;
          if (pos > 0) setLeaguePosition({ pos, total: groupClubIds.length });
        }

        const { data: matches } = await supabase
          .from('matches')
          .select('jornada,season_number,home_team_id,away_team_id,played')
          .eq('played', false)
          .or(`home_team_id.eq.${clubData.id},away_team_id.eq.${clubData.id}`)
          .order('season_number', { ascending: false })
          .order('jornada', { ascending: true })
          .limit(1);

        const next = matches?.[0];
        if (next) {
          const rivalId = next.home_team_id === clubData.id ? next.away_team_id : next.home_team_id;
          const { data: rival } = await supabase.from('clubes').select('nombre').eq('id', rivalId).maybeSingle();
          setNextMatch({
            jornada: next.jornada,
            rival: rival?.nombre || 'Rival por confirmar',
            isHome: next.home_team_id === clubData.id
          });
        }

        // Build inbox items, activity feed and flash opportunity in parallel
        const [lastMatchRes, playersRes, feedData, flashData] = await Promise.all([
          supabase
            .from('matches')
            .select('id,jornada,season_number,home_team_id,away_team_id,home_score,away_score')
            .eq('played', true)
            .or(`home_team_id.eq.${clubData.id},away_team_id.eq.${clubData.id}`)
            .order('season_number', { ascending: false })
            .order('jornada', { ascending: false })
            .limit(1),
          supabase
            .from('players')
            .select('id,name,stamina,entrenos_semanales')
            .eq('team_id', String(clubData.id)),
          fetchActivityFeed(supabase, clubData.id, 10),
          fetchActiveFlashOpportunity(supabase).catch(() => null)
        ]);

        setActivityFeed(feedData);
        setFlashOpportunity(flashData);

        const inbox: InboxItem[] = [];

        const lastMatch = lastMatchRes.data?.[0];
        if (lastMatch) {
          const isHome = String(lastMatch.home_team_id) === String(clubData.id);
          const myScore = isHome ? (lastMatch.home_score ?? 0) : (lastMatch.away_score ?? 0);
          const rivalScore = isHome ? (lastMatch.away_score ?? 0) : (lastMatch.home_score ?? 0);
          const rivalId = isHome ? lastMatch.away_team_id : lastMatch.home_team_id;
          const { data: rivalClub } = await supabase.from('clubes').select('nombre').eq('id', rivalId).maybeSingle();
          const won = myScore > rivalScore;
          inbox.push({
            id: 'last_match',
            type: won ? 'win' : 'loss',
            title: won ? `Victoria en Jornada ${lastMatch.jornada}` : `Derrota en Jornada ${lastMatch.jornada}`,
            body: `${myScore}–${rivalScore} ${won ? 'ante' : 'contra'} ${rivalClub?.nombre ?? 'Rival'}`,
            href: `/match?matchId=${lastMatch.id}`
          });
        }

        const players = playersRes.data ?? [];
        const lowStamina = players.filter(p => (p.stamina ?? 100) < 30);
        if (lowStamina.length > 0) {
          const preview = lowStamina.slice(0, 2).map(p => p.name).join(', ');
          const tail = lowStamina.length > 2 ? ` y ${lowStamina.length - 2} más` : '';
          inbox.push({
            id: 'stamina',
            type: 'warning',
            title: `${lowStamina.length} jugador${lowStamina.length > 1 ? 'es' : ''} agotado${lowStamina.length > 1 ? 's' : ''}`,
            body: `${preview}${tail} necesitan fisioterapia`,
            href: '/training',
            urgent: true
          });
        }

        const readyToTrain = players.filter(p => (p.entrenos_semanales ?? 0) === 0 && (p.stamina ?? 100) >= 25);
        if (readyToTrain.length > 0) {
          inbox.push({
            id: 'training',
            type: 'info',
            title: `${readyToTrain.length} jugador${readyToTrain.length > 1 ? 'es' : ''} listo${readyToTrain.length > 1 ? 's' : ''} para entrenar`,
            body: 'Tienes entrenamientos semanales disponibles',
            href: '/training'
          });
        }

        if ((clubData.presupuesto ?? 0) < 50000) {
          const fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
          inbox.push({
            id: 'budget',
            type: 'warning',
            title: 'Presupuesto bajo',
            body: `Solo ${fmt.format(clubData.presupuesto ?? 0)} en caja`,
            href: '/finance',
            urgent: (clubData.presupuesto ?? 0) < 20000
          });
        }

        setInboxItems(inbox);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [router]);

  const renderFlashStat = (player: NonNullable<FlashOpportunity['player']>, statName: string) => {
    const val = (player as any)[statName] as number ?? 50;
    const d = getStatDisplay(player.id, statName, val, talentoOjo, ojeos);
    if (d.type === 'scouted') return <span className="font-mono font-bold text-[11px] text-green-400">{d.value}</span>;
    if (d.type === 'exact')   return <span className="font-mono font-bold text-[11px] text-white">{d.value}</span>;
    if (d.type === 'range')   return <span className="font-mono font-bold text-[11px] text-orange-400">{d.min}-{d.max}</span>;
    return <span className="font-mono font-bold text-[11px] text-slate-600 animate-pulse">???</span>;
  };

  const claimFlash = async () => {
    if (!flashOpportunity || claimingFlash) return;
    setClaimingFlash(true);
    setFlashMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sin sesión');
      const res = await fetch('/api/flash-market/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ opportunityId: flashOpportunity.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
      setFlashOpportunity(null);
      setFlashMessage('✅ Fichaje completado. Revisa tu plantilla.');
    } catch (err: any) {
      setFlashMessage(`❌ ${err.message}`);
    } finally {
      setClaimingFlash(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <Activity className="text-cyan-500 animate-pulse w-12 h-12 mb-4" />
        <p className="text-slate-500 font-mono text-xs uppercase tracking-widest">Cargando Despacho...</p>
      </div>
    );
  }

  if (!manager || !club) return null;

  const formatMoney = (value: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value || 0);

  const cards = [
    { href: '/roster', title: 'Plantilla', subtitle: 'Jugadores y roles', icon: Shield, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
    { href: '/tactics', title: 'Pizarra', subtitle: 'Quintetos y rotación', icon: Users, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
    { href: '/market', title: 'Mercado', subtitle: 'Fichajes y agentes', icon: DollarSign, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
    { href: '/training', title: 'Training', subtitle: 'Mejora atributos', icon: Dumbbell, color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
    { href: '/calendar', title: 'Calendario', subtitle: 'Próximos partidos', icon: Calendar, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
    { href: '/finance', title: 'Finanzas', subtitle: 'Caja y costes', icon: LineChart, color: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/30' }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 relative overflow-hidden">
      <div
        className="absolute top-[-10%] right-[-5%] w-96 h-96 rounded-full blur-[120px] pointer-events-none opacity-20"
        style={{ backgroundColor: club.color_primario || '#0ea5e9' }}
      ></div>
      <div className="absolute -bottom-28 -left-20 w-[28rem] h-[28rem] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-6xl mx-auto relative z-10">
        <header className="mb-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-slate-900/70 border border-slate-800 rounded-3xl p-6 md:p-8">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-start">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] font-black text-slate-500">Panel de club</p>
                <h1 className="mt-2 text-3xl md:text-5xl font-black tracking-tight text-white">{club.nombre}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-wider text-slate-300">
                  <span className="inline-flex items-center gap-1 bg-slate-950/80 border border-slate-700 px-3 py-1 rounded-full">
                    <Star size={13} className="text-yellow-400" /> Nivel Mánager {manager.nivel}
                  </span>
                  <span className="inline-flex items-center gap-1 bg-slate-950/80 border border-slate-700 px-3 py-1 rounded-full">
                    <Trophy size={13} className="text-cyan-400" /> {leagueName}
                  </span>
                  {leaguePosition && (
                    <span className="inline-flex items-center gap-1 bg-slate-950/80 border border-slate-700 px-3 py-1 rounded-full">
                      <Trophy size={13} className="text-yellow-400" /> {leaguePosition.pos}º de {leaguePosition.total}
                    </span>
                  )}
                  {winStreak >= 3 && (
                    <span className="inline-flex items-center gap-1.5 bg-orange-500/15 border border-orange-500/40 px-3 py-1 rounded-full text-orange-300 animate-pulse">
                      🔥 {winStreak} seguidas
                    </span>
                  )}
                  {winStreak <= -3 && (
                    <span className="inline-flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 px-3 py-1 rounded-full text-red-400">
                      ⚠️ {Math.abs(winStreak)} derrotas seguidas
                    </span>
                  )}
                </div>
              </div>

              <div className="relative mx-auto md:mx-0 md:mr-2">
                <div
                  className="absolute -inset-4 rounded-[2rem] blur-2xl opacity-40"
                  style={{ backgroundColor: club.color_primario || '#0ea5e9' }}
                ></div>
                <div className="relative w-32 h-32 md:w-40 md:h-40 rounded-[2rem] border border-slate-700 bg-slate-950/85 p-5 shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
                  {club.escudo_url ? (
                    <img src={club.escudo_url} alt={club.nombre} className="w-full h-full object-contain drop-shadow-lg" />
                  ) : (
                    <EscudoSVG forma={club.escudo_forma} color={club.color_primario} className="w-full h-full drop-shadow-lg" />
                  )}
                </div>
                <p className="text-center mt-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Escudo Oficial</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 md:grid-cols-5 gap-3">
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 col-span-1 md:col-span-1">
                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">Presupuesto</div>
                <div className="text-green-400 font-mono font-black text-sm mt-1">{formatMoney(club.presupuesto || 0)}</div>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">PJ</div>
                <div className="text-white font-black text-lg mt-1">{seasonStats.pj}</div>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">V-D</div>
                <div className="text-white font-black text-lg mt-1">{seasonStats.v}-{seasonStats.d}</div>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">PTS</div>
                <div className="text-cyan-300 font-black text-lg mt-1">{seasonStats.pts}</div>
              </div>
              <div className={`border rounded-xl p-3 transition-colors ${
                winStreak >= 3 ? 'bg-orange-500/10 border-orange-500/40' :
                winStreak <= -3 ? 'bg-red-500/10 border-red-500/30' :
                'bg-slate-950/70 border-slate-800'
              }`}>
                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">Racha</div>
                <div className={`font-black text-lg mt-1 ${
                  winStreak >= 3 ? 'text-orange-300' :
                  winStreak <= -3 ? 'text-red-400' :
                  winStreak > 0 ? 'text-white' : 'text-slate-400'
                }`}>
                  {winStreak === 0 ? '–' :
                   winStreak > 0 ? `🔥${winStreak}V` :
                   `❄️${Math.abs(winStreak)}D`}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 bg-slate-900/70 border border-slate-800 rounded-3xl p-6 flex flex-col">
            <p className="text-[10px] uppercase tracking-[0.22em] font-black text-slate-500">Próximo paso</p>
            {nextMatch ? (
              <>
                <h3 className="text-xl font-black text-white mt-2">Jornada {nextMatch.jornada}</h3>
                <p className="text-slate-300 mt-1">
                  {nextMatch.isHome ? 'Local vs ' : 'Visitante en '}<span className="font-bold text-white">{nextMatch.rival}</span>
                </p>
                <Link href="/calendar" className="mt-5 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-black uppercase tracking-widest transition-colors">
                  <PlayCircle size={14} /> Preparar Partido
                </Link>
              </>
            ) : (
              <>
                <h3 className="text-xl font-black text-white mt-2">Sin partido asignado</h3>
                <p className="text-slate-400 mt-1 text-sm">Revisa el calendario o genera la jornada desde administración.</p>
                <Link href="/calendar" className="mt-5 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black uppercase tracking-widest transition-colors">
                  <Calendar size={14} /> Ver Calendario
                </Link>
              </>
            )}
          </div>
        </header>

        {(flashOpportunity || flashMessage) && (
          <section className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-3xl p-5 md:p-6">
            <div className="flex items-center gap-2 mb-1">
              <Flame size={16} className="text-amber-400" />
              <span className="text-amber-300 text-[10px] font-black uppercase tracking-widest">Oportunidad Flash · {flashOpportunity ? getTimeRemaining(flashOpportunity.expires_at).label : ''}</span>
            </div>
            {flashMessage ? (
              <p className="text-sm font-bold text-white mt-2">{flashMessage}</p>
            ) : flashOpportunity?.player && (
              <div className="mt-3 flex flex-col lg:flex-row gap-5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-4">
                    <div className="h-14 w-14 shrink-0 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col items-center justify-center font-black text-amber-300">
                      <span className="text-lg leading-none">{getOverallDisplay(flashOpportunity.player.id, flashOpportunity.player.overall, talentoOjo, ojeos)}</span>
                      <span className="text-[8px] uppercase tracking-widest text-amber-500/60 mt-0.5">OVR</span>
                    </div>
                    <div>
                      <p className="text-white font-black text-lg leading-tight">{flashOpportunity.player.name}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{flashOpportunity.player.position} · {flashOpportunity.player.age}A · {flashOpportunity.player.nationality}</p>
                      <div className="flex items-baseline gap-2 mt-1.5">
                        <span className="text-amber-300 font-black text-base font-mono">{new Intl.NumberFormat('es-ES').format(flashOpportunity.flash_price)} €</span>
                        <span className="text-slate-500 line-through text-xs font-mono">{new Intl.NumberFormat('es-ES').format(flashOpportunity.original_price)} €</span>
                        <span className="text-green-400 text-[10px] font-black">−35%</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-1.5">
                    {SCOUT_STATS.map(stat => (
                      <div key={stat} className="bg-black/30 rounded-lg px-2 py-1.5 flex flex-col items-center gap-0.5">
                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">{SCOUT_STAT_LABELS[stat]}</span>
                        {renderFlashStat(flashOpportunity.player!, stat)}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex lg:flex-col justify-end gap-2 lg:gap-3 shrink-0">
                  <button
                    onClick={claimFlash}
                    disabled={claimingFlash}
                    className="px-5 py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-black uppercase text-xs tracking-widest rounded-xl transition-all flex items-center gap-2"
                  >
                    <Flame size={14} />
                    {claimingFlash ? 'Fichando...' : 'Fichar Ahora'}
                  </button>
                  <Link href="/market" className="px-5 py-3 border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 font-black uppercase text-xs tracking-widest rounded-xl transition-all text-center">
                    Ver Mercado
                  </Link>
                </div>
              </div>
            )}
          </section>
        )}

        {inboxItems.length > 0 && (
          <section className="mb-6 bg-slate-900/60 border border-slate-800 rounded-3xl p-5 md:p-6">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-white text-lg font-black tracking-tight">Bandeja de Entrada</h2>
              <span className="bg-cyan-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full leading-none">
                {inboxItems.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {inboxItems.map(item => {
                const typeStyles = {
                  win:     { border: 'border-l-green-500',  icon: <TrendingUp size={15} className="text-green-400 shrink-0" />,    bg: '' },
                  loss:    { border: 'border-l-red-500',    icon: <TrendingDown size={15} className="text-red-400 shrink-0" />,    bg: '' },
                  warning: { border: item.urgent ? 'border-l-red-500' : 'border-l-orange-500', icon: <AlertTriangle size={15} className={item.urgent ? 'text-red-400 shrink-0' : 'text-orange-400 shrink-0'} />, bg: item.urgent ? 'bg-red-500/5' : '' },
                  info:    { border: 'border-l-cyan-500',   icon: <Info size={15} className="text-cyan-400 shrink-0" />,           bg: '' },
                };
                const s = typeStyles[item.type];
                const inner = (
                  <div className={`flex items-center gap-3 border-l-2 ${s.border} ${s.bg} pl-3 pr-2 py-2 rounded-r-xl`}>
                    {s.icon}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-bold leading-tight">{item.title}</p>
                      <p className="text-slate-400 text-xs leading-tight mt-0.5 truncate">{item.body}</p>
                    </div>
                    {item.href && <ArrowRight size={13} className="text-slate-500 shrink-0" />}
                  </div>
                );
                return item.href
                  ? <Link key={item.id} href={item.href} className="hover:bg-slate-800/40 rounded-xl transition-colors">{inner}</Link>
                  : <div key={item.id}>{inner}</div>;
              })}
            </div>
          </section>
        )}

        {activityFeed.length > 0 && (
          <section className="mb-6 bg-slate-900/60 border border-slate-800 rounded-3xl p-5 md:p-6">
            <h2 className="text-white text-lg font-black tracking-tight mb-4">Actividad Reciente</h2>
            <div className="flex flex-col gap-1.5">
              {activityFeed.map(event => {
                const meta = ACTIVITY_META[event.type];
                const inner = (
                  <div className={`flex items-center gap-3 border-l-2 ${meta.border} pl-3 pr-2 py-2 rounded-r-xl`}>
                    <span className="text-base shrink-0 leading-none">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`${meta.color} text-xs font-bold leading-tight`}>{event.title}</p>
                      {event.body && <p className="text-slate-400 text-xs leading-tight mt-0.5 truncate">{event.body}</p>}
                    </div>
                    <span className="text-slate-600 text-[10px] shrink-0 font-mono tabular-nums">
                      {formatRelativeTime(event.created_at)}
                    </span>
                  </div>
                );
                return event.href
                  ? <Link key={event.id} href={event.href} className="hover:bg-slate-800/40 rounded-xl transition-colors">{inner}</Link>
                  : <div key={event.id}>{inner}</div>;
              })}
            </div>
          </section>
        )}

        <section className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white text-lg md:text-xl font-black tracking-tight">Centro de Operaciones</h2>
            <Link href="/exhibition" className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-cyan-300 hover:text-cyan-200">
              Exhibition <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {cards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 transition-all"
              >
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${card.color}`}>
                  <card.icon size={18} />
                </div>
                <h3 className="mt-3 text-white font-black uppercase tracking-widest text-xs">{card.title}</h3>
                <p className="mt-1 text-slate-400 text-xs">{card.subtitle}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/leagues" className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-5 hover:border-cyan-500/30 transition-all">
            <div className="flex items-center gap-2 text-cyan-300 text-[11px] font-black uppercase tracking-widest">
              <Trophy size={14} /> Clasificación
            </div>
            <p className="text-white font-bold text-lg mt-2">Consulta tu posición y objetivos de ascenso</p>
          </Link>
          <Link href="/manager" className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-5 hover:border-cyan-500/30 transition-all">
            <div className="flex items-center gap-2 text-cyan-300 text-[11px] font-black uppercase tracking-widest">
              <Users size={14} /> Perfil de Manager
            </div>
            <p className="text-white font-bold text-lg mt-2">Personaliza club, escudo y estrategia global</p>
          </Link>
        </section>
      </div>
    </div>
  );
}
