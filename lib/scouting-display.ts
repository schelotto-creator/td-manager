export const POSITION_BADGE: Record<string, { abbr: string; bg: string; border: string; text: string }> = {
  'Base':      { abbr: 'PG', bg: 'bg-sky-500/15',     border: 'border-sky-500/40',     text: 'text-sky-300' },
  'Escolta':   { abbr: 'SG', bg: 'bg-cyan-500/15',    border: 'border-cyan-500/40',    text: 'text-cyan-300' },
  'Alero':     { abbr: 'SF', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-300' },
  'Ala-Pívot': { abbr: 'PF', bg: 'bg-orange-500/15',  border: 'border-orange-500/40',  text: 'text-orange-300' },
  'Pívot':     { abbr: 'C',  bg: 'bg-violet-500/15',  border: 'border-violet-500/40',  text: 'text-violet-300' },
};
export const getPositionBadge = (position: string) =>
  POSITION_BADGE[position] ?? { abbr: position.slice(0, 2).toUpperCase(), bg: 'bg-slate-700/50', border: 'border-slate-600', text: 'text-slate-300' };

export const SCOUT_STATS = [
  'speed', 'stamina', 'shooting_3pt', 'shooting_2pt',
  'dribbling', 'defense', 'rebounding', 'passing'
] as const;

export type ScoutStat = typeof SCOUT_STATS[number];

export const SCOUT_STAT_LABELS: Record<ScoutStat, string> = {
  speed: 'Ritmo',
  stamina: 'Stamina',
  shooting_3pt: 'T3',
  shooting_2pt: 'T2',
  dribbling: 'Manejo',
  defense: 'DEF',
  rebounding: 'REB',
  passing: 'Pase',
};

export const getShuffledStats = (seed: number): string[] => {
  const stats = [...SCOUT_STATS] as string[];
  let m = stats.length, t: string, i: number;
  let s = seed;
  while (m) {
    const x = Math.sin(s++) * 10000;
    i = Math.floor((x - Math.floor(x)) * m--);
    t = stats[m]; stats[m] = stats[i]; stats[i] = t;
  }
  return stats;
};

export const getStatInterval = (val: number, spread: number, seed: number) => {
  const x = Math.sin(seed) * 10000;
  const r = x - Math.floor(x);
  const off = Math.floor(r * (spread + 1));
  return { min: Math.max(1, val - spread + off), max: Math.min(99, val + spread + off) };
};

export const getMissingStats = (
  playerId: number,
  talentoOjo: number,
  ojeos: Record<string | number, string[]>
): string[] => {
  const shuffled = getShuffledStats(playerId);
  const nativelyExact = talentoOjo === 3 ? 8 : talentoOjo === 2 ? 4 : talentoOjo === 1 ? 2 : 0;
  const known = [...shuffled.slice(0, nativelyExact), ...(ojeos[playerId] ?? ojeos[String(playerId)] ?? [])];
  return SCOUT_STATS.filter(s => !known.includes(s));
};

export const getOverallDisplay = (
  playerId: number,
  trueOverall: number,
  talentoOjo: number,
  ojeos: Record<string | number, string[]>
): string => {
  const missing = getMissingStats(playerId, talentoOjo, ojeos);
  if (missing.length === 0) return String(trueOverall);
  const spread = talentoOjo === 3 ? 1 : talentoOjo === 2 ? 2 : talentoOjo === 1 ? 4 : 6;
  const { min, max } = getStatInterval(trueOverall, spread, playerId);
  return `${min}-${max}`;
};

export const getStatDisplay = (
  playerId: number,
  statName: string,
  statValue: number,
  talentoOjo: number,
  ojeos: Record<string | number, string[]>
): { type: 'exact' | 'scouted' | 'range' | 'hidden'; value?: number; min?: number; max?: number } => {
  const scouted = (ojeos[playerId] ?? ojeos[String(playerId)] ?? []).includes(statName);
  if (scouted) return { type: 'scouted', value: statValue };

  const shuffled = getShuffledStats(playerId);
  const idx = shuffled.indexOf(statName);
  const seed = playerId + statName.length;

  if (talentoOjo >= 3) return { type: 'exact', value: statValue };

  if (talentoOjo === 2) {
    if (idx < 4) return { type: 'exact', value: statValue };
    if (idx < 7) { const { min, max } = getStatInterval(statValue, 4, seed); return { type: 'range', min, max }; }
  }
  if (talentoOjo === 1) {
    if (idx < 2) return { type: 'exact', value: statValue };
    if (idx < 5) { const { min, max } = getStatInterval(statValue, 6, seed); return { type: 'range', min, max }; }
  }
  if (talentoOjo === 0 && idx < 3) {
    const { min, max } = getStatInterval(statValue, 8, seed); return { type: 'range', min, max };
  }

  return { type: 'hidden' };
};
