/**
 * FlexDatePicker
 *
 * A single-field date picker that supports optional precision:
 *   - Year only      → stored as "2021",       displayed as "2021"
 *   - Month + Year   → stored as "2021-05",    displayed as "May 2021"
 *   - Full date      → stored as "2021-05-15", displayed as "15 May 2021"
 *
 * UI: Three cascading selects rendered inline.
 *   [Day (opt.)] [Month (opt.)] [Year]
 *
 * Rules:
 *   - Year is always required for a non-empty value.
 *   - Month is optional; if cleared, day is also cleared.
 *   - Day is optional; requires month to be set first.
 *
 * Backward compatible with existing free-text year values (e.g. "2021").
 */

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS = [
  { value: "01", label: "Jan", full: "January" },
  { value: "02", label: "Feb", full: "February" },
  { value: "03", label: "Mar", full: "March" },
  { value: "04", label: "Apr", full: "April" },
  { value: "05", label: "May", full: "May" },
  { value: "06", label: "Jun", full: "June" },
  { value: "07", label: "Jul", full: "July" },
  { value: "08", label: "Aug", full: "August" },
  { value: "09", label: "Sep", full: "September" },
  { value: "10", label: "Oct", full: "October" },
  { value: "11", label: "Nov", full: "November" },
  { value: "12", label: "Dec", full: "December" },
];

const currentYear = new Date().getFullYear();
const YEARS: string[] = [];
for (let y = currentYear; y >= 1950; y--) {
  YEARS.push(String(y));
}

function daysInMonth(year: string, month: string): number {
  if (!year || !month) return 31;
  return new Date(Number(year), Number(month), 0).getDate();
}

// ─── Parse / format helpers ───────────────────────────────────────────────────

interface DateParts {
  year: string;
  month: string;
  day: string;
}

function parseValue(value: string): DateParts {
  if (!value) return { year: "", month: "", day: "" };
  const trimmed = value.trim();
  const parts = trimmed.split("-");
  // Handle legacy free-text year like "2021"
  const year = parts[0] ?? "";
  const month = parts[1] ?? "";
  const day = parts[2] ?? "";
  return { year, month, day };
}

function formatValue(year: string, month: string, day: string): string {
  if (!year) return "";
  if (!month) return year;
  if (!day) return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

/** Display a stored flex-date value as a human-readable string */
export function displayFlexDate(value: string): string {
  if (!value) return "";
  const { year, month, day } = parseValue(value);
  if (!year) return value;
  const monthObj = MONTHS.find(m => m.value === month);
  if (day && monthObj) return `${Number(day)} ${monthObj.full} ${year}`;
  if (monthObj) return `${monthObj.full} ${year}`;
  return year;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface FlexDatePickerProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** If true, day selector is hidden (month+year only mode) */
  monthYearOnly?: boolean;
}

export function FlexDatePicker({
  label = "Date",
  value,
  onChange,
  className,
  monthYearOnly = false,
}: FlexDatePickerProps) {
  const { year, month, day } = parseValue(value);

  const handleYearChange = (y: string) => {
    onChange(formatValue(y, month, day));
  };

  const handleMonthChange = (m: string) => {
    const newMonth = m === "__none__" ? "" : m;
    // If month is cleared, also clear day
    const newDay = newMonth ? day : "";
    onChange(formatValue(year, newMonth, newDay));
  };

  const handleDayChange = (d: string) => {
    const newDay = d === "__none__" ? "" : d;
    onChange(formatValue(year, month, newDay));
  };

  const maxDay = daysInMonth(year, month);
  const DAYS: string[] = [];
  for (let d = 1; d <= maxDay; d++) {
    DAYS.push(String(d).padStart(2, "0"));
  }

  const wrapperStyle: React.CSSProperties = {
    minWidth: 0,
    maxWidth: "100%",
    width: "100%",
    boxSizing: "border-box",
  };

  const colStyle: React.CSSProperties = {
    flex: "1 1 0",
    minWidth: 0,
    maxWidth: "100%",
    boxSizing: "border-box",
  };

  return (
    <div className={`space-y-1 ${className ?? ""}`} style={wrapperStyle}>
      {label && (
        <Label className="text-[11px] font-medium text-muted-foreground leading-none">
          {label}
        </Label>
      )}

      <div
        style={{
          display: "flex",
          gap: "6px",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          boxSizing: "border-box",
        }}
      >
        {/* Day — optional, only shown when monthYearOnly=false and month is set */}
        {!monthYearOnly && (
          <div style={colStyle}>
            <Select
              value={day || "__none__"}
              onValueChange={handleDayChange}
              disabled={!month}
            >
              <SelectTrigger
                className="h-8 text-xs w-full"
                style={{ width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
              >
                <SelectValue placeholder="Day" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Day (opt.)</SelectItem>
                {DAYS.map(d => (
                  <SelectItem key={d} value={d}>{Number(d)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Month — optional */}
        <div style={colStyle}>
          <Select value={month || "__none__"} onValueChange={handleMonthChange}>
            <SelectTrigger
              className="h-8 text-xs w-full"
              style={{ width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
            >
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Month (opt.)</SelectItem>
              {MONTHS.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.full}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Year — required for a non-empty value */}
        <div style={colStyle}>
          <Select value={year || ""} onValueChange={handleYearChange}>
            <SelectTrigger
              className="h-8 text-xs w-full"
              style={{ width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
            >
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map(y => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!monthYearOnly && (
        <p className="text-[10px] text-muted-foreground/60 leading-none pt-0.5">
          Day optional
        </p>
      )}
    </div>
  );
}
