import React, { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { useDraftForm } from "@/hooks/useDraftForm";
import {
  FileText, Plus, Trash2, Download, Mail, MessageSquare, Loader2,
  Mic, MicOff, Upload, X, Sparkles, Edit, Globe, ChevronDown, ChevronUp,
  LockKeyhole, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { isValidExternalReportDate } from "@shared/externalReportDate";
import { istanbulDateTimeToUtc } from "@shared/availabilityFoundation";
import { StructuredExternalReportReview, type StructuredExternalReportDocument } from "./StructuredExternalReportReview";
import { ExternalReportV2Workspace } from "./ExternalReportV2Workspace";
import { useAuth } from "@/_core/hooks/useAuth";

interface ExternalReportsTabProps {
  patientId: number;
  patientPhone: string;
  patientEmail: string;
}

const REPORT_TYPE_NOT_SPECIFIED = "not_specified";

const REPORT_TYPES = [
  "Blood Test", "Semen Analysis", "Embryology Report", "Ultrasound / Radiology",
  "Mammography", "HSG (Hysterosalpingography)", "Pathology Report", "Hormonal Profile",
  "Genetic Report", "Sperm DNA Fragmentation", "Immunology Report", "Other",
];

const PROCESSING_GOALS = [
  { value: "translate", label: "Translate" },
  { value: "simplify", label: "Simplify for Patient" },
  { value: "translate_simplify", label: "Translate & Simplify" },
  { value: "format_only", label: "Format Only" },
  { value: "summarize", label: "Summarize" },
] as const;

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "tr", label: "Turkish" },
] as const;

type ProcessingGoal = typeof PROCESSING_GOALS[number]["value"];
type TargetLanguage = "en" | "ar" | "tr" | "source";
type SourceLanguage = "en" | "ar" | "tr" | "und";
type InputMethod = "text" | "voice" | "files";

type ExternalReportForm = {
  reportType: string;
  sourceOrganization: string;
  reportDate: string;
  originalContent: string;
  processedContent: string;
  processingGoal: ProcessingGoal;
  requestedTargetLanguage: TargetLanguage;
  sourceLanguage: SourceLanguage;
  otherType: string;
};

type PendingSourceFile = {
  file: File;
  tag: string;
  password: string;
};

export function removeExternalReportSourceFile<T>(entries: T[], index: number) {
  return entries.filter((_, currentIndex) => currentIndex !== index);
}

export async function buildExternalReportSourceAssetPayload(entries: PendingSourceFile[]) {
  return Promise.all(entries.map(async (entry) => {
    const bytes = new Uint8Array(await entry.file.arrayBuffer());
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return {
      fileBase64: btoa(binary),
      fileName: entry.file.name,
      mimeType: entry.file.type || "application/octet-stream",
      tag: entry.tag.trim(),
      documentPassword: entry.password || undefined,
    };
  }));
}

function emptyForm(): ExternalReportForm {
  return {
    reportType: REPORT_TYPE_NOT_SPECIFIED,
    sourceOrganization: "",
    reportDate: format(new Date(), "yyyy-MM-dd"),
    originalContent: "",
    processedContent: "",
    processingGoal: "translate",
    requestedTargetLanguage: "en",
    sourceLanguage: "und",
    otherType: "",
  };
}

function goalLabel(goal?: string | null, legacyNote?: string | null) {
  if (goal) return PROCESSING_GOALS.find((item) => item.value === goal)?.label ?? goal;
  const legacy: Record<string, string> = {
    translated: "Translated", simplified: "Simplified for patient", translated_simplified: "Translated & Simplified",
    formatted: "Formatted", summarized: "Summarized",
  };
  return legacy[legacyNote ?? ""] ?? legacyNote ?? "Legacy report";
}

function outputLanguageLabel(language?: string | null) {
  return LANGUAGE_OPTIONS.find((option) => option.value === language)?.label ?? "Source language";
}

export function ExternalReportsTab({ patientId, patientPhone, patientEmail }: ExternalReportsTabProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const [qaWorkspace, setQaWorkspace] = useState<"current" | "v2">("current");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<any | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [sendEmailDialogId, setSendEmailDialogId] = useState<number | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [sendEmailAttachPdf, setSendEmailAttachPdf] = useState(true);
  const [sendEmailAttachOriginals, setSendEmailAttachOriginals] = useState(false);
  const [sendWaDialogId, setSendWaDialogId] = useState<number | null>(null);

  const { data: reports = [], isLoading } = trpc.externalReports.list.useQuery({ patientId });
  const deleteReport = trpc.externalReports.delete.useMutation({
    onSuccess: (result) => {
      utils.externalReports.list.invalidate({ patientId });
      if (result.storageCleanupPending) {
        toast.error("Report deleted, but source-object cleanup is pending. No report data remains linked.");
      } else {
        toast.success("Report deleted.");
      }
      setDeleteConfirmId(null);
    },
    onError: () => toast.error("We could not delete this report. Please try again."),
  });
  const sendEmailMutation = trpc.externalReports.sendEmail.useMutation({
    onSuccess: () => { toast.success("Report sent via email."); setSendEmailDialogId(null); },
    onError: () => toast.error("We could not send this report by email. Please try again."),
  });
  const sendWhatsAppMutation = trpc.externalReports.sendWhatsApp.useMutation({
    onSuccess: () => { toast.success("Report sent via WhatsApp."); setSendWaDialogId(null); },
    onError: () => toast.error("We could not send this report by WhatsApp. Please try again."),
  });

  const closeEditor = () => {
    setDialogOpen(false);
    setEditingReport(null);
  };

  if (isAdmin && qaWorkspace === "v2") {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50/60 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-violet-900 dark:bg-violet-950/20">
          <div>
            <Badge className="mb-2 bg-violet-700 text-white hover:bg-violet-700">External Reports V2 — QA</Badge>
            <h3 className="text-base font-semibold">Admin-only V2 manual QA</h3>
            <p className="text-xs text-muted-foreground">One AI request per click. The current engine remains available as the immediate rollback path.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => setQaWorkspace("current")}>Return to current engine</Button>
        </div>
        <ExternalReportV2Workspace patientId={patientId} onFinalized={() => void utils.externalReports.list.invalidate({ patientId })} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">External Reports</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Patient-ready external reports with retained source context</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {isAdmin && <Button type="button" size="sm" variant="outline" className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300" onClick={() => setQaWorkspace("v2")}><Sparkles className="mr-1.5 h-3.5 w-3.5" />External Reports V2 — QA</Button>}
          <Button size="sm" onClick={() => { setEditingReport(null); setDialogOpen(true); }} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New Report
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading reports...</div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><FileText className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="text-sm">No external reports yet.</p><p className="text-xs mt-1">Create a source-backed, AI-assisted report.</p></div>
      ) : (
        <div className="space-y-3">
          {(reports as any[]).map((report) => (
            <div key={report.id} className="border rounded-lg bg-card">
              <div className="flex items-start justify-between p-4 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {report.reportType && <Badge variant="secondary" className="text-xs">{report.reportType}</Badge>}
                    <Badge variant="outline" className="text-xs">{goalLabel(report.processingGoal, report.processingNote)}</Badge>
                    {(report.resolvedOutputLanguage ?? report.language) && (
                      <Badge variant="outline" className="text-xs gap-1"><Globe className="h-2.5 w-2.5" />{outputLanguageLabel(report.resolvedOutputLanguage ?? report.language)}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{report.reportDate ? format(new Date(report.reportDate), "dd MMM yyyy") : ""}</span>
                  </div>
                  {report.sourceOrganization && <p className="text-xs text-muted-foreground mt-1">Source: {report.sourceOrganization}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5">Ref: {report.reportRef ?? `EXT-${String(report.id).padStart(5, "0")}`}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Export PDF" onClick={() => window.open(`/api/external-reports/${report.id}/pdf`, "_blank")}><Download className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Send via Email" onClick={() => { setSendEmailDialogId(report.id); setEmailTo(patientEmail); }}><Mail className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" title="Send via WhatsApp" onClick={() => setSendWaDialogId(report.id)}><MessageSquare className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={() => { setEditingReport(report); setDialogOpen(true); }}><Edit className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Delete" onClick={() => setDeleteConfirmId(report.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" title={expandedId === report.id ? "Collapse" : "Expand"} onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}>{expandedId === report.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</Button>
                </div>
              </div>
              {expandedId === report.id && (
                <div className="border-t px-4 py-3 space-y-3">
                  {report.processedContent && <ProcessedDocumentPreview document={report.processedDocument} fallbackContent={report.processedContent} />}
                  {report.originalContent && <ContentSection title="Original Source Content" content={report.originalContent} muted />}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeEditor(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {dialogOpen && (
            <ExternalReportEditor
              key={editingReport?.id ?? "new"}
              patientId={patientId}
              existingReport={editingReport}
              onSaved={() => { utils.externalReports.list.invalidate({ patientId }); closeEditor(); }}
              onCancel={closeEditor}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Delete Report?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">This action cannot be undone.</p><DialogFooter><Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>Cancel</Button><Button variant="destructive" size="sm" disabled={deleteReport.isPending} onClick={() => deleteConfirmId && deleteReport.mutate({ id: deleteConfirmId })}>{deleteReport.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}Delete</Button></DialogFooter></DialogContent>
      </Dialog>

      {(() => {
        const emailReport = sendEmailDialogId ? (reports as any[]).find((item) => item.id === sendEmailDialogId) : null;
        return <Dialog open={sendEmailDialogId !== null} onOpenChange={(open) => { if (!open) { setSendEmailDialogId(null); setSendEmailAttachOriginals(false); setSendEmailAttachPdf(true); } }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2"><Mail className="h-4 w-4 text-sky-600" /> Send Report via Email</DialogTitle></DialogHeader>{emailReport && <div className="space-y-4 py-2"><div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1"><p><span className="text-muted-foreground">Reference:</span> <strong>{emailReport.reportRef ?? `EXT-${String(emailReport.id).padStart(5, "0")}`}</strong></p><p><span className="text-muted-foreground">Type:</span> <strong>{emailReport.reportType}</strong></p>{emailReport.sourceOrganization && <p><span className="text-muted-foreground">Source:</span> <strong>{emailReport.sourceOrganization}</strong></p>}</div><div className="space-y-1.5"><Label className="text-xs">Email Address <span className="text-destructive">*</span></Label><Input className="h-8 text-xs" type="email" value={emailTo} onChange={(event) => setEmailTo(event.target.value)} placeholder="patient@email.com" /></div><div className="flex items-center gap-2"><input type="checkbox" id="ext-attach-pdf" checked={sendEmailAttachPdf} onChange={(event) => setSendEmailAttachPdf(event.target.checked)} className="h-4 w-4" /><label htmlFor="ext-attach-pdf" className="text-sm cursor-pointer">Attach generated PDF to email</label></div>{emailReport.originalFiles && JSON.parse(emailReport.originalFiles ?? "[]").length > 0 && <div className="flex items-center gap-2"><input type="checkbox" id="ext-attach-originals" checked={sendEmailAttachOriginals} onChange={(event) => setSendEmailAttachOriginals(event.target.checked)} className="h-4 w-4" /><label htmlFor="ext-attach-originals" className="text-sm cursor-pointer">Attach original files</label></div>}</div>}<DialogFooter><Button variant="outline" size="sm" onClick={() => setSendEmailDialogId(null)}>Cancel</Button><Button size="sm" disabled={sendEmailMutation.isPending || !emailTo.trim()} onClick={() => sendEmailDialogId && sendEmailMutation.mutate({ reportId: sendEmailDialogId, patientId, toEmail: emailTo.trim(), publicBaseUrl: window.location.origin, attachPdf: sendEmailAttachPdf, includeOriginalFiles: sendEmailAttachOriginals })}>{sendEmailMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Mail className="h-3.5 w-3.5 mr-1" />}Send Email</Button></DialogFooter></DialogContent></Dialog>;
      })()}

      <Dialog open={sendWaDialogId !== null} onOpenChange={(open) => { if (!open) setSendWaDialogId(null); }}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Send Report via WhatsApp</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">The PDF report will be sent to the patient&apos;s registered WhatsApp number{patientPhone ? ` (${patientPhone})` : ""}.</p>{!patientPhone && <p className="text-xs text-destructive">No phone number registered for this patient.</p>}<DialogFooter><Button variant="outline" size="sm" onClick={() => setSendWaDialogId(null)}>Cancel</Button><Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={sendWhatsAppMutation.isPending || !patientPhone} onClick={() => sendWaDialogId && sendWhatsAppMutation.mutate({ reportId: sendWaDialogId, patientId, toPhone: patientPhone, publicBaseUrl: window.location.origin })}>{sendWhatsAppMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <MessageSquare className="h-3.5 w-3.5 mr-1" />}Send</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}

function ContentSection({ title, content, muted = false }: { title: string; content: string; muted?: boolean }) {
  return <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{title}</p><p className={`text-sm whitespace-pre-wrap ${muted ? "text-muted-foreground" : ""}`}>{content}</p></div>;
}

/**
 * Phase B consumes only the server-validated block document. Current and historical content
 * resolves to legacy_text, so this intentionally does not reconstruct tables or alter PDF output.
 */
function ProcessedDocumentPreview({ document, fallbackContent }: { document?: any; fallbackContent: string }) {
  const resolvedDocument: StructuredExternalReportDocument = Array.isArray(document?.blocks)
    ? document as StructuredExternalReportDocument
    : { version: 1, language: "und", blocks: [{ type: "legacy_text", text: fallbackContent }] };
  return <div className="space-y-2"><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Processed / Patient-ready Content</p><StructuredExternalReportReview document={resolvedDocument} /></div>;
}

function ExternalReportEditor({ patientId, existingReport, onSaved, onCancel }: { patientId: number; existingReport: any | null; onSaved: () => void; onCancel: () => void }) {
  const isEditing = Boolean(existingReport);
  const initialData = useMemo<ExternalReportForm>(() => {
    if (!existingReport) return emptyForm();
    const persistedType = existingReport.reportType?.trim() ?? "";
    const isSemanticallyAbsentType = !persistedType || persistedType.toLowerCase() === "not specified";
    const knownType = REPORT_TYPES.includes(persistedType);
    const legacyGoal: Record<string, ProcessingGoal> = { translated: "translate", simplified: "simplify", translated_simplified: "translate_simplify", formatted: "format_only", summarized: "summarize" };
    const savedGoal = existingReport.processingGoal as ProcessingGoal | undefined;
    return {
      reportType: isSemanticallyAbsentType ? REPORT_TYPE_NOT_SPECIFIED : (knownType ? persistedType : "Other"),
      sourceOrganization: existingReport.sourceOrganization ?? "",
      reportDate: existingReport.reportDate ? format(new Date(existingReport.reportDate), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
      originalContent: existingReport.originalContent ?? "",
      processedContent: existingReport.processedContent ?? "",
      processingGoal: PROCESSING_GOALS.some((goal) => goal.value === savedGoal) ? savedGoal! : (legacyGoal[existingReport.processingNote] ?? "translate"),
      requestedTargetLanguage: existingReport.requestedTargetLanguage ?? (existingReport.resolvedOutputLanguage ?? existingReport.language ?? "en"),
      // A report's output language is never used as a proxy for source language.
      // Existing reports obtain source language from their immutable revision below.
      sourceLanguage: "und",
      otherType: knownType || isSemanticallyAbsentType ? "" : persistedType,
    };
  }, [existingReport]);
  const { form, setForm, clearDraft } = useDraftForm({ key: `external-report-${patientId}-${existingReport?.id ?? "new"}`, initialData });
  const [inputMethod, setInputMethod] = useState<InputMethod>("text");
  const [uploadedFiles, setUploadedFiles] = useState<PendingSourceFile[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [hasUserEdited, setHasUserEdited] = useState(false);
  const [isPreparingSourceAssets, setIsPreparingSourceAssets] = useState(false);
  const [processedDocument, setProcessedDocument] = useState<StructuredExternalReportDocument | null>(existingReport?.processedDocument ?? null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const sourceRevisions = trpc.externalReports.sourceRevisions.useQuery(
    { reportId: existingReport?.id ?? 0 },
    { enabled: isEditing },
  );
  const activeSourceRevision = sourceRevisions.data?.[0] ?? null;
  const effectiveSourceLanguage: SourceLanguage = activeSourceRevision?.sourceLanguage === "en" || activeSourceRevision?.sourceLanguage === "ar" || activeSourceRevision?.sourceLanguage === "tr"
    ? activeSourceRevision.sourceLanguage
    : form.sourceLanguage;
  const effectiveSourceText = activeSourceRevision?.sourceText ?? form.originalContent;
  const processingSelectionRef = useRef(`${form.processingGoal}:${form.requestedTargetLanguage}`);

  useEffect(() => {
    const nextSelection = `${form.processingGoal}:${form.requestedTargetLanguage}`;
    if (processingSelectionRef.current !== nextSelection) {
      processingSelectionRef.current = nextSelection;
      setProcessedDocument(null);
    }
  }, [form.processingGoal, form.requestedTargetLanguage]);

  useBeforeUnload(hasUserEdited);

  const updateForm = (updater: (previous: ExternalReportForm) => ExternalReportForm) => {
    setHasUserEdited(true);
    setForm(updater);
  };
  const requiresTargetLanguage = form.processingGoal === "translate" || form.processingGoal === "translate_simplify";
  const showsSummaryLanguage = form.processingGoal === "summarize";

  const createReport = trpc.externalReports.create.useMutation({
    onSuccess: () => { clearDraft(); toast.success("External Report saved."); onSaved(); },
    onError: () => toast.error("We could not save the External Report. Please try again."),
  });
  const updateReport = trpc.externalReports.update.useMutation({
    onSuccess: () => { clearDraft(); toast.success("External Report updated."); onSaved(); },
    onError: () => toast.error("We could not update the External Report. Please try again."),
  });
  const processWithAI = trpc.externalReports.processWithAI.useMutation({
    onSuccess: (data) => {
      setProcessedDocument((data.processedDocument ?? null) as StructuredExternalReportDocument | null);
      updateForm((previous) => ({ ...previous, processedContent: String(data.processedContent ?? ""), requestedTargetLanguage: (data.requestedTargetLanguage ?? "source") as TargetLanguage }));
      toast.success("AI processing complete. Review the patient-ready content before finalizing.");
    },
    onError: () => toast.error("AI processing could not be completed. The source content was not changed."),
  });
  const transcribeVoice = trpc.externalReports.transcribeVoice.useMutation({
    onSuccess: (data) => { updateForm((previous) => ({ ...previous, originalContent: (previous.originalContent ? `${previous.originalContent}\n` : "") + data.text, processedContent: "" })); toast.success("Voice transcription added to the source content."); },
    onError: () => toast.error("Voice transcription could not be completed. Please try again."),
  });
  const extractFromFiles = trpc.externalReports.extractFromFiles.useMutation({
    onSuccess: (data) => { updateForm((previous) => ({ ...previous, originalContent: String(data.extractedText ?? ""), processedContent: "" })); toast.success("Source text extracted. Review it before processing."); },
    onError: () => toast.error("Source text could not be extracted. No source text was changed."),
  });

  const cancel = () => {
    mediaRecorderRef.current?.stop();
    clearDraft();
    onCancel();
  };

  const handleSave = async () => {
    if (!form.originalContent.trim()) { toast.error("Original source content is required."); return; }
    if (!form.processedContent.trim()) { toast.error("Processed / patient-ready content is required."); return; }
    if (form.reportType === "Other" && !form.otherType.trim()) { toast.error("Please specify the report type."); return; }
    if (!isValidExternalReportDate(form.reportDate)) { toast.error("Enter a valid report date from 1900 to today."); return; }
    if (requiresTargetLanguage && (form.requestedTargetLanguage === "source" || !form.requestedTargetLanguage)) { toast.error("Select a target language for this processing goal."); return; }
    const reportType = form.reportType === "Other"
      ? form.otherType.trim()
      : form.reportType === REPORT_TYPE_NOT_SPECIFIED ? undefined : form.reportType;
    const base = {
      reportType,
      sourceOrganization: form.sourceOrganization.trim() || undefined,
      reportDate: form.reportDate ? istanbulDateTimeToUtc(form.reportDate, "12:00:00") : undefined,
      processedContent: form.processedContent.trim(),
      processingGoal: form.processingGoal,
      requestedTargetLanguage: form.requestedTargetLanguage,
      sourceLanguage: effectiveSourceLanguage,
      processedDocument: processedDocument ?? undefined,
      status: "final" as const,
    };
    if (isEditing) {
      updateReport.mutate({ id: existingReport.id, ...base });
    } else {
      setIsPreparingSourceAssets(true);
      try {
        const sourceAssets = await buildExternalReportSourceAssetPayload(uploadedFiles);
        if (sourceAssets.some((asset) => !asset.tag)) { toast.error("Each source file needs a label."); return; }
        createReport.mutate({ patientId, ...base, originalContent: form.originalContent.trim(), sourceInputMethod: inputMethod, sourceAssets: sourceAssets.length ? sourceAssets : undefined });
      } catch {
        toast.error("Unable to prepare the selected source files. Please try again.");
      } finally {
        setIsPreparingSourceAssets(false);
      }
    }
  };

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (blob.size > 16 * 1024 * 1024) { toast.error("Recording is too large (maximum 16 MB)."); return; }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
        transcribeVoice.mutate({ audioBase64: btoa(binary), mimeType: "audio/webm", language: form.sourceLanguage === "und" ? undefined : form.sourceLanguage });
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch { toast.error("Microphone access was not granted."); }
  }

  function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(event.target.files ?? []).map((file, index) => ({ file, tag: `ExternalReport-${String(uploadedFiles.length + index + 1).padStart(2, "0")}`, password: "" }));
    setUploadedFiles((previous) => [...previous, ...newFiles]);
    event.target.value = "";
  }

  async function extractFiles() {
    if (!uploadedFiles.length) { toast.error("Select at least one source file."); return; }
    const files = await Promise.all(uploadedFiles.map(async (entry) => {
      const file = entry.file;
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
      return { fileBase64: btoa(binary), fileName: file.name, mimeType: file.type || "application/octet-stream", documentPassword: entry.password || undefined };
    }));
    extractFromFiles.mutate({ files, reportType: form.reportType === "Other" ? form.otherType : form.reportType === REPORT_TYPE_NOT_SPECIFIED ? undefined : form.reportType });
  }

  const process = () => {
    if (!effectiveSourceText.trim()) { toast.error("Provide and review the original source content before processing."); return; }
    if (requiresTargetLanguage && form.requestedTargetLanguage === "source") { toast.error("Select a target language for this processing goal."); return; }
    processWithAI.mutate({ rawText: effectiveSourceText, processingGoal: form.processingGoal, requestedTargetLanguage: form.requestedTargetLanguage, sourceLanguage: effectiveSourceLanguage, reportType: form.reportType === "Other" ? form.otherType : form.reportType === REPORT_TYPE_NOT_SPECIFIED ? undefined : form.reportType, sourceOrganization: form.sourceOrganization || undefined });
  };

  const isSaving = createReport.isPending || updateReport.isPending || isPreparingSourceAssets;
  return <>
    <DialogHeader><DialogTitle>{isEditing ? "Review External Report" : "New External Report"}</DialogTitle></DialogHeader>
    <div className="space-y-5 py-2">
      <FormSection title="1. Source" description={isEditing ? "The retained source is read-only in this Phase A–B workflow." : "Capture the original report before generating patient-ready content."}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldLabel label="Report Type"><Select value={form.reportType} onValueChange={(value) => updateForm((previous) => ({ ...previous, reportType: value, otherType: value === "Other" ? previous.otherType : "" }))}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={REPORT_TYPE_NOT_SPECIFIED}>Not specified</SelectItem>{REPORT_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></FieldLabel>
          <FieldLabel label="Report Date"><Input type="date" className="h-9 text-sm" value={form.reportDate} onChange={(event) => updateForm((previous) => ({ ...previous, reportDate: event.target.value }))} /></FieldLabel>
          {form.reportType === "Other" && <FieldLabel label="Specify Report Type *"><Input className="h-9 text-sm" value={form.otherType} onChange={(event) => updateForm((previous) => ({ ...previous, otherType: event.target.value }))} /></FieldLabel>}
          <FieldLabel label="Source Organization"><Input className="h-9 text-sm" placeholder="e.g. Istanbul Lab" value={form.sourceOrganization} onChange={(event) => updateForm((previous) => ({ ...previous, sourceOrganization: event.target.value }))} /></FieldLabel>
            <FieldLabel label="Source Language (if known)"><Select value={form.sourceLanguage} disabled={isEditing} onValueChange={(value) => updateForm((previous) => ({ ...previous, sourceLanguage: value as SourceLanguage }))}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="und">Unknown / detect from source</SelectItem>{LANGUAGE_OPTIONS.map((language) => <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>)}</SelectContent></Select></FieldLabel>
        </div>
        {!isEditing && <div className="space-y-3 pt-1"><div><Label className="text-xs mb-2 block">Input Method</Label><div className="flex flex-wrap gap-2">{(["text", "voice", "files"] as InputMethod[]).map((method) => <Button type="button" key={method} size="sm" variant={inputMethod === method ? "default" : "outline"} className="h-8 text-xs capitalize gap-1.5" onClick={() => setInputMethod(method)}>{method === "text" && <FileText className="h-3 w-3" />}{method === "voice" && <Mic className="h-3 w-3" />}{method === "files" && <Upload className="h-3 w-3" />}{method}</Button>)}</div></div>{inputMethod === "text" && <SourceTextarea form={form} updateForm={updateForm} onSourceEdited={() => setProcessedDocument(null)} />}{inputMethod === "voice" && <div className="space-y-2"><div className="flex items-center gap-3">{!isRecording ? <Button type="button" size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={startRecording} disabled={transcribeVoice.isPending}><Mic className="h-3.5 w-3.5 text-red-500" />{transcribeVoice.isPending ? "Transcribing..." : "Start Recording"}</Button> : <Button type="button" size="sm" variant="destructive" className="gap-1.5 h-8 text-xs" onClick={() => { mediaRecorderRef.current?.stop(); setIsRecording(false); }}><MicOff className="h-3.5 w-3.5" />Stop Recording</Button>}{isRecording && <span className="text-xs text-red-600">Recording in progress</span>}</div><SourceTextarea form={form} updateForm={updateForm} onSourceEdited={() => setProcessedDocument(null)} /></div>}{inputMethod === "files" && <div className="space-y-2"><div className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => fileInputRef.current?.click()}><Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" /><p className="text-xs text-muted-foreground">Select PDF or image source files</p><p className="text-xs text-muted-foreground">Multiple files supported</p></div><input ref={fileInputRef} type="file" multiple accept=".pdf,image/*" className="hidden" onChange={handleFileSelect} /><ExternalReportSourceFileRows entries={uploadedFiles} onChange={setUploadedFiles} />{uploadedFiles.length > 0 && <><p className="text-xs text-muted-foreground flex gap-1.5"><LockKeyhole className="h-3.5 w-3.5 shrink-0" />On finalization, original source-file references, labels, and protected-document passwords are retained with this source revision.</p><Button type="button" size="sm" variant="outline" className="h-8 text-xs gap-1.5 w-full" disabled={extractFromFiles.isPending} onClick={extractFiles}>{extractFromFiles.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}{extractFromFiles.isPending ? "Extracting source content..." : "Extract Source Content"}</Button></>}{form.originalContent && <SourceTextarea form={form} updateForm={updateForm} onSourceEdited={() => setProcessedDocument(null)} />}</div>}</div>}
        {isEditing && <div className="rounded-md border bg-muted/30 p-3"><div className="flex items-center gap-1.5 mb-2"><ShieldCheck className="h-3.5 w-3.5 text-emerald-700" /><p className="text-xs font-medium">Captured source (read-only)</p></div>{sourceRevisions.isLoading ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading source revision…</div> : <><p className="text-xs text-muted-foreground mb-2">{activeSourceRevision ? `Source revision ${activeSourceRevision.revisionNumber} · ${outputLanguageLabel(activeSourceRevision.sourceLanguage)}` : "Legacy report: no immutable source revision was captured."}</p><p className="text-xs whitespace-pre-wrap text-muted-foreground max-h-40 overflow-y-auto">{effectiveSourceText || "No historical source content was stored for this report."}</p></>}</div>}
      </FormSection>

      <FormSection title="2. Process with AI" description="One processing goal is the only source of truth for the server-derived instruction and output language.">
        <div className="rounded-lg border border-purple-200 bg-purple-50/50 dark:border-purple-900 dark:bg-purple-950/20 p-3 space-y-3">{isEditing ? <p className="text-xs text-muted-foreground">Processing is available when creating a new report. This retained report remains available for review and export without being rewritten.</p> : <><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><FieldLabel label="Processing Goal"><Select value={form.processingGoal} onValueChange={(value) => updateForm((previous) => ({ ...previous, processingGoal: value as ProcessingGoal, requestedTargetLanguage: value === "translate" || value === "translate_simplify" ? (previous.requestedTargetLanguage === "source" ? "en" : previous.requestedTargetLanguage) : value === "summarize" ? previous.requestedTargetLanguage : "source", processedContent: "" }))}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>{PROCESSING_GOALS.map((goal) => <SelectItem key={goal.value} value={goal.value}>{goal.label}</SelectItem>)}</SelectContent></Select></FieldLabel>{(requiresTargetLanguage || showsSummaryLanguage) && <FieldLabel label={showsSummaryLanguage ? "Summary Language" : "Target Language *"}><Select value={form.requestedTargetLanguage} onValueChange={(value) => updateForm((previous) => ({ ...previous, requestedTargetLanguage: value as TargetLanguage, processedContent: "" }))}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>{showsSummaryLanguage && <SelectItem value="source">Same as Source</SelectItem>}{LANGUAGE_OPTIONS.map((language) => <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>)}</SelectContent></Select></FieldLabel>}</div>{!requiresTargetLanguage && !showsSummaryLanguage && <p className="text-xs text-muted-foreground">Output language is preserved from the source for this goal.</p>}<Button type="button" size="sm" className="h-8 text-xs gap-1.5 w-full bg-purple-700 hover:bg-purple-800" disabled={processWithAI.isPending || !effectiveSourceText.trim()} onClick={process}>{processWithAI.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}{processWithAI.isPending ? "Processing with AI..." : "Process with AI"}</Button></>}</div>
      </FormSection>

      <FormSection title="3. Review" description="Review patient-ready content separately from the immutable captured source before finalizing.">
        {processedDocument?.blocks.some((block) => block.type !== "legacy_text") ? <><div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">Structured patient-ready document. Reprocess from the retained source to revise it; review does not infer laboratory values.</div><StructuredExternalReportReview document={processedDocument} /></> : <Textarea className="text-sm min-h-[170px]" placeholder="Processed / patient-ready content appears here after AI processing." value={form.processedContent} onChange={(event) => updateForm((previous) => ({ ...previous, processedContent: event.target.value }))} />}
      </FormSection>
    </div>
    <DialogFooter><Button type="button" variant="outline" size="sm" onClick={cancel}>Cancel</Button><Button type="button" size="sm" disabled={isSaving} onClick={handleSave}>{isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}{isEditing ? "Update Report" : "Finalize Report"}</Button></DialogFooter>
  </>;
}

function FormSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="space-y-3"><div><h4 className="text-sm font-semibold">{title}</h4><p className="text-xs text-muted-foreground mt-0.5">{description}</p></div>{children}</section>;
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function SourceTextarea({ form, updateForm, onSourceEdited }: { form: ExternalReportForm; updateForm: (updater: (previous: ExternalReportForm) => ExternalReportForm) => void; onSourceEdited?: () => void }) {
  return <div className="space-y-1"><Label className="text-xs">Original Source Content *</Label><Textarea className="text-sm min-h-[130px]" placeholder="Paste, transcribe, or extract the original report content here..." value={form.originalContent} onChange={(event) => { onSourceEdited?.(); updateForm((previous) => ({ ...previous, originalContent: event.target.value, processedContent: "" })); }} /></div>;
}

export function ExternalReportSourceFileRows({ entries, onChange }: { entries: PendingSourceFile[]; onChange: (next: PendingSourceFile[]) => void }) {
  return <>{entries.map((entry, index) => <div key={`${entry.file.name}-${index}`} className="rounded-md border bg-muted/20 p-2 space-y-2"><div className="flex items-center gap-2 text-xs"><FileText className="h-3 w-3 text-blue-600" /><span className="flex-1 truncate">{entry.file.name}</span><span className="text-muted-foreground">{Math.ceil(entry.file.size / 1024)} KB</span><Button type="button" size="icon" variant="ghost" className="h-6 w-6" title="Remove file" onClick={() => onChange(removeExternalReportSourceFile(entries, index))}><X className="h-3.5 w-3.5" /></Button></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><Input className="h-8 text-xs" aria-label={`File label for ${entry.file.name}`} value={entry.tag} onChange={(event) => onChange(entries.map((item, currentIndex) => currentIndex === index ? { ...item, tag: event.target.value } : item))} /><Input className="h-8 text-xs" type="password" placeholder="Document password (if protected)" aria-label={`Document password for ${entry.file.name}`} value={entry.password} onChange={(event) => onChange(entries.map((item, currentIndex) => currentIndex === index ? { ...item, password: event.target.value } : item))} /></div></div>)}</>;
}
