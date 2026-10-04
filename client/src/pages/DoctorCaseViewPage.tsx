import { normaliseFileUrl, openDicomViewer, isDicom } from "@/lib/fileUrl";
import { FileViewButton } from "@/components/FileViewButton";
/**
 * DoctorCaseViewPage — Case view for doctor-role users.
 * Doctors can see all medical info, answer Q&A questions from the medical intake, and view documents.
 * Accessed via /doctor-case/:leadId
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { fmtDate } from "@/lib/dateFormat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, User, Calendar, Phone, Mail, Globe, ClipboardList,
  MessageSquare, Loader2, AlertCircle, FileText, HelpCircle,
  Save, Download, Filter, UserCircle2, Stethoscope, Maximize2,
} from "lucide-react";
import CaseCommentsThread from "@/components/CaseCommentsThread";
import MedicalIntakeForm from "@/components/MedicalIntakeForm";
import SavedTranslationsPanel from "@/components/SavedTranslationsPanel";
import TreatmentPlanTab from "@/components/TreatmentPlanTab";
import { toast } from "sonner";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Infer the intake gender from the intakeSection string stored on a document.
 * Returns "male", "female", or "unknown".
 * "unknown" means the document was NOT uploaded from a gender-specific section
 * (e.g. it was uploaded from the general Documents tab directly).
 */
function inferDocGender(intakeSection?: string | null): "male" | "female" | "unknown" {
  if (!intakeSection) return "unknown";
  const s = intakeSection.toLowerCase();

  // Male-specific sections
  if (
    s.includes("semen") ||
    s.includes("sperm") ||
    s.includes("(male)") ||
    s === "hormone panel (male)" ||
    s === "genetic tests (male)" ||
    s === "previous surgeries (male)"
  ) return "male";

  // Female-specific sections
  if (
    s.includes("miscarriage") ||
    s.includes("surgical history") ||
    s.includes("previous tests") ||
    s.includes("art history") ||
    s.includes("pgt") ||
    s.includes("(female)") ||
    s === "hormone panel" ||
    s === "genetic tests" ||
    s === "previous surgeries"
  ) return "female";

  return "unknown";
}

// ── Q&A Tab ───────────────────────────────────────────────────────────────────
/**
 * Shows the patient questions from medicalIntake.patientQuestions
 * and lets the doctor type answers that are saved to medicalIntake.doctorAnswers.
 */
function QATab({ leadId, type }: { leadId: number; type: "lead" | "patient" }) {
  const { data, isLoading, refetch } = trpc.doctorCases.getCase.useQuery({ type, id: leadId });
  const intake = data?.intake;

  // Parse patientQuestions: { female: string[], male: string[] }
  const patientQuestions: { female: string[]; male: string[] } = (() => {
    const raw = intake?.patientQuestions;
    if (!raw) return { female: [], male: [] };
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      female: Array.isArray(parsed?.female) ? parsed.female.filter(Boolean) : [],
      male: Array.isArray(parsed?.male) ? parsed.male.filter(Boolean) : [],
    };
  })();

  const allQuestions = [
    ...patientQuestions.female.map((q, i) => ({ q, gender: "female" as const, idx: i })),
    ...patientQuestions.male.map((q, i) => ({ q, gender: "male" as const, idx: i })),
  ];

  // Parse existing doctorAnswers: { female: { "0": "ans" }, male: { "0": "ans" } }
  const [answers, setAnswers] = useState<{ female: Record<string, string>; male: Record<string, string> }>({ female: {}, male: {} });
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && intake) {
      const raw = intake.doctorAnswers;
      const parsed = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
      setAnswers({
        female: parsed?.female ?? {},
        male: parsed?.male ?? {},
      });
      setInitialized(true);
    }
  }, [intake, initialized]);

  const saveAnswers = trpc.doctorCases.saveDoctorAnswers.useMutation({
    onSuccess: () => { toast.success("Answers saved successfully"); refetch(); },
    onError: (e) => toast.error(e.message || "Failed to save answers"),
  });

  const handleSave = () => {
    saveAnswers.mutate({ type, id: leadId, doctorAnswers: answers });
  };

  const setAnswer = (gender: "female" | "male", idx: number, value: string) => {
    setAnswers(prev => ({
      ...prev,
      [gender]: { ...prev[gender], [String(idx)]: value },
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!intake) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <HelpCircle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No medical intake found for this case.</p>
          <p className="text-xs text-muted-foreground mt-1">The patient must complete the medical intake form first.</p>
        </CardContent>
      </Card>
    );
  }

  if (allQuestions.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <HelpCircle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No patient questions have been submitted yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Questions are added by the patient in the Medical Intake form under
            "Wife's Questions for the Doctor" and "Husband's Questions for the Doctor".
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Patient Questions</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {allQuestions.length} question{allQuestions.length !== 1 ? "s" : ""} from the medical intake
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 text-xs"
          onClick={handleSave}
          disabled={saveAnswers.isPending}
        >
          {saveAnswers.isPending ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving...</>
          ) : (
            <><Save className="h-3.5 w-3.5" />Save Answers</>
          )}
        </Button>
      </div>

      {/* Female questions */}
      {patientQuestions.female.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <UserCircle2 className="h-4 w-4 text-pink-500" />
            <span className="text-sm font-medium text-pink-700 dark:text-pink-400">Wife's Questions</span>
            <Badge variant="outline" className="text-xs border-pink-300 text-pink-600">{patientQuestions.female.length}</Badge>
          </div>
          {patientQuestions.female.map((q, i) => (
            <Card key={`f-${i}`} className="border-pink-100 dark:border-pink-900/30">
              <CardContent className="p-4 space-y-3">
                <div className="bg-pink-50 dark:bg-pink-950/20 border border-pink-100 dark:border-pink-900/30 rounded-md px-3 py-2">
                  <p className="text-xs font-medium text-foreground">{q}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Doctor's Answer:</label>
                  <Textarea
                    value={answers.female[String(i)] ?? ""}
                    onChange={e => setAnswer("female", i, e.target.value)}
                    placeholder="Type your answer here..."
                    className="text-sm min-h-[80px]"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Male questions */}
      {patientQuestions.male.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <UserCircle2 className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-400">Husband's Questions</span>
            <Badge variant="outline" className="text-xs border-blue-300 text-blue-600">{patientQuestions.male.length}</Badge>
          </div>
          {patientQuestions.male.map((q, i) => (
            <Card key={`m-${i}`} className="border-blue-100 dark:border-blue-900/30">
              <CardContent className="p-4 space-y-3">
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-md px-3 py-2">
                  <p className="text-xs font-medium text-foreground">{q}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Doctor's Answer:</label>
                  <Textarea
                    value={answers.male[String(i)] ?? ""}
                    onChange={e => setAnswer("male", i, e.target.value)}
                    placeholder="Type your answer here..."
                    className="text-sm min-h-[80px]"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Bottom save button */}
      <Button
        size="sm"
        className="gap-1.5 text-xs w-full"
        onClick={handleSave}
        disabled={saveAnswers.isPending}
      >
        {saveAnswers.isPending ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving...</>
        ) : (
          <><Save className="h-3.5 w-3.5" />Save All Answers</>
        )}
      </Button>
    </div>
  );
}

// ── Documents Tab ─────────────────────────────────────────────────────────────

function DocumentsTab({ leadId, type }: { leadId: number; type: "lead" | "patient" }) {
  const { data } = trpc.doctorCases.getCase.useQuery({ type, id: leadId });
  const documents = data?.documents ?? [];
  const [genderFilter, setGenderFilter] = useState<"all" | "female" | "male">("all");

  const filtered = documents.filter((d: any) => {
    if (genderFilter === "all") return true;
    const g = inferDocGender(d.intakeSection);
    // When filtering by male: show only male docs
    // When filtering by female: show only female docs
    // "unknown" docs are NOT shown when a specific gender filter is active
    return g === genderFilter;
  });

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Filter by intake:</span>
        <div className="flex gap-1">
          {(["all", "female", "male"] as const).map(g => (
            <Button
              key={g}
              size="sm"
              variant={genderFilter === g ? "default" : "outline"}
              className="h-7 text-xs px-3"
              onClick={() => setGenderFilter(g)}
            >
              {g === "all" ? `All (${documents.length})` : g === "female" ? `Wife (${documents.filter((d: any) => inferDocGender(d.intakeSection) === "female").length})` : `Husband (${documents.filter((d: any) => inferDocGender(d.intakeSection) === "male").length})`}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} document{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {genderFilter === "all" ? "No documents uploaded yet." : `No ${genderFilter === "female" ? "wife's" : "husband's"} documents found.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((d: any) => {
            const gender = inferDocGender(d.intakeSection);
            return (
              <Card key={d.id} className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{d.fileName}</span>
                        {d.tag && (
                          <Badge variant="secondary" className="text-xs font-normal">{d.tag}</Badge>
                        )}
                        {d.intakeSection && (
                          <Badge variant="outline" className="text-xs font-normal opacity-70">{d.intakeSection}</Badge>
                        )}
                        {gender !== "unknown" && (
                          <Badge
                            variant="outline"
                            className={`text-xs font-normal ${gender === "female" ? "border-pink-300 text-pink-700" : "border-blue-300 text-blue-700"}`}
                          >
                            {gender === "female" ? "Wife" : "Husband"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {fmtDate(d.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <FileViewButton
                        fileUrl={d.fileUrl}
                        fileName={d.fileName}
                        mimeType={d.mimeType}
                        label={d.tag || d.fileName}
                      />
                    </div>
                  </div>
                  {d.fileUrl && (
                    <div className="mt-2">
                      <SavedTranslationsPanel
                        leadDocumentId={d.id}
                        fileUrl={d.fileUrl}
                        fileName={d.fileName ?? "document"}
                        mimeType={d.mimeType}
                        patientId={0}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DoctorCaseViewPage({ leadId }: { leadId: number }) {
  const [location, navigate] = useLocation();
  // Read ?tab= from URL to pre-select a tab (e.g. ?tab=treatment-plan)
  const defaultTab = new URLSearchParams(location.split("?")[1] ?? "").get("tab") ?? "intake";

  const { data, isLoading, error } = trpc.doctorCases.getCase.useQuery({ type: "lead", id: leadId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading case…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="font-medium">Case not found</p>
          <p className="text-sm text-muted-foreground">This case may have been removed or you don't have access.</p>
          <Button variant="outline" onClick={() => navigate("/my-cases")}>
            <ArrowLeft className="h-4 w-4 mr-2" />Back to My Treatment Plans
          </Button>
        </div>
      </div>
    );
  }

  const lead = data.case;
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed Patient";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/my-cases")} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />My Treatment Plans
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <Badge variant="secondary" className="text-xs">Doctor view</Badge>
      </div>

      {/* Patient Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xl">{fullName}</CardTitle>
              <div className="flex flex-wrap gap-2 mt-1">
                {(lead as any).leadStatus && (
                  <Badge variant="secondary" className="text-xs capitalize">{(lead as any).leadStatus}</Badge>
                )}
                {(lead as any).leadSource && (
                  <Badge variant="outline" className="text-xs">{(lead as any).leadSource}</Badge>
                )}
                {(lead as any).code && (
                  <Badge variant="outline" className="text-xs font-mono">{(lead as any).code}</Badge>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {lead.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{lead.email}</span>
              </div>
            )}
            {lead.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4 flex-shrink-0" />
                <span>{lead.phone}</span>
              </div>
            )}
            {(lead as any).nationality && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Globe className="h-4 w-4 flex-shrink-0" />
                <span>{(lead as any).nationality}</span>
              </div>
            )}
            {lead.createdAt && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4 flex-shrink-0" />
                <span>Added {fmtDate(lead.createdAt)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue={defaultTab}>
        <TabsList className="w-full flex-wrap h-auto gap-1">
          <TabsTrigger value="intake" className="flex-1 gap-1.5 min-w-[120px]">
            <ClipboardList className="h-4 w-4" />Medical Intake
          </TabsTrigger>
          <TabsTrigger value="qa" className="flex-1 gap-1.5 min-w-[120px]">
            <HelpCircle className="h-4 w-4" />Q&amp;A
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex-1 gap-1.5 min-w-[120px]">
            <FileText className="h-4 w-4" />Documents
          </TabsTrigger>
          <TabsTrigger value="treatment-plan" className="flex-1 gap-1.5 min-w-[120px]">
            <Stethoscope className="h-4 w-4" />Treatment Plan
          </TabsTrigger>
          <TabsTrigger value="discussion" className="flex-1 gap-1.5 min-w-[120px]">
            <MessageSquare className="h-4 w-4" />Discussion
          </TabsTrigger>
        </TabsList>

        <TabsContent value="intake" className="mt-4">
          {/* Read-only medical intake — no edit buttons shown */}
          <MedicalIntakeForm mode="lead" id={leadId} readOnly />
        </TabsContent>

        <TabsContent value="qa" className="mt-4">
          <QATab leadId={leadId} type="lead" />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <DocumentsTab leadId={leadId} type="lead" />
        </TabsContent>

        <TabsContent value="treatment-plan" className="mt-4">
          <TreatmentPlanTab type="lead" id={leadId} />
        </TabsContent>

        <TabsContent value="discussion" className="mt-4">
          <Card>
            <CaseCommentsThread leadId={leadId} />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
