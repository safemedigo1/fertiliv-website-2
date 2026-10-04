import { getIstanbulDateKey } from "./availabilityFoundation";

/**
 * Validates an External Report date as a clinic-calendar date, not as a local or UTC instant.
 * This keeps an Istanbul "today" valid throughout the clinic day at timezone boundaries.
 */
export function isValidExternalReportDate(value: string, now = new Date()): boolean {
  if (!value) return true;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year
    || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day
    || year < 1900
  ) return false;
  return value <= getIstanbulDateKey(now);
}

/** Converts an existing persisted report timestamp to its clinic-calendar date key. */
export function externalReportDateKey(date: Date): string {
  return getIstanbulDateKey(date);
}
