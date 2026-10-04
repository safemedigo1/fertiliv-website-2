/**
 * MonthYearPicker
 *
 * A structured date picker that supports:
 *   - Year only  → value stored as "2021",        precision: "year"
 *   - Month+Year → value stored as "2021-05",     precision: "month"
 *
 * The stored value is a plain string in the SurgicalEntry.date field.
 * We encode precision into the string itself:
 *   "2021"    → year only
 *   "2021-05" → month + year
 *
 * This keeps backward compatibility with existing free-text year values
 * (e.g. "2021" already stored) while adding month precision going forward.
 */

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const currentYear = new Date().getFullYear();
const YEARS: string[] = [];
for (let y = currentYear; y >= 1950; y--) {
  YEARS.push(String(y));
}

/** Parse a stored value ("2021" or "2021-05") into { year, month } */
function parseValue(value: string): { year: string; month: string } {
  if (!value) return { year: "", month: "" };
  // Handle legacy free-text like "2021" or "2021-05"
  const parts = value.trim().split("-");
  const year = parts[0] ?? "";
  const month = parts[1] ?? "";
  return { year, month };
}

/** Format { year, month } back into a stored string */
function formatValue(year: string, month: string): string {
  if (!year) return "";
  if (month) return `${year}-${month}`;
  return year;
}

/** Display a stored value as a human-readable string */
export function displayMonthYear(value: string): string {
  if (!value) return "";
  const { year, month } = parseValue(value);
  if (!year) return value; // fallback for unexpected formats
  if (month) {
    const m = MONTHS.find(mo => mo.value === month);
    return m ? `${m.label} ${year}` : `${month}/${year}`;
  }
  return year;
}

interface MonthYearPickerProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function MonthYearPicker({ label = "Date", value, onChange, className }: MonthYearPickerProps) {
  const { year, month } = parseValue(value);

  const handleYearChange = (y: string) => {
    onChange(formatValue(y, month));
  };

  const handleMonthChange = (m: string) => {
    // "none" means clear the month
    onChange(formatValue(year, m === "none" ? "" : m));
  };

  return (
    <div
      className={`space-y-1 min-w-0 ${className ?? ""}`}
      style={{ minWidth: 0, maxWidth: "100%", width: "100%", boxSizing: "border-box" }}
    >
      {label && (
        <Label className="text-[11px] font-medium text-muted-foreground leading-none">{label}</Label>
      )}
      <div
        className="flex gap-1.5"
        style={{ display: "flex", gap: "6px", width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}
      >
        {/* Month — optional */}
        <div style={{ flex: "1 1 0", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}>
          <Select value={month || "none"} onValueChange={handleMonthChange}>
            <SelectTrigger
              className="h-8 text-xs w-full"
              style={{ width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
            >
              <SelectValue placeholder="Month (opt.)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Month (optional)</SelectItem>
              {MONTHS.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Year — required for a meaningful date */}
        <div style={{ flex: "1 1 0", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}>
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
      <p className="text-[10px] text-muted-foreground/60 leading-none pt-0.5">
        Month / Year optional
      </p>
    </div>
  );
}
