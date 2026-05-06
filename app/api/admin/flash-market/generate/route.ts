import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateFlashOpportunity } from '@/lib/flash-market';

const getAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

const isAuthorized = (request: NextRequest) => {
  const secret = process.env.CRON_SECRET || process.env.SCHEDULER_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const header = request.headers.get('authorization');
  const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const query = request.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
};

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = getAdmin();
  const result = await generateFlashOpportunity(supabaseAdmin);

  if (!result) return NextResponse.json({ ok: false, error: 'No hay agentes libres disponibles (overall 55-82)' }, { status: 400 });
  return NextResponse.json({ ok: true, ...result });
}
