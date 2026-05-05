import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { computeMinBid } from '@/lib/player-market';
import { insertActivity } from '@/lib/activity-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });

    const { data: club } = await supabaseAdmin
      .from('clubes')
      .select('id, presupuesto')
      .eq('owner_id', authData.user.id)
      .single();
    if (!club) return NextResponse.json({ error: 'Equipo no encontrado' }, { status: 404 });

    const { listingId, amount } = await request.json();
    if (!listingId || typeof amount !== 'number') {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    const { data: listing } = await supabaseAdmin
      .from('market_listings')
      .select('*')
      .eq('id', listingId)
      .eq('status', 'active')
      .single();

    if (!listing) return NextResponse.json({ error: 'Subasta no encontrada o ya cerrada' }, { status: 404 });
    if (listing.seller_team_id === club.id) return NextResponse.json({ error: 'No puedes pujar en tu propia subasta' }, { status: 403 });
    if (new Date(listing.ends_at) <= new Date()) return NextResponse.json({ error: 'La subasta ha finalizado' }, { status: 410 });

    const minBid = computeMinBid(listing.current_price);
    if (amount < minBid) {
      return NextResponse.json({ error: `La puja mínima es ${new Intl.NumberFormat('es-ES').format(minBid)} €` }, { status: 400 });
    }

    if (club.presupuesto - amount < 0) return NextResponse.json({ error: 'Presupuesto insuficiente' }, { status: 400 });

    // Refund previous bidder (if different from current bidder)
    if (listing.buyer_team_id && listing.buyer_team_id !== club.id) {
      const { data: prevBuyer } = await supabaseAdmin
        .from('clubes')
        .select('presupuesto')
        .eq('id', listing.buyer_team_id)
        .single();
      if (prevBuyer) {
        await supabaseAdmin
          .from('clubes')
          .update({ presupuesto: prevBuyer.presupuesto + listing.current_price })
          .eq('id', listing.buyer_team_id);
      }
    }

    // Deduct from new bidder (refund their previous bid if they were already highest)
    const previousOwnBid = listing.buyer_team_id === club.id ? listing.current_price : 0;
    const netDeduction = amount - previousOwnBid;
    const newBudget = club.presupuesto - netDeduction;

    await supabaseAdmin.from('clubes').update({ presupuesto: newBudget }).eq('id', club.id);
    const { error: updateError } = await supabaseAdmin
      .from('market_listings')
      .update({ current_price: amount, buyer_team_id: club.id })
      .eq('id', listingId);

    if (updateError) throw updateError;

    // Notify outbid team
    if (listing.buyer_team_id && listing.buyer_team_id !== club.id) {
      const { data: playerData } = await supabaseAdmin
        .from('players')
        .select('name')
        .eq('id', listing.player_id)
        .maybeSingle();
      const playerName = (playerData as any)?.name ?? `Jugador #${listing.player_id}`;
      const fmt = new Intl.NumberFormat('es-ES');
      await insertActivity(supabaseAdmin, [{
        team_id: listing.buyer_team_id,
        type: 'market_outbid' as const,
        title: `Superado en subasta: ${playerName}`,
        body: `Nueva puja: ${fmt.format(amount)} €`,
        href: '/market'
      }]).catch(() => {});
    }

    return NextResponse.json({ ok: true, newBudget });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error desconocido' }, { status: 500 });
  }
}
