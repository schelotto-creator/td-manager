import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser, toApiError } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { supabaseAdmin } = await requireAdminUser(request);
    const { data, error } = await supabaseAdmin.rpc('get_simulator_health');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, health: data });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
