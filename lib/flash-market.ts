import type { SupabaseClient } from '@supabase/supabase-js';
import { awardXpToTeam, XP_SIGNING } from '@/lib/manager-talents';
import { insertActivity } from '@/lib/activity-feed';
import {
  fetchPositionOverallConfig,
  calculateWeightedOverallForBestRole,
  getBestRoleForPlayer,
  applyExperienceBonus,
} from '@/lib/position-overall-config';

export const FLASH_DURATION_HOURS = 48;
export const FLASH_DISCOUNT = 0.35; // 35% off market value

export type FlashOpportunity = {
  id: number;
  player_id: number;
  original_price: number;
  flash_price: number;
  computed_overall: number | null;
  display_position: string | null;
  expires_at: string;
  claimed_by_team_id: string | null;
  claimed_at: string | null;
  created_at: string;
  player?: {
    id: number;
    name: string;
    position: string;
    overall: number;
    age: number;
    nationality: string;
    speed: number;
    stamina: number;
    shooting_3pt: number;
    shooting_2pt: number;
    dribbling: number;
    defense: number;
    rebounding: number;
    passing: number;
  } | null;
  claimed_by_team?: { nombre: string } | null;
};

export const computePlayerMarketValue = (overall: number): number =>
  Math.floor(Math.pow(1.13, overall) * 850);

export const fetchActiveFlashOpportunity = async (
  supabase: SupabaseClient
): Promise<FlashOpportunity | null> => {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('flash_opportunities')
    .select(`
      *,
      player:players(id, name, position, overall, age, nationality, speed, stamina, shooting_3pt, shooting_2pt, dribbling, defense, rebounding, passing),
      claimed_by_team:clubes!flash_opportunities_claimed_by_team_id_fkey(nombre)
    `)
    .gt('expires_at', now)
    .is('claimed_by_team_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as FlashOpportunity | null) ?? null;
};

export const generateFlashOpportunity = async (
  supabaseAdmin: SupabaseClient
): Promise<{ id: number; playerName: string; flashPrice: number } | null> => {
  const [{ data: candidates }, positionConfig] = await Promise.all([
    supabaseAdmin
      .from('players')
      .select('id, name, overall, experience, shooting_3pt, shooting_2pt, defense, rebounding, passing, dribbling, speed, stamina, position')
      .is('team_id', null)
      .gte('overall', 50)
      .lte('overall', 85)
      .limit(50),
    fetchPositionOverallConfig(supabaseAdmin)
  ]);

  if (!candidates || candidates.length === 0) return null;

  const raw = (candidates as any[])[Math.floor(Math.random() * candidates.length)];
  const baseOverall = calculateWeightedOverallForBestRole(raw, positionConfig);
  const computed_overall = applyExperienceBonus(baseOverall, raw.experience);
  const display_position = getBestRoleForPlayer(raw, positionConfig);

  const original_price = computePlayerMarketValue(computed_overall);
  const flash_price = Math.round(original_price * (1 - FLASH_DISCOUNT) / 5000) * 5000;
  const expires_at = new Date(Date.now() + FLASH_DURATION_HOURS * 3_600_000).toISOString();

  const { data: opp, error } = await supabaseAdmin
    .from('flash_opportunities')
    .insert({ player_id: raw.id, original_price, flash_price, computed_overall, display_position, expires_at })
    .select('id')
    .single();

  if (error || !opp) return null;
  return { id: (opp as any).id, playerName: raw.name, flashPrice: flash_price };
};

export const claimFlashOpportunity = async (
  supabaseAdmin: SupabaseClient,
  opportunityId: number,
  teamId: string
): Promise<{ success: true } | { success: false; reason: string }> => {
  const now = new Date().toISOString();

  const { data: opp } = await supabaseAdmin
    .from('flash_opportunities')
    .select('*, player:players(id, name, team_id)')
    .eq('id', opportunityId)
    .maybeSingle();

  if (!opp) return { success: false, reason: 'Oferta no encontrada' };
  const o = opp as any;

  if (o.claimed_by_team_id) return { success: false, reason: 'Esta oferta ya fue reclamada' };
  if (o.expires_at <= now) return { success: false, reason: 'Esta oferta ha expirado' };
  if (o.player?.team_id) return { success: false, reason: 'El jugador ya tiene equipo' };

  const { data: club } = await supabaseAdmin
    .from('clubes')
    .select('presupuesto')
    .eq('id', teamId)
    .maybeSingle();

  if (!club) return { success: false, reason: 'Equipo no encontrado' };
  if ((club as any).presupuesto < o.flash_price) return { success: false, reason: 'Fondos insuficientes' };

  const { error: playerErr } = await supabaseAdmin
    .from('players')
    .update({ team_id: teamId, lineup_pos: 'BENCH' })
    .eq('id', o.player_id);
  if (playerErr) return { success: false, reason: playerErr.message };

  await supabaseAdmin
    .from('clubes')
    .update({ presupuesto: (club as any).presupuesto - o.flash_price })
    .eq('id', teamId);

  await supabaseAdmin
    .from('flash_opportunities')
    .update({ claimed_by_team_id: teamId, claimed_at: now })
    .eq('id', opportunityId);

  await Promise.resolve(supabaseAdmin.from('finance_transactions').insert({
    team_id: teamId,
    concepto: `Oportunidad Flash: Fichaje ${o.player?.name}`,
    monto: o.flash_price,
    tipo: 'GASTO',
    fecha: now
  })).catch(() => {});

  const fmt = new Intl.NumberFormat('es-ES');
  await Promise.all([
    awardXpToTeam(supabaseAdmin, teamId, XP_SIGNING).catch(() => {}),
    insertActivity(supabaseAdmin, [{
      team_id: teamId,
      type: 'market_won' as const,
      title: `Oportunidad Flash: ${o.player?.name}`,
      body: `Fichado por ${fmt.format(o.flash_price)} € — ahorro de ${fmt.format(o.original_price - o.flash_price)} €`,
      href: '/roster'
    }]).catch(() => {})
  ]);

  return { success: true };
};
