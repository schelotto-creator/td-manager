import type { SupabaseClient } from '@supabase/supabase-js';

const MADRID_TIME_ZONE = 'Europe/Madrid';
const MADRID_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: MADRID_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
  hourCycle: 'h23'
});

type WeeklyMaintenancePlayerRow = Record<string, unknown> & {
  id: number;
  forma?: number | null;
  stamina?: number | null;
  entrenos_semanales?: number | null;
};

type MadridLocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  isoWeekday: number;
};

export type WeeklyMaintenanceFallbackResult = {
  status: 'ok' | 'already_done' | 'skipped_not_due';
  week_key: string;
  now_local: string;
  players_form_updated?: number;
  weekly_train_slots_reset?: number;
};

const WEEKLY_MAINTENANCE_MARKER_CONCEPT = 'Control semanal: forma plantilla';

const weekdayMap: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7
};

const chunkArray = <T>(items: T[], size: number) => {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const toErrorText = (error: unknown) => {
  if (!error) return 'Error desconocido';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const e = error as { message?: string; details?: string; hint?: string };
    return e.message || e.details || e.hint || JSON.stringify(error);
  }
  return String(error);
};

const getFormatterPart = (
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
) => parts.find((part) => part.type === type)?.value || '';

const buildUtcDateFromMadridLocal = (
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number
) => {
  const initialUtcGuess = new Date(Date.UTC(year, monthIndex, day, hour, minute, 0));
  const zonedParts = MADRID_DATE_TIME_FORMATTER.formatToParts(initialUtcGuess);
  const actualLocalMs = Date.UTC(
    Number(getFormatterPart(zonedParts, 'year') || '0'),
    Number(getFormatterPart(zonedParts, 'month') || '1') - 1,
    Number(getFormatterPart(zonedParts, 'day') || '1'),
    Number(getFormatterPart(zonedParts, 'hour') || '0'),
    Number(getFormatterPart(zonedParts, 'minute') || '0'),
    Number(getFormatterPart(zonedParts, 'second') || '0')
  );
  const desiredLocalMs = Date.UTC(year, monthIndex, day, hour, minute, 0);
  return new Date(initialUtcGuess.getTime() + (desiredLocalMs - actualLocalMs));
};

const getMadridLocalParts = (reference: Date): MadridLocalParts => {
  const parts = MADRID_DATE_TIME_FORMATTER.formatToParts(reference);
  const weekday = getFormatterPart(parts, 'weekday');

  return {
    year: Number(getFormatterPart(parts, 'year') || '0'),
    month: Number(getFormatterPart(parts, 'month') || '1'),
    day: Number(getFormatterPart(parts, 'day') || '1'),
    hour: Number(getFormatterPart(parts, 'hour') || '0'),
    minute: Number(getFormatterPart(parts, 'minute') || '0'),
    second: Number(getFormatterPart(parts, 'second') || '0'),
    isoWeekday: weekdayMap[weekday] || 1
  };
};

const getIsoWeekKey = (year: number, month: number, day: number) => {
  const utcDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const isoWeekday = utcDate.getUTCDay() === 0 ? 7 : utcDate.getUTCDay();
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - isoWeekday);
  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
};

const getMadridWeekWindow = (reference: Date) => {
  const local = getMadridLocalParts(reference);
  const currentLocalUtc = new Date(Date.UTC(local.year, local.month - 1, local.day, 12, 0, 0));
  const mondayLocalUtc = new Date(currentLocalUtc);
  mondayLocalUtc.setUTCDate(currentLocalUtc.getUTCDate() - (local.isoWeekday - 1));
  const nextMondayLocalUtc = new Date(mondayLocalUtc);
  nextMondayLocalUtc.setUTCDate(mondayLocalUtc.getUTCDate() + 7);

  const weekStartUtc = buildUtcDateFromMadridLocal(
    mondayLocalUtc.getUTCFullYear(),
    mondayLocalUtc.getUTCMonth(),
    mondayLocalUtc.getUTCDate(),
    0,
    0
  );
  const weekEndUtc = buildUtcDateFromMadridLocal(
    nextMondayLocalUtc.getUTCFullYear(),
    nextMondayLocalUtc.getUTCMonth(),
    nextMondayLocalUtc.getUTCDate(),
    0,
    0
  );

  const due =
    local.isoWeekday > 5 ||
    (local.isoWeekday === 5 && (local.hour > 1 || (local.hour === 1 && local.minute >= 0)));

  return {
    weekKey: getIsoWeekKey(local.year, local.month, local.day),
    weekStartUtc,
    weekEndUtc,
    due,
    nowLocal: `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')} ${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}:${String(local.second).padStart(2, '0')}`,
    local
  };
};

const computeWeeklyForm = (player: WeeklyMaintenancePlayerRow) => {
  const currentForm = Number(player.forma ?? 80);
  const stamina = Number(player.stamina ?? 100);
  const weeklyTrainSlots = Number(player.entrenos_semanales ?? 0);

  return Math.max(
    45,
    Math.min(
      99,
      Math.round(
        currentForm * 0.72 +
          22 +
          ((stamina - 70) * 0.18) -
          (weeklyTrainSlots * 2) +
          ((Math.random() * 8) - 4)
      )
    )
  );
};

const persistPlayersBatch = async (
  supabase: SupabaseClient,
  players: WeeklyMaintenancePlayerRow[]
) => {
  const { error } = await supabase.from('players').upsert(players, { onConflict: 'id' });
  if (!error) return;

  // Fallback más lento, pero evita dejar la semana bloqueada si el upsert parcial cambia de comportamiento.
  for (const chunk of chunkArray(players, 50)) {
    const updates = await Promise.all(
      chunk.map((player) =>
        supabase
          .from('players')
          .update({
            forma: player.forma,
            entrenos_semanales: player.entrenos_semanales
          })
          .eq('id', player.id)
      )
    );

    const firstError = updates.find((entry) => entry.error)?.error;
    if (firstError) {
      throw new Error(`No se pudo persistir mantenimiento semanal: ${toErrorText(firstError)}`);
    }
  }
};

const fetchAllPlayers = async (supabase: SupabaseClient) => {
  const pageSize = 1000;
  const allPlayers: WeeklyMaintenancePlayerRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`No se pudieron cargar jugadores para mantenimiento semanal: ${toErrorText(error)}`);
    }

    const batch = (data || []) as WeeklyMaintenancePlayerRow[];
    allPlayers.push(...batch);
    if (batch.length < pageSize) break;
  }

  return allPlayers;
};

export const runWeeklyMaintenanceFallback = async (
  supabase: SupabaseClient,
  opts?: { now?: Date; force?: boolean }
): Promise<WeeklyMaintenanceFallbackResult> => {
  const now = opts?.now || new Date();
  const force = opts?.force === true;
  const context = getMadridWeekWindow(now);

  if (!force && !context.due) {
    return {
      status: 'skipped_not_due',
      week_key: context.weekKey,
      now_local: context.nowLocal
    };
  }

  const { count: currentWeekSalaryRuns, error: markerError } = await supabase
    .from('finance_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('concepto', WEEKLY_MAINTENANCE_MARKER_CONCEPT)
    .gte('fecha', context.weekStartUtc.toISOString())
    .lt('fecha', context.weekEndUtc.toISOString());

  if (markerError) {
    throw new Error(`No se pudo verificar mantenimiento semanal previo: ${toErrorText(markerError)}`);
  }

  if (Number(currentWeekSalaryRuns || 0) > 0) {
    return {
      status: 'already_done',
      week_key: context.weekKey,
      now_local: context.nowLocal
    };
  }

  const players = await fetchAllPlayers(supabase);
  const updatedPlayers = players.map((player) => ({
    ...player,
    forma: computeWeeklyForm(player),
    entrenos_semanales: 0
  }));

  for (const chunk of chunkArray(updatedPlayers, 200)) {
    await persistPlayersBatch(supabase, chunk);
  }

  const { data: firstClub, error: clubError } = await supabase
    .from('clubes')
    .select('id')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (clubError || !firstClub?.id) {
    throw new Error(`No se pudo registrar marcador semanal: ${toErrorText(clubError)}`);
  }

  const { error: markerInsertError } = await supabase.from('finance_transactions').insert({
    team_id: firstClub.id,
    concepto: WEEKLY_MAINTENANCE_MARKER_CONCEPT,
    monto: 0,
    tipo: 'GASTO',
    fecha: now.toISOString()
  });

  if (markerInsertError) {
    throw new Error(`No se pudo registrar mantenimiento semanal: ${toErrorText(markerInsertError)}`);
  }

  return {
    status: 'ok',
    week_key: context.weekKey,
    now_local: context.nowLocal,
    players_form_updated: updatedPlayers.length,
    weekly_train_slots_reset: players.filter((player) => Number(player.entrenos_semanales || 0) !== 0).length
  };
};
