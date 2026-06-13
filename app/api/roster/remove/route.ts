import { NextRequest, NextResponse } from 'next/server';
import {
  applyExperienceBonus,
  calculateWeightedOverallForBestRole,
  fetchPositionOverallConfig
} from '@/lib/position-overall-config';
import { progressObjective } from '@/lib/season-objectives';
import { requireOwnedClub, toApiError } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RemoveMode = 'release' | 'direct' | 'market';

const getMarketValue = (overall: number) => Math.floor(Math.pow(1.13, overall) * 850);

export async function POST(request: NextRequest) {
  try {
    const { supabaseAdmin, club } = await requireOwnedClub(request);
    const body = (await request.json().catch(() => null)) as
      | { playerId?: unknown; mode?: unknown }
      | null;
    const playerId = Number(body?.playerId);
    const mode = body?.mode as RemoveMode;
    if (
      !Number.isInteger(playerId) ||
      playerId <= 0 ||
      !['release', 'direct', 'market'].includes(mode)
    ) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    const [{ data: player, error: playerError }, positionConfig] = await Promise.all([
      supabaseAdmin
        .from('players')
        .select('id,name,team_id,overall,experience,shooting_3pt,shooting_2pt,defense,passing,rebounding,speed,dribbling')
        .eq('id', playerId)
        .maybeSingle(),
      fetchPositionOverallConfig(supabaseAdmin)
    ]);

    if (playerError || !player || String(player.team_id) !== String(club.id)) {
      return NextResponse.json({ error: 'Jugador no encontrado en tu plantilla' }, { status: 404 });
    }

    const overall = applyExperienceBonus(
      calculateWeightedOverallForBestRole(player, positionConfig),
      player.experience
    );
    const marketValue = getMarketValue(overall);
    const salePrice = mode === 'release' ? 0 : mode === 'direct' ? Math.floor(marketValue * 0.8) : marketValue;
    const concept =
      mode === 'direct'
        ? `Mercado: Venta directa ${player.name}`
        : `Mercado: Venta ${player.name}`;

    const { data, error } = await supabaseAdmin.rpc('remove_roster_player_transaction', {
      p_team_id: club.id,
      p_player_id: playerId,
      p_sale_price: salePrice,
      p_concept: concept
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (salePrice > 0) {
      await progressObjective(
        supabaseAdmin,
        String(club.id),
        'sell_for',
        salePrice,
        'max'
      ).catch(() => {});
    }

    return NextResponse.json({ ok: true, salePrice, result: data });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
