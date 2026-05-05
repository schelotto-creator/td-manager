import type { SupabaseClient } from '@supabase/supabase-js';

export const computeInjuryChance = (stamina: number): number => {
  let chance = 0.05;
  if (stamina < 30) chance += 0.25;
  else if (stamina < 50) chance += 0.15;
  else if (stamina < 70) chance += 0.08;
  return Math.min(chance, 0.45);
};

export const isPlayerInjured = (injuredUntil: string | null | undefined): boolean => {
  if (!injuredUntil) return false;
  return new Date(injuredUntil) > new Date();
};

export const getInjuryDaysRemaining = (injuredUntil: string | null | undefined): number => {
  if (!injuredUntil) return 0;
  const diff = new Date(injuredUntil).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

export const applyMatchInjuries = async (
  supabaseAdmin: SupabaseClient,
  homeTeamId: string,
  awayTeamId: string,
  statsRows: Array<{ player_id: number }>
): Promise<string | null> => {
  const playedIds = new Set(statsRows.map((r) => r.player_id));

  const { data: players, error } = await supabaseAdmin
    .from('players')
    .select('id, stamina, injured_until')
    .in('team_id', [homeTeamId, awayTeamId]);

  if (error || !players || players.length === 0) return null;

  const now = new Date();
  const toInject: Array<{ id: number; injured_until: string }> = [];

  for (const p of players as { id: number; stamina: number | null; injured_until: string | null }[]) {
    if (!playedIds.has(p.id)) continue;
    if (isPlayerInjured(p.injured_until)) continue;

    const stamina = Number(p.stamina ?? 100);
    const chance = computeInjuryChance(stamina);
    if (Math.random() > chance) continue;

    const daysOut = 7 + Math.floor(Math.random() * 15); // 7–21 days
    const until = new Date(now.getTime() + daysOut * 24 * 60 * 60 * 1000);
    toInject.push({ id: p.id, injured_until: until.toISOString().split('T')[0] });
  }

  if (toInject.length === 0) return null;

  const updates = await Promise.all(
    toInject.map(({ id, injured_until }) =>
      supabaseAdmin.from('players').update({ injured_until }).eq('id', id)
    )
  );

  const errorCount = updates.filter((r) => r.error).length;
  if (errorCount > 0) return `${errorCount} lesiones no pudieron registrarse.`;
  return `🚑 ${toInject.length} jugador(es) lesionado(s) tras el partido.`;
};
