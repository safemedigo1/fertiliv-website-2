import CalendarDateInput from "@/components/CalendarDateInput";
import { buildFemaleDiagnosisGroups, toggleDiagnosisValue, isHiddenOption, type RawDropdownOption } from "@/lib/femaleDiagnosisAdapter";
import { normaliseFileUrl } from "@/lib/fileUrl";
import { FileViewButton } from "@/components/FileViewButton";
import { COUNTRY_NAMES, NATIONALITIES } from "@/lib/countries";
import { LanguageSelectWithPrimary, LANGUAGES, MultiSelect, CONTACT_METHODS } from "@/components/PatientFormComponents";
import { useReferenceData } from "@/hooks/useReferenceData";
import { useDraftForm, DraftBanner } from "@/hooks/useDraftForm";
import MedicalIntakeForm from "@/components/MedicalIntakeForm";
import { TreatmentProposalsTab } from "@/components/TreatmentProposalsTab";
import CaseCommentsThread from "@/components/CaseCommentsThread";
import { LeadMergeDialog } from "@/components/LeadMergeDialog";
import { AppointmentDetailsSendModal } from "@/components/AppointmentDetailsSendModal";
import { AppointmentDetailsSecondaryLayer } from "@/components/AppointmentDetailsSecondaryLayer";
import { AppointmentDetailsActionGroup, AppointmentDetailsIdentityRow, AppointmentDetailsTimingGroup } from "@/components/AppointmentDetailsPresentation";
import { AppointmentStatusConfirmation, type AppointmentStatusAction } from "@/components/AppointmentStatusConfirmation";
import TagManager from "@/components/TagManager";
import TaskTagManager from "@/components/TaskTagManager";
import { fmtDate, fmtDateAge, toDateInputValue } from "@/lib/dateFormat";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { effectiveAppointmentEnd, endDateFromLocalTime, localTimeValue, resolveEffectiveExternalLocation, validateOptionalMeetingLink } from "@shared/appointmentScheduling";
import { appointmentCommunicationActionLabel } from "@shared/appointmentCommunication";
import { normalizeCallablePhone } from "@shared/phoneUtils";
import { format } from "date-fns";
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  ChevronRight,
  Edit,
  FileText,
  Globe,
  Loader2,
  MessageSquare,
  Mail,
  Phone,
  Save,
  Sparkles,
  Star,
  User,
  UserCheck,
  Users,
  UserPlus,
  Link2,
  Link2Off,
  CheckSquare,
  Clock,
  Plus,
  X,
  AlertCircle,
  Pencil,
  Merge,
  Stethoscope,
  Eye,
  EyeOff,
  Lock,
  Upload,
  FolderOpen,
  ImageIcon,
  Disc3,
  RotateCcw,
  ChevronDown,
  Check,
  ChevronsUpDown,
  Paperclip,
  ExternalLink,
  KeyRound,
  Video,
} from "lucide-react";
import { isBefore } from "date-fns";
import { AlertTriangle, RefreshCw, Trash2 as TrashIcon, XCircle, Download, CheckCircle2, ClipboardList, Archive } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, Component } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import SavedTranslationsPanel from "@/components/SavedTranslationsPanel";
import { hasMeaningfulReportedPartnerData } from "@shared/intakeUtils";

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

// ─── Multi-Select Diagnosis Dropdown ────────────────────────────────────────
function MultiSelectDiagnosis({ label, value, onChange, options, rawOptions }: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  options: { main: string; subs: string[]; isHidden?: boolean }[];
  /** Raw options from dropdownOptions.list — used to block newly selecting hidden options */
  rawOptions?: RawDropdownOption[] | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  function toggle(item: string) {
    const checked = !value.includes(item);
    onChange(toggleDiagnosisValue(value, item, checked, rawOptions ?? null));
  }

  const selectedCount = value.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm border rounded-md bg-background hover:bg-accent/30 transition-colors min-h-[44px]"
      >
        <span className="flex flex-wrap gap-1 flex-1 min-w-0">
          {selectedCount === 0 ? (
            <span className="text-muted-foreground">Select {label}...</span>
          ) : (
            value.map(v => (
              <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs font-medium">
                {v}
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); toggle(v); }}
                  className="hover:text-purple-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-lg max-h-72 overflow-y-auto">
          {options.map(({ main, subs, isHidden: groupHidden }) => {
            const mainHidden = groupHidden || isHiddenOption(main, rawOptions ?? null);
            // Hidden groups are only shown when already selected; they cannot be newly selected
            if (mainHidden && !value.includes(main) && !subs.some(s => value.includes(s))) return null;
            return (
              <div key={main}>
                <label className={`flex items-center gap-2 px-3 py-2 ${mainHidden ? "opacity-60" : "hover:bg-accent/40 cursor-pointer"}`}>
                  <Checkbox
                    checked={value.includes(main)}
                    onCheckedChange={() => !mainHidden && toggle(main)}
                    disabled={mainHidden && !value.includes(main)}
                    className="h-4 w-4"
                  />
                  <span className={`text-sm font-medium ${mainHidden ? "line-through text-muted-foreground" : ""}`}>{main}</span>
                  {mainHidden && <span className="text-xs text-muted-foreground ml-1">(hidden)</span>}
                </label>
                {subs.map(sub => {
                  const subHidden = isHiddenOption(sub, rawOptions ?? null);
                  if (subHidden && !value.includes(sub)) return null;
                  return (
                    <label key={sub} className={`flex items-center gap-2 pl-8 pr-3 py-1.5 ${subHidden ? "opacity-60" : "hover:bg-accent/40 cursor-pointer"}`}>
                      <Checkbox
                        checked={value.includes(sub)}
                        onCheckedChange={() => !subHidden && toggle(sub)}
                        disabled={subHidden && !value.includes(sub)}
                        className="h-3.5 w-3.5"
                      />
                      <span className={`text-xs ${subHidden ? "line-through text-muted-foreground" : "text-muted-foreground"}`}>{sub}</span>
                      {subHidden && <span className="text-xs text-muted-foreground ml-1">(hidden)</span>}
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const FEMALE_DIAGNOSIS_OPTIONS = [
  { main: "Ovarian reserve", subs: ["PCOS (Polycystic Ovary Syndrome)", "Premature Ovarian Insufficiency (POI)"] },
  { main: "Ovulation disorders", subs: [] },
  { main: "Tubal factor", subs: ["Hydrosalpinx"] },
  { main: "Endometriosis", subs: [] },
  { main: "Uterine factors", subs: ["Uterine fibroids (myomas)", "Uterine polyps", "Uterine septum / Asherman's syndrome"] },
  { main: "Genetics / PGT needed", subs: [] },
  { main: "Recurrent miscarriages", subs: ["Recurrent Implantation Failure (RIF)"] },
  { main: "Unexplained infertility", subs: [] },
  { main: "No clear diagnosis / needs re-evaluation", subs: [] },
  { main: "Systemic factors", subs: [] },
  { main: "Other", subs: [] },
];

const MALE_DIAGNOSIS_OPTIONS = [
  { main: "Male factor infertility", subs: ["Azoospermia", "Oligospermia (low sperm count)", "Asthenospermia (poor motility)", "Teratospermia (abnormal morphology)", "OAT syndrome (combined)"] },
  { main: "Varicocele", subs: [] },
  { main: "Recurrent Varicocele", subs: [] },
  { main: "High Sperm DNA Fragmentation", subs: [] },
  { main: "Undescended testicles (cryptorchidism)", subs: [] },
  { main: "Vasectomy history", subs: [] },
  { main: "Retrograde ejaculation", subs: [] },
  { main: "Hypogonadism", subs: [] },
  { main: "Y-chromosome microdeletion", subs: [] },
  { main: "Klinefelter syndrome", subs: [] },
  { main: "CF mutation carrier", subs: [] },
  { main: "Unexplained male factor", subs: [] },
  { main: "No clear diagnosis", subs: [] },
  { main: "Other", subs: [] },
];

type Tab = "info" | "medical-intake" | "partner-record" | "notes" | "appointments" | "documents" | "tasks" | "treatment-plan";

// ─── Header Patient Identity (Option A: show Patient identity in header when linked) ───
function HeaderPatientIdentity({ lead, patientId }: { lead: any; patientId: number | null | undefined }) {
  // Primary source: displayFirstName/displayLastName are already COALESCE'd in getLeadById response
  // — no flash because the correct name is in the initial Lead query response.
  // Secondary source: trpc.patients.get is used as a live-update fallback when Patient identity
  // changes after the Lead detail page is already open (e.g., edited from Patient profile).
  const { data: patient } = trpc.patients.get.useQuery(
    { id: patientId! },
    { enabled: !!patientId, staleTime: 0 }
  );

  // Prefer live patient data if available, then displayFirstName from initial Lead response, then raw Lead fields
  const firstName = (patientId && patient) ? patient.firstName : (lead.displayFirstName ?? lead.firstName);
  const middleName = (patientId && patient) ? (patient as any).middleName : (lead.displayMiddleName ?? (lead as any).middleName);
  const lastName = (patientId && patient) ? patient.lastName : (lead.displayLastName ?? lead.lastName);
  const dob = (patientId && patient) ? patient.dateOfBirth : (lead.displayDateOfBirth ?? lead.dateOfBirth);

  const ageYrs = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;

  return (
    <h1 className="text-xl md:text-2xl font-bold break-words leading-tight">
      {[firstName, middleName, lastName].filter(Boolean).join(" ") || "—"}
      {ageYrs !== null && (
        <span className="ml-2 text-sm font-normal text-muted-foreground align-middle">
          · {ageYrs} yrs
        </span>
      )}
    </h1>
  );
}

export default function LeadDetailPage({ leadId }: { leadId: number }) {
  const { user } = useAuth();
  const isDoctor = user?.role === "doctor";
  const isAdmin = user?.role === "admin";
  const [, navigate] = useLocation();
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [convertDoctorIds, setConvertDoctorIds] = useState<number[]>([]);
  const [showConvertCoupleDialog, setShowConvertCoupleDialog] = useState(false);
  const [showLinkPartnerDialog, setShowLinkPartnerDialog] = useState(false);
  const [showUnlinkConfirmDialog, setShowUnlinkConfirmDialog] = useState(false);
  const [showDeleteLeadDialog, setShowDeleteLeadDialog] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [showRequestPlanDialog, setShowRequestPlanDialog] = useState(false);
  const [showLinkToPatientDialog, setShowLinkToPatientDialog] = useState(false);
  const [requestPlanDoctorId, setRequestPlanDoctorId] = useState<string>("");
  const [requestPlanTitle, setRequestPlanTitle] = useState("");
  const [requestPlanNotes, setRequestPlanNotes] = useState("");
    // Deep-link support: ?tab=medical-intake&focus=intake-conflict
  const searchString = useSearch();
  const urlParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const urlTab = urlParams.get("tab") as Tab | null;
  const urlFocus = urlParams.get("focus");
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const validTabs: Tab[] = ["info", "medical-intake", "partner-record", "notes", "appointments", "documents", "tasks", "treatment-plan"];
    return (urlTab && validTabs.includes(urlTab)) ? urlTab : "info";
  });
  // When focus=intake-conflict, scroll the conflict banner into view after the tab renders
  const focusConflictRef = useRef(false);
  useEffect(() => {
    if (urlFocus === "intake-conflict" && activeTab === "medical-intake" && !focusConflictRef.current) {
      // Wait for the MedicalIntakeForm to mount and the query to settle
      const timer = setTimeout(() => {
        const banner = document.getElementById("intake-conflict-banner");
        if (banner) {
          banner.scrollIntoView({ behavior: "smooth", block: "start" });
          focusConflictRef.current = true;
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [activeTab, urlFocus]);
  const { data: lead, refetch } = trpc.leads.get.useQuery({ id: leadId });
  const leadPhoneHref = normalizeCallablePhone(lead?.phone);
  const { data: allUsers } = trpc.users.list.useQuery();
  const { data: allDoctorsForConvert } = trpc.doctors.list.useQuery();
  const requestPlan = trpc.treatmentPlans.requestPlan.useMutation({
    onSuccess: () => { toast.success("Treatment plan requested successfully"); setShowRequestPlanDialog(false); setRequestPlanDoctorId(""); setRequestPlanTitle(""); setRequestPlanNotes(""); refetch(); },
    onError: (e) => toast.error(e.message || "Failed to request treatment plan"),
  });

  const { options: languageOptions } = useReferenceData("language");
  const updateLead = trpc.leads.update.useMutation({
    onSuccess: () => { toast.success("Lead updated"); refetch(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const convertLead = trpc.leads.convert.useMutation({
    onSuccess: (data) => {
      toast.success("Lead converted to patient!");
      navigate(`/patients/${data.patientId}`);
    },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const { data: partner, refetch: refetchPartner } = trpc.leads.getPartner.useQuery(
    { leadId },
    { enabled: !!lead }
  );

    // Phase 1: Pending Partner Data banner — shows when maleIntake has data but no partner is linked
  const { data: pendingPartnerData, refetch: refetchPendingPartner } = trpc.leads.getPendingPartnerData.useQuery(
    { leadId },
    { enabled: !!lead && !lead.partnerId, staleTime: 0, refetchOnWindowFocus: true }
  );
  // P2-5: Intake query for unlink confirmation dialog — detect reported partner data
  const { data: unlinkIntake } = trpc.leads.medicalIntake.useQuery(
    { leadId },
    { enabled: !!lead?.partnerId }
  );
  const unlinkPartner = trpc.leads.unlinkPartner.useMutation({
    onSuccess: () => { toast.success("Partner unlinked"); refetch(); refetchPartner(); setShowUnlinkConfirmDialog(false); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const convertCouple = trpc.leads.convertCouple.useMutation({
    onSuccess: (data) => {
      toast.success("Couple converted to patients!");
      navigate(`/patients/${data.patient1Id}`);
    },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const deleteLeadMutation = trpc.leads.delete.useMutation({
    onSuccess: () => { toast.success("Lead deleted"); navigate("/leads"); },
    onError: (e) => { toast.error(e.message || "Failed to delete lead"); },
  });

  if (!lead) return <div className="p-6 text-muted-foreground">Loading...</div>;

  // Fetch linked Patient for header identity display (Option A: header shows Patient identity when linked)
  const headerPatientId = (lead as any).convertedPatientId as number | null | undefined;

  const statusInfo = LEAD_STATUSES.find(s => s.value === lead.leadStatus);

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "info", label: "Lead Info", icon: User },
    { id: "medical-intake", label: "Medical Record", icon: FileText },
    // Phase 2: Partner Record tab — only shown when a partner is linked
    ...(partner ? [{ id: "partner-record" as Tab, label: "Partner Record", icon: Users }] : []),
    { id: "notes", label: "Notes", icon: MessageSquare },
    { id: "tasks", label: "Tasks", icon: CheckSquare },
    { id: "appointments", label: "Appointments", icon: Calendar },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "treatment-plan", label: "Treatment Plan", icon: FileText },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="space-y-2">
        {/* Row 1: back + name */}
        <div className="flex items-start gap-2">
          <Link href="/leads">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 mt-0.5">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <HeaderPatientIdentity lead={lead} patientId={headerPatientId} />
          </div>
        </div>
        {/* Row 2: badges */}
        <div className="flex items-center gap-2 flex-wrap pl-1">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo?.color ?? "bg-gray-100"}`}>
            {statusInfo?.label ?? lead.leadStatus}
          </span>
          {lead.brand && (
            <span className="text-xs text-muted-foreground capitalize">{lead.brand}</span>
          )}
        </div>
        {/* Row 3: contact info */}
        <div className="flex items-center gap-3 flex-wrap pl-1 text-sm text-muted-foreground">
          {lead.phone && (leadPhoneHref ? (
            <a
              href={`tel:${leadPhoneHref}`}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
              aria-label={`Call ${lead.phone}`}
            >
              <Phone className="h-3.5 w-3.5" />{lead.phone}
            </a>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap"><Phone className="h-3.5 w-3.5" />{lead.phone}</span>
          ))}
          {lead.email && <span className="break-all">{lead.email}</span>}
          {lead.nationality && <span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{lead.nationality}</span>}
        </div>
        {/* Row 4: action buttons */}
        <div className="flex items-center gap-2 flex-wrap pl-1">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            onClick={() => navigate(`/inbox?new=1&recordType=lead&recordId=${lead.id}`)}
          >
            <MessageSquare className="h-4 w-4" />Start / open WhatsApp
          </Button>
          {!isDoctor && !lead.convertedPatientId && (
            <>
              {!lead.partnerId ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowLinkPartnerDialog(true)}
                >
                  <UserPlus className="h-4 w-4" />
                  Link Partner
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-blue-700 border-blue-300"
                    onClick={() => setShowConvertCoupleDialog(true)}
                  >
                    <Users className="h-4 w-4" />
                    Convert Couple
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-muted-foreground"
                    onClick={() => setShowUnlinkConfirmDialog(true)}
                    disabled={unlinkPartner.isPending}
                  >
                    <Link2Off className="h-4 w-4" />
                    Unlink Partner
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-green-700 border-green-300"
                onClick={() => setShowConvertDialog(true)}
              >
                <UserCheck className="h-4 w-4" />
                Convert to Patient
              </Button>
            </>
          )}
          {!isDoctor && !lead.convertedPatientId && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-purple-700 border-purple-300 hover:bg-purple-50"
              onClick={() => setShowMergeDialog(true)}
            >
              <Merge className="h-4 w-4" />
              Merge Duplicate
            </Button>
          )}
          {!isDoctor && !lead.convertedPatientId && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-orange-700 border-orange-300 hover:bg-orange-50"
              onClick={() => setShowLinkToPatientDialog(true)}
            >
              <Link2 className="h-4 w-4" />
              Link to Existing Patient
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() => setShowDeleteLeadDialog(true)}
            >
              <TrashIcon className="h-4 w-4" />
              Delete Lead
            </Button>
          )}
          {/* Request Treatment Plan — visible to non-doctors */}
          {!isDoctor && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-teal-700 border-teal-300 hover:bg-teal-50"
              onClick={() => setShowRequestPlanDialog(true)}
            >
              <Stethoscope className="h-4 w-4" />
              Request Treatment Plan
            </Button>
          )}
          {lead.convertedPatientId && (
            <Link href={`/patients/${lead.convertedPatientId}`}>
              <Button variant="outline" size="sm" className="gap-2">
                <ChevronRight className="h-4 w-4" />
                View Patient Record
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Quick Status Update */}
      {isDoctor ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${LEAD_STATUSES.find(s => s.value === lead.leadStatus)?.color ?? "bg-gray-100"}`}>
            {LEAD_STATUSES.find(s => s.value === lead.leadStatus)?.label ?? lead.leadStatus}
          </span>
          {lead.rating && <span className="text-sm text-muted-foreground">{lead.rating}</span>}
          {lead.assignedStaffId && allUsers && (
            <span className="text-sm text-muted-foreground">Assigned to: {allUsers.find(u => u.id === lead.assignedStaffId)?.name ?? "—"}</span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={lead.leadStatus}
            onValueChange={v => updateLead.mutate({ id: lead.id, data: { leadStatus: v as any } })}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select
            value={lead.rating ?? "_none"}
            onValueChange={v => updateLead.mutate({ id: lead.id, data: { rating: v === "_none" ? undefined : v } })}
          >
            <SelectTrigger className="w-full sm:w-[220px] text-xs">
              <SelectValue placeholder="Set rating..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— No rating —</SelectItem>
              <SelectItem value="⭐⭐⭐⭐⭐ Excellent Candidate">⭐⭐⭐⭐⭐ Excellent Candidate</SelectItem>
              <SelectItem value="⭐⭐⭐⭐ Strong Candidate">⭐⭐⭐⭐ Strong Candidate</SelectItem>
              <SelectItem value="⭐⭐⭐ Good Candidate">⭐⭐⭐ Good Candidate</SelectItem>
              <SelectItem value="⭐ Requires Further Evaluation">⭐ Requires Further Evaluation</SelectItem>
              <SelectItem value="⚠️ Medically Complex Case">⚠️ Medically Complex Case</SelectItem>
              <SelectItem value="💰 Financially Sensitive">💰 Financially Sensitive</SelectItem>
              <SelectItem value="🔄 Low Commitment / Uncertain">🔄 Low Commitment / Uncertain</SelectItem>
              <SelectItem value="❌ Not Eligible">❌ Not Eligible</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={String(lead.assignedStaffId ?? "_none")}
            onValueChange={v => updateLead.mutate({ id: lead.id, data: { assignedStaffId: v !== "_none" ? parseInt(v) : undefined } })}
          >
            <SelectTrigger className="w-full sm:w-[170px]">
              <SelectValue placeholder="Assign staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— Unassigned —</SelectItem>
              {allUsers?.filter(u => ["staff", "admin", "manager"].includes(u.role)).map(u => (
                <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Tags */}
      {!isDoctor && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">Tags</p>
          <TagManager
            selectedTags={(() => { try { const v = lead.tags as any; return Array.isArray(v) ? v : JSON.parse(String(v || "[]")); } catch { return []; } })()}
            onChange={(newTags: string[]) => updateLead.mutate({ id: lead.id, data: { tags: JSON.stringify(newTags) } })}
          />
        </div>
      )}

      {/* Phase 1 — Pending Partner Data banner (shown above tabs so always visible) */}
      {!partner && pendingPartnerData?.hasPendingData && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">Partner data found — no partner linked</p>
            <p className="text-xs text-amber-700 mt-0.5">
              This lead has partner (male) medical data in the intake form but no partner lead is linked.
              {" "}Use the <strong>Link Partner</strong> button above to link an existing lead, or create a new one.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b overflow-x-auto scrollbar-thin">
        <div className="flex items-center gap-0 min-w-max">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === "info" && !partner) refetchPendingPartner();
              }}
              className={`flex items-center gap-1.5 px-3 md:px-4 py-2.5 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "info" && <LeadInfoTab lead={lead} onUpdate={() => refetch()} />}
      {activeTab === "medical-intake" && <MedicalIntakeTab leadId={lead.id} onDataChange={refetchPendingPartner} />}
      {activeTab === "partner-record" && partner && (
        <PartnerRecordTab partnerLeadId={partner.id} partnerName={[partner.firstName, partner.lastName].filter(Boolean).join(" ")} isDoctor={isDoctor} />
      )}
      {activeTab === "notes" && <NotesTab leadId={lead.id} lead={lead} onRefresh={refetch} />}
      {activeTab === "tasks" && <LeadTasksTab leadId={lead.id} leadName={[lead.firstName, (lead as any).middleName, lead.lastName].filter(Boolean).join(" ")} />}
      {activeTab === "appointments" && <LeadAppointmentsTab leadId={lead.id} lead={lead} />}
      {activeTab === "documents" && <DocumentsTab leadId={lead.id} lead={lead} />}
      {activeTab === "treatment-plan" && <TreatmentPlanTabWithSubTabs leadId={lead.id} lead={lead} />}

      {/* Partner banner */}
      {partner && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
          <Link2 className="h-4 w-4 text-blue-600 shrink-0" />
          <span className="text-sm text-blue-800">
            Linked partner: <strong>{partner.firstName} {partner.lastName}</strong>
            {partner.phone && <span className="ml-2 text-blue-600">{partner.phone}</span>}
          </span>
          <Link href={`/leads/${partner.id}`} className="ml-auto">
            <Button variant="ghost" size="sm" className="text-blue-700 h-7 text-xs gap-1">
              <ChevronRight className="h-3.5 w-3.5" /> View Partner Lead
            </Button>
          </Link>
        </div>
      )}

      {/* Phase 1 — Pending Partner Data banner moved above tabs */}

      {/* Convert Dialog */}
      <Dialog open={showConvertDialog} onOpenChange={(open) => { setShowConvertDialog(open); if (!open) setConvertDoctorIds([]); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convert Lead to Patient</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will create a new patient record for <strong>{[lead.firstName, (lead as any).middleName, lead.lastName].filter(Boolean).join(" ")}</strong> and mark this lead as converted. The lead data will be preserved.
            </p>
            {/* Doctor assignment (REQ-2) */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Assign to Doctor(s) <span className="text-destructive">*</span></Label>
              <p className="text-xs text-muted-foreground">Select at least one doctor to assign this patient to.</p>
              <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                {(allDoctorsForConvert ?? []).map((doc: any) => (
                  <label key={doc.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={convertDoctorIds.includes(doc.id)}
                      onChange={(e) => setConvertDoctorIds(prev => e.target.checked ? [...prev, doc.id] : prev.filter(id => id !== doc.id))}
                      className="rounded"
                    />
                    <span className="text-sm">{doc.firstName || doc.name || `Dr. #${doc.id}`} {doc.secondName ?? ""}</span>
                  </label>
                ))}
              </div>
              {convertDoctorIds.length === 0 && <p className="text-xs text-destructive">Please select at least one doctor.</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowConvertDialog(false); setConvertDoctorIds([]); }}>Cancel</Button>
              <Button
                className="gap-2"
                onClick={() => { convertLead.mutate({ leadId: lead.id, doctorIds: convertDoctorIds }); setShowConvertDialog(false); setConvertDoctorIds([]); }}
                disabled={convertLead.isPending || convertDoctorIds.length === 0}
              >
                <CheckCircle className="h-4 w-4" />
                {convertLead.isPending ? "Converting..." : "Convert"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Convert Couple Dialog */}
      <Dialog open={showConvertCoupleDialog} onOpenChange={setShowConvertCoupleDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Convert Couple to Patients</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will create two linked patient records for:
            </p>
            <ul className="text-sm space-y-1 pl-4 list-disc">
              <li>
                <strong>{[lead.firstName, (lead as any).middleName, lead.lastName].filter(Boolean).join(" ")}</strong>
                {(lead as any).convertedPatientId && (
                  <span className="ml-2 text-xs text-amber-600 font-medium">(already converted)</span>
                )}
              </li>
              {partner && (
                <li>
                  <strong>{[partner.firstName, (partner as any).middleName, partner.lastName].filter(Boolean).join(" ")}</strong>
                  {(partner as any).convertedPatientId && (
                    <span className="ml-2 text-xs text-amber-600 font-medium">(already converted)</span>
                  )}
                </li>
              )}
            </ul>
            {((lead as any).convertedPatientId || (partner as any)?.convertedPatientId) && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                <strong>Warning:</strong> One or both leads have already been converted to patients.
                Converting again will fail. Please review the existing patient records first.
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Both leads will be marked as converted and their patient records will be linked as partners. Medical intake data will be transferred.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowConvertCoupleDialog(false)}>Cancel</Button>
              <Button
                className="gap-2"
                onClick={() => {
                  if (partner) {
                    convertCouple.mutate({ lead1Id: lead.id, lead2Id: partner.id });
                    setShowConvertCoupleDialog(false);
                  }
                }}
                disabled={convertCouple.isPending || !partner || !!(lead as any).convertedPatientId || !!(partner as any)?.convertedPatientId}
              >
                <Users className="h-4 w-4" />
                {convertCouple.isPending ? "Converting..." : "Convert Couple"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unlink Partner Confirmation Dialog (P2-5) */}
      <Dialog open={showUnlinkConfirmDialog} onOpenChange={setShowUnlinkConfirmDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Unlink Partner</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Are you sure you want to unlink{" "}
              <strong>{partner ? [partner.firstName, (partner as any).middleName, partner.lastName].filter(Boolean).join(" ") : "this partner"}</strong>
              {" "}from this lead?
            </p>
            {hasMeaningfulReportedPartnerData((unlinkIntake as any)?.intake ?? unlinkIntake, ((unlinkIntake as any)?.intake ?? unlinkIntake as any)?.intakeMode) && (
              <div className="px-3 py-2.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700 dark:bg-slate-800/40 dark:border-slate-600 dark:text-slate-300 text-xs space-y-0.5">
                <p className="font-semibold">Note: Reported partner information will remain</p>
                <p>This Health Record contains partner information entered separately from the linked partner's own record. That information will remain in this Health Record after unlinking and will not be deleted.</p>
              </div>
            )}
            <p className="text-muted-foreground text-xs">Both leads will remain in the system and can be re-linked at any time.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowUnlinkConfirmDialog(false)} disabled={unlinkPartner.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => unlinkPartner.mutate({ leadId: lead.id })}
              disabled={unlinkPartner.isPending}
            >
              {unlinkPartner.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Unlink
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Link Partner Dialog */}
      {showLinkPartnerDialog && (
        <LinkPartnerDialog
          leadId={lead.id}
          onClose={() => setShowLinkPartnerDialog(false)}
          onSuccess={() => { refetch(); refetchPartner(); setShowLinkPartnerDialog(false); }}
        />
      )}

      {/* Delete Lead Dialog */}
      <Dialog open={showDeleteLeadDialog} onOpenChange={setShowDeleteLeadDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <TrashIcon className="h-5 w-5" />
              Delete Lead
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to permanently delete <strong>{[lead.firstName, (lead as any).middleName, lead.lastName].filter(Boolean).join(" ")}</strong>? This will also remove all associated communications, documents, and medical intake data. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDeleteLeadDialog(false)}>Cancel</Button>
              <Button
                variant="destructive"
                className="gap-2"
                onClick={() => { deleteLeadMutation.mutate({ id: lead.id }); setShowDeleteLeadDialog(false); }}
                disabled={deleteLeadMutation.isPending}
              >
                <TrashIcon className="h-4 w-4" />
                {deleteLeadMutation.isPending ? "Deleting..." : "Delete Permanently"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {showMergeDialog && (
        <LeadMergeDialog
          open={showMergeDialog}
          onOpenChange={setShowMergeDialog}
          survivingLead={lead}
        />
      )}

      {/* Request Doctor Review Dialog */}
      <Dialog open={showRequestPlanDialog} onOpenChange={(open) => { setShowRequestPlanDialog(open); if (!open) { setRequestPlanDoctorId(""); setRequestPlanTitle(""); setRequestPlanNotes(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-teal-600" />
              Request Treatment Plan
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">Assign a doctor and request a treatment plan for this lead. The doctor will be notified and the plan will appear in their Treatment Plans dashboard.</p>
            <div className="space-y-2">
              <Label>Doctor *</Label>
              <Select value={requestPlanDoctorId} onValueChange={setRequestPlanDoctorId}>
                <SelectTrigger><SelectValue placeholder="Select a doctor…" /></SelectTrigger>
                <SelectContent>
                  {(allDoctorsForConvert ?? []).map((d: any) => (
                    <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Plan Title (optional)</Label>
              <Input
                value={requestPlanTitle}
                onChange={(e) => setRequestPlanTitle(e.target.value)}
                placeholder={`Treatment Plan - ${new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}`}
              />
              <p className="text-xs text-muted-foreground">Leave blank to auto-generate based on current month.</p>
            </div>
            <div className="space-y-2">
              <Label>Notes for Doctor (optional)</Label>
              <Textarea
                value={requestPlanNotes}
                onChange={(e) => setRequestPlanNotes(e.target.value)}
                placeholder="Patient's current situation, main interests, specific concerns…"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRequestPlanDialog(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!requestPlanDoctorId) { toast.error("Please select a doctor"); return; }
                  requestPlan.mutate({ type: "lead", id: lead.id, doctorId: Number(requestPlanDoctorId), title: requestPlanTitle || undefined, requestNotes: requestPlanNotes || undefined });
                }}
                disabled={requestPlan.isPending || !requestPlanDoctorId}
                className="gap-2"
              >
                {requestPlan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
                Send Request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link to Existing Patient Dialog */}
      {showLinkToPatientDialog && (
        <LinkToExistingPatientDialog
          leadId={lead.id}
          onClose={() => setShowLinkToPatientDialog(false)}
          onSuccess={() => { setShowLinkToPatientDialog(false); refetch(); }}
        />
      )}
    </div>
  );
}

// ─── Link to Existing Patient Dialog ─────────────────────────────────────────
function LinkToExistingPatientDialog({ leadId, onClose, onSuccess }: { leadId: number; onClose: () => void; onSuccess: () => void }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<{ id: number; firstName: string; lastName: string; phone: string | null; mrn: string | null; gender: string | null; dateOfBirth?: Date | null; socialLeadId: string | null } | null>(null);
  const [conflictResolution, setConflictResolution] = useState<"useLeadIntake" | "usePatientIntake" | null>(null);
  const [conflictData, setConflictData] = useState<{ leadIntake: Record<string, unknown>; patientIntake: Record<string, unknown> } | null>(null);
  // DOB warning: backend returned dob_warning status
  const [dobWarningMsg, setDobWarningMsg] = useState<string | null>(null);
  const [dobWarningConfirmed, setDobWarningConfirmed] = useState(false);
  // Gender stamp: lead has gender, patient does not
  const [stampGender, setStampGender] = useState(false);

  // Fetch current lead to get its gender for gender-stamp logic
  const { data: currentLead } = trpc.leads.get.useQuery({ id: leadId });

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: searchResults, isLoading: searching } = trpc.leads.searchPatientsForLink.useQuery(
    { query: debouncedSearch },
    { enabled: debouncedSearch.length >= 2 }
  );

  // When a patient is selected, reset stamp/warning state
  function selectPatient(p: typeof selectedPatient) {
    setSelectedPatient(p);
    setDobWarningMsg(null);
    setDobWarningConfirmed(false);
    // Pre-check gender stamp: lead has gender, patient does not
    const leadGender = (currentLead as any)?.gender;
    setStampGender(!!(leadGender && !p?.gender));
  }

  const linkMutation = trpc.leads.linkToExistingPatient.useMutation({
    onSuccess: (result) => {
      if (result.status === "intake_conflict") {
        setConflictData({ leadIntake: result.leadIntake as Record<string, unknown>, patientIntake: result.patientIntake as Record<string, unknown> });
        return;
      }
      if (result.status === "dob_warning") {
        // Backend returned DOB warning — show confirmation UI
        setDobWarningMsg((result as any).message);
        return;
      }
      toast.success("Lead linked to existing patient successfully");
      onSuccess();
    },
    onError: (e) => {
      toast.error(e.message || "Failed to link to existing patient. Please try again.");
    },
  });

  function handleLink() {
    if (!selectedPatient) return;
    linkMutation.mutate({
      leadId,
      patientId: selectedPatient.id,
      resolveIntakeConflict: conflictResolution ?? undefined,
      stampPatientGender: stampGender || undefined,
      confirmDobWarning: dobWarningConfirmed || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-orange-600" />
            Link to Existing Patient
          </DialogTitle>
        </DialogHeader>

        {conflictData ? (
          // ── Conflict resolution screen ──
          <div className="space-y-4 pt-2">
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              <AlertCircle className="inline h-4 w-4 mr-1" />
              Both the Lead and the Patient have existing Health Record data. Please choose which record to keep as the source of truth. The other record will be detached (not deleted).
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setConflictResolution("usePatientIntake")}
                className={`w-full text-left rounded-md border p-3 text-sm transition-colors ${
                  conflictResolution === "usePatientIntake" ? "border-blue-500 bg-blue-50" : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="font-medium">Keep Patient Health Record</div>
                <div className="text-muted-foreground text-xs mt-0.5">The existing Patient's Health Record becomes the shared record. The Lead's Health Record is detached.</div>
              </button>
              <button
                type="button"
                onClick={() => setConflictResolution("useLeadIntake")}
                className={`w-full text-left rounded-md border p-3 text-sm transition-colors ${
                  conflictResolution === "useLeadIntake" ? "border-blue-500 bg-blue-50" : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="font-medium">Keep Lead Health Record</div>
                <div className="text-muted-foreground text-xs mt-0.5">The Lead's Health Record becomes the shared record. The Patient's Health Record is detached.</div>
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setConflictData(null); setConflictResolution(null); }}>Back</Button>
              <Button
                onClick={handleLink}
                disabled={!conflictResolution || linkMutation.isPending}
                className="gap-2"
              >
                {linkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                Confirm Link
              </Button>
            </div>
          </div>
        ) : (
          // ── Search screen ──
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Search for an existing Patient by name, phone, or MRN. This will link the Lead to the Patient without creating a duplicate.
            </p>
            <div className="relative">
              <Input
                autoFocus
                placeholder="Search by name, phone, or MRN…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {searching && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            {debouncedSearch.length >= 2 && (
              <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
                {!searchResults || searchResults.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground text-center">No patients found</div>
                ) : (
                  searchResults.map((p: any) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPatient(p)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${
                        selectedPatient?.id === p.id ? "bg-blue-50 border-l-2 border-blue-500" : ""
                      }`}
                    >
                      <div className="font-medium">{p.firstName} {p.lastName}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.mrn && <span className="mr-2">{p.mrn}</span>}
                        {p.phone && <span className="mr-2">{p.phone}</span>}
                        {p.gender && <span className="capitalize">{p.gender}</span>}
                        {p.socialLeadId && <span className="ml-2 text-amber-600">(already linked to Lead #{p.socialLeadId})</span>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {selectedPatient && (
              <div className="rounded-md bg-muted/50 border p-3 text-sm space-y-2">
                <div className="font-medium text-foreground">Selected: {selectedPatient.firstName} {selectedPatient.lastName}</div>
                <div className="text-muted-foreground text-xs">
                  {selectedPatient.mrn && <span className="mr-2">{selectedPatient.mrn}</span>}
                  {selectedPatient.phone && <span className="mr-2">{selectedPatient.phone}</span>}
                  {selectedPatient.gender && <span className="capitalize mr-2">{selectedPatient.gender}</span>}
                  {selectedPatient.dateOfBirth && <span>{fmtDateAge(selectedPatient.dateOfBirth)}</span>}
                </div>
                {selectedPatient.socialLeadId && (
                  <div className="text-amber-700 text-xs flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    This patient is already linked to Lead #{selectedPatient.socialLeadId} and cannot be linked to another Lead unless unlinked first.
                  </div>
                )}
                {/* Gender stamp confirmation: lead has gender, patient does not */}
                {(currentLead as any)?.gender && !selectedPatient.gender && (
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stampGender}
                      onChange={e => setStampGender(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-border"
                    />
                    <span className="text-xs text-foreground">
                      Patient gender is missing. Set Patient gender to{" "}
                      <strong className="capitalize">{(currentLead as any).gender}</strong>?
                    </span>
                  </label>
                )}
                {/* DOB warning: backend returned minor mismatch */}
                {dobWarningMsg && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5">
                    <div className="flex items-start gap-1.5 text-amber-800 text-xs">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{dobWarningMsg}</span>
                    </div>
                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dobWarningConfirmed}
                        onChange={e => setDobWarningConfirmed(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-border"
                      />
                      <span className="text-xs text-amber-900 font-medium">I confirm and want to proceed with linking</span>
                    </label>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                onClick={handleLink}
                disabled={!selectedPatient || linkMutation.isPending || (dobWarningMsg !== null && !dobWarningConfirmed)}
                className="gap-2"
              >
                {linkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                Link to Patient
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Link Partner Dialog ─────────────────────────────────────────────────────
function LinkPartnerDialog({ leadId, onClose, onSuccess }: { leadId: number; onClose: () => void; onSuccess: () => void }) {
  const [search, setSearch] = useState("");
  const { data: leadsResult } = trpc.leads.list.useQuery({ pageSize: 1000 });
  const leads = leadsResult?.data;
  // Fetch current lead to get DOB
  const { data: currentLead } = trpc.leads.get.useQuery({ id: leadId });
  // P2-4: Fetch current lead's intake to detect reported partner data
  const { data: currentIntake } = trpc.leads.medicalIntake.useQuery({ leadId });
  // DOB conflict state
  const [dobConflict, setDobConflict] = useState<{ partnerId: number; currentDob: string; partnerDob: string; partnerName: string } | null>(null);
  const updateLeadDob = trpc.leads.update.useMutation();
  const linkPartner = trpc.leads.linkPartner.useMutation({
    onSuccess: () => { toast.success("Partner linked successfully"); onSuccess(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });
  // Quick-create new lead state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const utils = trpc.useUtils();
  const createAndLink = trpc.leads.create.useMutation({
    onSuccess: async (newLead: any) => {
      await utils.leads.list.invalidate();
      toast.success("New lead created and linked as partner");
      linkPartner.mutate({ leadId, partnerId: newLead.id });
    },
    onError: (e) => {
      const msg = (e as any)?.data?.zodError ? "Please check the form fields." : (e.message || "Failed to create lead.");
      toast.error(msg);
    },
  });
  const handleQuickCreate = () => {
    if (!createForm.firstName.trim() || !createForm.lastName.trim()) {
      toast.error("First name and last name are required.");
      return;
    }
    createAndLink.mutate({
      firstName: createForm.firstName.trim(),
      lastName: createForm.lastName.trim(),
      phone: createForm.phone.trim() || undefined,
      email: createForm.email.trim() || undefined,
    });
  };

  const handleSelectPartner = (partner: any) => {
    const currentDob = currentLead?.dateOfBirth ? new Date(currentLead.dateOfBirth as any).toISOString().split("T")[0] : "";
    const partnerDob = partner.dateOfBirth ? new Date(partner.dateOfBirth as any).toISOString().split("T")[0] : "";
    const partnerName = [partner.firstName, partner.middleName, partner.lastName].filter(Boolean).join(" ");
    // Check for DOB conflict: both have DOBs and they differ
    if (currentDob && partnerDob && currentDob !== partnerDob) {
      setDobConflict({ partnerId: partner.id, currentDob, partnerDob, partnerName });
      return;
    }
    linkPartner.mutate({ leadId, partnerId: partner.id });
  };

  const resolveDobConflict = async (keepCurrent: boolean) => {
    if (!dobConflict) return;
    // If user chose to keep partner's DOB, update current lead's DOB
    if (!keepCurrent) {
      await updateLeadDob.mutateAsync({ id: leadId, data: { dateOfBirth: new Date(dobConflict.partnerDob) } as any });
    }
    linkPartner.mutate({ leadId, partnerId: dobConflict.partnerId });
    setDobConflict(null);
  };

  const filtered = ((leads ?? []) as any[]).filter(l =>
    l.id !== leadId &&
    !l.partnerId &&
    !l.convertedPatientId &&
    (
      `${l.firstName} ${l.middleName ?? ""} ${l.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      (l.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (l.phone ?? "").includes(search)
    )
  ).slice(0, 10);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link Partner Lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Search for another lead to link as the partner (spouse/partner) for this couple.</p>
          {/* P2-4: Reported partner data notice */}
          {hasMeaningfulReportedPartnerData((currentIntake as any)?.intake ?? currentIntake, ((currentIntake as any)?.intake ?? currentIntake as any)?.intakeMode) && (
            <div className="px-3 py-2.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700 dark:bg-slate-800/40 dark:border-slate-600 dark:text-slate-300 text-xs space-y-0.5">
              <p className="font-semibold">This Health Record contains reported partner information</p>
              <p>Linking a partner will make their own Health Record the authoritative source for their medical information. The information recorded here will remain stored separately.</p>
            </div>
          )}
          <Input
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {dobConflict ? (
            <div className="space-y-3">
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3 text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-300 mb-2">⚠ Date of Birth Conflict Detected</p>
                <p className="text-muted-foreground mb-3">Both leads have different dates of birth. Which one is correct?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="px-3 py-2 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 text-left"
                    onClick={() => resolveDobConflict(true)}
                    disabled={linkPartner.isPending || updateLeadDob.isPending}
                  >
                    <div className="text-xs text-muted-foreground">Keep current lead's DOB</div>
                    <div className="font-semibold text-sm">{fmtDate(dobConflict.currentDob)}</div>
                  </button>
                  <button
                    className="px-3 py-2 rounded-md border border-green-200 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 text-left"
                    onClick={() => resolveDobConflict(false)}
                    disabled={linkPartner.isPending || updateLeadDob.isPending}
                  >
                    <div className="text-xs text-muted-foreground">Use {dobConflict.partnerName}'s DOB</div>
                    <div className="font-semibold text-sm">{fmtDate(dobConflict.partnerDob)}</div>
                  </button>
                </div>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setDobConflict(null)}>Back</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {search ? "No matching leads found" : "Type to search leads"}
                  </p>
                ) : (
                  filtered.map(l => (
                    <button
                      key={l.id}
                      className="w-full text-left px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
                      onClick={() => handleSelectPartner(l)}
                      disabled={linkPartner.isPending}
                    >
                      <div className="font-medium text-sm">{[l.firstName, l.middleName, l.lastName].filter(Boolean).join(" ")}</div>
                      <div className="text-xs text-muted-foreground">{l.email ?? l.phone ?? ""}</div>
                    </button>
                  ))
                )}
              </div>
                            {/* Create New Lead button */}
              <div className="border-t pt-3 mt-1">
                {!showCreateForm ? (
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors text-sm font-medium"
                    onClick={() => setShowCreateForm(true)}
                  >
                    <Plus className="w-4 h-4" />
                    Create New Lead &amp; Link as Partner
                  </button>
                ) : (
                  <div className="space-y-3 rounded-md border border-primary/20 bg-muted/30 p-3">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide">New Lead</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs mb-1 block">First Name *</Label>
                        <Input
                          placeholder="First name"
                          value={createForm.firstName}
                          onChange={e => setCreateForm(f => ({ ...f, firstName: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">Last Name *</Label>
                        <Input
                          placeholder="Last name"
                          value={createForm.lastName}
                          onChange={e => setCreateForm(f => ({ ...f, lastName: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Phone</Label>
                      <Input
                        placeholder="+1 234 567 8900"
                        value={createForm.phone}
                        onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Email</Label>
                      <Input
                        placeholder="email@example.com"
                        value={createForm.email}
                        onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setShowCreateForm(false)} disabled={createAndLink.isPending || linkPartner.isPending}>
                        Back
                      </Button>
                      <Button size="sm" onClick={handleQuickCreate} disabled={createAndLink.isPending || linkPartner.isPending}>
                        {(createAndLink.isPending || linkPartner.isPending) ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <UserPlus className="w-3 h-3 mr-1" />}
                        Create &amp; Link
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
// ─── Lead Info Tab ────────────────────────────────────────────────────────────
function LeadInfoTab({ lead, onUpdate }: { lead: any; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const utils = trpc.useUtils();

  // ── Read-through: fetch linked Patient demographics when lead is linked ──
  const linkedPatientId = (lead as any).convertedPatientId as number | null | undefined;
  const { data: linkedPatient, refetch: refetchLinkedPatient } = trpc.patients.get.useQuery(
    { id: linkedPatientId! },
    { enabled: !!linkedPatientId, staleTime: 0 }
  );
  const { form, setForm, hasDraft, clearDraft, initFromServer } = useDraftForm<any>({
    key: `lead_info_draft_${lead.id}`,
    initialData: {},
  });
  // G-fix Part C: Stable identity baseline captured at edit-open time.
  // Used to detect whether identity fields actually changed before calling updatePatientIdentity.
  // Must not be a live query object — it is a snapshot from the moment Edit was opened.
  const identityBaselineRef = useRef<{
    firstName: string; middleName: string; lastName: string;
    dateOfBirth: string; gender: string | null;
  } | null>(null);
  // G-fix Part A: Track whether the linked Patient identity is being fetched (for loading state).
  const [identityFetching, setIdentityFetching] = useState(false);

  // ── Dynamic dropdown options from Settings (staleTime:0 = always fresh) ──────
  const { data: dynMedicalInterests } = trpc.dropdownOptions.list.useQuery({ fieldKey: "main_medical_interest" }, { staleTime: 0 });
  const { data: dynFemaleDiagnoses } = trpc.dropdownOptions.list.useQuery({ fieldKey: "female_fertility_diagnosis" }, { staleTime: 0 });
  const { data: dynMaleDiagnoses } = trpc.dropdownOptions.list.useQuery({ fieldKey: "male_fertility_diagnosis" }, { staleTime: 0 });

    // Convert flat DB options into MultiSelectDiagnosis format { main, subs }
  // NOTE: toMultiSelectOptions is kept for medical interest and male diagnosis (no hidden-option logic needed).
  // Female diagnosis now uses the shared femaleDiagnosisAdapter.
  const toMultiSelectOptions = (
    dynOpts: typeof dynMedicalInterests,
    fallback: { main: string; subs: string[] }[]
  ): { main: string; subs: string[] }[] => {
    if (!dynOpts) return fallback;
    const active = dynOpts.filter(o => o.isActive !== false);
    if (!active.length) return fallback;
    const hasGroups = active.some(o => o.groupLabel);
    if (!hasGroups) return active.map(o => ({ main: o.label, subs: [] }));
    const map = new Map<string, string[]>();
    const ungrouped: string[] = [];
    for (const o of active) {
      if (!o.groupLabel) { ungrouped.push(o.label); continue; }
      if (!map.has(o.groupLabel)) map.set(o.groupLabel, []);
      map.get(o.groupLabel)!.push(o.label);
    }
    const result: { main: string; subs: string[] }[] = [];
    for (const label of ungrouped) result.push({ main: label, subs: [] });
    for (const [group, items] of Array.from(map.entries())) {
      result.push({ main: group, subs: items });
    }
    return result;
  };
  const dynamicMedicalInterestOptions = toMultiSelectOptions(dynMedicalInterests, [
    { main: "IVF with ICSI", subs: [] },
    { main: "IUI", subs: [] },
    { main: "PGT (Preimplantation Genetic Testing)", subs: [] },
    { main: "Egg Freezing", subs: [] },
    { main: "Fertility Check-up (Couple)", subs: [] },
    { main: "Fertility Check-up (Female)", subs: [] },
    { main: "Fertility Check-up (Male)", subs: [] },
    { main: "Sperm Test", subs: [] },
    { main: "Hysteroscopy", subs: [] },
    { main: "HSG", subs: [] },
    { main: "PRP", subs: [] },
    { main: "Exosome", subs: [] },
    { main: "Other / Not sure yet", subs: [] },
  ]);
  // ── Female diagnosis: shared adapter (supports hidden/orphan preservation) ──
  const currentFemaleDx: string[] = Array.isArray(form.fertilityDiagnosis) ? form.fertilityDiagnosis : [];
  const dynamicFemaleDiagnosisOptions = buildFemaleDiagnosisGroups(
    dynFemaleDiagnoses as RawDropdownOption[] | null | undefined,
    currentFemaleDx,
  );
  const dynamicMaleDiagnosisOptions = toMultiSelectOptions(dynMaleDiagnoses, MALE_DIAGNOSIS_OPTIONS);

  // Build the canonical initial form data, reading identity from Patient when linked
  // Q3 fix: buildInitialData accepts an optional freshLinkedPatient argument.
  // When called from the Edit button handler, we pass the freshly-refetched Patient data
  // directly (not the possibly-stale linkedPatient React state) to prevent stale-form-on-open.
  const buildInitialData = (freshLinkedPatient?: typeof linkedPatient) => {
    const identitySource = (freshLinkedPatient ?? linkedPatient) ?? lead;
    return {
      firstName: identitySource.firstName ?? "",
      middleName: (identitySource as any).middleName ?? "",
      lastName: identitySource.lastName ?? "",
      gender: (identitySource as any).gender ?? null,
      dateOfBirth: toDateInputValue((identitySource as any).dateOfBirth),
      // CRM/contact fields always from Lead
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      nationality: lead.nationality ?? "",
      country: lead.country ?? "",
      city: lead.city ?? "",
      // Q6 fix: Lead now uses multi-select for preferredContactMethods (same as Patient form)
      preferredContactMethods: Array.isArray(lead.preferredContactMethods)
        ? lead.preferredContactMethods
        : (lead.preferredContactMethods ? [lead.preferredContactMethods as string] : []),
      preferredLanguages: Array.isArray(lead.preferredLanguages) ? lead.preferredLanguages : (lead.preferredLanguages ? [lead.preferredLanguages as string] : []),
      primaryLanguage: (lead as any).primaryLanguage ?? (Array.isArray(lead.preferredLanguages) ? lead.preferredLanguages[0] : lead.preferredLanguages as string) ?? null,
      leadSource: lead.leadSource ?? "",
      campaignName: (lead as any).campaignName ?? "",
      budgetRange: lead.budgetRange ?? "",
      decisionTimeline: lead.decisionTimeline ?? "",
      travelReadiness: lead.travelReadiness ?? "",
      nextFollowUpDate: lead.nextFollowUpDate ? format(new Date(lead.nextFollowUpDate), "yyyy-MM-dd") : "",
      accommodationHotel: lead.accommodationHotel ?? "",
      accommodationLocation: lead.accommodationLocation ?? "",
      transportationAirportPickup: lead.transportationAirportPickup ?? null,
      transportationLocalTransfer: lead.transportationLocalTransfer ?? null,
      ivfExperience: lead.ivfExperience ?? "",
      fertilityDiagnosis: Array.isArray(lead.fertilityDiagnosis) ? lead.fertilityDiagnosis : [],
      maleFertilityDiagnosis: Array.isArray((lead as any).maleFertilityDiagnosis) ? (lead as any).maleFertilityDiagnosis : [],
      mainMedicalInterest: (() => { const v = lead.mainMedicalInterest; if (Array.isArray(v)) return v; if (typeof v === "string" && v.startsWith("[")) { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [v]; } catch { return [v]; } } return v ? [v as string] : []; })(),
      notes: lead.notes ?? "",
      secondaryPhone: lead.secondaryPhone ?? "",
      secondaryEmail: lead.secondaryEmail ?? "",
      patientType: (lead as any).patientType ?? "",
      brand: (lead as any).brand ?? "fertiliv",
      contactRole: (lead as any).contactRole ?? null,
      serviceFor: (lead as any).serviceFor ?? null,
    };
  };

  useEffect(() => {
    initFromServer(buildInitialData());
  }, [lead, linkedPatient]);

  const { options: languageOptions } = useReferenceData("language");
  const updateLead = trpc.leads.update.useMutation();
  const updatePatientIdentity = trpc.patients.update.useMutation();

  const handleSave = async () => {
    // Auto-reflect: if "Male factor infertility" is in female diagnosis, ensure it is also in male diagnosis
    const femaleDx: string[] = Array.isArray(form.fertilityDiagnosis) ? form.fertilityDiagnosis : [];
    let maleDx: string[] = Array.isArray((form as any).maleFertilityDiagnosis) ? (form as any).maleFertilityDiagnosis : [];
    if (femaleDx.includes("Male factor infertility") && !maleDx.includes("Male factor infertility")) {
      maleDx = ["Male factor infertility", ...maleDx];
    }

    // ── CRM/contact fields always saved to Lead ──
    const leadPayload = {
      email: form.email || undefined,
      phone: form.phone || undefined,
      secondaryPhone: form.secondaryPhone || undefined,
      secondaryEmail: form.secondaryEmail || undefined,
      nationality: form.nationality || undefined,
      country: form.country || undefined,
      city: form.city || undefined,
      preferredContactMethods: Array.isArray((form as any).preferredContactMethods) ? (form as any).preferredContactMethods : [],
      preferredLanguages: (form as any).preferredLanguages?.length > 0 ? (form as any).preferredLanguages : undefined,
      primaryLanguage: (form as any).primaryLanguage || null,
      leadSource: form.leadSource || undefined,
      campaignName: (form as any).campaignName || undefined,
      budgetRange: form.budgetRange || undefined,
      decisionTimeline: form.decisionTimeline || undefined,
      travelReadiness: form.travelReadiness || undefined,
      nextFollowUpDate: form.nextFollowUpDate ? new Date(form.nextFollowUpDate) : undefined,
      accommodationHotel: form.accommodationHotel || undefined,
      accommodationLocation: form.accommodationLocation || undefined,
      transportationAirportPickup: form.transportationAirportPickup ?? null,
      transportationLocalTransfer: form.transportationLocalTransfer ?? null,
      ivfExperience: form.ivfExperience || undefined,
      fertilityDiagnosis: femaleDx,
      maleFertilityDiagnosis: maleDx,
      mainMedicalInterest: form.mainMedicalInterest || undefined,
      notes: form.notes || undefined,
      patientType: (form as any).patientType || undefined,
      brand: (form as any).brand || undefined,
      contactRole: (form as any).contactRole || null,
      serviceFor: (form as any).serviceFor || null,
    } as any;

    try {
      if (linkedPatientId && linkedPatient) {
        // G-fix Part C: Only call updatePatientIdentity when an identity field actually changed.
        // Compare form values against the stable baseline captured at edit-open time.
        // Normalize DOB to yyyy-MM-dd string before comparing to avoid format false-positives.
        // Normalize null/undefined/"" to "" for name fields (trimmed).
        const baseline = identityBaselineRef.current;
        const formDob = toDateInputValue((form as any).dateOfBirth);
        const formGender = (form.gender === "male" || form.gender === "female") ? form.gender : null;
        const identityChanged = !baseline || (
          (form.firstName ?? "").trim() !== (baseline.firstName ?? "").trim() ||
          ((form as any).middleName ?? "").trim() !== (baseline.middleName ?? "").trim() ||
          (form.lastName ?? "").trim() !== (baseline.lastName ?? "").trim() ||
          formDob !== (baseline.dateOfBirth ?? "") ||
          formGender !== baseline.gender
        );

        if (identityChanged) {
          // ── Split save: identity → Patient, CRM → Lead (parallel) ──
          await Promise.all([
            updatePatientIdentity.mutateAsync({
              id: linkedPatientId,
              data: {
                firstName: form.firstName || undefined,
                middleName: (form as any).middleName || undefined,
                lastName: form.lastName || undefined,
                dateOfBirth: (form as any).dateOfBirth ? new Date((form as any).dateOfBirth) : undefined,
                // G-fix Part B: Only send gender when it is a confirmed valid enum value.
                // "" / null / unresolved → omit entirely (undefined = "do not change Patient gender").
                gender: formGender ?? undefined,
              },
            }),
            updateLead.mutateAsync({ id: lead.id, data: leadPayload }),
          ]);
        } else {
          // CRM-only save: identity fields unchanged, skip updatePatientIdentity entirely.
          await updateLead.mutateAsync({ id: lead.id, data: leadPayload });
        }
      } else {
        // ── Unlinked Lead: save everything to Lead ──
        await updateLead.mutateAsync({
          id: lead.id,
          data: {
            ...leadPayload,
            firstName: form.firstName || undefined,
            middleName: (form as any).middleName || undefined,
            lastName: form.lastName || undefined,
            dateOfBirth: (form as any).dateOfBirth ? new Date((form as any).dateOfBirth) : undefined,
            gender: (form.gender as any) ?? null,
          } as any,
        });
      }
      // Broad invalidation: Lead + Patient list/detail so both sides reflect changes immediately
      // without requiring a manual browser refresh on either page.
      await utils.leads.get.invalidate({ id: lead.id });
      await utils.leads.list.invalidate();
      if (linkedPatientId) {
        await utils.patients.get.invalidate({ id: linkedPatientId });
        await utils.patients.list.invalidate();
        await refetchLinkedPatient();
      }
      toast.success("Changes saved");
      clearDraft();
      setEditing(false);
      onUpdate();
    } catch (e: any) {
      const isZodError = (e as any)?.data?.zodError;
      const isDbError = e.message?.includes('Failed query') || e.message?.includes('DrizzleQuery') || e.message?.includes('Unknown column');
      const msg = isZodError
        ? "Please check the form fields and try again."
        : isDbError
        ? "Failed to save changes. Please try again or contact support."
        : (e.message || "Something went wrong. Please try again.");
      toast.error(msg);
      console.error('[LeadInfoTab] Save error:', e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {editing ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              clearDraft();
              setEditing(false);
              initFromServer(buildInitialData());
            }}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={updateLead.isPending || updatePatientIdentity.isPending} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              {(updateLead.isPending || updatePatientIdentity.isPending) ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" disabled={identityFetching} onClick={async () => {
            // G-fix Part A v2: For linked Leads, we MUST have fresh Patient identity before opening Edit.
            // We do NOT call clearDraft() — CRM draft fields must be preserved.
            // Instead we merge fresh Patient identity fields ON TOP of the current form state.
            if (linkedPatientId) {
              setIdentityFetching(true);
              try {
                const result = await refetchLinkedPatient();
                if (!result.data) {
                  toast.error("Could not load the linked Patient identity. Please try again.");
                  return;
                }
                // G-fix Part C: Capture a stable identity baseline snapshot at edit-open time.
                const p = result.data as any;
                const freshDob = toDateInputValue(p.dateOfBirth);
                const freshGender = (p.gender === "male" || p.gender === "female") ? p.gender : null;
                identityBaselineRef.current = {
                  firstName: p.firstName ?? "",
                  middleName: p.middleName ?? "",
                  lastName: p.lastName ?? "",
                  dateOfBirth: freshDob,
                  gender: freshGender,
                };
                // G-fix Part A v2: Merge fresh Patient identity over the current form.
                // setForm writes to localStorage, so the merged state replaces any stale
                // blank identity that was previously saved in the draft.
                // CRM/contact/logistics fields from the existing form are fully preserved.
                const hadDraft = hasDraft;
                setForm((prev: any) => ({
                  ...prev,
                  firstName: p.firstName ?? "",
                  middleName: p.middleName ?? "",
                  lastName: p.lastName ?? "",
                  dateOfBirth: freshDob,
                  gender: freshGender,
                }));
                if (hadDraft) {
                  toast.info("Linked Patient identity was refreshed. Your unsaved Lead/CRM draft fields were preserved.");
                }
              } catch {
                toast.error("Could not load the linked Patient identity. Please try again.");
                return;
              } finally {
                setIdentityFetching(false);
              }
            } else {
              // Unlinked Lead: no Patient fetch needed — initFromServer still used
              identityBaselineRef.current = null;
              initFromServer(buildInitialData());
            }
            setEditing(true);
          }} className="gap-1.5">
            <Edit className="h-3.5 w-3.5" /> Edit
          </Button>
        )}
      </div>

      <DraftBanner
        hasDraft={hasDraft && !editing}
        onDiscard={() => { clearDraft(); initFromServer(buildInitialData()); }}
        onResume={() => setEditing(true)}
      />

      {/* Read-through banner: shown when lead is linked to a Patient */}
      {linkedPatientId && linkedPatient && (
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-2">
          <UserCheck className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-800">
              This Lead is linked to Patient{" "}
              <Link href={`/patients/${linkedPatientId}`} className="underline hover:text-blue-900">
                {linkedPatient.firstName} {linkedPatient.lastName}
              </Link>.
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              {editing
                ? "Name, gender, and date of birth are saved to the Patient record. Contact and CRM fields are saved to the Lead."
                : "Clinical identity (name, gender, date of birth) is shown from the Patient record."}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Personal Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <>
                {linkedPatientId && linkedPatient && (
                  <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
                    <UserCheck className="h-3 w-3 shrink-0" />
                    <span>Name, gender, and date of birth are saved to the Patient record.</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">First Name</Label>
                    <Input value={form.firstName} onChange={e => setForm((f: any) => ({ ...f, firstName: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Last Name</Label>
                    <Input value={form.lastName} onChange={e => setForm((f: any) => ({ ...f, lastName: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Middle Name <span className="text-muted-foreground">(optional)</span></Label>
                  <Input value={(form as any).middleName ?? ""} onChange={e => setForm((f: any) => ({ ...f, middleName: e.target.value }))} placeholder="Middle name" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={form.email} onChange={e => setForm((f: any) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Secondary Email</Label>
                  <Input type="email" value={form.secondaryEmail} onChange={e => setForm((f: any) => ({ ...f, secondaryEmail: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input value={form.phone} onChange={e => setForm((f: any) => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Secondary Phone</Label>
                  <Input value={form.secondaryPhone} onChange={e => setForm((f: any) => ({ ...f, secondaryPhone: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Nationality</Label>
                    <SearchableCombobox
                      value={form.nationality}
                      onChange={v => setForm((f: any) => ({ ...f, nationality: v }))}
                      options={NATIONALITIES}
                      placeholder="Select nationality..."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Country</Label>
                    <SearchableCombobox
                      value={form.country}
                      onChange={v => setForm((f: any) => ({ ...f, country: v }))}
                      options={COUNTRY_NAMES}
                      placeholder="Select country..."
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">City</Label>
                  <Input value={form.city} onChange={e => setForm((f: any) => ({ ...f, city: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Date of Birth</Label>
                  <CalendarDateInput
                    value={(form as any).dateOfBirth ?? ""}
                    onChange={v => setForm((f: any) => ({ ...f, dateOfBirth: v }))}
                    max={new Date().toISOString().split("T")[0]}
                    min="1900-01-01"
                    clearable
                    aria-label="Date of Birth"
                  />
                  {(form as any).dateOfBirth && (
                    <p className="text-xs text-muted-foreground">
                      Age: {Math.floor((Date.now() - new Date((form as any).dateOfBirth + "T00:00:00").getTime()) / (365.25 * 24 * 60 * 60 * 1000))} years old
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Gender</Label>
                  <Select value={form.gender || "_none"} onValueChange={v => setForm((f: any) => ({ ...f, gender: v === "_none" ? null : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Not specified —</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <dl className="space-y-2 text-sm">
                {/* Clinical identity: read from Patient when linked, otherwise from Lead */}
                {linkedPatient ? (
                  <>
                    <InfoRow
                      label="Name"
                      value={[linkedPatient.firstName, (linkedPatient as any).middleName, linkedPatient.lastName].filter(Boolean).join(" ")}
                      badge="from Patient"
                    />
                    <InfoRow
                      label="Date of Birth"
                      value={linkedPatient.dateOfBirth ? fmtDateAge(linkedPatient.dateOfBirth) : undefined}
                      badge="from Patient"
                    />
                    <InfoRow
                      label="Gender"
                      value={linkedPatient.gender ? linkedPatient.gender.charAt(0).toUpperCase() + linkedPatient.gender.slice(1) : undefined}
                      badge="from Patient"
                    />
                  </>
                ) : (
                  <>
                    <InfoRow label="Name" value={[lead.firstName, (lead as any).middleName, lead.lastName].filter(Boolean).join(" ")} />
                    <InfoRow label="Date of Birth" value={lead.dateOfBirth ? fmtDateAge(lead.dateOfBirth) : undefined} />
                    <InfoRow label="Gender" value={lead.gender ? lead.gender.charAt(0).toUpperCase() + lead.gender.slice(1) : undefined} />
                  </>
                )}
                {/* CRM/contact fields: always from Lead */}
                <InfoRow label="Email" value={lead.email} />
                {lead.secondaryEmail && <InfoRow label="Secondary Email" value={lead.secondaryEmail} />}
                <InfoRow label="Phone" value={lead.phone} />
                {lead.secondaryPhone && <InfoRow label="Secondary Phone" value={lead.secondaryPhone} />}
                <InfoRow label="Nationality" value={lead.nationality} />
                <InfoRow label="Country" value={lead.country} />
                <InfoRow label="City" value={lead.city} />
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Lead Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Lead Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Preferred Contact</Label>
                  {/* Q6 fix: multi-select using shared CONTACT_METHODS constant (5 values) */}
                  <MultiSelect
                    options={CONTACT_METHODS}
                    value={Array.isArray((form as any).preferredContactMethods) ? (form as any).preferredContactMethods : []}
                    onChange={v => setForm((f: any) => ({ ...f, preferredContactMethods: v }))}
                    placeholder="Select contact methods"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Languages <span className="text-muted-foreground text-[10px]">(select all, then mark primary)</span></Label>
                  <LanguageSelectWithPrimary
                    languages={(form as any).preferredLanguages ?? []}
                    primaryLanguage={(form as any).primaryLanguage ?? null}
                    onLanguagesChange={v => setForm((f: any) => ({ ...f, preferredLanguages: v }))}
                    onPrimaryChange={v => setForm((f: any) => ({ ...f, primaryLanguage: v }))}
                    options={languageOptions.length > 0 ? languageOptions : undefined}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Lead Source</Label>
                  <Select value={form.leadSource || "_none"} onValueChange={v => setForm((f: any) => ({ ...f, leadSource: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
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
                <div className="space-y-1">
                  <Label className="text-xs">Brand</Label>
                  <Select value={(form as any).brand || "fertiliv"} onValueChange={v => setForm((f: any) => ({ ...f, brand: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fertiliv">Fertiliv</SelectItem>
                      <SelectItem value="safemedigo">Safemedigo</SelectItem>
                      <SelectItem value="dr-nilay-karaca">Dr. Nilay Karaca</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Patient Type</Label>
                  <Select value={(form as any).patientType || "not-specified"} onValueChange={v => setForm((f: any) => ({ ...f, patientType: v === "not-specified" ? null : v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not-specified">— Not Specified —</SelectItem>
                      <SelectItem value="international">🌍 International</SelectItem>
                      <SelectItem value="local">🇹🇷 Local (Turkey)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Phase 1 — informational metadata */}
                <div className="space-y-1">
                  <Label className="text-xs">Who are we talking to? <span className="text-muted-foreground font-normal">(informational)</span></Label>
                  <Select value={(form as any).contactRole || "unknown"} onValueChange={v => setForm((f: any) => ({ ...f, contactRole: v === "unknown" ? null : v }))}>
                    <SelectTrigger><SelectValue placeholder="— Not specified —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unknown">— Not specified —</SelectItem>
                      <SelectItem value="female-patient">Female patient (herself)</SelectItem>
                      <SelectItem value="male-patient">Male patient (himself)</SelectItem>
                      <SelectItem value="husband-for-couple">Husband / male partner contacting for couple</SelectItem>
                      <SelectItem value="wife-for-couple">Wife / female partner contacting for couple</SelectItem>
                      <SelectItem value="family-member">Family member</SelectItem>
                      <SelectItem value="agent">Agent / Third party</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Service for whom? <span className="text-muted-foreground font-normal">(informational)</span></Label>
                  <Select value={(form as any).serviceFor || "unknown"} onValueChange={v => setForm((f: any) => ({ ...f, serviceFor: v === "unknown" ? null : v }))}>
                    <SelectTrigger><SelectValue placeholder="— Not specified —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unknown">— Not specified —</SelectItem>
                      <SelectItem value="female-only">Female only</SelectItem>
                      <SelectItem value="male-only">Male only</SelectItem>
                      <SelectItem value="couple">Couple</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Campaign Name</Label>
                  <Input placeholder="e.g. Spring 2025" value={(form as any).campaignName ?? ""} onChange={e => setForm((f: any) => ({ ...f, campaignName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Budget Range</Label>
                  <Select value={form.budgetRange || "_none"} onValueChange={v => setForm((f: any) => ({ ...f, budgetRange: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select budget range" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Not specified —</SelectItem>
                      <SelectItem value="Under $1,000">Under $1,000</SelectItem>
                      <SelectItem value="$1,000 – $2,000">$1,000 – $2,000</SelectItem>
                      <SelectItem value="$2,000 – $3,000">$2,000 – $3,000</SelectItem>
                      <SelectItem value="$3,000 – $4,000">$3,000 – $4,000</SelectItem>
                      <SelectItem value="$4,000 – $5,000">$4,000 – $5,000</SelectItem>
                      <SelectItem value="$5,000 – $6,000">$5,000 – $6,000</SelectItem>
                      <SelectItem value="$6,000 – $7,000">$6,000 – $7,000</SelectItem>
                      <SelectItem value="$7,000 – $8,000">$7,000 – $8,000</SelectItem>
                      <SelectItem value="$8,000 – $9,000">$8,000 – $9,000</SelectItem>
                      <SelectItem value="$9,000+">$9,000+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Decision Timeline</Label>
                  <Select value={form.decisionTimeline || "_none"} onValueChange={v => setForm((f: any) => ({ ...f, decisionTimeline: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select timeline" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      <SelectItem value="immediately">As soon as possible / Immediately</SelectItem>
                      <SelectItem value="1-2-weeks">1–2 weeks</SelectItem>
                      <SelectItem value="1-month">1 month</SelectItem>
                      <SelectItem value="2-months">2 months</SelectItem>
                      <SelectItem value="3-months">3 months</SelectItem>
                      <SelectItem value="1-3-months">1–3 months</SelectItem>
                      <SelectItem value="6-months">6 months</SelectItem>
                      <SelectItem value="exploring">Exploring / Not sure</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Travel Readiness</Label>
                  <Select value={form.travelReadiness || "_none"} onValueChange={v => setForm((f: any) => ({ ...f, travelReadiness: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select readiness" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      <SelectItem value="ready">Yes, I am ready to travel</SelectItem>
                      <SelectItem value="considering">I am considering traveling and comparing options</SelectItem>
                      <SelectItem value="prefers-home">I prefer treatment in my home country</SelectItem>
                      <SelectItem value="local-patient">Local patient</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Main Medical Interest</Label>
                  <MultiSelectDiagnosis
                    label="Main Medical Interest"
                    value={Array.isArray(form.mainMedicalInterest) ? form.mainMedicalInterest : []}
                    onChange={v => setForm((f: any) => ({ ...f, mainMedicalInterest: v }))}
                    options={dynamicMedicalInterestOptions}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">IVF Experience</Label>
                  <Select value={form.ivfExperience || "_none"} onValueChange={v => setForm((f: any) => ({ ...f, ivfExperience: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Not specified —</SelectItem>
                      <SelectItem value="never-tried">Never tried</SelectItem>
                      <SelectItem value="tried-unsuccessful">Tried before – unsuccessful</SelectItem>
                      <SelectItem value="tried-again">Tried before – wants try again</SelectItem>
                      <SelectItem value="tried-multiple">Tried multiple attempts</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Female Fertility Diagnosis */}
                <div className="space-y-1">
                  <Label className="text-xs">Female Fertility Diagnosis</Label>
                  <MultiSelectDiagnosis
                    label="Female Fertility Diagnosis"
                    value={Array.isArray(form.fertilityDiagnosis) ? form.fertilityDiagnosis : []}
                    onChange={v => setForm((f: any) => ({ ...f, fertilityDiagnosis: v }))}
                    options={dynamicFemaleDiagnosisOptions}
                    rawOptions={dynFemaleDiagnoses as RawDropdownOption[] | null | undefined}
                  />
                </div>
                {/* Male Fertility Diagnosis */}
                <div className="space-y-1">
                  <Label className="text-xs">Male Fertility Diagnosis</Label>
                  <MultiSelectDiagnosis
                    label="Male Fertility Diagnosis"
                    value={Array.isArray((form as any).maleFertilityDiagnosis) ? (form as any).maleFertilityDiagnosis : []}
                    onChange={v => setForm((f: any) => ({ ...f, maleFertilityDiagnosis: v }))}
                    options={dynamicMaleDiagnosisOptions}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notes</Label>
                  <Textarea value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Internal notes about this lead..." />
                </div>
              </>
            ) : (
              <dl className="space-y-2 text-sm">
                <InfoRow label="Preferred Contact" value={
                  (() => {
                    // CM-5 fix: show all selected methods with canonical labels, preserve unknown values as-is.
                    const methods: string[] = Array.isArray(lead.preferredContactMethods)
                      ? lead.preferredContactMethods
                      : (lead.preferredContactMethods ? [lead.preferredContactMethods as string] : []);
                    if (methods.length === 0) return undefined;
                    return methods
                      .map(v => CONTACT_METHODS.find(opt => opt.value === v)?.label ?? v)
                      .join(", ");
                  })()
                } />
                <InfoRow label="Preferred Language" value={(Array.isArray(lead.preferredLanguages) ? lead.preferredLanguages[0] : lead.preferredLanguages as string)?.toUpperCase()} />
                <InfoRow label="Lead Source" value={lead.leadSource?.replace(/-/g, " ")} />
                {(lead as any).campaignName && <InfoRow label="Campaign Name" value={(lead as any).campaignName} />}
                <InfoRow label="Budget Range" value={lead.budgetRange} />
                <InfoRow label="Decision Timeline" value={(({
                  "immediately":"As soon as possible / Immediately",
                  "1-2-weeks":"1–2 weeks",
                  "1-month":"1 month",
                  "2-months":"2 months",
                  "3-months":"3 months",
                  "1-3-months":"1–3 months",
                  "6-months":"6 months",
                  "exploring":"Exploring / Not sure"
                } as Record<string, string>)[lead.decisionTimeline ?? ""] ?? lead.decisionTimeline?.replace(/-/g, " "))} />
                <InfoRow label="Travel Readiness" value={lead.travelReadiness?.replace(/-/g, " ")} />
                <InfoRow label="Last Contact" value={lead.lastContactDate ? format(new Date(lead.lastContactDate), "MMM d, yyyy") : undefined} />
                <InfoRow label="Main Medical Interest" value={(() => { const v = lead.mainMedicalInterest; const arr: string[] = Array.isArray(v) ? v : (typeof v === "string" ? (v.startsWith("[") ? (() => { try { return JSON.parse(v); } catch { return [v]; } })() : [v]) : []); return arr.length > 0 ? arr.join(", ") : undefined; })()} />
                <InfoRow label="IVF Experience" value={lead.ivfExperience === "never-tried" ? "Never tried" : lead.ivfExperience === "tried-unsuccessful" ? "Tried before – unsuccessful" : lead.ivfExperience === "tried-again" ? "Tried before – wants try again" : lead.ivfExperience === "tried-multiple" ? "Tried multiple attempts" : lead.ivfExperience ?? undefined} />
                {Array.isArray(lead.fertilityDiagnosis) && lead.fertilityDiagnosis.filter((d: string) => d !== "Male factor infertility").length > 0 && (
                  <InfoRow label="Female Fertility Diagnosis" value={lead.fertilityDiagnosis.filter((d: string) => d !== "Male factor infertility").join(", ")} />
                )}
                {Array.isArray((lead as any).maleFertilityDiagnosis) && (lead as any).maleFertilityDiagnosis.length > 0 && (
                  <InfoRow label="Male Fertility Diagnosis" value={(lead as any).maleFertilityDiagnosis.join(", ")} />
                )}
                {lead.notes && <InfoRow label="Notes" value={lead.notes} />}
                {/* Callback Request fields */}
                {((lead as any).callbackPreferredDate || (lead as any).callbackPreferredTime || (lead as any).callbackMethod) && (
                  <>
                    <div className="border-t pt-2 mt-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Callback Request</p>
                    </div>
                    {(lead as any).callbackPreferredDate && <InfoRow label="Preferred Date" value={(lead as any).callbackPreferredDate} />}
                    {(lead as any).callbackPreferredTime && <InfoRow label="Preferred Time" value={(lead as any).callbackPreferredTime} />}
                    {(lead as any).callbackMethod && <InfoRow label="Contact Method" value={(lead as any).callbackMethod?.replace(/_/g, " ")} />}
                  </>
                )}
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Logistics */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Logistics & Accommodation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Hotel / Accommodation</Label>
                  <Input value={form.accommodationHotel} onChange={e => setForm((f: any) => ({ ...f, accommodationHotel: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Accommodation Location</Label>
                  <Input value={form.accommodationLocation} onChange={e => setForm((f: any) => ({ ...f, accommodationLocation: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Airport Pickup</Label>
                    <Select value={form.transportationAirportPickup === null || form.transportationAirportPickup === undefined ? "_none" : form.transportationAirportPickup ? "yes" : "no"} onValueChange={v => setForm((f: any) => ({ ...f, transportationAirportPickup: v === "_none" ? null : v === "yes" }))}>                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">— Not specified —</SelectItem>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Local Transfer</Label>
                    <Select value={form.transportationLocalTransfer === null || form.transportationLocalTransfer === undefined ? "_none" : form.transportationLocalTransfer ? "yes" : "no"} onValueChange={v => setForm((f: any) => ({ ...f, transportationLocalTransfer: v === "_none" ? null : v === "yes" }))}>                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">— Not specified —</SelectItem>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            ) : (
              <dl className="space-y-2 text-sm">
                <InfoRow label="Hotel" value={lead.accommodationHotel} />
                <InfoRow label="Location" value={lead.accommodationLocation} />
                <InfoRow label="Airport Pickup" value={lead.transportationAirportPickup === null || lead.transportationAirportPickup === undefined ? "Not specified" : lead.transportationAirportPickup ? "Yes" : "No"} />
                <InfoRow label="Local Transfer" value={lead.transportationLocalTransfer === null || lead.transportationLocalTransfer === undefined ? "Not specified" : lead.transportationLocalTransfer ? "Yes" : "No"} />
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Marriage Certificate */}
        <MarriageCertCard leadId={lead.id} />
        {/* AI Tools */}
        <AiToolsCard leadId={lead.id} lead={lead} onUpdate={onUpdate} />

        {/* Timestamps */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Record Info</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <InfoRow label="Created" value={format(new Date(lead.createdAt), "MMM d, yyyy HH:mm")} />
              {lead.modifiedAt && <InfoRow label="Last Modified" value={format(new Date(lead.modifiedAt), "MMM d, yyyy HH:mm")} />}
              {lead.convertedPatientId && <InfoRow label="Patient ID" value={`#${lead.convertedPatientId}`} />}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Marriage Certificate Card ───────────────────────────────────────────────
function MarriageCertCard({ leadId }: { leadId: number }) {
  const utils = trpc.useUtils();
  const intakeQuery = trpc.leads.medicalIntake.useQuery({ leadId });
  const saveMutation = trpc.leads.saveMedicalIntake.useMutation({
    onSuccess: () => { utils.leads.medicalIntake.invalidate({ leadId }); },
    onError: () => toast.error("Failed to save marriage certificate"),
  });
  const uploadMutation = trpc.leads.uploadIntakeFile.useMutation();
  const intake = intakeQuery.data as any;
  const [uploading, setUploading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const b64 = (ev.target?.result as string).split(",")[1];
        try {
          const result = await uploadMutation.mutateAsync({
            leadId, fileBase64: b64, fileName: file.name, mimeType: file.type, intakeSection: "MarriageCertificate"
          });
          await saveMutation.mutateAsync({
            leadId,
            hasCivilMarriageCertificate: true,
            marriageCertFileKey: result.fileKey,
            marriageCertFileUrl: result.fileUrl,
            marriageCertFileName: result.fileName,
            marriageCertDocId: result.docId,
          });
          toast.success("Marriage certificate uploaded");
        } catch (e: any) {
          toast.error("Upload failed: " + (e?.message ?? "Unknown error"));
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    await saveMutation.mutateAsync({
      leadId,
      hasCivilMarriageCertificate: false,
      marriageCertFileKey: undefined,
      marriageCertFileUrl: undefined,
      marriageCertFileName: undefined,
      marriageCertDocId: undefined,
    });
    toast.success("Marriage certificate removed");
  };

  const handlePasswordChange = async (pw: string) => {
    await saveMutation.mutateAsync({ leadId, marriageCertFilePassword: pw });
  };

  if (intakeQuery.isLoading) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
          Marriage Certificate
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Marriage certificate status dropdown */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Certificate Status</Label>
          <Select
            value={(intake as any)?.marriageCertStatus ?? "not_specified"}
            onValueChange={async (val) => {
              await saveMutation.mutateAsync({
                leadId,
                marriageCertStatus: val,
                hasCivilMarriageCertificate: val === "yes",
              });
            }}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_specified">— Not specified —</SelectItem>
              <SelectItem value="yes">✅ Yes, we have it</SelectItem>
              <SelectItem value="in_progress">🔄 In progress (not received yet)</SelectItem>
              <SelectItem value="no">❌ No</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* File upload area — only shown when status is "yes" */}
        {((intake as any)?.marriageCertStatus === "yes" || (!((intake as any)?.marriageCertStatus) && intake?.hasCivilMarriageCertificate)) && (
          <div className="ml-1 pl-3 border-l-2 border-primary/20 space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground">Marriage Certificate Document</p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-dashed border-muted-foreground/40 hover:border-primary/60 hover:bg-muted/30 transition-colors text-muted-foreground disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
                {uploading ? "Uploading..." : intake?.marriageCertFileUrl ? "Replace certificate" : "Attach certificate"}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
              />
              {intake?.marriageCertFileUrl && (
                <a
                  href={normaliseFileUrl(intake.marriageCertFileUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline max-w-[200px] truncate"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="truncate">{intake.marriageCertFileName || "View certificate"}</span>
                </a>
              )}
              {intake?.marriageCertFileUrl && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive px-1.5 py-1 rounded border border-transparent hover:border-destructive/30 transition-colors"
                  title="Remove certificate"
                >
                  <X className="h-3 w-3" /> Remove
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
                  showPw ? "border-amber-400 bg-amber-50 text-amber-700" : "border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60"
                }`}
              >
                <KeyRound className="h-3 w-3" />
                {showPw ? "Has password" : "Password?"}
              </button>
            </div>
            {showPw && (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={intake?.marriageCertFilePassword ?? ""}
                  onChange={e => handlePasswordChange(e.target.value)}
                  placeholder="Document password (if protected)"
                  className="h-7 text-xs max-w-[240px]"
                />
              </div>
            )}
            {!intake?.marriageCertFileUrl && (
              <p className="text-[11px] text-muted-foreground italic">No file attached yet. Click "Attach certificate" to upload.</p>
            )}
          </div>
        )}

        {/* Sync note */}
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400"></span>
          Synced with Medical Intake → General Information
        </p>
      </CardContent>
    </Card>
  );
}

// ─── AI Tools Card ───────────────────────────────────────────────────────────
const LANG_OPTIONS = [
  { code: "en", label: "EN", full: "English" },
  { code: "ar", label: "AR", full: "Arabic" },
  { code: "tr", label: "TR", full: "Turkish" },
] as const;
type LangCode = "en" | "ar" | "tr";

function AiToolsCard({ leadId, lead, onUpdate }: { leadId: number; lead: any; onUpdate: () => void }) {
  // Parse stored translations from DB (JSON string → object)
  const parseTranslations = (raw: string | null | undefined): Record<string, string> => {
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
  };

  const [caseLang, setCaseLang] = useState<LangCode>("en");
  const [salesLang, setSalesLang] = useState<LangCode>("en");
  // EN text is always lead.caseSummary / lead.salesNote; translations stored separately
  const [caseSummaryEN, setCaseSummaryEN] = useState<string>(lead.caseSummary ?? "");
  const [salesNoteEN, setSalesNoteEN] = useState<string>(lead.salesNote ?? "");
  const [caseTranslations, setCaseTranslations] = useState<Record<string, string>>(() => parseTranslations(lead.caseSummaryTranslations));
  const [salesTranslations, setSalesTranslations] = useState<Record<string, string>>(() => parseTranslations(lead.salesNoteTranslations));
  const [editingCase, setEditingCase] = useState(false);
  const [editingSales, setEditingSales] = useState(false);
  const [translateTarget, setTranslateTarget] = useState<"case" | "sales" | null>(null);

  // Derived: text currently shown for the selected language
  const caseText = caseLang === "en" ? caseSummaryEN : (caseTranslations[caseLang] ?? "");
  const salesText = salesLang === "en" ? salesNoteEN : (salesTranslations[salesLang] ?? "");

  // Editing buffer (only used when editingCase/editingSales is true)
  const [caseEditBuf, setCaseEditBuf] = useState("");
  const [salesEditBuf, setSalesEditBuf] = useState("");

  useEffect(() => {
    setCaseSummaryEN(lead.caseSummary ?? "");
    setSalesNoteEN(lead.salesNote ?? "");
    setCaseTranslations(parseTranslations(lead.caseSummaryTranslations));
    setSalesTranslations(parseTranslations(lead.salesNoteTranslations));
  }, [lead]);

  const generateCaseSummary = trpc.leads.generateCaseSummary.useMutation({
    onSuccess: (data) => {
      const summary = data.summary as string;
      setCaseSummaryEN(summary);
      setCaseLang("en");
      setCaseEditBuf(summary);
      setEditingCase(true);
      toast.success("Case summary generated — review and save");
      onUpdate();
    },
    onError: (e) => { toast.error((e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong.")); },
  });
  const generateSalesNote = trpc.leads.generateSalesNote.useMutation({
    onSuccess: (data) => {
      const note = data.note as string;
      setSalesNoteEN(note);
      setSalesLang("en");
      setSalesEditBuf(note);
      setEditingSales(true);
      toast.success("Sales note generated — review and save");
      onUpdate();
    },
    onError: (e) => { toast.error((e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong.")); },
  });

  const saveCaseSummaryMut = trpc.leads.update.useMutation({
    onSuccess: () => { setEditingCase(false); toast.success("Case summary saved"); onUpdate(); },
    onError: () => toast.error("Failed to save case summary"),
  });
  const saveSalesNoteMut = trpc.leads.update.useMutation({
    onSuccess: () => { setEditingSales(false); toast.success("Sales note saved"); onUpdate(); },
    onError: () => toast.error("Failed to save sales note"),
  });

  const translateMut = trpc.translations.translateText.useMutation({
    onSuccess: (data, vars) => {
      const lang = vars.targetLanguage as LangCode;
      if (translateTarget === "case") {
        const updated = { ...caseTranslations, [lang]: data.translated };
        setCaseTranslations(updated);
        setCaseLang(lang);
        setCaseEditBuf(data.translated);
        setEditingCase(true);
        // Auto-save translation to DB
        saveCaseSummaryMut.mutate({ id: leadId, data: { caseSummaryTranslations: JSON.stringify(updated) } });
      } else if (translateTarget === "sales") {
        const updated = { ...salesTranslations, [lang]: data.translated };
        setSalesTranslations(updated);
        setSalesLang(lang);
        setSalesEditBuf(data.translated);
        setEditingSales(true);
        saveSalesNoteMut.mutate({ id: leadId, data: { salesNoteTranslations: JSON.stringify(updated) } });
      }
      setTranslateTarget(null);
      toast.success("Translated and saved");
    },
    onError: () => { setTranslateTarget(null); toast.error("Translation failed"); },
  });

  const handleTranslate = (target: "case" | "sales", lang: LangCode) => {
    if (lang === "en") return; // EN is always the original
    const existing = target === "case" ? caseTranslations[lang] : salesTranslations[lang];
    if (existing) {
      // Already translated — just switch to that tab
      if (target === "case") setCaseLang(lang);
      else setSalesLang(lang);
      toast.success(`Showing saved ${LANG_OPTIONS.find(l => l.code === lang)?.full} translation`);
      return;
    }
    const sourceText = target === "case" ? caseSummaryEN : salesNoteEN;
    if (!sourceText.trim()) { toast.error("Nothing to translate"); return; }
    setTranslateTarget(target);
    translateMut.mutate({ text: sourceText, targetLanguage: lang });
  };

  // Lang tab bar for a section
  const LangTabs = ({ target, activeLang, setActiveLang }: { target: "case" | "sales"; activeLang: LangCode; setActiveLang: (l: LangCode) => void }) => {
    const translations = target === "case" ? caseTranslations : salesTranslations;
    return (
      <div className="flex items-center gap-1">
        {LANG_OPTIONS.map(opt => {
          const hasTranslation = opt.code === "en" || !!translations[opt.code];
          const isActive = activeLang === opt.code;
          const isTranslating = translateMut.isPending && translateTarget === target;
          return (
            <button
              key={opt.code}
              onClick={() => {
                if (opt.code === "en") { setActiveLang("en"); return; }
                handleTranslate(target, opt.code as LangCode);
                setActiveLang(opt.code as LangCode);
              }}
              disabled={isTranslating && !hasTranslation}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : hasTranslation
                  ? "bg-muted text-foreground hover:bg-muted/80"
                  : "border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary"
              }`}
              title={hasTranslation ? `View ${opt.full}` : `Translate to ${opt.full}`}
            >
              {isTranslating && translateTarget === target && !hasTranslation && (opt.code as string) !== "en" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : opt.label}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          AI Tools
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Case Summary */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Case Summary</Label>
            <div className="flex items-center gap-2">
              <LangTabs target="case" activeLang={caseLang} setActiveLang={setCaseLang} />
              {caseText && !editingCase && (
                <Button size="sm" variant="ghost" className="h-6 text-xs gap-1"
                  onClick={() => { setCaseEditBuf(caseText); setEditingCase(true); }}>
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-6 text-xs gap-1"
                onClick={() => generateCaseSummary.mutate({ leadId })}
                disabled={generateCaseSummary.isPending}>
                {generateCaseSummary.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Generate
              </Button>
            </div>
          </div>
          {editingCase ? (
            <div className="space-y-2">
              <Textarea value={caseEditBuf} onChange={e => setCaseEditBuf(e.target.value)}
                className="text-xs min-h-[120px] resize-y" placeholder="Write or edit the case summary..." />
              <div className="flex items-center gap-2 justify-end">
                <Button size="sm" variant="ghost" className="h-7 text-xs"
                  onClick={() => setEditingCase(false)}>Cancel</Button>
                <Button size="sm" className="h-7 text-xs gap-1"
                  onClick={() => {
                    if (caseLang === "en") {
                      saveCaseSummaryMut.mutate({ id: leadId, data: { caseSummary: caseEditBuf } });
                      setCaseSummaryEN(caseEditBuf);
                    } else {
                      const updated = { ...caseTranslations, [caseLang]: caseEditBuf };
                      setCaseTranslations(updated);
                      saveCaseSummaryMut.mutate({ id: leadId, data: { caseSummaryTranslations: JSON.stringify(updated) } });
                    }
                  }}
                  disabled={saveCaseSummaryMut.isPending}>
                  {saveCaseSummaryMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </Button>
              </div>
            </div>
          ) : caseText ? (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 whitespace-pre-wrap">{caseText}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">No case summary yet. Click Generate to create one using AI.</p>
          )}
        </div>

        {/* Sales Note */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Sales Note</Label>
            <div className="flex items-center gap-2">
              <LangTabs target="sales" activeLang={salesLang} setActiveLang={setSalesLang} />
              {salesText && !editingSales && (
                <Button size="sm" variant="ghost" className="h-6 text-xs gap-1"
                  onClick={() => { setSalesEditBuf(salesText); setEditingSales(true); }}>
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-6 text-xs gap-1"
                onClick={() => generateSalesNote.mutate({ leadId })}
                disabled={generateSalesNote.isPending}>
                {generateSalesNote.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Generate
              </Button>
            </div>
          </div>
          {editingSales ? (
            <div className="space-y-2">
              <Textarea value={salesEditBuf} onChange={e => setSalesEditBuf(e.target.value)}
                className="text-xs min-h-[100px] resize-y" placeholder="Write or edit the sales note..." />
              <div className="flex items-center gap-2 justify-end">
                <Button size="sm" variant="ghost" className="h-7 text-xs"
                  onClick={() => setEditingSales(false)}>Cancel</Button>
                <Button size="sm" className="h-7 text-xs gap-1"
                  onClick={() => {
                    if (salesLang === "en") {
                      saveSalesNoteMut.mutate({ id: leadId, data: { salesNote: salesEditBuf } });
                      setSalesNoteEN(salesEditBuf);
                    } else {
                      const updated = { ...salesTranslations, [salesLang]: salesEditBuf };
                      setSalesTranslations(updated);
                      saveSalesNoteMut.mutate({ id: leadId, data: { salesNoteTranslations: JSON.stringify(updated) } });
                    }
                  }}
                  disabled={saveSalesNoteMut.isPending}>
                  {saveSalesNoteMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </Button>
              </div>
            </div>
          ) : salesText ? (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 whitespace-pre-wrap">{salesText}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">No sales note yet. Click Generate to create one using AI.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value, badge }: { label: string; value?: string | null; badge?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="font-medium text-right flex items-center gap-1.5">
        {value ?? "—"}
        {badge && (
          <span className="text-[10px] font-normal text-blue-600 bg-blue-50 border border-blue-200 rounded px-1 py-0.5 leading-none">
            {badge}
          </span>
        )}
      </dd>
    </div>
  );
}

// ─── Medical Intake Error Boundary ───────────────────────────────────────────
class MedicalIntakeErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <div>
            <p className="font-semibold text-sm">Medical Intake failed to load</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              The intake data may contain invalid entries. Click Retry to reload, or contact support if the issue persists.
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
          {process.env.NODE_ENV !== "production" && this.state.error && (
            <pre className="text-xs text-muted-foreground text-left max-w-2xl overflow-auto p-3 bg-muted rounded">
              {this.state.error.stack}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Medical Intake Tab ───────────────────────────────────────────────────────
// Reset dialog state machine:
//   idle → choose_mode → confirm_permanent (permanent only) → submitting → idle
// Single enum eliminates the two-dialog race where closing Dialog 1 to open Dialog 2
// fired onOpenChange and cleared resetMode before the mutation was dispatched.
type ResetStep = "idle" | "choose_mode" | "confirm_permanent" | "submitting";
function MedicalIntakeTab({ leadId, onDataChange }: { leadId: number; onDataChange?: () => void }) {
  const utils = trpc.useUtils();
  const [resetStep, setResetStep] = useState<ResetStep>("idle");
  const [resetMode, setResetMode] = useState<"archive" | "permanent" | null>(null);
  // Stable reset generation counter — incremented exactly once per successful reset.
  // Using Date.now() in the key caused continuous remounts because Date.now() changes
  // on every render, creating an infinite unmount/remount/loading loop.
  const [resetGeneration, setResetGeneration] = useState(0);

  // Fetch current intake to get updatedAt for optimistic lock
  const { data: intakeData } = trpc.leads.medicalIntake.useQuery({ leadId });
  const intakeRecord = (intakeData as any)?.intake ?? null;
  const intakeUpdatedAt = intakeRecord?.updatedAt
    ? (intakeRecord.updatedAt instanceof Date ? intakeRecord.updatedAt.toISOString() : String(intakeRecord.updatedAt))
    : undefined;

  const resetIntake = trpc.leads.resetMedicalIntake.useMutation({
    onSuccess: (result) => {
      utils.leads.medicalIntake.invalidate({ leadId });
      utils.leads.documents.invalidate({ leadId });
      // Cross-invalidate the Patient page when this lead is linked to a patient
      if (result?.linkedPatientId) {
        utils.patients.getIntake.invalidate({ patientId: result.linkedPatientId });
        utils.patients.documents.invalidate({ patientId: result.linkedPatientId });
      }
      const modeLabel = result.mode === "archive" ? "archived" : "permanently deleted";
      toast.success(`Health Record reset. ${result.documentsProcessed} document(s) ${modeLabel}.`);
      setResetStep("idle");
      setResetMode(null);
      // Increment generation AFTER state resets so the component remounts exactly once
      // into the settled empty state, not into a mid-reset state.
      setResetGeneration(g => g + 1);
      onDataChange?.();
    },
    onError: (err: any) => {
      setResetStep("choose_mode"); // return to mode selection on error
      const msg = err?.message ?? "";
      if (msg === "pending_storage_deletions" || msg.includes("pending_storage_deletions")) {
        const pendingCount = (err?.cause as any)?.pendingCount ?? (err as any)?.cause?.pendingCount ?? "some";
        toast.error(`Storage cleanup in progress (${pendingCount} document(s) pending). The retry job runs every 30 minutes — please try again shortly.`);
      } else if (msg.includes("modified by another session")) {
        toast.error("The Health Record was modified by another session. Please reload the page before resetting.");
      } else if (msg.includes("explicit confirmation")) {
        toast.error("Please confirm permanent deletion before proceeding.");
      } else {
        toast.error("Health Record reset failed. Please try again.");
      }
    },
  });

  function closeReset() {
    if (resetStep === "submitting") return;
    setResetStep("idle");
    setResetMode(null);
  }

  function submitReset() {
    if (!resetMode) return;
    const requestId = `reset-${leadId}-${Date.now()}`;
    setResetStep("submitting");
    resetIntake.mutate({
      leadId,
      mode: resetMode,
      confirmPermanentDeletion: resetMode === "permanent" ? true : undefined,
      intakeUpdatedAt,
      requestId,
    });
  }

  const intakeConflict = (intakeData as any)?.conflict ?? null;
  return (
    <div className="space-y-3">
      {/* Reset Intake button — top-right corner */}
      <div className="flex justify-end px-1">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          onClick={() => { setResetStep("choose_mode"); setResetMode(null); }}
          disabled={resetStep === "submitting" || !!intakeConflict}
          title={intakeConflict ? "Resolve the intake conflict before resetting" : undefined}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Delete &amp; Reset Health Record
        </Button>
      </div>

      {/* Single dialog — step controlled by resetStep enum */}
      <Dialog open={resetStep !== "idle"} onOpenChange={(o) => { if (!o) closeReset(); }}>
        <DialogContent className="max-w-md">
          {resetStep === "choose_mode" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <RotateCcw className="h-5 w-5 text-destructive" />
                  Delete &amp; Reset Health Record
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <p className="text-sm text-muted-foreground">
                  An audit entry will be written to the audit log before deletion. All documents will be archived or permanently deleted based on the mode you choose below.
                </p>
                <div className="space-y-2">
                  {/* Archive option */}
                  <button
                    type="button"
                    className={`w-full text-left rounded-lg border p-4 transition-colors ${
                      resetMode === "archive"
                        ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
                        : "border-border hover:border-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-950/20"
                    }`}
                    onClick={() => setResetMode("archive")}
                  >
                    <div className="flex items-start gap-3">
                      <Archive className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Archive Documents &amp; Reset</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Health Record data is cleared. All attached documents are preserved and moved to the Historical section of the Documents tab. Translations and S3 files are kept intact.
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* Permanent delete option */}
                  <button
                    type="button"
                    className={`w-full text-left rounded-lg border p-4 transition-colors ${
                      resetMode === "permanent"
                        ? "border-destructive bg-destructive/5"
                        : "border-border hover:border-destructive/60 hover:bg-destructive/5"
                    }`}
                    onClick={() => setResetMode("permanent")}
                  >
                    <div className="flex items-start gap-3">
                      <TrashIcon className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-destructive">Permanently Delete Documents &amp; Reset</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Health Record data is cleared. All attached documents, their translations, and S3 files are permanently deleted. This cannot be undone.
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={closeReset}>
                  Cancel
                </Button>
                <Button
                  variant={resetMode === "permanent" ? "destructive" : "default"}
                  className={resetMode === "archive" ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
                  disabled={!resetMode}
                  onClick={() => {
                    if (resetMode === "permanent") {
                      setResetStep("confirm_permanent");
                    } else if (resetMode === "archive") {
                      submitReset();
                    }
                  }}
                >
                  {resetMode === "archive" ? "Archive & Reset" : resetMode === "permanent" ? "Continue →" : "Select an option above"}
                </Button>
              </div>
            </>
          )}

          {resetStep === "confirm_permanent" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Delete &amp; Reset Health Record?
                </DialogTitle>
              </DialogHeader>
              <div className="py-3 space-y-2">
                <p className="text-sm font-semibold text-destructive">
                  This will permanently delete all Health Record documents, their AI translations, and their S3 files.
                </p>
                <p className="text-sm text-muted-foreground">
                  A snapshot of the Health Record will be saved to the Communications log before deletion. Direct uploads (files added from the Documents tab directly) will not be affected.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setResetStep("choose_mode")}>
                  Go Back
                </Button>
                <Button
                  variant="destructive"
                  onClick={submitReset}
                >
                  Yes, Permanently Delete &amp; Reset
                </Button>
              </div>
            </>
          )}

          {resetStep === "submitting" && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {resetMode === "permanent" ? "Permanently deleting documents..." : "Archiving documents..."}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <MedicalIntakeErrorBoundary key={`medical-intake-${resetGeneration}`}>
        <MedicalIntakeForm mode="lead" id={leadId} onSave={onDataChange} />
      </MedicalIntakeErrorBoundary>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function TextareaField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Textarea value={value} onChange={e => onChange(e.target.value)} rows={2} />
    </div>
  );
}

// ─── Notes Tab (Interest Level + Communications) ────────────────────────────
function NotesTab({ leadId, lead, onRefresh }: { leadId: number; lead: any; onRefresh: () => void }) {
  const updateLead = trpc.leads.update.useMutation({
    onSuccess: () => onRefresh(),
    onError: (e) => { toast.error((e as any)?.message || "Failed to update"); },
  });

  const interestColor: Record<string, string> = {
    hot: "bg-red-500",
    warm: "bg-orange-400",
    cold: "bg-blue-400",
  };

  return (
    <div className="space-y-5">
      {/* Interest Level */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Interest Level</p>
              <p className="text-xs text-muted-foreground mt-0.5">Track lead engagement</p>
            </div>
            <div className="flex gap-2">
              {(["cold", "warm", "hot"] as const).map(level => (
                <button
                  key={level}
                  onClick={() => updateLead.mutate({ id: leadId, data: { interestLevel: level } })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                    (lead as any).interestLevel === level
                      ? `${interestColor[level]} text-white shadow-sm`
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Communication Notes */}
      <CommunicationsTab leadId={leadId} />
    </div>
  );
}

// ─── Communications Tab ───────────────────────────────────────────────────────
function CommunicationsTab({ leadId }: { leadId: number }) {
  const { data: comms, refetch } = trpc.leads.communications.useQuery({ leadId });
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBuf, setEditBuf] = useState("");

  const addComm = trpc.leads.addCommunication.useMutation({
    onSuccess: () => { setNote(""); refetch(); toast.success("Note added"); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const updateComm = trpc.leads.editCommunication.useMutation({
    onSuccess: () => { setEditingId(null); setEditBuf(""); refetch(); toast.success("Note updated"); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const deleteComm = trpc.leads.deleteCommunication.useMutation({
    onSuccess: () => { setDeletingId(null); refetch(); toast.success("Note deleted"); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="space-y-3">
            <Label>Add Communication Note</Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Log a call, email, WhatsApp message, or any interaction..."
              rows={3}
            />
            <div className="flex justify-end">
              <Button
                onClick={() => addComm.mutate({ leadId, note })}
                disabled={!note.trim() || addComm.isPending}
                size="sm"
              >
                {addComm.isPending ? "Adding..." : "Add Note"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {!comms?.length ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No communications logged yet.</div>
        ) : (
          comms.map(c => (
            <Card key={c.id}>
              <CardContent className="p-4">
                {editingId === c.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editBuf}
                      onChange={e => setEditBuf(e.target.value)}
                      rows={3}
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => { setEditingId(null); setEditBuf(""); }}>Cancel</Button>
                      <Button size="sm" disabled={!editBuf.trim() || updateComm.isPending} onClick={() => updateComm.mutate({ id: c.id, leadId, note: editBuf })}>
                        {updateComm.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm whitespace-pre-wrap">{c.note}</p>
                    </div>
                    <div className="flex items-start gap-2 shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-medium">{c.authorName}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(c.createdAt), "MMM d, yyyy HH:mm")}</p>
                        {(c as any).updatedAt && (
                          <p className="text-xs text-muted-foreground italic">Edited</p>
                        )}
                      </div>
                      <button
                        onClick={() => { setEditingId(c.id); setEditBuf(c.note); }}
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                        title="Edit note"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <AlertDialog open={deletingId === c.id} onOpenChange={(open) => !open && setDeletingId(null)}>
                        <AlertDialogTrigger asChild>
                          <button
                            onClick={() => setDeletingId(c.id)}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors mt-0.5"
                            title="Delete note"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                            <AlertDialogDescription>This action cannot be undone. The note will be permanently removed from this Lead's communications log.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => deleteComm.mutate({ id: c.id, leadId })}
                              disabled={deleteComm.isPending}
                            >
                              {deleteComm.isPending ? "Deleting..." : "Delete"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}// ─── Lead Appointments Tab ────────────────────────────────────────────────────────────────
function LeadAppointmentsTab({ leadId, lead }: { leadId: number; lead: any }) {
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);
  // Query by leadId (works even before conversion) OR by patientId after conversion
  const { data: leadApptData, refetch: refetchLead } = trpc.appointments.list.useQuery(
    { leadId },
    { enabled: true }
  );
  const { data: patientApptData, refetch: refetchPatient } = trpc.appointments.list.useQuery(
    { patientId: lead.convertedPatientId! },
    { enabled: !!lead.convertedPatientId }
  );
  // Merge: after conversion show patient appointments; before show lead appointments
  const leadAppts = lead.convertedPatientId
    ? [...(patientApptData ?? []), ...(leadApptData ?? [])].filter(
        (a, i, arr) => arr.findIndex(b => b.id === a.id) === i
      )
    : (leadApptData ?? []);
  const refetch = () => { refetchLead(); if (lead.convertedPatientId) refetchPatient(); };

  const statusBadge: Record<string, string> = {
    upcoming: "bg-blue-100 text-blue-700", confirmed: "bg-emerald-100 text-emerald-700",
    completed: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700",
    no_show: "bg-orange-100 text-orange-700", rescheduled: "bg-purple-100 text-purple-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-2" onClick={() => setShowNewAppt(true)}>
          <Calendar className="h-4 w-4" /> New Appointment
        </Button>
      </div>

      {showNewAppt && (
        <LeadAppointmentFormModal
          leadId={leadId}
          lead={lead}
          onClose={() => setShowNewAppt(false)}
          onSuccess={() => { refetch(); setShowNewAppt(false); }}
        />
      )}

      {selectedAppt && (
        <LeadApptDetailModal
          appointment={selectedAppt}
          leadName={[lead.firstName, (lead as any).middleName, lead.lastName].filter(Boolean).join(" ")}
          onClose={() => setSelectedAppt(null)}
          onRefresh={(appointmentPatch) => {
            void refetch();
            if (appointmentPatch) setSelectedAppt((current: any | null) => current ? { ...current, ...appointmentPatch } : current);
          }}
        />
      )}

      {leadAppts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No appointments linked to this lead.
        </div>
      ) : (
        <div className="space-y-3">
          {leadAppts.map((a: any) => {
            const isConflict = false; // future: overlap detection
            return (
              <Card key={a.id}
                className={`cursor-pointer hover:shadow-md transition-shadow ${
                  isConflict ? "border-yellow-400 bg-yellow-50" : ""
                }`}
                onClick={() => setSelectedAppt(a)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(a.appointmentDate), "MMM d, yyyy h:mm a")}
                        {a.duration ? ` · ${a.duration} min` : ""}
                      </p>
                      {a.doctorName && <p className="text-xs text-muted-foreground">Dr. {a.doctorName}</p>}
                      {a.purpose && <p className="text-xs text-muted-foreground capitalize">{a.purpose.replace(/-/g, " ")}</p>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge[a.status] ?? "bg-gray-100"}` }>
                      {a.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
);
}

const TRANSLATE_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "tr", label: "Turkish" },
  { value: "ru", label: "Russian" },
  { value: "zh", label: "Chinese" },
];

// ─── Section options per gender ─────────────────────────────────────────────
const FEMALE_SECTIONS = [
  { value: "artHistory", label: "Previous Fertility Treatments (IVF / IUI / etc.)" },
  { value: "surgicalHistory", label: "Previous Surgeries" },
  { value: "previousTests", label: "Previous Tests & Lab Results" },
  { value: "radiology", label: "Radiology" },
  { value: "geneticTests", label: "Genetic Tests" },
  { value: "generalAttachmentsFemale", label: "General Attachments (Female)" },
];
const MALE_SECTIONS = [
  { value: "semenAnalysis", label: "Semen Analysis" },
  { value: "dnaFragmentation", label: "DNA Fragmentation" },
  { value: "previousTests", label: "Previous Tests & Lab Results" },
  { value: "previousSurgeries", label: "Previous Surgeries" },
  { value: "geneticTests", label: "Genetic Tests" },
  { value: "radiology", label: "Radiology" },
  { value: "generalAttachmentsMale", label: "General Attachments (Male)" },
];

// ─── Documents Tab ────────────────────────────────────────────────────────────────────────────────
function DocumentsTab({ leadId, lead }: { leadId: number; lead?: any }) {
  const utils = trpc.useUtils();
  const { data: docs } = trpc.leads.documents.useQuery({ leadId });
  // Intake conflict state — used to disable "Upload to Section" during conflict
  const { data: intakeData } = trpc.leads.medicalIntake.useQuery({ leadId });
  const hasIntakeConflict = !!(intakeData as any)?.conflict;
  // Person-centric upload destinations (replaces Wife/Husband toggle)
  const { data: uploadDestinations = [] } = trpc.leads.getUploadDestinations.useQuery(
    { leadId },
    { enabled: true, staleTime: 30_000 }
  );
  // ── Direct Upload to Documents Library state ──────────────────────────────────────────────────
  const [showDirectUploadDialog, setShowDirectUploadDialog] = useState(false);
  const [directUploadFiles, setDirectUploadFiles] = useState<File[]>([]);
  const [directUploadTag, setDirectUploadTag] = useState("");
  const [directUploadPassword, setDirectUploadPassword] = useState("");
  const [directUploadLoading, setDirectUploadLoading] = useState(false);
  const [directUploadDestKey, setDirectUploadDestKey] = useState<string | null>(null);
  const { data: directUploadDestinations = [] } = trpc.leads.getDirectUploadDestinations.useQuery(
    { leadId },
    { enabled: showDirectUploadDialog, staleTime: 30_000 }
  );
  const selectedDirectDest = directUploadDestinations.find((d: any) => d.key === directUploadDestKey) ?? directUploadDestinations[0];
  const directUploadMutation = trpc.leads.directUpload.useMutation({
    onSuccess: (data) => {
      utils.leads.documents.invalidate({ leadId });
      if (data?.linkedPatientId) utils.patients.documents.invalidate({ patientId: data.linkedPatientId });
      toast.success(`Document uploaded to ${data?.personName ?? "Documents Library"}.`);
      setShowDirectUploadDialog(false);
      setDirectUploadFiles([]);
      setDirectUploadTag("");
      setDirectUploadPassword("");
    },
    onError: (e) => toast.error(e.message || "Direct upload failed"),
  });
  const handleDirectUpload = async () => {
    if (!directUploadFiles.length) return toast.error("Please select at least one file");
    const dest = selectedDirectDest;
    if (!dest) return toast.error("No upload destination available");
    setDirectUploadLoading(true);
    try {
      for (const file of directUploadFiles) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await directUploadMutation.mutateAsync({
          leadId: dest.leadId,
          fileBase64: base64,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          tag: directUploadTag || undefined,
          docPassword: directUploadPassword || undefined,
        });
      }
    } finally {
      setDirectUploadLoading(false);
    }
  };
  const updateTag = trpc.leads.updateDocumentTag.useMutation({
    onSuccess: () => { utils.leads.documents.invalidate(); toast.success("Tag updated"); },
    onError: () => toast.error("Failed to update tag"),
  });
  const updatePassword = trpc.leads.updateDocumentPassword.useMutation({
    onSuccess: () => { utils.leads.documents.invalidate(); toast.success("Password saved"); },
    onError: () => toast.error("Failed to save password"),
  });
  const deleteDoc = trpc.leads.deleteDocument.useMutation({
    onSuccess: () => {
      utils.leads.documents.invalidate();
      // Cross-invalidate the Patient Documents tab when this lead is linked to a patient
      const linkedPatientId = (lead as any)?.convertedPatientId;
      if (linkedPatientId) utils.patients.documents.invalidate({ patientId: linkedPatientId });
      toast.success("Document deleted");
    },
    onError: () => toast.error("Failed to delete document"),
  });
  const translateDoc = trpc.translations.translateLeadDocument.useMutation({
    onSuccess: (result, variables) => {
      toast.success("Translation complete");
      if (result?.translatedText) {
        // BUG FIX: key by leadDocumentId from the REQUEST, not result.id (translation-row id)
        // Using result.id caused translations to appear under the wrong document
        setTranslationResult(prev => ({ ...prev, [variables.leadDocumentId]: { text: result.translatedText, lang: variables.targetLanguage ?? "en" } }));
      }
    },
    onError: (e) => toast.error(e.message || "Translation failed"),
  });

  const [editingTag, setEditingTag] = useState<number | null>(null);
  const [tagValue, setTagValue] = useState("");
  const [editingPassword, setEditingPassword] = useState<number | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const [showPassword, setShowPassword] = useState<Record<number, boolean>>({});
  const [translateDocId, setTranslateDocId] = useState<number | null>(null);
  const [translateLang, setTranslateLang] = useState("en");
  // BUG FIX: store { text, lang } per document id so each doc tracks its own language
  const [translationResult, setTranslationResult] = useState<Record<number, { text: string; lang: string }>>({}); 
  const [savedTranslations, setSavedTranslations] = useState<Record<number, { text: string; lang: string }>>({}); 
  // Lifecycle filter
  type LifecycleFilter = "all" | "active" | "historical" | "direct-upload" | "unclassified";
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>("all");

  // Load saved translations from DB when docs load
  const docIds = useMemo(() => (docs ?? []).map((d: any) => d.id), [docs]);
  useEffect(() => {
    if (!docIds.length) return;
    const fetchAll = async () => {
      const results: Record<number, { text: string; lang: string }> = {};
      await Promise.all(
        docIds.map(async (docId: number) => {
          try {
            const res = await fetch(
              `/api/trpc/translations.listByLeadDocument?input=${encodeURIComponent(JSON.stringify({ json: { leadDocumentId: docId } }))}`,
              { credentials: "include" }
            );
            if (res.ok) {
              const json = await res.json();
              const translations: any[] = json?.result?.data?.json ?? [];
              const latest = translations.find((t: any) => t.status === "completed" && t.translatedText);
              if (latest) results[docId] = { text: latest.translatedText, lang: latest.targetLanguage };
            }
          } catch { /* ignore */ }
        })
      );
      setSavedTranslations(results);
    };
    fetchAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docIds.join(",")]);

  // Merge: session translations override saved ones
  const allTranslations = useMemo(() => {
    const merged: Record<number, { text: string; lang: string }> = { ...savedTranslations };
    for (const [id, entry] of Object.entries(translationResult)) {
      merged[Number(id)] = entry;
    }
    return merged;
  }, [savedTranslations, translationResult]);

  const handleSaveTag = (id: number) => {
    updateTag.mutate({ id, tag: tagValue.trim() || null });
    setEditingTag(null);
  };

  const handleSavePassword = (id: number) => {
    updatePassword.mutate({ id, docPassword: passwordValue.trim() || null });
    setEditingPassword(null);
  };

  const handleDelete = (id: number, fileName: string) => {
    if (!window.confirm(`Delete "${fileName}"? This cannot be undone.`)) return;
    deleteDoc.mutate({ id });
  };

  const handleTranslate = async (doc: any) => {
    setTranslateDocId(null);
    await translateDoc.mutateAsync({
      leadDocumentId: doc.id,
      fileUrl: doc.fileUrl,
      fileName: doc.fileName,
      mimeType: doc.mimeType ?? undefined,
      targetLanguage: translateLang,
      patientId: 0,
    });
  };

  // ─── Upload to section state ─────────────────────────────────────────────────
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  // Person-centric destination: key from getUploadDestinations (e.g. "primary-female", "partner-male")
  const [uploadDestKey, setUploadDestKey] = useState<string | null>(null);
  // Derived from selected destination
  const selectedDest = uploadDestinations.find((d: any) => d.key === uploadDestKey) ?? uploadDestinations[0];
  const uploadGender: "female" | "male" = selectedDest?.gender === "male" ? "male" : "female";
  const uploadLeadId: number = selectedDest?.leadId ?? leadId;
  const [uploadSection, setUploadSection] = useState("generalAttachmentsFemale");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadTag, setUploadTag] = useState("");
  const [uploadPassword, setUploadPassword] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadTargetStudyId, setUploadTargetStudyId] = useState<string>("__new__");
  const [uploadProgress, setUploadProgress] = useState(0); // 0-100
  const [uploadFileIndex, setUploadFileIndex] = useState(0); // 1-based current file index
  const [uploadPhase, setUploadPhase] = useState<"reading" | "uploading" | "processing" | "idle">("idle");
  const uploadAbortRef = useRef<AbortController | null>(null);

  // Radiology-specific state
  const [radStudyType, setRadStudyType] = useState("tvus");
  const [radStudyName, setRadStudyName] = useState(""); // editable study name for new study
  const [radReportFiles, setRadReportFiles] = useState<File[]>([]);
  const [radImageFiles, setRadImageFiles] = useState<File[]>([]);
  const [radDicomFiles, setRadDicomFiles] = useState<File[]>([]);
  const [radStudyChoice, setRadStudyChoice] = useState<"new" | "existing">("new");
  const [radTargetStudyId, setRadTargetStudyId] = useState<string>("__new__");
  // Per-file passwords: key = "zone-index" e.g. "report-0", "image-1", "dicom-0"
  const [radFilePasswords, setRadFilePasswords] = useState<Record<string, string>>({});
  // Per-file passwords for non-radiology uploads: key = file index
  const [uploadFilePasswords, setUploadFilePasswords] = useState<Record<number, string>>({});

  const FEMALE_STUDY_TYPES = [
    { value: "tvus", label: "Transvaginal / Pelvic Ultrasound" },
    { value: "hsg", label: "HSG (Hysterosalpingography)" },
    { value: "mri", label: "MRI" },
    { value: "ct", label: "CT Scan" },
    { value: "mammography", label: "Mammography" },
    { value: "xray", label: "X-Ray" },
    { value: "hysteroscopy", label: "Hysteroscopy" },
    { value: "other", label: "Other Imaging" },
  ];
  const MALE_STUDY_TYPES = [
    { value: "scrotal", label: "Scrotal / Testicular Ultrasound" },
    { value: "mri", label: "MRI" },
    { value: "ct", label: "CT Scan" },
    { value: "xray", label: "X-Ray" },
    { value: "other", label: "Other Imaging" },
  ];
  const studyTypeOptions = uploadGender === "female" ? FEMALE_STUDY_TYPES : MALE_STUDY_TYPES;

  const sectionOptions = uploadGender === "female" ? FEMALE_SECTIONS : MALE_SECTIONS;

  const isRadiology = uploadSection === "radiology";

  // Fetch existing radiology studies when user picks radiology section
  const { data: existingStudies = [] } = trpc.leads.getRadiologyStudies.useQuery(
    { leadId, gender: uploadGender },
    { enabled: showUploadDialog && isRadiology }
  );

  // Keep needsStudyPicker for legacy compat (not used in new flow)
  const needsStudyPicker = false;

  const addDocToSection = trpc.leads.addDocumentToSection.useMutation({
    onSuccess: (data) => {
      utils.leads.documents.invalidate();
      utils.leads.medicalIntake.invalidate({ leadId });
      // Cross-invalidate the Patient Documents tab when this lead is linked to a patient
      const linkedPatientId = data?.linkedPatientId ?? (lead as any)?.convertedPatientId;
      if (linkedPatientId) utils.patients.documents.invalidate({ patientId: linkedPatientId });
    },
    onError: (e) => toast.error(e.message || "Upload failed"),
  });

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const uploadSingleFile = async (file: File, section: string, tag: string, targetStudyId?: string, filePassword?: string, studyName?: string) => {
    const signal = uploadAbortRef.current?.signal;
    if (signal?.aborted) throw new DOMException("Upload cancelled", "AbortError");
    setUploadPhase("reading");
    setUploadProgress(10);
    const base64 = await readFileAsBase64(file);
    if (signal?.aborted) throw new DOMException("Upload cancelled", "AbortError");
    setUploadPhase("uploading");
    setUploadProgress(40);
    let pct = 40;
    const iv = setInterval(() => {
      if (signal?.aborted) { clearInterval(iv); return; }
      pct = Math.min(pct + 6, 88); setUploadProgress(pct);
    }, 200);
    try {
      await addDocToSection.mutateAsync({
        leadId: uploadLeadId,
        gender: uploadGender,
        section,
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        tag,
        docPassword: filePassword?.trim() || undefined,
        targetStudyId,
        studyName: studyName?.trim() || undefined,
      });
    } finally {
      clearInterval(iv);
    }
    if (signal?.aborted) throw new DOMException("Upload cancelled", "AbortError");
    setUploadPhase("processing");
    setUploadProgress(95);
    await new Promise(r => setTimeout(r, 150));
    setUploadProgress(100);
    await new Promise(r => setTimeout(r, 100));
  };

  const handleCancelUpload = useCallback(() => {
    if (uploadAbortRef.current) {
      uploadAbortRef.current.abort();
      uploadAbortRef.current = null;
    }
    setUploadLoading(false);
    setUploadProgress(0);
    setUploadPhase("idle");
    setUploadFileIndex(0);
    toast.info("Upload cancelled — you can re-upload your files.");
  }, []);

  const handleUploadToSection = async () => {
    if (!uploadSection) return toast.error("Please select a section");

    if (isRadiology) {
      // ── Radiology unified flow ──
      const totalFiles = radReportFiles.length + radImageFiles.length + radDicomFiles.length;
      if (totalFiles === 0) return toast.error("Please select at least one file in any zone");
      uploadAbortRef.current = new AbortController();
      setUploadLoading(true);
      setUploadProgress(0);
      setUploadFileIndex(0);
      setUploadPhase("idle");
      const studyTypeLabelMap: Record<string, string> = {
        tvus: "Transvaginal-PelvicUltrasound", hsg: "HSG", mri: "MRI", ct: "CTScan",
        mammography: "Mammography", xray: "XRay", hysteroscopy: "Hysteroscopy",
        scrotal: "ScroталUltrasound", other: "OtherImaging",
      };
      const typeSlug = studyTypeLabelMap[radStudyType] ?? radStudyType;
      const targetId = radStudyChoice === "existing" && radTargetStudyId !== "__new__" ? radTargetStudyId : undefined;
      // Compute final study name: user-typed or auto-generated
      const typeLabel = studyTypeOptions.find(t => t.value === radStudyType)?.label ?? radStudyType;
      const finalStudyName = radStudyName.trim() || `${typeLabel} — ${new Date().toISOString().slice(0, 10)}`;
      let fileIdx = 0;
      try {
        const createdStudyId: string | undefined = targetId;
        for (let i = 0; i < radReportFiles.length; i++) {
          fileIdx++; setUploadFileIndex(fileIdx);
          await uploadSingleFile(radReportFiles[i], "radiologyReport", `${typeSlug}-Report`, createdStudyId, radFilePasswords[`report-${i}`], finalStudyName);
        }
        for (let i = 0; i < radImageFiles.length; i++) {
          fileIdx++; setUploadFileIndex(fileIdx);
          await uploadSingleFile(radImageFiles[i], "radiologyImages", `${typeSlug}-Image`, createdStudyId, radFilePasswords[`image-${i}`], finalStudyName);
        }
        for (let i = 0; i < radDicomFiles.length; i++) {
          fileIdx++; setUploadFileIndex(fileIdx);
          await uploadSingleFile(radDicomFiles[i], "radiologyDicom", `${typeSlug}-DICOM`, createdStudyId, radFilePasswords[`dicom-${i}`], finalStudyName);
        }
        toast.success(`${totalFiles} file(s) uploaded to Radiology`);
        setShowUploadDialog(false);
        setRadReportFiles([]); setRadImageFiles([]); setRadDicomFiles([]);
        setRadStudyChoice("new"); setRadTargetStudyId("__new__");
        setRadStudyName(""); setRadFilePasswords({});
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          // error shown by mutation onError
        }
      } finally {
        uploadAbortRef.current = null;
        setUploadLoading(false); setUploadProgress(0); setUploadPhase("idle"); setUploadFileIndex(0);
      }
      return;
    }

    // ── Non-radiology flow ──
    if (!uploadFiles.length) return toast.error("Please select at least one file");
    uploadAbortRef.current = new AbortController();
    setUploadLoading(true);
    setUploadProgress(0);
    setUploadFileIndex(0);
    setUploadPhase("idle");
    // Generate a shared studyId so all files in this upload session land in the same Study entry.
    // The first file creates the Study; subsequent files attach to it via targetStudyId.
    const sharedStudyId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      for (let i = 0; i < uploadFiles.length; i++) {
        setUploadFileIndex(i + 1);
        const autoTag = uploadTag.trim() || (sectionOptions.find(s => s.value === uploadSection)?.label?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) + "-01");
        await uploadSingleFile(uploadFiles[i], uploadSection, autoTag, sharedStudyId, uploadFilePasswords[i]);
      }
      toast.success(`${uploadFiles.length} file(s) uploaded to ${sectionOptions.find(s => s.value === uploadSection)?.label}`);
      setShowUploadDialog(false);
      setUploadFiles([]);
      setUploadTag("");
      setUploadPassword("");
      setUploadTargetStudyId("__new__");
      setUploadFilePasswords({});
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        // error shown by mutation onError
      }
    } finally {
      uploadAbortRef.current = null;
      setUploadLoading(false); setUploadProgress(0); setUploadPhase("idle"); setUploadFileIndex(0);
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload to section dialog */}
      {showUploadDialog && (
        <Dialog open onOpenChange={open => { if (!open && !uploadLoading) setShowUploadDialog(false); }}>
          <DialogContent className={`${isRadiology ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto`}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FolderOpen className="h-4 w-4" /> Upload Document to Intake Section</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {/* Person-centric destination selector */}
              {uploadDestinations.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Upload to</Label>
                  <div className="flex flex-col gap-1.5">
                    {uploadDestinations.map((dest: any) => (
                      <button
                        key={dest.key}
                        type="button"
                        className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                          (uploadDestKey ?? uploadDestinations[0]?.key) === dest.key
                            ? "border-primary bg-primary/5 font-medium"
                            : "border-border hover:border-primary/50 hover:bg-muted/40"
                        }`}
                        onClick={() => {
                          setUploadDestKey(dest.key);
                          // Reset section to the correct default for this person's gender
                          const g = dest.gender === "male" ? "male" : "female";
                          setUploadSection(g === "female" ? "generalAttachmentsFemale" : "generalAttachmentsMale");
                          setRadStudyType(g === "female" ? "tvus" : "scrotal");
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">{dest.gender === "female" ? "👩" : dest.gender === "male" ? "👨" : "👤"}</span>
                          <div>
                            <div className="font-medium">{dest.personName}</div>
                            <div className="text-xs text-muted-foreground">{dest.label}</div>
                          </div>
                          {!dest.hasIntake && (
                            <span className="ml-auto text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">No Health Record</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Intake Section */}
              <div className="space-y-1.5">
                <Label>Intake Section</Label>
                <Select value={uploadSection} onValueChange={v => { setUploadSection(v); setUploadTargetStudyId("__new__"); setRadStudyChoice("new"); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sectionOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* ── RADIOLOGY FLOW ── */}
              {isRadiology && (
                <>
                  {/* Study type */}
                  <div className="space-y-1.5">
                    <Label>Study Type</Label>
                    <Select value={radStudyType} onValueChange={setRadStudyType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {studyTypeOptions.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Three upload zones */}
                  <div className="grid grid-cols-3 gap-3">
                    {/* Report zone */}
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Report</Label>
                      <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/40 transition-colors">
                        <span className="text-lg">📄</span>
                        <span className="text-[10px] text-muted-foreground text-center mt-0.5">{radReportFiles.length ? `${radReportFiles.length} file(s)` : "PDF / image"}</span>
                        <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.tiff,.bmp" className="hidden"
                          onChange={e => setRadReportFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])} />
                      </label>
                      {radReportFiles.length > 0 && (
                        <ul className="text-[10px] space-y-1.5 max-h-28 overflow-y-auto">
                          {radReportFiles.map((f, i) => (
                            <li key={i} className="space-y-0.5">
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <span className="truncate flex-1">{f.name}</span>
                                <button type="button" onClick={() => { setRadReportFiles(prev => prev.filter((_, j) => j !== i)); setRadFilePasswords(p => { const n = {...p}; delete n[`report-${i}`]; return n; }); }} className="shrink-0 text-destructive hover:text-destructive/80"><X className="h-2.5 w-2.5" /></button>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] text-muted-foreground">🔑</span>
                                <input type="password" placeholder="Password (if any)" className="flex-1 h-5 text-[9px] rounded border border-border bg-background px-1 outline-none focus:ring-1 focus:ring-primary" value={radFilePasswords[`report-${i}`] ?? ""} onChange={e => setRadFilePasswords(p => ({...p, [`report-${i}`]: e.target.value}))} />
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Images zone */}
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> Radiological Images</Label>
                      <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/40 transition-colors">
                        <span className="text-lg">🩻</span>
                        <span className="text-[10px] text-muted-foreground text-center mt-0.5">{radImageFiles.length ? `${radImageFiles.length} file(s)` : "JPG / PNG / WEBP"}</span>
                        <input type="file" multiple accept="image/*" className="hidden"
                          onChange={e => setRadImageFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])} />
                      </label>
                      {radImageFiles.length > 0 && (
                        <ul className="text-[10px] space-y-1.5 max-h-28 overflow-y-auto">
                          {radImageFiles.map((f, i) => (
                            <li key={i} className="space-y-0.5">
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <span className="truncate flex-1">{f.name}</span>
                                <button type="button" onClick={() => { setRadImageFiles(prev => prev.filter((_, j) => j !== i)); setRadFilePasswords(p => { const n = {...p}; delete n[`image-${i}`]; return n; }); }} className="shrink-0 text-destructive hover:text-destructive/80"><X className="h-2.5 w-2.5" /></button>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] text-muted-foreground">🔑</span>
                                <input type="password" placeholder="Password (if any)" className="flex-1 h-5 text-[9px] rounded border border-border bg-background px-1 outline-none focus:ring-1 focus:ring-primary" value={radFilePasswords[`image-${i}`] ?? ""} onChange={e => setRadFilePasswords(p => ({...p, [`image-${i}`]: e.target.value}))} />
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* DICOM zone */}
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1"><Disc3 className="h-3.5 w-3.5" /> DICOM Files</Label>
                      <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/40 transition-colors">
                        <span className="text-lg">💿</span>
                        <span className="text-[10px] text-muted-foreground text-center mt-0.5">{radDicomFiles.length ? `${radDicomFiles.length} file(s)` : ".dcm files"}</span>
                        <input type="file" multiple accept=".dcm,.dicom" className="hidden"
                          onChange={e => setRadDicomFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])} />
                      </label>
                      {radDicomFiles.length > 0 && (
                        <ul className="text-[10px] space-y-1.5 max-h-28 overflow-y-auto">
                          {radDicomFiles.map((f, i) => (
                            <li key={i} className="space-y-0.5">
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <span className="truncate flex-1">{f.name}</span>
                                <button type="button" onClick={() => { setRadDicomFiles(prev => prev.filter((_, j) => j !== i)); setRadFilePasswords(p => { const n = {...p}; delete n[`dicom-${i}`]; return n; }); }} className="shrink-0 text-destructive hover:text-destructive/80"><X className="h-2.5 w-2.5" /></button>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] text-muted-foreground">🔑</span>
                                <input type="password" placeholder="Password (if any)" className="flex-1 h-5 text-[9px] rounded border border-border bg-background px-1 outline-none focus:ring-1 focus:ring-primary" value={radFilePasswords[`dicom-${i}`] ?? ""} onChange={e => setRadFilePasswords(p => ({...p, [`dicom-${i}`]: e.target.value}))} />
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Attach to existing or create new */}
                  <div className="space-y-2">
                    <Label className="text-xs">Link to study</Label>
                    <div className="flex gap-2">
                      <button type="button"
                        onClick={() => setRadStudyChoice("new")}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs text-left transition-colors ${
                          radStudyChoice === "new" ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/40"
                        }`}>
                        <div className="font-medium">+ Create new study</div>
                        <div className="text-muted-foreground mt-0.5">A new study entry will be created</div>
                      </button>
                      <button type="button"
                        onClick={() => setRadStudyChoice("existing")}
                        disabled={existingStudies.length === 0}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          radStudyChoice === "existing" ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/40"
                        }`}>
                        <div className="font-medium">Attach to existing study</div>
                        <div className="text-muted-foreground mt-0.5">{existingStudies.length === 0 ? "No existing studies" : `${existingStudies.length} study(ies) found`}</div>
                      </button>
                    </div>
                    {radStudyChoice === "existing" && existingStudies.length > 0 && (
                      <Select value={radTargetStudyId} onValueChange={setRadTargetStudyId}>
                        <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Select a study" /></SelectTrigger>
                        <SelectContent>
                          {existingStudies.map(st => (
                            <SelectItem key={st.id} value={st.id}>
                              {st.studyName || studyTypeOptions.find(t => t.value === st.type)?.label || st.type}{st.date ? ` — ${st.date}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {radStudyChoice === "new" && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Study name (optional — auto-generated if empty)</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder={`${studyTypeOptions.find(t => t.value === radStudyType)?.label ?? "Study"} — ${new Date().toISOString().slice(0, 10)}`}
                          value={radStudyName}
                          onChange={e => setRadStudyName(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── NON-RADIOLOGY FLOW ── */}
              {!isRadiology && (
                <>
                  <div className="space-y-1.5">
                    <Label>Files</Label>
                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/40 transition-colors">
                      <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground">{uploadFiles.length ? `${uploadFiles.length} file(s) selected` : "Click to select files"}</span>
                      <input type="file" multiple className="hidden" onChange={e => setUploadFiles(Array.from(e.target.files ?? []))} />
                    </label>
                    {uploadFiles.length > 0 && (
                      <ul className="text-xs space-y-2 max-h-32 overflow-y-auto">
                        {uploadFiles.map((f, i) => (
                          <li key={i} className="space-y-0.5">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <span className="truncate flex-1">• {f.name}</span>
                              <button type="button" onClick={() => setUploadFiles(prev => prev.filter((_, j) => j !== i))} className="shrink-0 text-destructive hover:text-destructive/80"><X className="h-3 w-3" /></button>
                            </div>
                            <div className="flex items-center gap-1 pl-2">
                              <span className="text-[10px] text-muted-foreground">🔑</span>
                              <input type="password" placeholder="Password (if protected)" className="flex-1 h-6 text-xs rounded border border-border bg-background px-1.5 outline-none focus:ring-1 focus:ring-primary" value={uploadFilePasswords[i] ?? ""} onChange={e => setUploadFilePasswords(p => ({...p, [i]: e.target.value}))} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tag (optional — auto-generated if empty)</Label>
                    <Input placeholder="e.g. LabResult-01" value={uploadTag} onChange={e => setUploadTag(e.target.value)} />
                  </div>
                </>
              )}

              {/* Progress indicator */}
              {uploadLoading && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {uploadPhase === "reading" && "Reading file…"}
                      {uploadPhase === "uploading" && "Uploading to server…"}
                      {uploadPhase === "processing" && "Saving…"}
                      {(isRadiology ? (radReportFiles.length + radImageFiles.length + radDicomFiles.length) : uploadFiles.length) > 1 && ` (file ${uploadFileIndex} of ${isRadiology ? radReportFiles.length + radImageFiles.length + radDicomFiles.length : uploadFiles.length})`}
                    </span>
                    <span className="font-medium tabular-nums">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (uploadLoading) {
                      handleCancelUpload();
                    } else {
                      setShowUploadDialog(false);
                    }
                  }}
                >
                  {uploadLoading ? "Stop Upload" : "Cancel"}
                </Button>
                <Button
                  onClick={handleUploadToSection}
                  disabled={uploadLoading || (isRadiology
                    ? (radReportFiles.length + radImageFiles.length + radDicomFiles.length) === 0
                    : uploadFiles.length === 0
                  )}>
                  {uploadLoading ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Uploading…</> : <><Upload className="h-3.5 w-3.5 mr-1.5" />Upload</>}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {/* Direct Upload Dialog */}
      {showDirectUploadDialog && (
        <Dialog open onOpenChange={open => { if (!open && !directUploadLoading) { setShowDirectUploadDialog(false); setDirectUploadFiles([]); setDirectUploadTag(""); setDirectUploadPassword(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Paperclip className="h-4 w-4" /> Upload to Documents Library</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">Upload files directly to the Documents Library. These files are <strong>not</strong> attached to any Health Record section and are preserved during intake resets.</p>
              {/* Person selector */}
              {directUploadDestinations.length > 1 && (
                <div className="space-y-1.5">
                  <Label>Upload for</Label>
                  <div className="flex gap-2">
                    {directUploadDestinations.map((dest: any) => (
                      <button key={dest.key} type="button"
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors ${
                          (selectedDirectDest?.key === dest.key) ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent/40"
                        }`}
                        onClick={() => setDirectUploadDestKey(dest.key)}>
                        {dest.gender === "female" ? "♀" : dest.gender === "male" ? "♂" : ""} {dest.personName}
                        {dest.isPrimary && <span className="text-xs text-muted-foreground">(primary)</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* File picker */}
              <div className="space-y-1.5">
                <Label>Files</Label>
                <input type="file" multiple className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:text-sm file:bg-muted/40 file:cursor-pointer"
                  onChange={e => setDirectUploadFiles(Array.from(e.target.files ?? []))} />
                {directUploadFiles.length > 0 && (
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {directUploadFiles.map((f, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <span className="truncate">{f.name}</span>
                        <button type="button" onClick={() => setDirectUploadFiles(prev => prev.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {/* Tag */}
              <div className="space-y-1.5">
                <Label>Tag / Label</Label>
                <Input placeholder="e.g. BloodTest-01" value={directUploadTag} onChange={e => setDirectUploadTag(e.target.value)} />
              </div>
              {/* Password */}
              <div className="space-y-1.5">
                <Label>Document password (if protected)</Label>
                <Input type="password" placeholder="Optional" value={directUploadPassword} onChange={e => setDirectUploadPassword(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => { setShowDirectUploadDialog(false); setDirectUploadFiles([]); setDirectUploadTag(""); setDirectUploadPassword(""); }} disabled={directUploadLoading}>Cancel</Button>
                <Button size="sm" onClick={handleDirectUpload} disabled={directUploadLoading || directUploadFiles.length === 0}>
                  {directUploadLoading ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Uploading…</> : <><Paperclip className="h-3.5 w-3.5 mr-1.5" />Upload to Library</>}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3 flex-1">
          Documents attached to this lead. Tag each document and use AI translation when needed.
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setShowDirectUploadDialog(true)}>
            <Paperclip className="h-3.5 w-3.5 mr-1.5" />Upload to Library
          </Button>
          <Button size="sm" onClick={() => setShowUploadDialog(true)} disabled={hasIntakeConflict} title={hasIntakeConflict ? "Resolve intake conflict before uploading to a section" : undefined}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />Upload to Section
          </Button>
        </div>
      </div>

      {/* Lifecycle filter tabs */}
      {docs && docs.length > 0 && (() => {
        const counts = {
          all: docs.length,
          active: docs.filter((d: any) => d.lifecycleStatus === "active").length,
          historical: docs.filter((d: any) => d.lifecycleStatus === "historical").length,
          "direct-upload": docs.filter((d: any) => d.lifecycleStatus === "direct-upload").length,
          unclassified: docs.filter((d: any) => !d.lifecycleStatus).length,
        };
        const filters: { key: LifecycleFilter; label: string; color: string }[] = ([
          { key: "all" as LifecycleFilter, label: "All", color: "" },
          { key: "active" as LifecycleFilter, label: "Active", color: "text-green-700 dark:text-green-400" },
          { key: "historical" as LifecycleFilter, label: "Historical", color: "text-amber-700 dark:text-amber-400" },
          { key: "direct-upload" as LifecycleFilter, label: "Direct Upload", color: "text-blue-700 dark:text-blue-400" },
          { key: "unclassified" as LifecycleFilter, label: "Unclassified", color: "text-muted-foreground" },
        ] as { key: LifecycleFilter; label: string; color: string }[]).filter(f => f.key === "all" || counts[f.key as keyof typeof counts] > 0);
        return (
          <div className="flex flex-wrap gap-1">
            {filters.map(f => (
              <button
                key={f.key}
                type="button"
                onClick={() => setLifecycleFilter(f.key)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  lifecycleFilter === f.key
                    ? "bg-foreground text-background border-foreground"
                    : "bg-transparent border-border hover:bg-muted/50 " + f.color
                }`}
              >
                {f.label} <span className="opacity-60">({counts[f.key]})</span>
              </button>
            ))}
          </div>
        );
      })()}

      {!docs?.length ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No documents uploaded yet.</div>
      ) : (() => {
        const filtered = lifecycleFilter === "all"
          ? docs
          : lifecycleFilter === "unclassified"
            ? docs.filter((d: any) => !d.lifecycleStatus)
            : docs.filter((d: any) => d.lifecycleStatus === lifecycleFilter);
        if (!filtered.length) {
          return <div className="text-center py-8 text-muted-foreground text-sm">No documents in this category.</div>;
        }
        return (
          <div className="space-y-3">
            {filtered.map((d: any) => {
              const lifecycle: string | null = d.lifecycleStatus ?? null;
              const isHistorical = lifecycle === "historical";
              const isDirectUpload = lifecycle === "direct-upload";
              return (
                <Card key={d.id} className={isHistorical ? "border-amber-300/60 dark:border-amber-700/40 bg-amber-50/30 dark:bg-amber-950/10" : ""}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <FileText className={`h-4 w-4 shrink-0 ${isHistorical ? "text-amber-500" : "text-muted-foreground"}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium break-all">{d.fileName}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <p className="text-xs text-muted-foreground">{format(new Date(d.createdAt), "MMM d, yyyy")}</p>
                            {/* Lifecycle badge */}
                            {lifecycle === "active" && (
                              <Badge className="text-xs font-normal h-4 px-1.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">Active</Badge>
                            )}
                            {lifecycle === "historical" && (
                              <Badge className="text-xs font-normal h-4 px-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">Historical</Badge>
                            )}
                            {lifecycle === "direct-upload" && (
                              <Badge className="text-xs font-normal h-4 px-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0">Direct Upload</Badge>
                            )}
                            {!lifecycle && (
                              <Badge variant="outline" className="text-xs font-normal h-4 px-1.5 opacity-50">Unclassified</Badge>
                            )}
                            {/* Archive date for historical docs */}
                            {isHistorical && d.archivedAt && (
                              <span className="text-xs text-amber-600/70 dark:text-amber-400/60">
                                Archived {format(new Date(d.archivedAt), "MMM d, yyyy")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <FileViewButton
                          fileUrl={d.fileUrl}
                          fileName={d.fileName}
                          mimeType={d.mimeType}
                          label={d.tag || d.fileName}
                        />
                        <Button variant="ghost" size="sm" title={isHistorical ? "Permanently delete archived document" : "Delete document"}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(d.id, d.fileName)}
                          disabled={deleteDoc.isPending}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {/* Historical notice */}
                    {isHistorical && (
                      <div className="pl-7">
                        <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                          This document was part of a previous Health Record. It is preserved for reference.
                          {d.archiveReason ? ` Reason: ${d.archiveReason}.` : ""}
                        </p>
                      </div>
                    )}
                    {/* Tag row */}
                    <div className="flex flex-wrap items-center gap-2 pl-7">
                      {editingTag === d.id ? (
                        <div className="flex items-center gap-1">
                          <Input value={tagValue} onChange={e => setTagValue(e.target.value)}
                            className="h-6 text-xs w-40"
                            onKeyDown={e => { if (e.key === "Enter") handleSaveTag(d.id); if (e.key === "Escape") setEditingTag(null); }} />
                          <Button size="sm" className="h-6 px-2 text-xs" onClick={() => handleSaveTag(d.id)}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => setEditingTag(null)}><X className="h-3 w-3" /></Button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingTag(d.id); setTagValue(d.tag ?? d.intakeSection ?? ""); }}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          {d.tag ? (
                            <Badge variant="secondary" className="text-xs font-normal">{d.tag}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground/60 italic">+ Add tag</span>
                          )}
                          <Pencil className="h-2.5 w-2.5 opacity-50" />
                        </button>
                      )}
                      {d.intakeSection && (
                        <Badge variant="outline" className="text-xs font-normal opacity-60">{d.intakeSection}</Badge>
                      )}
                    </div>
                    {/* Password row */}
                    <div className="flex flex-wrap items-center gap-2 pl-7">
                      {editingPassword === d.id ? (
                        <div className="flex items-center gap-1">
                          <div className="relative">
                            <Input
                              type={showPassword[d.id] ? "text" : "password"}
                              value={passwordValue}
                              onChange={e => setPasswordValue(e.target.value)}
                              placeholder="Document password"
                              className="h-6 text-xs w-44 pr-7"
                              onKeyDown={e => { if (e.key === "Enter") handleSavePassword(d.id); if (e.key === "Escape") setEditingPassword(null); }}
                            />
                            <button type="button" className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                              onClick={() => setShowPassword(prev => ({ ...prev, [d.id]: !prev[d.id] }))}>
                              {showPassword[d.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </button>
                          </div>
                          <Button size="sm" className="h-6 px-2 text-xs" onClick={() => handleSavePassword(d.id)}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => setEditingPassword(null)}><X className="h-3 w-3" /></Button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingPassword(d.id); setPasswordValue(d.docPassword ?? ""); }}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          {d.docPassword ? (
                            <Badge variant="outline" className="text-xs font-normal gap-1"><Lock className="h-2.5 w-2.5" />Password set</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground/60 italic flex items-center gap-1"><Lock className="h-2.5 w-2.5" />+ Add password (if protected)</span>
                          )}
                          <Pencil className="h-2.5 w-2.5 opacity-50" />
                        </button>
                      )}
                    </div>
                    {/* Saved Translations Panel — shown for all lifecycle states */}
                    <div className="pl-7">
                      <SavedTranslationsPanel
                        leadDocumentId={d.id}
                        fileUrl={normaliseFileUrl(d.fileUrl ?? "")}
                        fileName={d.fileName}
                        mimeType={d.mimeType}
                        patientId={0}
                        intakeSection={d.intakeSection}
                        readOnly={isHistorical || isDirectUpload}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Lead Appointment Form Modal ──────────────────────────────────────────────
function LeadAppointmentFormModal({ leadId, lead, onClose, onSuccess }: {
  leadId: number; lead: any; onClose: () => void; onSuccess: () => void;
}) {
  const { data: doctors } = trpc.doctors.list.useQuery();
  const { data: services } = trpc.services.list.useQuery({});
  const { data: partnerClinics } = trpc.partnerClinics.list.useQuery();
  const createAppt = trpc.appointments.create.useMutation({
    onSuccess: () => { toast.success("Appointment created"); onSuccess(); },
    onError: () => toast.error("Appointment could not be saved. Please review the marked fields and try again."),
  });

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const nowHour = format(new Date(), "HH:mm");

  const [form, setForm] = useState({
    title: "", doctorId: "", serviceId: "",
    date: todayStr, time: "09:00", endTime: "09:30", duration: "30",
    type: "consultation", appointmentType: "in-clinic", purpose: "",
    meetingLink: "", partnerClinicId: "", externalLocation: "", notes: "",
  });

  const minTime = form.date === todayStr ? nowHour : "00:00";

  // Staff availability check
  const conflictDate = useMemo(() => {
    if (!form.date || !form.time) return null;
    const d = new Date(`${form.date}T${form.time}`);
    return isNaN(d.getTime()) ? null : d;
  }, [form.date, form.time]);
  const selectedDoctor = doctors?.find((d: any) => String(d.id) === form.doctorId);
  const { data: doctorUnavail } = trpc.availability.checkUnavailable.useQuery(
    { userId: selectedDoctor?.userId ?? 0, date: conflictDate ?? new Date() },
    { enabled: !!form.doctorId && !!selectedDoctor?.userId && !!conflictDate }
  );
  const unavailWarnings: { name: string; reason?: string; title?: string }[] = [];
  if (doctorUnavail?.unavailable) {
    unavailWarnings.push({ name: selectedDoctor ? `Dr. ${selectedDoctor.name}` : "Doctor", reason: doctorUnavail.reason ?? undefined, title: doctorUnavail.title ?? undefined });
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedDt = new Date(`${form.date}T${form.time}`);
    const now = new Date(); now.setSeconds(0, 0);
    if (selectedDt < now) return toast.error("Cannot schedule an appointment in the past");
    const endDate = endDateFromLocalTime(selectedDt, form.endTime);
    if (!endDate) return toast.error("Please enter a valid end time");
    const meetingLinkError = validateOptionalMeetingLink(form.meetingLink);
    if (meetingLinkError) return toast.error(meetingLinkError);
    const leadName = [lead.firstName, (lead as any).middleName, lead.lastName].filter(Boolean).join(" ");
    const autoTitle = leadName
      ? `${leadName}${form.purpose ? ` — ${form.purpose.replace(/-/g, " ")}` : ""}`
      : "Appointment";
    // If already converted to patient, link to patient record; otherwise link to lead
    createAppt.mutate({
      ...(lead.convertedPatientId ? { patientId: lead.convertedPatientId } : { leadId }),
      doctorId: form.doctorId ? parseInt(form.doctorId) : undefined,
      serviceId: form.serviceId ? parseInt(form.serviceId) : undefined,
      title: form.title.trim() || autoTitle,
      appointmentDate: new Date(`${form.date}T${form.time}`),
      endDate,
      duration: Math.round((endDate.getTime() - selectedDt.getTime()) / 60_000),
      type: form.type as any,
      appointmentType: form.appointmentType as any,
      purpose: form.purpose as any || undefined,
      meetingLink: form.meetingLink || undefined,
        partnerClinicId: form.partnerClinicId ? parseInt(form.partnerClinicId) : undefined,
        externalLocation: form.appointmentType === "external" && !form.partnerClinicId ? form.externalLocation.trim() || undefined : undefined,
      notes: form.notes || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Appointment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 [&_.col-span-2]:col-span-1 sm:grid-cols-2 sm:[&_.col-span-2]:col-span-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Title (optional)</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Auto-generated if left blank" />
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" min={todayStr} value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Start Time *</Label>
              <Input type="time" min={minTime} value={form.time}
                onChange={e => setForm(f => {
                  const start = new Date(`${f.date}T${e.target.value}`);
                  return { ...f, time: e.target.value, endTime: localTimeValue(new Date(start.getTime() + (parseInt(f.duration) || 30) * 60_000)) };
                })} required />
            </div>
            <div className="space-y-1.5">
              <Label>End Time *</Label>
              <Input type="time" value={form.endTime}
                onChange={e => setForm(f => {
                  const start = new Date(`${f.date}T${f.time}`);
                  const end = endDateFromLocalTime(start, e.target.value);
                  return { ...f, endTime: e.target.value, duration: end ? String(Math.round((end.getTime() - start.getTime()) / 60_000)) : f.duration };
                })} required />
              {form.endTime < form.time && <p className="text-xs text-muted-foreground">An earlier clock time is scheduled for the following day.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Duration <span className="text-xs font-normal text-muted-foreground">(derived)</span></Label>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">{form.duration || 0} min</div>
              <div className="flex flex-wrap gap-1">
                {["15", "30", "45", "60"].map(v => <Button key={v} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setForm(f => {
                  const start = new Date(`${f.date}T${f.time}`);
                  return { ...f, duration: v, endTime: localTimeValue(new Date(start.getTime() + (parseInt(v) || 30) * 60_000)) };
                })}>{v} min</Button>)}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.appointmentType} onValueChange={v => setForm(f => ({
                ...f,
                appointmentType: v,
                meetingLink: v === "online" ? f.meetingLink : "",
                partnerClinicId: v === "external" ? f.partnerClinicId : "",
                externalLocation: v === "external" ? f.externalLocation : "",
              }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in-clinic">In-Clinic</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="external">External</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Doctor</Label>
              <Select value={form.doctorId} onValueChange={v => setForm(f => ({ ...f, doctorId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                <SelectContent>
                  {(doctors ?? []).map((d: any) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Service</Label>
              <Select value={form.serviceId} onValueChange={v => setForm(f => ({ ...f, serviceId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                <SelectContent>
                  {(services ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Purpose</Label>
              <Select value={form.purpose} onValueChange={v => setForm(f => ({ ...f, purpose: v }))}>
                <SelectTrigger><SelectValue placeholder="Select purpose" /></SelectTrigger>
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
            {form.appointmentType === "online" && (
              <div className="col-span-2 space-y-1.5">
                <Label>Meeting Link</Label>
                <div className="relative">
                  <Input value={form.meetingLink} onChange={e => setForm(f => ({ ...f, meetingLink: e.target.value }))}
                    placeholder="https://meet.google.com/..." aria-invalid={Boolean(validateOptionalMeetingLink(form.meetingLink))} className={`pr-10 ${validateOptionalMeetingLink(form.meetingLink) ? "border-destructive focus-visible:ring-destructive" : ""}`} />
                  {form.meetingLink && <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2" aria-label="Clear meeting link" title="Clear meeting link" onClick={() => setForm(f => ({ ...f, meetingLink: "" }))}><X className="h-4 w-4" /></Button>}
                </div>
                {validateOptionalMeetingLink(form.meetingLink) && <p className="text-xs text-destructive">{validateOptionalMeetingLink(form.meetingLink)}</p>}
                {!form.meetingLink && <p className="text-xs text-muted-foreground">Save this Online appointment first, then choose Generate Google Meet from its details.</p>}
              </div>
            )}
            {form.appointmentType === "external" && (
              <div className="col-span-2 space-y-1.5">
                <Label>Partner Clinic</Label>
                <Select value={form.partnerClinicId || "_none"} onValueChange={v => setForm(f => ({ ...f, partnerClinicId: v === "_none" ? "" : v, externalLocation: "" }))}>
                  <SelectTrigger><SelectValue placeholder="Select partner clinic (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None / Manual Address —</SelectItem>
                    {partnerClinics?.map((clinic: any) => <SelectItem key={clinic.id} value={String(clinic.id)}>{clinic.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!form.partnerClinicId && <Input value={form.externalLocation} onChange={e => setForm(f => ({ ...f, externalLocation: e.target.value }))} placeholder="Enter address / location manually" />}
              </div>
            )}
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes..." rows={2} />
            </div>
          </div>
          {/* Staff time-off warning banner */}
          {unavailWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Staff Time-Off Warning
              </div>
              <ul className="space-y-1">
                {unavailWarnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-700 dark:text-amber-400">
                    <strong>{w.name}</strong> is marked as unavailable on this date
                    {w.title ? ` (${w.title})` : ""}
                    {w.reason ? ` — Reason: ${w.reason.charAt(0).toUpperCase() + w.reason.slice(1)}` : ""}.
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-600 dark:text-amber-500">You can still save, but please handle with caution.</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createAppt.isPending || Boolean(validateOptionalMeetingLink(form.meetingLink))}>
              {createAppt.isPending ? "Creating..." : "Create Appointment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Lead Appointment Detail Modal ───────────────────────────────────────────
function LeadApptDetailModal({ appointment: a, leadName, onClose, onRefresh }: {
  appointment: any; leadName: string; onClose: () => void; onRefresh: (appointmentPatch?: Record<string, unknown>) => void;
}) {
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSendDetails, setShowSendDetails] = useState(false);
  const [pendingStatusAction, setPendingStatusAction] = useState<AppointmentStatusAction | null>(null);
    const [deleteReason, setDeleteReason] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const apptTime = new Date(a.appointmentDate);
  const apptEndTime = effectiveAppointmentEnd({ appointmentDate: apptTime, endDate: a.endDate, duration: a.duration });
  const [editForm, setEditForm] = useState({
    title: a.title ?? "",
    appointmentDate: a.appointmentDate ? format(apptTime, "yyyy-MM-dd'T'HH:mm") : "",
    endDate: format(apptEndTime, "yyyy-MM-dd'T'HH:mm"),
    duration: String(a.duration ?? 30),
    doctorId: a.doctorId ? String(a.doctorId) : "",
    appointmentType: a.appointmentType ?? "in-clinic",
    purpose: a.purpose ?? "medical-consultation",
    notes: a.notes ?? "",
    meetingLink: a.meetingLink ?? "",
    partnerClinicId: String(a.partnerClinicId ?? ""),
    externalLocation: a.externalLocation ?? "",
  });
  const { data: apptDoctors } = trpc.doctors.list.useQuery();
  const { data: partnerClinics } = trpc.partnerClinics.list.useQuery();
  const updateAppt = trpc.appointments.update.useMutation({
    onSuccess: (_result, variables) => {
      toast.success("Appointment updated");
      onRefresh({ ...variables.data, ...(variables.data.status === "upcoming" ? { cancellationReason: null } : {}) });
    },
    onError: () => toast.error("Appointment could not be saved. Please review the marked fields and try again."),
  });
  const generateGoogleMeet = trpc.appointments.generateGoogleMeet.useMutation({
    onSuccess: result => {
      if (result.status === "generated") toast.success("Google Meet link generated and saved.");
      else if (result.status === "pending") toast.info(result.message ?? "Google Meet is being prepared. Please retry shortly.");
      else toast.info(result.message ?? "A meeting link is already available.");
      onRefresh();
    },
    onError: () => toast.error("Google Meet could not be generated. Check the Google Calendar connection and try again."),
  });
  const markNoShow = trpc.appointments.markNoShow.useMutation({
    onSuccess: () => { toast.success("Marked as no show"); onRefresh({ status: "no_show" }); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });
  const deleteAppt = trpc.appointments.delete.useMutation({
    onSuccess: () => { toast.success("Appointment deleted"); onClose(); onRefresh(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const statusBadge: Record<string, string> = {
    upcoming: "bg-blue-100 text-blue-700", confirmed: "bg-emerald-100 text-emerald-700",
    completed: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700",
    no_show: "bg-orange-100 text-orange-700", rescheduled: "bg-purple-100 text-purple-700",
  };
  const isPast = isBefore(apptTime, new Date());

  const handleCancel = () => {
    if (!cancelReason.trim()) return toast.error("Please provide a cancellation reason");
    updateAppt.mutate({ id: a.id, data: { status: "cancelled", cancellationReason: cancelReason } });
  };
  const handleStatusActionConfirm = () => {
    if (pendingStatusAction === "confirm") updateAppt.mutate({ id: a.id, data: { status: "confirmed" } });
    if (pendingStatusAction === "reactivate") updateAppt.mutate({ id: a.id, data: { status: "upcoming" } });
    if (pendingStatusAction === "complete") updateAppt.mutate({ id: a.id, data: { status: "completed" } });
    if (pendingStatusAction === "no_show") markNoShow.mutate({ id: a.id });
    setPendingStatusAction(null);
  };
  const handleSaveEdit = () => {
    if (!editForm.title.trim()) return toast.error("Title is required");
    if (!editForm.appointmentDate) return toast.error("Date and time are required");
    const appointmentDate = new Date(editForm.appointmentDate);
    const endDate = new Date(editForm.endDate);
    if (Number.isNaN(appointmentDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= appointmentDate) return toast.error("End time must be after start time");
    const meetingLinkError = validateOptionalMeetingLink(editForm.meetingLink);
    if (meetingLinkError) return toast.error(meetingLinkError);
    updateAppt.mutate({
      id: a.id,
      data: {
        title: editForm.title,
        appointmentDate,
        endDate,
        duration: Math.round((endDate.getTime() - appointmentDate.getTime()) / 60_000),
        doctorId: editForm.doctorId ? Number(editForm.doctorId) : undefined,
        appointmentType: editForm.appointmentType as any,
        purpose: editForm.purpose as any,
        notes: editForm.notes || undefined,
        meetingLink: editForm.appointmentType === "online" ? (editForm.meetingLink.trim() || null) : null,
        partnerClinicId: editForm.partnerClinicId ? Number(editForm.partnerClinicId) : null,
        externalLocation: editForm.appointmentType === "external" && !editForm.partnerClinicId ? editForm.externalLocation.trim() || null : null,
      },
    });
    setIsEditing(false);
    setShowCancelDialog(false);
  };

  return (
    <>
      <Dialog open onOpenChange={onClose}>
          <DialogContent className="flex max-h-[92dvh] max-w-md flex-col overflow-hidden p-0 sm:max-w-3xl">
            <DialogHeader className="shrink-0 border-b bg-background px-4 py-3 pr-12 sm:px-5">
            <DialogTitle className="text-sm">Appointment Details</DialogTitle>
            <AppointmentDetailsIdentityRow
              name={a.relatedEntityDisplayName || leadName || "Lead"}
              supportingText={a.purpose?.replace(/-/g, " ")}
              badges={<>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadge[a.status] ?? "bg-gray-100"}`}>{a.status.replace(/_/g, " ")}</span>
                {a.appointmentType && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold capitalize text-muted-foreground">{a.appointmentType.replace(/-/g, " ")}</span>}
              </>}
            />
            </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
            <AppointmentDetailsTimingGroup date={format(apptTime, "MMM d, yyyy")} start={format(apptTime, "h:mm a")} end={format(apptEndTime, "h:mm a")} duration={a.duration ? `${a.duration} min` : null} />
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
              {resolveEffectiveExternalLocation(a) && (
                <div className="min-w-0 sm:col-span-2">
                  <p className="text-[11px] text-muted-foreground">Location</p>
                  <p className="font-medium">{resolveEffectiveExternalLocation(a)}</p>
                  {a.appointmentType === "external" && a.partnerClinicGoogleMapsUrl && (
                    <a href={a.partnerClinicGoogleMapsUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm font-medium text-primary underline underline-offset-2">Open Map</a>
                  )}
                </div>
              )}
            </div>
            {a.meetingLink && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">{a.status === "cancelled" ? "Previously Saved Meeting Link" : "Meeting Link"}</p>
                {a.status === "cancelled" ? <p className="text-sm text-muted-foreground">Retained in history and inactive while this appointment is cancelled.</p> : <a href={a.meetingLink} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-primary underline break-all">{a.meetingLink}</a>}
              </div>
            )}
            {a.appointmentType === "online" && !a.meetingLink && (
              a.status === "cancelled" ? <div className="rounded-lg border border-muted bg-muted/40 p-3 text-xs text-muted-foreground">Meeting-link actions are unavailable while this appointment is cancelled. Re-activate it to create or replace a meeting link.</div> : <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
                <p className="text-xs text-violet-900 mb-2">No meeting link has been added.</p>
                <Button size="sm" variant="outline" className="w-full gap-1.5 sm:w-auto" disabled={generateGoogleMeet.isPending}
                  onClick={() => generateGoogleMeet.mutate({ appointmentId: a.id })}>
                  <Video className="h-3.5 w-3.5" />{generateGoogleMeet.isPending ? "Generating Google Meet…" : "Generate Google Meet"}
                </Button>
              </div>
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
            <div className="space-y-2 border-t pt-3">
              <AppointmentDetailsActionGroup label="Primary actions">
              {appointmentCommunicationActionLabel(a.status) && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowSendDetails(true)}>
                  <Mail className="h-3.5 w-3.5" /> {appointmentCommunicationActionLabel(a.status)}
                </Button>
              )}
              {a.status === "cancelled" && (
                <Button size="sm" variant="outline" className="gap-1.5 text-blue-700 border-blue-300" onClick={() => setPendingStatusAction("reactivate")}><RefreshCw className="h-3.5 w-3.5" /> Re-activate</Button>
              )}
              {a.status !== "completed" && a.status !== "cancelled" && (
                <>
                  {a.status === "upcoming" && (
                    <Button size="sm" variant="outline" className="gap-1.5 text-emerald-700 border-emerald-300" onClick={() => setPendingStatusAction("confirm")}>Confirm</Button>
                  )}
                  <Button size="sm" variant="outline"
                    className={`gap-1.5 ${isPast ? "text-green-700 border-green-300" : "text-muted-foreground border-muted cursor-not-allowed opacity-50"}`}
                    disabled={!isPast}
                    title={!isPast ? "Cannot mark as complete before the appointment time" : "Mark as completed"}
                    onClick={() => isPast && setPendingStatusAction("complete")}>
                    {!isPast && <AlertTriangle className="h-3.5 w-3.5" />}
                    Complete
                  </Button>
                  {isPast && (
                    <Button size="sm" variant="outline" className="gap-1.5 text-orange-700 border-orange-300"
                      onClick={() => setPendingStatusAction("no_show")}>
                      No Show
                    </Button>
                  )}
                </>
              )}
              </AppointmentDetailsActionGroup>
              <AppointmentDetailsActionGroup label="More">
                {a.status !== "completed" && a.status !== "cancelled" && <Button size="sm" variant="outline" className="gap-1.5 text-blue-700 border-blue-300" onClick={() => setIsEditing(true)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>}
              </AppointmentDetailsActionGroup>
              <AppointmentDetailsActionGroup label="Danger zone" tone="danger">
                {a.status !== "completed" && a.status !== "cancelled" && <Button size="sm" variant="outline" className="gap-1.5 text-red-700 border-red-300" onClick={() => setShowCancelDialog(true)}><XCircle className="h-3.5 w-3.5" /> Cancel Appointment</Button>}
                <Button size="sm" variant="ghost" className="gap-1.5 text-red-700" onClick={() => setShowDeleteDialog(true)}><TrashIcon className="h-3.5 w-3.5" /> Delete Appointment</Button>
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
            description="This action is permanent and cannot be undone."
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

      <Dialog open={isEditing} onOpenChange={(open) => { if (!open) setIsEditing(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Appointment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Start</Label>
                <Input type="datetime-local" value={editForm.appointmentDate}
                  onChange={e => setEditForm(f => {
                    const start = new Date(e.target.value);
                    return { ...f, appointmentDate: e.target.value, endDate: format(new Date(start.getTime() + (parseInt(f.duration) || 30) * 60_000), "yyyy-MM-dd'T'HH:mm") };
                  })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End</Label>
                <Input type="datetime-local" value={editForm.endDate}
                  onChange={e => setEditForm(f => {
                    const start = new Date(f.appointmentDate);
                    const end = new Date(e.target.value);
                    return { ...f, endDate: e.target.value, duration: !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) ? String(Math.round((end.getTime() - start.getTime()) / 60_000)) : f.duration };
                  })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Duration <span className="font-normal text-muted-foreground">(derived)</span></Label>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">{editForm.duration || 0} min</div>
                <div className="flex flex-wrap gap-1">
                  {["15", "30", "45", "60"].map(v => <Button key={v} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setEditForm(f => {
                    const start = new Date(f.appointmentDate);
                    return { ...f, duration: v, endDate: format(new Date(start.getTime() + (parseInt(v) || 30) * 60_000), "yyyy-MM-dd'T'HH:mm") };
                  })}>{v} min</Button>)}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Doctor</Label>
              <Select value={editForm.doctorId} onValueChange={v => setEditForm(f => ({ ...f, doctorId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select doctor..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No doctor —</SelectItem>
                  {(apptDoctors ?? []).map((d: any) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Appointment Type</Label>
                <Select value={editForm.appointmentType} onValueChange={v => setEditForm(f => ({
                  ...f,
                  appointmentType: v,
                  meetingLink: v === "online" ? f.meetingLink : "",
                  partnerClinicId: v === "external" ? f.partnerClinicId : "",
                  externalLocation: v === "external" ? f.externalLocation : "",
                }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in-clinic">In Clinic</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="external">External</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Purpose</Label>
                <Select value={editForm.purpose} onValueChange={v => setEditForm(f => ({ ...f, purpose: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales-consultation">Sales Consultation</SelectItem>
                    <SelectItem value="medical-consultation">Medical Consultation</SelectItem>
                    <SelectItem value="follow-up">Follow-up</SelectItem>
                    <SelectItem value="procedure">Procedure</SelectItem>
                    <SelectItem value="diagnostic-test">Diagnostic Test</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editForm.appointmentType === "online" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Meeting Link</Label>
                {a.status === "cancelled" ? <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Meeting link is retained and locked while this appointment is cancelled. Re-activate it before changing the link.</p> : <>
                  <div className="relative">
                    <Input value={editForm.meetingLink} placeholder="https://..."
                      onChange={e => setEditForm(f => ({ ...f, meetingLink: e.target.value }))}
                      aria-invalid={Boolean(validateOptionalMeetingLink(editForm.meetingLink))}
                      className={`pr-10 ${validateOptionalMeetingLink(editForm.meetingLink) ? "border-destructive focus-visible:ring-destructive" : ""}`} />
                    {editForm.meetingLink && <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2" aria-label="Clear meeting link" title="Clear meeting link" onClick={() => setEditForm(f => ({ ...f, meetingLink: "" }))}><X className="h-4 w-4" /></Button>}
                  </div>
                  {validateOptionalMeetingLink(editForm.meetingLink) && <p className="text-xs text-destructive">{validateOptionalMeetingLink(editForm.meetingLink)}</p>}
                </>}
              </div>
            )}
            {editForm.appointmentType === "external" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Partner Clinic</Label>
                <Select value={editForm.partnerClinicId || "_none"} onValueChange={v => setEditForm(f => ({ ...f, partnerClinicId: v === "_none" ? "" : v, externalLocation: "" }))}>
                  <SelectTrigger><SelectValue placeholder="Select partner clinic (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None / Manual Address —</SelectItem>
                    {partnerClinics?.map((clinic: any) => <SelectItem key={clinic.id} value={String(clinic.id)}>{clinic.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!editForm.partnerClinicId && <Input value={editForm.externalLocation} onChange={e => setEditForm(f => ({ ...f, externalLocation: e.target.value }))} placeholder="Enter address / location manually" />}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={editForm.notes} rows={2}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={updateAppt.isPending || Boolean(validateOptionalMeetingLink(editForm.meetingLink))}>
                {updateAppt.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Lead Tasks Tab ───────────────────────────────────────────────────────────

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

const TASK_STATUS_COLORS: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  deferred: "bg-orange-100 text-orange-700",
};

const emptyTaskForm = {
  title: "",
  type: "follow_up" as const,
  priority: "medium" as const,
  dueDate: "",
  dueTime: "",
  communicationMethod: "" as any,
  notes: "",
  assignedToId: "" as any,
  tags: [] as string[],
};

function LeadTasksTab({ leadId, leadName }: { leadId: number; leadName: string }) {
  const utils = trpc.useUtils();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...emptyTaskForm });
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ ...emptyTaskForm });
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "in_progress" | "done" | "deferred">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  type TaskShortcut = "all" | "today" | "overdue" | "week" | "month";
  const [activeShortcut, setActiveShortcut] = useState<TaskShortcut>("all");

  function applyTaskShortcut(s: TaskShortcut) {
    setActiveShortcut(s);
    const t = new Date().toISOString().slice(0, 10);
    const addD = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    const d = new Date();
    const mStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    if (s === "today") { setDateFrom(t); setDateTo(t); }
    else if (s === "overdue") { setDateFrom(""); setDateTo(addD(-1)); }
    else if (s === "week") { setDateFrom(t); setDateTo(addD(7)); }
    else if (s === "month") { setDateFrom(mStart); setDateTo(mEnd); }
    else { setDateFrom(""); setDateTo(""); }
  }

  const { data: tasksResult, isLoading } = trpc.tasks.list.useQuery({ leadId, pageSize: 1000 });
  const tasks = tasksResult?.data ?? [];
  const { data: staffUsers = [] } = trpc.users.listStaff.useQuery();

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("Task created");
      setShowCreate(false);
      setForm({ ...emptyTaskForm });
      utils.tasks.list.invalidate({ leadId });
    },
    onError: (e) => toast.error(e.message || "Failed to create task"),
  });

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      toast.success("Task updated");
      setEditingTask(null);
      utils.tasks.list.invalidate({ leadId });
    },
    onError: (e) => toast.error(e.message || "Failed to update task"),
  });

  const closeTask = trpc.tasks.close.useMutation({
    onSuccess: () => { toast.success("Task marked as done"); utils.tasks.list.invalidate({ leadId }); },
    onError: (e) => toast.error(e.message || "Failed to close task"),
  });

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => { toast.success("Task deleted"); utils.tasks.list.invalidate({ leadId }); },
    onError: (e) => toast.error(e.message || "Failed to delete task"),
  });

  const today = new Date().toISOString().slice(0, 10);

  const filtered = (tasks as any[]).filter((t: any) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (dateFrom && t.dueDate && t.dueDate < dateFrom) return false;
    if (dateTo && t.dueDate && t.dueDate > dateTo) return false;
    return true;
  });

  const deferred = filtered.filter((t: any) => t.status === "deferred");
  const done = filtered.filter((t: any) => t.status === "done");
  const overdue = filtered.filter((t: any) => t.status !== "done" && t.status !== "deferred" && t.dueDate && t.dueDate < today);
  const active = filtered.filter((t: any) => t.status !== "done" && t.status !== "deferred" && !(t.dueDate && t.dueDate < today));

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
      tags: task.tags ? (typeof task.tags === "string" ? task.tags.split(",").filter(Boolean) : task.tags) : [],
    });
    setEditingTask(task);
    setShowCreate(false);
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
      tags: editForm.tags.length > 0 ? editForm.tags.join(",") : undefined,
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createTask.mutate({
      ...form,
      leadId,
      assignedToId: form.assignedToId ? Number(form.assignedToId) : undefined,
      communicationMethod: form.communicationMethod || undefined,
      dueDate: form.dueDate || undefined,
      dueTime: form.dueTime || undefined,
      notes: form.notes || undefined,
      tags: form.tags.length > 0 ? form.tags.join(",") : undefined,
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-base">Tasks</h3>
          {(tasks as any[]).filter((t: any) => t.status !== "done").length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {(tasks as any[]).filter((t: any) => t.status !== "done").length} open
            </Badge>
          )}
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="h-8 gap-1 text-xs">
          <Plus className="h-3.5 w-3.5" />
          New Task
        </Button>
      </div>

      {/* Date Range Filter */}
      <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 space-y-2">
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setActiveShortcut("all"); }}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary w-full"
            />
          </div>
          <span className="text-muted-foreground text-sm pb-1 shrink-0">→</span>
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setActiveShortcut("all"); }}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary w-full"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); setActiveShortcut("all"); }}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center rounded-md border border-border bg-background shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-[10px] text-muted-foreground mr-1">Quick:</span>
          {(["all", "today", "overdue", "week", "month"] as const).map(s => (
            <button
              key={s}
              onClick={() => applyTaskShortcut(s)}
              className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                activeShortcut === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {s === "all" ? "All" : s === "today" ? "Today" : s === "overdue" ? "Overdue" : s === "week" ? "Next 7 Days" : "This Month"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="h-7 text-xs w-36">
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
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} task{filtered.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Edit Task Form */}
      {editingTask && (
        <Card className="border border-amber-300/60 bg-amber-50/30 shadow-sm">
          <CardContent className="px-4 pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Edit Task</p>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingTask(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form onSubmit={handleEdit} className="space-y-2.5">
              <div>
                <Label className="text-xs text-muted-foreground">Title *</Label>
                <Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Call back regarding IVF inquiry" className="h-9 text-sm mt-1" required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <Select value={editForm.type} onValueChange={v => setEditForm(f => ({ ...f, type: v as any }))}>
                    <SelectTrigger className="h-9 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(TASK_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Priority</Label>
                  <Select value={editForm.priority} onValueChange={v => setEditForm(f => ({ ...f, priority: v as any }))}>
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
                  <Input type="date" value={editForm.dueDate} min={new Date().toISOString().slice(0, 10)} onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))} className="h-9 text-xs mt-1 w-full" required />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Due Time</Label>
                  <Input type="time" value={editForm.dueTime} onChange={e => setEditForm(f => ({ ...f, dueTime: e.target.value }))} className="h-9 text-xs mt-1 w-full" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Via</Label>
                  <Select value={editForm.communicationMethod || "_none"} onValueChange={v => setEditForm(f => ({ ...f, communicationMethod: v === "_none" ? "" : v }))}>
                    <SelectTrigger className="h-9 text-xs mt-1"><SelectValue placeholder="— None —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {Object.entries(TASK_COMM_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Assign To</Label>
                  <Select value={editForm.assignedToId?.toString() || "_unassigned"} onValueChange={v => setEditForm(f => ({ ...f, assignedToId: v === "_unassigned" ? "" : v }))}>
                    <SelectTrigger className="h-9 text-xs mt-1"><SelectValue placeholder="— Unassigned —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_unassigned">— Unassigned —</SelectItem>
                      {staffUsers.map((u: any) => <SelectItem key={u.id} value={u.id.toString()}>{u.name || u.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <Textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes..." className="text-sm mt-1 min-h-[56px] resize-none" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Tags</Label>
                <div className="mt-1">
                  <TaskTagManager selectedTags={editForm.tags} onChange={tags => setEditForm(f => ({ ...f, tags }))} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditingTask(null)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={updateTask.isPending}>
                  {updateTask.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Create Task Form */}
      {showCreate && (
        <Card className="border border-primary/30 shadow-sm">
          <CardContent className="px-4 pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">New Task</p>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowCreate(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-2.5">
              <div>
                <Label className="text-xs text-muted-foreground">Title *</Label>
                <Input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Call back regarding IVF inquiry"
                  className="h-9 text-sm mt-1"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Type</Label>
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
                  <Label className="text-xs text-muted-foreground">Priority</Label>
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
                  <Input
                    type="date"
                    value={form.dueDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                    className="h-9 text-xs mt-1 w-full"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Due Time</Label>
                  <Input
                    type="time"
                    value={form.dueTime}
                    onChange={e => setForm(f => ({ ...f, dueTime: e.target.value }))}
                    className="h-9 text-xs mt-1 w-full"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Via</Label>
                  <Select value={form.communicationMethod || "_none"} onValueChange={v => setForm(f => ({ ...f, communicationMethod: v === "_none" ? "" : v }))}>
                    <SelectTrigger className="h-9 text-xs mt-1"><SelectValue placeholder="— Optional —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {Object.entries(TASK_COMM_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Assign To</Label>
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
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Additional notes..."
                  className="text-sm mt-1 min-h-[56px] resize-none"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Tags</Label>
                <div className="mt-1">
                  <TaskTagManager selectedTags={form.tags} onChange={tags => setForm(f => ({ ...f, tags }))} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={createTask.isPending}>
                  {createTask.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Create Task
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Task List */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-4 text-center">Loading tasks...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No tasks yet. Create one to track follow-ups.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {overdue.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" /> Overdue
              </p>
              {overdue.map((task: any) => (
                <TaskCard key={task.id} task={task} onClose={() => closeTask.mutate({ id: task.id })} onDelete={() => deleteTask.mutate({ id: task.id })} onStatusChange={(status) => updateTask.mutate({ id: task.id, status })} onEdit={() => openEdit(task)} />
              ))}
            </div>
          )}
          {active.length > 0 && (
            <div className="space-y-2">
              {(overdue.length > 0 || done.length > 0 || deferred.length > 0) && <p className="text-xs font-medium text-muted-foreground">Active Tasks</p>}
              {active.map((task: any) => (
                <TaskCard key={task.id} task={task} onClose={() => closeTask.mutate({ id: task.id })} onDelete={() => deleteTask.mutate({ id: task.id })} onStatusChange={(status) => updateTask.mutate({ id: task.id, status })} onEdit={() => openEdit(task)} />
              ))}
            </div>
          )}
          {done.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-green-600 flex items-center gap-1">
                <CheckSquare className="h-3.5 w-3.5" /> Done
              </p>
              {done.map((task: any) => (
                <TaskCard key={task.id} task={task} onClose={() => closeTask.mutate({ id: task.id })} onDelete={() => deleteTask.mutate({ id: task.id })} onStatusChange={(status) => updateTask.mutate({ id: task.id, status })} onEdit={() => openEdit(task)} />
              ))}
            </div>
          )}
          {deferred.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-orange-600 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Deferred / Delayed
              </p>
              {deferred.map((task: any) => (
                <TaskCard key={task.id} task={task} onClose={() => closeTask.mutate({ id: task.id })} onDelete={() => deleteTask.mutate({ id: task.id })} onStatusChange={(status) => updateTask.mutate({ id: task.id, status })} onEdit={() => openEdit(task)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskCard({ task, onClose, onDelete, onStatusChange, onEdit }: {
  task: any;
  onClose: () => void;
  onDelete: () => void;
  onStatusChange: (status: "open" | "in_progress" | "done" | "deferred") => void;
  onEdit: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = task.status !== "done" && task.dueDate && task.dueDate < today;

  return (
    <Card className={`${isOverdue ? "border-red-200 bg-red-50/30" : ""}`}>
      <CardContent className="px-4 py-3">
        <div className="flex items-start gap-3">
          <button
            onClick={task.status === "done" ? undefined : onClose}
            className={`mt-0.5 shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
              task.status === "done"
                ? "bg-green-500 border-green-500 text-white"
                : "border-muted-foreground/40 hover:border-green-500"
            }`}
          >
            {task.status === "done" && <CheckSquare className="h-3 w-3" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className={`text-sm font-medium leading-snug ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                {task.title}
              </p>
              <div className="flex items-center gap-1 shrink-0">
                <Select value={task.status} onValueChange={onStatusChange}>
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
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-amber-600" onClick={onEdit} title="Edit task">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-600" onClick={onDelete}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TASK_PRIORITY_COLORS[task.priority]}`}>
                {task.priority}
              </span>
              <span className="text-xs text-muted-foreground">{TASK_TYPE_LABELS[task.type] ?? task.type}</span>
              {task.communicationMethod && (
                <span className="text-xs text-muted-foreground">· {TASK_COMM_LABELS[task.communicationMethod] ?? task.communicationMethod}</span>
              )}
              {task.dueDate && (
                <span className={`text-xs flex items-center gap-0.5 ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                  <Clock className="h-3 w-3" />
                  {task.dueDate}{task.dueTime ? ` ${task.dueTime}` : ""}
                </span>
              )}
              {task.assignedToName && (
                <span className="text-xs text-muted-foreground">· {task.assignedToName}</span>
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
}

// ─── Lead Sales Tab ───────────────────────────────────────────────────────────
function LeadSalesTab({ leadId, lead, onRefresh }: { leadId: number; lead: any; onRefresh: () => void }) {
  const { data: notes, refetch: refetchNotes } = trpc.sales.notes.useQuery({ leadId });
  const [noteContent, setNoteContent] = useState("");

  const addNote = trpc.sales.addNote.useMutation({
    onSuccess: () => { toast.success("Note added"); refetchNotes(); setNoteContent(""); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const { options: languageOptions } = useReferenceData("language");
  const updateLead = trpc.leads.update.useMutation({
    onSuccess: () => onRefresh(),
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const interestColor: Record<string, string> = {
    hot: "bg-red-500",
    warm: "bg-orange-400",
    cold: "bg-blue-400",
  };

  return (
    <div className="space-y-5">
      {/* Interest Level */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Interest Level</p>
              <p className="text-xs text-muted-foreground mt-0.5">Track lead engagement</p>
            </div>
            <div className="flex gap-2">
              {(["cold", "warm", "hot"] as const).map(level => (
                <button
                  key={level}
                  onClick={() => updateLead.mutate({ id: leadId, data: { interestLevel: level } })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                    (lead as any).interestLevel === level
                      ? `${interestColor[level]} text-white shadow-sm`
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sales Notes */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Sales Notes</h4>
        <div className="flex gap-2">
          <Textarea
            value={noteContent}
            onChange={e => setNoteContent(e.target.value)}
            placeholder="Add a sales note..."
            rows={2}
            className="flex-1"
          />
          <Button
            size="sm"
            onClick={() => addNote.mutate({ leadId, content: noteContent })}
            disabled={!noteContent.trim() || addNote.isPending}
            className="self-end"
          >
            Add
          </Button>
        </div>
        {(notes ?? []).map((note: any) => (
          <div key={note.id} className="p-3 rounded-lg border bg-card text-sm">
            <p>{note.content}</p>
            <p className="text-xs text-muted-foreground mt-1.5">
              {note.authorName ?? "Staff"} · {format(new Date(note.createdAt), "MMM d, yyyy h:mm a")}
            </p>
          </div>
        ))}
        {(!notes || notes.length === 0) && (
          <p className="text-sm text-muted-foreground text-center py-4">No sales notes yet</p>
        )}
      </div>
    </div>
  );
}

//// ─── Treatment Plan Tab with Sub-Tabs ─────────────────────────────────────────────────
function TreatmentPlanTabWithSubTabs({ leadId, lead }: { leadId: number; lead: any }) {
  const [subTab, setSubTab] = useState<"medical-plan" | "collaboration" | "proposals">("medical-plan");

  const subTabs = [
    { id: "medical-plan" as const, label: "Medical Plan" },
    { id: "collaboration" as const, label: "Collaboration" },
    { id: "proposals" as const, label: "Proposals" },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="flex gap-1 border-b">
        {subTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              subTab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {subTab === "medical-plan" && <LeadTreatmentPlanTab leadId={leadId} />}
      {subTab === "collaboration" && (
        <Card>
          <CaseCommentsThread leadId={leadId} />
        </Card>
      )}
      {subTab === "proposals" && <TreatmentProposalsTab leadId={leadId} isReadOnly={false} patient={lead} />}
    </div>
  );
}

// ─── Lead Treatment Plan Tab ──────────────────────────────────────────────────────
function LeadTreatmentPlanTab({ leadId }: { leadId: number }) {
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const { data: plans, isLoading, refetch } = trpc.treatmentPlans.listByLead.useQuery({ leadId }, { staleTime: 0, refetchOnMount: "always" });

  if (isLoading) return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading treatment plans...
    </div>
  );

  if (selectedPlanId !== null) {
    return (
      <TreatmentPlanDetail
        planId={selectedPlanId}
        onBack={() => { setSelectedPlanId(null); refetch(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Treatment Plans</h3>
          <p className="text-xs text-muted-foreground mt-0.5">All treatment plans for this lead</p>
        </div>
      </div>

      {(!plans || plans.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <FileText className="h-10 w-10 opacity-30" />
          <p className="text-sm">No treatment plans yet.</p>
          <p className="text-xs">Use the “Request Treatment Plan” button above to assign a doctor.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(plans as any[]).map((plan: any) => (
            <div
              key={plan.id}
              className="border rounded-lg p-4 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setSelectedPlanId(plan.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{plan.title || `Treatment Plan #${plan.id}`}</p>
                  {plan.requestNotes && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{plan.requestNotes}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {fmtDate(plan.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={plan.status === "confirmed" ? "border-green-400 text-green-700" : plan.status === "sent" ? "border-blue-400 text-blue-700" : "border-amber-400 text-amber-700"}>
                    {plan.status === "confirmed" ? "Confirmed" : plan.status === "sent" ? "Sent" : "Draft"}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Treatment Plan Detail (shared between Lead and Patient) ─────────────────
export function TreatmentPlanDetail({ planId, onBack }: { planId: number; onBack: () => void }) {
  const { data, isLoading, refetch } = trpc.treatmentPlans.getById.useQuery({ planId }, { staleTime: 0, refetchOnMount: "always" });
  const { data: servicesList } = trpc.services.list.useQuery();

  const plan = data?.plan as any;
  const scenarios = data?.scenarios ?? [];

  const [clinicalSummary, setClinicalSummary] = useState("");
  const [qaAnswers, setQaAnswers] = useState<Array<{ question: string; askedBy: "female" | "male"; answer: string }>>([]);
  const [showAddScenario, setShowAddScenario] = useState(false);
  const [newScenarioTitle, setNewScenarioTitle] = useState("");
  const [newScenarioSummary, setNewScenarioSummary] = useState("");
  const [editingScenarioId, setEditingScenarioId] = useState<number | null>(null);
  const [editScenarioTitle, setEditScenarioTitle] = useState("");
  const [editScenarioSummary, setEditScenarioSummary] = useState("");
  const [editScenarioServices, setEditScenarioServices] = useState<Array<{ serviceId: number; serviceName: string; category: string; quantity: number }>>([]);
  const [addServiceId, setAddServiceId] = useState<string>("");
  const [addServiceQty, setAddServiceQty] = useState(1);

  useEffect(() => {
    if (plan) {
      setClinicalSummary(plan.clinicalSummary ?? "");
      try {
        const qa = typeof plan.qaAnswers === "string" ? JSON.parse(plan.qaAnswers) : plan.qaAnswers;
        if (Array.isArray(qa)) setQaAnswers(qa);
      } catch { /* ignore */ }
    }
  }, [plan?.id]);

  const upsertById = trpc.treatmentPlans.upsertById.useMutation({
    onSuccess: () => { toast.success("Treatment plan saved"); refetch(); },
    onError: (e: any) => toast.error(e.message || "Failed to save"),
  });
  const confirm = trpc.treatmentPlans.confirm.useMutation({
    onSuccess: () => { toast.success("Treatment plan confirmed"); refetch(); },
    onError: (e: any) => toast.error(e.message || "Failed to confirm"),
  });
  const revise = trpc.treatmentPlans.revise.useMutation({
    onSuccess: () => { toast.success("Reverted to draft"); refetch(); },
    onError: (e: any) => toast.error(e.message || "Failed to revert"),
  });
  const addScenario = trpc.treatmentPlans.addScenario.useMutation({
    onSuccess: () => { toast.success("Scenario added"); refetch(); setShowAddScenario(false); setNewScenarioTitle(""); setNewScenarioSummary(""); },
    onError: (e: any) => toast.error(e.message || "Failed to add scenario"),
  });
  const updateScenario = trpc.treatmentPlans.updateScenario.useMutation({
    onSuccess: () => { toast.success("Scenario updated"); refetch(); setEditingScenarioId(null); },
    onError: (e: any) => toast.error(e.message || "Failed to update"),
  });
  const deleteScenario = trpc.treatmentPlans.deleteScenario.useMutation({
    onSuccess: () => { toast.success("Scenario deleted"); refetch(); },
    onError: (e: any) => toast.error(e.message || "Failed to delete"),
  });

  const handleSavePlan = () => { upsertById.mutate({ planId, clinicalSummary, qaAnswers }); };
  const handleAddQA = () => setQaAnswers(prev => [...prev, { question: "", askedBy: "female", answer: "" }]);
  const handleRemoveQA = (idx: number) => setQaAnswers(prev => prev.filter((_, i) => i !== idx));
  const handleQAChange = (idx: number, field: "question" | "askedBy" | "answer", value: string) =>
    setQaAnswers(prev => prev.map((qa, i) => i === idx ? { ...qa, [field]: value } : qa));

  const openEditScenario = (s: any) => {
    setEditingScenarioId(s.id);
    setEditScenarioTitle(s.title ?? "");
    setEditScenarioSummary(s.summary ?? "");
    try { const svcs = typeof s.services === "string" ? JSON.parse(s.services) : s.services; setEditScenarioServices(Array.isArray(svcs) ? svcs : []); } catch { setEditScenarioServices([]); }
    setAddServiceId(""); setAddServiceQty(1);
  };

  const handleAddServiceToScenario = () => {
    if (!addServiceId) return;
    const svc = (servicesList ?? []).find((s: any) => String(s.id) === addServiceId);
    if (!svc) return;
    setEditScenarioServices(prev => [...prev, { serviceId: (svc as any).id, serviceName: (svc as any).name, category: (svc as any).category, quantity: addServiceQty }]);
    setAddServiceId(""); setAddServiceQty(1);
  };

  const handleSaveScenario = () => {
    if (!editingScenarioId) return;
    updateScenario.mutate({ id: editingScenarioId, title: editScenarioTitle, summary: editScenarioSummary, services: editScenarioServices });
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading treatment plan...
    </div>
  );

  if (!plan) return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
      <p className="text-sm">Treatment plan not found.</p>
      <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-xs h-7 px-2">
            <ArrowLeft className="h-3.5 w-3.5" />Back to Plans
          </Button>
          <div>
            <h3 className="text-base font-semibold">{plan.title || `Treatment Plan #${plan.id}`}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Internal clinical document — not shared with patient</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/api/treatment-plans/${plan.id}/pdf`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" />Download PDF
            </Button>
          </a>
          {plan.status === "draft" && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs border-green-400 text-green-700"
              onClick={() => confirm.mutate({ planId: plan.id })} disabled={confirm.isPending}>
              <CheckCircle2 className="h-3.5 w-3.5" />Confirm Plan
            </Button>
          )}
          {plan.status === "confirmed" && (
            <>
              <Badge variant="outline" className="border-green-400 text-green-700 text-xs">Confirmed</Badge>
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground"
                onClick={() => revise.mutate({ planId: plan.id })} disabled={revise.isPending}>
                Revert to Draft
              </Button>
            </>
          )}
        </div>
      </div>

      {plan.requestNotes && (
        <Card className="border-teal-200 bg-teal-50/30">
          <CardContent className="px-4 py-3">
            <p className="text-xs font-medium text-teal-700 mb-1">Request Notes from Staff</p>
            <p className="text-sm text-teal-900">{plan.requestNotes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold">Clinical Summary</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          <Textarea value={clinicalSummary} onChange={e => setClinicalSummary(e.target.value)}
            placeholder="Enter clinical summary, diagnosis, and key findings..."
            className="min-h-[100px] text-sm" disabled={plan.status === "confirmed"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Patient Q&amp;A</CardTitle>
          {plan.status !== "confirmed" && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={handleAddQA}>
              <Plus className="h-3 w-3" />Add Question
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {qaAnswers.length === 0 && <p className="text-xs text-muted-foreground">No Q&amp;A entries yet.</p>}
          {qaAnswers.map((qa, idx) => (
            <div key={idx} className="border rounded-lg p-3 space-y-2 bg-muted/20">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Select value={qa.askedBy} onValueChange={v => handleQAChange(idx, "askedBy", v)} disabled={plan.status === "confirmed"}>
                      <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="female">Female Patient</SelectItem>
                        <SelectItem value="male">Male Patient</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">asked:</span>
                  </div>
                  <Input value={qa.question} onChange={e => handleQAChange(idx, "question", e.target.value)}
                    placeholder="Patient's question..." className="text-xs h-8" disabled={plan.status === "confirmed"} />
                  <Textarea value={qa.answer} onChange={e => handleQAChange(idx, "answer", e.target.value)}
                    placeholder="Doctor's answer..." className="text-xs min-h-[60px]" disabled={plan.status === "confirmed"} />
                </div>
                {plan.status !== "confirmed" && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/60 hover:text-destructive shrink-0"
                    onClick={() => handleRemoveQA(idx)}>
                    <TrashIcon className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {plan.status !== "confirmed" && (
            <Button size="sm" className="gap-1.5 text-xs w-full" onClick={handleSavePlan} disabled={upsertById.isPending}>
              <Save className="h-3.5 w-3.5" />{upsertById.isPending ? "Saving..." : "Save Clinical Summary & Q&A"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Treatment Scenarios</CardTitle>
          {plan.status !== "confirmed" && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => setShowAddScenario(true)}>
              <Plus className="h-3 w-3" />Add Scenario
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {scenarios.length === 0 && <p className="text-xs text-muted-foreground">No scenarios yet.</p>}
          {(scenarios as any[]).map((s: any, idx: number) => {
            let svcs: any[] = [];
            try { svcs = typeof s.services === "string" ? JSON.parse(s.services) : (s.services ?? []); } catch { /* */ }
            return (
              <div key={s.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-purple-700">Scenario {idx + 1}: {s.title}</p>
                    {s.summary && <p className="text-xs text-muted-foreground mt-0.5">{s.summary}</p>}
                  </div>
                  {plan.status !== "confirmed" && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditScenario(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/60 hover:text-destructive"
                        onClick={() => deleteScenario.mutate({ id: s.id })}>
                        <TrashIcon className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                {svcs.length > 0 && (
                  <div className="rounded border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-muted/50"><th className="text-left px-2 py-1 font-medium">Service</th><th className="text-left px-2 py-1 font-medium">Category</th><th className="text-center px-2 py-1 font-medium">Qty</th></tr></thead>
                      <tbody>
                        {svcs.map((sv: any, si: number) => (
                          <tr key={si} className={si % 2 === 0 ? "" : "bg-muted/20"}>
                            <td className="px-2 py-1">{sv.serviceName ?? sv.name}</td>
                            <td className="px-2 py-1 text-muted-foreground capitalize">{(sv.category ?? "").replace(/_/g, " ")}</td>
                            <td className="px-2 py-1 text-center">{sv.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={showAddScenario} onOpenChange={setShowAddScenario}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Scenario</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Scenario Title *</Label>
              <Input value={newScenarioTitle} onChange={e => setNewScenarioTitle(e.target.value)} placeholder="e.g. IVF with ICSI" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Summary (optional)</Label>
              <Textarea value={newScenarioSummary} onChange={e => setNewScenarioSummary(e.target.value)} placeholder="Brief description..." className="mt-1 min-h-[60px] text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowAddScenario(false)}>Cancel</Button>
            <Button onClick={() => addScenario.mutate({ planId: plan.id, title: newScenarioTitle, summary: newScenarioSummary })}
              disabled={!newScenarioTitle.trim() || addScenario.isPending}>
              {addScenario.isPending ? "Adding..." : "Add Scenario"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingScenarioId} onOpenChange={open => !open && setEditingScenarioId(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Scenario</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Title *</Label>
              <Input value={editScenarioTitle} onChange={e => setEditScenarioTitle(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Summary</Label>
              <Textarea value={editScenarioSummary} onChange={e => setEditScenarioSummary(e.target.value)} className="mt-1 min-h-[60px] text-sm" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Services</Label>
              {editScenarioServices.length > 0 && (
                <div className="rounded border overflow-hidden mt-1 mb-2">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-muted/50"><th className="text-left px-2 py-1">Service</th><th className="text-center px-2 py-1">Qty</th><th className="px-2 py-1"></th></tr></thead>
                    <tbody>
                      {editScenarioServices.map((sv, si) => (
                        <tr key={si} className={si % 2 === 0 ? "" : "bg-muted/20"}>
                          <td className="px-2 py-1">{sv.serviceName}</td>
                          <td className="px-2 py-1 text-center">
                            <Input type="number" min={1} value={sv.quantity}
                              onChange={e => setEditScenarioServices(prev => prev.map((x, i) => i === si ? { ...x, quantity: parseInt(e.target.value) || 1 } : x))}
                              className="h-6 w-14 text-xs text-center" />
                          </td>
                          <td className="px-2 py-1 text-center">
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive/60"
                              onClick={() => setEditScenarioServices(prev => prev.filter((_, i) => i !== si))}>
                              <TrashIcon className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex gap-2 items-center mt-1">
                <Select value={addServiceId} onValueChange={setAddServiceId}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Select service..." /></SelectTrigger>
                  <SelectContent>
                    {(servicesList ?? []).filter((s: any) => s.status === "active").map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" min={1} value={addServiceQty} onChange={e => setAddServiceQty(parseInt(e.target.value) || 1)} className="h-8 w-16 text-xs text-center" />
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleAddServiceToScenario} disabled={!addServiceId}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditingScenarioId(null)}>Cancel</Button>
            <Button onClick={handleSaveScenario} disabled={!editScenarioTitle.trim() || updateScenario.isPending}>
              {updateScenario.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Partner Record Tab (Phase 2) ────────────────────────────────────────────
// Shows the partner lead's own medical_intake. Doctors see read-only view.
// No CRM/finance data is shown here — only the partner's Health Record.
function PartnerRecordTab({ partnerLeadId, partnerName, isDoctor }: {
  partnerLeadId: number;
  partnerName: string;
  isDoctor: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: partnerIntake, isLoading, refetch } = trpc.leads.getPartnerIntake.useQuery(
    { partnerLeadId },
    { staleTime: 0 }
  );

  const createPartnerIntake = trpc.leads.createPartnerIntake.useMutation({
    onSuccess: () => {
      toast.success("Partner health record created.");
      refetch();
      utils.leads.getPartnerIntake.invalidate({ partnerLeadId });
    },
    onError: (e) => toast.error(e.message || "Failed to create partner health record."),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Partner context banner */}
      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
        <Users className="h-4 w-4 text-blue-600 shrink-0" />
        <span className="text-sm text-blue-800">
          Viewing health record of linked partner: <strong>{partnerName}</strong>
        </span>
        <Link href={`/leads/${partnerLeadId}`} className="ml-auto">
          <Button variant="ghost" size="sm" className="text-blue-700 h-7 text-xs gap-1">
            <ChevronRight className="h-3.5 w-3.5" /> Open Partner Lead
          </Button>
        </Link>
      </div>

      {/* Restriction notice for doctors */}
      {isDoctor && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted border text-muted-foreground text-xs">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span>You are viewing the partner's health record in read-only mode. CRM and financial data are not accessible here.</span>
        </div>
      )}

      {/* If no intake exists yet, offer to create an empty one */}
      {!partnerIntake && !isDoctor && (
        <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground space-y-3">
          <AlertCircle className="h-10 w-10 opacity-30" />
          <p className="text-sm font-medium">No health record found for this partner.</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Creating a partner health record will create an empty intake only. No data will be copied or moved.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={createPartnerIntake.isPending}
            onClick={() => createPartnerIntake.mutate({ partnerLeadId })}
          >
            {createPartnerIntake.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Create Empty Health Record
          </Button>
        </div>
      )}

      {/* If no intake and doctor, just show empty state */}
      {!partnerIntake && isDoctor && (
        <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
          <AlertCircle className="h-10 w-10 opacity-30 mb-2" />
          <p className="text-sm">No health record found for this partner.</p>
        </div>
      )}

      {/* Show the partner's own MedicalIntakeForm */}
      {partnerIntake && (
        <MedicalIntakeErrorBoundary>
          <MedicalIntakeForm
            mode="lead"
            id={partnerLeadId}
            readOnly={isDoctor}
            onSave={() => {
              refetch();
              utils.leads.getPartnerIntake.invalidate({ partnerLeadId });
            }}
          />
        </MedicalIntakeErrorBoundary>
      )}
    </div>
  );
}
