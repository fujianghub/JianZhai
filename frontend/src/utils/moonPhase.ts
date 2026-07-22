/**
 * Real lunar phase for the starry theme's moon — the moon on screen matches
 * the moon outside the window tonight.
 *
 * Mean-cycle approximation: days since a reference new moon, modulo the mean
 * synodic month. Accurate to within ~±0.6 day of the true phase (true new/full
 * moons wander around the mean due to lunar orbit eccentricity), which is more
 * than enough for a painted moon.
 */

/** mean synodic month, days */
export const SYNODIC_DAYS = 29.530588853;

/** a well-known reference new moon: 2000-01-06 18:14 UTC */
const EPOCH_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);

const DAY_MS = 86_400_000;

/** age of the moon in days since new moon, in [0, SYNODIC_DAYS) */
export function moonAge(date: Date): number {
  const days = (date.getTime() - EPOCH_NEW_MOON_MS) / DAY_MS;
  return ((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
}

/** phase fraction in [0, 1): 0 = new, 0.25 = first quarter, 0.5 = full */
export function moonPhaseFraction(date: Date): number {
  return moonAge(date) / SYNODIC_DAYS;
}

/** illuminated fraction of the disc, [0, 1] */
export function moonIllumination(date: Date): number {
  return (1 - Math.cos(moonPhaseFraction(date) * Math.PI * 2)) / 2;
}

/** Chinese phase name for the given date (新月 … 残月) */
export function moonPhaseName(date: Date): string {
  const p = moonPhaseFraction(date);
  if (p < 0.03 || p > 0.97) return '新月';
  if (p < 0.22) return '娥眉月';
  if (p < 0.28) return '上弦月';
  if (p < 0.47) return '盈凸月';
  if (p <= 0.53) return '满月';
  if (p < 0.72) return '亏凸月';
  if (p < 0.78) return '下弦月';
  return '残月';
}
