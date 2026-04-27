export const DEFAULT_SEASON_NUMBER = 1;
export const SEASON_LENGTH_WEEKS = 8;
export const MATCH_SCHEDULE_TIME_ZONE = 'Europe/Madrid';

type MaybeSeasonedMatch = {
  season_number?: number | null;
  played?: boolean | null;
};

const MADRID_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: MATCH_SCHEDULE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

const getFormatterPartNumber = (
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
) => {
  const value = parts.find((part) => part.type === type)?.value;
  return Number(value || '0');
};

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
    getFormatterPartNumber(zonedParts, 'year'),
    getFormatterPartNumber(zonedParts, 'month') - 1,
    getFormatterPartNumber(zonedParts, 'day'),
    getFormatterPartNumber(zonedParts, 'hour'),
    getFormatterPartNumber(zonedParts, 'minute'),
    getFormatterPartNumber(zonedParts, 'second')
  );
  const desiredLocalMs = Date.UTC(year, monthIndex, day, hour, minute, 0);
  return new Date(initialUtcGuess.getTime() + (desiredLocalMs - actualLocalMs));
};

export const normalizeSeasonNumber = (seasonNumber?: number | string | null) => {
  const numeric = Number(seasonNumber);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : DEFAULT_SEASON_NUMBER;
};

export const getMatchSeasonNumber = (match: MaybeSeasonedMatch) =>
  normalizeSeasonNumber(match.season_number);

export const getLatestSeasonNumber = (matches: MaybeSeasonedMatch[]) =>
  matches.reduce(
    (latest, match) => Math.max(latest, getMatchSeasonNumber(match)),
    DEFAULT_SEASON_NUMBER
  );

export const filterMatchesBySeason = <T extends MaybeSeasonedMatch>(
  matches: T[],
  seasonNumber = getLatestSeasonNumber(matches)
) => matches.filter((match) => getMatchSeasonNumber(match) === seasonNumber);

export const getNextSeasonNumber = (matches: MaybeSeasonedMatch[]) => {
  if (matches.length === 0) return DEFAULT_SEASON_NUMBER;

  const latestSeasonNumber = getLatestSeasonNumber(matches);
  const latestSeasonMatches = filterMatchesBySeason(matches, latestSeasonNumber);
  const latestSeasonComplete =
    latestSeasonMatches.length > 0 && latestSeasonMatches.every((match) => match.played);

  return latestSeasonComplete ? latestSeasonNumber + 1 : latestSeasonNumber;
};

export const hasMissingSeasonColumn = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const text = JSON.stringify(error).toLowerCase();
  return (
    text.includes('season_number') &&
    (text.includes('does not exist') ||
      text.includes('could not find') ||
      text.includes('schema cache') ||
      text.includes('column'))
  );
};

export const computeMatchDateFromJornada = (
  jornada: number | null | undefined,
  seasonNumber: number | null | undefined = DEFAULT_SEASON_NUMBER
) => {
  const numericRound = Number(jornada);
  if (!Number.isFinite(numericRound)) return null;

  const round = Math.max(1, Math.trunc(numericRound));
  const season = normalizeSeasonNumber(seasonNumber);
  const weekOffset = Math.floor((round - 1) / 2) + ((season - 1) * SEASON_LENGTH_WEEKS);
  const isSaturday = round % 2 === 0;
  const daysToAdd = weekOffset * 7 + (isSaturday ? 3 : 0);
  const baseDate = new Date(Date.UTC(2026, 2, 4 + daysToAdd, 0, 0, 0));

  return buildUtcDateFromMadridLocal(
    baseDate.getUTCFullYear(),
    baseDate.getUTCMonth(),
    baseDate.getUTCDate(),
    isSaturday ? 12 : 18,
    30
  );
};
