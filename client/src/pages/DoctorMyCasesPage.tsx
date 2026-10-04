import { normaliseFileUrl } from "@/lib/fileUrl";
import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { fmtDate } from "@/lib/dateFormat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Briefcase,
  FileText,
  ClipboardList,
  MessageSquare,
  ChevronRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Phone,
  Globe,
  Mic,
  MicOff,
  Sparkles,
  Plus,
  Trash2,
  Copy,
  X,
  Save,
  CheckCircle2,
  Search,
  Download,
  Languages,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

import MedicalIntakeForm from "@/components/MedicalIntakeForm";
import CaseCommentsThread from "@/components/CaseCommentsThread";

// ─── Constants ────────────────────────────────────────────────────────────────
const TRANSLATE_LANGS = [
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

// ─── AI Translate Inline ──────────────────────────────────────────────────────
function AITranslateInline({ text }: { text: string }) {
  const [lang, setLang] = useState<"en" | "ar" | "tr">("en");
  const [result, setResult] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const translateMut = trpc.translations.translateText.useMutation({
    onSuccess: (d) => setResult(d.translated),
    onError: (e) => toast.error(e.message || "Translation failed"),
  });
  if (!text?.trim()) return null;
  return (
    <div className="mt-1">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Languages className="h-3 w-3" />AI Translate
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Select value={lang} onValueChange={(v) => setLang(v as any)}>
              <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRANSLATE_LANGS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm" className="h-7 text-xs gap-1"
              onClick={() => translateMut.mutate({ text, targetLanguage: lang })}
              disabled={translateMut.isPending}
            >
              {translateMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Translate
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => { setOpen(false); setResult(null); }}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          {result && (
            <div className="bg-muted/40 rounded-md p-3 text-xs whitespace-pre-wrap border max-h-48 overflow-y-auto">
              <p className="font-semibold text-muted-foreground mb-1 uppercase text-[10px]">
                {TRANSLATE_LANGS.find((l) => l.value === lang)?.label} Translation
              </p>
              {result}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Documents Column ─────────────────────────────────────────────────────────
// translationResults: { [docId]: { [lang]: string } }
function CaseDocumentsColumn({ documents }: { documents: any[] }) {
  // Per-doc translation results keyed by language
  const [translationResults, setTranslationResults] = useState<Record<number, Record<string, string>>>({});
  // Per-doc: which language tab is active
  const [activeLangTab, setActiveLangTab] = useState<Record<number, string>>({});
  // Per-doc: show translate controls
  const [showTranslate, setShowTranslate] = useState<Record<number, boolean>>({});
  // Per-doc: selected language in the picker
  const [pendingLang, setPendingLang] = useState<Record<number, string>>({});
  // Per-doc: which translation is currently loading
  const [loadingDocLang, setLoadingDocLang] = useState<Record<number, string | null>>({});

  const translateDoc = trpc.translations.translateLeadDocument.useMutation({
    onSuccess: (result, variables) => {
      if (result?.translatedText) {
        const lang = (variables as any)._lang as string;
        // BUG FIX: use the leadDocumentId from the REQUEST (variables), not result.id
        // result.id is the translation-row id which is unrelated to the document id
        const docId = (variables as any).leadDocumentId as number;
        setTranslationResults((prev) => ({
          ...prev,
          [docId]: { ...(prev[docId] ?? {}), [lang]: result.translatedText },
        }));
        setActiveLangTab((prev) => ({ ...prev, [docId]: lang }));
        setLoadingDocLang((prev) => ({ ...prev, [docId]: null }));
        toast.success("Translation complete");
      }
    },
    onError: (e, variables) => {
      const docId = (variables as any).leadDocumentId as number;
      setLoadingDocLang((prev) => ({ ...prev, [docId]: null }));
      toast.error(e.message || "Translation failed");
    },
  });

  function handleTranslate(doc: any, lang: string) {
    setLoadingDocLang((prev) => ({ ...prev, [doc.id]: lang }));
    translateDoc.mutate({
      leadDocumentId: doc.id,
      fileUrl: doc.fileUrl,
      fileName: doc.fileName ?? "document",
      mimeType: doc.fileType ?? undefined,
      targetLanguage: lang,
      patientId: 0,
      _lang: lang,
    } as any);
  }

  if (!documents || documents.length === 0) {
    return <div className="text-sm text-muted-foreground text-center py-8">No documents uploaded yet.</div>;
  }

  return (
    <div className="space-y-3">
      {documents.map((doc: any) => {
        const docTranslations = translationResults[doc.id] ?? {};
        const langKeys = Object.keys(docTranslations);
        const activeTab = activeLangTab[doc.id] ?? langKeys[0];
        const isShowingTranslate = showTranslate[doc.id] ?? false;
        const selectedLang = pendingLang[doc.id] ?? "en";
        const isLoading = loadingDocLang[doc.id] != null;

        return (
          <Card key={doc.id}>
            <CardContent className="p-3 space-y-2">
              {/* Document header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.fileName ?? doc.name ?? "Document"}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.createdAt ? fmtDate(doc.createdAt) : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {doc.fileUrl && (
                    <a href={normaliseFileUrl(doc.fileUrl ?? "")} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                        <Download className="h-3 w-3" />View
                      </Button>
                    </a>
                  )}
                  <Button
                    variant={isShowingTranslate ? "secondary" : "ghost"}
                    size="sm" className="h-7 px-2" title="Translate with AI"
                    onClick={() => setShowTranslate((prev) => ({ ...prev, [doc.id]: !isShowingTranslate }))}
                  >
                    <Globe className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Translate controls — shown when globe is clicked */}
              {isShowingTranslate && (
                <div className="flex items-center gap-2 pl-7">
                  <Select
                    value={selectedLang}
                    onValueChange={(v) => setPendingLang((prev) => ({ ...prev, [doc.id]: v }))}
                  >
                    <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TRANSLATE_LANGS.map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm" className="h-7 text-xs gap-1"
                    onClick={() => handleTranslate(doc, selectedLang)}
                    disabled={isLoading}
                  >
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {docTranslations[selectedLang] ? "Re-translate" : "Translate"}
                  </Button>
                </div>
              )}

              {/* Translation results — multi-language tabs */}
              {langKeys.length > 0 && (
                <div className="pl-7 mt-1">
                  {/* Language tabs */}
                  <div className="flex items-center gap-1 mb-2 flex-wrap">
                    {langKeys.map((lang) => (
                      <button
                        key={lang}
                        onClick={() => setActiveLangTab((prev) => ({ ...prev, [doc.id]: lang }))}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                          activeTab === lang
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                        }`}
                      >
                        {TRANSLATE_LANGS.find((l) => l.value === lang)?.label ?? lang.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  {/* Active translation content */}
                  {activeTab && docTranslations[activeTab] && (
                    <div className="bg-muted/40 rounded-md p-3 text-xs whitespace-pre-wrap max-h-56 overflow-y-auto border">
                      {docTranslations[activeTab]}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Tab 1: Medical Intake + Documents ───────────────────────────────────────
function MedicalIntakeAndDocumentsTab({ type, id, documents }: { type: "lead" | "patient"; id: number; documents: any[] }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Medical Intake</h3>
          <Badge variant="outline" className="text-[10px]">Read-only</Badge>
        </div>
        <MedicalIntakeForm mode={type} id={id} readOnly={true} />
      </div>
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Documents</h3>
        <CaseDocumentsColumn documents={documents} />
      </div>
    </div>
  );
}

// ─── Service Entry type ───────────────────────────────────────────────────────
interface ServiceEntry {
  serviceId?: number;
  serviceName: string;
  category: string;
  isCustom?: boolean;
  dosage?: string;
  frequency?: string;
  notes?: string;
}

// ─── Scenario Service Row ─────────────────────────────────────────────────────
function ScenarioServiceRow({ entry, onChange, onRemove, allServices }: {
  entry: ServiceEntry;
  onChange: (updated: ServiceEntry) => void;
  onRemove: () => void;
  allServices: any[];
}) {
  const isMedication = entry.category === "medicine";
  const filteredServices = useMemo(
    () => allServices.filter((s) => s.category === entry.category && s.status === "active"),
    [allServices, entry.category]
  );
  return (
    <div className="border rounded-lg p-3 space-y-2 bg-muted/10">
      <div className="flex items-center gap-2 flex-wrap">
        <Select
          value={entry.category}
          onValueChange={(v) => onChange({ ...entry, category: v, serviceId: undefined, serviceName: "", isCustom: false })}
        >
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            {SERVICE_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!entry.isCustom ? (
          <Select
            value={entry.serviceId?.toString() ?? ""}
            onValueChange={(v) => {
              if (v === "__custom__") {
                onChange({ ...entry, serviceId: undefined, serviceName: "", isCustom: true });
              } else {
                const svc = allServices.find((s) => s.id === Number(v));
                onChange({ ...entry, serviceId: Number(v), serviceName: svc?.name ?? "", isCustom: false });
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs flex-1 min-w-[160px]"><SelectValue placeholder="Select service…" /></SelectTrigger>
            <SelectContent>
              {filteredServices.map((s) => (
                <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
              ))}
              <SelectItem value="__custom__">+ Custom service</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <>
            <Input
              value={entry.serviceName}
              onChange={(e) => onChange({ ...entry, serviceName: e.target.value })}
              placeholder="Custom service name"
              className="h-8 text-xs flex-1 min-w-[160px]"
            />
            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => onChange({ ...entry, isCustom: false, serviceName: "", serviceId: undefined })}>
              List
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {isMedication && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-1">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Dosage</Label>
            <Input value={entry.dosage ?? ""} onChange={(e) => onChange({ ...entry, dosage: e.target.value })} placeholder="e.g. 500mg" className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Frequency / Timing</Label>
            <Input value={entry.frequency ?? ""} onChange={(e) => onChange({ ...entry, frequency: e.target.value })} placeholder="e.g. 2 tablets morning, 1 evening" className="h-7 text-xs" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Notes (incl. duration)</Label>
            <Input value={entry.notes ?? ""} onChange={(e) => onChange({ ...entry, notes: e.target.value })} placeholder="e.g. Take with food for 10 days, start Day 2 of cycle" className="h-7 text-xs" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Scenario Card ────────────────────────────────────────────────────────────
interface ScenarioState {
  id?: number;
  localId: string;
  title: string;
  services: ServiceEntry[];
  isDirty: boolean;
  isSaving: boolean;
}

function ScenarioCard({ scenario, planId, allServices, onUpdate, onDelete, onDuplicate }: {
  scenario: ScenarioState;
  planId: number;
  allServices: any[];
  onUpdate: (s: ScenarioState) => void;
  onDelete: () => void;
  onDuplicate: () => void;
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
          />
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
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 w-full"
            onClick={() => onUpdate({ ...scenario, services: [...scenario.services, { serviceName: "", category: "procedure", isCustom: false }], isDirty: true })}
          >
            <Plus className="h-3 w-3" />Add Service
          </Button>
        </div>
        {scenario.isDirty && (
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

// ─── Tab 2: Treatment Plan Builder ───────────────────────────────────────────
function TreatmentPlanBuilderTab({ type, id, initialPlanId }: { type: "lead" | "patient"; id: number; initialPlanId?: number | null }) {
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(initialPlanId ?? null);
  const { data: plans, isLoading: plansLoading, refetch: refetchPlans } = type === "lead"
    ? trpc.treatmentPlans.listByLead.useQuery({ leadId: id }, { staleTime: 0, refetchOnMount: "always" })
    : trpc.treatmentPlans.listByPatient.useQuery({ patientId: id }, { staleTime: 0, refetchOnMount: "always" });

  // Show plan list if no plan selected
  if (!selectedPlanId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Treatment Plans</h3>
            <p className="text-xs text-muted-foreground mt-0.5">All treatment plans for this patient</p>
          </div>
        </div>
        {plansLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading treatment plans...
          </div>
        ) : !plans || (plans as any[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <FileText className="h-10 w-10 opacity-30" />
            <p className="text-sm">No treatment plans yet.</p>
            <p className="text-xs">Staff can request a treatment plan from the patient record.</p>
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

  // Show plan detail
  return (
    <TreatmentPlanBuilderDetail
      planId={selectedPlanId}
      onBack={() => { setSelectedPlanId(null); refetchPlans(); }}
    />
  );
}

function TreatmentPlanBuilderDetail({ planId, onBack }: { planId: number; onBack: () => void }) {
  const utils = trpc.useUtils();
  const { data: planData, isLoading } = trpc.treatmentPlans.getById.useQuery({ planId }, { staleTime: 0, refetchOnMount: "always" });
  const { data: allServicesData } = trpc.services.list.useQuery({});
  const allServices = allServicesData ?? [];
  const plan = planData?.plan as any;
  const planIdFromData = plan?.id as number | undefined;

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

  const upsertPlan = trpc.treatmentPlans.upsertById.useMutation({
    onSuccess: () => { utils.treatmentPlans.getById.invalidate({ planId }); setSummaryDirty(false); toast.success("Treatment plan saved"); },
    onError: (e) => toast.error(e.message),
  });
  const confirmPlan = trpc.treatmentPlans.confirm.useMutation({
    onSuccess: () => { utils.treatmentPlans.getById.invalidate({ planId }); toast.success("Treatment plan confirmed"); },
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
        {plan && (
          <div className="flex items-center gap-1">
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
          </div>
        )}
      </div>

      {/* Clinical Summary */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Label className="text-sm font-semibold">Clinical Summary</Label>
          <div className="flex items-center gap-1">
            <Button
              size="sm" variant={isRecording ? "destructive" : "outline"} className="h-7 text-xs gap-1"
              onClick={isRecording ? () => { mediaRecorderRef.current?.stop(); setIsRecording(false); } : handleStartRecording}
              disabled={transcribeMut.isPending}
            >
              {transcribeMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : isRecording ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
              {transcribeMut.isPending ? "Transcribing…" : isRecording ? "Stop" : "Record"}
            </Button>
            <Button
              size="sm" variant="outline" className="h-7 text-xs gap-1"
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
              onClick={() => upsertPlan.mutate({ planId, clinicalSummary: summary })}
              disabled={upsertPlan.isPending}
            >
              {upsertPlan.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {plan ? "Save Draft" : "Create Plan"}
            </Button>
          )}
          {planIdFromData && !isConfirmed && (
            <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700"
              onClick={() => confirmPlan.mutate({ planId: planIdFromData })}
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
              No scenarios yet. Click "Add Scenario" to start.
            </div>
          ) : (
            <div className="space-y-3">
              {scenarios.map((s) => (
                <ScenarioCard
                  key={s.localId}
                  scenario={s}
                  planId={planId}
                  allServices={allServices}
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

// ─── Floating Chat Button ─────────────────────────────────────────────────────
function FloatingChatButton({ leadId, patientId }: { leadId?: number; patientId?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full bg-teal-600 hover:bg-teal-700 text-white shadow-lg flex items-center justify-center transition-colors"
        title="Case Discussion"
      >
        <MessageSquare className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md bg-background shadow-2xl flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-teal-600" />
                <span className="font-semibold text-sm">Case Discussion</span>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-hidden">
              <CaseCommentsThread leadId={leadId} patientId={patientId} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Case Detail View ─────────────────────────────────────────────────────────
function CaseDetailView({ type, id, onBack, initialPlanId }: { type: "lead" | "patient"; id: number; onBack: () => void; initialPlanId?: number | null }) {
  const { data, isLoading, error } = trpc.doctorCases.getCase.useQuery({ type, id });
  const [activeTab, setActiveTab] = useState(initialPlanId ? "treatment-plan" : "intake");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading case…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
        <AlertCircle className="h-8 w-8 text-destructive/60" />
        <p className="text-sm">{error?.message ?? "Case not found"}</p>
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />Back to cases</Button>
      </div>
    );
  }

  const { case: caseData, documents } = data;
  const fullName = `${(caseData as any).firstName ?? ""} ${(caseData as any).lastName ?? ""}`.trim();

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold truncate">{fullName}</h2>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <Badge variant="outline" className={`text-[10px] capitalize ${type === "patient" ? "border-teal-300 text-teal-600" : "border-purple-300 text-purple-600"}`}>
              {type}
            </Badge>
            {type === "patient" && (caseData as any).mrn && (
              <span className="text-xs text-muted-foreground">MRN: {(caseData as any).mrn}</span>
            )}
            {type === "lead" && (caseData as any).code && (
              <span className="text-xs text-muted-foreground">{(caseData as any).code}</span>
            )}
            {(caseData as any).phone && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />{(caseData as any).phone}
              </span>
            )}
            {(caseData as any).nationality && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Globe className="h-3 w-3" />{(caseData as any).nationality}
              </span>
            )}
          </div>
        </div>
        <Link href={type === "patient" ? `/patients/${id}` : `/doctor-case/${id}`}>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <FileText className="h-3.5 w-3.5" />Full Record
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-nowrap gap-1 h-auto w-full overflow-x-auto">
          <TabsTrigger value="intake" className="gap-1.5 text-xs flex-1">
            <ClipboardList className="h-3.5 w-3.5" />Medical Intake &amp; Docs
          </TabsTrigger>
          <TabsTrigger value="treatment-plan" className="gap-1.5 text-xs flex-1">
            <Sparkles className="h-3.5 w-3.5 text-purple-600" />Treatment Plan
          </TabsTrigger>
          <TabsTrigger value="discussion" className="gap-1.5 text-xs flex-1">
            <MessageSquare className="h-3.5 w-3.5 text-teal-600" />Case Discussion
          </TabsTrigger>
        </TabsList>

        <TabsContent value="intake" className="mt-4">
          <MedicalIntakeAndDocumentsTab type={type} id={id} documents={documents ?? []} />
        </TabsContent>

        <TabsContent value="treatment-plan" className="mt-4">
          <TreatmentPlanBuilderTab type={type} id={id} initialPlanId={initialPlanId} />
        </TabsContent>

        <TabsContent value="discussion" className="mt-4">
          <Card>
            <CaseCommentsThread
              leadId={type === "lead" ? id : undefined}
              patientId={type === "patient" ? id : undefined}
            />
          </Card>
        </TabsContent>
      </Tabs>

      {/* Floating chat (visible on Tab 1 and Tab 2) */}
      {activeTab !== "discussion" && (
        <FloatingChatButton
          leadId={type === "lead" ? id : undefined}
          patientId={type === "patient" ? id : undefined}
        />
      )}
    </div>
  );
}

// ─── Case List Item ───────────────────────────────────────────────────────────
function CaseListItem({ name, subLabel, type, status, date, onClick }: {
  name: string; subLabel: string; type: "lead" | "patient"; status: string; date: Date; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/40 last:border-0 text-left"
    >
      <div className={`h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0 ${type === "patient" ? "bg-teal-500" : "bg-purple-500"}`}>
        {name[0]?.toUpperCase() ?? "?"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{name}</p>
        <p className="text-xs text-muted-foreground truncate">{subLabel}</p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <Badge variant="outline" className={`text-[10px] capitalize ${type === "patient" ? "border-teal-300 text-teal-600" : "border-purple-300 text-purple-600"}`}>
          {type}
        </Badge>
        <span className="text-[10px] text-muted-foreground">{fmtDate(date)}</span>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground ml-1" />
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DoctorMyCasesPage() {
  const [, navigate] = useLocation();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const { data: plans, isLoading, refetch } = trpc.treatmentPlans.listByDoctor.useQuery(undefined, {
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "lead" | "patient">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const filteredPlans = useMemo(() => {
    if (!plans) return [];
    return (plans as any[]).filter((p: any) => {
      const name = p.leadFirstName
        ? `${p.leadFirstName} ${p.leadLastName ?? ""}`.trim()
        : `${p.patientFirstName ?? ""} ${p.patientLastName ?? ""}`.trim();
      const planType = p.leadId ? "lead" : "patient";
      const date = new Date(p.createdAt);
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (typeFilter !== "all" && planType !== typeFilter) return false;
      if (dateFrom && date < new Date(dateFrom)) return false;
      if (dateTo && date > new Date(dateTo + "T23:59:59")) return false;
      if (search && !name.toLowerCase().includes(search.toLowerCase()) && !(p.title ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [plans, statusFilter, typeFilter, dateFrom, dateTo, search]);

  // If a plan is selected, show the full case detail view
  if (selectedPlanId !== null) {
    const plan = (plans as any[] | undefined)?.find((p: any) => p.id === selectedPlanId);
    const caseType = plan?.leadId ? "lead" : "patient";
    const caseId = plan?.leadId ?? plan?.patientId;
    return (
      <div className="p-4 md:p-6">
        <Button variant="ghost" size="sm" onClick={() => { setSelectedPlanId(null); refetch(); }} className="gap-1.5 text-xs h-7 px-2 mb-4">
          <ArrowLeft className="h-3.5 w-3.5" />Back to My Treatment Plans
        </Button>
        {caseId && (
          <CaseDetailView type={caseType} id={caseId} onBack={() => { setSelectedPlanId(null); refetch(); }} initialPlanId={selectedPlanId} />
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-teal-500/15 flex items-center justify-center">
          <Briefcase className="h-5 w-5 text-teal-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">My Treatment Plans</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${filteredPlans.length} plan${filteredPlans.length !== 1 ? "s" : ""} assigned to you`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[160px] space-y-1">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Patient name or plan title…" className="h-8 text-xs pl-8" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="lead">Leads</SelectItem>
                  <SelectItem value="patient">Patients</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs w-36" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs w-36" />
            </div>
            {(statusFilter !== "all" || typeFilter !== "all" || dateFrom || dateTo || search) && (
              <Button size="sm" variant="ghost" className="h-8 text-xs gap-1 self-end"
                onClick={() => { setStatusFilter("all"); setTypeFilter("all"); setDateFrom(""); setDateTo(""); setSearch(""); }}
              >
                <X className="h-3 w-3" />Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Plan list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading treatment plans…
        </div>
      ) : filteredPlans.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {!plans || (plans as any[]).length === 0 ? "No treatment plans assigned to you yet." : "No plans match the current filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border/40">
            {filteredPlans.map((p: any) => {
              const patientName = p.leadFirstName
                ? `${p.leadFirstName} ${p.leadLastName ?? ""}`.trim()
                : `${p.patientFirstName ?? ""} ${p.patientLastName ?? ""}`.trim();
              const subLabel = p.leadCode ?? p.patientMrn ?? (p.leadId ? "Lead" : "Patient");
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => {
                    if (p.leadId) navigate(`/doctor-case/${p.leadId}?tab=treatment-plan`);
                    else if (p.patientId) navigate(`/patients/${p.patientId}?tab=treatment-plan`);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{p.title || `Treatment Plan #${p.id}`}</p>
                    <p className="text-xs text-muted-foreground truncate">{patientName} · {subLabel}</p>
                    {p.requestNotes && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-1">{p.requestNotes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-xs text-muted-foreground hidden sm:block">
                      {fmtDate(p.createdAt)}
                    </p>
                    <Badge variant="outline" className={p.status === "confirmed" ? "border-green-400 text-green-700 text-xs" : p.status === "sent" ? "border-blue-400 text-blue-700 text-xs" : "border-amber-400 text-amber-700 text-xs"}>
                      {p.status === "confirmed" ? "Confirmed" : p.status === "sent" ? "Sent" : "Draft"}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
