import { useEffect, useState, useMemo } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle, CalendarDays, CalendarOff, CheckCircle2, ChevronLeft, ChevronRight, Clock, Plus, RefreshCw, Trash2, UserCheck, Users,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const REASON_LABELS: Record<string, string> = {
  vacation: "Vacation",
  sick_leave: "Sick Leave",
  training: "Training",
  personal: "Personal",
  other: "Other",
};

const REASON_COLORS: Record<string, string> = {
  vacation: "bg-blue-100 text-blue-700",
  sick_leave: "bg-red-100 text-red-700",
  training: "bg-purple-100 text-purple-700",
  personal: "bg-amber-100 text-amber-700",
  other: "bg-gray-100 text-gray-700",
};

export default function AvailabilityPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [conflictEntry, setConflictEntry] = useState<any>(null);

  const { data: staffUsers } = trpc.users.listStaff.useQuery();
  const { data: availabilityList, refetch } = trpc.availability.list.useQuery(
    selectedUserId ? { userId: selectedUserId } : {},
  );

  const deleteMutation = trpc.availability.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        refetch(),
        utils.appointments.availabilityOverrideState.invalidate(),
        utils.appointments.list.invalidate(),
      ]);
      toast.success("Time-off period removed");
      setDeleteId(null);
    },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  // Group by user for admin view
  const grouped = useMemo(() => {
    if (!availabilityList) return {};
    return availabilityList.reduce((acc: Record<number, any[]>, entry: any) => {
      const uid = entry.userId;
      if (!acc[uid]) acc[uid] = [];
      acc[uid].push(entry);
      return acc;
    }, {});
  }, [availabilityList]);

  const staffMap = useMemo(() => {
    const m: Record<number, string> = {};
    (staffUsers ?? []).forEach((u: any) => { m[u.id] = u.name; });
    return m;
  }, [staffUsers]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Availability</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage time-off periods. Appointments cannot be booked during unavailable periods.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4" /> Add Time-Off
        </Button>
      </div>

      {/* Filter by staff member (admin only) */}
      {isAdmin && (
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-3 flex-1">
              <Label className="shrink-0 text-sm">Filter by staff:</Label>
              <Select
                value={selectedUserId ? String(selectedUserId) : "all"}
                onValueChange={v => setSelectedUserId(v === "all" ? null : parseInt(v))}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="All staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All staff</SelectItem>
                  {(staffUsers ?? []).map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Availability list */}
      {!availabilityList || availabilityList.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CalendarOff className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No time-off periods recorded.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([uid, entries]: [string, any]) => (
            <Card key={uid}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                  {staffMap[parseInt(uid)] ?? `User #${uid}`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {entries.map((entry: any) => (
                    <div key={entry.id} className="flex items-start justify-between rounded-lg border p-3">
                      <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{entry.title}</span>
                        <Badge className={`text-xs ${REASON_COLORS[entry.reason] ?? "bg-gray-100 text-gray-700"}`}>
                          {REASON_LABELS[entry.reason] ?? entry.reason}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(entry.startDate), "MMM d, yyyy")}
                        {" -> "}
                        {format(new Date(entry.endDate), "MMM d, yyyy")}
                      </div>
                      {entry.notes && (
                        <p className="text-xs text-muted-foreground italic">{entry.notes}</p>
                      )}
                      {(() => {
                        const summary = entry.reviewSummary;
                        if (summary === null || summary === undefined) return <span className="block pt-2 text-xs text-muted-foreground">Checking review status…</span>;
                        if (summary.totalCount === 0) return null;
                        if (summary.unresolvedCount > 0) return (
                          <div className="flex flex-wrap items-center gap-2 pt-2">
                            <span className="text-xs font-medium text-amber-700">{summary.unresolvedCount} appointment{summary.unresolvedCount === 1 ? "" : "s"} need review · {summary.reviewedCount} of {summary.totalCount} reviewed</span>
                            <Button size="sm" variant="outline" className="h-7 border-amber-300 text-xs text-amber-800" onClick={() => setConflictEntry({ timeOffId: entry.id })}>Resume Review</Button>
                          </div>
                        );
                        return (
                          <div className="flex flex-wrap items-center gap-2 pt-2">
                            <span className="text-xs font-medium text-emerald-700">All affected appointments reviewed ✓</span>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConflictEntry({ timeOffId: entry.id })}>View Review</Button>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <Button
                        variant="ghost" size="sm"
                        className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                        onClick={() => setDeleteId(entry.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Time-Off Dialog */}
      {showAddDialog && (
        <AddTimeOffDialog
          staffUsers={staffUsers ?? []}
          currentUserId={user?.id}
          isAdmin={isAdmin}
          onClose={() => setShowAddDialog(false)}
          onSuccess={(result) => {
            refetch();
            setShowAddDialog(false);
            if (result.timeOffId) {
              setConflictEntry({ timeOffId: result.timeOffId });
            }
          }}
        />
      )}

      {/* Conflict Resolution Dialog */}
      {conflictEntry && (
        <CompactReschedulingReviewDialog
          timeOffId={conflictEntry.timeOffId}
          isAdmin={user?.role === "admin"}
          onClose={() => setConflictEntry(null)}
          onApplied={() => {
            void refetch();
          }}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Time-Off Period?</AlertDialogTitle>
            <AlertDialogDescription>
              This will allow appointments to be booked during this period again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Add Time-Off Dialog
function AddTimeOffDialog({
  staffUsers, currentUserId, isAdmin, onClose, onSuccess,
}: {
  staffUsers: any[]; currentUserId?: number; isAdmin: boolean;
  onClose: () => void; onSuccess: (result: { timeOffId?: number }) => void;
}) {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [form, setForm] = useState({
    userId: "",
    title: "",
    startDate: todayStr,
    endDate: todayStr,
    reason: "vacation" as const,
    notes: "",
  });

  const createMutation = trpc.availability.create.useMutation({
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });
  const getConflicts = trpc.availability.getConflicts.useQuery(
    {
      userId: parseInt(form.userId || "0"),
      startDateKey: form.startDate,
      endDateKey: form.endDate,
    },
    { enabled: !!form.userId && !!form.startDate && !!form.endDate }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.userId) return toast.error("Please select a staff member");
    if (form.endDate < form.startDate) return toast.error("End date must be after start date");
    const created = await createMutation.mutateAsync({
      userId: parseInt(form.userId),
      title: form.title.trim() || `${REASON_LABELS[form.reason]} — ${form.startDate}`,
      startDateKey: form.startDate,
      endDateKey: form.endDate,
      reason: form.reason,
      notes: form.notes || undefined,
    });
    onSuccess({ timeOffId: created.timeOffId });
    toast.success("Time-off period added");
  };

  const conflicts = getConflicts.data ?? [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-md overflow-x-clip overflow-y-auto overscroll-contain touch-pan-y sm:max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Add Time-Off Period</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="min-w-0 space-y-4 overflow-x-clip">
          <div className="space-y-1.5">
            <Label>Staff Member *</Label>
            <Select value={form.userId} onValueChange={v => setForm(f => ({ ...f, userId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select staff member…" /></SelectTrigger>
              <SelectContent>
                {staffUsers.filter((u: any) => isAdmin || u.id === currentUserId).map((u: any) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.role})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Title (optional)</Label>
            <Input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Annual Leave"
            />
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label>Start Date *</Label>
              <Input
                type="date" min={todayStr} value={form.startDate} className="availability-native-date w-full max-w-full min-w-0"
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label>End Date *</Label>
              <Input
                type="date" min={form.startDate} value={form.endDate} className="availability-native-date w-full max-w-full min-w-0"
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Select value={form.reason} onValueChange={v => setForm(f => ({ ...f, reason: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(REASON_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Additional details..."
              rows={2}
            />
          </div>

          {/* Conflict warning */}
          {conflicts.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
              <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
                <AlertTriangle className="h-4 w-4" />
                {conflicts.length} appointment{conflicts.length > 1 ? "s" : ""} conflict with this period
              </div>
              <p className="text-xs text-amber-700">
                You can proceed — a conflict resolution screen will appear after saving.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Save Time-Off"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatIstanbulSlot(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function getIstanbulDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDateKeyDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days, 12));
  return value.toISOString().slice(0, 10);
}

function formatPickerDate(dateKey: string) {
  return format(new Date(`${dateKey}T12:00:00Z`), "EEE, d MMM yyyy");
}

function createReschedulingCorrelationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function CompactReschedulingReviewDialog({
  timeOffId,
  isAdmin,
  onClose,
  onApplied,
}: {
  timeOffId: number;
  isAdmin: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const utils = trpc.useUtils();
  const [expandedAppointmentId, setExpandedAppointmentId] = useState<number | null>(null);
  const [exceptionReasons, setExceptionReasons] = useState<Record<number, string>>({});
  const [pickerItem, setPickerItem] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const { data: review, isLoading, isFetching, refetch } = trpc.appointments.reschedulingReview.useQuery({ timeOffId });
  const diagnostic = trpc.appointments.recordReschedulingDiagnostic.useMutation();

  const items = review?.items ?? [];
  const unresolvedItems = items.filter((item) => item.requiresAction);
  const resolvedItems = items.filter((item) => !item.requiresAction);
  const rescheduledCount = resolvedItems.filter((item) => item.resolution === "rescheduled").length;
  const exceptionCount = resolvedItems.filter((item) => item.resolution === "exception").length;

  const requestClose = () => {
    if (unresolvedItems.length > 0) {
      setShowLeaveWarning(true);
      return;
    }
    onClose();
  };

  const keepToastInteractionInsideReview = (event: any) => {
    const target = event?.detail?.originalEvent?.target as HTMLElement | null;
    if (target?.closest?.("[data-sonner-toaster]")) event.preventDefault();
  };

  useEffect(() => {
    if (isLoading || !items.length) return;
    const current = items.find((item) => item.appointmentId === expandedAppointmentId);
    if (!current || !current.requiresAction) {
      setExpandedAppointmentId(unresolvedItems[0]?.appointmentId ?? items[0]?.appointmentId ?? null);
    }
  }, [isLoading, items, unresolvedItems, expandedAppointmentId]);

  const refreshSuggestions = async (showScheduleChanged = false) => {
    setRefreshing(true);
    try {
      const result = await refetch();
      const nextUnresolved = result.data?.items.find((item) => item.requiresAction);
      if (nextUnresolved) setExpandedAppointmentId(nextUnresolved.appointmentId);
      if (showScheduleChanged) toast.success("Remaining suggestions have been refreshed.");
    } catch {
      toast.error("Suggestions could not be refreshed. Please try again.");
    } finally {
      setRefreshing(false);
    }
  };

  const recordDiagnostic = (operation: "accept_candidate" | "keep_exception" | "picker_select", item: any, candidate: Date | undefined, error: unknown, correlationId?: string, applySource?: "inline_candidate" | "more_availability") => {
    const value = candidate instanceof Date && !Number.isNaN(candidate.getTime()) ? candidate.toISOString() : undefined;
    const trpcCode = (error as any)?.data?.code;
    void diagnostic.mutate({
      operation,
      timeOffId,
      appointmentId: item.appointmentId,
      appointmentCode: item.appointmentCode ?? undefined,
      candidateValue: value,
      candidateValueType: candidate === undefined ? "missing" : candidate instanceof Date ? "Date" : typeof candidate,
      dateValidity: candidate === undefined ? "missing" : value ? "valid" : "invalid",
      errorCategory: trpcCode ? "server_response" : error instanceof TypeError ? "client_exception" : "unknown",
      correlationId,
      applySource,
    });
  };

  const acceptCandidate = trpc.appointments.acceptReschedulingCandidate.useMutation({
    onSuccess: async (_result, variables) => {
      if (variables.applySource === "more_availability") setPickerItem(null);
      onApplied();
      await refreshSuggestions(true);
      toast.success("Appointment rescheduled and the mapped Google event was updated.");
    },
    onError: async (error, variables) => {
      const item = items.find((entry) => entry.appointmentId === variables.appointmentId);
      if (item) recordDiagnostic("accept_candidate", item, variables.candidateStart, error, variables.correlationId, variables.applySource);
      if ((error as any)?.data?.code === "PRECONDITION_FAILED") {
        await refreshSuggestions(false);
        toast.error("Availability changed. Suggestions were refreshed; select a current slot.");
        return;
      }
      toast.error("The appointment was not changed due to a temporary system error. Please try again.");
    },
  });
  const keepException = trpc.appointments.keepReschedulingException.useMutation({
    onSuccess: async (_result, variables) => {
      setExceptionReasons((current) => ({ ...current, [variables.appointmentId]: "" }));
      onApplied();
      await refreshSuggestions(false);
      toast.success("Appointment kept as a documented Time-Off exception.");
    },
    onError: async (error, variables) => {
      const item = items.find((entry) => entry.appointmentId === variables.appointmentId);
      if (item) recordDiagnostic("keep_exception", item, undefined, error);
      await refreshSuggestions(false);
      toast.error("The exception could not be saved. Suggestions were refreshed; please try again.");
    },
  });

  const applyCandidate = (item: any, candidateStart: Date, operation: "accept_candidate" | "picker_select", outsideClinicHoursOverride = false, exceptionReason?: string) => {
    const applySource = operation === "picker_select" ? "more_availability" : "inline_candidate";
    if (!(candidateStart instanceof Date) || Number.isNaN(candidateStart.getTime())) {
      recordDiagnostic(operation, item, candidateStart, new TypeError("Invalid candidate date"), createReschedulingCorrelationId(), applySource);
      toast.error("The selected time could not be read. Suggestions were refreshed; please try again.");
      void refreshSuggestions(false);
      return;
    }
    const correlationId = createReschedulingCorrelationId();
    acceptCandidate.mutate({
      timeOffId,
      appointmentId: item.appointmentId,
      candidateStart,
      expectedUpdatedAt: item.updatedAt,
      correlationId,
      applySource,
      outsideClinicHoursOverride,
      exceptionReason: exceptionReason?.trim() || undefined,
    });
  };

  const renderQueueRow = (item: any) => {
    const expanded = item.appointmentId === expandedAppointmentId;
    const stateLabel = item.requiresAction ? "Needs Rescheduling" : item.resolution === "rescheduled" ? "Rescheduled" : "Kept as Exception";
    const stateClass = item.requiresAction ? "bg-amber-600" : item.resolution === "rescheduled" ? "bg-sky-600" : "bg-emerald-600";
    return (
      <div key={item.appointmentId} className="rounded-lg border bg-card">
        <button
          type="button"
          className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-3 text-left"
          onClick={() => setExpandedAppointmentId(item.appointmentId)}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{item.appointmentCode ?? `Appointment ${item.appointmentId}`} · {item.patientName ?? item.title}</p>
            <p className="text-xs text-muted-foreground">{item.resolution === "rescheduled" ? "Original appointment: " : "Appointment: "}{formatIstanbulSlot(item.currentStart)} · {item.durationMinutes} min</p>
          </div>
          <Badge className={stateClass}>{stateLabel}{item.resolution === "rescheduled" ? " ✓" : ""}</Badge>
        </button>

        {expanded && (
          <div className="space-y-3 border-t px-3 py-3">
            <p className="text-sm font-medium">{item.title}</p>
            {(item.doctorName || item.hostUserName) && <p className="text-xs text-muted-foreground">{item.doctorName ? `Doctor: ${item.doctorName}` : `Host: ${item.hostUserName}`}</p>}
            {!item.requiresAction ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {item.resolution === "rescheduled"
                  ? <>Original appointment: {formatIstanbulSlot(item.currentStart)}<br />Rescheduled to: {item.resolvedStart ? formatIstanbulSlot(item.resolvedStart) : "the selected time"}.</>
                  : <>Kept as an internal exception{item.exceptionReason ? `: ${item.exceptionReason}` : "."}</>}
              </div>
            ) : item.unresolvedReason ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{item.unresolvedReason}</div>
            ) : (
              <>
                <div className="space-y-2">
                  {item.candidates.map((candidate: any) => (
                    <div key={candidate.start.toISOString()} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
                      <div className="text-sm">
                        <Badge className={candidate.label === "suggested" ? "mr-2 bg-teal-600" : "mr-2"} variant={candidate.label === "suggested" ? "default" : "secondary"}>{candidate.label === "suggested" ? "Suggested" : "Alternative"}</Badge>
                        <span className="mr-2 text-xs text-muted-foreground">{candidate.relativeToTimeOff === "before" ? "Before Time-Off" : "After Time-Off"}</span>
                        {formatIstanbulSlot(candidate.start)} – {new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hour12: false }).format(candidate.end)}
                      </div>
                      {isAdmin && <Button size="sm" disabled={acceptCandidate.isPending || refreshing} onClick={() => applyCandidate(item, candidate.start, "accept_candidate")}>Reschedule</Button>}
                    </div>
                  ))}
                </div>
                {isAdmin && <Button type="button" size="sm" variant="outline" className="gap-2" disabled={acceptCandidate.isPending || refreshing} onClick={() => setPickerItem(item)}><CalendarDays className="h-4 w-4" />View More Availability</Button>}
              </>
            )}

            {item.requiresAction && (
              <div className="space-y-2 border-t pt-3">
                <Label htmlFor={`compact-exception-reason-${item.appointmentId}`} className="text-sm">Keep as Exception reason</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Textarea id={`compact-exception-reason-${item.appointmentId}`} value={exceptionReasons[item.appointmentId] ?? ""} onChange={(event) => setExceptionReasons((current) => ({ ...current, [item.appointmentId]: event.target.value }))} placeholder="Required internal reason (3–500 characters)" className="min-h-20 sm:min-h-10" maxLength={500} disabled={!isAdmin || keepException.isPending || refreshing} />
                  {isAdmin && <Button type="button" variant="outline" className="shrink-0" disabled={keepException.isPending || refreshing || (exceptionReasons[item.appointmentId]?.trim().length ?? 0) < 3} onClick={() => keepException.mutate({ timeOffId, appointmentId: item.appointmentId, expectedUpdatedAt: item.updatedAt, reason: exceptionReasons[item.appointmentId]!.trim() })}>{keepException.isPending ? "Saving…" : "Keep as Exception"}</Button>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) requestClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-3xl overflow-x-hidden overflow-y-auto overscroll-contain touch-pan-y sm:max-h-[90vh]" onInteractOutside={keepToastInteractionInsideReview} onEscapeKeyDown={(event) => { event.preventDefault(); requestClose(); }}>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarOff className="h-5 w-5 text-amber-600" />Review affected appointments</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          {isLoading ? <span className="h-5 w-72 max-w-full animate-pulse rounded bg-muted" aria-label="Review counts loading" /> : <span>{items.length} affected · {rescheduledCount} rescheduled · {unresolvedItems.length} need rescheduling · {exceptionCount} kept as exception</span>}
          <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => void refreshSuggestions(false)} disabled={isLoading || refreshing || isFetching}><RefreshCw className={`h-4 w-4 ${refreshing || isFetching ? "animate-spin" : ""}`} />Refresh Suggestions</Button>
        </div>
        {(refreshing || isFetching) && <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">Schedule changed — refreshing remaining suggestions…</div>}
        {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Checking availability…</p> : !items.length ? <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No appointments currently require review for this Time-Off record.</div> : <div className="space-y-3">{unresolvedItems.map(renderQueueRow)}{resolvedItems.length > 0 && <><Separator /><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resolved</p>{resolvedItems.map(renderQueueRow)}</>}</div>}
        <div className="flex justify-end border-t pt-3"><Button variant="outline" onClick={requestClose}>Close review</Button></div>
      </DialogContent>
      {pickerItem && review?.timeOff && <ReschedulingAvailabilityPicker timeOffId={timeOffId} item={pickerItem} initialDateKey={[getIstanbulDateKey(review.timeOff.startDate), getIstanbulDateKey(new Date())].sort().at(-1)!} isAdmin={isAdmin} isSaving={acceptCandidate.isPending} onClose={() => setPickerItem(null)} onSelect={(start, outsideClinicHoursOverride, exceptionReason) => applyCandidate(pickerItem, start, "picker_select", outsideClinicHoursOverride, exceptionReason)} />}
      <AlertDialog open={showLeaveWarning} onOpenChange={setShowLeaveWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unfinished Time-Off review</AlertDialogTitle>
            <AlertDialogDescription>{unresolvedItems.length} appointment{unresolvedItems.length === 1 ? "" : "s"} still need review. You can resume this review later from the Time-Off record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue Reviewing</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>Leave Review</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function ReschedulingAvailabilityPicker({ timeOffId, item, initialDateKey, isAdmin, isSaving, onClose, onSelect }: { timeOffId: number; item: any; initialDateKey: string; isAdmin: boolean; isSaving: boolean; onClose: () => void; onSelect: (start: Date, outsideClinicHoursOverride?: boolean, exceptionReason?: string) => void }) {
  const todayKey = getIstanbulDateKey(new Date());
  const [dateKey, setDateKey] = useState(() => initialDateKey < todayKey ? todayKey : initialDateKey);
  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [selectedOutsideClinicHoursException, setSelectedOutsideClinicHoursException] = useState(false);
  const [pendingOutsideClinicHoursStart, setPendingOutsideClinicHoursStart] = useState<Date | null>(null);
  const [outsideClinicHoursReason, setOutsideClinicHoursReason] = useState("");
  const utils = trpc.useUtils();
  const { data, isLoading, isFetching } = trpc.appointments.reschedulingAvailabilityForDate.useQuery({ timeOffId, appointmentId: item.appointmentId, dateKey });
  const isDayLoading = isLoading || isFetching;
  const changeDate = (days: number) => {
    setSelectedStart(null);
    setSelectedOutsideClinicHoursException(false);
    setDateKey((current) => {
      const next = addDateKeyDays(current, days);
      return next < todayKey ? todayKey : next;
    });
  };
  useEffect(() => {
    if (isDayLoading || !data) return;
    [addDateKeyDays(dateKey, -1), addDateKeyDays(dateKey, 1)].filter((key) => key >= todayKey).forEach((prefetchDateKey) => {
      void utils.appointments.reschedulingAvailabilityForDate.prefetch({ timeOffId, appointmentId: item.appointmentId, dateKey: prefetchDateKey }, { staleTime: 30_000 });
    });
  }, [item.appointmentId, data, dateKey, isDayLoading, timeOffId, todayKey, utils]);
  const stateClass: Record<string, string> = { blocked: "bg-amber-300", occupied: "bg-slate-400", outside_working_hours: "bg-muted", past: "bg-muted" };
  const getSlotClass = (slot: { state: string; withinDoctorRegularDefault?: boolean }) => slot.state === "valid"
    ? slot.withinDoctorRegularDefault ? "bg-emerald-500 hover:bg-emerald-600" : "bg-sky-500 hover:bg-sky-600"
    : slot.state === "outside_working_hours" && Boolean((slot as any).outsideClinicHoursExceptionEligible) ? "bg-stone-300 text-stone-900 hover:bg-stone-400" : stateClass[slot.state];
  const getSlotLabel = (slot: { state: string; withinDoctorRegularDefault?: boolean }) => slot.state === "valid"
    ? slot.withinDoctorRegularDefault ? "preferred doctor default hours" : "valid clinic time outside doctor default hours"
    : slot.state === "outside_working_hours" && Boolean((slot as any).outsideClinicHoursExceptionEligible) ? "outside clinic hours — exception available" : slot.state.replace(/_/g, " ");
  const selectSlot = (slot: any) => {
    if (slot.state === "valid") {
      setSelectedStart(slot.start);
      setSelectedOutsideClinicHoursException(false);
      return;
    }
    if (isAdmin && slot.state === "outside_working_hours" && slot.outsideClinicHoursExceptionEligible) {
      setPendingOutsideClinicHoursStart(slot.start);
      setOutsideClinicHoursReason("");
    }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl flex-col overflow-hidden overscroll-contain touch-pan-y sm:max-h-[90vh]" onPointerDownOutside={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}>
        <DialogHeader><DialogTitle>More availability · {item.appointmentCode ?? `Appointment ${item.appointmentId}`}</DialogTitle></DialogHeader>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto overscroll-contain touch-pan-y">
          <div className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">Select a valid 15-minute start. Every selectable slot fits the full {item.durationMinutes}-minute appointment and will be revalidated when applied.</p>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 sm:gap-2"><Button type="button" variant="outline" size="icon" aria-label="Previous day" disabled={dateKey <= todayKey || isSaving} onClick={() => changeDate(-1)}><ChevronLeft className="h-4 w-4" /></Button><span className="min-w-0 truncate text-center text-sm font-medium sm:text-base">{formatPickerDate(dateKey)}</span><Button type="button" variant="outline" size="icon" aria-label="Next day" disabled={isSaving} onClick={() => changeDate(1)}><ChevronRight className="h-4 w-4" /></Button></div>
            <div className="grid min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-2"><Input type="date" value={dateKey} min={todayKey} disabled={isSaving} aria-label="Jump to future date" className="availability-native-date col-span-2 w-full max-w-full min-w-0 sm:col-span-1" onChange={(event) => { const next = event.target.value; if (next) { setSelectedStart(null); setSelectedOutsideClinicHoursException(false); setDateKey(next < todayKey ? todayKey : next); } }} /><Button type="button" variant="outline" size="sm" className="w-full px-2 text-xs sm:w-auto sm:px-3" disabled={dateKey <= todayKey || isSaving} onClick={() => changeDate(-7)} aria-label="Previous week">−7d</Button><Button type="button" variant="outline" size="sm" className="w-full px-2 text-xs sm:w-auto sm:px-3" disabled={isSaving} onClick={() => changeDate(7)} aria-label="Next week">+7d</Button></div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><i className="h-3 w-3 rounded-sm bg-emerald-500" />Preferred doctor default hours</span><span className="flex items-center gap-1"><i className="h-3 w-3 rounded-sm bg-sky-500" />Valid clinic time outside default hours</span><span className="flex items-center gap-1"><i className="h-3 w-3 rounded-sm bg-stone-300" />Outside clinic hours — exception available</span><span className="flex items-center gap-1"><i className="h-3 w-3 rounded-sm bg-amber-300" />Time-Off / blocked</span><span className="flex items-center gap-1"><i className="h-3 w-3 rounded-sm bg-slate-400" />Occupied</span></div>
            <div className="grid min-h-[348px] grid-cols-6 gap-1 pb-4 sm:min-h-[236px] sm:grid-cols-12" aria-busy={isDayLoading}>{isDayLoading ? Array.from({ length: 96 }, (_, index) => <div key={index} className="h-7 animate-pulse rounded-sm bg-muted/70" />) : (data?.slots ?? []).map((slot: any) => <button key={slot.start.toISOString()} type="button" disabled={isSaving || (slot.state !== "valid" && !(isAdmin && slot.state === "outside_working_hours" && slot.outsideClinicHoursExceptionEligible))} onClick={() => selectSlot(slot)} title={`${formatIstanbulSlot(slot.start)} · ${getSlotLabel(slot)}`} aria-label={`${formatIstanbulSlot(slot.start)} ${getSlotLabel(slot)}`} className={`h-7 min-w-0 rounded-sm text-[10px] font-medium disabled:cursor-not-allowed disabled:text-transparent ${getSlotClass(slot)} ${selectedStart?.getTime() === slot.start.getTime() ? "ring-2 ring-primary ring-offset-2" : ""}`}>{new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hour12: false }).format(slot.start)}</button>)}</div>
          </div>
        </div>
        <div className="sticky bottom-0 z-10 shrink-0 space-y-3 border-t bg-background pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <p className="text-sm">{selectedStart ? <>{selectedOutsideClinicHoursException ? "Outside Clinic Hours exception selected: " : "Selected time: "}<strong>{formatIstanbulSlot(selectedStart)}</strong></> : "Select a valid time to continue."}</p>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={isSaving} onClick={onClose}>Back to review</Button><Button type="button" disabled={!selectedStart || isSaving} onClick={() => selectedStart && onSelect(selectedStart, selectedOutsideClinicHoursException, outsideClinicHoursReason)}>{isSaving ? "Saving…" : "Save Reschedule"}</Button></div>
        </div>
        <AlertDialog open={Boolean(pendingOutsideClinicHoursStart)} onOpenChange={(open) => { if (!open) setPendingOutsideClinicHoursStart(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Outside Clinic Hours</AlertDialogTitle><AlertDialogDescription>This time is outside the clinic’s normal operating hours. Continue as an exception?</AlertDialogDescription></AlertDialogHeader>
            <Textarea value={outsideClinicHoursReason} onChange={(event) => setOutsideClinicHoursReason(event.target.value)} placeholder="Optional internal note" maxLength={500} />
            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingOutsideClinicHoursStart) { setSelectedStart(pendingOutsideClinicHoursStart); setSelectedOutsideClinicHoursException(true); setPendingOutsideClinicHoursStart(null); } }}>Confirm Exception</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function ReschedulingReviewDialog({
  timeOffId,
  isAdmin,
  onClose,
  onApplied,
}: {
  timeOffId: number;
  isAdmin: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const utils = trpc.useUtils();
  const [exceptionReasons, setExceptionReasons] = useState<Record<number, string>>({});
  const { data: review, isLoading } = trpc.appointments.reschedulingReview.useQuery({ timeOffId });
  const acceptCandidate = trpc.appointments.acceptReschedulingCandidate.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.appointments.reschedulingReview.invalidate({ timeOffId }),
        utils.appointments.list.invalidate(),
      ]);
      onApplied();
      toast.success("Appointment rescheduled and the mapped Google event was updated.");
    },
    onError: (error) => {
      toast.error(error.message || "This candidate is no longer available. Refresh the review and try again.");
    },
  });
  const keepException = trpc.appointments.keepReschedulingException.useMutation({
    onSuccess: async (_result, variables) => {
      setExceptionReasons((current) => ({ ...current, [variables.appointmentId]: "" }));
      await Promise.all([
        utils.appointments.reschedulingReview.invalidate({ timeOffId }),
        utils.appointments.list.invalidate(),
      ]);
      onApplied();
      toast.success("Appointment kept as a documented Time-Off exception.");
    },
    onError: (error) => {
      toast.error(error.message || "The exception could not be saved. Refresh the review and try again.");
    },
  });

  const items = review?.items ?? [];
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarOff className="h-5 w-5 text-amber-600" />
            Review affected appointments
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Each affected appointment needs an explicit review. Suggestions are not applied automatically; an Admin may reschedule one appointment or keep it as a documented exception for this exact Time-Off record.
        </p>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Checking availability…</p>
        ) : items.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No appointments currently require rescheduling for this Time-Off record.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.appointmentId} className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.appointmentCode ?? `Appointment ${item.appointmentId}`} · {formatIstanbulSlot(item.currentStart)}
                    </p>
                    {(item.patientName || item.doctorName || item.hostUserName) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.patientName && `Patient: ${item.patientName}`}
                        {item.doctorName && `${item.patientName ? " · " : ""}Doctor: ${item.doctorName}`}
                        {item.hostUserName && `${item.patientName || item.doctorName ? " · " : ""}Host: ${item.hostUserName}`}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.requiresAction ? (
                      <Badge className="bg-amber-600">Needs Rescheduling</Badge>
                    ) : (
                      <Badge className="bg-emerald-600">Kept as Exception</Badge>
                    )}
                    <Badge variant="outline">{item.durationMinutes} min</Badge>
                  </div>
                </div>

                {!item.requiresAction ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    Kept as an internal exception for this Time-Off record{item.exceptionReason ? `: ${item.exceptionReason}` : "."}
                  </div>
                ) : item.unresolvedReason ? (
                  <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                    {item.unresolvedReason}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {item.candidates.map((candidate) => (
                      <div key={candidate.start.toISOString()} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
                        <div className="text-sm">
                          <Badge className={candidate.label === "suggested" ? "mr-2 bg-teal-600" : "mr-2"} variant={candidate.label === "suggested" ? "default" : "secondary"}>
                            {candidate.label === "suggested" ? "Suggested" : "Alternative"}
                          </Badge>
                          <span className="mr-2 text-xs text-muted-foreground">{candidate.relativeToTimeOff === "before" ? "Before Time-Off" : "After Time-Off"}</span>
                          {formatIstanbulSlot(candidate.start)} – {new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hour12: false }).format(candidate.end)}
                        </div>
                        {isAdmin ? (
                          <Button
                            size="sm"
                            disabled={acceptCandidate.isPending}
                            onClick={() => acceptCandidate.mutate({
                              timeOffId,
                              appointmentId: item.appointmentId,
                              candidateStart: candidate.start,
                              expectedUpdatedAt: item.updatedAt,
                              correlationId: createReschedulingCorrelationId(),
                              applySource: "inline_candidate",
                            })}
                          >
                            Reschedule
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Admin acceptance required</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {item.requiresAction && (
                  <div className="border-t pt-3 space-y-2">
                    <Label htmlFor={`exception-reason-${item.appointmentId}`} className="text-sm">Keep as Exception reason</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Textarea
                        id={`exception-reason-${item.appointmentId}`}
                        value={exceptionReasons[item.appointmentId] ?? ""}
                        onChange={(event) => setExceptionReasons((current) => ({ ...current, [item.appointmentId]: event.target.value }))}
                        placeholder="Required internal reason (3–500 characters)"
                        className="min-h-20 sm:min-h-10"
                        maxLength={500}
                        disabled={!isAdmin || keepException.isPending}
                      />
                      {isAdmin ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0"
                          disabled={keepException.isPending || (exceptionReasons[item.appointmentId]?.trim().length ?? 0) < 3}
                          onClick={() => keepException.mutate({
                            timeOffId,
                            appointmentId: item.appointmentId,
                            expectedUpdatedAt: item.updatedAt,
                            reason: exceptionReasons[item.appointmentId]!.trim(),
                          })}
                        >
                          {keepException.isPending ? "Saving…" : "Keep as Exception"}
                        </Button>
                      ) : (
                        <span className="self-center text-xs text-muted-foreground">Admin exception approval required</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end border-t pt-3">
          <Button variant="outline" onClick={onClose}>Close review</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Conflict Resolution Dialog
function ConflictResolutionDialog({
  conflicts, staffUsers, onClose, onResolved,
}: {
  conflicts: any[]; staffUsers: any[]; onClose: () => void; onResolved: () => void;
}) {
  const utils = trpc.useUtils();
  const [resolved, setResolved] = useState<Set<number>>(new Set());
  const [rescheduleId, setRescheduleId] = useState<number | null>(null);
  const [reassignMode, setReassignMode] = useState<{ id: number; mode: "doctor" | "host" } | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("09:00");
  const [newAssigneeId, setNewAssigneeId] = useState("");

  // Fetch doctors list for doctor reassignment (returns doctor table rows with id + name)
  const { data: doctors } = trpc.doctors.list.useQuery();

  const updateAppt = trpc.appointments.update.useMutation({
    onSuccess: (_, vars) => {
      setResolved(prev => new Set(prev).add(vars.id));
      setRescheduleId(null);
      setReassignMode(null);
      utils.appointments.list.invalidate();
      toast.success("Appointment updated");
    },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const allResolved = conflicts.every(c => resolved.has(c.id));
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const handleReassignConfirm = (apptId: number) => {
    if (!reassignMode || !newAssigneeId) return;
    if (reassignMode.mode === "doctor") {
      // newAssigneeId is a doctor table ID (doctors.id)
      updateAppt.mutate({ id: apptId, data: { doctorId: parseInt(newAssigneeId) } });
    } else {
      // newAssigneeId is a user table ID (users.id) for staff/admin hosts
      updateAppt.mutate({ id: apptId, data: { hostUserId: parseInt(newAssigneeId) } });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Resolve Appointment Conflicts
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          The following appointments fall within the unavailability period. Please reschedule, reassign, or dismiss each one.
        </p>

        <div className="space-y-3">
          {conflicts.map((appt: any) => {
            const isResolved = resolved.has(appt.id);
            const isRescheduling = rescheduleId === appt.id;
            const isReassigning = reassignMode?.id === appt.id;
            return (
              <div key={appt.id} className={`rounded-lg border p-4 space-y-3 ${isResolved ? "bg-green-50 border-green-200" : ""}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-sm">{appt.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(appt.appointmentDate), "MMM d, yyyy h:mm a")}
                      {appt.patientFirstName && ` · ${appt.patientFirstName} ${appt.patientLastName}`}
                    </p>
                    {appt.doctorName && (
                      <p className="text-xs text-muted-foreground">Doctor: {appt.doctorName}</p>
                    )}
                    {appt.hostUserName && (
                      <p className="text-xs text-muted-foreground">Host: {appt.hostUserName}</p>
                    )}
                  </div>
                  {isResolved && (
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                  )}
                </div>

                {!isResolved && (
                  <>
                    {isRescheduling ? (
                      <div className="space-y-2 bg-muted/30 rounded p-3">
                        <p className="text-xs font-medium">New date & time:</p>
                        <div className="flex gap-2">
                          <Input
                            type="date" min={todayStr} value={newDate}
                            onChange={e => setNewDate(e.target.value)}
                            className="flex-1"
                          />
                          <Input
                            type="time" value={newTime}
                            onChange={e => setNewTime(e.target.value)}
                            className="w-28"
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" size="sm" onClick={() => setRescheduleId(null)}>Cancel</Button>
                          <Button size="sm" disabled={!newDate || updateAppt.isPending}
                            onClick={() => updateAppt.mutate({
                              id: appt.id,
                              data: { appointmentDate: new Date(`${newDate}T${newTime}`) },
                            })}>
                            Confirm Reschedule
                          </Button>
                        </div>
                      </div>
                    ) : isReassigning ? (
                      <div className="space-y-2 bg-muted/30 rounded p-3">
                        <p className="text-xs font-medium">
                          {reassignMode?.mode === "doctor" ? "Assign to another doctor:" : "Assign to another staff/admin:"}
                        </p>
                        <Select value={newAssigneeId} onValueChange={setNewAssigneeId}>
                          <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
                          <SelectContent>
                            {reassignMode?.mode === "doctor"
                              ? (doctors ?? []).map((d: any) => (
                                  <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                                ))
                              : staffUsers.filter(u => u.role !== "patient").map((u: any) => (
                                  <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.role})</SelectItem>
                                ))
                            }
                          </SelectContent>
                        </Select>
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" size="sm" onClick={() => setReassignMode(null)}>Cancel</Button>
                          <Button size="sm" disabled={!newAssigneeId || updateAppt.isPending}
                            onClick={() => handleReassignConfirm(appt.id)}>
                            Confirm Reassign
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5"
                          onClick={() => { setRescheduleId(appt.id); setNewDate(""); setNewTime("09:00"); }}>
                          <Clock className="h-3.5 w-3.5" /> Reschedule
                        </Button>
                        {appt.doctorId && (
                          <Button variant="outline" size="sm" className="gap-1.5"
                            onClick={() => { setReassignMode({ id: appt.id, mode: "doctor" }); setNewAssigneeId(""); }}>
                            <Users className="h-3.5 w-3.5" /> Reassign Doctor
                          </Button>
                        )}
                        {appt.hostUserId && (
                          <Button variant="outline" size="sm" className="gap-1.5"
                            onClick={() => { setReassignMode({ id: appt.id, mode: "host" }); setNewAssigneeId(""); }}>
                            <UserCheck className="h-3.5 w-3.5" /> Reassign Host
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"
                          onClick={() => setResolved(prev => new Set(prev).add(appt.id))}>
                          Dismiss
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <Separator />
        <div className="flex justify-between items-center">
          <p className="text-xs text-muted-foreground">
            {resolved.size} of {conflicts.length} resolved
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            {allResolved && (
              <Button onClick={onResolved} className="gap-2">
                <CheckCircle2 className="h-4 w-4" /> All Resolved
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
