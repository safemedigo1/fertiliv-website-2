import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Building2, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Edit, ExternalLink, Globe, GripVertical, Image, List, Link2, Loader2, Mail, MapPin, MessageCircle, Paperclip, Phone, Plus, RefreshCw, Save, Shield, ShieldCheck, Stethoscope, Trash2, Unplug, Upload, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useDraftForm } from "@/hooks/useDraftForm";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { WeeklyScheduleEditor, type WeeklySchedule } from "@/components/WeeklyScheduleEditor";
import { ControlledTestRecipientsDialog } from "@/components/ControlledTestRecipientsDialog";
import { WHATSAPP_PRODUCTION_WEBHOOK_URL } from "@shared/whatsappManualSettings";
import { isLinkedDeviceLineDeletable } from "@shared/whatsappLinkedDeviceLifecycle";
import {
  launchMetaEmbeddedSignup,
  loadMetaEmbeddedSignupSdk,
  parseMetaEmbeddedSignupMessage,
  type MetaEmbeddedSignupSessionInfo,
} from "@/lib/whatsappEmbeddedSignup";
import { toast } from "sonner";
export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Clinic configuration and management</p>
      </div>

      <Tabs defaultValue="partner-clinics">
        <div className="-mx-4 overflow-x-auto px-4 pb-2 pt-0.5 sm:mx-0 sm:px-0">
          <TabsList className="flex h-auto min-w-max flex-nowrap gap-2 p-1.5">
            <TabsTrigger className="h-10 shrink-0 whitespace-nowrap px-4 py-2" value="partner-clinics">Partner Clinics</TabsTrigger>
            <TabsTrigger className="h-10 shrink-0 whitespace-nowrap px-4 py-2" value="specializations">Specializations</TabsTrigger>
            <TabsTrigger className="h-10 shrink-0 whitespace-nowrap px-4 py-2" value="clinic-info">Clinic Info</TabsTrigger>
            <TabsTrigger className="h-10 shrink-0 whitespace-nowrap px-4 py-2" value="whatsapp">WhatsApp</TabsTrigger>
            <TabsTrigger className="h-10 shrink-0 whitespace-nowrap px-4 py-2" value="field-options">Field Options</TabsTrigger>
            {isAdmin && <TabsTrigger className="h-10 shrink-0 whitespace-nowrap px-4 py-2" value="working-hours">Working Hours</TabsTrigger>}
            {isAdmin && <TabsTrigger className="h-10 shrink-0 whitespace-nowrap px-4 py-2" value="google-calendar">Google Calendar</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="partner-clinics" className="mt-4">
          <PartnerClinicsTab />
        </TabsContent>

        <TabsContent value="specializations" className="mt-4">
          <SpecializationsTab />
        </TabsContent>

        <TabsContent value="clinic-info" className="mt-4">
          <ClinicInfoTab />
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-4">
          <WhatsAppSettingsTab />
        </TabsContent>
        <TabsContent value="field-options" className="mt-4">
          <DropdownOptionsTab />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="working-hours" className="mt-4">
            <WorkingHoursTab />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="google-calendar" className="mt-4">
            <GoogleCalendarSettingsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

const EMPTY_WEEKLY_SCHEDULE: WeeklySchedule = {};

function WorkingHoursTab() {
  const { data: staffUsers = [] } = trpc.users.listStaff.useQuery();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const { data: clinicHours, refetch: refetchClinicHours } = trpc.availability.getWorkingHours.useQuery();
  const { data: selectedStaffHours, refetch: refetchStaffHours } = trpc.availability.getWorkingHours.useQuery(
    { userId: Number(selectedUserId) },
    { enabled: Boolean(selectedUserId) },
  );
  const { form: clinicForm, setForm: setClinicForm, hasDraft: clinicHasDraft, clearDraft: clearClinicDraft, initFromServer: initClinicFromServer } = useDraftForm({
    key: "draft_clinic_working_hours",
    initialData: { schedule: EMPTY_WEEKLY_SCHEDULE as WeeklySchedule },
  });
  const { form: staffForm, setForm: setStaffForm, hasDraft: staffHasDraft, clearDraft: clearStaffDraft, initFromServer: initStaffFromServer } = useDraftForm({
    key: "draft_staff_working_hours",
    initialData: { schedule: EMPTY_WEEKLY_SCHEDULE as WeeklySchedule },
  });
  const saveClinic = trpc.availability.saveClinicDefaultWorkingHours.useMutation({
    onSuccess: async () => { toast.success("Clinic working hours saved"); clearClinicDraft(); await refetchClinicHours(); },
    onError: () => toast.error("Working hours could not be saved. Please review the time windows and try again."),
  });
  const saveStaff = trpc.availability.saveStaffWorkingHoursOverride.useMutation({
    onSuccess: async () => { toast.success("Staff working-hours override saved"); clearStaffDraft(); await refetchStaffHours(); },
    onError: () => toast.error("Staff working hours could not be saved. Please review the time windows and try again."),
  });

  useEffect(() => {
    if (!clinicHours || clinicHasDraft) return;
    initClinicFromServer({ schedule: (clinicHours.clinicDefault ?? EMPTY_WEEKLY_SCHEDULE) as WeeklySchedule });
  }, [clinicHours, clinicHasDraft, initClinicFromServer]);
  useEffect(() => {
    if (!selectedUserId || !selectedStaffHours || staffHasDraft) return;
    initStaffFromServer({ schedule: (selectedStaffHours.staffOverride ?? selectedStaffHours.clinicDefault ?? EMPTY_WEEKLY_SCHEDULE) as WeeklySchedule });
  }, [selectedUserId, selectedStaffHours, staffHasDraft, initStaffFromServer]);

  const clinicDirty = JSON.stringify(clinicForm.schedule) !== JSON.stringify(clinicHours?.clinicDefault ?? EMPTY_WEEKLY_SCHEDULE);
  const staffDirty = Boolean(selectedUserId) && JSON.stringify(staffForm.schedule) !== JSON.stringify(selectedStaffHours?.staffOverride ?? selectedStaffHours?.clinicDefault ?? EMPTY_WEEKLY_SCHEDULE);
  useBeforeUnload(clinicDirty || staffDirty);

  return (
    <div className="max-w-4xl space-y-5">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <h2 className="font-semibold">Clinic default working hours</h2>
            <p className="text-sm text-muted-foreground">Europe/Istanbul. Set the clinic fallback hours here; no business hours are inferred until an Admin saves them. Staff and doctor overrides replace this default. This Foundation does not generate or apply rescheduling proposals.</p>
          </div>
          <WeeklyScheduleEditor value={clinicForm.schedule} onChange={(schedule) => setClinicForm({ schedule })} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => { initClinicFromServer({ schedule: (clinicHours?.clinicDefault ?? EMPTY_WEEKLY_SCHEDULE) as WeeklySchedule }); clearClinicDraft(); }} disabled={!clinicDirty || saveClinic.isPending}>Cancel</Button>
            <Button onClick={() => saveClinic.mutate({ schedule: clinicForm.schedule })} disabled={!clinicDirty || saveClinic.isPending}>
              {saveClinic.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save clinic hours
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <h2 className="font-semibold">Staff or doctor override</h2>
            <p className="text-sm text-muted-foreground">Optional. A saved override replaces the clinic default for this person.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Staff or doctor</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedUserId} onChange={(event) => { setSelectedUserId(event.target.value); clearStaffDraft(); }}>
              <option value="">Select a staff member…</option>
              {staffUsers.filter((person: any) => person.role === "staff" || person.role === "doctor").map((person: any) => <option key={person.id} value={person.id}>{person.name || person.email || `User ${person.id}`} · {person.role}</option>)}
            </select>
          </div>
          {selectedUserId && selectedStaffHours && (
            <>
              <WeeklyScheduleEditor value={staffForm.schedule} onChange={(schedule) => setStaffForm({ schedule })} />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => { initStaffFromServer({ schedule: (selectedStaffHours.staffOverride ?? selectedStaffHours.clinicDefault ?? EMPTY_WEEKLY_SCHEDULE) as WeeklySchedule }); clearStaffDraft(); }} disabled={!staffDirty || saveStaff.isPending}>Cancel</Button>
                <Button onClick={() => saveStaff.mutate({ userId: Number(selectedUserId), schedule: staffForm.schedule })} disabled={!staffDirty || saveStaff.isPending}>
                  {saveStaff.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save override
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Google Calendar G1 Tab ───────────────────────────────────────────────────
function GoogleCalendarSettingsTab() {
  const utils = trpc.useUtils();
  const { data: connection, isLoading, error: statusError } = trpc.googleCalendar.status.useQuery();
  const canLoadCalendars = connection?.connected && connection.status === "connected";
  const calendarsQuery = trpc.googleCalendar.listOwnedCalendars.useQuery(undefined, { enabled: Boolean(canLoadCalendars) });
  const canRunBackfill = Boolean(connection?.connected && connection.status === "connected" && connection.destinationCalendar);
  const backfillPreview = trpc.googleCalendar.backfillPreview.useQuery(undefined, { enabled: canRunBackfill, staleTime: 0 });
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const [backfillConfirmOpen, setBackfillConfirmOpen] = useState(false);

  useEffect(() => {
    setSelectedCalendarId(connection?.destinationCalendar?.id ?? "");
  }, [connection?.destinationCalendar?.id]);

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("googleCalendar");
    if (!result) return;
    const messages: Record<string, string> = {
      connected: "Google Calendar connected. Select the clinic-owned destination calendar.",
      "invalid-state": "The Google connection request expired or was not valid. Please start the connection again.",
      "connection-failed": "Google Calendar connection did not complete. Check the Google Cloud configuration and try again.",
      "configuration-error": "Google Calendar is not securely configured. Ask an administrator to review the integration configuration.",
      unauthorized: "Only administrators can configure Google Calendar.",
    };
    if (result === "connected") toast.success(messages[result]);
    else toast.error(messages[result] ?? "Google Calendar setup could not be completed.");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const refreshStatus = async () => {
    await utils.googleCalendar.status.invalidate();
    await utils.googleCalendar.listOwnedCalendars.invalidate();
    await utils.googleCalendar.backfillPreview.invalidate();
  };

  const selectDestination = trpc.googleCalendar.selectDestination.useMutation({
    onSuccess: async () => {
      toast.success("Destination Google Calendar saved");
      await refreshStatus();
    },
    onError: error => toast.error(error.message || "Unable to save the selected Google Calendar."),
  });
  const testConnection = trpc.googleCalendar.testConnection.useMutation({
    onSuccess: async () => {
      toast.success("Google Calendar test completed successfully.");
      await refreshStatus();
    },
    onError: error => toast.error(error.message || "Google Calendar test failed. Please retry manually."),
  });
  const disconnect = trpc.googleCalendar.disconnect.useMutation({
    onSuccess: async () => {
      toast.success("Google Calendar disconnected and local authorization removed.");
      setSelectedCalendarId("");
      await refreshStatus();
    },
    onError: error => toast.error(error.message || "Unable to disconnect Google Calendar."),
  });
  const executeBackfill = trpc.googleCalendar.executeBackfill.useMutation({
    onSuccess: async result => {
      setBackfillConfirmOpen(false);
      toast.success(`Google Calendar backfill completed: ${result.succeeded} synced, ${result.skipped} skipped, ${result.failed} failed.`);
      await refreshStatus();
    },
    onError: error => toast.error(error.message || "The controlled Google Calendar backfill could not be completed."),
  });

  if (isLoading) {
    return <div className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading Google Calendar settings…</div>;
  }
  if (statusError) {
    return <Card><CardContent className="p-5 flex gap-3 text-sm"><CircleAlert className="h-5 w-5 text-destructive shrink-0" /><p>Google Calendar settings are unavailable. Please refresh the page or contact an administrator.</p></CardContent></Card>;
  }

  const isBusy = selectDestination.isPending || testConnection.isPending || disconnect.isPending || executeBackfill.isPending;
  const calendarOptions = calendarsQuery.data ?? [];
  const connectionIsHealthy = connection?.connected && connection.status === "connected";
  const health = connection?.health;

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="rounded-lg bg-blue-50 text-blue-700 p-2.5 shrink-0"><CalendarDays className="h-5 w-5" /></div>
              <div>
                <h3 className="font-semibold">Google Calendar</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Clinic-level connection and safe outbound appointment synchronization health.</p>
              </div>
            </div>
            <Badge variant={connectionIsHealthy ? "secondary" : "outline"} className={connectionIsHealthy ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "text-muted-foreground"}>
              {connectionIsHealthy ? "Connected" : connection?.status === "needs_attention" ? "Needs attention" : "Not connected"}
            </Badge>
          </div>

          {!connection?.connected ? (
            <div className="rounded-lg border bg-muted/30 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Google Calendar: Not connected</p>
                <p className="text-xs text-muted-foreground mt-1">Connect the clinic Google account through the secure Google authorization flow.</p>
              </div>
              <Button className="gap-2 shrink-0" onClick={() => window.location.assign("/api/google-calendar/oauth/start")}><Link2 className="h-4 w-4" />Connect Google Calendar</Button>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Connected Google account</p>
                  <p className="text-sm font-medium mt-1 truncate">{connection.accountEmail}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Business timezone</p>
                  <p className="text-sm font-medium mt-1 flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600" />{connection.timezone}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Last successful sync</p><p className="text-sm font-medium mt-1">{health?.lastSuccessfulSyncAt ? new Date(health.lastSuccessfulSyncAt).toLocaleString() : "None yet"}</p></div>
                <div className="rounded-lg border p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pending syncs</p><p className="text-sm font-medium mt-1">{health?.pendingCount ?? 0}</p></div>
                <div className="rounded-lg border p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Failed syncs</p><p className="text-sm font-medium mt-1">{health?.failedCount ?? 0}</p></div>
                <div className="rounded-lg border p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Connection health</p><p className="text-sm font-medium mt-1">{connection.status === "needs_attention" ? "Reconnect required" : connection.status === "connected" ? "Healthy" : "Not connected"}</p></div>
              </div>

              {connection.status === "needs_attention" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
                  <CircleAlert className="h-4 w-4 mt-0.5 shrink-0" />
                  <div><strong>Reconnection required.</strong> {connection.lastError ?? "Google authorization is no longer valid."}</div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>Destination clinic calendar</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Only calendars owned by the connected Google account are available. The actual Google Calendar ID is stored after selection.</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => calendarsQuery.refetch()} disabled={!canLoadCalendars || calendarsQuery.isFetching}>
                    {calendarsQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Refresh
                  </Button>
                </div>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  value={selectedCalendarId}
                  onChange={event => setSelectedCalendarId(event.target.value)}
                  disabled={!canLoadCalendars || calendarsQuery.isFetching || isBusy}
                >
                  <option value="">{calendarsQuery.isFetching ? "Loading clinic-owned calendars…" : "Select a clinic-owned Google Calendar"}</option>
                  {calendarOptions.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.name}{calendar.isPrimary ? " (primary)" : ""}</option>)}
                </select>
                {!calendarsQuery.isFetching && canLoadCalendars && calendarOptions.length === 0 && (
                  <p className="text-xs text-amber-700">No owned Google calendar is available. Create <strong>Fertiliv Clinical Operations</strong> manually in Google Calendar, then refresh this list.</p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={() => selectedCalendarId && selectDestination.mutate({ calendarId: selectedCalendarId })} disabled={!selectedCalendarId || selectedCalendarId === connection.destinationCalendar?.id || isBusy}>
                    {selectDestination.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save destination
                  </Button>
                  <Button type="button" onClick={() => testConnection.mutate()} disabled={!connection.destinationCalendar || isBusy}>
                    {testConnection.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}Test Connection
                  </Button>
                  <Button type="button" variant="outline" className="text-destructive hover:text-destructive" onClick={() => { if (confirm("Disconnect Google Calendar? The local authorization will be removed.")) disconnect.mutate(); }} disabled={isBusy}>
                    {disconnect.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Unplug className="h-4 w-4 mr-2" />}Disconnect
                  </Button>
                </div>
                {connection.destinationCalendar && <p className="text-xs text-muted-foreground">Selected: <span className="font-medium text-foreground">{connection.destinationCalendar.name}</span></p>}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {canRunBackfill && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-semibold">Controlled future appointment backfill</h3>
                <p className="mt-1 text-xs text-muted-foreground">One-time, admin-approved sync of existing future Fertiliv appointments that are not mapped to Google yet.</p>
              </div>
              <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => backfillPreview.refetch()} disabled={backfillPreview.isFetching || isBusy}>
                {backfillPreview.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Refresh preview
              </Button>
            </div>

            {backfillPreview.isLoading || backfillPreview.isFetching ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking eligible future appointments…</div>
            ) : backfillPreview.error ? (
              <div className="rounded-lg border border-destructive/25 bg-background p-3 text-sm text-destructive">Unable to load the safe backfill preview. Refresh the preview or try again later.</div>
            ) : (
              <>
                <div className="rounded-lg border border-amber-200 bg-background p-3">
                  <p className="text-sm font-medium">{backfillPreview.data?.count ?? 0} future appointment{(backfillPreview.data?.count ?? 0) === 1 ? "" : "s"} not yet synced to Google</p>
                  <p className="mt-1 text-xs text-muted-foreground">Only upcoming or confirmed appointments dated now or later with a Lead or Patient relationship are included. Past, completed, cancelled, no-show, and already-mapped appointments are excluded.</p>
                </div>
                {(backfillPreview.data?.appointments.length ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    {backfillPreview.data?.appointments.map(appointment => (
                      <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-xs">
                        <span className="font-medium">{appointment.code ?? `Appointment #${appointment.id}`}</span>
                        <span className="text-muted-foreground">{new Date(appointment.appointmentDate).toLocaleString()} · {appointment.recordType === "patient" ? "Patient" : "Lead"} · {appointment.status}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">Maximum 25 appointments per approved execution. Eligibility is checked again when you confirm.</p>
                  <Button type="button" onClick={() => setBackfillConfirmOpen(true)} disabled={!backfillPreview.data?.count || isBusy}>Review & confirm backfill</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={backfillConfirmOpen} onOpenChange={open => !executeBackfill.isPending && setBackfillConfirmOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Confirm future-only Google Calendar backfill</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm">
            <p>This will attempt to synchronize <strong>{backfillPreview.data?.count ?? 0}</strong> currently eligible future appointment{(backfillPreview.data?.count ?? 0) === 1 ? "" : "s"} to the selected clinic Google Calendar.</p>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">Past, completed, cancelled, no-show, and already-mapped appointments remain excluded. Each appointment is rechecked at execution, uses the existing privacy-safe outbound payload, and cannot block Fertiliv if a Google sync fails.</div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBackfillConfirmOpen(false)} disabled={executeBackfill.isPending}>Cancel</Button>
              <Button type="button" onClick={() => executeBackfill.mutate()} disabled={!backfillPreview.data?.count || executeBackfill.isPending}>
                {executeBackfill.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Confirm backfill
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="border-blue-100 bg-blue-50/40">
        <CardContent className="p-4 text-xs text-blue-950 space-y-1.5">
          <p className="font-medium flex items-center gap-1.5"><ExternalLink className="h-3.5 w-3.5" />G1 privacy boundary</p>
          <p>Test Connection creates, updates, and deletes one private non-clinical verification event. It does not read unrelated event content and never sends Fertiliv appointment, Lead, Patient, CRM, Finance, or clinical data to Google.</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Specializations Tab ─────────────────────────────────────────────────────

function SubSpecializationsPanel({ specializationId, specializationName }: { specializationId: number; specializationName: string }) {
  const { data: subs, isLoading, refetch } = trpc.subSpecializations.list.useQuery({ specializationId });
  const [newName, setNewName] = useState("");
  const [editItem, setEditItem] = useState<{ id: number; name: string } | null>(null);
  const [editName, setEditName] = useState("");

  const create = trpc.subSpecializations.create.useMutation({
    onSuccess: () => { toast.success("Sub-specialization added"); setNewName(""); refetch(); },
    onError: (e) => { toast.error((e as any)?.message || "Failed to add"); },
  });
  const update = trpc.subSpecializations.update.useMutation({
    onSuccess: () => { toast.success("Updated"); setEditItem(null); refetch(); },
    onError: (e) => { toast.error((e as any)?.message || "Failed to update"); },
  });
  const del = trpc.subSpecializations.delete.useMutation({
    onSuccess: () => { toast.success("Deleted"); refetch(); },
    onError: (e) => { toast.error((e as any)?.message || "Failed to delete"); },
  });

  return (
    <div className="mt-3 border-t pt-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sub-specializations of {specializationName}</p>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-1.5">
          {(subs ?? []).map((sub: { id: number; name: string }) => (
            <div key={sub.id} className="flex items-center gap-2 bg-muted/40 rounded px-2 py-1">
              {editItem?.id === sub.id ? (
                <>
                  <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-6 text-xs flex-1"
                    onKeyDown={e => { if (e.key === "Enter") update.mutate({ id: sub.id, name: editName.trim() }); if (e.key === "Escape") setEditItem(null); }}
                    autoFocus />
                  <Button size="sm" className="h-6 text-xs px-2" onClick={() => update.mutate({ id: sub.id, name: editName.trim() })} disabled={update.isPending}>Save</Button>
                  <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => setEditItem(null)}>Cancel</Button>
                </>
              ) : (
                <>
                  <span className="text-xs flex-1">{sub.name}</span>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setEditItem(sub); setEditName(sub.name); }}>
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:text-destructive"
                    onClick={() => { if (confirm(`Delete "${sub.name}"?`)) del.mutate({ id: sub.id }); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          ))}
          <div className="flex gap-2 mt-1">
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Add sub-specialization..." className="h-7 text-xs"
              onKeyDown={e => e.key === "Enter" && newName.trim() && create.mutate({ specializationId, name: newName.trim() })} />
            <Button size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={() => newName.trim() && create.mutate({ specializationId, name: newName.trim() })} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SpecializationsTab() {
  const { data: specializations, isLoading, refetch } = trpc.specializations.list.useQuery();
  const [newName, setNewName] = useState("");
  const [editItem, setEditItem] = useState<{ id: number; name: string } | null>(null);
  const [editName, setEditName] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const create = trpc.specializations.create.useMutation({
    onSuccess: () => { toast.success("Specialization added"); setNewName(""); refetch(); },
    onError: (e) => {
      const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again.");
      toast.error(_msg);
    },
  });
  const update = trpc.specializations.update.useMutation({
    onSuccess: () => { toast.success("Specialization updated"); setEditItem(null); refetch(); },
    onError: (e) => {
      const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again.");
      toast.error(_msg);
    },
  });
  const del = trpc.specializations.delete.useMutation({
    onSuccess: () => { toast.success("Specialization deleted"); refetch(); },
    onError: (e) => {
      const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again.");
      toast.error(_msg);
    },
  });

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return toast.error("Name is required");
    create.mutate({ name });
  };

  const handleUpdate = () => {
    if (!editItem) return;
    const name = editName.trim();
    if (!name) return toast.error("Name is required");
    update.mutate({ id: editItem.id, name });
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Doctor Specializations</p>
        <p className="text-xs text-muted-foreground">Manage specializations and their sub-specializations. Click a row to expand and manage sub-specializations.</p>
      </div>

      {/* Add new specialization */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="New specialization (e.g. Reproductive Endocrinology)"
              onKeyDown={e => e.key === "Enter" && handleAdd()}
            />
            <Button onClick={handleAdd} disabled={create.isPending} className="shrink-0 gap-1.5">
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !specializations || specializations.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <Stethoscope className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">No specializations yet. Add one above.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {specializations.map(spec => (
            <Card key={spec.id} className="border">
              <CardContent className="p-3">
                {editItem?.id === spec.id ? (
                  <div className="flex gap-2">
                    <Input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleUpdate();
                        if (e.key === "Escape") setEditItem(null);
                      }}
                      autoFocus
                    />
                    <Button size="sm" onClick={handleUpdate} disabled={update.isPending}>
                      {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition-opacity"
                        onClick={() => setExpandedId(expandedId === spec.id ? null : spec.id)}
                      >
                        {expandedId === spec.id
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <Stethoscope className="h-4 w-4 text-primary shrink-0" />
                        <p className="text-sm font-medium">{spec.name}</p>
                      </button>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setEditItem(spec); setEditName(spec.name); }}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Delete specialization "${spec.name}"? This cannot be undone.`)) {
                              del.mutate({ id: spec.id });
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {expandedId === spec.id && (
                      <SubSpecializationsPanel specializationId={spec.id} specializationName={spec.name} />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Partner Clinics Tab ──────────────────────────────────────────────────────

function PartnerClinicsTab() {
  const { data: clinics, isLoading, refetch } = trpc.partnerClinics.list.useQuery();
  const [showAdd, setShowAdd] = useState(false);
  const [editClinic, setEditClinic] = useState<any>(null);
  const deleteClinic = trpc.partnerClinics.delete.useMutation({
    onSuccess: () => { toast.success("Partner clinic deactivated"); refetch(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const active = clinics?.filter(c => c.isActive) ?? [];
  const inactive = clinics?.filter(c => !c.isActive) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Partner Clinics</p>
          <p className="text-xs text-muted-foreground">External clinics for lab orders and referrals</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" />Add Partner Clinic
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : active.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <Building2 className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">No partner clinics yet</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {active.map(clinic => (
            <Card key={clinic.id} className="border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary shrink-0" />
                      <p className="font-semibold text-sm truncate">{clinic.name}</p>
                    </div>
                    {clinic.specialty && (
                      <p className="text-xs text-muted-foreground mt-0.5">{clinic.specialty}</p>
                    )}
                    {clinic.address && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{clinic.address}</p>
                    )}
                    {clinic.phone && (
                      <p className="text-xs text-muted-foreground">{clinic.phone}</p>
                    )}
                    {clinic.notes && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{clinic.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditClinic(clinic)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Deactivate "${clinic.name}"?`)) {
                          deleteClinic.mutate({ id: clinic.id });
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {inactive.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">{inactive.length} deactivated clinic(s)</summary>
          <div className="mt-2 space-y-1 pl-2">
            {inactive.map(c => <p key={c.id} className="line-through">{c.name}</p>)}
          </div>
        </details>
      )}

      <PartnerClinicModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={() => { refetch(); setShowAdd(false); }}
      />
      {editClinic && (
        <PartnerClinicModal
          open={!!editClinic}
          onClose={() => setEditClinic(null)}
          onSuccess={() => { refetch(); setEditClinic(null); }}
          existing={editClinic}
        />
      )}
    </div>
  );
}

function PartnerClinicModal({ open, onClose, onSuccess, existing }: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existing?: any;
}) {
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [address, setAddress] = useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setSpecialty(existing?.specialty ?? "");
      setAddress(existing?.address ?? "");
      setGoogleMapsUrl(existing?.googleMapsUrl ?? "");
      setPhone(existing?.phone ?? "");
      setNotes(existing?.notes ?? "");
    }
  }, [open, existing]);

  const create = trpc.partnerClinics.create.useMutation({
    onSuccess: () => { toast.success("Partner clinic added"); onSuccess(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });
  const update = trpc.partnerClinics.update.useMutation({
    onSuccess: () => { toast.success("Partner clinic updated"); onSuccess(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const handleSubmit = () => {
    const normalizedMapUrl = googleMapsUrl.trim();
    if (normalizedMapUrl) {
      try {
        const parsed = new URL(normalizedMapUrl);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Unsupported protocol");
      } catch {
        return toast.error("Enter a valid Google Maps URL or leave the field empty.");
      }
    }
    const commonData = {
      name: name.trim(), specialty: specialty || undefined, address: address || undefined,
      phone: phone || undefined, notes: notes || undefined,
    };
    if (!commonData.name) return toast.error("Name is required");
    if (existing) {
      update.mutate({ id: existing.id, data: { ...commonData, googleMapsUrl: normalizedMapUrl || null } });
    } else {
      create.mutate({ ...commonData, googleMapsUrl: normalizedMapUrl || undefined });
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Partner Clinic" : "Add Partner Clinic"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Clinic Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Istanbul Lab Center" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Specialty</Label>
            <Input value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="e.g. Genetics, Radiology" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Address</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Full address" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Google Maps Link</Label>
            <Input type="url" value={googleMapsUrl} onChange={e => setGoogleMapsUrl(e.target.value)} placeholder="https://maps.google.com/..." />
            <p className="text-[11px] text-muted-foreground">Optional. Keep the clinic address in Address; paste only a direct Maps link here.</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+90 ..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any additional notes..." />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Saving..." : existing ? "Update" : "Add Clinic"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── WhatsApp Settings Tab ────────────────────────────────────────────────────

function WhatsAppSettingsTab() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data: status, isLoading, error } = trpc.whatsapp.manualSettingsStatus.useQuery(undefined, {
    staleTime: 30_000,
    enabled: isAdmin,
  });
  const { data: connectedNumbers = [], isLoading: connectedNumbersLoading } = trpc.whatsappPlatform.connectedNumbers.useQuery(undefined, {
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const { data: embeddedStatus, isLoading: isEmbeddedStatusLoading } = trpc.whatsapp.embeddedSignupStatus.useQuery(undefined, {
    staleTime: 30_000,
    enabled: isAdmin,
  });
  const startEmbeddedSignup = trpc.whatsapp.startEmbeddedSignup.useMutation();
  const cancelEmbeddedSignup = trpc.whatsapp.cancelEmbeddedSignup.useMutation();
  const completeEmbeddedSignup = trpc.whatsapp.completeEmbeddedSignup.useMutation();

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(WHATSAPP_PRODUCTION_WEBHOOK_URL);
      toast.success("Webhook URL copied");
    } catch {
      toast.error("The webhook URL could not be copied. Please select it manually.");
    }
  };

  const launchRecommendedOnboarding = async () => {
    if (!isAdmin) {
      toast.error("Only administrators can connect a WhatsApp account.");
      return;
    }
    if (!embeddedStatus?.configured) {
      toast.error("Meta recommended onboarding is not configured. Complete the platform configuration first.");
      return;
    }

    try {
      const launch = await startEmbeddedSignup.mutateAsync();
      const sdk = await loadMetaEmbeddedSignupSdk({ appId: launch.appId, graphApiVersion: launch.graphApiVersion });
      let sessionInfo: MetaEmbeddedSignupSessionInfo | null = null;
      let authorizationCode: string | null = null;
      let finished = false;

      const cleanup = () => window.removeEventListener("message", onMessage);
      const cancel = (category: "cancelled" | "authorization_denied" | "provider_error", currentStep?: string | null) => {
        cleanup();
        void cancelEmbeddedSignup.mutateAsync({ requestId: launch.requestId, category, currentStep: currentStep ?? null })
          .catch(() => undefined);
      };
      const completeWhenReady = () => {
        if (finished || !authorizationCode || !sessionInfo) return;
        finished = true;
        cleanup();
        const code = authorizationCode;
        authorizationCode = null;
        completeEmbeddedSignup.mutate({
          requestId: launch.requestId,
          authorizationCode: code,
          completionEvent: sessionInfo.event,
          wabaId: sessionInfo.wabaId,
          phoneNumberId: sessionInfo.phoneNumberId,
          businessPortfolioId: sessionInfo.businessPortfolioId,
        }, {
          onSuccess: () => toast.success("Meta authorization was saved safely. This number is onboarding-only and has not changed the production route."),
          onError: () => toast.error("Meta authorization could not be completed safely. No production route was changed."),
        });
      };
      const onMessage = (event: MessageEvent) => {
        const parsed = parseMetaEmbeddedSignupMessage(event);
        if (!parsed || finished) return;
        if (parsed.event === "CANCEL" || parsed.event === "ERROR") {
          finished = true;
          cancel(parsed.event === "ERROR" ? "provider_error" : "cancelled", parsed.currentStep);
          toast.error(parsed.event === "ERROR" ? "Meta could not complete the authorization. No connection was created." : "Meta authorization was cancelled. No connection was created.");
          return;
        }
        sessionInfo = parsed;
        completeWhenReady();
      };

      window.addEventListener("message", onMessage);
      launchMetaEmbeddedSignup({
        sdk,
        configId: launch.configId,
        onResponse: (response) => {
          const code = response.authResponse?.code;
          if (finished) return;
          if (!code) {
            finished = true;
            cancel("authorization_denied");
            toast.error("Meta authorization was not granted. No connection was created.");
            return;
          }
          authorizationCode = code;
          completeWhenReady();
        },
      });
    } catch {
      toast.error("Meta recommended onboarding could not be started. Check the platform configuration and try again.");
    }
  };

  if (!isAdmin) {
    const visibleNumbers = connectedNumbers.filter((number) => {
      const provider = number.provider as string;
      return provider === "meta" || provider === "linked_device";
    });
    return (
      <div className="w-full max-w-5xl space-y-5">
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h3 className="text-base font-semibold">WhatsApp</h3>
              <p className="mt-1 text-sm text-muted-foreground">Use the Inbox to search for a contact or enter a phone number and start a conversation. Connection and session setup are managed by administrators.</p>
            </div>
            {connectedNumbersLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking your WhatsApp lines…</div> : visibleNumbers.length === 0 ? <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">No WhatsApp line is currently available to your account.</p> : <div className="space-y-2">{visibleNumbers.map((number) => { const connected = number.status === "connected"; const statusLabel = connected ? "Connected" : number.status === "reconnecting" ? "Reconnecting" : "Disconnected"; return <div key={number.id} className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"><div><p className="text-sm font-medium">{number.lineName}</p><p className="mt-1 text-xs text-muted-foreground">{number.fullPhone ? `••••${number.fullPhone.slice(-4)}` : "Number hidden"}</p></div><Badge variant="outline" className={connected ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-800"}>{statusLabel}</Badge></div>; })}</div>}
            <Link href="/inbox"><Button className="gap-2 bg-[#1E0566] hover:bg-[#2d1680]"><MessageCircle className="h-4 w-4" />Open Inbox</Button></Link>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-slate-50/70"><CardContent className="p-5 text-sm text-muted-foreground">If a line is disconnected, ask an administrator to reconnect it from Settings. QR, provider, session, and test-recipient controls are intentionally not shown in the normal staff view.</CardContent></Card>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading WhatsApp settings…</div>;
  }

  if (error || !status) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-5 text-sm">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">WhatsApp settings are unavailable</p>
            <p className="mt-1 text-muted-foreground">The non-secret configuration status could not be loaded. Refresh the page or contact an administrator.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isReady = status.manualConfigurationState === "ready";
  const isInvalid = status.manualConfigurationState === "invalid";
  const manualStatusLabel = isReady ? "Manual configuration available" : isInvalid ? "Manual configuration needs review" : "Manual configuration incomplete";
  const statusClass = isReady
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : isInvalid
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-amber-200 bg-amber-50 text-amber-800";
  const fieldState = (state: "configured" | "not_configured" | "invalid") => {
    if (state === "configured") return { label: "Configured", className: "text-emerald-700" };
    if (state === "invalid") return { label: "Needs review", className: "text-red-700" };
    return { label: "Not configured", className: "text-amber-700" };
  };

  const phoneState = fieldState(status.phoneNumberId.state);
  const wabaState = fieldState(status.wabaId.state);

  return (
    <div className="w-full max-w-5xl space-y-5">
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-base font-semibold">Manual Cloud API</h3>
                <Badge variant="outline">Advanced setup</Badge>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Manual Cloud API remains supported for administrators who already manage a Meta Business setup. It is an advanced configuration path, not the recommended future onboarding flow.
              </p>
            </div>
            <Badge variant="outline" className={`w-fit ${statusClass}`}>
              {isReady ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <CircleAlert className="mr-1 h-3.5 w-3.5" />}
              {manualStatusLabel}
            </Badge>
          </div>

          <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm">
            <p className="font-medium">Connection-specific configuration</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              The current production route reads these values from server-side environment configuration. This screen intentionally shows status only; it does not write tokens or secrets into the application database, browser storage, or client-side variables.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <Label>Phone Number ID</Label>
                <span className={`text-xs font-medium ${phoneState.className}`}>{phoneState.label}</span>
              </div>
              <p className="mt-2 font-mono text-sm text-foreground">{status.phoneNumberId.suffix ? `••••${status.phoneNumberId.suffix}` : "Not available"}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Connection identity used by the current Manual Cloud API route.</p>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <Label>WhatsApp Business Account ID</Label>
                <span className={`text-xs font-medium ${wabaState.className}`}>{wabaState.label}</span>
              </div>
              <p className="mt-2 font-mono text-sm text-foreground">{status.wabaId.suffix ? `••••${status.wabaId.suffix}` : "Not available"}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">WABA identity is checked against inbound provider events.</p>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <Label>Permanent Access Token</Label>
                <span className={`text-xs font-medium ${status.accessTokenConfigured ? "text-emerald-700" : "text-amber-700"}`}>{status.accessTokenConfigured ? "Configured" : "Not configured"}</span>
              </div>
              <p className="mt-2 font-mono text-sm text-muted-foreground">••••••••••••••••</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Write-only server credential. The full value is never returned here.</p>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <Label>Connection route</Label>
                <span className="text-xs font-medium text-slate-700">{status.productionRoute === "legacy_environment" ? "Legacy environment" : "Persisted cutover enabled"}</span>
              </div>
              <p className="mt-2 text-sm text-foreground">{status.connectionRouteState === "ready" ? "Ready for the current route" : "Manual values are incomplete"}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Persisted-connection production cutover is not changed by WU-08.</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            To change the server-side values, use the project’s secure secret/environment configuration mechanism. Do not paste credentials into this page or into chat.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold">Webhook</h3>
              <p className="mt-1 text-sm text-muted-foreground">Use this fixed production callback in Meta. The application does not allow ordinary admins to overwrite it.</p>
            </div>
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Webhook available</Badge>
          </div>
          <div className="grid gap-1.5">
            <Label>Production callback URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={status.webhookUrl} className="bg-muted font-mono text-xs" aria-label="Production WhatsApp webhook URL" />
              <Button variant="outline" size="sm" className="shrink-0"
                onClick={copyWebhookUrl}>
                Copy
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <p className="text-xs font-medium text-muted-foreground">Webhook route</p>
              <p className="mt-1 text-sm font-medium text-emerald-700">Available</p>
              <p className="mt-1 text-[11px] text-muted-foreground">The callback is registered by the current server.</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs font-medium text-muted-foreground">Webhook configuration</p>
              <p className={`mt-1 text-sm font-medium ${status.webhookConfigurationState === "ready" ? "text-emerald-700" : "text-amber-700"}`}>
                {status.webhookConfigurationState === "ready" ? "Ready" : "Incomplete"}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">This status checks only server-side configuration presence; secret values are never shown.</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Configure the <strong>messages</strong> field in the Meta Developer Portal. WHATSAPP_APP_SECRET and WHATSAPP_VERIFY_TOKEN are project/server secrets and are intentionally not editable application settings.</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h3 className="text-base font-semibold">Safety</h3>
            <p className="mt-1 text-sm text-muted-foreground">Unknown WhatsApp contacts are captured safely and remain unresolved until identity is reviewed or confirmed.</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-900">No automatic business or clinical identity is created</p>
            <p className="mt-1 text-xs leading-5 text-emerald-800">An unknown sender does not automatically become a Patient, Lead, MRN, Conversation identity, clinical record, or Treatment Case. The provider event remains inspectable and unresolved until a separately approved review workflow exists.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-emerald-200 bg-emerald-50/40">
        <CardContent className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">Connect with Meta</h3>
              <Badge className="bg-emerald-600 hover:bg-emerald-600">Recommended</Badge>
            </div>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">Authorize a standard Meta Cloud API WhatsApp account without entering platform secrets. The existing Manual Cloud API path remains available above.</p>
            <p className="mt-2 text-xs text-muted-foreground">The authorized number stays in onboarding-only status. It does not replace the current production sending or inbound route.</p>
          </div>
          {isAdmin ? (
            <Button onClick={launchRecommendedOnboarding} disabled={isEmbeddedStatusLoading || !embeddedStatus?.configured || startEmbeddedSignup.isPending || completeEmbeddedSignup.isPending} className="shrink-0">
              {(startEmbeddedSignup.isPending || completeEmbeddedSignup.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Connect with Meta
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Administrator access is required to connect an account.</p>
          )}
        </CardContent>
        {isAdmin && !isEmbeddedStatusLoading && !embeddedStatus?.configured && (
          <div className="border-t px-6 py-3 text-xs text-amber-800">Platform configuration is incomplete. Meta App ID, Embedded Signup Config ID, and server-only App Secret must be configured before launch.</div>
        )}
      </Card>

      <Card>
        <CardContent className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-base font-semibold">Advanced connections and diagnostics</h3>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">Administrator-only operational views for connection readiness and Linked Device session health. These views never change routing or production eligibility.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2"><Link href="/whatsapp-connections"><Button variant="outline">Connected Numbers</Button></Link><Link href="/whatsapp-sessions"><Button variant="outline">Session diagnostics</Button></Link></div>
        </CardContent>
      </Card>

      <LinkedDeviceFoundationCard isAdmin={isAdmin} />
    </div>
  );
}

const EMPTY_LINKED_DEVICE_FORM = { lineName: "", authorizedStaffIds: [] as number[] };

function LinkedDeviceFoundationCard({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createdLineId, setCreatedLineId] = useState<number | null>(null);
  const [sandboxActive, setSandboxActive] = useState(false);
  const [activeLineName, setActiveLineName] = useState("");
  const [staffEditorOpen, setStaffEditorOpen] = useState(false);
  const [staffEditorLine, setStaffEditorLine] = useState<{ id: number; lineName: string; authorizedStaffIds: number[] } | null>(null);
  const [testRecipientsOpen, setTestRecipientsOpen] = useState(false);
  const [testRecipientLine, setTestRecipientLine] = useState<{ id: number; name: string } | null>(null);
  const linkedForm = useDraftForm({
    key: "whatsapp_linked_device_line_new",
    initialData: EMPTY_LINKED_DEVICE_FORM,
    disabled: !isAdmin,
  });
  const isEditing = dialogOpen && createdLineId === null && (linkedForm.form.lineName.trim().length > 0 || linkedForm.form.authorizedStaffIds.length > 0);
  const staffEditorForm = useDraftForm({
    key: `whatsapp_linked_device_staff_${staffEditorLine?.id ?? "none"}`,
    initialData: { authorizedStaffIds: staffEditorLine?.authorizedStaffIds ?? [] },
    disabled: !isAdmin,
  });
  const staffEditorDirty = Boolean(staffEditorLine) && JSON.stringify([...staffEditorForm.form.authorizedStaffIds].sort()) !== JSON.stringify([...(staffEditorLine?.authorizedStaffIds ?? [])].sort());
  useBeforeUnload(isEditing || staffEditorDirty);
  const { data: linkedDevice, isLoading } = trpc.whatsapp.linkedDeviceStatus.useQuery(undefined, {
    staleTime: 30_000,
    enabled: isAdmin,
  });
  const { data: eligibleStaff = [] } = trpc.whatsapp.linkedDeviceEligibleStaff.useQuery(undefined, {
    staleTime: 60_000,
    enabled: isAdmin && (dialogOpen || staffEditorOpen),
  });
  const sandboxInput = useMemo(() => createdLineId === null ? undefined : ({ lineId: createdLineId, includeQr: true }), [createdLineId]);
  const { data: sandboxStatus, isFetching: isSandboxFetching, error: sandboxStatusError } = trpc.whatsapp.getLinkedDeviceSandboxStatus.useQuery(sandboxInput as { lineId: number; includeQr?: boolean }, {
    enabled: isAdmin && sandboxActive && Boolean(sandboxInput),
    refetchInterval: sandboxActive ? 2000 : false,
    refetchOnWindowFocus: true,
  });
  const createLine = trpc.whatsapp.createLinkedDeviceLine.useMutation({
    onSuccess: async (result) => {
      setCreatedLineId(result.id);
      setActiveLineName(linkedForm.form.lineName.trim());
      linkedForm.clearDraft();
      await utils.whatsapp.linkedDeviceStatus.invalidate();
      toast.success("WhatsApp line created. Connect it when you are ready to scan a QR code.");
    },
    onError: (error) => toast.error(error.message),
  });
  const startSandbox = trpc.whatsapp.startLinkedDeviceSandbox.useMutation({
    onSuccess: async () => {
      setSandboxActive(true);
      await utils.whatsapp.linkedDeviceStatus.invalidate();
      toast.success("WhatsApp connection is ready. Scan the QR code when it appears.");
    },
    onError: (error) => {
      setSandboxActive(false);
      toast.error(error.message || "WhatsApp connection could not be started.");
    },
  });
  const logoutSandbox = trpc.whatsapp.logoutLinkedDeviceSandbox.useMutation({
    onSuccess: async () => {
      setSandboxActive(false);
      setDialogOpen(false);
      setCreatedLineId(null);
      await utils.whatsapp.linkedDeviceStatus.invalidate();
      toast.success("The Linked Device was disconnected. A new QR scan is required to reconnect it.");
    },
    onError: (error) => toast.error(error.message || "The Linked Device could not be disconnected."),
  });
  const deleteLine = trpc.whatsapp.deleteUnusedLinkedDeviceLine.useMutation({
    onSuccess: async () => {
      setSandboxActive(false);
      setDialogOpen(false);
      setCreatedLineId(null);
      setActiveLineName("");
      await utils.whatsapp.linkedDeviceStatus.invalidate();
      toast.success("The unused WhatsApp line was removed from Settings. Historical conversations remain available.");
    },
    onError: (error) => toast.error(error.message || "The WhatsApp line could not be removed. Please try again."),
  });
  const updateLineStaff = trpc.whatsapp.updateLinkedDeviceLineStaff.useMutation({
    onSuccess: async (result) => {
      staffEditorForm.clearDraft();
      await utils.whatsapp.linkedDeviceStatus.invalidate();
      setStaffEditorOpen(false);
      setStaffEditorLine(null);
      toast.success(result.changed ? "Authorized staff updated for this WhatsApp line." : "Authorized staff are already up to date.");
    },
    onError: (error) => toast.error(error.message || "Authorized staff could not be updated. Please try again."),
  });

  const toggleStaff = (userId: number, checked: boolean) => {
    linkedForm.setForm((current) => ({
      ...current,
      authorizedStaffIds: checked
        ? [...current.authorizedStaffIds, userId]
        : current.authorizedStaffIds.filter((id) => id !== userId),
    }));
  };
  const toggleEditorStaff = (userId: number, checked: boolean) => {
    staffEditorForm.setForm((current) => ({
      authorizedStaffIds: checked
        ? Array.from(new Set([...current.authorizedStaffIds, userId]))
        : current.authorizedStaffIds.filter((id) => id !== userId),
    }));
  };
  const openSetup = () => {
    setDialogOpen(true);
    setCreatedLineId(null);
    setSandboxActive(false);
    setActiveLineName("");
  };
  const cancelSetup = () => {
    setDialogOpen(false);
    setCreatedLineId(null);
    setSandboxActive(false);
    setActiveLineName("");
    linkedForm.clearDraft();
  };
  const createFoundation = () => {
    if (!linkedForm.form.lineName.trim()) {
      toast.error("Enter a line name before continuing.");
      return;
    }
    if (linkedForm.form.authorizedStaffIds.length === 0) {
      toast.error("Select at least one authorized staff member.");
      return;
    }
    createLine.mutate(linkedForm.form);
  };

  const openExistingLine = (lineId: number, adapterKind: string, lineName: string, sessionState: string) => {
    setCreatedLineId(lineId);
    setDialogOpen(true);
    setActiveLineName(lineName);
    setSandboxActive((adapterKind === "wppconnect_sandbox" || adapterKind === "wppconnect_in_app_sandbox" || adapterKind === "wppconnect_server") && ["connected", "waiting_for_qr", "qr_ready", "linking", "creating_session"].includes(sessionState));
  };
  const openStaffEditor = (line: { id: number; lineName: string; authorizedStaffIds: number[] }) => {
    setStaffEditorLine({ id: line.id, lineName: line.lineName, authorizedStaffIds: [...line.authorizedStaffIds] });
    setStaffEditorOpen(true);
  };
  const closeStaffEditor = () => {
    staffEditorForm.clearDraft();
    setStaffEditorOpen(false);
    setStaffEditorLine(null);
  };
  const saveStaffEditor = () => {
    if (!staffEditorLine) return;
    if (staffEditorForm.form.authorizedStaffIds.length === 0) {
      toast.error("Select at least one authorized staff member.");
      return;
    }
    updateLineStaff.mutate({ lineId: staffEditorLine.id, authorizedStaffIds: staffEditorForm.form.authorizedStaffIds });
  };
  const openTestMode = (lineId: number, lineName: string) => {
    setTestRecipientLine({ id: lineId, name: lineName });
    setTestRecipientsOpen(true);
  };
  const disconnectLine = (lineId: number) => {
    if (!window.confirm("Disconnect this linked WhatsApp device? WhatsApp will require a new QR scan before it can reconnect.")) return;
    logoutSandbox.mutate({ lineId });
  };
  const deleteLineFromSettings = (line: { id: number; lineName: string; lifecycleState: string; sessionState: string }) => {
    if (!isLinkedDeviceLineDeletable(line.lifecycleState, line.sessionState)) {
      toast.error("Disconnect the Linked Device first. Delete line is available only when no session is active.");
      return;
    }
    if (!window.confirm(`Delete the unused WhatsApp line “${line.lineName}”? It will be removed from active Settings. Historical conversations, messages, media, audit history, send attempts, and clinical records will remain.`)) return;
    deleteLine.mutate({ lineId: line.id });
  };

  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">WhatsApp</h3>
              <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-900">Administrator setup</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Connect a WhatsApp account by scanning a temporary QR code. Connection details are managed securely by administrators and do not change existing Meta settings.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Connection details and controlled test settings are available only to administrators.</p>
          </div>
          {isAdmin ? (
            <Button variant="outline" onClick={openSetup} className="shrink-0 border-amber-300 bg-white hover:bg-amber-100">
              <Plus className="mr-2 h-4 w-4" /> Add WhatsApp Number
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Administrator access is required to manage connection foundations.</p>
          )}
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-100/60 p-4 text-sm text-amber-950">
            <div className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
              <p className="font-medium">Production feasibility gate remains active</p>
              <p className="mt-1 text-xs leading-5">This controlled connection is not approved for patient messages, clinical communications, or production routing. Production WhatsApp requires a separately approved connection method.</p>
            </div>
          </div>
        </div>

        {isAdmin && !isLoading && linkedDevice?.lines.length === 0 && (
          <p className="rounded-lg border border-dashed bg-white/70 px-4 py-3 text-sm text-muted-foreground">No Linked Device line foundations have been created.</p>
        )}
        {isAdmin && linkedDevice?.lines.length ? (
          <div className="space-y-3">
            {linkedDevice.lines.map((line) => (
                <div key={line.id} className="grid min-w-0 gap-4 rounded-lg border bg-white p-4 text-sm lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-start">
                <div className="min-w-0 space-y-1">
                  <p className="break-words font-medium leading-6">{line.lineName}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-muted-foreground">
                    <span className="break-words">{line.sessionState === "connected" ? (line.displayPhone ?? "Masked account appears after QR pairing") : "No WhatsApp account currently connected."}</span>
                    <span>{line.authorizedStaffCount} authorized staff</span>
                  </div>
                </div>
                <div className="flex min-w-0 max-w-[460px] flex-col items-stretch gap-2 text-xs lg:items-end">
                  <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                    <Badge variant="outline" className={`shrink-0 ${line.sessionState === "connected" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : line.sessionState === "reconnecting" ? "border-blue-300 bg-blue-50 text-blue-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{line.sessionState === "connected" ? "WhatsApp connected" : line.sessionState === "reconnecting" ? "Reconnecting…" : line.sessionState === "logged_out" ? "Not connected" : line.sessionState === "qr_ready" || line.sessionState === "waiting_for_qr" ? "Waiting for QR scan" : line.sessionState === "failed" || line.sessionState === "session_invalid" ? "Connection problem" : "Not connected"}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                    {line.adapterKind === "wppconnect_sandbox" && <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => openExistingLine(line.id, line.adapterKind, line.lineName, line.sessionState)}><Link2 className="mr-1.5 h-3.5 w-3.5" /> Open connection</Button>}
                    {(line.adapterKind === "wppconnect_in_app_sandbox" || line.adapterKind === "wppconnect_server") && <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => openExistingLine(line.id, line.adapterKind, line.lineName, line.sessionState)}><Link2 className="mr-1.5 h-3.5 w-3.5" /> {line.lifecycleState === "logged_out" || line.sessionState === "not_started" || line.sessionState === "failed" ? "Connect WhatsApp" : "Open connection"}</Button>}
                    <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => openStaffEditor(line)}><UsersRound className="mr-1.5 h-3.5 w-3.5" /> Manage staff</Button>
                    <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => openTestMode(line.id, line.lineName)}><Shield className="mr-1.5 h-3.5 w-3.5" /> Recipient permissions</Button>
                    {line.adapterKind === "wppconnect_in_app_sandbox" && line.sessionState === "connected" && <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => disconnectLine(line.id)} disabled={logoutSandbox.isPending || deleteLine.isPending}><Unplug className="mr-1.5 h-3.5 w-3.5" /> {logoutSandbox.isPending ? "Disconnecting…" : "Disconnect"}</Button>}
                    {isLinkedDeviceLineDeletable(line.lifecycleState, line.sessionState) && <Button type="button" size="sm" variant="outline" className="shrink-0 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => deleteLineFromSettings(line)} disabled={deleteLine.isPending || logoutSandbox.isPending}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> {deleteLine.isPending ? "Deleting…" : "Delete line"}</Button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <Dialog open={dialogOpen} onOpenChange={(open) => open ? setDialogOpen(true) : cancelSetup()}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Connect WhatsApp</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 text-sm">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="font-medium">Step 1 — Line name</p>
                <p className="mt-1 text-xs text-muted-foreground">Use a clear name for this WhatsApp connection. Connection and message policies remain administrator-controlled.</p>
                <Input value={createdLineId !== null ? activeLineName : linkedForm.form.lineName} onChange={(event) => linkedForm.setForm((current) => ({ ...current, lineName: event.target.value }))} placeholder="e.g. Fertiliv Main" className="mt-3 bg-background" disabled={createdLineId !== null} />
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="font-medium">Step 2 — Authorized staff</p>
                <p className="mt-1 text-xs text-muted-foreground">Only these staff members, plus administrators under the existing role model, can use this WhatsApp line.</p>
                {createdLineId !== null && (
                  <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => {
                    const line = linkedDevice?.lines.find((candidate) => candidate.id === createdLineId);
                    if (line) openStaffEditor(line);
                  }}>
                    <UsersRound className="mr-1.5 h-3.5 w-3.5" /> Edit authorized staff
                  </Button>
                )}
                <div className="mt-3 space-y-2">
                  {eligibleStaff.length === 0 ? <p className="text-xs text-muted-foreground">No eligible active staff are available.</p> : eligibleStaff.map((staff) => (
                    <label key={staff.id} className="flex items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                      <Checkbox checked={linkedForm.form.authorizedStaffIds.includes(staff.id)} onCheckedChange={(checked) => toggleStaff(staff.id, checked === true)} disabled={createdLineId !== null} />
                      <span className="min-w-0 flex-1 truncate">{staff.name || "Unnamed user"}</span>
                      <span className="text-xs text-muted-foreground">{staff.role}</span>
                    </label>
                  ))}
                </div>
              </div>

              {createdLineId === null ? (
                <Button onClick={createFoundation} disabled={createLine.isPending} className="w-full">
                  {createLine.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create line and continue
                </Button>
              ) : (
                <>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <p className="font-medium text-blue-950">Step 3 — Link Device with QR inside Fertiliv</p>
                    <p className="mt-1 text-xs leading-5 text-blue-900">Fertiliv prepares a secure, temporary connection and shows the QR code here. No separate connection page is required.</p>
                    {!sandboxActive && (
                      <Button variant="outline" className="mt-3 border-blue-300 bg-white hover:bg-blue-100" onClick={() => { setSandboxActive(true); startSandbox.mutate({ lineId: createdLineId }); }} disabled={startSandbox.isPending}>
                        {startSandbox.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Connect WhatsApp
                      </Button>
                    )}
                    {sandboxActive && (
                      <div className="mt-4 space-y-3">
                        {sandboxStatus?.qrDataUrl && (
                          <div className="rounded-lg border bg-white p-3">
                            <p className="text-xs font-medium text-blue-950">Scan this QR with WhatsApp</p>
                            <img src={sandboxStatus.qrDataUrl} alt="Temporary WhatsApp connection QR code" className="mt-3 h-64 w-64 max-w-full rounded border object-contain [image-rendering:pixelated]" />
                            <p className="mt-2 text-[11px] text-muted-foreground">Temporary QR. It refreshes automatically and is not stored by Fertiliv.</p>
                          </div>
                        )}
                        <div className="grid gap-2 text-xs sm:grid-cols-3">
                          <div className="rounded-md border bg-white p-3"><span className="text-muted-foreground">Connection</span><p className="mt-1 font-medium">{sandboxStatus?.status === "CONNECTED" && sandboxStatus.outboundReady ? "Connected" : sandboxStatus?.status === "QR_READY" ? "Waiting for QR scan" : sandboxStatus?.available && !sandboxStatus.error ? "Preparing…" : isSandboxFetching ? "Checking…" : "Connection problem"}</p></div>
                          <div className="rounded-md border bg-white p-3"><span className="text-muted-foreground">WhatsApp</span><p className="mt-1 font-medium">{sandboxStatus?.status === "CONNECTED" && sandboxStatus.outboundReady ? "Connected" : "Not connected"}</p></div>
                          <div className="rounded-md border bg-white p-3"><span className="text-muted-foreground">Status</span><p className="mt-1 font-medium">{sandboxStatus?.status === "QR_READY" && sandboxStatus.available ? "Ready to scan" : sandboxStatus?.status === "CONNECTED" ? "Ready" : "Waiting"}</p></div>
                        </div>
                        {sandboxStatus?.status === "CONNECTED" && sandboxStatus.outboundReady && sandboxStatus.identity?.accountHint
                          ? <p className="text-xs text-blue-950">Masked account: <strong>{sandboxStatus.identity.accountHint}</strong> · {sandboxStatus.identity.pushname || "no push name"} · {sandboxStatus.identity.platform || "unknown platform"}</p>
                          : sandboxStatus?.status === "CONNECTED" && sandboxStatus.outboundReady
                            ? <p className="text-xs text-muted-foreground">WhatsApp is connected. The provider did not return a display hint.</p>
                            : <p className="text-xs text-muted-foreground">No WhatsApp account currently connected.</p>}
                        {sandboxStatus?.lastActivityAt && <p className="text-xs text-muted-foreground">Last activity: {new Date(sandboxStatus.lastActivityAt).toLocaleString()}</p>}
                        {sandboxStatusError && <p className="text-xs text-red-700">WhatsApp connection status is temporarily unavailable. Please try again shortly.</p>}
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-4 text-xs leading-5 text-muted-foreground">
                    <p className="font-medium text-foreground">After scanning</p>
                    <p className="mt-1">The connection will show as Connected with a masked account identity. No patient, Lead, MRN, treatment case, or clinical record is created automatically.</p>
                  </div>
                </>
              )}

            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={staffEditorOpen} onOpenChange={(open) => open ? setStaffEditorOpen(true) : closeStaffEditor()}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Manage authorized staff{staffEditorLine ? ` — ${staffEditorLine.lineName}` : ""}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <p className="text-xs leading-5 text-muted-foreground">These permissions belong to the persistent Fertiliv line. Changing them does not disconnect WhatsApp, restart the connection service, change the QR, or modify conversations and messages.</p>
              <div className="space-y-2">
                {eligibleStaff.length === 0 ? <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No eligible active staff are available.</p> : eligibleStaff.map((staff) => (
                  <label key={staff.id} className="flex items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                    <Checkbox checked={staffEditorForm.form.authorizedStaffIds.includes(staff.id)} onCheckedChange={(checked) => toggleEditorStaff(staff.id, checked === true)} disabled={updateLineStaff.isPending} />
                    <span className="min-w-0 flex-1 truncate">{staff.name || "Unnamed user"}</span>
                    <span className="text-xs text-muted-foreground">{staff.role}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">At least one authorized staff member is required. Administrators retain access under the existing role model.</p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeStaffEditor} disabled={updateLineStaff.isPending}>Cancel</Button>
                <Button type="button" onClick={saveStaffEditor} disabled={!staffEditorLine || updateLineStaff.isPending || !staffEditorDirty}>
                  {updateLineStaff.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save changes
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        {testRecipientLine && <ControlledTestRecipientsDialog open={testRecipientsOpen} onOpenChange={setTestRecipientsOpen} lineId={testRecipientLine.id} lineName={testRecipientLine.name} />}
      </CardContent>
    </Card>
  );
}

// ─── Clinic Info Tab ──────────────────────────────────────────────────────────

type LogoVariant = "en_light" | "en_dark" | "ar_light" | "ar_dark";

const LOGO_VARIANTS: { key: LogoVariant; label: string; desc: string }[] = [
  { key: "en_light", label: "EN/TR — Light Background", desc: "Used on white/light documents (invoices, proposals)" },
  { key: "en_dark", label: "EN/TR — Dark Background", desc: "Used on dark/colored backgrounds and email headers" },
  { key: "ar_light", label: "AR — Light Background", desc: "Used on Arabic light documents" },
  { key: "ar_dark", label: "AR — Dark Background", desc: "Used on Arabic dark/colored backgrounds" },
];

const LANG_TABS = [
  { key: "en", label: "English" },
  { key: "ar", label: "Arabic" },
  { key: "tr", label: "Turkish" },
] as const;

type LangKey = "en" | "ar" | "tr";

function LogoUploadCard({
  variant,
  label,
  desc,
  currentKey,
  onUploaded,
}: {
  variant: LogoVariant;
  label: string;
  desc: string;
  currentKey?: string | null;
  onUploaded: (key: string, url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadLogo = trpc.clinicInfo.uploadLogo.useMutation({
    onSuccess: (data) => {
      toast.success("Logo uploaded");
      onUploaded(data.key, data.url);
    },
    onError: (e) => toast.error("Upload failed: " + e.message),
  });

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadLogo.mutate({ variant, fileBase64: base64, fileName: file.name, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
        {currentKey && (
          <Badge variant="secondary" className="text-xs shrink-0">Uploaded</Badge>
        )}
      </div>
      {currentKey && (
        <div className="rounded border bg-muted/30 p-2 flex items-center justify-center h-20">
          <img src={`/manus-storage/${currentKey}`} alt={label} className="max-h-16 max-w-full object-contain" />
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      <Button size="sm" variant="outline" className="w-full gap-1 text-xs" onClick={() => fileRef.current?.click()} disabled={uploadLogo.isPending}>
        {uploadLogo.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        {currentKey ? "Replace Logo" : "Upload Logo"}
      </Button>
    </div>
  );
}

function StampUploadCard({ currentKey, onUploaded }: { currentKey?: string | null; onUploaded: (key: string, url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadStamp = trpc.clinicInfo.uploadStamp.useMutation({
    onSuccess: (data) => { toast.success("Stamp uploaded"); onUploaded(data.key, data.url); },
    onError: (e) => toast.error("Upload failed: " + e.message),
  });

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadStamp.mutate({ fileBase64: base64, fileName: file.name, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div>
        <p className="text-sm font-medium">Invoice / Proposal Stamp</p>
        <p className="text-xs text-muted-foreground">Official stamp or seal placed on finance documents alongside the logo</p>
      </div>
      {currentKey && (
        <div className="rounded border bg-muted/30 p-2 flex items-center justify-center h-20">
          <img src={`/manus-storage/${currentKey}`} alt="Stamp" className="max-h-16 max-w-full object-contain" />
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      <Button size="sm" variant="outline" className="w-full gap-1 text-xs" onClick={() => fileRef.current?.click()} disabled={uploadStamp.isPending}>
        {uploadStamp.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        {currentKey ? "Replace Stamp" : "Upload Stamp"}
      </Button>
    </div>
  );
}

const CLINIC_INFO_EMPTY = {
  nameEn: "", nameAr: "", nameTr: "",
  sloganEn: "", sloganAr: "", sloganTr: "",
  addressEn: "", addressAr: "", addressTr: "",
  bioEn: "", bioAr: "", bioTr: "",
  email: "", whatsapp: "", website: "", mapsLink: "",
};

function ClinicInfoTab() {
  const { data: info, isLoading, refetch } = trpc.clinicInfo.get.useQuery();

  const { form, setForm, hasDraft, clearDraft, initFromServer } = useDraftForm({
    key: "draft_clinic_info",
    initialData: CLINIC_INFO_EMPTY,
  });

  const save = trpc.clinicInfo.save.useMutation({
    onSuccess: () => {
      toast.success("Clinic information saved");
      clearDraft();
      refetch();
    },
    onError: (e) => toast.error("Save failed: " + e.message),
  });

  const [lang, setLang] = useState<LangKey>("en");
  const [logoKeys, setLogoKeys] = useState<Record<LogoVariant, string | null>>({ en_light: null, en_dark: null, ar_light: null, ar_dark: null });
  const [stampKey, setStampKey] = useState<string | null>(null);

  // Determine if form is dirty compared to saved server data
  const isDirty = info ? (
    form.nameEn !== (info.nameEn ?? "") ||
    form.nameAr !== (info.nameAr ?? "") ||
    form.nameTr !== (info.nameTr ?? "") ||
    form.sloganEn !== (info.sloganEn ?? "") ||
    form.sloganAr !== (info.sloganAr ?? "") ||
    form.sloganTr !== (info.sloganTr ?? "") ||
    form.addressEn !== (info.addressEn ?? "") ||
    form.addressAr !== (info.addressAr ?? "") ||
    form.addressTr !== (info.addressTr ?? "") ||
    form.bioEn !== (info.bioEn ?? "") ||
    form.bioAr !== (info.bioAr ?? "") ||
    form.bioTr !== (info.bioTr ?? "") ||
    form.email !== (info.email ?? "") ||
    form.whatsapp !== (info.whatsapp ?? "") ||
    form.website !== (info.website ?? "") ||
    form.mapsLink !== (info.mapsLink ?? "")
  ) : hasDraft;

  useBeforeUnload(isDirty);

  useEffect(() => {
    if (!info) return;
    // Only initialise from server if no draft is present (draft takes priority)
    if (!hasDraft) {
      initFromServer({
        nameEn: info.nameEn ?? "",
        nameAr: info.nameAr ?? "",
        nameTr: info.nameTr ?? "",
        sloganEn: info.sloganEn ?? "",
        sloganAr: info.sloganAr ?? "",
        sloganTr: info.sloganTr ?? "",
        addressEn: info.addressEn ?? "",
        addressAr: info.addressAr ?? "",
        addressTr: info.addressTr ?? "",
        bioEn: info.bioEn ?? "",
        bioAr: info.bioAr ?? "",
        bioTr: info.bioTr ?? "",
        email: info.email ?? "",
        whatsapp: info.whatsapp ?? "",
        website: info.website ?? "",
        mapsLink: info.mapsLink ?? "",
      });
    }
    setLogoKeys({
      en_light: info.logoEnLightKey ?? null,
      en_dark: info.logoEnDarkKey ?? null,
      ar_light: info.logoArLightKey ?? null,
      ar_dark: info.logoArDarkKey ?? null,
    });
    setStampKey(info.stampKey ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info]);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const waLink = form.whatsapp ? `https://wa.me/${form.whatsapp.replace(/\D/g, "")}` : null;

  if (isLoading) return <div className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading clinic information…</div>;

  return (
    <div className="space-y-6">
      {/* ── Multilingual text fields ── */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Clinic Identity</h3>
          </div>

          {/* Language tabs */}
          <div className="flex gap-1 border-b pb-2">
            {LANG_TABS.map(l => (
              <button key={l.key} onClick={() => setLang(l.key)}
                className={`px-3 py-1 text-sm rounded-t font-medium transition-colors ${lang === l.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {l.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Clinic Name ({lang.toUpperCase()})</Label>
              <Input value={form[`name${lang.charAt(0).toUpperCase() + lang.slice(1)}` as keyof typeof form]} onChange={set(`name${lang.charAt(0).toUpperCase() + lang.slice(1)}` as keyof typeof form)} placeholder={`Clinic name in ${lang === "en" ? "English" : lang === "ar" ? "Arabic" : "Turkish"}`} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Slogan / Tagline ({lang.toUpperCase()})</Label>
              <Input value={form[`slogan${lang.charAt(0).toUpperCase() + lang.slice(1)}` as keyof typeof form]} onChange={set(`slogan${lang.charAt(0).toUpperCase() + lang.slice(1)}` as keyof typeof form)} placeholder="e.g. Your journey to parenthood starts here" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Full Address ({lang.toUpperCase()})</Label>
              <Textarea value={form[`address${lang.charAt(0).toUpperCase() + lang.slice(1)}` as keyof typeof form]} onChange={set(`address${lang.charAt(0).toUpperCase() + lang.slice(1)}` as keyof typeof form)} placeholder="Full clinic address" rows={2} className="mt-1 resize-none" />
            </div>
            <div>
              <Label className="text-xs">Clinic Bio / Description ({lang.toUpperCase()})</Label>
              <Textarea value={form[`bio${lang.charAt(0).toUpperCase() + lang.slice(1)}` as keyof typeof form]} onChange={set(`bio${lang.charAt(0).toUpperCase() + lang.slice(1)}` as keyof typeof form)} placeholder="Short description of the clinic" rows={3} className="mt-1 resize-none" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Contact details ── */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Contact Details</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> Email Address</Label>
              <Input value={form.email} onChange={set("email")} type="email" placeholder="info@clinic.com" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> WhatsApp Number</Label>
              <Input value={form.whatsapp} onChange={set("whatsapp")} placeholder="+905011147060" className="mt-1" />
              {waLink && (
                <a href={waLink} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 hover:underline mt-1 flex items-center gap-1">
                  <Globe className="h-3 w-3" /> {waLink}
                </a>
              )}
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Globe className="h-3 w-3" /> Website URL</Label>
              <Input value={form.website} onChange={set("website")} placeholder="https://fertiliv.com" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3" /> Google Maps Link</Label>
              <Input value={form.mapsLink} onChange={set("mapsLink")} placeholder="https://maps.google.com/..." className="mt-1" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Logo variants ── */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Image className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Logo Variants</h3>
            <span className="text-xs text-muted-foreground ml-1">— auto-selected based on document language and background</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {LOGO_VARIANTS.map(v => (
              <LogoUploadCard
                key={v.key}
                variant={v.key}
                label={v.label}
                desc={v.desc}
                currentKey={logoKeys[v.key]}
                onUploaded={(key) => { setLogoKeys(prev => ({ ...prev, [v.key]: key })); refetch(); }}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Stamp ── */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Document Stamp</h3>
          </div>
          <div className="max-w-sm">
            <StampUploadCard
              currentKey={stampKey}
              onUploaded={(key) => { setStampKey(key); refetch(); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Unsaved draft banner ── */}
      {hasDraft && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-2.5 flex items-center justify-between gap-3">
          <span className="text-sm text-amber-800 dark:text-amber-300">You have unsaved changes. Save to keep them or discard to revert.</span>
          <Button size="sm" variant="outline" className="text-xs shrink-0" onClick={() => {
            clearDraft();
            if (info) initFromServer({
              nameEn: info.nameEn ?? "", nameAr: info.nameAr ?? "", nameTr: info.nameTr ?? "",
              sloganEn: info.sloganEn ?? "", sloganAr: info.sloganAr ?? "", sloganTr: info.sloganTr ?? "",
              addressEn: info.addressEn ?? "", addressAr: info.addressAr ?? "", addressTr: info.addressTr ?? "",
              bioEn: info.bioEn ?? "", bioAr: info.bioAr ?? "", bioTr: info.bioTr ?? "",
              email: info.email ?? "", whatsapp: info.whatsapp ?? "", website: info.website ?? "", mapsLink: info.mapsLink ?? "",
            });
          }}>Discard</Button>
        </div>
      )}

      {/* ── Save button ── */}
      <div className="flex justify-end">
        <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="gap-2">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Clinic Information
        </Button>
      </div>
    </div>
  );
}

// ─── Dropdown Options Tab ─────────────────────────────────────────────────────

// Human-readable labels for each fieldKey
const FIELD_KEY_LABELS: Record<string, string> = {
  main_medical_interest: "Main Medical Interest",
  female_fertility_diagnosis: "Female Fertility Diagnosis",
  male_fertility_diagnosis: "Male Fertility Diagnosis",
  lead_source: "Lead Source / Referral",
  ivf_experience: "IVF Experience",
  patient_status: "Patient Status",
  treatment_type: "Treatment Type",
  interest_level: "Interest Level",
};

type DropdownOption = {
  id: number;
  fieldKey: string;
  label: string;
  value: string;
  sortOrder: number;
  isActive: boolean | null;
  groupLabel?: string | null;
};

// Edit dialog for a single option (label + group)
function EditOptionDialog({
  opt,
  onSave,
  onClose,
  isPending,
  existingGroups,
}: {
  opt: DropdownOption;
  onSave: (id: number, label: string, groupLabel: string | null) => void;
  onClose: () => void;
  isPending: boolean;
  existingGroups: string[];
}) {
  const [label, setLabel] = useState(opt.label);
  const [group, setGroup] = useState(opt.groupLabel ?? "");
  const [customGroup, setCustomGroup] = useState("");
  const isCustom = group === "__custom__";
  const effectiveGroup = isCustom ? customGroup.trim() : group.trim();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Option</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label className="text-xs">Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 text-sm" autoFocus />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Group (section header)</Label>
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              className="w-full h-8 text-sm border rounded-md px-2 bg-background"
            >
              <option value="">— No group (ungrouped) —</option>
              {existingGroups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
              <option value="__custom__">+ Create new group…</option>
            </select>
            {isCustom && (
              <Input
                value={customGroup}
                onChange={(e) => setCustomGroup(e.target.value)}
                placeholder="New group name (e.g. Sperm Parameters)"
                className="h-8 text-sm mt-1"
              />
            )}
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => onSave(opt.id, label.trim(), effectiveGroup || null)}
              disabled={isPending || !label.trim()}
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldOptionsPanel({ fieldKey }: { fieldKey: string }) {
  const utils = trpc.useUtils();
  const { data: options, isLoading } = trpc.dropdownOptions.list.useQuery({ fieldKey });
  const [newLabel, setNewLabel] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [newCustomGroup, setNewCustomGroup] = useState("");
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [editItem, setEditItem] = useState<DropdownOption | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);

  // Collect all unique existing group labels
  const existingGroups = Array.from(
    new Set((options ?? []).map((o) => o.groupLabel).filter(Boolean) as string[])
  ).sort();

  const createOpt = trpc.dropdownOptions.create.useMutation({
    onSuccess: () => {
      toast.success("Option added");
      setNewLabel("");
      setNewGroup("");
      setNewCustomGroup("");
      utils.dropdownOptions.list.invalidate({ fieldKey });
    },
    onError: (e) => toast.error(e.message || "Failed to add option"),
  });

  const updateOpt = trpc.dropdownOptions.update.useMutation({
    onSuccess: () => {
      toast.success("Option updated");
      setEditItem(null);
      utils.dropdownOptions.list.invalidate({ fieldKey });
    },
    onError: (e) => toast.error(e.message || "Failed to update option"),
  });

  const deleteOpt = trpc.dropdownOptions.delete.useMutation({
    onSuccess: () => {
      toast.success("Option deleted");
      utils.dropdownOptions.list.invalidate({ fieldKey });
    },
    onError: (e) => toast.error(e.message || "Failed to delete option"),
  });

  const reorderOpt = trpc.dropdownOptions.reorder.useMutation({
    onSuccess: () => utils.dropdownOptions.list.invalidate({ fieldKey }),
    onError: (e) => toast.error(e.message || "Failed to reorder"),
  });

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) return toast.error("Label is required");
    const value = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const effectiveGroup = newGroup === "__custom__" ? newCustomGroup.trim() : newGroup.trim();
    createOpt.mutate({ fieldKey, label, value, groupLabel: effectiveGroup || undefined });
  };

  const handleToggleActive = (opt: DropdownOption) => {
    updateOpt.mutate({ id: opt.id, isActive: !opt.isActive });
  };

  const handleDragEnd = (e: React.DragEvent, targetId: number) => {
    if (dragId === null || dragId === targetId || !options) return;
    const items = [...options];
    const fromIdx = items.findIndex((o) => o.id === dragId);
    const toIdx = items.findIndex((o) => o.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...items];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const updates = reordered.map((o, i) => ({ id: o.id, sortOrder: i + 1 }));
    reorderOpt.mutate(updates);
    setDragId(null);
  };

  // Group options by groupLabel for display
  const grouped: { groupLabel: string | null; items: DropdownOption[] }[] = [];
  if (options) {
    const seen = new Map<string, DropdownOption[]>();
    for (const opt of options) {
      const key = opt.groupLabel ?? "";
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key)!.push(opt);
    }
    // Ungrouped first, then named groups in order of first appearance
    const ungrouped = seen.get("");
    if (ungrouped?.length) grouped.push({ groupLabel: null, items: ungrouped });
    for (const [k, v] of Array.from(seen.entries())) {
      if (k !== "") grouped.push({ groupLabel: k, items: v });
    }
  }

  return (
    <div className="space-y-3">
      {/* Add new option form */}
      <div className="space-y-2 bg-muted/30 rounded-md p-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add New Option</p>
        <div className="flex gap-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Option label (e.g. IVF, ICSI, Egg Donation…)"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="h-8 text-sm"
          />
          <Button size="sm" className="h-8 gap-1.5 shrink-0" onClick={() => setShowAddGroup((v) => !v)} variant="outline" title="Set group for new option">
            <List className="h-3.5 w-3.5" />
            Group
          </Button>
        </div>
        {showAddGroup && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Assign to group</Label>
            <select
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              className="w-full h-8 text-sm border rounded-md px-2 bg-background"
            >
              <option value="">— No group (ungrouped) —</option>
              {existingGroups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
              <option value="__custom__">+ Create new group…</option>
            </select>
            {newGroup === "__custom__" && (
              <Input
                value={newCustomGroup}
                onChange={(e) => setNewCustomGroup(e.target.value)}
                placeholder="New group name (e.g. Sperm Parameters)"
                className="h-8 text-sm"
              />
            )}
          </div>
        )}
        <Button size="sm" className="h-8 gap-1.5" onClick={handleAdd} disabled={createOpt.isPending}>
          {createOpt.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add Option
        </Button>
      </div>

      {/* Options list — grouped */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading options...
        </div>
      ) : !options || options.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No options yet. Add one above.</p>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ groupLabel: gl, items }) => (
            <div key={gl ?? "__ungrouped__"}>
              {gl ? (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-primary uppercase tracking-wide">{gl}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              ) : existingGroups.length > 0 ? (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ungrouped</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              ) : null}
              <div className="space-y-1">
                {items.map((opt) => (
                  <div
                    key={opt.id}
                    draggable
                    onDragStart={() => setDragId(opt.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDragEnd(e, opt.id)}
                    className={`flex items-center gap-2 rounded-md border px-2 py-1.5 bg-card transition-opacity ${!opt.isActive ? "opacity-50" : ""} ${dragId === opt.id ? "opacity-30" : ""}`}
                  >
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab shrink-0" />
                    <span className="text-sm flex-1">{opt.label}</span>
                    {opt.groupLabel && (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded hidden sm:inline">{opt.groupLabel}</span>
                    )}
                    <span className="text-xs text-muted-foreground font-mono hidden md:inline">{opt.value}</span>
                    <button
                      className={`text-xs px-1.5 py-0.5 rounded border transition-colors shrink-0 ${opt.isActive ? "border-green-500/40 text-green-600 bg-green-50 dark:bg-green-950/30" : "border-muted text-muted-foreground"}`}
                      onClick={() => handleToggleActive(opt)}
                      title={opt.isActive ? "Click to disable" : "Click to enable"}
                    >
                      {opt.isActive ? "Active" : "Hidden"}
                    </button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setEditItem(opt)}>
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => { if (confirm(`Delete "${opt.label}"?`)) deleteOpt.mutate({ id: opt.id }); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      {editItem && (
        <EditOptionDialog
          opt={editItem}
          existingGroups={existingGroups}
          isPending={updateOpt.isPending}
          onClose={() => setEditItem(null)}
          onSave={(id, label, groupLabel) => updateOpt.mutate({ id, label, groupLabel })}
        />
      )}
    </div>
  );
}

function DropdownOptionsTab() {
  const { data: fieldKeys, isLoading } = trpc.dropdownOptions.listFieldKeys.useQuery();
  const [expandedKey, setExpandedKey] = useState<string | null>("main_medical_interest");

  const displayKeys = fieldKeys ?? Object.keys(FIELD_KEY_LABELS);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Field Options Manager</p>
        <p className="text-xs text-muted-foreground">
          Add, edit, reorder, or hide options for dropdown fields used across the system (patient forms, CRM, etc.).
          Drag rows to reorder. Toggle Active/Hidden to show or hide an option without deleting it.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {displayKeys.map((key) => {
            const label = FIELD_KEY_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            const isOpen = expandedKey === key;
            return (
              <Card key={key} className="border">
                <CardContent className="p-0">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                    onClick={() => setExpandedKey(isOpen ? null : key)}
                  >
                    <List className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium flex-1">{label}</span>
                    <span className="text-xs text-muted-foreground font-mono mr-2">{key}</span>
                    {isOpen
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 border-t">
                      <FieldOptionsPanel fieldKey={key} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
