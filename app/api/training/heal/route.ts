import { NextRequest, NextResponse } from 'next/server';
import { requireOwnedClub, toApiError } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const calculateHealCost = (age: number) => {
  const ageFactor = Math.max(1, age - 15);
  return Math.floor(5000 + Math.pow(ageFactor, 2) * 100);
};

export async function POST(request: NextRequest) {
  try {
    const { supabaseAdmin, club } = await requireOwnedClub(request);
    const body = (await request.json().catch(() => null)) as { playerId?: unknown } | null;
    const playerId = Number(body?.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      return NextResponse.json({ error: 'playerId inválido' }, { status: 400 });
    }

    const { data: player, error: playerError } = await supabaseAdmin
      .from('players')
      .select('id,age,team_id')
      .eq('id', playerId)
      .maybeSingle();

    if (playerError || !player || String(player.team_id) !== String(club.id)) {
      return NextResponse.json({ error: 'Jugador no encontrado en tu plantilla' }, { status: 404 });
    }

    const cost = calculateHealCost(Number(player.age));
    const { data, error } = await supabaseAdmin.rpc('heal_player_transaction', {
      p_team_id: club.id,
      p_player_id: playerId,
      p_cost: cost
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, cost, result: data });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
