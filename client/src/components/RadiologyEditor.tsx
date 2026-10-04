import { normaliseFileUrl } from "@/lib/fileUrl";
/**
 * RadiologyEditor — Radiology & Imaging section for MedicalIntakeForm
 *
 * UX: Progressive disclosure
 *  - Collapsed card: type label + date + attachment badges + expand button
 *  - Expanded simple view: type, date, findings, conclusion, attach report, attach images, attach DICOM
 *  - "Show structured fields" toggle reveals type-specific clinical fields (TVUS, HSG, Scrotal)
 *  - DICOM files open in a full-screen modal dialog (not inline)
 */
import { Badge } from "@/components/ui/badge";
import SavedTranslationsPanel from "@/components/SavedTranslationsPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { DicomViewer } from "@/components/DicomViewer";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  ImageIcon,
  Loader2,
  Maximize2,
  Paperclip,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { isFutureDate, todayISO } from "@/lib/dateValidation";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FemaleStudyType = "tvus" | "hsg" | "mri" | "ct" | "mammography" | "xray" | "other";
export type MaleStudyType = "scrotal" | "other";

export interface TVUSFields {
  uterusLength?: string;
  uterusWidth?: string;
  uterusHeight?: string;
  uterusPosition?: string;
  endometrialThickness?: string;
  endometrialPattern?: string;
  uterusNotes?: string;       // free-text clinical observations (e.g. adenomyosis, scar appearance)
  rightOvarySize?: string;
  rightOvaryAFC?: string;
  leftOvarySize?: string;
  leftOvaryAFC?: string;
  dominantFollicle?: string;
  ovarianNotes?: string;      // additional ovarian findings (e.g. corpus luteum, endometrioma, cyst)
}

export interface HSGFields {
  uterineCavity?: string;
  rightTubePatency?: string;
  leftTubePatency?: string;
}

export interface ScrotalFields {
  rightTestisLength?: string;
  rightTestisWidth?: string;
  leftTestisLength?: string;
  leftTestisWidth?: string;
  epididymis?: string;
  varicoceleGrade?: string;
}

export interface RadiologyImage {
  id: string;
  fileKey?: string;
  fileUrl?: string;
  fileName?: string;
  fileMimeType?: string;
  docId?: number;
  label?: string;
}

export interface RadiologyDicom {
  id: string;
  fileKey?: string;
  fileUrl?: string;
  fileName?: string;
  docId?: number;
  label?: string;
}

export interface RadiologyStudy {
  id: string;
  type: FemaleStudyType | MaleStudyType;
  date?: string;
  performedBy?: string;
  studyName?: string;
  findings?: string;
  conclusion?: string;
  tvus?: TVUSFields;
  hsg?: HSGFields;
  scrotal?: ScrotalFields;
  fileKey?: string;
  fileUrl?: string;
  fileName?: string;
  fileMimeType?: string;
  docId?: number;
  lifecycleStatus?: string;
  images?: RadiologyImage[];
  dicomFiles?: RadiologyDicom[];
  translations?: { en?: string; ar?: string; tr?: string };
}

// ─── Label maps ──────────────────────────────────────────────────────────────

const FEMALE_TYPE_LABELS: Record<FemaleStudyType, string> = {
  tvus: "Transvaginal / Pelvic Ultrasound",
  hsg: "HSG (Hysterosalpingography)",
  mri: "MRI",
  ct: "CT Scan",
  mammography: "Mammography",
  xray: "X-Ray",
  other: "Other Imaging",
};

const MALE_TYPE_LABELS: Record<MaleStudyType, string> = {
  scrotal: "Scrotal / Testicular Ultrasound",
  other: "Other Imaging",
};

// ─── Small field helper ───────────────────────────────────────────────────────

function F({ label, value, onChange, placeholder }: {
  label: string; value?: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value ?? ""} onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? ""} className="h-8 text-sm" />
    </div>
  );
}

// ─── Structured field editors ─────────────────────────────────────────────────

function TVUSEditor({ value, onChange }: { value: TVUSFields; onChange: (v: TVUSFields) => void }) {
  const u = (key: keyof TVUSFields, v: string) => onChange({ ...value, [key]: v });
  return (
    <div className="space-y-3 pt-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Uterus</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <F label="Length (cm)" value={value.uterusLength} onChange={v => u("uterusLength", v)} />
        <F label="Width (cm)" value={value.uterusWidth} onChange={v => u("uterusWidth", v)} />
        <F label="Height (cm)" value={value.uterusHeight} onChange={v => u("uterusHeight", v)} />
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Position</Label>
          <Select value={value.uterusPosition ?? ""} onValueChange={v => u("uterusPosition", v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {["Anteverted", "Retroverted", "Axial", "Other"].map(o =>
                <SelectItem key={o} value={o.toLowerCase()}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <F label="Endometrial Thickness (mm)" value={value.endometrialThickness} onChange={v => u("endometrialThickness", v)} />
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Endometrial Pattern</Label>
          <Select value={value.endometrialPattern ?? ""} onValueChange={v => u("endometrialPattern", v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {["Trilaminar", "Homogeneous", "Irregular", "Other"].map(o =>
                <SelectItem key={o} value={o.toLowerCase()}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Uterus Notes</Label>
        <Textarea
          value={value.uterusNotes ?? ""}
          onChange={e => u("uterusNotes", e.target.value)}
          placeholder="e.g. Heterogeneous myometrium, suspicion of adenomyosis, previous cesarean scar appearance…"
          className="text-sm min-h-[72px] resize-y"
          rows={3}
        />
      </div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-1">Ovaries</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <F label="Right Ovary Size (cm)" value={value.rightOvarySize} onChange={v => u("rightOvarySize", v)} />
        <F label="Right AFC" value={value.rightOvaryAFC} onChange={v => u("rightOvaryAFC", v)} placeholder="Antral follicle count" />
        <F label="Left Ovary Size (cm)" value={value.leftOvarySize} onChange={v => u("leftOvarySize", v)} />
        <F label="Left AFC" value={value.leftOvaryAFC} onChange={v => u("leftOvaryAFC", v)} placeholder="Antral follicle count" />
      </div>
      <F label="Dominant Follicle(s)" value={value.dominantFollicle} onChange={v => u("dominantFollicle", v)} placeholder="e.g. 18mm right ovary" />
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Other Ovarian Findings / Notes</Label>
        <Textarea
          value={value.ovarianNotes ?? ""}
          onChange={e => u("ovarianNotes", e.target.value)}
          placeholder="e.g. Corpus luteum, hemorrhagic cyst, endometrioma, simple cyst, poor visualization…"
          className="text-sm min-h-[72px] resize-y"
          rows={3}
        />
      </div>
    </div>
  );
}

function HSGEditor({ value, onChange }: { value: HSGFields; onChange: (v: HSGFields) => void }) {
  const u = (key: keyof HSGFields, v: string) => onChange({ ...value, [key]: v });
  const patencyOpts = ["Patent", "Blocked", "Partial occlusion", "Spasm", "Not visualized"];
  const cavityOpts = ["Normal", "Irregular", "Filling defect", "Bicornuate", "Septate", "Arcuate"];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Uterine Cavity</Label>
        <Select value={value.uterineCavity ?? ""} onValueChange={v => u("uterineCavity", v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>{cavityOpts.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Right Tube Patency</Label>
        <Select value={value.rightTubePatency ?? ""} onValueChange={v => u("rightTubePatency", v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>{patencyOpts.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Left Tube Patency</Label>
        <Select value={value.leftTubePatency ?? ""} onValueChange={v => u("leftTubePatency", v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>{patencyOpts.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ScrotalEditor({ value, onChange }: { value: ScrotalFields; onChange: (v: ScrotalFields) => void }) {
  const u = (key: keyof ScrotalFields, v: string) => onChange({ ...value, [key]: v });
  const varicoceleOpts = ["None", "Grade I", "Grade II", "Grade III", "Subclinical"];
  return (
    <div className="space-y-3 pt-1">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <F label="Right Testis Length (cm)" value={value.rightTestisLength} onChange={v => u("rightTestisLength", v)} />
        <F label="Right Testis Width (cm)" value={value.rightTestisWidth} onChange={v => u("rightTestisWidth", v)} />
        <F label="Left Testis Length (cm)" value={value.leftTestisLength} onChange={v => u("leftTestisLength", v)} />
        <F label="Left Testis Width (cm)" value={value.leftTestisWidth} onChange={v => u("leftTestisWidth", v)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <F label="Epididymis" value={value.epididymis} onChange={v => u("epididymis", v)} placeholder="e.g. Normal, Dilated, Cyst" />
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Varicocele</Label>
          <Select value={value.varicoceleGrade ?? ""} onValueChange={v => u("varicoceleGrade", v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>{varicoceleOpts.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// ─── AI Translation Panel ─────────────────────────────────────────────────────

function AITranslationPanel({
  study,
  onSaveTranslation,
}: {
  study: RadiologyStudy;
  onSaveTranslation: (lang: "en" | "ar" | "tr", text: string) => void;
}) {
  const [activeLang, setActiveLang] = useState<"en" | "ar" | "tr">("en");
  const [isTranslating, setIsTranslating] = useState(false);
  const translateMutation = trpc.leads.translateRadiology.useMutation();

  const handleTranslate = async (lang: "en" | "ar" | "tr") => {
    if (!study.fileUrl) {
      toast.error("Please attach a report document first.");
      return;
    }
    setIsTranslating(true);
    setActiveLang(lang);
    try {
      const result = await translateMutation.mutateAsync({
        fileUrl: study.fileUrl,
        mimeType: study.fileMimeType,
        targetLanguage: lang,
      });
      onSaveTranslation(lang, result.translatedText);
      toast.success(`Extracted in ${lang.toUpperCase()}`);
    } catch (err: any) {
      toast.error("AI extraction failed: " + (err?.message ?? "Unknown error"));
    } finally {
      setIsTranslating(false);
    }
  };

  const translations = study.translations ?? {};
  const hasAny = Object.values(translations).some(Boolean);

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/30 border-b">
        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium">AI Extract & Translate</span>
        <div className="ml-auto flex gap-1">
          {(["en", "ar", "tr"] as const).map(lang => (
            <Button
              key={lang}
              type="button"
              size="sm"
              variant={activeLang === lang && hasAny ? "default" : "outline"}
              className="h-6 px-2 text-xs"
              onClick={() => { setActiveLang(lang); if (!translations[lang]) handleTranslate(lang); }}
              disabled={isTranslating}
            >
              {isTranslating && activeLang === lang
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : lang.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>
      {hasAny ? (
        <div className="p-3">
          <div
            className="text-xs whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed"
            dir={activeLang === "ar" ? "rtl" : "ltr"}
            style={activeLang === "ar" ? { fontFamily: "Arial, sans-serif" } : undefined}
          >
            {translations[activeLang] ?? (
              <span className="text-muted-foreground italic">
                Click {activeLang.toUpperCase()} above to extract in {activeLang === "en" ? "English" : activeLang === "ar" ? "Arabic" : "Turkish"}.
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="p-3 text-xs text-muted-foreground italic">
          {study.fileUrl
            ? "Click EN, AR, or TR above to extract and translate the uploaded report."
            : "Attach a report document to enable AI extraction."}
        </div>
      )}
    </div>
  );
}

// ─── DICOM Modal Viewer ───────────────────────────────────────────────────────

function DicomModal({ dicom, onClose }: { dicom: RadiologyDicom; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden flex flex-col" style={{ height: "90vh", maxHeight: "90vh" }}>
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <span className="inline-flex items-center justify-center bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">DCM</span>
            {dicom.label || dicom.fileName || "DICOM Viewer"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden">
          {dicom.fileUrl ? (
            <DicomViewer fileUrl={normaliseFileUrl(dicom.fileUrl ?? "")} className="w-full h-full" />
          ) : (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              No file URL available.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Single study card ────────────────────────────────────────────────────────

function StudyCard({
  study,
  gender,
  onChange,
  onRemove,
  onFileUpload,
  onFileRemove,
  onImageUpload,
  onImageRemove,
  onDicomUpload,
  onDicomRemove,
  onTagUpdate,
  mode,
  entityId,
}: {
  study: RadiologyStudy;
  gender: "female" | "male";
  onChange: (s: RadiologyStudy) => void;
  onRemove: () => void;
  onFileUpload: (file: File) => void;
  onFileRemove: () => void;
  onImageUpload: (files: File[]) => void;
  onImageRemove: (imgId: string) => void;
  onDicomUpload: (files: File[]) => void;
  onDicomRemove: (dicomId: string) => void;
  onTagUpdate?: (docId: number, tag: string) => void;
  mode?: "lead" | "patient";
  entityId?: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [showStructured, setShowStructured] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ url: string; label: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const dicomInputRef = useRef<HTMLInputElement>(null);

  const u = (key: keyof RadiologyStudy, val: any) => onChange({ ...study, [key]: val });

  const typeLabels = gender === "female" ? FEMALE_TYPE_LABELS : MALE_TYPE_LABELS;
  const typeOptions = Object.entries(typeLabels);

  const hasStructuredFields = gender === "female"
    ? (study.type === "tvus" || study.type === "hsg")
    : study.type === "scrotal";

  const images: RadiologyImage[] = Array.isArray(study.images) ? study.images : [];
  const dicomFiles: RadiologyDicom[] = Array.isArray(study.dicomFiles) ? study.dicomFiles : [];

  // Collapsed summary badges
  const summaryBadges = [];
  if (study.fileUrl) summaryBadges.push({ icon: <FileText className="h-2.5 w-2.5" />, label: "Report" });
  if (images.length > 0) summaryBadges.push({ icon: <ImageIcon className="h-2.5 w-2.5" />, label: `${images.length} image${images.length > 1 ? "s" : ""}` });
  if (dicomFiles.length > 0) summaryBadges.push({ icon: <span className="text-[8px] font-bold">DCM</span>, label: `${dicomFiles.length} DICOM` });

  return (
    <>
      <Card className="radiology-card radiology-entry-card border border-border/60 shadow-sm" style={{width:'100%',maxWidth:'100%',minWidth:0,boxSizing:'border-box',overflow:'hidden'}}>
        <CardContent className="p-3 space-y-3" style={{width:'100%',maxWidth:'100%',minWidth:0,boxSizing:'border-box',overflow:'hidden'}}>

          {/* ── Header row (always visible) ── */}
          <div className="flex flex-col gap-2">
            {/* Row 1: Type selector + collapse + delete */}
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <Select value={study.type} onValueChange={v => u("type", v as any)}>
                  <SelectTrigger className="h-8 text-sm w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Collapse toggle */}
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 shrink-0"
                onClick={() => setCollapsed(c => !c)}>
                {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
              {/* Delete */}
              <Button type="button" variant="ghost" size="sm"
                className="h-8 px-2 shrink-0 text-destructive hover:text-destructive"
                onClick={onRemove}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {/* Row 2: Date field — full width, min-width:0, no overflow on mobile */}
            <div className="date-input-wrapper space-y-0.5 w-full min-w-0" style={{width:'100%',maxWidth:'100%',minWidth:0,overflow:'hidden',boxSizing:'border-box'}}>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Study Date</span>
              <input
                value={study.date ?? ""}
                max={todayISO()}
                min="1900-01-01"
                onChange={e => {
                  const v = e.target.value;
                  if (v && isFutureDate(v)) { toast.error("You cannot select a future date. Please select a valid date."); u("date", ""); return; }
                  u("date", v);
                }}
                type="date"
                style={{display:'block',width:'100%',minWidth:0,maxWidth:'100%',height:'44px',padding:'0 12px',fontSize:'14px',borderRadius:'10px',boxSizing:'border-box',overflow:'hidden',WebkitAppearance:'none',appearance:'none' as any}}
                className="date-input border bg-background focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* ── Collapsed summary ── */}
          {collapsed && summaryBadges.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {summaryBadges.map((b, i) => (
                <Badge key={i} variant="secondary" className="font-normal text-xs gap-1">
                  {b.icon}{b.label}
                </Badge>
              ))}
              {study.findings && (
                <span className="text-xs text-muted-foreground truncate max-w-xs">
                  {study.findings.slice(0, 80)}{study.findings.length > 80 ? "…" : ""}
                </span>
              )}
            </div>
          )}

          {/* ── Expanded body ── */}
          {!collapsed && (
            <div className="space-y-3">

              {/* Study name — shown for ALL study types */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Study Name / Description</Label>
                <Input
                  value={study.studyName ?? ""}
                  onChange={e => u("studyName", e.target.value)}
                  onBlur={() => {
                    if (!study.studyName?.trim()) {
                      const typeLabel = (gender === "female" ? FEMALE_TYPE_LABELS : MALE_TYPE_LABELS)[study.type as FemaleStudyType & MaleStudyType] ?? study.type;
                      const dateStr = study.date ? study.date : new Date().toISOString().slice(0, 10);
                      u("studyName", `${typeLabel} — ${dateStr}`);
                    }
                  }}
                  placeholder={`Auto-generated if empty (e.g. ${(gender === "female" ? FEMALE_TYPE_LABELS : MALE_TYPE_LABELS)[study.type as FemaleStudyType & MaleStudyType] ?? "Study"} — ${new Date().toISOString().slice(0, 10)})`}
                  className="text-sm h-8"
                />
              </div>

              {/* Findings */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Findings</Label>
                <Textarea value={study.findings ?? ""} onChange={e => u("findings", e.target.value)}
                  placeholder="Radiologist findings…" rows={2} className="text-sm resize-none" />
              </div>

              {/* Conclusion */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Conclusion / Impression</Label>
                <Textarea value={study.conclusion ?? ""} onChange={e => u("conclusion", e.target.value)}
                  placeholder="Clinical impression…" rows={2} className="text-sm resize-none" />
              </div>

              {/* ── Attach Report ── */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  Attach Report
                  <span className="text-muted-foreground font-normal text-xs">(PDF, image, or document)</span>
                </Label>
                {study.fileUrl ? (
                  <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md border text-xs">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <a href={normaliseFileUrl(study.fileUrl ?? "")} target="_blank" rel="noopener noreferrer"
                      className="truncate text-primary hover:underline flex-1 min-w-0">
                      {study.fileName ?? "View document"}
                    </a>
                    <Button type="button" variant="ghost" size="sm"
                      className="h-6 px-1.5 text-destructive hover:text-destructive shrink-0"
                      onClick={onFileRemove}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) onFileUpload(f);
                        e.target.value = "";
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-8"
                      onClick={() => fileInputRef.current?.click()}>
                      <Paperclip className="h-3 w-3" /> Attach Report
                    </Button>
                  </>
                )}
              </div>

              {/* AI Translation — Saved Translations Panel */}
              {study.docId && study.fileUrl && (
                <SavedTranslationsPanel
                  leadDocumentId={study.docId}
                  fileUrl={normaliseFileUrl(study.fileUrl ?? "")}
                  fileName={study.fileName ?? "report"}
                  mimeType={study.fileMimeType}
                  patientId={mode === "patient" ? (entityId ?? 0) : 0}
                />
              )}
              {!study.docId && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic px-1">
                  <Sparkles className="h-3 w-3" />
                  Attach a report document to enable AI extraction.
                </div>
              )}

              {/* ── Attach Images (JPEG / PNG / WebP) ── */}
              <div className="space-y-2 p-3 bg-muted/20 rounded-md border border-border/40">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-emerald-700 dark:text-emerald-400">Images</span>
                    <span className="text-muted-foreground font-normal">(JPEG, PNG, WebP)</span>
                    {images.length > 0 && (
                      <Badge variant="secondary" className="text-xs ml-1">{images.length}</Badge>
                    )}
                  </Label>
                  <>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      multiple
                      className="hidden"
                      onChange={e => {
                        const files = Array.from(e.target.files ?? []);
                        if (files.length > 0) onImageUpload(files);
                        e.target.value = "";
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-7"
                      onClick={() => imageInputRef.current?.click()}>
                      <Plus className="h-3 w-3" /> Add Images
                    </Button>
                  </>
                </div>
                {images.length > 0 ? (
                  <div className="space-y-1.5">
                    {images.map((img, idx) => (
                      <div key={img.id} className="flex items-center gap-2 p-2 bg-emerald-50/50 dark:bg-emerald-950/20 rounded border border-emerald-200/30 dark:border-emerald-800/30">
                        {/* Thumbnail — click to preview */}
                        {img.fileUrl ? (
                          <button type="button" onClick={() => setImagePreview({ url: normaliseFileUrl(img.fileUrl ?? ""), label: img.label ?? img.fileName ?? `Image ${idx + 1}` })}
                            className="w-10 h-10 rounded border border-border/40 shrink-0 overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all cursor-zoom-in">
                            <img src={normaliseFileUrl(img.fileUrl ?? "")} alt={img.label ?? img.fileName ?? "image"}
                              className="w-full h-full object-cover" />
                          </button>
                        ) : (
                          <div className="w-10 h-10 bg-muted rounded border border-border/40 shrink-0 flex items-center justify-center">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <span className="text-xs text-muted-foreground shrink-0">#{idx + 1}</span>
                        {/* Tag / label input */}
                        <Input
                          value={img.label ?? ""}
                          onChange={e => {
                            u("images", images.map(i => i.id === img.id ? { ...i, label: e.target.value } : i));
                          }}
                          onBlur={e => {
                            if (img.docId && onTagUpdate) onTagUpdate(img.docId, e.target.value);
                          }}
                          placeholder={img.fileName ?? `Image-${String(idx + 1).padStart(2, "0")}`}
                          className="h-7 text-xs flex-1 min-w-0"
                        />
                        {/* Delete button */}
                        <Button type="button" variant="ghost" size="sm"
                          className="h-7 px-1.5 text-destructive hover:text-destructive shrink-0"
                          onClick={() => onImageRemove(img.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No images attached yet.</p>
                )}
              </div>

              {/* ── Attach DICOM Files ── */}
              <div className="space-y-2 p-3 bg-blue-950/10 dark:bg-blue-900/10 rounded-md border border-blue-200/40 dark:border-blue-800/40">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">DCM</span>
                    <span className="text-blue-700 dark:text-blue-300">DICOM Files</span>
                    <span className="text-muted-foreground font-normal">(.dcm)</span>
                    {dicomFiles.length > 0 && (
                      <Badge variant="secondary" className="text-xs ml-1">{dicomFiles.length}</Badge>
                    )}
                  </Label>
                  <>
                    <input
                      ref={dicomInputRef}
                      type="file"
                      accept=".dcm,application/dicom"
                      multiple
                      className="hidden"
                      onChange={e => {
                        const files = Array.from(e.target.files ?? []);
                        if (files.length > 0) onDicomUpload(files);
                        e.target.value = "";
                      }}
                    />
                    <Button type="button" variant="outline" size="sm"
                      className="gap-1.5 text-xs h-7 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950"
                      onClick={() => dicomInputRef.current?.click()}>
                      <Plus className="h-3 w-3" /> Add DICOM
                    </Button>
                  </>
                </div>
                {dicomFiles.length > 0 ? (
                  <div className="space-y-1.5">
                    {dicomFiles.map((dcm, idx) => (
                      <div key={dcm.id} className="flex items-center gap-2 p-2 bg-blue-50/50 dark:bg-blue-950/30 rounded border border-blue-200/30 dark:border-blue-800/30">
                        <span className="inline-flex items-center justify-center bg-blue-600 text-white text-[8px] font-bold px-1 py-0.5 rounded shrink-0">DCM</span>
                        <span className="text-xs text-muted-foreground shrink-0">#{idx + 1}</span>
                        <Input
                          value={dcm.label ?? ""}
                          onChange={e => {
                            u("dicomFiles", dicomFiles.map(d => d.id === dcm.id ? { ...d, label: e.target.value } : d));
                          }}
                          onBlur={e => {
                            if (dcm.docId && onTagUpdate) onTagUpdate(dcm.docId, e.target.value);
                          }}
                          placeholder={dcm.fileName ?? "DICOM label"}
                          className="h-7 text-xs flex-1 min-w-0"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 shrink-0"
                          onClick={() => {
                            const url = normaliseFileUrl(dcm.fileUrl ?? '');
                            const label = encodeURIComponent(dcm.label || dcm.fileName || 'DICOM');
                            window.open(`/dicom-viewer?url=${encodeURIComponent(url)}&label=${label}`, '_blank');
                          }}
                          disabled={!dcm.fileUrl}
                        >
                          <Maximize2 className="h-3 w-3" /> Open Viewer
                        </Button>
                        <Button type="button" variant="ghost" size="sm"
                          className="h-7 px-1.5 text-destructive hover:text-destructive shrink-0"
                          onClick={() => onDicomRemove(dcm.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No DICOM files attached yet.</p>
                )}
              </div>

              {/* ── Show structured fields toggle (last) ── */}
              {hasStructuredFields && (
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2 text-primary hover:text-primary gap-1"
                    onClick={() => setShowStructured(s => !s)}
                  >
                    {showStructured ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {showStructured ? "Hide structured fields" : "Show structured fields"}
                  </Button>
                  {showStructured && (
                    <div className="mt-2 p-3 bg-muted/20 rounded-md border border-border/40">
                      {/* Performed by — inside structured fields */}
                      <div className="mb-3">
                        <F label="Performed by"
                          value={study.performedBy}
                          onChange={v => u("performedBy", v)}
                          placeholder="Radiologist / clinic name" />
                      </div>
                      {gender === "female" && study.type === "tvus" && (
                        <TVUSEditor value={study.tvus ?? {}} onChange={v => u("tvus", v)} />
                      )}
                      {gender === "female" && study.type === "hsg" && (
                        <HSGEditor value={study.hsg ?? {}} onChange={v => u("hsg", v)} />
                      )}
                      {gender === "male" && study.type === "scrotal" && (
                        <ScrotalEditor value={study.scrotal ?? {}} onChange={v => u("scrotal", v)} />
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </CardContent>
      </Card>

      {/* Image lightbox */}
      <Dialog open={!!imagePreview} onOpenChange={open => { if (!open) setImagePreview(null); }}>
        <DialogContent className="max-w-4xl w-full p-0 overflow-hidden bg-black border-none">
          <DialogHeader className="absolute top-0 left-0 right-0 z-10 flex flex-row items-center justify-between px-4 py-2 bg-black/60 backdrop-blur-sm">
            <DialogTitle className="text-white text-sm font-medium truncate">{imagePreview?.label}</DialogTitle>
          </DialogHeader>
          {imagePreview && (
            <div className="flex items-center justify-center min-h-[60vh] max-h-[90vh] pt-10">
              <img
                src={imagePreview.url}
                alt={imagePreview.label}
                className="max-w-full max-h-[85vh] object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main RadiologyEditor ─────────────────────────────────────────────────────

interface RadiologyEditorProps {
  gender: "female" | "male";
  value: RadiologyStudy[];
  onChange: (v: RadiologyStudy[]) => void;
  onFileUpload: (studyId: string, file: File, study: RadiologyStudy, updateStudy: (s: RadiologyStudy) => void) => void;
  onFileRemove: (studyId: string, study: RadiologyStudy, updateStudy: (s: RadiologyStudy) => void) => void;
  onImageUpload: (studyId: string, files: File[], study: RadiologyStudy, updateStudy: (s: RadiologyStudy) => void) => void;
  onImageRemove: (studyId: string, imgId: string, study: RadiologyStudy, updateStudy: (s: RadiologyStudy) => void) => void;
  onDicomUpload: (studyId: string, files: File[], study: RadiologyStudy, updateStudy: (s: RadiologyStudy) => void) => void;
  onDicomRemove: (studyId: string, dicomId: string, study: RadiologyStudy, updateStudy: (s: RadiologyStudy) => void) => void;
  onTagUpdate?: (docId: number, tag: string) => void;
  mode?: "lead" | "patient";
  entityId?: number; // leadId or patientId
}

export default function RadiologyEditor({
  gender, value, onChange,
  onFileUpload, onFileRemove,
  onImageUpload, onImageRemove,
  onDicomUpload, onDicomRemove,
  onTagUpdate,
  mode = "lead",
  entityId = 0,
}: RadiologyEditorProps) {
  const defaultType: FemaleStudyType | MaleStudyType = gender === "female" ? "tvus" : "scrotal";

  // Defensive: ensure value is always an array (guards against null/undefined/double-encoded JSON)
  const safeValue: RadiologyStudy[] = Array.isArray(value) ? value : [];

  const addStudy = () => {
    const newStudy: RadiologyStudy = {
      id: `rad_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: defaultType,
      date: "",
      performedBy: "",
      findings: "",
      conclusion: "",
      images: [],
      dicomFiles: [],
    };
    onChange([...safeValue, newStudy]);
  };

  const updateStudy = (id: string, updated: RadiologyStudy) => {
    onChange(safeValue.map(s => s.id === id ? updated : s));
  };

  const removeStudy = (id: string) => {
    onChange(safeValue.filter(s => s.id !== id));
  };

  return (
    <div className="space-y-3">
      {safeValue.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          No imaging studies added yet. Click "Add Study" to record an ultrasound, MRI, or other radiology report.
        </p>
      )}
      {safeValue.map(study => (
        <StudyCard
          key={study.id}
          study={study}
          gender={gender}
          onChange={updated => updateStudy(study.id, updated)}
          onRemove={() => removeStudy(study.id)}
          onFileUpload={file => onFileUpload(study.id, file, study, updated => updateStudy(study.id, updated))}
          onFileRemove={() => onFileRemove(study.id, study, updated => updateStudy(study.id, updated))}
          onImageUpload={files => onImageUpload(study.id, files, study, updated => updateStudy(study.id, updated))}
          onImageRemove={imgId => onImageRemove(study.id, imgId, study, updated => updateStudy(study.id, updated))}
          onDicomUpload={files => onDicomUpload(study.id, files, study, updated => updateStudy(study.id, updated))}
          onDicomRemove={dicomId => onDicomRemove(study.id, dicomId, study, updated => updateStudy(study.id, updated))}
          onTagUpdate={onTagUpdate}
          mode={mode}
          entityId={entityId}
        />
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addStudy}>
        <Plus className="h-3 w-3" /> Add Study
      </Button>
    </div>
  );
}
