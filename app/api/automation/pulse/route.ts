import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runScheduledMatches } from '@/lib/scheduled-match-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const toErrorText = (error: unknown) => {
  if (!error) return 'Error desconocido';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const e = error as { message?: string; details?: string; hint?: string };
    return e.message || e.details || e.hint || JSON.stringify(error);
  }
  return String(error);
};

const getBearerToken = (request: NextRequest) => {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
};

const parsePositiveInt = (value: unknown) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
};

export async function POST(request: NextRequest) {
  const bearerToken = getBearerToken(request);
  if (!bearerToken) {
    return NextResponse.json({ ok: false, error: 'Falta token de sesión.' }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(bearerToken);
    if (authError || !authData?.user) {
      return NextResponse.json({ ok: false, error: 'Sesión inválida.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { maxMatches?: unknown } | null;
    const maxMatches = Math.max(1, Math.min(300, parsePositiveInt(body?.maxMatches) || 220));
    const now = new Date();
    const scheduledMatches = await runScheduledMatches(supabaseAdmin, { now, maxMatches });

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      scheduledMatches
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorText(error) }, { status: 500 });
  }
}
