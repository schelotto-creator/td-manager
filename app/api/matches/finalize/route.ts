import { NextRequest, NextResponse } from 'next/server';
import { runScheduledMatches } from '@/lib/scheduled-match-runner';
import { requireOwnedClub, toApiError } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type MatchRow = {
  id: number;
  played: boolean;
  match_date: string | null;
  home_team_id: string;
  away_team_id: string;
};

const parseMatchId = (value: unknown) => {
  const matchId = Number(value);
  return Number.isInteger(matchId) && matchId > 0 ? matchId : null;
};

export async function POST(request: NextRequest) {
  try {
    const { supabaseAdmin, club } = await requireOwnedClub(request);
    const body = (await request.json().catch(() => null)) as { matchId?: unknown } | null;
    const matchId = parseMatchId(body?.matchId);
    if (!matchId) {
      return NextResponse.json({ error: 'matchId inválido' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('matches')
      .select('id,played,match_date,home_team_id,away_team_id')
      .eq('id', matchId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    }

    const match = data as MatchRow;
    const clubId = String(club.id);
    if (String(match.home_team_id) !== clubId && String(match.away_team_id) !== clubId) {
      return NextResponse.json({ error: 'No puedes cerrar un partido ajeno' }, { status: 403 });
    }

    if (!match.played) {
      const kickoffAt = match.match_date ? new Date(match.match_date).getTime() : Number.NaN;
      if (!Number.isFinite(kickoffAt) || kickoffAt > Date.now()) {
        return NextResponse.json({ error: 'El partido todavía no ha comenzado' }, { status: 409 });
      }

      await runScheduledMatches(supabaseAdmin, { now: new Date(), maxMatches: 300 });
    }

    const { data: finalizedMatch, error: finalizedError } = await supabaseAdmin
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .maybeSingle();

    if (finalizedError || !finalizedMatch) {
      return NextResponse.json({ error: 'No se pudo recuperar el partido' }, { status: 500 });
    }
    if (!finalizedMatch.played) {
      return NextResponse.json(
        { error: 'El simulador no pudo cerrar el partido. Revisa el panel de automatización.' },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: true, match: finalizedMatch });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
