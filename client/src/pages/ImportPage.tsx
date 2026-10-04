import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileText, CheckCircle, AlertCircle, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";

// ─── CSV parsing ──────────────────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

// ─── File drop zone ───────────────────────────────────────────────────────────
interface FileZoneProps {
  label: string;
  description: string;
  file: File | null;
  onFile: (f: File | null) => void;
  required?: boolean;
  rowCount?: number;
}

function FileZone({ label, description, file, onFile, required, rowCount }: FileZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors ${
        file ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-[#1E0566]/40 hover:bg-[#1E0566]/5"
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
      />
      {file ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-green-700 min-w-0">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{file.name}</p>
              {rowCount !== undefined && <p className="text-xs text-green-600">{rowCount} rows detected</p>}
            </div>
          </div>
          <button
            className="text-gray-400 hover:text-red-500 shrink-0 p-1"
            onClick={(e) => { e.stopPropagation(); onFile(null); }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Upload className="w-5 h-5 text-gray-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-700">
              {label} {required && <span className="text-red-500">*</span>}
            </p>
            <p className="text-xs text-gray-400">{description}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
interface ImportResult {
  leadsInserted: number;
  leadsSkipped: number;
  notesInserted: number;
  notesSkipped: number;
  tasksInserted: number;
  tasksSkipped: number;
  errors: string[];
}

export default function ImportPage() {
  const [leadsFile, setLeadsFile] = useState<File | null>(null);
  const [notesFile, setNotesFile] = useState<File | null>(null);
  const [tasksFile, setTasksFile] = useState<File | null>(null);
  const [leadsCount, setLeadsCount] = useState<number | undefined>();
  const [notesCount, setNotesCount] = useState<number | undefined>();
  const [tasksCount, setTasksCount] = useState<number | undefined>();
  const [preview, setPreview] = useState<Record<string, string>[] | null>(null);
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importLeads = (trpc as any).intake.bulkImport.useMutation();
  const importNotes = (trpc as any).intake.importNotes.useMutation();
  const importTasks = (trpc as any).intake.importTasks.useMutation();

  async function readFile(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = (e) => res(e.target?.result as string);
      reader.onerror = rej;
      reader.readAsText(file, "utf-8");
    });
  }

  async function handleLeadsFile(f: File | null) {
    setLeadsFile(f);
    if (!f) { setLeadsCount(undefined); setPreview(null); return; }
    const text = await readFile(f);
    const rows = parseCSV(text);
    setLeadsCount(rows.length);
  }

  async function handleNotesFile(f: File | null) {
    setNotesFile(f);
    if (!f) { setNotesCount(undefined); return; }
    const text = await readFile(f);
    setNotesCount(parseCSV(text).length);
  }

  async function handleTasksFile(f: File | null) {
    setTasksFile(f);
    if (!f) { setTasksCount(undefined); return; }
    const text = await readFile(f);
    setTasksCount(parseCSV(text).length);
  }

  async function handlePreview() {
    if (!leadsFile) return;
    const text = await readFile(leadsFile);
    const rows = parseCSV(text);
    setPreview(rows.slice(0, 5));
    setStep("preview");
  }

  async function handleImport() {
    if (!leadsFile) return;
    setImporting(true);
    setError(null);

    try {
      // 1. Parse and import leads
      const leadsText = await readFile(leadsFile);
      // ── Zoho → our system value maps ──────────────────────────────────────
      const SOURCE_MAP: Record<string, string> = {
        // Exact values from CRM specification
        "paid": "paid",
        "employee referral": "employee-referral", "employee-referral": "employee-referral",
        "external referral": "external-referral", "external-referral": "external-referral",
        "website": "website",
        "maps": "maps",
        "partner": "partner",
        "public relations": "public-relations", "public-relations": "public-relations",
        "instagram": "instagram",
        "tiktok": "tiktok",
        "doctor referral": "doctor-referral", "doctor-referral": "doctor-referral",
        "youtube": "youtube",
        "facebook": "facebook",
        "awatef (guide)": "awatef-guide", "awatef-guide": "awatef-guide",
        "salim (guide)": "salim-guide", "salim-guide": "salim-guide",
        "organic": "organic",
        // Dirty Zoho legacy values → clean system values
        "advertisement": "paid",
        "fertiliv website": "website",
        "web research": "website",
        "direct": "external-referral",
      };
      const STATUS_MAP: Record<string, string> = {
        // Exact values from CRM specification
        "intake": "intake",
        "attempted to contact": "attempted-to-contact", "attempted-to-contact": "attempted-to-contact",
        "contacted – awaiting info": "contacted-awaiting-info",
        "contacted - awaiting info": "contacted-awaiting-info",
        "contacted awaiting info": "contacted-awaiting-info",
        "contacted-awaiting-info": "contacted-awaiting-info",
        "medical reports received": "medical-reports-received", "medical-reports-received": "medical-reports-received",
        "doctor feedback shared": "doctor-feedback-shared", "doctor-feedback-shared": "doctor-feedback-shared",
        "follow-up / negotiation": "follow-up-negotiation",
        "follow-up negotiation": "follow-up-negotiation", "follow-up-negotiation": "follow-up-negotiation",
        "ready to travel": "ready-to-travel", "ready-to-travel": "ready-to-travel",
        "converted to patient (won)": "converted", "converted": "converted",
        "cold / to reconnect": "cold", "cold": "cold",
        "lost / no response": "lost", "lost": "lost",
        "not qualified (financially/medically)": "not-qualified",
        "not qualified": "not-qualified", "not-qualified": "not-qualified",
        "junk lead": "junk", "junk": "junk",
        // Dirty Zoho legacy values → clean system values
        "moroco": "intake",
        "transferred to zoho": "intake",
        "new": "intake",
        "pre-qualified": "intake",
      };
      const TIMELINE_MAP: Record<string, string> = {
        "as soon as possible": "immediately", "immediately": "immediately",
        "as soon as possible / immediately": "immediately",
        "1-2 weeks": "1-2-weeks", "1–2 weeks": "1-2-weeks",
        "1 month": "1-month", "2 months": "2-months", "3 months": "3-months",
        "1-3 months": "1-3-months", "1–3 months": "1-3-months",
        "6 months": "6-months", "exploring": "exploring",
        "exploring / not sure": "exploring", "not sure": "exploring",
        "immediate": "immediately", "1-3-months": "1-3-months",
        "3-6-months": "3-months", "6-12-months": "6-months",
      };
      const TRAVEL_MAP: Record<string, string> = {
        "yes, i am ready to travel": "ready", "ready": "ready",
        "i am considering traveling and comparing options": "considering",
        "considering": "considering", "planning": "considering",
        "i prefer treatment in my home country": "prefers-home",
        "prefers home country": "prefers-home", "not ready": "prefers-home",
        "local patient": "local-patient", "local-patient": "local-patient",
      };
      const IVF_MAP: Record<string, string> = {
        "never tried": "never-tried", "never-tried": "never-tried",
        "no previous ivf": "never-tried", "none": "never-tried",
        "tried before – unsuccessful": "tried-unsuccessful",
        "tried before - unsuccessful": "tried-unsuccessful",
        "tried-unsuccessful": "tried-unsuccessful",
        "tried before – wants try again": "tried-again",
        "tried before - wants try again": "tried-again",
        "tried-again": "tried-again",
        "tried multiple attempts": "tried-multiple", "tried-multiple": "tried-multiple",
      };
      const INTEREST_MAP: Record<string, string> = {
        // Exact system values
        "egg freezing": "Egg Freezing",
        "fertility check-up (couple)": "Fertility Check-up (Couple)",
        "fertility check-up (female)": "Fertility Check-up (Female)",
        "fertility check-up (male)": "Fertility Check-up (Male)",
        "iui": "IUI",
        "ivf with icsi": "IVF with ICSI",
        "other / not sure yet": "Other / Not sure yet",
        "prp": "PRP",
        "exosome": "Exosome",
        "hysteroscopy": "Hysteroscopy",
        "hsg": "HSG",
        "sperm test": "Sperm Test",
        // Dirty Zoho legacy values → clean system values
        "ivf": "IVF with ICSI",
        "icsi": "IVF with ICSI",
        "ivf/icsi": "IVF with ICSI",
        "ivf + icsi": "IVF with ICSI",
        "egg / embryo / sperm freezing": "Egg Freezing",
        "embryo freezing": "Egg Freezing",
        "sperm freezing": "Sperm Test",
        "fertility checkup": "Fertility Check-up (Couple)",
        "fertility check-up": "Fertility Check-up (Couple)",
        "fertility check up": "Fertility Check-up (Couple)",
        "pgt": "Other / Not sure yet",
        "donor egg": "Other / Not sure yet",
        "surrogacy": "Other / Not sure yet",
        "other": "Other / Not sure yet",
        "not clear yet": "Other / Not sure yet",
        "not sure": "Other / Not sure yet",
        "many": "IVF with ICSI",
        "dental filling": "Other / Not sure yet",
      };
      const DIAG_MAP: Record<string, string> = {
        // Exact system values
        "ovarian reserve": "Ovarian reserve",
        "ovulation disorders": "Ovulation disorders",
        "tubal factor": "Tubal factor",
        "endometriosis": "Endometriosis",
        "uterine factors": "Uterine factors",
        "male factor infertility": "Male factor infertility",
        "genetics / pgt needed": "Genetics / PGT needed",
        "recurrent miscarriages": "Recurrent miscarriages",
        "unexplained infertility": "Unexplained infertility",
        "no clear diagnosis / needs re-evaluation": "No clear diagnosis / needs re-evaluation",
        "systemic factors": "Systemic factors",
        "other": "Other",
        // Dirty Zoho legacy values → clean system values
        "low ovarian reserve": "Ovarian reserve",
        "fallopian tube issues": "Tubal factor",
        "male factor": "Male factor infertility",
        "genetic concerns / pgt needed": "Genetics / PGT needed",
        "genetic concerns/pgt needed": "Genetics / PGT needed",
        "no clear diagnosis/needs re-evaluation": "No clear diagnosis / needs re-evaluation",
        "no clear diagnosis": "No clear diagnosis / needs re-evaluation",
        // Arabic legacy values
        "انخفاض_مخزون_المبيض": "Ovarian reserve",
        "مشاكل_في_قنوات_فالوب": "Tubal factor",
        "إجهاضات_متكررة": "Recurrent miscarriages",
        "غير_متأكدة،_احتاج_تقييم": "No clear diagnosis / needs re-evaluation",
        "فشل_محاولة_حقن_مجهري_سابقة": "Other",
        "محاولة_الحمل_منذ_أكثر_من_سنة": "Other",
      };
      const LANG_MAP: Record<string, string> = {
        "arabic": "ar", "english": "en", "french": "fr", "german": "de",
        "somali": "so", "spanish": "es", "italian": "it", "russian": "ru", "turkish": "tr",
      };
      const RATING_MAP: Record<string, string> = {
        // Zoho standard values
        "hot": "⭐⭐⭐⭐⭐ Excellent Candidate",
        "warm": "⭐⭐⭐⭐ Strong Candidate",
        "cold": "🔄 Low Commitment / Uncertain",
        // Exact system values (already stored in Zoho custom field)
        "⭐⭐⭐⭐⭐ excellent candidate": "⭐⭐⭐⭐⭐ Excellent Candidate",
        "⭐⭐⭐⭐ strong candidate": "⭐⭐⭐⭐ Strong Candidate",
        "⭐⭐⭐ good candidate": "⭐⭐⭐ Good Candidate",
        "⭐ requires further evaluation": "⭐ Requires Further Evaluation",
        "⚠️ medically complex case": "⚠️ Medically Complex Case",
        "💰 financially sensitive": "💰 Financially Sensitive",
        "🔄 low commitment / uncertain": "🔄 Low Commitment / Uncertain",
        "❌ not eligible": "❌ Not Eligible",
        // Common descriptive variants
        "excellent": "⭐⭐⭐⭐⭐ Excellent Candidate",
        "excellent candidate": "⭐⭐⭐⭐⭐ Excellent Candidate",
        "strong": "⭐⭐⭐⭐ Strong Candidate",
        "strong candidate": "⭐⭐⭐⭐ Strong Candidate",
        "good": "⭐⭐⭐ Good Candidate",
        "good candidate": "⭐⭐⭐ Good Candidate",
        "requires further evaluation": "⭐ Requires Further Evaluation",
        "medically complex": "⚠️ Medically Complex Case",
        "medically complex case": "⚠️ Medically Complex Case",
        "financially sensitive": "💰 Financially Sensitive",
        "low commitment": "🔄 Low Commitment / Uncertain",
        "uncertain": "🔄 Low Commitment / Uncertain",
        "not eligible": "❌ Not Eligible",
      };
      const BRAND_MAP: Record<string, string> = {
        // Exact values from CRM specification
        "fertiliv": "fertiliv",
        "safemedigo": "safemedigo",
        "dr nilay karaca": "dr-nilay-karaca",
        "dr. nilay karaca": "dr-nilay-karaca",
      };
      const mapVal = (map: Record<string, string>, raw?: string): string | undefined => {
        if (!raw?.trim()) return undefined;
        return map[raw.trim().toLowerCase()] ?? raw.trim();
      };
      const mapMulti = (map: Record<string, string>, raw?: string): string[] => {
        if (!raw?.trim()) return [];
        return raw.split(/[,;|]/).map(s => map[s.trim().toLowerCase()] ?? s.trim()).filter(Boolean);
      };
      // ──────────────────────────────────────────────────────────────────────
      const leadsRows = parseCSV(leadsText)
        .filter((r) => r["First Name"]?.trim() || r["Last Name"]?.trim())
        .map((r) => ({
          zohoRecordId: r["Record Id"] ?? "",
          firstName: r["First Name"]?.trim() || "Unknown",
          lastName: (r["Last Name"] ?? r["Lead Name"] ?? "").trim() || "Lead",
          email: r["Email"]?.trim() || undefined,
          phone: (r["Mobile"] || r["Phone"])?.trim() || undefined,
          nationality: r["Nationality"]?.trim() || r["Country"]?.trim() || undefined,
          country: r["Country"]?.trim() || undefined,
          city: r["City"]?.trim() || undefined,
          leadSource: mapVal(SOURCE_MAP, r["Lead Source"]),
          leadStatus: (() => { const raw = r["Lead Status"]?.trim(); if (!raw || raw.toLowerCase() === "-none-" || raw === "-" || raw === "") return undefined; return mapVal(STATUS_MAP, raw); })(),
          rating: (() => { const raw = (r["Rating"] ?? r["Lead Rating"] ?? r["Candidate Rating"])?.trim(); if (!raw || raw.toLowerCase() === "-none-" || raw === "-" || raw === "") return undefined; return RATING_MAP[raw.toLowerCase()] ?? raw; })(),
          brand: mapVal(BRAND_MAP, r["Brand"]),
          decisionTimeline: mapVal(TIMELINE_MAP, r["Decision Timeline"]),
          travelReadiness: mapVal(TRAVEL_MAP, r["Travel Readiness"]),
          ivfExperience: mapVal(IVF_MAP, r["IVF Experience"]),
          mainMedicalInterest: mapMulti(INTEREST_MAP, r["Interested Main Procedure"] ?? r["Main Medical Interest"]),
          fertilityDiagnosis: mapMulti(DIAG_MAP, r["Medical Fertility Diagnosis"] ?? r["Fertility Diagnosis"]),
          preferredLanguage: mapVal(LANG_MAP, r["Preferred Language"]),
          budgetRange: r["Budget Range"]?.trim() || undefined,
          notes: r["Description"]?.trim() || undefined,
          createdAt: r["Created Time"]?.trim() || undefined,
        }));

      const leadsResult = await importLeads.mutateAsync({ rows: leadsRows });
      const zohoIdMap: Record<string, number> = (leadsResult as any).zohoIdMap ?? {};

      let notesInserted = 0, notesSkipped = 0;
      let tasksInserted = 0, tasksSkipped = 0;
      const allErrors: string[] = [...leadsResult.errors];

      // 2. Import notes
      if (notesFile) {
        const notesText = await readFile(notesFile);
        const notesRows = parseCSV(notesText)
          .filter((r) => r["Note Content"]?.trim())
          .map((r) => ({
            zohoLeadId: r["Parent ID.id"]?.trim() ?? "",
            content: r["Note Content"] ?? "",
            // Notes CSV uses "Created Time" (not "Note Created Time")
          createdAt: r["Created Time"]?.trim() || undefined,
          }));
        if (notesRows.length > 0) {
          const nr = await importNotes.mutateAsync({ rows: notesRows, zohoIdMap });
          notesInserted = nr.inserted;
          notesSkipped = nr.skipped;
          allErrors.push(...nr.errors);
        }
      }

      // 3. Import tasks
      if (tasksFile) {
        const tasksText = await readFile(tasksFile);
        // Zoho Status → our status
        const TASK_STATUS_MAP: Record<string, string> = {
          "not started": "open", "in progress": "in-progress",
          "completed": "done", "deferred": "open", "waiting on input": "open",
        };
        // Zoho Priority → our priority
        const TASK_PRIORITY_MAP: Record<string, string> = {
          "highest": "high", "high": "high",
          "normal": "medium", "low": "low", "lowest": "low",
        };
        const tasksRows = parseCSV(tasksText)
          .filter((r) => r["Subject"]?.trim())
          .map((r) => ({
            zohoLeadId: r["Related To.id"]?.trim() ?? "",
            title: r["Subject"]?.trim() ?? "",
            dueDate: r["Due Date"]?.trim() || undefined,
            status: TASK_STATUS_MAP[(r["Status"]?.trim() ?? "").toLowerCase()] ?? "open",
            priority: TASK_PRIORITY_MAP[(r["Priority"]?.trim() ?? "").toLowerCase()] ?? "medium",
            notes: r["Description"]?.trim() || undefined,
          }));
        if (tasksRows.length > 0) {
          const tr = await importTasks.mutateAsync({ rows: tasksRows, zohoIdMap });
          tasksInserted = tr.inserted;
          tasksSkipped = tr.skipped;
          allErrors.push(...tr.errors);
        }
      }

      setResult({
        leadsInserted: leadsResult.inserted,
        leadsSkipped: leadsResult.skipped,
        notesInserted,
        notesSkipped,
        tasksInserted,
        tasksSkipped,
        errors: allErrors,
      });
      setStep("done");
      toast.success(`Import complete: ${leadsResult.inserted} leads imported`);
    } catch (err: any) {
      setError(err?.message ?? "Import failed. Please try again.");
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setLeadsFile(null);
    setNotesFile(null);
    setTasksFile(null);
    setLeadsCount(undefined);
    setNotesCount(undefined);
    setTasksCount(undefined);
    setPreview(null);
    setStep("upload");
    setResult(null);
    setError(null);
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#1E0566]">Import from Zoho CRM</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload your Zoho CSV exports to import leads, notes, and tasks in one step.
          Notes and tasks are automatically linked to their lead via Zoho Record ID.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        {(["Upload Files", "Preview", "Import"] as const).map((s, i) => {
          const active = (step === "upload" && i === 0) || (step === "preview" && i === 1) || (step === "done" && i === 2);
          const done = (step === "preview" && i === 0) || (step === "done" && i <= 1);
          return (
            <div key={s} className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                done ? "bg-green-100 text-green-700" : active ? "bg-[#1E0566] text-white" : "bg-gray-100 text-gray-400"
              }`}>{s}</span>
              {i < 2 && <ChevronRight className="w-3 h-3 text-gray-300" />}
            </div>
          );
        })}
      </div>

      {/* ── STEP 1: Upload ── */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select CSV Files</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FileZone
              label="Leads CSV"
              description="Zoho CRM → Leads → Actions → Export → All Leads → CSV"
              file={leadsFile}
              onFile={handleLeadsFile}
              required
              rowCount={leadsCount}
            />
            <FileZone
              label="Notes CSV"
              description="Zoho CRM → Notes module → Export (optional)"
              file={notesFile}
              onFile={handleNotesFile}
              rowCount={notesCount}
            />
            <FileZone
              label="Tasks CSV"
              description="Zoho CRM → Tasks module → Export (optional)"
              file={tasksFile}
              onFile={handleTasksFile}
              rowCount={tasksCount}
            />

            {/* Column mapping info */}
            <div className="bg-blue-50 rounded-lg p-4 text-xs text-blue-800 space-y-2">
              <p className="font-semibold">Automatic column mapping (no manual setup needed):</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div><span className="font-medium">Leads:</span> First Name, Last Name, Email, Mobile, Country, City, Lead Status, Lead Source, Description</div>
                <div><span className="font-medium">Notes:</span> Note Content → linked via Parent ID.id</div>
                <div><span className="font-medium">Tasks:</span> Subject, Due Date, Status, Priority → linked via Related To.id</div>
              </div>
            </div>

            <Button
              className="w-full bg-[#1E0566] hover:bg-[#1E0566]/90"
              disabled={!leadsFile}
              onClick={handlePreview}
            >
              Preview & Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: Preview ── */}
      {step === "preview" && preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview — first 5 leads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded border text-xs">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {["First Name", "Last Name", "Email", "Phone/Mobile", "Country", "Lead Status", "Lead Source"].map((col) => (
                      <th key={col} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">{row["First Name"]}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row["Last Name"]}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row["Email"]}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row["Mobile"] || row["Phone"]}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row["Country"]}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row["Lead Status"]}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row["Lead Source"]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                {leadsCount} leads
              </span>
              {notesCount !== undefined && (
                <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                  {notesCount} notes
                </span>
              )}
              {tasksCount !== undefined && (
                <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">
                  {tasksCount} tasks
                </span>
              )}
              <span className="bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
                Duplicates (same email) will be skipped
              </span>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep("upload")} disabled={importing}>
                Back
              </Button>
              <Button
                className="flex-1 bg-[#1E0566] hover:bg-[#1E0566]/90"
                onClick={handleImport}
                disabled={importing}
              >
                {importing ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Importing…
                  </span>
                ) : "Start Import"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 3: Done ── */}
      {step === "done" && result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-green-700">{result.leadsInserted}</p>
                <p className="text-xs text-green-600 mt-1">Leads imported</p>
                {result.leadsSkipped > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">{result.leadsSkipped} skipped</p>
                )}
              </div>
              <div className="bg-blue-50 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-blue-700">{result.notesInserted}</p>
                <p className="text-xs text-blue-600 mt-1">Notes imported</p>
                {result.notesSkipped > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">{result.notesSkipped} skipped</p>
                )}
              </div>
              <div className="bg-purple-50 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-purple-700">{result.tasksInserted}</p>
                <p className="text-xs text-purple-600 mt-1">Tasks imported</p>
                {result.tasksSkipped > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">{result.tasksSkipped} skipped</p>
                )}
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="bg-red-50 rounded-lg p-3 space-y-1">
                <p className="text-xs font-semibold text-red-700 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {result.errors.length} error{result.errors.length !== 1 ? "s" : ""}
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={reset}>
                Import More
              </Button>
              <Button
                className="flex-1 bg-[#1E0566] hover:bg-[#1E0566]/90"
                onClick={() => window.location.href = "/leads"}
              >
                View Leads
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
