/**
 * Date validation helpers for historical medical fields.
 *
 * These helpers are intentionally iOS-safe: they do NOT rely on the HTML
 * `max` attribute (which iOS Safari may ignore) and instead perform
 * JavaScript comparisons.
 *
 * Rules:
 *  - Historical fields must not accept future dates.
 *  - Today is the maximum allowed date.
 *  - Appointment / scheduling fields are NOT affected by these helpers.
 */

/** Today's date at midnight local time, as a Date object */
function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Today in YYYY-MM-DD format (for use as HTML input[type=date] max) */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Current month in YYYY-MM format (for use as HTML input[type=month] max) */
export function currentMonthISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Returns true if the given YYYY-MM-DD value is strictly in the future.
 * Returns false for empty/invalid values (no false positives).
 */
export function isFutureDate(value: string | undefined | null): boolean {
  if (!value) return false;
  // Parse as local date to avoid UTC offset issues
  const parts = value.split("-");
  if (parts.length !== 3) return false;
  const [y, mo, d] = parts.map(Number);
  if (!y || !mo || !d) return false;
  const selected = new Date(y, mo - 1, d);
  selected.setHours(0, 0, 0, 0);
  return selected > todayMidnight();
}

/**
 * Returns true if the given YYYY-MM (or YYYY) value represents a future
 * month/year.  Returns false for empty/invalid values.
 */
export function isFutureMonth(value: string | undefined | null): boolean {
  if (!value) return false;
  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1]; // may be undefined for year-only values
  if (!year) return false;
  const now = new Date();
  if (month === undefined) {
    // Year-only: future if year > current year
    return year > now.getFullYear();
  }
  const selectedYM = year * 12 + month;
  const currentYM = now.getFullYear() * 12 + (now.getMonth() + 1);
  return selectedYM > currentYM;
}

/** Human-readable error message for future-date violations */
export const FUTURE_DATE_ERROR =
  "Future dates are not allowed for historical records.";
