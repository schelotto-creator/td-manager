import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  runScheduledMatches,
  type ScheduledMatchesRunSummary
} from '@/lib/scheduled-match-runner';

export type SimulatorExecution =
  | {
      status: 'completed';
      runId: string;
      summary: ScheduledMatchesRunSummary;
    }
  | {
      status: 'busy';
      runId: string;
      summary: null;
    };

const toErrorText = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'Error desconocido';

export const runScheduledMatchesSafely = async (
  supabaseAdmin: SupabaseClient,
  opts?: { now?: Date; maxMatches?: number }
): Promise<SimulatorExecution> => {
  const runId = randomUUID();
  const { data: claimed, error: claimError } = await supabaseAdmin.rpc('claim_simulator_run', {
    p_run_id: runId,
    p_stale_after_seconds: 600
  });

  if (claimError) {
    throw new Error(`No se pudo adquirir el lock del simulador: ${claimError.message}`);
  }
  if (!claimed) return { status: 'busy', runId, summary: null };

  try {
    const summary = await runScheduledMatches(supabaseAdmin, opts);
    await supabaseAdmin.rpc('finish_simulator_run', {
      p_run_id: runId,
      p_status: 'ok',
      p_details: summary,
      p_error: null
    });
    return { status: 'completed', runId, summary };
  } catch (error) {
    await supabaseAdmin.rpc('finish_simulator_run', {
      p_run_id: runId,
      p_status: 'error',
      p_details: {},
      p_error: toErrorText(error)
    });
    throw error;
  }
};
