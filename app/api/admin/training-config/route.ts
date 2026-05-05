import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { DEFAULT_TRAINING_CONFIG, type TrainingConfig } from '@/lib/player-training';

const getAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function GET() {
  try {
    const supabase = getAdmin();
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
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const config: TrainingConfig = body.config;

    if (
      typeof config.baseGain !== 'number' ||
      typeof config.drDivisor !== 'number' ||
      typeof config.ageMultipliers?.u22 !== 'number'
    ) {
      return NextResponse.json({ error: 'Invalid config shape' }, { status: 400 });
    }

    const supabase = getAdmin();
    const { error } = await supabase
      .from('training_config')
      .upsert({ id: 1, settings: config }, { onConflict: 'id' });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
