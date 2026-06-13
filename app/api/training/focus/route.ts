import { NextRequest, NextResponse } from 'next/server';
import {
  calculateTrainingCostByLeague,
  fetchEconomyRules
} from '@/lib/economy-balance';
import {
  TRAINABLE_ATTRIBUTES,
  type TrainableAttribute
} from '@/lib/player-training';
import { requireOwnedClub, toApiError } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PlayerRow = {
  id: number;
  name: string;
  age: number;
  team_id: string | null;
  shooting_3pt: number;
  shooting_2pt: number;
  defense: number;
  rebounding: number;
  passing: number;
  dribbling: number;
  speed: number;
};

export async function POST(request: NextRequest) {
  try {
    const { supabaseAdmin, club } = await requireOwnedClub(request);
    const body = (await request.json().catch(() => null)) as
      | { playerId?: unknown; focus?: unknown }
      | null;
    const playerId = Number(body?.playerId);
    const focus = body?.focus;

    if (
      !Number.isInteger(playerId) ||
      playerId <= 0 ||
      typeof focus !== 'string' ||
      !TRAINABLE_ATTRIBUTES.includes(focus as TrainableAttribute)
    ) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    const [{ data: player, error: playerError }, { data: league }, economyRules] = await Promise.all([
      supabaseAdmin
        .from('players')
        .select('id,name,age,team_id,shooting_3pt,shooting_2pt,defense,rebounding,passing,dribbling,speed')
        .eq('id', playerId)
        .maybeSingle(),
      club.league_id
        ? supabaseAdmin.from('ligas').select('nivel').eq('id', club.league_id).maybeSingle()
        : Promise.resolve({ data: null }),
      fetchEconomyRules(supabaseAdmin)
    ]);

    if (playerError || !player || String(player.team_id) !== String(club.id)) {
      return NextResponse.json({ error: 'Jugador no encontrado en tu plantilla' }, { status: 404 });
    }

    const typedPlayer = player as PlayerRow;
    const currentValue = Number(typedPlayer[focus as TrainableAttribute] ?? 0);
    const cost = calculateTrainingCostByLeague(
      currentValue,
      Number(typedPlayer.age),
      Number(league?.nivel || 1),
      economyRules
    );

    const { data, error } = await supabaseAdmin.rpc('assign_training_focus_transaction', {
      p_team_id: club.id,
      p_player_id: playerId,
      p_focus: focus,
      p_cost: cost,
      p_stamina_cost: 20
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
