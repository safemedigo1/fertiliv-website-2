import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { fmtDateTime, fmtDateWithDay } from "@/lib/dateFormat";
import { parseAppointmentDeletionAuditDetails } from "@shared/auditEventDetails";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Shield,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Clock,
  User,
  Activity,
  Filter,
  Eye,
  MoreHorizontal,
} from "lucide-react";

const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "auth", label: "Authentication" },
  { value: "patient", label: "Patients" },
  { value: "lead", label: "Leads" },
  { value: "appointment", label: "Appointments" },
  { value: "medical_note", label: "Medical Notes" },
  { value: "user_management", label: "User Management" },
  { value: "navigation", label: "Navigation" },
  { value: "other", label: "Other" },
];

const CATEGORY_COLORS: Record<string, string> = {
  auth: "bg-blue-100 text-blue-800 border-blue-200",
  patient: "bg-emerald-100 text-emerald-800 border-emerald-200",
  lead: "bg-purple-100 text-purple-800 border-purple-200",
  appointment: "bg-amber-100 text-amber-800 border-amber-200",
  medical_note: "bg-rose-100 text-rose-800 border-rose-200",
  user_management: "bg-indigo-100 text-indigo-800 border-indigo-200",
  navigation: "bg-slate-100 text-slate-600 border-slate-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  doctor: "bg-teal-100 text-teal-700",
  staff: "bg-blue-100 text-blue-700",
  manager: "bg-purple-100 text-purple-700",
  patient: "bg-green-100 text-green-700",
};

function extractDurationFromDescription(desc: string): string {
  const match = desc.match(/spent (\d+)s\)/);
  if (match) {
    const s = parseInt(match[1]);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  }
  return "";
}

function MetadataItem({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0 space-y-0.5"><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm break-words">{value || "—"}</p></div>;
}

export default function AuditLogPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  // Redirect non-admins
  if (user && user.role !== "admin") {
    navigate("/");
    return null;
  }

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  // Fetch distinct users who appear in audit logs
  const { data: auditUsers } = trpc.audit.listUsers.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
    staleTime: 60_000,
  });

  // Debounce search
  const handleSearchChange = (val: string) => {
    setSearch(val);
    clearTimeout((window as any)._auditSearchTimer);
    (window as any)._auditSearchTimer = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 400);
  };

  const queryInput = useMemo(() => ({
    page,
    pageSize: 50,
    userId: selectedUserId !== "all" ? parseInt(selectedUserId) : undefined,
    category: category === "all" ? undefined : category,
    from: fromDate ? new Date(fromDate) : undefined,
    to: toDate ? new Date(toDate + "T23:59:59") : undefined,
    search: debouncedSearch || undefined,
  }), [page, selectedUserId, category, fromDate, toDate, debouncedSearch]);

  const { data, isLoading, refetch } = trpc.audit.list.useQuery(queryInput, {
    enabled: !!user && user.role === "admin",
    refetchOnWindowFocus: false,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  // CSV Export
  const handleExport = () => {
    if (!logs.length) return;
    const headers = ["ID", "Date & Time", "User", "Role", "Category", "Action", "Description", "IP Address"];
    const rows = logs.map((log: any) => [
      log.id,
      fmtDateTime(log.createdAt),
      log.userName ?? "System",
      log.userRole ?? "",
      log.category ?? "",
      log.action ?? "",
      `"${(log.description ?? "").replace(/"/g, '""')}"`,
      log.ipAddress ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasActiveFilters = selectedUserId !== "all" || category !== "all" || fromDate || toDate || debouncedSearch;
  const selectedDeletionDetails = selectedLog ? parseAppointmentDeletionAuditDetails(selectedLog.description) : null;

  return (
    <div className="min-w-0 max-w-7xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Shield className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
            <p className="text-sm text-muted-foreground">
              All system actions, page visits, and user interactions
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-muted-foreground sm:flex-none"
              onClick={() => {
                setSelectedUserId("all");
                setCategory("all");
                setFromDate("");
                setToDate("");
                setSearch("");
                setDebouncedSearch("");
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          )}
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={handleExport} disabled={!logs.length}>
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Events", value: total, icon: Activity, color: "text-indigo-600" },
          { label: "This Page", value: logs.length, icon: Filter, color: "text-teal-600" },
          { label: "Page", value: `${page} / ${totalPages || 1}`, icon: Clock, color: "text-amber-600" },
          { label: "Showing", value: `${Math.min((page - 1) * 50 + 1, total)}–${Math.min(page * 50, total)}`, icon: User, color: "text-purple-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={`h-5 w-5 ${color}`} />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-semibold text-sm">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-1 text-xs">Active</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search */}
            <div className="relative lg:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search description..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* User filter */}
            <Select
              value={selectedUserId}
              onValueChange={(v) => { setSelectedUserId(v); setPage(1); }}
            >
              <SelectTrigger>
                <User className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                <SelectValue placeholder="All Users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {(auditUsers ?? []).map((u: any) => (
                  <SelectItem key={u.userId} value={String(u.userId)}>
                    <div className="flex items-center gap-2">
                      <span>{u.userName}</span>
                      {u.userRole && (
                        <Badge
                          variant="outline"
                          className={`text-xs px-1 py-0 ${ROLE_COLORS[u.userRole] ?? "bg-gray-100 text-gray-700"}`}
                        >
                          {u.userRole}
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Category filter */}
            <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* From date */}
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              placeholder="From date"
            />

            {/* To date */}
            <Input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              placeholder="To date"
            />
          </div>

          {/* Active filter chips */}
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
              {selectedUserId !== "all" && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <User className="h-3 w-3" />
                  {auditUsers?.find((u: any) => String(u.userId) === selectedUserId)?.userName ?? "User"}
                  <button onClick={() => { setSelectedUserId("all"); setPage(1); }} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              {category !== "all" && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  {CATEGORIES.find(c => c.value === category)?.label}
                  <button onClick={() => { setCategory("all"); setPage(1); }} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              {fromDate && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  From: {fromDate}
                  <button onClick={() => { setFromDate(""); setPage(1); }} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              {toDate && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  To: {toDate}
                  <button onClick={() => { setToDate(""); setPage(1); }} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              {debouncedSearch && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  Search: "{debouncedSearch}"
                  <button onClick={() => { setSearch(""); setDebouncedSearch(""); setPage(1); }} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results: mobile cards prevent page-level horizontal scrolling; desktop keeps the existing table. */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Shield className="h-10 w-10 mb-3 opacity-30" />
              <p className="font-medium">No audit events found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          ) : (
              <div className="max-w-full overflow-x-auto overscroll-contain">
              <Table className="min-w-[740px]">
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-28 whitespace-nowrap">Date & Time</TableHead>
                    <TableHead className="w-24">User</TableHead>
                    <TableHead className="w-20">Role</TableHead>
                    <TableHead className="w-24">Category</TableHead>
                    <TableHead className="w-24">Action</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="hidden w-20 sm:table-cell">Duration</TableHead>
                    <TableHead className="hidden w-28 lg:table-cell">IP Address</TableHead>
                    <TableHead className="w-10" aria-label="Actions" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log: any, idx: number) => {
                    const duration = extractDurationFromDescription(log.description ?? "");
                    const isNav = log.category === "navigation";
                    const logDate = fmtDateWithDay(log.createdAt);
                    const prevLogDate = idx > 0 ? fmtDateWithDay(logs[idx - 1].createdAt) : null;
                    const showDaySeparator = idx === 0 || logDate !== prevLogDate;
                    return (
                      <React.Fragment key={log.id}>
                        {showDaySeparator && (
                          <TableRow key={`sep-${log.id}`} className="bg-muted/40 hover:bg-muted/40">
                            <TableCell colSpan={9} className="py-1.5 px-4">
                              <div className="flex items-center gap-3">
                                <div className="h-px flex-1 bg-border" />
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{logDate}</span>
                                <div className="h-px flex-1 bg-border" />
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      <TableRow
                        key={log.id}
                        className={isNav ? "opacity-60 hover:opacity-100" : ""}>

                        <TableCell className="whitespace-nowrap px-2 py-2 text-[11px] text-muted-foreground">
                          {fmtDateTime(log.createdAt)}
                        </TableCell>
                        <TableCell className="max-w-24 px-2 py-2">
                          <span className="block truncate text-xs font-medium">{log.userName ?? "System"}</span>
                        </TableCell>
                        <TableCell className="px-2 py-2">
                          {log.userRole && (
                            <Badge
                              variant="outline"
                              className={`max-w-20 truncate text-[10px] ${ROLE_COLORS[log.userRole] ?? "bg-gray-100 text-gray-700"}`}
                            >
                              {log.userRole}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="px-2 py-2">
                          <Badge
                            variant="outline"
                            className={`max-w-24 truncate text-[10px] ${CATEGORY_COLORS[log.category ?? "other"] ?? CATEGORY_COLORS.other}`}
                          >
                            {log.category ?? "other"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-24 px-2 py-2">
                          <code className="block truncate rounded bg-muted px-1 py-0.5 text-[10px]">
                            {log.action}
                          </code>
                        </TableCell>
                        <TableCell className="max-w-[16rem] px-2 py-2 text-xs">
                          <span className="line-clamp-2 break-words">{log.description}</span>
                        </TableCell>
                        <TableCell className="hidden px-2 py-2 text-xs text-muted-foreground sm:table-cell">
                          {duration && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {duration}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden max-w-[7rem] break-words px-2 py-2 text-xs text-muted-foreground lg:table-cell">
                          {log.ipAddress}
                        </TableCell>
                        <TableCell className="px-1 py-1 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`More actions for audit event ${log.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem onSelect={() => setSelectedLog(log)}>
                                <Eye className="mr-2 h-4 w-4" /> View Details
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {Math.min((page - 1) * 50 + 1, total)}–{Math.min(page * 50, total)} of {total} events
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm font-medium px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => { if (!open) setSelectedLog(null); }}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit Event Details</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <MetadataItem label="Date & Time" value={fmtDateTime(selectedLog.createdAt)} />
                <MetadataItem label="User" value={selectedLog.userName ?? "System"} />
                <MetadataItem label="Role" value={selectedLog.userRole} />
                <MetadataItem label="Category" value={selectedLog.category} />
                <MetadataItem label="Action" value={selectedLog.action} />
                <MetadataItem label="Record" value={selectedLog.recordType && selectedLog.recordId ? `${selectedLog.recordType} #${selectedLog.recordId}` : undefined} />
                <MetadataItem label="IP Address" value={selectedLog.ipAddress} />
                <MetadataItem label="Event ID" value={String(selectedLog.id)} />
              </div>

              {selectedLog.action === "delete_appointment" && selectedDeletionDetails && (
                <section className="space-y-3 rounded-lg border bg-muted/30 p-4">
                  <h3 className="text-sm font-semibold">Deleted Appointment Snapshot</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <MetadataItem label="Appointment reference / ID" value={`${selectedDeletionDetails.appointmentReference} / ${selectedDeletionDetails.appointmentId}`} />
                    <MetadataItem label="Person type" value={selectedDeletionDetails.personType} />
                    <MetadataItem label={selectedDeletionDetails.personType} value={selectedDeletionDetails.personName} />
                    <MetadataItem label="Original status" value={selectedDeletionDetails.originalStatus} />
                    <MetadataItem label="Original appointment date/time" value={selectedDeletionDetails.scheduledAt} />
                    <MetadataItem label="Deletion reason" value={selectedDeletionDetails.reason} />
                  </div>
                </section>
              )}

              <section className="space-y-2">
                <p className="text-xs text-muted-foreground">Full Description</p>
                <div className="max-w-full whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-3 text-sm">
                  {selectedLog.description || "No description recorded."}
                </div>
              </section>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setSelectedLog(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
