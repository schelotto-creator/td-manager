import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { advanceGroupPlayoffsForGroup } from '@/lib/competition-progression';

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

const parseGroupId = async (request: NextRequest) => {
  const body = (await request.json().catch(() => null)) as { groupId?: unknown } | null;
  const groupId = Number(body?.groupId);
  return Number.isInteger(groupId) && groupId > 0 ? groupId : null;
};

export async function POST(request: NextRequest) {
  const bearerToken = getBearerToken(request);
  if (!bearerToken) {
    return NextResponse.json({ ok: false, error: 'Falta token de sesión.' }, { status: 401 });
  }

  const groupId = await parseGroupId(request);
  if (!groupId) {
    return NextResponse.json({ ok: false, error: 'groupId inválido.' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(bearerToken);
    if (authError || !authData?.user) {
      return NextResponse.json({ ok: false, error: 'Sesión inválida.' }, { status: 401 });
    }

    const [{ data: club, error: clubError }, { data: manager, error: managerError }] = await Promise.all([
      supabaseAdmin
        .from('clubes')
        .select('id, grupo_id')
        .eq('owner_id', authData.user.id)
        .maybeSingle(),
      supabaseAdmin
        .from('managers')
        .select('is_admin')
        .eq('owner_id', authData.user.id)
        .maybeSingle()
    ]);

    if (clubError) {
      throw new Error(`No se pudo validar el club del usuario: ${toErrorText(clubError)}`);
    }
    if (managerError) {
      throw new Error(`No se pudo validar permisos del usuario: ${toErrorText(managerError)}`);
    }

    const sameGroup = Boolean(club && Number(club.grupo_id) === groupId);
    if (!sameGroup && !manager?.is_admin) {
      return NextResponse.json(
        { ok: false, error: 'No tienes permisos para regenerar playoffs de este grupo.' },
        { status: 403 }
      );
    }

    const result = await advanceGroupPlayoffsForGroup(supabaseAdmin, groupId);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorText(error) }, { status: 500 });
  }
}
