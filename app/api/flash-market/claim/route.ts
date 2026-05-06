import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { claimFlashOpportunity } from '@/lib/flash-market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });

    const { data: club } = await supabaseAdmin
      .from('clubes')
      .select('id')
      .eq('owner_id', authData.user.id)
      .single();
    if (!club) return NextResponse.json({ error: 'Equipo no encontrado' }, { status: 404 });

    const { opportunityId } = await request.json();
    if (!opportunityId) return NextResponse.json({ error: 'opportunityId requerido' }, { status: 400 });

    const result = await claimFlashOpportunity(supabaseAdmin, Number(opportunityId), String(club.id));

    if (!result.success) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Error desconocido' }, { status: 500 });
  }
}
