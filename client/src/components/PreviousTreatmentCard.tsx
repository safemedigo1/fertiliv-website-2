import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronDown, ChevronUp, Trash2, Plus, FileText, EyeOff, Lock, X,
  Paperclip, Loader2, ExternalLink, KeyRound, Pencil, AlertTriangle, CheckCircle2, Info, Sparkles
} from "lucide-react";
import SavedTranslationsPanel from "@/components/SavedTranslationsPanel";
import { toast } from "sonner";
import { isFutureDate, isFutureMonth, todayISO, currentMonthISO } from "@/lib/dateValidation";
import {
  computeOocyteMaturitySummary,
  computeFertilizationSummary,
  toNumeric,
  resolvePgtTested,
  pgtTestedLabel,
  hasConflictingPgtData,
  getInseminatedInjectedLabel,
} from "@/lib/artCycleHelpers";

// ─── Safe array helper ────────────────────────────────────────────────────────
// Prevents .map() crashes when a field is stored as a JSON string or null
function asArray<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[];
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed as T[];
      if (typeof parsed === "string") {
        const inner = JSON.parse(parsed);
        if (Array.isArray(inner)) return inner as T[];
      }
    } catch {}
  }
  return [];
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmbryoDetail {
  id: string;
  stage?: string;
  grade?: string;
  gender?: string;
  // PGT tri-state
  pgtTested?: boolean | null;  // true=Tested | false=Not tested | null/undefined=Not reported
  pgtStatus?: string;          // actual result/classification (not "tested" sentinel)
  pgtNotes?: string;
  pgtFileKey?: string;
  pgtFileUrl?: string;
  pgtFileName?: string;
  pgtFilePassword?: string;
  pgtFileTag?: string;
  pgtDocId?: number;
}

export interface ARTCycle {
  id: string;
  type: "IVF" | "ICSI" | "FET" | "IUI" | "OI" | "DonorEggIVF" | "Other";
  date: string;
  clinic: string;
  outcome: string;
  notes: string;
  // IVF / ICSI / DonorEggIVF
  protocol?: string;
  // Oocyte retrieval — eggsCollected is canonical (do NOT create oocytesRetrieved)
  eggsCollected?: number | "I don't know";  // canonical: Total Oocytes Retrieved
  // Oocyte maturity breakdown
  miiOocytes?: number | null;                // MII Oocytes — Mature
  miOocytes?: number | null;                 // MI Oocytes — Immature
  gvOocytes?: number | null;                 // GV Oocytes — Immature
  degeneratedOocytes?: number | null;        // Degenerated / Atretic Oocytes
  // Fertilization denominator
  oocytesInseminatedOrInjected?: number | null;
  // Fertilization assessment — embryosFertilized is canonical for 2PN (do NOT create pn2)
  embryosFertilized?: number | "I don't know";  // canonical: 2PN — Normally Fertilized
  pn0?: number | null;    // 0PN — No Pronuclei Observed
  pn1?: number | null;    // 1PN — One Pronucleus
  pn3plus?: number | null; // ≥3PN — Three or More Pronuclei
  transferredCount?: number | "I don't know";
  transferredEmbryos?: EmbryoDetail[];
  frozenCount?: number | "I don't know";
  frozenEmbryos?: EmbryoDetail[];
  hasSecondCollection?: boolean;
  secondCollection?: {
    eggsCollected?: number | "I don't know";
    miiOocytes?: number | null;
    miOocytes?: number | null;
    gvOocytes?: number | null;
    degeneratedOocytes?: number | null;
    oocytesInseminatedOrInjected?: number | null;
    embryosFertilized?: number | "I don't know";
    pn0?: number | null;
    pn1?: number | null;
    pn3plus?: number | null;
    transferredCount?: number | "I don't know";
    transferredEmbryos?: EmbryoDetail[];
    frozenCount?: number | "I don't know";
    frozenEmbryos?: EmbryoDetail[];
  };
  donorType?: string;
  // FET
  fetProtocol?: string;
  linkedCycleId?: string;
  fetEmbryos?: EmbryoDetail[];
  // IUI
  iuiStimulation?: string;
  iuiFollicleCount?: number;
  iuiSpermSource?: string;
  // OI
  oiMedication?: string;
  oiFollicleCount?: number;
  oiFollowUp?: string;
  // Other
  otherDescription?: string;
  // Cycle-level report attachment (separate from per-embryo PGT docs)
  cycleFileKey?: string;
  cycleFileUrl?: string;
  cycleFileName?: string;
  cycleFilePassword?: string;
  cycleFileTag?: string;
  cycleDocId?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CYCLE_TYPES = [
  { value: "IVF", label: "IVF" },
  { value: "ICSI", label: "ICSI" },
  { value: "FET", label: "FET (Frozen Embryo Transfer)" },
  { value: "IUI", label: "IUI (Intrauterine Insemination)" },
  { value: "OI", label: "Ovulation Induction (OI)" },
  { value: "DonorEggIVF", label: "Donor Egg IVF" },
  { value: "Other", label: "Other" },
];

const OUTCOMES = [
  "Negative",
  "Chemical Pregnancy",
  "Clinical Pregnancy",
  "Miscarriage",
  "Live Birth",
  "Ongoing Pregnancy",
  "Cancelled",
  "Other",
];

const PROTOCOLS = [
  "Long Protocol (GnRH agonist)",
  "Short / Flare Protocol",
  "Antagonist Protocol",
  "Natural Cycle",
  "Mini IVF",
  "Other",
];

const FET_PROTOCOLS = [
  "Natural Cycle FET",
  "Medicated FET (Estrogen + Progesterone)",
  "Modified Natural Cycle FET",
  "Other",
];

const EMBRYO_STAGES = [
  "Day 2 embryo",
  "Day 3 embryo / cleavage stage",
  "Day 4 morula",
  "Day 5 blastocyst",
  "Day 6 blastocyst",
  "Day 7 blastocyst",
  "I don't know",
  "Other",
];

const EMBRYO_GRADES = [
  "AA", "AB", "BA", "BB",
  "AC", "CA", "BC", "CB", "CC",
  "Grade 1", "Grade 2", "Grade 3", "Grade 4",
  "Excellent", "Good", "Fair", "Poor",
  "I don't know",
  "Other",
];

const GENDERS = ["Unknown", "Male", "Female"];

const PGT_STATUSES_ALL = [
  "Not tested",
  "Normal (Euploid)",
  "Abnormal (Aneuploid)",
  "Mosaic",
  "Inconclusive",
  "Other",
];

const PGT_STATUSES = PGT_STATUSES_ALL.filter(s => s !== "Not tested");

const IUI_SPERM_SOURCES = ["Husband", "Donor", "Other"];
const OI_FOLLOW_UP = ["Timed Intercourse", "IUI", "Other"];
const DONOR_TYPES = ["Anonymous Donor", "Known Donor", "Other"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function newEmbryo(): EmbryoDetail {
  return { id: uid(), gender: "Unknown", pgtStatus: "Not tested" };
}

/** Build a dropdown list [0..max] + "I don't know". If max is unknown, use 50. */
function buildCountOptions(max: number | "I don't know" | undefined, fallback = 50): string[] {
  const limit = typeof max === "number" ? max : fallback;
  const opts: string[] = [];
  for (let i = 0; i <= limit; i++) opts.push(String(i));
  opts.push("I don't know");
  return opts;
}

function OtherSelect({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
}) {
  const isCustom = value && !options.includes(value) && value !== "Other";
  const [showCustom, setShowCustom] = useState(isCustom);
  const [customVal, setCustomVal] = useState(isCustom ? value : "");

  const handleSelect = (v: string) => {
    if (v === "Other") {
      setShowCustom(true);
      onChange(customVal || "");
    } else {
      setShowCustom(false);
      onChange(v);
    }
  };

  return (
    <div className="space-y-1">
      <Select value={showCustom ? "Other" : (value || "")} onValueChange={handleSelect}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={placeholder || "Select..."} />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          {!options.includes("Other") && <SelectItem value="Other">Other</SelectItem>}
        </SelectContent>
      </Select>
      {showCustom && (
        <Input
          className="h-7 text-xs"
          placeholder="Specify..."
          value={customVal}
          onChange={e => { setCustomVal(e.target.value); onChange(e.target.value); }}
        />
      )}
    </div>
  );
}

/** Simple dropdown from a string[] of values */
function SimpleSelect({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
}) {
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder={placeholder || "Select..."} />
      </SelectTrigger>
      <SelectContent>
        {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function F({ label, value, onChange, type = "text", placeholder, historical }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; historical?: boolean;
}) {
  const isDateLike = type === "date" || type === "month";
  const [dateError, setDateError] = useState("");
  const effectiveMax = isDateLike && historical ? (type === "month" ? currentMonthISO() : todayISO()) : undefined;
  const handleChange = (v: string) => {
    if (historical && isDateLike && v) {
      const isFuture = type === "month" ? isFutureMonth(v) : isFutureDate(v);
      if (isFuture) {
        setDateError("You cannot select a future date. Please select a valid date.");
        onChange(""); // clear the field
        return;
      }
    }
    setDateError("");
    onChange(v);
  };
  return (
    <div className="space-y-1 month-year-field date-input-wrapper" style={isDateLike ? {minWidth:0,maxWidth:'100%',width:'100%',boxSizing:'border-box' as any} : undefined}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {isDateLike ? (
        <>
        <input
          type={type}
          value={value}
          max={effectiveMax}
          min="1900-01-01"
          onChange={e => handleChange(e.target.value)}
          className="month-year-input date-input"
          style={{display:'block',width:'100%',minWidth:0,maxWidth:'100%',height:'32px',padding:'0 8px',fontSize:'12px',borderRadius:'8px',boxSizing:'border-box' as any,border:`1px solid ${dateError ? '#ef4444' : '#dcdfe5'}`,background:'#ffffff',color:'#111827',WebkitAppearance:'none',appearance:'none' as any,outline:'none'}}
        />
        {dateError && <p className="text-[10px] text-red-500 leading-tight pt-0.5">{dateError}</p>}
        </>
      ) : (
        <Input className="h-8 text-xs" type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}

// ─── PGT Document Upload Row ──────────────────────────────────────────────────

function PGTDocRow({
  embryo, onChange, onUpload, isUploading, cycleIndex, embryoIndex, section, mode, entityId
}: {
  embryo: EmbryoDetail;
  onChange: (updated: EmbryoDetail) => void;
  onUpload: (file: File) => void;
  isUploading: boolean;
  cycleIndex: number;
  embryoIndex: number;
  section: string;
  mode?: "lead" | "patient";
  entityId?: number;
}) {
  const [showPw, setShowPw] = useState(false);
  const autoTag = `PGT-${section}-Cycle${cycleIndex + 1}-Embryo${embryoIndex + 1}`;

  return (
    <div className="mt-1.5 space-y-1.5 border-t pt-1.5">
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          <FileText className="h-3 w-3" /> PGT Document
        </Label>
        {embryo.pgtFileUrl ? (
          <div className="flex items-center gap-1.5 flex-1 flex-wrap">
            <a href={embryo.pgtFileUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary underline truncate max-w-[140px]">
              {embryo.pgtFileName || "Document"}
            </a>
            <label className="cursor-pointer">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden"
                onChange={e => { if (e.target.files?.[0]) onUpload(e.target.files[0]); }} />
              <span className="text-xs text-muted-foreground underline">
                {isUploading ? "Uploading..." : "Replace"}
              </span>
            </label>
            <Button variant="ghost" size="icon" className="h-5 w-5"
              onClick={() => onChange({ ...embryo, pgtFileKey: undefined, pgtFileUrl: undefined, pgtFileName: undefined, pgtDocId: undefined })}>
              <X className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        ) : (
          <label className="cursor-pointer">
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden"
              onChange={e => { if (e.target.files?.[0]) onUpload(e.target.files[0]); }} />
            <span className="text-xs text-primary underline">
              {isUploading ? "Uploading..." : "+ Upload PGT result"}
            </span>
          </label>
        )}
      </div>
      {embryo.pgtFileUrl && (
        <>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-10">Tag</Label>
            <Input className="h-6 text-xs flex-1" value={embryo.pgtFileTag ?? autoTag}
              onChange={e => onChange({ ...embryo, pgtFileTag: e.target.value })} />
          </div>
          {/* AI Extraction panel — shown when a document is uploaded and has a docId */}
          {embryo.pgtDocId != null && embryo.pgtFileUrl && (
            <SavedTranslationsPanel
              leadDocumentId={embryo.pgtDocId}
              fileUrl={embryo.pgtFileUrl}
              fileName={embryo.pgtFileName || "PGT Document"}
              mimeType={embryo.pgtFileName?.toLowerCase().endsWith(".pdf") ? "application/pdf" : undefined}
              patientId={mode === "patient" ? (entityId ?? 0) : 0}
              intakeSection={`PGT-${section}`}
            />
          )}
          {/* Legacy PGT file: uploaded before Batch 3 (has fileUrl but no docId) */}
          {embryo.pgtFileUrl && embryo.pgtDocId == null && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 italic px-1">
              <Sparkles className="h-3 w-3 shrink-0" />
              Re-upload this file to enable AI extraction.
            </div>
          )}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1 w-10">
              <Lock className="h-3 w-3" /> PW
            </Label>
            {embryo.pgtFilePassword ? (
              <Badge variant="secondary" className="text-xs gap-1 cursor-pointer"
                onClick={() => onChange({ ...embryo, pgtFilePassword: undefined })}>
                Password set · clear
              </Badge>
            ) : (
              <button className="text-xs text-muted-foreground underline"
                onClick={() => setShowPw(p => !p)}>
                {showPw ? "Cancel" : "+ Add password (if protected)"}
              </button>
            )}
            {showPw && !embryo.pgtFilePassword && (
              <div className="flex items-center gap-1">
                <Input className="h-6 text-xs w-32" type="text"
                  placeholder="Enter password"
                  onBlur={e => { if (e.target.value) { onChange({ ...embryo, pgtFilePassword: e.target.value }); setShowPw(false); } }} />
                <button onClick={() => setShowPw(false)}><EyeOff className="h-3 w-3 text-muted-foreground" /></button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Classification Summary Banner ───────────────────────────────────────────

function ClassificationBanner({ classified, denominator, remaining, severity, message }: {
  classified: number;
  denominator: number;
  remaining: number;
  severity: "error" | "warning" | "ok";
  message: string | null;
}) {
  if (denominator === 0 || (severity === "ok" && !message)) return null;
  return (
    <div className={`flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs ${
      severity === "error" ? "bg-destructive/10 text-destructive border border-destructive/20" :
      severity === "warning" ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800" :
      "bg-muted/50 text-muted-foreground"
    }`}>
      {severity === "error" ? <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> :
       severity === "warning" ? <Info className="h-3 w-3 mt-0.5 shrink-0" /> :
       <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" />}
      <span>
        Classified: <strong>{classified}</strong> of <strong>{denominator}</strong>
        {remaining > 0 && <> · Remaining: <strong>{remaining}</strong></>}
        {message && <> · {message}</>}
      </span>
    </div>
  );
}

// ─── Single Frozen Embryo Row ─────────────────────────────────────────────────

function FrozenEmbryoRow({
  embryo, index, onChange, onRemove, onUpload, isUploading, cycleIndex, section, mode, entityId
}: {
  embryo: EmbryoDetail;
  index: number;
  onChange: (e: EmbryoDetail) => void;
  onRemove: () => void;
  onUpload: (file: File) => void;
  isUploading: boolean;
  cycleIndex: number;
  section: string;
  mode?: "lead" | "patient";
  entityId?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  // PGT tri-state: resolved from pgtTested (new) or legacy pgtStatus
  const resolvedPgt = resolvePgtTested(embryo);
  const pgtLabel = pgtTestedLabel(resolvedPgt);

  const summary = [
    embryo.stage,
    embryo.grade,
    resolvedPgt === true && embryo.gender && embryo.gender !== "Unknown" ? embryo.gender : null,
    resolvedPgt !== null ? `PGT: ${pgtLabel}` : null,
  ].filter(Boolean).join(" · ");

  const handlePgtTriState = (value: "not-reported" | "tested" | "not-tested") => {
    if (value === "tested") {
      onChange({ ...embryo, pgtTested: true });
    } else if (value === "not-tested") {
      // Warn if conflicting data exists, but do NOT delete it
      if (hasConflictingPgtData(embryo)) {
        toast.warning("PGT result, notes, or attachment are preserved but hidden. Change back to Tested to access them.");
      }
      onChange({ ...embryo, pgtTested: false });
    } else {
      onChange({ ...embryo, pgtTested: null });
    }
  };

  return (
    <div className="border rounded-md bg-background">
      <div className="flex items-center justify-between px-2 py-1.5 cursor-pointer"
        onClick={() => setExpanded(e => !e)}>
        <span className="text-xs font-medium text-muted-foreground">
          Embryo {index + 1}
          {summary ? <span className="ml-2 text-foreground/70">{summary}</span> : null}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={e => { e.stopPropagation(); onRemove(); }}>
            <X className="h-3 w-3 text-destructive" />
          </Button>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </div>
      {expanded && (
        <div className="px-2 pb-2 space-y-2">
          {/* Stage + Grade */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Development Stage</Label>
              <OtherSelect value={embryo.stage ?? ""} onChange={v => onChange({ ...embryo, stage: v })} options={EMBRYO_STAGES} placeholder="Select stage" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Grade / Quality</Label>
              <OtherSelect value={embryo.grade ?? ""} onChange={v => onChange({ ...embryo, grade: v })} options={EMBRYO_GRADES} placeholder="Select grade" />
            </div>
          </div>

          {/* PGT tri-state control */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">PGT Testing</Label>
            <div className="flex gap-1.5">
              {(["not-reported", "tested", "not-tested"] as const).map(opt => {
                const isActive =
                  opt === "tested" ? resolvedPgt === true :
                  opt === "not-tested" ? resolvedPgt === false :
                  resolvedPgt === null;
                const label = opt === "not-reported" ? "Not reported" : opt === "tested" ? "Tested" : "Not tested";
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handlePgtTriState(opt)}
                    className={`flex-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-input hover:bg-muted/50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* PGT detail — only when Tested */}
          {resolvedPgt === true && (
            <div className="space-y-2 pl-4 border-l-2 border-primary/20">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">PGT Result</Label>
                  <OtherSelect
                    value={embryo.pgtStatus ?? ""}
                    onChange={v => onChange({ ...embryo, pgtStatus: v })}
                    options={PGT_STATUSES}
                    placeholder="Select PGT result"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Gender (from PGT)</Label>
                  <SimpleSelect
                    value={embryo.gender ?? "Unknown"}
                    onChange={v => onChange({ ...embryo, gender: v })}
                    options={GENDERS}
                  />
                </div>
              </div>
              <F label="PGT Notes" value={embryo.pgtNotes ?? ""} onChange={v => onChange({ ...embryo, pgtNotes: v })} placeholder="e.g. Chromosome 21 trisomy" />
              <PGTDocRow
                embryo={embryo} onChange={onChange} onUpload={onUpload} isUploading={isUploading}
                cycleIndex={cycleIndex} embryoIndex={index} section={section}
                mode={mode} entityId={entityId}
              />
            </div>
          )}

          {/* Warning when Not tested but conflicting data exists */}
          {resolvedPgt === false && hasConflictingPgtData(embryo) && (
            <div className="flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>PGT data exists but is hidden because this embryo is marked as Not tested. Change to Tested to access it.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── IVF / ICSI / DonorEggIVF Fields (three-tier) ────────────────────────────

function IVFFields({
  cycle, onChange, onUpload, uploadingMap, cycleIndex, isSecond = false, mode, entityId
}: {
  cycle: Partial<ARTCycle>;
  onChange: (updates: Partial<ARTCycle>) => void;
  onUpload: (section: string, i: number, file: File) => void;
  uploadingMap: Record<string, Record<number, boolean>>;
  cycleIndex: number;
  isSecond?: boolean;
  mode?: "lead" | "patient";
  entityId?: number;
}) {
  const prefix = isSecond ? "2nd" : "1st";

  // Canonical fields:
  //   eggsCollected       = Total Oocytes Retrieved (do NOT use oocytesRetrieved)
  //   embryosFertilized   = 2PN — Normally Fertilized (do NOT use pn2)
  //   oocytesInseminatedOrInjected = fertilization denominator
  const eggsCollected = typeof cycle.eggsCollected === "number" ? cycle.eggsCollected : null;
  const inseminated = cycle.oocytesInseminatedOrInjected ?? null;
  const fertilized = typeof cycle.embryosFertilized === "number" ? cycle.embryosFertilized : null;
  const transferred = cycle.transferredCount;
  const frozenCount = cycle.frozenCount;

  // Maturity fields are disabled until eggsCollected is a valid number
  const maturityDisabled = eggsCollected === null;
  // PN fields are disabled until oocytesInseminatedOrInjected is a valid number
  const pnDisabled = inseminated === null;

  // Dynamic option lists
  const transferredOptions = buildCountOptions(
    typeof fertilized === "number" ? fertilized : undefined,
    50
  );
  const remaining =
    typeof fertilized === "number" && typeof transferred === "number"
      ? Math.max(0, fertilized - transferred)
      : undefined;
  const showFrozen = remaining === undefined || remaining > 0;
  const frozenOptions = buildCountOptions(remaining, 50);

  // Sync frozen embryo rows when frozenCount changes
  const frozenEmbryos = asArray<EmbryoDetail>(cycle.frozenEmbryos);
  const handleFrozenCountChange = (val: string) => {
    const n = val === "I don't know" ? "I don't know" : parseInt(val);
    if (typeof n === "number") {
      const current = [...frozenEmbryos];
      if (n > current.length) {
        for (let i = current.length; i < n; i++) current.push(newEmbryo());
      } else {
        current.splice(n);
      }
      onChange({ frozenCount: n, frozenEmbryos: current });
    } else {
      onChange({ frozenCount: n as any });
    }
  };

  const handleTransferredCountChange = (val: string) => {
    const n = val === "I don't know" ? "I don't know" : parseInt(val);
    onChange({ transferredCount: n as any });
  };

  // Helper to format nullable number for display
  const numVal = (v: number | null | undefined) => v != null ? String(v) : "";

  const sectionBase = `${cycle.type ?? "IVF"}-${prefix}`;
  const inseminatedLabel = getInseminatedInjectedLabel(cycle.type);

  // Compute classification summaries for banners
  const maturitySummary = computeOocyteMaturitySummary({
    eggsCollected: cycle.eggsCollected,
    miiOocytes: cycle.miiOocytes,
    miOocytes: cycle.miOocytes,
    gvOocytes: cycle.gvOocytes,
    degeneratedOocytes: cycle.degeneratedOocytes,
  });
  const fertSummary = computeFertilizationSummary({
    oocytesInseminatedOrInjected: cycle.oocytesInseminatedOrInjected,
    embryosFertilized: cycle.embryosFertilized,
    pn0: cycle.pn0,
    pn1: cycle.pn1,
    pn3plus: cycle.pn3plus,
  });

  const inputCls = (disabled: boolean) =>
    `flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm ${
      disabled ? "opacity-50 cursor-not-allowed bg-muted" : ""
    }`;

  return (
    <div className="space-y-4">
      {/* ── Oocyte Retrieval ─────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Oocyte Retrieval</Label>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Total Oocytes Retrieved</Label>
          <input
            type="number" min={0} max={99}
            className={inputCls(false)}
            value={numVal(eggsCollected)}
            onChange={e => {
              const n = e.target.value === "" ? undefined : parseInt(e.target.value);
              onChange({ eggsCollected: n as any });
            }}
            placeholder="e.g. 12"
          />
        </div>

        {/* Oocyte Maturity Breakdown subsection */}
        <div className="space-y-2 pl-3 border-l-2 border-muted">
          <Label className="text-xs font-medium text-muted-foreground">Oocyte Maturity Breakdown</Label>
          {maturityDisabled && (
            <p className="text-xs text-muted-foreground italic">Enter Total Oocytes Retrieved first.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">MII Oocytes — Mature</Label>
              <input
                type="number" min={0} max={99}
                disabled={maturityDisabled}
                className={inputCls(maturityDisabled)}
                value={numVal(cycle.miiOocytes)}
                onChange={e => { const n = e.target.value === "" ? null : parseInt(e.target.value); onChange({ miiOocytes: n }); }}
                placeholder="e.g. 9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">MI Oocytes — Immature</Label>
              <input
                type="number" min={0} max={99}
                disabled={maturityDisabled}
                className={inputCls(maturityDisabled)}
                value={numVal(cycle.miOocytes)}
                onChange={e => { const n = e.target.value === "" ? null : parseInt(e.target.value); onChange({ miOocytes: n }); }}
                placeholder="e.g. 1"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">GV Oocytes — Immature</Label>
              <input
                type="number" min={0} max={99}
                disabled={maturityDisabled}
                className={inputCls(maturityDisabled)}
                value={numVal(cycle.gvOocytes)}
                onChange={e => { const n = e.target.value === "" ? null : parseInt(e.target.value); onChange({ gvOocytes: n }); }}
                placeholder="e.g. 1"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Degenerated / Atretic Oocytes</Label>
              <input
                type="number" min={0} max={99}
                disabled={maturityDisabled}
                className={inputCls(maturityDisabled)}
                value={numVal(cycle.degeneratedOocytes)}
                onChange={e => { const n = e.target.value === "" ? null : parseInt(e.target.value); onChange({ degeneratedOocytes: n }); }}
                placeholder="e.g. 1"
              />
            </div>
          </div>
          {!maturityDisabled && (
            <ClassificationBanner {...maturitySummary} />
          )}
        </div>
      </div>

      {/* ── Fertilization Input (denominator) ────────────────────────────────── */}
      <div className="space-y-2 pt-1 border-t">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fertilization Input</Label>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{inseminatedLabel}</Label>
          <input
            type="number" min={0} max={99}
            className={inputCls(false)}
            value={numVal(inseminated)}
            onChange={e => {
              const n = e.target.value === "" ? null : parseInt(e.target.value);
              onChange({ oocytesInseminatedOrInjected: n });
            }}
            placeholder="e.g. 10"
          />
          {/* Cross-field: inseminated/injected must not exceed retrieved */}
          {inseminated !== null && eggsCollected !== null && inseminated > eggsCollected && (
            <div className="flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs bg-destructive/10 text-destructive border border-destructive/20 mt-1">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{inseminatedLabel} ({inseminated}) cannot exceed Total Oocytes Retrieved ({eggsCollected}). This will block saving.</span>
            </div>
          )}
        </div>

        {/* Fertilization Assessment subsection */}
        <div className="space-y-2 pl-3 border-l-2 border-muted">
          <Label className="text-xs font-medium text-muted-foreground">Fertilization Assessment</Label>
          {pnDisabled && (
            <p className="text-xs text-muted-foreground italic">Enter {inseminatedLabel} first.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">0PN — No Pronuclei Observed</Label>
              <input
                type="number" min={0} max={99}
                disabled={pnDisabled}
                className={inputCls(pnDisabled)}
                value={numVal(cycle.pn0)}
                onChange={e => { const n = e.target.value === "" ? null : parseInt(e.target.value); onChange({ pn0: n }); }}
                placeholder="e.g. 0"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">1PN — One Pronucleus</Label>
              <input
                type="number" min={0} max={99}
                disabled={pnDisabled}
                className={inputCls(pnDisabled)}
                value={numVal(cycle.pn1)}
                onChange={e => { const n = e.target.value === "" ? null : parseInt(e.target.value); onChange({ pn1: n }); }}
                placeholder="e.g. 0"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">2PN — Normally Fertilized</Label>
              <input
                type="number" min={0} max={99}
                disabled={pnDisabled}
                className={inputCls(pnDisabled)}
                value={numVal(fertilized)}
                onChange={e => {
                  const n = e.target.value === "" ? undefined : parseInt(e.target.value);
                  onChange({ embryosFertilized: n as any });
                }}
                placeholder="e.g. 8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">&ge;3PN — Three or More Pronuclei</Label>
              <input
                type="number" min={0} max={99}
                disabled={pnDisabled}
                className={inputCls(pnDisabled)}
                value={numVal(cycle.pn3plus)}
                onChange={e => { const n = e.target.value === "" ? null : parseInt(e.target.value); onChange({ pn3plus: n }); }}
                placeholder="e.g. 0"
              />
            </div>
          </div>
          {!pnDisabled && (
            <ClassificationBanner {...fertSummary} />
          )}
        </div>
      </div>

      {/* ── Transfer ─────────────────────────────────────────────────────────── */}
      <div className="space-y-2 pt-1 border-t">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Transfer</Label>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Embryos Transferred</Label>
          <SimpleSelect
            value={transferred !== undefined ? String(transferred) : ""}
            onChange={handleTransferredCountChange}
            options={transferredOptions}
            placeholder="Select..."
          />
        </div>
      </div>

      {/* Frozen embryos */}
      {showFrozen && (
        <div className="space-y-2 pt-1 border-t">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium text-muted-foreground">Frozen Embryos</Label>
            {remaining !== undefined && (
              <span className="text-xs text-muted-foreground">
                {remaining} remaining after transfer
              </span>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Number of Frozen Embryos</Label>
            <SimpleSelect
              value={frozenCount !== undefined ? String(frozenCount) : ""}
              onChange={handleFrozenCountChange}
              options={frozenOptions}
              placeholder="Select..."
            />
          </div>
          {frozenEmbryos.length > 0 && (
            <div className="space-y-1.5 pl-2 border-l-2 border-muted">
              {frozenEmbryos.map((em, i) => (
                <FrozenEmbryoRow
                  key={em.id} embryo={em} index={i}
                  onChange={updated => {
                    const arr = [...frozenEmbryos];
                    arr[i] = updated;
                    onChange({ frozenEmbryos: arr });
                  }}
                  onRemove={() => {
                    const arr = frozenEmbryos.filter((_, idx) => idx !== i);
                    onChange({ frozenCount: arr.length, frozenEmbryos: arr });
                  }}
                  onUpload={file => onUpload(`frozen-${prefix}`, i, file)}
                  isUploading={!!(uploadingMap[`frozen-${prefix}`]?.[i])}
                  cycleIndex={cycleIndex} section={`${sectionBase}-Frozen`}
                  mode={mode} entityId={entityId}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FET Fields ───────────────────────────────────────────────────────────────

function FETFields({
  cycle, onChange, onUpload, uploadingMap, cycleIndex, allCycles, mode, entityId
}: {
  cycle: ARTCycle;
  onChange: (updates: Partial<ARTCycle>) => void;
  onUpload: (section: string, i: number, file: File) => void;
  uploadingMap: Record<string, Record<number, boolean>>;
  cycleIndex: number;
  allCycles: ARTCycle[];
  mode?: "lead" | "patient";
  entityId?: number;
}) {
  const ivfCycles = allCycles.filter((c, i) => i !== cycleIndex && ["IVF", "ICSI", "DonorEggIVF"].includes(c.type));
  const linked = ivfCycles.find(c => c.id === cycle.linkedCycleId);
  const fetEmbryos = asArray<EmbryoDetail>(cycle.fetEmbryos);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">FET Protocol</Label>
        <OtherSelect value={cycle.fetProtocol ?? ""} onChange={v => onChange({ fetProtocol: v })} options={FET_PROTOCOLS} placeholder="Select protocol" />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Source of Frozen Embryos</Label>
        <Select
          value={cycle.linkedCycleId ?? "manual"}
          onValueChange={v => onChange({ linkedCycleId: v === "manual" ? undefined : v })}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">External clinic / Not in system</SelectItem>
            {ivfCycles.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.type} — {c.clinic || "Unknown clinic"} ({c.date || "no date"})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {linked && linked.frozenEmbryos && linked.frozenEmbryos.length > 0 && (
        <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
          Linked cycle has {linked.frozenEmbryos.length} frozen embryo(s) on record.
          Enter details below for the embryo(s) used in this FET.
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Embryos Used in FET</Label>
        {fetEmbryos.length > 0 && (
          <div className="space-y-1.5 pl-2 border-l-2 border-muted">
            {fetEmbryos.map((em, i) => (
              <FrozenEmbryoRow
                key={em.id} embryo={em} index={i}
                onChange={updated => {
                  const arr = [...fetEmbryos]; arr[i] = updated;
                  onChange({ fetEmbryos: arr });
                }}
                onRemove={() => onChange({ fetEmbryos: fetEmbryos.filter((_, idx) => idx !== i) })}
                onUpload={file => onUpload("fet-embryos", i, file)}
                isUploading={!!(uploadingMap["fet-embryos"]?.[i])}
                cycleIndex={cycleIndex} section="FET"
                mode={mode} entityId={entityId}
              />
            ))}
          </div>
        )}
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
          onClick={() => onChange({ fetEmbryos: [...fetEmbryos, newEmbryo()] })}>
          <Plus className="h-3 w-3" /> Add Embryo
        </Button>
      </div>
    </div>
  );
}

// ─── IUI Fields ───────────────────────────────────────────────────────────────

function IUIFields({ cycle, onChange }: { cycle: ARTCycle; onChange: (u: Partial<ARTCycle>) => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Stimulation</Label>
        <Select value={cycle.iuiStimulation ?? ""} onValueChange={v => onChange({ iuiStimulation: v })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="None (Natural)">None (Natural)</SelectItem>
            <SelectItem value="Clomid">Clomid</SelectItem>
            <SelectItem value="Letrozole">Letrozole</SelectItem>
            <SelectItem value="Gonadotropins">Gonadotropins</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Follicles at Trigger</Label>
        <Input type="number" min={0} className="h-8 text-xs"
          value={cycle.iuiFollicleCount?.toString() ?? ""}
          onChange={e => onChange({ iuiFollicleCount: e.target.value ? parseInt(e.target.value) : undefined })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Sperm Source</Label>
        <OtherSelect value={cycle.iuiSpermSource ?? ""} onChange={v => onChange({ iuiSpermSource: v })} options={IUI_SPERM_SOURCES} placeholder="Select..." />
      </div>
    </div>
  );
}

// ─── OI Fields ────────────────────────────────────────────────────────────────

function OIFields({ cycle, onChange }: { cycle: ARTCycle; onChange: (u: Partial<ARTCycle>) => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Medication</Label>
        <OtherSelect value={cycle.oiMedication ?? ""} onChange={v => onChange({ oiMedication: v })}
          options={["Clomid", "Letrozole", "Gonadotropins (FSH)", "Metformin", "Other"]} placeholder="Select..." />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Follicles at Trigger</Label>
        <Input type="number" min={0} className="h-8 text-xs"
          value={cycle.oiFollicleCount?.toString() ?? ""}
          onChange={e => onChange({ oiFollicleCount: e.target.value ? parseInt(e.target.value) : undefined })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Follow-up</Label>
        <OtherSelect value={cycle.oiFollowUp ?? ""} onChange={v => onChange({ oiFollowUp: v })} options={OI_FOLLOW_UP} placeholder="Select..." />
      </div>
    </div>
  );
}

// ─── Main PreviousTreatmentCard ───────────────────────────────────────────────

export function PreviousTreatmentCard({
  cycle, cycleIndex, onChange, onRemove, allCycles, onFileUpload, onCycleFileUpload, onCycleFileRemove, mode, entityId
}: {
  cycle: ARTCycle;
  cycleIndex: number;
  onChange: (updated: ARTCycle) => void;
  onRemove: () => void;
  allCycles: ARTCycle[];
  onFileUpload?: (cycleId: string, section: string, embryoIndex: number, file: File, onDone: (key: string, url: string, name: string, docId?: number) => void) => void;
  onCycleFileUpload?: (file: File, onDone: (key: string, url: string, name: string, docId: number) => void) => void;
  onCycleFileRemove?: (docId?: number) => void;
  mode?: "lead" | "patient";
  entityId?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [uploadingMap, setUploadingMap] = useState<Record<string, Record<number, boolean>>>({});
  const [cycleFileUploading, setCycleFileUploading] = useState(false);
  const [showCyclePw, setShowCyclePw] = useState(!!cycle.cycleFilePassword);
  const cycleFileInputRef = useRef<HTMLInputElement>(null);

  const update = (updates: Partial<ARTCycle>) => onChange({ ...cycle, ...updates });

  // Clear any already-saved future Treatment Date on mount
  useEffect(() => {
    if (cycle.date && isFutureMonth(cycle.date)) {
      update({ date: "" });
      toast.warning("Treatment Date was in the future and has been cleared. Please enter a valid past date.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = (section: string, embryoIndex: number, file: File) => {
    setUploadingMap(m => ({ ...m, [section]: { ...(m[section] ?? {}), [embryoIndex]: true } }));
    onFileUpload?.(cycle.id, section, embryoIndex, file, (key, url, name, docId) => {
      setUploadingMap(m => ({ ...m, [section]: { ...(m[section] ?? {}), [embryoIndex]: false } }));
      const sectionLower = section.toLowerCase();
      if (sectionLower.includes("frozen")) {
        const arr = [...(cycle.frozenEmbryos ?? [])];
        if (arr[embryoIndex]) arr[embryoIndex] = { ...arr[embryoIndex], pgtFileKey: key, pgtFileUrl: url, pgtFileName: name, pgtDocId: docId };
        update({ frozenEmbryos: arr });
      } else if (sectionLower.includes("fet")) {
        const arr = [...(cycle.fetEmbryos ?? [])];
        if (arr[embryoIndex]) arr[embryoIndex] = { ...arr[embryoIndex], pgtFileKey: key, pgtFileUrl: url, pgtFileName: name, pgtDocId: docId };
        update({ fetEmbryos: arr });
      }
    });
  };

  const isIVFType = ["IVF", "ICSI", "DonorEggIVF"].includes(cycle.type);
  const isFET = cycle.type === "FET";
  const isIUI = cycle.type === "IUI";
  const isOI = cycle.type === "OI";
  const isOther = cycle.type === "Other";

  const summaryParts = [cycle.clinic, cycle.date, cycle.outcome].filter(Boolean).join(" · ");

  return (
    <div className="border rounded-lg bg-card shadow-sm fertility-treatment-card treatment-entry-card" style={{width:'100%',maxWidth:'100%',boxSizing:'border-box' as any,overflow:'visible'}}>
      {/* Card header */}
      <div className="flex items-center justify-between p-3 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-semibold">{cycle.type}</Badge>
          {summaryParts && <span className="text-xs text-muted-foreground">{summaryParts}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); onRemove(); }}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t pt-3">

          {/* ── TIER 1: Default visible fields ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Cycle Type</Label>
              <Select value={cycle.type} onValueChange={v => update({ type: v as ARTCycle["type"] })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CYCLE_TYPES.map(ct => <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <F label="Treatment Date (Month/Year)" value={cycle.date} onChange={v => update({ date: v })} type="month" historical />
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Cycle Outcome</Label>
              <OtherSelect value={cycle.outcome} onChange={v => update({ outcome: v })} options={OUTCOMES} placeholder="Select outcome" />
            </div>
          </div>

          {/* DonorEggIVF: donor type always visible */}
          {cycle.type === "DonorEggIVF" && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Donor Type</Label>
              <OtherSelect value={cycle.donorType ?? ""} onChange={v => update({ donorType: v })} options={DONOR_TYPES} placeholder="Select donor type" />
            </div>
          )}

          {/* Other: description always visible */}
          {isOther && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea className="text-xs min-h-[80px] resize-none" value={cycle.otherDescription ?? ""}
                onChange={e => update({ otherDescription: e.target.value })} placeholder="Describe the treatment..." />
            </div>
          )}

          {/* ── Show More toggle ── */}
          {!isOther && (
            <button
              className="text-xs text-primary underline flex items-center gap-1"
              onClick={() => { setShowMore(s => !s); if (showMore) setShowAdvanced(false); }}
            >
              {showMore ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showMore ? "Show less" : "Show more"}
            </button>
          )}

          {showMore && (
            <div className="space-y-3 pt-1 border-t">

              {/* ── TIER 2: Show More fields ── */}
              {isIVFType && (
                <>
                  {/* Eggs / Fertilized / Transferred */}
                  <IVFFields
                    cycle={cycle} onChange={update}
                    onUpload={handleUpload} uploadingMap={uploadingMap}
                    cycleIndex={cycleIndex} mode={mode} entityId={entityId}
                  />

                  {/* Second collection toggle */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`second-${cycle.id}`}
                        checked={!!cycle.hasSecondCollection}
                        onCheckedChange={checked => update({ hasSecondCollection: checked === true })}
                      />
                      <label htmlFor={`second-${cycle.id}`} className="text-xs text-muted-foreground cursor-pointer select-none">
                        This cycle included a second oocyte collection
                      </label>
                    </div>
                    {cycle.hasSecondCollection && (
                      <div className="pl-4 border-l-2 border-muted space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Second Collection</p>
                        <IVFFields
                          cycle={cycle.secondCollection ?? {}}
                          onChange={updates => update({ secondCollection: { ...(cycle.secondCollection ?? {}), ...updates } as any })}
                          onUpload={handleUpload} uploadingMap={uploadingMap}
                          cycleIndex={cycleIndex} isSecond mode={mode} entityId={entityId}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {isFET && (
                <FETFields
                  cycle={cycle} onChange={update}
                  onUpload={handleUpload} uploadingMap={uploadingMap}
                  cycleIndex={cycleIndex} allCycles={allCycles}
                  mode={mode} entityId={entityId}
                />
              )}

              {isIUI && <IUIFields cycle={cycle} onChange={update} />}
              {isOI && <OIFields cycle={cycle} onChange={update} />}

              {/* ── TIER 3: Advanced toggle ── */}
              <button
                className="text-xs text-primary underline flex items-center gap-1"
                onClick={() => setShowAdvanced(s => !s)}
              >
                {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showAdvanced ? "Hide advanced" : "Show advanced fields"}
              </button>

              {showAdvanced && (
                <div className="space-y-3 pt-1 border-t">
                  {/* Stimulation Protocol */}
                  {isIVFType && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Stimulation Protocol</Label>
                      <OtherSelect value={cycle.protocol ?? ""} onChange={v => update({ protocol: v })} options={PROTOCOLS} placeholder="Select protocol" />
                    </div>
                  )}
                  {/* Clinic / Hospital */}
                  <F label="Clinic / Hospital Name" value={cycle.clinic} onChange={v => update({ clinic: v })} placeholder="Clinic name" />
                  {/* Notes */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <Textarea className="text-xs min-h-[60px] resize-none" value={cycle.notes}
                      onChange={e => update({ notes: e.target.value })} placeholder="Any additional notes..." />
                  </div>
                </div>
              )}
            </div>
          )}
        {/* ── Cycle Report Attachment ── */}
        {onCycleFileUpload && (
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cycle Report / Documents</p>
            {/* Tag row */}
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs font-normal gap-1">
                {cycle.cycleFileTag || `TreatmentReport-${String(cycleIndex + 1).padStart(2, "0")}`}
              </Badge>
              <Input
                className="h-6 text-xs flex-1 max-w-[200px]"
                placeholder={`TreatmentReport-${String(cycleIndex + 1).padStart(2, "0")}`}
                value={cycle.cycleFileTag ?? ""}
                onChange={e => update({ cycleFileTag: e.target.value })}
              />
            </div>
            {/* Upload row */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => cycleFileInputRef.current?.click()}
                disabled={cycleFileUploading}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-dashed border-muted-foreground/40 hover:border-primary/60 hover:bg-muted/30 transition-colors text-muted-foreground disabled:opacity-50"
              >
                {cycleFileUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
                {cycleFileUploading ? "Uploading..." : cycle.cycleFileUrl ? "Replace file" : "Attach report / PDF"}
              </button>
              <input
                ref={cycleFileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  e.target.value = "";
                  setCycleFileUploading(true);
                  onCycleFileUpload(f, (key, url, name, docId) => {
                    update({ cycleFileKey: key, cycleFileUrl: url, cycleFileName: name, cycleDocId: docId });
                    setCycleFileUploading(false);
                  });
                }}
              />
              {cycle.cycleFileUrl && (
                <a href={cycle.cycleFileUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline max-w-[200px] truncate">
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="truncate">{cycle.cycleFileName || "View file"}</span>
                </a>
              )}
              {cycle.cycleFileUrl && onCycleFileRemove && (
                <button type="button" onClick={() => { onCycleFileRemove(cycle.cycleDocId); update({ cycleFileKey: undefined, cycleFileUrl: undefined, cycleFileName: undefined, cycleDocId: undefined }); }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive px-1.5 py-1 rounded border border-transparent hover:border-destructive/30 transition-colors">
                  <X className="h-3 w-3" /> Remove
                </button>
              )}
              {/* Password toggle */}
              <button type="button" onClick={() => setShowCyclePw(p => !p)}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
                  showCyclePw ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" : "border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60"
                }`}>
                <KeyRound className="h-3 w-3" />
                {showCyclePw ? "Has password" : "Password?"}
              </button>
            </div>
            {/* Password input */}
            {showCyclePw && (
              <div className="flex items-center gap-2">
                <Input type="text" value={cycle.cycleFilePassword ?? ""}
                  onChange={e => update({ cycleFilePassword: e.target.value })}
                  placeholder="Document password (if protected)"
                  className="h-7 text-xs max-w-[220px]" />
                <span className="text-[11px] text-muted-foreground">Password stored securely for staff reference</span>
              </div>
            )}
            {/* AI Extract & Translate */}
            {cycle.cycleFileUrl && cycle.cycleDocId && (
              <SavedTranslationsPanel
                leadDocumentId={cycle.cycleDocId}
                fileUrl={cycle.cycleFileUrl}
                fileName={cycle.cycleFileName ?? "document"}
                patientId={mode === "patient" ? (entityId ?? 0) : 0}
                intakeSection="TreatmentReport"
              />
            )}
          </div>
        )}
        </div>
      )}
    </div>
  );
}

// ─── PreviousTreatmentsEditor (list wrapper) ──────────────────────────────────

export function PreviousTreatmentsEditor({
  value, onChange, onFileUpload, onCycleFileUpload, onCycleFileRemove, mode, entityId
}: {
  value: ARTCycle[];
  onChange: (v: ARTCycle[]) => void;
  onFileUpload?: (cycleId: string, section: string, embryoIndex: number, file: File, onDone: (key: string, url: string, name: string, docId?: number) => void) => void;
  onCycleFileUpload?: (cycleIndex: number, file: File, onDone: (key: string, url: string, name: string, docId: number) => void) => void;
  onCycleFileRemove?: (docId?: number) => void;
  mode?: "lead" | "patient";
  entityId?: number;
}) {
  const addCycle = () => {
    onChange([...value, {
      id: uid(), type: "IVF", date: "", clinic: "", outcome: "", notes: "",
      transferredEmbryos: [], frozenEmbryos: []
    }]);
  };

  return (
    <div className="space-y-3">
      {value.map((cycle, i) => (
        <PreviousTreatmentCard
          key={cycle.id} cycle={cycle} cycleIndex={i}
          onChange={updated => { const arr = [...value]; arr[i] = updated; onChange(arr); }}
          onRemove={() => onChange(value.filter((_, idx) => idx !== i))}
          allCycles={value}
          onFileUpload={onFileUpload}
          onCycleFileUpload={onCycleFileUpload ? (file, onDone) => onCycleFileUpload(i, file, onDone) : undefined}
          onCycleFileRemove={onCycleFileRemove}
          mode={mode}
          entityId={entityId}
        />
      ))}
      <Button variant="outline" size="sm" onClick={addCycle} className="gap-1.5 w-full">
        <Plus className="h-3.5 w-3.5" /> Add ART Cycle
      </Button>
    </div>
  );
}
