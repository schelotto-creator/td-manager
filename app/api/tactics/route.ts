import { NextRequest, NextResponse } from 'next/server';
import { requireOwnedClub, toApiError } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OFFENSES = new Set(['BALANCED', 'RUN_AND_GUN', 'PAINT_FOCUS']);
const DEFENSES = new Set(['MAN_TO_MAN', 'ZONE_2_3', 'PRESSING']);
const QUARTERS = ['q1', 'q2', 'q3', 'q4'] as const;
const SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

type Rotation = Record<string, Record<string, number | null>>;

const normalizeRotations = (value: unknown): Rotation | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const rotations: Rotation = {};

  for (const quarter of QUARTERS) {
    const rawQuarter = raw[quarter];
    if (rawQuarter !== undefined && (!rawQuarter || typeof rawQuarter !== 'object' || Array.isArray(rawQuarter))) {
      return null;
    }
    const slots = (rawQuarter || {}) as Record<string, unknown>;
    const normalized: Record<string, number | null> = {};
    const used = new Set<number>();

    for (const slot of SLOTS) {
      const candidate = slots[slot];
      if (candidate === null || candidate === undefined || candidate === '') {
        normalized[slot] = null;
        continue;
      }
      const playerId = Number(candidate);
      if (!Number.isInteger(playerId) || playerId <= 0 || used.has(playerId)) return null;
      used.add(playerId);
      normalized[slot] = playerId;
    }
    rotations[quarter] = normalized;
  }

  return rotations;
};

export async function POST(request: NextRequest) {
  try {
    const { supabaseAdmin, user } = await requireOwnedClub(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const offense = typeof body?.offense === 'string' ? body.offense : '';
    const defense = typeof body?.defense === 'string' ? body.defense : '';
    const rotations = normalizeRotations(body?.rotations);
    const rawMatchId = body?.matchId;
    const matchId = rawMatchId === null || rawMatchId === undefined || rawMatchId === ''
      ? null
      : Number(rawMatchId);

    if (!OFFENSES.has(offense) || !DEFENSES.has(defense) || !rotations) {
      return NextResponse.json({ error: 'Pizarra inválida' }, { status: 400 });
    }
    if (matchId !== null && (!Number.isInteger(matchId) || matchId <= 0)) {
      return NextResponse.json({ error: 'Partido inválido' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc('save_team_tactics_transaction', {
      p_owner_id: user.id,
      p_match_id: matchId,
      p_offense: offense,
      p_defense: defense,
      p_rotations: rotations
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
