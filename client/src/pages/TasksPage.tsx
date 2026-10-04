import TaskTagManager from "@/components/TaskTagManager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CalendarRange,
  CheckSquare,
  Clock,
  Filter,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  User,
  UserCheck,
  X,
} from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

const TASK_TYPE_LABELS: Record<string, string> = {
  callback_request: "Callback Request",
  follow_up: "Follow-up",
  send_info: "Send Info",
  consultation_request: "Consultation Request",
  other: "Other",
};

const TASK_COMM_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  phone_call: "Phone Call",
  video_call: "Video Call",
  email: "Email",
  in_person: "In Person",
};

const TASK_PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-red-100 text-red-700",
};

const emptyForm = {
  title: "",
  type: "follow_up" as const,
  priority: "medium" as const,
  dueDate: "",
  dueTime: "",
  communicationMethod: "" as any,
  notes: "",
  assignedToId: "" as any,
  patientId: undefined as number | undefined,
  leadId: undefined as number | undefined,
  tags: [] as string[],
};

type StatusFilter = "open" | "in_progress" | "done" | "deferred" | "all";

// ─── Stable sub-components ───────────────────────────────────────────────────

interface TaskFormProps {
  form: typeof emptyForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  staffUsers: any[];
  patients?: any[];
  leads?: any[];
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isPending: boolean;
  submitLabel: string;
  isDoctor?: boolean;
}

function SearchableEntitySelect({ label, value, onChange, items, getLabel, placeholder }: {
  label: string;
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  items: any[];
  getLabel: (item: any) => string;
  placeholder: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = value ? items.find(i => i.id === value) : null;
  const filtered = items.filter(i => getLabel(i).toLowerCase().includes(search.toLowerCase())).slice(0, 20);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
  return (
    <div ref={ref} className="relative">
      <Label className="text-xs">{label}</Label>
      <div
        className="mt-1 h-9 text-xs border rounded-md px-2.5 flex items-center justify-between cursor-pointer bg-background hover:border-primary/60 transition-colors"
        onClick={() => { setOpen(o => !o); setSearch(""); }}
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected ? getLabel(selected) : placeholder}
        </span>
        {selected && (
          <button type="button" className="ml-1 text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); onChange(undefined); }}>
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md">
          <div className="p-1.5 border-b">
            <Input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="h-7 text-xs"
            />
          </div>
          <div className="max-h-44 overflow-y-auto">
            <button
              type="button"
              className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-accent transition-colors text-muted-foreground"
              onClick={() => { onChange(undefined); setOpen(false); }}
            >— None —</button>
            {filtered.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-muted-foreground">No results</p>
            ) : filtered.map(item => (
              <button
                key={item.id}
                type="button"
                className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-accent transition-colors ${
                  item.id === value ? "bg-primary/10 font-medium" : ""
                }`}
                onClick={() => { onChange(item.id); setOpen(false); }}
              >{getLabel(item)}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskForm({ form, setForm, staffUsers, patients = [], leads = [], onSubmit, onCancel, isPending, submitLabel, isDoctor }: TaskFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-2.5">
      <div>
        <Label className="text-xs">Title *</Label>
        <Input
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Follow up with patient about IVF"
          className="h-9 text-sm mt-1"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
            <SelectTrigger className="h-9 text-xs mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TASK_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Priority</Label>
          <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as any }))}>
            <SelectTrigger className="h-9 text-xs mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-foreground">Due Date <span className="text-red-500">*</span></Label>
          <Input type="date" value={form.dueDate} min={new Date().toISOString().slice(0, 10)} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className="h-9 text-xs mt-1" required />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Due Time</Label>
          <Input type="time" value={form.dueTime} onChange={e => setForm(f => ({ ...f, dueTime: e.target.value }))} className="h-9 text-xs mt-1" />
        </div>
      </div>
      <div className={`grid gap-2 ${isDoctor ? "grid-cols-1" : "grid-cols-2"}`}>
        <div>
          <Label className="text-xs">Via</Label>
          <Select value={form.communicationMethod || "_none"} onValueChange={v => setForm(f => ({ ...f, communicationMethod: v === "_none" ? "" : v }))}>
            <SelectTrigger className="h-9 text-xs mt-1"><SelectValue placeholder="— None —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— None —</SelectItem>
              {Object.entries(TASK_COMM_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!isDoctor && (
          <div>
            <Label className="text-xs">Assign To</Label>
            <Select value={form.assignedToId?.toString() || "_unassigned"} onValueChange={v => setForm(f => ({ ...f, assignedToId: v === "_unassigned" ? "" : v }))}>
              <SelectTrigger className="h-9 text-xs mt-1"><SelectValue placeholder="— Unassigned —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_unassigned">— Unassigned —</SelectItem>
                {staffUsers.map((u: any) => (
                  <SelectItem key={u.id} value={u.id.toString()}>{u.name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div>
        <Label className="text-xs">Notes</Label>
        <Textarea
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          placeholder="Additional notes..."
          className="text-sm mt-1 min-h-[60px] resize-none"
        />
      </div>
      <div>
        <Label className="text-xs">Tags</Label>
        <div className="mt-1">
          <TaskTagManager
            selectedTags={form.tags}
            onChange={tags => setForm(f => ({ ...f, tags }))}
          />
        </div>
      </div>
      {/* Patient / Lead assignment */}
      <div className={`grid gap-2 ${isDoctor ? "grid-cols-1" : "grid-cols-2"}`}>
        <SearchableEntitySelect
          label="Link to Patient"
          value={form.patientId}
          onChange={id => setForm(f => ({ ...f, patientId: id, leadId: id ? undefined : f.leadId }))}
          items={patients}
          getLabel={p => `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || p.mrn || `#${p.id}`}
          placeholder="— No patient —"
        />
        {!isDoctor && (
          <SearchableEntitySelect
            label="Link to Lead"
            value={form.leadId}
            onChange={id => setForm(f => ({ ...f, leadId: id, patientId: id ? undefined : f.patientId }))}
            items={leads}
            getLabel={l => `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim() || l.email || `#${l.id}`}
            placeholder="— No lead —"
          />
        )}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ─── Quick-select shortcut helpers ───────────────────────────────────────────

function getToday() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(n: number) {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}
function getMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function getMonthEnd() {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().slice(0, 10);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "manager";
  const isDoctor = user?.role === "doctor";
  const utils = trpc.useUtils();

  // Date range filter (empty = no filter)
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [createForm, setCreateForm] = useState({ ...emptyForm });
  const [editForm, setEditForm] = useState({ ...emptyForm });
  const [search, setSearch] = useState("");

  const today = getToday();

  // Quick-select shortcuts
  type Shortcut = "today" | "next-week" | "last-week" | "overdue" | "last-month" | "last-2-months" | "all";
  const [activeShortcut, setActiveShortcut] = useState<Shortcut>("today");

  function applyShortcut(s: Shortcut) {
    setActiveShortcut(s);
    if (s === "today") { setDateFrom(today); setDateTo(today); }
    else if (s === "next-week") { setDateFrom(today); setDateTo(addDays(7)); }
    else if (s === "last-week") { setDateFrom(addDays(-7)); setDateTo(addDays(-1)); }
    else if (s === "overdue") { setDateFrom(""); setDateTo(addDays(-1)); }
    else if (s === "last-month") { setDateFrom(addDays(-30)); setDateTo(today); }
    else if (s === "last-2-months") { setDateFrom(addDays(-60)); setDateTo(today); }
    else { setDateFrom(""); setDateTo(""); }
  }

  // Apply today filter on first mount
  useEffect(() => { setDateFrom(today); setDateTo(today); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When user manually changes a date input, clear the active shortcut
  function handleDateFromChange(v: string) {
    setDateFrom(v);
    setActiveShortcut("all");
  }
  function handleDateToChange(v: string) {
    setDateTo(v);
    setActiveShortcut("all");
  }

  const queryFilters = useMemo(() => {
    const f: any = {};
    if (statusFilter !== "all") f.status = statusFilter;
    if (typeFilter !== "all") f.type = typeFilter;
    // Doctors: server handles scoping via scopedToUserId; no client-side assignedToId filter needed
    if (!isAdmin && !isDoctor && user?.id) f.assignedToId = user.id;
    else if (isAdmin && assigneeFilter !== "all") f.assignedToId = Number(assigneeFilter);
    if (dateFrom) f.dueDateFrom = dateFrom;
    if (dateTo) f.dueDateTo = dateTo;
    return f;
  }, [dateFrom, dateTo, statusFilter, typeFilter, assigneeFilter, isAdmin, isDoctor, user?.id]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Reset to page 1 when any filter changes
  useEffect(() => { setPage(1); }, [statusFilter, typeFilter, assigneeFilter, dateFrom, dateTo, search]);

  const { data: tasksResult, isLoading } = trpc.tasks.list.useQuery({ ...queryFilters, page, pageSize });
  const allTasks = tasksResult?.data ?? [];
  const tasksTotal = tasksResult?.total ?? 0;
  const tasksTotalPages = tasksResult?.totalPages ?? 1;
  const { data: staffUsers = [] } = trpc.users.listStaff.useQuery();
  const { data: patientsResult } = trpc.patients.list.useQuery({ pageSize: 1000 });
  const allPatients = (patientsResult as any)?.data ?? [];
  const { data: leadsResult2 } = trpc.leads.list.useQuery({ pageSize: 1000 }, { enabled: !isDoctor });
  const allLeads = (leadsResult2 as any)?.data ?? [];

  // Counts for shortcut badges (always from open tasks, no date filter — use large pageSize to get all)
  const { data: openTasksResult } = trpc.tasks.list.useQuery(
    isAdmin ? { status: "open", pageSize: 1000 } : isDoctor ? { status: "open", pageSize: 1000 } : { status: "open", assignedToId: user?.id, pageSize: 1000 },
    { enabled: !!user }
  );
  const allOpenTasks = openTasksResult?.data ?? [];
  const overdueCount = allOpenTasks.filter((t: any) => t.dueDate && t.dueDate < today).length;
  const todayCount = allOpenTasks.filter((t: any) => t.dueDate === today).length;
  const nextWeekCount = allOpenTasks.filter((t: any) => t.dueDate && t.dueDate >= today && t.dueDate <= addDays(7)).length;
  const lastWeekCount = allOpenTasks.filter((t: any) => t.dueDate && t.dueDate >= addDays(-7) && t.dueDate < today).length;
  const lastMonthCount = allOpenTasks.filter((t: any) => t.dueDate && t.dueDate >= addDays(-30) && t.dueDate <= today).length;
  const last2MonthsCount = allOpenTasks.filter((t: any) => t.dueDate && t.dueDate >= addDays(-60) && t.dueDate <= today).length;

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("Task created");
      setShowCreate(false);
      setCreateForm({ ...emptyForm });
      utils.tasks.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to create task"),
  });

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      toast.success("Task updated");
      setEditingTask(null);
      utils.tasks.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to update task"),
  });

  const updateStatusInline = trpc.tasks.update.useMutation({
    onSuccess: () => utils.tasks.list.invalidate(),
    onError: (e) => toast.error(e.message || "Failed to update task"),
  });

  const closeTask = trpc.tasks.close.useMutation({
    onSuccess: () => { toast.success("Task marked as done"); utils.tasks.list.invalidate(); },
    onError: (e) => toast.error(e.message || "Failed to close task"),
  });

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => { toast.success("Task deleted"); utils.tasks.list.invalidate(); },
    onError: (e) => toast.error(e.message || "Failed to delete task"),
  });
  // Bulk selection
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [showBulkPriority, setShowBulkPriority] = useState(false);
  const [bulkAssignId, setBulkAssignId] = useState("_none");
  const [bulkTaskStatus, setBulkTaskStatus] = useState("_none");
  const [bulkPriority, setBulkPriority] = useState("_none");
  const bulkUpdateTasks = (trpc as any).tasks.bulkUpdate.useMutation({
    onSuccess: (res: any) => {
      toast.success(`Updated ${res.updated} task${res.updated !== 1 ? "s" : ""}`);
      setSelectedTaskIds(new Set());
      setShowBulkAssign(false); setShowBulkStatus(false); setShowBulkPriority(false);
      setBulkAssignId("_none"); setBulkTaskStatus("_none"); setBulkPriority("_none");
      utils.tasks.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const bulkDeleteTasks = (trpc as any).tasks.bulkDelete.useMutation({
    onSuccess: (res: any) => {
      toast.success(`Deleted ${res.deleted} task${res.deleted !== 1 ? "s" : ""}`);
      setSelectedTaskIds(new Set());
      utils.tasks.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const tasks = useMemo(() => {
    if (!search.trim()) return allTasks as any[];
    const q = search.toLowerCase();
    return (allTasks as any[]).filter((t: any) =>
      t.title?.toLowerCase().includes(q) ||
      t.notes?.toLowerCase().includes(q) ||
      t.assignedToName?.toLowerCase().includes(q)
    );
  }, [allTasks, search]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createTask.mutate({
      ...createForm,
      assignedToId: createForm.assignedToId ? Number(createForm.assignedToId) : undefined,
      communicationMethod: createForm.communicationMethod || undefined,
      dueDate: createForm.dueDate || undefined,
      dueTime: createForm.dueTime || undefined,
      notes: createForm.notes || undefined,
      patientId: createForm.patientId ?? undefined,
      leadId: createForm.leadId ?? undefined,
      tags: createForm.tags.length > 0 ? createForm.tags.join(",") : undefined,
    });
  }

  function openEdit(task: any) {
    setEditForm({
      title: task.title || "",
      type: task.type || "follow_up",
      priority: task.priority || "medium",
      dueDate: task.dueDate || "",
      dueTime: task.dueTime || "",
      communicationMethod: task.communicationMethod || "",
      notes: task.notes || "",
      assignedToId: task.assignedToId?.toString() || "",
      patientId: task.patientId ?? undefined,
      leadId: task.leadId ?? undefined,
      tags: task.tags ? (typeof task.tags === "string" ? task.tags.split(",").filter(Boolean) : task.tags) : [],
    });
    setEditingTask(task);
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTask) return;
    updateTask.mutate({
      id: editingTask.id,
      title: editForm.title,
      type: editForm.type,
      priority: editForm.priority,
      dueDate: editForm.dueDate || undefined,
      dueTime: editForm.dueTime || undefined,
      communicationMethod: editForm.communicationMethod || undefined,
      notes: editForm.notes || undefined,
      assignedToId: editForm.assignedToId ? Number(editForm.assignedToId) : undefined,
      patientId: editForm.patientId ?? undefined,
      leadId: editForm.leadId ?? undefined,
      tags: editForm.tags.length > 0 ? editForm.tags.join(",") : undefined,
    });
  }

  const shortcuts: { id: Shortcut; label: string; count?: number; danger?: boolean }[] = [
    { id: "today", label: "Today", count: todayCount },
    { id: "next-week", label: "Next Week", count: nextWeekCount },
    { id: "last-week", label: "Last Week", count: lastWeekCount, danger: true },
    { id: "overdue", label: "Overdue", count: overdueCount, danger: true },
    { id: "last-month", label: "Last Month", count: lastMonthCount, danger: true },
    { id: "last-2-months", label: "Last 2 Months", count: last2MonthsCount, danger: true },
    { id: "all", label: "All" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "All staff tasks" : "Your assigned tasks"}
          </p>
        </div>
        <Button size="sm" onClick={() => { setShowCreate(true); setEditingTask(null); }} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Task
        </Button>
      </div>

      {/* Date Range Filter Card */}
      <Card className="border border-border/60">
        <CardContent className="px-4 py-3 space-y-3">
          {/* Date inputs — always side by side */}
          <div className="flex items-end gap-2">
            <CalendarRange className="h-4 w-4 text-muted-foreground shrink-0 mb-2" />
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => handleDateFromChange(e.target.value)}
                className="h-9 text-sm w-full"
              />
            </div>
            <span className="text-muted-foreground text-sm mb-2 shrink-0">→</span>
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => handleDateToChange(e.target.value)}
                className="h-9 text-sm w-full"
              />
            </div>
            {(dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground shrink-0 mb-0"
                onClick={() => { setDateFrom(""); setDateTo(""); setActiveShortcut("all"); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* Quick-select shortcuts */}
          <div className="flex flex-wrap gap-1.5">
            {shortcuts.map(s => (
              <button
                key={s.id}
                onClick={() => applyShortcut(s.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 border ${
                  activeShortcut === s.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {s.label}
                {s.count != null && s.count > 0 && (
                  <span className={`text-xs px-1 py-0 rounded font-bold ${
                    activeShortcut === s.id
                      ? "bg-white/20 text-primary-foreground"
                      : s.danger ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                  }`}>
                    {s.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters Row */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Search tasks..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 text-sm w-44"
        />
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="deferred">Deferred / Delayed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 text-xs w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(TASK_TYPE_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && (
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-8 text-xs w-40">
              <SelectValue placeholder="All Assignees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              {staffUsers.map((u: any) => (
                <SelectItem key={u.id} value={u.id.toString()}>{u.name || u.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {tasks.length} task{tasks.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Create Task Form */}
      {showCreate && (
        <Card className="border-2 border-primary/20">
          <CardContent className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">New Task</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowCreate(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <TaskForm
              form={createForm}
              setForm={setCreateForm}
              staffUsers={staffUsers as any[]}
              patients={allPatients}
              leads={allLeads}
              onSubmit={handleCreate}
              onCancel={() => setShowCreate(false)}
              isPending={createTask.isPending}
              submitLabel="Create Task"
              isDoctor={isDoctor}
            />
          </CardContent>
        </Card>
      )}

      {/* Edit Task Form */}
      {editingTask && (
        <Card className="border-2 border-amber-300/60 bg-amber-50/30">
          <CardContent className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Edit Task</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingTask(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <TaskForm
              form={editForm}
              setForm={setEditForm}
              staffUsers={staffUsers as any[]}
              patients={allPatients}
              leads={allLeads}
              onSubmit={handleEdit}
              onCancel={() => setEditingTask(null)}
              isPending={updateTask.isPending}
              submitLabel="Save Changes"
              isDoctor={isDoctor}
            />
          </CardContent>
        </Card>
      )}

      {/* Bulk Action Toolbar */}
      {selectedTaskIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl border bg-primary/5 border-primary/20 shadow-sm">
          <span className="text-sm font-semibold text-primary mr-1">{selectedTaskIds.size} selected</span>
          {/* Assign Staff */}
          <div className="flex items-center gap-1">
            {showBulkAssign ? (
              <>
                <Select value={bulkAssignId} onValueChange={setBulkAssignId}>
                  <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Select staff" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Unassigned —</SelectItem>
                    {staffUsers.map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8 text-xs" disabled={bulkAssignId === "_none" || bulkUpdateTasks.isPending}
                  onClick={() => bulkUpdateTasks.mutate({ ids: Array.from(selectedTaskIds), data: { assignedToId: bulkAssignId === "_none" ? null : parseInt(bulkAssignId) } })}>
                  Apply
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setShowBulkAssign(false); setBulkAssignId("_none"); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => { setShowBulkAssign(true); setShowBulkStatus(false); setShowBulkPriority(false); }}>
                <UserCheck className="h-3.5 w-3.5" /> Assign Staff
              </Button>
            )}
          </div>
          {/* Change Status */}
          <div className="flex items-center gap-1">
            {showBulkStatus ? (
              <>
                <Select value={bulkTaskStatus} onValueChange={setBulkTaskStatus}>
                  <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— No change —</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                    <SelectItem value="deferred">Deferred / Delayed</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8 text-xs" disabled={bulkTaskStatus === "_none" || bulkUpdateTasks.isPending}
                  onClick={() => bulkUpdateTasks.mutate({ ids: Array.from(selectedTaskIds), data: { status: bulkTaskStatus as any } })}>
                  Apply
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setShowBulkStatus(false); setBulkTaskStatus("_none"); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => { setShowBulkStatus(true); setShowBulkAssign(false); setShowBulkPriority(false); }}>
                <Filter className="h-3.5 w-3.5" /> Change Status
              </Button>
            )}
          </div>
          {/* Change Priority */}
          <div className="flex items-center gap-1">
            {showBulkPriority ? (
              <>
                <Select value={bulkPriority} onValueChange={setBulkPriority}>
                  <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Select priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— No change —</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8 text-xs" disabled={bulkPriority === "_none" || bulkUpdateTasks.isPending}
                  onClick={() => bulkUpdateTasks.mutate({ ids: Array.from(selectedTaskIds), data: { priority: bulkPriority as any } })}>
                  Apply
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setShowBulkPriority(false); setBulkPriority("_none"); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => { setShowBulkPriority(true); setShowBulkAssign(false); setShowBulkStatus(false); }}>
                Change Priority
              </Button>
            )}
          </div>
          {/* Delete (admin only) */}
          {isAdmin && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
              disabled={bulkDeleteTasks.isPending}
              onClick={() => {
                if (!confirm(`Delete ${selectedTaskIds.size} task${selectedTaskIds.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
                bulkDeleteTasks.mutate({ ids: Array.from(selectedTaskIds) });
              }}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8 text-xs ml-auto" onClick={() => setSelectedTaskIds(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      {/* Task List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          <p className="text-sm">Loading tasks...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CheckSquare className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No tasks found</p>
          <p className="text-sm mt-1">
            {activeShortcut === "overdue" ? "No overdue tasks — great job!" :
             activeShortcut === "today" ? "No tasks due today." :
             activeShortcut === "next-week" ? "No tasks in the next 7 days." :
             activeShortcut === "last-week" ? "No tasks in the last 7 days." :
             (dateFrom || dateTo) ? "No tasks in the selected date range." :
             "Create a task to get started."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.length > 1 && (
            <div className="flex items-center gap-2 px-1 pb-1">
              <Checkbox
                checked={selectedTaskIds.size === tasks.length}
                onCheckedChange={(checked) => {
                  if (checked) setSelectedTaskIds(new Set(tasks.map((t: any) => t.id)));
                  else setSelectedTaskIds(new Set());
                }}
                aria-label="Select all tasks"
              />
              <span className="text-xs text-muted-foreground">Select all</span>
            </div>
          )}
          {tasks.map((task: any) => {
            const isOverdue = task.status !== "done" && task.dueDate && task.dueDate < today;
            const isEditing = editingTask?.id === task.id;
            const isSelected = selectedTaskIds.has(task.id);
            return (
              <Card key={task.id} className={`${isOverdue ? "border-red-200 bg-red-50/30" : ""} ${isEditing ? "ring-2 ring-amber-400" : ""} ${isSelected ? "ring-2 ring-primary/30 bg-primary/5" : ""}`}>
                <CardContent className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    {/* Select checkbox */}
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => {
                        setSelectedTaskIds(prev => {
                          const next = new Set(prev);
                          if (checked) next.add(task.id); else next.delete(task.id);
                          return next;
                        });
                      }}
                      className="mt-0.5 shrink-0"
                      aria-label={`Select task ${task.title}`}
                    />
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className={`text-sm font-medium leading-snug ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                            {task.title}
                          </p>
                          {(task.leadFirstName || task.patientFirstName) && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {task.leadFirstName
                                ? `${task.leadFirstName} ${task.leadLastName ?? ""}`.trim()
                                : `${task.patientFirstName} ${task.patientLastName ?? ""}`.trim()}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Select value={task.status} onValueChange={(v) => updateStatusInline.mutate({ id: task.id, status: v as any })}>
                            <SelectTrigger className="h-6 text-xs w-28 px-2 py-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">Open</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="done">Done</SelectItem>
                              <SelectItem value="deferred">Deferred / Delayed</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-amber-600"
                            onClick={() => openEdit(task)}
                            title="Edit task"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-red-600"
                            onClick={() => deleteTask.mutate({ id: task.id })}
                            title="Delete task"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Meta row */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TASK_PRIORITY_COLORS[task.priority]}`}>
                          {task.priority}
                        </span>
                        <span className="text-xs text-muted-foreground">{TASK_TYPE_LABELS[task.type] ?? task.type}</span>
                        {task.communicationMethod && (
                          <span className="text-xs text-muted-foreground">· {TASK_COMM_LABELS[task.communicationMethod]}</span>
                        )}
                        {task.dueDate && (
                          <span className={`text-xs flex items-center gap-0.5 ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                            <Clock className="h-3 w-3" />
                            {task.dueDate}{task.dueTime ? ` ${task.dueTime}` : ""}
                            {isOverdue && " · OVERDUE"}
                          </span>
                        )}
                        {task.assignedToName && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <User className="h-3 w-3" />
                            {task.assignedToName}
                          </span>
                        )}
                        {task.leadId && (
                          <Link href={`/leads/${task.leadId}`}>
                            <span className="text-xs text-primary hover:underline cursor-pointer">View Lead →</span>
                          </Link>
                        )}
                        {task.patientId && (
                          <Link href={`/patients/${task.patientId}`}>
                            <span className="text-xs text-primary hover:underline cursor-pointer">View Patient →</span>
                          </Link>
                        )}
                      </div>

                      {task.notes && (
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{task.notes}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {tasksTotal > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page:</span>
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-8 w-[80px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[20, 30, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, tasksTotal)} of {tasksTotal}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 px-3" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" className="h-8 px-3" disabled={page >= tasksTotalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
