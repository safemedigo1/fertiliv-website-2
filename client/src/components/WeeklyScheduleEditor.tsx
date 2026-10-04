/**
 * WeeklyScheduleEditor
 * Lets a coordinator define their weekly availability by adding/removing
 * time windows per day. Each window has a start and end time (HH:MM).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Clock } from "lucide-react";

export type TimeWindow = { start: string; end: string };
export type WeeklySchedule = Record<string, TimeWindow[]>;

const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

interface Props {
  value: WeeklySchedule;
  slotDurationMinutes?: number;
  onChange: (schedule: WeeklySchedule, slotDuration: number) => void;
}

export function WeeklyScheduleEditor({ value, slotDurationMinutes = 30, onChange }: Props) {
  const [slotDuration, setSlotDuration] = useState(slotDurationMinutes);

  function addWindow(dayKey: string) {
    const current = value[dayKey] ?? [];
    const lastEnd = current.length > 0 ? current[current.length - 1].end : "09:00";
    // Add 1 hour after last window
    const [h, m] = lastEnd.split(":").map(Number);
    const newStart = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const endH = Math.min(h + 1, 23);
    const newEnd = `${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const updated = { ...value, [dayKey]: [...current, { start: newStart, end: newEnd }] };
    onChange(updated, slotDuration);
  }

  function removeWindow(dayKey: string, index: number) {
    const current = value[dayKey] ?? [];
    const updated = { ...value, [dayKey]: current.filter((_, i) => i !== index) };
    if (updated[dayKey].length === 0) delete updated[dayKey];
    onChange(updated, slotDuration);
  }

  function updateWindow(dayKey: string, index: number, field: "start" | "end", val: string) {
    const current = [...(value[dayKey] ?? [])];
    current[index] = { ...current[index], [field]: val };
    onChange({ ...value, [dayKey]: current }, slotDuration);
  }

  function handleSlotDurationChange(v: number) {
    setSlotDuration(v);
    onChange(value, v);
  }

  return (
    <div className="space-y-4">
      {/* Slot duration */}
      <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
        <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex items-center gap-2 flex-1">
          <Label className="text-sm whitespace-nowrap">Slot duration:</Label>
          <select
            className="h-8 px-2 rounded border border-input bg-background text-sm"
            value={slotDuration}
            onChange={e => handleSlotDurationChange(Number(e.target.value))}
          >
            {[15, 20, 30, 45, 60, 90, 120].map(d => (
              <option key={d} value={d}>{d} min</option>
            ))}
          </select>
        </div>
      </div>

      {/* Day rows */}
      {DAYS.map(day => {
        const windows = value[day.key] ?? [];
        const isActive = windows.length > 0;
        return (
          <div key={day.key} className={`rounded-lg border p-3 transition-colors ${isActive ? "border-primary/30 bg-primary/5" : "border-border/40 bg-muted/20"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium w-24">{day.label}</span>
                {isActive ? (
                  <Badge variant="secondary" className="text-xs">{windows.length} window{windows.length > 1 ? "s" : ""}</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground">Off</Badge>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => addWindow(day.key)}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add window
              </Button>
            </div>

            {windows.length > 0 && (
              <div className="space-y-2 mt-2">
                {windows.map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={w.start}
                      onChange={e => updateWindow(day.key, i, "start", e.target.value)}
                      className="h-8 w-28 text-sm"
                    />
                    <span className="text-muted-foreground text-sm">–</span>
                    <Input
                      type="time"
                      value={w.end}
                      onChange={e => updateWindow(day.key, i, "end", e.target.value)}
                      className="h-8 w-28 text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => removeWindow(day.key, i)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
