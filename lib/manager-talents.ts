import type { SupabaseClient } from '@supabase/supabase-js';

export type ManagerTalents = {
  talento_ojo: number;
  talento_financiero: number;
  talento_mentor: number;
  talento_staff: number;
  talento_idolo: number;
};

export const DEFAULT_TALENTS: ManagerTalents = {
  talento_ojo: 0,
  talento_financiero: 0,
  talento_mentor: 0,
  talento_staff: 0,
  talento_idolo: 0,
};

/** talento_mentor: multiplier applied to training baseGain — levels 0-3 */
export const getTrainingMultiplier = (level: number): number =>
  ([1.0, 1.15, 1.30, 1.50] as const)[Math.max(0, Math.min(level, 3))];

/** talento_staff: multiply base injury probability by this factor */
export const getInjuryChanceMultiplier = (level: number): number =>
  ([1.0, 0.9, 0.75, 0.6] as const)[Math.max(0, Math.min(level, 3))];

/** talento_staff: shorten injury duration by this many days */
export const getInjuryDurationReduction = (level: number): number =>
  ([0, 0, 3, 5] as const)[Math.max(0, Math.min(level, 3))];

/** talento_financiero: extra fraction of sale price credited to seller */
export const getSaleBonus = (level: number): number =>
  ([0, 0.05, 0.10, 0.15] as const)[Math.max(0, Math.min(level, 3))];

/** talento_idolo: income multiplier on weekly tickets + sponsors */
export const getIncomeBonus = (level: number): number =>
  ([0, 0.05, 0.10, 0.15] as const)[Math.max(0, Math.min(level, 3))];

export const XP_WIN = 150;
export const XP_LOSS = 75;
export const xpForNextLevel = (nivel: number): number => nivel * 500;

/** Fetch all teams' manager talents in 2 queries. Returns Map<teamId, ManagerTalents>. */
export const fetchAllManagerTalents = async (
  supabase: SupabaseClient
): Promise<Map<string, ManagerTalents>> => {
  const [clubsRes, managersRes] = await Promise.all([
    supabase.from('clubes').select('id, owner_id'),
    supabase
      .from('managers')
      .select('owner_id, talento_ojo, talento_financiero, talento_mentor, talento_staff, talento_idolo')
  ]);

  if (!clubsRes.data || !managersRes.data) return new Map();

  const managerByOwner = new Map(
    (managersRes.data as any[]).map((m) => [m.owner_id, m])
  );

  const result = new Map<string, ManagerTalents>();
  for (const club of clubsRes.data as any[]) {
    const m = managerByOwner.get(club.owner_id);
    result.set(String(club.id), m
      ? {
          talento_ojo: Number(m.talento_ojo ?? 0),
          talento_financiero: Number(m.talento_financiero ?? 0),
          talento_mentor: Number(m.talento_mentor ?? 0),
          talento_staff: Number(m.talento_staff ?? 0),
          talento_idolo: Number(m.talento_idolo ?? 0),
        }
      : { ...DEFAULT_TALENTS }
    );
  }

  return result;
};

/**
 * Award match XP to both managers. Handles level-ups automatically,
 * granting 1 talent point per level reached.
 */
export const awardMatchXp = async (
  supabase: SupabaseClient,
  winnerTeamId: string,
  loserTeamId: string
): Promise<void> => {
  const { data: clubs } = await supabase
    .from('clubes')
    .select('id, owner_id')
    .in('id', [winnerTeamId, loserTeamId]);

  if (!clubs || clubs.length === 0) return;

  const ownerIds = (clubs as any[]).map((c) => c.owner_id).filter(Boolean);
  if (ownerIds.length === 0) return;

  const { data: managers } = await supabase
    .from('managers')
    .select('id, owner_id, nivel, xp, xp_siguiente, puntos_talento')
    .in('owner_id', ownerIds);

  if (!managers) return;

  await Promise.all(
    (managers as any[]).map(async (manager) => {
      const club = (clubs as any[]).find((c) => c.owner_id === manager.owner_id);
      const isWinner = club && String(club.id) === String(winnerTeamId);
      const xpGain = isWinner ? XP_WIN : XP_LOSS;

      let newXp = Number(manager.xp ?? 0) + xpGain;
      let nivel = Number(manager.nivel ?? 1);
      let xpSiguiente = Number(manager.xp_siguiente ?? xpForNextLevel(nivel));
      let puntosTalento = Number(manager.puntos_talento ?? 0);

      while (newXp >= xpSiguiente) {
        newXp -= xpSiguiente;
        nivel++;
        puntosTalento++;
        xpSiguiente = xpForNextLevel(nivel);
      }

      await supabase
        .from('managers')
        .update({ xp: newXp, nivel, xp_siguiente: xpSiguiente, puntos_talento: puntosTalento })
        .eq('id', manager.id);
    })
  );
};
