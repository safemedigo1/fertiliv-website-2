import { CalendarDays, ChevronDown, Clock3 } from "lucide-react";
import type { ReactNode } from "react";

export function AppointmentDetailsIdentityRow({
  name,
  badges,
  supportingText,
}: {
  name: string;
  badges: ReactNode;
  supportingText?: string | null;
}) {
  return (
    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
      <p className="max-w-full truncate text-sm font-semibold text-foreground sm:max-w-[14rem]">{name}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{badges}</div>
      {supportingText && <span className="w-full truncate text-xs text-muted-foreground sm:w-auto">{supportingText}</span>}
    </div>
  );
}

export function AppointmentDetailsTimingGroup({
  date,
  start,
  end,
  duration,
}: {
  date: string;
  start: string;
  end: string;
  duration?: string | null;
}) {
  const items = [
    { label: "Date", value: date, icon: CalendarDays },
    { label: "Start", value: start, icon: Clock3 },
    { label: "End", value: end, icon: Clock3 },
    ...(duration ? [{ label: "Duration", value: duration, icon: Clock3 }] : []),
  ];

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border bg-muted/25 px-3 py-2.5 text-sm sm:grid-cols-4">
      {items.map(({ label, value, icon: Icon }) => (
        <div key={label} className="flex min-w-0 items-start gap-1.5">
          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-[11px] leading-none text-muted-foreground">{label}</p>
            <p className="mt-1 truncate font-medium leading-none">{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AppointmentDetailsActionGroup({
  label,
  tone = "default",
  children,
}: {
  label: string;
  tone?: "default" | "danger";
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center">
      <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${tone === "danger" ? "text-destructive" : "text-muted-foreground"}`}>{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function AppointmentDetailsDisclosure({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/15 px-3 py-2.5">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-2 text-left"
        onClick={onToggle}
      >
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{title}</span>
        {summary && <span className="min-w-0 truncate text-[11px] text-muted-foreground">{summary}</span>}
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}
