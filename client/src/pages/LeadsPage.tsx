import CalendarDateInput from "@/components/CalendarDateInput";
import { DuplicateWarning } from "@/components/DuplicateWarning";
import { parseTrpcError } from "@/lib/errorUtils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { COUNTRY_NAMES, NATIONALITIES } from "@/lib/countries";
import { format } from "date-fns";
import {
  Check,
  ChevronsUpDown,
  Filter,
  Globe,
  Phone,
  Plus,
  Search,
  Star,
  Trash2,
  User,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { CONTACT_METHODS } from "@shared/contactMethods";

const LEAD_STATUSES = [
  { value: "intake", label: "Intake", color: "bg-slate-100 text-slate-700" },
  { value: "attempted-to-contact", label: "Attempted to Contact", color: "bg-yellow-100 text-yellow-700" },
  { value: "contacted-awaiting-info", label: "Contacted / Awaiting Info", color: "bg-blue-100 text-blue-700" },
  { value: "medical-reports-received", label: "Medical Reports Received", color: "bg-indigo-100 text-indigo-700" },
  { value: "doctor-feedback-shared", label: "Doctor Feedback Shared", color: "bg-purple-100 text-purple-700" },
  { value: "follow-up-negotiation", label: "Follow-up / Negotiation", color: "bg-orange-100 text-orange-700" },
  { value: "ready-to-travel", label: "Ready to Travel", color: "bg-teal-100 text-teal-700" },
  { value: "converted", label: "Converted", color: "bg-green-100 text-green-700" },
  { value: "cold", label: "Cold", color: "bg-gray-100 text-gray-500" },
  { value: "lost", label: "Lost", color: "bg-red-100 text-red-700" },
  { value: "not-qualified", label: "Not Qualified", color: "bg-rose-100 text-rose-700" },
  { value: "junk", label: "Junk", color: "bg-zinc-100 text-zinc-500" },
];

const BRANDS = [
  { value: "fertiliv", label: "Fertiliv" },
  { value: "safemedigo", label: "Safemedigo" },
  { value: "dr-nilay-karaca", label: "Dr. Nilay Karaca" },
];

function StatusBadge({ status }: { status: string }) {
  const s = LEAD_STATUSES.find(x => x.value === status);
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s?.color ?? "bg-gray-100 text-gray-600"}`}>
      {s?.label ?? status}
    </span>
  );
}

function RatingBadge({ rating }: { rating?: string | null }) {
  if (!rating) return <span className="text-xs text-muted-foreground/40">—</span>;
  return <span className="text-xs text-amber-700 font-medium leading-tight">{rating}</span>;
}

export default function LeadsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("_all");
  const [filterBrand, setFilterBrand] = useState("_all");
  const [filterOrigin, setFilterOrigin] = useState("_all");
  const [filterCountry, setFilterCountry] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkAssignStaffId, setBulkAssignStaffId] = useState<string>("_none");
  const [bulkStatus, setBulkStatus] = useState<string>("_none");
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const utils = trpc.useUtils();
  const bulkUpdate = trpc.leads.bulkUpdate.useMutation({
    onSuccess: (res) => {
      toast.success(`Updated ${res.updated} lead${res.updated !== 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      setShowBulkAssign(false);
      setShowBulkStatus(false);
      setBulkAssignStaffId("_none");
      setBulkStatus("_none");
      utils.leads.list.invalidate();
    },
    onError: (e) => toast.error(parseTrpcError(e)),
  });
  const bulkDelete = (trpc as any).leads.bulkDelete.useMutation({
    onSuccess: (res: any) => {
      toast.success(`Deleted ${res.deleted} lead${res.deleted !== 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      utils.leads.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const { data: staffUsers } = trpc.users.listStaff.useQuery();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<"updatedAt" | "name" | "createdAt">("updatedAt");
  const { data: leadsResult, refetch, isLoading } = trpc.leads.list.useQuery({
    search: search || undefined,
    status: filterStatus !== "_all" ? filterStatus : undefined,
    brand: filterBrand !== "_all" ? filterBrand : undefined,
    origin: filterOrigin !== "_all" ? filterOrigin : undefined,
    country: filterCountry || undefined,
    page,
    pageSize,
    sortBy,
  });
  const leads = leadsResult?.data ?? [];
  const leadsTotal = leadsResult?.total ?? 0;
  const leadsTotalPages = leadsResult?.totalPages ?? 1;

  const { data: stats } = trpc.leads.stats.useQuery();

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{background:'rgba(227,178,176,0.18)'}}>
            <Users className="h-6 w-6" style={{color:'#E3B2B0'}} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Leads CRM</h1>
            <p className="text-sm text-muted-foreground">Manage potential patients and track their journey</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Lead
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Leads", sub: "All time", value: stats.total, icon: Users, bg: 'rgba(227,178,176,0.15)', color: '#E3B2B0' },
            { label: "In Intake", sub: "Active", value: stats.intake, icon: User, bg: 'rgba(229,186,153,0.15)', color: '#E5BA99' },
            { label: "Converted", sub: "This month", value: stats.converted, icon: Star, bg: 'rgba(30,5,102,0.08)', color: '#1E0566' },
            { label: "Lost", sub: "This month", value: stats.lost, icon: Filter, bg: 'rgba(227,178,176,0.12)', color: '#c0706e' },
          ].map(s => (
            <Card key={s.label} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{background:s.bg}}>
                  <s.icon className="h-6 w-6" style={{color:s.color}} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                  <p className="text-2xl font-bold leading-tight">{s.value}</p>
                  <p className="text-xs" style={{color:s.color}}>{s.sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, phone..."
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Statuses</SelectItem>
            {LEAD_STATUSES.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterBrand} onValueChange={setFilterBrand}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All brands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Brands</SelectItem>
            {BRANDS.map(b => (
              <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterOrigin} onValueChange={setFilterOrigin}>
          <SelectTrigger className="w-full sm:w-[170px]">
            <SelectValue placeholder="All origins" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Origins</SelectItem>
            <SelectItem value="staff-created">Staff Created</SelectItem>
            <SelectItem value="self-submitted">Self Submitted</SelectItem>
          </SelectContent>
        </Select>
        <div className="w-full sm:w-[180px]">
          <SearchableCombobox
            value={filterCountry}
            onChange={v => { setFilterCountry(v); setPage(1); }}
            options={[{ value: "", label: "All Countries" }, ...COUNTRY_NAMES]}
            placeholder="Filter by country..."
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-full sm:w-[170px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updatedAt">Last Updated</SelectItem>
            <SelectItem value="createdAt">Date Added</SelectItem>
            <SelectItem value="name">Alphabetical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl border bg-primary/5 border-primary/20 shadow-sm">
          <span className="text-sm font-semibold text-primary mr-1">{selectedIds.size} selected</span>
          {/* Assign Staff */}
          <div className="flex items-center gap-1">
            {showBulkAssign ? (
              <>
                <Select value={bulkAssignStaffId} onValueChange={setBulkAssignStaffId}>
                  <SelectTrigger className="h-8 w-[170px] text-xs">
                    <SelectValue placeholder="Select staff" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Unassigned —</SelectItem>
                    {staffUsers?.map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8 text-xs" disabled={bulkAssignStaffId === "_none" || bulkUpdate.isPending}
                  onClick={() => bulkUpdate.mutate({ ids: Array.from(selectedIds), data: { assignedStaffId: bulkAssignStaffId === "_none" ? null : parseInt(bulkAssignStaffId) } })}>
                  Apply
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setShowBulkAssign(false); setBulkAssignStaffId("_none"); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => { setShowBulkAssign(true); setShowBulkStatus(false); }}>
                <UserCheck className="h-3.5 w-3.5" /> Assign Staff
              </Button>
            )}
          </div>
          {/* Change Status */}
          <div className="flex items-center gap-1">
            {showBulkStatus ? (
              <>
                <Select value={bulkStatus} onValueChange={setBulkStatus}>
                  <SelectTrigger className="h-8 w-[200px] text-xs">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— No change —</SelectItem>
                    {LEAD_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8 text-xs" disabled={bulkStatus === "_none" || bulkUpdate.isPending}
                  onClick={() => bulkUpdate.mutate({ ids: Array.from(selectedIds), data: { leadStatus: bulkStatus as any } })}>
                  Apply
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setShowBulkStatus(false); setBulkStatus("_none"); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => { setShowBulkStatus(true); setShowBulkAssign(false); }}>
                <Filter className="h-3.5 w-3.5" /> Change Status
              </Button>
            )}
          </div>
          {/* Delete (admin only) */}
          {isAdmin && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
              disabled={bulkDelete.isPending}
              onClick={() => {
                if (!confirm(`Delete ${selectedIds.size} lead${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
                bulkDelete.mutate({ ids: Array.from(selectedIds) });
              }}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8 text-xs ml-auto" onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-16 text-muted-foreground text-sm">Loading leads...</div>
          ) : !leads?.length ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              No leads found. Create your first lead to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 w-10">
                      <Checkbox
                        checked={leads.length > 0 && selectedIds.size === leads.length}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedIds(new Set(leads.map(l => l.id)));
                          else setSelectedIds(new Set());
                        }}
                        aria-label="Select all"
                      />
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Origin</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Brand</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Rating</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Assigned To</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Follow-up</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(lead => (
                    <tr key={lead.id} className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${selectedIds.has(lead.id) ? "bg-primary/5" : ""}`}>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(lead.id)}
                          onCheckedChange={(checked) => {
                            setSelectedIds(prev => {
                              const next = new Set(prev);
                              if (checked) next.add(lead.id); else next.delete(lead.id);
                              return next;
                            });
                          }}
                          aria-label={`Select lead ${ (lead as any).displayFirstName ?? lead.firstName} ${ (lead as any).displayLastName ?? lead.lastName}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/leads/${lead.id}`} className="font-medium hover:underline cursor-pointer text-foreground">{[(lead as any).displayFirstName ?? lead.firstName, (lead as any).displayMiddleName ?? (lead as any).middleName, (lead as any).displayLastName ?? lead.lastName].filter(Boolean).join(" ")}</Link>
                        {lead.nationality && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <Globe className="h-3 w-3" />
                            {lead.nationality}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs space-y-0.5">
                          {lead.email && <div className="text-muted-foreground truncate max-w-[160px]">{lead.email}</div>}
                          {lead.phone && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {lead.phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {lead.leadOrigin === "self-submitted" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 inline-block" />
                            Self Submitted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                            Staff
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={lead.leadStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs capitalize text-muted-foreground">{lead.brand ?? "fertiliv"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <RatingBadge rating={lead.rating} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">{lead.assignedStaffName ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        {lead.nextFollowUpDate ? (
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(lead.nextFollowUpDate), "MMM d, yyyy")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(lead.createdAt), "MMM d, yyyy")}
                        </span>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page:</span>
          <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger className="h-8 w-[80px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[20, 30, 50, 100].map(n => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {leadsTotal === 0 ? "0" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, leadsTotal)}`} of {leadsTotal}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-8 px-3" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" className="h-8 px-3" disabled={page >= leadsTotalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
      <CreateLeadModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => { refetch(); setShowCreate(false); }}
      />
    </div>
  );
}

// ─── Searchable Combobox ─────────────────────────────────────────────────────
function SearchableCombobox({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(() =>
    options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())).slice(0, 100),
    [options, search]
  );
  const selected = options.find(o => o.value === value);
  return (
    <div className="relative">
      <button type="button"
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        onClick={() => setOpen(o => !o)}>
        <span className={selected ? "" : "text-muted-foreground"}>{selected?.label ?? placeholder}</span>
        <ChevronsUpDown className="h-4 w-4 opacity-50" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="p-2">
            <Input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search..." className="h-8 text-sm" />
          </div>
          <div className="max-h-52 overflow-y-auto">
            <button type="button" className="flex w-full items-center px-3 py-1.5 text-sm hover:bg-accent"
              onClick={() => { onChange(""); setOpen(false); setSearch(""); }}>
              — None —
            </button>
            {filtered.map(o => (
              <button key={o.value} type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
                onClick={() => { onChange(o.value); setOpen(false); setSearch(""); }}>
                {value === o.value && <Check className="h-3 w-3 shrink-0" />}
                <span className={value === o.value ? "" : "pl-5"}>{o.label}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No results</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create Lead Modal ────────────────────────────────────────────────────────

const LANGUAGES = [
  { value: "ar", label: "Arabic" },
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "so", label: "Somali" },
  { value: "es", label: "Spanish" },
  { value: "it", label: "Italian" },
  { value: "ru", label: "Russian" },
  { value: "tr", label: "Turkish" },
];
// CM-4 fix: CONTACT_METHODS imported from @shared/contactMethods at top of file (see imports section)

function MultiSelect({ options, value, onChange }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => (
        <button key={opt.value} type="button"
          onClick={() => toggle(opt.value)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            value.includes(opt.value)
              ? "bg-[#1E0566] text-white border-[#1E0566]"
              : "bg-white text-gray-600 border-gray-300 hover:border-[#1E0566]"
          }`}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function CreateLeadModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { data: allUsers } = trpc.users.listStaff.useQuery();
  const createLead = trpc.leads.create.useMutation({ onError: (e) => toast.error(parseTrpcError(e)) });
  const linkPartner = trpc.leads.linkPartner.useMutation({ onError: (e) => toast.error(parseTrpcError(e)) });
  const [duplicateOverride, setDuplicateOverride] = useState(false);
  const [hasDuplicate, setHasDuplicate] = useState(false);
  const [duplicateConflicts, setDuplicateConflicts] = useState<Array<{field: string; conflictName: string}>>([]);
  const utils = trpc.useUtils();
  const emptyForm = {
    firstName: "", lastName: "", middleName: "", email: "", phone: "", secondaryPhone: "",
    gender: "", dateOfBirth: "", nationality: "", country: "",
    preferredLanguages: [] as string[], preferredContactMethods: [] as string[],
    leadSource: "", brand: "fertiliv", leadStatus: "intake",
    assignedStaffId: "", budgetRange: "", patientType: "", mainMedicalInterest: [] as string[],
  };
  const [form, setForm] = useState(emptyForm);
  const [showPartner, setShowPartner] = useState(false);
  // partnerMode: "create" = fill in new partner details; "search" = search existing lead
  const [partnerMode, setPartnerMode] = useState<"create" | "search">("create");
  const [partner, setPartner] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  // For search-existing-lead mode
  const [partnerSearch, setPartnerSearch] = useState("");
  const [selectedExistingPartnerId, setSelectedExistingPartnerId] = useState<number | null>(null);
  const [partnerSearchOpen, setPartnerSearchOpen] = useState(false);
  const { data: partnerSearchResults } = trpc.leads.list.useQuery(
    { search: partnerSearch, pageSize: 20 },
    { enabled: showPartner && partnerMode === "search" && partnerSearch.length >= 2, staleTime: 0 }
  );
  useEffect(() => {
    if (!open) {
      setForm(emptyForm);
      setPartner({ firstName: "", lastName: "", phone: "", email: "" });
      setShowPartner(false);
      setPartnerMode("create");
      setPartnerSearch("");
      setSelectedExistingPartnerId(null);
      setPartnerSearchOpen(false);
      setDuplicateOverride(false);
      setHasDuplicate(false);
      setDuplicateConflicts([]);
    }
  }, [open]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName) return toast.error("First and last name are required");
    if (!form.phone) return toast.error("Phone number is required");
    if (showPartner && partnerMode === "create" && (!partner.firstName || !partner.lastName)) return toast.error("Partner first and last name are required");
    if (showPartner && partnerMode === "search" && !selectedExistingPartnerId) return toast.error("Please select an existing lead as partner");
    // On-submit duplicate check — fetch synchronously before saving
    if (!duplicateOverride) {
      try {
        const dupResult = await utils.duplicateCheck.check.fetch({
          entity: "leads",
          email: form.email || undefined,
          phone: form.phone || undefined,
          secondaryPhone: form.secondaryPhone || undefined,
        });
        if (dupResult.hasDuplicate) {
          setHasDuplicate(true);
          setDuplicateConflicts(dupResult.conflicts);
          const names = dupResult.conflicts.map(c => c.conflictName).filter(Boolean).join(", ");
          toast.warning(
            names
              ? `Possible duplicate: same ${dupResult.conflicts.map(c => c.field).join("/")} already exists for ${names}. Scroll up to review and confirm.`
              : "Possible duplicate: same phone/email already exists. Scroll up to review and confirm.",
            { duration: 6000 }
          );
          return;
        }
      } catch {
        // If check fails, allow saving (non-blocking)
      }
    }
    try {
      const mainLead = await createLead.mutateAsync({
        firstName: form.firstName,
        lastName: form.lastName,
        middleName: form.middleName || undefined,
        email: form.email || undefined,
        phone: form.phone,
        secondaryPhone: form.secondaryPhone || undefined,
        nationality: form.nationality || undefined,
        preferredLanguages: form.preferredLanguages.length > 0 ? form.preferredLanguages : undefined,
        preferredContactMethods: form.preferredContactMethods.length > 0 ? form.preferredContactMethods : undefined,
        leadSource: form.leadSource as any || undefined,
        brand: form.brand as any,
        leadStatus: form.leadStatus as any,
        assignedStaffId: form.assignedStaffId ? parseInt(form.assignedStaffId) : undefined,
        country: form.country || undefined,
        budgetRange: form.budgetRange || undefined,
        gender: (form.gender || undefined) as any,
        dateOfBirth: form.dateOfBirth ? new Date(form.dateOfBirth) : undefined,
        patientType: (form.patientType || undefined) as any,
        mainMedicalInterest: (Array.isArray(form.mainMedicalInterest) && form.mainMedicalInterest.length > 0 ? form.mainMedicalInterest : undefined) as any,
      }) as any;
      if (showPartner && (mainLead as any)?.id) {
        if (partnerMode === "search" && selectedExistingPartnerId) {
          // Link existing lead as partner
          await linkPartner.mutateAsync({ leadId: (mainLead as any).id, partnerId: selectedExistingPartnerId });
          toast.success("Lead created and linked to existing partner");
        } else if (partnerMode === "create") {
          // Create new partner lead and link
          const partnerLead = await createLead.mutateAsync({
            firstName: partner.firstName,
            lastName: partner.lastName,
            email: partner.email || undefined,
            phone: partner.phone || undefined,
            brand: form.brand as any,
            leadStatus: "intake" as any,
            assignedStaffId: form.assignedStaffId ? parseInt(form.assignedStaffId) : undefined,
            patientType: (form.patientType || undefined) as any,
          }) as any;
          if (partnerLead?.id) {
            await linkPartner.mutateAsync({ leadId: (mainLead as any).id, partnerId: partnerLead.id });
          }
          toast.success("Lead and partner created and linked");
        }
      } else {
        toast.success("Lead created");
      }
      onSuccess();
    } catch { /* errors handled per mutation */ }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>New Lead</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* BASIC INFO */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Basic Information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name <span className="text-red-500">*</span></Label>
                <Input className="w-full h-10" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="First name" />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name <span className="text-red-500">*</span></Label>
                <Input className="w-full h-10" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Last name" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Middle Name <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Input className="w-full h-10" value={form.middleName} onChange={e => setForm(f => ({ ...f, middleName: e.target.value }))} placeholder="Middle name" />
              </div>
              <div className="space-y-1.5">
                <Label>Date of Birth</Label>
                <CalendarDateInput
                  value={form.dateOfBirth}
                  onChange={v => setForm(f => ({ ...f, dateOfBirth: v }))}
                  max={new Date().toISOString().split('T')[0]}
                  min="1900-01-01"
                  clearable
                  aria-label="Date of Birth"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Gender <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Select value={form.gender || "_none"} onValueChange={v => setForm(f => ({ ...f, gender: v === "_none" ? "" : v }))}>
                  <SelectTrigger className="w-full h-10"><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Select —</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* CONTACT */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contact</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone <span className="text-red-500">*</span></Label>
                <Input className="w-full h-10" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000" />
              </div>
              <div className="space-y-1.5">
                <Label>Secondary Phone <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Input className="w-full h-10" value={form.secondaryPhone} onChange={e => setForm(f => ({ ...f, secondaryPhone: e.target.value }))} placeholder="+1 555 000 0001" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Email</Label>
                <Input type="email" className="w-full h-10" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
              </div>
            </div>
          </div>
          {/* Real-time background duplicate check */}
          <DuplicateWarning entity="leads" email={form.email} phone={form.phone} secondaryPhone={form.secondaryPhone} onOverrideChange={setDuplicateOverride} onHasDuplicateChange={setHasDuplicate} />
          {/* On-submit detected duplicate (shown when background check missed it) */}
          {hasDuplicate && duplicateConflicts.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-amber-500">⚠</span>
                <div className="text-sm text-amber-800 space-y-1">
                  {duplicateConflicts.map((c, i) => (
                    <p key={i}>
                      This <strong>{c.field === "phone" ? "phone number" : c.field === "email" ? "email address" : c.field}</strong> is already registered
                      {c.conflictName?.trim() ? <> to <strong>{c.conflictName}</strong></> : " to another record"}.
                    </p>
                  ))}
                  <p className="text-xs text-amber-700 mt-1">This may be a shared contact (e.g. a couple). You can still save if this is intentional.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-amber-200">
                <input type="checkbox" id="override-dup-submit" checked={duplicateOverride}
                  onChange={e => setDuplicateOverride(e.target.checked)} className="rounded" />
                <label htmlFor="override-dup-submit" className="text-xs text-amber-800 cursor-pointer font-medium">
                  I understand — this is intentional, save anyway
                </label>
              </div>
            </div>
          )}
          {/* PREFERENCES */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Preferences</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Preferred Languages</Label>
                <MultiSelect options={LANGUAGES} value={form.preferredLanguages} onChange={v => setForm(f => ({ ...f, preferredLanguages: v }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Preferred Contact Methods</Label>
                <MultiSelect options={CONTACT_METHODS} value={form.preferredContactMethods} onChange={v => setForm(f => ({ ...f, preferredContactMethods: v }))} />
              </div>
            </div>
          </div>

          {/* CLINICAL */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Clinical</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Main Medical Interest <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <div className="border rounded-md p-2 space-y-1.5">
                  {["Egg Freezing","Fertility Check-up (Couple)","Fertility Check-up (Female)","Fertility Check-up (Male)","IUI","IVF with ICSI","PGT (Preimplantation Genetic Testing)","Other / Not sure yet","PRP","Exosome","Hysteroscopy","HSG","Sperm Test"].map(opt => (
                    <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Array.isArray(form.mainMedicalInterest) && (form.mainMedicalInterest as string[]).includes(opt)}
                        onChange={e => setForm(f => ({
                          ...f,
                          mainMedicalInterest: e.target.checked
                            ? [...(Array.isArray(f.mainMedicalInterest) ? f.mainMedicalInterest as string[] : []), opt]
                            : (Array.isArray(f.mainMedicalInterest) ? f.mainMedicalInterest as string[] : []).filter(x => x !== opt),
                        }))}
                        className="rounded"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Patient Type <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Select value={form.patientType || "_none"} onValueChange={v => setForm(f => ({ ...f, patientType: v === "_none" ? "" : v }))}>
                  <SelectTrigger className="w-full h-10"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Not specified —</SelectItem>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="international">International</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Lead Source</Label>
                <Select value={form.leadSource || "_none"} onValueChange={v => setForm(f => ({ ...f, leadSource: v === "_none" ? "" : v }))}>
                  <SelectTrigger className="w-full h-10"><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None —</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="employee-referral">Employee Referral</SelectItem>
                    <SelectItem value="external-referral">External Referral</SelectItem>
                    <SelectItem value="website">Website</SelectItem>
                    <SelectItem value="maps">Maps</SelectItem>
                    <SelectItem value="partner">Partner</SelectItem>
                    <SelectItem value="public-relations">Public Relations</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="doctor-referral">Doctor Referral</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="awatef-guide">Awatef (Guide)</SelectItem>
                    <SelectItem value="salim-guide">Salim (Guide)</SelectItem>
                    <SelectItem value="organic">Organic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Brand</Label>
                <Select value={form.brand} onValueChange={v => setForm(f => ({ ...f, brand: v }))}>
                  <SelectTrigger className="w-full h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BRANDS.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.leadStatus} onValueChange={v => setForm(f => ({ ...f, leadStatus: v }))}>
                  <SelectTrigger className="w-full h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* LOCATION */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Location</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nationality</Label>
                <SearchableCombobox
                  value={form.nationality}
                  onChange={v => setForm(f => ({ ...f, nationality: v }))}
                  options={NATIONALITIES}
                  placeholder="Select nationality..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Country of Residence</Label>
                <SearchableCombobox
                  value={form.country}
                  onChange={v => setForm(f => ({ ...f, country: v }))}
                  options={COUNTRY_NAMES}
                  placeholder="Select country..."
                />
              </div>
            </div>
          </div>

          {/* ASSIGNMENT */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Assignment</p>
            <div className="space-y-1.5">
              <Label>Assign To Staff</Label>
              <Select value={form.assignedStaffId || "_none"} onValueChange={v => setForm(f => ({ ...f, assignedStaffId: v === "_none" ? "" : v }))}>
                <SelectTrigger className="w-full h-10"><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Unassigned —</SelectItem>
                  {allUsers?.map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Partner Section */}
          <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Add Partner / Spouse</span>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1"
                onClick={() => setShowPartner(v => !v)}>
                {showPartner ? "Remove Partner" : "+ Add Partner"}
              </Button>
            </div>
            {showPartner && (
              <div className="space-y-3">
                {/* Mode tabs */}
                <div className="flex gap-1 rounded-md bg-muted p-1">
                  <button type="button"
                    className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
                      partnerMode === "create" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => { setPartnerMode("create"); setSelectedExistingPartnerId(null); setPartnerSearch(""); }}>
                    Create New Lead
                  </button>
                  <button type="button"
                    className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
                      partnerMode === "search" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => { setPartnerMode("search"); setPartner({ firstName: "", lastName: "", phone: "", email: "" }); }}>
                    Link Existing Lead
                  </button>
                </div>

                {partnerMode === "create" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Partner First Name *</Label>
                      <Input className="w-full h-10" value={partner.firstName} onChange={e => setPartner(p => ({ ...p, firstName: e.target.value }))} placeholder="First name" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Partner Last Name *</Label>
                      <Input className="w-full h-10" value={partner.lastName} onChange={e => setPartner(p => ({ ...p, lastName: e.target.value }))} placeholder="Last name" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Partner Phone</Label>
                      <Input className="w-full h-10" value={partner.phone} onChange={e => setPartner(p => ({ ...p, phone: e.target.value }))} placeholder="Phone number" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Partner Email</Label>
                      <Input type="email" className="w-full h-10" value={partner.email} onChange={e => setPartner(p => ({ ...p, email: e.target.value }))} placeholder="Email address" />
                    </div>
                    {/* Duplicate check for new partner */}
                    <div className="sm:col-span-2">
                      <DuplicateWarning entity="leads" phone={partner.phone} email={partner.email} />
                    </div>
                    <div className="sm:col-span-2 text-xs text-muted-foreground">
                      A new lead profile will be created for the partner and linked to this lead.
                    </div>
                  </div>
                )}

                {partnerMode === "search" && (
                  <div className="space-y-2">
                    <Label>Search existing lead by name, phone, or email</Label>
                    <div className="relative">
                      <Input
                        className="w-full h-10 pr-8"
                        value={partnerSearch}
                        onChange={e => { setPartnerSearch(e.target.value); setSelectedExistingPartnerId(null); setPartnerSearchOpen(true); }}
                        onFocus={() => setPartnerSearchOpen(true)}
                        placeholder="Type at least 2 characters..."
                      />
                      {partnerSearch && (
                        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => { setPartnerSearch(""); setSelectedExistingPartnerId(null); }}>
                          ×
                        </button>
                      )}
                    </div>
                    {partnerSearchOpen && partnerSearch.length >= 2 && (
                      <div className="border rounded-md bg-popover shadow-md max-h-48 overflow-y-auto">
                        {!partnerSearchResults?.data?.length ? (
                          <p className="px-3 py-2 text-sm text-muted-foreground">No leads found</p>
                        ) : (
                          partnerSearchResults.data.map((l: any) => (
                            <button key={l.id} type="button"
                              className={`flex w-full items-start gap-2 px-3 py-2 text-sm hover:bg-accent text-left ${
                                selectedExistingPartnerId === l.id ? "bg-accent" : ""
                              }`}
                              onClick={() => { setSelectedExistingPartnerId(l.id); setPartnerSearch(`${l.displayFirstName ?? l.firstName} ${l.displayLastName ?? l.lastName}`); setPartnerSearchOpen(false); }}>
                              <div>
                                <p className="font-medium">{l.displayFirstName ?? l.firstName} {l.displayLastName ?? l.lastName}</p>
                                <p className="text-xs text-muted-foreground">{l.phone ?? ""}{l.email ? ` · ${l.email}` : ""}</p>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                    {selectedExistingPartnerId && (
                      <p className="text-xs text-green-600 font-medium">✓ Partner selected — will be linked on save</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createLead.isPending || linkPartner.isPending}>
              {createLead.isPending ? "Creating..." : showPartner ? "Create Lead + Partner" : "Create Lead"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
