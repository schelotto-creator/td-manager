import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { advanceGroupPlayoffsForMatch } from '@/lib/competition-progression';

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

const parseMatchId = async (request: NextRequest) => {
  const body = (await request.json().catch(() => null)) as { matchId?: unknown } | null;
  const matchId = Number(body?.matchId);
  return Number.isInteger(matchId) && matchId > 0 ? matchId : null;
};

export async function POST(request: NextRequest) {
  const bearerToken = getBearerToken(request);
  if (!bearerToken) {
    return NextResponse.json({ ok: false, error: 'Falta token de sesión.' }, { status: 401 });
  }

  const matchId = await parseMatchId(request);
  if (!matchId) {
    return NextResponse.json({ ok: false, error: 'matchId inválido.' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(bearerToken);
    if (authError || !authData?.user) {
      return NextResponse.json({ ok: false, error: 'Sesión inválida.' }, { status: 401 });
    }

    const [{ data: match, error: matchError }, { data: club, error: clubError }, { data: manager, error: managerError }] =
      await Promise.all([
        supabaseAdmin
          .from('matches')
          .select('id, home_team_id, away_team_id')
          .eq('id', matchId)
          .maybeSingle(),
        supabaseAdmin
          .from('clubes')
          .select('id')
          .eq('owner_id', authData.user.id)
          .maybeSingle(),
        supabaseAdmin
          .from('managers')
          .select('is_admin')
          .eq('owner_id', authData.user.id)
          .maybeSingle()
      ]);

    if (matchError || !match) {
      return NextResponse.json(
        { ok: false, error: `No se encontró el partido ${matchId}.` },
        { status: 404 }
      );
    }

    if (clubError) {
      throw new Error(`No se pudo validar el club del usuario: ${toErrorText(clubError)}`);
    }
    if (managerError) {
      throw new Error(`No se pudo validar permisos del usuario: ${toErrorText(managerError)}`);
    }

    const ownsMatchClub = Boolean(
      club &&
      [String(match.home_team_id), String(match.away_team_id)].includes(String(club.id))
    );

    if (!ownsMatchClub && !manager?.is_admin) {
      return NextResponse.json(
        { ok: false, error: 'No tienes permisos para avanzar playoffs de este partido.' },
        { status: 403 }
      );
    }

    const result = await advanceGroupPlayoffsForMatch(supabaseAdmin, matchId);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorText(error) }, { status: 500 });
  }
}
