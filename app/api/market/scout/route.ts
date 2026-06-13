import { NextRequest, NextResponse } from 'next/server';
import { getMissingStats } from '@/lib/scouting-display';
import { requireOwnedClub, toApiError } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SCOUT_COST = 15_000;

export async function POST(request: NextRequest) {
  try {
    const { supabaseAdmin, user, club } = await requireOwnedClub(request);
    const body = (await request.json().catch(() => null)) as { playerId?: unknown } | null;
    const playerId = Number(body?.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      return NextResponse.json({ error: 'playerId inválido' }, { status: 400 });
    }

    const [{ data: manager, error: managerError }, { data: player, error: playerError }] = await Promise.all([
      supabaseAdmin
        .from('managers')
        .select('talento_ojo,ojeos')
        .eq('owner_id', user.id)
        .maybeSingle(),
      supabaseAdmin
        .from('players')
        .select('id,team_id')
        .eq('id', playerId)
        .maybeSingle()
    ]);

    if (managerError || !manager) {
      return NextResponse.json({ error: 'Mánager no encontrado' }, { status: 404 });
    }
    if (playerError || !player || player.team_id) {
      return NextResponse.json({ error: 'El jugador ya no está disponible' }, { status: 409 });
    }

    const ojeos = (
      manager.ojeos && typeof manager.ojeos === 'object' && !Array.isArray(manager.ojeos)
        ? manager.ojeos
        : {}
    ) as Record<string | number, string[]>;
    const missing = getMissingStats(playerId, Number(manager.talento_ojo || 0), ojeos);
    if (missing.length === 0) {
      return NextResponse.json({ error: 'Jugador ya totalmente ojeado' }, { status: 409 });
    }

    const newStats = [...missing].sort(() => Math.random() - 0.5).slice(0, 2);
    const { data, error } = await supabaseAdmin.rpc('scout_player_transaction', {
      p_owner_id: user.id,
      p_team_id: club.id,
      p_player_id: playerId,
      p_cost: SCOUT_COST,
      p_stats: newStats
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
