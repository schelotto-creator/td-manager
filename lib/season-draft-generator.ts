import type { SupabaseClient } from '@supabase/supabase-js';
import { NAMES_DB } from '@/lib/names-db';
import { rollAgeAndExperience } from '@/lib/player-generation';
import { getWeeklySalaryByOvr } from '@/lib/salary';
import { CLUB_STATUS, getSeasonDraftPoolTag, SEASON_DRAFT_POOL_PREFIX } from '@/lib/season-draft';

export type SeasonDraftGroupRow = {
  id: number;
  nombre?: string | null;
};

export type SeasonDraftClubRow = {
  id: string | number;
  nombre?: string | null;
  grupo_id: number | null;
  league_id?: number | null;
  pts?: number | null;
  v?: number | null;
  d?: number | null;
  is_bot?: boolean | null;
  status?: string | null;
};

export type StartSeasonDraftResult = {
  status: 'ok' | 'skipped';
  groupsChecked: number;
  humanClubs: number;
  botClubs: number;
  prospectsCreated: number;
  oldProspectsDeleted: number;
  message: string;
};

type DraftProspectInput = {
  teamId: string;
  pickIndex: number;
  totalTeams: number;
  position: string;
  directSign: boolean;
};

type SeasonDraftProspectInsert = {
  team_id: string | null;
  lineup_pos: string;
  name: string;
  nationality: string;
  position: string;
  age: number;
  height: number;
  overall: number;
  shooting_3pt: number;
  shooting_2pt: number;
  defense: number;
  passing: number;
  rebounding: number;
  speed: number;
  dribbling: number;
  stamina: number;
  experience: number;
  salary: number;
};

const DRAFT_POOL_POSITIONS = ['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot'];
const NAME_COUNTRIES = Object.keys(NAMES_DB);
const INSERT_CHUNK_SIZE = 500;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const chunkArray = <T>(items: T[], size: number) => {
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

const pickRandom = <T>(items: T[]) =>
  items[Math.floor(Math.random() * items.length)];

const getRandomIdentity = () => {
  const nationality = pickRandom(NAME_COUNTRIES) || 'USA';
  const pool = NAMES_DB[nationality] || NAMES_DB.USA;
  const firstName = pickRandom(pool.first) || 'Rookie';
  const lastName = pickRandom(pool.last) || 'Prospect';
  return { nationality, fullName: `${firstName} ${lastName}` };
};

const getDraftOvrRangeByPick = (pickIndex: number, totalTeams: number) => {
  const safeTotal = Math.max(1, totalTeams - 1);
  const ratio = pickIndex / safeTotal;

  if (ratio <= 0.25) return { min: 69, max: 80 };
  if (ratio <= 0.5) return { min: 65, max: 75 };
  if (ratio <= 0.75) return { min: 61, max: 71 };
  return { min: 57, max: 67 };
};

export const buildSeasonDraftProspect = ({
  teamId,
  pickIndex,
  totalTeams,
  position,
  directSign
}: DraftProspectInput): SeasonDraftProspectInsert => {
  const { nationality, fullName } = getRandomIdentity();
  const { min, max } = getDraftOvrRangeByPick(pickIndex, totalTeams);
  const ovr = clamp(
    Math.floor(Math.random() * (max - min + 1)) + min + Math.floor(Math.random() * 3) - 1,
    min,
    max
  );
  const baseStat = () => clamp(ovr + Math.floor(Math.random() * 15) - 7, 40, 99);
  const { age, experience } = rollAgeAndExperience(18, 20, 'rookie');
  const isGuard = position === 'Base' || position === 'Escolta';

  return {
    team_id: directSign ? teamId : null,
    lineup_pos: directSign ? 'BENCH' : getSeasonDraftPoolTag(teamId),
    name: fullName,
    nationality,
    position,
    age,
    height: isGuard ? Math.floor(Math.random() * 14) + 184 : Math.floor(Math.random() * 16) + 198,
    overall: ovr,
    shooting_3pt: baseStat(),
    shooting_2pt: baseStat(),
    defense: baseStat(),
    passing: baseStat(),
    rebounding: baseStat(),
    speed: baseStat(),
    dribbling: baseStat(),
    stamina: 100,
    experience: Math.max(1, experience),
    salary: getWeeklySalaryByOvr(ovr)
  };
};

const fetchSeasonDraftContext = async (supabase: SupabaseClient) => {
  const [{ data: groups, error: groupsError }, { data: clubs, error: clubsError }] = await Promise.all([
    supabase.from('grupos_liga').select('id, nombre'),
    supabase
      .from('clubes')
      .select('id, nombre, grupo_id, league_id, pts, v, d, is_bot, status')
      .not('grupo_id', 'is', null)
  ]);

  if (groupsError || clubsError) {
    throw new Error(`No se pudo preparar el draft de temporada: ${toErrorText(groupsError || clubsError)}`);
  }

  return {
    groups: ((groups || []) as SeasonDraftGroupRow[]) || [],
    clubs: ((clubs || []) as SeasonDraftClubRow[]) || []
  };
};

const deleteOldSeasonDraftPool = async (supabase: SupabaseClient) => {
  const { data: oldPool, error: oldPoolError } = await supabase
    .from('players')
    .select('id')
    .is('team_id', null)
    .like('lineup_pos', `${SEASON_DRAFT_POOL_PREFIX}%`);

  if (oldPoolError) {
    throw new Error(`No se pudo limpiar el pool anterior de draft: ${toErrorText(oldPoolError)}`);
  }

  const oldIds = ((oldPool || []) as Array<{ id: string | number }>).map((player) => player.id);
  for (const ids of chunkArray(oldIds, INSERT_CHUNK_SIZE)) {
    const { error } = await supabase.from('players').delete().in('id', ids);
    if (error) {
      throw new Error(`No se pudo borrar el pool anterior de draft: ${toErrorText(error)}`);
    }
  }

  return oldIds.length;
};

export const startSeasonDraft = async (
  supabase: SupabaseClient,
  opts?: {
    groups?: SeasonDraftGroupRow[];
    clubs?: SeasonDraftClubRow[];
    deleteOldPool?: boolean;
  }
): Promise<StartSeasonDraftResult> => {
  const context = opts?.groups && opts?.clubs
    ? { groups: opts.groups, clubs: opts.clubs }
    : await fetchSeasonDraftContext(supabase);

  const groups = context.groups;
  const clubs = context.clubs;

  if (groups.length === 0 || clubs.length === 0) {
    return {
      status: 'skipped',
      groupsChecked: groups.length,
      humanClubs: 0,
      botClubs: 0,
      prospectsCreated: 0,
      oldProspectsDeleted: 0,
      message: 'No hay grupos/equipos disponibles para montar el draft.'
    };
  }

  const oldProspectsDeleted = opts?.deleteOldPool === false
    ? 0
    : await deleteOldSeasonDraftPool(supabase);

  const humanClubIds = new Set<string>();
  const botClubIds = new Set<string>();
  const prospectsToInsert: SeasonDraftProspectInsert[] = [];

  for (const group of groups) {
    const teamsInGroup = clubs
      .filter(
        (club) =>
          Number(club.grupo_id) === Number(group.id) &&
          club.status !== CLUB_STATUS.ROOKIE_DRAFT
      )
      .sort((a, b) => {
        const ptsDiff = Number(a.pts || 0) - Number(b.pts || 0);
        if (ptsDiff !== 0) return ptsDiff;
        const winsDiff = Number(a.v || 0) - Number(b.v || 0);
        if (winsDiff !== 0) return winsDiff;
        const lossesDiff = Number(b.d || 0) - Number(a.d || 0);
        if (lossesDiff !== 0) return lossesDiff;
        return String(a.id).localeCompare(String(b.id));
      });

    teamsInGroup.forEach((team, pickIndex) => {
      const teamId = String(team.id);
      if (team.is_bot) {
        botClubIds.add(teamId);
        prospectsToInsert.push(
          buildSeasonDraftProspect({
            teamId,
            pickIndex,
            totalTeams: teamsInGroup.length,
            position: pickRandom(DRAFT_POOL_POSITIONS),
            directSign: true
          })
        );
        return;
      }

      humanClubIds.add(teamId);
      DRAFT_POOL_POSITIONS.forEach((position) => {
        prospectsToInsert.push(
          buildSeasonDraftProspect({
            teamId,
            pickIndex,
            totalTeams: teamsInGroup.length,
            position,
            directSign: false
          })
        );
      });
    });
  }

  if (prospectsToInsert.length === 0) {
    return {
      status: 'skipped',
      groupsChecked: groups.length,
      humanClubs: 0,
      botClubs: 0,
      prospectsCreated: 0,
      oldProspectsDeleted,
      message: 'No hay equipos elegibles para el Draft de Temporada.'
    };
  }

  for (const clubIds of chunkArray([...humanClubIds], INSERT_CHUNK_SIZE)) {
    const { error } = await supabase
      .from('clubes')
      .update({ status: CLUB_STATUS.SEASON_DRAFT })
      .in('id', clubIds);
    if (error) {
      throw new Error(`No se pudo activar el draft para usuarios: ${toErrorText(error)}`);
    }
  }

  for (const clubIds of chunkArray([...botClubIds], INSERT_CHUNK_SIZE)) {
    const { error } = await supabase
      .from('clubes')
      .update({ status: CLUB_STATUS.COMPETING })
      .in('id', clubIds);
    if (error) {
      throw new Error(`No se pudo cerrar el draft automatico de bots: ${toErrorText(error)}`);
    }
  }

  for (const prospectsChunk of chunkArray(prospectsToInsert, INSERT_CHUNK_SIZE)) {
    const { error } = await supabase.from('players').insert(prospectsChunk);
    if (error) {
      throw new Error(`No se pudieron crear prospectos de draft: ${toErrorText(error)}`);
    }
  }

  return {
    status: 'ok',
    groupsChecked: groups.length,
    humanClubs: humanClubIds.size,
    botClubs: botClubIds.size,
    prospectsCreated: prospectsToInsert.length,
    oldProspectsDeleted,
    message: `Draft de temporada iniciado para ${humanClubIds.size} equipos de usuario; ${botClubIds.size} bots firmaron automaticamente.`
  };
};
