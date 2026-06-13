import { NextRequest, NextResponse } from 'next/server';
import { insertActivity } from '@/lib/activity-feed';
import { requireOwnedClub, toApiError } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { supabaseAdmin, club } = await requireOwnedClub(request);
    const body = (await request.json().catch(() => null)) as
      | { listingId?: unknown; amount?: unknown }
      | null;
    const listingId = Number(body?.listingId);
    const amount = Number(body?.amount);
    if (!Number.isInteger(listingId) || listingId <= 0 || !Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc('place_market_bid_transaction', {
      p_listing_id: listingId,
      p_buyer_team_id: club.id,
      p_amount: amount
    });
    if (error) {
      const message = error.message || 'No se pudo registrar la puja';
      const lower = message.toLowerCase();
      const status = lower.includes('not found') ? 404 : lower.includes('own auction') ? 403 : 400;
      return NextResponse.json({ error: message }, { status });
    }

    const result = (data && typeof data === 'object' ? data : {}) as {
      new_budget?: number;
      previous_buyer_team_id?: string | null;
      player_id?: number;
    };

    // Notify outbid team
    if (result.previous_buyer_team_id && result.previous_buyer_team_id !== club.id) {
      const { data: playerData } = await supabaseAdmin
        .from('players')
        .select('name')
        .eq('id', result.player_id)
        .maybeSingle();
      const playerName = (playerData as { name?: string } | null)?.name ?? `Jugador #${result.player_id}`;
      const fmt = new Intl.NumberFormat('es-ES');
      await insertActivity(supabaseAdmin, [{
        team_id: result.previous_buyer_team_id,
        type: 'market_outbid' as const,
        title: `Superado en subasta: ${playerName}`,
        body: `Nueva puja: ${fmt.format(amount)} €`,
        href: '/market'
      }]).catch(() => {});
    }

    return NextResponse.json({ ok: true, newBudget: Number(result.new_budget ?? club.presupuesto) });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
