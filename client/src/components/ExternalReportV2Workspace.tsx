import { useMemo, useState } from "react";
import { FileText, Loader2, ShieldAlert, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDraftForm } from "@/hooks/useDraftForm";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { trpc } from "@/lib/trpc";

type Goal = "translate" | "simplify" | "translate_simplify" | "format_only" | "summarize";
type Language = "en" | "ar" | "tr" | "und";
type Target = "en" | "ar" | "tr" | "source";
type SourceFile = { fileBase64: string; fileName: string; mimeType: string; tag: string; documentPassword: string };
type V2Form = {
  sourceOrganization: string; reportType: string; reportDate: string; sourceLanguage: Language;
  processingGoal: Goal; requestedTargetLanguage: Target; sourceText: string; processedText: string;
  originalProcessedText: string; title: string; processProof: string; safetyState: "" | "auto_verified" | "manual_verification_required";
};

const INITIAL: V2Form = {
  sourceOrganization: "", reportType: "", reportDate: "", sourceLanguage: "und", processingGoal: "translate",
  requestedTargetLanguage: "en", sourceText: "", processedText: "", originalProcessedText: "", title: "", processProof: "", safetyState: "",
};

function requestedTarget(form: V2Form): Target | null {
  if (form.processingGoal === "translate" || form.processingGoal === "translate_simplify" || form.processingGoal === "summarize") return form.requestedTargetLanguage;
  return null;
}

async function fileToSource(file: File, index: number): Promise<SourceFile> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return {
    fileBase64: dataUrl.split(",")[1] ?? "",
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    tag: `ExternalReportV2-${String(index + 1).padStart(2, "0")}`,
    documentPassword: "",
  };
}

export function ExternalReportV2Workspace({ patientId, onFinalized }: { patientId: number; onFinalized?: () => void }) {
  const { form, setForm, clearDraft } = useDraftForm<V2Form>({ key: `external-report-v2-${patientId}`, initialData: INITIAL });
  const [files, setFiles] = useState<SourceFile[]>([]);
  const extract = trpc.externalReports.extractFromFiles.useMutation();
  const processV2 = trpc.externalReportsV2.process.useMutation();
  const finalizeV2 = trpc.externalReportsV2.finalize.useMutation();
  const [processStage, setProcessStage] = useState<"extracting" | "generating" | null>(null);
  const isBusy = extract.isPending || processV2.isPending || finalizeV2.isPending;
  const isDirty = useMemo(() => files.length > 0 || JSON.stringify(form) !== JSON.stringify(INITIAL), [files, form]);
  useBeforeUnload(isDirty);

  const update = <K extends keyof V2Form>(key: K, value: V2Form[K]) => setForm((current) => ({ ...current, [key]: value }));

  async function handleFiles(selected: FileList | null) {
    if (!selected?.length) return;
    try {
      const next = await Promise.all(Array.from(selected).map((file, index) => fileToSource(file, files.length + index)));
      setFiles((current) => [...current, ...next]);
    } catch {
      toast.error("The selected documents could not be prepared. Please try again.");
    }
  }

  async function process() {
    try {
      let sourceText = form.sourceText.trim();
      if (!sourceText && files.length) {
        setProcessStage("extracting");
        const result = await extract.mutateAsync({
          files: files.map(({ fileBase64, fileName, mimeType, documentPassword }) => ({ fileBase64, fileName, mimeType, documentPassword: documentPassword || undefined })),
          reportType: form.reportType || undefined,
        });
        sourceText = String(result.extractedText ?? "").trim();
        update("sourceText", sourceText);
      }
      if (!sourceText) {
        toast.error("Add source text or upload at least one source document.");
        return;
      }
      if ((form.processingGoal === "translate" || form.processingGoal === "translate_simplify") && form.requestedTargetLanguage === "source") {
        toast.error("Choose a target language for this processing goal.");
        return;
      }
      setProcessStage("generating");
      const result = await processV2.mutateAsync({
        patientId,
        sourceText,
        sourceLanguage: form.sourceLanguage,
        processingGoal: form.processingGoal,
        requestedTargetLanguage: requestedTarget(form),
      });
      setForm((current) => ({
        ...current,
        sourceText,
        processedText: result.processedContent,
        originalProcessedText: result.processedContent,
        title: result.title ?? "",
        processProof: result.processProof,
        safetyState: result.safetyState,
      }));
      toast.success("V2 processing completed. Review the source and result before finalizing.");
    } catch {
      toast.error("V2 could not safely generate the patient-ready review. The source was not changed. You may try again.");
    } finally {
      setProcessStage(null);
    }
  }

  async function finalize() {
    try {
      if (!form.processProof || !form.processedText.trim()) {
        toast.error("Process and review the report before finalizing.");
        return;
      }
      if (form.reportDate && Number(form.reportDate.slice(0, 4)) < 1900) {
        toast.error("Report date must be 1900 or later.");
        return;
      }
      await finalizeV2.mutateAsync({
        processProof: form.processProof,
        patientId,
        sourceText: form.sourceText,
        originalProcessedText: form.originalProcessedText,
        processedText: form.processedText,
        title: form.title || undefined,
        sourceLanguage: form.sourceLanguage,
        processingGoal: form.processingGoal,
        requestedTargetLanguage: requestedTarget(form),
        sourceOrganization: form.sourceOrganization || undefined,
        reportType: form.reportType || undefined,
        reportDate: form.reportDate ? new Date(`${form.reportDate}T12:00:00`) : undefined,
        sourceInputMethod: files.length ? "files" : "text",
        sourceAssets: files.map((file) => ({ ...file, documentPassword: file.documentPassword || undefined })),
      });
      clearDraft();
      setForm(INITIAL);
      setFiles([]);
      toast.success("External Report V2 finalized successfully.");
      onFinalized?.();
    } catch {
      toast.error("Report could not be finalized. No partial report was saved.");
    }
  }

  function cancel() {
    clearDraft();
    setForm(INITIAL);
    setFiles([]);
    toast.success("Draft cleared.");
  }

  return (
    <Card className="border-violet-200 bg-violet-50/40 dark:border-violet-900 dark:bg-violet-950/20">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" />External Reports V2 — Parallel QA Workspace</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">Dormant Admin workspace. It does not replace the current production workflow before cutover approval.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Source organization</Label><Input value={form.sourceOrganization} onChange={(event) => update("sourceOrganization", event.target.value)} /></div>
          <div><Label>Report type</Label><Input value={form.reportType} onChange={(event) => update("reportType", event.target.value)} /></div>
          <div><Label>Report date</Label><Input type="date" min="1900-01-01" value={form.reportDate} onChange={(event) => update("reportDate", event.target.value)} /></div>
          <div><Label>Source language</Label><Select value={form.sourceLanguage} onValueChange={(value: Language) => update("sourceLanguage", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="und">Unknown</SelectItem><SelectItem value="tr">Turkish</SelectItem><SelectItem value="en">English</SelectItem><SelectItem value="ar">Arabic</SelectItem></SelectContent></Select></div>
        </div>
        <div className="space-y-2">
          <Label>Source documents</Label>
          <Input type="file" multiple accept=".pdf,image/*" onChange={(event) => void handleFiles(event.target.files)} />
          {files.map((file, index) => <div key={`${file.fileName}-${index}`} className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[1fr_180px_1fr_auto]">
            <div className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4" /><span className="truncate">{file.fileName}</span></div>
            <Input aria-label={`Tag for ${file.fileName}`} value={file.tag} onChange={(event) => setFiles((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, tag: event.target.value } : item))} />
            <Input type="password" placeholder="Document password (if protected)" value={file.documentPassword} onChange={(event) => setFiles((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, documentPassword: event.target.value } : item))} />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${file.fileName}`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X className="h-4 w-4" /></Button>
          </div>)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Processing goal</Label><Select value={form.processingGoal} onValueChange={(value: Goal) => update("processingGoal", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="translate">Translate</SelectItem><SelectItem value="simplify">Simplify for Patient</SelectItem><SelectItem value="translate_simplify">Translate & Simplify</SelectItem><SelectItem value="format_only">Format Only</SelectItem><SelectItem value="summarize">Summarize</SelectItem></SelectContent></Select></div>
          {(form.processingGoal === "translate" || form.processingGoal === "translate_simplify" || form.processingGoal === "summarize") && <div><Label>Target language</Label><Select value={form.requestedTargetLanguage} onValueChange={(value: Target) => update("requestedTargetLanguage", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{form.processingGoal === "summarize" && <SelectItem value="source">Same as source</SelectItem>}<SelectItem value="en">English</SelectItem><SelectItem value="tr">Turkish</SelectItem><SelectItem value="ar">Arabic</SelectItem></SelectContent></Select></div>}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div><Label>Immutable captured source</Label><Textarea dir={form.sourceLanguage === "ar" ? "rtl" : "auto"} className="mt-1 min-h-72 font-mono text-xs" value={form.sourceText} onChange={(event) => update("sourceText", event.target.value)} /></div>
          <div><div className="flex items-center justify-between"><Label>Patient-ready Review</Label>{form.safetyState === "manual_verification_required" && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-900"><ShieldAlert className="h-3 w-3" />Manual verification required</span>}</div><Textarea dir={form.requestedTargetLanguage === "ar" ? "rtl" : "auto"} className="mt-1 min-h-72" value={form.processedText} onChange={(event) => update("processedText", event.target.value)} placeholder="Processed content appears here after one V2 AI request." /></div>
        </div>
        {processStage && <p className="text-sm text-muted-foreground" role="status" aria-live="polite">{processStage === "extracting" ? "Extracting source documents…" : "Generating patient-ready review…"}</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={cancel} disabled={isBusy}>Cancel</Button>
          <Button type="button" onClick={() => void process()} disabled={isBusy}>{(extract.isPending || processV2.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{processStage === "extracting" ? "Extracting source documents…" : processStage === "generating" ? "Generating patient-ready review…" : "Process with V2"}</Button>
          <Button type="button" onClick={() => void finalize()} disabled={isBusy || !form.processProof}>{finalizeV2.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Finalize V2</Button>
        </div>
      </CardContent>
    </Card>
  );
}
