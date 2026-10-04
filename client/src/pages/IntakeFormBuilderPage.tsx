/**
 * IntakeFormBuilderPage
 * Admin page to create/manage dynamic intake forms for advertising campaigns.
 * Features:
 *  - Full field catalog: ALL leads + medical_intake fields (6 categories)
 *  - Field search/filter
 *  - Language selector (AR / TR) before AI translation
 *  - Translation tab showing all field labels + options in EN/AR/TR columns
 *  - Step organizer: group fields into wizard steps with drag-and-drop reorder
 */
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  ExternalLink,
  Globe,
  GripVertical,
  Loader2,
  Plus,
  Search,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type Lang = "en" | "ar" | "tr";
const LANGS: { code: Lang; label: string; dir: "ltr" | "rtl" }[] = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "tr", label: "Türkçe", dir: "ltr" },
];

type FieldCategory =
  | "personal_info"
  | "contact_info"
  | "lead_info"
  | "logistics"
  | "fertility_female"
  | "fertility_male"
  | "partner_info";

const CATEGORY_LABELS: Record<FieldCategory, string> = {
  personal_info: "Personal Information",
  contact_info: "Contact Information",
  lead_info: "Medical Interest & Planning",
  logistics: "Accommodation & Transport",
  fertility_female: "Female Medical Record",
  fertility_male: "Male Medical Record",
  partner_info: "Partner Information",
};

const CATEGORY_ICONS: Record<FieldCategory, string> = {
  personal_info: "👤",
  contact_info: "📞",
  lead_info: "🏥",
  logistics: "✈️",
  fertility_female: "♀️",
  fertility_male: "♂️",
  partner_info: "👫",
};

// Source badge colors
const SOURCE_COLORS: Record<string, string> = {
  leads: "bg-violet-100 text-violet-700",
  medical_intake: "bg-teal-100 text-teal-700",
};

// Option display labels (mirrors OPTION_LABELS in backend)
const OPTION_DISPLAY: Record<string, string> = {
  female: "Female", male: "Male", other: "Other",
  local: "Local Patient", international: "International Patient",
  primary: "Primary — never conceived before", secondary: "Secondary — conceived before",
  regular: "Yes, regular", irregular: "No, irregular", absent: "No periods at all",
  yes: "Yes", no: "No",
  never: "Never", former: "Former smoker", current: "Yes, currently",
  occasional: "Occasionally",
  diabetes: "Diabetes", hypertension: "Hypertension", thyroid: "Thyroid disorder",
  pcos: "PCOS", endometriosis: "Endometriosis", autoimmune: "Autoimmune condition",
  varicocele: "Varicocele", hormonal: "Hormonal disorder",
  none: "None of the above",
  en: "English", ar: "Arabic", tr: "Turkish", fr: "French",
  es: "Spanish", ru: "Russian", it: "Italian",
  whatsapp: "WhatsApp", phone: "Phone Call", email: "Email", video_call: "Video Call",
  "never-tried": "Never tried IVF", "tried-unsuccessful": "Tried IVF — unsuccessful",
  "tried-again": "Tried IVF — trying again", "tried-multiple": "Tried IVF multiple times",
  immediately: "Immediately", "1-2-weeks": "1–2 weeks", "1-month": "1 month",
  "2-months": "2 months", "3-months": "3 months", "1-3-months": "1–3 months",
  "6-months": "6 months", exploring: "Just exploring",
  ready: "Ready to travel", considering: "Still considering",
  "prefers-home": "Prefers treatment at home", "local-patient": "Local patient",
  ivf: "IVF", icsi: "ICSI", iui: "IUI", pgt: "PGT (Genetic Testing)",
  egg_freezing: "Egg Freezing", sperm_freezing: "Sperm Freezing",
  embryo_freezing: "Embryo Freezing", donor_egg: "Donor Egg", donor_sperm: "Donor Sperm",
  surrogacy: "Surrogacy", male_factor: "Male Factor Treatment",
  recurrent_miscarriage: "Recurrent Miscarriage", fertility_assessment: "Fertility Assessment",
  low_ovarian_reserve: "Low Ovarian Reserve", blocked_tubes: "Blocked Fallopian Tubes",
  uterine_fibroids: "Uterine Fibroids", unexplained: "Unexplained Infertility",
  premature_ovarian_failure: "Premature Ovarian Failure",
  azoospermia: "Azoospermia (no sperm)", oligospermia: "Oligospermia (low count)",
  asthenospermia: "Asthenospermia (low motility)", teratospermia: "Teratospermia (abnormal morphology)",
};

// ─── Preset templates ────────────────────────────────────────────────────────

const PRESET_TEMPLATES: { id: string; label: string; emoji: string; description: string; fieldIds: string[] }[] = [
  {
    id: "basic_lead",
    label: "Basic Lead",
    emoji: "📋",
    description: "Name, phone, email, gender, language, medical interest",
    fieldIds: ["l_firstName", "l_lastName", "l_phone", "l_email", "l_gender", "l_country", "l_preferredLanguages", "l_mainMedicalInterest", "l_decisionTimeline"],
  },
  {
    id: "ivf_female",
    label: "IVF — Female",
    emoji: "🌸",
    description: "Full female medical intake + lead info for IVF campaigns",
    fieldIds: [
      "l_firstName", "l_lastName", "l_phone", "l_email", "l_gender", "l_country", "l_preferredLanguages",
      "l_mainMedicalInterest", "l_ivfExperience", "l_fertilityDiagnosis", "l_decisionTimeline", "l_travelReadiness",
      "f_infertility_type", "f_duration", "f_marriage_date", "f_civil_marriage",
      "f_cycle_regularity", "f_lmp", "f_cycle_length",
      "f_gravida", "f_para", "f_miscarriages",
      "f_previous_ivf", "f_ivf_details",
      "f_systemic", "f_medications", "f_allergies",
      "f_smoking", "f_alcohol",
      "f_consanguinity", "f_hereditary_diseases",
      "f_additional_notes", "f_expected_visit_date",
    ],
  },
  {
    id: "pgt_full",
    label: "PGT / Genetic Testing",
    emoji: "🧬",
    description: "IVF + genetic history + consanguinity for PGT cases",
    fieldIds: [
      "l_firstName", "l_lastName", "l_phone", "l_email", "l_gender", "l_country", "l_preferredLanguages",
      "l_mainMedicalInterest", "l_ivfExperience", "l_fertilityDiagnosis", "l_decisionTimeline",
      "f_infertility_type", "f_duration", "f_marriage_date", "f_civil_marriage",
      "f_cycle_regularity", "f_lmp",
      "f_gravida", "f_para", "f_miscarriages",
      "f_previous_ivf", "f_ivf_details",
      "f_systemic", "f_medications",
      "f_consanguinity", "f_hereditary_diseases", "f_family_infertility",
      "m_semen", "m_semen_result", "m_genetic_tests",
      "f_additional_notes",
    ],
  },
  {
    id: "male_factor",
    label: "Male Factor",
    emoji: "♂️",
    description: "Male medical intake + semen analysis + lifestyle",
    fieldIds: [
      "l_firstName", "l_lastName", "l_phone", "l_email", "l_gender", "l_country", "l_preferredLanguages",
      "l_mainMedicalInterest", "l_maleFertilityDiagnosis", "l_decisionTimeline",
      "m_height_weight", "m_smoking", "m_alcohol",
      "m_semen", "m_semen_result",
      "m_systemic", "m_medications", "m_surgical_history",
      "m_family_history", "m_genetic_tests",
      "m_additional_notes",
    ],
  },
  {
    id: "egg_freezing",
    label: "Egg Freezing",
    emoji: "❄️",
    description: "Female fertility + ovarian reserve focus",
    fieldIds: [
      "l_firstName", "l_lastName", "l_phone", "l_email", "l_gender", "l_country", "l_preferredLanguages",
      "l_mainMedicalInterest", "l_decisionTimeline", "l_travelReadiness",
      "f_infertility_type", "f_duration", "f_marriage_date",
      "f_cycle_regularity", "f_lmp", "f_cycle_length",
      "f_gravida", "f_miscarriages",
      "f_systemic", "f_medications",
      "f_smoking", "f_alcohol",
      "f_family_early_menopause",
      "f_additional_notes", "f_expected_visit_date",
    ],
  },
  {
    id: "international_full",
    label: "International Patient (Full)",
    emoji: "✈️",
    description: "Complete form for international patients including logistics",
    fieldIds: [
      "l_firstName", "l_lastName", "l_phone", "l_email", "l_gender", "l_dateOfBirth", "l_nationality",
      "l_country", "l_city", "l_preferredLanguages", "l_preferredContactMethods",
      "l_mainMedicalInterest", "l_ivfExperience", "l_fertilityDiagnosis", "l_decisionTimeline", "l_travelReadiness", "l_budgetRange",
      "l_accommodationHotel", "l_accommodationLocation", "l_transportationAirportPickup", "l_transportationLocalTransfer",
      "f_infertility_type", "f_duration", "f_marriage_date", "f_civil_marriage",
      "f_cycle_regularity", "f_lmp",
      "f_gravida", "f_para", "f_miscarriages",
      "f_previous_ivf", "f_ivf_details",
      "f_systemic", "f_medications", "f_allergies",
      "f_smoking", "f_consanguinity",
      "m_semen", "m_semen_result",
      "f_additional_notes", "f_expected_visit_date",
    ],
  },
];

// ─── Step organizer types ─────────────────────────────────────────────────────

interface DecisionButton {
  label: string;
  labelAr?: string;
  labelTr?: string;
  action: "next_step" | "whatsapp" | "schedule_call" | "complete_section" | "schedule_call_inapp";
  sectionStepIds?: string[];
  target?: string;
  icon?: "continue" | "whatsapp" | "phone" | "calendar";
}

interface WizardStep {
  id: string;
  type: "fields" | "decision";
  // For type="fields"
  title?: string;
  titleAr?: string;
  titleTr?: string;
  subtitle?: string;
  subtitleAr?: string;
  subtitleTr?: string;
  fieldIds: string[];
  /** fieldConditions: map of fieldId → { fieldId: string; values: string[] }
   * If a field has a condition, it is only shown when the referenced field has one of the listed values. */
  fieldConditions?: Record<string, { fieldId: string; values: string[] }>;
  // For type="decision"
  decisionTitle?: string;
  decisionTitleAr?: string;
  decisionTitleTr?: string;
  decisionSubtitle?: string;
  decisionSubtitleAr?: string;
  decisionSubtitleTr?: string;
  buttons?: DecisionButton[];
}

// ─── ConditionEditor ─────────────────────────────────────────────────────────
// A small inline UI to add a showIf condition to a field in a step.
// Shows a compact "+ Add condition" button that expands to a 2-field form.
function ConditionEditor({
  catalog,
  onAdd,
}: {
  catalog: { id: string; labelEn: string; options?: string[] }[];
  onAdd: (cond: { fieldId: string; values: string[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [condFieldId, setCondFieldId] = useState("");
  const [condValues, setCondValues] = useState("");

  // Only show fields that have options (select/yesno/multicheck) as condition sources
  const conditionableFields = catalog.filter((f) => f.options && f.options.length > 0);
  const selectedField = conditionableFields.find((f) => f.id === condFieldId);

  if (!open) {
    return (
      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-amber-600 transition-colors"
        onClick={() => setOpen(true)}
      >
        + Add condition
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap bg-amber-50 border border-amber-200 rounded p-1.5">
      <span className="text-xs text-amber-700 font-medium">Show if</span>
      <select
        value={condFieldId}
        onChange={(e) => { setCondFieldId(e.target.value); setCondValues(""); }}
        className="text-xs border border-amber-300 rounded px-1.5 py-0.5 bg-white"
      >
        <option value="">— field —</option>
        {conditionableFields.map((f) => (
          <option key={f.id} value={f.id}>{f.labelEn}</option>
        ))}
      </select>
      <span className="text-xs text-amber-700">=</span>
      {selectedField ? (
        <select
          value={condValues}
          onChange={(e) => setCondValues(e.target.value)}
          className="text-xs border border-amber-300 rounded px-1.5 py-0.5 bg-white"
        >
          <option value="">— value —</option>
          {(selectedField.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={condValues}
          onChange={(e) => setCondValues(e.target.value)}
          placeholder="value"
          className="text-xs border border-amber-300 rounded px-1.5 py-0.5 bg-white w-20"
        />
      )}
      <button
        type="button"
        className="text-xs bg-amber-600 text-white rounded px-2 py-0.5 hover:bg-amber-700 disabled:opacity-40"
        disabled={!condFieldId || !condValues}
        onClick={() => {
          onAdd({ fieldId: condFieldId, values: condValues.split(",").map((v) => v.trim()).filter(Boolean) });
          setOpen(false);
          setCondFieldId("");
          setCondValues("");
        }}
      >
        Add
      </button>
      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-destructive"
        onClick={() => { setOpen(false); setCondFieldId(""); setCondValues(""); }}
      >
        Cancel
      </button>
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function IntakeFormBuilderPage() {
  const { data: forms, refetch } = trpc.intakeForms.list.useQuery();
  const deleteMutation = trpc.intakeForms.delete.useMutation();
  const [editingForm, setEditingForm] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function handleDelete(id: number) {
    if (!confirm("Delete this form?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Form deleted");
      refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete form");
    }
  }

  const intakeBase = window.location.origin + "/intake";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Intake Form Builder</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create custom multilingual intake forms for advertising campaigns. Each form gets a unique URL.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 shrink-0 mt-1">
          <Plus className="h-4 w-4" /> New Form
        </Button>
      </div>

      {/* Forms list */}
      <div className="space-y-3">
        {!forms ? (
          <div className="text-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Loading forms...
          </div>
        ) : forms.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-xl text-muted-foreground">
            <Globe className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No forms yet</p>
            <p className="text-sm mt-1">Create your first form to get a shareable intake link.</p>
          </div>
        ) : (
          forms.map((form) => {
            const intakeUrl = `${intakeBase}?form=${form.slug}`;
            const fields = (form.fields as string[]) ?? [];
            const hasTranslations = Object.keys((form.translations as any) ?? {}).length > 0;
            return (
              <div key={form.id} className="border rounded-xl p-4 space-y-3 bg-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{form.name}</h3>
                      {form.isDefault && (
                        <Badge className="bg-green-100 text-green-700 text-xs">Default</Badge>
                      )}
                      <Badge variant="outline" className="text-xs">{form.brand}</Badge>
                      <Badge variant="secondary" className="text-xs">{fields.length} fields</Badge>
                      {hasTranslations && (
                        <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700">Translated</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Slug: <code className="bg-muted px-1 rounded">{form.slug}</code></p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setEditingForm(form)}>
                      <span className="sr-only">Edit</span>✏️
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => handleDelete(form.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {/* Shareable link */}
                <div className="flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-2">
                  <code className="text-xs flex-1 truncate text-muted-foreground">{intakeUrl}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={() => { navigator.clipboard.writeText(intakeUrl); toast.success("Link copied!"); }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={() => window.open(intakeUrl, "_blank")}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create / Edit dialog */}
      {(showCreate || editingForm) && (
        <FormEditorDialog
          form={editingForm}
          onClose={() => { setShowCreate(false); setEditingForm(null); }}
          onSaved={() => { setShowCreate(false); setEditingForm(null); refetch(); }}
        />
      )}
    </div>
  );
}

// ─── Form editor dialog ───────────────────────────────────────────────────────

function FormEditorDialog({
  form,
  onClose,
  onSaved,
}: {
  form: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: catalog } = trpc.intakeForms.getFieldCatalog.useQuery();

  // Basic form state
  const [name, setName] = useState(form?.name ?? "");
  const [slug, setSlug] = useState(form?.slug ?? "");
  const [brand, setBrand] = useState(form?.brand ?? "fertiliv");
  const [isDefault, setIsDefault] = useState(form?.isDefault ?? false);

  // Selected fields
  const [selectedFields, setSelectedFields] = useState<Set<string>>(
    new Set((form?.fields as string[]) ?? [])
  );

  // Translations
  const [translations, setTranslations] = useState<Record<string, Record<string, string>>>(
    (form?.translations as any) ?? {}
  );
  const [titleTranslations, setTitleTranslations] = useState<Record<string, string>>(
    (form?.titleTranslations as any) ?? { en: "", ar: "", tr: "" }
  );
  const [subtitleTranslations, setSubtitleTranslations] = useState<Record<string, string>>(
    (form?.subtitleTranslations as any) ?? { en: "", ar: "", tr: "" }
  );

  // Target languages for translation
  const [targetLangs, setTargetLangs] = useState<Set<"ar" | "tr">>(new Set<"ar" | "tr">(["ar", "tr"]));

  // Per-field config (e.g. enabledSubFields for repeatable fields)
  const [fieldConfig, setFieldConfig] = useState<Record<string, { enabledSubFields?: string[] }>>(
    (form as any)?.fieldConfig ?? {}
  );

  // Step organizer
  const [steps, setSteps] = useState<WizardStep[]>(() => {
    if (form?.stepsMeta && Array.isArray(form.stepsMeta) && form.stepsMeta.length > 0) {
      // Normalize steps loaded from DB:
      // 1. Ensure fieldIds is always an array (decision steps may omit it)
      // 2. Map decision steps that use title/subtitle → decisionTitle/decisionSubtitle
      return (form.stepsMeta as any[]).map((s) => {
        const normalized: WizardStep = {
          ...s,
          fieldIds: Array.isArray(s.fieldIds) ? s.fieldIds : [],
        };
        if (s.type === "decision") {
          // If stored with title/subtitle keys (DynamicIntakeWizard format), remap them
          if (!normalized.decisionTitle && s.title) normalized.decisionTitle = s.title;
          if (!normalized.decisionTitleAr && s.titleAr) normalized.decisionTitleAr = s.titleAr;
          if (!normalized.decisionTitleTr && s.titleTr) normalized.decisionTitleTr = s.titleTr;
          if (!normalized.decisionSubtitle && s.subtitle) normalized.decisionSubtitle = s.subtitle;
          if (!normalized.decisionSubtitleAr && s.subtitleAr) normalized.decisionSubtitleAr = s.subtitleAr;
          if (!normalized.decisionSubtitleTr && s.subtitleTr) normalized.decisionSubtitleTr = s.subtitleTr;
          // Ensure buttons is always an array
          if (!Array.isArray(normalized.buttons)) normalized.buttons = [];
        }
        return normalized;
      });
    }
    return [{ id: "step_1", type: "fields", title: "Step 1", fieldIds: [] }];
  });

  // Search
  const [fieldSearch, setFieldSearch] = useState("");

  // UI state
  const [activeTab, setActiveTab] = useState<"fields" | "translations" | "steps">("fields");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(["personal_info", "contact_info", "lead_info", "logistics", "fertility_female", "fertility_male"])
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [translationsReady, setTranslationsReady] = useState(
    Object.keys((form?.translations as any) ?? {}).length > 0
  );

  // Auto-generate slug from name
  useEffect(() => {
    if (!form && name && !slug) {
      setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    }
  }, [name, form, slug]);

  const createMutation = trpc.intakeForms.create.useMutation();
  const updateMutation = trpc.intakeForms.update.useMutation();
  const generateTranslationsMutation = trpc.intakeForms.generateTranslations.useMutation();

  // Group fields by category (with search filter applied)
  type CatalogField = NonNullable<typeof catalog>[number];
  const fieldsByCategory = useMemo(() => {
    if (!catalog) return {} as Record<string, CatalogField[]>;
    const grouped: Record<string, CatalogField[]> = {};
    const search = fieldSearch.toLowerCase().trim();
    for (const f of catalog) {
      // Apply search filter
      if (search) {
        const matches =
          f.labelEn.toLowerCase().includes(search) ||
          f.id.toLowerCase().includes(search) ||
          (f.section ?? "").toLowerCase().includes(search) ||
          (f.dbField ?? "").toLowerCase().includes(search);
        if (!matches) continue;
      }
      if (!grouped[f.category]) grouped[f.category] = [];
      grouped[f.category].push(f);
    }
    return grouped;
  }, [catalog, fieldSearch]);

  // Category order
  const categoryOrder: FieldCategory[] = [
    "personal_info",
    "contact_info",
    "partner_info",
    "lead_info",
    "logistics",
    "fertility_female",
    "fertility_male",
  ];

  function toggleField(fieldId: string) {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) {
        next.delete(fieldId);
      } else {
        next.add(fieldId);
        // Auto-include parent field if this field has a showIf dependency
        const field = catalog?.find((f) => f.id === fieldId);
        if (field && (field as any).showIf?.fieldId) {
          const parentId = (field as any).showIf.fieldId as string;
          if (!next.has(parentId)) {
            next.add(parentId);
          }
        }
      }
      return next;
    });
  }

  function toggleCategory(category: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function selectAllInCategory(category: string) {
    const fields = fieldsByCategory[category] ?? [];
    setSelectedFields((prev) => {
      const next = new Set(prev);
      fields.forEach((f) => next.add(f.id));
      return next;
    });
  }

  function deselectAllInCategory(category: string) {
    const fields = fieldsByCategory[category] ?? [];
    setSelectedFields((prev) => {
      const next = new Set(prev);
      fields.forEach((f) => next.delete(f.id));
      return next;
    });
  }

  async function handleGenerateTranslations() {
    if (selectedFields.size === 0) {
      toast.error("Select at least one field first");
      return;
    }
    if (targetLangs.size === 0) {
      toast.error("Select at least one target language (AR or TR)");
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generateTranslationsMutation.mutateAsync({
        fieldIds: Array.from(selectedFields),
        targetLanguages: Array.from(targetLangs) as ("ar" | "tr")[],
        formName: name || undefined,
        brand: brand || undefined,
        steps: steps.map((s) => ({
          id: s.id,
          type: s.type,
          title: s.title || undefined,
          subtitle: s.subtitle || undefined,
          decisionTitle: s.decisionTitle || undefined,
          decisionSubtitle: s.decisionSubtitle || undefined,
          buttons: s.buttons?.map((b) => ({ label: b.label, action: b.action })),
        })).filter((s) => s.title || s.subtitle || s.decisionTitle || s.decisionSubtitle || (s.buttons && s.buttons.length > 0)),
      });
      setTranslations(result.translations);
      if (result.titleTranslations && Object.keys(result.titleTranslations).length > 0) {
        setTitleTranslations(result.titleTranslations);
      }
      if (result.subtitleTranslations && Object.keys(result.subtitleTranslations).length > 0) {
        setSubtitleTranslations(result.subtitleTranslations);
      }
      // Apply step title/subtitle/decision translations
      if (result.stepTranslations && Object.keys(result.stepTranslations).length > 0) {
        setSteps((prev) => prev.map((s) => {
          const st = (result.stepTranslations as any)[s.id];
          if (!st) return s;
          // For fields-type steps
          if (s.type === "fields") {
            return {
              ...s,
              titleAr: st.title?.ar ?? s.titleAr,
              titleTr: st.title?.tr ?? s.titleTr,
              subtitleAr: st.subtitle?.ar ?? s.subtitleAr,
              subtitleTr: st.subtitle?.tr ?? s.subtitleTr,
            };
          }
          // For decision-type steps
          if (s.type === "decision") {
            const updatedButtons = s.buttons?.map((btn) => {
              const btnTrans = st.buttons?.[btn.label];
              if (!btnTrans) return btn;
              return {
                ...btn,
                labelAr: btnTrans.ar ?? btn.labelAr,
                labelTr: btnTrans.tr ?? btn.labelTr,
              };
            });
            return {
              ...s,
              decisionTitleAr: st.decisionTitle?.ar ?? s.decisionTitleAr,
              decisionTitleTr: st.decisionTitle?.tr ?? s.decisionTitleTr,
              decisionSubtitleAr: st.decisionSubtitle?.ar ?? s.decisionSubtitleAr,
              decisionSubtitleTr: st.decisionSubtitle?.tr ?? s.decisionSubtitleTr,
              buttons: updatedButtons ?? s.buttons,
            };
          }
          return s;
        }));
      }
      setTranslationsReady(true);
      setActiveTab("translations");
      const fieldCount = Array.from(selectedFields).length;
      const langList = Array.from(targetLangs).map((l) => l.toUpperCase()).join(" + ");
      toast.success(`Translated ${fieldCount} fields into ${langList}!`);
    } catch (e: any) {
      toast.error(e.message ?? "Translation generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) { toast.error("Form name is required"); return; }
    if (!slug.trim()) { toast.error("Slug is required"); return; }
    if (!/^[a-z0-9-]+$/.test(slug)) { toast.error("Slug must be lowercase letters, numbers, and hyphens only"); return; }
    if (selectedFields.size === 0) { toast.error("Select at least one field"); return; }

    setIsSaving(true);
    try {
      const payload = {
        name: name.trim(),
        slug: slug.trim(),
        brand: brand as any,
        isDefault,
        fields: Array.from(selectedFields),
        translations,
        titleTranslations: Object.values(titleTranslations).some(Boolean) ? titleTranslations : null,
        subtitleTranslations: Object.values(subtitleTranslations).some(Boolean) ? subtitleTranslations : null,
        stepsMeta: (() => {
        if (steps.length === 0) return null;
        const allFieldIds = Array.from(selectedFields);
        // If there's only one step and it has no fieldIds, auto-assign all fields to it
        const hasAnyFieldIds = steps.some((s) => s.type === "decision" || (s.fieldIds && s.fieldIds.length > 0));
        if (!hasAnyFieldIds && steps.length === 1 && steps[0].type === "fields") {
          return [{ ...steps[0], fieldIds: allFieldIds }];
        }
        // Auto-assign unassigned fields to the first fields-type step
        const assignedIds = new Set(steps.flatMap((s) => s.type === "fields" ? (s.fieldIds ?? []) : []));
        const unassigned = allFieldIds.filter((id) => !assignedIds.has(id));
        if (unassigned.length > 0) {
          const firstFieldsStep = steps.findIndex((s) => s.type === "fields");
          if (firstFieldsStep >= 0) {
            const updated = [...steps];
            updated[firstFieldsStep] = { ...updated[firstFieldsStep], fieldIds: [...(updated[firstFieldsStep].fieldIds ?? []), ...unassigned] };
            return updated;
          }
        }
        return steps;
      })(),
        fieldConfig: Object.keys(fieldConfig).length > 0 ? fieldConfig : null,
      };
      if (form) {
        await updateMutation.mutateAsync({ id: form.id, ...payload });
        toast.success("Form updated successfully");
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("Form created successfully");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save form");
    } finally {
      setIsSaving(false);
    }
  }

  // ── Step organizer helpers ──
  function addStep() {
    const id = `step_${steps.length + 1}_${Date.now()}`;
    setSteps((prev) => [...prev, { id, type: "fields", title: `Step ${prev.length + 1}`, fieldIds: [] }]);
  }

  function addDecisionStep() {
    const id = `decision_${steps.length + 1}_${Date.now()}`;
    setSteps((prev) => [...prev, {
      id,
      type: "decision",
      fieldIds: [],
      decisionTitle: "How would you like to proceed?",
      decisionSubtitle: "Choose the option that best suits you.",
      buttons: [
        { label: "Continue filling the form", icon: "continue", action: "next_step" },
        { label: "Contact us on WhatsApp", icon: "whatsapp", action: "whatsapp", target: "+905000000000" },
      ],
    }]);
  }

  function updateStep(stepId: string, updates: Partial<WizardStep>) {
    setSteps((prev) => prev.map((s) => s.id === stepId ? { ...s, ...updates } : s));
  }

  function updateDecisionButton(stepId: string, btnIdx: number, updates: Partial<DecisionButton>) {
    setSteps((prev) => prev.map((s) => {
      if (s.id !== stepId) return s;
      const buttons = [...(s.buttons ?? [])];
      buttons[btnIdx] = { ...buttons[btnIdx], ...updates };
      return { ...s, buttons };
    }));
  }

  function addDecisionButton(stepId: string) {
    setSteps((prev) => prev.map((s) => {
      if (s.id !== stepId) return s;
      return { ...s, buttons: [...(s.buttons ?? []), { label: "New option", action: "next_step" as const }] };
    }));
  }

  function removeDecisionButton(stepId: string, btnIdx: number) {
    setSteps((prev) => prev.map((s) => {
      if (s.id !== stepId) return s;
      return { ...s, buttons: (s.buttons ?? []).filter((_, i) => i !== btnIdx) };
    }));
  }

  function removeStep(stepId: string) {
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
  }

  function toggleFieldInStep(stepId: string, fieldId: string) {
    setSteps((prev) => prev.map((s) => {
      if (s.id !== stepId) return s;
      const fIds = s.fieldIds ?? [];
      const has = fIds.includes(fieldId);
      return { ...s, fieldIds: has ? fIds.filter((f) => f !== fieldId) : [...fIds, fieldId] };
    }));
  }

  function setFieldCondition(stepId: string, fieldId: string, condition: { fieldId: string; values: string[] } | null) {
    setSteps((prev) => prev.map((s) => {
      if (s.id !== stepId) return s;
      const conditions = { ...(s.fieldConditions ?? {}) };
      if (condition === null) {
        delete conditions[fieldId];
      } else {
        conditions[fieldId] = condition;
      }
      return { ...s, fieldConditions: conditions };
    }));
  }

  function moveStep(stepId: string, dir: "up" | "down") {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === stepId);
      if (idx < 0) return prev;
      const next = [...prev];
      const target = dir === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  const selectedFieldIds = Array.from(selectedFields);

  // Count selected per category (using full catalog, not filtered)
  const selectedPerCategory = useMemo(() => {
    if (!catalog) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    for (const f of catalog) {
      if (selectedFields.has(f.id)) {
        counts[f.category] = (counts[f.category] ?? 0) + 1;
      }
    }
    return counts;
  }, [catalog, selectedFields]);

  const totalPerCategory = useMemo(() => {
    if (!catalog) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    for (const f of catalog) {
      counts[f.category] = (counts[f.category] ?? 0) + 1;
    }
    return counts;
  }, [catalog]);

  return (
    <Dialog open onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[90dvh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="pr-8 px-6 pt-6 pb-0">
          <DialogTitle>{form ? "Edit Form" : "Create New Form"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 px-6 py-4">
          {/* Basic info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="form-name">Form Name *</Label>
              <Input
                id="form-name"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                placeholder="e.g. Fertiliv Arabic Campaign Form"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="form-slug">Slug * <span className="text-xs text-muted-foreground">(URL identifier)</span></Label>
              <Input
                id="form-slug"
                value={slug}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="e.g. fertiliv-ar-2024"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <div className="space-y-1.5">
              <Label>Brand</Label>
              <select
                value={brand}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBrand(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="fertiliv">Fertiliv IVF Center</option>
                <option value="safemedigo">Safemedigo</option>
                <option value="dr-nilay-karaca">Dr. Nilay Karaca</option>
              </select>
            </div>
            <div className="flex items-center gap-3 pt-5">
              <Switch id="is-default" checked={isDefault} onCheckedChange={setIsDefault} />
              <Label htmlFor="is-default" className="cursor-pointer text-sm">
                Set as default form for this brand
              </Label>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as any)}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <TabsList>
                <TabsTrigger value="fields">
                  Fields
                  <Badge variant="secondary" className="ml-1.5 text-xs">{selectedFields.size}</Badge>
                </TabsTrigger>
                <TabsTrigger value="steps">
                  Steps
                  <Badge variant="secondary" className="ml-1.5 text-xs">{steps.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="translations" disabled={steps.length === 0}>
                  Translations
                  {translationsReady && (
                    <Badge variant="secondary" className="ml-1.5 text-xs bg-green-100 text-green-700">Ready</Badge>
                  )}
                  {steps.length === 0 && (
                    <span className="ml-1.5 text-xs text-muted-foreground">(build steps first)</span>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Language selector + Generate button — only visible on Translations tab */}
              {activeTab === "translations" && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Translate to:</span>
                  {(["ar", "tr"] as const).map((lang) => (
                    <label key={lang} className="flex items-center gap-1.5 cursor-pointer">
                      <Checkbox
                        checked={targetLangs.has(lang)}
                        onCheckedChange={(checked: boolean) => {
                          setTargetLangs((prev) => {
                            const next = new Set<"ar" | "tr">(prev);
                            if (checked) next.add(lang);
                            else next.delete(lang);
                            return next;
                          });
                        }}
                      />
                      <span className="text-xs font-medium">{lang === "ar" ? "🇸🇦 Arabic" : "🇹🇷 Turkish"}</span>
                    </label>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs"
                    onClick={handleGenerateTranslations}
                    disabled={isGenerating || selectedFields.size === 0 || targetLangs.size === 0}
                  >
                    {isGenerating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5" />
                    )}
                    {isGenerating ? "Generating..." : "Generate AI Translations"}
                  </Button>
                </div>
              )}
            </div>

            {/* ── Fields Tab ── */}
            <TabsContent value="fields" className="mt-3 space-y-2">
              {/* Preset templates */}
              <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick Start Templates</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => {
                        setSelectedFields(new Set(tpl.fieldIds));
                        toast.success(`Template "${tpl.label}" applied — ${tpl.fieldIds.length} fields selected`);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border bg-background hover:bg-muted transition-colors text-left"
                      title={tpl.description}
                    >
                      <span className="text-base">{tpl.emoji}</span>
                      <div>
                        <p className="text-xs font-medium">{tpl.label}</p>
                        <p className="text-xs text-muted-foreground">{tpl.fieldIds.length} fields</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Source legend */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="font-medium">Source:</span>
                <span className="inline-flex items-center gap-1">
                  <span className="px-1.5 py-0.5 rounded text-xs bg-violet-100 text-violet-700">leads</span>
                  Lead / contact info
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="px-1.5 py-0.5 rounded text-xs bg-teal-100 text-teal-700">medical</span>
                  Medical record
                </span>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  placeholder="Search fields..."
                  className="pl-8 h-8 text-sm"
                />
                {fieldSearch && (
                  <button
                    type="button"
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                    onClick={() => setFieldSearch("")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Category groups */}
              {categoryOrder.map((category) => {
                const fields = fieldsByCategory[category];
                if (!fields || fields.length === 0) return null;
                const isExpanded = expandedCategories.has(category);
                const selectedInCat = selectedPerCategory[category] ?? 0;
                const totalInCat = totalPerCategory[category] ?? 0;
                return (
                  <div key={category} className="border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/50 hover:bg-muted transition-colors text-left"
                      onClick={() => toggleCategory(category)}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <span className="text-base">{CATEGORY_ICONS[category]}</span>
                        <span className="font-medium text-sm">
                          {CATEGORY_LABELS[category]}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {selectedInCat}/{totalInCat}
                        </Badge>
                      </div>
                      <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => selectAllInCategory(category)}>All</Button>
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => deselectAllInCategory(category)}>None</Button>
                      </div>
                    </button>
                    {isExpanded && (() => {
                        // Build parent-child tree: fields with showIf pointing to a sibling are children
                        const fieldIds = new Set(fields.map((f) => f.id));
                        const childrenOf: Record<string, CatalogField[]> = {};
                        const topLevel: CatalogField[] = [];
                        for (const f of fields) {
                          const parentId = (f as any).showIf?.fieldId;
                          if (parentId && fieldIds.has(parentId)) {
                            if (!childrenOf[parentId]) childrenOf[parentId] = [];
                            childrenOf[parentId].push(f);
                          } else {
                            topLevel.push(f);
                          }
                        }

                        const renderField = (field: CatalogField, isChild = false) => (
                          <div key={field.id} className={isChild ? "col-span-full ml-6 pl-3 border-l-2 border-primary/20" : ""}>
                            <label className={`flex items-start gap-2.5 cursor-pointer group ${isChild && !selectedFields.has((field as any).showIf?.fieldId) ? "opacity-40 pointer-events-none" : ""}`}>
                              <Checkbox
                                checked={selectedFields.has(field.id)}
                                onCheckedChange={() => toggleField(field.id)}
                                className="mt-0.5"
                                disabled={isChild && !selectedFields.has((field as any).showIf?.fieldId)}
                              />
                              <div className="flex-1 min-w-0">
                                {isChild && (
                                  <p className="text-xs text-primary/60 mb-0.5">↳ shown if above = Yes</p>
                                )}
                                <span className="text-sm font-medium group-hover:text-primary transition-colors">
                                  {field.labelEn}
                                </span>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <Badge variant="outline" className="text-xs h-4 px-1">{field.type}</Badge>
                                  {field.required && (
                                    <Badge variant="destructive" className="text-xs h-4 px-1">required</Badge>
                                  )}
                                  {field.gender && (
                                    <Badge variant="secondary" className="text-xs h-4 px-1">{field.gender}</Badge>
                                  )}
                                  {(field as any).source && (
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${SOURCE_COLORS[(field as any).source] ?? "bg-gray-100 text-gray-600"}`}>
                                      {(field as any).source === "medical_intake" ? "medical" : "leads"}
                                    </span>
                                  )}
                                  {field.section && (
                                    <span className="text-xs text-muted-foreground">{field.section}</span>
                                  )}
                                </div>
                                {field.options && field.options.length > 0 && (
                                  <p className="text-xs text-muted-foreground mt-0.5 break-words">
                                    Options: {field.options.slice(0, 4).map((o) => OPTION_DISPLAY[o] ?? o).join(", ")}{field.options.length > 4 ? ` +${field.options.length - 4} more` : ""}
                                  </p>
                                )}
                                {/* Sub-field selector for repeatable fields */}
                                {field.type === "repeatable" && (field as any).repeatableFields && selectedFields.has(field.id) && (
                                  <div className="mt-2 pl-1 border-l-2 border-primary/20 space-y-1" onClick={(e) => e.stopPropagation()}>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Sub-fields to show:</p>
                                    {((field as any).repeatableFields as Array<{id: string; labelEn: string; required?: boolean}>).map((sf) => {
                                      const enabledSubFields = fieldConfig[field.id]?.enabledSubFields;
                                      const isEnabled = !enabledSubFields || enabledSubFields.includes(sf.id);
                                      return (
                                        <label key={sf.id} className="flex items-center gap-1.5 cursor-pointer">
                                          <Checkbox
                                            checked={isEnabled}
                                            onCheckedChange={(checked) => {
                                              setFieldConfig((prev) => {
                                                const allIds = ((field as any).repeatableFields as Array<{id: string}>).map((s) => s.id);
                                                const current = prev[field.id]?.enabledSubFields ?? allIds;
                                                const updated = checked
                                                  ? Array.from(new Set([...current, sf.id]))
                                                  : current.filter((id) => id !== sf.id);
                                                const isAllEnabled = allIds.every((id) => updated.includes(id));
                                                if (isAllEnabled) {
                                                  const { [field.id]: _, ...rest } = prev;
                                                  return rest;
                                                }
                                                return { ...prev, [field.id]: { enabledSubFields: updated } };
                                              });
                                            }}
                                            className="h-3 w-3"
                                          />
                                          <span className="text-xs text-muted-foreground">{sf.labelEn}{sf.required ? " *" : ""}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </label>
                            {/* Render children nested below parent */}
                            {childrenOf[field.id]?.map((child) => renderField(child, true))}
                          </div>
                        );

                        return (
                          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {topLevel.map((field) => renderField(field, false))}
                          </div>
                        );
                      })()}
                  </div>
                );
              })}

              {/* Empty search result */}
              {fieldSearch && Object.keys(fieldsByCategory).length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No fields match "{fieldSearch}"
                </div>
              )}
            </TabsContent>

            {/* ── Translations Tab ── */}
            <TabsContent value="translations" className="mt-3 space-y-4">
              {!translationsReady ? (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Globe className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium text-sm">No translations yet</p>
                  <p className="text-xs mt-1 mb-4">
                    Select fields, choose target languages (AR/TR), then click "Generate AI Translations".
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleGenerateTranslations}
                    disabled={isGenerating || selectedFields.size === 0 || targetLangs.size === 0}
                  >
                    {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                    {isGenerating ? "Generating..." : "Generate AI Translations"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Form Title & Subtitle */}
                  <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
                    <h4 className="font-semibold text-sm">Form Title & Subtitle (shown to patients)</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {LANGS.map((lang) => (
                        <div key={lang.code} className="space-y-1.5">
                          <Label className="text-xs font-semibold">{lang.label}</Label>
                          <Input
                            value={titleTranslations[lang.code] ?? ""}
                            onChange={(e) => setTitleTranslations((prev) => ({ ...prev, [lang.code]: e.target.value }))}
                            placeholder={`Title in ${lang.label}`}
                            dir={lang.dir}
                            className="text-sm"
                          />
                          <Textarea
                            value={subtitleTranslations[lang.code] ?? ""}
                            onChange={(e) => setSubtitleTranslations((prev) => ({ ...prev, [lang.code]: e.target.value }))}
                            placeholder={`Subtitle in ${lang.label}`}
                            dir={lang.dir}
                            rows={2}
                            className="text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Field translations */}
                  {selectedFieldIds.filter((id) => catalog?.some((f) => f.id === id)).map((fieldId) => {
                    const fieldTrans = translations[fieldId];
                    const catalogField = catalog?.find((f) => f.id === fieldId);
                    if (!catalogField) return null;
                    return (
                      <div key={fieldId} className="border rounded-lg p-3 space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium text-sm">{catalogField.labelEn}</h4>
                          <Badge variant="outline" className="text-xs">{catalogField.type}</Badge>
                          {catalogField.gender && (
                            <Badge variant="secondary" className="text-xs">{catalogField.gender}</Badge>
                          )}
                          {(catalogField as any).source && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${SOURCE_COLORS[(catalogField as any).source] ?? ""}`}>
                              {(catalogField as any).source === "medical_intake" ? "medical" : "leads"}
                            </span>
                          )}
                        </div>

                        {/* Label translations */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {LANGS.map((lang) => (
                            <div key={lang.code} className="space-y-1">
                              <Label className="text-xs text-muted-foreground">{lang.label} — Label</Label>
                              <Input
                                value={fieldTrans?.[lang.code] ?? ""}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setTranslations((prev) => ({
                                    ...prev,
                                    [fieldId]: { ...(prev[fieldId] ?? {}), [lang.code]: e.target.value },
                                  }))
                                }
                                dir={lang.dir}
                                className="text-sm"
                                placeholder={lang.code === "en" ? catalogField.labelEn : `${lang.label} translation`}
                              />
                            </div>
                          ))}
                        </div>

                        {/* Option translations */}
                        {catalogField.options && catalogField.options.length > 0 && (
                          <div className="space-y-2 pl-3 border-l-2 border-muted">
                            <p className="text-xs font-medium text-muted-foreground">Options</p>
                            {catalogField.options.map((optValue) => {
                              const optKey = `${fieldId}__opt__${optValue}`;
                              const optTrans = translations[optKey];
                              const displayLabel = OPTION_DISPLAY[optValue] ?? optValue;
                              return (
                                <div key={optKey} className="space-y-1.5">
                                  <p className="text-xs text-muted-foreground italic">"{displayLabel}"</p>
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {LANGS.map((lang) => (
                                      <div key={lang.code} className="space-y-0.5">
                                        <Label className="text-xs text-muted-foreground">{lang.label}</Label>
                                        <Input
                                          value={optTrans?.[lang.code] ?? ""}
                                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                            setTranslations((prev) => ({
                                              ...prev,
                                              [optKey]: { ...(prev[optKey] ?? {}), [lang.code]: e.target.value },
                                            }))
                                          }
                                          dir={lang.dir}
                                          className="text-xs h-7"
                                          placeholder={lang.code === "en" ? displayLabel : `${lang.label}`}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ── Steps Tab ── */}
            <TabsContent value="steps" className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                Organize selected fields into wizard steps. Add <strong>Decision Steps</strong> to show branching options (e.g. WhatsApp, continue form).
              </p>
              {steps.map((step, idx) => (
                <div key={step.id} className={`border rounded-lg overflow-hidden ${step.type === "decision" ? "border-amber-300 bg-amber-50/30" : ""}`}>
                  {/* Step header */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/50">
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                    {step.type === "decision" ? (
                      <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded shrink-0">Decision</span>
                    ) : (
                      <span className="text-xs text-muted-foreground shrink-0">#{idx + 1}</span>
                    )}
                    <Input
                      value={step.type === "decision" ? (step.decisionTitle ?? "") : (step.title ?? "")}
                      onChange={(e) => step.type === "decision"
                        ? updateStep(step.id, { decisionTitle: e.target.value })
                        : updateStep(step.id, { title: e.target.value })
                      }
                      className="h-7 text-sm font-medium flex-1"
                      placeholder={step.type === "decision" ? "Decision title..." : "Step title..."}
                    />
                    <div className="flex gap-1 shrink-0">
                      <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => moveStep(step.id, "up")} disabled={idx === 0}>
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => moveStep(step.id, "down")} disabled={idx === steps.length - 1}>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => removeStep(step.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Decision step editor */}
                  {step.type === "decision" ? (
                    <div className="p-3 space-y-3">
                      {/* Title/Subtitle translations */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {(["en", "ar", "tr"] as const).map((l) => (
                          <div key={l} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{l === "en" ? "English" : l === "ar" ? "Arabic" : "Turkish"}</Label>
                            <Input
                              value={l === "en" ? (step.decisionTitle ?? "") : l === "ar" ? (step.decisionTitleAr ?? "") : (step.decisionTitleTr ?? "")}
                              onChange={(e) => updateStep(step.id, { [l === "en" ? "decisionTitle" : l === "ar" ? "decisionTitleAr" : "decisionTitleTr"]: e.target.value })}
                              placeholder={`Title (${l.toUpperCase()})`}
                              dir={l === "ar" ? "rtl" : "ltr"}
                              className="text-sm"
                            />
                            <Input
                              value={l === "en" ? (step.decisionSubtitle ?? "") : l === "ar" ? (step.decisionSubtitleAr ?? "") : (step.decisionSubtitleTr ?? "")}
                              onChange={(e) => updateStep(step.id, { [l === "en" ? "decisionSubtitle" : l === "ar" ? "decisionSubtitleAr" : "decisionSubtitleTr"]: e.target.value })}
                              placeholder={`Subtitle (${l.toUpperCase()})`}
                              dir={l === "ar" ? "rtl" : "ltr"}
                              className="text-xs"
                            />
                          </div>
                        ))}
                      </div>
                      {/* Buttons */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground">Buttons</p>
                        {(step.buttons ?? []).map((btn, btnIdx) => (
                          <div key={btnIdx} className="border rounded-lg p-2.5 space-y-2 bg-background">
                            <div className="flex items-center gap-2">
                              <Input
                                value={btn.label}
                                onChange={(e) => updateDecisionButton(step.id, btnIdx, { label: e.target.value })}
                                placeholder="Button label (EN)"
                                className="h-7 text-sm flex-1"
                              />
                              <select
                                value={btn.action}
                                onChange={(e) => updateDecisionButton(step.id, btnIdx, { action: e.target.value as any })}
                                className="h-7 rounded border border-input bg-background px-2 text-xs"
                              >
                                <option value="next_step">Continue form</option>
                                <option value="whatsapp">WhatsApp</option>
                                <option value="schedule_call">Schedule call (external link)</option>
                                <option value="schedule_call_inapp">Schedule call (date picker → appointment)</option>
                                <option value="complete_section">Complete section then return</option>
                              </select>
                              <select
                                value={btn.icon ?? ""}
                                onChange={(e) => updateDecisionButton(step.id, btnIdx, { icon: e.target.value as any || undefined })}
                                className="h-7 rounded border border-input bg-background px-2 text-xs"
                              >
                                <option value="">No icon</option>
                                <option value="continue">▶ Continue</option>
                                <option value="whatsapp">💬 WhatsApp</option>
                                <option value="phone">📞 Phone</option>
                                <option value="calendar">📅 Calendar</option>
                                <option value="female">♀ Female</option>
                                <option value="male">♂ Male</option>
                              </select>
                              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive shrink-0" onClick={() => removeDecisionButton(step.id, btnIdx)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                            {(btn.action === "whatsapp" || btn.action === "schedule_call") && (
                              <Input
                                value={btn.target ?? ""}
                                onChange={(e) => updateDecisionButton(step.id, btnIdx, { target: e.target.value })}
                                placeholder={btn.action === "whatsapp" ? "WhatsApp number (e.g. +905001234567)" : "URL (e.g. https://calendly.com/...)"}
                                className="h-7 text-xs"
                              />
                            )}
                            {btn.action === "complete_section" && (
                              <div className="space-y-1">
                                <Input
                                  value={btn.target ?? ""}
                                  onChange={(e) => updateDecisionButton(step.id, btnIdx, { target: e.target.value })}
                                  placeholder="Section ID (e.g. female_questions, male_questions)"
                                  className="h-7 text-xs"
                                />
                                <p className="text-xs text-muted-foreground">Step IDs in this section (comma-separated):</p>
                                <Input
                                  value={(btn.sectionStepIds ?? []).join(", ")}
                                  onChange={(e) => updateDecisionButton(step.id, btnIdx, { sectionStepIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                                  placeholder="e.g. step_2, step_3"
                                  className="h-7 text-xs"
                                />
                              </div>
                            )}
                            {btn.action === "schedule_call_inapp" && (
                              <p className="text-xs text-muted-foreground italic">Patient will see a date/time picker. On submit, an appointment is created in the system and staff are notified.</p>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                value={btn.labelAr ?? ""}
                                onChange={(e) => updateDecisionButton(step.id, btnIdx, { labelAr: e.target.value })}
                                placeholder="Arabic label"
                                dir="rtl"
                                className="h-7 text-xs"
                              />
                              <Input
                                value={btn.labelTr ?? ""}
                                onChange={(e) => updateDecisionButton(step.id, btnIdx, { labelTr: e.target.value })}
                                placeholder="Turkish label"
                                className="h-7 text-xs"
                              />
                            </div>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" className="gap-1.5 w-full h-7 text-xs" onClick={() => addDecisionButton(step.id)}>
                          <Plus className="h-3 w-3" /> Add Button
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Fields step editor */
                    <div className="p-3 space-y-3">
                      {/* Per-step title/subtitle — English only; AR/TR are auto-translated via AI tab */}
                      <details className="group">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
                          ▶ Step title &amp; subtitle (optional, overrides form title for this step)
                        </summary>
                        <div className="mt-2 space-y-2">
                          <Label className="text-xs text-muted-foreground">English</Label>
                          <Input
                            value={step.title ?? ""}
                            onChange={(e) => updateStep(step.id, { title: e.target.value })}
                            placeholder="Title (EN)"
                            className="text-sm"
                          />
                          <Input
                            value={step.subtitle ?? ""}
                            onChange={(e) => updateStep(step.id, { subtitle: e.target.value })}
                            placeholder="Subtitle (EN)"
                            className="text-xs"
                          />
                          <p className="text-xs text-muted-foreground italic">Arabic &amp; Turkish translations are generated automatically in the Translations tab.</p>
                        </div>
                      </details>
                      {/* Field assignment — grouped by section with gender icons */}
                      {selectedFieldIds.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Select fields in the Fields tab first.</p>
                      ) : (() => {
                        // Group selected fields by section, preserving order
                        const sectionMap: { section: string; gender?: string; category: string; fields: { id: string; field: NonNullable<typeof catalog>[number] }[] }[] = [];
                        const sectionIndex: Record<string, number> = {};
                        for (const fieldId of selectedFieldIds) {
                          const catalogField = catalog?.find((f) => f.id === fieldId);
                          if (!catalogField) continue;
                          const sec = (catalogField as any).section ?? (catalogField.category === "fertility_female" ? "Female Medical" : catalogField.category === "fertility_male" ? "Male Medical" : catalogField.category === "lead_info" ? "Lead Info" : catalogField.category === "personal_info" ? "Personal Info" : catalogField.category === "contact_info" ? "Contact Info" : catalogField.category === "logistics" ? "Logistics" : "General");
                          const genderKey = (catalogField as any).gender ?? (catalogField.category === "fertility_female" ? "female" : catalogField.category === "fertility_male" ? "male" : undefined);
                          const key = `${sec}__${genderKey ?? ""}`;
                          if (sectionIndex[key] === undefined) {
                            sectionIndex[key] = sectionMap.length;
                            sectionMap.push({ section: sec, gender: genderKey, category: catalogField.category, fields: [] });
                          }
                          sectionMap[sectionIndex[key]].fields.push({ id: fieldId, field: catalogField });
                        }
                        return (
                          <div className="space-y-3">
                            {sectionMap.map((group) => (
                              <div key={`${group.section}__${group.gender ?? ""}`}>
                                {/* Section header */}
                                <div className="flex items-center gap-1.5 mb-1">
                                  {group.gender === "female" && <span className="text-pink-500 text-xs font-bold">♀</span>}
                                  {group.gender === "male" && <span className="text-blue-500 text-xs font-bold">♂</span>}
                                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.section}</span>
                                  <div className="flex-1 h-px bg-border" />
                                </div>
                                {/* Fields in this section */}
                                <div className="grid grid-cols-1 gap-0.5 pl-1">
                                  {group.fields.map(({ id: fieldId, field: catalogField }) => {
                                    const inThisStep = (step.fieldIds ?? []).includes(fieldId);
                                    const inOtherStep = steps.some((s) => s.id !== step.id && (s.fieldIds ?? []).includes(fieldId));
                                    const gIcon = (catalogField as any).gender === "female" ? <span className="text-pink-400 text-xs shrink-0">♀</span>
                                      : (catalogField as any).gender === "male" ? <span className="text-blue-400 text-xs shrink-0">♂</span>
                                      : null;
                                    if (inOtherStep) return null;
                                    const existingCond = (step.fieldConditions ?? {})[fieldId];
                                    return (
                                      <div key={fieldId} className="py-0.5">
                                        <label className="flex items-start gap-2 cursor-pointer text-sm">
                                          <Checkbox
                                            className="mt-0.5 shrink-0"
                                            checked={inThisStep}
                                            onCheckedChange={(_: boolean) => toggleFieldInStep(step.id, fieldId)}
                                          />
                                          {gIcon}
                                          <span className="break-words leading-snug">{catalogField.labelEn}</span>
                                        </label>
                                        {/* Condition UI — only shown when field is in this step */}
                                        {inThisStep && (
                                          <div className="ml-6 mt-0.5">
                                            {existingCond ? (
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-0.5">
                                                  Show if <strong>{existingCond.fieldId}</strong> = {existingCond.values.join(" / ")}
                                                </span>
                                                <button
                                                  type="button"
                                                  className="text-xs text-muted-foreground hover:text-destructive"
                                                  onClick={() => setFieldCondition(step.id, fieldId, null)}
                                                  title="Remove condition"
                                                >
                                                  ✕
                                                </button>
                                              </div>
                                            ) : (
                                              <ConditionEditor
                                                catalog={catalog ?? []}
                                                onAdd={(cond) => setFieldCondition(step.id, fieldId, cond)}
                                              />
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="gap-1.5 flex-1" onClick={addStep}>
                  <Plus className="h-3.5 w-3.5" /> Add Fields Step
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-1.5 flex-1 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={addDecisionStep}>
                  <Plus className="h-3.5 w-3.5" /> Add Decision Step
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer — sticky so it stays above the mobile keyboard */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t bg-background shrink-0">
          <div className="text-xs text-muted-foreground">
            {selectedFields.size} field{selectedFields.size !== 1 ? "s" : ""} selected
            {translationsReady && ` · Translated`}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-1.5">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {form ? "Save Changes" : "Create Form"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
