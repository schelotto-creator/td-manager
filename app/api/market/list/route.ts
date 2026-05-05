import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { AUCTION_DURATION_DAYS } from '@/lib/player-market';

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
      .select('id')
      .eq('owner_id', authData.user.id)
      .single();
    if (!club) return NextResponse.json({ error: 'Equipo no encontrado' }, { status: 404 });

    const { playerId, startingPrice } = await request.json();
    if (!playerId || typeof startingPrice !== 'number' || startingPrice < 1000) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    const { data: player } = await supabaseAdmin
      .from('players')
      .select('id, team_id')
      .eq('id', playerId)
      .single();

    if (!player || player.team_id !== club.id) {
      return NextResponse.json({ error: 'Jugador no encontrado en tu plantilla' }, { status: 403 });
    }

    const { data: existing } = await supabaseAdmin
      .from('market_listings')
      .select('id')
      .eq('player_id', playerId)
      .eq('status', 'active')
      .maybeSingle();

    if (existing) return NextResponse.json({ error: 'Este jugador ya está en el mercado' }, { status: 409 });

    const endsAt = new Date(Date.now() + AUCTION_DURATION_DAYS * 24 * 3600 * 1000).toISOString();

    const { error: insertError } = await supabaseAdmin.from('market_listings').insert({
      player_id: playerId,
      seller_team_id: club.id,
      starting_price: startingPrice,
      current_price: startingPrice,
      buyer_team_id: null,
      ends_at: endsAt,
      status: 'active'
    });

    if (insertError) throw insertError;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error desconocido' }, { status: 500 });
  }
}
