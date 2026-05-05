import type { SupabaseClient } from '@supabase/supabase-js';
import { insertActivity } from '@/lib/activity-feed';

export const AUCTION_DURATION_DAYS = 3;
export const MIN_BID_INCREMENT_ABS = 10_000;
export const MIN_BID_INCREMENT_PERCENT = 0.05;

export type MarketListing = {
  id: number;
  player_id: number;
  seller_team_id: string;
  starting_price: number;
  current_price: number;
  buyer_team_id: string | null;
  ends_at: string;
  status: 'active' | 'sold' | 'expired';
  created_at: string;
};

export type MarketListingWithPlayer = MarketListing & {
  player: {
    id: number;
    name: string;
    age: number;
    position: string;
    nationality: string;
    shooting_3pt: number;
    shooting_2pt: number;
    defense: number;
    rebounding: number;
    passing: number;
    dribbling: number;
    speed: number;
    stamina: number;
    experience: number;
    forma: number;
    injured_until: string | null;
  };
  seller_name: string;
  buyer_name: string | null;
};

export const computeMinBid = (currentPrice: number): number => {
  const pctIncrement = Math.ceil(currentPrice * MIN_BID_INCREMENT_PERCENT);
  return currentPrice + Math.max(pctIncrement, MIN_BID_INCREMENT_ABS);
};

export const getTimeRemaining = (endsAt: string): { expired: boolean; label: string } => {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return { expired: true, label: 'Finalizada' };
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) {
    const mins = Math.floor(diff / 60_000);
    return { expired: false, label: `${mins}m` };
  }
  if (hours < 24) return { expired: false, label: `${hours}h` };
  const days = Math.floor(hours / 24);
  return { expired: false, label: `${days}d ${hours % 24}h` };
};

export const fetchActiveListings = async (
  supabase: SupabaseClient,
  myTeamId?: string
): Promise<MarketListingWithPlayer[]> => {
  const { data, error } = await supabase
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

  if (error || !data) return [];

  return (data as any[]).map((row) => ({
    ...row,
    seller_name: row.seller?.nombre ?? 'Desconocido',
    buyer_name: row.buyer?.nombre ?? null
  }));
};

export const closeExpiredAuctions = async (
  supabaseAdmin: SupabaseClient
): Promise<{ closed: number; errors: string[] }> => {
  const now = new Date().toISOString();
  const errors: string[] = [];

  const { data: expired, error: fetchError } = await supabaseAdmin
    .from('market_listings')
    .select('*')
    .eq('status', 'active')
    .lte('ends_at', now);

  if (fetchError || !expired) return { closed: 0, errors: [fetchError?.message ?? 'fetch failed'] };

  let closed = 0;

  for (const listing of expired as MarketListing[]) {
    try {
      if (listing.buyer_team_id) {
        const { data: playerData } = await supabaseAdmin
          .from('players')
          .select('name')
          .eq('id', listing.player_id)
          .maybeSingle();
        const playerName = (playerData as any)?.name ?? `Jugador #${listing.player_id}`;

        // Transfer player to winner
        const { error: playerError } = await supabaseAdmin
          .from('players')
          .update({ team_id: listing.buyer_team_id })
          .eq('id', listing.player_id);
        if (playerError) throw playerError;

        // Add sale proceeds to seller
        const { data: seller } = await supabaseAdmin
          .from('clubes')
          .select('presupuesto')
          .eq('id', listing.seller_team_id)
          .single();
        if (seller) {
          await supabaseAdmin
            .from('clubes')
            .update({ presupuesto: seller.presupuesto + listing.current_price })
            .eq('id', listing.seller_team_id);

          await supabaseAdmin.from('finance_transactions').insert({
            team_id: listing.seller_team_id,
            concepto: `Venta jugador (mercado) — ID ${listing.player_id}`,
            monto: listing.current_price,
            tipo: 'INGRESO',
            fecha: now
          });
        }

        await supabaseAdmin
          .from('market_listings')
          .update({ status: 'sold' })
          .eq('id', listing.id);

        const fmt = new Intl.NumberFormat('es-ES');
        const priceStr = `${fmt.format(listing.current_price)} €`;
        await insertActivity(supabaseAdmin, [
          {
            team_id: listing.buyer_team_id,
            type: 'market_won' as const,
            title: `Subasta ganada: ${playerName}`,
            body: `Fichado por ${priceStr}`,
            href: '/roster'
          },
          {
            team_id: listing.seller_team_id,
            type: 'market_sold' as const,
            title: `Jugador vendido: ${playerName}`,
            body: `Venta por ${priceStr}`,
            href: '/finance'
          }
        ]).catch(() => {});
      } else {
        // No bids — listing expires, player stays with seller
        await supabaseAdmin
          .from('market_listings')
          .update({ status: 'expired' })
          .eq('id', listing.id);
      }
      closed++;
    } catch (err: any) {
      errors.push(`Listing ${listing.id}: ${err?.message ?? String(err)}`);
    }
  }

  return { closed, errors };
};
