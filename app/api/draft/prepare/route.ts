import { NextRequest, NextResponse } from 'next/server';
import { requireOwnedClub, toApiError } from '@/lib/server-auth';
import {
  generateInitialRoster,
  generateRookiePool,
  generateSeasonFallbackPool,
  getServerPositionConfig
} from '@/lib/server-player-generation';
import {
  CLUB_STATUS,
  getRookieDraftPoolTag,
  getSeasonDraftPoolTag
} from '@/lib/season-draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { supabaseAdmin, user, club } = await requireOwnedClub(request);
    const { data: clubState, error: clubError } = await supabaseAdmin
      .from('clubes')
      .select('*')
      .eq('id', club.id)
      .single();
    if (clubError || !clubState) {
      return NextResponse.json({ error: 'Equipo no encontrado' }, { status: 404 });
    }
    if (clubState.status !== CLUB_STATUS.ROOKIE_DRAFT && clubState.status !== CLUB_STATUS.SEASON_DRAFT) {
      return NextResponse.json({ error: 'El equipo no tiene un draft pendiente' }, { status: 409 });
    }

    const { data: configRow } = await supabaseAdmin
      .from('position_overall_config')
      .select('settings')
      .eq('id', 1)
      .maybeSingle();
    const config = getServerPositionConfig(configRow?.settings);
    const rookieDraft = clubState.status === CLUB_STATUS.ROOKIE_DRAFT;
    const poolTag = rookieDraft
      ? getRookieDraftPoolTag(club.id)
      : getSeasonDraftPoolTag(club.id);
    const initialRoster = rookieDraft ? generateInitialRoster(club.id, config) : [];
    const candidates = rookieDraft
      ? generateRookiePool(poolTag, 10, config)
      : generateSeasonFallbackPool(poolTag, config);

    const { error: prepareError } = await supabaseAdmin.rpc('prepare_team_draft_transaction', {
      p_owner_id: user.id,
      p_initial_players: initialRoster,
      p_draft_players: candidates
    });
    if (prepareError) {
      return NextResponse.json({ error: prepareError.message }, { status: 400 });
    }

    const [{ data: roster, error: rosterError }, { data: pool, error: poolError }] = await Promise.all([
      supabaseAdmin.from('players').select('*').eq('team_id', club.id),
      supabaseAdmin.from('players').select('*').is('team_id', null).eq('lineup_pos', poolTag)
    ]);
    if (rosterError || poolError) {
      return NextResponse.json({ error: rosterError?.message || poolError?.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      club: clubState,
      mode: rookieDraft ? 'rookie' : 'season',
      roster: roster || [],
      candidates: pool || []
    });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
