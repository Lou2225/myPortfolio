export const DEFAULT_BIRTH_DATE = "2004-06-15";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse an ISO calendar date string (YYYY-MM-DD) safely without timezone shift.
 * Returns null if the string is malformed or represents an impossible date (e.g. Feb 30).
 */
export function parseIsoDate(
  isoDate: string
): { year: number; month: number; day: number } | null {
  if (!ISO_DATE_RE.test(isoDate)) return null;
  const [yStr, mStr, dStr] = isoDate.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/**
 * Compute exact age in completed years from an ISO YYYY-MM-DD birth date.
 */
export function calculateAge(
  birthDate: string,
  referenceDate: Date = new Date()
): number | null {
  const parsed = parseIsoDate(birthDate);
  if (!parsed) return null;

  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth() + 1;
  const currentDay = referenceDate.getDate();

  let age = currentYear - parsed.year;
  const birthdayNotYetReached =
    currentMonth < parsed.month ||
    (currentMonth === parsed.month && currentDay < parsed.day);

  if (birthdayNotYetReached) {
    age -= 1;
  }

  if (age < 0 || age > 130) return null;
  return age;
}

/**
 * Format an ISO birth date into a clean display label (e.g. "Jun 15, 2004").
 */
export function formatBirthDateReadable(isoDate: string): string {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return isoDate;
  const dt = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

/**
 * Compute dynamic HTML <input type="date"> min/max bounds for a given age range.
 */
export function getBirthDateBounds(
  minAge = 15,
  maxAge = 100,
  referenceDate: Date = new Date()
): { min: string; max: string } {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");
  const day = String(referenceDate.getDate()).padStart(2, "0");

  return {
    min: `${year - maxAge}-${month}-${day}`,
    max: `${year - minAge}-${month}-${day}`,
  };
}

