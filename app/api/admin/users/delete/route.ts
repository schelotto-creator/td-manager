import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser, toApiError } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { supabaseAdmin, user } = await requireAdminUser(request);
    const body = (await request.json().catch(() => null)) as { ownerId?: unknown } | null;
    const ownerId = typeof body?.ownerId === 'string' ? body.ownerId.trim() : '';
    if (!ownerId) return NextResponse.json({ error: 'Usuario inválido' }, { status: 400 });
    if (ownerId === user.id) {
      return NextResponse.json({ error: 'No puedes borrar tu propia cuenta desde el panel' }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin.rpc('delete_manager_account_transaction', {
      p_target_owner_id: ownerId
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
