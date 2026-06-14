import { NextRequest, NextResponse } from 'next/server';
import { awardXpToTeam, XP_SIGNING } from '@/lib/manager-talents';
import {
  applyExperienceBonus,
  calculateWeightedOverallForBestRole,
  fetchPositionOverallConfig
} from '@/lib/position-overall-config';
import { progressObjective } from '@/lib/season-objectives';
import { isDraftPoolTag } from '@/lib/season-draft';
import { requireOwnedClub, toApiError } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const getMarketValue = (overall: number) => Math.floor(Math.pow(1.13, overall) * 850);

export async function POST(request: NextRequest) {
  try {
    const { supabaseAdmin, club } = await requireOwnedClub(request);
    const body = (await request.json().catch(() => null)) as { playerId?: unknown } | null;
    const playerId = Number(body?.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      return NextResponse.json({ error: 'playerId inválido' }, { status: 400 });
    }

    const [{ data: player, error: playerError }, positionConfig] = await Promise.all([
      supabaseAdmin
        .from('players')
        .select('id,name,team_id,lineup_pos,overall,experience,shooting_3pt,shooting_2pt,defense,passing,rebounding,speed,dribbling')
        .eq('id', playerId)
        .maybeSingle(),
      fetchPositionOverallConfig(supabaseAdmin)
    ]);

    if (playerError || !player || player.team_id || isDraftPoolTag(player.lineup_pos)) {
      return NextResponse.json({ error: 'El jugador ya no está disponible' }, { status: 409 });
    }

    const overall = applyExperienceBonus(
      calculateWeightedOverallForBestRole(player, positionConfig),
      player.experience
    );
    const price = getMarketValue(overall);
    const { data, error } = await supabaseAdmin.rpc('sign_free_agent_transaction', {
      p_team_id: club.id,
      p_player_id: playerId,
      p_price: price
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await Promise.all([
      awardXpToTeam(supabaseAdmin, String(club.id), XP_SIGNING).catch(() => {}),
      progressObjective(supabaseAdmin, String(club.id), 'sign_players', 1).catch(() => {})
    ]);

    return NextResponse.json({ ok: true, price, overall, result: data });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
