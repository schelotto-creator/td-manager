import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_TRAINING_CONFIG, type TrainingConfig } from '@/lib/player-training';
import { requireAdminUser, toApiError } from '@/lib/server-auth';

export async function GET(req: NextRequest) {
  try {
    const { supabaseAdmin: supabase } = await requireAdminUser(req);
    const { data, error } = await supabase
      .from('training_config')
      .select('settings')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;

    const config: TrainingConfig = data?.settings
      ? (data.settings as TrainingConfig)
      : DEFAULT_TRAINING_CONFIG;

    return NextResponse.json({ config });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabaseAdmin: supabase } = await requireAdminUser(req);
    const body = await req.json();
    const config = body?.config as TrainingConfig | undefined;

    if (
      !config ||
      typeof config.baseGain !== 'number' ||
      !Number.isFinite(config.baseGain) ||
      config.baseGain < 0 ||
      typeof config.drDivisor !== 'number' ||
      !Number.isFinite(config.drDivisor) ||
      config.drDivisor <= 0 ||
      typeof config.ageMultipliers?.u22 !== 'number'
    ) {
      return NextResponse.json({ error: 'Invalid config shape' }, { status: 400 });
    }

    const { error } = await supabase
      .from('training_config')
      .upsert({ id: 1, settings: config }, { onConflict: 'id' });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
