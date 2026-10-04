import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AppointmentDetailsSendModal } from "@/components/AppointmentDetailsSendModal";
import { AppointmentDetailsSecondaryLayer } from "@/components/AppointmentDetailsSecondaryLayer";
import { AppointmentDetailsActionGroup, AppointmentDetailsDisclosure, AppointmentDetailsIdentityRow, AppointmentDetailsTimingGroup } from "@/components/AppointmentDetailsPresentation";
import { AppointmentStatusConfirmation, type AppointmentStatusAction } from "@/components/AppointmentStatusConfirmation";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useDraftForm } from "@/hooks/useDraftForm";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { useLocation } from "wouter";
import {
  addDays, addMonths, addWeeks,
  eachDayOfInterval, endOfMonth, endOfWeek,
  format, isBefore, isSameDay, isSameMonth,
  startOfMonth, startOfWeek, subDays, subMonths, subWeeks,
} from "date-fns";
import {
  AlertTriangle, Calendar, CheckSquare, ChevronDown, ChevronLeft, ChevronRight,
  Clock, Download, Edit, ExternalLink, Filter, Loader2, Mail, Plus, RefreshCw, Search, Square, Trash2, User, Video, X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { effectiveAppointmentEnd, endDateFromLocalTime, localTimeValue, resolveEffectiveExternalLocation, validateOptionalMeetingLink } from "@shared/appointmentScheduling";
import { resolvePhysicalAppointmentLocation } from "@shared/appointmentPhysicalLocation";
import { appointmentCommunicationActionLabel } from "@shared/appointmentCommunication";

type ViewMode = "month" | "week" | "day" | "list";

const DESKTOP_MONTH_BREAKPOINT = 768;
const DESKTOP_MONTH_BOTTOM_GUTTER = 24;
const MIN_DESKTOP_MONTH_CARD_HEIGHT = 580;

/**
 * Calendar presentation ordering only. The shared appointments.list API keeps
 * its existing contract for Dashboard, profile, lead, and export consumers.
 */
export function orderCalendarAppointments<T extends { appointmentDate: Date | string; id: number }>(appointments: readonly T[]): T[] {
  return [...appointments].sort((left, right) => {
    const startDifference = new Date(left.appointmentDate).getTime() - new Date(right.appointmentDate).getTime();
    return startDifference !== 0 ? startDifference : left.id - right.id;
  });
}

type BulkActionResultResponse = {
  results?: Array<{ outcome?: string; googleSync?: string; googleDeletion?: string }>;
};

export function isFullySuccessfulBulkResult(response: BulkActionResultResponse): boolean {
  const results = response.results ?? [];
  return results.length > 0 && results.every((item) =>
    item.outcome !== "failed" && item.googleSync !== "pending" && item.googleDeletion !== "pending"
  );
}

// ─── ICS export ──────────────────────────────────────────────────────────────
function generateICS(appt: any, clinic?: any): string {
  const start = new Date(appt.appointmentDate);
  const end = effectiveAppointmentEnd({ appointmentDate: start, endDate: appt.endDate, duration: appt.duration });
  const clinicName = clinic?.nameEn?.trim() || clinic?.nameTr?.trim() || clinic?.nameAr?.trim() || undefined;
  const clinicAddress = clinic?.addressEn?.trim() || clinic?.addressTr?.trim() || clinic?.addressAr?.trim() || undefined;
  const location = resolvePhysicalAppointmentLocation({ ...appt, clinicName, clinicAddress }) ?? undefined;
  const meetingLink = appt.appointmentType === "online" ? appt.meetingLink?.trim() : undefined;
  const mapLink = appt.appointmentType === "in-clinic"
    ? clinic?.mapsLink?.trim()
    : appt.appointmentType === "external" ? appt.partnerClinicGoogleMapsUrl?.trim() : undefined;
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Fertiliv//EN",
    "BEGIN:VEVENT",
    `UID:appt-${appt.id}@fertiliv`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${appt.title ?? `Appointment #${appt.id}`}`,
    `DESCRIPTION:Patient: ${appt.patientFirstName ?? ""} ${appt.patientLastName ?? ""}${appt.doctorName ? `\\nDoctor: Dr. ${appt.doctorName}` : ""}${appt.notes ? `\\nNotes: ${appt.notes}` : ""}${mapLink ? `\\nMap: ${mapLink}` : ""}`,
    location ? `LOCATION:${location}` : "",
    meetingLink || mapLink ? `URL:${meetingLink || mapLink}` : "",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}
function downloadICS(appt: any, clinic?: any) {
  const blob = new Blob([generateICS(appt, clinic)], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `appointment-${appt.id}.ics`; a.click();
  URL.revokeObjectURL(url);
}

// ─── Searchable Patient Combobox ──────────────────────────────────────────────
function PatientCombobox({ value, onChange, patients, onPatientCreated }: {
  value: string;
  onChange: (v: string) => void;
  patients: any[];
  onPatientCreated?: (p: { id: number; mrn: string; firstName: string; lastName: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [createErrors, setCreateErrors] = useState<{ first?: string; last?: string }>({});
  const ref = useRef<HTMLDivElement>(null);

  const quickCreate = trpc.patients.quickCreate.useMutation();

  const selected = patients.find(p => String(p.id) === value);
  const filtered = useMemo(() => {
    if (!search.trim()) return patients.slice(0, 50);
    const q = search.toLowerCase();
    return patients.filter(p =>
      `${p.firstName} ${p.lastName} ${p.mrn}`.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [search, patients]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCreate(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleOpenCreate() {
    setShowCreate(true);
    setNewFirst(""); setNewLast(""); setNewPhone(""); setNewEmail("");
    setCreateErrors({});
  }

  async function handleCreate() {
    const errors: { first?: string; last?: string } = {};
    if (!newFirst.trim()) errors.first = "First name is required";
    if (!newLast.trim()) errors.last = "Last name is required";
    if (Object.keys(errors).length > 0) { setCreateErrors(errors); return; }
    try {
      const result = await quickCreate.mutateAsync({
        firstName: newFirst.trim(),
        lastName: newLast.trim(),
        phone: newPhone.trim() || undefined,
        email: newEmail.trim() || undefined,
      });
      const newPatient = { id: result.id, mrn: result.mrn, firstName: result.firstName, lastName: result.lastName };
      onPatientCreated?.(newPatient);
      onChange(String(result.id));
      setOpen(false);
      setShowCreate(false);
      toast.success(`Patient ${result.firstName} ${result.lastName} created`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create patient");
    }
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" role="combobox" aria-expanded={open}
        onClick={() => { setOpen(o => !o); setSearch(""); setShowCreate(false); }}
        className="flex w-full min-w-0 max-w-full items-center justify-between px-3 py-2 text-base border rounded-md bg-background hover:bg-accent/30 transition-colors sm:text-sm">
        <span className={`${selected ? "text-foreground" : "text-muted-foreground"} min-w-0 flex-1 truncate text-left`}>
          {selected ? `${selected.firstName} ${selected.lastName} (${selected.mrn})` : "Search patient..."}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>
      {open && !showCreate && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-lg">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Type name or MRN..."
                className="w-full pl-7 pr-2 py-1.5 text-base bg-transparent outline-none sm:text-sm"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No patients found</p>
            ) : filtered.map(p => (
              <button key={p.id} type="button"
                onClick={() => { onChange(String(p.id)); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-base hover:bg-accent/40 transition-colors sm:text-sm ${String(p.id) === value ? "bg-primary/10 font-medium" : ""}`}>
                {p.firstName} {p.lastName}
                <span className="ml-2 text-xs text-muted-foreground">{p.mrn}</span>
              </button>
            ))}
          </div>
          {/* Create new patient option */}
          <div className="border-t p-1">
            <button type="button"
              onClick={handleOpenCreate}
              className="w-full flex items-center gap-2 px-3 py-2 text-base text-primary font-medium hover:bg-primary/5 rounded transition-colors sm:text-sm">
              <Plus className="h-3.5 w-3.5" />
              Create New Patient
            </button>
          </div>
        </div>
      )}
      {open && showCreate && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-lg p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">Create New Patient</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">First Name *</label>
              <input
                autoFocus
                value={newFirst}
                onChange={e => { setNewFirst(e.target.value); setCreateErrors(x => ({ ...x, first: undefined })); }}
                placeholder="First name"
                className="w-full px-2.5 py-1.5 text-base border rounded-md bg-background outline-none focus:ring-2 focus:ring-primary/30 sm:text-sm"
              />
              {createErrors.first && <p className="text-xs text-destructive">{createErrors.first}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Last Name *</label>
              <input
                value={newLast}
                onChange={e => { setNewLast(e.target.value); setCreateErrors(x => ({ ...x, last: undefined })); }}
                placeholder="Last name"
                className="w-full px-2.5 py-1.5 text-base border rounded-md bg-background outline-none focus:ring-2 focus:ring-primary/30 sm:text-sm"
              />
              {createErrors.last && <p className="text-xs text-destructive">{createErrors.last}</p>}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Phone (optional)</label>
              <input
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                placeholder="+90 555 000 0000"
                className="w-full px-2.5 py-1.5 text-base border rounded-md bg-background outline-none focus:ring-2 focus:ring-primary/30 sm:text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Email (optional)</label>
              <input
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="patient@example.com"
                type="email"
                className="w-full px-2.5 py-1.5 text-base border rounded-md bg-background outline-none focus:ring-2 focus:ring-primary/30 sm:text-sm"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button"
              onClick={() => { setShowCreate(false); }}
              className="flex-1 px-3 py-1.5 text-sm border rounded-md hover:bg-accent/30 transition-colors">
              Cancel
            </button>
            <button type="button"
              onClick={handleCreate}
              disabled={quickCreate.isPending}
              className="flex-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
              {quickCreate.isPending ? "Creating..." : "Create Patient"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const calendarPageRef = useRef<HTMLDivElement>(null);
  const monthWorkspaceRef = useRef<HTMLDivElement>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [desktopMonthHeight, setDesktopMonthHeight] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [bulkActionBarHeight, setBulkActionBarHeight] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);
  const [editAppt, setEditAppt] = useState<any | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPurpose, setFilterPurpose] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterDoctor, setFilterDoctor] = useState("");
  const [filterHost, setFilterHost] = useState("");
  const [filterPerson, setFilterPerson] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  // Stabilize date ranges — using new Date() inline causes infinite re-fetch
  const rangeStart = useMemo(() => {
    if (viewMode === "month") return startOfWeek(startOfMonth(currentDate));
    if (viewMode === "week") return startOfWeek(currentDate);
    if (viewMode === "day") { const d = new Date(currentDate); d.setHours(0, 0, 0, 0); return d; }
    const d = new Date(); d.setHours(0, 0, 0, 0); return subDays(d, 365);
  }, [viewMode, currentDate]);
  const rangeEnd = useMemo(() => {
    if (viewMode === "month") return endOfWeek(endOfMonth(currentDate));
    if (viewMode === "week") return endOfWeek(currentDate);
    if (viewMode === "day") { const d = new Date(currentDate); d.setHours(23, 59, 59, 999); return d; }
    const d = new Date(); d.setHours(23, 59, 59, 999); return addDays(d, 365);
  }, [viewMode, currentDate]);

  const { data: appointments, refetch } = trpc.appointments.list.useQuery({
    from: rangeStart,
    to: rangeEnd,
    status: filterStatus || undefined,
    purpose: filterPurpose || undefined,
    appointmentType: filterType || undefined,
    doctorId: filterDoctor ? parseInt(filterDoctor) : undefined,
    hostUserId: filterHost ? parseInt(filterHost) : undefined,
  });

  const { data: doctors } = trpc.doctors.list.useQuery();
  const { data: patientsResult } = trpc.patients.list.useQuery({ pageSize: 1000 });
  const patientsList = patientsResult?.data;
  const { data: allUsers } = trpc.users.listStaff.useQuery();

  const navigate = (dir: 1 | -1) => {
    if (viewMode === "month") setCurrentDate(dir === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(dir === 1 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else setCurrentDate(dir === 1 ? addDays(currentDate, 1) : subDays(currentDate, 1));
  };

  const handleDayClick = (date: Date) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (date < today) { toast.info("Cannot create appointments in the past"); return; }
    setSelectedDate(date); setShowAddModal(true);
  };

  // Apply relationship-aware person filter client-side.
  const filteredAppointments = useMemo(() => {
    if (!appointments) return [];
    if (!filterPerson.trim()) return appointments;
    const q = filterPerson.toLowerCase();
    return appointments.filter((a: any) =>
      `${a.relatedEntityDisplayName ?? ""} ${a.patientMrn ?? ""}`.toLowerCase().includes(q)
    );
  }, [appointments, filterPerson]);

  // Keep chronological display ordering local to Calendar. Do not mutate the
  // cached tRPC response or alter the shared API ordering used outside Calendar.
  const orderedCalendarAppointments = useMemo(
    () => orderCalendarAppointments(filteredAppointments),
    [filteredAppointments],
  );

  const statusColor: Record<string, string> = {
    upcoming: "bg-blue-500", confirmed: "bg-emerald-500",
    completed: "bg-green-600", cancelled: "bg-red-500",
    no_show: "bg-orange-500", rescheduled: "bg-purple-500",
  };

  const activeFilterCount = [filterStatus, filterPurpose, filterType, filterDoctor, filterHost, filterPerson].filter(Boolean).length;

  // The document remains the scroll owner. When a normal desktop viewport has
  // enough safe space, fit Month View into the real remaining viewport instead
  // of relying on a fragile fixed viewport subtraction. Smaller/zoomed layouts
  // deliberately fall back to natural document flow rather than clipping cards.
  useEffect(() => {
    if (viewMode !== "month" || typeof window === "undefined") {
      setDesktopMonthHeight(null);
      return;
    }

    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const workspace = monthWorkspaceRef.current;
        if (!workspace || window.innerWidth < DESKTOP_MONTH_BREAKPOINT) {
          setDesktopMonthHeight(null);
          return;
        }

        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const availableHeight = Math.floor(viewportHeight - workspace.getBoundingClientRect().top - DESKTOP_MONTH_BOTTOM_GUTTER);
        setDesktopMonthHeight(previous => {
          const next = availableHeight >= MIN_DESKTOP_MONTH_CARD_HEIGHT ? availableHeight : null;
          return previous === next ? previous : next;
        });
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (calendarPageRef.current) observer.observe(calendarPageRef.current);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [viewMode, showFilters, activeFilterCount]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearSelectionOnly = useCallback(() => setSelectedIds(new Set()), []);
  const exitSelectMode = useCallback(() => {
    setSelectedIds(new Set());
    setSelectMode(false);
  }, []);
  const completeBulkSuccess = useCallback(() => {
    refetch();
    exitSelectMode();
  }, [exitSelectMode, refetch]);

  return (
    <div ref={calendarPageRef} className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{background:'rgba(30,5,102,0.08)'}}>
            <Calendar className="h-6 w-6" style={{color:'#1E0566'}} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Calendar</h1>
            <p className="text-sm text-muted-foreground">Manage appointments and schedules</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5 relative"
            onClick={() => setShowFilters(f => !f)}>
            <Filter className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            )}
          </Button>
          <Button onClick={() => { setSelectedDate(new Date()); setShowAddModal(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> New Appointment
          </Button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={filterStatus || "_all"} onValueChange={v => setFilterStatus(v === "_all" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Statuses</SelectItem>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="no_show">No Show</SelectItem>
                    <SelectItem value="rescheduled">Rescheduled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Purpose</Label>
                <Select value={filterPurpose || "_all"} onValueChange={v => setFilterPurpose(v === "_all" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Purposes</SelectItem>
                    <SelectItem value="sales-consultation">Sales Consultation</SelectItem>
                    <SelectItem value="medical-consultation">Medical Consultation</SelectItem>
                    <SelectItem value="follow-up">Follow-up</SelectItem>
                    <SelectItem value="procedure">Procedure</SelectItem>
                    <SelectItem value="diagnostic-test">Diagnostic Test</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={filterType || "_all"} onValueChange={v => setFilterType(v === "_all" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Types</SelectItem>
                    <SelectItem value="in-clinic">In-Clinic</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="external">External</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Doctor</Label>
                <Select value={filterDoctor || "_all"} onValueChange={v => setFilterDoctor(v === "_all" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Doctors</SelectItem>
                    {doctors?.map(d => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Host / Assigned To</Label>
                <Select value={filterHost || "_all"} onValueChange={v => setFilterHost(v === "_all" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Hosts</SelectItem>
                    {allUsers?.map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Person</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input value={filterPerson} onChange={e => setFilterPerson(e.target.value)}
                    placeholder="Lead, patient, or MRN..." className="h-8 text-xs pl-6" />
                </div>
              </div>
            </div>
            {activeFilterCount > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {filterStatus && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                    Status: {filterStatus.replace(/_/g, " ")}
                    <button type="button" onClick={() => setFilterStatus("")} className="ml-0.5 hover:opacity-60"><X className="h-3 w-3" /></button>
                  </span>
                )}
                {filterPurpose && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 border border-blue-500/20">
                    Purpose: {filterPurpose.replace(/-/g, " ")}
                    <button type="button" onClick={() => setFilterPurpose("")} className="ml-0.5 hover:opacity-60"><X className="h-3 w-3" /></button>
                  </span>
                )}
                {filterType && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    Type: {filterType.replace(/-/g, " ")}
                    <button type="button" onClick={() => setFilterType("")} className="ml-0.5 hover:opacity-60"><X className="h-3 w-3" /></button>
                  </span>
                )}
                {filterDoctor && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-500/10 text-violet-600 border border-violet-500/20">
                    Doctor: {doctors?.find(d => String(d.id) === filterDoctor)?.name ?? filterDoctor}
                    <button type="button" onClick={() => setFilterDoctor("")} className="ml-0.5 hover:opacity-60"><X className="h-3 w-3" /></button>
                  </span>
                )}
                {filterHost && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/10 text-orange-600 border border-orange-500/20">
                    Host: {allUsers?.find(u => String(u.id) === filterHost)?.name ?? filterHost}
                    <button type="button" onClick={() => setFilterHost("")} className="ml-0.5 hover:opacity-60"><X className="h-3 w-3" /></button>
                  </span>
                )}
                {filterPerson && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600 border border-rose-500/20">
                    Person: "{filterPerson}"
                    <button type="button" onClick={() => setFilterPerson("")} className="ml-0.5 hover:opacity-60"><X className="h-3 w-3" /></button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => { setFilterStatus(""); setFilterPurpose(""); setFilterType(""); setFilterDoctor(""); setFilterHost(""); setFilterPerson(""); }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/40 hover:border-muted-foreground transition-colors">
                  <X className="h-3 w-3" /> Clear all
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Nav + View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="text-base md:text-lg font-semibold ml-1 truncate max-w-[200px] md:max-w-none">
            {viewMode === "month" && format(currentDate, "MMMM yyyy")}
            {viewMode === "week" && `${format(startOfWeek(currentDate), "MMM d")} – ${format(endOfWeek(currentDate), "MMM d, yyyy")}`}
            {viewMode === "day" && format(currentDate, "EEEE, MMMM d, yyyy")}
            {viewMode === "list" && "All Appointments"}
          </h2>
          {filteredAppointments.length > 0 && activeFilterCount > 0 && (
            <span className="text-xs text-muted-foreground">({filteredAppointments.length} results)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={selectMode ? "default" : "outline"}
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => { if (selectMode) exitSelectMode(); else setSelectMode(true); }}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {selectMode ? `Select (${selectedIds.size})` : "Select"}
          </Button>
          <div className="flex items-center gap-0.5 bg-muted rounded-lg p-1">
            {(["month", "week", "day", "list"] as ViewMode[]).map(v => (
              <button key={v} onClick={() => { setViewMode(v); clearSelectionOnly(); }}
                className={`px-2 md:px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${viewMode === v ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar Views */}
      {viewMode === "month" && (
        <div
          ref={monthWorkspaceRef}
          className="sm:!pb-0"
          style={selectedIds.size > 0 ? { paddingBottom: `calc(${bulkActionBarHeight}px + 0.75rem + env(safe-area-inset-bottom))` } : undefined}
        >
          <MonthView currentDate={currentDate} appointments={orderedCalendarAppointments}
            onDayClick={handleDayClick} onApptClick={setSelectedAppt} statusColor={statusColor}
            selectMode={selectMode} selectedIds={selectedIds} onToggleSelect={toggleSelect}
            desktopAvailableHeight={desktopMonthHeight} />
        </div>
      )}
      {viewMode === "week" && (
        <WeekView currentDate={currentDate} appointments={orderedCalendarAppointments}
          onDayClick={handleDayClick} onApptClick={setSelectedAppt} statusColor={statusColor}
          selectMode={selectMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
      )}
      {viewMode === "day" && (
        <DayView currentDate={currentDate} appointments={orderedCalendarAppointments}
          onApptClick={setSelectedAppt} statusColor={statusColor}
          selectMode={selectMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
      )}
      {viewMode === "list" && (
        <ListView appointments={orderedCalendarAppointments} statusColor={statusColor}
          onApptClick={setSelectedAppt} selectMode={selectMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          ids={Array.from(selectedIds)}
          appointments={filteredAppointments}
          isAdmin={isAdmin}
          onHeightChange={setBulkActionBarHeight}
          onClearSelection={clearSelectionOnly}
          onExitSelectMode={exitSelectMode}
          onCompleteBulkSuccess={completeBulkSuccess}
        />
      )}

      {/* Modals */}
      <AppointmentFormModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        defaultDate={selectedDate ?? new Date()}
        onSuccess={() => { refetch(); setShowAddModal(false); }}
        patients={patientsList ?? []}
        staffUsers={allUsers ?? []}
      />

      {selectedAppt && (
        <AppointmentDetailModal
          appointment={selectedAppt}
          onClose={() => setSelectedAppt(null)}
          onRefresh={(appointmentPatch) => {
            void refetch();
            if (appointmentPatch) setSelectedAppt((current: any | null) => current ? { ...current, ...appointmentPatch } : current);
          }}
          onEdit={(appt) => { setSelectedAppt(null); setEditAppt(appt); }}
        />
      )}

      {editAppt && (
        <AppointmentFormModal
          open={true}
          onClose={() => setEditAppt(null)}
          defaultDate={new Date(editAppt.appointmentDate)}
          editAppointment={editAppt}
          onSuccess={() => { refetch(); setEditAppt(null); }}
          patients={patientsList ?? []}
          staffUsers={allUsers ?? []}
        />
      )}
    </div>
  );
}

// ─── Appointment Detail Modal ────────────────────────────────────────────────
function AppointmentDetailModal({ appointment: a, onClose, onRefresh, onEdit }: {
  appointment: any; onClose: () => void; onRefresh: (appointmentPatch?: Record<string, unknown>) => void; onEdit: (appt: any) => void;
}) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showPatientReminderHistory, setShowPatientReminderHistory] = useState(false);
  const [showSendDetails, setShowSendDetails] = useState(false);
  const [pendingStatusAction, setPendingStatusAction] = useState<AppointmentStatusAction | null>(null);
  const [liveMeetingLink, setLiveMeetingLink] = useState(a.meetingLink ?? "");
  const [eventOpenReady, setEventOpenReady] = useState(false);
  const [eventReadinessPhase, setEventReadinessPhase] = useState<"idle" | "settling" | "verifying" | "ready" | "timeout">("idle");
  const [eventSecondsRemaining, setEventSecondsRemaining] = useState(0);
  const [readinessAttempt, setReadinessAttempt] = useState(0);
  useEffect(() => setLiveMeetingLink(a.meetingLink ?? ""), [a.id, a.meetingLink]);

  const updateAppt = trpc.appointments.update.useMutation({
    onSuccess: (_result, variables) => {
      toast.success("Appointment updated");
      onRefresh({ ...variables.data, ...(variables.data.status === "upcoming" ? { cancellationReason: null } : {}) });
    },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });
  const markNoShow = trpc.appointments.markNoShow.useMutation({
    onSuccess: () => { toast.success("Marked as no show"); onRefresh({ status: "no_show" }); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });
  const deleteAppt = trpc.appointments.delete.useMutation({
    onSuccess: () => { toast.success("Appointment deleted"); onClose(); onRefresh(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });
  const { data: activityLog } = trpc.appointments.activityLog.useQuery(
    { appointmentId: a.id },
    { enabled: showActivityLog },
  );
  const { data: availabilityOverrideState } = trpc.appointments.availabilityOverrideState.useQuery({ appointmentId: a.id });
  const { data: reminderHistory, isLoading: isLoadingReminderHistory } = trpc.appointments.reminderHistory.useQuery(
    { appointmentId: a.id },
    { enabled: user?.role === "admin" },
  );
  const patientReminderHistorySummary = useMemo(() => {
    if (isLoadingReminderHistory) return "Loading…";
    const reminders = reminderHistory ?? [];
    if (reminders.length === 0) return "No reminders";

    const statusCounts = new Map<string, number>();
    for (const reminder of reminders) {
      statusCounts.set(reminder.status, (statusCounts.get(reminder.status) ?? 0) + 1);
    }
    const statusSummary = Array.from(statusCounts.entries())
      .slice(0, 2)
      .map(([status, count]) => `${count} ${status.replace(/_/g, " ")}`)
      .join(" · ");
    return `${reminders.length} ${reminders.length === 1 ? "reminder" : "reminders"}${statusSummary ? ` · ${statusSummary}` : ""}`;
  }, [isLoadingReminderHistory, reminderHistory]);
  const { data: clinicInfo } = trpc.clinicInfo.get.useQuery();
  const { data: googleSync, refetch: refetchGoogleSync } = trpc.appointments.googleSyncStatus.useQuery({ appointmentId: a.id });
  useEffect(() => {
    if (!googleSync?.canOpenInGoogle || !googleSync.lastSyncedAt) {
      setEventOpenReady(false);
      setEventReadinessPhase("idle");
      setEventSecondsRemaining(0);
      return;
    }
    if (googleSync.verifiedEventUrl) {
      setEventSecondsRemaining(0);
      setEventReadinessPhase("ready");
      setEventOpenReady(true);
      return;
    }
    const synchronizedAt = new Date(googleSync.lastSyncedAt).getTime();
    const initialRemainingMs = Math.max(0, 5_000 - (Date.now() - synchronizedAt));
    if (initialRemainingMs === 0) {
      setEventSecondsRemaining(0);
      setEventReadinessPhase("verifying");
      setEventOpenReady(true);
      return;
    }
    setEventReadinessPhase("settling");
    setEventOpenReady(false);
    const updateCountdown = () => {
      const remainingMs = Math.max(0, 5_000 - (Date.now() - synchronizedAt));
      setEventSecondsRemaining(Math.ceil(remainingMs / 1_000));
    };
    updateCountdown();
    const countdownTimer = window.setInterval(updateCountdown, 250);
    const transitionTimer = window.setTimeout(() => {
      window.clearInterval(countdownTimer);
      setEventSecondsRemaining(0);
      setEventReadinessPhase("verifying");
      setEventOpenReady(true);
    }, initialRemainingMs);
    return () => {
      window.clearInterval(countdownTimer);
      window.clearTimeout(transitionTimer);
    };
  }, [googleSync?.canOpenInGoogle, googleSync?.lastSyncedAt]);
  const { data: googleEventLink, isFetching: isLoadingGoogleEventLink, refetch: refetchGoogleEventLink } = trpc.appointments.googleSyncEventLink.useQuery(
    { appointmentId: a.id },
    { enabled: Boolean(googleSync?.canOpenInGoogle && eventOpenReady) },
  );
  useEffect(() => {
    if (!googleSync?.canOpenInGoogle || !eventOpenReady) return;
    if (googleSync.verifiedEventUrl) {
      setEventReadinessPhase("ready");
      let disposed = false;
      void refetchGoogleEventLink()
        .then(async result => {
          if (disposed || result.data?.url) return;
          const refreshedSync = await refetchGoogleSync();
          if (!disposed && !refreshedSync.data?.verifiedEventUrl) {
            setEventReadinessPhase("timeout");
          }
        })
        .catch(() => {
          // Transient Google errors retain the last-known Ready UI state.
        });
      return () => { disposed = true; };
    }
    if (googleEventLink?.url) {
      setEventReadinessPhase("ready");
      return;
    }
    setEventReadinessPhase("verifying");
    let attempts = 0;
    let disposed = false;
    const verifyMappedEvent = async () => {
      const result = await refetchGoogleEventLink();
      if (disposed) return true;
      if (result.data?.url) {
        setEventReadinessPhase("ready");
        return true;
      }
      attempts += 1;
      if (attempts >= 12) {
        setEventReadinessPhase("timeout");
        return true;
      }
      return false;
    };
    void verifyMappedEvent().then(done => {
      if (done) window.clearInterval(timer);
    });
    const timer = window.setInterval(() => {
      void verifyMappedEvent().then(done => {
        if (done) window.clearInterval(timer);
      });
    }, 1_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [eventOpenReady, googleEventLink?.url, googleSync?.canOpenInGoogle, googleSync?.verifiedEventUrl, readinessAttempt, refetchGoogleEventLink, refetchGoogleSync]);
  const retryGoogleSync = trpc.appointments.retryGoogleSync.useMutation({
    onSuccess: result => {
      if (result.status === "synced" || result.status === "deleted") toast.success("Google Calendar synchronization completed.");
      else if (result.status === "skipped") toast.info(result.message ?? "No Google synchronization is needed.");
      else toast.error(result.message ?? "Google Calendar synchronization needs attention.");
      void refetchGoogleSync();
    },
    onError: () => toast.error("Google Calendar synchronization could not be retried. Please try again."),
  });
  const generateGoogleMeet = trpc.appointments.generateGoogleMeet.useMutation({
    onSuccess: result => {
      if (result.status === "generated") { if (result.meetingLink) setLiveMeetingLink(result.meetingLink); toast.success("Google Meet link generated and saved."); onRefresh(); }
      else if (result.status === "pending") toast.info(result.message ?? "Google Meet is being prepared. Please retry shortly.");
      else if (result.status === "skipped") toast.info(result.message ?? "This appointment already has a meeting link.");
      else toast.error(result.message ?? "Google Meet could not be generated.");
    },
    onError: () => toast.error("Google Meet could not be generated. Please try again."),
  });

  const statusBadge: Record<string, string> = {
    upcoming: "bg-blue-100 text-blue-700", confirmed: "bg-emerald-100 text-emerald-700",
    completed: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700",
    no_show: "bg-orange-100 text-orange-700", rescheduled: "bg-purple-100 text-purple-700",
  };

  const typeBadge: Record<string, { label: string; cls: string }> = {
    "in-clinic": { label: "In-Clinic", cls: "bg-teal-100 text-teal-700" },
    "online": { label: "Online 🎥", cls: "bg-violet-100 text-violet-700" },
    "external": { label: "External 🏥", cls: "bg-amber-100 text-amber-700" },
  };

  const apptType = typeBadge[a.appointmentType ?? "in-clinic"];
  const apptTime = new Date(a.appointmentDate);
  const apptEndTime = effectiveAppointmentEnd({ appointmentDate: apptTime, endDate: a.endDate, duration: a.duration });
  const externalLocationLabel = resolveEffectiveExternalLocation(a);
  const externalMapLink = a.appointmentType === "external" ? a.partnerClinicGoogleMapsUrl?.trim() : undefined;
  const effectiveMeetingLink = liveMeetingLink || a.meetingLink;
  const isCancelled = a.status === "cancelled";
  const resolvedGoogleEventUrl = googleSync?.verifiedEventUrl || googleEventLink?.url;
  const isMappedEventPreparing = Boolean(googleSync?.canOpenInGoogle && eventReadinessPhase !== "ready");
  const isPast = isBefore(apptTime, new Date());
  const relatedRecordLabel = a.relatedEntityType === "lead"
    ? "Lead"
    : a.relatedEntityType === "patient"
      ? "Patient"
      : "Related record";
  const relatedRecordAction = a.relatedEntityType === "lead"
    ? { label: "Open Lead", path: `/leads/${a.relatedEntityId}` }
    : a.relatedEntityType === "patient"
      ? { label: "Open Patient", path: `/patients/${a.relatedEntityId}` }
      : null;
  const linkedRecordDisplayName = a.relatedEntityDisplayName
    || `${a.patientFirstName ?? ""} ${a.patientLastName ?? ""}`.trim()
    || a.leadName
    || "Linked Patient or Lead";

  const handleCancel = () => {
    if (!cancelReason.trim()) return toast.error("Please provide a cancellation reason");
    updateAppt.mutate({ id: a.id, data: { status: "cancelled", cancellationReason: cancelReason } });
    setShowCancelDialog(false);
  };
  const handleStatusActionConfirm = () => {
    if (pendingStatusAction === "confirm") updateAppt.mutate({ id: a.id, data: { status: "confirmed" } });
    if (pendingStatusAction === "reactivate") updateAppt.mutate({ id: a.id, data: { status: "upcoming" } });
    if (pendingStatusAction === "complete") updateAppt.mutate({ id: a.id, data: { status: "completed" } });
    if (pendingStatusAction === "no_show") markNoShow.mutate({ id: a.id });
    setPendingStatusAction(null);
  };

  return (
    <>
      <Dialog open onOpenChange={onClose}>
          <DialogContent className="flex max-h-[92dvh] max-w-md flex-col overflow-hidden p-0 sm:max-w-3xl">
            <DialogHeader className="shrink-0 border-b bg-background px-4 py-3 pr-12 sm:px-5">
            <DialogTitle className="text-sm">Appointment Details</DialogTitle>
            <AppointmentDetailsIdentityRow
              name={linkedRecordDisplayName}
              supportingText={a.purpose?.replace(/-/g, " ")}
              badges={<>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadge[a.status] ?? "bg-gray-100"}`}>{a.status.replace(/_/g, " ")}</span>
                {apptType && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${apptType.cls}`}>{apptType.label}</span>}
                {availabilityOverrideState?.isOverridden && <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">Availability Override</span>}
                {availabilityOverrideState?.isNeedsRescheduling && <span className="rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-800 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-300">Needs Rescheduling</span>}
              </>}
            />
            </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
            <AppointmentDetailsTimingGroup
              date={format(apptTime, "MMM d, yyyy")}
              start={format(apptTime, "h:mm a")}
              end={format(apptEndTime, "h:mm a")}
              duration={a.duration ? `${a.duration} min` : null}
            />
            <div className="grid grid-cols-1 gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
              {a.doctorName && (
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">Doctor</p>
                  <p className="font-medium">Dr. {a.doctorName}</p>
                </div>
              )}
              {a.hostUserName && (
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">Host</p>
                  <p className="font-medium">{a.hostUserName}</p>
                </div>
              )}
              {a.appointmentType === "external" && externalLocationLabel && (
                <div className="min-w-0 sm:col-span-2">
                  <p className="text-[11px] text-muted-foreground">Location</p>
                  <p className="font-medium">{externalLocationLabel}</p>
                  {externalMapLink && (
                    <a href={externalMapLink} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-2">
                      <ExternalLink className="h-3.5 w-3.5" /> Open Map
                    </a>
                  )}
                </div>
              )}
            </div>

            {effectiveMeetingLink && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">{isCancelled ? "Previously Saved Meeting Link" : "Meeting Link"}</p>
                {isCancelled ? (
                  <p className="text-sm text-muted-foreground">Retained in history and inactive while this appointment is cancelled.</p>
                ) : (
                  <a href={effectiveMeetingLink} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-primary underline break-all">{effectiveMeetingLink}</a>
                )}
              </div>
            )}
            {a.appointmentType === "online" && !effectiveMeetingLink && (
              isCancelled ? (
                <div className="rounded-lg border border-muted bg-muted/40 p-3 text-xs text-muted-foreground">Meeting-link actions are unavailable while this appointment is cancelled. Re-activate it to create or replace a meeting link.</div>
              ) : (
                <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
                  <p className="text-xs text-violet-900 mb-2">No meeting link has been added.</p>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={generateGoogleMeet.isPending || isMappedEventPreparing}
                    onClick={() => generateGoogleMeet.mutate({ appointmentId: a.id })}>
                    {generateGoogleMeet.isPending || isMappedEventPreparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
                    {isMappedEventPreparing ? "Preparing Google event…" : generateGoogleMeet.isPending ? "Generating Google Meet…" : "Generate Google Meet"}
                  </Button>
                  {isMappedEventPreparing && <p className="mt-1 text-xs text-violet-900/80">Google Meet will be available once the mapped event is ready.</p>}
                </div>
              )
            )}
            {a.notes && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                <p className="text-sm bg-muted/50 rounded-lg p-3">{a.notes}</p>
              </div>
            )}
            {a.cancellationReason && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Cancellation Reason</p>
                <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{a.cancellationReason}</p>
              </div>
            )}

            {googleSync && (
              <div className="rounded-lg border bg-muted/25 px-3 py-2.5 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-2">
                    <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    <div className="min-w-0">
                      <p className="font-semibold">Google Calendar <span className="ml-1 text-xs font-medium text-emerald-700">{googleSync.status === "synced" ? "✓ synced" : googleSync.status === "reconnect_required" ? "Reconnect required" : googleSync.status.replace(/_/g, " ")}</span></p>
                      {googleSync.destinationCalendarName && <p className="mt-0.5 truncate text-xs text-muted-foreground">Destination: {googleSync.destinationCalendarName}</p>}
                      {googleSync.lastSyncedAt && <p className="mt-0.5 text-xs text-muted-foreground">Last successful sync: {format(new Date(googleSync.lastSyncedAt), "dd MMM yyyy, HH:mm")}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:justify-end">
                    {googleSync.canOpenInGoogle && eventReadinessPhase !== "ready" && eventReadinessPhase !== "timeout" && (
                      <Button size="sm" variant="outline" className="gap-1.5" disabled>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {eventReadinessPhase === "settling" ? "Synchronizing Google event…" : "Verifying Google event…"}
                      </Button>
                    )}
                    {googleSync.canOpenInGoogle && eventReadinessPhase === "ready" && resolvedGoogleEventUrl && (
                      <Button size="sm" variant="outline" className="gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 hover:text-emerald-950" onClick={() => window.location.assign(resolvedGoogleEventUrl)}>
                        <ExternalLink className="h-3.5 w-3.5" />Open in Google Calendar
                      </Button>
                    )}
                    {googleSync.canRetry && (
                      <Button size="sm" variant="outline" className="gap-1.5" disabled={retryGoogleSync.isPending}
                        onClick={() => retryGoogleSync.mutate({ appointmentId: a.id })}>
                        <RefreshCw className={`h-3.5 w-3.5 ${retryGoogleSync.isPending ? "animate-spin" : ""}`} />
                        {retryGoogleSync.isPending ? "Retrying..." : "Retry Google Sync"}
                      </Button>
                    )}
                  </div>
                </div>
                {googleSync.canOpenInGoogle && eventReadinessPhase !== "ready" && eventReadinessPhase !== "timeout" && (
                  <div className="mt-2 flex items-center gap-2 rounded-md bg-blue-50 px-2.5 py-2 text-xs text-blue-900" role="status" aria-live="polite">
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    <span>{eventReadinessPhase === "settling" ? `Synchronizing appointment with Google Calendar… ${eventSecondsRemaining}s` : "Verifying that the mapped Google Calendar event is ready…"}</span>
                  </div>
                )}
                {googleSync.canOpenInGoogle && eventReadinessPhase === "timeout" && (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-900" role="status">
                    <span>Google Calendar readiness could not be confirmed yet.</span>
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => { setEventReadinessPhase("verifying"); setReadinessAttempt(value => value + 1); }}>
                      <RefreshCw className="h-3 w-3" />Retry verification
                    </Button>
                  </div>
                )}
                {googleSync.canOpenInGoogle && eventReadinessPhase === "ready" && isLoadingGoogleEventLink && <p className="mt-1 text-xs text-muted-foreground">Verifying mapped Google event…</p>}
                {googleSync.lastError && <p className="mt-2 text-xs text-amber-700">{googleSync.lastError}</p>}
              </div>
            )}

            {user?.role === "admin" && (
              <AppointmentDetailsDisclosure
                title="Patient Reminder History"
                summary={patientReminderHistorySummary}
                open={showPatientReminderHistory}
                onToggle={() => setShowPatientReminderHistory(v => !v)}
              >
                {showPatientReminderHistory && (
                  <>
                    <p className="text-xs text-muted-foreground">Automatic Fertiliv patient reminders are not currently active.</p>
                    {isLoadingReminderHistory ? (
                      <p className="mt-2 text-xs text-muted-foreground">Loading reminder history…</p>
                    ) : !reminderHistory?.length ? (
                      <p className="mt-2 text-xs text-muted-foreground">No automatic reminders have been recorded for this appointment.</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {reminderHistory.map((reminder: any) => (
                          <div key={reminder.id} className="rounded-md border bg-background px-2.5 py-2 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">{reminder.offsetMinutes === 1440 ? "24-hour" : "2-hour"} reminder · rev {reminder.scheduleRevision}</span>
                              <span className="capitalize text-muted-foreground">{reminder.status.replace(/_/g, " ")}</span>
                            </div>
                            <p className="mt-1 text-muted-foreground">Due: {new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(reminder.dueAt))} Europe/Istanbul</p>
                            <p className="mt-1 text-muted-foreground">Locale: {reminder.deliveredLanguage ?? "Pending"}{reminder.localeFallbackUsed ? " · English fallback" : ""} · Attempts: {reminder.attemptCount}</p>
                            {(reminder.invalidationReason || reminder.skippedReason || reminder.lastFailureClassification) && <p className="mt-1 text-muted-foreground">Outcome: {reminder.invalidationReason ?? reminder.skippedReason ?? reminder.lastFailureClassification}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </AppointmentDetailsDisclosure>
            )}

            <AppointmentDetailsDisclosure
              title="Activity Log"
              summary={activityLog?.length ? `${activityLog.length} events` : undefined}
              open={showActivityLog}
              onToggle={() => setShowActivityLog(v => !v)}
            >
              {showActivityLog && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {!activityLog || activityLog.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
                  ) : activityLog.map(log => (
                    <div key={log.id} className="text-xs flex gap-2">
                      <span className="text-muted-foreground shrink-0">{format(new Date(log.createdAt), "MMM d, HH:mm")}</span>
                      <span className="font-medium shrink-0">{log.userName ?? "System"}</span>
                      <span className="text-muted-foreground">{log.action.replace(/_/g, " ")}{log.newValue ? ` — ${log.newValue}` : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </AppointmentDetailsDisclosure>

            <div className="space-y-2 border-t pt-3">
              <AppointmentDetailsActionGroup label="Primary actions">
                {appointmentCommunicationActionLabel(a.status) && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowSendDetails(true)}>
                    <Mail className="h-3.5 w-3.5" /> {appointmentCommunicationActionLabel(a.status)}
                  </Button>
                )}
                {a.status === "cancelled" && <Button size="sm" variant="outline" className="gap-1.5 text-blue-700 border-blue-300" onClick={() => setPendingStatusAction("reactivate")}><RefreshCw className="h-3.5 w-3.5" /> Re-activate</Button>}
                {a.status === "upcoming" && <Button size="sm" variant="outline" className="gap-1.5 text-emerald-700 border-emerald-300" onClick={() => setPendingStatusAction("confirm")}>Confirm</Button>}
                {a.status !== "completed" && a.status !== "cancelled" && <Button size="sm" variant="outline" className={`gap-1.5 ${isPast ? "text-green-700 border-green-300" : "text-muted-foreground border-muted cursor-not-allowed opacity-50"}`} disabled={!isPast} title={!isPast ? "Cannot mark as complete before the appointment time" : "Mark as completed"} onClick={() => isPast && setPendingStatusAction("complete")}>{!isPast && <AlertTriangle className="h-3.5 w-3.5" />}Complete</Button>}
                {a.status !== "completed" && a.status !== "cancelled" && isPast && <Button size="sm" variant="outline" className="gap-1.5 text-orange-700 border-orange-300" onClick={() => setPendingStatusAction("no_show")}>No Show</Button>}
              </AppointmentDetailsActionGroup>
              <AppointmentDetailsActionGroup label="More">
                {relatedRecordAction && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
                  onClose();
                  setLocation(relatedRecordAction.path);
                }}>
                  <User className="h-3.5 w-3.5" /> {relatedRecordAction.label}
                </Button>
              )}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onEdit(a)}>
                <Edit className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadICS(a, clinicInfo)}>
                <Download className="h-3.5 w-3.5" /> .ics
              </Button>
              </AppointmentDetailsActionGroup>
              <AppointmentDetailsActionGroup label="Danger zone" tone="danger">
                {a.status !== "completed" && a.status !== "cancelled" && <Button size="sm" variant="outline" className="gap-1.5 text-red-700 border-red-300" onClick={() => setShowCancelDialog(true)}>Cancel Appointment</Button>}
                <Button size="sm" variant="ghost" className="gap-1.5 text-red-700" onClick={() => setShowDeleteDialog(true)}>Delete Appointment</Button>
              </AppointmentDetailsActionGroup>
            </div>
          </div>
          <div className="shrink-0 border-t bg-background px-4 py-2.5 sm:px-5">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onClose}>Close</Button>
          </div>
          <AppointmentStatusConfirmation
            action={pendingStatusAction}
            onActionChange={setPendingStatusAction}
            onConfirm={handleStatusActionConfirm}
            isPending={updateAppt.isPending || markNoShow.isPending}
          />
          <AppointmentDetailsSecondaryLayer
            open={showCancelDialog}
            title="Cancel Appointment"
            description="Please provide a reason for cancellation."
            onDismiss={() => setShowCancelDialog(false)}
          >
            <div className="space-y-3">
              <Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="e.g. Patient requested reschedule..." rows={3} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCancelDialog(false)}>Back</Button>
                <Button variant="destructive" onClick={handleCancel} disabled={updateAppt.isPending}>Confirm Cancellation</Button>
              </div>
            </div>
          </AppointmentDetailsSecondaryLayer>
          <AppointmentDetailsSecondaryLayer
            open={showDeleteDialog}
            title="Delete Appointment"
            description="This action is permanent and cannot be undone. The deletion will be recorded in the activity log."
            onDismiss={() => setShowDeleteDialog(false)}
          >
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Reason for deletion (optional)</Label>
                <Textarea value={deleteReason} onChange={e => setDeleteReason(e.target.value)} placeholder="e.g. Duplicate entry..." rows={2} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
                <Button variant="destructive" disabled={deleteAppt.isPending} onClick={() => deleteAppt.mutate({ id: a.id, reason: deleteReason || undefined })}>
                  {deleteAppt.isPending ? "Deleting..." : "Permanently Delete"}
                </Button>
              </div>
            </div>
          </AppointmentDetailsSecondaryLayer>
        </DialogContent>
      </Dialog>

      <AppointmentDetailsSendModal appointmentId={a.id} open={showSendDetails} onOpenChange={setShowSendDetails} />
    </>
  );
}

// ─── Appointment Form Modal ───────────────────────────────────────────────────
function AppointmentFormModal({ open, onClose, defaultDate, onSuccess, editAppointment, patients, staffUsers }: {
  open: boolean; onClose: () => void; defaultDate: Date; onSuccess: () => void;
  editAppointment?: any; patients: any[]; staffUsers: any[];
}) {
  const isEdit = !!editAppointment;
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data: doctors } = trpc.doctors.list.useQuery();
  const { data: services } = trpc.services.list.useQuery({});
  const { data: partnerClinics } = trpc.partnerClinics.list.useQuery();
  const { data: availabilityOverrideState } = trpc.appointments.availabilityOverrideState.useQuery(
    { appointmentId: editAppointment?.id ?? 0 },
    { enabled: Boolean(editAppointment?.id) },
  );

  const reportPostSaveEmailOutcome = (action: "created" | "updated", result: any) => {
    const outcome = result?.postSaveEmail?.outcome;
    if (outcome === "sent") {
      toast.success(`Appointment ${action} and details email sent.`);
    } else if (outcome === "failed") {
      toast.warning(`Appointment ${action}, but the details email could not be delivered.`);
    } else if (outcome === "unavailable") {
      toast.warning(`Appointment ${action}, but no eligible primary recipient was available for the details email.`);
    } else {
      toast.success(`Appointment ${action}`);
    }
  };

  const createAppt = trpc.appointments.create.useMutation({
    onSuccess: result => { reportPostSaveEmailOutcome("created", result); onSuccess(); },
    onError: () => toast.error("Appointment could not be saved. Please review the marked fields and try again."),
  });
  const updateAppt = trpc.appointments.update.useMutation({
    onSuccess: result => { reportPostSaveEmailOutcome("updated", result); onSuccess(); },
    onError: () => toast.error("Appointment could not be saved. Please review the marked fields and try again."),
  });
  const generateGoogleMeet = trpc.appointments.generateGoogleMeet.useMutation({
    onSuccess: result => {
      if (result.status === "generated" && result.meetingLink) {
        setForm(f => ({ ...f, meetingLink: result.meetingLink! }));
        toast.success("Google Meet link generated and saved.");
      } else if (result.status === "pending") toast.info(result.message ?? "Google Meet is being prepared. Please retry shortly.");
      else toast.info(result.message ?? "A meeting link is already available.");
    },
    onError: () => toast.error("Google Meet could not be generated. Check the Google Calendar connection and try again."),
  });

  const defaultForm = {
    patientId: "", doctorId: "", serviceId: "", title: "",
    date: format(defaultDate, "yyyy-MM-dd"), time: "09:00", endTime: "09:30", duration: "30",
    type: "consultation", appointmentType: "in-clinic", purpose: "",
    meetingLink: "", hostUserId: "", notes: "",
    partnerClinicId: "", externalLocation: "", notifyPartner: false,
    googleReminderMode: "calendar_default" as "calendar_default" | "custom",
    sendDetailsAfterSave: false,
    availabilityOverrideReason: "",
  };

  const [form, setForm] = useState(defaultForm);
  // Extra patients created inline during this modal session
  const [localPatients, setLocalPatients] = useState<any[]>([]);
  const allPatients = useMemo(() => {
    const ids = new Set(patients.map((p: any) => p.id));
    return [...patients, ...localPatients.filter(p => !ids.has(p.id))];
  }, [patients, localPatients]);

  // Determine if selected patient has a linked partner (must be after useState)
  const selectedPatientData = allPatients.find(p => String(p.id) === form.patientId);
  const hasLinkedPartner = !!(selectedPatientData as any)?.partnerId;

  useEffect(() => {
    if (open) {
      if (editAppointment) {
        const d = new Date(editAppointment.appointmentDate);
        setForm({
          patientId: String(editAppointment.patientId ?? ""),
          doctorId: String(editAppointment.doctorId ?? ""),
          serviceId: String(editAppointment.serviceId ?? ""),
          title: editAppointment.title ?? "",
          date: format(d, "yyyy-MM-dd"), time: format(d, "HH:mm"),
          endTime: localTimeValue(effectiveAppointmentEnd({ appointmentDate: d, endDate: editAppointment.endDate, duration: editAppointment.duration })),
          duration: String(editAppointment.duration ?? "30"),
          type: editAppointment.type ?? "consultation",
          appointmentType: editAppointment.appointmentType ?? "in-clinic",
          purpose: editAppointment.purpose ?? "",
          meetingLink: editAppointment.meetingLink ?? "",
          hostUserId: String(editAppointment.hostUserId ?? ""),
          notes: editAppointment.notes ?? "",
          partnerClinicId: String(editAppointment.partnerClinicId ?? ""),
          externalLocation: editAppointment.externalLocation ?? "",
          notifyPartner: false,
          googleReminderMode: editAppointment.googleReminderMode === "custom" ? "custom" : "calendar_default",
          sendDetailsAfterSave: false,
          availabilityOverrideReason: editAppointment.availabilityOverrideReason ?? "",
        });
      } else {
        setForm({ ...defaultForm, date: format(defaultDate, "yyyy-MM-dd") });
      }
    }
  }, [open, editAppointment?.id]);

  // Past date/time guard
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const nowHour = format(new Date(), "HH:mm");
  const minTime = form.date === todayStr ? nowHour : "00:00";
  const setStartTime = (time: string) => {
    setForm(f => {
      const start = new Date(`${f.date}T${time}`);
      const end = new Date(start.getTime() + (parseInt(f.duration) || 30) * 60_000);
      return { ...f, time, endTime: localTimeValue(end) };
    });
  };
  const setDuration = (duration: string) => {
    setForm(f => {
      const start = new Date(`${f.date}T${f.time}`);
      const end = new Date(start.getTime() + (parseInt(duration) || 30) * 60_000);
      return { ...f, duration, endTime: localTimeValue(end) };
    });
  };
  const setEndTime = (endTime: string) => {
    setForm(f => {
      const start = new Date(`${f.date}T${f.time}`);
      const end = endDateFromLocalTime(start, endTime);
      return { ...f, endTime, duration: end ? String(Math.round((end.getTime() - start.getTime()) / 60_000)) : f.duration };
    });
  };

  // Conflict detection — runs whenever date/time/duration/doctor/patient changes
  const conflictDate = useMemo(() => {
    if (!form.date || !form.time) return null;
    const d = new Date(`${form.date}T${form.time}`);
    return isNaN(d.getTime()) ? null : d;
  }, [form.date, form.time]);

  const { data: conflicts } = trpc.appointments.checkConflicts.useQuery(
    {
      appointmentDate: conflictDate ?? new Date(),
      duration: parseInt(form.duration) || 30,
      doctorId: form.doctorId ? parseInt(form.doctorId) : undefined,
      patientId: form.patientId ? parseInt(form.patientId) : undefined,
      excludeId: isEdit ? editAppointment?.id : undefined,
    },
    { enabled: !!conflictDate && open }
  );

  // Staff availability check — warn if doctor or host is on time-off
  // doctors.id ≠ users.id; we need the doctor's userId for the availability check
  const selectedDoctor = doctors?.find(d => String(d.id) === form.doctorId);
  const { data: doctorUnavail } = trpc.availability.checkUnavailable.useQuery(
    { userId: selectedDoctor?.userId ?? 0, date: conflictDate ?? new Date() },
    { enabled: !!form.doctorId && !!selectedDoctor?.userId && !!conflictDate && open }
  );
  const { data: hostUnavail } = trpc.availability.checkUnavailable.useQuery(
    { userId: parseInt(form.hostUserId), date: conflictDate ?? new Date() },
    { enabled: !!form.hostUserId && !!conflictDate && open }
  );
  const unavailWarnings: { name: string; reason?: string; title?: string }[] = [];
  if (doctorUnavail?.unavailable) {
    const doc = doctors?.find(d => String(d.id) === form.doctorId);
    unavailWarnings.push({ name: doc ? `Dr. ${doc.name}` : "Doctor", reason: doctorUnavail.reason ?? undefined, title: doctorUnavail.title ?? undefined });
  }
  if (hostUnavail?.unavailable) {
    const host = staffUsers.find((u: any) => String(u.id) === form.hostUserId);
    unavailWarnings.push({ name: host?.name ?? "Host", reason: hostUnavail.reason ?? undefined, title: hostUnavail.title ?? undefined });
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEdit && !form.patientId) return toast.error("Patient is required");
    // Block past appointments
    const selectedDt = new Date(`${form.date}T${form.time}`);
    const now = new Date();
    now.setSeconds(0, 0);
    if (selectedDt < now) return toast.error("Cannot schedule an appointment in the past");

    const appointmentDate = new Date(`${form.date}T${form.time}`);
    const endDate = endDateFromLocalTime(appointmentDate, form.endTime);
    if (!endDate) return toast.error("Please enter a valid end time.");
    const meetingLinkError = validateOptionalMeetingLink(form.meetingLink);
    if (meetingLinkError) return toast.error(meetingLinkError);
    // Auto-generate title if empty
    const selectedPatient = patients.find(p => String(p.id) === form.patientId);
    const autoTitle = selectedPatient
      ? `${selectedPatient.firstName} ${selectedPatient.lastName}${form.purpose ? ` — ${form.purpose.replace(/-/g, " ")}` : ""}`
      : undefined;

    const payload = {
      patientId: form.patientId ? parseInt(form.patientId) : undefined,
      doctorId: form.doctorId ? parseInt(form.doctorId) : undefined,
      serviceId: form.serviceId ? parseInt(form.serviceId) : undefined,
      title: form.title.trim() || autoTitle || "Appointment",
      appointmentDate,
      endDate,
      duration: Math.round((endDate.getTime() - appointmentDate.getTime()) / 60_000),
      type: form.type as any,
      appointmentType: form.appointmentType as any,
      purpose: form.purpose as any || undefined,
      meetingLink: form.appointmentType === "online"
        ? (form.meetingLink.trim() || (isEdit ? null : undefined))
        : (isEdit ? null : undefined),
      hostUserId: form.hostUserId ? parseInt(form.hostUserId) : undefined,
      notes: form.notes || undefined,
      partnerClinicId: form.partnerClinicId ? parseInt(form.partnerClinicId) : (isEdit ? null : undefined),
      externalLocation: form.appointmentType === "external" && !form.partnerClinicId
        ? (form.externalLocation.trim() || (isEdit ? null : undefined))
        : (isEdit ? null : undefined),
      googleReminderMode: form.googleReminderMode,
      notifyPartner: form.notifyPartner || undefined,
      sendDetailsAfterSave: form.sendDetailsAfterSave,
      availabilityOverrideReason: form.availabilityOverrideReason.trim() || undefined,
    };

    if (isEdit) updateAppt.mutate({ id: editAppointment.id, availabilityOverrideReason: payload.availabilityOverrideReason, data: payload as any });
    else createAppt.mutate(payload as any);
  };

  const isPending = createAppt.isPending || updateAppt.isPending;
  const hasConflicts = !!(conflicts && conflicts.length > 0);
  const meetingLinkError = validateOptionalMeetingLink(form.meetingLink);
  const isCancelledEdit = Boolean(isEdit && editAppointment?.status === "cancelled");
  const canGenerateMeetFromSavedAppointment = Boolean(
    isEdit
    && !isCancelledEdit
    && editAppointment.appointmentType === "online"
    && !editAppointment.meetingLink,
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[680px] flex-col overflow-x-clip overflow-y-hidden p-0 touch-pan-y [&_input]:box-border [&_input]:max-w-full [&_input]:text-base [&_textarea]:box-border [&_textarea]:max-w-full [&_textarea]:text-base [&_[role=combobox]]:text-base sm:max-h-[90vh] sm:w-[min(92vw,680px)] sm:p-6 sm:[&_input]:text-sm sm:[&_textarea]:text-sm sm:[&_[role=combobox]]:text-sm">
        <DialogHeader className="shrink-0 px-4 pt-4 sm:px-0 sm:pt-0">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {isEdit ? "Edit Appointment" : "New Appointment"}
            {isEdit && availabilityOverrideState?.isOverridden && <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">Availability Override</span>}
            {isEdit && availabilityOverrideState?.isNeedsRescheduling && <span className="rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-300">Needs Rescheduling</span>}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip">
          <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-clip overflow-y-auto overscroll-contain px-4 py-4 sm:px-0 sm:py-0">
          <div className="grid min-w-0 grid-cols-1 gap-4 [&>div]:min-w-0 [&_.col-span-2]:col-span-1 sm:grid-cols-2 sm:[&_.col-span-2]:col-span-2">
            {/* Patient — searchable combobox */}
            {!isEdit && (
              <div className="col-span-2 space-y-1.5">
                <Label>Patient *</Label>
                <PatientCombobox
                  value={form.patientId}
                  onChange={v => setForm(f => ({ ...f, patientId: v }))}
                  patients={allPatients}
                  onPatientCreated={p => setLocalPatients(prev => [...prev, p])}
                />
              </div>
            )}

            <div className="col-span-2 space-y-1.5">
              <Label>Title <span className="text-muted-foreground text-xs">(optional — auto-generated if empty)</span></Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Initial Consultation" />
            </div>

            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" className="w-full min-w-0 max-w-full" value={form.date} min={todayStr}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Start Time</Label>
              <Input type="time" className="w-full min-w-0 max-w-full" value={form.time} min={minTime}
                onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End Time</Label>
              <Input type="time" className="w-full min-w-0 max-w-full" value={form.endTime} onChange={e => setEndTime(e.target.value)} />
              {form.endTime < form.time && <p className="text-xs text-muted-foreground">An earlier clock time is scheduled for the following day.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Duration <span className="text-xs font-normal text-muted-foreground">(derived)</span></Label>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">{form.duration || 0} min</div>
              <div className="flex flex-wrap gap-1" aria-label="Quick duration shortcuts">
                {["15", "30", "45", "60"].map(d => <Button key={d} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setDuration(d)}>{d} min</Button>)}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Appointment Type</Label>
              <Select value={form.appointmentType} onValueChange={v => setForm(f => ({
                ...f,
                appointmentType: v,
                meetingLink: v === "online" ? f.meetingLink : "",
                partnerClinicId: v === "external" ? f.partnerClinicId : "",
                externalLocation: v === "external" ? f.externalLocation : "",
              }))}>
                <SelectTrigger className="w-full min-w-0 max-w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in-clinic">In-Clinic</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="external">External</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Purpose</Label>
              <Select value={form.purpose || "_none"} onValueChange={v => setForm(f => ({ ...f, purpose: v === "_none" ? "" : v }))}>
                <SelectTrigger className="w-full min-w-0 max-w-full"><SelectValue placeholder="Select purpose" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  <SelectItem value="sales-consultation">Sales Consultation</SelectItem>
                  <SelectItem value="medical-consultation">Medical Consultation</SelectItem>
                  <SelectItem value="follow-up">Follow-up</SelectItem>
                  <SelectItem value="procedure">Procedure</SelectItem>
                  <SelectItem value="diagnostic-test">Diagnostic Test</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Clinic Google Calendar Reminders</Label>
              <Select value={form.googleReminderMode} onValueChange={(value: "calendar_default" | "custom") => setForm(f => ({ ...f, googleReminderMode: value }))}>
                <SelectTrigger className="w-full min-w-0 max-w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="calendar_default">Use Calendar Default</SelectItem>
                  <SelectItem value="custom">Custom — 24h Email + 2h Popup</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Applies only to the connected clinic Google Calendar event. It does not send a patient email or add attendees.</p>
            </div>
            {form.appointmentType === "external" && (
              <div className="col-span-2 space-y-1.5">
                <Label>Partner Clinic</Label>
                <Select value={form.partnerClinicId || "_none"} onValueChange={v => setForm(f => ({ ...f, partnerClinicId: v === "_none" ? "" : v, externalLocation: "" }))}>
                  <SelectTrigger className="w-full min-w-0 max-w-full"><SelectValue placeholder="Select partner clinic (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None / Manual Address —</SelectItem>
                    {partnerClinics?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!form.partnerClinicId && (
                  <Input
                    value={form.externalLocation}
                    onChange={e => setForm(f => ({ ...f, externalLocation: e.target.value }))}
                    placeholder="Enter address / location manually"
                    className="mt-1.5"
                  />
                )}
              </div>
            )}
            {form.appointmentType === "online" && (
              <div className="col-span-2 space-y-1.5">
                <Label>Meeting Link</Label>
                {isCancelledEdit ? <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Meeting link is retained and locked while this appointment is cancelled. Re-activate it before changing the link.</p> : <>
                  <div className="relative">
                    <Input value={form.meetingLink} onChange={e => setForm(f => ({ ...f, meetingLink: e.target.value }))}
                      placeholder="https://meet.google.com/..." aria-invalid={Boolean(meetingLinkError)} className={`pr-10 ${meetingLinkError ? "border-destructive focus-visible:ring-destructive" : ""}`} />
                    {form.meetingLink && <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2" aria-label="Clear meeting link" title="Clear meeting link" onClick={() => setForm(f => ({ ...f, meetingLink: "" }))}><X className="h-4 w-4" /></Button>}
                  </div>
                  {meetingLinkError && <p className="text-xs text-destructive">{meetingLinkError}</p>}
                  {!form.meetingLink && (canGenerateMeetFromSavedAppointment ? (
                  <Button type="button" variant="outline" size="sm" className="mt-1 w-full gap-1.5 sm:w-auto" disabled={generateGoogleMeet.isPending}
                    onClick={() => generateGoogleMeet.mutate({ appointmentId: editAppointment.id })}>
                    <Video className="h-3.5 w-3.5" />{generateGoogleMeet.isPending ? "Generating Google Meet…" : "Generate Google Meet"}
                  </Button>
                  ) : <p className="text-xs text-muted-foreground">Save this appointment as Online first, then generate Google Meet from its saved details.</p>)}
                </>}
              </div>
            )}

            <div className="col-span-2 space-y-1.5" style={{minWidth:0}}>
              <Label>Doctor</Label>
              <Select value={form.doctorId || "_none"} onValueChange={v => setForm(f => ({ ...f, doctorId: v === "_none" ? "" : v }))}>
                <SelectTrigger
                  className="w-full min-w-0 overflow-hidden"
                  title={doctors?.find(d => String(d.id) === form.doctorId)?.name || ""}
                >
                  <span className="truncate block w-full text-left">
                    <SelectValue placeholder="— None —" />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {doctors?.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Host (Staff)</Label>
              <Select value={form.hostUserId || "_none"} onValueChange={v => setForm(f => ({ ...f, hostUserId: v === "_none" ? "" : v }))}>
                <SelectTrigger className="w-full min-w-0 max-w-full"><SelectValue placeholder="Select host" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {staffUsers.map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1.5" style={{minWidth:0}}>
              <Label>Service</Label>
              <Select value={form.serviceId || "_none"} onValueChange={v => setForm(f => ({ ...f, serviceId: v === "_none" ? "" : v }))}>
                <SelectTrigger
                  className="w-full min-w-0 overflow-hidden"
                  title={services?.find(s => String(s.id) === form.serviceId)?.name || ""}
                >
                  <span className="truncate block w-full text-left">
                    <SelectValue placeholder="— None —" />
                  </span>
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="_none">— None —</SelectItem>
                  {([
                    { key: "consultation", label: "Consultations" },
                    { key: "procedure", label: "Procedures" },
                    { key: "lab_test", label: "Lab Tests" },
                    { key: "radiology_test", label: "Radiology Tests" },
                    { key: "pathology_test", label: "Pathology Tests" },
                    { key: "other_test", label: "Other Tests" },
                  ] as const).map(({ key, label }) => {
                    const group = services?.filter(s => s.category === key && s.status === "active");
                    if (!group || group.length === 0) return null;
                    return (
                      <>
                        <div key={`hdr-${key}`} className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none">{label}</div>
                        {group.map(s => (
                          <SelectItem key={s.id} value={String(s.id)} className="pl-4">
                            {s.name}
                            {s.price ? <span className="ml-auto text-xs text-muted-foreground pl-3">{Number(s.price).toLocaleString()} ₺</span> : null}
                          </SelectItem>
                        ))}
                      </>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} placeholder="Optional notes..." />
            </div>
          </div>
          {/* Staff time-off warning banner */}
          {unavailWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 space-y-2">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Staff Time-Off blocks scheduling
              </div>
              <ul className="space-y-1.5">
                {unavailWarnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-700 dark:text-amber-400">
                    <strong>{w.name}</strong> is marked as unavailable on this date
                    {w.title ? ` (${w.title})` : ""}
                    {w.reason ? ` — Reason: ${w.reason.charAt(0).toUpperCase() + w.reason.slice(1)}` : ""}.
                  </li>
                ))}
              </ul>
              {isAdmin ? (
                <div className="border-t border-amber-200 pt-2 space-y-1.5">
                  <Label htmlFor="availability-override" className="text-xs text-amber-800 dark:text-amber-300">Admin availability override reason *</Label>
                  <Textarea id="availability-override" value={form.availabilityOverrideReason} onChange={(event) => setForm((current) => ({ ...current, availabilityOverrideReason: event.target.value }))} rows={2} placeholder="Explain why this appointment may proceed during Time-Off" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">Saving requires a reason of at least 3 characters and will be recorded in Appointment Activity and Audit Log.</p>
                </div>
              ) : (
                <p className="text-xs text-amber-700 dark:text-amber-400">Only an administrator can approve a documented availability override.</p>
              )}
            </div>
          )}
          {isEdit && availabilityOverrideState?.isOverridden && unavailWarnings.length === 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              Availability Override is retained in this appointment’s internal audit history. It clears automatically if the appointment is moved outside conflicting Time-Off.
            </div>
          )}
          {/* Scheduling conflict warning banner */}
          {hasConflicts && (
            <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-700 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 font-semibold text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Scheduling conflict detected
              </div>
              <ul className="space-y-1">
                {conflicts!.map((c, i) => (
                  <li key={i} className="text-xs text-orange-700 dark:text-orange-400">
                    {c.type === "doctor" ? "Doctor" : "Patient"} already has <strong>{c.conflictingTitle}</strong> at {format(new Date(c.conflictingDate), "h:mm a")} — overlapping time slot.
                  </li>
                ))}
              </ul>
              <p className="text-xs text-orange-600 dark:text-orange-500">You can still save, but please review the schedule.</p>
            </div>
          )}
          {hasLinkedPartner && (
            <div className="flex items-start gap-3 rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-700 p-3">
              <Checkbox
                id="notifyPartner"
                checked={form.notifyPartner}
                onCheckedChange={v => setForm(f => ({ ...f, notifyPartner: !!v }))}
                className="mt-0.5 border-orange-400 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
              />
              <div>
                <label htmlFor="notifyPartner" className="text-sm font-medium text-orange-700 dark:text-orange-400 cursor-pointer">
                  Also send email notification to linked partner
                </label>
                <p className="text-xs text-orange-600 dark:text-orange-500 mt-0.5">
                  The partner account linked to this patient will receive a copy of this appointment notification.
                </p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
            <Checkbox
              id="sendDetailsAfterSave"
              checked={form.sendDetailsAfterSave}
              onCheckedChange={value => setForm(current => ({ ...current, sendDetailsAfterSave: Boolean(value) }))}
              className="mt-0.5 border-blue-400 data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600"
            />
            <div>
              <label htmlFor="sendDetailsAfterSave" className="cursor-pointer text-sm font-medium text-blue-800 dark:text-blue-200">
                Send appointment details by email after saving
              </label>
              <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">
                Sends the existing Appointment Details email once to the eligible primary participant after this appointment is saved.
              </p>
            </div>
          </div>
          </div>
          <div className="shrink-0 border-t bg-background px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:border-0 sm:px-0 sm:py-2">
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending || Boolean(meetingLinkError)} className={hasConflicts ? "bg-orange-500 hover:bg-orange-600" : ""}>
              {isPending ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save Changes" : (hasConflicts ? "Save Anyway" : "Create Appointment"))}
            </Button>
          </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────
type BulkActionKind = "cancel" | "delete";
type BulkReasonMode = "general" | "individual";

function appointmentBulkDisplayName(appointment: any | undefined) {
  if (!appointment) return "Appointment";
  return appointment.relatedEntityDisplayName
    || `${appointment.patientFirstName ?? ""} ${appointment.patientLastName ?? ""}`.trim()
    || appointment.leadName
    || `Appointment #${appointment.id}`;
}

function formatBulkAppointmentSummary(summary: Record<string, number>) {
  const labels: Record<string, string> = {
    cancelled: "cancelled",
    deleted: "deleted",
    skipped_already_cancelled: "already cancelled skipped",
    skipped_completed: "completed skipped",
    skipped_no_show: "no-show skipped",
    skipped_rescheduled: "rescheduled skipped",
    failed: "failed",
  };
  return Object.entries(summary).map(([outcome, value]) => `${value} ${labels[outcome] ?? outcome.replaceAll("_", " ")}`).join(" · ");
}

function BulkActionBar({ count, ids, appointments, isAdmin, onHeightChange, onClearSelection, onExitSelectMode, onCompleteBulkSuccess }: {
  count: number; ids: number[]; appointments: any[]; isAdmin: boolean; onHeightChange: (height: number) => void; onClearSelection: () => void; onExitSelectMode: () => void; onCompleteBulkSuccess: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedAppts = appointments.filter((a: any) => ids.includes(a.id));
  const [actionKind, setActionKind] = useState<BulkActionKind | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const { form, setForm, clearDraft } = useDraftForm({
    key: `calendar_bulk_action_${actionKind ?? "idle"}_${[...ids].sort((a, b) => a - b).join("_")}`,
    initialData: { mode: "general" as BulkReasonMode, generalReason: "", individualReasons: {} as Record<string, string> },
    disabled: !actionKind,
  });
  const hasDraftChanges = Boolean(actionKind && (form.generalReason.trim() || Object.values(form.individualReasons).some(value => value.trim())));
  useBeforeUnload(hasDraftChanges);

  const batchUpdate = trpc.appointments.batchUpdate.useMutation({
    onSuccess: (res) => { toast.success(`Updated ${(res as any).count} appointments`); onCompleteBulkSuccess(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });
  const bulkCancel = trpc.appointments.bulkCancel.useMutation();
  const bulkDelete = trpc.appointments.bulkDelete.useMutation();
  const isSubmitting = batchUpdate.isPending || bulkCancel.isPending || bulkDelete.isPending;

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const measure = () => onHeightChange(Math.ceil(panel.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [onHeightChange]);

  useEffect(() => () => onHeightChange(0), [onHeightChange]);

  const confirmableIds = selectedAppts.filter((a: any) => a.status === "upcoming").map((a: any) => a.id);
  const reactivatableIds = selectedAppts.filter((a: any) => a.status === "cancelled").map((a: any) => a.id);
  const cancelableIds = selectedAppts.filter((a: any) => ["upcoming", "confirmed"].includes(a.status)).map((a: any) => a.id);
  const skippedCounts = selectedAppts.reduce((acc: Record<string, number>, appointment: any) => {
    if (appointment.status === "cancelled") acc.alreadyCancelled = (acc.alreadyCancelled ?? 0) + 1;
    if (appointment.status === "completed") acc.completed = (acc.completed ?? 0) + 1;
    if (appointment.status === "no_show") acc.noShow = (acc.noShow ?? 0) + 1;
    if (appointment.status === "rescheduled") acc.rescheduled = (acc.rescheduled ?? 0) + 1;
    return acc;
  }, {});

  const closeActionDialog = () => {
    setActionKind(null);
    clearDraft();
  };
  const hasFailedResult = Boolean(result?.response?.results?.some((item: any) => item.outcome === "failed"));
  const hasPendingGoogleResult = Boolean(result?.response?.results?.some((item: any) => item.googleSync === "pending" || item.googleDeletion === "pending"));
  const hasUnresolvedResult = hasFailedResult || hasPendingGoogleResult;
  const closeResultDialog = () => setIsResultOpen(false);
  const buildActions = (subset = selectedAppts) => subset.map((appointment: any) => ({
    appointmentId: appointment.id,
    reason: form.mode === "individual" ? form.individualReasons[String(appointment.id)]?.trim() || undefined : undefined,
  }));
  const submitBulkAction = async (kind: BulkActionKind, subset = selectedAppts) => {
    try {
      const payload = {
        appointments: buildActions(subset),
        generalReason: form.mode === "general" ? form.generalReason.trim() || undefined : undefined,
      };
      const response = kind === "cancel"
        ? await bulkCancel.mutateAsync(payload)
        : await bulkDelete.mutateAsync(payload);
      clearDraft();
      setActionKind(null);
      if (isFullySuccessfulBulkResult(response)) {
        setResult(null);
        setIsResultOpen(false);
        toast.success("Bulk action completed.");
        onCompleteBulkSuccess();
      } else {
        setResult({ kind, response, request: payload });
        setIsResultOpen(true);
        toast.warning("Bulk action completed with items needing attention.");
      }
    } catch (error: any) {
      toast.error(error?.data?.zodError ? "Please check the reasons and try again." : "Bulk action could not be completed. No unreported changes were made.");
    }
  };
  const retryFailures = async () => {
    const failedIds = (result?.response?.results ?? []).filter((item: any) => item.outcome === "failed").map((item: any) => item.appointmentId);
    const retryAppointments = selectedAppts.filter((appointment: any) => failedIds.includes(appointment.id));
    if (!retryAppointments.length) return;
    await submitBulkAction(result.kind, retryAppointments);
  };

  return (
    <>
      <div ref={panelRef} className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 sm:bottom-6">
        <div className="w-[calc(100vw-2rem)] max-w-md rounded-xl bg-foreground px-2.5 py-2 text-background shadow-2xl sm:max-w-xl sm:px-3">
          <div className="grid grid-cols-[auto_1fr_auto] items-start gap-2">
            <div className="flex items-center gap-1.5 pt-1">
              <CheckSquare className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold whitespace-nowrap">{count} {count === 1 ? "appointment" : "appointments"} selected</span>
            </div>
            <Button size="sm" variant="secondary" className="h-7 justify-self-center px-2 text-[11px]"
              onClick={onClearSelection} disabled={isSubmitting}>
              Clear Selection
            </Button>
            <button onClick={onExitSelectMode} disabled={isSubmitting} className="flex h-7 w-7 items-center justify-center justify-self-end rounded-md text-background/70 transition-colors hover:bg-background/10 hover:text-background disabled:cursor-not-allowed disabled:opacity-40" aria-label="Clear selection and exit Select Mode">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <Button size="sm" variant="secondary" className="h-8 min-w-0 gap-1 overflow-hidden px-2 text-[11px] whitespace-nowrap"
              onClick={() => batchUpdate.mutate({ ids: confirmableIds, data: { status: "confirmed" } })} disabled={isSubmitting || confirmableIds.length === 0}>
              <span className="truncate">Confirm ({confirmableIds.length})</span>
            </Button>
            <Button size="sm" variant="secondary" className="h-8 min-w-0 gap-1 overflow-hidden px-2 text-[11px] whitespace-nowrap"
              onClick={() => batchUpdate.mutate({ ids: reactivatableIds, data: { status: "upcoming" } })} disabled={isSubmitting || reactivatableIds.length === 0}>
              <RefreshCw className="h-3 w-3 shrink-0" /><span className="truncate">Re-activate ({reactivatableIds.length})</span>
            </Button>
            {isAdmin && (
              <>
                <Button size="sm" variant="secondary" className="h-8 min-w-0 gap-1 overflow-hidden px-2 text-[11px] whitespace-nowrap"
                  onClick={() => cancelableIds.length ? setActionKind("cancel") : toast.info("Only Upcoming and Confirmed appointments can be bulk cancelled.")}
                  disabled={isSubmitting}>
                  <span className="truncate">Cancel ({cancelableIds.length})</span>
                </Button>
                <Button size="sm" variant="destructive" className="h-8 min-w-0 gap-1 overflow-hidden px-2 text-[11px] whitespace-nowrap"
                  onClick={() => setActionKind("delete")} disabled={isSubmitting}>
                  <Trash2 className="h-3 w-3 shrink-0" /><span className="truncate">Delete ({count})</span>
                </Button>
              </>
            )}
            {hasUnresolvedResult && (
              <Button size="sm" variant="secondary" className="col-span-2 h-7 text-[11px]" onClick={() => setIsResultOpen(true)} disabled={isSubmitting}>
                {hasFailedResult ? "Retry failed" : "Review result"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={Boolean(actionKind)} onOpenChange={(open) => { if (!open) closeActionDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{actionKind === "cancel" ? "Cancel Selected Appointments" : "Delete Selected Appointments"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {actionKind === "cancel"
                ? "Only Upcoming and Confirmed appointments will be cancelled. Existing Cancelled, Completed, No-show, and Rescheduled appointments are skipped. No participant email will be sent."
                : "This permanently deletes every selected appointment regardless of status. It does not create a cancellation lifecycle event or send participant email."}
            </p>
            {actionKind === "cancel" && Object.keys(skippedCounts).length > 0 && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Will skip: {skippedCounts.alreadyCancelled ? `${skippedCounts.alreadyCancelled} already cancelled` : ""}{skippedCounts.completed ? `${skippedCounts.alreadyCancelled ? " · " : ""}${skippedCounts.completed} completed` : ""}{skippedCounts.noShow ? `${(skippedCounts.alreadyCancelled || skippedCounts.completed) ? " · " : ""}${skippedCounts.noShow} no-show` : ""}{skippedCounts.rescheduled ? `${(skippedCounts.alreadyCancelled || skippedCounts.completed || skippedCounts.noShow) ? " · " : ""}${skippedCounts.rescheduled} rescheduled` : ""}
              </p>
            )}
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={form.mode === "general"} onChange={() => setForm(prev => ({ ...prev, mode: "general" }))} /> General reason</label>
              <label className="flex items-center gap-2"><input type="radio" checked={form.mode === "individual"} onChange={() => setForm(prev => ({ ...prev, mode: "individual" }))} /> Set individual reasons</label>
            </div>
            {form.mode === "general" ? (
              <div className="space-y-2">
                <Label htmlFor="bulk-general-reason">{actionKind === "cancel" ? "Cancellation reason" : "Delete reason"} <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea id="bulk-general-reason" value={form.generalReason} maxLength={500} onChange={event => setForm(prev => ({ ...prev, generalReason: event.target.value }))} placeholder="e.g. Duplicate, created by mistake, test appointment" rows={3} />
              </div>
            ) : (
              <div className="space-y-3">
                {selectedAppts.map((appointment: any) => (
                  <div key={appointment.id} className="rounded-md border p-3 space-y-2">
                    <p className="text-sm font-medium">{appointmentBulkDisplayName(appointment)}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(appointment.appointmentDate), "dd MMM yyyy, HH:mm")} · {appointment.status.replace("_", " ")}</p>
                    <Input value={form.individualReasons[String(appointment.id)] ?? ""} maxLength={500} onChange={event => setForm(prev => ({ ...prev, individualReasons: { ...prev.individualReasons, [String(appointment.id)]: event.target.value } }))} placeholder={actionKind === "cancel" ? "Cancellation reason (optional)" : "Delete reason (optional)"} />
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeActionDialog} disabled={isSubmitting}>Cancel</Button>
              <Button variant={actionKind === "delete" ? "destructive" : "default"} onClick={() => actionKind && submitBulkAction(actionKind)} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : actionKind === "cancel" ? "Confirm Cancel" : "Permanently Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isResultOpen} onOpenChange={setIsResultOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Bulk action result</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p>{formatBulkAppointmentSummary(result?.response?.summary ?? {})}</p>
            {(result?.response?.results ?? []).filter((item: any) => item.outcome === "failed" || item.googleSync === "pending" || item.googleDeletion === "pending").map((item: any) => {
              const appointment = selectedAppts.find((candidate: any) => candidate.id === item.appointmentId);
              return <div key={item.appointmentId} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{appointmentBulkDisplayName(appointment)} — {item.message ?? (item.googleSync === "pending" || item.googleDeletion === "pending" ? "Saved; Google Calendar cleanup is pending retry." : "Requires attention.")}</div>;
            })}
            <div className="flex justify-end gap-2">
              {hasFailedResult && <Button variant="outline" onClick={retryFailures}>Retry failed</Button>}
              <Button onClick={closeResultDialog}>Done</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────
function ListView({ appointments, statusColor, onApptClick, selectMode, selectedIds, onToggleSelect }: any) {
  if (appointments.length === 0) {
    return (
      <div className="text-center py-16">
        <Calendar className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No appointments found</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {appointments.map((a: any) => {
        const isSelected = selectedIds.has(a.id);
        return (
          <div key={a.id}
            onClick={() => selectMode ? onToggleSelect(a.id) : onApptClick(a)}
            className={`flex items-start gap-3 p-4 rounded-xl border bg-card hover:bg-accent/20 transition-colors cursor-pointer ${isSelected ? "ring-2 ring-primary bg-primary/5" : ""}`}>
            {selectMode && (
              <button onClick={e => { e.stopPropagation(); onToggleSelect(a.id); }}
                className="mt-0.5 text-muted-foreground hover:text-primary transition-colors shrink-0" aria-label={isSelected ? "Deselect appointment" : "Select appointment"}>
                {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
              </button>
            )}
            <div className={`w-1.5 min-h-[60px] rounded-full shrink-0 ${statusColor[a.status] ?? "bg-gray-400"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">
                    {a.relatedEntityDisplayName}
                  </p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />{format(new Date(a.appointmentDate), "MMM d, yyyy h:mm a")}
                      {a.duration ? ` · ${a.duration} min` : ""}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />{a.relatedEntityType === "lead" ? "Lead" : a.relatedEntityType === "patient" ? "Patient" : "Unassigned"}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">{a.shortAppointmentLabel}</span>
                    {a.appointmentType === "online" && (
                      <span className="flex items-center gap-1 text-xs text-violet-600">
                        <Video className="h-3 w-3" /> Online
                      </span>
                    )}
                    {a.purpose && (
                      <span className="text-xs text-muted-foreground capitalize">{a.purpose.replace(/-/g, " ")}</span>
                    )}
                  </div>
                </div>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full text-white shrink-0 ${statusColor[a.status] ?? "bg-gray-400"}`}>
                  {a.status.replace(/_/g, " ")}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────
function MonthView({ currentDate, appointments, onDayClick, onApptClick, statusColor, selectMode, selectedIds, onToggleSelect, desktopAvailableHeight }: any) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(currentDate)), end: endOfWeek(endOfMonth(currentDate)) });
  const weekCount = days.length / 7;
  const hasDesktopFit = typeof desktopAvailableHeight === "number";
  return (
    <Card className={hasDesktopFit ? "md:flex md:flex-col" : undefined} style={hasDesktopFit ? { height: desktopAvailableHeight } : undefined}>
      <CardContent className={hasDesktopFit ? "p-0 md:flex md:min-h-0 md:flex-1 md:flex-col" : "p-0"}>
        <div className="grid grid-cols-7 border-b">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
            <div key={d} className="py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">{d}</div>
          ))}
        </div>
        <div
          className={hasDesktopFit ? "grid grid-cols-7 md:min-h-0 md:flex-1" : "grid grid-cols-7"}
          style={hasDesktopFit ? { gridTemplateRows: `repeat(${weekCount}, minmax(0, 1fr))` } : undefined}
        >
          {days.map((day, i) => {
            const dayAppts = appointments.filter((a: any) => isSameDay(new Date(a.appointmentDate), day));
            const isToday = isSameDay(day, new Date());
            const isCurrentMonth = isSameMonth(day, currentDate);
            return (
              <div key={i} onClick={() => !selectMode && onDayClick(day)}
                className={`min-h-[100px] p-2 border-b border-r transition-colors md:min-h-0 md:p-1.5 ${!selectMode ? "cursor-pointer hover:bg-accent/30" : ""} ${!isCurrentMonth ? "bg-muted/30" : ""} ${i % 7 === 6 ? "border-r-0" : ""}`}>
                <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium mb-1 md:h-6 md:w-6 md:mb-0.5 md:text-xs ${isToday ? "bg-primary text-primary-foreground" : isCurrentMonth ? "text-foreground" : "text-muted-foreground"}`}>
                  {format(day, "d")}
                </div>
                <div className="space-y-0.5">
                  {dayAppts.slice(0, 3).map((a: any) => {
                    const isSel = selectedIds?.has(a.id);
                    return (
                      <div key={a.id}
                        onClick={e => { e.stopPropagation(); selectMode ? onToggleSelect(a.id) : onApptClick(a); }}
                        className={`text-[10px] font-medium text-white px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 md:py-0 md:leading-3 ${statusColor[a.status] ?? "bg-gray-400"} ${isSel ? "ring-2 ring-white/80" : ""} ${a.appointmentType === "external" ? "opacity-70 border border-amber-300" : ""}`}>
                        {selectMode && (isSel ? "✓ " : "○ ")}{format(new Date(a.appointmentDate), "h:mm")} {a.relatedEntityDisplayName} — {a.shortAppointmentLabel}
                        {a.appointmentType === "online" && " 🎥"}
                        {a.appointmentType === "external" && " 🏥"}
                      </div>
                    );
                  })}
                  {dayAppts.length > 3 && (
                    <div className="text-[10px] text-muted-foreground px-1 md:leading-3">+{dayAppts.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────
function WeekView({ currentDate, appointments, onDayClick, onApptClick, statusColor, selectMode, selectedIds, onToggleSelect }: any) {
  const days = eachDayOfInterval({ start: startOfWeek(currentDate), end: endOfWeek(currentDate) });
  return (
    <Card>
      <CardContent className="p-0">
        <div className="grid grid-cols-7 border-b">
          {days.map((day, i) => {
            const isToday = isSameDay(day, new Date());
            return (
              <div key={i} className={`p-3 text-center border-r last:border-r-0 ${isToday ? "bg-primary/5" : ""}`}>
                <p className="text-xs text-muted-foreground uppercase">{format(day, "EEE")}</p>
                <div className={`w-8 h-8 mx-auto mt-1 flex items-center justify-center rounded-full text-sm font-semibold ${isToday ? "bg-primary text-primary-foreground" : ""}`}>
                  {format(day, "d")}
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-7 min-h-[400px]">
          {days.map((day, i) => {
            const dayAppts = appointments.filter((a: any) => isSameDay(new Date(a.appointmentDate), day));
            const isToday = isSameDay(day, new Date());
            return (
              <div key={i} onClick={() => !selectMode && onDayClick(day)}
                className={`p-2 border-r last:border-r-0 transition-colors ${!selectMode ? "cursor-pointer hover:bg-accent/20" : ""} ${isToday ? "bg-primary/5" : ""}`}>
                <div className="space-y-1">
                  {dayAppts.map((a: any) => {
                    const isSel = selectedIds?.has(a.id);
                    return (
                      <div key={a.id} onClick={e => { e.stopPropagation(); selectMode ? onToggleSelect(a.id) : onApptClick(a); }}
                        className={`text-[11px] font-medium text-white px-2 py-1 rounded-md cursor-pointer hover:opacity-80 ${statusColor[a.status] ?? "bg-gray-400"} ${isSel ? "ring-2 ring-white/80" : ""}`}>
                        <p className="truncate">{selectMode && (isSel ? "✓ " : "○ ")}{format(new Date(a.appointmentDate), "h:mm a")}</p>
                        <p className="truncate opacity-90">{a.relatedEntityDisplayName} — {a.shortAppointmentLabel}</p>
                      </div>
                    );
                  })}
                  {dayAppts.length === 0 && (
                    <div className="flex items-center justify-center h-16 text-xs text-muted-foreground/40">—</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Day View ─────────────────────────────────────────────────────────────────
function DayView({ currentDate, appointments, onApptClick, statusColor, selectMode, selectedIds, onToggleSelect }: any) {
  // Normalize to midnight for reliable same-day comparison
  const normalizedDate = useMemo(() => {
    const d = new Date(currentDate); d.setHours(0, 0, 0, 0); return d;
  }, [currentDate]);
  const dayAppts = useMemo(() =>
    appointments.filter((a: any) => isSameDay(new Date(a.appointmentDate), normalizedDate)),
    [appointments, normalizedDate]
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{format(normalizedDate, "EEEE, MMMM d, yyyy")}</CardTitle>
      </CardHeader>
      <CardContent>
        {dayAppts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No appointments scheduled for this day</div>
        ) : (
          <div className="space-y-3">
            {dayAppts.map((a: any) => {
              const isSel = selectedIds?.has(a.id);
              return (
                <div key={a.id}
                  onClick={() => selectMode ? onToggleSelect(a.id) : onApptClick(a)}
                  className={`flex items-start gap-4 p-4 rounded-xl border bg-card hover:bg-accent/20 transition-colors cursor-pointer ${isSel ? "ring-2 ring-primary bg-primary/5" : ""}`}>
                  {selectMode && (
                    <div className="mt-1 shrink-0">
                      {isSel ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  )}
                  <div className={`w-1.5 h-full min-h-[60px] rounded-full ${statusColor[a.status] ?? "bg-gray-400"}`} />
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm">
                          {a.relatedEntityDisplayName}
                        </p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />{format(new Date(a.appointmentDate), "h:mm a")}
                            {a.duration ? ` · ${a.duration} min` : ""}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />{a.relatedEntityType === "lead" ? "Lead" : a.relatedEntityType === "patient" ? "Patient" : "Unassigned"}
                          </span>
                          {a.shortAppointmentLabel && (
                            <span className="text-xs text-muted-foreground capitalize">{a.shortAppointmentLabel}</span>
                          )}
                          {a.appointmentType === "online" && (
                            <span className="flex items-center gap-1 text-xs text-violet-600">
                              <Video className="h-3 w-3" /> Online
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full text-white ${statusColor[a.status] ?? "bg-gray-400"}`}>
                        {a.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    {a.notes && <p className="text-xs text-muted-foreground mt-2">{a.notes}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
