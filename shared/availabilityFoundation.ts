export const ISTANBUL_TIME_ZONE = "Europe/Istanbul";

export type WorkingHoursWindow = { start: string; end: string };
export type WeeklyWorkingHours = Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", WorkingHoursWindow[]>>;

/** No business hours are inferred. An Admin must configure the clinic default. */
export const DEFAULT_CLINIC_WEEKLY_WORKING_HOURS: WeeklyWorkingHours = {};

const WEEKDAY_BY_SHORT_NAME: Record<string, keyof WeeklyWorkingHours> = {
  Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat", Sun: "sun",
};

function timeZoneOffsetMs(date: Date, timeZone = ISTANBUL_TIME_ZONE): number {
  const offsetPart = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(date).find((part) => part.type === "timeZoneName")?.value;
  const match = offsetPart?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) throw new Error(`Unable to resolve ${timeZone} offset.`);
  const sign = match[1] === "+" ? 1 : -1;
  return sign * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
}

/** Converts a clinic-local Istanbul date/time to the canonical UTC instant persisted by the database. */
export function istanbulDateTimeToUtc(dateKey: string, time = "00:00:00"): Date {
  const dateMatch = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.match(/^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (!dateMatch || !timeMatch) throw new Error("Invalid clinic date or time.");
  const milliseconds = Number((timeMatch[4] ?? "0").padEnd(3, "0"));
  const utcGuess = new Date(Date.UTC(
    Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]),
    Number(timeMatch[1]), Number(timeMatch[2]), Number(timeMatch[3] ?? 0), milliseconds,
  ));
  return new Date(utcGuess.getTime() - timeZoneOffsetMs(utcGuess));
}

export function getIstanbulDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ISTANBUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function getIstanbulWeekday(date: Date): keyof WeeklyWorkingHours {
  const shortName = new Intl.DateTimeFormat("en-US", {
    timeZone: ISTANBUL_TIME_ZONE,
    weekday: "short",
  }).format(date);
  const weekday = WEEKDAY_BY_SHORT_NAME[shortName];
  if (!weekday) throw new Error("Unable to resolve clinic weekday.");
  return weekday;
}

export function getIstanbulTimeKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ISTANBUL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("hour")}:${value("minute")}`;
}

/** Adds calendar days to an Istanbul date key without relying on browser-local time. */
export function addIstanbulCalendarDays(dateKey: string, days: number): string {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("Invalid clinic date.");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

export function isIstanbulIntervalWithinWorkingHours(
  start: Date,
  end: Date,
  schedule: WeeklyWorkingHours,
): boolean {
  // V1 working-hours windows never span midnight. Use the actual end date,
  // rather than end - 1ms, so 23:30–00:00 cannot be accepted as a same-day slot.
  if (end <= start || getIstanbulDateKey(start) !== getIstanbulDateKey(end)) return false;
  const weekday = getIstanbulWeekday(start);
  const windows = schedule[weekday] ?? [];
  if (windows.length === 0) return false;
  const startKey = getIstanbulTimeKey(start);
  const endKey = getIstanbulTimeKey(end);
  return windows.some((window) => startKey >= window.start && endKey <= window.end);
}

/**
 * A linked availability exception is current only while its exact Time-Off
 * source still exists, belongs to an actual scheduling owner, and overlaps the
 * appointment's full interval. This is deliberately derived state: historical
 * reason/activity/audit evidence is never deleted when the result becomes false.
 */
export function isSourceTimeOffOverrideActive(input: {
  source: { id: number; userId: number; startDate: Date; endDate: Date } | null | undefined;
  appointmentStart: Date;
  appointmentEnd: Date;
  ownerIds: number[];
}): boolean {
  const { source } = input;
  if (!source) return false;
  return input.ownerIds.includes(source.userId)
    && input.appointmentStart < source.endDate
    && input.appointmentEnd > source.startDate;
}

export function normalizeWeeklyWorkingHours(value: unknown): WeeklyWorkingHours {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const parsed: WeeklyWorkingHours = {};
  for (const day of Object.values(WEEKDAY_BY_SHORT_NAME)) {
    const rawWindows = (value as Record<string, unknown>)[day];
    if (!Array.isArray(rawWindows)) continue;
    const windows = rawWindows
      .filter((window): window is WorkingHoursWindow => Boolean(window) && typeof window === "object"
        && typeof (window as WorkingHoursWindow).start === "string"
        && typeof (window as WorkingHoursWindow).end === "string")
      .map((window) => ({ start: window.start, end: window.end }));
    if (windows.length > 0) parsed[day] = windows;
  }
  return parsed;
}

export function validateWeeklyWorkingHours(value: WeeklyWorkingHours): WeeklyWorkingHours {
  const normalized = normalizeWeeklyWorkingHours(value);
  const minutes = (time: string) => {
    const match = time.match(/^(\d{2}):(\d{2})$/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new Error("Working hours must use HH:MM times.");
    return Number(match[1]) * 60 + Number(match[2]);
  };
  for (const day of Object.keys(normalized) as Array<keyof WeeklyWorkingHours>) {
    const windows = [...(normalized[day] ?? [])].sort((a, b) => a.start.localeCompare(b.start));
    let previousEnd = -1;
    for (const window of windows) {
      const start = minutes(window.start);
      const end = minutes(window.end);
      if (end <= start) throw new Error("Each working-hours end time must be after its start time.");
      if (start < previousEnd) throw new Error("Working-hours windows cannot overlap.");
      previousEnd = end;
    }
    normalized[day] = windows;
  }
  return normalized;
}
