import { NextRequest, NextResponse } from 'next/server';
import { runScheduledMatches } from '@/lib/scheduled-match-runner';
import { requireOwnedClub, toApiError } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const toErrorText = (error: unknown) => {
  if (!error) return 'Error desconocido';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const e = error as { message?: string; details?: string; hint?: string };
    return e.message || e.details || e.hint || JSON.stringify(error);
  }
  return String(error);
};

const parsePositiveInt = (value: unknown) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
};

export async function POST(request: NextRequest) {
  try {
    const { supabaseAdmin } = await requireOwnedClub(request);
    const body = (await request.json().catch(() => null)) as { maxMatches?: unknown } | null;
    const maxMatches = Math.max(1, Math.min(40, parsePositiveInt(body?.maxMatches) || 20));
    const now = new Date();
    const scheduledMatches = await runScheduledMatches(supabaseAdmin, { now, maxMatches });

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      scheduledMatches
    });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json(
      { ok: false, error: apiError.status === 500 ? toErrorText(error) : apiError.message },
      { status: apiError.status }
    );
  }
}
