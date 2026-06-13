import type { SupabaseClient } from '@supabase/supabase-js';

export type MatchRosterPlayerRow = {
  id: number;
  name: string;
  position: string;
  overall: number;
  shooting_2pt?: number | null;
  shooting_3pt?: number | null;
  defense?: number | null;
  passing?: number | null;
  rebounding?: number | null;
  dribbling?: number | null;
  speed?: number | null;
  stamina?: number | null;
  experience?: number | null;
  forma?: number | null;
  team_id: string;
};

const PLAYER_SELECT_FIELDS =
  'id,name,position,overall,shooting_2pt,shooting_3pt,defense,passing,rebounding,dribbling,speed,stamina,experience,forma,team_id';
const LEGACY_PLAYER_SELECT_FIELDS =
  'id,name,position,overall,shooting_2pt,shooting_3pt,defense,passing,rebounding,dribbling,speed,stamina,experience,team_id';
const DEFAULT_ROSTER_LIMIT = 30;
const FETCH_CONCURRENCY = 8;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toErrorText = (error: unknown) => {
  if (!error) return 'Error desconocido';
  if (typeof error === 'string') return error;
  if (!isRecord(error)) return String(error);
  return [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .trim() || JSON.stringify(error);
};

const hasMissingFormaColumn = (error: unknown) => {
  const message = toErrorText(error).toLowerCase();
  return (
    message.includes('column players.forma does not exist') ||
    message.includes('column "forma" does not exist') ||
    (message.includes('forma') && message.includes('does not exist'))
  );
};

export const collectRotationPlayerIds = (...sources: unknown[]) => {
  const ids = new Set<number>();

  sources.forEach((source) => {
    const candidate =
      isRecord(source) && isRecord(source.rotations)
        ? source.rotations
        : source;
    if (!isRecord(candidate)) return;

    ['q1', 'q2', 'q3', 'q4'].forEach((quarter) => {
      const slots = candidate[quarter];
      if (!isRecord(slots)) return;
      Object.values(slots).forEach((rawId) => {
        const playerId = Number(rawId);
        if (Number.isInteger(playerId) && playerId > 0) ids.add(playerId);
      });
    });
  });

  return [...ids];
};

const fetchTeamRoster = async (
  supabase: SupabaseClient,
  teamId: string,
  limit: number,
  preferredPlayerIds: number[]
) => {
  let selectFields = PLAYER_SELECT_FIELDS;
  let usedLegacySchema = false;

  const firstPlayerResult = await supabase
    .from('players')
    .select('id')
    .eq('team_id', teamId)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstPlayerResult.error) {
    throw new Error(
      `No se pudo localizar la plantilla ${teamId}: ${toErrorText(firstPlayerResult.error)}`
    );
  }

  const firstPlayerId = Number(firstPlayerResult.data?.id);
  const runBaseQuery = () =>
    supabase
      .from('players')
      .select(selectFields)
      .eq('team_id', teamId)
      .gte('id', firstPlayerId)
      .lte('id', firstPlayerId + 5_000)
      .order('id', { ascending: true })
      .limit(limit);

  let baseResult = Number.isFinite(firstPlayerId)
    ? await runBaseQuery()
    : null;
  if (baseResult?.error && hasMissingFormaColumn(baseResult.error)) {
    selectFields = LEGACY_PLAYER_SELECT_FIELDS;
    usedLegacySchema = true;
    baseResult = await runBaseQuery();
  }
  if (baseResult?.error) {
    throw new Error(`No se pudo cargar la plantilla ${teamId}: ${toErrorText(baseResult.error)}`);
  }

  const players = [...((baseResult?.data || []) as unknown as MatchRosterPlayerRow[])];
  const loadedIds = new Set(players.map((player) => Number(player.id)));
  const missingPreferredIds = preferredPlayerIds.filter((playerId) => !loadedIds.has(playerId));

  if (missingPreferredIds.length > 0) {
    const preferredResult = await supabase
      .from('players')
      .select(selectFields)
      .eq('team_id', teamId)
      .in('id', missingPreferredIds);

    if (preferredResult.error) {
      throw new Error(
        `No se pudo completar la rotación ${teamId}: ${toErrorText(preferredResult.error)}`
      );
    }

    (preferredResult.data || []).forEach((rawPlayer) => {
      const player = rawPlayer as unknown as MatchRosterPlayerRow;
      if (loadedIds.has(Number(player.id))) return;
      loadedIds.add(Number(player.id));
      players.push(player);
    });
  }

  return { players, usedLegacySchema };
};

export const fetchSimulationRosters = async (
  supabase: SupabaseClient,
  teamIds: string[],
  opts?: {
    limitPerTeam?: number;
    preferredPlayerIdsByTeam?: Map<string, number[]>;
  }
) => {
  const uniqueTeamIds = [...new Set(teamIds.map(String).filter(Boolean))];
  const limit = Math.max(5, Math.min(60, Number(opts?.limitPerTeam || DEFAULT_ROSTER_LIMIT)));
  const players: MatchRosterPlayerRow[] = [];
  let usedLegacySchema = false;

  for (let i = 0; i < uniqueTeamIds.length; i += FETCH_CONCURRENCY) {
    const batch = uniqueTeamIds.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.all(
      batch.map((teamId) =>
        fetchTeamRoster(
          supabase,
          teamId,
          limit,
          opts?.preferredPlayerIdsByTeam?.get(teamId) || []
        )
      )
    );

    results.forEach((result) => {
      players.push(...result.players);
      usedLegacySchema ||= result.usedLegacySchema;
    });
  }

  return {
    players,
    warnings: usedLegacySchema
      ? ['Schema legacy en players: columna forma no encontrada, se simula sin forma.']
      : []
  };
};
