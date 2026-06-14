import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, toApiError } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { supabaseAdmin, user } = await requireAuthenticatedUser(request);
    const body = (await request.json().catch(() => null)) as { selectedIds?: unknown } | null;
    if (!Array.isArray(body?.selectedIds)) {
      return NextResponse.json({ error: 'Selección inválida' }, { status: 400 });
    }
    const selectedIds = [...new Set(body.selectedIds.map(Number))];
    if (
      selectedIds.length < 1 ||
      selectedIds.length > 2 ||
      selectedIds.some((id) => !Number.isInteger(id) || id <= 0)
    ) {
      return NextResponse.json({ error: 'Selección inválida' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc('complete_team_draft_transaction', {
      p_owner_id: user.id,
      p_selected_ids: selectedIds
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
