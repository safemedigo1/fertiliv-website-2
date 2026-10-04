import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { fmtDate } from "@/lib/dateFormat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Save, Star, Link2 } from "lucide-react";

interface PatientCRMTabProps {
  patientId: number;
  patient: any;
  onRefresh: () => void;
}

const LEAD_SOURCES = [
  { value: "paid", label: "Paid" },
  { value: "employee-referral", label: "Employee Referral" },
  { value: "external-referral", label: "External Referral" },
  { value: "website", label: "Website" },
  { value: "maps", label: "Maps" },
  { value: "partner", label: "Partner" },
  { value: "public-relations", label: "Public Relations" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "doctor-referral", label: "Doctor Referral" },
  { value: "youtube", label: "YouTube" },
  { value: "facebook", label: "Facebook" },
  { value: "awatef-guide", label: "Awatef (Guide)" },
  { value: "salim-guide", label: "Salim (Guide)" },
  { value: "organic", label: "Organic" },
];

const DECISION_TIMELINES = [
  { value: "immediately", label: "As soon as possible / Immediately" },
  { value: "1-2-weeks", label: "1–2 weeks" },
  { value: "1-month", label: "1 month" },
  { value: "2-months", label: "2 months" },
  { value: "3-months", label: "3 months" },
  { value: "1-3-months", label: "1–3 months" },
  { value: "6-months", label: "6 months" },
  { value: "exploring", label: "Exploring / Not sure" },
];

const TRAVEL_READINESS = [
  { value: "ready", label: "Yes, I am ready to travel" },
  { value: "considering", label: "I am considering traveling and comparing options" },
  { value: "prefers-home", label: "I prefer treatment in my home country" },
  { value: "local-patient", label: "Local patient" },
];

const IVF_EXPERIENCE = [
  { value: "never-tried", label: "Never tried" },
  { value: "tried-unsuccessful", label: "Tried before – unsuccessful" },
  { value: "tried-again", label: "Tried before – wants try again" },
  { value: "tried-multiple", label: "Tried multiple attempts" },
];

const LANGUAGES = [
  "Arabic", "English", "French", "German", "Somali", "Spanish", "Italian", "Russian", "Turkish",
];

const CONTACT_METHODS = [
  "WhatsApp", "Phone", "Email", "SMS",
];

const MEDICAL_INTERESTS = [
  "Egg Freezing",
  "Fertility Check-up (Couple)",
  "Fertility Check-up (Female)",
  "Fertility Check-up (Male)",
  "IUI",
  "IVF with ICSI",
  "PGT (Preimplantation Genetic Testing)",
  "Other / Not sure yet",
  "PRP",
  "Exosome",
  "Hysteroscopy",
  "HSG",
  "Sperm Test",
];

const FEMALE_FERTILITY_DIAGNOSES = [
  "Ovarian reserve",
  "PCOS (Polycystic Ovary Syndrome)",
  "Premature Ovarian Insufficiency (POI)",
  "Ovulation disorders",
  "Tubal factor",
  "Hydrosalpinx",
  "Endometriosis",
  "Uterine factors",
  "Uterine fibroids (myomas)",
  "Uterine polyps",
  "Uterine septum / Asherman's syndrome",
  "Genetics / PGT needed",
  "Recurrent miscarriages",
  "Recurrent Implantation Failure (RIF)",
  "Unexplained infertility",
  "No clear diagnosis / needs re-evaluation",
  "Systemic factors",
  "Other",
];

const MALE_FERTILITY_DIAGNOSES = [
  "Male factor infertility",
  "Azoospermia",
  "Oligospermia (low sperm count)",
  "Asthenospermia (poor motility)",
  "Teratospermia (abnormal morphology)",
  "OAT syndrome (combined)",
  "Varicocele",
  "Recurrent Varicocele",
  "High Sperm DNA Fragmentation",
  "Undescended testicles (cryptorchidism)",
  "Vasectomy history",
  "Retrograde ejaculation",
  "Hypogonadism",
  "Y-chromosome microdeletion",
  "Klinefelter syndrome",
  "CF mutation carrier",
  "Unexplained male factor",
  "No clear diagnosis",
  "Other",
];

/** Safely convert a value that may be a JSON array or a string into a display string */
function toDisplayString(val: unknown): string | undefined {
  if (!val) return undefined;
  if (Array.isArray(val)) return val.join(", ") || undefined;
  if (typeof val === "string") return val || undefined;
  return String(val) || undefined;
}

/** Safely get the first element if array, or the value itself if string */
function toSingleValue(val: unknown): string {
  if (Array.isArray(val)) return (val[0] as string) ?? "";
  if (typeof val === "string") return val;
  return "";
}

/** Safely parse a JSON array field that may come back as a string or already parsed */
function toArray(val: unknown): string[] {
  if (Array.isArray(val)) return val as string[];
  if (typeof val === "string") {
    try { const p = JSON.parse(val); return Array.isArray(p) ? p : [val]; } catch { return val ? [val] : []; }
  }
  return [];
}

function toDateInput(val: unknown): string {
  if (!val) return "";
  try {
    return new Date(val as any).toISOString().split("T")[0];
  } catch { return ""; }
}

export function PatientCRMTab({ patientId, patient, onRefresh }: PatientCRMTabProps) {
  const [editing, setEditing] = useState(false);

  // ── Linked Lead read-through ─────────────────────────────────────────────────
  // When patient.socialLeadId is set, CRM data is sourced from the linked Lead.
  const linkedLeadId = patient?.socialLeadId ? Number(patient.socialLeadId) : null;
  const { data: linkedLead, refetch: refetchLinkedLead } = trpc.leads.get.useQuery(
    { id: linkedLeadId! },
    { enabled: !!linkedLeadId, staleTime: 0 }
  );

  // The effective CRM data source: Lead when linked, Patient otherwise
  const crmSource = useMemo(() => linkedLead ?? patient, [linkedLead, patient]);
  const isLinked = !!linkedLeadId && !!linkedLead;

  // ── Dynamic dropdown options from Settings ──────────────────────────────────
  // staleTime:0 ensures changes made in Settings reflect immediately on next focus/mount
  const { data: dynMedicalInterests } = trpc.dropdownOptions.list.useQuery({ fieldKey: "main_medical_interest" }, { staleTime: 0 });
  const { data: dynFemaleDiagnoses } = trpc.dropdownOptions.list.useQuery({ fieldKey: "female_fertility_diagnosis" }, { staleTime: 0 });
  const { data: dynMaleDiagnoses } = trpc.dropdownOptions.list.useQuery({ fieldKey: "male_fertility_diagnosis" }, { staleTime: 0 });
  const { data: dynLeadSources } = trpc.dropdownOptions.list.useQuery({ fieldKey: "lead_source" }, { staleTime: 0 });
  const { data: dynIvfExperience } = trpc.dropdownOptions.list.useQuery({ fieldKey: "ivf_experience" }, { staleTime: 0 });

  // Fall back to hardcoded arrays if DB options not loaded yet
  const activeMedicalInterests = dynMedicalInterests?.filter(o => o.isActive !== false).map(o => o.label) ?? MEDICAL_INTERESTS;
  const activeFemaleDiagnoses = dynFemaleDiagnoses?.filter(o => o.isActive !== false).map(o => o.label) ?? FEMALE_FERTILITY_DIAGNOSES;
  const activeMaleDiagnoses = dynMaleDiagnoses?.filter(o => o.isActive !== false).map(o => o.label) ?? MALE_FERTILITY_DIAGNOSES;
  const activeLeadSources = dynLeadSources?.filter(o => o.isActive !== false).map(o => ({ value: o.value, label: o.label })) ?? LEAD_SOURCES;
  const activeIvfExperience = dynIvfExperience?.filter(o => o.isActive !== false).map(o => ({ value: o.value, label: o.label })) ?? IVF_EXPERIENCE;

  // Build grouped option sets for ChipEditor (preserves group headers from DB)
  type GroupedChipOptions = { groupLabel: string | null; items: string[] }[];
  const buildGroupedOptions = (dynOpts: typeof dynMaleDiagnoses, fallback: string[]): GroupedChipOptions => {
    if (!dynOpts) return [{ groupLabel: null, items: fallback }];
    const active = dynOpts.filter(o => o.isActive !== false);
    const hasGroups = active.some(o => o.groupLabel);
    if (!hasGroups) return [{ groupLabel: null, items: active.map(o => o.label) }];
    const map = new Map<string, string[]>();
    for (const o of active) {
      const key = o.groupLabel ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o.label);
    }
    const result: GroupedChipOptions = [];
    const ungrouped = map.get("");
    if (ungrouped?.length) result.push({ groupLabel: null, items: ungrouped });
    for (const [k, v] of Array.from(map.entries())) {
      if (k !== "") result.push({ groupLabel: k, items: v });
    }
    return result;
  };
  const groupedMedicalInterests = buildGroupedOptions(dynMedicalInterests, MEDICAL_INTERESTS);
  const groupedFemaleDiagnoses = buildGroupedOptions(dynFemaleDiagnoses, FEMALE_FERTILITY_DIAGNOSES);
  const groupedMaleDiagnoses = buildGroupedOptions(dynMaleDiagnoses, MALE_FERTILITY_DIAGNOSES);

  const buildForm = (p: any) => ({
    // Source & campaign
    leadSource: toSingleValue(p?.leadSource ?? p?.source),
    socialLeadId: (p?.socialLeadId as string) ?? "",
    campaignName: (p?.campaignName as string) ?? "",
    // Qualification
    interestLevel: (p?.interestLevel as string) ?? "",
    rating: (p?.rating as string) ?? "",
    budgetRange: (p?.budgetRange as string) ?? "",
    decisionTimeline: toSingleValue(p?.decisionTimeline),
    travelReadiness: toSingleValue(p?.travelReadiness),
    ivfExperience: toSingleValue(p?.ivfExperience),
    // Clinical interest
    mainMedicalInterest: toArray(p?.mainMedicalInterest),
    fertilityDiagnosis: toArray(p?.fertilityDiagnosis),
    maleFertilityDiagnosis: toArray(p?.maleFertilityDiagnosis),
    // Contact preferences
    preferredLanguages: toArray(p?.preferredLanguages),
    preferredContactMethods: toArray(p?.preferredContactMethods),
    // Location
    country: (p?.country as string) ?? "",
    city: (p?.city as string) ?? "",
    countryOfResidency: (p?.countryOfResidency as string) ?? "",
    // Logistics
    accommodationHotel: (p?.accommodationHotel as string) ?? "",
    accommodationLocation: (p?.accommodationLocation as string) ?? "",
    transportationAirportPickup: !!(p?.transportationAirportPickup),
    transportationLocalTransfer: !!(p?.transportationLocalTransfer),
    // Follow-up
    lastContactDate: toDateInput(p?.lastContactDate),
    nextFollowUpDate: toDateInput(p?.nextFollowUpDate),
    // Notes
    caseSummary: (p?.caseSummary as string) ?? "",
    salesNote: (p?.salesNote as string) ?? "",
  });

  const [form, setForm] = useState(() => buildForm(crmSource));

  const utils = trpc.useUtils();

  const updatePatient = trpc.patients.update.useMutation({
    onSuccess: () => {
      toast.success("CRM info updated");
      onRefresh();
      setEditing(false);
    },
    onError: (e) => {
      const msg = (e as any)?.data?.zodError
        ? "Please check the form fields and try again."
        : (e.message || "Something went wrong. Please try again.");
      toast.error(msg);
    },
  });

  const updateLead = trpc.leads.update.useMutation({
    onSuccess: async () => {
      toast.success("CRM info updated");
      // Invalidate both Lead and Patient caches so all views reflect the change
      await Promise.all([
        utils.leads.get.invalidate({ id: linkedLeadId! }),
        utils.leads.list.invalidate(),
      ]);
      await refetchLinkedLead();
      onRefresh();
      setEditing(false);
    },
    onError: (e) => {
      const msg = (e as any)?.data?.zodError
        ? "Please check the form fields and try again."
        : (e.message || "Something went wrong. Please try again.");
      toast.error(msg);
    },
  });

  const handleSave = () => {
    // When linked to a Lead, CRM edits go to the Lead (edit-through)
    if (isLinked && linkedLeadId) {
      updateLead.mutate({
        id: linkedLeadId,
        data: {
          leadSource: (form.leadSource || undefined) as any,
          campaignName: form.campaignName || undefined,
          interestLevel: (form.interestLevel || undefined) as any,
          rating: form.rating || undefined,
          budgetRange: form.budgetRange || undefined,
          decisionTimeline: (form.decisionTimeline || undefined) as any,
          travelReadiness: (form.travelReadiness || undefined) as any,
          ivfExperience: (form.ivfExperience || undefined) as any,
          mainMedicalInterest: form.mainMedicalInterest.length > 0 ? form.mainMedicalInterest : undefined,
          fertilityDiagnosis: form.fertilityDiagnosis.length > 0 ? form.fertilityDiagnosis : undefined,
          maleFertilityDiagnosis: (form as any).maleFertilityDiagnosis?.length > 0 ? (form as any).maleFertilityDiagnosis : undefined,
          preferredLanguages: form.preferredLanguages.length > 0 ? form.preferredLanguages : undefined,
          preferredContactMethods: form.preferredContactMethods.length > 0 ? form.preferredContactMethods : undefined,
          country: form.country || undefined,
          city: form.city || undefined,
          // countryOfResidency is a patients-only column; leads table has no such column — omitted from linked-Lead path
          accommodationHotel: form.accommodationHotel || undefined,
          accommodationLocation: form.accommodationLocation || undefined,
          transportationAirportPickup: form.transportationAirportPickup,
          transportationLocalTransfer: form.transportationLocalTransfer,
          lastContactDate: form.lastContactDate ? new Date(form.lastContactDate) : undefined,
          nextFollowUpDate: form.nextFollowUpDate ? new Date(form.nextFollowUpDate) : undefined,
          caseSummary: form.caseSummary || undefined,
          salesNote: form.salesNote || undefined,
        },
      });
      return;
    }
    // Unlinked Patient: save to Patient as before
    updatePatient.mutate({
      id: patientId,
      data: {
        source: (form.leadSource || undefined) as any,
        socialLeadId: form.socialLeadId || undefined,
        campaignName: form.campaignName || undefined,
        interestLevel: (form.interestLevel || undefined) as any,
        rating: form.rating || undefined,
        budgetRange: form.budgetRange || undefined,
        decisionTimeline: (form.decisionTimeline || undefined) as any,
        travelReadiness: (form.travelReadiness || undefined) as any,
        ivfExperience: (form.ivfExperience || undefined) as any,
        mainMedicalInterest: form.mainMedicalInterest.length > 0 ? form.mainMedicalInterest : undefined,
        fertilityDiagnosis: form.fertilityDiagnosis.length > 0 ? form.fertilityDiagnosis : undefined,
          maleFertilityDiagnosis: (form as any).maleFertilityDiagnosis?.length > 0 ? (form as any).maleFertilityDiagnosis : undefined,
        preferredLanguages: form.preferredLanguages.length > 0 ? form.preferredLanguages : undefined,
        preferredContactMethods: form.preferredContactMethods.length > 0 ? form.preferredContactMethods : undefined,
        country: form.country || undefined,
        city: form.city || undefined,
        countryOfResidency: form.countryOfResidency || undefined,
        accommodationHotel: form.accommodationHotel || undefined,
        accommodationLocation: form.accommodationLocation || undefined,
        transportationAirportPickup: form.transportationAirportPickup,
        transportationLocalTransfer: form.transportationLocalTransfer,
        lastContactDate: form.lastContactDate ? new Date(form.lastContactDate) : undefined,
        nextFollowUpDate: form.nextFollowUpDate ? new Date(form.nextFollowUpDate) : undefined,
        caseSummary: form.caseSummary || undefined,
        salesNote: form.salesNote || undefined,
      },
    });
  };

  const startEdit = () => {
    setForm(buildForm(crmSource));
    setEditing(true);
  };

  const isSaving = updatePatient.isPending || updateLead.isPending;

  const toggleArr = (key: keyof typeof form, val: string) => {
    setForm(f => {
      const arr = f[key] as string[];
      return {
        ...f,
        [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val],
      };
    });
  };

  const Field = ({ label, value }: { label: string; value?: string | null }) => (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value || <span className="text-muted-foreground/60 italic">—</span>}</p>
    </div>
  );

  const MultiChipField = ({ label, values }: { label: string; values: string[] }) => (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1 mt-1">
          {values.map(v => (
            <span key={v} className="px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20">{v}</span>
          ))}
        </div>
      ) : (
        <p className="text-sm font-medium mt-0.5 text-muted-foreground/60 italic">—</p>
      )}
    </div>
  );

  // Flat ChipEditor (no groups) — used for languages, contact methods, etc.
  const ChipEditor = ({ label, options, fieldKey }: { label: string; options: string[]; fieldKey: keyof typeof form }) => (
    <div className="col-span-2 space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-2 mt-1">
        {options.map(opt => {
          const arr = form[fieldKey] as string[];
          const selected = arr.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggleArr(fieldKey, opt)}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                selected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-foreground hover:bg-muted"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );

  // Grouped ChipEditor — renders section headers between groups
  const GroupedChipEditor = ({ label, groups, fieldKey }: { label: string; groups: GroupedChipOptions; fieldKey: keyof typeof form }) => (
    <div className="col-span-2 space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="space-y-2 mt-1">
        {groups.map(({ groupLabel: gl, items }) => (
          <div key={gl ?? "__ungrouped__"}>
            {gl && (
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{gl}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {items.map(opt => {
                const arr = form[fieldKey] as string[];
                const selected = arr.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleArr(fieldKey, opt)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      selected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-foreground hover:bg-muted"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-500" /> CRM / Lead Profile
        </h3>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={startEdit}>Edit CRM Info</Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setEditing(false); setForm(buildForm(crmSource)); }}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </div>

      {/* Read-through / Edit-through banner */}
      {isLinked && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-xs">
          <Link2 className="h-3.5 w-3.5 flex-shrink-0" />
          <span>CRM data is linked to Lead #{linkedLeadId}. Edits here update the Lead record directly.</span>
        </div>
      )}

      {!editing ? (
        <div className="space-y-6">
          {/* Interest Level Quick Selector */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div>
              <p className="text-sm font-semibold">Interest Level</p>
              <p className="text-xs text-muted-foreground mt-0.5">Track patient engagement level</p>
            </div>
            <div className="flex gap-2">
              {(["cold", "warm", "hot"] as const).map(level => {
                const colors: Record<string, string> = {
                  hot: "bg-red-500 text-white shadow-sm",
                  warm: "bg-orange-400 text-white shadow-sm",
                  cold: "bg-blue-400 text-white shadow-sm",
                };
                const isActive = (crmSource as any)?.interestLevel === level;
                return (
                  <button
                    key={level}
                    onClick={() => {
                      if (isLinked && linkedLeadId) {
                        updateLead.mutate({ id: linkedLeadId, data: { interestLevel: level as any } });
                      } else {
                        updatePatient.mutate({ id: patientId, data: { interestLevel: level as any } });
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                      isActive ? colors[level] : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Source & Campaign */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Source & Campaign</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <Field label="Lead Source" value={activeLeadSources.find(s => s.value === ((crmSource as any)?.leadSource ?? (crmSource as any)?.source))?.label ?? toDisplayString((crmSource as any)?.leadSource ?? (crmSource as any)?.source)} />
              <Field label="Campaign Name" value={toDisplayString((crmSource as any)?.campaignName)} />
              <Field label="Social Lead ID" value={toDisplayString(patient?.socialLeadId)} />
            </div>
          </div>

          {/* Qualification */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Qualification</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <Field label="Interest Level" value={(crmSource as any)?.interestLevel ? ((crmSource as any).interestLevel as string).toUpperCase() : undefined} />
              <Field label="Rating" value={toDisplayString((crmSource as any)?.rating)} />
              <Field label="Budget Range" value={toDisplayString((crmSource as any)?.budgetRange)} />
              <Field label="Decision Timeline" value={DECISION_TIMELINES.find(d => d.value === toSingleValue((crmSource as any)?.decisionTimeline))?.label} />
              <Field label="Travel Readiness" value={TRAVEL_READINESS.find(t => t.value === toSingleValue((crmSource as any)?.travelReadiness))?.label} />
              <Field label="IVF Experience" value={activeIvfExperience.find(i => i.value === toSingleValue((crmSource as any)?.ivfExperience))?.label} />
            </div>
          </div>

          {/* Clinical Interest */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Clinical Interest</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <MultiChipField label="Main Medical Interest" values={toArray((crmSource as any)?.mainMedicalInterest)} />
              <MultiChipField label="Female Fertility Diagnosis" values={toArray((crmSource as any)?.fertilityDiagnosis).filter((d: string) => d !== "Male factor infertility")} />
              <MultiChipField label="Male Fertility Diagnosis" values={toArray((crmSource as any)?.maleFertilityDiagnosis)} />
            </div>
          </div>

          {/* Contact Preferences */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Contact Preferences</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <MultiChipField label="Preferred Language(s)" values={toArray((crmSource as any)?.preferredLanguages)} />
              <MultiChipField label="Preferred Contact Methods" values={toArray((crmSource as any)?.preferredContactMethods)} />
            </div>
          </div>

          {/* Location */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Location</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <Field label="Country" value={toDisplayString((crmSource as any)?.country)} />
              <Field label="City" value={toDisplayString((crmSource as any)?.city)} />
              <Field label="Country of Residency" value={toDisplayString((crmSource as any)?.countryOfResidency)} />
            </div>
          </div>

          {/* Logistics */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Logistics</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <Field label="Accommodation Hotel" value={toDisplayString((crmSource as any)?.accommodationHotel)} />
              <Field label="Accommodation Location" value={toDisplayString((crmSource as any)?.accommodationLocation)} />
              <Field label="Airport Pickup" value={(crmSource as any)?.transportationAirportPickup ? "Yes" : "No"} />
              <Field label="Local Transfer" value={(crmSource as any)?.transportationLocalTransfer ? "Yes" : "No"} />
            </div>
          </div>

          {/* Follow-up */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Follow-up</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <Field label="Last Contact Date" value={(crmSource as any)?.lastContactDate ? fmtDate((crmSource as any).lastContactDate) : undefined} />
              <Field label="Next Follow-up Date" value={(crmSource as any)?.nextFollowUpDate ? fmtDate((crmSource as any).nextFollowUpDate) : undefined} />
            </div>
          </div>

          {/* Notes */}
          {((crmSource as any)?.caseSummary || (crmSource as any)?.salesNote) && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Notes</p>
              <div className="space-y-3">
                {(crmSource as any)?.caseSummary && (
                  <div>
                    <p className="text-xs text-muted-foreground">Case Summary</p>
                    <p className="text-sm mt-0.5 whitespace-pre-wrap">{(crmSource as any).caseSummary}</p>
                  </div>
                )}
                {(crmSource as any)?.salesNote && (
                  <div>
                    <p className="text-xs text-muted-foreground">Sales Note</p>
                    <p className="text-sm mt-0.5 whitespace-pre-wrap">{(crmSource as any).salesNote}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Source & Campaign */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Source & Campaign</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Lead Source</Label>
                <Select value={form.leadSource || "_none"} onValueChange={v => setForm(f => ({ ...f, leadSource: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Not specified —</SelectItem>
                    {activeLeadSources.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Campaign Name</Label>
                <Input placeholder="e.g. Spring 2025" value={form.campaignName} onChange={e => setForm(f => ({ ...f, campaignName: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Social Lead ID</Label>
                <Input placeholder="e.g. FB-12345" value={form.socialLeadId} onChange={e => setForm(f => ({ ...f, socialLeadId: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Qualification */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Qualification</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Interest Level</Label>
                <Select value={form.interestLevel || "_none"} onValueChange={v => setForm(f => ({ ...f, interestLevel: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Not specified —</SelectItem>
                    <SelectItem value="hot">Hot 🔥</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="cold">Cold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rating (1–5)</Label>
                <Input placeholder="e.g. 4" value={form.rating} onChange={e => setForm(f => ({ ...f, rating: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Budget Range</Label>
                <Input placeholder="e.g. $5,000–$10,000" value={form.budgetRange} onChange={e => setForm(f => ({ ...f, budgetRange: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Decision Timeline</Label>
                <Select value={form.decisionTimeline || "_none"} onValueChange={v => setForm(f => ({ ...f, decisionTimeline: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Not specified —</SelectItem>
                    {DECISION_TIMELINES.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Travel Readiness</Label>
                <Select value={form.travelReadiness || "_none"} onValueChange={v => setForm(f => ({ ...f, travelReadiness: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Not specified —</SelectItem>
                    {TRAVEL_READINESS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">IVF Experience</Label>
                <Select value={form.ivfExperience || "_none"} onValueChange={v => setForm(f => ({ ...f, ivfExperience: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Not specified —</SelectItem>
                    {activeIvfExperience.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Clinical Interest */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Clinical Interest</p>
            <div className="grid grid-cols-1 gap-3">
              <GroupedChipEditor label="Main Medical Interest" groups={groupedMedicalInterests} fieldKey="mainMedicalInterest" />
              <GroupedChipEditor label="Female Fertility Diagnosis" groups={groupedFemaleDiagnoses} fieldKey="fertilityDiagnosis" />
              <GroupedChipEditor label="Male Fertility Diagnosis" groups={groupedMaleDiagnoses} fieldKey="maleFertilityDiagnosis" />
            </div>
          </div>

          {/* Contact Preferences */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Contact Preferences</p>
            <div className="grid grid-cols-1 gap-3">
              <ChipEditor label="Preferred Language(s)" options={LANGUAGES} fieldKey="preferredLanguages" />
              <ChipEditor label="Preferred Contact Methods" options={CONTACT_METHODS} fieldKey="preferredContactMethods" />
            </div>
          </div>

          {/* Location */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Location</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Country</Label>
                <Input placeholder="e.g. United Kingdom" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">City</Label>
                <Input placeholder="e.g. London" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              {/* Country of Residency is a patients-only field — only show when not linked to a Lead */}
              {!isLinked && (
                <div className="space-y-1">
                  <Label className="text-xs">Country of Residency</Label>
                  <Input placeholder="e.g. United Kingdom" value={form.countryOfResidency} onChange={e => setForm(f => ({ ...f, countryOfResidency: e.target.value }))} />
                </div>
              )}
            </div>
          </div>

          {/* Logistics */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Logistics</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Accommodation Hotel</Label>
                <Input placeholder="Hotel name" value={form.accommodationHotel} onChange={e => setForm(f => ({ ...f, accommodationHotel: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Accommodation Location</Label>
                <Input placeholder="Area / address" value={form.accommodationLocation} onChange={e => setForm(f => ({ ...f, accommodationLocation: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Checkbox
                  id="airportPickup"
                  checked={form.transportationAirportPickup}
                  onCheckedChange={v => setForm(f => ({ ...f, transportationAirportPickup: !!v }))}
                />
                <Label htmlFor="airportPickup" className="text-sm cursor-pointer">Airport Pickup Required</Label>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Checkbox
                  id="localTransfer"
                  checked={form.transportationLocalTransfer}
                  onCheckedChange={v => setForm(f => ({ ...f, transportationLocalTransfer: !!v }))}
                />
                <Label htmlFor="localTransfer" className="text-sm cursor-pointer">Local Transfer Required</Label>
              </div>
            </div>
          </div>

          {/* Follow-up */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Follow-up</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Last Contact Date</Label>
                <Input type="date" value={form.lastContactDate} onChange={e => setForm(f => ({ ...f, lastContactDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Next Follow-up Date</Label>
                <Input type="date" value={form.nextFollowUpDate} onChange={e => setForm(f => ({ ...f, nextFollowUpDate: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Notes</p>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Case Summary</Label>
                <Textarea
                  placeholder="Clinical summary, background, key notes..."
                  value={form.caseSummary}
                  onChange={e => setForm(f => ({ ...f, caseSummary: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sales Note</Label>
                <Textarea
                  placeholder="Sales team notes, follow-up context..."
                  value={form.salesNote}
                  onChange={e => setForm(f => ({ ...f, salesNote: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
