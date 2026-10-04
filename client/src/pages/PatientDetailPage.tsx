import CalendarDateInput from "@/components/CalendarDateInput";
import { normaliseFileUrl } from "@/lib/fileUrl";
import { ServicePickerModal, type SelectedService, type ServicePickerResult } from "@/components/ServicePickerModal";
import { FileViewButton } from "@/components/FileViewButton";
import MedicalIntakeForm from "@/components/MedicalIntakeForm";
import { parseTrpcError } from "@/lib/errorUtils";
import { fmtDate, fmtDateAge, fmtDateLong, toDateInputValue } from "@/lib/dateFormat";
import { COUNTRY_NAMES, NATIONALITIES } from "@/lib/countries";
import { MultiSelect, DoctorMultiSelect, SearchableCombobox, LANGUAGES, CONTACT_METHODS, LanguageSelectWithPrimary } from "@/components/PatientFormComponents";
import { useReferenceData } from "@/hooks/useReferenceData";
import { useDraftForm, DraftBanner } from "@/hooks/useDraftForm";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import TreatmentCyclesTab from "@/components/TreatmentCyclesTab";
import TagManager from "@/components/TagManager";
import { TreatmentProposalsTab } from "@/components/TreatmentProposalsTab";
import { PatientCommsTab } from "@/components/PatientCommsTab";
import { PatientCRMTab } from "@/components/PatientCRMTab";
import { WhatsAppTab } from "@/components/WhatsAppTab";
import PatientExportPDF from "@/components/PatientExportPDF";
import CaseCommentsThread from "@/components/CaseCommentsThread";
import { AppointmentDetailsSendModal } from "@/components/AppointmentDetailsSendModal";
import { AppointmentDetailsSecondaryLayer } from "@/components/AppointmentDetailsSecondaryLayer";
import { AppointmentDetailsActionGroup, AppointmentDetailsIdentityRow, AppointmentDetailsTimingGroup } from "@/components/AppointmentDetailsPresentation";
import { AppointmentStatusConfirmation, type AppointmentStatusAction } from "@/components/AppointmentStatusConfirmation";
import { TreatmentPlanDetail } from "@/pages/LeadDetailPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { effectiveAppointmentEnd, endDateFromLocalTime, localTimeValue, resolveEffectiveExternalLocation, validateOptionalMeetingLink } from "@shared/appointmentScheduling";
import { appointmentCommunicationActionLabel } from "@shared/appointmentCommunication";
import { normalizeCallablePhone } from "@shared/phoneUtils";
import { calculateTaxIncludedLine, computeServiceTaxInvoice, previewServiceTaxInvoice, TAX_MODEL_VERSION } from "@shared/serviceTax";
import { computePaymentSettlement, isLegacySettlementPresentation } from "@shared/invoicePricing";
import { deriveInvoiceDualBalancePresentation } from "@shared/invoiceDualBalance";
import { deriveInvoiceLineDiscountPresentation } from "@shared/invoiceLineDiscount";
import { formatInvoiceLineDisplayName } from "@shared/invoiceLineDisplay";
import { computeServicePriceFxSnapshot, formatServicePriceFxDirectRate, getAgreedUnitSourceLineAmount, isAgreedUnitServicePriceEntry, isTaxIncludedServicePriceEntry, normalizeServicePriceDecimalInput, startServicePriceInvoiceCurrencyRepricing, startServicePriceRepricing, type ServicePriceEntry } from "@shared/servicePriceFx";
import { getDraftServicePriceEntryKind, getInvoiceLineTaxControlValue, isIncompleteTaxIncludedDraft, parseInvoiceLineTaxControlValue } from "@shared/invoiceLineDraft";
import { format } from "date-fns";
import {
  AlertCircle,
  ArrowLeft,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  Edit,
  FileText,
  FlaskConical,
  Loader2,
  Mic,
  Phone,
  Plus,
  Save,
  Tag,
  Trash2,
  User,
  Users,
  UserPlus,
  AlertTriangle,
  Link2,
  Link2Off,
  XCircle,
  MessageSquare,
  Star,
  ChevronDown,
  ClipboardList,
  Pencil,
  Languages,
  Globe,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  Download,
  RefreshCw,
  Wallet,
  ArrowDownLeft,
  Mail,
  Send,
  Paperclip,
  Stethoscope,
  Ban,
  Upload,
  X,
  Video,
} from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import { useIsMobile } from "@/hooks/useMobile";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";
import SavedTranslationsPanel from "@/components/SavedTranslationsPanel";
import { ExternalReportsTab } from "@/components/ExternalReportsTab";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";

type V4LinePricingMethod = "none" | "discount_percent" | "final_line_total" | "agreed_unit_price";
type V4LinePricingPreviewInput = {
  quantity: number;
  unitPrice: string;
  totalPrice?: string;
  linePricingMethod?: V4LinePricingMethod;
  lineDiscountPercent?: string;
};

function getV4LinePricingPreview(item: V4LinePricingPreviewInput) {
  const originalLineTotal = Math.round(item.quantity * (parseFloat(item.unitPrice || "0") || 0) * 100) / 100;
  const method = item.linePricingMethod ?? "none";
  const discountPercent = Math.min(100, Math.max(0, parseFloat(item.lineDiscountPercent || "0") || 0));
  const finalLineTotal = method === "discount_percent"
    ? Math.round(originalLineTotal * (1 - discountPercent / 100) * 100) / 100
    : method === "final_line_total" || method === "agreed_unit_price"
      ? Math.max(0, parseFloat(item.totalPrice || "0") || 0)
      : originalLineTotal;
  return { method, discountPercent, originalLineTotal, finalLineTotal };
}

/** Mobile tab bar: shows 4 primary tabs + a "More" dropdown for the rest */
function MobileTabBar({ isDoctor, activeTab, onTabChange, compact = false }: { isDoctor: boolean; activeTab: string; onTabChange: (v: string) => void; compact?: boolean }) {
  const activeValue = activeTab;

  const primaryTabs = isDoctor
    ? [
        { value: "medical", label: "Notes", icon: <FileText className="h-4 w-4" /> },
        { value: "intake", label: "Medical", icon: <Users className="h-4 w-4" /> },
        { value: "appointments", label: "Appts", icon: <Calendar className="h-4 w-4" /> },
        { value: "lab", label: "Lab", icon: <FlaskConical className="h-4 w-4" /> },
      ]
    : [
        { value: "intake", label: "Medical", icon: <Users className="h-4 w-4" /> },
        { value: "appointments", label: "Appts", icon: <Calendar className="h-4 w-4" /> },
        { value: "tasks", label: "Tasks", icon: <ClipboardList className="h-4 w-4" /> },
        { value: "finance", label: "Finance", icon: <DollarSign className="h-4 w-4" /> },
      ];

  const moreTabs = isDoctor
    ? [
        { value: "cycles", label: "Cycles" },
        { value: "treatment-plan", label: "Treatment Plan" },
        { value: "reports", label: "Reports" },
      ]
    : [
        { value: "docs", label: "Documents" },
        { value: "whatsapp", label: "WhatsApp" },
        { value: "crm", label: "CRM" },
        { value: "lab", label: "Lab & Radiology" },
        { value: "medical", label: "Consultation Notes" },
        { value: "cycles", label: "Cycles" },
        { value: "treatment-plan", label: "Treatment Plan" },
        { value: "reports", label: "Reports" },
      ];

  const isMoreActive = moreTabs.some(t => t.value === activeValue);

  return (
    <div className={`${compact ? "flex" : "sm:hidden flex"} min-w-0 items-center gap-1 border-b pb-0`}>
      {primaryTabs.map(tab => (
        <button
          key={tab.value}
          onClick={() => onTabChange(tab.value)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
            activeValue === tab.value
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground"
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
              isMoreActive
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground"
            }`}
          >
            <MoreVertical className="h-4 w-4" />
            More
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {moreTabs.map(tab => (
            <DropdownMenuItem
              key={tab.value}
              onClick={() => onTabChange(tab.value)}
              className={activeValue === tab.value ? "font-semibold text-primary" : ""}
            >
              {tab.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const patientId = parseInt(id ?? "0");
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  // Keep Patient Profile compact whenever the protected shell uses its
  // compact/mobile sidebar contract (<1024px), rather than at Tailwind `sm`.
  const isCompactPatientLayout = useIsMobile();
  const isAdmin = user?.role === "admin";
  const isDoctor = user?.role === "doctor";
  // Read ?tab= from URL to pre-select a tab (e.g. ?tab=treatment-plan)
  const urlTab = new URLSearchParams(location.split("?")[1] ?? "").get("tab");
  const defaultTabFromUrl = urlTab ?? (isDoctor ? "medical" : "intake");
  const [activeTab, setActiveTab] = useState(defaultTabFromUrl);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLinkPartnerDialog, setShowLinkPartnerDialog] = useState(false);
  const [showMrnEditDialog, setShowMrnEditDialog] = useState(false);
  const [mrnEditValue, setMrnEditValue] = useState("");
  const [showExportPDF, setShowExportPDF] = useState(false);
  const [crmSubTab, setCrmSubTab] = useState<"lead-profile" | "crm-notes">("lead-profile");
  const [showEditPatient, setShowEditPatient] = useState(false);
  const [showPatientEditDiscardConfirm, setShowPatientEditDiscardConfirm] = useState(false);
  const [showRequestDoctorDialog, setShowRequestDoctorDialog] = useState(false);
  const [requestDoctorId, setRequestDoctorId] = useState<string>("");
  const [requestDoctorNotes, setRequestDoctorNotes] = useState("");
  const [requestPlanTitle, setRequestPlanTitle] = useState("");
  const { form: editPatientForm, setForm: setEditPatientForm, hasDraft: hasPatientDraft, clearDraft: clearPatientDraft, initFromServer: initPatientFromServer } = useDraftForm<any>({
    key: `patient_edit_draft_${patientId}`,
    initialData: {},
  });
  // Snapshot of form values captured at Edit-open time — used for accurate dirty-state detection.
  // isDirtyPatientEdit compares currentForm vs this snapshot, not just "any non-empty value".
  const patientEditSnapshotRef = useRef<Record<string, any> | null>(null);
  const [pwForm, setPwForm] = useState({ newPassword: "", confirmPassword: "", showNew: false, showConfirm: false });
  const { data: allDoctors, isLoading: allDoctorsLoading } = trpc.doctors.list.useQuery();
  const requestDoctorReview = trpc.treatmentPlans.requestPlan.useMutation({
    onSuccess: () => { toast.success("Treatment plan requested successfully"); setShowRequestDoctorDialog(false); setRequestDoctorId(""); setRequestDoctorNotes(""); setRequestPlanTitle(""); },
    onError: (e) => toast.error(e.message || "Failed to request treatment plan"),
  });
  const { options: languageOptions } = useReferenceData("language");
  const { data: patientDoctorsList, refetch: refetchPatientDoctors } = trpc.patients.getDoctors.useQuery(
    { patientId },
    { enabled: !!patientId }
  );
  const setPatientDoctorsMutation = trpc.patients.setDoctors.useMutation({
    onSuccess: () => { refetchPatientDoctors(); },
    onError: (e: any) => toast.error(e.message || "Failed to update doctors"),
  });

  const adminResetPassword = trpc.users.adminResetPassword.useMutation({
    onSuccess: () => { toast.success("Password updated"); setPwForm({ newPassword: "", confirmPassword: "", showNew: false, showConfirm: false }); },
    onError: (e) => toast.error(e.message || "Failed to update password"),
  });

  const { data: patient, isLoading, refetch: refetchPatient } = trpc.patients.get.useQuery({ id: patientId });
  const patientPhoneHref = normalizeCallablePhone(patient?.phone);
  const { data: outstandingBalance } = trpc.patients.outstandingBalance.useQuery(
    { patientId },
    { enabled: !!(isAdmin || user?.role === "staff") }
  );
  // Get upcoming appointments for next appt info card
  const { data: patientAppointments } = trpc.appointments.list.useQuery(
    { patientId },
    { enabled: !!(isAdmin || user?.role === "staff") }
  );
  // Get treatment cycles for cycle status info card
  const { data: patientCycles } = trpc.treatmentCycles.list.useQuery(
    { patientId },
    { enabled: !!(isAdmin || user?.role === "staff") }
  );
  const deletePatientMutation = trpc.patients.delete.useMutation({
    onSuccess: () => { toast.success("Patient record deleted"); setLocation("/patients"); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const { data: partner, refetch: refetchPartner } = trpc.patients.getPartner.useQuery(
    { patientId },
    { enabled: !isLoading && !!patient }
  );

  const unlinkPartner = trpc.patients.unlinkPartner.useMutation({
    onSuccess: () => { toast.success("Partner unlinked"); refetchPatient(); refetchPartner(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const updateMRN = trpc.patients.updateMRN.useMutation({
    onSuccess: () => { toast.success("MRN updated"); refetchPatient(); setShowMrnEditDialog(false); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const utils = trpc.useUtils();

  // Fix 3 (race-condition fix): Separate routing decision from data-load state.
  // hasLinkedLeadId: based on patient.socialLeadId alone — used for ALL routing/save decisions.
  // isLinkedLeadLoaded: true only when linkedLead data has resolved — used for form init only.
  // isLinkedToLead (legacy alias): kept for display-only uses; do NOT use for save routing.
  const linkedLeadId = patient?.socialLeadId ? Number(patient.socialLeadId) : null;
  const hasLinkedLeadId = !!linkedLeadId; // routing truth — never depends on fetch state
  const { data: linkedLead, isLoading: isLinkedLeadLoading, refetch: refetchLinkedLead } = trpc.leads.get.useQuery(
    { id: linkedLeadId! },
    { enabled: !!linkedLeadId, staleTime: 0 }
  );
  const isLinkedLeadLoaded = hasLinkedLeadId && !!linkedLead; // form-init truth
  const isLinkedToLead = isLinkedLeadLoaded; // display alias (unchanged semantics for non-routing uses)

  const updateLinkedLeadPrefs = trpc.leads.update.useMutation({
    // onSuccess: broad invalidation so Lead view + Patient view both reflect the saved preferences
    // without requiring a manual browser refresh. The caller (handleSavePatient) still handles
    // the success toast and dialog close after BOTH mutations succeed.
    onSuccess: async () => {
      // Invalidate Lead queries so Lead detail page reflects new preferences immediately
      await utils.leads.get.invalidate({ id: linkedLeadId! });
      await utils.leads.list.invalidate();
      // Invalidate Patient queries so Patient list/detail also reflects the change
      await utils.patients.get.invalidate({ id: patientId });
      await utils.patients.list.invalidate();
    },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const updatePatientInfo = trpc.patients.update.useMutation({
    onSuccess: async () => {
      toast.success("Patient updated");
      clearPatientDraft();
      patientEditSnapshotRef.current = null; // clear snapshot so dialog closes cleanly after save
      refetchPatient();
      setShowEditPatient(false);
      // Broad invalidation: Lead + Patient list/detail so both sides reflect identity changes
      await utils.leads.list.invalidate();
      await utils.leads.get.invalidate();
      await utils.patients.list.invalidate();
      if (hasLinkedLeadId) await refetchLinkedLead();
    },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const CRM_STATUSES = ["inquiry", "lead", "qualified", "proposal_sent"];
  const quickUpdateStatus = trpc.patients.update.useMutation({
    onSuccess: (_data, variables) => {
      const newStatus = (variables.data as any)?.status;
      toast.success("Status updated");
      if (newStatus && CRM_STATUSES.includes(newStatus)) {
        toast.info("Patient moved back to CRM pipeline");
        setLocation("/leads");
      } else {
        refetchPatient();
      }
    },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const todayStr = new Date().toISOString().split("T")[0];
  const openEditPatient = async () => {
    if (!patient) return;
    // Q3 fix: Force refetch of canonical data before opening the edit form.
    // Do NOT initialize from stale React query state — use the returned fresh data directly.
    // This ensures edit mode always shows the latest server values, not cached props.
    let freshLead: typeof linkedLead | undefined = undefined;
    if (hasLinkedLeadId) {
      try {
        const result = await refetchLinkedLead();
        freshLead = result.data;
      } catch {
        // If refetch fails, fall back to cached linkedLead (better than blocking edit)
        freshLead = linkedLead;
      }
    }
    // Use freshLead (returned from refetch) as prefSource, not the potentially stale linkedLead state
    const prefSource = (hasLinkedLeadId && freshLead) ? freshLead : patient;
    const serverValues = {
      firstName: patient.firstName ?? "",
      middleName: (patient as any).middleName ?? "",
      lastName: patient.lastName ?? "",
      gender: patient.gender ?? "",
      dateOfBirth: toDateInputValue(patient.dateOfBirth),
      phone: patient.phone ?? "",
      email: patient.email ?? "",
      address: patient.address ?? "",
      bloodType: patient.bloodType ?? "",
      allergies: patient.allergies ?? "",
      nationality: patient.nationality ?? "",
      countryOfResidency: (patient as any).countryOfResidency ?? "",
      preferredLanguages: Array.isArray((prefSource as any)?.preferredLanguages)
        ? (prefSource as any).preferredLanguages
        : ((prefSource as any)?.preferredLanguages ? [(prefSource as any).preferredLanguages] : []),
      primaryLanguage: (prefSource as any)?.primaryLanguage ?? null,
      preferredContactMethods: Array.isArray((prefSource as any)?.preferredContactMethods)
        ? (prefSource as any).preferredContactMethods
        : ((prefSource as any)?.preferredContactMethods ? [(prefSource as any).preferredContactMethods] : []),
      emergencyContactName: patient.emergencyContactName ?? "",
      emergencyContactPhone: patient.emergencyContactPhone ?? "",
      insuranceProvider: patient.insuranceProvider ?? "",
      insuranceNumber: patient.insuranceNumber ?? "",
      status: patient.status ?? "active_patient",
      patientType: (patient as any).patientType ?? "international",
      doctorIds: (patientDoctorsList ?? []).map((d: any) => d.doctorId),
    };
    initPatientFromServer(serverValues);
    // Capture snapshot at edit-open time for accurate dirty-state detection.
    // isDirtyPatientEdit compares editPatientForm against this snapshot.
    patientEditSnapshotRef.current = serverValues;
    setShowEditPatient(true);
  };

  // Dirty-state guard for Patient Edit dialog close.
  // Compares current form values against the snapshot captured at Edit-open time.
  // Returns false if the dialog was just opened without any user changes.
  const isDirtyPatientEdit = (() => {
    const snap = patientEditSnapshotRef.current;
    if (!snap) return false; // dialog not open yet
    const normalize = (v: any): string => {
      if (v === null || v === undefined) return "";
      if (Array.isArray(v)) return JSON.stringify([...v].sort());
      return String(v);
    };
    return Object.keys(snap).some((k) => normalize(editPatientForm[k]) !== normalize(snap[k]));
  })();
  const doClosePatientEdit = (force = false) => {
    if (!force && isDirtyPatientEdit) {
      setShowPatientEditDiscardConfirm(true);
      return;
    }
    clearPatientDraft();
    patientEditSnapshotRef.current = null; // clear snapshot so isDirtyPatientEdit returns false when dialog is closed
    setShowEditPatient(false);
    setShowPatientEditDiscardConfirm(false);
  };

  // Combined saving state: covers all three mutations that fire during Patient Edit save
  const isSavingPatient = updateLinkedLeadPrefs.isPending || updatePatientInfo.isPending || setPatientDoctorsMutation.isPending;

  const handleSavePatient = () => {
    // Gender required validation
    if (!editPatientForm.gender) {
      toast.error("Gender is required.");
      return;
    }
    // DOB validation
    if (editPatientForm.dateOfBirth) {
      const dob = new Date(editPatientForm.dateOfBirth);
      const today = new Date(); today.setHours(0,0,0,0);
      if (dob > today) { toast.error("Date of birth cannot be in the future"); return; }
      if (dob.getFullYear() < 1900) { toast.error("Date of birth must be 1900 or later"); return; }
    }
    // Fix 3 (race-condition fix): Use hasLinkedLeadId for routing — NOT isLinkedToLead.
    // hasLinkedLeadId is based on patient.socialLeadId alone and never depends on fetch state.
    // This prevents the race condition where isLinkedToLead was false because linkedLead
    // had not yet loaded when the user opened the edit modal.
    if (hasLinkedLeadId && linkedLeadId) {
      // Route 3 pref fields to Lead. If this fails, show error and do NOT proceed to patients.update.
      updateLinkedLeadPrefs.mutate(
        {
          id: linkedLeadId,
          data: {
            // Language clear-to-empty fix:
            // Array.isArray([]) is true, so an empty array passes through as [] (intentional clear).
            // undefined (field not initialized) still means "do not update".
            // Guarantee: if preferredLanguages is empty, primaryLanguage must also be null.
            preferredLanguages: Array.isArray(editPatientForm.preferredLanguages) ? editPatientForm.preferredLanguages : undefined,
            primaryLanguage: (Array.isArray(editPatientForm.preferredLanguages) && editPatientForm.preferredLanguages.length === 0)
              ? null  // Guarantee: empty languages → clear primary language
              : (editPatientForm.primaryLanguage || null),
            // CM-1 fix: Array.isArray([]) is true, so an empty array passes through as [] (intentional clear).
            // undefined (field not initialized) still means "do not update".
            preferredContactMethods: Array.isArray(editPatientForm.preferredContactMethods) ? editPatientForm.preferredContactMethods : undefined,
          },
        },
        {
          onError: () => {
            // leads.update failed — do NOT show success, do NOT fall back to patients.update.
            // The onError on the mutation definition already shows the toast.
            return;
          },
          onSuccess: async () => {
            // Lead pref fields saved — now save the rest to patients.update.
            await utils.leads.get.invalidate({ id: linkedLeadId! });
            await utils.leads.list.invalidate();
            await refetchLinkedLead();
            updatePatientInfo.mutate({
              id: patientId,
              data: {
                firstName: editPatientForm.firstName || undefined,
                middleName: editPatientForm.middleName || undefined,
                lastName: editPatientForm.lastName || undefined,
                gender: (editPatientForm.gender || undefined) as any,
                dateOfBirth: editPatientForm.dateOfBirth ? new Date(editPatientForm.dateOfBirth) : undefined,
                phone: editPatientForm.phone || undefined,
                email: editPatientForm.email || undefined,
                address: editPatientForm.address || undefined,
                bloodType: editPatientForm.bloodType || undefined,
                allergies: editPatientForm.allergies || undefined,
                nationality: editPatientForm.nationality || undefined,
                countryOfResidency: editPatientForm.countryOfResidency || undefined,
                // Fix B: 3 pref fields are Lead-owned when linked — do NOT write to Patient.
                emergencyContactName: editPatientForm.emergencyContactName || undefined,
                emergencyContactPhone: editPatientForm.emergencyContactPhone || undefined,
                insuranceProvider: editPatientForm.insuranceProvider || undefined,
                insuranceNumber: editPatientForm.insuranceNumber || undefined,
                status: (editPatientForm.status || undefined) as any,
                patientType: (editPatientForm.patientType || undefined) as "local" | "international" | undefined,
              },
            });
            if (editPatientForm.doctorIds !== undefined) {
              setPatientDoctorsMutation.mutate({ patientId, doctorIds: editPatientForm.doctorIds });
            }
          },
        }
      );
      return; // Early return — the rest is handled in the onSuccess callback above.
    }
    updatePatientInfo.mutate({
      id: patientId,
      data: {
        firstName: editPatientForm.firstName || undefined,
        middleName: editPatientForm.middleName || undefined,
        lastName: editPatientForm.lastName || undefined,
        gender: (editPatientForm.gender || undefined) as any,
        dateOfBirth: editPatientForm.dateOfBirth ? new Date(editPatientForm.dateOfBirth) : undefined,
        phone: editPatientForm.phone || undefined,
        email: editPatientForm.email || undefined,
        address: editPatientForm.address || undefined,
        bloodType: editPatientForm.bloodType || undefined,
        allergies: editPatientForm.allergies || undefined,
        nationality: editPatientForm.nationality || undefined,
        countryOfResidency: editPatientForm.countryOfResidency || undefined,
        // Fix B (unlinked path only — linked path handled above via leads.update):
        // For unlinked patients, write the 3 pref fields normally to patients.update.
        // Language clear-to-empty fix: Array.isArray([]) passes [] through as intentional clear.
        // Guarantee: empty languages → primaryLanguage must also be null.
        preferredLanguages: (Array.isArray(editPatientForm.preferredLanguages) ? editPatientForm.preferredLanguages : undefined) as any,
        primaryLanguage: (Array.isArray(editPatientForm.preferredLanguages) && editPatientForm.preferredLanguages.length === 0)
          ? null  // Guarantee: empty languages → clear primary language
          : (editPatientForm.primaryLanguage || null),
        // CM-2 fix: Array.isArray([]) passes [] through as intentional clear (same as CM-1).
        preferredContactMethods: (Array.isArray(editPatientForm.preferredContactMethods) ? editPatientForm.preferredContactMethods : undefined) as any,
        emergencyContactName: editPatientForm.emergencyContactName || undefined,
        emergencyContactPhone: editPatientForm.emergencyContactPhone || undefined,
        insuranceProvider: editPatientForm.insuranceProvider || undefined,
        insuranceNumber: editPatientForm.insuranceNumber || undefined,
        status: (editPatientForm.status || undefined) as any,
        patientType: (editPatientForm.patientType || undefined) as "local" | "international" | undefined,
      },
    });
    // Save doctor assignments separately (unlinked path only — linked path handles this in onSuccess above)
    if (editPatientForm.doctorIds !== undefined) {
      setPatientDoctorsMutation.mutate({ patientId, doctorIds: editPatientForm.doctorIds });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Patient not found</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/patients")}>Back to Patients</Button>
      </div>
    );
  }

  const interestColor: Record<string, string> = {
    hot: "bg-red-100 text-red-700 border-red-200",
    warm: "bg-orange-100 text-orange-700 border-orange-200",
    cold: "bg-blue-100 text-blue-700 border-blue-200",
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="space-y-4">
        {/* Row 1: back button + action buttons */}
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/patients")} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>

          {/* Desktop: hierarchical actions */}
          <div className={`${isCompactPatientLayout ? "hidden" : "flex"} items-center gap-1.5 shrink-0`}>
            {/* Primary action */}
            {!isDoctor && (
              <Button size="sm" className="gap-1.5 bg-teal-700 hover:bg-teal-800 text-white"
                onClick={() => setShowRequestDoctorDialog(true)}>
                <Stethoscope className="h-3.5 w-3.5" />Request Doctor Review
              </Button>
            )}
            {/* Secondary actions */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={() => setLocation(`/inbox?new=1&recordType=patient&recordId=${patient.id}`)}
            >
              <MessageSquare className="h-3.5 w-3.5" />WhatsApp
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={openEditPatient}
              disabled={hasLinkedLeadId && isLinkedLeadLoading}
              title={hasLinkedLeadId && isLinkedLeadLoading ? "Loading linked Lead data…" : undefined}
            >
              {hasLinkedLeadId && isLinkedLeadLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Edit className="h-3.5 w-3.5" />}
              Edit
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowExportPDF(true)}>
              <FileText className="h-3.5 w-3.5" />Export PDF
            </Button>
            {/* More menu: destructive actions */}
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 px-2">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Advanced</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600 focus:bg-red-50"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />Delete Patient
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Mobile: More menu */}
          <div className={isCompactPatientLayout ? "block shrink-0" : "hidden"}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setLocation(`/inbox?new=1&recordType=patient&recordId=${patient.id}`)}>
                  <MessageSquare className="h-4 w-4 mr-2" />Start / open WhatsApp
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowExportPDF(true)}>
                  <FileText className="h-4 w-4 mr-2" />Export PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={openEditPatient}
                  disabled={hasLinkedLeadId && isLinkedLeadLoading}
                >
                  {hasLinkedLeadId && isLinkedLeadLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Edit className="h-4 w-4 mr-2" />}
                  {hasLinkedLeadId && isLinkedLeadLoading ? "Loading…" : "Edit Patient"}
                </DropdownMenuItem>
                {!isDoctor && (
                  <DropdownMenuItem onClick={() => setShowRequestDoctorDialog(true)}>
                    <Stethoscope className="h-4 w-4 mr-2" />Request Doctor Review
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />Delete Patient
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {/* Patient identity: avatar + name + badges */}
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center shrink-0 text-white font-bold text-lg select-none"
            style={{background: "linear-gradient(135deg, #1E0566 0%, #E3B2B0 100%)"}}>
            {((patient.firstName?.[0] ?? "") + (patient.lastName?.[0] ?? "")).toUpperCase() || "?"}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            {/* Name + MRN row */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 className="text-xl md:text-2xl font-bold leading-tight break-words">{patient.firstName} {patient.lastName}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">{patient.mrn}</span>
                  {isAdmin && (
                    <button
                      onClick={() => { setMrnEditValue(patient.mrn ?? ""); setShowMrnEditDialog(true); }}
                      className="text-[10px] text-muted-foreground hover:text-primary underline"
                    >Edit MRN</button>
                  )}
                </div>
              </div>
            </div>
            {/* Status + type badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {patient.interestLevel && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${interestColor[patient.interestLevel] ?? ""}`}>
                  {patient.interestLevel.toUpperCase()}
                </span>
              )}
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                patient.status === "active_patient" ? "bg-emerald-100 text-emerald-700" :
                patient.status === "inquiry" || patient.status === "lead" ? "bg-blue-100 text-blue-700" :
                "bg-gray-100 text-gray-600"
              }`}>
                {patient.status?.replace(/_/g, " ")}
              </span>
              {(patient as any).patientType && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded border ${
                  (patient as any).patientType === "local" ? "bg-teal-50 text-teal-700 border-teal-200" : "bg-purple-50 text-purple-700 border-purple-200"
                }`}>
                  {(patient as any).patientType === "local" ? "🇹🇷 Local" : "🌍 International"}
                </span>
              )}
              {/* Change Status — clearly separated */}
              {!isDoctor && (
                <Select
                  value={patient.status}
                  onValueChange={(s) => quickUpdateStatus.mutate({ id: patientId, data: { status: s as any } })}
                >
                  <SelectTrigger className="h-6 text-[11px] px-2 py-0 border border-dashed border-muted-foreground/50 rounded bg-background w-auto gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                    <ChevronDown className="h-3 w-3" />
                    <span>Change Status</span>
                  </SelectTrigger>
                  <SelectContent>
                    {(["inquiry","lead","qualified","proposal_sent","active_patient","inactive","archived"] as const).map(s => (
                      <SelectItem key={s} value={s} className="text-xs">
                        {s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {/* Demographics row */}
            <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
              {patient.gender && <span className="capitalize">{patient.gender}</span>}
              {patient.dateOfBirth && <span>{fmtDateAge(patient.dateOfBirth)}</span>}
              {patient.bloodType && <span className="font-medium text-rose-600">{patient.bloodType}</span>}
              {patient.phone && (patientPhoneHref ? (
                <a
                  href={`tel:${patientPhoneHref}`}
                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                  aria-label={`Call ${patient.phone}`}
                >
                  <Phone className="h-3 w-3" />{patient.phone}
                </a>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap"><Phone className="h-3 w-3" />{patient.phone}</span>
              ))}
              {patient.email && <span className="break-all">{patient.email}</span>}
            </div>
            {patient.allergies && (
              <div className="flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="text-xs text-amber-700 font-medium">Allergies: {patient.allergies}</span>
              </div>
            )}
            {/* Identity incomplete banner */}
            {(!patient.gender || !patient.dateOfBirth) && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 mt-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span className="text-xs text-amber-800 font-medium">
                  Identity incomplete: {[!patient.gender && "gender", !patient.dateOfBirth && "date of birth"].filter(Boolean).join(" and ")} is missing. Please complete the Patient profile.
                </span>
                <button
                  className="ml-auto text-xs text-amber-700 underline hover:text-amber-900 shrink-0"
                  onClick={openEditPatient}
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Info cards — clickable shortcuts to tabs */}
        {(isAdmin || user?.role === "staff") && (
          <div className={`grid grid-cols-2 gap-3 ${isCompactPatientLayout ? "" : "md:grid-cols-4"}`}>
            {/* Treatment Status → cycles tab */}
            <button
              onClick={() => setActiveTab("cycles")}
              className="rounded-xl p-3 border text-left cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group"
              style={{background:"rgba(30,5,102,0.04)"}}
            >
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide group-hover:text-primary/70 transition-colors">Treatment Status</p>
              <p className="text-sm font-semibold mt-1 text-foreground capitalize">
                {patient.status?.replace(/_/g, " ") ?? "—"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {(() => {
                  const activeCycle = patientCycles?.find((c: any) => !["completed","cancelled"].includes(c.status));
                  if (!activeCycle) return patientCycles && patientCycles.length > 0 ? `${patientCycles.length} cycle(s)` : "No active cycle";
                  let types: string[] = [];
                  try { types = JSON.parse(activeCycle.cycleType); } catch { types = [activeCycle.cycleType]; }
                  return `${types.join(" · ")} · ${activeCycle.status}`;
                })()}
              </p>
            </button>
            {/* Outstanding → finance tab */}
            <button
              onClick={() => setActiveTab("finance")}
              className="rounded-xl p-3 border text-left cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group"
              style={{background:"rgba(227,178,176,0.12)"}}
            >
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide group-hover:text-primary/70 transition-colors">Outstanding</p>
              {(() => {
                const byCur = outstandingBalance as Record<string, number> | undefined;
                const entries = byCur ? Object.entries(byCur).filter(([, v]) => v > 0.001) : [];
                const hasBalance = entries.length > 0;
                return (
                  <>
                    {entries.length === 0 ? (
                      <p className="text-sm font-semibold mt-1 text-emerald-600">—</p>
                    ) : entries.map(([cur, amt]) => (
                      <p key={cur} className="text-sm font-semibold mt-1 text-red-600">
                        {cur} {amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    ))}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {hasBalance ? "Payment due" : "No balance due"}
                    </p>
                  </>
                );
              })()}
            </button>
            {/* Next Appointment → appointments tab */}
            <button
              onClick={() => setActiveTab("appointments")}
              className="rounded-xl p-3 border text-left cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group"
              style={{background:"rgba(229,186,153,0.12)"}}
            >
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide group-hover:text-primary/70 transition-colors">Next Appointment</p>
              {(() => {
                const now = new Date();
                const next = patientAppointments?.filter((a: any) => new Date(a.appointmentDate) > now && !["cancelled","completed"].includes(a.status))
                  .sort((a: any, b: any) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime())[0];
                return next ? (
                  <>
                    <p className="text-sm font-semibold mt-1 text-foreground">{format(new Date(next.appointmentDate), "MMM d")}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(next.appointmentDate), "h:mm a")}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold mt-1 text-muted-foreground">None</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">No upcoming</p>
                  </>
                );
              })()}
            </button>
            {/* Cycle Status → cycles tab */}
            <button
              onClick={() => setActiveTab("cycles")}
              className="rounded-xl p-3 border text-left cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group"
              style={{background:"rgba(26,20,100,0.05)"}}
            >
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide group-hover:text-primary/70 transition-colors">Cycle Status</p>
              {(() => {
                const activeCycle = patientCycles?.find((c: any) => !["completed","cancelled"].includes(c.status));
                const cycleStatusColors: Record<string, string> = {
                  planned: "text-blue-600", stimulation: "text-amber-600",
                  retrieval: "text-purple-600", transfer: "text-indigo-600",
                  completed: "text-emerald-600", cancelled: "text-red-600",
                };
                return activeCycle ? (
                  <>
                    <p className={`text-sm font-semibold mt-1 capitalize ${cycleStatusColors[activeCycle.status] ?? "text-foreground"}`}>
                      {activeCycle.status}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{(() => { try { return JSON.parse(activeCycle.cycleType).join(" · "); } catch { return activeCycle.cycleType; } })()}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold mt-1 text-muted-foreground">No Cycle</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{patientCycles?.length ?? 0} total</p>
                  </>
                );
              })()}
            </button>
          </div>
        )}
        {isDoctor && outstandingBalance && typeof outstandingBalance === "object" && Object.values(outstandingBalance as Record<string,number>).some(v => v > 0.001) && (
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-red-500 shrink-0" />
            <span className="text-xs text-red-700 font-semibold">Outstanding balance — payment due</span>
          </div>
        )}
      </div>
            {/* Patient Export PDF */}
      {showExportPDF && (
        <PatientExportPDF patientId={patientId} open={showExportPDF} onClose={() => setShowExportPDF(false)} />
      )}

      {/* Edit Patient Info Dialog */}
      {showEditPatient && (
        <Dialog open onOpenChange={(open) => { if (!open) doClosePatientEdit(); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit Patient Information</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <DraftBanner
                hasDraft={hasPatientDraft}
                onDiscard={() => { clearPatientDraft(); initPatientFromServer({ firstName: patient?.firstName ?? "", lastName: patient?.lastName ?? "" }); }}
                onResume={() => {}}
              />
              {/* Name */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">First Name</Label>
                  <Input value={editPatientForm.firstName} onChange={e => setEditPatientForm((f: any) => ({ ...f, firstName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Middle Name</Label>
                  <Input value={editPatientForm.middleName ?? ""} onChange={e => setEditPatientForm((f: any) => ({ ...f, middleName: e.target.value }))} placeholder="Optional" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Last Name</Label>
                  <Input value={editPatientForm.lastName} onChange={e => setEditPatientForm((f: any) => ({ ...f, lastName: e.target.value }))} />
                </div>
              </div>
              {/* Gender + DOB */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Gender <span className="text-destructive">*</span></Label>
                  <Select value={editPatientForm.gender || ""} onValueChange={v => setEditPatientForm((f: any) => ({ ...f, gender: v }))}>
                    <SelectTrigger className={!editPatientForm.gender ? "border-destructive" : ""}><SelectValue placeholder="Select gender (required)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                  {!editPatientForm.gender && <p className="text-xs text-destructive">Gender is required.</p>}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Date of Birth</Label>
                  <CalendarDateInput
                    value={editPatientForm.dateOfBirth}
                    onChange={v => setEditPatientForm((f: any) => ({ ...f, dateOfBirth: v }))}
                    max={todayStr}
                    min="1900-01-01"
                    clearable
                    aria-label="Date of Birth"
                  />
                </div>
              </div>
              {/* Phone + Email */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input value={editPatientForm.phone} onChange={e => setEditPatientForm((f: any) => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={editPatientForm.email} onChange={e => setEditPatientForm((f: any) => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              {/* Address */}
              <div className="space-y-1">
                <Label className="text-xs">Address</Label>
                <Input value={editPatientForm.address} onChange={e => setEditPatientForm((f: any) => ({ ...f, address: e.target.value }))} />
              </div>
              {/* Blood Type + Nationality */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Blood Type</Label>
                  <Select value={editPatientForm.bloodType || "_none"} onValueChange={v => setEditPatientForm((f: any) => ({ ...f, bloodType: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Not specified —</SelectItem>
                      {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(bt => <SelectItem key={bt} value={bt}>{bt}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nationality</Label>
                  <SearchableCombobox
                    value={editPatientForm.nationality}
                    onChange={v => setEditPatientForm((f: any) => ({ ...f, nationality: v }))}
                    options={NATIONALITIES}
                    placeholder="Select nationality…"
                  />
                </div>
              </div>
              {/* Country of Residency */}
              <div className="space-y-1">
                <Label className="text-xs">Country of Residency</Label>
                <SearchableCombobox
                  value={editPatientForm.countryOfResidency}
                  onChange={v => setEditPatientForm((f: any) => ({ ...f, countryOfResidency: v }))}
                  options={COUNTRY_NAMES}
                  placeholder="Select country of residency…"
                />
              </div>
              {/* Allergies */}
              <div className="space-y-1">
                <Label className="text-xs">Allergies</Label>
                <Input value={editPatientForm.allergies} onChange={e => setEditPatientForm((f: any) => ({ ...f, allergies: e.target.value }))} placeholder="e.g. Penicillin, Latex" />
              </div>
              {/* Languages with primary designation (REQ-5) */}
              <div className="space-y-1">
                <Label className="text-xs">Languages <span className="text-muted-foreground text-[10px]">(select all, then mark primary)</span></Label>
                <LanguageSelectWithPrimary
                  languages={editPatientForm.preferredLanguages ?? []}
                  primaryLanguage={editPatientForm.primaryLanguage ?? null}
                  onLanguagesChange={v => setEditPatientForm((f: any) => ({ ...f, preferredLanguages: v }))}
                  onPrimaryChange={v => setEditPatientForm((f: any) => ({ ...f, primaryLanguage: v }))}
                  options={languageOptions.length > 0 ? languageOptions : undefined}
                />
              </div>
              {/* Preferred Contact Methods (multi-select) */}
              <div className="space-y-1">
                <Label className="text-xs">Preferred Contact Methods</Label>
                <MultiSelect
                  options={CONTACT_METHODS}
                  value={editPatientForm.preferredContactMethods ?? []}
                  onChange={v => setEditPatientForm((f: any) => ({ ...f, preferredContactMethods: v }))}
                  placeholder="Select contact methods…"
                />
              </div>
              {/* Status + Patient Type */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={editPatientForm.status} onValueChange={v => setEditPatientForm((f: any) => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inquiry">Inquiry</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="qualified">Qualified</SelectItem>
                      <SelectItem value="proposal_sent">Proposal Sent</SelectItem>
                      <SelectItem value="active_patient">Active Patient</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Patient Type (Pricing)</Label>
                  <Select value={editPatientForm.patientType} onValueChange={v => setEditPatientForm((f: any) => ({ ...f, patientType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="international">International</SelectItem>
                      <SelectItem value="local">Local (Turkish)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Emergency Contact */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Emergency Contact Name</Label>
                  <Input value={editPatientForm.emergencyContactName} onChange={e => setEditPatientForm((f: any) => ({ ...f, emergencyContactName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Emergency Contact Phone</Label>
                  <Input value={editPatientForm.emergencyContactPhone} onChange={e => setEditPatientForm((f: any) => ({ ...f, emergencyContactPhone: e.target.value }))} />
                </div>
              </div>
              {/* Insurance */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Insurance Provider</Label>
                  <Input value={editPatientForm.insuranceProvider} onChange={e => setEditPatientForm((f: any) => ({ ...f, insuranceProvider: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Insurance Number</Label>
                  <Input value={editPatientForm.insuranceNumber} onChange={e => setEditPatientForm((f: any) => ({ ...f, insuranceNumber: e.target.value }))} />
                </div>
              </div>
              {/* Assigned Doctors */}
              <div className="space-y-1">
                <Label className="text-xs">Assigned Doctors</Label>
                <DoctorMultiSelect
                  doctors={(allDoctors ?? []).map(d => ({ id: d.id, name: d.name }))}
                  value={editPatientForm.doctorIds ?? []}
                  onChange={v => setEditPatientForm((f: any) => ({ ...f, doctorIds: v }))}
                  isLoading={allDoctorsLoading}
                />
              </div>
              {/* Change Password — only if patient has a linked user account */}
              {patient?.userId && isAdmin && (
                <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <KeyRound className="h-4 w-4" />
                    Change Password
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">New Password</Label>
                      <div className="relative">
                        <Input
                          type={pwForm.showNew ? "text" : "password"}
                          value={pwForm.newPassword}
                          onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                          placeholder="Min 8 characters"
                        />
                        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setPwForm(f => ({ ...f, showNew: !f.showNew }))}>
                          {pwForm.showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Confirm Password</Label>
                      <div className="relative">
                        <Input
                          type={pwForm.showConfirm ? "text" : "password"}
                          value={pwForm.confirmPassword}
                          onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
                          placeholder="Repeat password"
                        />
                        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setPwForm(f => ({ ...f, showConfirm: !f.showConfirm }))}>
                          {pwForm.showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={adminResetPassword.isPending || pwForm.newPassword.length < 8 || pwForm.newPassword !== pwForm.confirmPassword}
                    onClick={() => {
                      if (pwForm.newPassword !== pwForm.confirmPassword) return toast.error("Passwords do not match");
                      if (pwForm.newPassword.length < 8) return toast.error("Password must be at least 8 characters");
                      adminResetPassword.mutate({ userId: patient!.userId!, newPassword: pwForm.newPassword });
                    }}
                  >
                    {adminResetPassword.isPending ? "Updating..." : "Update Password"}
                  </Button>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => doClosePatientEdit()} disabled={isSavingPatient}>Cancel</Button>
                <Button onClick={handleSavePatient} disabled={isSavingPatient}>
                  {isSavingPatient ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Patient Edit — Discard Confirmation */}
      <AlertDialog open={showPatientEditDiscardConfirm} onOpenChange={setShowPatientEditDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in the Patient Edit form. If you close now, all changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowPatientEditDiscardConfirm(false)}>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => doClosePatientEdit(true)}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

            {/* MRN Edit Dialog (Admin only) */}
      {showMrnEditDialog && (
        <Dialog open onOpenChange={setShowMrnEditDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Edit Patient MRN</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Change the Medical Record Number for <strong>{patient.firstName} {patient.lastName}</strong>. This must be unique across all patients.</p>
              <div className="space-y-1.5">
                <Label>MRN</Label>
                <Input value={mrnEditValue} onChange={e => setMrnEditValue(e.target.value)} className="font-mono" placeholder="e.g. FRT-00042" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowMrnEditDialog(false)}>Cancel</Button>
                <Button onClick={() => updateMRN.mutate({ patientId, mrn: mrnEditValue })} disabled={!mrnEditValue || updateMRN.isPending}>
                  {updateMRN.isPending ? "Saving..." : "Save MRN"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Patient Confirmation Dialog */}
      {showDeleteDialog && (
        <Dialog open onOpenChange={setShowDeleteDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Delete Patient Record</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This will permanently delete <strong>{patient.firstName} {patient.lastName}</strong> and all associated records.
                This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
                <Button variant="destructive" disabled={deletePatientMutation.isPending}
                  onClick={() => deletePatientMutation.mutate({ id: patientId })}>
                  {deletePatientMutation.isPending ? "Deleting..." : "Permanently Delete"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Request Doctor Review Dialog */}
      <Dialog open={showRequestDoctorDialog} onOpenChange={(open) => { setShowRequestDoctorDialog(open); if (!open) { setRequestDoctorId(""); setRequestDoctorNotes(""); setRequestPlanTitle(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-teal-600" />
              Request Treatment Plan
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">Assign a doctor and request a treatment plan for this patient. The doctor will be notified and the plan will appear in their Treatment Plans dashboard.</p>
            <div className="space-y-2">
              <Label>Doctor *</Label>
              <Select value={requestDoctorId} onValueChange={setRequestDoctorId}>
                <SelectTrigger><SelectValue placeholder="Select a doctor…" /></SelectTrigger>
                <SelectContent>
                  {(allDoctors ?? []).map((d: any) => (
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
                value={requestDoctorNotes}
                onChange={(e) => setRequestDoctorNotes(e.target.value)}
                placeholder="Patient's current situation, main interests, specific concerns…"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRequestDoctorDialog(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!requestDoctorId) { toast.error("Please select a doctor"); return; }
                  requestDoctorReview.mutate({ type: "patient", id: patientId, doctorId: Number(requestDoctorId), title: requestPlanTitle || undefined, requestNotes: requestDoctorNotes || undefined });
                }}
                disabled={requestDoctorReview.isPending || !requestDoctorId}
                className="gap-2"
              >
                {requestDoctorReview.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
                Send Request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Partner banner */}
      {partner && (
        <div className="flex flex-wrap items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <Link2 className="h-4 w-4 text-blue-600 shrink-0" />
          {/* Partner info — clickable on mobile too */}
          <button
            className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 text-left flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setLocation(`/patients/${partner.id}`)}
            title={`Open ${partner.firstName} ${partner.lastName}'s profile`}
          >
            <span className="text-sm font-semibold text-blue-900">
              {partner.firstName} {partner.lastName}
            </span>
            <span className="text-xs text-blue-600 font-mono">{partner.mrn}</span>
            {partner.phone && <span className="text-xs text-blue-500 hidden sm:inline">{partner.phone}</span>}
          </button>
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {/* Primary CTA — always visible, prominent on mobile */}
            <Button
              variant="default"
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs gap-1.5 px-3"
              onClick={() => setLocation(`/patients/${partner.id}`)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Open Partner Profile</span>
              <span className="sm:hidden">Open</span>
            </Button>
            {!isDoctor && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-8 text-xs gap-1 px-2"
                onClick={() => unlinkPartner.mutate({ patientId })}
                disabled={unlinkPartner.isPending}
                title="Unlink partner"
              >
                <Link2Off className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Unlink</span>
              </Button>
            )}
          </div>
        </div>
      )}
      {!partner && !isDoctor && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-muted-foreground"
            onClick={() => setShowLinkPartnerDialog(true)}
          >
            <UserPlus className="h-4 w-4" /> Link Partner Patient
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-0">
        {/* ── Desktop: 6 primary tabs + More dropdown (no horizontal scroll) ── */}
        <div className={`${isCompactPatientLayout ? "hidden" : "flex"} min-w-0 items-center gap-1 border-b pb-0 mb-4`}>
          {isDoctor ? (
            <>
              <TabsList className="h-9 gap-0.5">
                <TabsTrigger value="intake" className="gap-1.5 text-xs px-3"><Users className="h-3.5 w-3.5" />Medical Record</TabsTrigger>
                <TabsTrigger value="appointments" className="gap-1.5 text-xs px-3"><Calendar className="h-3.5 w-3.5" />Appointments</TabsTrigger>
                <TabsTrigger value="lab" className="gap-1.5 text-xs px-3"><FlaskConical className="h-3.5 w-3.5" />Lab</TabsTrigger>
                <TabsTrigger value="medical" className="gap-1.5 text-xs px-3"><FileText className="h-3.5 w-3.5" />Consultation Notes</TabsTrigger>
                <TabsTrigger value="cycles" className="gap-1.5 text-xs px-3"><Brain className="h-3.5 w-3.5" />Cycles</TabsTrigger>
                <TabsTrigger value="reports" className="gap-1.5 text-xs px-3"><FileText className="h-3.5 w-3.5" />Reports</TabsTrigger>
              </TabsList>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1 text-xs shrink-0">
                    More <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem onClick={() => setActiveTab("treatment-plan")} className={activeTab === "treatment-plan" ? "bg-accent" : ""}>
                    <ClipboardList className="h-4 w-4 mr-2 text-purple-600" />Treatment Plan
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <TabsList className="h-9 gap-0.5">
                <TabsTrigger value="intake" className="gap-1.5 text-xs px-3"><Users className="h-3.5 w-3.5" />Medical Record</TabsTrigger>
                <TabsTrigger value="appointments" className="gap-1.5 text-xs px-3"><Calendar className="h-3.5 w-3.5" />Appointments</TabsTrigger>
                <TabsTrigger value="tasks" className="gap-1.5 text-xs px-3"><ClipboardList className="h-3.5 w-3.5" />Tasks</TabsTrigger>
                <TabsTrigger value="finance" className="gap-1.5 text-xs px-3"><DollarSign className="h-3.5 w-3.5" />Finance</TabsTrigger>
                <TabsTrigger value="lab" className="gap-1.5 text-xs px-3"><FlaskConical className="h-3.5 w-3.5" />Lab</TabsTrigger>
                <TabsTrigger value="reports" className="gap-1.5 text-xs px-3"><FileText className="h-3.5 w-3.5" />Reports</TabsTrigger>
              </TabsList>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1 text-xs shrink-0">
                    More <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuItem onClick={() => setActiveTab("docs")} className={activeTab === "docs" ? "bg-accent" : ""}>
                    <Paperclip className="h-4 w-4 mr-2" />Documents
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab("whatsapp")} className={activeTab === "whatsapp" ? "bg-accent" : ""}>
                    <MessageSquare className="h-4 w-4 mr-2 text-green-600" />WhatsApp
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab("treatment-plan")} className={activeTab === "treatment-plan" ? "bg-accent" : ""}>
                    <ClipboardList className="h-4 w-4 mr-2 text-purple-600" />Treatment Plan
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab("crm")} className={activeTab === "crm" ? "bg-accent" : ""}>
                    <Star className="h-4 w-4 mr-2" />CRM
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab("medical")} className={activeTab === "medical" ? "bg-accent" : ""}>
                    <FileText className="h-4 w-4 mr-2" />Consultation Notes
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab("cycles")} className={activeTab === "cycles" ? "bg-accent" : ""}>
                    <Brain className="h-4 w-4 mr-2" />Cycles
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        {/* ── Mobile: 4 primary tabs + More dropdown ── */}
        <MobileTabBar isDoctor={isDoctor} activeTab={activeTab} onTabChange={setActiveTab} compact={isCompactPatientLayout} />
        <TabsContent value="medical"><MedicalTab patientId={patientId} patientPhone={patient?.phone ?? ""} patientEmail={patient?.email ?? ""} /></TabsContent>
        <TabsContent value="intake"><PatientIntakeTab patientId={patientId} /></TabsContent>
        <TabsContent value="appointments"><AppointmentsTab patientId={patientId} patientName={[patient?.firstName, patient?.lastName].filter(Boolean).join(" ")} /></TabsContent>
        {!isDoctor && <TabsContent value="finance"><FinanceTab patientId={patientId} patient={patient} /></TabsContent>}
        {!isDoctor && <TabsContent value="tasks"><PatientTasksTab patientId={patientId} /></TabsContent>}
        <TabsContent value="lab"><LabTab patientId={patientId} /></TabsContent>
        <TabsContent value="reports"><ExternalReportsTab patientId={patientId} patientPhone={patient?.phone ?? ""} patientEmail={patient?.email ?? ""} /></TabsContent>
        <TabsContent value="cycles"><TreatmentCyclesTab patientId={patientId} isReadOnly={false} /></TabsContent>
        {!isDoctor && (
          <TabsContent value="crm">
            <div className="space-y-0">
              <div className="border-b mb-4">
                <div className="flex gap-0">
                  <button
                    onClick={() => setCrmSubTab("lead-profile")}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      crmSubTab === "lead-profile"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Lead Profile
                  </button>
                  <button
                    onClick={() => setCrmSubTab("crm-notes")}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      crmSubTab === "crm-notes"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    CRM Notes
                  </button>
                </div>
              </div>
              {crmSubTab === "lead-profile" && (
                <PatientCRMTab patientId={patientId} patient={patient} onRefresh={refetchPatient} />
              )}
              {crmSubTab === "crm-notes" && (
                <PatientCommsTab patientId={patientId} socialLeadId={linkedLeadId} />
              )}
            </div>
          </TabsContent>
        )}
        {!isDoctor && <TabsContent value="whatsapp"><WhatsAppTab patientId={patientId} patientPhone={patient?.phone ?? ""} patientName={[patient?.firstName, patient?.lastName].filter(Boolean).join(" ")} /></TabsContent>}
        {!isDoctor && <TabsContent value="docs"><PatientDocumentsTab patientId={patientId} linkedLeadId={linkedLeadId} /></TabsContent>}
        <TabsContent value="treatment-plan"><PatientTreatmentPlanTabWithSubTabs patientId={patientId} patient={patient} /></TabsContent>
      </Tabs>

      {/* Link Partner Dialog */}
      {showLinkPartnerDialog && (
        <LinkPatientPartnerDialog
          patientId={patientId}
          onClose={() => setShowLinkPartnerDialog(false)}
          onSuccess={() => { refetchPatient(); refetchPartner(); setShowLinkPartnerDialog(false); }}
        />
      )}
    </div>
  );
}

// ─── Medical Notes Tab ────────────────────────────────────────────────────────
function MedicalTab({ patientId, patientPhone, patientEmail }: { patientId: number; patientPhone?: string; patientEmail?: string }) {
  const { user } = useAuth();
  const isDoctor = user?.role === "doctor";
  const { data: notes, refetch } = trpc.medicalNotes.list.useQuery({ patientId });
  const { data: doctors } = trpc.doctors.list.useQuery();
  const { data: myDoctorProfile } = trpc.doctors.me.useQuery(undefined, { enabled: isDoctor });
  const { data: specializationsList } = trpc.specializations.list.useQuery();
  const [showAdd, setShowAdd] = useState(false);
  const [editingNote, setEditingNote] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [noteDoctorId, setNoteDoctorId] = useState("");
  const [editNoteDoctorId, setEditNoteDoctorId] = useState("");
  // Filters
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [filterType, setFilterType] = useState("");
  const [filterDoctorId, setFilterDoctorId] = useState("");
  const [filterSpecialization, setFilterSpecialization] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

  // Doctors filtered by selected specialization
  const doctorsForFilter = filterSpecialization
    ? (doctors ?? []).filter(d =>
        (d.specialty ?? "").split(",").map((s: string) => s.trim()).includes(filterSpecialization)
      )
    : (doctors ?? []);

  // Backward compat: filterDoctor still used in filter logic
  const filterDoctor = filterDoctorId
    ? (doctors ?? []).find(d => String(d.id) === filterDoctorId)?.name?.toLowerCase() ?? ""
    : "";

  const activeFilterCount = [filterType, filterDoctorId, filterSpecialization, filterDateFrom, filterDateTo, filterSearch].filter(Boolean).length;
  const filteredNotes = (notes ?? []).filter(note => {
    if (filterType && note.noteType !== filterType) return false;
    if (filterDoctor && !note.doctorName?.toLowerCase().includes(filterDoctor.toLowerCase())) return false;
    // specialization filter is handled via filterDoctorId (doctors filtered by specialization in doctorsForFilter)
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      const hay = [note.chiefComplaint, note.diagnosis, note.assessment, note.plan, note.medications, note.historyOfPresentIllness, (note as any).additionalNotes].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filterDateFrom && note.visitDate && new Date(note.visitDate) < new Date(filterDateFrom)) return false;
    if (filterDateTo && note.visitDate && new Date(note.visitDate) > new Date(filterDateTo + "T23:59:59")) return false;
    return true;
  });
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const transcribeVoice = trpc.medicalNotes.transcribeVoice.useMutation();
  const generateAi = trpc.medicalNotes.generateAiSummary.useMutation();
  const updateNote = trpc.medicalNotes.update.useMutation({
    onSuccess: () => { toast.success("Note updated"); refetch(); setEditingNote(null); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const openEdit = (note: any) => {
    setEditingNote(note);
    setEditForm({
      chiefComplaint: note.chiefComplaint ?? "",
      historyOfPresentIllness: note.historyOfPresentIllness ?? "",
      physicalExamination: note.physicalExamination ?? "",
      assessment: note.assessment ?? "",
      plan: note.plan ?? "",
      diagnosis: note.diagnosis ?? "",
      medications: note.medications ?? "",
      additionalNotes: note.additionalNotes ?? "",
      visitDate: note.visitDate ? format(new Date(note.visitDate), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
    });
    // Pre-fill doctor for edit: for doctor role use their own profile, for others use the note's existing doctorId
    if (isDoctor && myDoctorProfile) {
      setEditNoteDoctorId(String(myDoctorProfile.id));
    } else {
      setEditNoteDoctorId(note.doctorId ? String(note.doctorId) : "");
    }
  };

  const handleVoiceRecord = async () => {
    if (isRecording) {
      mediaRecorder?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        const file = new File([blob], "voice-note.webm", { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(",")[1];
          try {
            toast.info("Transcribing voice...");
            const result = await transcribeVoice.mutateAsync({ audioBase64: base64 });
            setAiText(prev => prev ? prev + " " + result.text : result.text);
            toast.success("Voice transcribed — click Generate with AI to structure it");
          } catch {
            toast.error("Transcription failed");
          }
        };
        reader.readAsDataURL(file);
      };
      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      toast.info("Recording... click mic again to stop");
    } catch {
      toast.error("Microphone access denied");
    }
  };
  const EMPTY_NOTE_FORM = { noteType: "consultation", chiefComplaint: "", historyOfPresentIllness: "", physicalExamination: "", assessment: "", plan: "", diagnosis: "", medications: "", additionalNotes: "", visitDate: format(new Date(), "yyyy-MM-dd") };
  const [sendingWaId, setSendingWaId] = useState<number | null>(null);
  const [cancelDialogNote, setCancelDialogNote] = useState<any>(null);
  const [confirmDeleteNote, setConfirmDeleteNote] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState("");
  const isMedicalAdmin = user?.role === "admin";
  // Email sending state
  const [sendEmailNote, setSendEmailNote] = useState<any | null>(null);
  const [sendEmailTo, setSendEmailTo] = useState("");
  const [sendEmailAttachPdf, setSendEmailAttachPdf] = useState(true);
  const sendMedicalEmailMut = trpc.medicalNotes.sendEmail.useMutation({
    onSuccess: () => { toast.success("Medical report sent via email"); setSendEmailNote(null); },
    onError: (e) => toast.error(e.message || "Failed to send email"),
  });
  const requestCancellation = trpc.medicalNotes.requestCancellation.useMutation({
    onSuccess: () => { toast.success("Cancellation request submitted. Admin will review."); refetch(); setCancelDialogNote(null); setCancelReason(""); },
    onError: (e) => toast.error(e.message || "Failed to submit cancellation request"),
  });
  const approveCancellation = trpc.medicalNotes.approveCancellation.useMutation({
    onSuccess: () => { toast.success("Medical note deleted"); refetch(); },
    onError: (e) => toast.error(e.message || "Failed to delete note"),
  });
  const rejectCancellation = trpc.medicalNotes.rejectCancellation.useMutation({
    onSuccess: () => { toast.success("Cancellation request rejected"); refetch(); },
    onError: (e) => toast.error(e.message || "Failed to reject request"),
  });
  const sendMedicalReport = trpc.whatsapp.sendMedicalReport.useMutation({
    onSuccess: () => { toast.success("Medical report sent via WhatsApp"); setSendingWaId(null); },
    onError: (e) => { toast.error(e.message || "Failed to send WhatsApp report"); setSendingWaId(null); },
  });
  const createNote = trpc.medicalNotes.create.useMutation({
    onSuccess: () => { toast.success("Note saved"); refetch(); setShowAdd(false); setAiResult(null); setAiText(""); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const [form, setForm] = useState(EMPTY_NOTE_FORM);

  // Reset form when dialog closes
  useEffect(() => {
    if (!showAdd) {
      setForm({ ...EMPTY_NOTE_FORM, visitDate: format(new Date(), "yyyy-MM-dd") });
      setAiText("");
      setAiResult(null);
      // For doctor role, auto-set their own profile; for others reset to empty
      if (isDoctor && myDoctorProfile) {
        setNoteDoctorId(String(myDoctorProfile.id));
      } else {
        setNoteDoctorId("");
      }
    }
  }, [showAdd, isDoctor, myDoctorProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAiGenerate = async () => {
    if (!aiText.trim()) return toast.error("Enter some text first");
    setAiLoading(true);
    try {
      const result = await generateAi.mutateAsync({ rawText: aiText, noteType: form.noteType });
      setAiResult(result);
      setForm(f => ({ ...f, ...result }));
      toast.success("AI note generated — review and save");
    } catch (e: any) {
      toast.error(e?.data?.code === "SERVICE_UNAVAILABLE" ? "AI Medical Scribe is temporarily unavailable. Your raw text is still available; please retry or complete the note manually." : (e.message ?? "AI generation failed"));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Medical Notes</h3>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />New Note
        </Button>
      </div>

      {/* Filter Bar — shown only when there are notes */}
      {notes && notes.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              placeholder="Search notes..."
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              className="h-8 px-2.5 text-sm border rounded-md bg-background w-40 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="h-8 px-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All Types</option>
              {["consultation","follow_up","procedure","lab_review","general"].map(t => (
                <option key={t} value={t}>{t.replace(/_/g," ")}</option>
              ))}
            </select>
            <select
              value={filterSpecialization}
              onChange={e => { setFilterSpecialization(e.target.value); setFilterDoctorId(""); }}
              className="h-8 px-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All Specializations</option>
              {(specializationsList ?? []).map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
            <select
              value={filterDoctorId}
              onChange={e => setFilterDoctorId(e.target.value)}
              className="h-8 px-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All Doctors</option>
              {doctorsForFilter.map(d => (
                <option key={d.id} value={String(d.id)}>{d.name}</option>
              ))}
            </select>
            <input type="date" value={filterDateFrom} max={todayStr} onChange={e => setFilterDateFrom(e.target.value)}
              className="h-8 px-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring" title="From" />
            <input type="date" value={filterDateTo} max={todayStr} onChange={e => setFilterDateTo(e.target.value)}
              className="h-8 px-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring" title="To" />
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setFilterType(""); setFilterDoctorId(""); setFilterSpecialization(""); setFilterDateFrom(""); setFilterDateTo(""); setFilterSearch(""); }}
                className="h-8 px-2.5 text-sm text-destructive border border-destructive/30 rounded-md hover:bg-destructive/10 flex items-center gap-1"
              >
                <XCircle className="h-3.5 w-3.5" />Clear ({activeFilterCount})
              </button>
            )}
          </div>
          {activeFilterCount > 0 && (
            <p className="text-xs text-muted-foreground">{filteredNotes.length} of {notes.length} notes shown</p>
          )}
        </div>
      )}

      {!notes || notes.length === 0 ? (
        <EmptyState icon={FileText} label="No medical notes yet" action="Add first note" onAction={() => setShowAdd(true)} />
      ) : filteredNotes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No notes match the current filters.</div>
      ) : (
        <div className="space-y-3">
          {filteredNotes.map(note => (
            <Card key={note.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded">
                      {note.noteType?.replace(/_/g, " ")}
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">
                      {note.visitDate ? format(new Date(note.visitDate), "MMM d, yyyy") : ""}
                      {note.doctorName ? ` · Dr. ${note.doctorName}` : ""}
                    </p>
                    {note.enteredByName && note.enteredByName !== note.doctorName && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        Entered by: {note.enteredByName}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {(note as any).cancellationStatus === "requested" && (
                      <span className="flex items-center gap-1 text-[10px] text-orange-700 bg-orange-100 border border-orange-200 px-1.5 py-0.5 rounded font-medium">
                        <AlertTriangle className="h-3 w-3" />Cancellation Requested
                      </span>
                    )}
                    {note.isAiGenerated && (
                      <span className="flex items-center gap-1 text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                        <Brain className="h-3 w-3" />AI
                      </span>
                    )}
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="Export as Medical Report PDF"
                      onClick={() => window.open(`/api/medical-notes/${note.id}/pdf`, "_blank")}
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-sky-600 hover:text-sky-700"
                      title="Send Medical Report via Email"
                      onClick={() => { setSendEmailNote(note); setSendEmailTo(patientEmail ?? ""); setSendEmailAttachPdf(true); }}
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700"
                      title="Send Medical Report via WhatsApp"
                      disabled={sendingWaId === note.id}
                      onClick={() => {
                        const phone = patientPhone;
                        if (!phone) { toast.error("Patient phone number not available"); return; }
                        setSendingWaId(note.id);
                        sendMedicalReport.mutate({
                          patientId,
                          noteId: note.id,
                          toPhone: phone,
                          publicBaseUrl: window.location.origin,
                        });
                      }}
                    >
                      {sendingWaId === note.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(note)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    {/* Cancellation buttons */}
                    {isMedicalAdmin ? (
                      // Admin: always see a direct delete button; also see approve/reject if a request is pending
                      <>
                        {(note as any).cancellationStatus === "requested" && (
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Reject cancellation request"
                            disabled={rejectCancellation.isPending}
                            onClick={() => rejectCancellation.mutate({ id: note.id })}
                          >
                            {rejectCancellation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title={(note as any).cancellationStatus === "requested" ? "Approve deletion (cancellation requested)" : "Delete note"}
                          disabled={approveCancellation.isPending}
                          onClick={() => setConfirmDeleteNote(note)}
                        >
                          {approveCancellation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </>
                    ) : (
                      // Doctor/Staff: show request cancellation button only if no pending request
                      !(note as any).cancellationStatus && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                          title="Request cancellation"
                          onClick={() => { setCancelDialogNote(note); setCancelReason(""); }}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      )
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  {note.chiefComplaint && <NoteField label="Chief Complaint" value={note.chiefComplaint} />}
                  {note.diagnosis && <NoteField label="Diagnosis" value={note.diagnosis} />}
                  {note.assessment && <NoteField label="Assessment" value={note.assessment} />}
                  {note.plan && <NoteField label="Plan" value={note.plan} />}
                  {note.medications && <NoteField label="Medications" value={note.medications} />}
                  {note.historyOfPresentIllness && <NoteField label="History" value={note.historyOfPresentIllness} className="md:col-span-2" />}
                  {(note as any).additionalNotes && <NoteField label="Additional Notes" value={(note as any).additionalNotes} className="md:col-span-2" />}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Note Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Medical Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* AI Assistant */}
            <div className="p-3 rounded-xl border border-purple-200 bg-purple-50/50 space-y-2">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-semibold text-purple-700">AI Medical Scribe</span>
              </div>
              <Textarea
                value={aiText}
                onChange={e => setAiText(e.target.value)}
                placeholder="Dictate or type raw notes... AI will structure them into a clinical note"
                rows={3}
                className="bg-white"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleVoiceRecord}
                  disabled={transcribeVoice.isPending}
                  className={`gap-1.5 ${isRecording ? "border-red-400 text-red-600 hover:bg-red-50 animate-pulse" : "border-purple-300 text-purple-700 hover:bg-purple-100"}`}
                >
                  {transcribeVoice.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
                  {transcribeVoice.isPending ? "Transcribing..." : isRecording ? "Stop Recording" : "Record Voice"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAiGenerate}
                  disabled={aiLoading}
                  className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-100"
                >
                  {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
                  {aiLoading ? "Generating..." : "Generate with AI"}
                </Button>
              </div>
              {aiResult && <p className="text-xs text-purple-600">✓ Fields populated from AI — review before saving</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Note Type</Label>
                <Select value={form.noteType} onValueChange={v => setForm(f => ({ ...f, noteType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["consultation", "follow_up", "procedure", "lab_review", "general"].map(t => (
                      <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Visit Date</Label>
                <Input type="date" value={form.visitDate} max={todayStr} onChange={e => setForm(f => ({ ...f, visitDate: e.target.value }))} />
              </div>
              {/* Doctor field: auto-filled & locked for doctor role, required dropdown for admin/staff */}
              <div className="col-span-2 space-y-1.5">
                <Label>Doctor <span className="text-destructive">*</span></Label>
                {isDoctor ? (
                  <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/50 text-sm text-muted-foreground">
                    <Lock className="h-3.5 w-3.5" />
                    <span>{myDoctorProfile?.name ?? "Loading..."}</span>
                  </div>
                ) : (
                  <Select value={noteDoctorId} onValueChange={setNoteDoctorId}>
                    <SelectTrigger><SelectValue placeholder="Select a doctor" /></SelectTrigger>
                    <SelectContent>
                      {(doctors ?? []).map(d => (
                        <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Chief Complaint</Label>
                <Input value={form.chiefComplaint} onChange={e => setForm(f => ({ ...f, chiefComplaint: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>History of Present Illness</Label>
                <Textarea value={form.historyOfPresentIllness} onChange={e => setForm(f => ({ ...f, historyOfPresentIllness: e.target.value }))} rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>Physical Examination</Label>
                <Textarea value={form.physicalExamination} onChange={e => setForm(f => ({ ...f, physicalExamination: e.target.value }))} rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>Assessment</Label>
                <Textarea value={form.assessment} onChange={e => setForm(f => ({ ...f, assessment: e.target.value }))} rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>Diagnosis</Label>
                <Input value={form.diagnosis} onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <Textarea value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))} rows={2} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Medications</Label>
                <Input value={form.medications} onChange={e => setForm(f => ({ ...f, medications: e.target.value }))} placeholder="e.g. Metformin 500mg BD, Folic acid 5mg OD" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Additional Notes</Label>
                <Textarea value={(form as any).additionalNotes ?? ""} onChange={e => setForm(f => ({ ...f, additionalNotes: e.target.value }))} rows={2} placeholder="Any additional observations, instructions, or remarks..." />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  // Determine effective doctorId
                  const effectiveDoctorId = isDoctor
                    ? (myDoctorProfile?.id ?? undefined)
                    : (noteDoctorId ? parseInt(noteDoctorId) : undefined);
                  if (!isDoctor && !effectiveDoctorId) {
                    toast.error("Please select a doctor for this note");
                    return;
                  }
                  createNote.mutate({
                    patientId,
                    doctorId: effectiveDoctorId,
                    noteType: form.noteType as any,
                    chiefComplaint: form.chiefComplaint || undefined,
                    historyOfPresentIllness: form.historyOfPresentIllness || undefined,
                    physicalExamination: form.physicalExamination || undefined,
                    assessment: form.assessment || undefined,
                    plan: form.plan || undefined,
                    diagnosis: form.diagnosis || undefined,
                    medications: form.medications || undefined,
                    visitDate: form.visitDate ? new Date(form.visitDate) : undefined,
                    isAiGenerated: !!aiResult,
                    additionalNotes: (form as any).additionalNotes || undefined,
                  });
                }}
                disabled={createNote.isPending}
              >
                {createNote.isPending ? "Saving..." : "Save Note"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Note Dialog */}
      <Dialog open={!!editingNote} onOpenChange={open => !open && setEditingNote(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Medical Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Doctor field in edit dialog */}
            <div className="space-y-1.5">
              <Label>Doctor <span className="text-destructive">*</span></Label>
              {isDoctor ? (
                <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/50 text-sm text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" />
                  <span>{myDoctorProfile?.name ?? "Loading..."}</span>
                </div>
              ) : (
                <Select value={editNoteDoctorId} onValueChange={setEditNoteDoctorId}>
                  <SelectTrigger><SelectValue placeholder="Select a doctor" /></SelectTrigger>
                  <SelectContent>
                    {(doctors ?? []).map(d => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {/* Consultation Date */}
            <div className="space-y-1.5">
              <Label>Consultation Date <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={editForm.visitDate ?? ""}
                max={todayStr}
                onChange={e => setEditForm((f: any) => ({ ...f, visitDate: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Set the actual date of the consultation. This date will appear on the PDF.</p>
            </div>
            {([
              ["chiefComplaint", "Chief Complaint"],
              ["diagnosis", "Diagnosis"],
              ["assessment", "Assessment"],
              ["plan", "Plan"],
              ["medications", "Medications"],
              ["historyOfPresentIllness", "History of Present Illness"],
              ["physicalExamination", "Physical Examination"],
              ["additionalNotes", "Additional Notes"],
            ] as [string, string][]).map(([field, label]) => (
              <div key={field} className="space-y-1.5">
                <Label>{label}</Label>
                <Textarea
                  value={editForm[field] ?? ""}
                  onChange={e => setEditForm((f: any) => ({ ...f, [field]: e.target.value }))}
                  rows={field === "historyOfPresentIllness" || field === "physicalExamination" ? 3 : 2}
                  className="text-sm"
                />
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setEditingNote(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  const effectiveEditDoctorId = isDoctor
                    ? (myDoctorProfile?.id ?? undefined)
                    : (editNoteDoctorId ? parseInt(editNoteDoctorId) : undefined);
                  if (!isDoctor && !effectiveEditDoctorId) {
                    toast.error("Please select a doctor for this note");
                    return;
                  }
                  updateNote.mutate({
                    id: editingNote.id,
                    data: {
                      ...editForm,
                      doctorId: effectiveEditDoctorId,
                      visitDate: editForm.visitDate ? new Date(editForm.visitDate) : undefined,
                    },
                  });
                }}
                disabled={updateNote.isPending}
              >
                {updateNote.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancellation Request Dialog */}
      <Dialog open={!!cancelDialogNote} onOpenChange={open => { if (!open) { setCancelDialogNote(null); setCancelReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-orange-500" />
              Request Note Cancellation
            </DialogTitle>
            <DialogDescription>
              This will send a cancellation request to the admin. The note will not be deleted until an admin approves the request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Reason for cancellation <span className="text-destructive">*</span></Label>
              <Textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Explain why this note should be deleted..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelDialogNote(null); setCancelReason(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim() || requestCancellation.isPending}
              onClick={() => {
                if (!cancelDialogNote) return;
                requestCancellation.mutate({ id: cancelDialogNote.id, reason: cancelReason.trim() });
              }}
            >
              {requestCancellation.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Submitting...</> : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Note Confirmation Dialog */}
      <Dialog open={!!confirmDeleteNote} onOpenChange={(open) => { if (!open) setConfirmDeleteNote(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-4 w-4" />
              Delete Medical Note
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this{" "}
              <strong>{confirmDeleteNote?.noteType?.replace("_", " ")}</strong> note
              {confirmDeleteNote?.visitDate ? ` dated ${new Date(confirmDeleteNote.visitDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}` : ""}?
              <br /><br />
              <span className="text-red-600 font-medium">This action cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDeleteNote(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={approveCancellation.isPending}
              onClick={() => {
                if (!confirmDeleteNote) return;
                approveCancellation.mutate(
                  { id: confirmDeleteNote.id },
                  { onSuccess: () => setConfirmDeleteNote(null) }
                );
              }}
            >
              {approveCancellation.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Deleting...</> : "Yes, Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email Dialog */}
      <Dialog open={!!sendEmailNote} onOpenChange={(o) => { if (!o) setSendEmailNote(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-sky-600" />
              Send Medical Report via Email
            </DialogTitle>
            <DialogDescription>
              Send the medical report PDF to the patient's email address.
            </DialogDescription>
          </DialogHeader>
          {sendEmailNote && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Reference:</span> <strong>MR-{String(sendEmailNote.id).padStart(5, "0")}</strong></p>
                <p><span className="text-muted-foreground">Type:</span> <strong>{sendEmailNote.noteType?.replace("_", " ") ?? "Consultation"}</strong></p>
                <p><span className="text-muted-foreground">Date:</span> <strong>{sendEmailNote.visitDate ? format(new Date(sendEmailNote.visitDate), "dd MMM yyyy") : "Today"}</strong></p>
              </div>
              <div className="space-y-1.5">
                <Label>Email Address <span className="text-destructive">*</span></Label>
                <Input
                  type="email"
                  value={sendEmailTo}
                  onChange={e => setSendEmailTo(e.target.value)}
                  placeholder="patient@email.com"
                />
                {(!patientEmail || patientEmail.trim() === "") && <p className="text-xs text-muted-foreground">No email on file — please enter one above.</p>}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="attach-pdf-medical"
                  checked={sendEmailAttachPdf}
                  onChange={e => setSendEmailAttachPdf(e.target.checked)}
                  className="h-4 w-4"
                />
                <label htmlFor="attach-pdf-medical" className="text-sm flex items-center gap-1 cursor-pointer">
                  <FileText className="h-3.5 w-3.5" /> Attach PDF to email
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendEmailNote(null)}>Cancel</Button>
            <Button
              disabled={!sendEmailTo.trim() || sendMedicalEmailMut.isPending}
              onClick={() => {
                if (!sendEmailNote) return;
                sendMedicalEmailMut.mutate({
                  noteId: sendEmailNote.id,
                  patientId,
                  toEmail: sendEmailTo.trim(),
                  attachPdf: sendEmailAttachPdf,
                });
              }}
            >
              {sendMedicalEmailMut.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Sending...</> : <><Mail className="h-3.5 w-3.5 mr-1" />Send Email</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Appointments Tab ────────────────────────────────────────────────────────────────
function AppointmentsTab({ patientId, patientName }: { patientId: number; patientName: string }) {
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);
  const { data: patientsListResult } = trpc.patients.list.useQuery({ pageSize: 1000 });
  const patientsList = patientsListResult?.data;
  const { data: allUsers } = trpc.users.listStaff.useQuery();
  const { data: appointments, refetch } = trpc.appointments.list.useQuery({ patientId });

  const upcoming = appointments?.filter(a => a.status === "upcoming" || a.status === "confirmed") ?? [];
  const past = appointments?.filter(a => a.status === "completed" || a.status === "no_show") ?? [];
  const cancelled = appointments?.filter(a => a.status === "cancelled" || a.status === "rescheduled") ?? [];

  const statusColor: Record<string, string> = {
    upcoming: "bg-blue-100 text-blue-700",
    confirmed: "bg-emerald-100 text-emerald-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
    no_show: "bg-orange-100 text-orange-700",
    rescheduled: "bg-purple-100 text-purple-700",
  };

  const AppointmentCard = ({ appt }: { appt: any }) => (
    <div
      className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/20 transition-colors cursor-pointer"
      onClick={() => setSelectedAppt(appt)}
    >
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex flex-col items-center justify-center shrink-0">
        <span className="text-[10px] font-bold text-primary">{format(new Date(appt.appointmentDate), "MMM")}</span>
        <span className="text-sm font-bold text-primary leading-none">{format(new Date(appt.appointmentDate), "d")}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{appt.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{format(new Date(appt.appointmentDate), "h:mm a")}</span>
          {appt.duration && <span className="text-xs text-muted-foreground">· {appt.duration} min</span>}
          {appt.doctorName && <span className="text-xs text-muted-foreground">· Dr. {appt.doctorName}</span>}
        </div>
        {appt.purpose && <p className="text-xs text-muted-foreground mt-0.5 capitalize">{appt.purpose.replace(/-/g, " ")}</p>}
        {appt.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{appt.notes}</p>}
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusColor[appt.status] ?? "bg-gray-100"}`}>
          {appt.status.replace(/_/g, " ")}
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* New Appointment button */}
      <div className="flex justify-end">
        <Button size="sm" className="gap-2" onClick={() => setShowNewAppt(true)}>
          <Plus className="h-4 w-4" /> New Appointment
        </Button>
      </div>
      {showNewAppt && (
        <PatientAppointmentFormModal
          patientId={patientId}
          patients={patientsList ?? []}
          staffUsers={allUsers ?? []}
          onClose={() => setShowNewAppt(false)}
          onSuccess={() => { refetch(); setShowNewAppt(false); }}
        />
      )}
      {selectedAppt && (
        <PatientApptDetailModal
          appointment={selectedAppt}
          patientName={patientName}
          onClose={() => setSelectedAppt(null)}
          onRefresh={(appointmentPatch) => {
            void refetch();
            if (appointmentPatch) setSelectedAppt((current: any | null) => current ? { ...current, ...appointmentPatch } : current);
          }}
        />
      )}
      <Section title="Upcoming" count={upcoming.length} icon={Clock} color="blue">
        {upcoming.length === 0 ? <EmptySection label="No upcoming appointments" /> :
          upcoming.map(a => <AppointmentCard key={a.id} appt={a} />)}
      </Section>
      <Section title="Past" count={past.length} icon={CheckCircle2} color="green">
        {past.length === 0 ? <EmptySection label="No past appointments" /> :
          past.map(a => <AppointmentCard key={a.id} appt={a} />)}
      </Section>
      <Section title="Cancelled / Rescheduled" count={cancelled.length} icon={XCircle} color="red">
        {cancelled.length === 0 ? <EmptySection label="No cancelled appointments" /> :
          cancelled.map(a => <AppointmentCard key={a.id} appt={a} />)}
      </Section>
    </div>
  );
}

const INVOICE_LINE_LABEL_SHORTCUTS = ["Cash", "Card", "Bank Transfer"] as const;

function InvoiceLineLabelShortcuts({ disabled, onSelect }: { disabled?: boolean; onSelect: (label: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {INVOICE_LINE_LABEL_SHORTCUTS.map(label => (
        <button
          key={label}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(label)}
          className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Finance Tab ──────────────────────────────────────────────────────────────
function FinanceTab({ patientId, patient }: { patientId: number; patient?: any }) {
  const { user: financeUser } = useAuth();
  const isAdmin = financeUser?.role === "admin";
  const patientDefaultScope = (patient as any)?.defaultFinancialScope === "test" ? "test" : "production";
  const { data: invoices, refetch, isLoading: invoicesLoading, isError: invoicesFailed } = trpc.finance.invoices.useQuery({ patientId });
  const invoicesPending = invoicesLoading || (invoicesFailed && invoices === undefined);
  const { data: offers } = trpc.finance.offers.useQuery({ patientId });
  const { data: productionCreditTxns, refetch: refetchProductionCredit } = trpc.finance.getCreditTransactions.useQuery({ patientId, scope: "production" });
  const { data: testCreditTxns, refetch: refetchTestCredit } = trpc.finance.getCreditTransactions.useQuery(
    { patientId, scope: "test" },
    { enabled: isAdmin },
  );
  const { data: productionFxRoundingAdjustments, refetch: refetchProductionFxRoundingAdjustments } = trpc.finance.getFxRoundingAdjustments.useQuery({ patientId, scope: "production" });
  const { data: testFxRoundingAdjustments, refetch: refetchTestFxRoundingAdjustments } = trpc.finance.getFxRoundingAdjustments.useQuery(
    { patientId, scope: "test" },
    { enabled: isAdmin },
  );
  const creditTxns = [...(productionCreditTxns ?? []), ...(testCreditTxns ?? [])];
  const fxRoundingAdjustments = [...(productionFxRoundingAdjustments ?? []), ...(testFxRoundingAdjustments ?? [])];
  const { data: reversibleCreditApplications, refetch: refetchReversibleCreditApplications } = trpc.finance.getReversibleCreditApplicationsByPatient.useQuery({ patientId });
  const { data: productionCreditApplicationHistory, refetch: refetchProductionCreditApplicationHistory } = trpc.finance.getPatientCreditApplicationHistory.useQuery({ patientId, scope: "production" });
  const { data: testCreditApplicationHistory, refetch: refetchTestCreditApplicationHistory } = trpc.finance.getPatientCreditApplicationHistory.useQuery(
    { patientId, scope: "test" },
    { enabled: isAdmin },
  );
  const creditApplicationHistory = [...(productionCreditApplicationHistory ?? []), ...(testCreditApplicationHistory ?? [])];
  const { data: productionCreditPayouts, refetch: refetchProductionCreditPayouts } = trpc.finance.getPatientCreditPayouts.useQuery({ patientId, scope: "production" });
  const { data: testCreditPayouts, refetch: refetchTestCreditPayouts } = trpc.finance.getPatientCreditPayouts.useQuery(
    { patientId, scope: "test" },
    { enabled: isAdmin },
  );
  const creditPayouts = [...(productionCreditPayouts ?? []), ...(testCreditPayouts ?? [])];
  const { data: settings } = trpc.settings.get.useQuery();
  const { data: liveExchangeRates } = trpc.settings.getExchangeRates.useQuery();
  const { data: refundsList, refetch: refetchRefunds } = trpc.finance.getRefunds.useQuery({ patientId });
  const { data: allPayments, refetch: refetchPayments } = trpc.finance.paymentsByPatient.useQuery({ patientId });
  const [showAdd, setShowAdd] = useState(false);
  const [preSelectedItems, setPreSelectedItems] = useState<SelectedService[] | null>(null);

  // Bridge: EditInvoiceModal can trigger CreateInvoiceModal with pre-selected items
  useEffect(() => {
    (window as any).__openCreateInvoiceWithItems = (items: SelectedService[]) => {
      setPreSelectedItems(items);
      setShowAdd(true);
    };
    return () => { delete (window as any).__openCreateInvoiceWithItems; };
  }, []);
  const [editingInvoice, setEditingInvoice] = useState<any | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<any | null>(null);
  const [refundInvoice, setRefundInvoice] = useState<any | null>(null);
  const [applyCreditInvoice, setApplyCreditInvoice] = useState<any | null>(null);
  const [convertCreditInvoice, setConvertCreditInvoice] = useState<any | null>(null);
  const [creditPayoutTarget, setCreditPayoutTarget] = useState<{ currency: string; scope: "production" | "test"; available: number } | null>(null);
  const [reverseCreditApplicationTarget, setReverseCreditApplicationTarget] = useState<any | null>(null);
  const [sendEmailInvoice, setSendEmailInvoice] = useState<any | null>(null);
  const [sendEmailAttachPdf, setSendEmailAttachPdf] = useState(true);
  const [sendEmailNotifyPartner, setSendEmailNotifyPartner] = useState(false);
  const [sendEmailIsUpdate, setSendEmailIsUpdate] = useState(false);
  const invoiceRecipientDraftKey = `fertiliv:finance-invoice-email:${sendEmailInvoice?.id ?? "none"}`;
  const {
    form: invoiceRecipientDraft,
    setForm: setInvoiceRecipientDraft,
    clearDraft: clearInvoiceRecipientDraft,
  } = useDraftForm<{ manualEmail: string }>({
    key: invoiceRecipientDraftKey,
    initialData: { manualEmail: "" },
    disabled: !sendEmailInvoice,
  });
  const [markAsPaidInvoice, setMarkAsPaidInvoice] = useState<any | null>(null);
  const [markAsPaidReceiptFile, setMarkAsPaidReceiptFile] = useState<File | null>(null);
  const uploadInvoiceReceipt = trpc.finance.uploadInvoiceReceipt.useMutation();
  const sendInvoiceEmailMut = trpc.finance.sendInvoiceEmail.useMutation({
    onSuccess: (result) => {
      if (!result.success) {
        toast.error("Invoice email could not be delivered. The saved invoice has not been changed.");
        return;
      }
      clearInvoiceRecipientDraft();
      toast[result.failedCount > 0 ? "warning" : "success"](
        result.failedCount > 0
          ? `Invoice email sent to ${result.sentCount}; ${result.failedCount} delivery failed.`
          : `Invoice email sent to ${result.sentCount} recipient${result.sentCount === 1 ? "" : "s"}.`,
      );
      setSendEmailInvoice(null);
    },
    onError: (e) => toast.error(parseTrpcError(e)),
  });
  const refetchAll = () => { refetch(); refetchProductionCredit(); refetchTestCredit(); refetchProductionFxRoundingAdjustments(); refetchTestFxRoundingAdjustments(); refetchRefunds(); refetchPayments(); refetchReversibleCreditApplications(); refetchProductionCreditApplicationHistory(); refetchTestCreditApplicationHistory(); refetchProductionCreditPayouts(); refetchTestCreditPayouts(); };
  const [cancelInvoiceTarget, setCancelInvoiceTarget] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [deleteInvoiceTarget, setDeleteInvoiceTarget] = useState<any | null>(null);
  const cancelInvoiceMut = trpc.finance.cancelInvoice.useMutation({
    onSuccess: () => { toast.success("Invoice cancelled"); setCancelInvoiceTarget(null); setCancelReason(""); refetch(); },
    onError: (e) => toast.error(parseTrpcError(e) || "Failed to cancel invoice"),
  });
  const deleteInvoiceMut = trpc.finance.deleteInvoice.useMutation({
    onSuccess: () => { toast.success("Invoice deleted"); setDeleteInvoiceTarget(null); refetch(); },
    onError: (e) => toast.error(parseTrpcError(e) || "Failed to delete invoice"),
  });
  const [sendReceiptInvoice, setSendReceiptInvoice] = useState<any | null>(null);
  const [receiptNote, setReceiptNote] = useState("");
  const receiptRecipientDraftKey = `fertiliv:finance-receipt-email:${sendReceiptInvoice?.id ?? "none"}`;
  const {
    form: receiptRecipientDraft,
    setForm: setReceiptRecipientDraft,
    clearDraft: clearReceiptRecipientDraft,
  } = useDraftForm<{ manualEmail: string }>({
    key: receiptRecipientDraftKey,
    initialData: { manualEmail: "" },
    disabled: !sendReceiptInvoice,
  });
  const [receiptAttachFile, setReceiptAttachFile] = useState<File | null>(null);
  const [receiptAttachProgress, setReceiptAttachProgress] = useState<number>(0); // 0-100
  const [receiptAttachError, setReceiptAttachError] = useState<string | null>(null);
  const uploadReceiptAttachMut = trpc.finance.uploadInvoiceReceipt.useMutation();
  const sendReceiptEmailMut = trpc.finance.sendReceiptEmail.useMutation({
    onSuccess: (result) => {
      if (!result.success) {
        toast.error("Official receipt email could not be delivered. The receipt and invoice have not been changed.");
        return;
      }
      clearReceiptRecipientDraft();
      toast[result.failedCount > 0 ? "warning" : "success"](
        result.failedCount > 0
          ? `Official receipt sent to ${result.sentCount}; ${result.failedCount} delivery failed.`
          : `Official receipt sent to ${result.sentCount} recipient${result.sentCount === 1 ? "" : "s"}.`,
      );
      setSendReceiptInvoice(null);
      setReceiptNote("");
      setReceiptAttachFile(null);
      setReceiptAttachProgress(0);
      setReceiptAttachError(null);
    },
    onError: (e) => toast.error(parseTrpcError(e) || "Failed to send receipt email"),
  });
  const invoiceManualEmail = invoiceRecipientDraft.manualEmail.trim();
  const receiptManualEmail = receiptRecipientDraft.manualEmail.trim();
  const isValidFinanceEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const invoiceManualEmailInvalid = Boolean(invoiceManualEmail) && !isValidFinanceEmail(invoiceManualEmail);
  const receiptManualEmailInvalid = Boolean(receiptManualEmail) && !isValidFinanceEmail(receiptManualEmail);
  useBeforeUnload(Boolean(
    (sendEmailInvoice && invoiceManualEmail) || (sendReceiptInvoice && receiptManualEmail),
  ) && !sendInvoiceEmailMut.isPending && !sendReceiptEmailMut.isPending);
  const updateStatus = trpc.finance.updateInvoiceStatus.useMutation({
    onSuccess: () => { toast.success("Invoice updated"); refetch(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const statusColor: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    issued: "bg-blue-100 text-blue-700",
    paid: "bg-emerald-100 text-emerald-700",
    partial: "bg-yellow-100 text-yellow-700",
    overdue: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-500",
  };

  // Convert an invoice amount from its stored currency to TRY using the invoice's snapshot.
  // Direction: 1 FOREIGN = snapshot TRY  →  tryAmt = foreignAmt × snapshot
  // Auto-corrects inverted snapshots (< 1) by using 1/snapshot.
  const toTRYWithSnapshot = (amount: number, currency: string, snapshot?: string | number | null): number => {
    if (!currency || currency === "TRY") return amount;
    let rate = Number(snapshot ?? 0);
    // IMPORTANT: Do NOT fall back to live exchange rates here.
    // Each invoice has a locked snapshot saved at creation time.
    // Using live rates would cause old TRY totals to change retroactively when settings are updated.
    if (rate <= 0) return amount; // no snapshot saved: return face value as-is (best effort)
    if (rate < 1) rate = 1 / rate; // auto-correct inverted snapshot
    return amount * rate;
  };

  // Total paid — converted to TRY using each invoice's own snapshot
  const totalPaid = invoices?.reduce((s, i) => {
    const paid = Number(i.paidAmount ?? 0);
    if (paid <= 0) return s;
    return s + toTRYWithSnapshot(paid, (i as any).currency ?? "TRY", (i as any).exchangeRateSnapshot);
  }, 0) ?? 0;

  // Outstanding per currency (shown separately, not converted to TRY)
  const outstandingByCurrency: Record<string, number> = {};
  invoices?.filter(i => i.status !== "cancelled").forEach(i => {
    const due = Math.max(0, Number(i.totalAmount ?? 0) - Number(i.paidAmount ?? 0));
    if (due <= 0.001) return;
    const cur = (i as any).currency ?? "TRY";
    outstandingByCurrency[cur] = (outstandingByCurrency[cur] ?? 0) + due;
  });
  const totalDueTRY = invoices?.filter(i => i.status !== "cancelled").reduce((s, i) => {
    const due = Math.max(0, Number(i.totalAmount ?? 0) - Number(i.paidAmount ?? 0));
    if (due <= 0.001) return s;
    return s + toTRYWithSnapshot(due, (i as any).currency ?? "TRY", (i as any).exchangeRateSnapshot);
  }, 0) ?? 0;

  const creditByScopeCurrency: Record<string, Record<string, number>> = { production: {}, test: {} };
  ((creditTxns ?? []) as any[]).forEach((tx: any) => {
    const cur = tx.currency ?? "TRY";
    const scope = tx.financialScope === "test" ? "test" : "production";
    creditByScopeCurrency[scope][cur] = (creditByScopeCurrency[scope][cur] ?? 0) + Number(tx.amount ?? 0);
  });
  const hasCreditBalance = Object.values(creditByScopeCurrency).some(bucket => Object.values(bucket).some(value => value > 0.001));
  const creditInCurrency = (cur: string, scope: string) => creditByScopeCurrency[scope === "test" ? "test" : "production"][cur] ?? 0;
  const creditOrigins = ((creditTxns ?? []) as any[]).filter((tx: any) => tx.type === "overpayment" && Number(tx.amount ?? 0) > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Finance</h3>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />New Invoice
        </Button>
      </div>
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3">
            <p className="text-xs text-emerald-600 font-medium">Total Paid</p>
            {invoicesPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="text-xl font-bold text-emerald-700">TRY {totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3">
            <p className="text-xs text-amber-600 font-medium">Outstanding</p>
            {invoicesPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : Object.keys(outstandingByCurrency).length === 0 ? (
              <p className="text-xl font-bold text-emerald-600">All Paid ✓</p>
            ) : Object.keys(outstandingByCurrency).length === 1 && outstandingByCurrency["TRY"] ? (
              <p className="text-xl font-bold text-amber-700">TRY {outstandingByCurrency["TRY"].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            ) : (
              <div className="space-y-0.5">
                {Object.entries(outstandingByCurrency).map(([cur, amt]) => (
                  <p key={cur} className="text-base font-bold text-amber-700">{cur} {amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                ))}
                <p className="text-[10px] text-amber-500">≈ TRY {totalDueTRY.toLocaleString(undefined, { maximumFractionDigits: 0 })} total</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {/* Credit Balance Card */}
      {hasCreditBalance && (
        <Card className="bg-violet-50 border-violet-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-violet-600" />
                <p className="text-xs text-violet-700 font-semibold">Patient Credit Balance</p>
              </div>
            </div>
            {(["production", "test"] as const).map(scope => {
              const balances = Object.entries(creditByScopeCurrency[scope]).filter(([, value]) => value > 0.001);
              if (balances.length === 0) return null;
              return (
                <div key={scope} className="mt-2 rounded-md bg-white/60 px-2 py-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">{scope === "test" ? "Test scope credit" : "Available Patient Credit"}</p>
                  <div className="flex flex-wrap gap-3 mt-0.5">
                    {balances.map(([cur, bal]) => (
                      <div key={cur} className="flex items-center gap-2">
                        <span className="text-sm font-bold text-violet-700">{cur} {bal.toFixed(2)}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px] gap-1 border-rose-300 text-rose-700 hover:bg-rose-50"
                          onClick={() => setCreditPayoutTarget({ currency: cur, scope, available: bal })}
                        >
                          <ArrowDownLeft className="h-3 w-3" />Patient Credit Payout
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {creditOrigins.map((credit: any) => (
              <p key={credit.id} className="text-[10px] text-violet-500 mt-1">
                {credit.financialScope === "test" ? "Test scope · " : ""}Source invoice #{credit.originInvoiceId ?? credit.invoiceId ?? "—"} · {String(credit.originPaymentMethod ?? "payment").replace(/_/g, " ")} · {format(new Date(credit.createdAt), "MMM d, yyyy")}
              </p>
            ))}
            <p className="text-[10px] text-violet-500 mt-1">Available to apply manually to future invoices in the same currency.</p>
          </CardContent>
        </Card>
      )}

      {/* Invoices */}
      {invoicesPending ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          Finance is still loading
        </div>
      ) : !invoices || invoices.length === 0 ? (
        <EmptyState icon={DollarSign} label="No invoices yet" action="Create invoice" onAction={() => setShowAdd(true)} />
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => {
            const invCur = (inv as any).currency ?? "TRY";
            const invReversibleApplications = ((reversibleCreditApplications ?? []) as any[])
              .filter((application: any) => Number(application.invoiceId) === Number(inv.id));
            const snapshot = (inv as any).exchangeRateSnapshot;
            const isInverted = invCur !== "TRY" && snapshot != null && Number(snapshot) < 1;
            const remaining = Math.max(0, Number(inv.totalAmount) - Number(inv.paidAmount));
            return (
              <div key={inv.id} className="p-3 rounded-lg border bg-card">
                {/* Top row: invoice number + status badge + actions dropdown */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm font-mono">{inv.invoiceNumber}</p>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusColor[inv.status] ?? ""}`}>{inv.status}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(inv.issueDate), "MMM d, yyyy")}
                      {inv.dueDate ? ` · Due ${format(new Date(inv.dueDate), "MMM d")}` : ""}
                    </p>
                  </div>
                  {/* Actions dropdown — works on both mobile and desktop */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="h-7 w-7 shrink-0">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => exportInvoicePDF(inv, patient)}>
                        <FileText className="h-4 w-4 mr-2" />PDF Invoice
                      </DropdownMenuItem>
                      {inv.status === "paid" && (
                        <DropdownMenuItem onClick={() => { const url = `/api/invoices/${inv.id}/receipt`; const win = window.open(url, "_blank"); if (!win) toast.error("Popup blocked"); }}>
                          <FileText className="h-4 w-4 mr-2 text-emerald-600" />PDF Receipt
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => { setSendEmailInvoice(inv); setSendEmailIsUpdate(false); setSendEmailAttachPdf(true); setSendEmailNotifyPartner(false); }}>
                        <Mail className="h-4 w-4 mr-2 text-sky-600" />Send Invoice Email
                      </DropdownMenuItem>
                      {inv.status === "paid" && (
                        <DropdownMenuItem onClick={() => { setSendReceiptInvoice(inv); setReceiptNote(""); setReceiptAttachFile(null); }}>
                          <Mail className="h-4 w-4 mr-2 text-emerald-600" />Send Receipt Email
                        </DropdownMenuItem>
                      )}
                      {inv.status !== "cancelled" && (
                        <DropdownMenuItem onClick={() => setEditingInvoice(inv)}>
                          <Edit className="h-4 w-4 mr-2" />Edit Invoice
                        </DropdownMenuItem>
                      )}
                      {inv.status !== "paid" && inv.status !== "cancelled" && (
                        <DropdownMenuItem onClick={() => setPaymentInvoice(inv)}>
                          <Plus className="h-4 w-4 mr-2 text-blue-600" />Add Payment
                        </DropdownMenuItem>
                      )}
                      {inv.status !== "paid" && inv.status !== "cancelled" && (
                        <DropdownMenuItem onClick={() => { setMarkAsPaidInvoice(inv); setMarkAsPaidReceiptFile(null); }}>
                          <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" />Mark as Paid
                        </DropdownMenuItem>
                      )}
                      {creditInCurrency(invCur, (inv as any).financialScope ?? patientDefaultScope) > 0.001 && inv.status !== "paid" && inv.status !== "cancelled" && (
                        <DropdownMenuItem onClick={() => setApplyCreditInvoice(inv)}>
                          <Wallet className="h-4 w-4 mr-2 text-violet-600" />Apply Credit
                        </DropdownMenuItem>
                      )}
                      {Object.entries(creditByScopeCurrency[((inv as any).financialScope ?? patientDefaultScope) === "test" ? "test" : "production"])
                        .some(([currency, amount]) => currency !== invCur && amount > 0.001) && inv.status !== "paid" && inv.status !== "cancelled" && (
                        <DropdownMenuItem onClick={() => setConvertCreditInvoice(inv)}>
                          <Wallet className="h-4 w-4 mr-2 text-indigo-600" />Convert &amp; Apply Credit
                        </DropdownMenuItem>
                      )}
                      {invReversibleApplications.length > 0 && (
                        <DropdownMenuItem onClick={() => setReverseCreditApplicationTarget({ invoice: inv, applications: invReversibleApplications })} className="text-amber-700 focus:text-amber-700">
                          <RefreshCw className="h-4 w-4 mr-2" />Reverse Applied Credit
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => setRefundInvoice(inv)} className="text-rose-600 focus:text-rose-600">
                        <ArrowDownLeft className="h-4 w-4 mr-2" />Refund
                      </DropdownMenuItem>
                      {isAdmin && inv.status !== "cancelled" && inv.status !== "paid" && (
                        <DropdownMenuItem onClick={() => { setCancelInvoiceTarget(inv); setCancelReason(""); }} className="text-orange-600 focus:text-orange-600">
                          <Ban className="h-4 w-4 mr-2" />Cancel Invoice
                        </DropdownMenuItem>
                      )}
                      {isAdmin && (
                        <DropdownMenuItem onClick={() => setDeleteInvoiceTarget(inv)} className="text-red-600 focus:text-red-600">
                          <Trash2 className="h-4 w-4 mr-2" />Delete Invoice
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Amounts row */}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  <span className="text-sm font-bold">{invCur} {Number(inv.totalAmount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  {Number(inv.paidAmount) > 0 && (
                    <span className="text-xs text-emerald-600">Paid: {invCur} {Number(inv.paidAmount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  )}
                  {inv.status !== "paid" && inv.status !== "cancelled" && remaining > 0.01 && (
                    <span className="text-xs text-amber-600">Rem: {invCur} {remaining.toFixed(2)}</span>
                  )}
                </div>

                {/* Rate info */}
                {invCur !== "TRY" && snapshot != null && (
                  isInverted
                    ? <p className="text-[10px] text-red-500 mt-1">⚠️ Rate snapshot inverted</p>
                    : <p className="text-[10px] text-muted-foreground mt-1">1 {invCur} = {Number(snapshot).toFixed(2)} TRY</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Credit Refund Receipts */}
      {((creditTxns ?? []) as any[]).filter((c: any) => c.type === "refund_deduction").length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground">Credit Refund Receipts</h4>
          <div className="space-y-2">
            {((creditTxns ?? []) as any[]).filter((c: any) => c.type === "refund_deduction").map((c: any) => {
              const amt = Math.abs(parseFloat(String(c.amount ?? 0)));
              const cur = c.currency ?? "TRY";
              const receiptNo = `RCR-${String(c.id).padStart(6, "0")}`;
              const refundDate = c.createdAt ? format(new Date(c.createdAt), "MMM d, yyyy") : "";
              return (
                <div key={c.id} className="p-3 rounded-lg border bg-card flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm font-mono">{receiptNo}</p>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Credit Refund</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{refundDate}</p>
                    {c.notes && <p className="text-xs text-muted-foreground truncate">{c.notes}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm text-amber-700">{cur} {amt.toLocaleString("en", { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="text-xs h-6 px-2"
                      onClick={() => exportCreditRefundPDF(c, patient)}>
                      <FileText className="h-3 w-3 mr-1" />PDF
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Transaction History */}
      {(() => {
        // Build unified timeline from payments, refunds, and credit transactions
        const txns: Array<{ id: string; date: Date; recordedAt?: Date; showRecordedAt?: boolean; type: string; label: string; amount: number; currency: string; sub: string; color: string; record?: any }> = [];

        // Payments. A void retains the original receipt of money as historical context,
        // then adds a later void event. Financial totals remain server-side active-only.
        ((allPayments ?? []) as any[]).forEach((p: any) => {
          const isVoided = p.status === "voided";
          const receivedDate = new Date(p.receivedAt ?? p.createdAt);
          const recordedDate = new Date(p.createdAt);
          const showRecordedAt = !!p.receivedAt && Math.abs(recordedDate.getTime() - receivedDate.getTime()) > 5 * 60 * 1000;
          txns.push({
            id: `pay-${p.id}`,
            date: receivedDate,
            recordedAt: recordedDate,
            showRecordedAt,
            type: "payment",
            label: isVoided ? "Payment Received (Voided)" : "Payment Received",
            amount: parseFloat(String(p.amount ?? 0)),
            currency: p.currency ?? "TRY",
            sub: `${(p.method ?? "").replace(/_/g, " ")}${p.recordedByName ? ` · Recorded by ${p.recordedByName}` : ""}${p.notes ? ` · ${p.notes}` : ""}${isVoided ? " · No longer contributes to financial totals" : ""}`,
            color: isVoided ? "amber" : "emerald",
          });
          if (isVoided && p.voidedAt) {
            txns.push({
              id: `void-${p.id}`,
              date: new Date(p.voidedAt),
              type: "payment_voided",
              label: "Payment Voided",
              amount: parseFloat(String(p.amount ?? 0)),
              currency: p.currency ?? "TRY",
              sub: `Voided by ${p.voidedByName ?? "Unknown user"}${p.voidReason ? ` · Reason: ${p.voidReason}` : ""}`,
              color: "rose",
            });
          }
        });

        // Invoice refunds
        ((refundsList ?? []) as any[]).forEach((r: any) => {
          txns.push({
            id: `ref-${r.id}`,
            date: new Date(r.createdAt),
            type: "refund",
            label: "Invoice Refund",
            amount: parseFloat(String(r.amount ?? 0)),
            currency: r.currency ?? "TRY",
            sub: `${(r.method ?? "").replace(/_/g, " ")}${r.notes ? ` · ${r.notes}` : ""}`,
            color: "rose",
          });
        });

        // Credit transactions
        ((creditTxns ?? []) as any[]).forEach((c: any) => {
          // Payout and reversal headers below summarize their FIFO allocations once.
          if (c.type === "credit_payout" || c.type === "applied_credit_reversal") return;
          const amt = parseFloat(String(c.amount ?? 0));
          const isPositive = amt >= 0;
          const typeLabel: Record<string, string> = {
            overpayment: "Overpayment Credit",
            applied_to_invoice: "Credit Applied to Invoice",
            refund_deduction: "Credit Refund",
            manual_adjustment: "Credit Adjustment",
          };
          txns.push({
            id: `crd-${c.id}`,
            date: new Date(c.createdAt),
            type: c.type ?? "credit",
            label: typeLabel[c.type] ?? "Credit Transaction",
            amount: Math.abs(amt),
            currency: c.currency ?? "TRY",
            sub: c.notes ?? "",
            color: isPositive ? "violet" : "amber",
          });
        });

        // One clear event for each completed full application reversal.
        ((creditApplicationHistory ?? []) as any[]).filter((application: any) => application.status === "reversed" && application.reversal).forEach((application: any) => {
          txns.push({
            id: `crd-reversal-${application.id}`,
            date: new Date(application.reversal.createdAt ?? application.reversedAt),
            type: "applied_credit_reversal",
            label: "Applied Credit Reversed",
            amount: parseFloat(String(application.reversal.restoredSourceAmount ?? application.sourceCreditAmount ?? 0)),
            currency: application.sourceCurrency ?? "TRY",
            sub: `Invoice ${application.targetInvoiceCurrency} ${Number(application.finalSettlementAmount ?? 0).toFixed(2)} reopened${application.reversal.reason ? ` · ${application.reversal.reason}` : ""}`,
            color: "violet",
          });
        });

        // A payout is separate from invoice Refund and never carries invoice settlement data.
        ((creditPayouts ?? []) as any[]).forEach((payout: any) => {
          txns.push({
            id: `credit-payout-${payout.id}`,
            date: new Date(payout.payoutDate ?? payout.createdAt),
            type: "patient_credit_payout",
            label: "Patient Credit Payout",
            amount: parseFloat(String(payout.payoutAmount ?? 0)),
            currency: payout.payoutCurrency ?? "TRY",
            sub: `${payout.sourceCurrency} ${Number(payout.sourceCreditAmount ?? 0).toFixed(2)} · ${(payout.method ?? "").replace(/_/g, " ")}${payout.conversionRateToPayout ? ` · FX ${payout.conversionRateToPayout}` : ""}${payout.reference ? ` · ${payout.reference}` : ""}`,
            color: "rose",
            record: payout,
          });
        });

        // Non-cash closure for a residual below one source-currency minor unit.
        // This is intentionally distinct from both payment receipts and credit debits.
        ((fxRoundingAdjustments ?? []) as any[]).forEach((adjustment: any) => {
          txns.push({
            id: `fxr-${adjustment.id}`,
            date: new Date(adjustment.createdAt),
            type: "fx_rounding_adjustment",
            label: "FX Rounding Adjustment",
            amount: parseFloat(String(adjustment.amount ?? 0)),
            currency: adjustment.currency ?? "TRY",
            sub: `${adjustment.invoiceNumber ?? `Invoice #${adjustment.invoiceId}`} · ${adjustment.reason ?? "Cross-currency precision closure"}${adjustment.sourceCreditCurrency ? ` · ${adjustment.sourceCreditCurrency} ${adjustment.sourceCreditAmount ?? ""} at FX ${adjustment.conversionRate ?? ""}` : ""}`,
            color: "blue",
          });
        });

        // Sort by date descending
        txns.sort((a, b) => b.date.getTime() - a.date.getTime());

        if (txns.length === 0) return null;

        const colorMap: Record<string, string> = {
          emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
          rose: "bg-rose-50 border-rose-200 text-rose-700",
          violet: "bg-violet-50 border-violet-200 text-violet-700",
          amber: "bg-amber-50 border-amber-200 text-amber-700",
          blue: "bg-blue-50 border-blue-200 text-blue-700",
        };
        const dotMap: Record<string, string> = {
          emerald: "bg-emerald-400",
          rose: "bg-rose-400",
          violet: "bg-violet-400",
          amber: "bg-amber-400",
          blue: "bg-blue-400",
        };
        const signMap: Record<string, string> = {
          payment: "+",
          payment_voided: "",
          refund: "-",
          overpayment: "+",
          applied_to_invoice: "-",
          applied_credit_reversal: "+",
          patient_credit_payout: "-",
          refund_deduction: "-",
          manual_adjustment: "",
          fx_rounding_adjustment: "",
        };

        return (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">Transaction History</h4>
            <div className="space-y-1.5">
              {txns.map(tx => (
                <div key={tx.id} className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs ${colorMap[tx.color] ?? ""}`}>
                  <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${dotMap[tx.color] ?? ""}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{tx.label}</p>
                    {tx.sub && <p className="text-[11px] opacity-70 truncate capitalize">{tx.sub}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold">{signMap[tx.type] ?? ""}{tx.currency} {tx.amount.toFixed(2)}</p>
                    <p className="text-[10px] opacity-60">{tx.type === "payment" ? `Received: ${format(tx.date, "MMM d, yyyy HH:mm")}` : format(tx.date, "MMM d, yyyy HH:mm")}</p>
                    {tx.showRecordedAt && tx.recordedAt && <p className="text-[10px] opacity-60">Recorded in Fertiliv: {format(tx.recordedAt, "MMM d, yyyy HH:mm")}</p>}
                    {tx.type === "patient_credit_payout" && tx.record && <Button variant="ghost" size="sm" className="mt-1 h-6 px-1.5 text-[10px]" onClick={() => openPatientCreditPayoutReceipt(tx.record.id)}><FileText className="mr-1 h-3 w-3" />Receipt</Button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Offers */}
      {offers && offers.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground">Available Offers</h4>
          {offers.map(offer => (
            <div key={offer.id} className="p-3 rounded-lg border border-dashed border-primary/40 bg-primary/5">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">{offer.code ?? `Offer #${offer.id}`}</p>
                <span className="text-sm font-bold text-primary">
                  {offer.discountType === "percentage" ? `${offer.discountValue}% off` : `$${offer.discountValue} off`}
                </span>
              </div>
              {offer.description && <p className="text-xs text-muted-foreground mt-0.5">{offer.description}</p>}
            </div>
          ))}
        </div>
      )}

      <CreateInvoiceModal
        open={showAdd}
        onClose={() => { setShowAdd(false); setPreSelectedItems(null); }}
        patientId={patientId}
        onSuccess={(createdInvoice: any, openSendAfterSave?: boolean, notifyPartnerAfterSave?: boolean) => {
          refetch();
          setShowAdd(false);
          setPreSelectedItems(null);
          if (openSendAfterSave && createdInvoice) {
            setSendEmailAttachPdf(true);
            setSendEmailNotifyPartner(Boolean(notifyPartnerAfterSave));
            setSendEmailIsUpdate(false);
            setSendEmailInvoice(createdInvoice);
          }
        }}
        preSelectedItems={preSelectedItems}
      />
      {editingInvoice && (
        <EditInvoiceModal
          open={!!editingInvoice}
          invoice={editingInvoice}
          onClose={() => setEditingInvoice(null)}
          onSuccess={async ({ openSendAfterSave, recordPaymentAfterSave }) => {
            let persistedInvoice: any | undefined;
            try {
              const refreshed = await refetch();
              persistedInvoice = refreshed.data?.find((candidate: any) => Number(candidate.id) === Number(editingInvoice.id));
            } catch {
              // The invoice save has already succeeded. Do not open a payment form from stale draft facts.
            }
            setEditingInvoice(null);
            if (openSendAfterSave && persistedInvoice) {
              setSendEmailAttachPdf(true);
              setSendEmailNotifyPartner(false);
              setSendEmailIsUpdate(true);
              setSendEmailInvoice(persistedInvoice);
            }
            if (recordPaymentAfterSave) {
              if (persistedInvoice) {
                setPaymentInvoice(persistedInvoice);
              } else {
                toast.error("Invoice was saved, but could not be reloaded for payment. Reopen Add Payment from the invoice actions.");
              }
            }
          }}
        />
      )}
      {paymentInvoice && (
        <RecordPaymentModal
          open={!!paymentInvoice}
          invoice={paymentInvoice}
          patientId={patientId}
          onClose={() => setPaymentInvoice(null)}
          onSuccess={() => { refetchAll(); setPaymentInvoice(null); }}
        />
      )}
      {refundInvoice && (
        <RefundDialog
          open={!!refundInvoice}
          invoice={refundInvoice}
          patientId={patientId}
          onClose={() => setRefundInvoice(null)}
          onSuccess={() => { refetchAll(); setRefundInvoice(null); }}
        />
      )}
      {applyCreditInvoice && (
        <ApplyCreditDialog
          open={!!applyCreditInvoice}
          invoice={applyCreditInvoice}
          patientId={patientId}
          availableCredit={creditInCurrency(applyCreditInvoice.currency ?? "TRY", (applyCreditInvoice as any).financialScope ?? patientDefaultScope)}
          onClose={() => setApplyCreditInvoice(null)}
          onSuccess={() => { refetchAll(); setApplyCreditInvoice(null); }}
        />
      )}
      {convertCreditInvoice && (
        <ConvertCreditDialog
          open={!!convertCreditInvoice}
          invoice={convertCreditInvoice}
          patientId={patientId}
          availableCredits={creditByScopeCurrency[((convertCreditInvoice as any).financialScope ?? patientDefaultScope) === "test" ? "test" : "production"]}
          onClose={() => setConvertCreditInvoice(null)}
          onSuccess={() => { refetchAll(); setConvertCreditInvoice(null); }}
        />
      )}
      {reverseCreditApplicationTarget && (
        <ReverseAppliedCreditDialog
          open={!!reverseCreditApplicationTarget}
          patientId={patientId}
          invoice={reverseCreditApplicationTarget.invoice}
          applications={reverseCreditApplicationTarget.applications}
          onClose={() => setReverseCreditApplicationTarget(null)}
          onSuccess={() => { refetchAll(); setReverseCreditApplicationTarget(null); }}
        />
      )}
      {creditPayoutTarget && (
        <PatientCreditPayoutDialog
          open={!!creditPayoutTarget}
          patientId={patientId}
          sourceCurrency={creditPayoutTarget.currency}
          financialScope={creditPayoutTarget.scope}
          availableCredit={creditPayoutTarget.available}
          onClose={() => setCreditPayoutTarget(null)}
          onSuccess={() => { refetchAll(); setCreditPayoutTarget(null); }}
        />
      )}

      {/* Mark as Paid Dialog */}
      {markAsPaidInvoice && (
        <Dialog open={!!markAsPaidInvoice} onOpenChange={(o) => { if (!o) { setMarkAsPaidInvoice(null); setMarkAsPaidReceiptFile(null); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Mark Invoice as Paid
              </DialogTitle>
              <DialogDescription>
                Mark <strong>{markAsPaidInvoice.invoiceNumber}</strong> as fully paid.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Invoice:</span> <strong>{markAsPaidInvoice.invoiceNumber}</strong></p>
                <p><span className="text-muted-foreground">Amount:</span> <strong>{(markAsPaidInvoice as any).currency ?? "TRY"} {Number(markAsPaidInvoice.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Upload external receipt <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <p className="text-xs text-muted-foreground">If you have a bank transfer confirmation, POS receipt, or any other payment document, you can attach it here. It will be included in the payment confirmation email sent to the patient.</p>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    id="mark-paid-receipt-upload"
                    className="hidden"
                    onChange={e => setMarkAsPaidReceiptFile(e.target.files?.[0] ?? null)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => document.getElementById('mark-paid-receipt-upload')?.click()}>
                    <Paperclip className="h-3.5 w-3.5" />
                    {markAsPaidReceiptFile ? 'Change file' : 'Attach receipt'}
                  </Button>
                  {markAsPaidReceiptFile && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                      <FileText className="h-3 w-3" />
                      <span className="truncate max-w-[180px]">{markAsPaidReceiptFile.name}</span>
                      <button type="button" className="ml-1 text-muted-foreground hover:text-destructive" onClick={() => setMarkAsPaidReceiptFile(null)}>×</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setMarkAsPaidInvoice(null); setMarkAsPaidReceiptFile(null); }}>Cancel</Button>
              <Button
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={updateStatus.isPending || uploadInvoiceReceipt.isPending}
                onClick={async () => {
                  try {
                    let receiptKey: string | undefined;
                    if (markAsPaidReceiptFile) {
                      const base64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve((reader.result as string).split(',')[1]);
                        reader.onerror = reject;
                        reader.readAsDataURL(markAsPaidReceiptFile);
                      });
                      const result = await uploadInvoiceReceipt.mutateAsync({
                        invoiceId: markAsPaidInvoice.id,
                        fileBase64: base64,
                        fileName: markAsPaidReceiptFile.name,
                        mimeType: markAsPaidReceiptFile.type || 'application/pdf',
                      });
                      receiptKey = result.key;
                    }
                    await updateStatus.mutateAsync({
                      id: markAsPaidInvoice.id,
                      status: 'paid',
                      paidAmount: markAsPaidInvoice.totalAmount,
                      paymentMethod: 'cash',
                      patientId,
                      externalReceiptKey: receiptKey,
                    });
                    toast.success('Invoice marked as paid');
                    setMarkAsPaidInvoice(null);
                    setMarkAsPaidReceiptFile(null);
                    refetch();
                  } catch (e: any) {
                    toast.error(parseTrpcError(e) || 'Failed to mark as paid');
                  }
                }}>
                {(updateStatus.isPending || uploadInvoiceReceipt.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {(updateStatus.isPending || uploadInvoiceReceipt.isPending) ? 'Processing...' : 'Confirm Paid'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Cancel Invoice Dialog */}
      {cancelInvoiceTarget && (
        <Dialog open={!!cancelInvoiceTarget} onOpenChange={(o) => { if (!o) { setCancelInvoiceTarget(null); setCancelReason(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-orange-600" />
                Cancel Invoice
              </DialogTitle>
              <DialogDescription>
                Cancel invoice <strong>{cancelInvoiceTarget.invoiceNumber}</strong>. This will mark it as cancelled and make it read-only.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Invoice:</span> <strong>{cancelInvoiceTarget.invoiceNumber}</strong></p>
                <p><span className="text-muted-foreground">Amount:</span> <strong>{(cancelInvoiceTarget as any).currency ?? "TRY"} {Number(cancelInvoiceTarget.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></p>
                <p><span className="text-muted-foreground">Status:</span> <strong className="capitalize">{cancelInvoiceTarget.status}</strong></p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Cancellation reason <span className="text-muted-foreground">(optional)</span></label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={3}
                  placeholder="e.g. Patient requested cancellation, duplicate invoice..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setCancelInvoiceTarget(null); setCancelReason(""); }}>Back</Button>
              <Button
                className="gap-2 bg-orange-600 hover:bg-orange-700 text-white"
                disabled={cancelInvoiceMut.isPending}
                onClick={() => cancelInvoiceMut.mutate({ id: cancelInvoiceTarget.id, reason: cancelReason || undefined })}>
                {cancelInvoiceMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                {cancelInvoiceMut.isPending ? "Cancelling..." : "Confirm Cancel"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Invoice Dialog */}
      {deleteInvoiceTarget && (
        <Dialog open={!!deleteInvoiceTarget} onOpenChange={(o) => { if (!o) setDeleteInvoiceTarget(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-600" />
                Delete Invoice
              </DialogTitle>
              <DialogDescription>
                Permanently delete invoice <strong>{deleteInvoiceTarget.invoiceNumber}</strong>. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm space-y-1">
              <p className="font-medium text-red-700">Warning: This will permanently remove the invoice and all its line items from the database.</p>
              <p><span className="text-muted-foreground">Invoice:</span> <strong>{deleteInvoiceTarget.invoiceNumber}</strong></p>
              <p><span className="text-muted-foreground">Amount:</span> <strong>{(deleteInvoiceTarget as any).currency ?? "TRY"} {Number(deleteInvoiceTarget.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteInvoiceTarget(null)}>Back</Button>
              <Button
                variant="destructive"
                className="gap-2"
                disabled={deleteInvoiceMut.isPending}
                onClick={() => deleteInvoiceMut.mutate({ id: deleteInvoiceTarget.id })}>
                {deleteInvoiceMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleteInvoiceMut.isPending ? "Deleting..." : "Permanently Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Send Receipt Dialog */}
      {sendReceiptInvoice && (
        <Dialog open={!!sendReceiptInvoice} onOpenChange={(o) => { if (!o) { clearReceiptRecipientDraft(); setSendReceiptInvoice(null); setReceiptNote(""); setReceiptAttachFile(null); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-emerald-600" />
                Send Official Receipt
              </DialogTitle>
              <DialogDescription>
                Send receipt <strong>REC-{sendReceiptInvoice.invoiceNumber}</strong> to the saved patient email or one manual recipient.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Invoice:</span> <strong>{sendReceiptInvoice.invoiceNumber}</strong></p>
                <p><span className="text-muted-foreground">Amount Paid:</span> <strong>{(sendReceiptInvoice as any).currency ?? "USD"} {Number(sendReceiptInvoice.paidAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></p>
              </div>
              <div className="space-y-2">
                <label htmlFor="receipt-manual-recipient" className="text-sm font-medium">Additional email <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Input
                  id="receipt-manual-recipient"
                  type="email"
                  value={receiptRecipientDraft.manualEmail}
                  onChange={event => setReceiptRecipientDraft({ manualEmail: event.target.value })}
                  placeholder={patient?.email ? "name@example.com" : "Enter a recipient email"}
                  aria-invalid={receiptManualEmailInvalid}
                />
                <p className="text-xs text-muted-foreground">{patient?.email ? `The saved patient email (${patient.email}) is included. Add one more address if needed.` : "No saved patient email. Enter one address to send this receipt without changing the patient profile."}</p>
                {receiptManualEmailInvalid && <p className="text-xs text-destructive">Enter a valid email address.</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Receipt Note <span className="text-muted-foreground font-normal">(optional)</span></label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={3}
                  placeholder="Add a custom note to include in this receipt (e.g. payment confirmation details, special instructions)..."
                  value={receiptNote}
                  onChange={e => setReceiptNote(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Additional Attachment <span className="text-muted-foreground font-normal">(optional, max 5 MB)</span></label>
                {receiptAttachFile ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                      <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{receiptAttachFile.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{(receiptAttachFile.size / 1024 / 1024).toFixed(2)} MB</span>
                      <button type="button" className="text-muted-foreground hover:text-destructive ml-1" onClick={() => { setReceiptAttachFile(null); setReceiptAttachProgress(0); setReceiptAttachError(null); }}>×</button>
                    </div>
                    {receiptAttachProgress > 0 && receiptAttachProgress < 100 && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Uploading...</span>
                          <span>{receiptAttachProgress}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-emerald-500 transition-all duration-200" style={{ width: `${receiptAttachProgress}%` }} />
                        </div>
                      </div>
                    )}
                    {receiptAttachProgress === 100 && (
                      <p className="text-xs text-emerald-600 flex items-center gap-1">✓ File ready to send</p>
                    )}
                    {receiptAttachError && <p className="text-xs text-destructive">{receiptAttachError}</p>}
                  </div>
                ) : (
                  <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/30">
                    <Paperclip className="h-3.5 w-3.5" />
                    <span>Attach a file (PDF, image, etc.)</span>
                    <input type="file" className="hidden" onChange={e => {
                      const f = e.target.files?.[0] ?? null;
                      if (f && f.size > 5 * 1024 * 1024) {
                        setReceiptAttachError("File exceeds 5 MB limit. Please choose a smaller file.");
                        setReceiptAttachFile(null);
                        return;
                      }
                      setReceiptAttachError(null);
                      setReceiptAttachProgress(0);
                      setReceiptAttachFile(f);
                    }} />
                  </label>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { clearReceiptRecipientDraft(); setSendReceiptInvoice(null); setReceiptNote(""); setReceiptAttachFile(null); }}>Cancel</Button>
              <Button
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={sendReceiptEmailMut.isPending || receiptManualEmailInvalid || (!patient?.email && !receiptManualEmail) || (receiptAttachProgress > 0 && receiptAttachProgress < 100)}
                onClick={async () => {
                  let attachmentKey: string | undefined;
                  if (receiptAttachFile) {
                    try {
                      setReceiptAttachError(null);
                      setReceiptAttachProgress(10);
                      // Use multipart upload to avoid base64 body size limits
                      const formData = new FormData();
                      formData.append("file", receiptAttachFile, receiptAttachFile.name);
                      setReceiptAttachProgress(40);
                      const uploadRes = await fetch("/api/invoices/upload-receipt-attachment", {
                        method: "POST",
                        body: formData,
                      });
                      setReceiptAttachProgress(80);
                      if (!uploadRes.ok) {
                        const errText = await uploadRes.text();
                        throw new Error(errText);
                      }
                      const uploadData = await uploadRes.json();
                      attachmentKey = uploadData.key;
                      setReceiptAttachProgress(100);
                    } catch (err) {
                      setReceiptAttachError("Failed to upload attachment. The receipt will be sent without it.");
                      setReceiptAttachProgress(0);
                    }
                  }
                  sendReceiptEmailMut.mutate({
                    invoiceId: sendReceiptInvoice.id,
                    receiptNote: receiptNote.trim() || undefined,
                    attachmentKey,
                    manualEmail: receiptManualEmail || undefined,
                  });
                }}>
                <Send className="h-4 w-4" />
                {sendReceiptEmailMut.isPending ? "Sending..." : "Send Receipt"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Send Email Dialog */}
      {sendEmailInvoice && (
        <Dialog open={!!sendEmailInvoice} onOpenChange={(o) => { if (!o) { clearInvoiceRecipientDraft(); setSendEmailInvoice(null); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-sky-600" />
                Send Invoice Email
              </DialogTitle>
              <DialogDescription>
                Send invoice <strong>{sendEmailInvoice.invoiceNumber}</strong> to the saved patient email or one manual recipient.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Invoice:</span> <strong>{sendEmailInvoice.invoiceNumber}</strong></p>
                <p><span className="text-muted-foreground">Amount:</span> <strong>{(sendEmailInvoice as any).currency ?? "TRY"} {Number(sendEmailInvoice.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></p>
                <p><span className="text-muted-foreground">Status:</span> <span className="capitalize">{sendEmailInvoice.status}</span></p>
              </div>
              <div className="space-y-2">
                <label htmlFor="invoice-manual-recipient" className="text-sm font-medium">Additional email <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Input
                  id="invoice-manual-recipient"
                  type="email"
                  value={invoiceRecipientDraft.manualEmail}
                  onChange={event => setInvoiceRecipientDraft({ manualEmail: event.target.value })}
                  placeholder={patient?.email ? "name@example.com" : "Enter a recipient email"}
                  aria-invalid={invoiceManualEmailInvalid}
                />
                <p className="text-xs text-muted-foreground">{patient?.email ? `The saved patient email (${patient.email}) is included. Add one more address if needed.` : "No saved patient email. Enter one address to send this invoice without changing the patient profile."}</p>
                {invoiceManualEmailInvalid && <p className="text-xs text-destructive">Enter a valid email address.</p>}
              </div>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" className="h-4 w-4 rounded" checked={sendEmailIsUpdate} onChange={e => setSendEmailIsUpdate(e.target.checked)} />
                  <span className="text-sm">Mark as <strong>Updated Invoice</strong> (not new)</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" className="h-4 w-4 rounded" checked={sendEmailAttachPdf} onChange={e => setSendEmailAttachPdf(e.target.checked)} />
                  <span className="text-sm flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" /> Attach PDF to email</span>
                </label>
                {patient?.partnerId && (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 rounded" checked={sendEmailNotifyPartner} onChange={e => setSendEmailNotifyPartner(e.target.checked)} />
                    <span className="text-sm">Also send to linked partner</span>
                  </label>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded px-3 py-2">
                <span>💡</span>
                <span>You can preview the PDF first by clicking the <strong>PDF</strong> button on the invoice card.</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { clearInvoiceRecipientDraft(); setSendEmailInvoice(null); }}>Cancel</Button>
              <Button
                className="gap-2 bg-sky-600 hover:bg-sky-700 text-white"
                disabled={sendInvoiceEmailMut.isPending || invoiceManualEmailInvalid || (!patient?.email && !invoiceManualEmail)}
                onClick={() => sendInvoiceEmailMut.mutate({
                  invoiceId: sendEmailInvoice.id,
                  isUpdate: sendEmailIsUpdate,
                  attachPdf: sendEmailAttachPdf,
                  notifyPartner: sendEmailNotifyPartner,
                  manualEmail: invoiceManualEmail || undefined,
                })}>
                <Send className="h-4 w-4" />
                {sendInvoiceEmailMut.isPending ? "Sending..." : "Send Email"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}


// ─── Lab Tab ──────────────────────────────────────────────────────────────────
function LabTab({ patientId }: { patientId: number }) {
  const { data: labOrders, refetch } = trpc.lab.orders.useQuery({ patientId });
  const { data: results } = trpc.lab.resultsByPatient.useQuery({ patientId });
  const [showOrder, setShowOrder] = useState(false);

  const statusColor: Record<string, string> = {
    ordered: "bg-blue-100 text-blue-700",
    sample_collected: "bg-yellow-100 text-yellow-700",
    processing: "bg-orange-100 text-orange-700",
    completed: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-gray-100 text-gray-500",
  };

  const flagColor: Record<string, string> = {
    normal: "text-emerald-600",
    low: "text-blue-600",
    high: "text-red-600",
    critical: "text-red-700 font-bold",
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Lab & Radiology</h3>
        <Button size="sm" onClick={() => setShowOrder(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />New Order
        </Button>
      </div>

      {/* Orders */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">Orders</h4>
        {!labOrders || labOrders.length === 0 ? (
          <EmptySection label="No lab orders" />
        ) : (
          <div className="space-y-2">
            {labOrders.map(order => (
              <div key={order.id} className="p-3 rounded-lg border bg-card flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{order.testName}</p>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusColor[order.status] ?? ""}`}>
                      {order.status?.replace(/_/g, " ")}
                    </span>
                    {order.priority === "urgent" && (
                      <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">URGENT</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {order.orderNumber} · {order.category} · {format(new Date(order.orderedDate), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {results && results.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground">Results</h4>
          <div className="space-y-2">
            {results.map(r => (
              <LabResultCard key={r.id} r={r} patientId={patientId} flagColor={flagColor} />
            ))}
          </div>
        </div>
      )}

      <LabOrderModal open={showOrder} onClose={() => setShowOrder(false)} patientId={patientId} onSuccess={() => { refetch(); setShowOrder(false); }} />

      {/* Document Translations */}
      <DocumentTranslationsSection patientId={patientId} />
    </div>
  );
}

// ─── Lab Result Card (with Translate button) ──────────────────────────────────
function LabResultCard({ r, patientId, flagColor }: { r: any; patientId: number; flagColor: Record<string, string> }) {
  const [showTranslate, setShowTranslate] = useState(false);
  const [pdfPassword, setPdfPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [translating, setTranslating] = useState(false);
  const createTranslation = trpc.translations.create.useMutation();
  const translateDoc = trpc.translations.translate.useMutation({
    onSuccess: () => { toast.success("Translation saved to Document Translations section"); setShowTranslate(false); setTranslating(false); },
    onError: (e: any) => { toast.error(e.message ?? "Translation failed"); setTranslating(false); },
  });

  const handleTranslate = async () => {
    if (!r.resultFileUrl) return;
    setTranslating(true);
    try {
      const rec = await createTranslation.mutateAsync({
        patientId,
        originalFileName: r.parameter || r.testName || "Lab Result",
        originalLanguage: "tr",
        targetLanguage: "en",
        originalFileUrl: r.resultFileUrl,
      });
      await translateDoc.mutateAsync({
        id: rec.id,
        patientId,
        fileUrl: r.resultFileUrl,
        pdfPassword: pdfPassword || undefined,
        targetLanguage: "en",
      });
    } catch {
      setTranslating(false);
    }
  };

  // Detect if this is a freetext result (no real value) or structured
  const isFreetext = !r.value || r.value === "See attached file" || r.parameter === "Report";

  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {!isFreetext && <p className="font-medium text-sm">{r.parameter}</p>}
          <p className="text-xs text-muted-foreground">{r.testName} · {r.orderNumber}</p>
        </div>
        {!isFreetext && (
          <div className="text-right shrink-0">
            <p className={`font-bold text-sm ${flagColor[r.flag ?? "normal"] ?? ""}`}>
              {r.value} {r.unit}
            </p>
            {r.referenceRange && (
              <p className="text-xs text-muted-foreground">Ref: {r.referenceRange}</p>
            )}
          </div>
        )}
      </div>
      {r.interpretation && <p className="text-xs text-muted-foreground mt-1.5">{r.interpretation}</p>}
      {r.resultFileUrl && (
        <div className="mt-2 flex items-center gap-2">
          <a href={r.resultFileUrl} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-blue-500 underline flex-1 truncate">View attached file</a>
          <Button size="sm" variant="outline" className="text-xs h-6 px-2 gap-1 shrink-0"
            onClick={() => setShowTranslate(v => !v)}>
            <Languages className="h-3 w-3" />Translate
          </Button>
        </div>
      )}
      {showTranslate && r.resultFileUrl && (
        <div className="mt-2 p-2 border rounded bg-muted/20 space-y-2">
          <p className="text-[10px] text-muted-foreground">Translate this file to English using AI. Result will be saved in Document Translations.</p>
          <div className="relative">
            <Input type={showPassword ? "text" : "password"} value={pdfPassword}
              onChange={e => setPdfPassword(e.target.value)}
              placeholder="PDF password (if protected)" className="text-xs h-7 pr-8" />
            <button type="button" onClick={() => setShowPassword(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Eye className="h-3 w-3" />
            </button>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" className="text-xs h-6" onClick={() => setShowTranslate(false)}>Cancel</Button>
            <Button size="sm" className="text-xs h-6 gap-1" onClick={handleTranslate}
              disabled={translating || translateDoc.isPending}>
              {(translating || translateDoc.isPending) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3" />}
              Translate
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Document Translations Section ──────────────────────────────────────────
function DocumentTranslationsSection({ patientId }: { patientId: number }) {
  const { data: translations, refetch } = trpc.translations.listByPatient.useQuery({ patientId });
  const createTranslation = trpc.translations.create.useMutation();
  const translateDoc = trpc.translations.translate.useMutation({
    onSuccess: () => { toast.success("Translation complete"); refetch(); },
    onError: (e: any) => toast.error(e.message ?? "Translation failed"),
  });
  const deleteTranslation = trpc.translations.delete.useMutation({
    onSuccess: () => { toast.success("Deleted"); refetch(); },
  });

  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [pdfPassword, setPdfPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleTranslate = async () => {
    if (!file && !fileUrl) return toast.error("Please upload a file or paste a URL");
    setUploading(true);
    try {
      // Create a translation record first
      const rec = await createTranslation.mutateAsync({
        patientId,
        originalFileName: file?.name ?? "document",
        originalLanguage: "tr",
        targetLanguage: "en",
        originalFileUrl: fileUrl || undefined,
      });

      if (file) {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(",")[1];
          await translateDoc.mutateAsync({
            id: rec.id,
            patientId,
            fileBase64: base64,
            fileName: file.name,
            mimeType: file.type,
            pdfPassword: pdfPassword || undefined,
            targetLanguage: "en",
          });
          setUploading(false);
          setShowUpload(false);
          setFile(null);
          setFileUrl("");
          setPdfPassword("");
        };
        reader.readAsDataURL(file);
      } else {
        await translateDoc.mutateAsync({
          id: rec.id,
          patientId,
          fileUrl,
          pdfPassword: pdfPassword || undefined,
          targetLanguage: "en",
        });
        setUploading(false);
        setShowUpload(false);
        setFile(null);
        setFileUrl("");
        setPdfPassword("");
      }
    } catch {
      setUploading(false);
    }
  };

  const viewedTranslation = translations?.find(t => t.id === viewId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
          <Languages className="h-3.5 w-3.5" />Document Translations
        </h4>
        <Button size="sm" variant="outline" onClick={() => setShowUpload(v => !v)} className="gap-1.5 text-xs h-7">
          <Globe className="h-3 w-3" />Translate Document
        </Button>
      </div>

      {showUpload && (
        <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
          <p className="text-xs text-muted-foreground">Upload a document (PDF, image) to translate to English using AI.</p>
          <div className="space-y-1.5">
            <Label className="text-xs">File (PDF / Image — max 16MB)</Label>
            <label className="cursor-pointer block">
              <div className="border border-dashed rounded px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors flex items-center gap-2">
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : "📎"}
                {file ? file.name : "Click to select file"}
              </div>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
                onChange={e => { setFile(e.target.files?.[0] ?? null); setFileUrl(""); }} />
            </label>
            <p className="text-[10px] text-muted-foreground">— or paste a URL —</p>
            <Input value={fileUrl} onChange={e => { setFileUrl(e.target.value); setFile(null); }}
              placeholder="https://..." className="text-xs h-7" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Lock className="h-3 w-3" />PDF Password (if protected)</Label>
            <div className="relative">
              <Input type={showPassword ? "text" : "password"} value={pdfPassword}
                onChange={e => setPdfPassword(e.target.value)}
                placeholder="Leave empty if not password-protected" className="text-xs h-7 pr-8" />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <Eye className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => { setShowUpload(false); setFile(null); setFileUrl(""); setPdfPassword(""); }}>Cancel</Button>
            <Button size="sm" className="text-xs h-7 gap-1" onClick={handleTranslate}
              disabled={uploading || translateDoc.isPending || (!file && !fileUrl)}>
              {(uploading || translateDoc.isPending) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3" />}
              Translate
            </Button>
          </div>
        </div>
      )}

      {translations && translations.length > 0 ? (
        <div className="space-y-2">
          {translations.map(t => (
            <div key={t.id} className="p-3 rounded-lg border bg-card">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.originalFileName ?? "Document"}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {t.originalLanguage?.toUpperCase() ?? "TR"} → EN ·
                    {fmtDate(t.createdAt)}
                  </p>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded mt-1 inline-block ${
                    t.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                    t.status === "processing" ? "bg-yellow-100 text-yellow-700" :
                    t.status === "failed" ? "bg-red-100 text-red-700" :
                    "bg-gray-100 text-gray-500"
                  }`}>{t.status}</span>
                </div>
                <div className="flex gap-1">
                  {t.status === "completed" && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewId(viewId === t.id ? null : t.id)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                    onClick={() => deleteTranslation.mutate({ id: t.id })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {viewId === t.id && t.translatedText && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Translation</p>
                  <div className="text-xs whitespace-pre-wrap bg-muted/30 rounded p-2 max-h-64 overflow-y-auto">{t.translatedText}</div>
                </div>
              )}
              {t.status === "failed" && t.errorMessage && (
                <p className="text-xs text-red-500 mt-1">{t.errorMessage}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptySection label="No document translations yet" />
      )}
    </div>
  );
}

// ─── Shared Helpers ───────────────────────────────────────────────────────────
function NoteField({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function Section({ title, count, icon: Icon, color, children }: any) {
  const colorMap: Record<string, string> = { blue: "text-blue-600", green: "text-green-600", red: "text-red-600" };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${colorMap[color] ?? ""}`} />
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function EmptySection({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground py-3 pl-2">{label}</p>;
}

function EmptyState({ icon: Icon, label, action, onAction }: { icon: React.ElementType; label: string; action: string; onAction: () => void }) {
  return (
    <div className="text-center py-10 space-y-3">
      <Icon className="h-10 w-10 text-muted-foreground/30 mx-auto" />
      <p className="text-sm text-muted-foreground">{label}</p>
      <Button variant="outline" size="sm" onClick={onAction}>{action}</Button>
    </div>
  );
}

const PREDEFINED_LAB_TESTS = [
  { label: "Follicle Monitoring Scan (Day 2)", category: "radiology" },
  { label: "Follicle Monitoring Scan (Day 8)", category: "radiology" },
  { label: "Follicle Monitoring Scan (Day 10)", category: "radiology" },
  { label: "Follicle Monitoring Scan (Day 12)", category: "radiology" },
  { label: "Follicle Monitoring Scan (Trigger Day)", category: "radiology" },
  { label: "Endometrial Thickness Scan", category: "radiology" },
  { label: "Antral Follicle Count (AFC)", category: "radiology" },
  { label: "Pelvic Ultrasound", category: "radiology" },
  { label: "Hysterosalpingography (HSG)", category: "radiology" },
  { label: "Hormonal Profile (FSH, LH, E2, AMH)", category: "lab" },
  { label: "Complete Blood Count (CBC)", category: "lab" },
  { label: "Thyroid Panel (TSH, T3, T4)", category: "lab" },
  { label: "Coagulation Profile", category: "lab" },
  { label: "Semen Analysis", category: "lab" },
  { label: "Sperm DNA Fragmentation", category: "lab" },
  { label: "Karyotype", category: "lab" },
  { label: "Hysteroscopy", category: "other" },
  { label: "Endometrial Biopsy", category: "pathology" },
  { label: "Custom / Other", category: "lab" },
];

function LabOrderModal({ open, onClose, patientId, onSuccess }: any) {
  const { data: doctors } = trpc.doctors.list.useQuery();
  const createOrder = trpc.lab.createOrder.useMutation({
    onSuccess: () => { toast.success("Lab order created"); onSuccess(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });
  const [form, setForm] = useState({ testName: "", category: "lab", priority: "routine", doctorId: "", notes: "" });
  const [customTestName, setCustomTestName] = useState("");
  useEffect(() => { if (!open) { setForm({ testName: "", category: "lab", priority: "routine", doctorId: "", notes: "" }); setCustomTestName(""); } }, [open]);
  const finalTestName = form.testName === "Custom / Other" ? customTestName : form.testName;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>New Lab Order</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Test Name *</Label>
            <Select value={form.testName} onValueChange={v => {
              const found = PREDEFINED_LAB_TESTS.find(t => t.label === v);
              setForm(f => ({ ...f, testName: v, category: found?.category ?? f.category }));
            }}>
              <SelectTrigger><SelectValue placeholder="Select test..." /></SelectTrigger>
              <SelectContent className="max-h-64">
                {PREDEFINED_LAB_TESTS.map(t => (
                  <SelectItem key={t.label} value={t.label}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.testName === "Custom / Other" && (
              <Input value={customTestName} onChange={e => setCustomTestName(e.target.value)}
                placeholder="Enter test name..." className="mt-1" />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lab">Lab</SelectItem>
                <SelectItem value="radiology">Radiology</SelectItem>
                <SelectItem value="pathology">Pathology</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="stat">STAT</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ordering Doctor</Label>
            <Select value={form.doctorId} onValueChange={v => setForm(f => ({ ...f, doctorId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
              <SelectContent>
                {doctors?.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => createOrder.mutate({ patientId, testName: finalTestName, category: form.category as any, priority: form.priority as any, doctorId: form.doctorId ? parseInt(form.doctorId) : undefined, notes: form.notes || undefined })} disabled={!finalTestName}>
              Create Order
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const SURCHARGE_RATE = 0.23; // 23% for card/bank transfer

function CreateInvoiceModal({ open, onClose, patientId, onSuccess, preSelectedItems }: any) {
  const { user: createInvoiceUser } = useAuth();
  const isCreateInvoiceAdmin = createInvoiceUser?.role === "admin";
  const { data: services } = trpc.services.list.useQuery({});
  const { data: activeTaxRules = [], isLoading: taxRulesLoading } = trpc.services.taxRules.list.useQuery();
  const { data: categoryTaxDefaults = [] } = trpc.services.categoryTaxDefaults.list.useQuery();
  const { data: settings } = trpc.settings.get.useQuery();
  // ✅ Use live exchange_rates table (tryPerUnit: 1 foreign = X TRY) — NOT system_settings
  const { data: liveExchangeRates } = trpc.settings.getExchangeRates.useQuery(undefined, { enabled: open });
  const { data: patientData } = trpc.patients.get.useQuery({ id: patientId }, { enabled: !!patientId });
  const createInvoiceScope = (patientData as any)?.defaultFinancialScope === "test" ? "test" : "production";
  const hasLinkedPartner = !!(patientData as any)?.partnerId;
  const createInvoice = trpc.finance.createInvoice.useMutation({
    onSuccess: (result: any) => {
      const shouldOpenSendDialog = openSendAfterSave;
      const shouldNotifyPartner = notifyPartner;
      clearInvoiceDraft();
      persistedCreateInvoiceDraftRef.current = false;
      setIsCreateInvoiceDraftDirty(false);
      resetCreateInvoiceForm();
      const credits = (result?.initialPaymentResults ?? []).filter((entry: any) => Number(entry.creditAmount ?? 0) > 0);
      toast.success(credits.length > 0 ? "Invoice created and Patient Credit recorded." : "Invoice created");
      onSuccess(result, shouldOpenSendDialog, shouldNotifyPartner);
    },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  type LineItem = {
    lineLabel?: string;
    description: string;
    quantity: number;
    unitPrice: string;
    serviceId: string;
    tryPrice: string;
    totalPrice?: string;
    linePricingMethod?: V4LinePricingMethod;
    lineDiscountPercent?: string;
    adjustmentOpen?: boolean;
    category?: string;
    taxRuleId?: number | null;
    taxSelection?: { type: "none" } | { type: "rule"; taxRuleId: number } | { type: "custom"; ratePercent: string };
    taxIncludedMode?: boolean;
    taxIncludedGross?: string;
    priceEntry?: ServicePriceEntry;
  };
  type PaymentEntry = {
    method: "cash" | "card" | "bank_transfer";
    amount: string;
    currency: "USD" | "EUR" | "GBP" | "TRY" | "SAR" | "AED" | "AUD";
    receivedAtValue: string;
    manualFx: ManualFxDraft;
    bankDeductionAmount?: string;
    bankDeductionPercent?: string;
  };
  type CreateInvoiceDraft = {
    items: LineItem[];
    currency: string;
    notes: string;
    payments: PaymentEntry[];
    notifyPartner: boolean;
    discountPercent: number;
    pricingMode: "discount" | "agreed";
    finalAgreedPrice: string;
    invoiceAdjustmentOpen: boolean;
    openSendAfterSave: boolean;
  };
  type PendingQuantityChange = { index: number; nextQuantity: number };
  const makeEmptyCreateInvoiceDraft = (): CreateInvoiceDraft => ({
    items: [],
    currency: "TRY",
    notes: "",
    payments: [{ method: "cash", amount: "", currency: "TRY", receivedAtValue: toDateInputValue(new Date()), manualFx: emptyManualFxDraft() }],
    notifyPartner: false,
    discountPercent: 0,
    pricingMode: "discount",
    finalAgreedPrice: "",
    invoiceAdjustmentOpen: false,
    openSendAfterSave: false,
  });

  const [items, setItems] = useState<LineItem[]>([]);
  const [currency, setCurrency] = useState("TRY");
  const [notes, setNotes] = useState("");
  const [showServicePickerModal, setShowServicePickerModal] = useState(false);
  const [payments, setPayments] = useState<PaymentEntry[]>([{ method: "cash", amount: "", currency: "TRY", receivedAtValue: toDateInputValue(new Date()), manualFx: emptyManualFxDraft() }]);
  const [notifyPartner, setNotifyPartner] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [pricingMode, setPricingMode] = useState<"discount" | "agreed">("discount"); // V3: Mode A or B
  const [finalAgreedPrice, setFinalAgreedPrice] = useState(""); // V3: Mode B — exact final price
  const [invoiceAdjustmentOpen, setInvoiceAdjustmentOpen] = useState(false);
  const [pendingQuantityChange, setPendingQuantityChange] = useState<PendingQuantityChange | null>(null);
  const [openSendAfterSave, setOpenSendAfterSave] = useState(false);
  const draftScope = patientData ? createInvoiceScope : "pending";
  const createInvoiceDraftKey = `fertiliv:create-invoice-draft:v1:patient:${patientId}:scope:${draftScope}`;
  const initialInvoiceDraft = useMemo(() => makeEmptyCreateInvoiceDraft(), [createInvoiceDraftKey]);
  const {
    form: persistedInvoiceDraft,
    setForm: setPersistedInvoiceDraft,
    hasDraft: hasPersistedInvoiceDraft,
    isReady: isInvoiceDraftReady,
    clearDraft: clearInvoiceDraft,
  } = useDraftForm<CreateInvoiceDraft>({
    key: createInvoiceDraftKey,
    initialData: initialInvoiceDraft,
    disabled: !open || !patientId || !patientData,
  });
  const initializedDraftKeyRef = useRef<string | null>(null);
  const hydratingCreateInvoiceDraftRef = useRef(false);
  const persistedCreateInvoiceDraftRef = useRef(false);
  const [isCreateInvoiceDraftDirty, setIsCreateInvoiceDraftDirty] = useState(false);
  const [createManualServiceFxInputs, setCreateManualServiceFxInputs] = useState<Record<number, string>>({});
  const { data: createInvoiceCredit } = trpc.finance.getCreditBalance.useQuery(
    { patientId, currency: currency as any, scope: createInvoiceScope },
    { enabled: open && !!patientId && (createInvoiceScope === "production" || isCreateInvoiceAdmin) },
  );

  // ✅ Exchange rate helpers — reads from exchange_rates table (tryPerUnit: 1 foreign = X TRY)
  const surchargeRate = parseFloat(settings?.card_surcharge_pct ?? "23") / 100;
  const markupPct = parseFloat((settings as any)?.foreign_price_markup_pct ?? "30");
  const isInternational = (patientData as any)?.patientType === "international";
  const markupMultiplier = isInternational ? 1 + markupPct / 100 : 1;
  const taxRulesById = useMemo(() => new Map((activeTaxRules as any[]).map(rule => [rule.id, rule])), [activeTaxRules]);
  const defaultTaxRuleByCategory = useMemo(() => new Map((categoryTaxDefaults as any[]).map(row => [row.category, row.taxRuleId])), [categoryTaxDefaults]);
  const suggestedTaxRuleId = (category?: string, service?: any) => {
    if (service?.taxOverrideMode === "no_tax") return null;
    if (service?.taxOverrideMode === "rule") return service.taxOverrideRuleId ?? null;
    return category ? (defaultTaxRuleByCategory.get(category) ?? null) : null;
  };
  const getLineTaxSnapshot = (item: LineItem) => {
    if (item.taxSelection?.type === "custom") {
      const validCustomRate = /^\d{1,3}(?:\.\d{1,4})?$/.test(item.taxSelection.ratePercent)
        && Number(item.taxSelection.ratePercent) >= 0
        && Number(item.taxSelection.ratePercent) <= 100;
      return { taxRuleId: null, taxLabelSnapshot: "Custom Tax", taxRateSnapshot: validCustomRate ? item.taxSelection.ratePercent : null };
    }
    if (item.taxSelection?.type === "none") {
      return { taxRuleId: null, taxLabelSnapshot: null, taxRateSnapshot: null };
    }
    const taxRuleId = item.taxSelection?.type === "rule" ? item.taxSelection.taxRuleId : item.taxRuleId ?? null;
    const rule = taxRuleId == null ? null : taxRulesById.get(taxRuleId);
    return { taxRuleId, taxLabelSnapshot: rule?.label ?? null, taxRateSnapshot: rule ? String(rule.ratePercent) : null };
  };
  const unavailableDraftTaxRuleIds = useMemo(
    () => Array.from(new Set(items.map(item => item.taxRuleId).filter((id): id is number => id != null && !taxRulesById.has(id)))),
    [items, taxRulesById],
  );

  // Returns tryPerUnit: 1 [cur] = X TRY
  const getExchangeRate = (cur: string): number => {
    if (cur === "TRY") return 1;
    const liveRate = (liveExchangeRates as any)?.rates?.[cur]?.rate;
    if (liveRate && parseFloat(liveRate) > 1) return parseFloat(liveRate);
    // Fallback to system_settings (legacy) — but warn if inverted
    const legacyRate = parseFloat((settings as any)?.[`exchange_rate_${cur}`] ?? "0");
    return legacyRate > 1 ? legacyRate : 1; // never return < 1 (inverted guard)
  };

  // Rate metadata for display
  const getRateMeta = (cur: string) => {
    if (cur === "TRY") return null;
    const rateData = (liveExchangeRates as any)?.rates?.[cur];
    const source = rateData?.source ?? "Settings";
    const rateDate = rateData?.rateDate ?? "";
    return { source, rateDate };
  };

  // Inverted rate guard: warn if tryPerUnit < 5 for major currencies (impossible in reality)
  const isRateInverted = (cur: string): boolean => {
    if (cur === "TRY") return false;
    return getExchangeRate(cur) < 5;
  };

  // Convert a TRY base price → apply international markup → convert to selected currency
  // Formula: foreignPrice = (tryAmount * markupMultiplier) / tryPerUnit
  const convertFromTRY = (tryAmount: number, cur: string): number => {
    const markedUp = tryAmount * markupMultiplier;
    if (cur === "TRY") return markedUp;
    return markedUp / getExchangeRate(cur);
  };

  // Convert displayed price back to raw TRY base (strip markup and currency)
  // Formula: tryBase = (displayAmount * tryPerUnit) / markupMultiplier
  const convertToTRY = (displayAmount: number, cur: string): number => {
    const inTRY = cur === "TRY" ? displayAmount : displayAmount * getExchangeRate(cur);
    return markupMultiplier > 0 ? inTRY / markupMultiplier : inTRY;
  };

  // Uses the same pure source-price conversion helper as the server. The
  // server remains authoritative for the persisted FX snapshot at save time.
  const getSourcePricePreview = (item: LineItem, invoiceCurrency = currency) => {
    const entry = item.priceEntry;
    if (!entry || !entry.amount) return null;
    try {
      const crossCurrency = entry.currency !== invoiceCurrency;
      return computeServicePriceFxSnapshot({
        sourceCurrency: entry.currency,
        invoiceCurrency,
        sourceAmount: getAgreedUnitSourceLineAmount(entry, item.quantity),
        directRateToInvoice: crossCurrency && entry.fx?.source === "manual" ? entry.fx.rateToInvoice : undefined,
        sourceToTryRate: crossCurrency && entry.fx?.source === "system" ? String(getExchangeRate(entry.currency)) : undefined,
        invoiceToTryRate: crossCurrency && entry.fx?.source === "system" ? String(getExchangeRate(invoiceCurrency)) : undefined,
        source: crossCurrency ? entry.fx?.source ?? null : null,
      });
    } catch {
      return null;
    }
  };
  const getInvoiceCurrencyLine = (item: LineItem): LineItem => {
    const entry = item.priceEntry;
    const snapshot = getSourcePricePreview(item);
    if (!entry || !snapshot) return item;
    if (entry.kind === "unit_price") {
      return { ...item, unitPrice: snapshot.convertedAmount, totalPrice: undefined, linePricingMethod: "none", lineDiscountPercent: undefined, taxIncludedMode: false, taxIncludedGross: undefined };
    }
    if (entry.kind === "tax_included_final_line_total" || entry.kind === "tax_included_agreed_unit_price") {
      return { ...item, totalPrice: snapshot.convertedAmount, linePricingMethod: entry.kind === "tax_included_agreed_unit_price" ? "agreed_unit_price" : "final_line_total", lineDiscountPercent: undefined, taxIncludedMode: true, taxIncludedGross: snapshot.convertedAmount };
    }
    return { ...item, totalPrice: snapshot.convertedAmount, linePricingMethod: entry.kind === "agreed_unit_price" ? "agreed_unit_price" : "final_line_total", lineDiscountPercent: undefined, taxIncludedMode: false, taxIncludedGross: undefined };
  };

  const isMeaningfulCreateInvoiceDraft = (draft: CreateInvoiceDraft) =>
    draft.items.length > 0 ||
    draft.currency !== "TRY" ||
    draft.notes.trim() !== "" ||
    draft.notifyPartner ||
    draft.discountPercent !== 0 ||
    draft.pricingMode !== "discount" ||
    draft.finalAgreedPrice !== "" ||
    draft.openSendAfterSave ||
    draft.payments.some(payment =>
      payment.amount !== "" ||
      payment.currency !== "TRY" ||
      payment.method !== "cash" ||
      payment.manualFx.source !== "system" ||
      payment.manualFx.paymentToTryRate !== "" ||
      payment.manualFx.invoiceToTryRate !== "" ||
      payment.manualFx.note !== "" ||
      payment.bankDeductionAmount !== "" ||
      payment.bankDeductionPercent !== "",
    );

  const resetCreateInvoiceForm = () => {
    const emptyDraft = makeEmptyCreateInvoiceDraft();
    setItems(emptyDraft.items);
    setCreateManualServiceFxInputs({});
    setCurrency(emptyDraft.currency);
    setNotes(emptyDraft.notes);
    setPayments(emptyDraft.payments);
    setShowServicePickerModal(false);
    setDiscountPercent(emptyDraft.discountPercent);
    setPricingMode(emptyDraft.pricingMode);
    setFinalAgreedPrice(emptyDraft.finalAgreedPrice);
    setInvoiceAdjustmentOpen(emptyDraft.invoiceAdjustmentOpen);
    setNotifyPartner(emptyDraft.notifyPartner);
    setOpenSendAfterSave(emptyDraft.openSendAfterSave);
    setPendingQuantityChange(null);
  };

  // Resolve the authoritative Patient scope before attempting draft restore. A
  // saved draft takes precedence over optional preselected hand-off items.
  useEffect(() => {
    if (!open) {
      initializedDraftKeyRef.current = null;
      setShowServicePickerModal(false);
      return;
    }
    if (!isInvoiceDraftReady || initializedDraftKeyRef.current === createInvoiceDraftKey) return;

    const initialItems: LineItem[] = (preSelectedItems ?? []).map((sel: SelectedService) => ({
      description: sel.service.name,
      quantity: sel.quantity,
      unitPrice: sel.unitPrice,
      tryPrice: sel.tryPrice,
      serviceId: String(sel.service.id),
      category: (sel.service as any).category,
      taxRuleId: suggestedTaxRuleId((sel.service as any).category, sel.service),
    }));
    const sourceDraft = hasPersistedInvoiceDraft
      ? persistedInvoiceDraft
      : { ...makeEmptyCreateInvoiceDraft(), items: initialItems };

    hydratingCreateInvoiceDraftRef.current = true;
    persistedCreateInvoiceDraftRef.current = hasPersistedInvoiceDraft;
    initializedDraftKeyRef.current = createInvoiceDraftKey;
    setItems(sourceDraft.items ?? []);
    setCurrency(sourceDraft.currency ?? "TRY");
    setNotes(sourceDraft.notes ?? "");
    setPayments(sourceDraft.payments?.length ? sourceDraft.payments : makeEmptyCreateInvoiceDraft().payments);
    setShowServicePickerModal(false);
    setDiscountPercent(sourceDraft.discountPercent ?? 0);
    setPricingMode(sourceDraft.pricingMode ?? "discount");
    setFinalAgreedPrice(sourceDraft.finalAgreedPrice ?? "");
    setInvoiceAdjustmentOpen(sourceDraft.invoiceAdjustmentOpen ?? false);
    setNotifyPartner(sourceDraft.notifyPartner ?? false);
    setOpenSendAfterSave(sourceDraft.openSendAfterSave ?? false);
    setIsCreateInvoiceDraftDirty(hasPersistedInvoiceDraft && isMeaningfulCreateInvoiceDraft(sourceDraft));
  }, [categoryTaxDefaults, createInvoiceDraftKey, hasPersistedInvoiceDraft, isInvoiceDraftReady, open, persistedInvoiceDraft, preSelectedItems]);

  // Persist only the coordinator's input. Tax, FX, settlement, credit, and
  // payment previews are intentionally recalculated from those inputs.
  useEffect(() => {
    if (!open || !isInvoiceDraftReady || initializedDraftKeyRef.current !== createInvoiceDraftKey) return;
    if (hydratingCreateInvoiceDraftRef.current) {
      hydratingCreateInvoiceDraftRef.current = false;
      return;
    }
    const nextDraft: CreateInvoiceDraft = { items, currency, notes, payments, notifyPartner, discountPercent, pricingMode, finalAgreedPrice, invoiceAdjustmentOpen, openSendAfterSave };
    if (!isMeaningfulCreateInvoiceDraft(nextDraft)) {
      if (persistedCreateInvoiceDraftRef.current) clearInvoiceDraft();
      persistedCreateInvoiceDraftRef.current = false;
      setIsCreateInvoiceDraftDirty(false);
      return;
    }
    setPersistedInvoiceDraft(nextDraft);
    persistedCreateInvoiceDraftRef.current = true;
    setIsCreateInvoiceDraftDirty(true);
  }, [clearInvoiceDraft, createInvoiceDraftKey, currency, discountPercent, finalAgreedPrice, invoiceAdjustmentOpen, isInvoiceDraftReady, items, notes, notifyPartner, open, openSendAfterSave, payments, pricingMode, setPersistedInvoiceDraft]);

  useBeforeUnload(open && isCreateInvoiceDraftDirty);

  const cancelCreateInvoice = () => {
    clearInvoiceDraft();
    persistedCreateInvoiceDraftRef.current = false;
    setIsCreateInvoiceDraftDirty(false);
    resetCreateInvoiceForm();
    onClose();
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // Overlay/X close intentionally retains the local draft for later resume.
      setShowServicePickerModal(false);
      onClose();
    }
  };

  // When currency changes, re-convert all item prices from their stored TRY price
  const handleCurrencyChange = (newCur: string) => {
    setItems(prev => prev.map(item => {
      // An explicit source-price entry is never reinterpreted through the
      // catalog TRY price. Its derived invoice amount is recalculated only
      // for presentation/preview from the preserved source facts.
      if (item.priceEntry) return item;
      const preview = getV4LinePricingPreview(item);
      return {
        ...item,
        unitPrice: convertFromTRY(parseFloat(item.tryPrice || "0"), newCur).toFixed(2),
        totalPrice: preview.method === "final_line_total"
          ? convertFromTRY(convertToTRY(preview.finalLineTotal, currency), newCur).toFixed(2)
          : item.totalPrice,
      };
    }));
    setCurrency(newCur);
  };

  // Group services by category
  const servicesByCategory = useMemo(() => {
    const map: Record<string, typeof services> = {};
    (services ?? []).forEach(s => {
      const cat = s.category ?? "other";
      if (!map[cat]) map[cat] = [];
      map[cat]!.push(s);
    });
    return map;
  }, [services]);

    // Get display price for a service in the selected currency
  const getServiceDisplayPrice = (s: any): string => {
    const tryPrice = parseFloat(s.price ?? "0");
    return convertFromTRY(tryPrice, currency).toFixed(2);
  };

  const handleServicePickerResult = (result: ServicePickerResult) => {
    const newItems: LineItem[] = result.items.map(sel => ({
      description: sel.service.name,
      quantity: sel.quantity,
      unitPrice: sel.unitPrice,
      tryPrice: sel.tryPrice,
      serviceId: String(sel.service.id),
      category: (sel.service as any).category,
      taxRuleId: suggestedTaxRuleId((sel.service as any).category, sel.service),
    }));
    setItems(prev => [...prev, ...newItems]);
    setShowServicePickerModal(false);
  };

  const removeItem = (idx: number) => {
    setCreateManualServiceFxInputs({});
    setItems(prev => prev.filter((_, i) => i !== idx));
  };
  const updateItem = (idx: number, field: keyof LineItem, value: any) => {
    const item = items[idx];
    if (field === "unitPrice") {
      const normalized = normalizeServicePriceDecimalInput(String(value));
      if (normalized == null) return;
      value = normalized;
    }
    const requestedQuantity = field === "quantity" ? Math.max(1, Number(value) || 1) : null;
    if (requestedQuantity !== null && item && requestedQuantity !== item.quantity && item.linePricingMethod === "final_line_total") {
      setPendingQuantityChange({ index: idx, nextQuantity: requestedQuantity });
      return;
    }
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      // If user manually edits unitPrice, update tryPrice accordingly
      if (field === "unitPrice") {
        updated.tryPrice = convertToTRY(parseFloat(value || "0"), currency).toFixed(2);
        updated.priceEntry = undefined;
      }
      return updated;
    }));
  };
  const keepAgreedLineTotalAfterQuantityChange = () => {
    if (!pendingQuantityChange) return;
    setItems(prev => prev.map((item, index) => index === pendingQuantityChange.index
      ? { ...item, quantity: pendingQuantityChange.nextQuantity }
      : item));
    setPendingQuantityChange(null);
  };
  const resetLinePricingAfterQuantityChange = () => {
    if (!pendingQuantityChange) return;
    setItems(prev => prev.map((item, index) => {
      if (index !== pendingQuantityChange.index) return item;
      const standardTotal = getV4LinePricingPreview({ ...item, quantity: pendingQuantityChange.nextQuantity, linePricingMethod: "none", totalPrice: undefined }).originalLineTotal.toFixed(2);
      return {
        ...item,
        quantity: pendingQuantityChange.nextQuantity,
        linePricingMethod: "none",
        lineDiscountPercent: undefined,
        totalPrice: standardTotal,
        taxIncludedMode: false,
        taxIncludedGross: undefined,
        priceEntry: undefined,
        adjustmentOpen: false,
      };
    }));
    setPendingQuantityChange(null);
  };

  const updateLineTaxSelection = (idx: number, selection: LineItem["taxSelection"]) => {
    if (selection?.type === "none" && items[idx]?.taxIncludedMode) {
      toast.error("Switch this agreed price to Before Tax before selecting No Tax.");
      return;
    }
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      return {
        ...item,
        taxSelection: selection,
        taxRuleId: selection?.type === "rule" ? selection.taxRuleId : null,
        taxIncludedMode: selection?.type === "none" ? false : item.taxIncludedMode,
        taxIncludedGross: selection?.type === "none" ? undefined : item.taxIncludedGross,
      };
    }));
  };

  const setCreateTaxControl = (idx: number, value: string) => {
    const item = items[idx];
    if (!item) return;
    const parsed = parseInvoiceLineTaxControlValue(value, item.taxSelection?.type === "custom" ? item.taxSelection.ratePercent : "0");
    if (!parsed) return;
    const method = item.linePricingMethod ?? "none";
    if (parsed.taxIncludedMode && method !== "agreed_unit_price" && method !== "final_line_total") {
      toast.error("Tax Included is available only for Agreed Unit Price or Final Line Total. Standard prices remain Before Tax.");
      return;
    }
    if (parsed.taxIncludedMode && (pricingMode === "agreed" || discountPercent > 0)) {
      toast.error("Tax-Included line pricing can't be combined with invoice-wide pricing adjustments.");
      return;
    }
    setItems(prev => prev.map((line, i) => {
      if (i !== idx) return line;
      const kind = getDraftServicePriceEntryKind(method, parsed.taxIncludedMode);
      const currentEntry = line.priceEntry;
      const enteredAmount = currentEntry?.amount ?? (method === "agreed_unit_price" ? String(line.unitPrice ?? "") : String(line.totalPrice ?? getV4LinePricingPreview(line).originalLineTotal.toFixed(2)));
      return {
        ...line,
        adjustmentOpen: kind !== null,
        taxSelection: parsed.taxSelection,
        taxRuleId: parsed.taxSelection.type === "rule" ? parsed.taxSelection.taxRuleId : null,
        taxIncludedMode: parsed.taxIncludedMode,
        taxIncludedGross: parsed.taxIncludedMode ? "" : undefined,
        priceEntry: kind
          ? { currency: currentEntry?.currency ?? currency as ServicePriceEntry["currency"], amount: parsed.taxIncludedMode ? "" : enteredAmount, kind, fx: currentEntry?.fx ?? { source: "system" } }
          : undefined,
      };
    }));
  };

  const setLinePricingMethod = (idx: number, method: V4LinePricingMethod) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const originalTotal = getV4LinePricingPreview(item).originalLineTotal.toFixed(2);
      const kind = getDraftServicePriceEntryKind(method, false);
      return {
        ...item,
        adjustmentOpen: true,
        linePricingMethod: method,
        lineDiscountPercent: method === "discount_percent" ? (item.lineDiscountPercent ?? "0") : undefined,
        totalPrice: method === "final_line_total" ? originalTotal : item.totalPrice,
        taxIncludedMode: false,
        taxIncludedGross: undefined,
        priceEntry: kind ? { currency: currency as ServicePriceEntry["currency"], amount: method === "agreed_unit_price" ? String(item.unitPrice ?? "") : originalTotal, kind, fx: { source: "system" } } : undefined,
      };
    }));
  };
  const setCreateAgreedUnitPricing = (idx: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const entry: ServicePriceEntry = {
        currency: currency as ServicePriceEntry["currency"],
        amount: String(item.unitPrice ?? ""),
        kind: "agreed_unit_price",
        fx: { source: "system" },
      };
      return {
        ...item,
        adjustmentOpen: true,
        linePricingMethod: "agreed_unit_price",
        lineDiscountPercent: undefined,
        taxIncludedMode: false,
        taxIncludedGross: undefined,
        priceEntry: entry,
      };
    }));
  };

  const setCreateTaxInclusiveEntry = (idx: number, included: boolean) => {
    const item = items[idx];
    if (!item || item.linePricingMethod !== "agreed_unit_price") {
      setTaxInclusiveEntry(idx, included);
      return;
    }
    if (included) {
      const tax = getLineTaxSnapshot(item);
      if (!tax.taxLabelSnapshot || tax.taxRateSnapshot == null) {
        toast.error("Choose a Tax before entering a Tax-Included agreed unit price.");
        return;
      }
      if (pricingMode === "agreed" || discountPercent > 0) {
        toast.error("Tax-Included line pricing can't be combined with invoice-wide pricing adjustments.");
        return;
      }
    }
    setItems(prev => prev.map((line, i) => i === idx ? {
      ...line,
      adjustmentOpen: true,
      linePricingMethod: "agreed_unit_price",
      lineDiscountPercent: undefined,
      taxIncludedMode: included,
      taxIncludedGross: included ? "" : undefined,
      priceEntry: {
        currency: line.priceEntry?.currency ?? currency as ServicePriceEntry["currency"],
        amount: included ? "" : line.priceEntry?.amount ?? String(line.unitPrice ?? ""),
        kind: included ? "tax_included_agreed_unit_price" : "agreed_unit_price",
        fx: line.priceEntry?.fx ?? { source: "system" },
      },
    } : line));
  };

  const setTaxInclusiveEntry = (idx: number, included: boolean) => {
    const item = items[idx];
    if (!item) return;
    if (included) {
      const tax = getLineTaxSnapshot(item);
      if (!tax.taxLabelSnapshot || tax.taxRateSnapshot == null) {
        toast.error("Choose a Tax before entering a Tax-Included line price.");
        return;
      }
      if (pricingMode === "agreed" || discountPercent > 0) {
        toast.error("Tax-Included line pricing can't be combined with invoice-wide pricing adjustments.");
        return;
      }
      setItems(prev => prev.map((line, i) => i === idx ? {
        ...line,
        adjustmentOpen: true,
        linePricingMethod: "final_line_total",
        lineDiscountPercent: undefined,
        taxIncludedMode: true,
        taxIncludedGross: "",
        priceEntry: { currency: currency as ServicePriceEntry["currency"], amount: "", kind: "tax_included_final_line_total", fx: { source: "system" } },
      } : line));
      return;
    }
    setItems(prev => prev.map((line, i) => i === idx ? {
      ...line,
      taxIncludedMode: false,
      taxIncludedGross: undefined,
      priceEntry: line.priceEntry ? { ...line.priceEntry, kind: "final_line_total" } : line.priceEntry,
    } : line));
  };
  const updatePriceEntry = (idx: number, patch: Omit<Partial<ServicePriceEntry>, "fx"> & { fx?: Partial<NonNullable<ServicePriceEntry["fx"]>> }) => {
    if (patch.amount !== undefined) {
      const normalized = normalizeServicePriceDecimalInput(patch.amount);
      if (normalized == null) return;
      patch = { ...patch, amount: normalized };
    }
    setItems(prev => prev.map((item, i) => {
      if (i !== idx || !item.priceEntry) return item;
      const current = item.priceEntry;
      const next: ServicePriceEntry = {
        ...current,
        ...patch,
        fx: patch.fx ? { ...(current.fx ?? { source: "system" as const }), ...patch.fx } : current.fx,
      };
      return { ...item, priceEntry: next };
    }));
  };
  const changeCreatePriceEntryCurrency = (idx: number, nextCurrency: ServicePriceEntry["currency"]) => {
    setCreateManualServiceFxInputs(inputs => {
      const next = { ...inputs };
      delete next[idx];
      return next;
    });
    setItems(prev => prev.map((item, i) => {
      if (i !== idx || !item.priceEntry) return item;
      return { ...item, priceEntry: startServicePriceRepricing(item.priceEntry, nextCurrency) };
    }));
  };
  const setCreatePriceEntryFxSource = (idx: number, source: "system" | "manual") => {
    setCreateManualServiceFxInputs(inputs => {
      const next = { ...inputs };
      delete next[idx];
      return next;
    });
    updatePriceEntry(idx, { fx: { source, rateToInvoice: undefined, note: undefined } });
  };
  const getCreateManualServiceFxInput = (idx: number, entry: ServicePriceEntry) =>
    Object.prototype.hasOwnProperty.call(createManualServiceFxInputs, idx)
      ? createManualServiceFxInputs[idx]!
      : formatServicePriceFxDirectRate(entry.fx?.rateToInvoice);
  const updateCreateManualServiceFxInput = (idx: number, rawValue: string) => {
    const normalized = normalizeServicePriceDecimalInput(rawValue);
    setCreateManualServiceFxInputs(inputs => ({ ...inputs, [idx]: normalized ?? rawValue }));
    if (normalized == null || normalized === "" || normalized.endsWith(".")) {
      updatePriceEntry(idx, { fx: { source: "manual", rateToInvoice: undefined } });
      return;
    }
    try {
      updatePriceEntry(idx, { fx: { source: "manual", rateToInvoice: normalized } });
    } catch {
      updatePriceEntry(idx, { fx: { source: "manual", rateToInvoice: undefined } });
    }
  };
  const resetLineToStandard = (idx: number) => {
    setItems(prev => prev.map((item, i) => i === idx ? {
      ...item,
      linePricingMethod: "none",
      lineDiscountPercent: undefined,
      totalPrice: getV4LinePricingPreview(item).originalLineTotal.toFixed(2),
      taxIncludedMode: false,
      taxIncludedGross: undefined,
      priceEntry: undefined,
      adjustmentOpen: false,
    } : item));
  };

  const getTaxIncludedPreview = (item: LineItem) => {
    const invoiceCurrencyItem = getInvoiceCurrencyLine(item);
    const tax = getLineTaxSnapshot(invoiceCurrencyItem);
    if (!invoiceCurrencyItem.taxIncludedGross || !tax.taxLabelSnapshot || tax.taxRateSnapshot == null) return null;
    try {
      return calculateTaxIncludedLine({ grossAmount: invoiceCurrencyItem.taxIncludedGross, taxRatePercent: tax.taxRateSnapshot });
    } catch {
      return null;
    }
  };
  const getTaxAwareLineTotal = (item: LineItem) => {
    const invoiceCurrencyItem = getInvoiceCurrencyLine(item);
    const included = getTaxIncludedPreview(item);
    return included ? Number(included.taxableBase) : getV4LinePricingPreview(invoiceCurrencyItem).finalLineTotal;
  };
  const hasTaxIncludedLine = items.some(item => item.taxIncludedMode === true);
  const hasIncompleteTaxIncludedDraft = items.some(item => {
    const tax = getLineTaxSnapshot(getInvoiceCurrencyLine(item));
    return isIncompleteTaxIncludedDraft({
      taxIncludedMode: item.taxIncludedMode,
      taxLabelSnapshot: tax.taxLabelSnapshot,
      taxRateSnapshot: tax.taxRateSnapshot,
      taxSelection: item.taxSelection,
      priceEntry: item.priceEntry,
    });
  });

  // V4: every invoice-level calculation starts from canonical final line totals.
  const subtotalBeforeDiscount = items.reduce((s, i) => s + getTaxAwareLineTotal(i), 0);

  // V3: Mode A (discount) — cashTotal = subtotal × (1 - discountPercent/100)
  // V3: Mode B (agreed)   — cashTotal = finalAgreedPrice (exact, no re-derivation)
  const discountAmt = pricingMode === "discount" && discountPercent > 0
    ? Math.round(subtotalBeforeDiscount * discountPercent / 100 * 100) / 100
    : pricingMode === "agreed" && finalAgreedPrice !== ""
    ? Math.round((subtotalBeforeDiscount - parseFloat(finalAgreedPrice || "0")) * 100) / 100
    : 0;
  const cashTotal = pricingMode === "agreed" && finalAgreedPrice !== ""
    ? parseFloat(finalAgreedPrice || "0")
    : subtotalBeforeDiscount - discountAmt;
  const invoiceWideTaxIncludedConflict = hasTaxIncludedLine && (pricingMode === "agreed" || discountPercent > 0);
  const taxPreviewState = useMemo(() => previewServiceTaxInvoice({
    lines: items.map((item, index) => {
      const invoiceCurrencyItem = getInvoiceCurrencyLine(item);
      const tax = getLineTaxSnapshot(invoiceCurrencyItem);
      return {
        key: index,
        totalPrice: getTaxAwareLineTotal(item).toFixed(2),
        taxIncludedGross: invoiceCurrencyItem.taxIncludedMode && invoiceCurrencyItem.taxIncludedGross ? invoiceCurrencyItem.taxIncludedGross : undefined,
        tax: {
          taxRuleId: tax.taxRuleId,
          taxLabelSnapshot: tax.taxLabelSnapshot,
          taxRateSnapshot: tax.taxRateSnapshot,
        },
      };
    }),
    invoiceWideDiscountAmount: invoiceWideTaxIncludedConflict ? undefined : pricingMode === "discount" ? discountAmt.toFixed(2) : undefined,
    finalAgreedServiceAmount: invoiceWideTaxIncludedConflict ? undefined : pricingMode === "agreed" && finalAgreedPrice !== "" ? cashTotal.toFixed(2) : undefined,
  }), [items, pricingMode, discountAmt, finalAgreedPrice, cashTotal, taxRulesById, invoiceWideTaxIncludedConflict]);
  const taxPreview = taxPreviewState.result;
  const taxPreviewIssue = taxPreviewState.error;
  const invoiceTotalWithTax = taxPreview ? Number(taxPreview.grandTotal) : null;
  // Every invoice created here is method_neutral_v2; legacy collection hints never apply.
  const showLegacySettlementPresentation = false;
  const cardTotal: number | null = showLegacySettlementPresentation && pricingMode === "discount"
    ? Math.round(cashTotal * (1 + surchargeRate) * 100) / 100
    : null;

  // V3: Validation for agreed price input
  const agreedPriceNum = parseFloat(finalAgreedPrice || "0");
  const agreedPriceWarning: string | null =
    pricingMode === "agreed" && finalAgreedPrice !== ""
      ? agreedPriceNum <= 0
        ? "Final price must be greater than zero."
        : agreedPriceNum > subtotalBeforeDiscount
        ? `Final price (${currency} ${agreedPriceNum.toFixed(2)}) cannot exceed subtotal (${currency} ${subtotalBeforeDiscount.toFixed(2)}).`
        : null
      : null;

  // Amount received is a face-value sum across currencies; the server preview
  // remains authoritative for the invoice-currency settlement total.
  const totalAmountReceived = payments.reduce((s, p) => s + parseFloat(p.amount || "0"), 0);
  const validInitialPayments = useMemo(() => payments.filter(payment => parseFloat(payment.amount || "0") > 0), [payments]);
  const initialPaymentPreviewInput = useMemo(() => ({
    invoiceCurrency: currency as "USD" | "EUR" | "GBP" | "TRY" | "SAR" | "AED",
    pricingMode,
    discountPercent: pricingMode === "discount" ? discountPercent : undefined,
    finalAgreedAmount: pricingMode === "agreed" ? finalAgreedPrice : undefined,
    items: items.filter(item => item.description).map(item => {
      const invoiceCurrencyItem = getInvoiceCurrencyLine(item);
      return ({
      serviceId: item.serviceId ? parseInt(item.serviceId) : undefined,
      quantity: item.quantity,
      unitPrice: invoiceCurrencyItem.unitPrice,
      totalPrice: getTaxAwareLineTotal(item).toFixed(2),
      linePricingMethod: invoiceCurrencyItem.linePricingMethod ?? "none",
      lineDiscountPercent: invoiceCurrencyItem.linePricingMethod === "discount_percent" ? Number(invoiceCurrencyItem.lineDiscountPercent ?? 0) : null,
      taxSelection: item.taxSelection,
      taxRuleId: item.taxSelection ? (item.taxSelection.type === "rule" ? item.taxSelection.taxRuleId : null) : undefined,
      taxIncludedMode: invoiceCurrencyItem.taxIncludedMode || undefined,
      taxIncludedGross: invoiceCurrencyItem.taxIncludedMode ? invoiceCurrencyItem.taxIncludedGross : undefined,
      priceEntry: item.priceEntry,
    });
    }),
    payments: validInitialPayments.map(payment => ({
      amount: parseFloat(payment.amount),
      currency: payment.currency,
      method: payment.method === "card" ? "credit_card" as const : payment.method,
      receivedAt: new Date(payment.receivedAtValue),
      manualFx: toManualFxPayload(payment.manualFx, payment.currency, currency),
      bankDeduction: payment.method === "bank_transfer" ? { amount: payment.bankDeductionAmount || undefined, percent: payment.bankDeductionPercent || undefined } : undefined,
    })),
  }), [currency, pricingMode, discountPercent, finalAgreedPrice, items, validInitialPayments]);
  const initialPaymentPreviewEnabled = open && !!taxPreview && initialPaymentPreviewInput.items.length > 0 && initialPaymentPreviewInput.payments.length > 0 && initialPaymentPreviewInput.payments.every(payment => !Number.isNaN(payment.receivedAt.getTime()));
  const { data: initialPaymentPreview, isFetching: initialPaymentPreviewLoading, error: initialPaymentPreviewError } = trpc.finance.previewInitialPayments.useQuery(initialPaymentPreviewInput, { enabled: initialPaymentPreviewEnabled, retry: false });
  const totalSettled = initialPaymentPreview ? Number(initialPaymentPreview.totalSettled) : 0;

  // V3: Balance = patient total - settled amount
  const balanceRemaining = invoiceTotalWithTax == null ? null : Math.max(0, invoiceTotalWithTax - totalSettled);
  // Contextual 23% collection hints are legacy-only; new invoices are method-neutral.
  const lastPaymentMethod = payments.length > 0 ? payments[payments.length - 1].method : "cash";
  const collectionHint: number | null = showLegacySettlementPresentation && pricingMode === "discount" && lastPaymentMethod !== "cash" && (balanceRemaining ?? 0) > 0.01
    ? Math.round((balanceRemaining ?? 0) * (1 + surchargeRate) * 100) / 100
    : null;

  const addPayment = () => setPayments(prev => [...prev, { method: "cash", amount: "", currency: currency as PaymentEntry["currency"], receivedAtValue: toDateInputValue(new Date()), manualFx: emptyManualFxDraft() }]);
  const removePayment = (idx: number) => setPayments(prev => prev.filter((_, i) => i !== idx));
  const updatePayment = (idx: number, field: keyof PaymentEntry, value: any) => {
    if (field === "amount" || field === "bankDeductionAmount" || field === "bankDeductionPercent") {
      const normalized = normalizeServicePriceDecimalInput(String(value));
      if (normalized == null) return;
      value = normalized;
    }
    setPayments(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const handleSubmit = () => {
    const validItems = items.filter(i => i.description);
    if (validItems.length === 0) return toast.error("Add at least one service or item");
    if (invoiceWideTaxIncludedConflict) return toast.error("Tax-Included line pricing can't be combined with invoice-wide pricing adjustments.");
    if (validItems.some(item => item.taxSelection?.type === "custom" && !/^\d{1,3}(?:\.\d{1,4})?$/.test(item.taxSelection.ratePercent))) return toast.error("Custom Tax must be 0–100% with up to 4 decimal places.");
    if (hasIncompleteTaxIncludedDraft || validItems.some(item => item.taxIncludedMode && !getTaxIncludedPreview(item))) return toast.error("Complete the Tax and gross agreed price before saving this Tax-Included line.");
    if (!taxPreview) return toast.error(taxPreviewIssue ?? "Complete the Tax details for this line before saving.");
    if (validInitialPayments.length > 0 && (initialPaymentPreviewLoading || !initialPaymentPreview)) {
      return toast.error(initialPaymentPreviewError?.message || "Waiting for the server payment preview. Please try again.");
    }
    // V4: subtotal is the sum of canonical patient-facing final line totals.
    const subtotalDisplay = validItems.reduce((s, i) => s + getTaxAwareLineTotal(i), 0);
    const discountAmtDisplay = subtotalDisplay * discountPercent / 100;
    // Fix A (Mode B): use the exact staff-entered finalAgreedPrice, not subtotal-discountPercent
    const cashTotalDisplay = pricingMode === "agreed" && finalAgreedPrice
      ? parseFloat(finalAgreedPrice)
      : subtotalDisplay - discountAmtDisplay;
    const taxForSubmit = taxPreview;
    // V3: use settled amount for paidAmount — will be recalculated by server after payment rows are inserted
    const paidAmountDisplay = undefined; // Fix D: paidAmount is now derived from payment rows, not set directly
    const status = totalSettled >= Number(taxForSubmit.grandTotal) - 0.01 ? "paid" : totalSettled > 0 ? "partial" : "issued";
    const paymentNotes = payments.filter(p => parseFloat(p.amount || "0") > 0)
      .map(p => `${p.method.replace(/_/g, " ")}: ${currency} ${parseFloat(p.amount).toFixed(2)}`).join("; ");
    const validPaymentEntries = payments.filter(p => parseFloat(p.amount || "0") > 0);
    createInvoice.mutate({
      patientId,
      currency: currency as any,
      subtotal: subtotalDisplay.toFixed(2),
      discountAmount: discountAmtDisplay > 0 ? discountAmtDisplay.toFixed(2) : undefined,
      discountPercent: pricingMode === "discount" && discountPercent > 0 ? discountPercent : undefined,
      taxAmount: taxForSubmit.totalTaxAmount,
      totalAmount: taxForSubmit.grandTotal,
      paidAmount: paidAmountDisplay,
      status: "issued",
      notifyPartner: notifyPartner || undefined,
      notes: notes || undefined,
      initialPayments: validPaymentEntries.map(p => ({
        amount: parseFloat(p.amount).toFixed(2),
        currency: p.currency,
        method: p.method === "card" ? "credit_card" as const : p.method,
        receivedAt: new Date(p.receivedAtValue),
        manualFx: toManualFxPayload(p.manualFx, p.currency, currency),
        bankDeduction: p.method === "bank_transfer" ? { amount: p.bankDeductionAmount || undefined, percent: p.bankDeductionPercent || undefined } : undefined,
      })),
      // V3 pricing mode fields
      ...(pricingMode === "agreed" && { pricingMode: "agreed" as const, finalAgreedAmount: cashTotalDisplay.toFixed(2) }),
      ...(pricingMode === "discount" && { pricingMode: "discount" as const }),
      items: validItems.map(i => {
        const invoiceCurrencyItem = getInvoiceCurrencyLine(i);
        return ({
        lineLabel: i.serviceId ? (i.lineLabel?.trim() || null) : undefined,
        description: i.description,
        quantity: i.quantity,
        unitPrice: invoiceCurrencyItem.unitPrice,
        totalPrice: getTaxAwareLineTotal(i).toFixed(2),
        linePricingMethod: invoiceCurrencyItem.linePricingMethod ?? "none",
        lineDiscountPercent: invoiceCurrencyItem.linePricingMethod === "discount_percent"
          ? getV4LinePricingPreview(invoiceCurrencyItem).discountPercent
          : null,
        serviceId: i.serviceId ? parseInt(i.serviceId) : undefined,
        taxSelection: i.taxSelection,
        taxRuleId: i.taxSelection ? (i.taxSelection.type === "rule" ? i.taxSelection.taxRuleId : null) : undefined,
        taxIncludedMode: invoiceCurrencyItem.taxIncludedMode || undefined,
        taxIncludedGross: invoiceCurrencyItem.taxIncludedMode ? invoiceCurrencyItem.taxIncludedGross : undefined,
        priceEntry: i.priceEntry,
      });
      }),
    } as any);
  };

  // Mobile: use Radix Sheet (single managed interaction layer — no split focus/overlay).
  // Desktop: use Dialog.
  // useIsMobile uses matchMedia so it is stable across re-renders.
  const isMobile = useIsMobile();

  const formBody = (
    <div className="space-y-5 px-4 py-4">

          {!taxRulesLoading && unavailableDraftTaxRuleIds.length > 0 && (
            <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              A saved Tax Rule is no longer available. Review the affected line and select the intended current Tax Rule before creating this invoice.
            </div>
          )}

          {/* Currency — Step 1 */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Label className="text-sm font-medium w-24">Currency</Label>
              <Select value={currency} onValueChange={handleCurrencyChange}>
                <SelectTrigger className="h-10 text-base w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["TRY", "USD", "EUR", "GBP", "SAR", "AED"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {currency !== "TRY" && (
              <div className="text-sm">
                {isRateInverted(currency) ? (
                  <span className="font-semibold text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200 block">
                    ⚠️ Rate looks inverted! Go to Services → Settings → Exchange Rates and click "Fetch live rates now".
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    1 {currency} = {getExchangeRate(currency).toFixed(2)} TRY
                    {getRateMeta(currency) && (
                      <> · <span className="capitalize">{getRateMeta(currency)!.source}</span>{getRateMeta(currency)!.rateDate ? ` (${getRateMeta(currency)!.rateDate})` : ""}</>
                    )}
                  </span>
                )}
              </div>
            )}
            <span className="text-sm font-medium px-2 py-1 rounded bg-purple-100 text-purple-700 inline-block">
              Pricing: {isInternational ? "International" : "Local"}
            </span>
          </div>

          {/* Service Picker — Step 2 */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto h-11 sm:h-9 gap-1.5 text-base sm:text-sm" onClick={() => setShowServicePickerModal(true)}>
              <Plus className="h-4 w-4" />Add Services by Category
            </Button>
            <Button variant="outline" className="w-full sm:w-auto h-11 sm:h-9 text-base sm:text-sm" onClick={() => setItems(prev => [...prev, { description: "", quantity: 1, unitPrice: "0", tryPrice: "0", serviceId: "" }])}>
              + Custom Line
            </Button>
          </div>
          <ServicePickerModal
            open={showServicePickerModal}
            onClose={() => setShowServicePickerModal(false)}
            services={(services ?? []).map(s => ({ id: s.id, name: s.name, category: s.category ?? "other", code: s.code, price: String(s.price ?? "0"), description: s.description }))}
            currency={currency}
            onResult={handleServicePickerResult}
            mode="create"
            convertFromTRY={convertFromTRY}
          />

          {/* Line Items — responsive: card on mobile, table-row on desktop */}
          {items.length > 0 && (
            <div className="space-y-2 sm:overflow-x-auto sm:pb-1">
              {/* Desktop header (hidden on mobile) */}
              <div className="hidden min-w-[1050px] sm:grid grid-cols-[minmax(220px,2fr)_54px_122px_168px_112px_180px_132px_48px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <div>Service / Description</div><div className="text-center">Qty</div><div className="text-right">Standard unit</div><div>Price adjustment</div><div>Pricing currency</div><div>Tax</div><div className="text-right">Line total</div><div />
              </div>
              {items.map((item, idx) => {
                const linePreview = getV4LinePricingPreview(item);
                const lineTotal = getTaxAwareLineTotal(item);
                const taxLine = taxPreview?.lines[idx];
                const taxSnapshot = getLineTaxSnapshot(item);
                const hasTaxDetail = taxSnapshot.taxLabelSnapshot !== null;
                const hasInvoiceWideAdjustment = pricingMode === "agreed" || discountAmt > 0;
                return (
                  <div key={idx} className="border rounded-lg p-3">
                    {/* Mobile card layout */}
                    <div className="sm:hidden space-y-3">
                      {/* Service name row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <Label className="text-xs text-muted-foreground mb-1 block">Service name</Label>
                          <Input
                            value={item.description}
                            onChange={e => updateItem(idx, "description", e.target.value)}
                            className="h-11 text-base font-medium w-full"
                            placeholder="Service description"
                          />
                          {item.serviceId && <div className="mt-2 space-y-1"><Label className="text-xs text-muted-foreground">Invoice line label (optional)</Label><Input value={item.lineLabel ?? ""} maxLength={256} onChange={e => updateItem(idx, "lineLabel", e.target.value)} className="h-10 text-sm" placeholder="e.g. First consultation" /><InvoiceLineLabelShortcuts onSelect={label => updateItem(idx, "lineLabel", label)} /><p className="text-[11px] text-muted-foreground">Preview: {formatInvoiceLineDisplayName(item.description, item.lineLabel)}</p></div>}
                        </div>
                        <button
                          onClick={() => removeItem(idx)}
                          className="text-muted-foreground hover:text-destructive mt-5 shrink-0 p-2 rounded-lg border text-base leading-none"
                        >Remove</button>
                      </div>
                      {/* Qty + standard unit price */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Qty</Label>
                          <Input
                            type="number"
                            inputMode="numeric"
                            value={item.quantity} min={1}
                            onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                            className="h-11 text-base text-center" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Standard Unit Price ({currency})</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={item.unitPrice}
                            onChange={e => updateItem(idx, "unitPrice", e.target.value)}
                            className="h-11 text-base text-right" />
                        </div>
                      </div>
                      {/* Price summary */}
                      <div className="rounded-lg bg-muted/30 px-3 py-2 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Adjusted Service Price</span>
                          <span className="font-semibold">{currency} {lineTotal.toFixed(2)}</span>
                        </div>
                        {hasTaxDetail && taxLine && (
                          <>
                            <div className="flex justify-between text-xs text-muted-foreground"><span>{hasInvoiceWideAdjustment ? "Service Amount after Invoice Adjustment" : "Taxable Service Amount"}</span><span>{currency} {Number(taxLine.effectiveTaxableBase).toFixed(2)}</span></div>
                            <div className="flex justify-between text-xs text-muted-foreground"><span>Tax ({Number(taxLine.tax.taxRateSnapshot ?? 0).toFixed(2)}%)</span><span>{currency} {Number(taxLine.taxAmount).toFixed(2)}</span></div>
                            <div className="flex justify-between text-sm font-semibold border-t pt-1"><span>Line Total incl. Tax</span><span>{currency} {Number(taxLine.totalWithTax).toFixed(2)}</span></div>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Desktop table row (hidden on mobile) */}
                    <div className="hidden min-w-[1050px] sm:grid grid-cols-[minmax(220px,2fr)_54px_122px_168px_112px_180px_132px_48px] items-center gap-2">
                      <div className="space-y-1">
                        <Input value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} className="h-7 text-xs" />
                        {item.serviceId && <Input value={item.lineLabel ?? ""} maxLength={256} onChange={e => updateItem(idx, "lineLabel", e.target.value)} className="h-7 text-xs" placeholder="Invoice line label (optional)" />}
                        {item.serviceId && <InvoiceLineLabelShortcuts onSelect={label => updateItem(idx, "lineLabel", label)} />}
                        {item.serviceId && item.lineLabel?.trim() && <p className="text-[10px] text-muted-foreground">Preview: {formatInvoiceLineDisplayName(item.description, item.lineLabel)}</p>}
                      </div>
                      <div>
                        <Input type="number" value={item.quantity} min={1}
                          onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                          className="h-7 text-xs text-center" />
                      </div>
                      <div>
                        <Input type="text" inputMode="decimal" value={item.unitPrice}
                          onChange={e => updateItem(idx, "unitPrice", e.target.value)}
                          className="h-7 text-xs text-right" />
                      </div>
                      <div><Select value={linePreview.method === "none" ? "standard" : linePreview.method} onValueChange={value => { if (value === "standard") resetLineToStandard(idx); else if (value === "agreed_unit_price") setCreateAgreedUnitPricing(idx); else setLinePricingMethod(idx, value as V4LinePricingMethod); }}><SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="standard">Standard</SelectItem><SelectItem value="discount_percent">Discount %</SelectItem><SelectItem value="agreed_unit_price">Agreed Unit Price</SelectItem><SelectItem value="final_line_total">Final Line Total</SelectItem></SelectContent></Select></div>
                      <div>{(linePreview.method === "agreed_unit_price" || linePreview.method === "final_line_total") && item.priceEntry ? <Select value={item.priceEntry.currency} onValueChange={value => changeCreatePriceEntryCurrency(idx, value as ServicePriceEntry["currency"])}><SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger><SelectContent>{["TRY", "USD", "EUR", "GBP", "SAR", "AED"].map(code => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent></Select> : <span className="block whitespace-nowrap text-[11px] text-muted-foreground">{currency} · Invoice</span>}</div>
                      <div><Select value={getInvoiceLineTaxControlValue({ taxSelection: item.taxSelection, taxIncludedMode: item.taxIncludedMode, taxRuleId: item.taxRuleId })} onValueChange={value => setCreateTaxControl(idx, value)}><SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No Tax</SelectItem><SelectItem value="custom:added">Custom — Added</SelectItem><SelectItem value="custom:included" disabled={linePreview.method !== "agreed_unit_price" && linePreview.method !== "final_line_total"}>Custom — Included</SelectItem>{(activeTaxRules as any[]).flatMap(rule => [<SelectItem key={`${rule.id}-added`} value={`rule:${rule.id}:added`}>{rule.label} — Added</SelectItem>, <SelectItem key={`${rule.id}-included`} value={`rule:${rule.id}:included`} disabled={linePreview.method !== "agreed_unit_price" && linePreview.method !== "final_line_total"}>{rule.label} — Included</SelectItem>])}</SelectContent></Select></div>
                      <div className="text-right">
                        <p className="text-xs font-semibold">{lineTotal.toFixed(2)}</p>
                        {hasTaxDetail && taxLine && <p className="text-[10px] text-sky-700">+ Tax {Number(taxLine.taxAmount).toFixed(2)} = {Number(taxLine.totalWithTax).toFixed(2)}</p>}
                      </div>
                      <div className="flex justify-end">
                        <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive text-xs">✕</button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 border-t pt-3 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <div className="space-y-1.5">
                        <div className="space-y-1.5 sm:hidden"><Label className="text-xs">Price Adjustment</Label><Select value={linePreview.method === "none" ? "standard" : linePreview.method} onValueChange={value => { if (value === "standard") resetLineToStandard(idx); else if (value === "agreed_unit_price") setCreateAgreedUnitPricing(idx); else setLinePricingMethod(idx, value as V4LinePricingMethod); }}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="standard">Standard</SelectItem><SelectItem value="discount_percent">Discount %</SelectItem><SelectItem value="agreed_unit_price">Agreed Unit Price</SelectItem><SelectItem value="final_line_total">Final Line Total</SelectItem></SelectContent></Select></div>
                        {linePreview.method === "discount_percent" && <Input type="number" min={0} max={100} step="0.01" value={item.lineDiscountPercent ?? "0"} onChange={e => updateItem(idx, "lineDiscountPercent", e.target.value)} className="h-8 text-xs" placeholder="Discount %" />}
                        {(linePreview.method === "agreed_unit_price" || linePreview.method === "final_line_total") && item.priceEntry && (
                          <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-2 sm:grid-cols-1">
                            <div className="sm:hidden"><Select value={item.priceEntry.currency} onValueChange={value => changeCreatePriceEntryCurrency(idx, value as ServicePriceEntry["currency"])}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["TRY", "USD", "EUR", "GBP", "SAR", "AED"].map(code => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent></Select></div>
                            <Input type="text" inputMode="decimal" value={item.priceEntry.amount} onChange={e => updatePriceEntry(idx, { amount: e.target.value })} className="h-8 text-xs" placeholder={linePreview.method === "agreed_unit_price" ? "Agreed unit price" : "Final line total"} />
                          </div>
                        )}
                        {linePreview.method === "final_line_total" && <p className="text-muted-foreground">Whole-line amount; quantity changes require Keep, Reset, or Cancel.</p>}
                        {linePreview.method === "agreed_unit_price" && item.priceEntry && <p className="text-muted-foreground">{item.priceEntry.amount || "0.00"} {item.priceEntry.currency} × {item.quantity}; quantity recalculates automatically.</p>}
                      </div>
                      <div className="space-y-1.5">
                        <div className="space-y-1.5 sm:hidden"><Label className="text-xs">Tax</Label><Select value={getInvoiceLineTaxControlValue({ taxSelection: item.taxSelection, taxIncludedMode: item.taxIncludedMode, taxRuleId: item.taxRuleId })} onValueChange={value => setCreateTaxControl(idx, value)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No Tax</SelectItem><SelectItem value="custom:added">Custom Tax — Added</SelectItem><SelectItem value="custom:included" disabled={linePreview.method !== "agreed_unit_price" && linePreview.method !== "final_line_total"}>Custom Tax — Included</SelectItem>{(activeTaxRules as any[]).flatMap(rule => [<SelectItem key={`${rule.id}-added`} value={`rule:${rule.id}:added`}>{rule.label} ({Number(rule.ratePercent).toFixed(2)}%) — Added</SelectItem>, <SelectItem key={`${rule.id}-included`} value={`rule:${rule.id}:included`} disabled={linePreview.method !== "agreed_unit_price" && linePreview.method !== "final_line_total"}>{rule.label} ({Number(rule.ratePercent).toFixed(2)}%) — Included</SelectItem>])}</SelectContent></Select></div>
                        {item.taxSelection?.type === "custom" && <Input type="text" inputMode="decimal" value={item.taxSelection.ratePercent} placeholder="Custom Tax %" onChange={e => updateLineTaxSelection(idx, { type: "custom", ratePercent: e.target.value })} className="h-8 text-xs" />}
                        {item.taxIncludedMode && <p className="text-muted-foreground">Included Tax keeps the entered commercial gross amount.</p>}
                      </div>
                      {item.priceEntry && item.priceEntry.currency !== currency && (
                        <div className="sm:col-span-2 rounded border border-sky-200 bg-sky-50/50 p-2 space-y-2">
                          <div className="flex flex-wrap gap-3"><label className="flex items-center gap-1"><input type="radio" checked={(item.priceEntry.fx?.source ?? "system") === "system"} onChange={() => setCreatePriceEntryFxSource(idx, "system")} />System FX</label><label className="flex items-center gap-1"><input type="radio" checked={item.priceEntry.fx?.source === "manual"} onChange={() => setCreatePriceEntryFxSource(idx, "manual")} />Manual Approved FX</label></div>
                          {item.priceEntry.fx?.source === "manual" && <div className="grid gap-2 sm:grid-cols-2"><div className="space-y-1"><Label className="text-xs">1 {item.priceEntry.currency} = X {currency}</Label><Input type="text" inputMode="decimal" value={getCreateManualServiceFxInput(idx, item.priceEntry)} onChange={e => updateCreateManualServiceFxInput(idx, e.target.value)} className="h-8 text-xs" placeholder="0.000000" /></div><div className="space-y-1"><Label className="text-xs">FX note (optional)</Label><Input value={item.priceEntry.fx.note ?? ""} onChange={e => updatePriceEntry(idx, { fx: { note: e.target.value } })} className="h-8 text-xs" placeholder="Optional approval context" /></div></div>}
                          {getSourcePricePreview(item) ? <p className="text-muted-foreground">Source line amount converts once before Tax. {getSourcePricePreview(item)!.convertedAmount} {currency} before Tax treatment.</p> : <p className="text-amber-700">Enter a valid amount and, for Manual FX, the approved rate.</p>}
                        </div>
                      )}
                      {linePreview.finalLineTotal !== linePreview.originalLineTotal && <p className="sm:col-span-2 text-muted-foreground">Standard reference line value: {currency} {linePreview.originalLineTotal.toFixed(2)}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Optional invoice-wide adjustment. The no-op remains discount + 0%. */}
          {items.length > 0 && (
            <div className="rounded-lg border bg-muted/10 p-3">
              <button type="button" onClick={() => {
                if (hasTaxIncludedLine) {
                  toast.error("Tax-Included line pricing can't be combined with invoice-wide pricing adjustments.");
                  return;
                }
                setInvoiceAdjustmentOpen(open => !open);
              }} className="flex w-full items-center justify-between gap-2 text-left">
                <span className="text-sm font-medium">Adjust invoice total</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${invoiceAdjustmentOpen ? "rotate-180" : ""}`} />
              </button>
              {!invoiceAdjustmentOpen && <p className="mt-1 text-xs text-muted-foreground">{hasTaxIncludedLine ? "Unavailable while a Tax-Included line price is active." : "Optional discount or final agreed price. The standard invoice total is unchanged."}</p>}
              {invoiceAdjustmentOpen && (
                <div className="mt-3 space-y-3 border-t pt-3">
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="radio" name="pricingMode" value="discount" checked={pricingMode === "discount"} onChange={() => { setPricingMode("discount"); setFinalAgreedPrice(""); }} className="accent-primary" />
                      Apply discount %
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="radio" name="pricingMode" value="agreed" checked={pricingMode === "agreed"} onChange={() => { setPricingMode("agreed"); setDiscountPercent(0); }} className="accent-primary" />
                      Set final agreed price
                    </label>
                  </div>
                  {pricingMode === "discount" ? (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Discount (%)</Label>
                      <div className="flex items-center gap-1.5">
                        <Input type="number" inputMode="decimal" value={discountPercent || ""} min={0} max={100} step="0.1" placeholder="0" className="h-11 sm:h-8 text-base sm:text-sm flex-1" onChange={e => setDiscountPercent(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} />
                        {discountPercent > 0 && <button type="button" onClick={() => setDiscountPercent(0)} className="text-muted-foreground hover:text-destructive text-base shrink-0 p-1" title="Clear discount">✕</button>}
                      </div>
                      {discountPercent > 0 && <p className="text-sm text-emerald-600">− {currency} {discountAmt.toFixed(2)}</p>}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Final agreed price ({currency})</Label>
                      <Input type="text" inputMode="decimal" value={finalAgreedPrice} placeholder={subtotalBeforeDiscount > 0 ? subtotalBeforeDiscount.toFixed(2) : "0.00"} className={`h-11 sm:h-8 text-base sm:text-sm ${agreedPriceWarning ? "border-red-400 focus-visible:ring-red-400" : ""}`} onChange={e => { const normalized = normalizeServicePriceDecimalInput(e.target.value); if (normalized !== null) setFinalAgreedPrice(normalized); }} />
                      {agreedPriceWarning && <p className="text-sm text-red-500">{agreedPriceWarning}</p>}
                      <p className="text-xs text-muted-foreground">The patient pays exactly this amount regardless of payment method.</p>
                    </div>
                  )}
                  {(pricingMode === "agreed" || discountPercent > 0) && <button type="button" onClick={() => { setPricingMode("discount"); setDiscountPercent(0); setFinalAgreedPrice(""); setInvoiceAdjustmentOpen(false); }} className="text-xs text-muted-foreground hover:text-destructive">Reset to standard invoice total</button>}
                </div>
              )}
            </div>
          )}
          {/* V3: Simplified Patient Total summary */}
          {items.length > 0 && (
            <div className="border rounded-lg p-3 bg-muted/20 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Invoice Summary</p>
              {!taxPreview && (
                <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                  {taxPreviewIssue ?? "Complete the Tax details for this line before totals can be calculated."}
                </p>
              )}
              {discountAmt > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{currency} {subtotalBeforeDiscount.toFixed(2)}</span>
                </div>
              )}
              {discountAmt > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>{pricingMode === "discount" ? `Discount (${discountPercent}%)` : "Discount"}</span>
                  <span>− {currency} {discountAmt.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold border-t pt-1">
                <span>Service Total</span>
                <span>{currency} {cashTotal.toFixed(2)}</span>
              </div>
              {taxPreview && Number(taxPreview.totalTaxAmount) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Service Tax</span>
                  <span>{currency} {Number(taxPreview.totalTaxAmount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold border-t pt-1">
                <span>Patient Total</span>
                <span>{invoiceTotalWithTax == null ? "Complete Tax details" : `${currency} ${invoiceTotalWithTax.toFixed(2)}`}</span>
              </div>
              {/* V3: Card hint only in Mode A */}
              {pricingMode === "discount" && cardTotal !== null && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Card / Bank Transfer (+{Math.round(surchargeRate * 100)}%)</span>
                  <span>{currency} {cardTotal.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* Payment Recording — Step 4 */}
          {items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Payment Recording</Label>
                <Button variant="ghost" size="sm" className="text-sm h-8" onClick={addPayment}>+ Add Method</Button>
              </div>
              {Number((createInvoiceCredit as any)?.balance ?? 0) > 0.001 && (
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
                  <div className="flex items-center gap-1.5 font-semibold"><Wallet className="h-3.5 w-3.5" />Available Patient Credit: {currency} {Number((createInvoiceCredit as any).balance).toFixed(2)}</div>
                  <p className="mt-0.5 text-violet-600">Credit is not applied automatically. Create the invoice, then choose <strong>Apply Credit</strong> from that invoice’s actions.</p>
                </div>
              )}
              {payments.map((p, idx) => {
                const previewIndex = validInitialPayments.indexOf(p);
                const preview = previewIndex >= 0 ? initialPaymentPreview?.payments?.[previewIndex] : undefined;
                const expectedNativeCredit = previewIndex >= 0
                  ? initialPaymentPreview?.expectedNativePatientCredits?.find((credit: any) => credit.paymentIndex === previewIndex)
                  : undefined;
                return (
                  <div key={idx} className="space-y-2 rounded-lg border bg-muted/10 p-3">
                    <div className="grid gap-2 sm:grid-cols-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Payment method</Label>
                        <Select value={p.method} onValueChange={v => updatePayment(idx, "method", v as any)}>
                          <SelectTrigger className="h-11 sm:h-8 text-base sm:text-xs w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="card">Card</SelectItem>
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{p.method === "bank_transfer" ? "Actual amount sent" : "Amount received"}</Label>
                        <Input type="text" inputMode="decimal" placeholder="0.00" value={p.amount} onChange={e => updatePayment(idx, "amount", e.target.value)} className="h-11 sm:h-8 text-base sm:text-xs w-full" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Payment currency</Label>
                        <Select value={p.currency} onValueChange={value => updatePayment(idx, "currency", value as PaymentEntry["currency"])}>
                          <SelectTrigger className="h-11 sm:h-8 text-base sm:text-xs w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>{["TRY", "USD", "EUR", "GBP", "SAR", "AED", "AUD"].map(code => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Received At</Label>
                        <Input type="datetime-local" value={p.receivedAtValue} onChange={e => updatePayment(idx, "receivedAtValue", e.target.value)} className="h-11 sm:h-8 text-base sm:text-xs w-full" />
                      </div>
                    </div>
                    {p.method === "bank_transfer" && <div className="grid grid-cols-2 gap-2 rounded bg-amber-50/60 p-2">
                      <div className="space-y-1"><Label className="text-xs text-muted-foreground">Bank Deduction Amount</Label><Input type="text" inputMode="decimal" value={p.bankDeductionAmount ?? ""} onChange={e => updatePayment(idx, "bankDeductionAmount", e.target.value)} className="h-8 text-xs" placeholder="0.00" /></div>
                      <div className="space-y-1"><Label className="text-xs text-muted-foreground">or Deduction %</Label><Input type="text" inputMode="decimal" value={p.bankDeductionPercent ?? ""} onChange={e => updatePayment(idx, "bankDeductionPercent", e.target.value)} className="h-8 text-xs" placeholder="0.00" /></div>
                      <p className="col-span-2 text-[11px] text-muted-foreground">Enter either an amount or percentage. FX and invoice settlement use the net amount actually received.</p>
                    </div>}
                    <ManualFxDisclosure paymentCurrency={p.currency} invoiceCurrency={currency} value={p.manualFx} onChange={manualFx => updatePayment(idx, "manualFx", manualFx)} />
                    {parseFloat(p.amount || "0") > 0 && (
                      <div className="rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-900">
                        {initialPaymentPreviewLoading ? "Calculating server payment preview…" : initialPaymentPreviewError ? initialPaymentPreviewError.message : preview ? <>
                          {preview.grossAmountSent && <p>Sent: {preview.grossAmountSent} {preview.paymentCurrency} · Bank Deduction: {preview.bankDeductionAmount} {preview.paymentCurrency} · Net received: {preview.enteredAmount} {preview.paymentCurrency}</p>}
                          <p>Received: {preview.enteredAmount} {preview.paymentCurrency} · Converted value: {preview.amountInInvoiceCurrency} {preview.invoiceCurrency}</p>
                          {preview.paymentCurrency !== preview.invoiceCurrency && <p>FX: 1 {preview.invoiceCurrency === "TRY" ? preview.paymentCurrency : preview.invoiceCurrency} = TRY {preview.invoiceCurrency === "TRY" ? preview.paymentToTryRate : preview.invoiceToTryRate} · Source: {preview.fxRateSource === "manual" ? "Manual" : "System"}</p>}
                          <p>Applied to invoice: {preview.settledAmount} {preview.invoiceCurrency} · Remaining: {preview.currentRemaining} → {preview.expectedRemaining}</p>
                          {expectedNativeCredit && <p className="font-medium text-violet-800">Expected Patient Credit: {expectedNativeCredit.amount} {expectedNativeCredit.currency} (native currency)</p>}
                        </> : "Waiting for valid payment details."}
                      </div>
                    )}
                    {payments.length > 1 && <button type="button" onClick={() => removePayment(idx)} className="text-xs text-muted-foreground hover:text-destructive">Remove payment</button>}
                  </div>
                );
              })}
              {/* V3: Simplified Patient Total / Amount Received / Balance Remaining */}
              {totalAmountReceived > 0 && (
                <div className="border rounded p-2 bg-background space-y-1 text-xs">
                  {payments.filter(p => parseFloat(p.amount || "0") > 0).map((p, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-muted-foreground capitalize">{p.method.replace(/_/g, " ")}</span>
                      <span>{p.currency} {parseFloat(p.amount).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-1 flex justify-between font-semibold">
                    <span>Service Total</span>
                    <span>{currency} {cashTotal.toFixed(2)}</span>
                  </div>
                  {taxPreview && Number(taxPreview.totalTaxAmount) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Service Tax</span>
                      <span>{currency} {Number(taxPreview.totalTaxAmount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold">
                    <span>Patient Total</span>
                    <span>{invoiceTotalWithTax == null ? "Complete Tax details" : `${currency} ${invoiceTotalWithTax.toFixed(2)}`}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gross Received (converted)</span>
                    <span>{initialPaymentPreview ? `${currency} ${Number(initialPaymentPreview.totalReceivedInInvoiceCurrency).toFixed(2)}` : "Waiting for server preview"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Applied to Invoice</span>
                    <span className="text-emerald-600">{initialPaymentPreview ? `${currency} ${totalSettled.toFixed(2)}` : "Waiting for server preview"}</span>
                  </div>
                  {(initialPaymentPreview?.expectedNativePatientCredits?.length ?? 0) > 0 && (
                    <div className="space-y-0.5 border-t pt-1 text-violet-800">
                      {initialPaymentPreview!.expectedNativePatientCredits.map((credit: any) => (
                        <div key={`${credit.paymentIndex}-${credit.currency}`} className="flex justify-between">
                          <span>Expected Patient Credit</span>
                          <span className="font-semibold">{credit.amount} {credit.currency} native</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between font-semibold">
                    <span>Balance Remaining</span>
                    <span className={(balanceRemaining ?? 0) > 0.01 ? "text-amber-600" : "text-emerald-600"}>
                      {balanceRemaining == null ? "Complete Tax details" : balanceRemaining > 0.01 ? `${currency} ${balanceRemaining.toFixed(2)}` : "Fully Paid ✓"}
                    </span>
                  </div>
                  {/* V3: Contextual collection hint — Mode A non-cash only */}
                  {collectionHint !== null && (
                    <div className="text-xs text-muted-foreground pt-1 border-t">
                      To fully settle by {lastPaymentMethod.replace(/_/g, " ")}: {currency} {collectionHint.toFixed(2)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="text-base sm:text-xs" placeholder="Payment terms, notes..." />
          </div>

          {hasLinkedPartner && (
            <div className="flex items-start gap-3 rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-700 p-3">
              <input
                type="checkbox"
                id="invoiceNotifyPartner"
                checked={notifyPartner}
                onChange={e => setNotifyPartner(e.target.checked)}
                className="mt-0.5 accent-orange-500"
              />
              <div>
                <label htmlFor="invoiceNotifyPartner" className="text-sm font-medium text-orange-700 dark:text-orange-400 cursor-pointer">
                  Also send invoice email to linked partner
                </label>
                <p className="text-xs text-orange-600 dark:text-orange-500 mt-0.5">
                  The partner account linked to this patient will receive a copy of this invoice.
                </p>
              </div>
            </div>
          )}
          <label className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
            <input
              type="checkbox"
              id="openInvoiceSendAfterCreate"
              checked={openSendAfterSave}
              onChange={event => setOpenSendAfterSave(event.target.checked)}
              className="mt-0.5 accent-sky-600"
            />
            <span>
              <span className="block text-sm font-medium text-sky-900">Open Send Invoice after save</span>
              <span className="block text-xs text-sky-700">The invoice is saved first. Review recipients and press Send Email separately.</span>
            </span>
          </label>
      <AlertDialog open={pendingQuantityChange !== null} onOpenChange={isOpen => { if (!isOpen) setPendingQuantityChange(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Choose how to update this agreed line</AlertDialogTitle>
            <AlertDialogDescription>
              This price applies to the whole line, not each unit. Keep the agreed total with the new quantity, or reset to standard unit price × quantity. Cancel leaves this quantity unchanged. No invoice record is changed until you save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel quantity change</AlertDialogCancel>
            <AlertDialogAction onClick={keepAgreedLineTotalAfterQuantityChange}>Keep agreed total</AlertDialogAction>
            <Button type="button" variant="outline" onClick={resetLinePricingAfterQuantityChange}>Reset to standard price</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  const invoiceFooter = (
    <div className="sticky bottom-0 z-10 shrink-0 flex gap-2 border-t px-4 py-3 bg-background" style={{paddingBottom: 'max(12px, env(safe-area-inset-bottom))'}}>
      <Button variant="outline" className="flex-1 h-11 text-base" onClick={cancelCreateInvoice}>Cancel</Button>
      <Button className="flex-1 h-11 text-base" onClick={handleSubmit} disabled={createInvoice.isPending || items.length === 0 || !!agreedPriceWarning || (pricingMode === "agreed" && !finalAgreedPrice) || (validInitialPayments.length > 0 && (initialPaymentPreviewLoading || !initialPaymentPreview))}>
        {createInvoice.isPending ? "Creating..." : "Create Invoice"}
      </Button>
    </div>
  );

  if (!open) return null;

  if (isMobile) {
    // Mobile: Radix Sheet — single interaction layer, no split focus/overlay conflict.
    // SheetContent with side="bottom" + full-height override = full-screen sheet.
    // The inner scroll div has no overflow:hidden parent, so Safari uses normal
    // element scroll to bring focused inputs into view — no viewport pan/stuck zoom.
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          className="!p-0 !gap-0 !rounded-none !inset-0 !h-[100dvh] !max-h-[100dvh] flex flex-col w-full"
          style={{ maxWidth: "100vw" }}
        >
          <SheetTitle className="sr-only">Create Invoice</SheetTitle>
          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-background">
            <span className="font-semibold text-base">Create Invoice</span>
          </div>
          <div className="flex-1 overflow-y-scroll overscroll-contain" style={{ WebkitOverflowScrolling: "touch" as any }}>
            {formBody}
          </div>
          {invoiceFooter}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="!grid-cols-none !gap-0 !p-0 w-[calc(100vw-1rem)] lg:w-[94vw] max-w-[1680px] min-h-[500px] max-h-[90vh] !flex flex-col">
        <DialogHeader className="shrink-0 px-4 pt-4 pb-2 border-b"><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {formBody}
        </div>
        {invoiceFooter}
      </DialogContent>
    </Dialog>
  );
}

// ─── Invoice PDF Export ──────────────────────────────────────────────────────────────
const BRAND_LOGO = "/manus-storage/logo-horizontal_473c1b94.png";
const BRAND_STAMP_BILLS = "/manus-storage/stamp-bills_23e4f414.png";
// Doctor stamp removed from invoices — billing stamp only

function exportInvoicePDF(inv: any, _patient?: any) {
  // Use the REST endpoint so the PDF is identical to the email-attached version
  // (includes payment methods section with Cash / Card+Bank totals)
  const url = `/api/invoices/${inv.id}/pdf`;
  const win = window.open(url, "_blank");
  if (!win) { toast.error("Popup blocked — allow popups to open PDF"); }
}

function _exportInvoicePDFLegacy(inv: any, patient?: any) {
  const patientName = patient ? `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim() : (inv.patientFirstName ? `${inv.patientFirstName} ${inv.patientLastName ?? ""}`.trim() : "Patient");
  const mrn = patient?.mrn ?? inv.patientMrn ?? "";
  const issueDate = inv.issueDate ? fmtDateLong(inv.issueDate) : "";
  const dueDate = inv.dueDate ? fmtDateLong(inv.dueDate) : "";

  const cur = (inv as any).currency ?? "TRY";
  const discPct = parseFloat((inv as any).discountPercent ?? "0");
  const discAmt = parseFloat(String(inv.discountAmount ?? "0"));
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Invoice ${inv.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #140063; background: #fff; padding: 40px; }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #140063; padding-bottom: 20px; margin-bottom: 28px; }
    .logo { height: 60px; }
    .clinic-info { text-align: right; font-size: 11px; line-height: 1.7; color: #444; }
    .clinic-info strong { color: #140063; font-size: 13px; }
    .invoice-title { font-size: 28px; font-weight: 700; color: #140063; margin-bottom: 4px; }
    .invoice-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
    .meta-block { background: #f9f6ff; border-radius: 8px; padding: 14px 18px; }
    .meta-block h4 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 6px; }
    .meta-block p { font-size: 13px; font-weight: 600; }
    .meta-block .sub { font-size: 11px; font-weight: 400; color: #555; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead th { background: #140063; color: #fff; padding: 10px 12px; font-size: 11px; text-align: left; }
    tbody tr:nth-child(even) { background: #f5f3ff; }
    tbody td { padding: 9px 12px; font-size: 12px; border-bottom: 1px solid #e8e4f5; }
    .totals { margin-left: auto; width: 280px; }
    .totals tr td { padding: 5px 10px; font-size: 12px; }
    .totals tr.total td { font-weight: 700; font-size: 15px; border-top: 2px solid #140063; padding-top: 8px; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .status-paid { background: #d1fae5; color: #065f46; }
    .status-issued { background: #dbeafe; color: #1e40af; }
    .status-partial { background: #fef3c7; color: #92400e; }
    .status-overdue { background: #fee2e2; color: #991b1b; }
    .stamps { display: flex; justify-content: flex-end; gap: 32px; margin-top: 40px; align-items: flex-end; }
    .stamp-block { text-align: center; }
    .stamp-block img { height: 90px; opacity: 0.92; }
    .stamp-block p { font-size: 10px; color: #888; margin-top: 4px; }
    .notes { background: #fdf8f3; border-left: 4px solid #FECFB3; padding: 10px 14px; border-radius: 4px; font-size: 11px; color: #555; margin-bottom: 20px; }
    .footer { margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 14px; text-align: center; font-size: 10px; color: #999; line-height: 1.8; }
    @media print { body { padding: 20px; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="${window.location.origin}${BRAND_LOGO}" class="logo" alt="Fertiliv" />
    <div class="clinic-info">
      <strong>Fertiliv IVF Center</strong><br/>
      Halaskargazi, Vali Konağı Cd. No:73, 34371 Şişli/İstanbul, Turkey<br/>
      +90 501 114 70 60 &nbsp;·&nbsp; info@fertiliv.com<br/>
      Mon–Fri 09:00–18:00 &nbsp;·&nbsp; Sat 09:00–14:00
    </div>
  </div>

  <div style="display:flex;align-items:baseline;gap:16px;margin-bottom:24px;">
    <div class="invoice-title">INVOICE</div>
    <div style="font-size:16px;font-weight:600;color:#555;">${inv.invoiceNumber}</div>
    <span class="status-badge status-${inv.status}">${inv.status}</span>
  </div>

  <div class="invoice-meta">
    <div class="meta-block">
      <h4>Billed To</h4>
      <p>${patientName}</p>
      ${mrn ? `<p class="sub">MRN: ${mrn}</p>` : ""}
    </div>
    <div class="meta-block">
      <h4>Invoice Details</h4>
      <p>Issue Date: ${issueDate}</p>
      ${dueDate ? `<p class="sub">Due Date: ${dueDate}</p>` : ""}
    </div>
  </div>

  <table>
    <thead><tr><th style="width:50%">Description</th><th style="width:15%">Qty</th><th style="width:17%">Unit Price</th><th style="width:18%">Total</th></tr></thead>
    <tbody id="items-body"><tr><td colspan="4" style="text-align:center;color:#aaa;">Loading items...</td></tr></tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td style="text-align:right;">${cur} ${Number(inv.subtotal ?? inv.totalAmount).toLocaleString("en", { minimumFractionDigits: 2 })}</td></tr>
    ${discPct > 0 || discAmt > 0 ? `<tr><td>Discount${discPct > 0 ? ` (${discPct}%)` : ""}</td><td style="text-align:right;">- ${cur} ${discAmt.toLocaleString("en", { minimumFractionDigits: 2 })}</td></tr>` : ""}
    <tr class="total"><td>Total</td><td style="text-align:right;">${cur} ${Number(inv.totalAmount).toLocaleString("en", { minimumFractionDigits: 2 })}</td></tr>
    ${Number(inv.paidAmount ?? 0) > 0 ? `<tr><td style="color:#065f46;">Paid</td><td style="text-align:right;color:#065f46;">${cur} ${Number(inv.paidAmount).toLocaleString("en", { minimumFractionDigits: 2 })}</td></tr>` : ""}
    ${Number(inv.totalAmount) - Number(inv.paidAmount ?? 0) > 0.01 ? `<tr><td style="color:#b91c1c;">Balance Due</td><td style="text-align:right;color:#b91c1c;font-weight:700;">${cur} ${(Number(inv.totalAmount) - Number(inv.paidAmount ?? 0)).toLocaleString("en", { minimumFractionDigits: 2 })}</td></tr>` : ""}
  </table>

  ${inv.notes ? `<div class="notes"><strong>Notes:</strong> ${inv.notes}</div>` : ""}

  <div class="stamps">
    <div class="stamp-block">
      <img src="${window.location.origin}${BRAND_STAMP_BILLS}" alt="Official Stamp" />
      <p>Official Stamp</p>
    </div>
  </div>

  <div class="footer">
    Fertiliv IVF Center &nbsp;·&nbsp; Halaskargazi, Vali Konağı Cd. No:73, 34371 Şişli/İstanbul, Turkey<br/>
    +90 501 114 70 60 &nbsp;·&nbsp; info@fertiliv.com &nbsp;·&nbsp; fertiliv.com<br/>
    Instagram: @fertiliv &nbsp;·&nbsp; WhatsApp: +90 501 114 70 60
  </div>

  <div class="no-print" style="text-align:center;margin-top:24px;">
    <button onclick="window.print()" style="background:#140063;color:#fff;border:none;padding:10px 28px;border-radius:6px;font-size:14px;cursor:pointer;">Print / Save as PDF</button>
  </div>

  <script>
    // Load invoice items via fetch
    fetch('/api/trpc/finance.invoiceItems?input=' + encodeURIComponent(JSON.stringify({json:{invoiceId:${inv.id}}}))).then(r=>r.json()).then(data=>{
      const items = data?.result?.data?.json ?? [];
      const tbody = document.getElementById('items-body');
      if (items.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#aaa;">No items</td></tr>'; return; }
      const cur = '${cur}';
      tbody.innerHTML = items.map(i => { const label = String(i.lineLabel ?? '').trim(); const name = label ? i.description + (label.startsWith('—') ? ' ' : ' — ') + label : i.description; return '<tr><td>'+name+'</td><td>'+i.quantity+'</td><td style="text-align:right;">'+cur+' '+Number(i.unitPrice).toLocaleString('en',{minimumFractionDigits:2})+'</td><td style="text-align:right;">'+cur+' '+Number(i.totalPrice).toLocaleString('en',{minimumFractionDigits:2})+'</td></tr>'; }).join('');
    }).catch(()=>{});
  </script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { toast.error("Popup blocked — allow popups to open PDF"); return; }
  win.document.write(html);
  win.document.close();
}

// ─── Credit Refund Receipt PDF ──────────────────────────────────────────────────────
function exportCreditRefundPDF(tx: any, patient?: any) {
  const patientName = patient ? `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim() : "Patient";
  const mrn = patient?.mrn ?? "";
  const refundDate = fmtDateLong(tx.createdAt ?? new Date());
  const receiptNo = `RCR-${String(tx.id).padStart(6, "0")}`;
  const amount = Math.abs(parseFloat(String(tx.amount ?? 0)));
  const currency = tx.currency ?? "TRY";
  // Parse notes for original currency info
  const notesText = tx.notes ?? "";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Credit Refund Receipt ${receiptNo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #140063; background: #fff; padding: 40px; }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #140063; padding-bottom: 20px; margin-bottom: 28px; }
    .logo { height: 60px; }
    .clinic-info { text-align: right; font-size: 11px; line-height: 1.7; color: #444; }
    .clinic-info strong { color: #140063; font-size: 13px; }
    .title { font-size: 28px; font-weight: 700; color: #140063; margin-bottom: 4px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
    .meta-block { background: #f9f6ff; border-radius: 8px; padding: 14px 18px; }
    .meta-block h4 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 6px; }
    .meta-block p { font-size: 13px; font-weight: 600; }
    .amount-box { background: #fdf4ff; border: 2px solid #a855f7; border-radius: 10px; padding: 24px; text-align: center; margin: 28px 0; }
    .amount-box .label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
    .amount-box .value { font-size: 36px; font-weight: 800; color: #7c3aed; }
    .notes-box { background: #fdf8f3; border-left: 4px solid #FECFB3; padding: 10px 14px; border-radius: 4px; font-size: 11px; color: #555; margin-bottom: 20px; }
    .footer { margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 14px; text-align: center; font-size: 10px; color: #999; line-height: 1.8; }
    .print-btn { margin: 24px 0; text-align: center; }
    @media print { .print-btn { display: none; } body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="${window.location.origin}${BRAND_LOGO}" class="logo" alt="Fertiliv" />
    <div class="clinic-info">
      <strong>Fertiliv IVF Center</strong><br/>
      Halaskargazi, Vali Konağı Cd. No:73, 34371 Şişli/İstanbul, Turkey<br/>
      +90 501 114 70 60 &nbsp;·&nbsp; info@fertiliv.com<br/>
      Mon–Fri 09:00–18:00 &nbsp;·&nbsp; Sat 09:00–14:00
    </div>
  </div>
  <div style="display:flex;align-items:baseline;gap:16px;margin-bottom:24px;">
    <div class="title">CREDIT REFUND RECEIPT</div>
    <div style="font-size:16px;font-weight:600;color:#555;">${receiptNo}</div>
  </div>
  <div class="meta-grid">
    <div class="meta-block">
      <h4>Patient</h4>
      <p>${patientName}</p>
      ${mrn ? `<p class="sub" style="font-size:11px;font-weight:400;color:#555;">MRN: ${mrn}</p>` : ""}
    </div>
    <div class="meta-block">
      <h4>Refund Date</h4>
      <p>${refundDate}</p>
    </div>
  </div>
  <div class="amount-box">
    <div class="label">Refund Amount</div>
    <div class="value">${currency} ${amount.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
  </div>
  ${notesText ? `<div class="notes-box"><strong>Notes:</strong> ${notesText}</div>` : ""}
  <div class="print-btn">
    <button onclick="window.print()" style="background:#7c3aed;color:#fff;border:none;padding:10px 28px;border-radius:6px;font-size:14px;cursor:pointer;">Print / Save as PDF</button>
  </div>
  <div class="footer">
    Fertiliv IVF Center &nbsp;·&nbsp; info@fertiliv.com &nbsp;·&nbsp; +90 501 114 70 60<br/>
    This is an official credit refund receipt. Please retain for your records.
  </div>
</body>
</html>`;
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { toast.error("Popup blocked — allow popups to open PDF"); return; }
  win.document.write(html);
  win.document.close();
}

function openPatientCreditPayoutReceipt(payoutId: number) {
  const receiptWindow = window.open(`/finance/payout-receipts/${payoutId}`, "_blank", "noopener,noreferrer");
  if (!receiptWindow) toast.error("Popup blocked — allow popups to open the payout receipt.");
}

type ManualFxDraft = {
  open: boolean;
  source: "system" | "manual";
  paymentToTryRate: string;
  invoiceToTryRate: string;
  note: string;
};

const emptyManualFxDraft = (): ManualFxDraft => ({
  open: false,
  source: "system",
  paymentToTryRate: "",
  invoiceToTryRate: "",
  note: "",
});

function toManualFxPayload(draft: ManualFxDraft, paymentCurrency: string, invoiceCurrency: string) {
  if (paymentCurrency === invoiceCurrency || draft.source !== "manual") return undefined;
  return {
    paymentToTryRate: paymentCurrency === "TRY" ? undefined : draft.paymentToTryRate,
    invoiceToTryRate: invoiceCurrency === "TRY" ? undefined : draft.invoiceToTryRate,
    note: draft.note,
  };
}

function ManualFxDisclosure({
  paymentCurrency,
  invoiceCurrency,
  value,
  onChange,
  disabled = false,
}: {
  paymentCurrency: string;
  invoiceCurrency: string;
  value: ManualFxDraft;
  onChange: (next: ManualFxDraft) => void;
  disabled?: boolean;
}) {
  if (paymentCurrency === invoiceCurrency) return null;
  const update = (patch: Partial<ManualFxDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="rounded-md border border-sky-200 bg-sky-50/50 p-2 text-xs">
      <button
        type="button"
        disabled={disabled}
        onClick={() => update({ open: !value.open })}
        className="flex w-full items-center justify-between gap-2 text-left font-medium text-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span>Adjust exchange rate</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${value.open ? "rotate-180" : ""}`} />
      </button>
      {!value.open && <p className="mt-1 text-[11px] text-sky-700">System FX based on Received At is used by default.</p>}
      {value.open && (
        <div className="mt-2 space-y-2 border-t border-sky-200 pt-2">
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1.5"><input type="radio" checked={value.source === "system"} disabled={disabled} onChange={() => update({ source: "system" })} />System rate</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={value.source === "manual"} disabled={disabled} onChange={() => update({ source: "manual" })} />Manual approved rate</label>
          </div>
          {value.source === "manual" && (
            <div className="space-y-2">
              <p className="text-[11px] text-sky-800">Enter each rate only as <strong>1 currency unit = X TRY</strong>. Reciprocal rates are not accepted.</p>
              {paymentCurrency !== "TRY" && (
                <div className="space-y-1">
                  <Label className="text-[11px]">1 {paymentCurrency} = TRY</Label>
                  <Input type="text" inputMode="decimal" value={value.paymentToTryRate} disabled={disabled} onChange={(event) => { const normalized = normalizeServicePriceDecimalInput(event.target.value); if (normalized !== null) update({ paymentToTryRate: normalized }); }} placeholder="0.0000" className="h-8 text-xs" />
                </div>
              )}
              {invoiceCurrency !== "TRY" && (
                <div className="space-y-1">
                  <Label className="text-[11px]">1 {invoiceCurrency} = TRY</Label>
                  <Input type="text" inputMode="decimal" value={value.invoiceToTryRate} disabled={disabled} onChange={(event) => { const normalized = normalizeServicePriceDecimalInput(event.target.value); if (normalized !== null) update({ invoiceToTryRate: normalized }); }} placeholder="0.0000" className="h-8 text-xs" />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-[11px]">Manual FX audit note <span className="text-destructive">*</span></Label>
                <Textarea value={value.note} disabled={disabled} onChange={(event) => update({ note: event.target.value })} rows={2} maxLength={500} placeholder="e.g. Agreed historical rate from hospital payment receipt" className="text-xs" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Edit Invoice Modal ──────────────────────────────────────────────────────────────
// ─── Record Payment Modal ────────────────────────────────────────────────────
function RecordPaymentModal({ open, invoice, patientId, onClose, onSuccess }: { open: boolean; invoice: any; patientId: number; onClose: () => void; onSuccess: () => void }) {
  const { user } = useAuth();
  const { data: payments, refetch: refetchPayments } = trpc.finance.listPayments.useQuery({ invoiceId: invoice.id, includeVoided: true }, { enabled: open, refetchOnMount: "always", staleTime: 0 });
  const createPayment = trpc.finance.createPayment.useMutation({
    onSuccess: (result: any) => {
      toast.success(Number(result?.creditAmount ?? 0) > 0 ? `Payment recorded and ${result.creditAmount} ${currency} Patient Credit created.` : "Payment recorded");
      refetchPayments();
      onSuccess();
    },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });
  const [paymentToVoid, setPaymentToVoid] = useState<any | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const canVoidPayments = ["admin", "manager", "staff"].includes(user?.role ?? "");
  const voidPayment = trpc.finance.voidPayment.useMutation({
    onSuccess: () => {
      toast.success("Payment voided. The original entry remains in financial history.");
      setPaymentToVoid(null);
      setVoidReason("");
      refetchPayments();
      onSuccess();
    },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "credit_card" | "bank_transfer" | "insurance" | "other">("cash");
  const [currency, setCurrency] = useState<"USD" | "EUR" | "GBP" | "TRY" | "SAR" | "AED" | "AUD">((invoice.currency as any) ?? "TRY");
  const [notes, setNotes] = useState("");
  const [receivedAtValue, setReceivedAtValue] = useState(() => toDateInputValue(new Date()));
  const [manualFx, setManualFx] = useState<ManualFxDraft>(emptyManualFxDraft);
  const [bankDeductionAmount, setBankDeductionAmount] = useState("");
  const [bankDeductionPercent, setBankDeductionPercent] = useState("");

  const invCur = (invoice.currency as string) ?? "TRY";
  // Use invoice.paidAmount from DB as the source of truth for what's been paid.
  // This already accounts for refunds (createRefund reduces paidAmount directly).
  // Re-summing payments would ignore refunds and show wrong remaining balance.
  const remaining = Math.max(0, Number(invoice.totalAmount) - Number(invoice.paidAmount ?? 0));
  const enteredAmt = parseFloat(amount) || 0;
  const receivedAt = useMemo(() => {
    const parsed = new Date(receivedAtValue);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [receivedAtValue]);
  const manualFxPayload = useMemo(() => toManualFxPayload(manualFx, currency, invCur), [manualFx, currency, invCur]);
  const bankDeduction = useMemo(() => method === "bank_transfer" ? { amount: bankDeductionAmount || undefined, percent: bankDeductionPercent || undefined } : undefined, [method, bankDeductionAmount, bankDeductionPercent]);
  const previewInput = useMemo(() => ({ invoiceId: invoice.id, amount: Math.max(enteredAmt, 0.01), currency, method, receivedAt, manualFx: manualFxPayload, bankDeduction }), [invoice.id, enteredAmt, currency, method, receivedAt, manualFxPayload, bankDeduction]);
  const previewEnabled = open && enteredAmt > 0 && !!receivedAtValue;
  const { data: paymentPreview, isFetching: previewLoading, error: previewError } = trpc.finance.previewPayment.useQuery(previewInput, { enabled: previewEnabled, retry: false });

  const handleSubmit = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");

    if (!paymentPreview || previewLoading) return toast.error("Waiting for the server payment preview. Please try again.");
    createPayment.mutate({ invoiceId: invoice.id, amount: amt, currency: currency as any, method, notes: notes || undefined, receivedAt, manualFx: manualFxPayload, bankDeduction });
    setAmount(""); setNotes(""); setManualFx(emptyManualFxDraft()); setBankDeductionAmount(""); setBankDeductionPercent("");
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Payments — {invoice.invoiceNumber}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/30">
            <div><p className="text-xs text-muted-foreground">Invoice Total</p><p className="font-bold">{Number(invoice.totalAmount).toLocaleString()} {invoice.currency ?? "TRY"}</p></div>
            <div><p className="text-xs text-muted-foreground">Remaining</p><p className={`font-bold ${remaining > 0 ? "text-amber-600" : "text-emerald-600"}`}>{remaining.toLocaleString()} {invoice.currency ?? "TRY"}</p></div>
          </div>

          {/* Existing payments */}
          {payments && payments.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment History</p>
              {payments.map((p: any) => {
                const isVoided = p.status === "voided";
                return (
                <div key={p.id} className={`flex items-center gap-2 p-2 rounded border text-xs ${isVoided ? "border-amber-300 bg-amber-50/60" : "bg-card"}`}>
                  <div className="flex-1">
                    <span className="font-semibold">{Number(p.amount).toLocaleString()} {p.currency}</span>
                    <span className="text-muted-foreground ml-2">via {p.method?.replace("_", " ")}</span>
                    {p.notes && <span className="text-muted-foreground ml-2">· {p.notes}</span>}
                    {p.method === "bank_transfer" && p.bankGrossAmountSent != null && (
                      <div className="mt-1 text-[11px] text-amber-800">Amount sent: {Number(p.bankGrossAmountSent).toLocaleString()} {p.currency} · Bank Deduction: {Number(p.bankDeductionAmount ?? 0).toLocaleString()} {p.currency}{p.bankDeductionPercent != null ? ` (${Number(p.bankDeductionPercent).toFixed(2)}%)` : ""} · Net received: {Number(p.amount).toLocaleString()} {p.currency}</div>
                    )}
                    {p.currency !== invCur && p.amountInInvoiceCurrency != null && (
                      <div className="mt-1 text-[11px] text-sky-800">
                        Applied to invoice: {Number(p.amountInInvoiceCurrency).toLocaleString()} {invCur} · Direct FX: {p.conversionRateToInvoice}
                        {p.fxRateSource && <span> · Source: {p.fxRateSource === "manual" ? "Manual" : "System"}</span>}
                        {p.fxRateNote && <span> · Note: {p.fxRateNote}</span>}
                      </div>
                    )}
                    {isVoided && (
                      <div className="mt-1 text-amber-700">
                        <Badge variant="outline" className="mr-1 border-amber-400 bg-amber-100 text-[10px] text-amber-800">Voided</Badge>
                        <span>by {p.voidedByName ?? "Unknown user"} on {p.voidedAt ? format(new Date(p.voidedAt), "MMM d, yyyy HH:mm") : "unknown date"}</span>
                        {p.voidReason && <span> · Reason: {p.voidReason}</span>}
                      </div>
                    )}
                  </div>
                  <span className="text-right text-muted-foreground">{p.receivedAt ? `Received: ${format(new Date(p.receivedAt), "MMM d")}` : format(new Date(p.createdAt), "MMM d")}{p.receivedAt && Math.abs(new Date(p.createdAt).getTime() - new Date(p.receivedAt).getTime()) > 5 * 60 * 1000 && <span className="block text-[10px]">Recorded: {format(new Date(p.createdAt), "MMM d")}</span>}</span>
                  {!isVoided && canVoidPayments && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setPaymentToVoid(p); setVoidReason(""); }} className="h-7 px-2 text-xs text-destructive hover:text-destructive">
                      Void Payment
                    </Button>
                  )}
                </div>
                );
              })}
            </div>
          )}

          <AlertDialog open={paymentToVoid !== null} onOpenChange={(nextOpen) => { if (!nextOpen && !voidPayment.isPending) { setPaymentToVoid(null); setVoidReason(""); } }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Void payment?</AlertDialogTitle>
                <AlertDialogDescription>
                  This payment will stop contributing to the invoice balance but will remain visible in financial history. This is not a refund.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <Label htmlFor="payment-void-reason">Reason <span className="text-destructive">*</span></Label>
                <Textarea id="payment-void-reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="e.g. Test payment" maxLength={500} disabled={voidPayment.isPending} />
                <p className="text-xs text-muted-foreground">A short reason between 3 and 500 characters is required.</p>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={voidPayment.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={voidReason.trim().length < 3 || voidPayment.isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    if (paymentToVoid) voidPayment.mutate({ id: paymentToVoid.id, voidReason: voidReason.trim() });
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {voidPayment.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Voiding…</> : "Void Payment"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {previewEnabled && (
            <div className={`p-3 rounded-lg border text-xs ${paymentPreview?.exceedsRequired ? "border-amber-300 bg-amber-50" : "border-sky-200 bg-sky-50"}`}>
              {previewLoading ? <span className="text-muted-foreground">Calculating server payment preview…</span> : previewError ? <span className="text-destructive">{previewError.message}</span> : paymentPreview && <div className="space-y-1">
                <p className="font-semibold">Server payment preview</p>
                {paymentPreview.grossAmountSent && <p>Sent: {paymentPreview.grossAmountSent} {paymentPreview.paymentCurrency} · Bank Deduction: {paymentPreview.bankDeductionAmount} {paymentPreview.paymentCurrency} · Net received: {paymentPreview.enteredAmount} {paymentPreview.paymentCurrency}</p>}
                <p>Entered: {paymentPreview.enteredAmount} {paymentPreview.paymentCurrency} · Rate to invoice: {paymentPreview.conversionRateToInvoice}</p>
                {paymentPreview.paymentCurrency !== paymentPreview.invoiceCurrency && <p>FX: 1 {paymentPreview.invoiceCurrency === "TRY" ? paymentPreview.paymentCurrency : paymentPreview.invoiceCurrency} = TRY {paymentPreview.invoiceCurrency === "TRY" ? paymentPreview.paymentToTryRate : paymentPreview.invoiceToTryRate} · Source: {paymentPreview.fxRateSource === "manual" ? "Manual" : "System"}</p>}
                <p>Invoice amount: {paymentPreview.amountInInvoiceCurrency} {paymentPreview.invoiceCurrency} · Expected settlement: {paymentPreview.settledAmount} {paymentPreview.invoiceCurrency}</p>
                <p>Remaining: {paymentPreview.currentRemaining} → {paymentPreview.expectedRemaining} {paymentPreview.invoiceCurrency}</p>
                {paymentPreview.exceedsRequired && <p className="font-medium text-amber-800">The required invoice settlement will be applied first. The genuine surplus will be recorded as Patient Credit in {paymentPreview.paymentCurrency}.</p>}
              </div>}
            </div>
          )}

          {/* New payment form */}
          <div className="space-y-3 border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Record New Payment</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{method === "bank_transfer" ? "Actual amount sent" : "Amount"}</Label>
                <Input type="text" inputMode="decimal" value={amount} onChange={e => { const normalized = normalizeServicePriceDecimalInput(e.target.value); if (normalized !== null) setAmount(normalized); }} placeholder="0.00" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Currency</Label>
                <Select value={currency} onValueChange={v => setCurrency(v as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["TRY", "USD", "EUR", "GBP", "SAR", "AED", "AUD"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Method</Label>
                <Select value={method} onValueChange={v => setMethod(v as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="credit_card">Credit Card</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="insurance">Insurance</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {method === "bank_transfer" && <div className="col-span-2 grid grid-cols-2 gap-2 rounded bg-amber-50/60 p-2">
                <div className="space-y-1"><Label className="text-xs">Bank Deduction Amount</Label><Input type="text" inputMode="decimal" value={bankDeductionAmount} onChange={e => { const normalized = normalizeServicePriceDecimalInput(e.target.value); if (normalized !== null) setBankDeductionAmount(normalized); }} placeholder="0.00" className="h-8 text-xs" /></div>
                <div className="space-y-1"><Label className="text-xs">or Deduction %</Label><Input type="text" inputMode="decimal" value={bankDeductionPercent} onChange={e => { const normalized = normalizeServicePriceDecimalInput(e.target.value); if (normalized !== null) setBankDeductionPercent(normalized); }} placeholder="0.00" className="h-8 text-xs" /></div>
                <p className="col-span-2 text-[11px] text-muted-foreground">Enter either an amount or percentage. The server uses the net received amount for FX and invoice settlement.</p>
              </div>}
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Payment Date</Label>
                <Input type="datetime-local" value={receivedAtValue} onChange={e => setReceivedAtValue(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="col-span-2">
                <ManualFxDisclosure paymentCurrency={currency} invoiceCurrency={invCur} value={manualFx} onChange={setManualFx} disabled={createPayment.isPending} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Notes (optional)</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. receipt #123" className="h-8 text-xs" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
              <Button size="sm" onClick={handleSubmit} disabled={createPayment.isPending || previewLoading}>
                {createPayment.isPending ? "Saving..." : "Record Payment"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditInvoiceModal({ open, invoice, onClose, onSuccess }: {
  open: boolean;
  invoice: any;
  onClose: () => void;
  onSuccess: (intent: { openSendAfterSave: boolean; recordPaymentAfterSave: boolean }) => void | Promise<void>;
}) {
  const utils = trpc.useUtils();
  const { data: services } = trpc.services.list.useQuery({});
  const { data: activeTaxRules = [], isLoading: editTaxRulesLoading } = trpc.services.taxRules.list.useQuery();
  const { data: categoryTaxDefaults = [] } = trpc.services.categoryTaxDefaults.list.useQuery();
  const { data: existingItems } = trpc.finance.invoiceItems.useQuery({ invoiceId: invoice.id }, { enabled: open, refetchOnMount: "always", staleTime: 0 });
  const { data: existingPayments } = trpc.finance.listPayments.useQuery({ invoiceId: invoice.id, includeVoided: true }, { enabled: open, refetchOnMount: "always", staleTime: 0 });
  const { data: invoiceRevisions = [], isLoading: invoiceRevisionsLoading, refetch: refetchInvoiceRevisions } = trpc.finance.invoiceRevisions.useQuery({ invoiceId: invoice.id }, { enabled: open, refetchOnMount: "always", staleTime: 0 });
  const { data: settings } = trpc.settings.get.useQuery();
  const { data: liveExchangeRates, refetch: refetchLiveExchangeRates } = trpc.settings.getExchangeRates.useQuery(undefined, { enabled: open });
  const { data: patientData } = trpc.patients.get.useQuery({ id: invoice.patientId }, { enabled: open && !!invoice.patientId });
  const [openSendAfterSave, setOpenSendAfterSave] = useState(false);
  const postSaveIntentRef = useRef<"none" | "record_payment">("none");
  const [draftRevisionId, setDraftRevisionId] = useState<number | null>(null);
  const [draftRevisionSnapshot, setDraftRevisionSnapshot] = useState<any>(null);
  const requiresDraftRevision = invoice.status !== "draft";
  const isEditingDraftRevision = requiresDraftRevision && draftRevisionId !== null;
  const isPublishedReadOnly = requiresDraftRevision && !isEditingDraftRevision;
  const existingActiveDraft = useMemo(
    () => invoiceRevisions.find((revision: any) => revision.status === "draft") ?? null,
    [invoiceRevisions],
  );
  const reopenForRevision = trpc.finance.reopenInvoiceForRevision.useMutation({
    onSuccess: ({ draft }) => {
      setDraftRevisionId(draft.id);
      setDraftRevisionSnapshot((draft as any).snapshot ?? null);
      setRevisionSavedFingerprint(null);
      setInitialized(false);
      void refetchInvoiceRevisions();
      toast.success(`Editing Draft Revision ${draft.revisionNumber}`);
    },
    onError: (e) => toast.error(e.message || "Unable to reopen this invoice for editing."),
  });
  const saveDraftRevision = trpc.finance.saveInvoiceDraftRevision.useMutation({
    onSuccess: () => {
      setRevisionSavedFingerprint(revisionFingerprint);
      toast.success("Draft Revision saved. The current official invoice is unchanged.");
      void refetchInvoiceRevisions();
    },
    onError: (e) => toast.error(e.message || "Unable to save Draft Revision."),
  });
  const reissueDraftRevision = trpc.finance.reissueInvoiceDraftRevision.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.finance.invoiceItems.invalidate({ invoiceId: invoice.id }),
        utils.finance.invoiceRevisions.invalidate({ invoiceId: invoice.id }),
      ]);
      toast.success("Invoice re-issued. The updated official invoice revision is now current.");
      setDraftRevisionId(null);
      setDraftRevisionSnapshot(null);
      await onSuccess({ openSendAfterSave: false, recordPaymentAfterSave: false });
    },
    onError: (e) => toast.error(e.message || "Unable to re-issue Draft Revision."),
  });
  const updateFull = trpc.finance.updateFull.useMutation({
    onSuccess: async () => {
      // Keep the next Edit mount from hydrating stale invoice-item cache before
      // the saved immutable Service Price FX snapshot can be read back.
      await utils.finance.invoiceItems.invalidate({ invoiceId: invoice.id });
      toast.success("Invoice updated");
      const recordPaymentAfterSave = postSaveIntentRef.current === "record_payment";
      postSaveIntentRef.current = "none";
      await onSuccess({ openSendAfterSave, recordPaymentAfterSave });
    },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  type LineItem = {
    id?: number;
    lineLabel?: string;
    description: string;
    quantity: number;
    unitPrice: string;
    serviceId: string;
    tryPrice: string;
    totalPrice?: string;
    linePricingMethod?: V4LinePricingMethod;
    lineDiscountPercent?: string;
    adjustmentOpen?: boolean;
    category?: string;
    taxRuleId?: number | null;
    taxLabelSnapshot?: string | null;
    taxRateSnapshot?: string | null;
    effectiveTaxableBase?: string | null;
    taxAmount?: string | null;
    taxSelection?: { type: "none" } | { type: "rule"; taxRuleId: number } | { type: "custom"; ratePercent: string };
    taxIncludedMode?: boolean;
    taxIncludedGross?: string;
    priceEntry?: ServicePriceEntry;
    priceEntryEdited?: boolean;
  };
  const [items, setItems] = useState<LineItem[]>([]);
  const [currency, setCurrency] = useState<string>(invoice.currency ?? "TRY");
  // Strip auto-generated payment note fragments (e.g. "cash: USD 28.80 | bank transfer: USD 50.00")
  // These were written by an old bug and should not appear in the editable notes field.
  const stripPaymentNotes = (raw: string) => {
    if (!raw) return "";
    // Remove segments that look like payment method entries
    const cleaned = raw
      .split(" | ")
      .filter(seg => !/^(cash|card|bank transfer|bank_transfer|credit_card|credit card)(:\s|\s)/i.test(seg.trim()))
      .join(" | ")
      .trim();
    return cleaned;
  };
  const [notes, setNotes] = useState(() => stripPaymentNotes(invoice.notes ?? ""));
  const [discountPercent, setDiscountPercent] = useState(parseFloat(invoice.discountPercent ?? "0"));
  // V3: pre-fill pricing mode from stored invoice
  const [pricingMode, setPricingMode] = useState<"discount" | "agreed">(() =>
    (invoice.pricingMode === "agreed") ? "agreed" : "discount"
  );
  const [finalAgreedPrice, setFinalAgreedPrice] = useState<string>(() =>
    invoice.pricingMode === "agreed" && invoice.finalAgreedAmount
      ? String(invoice.finalAgreedAmount)
      : ""
  );
  const [invoiceAdjustmentOpen, setInvoiceAdjustmentOpen] = useState(() =>
    invoice.pricingMode === "agreed" || parseFloat(invoice.discountPercent ?? "0") > 0
  );
  const [showServicePickerModal, setShowServicePickerModal] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [revisionSavedFingerprint, setRevisionSavedFingerprint] = useState<string | null>(null);
  const [editManualServiceFxInputs, setEditManualServiceFxInputs] = useState<Record<number, string>>({});
  const [pendingEditQuantityChange, setPendingEditQuantityChange] = useState<{ index: number; nextQuantity: number } | null>(null);
  const [invoiceCurrencyRepricingPending, setInvoiceCurrencyRepricingPending] = useState<string | null>(null);
  const [invoiceCurrencyRepricingNotice, setInvoiceCurrencyRepricingNotice] = useState<string | null>(null);
  // A saved Tax-v2 invoice is a historical financial fact. Until the staff
  // changes a tax-affecting input, Edit renders the immutable line snapshots
  // rather than looking up today's Tax Rule configuration.
  const [useSavedTaxSnapshots, setUseSavedTaxSnapshots] = useState(false);
  const hasPaymentHistory = (existingPayments?.length ?? 0) > 0;
  const revisionFingerprint = useMemo(() => JSON.stringify({
    currency, notes, discountPercent, pricingMode, finalAgreedPrice,
    items: items.map(item => ({ ...item, adjustmentOpen: undefined })),
  }), [currency, notes, discountPercent, pricingMode, finalAgreedPrice, items]);
  useEffect(() => {
    if (isEditingDraftRevision && initialized && revisionSavedFingerprint === null) setRevisionSavedFingerprint(revisionFingerprint);
    if (!isEditingDraftRevision) setRevisionSavedFingerprint(null);
  }, [isEditingDraftRevision, initialized, revisionFingerprint, revisionSavedFingerprint]);
  const revisionDirty = isEditingDraftRevision && revisionSavedFingerprint !== null && revisionSavedFingerprint !== revisionFingerprint;
  useBeforeUnload(open && revisionDirty);
  const isTaxModelInvoice = invoice.taxModelVersion === TAX_MODEL_VERSION;
  const taxRulesById = useMemo(() => new Map((activeTaxRules as any[]).map(rule => [rule.id, rule])), [activeTaxRules]);
  const defaultTaxRuleByCategory = useMemo(() => new Map((categoryTaxDefaults as any[]).map(row => [row.category, row.taxRuleId])), [categoryTaxDefaults]);
  const getEditLineTaxSnapshot = (item: LineItem) => {
    if (item.taxSelection?.type === "custom") return { taxRuleId: null, taxLabelSnapshot: "Custom Tax", taxRateSnapshot: item.taxSelection.ratePercent };
    if (item.taxSelection?.type === "none") return { taxRuleId: null, taxLabelSnapshot: null, taxRateSnapshot: null };
    if (item.taxSelection?.type === "rule") {
      const rule = taxRulesById.get(item.taxSelection.taxRuleId);
      return { taxRuleId: item.taxSelection.taxRuleId, taxLabelSnapshot: rule?.label ?? null, taxRateSnapshot: rule ? String(rule.ratePercent) : null };
    }
    // Existing saved lines must retain their immutable snapshot; no re-inheritance.
    if (item.id && item.taxLabelSnapshot !== undefined) {
      return { taxRuleId: item.taxRuleId ?? null, taxLabelSnapshot: item.taxLabelSnapshot ?? null, taxRateSnapshot: item.taxRateSnapshot ?? null };
    }
    const service = item.serviceId ? (services ?? []).find(service => service.id === Number(item.serviceId)) : undefined;
    const suggestedRuleId = service?.taxOverrideMode === "no_tax" ? null : service?.taxOverrideMode === "rule" ? service.taxOverrideRuleId ?? null : defaultTaxRuleByCategory.get(service?.category ?? item.category ?? "") ?? null;
    const rule = suggestedRuleId == null ? null : taxRulesById.get(suggestedRuleId);
    return { taxRuleId: suggestedRuleId, taxLabelSnapshot: rule?.label ?? null, taxRateSnapshot: rule ? String(rule.ratePercent) : null };
  };
  const unavailableSavedTaxRuleIds = useMemo(
    () => Array.from(new Set(items.map(item => item.taxRuleId).filter((id): id is number => id != null && !taxRulesById.has(id)))),
    [items, taxRulesById],
  );

  const surchargeRate = parseFloat(settings?.card_surcharge_pct ?? "23") / 100;
  const markupPct = parseFloat((settings as any)?.foreign_price_markup_pct ?? "30");
  const isInternational = (patientData as any)?.patientType === "international";
  const markupMultiplier = isInternational ? 1 + markupPct / 100 : 1;
  // Rate convention: 1 FOREIGN = X TRY — reads from live exchange_rates table (tryPerUnit)
  const getExchangeRate = (cur: string): number => {
    if (cur === "TRY") return 1;
    const liveRate = (liveExchangeRates as any)?.rates?.[cur]?.rate;
    if (liveRate && liveRate > 1) return liveRate;
    // fallback: legacy system_settings (may be inverted — auto-correct if < 1)
    const legacyRate = parseFloat((settings as any)?.[`exchange_rate_${cur}`] ?? "0");
    if (legacyRate > 0 && legacyRate < 1) return 1 / legacyRate; // auto-correct inverted
    return legacyRate || 1;
  };
  const hasCurrentSystemExchangeRate = (cur: string) => {
    if (cur === "TRY") return true;
    const liveRate = Number((liveExchangeRates as any)?.rates?.[cur]?.rate ?? 0);
    if (Number.isFinite(liveRate) && liveRate > 1) return true;
    const legacyRate = parseFloat((settings as any)?.[`exchange_rate_${cur}`] ?? "0");
    return Number.isFinite(legacyRate) && legacyRate > 0;
  };
  // Convert TRY base price → apply international markup → convert to selected currency
  // TRY → foreign: tryAmt / rate (because 1 foreign = rate TRY, so foreign = TRY / rate)
  const convertFromTRY = (tryAmt: number, cur: string) => {
    const markedUp = tryAmt * markupMultiplier;
    return cur === "TRY" ? markedUp : markedUp / getExchangeRate(cur);
  };
  // Strip markup and currency to get raw TRY base
  // foreign → TRY: displayAmt * rate
  const convertToTRY = (displayAmt: number, cur: string) => {
    const inTRY = cur === "TRY" ? displayAmt : displayAmt * getExchangeRate(cur);
    return markupMultiplier > 0 ? inTRY / markupMultiplier : inTRY;
  };
  const getEditSourcePricePreview = (item: LineItem, invoiceCurrency = currency) => {
    const entry = item.priceEntry;
    if (!entry || !entry.amount) return null;
    try {
      const crossCurrency = entry.currency !== invoiceCurrency;
      const needsFreshSystemQuote = crossCurrency
        && item.priceEntryEdited === true
        && entry.fx?.source === "system"
        && (invoiceCurrencyRepricingPending === invoiceCurrency || !hasCurrentSystemExchangeRate(entry.currency) || !hasCurrentSystemExchangeRate(invoiceCurrency));
      if (needsFreshSystemQuote) return null;
      return computeServicePriceFxSnapshot({
        sourceCurrency: entry.currency,
        invoiceCurrency,
        sourceAmount: getAgreedUnitSourceLineAmount(entry, item.quantity),
        // An untouched saved source-price row must render from its immutable
        // direct snapshot, regardless of whether its original FX was System or
        // Manual. A deliberate draft edit re-resolves System FX, while Manual
        // FX continues to use the explicitly entered direct rate.
        directRateToInvoice: crossCurrency && (item.priceEntryEdited === false || entry.fx?.source === "manual") ? entry.fx?.rateToInvoice : undefined,
        sourceToTryRate: crossCurrency && entry.fx?.source === "system" ? String(getExchangeRate(entry.currency)) : undefined,
        invoiceToTryRate: crossCurrency && entry.fx?.source === "system" ? String(getExchangeRate(invoiceCurrency)) : undefined,
        source: crossCurrency ? entry.fx?.source ?? null : null,
      });
    } catch {
      return null;
    }
  };
  const getEditInvoiceCurrencyLine = (item: LineItem): LineItem => {
    const entry = item.priceEntry;
    const snapshot = getEditSourcePricePreview(item);
    if (!entry) return item;
    if (!snapshot) return {
      ...item,
      unitPrice: entry.kind === "unit_price" ? "0" : item.unitPrice,
      totalPrice: entry.kind === "unit_price" ? undefined : "",
      taxIncludedGross: item.taxIncludedMode ? "" : undefined,
    };
    if (entry.kind === "unit_price") return { ...item, unitPrice: snapshot.convertedAmount, totalPrice: undefined, linePricingMethod: "none", lineDiscountPercent: undefined, taxIncludedMode: false, taxIncludedGross: undefined };
    if (entry.kind === "tax_included_final_line_total" || entry.kind === "tax_included_agreed_unit_price") return { ...item, totalPrice: snapshot.convertedAmount, linePricingMethod: entry.kind === "tax_included_agreed_unit_price" ? "agreed_unit_price" : "final_line_total", lineDiscountPercent: undefined, taxIncludedMode: true, taxIncludedGross: snapshot.convertedAmount };
    return { ...item, totalPrice: snapshot.convertedAmount, linePricingMethod: entry.kind === "agreed_unit_price" ? "agreed_unit_price" : "final_line_total", lineDiscountPercent: undefined, taxIncludedMode: false, taxIncludedGross: undefined };
  };

  // Reset when dialog closes
  useEffect(() => {
    if (!open) { setItems([]); setInitialized(false); setDraftRevisionId(null); setDraftRevisionSnapshot(null); setUseSavedTaxSnapshots(false); setEditManualServiceFxInputs({}); setInvoiceCurrencyRepricingPending(null); setInvoiceCurrencyRepricingNotice(null); setNotes(stripPaymentNotes(invoice.notes ?? "")); setCurrency(invoice.currency ?? "TRY"); setDiscountPercent(parseFloat(invoice.discountPercent ?? "0")); setPricingMode(invoice.pricingMode === "agreed" ? "agreed" : "discount"); setFinalAgreedPrice(invoice.pricingMode === "agreed" && invoice.finalAgreedAmount != null ? String(invoice.finalAgreedAmount) : ""); setInvoiceAdjustmentOpen(invoice.pricingMode === "agreed" || parseFloat(invoice.discountPercent ?? "0") > 0); setShowServicePickerModal(false); }
  }, [open]);

  useEffect(() => {
    const draftData = draftRevisionSnapshot?.updateData;
    if (!open || !draftData) return;
    const draftCurrency = draftData.currency ?? invoice.currency ?? "TRY";
    setCurrency(draftCurrency);
    setNotes(stripPaymentNotes(draftData.notes ?? ""));
    setDiscountPercent(Number(draftData.discountPercent ?? 0));
    setPricingMode(draftData.pricingMode === "agreed" ? "agreed" : "discount");
    setFinalAgreedPrice(draftData.finalAgreedAmount == null ? "" : String(draftData.finalAgreedAmount));
    setInvoiceAdjustmentOpen(draftData.pricingMode === "agreed" || Number(draftData.discountPercent ?? 0) > 0);
    setItems((draftData.items ?? []).map((item: any) => {
      const displayPrice = Number(item.unitPrice ?? 0);
      const tryBase = convertToTRY(displayPrice, draftCurrency);
      return {
        id: item.id,
        lineLabel: item.lineLabel ?? "",
        description: item.description,
        quantity: Number(item.quantity ?? 1),
        unitPrice: displayPrice.toFixed(2),
        tryPrice: tryBase.toFixed(2),
        serviceId: item.serviceId ? String(item.serviceId) : "",
        totalPrice: item.totalPrice == null ? undefined : String(item.totalPrice),
        linePricingMethod: (item.linePricingMethod as V4LinePricingMethod) ?? "none",
        lineDiscountPercent: item.lineDiscountPercent == null ? undefined : String(item.lineDiscountPercent),
        adjustmentOpen: (item.linePricingMethod ?? "none") !== "none",
        taxIncludedMode: item.taxIncludedMode === true,
        taxIncludedGross: item.taxIncludedGross == null ? undefined : String(item.taxIncludedGross),
        taxRuleId: item.taxRuleId ?? null,
        taxLabelSnapshot: item.taxLabelSnapshot ?? null,
        taxRateSnapshot: item.taxRateSnapshot == null ? null : String(item.taxRateSnapshot),
        effectiveTaxableBase: item.effectiveTaxableBase == null ? null : String(item.effectiveTaxableBase),
        taxAmount: item.taxAmount == null ? null : String(item.taxAmount),
        taxSelection: item.taxSelection,
        priceEntry: item.priceEntryCurrency && item.priceEntryAmount && item.priceEntryKind ? {
          currency: item.priceEntryCurrency as ServicePriceEntry["currency"],
          amount: String(item.priceEntryAmount),
          kind: item.priceEntryKind as ServicePriceEntry["kind"],
          fx: item.priceFxSource ? {
            source: item.priceFxSource as "system" | "manual",
            rateToInvoice: item.priceFxRateToInvoice == null ? undefined : String(item.priceFxRateToInvoice),
            note: item.priceFxNote ?? undefined,
          } : undefined,
        } : undefined,
        priceEntryEdited: false,
      };
    }));
    setUseSavedTaxSnapshots(false);
    setInitialized(true);
  }, [draftRevisionSnapshot, open]);

  // Pre-fill items once existingItems loads.
  // IMPORTANT: unitPrice in DB is already stored in the invoice's display currency with its pricing category included.
  // Do NOT re-convert — just use it as-is. tryPrice is reverse-computed for the currency-switch handler.
  useMemo(() => {
    if (existingItems && !initialized) {
      setItems(existingItems.map(i => {
        const displayPrice = parseFloat(String(i.unitPrice));
        // Reverse-compute the raw TRY base (strip markup & exchange rate) for use when user switches currency
        const tryBase = convertToTRY(displayPrice, currency);
        return {
          id: i.id,
          lineLabel: i.lineLabel ?? "",
          description: i.description,
          quantity: i.quantity,
          unitPrice: displayPrice.toFixed(2),
          tryPrice: tryBase.toFixed(2),
          serviceId: i.serviceId ? String(i.serviceId) : "",
          totalPrice: String(i.totalPrice),
          linePricingMethod: (i.linePricingMethod as V4LinePricingMethod) ?? "none",
          lineDiscountPercent: i.lineDiscountPercent != null ? String(i.lineDiscountPercent) : undefined,
          adjustmentOpen: (i.linePricingMethod ?? "none") !== "none",
          taxIncludedMode: i.taxIncludedMode === true || isTaxIncludedServicePriceEntry(i.priceEntryKind ? { kind: i.priceEntryKind as ServicePriceEntry["kind"] } : undefined),
          taxRuleId: i.taxRuleId ?? null,
          taxLabelSnapshot: i.taxLabelSnapshot ?? null,
          taxRateSnapshot: i.taxRateSnapshot != null ? String(i.taxRateSnapshot) : null,
          effectiveTaxableBase: i.effectiveTaxableBase != null ? String(i.effectiveTaxableBase) : null,
          taxAmount: i.taxAmount != null ? String(i.taxAmount) : null,
          priceEntry: i.priceEntryCurrency && i.priceEntryAmount && i.priceEntryKind ? {
            currency: i.priceEntryCurrency as ServicePriceEntry["currency"],
            amount: String(i.priceEntryAmount),
            kind: i.priceEntryKind as ServicePriceEntry["kind"],
            fx: i.priceFxSource ? {
              source: i.priceFxSource as "system" | "manual",
              rateToInvoice: i.priceFxRateToInvoice != null ? String(i.priceFxRateToInvoice) : undefined,
              note: i.priceFxNote ?? undefined,
            } : undefined,
          } : undefined,
          priceEntryEdited: false,
        };
      }));
      setInitialized(true);
      setUseSavedTaxSnapshots(invoice.taxModelVersion === TAX_MODEL_VERSION);
    }
  }, [existingItems, initialized, invoice.taxModelVersion]);

  const servicesByCategory = useMemo(() => {
    const map: Record<string, typeof services> = {};
    (services ?? []).forEach(s => { const cat = s.category ?? "other"; if (!map[cat]) map[cat] = []; map[cat]!.push(s); });
    return map;
  }, [services]);
  const handleCurrencyChange = (newCur: string) => {
    if (newCur === currency) return;
    setUseSavedTaxSnapshots(false);
    setEditManualServiceFxInputs({});
    const needsFreshSystemQuote = items.some(item => item.priceEntry && item.priceEntry.currency !== newCur);
    setItems(prev => prev.map(item => {
      if (item.priceEntry) {
        const repricingEntry = startServicePriceInvoiceCurrencyRepricing(item.priceEntry, newCur as ServicePriceEntry["currency"]);
        return {
          ...item,
          totalPrice: repricingEntry.kind === "unit_price" ? undefined : "",
          taxIncludedGross: item.taxIncludedMode ? "" : undefined,
          priceEntry: repricingEntry,
          priceEntryEdited: true,
        };
      }
      const preview = getV4LinePricingPreview(item);
      return {
        ...item,
        unitPrice: convertFromTRY(parseFloat(item.tryPrice || "0"), newCur).toFixed(2),
        totalPrice: preview.method === "final_line_total"
          ? convertFromTRY(convertToTRY(preview.finalLineTotal, currency), newCur).toFixed(2)
          : item.totalPrice,
      };
    }));
    setInvoiceCurrencyRepricingPending(needsFreshSystemQuote ? newCur : null);
    setInvoiceCurrencyRepricingNotice(needsFreshSystemQuote
      ? `Invoice currency changed to ${newCur}. The negotiated source price is preserved; a fresh System FX quote is being resolved. Review the new totals before saving.`
      : null);
    setCurrency(newCur);
    if (needsFreshSystemQuote) {
      void refetchLiveExchangeRates().then((result) => {
        const liveRate = Number((result.data as any)?.rates?.[newCur]?.rate ?? 0);
        const configuredRate = parseFloat((settings as any)?.[`exchange_rate_${newCur}`] ?? "0");
        if (newCur === "TRY" || (Number.isFinite(liveRate) && liveRate > 1) || (Number.isFinite(configuredRate) && configuredRate > 0)) {
          setInvoiceCurrencyRepricingPending(current => current === newCur ? null : current);
        } else {
          setInvoiceCurrencyRepricingNotice(`System FX for ${newCur} is unavailable. Enter a new Manual Approved FX rate and audit note before saving.`);
        }
      }).catch(() => {
        setInvoiceCurrencyRepricingNotice(`System FX for ${newCur} could not be refreshed. Enter a new Manual Approved FX rate and audit note before saving.`);
      });
    }
  };

  const handleServicePickerResult = (result: ServicePickerResult) => {
    if (result.action === "create_new_invoice") {
      // Close this modal and open CreateInvoiceModal with the selected items
      onClose();
      if ((window as any).__openCreateInvoiceWithItems) {
        (window as any).__openCreateInvoiceWithItems(result.items);
      }
      return;
    }
    const newItems: LineItem[] = result.items.map(sel => ({
      lineLabel: "",
      description: sel.service.name,
      quantity: sel.quantity,
      unitPrice: sel.unitPrice,
      tryPrice: sel.tryPrice,
      serviceId: String(sel.service.id),
      category: (sel.service as any).category,
    }));
    setUseSavedTaxSnapshots(false);
    setItems(prev => [...prev, ...newItems]);
    setShowServicePickerModal(false);
  };

  const removeItem = (idx: number) => {
    setUseSavedTaxSnapshots(false);
    setEditManualServiceFxInputs({});
    setItems(prev => prev.filter((_, i) => i !== idx));
  };
  const updateItem = (idx: number, field: keyof LineItem, value: any) => {
    const item = items[idx];
    if (field === "unitPrice") {
      const normalized = normalizeServicePriceDecimalInput(String(value));
      if (normalized == null) return;
      value = normalized;
    }
    const requestedQuantity = field === "quantity" ? Math.max(1, Number(value) || 1) : null;
    if (requestedQuantity !== null && item && requestedQuantity !== item.quantity && item.linePricingMethod === "final_line_total") {
      setPendingEditQuantityChange({ index: idx, nextQuantity: requestedQuantity });
      return;
    }
    if (field !== "adjustmentOpen") setUseSavedTaxSnapshots(false);
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === "unitPrice") {
        updated.tryPrice = convertToTRY(parseFloat(value || "0"), currency).toFixed(2);
        updated.priceEntry = undefined;
      }
      return updated;
    }));
  };
  const keepEditAgreedLineTotalAfterQuantityChange = () => {
    if (!pendingEditQuantityChange) return;
    setUseSavedTaxSnapshots(false);
    setItems(prev => prev.map((item, index) => index === pendingEditQuantityChange.index
      ? { ...item, quantity: pendingEditQuantityChange.nextQuantity }
      : item));
    setPendingEditQuantityChange(null);
  };
  const resetEditLinePricingAfterQuantityChange = () => {
    if (!pendingEditQuantityChange) return;
    setUseSavedTaxSnapshots(false);
    setItems(prev => prev.map((item, index) => {
      if (index !== pendingEditQuantityChange.index) return item;
      const standardTotal = getV4LinePricingPreview({ ...item, quantity: pendingEditQuantityChange.nextQuantity, linePricingMethod: "none", totalPrice: undefined }).originalLineTotal.toFixed(2);
      return {
        ...item,
        quantity: pendingEditQuantityChange.nextQuantity,
        linePricingMethod: "none",
        lineDiscountPercent: undefined,
        totalPrice: standardTotal,
        taxIncludedMode: false,
        taxIncludedGross: undefined,
        priceEntry: undefined,
        priceEntryEdited: undefined,
        adjustmentOpen: false,
      };
    }));
    setPendingEditQuantityChange(null);
  };

  const updateEditLineTaxSelection = (idx: number, selection: LineItem["taxSelection"]) => {
    if (selection?.type === "none" && items[idx]?.taxIncludedMode) {
      toast.error("Switch this agreed price to Before Tax before selecting No Tax.");
      return;
    }
    setUseSavedTaxSnapshots(false);
    setItems(prev => prev.map((item, i) => i === idx ? {
      ...item,
      taxSelection: selection,
      taxRuleId: selection?.type === "rule" ? selection.taxRuleId : null,
      taxIncludedMode: selection?.type === "none" ? false : item.taxIncludedMode,
      taxIncludedGross: selection?.type === "none" ? undefined : item.taxIncludedGross,
    } : item));
  };

  const setEditTaxControl = (idx: number, value: string) => {
    const item = items[idx];
    if (!item) return;
    const parsed = parseInvoiceLineTaxControlValue(value, item.taxSelection?.type === "custom" ? item.taxSelection.ratePercent : item.taxRateSnapshot ?? "0");
    if (!parsed) return;
    const method = item.linePricingMethod ?? "none";
    if (parsed.taxIncludedMode && method !== "agreed_unit_price" && method !== "final_line_total") {
      toast.error("Tax Included is available only for Agreed Unit Price or Final Line Total. Standard prices remain Before Tax.");
      return;
    }
    if (parsed.taxIncludedMode && (pricingMode === "agreed" || discountPercent > 0)) {
      toast.error("Tax-Included line pricing can't be combined with invoice-wide pricing adjustments.");
      return;
    }
    setUseSavedTaxSnapshots(false);
    setItems(prev => prev.map((line, i) => {
      if (i !== idx) return line;
      const kind = getDraftServicePriceEntryKind(method, parsed.taxIncludedMode);
      const currentEntry = line.priceEntry;
      const enteredAmount = currentEntry?.amount ?? (method === "agreed_unit_price" ? String(line.unitPrice ?? "") : String(line.totalPrice ?? getV4LinePricingPreview(line).originalLineTotal.toFixed(2)));
      return {
        ...line,
        adjustmentOpen: kind !== null,
        taxSelection: parsed.taxSelection,
        taxRuleId: parsed.taxSelection.type === "rule" ? parsed.taxSelection.taxRuleId : null,
        taxIncludedMode: parsed.taxIncludedMode,
        taxIncludedGross: parsed.taxIncludedMode ? "" : undefined,
        priceEntry: kind
          ? { currency: currentEntry?.currency ?? currency as ServicePriceEntry["currency"], amount: parsed.taxIncludedMode ? "" : enteredAmount, kind, fx: currentEntry?.fx ?? { source: "system" } }
          : undefined,
        priceEntryEdited: kind !== null ? true : undefined,
      };
    }));
  };

  const setLinePricingMethod = (idx: number, method: V4LinePricingMethod) => {
    setUseSavedTaxSnapshots(false);
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const originalTotal = getV4LinePricingPreview(item).originalLineTotal.toFixed(2);
      const kind = getDraftServicePriceEntryKind(method, false);
      return {
        ...item,
        adjustmentOpen: true,
        linePricingMethod: method,
        lineDiscountPercent: method === "discount_percent" ? (item.lineDiscountPercent ?? "0") : undefined,
        totalPrice: method === "final_line_total" ? originalTotal : item.totalPrice,
        taxIncludedMode: false,
        taxIncludedGross: undefined,
        priceEntry: kind ? { currency: currency as ServicePriceEntry["currency"], amount: method === "agreed_unit_price" ? String(item.unitPrice ?? "") : originalTotal, kind, fx: { source: "system" } } : undefined,
        priceEntryEdited: kind !== null ? true : undefined,
      };
    }));
  };
  const setEditTaxInclusiveEntry = (idx: number, included: boolean) => {
    const item = items[idx];
    if (!item) return;
    if (included) {
      const tax = getEditLineTaxSnapshot(item);
      if (!tax.taxLabelSnapshot || tax.taxRateSnapshot == null) return toast.error("Choose a Tax before entering a Tax-Included line price.");
      if (pricingMode === "agreed" || discountPercent > 0) return toast.error("Tax-Included line pricing can't be combined with invoice-wide pricing adjustments.");
      setUseSavedTaxSnapshots(false);
      setItems(prev => prev.map((line, i) => i === idx ? { ...line, adjustmentOpen: true, linePricingMethod: line.linePricingMethod === "agreed_unit_price" ? "agreed_unit_price" : "final_line_total", lineDiscountPercent: undefined, taxIncludedMode: true, taxIncludedGross: "", priceEntry: { currency: currency as ServicePriceEntry["currency"], amount: "", kind: line.linePricingMethod === "agreed_unit_price" ? "tax_included_agreed_unit_price" : "tax_included_final_line_total", fx: { source: "system" } }, priceEntryEdited: true } : line));
      return;
    }
    setUseSavedTaxSnapshots(false);
    setItems(prev => prev.map((line, i) => i === idx ? { ...line, taxIncludedMode: false, taxIncludedGross: undefined, priceEntry: line.priceEntry ? { ...line.priceEntry, kind: line.linePricingMethod === "agreed_unit_price" ? "agreed_unit_price" : "final_line_total" } : line.priceEntry, priceEntryEdited: true } : line));
  };
  const updateEditPriceEntry = (idx: number, patch: Omit<Partial<ServicePriceEntry>, "fx"> & { fx?: Partial<NonNullable<ServicePriceEntry["fx"]>> }) => {
    if (patch.amount !== undefined) {
      const normalized = normalizeServicePriceDecimalInput(patch.amount);
      if (normalized == null) return;
      patch = { ...patch, amount: normalized };
    }
    setUseSavedTaxSnapshots(false);
    setItems(prev => prev.map((item, i) => {
      if (i !== idx || !item.priceEntry) return item;
      const current = item.priceEntry;
      // A source-currency selection is an intentional repricing boundary, not
      // a presentation label. Do not carry a source amount or a saved Manual
      // FX snapshot into an unrelated currency (including the invoice currency).
      if (patch.currency && patch.currency !== current.currency) {
        setEditManualServiceFxInputs(inputs => {
          const next = { ...inputs };
          delete next[idx];
          return next;
        });
        return {
          ...item,
          priceEntry: startServicePriceRepricing(current, patch.currency),
          priceEntryEdited: true,
        };
      }
      return { ...item, priceEntry: { ...current, ...patch, fx: patch.fx ? { ...(current.fx ?? { source: "system" as const }), ...patch.fx } : current.fx }, priceEntryEdited: true };
    }));
  };
  const setEditPriceEntryFxSource = (idx: number, source: "system" | "manual") => {
    setEditManualServiceFxInputs(inputs => {
      const next = { ...inputs };
      delete next[idx];
      return next;
    });
    updateEditPriceEntry(idx, { fx: { source, rateToInvoice: undefined, note: undefined } });
  };
  const getEditManualServiceFxInput = (idx: number, entry: ServicePriceEntry) =>
    Object.prototype.hasOwnProperty.call(editManualServiceFxInputs, idx)
      ? editManualServiceFxInputs[idx]!
      : formatServicePriceFxDirectRate(entry.fx?.rateToInvoice);
  const updateEditManualServiceFxInput = (idx: number, rawValue: string) => {
    const normalized = normalizeServicePriceDecimalInput(rawValue);
    setEditManualServiceFxInputs(inputs => ({ ...inputs, [idx]: normalized ?? rawValue }));
    if (normalized == null || normalized === "" || normalized.endsWith(".")) {
      updateEditPriceEntry(idx, { fx: { source: "manual", rateToInvoice: undefined } });
      return;
    }
    try {
      updateEditPriceEntry(idx, { fx: { source: "manual", rateToInvoice: normalized } });
    } catch {
      updateEditPriceEntry(idx, { fx: { source: "manual", rateToInvoice: undefined } });
    }
  };
  const resetLineToStandard = (idx: number) => {
    setUseSavedTaxSnapshots(false);
    setItems(prev => prev.map((item, i) => i === idx ? {
      ...item,
      linePricingMethod: "none",
      lineDiscountPercent: undefined,
      totalPrice: getV4LinePricingPreview(item).originalLineTotal.toFixed(2),
      taxIncludedMode: false,
      taxIncludedGross: undefined,
      priceEntry: undefined,
      priceEntryEdited: undefined,
      adjustmentOpen: false,
    } : item));
  };

  const getEditTaxIncludedPreview = (item: LineItem) => {
    const invoiceCurrencyItem = getEditInvoiceCurrencyLine(item);
    const tax = getEditLineTaxSnapshot(invoiceCurrencyItem);
    if (!invoiceCurrencyItem.taxIncludedGross || !tax.taxLabelSnapshot || tax.taxRateSnapshot == null) return null;
    try {
      return calculateTaxIncludedLine({ grossAmount: invoiceCurrencyItem.taxIncludedGross, taxRatePercent: tax.taxRateSnapshot });
    } catch {
      return null;
    }
  };
  const getEditTaxAwareLineTotal = (item: LineItem) => {
    const invoiceCurrencyItem = getEditInvoiceCurrencyLine(item);
    const included = getEditTaxIncludedPreview(item);
    return included ? Number(included.taxableBase) : getV4LinePricingPreview(invoiceCurrencyItem).finalLineTotal;
  };
  const editHasTaxIncludedLine = items.some(item => item.taxIncludedMode === true);

  const subtotal = items.reduce((s, i) => s + getEditTaxAwareLineTotal(i), 0);
  // V3: Mode A (discount) or Mode B (agreed)
  const discountAmt = pricingMode === "discount" && discountPercent > 0
    ? Math.round(subtotal * discountPercent / 100 * 100) / 100
    : pricingMode === "agreed" && finalAgreedPrice !== ""
    ? Math.round((subtotal - parseFloat(finalAgreedPrice || "0")) * 100) / 100
    : 0;
  const cashTotal = pricingMode === "agreed" && finalAgreedPrice !== ""
    ? parseFloat(finalAgreedPrice || "0")
    : subtotal - discountAmt;
  const savedTaxPreview = useMemo(() => {
    if (!isTaxModelInvoice || !initialized || !useSavedTaxSnapshots) return null;
    const lines = items.map((item, index) => {
      const fallbackBase = getV4LinePricingPreview(item).finalLineTotal;
      const effectiveTaxableBase = Number(item.effectiveTaxableBase ?? fallbackBase);
      const taxAmount = Number(item.taxAmount ?? 0);
      return {
        key: index,
        totalPrice: fallbackBase.toFixed(2),
        tax: {
          taxRuleId: item.taxRuleId ?? null,
          taxLabelSnapshot: item.taxLabelSnapshot ?? null,
          taxRateSnapshot: item.taxRateSnapshot ?? null,
        },
        effectiveTaxableBase: effectiveTaxableBase.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        totalWithTax: (effectiveTaxableBase + taxAmount).toFixed(2),
      };
    });
    const effectiveServiceSubtotal = lines.reduce((sum, line) => sum + Number(line.effectiveTaxableBase), 0);
    const totalTaxAmount = lines.reduce((sum, line) => sum + Number(line.taxAmount), 0);
    return {
      serviceSubtotalBeforeTax: items.reduce((sum, item) => sum + getV4LinePricingPreview(item).finalLineTotal, 0).toFixed(2),
      invoiceWideDiscountAmount: discountAmt.toFixed(2),
      effectiveServiceSubtotal: effectiveServiceSubtotal.toFixed(2),
      totalTaxAmount: totalTaxAmount.toFixed(2),
      grandTotal: (effectiveServiceSubtotal + totalTaxAmount).toFixed(2),
      lines,
    };
  }, [discountAmt, initialized, isTaxModelInvoice, items, useSavedTaxSnapshots]);
  const editInvoiceWideTaxIncludedConflict = editHasTaxIncludedLine && (pricingMode === "agreed" || discountPercent > 0);
  const editHasIncompleteTaxIncludedDraft = items.some(item => {
    const tax = getEditLineTaxSnapshot(getEditInvoiceCurrencyLine(item));
    return isIncompleteTaxIncludedDraft({
      taxIncludedMode: item.taxIncludedMode,
      taxLabelSnapshot: tax.taxLabelSnapshot,
      taxRateSnapshot: tax.taxRateSnapshot,
      taxSelection: item.taxSelection,
      priceEntry: item.priceEntry,
    });
  });
  const calculatedTaxPreviewState = useMemo(() => isTaxModelInvoice ? previewServiceTaxInvoice({
    lines: items.map((item, index) => {
      const invoiceCurrencyItem = getEditInvoiceCurrencyLine(item);
      const tax = getEditLineTaxSnapshot(invoiceCurrencyItem);
      return {
        key: index,
        totalPrice: getEditTaxAwareLineTotal(item).toFixed(2),
        taxIncludedGross: invoiceCurrencyItem.taxIncludedMode && invoiceCurrencyItem.taxIncludedGross ? invoiceCurrencyItem.taxIncludedGross : undefined,
        tax: {
          taxRuleId: tax.taxRuleId,
          taxLabelSnapshot: tax.taxLabelSnapshot,
          taxRateSnapshot: tax.taxRateSnapshot,
        },
      };
    }),
    invoiceWideDiscountAmount: editInvoiceWideTaxIncludedConflict ? undefined : pricingMode === "discount" ? discountAmt.toFixed(2) : undefined,
    finalAgreedServiceAmount: editInvoiceWideTaxIncludedConflict ? undefined : pricingMode === "agreed" && finalAgreedPrice !== "" ? cashTotal.toFixed(2) : undefined,
  }) : { result: null, error: null }, [isTaxModelInvoice, items, pricingMode, discountAmt, finalAgreedPrice, cashTotal, taxRulesById, editInvoiceWideTaxIncludedConflict]);
  const editHasUnresolvedSourcePrice = items.some(item => !!item.priceEntry && !getEditSourcePricePreview(item));
  const editTaxPreview = editHasUnresolvedSourcePrice ? null : (savedTaxPreview ?? calculatedTaxPreviewState.result);
  const editTaxPreviewIssue = editHasUnresolvedSourcePrice
    ? "Complete the negotiated source price and FX details before totals can be calculated."
    : calculatedTaxPreviewState.error;
  const editedInvoiceTotal = editTaxPreview ? Number(editTaxPreview.grandTotal) : 0;
  const showLegacySettlementPresentation = isLegacySettlementPresentation(invoice.settlementModelVersion);
  const cardTotal: number | null = showLegacySettlementPresentation && pricingMode === "discount"
    ? Math.round(cashTotal * (1 + surchargeRate) * 100) / 100
    : null;
  const agreedPriceWarning: string | null =
    pricingMode === "agreed" && finalAgreedPrice !== ""
      ? parseFloat(finalAgreedPrice || "0") <= 0 ? "Final price must be greater than zero."
        : parseFloat(finalAgreedPrice || "0") > subtotal
        ? `Final price cannot exceed subtotal (${currency} ${subtotal.toFixed(2)}).`
        : null
      : null;
  // Use invoice.paidAmount from DB as the source of truth for what's been paid.
  const alreadyPaid = Number(invoice.paidAmount ?? 0);
  const editDualBalancePresentation = deriveInvoiceDualBalancePresentation({
    totalAmount: editedInvoiceTotal,
    taxAmount: editTaxPreview?.totalTaxAmount ?? 0,
    netSettled: alreadyPaid,
    taxModelVersion: isTaxModelInvoice ? "line_tax_v1" : null,
  });
  const remaining = Number(editDualBalancePresentation.totalBalanceDueIncludingTax);

  const buildInvoiceUpdatePayload = (postSaveIntent: "none" | "record_payment" = "none") => {
    const validItems = items.filter(i => i.description);
    if (validItems.length === 0) { toast.error("Add at least one item"); return null; }
    if (postSaveIntent === "record_payment" && openSendAfterSave) {
      toast.error("Choose either Open Send Invoice after save or Save & Record Payment."); return null;
    }
    if (editInvoiceWideTaxIncludedConflict) { toast.error("Tax-Included line pricing can't be combined with invoice-wide pricing adjustments."); return null; }
    if (validItems.some(item => item.taxSelection?.type === "custom" && !/^\d{1,3}(?:\.\d{1,4})?$/.test(item.taxSelection.ratePercent))) { toast.error("Custom Tax must be 0–100% with up to 4 decimal places."); return null; }
    if (editHasIncompleteTaxIncludedDraft || validItems.some(item => item.taxIncludedMode && !getEditTaxIncludedPreview(item))) { toast.error("Complete the Tax and gross agreed price before saving this Tax-Included line."); return null; }
    if (validItems.some(item => item.priceEntry && !getEditSourcePricePreview(item))) { toast.error("Enter a valid negotiated source price and, for Manual FX, an approved rate."); return null; }
    if (isTaxModelInvoice && !editTaxPreview) { toast.error(editTaxPreviewIssue ?? "Complete the Tax details for this line before saving."); return null; }
    if (editedInvoiceTotal < alreadyPaid - 0.001) {
      toast.error("Invoice total cannot be reduced below the amount already settled. Resolve the existing financial activity first."); return null;
    }
    return {
      id: invoice.id,
      currency: currency as any,
      discountPercent: pricingMode === "discount" ? discountPercent : 0,
      // V3 pricing mode fields
      ...(pricingMode === "agreed" && { pricingMode: "agreed" as const, finalAgreedAmount: cashTotal.toFixed(2) }),
      ...(pricingMode === "discount" && { pricingMode: "discount" as const }),
      // Always pass notes (even empty string) so old payment-note fragments stored in DB get cleared
      notes: stripPaymentNotes(notes),
      items: validItems.map(i => {
        const invoiceCurrencyItem = getEditInvoiceCurrencyLine(i);
        return {
          id: i.id,
          lineLabel: i.serviceId ? (i.lineLabel?.trim() || null) : undefined,
          description: i.description,
          quantity: i.quantity,
          unitPrice: parseFloat(invoiceCurrencyItem.unitPrice || "0"),
        totalPrice: getEditTaxAwareLineTotal(i),
          linePricingMethod: invoiceCurrencyItem.linePricingMethod ?? "none",
        lineDiscountPercent: invoiceCurrencyItem.linePricingMethod === "discount_percent"
          ? getV4LinePricingPreview(invoiceCurrencyItem).discountPercent
          : null,
          serviceId: i.serviceId ? parseInt(i.serviceId) : undefined,
        taxSelection: isTaxModelInvoice ? i.taxSelection : undefined,
        taxRuleId: isTaxModelInvoice && i.taxSelection ? (i.taxSelection.type === "rule" ? i.taxSelection.taxRuleId : null) : undefined,
        taxIncludedMode: invoiceCurrencyItem.taxIncludedMode || undefined,
        taxIncludedGross: invoiceCurrencyItem.taxIncludedMode ? invoiceCurrencyItem.taxIncludedGross : undefined,
        priceEntry: i.priceEntryEdited ? i.priceEntry : undefined,
        };
      }),
    } as any;
  };

  const handleSubmit = (postSaveIntent: "none" | "record_payment" = "none") => {
    if (isPublishedReadOnly) {
      reopenForRevision.mutate({ invoiceId: invoice.id });
      return;
    }
    const payload = buildInvoiceUpdatePayload(postSaveIntent);
    if (!payload) return;
    if (isEditingDraftRevision) {
      saveDraftRevision.mutate({ ...payload, draftRevisionId: draftRevisionId! });
      return;
    }
    postSaveIntentRef.current = postSaveIntent;
    // Save the invoice structure first. Payment entry always happens separately in RecordPaymentModal.
    updateFull.mutate(payload);
  };

  const handleReissue = () => {
    if (!draftRevisionId) return toast.error("Reopen this invoice before re-issuing.");
    const payload = buildInvoiceUpdatePayload("none");
    if (!payload) return;
    saveDraftRevision.mutate({ ...payload, draftRevisionId }, {
      onSuccess: () => reissueDraftRevision.mutate({ invoiceId: invoice.id, draftRevisionId }),
    });
  };

  const isMobileEdit = useIsMobile();

  const editFormBody = (
    <div className="min-w-0 space-y-5 px-3 py-4 sm:px-4">
          {requiresDraftRevision && (
            <div className={`rounded-lg border px-3 py-2.5 text-sm ${isEditingDraftRevision ? "border-amber-300 bg-amber-50 text-amber-950" : "border-sky-200 bg-sky-50 text-sky-950"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{isEditingDraftRevision ? `Draft Revision ${invoiceRevisions.find((revision: any) => revision.id === draftRevisionId)?.revisionNumber ?? ""}` : existingActiveDraft ? `Draft Revision ${existingActiveDraft.revisionNumber} in Progress` : "Current Official Invoice"}</span>
                {!isEditingDraftRevision && <Button type="button" size="sm" variant="outline" onClick={() => reopenForRevision.mutate({ invoiceId: invoice.id })} disabled={reopenForRevision.isPending || invoiceRevisionsLoading}>{reopenForRevision.isPending ? "Opening…" : invoiceRevisionsLoading ? "Checking Draft…" : existingActiveDraft ? "Resume Draft" : "Reopen for Editing"}</Button>}
              </div>
              <p className="mt-1 text-xs">{isEditingDraftRevision ? "You are editing a server-saved Draft Revision. Save Draft keeps the current official invoice unchanged; Save & Re-issue applies this revision without sending email automatically." : existingActiveDraft ? "A server-saved Draft Revision is in progress. Resume Draft restores its saved values; the current official invoice, payments, and receipts remain unchanged." : "This is the current official invoice. Reopen for Editing creates a Draft Revision; payment and receipt history remain unchanged."}</p>
              {invoiceRevisions.length > 0 && <details className="mt-2 text-xs"><summary className="cursor-pointer font-medium">Revision history ({invoiceRevisions.length})</summary><div className="mt-2 space-y-1 rounded bg-background/70 p-2">{invoiceRevisions.map((revision: any) => <div key={revision.id} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5"><span>Revision {revision.revisionNumber} · {revision.status}</span><span className="text-muted-foreground">{revision.publishedAt ? new Date(revision.publishedAt).toLocaleString() : new Date(revision.updatedAt).toLocaleString()}</span>{revision.changeSummary?.changedFields?.length > 0 && <span className="w-full text-muted-foreground">Changed: {revision.changeSummary.changedFields.join(", ")}</span>}{revision.previousTotals?.totalAmount && revision.publishedTotals?.totalAmount && <span className="w-full text-muted-foreground">Total: {revision.previousTotals.currency} {revision.previousTotals.totalAmount} → {revision.publishedTotals.currency} {revision.publishedTotals.totalAmount}</span>}</div>)}</div></details>}
            </div>
          )}
          {/* Existing invoice lines remain fixed; current patient pricing applies only to new pricing actions. */}
          <div className="flex items-center gap-2 p-2 rounded bg-blue-50 border border-blue-200 text-xs text-blue-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Existing invoice prices are preserved. New services use the patient&apos;s current pricing.
          </div>

          {/* Currency remains editable only until the invoice has payment history. */}
          <div className="flex items-center gap-3 flex-wrap">
            <Label className="text-xs w-20">Currency</Label>
            {hasPaymentHistory || isPublishedReadOnly ? (
              <div className="flex items-center gap-2 h-8 px-3 rounded border bg-muted/50 text-xs font-semibold text-foreground w-28">
                {currency}
                <span className="ml-auto text-[10px] text-muted-foreground font-normal">locked</span>
              </div>
            ) : (
              <Select value={currency} onValueChange={handleCurrencyChange}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["TRY", "USD", "EUR", "GBP", "SAR", "AED"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {(hasPaymentHistory || isPublishedReadOnly) && (
              <span className="w-full text-xs text-amber-700">
                {hasPaymentHistory ? "Invoice currency cannot be changed after payment history has been recorded, including voided payments." : "Published invoice values are read-only until you reopen a Draft Revision."}
              </span>
            )}
            {currency !== "TRY" && (() => {
              const liveRate = (liveExchangeRates as any)?.rates?.[currency]?.rate;
              const rateSource = liveRate && liveRate > 1 ? (liveExchangeRates as any)?.rates?.[currency]?.source ?? 'live' : 'settings';
              const rateDate = liveRate && liveRate > 1 ? (liveExchangeRates as any)?.rates?.[currency]?.rateDate : null;
              const isManual = (liveExchangeRates as any)?.rates?.[currency]?.isManual;
              return (
                <span className="text-xs text-muted-foreground">
                  1 {currency} = {getExchangeRate(currency).toFixed(2)} TRY · live (for new items)
                  {isManual ? ' · Manual override' : ` · ${rateSource}${rateDate ? ` (${rateDate})` : ''}`}
                </span>
              );
            })()}
            {invoiceCurrencyRepricingNotice && <span role="status" className="w-full text-xs text-sky-800">{invoiceCurrencyRepricingNotice}</span>}
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-100 text-purple-700">
              Current Pricing: {isInternational ? "International" : "Local"}
            </span>
          </div>

          {isTaxModelInvoice && !editTaxRulesLoading && unavailableSavedTaxRuleIds.length > 0 && (
            <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              A saved Tax Rule is no longer available. Saved Tax facts remain displayed for this invoice; review the affected line and select the intended current Tax Rule before saving any Tax change.
            </div>
          )}

          {/* Service Picker */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={isPublishedReadOnly} onClick={() => setShowServicePickerModal(true)} className="gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />Add Services by Category</Button>
            <Button variant="outline" size="sm" disabled={isPublishedReadOnly} className="text-xs" onClick={() => setItems(prev => [...prev, { description: "", quantity: 1, unitPrice: "0", tryPrice: "0", serviceId: "" }])}>+ Custom Line</Button>
          </div>
          <ServicePickerModal
            open={showServicePickerModal}
            onClose={() => setShowServicePickerModal(false)}
            services={(services ?? []).map(s => ({ id: s.id, name: s.name, category: s.category ?? "other", code: s.code, price: String(s.price ?? "0"), description: s.description }))}
            currency={currency}
            onResult={handleServicePickerResult}
            mode="edit"
            hasUnsavedChanges={initialized && items.length > 0}
            convertFromTRY={convertFromTRY}
          />

          {/* Line Items */}
          {!initialized ? (
            <p className="text-xs text-muted-foreground text-center py-4">Loading items...</p>
          ) : items.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3 px-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Line Item Pricing</p>
                  <p className="text-[10px] text-muted-foreground">Applies to each service line</p>
                </div>
              <div className="hidden xl:grid grid-cols-[minmax(280px,2.5fr)_56px_132px_176px_124px_188px_140px_40px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <div>Service / Description</div><div className="text-center">Qty</div><div className="text-right">Standard unit</div><div>Price adjustment</div><div>Pricing currency</div><div>Tax</div><div className="text-right">Line total</div><div />
              </div>
              {items.map((item, idx) => {
                const invoiceCurrencyItem = getEditInvoiceCurrencyLine(item);
                const linePreview = getV4LinePricingPreview(invoiceCurrencyItem);
                const lineTotal = getEditTaxAwareLineTotal(item);
                const taxSnapshot = getEditLineTaxSnapshot(item);
                const isHistoricalLine = item.id != null && (isPublishedReadOnly || (hasPaymentHistory && !isEditingDraftRevision));
                const taxLine = editTaxPreview?.lines[idx];
                const hasTaxDetail = taxSnapshot.taxLabelSnapshot !== null;
                const hasInvoiceWideAdjustment = pricingMode === "agreed" || discountAmt > 0;
                const derivedLineDiscount = deriveInvoiceLineDiscountPresentation({
                  originalLineTotal: linePreview.originalLineTotal.toFixed(2),
                  finalLineTotal: lineTotal.toFixed(2),
                });
                return (
                    <div key={item.id ?? `new-${idx}`} className="min-w-0 border rounded p-2">
                      <div className="space-y-3 xl:hidden">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 flex-1 space-y-1"><Label className="text-xs text-muted-foreground">Service</Label><Input value={item.description} disabled={isHistoricalLine} onChange={e => updateItem(idx, "description", e.target.value)} className="h-10 min-w-0 text-sm" placeholder="Service description" />{item.serviceId && <div className="space-y-1 pt-1"><Label className="text-xs text-muted-foreground">Invoice line label (optional)</Label><Input value={item.lineLabel ?? ""} disabled={isHistoricalLine} maxLength={256} onChange={e => updateItem(idx, "lineLabel", e.target.value)} className="h-9 min-w-0 text-sm" placeholder="e.g. First consultation" /><InvoiceLineLabelShortcuts disabled={isHistoricalLine} onSelect={label => updateItem(idx, "lineLabel", label)} /><p className="text-[11px] text-muted-foreground">Preview: {formatInvoiceLineDisplayName(item.description, item.lineLabel)}</p></div>}</div>{!isHistoricalLine && <button type="button" onClick={() => removeItem(idx)} className="self-end rounded border px-2 py-2 text-xs text-muted-foreground hover:text-destructive sm:mt-5">Remove</button>}</div>
                      <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label className="text-xs text-muted-foreground">Qty</Label><Input type="number" value={item.quantity} min={1} disabled={isHistoricalLine} onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 1)} className="h-10 text-center" /></div><div className="space-y-1"><Label className="text-xs text-muted-foreground">Standard unit ({currency})</Label><Input type="text" inputMode="decimal" value={item.unitPrice} disabled={isHistoricalLine} onChange={e => updateItem(idx, "unitPrice", e.target.value)} className="h-10 text-right" /></div></div>
                      <div className="rounded bg-muted/40 px-3 py-2 text-sm"><div className="flex justify-between gap-2"><span className="text-muted-foreground">Adjusted service price</span><span className="font-semibold">{currency} {lineTotal.toFixed(2)}</span></div><div className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground"><span>{linePreview.method.replace(/_/g, " ")} · {item.priceEntry?.currency ?? currency}</span><span>{taxSnapshot.taxLabelSnapshot ?? "No Tax"}</span></div></div>
                    </div>
                    <div className="hidden xl:grid grid-cols-[minmax(280px,2.5fr)_56px_132px_176px_124px_188px_140px_40px] items-center gap-2">
                      <div className="space-y-1"><Input value={item.description} disabled={isHistoricalLine} onChange={e => updateItem(idx, "description", e.target.value)} className="h-7 text-xs" placeholder="Service description" />{item.serviceId && <Input value={item.lineLabel ?? ""} disabled={isHistoricalLine} maxLength={256} onChange={e => updateItem(idx, "lineLabel", e.target.value)} className="h-7 text-xs" placeholder="Invoice line label (optional)" />}{item.serviceId && <InvoiceLineLabelShortcuts disabled={isHistoricalLine} onSelect={label => updateItem(idx, "lineLabel", label)} />}{item.serviceId && item.lineLabel?.trim() && <p className="text-[10px] text-muted-foreground">Preview: {formatInvoiceLineDisplayName(item.description, item.lineLabel)}</p>}</div>
                      <div><Input type="number" value={item.quantity} min={1} disabled={isHistoricalLine} onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 1)} className="h-9 min-w-[52px] text-xs text-center" /></div>
                      <div><Input type="text" inputMode="decimal" value={item.unitPrice} disabled={isHistoricalLine} onChange={e => updateItem(idx, "unitPrice", e.target.value)} className="h-9 min-w-[112px] text-xs text-right" /></div>
                      <div><Select value={linePreview.method === "none" ? "standard" : linePreview.method} onValueChange={value => { if (value === "standard") resetLineToStandard(idx); else setLinePricingMethod(idx, value as V4LinePricingMethod); }} disabled={isHistoricalLine}><SelectTrigger className="h-9 min-w-0 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="standard">Standard</SelectItem><SelectItem value="discount_percent">Discount %</SelectItem><SelectItem value="agreed_unit_price">Agreed Unit Price</SelectItem><SelectItem value="final_line_total">Final Line Total</SelectItem></SelectContent></Select></div>
                      <div>{(linePreview.method === "agreed_unit_price" || linePreview.method === "final_line_total") && item.priceEntry ? <Select value={item.priceEntry.currency} onValueChange={value => updateEditPriceEntry(idx, { currency: value as ServicePriceEntry["currency"] })} disabled={isHistoricalLine}><SelectTrigger className="h-9 min-w-0 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["TRY", "USD", "EUR", "GBP", "SAR", "AED"].map(code => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent></Select> : <span className="block whitespace-nowrap text-[11px] text-muted-foreground">{currency} · Invoice</span>}</div>
                      <div><Select value={getInvoiceLineTaxControlValue({ taxSelection: item.taxSelection, taxIncludedMode: item.taxIncludedMode, taxRuleId: item.taxRuleId })} onValueChange={value => setEditTaxControl(idx, value)} disabled={isHistoricalLine}><SelectTrigger className="h-9 min-w-0 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No Tax</SelectItem><SelectItem value="custom:added">Custom — Added</SelectItem><SelectItem value="custom:included" disabled={linePreview.method !== "agreed_unit_price" && linePreview.method !== "final_line_total"}>Custom — Included</SelectItem>{(activeTaxRules as any[]).flatMap(rule => [<SelectItem key={`${rule.id}-added`} value={`rule:${rule.id}:added`}>{rule.label} — Added</SelectItem>, <SelectItem key={`${rule.id}-included`} value={`rule:${rule.id}:included`} disabled={linePreview.method !== "agreed_unit_price" && linePreview.method !== "final_line_total"}>{rule.label} — Included</SelectItem>])}</SelectContent></Select></div>
                      <div className="text-right text-xs font-semibold">{lineTotal.toFixed(2)}</div>
                      <div className="flex justify-end">{!isHistoricalLine && <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive text-xs">✕</button>}</div>
                    </div>
                    {derivedLineDiscount.applies && (
                      <div className="mt-2 grid min-w-0 grid-cols-1 gap-x-2 gap-y-0.5 rounded border border-emerald-200 bg-emerald-50/50 px-2 py-1.5 text-xs sm:grid-cols-[minmax(0,1fr)_auto]">
                        <span className="min-w-0 text-muted-foreground">Standard Line Total</span><span className="font-medium sm:text-right">{currency} {derivedLineDiscount.originalLineTotal}</span>
                        <span className="min-w-0 text-emerald-700">Discount ({derivedLineDiscount.discountPercent}%)</span><span className="font-medium text-emerald-700 sm:text-right">− {currency} {derivedLineDiscount.discountAmount}</span>
                        <span className="min-w-0 font-semibold">Adjusted Service Price</span><span className="font-semibold sm:text-right">{currency} {derivedLineDiscount.finalLineTotal}</span>
                      </div>
                    )}
                    {isTaxModelInvoice && hasTaxDetail && taxLine && (
                      <div className="mt-2 grid min-w-0 grid-cols-1 gap-x-2 gap-y-0.5 rounded bg-sky-50/60 px-2 py-1.5 text-xs text-sky-950 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <span className="min-w-0 text-sky-800">{hasInvoiceWideAdjustment ? "Service Amount after Invoice Adjustment" : "Adjusted Service Price"}</span><span className="font-medium sm:text-right">{currency} {Number(taxLine.effectiveTaxableBase).toFixed(2)}</span>
                        <span className="min-w-0 text-sky-800">Tax ({Number(taxLine.tax.taxRateSnapshot ?? 0).toFixed(2)}%)</span><span className="font-medium sm:text-right">{currency} {Number(taxLine.taxAmount).toFixed(2)}</span>
                        <span className="min-w-0 font-semibold">Line Total incl. Tax</span><span className="font-semibold sm:text-right">{currency} {Number(taxLine.totalWithTax).toFixed(2)}</span>
                      </div>
                    )}
                    {!isHistoricalLine && (
                      <div className="mt-3 grid gap-3 border-t pt-3 text-xs lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <div className="space-y-1.5">
                          <div className="space-y-1.5 xl:hidden"><Label className="text-xs">Price Adjustment</Label><Select value={linePreview.method === "none" ? "standard" : linePreview.method} onValueChange={value => { if (value === "standard") resetLineToStandard(idx); else setLinePricingMethod(idx, value as V4LinePricingMethod); }}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="standard">Standard</SelectItem><SelectItem value="discount_percent">Discount %</SelectItem><SelectItem value="agreed_unit_price">Agreed Unit Price</SelectItem><SelectItem value="final_line_total">Final Line Total</SelectItem></SelectContent></Select></div>
                          {linePreview.method === "discount_percent" && <Input type="number" min={0} max={100} step="0.01" value={item.lineDiscountPercent ?? "0"} onChange={e => updateItem(idx, "lineDiscountPercent", e.target.value)} className="h-8 text-xs" placeholder="Discount %" />}
                          {(linePreview.method === "agreed_unit_price" || linePreview.method === "final_line_total") && item.priceEntry && <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-2 lg:grid-cols-1"><div className="xl:hidden"><Select value={item.priceEntry.currency} onValueChange={value => updateEditPriceEntry(idx, { currency: value as ServicePriceEntry["currency"] })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["TRY", "USD", "EUR", "GBP", "SAR", "AED"].map(code => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent></Select></div><Input type="text" inputMode="decimal" value={item.priceEntry.amount} onChange={e => updateEditPriceEntry(idx, { amount: e.target.value })} className="h-8 text-xs" placeholder={linePreview.method === "agreed_unit_price" ? "Agreed unit price" : "Final line total"} /></div>}
                          {linePreview.method === "final_line_total" && <p className="text-muted-foreground">Whole-line amount; quantity changes require Keep, Reset, or Cancel.</p>}
                          {linePreview.method === "agreed_unit_price" && item.priceEntry && <p className="text-muted-foreground">{item.priceEntry.amount || "0.00"} {item.priceEntry.currency} × {item.quantity}; quantity recalculates automatically.</p>}
                        </div>
                        {isTaxModelInvoice && <div className="space-y-1.5"><div className="space-y-1.5 xl:hidden"><Label className="text-xs">Tax</Label><Select value={getInvoiceLineTaxControlValue({ taxSelection: item.taxSelection ?? (item.taxLabelSnapshot === "Custom Tax" ? { type: "custom", ratePercent: item.taxRateSnapshot ?? "0" } : null), taxIncludedMode: item.taxIncludedMode, taxRuleId: item.taxRuleId })} onValueChange={value => setEditTaxControl(idx, value)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No Tax</SelectItem><SelectItem value="custom:added">Custom Tax — Added</SelectItem><SelectItem value="custom:included" disabled={linePreview.method !== "agreed_unit_price" && linePreview.method !== "final_line_total"}>Custom Tax — Included</SelectItem>{(activeTaxRules as any[]).flatMap(rule => [<SelectItem key={`${rule.id}-added`} value={`rule:${rule.id}:added`}>{rule.label} ({Number(rule.ratePercent).toFixed(2)}%) — Added</SelectItem>, <SelectItem key={`${rule.id}-included`} value={`rule:${rule.id}:included`} disabled={linePreview.method !== "agreed_unit_price" && linePreview.method !== "final_line_total"}>{rule.label} ({Number(rule.ratePercent).toFixed(2)}%) — Included</SelectItem>])}</SelectContent></Select></div>{(item.taxSelection?.type === "custom" || (!item.taxSelection && item.taxLabelSnapshot === "Custom Tax")) && <Input type="text" inputMode="decimal" value={item.taxSelection?.type === "custom" ? item.taxSelection.ratePercent : item.taxRateSnapshot ?? "0"} placeholder="Custom Tax %" onChange={e => updateEditLineTaxSelection(idx, { type: "custom", ratePercent: e.target.value })} className="h-8 text-xs" />}{item.taxIncludedMode && <p className="text-muted-foreground">Included Tax keeps the entered commercial gross amount.</p>}</div>}
                        {item.priceEntry && item.priceEntry.currency !== currency && <div className="sm:col-span-2 rounded border border-sky-200 bg-sky-50/50 p-2 space-y-2"><div className="flex flex-wrap gap-3"><label className="flex items-center gap-1"><input type="radio" checked={(item.priceEntry.fx?.source ?? "system") === "system"} onChange={() => setEditPriceEntryFxSource(idx, "system")} />System FX</label><label className="flex items-center gap-1"><input type="radio" checked={item.priceEntry.fx?.source === "manual"} onChange={() => setEditPriceEntryFxSource(idx, "manual")} />Manual Approved FX</label></div>{item.priceEntry.fx?.source === "manual" && <div className="grid gap-2 sm:grid-cols-2"><div className="space-y-1"><Label className="text-xs">1 {item.priceEntry.currency} = X {currency}</Label><Input type="text" inputMode="decimal" value={getEditManualServiceFxInput(idx, item.priceEntry)} onChange={e => updateEditManualServiceFxInput(idx, e.target.value)} className="h-8 text-xs" placeholder="0.000000" /></div><div className="space-y-1"><Label className="text-xs">FX note (optional)</Label><Input value={item.priceEntry.fx.note ?? ""} onChange={e => updateEditPriceEntry(idx, { fx: { note: e.target.value } })} className="h-8 text-xs" placeholder="Optional approval context" /></div></div>}{getEditSourcePricePreview(item) ? <p className="text-muted-foreground">Source line amount converts once before Tax. {getEditSourcePricePreview(item)!.convertedAmount} {currency} before Tax treatment.</p> : <p className="text-amber-700">Enter a valid amount and, for Manual FX, the approved rate.</p>}</div>}
                        {!derivedLineDiscount.applies && linePreview.finalLineTotal !== linePreview.originalLineTotal && <p className="sm:col-span-2 text-muted-foreground">Standard reference line value: {currency} {linePreview.originalLineTotal.toFixed(2)}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* V3: Mode A / Mode B radio + single input */}
          {items.length > 0 && !isPublishedReadOnly && (
            <div className="rounded-lg border bg-muted/10 p-3">
              <button type="button" onClick={() => {
                if (editHasTaxIncludedLine) return toast.error("Tax-Included line pricing can't be combined with invoice-wide pricing adjustments.");
                setInvoiceAdjustmentOpen(open => !open);
              }} className="flex w-full items-center justify-between gap-2 text-left">
                <span className="text-sm font-medium">Invoice-wide pricing</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${invoiceAdjustmentOpen ? "rotate-180" : ""}`} />
              </button>
              {!invoiceAdjustmentOpen && <p className="mt-1 text-xs text-muted-foreground">{editHasTaxIncludedLine ? "Unavailable while a Tax-Included line price is active." : "Optional discount or final agreed price. The standard invoice total is unchanged."}</p>}
              {invoiceAdjustmentOpen && <div className="mt-3 space-y-3 border-t pt-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Invoice-Wide Pricing</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Applies after all line item pricing adjustments.</p>
                </div>
                {(existingPayments?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-2 p-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Pricing mode is locked after payments are recorded. Cancel and recreate the invoice if the pricing structure must change.
                  </div>
                )}
                <div className={`flex gap-4 ${(existingPayments?.length ?? 0) > 0 ? "opacity-50 pointer-events-none" : ""}`}>
                  <label className="flex items-center gap-2 cursor-pointer text-xs"><input type="radio" name="editPricingMode" value="discount" checked={pricingMode === "discount"} onChange={() => { setPricingMode("discount"); setFinalAgreedPrice(""); }} className="accent-primary" />Apply discount %</label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs"><input type="radio" name="editPricingMode" value="agreed" checked={pricingMode === "agreed"} onChange={() => { setPricingMode("agreed"); setDiscountPercent(0); }} className="accent-primary" />Set final agreed price</label>
                </div>
                {pricingMode === "discount" ? (
                  <div className="flex items-center gap-3"><Label className="text-xs w-28">Discount (%)</Label><Input type="number" value={discountPercent} min={0} max={100} step="0.5" onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)} className="h-8 text-xs w-24" />{discountPercent > 0 && <span className="text-xs text-emerald-600">− {currency} {discountAmt.toFixed(2)}</span>}</div>
                ) : (
                  <div className="flex items-center gap-3"><Label className="text-xs w-28">Final agreed price ({currency})</Label><Input type="text" inputMode="decimal" value={finalAgreedPrice} placeholder={subtotal > 0 ? subtotal.toFixed(2) : "0.00"} onChange={e => { const normalized = normalizeServicePriceDecimalInput(e.target.value); if (normalized !== null) setFinalAgreedPrice(normalized); }} className={`h-8 text-xs w-32 ${agreedPriceWarning ? "border-red-400" : ""}`} />{agreedPriceWarning && <span className="text-xs text-red-500">{agreedPriceWarning}</span>}</div>
                )}
                {!(existingPayments?.length ?? 0) && (pricingMode === "agreed" || discountPercent > 0) && <button type="button" onClick={() => { setPricingMode("discount"); setDiscountPercent(0); setFinalAgreedPrice(""); setInvoiceAdjustmentOpen(false); }} className="text-xs text-muted-foreground hover:text-destructive">Reset to standard invoice total</button>}
              </div>}
            </div>
          )}

          {/* V3: Simplified Invoice Summary */}
          {items.length > 0 && (
            <div className="border rounded-lg p-3 bg-muted/20 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Invoice Summary</p>
              {editHasUnresolvedSourcePrice ? (
                <p role="status" className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                  Invoice totals are unavailable until each negotiated source price has a valid FX rate for {currency}.
                </p>
              ) : <>
              {discountAmt > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{currency} {subtotal.toFixed(2)}</span>
                </div>
              )}
              {discountAmt > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>{pricingMode === "discount" ? `Discount (${discountPercent}%)` : "Discount"}</span>
                  <span>− {currency} {discountAmt.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold border-t pt-1">
                <span>{isTaxModelInvoice ? "Service Total" : "Invoice Total"}</span>
                <span>{currency} {(isTaxModelInvoice ? cashTotal : editedInvoiceTotal).toFixed(2)}</span>
              </div>
              {editTaxPreview && Number(editTaxPreview.totalTaxAmount) > 0 && (
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Service Tax</span><span>{currency} {Number(editTaxPreview.totalTaxAmount).toFixed(2)}</span></div>
              )}
              {isTaxModelInvoice && <div className="flex justify-between text-sm font-semibold border-t pt-1"><span>Patient Total</span><span>{currency} {editedInvoiceTotal.toFixed(2)}</span></div>}
              {/* V3: Card hint only in Mode A */}
              {pricingMode === "discount" && cardTotal !== null && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Card / Bank Transfer (+{Math.round(surchargeRate * 100)}%)</span>
                  <span>{currency} {cardTotal.toFixed(2)}</span>
                </div>
              )}
              {alreadyPaid > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Amount Received</span>
                  <span>{currency} {alreadyPaid.toFixed(2)}</span>
                </div>
              )}
              {editDualBalancePresentation.shouldShowRemainingServiceAmountBeforeTax && (
                <>
                  <div className="flex justify-between text-sm text-muted-foreground border-t pt-1">
                    <span>Remaining Service Amount (Before Tax)</span>
                    <span>{currency} {editDualBalancePresentation.remainingServiceAmountBeforeTax}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Informational only; the actual amount due is shown below including tax.</p>
                </>
              )}
              <div className="flex justify-between text-sm font-bold border-t pt-1">
                <span>{editDualBalancePresentation.shouldShowRemainingServiceAmountBeforeTax ? "Total Balance Due (Including Tax)" : "Balance Remaining"}</span>
                <span className={remaining <= 0 ? "text-emerald-600" : "text-amber-600"}>
                  {remaining <= 0 ? "Paid in Full ✓" : `${currency} ${remaining.toFixed(2)}`}
                </span>
              </div>
              </>}
            </div>
          )}

          {items.length > 0 && remaining > 0 && (
            <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3 text-xs text-sky-900">
              <p className="font-semibold">Need to record a payment?</p>
              <p className="mt-1 text-sky-800">Finish this invoice revision first. Use Save &amp; Re-issue to apply your changes to the current official invoice, then record the payment from the invoice&apos;s Payments section.</p>
              <p className="mt-1 text-sky-800">Save Draft only saves your changes for later and does not update the current official invoice.</p>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} disabled={isPublishedReadOnly} onChange={e => setNotes(e.target.value)} rows={2} className="text-xs" placeholder="Invoice notes..." />
          </div>
        {!isEditingDraftRevision && <label className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
          <input
            type="checkbox"
            id="openInvoiceSendAfterEdit"
            checked={openSendAfterSave}
            onChange={event => setOpenSendAfterSave(event.target.checked)}
            className="mt-0.5 accent-sky-600"
          />
          <span>
            <span className="block text-sm font-medium text-sky-900">Open Send Invoice after save</span>
            <span className="block text-xs text-sky-700">The invoice is saved first. Review recipients and press Send Email separately.</span>
          </span>
        </label>}
        <div className="sticky bottom-0 z-10 flex w-full flex-col gap-2 border-t bg-background px-3 pt-3 sm:flex-row sm:items-center sm:justify-end sm:px-4" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          {isPublishedReadOnly ? (
            <Button onClick={() => reopenForRevision.mutate({ invoiceId: invoice.id })} disabled={reopenForRevision.isPending || invoiceRevisionsLoading} className="w-full sm:w-auto">{reopenForRevision.isPending ? "Opening…" : invoiceRevisionsLoading ? "Checking Draft…" : existingActiveDraft ? "Resume Draft" : "Reopen for Editing"}</Button>
          ) : isEditingDraftRevision ? (
            <>
              <Button variant="outline" onClick={() => handleSubmit("none")} disabled={saveDraftRevision.isPending || reissueDraftRevision.isPending || items.length === 0} className="w-full sm:w-auto">{saveDraftRevision.isPending ? "Saving Draft…" : "Save Draft"}</Button>
              <Button onClick={handleReissue} disabled={saveDraftRevision.isPending || reissueDraftRevision.isPending || items.length === 0} className="w-full sm:w-auto">{reissueDraftRevision.isPending ? "Re-issuing…" : "Save & Re-issue"}</Button>
            </>
          ) : <>
            <Button variant="outline" onClick={() => handleSubmit("record_payment")} disabled={updateFull.isPending || items.length === 0} className="w-full sm:w-auto">{updateFull.isPending ? "Saving..." : "Save & Record Payment"}</Button>
            <Button onClick={() => handleSubmit("none")} disabled={updateFull.isPending || items.length === 0} className="w-full sm:w-auto">{updateFull.isPending ? "Saving..." : "Save Changes"}</Button>
          </>}
        </div>
        <AlertDialog open={pendingEditQuantityChange !== null} onOpenChange={isOpen => { if (!isOpen) setPendingEditQuantityChange(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Choose how to update this agreed line</AlertDialogTitle>
              <AlertDialogDescription>
                This price applies to the whole line, not each unit. Keep the agreed total with the new quantity, or reset to standard unit price × quantity. Cancel leaves this quantity unchanged. No invoice record is changed until you save.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel quantity change</AlertDialogCancel>
              <AlertDialogAction onClick={keepEditAgreedLineTotalAfterQuantityChange}>Keep agreed total</AlertDialogAction>
              <Button type="button" variant="outline" onClick={resetEditLinePricingAfterQuantityChange}>Reset to standard price</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
  );

  if (!open) return null;

  if (isMobileEdit) {
    return (
      <Sheet open={open} onOpenChange={v => !v && onClose()}>
        <SheetContent
          side="bottom"
          className="!p-0 !gap-0 !rounded-none !inset-0 !h-[100dvh] !max-h-[100dvh] flex flex-col w-full"
          style={{ maxWidth: "100vw" }}
        >
          <SheetTitle className="sr-only">Edit Invoice</SheetTitle>
          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-background">
            <span className="font-semibold text-base">Edit Invoice — {invoice.invoiceNumber}</span>
          </div>
          <div className="flex-1 overflow-y-scroll overscroll-contain" style={{ WebkitOverflowScrolling: "touch" as any }}>
            {editFormBody}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] max-h-[90vh] overflow-y-auto sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] xl:!w-[calc(100vw-3rem)] xl:!max-w-[1760px]">
        <DialogHeader><DialogTitle>Edit Invoice — {invoice.invoiceNumber}</DialogTitle></DialogHeader>
        {editFormBody}
      </DialogContent>
    </Dialog>
  );
}

// ─── Patient Intake Tab ──────────────────────────────────────────────────────────────
function PatientIntakeTab({ patientId }: { patientId: number }) {
  return <MedicalIntakeForm mode="patient" id={patientId} />;
}

// ─── Link Patient Partner Dialog ──────────────────────────────────────────────
function LinkPatientPartnerDialog({ patientId, onClose, onSuccess }: { patientId: number; onClose: () => void; onSuccess: () => void }) {
  const [search, setSearch] = useState("");
  const { data: patientsAllResult } = trpc.patients.list.useQuery({ pageSize: 1000 });
  const patients = patientsAllResult?.data;
  const linkPartner = trpc.patients.linkPartner.useMutation({
    onSuccess: () => { toast.success("Partner linked successfully"); onSuccess(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const filtered = ((patients ?? []) as any[]).filter((p: any) =>
    p.id !== patientId &&
    !p.partnerId &&
    (
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      (p.mrn ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.phone ?? "").includes(search)
    )
  ).slice(0, 10);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link Partner Patient</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Search for another patient to link as the partner (spouse/partner) for this couple.</p>
          <Input
            placeholder="Search by name, MRN, or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {search ? "No matching patients found" : "Type to search patients"}
              </p>
            ) : (
              filtered.map((p: any) => (
                <button
                  key={p.id}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
                  onClick={() => linkPartner.mutate({ patientId, partnerId: p.id })}
                  disabled={linkPartner.isPending}
                >
                  <div className="font-medium text-sm">{p.firstName} {p.lastName}</div>
                  <div className="text-xs text-muted-foreground">{p.mrn} {p.phone ? `· ${p.phone}` : ""}</div>
                </button>
              ))
            )}
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Patient Appointment Form Modal ──────────────────────────────────────────
function PatientAppointmentFormModal({ patientId, patients, staffUsers, onClose, onSuccess }: {
  patientId: number; patients: any[]; staffUsers: any[]; onClose: () => void; onSuccess: () => void;
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
    title: "", doctorId: "", serviceId: "", hostUserId: "",
    date: todayStr, time: "09:00", endTime: "09:30", duration: "30",
    type: "consultation", appointmentType: "in-clinic", purpose: "",
    meetingLink: "", partnerClinicId: "", externalLocation: "", notes: "",
  });

  useEffect(() => {
    if (!open) setForm({ title: "", doctorId: "", serviceId: "", hostUserId: "", date: todayStr, time: "09:00", endTime: "09:30", duration: "30", type: "consultation", appointmentType: "in-clinic", purpose: "", meetingLink: "", partnerClinicId: "", externalLocation: "", notes: "" });
  }, [open]);

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
    const selectedPatient = patients.find(p => p.id === patientId);
    const autoTitle = selectedPatient
      ? `${selectedPatient.firstName} ${selectedPatient.lastName}${form.purpose ? ` — ${form.purpose.replace(/-/g, " ")}` : ""}`
      : "Appointment";
    createAppt.mutate({
      patientId,
      doctorId: form.doctorId ? parseInt(form.doctorId) : undefined,
      serviceId: form.serviceId ? parseInt(form.serviceId) : undefined,
      title: form.title.trim() || autoTitle,
      appointmentDate: new Date(`${form.date}T${form.time}`),
      endDate,
      duration: Math.round((endDate.getTime() - selectedDt.getTime()) / 60_000),
      type: form.type as any,
      appointmentType: form.appointmentType as any,
      purpose: form.purpose as any || undefined,
      hostUserId: form.hostUserId ? parseInt(form.hostUserId) : undefined,
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
                  <SelectItem value="internal-test">Internal Test</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Host (Staff)</Label>
              <Select value={form.hostUserId || "_none"} onValueChange={v => setForm(f => ({ ...f, hostUserId: v === "_none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select host" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {(staffUsers ?? []).map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
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

// ─── Patient Appointment Detail Modal ────────────────────────────────────────
function PatientApptDetailModal({ appointment: a, patientName, onClose, onRefresh }: {
  appointment: any; patientName: string; onClose: () => void; onRefresh: (appointmentPatch?: Record<string, unknown>) => void;
}) {
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSendDetails, setShowSendDetails] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [pendingStatusAction, setPendingStatusAction] = useState<AppointmentStatusAction | null>(null);

  const { data: doctors } = trpc.doctors.list.useQuery();
  const { data: services } = trpc.services.list.useQuery({});
  const { data: allUsers } = trpc.users.list.useQuery();
  const { data: partnerClinics } = trpc.partnerClinics.list.useQuery();

  const apptTime = new Date(a.appointmentDate);
  const apptEndTime = effectiveAppointmentEnd({ appointmentDate: apptTime, endDate: a.endDate, duration: a.duration });
  const [editForm, setEditForm] = useState({
    title: a.title ?? "",
    date: format(apptTime, "yyyy-MM-dd"),
    time: format(apptTime, "HH:mm"),
    endTime: localTimeValue(apptEndTime),
    duration: String(a.duration ?? 30),
    appointmentType: a.appointmentType ?? "in-clinic",
    purpose: a.purpose ?? "",
    doctorId: String(a.doctorId ?? ""),
    serviceId: String(a.serviceId ?? ""),
    hostUserId: String(a.hostUserId ?? ""),
    meetingLink: a.meetingLink ?? "",
    partnerClinicId: String(a.partnerClinicId ?? ""),
    externalLocation: a.externalLocation ?? "",
    notes: a.notes ?? "",
  });

  const updateAppt = trpc.appointments.update.useMutation({
    onSuccess: (_result, variables) => {
      toast.success("Appointment updated");
      setEditMode(false);
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
    onError: (e: any) => toast.error(e.message),
  });
  const deleteAppt = trpc.appointments.delete.useMutation({
    onSuccess: () => { toast.success("Appointment deleted"); onClose(); onRefresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const statusBadge: Record<string, string> = {
    upcoming: "bg-blue-100 text-blue-700", confirmed: "bg-emerald-100 text-emerald-700",
    completed: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700",
    no_show: "bg-orange-100 text-orange-700", rescheduled: "bg-purple-100 text-purple-700",
  };
  const isPast = apptTime < new Date();

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

  const handleSaveEdit = () => {
    const dt = new Date(`${editForm.date}T${editForm.time}`);
    if (isNaN(dt.getTime())) return toast.error("Invalid date or time");
    const endDate = endDateFromLocalTime(dt, editForm.endTime);
    if (!endDate) return toast.error("Invalid end time");
    const meetingLinkError = validateOptionalMeetingLink(editForm.meetingLink);
    if (meetingLinkError) return toast.error(meetingLinkError);
    updateAppt.mutate({
      id: a.id,
      data: {
        title: editForm.title.trim() || undefined,
        appointmentDate: dt,
        endDate,
        duration: Math.round((endDate.getTime() - dt.getTime()) / 60_000),
        appointmentType: editForm.appointmentType as any,
        purpose: (editForm.purpose && editForm.purpose !== "_none") ? editForm.purpose as any : undefined,
        doctorId: editForm.doctorId ? parseInt(editForm.doctorId) : undefined,
        serviceId: editForm.serviceId ? parseInt(editForm.serviceId) : undefined,
        hostUserId: editForm.hostUserId ? parseInt(editForm.hostUserId) : undefined,
        meetingLink: editForm.appointmentType === "online" ? (editForm.meetingLink.trim() || null) : null,
        partnerClinicId: editForm.partnerClinicId ? parseInt(editForm.partnerClinicId) : null,
        externalLocation: editForm.appointmentType === "external" && !editForm.partnerClinicId ? editForm.externalLocation.trim() || null : null,
        notes: editForm.notes || undefined,
      },
    });
  };

  return (
    <>
      <Dialog open onOpenChange={onClose}>
          <DialogContent className="flex max-h-[92dvh] max-w-lg flex-col overflow-hidden p-0 sm:max-w-3xl">
            <DialogHeader className="shrink-0 border-b bg-background px-4 py-3 pr-12 sm:px-5">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="text-sm">Appointment Details</DialogTitle>
                <AppointmentDetailsIdentityRow
                  name={a.relatedEntityDisplayName || patientName || "Patient"}
                  supportingText={a.purpose?.replace(/-/g, " ")}
                  badges={<>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadge[a.status] ?? "bg-gray-100"}`}>{a.status.replace(/_/g, " ")}</span>
                    {a.appointmentType && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold capitalize text-muted-foreground">{a.appointmentType.replace(/-/g, " ")}</span>}
                  </>}
                />
              </div>
              {!editMode && a.status !== "cancelled" && a.status !== "completed" && (
                <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setEditMode(true)}>
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
              )}
            </div>
            </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
          {editMode ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 [&_.col-span-2]:col-span-1 sm:grid-cols-2 sm:[&_.col-span-2]:col-span-2">
                <div className="col-span-2 space-y-1.5">
                  <Label>Title (optional)</Label>
                  <Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} placeholder="Auto-generated if left blank" />
                </div>
                <div className="space-y-1.5">
                  <Label>Date *</Label>
                  <Input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Start Time *</Label>
                  <Input type="time" value={editForm.time} onChange={e => setEditForm(f => {
                    const start = new Date(`${f.date}T${e.target.value}`);
                    return { ...f, time: e.target.value, endTime: localTimeValue(new Date(start.getTime() + (parseInt(f.duration) || 30) * 60_000)) };
                  })} required />
                </div>
                <div className="space-y-1.5">
                  <Label>End Time *</Label>
                  <Input type="time" value={editForm.endTime} onChange={e => setEditForm(f => {
                    const start = new Date(`${f.date}T${f.time}`);
                    const end = endDateFromLocalTime(start, e.target.value);
                    return { ...f, endTime: e.target.value, duration: end ? String(Math.round((end.getTime() - start.getTime()) / 60_000)) : f.duration };
                  })} required />
                  {editForm.endTime < editForm.time && <p className="text-xs text-muted-foreground">An earlier clock time is scheduled for the following day.</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Duration <span className="text-xs font-normal text-muted-foreground">(derived)</span></Label>
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">{editForm.duration || 0} min</div>
                  <div className="flex flex-wrap gap-1">
                    {["15", "30", "45", "60"].map(v => <Button key={v} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setEditForm(f => {
                      const start = new Date(`${f.date}T${f.time}`);
                      return { ...f, duration: v, endTime: localTimeValue(new Date(start.getTime() + (parseInt(v) || 30) * 60_000)) };
                    })}>{v} min</Button>)}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={editForm.appointmentType} onValueChange={v => setEditForm(f => ({
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
                  <Select value={editForm.doctorId || "_none"} onValueChange={v => setEditForm(f => ({ ...f, doctorId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {(doctors ?? []).map((d: any) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Host (Staff)</Label>
                  <Select value={editForm.hostUserId || "_none"} onValueChange={v => setEditForm(f => ({ ...f, hostUserId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select host" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {(allUsers ?? []).map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Purpose</Label>
                  <Select value={editForm.purpose || "_none"} onValueChange={v => setEditForm(f => ({ ...f, purpose: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select purpose" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      <SelectItem value="sales-consultation">Sales Consultation</SelectItem>
                      <SelectItem value="medical-consultation">Medical Consultation</SelectItem>
                      <SelectItem value="follow-up">Follow-up</SelectItem>
                      <SelectItem value="procedure">Procedure</SelectItem>
                      <SelectItem value="diagnostic-test">Diagnostic Test</SelectItem>
                      <SelectItem value="internal-test">Internal Test</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editForm.appointmentType === "online" && (
                  <div className="col-span-2 space-y-1.5">
                    <Label>Meeting Link</Label>
                    {a.status === "cancelled" ? <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Meeting link is retained and locked while this appointment is cancelled. Re-activate it before changing the link.</p> : <>
                      <div className="relative">
                        <Input value={editForm.meetingLink} onChange={e => setEditForm(f => ({ ...f, meetingLink: e.target.value }))} placeholder="https://meet.google.com/..."
                          aria-invalid={Boolean(validateOptionalMeetingLink(editForm.meetingLink))} className={`pr-10 ${validateOptionalMeetingLink(editForm.meetingLink) ? "border-destructive focus-visible:ring-destructive" : ""}`} />
                        {editForm.meetingLink && <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2" aria-label="Clear meeting link" title="Clear meeting link" onClick={() => setEditForm(f => ({ ...f, meetingLink: "" }))}><X className="h-4 w-4" /></Button>}
                      </div>
                      {validateOptionalMeetingLink(editForm.meetingLink) && <p className="text-xs text-destructive">{validateOptionalMeetingLink(editForm.meetingLink)}</p>}
                    </>}
                  </div>
                )}
                {editForm.appointmentType === "external" && (
                  <div className="col-span-2 space-y-1.5">
                    <Label>Partner Clinic</Label>
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
                <div className="col-span-2 space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                <Button onClick={handleSaveEdit} disabled={updateAppt.isPending || Boolean(validateOptionalMeetingLink(editForm.meetingLink))}>{updateAppt.isPending ? "Saving..." : "Save Changes"}</Button>
              </div>
            </div>
          ) : (
          <div className="space-y-3">
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
                  <Video className="h-3.5 w-3.5" />{generateGoogleMeet.isPending ? "Generating Google Meet…" : "Generate GoogleMeet"}
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
                    <Button size="sm" variant="outline" className="gap-1.5 text-emerald-700 border-emerald-300"
                      onClick={() => setPendingStatusAction("confirm")}>
                      Confirm
                    </Button>
                  )}
                  <Button size="sm" variant="outline"
                    className={`gap-1.5 ${isPast ? "text-green-700 border-green-300" : "opacity-50 cursor-not-allowed"}`}
                    disabled={!isPast}
                    title={!isPast ? "Cannot mark as complete before the appointment time" : "Mark as completed"}
                    onClick={() => isPast && setPendingStatusAction("complete")}>
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
                {!editMode && a.status !== "cancelled" && a.status !== "completed" && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditMode(true)}><Pencil className="h-3 w-3" /> Edit</Button>}
              </AppointmentDetailsActionGroup>
              <AppointmentDetailsActionGroup label="Danger zone" tone="danger">
                {a.status !== "completed" && a.status !== "cancelled" && <Button size="sm" variant="outline" className="gap-1.5 text-red-700 border-red-300" onClick={() => setShowCancelDialog(true)}>Cancel Appointment</Button>}
                <Button size="sm" variant="ghost" className="gap-1.5 text-red-700" onClick={() => setShowDeleteDialog(true)}>Delete Appointment</Button>
              </AppointmentDetailsActionGroup>
            </div>
          </div>
          )}
          </div>
          {!editMode && <div className="shrink-0 border-t bg-background px-4 py-2.5 sm:px-5">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onClose}>Close</Button>
          </div>}
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
    </>
  );
}

// ─── Refund Dialog ────────────────────────────────────────────────────────────
function RefundDialog({ open, invoice, patientId, onClose, onSuccess }: { open: boolean; invoice: any; patientId: number; onClose: () => void; onSuccess: () => void }) {
  const refundSummary = trpc.finance.getInvoiceFinancialSummary.useQuery(
    { invoiceId: invoice?.id ?? 0 },
    { enabled: open && Boolean(invoice?.id) },
  );
  const maxRefundable = Math.max(0, Number(refundSummary.data?.maxRefundable ?? 0));
  const netSettled = Math.max(0, Number(refundSummary.data?.netSettled ?? invoice?.paidAmount ?? 0));
  const grossReceived = Math.max(0, Number(refundSummary.data?.grossReceived ?? 0));
  const refunded = Math.max(0, Number(refundSummary.data?.refunded ?? 0));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "bank_transfer" | "card_reversal" | "other">("cash");
  const [notes, setNotes] = useState("");
  const currency: string = invoice?.currency ?? "TRY";

  // Reset amount when dialog opens with a new invoice
  useEffect(() => {
    if (open) { setAmount(""); setNotes(""); }
  }, [open, invoice?.id]);

  const createRefund = trpc.finance.createRefund.useMutation({
    onSuccess: () => {
      toast.success("Refund recorded");
      setAmount(""); setNotes("");
      onSuccess();
    },
    onError: (e) => toast.error(e.message || "Failed to record refund"),
  });

  const handleSubmit = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid refund amount");
    if (refundSummary.isLoading) return toast.error("Checking refundable external receipts. Please wait.");
    if (amt > maxRefundable) return toast.error(`Refund cannot exceed currently refundable external receipts (${currency} ${maxRefundable.toFixed(2)})`);
    createRefund.mutate({
      patientId,
      invoiceId: invoice.id,
      amount: amt,
      currency: currency as any,
      method,
      notes: notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownLeft className="h-4 w-4 text-rose-500" />
            Issue Refund — {invoice?.invoiceNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-muted/30 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Invoice Total</span>
              <span className="font-medium">{currency} {Number(invoice?.totalAmount ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Gross Received</span>
              <span className="font-medium">{currency} {grossReceived.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Refunded</span>
              <span className="font-medium text-rose-600">{currency} {refunded.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Net Settled</span>
              <span className="font-medium text-emerald-600">{currency} {netSettled.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t pt-1">
              <span className="text-xs font-semibold">Max Refundable</span>
              <span className="font-bold text-rose-600">{currency} {maxRefundable.toFixed(2)}</span>
            </div>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Refund Amount ({currency})</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={e => { const normalized = normalizeServicePriceDecimalInput(e.target.value); if (normalized !== null) setAmount(normalized); }}
                  onBlur={e => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > maxRefundable) setAmount(maxRefundable.toFixed(2));
                  }}
                  max={maxRefundable}
                  placeholder={`Max ${maxRefundable.toFixed(2)}`}
                  className={`h-8 text-sm ${parseFloat(amount) > maxRefundable ? "border-rose-500 focus-visible:ring-rose-500" : ""}`}
                />
                {parseFloat(amount) > maxRefundable && (
                  <p className="text-[10px] text-rose-500">Exceeds currently refundable external receipts</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Method</Label>
                <Select value={method} onValueChange={v => setMethod(v as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="card_reversal">Card Reversal</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for refund..." className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" variant="destructive" onClick={handleSubmit} disabled={createRefund.isPending || refundSummary.isLoading || maxRefundable <= 0}>
              {createRefund.isPending ? "Processing..." : "Issue Refund"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Apply Credit Dialog ──────────────────────────────────────────────────────
function ApplyCreditDialog({ open, invoice, patientId, availableCredit, onClose, onSuccess }: { open: boolean; invoice: any; patientId: number; availableCredit: number; onClose: () => void; onSuccess: () => void }) {
  const currency: string = invoice?.currency ?? "TRY";
  const maxApply = Math.min(availableCredit, Math.max(0, Number(invoice?.totalAmount ?? 0) - Number(invoice?.paidAmount ?? 0)));
  const [amount, setAmount] = useState(maxApply.toFixed(2));

  useEffect(() => { setAmount(maxApply.toFixed(2)); }, [maxApply]);

  const applyCredit = trpc.finance.applyCredit.useMutation({
    onSuccess: () => { toast.success("Credit applied to invoice"); onSuccess(); },
    onError: (e) => toast.error(e.message || "Failed to apply credit"),
  });

  const handleSubmit = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (amt > availableCredit) return toast.error(`Cannot apply more than available credit (${currency} ${availableCredit.toFixed(2)})`);
    applyCredit.mutate({ patientId, invoiceId: invoice.id, amount: amt, currency: currency as any });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-violet-500" />
            Apply Credit — {invoice?.invoiceNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-violet-50 border border-violet-200">
            <div><p className="text-xs text-violet-600">Available Credit</p><p className="font-bold text-violet-700">{currency} {availableCredit.toFixed(2)}</p></div>
            <div><p className="text-xs text-muted-foreground">Remaining on Invoice</p><p className="font-bold">{currency} {(Number(invoice?.totalAmount ?? 0) - Number(invoice?.paidAmount ?? 0)).toFixed(2)}</p></div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amount to Apply ({currency})</Label>
            <Input type="text" inputMode="decimal" value={amount} onChange={e => { const normalized = normalizeServicePriceDecimalInput(e.target.value); if (normalized !== null) setAmount(normalized); }} className="h-8 text-sm" />
            <p className="text-[10px] text-muted-foreground">Auto-filled with maximum applicable amount. Edit if needed.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={applyCredit.isPending} className="bg-violet-600 hover:bg-violet-700">
              {applyCredit.isPending ? "Applying..." : "Apply Credit"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Convert & Apply Credit Dialog ────────────────────────────────────────────
function ConvertCreditDialog({ open, invoice, patientId, availableCredits, onClose, onSuccess }: {
  open: boolean;
  invoice: any;
  patientId: number;
  availableCredits: Record<string, number>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const targetCurrency: string = invoice?.currency ?? "TRY";
  const sourceOptions = Object.entries(availableCredits).filter(([currency, amount]) => currency !== targetCurrency && amount > 0.001);
  const [sourceCurrency, setSourceCurrency] = useState(sourceOptions[0]?.[0] ?? "EUR");
  const [targetAmount, setTargetAmount] = useState("");
  const [applyMaximum, setApplyMaximum] = useState(true);
  useEffect(() => {
    const next = sourceOptions[0];
    setSourceCurrency(next?.[0] ?? "EUR");
    setTargetAmount("");
    setApplyMaximum(true);
  }, [invoice?.id]);
  const parsedTargetAmount = Number(targetAmount);
  const preview = trpc.finance.previewCrossCurrencyCredit.useQuery(
    {
      patientId,
      invoiceId: invoice?.id ?? 0,
      sourceCurrency: sourceCurrency as any,
      ...(applyMaximum ? { applyMaximum: true } : { targetAmount: parsedTargetAmount > 0 ? parsedTargetAmount : undefined }),
    },
    { enabled: open && Boolean(invoice?.id) && sourceOptions.some(([currency]) => currency === sourceCurrency) && (applyMaximum || parsedTargetAmount > 0) },
  );
  useEffect(() => {
    if (applyMaximum && preview.data?.maximumTargetAmount) setTargetAmount(preview.data.maximumTargetAmount);
  }, [applyMaximum, preview.data?.maximumTargetAmount]);
  const applyCredit = trpc.finance.applyCrossCurrencyCredit.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.sourceAmount} ${result.sourceCurrency} credit applied as ${result.targetAmount} ${result.targetCurrency}.`);
      onSuccess();
    },
    onError: (error) => toast.error(parseTrpcError(error) || "Unable to convert Patient Credit."),
  });
  const handleSubmit = () => {
    if (!applyMaximum && (!parsedTargetAmount || parsedTargetAmount <= 0)) return toast.error("Enter a valid target invoice amount.");
    if (!preview.data?.allowed) return toast.error("The conversion cannot be applied to this invoice. Refresh the preview and try a smaller amount.");
    applyCredit.mutate({
      patientId,
      invoiceId: invoice.id,
      sourceCurrency: sourceCurrency as any,
      ...(applyMaximum ? { applyMaximum: true } : { targetAmount: parsedTargetAmount }),
    });
  };
  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Wallet className="h-4 w-4 text-indigo-600" />Convert &amp; Apply Credit — {invoice?.invoiceNumber}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900"><p className="font-medium">Manual conversion only</p><p className="mt-1 text-xs">This uses the approved Finance FX snapshot at application time. It does not create a payment and is never applied automatically.</p></div>
          <div className="grid grid-cols-2 gap-3 rounded-lg border p-3"><div><p className="text-xs text-muted-foreground">Invoice remaining</p><p className="font-bold">{targetCurrency} {(Number(invoice?.totalAmount ?? 0) - Number(invoice?.paidAmount ?? 0)).toFixed(2)}</p></div><div><p className="text-xs text-muted-foreground">Target currency</p><p className="font-bold">{targetCurrency}</p></div></div>
          <div className="space-y-3"><div className="space-y-1"><Label className="text-xs">Available credit currency</Label><Select value={sourceCurrency} onValueChange={value => { setSourceCurrency(value); setTargetAmount(""); setApplyMaximum(true); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{sourceOptions.map(([currency, amount]) => <SelectItem key={currency} value={currency}>{currency} {amount.toFixed(2)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label className="text-xs">Amount to Apply to Invoice ({targetCurrency})</Label><div className="flex gap-2"><Input type="text" inputMode="decimal" value={targetAmount} onChange={event => { const normalized = normalizeServicePriceDecimalInput(event.target.value); if (normalized !== null) { setTargetAmount(normalized); setApplyMaximum(false); } }} /><Button type="button" variant="outline" onClick={() => { setApplyMaximum(true); setTargetAmount(""); }}>Apply Maximum</Button></div><p className="text-[10px] text-muted-foreground">The server derives the credit to consume and never defaults to an over-settlement.</p></div></div>
          {preview.isFetching ? <p className="text-xs text-muted-foreground">Calculating approved FX preview…</p> : preview.data && <div className="rounded-lg border border-dashed p-3 text-sm space-y-1"><p><span className="text-muted-foreground">Credit to consume:</span> <strong>{preview.data.sourceCurrency} {preview.data.sourceAmount}</strong> <span className="text-muted-foreground">of {preview.data.sourceAvailable}</span></p><p><span className="text-muted-foreground">Credit settlement:</span> <strong>{preview.data.targetCurrency} {preview.data.creditSettlementAmount ?? preview.data.targetAmount}</strong></p>{Number(preview.data.fxRoundingAdjustmentAmount ?? 0) > 0 && <p><span className="text-muted-foreground">FX Rounding Adjustment:</span> <strong>{preview.data.targetCurrency} {preview.data.fxRoundingAdjustmentAmount}</strong></p>}<p><span className="text-muted-foreground">Final settlement:</span> <strong>{preview.data.targetCurrency} {preview.data.finalTargetAmount}</strong></p><p className="text-xs text-muted-foreground">Rate: 1 {preview.data.sourceCurrency} = {preview.data.conversionRate} {preview.data.targetCurrency} · FX locked at application.</p><p className="text-xs text-muted-foreground">Invoice remaining after: {preview.data.targetCurrency} {preview.data.invoiceRemainingAfter}</p>{Number(preview.data.fxRoundingAdjustmentAmount ?? 0) > 0 && <p className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-800">An explicit non-cash FX Rounding Adjustment closes the precision-only residual. No payment or additional credit is created.</p>}</div>}
          <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={handleSubmit} disabled={applyCredit.isPending || !preview.data?.allowed}>{applyCredit.isPending ? "Applying…" : "Convert & Apply Credit"}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reverse Applied Credit Dialog ─────────────────────────────────────────────
function ReverseAppliedCreditDialog({ open, patientId, invoice, applications, onClose, onSuccess }: {
  open: boolean;
  patientId: number;
  invoice: any;
  applications: any[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const initialApplicationId = String(applications?.[0]?.id ?? "");
  const idempotencyKeyRef = useRef(globalThis.crypto?.randomUUID?.() ?? `reverse-${Date.now()}-${Math.random()}`);
  const { form, setForm, clearDraft, initFromServer } = useDraftForm({
    key: `draft_reverse_applied_credit_${invoice?.id ?? "new"}`,
    initialData: { applicationId: initialApplicationId, reason: "", idempotencyKey: idempotencyKeyRef.current },
    disabled: !open,
  });
  useEffect(() => {
    if (open && initialApplicationId) initFromServer({ applicationId: initialApplicationId, reason: "", idempotencyKey: idempotencyKeyRef.current });
  }, [open, initialApplicationId, initFromServer]);
  const selectedApplication = (applications ?? []).find((application: any) => String(application.id) === String(form.applicationId)) ?? applications?.[0];
  const isDirty = Boolean(form.reason.trim()) || String(form.applicationId) !== initialApplicationId;
  const reverseCredit = trpc.finance.reverseAppliedCredit.useMutation({
    onSuccess: (result: any) => {
      clearDraft();
      toast.success(`Patient Credit restored and ${result.invoiceCurrency} ${result.reopenedInvoiceAmount} reopened on the invoice.`);
      onSuccess();
    },
    onError: (error) => toast.error(parseTrpcError(error) || "Unable to reverse the selected Patient Credit application."),
  });
  useBeforeUnload(open && isDirty && !reverseCredit.isPending);
  const close = () => { if (!reverseCredit.isPending) { clearDraft(); onClose(); } };
  const submit = () => {
    if (!selectedApplication) return toast.error("No reversible Patient Credit application is available.");
    reverseCredit.mutate({
      patientId,
      invoiceId: invoice.id,
      applicationId: Number(selectedApplication.id),
      idempotencyKey: form.idempotencyKey,
      reason: form.reason.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RefreshCw className="h-4 w-4 text-amber-600" />Reverse Applied Credit</DialogTitle>
          <DialogDescription>Undo one complete Patient Credit application. No cash refund and no new FX conversion will be created.</DialogDescription>
        </DialogHeader>
        {selectedApplication && <div className="space-y-4">
          {applications.length > 1 && (
            <div className="space-y-1">
              <Label className="text-xs">Applied credit to reverse</Label>
              <Select value={String(form.applicationId)} onValueChange={(value) => setForm((current) => ({ ...current, applicationId: value }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {applications.map((application: any) => <SelectItem key={application.id} value={String(application.id)}>{application.sourceCurrency} {Number(application.sourceCreditAmount).toFixed(2)} → {application.targetInvoiceCurrency} {Number(application.finalSettlementAmount).toFixed(2)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-1 text-amber-950">
            <p><span className="text-amber-700">Applied Credit:</span> <strong>{selectedApplication.sourceCurrency} {Number(selectedApplication.sourceCreditAmount).toFixed(2)}</strong></p>
            <p><span className="text-amber-700">Applied to Invoice:</span> <strong>{selectedApplication.targetInvoiceCurrency} {Number(selectedApplication.finalSettlementAmount).toFixed(2)}</strong></p>
            <p className="pt-1 text-xs text-amber-800">This restores the original Patient Credit and reopens this invoice by the shown amount. Any linked FX rounding adjustment is reversed as non-cash history only.</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reason <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} maxLength={500} placeholder="Reason for reversal" className="min-h-20 text-sm" disabled={reverseCredit.isPending} />
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={close} disabled={reverseCredit.isPending}>Cancel</Button><Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={submit} disabled={reverseCredit.isPending}>{reverseCredit.isPending ? "Reversing…" : "Reverse Credit"}</Button></div>
        </div>}
      </DialogContent>
    </Dialog>
  );
}

// ─── Patient Credit Payout Dialog ──────────────────────────────────────────────
function PatientCreditPayoutDialog({ open, patientId, sourceCurrency, financialScope, availableCredit, onClose, onSuccess }: {
  open: boolean;
  patientId: number;
  sourceCurrency: string;
  financialScope: "production" | "test";
  availableCredit: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const idempotencyKeyRef = useRef(globalThis.crypto?.randomUUID?.() ?? `payout-${Date.now()}-${Math.random()}`);
  const initialForm = { sourceAmount: availableCredit.toFixed(2), payoutCurrency: "TRY", method: "cash" as "cash" | "bank_transfer", reference: "", notes: "", idempotencyKey: idempotencyKeyRef.current };
  const { form, setForm, clearDraft, initFromServer } = useDraftForm({
    key: `draft_patient_credit_payout_${patientId}_${financialScope}_${sourceCurrency}`,
    initialData: initialForm,
    disabled: !open,
  });
  useEffect(() => {
    if (open) initFromServer({ ...initialForm });
  }, [open, sourceCurrency, financialScope, availableCredit, initFromServer]);
  const sourceAmount = Number(form.sourceAmount || 0);
  const previewInput = useMemo(() => ({
    patientId,
    financialScope,
    sourceCurrency: sourceCurrency as any,
    sourceAmount: Math.max(sourceAmount, 0.01),
    payoutCurrency: form.payoutCurrency as any,
    method: form.method,
  }), [patientId, financialScope, sourceCurrency, sourceAmount, form.payoutCurrency, form.method]);
  const preview = trpc.finance.previewPatientCreditPayout.useQuery(previewInput, {
    enabled: open && sourceAmount > 0 && sourceAmount <= availableCredit + 0.005,
    retry: false,
  });
  const isDirty = form.sourceAmount !== initialForm.sourceAmount || form.payoutCurrency !== "TRY" || form.method !== "cash" || Boolean(form.reference.trim()) || Boolean(form.notes.trim());
  const createPayout = trpc.finance.createPatientCreditPayout.useMutation({
    onSuccess: (result: any) => {
      clearDraft();
      toast.success(`Patient Credit Payout recorded: ${result.payoutCurrency} ${result.payoutAmount}.`);
      onSuccess();
    },
    onError: (error) => toast.error(parseTrpcError(error) || "Unable to record Patient Credit payout."),
  });
  useBeforeUnload(open && isDirty && !createPayout.isPending);
  const close = () => { if (!createPayout.isPending) { clearDraft(); onClose(); } };
  const submit = () => {
    if (!sourceAmount || sourceAmount <= 0) return toast.error("Enter a valid Patient Credit amount.");
    if (sourceAmount > availableCredit + 0.005) return toast.error(`Payout cannot exceed available ${sourceCurrency} Patient Credit.`);
    if (preview.isFetching || !preview.data) return toast.error("Waiting for the server payout preview. Please try again.");
    createPayout.mutate({
      patientId,
      financialScope,
      sourceCurrency: sourceCurrency as any,
      sourceAmount,
      payoutCurrency: form.payoutCurrency as any,
      method: form.method,
      idempotencyKey: form.idempotencyKey,
      reference: form.reference.trim() || undefined,
      notes: form.notes.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ArrowDownLeft className="h-4 w-4 text-rose-600" />Patient Credit Payout</DialogTitle>
          <DialogDescription>Record an actual Cash or Bank payout from available native Patient Credit. This is not an invoice refund.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950"><p className="text-xs text-violet-600">Available Patient Credit</p><p className="text-lg font-bold">{sourceCurrency} {availableCredit.toFixed(2)}</p>{financialScope === "test" && <p className="mt-1 text-xs text-violet-700">Test scope payout — excluded from production Finance reporting.</p>}</div>
          <div className="space-y-1"><Label className="text-xs">Payout Amount ({sourceCurrency})</Label><Input type="text" inputMode="decimal" value={form.sourceAmount} onChange={(event) => { const normalized = normalizeServicePriceDecimalInput(event.target.value); if (normalized !== null) setForm((current) => ({ ...current, sourceAmount: normalized })); }} disabled={createPayout.isPending} /><p className="text-[10px] text-muted-foreground">Native credit remains in {sourceCurrency} until this payout is confirmed.</p></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Method</Label><Select value={form.method} onValueChange={(value) => setForm((current) => ({ ...current, method: value as "cash" | "bank_transfer" }))}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="bank_transfer">Bank Transfer</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label className="text-xs">Payout Currency</Label><Select value={form.payoutCurrency} onValueChange={(value) => setForm((current) => ({ ...current, payoutCurrency: value }))}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["TRY", "USD", "EUR", "GBP", "SAR", "AED", "AUD"].map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {preview.isFetching ? <p className="text-xs text-muted-foreground">Calculating approved payout FX…</p> : preview.data && <div className="rounded-lg border border-dashed p-3 text-sm space-y-1"><p><span className="text-muted-foreground">Patient receives:</span> <strong>{preview.data.payoutCurrency} {Number(preview.data.payoutAmount).toFixed(2)}</strong></p>{preview.data.conversionRateToPayout ? <p className="text-xs text-muted-foreground">FX Rate: 1 {sourceCurrency} = {preview.data.conversionRateToPayout} {preview.data.payoutCurrency} · locked when recorded.</p> : <p className="text-xs text-muted-foreground">Same-currency payout; no FX conversion is used.</p>}</div>}
          <div className="space-y-1"><Label className="text-xs">Reference <span className="text-muted-foreground">(optional)</span></Label><Input value={form.reference} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} maxLength={256} placeholder="Bank or cash reference" disabled={createPayout.isPending} /></div>
          <div className="space-y-1"><Label className="text-xs">Note <span className="text-muted-foreground">(optional)</span></Label><Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} maxLength={1000} placeholder="Payout note" className="min-h-20 text-sm" disabled={createPayout.isPending} /></div>
          <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={close} disabled={createPayout.isPending}>Cancel</Button><Button size="sm" variant="destructive" onClick={submit} disabled={createPayout.isPending || preview.isFetching || !preview.data}>{createPayout.isPending ? "Recording…" : "Confirm Payout"}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Credit Refund Dialog ─────────────────────────────────────────────────────
function CreditRefundDialog({ open, patientId, tryBalance, onClose, onSuccess }: {
  open: boolean;
  patientId: number;
  tryBalance: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { data: settings } = trpc.settings.get.useQuery();
  const [currency, setCurrency] = useState("TRY");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "bank_transfer" | "card_reversal" | "other">("cash");
  const [notes, setNotes] = useState("");

  // Rate convention: 1 FOREIGN = X TRY (e.g. exchange_rate_EUR = 52.70)
  // To convert TRY credit to foreign: tryBalance / rate
  const getExchangeRate = (cur: string) => {
    if (cur === "TRY") return 1;
    return parseFloat((settings as any)?.[`exchange_rate_${cur}`] ?? "0") || 1;
  };
  const availableInCurrency = currency === "TRY" ? tryBalance : tryBalance / getExchangeRate(currency);

  useEffect(() => {
    if (open) {
      setAmount(availableInCurrency.toFixed(2));
      setNotes("");
    }
  }, [open, currency, tryBalance]);

  const refundCredit = trpc.finance.refundCredit.useMutation({
    onSuccess: () => { toast.success("Credit refunded successfully"); onSuccess(); },
    onError: (e) => toast.error(e.message || "Failed to process refund"),
  });

  const handleSubmit = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (amt > availableInCurrency + 0.01) return toast.error(`Cannot refund more than available credit (${currency} ${availableInCurrency.toFixed(2)})`);
    refundCredit.mutate({ patientId, amount: amt, currency: currency as any, method, notes: notes || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownLeft className="h-4 w-4 text-rose-500" />
            Refund Credit Balance
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Balance info */}
          <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
            <p className="text-xs text-violet-600 font-medium">Total Credit Balance</p>
            <p className="text-lg font-bold text-violet-700">TRY {tryBalance.toFixed(2)}</p>
            {currency !== "TRY" && (
              <p className="text-xs text-violet-500 mt-0.5">≈ {currency} {availableInCurrency.toFixed(2)} at current rate</p>
            )}
          </div>

          {/* Refund currency */}
          <div className="space-y-1">
            <Label className="text-xs">Refund Currency</Label>
            <Select value={currency} onValueChange={v => { setCurrency(v); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["TRY", "USD", "EUR", "GBP", "SAR", "AED"].map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-1">
            <Label className="text-xs">Refund Amount ({currency})</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={e => { const normalized = normalizeServicePriceDecimalInput(e.target.value); if (normalized !== null) setAmount(normalized); }}
              className="h-8 text-sm"
              max={availableInCurrency}
            />
            <p className="text-[10px] text-muted-foreground">Auto-filled with full balance. Edit for partial refund.</p>
          </div>

          {/* Method */}
          <div className="space-y-1">
            <Label className="text-xs">Refund Method</Label>
            <Select value={method} onValueChange={v => setMethod(v as any)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="card_reversal">Card Reversal</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-8 text-sm" placeholder="Reason for refund..." />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={refundCredit.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {refundCredit.isPending ? "Processing..." : "Confirm Refund"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Patient Documents Tab ────────────────────────────────────────────────────
function PatientDocumentsTab({ patientId, linkedLeadId }: { patientId: number; linkedLeadId?: number | null }) {
  const utils = trpc.useUtils();
  const { data: docs, isLoading } = trpc.patients.documents.useQuery({ patientId });
  // Intake conflict state — used to disable "Upload to Section" during conflict
  const { data: patientIntakeData } = trpc.patients.getIntake.useQuery({ patientId });
  const hasIntakeConflict = !!(patientIntakeData as any)?.conflict;
  // ── Direct Upload to Documents Library state ──────────────────────────────────────────────────
  const [showDirectUploadDialog, setShowDirectUploadDialog] = useState(false);
  const [directUploadFiles, setDirectUploadFiles] = useState<File[]>([]);
  const [directUploadTag, setDirectUploadTag] = useState("");
  const [directUploadPassword, setDirectUploadPassword] = useState("");
  const [directUploadLoading, setDirectUploadLoading] = useState(false);
  const [directUploadDestKey, setDirectUploadDestKey] = useState<string | null>(null);
  const { data: directUploadDestinations = [] } = trpc.patients.getDirectUploadDestinations.useQuery(
    { patientId },
    { enabled: showDirectUploadDialog, staleTime: 30_000 }
  );
  const selectedDirectDest = directUploadDestinations.find((d: any) => d.key === directUploadDestKey) ?? directUploadDestinations[0];
  const directUploadMutation = trpc.patients.directUpload.useMutation({
    onSuccess: (data) => {
      utils.patients.documents.invalidate({ patientId });
      if (data?.linkedLeadId) utils.leads.documents.invalidate({ leadId: data.linkedLeadId });
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
          patientId: dest.patientId,
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
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadSection, setUploadSection] = useState("artHistory");
  const [uploadGender, setUploadGender] = useState<"female" | "male">("female");
  const [uploadTag, setUploadTag] = useState("");
  const [uploadPassword, setUploadPassword] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const addDocMutation = trpc.patients.addDocumentToSection.useMutation({
    onSuccess: (data) => {
      utils.patients.documents.invalidate({ patientId });
      // Cross-invalidate the Lead Documents tab so it also shows the new document
      const resolvedLeadId = data?.linkedLeadId ?? linkedLeadId;
      if (resolvedLeadId) utils.leads.documents.invalidate({ leadId: resolvedLeadId });
      toast.success("Document uploaded and linked to Medical Intake.");
      setUploadDialogOpen(false);
      setUploadFiles([]);
      setUploadTag("");
      setUploadPassword("");
    },
    onError: (e) => toast.error(e.message || "Upload failed"),
  });

  const deleteDocMutation = trpc.patients.deleteDocument.useMutation({
    onSuccess: () => {
      utils.patients.documents.invalidate({ patientId });
      // Cross-invalidate the Lead Documents tab so deletions are reflected there too
      if (linkedLeadId) utils.leads.documents.invalidate({ leadId: linkedLeadId });
      toast.success("Document deleted.");
      setDeleteConfirmId(null);
    },
    onError: (e) => toast.error(e.message || "Delete failed"),
  });

  const sectionOptions = uploadGender === "female"
    ? [
        { value: "artHistory", label: "Previous Fertility Treatments (IVF / IUI / etc.)" },
        { value: "surgicalHistory", label: "Previous Surgeries" },
        { value: "previousTests", label: "Previous Tests & Lab Results" },
        { value: "radiology", label: "Radiology" },
        { value: "geneticTests", label: "Genetic Tests" },
        { value: "generalAttachmentsFemale", label: "General Attachments (Female)" },
      ]
    : [
        { value: "semenAnalysis", label: "Semen Analysis" },
        { value: "dnaFragmentation", label: "DNA Fragmentation" },
        { value: "previousTests", label: "Previous Tests & Lab Results" },
        { value: "previousSurgeries", label: "Previous Surgeries" },
        { value: "geneticTests", label: "Genetic Tests" },
        { value: "radiology", label: "Radiology" },
        { value: "generalAttachmentsMale", label: "General Attachments (Male)" },
      ];

  const handleUpload = async () => {
    if (!uploadFiles.length) return toast.error("Please select at least one file");
    setIsUploading(true);
    try {
      for (const file of uploadFiles) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await addDocMutation.mutateAsync({
          patientId,
          gender: uploadGender,
          section: uploadSection,
          fileBase64: base64,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          tag: uploadTag || undefined,
          docPassword: uploadPassword || undefined,
        });
      }
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = (mimeType?: string | null) => {
    if (!mimeType) return <FileText className="h-4 w-4 text-muted-foreground" />;
    if (mimeType.startsWith("image/")) return <FileText className="h-4 w-4 text-blue-500" />;
    if (mimeType === "application/pdf") return <FileText className="h-4 w-4 text-red-500" />;
    return <FileText className="h-4 w-4 text-muted-foreground" />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3 p-1">
      {/* Direct Upload Dialog */}
      {showDirectUploadDialog && (
        <Dialog open onOpenChange={open => { if (!open && !directUploadLoading) { setShowDirectUploadDialog(false); setDirectUploadFiles([]); setDirectUploadTag(""); setDirectUploadPassword(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Paperclip className="h-4 w-4" /> Upload to Documents Library</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">Upload files directly to the Documents Library. These files are <strong>not</strong> attached to any Health Record section and are preserved during intake resets.</p>
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
              <div className="space-y-1.5">
                <Label>Tag / Label</Label>
                <Input placeholder="e.g. BloodTest-01" value={directUploadTag} onChange={e => setDirectUploadTag(e.target.value)} />
              </div>
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
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {docs?.length ?? 0} document{(docs?.length ?? 0) !== 1 ? "s" : ""}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowDirectUploadDialog(true)}>
            <Paperclip className="h-3.5 w-3.5 mr-1.5" /> Upload to Library
          </Button>
          <Button size="sm" variant="outline" onClick={() => setUploadDialogOpen(true)} disabled={hasIntakeConflict} title={hasIntakeConflict ? "Resolve intake conflict before uploading to a section" : undefined}>
            <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload to Section
          </Button>
        </div>
      </div>

      {(!docs || docs.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Paperclip className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No documents yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Upload documents to link them to the Medical Intake.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc: any) => (
            <Card key={doc.id} className="overflow-hidden">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-3">
                  {getFileIcon(doc.mimeType)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.tag && <span className="mr-1 font-medium text-primary">[{doc.tag}]</span>}
                      {doc.intakeSection && <span className="mr-1 text-muted-foreground/70">{doc.intakeSection} ·</span>}
                      {doc.createdAt ? format(new Date(doc.createdAt), "MMM d, yyyy") : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <FileViewButton
                      fileUrl={doc.fileUrl}
                      fileName={doc.fileName}
                      mimeType={doc.mimeType}
                      label={doc.tag || doc.fileName}
                    />
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirmId(doc.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {doc.fileUrl && (
                  <SavedTranslationsPanel
                    leadDocumentId={doc.id}
                    fileUrl={normaliseFileUrl(doc.fileUrl ?? "")}
                    fileName={doc.fileName ?? "document"}
                    mimeType={doc.mimeType}
                    patientId={patientId}
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={(o) => { if (!o) { setUploadDialogOpen(false); setUploadFiles([]); setUploadTag(""); setUploadPassword(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Upload className="h-4 w-4" /> Upload Document</DialogTitle>
            <DialogDescription>Upload a document and link it to the patient's Medical Intake.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Gender selector */}
            <div className="space-y-1.5">
              <Label className="text-xs">For</Label>
              <div className="flex gap-2">
                <Button size="sm" variant={uploadGender === "female" ? "default" : "outline"} onClick={() => { setUploadGender("female"); setUploadSection("artHistory"); }}>Female (Wife)</Button>
                <Button size="sm" variant={uploadGender === "male" ? "default" : "outline"} onClick={() => { setUploadGender("male"); setUploadSection("semenAnalysis"); }}>Male (Husband)</Button>
              </div>
            </div>
            {/* Section selector */}
            <div className="space-y-1.5">
              <Label className="text-xs">Intake Section</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={uploadSection}
                onChange={e => setUploadSection(e.target.value)}
              >
                {sectionOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {/* File picker */}
            <div className="space-y-1.5">
              <Label className="text-xs">Files <span className="text-destructive">*</span></Label>
              <input
                type="file" multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                className="w-full text-sm"
                onChange={e => setUploadFiles(Array.from(e.target.files ?? []))}
              />
              {uploadFiles.length > 0 && <p className="text-xs text-muted-foreground">{uploadFiles.length} file(s) selected</p>}
            </div>
            {/* Tag */}
            <div className="space-y-1.5">
              <Label className="text-xs">Tag / Label</Label>
              <Input className="h-8 text-sm" value={uploadTag} onChange={e => setUploadTag(e.target.value)} placeholder="e.g. Semen Analysis, Blood Test" />
            </div>
            {/* Password */}
            <div className="space-y-1.5">
              <Label className="text-xs">Document password (if protected)</Label>
              <Input className="h-8 text-sm" type="password" value={uploadPassword} onChange={e => setUploadPassword(e.target.value)} placeholder="Leave empty if not protected" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setUploadDialogOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={isUploading || !uploadFiles.length} onClick={handleUpload}>
              {isUploading ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Uploading...</> : <><Upload className="h-3.5 w-3.5 mr-1.5" /> Upload</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(o) => { if (!o) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the file and remove it from the Medical Intake. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirmId !== null && deleteDocMutation.mutate({ id: deleteConfirmId })}
            >
              {deleteDocMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Treatment Plan Tab ───────────────────────────────────────────────────────
function PatientTreatmentPlanTabWithSubTabs({ patientId, patient }: { patientId: number; patient: any }) {
  const [subTab, setSubTab] = useState<"medical-plan" | "collaboration" | "proposals">("medical-plan");
  const subTabs = [
    { id: "medical-plan" as const, label: "Medical Plan" },
    { id: "collaboration" as const, label: "Collaboration" },
    { id: "proposals" as const, label: "Proposals" },
  ];
  return (
    <div className="space-y-4">
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
      {subTab === "medical-plan" && <TreatmentPlanTab type="patient" id={patientId} />}
      {subTab === "collaboration" && (
        <Card>
          <CaseCommentsThread patientId={patientId} />
        </Card>
      )}
      {subTab === "proposals" && <TreatmentProposalsTab patientId={patientId} isReadOnly={false} patient={patient} />}
    </div>
  );
}

function PatientTasksTab({ patientId }: { patientId: number }) {
  const [showAdd, setShowAdd] = useState(false);
  const utils = trpc.useUtils();
  const { data: result, isLoading } = trpc.tasks.list.useQuery({ patientId, pageSize: 100 });
  const tasks = result?.data ?? [];
  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => utils.tasks.list.invalidate(),
    onError: (e) => { toast.error((e as any)?.message || "Failed to update task"); },
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Tasks</h3>
        <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Task
        </Button>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading tasks...
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No tasks yet</p>
          <p className="text-xs mt-1">Add follow-up tasks for this patient</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task: any) => (
            <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <button
                onClick={() => updateTask.mutate({ id: task.id, status: task.status === "done" ? "open" : "done" })}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  task.status === "done" ? "bg-primary border-primary" : "border-muted-foreground/40 hover:border-primary"
                }`}
              >
                {task.status === "done" && <CheckCircle2 className="h-3 w-3 text-white" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                  {task.title}
                </p>
                {task.dueDate && (
                  <p className="text-xs text-muted-foreground">Due {task.dueDate}</p>
                )}
              </div>
              <Select value={task.status} onValueChange={(v) => updateTask.mutate({ id: task.id, status: v as any })}>
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
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                task.priority === "high" ? "bg-red-100 text-red-700" :
                task.priority === "medium" ? "bg-yellow-100 text-yellow-700" :
                "bg-gray-100 text-gray-600"
              }`}>
                {task.priority}
              </span>
            </div>
          ))}
        </div>
      )}
      <PatientAddTaskModal open={showAdd} onClose={() => setShowAdd(false)} patientId={patientId} onSuccess={() => { utils.tasks.list.invalidate(); setShowAdd(false); }} />
    </div>
  );
}

function PatientAddTaskModal({ open, onClose, patientId, onSuccess }: { open: boolean; onClose: () => void; patientId: number; onSuccess: () => void }) {
  const [form, setForm] = useState({ title: "", dueDate: "", priority: "medium" });
  useEffect(() => { if (!open) setForm({ title: "", dueDate: "", priority: "medium" }); }, [open]);
  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => { toast.success("Task created"); onSuccess(); },
    onError: (e) => { toast.error((e as any)?.message || "Failed to create task"); },
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Task title..." />
          </div>
          <div className="space-y-1.5">
            <Label>Due Date</Label>
            <Input type="date" value={form.dueDate} min={new Date().toISOString().slice(0, 10)} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => createTask.mutate({ patientId, title: form.title, priority: form.priority as any, dueDate: form.dueDate || undefined })}
              disabled={!form.title.trim() || createTask.isPending}
            >
              {createTask.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TreatmentPlanTab({ type, id }: { type: "lead" | "patient"; id: number }) {
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const queryResult = type === "lead"
    ? trpc.treatmentPlans.listByLead.useQuery({ leadId: id }, { staleTime: 0, refetchOnMount: "always" })
    : trpc.treatmentPlans.listByPatient.useQuery({ patientId: id }, { staleTime: 0, refetchOnMount: "always" });
  const { data: plans, isLoading, refetch } = queryResult;

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
      <div>
        <h3 className="text-base font-semibold">Treatment Plans</h3>
        <p className="text-xs text-muted-foreground mt-0.5">All treatment plans for this patient</p>
      </div>
      {(!plans || (plans as any[]).length === 0) ? (
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
