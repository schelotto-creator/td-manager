export const CLUB_STATUS = {
  ROOKIE_DRAFT: 'ROOKIE_DRAFT',
  SEASON_DRAFT: 'SEASON_DRAFT',
  COMPETING: 'COMPETING',
} as const;

export const SEASON_DRAFT_POOL_PREFIX = 'SEASON_DRAFT_POOL_';
export const ROOKIE_DRAFT_POOL_PREFIX = 'ROOKIE_DRAFT_POOL_';

export const getSeasonDraftPoolTag = (teamId: string | number) =>
  `${SEASON_DRAFT_POOL_PREFIX}${teamId}`;

export const getRookieDraftPoolTag = (teamId: string | number) =>
  `${ROOKIE_DRAFT_POOL_PREFIX}${teamId}`;

export const isSeasonDraftPoolTag = (lineupPos?: string | null) =>
  Boolean(lineupPos && lineupPos.startsWith(SEASON_DRAFT_POOL_PREFIX));

export const isRookieDraftPoolTag = (lineupPos?: string | null) =>
  Boolean(lineupPos && lineupPos.startsWith(ROOKIE_DRAFT_POOL_PREFIX));

export const isDraftPoolTag = (lineupPos?: string | null) =>
  isSeasonDraftPoolTag(lineupPos) || isRookieDraftPoolTag(lineupPos);
