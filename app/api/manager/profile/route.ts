import { NextRequest, NextResponse } from 'next/server';
import { requireOwnedClub, toApiError } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SHAPES = new Set(['classic', 'modern', 'circle', 'hexagon', 'square']);
const JERSEYS = new Set(['solid', 'striped', 'hooped']);
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const optionalString = (value: unknown) => typeof value === 'string' ? value.trim() : null;

export async function PATCH(request: NextRequest) {
  try {
    const { supabaseAdmin, user, club } = await requireOwnedClub(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });

    const managerName = optionalString(body.managerName);
    const teamName = optionalString(body.teamName);
    const primaryColor = optionalString(body.primaryColor);
    const secondaryColor = optionalString(body.secondaryColor);
    const jerseyHome = optionalString(body.jerseyHome);
    const jerseyAway = optionalString(body.jerseyAway);
    const badgeShape = optionalString(body.badgeShape);
    const updateBadgeUrl = Object.prototype.hasOwnProperty.call(body, 'badgeUrl');
    const badgeUrl = body.badgeUrl === null ? null : optionalString(body.badgeUrl);

    if (managerName !== null && (managerName.length < 2 || managerName.length > 60)) {
      return NextResponse.json({ error: 'Nombre de mánager inválido' }, { status: 400 });
    }
    if (teamName !== null && (teamName.length < 2 || teamName.length > 60)) {
      return NextResponse.json({ error: 'Nombre de equipo inválido' }, { status: 400 });
    }
    if (primaryColor !== null && !COLOR_PATTERN.test(primaryColor)) {
      return NextResponse.json({ error: 'Color primario inválido' }, { status: 400 });
    }
    if (secondaryColor !== null && !COLOR_PATTERN.test(secondaryColor)) {
      return NextResponse.json({ error: 'Color secundario inválido' }, { status: 400 });
    }
    if (jerseyHome !== null && !JERSEYS.has(jerseyHome)) {
      return NextResponse.json({ error: 'Camiseta local inválida' }, { status: 400 });
    }
    if (jerseyAway !== null && !JERSEYS.has(jerseyAway)) {
      return NextResponse.json({ error: 'Camiseta visitante inválida' }, { status: 400 });
    }
    if (badgeShape !== null && !SHAPES.has(badgeShape)) {
      return NextResponse.json({ error: 'Forma de escudo inválida' }, { status: 400 });
    }
    if (updateBadgeUrl && badgeUrl) {
      let parsed: URL;
      try {
        parsed = new URL(badgeUrl);
      } catch {
        return NextResponse.json({ error: 'URL de escudo inválida' }, { status: 400 });
      }
      const expectedPath = `/storage/v1/object/public/escudos/${club.id}/`;
      if (parsed.protocol !== 'https:' || !parsed.pathname.includes(expectedPath)) {
        return NextResponse.json({ error: 'El escudo no pertenece al equipo' }, { status: 400 });
      }
    }

    const { data, error } = await supabaseAdmin.rpc('update_manager_profile_transaction', {
      p_owner_id: user.id,
      p_manager_name: managerName,
      p_team_name: teamName,
      p_primary_color: primaryColor,
      p_secondary_color: secondaryColor,
      p_jersey_home: jerseyHome,
      p_jersey_away: jerseyAway,
      p_badge_shape: badgeShape,
      p_update_badge_url: updateBadgeUrl,
      p_badge_url: badgeUrl
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
