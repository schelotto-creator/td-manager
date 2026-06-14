import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, toApiError } from '@/lib/server-auth';
import {
  generateInitialRoster,
  getServerPositionConfig
} from '@/lib/server-player-generation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SHAPES = new Set(['classic', 'modern', 'circle', 'hexagon', 'square']);
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export async function POST(request: NextRequest) {
  try {
    const { supabaseAdmin, user } = await requireAuthenticatedUser(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const managerName = typeof body?.managerName === 'string' ? body.managerName.trim() : '';
    const clubName = typeof body?.clubName === 'string' ? body.clubName.trim() : '';
    const badgeShape = typeof body?.badgeShape === 'string' ? body.badgeShape : '';
    const primaryColor = typeof body?.primaryColor === 'string' ? body.primaryColor : '';

    if (managerName.length < 2 || managerName.length > 60 || clubName.length < 2 || clubName.length > 60) {
      return NextResponse.json({ error: 'Nombre de mánager o club inválido' }, { status: 400 });
    }
    if (!SHAPES.has(badgeShape) || !COLOR_PATTERN.test(primaryColor)) {
      return NextResponse.json({ error: 'Identidad visual inválida' }, { status: 400 });
    }

    const { data: configRow } = await supabaseAdmin
      .from('position_overall_config')
      .select('settings')
      .eq('id', 1)
      .maybeSingle();
    const config = getServerPositionConfig(configRow?.settings);
    const initialRoster = generateInitialRoster(null, config);

    const { data, error } = await supabaseAdmin.rpc('complete_onboarding_transaction', {
      p_owner_id: user.id,
      p_manager_name: managerName,
      p_club_name: clubName,
      p_badge_shape: badgeShape,
      p_primary_color: primaryColor,
      p_players: initialRoster
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
