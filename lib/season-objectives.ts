import type { SupabaseClient } from '@supabase/supabase-js';
import { awardXpToTeam } from '@/lib/manager-talents';
import { insertActivity } from '@/lib/activity-feed';

export type ObjectiveType = 'top_x' | 'win_matches' | 'sell_for' | 'train_players' | 'sign_players';

export type SeasonObjective = {
  id: number;
  team_id: string;
  season_number: number;
  type: ObjectiveType;
  target_value: number;
  current_value: number;
  completed: boolean;
  completed_at: string | null;
  xp_reward: number;
  budget_reward: number;
  description: string;
  created_at: string;
};

type ObjectiveTemplate = {
  type: ObjectiveType;
  target_value: number;
  xp_reward: number;
  budget_reward: number;
  description: string;
};

// Five templates per level — three are picked per team using a seeded shuffle
const OBJECTIVE_POOL: Record<number, ObjectiveTemplate[]> = {
  1: [
    { type: 'top_x',         target_value: 2,       xp_reward: 500, budget_reward: 200_000, description: 'Termina entre los 2 primeros de tu grupo' },
    { type: 'win_matches',   target_value: 10,      xp_reward: 300, budget_reward: 100_000, description: 'Gana 10 partidos esta temporada' },
    { type: 'sell_for',      target_value: 250_000, xp_reward: 400, budget_reward: 150_000, description: 'Vende un jugador por más de 250.000 €' },
    { type: 'train_players', target_value: 15,      xp_reward: 200, budget_reward:  80_000, description: 'Entrena 15 jugadores esta temporada' },
    { type: 'sign_players',  target_value: 3,       xp_reward: 300, budget_reward: 100_000, description: 'Ficha 3 jugadores esta temporada' },
  ],
  2: [
    { type: 'top_x',         target_value: 3,       xp_reward: 400, budget_reward: 150_000, description: 'Termina entre los 3 primeros de tu grupo' },
    { type: 'win_matches',   target_value: 8,       xp_reward: 250, budget_reward:  80_000, description: 'Gana 8 partidos esta temporada' },
    { type: 'sell_for',      target_value: 150_000, xp_reward: 350, budget_reward: 120_000, description: 'Vende un jugador por más de 150.000 €' },
    { type: 'train_players', target_value: 12,      xp_reward: 150, budget_reward:  60_000, description: 'Entrena 12 jugadores esta temporada' },
    { type: 'sign_players',  target_value: 2,       xp_reward: 250, budget_reward:  80_000, description: 'Ficha 2 jugadores esta temporada' },
  ],
};

const DEFAULT_POOL: ObjectiveTemplate[] = [
  { type: 'top_x',         target_value: 4,       xp_reward: 300, budget_reward: 100_000, description: 'Termina entre los 4 primeros de tu grupo' },
  { type: 'win_matches',   target_value: 6,       xp_reward: 200, budget_reward:  60_000, description: 'Gana 6 partidos esta temporada' },
  { type: 'sell_for',      target_value: 100_000, xp_reward: 300, budget_reward: 100_000, description: 'Vende un jugador por más de 100.000 €' },
  { type: 'train_players', target_value: 10,      xp_reward: 100, budget_reward:  50_000, description: 'Entrena 10 jugadores esta temporada' },
  { type: 'sign_players',  target_value: 2,       xp_reward: 200, budget_reward:  60_000, description: 'Ficha 2 jugadores esta temporada' },
];

const uuidToSeed = (uuid: string): number =>
  uuid.replace(/-/g, '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

const seededPickN = <T>(arr: T[], seed: number, count: number): T[] => {
  const copy = [...arr];
  let s = seed;
  for (let m = copy.length - 1; m > 0; m--) {
    const x = Math.sin(s++) * 10_000;
    const i = Math.floor((x - Math.floor(x)) * (m + 1));
    [copy[m], copy[i]] = [copy[i], copy[m]];
  }
  return copy.slice(0, Math.min(count, copy.length));
};

export const generateSeasonObjectives = async (
  supabaseAdmin: SupabaseClient,
  seasonNumber: number
): Promise<void> => {
  const [{ data: clubs }, { data: leagues }] = await Promise.all([
    supabaseAdmin.from('clubes').select('id, league_id').not('owner_id', 'is', null).not('league_id', 'is', null),
    supabaseAdmin.from('ligas').select('id, nivel'),
  ]);

  if (!clubs || clubs.length === 0) return;

  const leagueMap = new Map(((leagues ?? []) as any[]).map((l) => [Number(l.id), Number(l.nivel)]));

  const rows = (clubs as any[]).flatMap((club) => {
    const nivel = leagueMap.get(Number(club.league_id)) ?? 99;
    const pool = OBJECTIVE_POOL[nivel] ?? OBJECTIVE_POOL[2] ?? DEFAULT_POOL;
    const seed = uuidToSeed(String(club.id)) + seasonNumber * 31;
    const picks = seededPickN(pool, seed, 3);
    return picks.map((tpl) => ({
      team_id: club.id,
      season_number: seasonNumber,
      type: tpl.type,
      target_value: tpl.target_value,
      current_value: 0,
      completed: false,
      xp_reward: tpl.xp_reward,
      budget_reward: tpl.budget_reward,
      description: tpl.description,
    }));
  });

  if (rows.length === 0) return;

  await supabaseAdmin
    .from('season_objectives')
    .upsert(rows, { onConflict: 'team_id,season_number,type', ignoreDuplicates: true });
};

// Increment or max-compare the progress of the latest uncompleted objective of a given type
export const progressObjective = async (
  supabaseAdmin: SupabaseClient,
  teamId: string,
  type: ObjectiveType,
  value: number,
  mode: 'add' | 'max' = 'add'
): Promise<void> => {
  const { data: obj } = await supabaseAdmin
    .from('season_objectives')
    .select('id, current_value')
    .eq('team_id', teamId)
    .eq('type', type)
    .eq('completed', false)
    .order('season_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!obj) return;
  const o = obj as any;
  const newValue = mode === 'max' ? Math.max(o.current_value, value) : o.current_value + value;
  await supabaseAdmin.from('season_objectives').update({ current_value: newValue }).eq('id', o.id);
};

export const verifyAndRewardObjectives = async (
  supabaseAdmin: SupabaseClient,
  seasonNumber: number,
  // teamId → 1-based final standings position within their group
  teamPositionsMap: Map<string, number>
): Promise<void> => {
  const { data: objectives } = await supabaseAdmin
    .from('season_objectives')
    .select('*')
    .eq('season_number', seasonNumber)
    .eq('completed', false);

  if (!objectives || objectives.length === 0) return;

  const now = new Date().toISOString();
  const fmt = new Intl.NumberFormat('es-ES');

  for (const raw of objectives as any[]) {
    const obj = raw as SeasonObjective;
    let achieved = false;

    if (obj.type === 'top_x') {
      const finalPos = teamPositionsMap.get(obj.team_id);
      if (finalPos != null && finalPos <= obj.target_value) achieved = true;
    } else {
      // sell_for tracks best single sale via 'max' mode, others use 'add'
      if (obj.current_value >= obj.target_value) achieved = true;
    }

    if (!achieved) continue;

    await supabaseAdmin
      .from('season_objectives')
      .update({ completed: true, completed_at: now })
      .eq('id', obj.id);

    if (obj.budget_reward > 0) {
      const { data: club } = await supabaseAdmin
        .from('clubes')
        .select('presupuesto')
        .eq('id', obj.team_id)
        .maybeSingle();
      if (club) {
        await supabaseAdmin
          .from('clubes')
          .update({ presupuesto: (club as any).presupuesto + obj.budget_reward })
          .eq('id', obj.team_id);
        await Promise.resolve(
          supabaseAdmin.from('finance_transactions').insert({
            team_id: obj.team_id,
            concepto: `Premio objetivo: ${obj.description}`,
            monto: obj.budget_reward,
            tipo: 'INGRESO',
            fecha: now,
          })
        ).catch(() => {});
      }
    }

    await Promise.all([
      obj.xp_reward > 0
        ? awardXpToTeam(supabaseAdmin, obj.team_id, obj.xp_reward).catch(() => {})
        : Promise.resolve(),
      insertActivity(supabaseAdmin, [
        {
          team_id: obj.team_id,
          type: 'objective_complete' as const,
          title: `Objetivo completado: ${obj.description}`,
          body: `Premio: +${fmt.format(obj.budget_reward)} € y ${obj.xp_reward} XP`,
          href: '/',
        },
      ]).catch(() => {}),
    ]);
  }
};

export const fetchTeamObjectives = async (
  supabase: SupabaseClient,
  teamId: string
): Promise<SeasonObjective[]> => {
  // Find the latest season that has objectives for this team
  const { data: latest } = await supabase
    .from('season_objectives')
    .select('season_number')
    .eq('team_id', teamId)
    .order('season_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return [];

  const { data } = await supabase
    .from('season_objectives')
    .select('*')
    .eq('team_id', teamId)
    .eq('season_number', (latest as any).season_number)
    .order('id', { ascending: true });
  return (data ?? []) as SeasonObjective[];
};
