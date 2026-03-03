const BASE_PER_OVR = 500;
const STAR_THRESHOLD = 60;
const STAR_QUADRATIC_FACTOR = 180;

export function getWeeklySalaryByOvr(overall: number): number {
  const ovr = Math.max(1, Math.min(99, Math.round(overall || 1)));
  const premium = Math.max(0, ovr - STAR_THRESHOLD);
  return Math.round((ovr * BASE_PER_OVR) + (premium * premium * STAR_QUADRATIC_FACTOR));
}
