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
import { ShoppingCart as MarketIcon, DollarSign as CashIcon, ArrowLeft as BackIcon, UserPlus as BuyIcon, Eye, Search, CheckCircle2, Gavel, Tag, Clock, RefreshCw, X, AlertTriangle, PackageOpen } from 'lucide-react';
import { computeMinBid, getTimeRemaining, AUCTION_DURATION_DAYS, type MarketListingWithPlayer } from '@/lib/player-market';
import { getShuffledStats, getStatInterval, getMissingStats, getOverallDisplay, getStatDisplay, SCOUT_STATS, getPositionBadge } from '@/lib/scouting-display';
import { formaToStars, FORMA_STAR_COLORS, FORMA_STAR_LABELS } from '@/lib/player-forma';
import { isPlayerInjured } from '@/lib/player-injuries';
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

const ALL_STATS = [...SCOUT_STATS];
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

  // Auction state
  type MarketTab = 'free' | 'auctions' | 'my_sales';
  const [marketTab, setMarketTab] = useState<MarketTab>('free');
  const [auctions, setAuctions] = useState<MarketListingWithPlayer[]>([]);
  const [myListings, setMyListings] = useState<MarketListingWithPlayer[]>([]);
  const [sellableRoster, setSellableRoster] = useState<Player[]>([]);
  const [bidListing, setBidListing] = useState<MarketListingWithPlayer | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [bidLoading, setBidLoading] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);
  const [listModal, setListModal] = useState(false);
  const [listPlayer, setListPlayer] = useState<Player | null>(null);
  const [listPrice, setListPrice] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null); 

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

    // Load auctions
    if (teamData) {
      const { data: allListings } = await supabase
        .from('market_listings')
        .select(`
          *,
          player:players(id, name, age, position, nationality, shooting_3pt, shooting_2pt,
            defense, rebounding, passing, dribbling, speed, stamina, experience, forma, injured_until),
          seller:clubes!market_listings_seller_team_id_fkey(nombre),
          buyer:clubes!market_listings_buyer_team_id_fkey(nombre)
        `)
        .eq('status', 'active')
        .order('ends_at', { ascending: true });

      const enriched = ((allListings ?? []) as any[]).map((row) => ({
        ...row,
        seller_name: row.seller?.nombre ?? 'Desconocido',
        buyer_name: row.buyer?.nombre ?? null
      })) as MarketListingWithPlayer[];

      setAuctions(enriched.filter((l) => l.seller_team_id !== teamData.id));
      setMyListings(enriched.filter((l) => l.seller_team_id === teamData.id));

      const listedIds = new Set(enriched.map((l) => l.player_id));
      const { data: roster } = await supabase.from('players').select('*').eq('team_id', teamData.id);
      setSellableRoster(
        ((roster ?? []) as any[])
          .filter((p: any) => !listedIds.has(p.id))
          .map((p: any) => ({
            ...p,
            position: getBestRoleForPlayer(p, dynamicPositionConfig),
            overall: calculateRealOverall(p, dynamicPositionConfig)
          }))
      );
    }
  }, [router]);

  useEffect(() => {
    loadMarketData();
  }, [loadMarketData]);

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const fmt = (n: number) => new Intl.NumberFormat('es-ES').format(n);

  const openBid = (listing: MarketListingWithPlayer) => {
    setBidListing(listing);
    setBidAmount(String(computeMinBid(listing.current_price)));
    setBidError(null);
  };

  const getAuthHeader = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {};
  };

  const submitBid = async () => {
    if (!bidListing) return;
    setBidLoading(true);
    setBidError(null);
    try {
      const amount = Number(String(bidAmount).replace(/\D/g, ''));
      const authHeader = await getAuthHeader();
      const res = await fetch('/api/market/bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ listingId: bidListing.id, amount })
      });
      const json = await res.json();
      if (!res.ok) { setBidError(json.error); return; }
      if (myTeam) setMyTeam({ ...myTeam, cash: json.newBudget });
      setBidListing(null);
      showMsg('✅ Puja registrada');
      loadMarketData();
    } finally {
      setBidLoading(false);
    }
  };

  const submitList = async () => {
    if (!listPlayer) return;
    setListLoading(true);
    setListError(null);
    try {
      const price = Number(String(listPrice).replace(/\D/g, ''));
      const authHeader = await getAuthHeader();
      const res = await fetch('/api/market/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ playerId: listPlayer.id, startingPrice: price })
      });
      const json = await res.json();
      if (!res.ok) { setListError(json.error); return; }
      setListModal(false);
      setListPlayer(null);
      setListPrice('');
      showMsg(`✅ ${listPlayer.name} publicado en subastas`);
      loadMarketData();
    } finally {
      setListLoading(false);
    }
  };

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

      // Award XP for signing — fire and forget
      if (ownerId) {
        const XP_SIGNING = 30;
        void Promise.resolve(
          supabase.from('managers')
            .select('id, nivel, xp, xp_siguiente, puntos_talento')
            .eq('owner_id', ownerId)
            .maybeSingle()
        ).then(({ data: mgr }) => {
          if (!mgr) return;
          let xp = Number((mgr as any).xp ?? 0) + XP_SIGNING;
          let nivel = Number((mgr as any).nivel ?? 1);
          let xpSiguiente = Number((mgr as any).xp_siguiente ?? nivel * nivel * 400);
          let puntos_talento = Number((mgr as any).puntos_talento ?? 0);
          while (xp >= xpSiguiente) {
            xp -= xpSiguiente;
            nivel++;
            puntos_talento++;
            xpSiguiente = nivel * nivel * 400;
          }
          return supabase.from('managers').update({ xp, nivel, xp_siguiente: xpSiguiente, puntos_talento }).eq('id', (mgr as any).id);
        }).catch(() => {});
      }
    } catch (error) {
      console.error(error);
      setMessage(`❌ No se pudo completar el fichaje: ${errText(error)}`);
    } finally {
      setLoadingId(null);
      setTimeout(() => setMessage(null), 2000);
    }
  };

  const getMissingStatsForPlayer = (playerId: number) => getMissingStats(playerId, talentoOjo, ojeos);

  const handleScoutPlayer = async (playerId: number) => {
    if (!myTeam || !ownerId) return;
    if (myTeam.cash < SCOUT_COST) { alert("❌ Fondos insuficientes."); return; }
    
    const missing = getMissingStatsForPlayer(playerId);
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
      const d = getStatDisplay(player.id, statName, val, talentoOjo, ojeos);
      if (d.type === 'scouted') return <div className="font-mono font-bold text-[10px] text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.4)] whitespace-nowrap">{d.value}</div>;
      if (d.type === 'exact') return <div className="font-mono font-bold text-[10px] text-white whitespace-nowrap">{d.value}</div>;
      if (d.type === 'range') return <div className="font-mono font-bold text-[10px] text-orange-400 drop-shadow-[0_0_5px_rgba(251,146,60,0.4)] whitespace-nowrap">{d.min}-{d.max}</div>;
      return <div className="font-mono font-bold text-[10px] text-slate-600/50 animate-pulse whitespace-nowrap">???</div>;
  };

  const getOverallDisplayForPlayer = (playerId: number, trueOverall: number) =>
      getOverallDisplay(playerId, trueOverall, talentoOjo, ojeos);

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

      {/* Tab switcher */}
      <div className="max-w-6xl mx-auto mb-6 relative z-10">
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-1.5 flex gap-2">
          <button onClick={() => setMarketTab('free')} className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${marketTab === 'free' ? 'bg-orange-500/20 border border-orange-500/40 text-orange-300' : 'text-slate-400 hover:text-white'}`}>
            Agentes Libres ({freeAgents.length})
          </button>
          <button onClick={() => setMarketTab('auctions')} className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${marketTab === 'auctions' ? 'bg-primary/20 border border-primary/40 text-primary' : 'text-slate-400 hover:text-white'}`}>
            Subastas ({auctions.length})
          </button>
          <button onClick={() => setMarketTab('my_sales')} className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${marketTab === 'my_sales' ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300' : 'text-slate-400 hover:text-white'}`}>
            Mis Ventas ({myListings.length})
          </button>
        </div>
        {(marketTab === 'auctions' || marketTab === 'my_sales') && (
          <div className="flex justify-end mt-2">
            <button onClick={() => { setListModal(true); setListError(null); }} className="bg-primary hover:bg-primary/80 text-white font-black text-xs uppercase tracking-widest px-4 py-2 rounded-xl flex items-center gap-2 transition-colors">
              <Tag size={13} /> Poner jugador en venta
            </button>
          </div>
        )}
      </div>

      {/* Auctions tab */}
      {marketTab === 'auctions' && (
        <div className="max-w-6xl mx-auto relative z-10">
          {auctions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-600">
              <PackageOpen size={48} className="mb-4 opacity-40" />
              <p className="font-bold text-lg">No hay subastas activas</p>
              <p className="text-sm mt-1">Otros entrenadores aún no han puesto jugadores en venta</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {auctions.map((listing) => {
                const p = listing.player;
                const isHighestBidder = listing.buyer_team_id === myTeam?.id;
                const { expired } = getTimeRemaining(listing.ends_at);
                const minBid = computeMinBid(listing.current_price);
                const stars = formaToStars(p.forma);
                return (
                  <div key={listing.id} className={`bg-slate-900 border rounded-2xl p-4 flex flex-col gap-3 ${isHighestBidder ? 'border-green-500/40' : 'border-slate-800'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-sm">{p.name}</span>
                          {isPlayerInjured(p.injured_until) && (
                            <span className="inline-flex items-center gap-0.5 text-[8px] font-black bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded"><AlertTriangle size={8}/> LES.</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[9px] bg-slate-800 text-slate-400 uppercase font-black tracking-widest px-1.5 py-0.5 rounded">{p.position}</span>
                          <span className="text-[9px] text-slate-500">{p.age}a</span>
                          <span className={`text-[9px] font-black ${FORMA_STAR_COLORS[stars]}`}>{'★'.repeat(stars)} {FORMA_STAR_LABELS[stars]}</span>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border shrink-0 ${expired ? 'text-slate-500 border-slate-700' : 'text-amber-400 border-amber-500/30 bg-amber-500/10'}`}>
                        <Clock size={9} /> {getTimeRemaining(listing.ends_at).label}
                      </span>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {[['T3', p.shooting_3pt], ['T2', p.shooting_2pt], ['Def', p.defense], ['Reb', p.rebounding], ['Pas', p.passing], ['Bot', p.dribbling], ['Vel', p.speed]].map(([l, v]) => (
                        <div key={String(l)} className="flex flex-col items-center bg-slate-950 rounded-lg px-2 py-1 min-w-[36px]">
                          <span className="text-[7px] uppercase text-slate-500 font-black">{l}</span>
                          <span className="text-xs font-bold text-white">{v}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
                      <div>
                        <div className="text-[9px] text-slate-500 uppercase font-black">Puja actual</div>
                        <div className="text-base font-mono font-bold text-white">{fmt(listing.current_price)} €</div>
                        <div className="text-[9px] text-slate-500">
                          {isHighestBidder ? <span className="text-green-400">✅ Vas ganando</span> : listing.buyer_name ? `Líder: ${listing.buyer_name}` : 'Sin pujas'}
                        </div>
                        <div className="text-[9px] text-slate-600">Vendedor: {listing.seller_name}</div>
                      </div>
                      {!expired && (
                        <button onClick={() => openBid(listing)} className="bg-primary hover:bg-primary/80 text-white font-black text-xs uppercase tracking-widest px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors">
                          <Gavel size={13} /> Pujar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* My sales tab */}
      {marketTab === 'my_sales' && (
        <div className="max-w-6xl mx-auto relative z-10">
          {myListings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-600">
              <Gavel size={48} className="mb-4 opacity-40" />
              <p className="font-bold text-lg">No tienes jugadores en subasta</p>
              <button onClick={() => { setListModal(true); setListError(null); }} className="mt-4 text-primary text-sm font-bold hover:underline">Publicar jugador →</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myListings.map((listing) => {
                const p = listing.player;
                const { label } = getTimeRemaining(listing.ends_at);
                const stars = formaToStars(p.forma);
                return (
                  <div key={listing.id} className="bg-slate-900 border border-purple-500/30 rounded-2xl p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold text-white text-sm">{p.name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] bg-slate-800 text-slate-400 uppercase font-black tracking-widest px-1.5 py-0.5 rounded">{p.position}</span>
                          <span className="text-[9px] text-slate-500">{p.age}a</span>
                          <span className={`text-[9px] font-black ${FORMA_STAR_COLORS[stars]}`}>{'★'.repeat(stars)}</span>
                        </div>
                      </div>
                      <span className="text-[9px] text-amber-400 font-black flex items-center gap-1"><Clock size={9}/>{label}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-white/5">
                      <div>
                        <div className="text-[9px] text-slate-500 uppercase font-black">Puja actual</div>
                        <div className="text-base font-mono font-bold text-white">{fmt(listing.current_price)} €</div>
                        {listing.buyer_name && <div className="text-[9px] text-green-400 font-bold">Mejor puja: {listing.buyer_name}</div>}
                      </div>
                      <div className="text-[9px] text-slate-500 font-bold text-right">
                        {listing.buyer_team_id ? 'Con pujas' : 'Sin pujas aún'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* BID MODAL */}
      {bidListing && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-black text-white flex items-center gap-2"><Gavel size={20} className="text-primary"/> Realizar puja</h2>
              <button onClick={() => setBidListing(null)} className="text-slate-400 hover:text-white"><X size={20}/></button>
            </div>
            <div className="bg-slate-950 rounded-2xl p-4 mb-4 space-y-1.5 text-xs">
              <div className="font-bold text-white text-sm">{bidListing.player.name} · {bidListing.player.position} · {bidListing.player.age}a</div>
              <div className="flex justify-between"><span className="text-slate-500">Puja actual</span><span className="font-mono font-bold text-white">{fmt(bidListing.current_price)} €</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Puja mínima</span><span className="font-mono font-bold text-amber-400">{fmt(computeMinBid(bidListing.current_price))} €</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Tu presupuesto</span><span className="font-mono font-bold text-emerald-400">{fmt(myTeam?.cash ?? 0)} €</span></div>
            </div>
            <label className="block text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1">Tu puja (€)</label>
            <input type="number" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} min={computeMinBid(bidListing.current_price)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-lg focus:outline-none focus:border-primary mb-3" />
            {bidError && <p className="text-red-400 text-sm mb-3">{bidError}</p>}
            <button onClick={submitBid} disabled={bidLoading} className="w-full bg-primary hover:bg-primary/80 disabled:opacity-50 text-white font-black text-sm uppercase tracking-widest py-3 rounded-xl transition-colors">
              {bidLoading ? 'Enviando...' : `Pujar ${bidAmount ? fmt(Number(bidAmount)) : '—'} €`}
            </button>
            <p className="text-[9px] text-slate-500 mt-2 text-center">La puja se reserva de tu presupuesto. Si te superan, recibes el reembolso.</p>
          </div>
        </div>
      )}

      {/* LIST PLAYER MODAL */}
      {listModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-lg p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-black text-white flex items-center gap-2"><Tag size={20} className="text-primary"/> Poner en subasta</h2>
              <button onClick={() => setListModal(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
            </div>
            <div className="overflow-y-auto flex-1 space-y-2 mb-4 pr-1">
              {sellableRoster.length === 0
                ? <p className="text-slate-500 text-sm text-center py-8">No tienes jugadores disponibles</p>
                : sellableRoster.map((p) => (
                  <button key={p.id} onClick={() => setListPlayer(listPlayer?.id === p.id ? null : p)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${listPlayer?.id === p.id ? 'bg-primary/10 border-primary/50' : 'bg-slate-950 border-slate-800 hover:border-slate-600'}`}>
                    <div className="text-2xl">🏀</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white text-sm truncate">{p.name}</div>
                      <div className="text-[9px] text-slate-400">{p.position} · {p.age}a · Stamina {p.stamina}%</div>
                    </div>
                  </button>
                ))
              }
            </div>
            {listPlayer && (
              <div className="border-t border-white/10 pt-4">
                <label className="block text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1">Precio de salida (€)</label>
                <input type="number" value={listPrice} onChange={(e) => setListPrice(e.target.value)} placeholder="Ej: 500000"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-lg focus:outline-none focus:border-primary mb-3" />
                {listError && <p className="text-red-400 text-sm mb-3">{listError}</p>}
                <button onClick={submitList} disabled={listLoading || !listPrice}
                  className="w-full bg-primary hover:bg-primary/80 disabled:opacity-50 text-white font-black text-sm uppercase tracking-widest py-3 rounded-xl transition-colors">
                  {listLoading ? 'Publicando...' : `Publicar ${listPlayer.name} · ${AUCTION_DURATION_DAYS} días`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FREE AGENTS grid — only shown on free tab */}
      {marketTab === 'free' && <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10">
        {freeAgents.map(player => {
            const missingStats = getMissingStatsForPlayer(player.id);
            const isFullyScouted = missingStats.length === 0;
            const posBadge = getPositionBadge(player.position);

            return (
            <div key={player.id} className={`relative bg-gradient-to-b from-slate-900 to-slate-950 border rounded-3xl overflow-hidden transition-all duration-300 flex flex-col h-full group ${isFullyScouted ? 'border-green-500/50 shadow-[0_10px_30px_rgba(34,197,94,0.1)] hover:border-green-400' : 'border-white/10 shadow-xl hover:border-orange-500/50 hover:shadow-[0_10px_30px_rgba(234,88,12,0.15)] hover:-translate-y-1'}`}>

                <div className="p-6 flex gap-5 items-center relative z-10">
                    {isFullyScouted && <div className="absolute top-4 right-4 bg-green-500/20 border border-green-500/50 text-green-400 text-[8px] font-black px-2 py-1 rounded-md uppercase tracking-widest flex items-center gap-1"><CheckCircle2 size={10}/> Reporte Full</div>}

                    <div className={`h-16 w-16 shrink-0 rounded-2xl flex flex-col items-center justify-center border-2 shadow-inner ${posBadge.bg} ${posBadge.border}`}>
                        <span className={`text-2xl font-black leading-none ${posBadge.text}`}>{posBadge.abbr}</span>
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{player.position}</span>
                    </div>

                    <div className="flex-1 overflow-hidden">
                        <h3 className="font-black italic text-white text-xl leading-tight truncate uppercase tracking-tight">{player.name}</h3>
                        <div className="flex gap-2 mt-2 items-center">
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
      </div>}
    </div>
  );
}
