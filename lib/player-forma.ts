import type { SupabaseClient } from '@supabase/supabase-js';

export const FORMA_MIN = 20;
export const FORMA_MAX = 100;
export const FORMA_NEUTRAL = 80;

export const clampForma = (v: number) => Math.max(FORMA_MIN, Math.min(FORMA_MAX, Math.round(v)));

export const formaToStars = (forma: number): 1 | 2 | 3 | 4 | 5 => {
  if (forma >= 90) return 5;
  if (forma >= 80) return 4;
  if (forma >= 68) return 3;
  if (forma >= 54) return 2;
  return 1;
};

export const FORMA_STAR_LABELS: Record<number, string> = {
  5: 'Excelente',
  4: 'Buena',
  3: 'Normal',
  2: 'Baja',
  1: 'Muy baja'
};

export const FORMA_STAR_COLORS: Record<number, string> = {
  5: 'text-emerald-400',
  4: 'text-cyan-400',
  3: 'text-yellow-400',
  2: 'text-orange-400',
  1: 'text-red-400'
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

const computePostMatchFormaDelta = (params: {
  currentForma: number;
  played: boolean;
  stamina: number;
}): number => {
  // Slow pull toward neutral so extremes don't last forever
  let delta = (FORMA_NEUTRAL - params.currentForma) * 0.1;

  if (params.played) {
    delta += rand(5, 12);
  } else {
    delta += rand(-8, -3);
  }

  if (params.stamina < 30) delta -= 7;
  else if (params.stamina < 50) delta -= 3;

  return delta;
};

export const applyMatchFormaUpdate = async (
  supabaseAdmin: SupabaseClient,
  homeTeamId: string,
  awayTeamId: string,
  statsRows: Array<{ player_id: number }>
): Promise<string | null> => {
  const playedIds = new Set(statsRows.map((r) => r.player_id));

  const { data: players, error } = await supabaseAdmin
    .from('players')
    .select('id, forma, stamina')
    .in('team_id', [homeTeamId, awayTeamId]);

  if (error || !players || players.length === 0) return null;

  const updates = await Promise.all(
    (players as { id: number; forma: number | null; stamina: number | null }[]).map((p) => {
      const currentForma = Number(p.forma ?? FORMA_NEUTRAL);
      const stamina = Number(p.stamina ?? 100);
      const played = playedIds.has(p.id);
      const newForma = clampForma(currentForma + computePostMatchFormaDelta({ currentForma, played, stamina }));
      return supabaseAdmin.from('players').update({ forma: newForma }).eq('id', p.id);
    })
  );

  const errorCount = updates.filter((r) => r.error).length;
  if (errorCount > 0) return `${errorCount} jugadores no pudieron actualizar su forma.`;
  return null;
};
