/**
 * TreatmentPlanTab — Shared treatment plan builder component.
 * Used in both DoctorCaseViewPage (Full Record) and formerly in DoctorMyCasesPage.
 *
 * Features:
 * - Clinical Summary with voice recording + AI rewrite
 * - Treatment Scenarios (add/duplicate/delete, services per scenario)
 * - Q&A integration: unanswered questions shown for doctor to answer,
 *   previously answered questions shown in a collapsible section (selectable for PDF)
 * - PDF export with language selector
 * - Confirm / Revise plan workflow
 */
import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Loader2,
  Mic,
  MicOff,
  Sparkles,
  Plus,
  Trash2,
  Copy,
  Save,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  UserCircle2,
  Pencil,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────
export const TRANSLATE_LANGS = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "tr", label: "Turkish" },
];

const SERVICE_CATEGORIES = [
  { value: "lab_test", label: "Lab Test" },
  { value: "radiology_test", label: "Radiology" },
  { value: "pathology_test", label: "Pathology" },
  { value: "other_test", label: "Other Test" },
  { value: "procedure", label: "Procedure" },
  { value: "consultation", label: "Consultation" },
  { value: "medicine", label: "Medication" },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface ServiceEntry {
  serviceId?: number;
  serviceName: string;
  category: string;
  isCustom?: boolean;
  dosage?: string;
  frequency?: string;
  notes?: string;
}

interface ScenarioState {
  id?: number;
  localId: string;
  title: string;
  services: ServiceEntry[];
  isDirty: boolean;
  isSaving: boolean;
}

// ─── Scenario Service Row ─────────────────────────────────────────────────────
function ScenarioServiceRow({ entry, onChange, onRemove, allServices }: {
  entry: ServiceEntry;
  onChange: (updated: ServiceEntry) => void;
  onRemove: () => void;
  allServices: any[];
}) {
  const filtered = allServices.filter((s) => s.category === entry.category);
  return (
    <div className="space-y-2 border border-border/40 rounded-md p-3">
      <div className="flex items-center gap-2">
        <Select value={entry.category} onValueChange={(v) => onChange({ ...entry, category: v, serviceName: "", serviceId: undefined, isCustom: false })}>
          <SelectTrigger className="h-7 text-xs w-36 flex-shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SERVICE_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {entry.isCustom ? (
          <Input
            value={entry.serviceName}
            onChange={(e) => onChange({ ...entry, serviceName: e.target.value })}
            placeholder="Custom service name"
            className="h-7 text-xs flex-1"
          />
        ) : (
          <Select
            value={entry.serviceId ? String(entry.serviceId) : "__custom__"}
            onValueChange={(v) => {
              if (v === "__custom__") { onChange({ ...entry, isCustom: true, serviceName: "", serviceId: undefined }); return; }
              const svc = allServices.find((s) => String(s.id) === v);
              if (svc) onChange({ ...entry, serviceId: svc.id, serviceName: svc.name, isCustom: false });
            }}
          >
            <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Select service..." /></SelectTrigger>
            <SelectContent>
              {filtered.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              <SelectItem value="__custom__">+ Custom service</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Button size="sm" variant="ghost" className="h-7 px-1.5 text-destructive flex-shrink-0" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {entry.category === "medicine" && (
        <div className="grid grid-cols-2 gap-2">
          <Input value={entry.dosage ?? ""} onChange={(e) => onChange({ ...entry, dosage: e.target.value })} placeholder="Dosage (e.g. 500mg)" className="h-7 text-xs" />
          <Input value={entry.frequency ?? ""} onChange={(e) => onChange({ ...entry, frequency: e.target.value })} placeholder="Frequency (e.g. twice daily)" className="h-7 text-xs" />
          <Input value={entry.notes ?? ""} onChange={(e) => onChange({ ...entry, notes: e.target.value })} placeholder="Notes (e.g. start Day 2 of cycle)" className="h-7 text-xs col-span-2" />
        </div>
      )}
    </div>
  );
}

// ─── Scenario Card ────────────────────────────────────────────────────────────
function ScenarioCard({ scenario, planId, allServices, onUpdate, onDelete, onDuplicate, isConfirmed, currency }: {
  scenario: ScenarioState;
  planId: number;
  allServices: any[];
  onUpdate: (s: ScenarioState) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  isConfirmed: boolean;
  currency?: "USD" | "EUR" | "GBP" | "TRY";
}) {
  const utils = trpc.useUtils();
  const addScenarioMut = trpc.treatmentPlans.addScenario.useMutation({
    onSuccess: (d) => { onUpdate({ ...scenario, id: d.id, isDirty: false, isSaving: false }); utils.treatmentPlans.getByCase.invalidate(); toast.success("Scenario saved"); },
    onError: (e) => { onUpdate({ ...scenario, isSaving: false }); toast.error(e.message); },
  });
  const updateScenarioMut = trpc.treatmentPlans.updateScenario.useMutation({
    onSuccess: () => { onUpdate({ ...scenario, isDirty: false, isSaving: false }); utils.treatmentPlans.getByCase.invalidate(); toast.success("Scenario updated"); },
    onError: (e) => { onUpdate({ ...scenario, isSaving: false }); toast.error(e.message); },
  });
  const deleteScenarioMut = trpc.treatmentPlans.deleteScenario.useMutation({
    onSuccess: () => { utils.treatmentPlans.getByCase.invalidate(); onDelete(); toast.success("Scenario deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const duplicateScenarioMut = trpc.treatmentPlans.duplicateScenario.useMutation({
    onSuccess: () => { utils.treatmentPlans.getByCase.invalidate(); onDuplicate(); toast.success("Scenario duplicated"); },
    onError: (e) => toast.error(e.message),
  });
  const generateProposalMut = trpc.treatmentPlans.generateProposal.useMutation({
    onSuccess: (d) => toast.success(`Proposal ${d.proposalCode} created! It is now visible in the Proposals tab.`),
    onError: (e) => toast.error(`Failed to generate proposal: ${e.message}`),
  });
  const handleSave = () => {
    if (!scenario.title.trim()) { toast.error("Scenario title is required"); return; }
    onUpdate({ ...scenario, isSaving: true });
    const payload = { title: scenario.title, services: scenario.services };
    if (scenario.id) { updateScenarioMut.mutate({ id: scenario.id, ...payload }); }
    else { addScenarioMut.mutate({ planId, ...payload }); }
  };
  return (
    <Card className="border-border/60">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Input
            value={scenario.title}
            onChange={(e) => onUpdate({ ...scenario, title: e.target.value, isDirty: true })}
            placeholder="Scenario title (e.g. Scenario A: IVF with ICSI)"
            className="h-8 text-sm font-medium flex-1"
            disabled={isConfirmed}
          />
          {!isConfirmed && (
            <>
              <Button size="sm" variant="ghost" className="h-8 px-2" title="Duplicate"
                onClick={() => scenario.id && duplicateScenarioMut.mutate({ id: scenario.id })}
                disabled={!scenario.id || duplicateScenarioMut.isPending}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive" title="Delete"
                onClick={() => scenario.id ? deleteScenarioMut.mutate({ id: scenario.id }) : onDelete()}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {scenario.id && (
            <Button
              size="sm" variant="outline"
              className="h-8 px-2 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/10 flex-shrink-0"
              title="Generate Proposal from this scenario"
              onClick={() => generateProposalMut.mutate({ planId, scenarioId: scenario.id!, currency: currency ?? "USD" })}
              disabled={generateProposalMut.isPending}
            >
              {generateProposalMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Proposal</span>
            </Button>
          )}
        </div>
        <div className="space-y-2">
          {scenario.services.map((svc, idx) => (
            <ScenarioServiceRow
              key={idx}
              entry={svc}
              onChange={(updated) => {
                const services = [...scenario.services];
                services[idx] = updated;
                onUpdate({ ...scenario, services, isDirty: true });
              }}
              onRemove={() => onUpdate({ ...scenario, services: scenario.services.filter((_, i) => i !== idx), isDirty: true })}
              allServices={allServices}
            />
          ))}
          {!isConfirmed && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 w-full"
              onClick={() => onUpdate({ ...scenario, services: [...scenario.services, { serviceName: "", category: "procedure", isCustom: false }], isDirty: true })}
            >
              <Plus className="h-3 w-3" />Add Service
            </Button>
          )}
          {isConfirmed && scenario.services.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">No services in this scenario.</p>
          )}
        </div>
        {!isConfirmed && scenario.isDirty && (
          <div className="flex justify-end">
            <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSave} disabled={scenario.isSaving}>
              {scenario.isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save Scenario
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Q&A Section inside Treatment Plan ───────────────────────────────────────
function TreatmentPlanQASection({ type, id }: { type: "lead" | "patient"; id: number }) {
  const { data, isLoading, refetch } = trpc.doctorCases.getCase.useQuery({ type, id });
  const intake = data?.intake;
  const [showPrevious, setShowPrevious] = useState(false);
  const [selectedPrevious, setSelectedPrevious] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<{ female: Record<string, string>; male: Record<string, string> }>({ female: {}, male: {} });
  const [initialized, setInitialized] = useState(false);

  const patientQuestions: { female: string[]; male: string[] } = (() => {
    const raw = intake?.patientQuestions;
    if (!raw) return { female: [], male: [] };
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      female: Array.isArray(parsed?.female) ? parsed.female.filter(Boolean) : [],
      male: Array.isArray(parsed?.male) ? parsed.male.filter(Boolean) : [],
    };
  })();

  const existingAnswers: { female: Record<string, string>; male: Record<string, string> } = (() => {
    const raw = intake?.doctorAnswers;
    if (!raw) return { female: {}, male: {} };
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return { female: parsed?.female ?? {}, male: parsed?.male ?? {} };
  })();

  // Separate unanswered from previously answered
  const unansweredFemale = patientQuestions.female
    .map((q, i) => ({ q, i, gender: "female" as const }))
    .filter(({ i }) => !existingAnswers.female[String(i)]?.trim());
  const unansweredMale = patientQuestions.male
    .map((q, i) => ({ q, i, gender: "male" as const }))
    .filter(({ i }) => !existingAnswers.male[String(i)]?.trim());
  const answeredFemale = patientQuestions.female
    .map((q, i) => ({ q, i, gender: "female" as const, answer: existingAnswers.female[String(i)] }))
    .filter(({ answer }) => answer?.trim());
  const answeredMale = patientQuestions.male
    .map((q, i) => ({ q, i, gender: "male" as const, answer: existingAnswers.male[String(i)] }))
    .filter(({ answer }) => answer?.trim());

  const hasUnanswered = unansweredFemale.length > 0 || unansweredMale.length > 0;
  const hasPrevious = answeredFemale.length > 0 || answeredMale.length > 0;

  useEffect(() => {
    if (!initialized && intake) {
      setInitialized(true);
    }
  }, [intake, initialized]);

  const saveAnswers = trpc.doctorCases.saveDoctorAnswers.useMutation({
    onSuccess: () => { toast.success("Answers saved"); refetch(); setInitialized(false); },
    onError: (e) => toast.error(e.message || "Failed to save answers"),
  });

  const setAnswer = (gender: "female" | "male", idx: number, value: string) => {
    setAnswers(prev => ({ ...prev, [gender]: { ...prev[gender], [String(idx)]: value } }));
  };

  const handleSave = () => {
    // Merge new answers with existing answers
    const merged = {
      female: { ...existingAnswers.female, ...answers.female },
      male: { ...existingAnswers.male, ...answers.male },
    };
    saveAnswers.mutate({ type, id, doctorAnswers: merged });
  };

  const togglePreviousSelection = (key: string) => {
    setSelectedPrevious(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!intake || (!hasUnanswered && !hasPrevious)) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
        <HelpCircle className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No patient questions found.</p>
        <p className="text-xs text-muted-foreground mt-1">Questions are added by the patient in the Medical Intake form.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Area 1: Unanswered questions */}
      {hasUnanswered && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-sm font-semibold">Unanswered Questions</span>
            <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">
              {unansweredFemale.length + unansweredMale.length}
            </Badge>
          </div>
          {unansweredFemale.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <UserCircle2 className="h-3.5 w-3.5 text-pink-500" />
                <span className="text-xs font-medium text-pink-700 dark:text-pink-400">Wife's Questions</span>
              </div>
              {unansweredFemale.map(({ q, i }) => (
                <Card key={`uf-${i}`} className="border-amber-100 dark:border-amber-900/30">
                  <CardContent className="p-3 space-y-2">
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded px-3 py-2">
                      <p className="text-xs font-medium">{q}</p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Doctor's Answer:</label>
                      <Textarea
                        value={answers.female[String(i)] ?? ""}
                        onChange={e => setAnswer("female", i, e.target.value)}
                        placeholder="Type your answer here..."
                        className="text-sm min-h-[70px]"
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {unansweredMale.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <UserCircle2 className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Husband's Questions</span>
              </div>
              {unansweredMale.map(({ q, i }) => (
                <Card key={`um-${i}`} className="border-amber-100 dark:border-amber-900/30">
                  <CardContent className="p-3 space-y-2">
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded px-3 py-2">
                      <p className="text-xs font-medium">{q}</p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Doctor's Answer:</label>
                      <Textarea
                        value={answers.male[String(i)] ?? ""}
                        onChange={e => setAnswer("male", i, e.target.value)}
                        placeholder="Type your answer here..."
                        className="text-sm min-h-[70px]"
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <Button size="sm" className="gap-1.5 text-xs w-full" onClick={handleSave} disabled={saveAnswers.isPending}>
            {saveAnswers.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving...</> : <><Save className="h-3.5 w-3.5" />Save Answers</>}
          </Button>
        </div>
      )}

      {/* Area 2: Previously answered questions */}
      {hasPrevious && (
        <div className="space-y-2">
          <button
            onClick={() => setShowPrevious(v => !v)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {showPrevious ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Previously Answered Questions
            <Badge variant="secondary" className="text-xs ml-1">{answeredFemale.length + answeredMale.length}</Badge>
            <span className="text-xs text-muted-foreground ml-auto">Select to include in PDF</span>
          </button>
          {showPrevious && (
            <div className="space-y-2 pl-2 border-l-2 border-border/40">
              {[...answeredFemale.map(x => ({ ...x, genderLabel: "Wife", colorClass: "pink" })),
                ...answeredMale.map(x => ({ ...x, genderLabel: "Husband", colorClass: "blue" }))].map(({ q, i, gender, answer, genderLabel, colorClass }) => {
                const key = `${gender}-${i}`;
                const isSelected = selectedPrevious.has(key);
                return (
                  <div
                    key={key}
                    onClick={() => togglePreviousSelection(key)}
                    className={`cursor-pointer rounded-lg border p-3 space-y-1.5 transition-colors ${isSelected ? "border-primary/50 bg-primary/5" : "border-border/40 hover:border-border"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <UserCircle2 className={`h-3.5 w-3.5 text-${colorClass}-500`} />
                        <span className={`text-xs text-${colorClass}-600`}>{genderLabel}</span>
                      </div>
                      <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-primary border-primary" : "border-border"}`}>
                        {isSelected && <span className="text-primary-foreground text-[10px]">✓</span>}
                      </div>
                    </div>
                    <p className="text-xs font-medium text-foreground">{q}</p>
                    <p className="text-xs text-muted-foreground italic">{answer}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Treatment Plan Tab ──────────────────────────────────────────────────
export default function TreatmentPlanTab({ type, id }: { type: "lead" | "patient"; id: number }) {
  const utils = trpc.useUtils();
  const { data: planData, isLoading } = trpc.treatmentPlans.getByCase.useQuery({ type, id });
  const { data: allServicesData } = trpc.services.list.useQuery({});
  const allServices = allServicesData ?? [];
  const plan = planData?.plan as any;
  const planId = plan?.id as number | undefined;
  const [summary, setSummary] = useState("");
  const [summaryDirty, setSummaryDirty] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioState[]>([]);
  const [scenariosInit, setScenariosInit] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [pdfLang, setPdfLang] = useState("en");

  useEffect(() => {
    if (plan && !summaryDirty) setSummary(plan.clinicalSummary ?? "");
  }, [plan]);

  useEffect(() => {
    if (planData?.scenarios && !scenariosInit) {
      setScenarios(
        (planData.scenarios as any[]).map((s) => ({
          id: s.id,
          localId: s.id.toString(),
          title: s.title,
          services: (() => {
            try { const sv = typeof s.services === "string" ? JSON.parse(s.services) : (s.services ?? []); return Array.isArray(sv) ? sv : []; }
            catch { return []; }
          })(),
          isDirty: false,
          isSaving: false,
        }))
      );
      setScenariosInit(true);
    }
  }, [planData?.scenarios]);

  const upsertPlan = trpc.treatmentPlans.upsert.useMutation({
    onSuccess: () => { utils.treatmentPlans.getByCase.invalidate(); setSummaryDirty(false); toast.success("Treatment plan saved"); },
    onError: (e) => toast.error(e.message),
  });
  const confirmPlan = trpc.treatmentPlans.confirm.useMutation({
    onSuccess: () => { utils.treatmentPlans.getByCase.invalidate(); toast.success("Treatment plan confirmed"); },
    onError: (e) => toast.error(e.message),
  });
  const revisePlan = trpc.treatmentPlans.revise.useMutation({
    onSuccess: () => { utils.treatmentPlans.getByCase.invalidate(); setScenariosInit(false); toast.success("Plan unlocked for editing"); },
    onError: (e) => toast.error(e.message),
  });
  const transcribeMut = trpc.treatmentPlans.transcribeVoice.useMutation({
    onSuccess: (d) => { setSummary((prev) => (prev ? prev + "\n" + d.text : d.text)); setSummaryDirty(true); toast.success("Transcription complete"); },
    onError: (e) => toast.error(e.message || "Transcription failed"),
  });
  const rewriteMut = trpc.translations.rewriteWithAI.useMutation({
    onSuccess: (d) => { setSummary(d.rewritten); setSummaryDirty(true); toast.success("Rewritten successfully"); },
    onError: (e) => toast.error(e.message || "Rewrite failed"),
  });

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          transcribeMut.mutate({ audioBase64: base64, mimeType: "audio/webm" });
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch { toast.error("Microphone access denied"); }
  };

  const isConfirmed = plan?.status === "confirmed";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading treatment plan…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status + PDF */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Treatment Plan</span>
          {plan && (
            <Badge variant="outline" className={isConfirmed ? "border-green-400 text-green-700 text-xs" : "text-xs"}>
              {isConfirmed ? "Confirmed" : "Draft"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {plan && (
            <>
              <Select value={pdfLang} onValueChange={setPdfLang}>
                <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRANSLATE_LANGS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <a href={`/api/treatment-plans/${plan.id}/pdf?lang=${pdfLang}`} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <FileText className="h-3 w-3" />PDF
                </Button>
              </a>
              {isConfirmed && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={() => revisePlan.mutate({ planId: plan.id })}
                  disabled={revisePlan.isPending}
                >
                  {revisePlan.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
                  Revise
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Q&A Section */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-amber-500" />
          Patient Questions
        </Label>
        <TreatmentPlanQASection type={type} id={id} />
      </div>

      {/* Clinical Summary */}
      <div className="space-y-3 rounded-lg border border-border/60 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Label className="text-sm font-semibold">Clinical Summary</Label>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant={isRecording ? "destructive" : "outline"}
              className="h-7 text-xs gap-1"
              onClick={isRecording ? () => { mediaRecorderRef.current?.stop(); setIsRecording(false); } : handleStartRecording}
              disabled={transcribeMut.isPending || isConfirmed}
            >
              {transcribeMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : isRecording ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
              {transcribeMut.isPending ? "Transcribing..." : isRecording ? "Stop" : "Record"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => summary.trim() && rewriteMut.mutate({ text: summary })}
              disabled={!summary.trim() || rewriteMut.isPending || isConfirmed}
            >
              {rewriteMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Rewrite
            </Button>
          </div>
        </div>
        <Textarea
          value={summary}
          onChange={(e) => { setSummary(e.target.value); setSummaryDirty(true); }}
          placeholder="Enter clinical summary… or record voice and transcribe"
          rows={5}
          disabled={isConfirmed}
          className="text-sm"
        />
        <div className="flex justify-end gap-2">
          {!isConfirmed && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
              onClick={() => upsertPlan.mutate({ type, id, clinicalSummary: summary })}
              disabled={upsertPlan.isPending}
            >
              {upsertPlan.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {plan ? "Save Draft" : "Create Plan"}
            </Button>
          )}
          {planId && !isConfirmed && (
            <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700"
              onClick={() => confirmPlan.mutate({ planId })}
              disabled={confirmPlan.isPending}
            >
              {confirmPlan.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Confirm Plan
            </Button>
          )}
        </div>
      </div>

      {/* Scenarios */}
      {planId && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Treatment Scenarios</Label>
            {!isConfirmed && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                onClick={() => setScenarios((prev) => [...prev, { localId: `new-${Date.now()}`, title: "", services: [], isDirty: true, isSaving: false }])}
              >
                <Plus className="h-3 w-3" />Add Scenario
              </Button>
            )}
          </div>
          {scenarios.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6 border rounded-lg border-dashed">
              {isConfirmed ? "No scenarios were added to this plan." : "No scenarios yet. Click \"Add Scenario\" to start."}
            </div>
          ) : (
            <div className="space-y-3">
              {scenarios.map((s) => (
                <ScenarioCard
                  key={s.localId}
                  scenario={s}
                  planId={planId}
                  allServices={allServices}
                  isConfirmed={isConfirmed}
                  currency="USD"
                  onUpdate={(updated) => setScenarios((prev) => prev.map((x) => x.localId === s.localId ? updated : x))}
                  onDelete={() => setScenarios((prev) => prev.filter((x) => x.localId !== s.localId))}
                  onDuplicate={() => utils.treatmentPlans.getByCase.invalidate()}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
