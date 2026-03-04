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

const isMissingRpc = (error: unknown, functionName: string) => {
  const text = toErrorText(error).toLowerCase();
  return (
    text.includes(functionName.toLowerCase()) &&
    (text.includes('could not find the function') ||
      text.includes('no function matches') ||
      text.includes('does not exist') ||
      text.includes('not found'))
  );
};

const parseBooleanFlag = (value: string | null) => value === '1' || value === 'true' || value === 'yes';
const parsePositiveInt = (value: string | null) => {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
};

const isAuthorized = (request: NextRequest) => {
  const secret = process.env.CRON_SECRET || process.env.SCHEDULER_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';

  const header = request.headers.get('authorization');
  const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const query = request.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
};

const runTick = async (request: NextRequest) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const forceWeekly = parseBooleanFlag(request.nextUrl.searchParams.get('forceWeekly'));
  const envMaxMatches =
    parsePositiveInt(process.env.CRON_MAX_MATCHES || null) ||
    parsePositiveInt(process.env.SCHEDULER_MAX_MATCHES || null) ||
    220;
  const requestedMaxMatches = parsePositiveInt(request.nextUrl.searchParams.get('maxMatches'));
  const maxMatches = Math.max(1, Math.min(300, requestedMaxMatches || envMaxMatches));
  const supabaseAdmin = getSupabaseAdmin();

  let weeklyMaintenance: unknown = { status: 'not_executed' };
  const warnings: string[] = [];

  try {
    const { data, error } = await supabaseAdmin.rpc('run_weekly_maintenance', { p_force: forceWeekly });
    if (error) {
      if (isMissingRpc(error, 'run_weekly_maintenance')) {
        weeklyMaintenance = { status: 'rpc_missing' };
        warnings.push(
          'run_weekly_maintenance no existe en BD. Aplica la migración 20260302_automation_scheduler.sql.'
        );
      } else {
        throw new Error(`Fallo mantenimiento semanal: ${toErrorText(error)}`);
      }
    } else {
      weeklyMaintenance = data || { status: 'ok' };
    }

    const scheduledMatches = await runScheduledMatches(supabaseAdmin, { now, maxMatches });

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      weeklyMaintenance,
      scheduledMatches,
      warnings
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        timestamp: now.toISOString(),
        weeklyMaintenance,
        warnings,
        error: toErrorText(error)
      },
      { status: 500 }
    );
  }
};

export async function GET(request: NextRequest) {
  return runTick(request);
}

export async function POST(request: NextRequest) {
  return runTick(request);
}
