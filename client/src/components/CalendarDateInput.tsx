/**
 * CalendarDateInput
 * ─────────────────────────────────────────────────────────────────────────────
 * A shared platform component for all calendar-date-only fields (DOB, marriage
 * date, follow-up date, cycle dates, etc.).
 *
 * ─── CANONICAL VALUE ─────────────────────────────────────────────────────────
 * Accepts and returns a YYYY-MM-DD string (or "" / null for empty).
 * Never exposes a Date object as the application value.
 *
 * ─── DISPLAY FORMAT ──────────────────────────────────────────────────────────
 * Always displays dd/MM/yyyy regardless of browser locale or OS language.
 * This is enforced by react-datepicker's dateFormat prop, not the browser.
 *
 * ─── TIMEZONE SAFETY ─────────────────────────────────────────────────────────
 * Internally converts YYYY-MM-DD → Date using UTC year/month/day to avoid
 * local-timezone day shifts (e.g. "1990-06-14" must not become "1990-06-13"
 * for a user in UTC−5).
 *
 * Conversion rule:
 *   YYYY-MM-DD → new Date(Date.UTC(year, month-1, day))
 *   Date → YYYY-MM-DD via getUTCFullYear/Month/Date
 *
 * ─── USAGE ───────────────────────────────────────────────────────────────────
 * <CalendarDateInput
 *   value={form.dateOfBirth}          // YYYY-MM-DD string or ""
 *   onChange={v => setForm(...)}      // receives YYYY-MM-DD string or ""
 *   label="Date of Birth"
 *   required
 *   min="1900-01-01"
 *   max={todayStr}
 * />
 *
 * ─── DO NOT ──────────────────────────────────────────────────────────────────
 * Do NOT import react-datepicker directly anywhere else in the application.
 * All date-picker configuration is owned by this component.
 */

import React, { useCallback, forwardRef } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { cn } from "@/lib/utils";
import { CalendarIcon, XCircleIcon } from "lucide-react";

// ─── Timezone-safe conversion helpers ────────────────────────────────────────

/**
 * Parse a YYYY-MM-DD string into a Date object at midnight UTC.
 * Returns null for empty/invalid input.
 *
 * MUST NOT use new Date("YYYY-MM-DD") because JS parses date-only ISO strings
 * as midnight UTC but then local methods (getDate, etc.) shift the day.
 * We use Date.UTC to keep the calendar day stable.
 */
function parseDateString(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; // 0-indexed
  const day = parseInt(match[3], 10);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month, day));
  // Validate: Date.UTC auto-corrects invalid dates (e.g. Feb 31 → Mar 2)
  // so we verify the round-trip
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month ||
    d.getUTCDate() !== day
  ) {
    return null; // invalid calendar date
  }
  return d;
}

/**
 * Convert a Date object to a YYYY-MM-DD string using UTC methods.
 * Returns "" for null.
 */
function formatDateString(date: Date | null): string {
  if (!date) return "";
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parse a YYYY-MM-DD string into a Date for react-datepicker.
 * react-datepicker uses local-timezone methods internally, so we must create
 * the Date at local midnight (not UTC midnight) to avoid the calendar showing
 * the wrong day.
 *
 * Strategy: construct the Date using local year/month/day explicitly.
 */
function parseDateForPicker(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  // Use local constructor to keep the calendar day stable inside the picker
  const d = new Date(year, month, day);
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) {
    return null;
  }
  return d;
}

/**
 * Convert a Date selected by react-datepicker (local timezone) to YYYY-MM-DD.
 * Uses local getFullYear/Month/Date because the picker created the Date locally.
 */
function pickerDateToString(date: Date | null): string {
  if (!date) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface CalendarDateInputProps {
  /** Canonical value: YYYY-MM-DD string, or "" / null / undefined for empty */
  value: string | null | undefined;
  /** Called with YYYY-MM-DD string on selection, or "" on clear */
  onChange: (value: string) => void;
  /** Minimum selectable date as YYYY-MM-DD string (e.g. "1900-01-01") */
  min?: string;
  /** Maximum selectable date as YYYY-MM-DD string (e.g. today) */
  max?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether the field is read-only (shows value but no picker) */
  readOnly?: boolean;
  /** Whether a clear button is shown when a value is present */
  clearable?: boolean;
  /** Placeholder text shown when empty */
  placeholder?: string;
  /** Additional CSS classes for the wrapper */
  className?: string;
  /** Additional CSS classes for the input element */
  inputClassName?: string;
  /** aria-label for accessibility */
  "aria-label"?: string;
  /** aria-invalid for validation state */
  "aria-invalid"?: boolean;
  /** id for the input element */
  id?: string;
  /** name for the input element */
  name?: string;
  /** Tab index */
  tabIndex?: number;
  /** Called when the input loses focus */
  onBlur?: () => void;
}

const CalendarDateInput = forwardRef<HTMLDivElement, CalendarDateInputProps>(
  (
    {
      value,
      onChange,
      min,
      max,
      required,
      disabled,
      readOnly,
      clearable = true,
      placeholder = "dd/MM/yyyy",
      className,
      inputClassName,
      "aria-label": ariaLabel,
      "aria-invalid": ariaInvalid,
      id,
      name,
      tabIndex,
      onBlur,
    },
    ref
  ) => {
    const selectedDate = parseDateForPicker(value ?? null);
    const minDate = parseDateForPicker(min ?? null);
    const maxDate = parseDateForPicker(max ?? null);

    const handleChange = useCallback(
      (date: Date | null) => {
        onChange(pickerDateToString(date));
      },
      [onChange]
    );

    const handleClear = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange("");
      },
      [onChange]
    );

    const hasValue = !!value;

    return (
      <div ref={ref} className={cn("relative", className)}>
        <DatePicker
          selected={selectedDate}
          onChange={handleChange}
          dateFormat="dd/MM/yyyy"
          placeholderText={placeholder}
          disabled={disabled || readOnly}
          readOnly={readOnly}
          minDate={minDate ?? undefined}
          maxDate={maxDate ?? undefined}
          showYearPicker={false}
          renderCustomHeader={({
            date,
            changeMonth,
            changeYear,
            decreaseMonth,
            increaseMonth,
            prevMonthButtonDisabled,
            nextMonthButtonDisabled,
          }) => {
            const currentYear = date.getFullYear();
            const currentMonth = date.getMonth();
            const minYear = minDate ? minDate.getFullYear() : 1900;
            const maxYear = maxDate ? maxDate.getFullYear() : new Date().getFullYear() + 1;
            const years: number[] = [];
            for (let y = maxYear; y >= minYear; y--) years.push(y);
            const months = [
              "January", "February", "March", "April", "May", "June",
              "July", "August", "September", "October", "November", "December",
            ];
            return (
              <div className="flex items-center justify-between px-2 py-1 gap-1">
                <button
                  type="button"
                  onClick={decreaseMonth}
                  disabled={prevMonthButtonDisabled}
                  className="p-1 rounded hover:bg-accent disabled:opacity-30 text-foreground"
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <select
                  value={currentMonth}
                  onChange={e => changeMonth(parseInt(e.target.value, 10))}
                  className="text-xs font-medium bg-background border border-border rounded px-1 py-0.5 text-foreground cursor-pointer"
                  aria-label="Month"
                >
                  {months.map((m, i) => (
                    <option key={m} value={i}>{m}</option>
                  ))}
                </select>
                <select
                  value={currentYear}
                  onChange={e => changeYear(parseInt(e.target.value, 10))}
                  className="text-xs font-medium bg-background border border-border rounded px-1 py-0.5 text-foreground cursor-pointer"
                  aria-label="Year"
                >
                  {years.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={increaseMonth}
                  disabled={nextMonthButtonDisabled}
                  className="p-1 rounded hover:bg-accent disabled:opacity-30 text-foreground"
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>
            );
          }}
          customInput={
            <CustomInput
              hasValue={hasValue}
              clearable={clearable && !disabled && !readOnly}
              onClear={handleClear}
              ariaLabel={ariaLabel}
              ariaInvalid={ariaInvalid}
              inputClassName={inputClassName}
              id={id}
              name={name}
              tabIndex={tabIndex}
              onBlur={onBlur}
            />
          }
          popperPlacement="bottom-start"
          wrapperClassName="w-full"
        />
      </div>
    );
  }
);

CalendarDateInput.displayName = "CalendarDateInput";

// ─── Custom Input ─────────────────────────────────────────────────────────────

interface CustomInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasValue: boolean;
  clearable: boolean;
  onClear: (e: React.MouseEvent) => void;
  ariaLabel?: string;
  ariaInvalid?: boolean;
  inputClassName?: string;
}

const CustomInput = forwardRef<HTMLInputElement, CustomInputProps>(
  (
    {
      hasValue,
      clearable,
      onClear,
      ariaLabel,
      ariaInvalid,
      inputClassName,
      id,
      name,
      tabIndex,
      onBlur,
      ...rest
    },
    ref
  ) => {
    return (
      <div className="relative w-full">
        <input
          ref={ref}
          id={id}
          name={name}
          tabIndex={tabIndex}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          onBlur={onBlur}
          className={cn(
            // Match the platform Input component styling exactly
            "file:text-foreground placeholder:text-[#8A8A98] selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-11 w-full min-w-0 rounded-md border bg-[#FCFCFE] px-3 py-1 text-[15px] font-[450] shadow-xs transition-[color,box-shadow,border-color] outline-none",
            "focus-visible:border-[#1E0566] focus-visible:ring-[rgba(30,5,102,0.08)] focus-visible:ring-[3px]",
            "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
            // Padding right to accommodate the calendar icon (and clear button if present)
            hasValue && clearable ? "pr-16" : "pr-9",
            inputClassName
          )}
          {...rest}
        />
        {/* Calendar icon */}
        <CalendarIcon
          className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
          aria-hidden
        />
        {/* Clear button */}
        {hasValue && clearable && (
          <button
            type="button"
            onMouseDown={onClear}
            className="absolute right-8 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Clear date"
            tabIndex={-1}
          >
            <XCircleIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }
);

CustomInput.displayName = "CalendarDateInputCustomInput";

// ─── CSS overrides ────────────────────────────────────────────────────────────
// Injected as a style tag to override react-datepicker's default styles
// to match the Fertiliv design system.
const DATEPICKER_STYLES = `
.react-datepicker {
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background-color: var(--background);
  color: var(--foreground);
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  overflow: hidden;
}
.react-datepicker__header {
  background-color: var(--background);
  border-bottom: 1px solid var(--border);
  padding: 0;
}
.react-datepicker__current-month {
  display: none;
}
.react-datepicker__navigation {
  display: none;
}
.react-datepicker__day-names {
  padding: 4px 8px 0;
}
.react-datepicker__day-name {
  color: var(--muted-foreground);
  font-size: 0.7rem;
  font-weight: 500;
  width: 2rem;
  line-height: 2rem;
}
.react-datepicker__month {
  margin: 4px 8px 8px;
}
.react-datepicker__day {
  color: var(--foreground);
  width: 2rem;
  line-height: 2rem;
  font-size: 0.8rem;
  border-radius: var(--radius-sm);
  transition: background-color 0.1s, color 0.1s;
}
.react-datepicker__day:hover {
  background-color: var(--accent);
  color: var(--accent-foreground);
}
.react-datepicker__day--selected,
.react-datepicker__day--keyboard-selected {
  background-color: var(--primary) !important;
  color: var(--primary-foreground) !important;
  font-weight: 600;
}
.react-datepicker__day--today {
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.react-datepicker__day--disabled {
  color: var(--muted-foreground);
  opacity: 0.4;
  cursor: not-allowed;
}
.react-datepicker__day--outside-month {
  opacity: 0.35;
}
.react-datepicker__triangle {
  display: none;
}
.react-datepicker-popper {
  z-index: 9999;
}
`;

// Inject styles once
let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-fertiliv-datepicker", "1");
  style.textContent = DATEPICKER_STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}
if (typeof document !== "undefined") {
  injectStyles();
}

export default CalendarDateInput;
export { parseDateString, formatDateString, parseDateForPicker, pickerDateToString };
