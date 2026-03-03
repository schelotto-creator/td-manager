export type ExperienceProfile = 'rookie' | 'prospect' | 'rotation' | 'standard';

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const getRandomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export function getExperienceForAge(age: number, profile: ExperienceProfile = 'standard'): number {
  const safeAge = clamp(Math.round(age), 18, 38);

  // Base progression: older players tend to accumulate more game experience.
  const center = (safeAge - 18) * 4 + 8;
  const spread = safeAge < 23 ? 10 : safeAge < 30 ? 14 : 18;

  let min = clamp(center - spread, 1, 99);
  let max = clamp(center + spread, 1, 99);

  switch (profile) {
    case 'rookie':
      min = clamp(min - 8, 1, 99);
      max = clamp(max - 18, 1, 35);
      break;
    case 'prospect':
      min = clamp(min - 4, 1, 99);
      max = clamp(max - 10, 1, 50);
      break;
    case 'rotation':
      min = clamp(min + 8, 1, 99);
      max = clamp(max + 12, 1, 99);
      break;
    default:
      break;
  }

  if (min > max) min = max;
  return getRandomInt(min, max);
}

export function rollAgeAndExperience(
  ageMin: number,
  ageMax: number,
  profile: ExperienceProfile = 'standard'
) {
  const age = getRandomInt(ageMin, ageMax);
  const experience = getExperienceForAge(age, profile);
  return { age, experience };
}
