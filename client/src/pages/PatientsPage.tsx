import CalendarDateInput from "@/components/CalendarDateInput";
import { DuplicateWarning } from "@/components/DuplicateWarning";
import { MultiSelect, DoctorMultiSelect, SearchableCombobox, LANGUAGES, CONTACT_METHODS, LanguageSelectWithPrimary } from "@/components/PatientFormComponents";
import { useReferenceData } from "@/hooks/useReferenceData";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COUNTRY_NAMES, NATIONALITIES } from "@/lib/countries";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { fmtDateAge } from "@/lib/dateFormat";
import {
  ArrowRight,
  ArrowUpAZ,
  Calendar,
  Clock,
  Filter,
  Loader2,
  Phone,
  Plus,
  Search,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ─── DOB validation helper ───────────────────────────────────────────────────
function validateDOB(dob: string): string | null {
  if (!dob) return null;
  const d = new Date(dob);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (d > today) return "Date of birth cannot be in the future";
  if (d.getFullYear() < 1900) return "Date of birth must be 1900 or later";
  return null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PatientsPage() {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [statusView, setStatusView] = useState<"all" | "active" | "crm">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<"updatedAt" | "name" | "createdAt">("updatedAt");
  const [filterCountry, setFilterCountry] = useState("");
  const [, setLocation] = useLocation();

  const statusFilterMap: Record<string, string[]> = {
    all: [],
    active: ["active_patient"],
    crm: ["inquiry", "lead", "qualified", "proposal_sent"],
  };

  useEffect(() => { setPage(1); }, [search, statusView, sortBy, filterCountry]);

  const { data: patientsResult, isLoading, refetch } = trpc.patients.list.useQuery(
    { search: search || undefined, statusFilter: statusFilterMap[statusView].length > 0 ? statusFilterMap[statusView] : undefined, page, pageSize, sortBy, country: filterCountry || undefined },
    { placeholderData: (prev: any) => prev }
  );
  const patients = patientsResult?.data ?? [];
  const totalPatients = patientsResult?.total ?? 0;
  const totalPages = patientsResult?.totalPages ?? 1;

  const interestColors: Record<string, string> = {
    hot: "interest-hot",
    warm: "interest-warm",
    cold: "interest-cold",
  };

  const statusColors: Record<string, string> = {
    inquiry: "bg-blue-100 text-blue-700",
    lead: "bg-indigo-100 text-indigo-700",
    qualified: "bg-amber-100 text-amber-700",
    proposal_sent: "bg-purple-100 text-purple-700",
    active_patient: "bg-emerald-100 text-emerald-700",
    inactive: "bg-gray-100 text-gray-600",
    archived: "bg-red-100 text-red-700",
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{background:'rgba(229,186,153,0.18)'}}>
            <Users className="h-6 w-6" style={{color:'#E5BA99'}} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Patients</h1>
            <p className="text-sm text-muted-foreground">{patients?.length ?? 0} total patients</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setLocation("/leads")} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Leads & CRM
          </Button>
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Patient
          </Button>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        {(["all", "active", "crm"] as const).map(v => (
          <button
            key={v}
            onClick={() => setStatusView(v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              statusView === v ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {v === "all" ? "All" : v === "active" ? "Active Patients" : "CRM / Leads"}
          </button>
        ))}
      </div>

      {/* Search + Sort */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, MRN, email, or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-44">
          <SearchableCombobox
            value={filterCountry}
            onChange={v => { setFilterCountry(v); setPage(1); }}
            options={[{ value: "", label: "All Countries" }, ...COUNTRY_NAMES]}
            placeholder="Filter by country..."
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-44 h-10 gap-1.5">
            {sortBy === "name" ? <ArrowUpAZ className="h-4 w-4 text-muted-foreground" /> : <Clock className="h-4 w-4 text-muted-foreground" />}
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updatedAt">Last Updated</SelectItem>
            <SelectItem value="createdAt">Date Added</SelectItem>
            <SelectItem value="name">Alphabetical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Patient List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !patients || patients.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Users className="h-8 w-8" style={{color:'#1E0566', opacity: 0.6}} />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#111827]">No patients found</p>
            <p className="text-xs text-[#6B7280] mt-1">{search ? "Try adjusting your search terms" : "Get started by adding your first patient"}</p>
          </div>
          <Button onClick={() => setShowAdd(true)} className="gap-2 mt-2">
            <Plus className="h-4 w-4" />
            Add Patient
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {patients.map(patient => (
            <Card
              key={patient.id}
              className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30"
              onClick={() => setLocation(`/patients/${patient.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{patient.firstName} {patient.lastName}</p>
                        {patient.interestLevel && (
                          <span className={`interest-badge ${interestColors[patient.interestLevel] ?? ""}`}>
                            {patient.interestLevel}
                          </span>
                        )}
                        {patient.status && (
                          <Badge className={`text-[10px] py-0 ${statusColors[patient.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {patient.status.replace(/_/g, " ")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{patient.mrn}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {patient.phone && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />{patient.phone}
                          </span>
                        )}
                        {patient.dateOfBirth && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />{fmtDateAge(patient.dateOfBirth)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPatients > 0 && (
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
              {`${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalPatients)}`} of {totalPatients}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 px-3" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" className="h-8 px-3" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </div>
      )}
      <AddPatientModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={() => { setShowAdd(false); refetch(); }}
      />
    </div>
  );
}

// ─── Add Patient Modal ────────────────────────────────────────────────────────
function AddPatientModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { data: doctors } = trpc.doctors.list.useQuery();
  const { data: currentUser } = trpc.auth.me.useQuery();
  const { options: languageOptions } = useReferenceData("language");
  const isAdmin = currentUser?.role === "admin";
  const { data: nextMRN, isLoading: mrnLoading } = trpc.patients.previewNextMRN.useQuery(
    undefined,
    { enabled: open, staleTime: 0 }
  );
  const createPatient = trpc.patients.create.useMutation({
    onSuccess: () => { toast.success("Patient created successfully"); onSuccess(); },
    onError: (e) => {
      const msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again.");
      toast.error(msg);
    },
  });

  const emptyForm = {
    firstName: "", middleName: "", lastName: "",
    mrn: "", dateOfBirth: "", gender: "",
    nationality: "", countryOfResidency: "", address: "",
    bloodType: "", allergies: "", emergencyContactName: "", emergencyContactPhone: "",
    insuranceProvider: "", insuranceNumber: "",
    interestLevel: "warm", leadSource: "", notes: "",
    patientType: "" as string,
    preferredLanguages: [] as string[],
    primaryLanguage: "" as string,
    preferredContactMethods: [] as string[],
    doctorIds: [] as number[],
    defaultFinancialScope: "production" as "production" | "test",
    phone: "", secondaryPhone: "", email: "", secondaryEmail: "",
  };

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (open && nextMRN) setForm(f => ({ ...f, mrn: nextMRN }));
  }, [open, nextMRN]);

  useEffect(() => {
    if (!open) setForm({ ...emptyForm });
  }, [open]);

  // Max date = today for DOB
  const todayStr = new Date().toISOString().split("T")[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return toast.error("First and last name are required");
    if (!form.gender) return toast.error("Gender is required");
    if (!form.phone.trim()) return toast.error("Phone number is required");
    if (!form.dateOfBirth) return toast.error("Date of birth is required");
    const dobErr = validateDOB(form.dateOfBirth);
    if (dobErr) return toast.error(dobErr);
    if (!form.patientType) return toast.error("Patient type is required");
    if (form.doctorIds.length === 0) return toast.error("Please assign at least one doctor");
    createPatient.mutate({
      ...form,
      mrn: form.mrn || undefined,
      dateOfBirth: form.dateOfBirth ? new Date(form.dateOfBirth) : undefined,
      gender: form.gender as any,
      interestLevel: form.interestLevel as any,
      patientType: form.patientType as "local" | "international",
      doctorIds: form.doctorIds,
      secondaryEmail: form.secondaryEmail || undefined,
      primaryLanguage: form.primaryLanguage || undefined,
      countryOfResidency: form.countryOfResidency || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-lg max-h-[90dvh] overflow-y-auto overflow-x-hidden p-0"
        style={{ boxSizing: "border-box" }}
      >
        <div className="sticky top-0 z-10 bg-background border-b px-5 py-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Add New Patient</DialogTitle>
          </DialogHeader>
        </div>

          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-6">

          {/* ── BASIC INFO ── */}
          <section className="space-y-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Basic Info</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">First Name <span className="text-destructive">*</span></Label>
                <Input className="h-10 w-full" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Last Name <span className="text-destructive">*</span></Label>
                <Input className="h-10 w-full" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Middle Name <span className="text-muted-foreground text-[10px]">(optional)</span></Label>
              <Input className="h-10 w-full" value={form.middleName} onChange={e => setForm(f => ({ ...f, middleName: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">MRN</Label>
                <span className="text-[10px] text-muted-foreground">{isAdmin ? "Admin: editable" : "Auto-generated"}</span>
              </div>
              {mrnLoading ? (
                <div className="flex items-center gap-2 h-10 px-3 border rounded-lg bg-muted/30 w-full">
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Generating…</span>
                </div>
              ) : isAdmin ? (
                <Input className="h-10 w-full font-mono" value={form.mrn} onChange={e => setForm(f => ({ ...f, mrn: e.target.value }))} placeholder={nextMRN ?? ""} />
              ) : (
                <div className="flex items-center gap-2 h-10 px-3 border rounded-lg bg-muted/30 w-full">
                  <span className="font-mono text-sm font-semibold text-primary">{form.mrn || nextMRN || "—"}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">Read only</span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Date of Birth <span className="text-destructive">*</span></Label>
              <CalendarDateInput
                value={form.dateOfBirth}
                onChange={v => setForm(f => ({ ...f, dateOfBirth: v }))}
                max={todayStr}
                min="1900-01-01"
                required
                clearable
                aria-label="Date of Birth"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Gender <span className="text-destructive">*</span></Label>
                <Select value={form.gender} onValueChange={v => setForm(f => ({ ...f, gender: v }))}>
                  <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Blood Type</Label>
                <Select value={form.bloodType} onValueChange={v => setForm(f => ({ ...f, bloodType: v }))}>
                  <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(bt => <SelectItem key={bt} value={bt}>{bt}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nationality</Label>
                <SearchableCombobox
                  value={form.nationality}
                  onChange={v => setForm(f => ({ ...f, nationality: v }))}
                  options={NATIONALITIES}
                  placeholder="Select nationality"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Country of Residency</Label>
                <SearchableCombobox
                  value={form.countryOfResidency}
                  onChange={v => setForm(f => ({ ...f, countryOfResidency: v }))}
                  options={COUNTRY_NAMES}
                  placeholder="Select country"
                />
              </div>
            </div>
          </section>

          {/* ── CONTACT ── */}
          <section className="space-y-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Contact</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Phone <span className="text-destructive">*</span></Label>
                <Input className="h-10 w-full" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+90 555 000 0000" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Secondary Phone <span className="text-muted-foreground text-[10px]">(opt.)</span></Label>
                <Input className="h-10 w-full" value={form.secondaryPhone} onChange={e => setForm(f => ({ ...f, secondaryPhone: e.target.value }))} placeholder="+90 555 000 0001" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input type="email" className="h-10 w-full" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Secondary Email <span className="text-muted-foreground text-[10px]">(opt.)</span></Label>
                <Input type="email" className="h-10 w-full" value={form.secondaryEmail} onChange={e => setForm(f => ({ ...f, secondaryEmail: e.target.value }))} placeholder="alt@example.com" />
              </div>
            </div>

            <DuplicateWarning entity="patients" email={form.email} phone={form.phone} secondaryPhone={form.secondaryPhone} />

            <div className="space-y-1">
              <Label className="text-xs">Languages <span className="text-muted-foreground text-[10px]">(select all, then mark primary)</span></Label>
              <LanguageSelectWithPrimary
                languages={form.preferredLanguages}
                primaryLanguage={form.primaryLanguage || null}
                onLanguagesChange={v => setForm(f => ({ ...f, preferredLanguages: v }))}
                onPrimaryChange={v => setForm(f => ({ ...f, primaryLanguage: v ?? "" }))}
                options={languageOptions.length > 0 ? languageOptions : undefined}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Preferred Contact Methods</Label>
              <MultiSelect options={CONTACT_METHODS} value={form.preferredContactMethods} onChange={v => setForm(f => ({ ...f, preferredContactMethods: v }))} placeholder="Select contact methods…" />
            </div>
          </section>

          {/* ── CLINICAL ── */}
          <section className="space-y-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Clinical</p>

            <div className="space-y-1">
              <Label className="text-xs">Assigned Doctors <span className="text-destructive">*</span></Label>
              <DoctorMultiSelect
                doctors={doctors ?? []}
                value={form.doctorIds}
                onChange={v => setForm(f => ({ ...f, doctorIds: v }))}
              />
              {form.doctorIds.length === 0 && <p className="text-xs text-destructive">Please assign at least one doctor.</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Patient Type <span className="text-destructive">*</span></Label>
                <Select value={form.patientType} onValueChange={v => setForm(f => ({ ...f, patientType: v }))}>
                  <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="international">International</SelectItem>
                    <SelectItem value="local">Local (Turkish)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Interest Level</Label>
                <Select value={form.interestLevel} onValueChange={v => setForm(f => ({ ...f, interestLevel: v }))}>
                  <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hot">Hot</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="cold">Cold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Allergies</Label>
              <Input className="h-10 w-full" value={form.allergies} onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))} placeholder="e.g. Penicillin, Latex" />
            </div>
          </section>

          {/* ── INSURANCE ── */}
          <section className="space-y-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Insurance</p>
            <div className="space-y-1">
              <Label className="text-xs">Insurance Provider</Label>
              <Input className="h-10 w-full" value={form.insuranceProvider} onChange={e => setForm(f => ({ ...f, insuranceProvider: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Insurance Number</Label>
              <Input className="h-10 w-full" value={form.insuranceNumber} onChange={e => setForm(f => ({ ...f, insuranceNumber: e.target.value }))} />
            </div>
          </section>

          {isAdmin && (
            <details className="rounded-lg border border-violet-200 bg-violet-50">
              <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium text-violet-950 marker:text-violet-700">
                Advanced options
              </summary>
              <div className="border-t border-violet-200 px-3 py-3">
                <label className="flex items-start gap-2 text-sm text-violet-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.defaultFinancialScope === "test"}
                    onChange={(event) => setForm((current) => ({ ...current, defaultFinancialScope: event.target.checked ? "test" : "production" }))}
                    className="mt-0.5"
                  />
                  <span><strong>Test financial scope</strong><br /><span className="text-xs">New invoices and financial records will be excluded from official reporting.</span></span>
                </label>
              </div>
            </details>
          )}

          {/* Footer */}
          <div className="sticky bottom-0 bg-background border-t -mx-5 px-5 py-3 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createPatient.isPending}>
              {createPatient.isPending ? "Creating..." : "Create Patient"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
