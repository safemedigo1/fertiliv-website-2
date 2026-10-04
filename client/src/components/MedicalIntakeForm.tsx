/**
 * MedicalIntakeForm — comprehensive fertility clinic intake form
 * Used by both LeadDetailPage and PatientDetailPage.
 *
 * Props:
 *   mode: "lead" | "patient"
 *   id: leadId or patientId
 *   readOnly?: boolean (doctors see read-only view)
 */
import React from "react";
import { normaliseFileUrl, openDicomViewer } from "@/lib/fileUrl";
import {
  hydrateContraceptiveForm,
  serializeContraceptiveHistory,
  deriveContraceptiveGate,
  deriveContraceptiveIntent,
  contraceptiveMethodLabel,
  type ContraceptiveEntry,
} from "@/lib/contraceptiveAdapter";
import {
  hasMeaningfulFemaleGeneticTest,
  filterMeaningfulEntries,
  deriveGateFromDB,
  deriveFemaleGeneticTestsIntent,
  serializeFemaleGeneticTests,
  validateFemaleGeneticTests,
  createBlankGeneticTestEntry,
  getAddButtonLabel,
} from "@/lib/femaleGeneticTestsAdapter";
import { validateCycleCollections } from "@/lib/artCycleHelpers";
import {
  buildFemaleDiagnosisGroups,
  toggleDiagnosisValue,
  isHiddenOption,
  FEMALE_DIAGNOSIS_STATIC_FALLBACK,
  type RawDropdownOption,
} from "@/lib/femaleDiagnosisAdapter";
import { DicomBadgeButton, FileViewButton } from "@/components/FileViewButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { PreviousTreatmentsEditor, ARTCycle } from "@/components/PreviousTreatmentCard";
import SavedTranslationsPanel from "@/components/SavedTranslationsPanel";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Edit,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  SkipForward,
  Sparkles,
  Trash2,
  TrendingUp,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useContext, useEffect, useMemo, useRef, useState, createContext } from "react";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { useDraftSession, clearDraftSession } from "@/hooks/useDraftSession";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { buildLeadVisitAppointmentTitle } from "../../../shared/calendarIdentity";
import LabImportModal, { type ImportedLabRow } from "@/components/LabImportModal";
import RadiologyEditor, { type RadiologyStudy } from "@/components/RadiologyEditor";
import { MonthYearPicker, displayMonthYear } from "@/components/MonthYearPicker";
import { FlexDatePicker, displayFlexDate } from "@/components/FlexDatePicker";
import { isFutureDate, isFutureMonth, todayISO, currentMonthISO, FUTURE_DATE_ERROR } from "@/lib/dateValidation";
import { hasMeaningfulReportedPartnerData } from "@shared/intakeUtils";
import { fmtDate } from "@/lib/dateFormat";
import { getUnitsForTest, getUnitsForTestOrCommon, convertUnit, roundLabValue } from "@/lib/labUnits";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LabTestAutocomplete, type LabDictionaryEntry, RESULT_TYPE_COLORS } from "@/components/LabTestAutocomplete";
import { ResultTypeFields, type ResultFields } from "@/components/ResultTypeFields";
import TestTrendChart from "@/components/TestTrendChart";

// ─── Auto-interpretation helper ──────────────────────────────────────────────

/**
 * Given a numeric result value and a reference range string, returns
 * "Normal", "High", "Low", or "" if interpretation cannot be determined.
 * Supports formats: "3.5-12.5", "0.27–4.20", "<=34", ">=1.0", "<5", ">2", "3.5 - 12.5"
 */
function autoInterpret(value: string, referenceRange: string): string {
  if (!value || !referenceRange) return "";
  const num = parseFloat(value.replace(",", "."));
  if (isNaN(num)) return ""; // qualitative value — cannot auto-interpret numerically
  const r = referenceRange.trim();
  // Range: "3.5-12.5" or "3.5 – 12.5" or "3.5 to 12.5"
  const rangeMatch = r.match(/^([\d.,]+)\s*[-–—to]+\s*([\d.,]+)$/);
  if (rangeMatch) {
    const lo = parseFloat(rangeMatch[1].replace(",", "."));
    const hi = parseFloat(rangeMatch[2].replace(",", "."));
    if (!isNaN(lo) && !isNaN(hi)) {
      if (num < lo) return "Low";
      if (num > hi) return "High";
      return "Normal";
    }
  }
  // Upper bound only: "<=34" or "<34"
  const upperMatch = r.match(/^<=?\s*([\d.,]+)$/);
  if (upperMatch) {
    const hi = parseFloat(upperMatch[1].replace(",", "."));
    if (!isNaN(hi)) return num <= hi ? "Normal" : "High";
  }
  // Lower bound only: ">=1.0" or ">1.0"
  const lowerMatch = r.match(/^>=?\s*([\d.,]+)$/);
  if (lowerMatch) {
    const lo = parseFloat(lowerMatch[1].replace(",", "."));
    if (!isNaN(lo)) return num >= lo ? "Normal" : "Low";
  }
  return "";
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ARTEntry {
  type: string;
  date: string;
  clinic: string;
  protocol: string;
  eggsCollected?: number;
  embryosFertilized?: number;
  embryosTransferred?: number;
  embryoQuality?: string;
  result: string;
  notes: string;
    fileKey?: string;
  fileUrl?: string;
  fileName?: string;
  filePassword?: string;
  docId?: number;
  lifecycleStatus?: string;
  expiredPlaceholder?: boolean;
}
interface SurgicalEntry {
  procedureType?: string;  // predefined type or "Other"
  procedure: string;       // free-text name (required when type is "Other")
  date: string;
  notes: string;
  fileKey?: string;
  fileUrl?: string;
  fileName?: string;
  filePassword?: string;
  docId?: number;
  lifecycleStatus?: string;
  expiredPlaceholder?: boolean;
}

const PROCEDURE_TYPE_OPTIONS = [
  "Hysteroscopy",
  "Laparoscopy",
  "PRP",
  "Exosome",
  "Myomectomy",
  "Cystectomy",
  "Polypectomy",
  "Appendectomy",
  "Cesarean Section",
  "Other",
] as const;

const MALE_PROCEDURE_TYPE_OPTIONS = [
  "Varicocele surgery",
  "Undescended testicle surgery / Orchiopexy",
  "Testicular biopsy",
  "Sperm retrieval (TESE / Micro-TESE / TESA / PESA / MESA)",
  "Hernia surgery",
  "Hydrocele surgery",
  "Testicular torsion surgery",
  "Vasectomy",
  "Vasectomy reversal",
  "Urethral or urinary tract surgery",
  "Prostate surgery",
  "Chemotherapy / Radiotherapy",
  "Testosterone or anabolic steroid use",
  "Testicular injury / Trauma",
  "Mumps infection after puberty",
  "Other",
] as const;

interface MiscarriageEntry {
  date: string;
  gestationalAge: string;
  notes: string;
  fileKey?: string;
  fileUrl?: string;
  fileName?: string;
  filePassword?: string;
  docId?: number;
}

interface TestHistoryEntry {
  result: string;
  unit?: string;
  collectionDate?: string;
  reportDate?: string;
  referenceRange?: string;
  interpretation?: string;
  fileKey?: string;
  fileUrl?: string;
  fileName?: string;
  filePassword?: string;
}

interface TestEntry {
  name: string;
  date: string;
  result: string;
  unit?: string;
  referenceRange?: string;
  collectionDate?: string;
  reportDate?: string;
  interpretation?: string;
  fileKey?: string;
  fileUrl?: string;
  fileName?: string;
  filePassword?: string;
  fileTag?: string;
  docId?: number;
  /** Historical results for this test (older entries, newest first in main row) */
  history?: TestHistoryEntry[];
  // ── Result Type fields (Stage 2B) ──────────────────────────────────────────
  /** Result type from lab dictionary (e.g. 'Quantitative', 'Qualitative', 'Molecular/PCR') */
  resultType?: string;
  /** Short summary for All Results table (e.g. 'Detected', 'Non-reactive', '5.7 mIU/mL') */
  resultSummary?: string;
  /** Type-specific extra fields stored as JSON object */
  extraFields?: Record<string, string>;
  /** Suggested module from dictionary (e.g. 'genetic_tests', 'semen_analysis') */
  suggestedModule?: string;
  /** Dictionary entry id if matched to lab_dictionary */
  dictionaryId?: number;
  /** Analyte group from dictionary (e.g. 'Glucose / OGTT', 'Thyroid', 'Testosterone') */
  analyteGroup?: string;
  /** Order type from dictionary (e.g. 'Single Result Test', 'Timed Component', 'Protocol Name') */
  orderType?: string;
  /** Whether this entry needs staff review (uncertain match, missing type, etc.) */
  needsReview?: boolean;
  /** Reason for needing review */
  reviewReason?: string;
  /** Type has been staged (AI suggested and accepted) but not yet confirmed — row stays in Needs Review */
  typeStagedForConfirm?: boolean;
  /** Original test name as extracted from the source file (before dictionary matching) */
  sourceTestName?: string;
  /** Tracks whether this row was seeded from a predefined template (default) or created by the user (custom).
   * Used by isVisibleTestRow to decide read-only visibility:
   * - 'default': hidden unless it has clinical data (result, date, file, etc.)
   * - 'custom': shown if the name is non-empty, regardless of whether a result has been entered.
   * Legacy rows without this field are classified by name lookup against DEFAULT_TEST_NAMES.
   */
    origin?: "default" | "custom";
  lifecycleStatus?: string;
  expiredPlaceholder?: boolean;
}
interface SystemicDiseases {
  diabetes: boolean;
  hypertension: boolean;
  thyroid: boolean;
  heartDisease: boolean;
  kidneyDisease: boolean;
  liverDisease: boolean;
  epilepsy: boolean;
  asthma: boolean;
  anemia: boolean;
  coagulationDisorder: boolean;
  autoimmune: boolean;
  cancer: boolean;
  other: string;
}

interface MaleIntake {
  dateOfBirth?: string;
  femalePartnerDob?: string; // DOB of the female partner (stored here when lead is male)
  infertilityType?: string; // Male-specific: 'primary' | 'secondary'
  infertilityDuration?: string; // How long trying (male perspective)
  profession?: string;
  isFirstMarriage?: boolean;
  childrenFromPreviousRelationship?: number;
  heightCm?: string;
  weightKg?: string;
  bmi?: string;
  smoking?: string;
  smokingPacksPerDay?: string;
  alcohol?: string;
  consanguinity?: boolean;
  hereditaryDiseases?: string;
  systemicDiseases?: SystemicDiseases;
  currentMedications?: string;
  allergies?: string;
  previousSurgeries?: SurgicalEntry[];
  semenAnalysis?: SemenAnalysisEntry[];
  dnaFragmentation?: DnaFragmentationEntry[];
  previousTests?: TestEntry[];
  geneticTests?: GeneticTestEntry[];
  additionalNotes?: string;
}

interface GeneralAttachmentEntry {
  fileKey?: string;
  fileUrl?: string;
  fileName?: string;
  mimeType?: string;
  tag?: string;
  docPassword?: string;
  docId?: number;
  lifecycleStatus?: string;
  expiredPlaceholder?: boolean;
}

interface SemenAnalysisEntry {
  date: string;
  // Raw Sample
  volume?: string;
  concentration?: string;
  totalMotility?: string;
  progressiveMotility?: string;
  nonProgressiveMotility?: string;
  immotilePercent?: string;
  morphology?: string;
  leukocyteCount?: string;
  ph?: string;
  viscosity?: string;
  appearance?: string;
  liquefactionTime?: string;
  agglutination?: string;
  abstinenceDays?: string;
  labComment?: string;
  // Post-Preparation
  preparationMethod?: string;
  postPrepConcentration?: string;
  postPrepMotility?: string;
  postPrepImmotile?: string;
  postPrepForwardMotile?: string;
  postPrepInPlaceMotile?: string;
  notes: string;
    fileKey?: string;
  fileUrl?: string;
  fileName?: string;
  filePassword?: string;
  docId?: number;
  lifecycleStatus?: string;
  expiredPlaceholder?: boolean;
}
interface DnaFragmentationEntry {
  date: string;
  dfi?: string;
  hds?: string;
  method?: string;
  notes: string;
    fileKey?: string;
  fileUrl?: string;
  fileName?: string;
  filePassword?: string;
  docId?: number;
  lifecycleStatus?: string;
  expiredPlaceholder?: boolean;
}
interface HormonePanelEntry {
  date: string;
  fsh?: string;
  lh?: string;
  testosterone?: string;
  prolactin?: string;
  tsh?: string;
  notes: string;
  fileKey?: string;
  fileUrl?: string;
  fileName?: string;
  filePassword?: string;
  docId?: number;
}

interface GeneticTestEntry {
  test: string;
  date: string;
  result: string;
  notes: string;
  fileKey?: string;
  fileUrl?: string;
  fileName?: string;
  filePassword?: string;
  docId?: number;
  [key: string]: unknown; // preserve unknown legacy keys (required for adapter compatibility)
}

const DEFAULT_SYSTEMIC: SystemicDiseases = {
  diabetes: false, hypertension: false, thyroid: false, heartDisease: false,
  kidneyDisease: false, liverDisease: false, epilepsy: false, asthma: false,
  anemia: false, coagulationDisorder: false, autoimmune: false, cancer: false, other: "",
};

const DEFAULT_MALE_INTAKE: MaleIntake = {
  profession: "", heightCm: "", weightKg: "", bmi: "",
  smoking: "never", alcohol: "never",
  consanguinity: false, hereditaryDiseases: "",
  systemicDiseases: { ...DEFAULT_SYSTEMIC },
  currentMedications: "", allergies: "",
  previousSurgeries: [], semenAnalysis: [], dnaFragmentation: [], previousTests: [], geneticTests: [],
  additionalNotes: "",
};

// ─── Lead Source Labels ─────────────────────────────────────────────────────
const LEAD_SOURCES: Record<string, string> = {
  "paid": "Paid",
  "employee-referral": "Employee Referral",
  "external-referral": "External Referral",
  "website": "Website",
  "maps": "Maps",
  "partner": "Partner",
  "public-relations": "Public Relations",
  "instagram": "Instagram",
  "tiktok": "TikTok",
  "doctor-referral": "Doctor Referral",
  "youtube": "YouTube",
  "facebook": "Facebook",
  "awatef-guide": "Awatef (Guide)",
  "salim-guide": "Salim (Guide)",
  "organic": "Organic",
};

// ─── SubSection divider (inside a SectionCard) ───────────────────────────────
function SubSectionDivider({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-5 mb-3">
      <span className="text-[12px] font-[700] tracking-[0.5px]" style={{ color: '#1E0566', opacity: 0.9 }}>{icon && <span className="mr-1.5 opacity-70">{icon}</span>}{label}</span>
      <div className="h-px flex-1" style={{ background: '#1E0566', opacity: 0.15 }} />
    </div>
  );
}

// ─── Yes/No Gate Component ──────────────────────────────────────────────────
/**
 * A Yes/No toggle that gates a complex section.
 * - null: not answered (shows both buttons, neither selected)
 * - true: Yes selected (shows children)
 * - false: No selected (hides children)
 */
function YesNoGate({
  question,
  value,
  onChange,
  children,
  onYes,
  hasData,
  dataCount,
  confirmDescription,
  confirmActionLabel,
}: {
  question: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
  onYes?: () => void;
  /** Pass true when the section already has entries — enables confirmation on No */
  hasData?: boolean;
  /** Optional count of entries for the confirmation message */
  dataCount?: number;
  /** Custom confirmation description (overrides default wording) */
  confirmDescription?: string;
  /** Custom confirm action button label (default: "Yes, delete all") */
  confirmActionLabel?: string;
}) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleNoClick = () => {
    if (hasData) {
      setShowConfirm(true);
    } else {
      onChange(false);
    }
  };

  const handleConfirmDelete = () => {
    setShowConfirm(false);
    onChange(false);
  };

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground flex-1">{question}</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => { onChange(true); onYes?.(); }}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                value === true
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-transparent text-muted-foreground border-border hover:border-emerald-400 hover:text-emerald-600'
              }`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={handleNoClick}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                value === false
                  ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                  : 'bg-transparent text-muted-foreground border-border hover:border-rose-400 hover:text-rose-600'
              }`}
            >
              No
            </button>
          </div>
        </div>
        {value === true && (
          <div className="mt-2">{children}</div>
        )}
      </div>

      {/* Confirmation dialog when No is clicked with existing data */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove all entries?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDescription
                ? confirmDescription
                : (dataCount && dataCount > 0
                  ? `This section has ${dataCount} ${dataCount === 1 ? 'entry' : 'entries'}. Switching to No will permanently delete all of them.`
                  : 'This section has existing entries. Switching to No will permanently delete all of them.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {confirmActionLabel ?? "Yes, delete all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Fertility Diagnosis Option Lists ────────────────────────────────────────
// NOTE: These labels must NOT be renamed — they are mapped to Zoho CRM values.
// "Male factor infertility" is kept in the system for Zoho import compatibility
// but hidden from the female display UI.

const FEMALE_FERTILITY_DIAGNOSES: { label: string; indent: boolean }[] = [
  { label: "Ovarian reserve", indent: false },
  { label: "PCOS (Polycystic Ovary Syndrome)", indent: true },
  { label: "Premature Ovarian Insufficiency (POI)", indent: true },
  { label: "Ovulation disorders", indent: false },
  { label: "Tubal factor", indent: false },
  { label: "Hydrosalpinx", indent: true },
  { label: "Endometriosis", indent: false },
  { label: "Uterine factors", indent: false },
  { label: "Uterine fibroids (myomas)", indent: true },
  { label: "Uterine polyps", indent: true },
  { label: "Uterine septum / Asherman's syndrome", indent: true },
  { label: "Genetics / PGT needed", indent: false },
  { label: "Recurrent miscarriages", indent: false },
  { label: "Recurrent Implantation Failure (RIF)", indent: true },
  { label: "Unexplained infertility", indent: false },
  { label: "No clear diagnosis / needs re-evaluation", indent: false },
  { label: "Systemic factors", indent: false },
  { label: "Other", indent: false },
];

// ─── Grouped diagnosis structure for boxed rendering ─────────────────────────
// DiagnosisGroup type is imported from femaleDiagnosisAdapter as AdapterDiagnosisGroup
// Local alias for backward compat with DiagnosisGroupBox and MALE_DIAGNOSIS_GROUPS
type DiagnosisGroup = { main: string; subs: string[]; isHidden?: boolean };
// FEMALE_DIAGNOSIS_GROUPS is now driven by the shared adapter (dynamic + static fallback).
// The static fallback is re-exported from femaleDiagnosisAdapter as FEMALE_DIAGNOSIS_STATIC_FALLBACK.
// This constant is kept as an alias for any remaining static references.
const FEMALE_DIAGNOSIS_GROUPS: DiagnosisGroup[] = FEMALE_DIAGNOSIS_STATIC_FALLBACK;

const MALE_DIAGNOSIS_GROUPS: DiagnosisGroup[] = [
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

const MALE_FERTILITY_DIAGNOSES: { label: string; indent: boolean }[] = [
  { label: "Male factor infertility", indent: false },
  { label: "Azoospermia", indent: true },
  { label: "Oligospermia (low sperm count)", indent: true },
  { label: "Asthenospermia (poor motility)", indent: true },
  { label: "Teratospermia (abnormal morphology)", indent: true },
  { label: "OAT syndrome (combined)", indent: true },
  { label: "Varicocele", indent: false },
  { label: "Recurrent Varicocele", indent: false },
  { label: "High Sperm DNA Fragmentation", indent: false },
  { label: "Undescended testicles (cryptorchidism)", indent: false },
  { label: "Vasectomy history", indent: false },
  { label: "Retrograde ejaculation", indent: false },
  { label: "Hypogonadism", indent: false },
  { label: "Y-chromosome microdeletion", indent: false },
  { label: "Klinefelter syndrome", indent: false },
  { label: "CF mutation carrier", indent: false },
  { label: "Unexplained male factor", indent: false },
  { label: "No clear diagnosis", indent: false },
  { label: "Other", indent: false },
];

// Default previous tests for new intakes
const FEMALE_DEFAULT_TESTS: TestEntry[] = [
  { name: "AMH (Anti-Müllerian Hormone)", date: "", result: "", unit: "pmol/L", referenceRange: "", resultType: "Quantitative" },
  { name: "FSH (Follicle-Stimulating Hormone)", date: "", result: "", unit: "IU/L", referenceRange: "", resultType: "Quantitative" },
  { name: "LH (Luteinizing Hormone)", date: "", result: "", unit: "IU/L", referenceRange: "", resultType: "Quantitative" },
  { name: "Estradiol (E2)", date: "", result: "", unit: "pmol/L", referenceRange: "", resultType: "Quantitative" },
  { name: "Progesterone", date: "", result: "", unit: "nmol/L", referenceRange: "", resultType: "Quantitative" },
  { name: "Prolactin", date: "", result: "", unit: "mIU/L", referenceRange: "", resultType: "Quantitative" },
  { name: "TSH (Thyroid-Stimulating Hormone)", date: "", result: "", unit: "mIU/L", referenceRange: "", resultType: "Quantitative" },
  { name: "AFC (Antral Follicle Count)", date: "", result: "", unit: "", referenceRange: "", resultType: "Quantitative" },
  { name: "Rubella IgG", date: "", result: "", unit: "", referenceRange: "", resultType: "Qualitative" },
  { name: "Hepatitis B (HBsAg)", date: "", result: "", unit: "", referenceRange: "", resultType: "Qualitative" },
  { name: "Hepatitis C (Anti-HCV)", date: "", result: "", unit: "", referenceRange: "", resultType: "Qualitative" },
  { name: "HIV", date: "", result: "", unit: "", referenceRange: "", resultType: "Qualitative" },
];

const MALE_DEFAULT_TESTS: TestEntry[] = [
  { name: "FSH (Follicle-Stimulating Hormone)", date: "", result: "", unit: "IU/L", referenceRange: "", resultType: "Quantitative" },
  { name: "LH (Luteinizing Hormone)", date: "", result: "", unit: "IU/L", referenceRange: "", resultType: "Quantitative" },
  { name: "Testosterone (Total)", date: "", result: "", unit: "nmol/L", referenceRange: "", resultType: "Quantitative" },
  { name: "Prolactin", date: "", result: "", unit: "mIU/L", referenceRange: "", resultType: "Quantitative" },
  { name: "TSH (Thyroid-Stimulating Hormone)", date: "", result: "", unit: "mIU/L", referenceRange: "", resultType: "Quantitative" },
  { name: "Hepatitis B (HBsAg)", date: "", result: "", unit: "", referenceRange: "", resultType: "Qualitative" },
  { name: "Hepatitis C (Anti-HCV)", date: "", result: "", unit: "", referenceRange: "", resultType: "Qualitative" },
  { name: "HIV", date: "", result: "", unit: "", referenceRange: "", resultType: "Qualitative" },
];

const createBlankMiscarriageEntry = (): MiscarriageEntry => ({
  date: "",
  gestationalAge: "",
  notes: "",
});

const hasMeaningfulMiscarriageEntry = (entry?: MiscarriageEntry | null) => {
  if (!entry) return false;
  return !!(
    entry.date ||
    entry.gestationalAge ||
    entry.notes ||
    entry.fileKey ||
    entry.fileUrl ||
    entry.fileName ||
    entry.filePassword ||
    entry.docId
  );
};

const hasMeaningfulMiscarriageHistory = (entries: MiscarriageEntry[]) =>
  entries.some((entry) => hasMeaningfulMiscarriageEntry(entry));

const buildMiscarriageEntries = (count: number, existing: MiscarriageEntry[]) => {
  if (count <= 0) return [];
  if (existing.length >= count) return existing.slice(0, count);
  return [
    ...existing,
    ...Array.from({ length: count - existing.length }, () => createBlankMiscarriageEntry()),
  ];
};

const getMiscarriageCountConfirmDescription = (currentCount: number, nextCount: number) => {
  const removedCount = currentCount - nextCount;
  return `This will delete the details of ${removedCount} miscarriage ${removedCount === 1 ? "entry" : "entries"}. The first ${nextCount} ${nextCount === 1 ? "entry will" : "entries will"} be preserved.`;
};

const getMiscarriageClearDescription = (count: number) =>
  count > 0
    ? `This will remove all ${count} miscarriage ${count === 1 ? "entry" : "entries"} from Pregnancy History.`
    : "This will remove the miscarriage details from Pregnancy History.";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJSON<T>(val: any, fallback: T): T {
  if (!val) return fallback;
  if (typeof val === "object") return val as T;
  try {
    const parsed = JSON.parse(val);
    // Handle double-encoded JSON (string-within-a-string)
    if (typeof parsed === "string") {
      try { return JSON.parse(parsed) as T; } catch { return fallback; }
    }
    return parsed as T;
  } catch { return fallback; }
}

/** Safely parse a JSON array — always returns an array, never null/undefined */
function parseJSONArray<T>(val: any): T[] {
  const result = parseJSON<T[]>(val, []);
  return Array.isArray(result) ? result : [];
}

function calcBMI(h: string, w: string): string {
  const hNum = parseFloat(h);
  const wNum = parseFloat(w);
  if (!hNum || !wNum) return "";
  return (wNum / ((hNum / 100) ** 2)).toFixed(1);
}

// ─── Unit conversion helpers ─────────────────────────────────────────────────
type HeightUnit = "cm" | "ft";
type WeightUnit = "kg" | "lbs";

/** Convert stored cm value to display string for the given unit */
function cmToDisplay(cmStr: string, unit: HeightUnit): { primary: string; secondary: string } {
  const cm = parseFloat(cmStr);
  if (!cm) return { primary: "", secondary: "" };
  if (unit === "cm") return { primary: cmStr, secondary: "" };
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return { primary: String(feet), secondary: String(inches) };
}

/** Convert display input to cm string */
function displayToCm(primary: string, secondary: string, unit: HeightUnit): string {
  if (unit === "cm") return primary;
  const feet = parseFloat(primary) || 0;
  const inches = parseFloat(secondary) || 0;
  if (!feet && !inches) return "";
  return ((feet * 12 + inches) * 2.54).toFixed(1);
}

/** Convert stored kg value to display string for the given unit */
function kgToDisplay(kgStr: string, unit: WeightUnit): string {
  const kg = parseFloat(kgStr);
  if (!kg) return "";
  if (unit === "kg") return kgStr;
  return (kg * 2.20462).toFixed(1);
}

/** Convert display input to kg string */
function displayToKg(val: string, unit: WeightUnit): string {
  if (unit === "kg") return val;
  const lbs = parseFloat(val);
  if (!lbs) return "";
  return (lbs / 2.20462).toFixed(2);
}

// ─── HeightWeightField ────────────────────────────────────────────────────────
// Uses local display state so users can type freely without double-conversion
// rounding issues. Converts to metric only on blur.
function HeightWeightField({
  heightCm, weightKg,
  onHeightChange, onWeightChange,
  heightUnit, weightUnit,
  onHeightUnitChange, onWeightUnitChange,
}: {
  heightCm: string; weightKg: string;
  onHeightChange: (cm: string) => void;
  onWeightChange: (kg: string) => void;
  heightUnit: HeightUnit; weightUnit: WeightUnit;
  onHeightUnitChange: (u: HeightUnit) => void;
  onWeightUnitChange: (u: WeightUnit) => void;
}) {
  // Local display state — avoids double-conversion rounding while typing
  const hDisplay = cmToDisplay(heightCm, heightUnit);
  const [ftVal, setFtVal] = useState(hDisplay.primary);
  const [inVal, setInVal] = useState(hDisplay.secondary);
  const [wDisplayLocal, setWDisplayLocal] = useState(() => kgToDisplay(weightKg, weightUnit));

  // Sync local state when unit changes or external value changes
  useEffect(() => {
    const d = cmToDisplay(heightCm, heightUnit);
    setFtVal(d.primary);
    setInVal(d.secondary);
  }, [heightUnit, heightCm]);

  useEffect(() => {
    setWDisplayLocal(kgToDisplay(weightKg, weightUnit));
  }, [weightUnit, weightKg]);

  const handleHeightUnitChange = (u: HeightUnit) => {
    onHeightUnitChange(u);
  };

  const handleWeightUnitChange = (u: WeightUnit) => {
    onWeightUnitChange(u);
  };

  return (
    <>
      {/* Height */}
      <div className="space-y-1">
        <Label className="text-[11px] font-medium text-muted-foreground leading-none">Height</Label>
        <div className="flex gap-1 items-center">
          {heightUnit === "ft" ? (
            <>
              <Input
                type="number" min="0" placeholder="ft"
                value={ftVal}
                onChange={e => setFtVal(e.target.value)}
                onBlur={() => {
                  const cm = displayToCm(ftVal, inVal, "ft");
                  if (cm) onHeightChange(cm);
                }}
                className="h-8 text-sm w-16"
              />
              <span className="text-[11px] font-medium text-muted-foreground leading-none">ft</span>
              <Input
                type="number" min="0" max="11" placeholder="in"
                value={inVal}
                onChange={e => setInVal(e.target.value)}
                onBlur={() => {
                  const cm = displayToCm(ftVal, inVal, "ft");
                  if (cm) onHeightChange(cm);
                }}
                className="h-8 text-sm w-16"
              />
              <span className="text-[11px] font-medium text-muted-foreground leading-none">in</span>
            </>
          ) : (
            <Input
              type="number" min="0" placeholder="e.g. 165"
              value={heightCm}
              onChange={e => onHeightChange(e.target.value)}
              className="h-8 text-sm"
            />
          )}
          <Select value={heightUnit} onValueChange={v => handleHeightUnitChange(v as HeightUnit)}>
            <SelectTrigger className="h-8 text-xs w-20 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cm">cm</SelectItem>
              <SelectItem value="ft">ft / in</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Weight */}
      <div className="space-y-1">
        <Label className="text-[11px] font-medium text-muted-foreground leading-none">Weight</Label>
        <div className="flex gap-1 items-center">
          <Input
            type="number" min="0" placeholder={weightUnit === "kg" ? "e.g. 65" : "e.g. 143"}
            value={wDisplayLocal}
            onChange={e => setWDisplayLocal(e.target.value)}
            onBlur={() => {
              const kg = displayToKg(wDisplayLocal, weightUnit);
              if (kg) onWeightChange(kg);
              else if (!wDisplayLocal) onWeightChange("");
            }}
            className="h-8 text-sm"
          />
          <Select value={weightUnit} onValueChange={v => handleWeightUnitChange(v as WeightUnit)}>
            <SelectTrigger className="h-8 text-xs w-20 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="kg">kg</SelectItem>
              <SelectItem value="lbs">lbs</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function F({ label, value, onChange, type = "text", placeholder, className, max, min, historical = false }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; className?: string; max?: string; min?: string;
  /** If true, future dates are rejected with an inline error */
  historical?: boolean;
}) {
  const isDateLike = type === "date" || type === "month";
  const [dateError, setDateError] = useState("");

  // Compute effective max for historical date fields
  const effectiveMax = isDateLike && historical
    ? (type === "month" ? currentMonthISO() : todayISO())
    : max;

  const handleChange = (v: string) => {
    if (historical && isDateLike && v) {
      const isFuture = type === "month" ? isFutureMonth(v) : isFutureDate(v);
      if (isFuture) {
        setDateError("You cannot select a future date. Please select a valid date.");
        // Clear the field completely — do NOT substitute today's date
        onChange("");
        return;
      }
    }
    setDateError("");
    onChange(v);
  };

  return (
    <div className={`space-y-1 min-w-0 ${className ?? ""}`} style={{minWidth:0,maxWidth:'100%',width:'100%',boxSizing:'border-box'}}>
      <Label className="text-[11px] font-medium text-muted-foreground leading-none">{label}</Label>
      <input
        type={type}
        value={value}
        onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        max={effectiveMax}
        min={min}
        className={isDateLike
          ? "date-input h-8 text-sm rounded-md px-2 w-full focus:outline-none focus:ring-2 focus:ring-ring/50"
          : "h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50"}
        style={isDateLike ? {display:'block',width:'100%',minWidth:0,maxWidth:'100%',boxSizing:'border-box',border:`1px solid ${dateError ? '#ef4444' : '#dcdfe5'}`,background:'#ffffff',color:'#111827',borderRadius:'8px',WebkitAppearance:'none',appearance:'none' as any} : undefined}
      />
      {dateError && <p className="text-[10px] text-red-500 leading-tight pt-0.5">{dateError}</p>}
    </div>
  );
}

function TA({ label, value, onChange, rows = 3, placeholder, autoGrow = false }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; autoGrow?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoGrow && ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [value, autoGrow]);
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium text-muted-foreground leading-none">{label}</Label>
      <Textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`text-sm resize-none overflow-hidden ${autoGrow ? "" : "min-h-0"}`}
        style={autoGrow ? { minHeight: `${rows * 1.5 + 1}rem` } : undefined}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value && value !== "0") return null;
  return (
    <div className="flex justify-between gap-4 py-1 border-b border-border/40 last:border-0">
      <dt className="text-muted-foreground text-xs shrink-0">{label}</dt>
      <dd className="font-medium text-xs text-right">{value}</dd>
    </div>
  );
}

// Context that carries a storage prefix so SectionCard can persist open/close state
// per entity (e.g. "lead_123" or "patient_456") without prop-drilling through 59 call sites.
const SectionStorageContext = createContext<string | null>(null);

function SectionCard({ title, children, defaultOpen = false, readOnly = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean; readOnly?: boolean }) {
  const storagePrefix = useContext(SectionStorageContext);
  const storageKey = storagePrefix ? `section_open_${storagePrefix}_${title}` : null;

  const [open, setOpenRaw] = useState<boolean>(() => {
    if (readOnly) return true;
    if (storageKey) {
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved !== null) return saved === "1";
      } catch {}
    }
    return defaultOpen;
  });

  const setOpen = (updater: boolean | ((prev: boolean) => boolean)) => {
    setOpenRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (storageKey) {
        try { sessionStorage.setItem(storageKey, next ? "1" : "0"); } catch {}
      }
      return next;
    });
  };

  const isOpen = readOnly ? true : open;
  return (
    <div
      className="overflow-hidden transition-shadow"
      style={{
        borderRadius: 12,
        border: isOpen ? '1.5px solid #1E0566' : '1px solid #E6DDF7',
        borderLeft: '4px solid #1E0566',
        boxShadow: isOpen ? '0 2px 8px rgba(30,5,102,0.10)' : '0 1px 4px rgba(30,5,102,0.06)',
        background: '#fff',
      }}
    >
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 transition-colors"
        style={{
          background: isOpen ? '#1E0566' : '#F7F3FF',
          minHeight: 48,
          borderBottom: isOpen ? '1px solid rgba(255,255,255,0.12)' : 'none',
          cursor: readOnly ? 'default' : 'pointer',
        }}
        onClick={readOnly ? undefined : () => setOpen(o => !o)}
        disabled={readOnly}
      >
        <span
          className="text-[13px] font-[600] uppercase tracking-[0.5px]"
          style={{ color: isOpen ? '#fff' : '#1E0566' }}
        >
          {title}
        </span>
        {!readOnly && (isOpen
          ? <ChevronUp className="h-4 w-4 shrink-0" style={{ color: 'rgba(255,255,255,0.80)' }} />
          : <ChevronDown className="h-4 w-4 shrink-0" style={{ color: '#1E0566' }} />)}
      </button>
      {isOpen && <div className="bg-white px-4 py-3">{children}</div>}
    </div>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded" />
      {label}
    </label>
  );
}

/** Renders a main diagnosis + its sub-options inside a grey card box */
function DiagnosisGroupBox({ group, selected, onToggle, rawOptions }: {
  group: DiagnosisGroup;
  selected: string[];
  onToggle: (label: string, checked: boolean) => void;
  /** Raw options from dropdownOptions.list — used to block newly selecting hidden options */
  rawOptions?: RawDropdownOption[] | null;
}) {
  const hasSubs = group.subs.length > 0;
  const mainHidden = group.isHidden || isHiddenOption(group.main, rawOptions ?? null);
  return (
    <div className={`rounded-lg border ${mainHidden ? "border-border/30 opacity-70" : "border-border/50"} bg-muted/30 px-3 py-2 space-y-1.5`}>
      {/* Main option */}
      <label className={`flex items-center gap-2 select-none ${mainHidden ? "cursor-not-allowed" : "cursor-pointer"}`}>
        <input
          type="checkbox"
          checked={selected.includes(group.main)}
          onChange={e => {
            if (mainHidden && !selected.includes(group.main)) return; // block newly selecting hidden
            onToggle(group.main, e.target.checked);
          }}
          disabled={mainHidden && !selected.includes(group.main)}
          className="h-4 w-4 rounded border-border accent-primary shrink-0"
        />
        <span className={`text-xs font-semibold leading-tight ${mainHidden ? "line-through text-muted-foreground" : "text-foreground"}`}>{group.main}</span>
        {mainHidden && <span className="text-xs text-muted-foreground ml-1">(hidden)</span>}
      </label>
      {/* Sub-options */}
      {hasSubs && (
        <div className="ml-1 space-y-1 border-l-2 border-border/40 pl-3">
          {group.subs.map(sub => {
            const subHidden = isHiddenOption(sub, rawOptions ?? null);
            if (subHidden && !selected.includes(sub)) return null;
            return (
              <label key={sub} className={`flex items-center gap-2 select-none ${subHidden ? "cursor-not-allowed" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  checked={selected.includes(sub)}
                  onChange={e => {
                    if (subHidden && !selected.includes(sub)) return;
                    onToggle(sub, e.target.checked);
                  }}
                  disabled={subHidden && !selected.includes(sub)}
                  className="h-4 w-4 rounded border-border accent-primary shrink-0"
                />
                <span className={`text-xs leading-tight ${subHidden ? "line-through text-muted-foreground" : "text-muted-foreground"}`}>{sub}</span>
                {subHidden && <span className="text-xs text-muted-foreground ml-1">(hidden)</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Marriage Certificate Attachment ────────────────────────────────────────
// Compact file-upload control specifically for the marriage certificate.
// Shown under the "We have an official marriage certificate" checkbox.
function MarriageCertAttachment({
  fileUrl, fileName, filePassword, docId,
  onUpload, onPasswordChange, onRemove,
}: {
  fileUrl?: string;
  fileName?: string;
  filePassword?: string;
  docId?: number;
  onUpload: (file: File) => void;
  onPasswordChange: (pw: string) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showPw, setShowPw] = useState(!!filePassword);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try { await Promise.resolve(onUpload(file)); } finally { setUploading(false); }
  };

  return (
    <div className="mt-2 ml-1 pl-3 border-l-2 border-primary/20 space-y-1.5">
      <p className="text-[11px] font-medium text-muted-foreground">Marriage Certificate Document</p>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-dashed border-muted-foreground/40 hover:border-primary/60 hover:bg-muted/30 transition-colors text-muted-foreground disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
          {uploading ? "Uploading..." : fileUrl ? "Replace certificate" : "Attach certificate"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
        />
        {fileUrl && (
          <a
            href={normaliseFileUrl(fileUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline max-w-[200px] truncate"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate">{fileName || "View certificate"}</span>
          </a>
        )}
        {fileUrl && (
          <button
            type="button"
            onClick={onRemove}
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
            value={filePassword ?? ""}
            onChange={e => onPasswordChange(e.target.value)}
            placeholder="Document password (if protected)"
            className="h-7 text-xs max-w-[220px]"
          />
          <span className="text-[11px] text-muted-foreground">Stored securely for staff reference</span>
        </div>
      )}
    </div>
  );
}

// ─── File Attachment Row ──────────────────────────────────────────────────────
// Renders a compact file-upload control that can be embedded in any entry row.
// Calls onUpload(file) when a file is picked; shows a link once fileUrl is set.

function FileAttachmentRow({
  fileUrl, fileName, filePassword,
  onUpload, onPasswordChange, onRemove, isUploading, expiredPlaceholder,
}: {
  fileUrl?: string;
  fileName?: string;
  filePassword?: string;
  onUpload: (file: File) => void;
  onPasswordChange: (pw: string) => void;
  onRemove?: () => void;
  isUploading?: boolean;
  /** When true, shows an expired-file warning instead of the file link */
  expiredPlaceholder?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showPw, setShowPw] = useState(!!filePassword);

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Upload button */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-dashed border-muted-foreground/40 hover:border-primary/60 hover:bg-muted/30 transition-colors text-muted-foreground disabled:opacity-50"
        >
          {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
          {isUploading ? "Uploading..." : fileUrl ? "Replace file" : "Attach file"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }}
        />

        {/* Existing file link or expired placeholder */}
        {expiredPlaceholder ? (
          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Pending attachment expired — please upload it again.
          </span>
        ) : fileUrl ? (
          <a
            href={normaliseFileUrl(fileUrl ?? "")}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline max-w-[200px] truncate"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate">{fileName || "View file"}</span>
          </a>
        ) : null}

        {/* Delete file button */}
        {fileUrl && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive px-1.5 py-1 rounded border border-transparent hover:border-destructive/30 transition-colors"
            title="Remove file"
          >
            <X className="h-3 w-3" /> Remove
          </button>
        )}

        {/* Password toggle */}
        <button
          type="button"
          onClick={() => setShowPw(p => !p)}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
            showPw ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" : "border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60"
          }`}
          title="File is password-protected?"
        >
          <KeyRound className="h-3 w-3" />
          {showPw ? "Has password" : "Password?"}
        </button>
      </div>

      {/* Password input */}
      {showPw && (
        <div className="flex items-center gap-2">
          <Input
            type="text"
            value={filePassword ?? ""}
            onChange={e => onPasswordChange(e.target.value)}
            placeholder="Enter file password"
            className="h-7 text-xs max-w-[220px]"
          />
          <span className="text-[11px] font-medium text-muted-foreground leading-none">Password stored securely for staff reference</span>
        </div>
      )}
    </div>
  );
}

// ─── General Attachments Section ────────────────────────────────────────────
// Multi-file upload with tag, password, delete, and AI extraction per entry.

const TRANSLATE_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "tr", label: "Turkish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
];

function GeneralAttachmentsSection({
  value,
  onChange,
  sectionPrefix,
  mode,
  id,
  onDeleteDoc,
  draftSessionId,
  activeWriterToken,
}: {
  value: GeneralAttachmentEntry[];
  onChange: (v: GeneralAttachmentEntry[]) => void;
  sectionPrefix: string; // e.g. "General-Female" or "General-Male"
  mode: "lead" | "patient";
  id: number;
  onDeleteDoc: (docId?: number) => Promise<void>;
  draftSessionId?: string | null;
  activeWriterToken?: string | null;
}) {
  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  const [translateOpen, setTranslateOpen] = useState<Record<number, boolean>>({});
  const [translateLang, setTranslateLang] = useState<Record<number, string>>({});
  const [translationResult, setTranslationResult] = useState<Record<number, string>>({});
  const [translatingIdx, setTranslatingIdx] = useState<number | null>(null);
  const [editingTag, setEditingTag] = useState<Record<number, boolean>>({});
  const [tagDraft, setTagDraft] = useState<Record<number, string>>({});
  const [showPw, setShowPw] = useState<Record<number, boolean>>({});

  const leadUpload = trpc.leads.uploadIntakeFile.useMutation();
  const patientUpload = trpc.patients.uploadIntakeFile.useMutation();
  // Phase 2: pending-draft upload mutations
  const leadPendingUpload = trpc.leads.uploadPendingIntakeFile.useMutation();
  const patientPendingUpload = trpc.patients.uploadPendingIntakeFile.useMutation();
  const translateLeadDoc = trpc.translations.translateLeadDocument.useMutation({
    onError: (e) => { setTranslatingIdx(null); toast.error(e.message || "AI extraction failed"); },
  });

  const addEntry = () => {
    const idx = value.length;
    const tag = `${sectionPrefix}-${String(idx + 1).padStart(2, "0")}`;
    onChange([...value, { tag }]);
  };

  const removeEntry = async (i: number) => {
    const entry = value[i];
    if (entry.docId) await onDeleteDoc(entry.docId);
    onChange(value.filter((_, idx) => idx !== i));
  };

  const updateEntry = (i: number, patch: Partial<GeneralAttachmentEntry>) => {
    const updated = [...value];
    updated[i] = { ...updated[i], ...patch };
    onChange(updated);
  };

  const handleUpload = (i: number, file: File) => {
    setUploading(prev => ({ ...prev, [i]: true }));
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const b64 = (ev.target?.result as string).split(",")[1];
      try {
        const oldDocId = value[i]?.docId;
        const oldLifecycle = (value[i] as any)?.lifecycleStatus;
        let result: any;
        // Phase 2 Final Correction: require draftSessionId + activeWriterToken (legacy fallback removed)
        if (!draftSessionId || !activeWriterToken) {
          toast.error("No active draft session. Please refresh and try again.");
          return;
        }
        if (oldDocId && oldLifecycle === "pending-draft") await onDeleteDoc(oldDocId);
        const mutation = mode === "lead" ? leadPendingUpload : patientPendingUpload;
        const payload = mode === "lead"
          ? { leadId: id, fileBase64: b64, fileName: file.name, mimeType: file.type, intakeSection: sectionPrefix, draftSessionId, activeWriterToken, pendingSection: sectionPrefix }
          : { patientId: id, fileBase64: b64, fileName: file.name, mimeType: file.type, intakeSection: sectionPrefix, draftSessionId, activeWriterToken, pendingSection: sectionPrefix };
        result = await (mutation.mutateAsync as any)(payload);
        updateEntry(i, { fileKey: result.fileKey, fileUrl: result.fileUrl, fileName: result.fileName, mimeType: file.type, docId: result.docId, lifecycleStatus: "pending-draft" });
        toast.success("File uploaded");
      } catch (e: any) {
        toast.error("Upload failed: " + (e?.message ?? "Unknown error"));
      } finally {
        setUploading(prev => ({ ...prev, [i]: false }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleTranslate = async (i: number) => {
    const entry = value[i];
    if (!entry.fileUrl || !entry.docId) return toast.error("Upload a file first");
    const lang = translateLang[i] ?? "en";
    setTranslateOpen(prev => ({ ...prev, [i]: false }));
    setTranslatingIdx(i);
    try {
      const result = await translateLeadDoc.mutateAsync({
        leadDocumentId: entry.docId,
        fileUrl: entry.fileUrl,
        fileName: entry.fileName ?? "document",
        mimeType: entry.mimeType ?? undefined,
        targetLanguage: lang,
        patientId: mode === "patient" ? id : 0,
      });
      if (result?.translatedText) {
        setTranslationResult(prev => ({ ...prev, [i]: result.translatedText }));
      }
      toast.success("AI extraction complete");
    } finally {
      setTranslatingIdx(null);
    }
  };

  return (
    <div className="space-y-3">
      {value.map((entry, i) => {
        return (
          <div key={i} className="border rounded-md p-3 space-y-2 bg-muted/20">
            {/* Header row: tag + delete */}
            <div className="flex items-center justify-between gap-2">
              {editingTag[i] ? (
                <div className="flex items-center gap-1 flex-1">
                  <Input
                    value={tagDraft[i] ?? entry.tag ?? ""}
                    onChange={e => setTagDraft(prev => ({ ...prev, [i]: e.target.value }))}
                    onBlur={() => { updateEntry(i, { tag: tagDraft[i] ?? entry.tag }); setEditingTag(prev => ({ ...prev, [i]: false })); }}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") { updateEntry(i, { tag: tagDraft[i] ?? entry.tag }); setEditingTag(prev => ({ ...prev, [i]: false })); } }}
                    className="h-6 text-xs w-44"
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => { setTagDraft(prev => ({ ...prev, [i]: entry.tag ?? "" })); setEditingTag(prev => ({ ...prev, [i]: true })); }}
                >
                  <Badge variant="secondary" className="text-xs font-normal">{entry.tag || `${sectionPrefix}-${String(i + 1).padStart(2, "0")}`}</Badge>
                  <Pencil className="h-2.5 w-2.5 opacity-50" />
                </button>
              )}
              <Button
                type="button" variant="ghost" size="sm"
                className="h-6 px-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => removeEntry(i)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* File upload row */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => (document.getElementById(`gen-att-${sectionPrefix}-${i}`) as HTMLInputElement)?.click()}
                disabled={uploading[i]}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-dashed border-muted-foreground/40 hover:border-primary/60 hover:bg-muted/30 transition-colors text-muted-foreground disabled:opacity-50"
              >
                {uploading[i] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
                {uploading[i] ? "Uploading..." : entry.fileUrl ? "Replace file" : "Attach file"}
              </button>
              <input
                id={`gen-att-${sectionPrefix}-${i}`}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xlsx,.xls,.csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(i, f); e.target.value = ""; }}
              />
              {entry.fileUrl && (
                <a href={entry.fileUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline max-w-[200px] truncate">
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="truncate">{entry.fileName || "View file"}</span>
                </a>
              )}
            </div>

            {/* Password row */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setShowPw(prev => ({ ...prev, [i]: !prev[i] }))}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
                  showPw[i] ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" : "border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60"
                }`}
              >
                <KeyRound className="h-3 w-3" />
                {showPw[i] ? "Has password" : "Password?"}
              </button>
              {showPw[i] && (
                <Input
                  type="text"
                  value={entry.docPassword ?? ""}
                  onChange={e => updateEntry(i, { docPassword: e.target.value })}
                  placeholder="Document password (if protected)"
                  className="h-7 text-xs max-w-[220px]"
                />
              )}
            </div>

            {/* AI Extract & Translate — Saved Translations Panel */}
            {entry.fileUrl && entry.docId && (
              <SavedTranslationsPanel
                leadDocumentId={entry.docId}
                fileUrl={entry.fileUrl}
                fileName={entry.fileName ?? "document"}
                mimeType={entry.mimeType}
                patientId={mode === "patient" ? id : 0}
              />
            )}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addEntry}>
        <Plus className="h-3 w-3" /> Add Document
      </Button>
    </div>
  );
}

// ─── ART History Editor ───────────────────────────────────────────────────────

function ARTHistoryEditor({ value, onChange, onFileUpload, onFileRemove }: { value: ARTEntry[]; onChange: (v: ARTEntry[]) => void; onFileUpload?: (i: number, file: File, list: ARTEntry[], setList: (v: ARTEntry[]) => void) => void; onFileRemove?: (docId?: number, i?: number) => void }) {
  const addEntry = () => onChange([...value, { type: "IVF", date: "", clinic: "", protocol: "", result: "", notes: "" }]);
  const removeEntry = (i: number) => { const entry = value[i]; if (entry?.docId && onFileRemove) onFileRemove(entry.docId, i); onChange(value.filter((_, idx) => idx !== i)); };
  const updateEntry = (i: number, key: keyof ARTEntry, val: any) => {
    const updated = [...value];
    updated[i] = { ...updated[i], [key]: val };
    onChange(updated);
  };
  const [uploading, setUploading] = useState<Record<number, boolean>>({});

  return (
    <div className="space-y-3">
      {value.map((entry, i) => (
        <div key={i} className="border rounded-md p-3 space-y-2 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Cycle {i + 1}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeEntry(i)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground leading-none">Treatment Type</Label>
              <Select value={entry.type} onValueChange={v => updateEntry(i, "type", v)}>
                <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["IVF", "ICSI", "IUI", "FET", "Egg Freezing", "Donor Egg", "Donor Sperm", "Other"].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <F label="Date" value={entry.date} onChange={v => updateEntry(i, "date", v)} type="month" historical />
            <F label="Clinic" value={entry.clinic} onChange={v => updateEntry(i, "clinic", v)} placeholder="e.g. Cairo IVF Center" />
            <F label="Protocol" value={entry.protocol} onChange={v => updateEntry(i, "protocol", v)} placeholder="e.g. Antagonist" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-3">
            <F label="Eggs Collected" value={entry.eggsCollected?.toString() ?? ""} onChange={v => updateEntry(i, "eggsCollected", v ? parseInt(v) : undefined)} type="number" />
            <F label="Fertilized" value={entry.embryosFertilized?.toString() ?? ""} onChange={v => updateEntry(i, "embryosFertilized", v ? parseInt(v) : undefined)} type="number" />
            <F label="Transferred" value={entry.embryosTransferred?.toString() ?? ""} onChange={v => updateEntry(i, "embryosTransferred", v ? parseInt(v) : undefined)} type="number" />
            <F label="Embryo Quality" value={entry.embryoQuality ?? ""} onChange={v => updateEntry(i, "embryoQuality", v)} placeholder="e.g. Grade A" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground leading-none">Result</Label>
              <Select value={entry.result} onValueChange={v => updateEntry(i, "result", v)}>
                <SelectTrigger className="h-8 text-xs w-full"><SelectValue placeholder="Select result" /></SelectTrigger>
                <SelectContent>
                  {["Ongoing pregnancy", "Live birth", "Biochemical pregnancy", "Clinical miscarriage", "Failed – no transfer", "Failed – no blastocysts", "Cancelled", "Other"].map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <F label="Notes" value={entry.notes} onChange={v => updateEntry(i, "notes", v)} placeholder="e.g. Stimulation response was poor..." />
          </div>
          {onFileUpload && (
            <FileAttachmentRow
              fileUrl={entry.expiredPlaceholder ? undefined : entry.fileUrl} fileName={entry.fileName} filePassword={entry.filePassword}
              expiredPlaceholder={entry.expiredPlaceholder}
              isUploading={uploading[i]}
              onUpload={file => { setUploading(u => ({ ...u, [i]: true })); onFileUpload(i, file, value, (v) => { onChange(v); setUploading(u => ({ ...u, [i]: false })); }); }}
              onPasswordChange={pw => updateEntry(i, "filePassword", pw)}
              onRemove={onFileRemove ? () => { onFileRemove(entry.docId, i); const updated = [...value]; updated[i] = { ...updated[i], fileUrl: undefined, fileKey: undefined, fileName: undefined, filePassword: undefined, docId: undefined }; onChange(updated); } : undefined}
            />
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addEntry} className="gap-1.5 w-full">
        <Plus className="h-3.5 w-3.5" /> Add ART Cycle
      </Button>
    </div>
  );
}

// ─── Surgical History Editor ──────────────────────────────────────────────────

function SurgicalHistoryEditor({ value, onChange, onFileUpload, onFileRemove, gender = "female" }: { value: SurgicalEntry[]; onChange: (v: SurgicalEntry[]) => void; onFileUpload?: (i: number, file: File, list: SurgicalEntry[], setList: (v: SurgicalEntry[]) => void) => void; onFileRemove?: (docId?: number, i?: number) => void; gender?: "female" | "male" }) {
  const PROC_OPTIONS = gender === "male" ? MALE_PROCEDURE_TYPE_OPTIONS : PROCEDURE_TYPE_OPTIONS;
  const add = () => onChange([...value, { procedureType: "", procedure: "", date: "", notes: "" }]);
  const remove = (i: number) => { const entry = value[i]; if (entry?.docId && onFileRemove) onFileRemove(entry.docId, i); onChange(value.filter((_, idx) => idx !== i)); };
  const update = (i: number, key: keyof SurgicalEntry, val: string) => {
    const updated = [...value];
    updated[i] = { ...updated[i], [key]: val };
    onChange(updated);
  };
  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  return (
    <div className="space-y-2">
      {value.map((e, i) => (
        <div key={i} className="border rounded-md p-2 bg-muted/20 space-y-2">
          {/* Row 1: Procedure Type dropdown + Delete */}
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <Label className="text-[11px] font-medium text-muted-foreground leading-none mb-1 block">Type of Procedure</Label>
              <Select
                value={e.procedureType || ""}
                onValueChange={v => {
                  const updated = [...value];
                  updated[i] = { ...updated[i], procedureType: v, procedure: v !== "Other" ? v : "" };
                  onChange(updated);
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select procedure type..." />
                </SelectTrigger>
                <SelectContent>
                  {PROC_OPTIONS.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => remove(i)}>
              <X className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
          {/* Row 2: Custom name — only shown when type is "Other" */}
          {e.procedureType === "Other" && (
            <F label="Procedure / Surgery Name" value={e.procedure} onChange={v => update(i, "procedure", v)} placeholder="Enter procedure or surgery name..." />
          )}
          {/* Row 3: Date — single standard date input, iOS-safe */}
          <div className="space-y-1" style={{minWidth:0,maxWidth:'100%',width:'100%',boxSizing:'border-box' as any}}>
            <Label className="text-[11px] font-medium text-muted-foreground leading-none">Date</Label>
            <input
              type="date"
              value={e.date && e.date.match(/^\d{4}-\d{2}-\d{2}$/) ? e.date : ""}
              max={todayISO()}
              min="1900-01-01"
              onChange={ev => {
                const v = ev.target.value;
                if (v && isFutureDate(v)) { toast.error("You cannot select a future date. Please select a valid date."); update(i, "date", ""); return; }
                update(i, "date", v);
              }}
              className="date-input"
              placeholder="Select date"
              style={{
                display:'block',width:'100%',minWidth:0,maxWidth:'100%',
                height:'36px',padding:'0 10px',fontSize:'13px',
                borderRadius:'8px',boxSizing:'border-box' as any,
                border:'1px solid #dcdfe5',background:'#ffffff',
                color:'#111827',WebkitAppearance:'none',
                appearance:'none' as any,outline:'none'
              }}
            />
          </div>
          {/* Row 4: Notes textarea */}
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground leading-none">Notes / Findings</Label>
            <div className="relative">
              <Textarea
                value={e.notes}
                onChange={ev => { if (ev.target.value.length <= 1000) update(i, "notes", ev.target.value); }}
                placeholder="e.g. No complications, findings, outcome..."
                rows={2}
                className="text-sm resize-none pr-14"
              />
              <span className={`absolute bottom-1.5 right-2 text-[10px] ${e.notes.length > 900 ? "text-destructive" : "text-muted-foreground/50"}`}>{e.notes.length}/1000</span>
            </div>
          </div>
          {onFileUpload && (
            <FileAttachmentRow
              fileUrl={(e as any).expiredPlaceholder ? undefined : e.fileUrl} fileName={e.fileName} filePassword={e.filePassword}
              expiredPlaceholder={(e as any).expiredPlaceholder}
              isUploading={uploading[i]}
              onUpload={file => { setUploading(u => ({ ...u, [i]: true })); onFileUpload(i, file, value, (v) => { onChange(v); setUploading(u => ({ ...u, [i]: false })); }); }}
              onPasswordChange={pw => update(i, "filePassword", pw)}
              onRemove={onFileRemove ? () => { onFileRemove(e.docId, i); const updated = [...value]; updated[i] = { ...updated[i], fileUrl: undefined, fileKey: undefined, fileName: undefined, filePassword: undefined, docId: undefined }; onChange(updated); } : undefined}
            />
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add} className="gap-1.5 w-full">
        <Plus className="h-3.5 w-3.5" /> Add Procedure
      </Button>
    </div>
  );
}

// ─── Miscarriage History Editor ───────────────────────────────────────────────

function MiscarriageEditor({ value, onChange, onFileUpload, onFileRemove }: { value: MiscarriageEntry[]; onChange: (v: MiscarriageEntry[]) => void; onFileUpload?: (i: number, file: File, list: MiscarriageEntry[], setList: (v: MiscarriageEntry[]) => void) => void; onFileRemove?: (docId?: number, i?: number) => void }) {
  const add = () => onChange([...value, { date: "", gestationalAge: "", notes: "" }]);
  const remove = (i: number) => { const entry = value[i]; if (entry?.docId && onFileRemove) onFileRemove(entry.docId, i); onChange(value.filter((_, idx) => idx !== i)); };
  const update = (i: number, key: keyof MiscarriageEntry, val: string) => {
    const updated = [...value];
    updated[i] = { ...updated[i], [key]: val };
    onChange(updated);
  };
  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  const [dateErrors, setDateErrors] = useState<Record<number, string>>({});
  const handleDateChange = (i: number, v: string) => {
    if (v && isFutureMonth(v)) {
      setDateErrors(prev => ({ ...prev, [i]: "You cannot select a future date. Please select a valid date." }));
      // Clear the field — do NOT keep the future date in state
      update(i, "date", "");
      return;
    }
    setDateErrors(prev => { const n = { ...prev }; delete n[i]; return n; });
    update(i, "date", v);
  };
  return (
    <div className="space-y-2">
      {value.map((e, i) => (
        <div key={i} className="border rounded-md p-2 bg-muted/20">
          {/* Row 1: Date | Gestational Age | Delete */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:'8px',width:'100%',maxWidth:'100%',alignItems:'end',boxSizing:'border-box',overflow:'visible'}}>
            <div style={{minWidth:0,maxWidth:'100%',width:'100%',overflow:'visible'}}>
              <Label className="text-[11px] font-medium text-muted-foreground leading-none block mb-1">Date</Label>
              <input
                type="month"
                value={e.date}
                max={currentMonthISO()}
                onChange={ev => handleDateChange(i, ev.target.value)}
                style={{display:'block',width:'100%',minWidth:0,maxWidth:'100%',height:'36px',padding:'0 8px',fontSize:'13px',borderRadius:'8px',boxSizing:'border-box',border:`1px solid ${dateErrors[i] ? '#ef4444' : '#dcdfe5'}`,background:'#ffffff',color:'#111827',WebkitAppearance:'none',appearance:'none' as any,outline:'none'}}
              />
              {dateErrors[i] && <p className="text-[10px] text-red-500 leading-tight pt-0.5">{dateErrors[i]}</p>}
            </div>
            <div style={{minWidth:0,maxWidth:'100%',width:'100%',overflow:'visible'}}>
              <F label="Gestational Age" value={e.gestationalAge} onChange={v => update(i, "gestationalAge", v)} placeholder="e.g. 6 weeks" />
            </div>
            <div style={{flexShrink:0,paddingBottom:'0px'}}>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => remove(i)}>
                <X className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>
          {/* Row 2: Notes — full width */}
          <div style={{width:'100%',maxWidth:'100%',minWidth:0,marginTop:'8px'}}>
            <Label className="text-[11px] font-medium text-muted-foreground leading-none block mb-1">Notes</Label>
            <textarea
              value={e.notes}
              onChange={ev => update(i, "notes", ev.target.value)}
              placeholder="e.g. Blighted ovum, chromosomal..."
              rows={3}
              className="notes-textarea notes-field text-sm border rounded-md bg-background focus:outline-none focus:border-primary resize-vertical"
              style={{display:'block',width:'100%',minWidth:0,maxWidth:'100%',minHeight:'78px',height:'auto',lineHeight:'1.35',padding:'8px 10px',boxSizing:'border-box'}}
            />
          </div>
          {onFileUpload && (
            <FileAttachmentRow
              fileUrl={(e as any).expiredPlaceholder ? undefined : e.fileUrl} fileName={e.fileName} filePassword={e.filePassword}
              expiredPlaceholder={(e as any).expiredPlaceholder}
              isUploading={uploading[i]}
              onUpload={file => { setUploading(u => ({ ...u, [i]: true })); onFileUpload(i, file, value, (v) => { onChange(v); setUploading(u => ({ ...u, [i]: false })); }); }}
              onPasswordChange={pw => update(i, "filePassword", pw)}
              onRemove={onFileRemove ? () => { onFileRemove(e.docId, i); const updated = [...value]; updated[i] = { ...updated[i], fileUrl: undefined, fileKey: undefined, fileName: undefined, filePassword: undefined, docId: undefined }; onChange(updated); } : undefined}
            />
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add} className="gap-1.5 w-full">
        <Plus className="h-3.5 w-3.5" /> Add Miscarriage
      </Button>
    </div>
  );
}

// ─── Tests Editor ─────────────────────────────────────────────────────────────
const RESULT_TYPE_OPTIONS = [
  "Quantitative", "Qualitative", "Molecular/PCR", "Genetic",
  "Microbiology Culture", "Panel/Profile", "Semen Analysis", "Semen DNA",
  "Therapeutic Drug Monitoring", "Descriptive/Report",
];

function TestsEditor({ value, onChange, label, onFileUpload, onFileRemove, importDraftKey }: { value: TestEntry[]; onChange: (v: TestEntry[]) => void; label: string; onFileUpload?: (i: number, file: File, list: TestEntry[], setList: (v: TestEntry[]) => void) => void; onFileRemove?: (docId?: number, i?: number) => void; importDraftKey?: string }) {
  const add = () => onChange([...value, { name: "", date: "", result: "" }]);
  const remove = (i: number) => { const entry = value[i]; if (entry?.docId && onFileRemove) onFileRemove(entry.docId, i); onChange(value.filter((_, idx) => idx !== i)); };
  // Needs Review actions
  const confirmReview = (i: number) => {
    const updated = [...value];
    updated[i] = { ...updated[i], needsReview: false, reviewReason: undefined };
    onChange(updated);
  };
  const skipReview = (i: number) => { remove(i); };
  const setReviewResultType = (i: number, rt: string) => {
    const updated = [...value];
    updated[i] = { ...updated[i], resultType: rt, needsReview: false, reviewReason: undefined, typeStagedForConfirm: false };
    onChange(updated);
  };
  // Stage the type (from AI accept) — keeps row in Needs Review until confirmed
  const stageResultType = (i: number, rt: string) => {
    const updated = [...value];
    updated[i] = { ...updated[i], resultType: rt, typeStagedForConfirm: true };
    onChange(updated);
  };
  // Confirm staged type — removes from Needs Review
  const confirmStagedType = (i: number) => {
    const updated = [...value];
    updated[i] = { ...updated[i], needsReview: false, reviewReason: undefined, typeStagedForConfirm: false };
    onChange(updated);
  };
  // Confirm staged type + submit to dictionary
  const confirmStagedTypeWithDict = async (i: number) => {
    const testName = value[i]?.name;
    if (!testName) return;
    confirmStagedType(i);
    try {
      await submitPendingMutation.mutateAsync({ rawName: testName });
      setSubmittedToDict(prev => new Set(prev).add(testName.toLowerCase()));
      toast.success(`"${testName}" confirmed and submitted for dictionary review`, { description: 'It will appear in the dictionary once approved by an admin.' });
    } catch (e: any) {
      toast.error('Failed to submit to dictionary', { description: e?.message || 'Please try again.' });
    }
  };
  const [changingResultTypeIdx, setChangingResultTypeIdx] = useState<number | null>(null);
  const update = (i: number, key: keyof TestEntry, val: string) => {
    const updated = [...value];
    const current = updated[i];
    updated[i] = { ...current, [key]: val };
    // Auto-calculate interpretation when value or reference range changes
    if (key === "result" || key === "referenceRange") {
      const newResult = key === "result" ? val : (current.result ?? "");
      const newRange = key === "referenceRange" ? val : (current.referenceRange ?? "");
      const auto = autoInterpret(newResult, newRange);
      if (auto) updated[i].interpretation = auto;
    }
    onChange(updated);
  };
  const updateUnit = (i: number, newUnit: string) => {
    const e = value[i];
    const numVal = parseFloat(e.result);
    if (!isNaN(numVal) && e.unit && newUnit) {
      const converted = convertUnit(e.name, numVal, e.unit, newUnit);
      const updated = [...value];
      updated[i] = { ...updated[i], unit: newUnit, result: String(roundLabValue(converted)) };
      onChange(updated);
    } else {
      update(i, "unit", newUnit);
    }
  };
  const [uploading, setUploading] = useState<Record<string | number, boolean>>({});
  // Persist showImport across browser tab switches using sessionStorage
  const importModalKey = importDraftKey ? `intake_import_open_${importDraftKey}` : null;
  const [showImport, setShowImportRaw] = useState<boolean>(() => {
    if (!importModalKey) return false;
    try { return sessionStorage.getItem(importModalKey) === "1"; } catch { return false; }
  });
  const setShowImport = (v: boolean) => {
    setShowImportRaw(v);
    if (importModalKey) {
      try { if (v) { sessionStorage.setItem(importModalKey, "1"); } else { sessionStorage.removeItem(importModalKey); } } catch {}
    }
  };
  const [expandedPw, setExpandedPw] = useState<Record<number, boolean>>({});
  const [expandedHistory, setExpandedHistory] = useState<Record<number, boolean>>({});
  const [expandedTrend, setExpandedTrend] = useState<Record<number, boolean>>({});
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  // Stage 2B: Result Type tab filter
  const [activeResultTypeTab, setActiveResultTypeTab] = useState<string>("all");
  // Stage 2B: Add Test modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalDictEntry, setAddModalDictEntry] = useState<LabDictionaryEntry | null>(null);
  const [addModalRawName, setAddModalRawName] = useState("");
  const [addModalFields, setAddModalFields] = useState<ResultFields>({});
  const [addModalDate, setAddModalDate] = useState("");
  const [addModalReportDate, setAddModalReportDate] = useState("");
  const [addModalSource, setAddModalSource] = useState("");
  const [customResultType, setCustomResultType] = useState<string>("");
  // Add modal file attachment state
  const [addModalFileUrl, setAddModalFileUrl] = useState<string | undefined>(undefined);
  const [addModalFileKey, setAddModalFileKey] = useState<string | undefined>(undefined);
  const [addModalFileName, setAddModalFileName] = useState<string | undefined>(undefined);
  const [addModalFileTag, setAddModalFileTag] = useState<string>("");
  const [addModalFilePassword, setAddModalFilePassword] = useState<string>("");
  const [addModalFileUploading, setAddModalFileUploading] = useState(false);
  // Details/Edit modal state
  const [editRowIndex, setEditRowIndex] = useState<number | null>(null);
  const [editRowData, setEditRowData] = useState<TestEntry | null>(null);
  // Duplicate conflict state
  const [duplicateConflict, setDuplicateConflict] = useState<{ pending: TestEntry; existingIdx: number } | null>(null);
  // History row edit state
  const [histEditTarget, setHistEditTarget] = useState<{ rowIdx: number; histIdx: number; data: TestHistoryEntry } | null>(null);
  const [histEditUploading, setHistEditUploading] = useState(false);
  // Delete row confirmation
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);

  // Toolbar: search, sort, filter, bulk select
  const [showAdvancedTools, setShowAdvancedTools] = useState(true); // always on now
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [dateFilterFrom, setDateFilterFrom] = useState("");
  const [dateFilterTo, setDateFilterTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<"entry" | "az" | "za" | "newest" | "oldest">("newest");
  const [showAbnormalOnly, setShowAbnormalOnly] = useState(false);
  // Pagination
  const PAGE_SIZE = 15;
  const [currentPage, setCurrentPage] = useState(1);
  // Auto-expand rows that have historical abnormals when Abnormal filter is toggled on
  useEffect(() => {
    if (!showAbnormalOnly) return;
    const abnormalVals = ["high", "low", "abnormal", "positive", "reactive"];
    const check = (interp?: string) => !!interp && abnormalVals.some(v => interp.toLowerCase().includes(v));
    const toExpand: Record<number, boolean> = {};
    value.forEach((e, i) => {
      // If latest result is NOT abnormal but history has abnormals → auto-expand
      if (!check(e.interpretation) && (e.history ?? []).some(h => check(h.interpretation))) {
        toExpand[i] = true;
      }
    });
    if (Object.keys(toExpand).length > 0) {
      setExpandedHistory(prev => ({ ...prev, ...toExpand }));
    }
  }, [showAbnormalOnly]);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeTargetIdx, setMergeTargetIdx] = useState<number | null>(null);

  // Detect duplicate groups (same name or same dictionaryId, multiple rows)
  const duplicateGroups = useMemo(() => {
    const groups: Map<string, number[]> = new Map();
    value.forEach((t, i) => {
      const key = t.dictionaryId ? `dict:${t.dictionaryId}` : `name:${t.name.toLowerCase().trim()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(i);
    });
    const result: Array<{ key: string; name: string; indices: number[] }> = [];
    groups.forEach((indices, key) => {
      if (indices.length > 1) result.push({ key, name: value[indices[0]].name, indices });
    });
    return result;
  }, [value]);

  // AI suggestion state
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, { suggestedType: string; confidence: "high" | "medium" | "low"; category: string; specimen: string; units: string }>>({});
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const suggestResultTypesMutation = trpc.labDictionary.suggestResultTypes.useMutation();
  const submitPendingMutation = trpc.labDictionary.submitPending.useMutation();
  const [submittedToDict, setSubmittedToDict] = useState<Set<string>>(new Set());
  const [submittingToDict, setSubmittingToDict] = useState<Set<number>>(new Set());

  const handleSubmitAndKeep = async (i: number, testName: string) => {
    if (!testName.trim()) return;
    setSubmittingToDict(prev => new Set(prev).add(i));
    try {
      await submitPendingMutation.mutateAsync({ rawName: testName });
      setSubmittedToDict(prev => new Set(prev).add(testName.toLowerCase()));
      // Keep in patient file (confirm review)
      confirmReview(i);
      toast.success(`"${testName}" submitted for dictionary review`, { description: 'It will appear in the dictionary once approved by an admin.' });
    } catch (e: any) {
      toast.error('Failed to submit to dictionary', { description: e?.message || 'Please try again.' });
    } finally {
      setSubmittingToDict(prev => { const n = new Set(prev); n.delete(i); return n; });
    }
  };

  const handleSuggestTypes = async () => {
    const reviewItems = value.filter(e => e.needsReview);
    if (reviewItems.length === 0) return;
    const namesSet = new Set(reviewItems.map(e => e.name).filter(Boolean));
    const names = Array.from(namesSet);
    if (names.length === 0) return;
    setAiSuggestLoading(true);
    try {
      const results = await suggestResultTypesMutation.mutateAsync({ testNames: names });
      const map: typeof aiSuggestions = {};
      for (const r of results) {
        map[r.testName.toLowerCase()] = { suggestedType: r.suggestedType, confidence: r.confidence, category: r.category, specimen: r.specimen, units: r.units };
      }
      setAiSuggestions(map);
      toast.success(`AI suggested types for ${results.length} test${results.length !== 1 ? 's' : ''}`, { description: 'Review suggestions below. High-confidence ones are pre-selected.' });
    } catch (e) {
      toast.error('AI suggestion failed', { description: 'Could not get suggestions. Please set types manually.' });
    } finally {
      setAiSuggestLoading(false);
    }
  };

  const acceptAiSuggestion = (i: number, testName: string) => {
    const suggestion = aiSuggestions[testName.toLowerCase()];
    if (!suggestion) return;
    // Stage the type — row stays in Needs Review until user confirms
    stageResultType(i, suggestion.suggestedType);
    setAiSuggestions(prev => { const n = { ...prev }; delete n[testName.toLowerCase()]; return n; });
  };

  const acceptAllHighConfidence = () => {
    const updated = [...value];
    let count = 0;
    for (let i = 0; i < updated.length; i++) {
      const e = updated[i];
      if (!e.needsReview) continue;
      const suggestion = aiSuggestions[e.name?.toLowerCase() ?? ''];
      if (suggestion && suggestion.confidence === 'high') {
        // Stage the type — row stays in Needs Review until user confirms
        updated[i] = { ...updated[i], resultType: suggestion.suggestedType, typeStagedForConfirm: true };
        count++;
      }
    }
    if (count > 0) {
      onChange(updated);
      setAiSuggestions({});
      toast.success(`${count} type${count !== 1 ? 's' : ''} staged — review and confirm each row`);
    }
  };

  // Draft key for Add Test modal — scoped to this TestsEditor instance by label
  const addModalDraftKey = `tests_add_modal_draft_${label.replace(/\s+/g, "_").toLowerCase()}`;
  const openAddModal = () => {
    // Try to restore draft from localStorage
    try {
      const saved = localStorage.getItem(addModalDraftKey);
      if (saved) {
        const d = JSON.parse(saved);
        setAddModalRawName(d.rawName || "");
        setAddModalDictEntry(d.dictEntry || null);
        setAddModalFields(d.fields || {});
        setAddModalDate(d.date || "");
        setAddModalReportDate(d.reportDate || "");
        setAddModalSource(d.source || "");
        setCustomResultType(d.customResultType || "");
        setAddModalFileUrl(d.fileUrl || undefined);
        setAddModalFileKey(d.fileKey || undefined);
        setAddModalFileName(d.fileName || undefined);
        setAddModalFileTag(d.fileTag || "");
        setAddModalFilePassword(d.filePassword || "");
        setAddModalFileUploading(false);
        setShowAddModal(true);
        toast.info("Unsaved draft restored", { description: "Your previous Add Test draft has been restored." });
        return;
      }
    } catch {}
    setAddModalDictEntry(null);
    setAddModalRawName("");
    setAddModalFields({});
    setAddModalDate("");
    setAddModalReportDate("");
    setAddModalSource("");
    setCustomResultType("");
    setAddModalFileUrl(undefined);
    setAddModalFileKey(undefined);
    setAddModalFileName(undefined);
    setAddModalFileTag("");
    setAddModalFilePassword("");
    setAddModalFileUploading(false);
    setShowAddModal(true);
  };
  // Auto-save Add modal draft on every state change
  const saveAddModalDraft = useCallback(() => {
    if (!showAddModal) return;
    try {
      localStorage.setItem(addModalDraftKey, JSON.stringify({
        rawName: addModalRawName,
        dictEntry: addModalDictEntry,
        fields: addModalFields,
        date: addModalDate,
        reportDate: addModalReportDate,
        source: addModalSource,
        customResultType,
        fileUrl: addModalFileUrl,
        fileKey: addModalFileKey,
        fileName: addModalFileName,
        fileTag: addModalFileTag,
        filePassword: addModalFilePassword,
      }));
    } catch {}
  }, [showAddModal, addModalRawName, addModalDictEntry, addModalFields, addModalDate, addModalReportDate, addModalSource, customResultType, addModalFileUrl, addModalFileKey, addModalFileName, addModalFileTag, addModalFilePassword, addModalDraftKey]);
  useEffect(() => { saveAddModalDraft(); }, [saveAddModalDraft]);

  const handleAddModalSave = () => {
    const name = addModalDictEntry?.canonicalName || addModalRawName.trim();
    if (!name) { toast.error("Please enter a test name."); return; }
    const resultType = addModalDictEntry?.resultType || (addModalRawName.trim() ? customResultType : undefined);
    // Custom/unknown test must have a result type selected
    if (!addModalDictEntry && addModalRawName.trim() && !customResultType) {
      toast.error("Please select a Result Type for this custom test.");
      return;
    }
    // Build the result string from fields
    let result = "";
    if (resultType === "Quantitative" || resultType === "Therapeutic Drug Monitoring") {
      result = addModalFields.value ?? "";
    } else if (resultType === "Qualitative") {
      result = addModalFields.qualResult ?? "";
    } else if (resultType === "Molecular/PCR") {
      result = addModalFields.detected !== undefined ? (addModalFields.detected ? "Detected" : "Not Detected") : (addModalFields.value ?? "");
    } else if (resultType === "Genetic") {
      result = addModalFields.genotype ?? "";
    } else if (resultType === "Microbiology Culture") {
      result = addModalFields.growth !== undefined ? (addModalFields.growth ? "Growth" : "No Growth") : "";
    } else if (resultType === "Microscopy/Parasitology") {
      result = addModalFields.seen !== undefined ? (addModalFields.seen ? "Seen" : "Not Seen") : "";
    } else if (resultType === "Pathology/Biopsy") {
      result = addModalFields.diagnosis ?? "";
    } else if (resultType === "Descriptive/Report") {
      result = addModalFields.conclusion ?? addModalFields.report ?? "";
    } else {
      result = addModalFields.value ?? addModalFields.notes ?? "";
    }
    const newEntry: TestEntry = {
      name,
      date: addModalDate ? addModalDate.slice(0, 7) : "",
      result,
      unit: addModalFields.unit || undefined,
      referenceRange: addModalFields.referenceRange || undefined,
      interpretation: addModalFields.interpretation || undefined,
      collectionDate: addModalDate || undefined,
      reportDate: addModalReportDate || undefined,
      resultType: resultType || undefined,
      extraFields: (() => {
        const ef: Record<string, string> = {};
        // PCR-specific fields
        if (resultType === "Molecular/PCR") {
          if (addModalFields.value !== undefined && addModalFields.value !== "") ef.viralLoad = String(addModalFields.value);
          if (addModalFields.unit) ef.viralLoadUnit = addModalFields.unit;
          if (addModalFields.ctValue) ef.ctValue = addModalFields.ctValue;
          if (addModalFields.genotype) ef.genotype = addModalFields.genotype;
          if (addModalFields.detected !== undefined) ef.detected = String(addModalFields.detected);
        } else {
          // Generic: spread all string fields
          for (const [k, v] of Object.entries(addModalFields)) {
            if (v !== undefined && v !== "") ef[k] = String(v);
          }
        }
        if (addModalSource.trim()) ef.source = addModalSource.trim();
        return Object.keys(ef).length > 0 ? ef : undefined;
      })(),
      dictionaryId: addModalDictEntry?.id || undefined,
      suggestedModule: addModalDictEntry?.suggestedModule || undefined,
      analyteGroup: addModalDictEntry?.analyteGroup || undefined,
      orderType: addModalDictEntry?.orderType || undefined,
      fileUrl: addModalFileUrl,
      fileKey: addModalFileKey,
      fileName: addModalFileName,
      fileTag: addModalFileTag || undefined,
      filePassword: addModalFilePassword || undefined,
    };
    // Check for duplicate: same name or same dictionaryId already exists
    const existingIdx = value.findIndex(t => {
      // Match by dictionaryId (most reliable)
      if (addModalDictEntry?.id && t.dictionaryId && t.dictionaryId === addModalDictEntry.id) return true;
      // Match by canonical name (case-insensitive)
      if (addModalDictEntry?.canonicalName && t.name.toLowerCase() === addModalDictEntry.canonicalName.toLowerCase()) return true;
      // Match by raw name
      return t.name.toLowerCase() === name.toLowerCase();
    });
    if (existingIdx !== -1) {
      const existing = value[existingIdx];
      // If existing row is empty/default (no result, no date, no extraFields), fill it directly
      const isEmptyDefault = !existing.result && !existing.date && !existing.collectionDate && !existing.reportDate && !existing.extraFields;
      if (isEmptyDefault) {
        const updated = value.map((t, idx) => idx === existingIdx ? { ...t, ...newEntry, name: t.name } : t);
        onChange(updated);
        setShowAddModal(false);
        toast.success(`Updated existing ${name} row with new result.`);
        return;
      }
      // Show conflict resolution dialog
      setDuplicateConflict({ pending: newEntry, existingIdx });
      return; // Don't close the modal yet — wait for user choice
    }
    onChange([...value, newEntry]);
    setShowAddModal(false);
    try { localStorage.removeItem(addModalDraftKey); } catch {}
    toast.success(`Added: ${name}`);
  };

  // Compute result type tabs from actual data
  const resultTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of value) {
      const rt = e.resultType ?? "Unclassified";
      counts[rt] = (counts[rt] ?? 0) + 1;
    }
    return counts;
  }, [value]);
  const needsReviewCount = useMemo(() => value.filter(e => e.needsReview).length, [value]);

  // Helper: get the most recent date across main row + history
  const getLatestDate = (e: TestEntry): string => {
    const dates: string[] = [];
    const mainDate = e.collectionDate || e.date || "";
    if (mainDate) dates.push(mainDate);
    if (e.history) {
      for (const h of e.history) {
        const hDate = h.collectionDate || "";
        if (hDate) dates.push(hDate);
      }
    }
    return dates.sort().reverse()[0] ?? "";
  };

  // Helper: check if a row has any abnormal interpretation
  const hasAbnormal = (e: TestEntry): boolean => {
    const abnormalVals = ["high", "low", "abnormal", "positive", "reactive"];
    const check = (interp?: string) => !!interp && abnormalVals.some(v => interp.toLowerCase().includes(v));
    if (check(e.interpretation)) return true;
    if (e.history) return e.history.some(h => check(h.interpretation));
    return false;
  };

  // Filtered + sorted rows
  const filteredIndices = useMemo(() => {
    let rows = value.map((e, i) => ({ e, i }));

    // Tab filter
    rows = rows.filter(({ e }) => {
      if (activeResultTypeTab !== "all" && activeResultTypeTab !== "needs_review") {
        if ((e.resultType ?? "Unclassified") !== activeResultTypeTab) return false;
      }
      if (activeResultTypeTab === "needs_review" && !e.needsReview) return false;
      return true;
    });

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      rows = rows.filter(({ e }) => (e.name ?? "").toLowerCase().includes(q));
    }

    // Abnormal only filter
    if (showAbnormalOnly) {
      rows = rows.filter(({ e }) => hasAbnormal(e));
    }

    // Date range filter — check main date AND all history dates
    if (dateFilterFrom || dateFilterTo) {
      rows = rows.filter(({ e }) => {
        const allDates: string[] = [];
        const mainDate = e.collectionDate || e.date || "";
        if (mainDate) allDates.push(mainDate);
        if (e.history) {
          for (const h of e.history) {
            const hDate = h.collectionDate || "";
            if (hDate) allDates.push(hDate);
          }
        }
        return allDates.some(d => {
          if (dateFilterFrom && d < dateFilterFrom) return false;
          if (dateFilterTo && d > dateFilterTo) return false;
          return true;
        });
      });
    }

    // Sort
    if (sortMode === "az") {
      rows = [...rows].sort((a, b) => (a.e.name ?? "").localeCompare(b.e.name ?? ""));
    } else if (sortMode === "za") {
      rows = [...rows].sort((a, b) => (b.e.name ?? "").localeCompare(a.e.name ?? ""));
    } else if (sortMode === "newest") {
      rows = [...rows].sort((a, b) => getLatestDate(b.e).localeCompare(getLatestDate(a.e)));
    } else if (sortMode === "oldest") {
      rows = [...rows].sort((a, b) => getLatestDate(a.e).localeCompare(getLatestDate(b.e)));
    }
        // "entry" = original order, no sort
    return rows;
  }, [value, activeResultTypeTab, dateFilterFrom, dateFilterTo, searchQuery, showAbnormalOnly, sortMode]);
  // Pagination derived values
  const totalFilteredCount = filteredIndices.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedIndices = filteredIndices.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const handleImport = (rows: ImportedLabRow[]) => {
    // Start with a copy of the current test list
    const updated: TestEntry[] = [...value];
    const toAppend: TestEntry[] = [];
    const duplicateWarnings: string[] = [];

    for (const r of rows) {
      const interp = r.interpretation ||
        (r.value && r.referenceRange ? autoInterpret(r.value, r.referenceRange) : "") ||
        undefined;

      const newHistoryEntry: TestHistoryEntry = {
        result: r.value,
        unit: r.unit || undefined,
        collectionDate: r.collectionDate || undefined,
        reportDate: r.reportDate || undefined,
        referenceRange: r.referenceRange || undefined,
        interpretation: interp,
        fileKey: r.sourceFileKey,
        fileUrl: r.sourceFileUrl,
        fileName: r.sourceFileName,
        filePassword: r.sourceFilePassword,
      };

      const newEntry: TestEntry = {
        name: r.testName,
        date: r.collectionDate ? r.collectionDate.slice(0, 7) : "",
        result: r.value,
        unit: r.unit || undefined,
        referenceRange: r.referenceRange || undefined,
        collectionDate: r.collectionDate || undefined,
        reportDate: r.reportDate || undefined,
        interpretation: interp,
        fileKey: r.sourceFileKey,
        fileUrl: r.sourceFileUrl,
        fileName: r.sourceFileName,
        filePassword: r.sourceFilePassword,
        // Stage 2B: preserve result type metadata from AI extraction
        resultType: (r as any).resultType || undefined,
        extraFields: (r as any).extraFields || undefined,
        suggestedModule: (r as any).suggestedModule || undefined,
        dictionaryId: (r as any).dictionaryId || undefined,
        analyteGroup: (r as any).analyteGroup || undefined,
        orderType: (r as any).orderType || undefined,
        needsReview: (r as any).needsReview || undefined,
        reviewReason: (r as any).reviewReason || undefined,
        // Preserve the original name from the source file (before dictionary matching)
        sourceTestName: (r as any).originalExtractedName || undefined,
      };

      // Match against ALL existing rows (predefined + AI-added + manual)
      // Priority: 1) dictionaryId match (most reliable), 2) canonical name match, 3) fuzzy name match
      const importedDictId = (r as any).dictionaryId;
      const importedCanonical = (r as any).matchedTestName ?? r.testName;
      const existingIdx = updated.findIndex(t => {
        // 1. Match by dictionaryId (most reliable — same test even if names differ slightly)
        if (importedDictId && t.dictionaryId && t.dictionaryId === importedDictId) return true;
        // 2. Match by canonical name (case-insensitive)
        if (importedCanonical && t.name.toLowerCase() === importedCanonical.toLowerCase()) return true;
        // 3. Match by raw AI name (case-insensitive)
        if (t.name.toLowerCase() === r.testName.toLowerCase()) return true;
        // 4. Fuzzy: strip spaces/punctuation and compare (catches "Neutrophil%" vs "Neutrophil %")
        const strip = (s: string) => s.toLowerCase().replace(/[\s\-_\.%#]/g, "");
        if (strip(t.name) === strip(r.testName)) return true;
        if (importedCanonical && strip(t.name) === strip(importedCanonical)) return true;
        return false;
      });

      if (existingIdx !== -1) {
        // Found a matching row — apply history logic regardless of isMatched flag
        const existing = updated[existingIdx];

        if (!existing.result || existing.result.trim() === "") {
          // Empty row — fill it
          updated[existingIdx] = { ...existing, ...newEntry, name: existing.name };
          continue;
        }

        // Row already has a value — check for duplicate
        const existingDate = existing.collectionDate || existing.date || "";
        const newDate = r.collectionDate || "";
        const sameDate = existingDate && newDate && existingDate === newDate;
        const sameValue = existing.result.trim() === r.value.trim();

        if (sameDate && sameValue) {
          duplicateWarnings.push(r.testName);
          continue;
        }

        const existingTs = existingDate ? new Date(existingDate).getTime() : 0;
        const newTs = newDate ? new Date(newDate).getTime() : 0;
        const existingHistory: TestHistoryEntry[] = existing.history ?? [];

        if (!newDate || newTs >= existingTs) {
          const oldHistoryEntry: TestHistoryEntry = {
            result: existing.result,
            unit: existing.unit,
            collectionDate: existing.collectionDate,
            reportDate: existing.reportDate,
            referenceRange: existing.referenceRange,
            interpretation: existing.interpretation,
            fileKey: existing.fileKey,
            fileUrl: existing.fileUrl,
            fileName: existing.fileName,
            filePassword: existing.filePassword,
          };
          updated[existingIdx] = {
            ...existing,
            ...newEntry,
            name: existing.name, // preserve existing canonical name
            history: [oldHistoryEntry, ...existingHistory],
          };
        } else {
          updated[existingIdx] = {
            ...existing,
            history: [...existingHistory, newHistoryEntry],
          };
        }
        continue;
      }

      // No match found in existing rows — also check within this import batch
      const strip = (s: string) => s.toLowerCase().replace(/[\s\-_\.%#]/g, "");
      const batchIdx = toAppend.findIndex(t => {
        if (importedDictId && t.dictionaryId && t.dictionaryId === importedDictId) return true;
        if (importedCanonical && t.name.toLowerCase() === importedCanonical.toLowerCase()) return true;
        if (t.name.toLowerCase() === r.testName.toLowerCase()) return true;
        if (strip(t.name) === strip(r.testName)) return true;
        if (importedCanonical && strip(t.name) === strip(importedCanonical)) return true;
        return false;
      });

      if (batchIdx !== -1) {
        // Same test appeared multiple times in the imported PDF — group into history
        const batchExisting = toAppend[batchIdx];
        const batchDate = batchExisting.collectionDate || batchExisting.date || "";
        const newDate = r.collectionDate || "";
        const sameDate = batchDate && newDate && batchDate === newDate;
        const sameValue = batchExisting.result.trim() === r.value.trim();

        if (sameDate && sameValue) {
          duplicateWarnings.push(r.testName);
          continue;
        }

        const batchTs = batchDate ? new Date(batchDate).getTime() : 0;
        const newTs2 = newDate ? new Date(newDate).getTime() : 0;
        const batchHistory: TestHistoryEntry[] = batchExisting.history ?? [];

        if (!newDate || newTs2 >= batchTs) {
          // New entry is newer — promote it to main, push old to history
          const oldHistEntry: TestHistoryEntry = {
            result: batchExisting.result,
            unit: batchExisting.unit,
            collectionDate: batchExisting.collectionDate,
            reportDate: batchExisting.reportDate,
            referenceRange: batchExisting.referenceRange,
            interpretation: batchExisting.interpretation,
            fileKey: batchExisting.fileKey,
            fileUrl: batchExisting.fileUrl,
            fileName: batchExisting.fileName,
            filePassword: batchExisting.filePassword,
          };
          toAppend[batchIdx] = {
            ...batchExisting,
            ...newEntry,
            name: batchExisting.name,
            history: [oldHistEntry, ...batchHistory],
          };
        } else {
          // New entry is older — push to history
          toAppend[batchIdx] = {
            ...batchExisting,
            history: [...batchHistory, newHistoryEntry],
          };
        }
        continue;
      }

      toAppend.push(newEntry);
    }

    if (duplicateWarnings.length > 0) {
      toast.warning(`Skipped ${duplicateWarnings.length} exact duplicate(s): ${duplicateWarnings.join(", ")}`);
    }

    onChange([...updated, ...toAppend]);
  };

  return (
    <div className="space-y-1">
      <LabImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
        existingTestNames={value.map(t => t.name).filter(Boolean)}
        draftKey={importDraftKey}
      />
      {/* Stage 2B: Add Test Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>Add Lab Test</span>
              {addModalDictEntry?.resultType && (
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${RESULT_TYPE_COLORS[addModalDictEntry.resultType as keyof typeof RESULT_TYPE_COLORS] ?? "bg-gray-100 text-gray-700"}`}>
                  {addModalDictEntry.resultType}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Test Name Autocomplete */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Test Name</label>
              <LabTestAutocomplete
                value={addModalDictEntry?.canonicalName || addModalRawName}
                onSelect={(entry, rawName) => {
                  setAddModalDictEntry(entry);
                  setAddModalRawName(rawName ?? "");
                  // Reset fields when test changes
                  if (entry) {
                    // Matched dictionary entry — clear custom result type
                    setCustomResultType("");
                  } else {
                    // Raw/unknown text — clear dict entry, keep custom result type if already set
                    // (don't reset customResultType so user doesn't lose their selection while typing)
                  }
                  setAddModalFields({});
                }}
                placeholder="Search test name..."
                autoFocus
                enableDictionarySubmit
              />
              {addModalDictEntry && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {addModalDictEntry.category && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{addModalDictEntry.category}</span>}
                  {addModalDictEntry.specimen && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{addModalDictEntry.specimen}</span>}
                  {addModalDictEntry.abbreviation && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{addModalDictEntry.abbreviation}</span>}
                </div>
              )}
            {/* Custom test banner — shown when user typed a name not in dictionary */}
            {!addModalDictEntry && addModalRawName.trim() && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                <span className="text-base mt-0.5">⚠️</span>
                <div>
                  <span className="font-semibold">Custom test: </span>
                  <span className="italic">"{addModalRawName.trim()}"</span>
                  <span className="ml-1 text-amber-700">— not found in dictionary. Please select a Result Type below.</span>
                </div>
              </div>
            )}
            {/* Submit to Dictionary button — always visible when user typed a name but hasn't selected from dictionary */}
            {!addModalDictEntry && addModalRawName.trim() && (
              <button
                type="button"
                disabled={submittingToDict.has(-1) || submittedToDict.has(addModalRawName.trim().toLowerCase())}
                className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-60 transition-colors w-full justify-center"
                onClick={async () => {
                  const name = addModalRawName.trim();
                  if (!name) return;
                  setSubmittingToDict(prev => new Set(prev).add(-1));
                  try {
                    await submitPendingMutation.mutateAsync({ rawName: name });
                    setSubmittedToDict(prev => new Set(prev).add(name.toLowerCase()));
                    toast.success(`"${name}" submitted for dictionary review`, { description: 'It will appear in the dictionary once approved by an admin.' });
                  } catch (e: any) {
                    toast.error('Failed to submit to dictionary', { description: e?.message || 'Please try again.' });
                  } finally {
                    setSubmittingToDict(prev => { const n = new Set(prev); n.delete(-1); return n; });
                  }
                }}
              >
                {submittingToDict.has(-1) ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : submittedToDict.has(addModalRawName.trim().toLowerCase()) ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {submittedToDict.has(addModalRawName.trim().toLowerCase())
                  ? 'Submitted to Dictionary ✓'
                  : 'Submit to Dictionary + Use as custom test'}
              </button>
            )}
            </div>
            {/* Dynamic Result Fields */}
            {addModalDictEntry?.resultType ? (
              <ResultTypeFields
                resultType={addModalDictEntry.resultType}
                fields={addModalFields}
                onChange={setAddModalFields}
                commonUnits={addModalDictEntry.commonUnits}
                unitOptions={getUnitsForTest(addModalDictEntry.canonicalName || "")}
              />
            ) : addModalRawName.trim() ? (
              // Custom/unknown test — require Result Type first
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Result Type <span className="text-destructive">*</span>
                  </label>
                  <Select value={customResultType} onValueChange={v => { setCustomResultType(v); setAddModalFields({}); }}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select result type (required)…" />
                    </SelectTrigger>
                    <SelectContent>
                      {RESULT_TYPE_OPTIONS.map(rt => (
                        <SelectItem key={rt} value={rt}>{rt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!customResultType && (
                    <p className="text-[11px] text-orange-600">You must select a result type before adding this test.</p>
                  )}
                </div>
                {customResultType && (
                  <ResultTypeFields
                    resultType={customResultType as import("./LabTestAutocomplete").ResultType}
                    fields={addModalFields}
                    onChange={setAddModalFields}
                    commonUnits=""
                    unitOptions={getUnitsForTestOrCommon(addModalRawName.trim())}
                  />
                )}
              </div>
            ) : null}
            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Collection Date</label>
                <input
                  type="date"
                  value={addModalDate}
                  max={todayISO()}
                  onChange={ev => {
                    const v = ev.target.value;
                    if (v && isFutureDate(v)) { toast.error("Cannot select a future date."); return; }
                    setAddModalDate(v);
                  }}
                  className="h-9 text-sm border rounded-md px-3 bg-background w-full focus:outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Report Date</label>
                <input
                  type="date"
                  value={addModalReportDate}
                  max={todayISO()}
                  onChange={ev => {
                    const v = ev.target.value;
                    if (v && isFutureDate(v)) { toast.error("Cannot select a future date."); return; }
                    setAddModalReportDate(v);
                  }}
                  className="h-9 text-sm border rounded-md px-3 bg-background w-full focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            {/* Source / Lab name field */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Source / Lab Name <span className="text-muted-foreground/60">(optional)</span></label>
              <input
                type="text"
                value={addModalSource}
                onChange={ev => setAddModalSource(ev.target.value)}
                placeholder="e.g. Central Lab, Hospital ABC..."
                className="h-9 text-sm border rounded-md px-3 bg-background w-full focus:outline-none focus:border-primary"
              />
            </div>
            {/* ── Report / Attachment upload ── */}
            {onFileUpload && (
              <div className="space-y-2 border rounded-md p-3 bg-muted/30">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" /> Report / Attachment <span className="text-muted-foreground/60">(optional)</span></label>
                {addModalFileUrl ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <a href={normaliseFileUrl(addModalFileUrl)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                        <FileText className="h-3.5 w-3.5" />
                        {addModalFileName || "Attached file"}
                      </a>
                      <button type="button" onClick={() => { setAddModalFileUrl(undefined); setAddModalFileKey(undefined); setAddModalFileName(undefined); }} className="p-0.5 rounded text-red-400 hover:text-red-600"><X className="h-3 w-3" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground">File tag/label</label>
                        <input type="text" value={addModalFileTag} onChange={ev => setAddModalFileTag(ev.target.value)} placeholder="e.g. LabResult-01" className="h-7 text-xs border rounded px-2 bg-background w-full focus:outline-none focus:border-primary" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Document password (if protected)</label>
                        <input type="text" value={addModalFilePassword} onChange={ev => setAddModalFilePassword(ev.target.value)} placeholder="optional" className="h-7 text-xs border rounded px-2 bg-background w-full focus:outline-none focus:border-primary" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 rounded px-3 py-1.5 bg-blue-50 hover:bg-blue-100 transition-colors">
                      {addModalFileUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                      {addModalFileUploading ? "Uploading..." : "Attach file"}
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="hidden" disabled={addModalFileUploading} onChange={ev => {
                        const f = ev.target.files?.[0];
                        if (f && onFileUpload) {
                          setAddModalFileUploading(true);
                          // Use a temporary index -1 to trigger upload; get result back via callback
                          const tempEntry: TestEntry = { name: "__temp__", date: "", result: "" };
                          onFileUpload(-1, f, [tempEntry], (updated) => {
                            const u = updated[0];
                            setAddModalFileUrl(u?.fileUrl);
                            setAddModalFileKey(u?.fileKey);
                            setAddModalFileName(u?.fileName || f.name);
                            setAddModalFileTag(prev => prev || `LabResult-01`);
                            setAddModalFileUploading(false);
                          });
                        }
                        ev.target.value = "";
                      }} />
                    </label>
                    <span className="text-[10px] text-muted-foreground">PDF, JPG, PNG, DOC</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setShowAddModal(false); try { localStorage.removeItem(addModalDraftKey); } catch {} }}>Cancel</Button>
            <Button type="button" onClick={handleAddModalSave} disabled={!addModalDictEntry && (!addModalRawName.trim() || !customResultType)}>
              Add Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Details / Edit Row modal ── */}
      <Dialog open={editRowIndex !== null} onOpenChange={open => { if (!open) { setEditRowIndex(null); setEditRowData(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editRowData?.name || "Test Details"}
              {editRowData?.resultType && (
                <span className={`ml-2 text-xs font-normal px-1.5 py-0.5 rounded ${RESULT_TYPE_COLORS[editRowData.resultType as keyof typeof RESULT_TYPE_COLORS] ?? "bg-muted text-muted-foreground"}`}>{editRowData.resultType}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          {editRowData && (
            <div className="space-y-3 text-sm">
              {/* Result Type reclassification — always shown, especially useful for Unclassified/custom/Needs Review */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">
                  Result Type
                  {(!editRowData.resultType || editRowData.resultType === "Unclassified" || editRowData.needsReview) && (
                    <span className="ml-1 text-orange-500 text-[10px] font-normal">(required for proper fields)</span>
                  )}
                </Label>
                <Select
                  value={editRowData.resultType || ""}
                  onValueChange={v => setEditRowData(d => d ? { ...d, resultType: v, needsReview: false, reviewReason: undefined } : d)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select result type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {RESULT_TYPE_OPTIONS.map(rt => (
                      <SelectItem key={rt} value={rt}>{rt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Dynamic result fields based on selected resultType */}
              {editRowData.resultType && RESULT_TYPE_OPTIONS.includes(editRowData.resultType) ? (
                <ResultTypeFields
                  resultType={editRowData.resultType as import("./LabTestAutocomplete").ResultType}
                  fields={editRowData.resultType === "Molecular/PCR" ? {
                    // PCR: restore all PCR-specific fields from extraFields
                    value: editRowData.extraFields?.viralLoad || "",
                    unit: editRowData.extraFields?.viralLoadUnit || editRowData.unit || "",
                    detected: editRowData.extraFields?.detected === "true" ? true : editRowData.extraFields?.detected === "false" ? false : (editRowData.result === "Detected" ? true : editRowData.result === "Not Detected" ? false : undefined),
                    ctValue: editRowData.extraFields?.ctValue || "",
                    genotype: editRowData.extraFields?.genotype || "",
                    interpretation: editRowData.interpretation || "",
                    referenceRange: editRowData.referenceRange || "",
                  } : {
                    value: editRowData.result || "",
                    unit: editRowData.unit || "",
                    referenceRange: editRowData.referenceRange || "",
                    interpretation: editRowData.interpretation || "",
                    qualResult: editRowData.result || "",
                    detected: editRowData.result === "Detected" ? true : editRowData.result === "Not Detected" ? false : undefined,
                    ctValue: editRowData.extraFields?.ctValue || "",
                    genotype: editRowData.extraFields?.genotype || "",
                    growth: editRowData.result === "Growth" ? true : editRowData.result === "No Growth" ? false : undefined,
                    organism: editRowData.extraFields?.organism || "",
                    antibiogram: editRowData.extraFields?.antibiogram || "",
                    conclusion: editRowData.extraFields?.conclusion || "",
                    notes: editRowData.result || "",
                    diagnosis: editRowData.result || "",
                    report: editRowData.result || "",
                  }}
                  onChange={fields => {
                    // Map ResultFields back to TestEntry
                    const rt = editRowData.resultType;
                    let newResult = editRowData.result;
                    if (rt === "Quantitative" || rt === "Therapeutic Drug Monitoring") {
                      newResult = fields.value ?? "";
                    } else if (rt === "Qualitative") {
                      newResult = fields.qualResult ?? "";
                    } else if (rt === "Molecular/PCR") {
                      newResult = fields.detected !== undefined ? (fields.detected ? "Detected" : "Not Detected") : (fields.value ?? "");
                    } else if (rt === "Genetic") {
                      newResult = fields.genotype ?? "";
                    } else if (rt === "Microbiology Culture") {
                      newResult = fields.growth !== undefined ? (fields.growth ? "Growth" : "No Growth") : "";
                    } else if (rt === "Microscopy/Parasitology") {
                      newResult = fields.seen !== undefined ? (fields.seen ? "Seen" : "Not Seen") : "";
                    } else if (rt === "Pathology/Biopsy") {
                      newResult = fields.diagnosis ?? "";
                    } else if (rt === "Descriptive/Report") {
                      newResult = fields.conclusion ?? fields.report ?? "";
                    } else {
                      newResult = fields.value ?? fields.notes ?? "";
                    }
                    setEditRowData(d => d ? {
                      ...d,
                      result: newResult,
                      unit: fields.unit || d.unit,
                      referenceRange: fields.referenceRange || d.referenceRange,
                      interpretation: fields.interpretation || d.interpretation,
                      extraFields: {
                        ...(d.extraFields || {}),
                        ...(fields.ctValue !== undefined ? { ctValue: fields.ctValue } : {}),
                        ...(fields.genotype !== undefined ? { genotype: fields.genotype } : {}),
                        ...(rt === "Molecular/PCR" && fields.value !== undefined ? { viralLoad: fields.value } : {}),
                        ...(rt === "Molecular/PCR" && fields.unit ? { viralLoadUnit: fields.unit } : {}),
                        ...(rt === "Molecular/PCR" && fields.detected !== undefined ? { detected: String(fields.detected) } : {}),
                        ...(fields.organism !== undefined ? { organism: fields.organism } : {}),
                        ...(fields.antibiogram !== undefined ? { antibiogram: fields.antibiogram } : {}),
                        ...(fields.conclusion !== undefined ? { conclusion: fields.conclusion } : {}),
                      },
                    } : d);
                  }}
                  commonUnits=""
                  unitOptions={getUnitsForTestOrCommon(editRowData.name || "")}
                />
              ) : (
                /* Fallback: plain result + interpretation fields for unknown/unclassified types */
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Result</Label>
                    <input
                      value={editRowData.result}
                      onChange={ev => setEditRowData(d => d ? { ...d, result: ev.target.value } : d)}
                      className="w-full mt-0.5 px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Unit</Label>
                    <input
                      value={editRowData.unit || ""}
                      onChange={ev => setEditRowData(d => d ? { ...d, unit: ev.target.value } : d)}
                      className="w-full mt-0.5 px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Reference Range</Label>
                    <input
                      value={editRowData.referenceRange || ""}
                      onChange={ev => setEditRowData(d => d ? { ...d, referenceRange: ev.target.value } : d)}
                      className="w-full mt-0.5 px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Interpretation</Label>
                    <select
                      value={editRowData.interpretation || ""}
                      onChange={ev => setEditRowData(d => d ? { ...d, interpretation: ev.target.value } : d)}
                      className="w-full mt-0.5 px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">—</option>
                      <option value="Normal">Normal</option>
                      <option value="High">High</option>
                      <option value="Low">Low</option>
                      <option value="Abnormal">Abnormal</option>
                      <option value="Borderline">Borderline</option>
                      <option value="Positive">Positive</option>
                      <option value="Negative">Negative</option>
                      <option value="Reactive">Reactive</option>
                      <option value="Non-Reactive">Non-Reactive</option>
                      <option value="Detected">Detected</option>
                      <option value="Not Detected">Not Detected</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Dates — always shown */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Collection Date</Label>
                  <input
                    type="date"
                    value={editRowData.collectionDate || ""}
                    onChange={ev => setEditRowData(d => d ? { ...d, collectionDate: ev.target.value } : d)}
                    className="w-full mt-0.5 px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Report Date</Label>
                  <input
                    type="date"
                    value={editRowData.reportDate || ""}
                    onChange={ev => setEditRowData(d => d ? { ...d, reportDate: ev.target.value } : d)}
                    className="w-full mt-0.5 px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Source / Lab Name field */}
              <div>
                <Label className="text-xs text-muted-foreground">Source / Lab Name</Label>
                <input
                  type="text"
                  value={editRowData.extraFields?.source || ""}
                  onChange={ev => setEditRowData(d => d ? { ...d, extraFields: { ...(d.extraFields||{}), source: ev.target.value } } : d)}
                  placeholder="e.g. Central Lab, Hospital ABC..."
                  className="w-full mt-0.5 px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Report / Attachment */}
              {onFileUpload && (
                <div className="space-y-2 border rounded-md p-3 bg-muted/30">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" /> Report / Attachment <span className="text-muted-foreground/60">(optional)</span></label>
                  {editRowData.fileUrl ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <a href={normaliseFileUrl(editRowData.fileUrl)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                          <FileText className="h-3.5 w-3.5" />
                          {editRowData.fileName || "Attached file"}
                        </a>
                        <button type="button" onClick={() => setEditRowData(d => d ? { ...d, fileUrl: undefined, fileKey: undefined, fileName: undefined } : d)} className="p-0.5 rounded text-red-400 hover:text-red-600"><X className="h-3 w-3" /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground">File tag/label</label>
                          <input type="text" value={editRowData.fileTag || ""} onChange={ev => setEditRowData(d => d ? { ...d, fileTag: ev.target.value } : d)} placeholder="e.g. LabResult-01" className="h-7 text-xs border rounded px-2 bg-background w-full focus:outline-none focus:border-primary" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Document password (if protected)</label>
                          <input type="text" value={editRowData.filePassword || ""} onChange={ev => setEditRowData(d => d ? { ...d, filePassword: ev.target.value } : d)} placeholder="optional" className="h-7 text-xs border rounded px-2 bg-background w-full focus:outline-none focus:border-primary" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 rounded px-3 py-1.5 bg-blue-50 hover:bg-blue-100 transition-colors w-fit">
                      <Paperclip className="h-3.5 w-3.5" /> Attach file
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="hidden" onChange={ev => {
                        const f = ev.target.files?.[0];
                        if (f && onFileUpload && editRowIndex !== null) {
                          onFileUpload(editRowIndex, f, value, (updated) => {
                            const u = updated[editRowIndex];
                            setEditRowData(d => d ? { ...d, fileUrl: u?.fileUrl, fileKey: u?.fileKey, fileName: u?.fileName || f.name, fileTag: d.fileTag || "LabResult-01" } : d);
                          });
                        }
                        ev.target.value = "";
                      }} />
                    </label>
                  )}
                </div>
              )}
              {/* History summary */}
              {(editRowData.history?.length ?? 0) > 0 && (
                <div className="border rounded p-2 bg-muted/30">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Previous Results ({editRowData.history!.length})</p>
                  <div className="space-y-1">
                    {editRowData.history!.map((h, hi) => (
                      <div key={hi} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium">{h.result}{h.unit ? ` ${h.unit}` : ""}</span>
                        {h.interpretation && <span className={`px-1 rounded text-[10px] ${h.interpretation === "Normal" ? "bg-green-100 text-green-700" : h.interpretation === "High" || h.interpretation === "Low" || h.interpretation === "Abnormal" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}>{h.interpretation}</span>}
                        {h.collectionDate && <span>{h.collectionDate}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="destructive" size="sm" onClick={() => { if (editRowIndex !== null) { remove(editRowIndex); setEditRowIndex(null); setEditRowData(null); } }}>
              Delete
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setEditRowIndex(null); setEditRowData(null); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => {
              if (editRowIndex !== null && editRowData) {
                const updated = [...value];
                updated[editRowIndex] = editRowData;
                onChange(updated);
                setEditRowIndex(null);
                setEditRowData(null);
                toast.success("Test updated");
              }
            }}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Duplicate Conflict Resolution Dialog ── */}
      <Dialog open={duplicateConflict !== null} onOpenChange={open => { if (!open) setDuplicateConflict(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-amber-500">⚠️</span>
              Duplicate Test Detected
            </DialogTitle>
          </DialogHeader>
          {duplicateConflict && (() => {
            const existing = value[duplicateConflict.existingIdx];
            const pending = duplicateConflict.pending;
            return (
              <div className="space-y-4 py-1">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{pending.name}</span> already exists in this patient's test list.
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs border rounded p-2 bg-muted/30">
                  <div>
                    <p className="font-semibold text-muted-foreground mb-0.5">Existing</p>
                    <p>{existing.result || "(no result)"}{existing.unit ? ` ${existing.unit}` : ""}</p>
                    {existing.collectionDate && <p className="text-muted-foreground">{existing.collectionDate}</p>}
                  </div>
                  <div>
                    <p className="font-semibold text-muted-foreground mb-0.5">New</p>
                    <p>{pending.result || "(no result)"}{pending.unit ? ` ${pending.unit}` : ""}</p>
                    {pending.collectionDate && <p className="text-muted-foreground">{pending.collectionDate}</p>}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">How would you like to handle this?</p>
                <div className="flex flex-col gap-2">
                  {/* Option 1: Add to history of existing row */}
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start h-auto py-2 px-3 text-left"
                    onClick={() => {
                      const updated = [...value];
                      const ex = updated[duplicateConflict.existingIdx];
                      const histEntry: TestHistoryEntry = {
                        result: pending.result,
                        unit: pending.unit,
                        collectionDate: pending.collectionDate,
                        reportDate: pending.reportDate,
                        referenceRange: pending.referenceRange,
                        interpretation: pending.interpretation,
                      };
                      updated[duplicateConflict.existingIdx] = {
                        ...ex,
                        history: [...(ex.history ?? []), histEntry],
                      };
                      onChange(updated);
                      // Auto-expand history so user can see the newly added entry
                      setExpandedHistory(h => ({ ...h, [duplicateConflict.existingIdx]: true }));
                      setDuplicateConflict(null);
                      setShowAddModal(false);
                      toast.success(`Added to history of: ${pending.name} — expand ↓ to view`);
                    }}
                  >
                    <div>
                      <p className="font-medium text-sm">Add under existing test (history)</p>
                      <p className="text-xs text-muted-foreground">Keeps the existing result as the main row, adds new result to history.</p>
                    </div>
                  </Button>
                  {/* Option 2: Replace existing */}
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start h-auto py-2 px-3 text-left"
                    onClick={() => {
                      const updated = [...value];
                      const ex = updated[duplicateConflict.existingIdx];
                      const oldHistEntry: TestHistoryEntry = {
                        result: ex.result,
                        unit: ex.unit,
                        collectionDate: ex.collectionDate,
                        reportDate: ex.reportDate,
                        referenceRange: ex.referenceRange,
                        interpretation: ex.interpretation,
                      };
                      updated[duplicateConflict.existingIdx] = {
                        ...ex,
                        ...pending,
                        name: ex.name, // preserve canonical name
                        history: [oldHistEntry, ...(ex.history ?? [])],
                      };
                      onChange(updated);
                      setDuplicateConflict(null);
                      setShowAddModal(false);
                      toast.success(`Updated: ${pending.name}`);
                    }}
                  >
                    <div>
                      <p className="font-medium text-sm">Replace / update existing result</p>
                      <p className="text-xs text-muted-foreground">New result becomes the main row. Old result is moved to history.</p>
                    </div>
                  </Button>
                  {/* Option 3: Add as completely new row */}
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start h-auto py-2 px-3 text-left"
                    onClick={() => {
                      onChange([...value, duplicateConflict.pending]);
                      setDuplicateConflict(null);
                      setShowAddModal(false);
                      toast.success(`Added as new row: ${duplicateConflict.pending.name}`);
                    }}
                  >
                    <div>
                      <p className="font-medium text-sm">Add as new dated result (separate row)</p>
                      <p className="text-xs text-muted-foreground">Creates a new independent row. Use this for tests repeated on different dates.</p>
                    </div>
                  </Button>
                  {/* Option 4: Cancel */}
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => setDuplicateConflict(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── History Entry Edit Modal ── */}
      <Dialog open={histEditTarget !== null} onOpenChange={open => { if (!open) { setHistEditTarget(null); setHistEditUploading(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit History Entry</DialogTitle></DialogHeader>
          {histEditTarget && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Result</Label>
                  <input type="text" value={histEditTarget.data.result} onChange={ev => setHistEditTarget(t => t ? { ...t, data: { ...t.data, result: ev.target.value } } : t)} className="w-full mt-0.5 px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Unit</Label>
                  <input type="text" value={histEditTarget.data.unit || ""} onChange={ev => setHistEditTarget(t => t ? { ...t, data: { ...t.data, unit: ev.target.value } } : t)} className="w-full mt-0.5 px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Reference Range</Label>
                  <input type="text" value={histEditTarget.data.referenceRange || ""} onChange={ev => setHistEditTarget(t => t ? { ...t, data: { ...t.data, referenceRange: ev.target.value } } : t)} className="w-full mt-0.5 px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Interpretation</Label>
                  <select value={histEditTarget.data.interpretation || ""} onChange={ev => setHistEditTarget(t => t ? { ...t, data: { ...t.data, interpretation: ev.target.value } } : t)} className="w-full mt-0.5 px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="">—</option>
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Low">Low</option>
                    <option value="Abnormal">Abnormal</option>
                    <option value="Borderline">Borderline</option>
                    <option value="Positive">Positive</option>
                    <option value="Negative">Negative</option>
                    <option value="Detected">Detected</option>
                    <option value="Not Detected">Not Detected</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Collection Date</Label>
                  <input type="date" value={histEditTarget.data.collectionDate || ""} onChange={ev => setHistEditTarget(t => t ? { ...t, data: { ...t.data, collectionDate: ev.target.value } } : t)} className="w-full mt-0.5 px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Report Date</Label>
                  <input type="date" value={histEditTarget.data.reportDate || ""} onChange={ev => setHistEditTarget(t => t ? { ...t, data: { ...t.data, reportDate: ev.target.value } } : t)} className="w-full mt-0.5 px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>
              {/* File attachment for history entry */}
              {onFileUpload && (
                <div className="space-y-2 border rounded-md p-3 bg-muted/30">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" /> Report / Attachment</label>
                  {histEditTarget.data.fileUrl ? (
                    <div className="flex items-center gap-2">
                      <a href={normaliseFileUrl(histEditTarget.data.fileUrl)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                        <FileText className="h-3.5 w-3.5" />{histEditTarget.data.fileName || "Attached file"}
                      </a>
                      <button type="button" onClick={() => setHistEditTarget(t => t ? { ...t, data: { ...t.data, fileUrl: undefined, fileKey: undefined, fileName: undefined } } : t)} className="p-0.5 rounded text-red-400 hover:text-red-600"><X className="h-3 w-3" /></button>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 rounded px-3 py-1.5 bg-blue-50 hover:bg-blue-100 transition-colors w-fit">
                      {histEditUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                      {histEditUploading ? "Uploading..." : "Attach file"}
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="hidden" disabled={histEditUploading} onChange={ev => {
                        const f = ev.target.files?.[0];
                        if (f && onFileUpload) {
                          setHistEditUploading(true);
                          const tempList: TestEntry[] = [{ name: "__hist__", date: "", result: "" }];
                          onFileUpload(0, f, tempList, (updated) => {
                            const u = updated[0];
                            setHistEditTarget(t => t ? { ...t, data: { ...t.data, fileUrl: u?.fileUrl, fileKey: u?.fileKey, fileName: u?.fileName || f.name } } : t);
                            setHistEditUploading(false);
                          });
                        }
                        ev.target.value = "";
                      }} />
                    </label>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setHistEditTarget(null); setHistEditUploading(false); }}>Cancel</Button>
            <Button size="sm" onClick={() => {
              if (histEditTarget) {
                const { rowIdx, histIdx, data } = histEditTarget;
                const newHistory = (value[rowIdx].history ?? []).map((hh, hIdx) => hIdx === histIdx ? data : hh);
                const rows = [...value];
                rows[rowIdx] = { ...rows[rowIdx], history: newHistory };
                onChange(rows);
                setHistEditTarget(null);
                setHistEditUploading(false);
                toast.success("History entry updated");
              }
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Duplicate Detection Banner ── */}
      {duplicateGroups.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-1">
          <span className="text-amber-500 text-sm mt-0.5">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-800">{duplicateGroups.length} duplicate test group{duplicateGroups.length > 1 ? "s" : ""} detected — these can be merged</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {duplicateGroups.map(g => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => {
                    setShowAdvancedTools(true);
                    setSelectedRows(new Set(g.indices));
                  }}
                  className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300"
                >
                  {g.name} ({g.indices.length}×)
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvancedTools(v => !v)}
            className="shrink-0 text-[10px] font-medium text-amber-700 hover:text-amber-900 underline"
          >
            {showAdvancedTools ? "Hide tools" : "Open tools"}
          </button>
        </div>
      )}

      {/* ── Always-visible toolbar: search, sort, filter, bulk actions ── */}
      {value.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-muted/20 border border-border/30 rounded-md px-3 py-2 mb-1">
          {/* Search */}
          <div className="relative flex items-center">
            <Search className="absolute left-2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search test..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="h-7 pl-6 pr-2 text-[11px] border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary w-36"
            />
            {searchQuery && (
              <button type="button" onClick={() => { setSearchQuery(""); setCurrentPage(1); }} className="absolute right-1.5 text-muted-foreground hover:text-foreground text-xs">✕</button>
            )}
          </div>
          {/* Sort */}
          <div className="flex items-center gap-1">
            <select
              value={sortMode}
              onChange={e => { setSortMode(e.target.value as typeof sortMode); setCurrentPage(1); }}
              className="h-7 px-1.5 text-[11px] border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="entry">Entry order</option>
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
          {/* Abnormal toggle */}
          <button
            type="button"
            onClick={() => { setShowAbnormalOnly(v => !v); setCurrentPage(1); }}
            className={`flex items-center gap-1 h-7 px-2 rounded text-[11px] font-medium border transition-colors ${
              showAbnormalOnly
                ? "bg-red-100 text-red-700 border-red-300"
                : "bg-muted/40 text-muted-foreground border-border/40 hover:bg-muted"
            }`}
            title="Show only abnormal results"
          >
            ⚠️ Abnormal
          </button>
          <div className="w-px h-4 bg-border/60" />
          {/* Date filter */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">From:</span>
            <input
              type="date"
              value={dateFilterFrom}
              onChange={e => { setDateFilterFrom(e.target.value); setCurrentPage(1); }}
              className="h-7 px-1.5 text-[11px] border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">To:</span>
            <input
              type="date"
              value={dateFilterTo}
              onChange={e => { setDateFilterTo(e.target.value); setCurrentPage(1); }}
              className="h-7 px-1.5 text-[11px] border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {(dateFilterFrom || dateFilterTo) && (
            <button type="button" onClick={() => { setDateFilterFrom(""); setDateFilterTo(""); setCurrentPage(1); }} className="text-[10px] text-muted-foreground hover:text-foreground underline">Clear</button>
          )}
          {/* Bulk actions — shown when rows are selected */}
          {selectedRows.size > 0 && (
            <>
              <div className="w-px h-4 bg-border/60" />
              <span className="text-[11px] font-medium text-primary">{selectedRows.size} selected</span>
              <button
                type="button"
                onClick={() => {
                  if (selectedRows.size < 2) { toast.info("Select at least 2 rows to merge."); return; }
                  const indices = Array.from(selectedRows).sort((a, b) => a - b);
                  const primaryIdx = indices[0];
                  const updated = [...value];
                  const primary = { ...updated[primaryIdx] };
                  const historyEntries: TestHistoryEntry[] = [...(primary.history ?? [])];
                  for (let k = 1; k < indices.length; k++) {
                    const other = updated[indices[k]];
                    historyEntries.push({ result: other.result, unit: other.unit, collectionDate: other.collectionDate, reportDate: other.reportDate, referenceRange: other.referenceRange, interpretation: other.interpretation, fileKey: other.fileKey, fileUrl: other.fileUrl, fileName: other.fileName, filePassword: other.filePassword });
                    if (other.history) historyEntries.push(...other.history);
                  }
                  historyEntries.sort((a, b) => { const da = a.collectionDate ? new Date(a.collectionDate).getTime() : 0; const db = b.collectionDate ? new Date(b.collectionDate).getTime() : 0; return db - da; });
                  primary.history = historyEntries;
                  const toRemove = new Set(indices.slice(1));
                  const newValue = updated.map((t, idx) => idx === primaryIdx ? primary : t).filter((_, idx) => !toRemove.has(idx));
                  onChange(newValue);
                  setSelectedRows(new Set());
                  setExpandedHistory(h => ({ ...h, [primaryIdx]: true }));
                  toast.success(`Merged ${indices.length} rows into 1.`);
                }}
                className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-600 text-white hover:bg-blue-700"
              >Merge</button>
              <button
                type="button"
                onClick={() => { const newValue = value.filter((_, idx) => !selectedRows.has(idx)); onChange(newValue); setSelectedRows(new Set()); toast.success(`Deleted ${selectedRows.size} row(s).`); }}
                className="px-2 py-0.5 rounded text-[11px] font-medium bg-red-600 text-white hover:bg-red-700"
              >Delete</button>
              <button type="button" onClick={() => setSelectedRows(new Set())} className="text-[10px] text-muted-foreground hover:text-foreground underline">Clear</button>
            </>
          )}
        </div>
      )}

      {/* Stage 2B: Result Type tabs filter */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 pb-1">
          <button
            type="button"
            onClick={() => { setActiveResultTypeTab("all"); setCurrentPage(1); }}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors border ${
              activeResultTypeTab === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/40 text-muted-foreground border-border/40 hover:bg-muted"
            }`}
          >
            All ({value.length})
          </button>
          {needsReviewCount > 0 && (
            <button
              type="button"
              onClick={() => { setActiveResultTypeTab("needs_review"); setCurrentPage(1); }}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors border ${
                activeResultTypeTab === "needs_review"
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100"
              }`}
            >
              ⚠️ Needs Review ({needsReviewCount})
            </button>
          )}
          {Object.entries(resultTypeCounts).map(([rt, count]) => (
            <button
              key={rt}
              type="button"
              onClick={() => { setActiveResultTypeTab(rt); setCurrentPage(1); }}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors border ${
                activeResultTypeTab === rt
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-muted/30 text-muted-foreground border-border/30 hover:bg-muted"
              }`}
            >
              {rt} ({count})
            </button>
          ))}
        </div>
      )}
      {/* Scrollable desktop table */}
      {value.length > 0 && (
        <div className="hidden md:block overflow-x-auto rounded-md border border-border/40">
          {/* Header */}
          {activeResultTypeTab === "needs_review" && (
            <div className="bg-orange-50/60 border-b border-orange-200/60 px-3 py-2 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-medium text-orange-700 flex-1">⚠️ These results need your attention before saving. Use the action buttons to Confirm, Set Type, or Skip each row.</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {Object.keys(aiSuggestions).length > 0 && (
                  <button
                    type="button"
                    onClick={acceptAllHighConfidence}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-green-600 text-white hover:bg-green-700 whitespace-nowrap"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Accept All High Confidence
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSuggestTypes}
                  disabled={aiSuggestLoading}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60 whitespace-nowrap"
                >
                  {aiSuggestLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {aiSuggestLoading ? 'Analyzing...' : '✨ AI Suggest Types'}
                </button>
              </div>
            </div>
          )}
          {/* Compute column config based on active tab */}
          {(() => {
            const isQual = activeResultTypeTab === "Qualitative";
            const isPCR = activeResultTypeTab === "Molecular/PCR";
            const isCulture = activeResultTypeTab === "Microbiology Culture";
            const isReview = activeResultTypeTab === "needs_review";
            const hideUnitRef = isQual || isPCR || isCulture;
            const gridCols = isReview
              ? "16px 200px 80px 100px 130px 120px 140px 140px 240px 220px"
              : hideUnitRef
              ? "16px 200px 140px 120px 140px 140px 240px"
              : "16px 200px 80px 100px 130px 120px 140px 140px 240px";
            const headers = isReview
              ? ["", "Test Name", "Value", "Unit", "Ref. Range", "Interpretation", "Collection Date", "Report Date", "Report", "Actions"]
              : hideUnitRef
              ? ["", "Test Name", isPCR ? "Result / Viral Load" : isCulture ? "Growth / Organism" : "Result", "Interpretation", "Collection Date", "Report Date", "Report"]
              : ["", "Test Name", "Value", "Unit", "Ref. Range", "Interpretation", "Collection Date", "Report Date", "Report"];
            return (
              <div className="grid gap-0 bg-muted/40 border-b border-border/40" style={{gridTemplateColumns: gridCols}}>
                {headers.map((h, idx) => (
                  <span key={idx} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-2">{h}</span>
                ))}
              </div>
            );
          })()}
          {/* Rows */}
          {paginatedIndices.map(({ e, i }) => {
            const unitOptions = getUnitsForTest(e.name);
            const autoTag = `LabResult-${String(i + 1).padStart(2, "0")}`;
            const interpColor = e.interpretation === "High" ? "text-red-600 bg-red-50" : e.interpretation === "Low" ? "text-amber-600 bg-amber-50" : e.interpretation === "Normal" ? "text-green-600 bg-green-50" : "";
            return (
              <React.Fragment key={i}>
              <div className={`grid gap-0 border-b border-border/20 hover:bg-muted/20 transition-colors ${e.needsReview ? "bg-orange-50/30" : ""}`} style={{gridTemplateColumns:
                activeResultTypeTab === "needs_review" ? "16px 200px 80px 100px 130px 120px 140px 140px 240px 220px" :
                (activeResultTypeTab === "Qualitative" || activeResultTypeTab === "Molecular/PCR" || activeResultTypeTab === "Microbiology Culture") ? "16px 200px 140px 120px 140px 140px 240px" :
                "16px 200px 80px 100px 130px 120px 140px 140px 240px"}}>
                {/* Checkbox always visible + Needs Review dot */}
                <div className="flex items-center justify-center">
                  {true ? (
                    <input
                      type="checkbox"
                      checked={selectedRows.has(i)}
                      onChange={ev => {
                        setSelectedRows(prev => {
                          const next = new Set(prev);
                          if (ev.target.checked) next.add(i); else next.delete(i);
                          return next;
                        });
                      }}
                      className="w-3 h-3 cursor-pointer accent-primary"
                    />
                  ) : e.needsReview ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs max-w-[200px]">
                        <p className="font-medium text-orange-600">Needs Review</p>
                        <p className="text-muted-foreground">{e.reviewReason === "unmatched_test_name" ? "Test name not found in dictionary" : e.reviewReason === "missing_result_type" ? "Result type not classified" : "Please verify this result"}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
                <div className="px-2 py-1.5 flex flex-col gap-0.5">
                  <div className="flex items-center gap-1">
                    <input value={e.name} onChange={ev => update(i, "name", ev.target.value)} placeholder="Test name" className="bg-transparent focus:outline-none text-xs w-full border-b border-transparent focus:border-primary" />
                    {e.resultType && (
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium whitespace-nowrap ${
                        e.resultType === "Quantitative" ? "bg-blue-100 text-blue-700" :
                        e.resultType === "Qualitative" ? "bg-green-100 text-green-700" :
                        e.resultType === "Molecular/PCR" ? "bg-purple-100 text-purple-700" :
                        e.resultType === "Genetic" ? "bg-violet-100 text-violet-700" :
                        e.resultType === "Microbiology Culture" ? "bg-orange-100 text-orange-700" :
                        e.resultType === "Semen Analysis" ? "bg-teal-100 text-teal-700" :
                        e.resultType === "Semen DNA" ? "bg-indigo-100 text-indigo-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>{e.resultType}</span>
                    )}
                  </div>
                  {e.sourceTestName && (
                    <span className="text-[10px] text-muted-foreground leading-tight pl-0.5" title="Original name from source file">
                      Original name: {e.sourceTestName}
                    </span>
                  )}
                </div>
                <div className="px-2 py-1.5 flex flex-col gap-0.5 justify-center">
                  {/* Qualitative tab: show dropdown for result */}
                  {activeResultTypeTab === "Qualitative" ? (
                    <select
                      value={e.result}
                      onChange={ev => update(i, "result", ev.target.value)}
                      className="text-xs w-full bg-transparent focus:outline-none border-b border-transparent focus:border-primary cursor-pointer"
                    >
                      <option value="">—</option>
                      <option value="Positive">Positive</option>
                      <option value="Negative">Negative</option>
                      <option value="Reactive">Reactive</option>
                      <option value="Non-Reactive">Non-Reactive</option>
                      <option value="Detected">Detected</option>
                      <option value="Not Detected">Not Detected</option>
                      <option value="Equivocal">Equivocal</option>
                      {e.result && !["Positive","Negative","Reactive","Non-Reactive","Detected","Not Detected","Equivocal"].includes(e.result) && (
                        <option value={e.result}>{e.result}</option>
                      )}
                    </select>
                  ) : activeResultTypeTab === "Microbiology Culture" ? (
                    /* Culture tab: show growth + organism */
                    <div className="flex flex-col gap-0.5">
                      <select
                        value={e.result}
                        onChange={ev => update(i, "result", ev.target.value)}
                        className="text-xs w-full bg-transparent focus:outline-none border-b border-transparent focus:border-primary cursor-pointer"
                      >
                        <option value="">—</option>
                        <option value="No Growth">No Growth</option>
                        <option value="Growth">Growth</option>
                        <option value="Positive">Positive</option>
                        <option value="Negative">Negative</option>
                        {e.result && !["No Growth","Growth","Positive","Negative"].includes(e.result) && (
                          <option value={e.result}>{e.result}</option>
                        )}
                      </select>
                      {e.extraFields?.organism && (
                        <span className="text-[9px] text-orange-600 leading-tight">🦠 {e.extraFields.organism}</span>
                      )}
                      {e.extraFields?.antibiogram && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-[9px] text-orange-600 leading-tight cursor-help">ABG ℹ️</span>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="text-xs max-w-[250px] whitespace-pre-wrap">{e.extraFields.antibiogram}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  ) : activeResultTypeTab === "Molecular/PCR" ? (
                    /* PCR tab: show result + viral load + ct value */
                    <div className="flex flex-col gap-0.5">
                      <select
                        value={e.result}
                        onChange={ev => update(i, "result", ev.target.value)}
                        className="text-xs w-full bg-transparent focus:outline-none border-b border-transparent focus:border-primary cursor-pointer"
                      >
                        <option value="">—</option>
                        <option value="Detected">Detected</option>
                        <option value="Not Detected">Not Detected</option>
                        <option value="Positive">Positive</option>
                        <option value="Negative">Negative</option>
                        {e.result && !["Detected","Not Detected","Positive","Negative"].includes(e.result) && (
                          <option value={e.result}>{e.result}</option>
                        )}
                      </select>
                      {e.extraFields?.viralLoad && (
                        <span className="text-[9px] text-purple-600 leading-tight">VL: {e.extraFields.viralLoad}{e.extraFields.viralLoadUnit ? ` ${e.extraFields.viralLoadUnit}` : ""}</span>
                      )}
                      {e.extraFields?.ctValue && (
                        <span className="text-[9px] text-purple-600 leading-tight">Ct: {e.extraFields.ctValue}</span>
                      )}
                      {e.extraFields?.genotype && (
                        <span className="text-[9px] text-purple-600 leading-tight">Genotype: {e.extraFields.genotype}</span>
                      )}
                      {e.interpretation && (
                        <span className={`text-[9px] font-medium leading-tight ${
                          e.interpretation === "Abnormal" || e.interpretation === "High" || e.interpretation === "Critical" ? "text-red-600" :
                          e.interpretation === "Normal" ? "text-green-600" :
                          e.interpretation === "Borderline" ? "text-amber-600" :
                          "text-muted-foreground"
                        }`}>{e.interpretation}</span>
                      )}
                    </div>
                  ) : (
                    /* Default: plain text input with extra fields */
                    <>
                      <input value={e.result} onChange={ev => update(i, "result", ev.target.value)} placeholder="—" className="bg-transparent focus:outline-none text-xs w-full border-b border-transparent focus:border-primary" />
                      {e.extraFields && (
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          {e.extraFields.viralLoad && (
                            <span className="text-[9px] text-purple-600 leading-tight">VL: {e.extraFields.viralLoad}{e.extraFields.viralLoadUnit ? ` ${e.extraFields.viralLoadUnit}` : ""}</span>
                          )}
                          {e.extraFields.ctValue && (
                            <span className="text-[9px] text-purple-600 leading-tight">Ct: {e.extraFields.ctValue}</span>
                          )}
                          {e.extraFields.genotype && (
                            <span className="text-[9px] text-purple-600 leading-tight">Genotype: {e.extraFields.genotype}</span>
                          )}
                          {e.extraFields.organism && (
                            <span className="text-[9px] text-orange-600 leading-tight">🦠 {e.extraFields.organism}</span>
                          )}
                          {e.extraFields.antibiogram && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[9px] text-orange-600 leading-tight cursor-help truncate max-w-[70px]">ABG ℹ️</span>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="text-xs max-w-[250px] whitespace-pre-wrap">{e.extraFields.antibiogram}</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                {/* Unit cell — hidden for Qualitative/PCR/Culture tabs */}
                {!(activeResultTypeTab === "Qualitative" || activeResultTypeTab === "Molecular/PCR" || activeResultTypeTab === "Microbiology Culture") && (
                  <div className="px-2 py-1.5 flex items-center">
                    {unitOptions.length > 1 ? (
                      <Select value={e.unit ?? ""} onValueChange={v => updateUnit(i, v)}>
                        <SelectTrigger className="h-6 text-xs border-0 border-b border-transparent hover:border-border px-0 rounded-none shadow-none"><SelectValue placeholder="unit" /></SelectTrigger>
                        <SelectContent>{unitOptions.map(u => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <input value={e.unit ?? ""} onChange={ev => update(i, "unit", ev.target.value)} placeholder="unit" className="bg-transparent focus:outline-none text-xs w-full border-b border-transparent focus:border-primary" />
                    )}
                  </div>
                )}
                {/* Ref. Range cell — hidden for Qualitative/PCR/Culture tabs */}
                {!(activeResultTypeTab === "Qualitative" || activeResultTypeTab === "Molecular/PCR" || activeResultTypeTab === "Microbiology Culture") && (
                  <div className="px-2 py-1.5 flex items-center">
                    <input value={e.referenceRange ?? ""} onChange={ev => update(i, "referenceRange", ev.target.value)} placeholder="e.g. 3.5–12.5" className="bg-transparent focus:outline-none text-xs w-full border-b border-transparent focus:border-primary" />
                  </div>
                )}
                <div className="px-2 py-1.5 flex items-center">
                  <select
                    value={e.interpretation ?? ""}
                    onChange={ev => update(i, "interpretation", ev.target.value)}
                    className={`text-xs w-full bg-transparent focus:outline-none border-b border-transparent focus:border-primary cursor-pointer ${
                      e.interpretation === "High" ? "text-red-600 font-medium" :
                      e.interpretation === "Low" ? "text-amber-600 font-medium" :
                      e.interpretation === "Normal" ? "text-green-600 font-medium" :
                      "text-muted-foreground"
                    }`}
                  >
                    <option value="">—</option>
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Low">Low</option>
                    <option value="Borderline">Borderline</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
                <div className="px-2 py-1.5 flex items-center">
                  <input type="date" value={e.collectionDate ?? ""} max={todayISO()} onChange={ev => { const v = ev.target.value; if (v && isFutureDate(v)) { toast.error("You cannot select a future date. Please select a valid date."); update(i, "collectionDate", ""); return; } update(i, "collectionDate", v); }} className="h-8 text-xs border rounded-md px-2 bg-background w-full focus:outline-none focus:border-primary" />
                </div>
                <div className="px-2 py-1.5 flex items-center">
                  <input type="date" value={e.reportDate ?? ""} max={todayISO()} onChange={ev => { const v = ev.target.value; if (v && isFutureDate(v)) { toast.error("You cannot select a future date. Please select a valid date."); update(i, "reportDate", ""); return; } update(i, "reportDate", v); }} className="h-8 text-xs border rounded-md px-2 bg-background w-full focus:outline-none focus:border-primary" />
                </div>
                {/* Report column: file actions + history + edit + delete */}
                <div className="px-2 py-1.5 flex items-center gap-2 whitespace-nowrap sticky right-0 bg-background/95 z-10 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.06)] border-l border-border/20">
                  {onFileUpload && (
                    <>
                      <input
                        ref={el => { fileInputRefs.current[i] = el; }}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                        className="hidden"
                        onChange={ev => {
                          const f = ev.target.files?.[0];
                          if (f) {
                            setUploading(u => ({ ...u, [i]: true }));
                            onFileUpload(i, f, value, (v) => { onChange(v); setUploading(u => ({ ...u, [i]: false })); });
                          }
                          ev.target.value = "";
                        }}
                      />
                      {e.fileUrl ? (
                        /* ── File actions pill ── */
                        <div className="flex items-center gap-0.5 border border-border/50 rounded-lg px-1 py-0.5 bg-muted/40">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={normaliseFileUrl(e.fileUrl ?? "")}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="View attached file"
                                className="flex items-center justify-center w-8 h-8 rounded-md text-primary hover:bg-background transition-colors"
                              >
                                {uploading[i] ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                              </a>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              <p className="font-medium">{e.fileTag || autoTag}</p>
                              <p className="text-muted-foreground">{e.fileName || "Attached file"}</p>
                            </TooltipContent>
                          </Tooltip>
                          <div className="w-px h-5 bg-border/60 mx-0.5" />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="Replace file"
                                onClick={() => fileInputRefs.current[i]?.click()}
                                className="flex items-center justify-center w-8 h-8 rounded-md text-blue-500 hover:text-blue-700 hover:bg-background transition-colors"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Replace file</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="Document password (if protected)"
                                onClick={() => setExpandedPw(p => ({ ...p, [i]: !p[i] }))}
                                className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors hover:bg-background ${
                                  (expandedPw[i] || e.filePassword) ? "text-amber-500" : "text-slate-400 hover:text-slate-600"
                                }`}
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Document password (if protected)</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="Remove file"
                                onClick={() => {
                                  if (onFileRemove) onFileRemove(e.docId, i);
                                  const u2 = [...value];
                                  u2[i] = { ...u2[i], fileUrl: undefined, fileKey: undefined, fileName: undefined, fileTag: undefined, filePassword: undefined, docId: undefined };
                                  onChange(u2);
                                  setExpandedPw(p => { const n = { ...p }; delete n[i]; return n; });
                                }}
                                className="flex items-center justify-center w-8 h-8 rounded-md text-red-400 hover:text-red-600 hover:bg-background transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Remove file</TooltipContent>
                          </Tooltip>
                        </div>
                      ) : (
                        /* ── Attach button ── */
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Attach file"
                              onClick={() => fileInputRefs.current[i]?.click()}
                              disabled={uploading[i]}
                              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-dashed border-border/70 text-blue-500 hover:text-blue-700 hover:bg-muted hover:border-blue-300 transition-colors text-xs font-medium"
                            >
                              {uploading[i] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                              <span>Attach</span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">Attach report or document</TooltipContent>
                        </Tooltip>
                      )}
                    </>
                  )}
                  {/* History toggle button */}
                  {(e.history?.length ?? 0) > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={expandedHistory[i] ? "Hide previous results" : `Show ${e.history!.length} previous result${e.history!.length > 1 ? 's' : ''}`}
                          onClick={() => { setExpandedHistory(h => ({ ...h, [i]: !h[i] })); if (expandedTrend[i]) setExpandedTrend(t => ({ ...t, [i]: false })); }}
                          className={`flex items-center gap-0.5 h-8 px-2 rounded-lg text-xs font-medium transition-colors border ${
                            expandedHistory[i]
                              ? "text-primary bg-primary/10 border-primary/20"
                              : (e.history ?? []).some(h => ["high","low","abnormal","positive","reactive"].some(v => h.interpretation?.toLowerCase().includes(v)))
                                ? "text-orange-600 bg-orange-50 border-orange-200 hover:bg-orange-100"
                                : "text-muted-foreground bg-muted/40 border-border/50 hover:text-primary hover:bg-muted"
                          }`}
                        >
                          {expandedHistory[i] ? "▲" : `↓${e.history!.length}`}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {expandedHistory[i] ? "Hide previous results" : `Show ${e.history!.length} previous result${e.history!.length > 1 ? 's' : ''}`}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {/* Trend chart button — only when ≥1 history entry has a numeric result */}
                  {(e.history?.length ?? 0) > 0 && !isNaN(parseFloat(e.result ?? "")) && (e.history ?? []).some(h => !isNaN(parseFloat(h.result ?? ""))) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={expandedTrend[i] ? "Hide trend chart" : "Show trend chart"}
                          onClick={() => { setExpandedTrend(t => ({ ...t, [i]: !t[i] })); if (expandedHistory[i]) setExpandedHistory(h => ({ ...h, [i]: false })); }}
                          className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-medium transition-colors border ${
                            expandedTrend[i]
                              ? "text-indigo-600 bg-indigo-50 border-indigo-200"
                              : "text-muted-foreground bg-muted/40 border-border/50 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200"
                          }`}
                        >
                          <TrendingUp className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {expandedTrend[i] ? "Hide trend chart" : "Show trend chart"}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {/* Separator */}
                  <div className="w-px h-5 bg-border/50" />
                  {/* Edit button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Edit / View details"
                        onClick={() => { setEditRowIndex(i); setEditRowData({ ...e }); }}
                        className="flex items-center justify-center w-8 h-8 rounded-md text-blue-400 hover:text-blue-600 hover:bg-muted transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">Edit / View details</TooltipContent>
                  </Tooltip>
                  {/* Delete row button — triggers confirmation */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Delete row"
                        onClick={() => setDeleteConfirmIndex(i)}
                        className="flex items-center justify-center w-8 h-8 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">Delete row</TooltipContent>
                  </Tooltip>
                </div>
                {/* Needs Review Actions cell */}
                {activeResultTypeTab === "needs_review" && (
                  <div className="px-2 py-1.5 flex flex-col gap-1 justify-center">
                    {e.reviewReason && (
                      <span className="text-[10px] text-orange-600 font-medium">
                        {e.reviewReason === "unmatched_test_name" ? "Unknown test" :
                         e.reviewReason === "missing_result_type" ? "No result type" :
                         e.reviewReason}
                      </span>
                    )}
                    {/* AI suggestion badge */}
                    {(() => {
                      const suggestion = aiSuggestions[e.name?.toLowerCase() ?? ''];
                      if (!suggestion) return null;
                      return (
                        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border mb-1 ${
                          suggestion.confidence === 'high' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                          suggestion.confidence === 'medium' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-gray-50 text-gray-600 border-gray-200'
                        }`}>
                          <Sparkles className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate max-w-[100px]" title={suggestion.suggestedType}>{suggestion.suggestedType}</span>
                          <span className={`text-[9px] px-1 rounded ${
                            suggestion.confidence === 'high' ? 'bg-purple-100' :
                            suggestion.confidence === 'medium' ? 'bg-blue-100' : 'bg-gray-100'
                          }`}>{suggestion.confidence}</span>
                          <button
                            type="button"
                            onClick={() => acceptAiSuggestion(i, e.name)}
                            className="ml-0.5 px-1 py-0.5 rounded bg-purple-600 text-white text-[9px] font-semibold hover:bg-purple-700 whitespace-nowrap"
                          >Accept</button>
                        </div>
                      );
                    })()}
                    {/* When type is staged (AI accepted but not confirmed) — show Confirm + Confirm+Dict */}
                    {e.typeStagedForConfirm ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                          <Sparkles className="h-2.5 w-2.5 shrink-0" />
                          <span>Type set: <strong>{e.resultType}</strong> — confirm to proceed</span>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          <button
                            type="button"
                            onClick={() => confirmStagedType(i)}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 whitespace-nowrap"
                            title="Confirm type and move to the correct category"
                          >
                            <CheckCircle2 className="h-2.5 w-2.5" /> Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmStagedTypeWithDict(i)}
                            disabled={submittingToDict.has(i) || submittedToDict.has((e.name ?? '').toLowerCase())}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60 whitespace-nowrap"
                            title="Confirm type and suggest this test for the dictionary"
                          >
                            {submittingToDict.has(i) ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />}
                            Confirm + Suggest to Dictionary
                          </button>
                          <button
                            type="button"
                            onClick={() => { const u = [...value]; u[i] = { ...u[i], typeStagedForConfirm: false, resultType: undefined }; onChange(u); }}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border hover:bg-muted/80 whitespace-nowrap"
                            title="Undo the staged type"
                          >
                            Undo
                          </button>
                        </div>
                      </div>
                    ) : (
                    <div className="flex items-center gap-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => confirmReview(i)}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 whitespace-nowrap"
                        title="Accept as-is and remove from review queue"
                      >
                        <CheckCircle2 className="h-2.5 w-2.5" /> Confirm
                      </button>
                      {changingResultTypeIdx === i ? (
                        <Select onValueChange={v => { setReviewResultType(i, v); setChangingResultTypeIdx(null); }}>
                          <SelectTrigger className="h-5 text-[10px] w-[130px] border-primary/50 px-1">
                            <SelectValue placeholder="Select type…" />
                          </SelectTrigger>
                          <SelectContent>
                            {RESULT_TYPE_OPTIONS.map(rt => (
                              <SelectItem key={rt} value={rt} className="text-xs">{rt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setChangingResultTypeIdx(i)}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 whitespace-nowrap"
                          title="Assign a result type to this test"
                        >
                          Set Type
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => skipReview(i)}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border hover:bg-muted/80 whitespace-nowrap"
                        title="Remove this result from the list"
                      >
                        <SkipForward className="h-2.5 w-2.5" /> Skip
                      </button>
                    </div>
                    )}
                    {/* Submit to Dictionary + Use as custom test — only for unmatched test names */}
                    {e.reviewReason === "unmatched_test_name" && (
                      <button
                        type="button"
                        disabled={submittingToDict.has(i) || submittedToDict.has((e.name ?? '').toLowerCase())}
                        onClick={() => handleSubmitAndKeep(i, e.name ?? '')}
                        className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60 transition-colors whitespace-nowrap"
                        title="Add to patient file and submit this test name for dictionary review"
                      >
                        {submittingToDict.has(i) ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : submittedToDict.has((e.name ?? '').toLowerCase()) ? (
                          <CheckCircle2 className="h-2.5 w-2.5" />
                        ) : (
                          <Sparkles className="h-2.5 w-2.5" />
                        )}
                        {submittedToDict.has((e.name ?? '').toLowerCase())
                          ? 'Submitted ✓'
                          : 'Submit to Dictionary + Use as custom test'}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {/* Trend chart (desktop) */}
              {expandedTrend[i] && (
                <div className="col-span-full px-3 py-3 border-b border-border/20 bg-background">
                  <TestTrendChart
                    testName={e.name}
                    unit={e.unit}
                    mainResult={e.result}
                    mainDate={e.collectionDate || e.date}
                    mainInterpretation={e.interpretation}
                    mainReferenceRange={e.referenceRange}
                    history={e.history}
                  />
                </div>
              )}
              {/* History rows (desktop) */}
              {expandedHistory[i] && (e.history ?? []).map((h, hi) => {
                const hInterpColor = h.interpretation === "High" ? "text-red-600 bg-red-50" : h.interpretation === "Low" ? "text-amber-600 bg-amber-50" : h.interpretation === "Normal" ? "text-green-600 bg-green-50" : "";
                return (
                  <div key={`hist-${i}-${hi}`} className="grid gap-0 border-b border-border/10 bg-muted/30 opacity-80" style={{gridTemplateColumns:"16px 200px 80px 100px 130px 120px 140px 140px 240px"}}>
                    <div />
                    <div className="px-2 py-1 flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground italic pl-2">↳ older</span>
                      {/* Edit history entry */}
                      <button type="button" title="Edit history entry" onClick={() => setHistEditTarget({ rowIdx: i, histIdx: hi, data: { ...h } })} className="p-0.5 rounded text-blue-400 hover:text-blue-600 hover:bg-muted ml-1"><Pencil className="h-3 w-3" /></button>
                      {/* Delete history entry */}
                      <button type="button" title="Delete history entry" onClick={() => { const updated = [...value]; updated[i] = { ...updated[i], history: (updated[i].history ?? []).filter((_, idx) => idx !== hi) }; onChange(updated); }} className="p-0.5 rounded text-red-400 hover:text-red-600 hover:bg-muted"><X className="h-3 w-3" /></button>
                    </div>
                    <div className="px-2 py-1 flex items-center"><span className="text-xs text-muted-foreground">{h.result}</span></div>
                    <div className="px-2 py-1 flex items-center"><span className="text-xs text-muted-foreground">{h.unit ?? ""}</span></div>
                    <div className="px-2 py-1 flex items-center"><span className="text-xs text-muted-foreground">{h.referenceRange ?? ""}</span></div>
                    <div className="px-2 py-1 flex items-center">
                      {h.interpretation ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${hInterpColor}`}>{h.interpretation}</span> : null}
                    </div>
                    <div className="px-2 py-1 flex items-center"><span className="text-xs text-muted-foreground">{h.collectionDate ? fmtDate(h.collectionDate) : ""}</span></div>
                    <div className="px-2 py-1 flex items-center"><span className="text-xs text-muted-foreground">{h.reportDate ? fmtDate(h.reportDate) : ""}</span></div>
                    {/* REPORT column for history row — same layout as main row */}
                    <div className="px-1 py-1 flex items-center justify-end gap-0.5">
                      {h.fileUrl ? (
                        <div className="inline-flex items-center gap-0 border border-border/60 rounded-md overflow-hidden">
                          <a href={normaliseFileUrl(h.fileUrl)} target="_blank" rel="noopener noreferrer" title={h.fileName || "View file"} className="p-1.5 text-primary hover:bg-muted transition-colors"><FileText className="h-3.5 w-3.5" /></a>
                          <div className="w-px h-4 bg-border/60" />
                          {onFileUpload && (
                            <label className="cursor-pointer p-1.5 text-muted-foreground hover:text-primary hover:bg-muted transition-colors" title="Replace file">
                              <RefreshCw className="h-3.5 w-3.5" />
                              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="hidden" onChange={ev => {
                                const f = ev.target.files?.[0];
                                if (f && onFileUpload) {
                                  const tempList: TestEntry[] = [{ name: "__hist__", date: "", result: "" }];
                                  onFileUpload(0, f, tempList, (updated) => {
                                    const u = updated[0];
                                    const newHistory = (value[i].history ?? []).map((hh, hIdx) =>
                                      hIdx === hi ? { ...hh, fileUrl: u?.fileUrl, fileKey: u?.fileKey, fileName: u?.fileName || f.name } : hh
                                    );
                                    const rows = [...value];
                                    rows[i] = { ...rows[i], history: newHistory };
                                    onChange(rows);
                                  });
                                }
                                ev.target.value = "";
                              }} />
                            </label>
                          )}
                          <button type="button" title="Remove file" onClick={() => { const rows = [...value]; rows[i] = { ...rows[i], history: (rows[i].history ?? []).map((hh, hIdx) => hIdx === hi ? { ...hh, fileUrl: undefined, fileKey: undefined, fileName: undefined } : hh) }; onChange(rows); }} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ) : onFileUpload ? (
                        <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground border border-dashed border-border/60 rounded-md hover:border-primary hover:text-primary transition-colors" title="Attach file">
                          <Paperclip className="h-3 w-3" /><span>Attach</span>
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="hidden" onChange={ev => {
                            const f = ev.target.files?.[0];
                            if (f && onFileUpload) {
                              const tempList: TestEntry[] = [{ name: "__hist__", date: "", result: "" }];
                              onFileUpload(0, f, tempList, (updated) => {
                                const u = updated[0];
                                const newHistory = (value[i].history ?? []).map((hh, hIdx) =>
                                  hIdx === hi ? { ...hh, fileUrl: u?.fileUrl, fileKey: u?.fileKey, fileName: u?.fileName || f.name } : hh
                                );
                                const rows = [...value];
                                rows[i] = { ...rows[i], history: newHistory };
                                onChange(rows);
                              });
                            }
                            ev.target.value = "";
                          }} />
                        </label>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              </React.Fragment>
            );
          })}

          {/* Desktop password rows */}
          {value.map((e, i) => onFileUpload && (expandedPw[i] || e.filePassword) ? (
            <div key={`pw-${i}`} className="flex items-center gap-2 px-2 pb-1 border-b border-border/10">
              <KeyRound className="h-3 w-3 text-amber-500 shrink-0" />
              <Input type="text" placeholder="Document password (if protected)" value={e.filePassword ?? ""} onChange={ev => { const u2 = [...value]; u2[i] = { ...u2[i], filePassword: ev.target.value }; onChange(u2); }} className="h-6 text-xs flex-1" />
              {e.fileUrl && <a href={normaliseFileUrl(e.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"><ExternalLink className="h-3 w-3" />{e.fileName || "View"}</a>}
            </div>
                    ) : null)}
        </div>
      )}
      {/* Pagination controls — desktop (hidden on mobile, mobile has its own below) */}
      {totalPages > 1 && (
        <div className="hidden md:flex items-center justify-between px-2 py-1.5 border-t border-border/20 text-[11px] text-muted-foreground">
          <span>{totalFilteredCount} result{totalFilteredCount !== 1 ? 's' : ''} &bull; Page {safePage} of {totalPages}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="px-2 py-0.5 rounded border border-border/40 bg-muted/30 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >← Prev</button>
            {Array.from({ length: totalPages }, (_, idx) => idx + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                p === '...' ? (
                  <span key={`ellipsis-${idx}`} className="px-1">…</span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCurrentPage(p as number)}
                    className={`px-2 py-0.5 rounded border ${
                      safePage === p
                        ? 'border-primary bg-primary/10 text-primary font-semibold'
                        : 'border-border/40 bg-muted/30 hover:bg-muted'
                    }`}
                  >{p}</button>
                )
              )
            }
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="px-2 py-0.5 rounded border border-border/40 bg-muted/30 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >Next →</button>
          </div>
        </div>
      )}
      {/* Mobile: AI Suggest Types banner — shown when Needs Review tab is active */}
      {activeResultTypeTab === "needs_review" && (
        <div className="md:hidden bg-orange-50/60 border border-orange-200/60 rounded-md px-3 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-medium text-orange-700 flex-1 min-w-0">⚠️ These results need attention before saving.</span>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            {Object.keys(aiSuggestions).length > 0 && (
              <button
                type="button"
                onClick={acceptAllHighConfidence}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-green-600 text-white hover:bg-green-700 whitespace-nowrap"
              >
                <CheckCircle2 className="h-3 w-3" /> Accept All High Confidence
              </button>
            )}
            <button
              type="button"
              onClick={handleSuggestTypes}
              disabled={aiSuggestLoading}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60 whitespace-nowrap"
            >
              {aiSuggestLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {aiSuggestLoading ? 'Analyzing...' : '✨ AI Suggest Types'}
            </button>
          </div>
        </div>
      )}

      {/* Mobile: labeled card layout — uses filteredIndices so all filters/sort apply */}
      {paginatedIndices.map(({ e, i }) => {
        const unitOptions = getUnitsForTest(e.name);
        const autoTag = `LabResult-${String(i + 1).padStart(2, "0")}`;
        return (
          <div key={`mob-${i}`} className={`md:hidden border rounded-md px-3 py-2.5 space-y-2 ${e.needsReview ? "bg-orange-50/40 border-orange-200" : "bg-muted/20"}`}>
            {/* Row header: test name + needs-review badge + delete */}
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <input
                  value={e.name}
                  onChange={ev => update(i, "name", ev.target.value)}
                  placeholder="Test name"
                  className="bg-transparent border-b border-border focus:border-primary focus:outline-none text-sm font-medium w-full pb-0.5"
                />
                {e.sourceTestName && (
                  <span className="text-[10px] text-muted-foreground">Original name: {e.sourceTestName}</span>
                )}
              </div>
              {e.needsReview && (
                <span className="shrink-0 text-[10px] font-semibold text-orange-600 bg-orange-100 border border-orange-200 rounded px-1.5 py-0.5 whitespace-nowrap">⚠️ Review</span>
              )}
              <button type="button" aria-label="Delete row" onClick={() => setDeleteConfirmIndex(i)} className="p-1 text-muted-foreground hover:text-destructive shrink-0">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
              {/* Row 1: Value | Unit | Interpretation */}
              <div className="grid grid-cols-3 gap-x-2">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Value</span>
                  <input value={e.result} onChange={ev => update(i, "result", ev.target.value)} placeholder="—" className="h-8 bg-transparent border border-border focus:border-primary focus:outline-none rounded px-2 text-xs w-full" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Unit</span>
                  {unitOptions.length > 1 ? (
                    <Select value={e.unit ?? ""} onValueChange={v => updateUnit(i, v)}>
                      <SelectTrigger className="h-8 text-xs border-border px-2 w-full"><SelectValue placeholder="unit" /></SelectTrigger>
                      <SelectContent>{unitOptions.map(u => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <input value={e.unit ?? ""} onChange={ev => update(i, "unit", ev.target.value)} placeholder="unit" className="h-8 bg-transparent border border-border focus:border-primary focus:outline-none rounded px-2 text-xs w-full" />
                  )}
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Interpretation</span>
                  <select
                    value={e.interpretation ?? ""}
                    onChange={ev => update(i, "interpretation", ev.target.value)}
                    className={`h-8 w-full border border-border focus:border-primary focus:outline-none rounded px-2 text-xs bg-transparent cursor-pointer ${
                      e.interpretation === "High" ? "text-red-600 font-medium" :
                      e.interpretation === "Low" ? "text-amber-600 font-medium" :
                      e.interpretation === "Normal" ? "text-green-600 font-medium" :
                      "text-muted-foreground"
                    }`}
                  >
                    <option value="">— Select —</option>
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Low">Low</option>
                    <option value="Borderline">Borderline</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>
              {/* Row 2: Reference Range — full width, expandable textarea */}
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Reference Range</span>
                <textarea
                  value={e.referenceRange ?? ""}
                  onChange={ev => update(i, "referenceRange", ev.target.value)}
                  placeholder="e.g. Male: 1.4–18 IU/L&#10;Female follicular: 3.5–12.5 IU/L"
                  rows={2}
                  className="w-full bg-transparent border border-border focus:border-primary focus:outline-none rounded px-2 py-1.5 text-xs resize-y min-h-[52px]"
                />
              </div>
              {/* Collection Date + Report Date — iOS-safe 2-col grid, each exactly 50% minus gap */}
              <div className="test-card date-fields-row" style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',columnGap:'8px',width:'100%',maxWidth:'100%',overflow:'hidden',boxSizing:'border-box'}}>
                <div className="date-field date-input-wrapper" style={{minWidth:0,maxWidth:'100%',width:'100%',overflow:'hidden'}}>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Collection Date</span>
                  <input
                    type="date"
                    value={e.collectionDate ?? ""}
                    max={todayISO()}
                    onChange={ev => {
                      const v = ev.target.value;
                      if (v && isFutureDate(v)) { toast.error("You cannot select a future date. Please select a valid date."); update(i, "collectionDate", ""); return; }
                      update(i, "collectionDate", v);
                    }}
                    className="date-input border bg-background focus:outline-none focus:border-primary"
                    style={{display:'block',width:'100%',minWidth:0,maxWidth:'100%',height:'44px',padding:'0 10px',fontSize:'14px',borderRadius:'10px',boxSizing:'border-box',WebkitAppearance:'none',appearance:'none' as any}}
                  />
                </div>
                <div className="date-field date-input-wrapper" style={{minWidth:0,maxWidth:'100%',width:'100%',overflow:'hidden'}}>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Report Date</span>
                  <input
                    type="date"
                    value={e.reportDate ?? ""}
                    max={todayISO()}
                    onChange={ev => {
                      const v = ev.target.value;
                      if (v && isFutureDate(v)) { toast.error("You cannot select a future date. Please select a valid date."); update(i, "reportDate", ""); return; }
                      update(i, "reportDate", v);
                    }}
                    className="date-input border bg-background focus:outline-none focus:border-primary"
                    style={{display:'block',width:'100%',minWidth:0,maxWidth:'100%',height:'44px',padding:'0 10px',fontSize:'14px',borderRadius:'10px',boxSizing:'border-box',WebkitAppearance:'none',appearance:'none' as any}}
                  />
                </div>
              </div>
              {/* File card (mobile) */}
              {onFileUpload && (
                <>
                  <input
                    ref={el => { if (!fileInputRefs.current[i]) fileInputRefs.current[i] = el; }}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                    className="hidden"
                    onChange={ev => {
                      const f = ev.target.files?.[0];
                      if (f) { setUploading(u => ({ ...u, [i]: true })); onFileUpload(i, f, value, (v) => { onChange(v); setUploading(u => ({ ...u, [i]: false })); }); }
                      ev.target.value = "";
                    }}
                  />
                  {e.fileUrl ? (
                    <div className="border rounded-md p-2 bg-background space-y-1.5">
                      {/* Tag row */}
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <input
                          value={e.fileTag ?? autoTag}
                          onChange={ev => update(i, "fileTag", ev.target.value)}
                          className="bg-transparent text-xs font-medium text-primary flex-1 focus:outline-none border-b border-transparent focus:border-primary"
                          placeholder={autoTag}
                        />
                      </div>
                      {/* File name */}
                      <p className="text-[10px] text-muted-foreground truncate pl-5.5">{e.fileName || "Attached file"}</p>
                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-0.5">
                        <a href={normaliseFileUrl(e.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />View
                        </a>
                        <button type="button" onClick={() => fileInputRefs.current[i]?.click()} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                          <RefreshCw className="h-3 w-3" />Replace
                        </button>
                        <button type="button" onClick={() => { const u = [...value]; u[i] = { ...u[i], fileUrl: undefined, fileKey: undefined, fileName: undefined, fileTag: undefined, filePassword: undefined }; onChange(u); setExpandedPw(p => { const n = { ...p }; delete n[i]; return n; }); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive ml-auto">
                          <X className="h-3 w-3" />Delete
                        </button>
                        {/* Password button — inline with other actions */}
                        <button type="button" onClick={() => setExpandedPw(p => ({ ...p, [i]: !p[i] }))} className={`flex items-center gap-1 text-xs ${(expandedPw[i] || e.filePassword) ? "text-amber-500" : "text-muted-foreground"}`}>
                          <KeyRound className="h-3 w-3" />
                        </button>
                      </div>
                      {/* Password input — shown when expanded */}
                      {(expandedPw[i] || e.filePassword) && (
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <KeyRound className="h-3 w-3 text-amber-500 shrink-0" />
                          <Input type="text" placeholder="Document password" value={e.filePassword ?? ""} onChange={ev => update(i, "filePassword", ev.target.value)} className="h-6 text-xs flex-1" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => fileInputRefs.current[i]?.click()} disabled={uploading[i]} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-dashed border-muted-foreground/40 hover:border-primary/60 text-muted-foreground">
                        {uploading[i] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                        {uploading[i] ? "Uploading..." : "Attach file"}
                      </button>
                    </div>
                  )}
                </>
              )}
              {/* Needs Review actions (mobile) */}
              {e.needsReview && (
                <div className="border border-orange-200 rounded-md bg-orange-50/60 px-2.5 py-2 space-y-2">
                  <p className="text-[11px] font-semibold text-orange-700">
                    {e.reviewReason === "unmatched_test_name" ? "\u26a0\ufe0f Unknown test \u2014 not found in dictionary" :
                     e.reviewReason === "missing_result_type" ? "\u26a0\ufe0f Result type not classified" :
                     "\u26a0\ufe0f Needs review"}
                  </p>
                  {/* AI suggestion badge */}
                  {(() => {
                    const suggestion = aiSuggestions[e.name?.toLowerCase() ?? ''];
                    if (!suggestion) return null;
                    return (
                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium border ${
                        suggestion.confidence === 'high' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                        suggestion.confidence === 'medium' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        'bg-gray-50 text-gray-600 border-gray-200'
                      }`}>
                        <Sparkles className="h-3 w-3 shrink-0" />
                        <span className="flex-1">AI: <strong>{suggestion.suggestedType}</strong> ({suggestion.confidence})</span>
                        <button
                          type="button"
                          onClick={() => acceptAiSuggestion(i, e.name)}
                          className="px-2 py-0.5 rounded bg-purple-600 text-white text-[10px] font-semibold hover:bg-purple-700"
                        >Accept</button>
                      </div>
                    );
                  })()}
                  {/* Staged type confirmation */}
                  {e.typeStagedForConfirm ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-purple-700">Type set: <strong>{e.resultType}</strong> \u2014 confirm to proceed</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => confirmStagedType(i)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100">
                          <CheckCircle2 className="h-3 w-3" /> Confirm
                        </button>
                        <button type="button" onClick={() => confirmStagedTypeWithDict(i)}
                          disabled={submittingToDict.has(i) || submittedToDict.has((e.name ?? '').toLowerCase())}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60">
                          {submittingToDict.has(i) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          Confirm + Suggest to Dict.
                        </button>
                        <button type="button" onClick={() => { const u = [...value]; u[i] = { ...u[i], typeStagedForConfirm: false, resultType: undefined }; onChange(u); }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-muted text-muted-foreground border border-border hover:bg-muted/80">
                          Undo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => confirmReview(i)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100">
                        <CheckCircle2 className="h-3 w-3" /> Confirm
                      </button>
                      {changingResultTypeIdx === i ? (
                        <Select onValueChange={v => { setReviewResultType(i, v); setChangingResultTypeIdx(null); }}>
                          <SelectTrigger className="h-8 text-xs w-[140px] border-primary/50 px-2">
                            <SelectValue placeholder="Select type\u2026" />
                          </SelectTrigger>
                          <SelectContent>
                            {RESULT_TYPE_OPTIONS.map(rt => (
                              <SelectItem key={rt} value={rt} className="text-xs">{rt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <button type="button" onClick={() => setChangingResultTypeIdx(i)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100">
                          Set Type
                        </button>
                      )}
                      <button type="button" onClick={() => skipReview(i)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-muted text-muted-foreground border border-border hover:bg-muted/80">
                        <SkipForward className="h-3 w-3" /> Skip
                      </button>
                    </div>
                  )}
                  {/* Submit to Dictionary — only for unmatched test names */}
                  {e.reviewReason === "unmatched_test_name" && (
                    <button type="button"
                      disabled={submittingToDict.has(i) || submittedToDict.has((e.name ?? '').toLowerCase())}
                      onClick={() => handleSubmitAndKeep(i, e.name ?? '')}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60">
                      {submittingToDict.has(i) ? <Loader2 className="h-3 w-3 animate-spin" /> :
                       submittedToDict.has((e.name ?? '').toLowerCase()) ? <CheckCircle2 className="h-3 w-3" /> :
                       <Sparkles className="h-3 w-3" />}
                      {submittedToDict.has((e.name ?? '').toLowerCase()) ? 'Submitted \u2713' : 'Submit to Dictionary + Keep'}
                    </button>
                  )}
                </div>
              )}

              {/* History (mobile) — includes trend chart + action buttons per entry */}
              {(e.history?.length ?? 0) > 0 && (
                <div className="border-t border-border/30 pt-2">
                  <button
                    type="button"
                    onClick={() => setExpandedHistory(h => ({ ...h, [i]: !h[i] }))}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide">
                      {expandedHistory[i] ? "▲ Hide" : `▼ History (${e.history!.length})`}
                    </span>
                  </button>

                  {expandedHistory[i] && (
                    <>
                      {/* Trend chart — shown first if numeric values exist */}
                      {(() => {
                        const hasNumericHistory = (e.history ?? []).some(h => !isNaN(parseFloat(h.result ?? "")));
                        const mainIsNumeric = !isNaN(parseFloat(e.result ?? ""));
                        return (hasNumericHistory && mainIsNumeric) ? (
                          <div className="mt-3 mb-2">
                            <TestTrendChart
                              testName={e.name}
                              unit={e.unit}
                              mainResult={e.result}
                              mainDate={e.collectionDate}
                              mainInterpretation={e.interpretation}
                              mainReferenceRange={e.referenceRange}
                              history={e.history ?? []}
                            />
                          </div>
                        ) : null;
                      })()}

                      {/* History rows with action buttons */}
                      {(e.history ?? []).map((h, hi) => {
                        const hInterpColor = h.interpretation === "High" ? "text-red-600" : h.interpretation === "Low" ? "text-amber-600" : h.interpretation === "Normal" ? "text-green-600" : "text-muted-foreground";
                        // histAutoTag reserved for future use
                        void (`LabResult-${String(hi + 1).padStart(2, "0")}`);
                        const histFileInputId = `hist-file-${i}-${hi}`;
                        return (
                          <div key={hi} className="mt-2 pl-3 border-l-2 border-muted-foreground/20 space-y-1">
                            {/* Value + interpretation + date */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium">{h.result}{h.unit ? ` ${h.unit}` : ""}</span>
                              {h.interpretation && <span className={`text-[11px] font-medium ${hInterpColor}`}>{h.interpretation}</span>}
                              {h.collectionDate && <span className="text-[10px] text-muted-foreground">{fmtDate(h.collectionDate)}</span>}
                            </div>
                            {h.referenceRange && <p className="text-[10px] text-muted-foreground">Ref: {h.referenceRange}</p>}

                            {/* File row */}
                            {h.fileUrl ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <a href={normaliseFileUrl(h.fileUrl)} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-1">
                                  <FileText className="h-3 w-3" />                        {h.fileName || "View file"}
                                </a>
                              </div>
                            ) : null}

                            {/* Action buttons */}
                            <div className="flex items-center gap-3 pt-0.5">
                              {/* Edit */}
                              <button
                                type="button"
                                onClick={() => setHistEditTarget({ rowIdx: i, histIdx: hi, data: { ...h } })}
                                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
                              >
                                <Pencil className="h-3 w-3" />Edit
                              </button>

                              {/* Replace / Attach file */}
                              {onFileUpload && (
                                <>
                                  <input
                                    id={histFileInputId}
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                                    className="hidden"
                                    onChange={ev => {
                                      const f = ev.target.files?.[0];
                                      if (!f) return;
                                      const uploadKey = `hist-${i}-${hi}`;
                                      setUploading(u => ({ ...u, [uploadKey]: true }));
                                      onFileUpload(i, f, value, (v) => {
                                        // Move the uploaded file info into the history entry
                                        const updated = [...v];
                                        const newEntry = updated[i];
                                        const newHistory = [...(newEntry.history ?? [])];
                                        newHistory[hi] = {
                                          ...newHistory[hi],
                                          fileUrl: newEntry.fileUrl,
                                          fileKey: newEntry.fileKey,
                                          fileName: newEntry.fileName,
                                        };
                                        // Clear from main entry (it was temporarily stored there)
                                        updated[i] = { ...newEntry, history: newHistory,                                   fileUrl: undefined, fileKey: undefined, fileName: undefined, fileTag: undefined };
                                        onChange(updated);
                                        setUploading(u => ({ ...u, [uploadKey]: false }));
                                      });
                                      ev.target.value = "";
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => document.getElementById(histFileInputId)?.click()}
                                    disabled={uploading[`hist-${i}-${hi}`]}
                                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
                                  >
                                    {uploading[`hist-${i}-${hi}`] ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                    {h.fileUrl ? "Replace" : "Attach"}
                                  </button>
                                </>
                              )}

                              {/* Delete file */}
                              {h.fileUrl && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...value];
                                    const newHistory = [...(updated[i].history ?? [])];
                                    newHistory[hi] = { ...newHistory[hi], fileUrl: undefined, fileKey: undefined, fileName: undefined };
                                    updated[i] = { ...updated[i], history: newHistory };
                                    onChange(updated);
                                  }}
                                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />Remove file
                                </button>
                              )}

                              {/* Delete entry */}
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [...value];
                                  const newHistory = (updated[i].history ?? []).filter((_, idx) => idx !== hi);
                                  updated[i] = { ...updated[i], history: newHistory };
                                  onChange(updated);
                                }}
                                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive ml-auto"
                              >
                                <Trash2 className="h-3 w-3" />Delete
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
        );
      })}
            {/* Mobile pagination controls */}
      {totalPages > 1 && (
        <div className="md:hidden flex items-center justify-between px-1 py-1 text-[11px] text-muted-foreground">
          <span>{totalFilteredCount} result{totalFilteredCount !== 1 ? 's' : ''} • Page {safePage}/{totalPages}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="px-2 py-0.5 rounded border border-border/40 bg-muted/30 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >←</button>
            <span className="px-1">{safePage} / {totalPages}</span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="px-2 py-0.5 rounded border border-border/40 bg-muted/30 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >→</button>
          </div>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={openAddModal} className="gap-1.5 flex-1">
          <Plus className="h-3.5 w-3.5" /> Add {label}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="gap-1.5 border-primary/40 text-primary hover:bg-primary/5">
          <Wand2 className="h-3.5 w-3.5" /> Import via AI
        </Button>
      </div>

      {/* Delete row confirmation dialog */}
      <AlertDialog open={deleteConfirmIndex !== null} onOpenChange={open => { if (!open) setDeleteConfirmIndex(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete test entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmIndex !== null && value[deleteConfirmIndex]?.name
                ? <>Are you sure you want to delete <strong>{value[deleteConfirmIndex].name}</strong>? This action cannot be undone.</>
                : "Are you sure you want to delete this test entry? This action cannot be undone."
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmIndex(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirmIndex !== null) {
                  remove(deleteConfirmIndex);
                  setDeleteConfirmIndex(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Systemic Diseases Editor ─────────────────────────────────────────────────

function SystemicDiseasesEditor({ value, onChange }: { value: SystemicDiseases; onChange: (v: SystemicDiseases) => void }) {
  const diseases: { key: keyof SystemicDiseases; label: string }[] = [
    { key: "diabetes", label: "Diabetes" },
    { key: "hypertension", label: "Hypertension" },
    { key: "thyroid", label: "Thyroid Disorder" },
    { key: "heartDisease", label: "Heart Disease" },
    { key: "kidneyDisease", label: "Kidney Disease" },
    { key: "liverDisease", label: "Liver Disease" },
    { key: "epilepsy", label: "Epilepsy" },
    { key: "asthma", label: "Asthma" },
    { key: "anemia", label: "Anemia" },
    { key: "coagulationDisorder", label: "Coagulation Disorder" },
    { key: "autoimmune", label: "Autoimmune Disease" },
    { key: "cancer", label: "Cancer / Malignancy" },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-3">
        {diseases.map(d => (
          <CheckboxField
            key={d.key}
            label={d.label}
            checked={!!value[d.key]}
            onChange={v => onChange({ ...value, [d.key]: v })}
          />
        ))}
      </div>
      <TA label="Other (specify)" value={value.other} onChange={v => onChange({ ...value, other: v })} rows={1} placeholder="e.g. Hypertension, Hypothyroidism..." />
    </div>
  );
}

// ─── Semen Analysis Editor ────────────────────────────────────────────────────

function SemenAnalysisEditor({ value, onChange, onFileUpload, onFileRemove, onDnaFragmentationExtracted, pendingSemenFill, onPendingSemenFillApplied }: { value: SemenAnalysisEntry[]; onChange: (v: SemenAnalysisEntry[]) => void; onFileUpload?: (i: number, file: File, list: SemenAnalysisEntry[], setList: (v: SemenAnalysisEntry[]) => void) => void; onFileRemove?: (docId?: number, i?: number) => void; onDnaFragmentationExtracted?: (data: Partial<DnaFragmentationEntry>) => void; pendingSemenFill?: Partial<SemenAnalysisEntry> | null; onPendingSemenFillApplied?: () => void }) {
  const add = () => onChange([...value, { date: "", notes: "" }]);
  const remove = (i: number) => { const entry = value[i]; if (entry?.docId && onFileRemove) onFileRemove(entry.docId, i); onChange(value.filter((_, idx) => idx !== i)); };
  const update = (i: number, key: keyof SemenAnalysisEntry, val: any) => {
    const updated = [...value];
    updated[i] = { ...updated[i], [key]: val };
    onChange(updated);
  };
  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  const [extracting, setExtracting] = useState<Record<number, boolean>>({});
  const extractMutation = trpc.leads.extractSemenAnalysis.useMutation();

  // Apply pending fill from DNA section combined report
  useEffect(() => {
    if (pendingSemenFill && Object.values(pendingSemenFill).some(v => v !== "")) {
      if (value.length === 0) {
        onChange([{ date: "", notes: "", ...Object.fromEntries(Object.entries(pendingSemenFill).filter(([, v]) => v !== "")) } as SemenAnalysisEntry]);
      } else {
        const updated = [...value];
        updated[0] = { ...updated[0], ...Object.fromEntries(Object.entries(pendingSemenFill).filter(([, v]) => v !== "")) };
        onChange(updated);
      }
      onPendingSemenFillApplied?.();
    }
  }, [pendingSemenFill]);

  const handleExtract = async (i: number) => {
    const e = value[i];
    if (!e.fileUrl) { toast.error("Please upload a file first before extracting."); return; }
    setExtracting(x => ({ ...x, [i]: true }));
    try {
      const result = await extractMutation.mutateAsync({
        fileUrl: e.fileUrl,
        mimeType: e.fileName?.endsWith(".pdf") ? "application/pdf" : undefined,
        filePassword: e.filePassword || undefined,
      });
      const sa = result.semenAnalysis as Partial<SemenAnalysisEntry>;
      const updated = [...value];
      updated[i] = { ...updated[i], ...Object.fromEntries(Object.entries(sa).filter(([, v]) => v !== "")) };
      onChange(updated);
      // If DNA fragmentation data was found in the same report, pass it up
      const dna = result.dnaFragmentation as Partial<DnaFragmentationEntry> | null;
      const hasDna = dna != null && Object.values(dna).some(v => v !== "");
      if (hasDna && dna && onDnaFragmentationExtracted) {
        onDnaFragmentationExtracted(dna);
        toast.success("Semen analysis extracted. DNA Fragmentation data also found and filled below!");
      } else {
        toast.success("Semen analysis data extracted successfully!");
      }
    } catch {
      toast.error("Extraction failed. Please try again.");
    } finally {
      setExtracting(x => ({ ...x, [i]: false }));
    }
  };

  return (
    <div className="space-y-3">
      {value.map((e, i) => (
        <div key={i} className="border rounded-md p-3 space-y-2 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Analysis {i + 1}</span>
            <div className="flex items-center gap-1">
              {e.fileUrl && (
                <Button variant="outline" size="sm" className="h-6 text-xs gap-1 border-purple-300 text-purple-700 hover:bg-purple-50" onClick={() => handleExtract(i)} disabled={extracting[i]}>
                  {extracting[i] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {extracting[i] ? "Extracting..." : "Extract with AI"}
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove(i)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-3">
            <F label="Date" value={e.date} onChange={v => update(i, "date", v)} type="month" historical />
            <F label="Volume (mL)" value={e.volume ?? ""} onChange={v => update(i, "volume", v)} />
            <F label="Concentration (M/mL)" value={e.concentration ?? ""} onChange={v => update(i, "concentration", v)} />
            <F label="Total Motility (%)" value={e.totalMotility ?? ""} onChange={v => update(i, "totalMotility", v)} />
          </div>
          {/* Raw Sample - Row 2 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-3">
            <F label="Progressive Motility (%)" value={e.progressiveMotility ?? ""} onChange={v => update(i, "progressiveMotility", v)} />
            <F label="Non-Progressive Motility (%)" value={e.nonProgressiveMotility ?? ""} onChange={v => update(i, "nonProgressiveMotility", v)} />
            <F label="Immotile (%)" value={e.immotilePercent ?? ""} onChange={v => update(i, "immotilePercent", v)} />
            <F label="Morphology (%)" value={e.morphology ?? ""} onChange={v => update(i, "morphology", v)} />
          </div>
          {/* Raw Sample - Row 3 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-3">
            <F label="Leukocytes (M/mL)" value={e.leukocyteCount ?? ""} onChange={v => update(i, "leukocyteCount", v)} />
            <F label="pH" value={e.ph ?? ""} onChange={v => update(i, "ph", v)} />
            <F label="Viscosity" value={e.viscosity ?? ""} onChange={v => update(i, "viscosity", v)} />
            <F label="Appearance" value={e.appearance ?? ""} onChange={v => update(i, "appearance", v)} />
          </div>
          {/* Raw Sample - Row 4 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-3">
            <F label="Liquefaction Time (min)" value={e.liquefactionTime ?? ""} onChange={v => update(i, "liquefactionTime", v)} />
            <F label="Agglutination" value={e.agglutination ?? ""} onChange={v => update(i, "agglutination", v)} />
            <F label="Abstinence (days)" value={e.abstinenceDays ?? ""} onChange={v => update(i, "abstinenceDays", v)} />
            <F label="Lab Comment" value={e.labComment ?? ""} onChange={v => update(i, "labComment", v)} />
          </div>
          {/* Post-Preparation */}
          <div className="text-xs font-medium text-muted-foreground mt-1 border-t pt-2">After Preparation (Post-wash)</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-3">
            <F label="Preparation Method" value={e.preparationMethod ?? ""} onChange={v => update(i, "preparationMethod", v)} placeholder="e.g. PSSG, Swim-up" />
            <F label="Concentration (M/mL)" value={e.postPrepConcentration ?? ""} onChange={v => update(i, "postPrepConcentration", v)} />
            <F label="Motility (%)" value={e.postPrepMotility ?? ""} onChange={v => update(i, "postPrepMotility", v)} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-3">
            <F label="Immotile (%)" value={e.postPrepImmotile ?? ""} onChange={v => update(i, "postPrepImmotile", v)} />
            <F label="Forward Motile (%)" value={e.postPrepForwardMotile ?? ""} onChange={v => update(i, "postPrepForwardMotile", v)} />
            <F label="In-place Motile (%)" value={e.postPrepInPlaceMotile ?? ""} onChange={v => update(i, "postPrepInPlaceMotile", v)} />
            <F label="Notes" value={e.notes} onChange={v => update(i, "notes", v)} placeholder="e.g. Sample collected after 3 days abstinence..." />
          </div>
          {onFileUpload && (
            <FileAttachmentRow
              fileUrl={(e as any).expiredPlaceholder ? undefined : e.fileUrl} fileName={e.fileName} filePassword={e.filePassword}
              expiredPlaceholder={(e as any).expiredPlaceholder}
              isUploading={uploading[i]}
              onUpload={file => { setUploading(u => ({ ...u, [i]: true })); onFileUpload(i, file, value, (v) => { onChange(v); setUploading(u => ({ ...u, [i]: false })); }); }}
              onPasswordChange={pw => update(i, "filePassword", pw)}
              onRemove={onFileRemove ? () => { onFileRemove(e.docId, i); const updated = [...value]; updated[i] = { ...updated[i], fileUrl: undefined, fileKey: undefined, fileName: undefined, filePassword: undefined, docId: undefined }; onChange(updated); } : undefined}
            />
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add} className="gap-1.5 w-full">
        <Plus className="h-3.5 w-3.5" /> Add Semen Analysis
      </Button>
    </div>
  );
}

// ─── Hormone Panel Editor ─────────────────────────────────────────────────────

function HormonePanelEditor({ value, onChange, onFileUpload, onFileRemove }: { value: HormonePanelEntry[]; onChange: (v: HormonePanelEntry[]) => void; onFileUpload?: (i: number, file: File, list: HormonePanelEntry[], setList: (v: HormonePanelEntry[]) => void) => void; onFileRemove?: (docId?: number, i?: number) => void }) {
  const add = () => onChange([...value, { date: "", notes: "" }]);
  const remove = (i: number) => { const entry = value[i]; if (entry?.docId && onFileRemove) onFileRemove(entry.docId, i); onChange(value.filter((_, idx) => idx !== i)); };
  const update = (i: number, key: keyof HormonePanelEntry, val: any) => {
    const updated = [...value];
    updated[i] = { ...updated[i], [key]: val };
    onChange(updated);
  };
  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  return (
    <div className="space-y-3">
      {value.map((e, i) => (
        <div key={i} className="border rounded-md p-3 space-y-2 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Panel {i + 1}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove(i)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-3">
            <F label="Date" value={e.date} onChange={v => update(i, "date", v)} type="month" historical />
            <F label="FSH (IU/L)" value={e.fsh ?? ""} onChange={v => update(i, "fsh", v)} />
            <F label="LH (IU/L)" value={e.lh ?? ""} onChange={v => update(i, "lh", v)} />
            <F label="Testosterone (ng/dL)" value={e.testosterone ?? ""} onChange={v => update(i, "testosterone", v)} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-3">
            <F label="Prolactin (ng/mL)" value={e.prolactin ?? ""} onChange={v => update(i, "prolactin", v)} />
            <F label="TSH (mIU/L)" value={e.tsh ?? ""} onChange={v => update(i, "tsh", v)} />
            <F label="Notes" value={e.notes} onChange={v => update(i, "notes", v)} placeholder="e.g. Day 3 baseline panel..." />
          </div>
          {onFileUpload && (
            <FileAttachmentRow
              fileUrl={(e as any).expiredPlaceholder ? undefined : e.fileUrl} fileName={e.fileName} filePassword={e.filePassword}
              expiredPlaceholder={(e as any).expiredPlaceholder}
              isUploading={uploading[i]}
              onUpload={file => { setUploading(u => ({ ...u, [i]: true })); onFileUpload(i, file, value, (v) => { onChange(v); setUploading(u => ({ ...u, [i]: false })); }); }}
              onPasswordChange={pw => update(i, "filePassword", pw)}
              onRemove={onFileRemove ? () => { onFileRemove(e.docId, i); const updated = [...value]; updated[i] = { ...updated[i], fileUrl: undefined, fileKey: undefined, fileName: undefined, filePassword: undefined, docId: undefined }; onChange(updated); } : undefined}
            />
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add} className="gap-1.5 w-full">
        <Plus className="h-3.5 w-3.5" /> Add Hormone Panel
      </Button>
    </div>
  );
}

// ─── DNA Fragmentation Editor ────────────────────────────────────────────────

function DnaFragmentationEditor({ value, onChange, onFileUpload, onFileRemove, pendingFill, onPendingFillApplied, onSemenAnalysisExtracted }: { value: DnaFragmentationEntry[]; onChange: (v: DnaFragmentationEntry[]) => void; onFileUpload?: (i: number, file: File, list: DnaFragmentationEntry[], setList: (v: DnaFragmentationEntry[]) => void) => void; onFileRemove?: (docId?: number, i?: number) => void; pendingFill?: Partial<DnaFragmentationEntry> | null; onPendingFillApplied?: () => void; onSemenAnalysisExtracted?: (data: Partial<SemenAnalysisEntry>) => void }) {
  const add = () => onChange([...value, { date: "", notes: "" }]);
  const remove = (i: number) => { const entry = value[i]; if (entry?.docId && onFileRemove) onFileRemove(entry.docId, i); onChange(value.filter((_, idx) => idx !== i)); };
  const update = (i: number, key: keyof DnaFragmentationEntry, val: any) => {
    const updated = [...value];
    updated[i] = { ...updated[i], [key]: val };
    onChange(updated);
  };
  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  const [extracting, setExtracting] = useState<Record<number, boolean>>({});
  const extractMutation = trpc.leads.extractSemenAnalysis.useMutation();

  // Apply pending fill from semen analysis combined report
  useEffect(() => {
    if (pendingFill && Object.values(pendingFill).some(v => v !== "")) {
      if (value.length === 0) {
        onChange([{ date: "", notes: "", ...Object.fromEntries(Object.entries(pendingFill).filter(([, v]) => v !== "")) } as DnaFragmentationEntry]);
      } else {
        const updated = [...value];
        updated[0] = { ...updated[0], ...Object.fromEntries(Object.entries(pendingFill).filter(([, v]) => v !== "")) };
        onChange(updated);
      }
      onPendingFillApplied?.();
    }
  }, [pendingFill]);

  const handleExtract = async (i: number) => {
    const e = value[i];
    if (!e.fileUrl) { toast.error("Please upload a file first before extracting."); return; }
    setExtracting(x => ({ ...x, [i]: true }));
    try {
      const result = await extractMutation.mutateAsync({
        fileUrl: e.fileUrl,
        mimeType: e.fileName?.endsWith(".pdf") ? "application/pdf" : undefined,
        filePassword: e.filePassword || undefined,
      });
      const dna = result.dnaFragmentation as Partial<DnaFragmentationEntry>;
      const hasDnaData = dna != null && Object.values(dna).some((v) => typeof v === "string" && (v as string).trim() !== "");
      const sa = result.semenAnalysis as Partial<SemenAnalysisEntry>;
      const hasSemenData = sa != null && Object.values(sa).some((v) => typeof v === "string" && (v as string).trim() !== "");

      if (!hasDnaData) {
        if (hasSemenData) {
          // Wrong section — this is a semen analysis report
          toast.warning("This report does not contain DNA Fragmentation data. It appears to be a standard Semen Analysis report. The semen analysis data has been detected and will be filled in the Semen Analysis section above.");
          if (onSemenAnalysisExtracted) onSemenAnalysisExtracted(sa);
        } else {
          toast.warning("No DNA Fragmentation data was found in this report. Please verify you uploaded the correct file.");
        }
      } else {
        const updated = [...value];
        updated[i] = { ...updated[i], ...Object.fromEntries(Object.entries(dna).filter(([, v]) => v !== "")) };
        onChange(updated);
        if (hasSemenData && onSemenAnalysisExtracted) {
          onSemenAnalysisExtracted(sa);
          toast.success("DNA Fragmentation data extracted. Semen Analysis data was also found and filled in the Semen Analysis section!");
        } else {
          toast.success("DNA Fragmentation data extracted successfully!");
        }
      }
    } catch {
      toast.error("Extraction failed. Please try again.");
    } finally {
      setExtracting(x => ({ ...x, [i]: false }));
    }
  };

  return (
    <div className="space-y-3">
      {value.map((e, i) => (
        <div key={i} className="border rounded-md p-3 space-y-2 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">DNA Fragmentation {i + 1}</span>
            <div className="flex items-center gap-1">
              {e.fileUrl && (
                <Button variant="outline" size="sm" className="h-6 text-xs gap-1 border-purple-300 text-purple-700 hover:bg-purple-50" onClick={() => handleExtract(i)} disabled={extracting[i]}>
                  {extracting[i] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {extracting[i] ? "Extracting..." : "Extract with AI"}
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove(i)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-3">
            <F label="Date" value={e.date} onChange={v => update(i, "date", v)} type="month" historical />
            <F label="DFI (%)" value={e.dfi ?? ""} onChange={v => update(i, "dfi", v)} placeholder="DNA Fragmentation Index" />
            <F label="HDS (%)" value={e.hds ?? ""} onChange={v => update(i, "hds", v)} placeholder="High DNA Stainability" />
            <F label="Method" value={e.method ?? ""} onChange={v => update(i, "method", v)} placeholder="e.g. SCSA, TUNEL, Comet" />
          </div>
          <div className="grid grid-cols-1 gap-x-3 gap-y-3">
            <F label="Notes" value={e.notes} onChange={v => update(i, "notes", v)} placeholder="e.g. Repeat recommended in 3 months..." />
          </div>
          {onFileUpload && (
            <FileAttachmentRow
              fileUrl={(e as any).expiredPlaceholder ? undefined : e.fileUrl} fileName={e.fileName} filePassword={e.filePassword}
              expiredPlaceholder={(e as any).expiredPlaceholder}
              isUploading={uploading[i]}
              onUpload={file => { setUploading(u => ({ ...u, [i]: true })); onFileUpload(i, file, value, (v) => { onChange(v); setUploading(u => ({ ...u, [i]: false })); }); }}
              onPasswordChange={pw => update(i, "filePassword", pw)}
              onRemove={onFileRemove ? () => { onFileRemove(e.docId, i); const updated = [...value]; updated[i] = { ...updated[i], fileUrl: undefined, fileKey: undefined, fileName: undefined, filePassword: undefined, docId: undefined }; onChange(updated); } : undefined}
            />
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add} className="gap-1.5 w-full">
        <Plus className="h-3.5 w-3.5" /> Add DNA Fragmentation Test
      </Button>
    </div>
  );
}

// ─── Genetic Tests Editor ─────────────────────────────────────────────────────

const FEMALE_GENETIC_TEST_OPTIONS: { group: string; tests: string[] }[] = [
  {
    group: "Chromosomal Analysis",
    tests: ["Karyotype (Female)", "Chromosomal Microarray (CMA)", "FISH Panel", "Turner Syndrome (45,X) — Mosaic Karyotype"],
  },
  {
    group: "Carrier Screening",
    tests: [
      "Cystic Fibrosis (CFTR) Mutation",
      "Spinal Muscular Atrophy (SMA) Carrier",
      "Fragile X Premutation / Full Mutation (FMR1)",
      "Thalassemia / Hemoglobinopathy Screening",
      "Sickle Cell Trait",
      "Gaucher Disease",
      "Familial Mediterranean Fever (FMF / MEFV)",
      "Expanded Carrier Screening Panel",
    ],
  },
  {
    group: "Thrombophilia / Coagulation",
    tests: [
      "MTHFR C677T",
      "MTHFR A1298C",
      "Factor V Leiden (G1691A)",
      "Prothrombin G20210A",
      "PAI-1 4G/5G",
      "Thrombophilia Panel",
    ],
  },
  {
    group: "Hormonal / Ovarian",
    tests: ["AMH Gene Variants", "FMR1 (Premature Ovarian Insufficiency)"],
  },
  {
    group: "Hereditary Cancer",
    tests: ["BRCA1", "BRCA2", "Lynch Syndrome Panel"],
  },
  {
    group: "Immunogenetics",
    tests: ["HLA Typing", "NK Cell Activity", "Antiphospholipid Antibodies"],
  },
  {
    group: "Preimplantation Genetic Testing",
    tests: ["PGT-A (Aneuploidies)", "PGT-M (Monogenic)", "PGT-SR (Structural Rearrangements)"],
  },
  {
    group: "Comprehensive Genomic Testing",
    tests: ["WES — Whole Exome Sequencing", "WGS — Whole Genome Sequencing"],
  },
  {
    group: "Other",
    tests: ["Custom / Other (type below)"],
  },
];

const MALE_GENETIC_TEST_OPTIONS: { group: string; tests: string[] }[] = [
  {
    group: "Chromosomal Analysis",
    tests: ["Karyotype (Male)", "Chromosomal Microarray (CMA)", "FISH Panel", "Klinefelter Syndrome (47,XXY)"],
  },
  {
    group: "Azoospermia / Sperm Production",
    tests: [
      "Y Chromosome Microdeletion (AZFa)",
      "Y Chromosome Microdeletion (AZFb)",
      "Y Chromosome Microdeletion (AZFc)",
      "Y Chromosome Microdeletion Panel (AZFa/b/c)",
    ],
  },
  {
    group: "Carrier Screening",
    tests: [
      "Cystic Fibrosis (CFTR) — CBAVD",
      "Spinal Muscular Atrophy (SMA) Carrier",
      "Thalassemia / Hemoglobinopathy Screening",
      "Sickle Cell Trait",
      "Gaucher Disease",
      "Familial Mediterranean Fever (FMF / MEFV)",
      "Expanded Carrier Screening Panel",
    ],
  },
  {
    group: "Hormonal / Androgen",
    tests: ["Androgen Receptor (AR) Gene — CAG Repeat", "Kallmann Syndrome (KAL1 / FGFR1)"],
  },
  {
    group: "Hereditary Cancer",
    tests: ["BRCA1 (Paternal Risk)", "BRCA2 (Paternal Risk)", "Lynch Syndrome Panel"],
  },
  {
    group: "Immunogenetics",
    tests: ["HLA Typing"],
  },
  {
    group: "Preimplantation Genetic Testing",
    tests: ["PGT-A (Aneuploidies)", "PGT-M (Monogenic)", "PGT-SR (Structural Rearrangements)"],
  },
  {
    group: "Comprehensive Genomic Testing",
    tests: ["WES — Whole Exome Sequencing", "WGS — Whole Genome Sequencing"],
  },
  {
    group: "Other",
    tests: ["Custom / Other (type below)"],
  },
];

// Keep a combined list for backward-compat validation (existing saved values from either gender)
const ALL_GENETIC_TEST_OPTIONS = [...FEMALE_GENETIC_TEST_OPTIONS, ...MALE_GENETIC_TEST_OPTIONS];

function GeneticTestsEditor({ value, onChange, onFileUpload, onFileRemove, gender = "female", onLastEntryRemoved }: { value: GeneticTestEntry[]; onChange: (v: GeneticTestEntry[]) => void; onFileUpload?: (i: number, file: File, list: GeneticTestEntry[], setList: (v: GeneticTestEntry[]) => void) => void; onFileRemove?: (docId?: number, i?: number) => void; gender?: "female" | "male"; /** Called when the last entry is removed (female-only: resets gate to unanswered) */ onLastEntryRemoved?: () => void; }) {
  const add = () => onChange([...value, { test: "", date: "", result: "", notes: "" }]);
  const remove = (i: number) => {
    const entry = value[i];
    // Only call onFileRemove for entries that have a persisted file reference (docId + fileUrl)
    // Do not call it for blank placeholder entries — they have no storage reference
    if (entry?.docId && entry?.fileUrl && onFileRemove) onFileRemove(entry.docId, i);
    const next = value.filter((_, idx) => idx !== i);
    onChange(next);
    // Scenario E: removing the last entry returns gate to unanswered
    if (next.length === 0 && onLastEntryRemoved) onLastEntryRemoved();
  };
  const update = (i: number, key: keyof GeneticTestEntry, val: string) => {
    const updated = [...value];
    updated[i] = { ...updated[i], [key]: val };
    onChange(updated);
  };
  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  const OPTIONS = gender === "male" ? MALE_GENETIC_TEST_OPTIONS : FEMALE_GENETIC_TEST_OPTIONS;
  const ALL_TESTS = ALL_GENETIC_TEST_OPTIONS.flatMap(g => g.tests);
  return (
    <div className="space-y-2">
      {value.map((e, i) => (
        <div key={i} className="border rounded-md p-2 bg-muted/20 space-y-2">
          {/* Row 1: Test select (flex-1) + Date */}
          <div className="grid grid-cols-3 gap-x-3 gap-y-2 items-start">
            <div className="col-span-2 space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground leading-none">Test</Label>
              <Select
                value={e.test && !ALL_TESTS.includes(e.test) ? "Custom / Other (type below)" : (e.test || "")}
                onValueChange={v => update(i, "test", v === "Custom / Other (type below)" ? "" : v)}
              >
                <SelectTrigger className="h-8 text-xs w-full"><SelectValue placeholder="Select test" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {OPTIONS.map(group => (
                    <>
                      <div key={group.group} className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted/50 border-t first:border-t-0">{group.group}</div>
                      {group.tests.map(t => (
                        <SelectItem key={t} value={t} className="text-xs pl-4">{t}</SelectItem>
                      ))}
                    </>
                  ))}
                </SelectContent>
              </Select>
              {/* Show free-text input for custom tests */}
              {(e.test === "" || (e.test && !ALL_TESTS.filter(t => t !== "Custom / Other (type below)").includes(e.test))) && (
                <Input
                  className="h-7 text-xs mt-1"
                  placeholder="Describe test..."
                  value={e.test === "Custom / Other (type below)" ? "" : (e.test || "")}
                  onChange={ev => update(i, "test", ev.target.value)}
                />
              )}
            </div>
            <F label="Date" value={e.date} onChange={v => update(i, "date", v)} type="month" historical />
          </div>
          {/* Row 2: Result + Notes + Delete */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 items-end">
            <F label="Result" value={e.result} onChange={v => update(i, "result", v)} placeholder="e.g. Normal, Carrier, Positive..." />
            <div className="flex gap-1 items-end">
              <div className="flex-1"><F label="Notes" value={e.notes} onChange={v => update(i, "notes", v)} placeholder="e.g. Carrier status confirmed..." /></div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => remove(i)}>
                <X className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>
          {onFileUpload && (
            <FileAttachmentRow
              fileUrl={(e as any).expiredPlaceholder ? undefined : e.fileUrl} fileName={e.fileName} filePassword={e.filePassword}
              expiredPlaceholder={(e as any).expiredPlaceholder}
              isUploading={uploading[i]}
              onUpload={file => { setUploading(u => ({ ...u, [i]: true })); onFileUpload(i, file, value, (v) => { onChange(v); setUploading(u => ({ ...u, [i]: false })); }); }}
              onPasswordChange={pw => update(i, "filePassword", pw)}
              onRemove={onFileRemove ? () => { onFileRemove(e.docId, i); const updated = [...value]; updated[i] = { ...updated[i], fileUrl: undefined, fileKey: undefined, fileName: undefined, filePassword: undefined, docId: undefined }; onChange(updated); } : undefined}
            />
          )}
        </div>
      ))}
      {/* Show Add button: always visible for male; for female, show only when there are meaningful entries or no entries at all */}
      {(gender === "male" || value.length === 0 || value.some(e => hasMeaningfulFemaleGeneticTest(e))) && (
        <Button variant="outline" size="sm" onClick={add} className="gap-1.5 w-full">
          <Plus className="h-3.5 w-3.5" /> {gender === "female" ? getAddButtonLabel(value) : "Add Genetic Test"}
        </Button>
      )}
    </div>
  );
}

// ─── Voice AI Transcription ───────────────────────────────────────────────────

function VoiceAIFill({ onTranscribed }: { onTranscribed: (text: string) => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const transcribeMutation = trpc.medicalNotes.transcribeVoice.useMutation({
    onSuccess: (data) => {
      setIsProcessing(false);
      if (data.text) {
        onTranscribed(data.text);
        toast.success("Voice transcribed — review and apply to fields below");
      }
    },
    onError: (e) => {
      setIsProcessing(false);
      toast.error("Transcription failed: " + e.message);
    },
  });

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          setIsProcessing(true);
          transcribeMutation.mutate({ audioBase64: base64, mimeType: "audio/webm" });
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  }, [transcribeMutation]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  return (
    <div className="flex items-center gap-2">
      {isProcessing ? (
        <Button variant="outline" size="sm" disabled className="gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing...
        </Button>
      ) : isRecording ? (
        <Button variant="destructive" size="sm" onClick={stopRecording} className="gap-1.5 animate-pulse">
          <MicOff className="h-3.5 w-3.5" /> Stop Recording
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={startRecording} className="gap-1.5">
          <Mic className="h-3.5 w-3.5" /> Voice Fill
        </Button>
      )}
    </div>
  );
}

// ─── Read-only summary ────────────────────────────────────────────────────────

function DobBadge({ dob, label, variant = "identity" }: { dob: string; label: string; variant?: "identity" | "intake-unverified" }) {
  if (!dob) return null;
  const d = new Date(dob);
  const age = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  if (variant === "intake-unverified") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-700 text-sm mb-4">
        <span className="text-amber-700 dark:text-amber-400 font-medium">{label}:</span>
        <span className="font-medium">{fmtDate(d)}</span>
        <span className="text-muted-foreground">·</span>
        <span className="font-semibold text-amber-700 dark:text-amber-300">{age} years old</span>
        <span className="ml-1 text-xs text-amber-600 dark:text-amber-400 italic">(intake-entered — not verified against patient identity)</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 border border-blue-100 dark:bg-blue-900/20 dark:border-blue-800 text-sm mb-4">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{fmtDate(d)}</span>
      <span className="text-muted-foreground">·</span>
      <span className="font-semibold text-blue-700 dark:text-blue-300">{age} years old</span>
    </div>
  );
}

function ReadOnlyIntake({ intake, leadDob = "", leadGender = "female", femaleFertilityDiagnosis = [], maleFertilityDiagnosis = [], leadData, activePartnerTab, onPartnerTabChange, onSetIntakeMode, ownerName, partnerOwnerName, partnerGender, hasConflict = false }: { intake: any; leadDob?: string; leadGender?: string; femaleFertilityDiagnosis?: string[]; maleFertilityDiagnosis?: string[]; leadData?: any; activePartnerTab?: string; onPartnerTabChange?: (v: string) => void; onSetIntakeMode?: (mode: "female" | "male") => void; ownerName?: string; partnerOwnerName?: string; partnerGender?: string; hasConflict?: boolean }) {
  const artHistory: ARTCycle[] = parseJSONArray<ARTCycle>(intake?.artHistory);
  const surgicalHistory: SurgicalEntry[] = parseJSONArray<SurgicalEntry>(intake?.surgicalHistory);
  const miscarriageHistory: MiscarriageEntry[] = parseJSONArray<MiscarriageEntry>(intake?.miscarriageHistory);
  const previousTests: TestEntry[] = parseJSONArray<TestEntry>(intake?.previousTests);
  // Use null/empty fallbacks so unset fields stay undefined (not shown as defaults)
  const systemicDiseases: Partial<SystemicDiseases> = parseJSON(intake?.systemicDiseases, {} as SystemicDiseases);
  const maleIntake: Partial<MaleIntake> | null = intake?.maleIntake ? parseJSON(intake.maleIntake, null as any) : null;
  const radiologyStudies: RadiologyStudy[] = parseJSONArray<RadiologyStudy>(intake?.radiologyStudies);
  const maleRadiologyStudies: RadiologyStudy[] = parseJSONArray<RadiologyStudy>(intake?.maleRadiologyStudies);
  const patientQuestions = parseJSON(intake?.patientQuestions, {} as any);
  const doctorAnswers = parseJSON(intake?.doctorAnswers, {} as any);
  const femaleQuestions: string[] = Array.isArray(patientQuestions?.female) ? patientQuestions.female : [];
  const maleQuestions: string[] = Array.isArray(patientQuestions?.male) ? patientQuestions.male : [];
  const femaleAnswers: Record<string, string> = doctorAnswers?.female ?? {};
  const maleAnswers: Record<string, string> = doctorAnswers?.male ?? {};
  const generalAttachmentsFemale: GeneralAttachmentEntry[] = parseJSONArray<GeneralAttachmentEntry>(intake?.generalAttachmentsFemale);
  const generalAttachmentsMale: GeneralAttachmentEntry[] = parseJSONArray<GeneralAttachmentEntry>(intake?.generalAttachmentsMale);
  const maleSurgeries: SurgicalEntry[] = parseJSONArray<SurgicalEntry>(maleIntake?.previousSurgeries);
  const maleSemenAnalysis = parseJSONArray<any>(maleIntake?.semenAnalysis);
  const maleDnaFragmentation = parseJSONArray<any>(maleIntake?.dnaFragmentation);
  const malePreviousTests = parseJSONArray<TestEntry>(maleIntake?.previousTests);
  const maleGeneticTests = parseJSONArray<any>(maleIntake?.geneticTests);
  const maleDob: string = maleIntake?.dateOfBirth ? (typeof maleIntake.dateOfBirth === "string" ? maleIntake.dateOfBirth.split("T")[0] : new Date(maleIntake.dateOfBirth as any).toISOString().split("T")[0]) : "";
  const leadGenderNormalized = String(leadGender || "").toLowerCase();
  // Pagination for View Mode Previous Tests
  const VIEW_PAGE_SIZE = 15;
  const [femaleTestPage, setFemaleTestPage] = useState(1);
  const [maleTestPage, setMaleTestPage] = useState(1);
  const [partnerTestPage, setPartnerTestPage] = useState(1);
  const femaleTotalPages = Math.max(1, Math.ceil(previousTests.length / VIEW_PAGE_SIZE));
  const maleTotalPages = Math.max(1, Math.ceil(malePreviousTests.length / VIEW_PAGE_SIZE));
  const femalePagedTests = previousTests.slice((femaleTestPage - 1) * VIEW_PAGE_SIZE, femaleTestPage * VIEW_PAGE_SIZE);
  const malePagedTests = malePreviousTests.slice((maleTestPage - 1) * VIEW_PAGE_SIZE, maleTestPage * VIEW_PAGE_SIZE);
  // partnerTotalPages / partnerPagedTests: used by the collapsible Reported Partner Information section
  // For isFemaleMode records: the partner's previous tests are in malePreviousTests (maleIntake blob)
  const partnerTotalPages = Math.max(1, Math.ceil(malePreviousTests.length / VIEW_PAGE_SIZE));
  const partnerPagedTests = malePreviousTests.slice((partnerTestPage - 1) * VIEW_PAGE_SIZE, partnerTestPage * VIEW_PAGE_SIZE);
  const femaleLeadDob = leadGenderNormalized === "male" ? "" : leadDob;
  const maleLeadDob = leadGenderNormalized === "male" ? leadDob : "";
  const maleSystemicDiseases: Partial<SystemicDiseases> = parseJSON(maleIntake?.systemicDiseases, {} as SystemicDiseases);
  const maleActiveDiseases = Object.entries(maleSystemicDiseases)
    .filter(([k, v]) => k !== "other" && v === true)
    .map(([k]) => k.replace(/([A-Z])/g, " $1").trim());

  const activeDiseases = Object.entries(systemicDiseases)
    .filter(([k, v]) => k !== "other" && v === true)
    .map(([k]) => k.replace(/([A-Z])/g, " $1").trim());

  // Section visibility — only show sections that have at least one explicitly filled field
  // Boolean fields: only count when true (not when false — false is the default/unset state)
  // Enum fields (smoking/alcohol): only count when not null/undefined
  const hasGeneralInfo = !!(intake?.infertilityType || intake?.infertilityDuration || intake?.profession || intake?.marriageDate || intake?.isFirstMarriage === true || intake?.hasCivilMarriageCertificate === true || intake?.consanguinity === true || intake?.expectedVisitDate || intake?.heightCm || intake?.weightKg || intake?.bmi || (intake?.smoking && intake.smoking !== 'never') || (intake?.alcohol && intake.alcohol !== 'never') || intake?.hirsutism === true || intake?.currentMedications || intake?.allergies);
  const hasAnthropometrics = !!(intake?.heightCm || intake?.weightKg || intake?.bmi);
  // G/P/A/L: only show if at least one value is non-zero; childrenFromPreviousMarriage only if > 0
  const hasGPAL = !!(intake?.gravida != null && (Number(intake.gravida) > 0 || Number(intake.para) > 0 || Number(intake.abortus) > 0 || Number(intake.livingChildren) > 0));
  const hasObstetric = !!(hasGPAL || (intake?.childrenFromPreviousMarriage && Number(intake.childrenFromPreviousMarriage) > 0) || miscarriageHistory.length > 0);
  const hasMenstrual = !!(intake?.lastMenstrualPeriod || intake?.cycleRegularity || intake?.cycleLengthDays || intake?.menstrualFlowDays || intake?.dysmenorrhea === true);
  const hasSystemic = !!(activeDiseases.length > 0 || systemicDiseases.other);
  const hasFamilyHistory = !!(intake?.hereditaryDiseases || intake?.familyBreastCancer === true || intake?.familyEarlyMenopause === true || intake?.familyInfertility === true);
  const hasMaleGeneralInfo = !!(maleIntake?.profession || maleIntake?.heightCm || maleIntake?.weightKg || maleIntake?.bmi || (maleIntake?.smoking && maleIntake.smoking !== 'never') || (maleIntake?.alcohol && maleIntake.alcohol !== 'never') || maleIntake?.consanguinity === true || maleIntake?.currentMedications || maleIntake?.allergies || maleIntake?.isFirstMarriage === true || maleIntake?.infertilityType || maleIntake?.infertilityDuration || maleIntake?.childrenFromPreviousRelationship);
  const hasMaleFamilyHistory = !!(maleIntake?.hereditaryDiseases);

  // Lead-level intake summary fields
  const mainInterest = leadData?.mainMedicalInterest;
  const mainInterestArr: string[] = mainInterest
    ? (Array.isArray(mainInterest) ? mainInterest : (typeof mainInterest === "string" ? (mainInterest.startsWith("[") ? JSON.parse(mainInterest) : [mainInterest]) : []))
    : [];
  const OPTION_LABELS: Record<string, string> = {
    "immediately": "As soon as possible / Immediately",
    "1-2-weeks": "1–2 weeks",
    "1-month": "1 month",
    "2-months": "2 months",
    "3-months": "3 months",
    "1-3-months": "1–3 months",
    "6-months": "6 months",
    "exploring": "Exploring / Not sure",
    "never-tried": "Never tried",
    "tried-unsuccessful": "Tried before – unsuccessful",
    "tried-again": "Tried before – wants try again",
    "tried-multiple": "Tried multiple attempts",
    "ready": "Yes, I am ready to travel",
    "considering": "Considering traveling",
    "prefers-home": "Prefers home country",
    "local-patient": "Local patient",
    "ivf-icsi": "IVF With ICSI",
    "ivf_icsi": "IVF With ICSI",
    "ivf with icsi": "IVF With ICSI",
    "iui": "IUI",
    "pgt": "PGT (Preimplantation Genetic Testing)",
    "egg-freezing": "Egg Freezing",
    "egg_freezing": "Egg Freezing",
    "sperm-freezing": "Sperm Freezing",
    "embryo-freezing": "Embryo Freezing",
    "male-factor": "Male Factor",
    "recurrent-miscarriage": "Recurrent Miscarriage",
    "fertility-assessment": "Fertility Assessment",
    "local": "Local",
    "international": "International",
    "whatsapp": "WhatsApp",
    "phone-call": "Phone Call",
    "video-call": "Video Call",
    "email": "Email",
  };
  const humanizeVal = (v: string) => OPTION_LABELS[v] ?? OPTION_LABELS[v.toLowerCase()] ?? v.replace(/_/g, " ").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const hasLeadSummary = !!(mainInterestArr.length > 0 || leadData?.decisionTimeline || leadData?.ivfExperience || leadData?.travelReadiness || leadData?.budgetRange || leadData?.patientType || leadData?.preferredContactMethods?.length > 0);

  // ── Phase 2: intakeMode detection (backfill fix) ─────────────────────────────────
  // After the backfill, all old records have intakeMode = 'legacy' explicitly.
  // NULL should no longer occur for existing records.
  // If NULL appears (e.g., a record created before this fix), treat it as 'general' (needs identification).
  const intakeMode = intake?.intakeMode ?? null;
  const isLegacy = intakeMode === 'legacy'; // ONLY explicit 'legacy' — not null
  const isFemaleMode = intakeMode === 'female';
  const isMaleMode = intakeMode === 'male';
  const isGeneralMode = intakeMode === 'general' || intakeMode === null; // null = unidentified = treat as general

  return (
    <div className="space-y-4">
      {/* ── Phase 2: Mode badge / warning ─────────────────────────────────── */}
      {isLegacy && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300 text-xs">
          <span className="font-semibold">Legacy Record</span>
          <span className="text-amber-700 dark:text-amber-400">This health record was created before the female/male workflow separation. Both tabs are shown as-is.</span>
        </div>
      )}
      {isFemaleMode && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-pink-50 border border-pink-200 text-pink-800 dark:bg-pink-900/20 dark:border-pink-700 dark:text-pink-300 text-xs">
          <span className="font-semibold">Female Health Record</span>
          <span>This record contains the female patient's medical data.</span>
        </div>
      )}
      {isMaleMode && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300 text-xs">
          <span className="font-semibold">Male Health Record</span>
          <span>This record contains the male patient's medical data.</span>
        </div>
      )}
      {/* Fix C2: Passive conflict warning when gender and intakeMode disagree */}
      {(() => {
        const g = leadGenderNormalized;
        const hasGender = g === 'female' || g === 'male';
        const conflict =
          (isFemaleMode && g === 'male') ||
          (isMaleMode && g === 'female');
        if (!conflict || !hasGender) return null;
        return (
          <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-300 text-amber-900 dark:bg-amber-900/20 dark:border-amber-600 dark:text-amber-200 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <span>
              <span className="font-semibold">Health Record / Gender mismatch: </span>
              The patient gender is <span className="font-medium capitalize">{g}</span> but this Health Record is typed as <span className="font-medium capitalize">{intakeMode}</span>.
              This may need manual review. Changing the Health Record type does not automatically update the patient gender.
            </span>
          </div>
        );
      })()}
      {isGeneralMode && !hasConflict && (
        <div className="flex flex-col gap-4 px-5 py-5 rounded-lg bg-orange-50 border-2 border-orange-300 text-orange-900 dark:bg-orange-900/20 dark:border-orange-600 dark:text-orange-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-orange-600" />
            <span className="font-bold text-sm">Please identify this Health Record type before entering medical data</span>
          </div>
          <p className="text-xs text-orange-800 dark:text-orange-300">
            This record does not have a type assigned yet. Select the appropriate type to unlock the correct Health Record template.
            Legacy records (created before the workflow separation) are shown with both tabs.
          </p>
          {onSetIntakeMode && (() => {
            // Owner-only identification: this screen asks only "what gender is THIS Health Record?"
            // The linked partner is NOT part of this decision — they have their own medical_intake context.
            const gender = String(leadGender ?? '').toLowerCase();
            if (gender === 'female') {
              return (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5 border-pink-400 text-pink-700 hover:bg-pink-50 font-medium" onClick={() => onSetIntakeMode('female')}>
                    <span className="text-base">♀</span> {ownerName ? `${ownerName} — Female Health Record` : 'Female Health Record'}
                  </Button>
                </div>
              );
            }
            if (gender === 'male') {
              return (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5 border-blue-400 text-blue-700 hover:bg-blue-50 font-medium" onClick={() => onSetIntakeMode('male')}>
                    <span className="text-base">♂</span> {ownerName ? `${ownerName} — Male Health Record` : 'Male Health Record'}
                  </Button>
                </div>
              );
            }
            // Gender unknown — show both generic options without any name
            return (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1.5 border-pink-400 text-pink-700 hover:bg-pink-50 font-medium" onClick={() => onSetIntakeMode('female')}>
                  <span className="text-base">♀</span> Set as Female Health Record
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 border-blue-400 text-blue-700 hover:bg-blue-50 font-medium" onClick={() => onSetIntakeMode('male')}>
                  <span className="text-base">♂</span> Set as Male Health Record
                </Button>
              </div>
            );
          })()}
          {!onSetIntakeMode && (
            <p className="text-xs italic text-orange-700 dark:text-orange-400">Switch to edit mode to identify this record type.</p>
          )}
          <p className="text-xs text-orange-700 dark:text-orange-400 italic">
            Choosing a Health Record type does not automatically set or change the patient gender.
          </p>
        </div>
      )}
      {hasLeadSummary && (
        <SectionCard readOnly title="Intake Summary">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
            {mainInterestArr.length > 0 && (
              <InfoRow label="Main Medical Interest" value={mainInterestArr.map(humanizeVal).join(", ")} />
            )}
            {leadData?.decisionTimeline && (
              <InfoRow label="Decision Timeline" value={humanizeVal(leadData.decisionTimeline)} />
            )}
            {leadData?.ivfExperience && (
              <InfoRow label="IVF Experience" value={humanizeVal(leadData.ivfExperience)} />
            )}
            {leadData?.travelReadiness && (
              <InfoRow label="Travel Readiness" value={humanizeVal(leadData.travelReadiness)} />
            )}
            {leadData?.budgetRange && (
              <InfoRow label="Budget Range" value={humanizeVal(leadData.budgetRange)} />
            )}
            {leadData?.patientType && (
              <InfoRow label="Patient Type" value={humanizeVal(leadData.patientType)} />
            )}
            {Array.isArray(leadData?.preferredContactMethods) && leadData.preferredContactMethods.length > 0 && (
              <InfoRow label="Preferred Contact" value={leadData.preferredContactMethods.map(humanizeVal).join(", ")} />
            )}
          </div>
        </SectionCard>
      )}
    {/* Phase 2: For general mode, skip the tabs entirely — the warning banner above is sufficient */}
    {isGeneralMode ? null : (
    <Tabs value={isFemaleMode ? "female" : isMaleMode ? "male" : (activePartnerTab ?? "female")} onValueChange={isLegacy ? onPartnerTabChange : undefined}>
      {/* Only show tab switcher for legacy records */}
      {isLegacy && (
      <TabsList className="mb-4">
        <TabsTrigger value="female">Wife (Female)</TabsTrigger>
        <TabsTrigger value="male">Husband (Male)</TabsTrigger>
      </TabsList>
      )}

      <TabsContent value="female" className="space-y-4">
        {/* P2-2: Source label — shown for male-primary AND legacy records where the female tab contains reported partner data.
             For legacy records, the female tab shows female data so we don’t add a partner label there.
             The label is only meaningful when this tab is being used as the “partner data” tab, which is
             only true for male-primary records. For legacy records, both tabs are the primary data. */}
        {isMaleMode && (
          <div className="px-3 py-2.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700 dark:bg-slate-800/40 dark:border-slate-600 dark:text-slate-300 text-xs space-y-0.5">
            <p className="font-semibold">Reported Partner Information</p>
            <p>Partner information recorded during this male Health Record intake. It is stored separately from any linked partner's identity and Health Record.</p>
          </div>
        )}
        {/* P2-3: Linked-partner informational banner — shown when a partner is linked AND reported data exists */}
        {isMaleMode && partnerOwnerName && hasMeaningfulReportedPartnerData(intake, intakeMode) && (
          <div className="px-3 py-2.5 rounded-md bg-slate-100 border border-slate-300 text-slate-700 dark:bg-slate-800/60 dark:border-slate-500 dark:text-slate-300 text-xs space-y-0.5">
            <p className="font-semibold">Note: Linked partner record exists</p>
            <p>This Health Record contains partner information entered separately from the linked partner's own record. The linked partner's Health Record is the authoritative source for their medical information.</p>
          </div>
        )}
        <DobBadge dob={leadGenderNormalized === "male" ? (maleIntake?.femalePartnerDob ?? "") : femaleLeadDob} label="Date of Birth (Female)" />
        {hasGeneralInfo && (
          <SectionCard readOnly title="General Information">
            {/* Basic Info subsection */}
            {(intake?.infertilityType || intake?.infertilityDuration || intake?.profession || intake?.marriageDate || intake?.isFirstMarriage === true || intake?.hasCivilMarriageCertificate === true || intake?.consanguinity === true || intake?.expectedVisitDate) && (
              <>
                <SubSectionDivider label="Basic Information" />
                <dl className="space-y-0">
                  <InfoRow label="Infertility Type (Female)" value={intake?.infertilityType === 'primary' ? 'Primary (never conceived)' : intake?.infertilityType === 'secondary' ? 'Secondary (conceived before)' : intake?.infertilityType} />
                  <InfoRow label="Duration" value={intake?.infertilityDuration} />
                  {(intake as any)?.childrenFromPreviousMarriage != null && Number((intake as any).childrenFromPreviousMarriage) > 0 && (
                    <InfoRow label="Children (Prev. Relationship)" value={String((intake as any).childrenFromPreviousMarriage)} />
                  )}
                  <InfoRow label="Profession" value={intake?.profession} />
                  <InfoRow label="Marriage Date" value={intake?.marriageDate ? fmtDate(intake.marriageDate) : undefined} />
                  <InfoRow label="Expected Visit Date" value={intake?.expectedVisitDate ? fmtDate(intake.expectedVisitDate) : undefined} />
                  {/* F-2: Referral / Lead Source */}
                  {leadData?.leadSource && (
                    <InfoRow label="Referral / Source" value={LEAD_SOURCES[leadData.leadSource] ?? leadData.leadSource.replace(/-/g, " ")} />
                  )}
                  {intake?.isFirstMarriage === true && <InfoRow label="First Marriage" value="Yes" />}
                  {/* F-1: Show full marriageCertStatus — not just the positive boolean */}
                  {(() => {
                    const certStatus = (intake as any)?.marriageCertStatus;
                    const legacyYes = !certStatus && intake?.hasCivilMarriageCertificate === true;
                    const displayStatus = certStatus === "yes" || legacyYes ? "Yes"
                      : certStatus === "in_progress" ? "In progress"
                      : certStatus === "no" ? "No"
                      : certStatus === "not_specified" ? "Not specified"
                      : null;
                    if (!displayStatus) return null;
                    return (
                      <>
                        <InfoRow label="Marriage Certificate" value={displayStatus} />
                        {(certStatus === "yes" || legacyYes) && (intake as any)?.marriageCertFileUrl && (
                          <div className="py-1 pl-4">
                            <a
                              href={normaliseFileUrl((intake as any).marriageCertFileUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <span>{(intake as any).marriageCertFileName || "View certificate"}</span>
                            </a>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  {intake?.consanguinity === true && <InfoRow label="Consanguinity" value="Yes" />}
                </dl>
              </>
            )}
            {/* Body Measurements subsection */}
            {hasAnthropometrics && (
              <>
                <SubSectionDivider label="Body Measurements" />
                <dl className="space-y-0">
                  <InfoRow label="Height" value={intake?.heightCm ? `${intake.heightCm} cm` : undefined} />
                  <InfoRow label="Weight" value={intake?.weightKg ? `${intake.weightKg} kg` : undefined} />
                  <InfoRow label="BMI" value={intake?.bmi} />
                </dl>
              </>
            )}
            {/* Lifestyle & Habits subsection */}
            {((intake?.smoking && intake.smoking !== 'never') || (intake?.alcohol && intake.alcohol !== 'never') || intake?.hirsutism === true) && (
              <>
                <SubSectionDivider label="Lifestyle & Habits" />
                <dl className="space-y-0">
                  {intake?.smoking && intake.smoking !== 'never' && <InfoRow label="Smoking" value={intake.smoking} />}
                  {intake?.smokingPacksPerDay && <InfoRow label="Packs/Day" value={intake.smokingPacksPerDay} />}
                  {intake?.alcohol && intake.alcohol !== 'never' && <InfoRow label="Alcohol" value={intake.alcohol} />}
                  {intake?.hirsutism === true && <InfoRow label="Hirsutism" value="Yes" />}
                </dl>
              </>
            )}
            {/* Medications & Allergies subsection */}
            {(intake?.currentMedications || intake?.allergies) && (
              <>
                <SubSectionDivider label="Medications & Allergies" />
                <dl className="space-y-0">
                  <InfoRow label="Current Medications" value={intake?.currentMedications} />
                  <InfoRow label="Allergies" value={intake?.allergies} />
                </dl>
              </>
            )}
          </SectionCard>
        )}

        {hasObstetric && (
          <SectionCard readOnly title="Obstetric History">
            <dl className="space-y-0">
              {hasGPAL && <InfoRow label="G/P/A/L" value={`G${intake!.gravida} P${intake!.para ?? 0} A${intake!.abortus ?? 0} L${intake!.livingChildren ?? 0}`} />}
              {intake?.childrenFromPreviousMarriage && Number(intake.childrenFromPreviousMarriage) > 0 && <InfoRow label="Children from Previous Marriage" value={intake.childrenFromPreviousMarriage.toString()} />}
            </dl>
            {miscarriageHistory.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-muted-foreground mb-1">Miscarriage History</p>
                {miscarriageHistory.map((m, i) => (
                  <div key={i} className="text-xs border rounded p-2 mb-1 bg-muted/20 space-y-1">
                    <div>{m.date} — {m.gestationalAge} {m.notes && `(${m.notes})`}</div>
                    {/* F-3: Miscarriage file attachment */}
                    {m.fileUrl && (
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                        <a
                          href={normaliseFileUrl(m.fileUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline truncate max-w-[220px]"
                        >
                          {m.fileName || `Miscarriage-${String(i + 1).padStart(2, "0")}`}
                        </a>
                        {m.filePassword && <KeyRound className="h-3 w-3 text-amber-600 shrink-0" />}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {hasMenstrual && (
          <SectionCard readOnly title="Menstrual History">
            <dl className="space-y-0">
              <InfoRow label="Last Menstrual Period" value={intake?.lastMenstrualPeriod ? fmtDate(intake.lastMenstrualPeriod) : undefined} />
              <InfoRow label="Cycle Regularity" value={intake?.cycleRegularity} />
              <InfoRow label="Cycle Length" value={intake?.cycleLengthDays ? `${intake.cycleLengthDays} days` : undefined} />
              <InfoRow label="Flow Duration" value={intake?.menstrualFlowDays ? `${intake.menstrualFlowDays} days` : undefined} />
              {intake?.dysmenorrhea === true && <InfoRow label="Dysmenorrhea" value="Yes" />}
            </dl>
          </SectionCard>
        )}
        {/* Contraceptive History Read-Only: reads from canonical contraceptiveHistory array */}
        {(() => {
          const contraHistory = (intake as any)?.contraceptiveHistory as ContraceptiveEntry[] | null | undefined;
          const entry = Array.isArray(contraHistory) && contraHistory.length > 0 ? contraHistory[0] : null;
          if (!entry || !entry.method || entry.method === "none") return null;
          return (
            <SectionCard readOnly title="Contraceptive History">
              <dl className="space-y-0">
                <InfoRow label="Method" value={contraceptiveMethodLabel(entry.method)} />
                {entry.method === "other" && entry.notes && (
                  <InfoRow label="Method (specified)" value={entry.notes} />
                )}
                <InfoRow label="Duration of Use" value={entry.duration} />
                <InfoRow label="Stopped" value={entry.stoppedAgo} />
              </dl>
            </SectionCard>
          );
        })()}
        {femaleFertilityDiagnosis.filter(d => d !== "Male factor infertility").length > 0 && (
          <SectionCard readOnly title="Female Fertility Diagnosis">
            <div className="flex flex-wrap gap-1.5">
              {femaleFertilityDiagnosis.filter(d => d !== "Male factor infertility").map(d => (
                <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>
              ))}
            </div>
          </SectionCard>
        )}
        {hasSystemic && (
          <SectionCard readOnly title="Health Conditions">
            <dl className="space-y-0">
              {activeDiseases.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {activeDiseases.map(d => <Badge key={d} variant="destructive" className="text-xs">{d}</Badge>)}
                </div>
              )}
              {systemicDiseases.other && <InfoRow label="Other" value={systemicDiseases.other} />}
            </dl>
          </SectionCard>
        )}
        {hasFamilyHistory && (
          <SectionCard readOnly title="Family History">
            <dl className="space-y-0">
              <InfoRow label="Hereditary Diseases" value={intake?.hereditaryDiseases} />
              {intake?.familyBreastCancer === true && <InfoRow label="Family Breast Cancer" value="Yes" />}
              {intake?.familyEarlyMenopause === true && <InfoRow label="Family Early Menopause" value="Yes" />}
              {intake?.familyInfertility === true && <InfoRow label="Family Infertility" value="Yes" />}
            </dl>
          </SectionCard>
        )}
        {artHistory.length > 0 && (
          <SectionCard readOnly title="Previous Fertility Treatments">
            {artHistory.map((a, i) => {
              const safeArr = (v: unknown) => Array.isArray(v) ? v : [];
              const allEmbryos = [
                ...safeArr(a.transferredEmbryos),
                ...safeArr(a.frozenEmbryos),
                ...safeArr(a.fetEmbryos),
                ...safeArr(a.secondCollection?.transferredEmbryos),
                ...safeArr(a.secondCollection?.frozenEmbryos),
              ];
              const pgtDocs = allEmbryos.filter(e => e.pgtFileUrl);
              return (
                <div key={i} className="border rounded p-3 mb-2 bg-muted/20 text-xs space-y-1">
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="secondary">{a.type}</Badge>
                    {a.date && <span className="text-muted-foreground">{a.date}</span>}
                    {a.clinic && <span>@ {a.clinic}</span>}
                  </div>
                  {a.protocol && <div><span className="text-muted-foreground">Protocol:</span> {a.protocol}</div>}
                  {a.fetProtocol && <div><span className="text-muted-foreground">FET Protocol:</span> {a.fetProtocol}</div>}
                  {a.donorType && <div><span className="text-muted-foreground">Donor Type:</span> {a.donorType}</div>}

                  {/* Oocyte Retrieval — eggsCollected is the canonical field */}
                  {a.eggsCollected != null && (
                    <div className="pt-1 border-t border-muted/40">
                      <div className="text-muted-foreground font-medium mb-0.5">Oocyte Retrieval</div>
                      <div className="flex gap-3 flex-wrap">
                        <span><span className="text-muted-foreground">Total Retrieved:</span> {a.eggsCollected}</span>
                        {a.miiOocytes != null && <span><span className="text-muted-foreground">MII (Mature):</span> {a.miiOocytes}</span>}
                        {a.miOocytes != null && <span><span className="text-muted-foreground">MI (Immature):</span> {a.miOocytes}</span>}
                        {a.gvOocytes != null && <span><span className="text-muted-foreground">GV (Immature):</span> {a.gvOocytes}</span>}
                        {a.degeneratedOocytes != null && <span><span className="text-muted-foreground">Degenerated:</span> {a.degeneratedOocytes}</span>}
                      </div>
                    </div>
                  )}

                  {/* Fertilization — embryosFertilized is the canonical 2PN field */}
                  {(a.oocytesInseminatedOrInjected != null || a.embryosFertilized != null || a.pn1 != null || a.pn0 != null || a.pn3plus != null) && (
                    <div className="pt-1 border-t border-muted/40">
                      <div className="text-muted-foreground font-medium mb-0.5">Fertilization</div>
                      <div className="flex gap-3 flex-wrap">
                        {a.oocytesInseminatedOrInjected != null && <span><span className="text-muted-foreground">Inseminated/Injected:</span> {a.oocytesInseminatedOrInjected}</span>}
                        {a.embryosFertilized != null && <span><span className="text-muted-foreground">2PN (Normally Fertilized):</span> {a.embryosFertilized}</span>}
                        {a.pn1 != null && <span><span className="text-muted-foreground">1PN:</span> {a.pn1}</span>}
                        {a.pn0 != null && <span><span className="text-muted-foreground">0PN:</span> {a.pn0}</span>}
                        {a.pn3plus != null && <span><span className="text-muted-foreground">&ge;3PN:</span> {a.pn3plus}</span>}
                      </div>
                    </div>
                  )}

                  {/* Transfer & Frozen summary */}
                  <div className="flex gap-4 flex-wrap">
                    {(a.transferredEmbryos?.length ?? 0) > 0 && <span><span className="text-muted-foreground">Transferred:</span> {a.transferredEmbryos!.length}</span>}
                    {(a.frozenEmbryos?.length ?? 0) > 0 && <span><span className="text-muted-foreground">Frozen:</span> {a.frozenEmbryos!.length}</span>}
                    {(a.fetEmbryos?.length ?? 0) > 0 && <span><span className="text-muted-foreground">FET embryos:</span> {a.fetEmbryos!.length}</span>}
                  </div>

                  {/* FET per-embryo PGT status — uses tri-state resolvePgtTested */}
                  {a.type === "FET" && (a.fetEmbryos?.length ?? 0) > 0 && (
                    <div className="pt-1 border-t border-muted/40 space-y-0.5">
                      <span className="text-muted-foreground font-medium">Embryo PGT Status:</span>
                      {a.fetEmbryos!.map((em, ei) => {
                        const pgtResolved = em.pgtTested !== undefined
                          ? em.pgtTested
                          : (em.pgtStatus && em.pgtStatus !== "Not tested" && em.pgtStatus !== "pending")
                            ? true
                            : em.pgtStatus === "Not tested" ? false : null;
                        return (
                          <div key={ei} className="flex gap-2 items-center">
                            <span className="text-muted-foreground">Embryo {ei + 1}:</span>
                            {pgtResolved === true ? (
                              <>
                                <Badge variant="outline" className="text-xs h-4 border-green-500 text-green-700">Tested</Badge>
                                {em.pgtStatus && em.pgtStatus !== "pending" && <span className="text-muted-foreground">{em.pgtStatus}</span>}
                                {em.gender && em.gender !== "Unknown" && <span className="text-muted-foreground">{em.gender}</span>}
                              </>
                            ) : pgtResolved === false ? (
                              <Badge variant="outline" className="text-xs h-4 text-muted-foreground">Not tested</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs h-4 text-muted-foreground">Not reported</Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {a.outcome && <div><span className="text-muted-foreground">Outcome:</span> <span className="font-medium">{a.outcome}</span></div>}
                  {a.otherDescription && <div className="text-muted-foreground">{a.otherDescription}</div>}
                  {a.notes && <div className="text-muted-foreground">{a.notes}</div>}
                  {pgtDocs.length > 0 && (
                    <div className="pt-1 border-t border-muted/40 space-y-0.5">
                      <span className="text-muted-foreground">PGT documents ({pgtDocs.length}):</span>
                      {pgtDocs.map((e, di) => (
                        <div key={di} className="space-y-1">
                          <div className="flex items-center gap-1">
                            <Paperclip className="h-3 w-3 text-muted-foreground" />
                            <a href={e.pgtFileUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]">{e.pgtFileName || `PGT doc ${di + 1}`}</a>
                            {e.pgtFilePassword && <span className="flex items-center gap-0.5 text-amber-600"><KeyRound className="h-3 w-3" /></span>}
                          </div>
                          {e.pgtDocId && (
                            <SavedTranslationsPanel
                              leadDocumentId={e.pgtDocId}
                              fileUrl={e.pgtFileUrl!}
                              fileName={e.pgtFileName ?? "PGT Document"}
                              patientId={intake?.patientId ?? 0}
                              intakeSection={`PGT-${a.type ?? "Cycle"}`}
                              readOnly
                            />
                          )}
                          {!e.pgtDocId && e.pgtFileUrl && (
                            <span className="text-xs text-amber-600 dark:text-amber-400 italic">⚠️ Legacy file — re-upload to enable AI extraction</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {a.cycleFileUrl && (
                    <div className="pt-1 border-t border-muted/40 space-y-1">
                      <span className="text-muted-foreground font-medium">Cycle Report:</span>
                      <div className="flex items-center gap-1">
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                        <a href={a.cycleFileUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]">
                          {a.cycleFileName || (a.cycleFileTag || `TreatmentReport-${String(i + 1).padStart(2, "0")}`)}
                        </a>
                        {a.cycleFilePassword && <span className="flex items-center gap-0.5 text-amber-600"><KeyRound className="h-3 w-3" /></span>}
                      </div>
                      {a.cycleDocId && (
                        <SavedTranslationsPanel
                          leadDocumentId={a.cycleDocId}
                          fileUrl={a.cycleFileUrl}
                          fileName={a.cycleFileName ?? "document"}
                          patientId={intake?.patientId ?? 0}
                          intakeSection="TreatmentReport"
                          readOnly
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </SectionCard>
        )}
        {surgicalHistory.length > 0 && (
          <SectionCard readOnly title="Previous Procedures & Surgeries">
            {surgicalHistory.map((s, i) => (
              <div key={i} className="border rounded p-2 mb-1 bg-muted/20 text-xs">
                <span className="font-medium">{s.procedureType && s.procedureType !== "Other" ? s.procedureType : s.procedure || s.procedureType}</span>
                {s.procedureType === "Other" && s.procedure && <span className="text-muted-foreground"> ({s.procedure})</span>}
                {(s.date) && <span> — {displayFlexDate(s.date) || displayMonthYear(s.date) || s.date}</span>}
                {s.notes && <span className="text-muted-foreground"> · {s.notes}</span>}
                {s.fileUrl && (
                  <div className="flex items-center gap-1 pt-1 border-t border-muted/40 mt-1">
                    <Paperclip className="h-3 w-3 text-muted-foreground" />
                    <a href={normaliseFileUrl(s.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]">{s.fileName || "Attached file"}</a>
                    {s.filePassword && <span className="flex items-center gap-0.5 text-amber-600"><KeyRound className="h-3 w-3" /> Password on file</span>}
                  </div>
                )}
              </div>
            ))}
          </SectionCard>
        )}
        {previousTests.length > 0 && (
          <SectionCard readOnly title="Previous Tests & Lab Results">
            {/* Mobile: card layout | Desktop: table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left p-2 font-medium">Test Name</th>
                    <th className="text-left p-2 font-medium">Value</th>
                    <th className="text-left p-2 font-medium">Unit</th>
                    <th className="text-left p-2 font-medium">Reference Range</th>
                    <th className="text-left p-2 font-medium">Interpretation</th>
                    <th className="text-left p-2 font-medium">Collection Date</th>
                    <th className="text-left p-2 font-medium">Report Date</th>
                    <th className="text-left p-2 font-medium">File</th>
                  </tr>
                </thead>
                <tbody>
                  {femalePagedTests.map((t, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2">
                        <div className="font-medium">{t.name || "—"}</div>
                        {t.sourceTestName && <div className="text-[10px] text-muted-foreground">Original name: {t.sourceTestName}</div>}
                      </td>
                      <td className="p-2">{t.result || "—"}</td>
                      <td className="p-2 text-muted-foreground">{t.unit || "—"}</td>
                      <td className="p-2 text-muted-foreground">{t.referenceRange || "—"}</td>
                      <td className="p-2">{t.interpretation || "—"}</td>
                      <td className="p-2 text-muted-foreground">{t.collectionDate || t.date || "—"}</td>
                      <td className="p-2 text-muted-foreground">{t.reportDate || "—"}</td>
                      <td className="p-2">
                        {t.fileUrl ? (
                          <div className="flex items-center gap-1">
                            <a href={normaliseFileUrl(t.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-0.5">
                              <Paperclip className="h-3 w-3" />{t.fileName || "File"}
                            </a>
                            {t.filePassword && <span title="Password protected"><KeyRound className="h-3 w-3 text-amber-600" /></span>}
                          </div>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile card layout */}
            <div className="sm:hidden space-y-2">
              {femalePagedTests.map((t, i) => {
                const interp = t.interpretation;
                const interpColor = interp === "High" || interp === "Abnormal" ? "text-red-600" : interp === "Low" ? "text-amber-600" : interp === "Normal" ? "text-green-600" : "text-foreground";
                return (
                  <div key={i} className="border rounded-lg p-3 bg-muted/10 text-xs">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-sm text-foreground leading-tight">{t.name || "—"}</span>
                        {t.sourceTestName && (
                          <span className="text-[10px] text-muted-foreground">Original name: {t.sourceTestName}</span>
                        )}
                      </div>
                      {interp && <span className={`font-medium shrink-0 ${interpColor}`}>{interp}</span>}
                    </div>
                    <div className="flex items-baseline gap-1.5 mb-1">
                      <span className="text-base font-bold text-foreground">{t.result || "—"}</span>
                      {t.unit && <span className="text-muted-foreground">{t.unit}</span>}
                      {t.referenceRange && <span className="text-muted-foreground ml-1">Ref: {t.referenceRange}</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                      {(t.collectionDate || t.date) && <span>📅 {t.collectionDate || t.date}</span>}
                      {t.reportDate && <span>Report: {t.reportDate}</span>}
                    </div>
                    {t.fileUrl && (
                      <div className="mt-1.5 flex items-center gap-1">
                        <a href={normaliseFileUrl(t.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-0.5">
                          <Paperclip className="h-3 w-3" />{t.fileName || "File"}
                        </a>
                        {t.filePassword && <span title="Password protected"><KeyRound className="h-3 w-3 text-amber-600" /></span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Pagination controls */}
            {femaleTotalPages > 1 && (
              <div className="flex items-center justify-between px-2 py-2 border-t border-border/20 text-[11px] text-muted-foreground mt-2">
                <span>{previousTests.length} result{previousTests.length !== 1 ? 's' : ''} &bull; Page {femaleTestPage} of {femaleTotalPages}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={femaleTestPage <= 1}
                    onClick={() => setFemaleTestPage(p => Math.max(1, p - 1))}
                    className="px-2 py-0.5 rounded border border-border/40 bg-muted/30 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                  >← Prev</button>
                  {Array.from({ length: femaleTotalPages }, (_, idx) => idx + 1)
                    .filter(p => p === 1 || p === femaleTotalPages || Math.abs(p - femaleTestPage) <= 1)
                    .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                      if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, idx) =>
                      p === '...' ? (
                        <span key={`ellipsis-${idx}`} className="px-1">…</span>
                      ) : (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setFemaleTestPage(p as number)}
                          className={`px-2 py-0.5 rounded border ${
                            femaleTestPage === p
                              ? 'border-primary bg-primary/10 text-primary font-semibold'
                              : 'border-border/40 bg-muted/30 hover:bg-muted'
                          }`}
                        >{p}</button>
                      )
                    )
                  }
                  <button
                    type="button"
                    disabled={femaleTestPage >= femaleTotalPages}
                    onClick={() => setFemaleTestPage(p => Math.min(femaleTotalPages, p + 1))}
                    className="px-2 py-0.5 rounded border border-border/40 bg-muted/30 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                  >Next →</button>
                </div>
              </div>
            )}
          </SectionCard>
        )}
        {radiologyStudies.length > 0 && (
          <SectionCard readOnly title="Radiology & Imaging">
            <div className="space-y-3">
              {radiologyStudies.map((study, i) => (
                <div key={study.id || i} className="border rounded p-3 bg-muted/20 text-xs space-y-1">
                  <div className="flex gap-2 flex-wrap items-center">
                    <Badge variant="secondary">{study.type}</Badge>
                    {study.date && <span className="text-muted-foreground">{study.date}</span>}
                    {study.performedBy && <span>@ {study.performedBy}</span>}
                    {study.studyName && <span className="font-medium">{study.studyName}</span>}
                  </div>
                  {study.findings && <div><span className="text-muted-foreground">Findings:</span> {study.findings}</div>}
                  {study.conclusion && <div><span className="text-muted-foreground">Conclusion:</span> {study.conclusion}</div>}
                  {study.tvus?.uterusNotes && <div><span className="text-muted-foreground">Uterus Notes:</span> {study.tvus.uterusNotes}</div>}
                  {study.tvus?.ovarianNotes && <div><span className="text-muted-foreground">Ovarian Notes:</span> {study.tvus.ovarianNotes}</div>}
                  {study.fileUrl && (
                    <div className="flex items-center gap-1 pt-1 border-t border-muted/40">
                      <Paperclip className="h-3 w-3 text-muted-foreground" />
                      <a href={normaliseFileUrl(study.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]">{study.fileName || "Attached file"}</a>
                    </div>
                  )}
                  {/* AI Translation — Read-Only (keyed by study.docId for stable ownership) */}
                  {study.docId ? (
                    <SavedTranslationsPanel
                      leadDocumentId={study.docId}
                      fileUrl={normaliseFileUrl(study.fileUrl ?? "")}
                      fileName={study.fileName ?? "report"}
                      mimeType={study.fileMimeType}
                      patientId={intake?.patientId ?? 0}
                      readOnly
                    />
                  ) : study.fileUrl ? (
                    <div className="flex items-center gap-1.5 text-xs text-amber-600 italic px-1 pt-1">
                      <span>⚠ Legacy file — re-upload to enable AI extraction</span>
                    </div>
                  ) : null}
                  {parseJSONArray<any>(study.images).length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {parseJSONArray<any>(study.images).map((img: any, ii: number) => (
                        <a key={ii} href={normaliseFileUrl(img.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs flex items-center gap-0.5">
                          <Paperclip className="h-3 w-3" />{img.fileName || `Image ${ii + 1}`}
                        </a>
                      ))}
                    </div>
                  )}
                  {parseJSONArray<any>(study.dicomFiles).length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {parseJSONArray<any>(study.dicomFiles).map((dcm: any, di: number) => (
                        <DicomBadgeButton
                          key={di}
                          fileUrl={dcm.fileUrl ?? ''}
                          fileName={dcm.fileName}
                          label={dcm.label || dcm.fileName || `DICOM ${di + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        )}
        {filterMeaningfulEntries(parseJSONArray<GeneticTestEntry>(intake?.femaleGeneticTests)).length > 0 && (
          <SectionCard readOnly title="Genetic Tests">
            <div className="space-y-2">
              {filterMeaningfulEntries(parseJSONArray<GeneticTestEntry>(intake?.femaleGeneticTests)).map((g, i) => (
                <div key={i} className="border rounded p-2 bg-muted/20 text-xs">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="font-medium">{g.test || "—"}</span>
                    {g.date && <span className="text-muted-foreground">{g.date}</span>}
                    {g.result && <Badge variant="secondary">{g.result}</Badge>}
                    {g.notes && <span className="text-muted-foreground">({g.notes})</span>}
                  </div>
                  {g.fileUrl && (
                    <div className="flex items-center gap-1 pt-1 border-t border-muted/40 mt-1">
                      <Paperclip className="h-3 w-3 text-muted-foreground" />
                      <a href={normaliseFileUrl(g.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]">{g.fileName || "Attached file"}</a>
                      {g.filePassword && <span className="flex items-center gap-0.5 text-amber-600"><KeyRound className="h-3 w-3" /> Password on file</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        )}
        {intake?.additionalNotes && (
          <SectionCard readOnly title="Additional Notes">
            <p className="text-sm whitespace-pre-wrap">{intake.additionalNotes}</p>
          </SectionCard>
        )}
        {femaleQuestions.length > 0 && (
          <SectionCard readOnly title="Wife's Questions for the Doctor">
            <div className="space-y-3">
              {femaleQuestions.map((q, i) => (
                <div key={i} className="space-y-1.5">
                  <p className="text-sm font-medium">Q{i + 1}: {q}</p>
                  {femaleAnswers[String(i)] ? (
                    <div className="ml-2 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/40 px-3 py-2">
                      <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-0.5">Doctor's Answer:</p>
                      <p className="text-xs text-foreground">{femaleAnswers[String(i)]}</p>
                    </div>
                  ) : (
                    <p className="ml-2 text-xs text-muted-foreground italic">No answer yet.</p>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        )}
        {generalAttachmentsFemale.length > 0 && (
          <SectionCard readOnly title="General Attachments (Female)">
            <div className="space-y-2">
              {generalAttachmentsFemale.map((att, i) => att.fileUrl ? (
                <div key={i} className="flex items-center gap-2 text-xs border rounded p-2 bg-muted/20">
                  <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                  <FileViewButton fileUrl={att.fileUrl} fileName={att.fileName} mimeType={(att as any).mimeType} label={att.tag || att.fileName} />
                  {att.tag && <Badge variant="outline" className="text-xs shrink-0">{att.tag}</Badge>}
                  {att.docPassword && <span className="flex items-center gap-0.5 text-amber-600 shrink-0"><KeyRound className="h-3 w-3" /></span>}
                </div>
              ) : null)}
            </div>
          </SectionCard>
        )}
      </TabsContent>

      <TabsContent value="male" className="space-y-4">
        {/* P2-2: Source label — shown for female-primary AND legacy records where the male tab contains partner-reported data.
             For legacy records, the male tab shows the male partner data entered during intake, so the label is appropriate.
             For female-primary records, this tab is the partner tab. */}
        {(isFemaleMode || isLegacy) && hasMeaningfulReportedPartnerData(intake, intakeMode) && (
          <div className="px-3 py-2.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700 dark:bg-slate-800/40 dark:border-slate-600 dark:text-slate-300 text-xs space-y-0.5">
            <p className="font-semibold">Reported Partner Information</p>
            <p>
              {isFemaleMode
                ? "Partner information recorded during this female Health Record intake. It is stored separately from any linked partner\u2019s identity and Health Record."
                : "Partner information recorded during this Health Record intake. It is stored separately from any linked partner\u2019s identity and Health Record."}
            </p>
          </div>
        )}
        {/* P2-3: Linked-partner informational banner — shown when a partner is linked AND reported data exists */}
        {(isFemaleMode || isLegacy) && partnerOwnerName && hasMeaningfulReportedPartnerData(intake, intakeMode) && (
          <div className="px-3 py-2.5 rounded-md bg-slate-100 border border-slate-300 text-slate-700 dark:bg-slate-800/60 dark:border-slate-500 dark:text-slate-300 text-xs space-y-0.5">
            <p className="font-semibold">Note: Linked partner record exists</p>
            <p>This Health Record contains partner information entered separately from the linked partner's own record. The linked partner's Health Record is the authoritative source for their medical information.</p>
          </div>
        )}
        {/* Fix D: Show identity DOB (blue) when available; show intake-template DOB with amber warning when identity is missing */}
        {maleLeadDob ? (
          <DobBadge dob={maleLeadDob} label="Date of Birth (Male Partner)" variant="identity" />
        ) : maleDob ? (
          <DobBadge dob={maleDob} label="Date of Birth (Male Partner)" variant="intake-unverified" />
        ) : null}
        {maleIntake && Object.keys(maleIntake).length > 0 ? (
          <>
            {hasMaleGeneralInfo && (
              <SectionCard readOnly title="General Information">
                {/* Basic Info */}
                {(maleIntake.profession || maleIntake.isFirstMarriage === true || (intake as any)?.hasCivilMarriageCertificate === true || maleIntake.consanguinity === true || maleIntake.infertilityType || maleIntake.infertilityDuration || maleIntake.childrenFromPreviousRelationship) && (
                  <>
                    <SubSectionDivider label="Basic Information" />
                    <dl className="space-y-0">
                      <InfoRow label="Infertility Type (Male)" value={maleIntake.infertilityType === 'primary' ? 'Primary (never fathered a child)' : maleIntake.infertilityType === 'secondary' ? 'Secondary (has fathered a child before)' : maleIntake.infertilityType} />
                      <InfoRow label="Duration" value={maleIntake.infertilityDuration} />
                      {maleIntake.childrenFromPreviousRelationship != null && Number(maleIntake.childrenFromPreviousRelationship) > 0 && (
                        <InfoRow label="Children (Prev. Relationship)" value={String(maleIntake.childrenFromPreviousRelationship)} />
                      )}
                      <InfoRow label="Profession" value={maleIntake.profession} />
                      {maleIntake.isFirstMarriage === true && <InfoRow label="First Marriage" value="Yes" />}
                      {(intake as any)?.hasCivilMarriageCertificate === true && (
                        <>
                          <InfoRow label="Civil Marriage Certificate" value="Yes" />
                          {(intake as any)?.marriageCertFileUrl && (
                            <div className="py-1 pl-4">
                              <a
                                href={normaliseFileUrl((intake as any).marriageCertFileUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                <span>{(intake as any).marriageCertFileName || "View certificate"}</span>
                              </a>
                            </div>
                          )}
                        </>
                      )}
                      {maleIntake.consanguinity === true && <InfoRow label="Consanguinity" value="Yes" />}
                    </dl>
                  </>
                )}
                {/* Body Measurements */}
                {(maleIntake.heightCm || maleIntake.weightKg || maleIntake.bmi) && (
                  <>
                    <SubSectionDivider label="Body Measurements" />
                    <dl className="space-y-0">
                      <InfoRow label="Height" value={maleIntake.heightCm ? `${maleIntake.heightCm} cm` : undefined} />
                      <InfoRow label="Weight" value={maleIntake.weightKg ? `${maleIntake.weightKg} kg` : undefined} />
                      <InfoRow label="BMI" value={maleIntake.bmi} />
                    </dl>
                  </>
                )}
                {/* Lifestyle & Habits */}
                {((maleIntake.smoking && maleIntake.smoking !== 'never') || (maleIntake.alcohol && maleIntake.alcohol !== 'never')) && (
                  <>
                    <SubSectionDivider label="Lifestyle & Habits" />
                    <dl className="space-y-0">
                      {maleIntake.smoking && maleIntake.smoking !== 'never' && <InfoRow label="Smoking" value={maleIntake.smoking} />}
                      {maleIntake.alcohol && maleIntake.alcohol !== 'never' && <InfoRow label="Alcohol" value={maleIntake.alcohol} />}
                    </dl>
                  </>
                )}
                {/* Medications & Allergies */}
                {(maleIntake.currentMedications || maleIntake.allergies) && (
                  <>
                    <SubSectionDivider label="Medications & Allergies" />
                    <dl className="space-y-0">
                      <InfoRow label="Current Medications" value={maleIntake.currentMedications} />
                      <InfoRow label="Allergies" value={maleIntake.allergies} />
                    </dl>
                  </>
                )}
              </SectionCard>
            )}

            {hasMaleFamilyHistory && (
              <SectionCard readOnly title="Family Medical History">
                <dl className="space-y-0">
                  <InfoRow label="Hereditary / Genetic Conditions" value={maleIntake.hereditaryDiseases} />
                </dl>
              </SectionCard>
            )}

            {maleSemenAnalysis.length > 0 && (
              <SectionCard readOnly title="Semen Analysis">
                {maleSemenAnalysis.map((s, i) => (
                  <div key={i} className="border rounded p-3 mb-2 bg-muted/20 text-xs space-y-1">
                    <div className="font-medium">{s.date}</div>
                    <div className="grid grid-cols-3 gap-1">
                      {s.volume && <span><span className="text-muted-foreground">Vol:</span> {s.volume} mL</span>}
                      {s.concentration && <span><span className="text-muted-foreground">Conc:</span> {s.concentration} M/mL</span>}
                      {s.totalMotility && <span><span className="text-muted-foreground">Motility:</span> {s.totalMotility}%</span>}
                      {s.progressiveMotility && <span><span className="text-muted-foreground">Prog:</span> {s.progressiveMotility}%</span>}
                      {s.nonProgressiveMotility && <span><span className="text-muted-foreground">Non-Prog:</span> {s.nonProgressiveMotility}%</span>}
                      {s.immotilePercent && <span><span className="text-muted-foreground">Immotile:</span> {s.immotilePercent}%</span>}
                      {s.morphology && <span><span className="text-muted-foreground">Morph:</span> {s.morphology}%</span>}
                      {s.ph && <span><span className="text-muted-foreground">pH:</span> {s.ph}</span>}
                      {s.leukocyteCount && <span><span className="text-muted-foreground">WBC:</span> {s.leukocyteCount} M/mL</span>}
                      {s.preparationMethod && <span><span className="text-muted-foreground">Prep:</span> {s.preparationMethod}</span>}
                      {s.postPrepConcentration && <span><span className="text-muted-foreground">Post-Conc:</span> {s.postPrepConcentration} M/mL</span>}
                      {s.postPrepMotility && <span><span className="text-muted-foreground">Post-Motility:</span> {s.postPrepMotility}%</span>}
                    </div>
                    {s.notes && <div className="text-muted-foreground">{s.notes}</div>}
                    {s.fileUrl && (
                      <div className="flex items-center gap-1 pt-1 border-t border-muted/40">
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                        <a href={normaliseFileUrl(s.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]">{s.fileName || "Attached file"}</a>
                        {s.filePassword && <span className="flex items-center gap-0.5 text-amber-600"><KeyRound className="h-3 w-3" /> Password on file</span>}
                      </div>
                    )}
                  </div>
                ))}
              </SectionCard>
            )}

            {maleDnaFragmentation.length > 0 && (
              <SectionCard readOnly title="DNA Fragmentation">
                {maleDnaFragmentation.map((d, i) => (
                  <div key={i} className="border rounded p-3 mb-2 bg-muted/20 text-xs space-y-1">
                    <div className="font-medium">{d.date || `Test ${i + 1}`}</div>
                    <div className="grid grid-cols-3 gap-1">
                      {d.dfi && <span><span className="text-muted-foreground">DFI:</span> {d.dfi}%</span>}
                      {d.hds && <span><span className="text-muted-foreground">HDS:</span> {d.hds}%</span>}
                      {d.method && <span><span className="text-muted-foreground">Method:</span> {d.method}</span>}
                    </div>
                    {d.notes && <div className="text-muted-foreground">{d.notes}</div>}
                    {d.fileUrl && (
                      <div className="flex items-center gap-1 pt-1 border-t border-muted/40">
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                        <a href={normaliseFileUrl(d.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]">{d.fileName || "Attached file"}</a>
                        {d.filePassword && <span className="flex items-center gap-0.5 text-amber-600"><KeyRound className="h-3 w-3" /> Password on file</span>}
                      </div>
                    )}
                  </div>
                ))}
              </SectionCard>
            )}

            {malePreviousTests.length > 0 && (
              <SectionCard readOnly title="Previous Tests & Lab Results">
                {/* Mobile: card layout | Desktop: table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left p-2 font-medium">Test Name</th>
                        <th className="text-left p-2 font-medium">Value</th>
                        <th className="text-left p-2 font-medium">Unit</th>
                        <th className="text-left p-2 font-medium">Reference Range</th>
                        <th className="text-left p-2 font-medium">Interpretation</th>
                        <th className="text-left p-2 font-medium">Collection Date</th>
                        <th className="text-left p-2 font-medium">Report Date</th>
                        <th className="text-left p-2 font-medium">File</th>
                      </tr>
                    </thead>
                    <tbody>
                      {malePagedTests.map((t, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="p-2">
                            <div className="font-medium">{t.name || "—"}</div>
                            {t.sourceTestName && <div className="text-[10px] text-muted-foreground">Original name: {t.sourceTestName}</div>}
                          </td>
                          <td className="p-2">{t.result || "—"}</td>
                          <td className="p-2 text-muted-foreground">{t.unit || "—"}</td>
                          <td className="p-2 text-muted-foreground">{t.referenceRange || "—"}</td>
                          <td className="p-2">{t.interpretation || "—"}</td>
                          <td className="p-2 text-muted-foreground">{t.collectionDate || t.date || "—"}</td>
                          <td className="p-2 text-muted-foreground">{t.reportDate || "—"}</td>
                          <td className="p-2">
                            {t.fileUrl ? (
                              <div className="flex items-center gap-1">
                                <a href={normaliseFileUrl(t.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-0.5">
                                  <Paperclip className="h-3 w-3" />{t.fileName || "File"}
                                </a>
                                {t.filePassword && <span title="Password protected"><KeyRound className="h-3 w-3 text-amber-600" /></span>}
                              </div>
                            ) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile card layout */}
                <div className="sm:hidden space-y-2">
                  {malePagedTests.map((t, i) => {
                    const interp = t.interpretation;
                    const interpColor = interp === "High" || interp === "Abnormal" ? "text-red-600" : interp === "Low" ? "text-amber-600" : interp === "Normal" ? "text-green-600" : "text-foreground";
                    return (
                      <div key={i} className="border rounded-lg p-3 bg-muted/10 text-xs">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-sm text-foreground leading-tight">{t.name || "—"}</span>
                            {t.sourceTestName && (
                              <span className="text-[10px] text-muted-foreground">Original name: {t.sourceTestName}</span>
                            )}
                          </div>
                          {interp && <span className={`font-medium shrink-0 ${interpColor}`}>{interp}</span>}
                        </div>
                        <div className="flex items-baseline gap-1.5 mb-1">
                          <span className="text-base font-bold text-foreground">{t.result || "—"}</span>
                          {t.unit && <span className="text-muted-foreground">{t.unit}</span>}
                          {t.referenceRange && <span className="text-muted-foreground ml-1">Ref: {t.referenceRange}</span>}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                          {(t.collectionDate || t.date) && <span>📅 {t.collectionDate || t.date}</span>}
                          {t.reportDate && <span>Report: {t.reportDate}</span>}
                        </div>
                        {t.fileUrl && (
                          <div className="mt-1.5 flex items-center gap-1">
                            <a href={normaliseFileUrl(t.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-0.5">
                              <Paperclip className="h-3 w-3" />{t.fileName || "File"}
                            </a>
                            {t.filePassword && <span title="Password protected"><KeyRound className="h-3 w-3 text-amber-600" /></span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Pagination controls */}
                {maleTotalPages > 1 && (
                  <div className="flex items-center justify-between px-2 py-2 border-t border-border/20 text-[11px] text-muted-foreground mt-2">
                    <span>{malePreviousTests.length} result{malePreviousTests.length !== 1 ? 's' : ''} &bull; Page {maleTestPage} of {maleTotalPages}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={maleTestPage <= 1}
                        onClick={() => setMaleTestPage(p => Math.max(1, p - 1))}
                        className="px-2 py-0.5 rounded border border-border/40 bg-muted/30 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                      >← Prev</button>
                      {Array.from({ length: maleTotalPages }, (_, idx) => idx + 1)
                        .filter(p => p === 1 || p === maleTotalPages || Math.abs(p - maleTestPage) <= 1)
                        .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                          if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, idx) =>
                          p === '...' ? (
                            <span key={`ellipsis-${idx}`} className="px-1">…</span>
                          ) : (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setMaleTestPage(p as number)}
                              className={`px-2 py-0.5 rounded border ${
                                maleTestPage === p
                                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                                  : 'border-border/40 bg-muted/30 hover:bg-muted'
                              }`}
                            >{p}</button>
                          )
                        )
                      }
                      <button
                        type="button"
                        disabled={maleTestPage >= maleTotalPages}
                        onClick={() => setMaleTestPage(p => Math.min(maleTotalPages, p + 1))}
                        className="px-2 py-0.5 rounded border border-border/40 bg-muted/30 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                      >Next →</button>
                    </div>
                  </div>
                )}
              </SectionCard>
            )}

            {maleGeneticTests.length > 0 && (
              <SectionCard readOnly title="Genetic Tests">
                {maleGeneticTests.map((g, i) => (
                  <div key={i} className="border rounded p-2 mb-1 bg-muted/20 text-xs">
                    <span className="font-medium">{g.test}</span> — {g.date}: <span>{g.result}</span> {g.notes && `(${g.notes})`}
                    {g.fileUrl && (
                      <div className="flex items-center gap-1 pt-1 border-t border-muted/40 mt-1">
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                        <a href={normaliseFileUrl(g.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]">{g.fileName || "Attached file"}</a>
                        {g.filePassword && <span className="flex items-center gap-0.5 text-amber-600"><KeyRound className="h-3 w-3" /> Password on file</span>}
                      </div>
                    )}
                  </div>
                ))}
              </SectionCard>
            )}

            {maleIntake.additionalNotes && (
              <SectionCard readOnly title="Additional Notes">
                <p className="text-sm whitespace-pre-wrap">{maleIntake.additionalNotes}</p>
              </SectionCard>
            )}

            {(maleActiveDiseases.length > 0 || maleSystemicDiseases.other) && (
              <SectionCard readOnly title="Health Conditions">
                <dl className="space-y-0">
                  {maleActiveDiseases.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {maleActiveDiseases.map(d => <Badge key={d} variant="destructive" className="text-xs">{d}</Badge>)}
                    </div>
                  )}
                  {maleSystemicDiseases.other && <InfoRow label="Other" value={maleSystemicDiseases.other} />}
                </dl>
              </SectionCard>
            )}

            {maleFertilityDiagnosis.length > 0 && (
              <SectionCard readOnly title="Male Fertility Diagnosis">
                <div className="flex flex-wrap gap-1.5">
                  {maleFertilityDiagnosis.map(d => (
                    <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>
                  ))}
                </div>
              </SectionCard>
            )}

            {maleIntake?.childrenFromPreviousRelationship != null && Number(maleIntake.childrenFromPreviousRelationship) > 0 && (
              <SectionCard readOnly title="Children from Previous Relationship">
                <p className="text-sm font-medium">{maleIntake.childrenFromPreviousRelationship}</p>
              </SectionCard>
            )}

            {maleSurgeries.length > 0 && (
              <SectionCard readOnly title="Previous Procedures & Surgeries">
                {maleSurgeries.map((s, i) => (
                  <div key={i} className="border rounded p-2 mb-1 bg-muted/20 text-xs">
                    <span className="font-medium">{s.procedureType && s.procedureType !== "Other" ? s.procedureType : s.procedure || s.procedureType}</span>
                    {s.procedureType === "Other" && s.procedure && <span className="text-muted-foreground"> ({s.procedure})</span>}
                    {(s.date) && <span> — {displayFlexDate(s.date) || displayMonthYear(s.date) || s.date}</span>}
                    {s.notes && <span className="text-muted-foreground"> · {s.notes}</span>}
                    {s.fileUrl && (
                      <div className="flex items-center gap-1 pt-1 border-t border-muted/40 mt-1">
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                        <a href={normaliseFileUrl(s.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]">{s.fileName || "Attached file"}</a>
                        {s.filePassword && <span className="flex items-center gap-0.5 text-amber-600"><KeyRound className="h-3 w-3" /> Password on file</span>}
                      </div>
                    )}
                  </div>
                ))}
              </SectionCard>
            )}

            {maleRadiologyStudies.length > 0 && (
              <SectionCard readOnly title="Radiology & Imaging">
                <div className="space-y-3">
                  {maleRadiologyStudies.map((study, i) => (
                    <div key={study.id || i} className="border rounded p-3 bg-muted/20 text-xs space-y-1">
                      <div className="flex gap-2 flex-wrap items-center">
                        <Badge variant="secondary">{study.type}</Badge>
                        {study.date && <span className="text-muted-foreground">{study.date}</span>}
                        {study.performedBy && <span>@ {study.performedBy}</span>}
                        {study.studyName && <span className="font-medium">{study.studyName}</span>}
                      </div>
                      {study.findings && <div><span className="text-muted-foreground">Findings:</span> {study.findings}</div>}
                      {study.conclusion && <div><span className="text-muted-foreground">Conclusion:</span> {study.conclusion}</div>}
                      {study.tvus?.uterusNotes && <div><span className="text-muted-foreground">Uterus Notes:</span> {study.tvus.uterusNotes}</div>}
                      {study.tvus?.ovarianNotes && <div><span className="text-muted-foreground">Ovarian Notes:</span> {study.tvus.ovarianNotes}</div>}
                      {study.fileUrl && (
                        <div className="flex items-center gap-1 pt-1 border-t border-muted/40">
                          <Paperclip className="h-3 w-3 text-muted-foreground" />
                          <a href={normaliseFileUrl(study.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]">{study.fileName || "Attached file"}</a>
                        </div>
                      )}
                      {/* AI Translation — Read-Only (keyed by study.docId for stable ownership) */}
                      {study.docId ? (
                        <SavedTranslationsPanel
                          leadDocumentId={study.docId}
                          fileUrl={normaliseFileUrl(study.fileUrl ?? "")}
                          fileName={study.fileName ?? "report"}
                          mimeType={study.fileMimeType}
                          patientId={intake?.patientId ?? 0}
                          readOnly
                        />
                      ) : study.fileUrl ? (
                        <div className="flex items-center gap-1.5 text-xs text-amber-600 italic px-1 pt-1">
                          <span>⚠ Legacy file — re-upload to enable AI extraction</span>
                        </div>
                      ) : null}
                      {parseJSONArray<any>(study.images).length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {parseJSONArray<any>(study.images).map((img: any, ii: number) => (
                            <a key={ii} href={normaliseFileUrl(img.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs flex items-center gap-0.5">
                              <Paperclip className="h-3 w-3" />{img.fileName || `Image ${ii + 1}`}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {maleQuestions.length > 0 && (
              <SectionCard readOnly title="Husband's Questions for the Doctor">
                <div className="space-y-3">
                  {maleQuestions.map((q, i) => (
                    <div key={i} className="space-y-1.5">
                      <p className="text-sm font-medium">Q{i + 1}: {q}</p>
                      {maleAnswers[String(i)] ? (
                        <div className="ml-2 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/40 px-3 py-2">
                          <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-0.5">Doctor's Answer:</p>
                          <p className="text-xs text-foreground">{maleAnswers[String(i)]}</p>
                        </div>
                      ) : (
                        <p className="ml-2 text-xs text-muted-foreground italic">No answer yet.</p>
                      )}
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {generalAttachmentsMale.length > 0 && (
              <SectionCard readOnly title="General Attachments (Male)">
                <div className="space-y-2">
                  {generalAttachmentsMale.map((att, i) => att.fileUrl ? (
                    <div key={i} className="flex items-center gap-2 text-xs border rounded p-2 bg-muted/20">
                      <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                      <FileViewButton fileUrl={att.fileUrl} fileName={att.fileName} mimeType={(att as any).mimeType} label={att.tag || att.fileName} />
                      {att.tag && <Badge variant="outline" className="text-xs shrink-0">{att.tag}</Badge>}
                      {att.docPassword && <span className="flex items-center gap-0.5 text-amber-600 shrink-0"><KeyRound className="h-3 w-3" /></span>}
                    </div>
                  ) : null)}
                </div>
              </SectionCard>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No male intake data recorded yet.</p>
          </div>
        )}
        {/* Always show male fertility diagnosis if available, even without full intake */}
        {maleFertilityDiagnosis.length > 0 && !(maleIntake && Object.keys(maleIntake).length > 0) && (
          <SectionCard readOnly title="Male Fertility Diagnosis">
            <div className="flex flex-wrap gap-1.5">
              {maleFertilityDiagnosis.map(d => (
                <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>
              ))}
            </div>
          </SectionCard>
        )}
            </TabsContent>
    </Tabs>
    )}{/* end isGeneralMode ? null : (...) */}

    {/* Phase 2 Option A: Collapsible Reported Partner Information section for modern records.
        For female-primary records: shows the maleIntake blob (partner data entered during this intake).
        For male-primary records: shows the female partner fields from the top-level intake.
        Only rendered when hasMeaningfulReportedPartnerData() returns true.
        Legacy and general records already show both tabs — no extra section needed. */}
    {(isFemaleMode || isMaleMode) && hasMeaningfulReportedPartnerData(intake, intakeMode) && (() => {
      // Determine what data to show based on which direction the record is
      // isFemaleMode: the embedded partner data is in maleIntake blob (male partner data)
      // isMaleMode:   the embedded partner data is in the top-level female fields + maleIntake.femalePartnerDob
      const partnerLabel = isFemaleMode ? "Male Partner" : "Female Partner";
      return (
        <SectionCard title={`Reported Partner Information (${partnerLabel})`} defaultOpen={false}>
          <div className="px-1 py-1">
            {/* Description / source notice */}
            <div className="mb-3 px-2 py-1.5 rounded bg-slate-50 border border-slate-200 text-slate-600 dark:bg-slate-800/40 dark:border-slate-600 dark:text-slate-400 text-xs">
              <span className="font-medium">Reported Partner Information</span>
              {" — "}
              {isFemaleMode
                ? "Partner information recorded during this female Health Record intake. It is stored separately from any linked partner’s identity and Health Record."
                : "Partner information recorded during this male Health Record intake. It is stored separately from any linked partner’s identity and Health Record."}
              {partnerOwnerName && (
                <span className="block mt-1 text-slate-500 dark:text-slate-400">
                  This Health Record contains partner information entered separately from the linked partner’s own record. The linked partner’s Health Record is the authoritative source for their medical information.
                </span>
              )}
            </div>

            {isFemaleMode ? (
              /* ── Female-primary record: partner data is in maleIntake blob ── */
              <div className="space-y-4">
                {/* 1. General Information */}
                {(maleIntake?.dateOfBirth || maleIntake?.profession || maleIntake?.infertilityType ||
                  maleIntake?.infertilityDuration || maleIntake?.isFirstMarriage === true ||
                  (maleIntake?.childrenFromPreviousRelationship != null && Number(maleIntake.childrenFromPreviousRelationship) > 0) ||
                  maleIntake?.heightCm || maleIntake?.weightKg || maleIntake?.bmi ||
                  (maleIntake?.smoking && maleIntake.smoking !== 'never') ||
                  (maleIntake?.alcohol && maleIntake.alcohol !== 'never') ||
                  maleIntake?.consanguinity === true || maleIntake?.currentMedications || maleIntake?.allergies ||
                  maleIntake?.additionalNotes) && (
                  <div>
                    <SubSectionDivider label="General Information" />
                    <dl className="space-y-0">
                      {maleIntake?.dateOfBirth && <InfoRow label="Date of Birth" value={fmtDate(maleIntake.dateOfBirth)} />}
                      {maleIntake?.profession && <InfoRow label="Profession" value={maleIntake.profession} />}
                      {maleIntake?.infertilityType && <InfoRow label="Infertility Type" value={maleIntake.infertilityType === 'primary' ? 'Primary (never fathered a child)' : maleIntake.infertilityType === 'secondary' ? 'Secondary (has fathered a child before)' : maleIntake.infertilityType} />}
                      {maleIntake?.infertilityDuration && <InfoRow label="Duration of Infertility" value={maleIntake.infertilityDuration} />}
                      {maleIntake?.isFirstMarriage === true && <InfoRow label="First Marriage" value="Yes" />}
                      {maleIntake?.childrenFromPreviousRelationship != null && Number(maleIntake.childrenFromPreviousRelationship) > 0 && (
                        <InfoRow label="Children (Prev. Relationship)" value={String(maleIntake.childrenFromPreviousRelationship)} />
                      )}
                      {maleIntake?.heightCm && <InfoRow label="Height" value={`${maleIntake.heightCm} cm`} />}
                      {maleIntake?.weightKg && <InfoRow label="Weight" value={`${maleIntake.weightKg} kg`} />}
                      {maleIntake?.bmi && <InfoRow label="BMI" value={maleIntake.bmi} />}
                      {maleIntake?.smoking && maleIntake.smoking !== 'never' && <InfoRow label="Smoking" value={maleIntake.smoking} />}
                      {maleIntake?.smokingPacksPerDay && <InfoRow label="Packs / Day" value={maleIntake.smokingPacksPerDay} />}
                      {maleIntake?.alcohol && maleIntake.alcohol !== 'never' && <InfoRow label="Alcohol" value={maleIntake.alcohol} />}
                      {maleIntake?.consanguinity === true && <InfoRow label="Consanguinity" value="Yes" />}
                      {maleIntake?.currentMedications && <InfoRow label="Current Medications" value={maleIntake.currentMedications} />}
                      {maleIntake?.allergies && <InfoRow label="Allergies" value={maleIntake.allergies} />}
                      {maleIntake?.additionalNotes && <InfoRow label="Additional Notes" value={maleIntake.additionalNotes} />}
                    </dl>
                  </div>
                )}

                {/* 2. Family / Hereditary History */}
                {maleIntake?.hereditaryDiseases && (
                  <div>
                    <SubSectionDivider label="Family Medical History" />
                    <dl className="space-y-0">
                      <InfoRow label="Hereditary / Genetic Conditions" value={maleIntake.hereditaryDiseases} />
                    </dl>
                  </div>
                )}

                {/* 3. Systemic Diseases */}
                {(maleActiveDiseases.length > 0 || maleSystemicDiseases.other) && (
                  <div>
                    <SubSectionDivider label="Systemic Diseases" />
                    {maleActiveDiseases.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {maleActiveDiseases.map(d => <Badge key={d} variant="destructive" className="text-xs">{d}</Badge>)}
                      </div>
                    )}
                    {maleSystemicDiseases.other && <InfoRow label="Other" value={maleSystemicDiseases.other} />}
                  </div>
                )}

                {/* 4. Semen Analysis */}
                {maleSemenAnalysis.length > 0 && (
                  <div>
                    <SubSectionDivider label={`Semen Analysis (${maleSemenAnalysis.length} record${maleSemenAnalysis.length !== 1 ? 's' : ''})`} />
                    {maleSemenAnalysis.map((s, i) => (
                      <div key={i} className="border rounded p-2 mb-1 bg-muted/20 text-xs space-y-1">
                        <div className="font-medium">{s.date || `Record ${i + 1}`}</div>
                        <div className="grid grid-cols-3 gap-1">
                          {s.volume && <span><span className="text-muted-foreground">Volume:</span> {s.volume} mL</span>}
                          {s.concentration && <span><span className="text-muted-foreground">Conc:</span> {s.concentration} M/mL</span>}
                          {s.totalMotility && <span><span className="text-muted-foreground">Motility:</span> {s.totalMotility}%</span>}
                          {s.morphology && <span><span className="text-muted-foreground">Morphology:</span> {s.morphology}%</span>}
                        </div>
                        {s.notes && <div className="text-muted-foreground">{s.notes}</div>}
                        {s.fileUrl && (
                          <div className="flex items-center gap-1 pt-1 border-t border-muted/40">
                            <Paperclip className="h-3 w-3 text-muted-foreground" />
                            <a href={normaliseFileUrl(s.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]">{s.fileName || "Attached file"}</a>
                            {s.filePassword && <span className="flex items-center gap-0.5 text-amber-600"><KeyRound className="h-3 w-3" /> Password on file</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 5. DNA Fragmentation */}
                {maleDnaFragmentation.length > 0 && (
                  <div>
                    <SubSectionDivider label={`DNA Fragmentation (${maleDnaFragmentation.length} record${maleDnaFragmentation.length !== 1 ? 's' : ''})`} />
                    {maleDnaFragmentation.map((d, i) => (
                      <div key={i} className="border rounded p-3 mb-2 bg-muted/20 text-xs space-y-1">
                        <div className="font-medium">{d.date || `Test ${i + 1}`}</div>
                        <div className="grid grid-cols-3 gap-1">
                          {d.dfi && <span><span className="text-muted-foreground">DFI:</span> {d.dfi}%</span>}
                          {d.hds && <span><span className="text-muted-foreground">HDS:</span> {d.hds}%</span>}
                          {d.method && <span><span className="text-muted-foreground">Method:</span> {d.method}</span>}
                        </div>
                        {d.notes && <div className="text-muted-foreground">{d.notes}</div>}
                        {d.fileUrl && (
                          <div className="flex items-center gap-1 pt-1 border-t border-muted/40">
                            <Paperclip className="h-3 w-3 text-muted-foreground" />
                            <a href={normaliseFileUrl(d.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]">{d.fileName || "Attached file"}</a>
                            {d.filePassword && <span className="flex items-center gap-0.5 text-amber-600"><KeyRound className="h-3 w-3" /> Password on file</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 6. Previous Tests & Lab Results (paginated) */}
                {malePreviousTests.length > 0 && (
                  <div>
                    <SubSectionDivider label={`Previous Tests & Lab Results (${malePreviousTests.length} result${malePreviousTests.length !== 1 ? 's' : ''})`} />
                    {/* Desktop table */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="text-left p-2 font-medium">Test Name</th>
                            <th className="text-left p-2 font-medium">Value</th>
                            <th className="text-left p-2 font-medium">Unit</th>
                            <th className="text-left p-2 font-medium">Ref. Range</th>
                            <th className="text-left p-2 font-medium">Interpretation</th>
                            <th className="text-left p-2 font-medium">Date</th>
                            <th className="text-left p-2 font-medium">File</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partnerPagedTests.map((t, i) => (
                            <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="p-2">
                                <div className="font-medium">{t.name || "—"}</div>
                                {t.sourceTestName && <div className="text-[10px] text-muted-foreground">Original: {t.sourceTestName}</div>}
                              </td>
                              <td className="p-2">{t.result || "—"}</td>
                              <td className="p-2 text-muted-foreground">{t.unit || "—"}</td>
                              <td className="p-2 text-muted-foreground">{t.referenceRange || "—"}</td>
                              <td className="p-2">{t.interpretation || "—"}</td>
                              <td className="p-2 text-muted-foreground">{t.collectionDate || t.date || "—"}</td>
                              <td className="p-2">
                                {t.fileUrl ? (
                                  <div className="flex items-center gap-1">
                                    <a href={normaliseFileUrl(t.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-0.5">
                                      <Paperclip className="h-3 w-3" />{t.fileName || "File"}
                                    </a>
                                    {t.filePassword && <span title="Password protected"><KeyRound className="h-3 w-3 text-amber-600" /></span>}
                                  </div>
                                ) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Mobile cards */}
                    <div className="sm:hidden space-y-2">
                      {partnerPagedTests.map((t, i) => (
                        <div key={i} className="border rounded p-2 bg-muted/20 text-xs space-y-0.5">
                          <div className="font-medium">{t.name || "—"}</div>
                          <div>{t.result}{t.unit ? ` ${t.unit}` : ""}{t.referenceRange ? <span className="text-muted-foreground ml-1">Ref: {t.referenceRange}</span> : null}</div>
                          {(t.collectionDate || t.date) && <div className="text-muted-foreground">{t.collectionDate || t.date}</div>}
                          {t.fileUrl && (
                            <div className="mt-1 flex items-center gap-1">
                              <a href={normaliseFileUrl(t.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-0.5">
                                <Paperclip className="h-3 w-3" />{t.fileName || "File"}
                              </a>
                              {t.filePassword && <span title="Password protected"><KeyRound className="h-3 w-3 text-amber-600" /></span>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Pagination */}
                    {partnerTotalPages > 1 && (
                      <div className="flex items-center justify-between px-2 py-2 border-t border-border/20 text-[11px] text-muted-foreground mt-2">
                        <span>{malePreviousTests.length} result{malePreviousTests.length !== 1 ? 's' : ''} &bull; Page {partnerTestPage} of {partnerTotalPages}</span>
                        <div className="flex items-center gap-1">
                          <button type="button" disabled={partnerTestPage <= 1} onClick={() => setPartnerTestPage(p => Math.max(1, p - 1))} className="px-2 py-0.5 rounded border border-border/40 bg-muted/30 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed">← Prev</button>
                          {Array.from({ length: partnerTotalPages }, (_, idx) => idx + 1)
                            .filter(p => p === 1 || p === partnerTotalPages || Math.abs(p - partnerTestPage) <= 1)
                            .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                              if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                              acc.push(p);
                              return acc;
                            }, [])
                            .map((p, idx) =>
                              p === '...' ? (
                                <span key={`ellipsis-${idx}`} className="px-1">…</span>
                              ) : (
                                <button key={p} type="button" onClick={() => setPartnerTestPage(p as number)} className={`px-2 py-0.5 rounded border ${partnerTestPage === p ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border/40 bg-muted/30 hover:bg-muted'}`}>{p}</button>
                              )
                            )
                          }
                          <button type="button" disabled={partnerTestPage >= partnerTotalPages} onClick={() => setPartnerTestPage(p => Math.min(partnerTotalPages, p + 1))} className="px-2 py-0.5 rounded border border-border/40 bg-muted/30 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed">Next →</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 7. Genetic Tests */}
                {maleGeneticTests.length > 0 && (
                  <div>
                    <SubSectionDivider label={`Genetic Tests (${maleGeneticTests.length} record${maleGeneticTests.length !== 1 ? 's' : ''})`} />
                    {maleGeneticTests.map((g, i) => (
                      <div key={i} className="border rounded p-2 mb-1 bg-muted/20 text-xs">
                        <span className="font-medium">{g.test}</span> — {g.date}: <span>{g.result}</span> {g.notes && `(${g.notes})`}
                        {g.fileUrl && (
                          <div className="flex items-center gap-1 pt-1 border-t border-muted/40 mt-1">
                            <Paperclip className="h-3 w-3 text-muted-foreground" />
                            <a href={normaliseFileUrl(g.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]">{g.fileName || "Attached file"}</a>
                            {g.filePassword && <span className="flex items-center gap-0.5 text-amber-600"><KeyRound className="h-3 w-3" /> Password on file</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 8. Radiology Studies (maleRadiologyStudies — top-level column) */}
                {maleRadiologyStudies.length > 0 && (
                  <div>
                    <SubSectionDivider label={`Radiology Studies (${maleRadiologyStudies.length} record${maleRadiologyStudies.length !== 1 ? 's' : ''})`} />
                    <div className="space-y-2">
                      {maleRadiologyStudies.map((study, i) => (
                        <div key={study.id || i} className="border rounded p-3 bg-muted/20 text-xs space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {study.type && <Badge variant="outline" className="text-xs">{study.type}</Badge>}
                            {study.date && <span className="text-muted-foreground">{study.date}</span>}
                            {study.performedBy && <span>@ {study.performedBy}</span>}
                            {study.studyName && <span className="font-medium">{study.studyName}</span>}
                          </div>
                          {study.findings && <div><span className="text-muted-foreground">Findings:</span> {study.findings}</div>}
                          {study.conclusion && <div><span className="text-muted-foreground">Conclusion:</span> {study.conclusion}</div>}
                          {study.tvus?.uterusNotes && <div><span className="text-muted-foreground">Uterus Notes:</span> {study.tvus.uterusNotes}</div>}
                          {study.tvus?.ovarianNotes && <div><span className="text-muted-foreground">Ovarian Notes:</span> {study.tvus.ovarianNotes}</div>}
                          {study.fileUrl && (
                            <div className="flex items-center gap-1 pt-1 border-t border-muted/40">
                              <Paperclip className="h-3 w-3 text-muted-foreground" />
                              <a href={normaliseFileUrl(study.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]">{study.fileName || "Attached file"}</a>
                            </div>
                          )}
                          {/* AI Translation — Read-Only (keyed by study.docId for stable ownership) */}
                          {study.docId ? (
                            <SavedTranslationsPanel
                              leadDocumentId={study.docId}
                              fileUrl={normaliseFileUrl(study.fileUrl ?? "")}
                              fileName={study.fileName ?? "report"}
                              mimeType={study.fileMimeType}
                              patientId={intake?.patientId ?? 0}
                              readOnly
                            />
                          ) : study.fileUrl ? (
                            <div className="flex items-center gap-1.5 text-xs text-amber-600 italic px-1 pt-1">
                              <span>⚠ Legacy file — re-upload to enable AI extraction</span>
                            </div>
                          ) : null}
                          {parseJSONArray<any>(study.images).length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              {parseJSONArray<any>(study.images).map((img: any, ii: number) => (
                                <a key={ii} href={normaliseFileUrl(img.fileUrl ?? "")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs flex items-center gap-0.5">
                                  <Paperclip className="h-3 w-3" />{img.fileName || `Image ${ii + 1}`}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 9. General Attachments (generalAttachmentsMale — top-level column) */}
                {generalAttachmentsMale.length > 0 && (
                  <div>
                    <SubSectionDivider label={`General Attachments (${generalAttachmentsMale.length} file${generalAttachmentsMale.length !== 1 ? 's' : ''})`} />
                    <div className="space-y-2">
                      {generalAttachmentsMale.map((att, i) => att.fileUrl ? (
                        <div key={i} className="flex items-center gap-2 text-xs border rounded p-2 bg-muted/20">
                          <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                          <FileViewButton fileUrl={att.fileUrl} fileName={att.fileName} mimeType={(att as any).mimeType} label={att.tag || att.fileName} />
                          {att.tag && <Badge variant="outline" className="text-xs shrink-0">{att.tag}</Badge>}
                          {att.docPassword && <span className="flex items-center gap-0.5 text-amber-600 shrink-0"><KeyRound className="h-3 w-3" /></span>}
                        </div>
                      ) : null)}
                    </div>
                  </div>
                )}

                {/* Surgical History count */}
                {(maleIntake?.previousSurgeries?.length ?? 0) > 0 && (
                  <div>
                    <SubSectionDivider label={`Surgical History (${maleIntake!.previousSurgeries!.length} record${maleIntake!.previousSurgeries!.length !== 1 ? 's' : ''})`} />
                    <p className="text-xs text-muted-foreground">Full details are visible in the Male tab of this Health Record.</p>
                  </div>
                )}
              </div>
            ) : (
              /* ── Male-primary record: partner data is in top-level female fields ── */
              <div className="space-y-4">
                <dl className="space-y-0">
                  {maleIntake?.femalePartnerDob && <InfoRow label="Date of Birth" value={fmtDate(maleIntake.femalePartnerDob)} />}
                  {(intake as any)?.profession && <InfoRow label="Profession" value={(intake as any).profession} />}
                  {(intake as any)?.infertilityType && <InfoRow label="Infertility Type" value={(intake as any).infertilityType === 'primary' ? 'Primary' : (intake as any).infertilityType === 'secondary' ? 'Secondary' : (intake as any).infertilityType} />}
                  {(intake as any)?.infertilityDuration && <InfoRow label="Duration of Infertility" value={(intake as any).infertilityDuration} />}
                  {(intake as any)?.partnerIsFirstMarriage === true && <InfoRow label="First Marriage" value="Yes" />}
                </dl>
                {/* Female partner surgical history count */}
                {parseJSONArray<SurgicalEntry>(intake?.surgicalHistory).length > 0 && (
                  <div>
                    <SubSectionDivider label={`Surgical History (${parseJSONArray<SurgicalEntry>(intake?.surgicalHistory).length} record${parseJSONArray<SurgicalEntry>(intake?.surgicalHistory).length !== 1 ? 's' : ''})`} />
                    <p className="text-xs text-muted-foreground">Full details are visible in the Female tab of this Health Record.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </SectionCard>
      );
    })()}
    </div>
  );
}
// ─── Edit Form ────────────────────────────────────────────────────────────────

function EditIntakeForm({ form, setForm, onSave, onCancel, isSaving, mode, id, leadDob = "", leadGender = "female", onUpdateLeadDob, femaleFertilityDiagnosis = [], maleFertilityDiagnosis = [], onFemaleDiagnosisChange, onMaleDiagnosisChange, leadSource = "", onCreateVisitAppointment, initialPartnerTab = "female", onPartnerTabChange, ownerName, partnerOwnerName, partnerGender = "", contraceptiveGate, onContraceptiveChange, femaleGeneticsGate, onFemaleGeneticsChange, draftSessionId, activeWriterToken, isWriteActive = true, lockDecisionMade = true, onTouchSession }: {
  form: any;
  setForm: (f: any) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  mode: "lead" | "patient";
  id: number;
  leadDob?: string;
  leadGender?: string;
  onUpdateLeadDob?: (dob: string) => void;
  femaleFertilityDiagnosis?: string[];
  maleFertilityDiagnosis?: string[];
  onFemaleDiagnosisChange?: (v: string[]) => void;
  onMaleDiagnosisChange?: (v: string[]) => void;
  leadSource?: string;
  onCreateVisitAppointment?: (date: string) => void;
  initialPartnerTab?: string;
  onPartnerTabChange?: (v: string) => void;
  ownerName?: string;
  partnerOwnerName?: string;
  partnerGender?: string;
  /** Lifted contraceptive Yes/No gate state (lives in outer MedicalIntakeForm) */
  contraceptiveGate?: boolean | null;
  /** Callback to update gate value and dirty flag in outer component */
  onContraceptiveChange?: (v: boolean, dirty?: boolean) => void;
  /** Lifted female genetics Yes/No gate state (lives in outer MedicalIntakeForm) */
  femaleGeneticsGate?: boolean | null;
  /** Callback to update female genetics gate + dirty flag in outer component */
  onFemaleGeneticsChange?: (v: boolean | null, dirty?: boolean) => void;
  /** Stable draft session ID for pending-draft uploads */
  draftSessionId?: string | null;
  /** Server-issued writer token (independent of draftSessionId). Must be passed to all mutations. */
  activeWriterToken?: string | null;
  /** Whether this tab currently holds the write lock */
  isWriteActive?: boolean;
  /** True once the 150ms BroadcastChannel lock negotiation has resolved.
   * Used to suppress the false "Another tab" warning flash on every Edit open. */
  lockDecisionMade?: boolean;
  /** Call when meaningful activity occurs to renew the 24h expiry window */
  onTouchSession?: () => void;
}) {
  const f = (key: string) => form[key] ?? "";
  const set = (key: string, val: any) => setForm((prev: any) => ({ ...prev, [key]: val }));
  // Partner tab state — initialized from prop so edit mode starts on same tab as read-only
  const [editPartnerTab, setEditPartnerTab] = useState(initialPartnerTab);


    // ── File upload mutation ──────────────────────────────────────────
  const utils = trpc.useUtils();
  // Pending-draft upload mutations (Phase 2: all Health Record form uploads use pending-draft lifecycle)
  const leadPendingUpload = trpc.leads.uploadPendingIntakeFile.useMutation();
  const patientPendingUpload = trpc.patients.uploadPendingIntakeFile.useMutation();
  // Direct upload mutations (used only for non-draft upload paths e.g. direct section uploads)
  const leadUpload = trpc.leads.uploadIntakeFile.useMutation();
  const patientUpload = trpc.patients.uploadIntakeFile.useMutation();
  const leadDeleteDoc = trpc.leads.deleteDocument.useMutation();
  const patientDeleteDoc = trpc.patients.deleteDocument.useMutation();
  const leadUpdateTag = trpc.leads.updateDocumentTag.useMutation();
  const patientUpdateTag = trpc.patients.updateDocumentTag.useMutation();
  const extractSemenMutation = trpc.leads.extractSemenAnalysis.useMutation();
  // Fix C: partial-save mutations for immediate artHistory persistence after PGT file upload
  const leadPartialSave = trpc.leads.saveMedicalIntake.useMutation();
  const patientPartialSave = trpc.patients.saveIntake.useMutation();
  // Dynamic female diagnosis options from Field Options Manager
  const { data: dynFemaleDiagnoses } = trpc.dropdownOptions.list.useQuery(
    { fieldKey: "female_fertility_diagnosis" },
    { staleTime: 0 }
  );
  const dynamicFemaleDiagnosisGroups = buildFemaleDiagnosisGroups(
    dynFemaleDiagnoses as RawDropdownOption[] | null | undefined,
    femaleFertilityDiagnosis,
  );

  // Sync tag edits from intake sections to the lead_documents record
  const handleTagUpdate = async (docId: number, tag: string) => {
    try {
      if (mode === "lead") {
        await leadUpdateTag.mutateAsync({ id: docId, tag });
        utils.leads.documents.invalidate({ leadId: id });
      } else {
        await patientUpdateTag.mutateAsync({ id: docId, tag });
        utils.patients.documents.invalidate({ patientId: id });
      }
    } catch {
      // Non-critical — silently ignore
    }
  };

  // Delete a lead_document record when a file is removed from an intake entry
  // Also invalidates the documents query so the Documents tab stays in sync
  const deleteIntakeDoc = async (docId?: number) => {
    if (!docId) return;
    try {
      if (mode === "lead") {
        await leadDeleteDoc.mutateAsync({ id: docId });
        utils.leads.documents.invalidate({ leadId: id });
      } else {
        await patientDeleteDoc.mutateAsync({ id: docId });
        utils.patients.documents.invalidate({ patientId: id });
      }
    } catch {
      // Non-critical — document may already be deleted
    }
  };

  /**
   * Shared upload helper — Phase 2 Correction.
   * All inline upload handlers call this instead of directly calling leadUpload/patientUpload.
   * When draftSessionId is set, uses pending-draft lifecycle.
   * Returns { fileKey, fileUrl, fileName, docId, lifecycleStatus }.
   */
  const uploadIntakeFilePending = async (
    b64: string,
    fileName: string,
    mimeType: string,
    intakeSection: string,
    oldDocId?: number,
    oldLifecycle?: string,
  ) => {
    if (!draftSessionId || !activeWriterToken) {
      throw new Error("No active draft session. Please refresh and try again.");
    }
    // Pending-draft path (legacy fallback removed — Phase 2 Final Correction)
    if (oldDocId && oldLifecycle === "pending-draft") await deleteIntakeDoc(oldDocId);
    const mutation = mode === "lead" ? leadPendingUpload : patientPendingUpload;
    const payload = mode === "lead"
      ? { leadId: id, fileBase64: b64, fileName, mimeType, intakeSection, draftSessionId, activeWriterToken, pendingSection: intakeSection }
      : { patientId: id, fileBase64: b64, fileName, mimeType, intakeSection, draftSessionId, activeWriterToken, pendingSection: intakeSection };
    const result = await (mutation.mutateAsync as any)(payload);
    // Renew the 24h expiry window on meaningful activity
    onTouchSession?.();
    return { ...result, lifecycleStatus: "pending-draft" as const };
  };

  // Generic file-upload helper for any entry list
  // sectionName is stored as intakeSection so the Documents tab auto-tags the file
  // Phase 2: uses pending-draft lifecycle when draftSessionId is available
  const makeUploadHandler = <T extends { fileKey?: string; fileUrl?: string; fileName?: string; docId?: number; lifecycleStatus?: string }>(listKey: string, sectionName?: string) =>
    (i: number, file: File, list: T[], setList: (v: T[]) => void) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const b64 = (ev.target?.result as string).split(",")[1];
        try {
          const oldDocId = (list[i] as any)?.docId;
          const oldLifecycle = (list[i] as any)?.lifecycleStatus;
          // Phase 2 Final Correction: require draftSessionId + activeWriterToken (legacy fallback removed)
          if (!draftSessionId || !activeWriterToken) {
            toast.error("No active draft session. Please refresh and try again.");
            return;
          }
          // If replacing a pending-draft file, delete it immediately (never been saved)
          if (oldDocId && oldLifecycle === "pending-draft") await deleteIntakeDoc(oldDocId);
          // If replacing an active/saved file, defer removal to Save (deferred removal)
          const pendingRemovals: number[] = Array.isArray((form as any).__pendingRemovals)
            ? [...(form as any).__pendingRemovals]
            : [];
          if (oldDocId && oldLifecycle !== "pending-draft" && !pendingRemovals.includes(oldDocId)) {
            pendingRemovals.push(oldDocId);
            setForm((prev: any) => ({ ...prev, __pendingRemovals: pendingRemovals }));
          }
          const mutation = mode === "lead" ? leadPendingUpload : patientPendingUpload;
          const payload = mode === "lead"
            ? { leadId: id, fileBase64: b64, fileName: file.name, mimeType: file.type, intakeSection: sectionName, draftSessionId, activeWriterToken, pendingSection: sectionName }
            : { patientId: id, fileBase64: b64, fileName: file.name, mimeType: file.type, intakeSection: sectionName, draftSessionId, activeWriterToken, pendingSection: sectionName };
          const result = await (mutation.mutateAsync as any)(payload);
          const updated = [...list];
          updated[i] = { ...updated[i], fileKey: result.fileKey, fileUrl: result.fileUrl, fileName: result.fileName, docId: result.docId, lifecycleStatus: "pending-draft" };
          setList(updated);
          set(listKey, updated);
          toast.success("File uploaded");
          // Renew the 24h expiry window on meaningful activity
          onTouchSession?.();
        } catch (e: any) {
          toast.error("Upload failed: " + (e?.message ?? "Unknown error"));
          setList(list); // reset uploading state
        }
      };
      reader.readAsDataURL(file);
    };

  const artHistory: ARTCycle[] = parseJSONArray<ARTCycle>(form.artHistory);
  const surgicalHistory: SurgicalEntry[] = parseJSONArray<SurgicalEntry>(form.surgicalHistory);
  const miscarriageHistory: MiscarriageEntry[] = parseJSONArray<MiscarriageEntry>(form.miscarriageHistory);
  // Female Previous Tests: no render-time fallback — an empty array is a valid intentional state.
  // FEMALE_DEFAULT_TESTS are only seeded on the first intentional Yes click (event-based init).
  const previousTests: TestEntry[] = parseJSONArray<TestEntry>(form.previousTests);
  const systemicDiseases: SystemicDiseases = parseJSON(form.systemicDiseases, { ...DEFAULT_SYSTEMIC });
  const _rawMaleIntake: MaleIntake = parseJSON(form.maleIntake, { ...DEFAULT_MALE_INTAKE });
  // Normalize all nested array fields inside maleIntake to prevent .map() crashes
  // Male Previous Tests: same policy — no render-time fallback; empty array is valid.
  const rawMaleTests = parseJSONArray<TestEntry>(_rawMaleIntake?.previousTests);
  const maleIntake: MaleIntake = {
    ..._rawMaleIntake,
    previousSurgeries: parseJSONArray<SurgicalEntry>(_rawMaleIntake?.previousSurgeries),
    semenAnalysis: parseJSONArray<any>(_rawMaleIntake?.semenAnalysis),
    dnaFragmentation: parseJSONArray<any>(_rawMaleIntake?.dnaFragmentation),
    previousTests: rawMaleTests,
    geneticTests: parseJSONArray<any>(_rawMaleIntake?.geneticTests),
  };

  const setMale = (key: keyof MaleIntake, val: any) => {
    setForm((prev: any) => ({
      ...prev,
      maleIntake: { ...parseJSON(prev.maleIntake, { ...DEFAULT_MALE_INTAKE }), [key]: val },
    }));
  };

  const leadGenderNormalized = String(leadGender || "").toLowerCase();
  const leadDobBelongsToMale = leadGenderNormalized === "male";
  const femaleLeadDob = leadDobBelongsToMale ? "" : leadDob;
  const maleLeadDob = leadDobBelongsToMale ? leadDob : "";

  const [voiceText, setVoiceText] = useState("");
  const [maleBmiManual, setMaleBmiManual] = useState(false);
  const [pendingDnaFill, setPendingDnaFill] = useState<Partial<DnaFragmentationEntry> | null>(null);
  const [pendingSemenFill, setPendingSemenFill] = useState<Partial<SemenAnalysisEntry> | null>(null);

  // ── Yes/No gates for complex sections ──────────────────────────────────────
  // null = not answered yet, true = yes, false = no
  const [hasMiscarriages, setHasMiscarriages] = useState<boolean | null>(
    miscarriageHistory.length > 0 ? true : null
  );
  const [hasPreviousTreatments, setHasPreviousTreatments] = useState<boolean | null>(
    artHistory.length > 0 ? true : null
  );
  const [hasFemaleSurgeries, setHasFemaleSurgeries] = useState<boolean | null>(
    surgicalHistory.length > 0 ? true : null
  );
  const [hasSemenAnalysis, setHasSemenAnalysis] = useState<boolean | null>(
    (maleIntake.semenAnalysis?.length ?? 0) > 0 ? true : null
  );
  const [hasDnaFragmentation, setHasDnaFragmentation] = useState<boolean | null>(
    (maleIntake.dnaFragmentation?.length ?? 0) > 0 ? true : null
  );
  const [hasMaleSurgeries, setHasMaleSurgeries] = useState<boolean | null>(
    (maleIntake.previousSurgeries?.length ?? 0) > 0 ? true : null
  );
  // Female remaining gates
  const [hasPregnancyHistory, setHasPregnancyHistory] = useState<boolean | null>(
    (form.gravida ?? 0) > 0 || (form.para ?? 0) > 0 || (form.abortus ?? 0) > 0 ? true : null
  );
  // hasFemaleTests: explicit boolean persisted in form.hasPreviousTests.
  // Loading policy: explicit boolean wins; fall back to array length for backward compat.
  const [hasFemaleTests, setHasFemaleTests] = useState<boolean | null>(() => {
    if (form.hasPreviousTests === true) return true;
    if (form.hasPreviousTests === false) return false;
    // Legacy: no explicit boolean — infer from array
    const rawLen = parseJSONArray<TestEntry>(form.previousTests).length;
    return rawLen > 0 ? true : null;
  });
  const [hasFemaleRadiology, setHasFemaleRadiology] = useState<boolean | null>(
    (parseJSON(form.radiologyResults, []) as any[]).length > 0 ? true : null
  );
  // Female genetics gate is lifted to outer MedicalIntakeForm — use prop
  const hasFemaleGenetics = femaleGeneticsGate ?? null;
  const setHasFemaleGenetics = (v: boolean | null, dirty = true) => onFemaleGeneticsChange?.(v, dirty);
  const [hasFemaleHealthConditions, setHasFemaleHealthConditions] = useState<boolean | null>(
    systemicDiseases && Object.values(systemicDiseases).some(v => v === true) ? true : null
  );
  const [hasFemaleFamilyHistory, setHasFemaleFamilyHistory] = useState<boolean | null>(
    !!(form.hereditaryDiseases || form.familyBreastCancer || form.familyEarlyMenopause || form.familyInfertility) ? true : null
  );
  const [hasFemaleKnownDiagnosis, setHasFemaleKnownDiagnosis] = useState<boolean | null>(
    (femaleFertilityDiagnosis?.length ?? 0) > 0 ? true : null
  );
  // Contraceptive gate and dirty tracking are lifted to outer MedicalIntakeForm
  // and passed down via contraceptiveGate / onContraceptiveChange props.
  const hasFemaleContraceptive = contraceptiveGate ?? null;
  const setHasFemaleContraceptive = (v: boolean) => onContraceptiveChange?.(v, true);
  const [hasFemaleMedications, setHasFemaleMedications] = useState<boolean | null>(
    !!(form.currentMedications) ? true : null
  );
  const [hasFemaleAllergies, setHasFemaleAllergies] = useState<boolean | null>(
    !!(form.allergies) ? true : null
  );
  // Male remaining gates
  const [hasMaleTests, setHasMaleTests] = useState<boolean | null>(
    (maleIntake.previousTests?.length ?? 0) > 0 ? true : null
  );
  const [hasMaleRadiology, setHasMaleRadiology] = useState<boolean | null>(
    (parseJSONArray(form.maleRadiologyStudies)?.length ?? 0) > 0 ? true : null
  );
  const [hasMaleGenetics, setHasMaleGenetics] = useState<boolean | null>(
    (maleIntake.geneticTests?.length ?? 0) > 0 ? true : null
  );
  const [hasMaleHealthConditions, setHasMaleHealthConditions] = useState<boolean | null>(
    parseJSON(maleIntake.systemicDiseases, {}) && Object.values(parseJSON(maleIntake.systemicDiseases, {}) as Record<string,unknown>).some(v => v === true) ? true : null
  );
  const [hasMaleFamilyHistoryGate, setHasMaleFamilyHistoryGate] = useState<boolean | null>(
    !!(maleIntake.hereditaryDiseases) ? true : null
  );
  const [hasMaleKnownDiagnosis, setHasMaleKnownDiagnosis] = useState<boolean | null>(
    (maleFertilityDiagnosis?.length ?? 0) > 0 ? true : null
  );
  const [hasMaleMedications, setHasMaleMedications] = useState<boolean | null>(
    !!(maleIntake.currentMedications) ? true : null
  );
  const [hasMaleAllergies, setHasMaleAllergies] = useState<boolean | null>(
    !!(maleIntake.allergies) ? true : null
  );
  const [showMiscarriageCountConfirm, setShowMiscarriageCountConfirm] = useState(false);
  const [pendingMiscarriageCount, setPendingMiscarriageCount] = useState<number | null>(null);

  const applyMiscarriageCount = useCallback((count: number) => {
    const nextCount = Math.max(1, count);
    set("miscarriageHistory", buildMiscarriageEntries(nextCount, miscarriageHistory));
    setHasMiscarriages(true);
  }, [miscarriageHistory, set]);

  const requestMiscarriageCountChange = useCallback((count: number) => {
    if (!Number.isFinite(count)) return;
    const nextCount = Math.max(1, Math.floor(count));
    const currentCount = miscarriageHistory.length;
    if (nextCount === currentCount) return;
    if (nextCount > currentCount) {
      applyMiscarriageCount(nextCount);
      return;
    }
    setPendingMiscarriageCount(nextCount);
    setShowMiscarriageCountConfirm(true);
  }, [applyMiscarriageCount, miscarriageHistory.length]);

  const confirmMiscarriageCountChange = useCallback(() => {
    if (pendingMiscarriageCount == null) return;
    // Phase 2: deferred removal — collect docIds from removed entries
    // pending-draft docs are deleted immediately; active docs are deferred to Save
    const removedEntries = miscarriageHistory.slice(pendingMiscarriageCount);
    const pendingRemovals: number[] = Array.isArray((form as any).__pendingRemovals)
      ? [...(form as any).__pendingRemovals]
      : [];
    for (const entry of removedEntries) {
      if ((entry as any)?.docId) {
        const docId = (entry as any).docId as number;
        const lifecycle = (entry as any).lifecycleStatus;
        if (lifecycle === 'pending-draft') {
          // Delete immediately (never been saved)
          deleteIntakeDoc(docId);
        } else if (!pendingRemovals.includes(docId)) {
          pendingRemovals.push(docId);
        }
      }
    }
    set("miscarriageHistory", miscarriageHistory.slice(0, pendingMiscarriageCount));
    setHasMiscarriages(pendingMiscarriageCount > 0 ? true : null);
    setPendingMiscarriageCount(null);
    setShowMiscarriageCountConfirm(false);
    if (pendingRemovals.length > 0) {
      setForm((prev: any) => ({ ...prev, __pendingRemovals: pendingRemovals }));
    }
  }, [miscarriageHistory, pendingMiscarriageCount, set, form, deleteIntakeDoc]);

  const cancelMiscarriageCountChange = useCallback(() => {
    setPendingMiscarriageCount(null);
    setShowMiscarriageCountConfirm(false);
  }, []);

  // ── Auto-sync Yes/No gates when underlying data changes (e.g. after document upload from Documents tab) ──
  // This handles the case where a file is uploaded from the Documents tab and the intake form
  // is already open — the gate state needs to update to reflect the new data.
  useEffect(() => {
    if ((maleIntake.semenAnalysis?.length ?? 0) > 0) setHasSemenAnalysis(true);
  }, [maleIntake.semenAnalysis?.length]);

  useEffect(() => {
    if ((maleIntake.dnaFragmentation?.length ?? 0) > 0) setHasDnaFragmentation(true);
  }, [maleIntake.dnaFragmentation?.length]);

  useEffect(() => {
    if ((maleIntake.previousSurgeries?.length ?? 0) > 0) setHasMaleSurgeries(true);
  }, [maleIntake.previousSurgeries?.length]);

  useEffect(() => {
    if ((maleIntake.geneticTests?.length ?? 0) > 0) setHasMaleGenetics(true);
  }, [maleIntake.geneticTests?.length]);

  useEffect(() => {
    if ((artHistory?.length ?? 0) > 0) setHasPreviousTreatments(true);
  }, [artHistory?.length]);

  useEffect(() => {
    if ((surgicalHistory?.length ?? 0) > 0) setHasFemaleSurgeries(true);
  }, [surgicalHistory?.length]);

  // Removed: the old auto-true effect that forced hasFemaleTests=true whenever previousTests.length > 0.
  // An empty array is now a valid intentional state (Yes + [] is distinct from No + []).

  // Bug-row repair: if the saved record contains exactly one fully blank row (the bug generated
  // by the old onYes callback), replace it with MALE_DEFAULT_TESTS in form state on mount.
  // This runs once on component mount (empty dep array) and writes via setMale so that
  // the repaired list is included in the Save payload — not just shown in the UI.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const tests = parseJSONArray<TestEntry>(parseJSON(form.maleIntake, {} as MaleIntake)?.previousTests);
    if (tests.length !== 1) return;
    const t = tests[0];
    const isBugRow =
      (!t.name || t.name.trim() === "") &&
      (!t.result || t.result.trim() === "") &&
      (!t.unit || t.unit.trim() === "") &&
      (!t.date || t.date.trim() === "") &&
      (!t.collectionDate || t.collectionDate.trim() === "") &&
      (!t.reportDate || t.reportDate.trim() === "") &&
      (!t.referenceRange || t.referenceRange.trim() === "") &&
      (!t.interpretation || t.interpretation.trim() === "") &&
      (!t.resultSummary || t.resultSummary.trim() === "") &&
      !t.fileUrl &&
      !t.fileKey &&
      (!t.history || t.history.length === 0) &&
      (!t.extraFields || !Object.values(t.extraFields).some(v => v !== null && v !== undefined && String(v).trim() !== "")) &&
      t.origin !== "custom";
    if (isBugRow) {
      setMale("previousTests", MALE_DEFAULT_TESTS.map(t2 => ({ ...t2 })));
      setHasMaleTests(true);
    }
  // Run once on mount only — dependencies intentionally omitted
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if ((parseJSONArray(form.maleRadiologyStudies)?.length ?? 0) > 0) setHasMaleRadiology(true);
  }, [(parseJSONArray(form.maleRadiologyStudies) as any[])?.length]);

  // Unit selectors (UI-only, values stored in metric in DB)
  const [femaleHeightUnit, setFemaleHeightUnit] = useState<HeightUnit>("cm");
  const [femaleWeightUnit, setFemaleWeightUnit] = useState<WeightUnit>("kg");
  const [maleHeightUnit, setMaleHeightUnit] = useState<HeightUnit>("cm");
  const [maleWeightUnit, setMaleWeightUnit] = useState<WeightUnit>("kg");

  // Auto-calc BMI (Wife)
  useEffect(() => {
    if (!form.bmiManual && form.heightCm && form.weightKg) {
      const bmi = calcBMI(form.heightCm, form.weightKg);
      if (bmi) set("bmi", bmi);
    }
  }, [form.heightCm, form.weightKg, form.bmiManual]);

  // Auto-calc BMI (Husband)
  useEffect(() => {
    if (!maleBmiManual) {
      const male: MaleIntake = parseJSON(form.maleIntake, { ...DEFAULT_MALE_INTAKE });
      const bmi = calcBMI(male.heightCm ?? "", male.weightKg ?? "");
      if (bmi) setMale("bmi", bmi);
    }
  }, [
    (parseJSON(form.maleIntake, DEFAULT_MALE_INTAKE) as MaleIntake).heightCm,
    (parseJSON(form.maleIntake, DEFAULT_MALE_INTAKE) as MaleIntake).weightKg,
    maleBmiManual,
  ]);

  // ── Phase 2: intakeMode detection (edit mode) ─────────────────────────────────
  const editIntakeMode = form?.intakeMode ?? null;
  // Phase 2 backfill fix: NULL = unidentified new record → treat as general (needs identification)
  const editIsLegacy = editIntakeMode === 'legacy'; // ONLY explicit 'legacy'
  const editIsFemale = editIntakeMode === 'female';
  const editIsMale = editIntakeMode === 'male';
  const editIsGeneral = editIntakeMode === 'general' || editIntakeMode === null; // null = unidentified

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <VoiceAIFill onTranscribed={setVoiceText} />
        <div className="flex gap-2">
          {/* Cancel is NEVER disabled — even inactive-tab coordinators must be able to
              exit Edit mode. The onCancel handler checks isWriteActive to decide whether
              to call server cancellation (active writer) or just close locally (inactive). */}
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={onSave} disabled={isSaving || !isWriteActive} className="gap-1.5" title={!isWriteActive ? "Another tab is editing this record" : undefined}>
            <Save className="h-3.5 w-3.5" />
            {isSaving ? "Saving..." : "Save Intake"}
          </Button>
        </div>
      </div>

      {/* Phase 2 Final Acceptance: Central read-only enforcement via fieldset.
          When !isWriteActive, all inputs/selects/buttons inside are disabled at the DOM level.
          This is a defense-in-depth measure; individual handler guards also check isWriteActive. */}
      {/* Phase 2: Cross-tab lock warning */}
      {/* Show the "Another tab" warning ONLY after the lock negotiation has resolved
          (lockDecisionMade=true). During the 150ms negotiation window, isWriteActive is
          temporarily false even when no real competing tab exists — suppressing the
          warning here prevents the false flash on every Edit open. */}
      {lockDecisionMade && !isWriteActive && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-yellow-50 border border-yellow-300 text-yellow-900 dark:bg-yellow-900/20 dark:border-yellow-600 dark:text-yellow-200 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />
          <span className="font-semibold">Another tab is editing this record.</span>
          <span>Changes in this tab cannot be saved until the other tab is closed or finishes editing.</span>
        </div>
      )}

      {/* Phase 2: Mode banners in edit mode */}
      {editIsLegacy && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300 text-xs">
          <span className="font-semibold">Legacy Record</span>
          <span>This health record was created before the female/male workflow separation. Both tabs are shown as-is.</span>
        </div>
      )}
      {editIsFemale && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-pink-50 border border-pink-200 text-pink-800 dark:bg-pink-900/20 dark:border-pink-700 dark:text-pink-300 text-xs">
          <span className="font-semibold">Female Health Record</span>
          <span>Editing female patient's medical data.</span>
        </div>
      )}
      {editIsMale && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300 text-xs">
          <span className="font-semibold">Male Health Record</span>
          <span>Editing male patient's medical data.</span>
        </div>
      )}
      {editIsGeneral && (
        <div className="flex flex-col gap-4 px-5 py-5 rounded-lg bg-orange-50 border-2 border-orange-300 text-orange-900 dark:bg-orange-900/20 dark:border-orange-600 dark:text-orange-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-orange-600" />
            <span className="font-bold text-sm">Select the Health Record type to display the correct medical record template</span>
          </div>
          <p className="text-xs text-orange-800 dark:text-orange-300">
            New records must be identified as Female or Male before entering detailed medical data.
            Choosing a type will show the correct fields and hide irrelevant ones. You can change this later.
          </p>
          {(() => {
            // Owner-only identification: this screen asks only "what gender is THIS Health Record?"
            // The linked partner is NOT part of this decision — they have their own medical_intake context.
            const gender = String(leadGender ?? '').toLowerCase();
            const setFemale = () => setForm((prev: any) => ({ ...prev, intakeMode: 'female' }));
            const setMale = () => setForm((prev: any) => ({ ...prev, intakeMode: 'male' }));
            if (gender === 'female') {
              return (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5 border-pink-400 text-pink-700 hover:bg-pink-50 font-medium" onClick={setFemale}>
                    <span className="text-base">♀</span> {ownerName ? `${ownerName} — Female Health Record` : 'Set as Female Health Record'}
                  </Button>
                </div>
              );
            }
            if (gender === 'male') {
              return (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5 border-blue-400 text-blue-700 hover:bg-blue-50 font-medium" onClick={setMale}>
                    <span className="text-base">♂</span> {ownerName ? `${ownerName} — Male Health Record` : 'Set as Male Health Record'}
                  </Button>
                </div>
              );
            }
            // Gender unknown — show both generic options without any name
            return (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1.5 border-pink-400 text-pink-700 hover:bg-pink-50 font-medium" onClick={setFemale}>
                  <span className="text-base">♀</span> Set as Female Health Record
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 border-blue-400 text-blue-700 hover:bg-blue-50 font-medium" onClick={setMale}>
                  <span className="text-base">♂</span> Set as Male Health Record
                </Button>
              </div>
            );
          })()}
          <p className="text-xs text-orange-700 dark:text-orange-400 italic">
            Note: Selecting a type does not move or delete any existing data. Choosing a Health Record type does not automatically set or change the patient gender.
          </p>
        </div>
      )}

      {voiceText && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3">
            <p className="text-xs font-medium text-primary mb-1">Voice Transcription — review and apply manually:</p>
            <p className="text-sm whitespace-pre-wrap">{voiceText}</p>
            <Button variant="ghost" size="sm" className="mt-2 h-6 text-xs" onClick={() => setVoiceText("")}>
              <X className="h-3 w-3 mr-1" /> Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {editIsGeneral ? null : (
      <Tabs value={editIsFemale ? "female" : editIsMale ? "male" : editPartnerTab} onValueChange={editIsLegacy ? (v => { setEditPartnerTab(v); onPartnerTabChange?.(v); }) : undefined}>
        {/* Only show tab switcher for legacy records */}
        {editIsLegacy && (
        <TabsList className="mb-4">
          <TabsTrigger value="female">Wife (Female)</TabsTrigger>
          <TabsTrigger value="male">Husband (Male)</TabsTrigger>
        </TabsList>
        )}

        {/* ── Female Intake ── */}
                <TabsContent value="female" className="space-y-3">
          {/* P2-2: Source label — shown only for male-primary records where this tab contains reported partner data */}
          {editIsMale && (
            <div className="px-3 py-2.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700 dark:bg-slate-800/40 dark:border-slate-600 dark:text-slate-300 text-xs space-y-0.5">
              <p className="font-semibold">Reported Partner Information</p>
              <p>Partner information recorded during this male Health Record intake. It is stored separately from any linked partner's identity and Health Record.</p>
            </div>
          )}
          {/* P2-3: Linked-partner informational banner — shown when a partner is linked AND reported data exists */}
          {editIsMale && partnerOwnerName && hasMeaningfulReportedPartnerData(form, editIntakeMode) && (
            <div className="px-3 py-2.5 rounded-md bg-slate-100 border border-slate-300 text-slate-700 dark:bg-slate-800/60 dark:border-slate-500 dark:text-slate-300 text-xs space-y-0.5">
              <p className="font-semibold">Note: Linked partner record exists</p>
              <p>This Health Record contains partner information entered separately from the linked partner's own record. The linked partner's Health Record is the authoritative source for their medical information.</p>
            </div>
          )}
          {/* ── Quick Questionnaire ─────────────────────────────────────────── */}
          <SectionCard title="General Information">

            {/* ═══ 2-column balanced layout ═══════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-0">

              {/* ─── LEFT COLUMN: Patient Basics · Body Measurements · Lifestyle ─ */}
              <div>
                {/* ── Group 1: Patient Basics ── */}
                <SubSectionDivider label="Patient Basics" />
                <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                  {/* Date of Birth + Age */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">Date of Birth</Label>
                    <div className="flex items-center gap-1.5">
                      {leadDobBelongsToMale ? (
                        /* Intake-template DOB for female partner (stored in maleIntake.femalePartnerDob) */
                        /* Option C: saved only through Save Intake — no immediate DB write */
                        <input
                          type="date"
                          className="h-9 text-sm border rounded-md px-2 bg-background w-full"
                          value={maleIntake.femalePartnerDob ?? ""}
                          max={new Date().toISOString().split("T")[0]}
                          min="1900-01-01"
                          style={{ WebkitAppearance: 'none', appearance: 'none' } as any}
                          onChange={e => {
                            const v = e.target.value;
                            if (!v) { setMale('femalePartnerDob', ''); return; }
                            const d = new Date(v);
                            if (!isNaN(d.getTime()) && d.getFullYear() < 1900) { toast.error('Date of birth must be 1900 or later.'); return; }
                            if (isFutureDate(v)) { toast.error("You cannot select a future date. Please select a valid date."); setMale('femalePartnerDob', ''); return; }
                            // Option C: only update local form state — no immediate DB write
                            setMale('femalePartnerDob', v);
                          }}
                        />
                      ) : (
                        /* Option A: Identity DOB (femaleLeadDob) is read-only inside Medical Record */
                        /* Edit it from the Lead/Patient profile to keep identity as source of truth */
                        <div className="flex items-center gap-1.5 w-full">
                          <input
                            type="date"
                            className="h-9 text-sm border rounded-md px-2 bg-muted text-muted-foreground w-full cursor-not-allowed"
                            value={femaleLeadDob}
                            readOnly
                            disabled
                            title="Identity DOB is read-only here. Edit it from the Lead or Patient profile."
                          />
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0 whitespace-nowrap" title="Edit from Lead/Patient profile">
                            🔒 identity
                          </span>
                        </div>
                      )}
                      {(leadDobBelongsToMale ? maleIntake.femalePartnerDob : femaleLeadDob) && (
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0 whitespace-nowrap bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded">
                          {Math.floor((Date.now() - new Date((leadDobBelongsToMale ? maleIntake.femalePartnerDob! : femaleLeadDob)).getTime()) / (365.25 * 24 * 60 * 60 * 1000))}y
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Occupation */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">Occupation / Profession</Label>
                    <Input className="h-9 text-sm" value={f("profession")} onChange={e => set("profession", e.target.value)} placeholder="e.g. Teacher" />
                  </div>
                  {/* Planned Visit Date — full width */}
                  <div className="space-y-1 col-span-2">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">Planned Visit Date</Label>
                    <input
                      type="date"
                      className="h-9 text-sm border rounded-md px-2 bg-background w-full max-w-[220px]"
                      value={f("expectedVisitDate") ? new Date(f("expectedVisitDate")).toISOString().split("T")[0] : ""}
                      style={{ WebkitAppearance: 'none', appearance: 'none' } as any}
                      onChange={e => {
                        const v = e.target.value;
                        set("expectedVisitDate", v ? new Date(v) : undefined);
                        if (v) onCreateVisitAppointment?.(v);
                      }}
                    />
                  </div>
                </div>

                {/* ── Group 3: Body Measurements ── */}
                <SubSectionDivider label="Body Measurements" />
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="flex-1 min-w-[120px]">
                    <HeightWeightField
                      heightCm={f("heightCm")} weightKg={f("weightKg")}
                      onHeightChange={v => set("heightCm", v)}
                      onWeightChange={v => set("weightKg", v)}
                      heightUnit={femaleHeightUnit} weightUnit={femaleWeightUnit}
                      onHeightUnitChange={setFemaleHeightUnit}
                      onWeightUnitChange={setFemaleWeightUnit}
                    />
                  </div>
                  <div className="space-y-1 w-[110px]">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">BMI {form.bmiManual && <span className="text-primary">(manual)</span>}</Label>
                    <div className="flex gap-1">
                      <Input
                        type="number" value={f("bmi")} readOnly={!form.bmiManual}
                        onChange={e => set("bmi", e.target.value)}
                        className="h-9 text-sm"
                        placeholder="Auto"
                      />
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Toggle manual BMI"
                        onClick={() => set("bmiManual", !form.bmiManual)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* ── Group 4: Lifestyle & Habits ── */}
                <SubSectionDivider label="Lifestyle & Habits" />
                <div className="grid grid-cols-3 gap-x-3 gap-y-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">Smoking</Label>
                    <Select value={f("smoking") || "never"} onValueChange={v => set("smoking", v)}>
                      <SelectTrigger className="h-9 text-sm w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="never">Never</SelectItem>
                        <SelectItem value="former">Former</SelectItem>
                        <SelectItem value="current">Current</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">Alcohol</Label>
                    <Select value={f("alcohol") || "never"} onValueChange={v => set("alcohol", v)}>
                      <SelectTrigger className="h-9 text-sm w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="never">Never</SelectItem>
                        <SelectItem value="occasional">Occasional</SelectItem>
                        <SelectItem value="regular">Regular</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.smoking === "current" && (
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-foreground/70 leading-none">Packs/Day</Label>
                      <Input className="h-9 text-sm" value={f("smokingPacksPerDay")} onChange={e => set("smokingPacksPerDay", e.target.value)} />
                    </div>
                  )}
                </div>
                <div className="mt-3">
                  <CheckboxField label="Excessive hair growth (hirsutism)" checked={!!form.hirsutism} onChange={v => set("hirsutism", v)} />
                </div>
              </div>

              {/* ─── RIGHT COLUMN: Fertility Details · Medications · Referral ─── */}
              <div>
                {/* ── Group 2: Fertility & Relationship Details ── */}
                <SubSectionDivider label="Fertility & Relationship Details" />
                <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                  {/* Type of Infertility (female-specific) */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">Type of Infertility</Label>
                    <Select value={f("infertilityType") || ""} onValueChange={v => set("infertilityType", v)}>
                      <SelectTrigger className="h-9 text-sm w-full"><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="primary">Primary (never conceived)</SelectItem>
                        <SelectItem value="secondary">Secondary (conceived before)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* How long trying (female-specific) */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">How long trying?</Label>
                    <Input className="h-9 text-sm" value={f("infertilityDuration")} onChange={e => set("infertilityDuration", e.target.value)} placeholder="e.g. 2 years" />
                  </div>
                  {/* Children from previous relationship (female) */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">Children (Prev. Relationship)</Label>
                    <Input className="h-9 text-sm" type="number" placeholder="0" min="0"
                      value={form.childrenFromPreviousMarriage != null ? String(form.childrenFromPreviousMarriage) : ""}
                      onChange={e => set("childrenFromPreviousMarriage", e.target.value ? parseInt(e.target.value) : undefined)} />
                  </div>
                  {/* Date of Marriage — full width */}
                  <div className="space-y-1 col-span-2">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">Date of Marriage / Partnership</Label>
                    <input
                      type="date"
                      className="h-9 text-sm border rounded-md px-2 bg-background w-full max-w-[220px]"
                      min="1900-01-01"
                      value={f("marriageDate") ? new Date(f("marriageDate")).toISOString().split("T")[0] : ""}
                      style={{ WebkitAppearance: 'none', appearance: 'none' } as any}
                      onChange={e => set("marriageDate", e.target.value ? new Date(e.target.value) : undefined)}
                    />
                  </div>
                </div>
                {/* Checkboxes */}
                <div className="mt-3 space-y-2">
                  <CheckboxField label="This is my first marriage" checked={!!form.isFirstMarriage} onChange={v => set("isFirstMarriage", v)} />
                  <div className="space-y-1">
                    <span className="text-xs font-medium">Marriage Certificate</span>
                    <Select
                      value={(form as any).marriageCertStatus ?? "not_specified"}
                      onValueChange={v => { set("marriageCertStatus", v); set("hasCivilMarriageCertificate", v === "yes"); }}
                    >
                      <SelectTrigger className="h-8 text-xs">
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
                  <CheckboxField label="Parents are related (consanguinity)" checked={!!form.consanguinity} onChange={v => { set("consanguinity", v); setMale("consanguinity", v); }} />
                </div>
                {/* Marriage Certificate File Attachment */}
                {((form as any).marriageCertStatus === "yes" || (!((form as any).marriageCertStatus) && form.hasCivilMarriageCertificate)) && (
                  <MarriageCertAttachment
                    fileUrl={form.marriageCertFileUrl}
                    fileName={form.marriageCertFileName}
                    filePassword={form.marriageCertFilePassword}
                    docId={form.marriageCertDocId}
                    onUpload={(file) => {
                      const reader = new FileReader();
                      reader.onload = async (ev) => {
                        const b64 = (ev.target?.result as string).split(",")[1];
                        try {
                          const result = await uploadIntakeFilePending(b64, file.name, file.type, "MarriageCertificate", form.marriageCertDocId, (form as any).marriageCertLifecycleStatus);
                          set("marriageCertFileKey", result.fileKey);
                          set("marriageCertFileUrl", result.fileUrl);
                          set("marriageCertFileName", result.fileName);
                          set("marriageCertDocId", result.docId);
                          toast.success("Marriage certificate uploaded");
                        } catch (e: any) { toast.error("Upload failed: " + (e?.message ?? "Unknown error")); }
                      };
                      reader.readAsDataURL(file);
                    }}
                    onRemove={() => { deleteIntakeDoc(form.marriageCertDocId); set("marriageCertFileKey", undefined); set("marriageCertFileUrl", undefined); set("marriageCertFileName", undefined); set("marriageCertDocId", undefined); }}
                    onPasswordChange={v => set("marriageCertFilePassword", v)}
                  />
                )}

                {/* ── Group 5: Medications & Allergies ── */}
                <SubSectionDivider label="Medications & Allergies" />
                <div className="space-y-3">
                  <TA label="Current Medications" value={f("currentMedications")} onChange={v => set("currentMedications", v)} autoGrow placeholder="e.g. Metformin 500mg daily, Folic acid 5mg..." />
                  <TA label="Allergies (medicines, foods, or other)" value={f("allergies")} onChange={v => set("allergies", v)} autoGrow placeholder="e.g. Penicillin, latex, shellfish..." />
                </div>

                {/* ── Group 6: Referral / Source ── */}
                <SubSectionDivider label="Referral / Source" />
                <div className="flex items-center gap-2 py-1">
                  <span className="text-[11px] font-semibold text-foreground/70">How did you hear about us?</span>
                  {leadSource ? (
                    <Badge variant="secondary" className="text-xs">{LEAD_SOURCES[leadSource] ?? leadSource.replace(/-/g, " ")}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Not recorded</span>
                  )}
                  <span className="ml-1 text-[10px] text-muted-foreground flex items-center gap-0.5"><span>🔒</span> read-only</span>
                </div>
              </div>

            </div> {/* end 2-col grid */}

          </SectionCard>

          <SectionCard title="Pregnancy History">
            <YesNoGate
              question="Has the patient been pregnant before?"
              value={hasPregnancyHistory}
              hasData={!!(form.gravida || form.para || form.abortus || form.livingChildren || form.childrenFromPreviousMarriage || miscarriageHistory.length > 0)}
              dataCount={miscarriageHistory.length > 0 ? miscarriageHistory.length : undefined}
              confirmDescription={miscarriageHistory.length > 0
                ? getMiscarriageClearDescription(miscarriageHistory.length)
                : undefined}
              onChange={(v) => {
                setHasPregnancyHistory(v);
                if (!v) {
                  set("gravida", 0);
                  set("para", 0);
                  set("abortus", 0);
                  set("livingChildren", 0);
                  set("childrenFromPreviousMarriage", 0);
                  setHasMiscarriages(null);
                  set("miscarriageHistory", []);
                }
              }}
            >
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2" style={{width:'100%',maxWidth:'100%',boxSizing:'border-box'}}>
              <div className="space-y-1">
                <Label className="text-[10px] font-medium text-muted-foreground leading-none block">Pregnancies (G)</Label>
                <Input type="number" value={f("gravida")} onChange={e => set("gravida", e.target.value ? parseInt(e.target.value) : 0)} className="h-8 text-sm" placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-medium text-muted-foreground leading-none block">Births (P)</Label>
                <Input type="number" value={f("para")} onChange={e => set("para", e.target.value ? parseInt(e.target.value) : 0)} className="h-8 text-sm" placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-medium text-muted-foreground leading-none block">Abortions (A)</Label>
                <Input type="number" value={f("abortus")} onChange={e => set("abortus", e.target.value ? parseInt(e.target.value) : 0)} className="h-8 text-sm" placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-medium text-muted-foreground leading-none block">Living (L)</Label>
                <Input type="number" value={f("livingChildren")} onChange={e => set("livingChildren", e.target.value ? parseInt(e.target.value) : 0)} className="h-8 text-sm" placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-medium text-muted-foreground leading-none block">Prev. Rel.</Label>
                <Input type="number" value={f("childrenFromPreviousMarriage")} onChange={e => set("childrenFromPreviousMarriage", e.target.value ? parseInt(e.target.value) : 0)} className="h-8 text-sm" placeholder="0" />
              </div>
            </div>
            <div className="mt-3">
              <YesNoGate
                question="Has the patient had any miscarriages?"
                value={hasMiscarriages}
                hasData={miscarriageHistory.length > 0}
                dataCount={miscarriageHistory.length}
                confirmDescription={hasMeaningfulMiscarriageHistory(miscarriageHistory)
                  ? getMiscarriageClearDescription(miscarriageHistory.length)
                  : undefined}
                onChange={(v) => {
                  setHasMiscarriages(v);
                  if (!v) set("miscarriageHistory", []);
                }}
                onYes={() => {
                  if (miscarriageHistory.length === 0) {
                    set("miscarriageHistory", [createBlankMiscarriageEntry()]);
                  }
                }}
              >
                <div className="space-y-3">
                  <div className="space-y-1 max-w-[220px]">
                    <Label className="text-[11px] font-medium text-muted-foreground leading-none">Number of miscarriages</Label>
                    <Input
                      type="number"
                      min={1}
                      value={Math.max(1, miscarriageHistory.length || 1)}
                      onChange={e => {
                        const rawValue = e.target.value;
                        if (!rawValue) return;
                        requestMiscarriageCountChange(parseInt(rawValue, 10));
                      }}
                      className="h-8 text-sm"
                    />
                  </div>
                  <MiscarriageEditor value={miscarriageHistory} onChange={v => set("miscarriageHistory", v)} onFileUpload={makeUploadHandler("miscarriageHistory", "Miscarriage History")} onFileRemove={deleteIntakeDoc} />
                </div>
              </YesNoGate>
            </div>
            </YesNoGate>
            <AlertDialog open={showMiscarriageCountConfirm} onOpenChange={(open) => { if (!open) cancelMiscarriageCountChange(); }}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reduce miscarriage count?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {pendingMiscarriageCount == null
                      ? ""
                      : getMiscarriageCountConfirmDescription(miscarriageHistory.length, pendingMiscarriageCount)}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={cancelMiscarriageCountChange}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={confirmMiscarriageCountChange} className="bg-rose-600 hover:bg-rose-700 text-white">
                    Yes, remove extra entries
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </SectionCard>

          <SectionCard title="Menstrual Cycle">
            <div className="period-row two-col-row" style={{display:'grid',gridTemplateColumns:'repeat(2, minmax(0, 1fr))',gap:'8px',width:'100%',maxWidth:'100%',boxSizing:'border-box',overflow:'visible'}}>
              <F label="First day of last period" value={f("lastMenstrualPeriod") ? new Date(f("lastMenstrualPeriod")).toISOString().split("T")[0] : ""} onChange={v => set("lastMenstrualPeriod", v ? new Date(v) : undefined)} type="date" min="1900-01-01" historical />
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground leading-none">Are your periods regular?</Label>
                <Select value={f("cycleRegularity") || ""} onValueChange={v => set("cycleRegularity", v)}>
                  <SelectTrigger className="h-8 text-sm w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">Yes, regular</SelectItem>
                    <SelectItem value="irregular">No, irregular</SelectItem>
                    <SelectItem value="absent">No periods at all</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <F label="Cycle length (days)" value={f("cycleLengthDays")} onChange={v => set("cycleLengthDays", v ? parseInt(v) : undefined)} type="number" placeholder="e.g. 28" />
              <F label="Period duration (days)" value={f("menstrualFlowDays")} onChange={v => set("menstrualFlowDays", v ? parseInt(v) : undefined)} type="number" placeholder="e.g. 5" />
            </div>
            <div className="mt-2">
              <CheckboxField label="I experience painful periods (cramps / dysmenorrhea)" checked={!!form.dysmenorrhea} onChange={v => set("dysmenorrhea", v)} />
            </div>
          </SectionCard>

          <SectionCard title="Contraceptive History">
            <YesNoGate
              question="Has the patient used any contraceptive methods?"
              value={hasFemaleContraceptive}
              hasData={!!(f("contraceptiveMethod") || f("contraceptiveDuration") || f("contraceptiveStoppedAgo"))}
              onChange={(v) => {
                setHasFemaleContraceptive(v);
                if (!v) { set("contraceptiveMethod", ""); set("contraceptiveDuration", ""); set("contraceptiveStoppedAgo", ""); set("contraceptiveMethodOther", ""); }
              }}
            >
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground leading-none">Contraceptive Method Used</Label>
                <Select value={f("contraceptiveMethod") || ""} onValueChange={v => { set("contraceptiveMethod", v); onContraceptiveChange?.(true, true); }}>
                  <SelectTrigger className="h-8 text-sm w-full"><SelectValue placeholder="Select method" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None / Never used</SelectItem>
                    <SelectItem value="oral-pill">Oral contraceptive pill</SelectItem>
                    <SelectItem value="iud-copper">IUD (Copper)</SelectItem>
                    <SelectItem value="iud-hormonal">IUD (Hormonal / Mirena)</SelectItem>
                    <SelectItem value="implant">Implant (Nexplanon)</SelectItem>
                    <SelectItem value="injection">Injection (Depo-Provera)</SelectItem>
                    <SelectItem value="patch">Patch</SelectItem>
                    <SelectItem value="ring">Vaginal ring (NuvaRing)</SelectItem>
                    <SelectItem value="barrier">Barrier (condom, diaphragm)</SelectItem>
                    <SelectItem value="natural">Natural / Fertility awareness</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <F label="Duration of Use" value={f("contraceptiveDuration")} onChange={v => { set("contraceptiveDuration", v); onContraceptiveChange?.(true, true); }} placeholder="e.g. 3 years" />
              <F label="Stopped How Long Ago" value={f("contraceptiveStoppedAgo")} onChange={v => { set("contraceptiveStoppedAgo", v); onContraceptiveChange?.(true, true); }} placeholder="e.g. 6 months ago" />
            </div>
            {f("contraceptiveMethod") === "other" && (
              <div className="mt-2">
                <F label="Please specify" value={f("contraceptiveMethodOther")} onChange={v => { set("contraceptiveMethodOther", v); onContraceptiveChange?.(true, true); }} />
              </div>
            )}
            </YesNoGate>
          </SectionCard>

          <div className="flex items-center gap-3 pt-2 pb-1">
            <div className="h-px flex-1" style={{ background: '#1E0566', opacity: 0.18 }} />
            <span className="text-[13px] font-bold uppercase" style={{ letterSpacing: '2px', color: '#1E0566' }}>Clinical Assessment</span>
            <div className="h-px flex-1" style={{ background: '#1E0566', opacity: 0.18 }} />
          </div>
          <SectionCard title="Female Fertility Diagnosis">
            <YesNoGate
              question="Does the patient have any known fertility diagnosis?"
              value={hasFemaleKnownDiagnosis}
              hasData={femaleFertilityDiagnosis.length > 0}
              dataCount={femaleFertilityDiagnosis.length}
              onChange={(v) => {
                setHasFemaleKnownDiagnosis(v);
                if (!v && onFemaleDiagnosisChange) onFemaleDiagnosisChange([]);
              }}
            >
            <p className="text-xs text-muted-foreground mb-3">Select all diagnoses that apply. These are synced with the patient/lead record.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {dynamicFemaleDiagnosisGroups.map(group => (
                <DiagnosisGroupBox
                  key={group.main}
                  group={group}
                  selected={femaleFertilityDiagnosis}
                  rawOptions={dynFemaleDiagnoses as RawDropdownOption[] | null | undefined}
                  onToggle={(label, checked) => {
                    if (!onFemaleDiagnosisChange) return;
                    onFemaleDiagnosisChange(
                      toggleDiagnosisValue(femaleFertilityDiagnosis, label, checked, dynFemaleDiagnoses as RawDropdownOption[] | null | undefined)
                    );
                  }}
                />
              ))}
            </div>
            </YesNoGate>
          </SectionCard>

          <SectionCard title="Health Conditions (check all that apply)">
            <YesNoGate
              question="Does the patient have any health conditions?"
              value={hasFemaleHealthConditions}
              hasData={Object.values(systemicDiseases).some(v => v === true)}
              onChange={(v) => {
                setHasFemaleHealthConditions(v);
                if (!v) set("systemicDiseases", {});
              }}
            >
            <SystemicDiseasesEditor value={systemicDiseases} onChange={v => set("systemicDiseases", v)} />
            </YesNoGate>
          </SectionCard>

          <SectionCard title="Family Medical History">
            <YesNoGate
              question="Is there any relevant family medical history?"
              value={hasFemaleFamilyHistory}
              hasData={!!(form.familyBreastCancer || form.familyEarlyMenopause || form.familyInfertility || f("hereditaryDiseases"))}
              onChange={(v) => {
                setHasFemaleFamilyHistory(v);
                if (!v) { set("familyBreastCancer", false); set("familyEarlyMenopause", false); set("familyInfertility", false); set("hereditaryDiseases", ""); }
              }}
            >
            <div className="flex flex-wrap gap-3 mb-2">
              <CheckboxField label="Breast cancer in the family" checked={!!form.familyBreastCancer} onChange={v => set("familyBreastCancer", v)} />
              <CheckboxField label="Early menopause in the family" checked={!!form.familyEarlyMenopause} onChange={v => set("familyEarlyMenopause", v)} />
              <CheckboxField label="Fertility problems in the family" checked={!!form.familyInfertility} onChange={v => set("familyInfertility", v)} />
            </div>
            <TA label="Any hereditary or genetic conditions in the family" value={f("hereditaryDiseases")} onChange={v => set("hereditaryDiseases", v)} autoGrow placeholder="e.g. Thalassemia in father's side, Down syndrome in sibling..." />
            </YesNoGate>
          </SectionCard>

          <div className="flex items-center gap-3 pt-2 pb-1">
            <div className="h-px flex-1" style={{ background: '#1E0566', opacity: 0.18 }} />
            <span className="text-[13px] font-bold uppercase" style={{ letterSpacing: '2px', color: '#1E0566' }}>Detailed Records</span>
            <div className="h-px flex-1" style={{ background: '#1E0566', opacity: 0.18 }} />
          </div>
          <SectionCard title="Previous Fertility Treatments (IVF / IUI / etc.)">
            <YesNoGate
              question="Has the patient had any previous fertility treatments (IVF, IUI, FET, etc.)?"
              value={hasPreviousTreatments}
              hasData={artHistory.length > 0}
              dataCount={artHistory.length}
              onChange={(v) => {
                setHasPreviousTreatments(v);
                if (!v) set("artHistory", []);
              }}
              onYes={() => {
                if (artHistory.length === 0)
                  set("artHistory", [{ id: crypto.randomUUID(), type: "IVF", date: "", clinic: "", outcome: "", notes: "" }]);
              }}
            >
            <PreviousTreatmentsEditor
              value={artHistory}
              onChange={v => set("artHistory", v)}
              mode={mode}
              entityId={id}
              onFileUpload={(cycleId, section, embryoIndex, file, onDone) => {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  const b64 = (ev.target?.result as string).split(",")[1];
                  try {
                    const result = await uploadIntakeFilePending(b64, file.name, file.type, `PGT-${section}`);
                    // Update in-memory state first (pass docId so SavedTranslationsPanel can render)
                    onDone(result.fileKey, result.fileUrl, result.fileName, result.docId);
                    // Fix C: immediately persist updated artHistory to DB so the PGT file
                    // URL and docId survive a page reload without requiring the user to click Save.
                    const sectionLower = section.toLowerCase();
                    const cycleIndex = artHistory.findIndex(c => c.id === cycleId);
                    if (cycleIndex >= 0) {
                      const updatedCycles = artHistory.map((c, ci) => {
                        if (ci !== cycleIndex) return c;
                        if (sectionLower.includes("frozen")) {
                          const embs = [...(c.frozenEmbryos ?? [])];
                          if (embs[embryoIndex]) embs[embryoIndex] = { ...embs[embryoIndex], pgtFileKey: result.fileKey, pgtFileUrl: result.fileUrl, pgtFileName: result.fileName, pgtDocId: result.docId };
                          return { ...c, frozenEmbryos: embs };
                        } else if (sectionLower.includes("fet")) {
                          const embs = [...(c.fetEmbryos ?? [])];
                          if (embs[embryoIndex]) embs[embryoIndex] = { ...embs[embryoIndex], pgtFileKey: result.fileKey, pgtFileUrl: result.fileUrl, pgtFileName: result.fileName, pgtDocId: result.docId };
                          return { ...c, fetEmbryos: embs };
                        }
                        return c;
                      });
                      const partialSaveMutation = mode === "lead" ? leadPartialSave : patientPartialSave;
                      const savePayload = mode === "lead"
                        ? { leadId: id, artHistory: updatedCycles }
                        : { patientId: id, artHistory: updatedCycles };
                      (partialSaveMutation.mutateAsync as any)(savePayload).catch(() => {
                        // Silent failure — the in-memory state is already updated;
                        // the user can still click Save to persist manually.
                      });
                    }
                    toast.success("PGT document uploaded");
                  } catch (e: any) {
                    toast.error("Upload failed: " + (e?.message ?? "Unknown error"));
                  }
                };
                reader.readAsDataURL(file);
              }}
              onCycleFileUpload={(cycleIndex, file, onDone) => {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  const b64 = (ev.target?.result as string).split(",")[1];
                  try {
                    const oldDocId = artHistory[cycleIndex]?.cycleDocId;
                    const result = await uploadIntakeFilePending(b64, file.name, file.type, "TreatmentReport", oldDocId, (artHistory[cycleIndex] as any)?.cycleLifecycleStatus);
                    onDone(result.fileKey, result.fileUrl, result.fileName, result.docId);
                    // Persist the updated artHistory with new file fields
                    const updated = [...artHistory];
                    updated[cycleIndex] = { ...updated[cycleIndex], cycleFileKey: result.fileKey, cycleFileUrl: result.fileUrl, cycleFileName: result.fileName, cycleDocId: result.docId };
                    set("artHistory", updated);
                    toast.success("Treatment report uploaded");
                  } catch (e: any) {
                    toast.error("Upload failed: " + (e?.message ?? "Unknown error"));
                  }
                };
                reader.readAsDataURL(file);
              }}
              onCycleFileRemove={deleteIntakeDoc}
            />
            </YesNoGate>
          </SectionCard>
          <SectionCard title="Previous Procedures & Surgeries">
            <YesNoGate
              question="Has the patient had any previous procedures or surgeries?"
              value={hasFemaleSurgeries}
              hasData={surgicalHistory.length > 0}
              dataCount={surgicalHistory.length}
              onChange={(v) => {
                setHasFemaleSurgeries(v);
                if (!v) set("surgicalHistory", []);
              }}
              onYes={() => {
                if (surgicalHistory.length === 0)
                  set("surgicalHistory", [{ procedureType: "", procedure: "", date: "", notes: "" }]);
              }}
            >
              <SurgicalHistoryEditor value={surgicalHistory} onChange={v => set("surgicalHistory", v)} onFileUpload={makeUploadHandler("surgicalHistory", "Surgical History")} onFileRemove={deleteIntakeDoc} />
            </YesNoGate>
          </SectionCard>

          <SectionCard title="Previous Tests & Lab Results">
            <YesNoGate
              question="Has the patient had any previous lab tests or investigations?"
              value={hasFemaleTests}
              hasData={previousTests.length > 0}
              dataCount={previousTests.length}
              onChange={(v) => {
                setHasFemaleTests(v);
                set("hasPreviousTests", v ?? false);
                if (!v) set("previousTests", []);
              }}
              onYes={() => {
                set("hasPreviousTests", true);
                if (hasFemaleTests !== true && previousTests.length === 0) {
                  // First intentional Yes: seed default templates (deep copy)
                  set("previousTests", FEMALE_DEFAULT_TESTS.map(t => ({ ...t })));
                }
                // No → Yes: restore defaults even if list was previously cleared
                if (hasFemaleTests === false && previousTests.length === 0) {
                  set("previousTests", FEMALE_DEFAULT_TESTS.map(t => ({ ...t })));
                }
              }}
            >
            <p className="text-xs text-muted-foreground mb-2">Add any tests you have done before (blood tests, ultrasounds, etc.)</p>
            <TestsEditor value={previousTests} onChange={v => set("previousTests", v)} label="Test" onFileUpload={makeUploadHandler("previousTests", "Previous Tests")} onFileRemove={deleteIntakeDoc} importDraftKey={`${mode}_${id}_female_prevtests`} />
            {previousTests.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 gap-1.5"
                onClick={() => set("previousTests", FEMALE_DEFAULT_TESTS.map(t => ({ ...t })))}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Restore Default Test List
              </Button>
            )}
            </YesNoGate>
          </SectionCard>
          <SectionCard title="Radiology & Imaging">
            <YesNoGate
              question="Has the patient had any radiology or imaging studies (ultrasound, HSG, MRI, CT, etc.)?"
              value={hasFemaleRadiology}
              hasData={parseJSONArray<RadiologyStudy>(form.radiologyStudies).length > 0}
              dataCount={parseJSONArray<RadiologyStudy>(form.radiologyStudies).length}
              onChange={(v) => {
                setHasFemaleRadiology(v);
                if (!v) set("radiologyStudies", []);
              }}
            >
            <p className="text-xs text-muted-foreground mb-3">Ultrasound reports, HSG, MRI, CT, and other imaging studies. Each entry supports AI extraction and EN/AR/TR translation.</p>
            <RadiologyEditor
              gender="female"
              value={parseJSONArray<RadiologyStudy>(form.radiologyStudies)}
              onChange={v => set("radiologyStudies", v)}
              onFileUpload={(studyId, file, study, updateStudy) => {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  const b64 = (ev.target?.result as string).split(",")[1];
                  try {
                    const result = await uploadIntakeFilePending(b64, file.name, file.type, "Radiology (Female)", study.docId, (study as any).lifecycleStatus);
                    updateStudy({ ...study, fileKey: result.fileKey, fileUrl: result.fileUrl, fileName: result.fileName, fileMimeType: file.type, docId: result.docId });
                    toast.success("File uploaded");
                  } catch (e: any) {
                    toast.error("Upload failed: " + (e?.message ?? "Unknown error"));
                  }
                };
                reader.readAsDataURL(file);
              }}
              onFileRemove={async (studyId, study, updateStudy) => {
                if (study.docId) await deleteIntakeDoc(study.docId);
                updateStudy({ ...study, fileKey: undefined, fileUrl: undefined, fileName: undefined, fileMimeType: undefined, docId: undefined });
              }}
              onImageUpload={async (studyId, files, study, updateStudy) => {
                let cur = study;
                for (const file of files) {
                  try {
                    const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = e => res((e.target?.result as string).split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
                    const result = await uploadIntakeFilePending(b64, file.name, file.type, "Radiology (Female) Image");
                    const newImg = { id: `img_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, fileKey: result.fileKey, fileUrl: result.fileUrl, fileName: file.name, fileMimeType: file.type, docId: result.docId };
                    cur = { ...cur, images: [...(cur.images ?? []), newImg] };
                    updateStudy(cur);
                  } catch (e: any) { toast.error("Image upload failed: " + (e?.message ?? "Unknown error")); }
                }
              }}
              onImageRemove={async (studyId, imgId, study, updateStudy) => {
                const img = (study.images ?? []).find(i => i.id === imgId);
                if (img?.docId) await deleteIntakeDoc(img.docId);
                updateStudy({ ...study, images: (study.images ?? []).filter(i => i.id !== imgId) });
              }}
              onDicomUpload={async (studyId, files, study, updateStudy) => {
                let cur = study;
                for (const file of files) {
                  try {
                    const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = e => res((e.target?.result as string).split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
                    const result = await uploadIntakeFilePending(b64, file.name, "application/dicom", "Radiology (Female) DICOM");
                    const newDcm = { id: `dcm_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, fileKey: result.fileKey, fileUrl: result.fileUrl, fileName: file.name, docId: result.docId };
                    cur = { ...cur, dicomFiles: [...(cur.dicomFiles ?? []), newDcm] };
                    updateStudy(cur);
                  } catch (e: any) { toast.error("DICOM upload failed: " + (e?.message ?? "Unknown error")); }
                }
              }}
              onDicomRemove={async (studyId, dicomId, study, updateStudy) => {
                const dcm = (study.dicomFiles ?? []).find(d => d.id === dicomId);
                if (dcm?.docId) await deleteIntakeDoc(dcm.docId);
                updateStudy({ ...study, dicomFiles: (study.dicomFiles ?? []).filter(d => d.id !== dicomId) });
              }}
              onTagUpdate={handleTagUpdate}
              mode={mode}
              entityId={id}
            />
            </YesNoGate>
          </SectionCard>
          <SectionCard title="Genetic Tests">
            {/* Female Genetic Tests YesNoGate — uses custom confirmation wording per REQ-FGT-D */}
            {/* The existing YesNoGate hasData/dataCount props use generic wording; we override via onYes/onChange */}
            {(() => {
              const currentEntries = parseJSONArray<GeneticTestEntry>(form.femaleGeneticTests);
              const meaningfulEntries = filterMeaningfulEntries(currentEntries);
              return (
                <YesNoGate
                  question="Has the patient had any genetic testing (karyotype, carrier screening, PGT, etc.)?"
                  value={hasFemaleGenetics}
                  hasData={meaningfulEntries.length > 0}
                  dataCount={meaningfulEntries.length}
                  confirmDescription="Selecting No will remove all genetic test entries when you save the Health Record. Continue?"
                  confirmActionLabel="Confirm"
                  onYes={() => {
                    // Scenario B: auto-create one blank entry when selecting Yes with no entries
                    if (currentEntries.length === 0) {
                      set("femaleGeneticTests", [createBlankGeneticTestEntry()]);
                    }
                    setHasFemaleGenetics(true, true);
                  }}
                  onChange={(v) => {
                    if (v) {
                      // Yes — handled by onYes above
                      return;
                    }
                    // No — confirmation is handled by YesNoGate's hasData prop
                    // On confirm: clear entries in local state, mark dirty
                    set("femaleGeneticTests", []);
                    setHasFemaleGenetics(false, true);
                  }}
                >
                <p className="text-xs text-muted-foreground mb-2">Karyotype, carrier screening, and other genetic test results.</p>
                <GeneticTestsEditor
                  gender="female"
                  value={currentEntries}
                  onChange={v => { set("femaleGeneticTests", v); setHasFemaleGenetics(true, true); }}
                  onLastEntryRemoved={() => {
                    // Scenario E: removing the last entry returns gate to unanswered
                    // Explicit clear intent: dirty=true so handleSave writes []
                    setHasFemaleGenetics(null, true);
                  }}
                  onFileUpload={(i, file, list, setList) => {
                    const reader = new FileReader();
                    reader.onload = async (ev) => {
                      const b64 = (ev.target?.result as string).split(",")[1];
                      try {
                        const oldDocId = (list[i] as any)?.docId;
                        const oldLifecycle = (list[i] as any)?.lifecycleStatus;
                        const result = await uploadIntakeFilePending(b64, file.name, file.type, "Genetic Tests (Female)", oldDocId, oldLifecycle);
                        const updated = [...list];
                        updated[i] = { ...updated[i], fileKey: result.fileKey, fileUrl: result.fileUrl, fileName: result.fileName, docId: result.docId, lifecycleStatus: result.lifecycleStatus };
                        setList(updated);
                        set("femaleGeneticTests", updated);
                        toast.success("File uploaded");
                      } catch (e: any) {
                        toast.error("Upload failed: " + (e?.message ?? "Unknown error"));
                        setList(list);
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                  onFileRemove={deleteIntakeDoc}
                />
                </YesNoGate>
              );
            })()}
          </SectionCard>

          <div className="flex items-center gap-2 pt-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Notes & Questions</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <SectionCard title="Additional Notes / Anything Else You'd Like Us to Know">
            <TA label="" value={f("additionalNotes")} onChange={v => set("additionalNotes", v)} rows={3} autoGrow placeholder="e.g. Previous IVF abroad, specific concerns, anything else you'd like the doctor to know..." />
          </SectionCard>

          {/* ── Wife Questions for Doctor ── */}
          <SectionCard title="Wife's Questions for the Doctor">
            <p className="text-xs text-muted-foreground mb-3">Add any questions you would like the doctor to answer about your case.</p>
            {(() => {
              const pq = parseJSON(form.patientQuestions, {} as any);
              const questions: string[] = Array.isArray(pq?.female) ? pq.female : [];
              const doctorAnswers = parseJSON(form.doctorAnswers, {} as any);
              const femaleAnswers: Record<string, string> = doctorAnswers?.female ?? {};
              const setFemaleQuestions = (qs: string[]) => {
                const current = parseJSON(form.patientQuestions, {} as any);
                set("patientQuestions", { ...current, female: qs });
              };
              return (
                <div className="space-y-3">
                  {questions.map((q, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="flex gap-2 items-center">
                        <Input
                          value={q}
                          onChange={e => { const u = [...questions]; u[i] = e.target.value; setFemaleQuestions(u); }}
                          placeholder={`Question ${i + 1}`}
                          className="h-8 text-sm"
                        />
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 shrink-0 text-destructive"
                          onClick={() => setFemaleQuestions(questions.filter((_, j) => j !== i))}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {femaleAnswers[String(i)] && (
                        <div className="ml-1 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/40 px-3 py-2">
                          <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-0.5">Doctor's Answer:</p>
                          <p className="text-xs text-foreground">{femaleAnswers[String(i)]}</p>
                        </div>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs mt-1"
                    onClick={() => setFemaleQuestions([...questions, ""])}>
                    <Plus className="h-3 w-3" /> Add Question
                  </Button>
                </div>
              );
            })()}
          </SectionCard>

          <SectionCard title="General Attachments (Female)">
            <p className="text-xs text-muted-foreground mb-3">Upload any documents related to the female patient that don’t belong to a specific section. Supports PDF, images, and other formats.</p>
            <GeneralAttachmentsSection
              value={parseJSON(form.generalAttachmentsFemale, []) as GeneralAttachmentEntry[]}
              onChange={v => set("generalAttachmentsFemale", v)}
              sectionPrefix="General-Female"
              mode={mode}
              id={id}
              onDeleteDoc={deleteIntakeDoc}
              draftSessionId={draftSessionId}
              activeWriterToken={activeWriterToken}
            />
          </SectionCard>

        </TabsContent>

        {/* ── Male Intake ── */}
                <TabsContent value="male" className="space-y-3">
          {/* P2-2: Source label — shown for female-primary AND legacy records where the male tab contains partner-reported data */}
          {(editIsFemale || editIsLegacy) && hasMeaningfulReportedPartnerData(form, editIntakeMode) && (
            <div className="px-3 py-2.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700 dark:bg-slate-800/40 dark:border-slate-600 dark:text-slate-300 text-xs space-y-0.5">
              <p className="font-semibold">Reported Partner Information</p>
              <p>
                {editIsFemale
                  ? "Partner information recorded during this female Health Record intake. It is stored separately from any linked partner\u2019s identity and Health Record."
                  : "Partner information recorded during this Health Record intake. It is stored separately from any linked partner\u2019s identity and Health Record."}
              </p>
            </div>
          )}
          {/* P2-3: Linked-partner informational banner — shown when a partner is linked AND reported data exists */}
          {(editIsFemale || editIsLegacy) && partnerOwnerName && hasMeaningfulReportedPartnerData(form, editIntakeMode) && (
            <div className="px-3 py-2.5 rounded-md bg-slate-100 border border-slate-300 text-slate-700 dark:bg-slate-800/60 dark:border-slate-500 dark:text-slate-300 text-xs space-y-0.5">
              <p className="font-semibold">Note: Linked partner record exists</p>
              <p>This Health Record contains partner information entered separately from the linked partner's own record. The linked partner's Health Record is the authoritative source for their medical information.</p>
            </div>
          )}
          {/* ── Quick Questionnaire ─────────────────────────────────────────── */}
                    <SectionCard title="General Information">

            {/* ═══ 2-column balanced layout (Male) ═════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-0">

              {/* ─── LEFT COLUMN: Patient Basics · Body Measurements · Lifestyle ─ */}
              <div>
                {/* ── Group 1: Patient Basics ── */}
                <SubSectionDivider label="Patient Basics" />
                <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                  {/* Date of Birth + Age */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">Date of Birth</Label>
                    <div className="flex items-center gap-1.5">
                      {leadDobBelongsToMale ? (
                        /* Option A: Identity DOB (maleLeadDob) is read-only inside Medical Record */
                        /* Edit it from the Lead/Patient profile to keep identity as source of truth */
                        <div className="flex items-center gap-1.5 w-full">
                          <input
                            type="date"
                            className="h-9 text-sm border rounded-md px-2 bg-muted text-muted-foreground w-full cursor-not-allowed"
                            value={maleLeadDob}
                            readOnly
                            disabled
                            title="Identity DOB is read-only here. Edit it from the Lead or Patient profile."
                          />
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0 whitespace-nowrap" title="Edit from Lead/Patient profile">
                            🔒 identity
                          </span>
                        </div>
                      ) : (
                        /* Intake-template DOB for male partner (stored in maleIntake.dateOfBirth) */
                        /* Option C: saved only through Save Intake — no immediate DB write */
                        <input
                          type="date"
                          className="h-9 text-sm border rounded-md px-2 bg-background w-full"
                          value={maleIntake.dateOfBirth ? (typeof maleIntake.dateOfBirth === "string" ? maleIntake.dateOfBirth.split("T")[0] : new Date(maleIntake.dateOfBirth as any).toISOString().split("T")[0]) : ""}
                          max={new Date().toISOString().split("T")[0]}
                          min="1900-01-01"
                          style={{ WebkitAppearance: 'none', appearance: 'none' } as any}
                          onChange={e => {
                            const v = e.target.value;
                            if (!v) { setMale('dateOfBirth', ''); return; }
                            const d = new Date(v);
                            if (!isNaN(d.getTime()) && d.getFullYear() < 1900) { toast.error('Date of birth must be 1900 or later.'); return; }
                            if (isFutureDate(v)) { toast.error("You cannot select a future date. Please select a valid date."); setMale('dateOfBirth', ''); return; }
                            // Option C: only update local form state — no immediate DB write
                            setMale('dateOfBirth', v);
                          }}
                        />
                      )}
                      {(leadDobBelongsToMale ? maleLeadDob : maleIntake.dateOfBirth) && (
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0 whitespace-nowrap bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded">
                          {Math.floor((Date.now() - new Date((leadDobBelongsToMale ? maleLeadDob : maleIntake.dateOfBirth) as any).getTime()) / (365.25 * 24 * 60 * 60 * 1000))}y
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Occupation */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">Occupation / Profession</Label>
                    <Input className="h-9 text-sm" value={maleIntake.profession ?? ""} onChange={e => setMale("profession", e.target.value)} placeholder="e.g. Engineer" />
                  </div>
                  {/* Planned Visit Date */}
                  <div className="space-y-1 col-span-2">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">Planned Visit Date</Label>
                    <input
                      type="date"
                      className="h-9 text-sm border rounded-md px-2 bg-background w-full max-w-[220px]"
                      value={f("expectedVisitDate") ? new Date(f("expectedVisitDate")).toISOString().split("T")[0] : ""}
                      style={{ WebkitAppearance: 'none', appearance: 'none' } as any}
                      onChange={e => {
                        const v = e.target.value;
                        set("expectedVisitDate", v ? new Date(v) : undefined);
                        if (v) onCreateVisitAppointment?.(v);
                      }}
                    />
                  </div>
                </div>

                {/* ── Group 3: Body Measurements ── */}
                <SubSectionDivider label="Body Measurements" />
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="flex-1 min-w-[120px]">
                    <HeightWeightField
                      heightCm={maleIntake.heightCm ?? ""} weightKg={maleIntake.weightKg ?? ""}
                      onHeightChange={v => setMale("heightCm", v)}
                      onWeightChange={v => setMale("weightKg", v)}
                      heightUnit={maleHeightUnit} weightUnit={maleWeightUnit}
                      onHeightUnitChange={setMaleHeightUnit}
                      onWeightUnitChange={setMaleWeightUnit}
                    />
                  </div>
                  <div className="space-y-1 w-[110px]">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">BMI {maleBmiManual && <span className="text-primary">(manual)</span>}</Label>
                    <div className="flex gap-1">
                      <Input
                        type="number" value={maleIntake.bmi ?? ""} readOnly={!maleBmiManual}
                        onChange={e => setMale("bmi", e.target.value)}
                        className="h-9 text-sm"
                        placeholder="Auto"
                      />
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Toggle manual BMI"
                        onClick={() => setMaleBmiManual(m => !m)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* ── Group 4: Lifestyle & Habits ── */}
                <SubSectionDivider label="Lifestyle & Habits" />
                <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">Smoking</Label>
                    <Select value={maleIntake.smoking ?? "never"} onValueChange={v => setMale("smoking", v)}>
                      <SelectTrigger className="h-9 text-sm w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="never">Never</SelectItem>
                        <SelectItem value="former">Former</SelectItem>
                        <SelectItem value="current">Current</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">Alcohol</Label>
                    <Select value={maleIntake.alcohol ?? "never"} onValueChange={v => setMale("alcohol", v)}>
                      <SelectTrigger className="h-9 text-sm w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="never">Never</SelectItem>
                        <SelectItem value="occasional">Occasional</SelectItem>
                        <SelectItem value="regular">Regular</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* ─── RIGHT COLUMN: Fertility Details · Medications · Referral ─── */}
              <div>
                {/* ── Group 2: Fertility & Relationship Details ── */}
                <SubSectionDivider label="Fertility & Relationship Details" />
                <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                  {/* Type of Infertility (male-specific) */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">Type of Infertility</Label>
                    <Select value={maleIntake.infertilityType || ""} onValueChange={v => setMale("infertilityType", v)}>
                      <SelectTrigger className="h-9 text-sm w-full"><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="primary">Primary (never fathered a child)</SelectItem>
                        <SelectItem value="secondary">Secondary (has fathered a child before)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* How long trying (male-specific) */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">How long trying?</Label>
                    <Input className="h-9 text-sm" value={maleIntake.infertilityDuration || ""} onChange={e => setMale("infertilityDuration", e.target.value)} placeholder="e.g. 2 years" />
                  </div>
                  {/* Date of Marriage (shared — same as female) */}
                  <div className="space-y-1 col-span-2">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">Date of Marriage / Partnership</Label>
                    <input
                      type="date"
                      className="h-9 text-sm border rounded-md px-2 bg-background w-full max-w-[220px]"
                      min="1900-01-01"
                      value={f("marriageDate") ? new Date(f("marriageDate")).toISOString().split("T")[0] : ""}
                      style={{ WebkitAppearance: 'none', appearance: 'none' } as any}
                      onChange={e => set("marriageDate", e.target.value ? new Date(e.target.value) : undefined)}
                    />
                  </div>
                  {/* Children from previous relationship */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground/70 leading-none">Children (Prev. Relationship)</Label>
                    <Input className="h-9 text-sm" type="number" placeholder="0" value={maleIntake.childrenFromPreviousRelationship != null ? String(maleIntake.childrenFromPreviousRelationship) : ""} onChange={e => setMale("childrenFromPreviousRelationship", e.target.value ? parseInt(e.target.value) : undefined)} />
                  </div>
                </div>
                {/* Checkboxes */}
                <div className="mt-3 space-y-2">
                  <CheckboxField label="This is my first marriage" checked={!!maleIntake.isFirstMarriage} onChange={v => setMale("isFirstMarriage", v)} />
                  <div className="space-y-1">
                    <span className="text-xs font-medium">Marriage Certificate</span>
                    <Select
                      value={(form as any).marriageCertStatus ?? "not_specified"}
                      onValueChange={v => { set("marriageCertStatus", v); set("hasCivilMarriageCertificate", v === "yes"); }}
                    >
                      <SelectTrigger className="h-8 text-xs">
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
                  <CheckboxField label="Parents are related (consanguinity)" checked={!!maleIntake.consanguinity} onChange={v => { setMale("consanguinity", v); set("consanguinity", v); }} />
                </div>
                {/* Marriage Certificate File Attachment (shared with female tab) */}
                {((form as any).marriageCertStatus === "yes" || (!((form as any).marriageCertStatus) && form.hasCivilMarriageCertificate)) && (
                  <MarriageCertAttachment
                    fileUrl={form.marriageCertFileUrl}
                    fileName={form.marriageCertFileName}
                    filePassword={form.marriageCertFilePassword}
                    docId={form.marriageCertDocId}
                    onUpload={(file) => {
                      const reader = new FileReader();
                      reader.onload = async (ev) => {
                        const b64 = (ev.target?.result as string).split(",")[1];
                        try {
                          const result = await uploadIntakeFilePending(b64, file.name, file.type, "MarriageCertificate", form.marriageCertDocId, (form as any).marriageCertLifecycleStatus);
                          set("marriageCertFileKey", result.fileKey);
                          set("marriageCertFileUrl", result.fileUrl);
                          set("marriageCertFileName", result.fileName);
                          set("marriageCertDocId", result.docId);
                          toast.success("Marriage certificate uploaded");
                        } catch (e: any) { toast.error("Upload failed: " + (e?.message ?? "Unknown error")); }
                      };
                      reader.readAsDataURL(file);
                    }}
                    onRemove={() => { deleteIntakeDoc(form.marriageCertDocId); set("marriageCertFileKey", undefined); set("marriageCertFileUrl", undefined); set("marriageCertFileName", undefined); set("marriageCertDocId", undefined); }}
                    onPasswordChange={v => set("marriageCertFilePassword", v)}
                  />
                )}

                {/* ── Group 5: Medications & Allergies ── */}
                <SubSectionDivider label="Medications & Allergies" />
                <div className="space-y-3">
                  <TA label="Current Medications" value={maleIntake.currentMedications ?? ""} onChange={v => setMale("currentMedications", v)} autoGrow placeholder="e.g. Clomiphene 25mg daily, Vitamin E..." />
                  <TA label="Allergies (medicines, foods, or other)" value={maleIntake.allergies ?? ""} onChange={v => setMale("allergies", v)} autoGrow placeholder="e.g. Penicillin, latex, shellfish..." />
                </div>

                {/* ── Group 6: Referral / Source ── */}
                <SubSectionDivider label="Referral / Source" />
                <div className="flex items-center gap-2 py-1">
                  <span className="text-[11px] font-semibold text-foreground/70">How did you hear about us?</span>
                  {leadSource ? (
                    <Badge variant="secondary" className="text-xs">{LEAD_SOURCES[leadSource] ?? leadSource.replace(/-/g, " ")}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Not recorded</span>
                  )}
                  <span className="ml-1 text-[10px] text-muted-foreground flex items-center gap-0.5"><span>🔒</span> read-only</span>
                </div>
              </div>

            </div> {/* end 2-col grid */}
          </SectionCard>

          <div className="flex items-center gap-3 pt-2 pb-1">
            <div className="h-px flex-1" style={{ background: '#1E0566', opacity: 0.18 }} />
            <span className="text-[13px] font-bold uppercase" style={{ letterSpacing: '2px', color: '#1E0566' }}>Clinical Assessment</span>
            <div className="h-px flex-1" style={{ background: '#1E0566', opacity: 0.18 }} />
          </div>
          <SectionCard title="Male Fertility Diagnosis">
            <YesNoGate
              question="Does the patient have any known male fertility diagnosis?"
              value={hasMaleKnownDiagnosis}
              hasData={maleFertilityDiagnosis.length > 0}
              dataCount={maleFertilityDiagnosis.length}
              onChange={(v) => {
                setHasMaleKnownDiagnosis(v);
                if (!v && onMaleDiagnosisChange) onMaleDiagnosisChange([]);
              }}
            >
            <p className="text-xs text-muted-foreground mb-3">Select all diagnoses that apply. These are synced with the patient/lead record.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {MALE_DIAGNOSIS_GROUPS.map(group => (
                <DiagnosisGroupBox
                  key={group.main}
                  group={group}
                  selected={maleFertilityDiagnosis}
                  onToggle={(label, checked) => {
                    if (!onMaleDiagnosisChange) return;
                    onMaleDiagnosisChange(checked
                      ? [...maleFertilityDiagnosis, label]
                      : maleFertilityDiagnosis.filter(x => x !== label));
                  }}
                />
              ))}
            </div>
            </YesNoGate>
          </SectionCard>

          <SectionCard title="Health Conditions (check all that apply)">
            <YesNoGate
              question="Does the patient have any health conditions?"
              value={hasMaleHealthConditions}
              hasData={Object.values(parseJSON(maleIntake.systemicDiseases, { ...DEFAULT_SYSTEMIC })).some(v => v === true)}
              onChange={(v) => {
                setHasMaleHealthConditions(v);
                if (!v) setMale("systemicDiseases", {});
              }}
            >
            <SystemicDiseasesEditor
              value={parseJSON(maleIntake.systemicDiseases, { ...DEFAULT_SYSTEMIC })}
              onChange={v => setMale("systemicDiseases", v)}
            />
            </YesNoGate>
          </SectionCard>

          <SectionCard title="Family Medical History">
            <YesNoGate
              question="Is there any relevant family medical history?"
              value={hasMaleFamilyHistoryGate}
              hasData={!!(maleIntake.hereditaryDiseases)}
              onChange={(v) => {
                setHasMaleFamilyHistoryGate(v);
                if (!v) setMale("hereditaryDiseases", "");
              }}
            >
            <TA label="Hereditary / Genetic Conditions in Family" value={maleIntake.hereditaryDiseases ?? ""} onChange={v => setMale("hereditaryDiseases", v)} autoGrow placeholder="e.g. Cystic fibrosis, chromosomal abnormalities in family..." />
            </YesNoGate>
          </SectionCard>

          <div className="flex items-center gap-3 pt-2 pb-1">
            <div className="h-px flex-1" style={{ background: '#1E0566', opacity: 0.18 }} />
            <span className="text-[13px] font-bold uppercase" style={{ letterSpacing: '2px', color: '#1E0566' }}>Detailed Records</span>
            <div className="h-px flex-1" style={{ background: '#1E0566', opacity: 0.18 }} />
          </div>
          <SectionCard title="Semen Analysis">
            <YesNoGate
              question="Has the patient had a semen analysis done?"
              value={hasSemenAnalysis}
              hasData={(maleIntake.semenAnalysis?.length ?? 0) > 0}
              dataCount={maleIntake.semenAnalysis?.length ?? 0}
              onChange={(v) => {
                setHasSemenAnalysis(v);
                if (!v) setMale("semenAnalysis", []);
              }}
              onYes={() => {
                if ((maleIntake.semenAnalysis?.length ?? 0) === 0)
                  setMale("semenAnalysis", [{ date: "", notes: "" }]);
              }}
            >
            <SemenAnalysisEditor
              value={maleIntake.semenAnalysis ?? []}
              onChange={v => setMale("semenAnalysis", v)}
              onDnaFragmentationExtracted={(dna) => setPendingDnaFill(dna)}
              pendingSemenFill={pendingSemenFill}
              onPendingSemenFillApplied={() => setPendingSemenFill(null)}
              onFileUpload={(i, file, list, setList) => {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  const b64 = (ev.target?.result as string).split(",")[1];
                  try {
                    const oldDocId = (list[i] as any)?.docId;
                    const oldLifecycle = (list[i] as any)?.lifecycleStatus;
                    const result = await uploadIntakeFilePending(b64, file.name, file.type, "Semen Analysis", oldDocId, oldLifecycle);
                    const updated = [...list];
                    updated[i] = { ...updated[i], fileKey: result.fileKey, fileUrl: result.fileUrl, fileName: result.fileName, docId: result.docId, lifecycleStatus: result.lifecycleStatus };
                    setList(updated);
                    setMale("semenAnalysis", updated);
                    toast.success("File uploaded");
                  } catch (e: any) {
                    toast.error("Upload failed: " + (e?.message ?? "Unknown error"));
                    setList(list);
                  }
                };
                reader.readAsDataURL(file);
              }}
              onFileRemove={deleteIntakeDoc}
            />
            </YesNoGate>
          </SectionCard>

          <SectionCard title="DNA Fragmentation">
            <YesNoGate
              question="Has the patient had a DNA fragmentation test?"
              value={hasDnaFragmentation}
              hasData={(maleIntake.dnaFragmentation?.length ?? 0) > 0}
              dataCount={maleIntake.dnaFragmentation?.length ?? 0}
              onChange={(v) => {
                setHasDnaFragmentation(v);
                if (!v) setMale("dnaFragmentation", []);
              }}
              onYes={() => {
                if ((maleIntake.dnaFragmentation?.length ?? 0) === 0)
                  setMale("dnaFragmentation", [{ date: "", notes: "" }]);
              }}
            >
            <DnaFragmentationEditor
              value={maleIntake.dnaFragmentation ?? []}
              onChange={v => setMale("dnaFragmentation", v)}
              pendingFill={pendingDnaFill}
              onPendingFillApplied={() => setPendingDnaFill(null)}
              onSemenAnalysisExtracted={(sa) => setPendingSemenFill(sa)}
              onFileUpload={(i, file, list, setList) => {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  const b64 = (ev.target?.result as string).split(",")[1];
                  try {
                    const oldDocId = (list[i] as any)?.docId;
                    const oldLifecycle = (list[i] as any)?.lifecycleStatus;
                    const result = await uploadIntakeFilePending(b64, file.name, file.type, "DNA Fragmentation", oldDocId, oldLifecycle);
                    const updated = [...list];
                    updated[i] = { ...updated[i], fileKey: result.fileKey, fileUrl: result.fileUrl, fileName: result.fileName, docId: result.docId, lifecycleStatus: result.lifecycleStatus };
                    setList(updated);
                    setMale("dnaFragmentation", updated);
                    toast.success("File uploaded");
                  } catch (e: any) {
                    toast.error("Upload failed: " + (e?.message ?? "Unknown error"));
                    setList(list);
                  }
                };
                reader.readAsDataURL(file);
              }}
              onFileRemove={deleteIntakeDoc}
            />
            </YesNoGate>
          </SectionCard>

          <SectionCard title="Previous Procedures & Surgeries">
            <YesNoGate
              question="Has the patient had any previous procedures or surgeries?"
              value={hasMaleSurgeries}
              hasData={(maleIntake.previousSurgeries?.length ?? 0) > 0}
              dataCount={maleIntake.previousSurgeries?.length ?? 0}
              onChange={(v) => {
                setHasMaleSurgeries(v);
                if (!v) setMale("previousSurgeries", []);
              }}
              onYes={() => {
                if ((maleIntake.previousSurgeries?.length ?? 0) === 0)
                  setMale("previousSurgeries", [{ procedureType: "", procedure: "", date: "", notes: "" }]);
              }}
            >
            <SurgicalHistoryEditor
              value={maleIntake.previousSurgeries ?? []}
              onChange={v => setMale("previousSurgeries", v)}
              onFileUpload={(i, file, list, setList) => {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  const b64 = (ev.target?.result as string).split(",")[1];
                  try {
                    const oldDocId = (list[i] as any)?.docId;
                    const oldLifecycle = (list[i] as any)?.lifecycleStatus;
                    const result = await uploadIntakeFilePending(b64, file.name, file.type, "Previous Surgeries (Male)", oldDocId, oldLifecycle);
                    const updated = [...list];
                    updated[i] = { ...updated[i], fileKey: result.fileKey, fileUrl: result.fileUrl, fileName: result.fileName, docId: result.docId, lifecycleStatus: result.lifecycleStatus };
                    setList(updated);
                    setMale("previousSurgeries", updated);
                    toast.success("File uploaded");
                  } catch (e: any) {
                    toast.error("Upload failed: " + (e?.message ?? "Unknown error"));
                    setList(list);
                  }
                };
                reader.readAsDataURL(file);
              }}
              onFileRemove={deleteIntakeDoc}
              gender="male"
            />
            </YesNoGate>
          </SectionCard>

          <SectionCard title="Previous Tests & Lab Results">
            <YesNoGate
              question="Has the patient had any previous lab tests or investigations?"
              value={hasMaleTests}
              hasData={(maleIntake.previousTests?.length ?? 0) > 0}
              dataCount={maleIntake.previousTests?.length ?? 0}
              onChange={(v) => {
                setHasMaleTests(v);
                if (!v) setMale("previousTests", []);
              }}
              onYes={() => {
                // Only seed defaults on the FIRST Yes transition (null/false → true).
                // If hasMaleTests is already true (Yes+[] case), do NOT re-seed — the
                // Restore Default Test List button is the only way to restore.
                if (hasMaleTests !== true && (maleIntake.previousTests?.length ?? 0) === 0) {
                  setMale("previousTests", MALE_DEFAULT_TESTS.map(t => ({ ...t })));
                }
              }}
            >
            <p className="text-xs text-muted-foreground mb-2">Add any tests you have done before (blood tests, hormone panels, etc.)</p>
            <TestsEditor
              value={maleIntake.previousTests ?? []}
              onChange={v => setMale("previousTests", v)}
              label="Test"
              onFileUpload={(i, file, list, setList) => {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  const b64 = (ev.target?.result as string).split(",")[1];
                  try {
                    const oldDocId = (list[i] as any)?.docId;
                    const oldLifecycle = (list[i] as any)?.lifecycleStatus;
                    const result = await uploadIntakeFilePending(b64, file.name, file.type, "Previous Tests (Male)", oldDocId, oldLifecycle);
                    const updated = [...list];
                    updated[i] = { ...updated[i], fileKey: result.fileKey, fileUrl: result.fileUrl, fileName: result.fileName, docId: result.docId, lifecycleStatus: result.lifecycleStatus };
                    setList(updated);
                    setMale("previousTests", updated);
                    toast.success("File uploaded");
                  } catch (e: any) {
                    toast.error("Upload failed: " + (e?.message ?? "Unknown error"));
                    setList(list);
                  }
                };
                reader.readAsDataURL(file);
              }}
              onFileRemove={deleteIntakeDoc}
              importDraftKey={`${mode}_${id}_male_prevtests`}
            />
            {/* Restore Default Test List button: shown when Yes+[] (user deleted all rows) */}
            {hasMaleTests === true && (maleIntake.previousTests?.length ?? 0) === 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setMale("previousTests", MALE_DEFAULT_TESTS.map(t => ({ ...t })))}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded px-3 py-1.5 transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Restore Default Test List
                </button>
              </div>
            )}
            </YesNoGate>
          </SectionCard>

          <SectionCard title="Genetic Tests">
            <YesNoGate
              question="Has the patient had any genetic testing (karyotype, carrier screening, PGT, etc.)?"
              value={hasMaleGenetics}
              onChange={(v) => {
                setHasMaleGenetics(v);
                if (!v) setMale("geneticTests", []);
              }}
            >
            <GeneticTestsEditor
              gender="male"
              value={maleIntake.geneticTests ?? []}
              onChange={v => setMale("geneticTests", v)}
              onFileUpload={(i, file, list, setList) => {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  const b64 = (ev.target?.result as string).split(",")[1];
                  try {
                    const oldDocId = (list[i] as any)?.docId;
                    const oldLifecycle = (list[i] as any)?.lifecycleStatus;
                    const result = await uploadIntakeFilePending(b64, file.name, file.type, "Genetic Tests (Male)", oldDocId, oldLifecycle);
                    const updated = [...list];
                    updated[i] = { ...updated[i], fileKey: result.fileKey, fileUrl: result.fileUrl, fileName: result.fileName, docId: result.docId, lifecycleStatus: result.lifecycleStatus };
                    setList(updated);
                    setMale("geneticTests", updated);
                    toast.success("File uploaded");
                  } catch (e: any) {
                    toast.error("Upload failed: " + (e?.message ?? "Unknown error"));
                    setList(list);
                  }
                };
                reader.readAsDataURL(file);
              }}
              onFileRemove={deleteIntakeDoc}
            />
            </YesNoGate>
          </SectionCard>

          <SectionCard title="Radiology & Imaging">
            <YesNoGate
              question="Has the patient had any radiology or imaging studies (scrotal ultrasound, MRI, etc.)?"
              value={hasMaleRadiology}
              hasData={parseJSONArray<RadiologyStudy>(form.maleRadiologyStudies).length > 0}
              dataCount={parseJSONArray<RadiologyStudy>(form.maleRadiologyStudies).length}
              onChange={(v) => {
                setHasMaleRadiology(v);
                if (!v) set("maleRadiologyStudies", []);
              }}
            >
            <p className="text-xs text-muted-foreground mb-3">Scrotal ultrasound and other imaging studies. Each entry supports AI extraction and EN/AR/TR translation.</p>
            <RadiologyEditor
              gender="male"
              value={parseJSONArray<RadiologyStudy>(form.maleRadiologyStudies)}
              onChange={v => set("maleRadiologyStudies", v)}
              onFileUpload={(studyId, file, study, updateStudy) => {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  const b64 = (ev.target?.result as string).split(",")[1];
                  try {
                    const result = await uploadIntakeFilePending(b64, file.name, file.type, "Radiology (Male)", study.docId, (study as any).lifecycleStatus);
                    updateStudy({ ...study, fileKey: result.fileKey, fileUrl: result.fileUrl, fileName: result.fileName, fileMimeType: file.type, docId: result.docId, lifecycleStatus: result.lifecycleStatus });
                    toast.success("File uploaded");
                  } catch (e: any) {
                    toast.error("Upload failed: " + (e?.message ?? "Unknown error"));
                  }
                };
                reader.readAsDataURL(file);
              }}
              onFileRemove={async (studyId, study, updateStudy) => {
                if (study.docId) await deleteIntakeDoc(study.docId);
                updateStudy({ ...study, fileKey: undefined, fileUrl: undefined, fileName: undefined, fileMimeType: undefined, docId: undefined });
              }}
              onImageUpload={async (studyId, files, study, updateStudy) => {
                let cur = study;
                for (const file of files) {
                  try {
                    const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = e => res((e.target?.result as string).split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
                    const result = await uploadIntakeFilePending(b64, file.name, file.type, "Radiology (Male) Image");
                    const newImg = { id: `img_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, fileKey: result.fileKey, fileUrl: result.fileUrl, fileName: file.name, fileMimeType: file.type, docId: result.docId };
                    cur = { ...cur, images: [...(cur.images ?? []), newImg] };
                    updateStudy(cur);
                  } catch (e: any) { toast.error("Image upload failed: " + (e?.message ?? "Unknown error")); }
                }
              }}
              onImageRemove={async (studyId, imgId, study, updateStudy) => {
                const img = (study.images ?? []).find(i => i.id === imgId);
                if (img?.docId) await deleteIntakeDoc(img.docId);
                updateStudy({ ...study, images: (study.images ?? []).filter(i => i.id !== imgId) });
              }}
              onDicomUpload={async (studyId, files, study, updateStudy) => {
                let cur = study;
                for (const file of files) {
                  try {
                    const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = e => res((e.target?.result as string).split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
                    const result = await uploadIntakeFilePending(b64, file.name, "application/dicom", "Radiology (Male) DICOM");
                    const newDcm = { id: `dcm_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, fileKey: result.fileKey, fileUrl: result.fileUrl, fileName: file.name, docId: result.docId };
                    cur = { ...cur, dicomFiles: [...(cur.dicomFiles ?? []), newDcm] };
                    updateStudy(cur);
                  } catch (e: any) { toast.error("DICOM upload failed: " + (e?.message ?? "Unknown error")); }
                }
              }}
              onDicomRemove={async (studyId, dicomId, study, updateStudy) => {
                const dcm = (study.dicomFiles ?? []).find(d => d.id === dicomId);
                if (dcm?.docId) await deleteIntakeDoc(dcm.docId);
                updateStudy({ ...study, dicomFiles: (study.dicomFiles ?? []).filter(d => d.id !== dicomId) });
              }}
              onTagUpdate={handleTagUpdate}
              mode={mode}
              entityId={id}
            />
            </YesNoGate>
          </SectionCard>
          <div className="flex items-center gap-2 pt-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Notes & Questions</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <SectionCard title="Additional Notes">
            <TA label="" value={maleIntake.additionalNotes ?? ""} onChange={v => setMale("additionalNotes", v)} rows={3} autoGrow placeholder="e.g. Previous fertility treatments, specific concerns, anything else you'd like the doctor to know..." />
          </SectionCard>
          {/* ── Husband Questions for Doctor ── */}
          <SectionCard title="Husband's Questions for the Doctor">
            <p className="text-xs text-muted-foreground mb-3">Add any questions the husband would like the doctor to answer.</p>
            {(() => {
              const pq = parseJSON(form.patientQuestions, {} as any);
              const questions: string[] = Array.isArray(pq?.male) ? pq.male : [];
              const doctorAnswers = parseJSON(form.doctorAnswers, {} as any);
              const maleAnswers: Record<string, string> = doctorAnswers?.male ?? {};
              const setMaleQuestions = (qs: string[]) => {
                const current = parseJSON(form.patientQuestions, {} as any);
                set("patientQuestions", { ...current, male: qs });
              };
              return (
                <div className="space-y-3">
                  {questions.map((q, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="flex gap-2 items-center">
                        <Input
                          value={q}
                          onChange={e => { const u = [...questions]; u[i] = e.target.value; setMaleQuestions(u); }}
                          placeholder={`Question ${i + 1}`}
                          className="h-8 text-sm"
                        />
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 shrink-0 text-destructive"
                          onClick={() => setMaleQuestions(questions.filter((_, j) => j !== i))}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {maleAnswers[String(i)] && (
                        <div className="ml-1 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 px-3 py-2">
                          <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-0.5">Doctor's Answer:</p>
                          <p className="text-xs text-foreground">{maleAnswers[String(i)]}</p>
                        </div>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs mt-1"
                    onClick={() => setMaleQuestions([...questions, ""])}>
                    <Plus className="h-3 w-3" /> Add Question
                  </Button>
                </div>
              );
            })()}
          </SectionCard>

          <SectionCard title="General Attachments (Male)">
            <p className="text-xs text-muted-foreground mb-3">Upload any documents related to the male patient that don’t belong to a specific section. Supports PDF, images, and other formats.</p>
            <GeneralAttachmentsSection
              value={parseJSON(form.generalAttachmentsMale, []) as GeneralAttachmentEntry[]}
              onChange={v => set("generalAttachmentsMale", v)}
              sectionPrefix="General-Male"
              mode={mode}
              id={id}
              onDeleteDoc={deleteIntakeDoc}
              draftSessionId={draftSessionId}
              activeWriterToken={activeWriterToken}
            />
          </SectionCard>

        </TabsContent>
      </Tabs>
      )}{/* end editIsGeneral ? null : (...) */}

      {/* Bottom save bar */}
      <div className="flex justify-end gap-2 pt-2 border-t">
        {/* Cancel is NEVER disabled — inactive-tab coordinators must also be able to exit. */}
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={onSave} disabled={isSaving || !isWriteActive} className="gap-1.5" title={!isWriteActive ? "Another tab is editing this record" : undefined}>
          <Save className="h-3.5 w-3.5" />
          {isSaving ? "Saving..." : "Save Intake"}
        </Button>
      </div>
    </div>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────

interface MedicalIntakeFormProps {
  mode: "lead" | "patient";
  id: number;
  readOnly?: boolean;
  onSave?: () => void;
}

export default function MedicalIntakeForm({ mode, id, readOnly = false, onSave }: MedicalIntakeFormProps) {
  const isLead = mode === "lead";
  const draftKey = `intake_draft_${mode}_${id}`;
  // Persist active partner tab (wife/husband) across tab switches and edit-mode toggles
  const partnerTabKey = `intake_partner_tab_${mode}_${id}`;
  const [activePartnerTab, setActivePartnerTabRaw] = useState<string>(() => {
    try { return sessionStorage.getItem(partnerTabKey) ?? "female"; } catch { return "female"; }
  });
  const setActivePartnerTab = (v: string) => {
    setActivePartnerTabRaw(v);
    try { sessionStorage.setItem(partnerTabKey, v); } catch {}
  };
  // Version key stored inside the draft to detect stale drafts from a different entity
  // (e.g. a previous lead that was deleted and a new one got the same numeric ID)
  const DRAFT_VERSION_FIELD = "__draftEntityId";

  const utils = trpc.useUtils();
  const leadQuery = trpc.leads.medicalIntake.useQuery({ leadId: id }, { enabled: isLead });
  const patientQuery = trpc.patients.getIntake.useQuery({ patientId: id }, { enabled: !isLead });
  // Derived: the intake object and the cross-link ID for invalidation
  const patientQueryIntake = patientQuery.data?.intake ?? undefined;
  const patientQueryLinkedLeadId = patientQuery.data?.linkedLeadId ?? null;
  // Fetch lead record to get/update DOB
  const leadDataQuery = trpc.leads.get.useQuery({ id }, { enabled: isLead });
  const leadData = isLead ? leadDataQuery.data : null;
  // Fetch partner data to compute partnerOwnerName for identification buttons
  const leadPartnerQuery = trpc.leads.getPartner.useQuery({ leadId: id }, { enabled: isLead });
  const patientPartnerQuery = trpc.patients.getPartner.useQuery({ patientId: id }, { enabled: !isLead });
  const partnerData = isLead ? leadPartnerQuery.data : patientPartnerQuery.data;

  // Fix 2: When a Lead is linked to a Patient, Patient is the DOB source of truth.
  // Fetch the linked Patient so we can prefer its DOB over the raw Lead DOB.
  const linkedPatientId = isLead ? ((leadData as any)?.convertedPatientId ?? null) : null;
  const linkedPatientQuery = trpc.patients.get.useQuery(
    { id: linkedPatientId! },
    { enabled: !!linkedPatientId, staleTime: 0 }
  );
  const linkedPatientData = linkedPatientId ? linkedPatientQuery.data : null;

  // Effective DOB source: linked Patient > raw Lead (when in lead mode)
  // In patient mode, patientData is the source (fetched below).
  const effectiveLeadDob = isLead
    ? (linkedPatientData?.dateOfBirth
        ? new Date(linkedPatientData.dateOfBirth as any).toISOString().split("T")[0]
        : (leadData?.dateOfBirth
            ? new Date(leadData.dateOfBirth as any).toISOString().split("T")[0]
            : ""))
    : "";

  // Effective gender source: linked Patient > raw Lead (when in lead mode)
  const effectiveLeadGender = isLead
    ? ((linkedPatientData as any)?.gender ?? (leadData as any)?.gender ?? "")
    : "";

  const updateLeadDobMutation = trpc.leads.update.useMutation({
    onSuccess: () => { leadDataQuery.refetch(); if (linkedPatientId) linkedPatientQuery.refetch(); toast.success("Date of birth updated"); },
    onError: () => toast.error("Failed to update date of birth"),
  });
  // When lead is linked to a Patient, DOB edits go to the Patient (source of truth).
  // In patient mode, DOB edits also go to the Patient directly.
  const updatePatientDobMutation = trpc.patients.update.useMutation({
    onSuccess: () => {
      linkedPatientQuery.refetch();
      patientDataQuery.refetch(); // also refetch in patient mode
      toast.success("Date of birth updated");
    },
    onError: () => toast.error("Failed to update date of birth"),
  });
  const updateLeadDob = (dob: string) => {
    if (isLead) {
      if (linkedPatientId) {
        // Linked Lead: write DOB to Patient (source of truth)
        updatePatientDobMutation.mutate({ id: linkedPatientId, data: { dateOfBirth: dob ? new Date(dob) : undefined } as any });
      } else {
        // Unlinked Lead: write DOB to Lead directly
        updateLeadDobMutation.mutate({ id, data: { dateOfBirth: dob ? new Date(dob) : undefined } as any });
      }
    } else {
      // Patient mode: write DOB directly to Patient
      updatePatientDobMutation.mutate({ id, data: { dateOfBirth: dob ? new Date(dob) : undefined } as any });
    }
  };

  // Fetch patient record for diagnosis data (patient mode)
  const patientDataQuery = trpc.patients.get.useQuery({ id }, { enabled: !isLead });
  const patientData = !isLead ? patientDataQuery.data : null;

  // Diagnosis state — sourced from lead or patient record
  const [femaleFertilityDiagnosis, setFemaleFertilityDiagnosis] = useState<string[]>([]);
  const [maleFertilityDiagnosis, setMaleFertilityDiagnosis] = useState<string[]>([]);
  const diagnosisInitializedRef = useRef(false);

  // Initialize diagnosis from server data when it arrives
  useEffect(() => {
    if (diagnosisInitializedRef.current) return;
    const source = isLead ? leadData : patientData;
    if (source !== undefined && source !== null) {
      const femaleDx = Array.isArray((source as any).fertilityDiagnosis) ? (source as any).fertilityDiagnosis : [];
      const maleDx = Array.isArray((source as any).maleFertilityDiagnosis) ? (source as any).maleFertilityDiagnosis : [];
      setFemaleFertilityDiagnosis(femaleDx);
      setMaleFertilityDiagnosis(maleDx);
      diagnosisInitializedRef.current = true;
    }
  }, [isLead, leadData, patientData]);

  useEffect(() => {
    if (!isLead || !leadData) return;
    try {
      const savedTab = sessionStorage.getItem(partnerTabKey);
      if (savedTab) return;
    } catch {}
    const defaultTab = String((leadData as any)?.gender ?? "").toLowerCase() === "male" ? "male" : "female";
    setActivePartnerTab(defaultTab);
  }, [isLead, leadData, partnerTabKey]);

  // Mutation to update diagnosis on lead/patient record
  const updateLeadDiagnosis = trpc.leads.update.useMutation({
    onSuccess: () => { leadDataQuery.refetch(); },
    onError: () => toast.error("Failed to save diagnosis"),
  });
  const updatePatientDiagnosis = trpc.patients.update.useMutation({
    onSuccess: () => { patientDataQuery.refetch(); },
    onError: () => toast.error("Failed to save diagnosis"),
  });

  const handleFemaleDiagnosisChange = (v: string[]) => {
    setFemaleFertilityDiagnosis(v);
    // Auto-reflect: if "Male factor infertility" is in female list, add to male list
    let newMale = [...maleFertilityDiagnosis];
    if (v.includes("Male factor infertility") && !newMale.includes("Male factor infertility")) {
      newMale = ["Male factor infertility", ...newMale];
      setMaleFertilityDiagnosis(newMale);
    }
    if (isLead) {
      updateLeadDiagnosis.mutate({ id, data: { fertilityDiagnosis: v, maleFertilityDiagnosis: newMale } });
    } else {
      updatePatientDiagnosis.mutate({ id, data: { fertilityDiagnosis: v, maleFertilityDiagnosis: newMale } });
    }
  };

  const handleMaleDiagnosisChange = (v: string[]) => {
    setMaleFertilityDiagnosis(v);
    if (isLead) {
      updateLeadDiagnosis.mutate({ id, data: { maleFertilityDiagnosis: v } });
    } else {
      updatePatientDiagnosis.mutate({ id, data: { maleFertilityDiagnosis: v } });
    }
  };

  // For patient mode: extract the intake from the wrapped response { intake, linkedLeadId }
  const { data: rawIntakeData, refetch } = isLead ? leadQuery : patientQuery;
  const intake = isLead ? (rawIntakeData as any)?.intake ?? (rawIntakeData as any) : patientQueryIntake;
  // Conflict detection: two separate intake rows exist for the same person (one keyed by
  // leadId, one by patientId). All writes are blocked until staff resolves the conflict.
  const conflict = isLead
    ? ((leadQuery.data as any)?.conflict ?? null)
    : ((patientQuery.data as any)?.conflict ?? null);

  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const [editing, setEditing] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  // Show native browser leave-confirmation when editing with unsaved changes
  useBeforeUnload(editing);
  // ── Resolve Conflict dialog state ─────────────────────────────────────────
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [resolveDocHandling, setResolveDocHandling] = useState<"archive" | "delete">("archive");
  // Correction 7: no default intakeMode — user must explicitly select
  const [resolveIntakeMode, setResolveIntakeMode] = useState<"female" | "male" | "general" | "">("" as any);
  const [resolveConfirmText, setResolveConfirmText] = useState("");
  // Correction 4: generate requestId when dialog opens (stable for the lifetime of one dialog session)
  const [resolveRequestId, setResolveRequestId] = useState("");
  // Correction 6: server-calculated scope query
  const conflictScopeQuery = trpc.leads.getConflictScope.useQuery(
    { leadId: id },
    { enabled: isLead && showResolveDialog && !!conflict, staleTime: 0 }
  );
  const conflictScope = conflictScopeQuery.data ?? null;

  // ── v5: context-aware intakeMode policy derived from server scope ──────────
  // EXPLICIT_MODES: types that represent a real user choice (not legacy/null)
  const EXPLICIT_MODES = ["female", "male", "general"] as const;
  type ExplicitMode = typeof EXPLICIT_MODES[number];
  const isExplicit = (m: string | null | undefined): m is ExplicitMode =>
    EXPLICIT_MODES.includes(m as ExplicitMode);

  const intakeModePolicy = useMemo(() => {
    if (!conflictScope) return null;
    const lm = conflictScope.leadIntakeMode;
    const pm = conflictScope.patientIntakeMode;
    const lExplicit = isExplicit(lm);
    const pExplicit = isExplicit(pm);

    if (lExplicit && pExplicit && lm === pm) {
      // Case 2: both same explicit type
      return { case: 2 as const, recommendedMode: lm as ExplicitMode, leadMode: lm, patientMode: pm };
    }
    if (lExplicit && !pExplicit) {
      // Case 3: lead has explicit, patient is legacy/null
      return { case: 3 as const, recommendedMode: lm as ExplicitMode, leadMode: lm, patientMode: pm };
    }
    if (!lExplicit && pExplicit) {
      // Case 3 (mirror): patient has explicit, lead is legacy/null
      return { case: 3 as const, recommendedMode: pm as ExplicitMode, leadMode: lm, patientMode: pm };
    }
    if (!lExplicit && !pExplicit) {
      // Case 4: both legacy/null — show all three, require explicit selection
      return { case: 4 as const, recommendedMode: null, leadMode: lm, patientMode: pm };
    }
    // Case 5: both explicit but different types — type conflict
    return { case: 5 as const, recommendedMode: null, leadMode: lm as ExplicitMode, patientMode: pm as ExplicitMode };
  }, [conflictScope]);
  const resolveConflictMutation = trpc.leads.resolveConflict.useMutation({
    onSuccess: (data) => {
      setShowResolveDialog(false);
      setResolveConfirmText("");
      setResolveIntakeMode("" as any);
      setResolveRequestId("");
      const archived = data.archivedDocs?.length ?? 0;
      const deleted = data.deletedDocs?.length ?? 0;
      const pending = data.storagePendingDocs?.length ?? 0;
      let msg = data.idempotent
        ? `Conflict already resolved (duplicate request). New Health Record ID: ${data.newIntakeId}.`
        : `Conflict resolved. New Health Record created (ID ${data.newIntakeId}).`;
      if (archived > 0) msg += ` ${archived} document(s) archived.`;
      if (deleted > 0) msg += ` ${deleted} document(s) deleted.`;
      if (pending > 0) msg += ` ${pending} document(s) queued for storage deletion.`;
      toast.success(msg);
      // Correction 8: Full cache invalidation after resolution
      // Correction 10 (v3): Full targeted cache invalidation after resolution
      // Invalidate lead medical intake, patient medical intake, lead documents, patient documents,
      // and the conflict scope query so both pages immediately show the canonical state.
      utils.leads.medicalIntake.invalidate();
      utils.leads.documents.invalidate();
      utils.leads.getConflictScope.invalidate();
      utils.patients.getIntake.invalidate();
      utils.patients.documents.invalidate();
      // Also do a broad invalidation to catch any other derived queries
      utils.leads.invalidate();
      utils.patients.invalidate();
    },
    onError: (err) => {
      const msg = err.message ?? "";
      if (msg.includes("already been resolved")) {
        toast.error("The conflict has already been resolved. Please refresh the page.");
      } else if (msg.includes("state has changed") || msg.includes("stale")) {
        toast.error("The conflict state changed. Please refresh and try again.");
      } else if (msg.includes("modified since")) {
        toast.error("The Health Record was modified since you loaded this page. Please refresh and try again.");
      } else {
        toast.error("Failed to resolve conflict. Please try again.");
      }
    },
  });
  const [form, setForm] = useState<any>({});
  // ── Draft session: stable draftSessionId + cross-tab lock ──
  const { draftSessionId, activeWriterToken, isWriteActive, isInitializing, lockDecisionMade, releaseLock, touchSession } = useDraftSession(mode, editing ? id : null);
  // Cancel draft session mutations (used when user explicitly cancels)
  const leadCancelDraft = trpc.leads.cancelDraftSession.useMutation();
  const patientCancelDraft = trpc.patients.cancelDraftSession.useMutation();
  // Cancel confirmation dialog state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [pendingFileCount, setPendingFileCount] = useState(0);
  // Contraceptive gate and dirty tracking — lifted here so handleSave can access them
  const [contraceptiveGate, setContraceptiveGate] = useState<boolean | null>(null);
  const [contraceptiveDirty, setContraceptiveDirty] = useState(false);
  // Female Genetic Tests gate and dirty tracking — lifted here so handleSave can access them
  const [femaleGeneticsGate, setFemaleGeneticsGate] = useState<boolean | null>(null);
  const [femaleGeneticsDirty, setFemaleGeneticsDirty] = useState(false);
  const intakeLoadedRef = useRef(false);
  // Phase 2 Final Acceptance: freeze the intake version at edit-open so that
  // background refetches cannot silently update expectedUpdatedAt and defeat
  // the stale-version protection. This ref is set once when editing starts.
  const capturedUpdatedAtRef = useRef<Date | null>(null);
  // Central meaningful-activity handler: throttled to 5 minutes.
  // Only triggered by genuine clinical field changes (not passive polling or uploads).
  const lastActivityTouchRef = useRef<number>(0);
  const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes
  const handleMeaningfulActivity = useCallback(() => {
    if (!editing || !isWriteActive) return;
    const now = Date.now();
    if (now - lastActivityTouchRef.current < ACTIVITY_THROTTLE_MS) return;
    lastActivityTouchRef.current = now;
    touchSession();
  }, [editing, isWriteActive, touchSession]);

  // Phase 2 fix: reset load guards when navigating between different entities
  // Without this, moving from Patient A to Patient B keeps Patient A's form data
  // because intakeLoadedRef.current is still true and the init effect exits early.
  useEffect(() => {
    intakeLoadedRef.current = false;
    diagnosisInitializedRef.current = false;
  }, [id, mode]);

  // On first load: if a draft exists AND it belongs to this exact entity, restore it
  // We wait for the server data (intake) to arrive so we can verify the draft's entity version.
  // This prevents stale drafts from a different lead/patient bleeding into a new one.
  useEffect(() => {
    if (intakeLoadedRef.current) return;
    if (readOnly) return;
    // Correction 1 (v3): Never enter editing mode while a conflict is active.
    // The draft is preserved in localStorage and will be restored after resolution.
    if (conflict) return;
    // We need intake to have loaded (even if null) so we know the entity's server-side createdAt
    if (intake === undefined) return; // still loading — wait
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate that the draft belongs to this exact entity
        // The draft stores __draftEntityId = `${mode}_${id}_${createdAt}` when saved
        const serverCreatedAt = (intake as any)?.createdAt ?? null;
        const expectedVersion = `${mode}_${id}_${serverCreatedAt}`;
        const draftVersion = parsed[DRAFT_VERSION_FIELD];
        if (draftVersion && draftVersion !== expectedVersion) {
          // Stale draft from a different entity — discard silently
          localStorage.removeItem(draftKey);
          setForm(intake ? { ...intake } : {});
          intakeLoadedRef.current = true;
          return;
        }
        // Draft is valid — restore it
        const { [DRAFT_VERSION_FIELD]: _v, ...formData } = parsed;
        // Phase 2 fix: structural identity fields from the server always win over the draft.
        // A stale draft may have intakeMode = null/general if it was saved before the user
        // clicked "Set as Female/Male Health Record". The server's saved intakeMode is authoritative.
        const serverIntakeMode = (intake as any)?.intakeMode ?? null;
        const mergedFormData = {
          ...formData,
          // Only override if the server has a definitive mode (female/male/legacy);
          // if the server also has null/general, keep the draft value as-is.
          ...(serverIntakeMode && serverIntakeMode !== 'general'
            ? { intakeMode: serverIntakeMode }
            : {}),
        };
        setForm(mergedFormData);
        setEditing(true);
        setHasDraft(true);
        intakeLoadedRef.current = true;
        // Freeze the version at the moment editing starts
        capturedUpdatedAtRef.current = (intake as any)?.updatedAt instanceof Date
          ? (intake as any).updatedAt
          : (intake as any)?.updatedAt ? new Date((intake as any).updatedAt) : null;
        toast.info("Unsaved draft restored", { description: "Your previous changes have been restored. Save when ready." });
        // Phase 2: pending-doc validation after restoration is handled by the
        // usePendingDocValidation effect below (runs when editing=true + draftSessionId available)
        return;
      }
    } catch {}
    // No draft — populate from server data
    // Hydrate flat contraceptive UI fields from the canonical contraceptiveHistory array
    const hydratedContraceptive = hydrateContraceptiveForm(
      (intake as any)?.contraceptiveHistory as ContraceptiveEntry[] | null
    );
    // Auto-derive intakeMode from leadGender when the server has no explicit mode.
    // This ensures a new intake for a female lead opens directly in Female mode
    // without showing the General/unidentified selector a second time.
    const serverIntakeModeForForm = (intake as any)?.intakeMode ?? null;
    const derivedGenderForForm = isLead
      ? String(((linkedPatientData as any)?.gender ?? (leadData as any)?.gender ?? '')).toLowerCase()
      : String(((patientData as any)?.gender ?? '')).toLowerCase();
    const autoIntakeMode =
      (!serverIntakeModeForForm || serverIntakeModeForForm === 'general')
        ? (derivedGenderForForm === 'female' ? 'female' : derivedGenderForForm === 'male' ? 'male' : serverIntakeModeForForm)
        : serverIntakeModeForForm;
    const baseFormData = intake ? { ...intake, ...hydratedContraceptive } : { ...hydratedContraceptive };
    setForm(autoIntakeMode ? { ...baseFormData, intakeMode: autoIntakeMode } : baseFormData);
    // Initialize Yes/No gate from canonical array
    setContraceptiveGate(
      deriveContraceptiveGate((intake as any)?.contraceptiveHistory as ContraceptiveEntry[] | null)
    );
    setContraceptiveDirty(false);
    // Initialize female genetics gate from DB array
    setFemaleGeneticsGate(
      deriveGateFromDB((intake as any)?.femaleGeneticTests as GeneticTestEntry[] | null)
    );
    setFemaleGeneticsDirty(false);
    intakeLoadedRef.current = true;
  }, [draftKey, readOnly, intake, mode, id, DRAFT_VERSION_FIELD]);

  // (Removed: merged into the draft-check useEffect above to avoid race conditions)

  // Auto-save form to localStorage whenever it changes while editing
  const setFormWithDraft = useCallback((updater: any) => {
    setForm((prev: any) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      // Embed entity version into the draft so stale drafts can be detected on load
      const serverCreatedAt = (intake as any)?.createdAt ?? null;
      const draftWithVersion = { ...next, [DRAFT_VERSION_FIELD]: `${mode}_${id}_${serverCreatedAt}` };
      try { localStorage.setItem(draftKey, JSON.stringify(draftWithVersion)); } catch {}
      return next;
    });
  }, [draftKey, intake, mode, id, DRAFT_VERSION_FIELD]);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(draftKey); } catch {}
    setHasDraft(false);
  }, [draftKey]);

  // Phase 2: Pending-doc validation on draft restoration
  // Query pending docs for the current session to detect expired/missing files
  const pendingDocsQuery = isLead
    ? trpc.leads.getPendingDraftDocs.useQuery(
        { draftSessionId: draftSessionId! },
        { enabled: editing && !!draftSessionId, staleTime: 30_000 }
      )
    : trpc.patients.getPendingDraftDocs.useQuery(
        { draftSessionId: draftSessionId! },
        { enabled: editing && !!draftSessionId, staleTime: 30_000 }
      );

  // Mark expired pending docs in form state after restoration
  useEffect(() => {
    if (!editing || !draftSessionId || !pendingDocsQuery.data) return;
    const serverDocs = pendingDocsQuery.data as any[];
    const now = Date.now();
    const expiredIds = new Set<number>(
      serverDocs
        .filter((d) => d.pendingExpiresAt && new Date(d.pendingExpiresAt).getTime() < now)
        .map((d) => d.id as number)
    );
    if (expiredIds.size === 0) return;
    // Walk all array fields in form and mark expired docs
    setForm((prev: any) => {
      let changed = false;
      const updated = { ...prev };
      const markExpiredInArray = (arr: any[]) =>
        arr.map((entry: any) => {
          if (entry?.docId && expiredIds.has(entry.docId) && entry.lifecycleStatus === 'pending-draft') {
            changed = true;
            return { ...entry, lifecycleStatus: 'expired', expiredPlaceholder: true };
          }
          return entry;
        });
      const arrayFields = ['artHistory', 'surgicalHistory', 'miscarriageHistory', 'previousTests',
        'radiologyStudies', 'maleRadiologyStudies', 'generalAttachmentsFemale', 'generalAttachmentsMale'];
      for (const field of arrayFields) {
        if (Array.isArray(updated[field])) {
          updated[field] = markExpiredInArray(updated[field]);
        }
      }
      if (typeof updated.maleIntake === 'object' && updated.maleIntake) {
        const mi = { ...updated.maleIntake };
        const maleFields = ['previousSurgeries', 'semenAnalysis', 'dnaFragmentation', 'previousTests'];
        for (const field of maleFields) {
          if (Array.isArray(mi[field])) {
            mi[field] = markExpiredInArray(mi[field]);
          }
        }
        if (changed) updated.maleIntake = mi;
      }
      if (!changed) return prev;
      toast.warning(
        `${expiredIds.size} uploaded file${expiredIds.size !== 1 ? 's have' : ' has'} expired.`,
        { description: 'Please upload them again before saving.' }
      );
      return updated;
    });
  }, [editing, draftSessionId, pendingDocsQuery.data]);

  // Create appointment for visit date
  const createAppointmentMutation = trpc.appointments.create.useMutation({
    onSuccess: () => toast.success("Visit appointment created in calendar"),
    onError: () => toast.error("Could not create calendar appointment for visit date"),
  });

  const handleCreateVisitAppointment = (dateStr: string) => {
    const appointmentDate = new Date(dateStr + "T09:00:00");
    if (isNaN(appointmentDate.getTime())) return;
    const title = isLead
      ? buildLeadVisitAppointmentTitle((leadData as any)?.firstName, (leadData as any)?.lastName)
      : `Visit – ${(patientData as any)?.name ?? "Patient"}`;
    createAppointmentMutation.mutate({
      title,
      appointmentDate,
      type: "consultation",
      appointmentType: "in-clinic",
      ...(isLead ? { leadId: id } : { patientId: id }),
    });
  };

  const leadSave = trpc.leads.saveMedicalIntake.useMutation({
    onSuccess: (data) => {
      toast.success("Medical intake saved");
      clearDraft();
      clearDraftSession(mode, id);
      releaseLock();
      setEditing(false);
      refetch();
      // Cross-invalidate the linked Patient's intake so PatientDetailPage stays in sync
      if (data?.linkedPatientId) {
        utils.patients.getIntake.invalidate({ patientId: data.linkedPatientId });
      }
      onSave?.();
    },
    onError: (e) => {
      if (e.message === "intake_conflict") {
        toast.error("Intake conflict detected. Please contact a system administrator to resolve the duplicate records before saving.");
        refetch(); // Refresh to show the conflict banner
      } else {
        const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again.");
        toast.error(_msg);
      }
    },
  });

  const patientSave = trpc.patients.saveIntake.useMutation({
    onSuccess: (data) => {
      toast.success("Intake saved");
      clearDraft();
      clearDraftSession(mode, id);
      releaseLock();
      setEditing(false);
      refetch();
      // Cross-invalidate the linked Lead's intake so LeadDetailPage stays in sync
      if (data?.linkedLeadId) {
        utils.leads.medicalIntake.invalidate({ leadId: data.linkedLeadId });
      }
    },
    onError: (e) => {
      if (e.message === "intake_conflict") {
        toast.error("Intake conflict detected. Please contact a system administrator to resolve the duplicate records before saving.");
        refetch(); // Refresh to show the conflict banner
      } else {
        const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again.");
        toast.error(_msg);
      }
    },
  });

  const isSaving = leadSave.isPending || patientSave.isPending;

  // Quick intakeMode setter from read-only mode (no full form save needed)
  const handleSetIntakeMode = (newMode: "female" | "male") => {
    if (isLead) {
      leadSave.mutate({ leadId: id, intakeMode: newMode } as any, {
        onSuccess: () => { toast.success(`Health Record set as ${newMode}`); refetch(); },
        onError: (e: any) => {
          if (e?.message === 'intake_conflict') {
            toast.error('An intake conflict is active. Resolve the conflict before identifying the Health Record type.');
            refetch();
          } else {
            toast.error('Failed to update Health Record type');
          }
        },
      });
    } else {
      patientSave.mutate({ patientId: id, intakeMode: newMode } as any, {
        onSuccess: () => { toast.success(`Health Record set as ${newMode}`); refetch(); },
        onError: (e: any) => {
          if (e?.message === 'intake_conflict') {
            toast.error('An intake conflict is active. Resolve the conflict before identifying the Health Record type.');
            refetch();
          } else {
            toast.error('Failed to update Health Record type');
          }
        },
      });
    }
  };

  const handleSave = () => {
    // ── Writer-authority guard ────────────────────────────────────────────────
    if (!isWriteActive || !activeWriterToken) {
      toast.error("Another tab is editing this record. Please reload to take over.");
      return;
    }
    // ── Pre-save future-date scan ─────────────────────────────────────────────
    // These checks are iOS-safe: they do not rely on the HTML max attribute.
    const futureDateFields: string[] = [];

    // Fix 2: use effective DOB/gender (Patient source of truth when linked)
    const _effectiveDobStr = isLead ? effectiveLeadDob : (patientData?.dateOfBirth ? new Date(patientData.dateOfBirth as any).toISOString().split('T')[0] : '');
    const _effectiveGender = isLead ? effectiveLeadGender : ((patientData as any)?.gender ?? '');
    const leadGenderNormalized = String(_effectiveGender).toLowerCase();

    // Female Date of Birth (DOB belongs to female lead only)
    const _femaleDobStr = leadGenderNormalized !== 'male' && _effectiveDobStr
      ? _effectiveDobStr
      : '';
    if (_femaleDobStr) {
      const d = new Date(_femaleDobStr);
      if (!isNaN(d.getTime())) {
        if (d.getFullYear() < 1900) { toast.error('Female date of birth must be 1900 or later.'); return; }
        if (isFutureDate(_femaleDobStr)) futureDateFields.push('Date of Birth (Female)');
      }
    }

    // Male Date of Birth (DOB belongs to male lead; otherwise use male intake)
    const _maleIntakeForDob = parseJSON(form.maleIntake, {}) as { dateOfBirth?: string | Date };
    const _maleDobStr = leadGenderNormalized === 'male' && _effectiveDobStr
      ? _effectiveDobStr
      : _maleIntakeForDob.dateOfBirth
        ? (typeof _maleIntakeForDob.dateOfBirth === 'string'
            ? _maleIntakeForDob.dateOfBirth.split('T')[0]
            : new Date(_maleIntakeForDob.dateOfBirth as any).toISOString().split('T')[0])
        : '';
    if (_maleDobStr) {
      const d = new Date(_maleDobStr);
      if (!isNaN(d.getTime())) {
        if (d.getFullYear() < 1900) { toast.error('Male date of birth must be 1900 or later.'); return; }
        if (isFutureDate(_maleDobStr)) futureDateFields.push('Date of Birth (Male)');
      }
    }

    // Marriage date
    if (form.marriageDate) {
      const d = new Date(form.marriageDate);
      if (!isNaN(d.getTime()) && d.getFullYear() < 1900) {
        toast.error('Marriage date must be 1900 or later.');
        return;
      }
      if (isFutureDate(d.toISOString().split('T')[0])) futureDateFields.push('Date of Marriage');
    }

    // Last menstrual period
    if (form.lastMenstrualPeriod) {
      const d = new Date(form.lastMenstrualPeriod);
      if (!isNaN(d.getTime()) && isFutureDate(d.toISOString().split('T')[0])) futureDateFields.push('First day of last period');
    }

    // Miscarriage dates
    const miscarriages = parseJSON(form.miscarriageHistory, []) as { date?: string }[];
    miscarriages.forEach((m, idx) => {
      if (m.date && isFutureMonth(m.date)) futureDateFields.push(`Miscarriage #${idx + 1} Date`);
    });

    // ART history dates
    const artHistory = parseJSON(form.artHistory, []) as { date?: string }[];
    artHistory.forEach((a, idx) => {
      if (a.date && isFutureMonth(a.date)) futureDateFields.push(`Fertility Treatment #${idx + 1} Date`);
    });

    // Surgical history dates
    const surgicalHistory = parseJSON(form.surgicalHistory, []) as { date?: string }[];
    surgicalHistory.forEach((s, idx) => {
      if (s.date && isFutureDate(s.date)) futureDateFields.push(`Surgery #${idx + 1} Date`);
    });

    // Previous tests dates
    const previousTests = parseJSON(form.previousTests, []) as { collectionDate?: string; reportDate?: string; name?: string }[];
    previousTests.forEach((t, idx) => {
      const label = t.name || `Test #${idx + 1}`;
      if (t.collectionDate && isFutureDate(t.collectionDate)) futureDateFields.push(`${label} Collection Date`);
      if (t.reportDate && isFutureDate(t.reportDate)) futureDateFields.push(`${label} Report Date`);
    });

    // Radiology study dates
    const radiology = parseJSON(form.radiologyStudies, []) as { studyDate?: string }[];
    radiology.forEach((r, idx) => {
      if (r.studyDate && isFutureDate(r.studyDate)) futureDateFields.push(`Radiology Study #${idx + 1} Date`);
    });
    const maleRadiology = parseJSON(form.maleRadiologyStudies, []) as { studyDate?: string }[];
    maleRadiology.forEach((r, idx) => {
      if (r.studyDate && isFutureDate(r.studyDate)) futureDateFields.push(`Male Radiology Study #${idx + 1} Date`);
    });

    // Male intake dates
    const maleIntake = parseJSON(form.maleIntake, {}) as { previousSurgeries?: { date?: string }[]; semenAnalysis?: { date?: string }[]; dnaFragmentation?: { date?: string }[]; previousTests?: { collectionDate?: string; reportDate?: string; name?: string }[] };
    (maleIntake.previousSurgeries ?? []).forEach((s, idx) => {
      if (s.date && isFutureDate(s.date)) futureDateFields.push(`Male Surgery #${idx + 1} Date`);
    });
    (maleIntake.semenAnalysis ?? []).forEach((s, idx) => {
      if (s.date && isFutureMonth(s.date)) futureDateFields.push(`Semen Analysis #${idx + 1} Date`);
    });
    (maleIntake.dnaFragmentation ?? []).forEach((s, idx) => {
      if (s.date && isFutureMonth(s.date)) futureDateFields.push(`DNA Fragmentation #${idx + 1} Date`);
    });
    (maleIntake.previousTests ?? []).forEach((t, idx) => {
      const label = t.name || `Male Test #${idx + 1}`;
      if (t.collectionDate && isFutureDate(t.collectionDate)) futureDateFields.push(`${label} Collection Date`);
      if (t.reportDate && isFutureDate(t.reportDate)) futureDateFields.push(`${label} Report Date`);
    });

    if (futureDateFields.length > 0) {
      toast.error(
        `Future dates are not allowed for historical records. Please correct: ${futureDateFields.slice(0, 3).join(', ')}${futureDateFields.length > 3 ? ` and ${futureDateFields.length - 3} more` : ''}.`
      );
      return;
    }
    // ── End future-date scan ──────────────────────────────────────────────────
    // ── Female Genetic Tests validation ──────────────────────────────────────
    const fgtValidationError = validateFemaleGeneticTests(
      femaleGeneticsGate,
      parseJSONArray<GeneticTestEntry>(form.femaleGeneticTests)
    );
    if (fgtValidationError) {
      toast.error(fgtValidationError);
      return;
    }
    // ── End Female Genetic Tests validation ───────────────────────────────────
    // ── ART cycle numerical hierarchy validation ──────────────────────────────
    // Validate oocyte maturity and fertilization hierarchies for all ART cycles.
    // Blocking errors (e.g. subfield sum > total) prevent save.
    const artCycles = parseJSON(form.artHistory, []) as ARTCycle[];
    const artValidationErrors: string[] = [];
    for (let ci = 0; ci < artCycles.length; ci++) {
      const cycle = artCycles[ci];
      const cycleLabel = `Treatment #${ci + 1}`;
      const result = validateCycleCollections(cycle, cycle.secondCollection);
      if (result.isBlocking) {
        artValidationErrors.push(...result.errors.map(e => `${cycleLabel}: ${e}`));
      }
    }
    if (artValidationErrors.length > 0) {
      toast.error(artValidationErrors[0], {
        description: artValidationErrors.length > 1
          ? `${artValidationErrors.length - 1} more error(s). Please review all ART cycles.`
          : undefined,
      });
      return;
    }
    // ── End ART cycle validation ──────────────────────────────────────────────
    // Build payload — convert empty strings and null enum fields to undefined
    const raw = {
      ...form,
      gravida: form.gravida != null && form.gravida !== "" ? parseInt(form.gravida) : undefined,
      para: form.para != null && form.para !== "" ? parseInt(form.para) : undefined,
      abortus: form.abortus != null && form.abortus !== "" ? parseInt(form.abortus) : undefined,
      livingChildren: form.livingChildren != null && form.livingChildren !== "" ? parseInt(form.livingChildren) : undefined,
      childrenFromPreviousMarriage: form.childrenFromPreviousMarriage != null && form.childrenFromPreviousMarriage !== "" ? parseInt(form.childrenFromPreviousMarriage) : undefined,
      cycleLengthDays: form.cycleLengthDays != null && form.cycleLengthDays !== "" ? parseInt(form.cycleLengthDays) : undefined,
      menstrualFlowDays: form.menstrualFlowDays != null && form.menstrualFlowDays !== "" ? parseInt(form.menstrualFlowDays) : undefined,
      marriageDate: form.marriageDate ? new Date(form.marriageDate) : undefined,
      lastMenstrualPeriod: form.lastMenstrualPeriod ? new Date(form.lastMenstrualPeriod) : undefined,
      expectedVisitDate: form.expectedVisitDate ? new Date(form.expectedVisitDate) : undefined,
      // All JSON fields: parse strings back to objects/arrays before sending to server.
      // Drizzle's json() column serializes values automatically — sending a string causes double-encoding.
      artHistory: form.artHistory ? parseJSON(form.artHistory, undefined) : undefined,
      surgicalHistory: form.surgicalHistory ? parseJSON(form.surgicalHistory, undefined) : undefined,
      miscarriageHistory: form.miscarriageHistory ? parseJSON(form.miscarriageHistory, undefined) : undefined,
      previousTests: form.previousTests ? parseJSON(form.previousTests, undefined) : undefined,
      // Persist the explicit Previous Tests boolean independently (distinct from array length).
      // form.hasPreviousTests is written by EditIntakeForm via set("hasPreviousTests", v)
      // so it is available here in the outer component's form state.
      hasPreviousTests: form.hasPreviousTests !== null && form.hasPreviousTests !== undefined
        ? form.hasPreviousTests
        : undefined,
      systemicDiseases: form.systemicDiseases ? parseJSON(form.systemicDiseases, undefined) : undefined,
      maleIntake: form.maleIntake ? parseJSON(form.maleIntake, undefined) : undefined,
      generalAttachmentsFemale: form.generalAttachmentsFemale ? parseJSON(form.generalAttachmentsFemale, undefined) : undefined,
      generalAttachmentsMale: form.generalAttachmentsMale ? parseJSON(form.generalAttachmentsMale, undefined) : undefined,
      radiologyStudies: form.radiologyStudies ? parseJSON(form.radiologyStudies, undefined) : undefined,
      maleRadiologyStudies: form.maleRadiologyStudies ? parseJSON(form.maleRadiologyStudies, undefined) : undefined,
      // Female Genetic Tests: intent-based serialization
      // serializeFemaleGeneticTests(gate, isDirty, entries) — derives intent internally
      femaleGeneticTests: serializeFemaleGeneticTests(
        femaleGeneticsGate,
        femaleGeneticsDirty,
        parseJSONArray<GeneticTestEntry>(form.femaleGeneticTests)
      ),
      patientQuestions: form.patientQuestions ? parseJSON(form.patientQuestions, undefined) : undefined,
      doctorAnswers: form.doctorAnswers ? parseJSON(form.doctorAnswers, undefined) : undefined,
      // Enum fields: treat empty string as undefined
      infertilityType: form.infertilityType || undefined,
      cycleRegularity: form.cycleRegularity || undefined,
      smoking: form.smoking || undefined,
      alcohol: form.alcohol || undefined,
      // Phase 2: intakeMode — preserve whatever is in form (null = legacy, or 'female'/'male'/'general')
      intakeMode: form.intakeMode || undefined,
      // Contraceptive History: canonical adapter with explicit intent semantics
      // intent is derived from gate state + dirty tracking to distinguish:
      //   preserve (never touched) | update (user edited) | clear (user selected No)
      contraceptiveHistory: (() => {
        const intent = deriveContraceptiveIntent(
          contraceptiveGate,
          contraceptiveDirty,
          intake?.contraceptiveHistory as ContraceptiveEntry[] | null
        );
        return serializeContraceptiveHistory(
          {
            contraceptiveMethod: form.contraceptiveMethod,
            contraceptiveDuration: form.contraceptiveDuration,
            contraceptiveStoppedAgo: form.contraceptiveStoppedAgo,
            contraceptiveMethodOther: form.contraceptiveMethodOther,
          },
          intake?.contraceptiveHistory as ContraceptiveEntry[] | null,
          intent
        );
      })(),
    };
    // Strip null and empty-string values so the server never receives invalid types
    const payload = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== null && v !== undefined && v !== "")
    );

    // Phase 2 Final Correction: use server-issued activeWriterToken (independent of draftSessionId)
    const saveRequestId = crypto.randomUUID();
    if (isLead) {
      leadSave.mutate({ leadId: id, ...payload, draftSessionId: draftSessionId ?? undefined, activeWriterToken: activeWriterToken ?? undefined, requestId: saveRequestId, expectedUpdatedAt: capturedUpdatedAtRef.current ?? undefined } as any);
    } else {
      patientSave.mutate({ patientId: id, ...payload, draftSessionId: draftSessionId ?? undefined, activeWriterToken: activeWriterToken ?? undefined, requestId: saveRequestId, expectedUpdatedAt: capturedUpdatedAtRef.current ?? undefined } as any);
    }
  };

  const isLoading = isLead ? leadQuery.isLoading : patientQuery.isLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <SectionStorageContext.Provider value={`${mode}_${id}`}>
    <div className="space-y-4">
      {/* ── Intake Conflict Banner ────────────────────────────────────────────── */}
      {/* Shown when two separate intake rows exist for the same person (one keyed  */}
      {/* by leadId, one by patientId). All edit/save/reset actions are disabled.  */}
      {conflict && (
        <div id="intake-conflict-banner" className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-2">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-destructive">Intake Conflict Detected</p>
              <p className="text-sm text-destructive/80">
                Two separate Health Record rows exist for this person — one linked to the Lead record
                (ID&nbsp;{conflict.leadIntakeId}) and one linked to the Patient record
                (ID&nbsp;{conflict.patientIntakeId}). All edits and resets are disabled until a
                system administrator resolves the conflict.
              </p>
              {(conflict.leadIntakeSummary || conflict.patientIntakeSummary) && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {conflict.leadIntakeSummary && (
                    <div className="rounded border border-destructive/30 bg-background/50 p-2 space-y-0.5">
                      <p className="font-medium text-destructive">Lead-keyed row (ID {conflict.leadIntakeId})</p>
                      <p>Sections filled: {conflict.leadIntakeSummary.sectionCount ?? "—"}</p>
                      <p>Documents: {conflict.leadIntakeSummary.docCount ?? "—"}</p>
                      {conflict.leadIntakeSummary.updatedAt && (
                        <p>Last updated: {new Date(conflict.leadIntakeSummary.updatedAt).toLocaleDateString()}</p>
                      )}
                    </div>
                  )}
                  {conflict.patientIntakeSummary && (
                    <div className="rounded border border-destructive/30 bg-background/50 p-2 space-y-0.5">
                      <p className="font-medium text-destructive">Patient-keyed row (ID {conflict.patientIntakeId})</p>
                      <p>Sections filled: {conflict.patientIntakeSummary.sectionCount ?? "—"}</p>
                      <p>Documents: {conflict.patientIntakeSummary.docCount ?? "—"}</p>
                      {conflict.patientIntakeSummary.updatedAt && (
                        <p>Last updated: {new Date(conflict.patientIntakeSummary.updatedAt).toLocaleDateString()}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* Admin-only: Resolve Conflict button */}
              {isAdmin && isLead && (
                <div className="mt-3 pt-3 border-t border-destructive/20">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setResolveDocHandling("archive");
                      // Correction 7: no default intakeMode — user must explicitly select
                      setResolveIntakeMode("" as any);
                      setResolveConfirmText("");
                            // Correction 4: generate a fresh requestId for this dialog session
                      setResolveRequestId(crypto.randomUUID());
                      setShowResolveDialog(true);
                    }}
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Resolve Conflict (Admin)
                  </Button>
                  <p className="text-xs text-destructive/60 mt-1">
                    This will permanently delete both conflicting Health Record rows and create a new canonical one.
                  </p>
                </div>
              )}
              {/* Correction 2 (v3): Patient-side admin action — navigate to the Lead Medical Record tab with conflict focus */}
              {isAdmin && !isLead && patientQueryLinkedLeadId && (
                <div className="mt-3 pt-3 border-t border-destructive/20">
                  <a
                    href={`/leads/${patientQueryLinkedLeadId}?tab=medical-intake&focus=intake-conflict`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive underline underline-offset-2 hover:no-underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open Lead Medical Record to Resolve
                  </a>
                  <p className="text-xs text-destructive/60 mt-1">
                    Opens the linked Lead's Medical Record tab directly. Resolve the conflict there — this page updates automatically.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Resolve Conflict Dialog (admin-only, lead mode) ───────────────────────── */}
      <Dialog open={showResolveDialog} onOpenChange={(open) => {
        if (!resolveConflictMutation.isPending) setShowResolveDialog(open);
      }}>
        <DialogContent className="max-w-lg w-[calc(100vw-2rem)] flex flex-col" style={{maxHeight:'calc(100dvh - 2rem)',height:'auto'}}>
          {/* Sticky header — always visible */}
          <DialogHeader className="shrink-0 pb-2 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              Resolve Intake Conflict
            </DialogTitle>
          </DialogHeader>
          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-2 pr-1">
            <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive/90 space-y-1">
              <p className="font-semibold">This action is irreversible.</p>
              <p>Both conflicting Health Record rows will be permanently deleted and a new canonical row will be created in their place.</p>
              <p>Lead-keyed row ID: <strong>{conflict?.leadIntakeId}</strong> &nbsp;|&nbsp; Patient-keyed row ID: <strong>{conflict?.patientIntakeId}</strong></p>
            </div>

            {/* Correction 9 (v3): Expanded server-calculated scope summary with 9 categories */}
            {conflictScopeQuery.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading conflict scope…
              </div>
            ) : conflictScopeQuery.isError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                Failed to load conflict scope. Submission is disabled until scope can be verified.
              </div>
            ) : conflictScope ? (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-2">
                <p className="font-medium text-sm">Conflict scope (server-calculated)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-2 border-b border-border/50">
                  <div>
                    <p className="text-muted-foreground font-medium">Lead-keyed row (ID {conflictScope.leadIntakeId})</p>
                    <p>Sections filled: {conflictScope.leadSectionCount}</p>
                    <p>Last updated: {new Date(conflictScope.leadUpdatedAt).toLocaleDateString()}</p>
                    <p>Health Record type: <span className="font-medium capitalize">{conflictScope.leadIntakeMode ?? "legacy/unidentified"}</span></p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium">Patient-keyed row (ID {conflictScope.patientIntakeId})</p>
                    <p>Sections filled: {conflictScope.patientSectionCount}</p>
                    <p>Last updated: {new Date(conflictScope.patientUpdatedAt).toLocaleDateString()}</p>
                    <p>Health Record type: <span className="font-medium capitalize">{conflictScope.patientIntakeMode ?? "legacy/unidentified"}</span></p>
                  </div>
                </div>
                {/* Dynamic action explanation based on selected doc handling */}
                <div className="space-y-1">
                  <p className="font-medium text-xs text-foreground/80">What will happen to documents:</p>
                  {resolveDocHandling === "archive" ? (
                    <ul className="space-y-0.5 text-muted-foreground">
                      <li>• <span className="text-foreground font-medium">{conflictScope.archiveEligibleCount}</span> active Health Record document(s) will be marked as <em>historical</em>.</li>
                      <li>• <span className="text-foreground">{conflictScope.historicalDocCount}</span> existing historical document(s) will remain unchanged.</li>
                      <li>• <span className="text-foreground">{conflictScope.directUploadCount}</span> Direct Upload document(s) will remain unchanged.</li>
                      <li>• <span className="text-foreground">{conflictScope.deletionPendingCount}</span> deletion-pending document(s) will not be reprocessed.</li>
                      <li>• <span className="text-foreground">{conflictScope.unclassifiedCount}</span> unclassified document(s) will remain unchanged.</li>
                    </ul>
                  ) : (
                    <ul className="space-y-0.5 text-muted-foreground">
                      <li>• <span className="text-destructive font-medium">{conflictScope.deleteEligibleCount}</span> active + historical Health Record document(s) will be <strong className="text-destructive">permanently deleted</strong>.</li>
                      <li>• <span className="text-foreground">{conflictScope.directUploadCount}</span> Direct Upload document(s) will remain unchanged.</li>
                      <li>• <span className="text-foreground">{conflictScope.deletionPendingCount}</span> deletion-pending document(s) will not be reprocessed.</li>
                      <li>• <span className="text-foreground">{conflictScope.unclassifiedCount}</span> unclassified document(s) will remain unchanged.</li>
                    </ul>
                  )}
                  {conflictScope.duplicatesRemoved > 0 && (
                    <p className="text-muted-foreground">• <span className="text-foreground">{conflictScope.duplicatesRemoved}</span> duplicate reference(s) deduplicated.</p>
                  )}
                </div>
              </div>
            ) : null}

            {/* Document handling */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">What should happen to existing documents?</Label>
              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="docHandling"
                    value="archive"
                    checked={resolveDocHandling === "archive"}
                    onChange={() => setResolveDocHandling("archive")}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium">Archive all documents</p>
                    <p className="text-xs text-muted-foreground">Documents are marked as archived and hidden from the active Health Record. They remain in the Documents Library and can be recovered.</p>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="docHandling"
                    value="delete"
                    checked={resolveDocHandling === "delete"}
                    onChange={() => setResolveDocHandling("delete")}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium">Permanently delete all documents</p>
                    <p className="text-xs text-destructive/80">Documents are permanently deleted and cannot be recovered. Direct-upload documents are not affected.</p>
                  </div>
                </label>
              </div>
            </div>

            {/* v5: context-aware Health Record type selection — 5-case policy */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Health Record type for the new canonical row <span className="text-destructive">*</span></Label>

              {/* Case 5: type conflict — both rows have different explicit types — BLOCKED */}
              {intakeModePolicy?.case === 5 && (
                <div className="rounded-md border border-destructive/60 bg-destructive/5 p-3 space-y-2">
                  <div className="flex items-start gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p className="text-xs font-semibold">Health Record Type Conflict — Administrative Review Required</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The two conflicting rows have different explicit types:
                    <span className="font-medium capitalize text-foreground ml-1">{intakeModePolicy.leadMode}</span> (lead-keyed row)
                    <span className="mx-1">vs</span>
                    <span className="font-medium capitalize text-foreground">{intakeModePolicy.patientMode}</span> (patient-keyed row).
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Standard resolution is blocked. This conflict represents both an identity-row conflict and a clinical-template conflict.
                    It must be reviewed separately before a canonical row can be created.
                  </p>
                  <p className="text-xs text-destructive font-medium">The Resolve action is disabled for this case.</p>
                </div>
              )}

              {/* Case 2: both rows same explicit type — show as the only normal choice */}
              {intakeModePolicy?.case === 2 && (
                <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Both conflicting rows are typed as <span className="font-medium capitalize text-foreground">{intakeModePolicy.recommendedMode}</span>.
                    The new canonical row will use this type.
                  </p>
                  {/* Auto-select the recommended mode */}
                  {resolveIntakeMode !== intakeModePolicy.recommendedMode && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => setResolveIntakeMode(intakeModePolicy.recommendedMode!)}
                    >
                      Confirm: use <span className="capitalize ml-1">{intakeModePolicy.recommendedMode}</span> Health Record
                    </Button>
                  )}
                                    {resolveIntakeMode === intakeModePolicy.recommendedMode && (
                    <p className="text-xs text-green-700 dark:text-green-400 font-medium">✓ <span className="capitalize">{intakeModePolicy.recommendedMode}</span> Health Record confirmed.</p>
                  )}
                </div>
              )}
              {/* Case 3: one explicit + one legacy/null — recommend the explicit type */}
              {intakeModePolicy?.case === 3 && (
                <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    One row is typed as <span className="font-medium capitalize text-foreground">{intakeModePolicy.recommendedMode}</span>; the other is legacy/unidentified.
                    The recommended type for the new canonical row is <span className="font-medium capitalize text-foreground">{intakeModePolicy.recommendedMode}</span>.
                  </p>
                  {resolveIntakeMode !== intakeModePolicy.recommendedMode && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => setResolveIntakeMode(intakeModePolicy.recommendedMode!)}
                    >
                      Use <span className="capitalize ml-1">{intakeModePolicy.recommendedMode}</span> Health Record (recommended)
                    </Button>
                  )}
                                    {resolveIntakeMode === intakeModePolicy.recommendedMode && (
                    <p className="text-xs text-green-700 dark:text-green-400 font-medium">✓ <span className="capitalize">{intakeModePolicy.recommendedMode}</span> Health Record confirmed.</p>
                  )}
                </div>
              )}
              {/* Case 4: both legacy/null — require explicit selection from all three */}
              {intakeModePolicy?.case === 4 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Both rows are legacy/unidentified. Select the correct Health Record type.</p>
                  <Select value={resolveIntakeMode} onValueChange={(v) => setResolveIntakeMode(v as "female" | "male" | "general")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a type…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">♀ Female Health Record</SelectItem>
                      <SelectItem value="male">♂ Male Health Record</SelectItem>
                      <SelectItem value="general">⚪ General Health Record</SelectItem>
                    </SelectContent>
                  </Select>
                  {!resolveIntakeMode && (
                    <p className="text-xs text-destructive">You must select a Health Record type before resolving.</p>
                  )}
                </div>
              )}

              {/* Fallback while scope is loading or policy not yet computed */}
              {!intakeModePolicy && !conflictScopeQuery.isLoading && (
                <Select value={resolveIntakeMode} onValueChange={(v) => setResolveIntakeMode(v as "female" | "male" | "general")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a type…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">♀ Female Health Record</SelectItem>
                    <SelectItem value="male">♂ Male Health Record</SelectItem>
                  </SelectContent>
                </Select>
              )}


            </div>

            {/* Confirmation text */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Type <strong>RESOLVE</strong> to confirm
              </Label>
              <Input
                value={resolveConfirmText}
                onChange={(e) => setResolveConfirmText(e.target.value)}
                placeholder="RESOLVE"
                className="font-mono"
                disabled={resolveConflictMutation.isPending}
              />
            </div>
          </div>
          {/* Sticky footer — always visible */}
          <DialogFooter className="gap-2 shrink-0 pt-3 border-t border-border">
            <Button
              variant="outline"
              onClick={() => setShowResolveDialog(false)}
              disabled={resolveConflictMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                resolveConfirmText !== "RESOLVE" ||
                resolveConflictMutation.isPending ||
                !conflict ||
                !resolveIntakeMode ||
                !resolveRequestId ||
                !conflictScope ||
                conflictScopeQuery.isError ||
                conflictScopeQuery.isLoading ||
                // Policy: Case 5 (different explicit types) blocks standard resolution
                intakeModePolicy?.case === 5
              }
              onClick={() => {
                if (!conflict || !resolveIntakeMode || !resolveRequestId || !conflictScope) return;
                resolveConflictMutation.mutate({
                  leadId: id,
                  requestId: resolveRequestId,
                  expectedLeadIntakeId: conflictScope.leadIntakeId,
                  expectedPatientIntakeId: conflictScope.patientIntakeId,
                  expectedLeadUpdatedAt: conflictScope.leadUpdatedAt,
                  expectedPatientUpdatedAt: conflictScope.patientUpdatedAt,
                  docHandling: resolveDocHandling,
                  newIntakeMode: resolveIntakeMode as "female" | "male" | "general",
                });
              }}
            >
              {resolveConflictMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Resolving…</>
              ) : (
                <><ShieldAlert className="h-4 w-4" /> Delete Both & Create New</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!readOnly && !editing && !conflict && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => {
            // Freeze the version at the moment editing starts
            capturedUpdatedAtRef.current = (intake as any)?.updatedAt instanceof Date
              ? (intake as any).updatedAt
              : (intake as any)?.updatedAt ? new Date((intake as any).updatedAt) : null;
            setEditing(true);
          }} className="gap-1.5">
            <Edit className="h-3.5 w-3.5" /> {intake ? "Edit Intake" : "Fill Intake"}
          </Button>
        </div>
      )}

      {hasDraft && !editing && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300 text-xs">
          <span>You have an unsaved draft. Click "Edit Intake" to continue editing.</span>
          <button type="button" onClick={() => { clearDraft(); setForm(intake ? { ...intake } : {}); }} className="underline hover:no-underline shrink-0">Discard draft</button>
        </div>
      )}

      {/* Cancel confirmation dialog */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingFileCount > 0
                ? `You have ${pendingFileCount} uploaded file${pendingFileCount !== 1 ? 's' : ''} that will be permanently deleted. This cannot be undone.`
                : 'All unsaved changes will be lost.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                // Cancel all pending-draft docs for this session
                if (draftSessionId && activeWriterToken) {
                  try {
                    if (isLead) await leadCancelDraft.mutateAsync({ draftSessionId, activeWriterToken });
                    else await patientCancelDraft.mutateAsync({ draftSessionId, activeWriterToken });
                  } catch { /* non-blocking — session may already be cancelled */ }
                  clearDraftSession(mode, id);
                  releaseLock();
                }
                clearDraft();
                setEditing(false);
                setShowCancelConfirm(false);
                // Reset contraceptive gate and dirty flag to server state
                setContraceptiveGate(deriveContraceptiveGate(intake?.contraceptiveHistory as ContraceptiveEntry[] | null));
                setContraceptiveDirty(false);
                // Reset female genetics gate and dirty flag to server state
                setFemaleGeneticsGate(deriveGateFromDB((intake as any)?.femaleGeneticTests as GeneticTestEntry[] | null));
                setFemaleGeneticsDirty(false);
                const hydratedContraceptive = hydrateContraceptiveForm(intake?.contraceptiveHistory as ContraceptiveEntry[] | null);
                setForm(intake ? { ...intake, ...hydratedContraceptive } : {});
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editing ? (
        <EditIntakeForm
          form={form}
          setForm={setFormWithDraft}
          onSave={handleSave}
          onCancel={async () => {
            // Inactive-tab Cancel: close the local editor immediately without any server call.
            // The active writer's session and pending files are not affected.
            if (!isWriteActive) {
              clearDraft();
              setEditing(false);
              return;
            }
            // Count pending-draft files before showing confirmation
            const allDocIds: number[] = [];
            const formData = form as any;
            // Collect docIds from all array fields
            const arrayFields = ['artHistory', 'surgicalHistory', 'miscarriageHistory', 'previousTests', 'radiologyStudies', 'maleRadiologyStudies'];
            for (const field of arrayFields) {
              const arr = Array.isArray(formData[field]) ? formData[field] : [];
              for (const entry of arr) {
                if (entry?.docId && entry?.lifecycleStatus === 'pending-draft') allDocIds.push(entry.docId);
              }
            }
            // Also check maleIntake sub-fields
            const maleIntakeData = typeof formData.maleIntake === 'object' ? formData.maleIntake : {};
            const maleArrayFields = ['previousSurgeries', 'semenAnalysis', 'dnaFragmentation', 'previousTests'];
            for (const field of maleArrayFields) {
              const arr = Array.isArray(maleIntakeData[field]) ? maleIntakeData[field] : [];
              for (const entry of arr) {
                if (entry?.docId && entry?.lifecycleStatus === 'pending-draft') allDocIds.push(entry.docId);
              }
            }
            // Check single-file fields
            const singleFileFields = ['marriageCertificate', 'generalAttachmentsFemale', 'generalAttachmentsMale'];
            for (const field of singleFileFields) {
              const arr = Array.isArray(formData[field]) ? formData[field] : [];
              for (const entry of arr) {
                if (entry?.docId && entry?.lifecycleStatus === 'pending-draft') allDocIds.push(entry.docId);
              }
            }
            const uniqueCount = new Set(allDocIds).size;
            setPendingFileCount(uniqueCount);
            setShowCancelConfirm(true);
          }}
          isSaving={isSaving}
          mode={mode}
          id={id}
          leadDob={isLead ? effectiveLeadDob : (patientData?.dateOfBirth ? new Date(patientData.dateOfBirth as any).toISOString().split("T")[0] : "")}
          leadGender={isLead ? effectiveLeadGender : ((patientData as any)?.gender ?? "")}
          onUpdateLeadDob={updateLeadDob}
          femaleFertilityDiagnosis={femaleFertilityDiagnosis}
          maleFertilityDiagnosis={maleFertilityDiagnosis}
          onFemaleDiagnosisChange={handleFemaleDiagnosisChange}
          onMaleDiagnosisChange={handleMaleDiagnosisChange}
          leadSource={(leadData as any)?.leadSource ?? ""}
          onCreateVisitAppointment={handleCreateVisitAppointment}
          initialPartnerTab={activePartnerTab}
          onPartnerTabChange={setActivePartnerTab}
          ownerName={(leadData as any)?.firstName ? `${(leadData as any).firstName} ${(leadData as any).lastName ?? ''}`.trim() : ((patientData as any)?.firstName ? `${(patientData as any).firstName} ${(patientData as any).lastName ?? ''}`.trim() : "")}
          partnerOwnerName={(partnerData as any)?.firstName ? `${(partnerData as any).firstName} ${(partnerData as any).lastName ?? ''}`.trim() : ""}
          partnerGender={(partnerData as any)?.gender ?? ""}
          contraceptiveGate={contraceptiveGate}
          onContraceptiveChange={(v, dirty) => {
            setContraceptiveGate(v);
            if (dirty) setContraceptiveDirty(true);
          }}
          femaleGeneticsGate={femaleGeneticsGate}
          onFemaleGeneticsChange={(v, dirty) => {
            setFemaleGeneticsGate(v);
            if (dirty) setFemaleGeneticsDirty(true);
          }}
          draftSessionId={draftSessionId}
          activeWriterToken={activeWriterToken}
          isWriteActive={isWriteActive}
          lockDecisionMade={lockDecisionMade}
          onTouchSession={handleMeaningfulActivity}
        />
      ) : intake ? (
        <ReadOnlyIntake
          intake={intake}
          leadDob={isLead ? effectiveLeadDob : (patientData?.dateOfBirth ? new Date(patientData.dateOfBirth as any).toISOString().split("T")[0] : "")}
          leadGender={isLead ? effectiveLeadGender : ((patientData as any)?.gender ?? "")}
          femaleFertilityDiagnosis={femaleFertilityDiagnosis}
          maleFertilityDiagnosis={maleFertilityDiagnosis}
          leadData={leadData}
          activePartnerTab={activePartnerTab}
          onPartnerTabChange={setActivePartnerTab}
          ownerName={(leadData as any)?.firstName ? `${(leadData as any).firstName} ${(leadData as any).lastName ?? ''}`.trim() : ((patientData as any)?.firstName ? `${(patientData as any).firstName} ${(patientData as any).lastName ?? ''}`.trim() : "")}
          partnerOwnerName={(partnerData as any)?.firstName ? `${(partnerData as any).firstName} ${(partnerData as any).lastName ?? ''}`.trim() : ""}
          partnerGender={(partnerData as any)?.gender ?? ""}
          onSetIntakeMode={!readOnly && !conflict ? handleSetIntakeMode : undefined}
          hasConflict={!!conflict}
        />
      ) : (
        <div className="space-y-4">
          {/* Show lead-level summary even when no full medical intake exists */}
          {isLead && leadData && (() => {
            const mi = (leadData as any)?.mainMedicalInterest;
            const miArr: string[] = mi ? (Array.isArray(mi) ? mi : (typeof mi === "string" ? (mi.startsWith("[") ? JSON.parse(mi) : [mi]) : [])) : [];
            const OPTION_LABELS_2: Record<string, string> = {
              "immediately": "As soon as possible / Immediately",
              "1-2-weeks": "1–2 Weeks",
              "1-month": "1 Month",
              "2-months": "2 Months",
              "3-months": "3 Months",
              "1-3-months": "1–3 Months",
              "6-months": "6 Months",
              "exploring": "Exploring / Not Sure",
              "never-tried": "Never Tried",
              "tried-unsuccessful": "Tried Before – Unsuccessful",
              "tried-again": "Tried Before – Wants Try Again",
              "tried-multiple": "Tried Multiple Attempts",
              "ivf-icsi": "IVF With ICSI",
              "ivf_icsi": "IVF With ICSI",
              "ivf with icsi": "IVF With ICSI",
              "iui": "IUI",
              "pgt": "PGT",
              "egg-freezing": "Egg Freezing",
              "egg_freezing": "Egg Freezing",
              "local": "Local",
              "international": "International",
            };
            const hv = (v: string) => OPTION_LABELS_2[v] ?? OPTION_LABELS_2[v.toLowerCase()] ?? v.replace(/_/g, " ").replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
            const hasSummary = !!(miArr.length > 0 || (leadData as any)?.decisionTimeline || (leadData as any)?.ivfExperience || (leadData as any)?.travelReadiness || (leadData as any)?.budgetRange || (leadData as any)?.patientType);
            if (!hasSummary) return null;
            return (
              <div className="rounded-lg border bg-card p-4 space-y-2">
                <p className="text-sm font-semibold text-foreground">Intake Summary</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm">
                  {miArr.length > 0 && <div><span className="text-muted-foreground">Main Interest: </span><span>{miArr.map(hv).join(", ")}</span></div>}
                  {(leadData as any)?.decisionTimeline && <div><span className="text-muted-foreground">Timeline: </span><span>{hv((leadData as any).decisionTimeline)}</span></div>}
                  {(leadData as any)?.ivfExperience && <div><span className="text-muted-foreground">IVF Experience: </span><span>{hv((leadData as any).ivfExperience)}</span></div>}
                  {(leadData as any)?.travelReadiness && <div><span className="text-muted-foreground">Travel Readiness: </span><span>{hv((leadData as any).travelReadiness)}</span></div>}
                  {(leadData as any)?.budgetRange && <div><span className="text-muted-foreground">Budget: </span><span>{hv((leadData as any).budgetRange)}</span></div>}
                  {(leadData as any)?.patientType && <div><span className="text-muted-foreground">Patient Type: </span><span>{hv((leadData as any).patientType)}</span></div>}
                </div>
              </div>
            );
          })()}
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <AlertCircle className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No detailed intake form filled yet</p>
            {!readOnly && !conflict && (
              <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => {
                capturedUpdatedAtRef.current = (intake as any)?.updatedAt instanceof Date
                  ? (intake as any).updatedAt
                  : (intake as any)?.updatedAt ? new Date((intake as any).updatedAt) : null;
                setEditing(true);
              }}>
                <Plus className="h-3.5 w-3.5" /> Fill Intake Form
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
    </SectionStorageContext.Provider>
  );
}
