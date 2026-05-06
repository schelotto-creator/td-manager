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

// --- XP system ---

export const XP_WIN = 80;
export const XP_LOSS = 30;
export const XP_TRAINING_PER_PLAYER = 5;
export const XP_SIGNING = 30;
export const XP_SEASON_COMPLETE = 200;

/** XP needed to advance from `nivel` to `nivel + 1`. Quadratic: nivel² × 400 */
export const xpForNextLevel = (nivel: number): number => nivel * nivel * 400;

// --- Internal level-up logic (shared by all award functions) ---

const applyXpGain = (
  currentXp: number,
  currentNivel: number,
  currentXpSiguiente: number,
  currentPuntosTalento: number,
  xpGain: number
) => {
  let xp = currentXp + xpGain;
  let nivel = currentNivel;
  let xpSiguiente = currentXpSiguiente;
  let puntosTalento = currentPuntosTalento;

  while (xp >= xpSiguiente) {
    xp -= xpSiguiente;
    nivel++;
    puntosTalento++;
    xpSiguiente = xpForNextLevel(nivel);
  }

  return { xp, nivel, xp_siguiente: xpSiguiente, puntos_talento: puntosTalento };
};

// --- Public award functions ---

/** Award XP directly to a manager identified by their auth owner_id. */
export const awardXpToOwner = async (
  supabase: SupabaseClient,
  ownerId: string,
  xpAmount: number
): Promise<void> => {
  const { data: manager } = await supabase
    .from('managers')
    .select('id, nivel, xp, xp_siguiente, puntos_talento')
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (!manager) return;

  const m = manager as any;
  const updated = applyXpGain(
    Number(m.xp ?? 0),
    Number(m.nivel ?? 1),
    Number(m.xp_siguiente ?? xpForNextLevel(Number(m.nivel ?? 1))),
    Number(m.puntos_talento ?? 0),
    xpAmount
  );

  await supabase.from('managers').update(updated).eq('id', m.id);
};

/** Award XP to the manager who owns a given team (club). */
export const awardXpToTeam = async (
  supabase: SupabaseClient,
  teamId: string,
  xpAmount: number
): Promise<void> => {
  const { data: club } = await supabase
    .from('clubes')
    .select('owner_id')
    .eq('id', teamId)
    .maybeSingle();

  const ownerId = (club as any)?.owner_id;
  if (!ownerId) return;

  return awardXpToOwner(supabase, ownerId, xpAmount);
};

/** Award match XP to both managers (winner + loser). */
export const awardMatchXp = async (
  supabase: SupabaseClient,
  winnerTeamId: string,
  loserTeamId: string
): Promise<void> => {
  await Promise.all([
    awardXpToTeam(supabase, winnerTeamId, XP_WIN),
    awardXpToTeam(supabase, loserTeamId, XP_LOSS),
  ]);
};

/** Award season-completion XP to every manager at once. */
export const awardSeasonXpToAll = async (supabase: SupabaseClient): Promise<void> => {
  const { data: managers } = await supabase
    .from('managers')
    .select('id, nivel, xp, xp_siguiente, puntos_talento');

  if (!managers || managers.length === 0) return;

  await Promise.all(
    (managers as any[]).map((m) => {
      const updated = applyXpGain(
        Number(m.xp ?? 0),
        Number(m.nivel ?? 1),
        Number(m.xp_siguiente ?? xpForNextLevel(Number(m.nivel ?? 1))),
        Number(m.puntos_talento ?? 0),
        XP_SEASON_COMPLETE
      );
      return supabase.from('managers').update(updated).eq('id', m.id);
    })
  );
};

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
