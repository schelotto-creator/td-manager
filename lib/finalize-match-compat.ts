const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getErrorText = (error: unknown) => {
  if (!error) return '';
  if (typeof error === 'string') return error.toLowerCase();
  if (!isRecord(error)) return String(error).toLowerCase();

  return [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
};

const getErrorCode = (error: unknown) =>
  isRecord(error) && typeof error.code === 'string'
    ? error.code.toLowerCase()
    : '';

export const isFinalizeMatchRpcMissing = (error: unknown) => {
  const message = getErrorText(error);
  const code = getErrorCode(error);

  if (code === 'pgrst202' || code === '42883') return true;

  return (
    message.includes('finalize_match_transaction') &&
    (message.includes('could not find the function') ||
      message.includes('no function matches') ||
      message.includes('does not exist') ||
      message.includes('not found'))
  );
};

export const shouldFallbackFromFinalizeMatchRpc = (error: unknown) => {
  if (isFinalizeMatchRpcMissing(error)) return true;

  const message = getErrorText(error);
  const code = getErrorCode(error);

  return (
    code === '42703' ||
    code === '42p01' ||
    message.includes('player_stats schema unsupported') ||
    message.includes('schema cache')
  );
};

export const hasMissingStandingsColumns = (error: unknown) => {
  const message = getErrorText(error);
  const code = getErrorCode(error);

  return (
    code === '42703' ||
    ['pj', 'v', 'd', 'pts'].some(
      (column) =>
        message.includes(`clubes.${column}`) ||
        message.includes(`column "${column}"`)
    )
  );
};
