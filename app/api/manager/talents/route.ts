import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, toApiError } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TALENT_KEYS = [
  'talento_ojo',
  'talento_financiero',
  'talento_mentor',
  'talento_staff',
  'talento_idolo'
] as const;

export async function POST(request: NextRequest) {
  try {
    const { supabaseAdmin, user } = await requireAuthenticatedUser(request);
    const body = (await request.json().catch(() => null)) as { talent?: unknown } | null;
    if (typeof body?.talent !== 'string' || !TALENT_KEYS.includes(body.talent as typeof TALENT_KEYS[number])) {
      return NextResponse.json({ error: 'Talento inválido' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc('upgrade_manager_talent_transaction', {
      p_owner_id: user.id,
      p_talent: body.talent
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
