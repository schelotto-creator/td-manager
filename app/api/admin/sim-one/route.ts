import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser, toApiError } from '@/lib/server-auth';
import { runScheduledMatchesSafely } from '@/lib/simulator-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { supabaseAdmin } = await requireAdminUser(request);
    const simulatorRun = await runScheduledMatchesSafely(supabaseAdmin, {
      now: new Date(),
      maxMatches: 1
    });

    return NextResponse.json({
      ok: true,
      result: simulatorRun.status,
      runId: simulatorRun.runId,
      scheduledMatches: simulatorRun.summary
    });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
