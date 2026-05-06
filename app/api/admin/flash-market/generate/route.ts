import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { generateFlashOpportunity } from '@/lib/flash-market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: manager } = await supabaseAdmin
    .from('managers')
    .select('is_admin')
    .eq('owner_id', authData.user.id)
    .maybeSingle();

  if (!(manager as any)?.is_admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const result = await generateFlashOpportunity(supabaseAdmin);
  if (!result) return NextResponse.json({ error: 'No hay agentes libres disponibles (overall 55-82)' }, { status: 400 });
  return NextResponse.json({ ok: true, ...result });
}
