import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { Building2, Eye, EyeOff, FlaskConical, Languages, Loader2, Lock, MapPin, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const LOCATION_LABELS: Record<string, string> = {
  "in-clinic": "In-Clinic",
  "partner-clinic": "Partner Clinic",
  "patient-country": "Patient's Country",
};

export default function LabPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  const { data: orders, isLoading, refetch } = trpc.lab.orders.useQuery(
    { category: category !== "all" ? category : undefined }
  );
  const { data: partnerClinics } = trpc.partnerClinics.list.useQuery();

  const updateOrder = trpc.lab.updateOrder.useMutation({
    onSuccess: () => { toast.success("Order updated"); refetch(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const autoInvoice = trpc.lab.autoInvoice.useMutation({
    onSuccess: (data) => { toast.success(`Draft invoice ${data.invoiceNumber} created`); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const updateOrderLocation = trpc.lab.updateOrderLocation.useMutation({
    onSuccess: () => { toast.success("Location updated"); refetch(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const filtered = orders?.filter(o => {
    if (!search) return true;
    return `${o.patientFirstName} ${o.patientLastName} ${o.testName} ${o.orderNumber}`.toLowerCase().includes(search.toLowerCase());
  }) ?? [];

  const statusColor: Record<string, string> = {
    ordered: "bg-blue-100 text-blue-700",
    sample_collected: "bg-yellow-100 text-yellow-700",
    processing: "bg-orange-100 text-orange-700",
    completed: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-gray-100 text-gray-500",
  };

  const categoryIcon: Record<string, string> = {
    lab: "🧪",
    radiology: "🔬",
    pathology: "🧫",
    other: "📋",
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{background:'rgba(229,186,153,0.18)'}}>
            <FlaskConical className="h-6 w-6" style={{color:'#E5BA99'}} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Lab & Radiology</h1>
            <p className="text-sm text-muted-foreground">Order tracking and results</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="lab">Lab</SelectItem>
            <SelectItem value="radiology">Radiology</SelectItem>
            <SelectItem value="pathology">Pathology</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Ordered", status: "ordered", color: "blue" },
          { label: "Sample Collected", status: "sample_collected", color: "yellow" },
          { label: "Processing", status: "processing", color: "orange" },
          { label: "Completed", status: "completed", color: "emerald" },
        ].map(s => {
          const count = orders?.filter(o => o.status === s.status).length ?? 0;
          return (
            <Card key={s.status}>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <FlaskConical className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">No lab orders found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(order => (
            <div key={order.id} className="p-4 rounded-xl border bg-card hover:bg-accent/20 transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-lg">
                  {categoryIcon[order.category] ?? "🧪"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{order.testName}</p>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusColor[order.status] ?? ""}`}>
                      {order.status?.replace(/_/g, " ")}
                    </span>
                    {order.priority === "urgent" && (
                      <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">URGENT</span>
                    )}
                    {order.priority === "stat" && (
                      <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">STAT</span>
                    )}
                    {(order as any).location && (order as any).location !== "in-clinic" && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 flex items-center gap-0.5">
                        <MapPin className="h-2.5 w-2.5" />
                        {LOCATION_LABELS[(order as any).location] ?? (order as any).location}
                      </span>
                    )}
                    {(order as any).invoiceId ? (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        (order as any).invoiceStatus === "paid" ? "bg-emerald-50 text-emerald-700" :
                        (order as any).invoiceStatus === "partial" ? "bg-amber-50 text-amber-700" :
                        "bg-blue-50 text-blue-700"
                      }`}>
                        💳 Invoice: {(order as any).invoiceStatus ?? "issued"}
                      </span>
                    ) : order.status === "completed" ? (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-50 text-orange-700">
                        ⚠ Pending Finance Review
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {order.patientFirstName} {order.patientLastName} · {order.orderNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ordered: {format(new Date(order.orderedDate), "MMM d, yyyy")}
                    {order.resultDate ? ` · Results: ${format(new Date(order.resultDate), "MMM d, yyyy")}` : ""}
                  </p>
                  {order.notes && <p className="text-xs text-muted-foreground mt-1">{order.notes}</p>}

                  {/* Location + Partner Clinic selectors */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Select
                      value={(order as any).location ?? "in-clinic"}
                      onValueChange={val => updateOrderLocation.mutate({
                        id: order.id,
                        location: val as any,
                        partnerClinicId: val !== "partner-clinic" ? undefined : (order as any).partnerClinicId,
                      })}
                    >
                      <SelectTrigger className="h-6 text-xs w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in-clinic">In-Clinic</SelectItem>
                        <SelectItem value="partner-clinic">Partner Clinic</SelectItem>
                        <SelectItem value="patient-country">Patient's Country</SelectItem>
                      </SelectContent>
                    </Select>

                    {(order as any).location === "partner-clinic" && (
                      <Select
                        value={String((order as any).partnerClinicId ?? "")}
                        onValueChange={val => updateOrderLocation.mutate({
                          id: order.id,
                          location: "partner-clinic",
                          partnerClinicId: val ? parseInt(val) : undefined,
                        })}
                      >
                        <SelectTrigger className="h-6 text-xs w-44">
                          <SelectValue placeholder="Select clinic..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(partnerClinics ?? []).filter(c => c.isActive).map(c => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              <span className="flex items-center gap-1.5">
                                <Building2 className="h-3 w-3" />{c.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1 shrink-0">
                  {order.status === "ordered" && (
                    <Button variant="outline" size="sm" className="text-xs h-7"
                      onClick={() => updateOrder.mutate({ id: order.id, data: { status: "sample_collected", collectedDate: new Date() } })}>
                      Collect Sample
                    </Button>
                  )}
                  {order.status === "sample_collected" && (
                    <Button variant="outline" size="sm" className="text-xs h-7"
                      onClick={() => updateOrder.mutate({ id: order.id, data: { status: "processing" } })}>
                      Start Processing
                    </Button>
                  )}
                  {order.status === "processing" && (
                    <Button variant="outline" size="sm" className="text-xs h-7"
                      onClick={() => updateOrder.mutate({ id: order.id, data: { status: "completed", resultDate: new Date() } })}>
                      Mark Complete
                    </Button>
                  )}
                  {order.status === "completed" && (
                    <Button variant="outline" size="sm" className="text-xs h-7 gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                      onClick={() => autoInvoice.mutate({ labOrderId: order.id })}
                      disabled={autoInvoice.isPending}>
                      {autoInvoice.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Auto-Invoice
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-xs h-7 gap-1"
                    onClick={() => { setSelectedOrder(order); setShowResultModal(true); }}>
                    <Plus className="h-3 w-3" />Results
                  </Button>
                </div>
              </div>

              {/* Results list */}
              <ResultsList orderId={order.id} />
            </div>
          ))}
        </div>
      )}

      {selectedOrder && (
        <AddResultModal
          open={showResultModal}
          order={selectedOrder}
          onClose={() => { setShowResultModal(false); setSelectedOrder(null); }}
          onSuccess={() => { refetch(); setShowResultModal(false); setSelectedOrder(null); }}
        />
      )}
    </div>
  );
}

// ─── Results List ─────────────────────────────────────────────────────────────
function ResultsList({ orderId }: { orderId: number }) {
  const { data: results, refetch } = trpc.lab.results.useQuery({ labOrderId: orderId });
  const toggleVisibility = trpc.lab.toggleResultVisibility.useMutation({
    onSuccess: () => { toast.success("Visibility updated"); refetch(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  if (!results || results.length === 0) return null;

  return (
    <div className="mt-3 border-t pt-3 space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Results</p>
      {results.map((r: any) => (
        <div key={r.id} className="flex items-center justify-between gap-2 text-xs bg-muted/40 rounded px-2 py-1.5">
          <div className="flex-1 min-w-0">
            <span className="font-medium">{r.parameter}</span>
            <span className="text-muted-foreground ml-2">{r.value} {r.unit}</span>
            {r.referenceRange && <span className="text-muted-foreground ml-1">(ref: {r.referenceRange})</span>}
            {r.flag && r.flag !== "normal" && (
              <span className={`ml-2 font-bold ${r.flag === "critical" ? "text-red-600" : r.flag === "high" ? "text-orange-600" : "text-blue-600"}`}>
                ↑{r.flag.toUpperCase()}
              </span>
            )}
            {r.resultFileUrl && (
              <a href={r.resultFileUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary underline">
                View File
              </a>
            )}
          </div>
          <button
            onClick={() => toggleVisibility.mutate({ id: r.id, isVisibleToPatient: !r.isVisibleToPatient })}
            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              r.isVisibleToPatient ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
            title={r.isVisibleToPatient ? "Visible to patient — click to hide" : "Hidden from patient — click to show"}
          >
            {r.isVisibleToPatient ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {r.isVisibleToPatient ? "Visible" : "Hidden"}
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Add Result Modal ─────────────────────────────────────────────────────────
// Predefined parameter and unit lists
const PREDEFINED_PARAMETERS = [
  "AFC (Antral Follicle Count)", "AMH (Anti-Müllerian Hormone)", "FSH (Follicle Stimulating Hormone)",
  "LH (Luteinizing Hormone)", "Estradiol (E2)", "Progesterone", "Testosterone (Total)",
  "Testosterone (Free)", "Prolactin", "TSH (Thyroid Stimulating Hormone)", "Free T4", "Free T3",
  "Beta-hCG", "Inhibin B", "DHEA-S", "Cortisol", "Insulin", "Glucose (Fasting)",
  "Hemoglobin", "Hematocrit", "WBC", "Platelets", "RBC",
  "ALT", "AST", "Creatinine", "Urea", "Total Protein",
  "Follicle Size (Right Ovary)", "Follicle Size (Left Ovary)", "Endometrial Thickness",
  "Sperm Concentration", "Sperm Motility (Total)", "Sperm Motility (Progressive)",
  "Sperm Morphology (Normal Forms)", "Sperm Volume", "Sperm pH",
];

const PREDEFINED_UNITS = [
  "ng/mL", "pg/mL", "mIU/mL", "IU/L", "nmol/L", "pmol/L", "µIU/mL",
  "ng/dL", "µg/dL", "mg/dL", "mmol/L", "g/dL", "g/L",
  "mm", "cm", "mm³", "10³/µL", "10⁶/µL", "million/mL",
  "%", "mL", "U/L", "µmol/L",
];

function autoFlag(value: string, from: string, to: string): "normal" | "low" | "high" | "critical" {
  const v = parseFloat(value);
  const lo = parseFloat(from);
  const hi = parseFloat(to);
  if (isNaN(v) || isNaN(lo) || isNaN(hi)) return "normal";
  if (v < lo * 0.7 || v > hi * 1.5) return "critical";
  if (v < lo) return "low";
  if (v > hi) return "high";
  return "normal";
}

// Categories that use structured blood-test form
const STRUCTURED_CATEGORIES = ["lab"];

function AddResultModal({ open, order, onClose, onSuccess }: {
  open: boolean;
  order: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  // Determine form mode based on order category
  const isStructured = STRUCTURED_CATEGORIES.includes(order?.category ?? "lab");

  const [parameter, setParameter] = useState("");
  const [paramCustom, setParamCustom] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [unitCustom, setUnitCustom] = useState("");
  const [refFrom, setRefFrom] = useState("");
  const [refTo, setRefTo] = useState("");
  const [flag, setFlag] = useState<"normal"|"low"|"high"|"critical">("normal");
  const [flagOverride, setFlagOverride] = useState(false);
  const [interpretation, setInterpretation] = useState("");
  const [clinicalInterpretation, setClinicalInterpretation] = useState("");
  const [resultFileUrl, setResultFileUrl] = useState("");
  const [unitConversionFormula, setUnitConversionFormula] = useState("");
  const [sampleCollectedAt, setSampleCollectedAt] = useState("");
  const [reportedAt, setReportedAt] = useState("");
  const [isVisibleToPatient, setIsVisibleToPatient] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [resultFileKey, setResultFileKey] = useState("");
  // Translate state (for non-structured results with a file)
  const [showTranslate, setShowTranslate] = useState(false);
  const [pdfPassword, setPdfPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [translating, setTranslating] = useState(false);
  const createTranslation = trpc.translations.create.useMutation();
  const translateDoc = trpc.translations.translate.useMutation({
    onSuccess: () => { toast.success("Translation saved to patient Lab tab"); setShowTranslate(false); setTranslating(false); },
    onError: (e: any) => { toast.error(e.message ?? "Translation failed"); setTranslating(false); },
  });

  const handleTranslateFile = async () => {
    if (!resultFileUrl || !order?.patientId) return toast.error("No file attached");
    setTranslating(true);
    try {
      const rec = await createTranslation.mutateAsync({
        patientId: order.patientId,
        originalFileName: uploadedFileName || order.testName || "document",
        originalLanguage: "tr",
        targetLanguage: "en",
        originalFileUrl: resultFileUrl,
      });
      await translateDoc.mutateAsync({
        id: rec.id,
        patientId: order.patientId,
        fileUrl: resultFileUrl,
        pdfPassword: pdfPassword || undefined,
        targetLanguage: "en",
      });
    } catch {
      setTranslating(false);
    }
  };

  const uploadFile = trpc.lab.uploadResultFile.useMutation({
    onSuccess: (data: any) => {
      setResultFileUrl(data.url);
      setResultFileKey(data.key);
      toast.success("File uploaded successfully");
      setUploadingFile(false);
    },
    onError: (e: any) => { toast.error(e.message); setUploadingFile(false); },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) return toast.error("File must be under 16MB");
    setUploadingFile(true);
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadFile.mutate({ fileBase64: base64, fileName: file.name, mimeType: file.type, labOrderId: order.id });
    };
    reader.readAsDataURL(file);
  };

  const extractFromUrl = trpc.lab.aiExtractResult.useMutation({
    onSuccess: (data: any) => {
      if (data.parameter) setParameter(data.parameter);
      if (data.value) setValue(data.value);
      if (data.unit) setUnit(data.unit);
      if (data.refFrom) setRefFrom(data.refFrom);
      if (data.refTo) setRefTo(data.refTo);
      if (data.interpretation) setInterpretation(data.interpretation);
      toast.success("AI extraction complete");
      setAiLoading(false);
    },
    onError: (e: any) => { toast.error(e.message); setAiLoading(false); },
  });

  const transcribeVoice = trpc.lab.transcribeVoiceResult.useMutation({
    onSuccess: (data: any) => {
      if (data.parameter) setParameter(data.parameter);
      if (data.value) setValue(data.value);
      if (data.unit) setUnit(data.unit);
      if (data.refFrom) setRefFrom(data.refFrom);
      if (data.refTo) setRefTo(data.refTo);
      if (data.interpretation) setInterpretation(data.interpretation);
      toast.success("Voice transcription mapped");
      setVoiceLoading(false);
    },
    onError: (e: any) => { toast.error(e.message); setVoiceLoading(false); },
  });

  // Auto-compute flag when value or ref range changes (unless manually overridden)
  useEffect(() => {
    if (!flagOverride && value && refFrom && refTo) {
      setFlag(autoFlag(value, refFrom, refTo));
    }
  }, [value, refFrom, refTo, flagOverride]);

  useEffect(() => {
    if (open) {
      setParameter(""); setParamCustom(""); setValue(""); setUnit(""); setUnitCustom("");
      setRefFrom(""); setRefTo(""); setFlag("normal"); setFlagOverride(false);
      setInterpretation(""); setClinicalInterpretation(""); setResultFileUrl("");
      setUnitConversionFormula(""); setSampleCollectedAt(""); setReportedAt("");
      setIsVisibleToPatient(false);
      setUploadedFileName("");
      setResultFileKey("");
    }
  }, [open]);

  const addResult = trpc.lab.addResult.useMutation({
    onSuccess: () => { toast.success("Result added"); onSuccess(); },
    onError: (e: any) => toast.error(e.message),
  });

  const finalParameter = parameter === "__custom" ? paramCustom : parameter;
  const finalUnit = unit === "__custom" ? unitCustom : unit;

  const handleSubmit = () => {
    if (isStructured && !finalParameter.trim()) return toast.error("Parameter is required");
    if (isStructured && !value.trim()) return toast.error("Value is required");
    if (!isStructured && !resultFileUrl && !interpretation.trim()) return toast.error("Please upload a file or enter notes");
    const refRange = refFrom && refTo ? `${refFrom}\u2013${refTo}` : refFrom || refTo || undefined;
    addResult.mutate({
      labOrderId: order.id,
      patientId: order.patientId,
      parameter: isStructured ? finalParameter.trim() : undefined,
      value: isStructured ? value.trim() : undefined,
      unit: isStructured ? (finalUnit || undefined) : undefined,
      referenceRange: isStructured ? refRange : undefined,
      refRangeFrom: isStructured ? (refFrom || undefined) : undefined,
      refRangeTo: isStructured ? (refTo || undefined) : undefined,
      flag: isStructured ? flag : undefined,
      flagManualOverride: isStructured ? flagOverride : undefined,
      interpretation: interpretation || undefined,
      clinicalInterpretation: clinicalInterpretation || undefined,
      resultFileUrl: resultFileUrl || undefined,
      resultFileKey: resultFileKey || undefined,
      unitConversionFormula: isStructured ? (unitConversionFormula || undefined) : undefined,
      sampleCollectedAt: sampleCollectedAt ? new Date(sampleCollectedAt) : undefined,
      reportedAt: reportedAt ? new Date(reportedAt) : undefined,
      isVisibleToPatient,
      resultType: isStructured ? "structured" : "freetext",
    });
  };

  const handleAiExtract = () => {
    if (!resultFileUrl) return toast.error("Paste a file URL first");
    setAiLoading(true);
    extractFromUrl.mutate({ fileUrl: resultFileUrl, testName: order.testName });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          const b64 = (reader.result as string).split(",")[1];
          setVoiceLoading(true);
          transcribeVoice.mutate({ audioBase64: b64, testName: order.testName });
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      setMediaRecorder(mr);
      setIsRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    mediaRecorder?.stop();
    setIsRecording(false);
    setMediaRecorder(null);
  };

  const flagColors: Record<string, string> = {
    normal: "text-emerald-600", low: "text-blue-600", high: "text-orange-600", critical: "text-red-600 font-bold"
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Result — {order?.testName}</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isStructured
              ? "Blood / Lab test — enter structured values below"
              : `${order?.category?.charAt(0).toUpperCase()}${order?.category?.slice(1) ?? "Other"} test — upload a file and/or enter notes`}
          </p>
        </DialogHeader>
        <div className="space-y-4">

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Sample Collection Date & Time</Label>
              <Input type="datetime-local" value={sampleCollectedAt} onChange={e => setSampleCollectedAt(e.target.value)} className="text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Result Reported Date & Time</Label>
              <Input type="datetime-local" value={reportedAt} onChange={e => setReportedAt(e.target.value)} className="text-xs" />
            </div>
          </div>

          {/* ── STRUCTURED MODE (Blood / Lab tests) ── */}
          {isStructured && (
            <>
              {/* AI & Voice Tools */}
              <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Tools</p>
                <div className="flex gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <Input value={resultFileUrl} onChange={e => setResultFileUrl(e.target.value)}
                      placeholder="Paste file URL for AI extraction..." className="text-xs h-8" />
                  </div>
                  <Button size="sm" variant="outline" onClick={handleAiExtract} disabled={aiLoading} className="text-xs h-8 gap-1 shrink-0">
                    {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "🤖"} AI Extract
                  </Button>
                  <Button size="sm" variant={isRecording ? "destructive" : "outline"}
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={voiceLoading} className="text-xs h-8 gap-1 shrink-0">
                    {voiceLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : isRecording ? "⏹ Stop" : "🎤 Voice"}
                  </Button>
                </div>
                {isRecording && <p className="text-xs text-red-500 animate-pulse">Recording... click Stop when done</p>}
              </div>

              {/* Parameter */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Parameter *</Label>
                  <Select value={parameter} onValueChange={setParameter}>
                    <SelectTrigger className="text-xs h-9"><SelectValue placeholder="Select or type..." /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {PREDEFINED_PARAMETERS.map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
                      <SelectItem value="__custom" className="text-xs">— Custom —</SelectItem>
                    </SelectContent>
                  </Select>
                  {parameter === "__custom" && (
                    <Input value={paramCustom} onChange={e => setParamCustom(e.target.value)} placeholder="Enter parameter name" className="text-xs h-8 mt-1" />
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Value *</Label>
                  <Input value={value} onChange={e => setValue(e.target.value)} placeholder="e.g. 13.5" className="text-xs h-9" />
                </div>
              </div>

              {/* Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Unit</Label>
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger className="text-xs h-9"><SelectValue placeholder="Select unit..." /></SelectTrigger>
                    <SelectContent className="max-h-48">
                      {PREDEFINED_UNITS.map(u => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}
                      <SelectItem value="__custom" className="text-xs">— Custom —</SelectItem>
                    </SelectContent>
                  </Select>
                  {unit === "__custom" && (
                    <Input value={unitCustom} onChange={e => setUnitCustom(e.target.value)} placeholder="Enter unit" className="text-xs h-8 mt-1" />
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Unit Conversion Formula (optional)</Label>
                  <Input value={unitConversionFormula} onChange={e => setUnitConversionFormula(e.target.value)}
                    placeholder="e.g. ng/mL × 3.67 = nmol/L" className="text-xs h-9" />
                </div>
              </div>

              {/* Reference Range */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Reference Range — From</Label>
                  <Input value={refFrom} onChange={e => setRefFrom(e.target.value)} placeholder="e.g. 12" className="text-xs h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Reference Range — To</Label>
                  <Input value={refTo} onChange={e => setRefTo(e.target.value)} placeholder="e.g. 16" className="text-xs h-9" />
                </div>
              </div>

              {/* Flag */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Flag</Label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={flagOverride} onChange={e => setFlagOverride(e.target.checked)} />
                    Manual override
                  </label>
                </div>
                {flagOverride ? (
                  <Select value={flag} onValueChange={v => setFlag(v as any)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className={`text-sm font-semibold px-3 py-2 rounded border bg-background ${flagColors[flag]}`}>
                    {flag.charAt(0).toUpperCase() + flag.slice(1)}
                    {refFrom && refTo && value && <span className="text-xs font-normal text-muted-foreground ml-2">(auto-computed from ref range)</span>}
                  </div>
                )}
              </div>

              {/* Interpretation */}
              <div className="space-y-1">
                <Label className="text-xs">Interpretation</Label>
                <Textarea value={interpretation} onChange={e => setInterpretation(e.target.value)} rows={2}
                  placeholder="Brief result note..." className="text-xs" />
              </div>

              {/* Clinical Interpretation */}
              <div className="space-y-1">
                <Label className="text-xs">Clinical Interpretation (optional)</Label>
                <Textarea value={clinicalInterpretation} onChange={e => setClinicalInterpretation(e.target.value)} rows={2}
                  placeholder="Detailed clinical context..." className="text-xs" />
              </div>

              {/* File Attachment (optional for structured) */}
              <div className="space-y-1">
                <Label className="text-xs">Result File (PDF / Image) — optional</Label>
                <div className="flex gap-2 items-center">
                  <label className="flex-1 cursor-pointer">
                    <div className="border border-dashed rounded px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors flex items-center gap-2">
                      {uploadingFile ? <Loader2 className="h-3 w-3 animate-spin" /> : "📎"}
                      {uploadedFileName || (resultFileUrl ? "File attached" : "Click to upload file (PDF, JPG, PNG — max 16MB)")}
                    </div>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileUpload} disabled={uploadingFile} />
                  </label>
                </div>
                {resultFileUrl && (
                  <a href={resultFileUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 underline">View attached file</a>
                )}
              </div>
            </>
          )}

          {/* ── FREE-TEXT MODE (Radiology, Ultrasound, HSG, Pathology, Other) ── */}
          {!isStructured && (
            <>
              {/* File Upload — primary field */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Result File (PDF / Image)</Label>
                <label className="cursor-pointer block">
                  <div className="border-2 border-dashed rounded-lg px-4 py-4 text-sm text-muted-foreground hover:bg-muted/30 transition-colors flex flex-col items-center gap-1.5">
                    {uploadingFile ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="text-2xl">📎</span>}
                    <span>{uploadedFileName || (resultFileUrl ? "File attached" : "Click to upload result file (PDF, JPG, PNG — max 16MB)")}</span>
                    <span className="text-[10px]">Supported: PDF, JPG, PNG, WebP</span>
                  </div>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileUpload} disabled={uploadingFile} />
                </label>
                {resultFileUrl && (
                  <div className="flex items-center gap-2 mt-1">
                    <a href={resultFileUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 underline flex-1 truncate">View attached file</a>
                    {/* Translate button */}
                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1 shrink-0"
                      onClick={() => setShowTranslate(v => !v)}>
                      <Languages className="h-3 w-3" />Translate
                    </Button>
                  </div>
                )}
                {/* Translate panel */}
                {showTranslate && resultFileUrl && (
                  <div className="mt-2 p-3 border rounded-lg bg-muted/20 space-y-2">
                    <p className="text-xs text-muted-foreground">Translate this document to English using AI (OCR supported for scanned PDFs).</p>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1"><Lock className="h-3 w-3" />PDF Password (if protected)</Label>
                      <div className="relative">
                        <Input type={showPassword ? "text" : "password"} value={pdfPassword}
                          onChange={e => setPdfPassword(e.target.value)}
                          placeholder="Leave empty if not password-protected" className="text-xs h-7 pr-8" />
                        <button type="button" onClick={() => setShowPassword(v => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                          <Eye className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setShowTranslate(false)}>Cancel</Button>
                      <Button size="sm" className="text-xs h-7 gap-1" onClick={handleTranslateFile}
                        disabled={translating || translateDoc.isPending}>
                        {(translating || translateDoc.isPending) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3" />}
                        Translate
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Free-text notes */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Report Notes / Findings <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea value={interpretation} onChange={e => setInterpretation(e.target.value)} rows={4}
                  placeholder="Enter findings, impressions, or any relevant notes from the report..." className="text-xs" />
              </div>

              {/* Additional clinical notes */}
              <div className="space-y-1">
                <Label className="text-xs">Additional Clinical Notes (optional)</Label>
                <Textarea value={clinicalInterpretation} onChange={e => setClinicalInterpretation(e.target.value)} rows={2}
                  placeholder="Doctor's clinical context or follow-up notes..." className="text-xs" />
              </div>
            </>
          )}

          {/* Visibility — shown for both modes */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isVisibleToPatient} onChange={e => setIsVisibleToPatient(e.target.checked)} />
            Visible to patient
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={addResult.isPending}>
              {addResult.isPending ? "Saving..." : "Add Result"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
