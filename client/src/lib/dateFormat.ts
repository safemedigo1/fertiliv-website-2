/**
 * dateFormat.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised date-display helpers for the Fertiliv platform.
 *
 * All dates shown to users must follow dd/mm/yyyy (or dd/mm/yyyy hh:mm for
 * timestamps), consistent with the clinic's regional convention.
 *
 * Rules:
 *  - fmtDate(value)          → "14/06/2026"
 *  - fmtDateTime(value)      → "14/06/2026 09:30"
 *  - fmtDateLong(value)      → "14 Jun 2026"   (for invoices, proposals, etc.)
 *  - fmtDateWithDay(value)   → "Saturday, 14 June 2026"  (for audit log headers)
 *  - fmtDateAge(dob)         → "14/06/1990 · 36 yrs"
 *
 * All helpers accept: Date | string | number | null | undefined
 * and return "" for falsy / invalid values.
 *
 * ─── PLATFORM RULE ───────────────────────────────────────────────────────────
 * Calendar-date fields (DOB, marriage date, follow-up date, any date-only
 * field) MUST use fmtDate / fmtDateAge / fmtDateLong / fmtDateWithDay for
 * display, and toDateInputValue() to initialize <input type="date"> values.
 * Never use date-fns format() for calendar-date fields.
 *
 * Timestamp fields (createdAt, updatedAt, payment timestamps, message
 * timestamps) may use date-fns format() with local-timezone display.
 * Timestamp fields used in <input type="date"> may use format(new Date(v), "yyyy-MM-dd")
 * because they represent moments in time and local-timezone display is expected.
 *
 * ─── UTC INVARIANT ───────────────────────────────────────────────────────────
 * Calendar dates (DOB, etc.) are stored as DATE columns in MySQL and arrive
 * on the frontend as Date objects at midnight UTC (e.g. 1990-06-14T00:00:00Z).
 * All calendar-date display functions use UTC methods (getUTCDate, getUTCMonth,
 * getUTCFullYear) to guarantee the same calendar day is shown regardless of
 * the user's browser timezone.
 *
 * DO NOT use getDate() / getMonth() / getFullYear() for calendar-date fields —
 * those methods apply local timezone offset and will show the wrong day for
 * users in UTC- timezones.
 */

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** "14/06/2026" — calendar-date display using UTC methods */
export function fmtDate(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** "14/06/2026 09:30" — timestamp display using local timezone (correct for moments in time) */
export function fmtDateTime(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${fmtDate(d)} ${hh}:${min}`;
}

/** "14 Jun 2026" — calendar-date display using UTC methods, for invoices, proposals, formal documents */
export function fmtDateLong(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  // Use UTC date parts to build a locale-formatted string without timezone shift
  const utcDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return utcDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "Saturday, 14 June 2026" — calendar-date display using UTC methods, for audit log date separators */
export function fmtDateWithDay(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  // Use UTC date parts to build a locale-formatted string without timezone shift
  const utcDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return utcDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * "1990-06-14" — UTC-safe YYYY-MM-DD string for initializing <input type="date"> values.
 *
 * MUST be used for all calendar-date fields (DOB, marriage date, etc.) instead of
 * format(new Date(value), "yyyy-MM-dd") which applies local timezone offset and
 * will return the wrong day for users in UTC− timezones.
 *
 * Safe for: Date objects, ISO strings ("1990-06-14T00:00:00.000Z"), YYYY-MM-DD strings.
 * Returns "" for falsy / invalid values.
 */
export function toDateInputValue(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** "14/06/1990 · 36 yrs" — calendar-date DOB display with UTC-safe age calculation */
export function fmtDateAge(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "";
  // Age calculation using UTC calendar values to avoid timezone-dependent birthday shifts
  const now = new Date();
  const birthYear = d.getUTCFullYear();
  const birthMonth = d.getUTCMonth();
  const birthDay = d.getUTCDate();
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth();
  const nowDay = now.getUTCDate();
  let age = nowYear - birthYear;
  if (nowMonth < birthMonth || (nowMonth === birthMonth && nowDay < birthDay)) {
    age--;
  }
  return `${fmtDate(d)} · ${age} yrs`;
}
