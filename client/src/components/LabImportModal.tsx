/**
 * LabImportModal — AI Lab Import Review Workspace (v3)
 *
 * Design principles:
 * - Full-screen overlay: no nested scrollbars, maximum working space.
 * - Compact summary bar: [N Results] [N Matched] [N Needs Review] always visible.
 * - Simplified table: Status | Test Name | Value | Unit | Date | Actions
 * - MatchReviewDrawer: side panel (440px) for match review — prefilled search,
 *   immediate results, Save Match / Confirm As-Is / Skip.
 * - Server-side draft: auto-saved to DB on every meaningful change, restored on open.
 * - Alias Suggestions Banner: collapsible list of pending alias proposals.
 * - Final save: only when user clicks "Final Import / Save".
 */
import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Eye, EyeOff, Lock, Upload, FileText, X, Wand2, Check, AlertCircle, Loader2,
  Plus, Trash2, Paperclip, CheckCircle2, SkipForward, Pencil, Tag, Search,
  ChevronDown, ChevronRight, MoreVertical, ArrowLeft, Save, Sparkles,
} from "lucide-react";
import {
  convertToTurkishDefault,
  convertUnit,
  getUnitsForTest,
  roundLabValue,
} from "@/lib/labUnits";
import { RESULT_TYPE_COLORS } from "@/components/LabTestAutocomplete";
import type { ResultType } from "@/components/LabTestAutocomplete";
import type { LabDictionaryEntry } from "@/components/LabTestAutocomplete";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ImportedLabRow {
  id: string;
  testName: string;
  value: string;
  unit: string;
  collectionDate: string;
  reportDate: string;
  referenceRange: string;
  interpretation: string;
  originalValue?: string;
  originalUnit?: string;
  converted?: boolean;
  sourceFileKey?: string;
  sourceFileUrl?: string;
  sourceFileName?: string;
  sourceFilePassword?: string;
  matchedTestName?: string | null;
  isMatched?: boolean;
  originalExtractedName?: string;
  dictionaryId?: number | null;
  resultType?: string | null;
  aliasConfirmed?: boolean;
  needsReview?: boolean;
  reviewReason?: string;
  suggestedModule?: string | null;
  analyteGroup?: string | null;
  orderType?: string | null;
  extraFields?: Record<string, string>;
  matchedVia?: string;
  matchConfidence?: number;
  lowConfidence?: boolean;
  originalNameIsAlias?: boolean;
}

interface LabImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: ImportedLabRow[]) => void;
  existingTestNames?: string[];
  draftKey?: string;
}

interface UploadedFile {
  name: string;
  key: string;
  url: string;
  mimeType: string;
  password: string;
  showPassword: boolean;
  uploading: boolean;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeId() {
  return Math.random().toString(36).slice(2);
}

function applyTurkishConversion(row: Omit<ImportedLabRow, "id" | "converted" | "originalValue" | "originalUnit">): Omit<ImportedLabRow, "id"> {
  const numVal = parseFloat(row.value);
  if (isNaN(numVal) || !row.unit) return { ...row };
  const { value: converted, unit: newUnit } = convertToTurkishDefault(row.testName, numVal, row.unit);
  if (newUnit === row.unit) return { ...row };
  return {
    ...row,
    value: String(roundLabValue(converted)),
    unit: newUnit,
    originalValue: row.value,
    originalUnit: row.unit,
    converted: true,
  };
}

function normalizeTestName(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

// ─── Row Status Badge ──────────────────────────────────────────────────────────
function RowStatusBadge({ row }: { row: ImportedLabRow }) {
  if (row.needsReview) {
    return (
      <span className="inline-flex items-center gap-0.5 bg-red-50 text-red-600 border border-red-200 rounded-full px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap">
        <AlertCircle className="h-2.5 w-2.5" /> Review
      </span>
    );
  }
  if (row.aliasConfirmed) {
    return (
      <span className="inline-flex items-center gap-0.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap">
        <Tag className="h-2.5 w-2.5" /> Alias Pending
      </span>
    );
  }
  if (row.isMatched) {
    const isLow = row.lowConfidence;
    return (
      <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap border ${
        isLow ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-green-50 text-green-700 border-green-200'
      }`}>
        {isLow ? <AlertCircle className="h-2.5 w-2.5" /> : <Check className="h-2.5 w-2.5" />}
        {isLow ? `Fuzzy (${row.matchConfidence ?? '?'}%)` : 'Matched'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap">
      <Sparkles className="h-2.5 w-2.5" /> New AI
    </span>
  );
}

// ─── Dictionary Search Results ─────────────────────────────────────────────────
function DictionarySearchResults({
  query,
  selectedId,
  onSelect,
}: {
  query: string;
  selectedId: number | null;
  onSelect: (entry: LabDictionaryEntry) => void;
}) {
  const { data, isLoading } = trpc.labDictionary.search.useQuery(
    { query: query, limit: 12 },
    { enabled: query.trim().length >= 1 }
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
      </div>
    );
  }

  const results = (data ?? []) as LabDictionaryEntry[];

  if (results.length === 0) {
    return (
      <div className="py-3 text-xs text-muted-foreground text-center">
        No matches found for &ldquo;{query}&rdquo;
      </div>
    );
  }

  return (
    <div className="border rounded-lg divide-y max-h-[280px] overflow-y-auto">
      {results.map((entry: LabDictionaryEntry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => onSelect(entry)}
          className={`w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors ${
            selectedId === entry.id ? 'bg-primary/10 border-l-2 border-l-primary' : ''
          }`}
        >
          <div className="text-xs font-medium">{entry.canonicalName}</div>
          {entry.resultType && (
            <span className={`inline-flex items-center px-1 py-0 rounded text-[9px] font-medium mt-0.5 ${
              RESULT_TYPE_COLORS[entry.resultType as ResultType] ?? "bg-gray-100 text-gray-700"
            }`}>
              {entry.resultType}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Match Review Drawer ───────────────────────────────────────────────────────
interface MatchReviewDrawerProps {
  row: ImportedLabRow | null;
  matchOverride?: { dictionaryId: number; canonicalName: string };
  onClose: () => void;
  onSaveMatch: (entry: LabDictionaryEntry) => void;
  onSaveAlias: (row: ImportedLabRow) => void;
  onConfirmRow: (id: string) => void;
  onSkipRow: (id: string) => void;
  savingAlias: boolean;
}

function MatchReviewDrawer({ row, matchOverride, onClose, onSaveMatch, onSaveAlias, onConfirmRow, onSkipRow, savingAlias }: MatchReviewDrawerProps) {
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<LabDictionaryEntry | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Prefill search with the test name when row changes
  useEffect(() => {
    if (row) {
      const initial = row.originalExtractedName ?? row.testName ?? "";
      setSearchQuery(initial);
      setSelectedEntry(null);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [row?.id]);

  const currentMatchName = matchOverride?.canonicalName ?? row?.matchedTestName ?? null;
  const currentDictId = matchOverride?.dictionaryId ?? row?.dictionaryId ?? null;

  if (!row) return null;

  return (
    <>
    <AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove from import?</AlertDialogTitle>
          <AlertDialogDescription>This will remove &ldquo;{row.originalExtractedName ?? row.testName}&rdquo; from the current import. You can add it back manually if needed.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setShowRemoveConfirm(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { setShowRemoveConfirm(false); onSkipRow(row.id); onClose(); }}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div className="fixed inset-y-0 right-0 w-full sm:w-[440px] bg-background border-l shadow-2xl z-[60] flex flex-col">
      {/* Drawer header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7 -ml-1" onClick={onClose} title="Back to import list">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h3 className="font-semibold text-sm">Match Review</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Find the correct dictionary entry for this test</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Pending test info */}
        <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pending Test</div>
          <div className="font-medium text-sm">{row.originalExtractedName ?? row.testName}</div>
          {row.value && (
            <div className="text-xs text-muted-foreground">
              Value: <span className="font-medium text-foreground">{row.value}</span>
              {row.unit && <span className="ml-1">{row.unit}</span>}
            </div>
          )}
          <RowStatusBadge row={row} />
        </div>

        {/* Current AI suggestion */}
        {currentMatchName && (
          <div className="rounded-lg border border-green-200 bg-green-50/40 p-3 space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-green-700">AI Suggested Match</div>
            <div className="font-medium text-sm text-green-800">{currentMatchName}</div>
            {row.matchConfidence !== undefined && (
              <div className="text-xs text-green-700">Confidence: {row.matchConfidence}%</div>
            )}
            {row.matchedVia && (
              <div className="text-xs text-muted-foreground">
                Via: {row.matchedVia === 'exact' ? 'Exact match' :
                      row.matchedVia.startsWith('alias:') ? `Alias: ${row.matchedVia.slice(6)}` :
                      row.matchedVia === 'like' ? 'Partial match' :
                      row.matchedVia.startsWith('fuzzy:') ? `Fuzzy: ${row.matchedVia.slice(6)}` :
                      row.matchedVia}
              </div>
            )}
          </div>
        )}

        {/* Search */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold">Search Dictionary</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSelectedEntry(null); }}
              placeholder="Search test name…"
              className="pl-8 pr-8 h-8 text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(""); setSelectedEntry(null); searchInputRef.current?.focus(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {searchQuery.trim().length >= 1 && (
            <DictionarySearchResults
              query={searchQuery}
              selectedId={selectedEntry?.id ?? currentDictId ?? null}
              onSelect={entry => setSelectedEntry(entry)}
            />
          )}
        </div>

        {/* Selected entry preview */}
        {selectedEntry && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">Selected Match</div>
            <div className="font-medium text-sm">{selectedEntry.canonicalName}</div>
            {selectedEntry.resultType && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                RESULT_TYPE_COLORS[selectedEntry.resultType as ResultType] ?? "bg-gray-100 text-gray-700"
              }`}>
                {selectedEntry.resultType}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Drawer footer actions */}
      <div className="border-t p-4 space-y-2">
        <Button
          className="w-full gap-2"
          disabled={!selectedEntry}
          onClick={() => {
            if (selectedEntry) { onSaveMatch(selectedEntry); onClose(); }
          }}
        >
          <Check className="h-4 w-4" />
          Save Match{selectedEntry ? ` → ${selectedEntry.canonicalName}` : ""}
        </Button>

        <Button variant="outline" className="w-full gap-2" onClick={() => { onConfirmRow(row.id); onClose(); }}>
          <CheckCircle2 className="h-4 w-4" /> Confirm As-Is
        </Button>

        {(row.originalExtractedName && row.originalExtractedName !== (row.matchedTestName ?? row.testName)) && (
          <Button
            variant="outline"
            className="w-full gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
            disabled={savingAlias}
            onClick={() => onSaveAlias(row)}
          >
            {savingAlias ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
            Submit Alias Suggestion
          </Button>
        )}

        <Button
          variant="ghost"
          className="w-full gap-2 text-muted-foreground hover:text-destructive"
          onClick={() => setShowRemoveConfirm(true)}
        >
          <SkipForward className="h-4 w-4" /> Remove from Import
        </Button>
        <Button variant="outline" className="w-full gap-2" onClick={onClose}>
          <X className="h-4 w-4" /> Cancel
        </Button>
      </div>
    </div>
    </>
  );
}

// ─── Row Actions Dropdown ──────────────────────────────────────────────────────
function RowActionsMenu({
  row, onReview, onConfirm, onSkip, onRemove,
}: {
  row: ImportedLabRow;
  onReview: () => void;
  onConfirm: () => void;
  onSkip: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        title="Row actions"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-popover border rounded-lg shadow-lg z-50 py-1 text-xs">
          {row.needsReview ? (
            <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-orange-700" onClick={() => { setOpen(false); onReview(); }}>
              <Search className="h-3.5 w-3.5" /> Review Match
            </button>
          ) : (
            <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2" onClick={() => { setOpen(false); onReview(); }}>
              <Pencil className="h-3.5 w-3.5" /> Change Match
            </button>
          )}
          <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-green-700" onClick={() => { setOpen(false); onConfirm(); }}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Confirm As-Is
          </button>
          <Separator className="my-1" />
          <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-muted-foreground" onClick={() => { setOpen(false); onSkip(); }}>
            <SkipForward className="h-3.5 w-3.5" /> Remove from Import
          </button>
          <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-destructive" onClick={() => { setOpen(false); onRemove(); }}>
            <Trash2 className="h-3.5 w-3.5" /> Delete Row
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function LabImportModal({ open, onClose, onImport, existingTestNames, draftKey }: LabImportModalProps) {
  // ── Server-side draft ───────────────────────────────────────────────────────
  const saveDraftMut = trpc.lab.saveDraft.useMutation();
  const deleteDraftMut = trpc.lab.deleteDraft.useMutation();
  const { data: serverDraft, isLoading: draftLoading } = trpc.lab.loadDraft.useQuery(
    { draftKey: draftKey ?? "" },
    { enabled: !!draftKey && open }
  );

  // ── State ───────────────────────────────────────────────────────────────────
  const [pasteText, setPasteTextRaw] = useState<string>("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [rows, setRows] = useState<ImportedLabRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [step, setStepRaw] = useState<"input" | "preview">("input");
  const [extracting, setExtracting] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [reviewTab, setReviewTab] = useState<"all" | "needs_review">("all");
  const [matchOverrides, setMatchOverrides] = useState<Record<string, { dictionaryId: number; canonicalName: string }>>({});
  const [manualMatchAliasOptIn, setManualMatchAliasOptIn] = useState<Record<string, boolean>>({});
  const [savingAliasId, setSavingAliasId] = useState<string | null>(null);
  const [submittingAllAliases, setSubmittingAllAliases] = useState(false);
  const [drawerRowId, setDrawerRowId] = useState<string | null>(null);
  const [aliasBannerOpen, setAliasBannerOpen] = useState(true);
  // ── Browser back interception ───────────────────────────────────────────────
  // Use refs to hold current values so the popstate handler never has stale closures.
  const drawerRowIdRef = useRef<string | null>(null);
  const rowsLengthRef = useRef<number>(0);
  const pasteTextRef = useRef<string>("");
  const doCloseRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!open) return;
    // Push a dummy history entry so browser back doesn't leave the page
    window.history.pushState({ labImport: true }, "");

    const handlePopState = () => {
      if (drawerRowIdRef.current) {
        // Drawer is open → close it and push state again to keep guard active
        setDrawerRowId(null);
        window.history.pushState({ labImport: true }, "");
      } else {
        // Drawer is closed → ask user before leaving import
        const hasDraft = rowsLengthRef.current > 0 || pasteTextRef.current.trim().length > 0;
        if (hasDraft) {
          setShowDiscardConfirm(true);
          // Push state again so a second Back press is also intercepted
          window.history.pushState({ labImport: true }, "");
        } else {
          doCloseRef.current();
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
    // Only re-register when open changes — refs handle the rest
  }, [open]);

  // ── Restore server draft on open ────────────────────────────────────────────
  useEffect(() => {
    if (!open || draftLoading || draftRestored) return;
    if (serverDraft) {
      const d = serverDraft as any;
      if (d.pasteText) setPasteTextRaw(d.pasteText);
      if (Array.isArray(d.uploadedFiles)) setUploadedFiles(d.uploadedFiles);
      if (Array.isArray(d.rows)) setRows(d.rows);
      if (Array.isArray(d.selectedIds)) setSelectedIds(new Set(d.selectedIds));
      if (d.step) setStepRaw(d.step);
      if (d.matchOverrides) setMatchOverrides(d.matchOverrides);
      if (d.manualMatchAliasOptIn) setManualMatchAliasOptIn(d.manualMatchAliasOptIn);
      setDraftRestored(true);
      toast.info("Unsaved draft restored.");
    } else {
      setDraftRestored(true);
    }
  }, [open, draftLoading, serverDraft, draftRestored]);

  useEffect(() => { if (!open) setDraftRestored(false); }, [open]);

  // ── Auto-save draft ─────────────────────────────────────────────────────────
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback((overrides?: {
    step?: "input" | "preview";
    rows?: ImportedLabRow[];
    pasteText?: string;
    uploadedFiles?: UploadedFile[];
    selectedIds?: Set<string>;
    matchOverrides?: Record<string, { dictionaryId: number; canonicalName: string }>;
    manualMatchAliasOptIn?: Record<string, boolean>;
  }) => {
    if (!draftKey) return;
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    autoSaveTimeoutRef.current = setTimeout(() => {
      saveDraftMut.mutate({
        draftKey,
        step: overrides?.step ?? step,
        pasteText: overrides?.pasteText ?? pasteText,
        uploadedFiles: (overrides?.uploadedFiles ?? uploadedFiles).filter(f => !f.uploading),
        rows: overrides?.rows ?? rows,
        selectedIds: Array.from(overrides?.selectedIds ?? selectedIds),
        matchOverrides: overrides?.matchOverrides ?? matchOverrides,
        manualMatchAliasOptIn: overrides?.manualMatchAliasOptIn ?? manualMatchAliasOptIn,
      });
    }, 1200);
  }, [draftKey, step, pasteText, uploadedFiles, rows, selectedIds, matchOverrides, manualMatchAliasOptIn]);

  const setPasteText = (v: string) => { setPasteTextRaw(v); scheduleSave({ pasteText: v }); };
  const setStep = (v: "input" | "preview") => { setStepRaw(v); scheduleSave({ step: v }); };

  const setRowsAndPersist = useCallback((updater: React.SetStateAction<ImportedLabRow[]>) => {
    setRows(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      scheduleSave({ rows: next });
      return next;
    });
  }, [scheduleSave]);

  // ── tRPC mutations ──────────────────────────────────────────────────────────
  const uploadFileMutation = trpc.lab.uploadResultFile.useMutation();
  const importMutation = trpc.lab.importLabResultsFromText.useMutation();
  const submitPendingMut = trpc.labDictionary.submitPending.useMutation();

  const RESULT_TYPE_OPTIONS = [
    "Quantitative", "Qualitative", "Molecular/PCR", "Genetic",
    "Microbiology Culture", "Panel/Profile", "Semen Analysis", "Semen DNA",
    "Therapeutic Drug Monitoring", "Descriptive/Report",
  ];

  // ── File upload ─────────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const newFiles: UploadedFile[] = Array.from(files).map(f => ({
      name: f.name, key: "", url: "", mimeType: f.type || "application/octet-stream",
      password: "", showPassword: false, uploading: true,
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const idx = uploadedFiles.length + i;
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let j = 0; j < bytes.byteLength; j++) binary += String.fromCharCode(bytes[j]);
        const base64 = btoa(binary);
        const result = await uploadFileMutation.mutateAsync({
          fileBase64: base64, fileName: file.name,
          mimeType: file.type || "application/octet-stream", labOrderId: 0,
        });
        setUploadedFiles(prev => prev.map((f, fi) =>
          fi === idx ? { ...f, key: result.key, url: result.url, mimeType: file.type || "application/octet-stream", uploading: false } : f
        ));
      } catch {
        setUploadedFiles(prev => prev.map((f, fi) =>
          fi === idx ? { ...f, uploading: false, error: "Upload failed" } : f
        ));
      }
    }
  }, [uploadedFiles.length, uploadFileMutation]);

  const removeFile = (i: number) => setUploadedFiles(prev => prev.filter((_, fi) => fi !== i));
  const updateFilePassword = (i: number, v: string) => setUploadedFiles(prev => prev.map((f, fi) => fi === i ? { ...f, password: v } : f));
  const toggleFilePasswordVisibility = (i: number) => setUploadedFiles(prev => prev.map((f, fi) => fi === i ? { ...f, showPassword: !f.showPassword } : f));

  // ── Extract ─────────────────────────────────────────────────────────────────
  const handleExtract = async () => {
    setExtracting(true);
    try {
      const readyFiles = uploadedFiles.filter(f => f.url && !f.uploading && !f.error);
      const result = await importMutation.mutateAsync({
        text: pasteText.trim() || undefined,
        files: readyFiles.map(f => ({ url: f.url, mimeType: f.mimeType, password: f.password || undefined, fileName: f.name })),
        existingTestNames,
      });
      const converted: ImportedLabRow[] = result.results.map((r: any) => {
        const base = applyTurkishConversion({
          testName: r.matchedTestName ?? r.testName,
          value: r.value ?? "",
          unit: r.unit ?? "",
          collectionDate: r.collectionDate ?? "",
          reportDate: r.reportDate ?? "",
          referenceRange: r.referenceRange ?? "",
          interpretation: r.interpretation ?? "",
          matchedTestName: r.matchedTestName ?? null,
          isMatched: r.isMatched ?? false,
          originalExtractedName: r.testName,
          dictionaryId: r.dictionaryId ?? null,
          resultType: r.resultType ?? null,
          suggestedModule: r.suggestedModule ?? null,
          analyteGroup: r.analyteGroup ?? null,
          orderType: r.orderType ?? null,
          needsReview: r.needsReview ?? false,
          reviewReason: r.reviewReason ?? undefined,
          extraFields: r.extraFields && Object.keys(r.extraFields).length > 0 ? r.extraFields : undefined,
          matchedVia: r.matchedVia ?? undefined,
          matchConfidence: r.matchConfidence ?? undefined,
          lowConfidence: r.lowConfidence ?? false,
          originalNameIsAlias: r.originalNameIsAlias ?? false,
          sourceFileName: r.sourceFileName,
          sourceFileKey: r.sourceFileKey,
          sourceFileUrl: r.sourceFileUrl,
        });
        return { ...base, id: makeId() };
      });
      setRowsAndPersist(converted);
      setStep("preview");
    } catch (err: any) {
      toast.error("Extraction failed: " + (err?.message ?? "Unknown error"));
    } finally {
      setExtracting(false);
    }
  };

  // ── Row actions ─────────────────────────────────────────────────────────────
  const confirmRow = (id: string) => {
    setRowsAndPersist(prev => prev.map(r => r.id === id ? { ...r, needsReview: false, reviewReason: undefined } : r));
  };
  const skipRow = (id: string) => {
    setRowsAndPersist(prev => prev.filter(r => r.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };
  const removeRow = (id: string) => {
    setRowsAndPersist(prev => prev.filter(r => r.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };
  const addEmptyRow = () => {
    setRowsAndPersist(prev => [...prev, {
      id: makeId(), testName: "", value: "", unit: "",
      collectionDate: "", reportDate: "", referenceRange: "", interpretation: "",
    }]);
  };
  const updateRow = (id: string, field: keyof ImportedLabRow, value: string) => {
    setRowsAndPersist(prev => prev.map(r => {
      if (r.id !== id) return r;
      if (field === "unit") {
        const numVal = parseFloat(r.value);
        if (!isNaN(numVal) && r.unit && value) {
          const converted = convertUnit(r.testName, numVal, r.unit, value);
          return { ...r, unit: value, value: String(roundLabValue(converted)) };
        }
        return { ...r, unit: value };
      }
      return { ...r, [field]: value };
    }));
  };

  // ── Match override ──────────────────────────────────────────────────────────
  const handleMatchOverride = (rowId: string, entry: LabDictionaryEntry) => {
    const newOverrides = { ...matchOverrides, [rowId]: { dictionaryId: entry.id, canonicalName: entry.canonicalName } };
    setMatchOverrides(newOverrides);
    const currentRow = rows.find(r => r.id === rowId);
    const extractedName = currentRow?.originalExtractedName ?? currentRow?.testName ?? '';
    const shouldSuggestAlias = !!extractedName && normalizeTestName(extractedName) !== normalizeTestName(entry.canonicalName);
    const newAliasOptIn = shouldSuggestAlias
      ? { ...manualMatchAliasOptIn, [rowId]: true }
      : (() => { const n = { ...manualMatchAliasOptIn }; delete n[rowId]; return n; })();
    setManualMatchAliasOptIn(newAliasOptIn);
    setRowsAndPersist(prev => prev.map(r =>
      r.id === rowId
        ? { ...r, dictionaryId: entry.id, resultType: entry.resultType ?? r.resultType, matchedTestName: entry.canonicalName, isMatched: true, needsReview: false, reviewReason: undefined, analyteGroup: entry.analyteGroup ?? r.analyteGroup, orderType: entry.orderType ?? r.orderType }
        : r
    ));
    scheduleSave({ matchOverrides: newOverrides, manualMatchAliasOptIn: newAliasOptIn });
  };

  // ── Alias ───────────────────────────────────────────────────────────────────
  const handleSaveAsAlias = async (row: ImportedLabRow) => {
    const override = matchOverrides[row.id];
    const dictId = override?.dictionaryId ?? row.dictionaryId;
    const canonicalName = override?.canonicalName ?? row.matchedTestName ?? row.testName;
    const aliasToSave = row.originalExtractedName ?? row.testName;
    if (!dictId) { toast.error("No dictionary entry selected. Please set a match first."); return; }
    if (!aliasToSave.trim()) { toast.error("No alias name to save."); return; }
    setSavingAliasId(row.id);
    try {
      await submitPendingMut.mutateAsync({
        rawName: aliasToSave.trim(), source: "pdf_import",
        possibleMatchId: dictId, possibleMatchName: canonicalName,
        possibleMatchScore: 100, aiConfidence: "high",
      });
      setRowsAndPersist(prev => prev.map(r => r.id === row.id ? { ...r, aliasConfirmed: true, dictionaryId: dictId } : r));
      toast.success(`"${aliasToSave}" submitted for review → alias for "${canonicalName}".`);
    } catch { toast.error("Failed to submit alias for review"); }
    finally { setSavingAliasId(null); }
  };

  // ── Final import ────────────────────────────────────────────────────────────
  const handleImport = () => {
    const valid = rows.filter(r => r.testName.trim() && r.value.trim());
    if (valid.length === 0) {
      toast.error("No valid results to import. Each row needs at least a test name and value.");
      return;
    }
    onImport(valid);
    doClose();
    toast.success(`${valid.length} lab result${valid.length > 1 ? "s" : ""} imported successfully.`);
  };

  // ── Close ───────────────────────────────────────────────────────────────────
  const hasDraftContent = pasteText.trim().length > 0 || uploadedFiles.length > 0 || rows.length > 0;
  const doClose = () => {
    if (draftKey) deleteDraftMut.mutate({ draftKey });
    setPasteTextRaw(""); setUploadedFiles([]); setRows([]); setSelectedIds(new Set());
    setStepRaw("input"); setMatchOverrides({}); setManualMatchAliasOptIn({});
    setDrawerRowId(null); setDraftRestored(false);
    onClose();
  };
  const handleClose = () => {
    if (hasDraftContent) setShowDiscardConfirm(true);
    else doClose();
  };

  // Keep refs in sync with latest values on every render (must be after doClose is defined)
  drawerRowIdRef.current = drawerRowId;
  rowsLengthRef.current = rows.length;
  pasteTextRef.current = pasteText;
  doCloseRef.current = doClose;

  // ── Derived values ──────────────────────────────────────────────────────────
  const displayedRows = reviewTab === "needs_review" ? rows.filter(r => r.needsReview) : rows;
  const needsReviewCount = rows.filter(r => r.needsReview).length;
  const matchedCount = rows.filter(r => r.isMatched && !r.needsReview).length;
  const drawerRow = drawerRowId ? rows.find(r => r.id === drawerRowId) ?? null : null;

  const aliasCandidates = useMemo(() => rows.filter(r => {
    if (r.aliasConfirmed) return false;
    // Already a confirmed alias in the dictionary — no need to suggest
    if (r.originalNameIsAlias) return false;
    if (!r.matchedVia || r.matchedVia === 'exact' || r.matchedVia.startsWith('alias:')) return false;
    const override = matchOverrides[r.id];
    const dictId = override?.dictionaryId ?? r.dictionaryId;
    const originalName = r.originalExtractedName ?? r.testName;
    const canonicalName = override?.canonicalName ?? r.matchedTestName ?? r.testName;
    return !!dictId && !!originalName && originalName.toLowerCase() !== canonicalName.toLowerCase();
  }), [rows, matchOverrides]);

  const manualAliasCandidates = useMemo(() => rows.filter(r =>
    !r.aliasConfirmed && manualMatchAliasOptIn[r.id] === true &&
    !aliasCandidates.find(a => a.id === r.id)
  ), [rows, manualMatchAliasOptIn, aliasCandidates]);

  const totalAliasCandidates = aliasCandidates.length + manualAliasCandidates.length;

  if (!open) return null;

  return (
    <>
      {/* Discard confirm */}
      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved text or files in the import workspace. If you close now, your draft will be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDiscardConfirm(false)}>Keep editing</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { setShowDiscardConfirm(false); doClose(); }}>Discard and close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Full-screen overlay */}
      <div className="fixed inset-0 z-50 bg-background flex flex-col">

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background shrink-0">
          <div className="flex items-center gap-3">
            {step === "preview" && (
              <Button variant="ghost" size="sm" className="gap-1.5 h-8" onClick={() => setStep("input")}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            )}
            <div>
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-primary" />
                AI Lab Import
              </h2>
              {step === "preview" && (
                <p className="text-xs text-muted-foreground">Review extracted results before saving</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {draftKey && saveDraftMut.isPending && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </span>
            )}
            {draftKey && !saveDraftMut.isPending && saveDraftMut.isSuccess && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Check className="h-3 w-3 text-green-500" /> Draft saved
              </span>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Loading state */}
        {draftLoading && !draftRestored && (
          <div className="flex-1 flex items-center justify-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Restoring draft…</span>
          </div>
        )}

        {(!draftLoading || draftRestored) && (
          <>
            {/* INPUT STEP */}
            {step === "input" && (
              <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Paste lab report text</Label>
                  <Textarea
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    placeholder="Paste the lab report text here…"
                    className="min-h-[160px] font-mono text-sm"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">and / or</span>
                  <Separator className="flex-1" />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Upload lab report files</Label>
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                  >
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Click to upload or drag & drop</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG — multiple files supported</p>
                    <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={e => handleFiles(e.target.files)} />
                  </div>

                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {uploadedFiles.map((f, i) => (
                        <div key={i} className="border rounded-md p-2 bg-muted/40 space-y-1.5">
                          <div className="flex items-center gap-2 text-sm">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="flex-1 truncate font-medium">{f.name}</span>
                            {f.uploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                            {f.url && !f.uploading && <Check className="h-4 w-4 text-green-500" />}
                            {f.error && <span className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{f.error}</span>}
                            <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <div className="relative flex-1">
                              <Input
                                type={f.showPassword ? "text" : "password"}
                                placeholder="Document password (if protected)"
                                value={f.password}
                                onChange={e => updateFilePassword(i, e.target.value)}
                                className="h-7 text-xs pr-8"
                              />
                              <button type="button" onClick={() => toggleFilePasswordVisibility(i)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                {f.showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={handleClose}>Cancel</Button>
                  <Button
                    onClick={handleExtract}
                    disabled={extracting || (!pasteText.trim() && uploadedFiles.filter(f => f.url && !f.uploading && !f.error).length === 0)}
                  >
                    {extracting
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Extracting…</>
                      : <><Wand2 className="h-4 w-4 mr-2" />Extract Results</>}
                  </Button>
                </div>
              </div>
            )}

            {/* PREVIEW STEP */}
            {step === "preview" && (
              <div className="flex-1 flex flex-col min-h-0">

                {/* Compact summary bar */}
                <div className="shrink-0 px-4 py-2 border-b bg-muted/20 flex items-center gap-3 flex-wrap">
                  <Badge variant="secondary" className="gap-1">
                    <span className="font-semibold">{rows.length}</span> Results
                  </Badge>
                  <Badge variant="outline" className="gap-1 border-green-300 text-green-700 bg-green-50">
                    <Check className="h-3 w-3" /><span className="font-semibold">{matchedCount}</span> Matched
                  </Badge>
                  {needsReviewCount > 0 && (
                    <Badge variant="outline" className="gap-1 border-orange-300 text-orange-700 bg-orange-50">
                      <AlertCircle className="h-3 w-3" /><span className="font-semibold">{needsReviewCount}</span> Needs Review
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground hidden sm:inline">Values auto-converted to Turkish standard units.</span>

                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setReviewTab("all")}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${reviewTab === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      All ({rows.length})
                    </button>
                    {needsReviewCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setReviewTab("needs_review")}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${reviewTab === "needs_review" ? "bg-orange-500 text-white" : "text-orange-700 hover:bg-orange-50"}`}
                      >
                        Needs Review ({needsReviewCount})
                      </button>
                    )}
                  </div>
                </div>

                {/* Alias suggestions banner */}
                {totalAliasCandidates > 0 && (
                  <div className="shrink-0 border-b bg-purple-50/50">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-4 py-2 text-xs text-purple-700 hover:bg-purple-50"
                      onClick={() => setAliasBannerOpen(v => !v)}
                    >
                      <Tag className="h-3.5 w-3.5" />
                      <span className="font-medium">{totalAliasCandidates} Alias Suggestion{totalAliasCandidates > 1 ? "s" : ""} pending</span>
                      <span className="text-muted-foreground ml-1">— click to review</span>
                      {aliasBannerOpen ? <ChevronDown className="h-3.5 w-3.5 ml-auto" /> : <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
                    </button>
                    {aliasBannerOpen && (
                      <div className="px-4 pb-3 space-y-1.5">
                        {[...aliasCandidates, ...manualAliasCandidates].map(r => {
                          const override = matchOverrides[r.id];
                          const canonicalName = override?.canonicalName ?? r.matchedTestName ?? r.testName;
                          const originalName = r.originalExtractedName ?? r.testName;
                          return (
                            <div key={r.id} className="flex items-center gap-2 text-xs">
                              <span className="text-purple-700 font-medium">{originalName}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="text-foreground">{canonicalName}</span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-5 text-[10px] px-2 ml-auto border-purple-300 text-purple-700 hover:bg-purple-100"
                                disabled={savingAliasId === r.id}
                                onClick={() => handleSaveAsAlias(r)}
                              >
                                {savingAliasId === r.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : "Submit"}
                              </Button>
                            </div>
                          );
                        })}
                        {totalAliasCandidates > 1 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs gap-1 border-purple-300 text-purple-700 hover:bg-purple-100 mt-1"
                            disabled={submittingAllAliases}
                            onClick={async () => {
                              setSubmittingAllAliases(true);
                              let ok = 0, fail = 0;
                              for (const r of [...aliasCandidates, ...manualAliasCandidates]) {
                                try { await handleSaveAsAlias(r); ok++; } catch { fail++; }
                              }
                              setSubmittingAllAliases(false);
                              if (ok > 0) toast.success(`${ok} alias suggestion${ok > 1 ? "s" : ""} submitted.`);
                              if (fail > 0) toast.error(`${fail} could not be submitted.`);
                            }}
                          >
                            {submittingAllAliases ? <Loader2 className="h-3 w-3 animate-spin" /> : <Tag className="h-3 w-3" />}
                            Submit All {totalAliasCandidates}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Bulk selection toolbar */}
                {selectedIds.size > 0 && (
                  <div className="shrink-0 px-4 py-2 border-b bg-primary/5 flex items-center gap-3 text-xs">
                    <span className="font-medium">{selectedIds.size} selected</span>
                    <Button
                      variant="outline" size="sm"
                      className="h-6 text-xs px-2 gap-1 text-destructive border-destructive/30"
                      onClick={() => {
                        const ids = Array.from(selectedIds);
                        setRowsAndPersist(prev => prev.filter(r => !ids.includes(r.id)));
                        setSelectedIds(new Set());
                      }}
                    >
                      <Trash2 className="h-3 w-3" /> Delete Selected
                    </Button>
                    <Select onValueChange={bulkUnit => {
                      setRowsAndPersist(prev => prev.map(r => {
                        if (!selectedIds.has(r.id)) return r;
                        const numVal = parseFloat(r.value);
                        if (!isNaN(numVal) && r.unit && bulkUnit) {
                          const converted = convertUnit(r.matchedTestName ?? r.testName, numVal, r.unit, bulkUnit);
                          return { ...r, unit: bulkUnit, value: String(roundLabValue(converted)) };
                        }
                        return { ...r, unit: bulkUnit };
                      }));
                    }}>
                      <SelectTrigger className="h-6 text-xs w-[120px]">
                        <SelectValue placeholder="Set unit…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const units = Array.from(new Set(
                            rows.filter(r => selectedIds.has(r.id)).flatMap(r => getUnitsForTest(r.matchedTestName ?? r.testName))
                          ));
                          if (units.length === 0) return <div className="px-2 py-1.5 text-xs text-muted-foreground">No unit options</div>;
                          return units.map(u => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>);
                        })()}
                      </SelectContent>
                    </Select>
                    <button type="button" className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setSelectedIds(new Set())}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Mobile card layout (hidden on md+) */}
                <div className="flex-1 overflow-y-auto md:hidden">
                  {displayedRows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mb-2 text-green-500" />
                      <p className="text-sm font-medium">All rows reviewed</p>
                      <p className="text-xs mt-1">Switch to &ldquo;All&rdquo; tab to see the full list</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {displayedRows.map(row => {
                        const override = matchOverrides[row.id];
                        const matchedName = override?.canonicalName ?? row.matchedTestName ?? null;
                        const originalName = row.originalExtractedName ?? row.testName;
                        const showOriginal = originalName && originalName !== (matchedName ?? row.testName);
                        return (
                          <div
                            key={row.id}
                            className={`px-4 py-3 space-y-2 ${
                              row.needsReview ? "bg-orange-50/30" : ""
                            }`}
                          >
                            {/* Row header: status + actions */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm leading-snug">{matchedName ?? row.testName}</div>
                                {showOriginal && (
                                  <div className="text-[11px] text-muted-foreground mt-0.5">Original: {originalName}</div>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <RowStatusBadge row={row} />
                                <RowActionsMenu
                                  row={row}
                                  onReview={() => setDrawerRowId(row.id)}
                                  onConfirm={() => confirmRow(row.id)}
                                  onSkip={() => skipRow(row.id)}
                                  onRemove={() => removeRow(row.id)}
                                />
                              </div>
                            </div>
                            {/* Value + Unit + Interpretation */}
                            <div className="flex items-center gap-3 text-sm">
                              <span className="font-semibold">{row.value}</span>
                              {row.unit && <span className="text-muted-foreground text-xs">{row.unit}</span>}
                              {row.interpretation && (
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                                  row.interpretation === "High" ? "bg-red-100 text-red-700" :
                                  row.interpretation === "Low" ? "bg-blue-100 text-blue-700" :
                                  "bg-gray-100 text-gray-600"
                                }`}>{row.interpretation}</span>
                              )}
                            </div>
                            {/* Date + Ref Range */}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              {row.collectionDate && <span>📅 {row.collectionDate}</span>}
                              {row.referenceRange && <span>Ref: {row.referenceRange}</span>}
                              {row.sourceFileUrl && (
                                <a href={row.sourceFileUrl} target="_blank" rel="noopener noreferrer" className="text-primary flex items-center gap-1">
                                  <Paperclip className="h-3 w-3" /> File
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {/* Desktop table (hidden on mobile) */}
                <div className="flex-1 overflow-auto hidden md:block">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                      <tr className="border-b">
                        <th className="w-7 p-1.5 text-center">
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={displayedRows.length > 0 && displayedRows.every(r => selectedIds.has(r.id))}
                            onChange={e => {
                              if (e.target.checked) setSelectedIds(new Set(displayedRows.map(r => r.id)));
                              else setSelectedIds(new Set());
                            }}
                          />
                        </th>
                        <th className="text-left px-2 py-1.5 font-semibold w-[100px]">Status</th>
                        <th className="text-left px-2 py-1.5 font-semibold min-w-[200px]">Test Name</th>
                        <th className="text-left px-2 py-1.5 font-semibold w-[70px]">Value</th>
                        <th className="text-left px-2 py-1.5 font-semibold w-[100px]">Unit</th>
                        <th className="text-left px-2 py-1.5 font-semibold w-[130px]">Collection Date</th>
                        <th className="text-left px-2 py-1.5 font-semibold w-[90px]">Ref. Range</th>
                        <th className="text-center px-2 py-1.5 font-semibold w-[28px]" title="Source file">
                          <Paperclip className="h-3 w-3 inline" />
                        </th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedRows.map(row => {
                        const unitOptions = getUnitsForTest(row.matchedTestName ?? row.testName);
                        const isSelected = selectedIds.has(row.id);
                        const override = matchOverrides[row.id];
                        const matchedName = override?.canonicalName ?? row.matchedTestName ?? null;
                        const originalName = row.originalExtractedName ?? row.testName;
                        const showOriginal = originalName && originalName !== (matchedName ?? row.testName);

                        return (
                          <tr
                            key={row.id}
                            className={`border-b last:border-0 ${
                              row.needsReview ? "bg-orange-50/20 hover:bg-orange-50/40" :
                              isSelected ? "bg-primary/5" : "hover:bg-muted/20"
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="w-7 p-1 text-center">
                              <input
                                type="checkbox"
                                className="accent-primary"
                                checked={isSelected}
                                onChange={e => {
                                  setSelectedIds(prev => {
                                    const n = new Set(prev);
                                    e.target.checked ? n.add(row.id) : n.delete(row.id);
                                    return n;
                                  });
                                }}
                              />
                            </td>

                            {/* Status */}
                            <td className="px-2 py-1.5">
                              <RowStatusBadge row={row} />
                              {row.resultType && (
                                <div className="mt-0.5">
                                  <span className={`inline-flex items-center px-1 py-0 rounded text-[9px] font-medium ${
                                    RESULT_TYPE_COLORS[row.resultType as ResultType] ?? "bg-gray-100 text-gray-700"
                                  }`}>
                                    {row.resultType}
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* Test Name: two lines */}
                            <td className="px-2 py-1.5">
                              <div className="space-y-0.5">
                                <input
                                  value={row.testName}
                                  onChange={e => updateRow(row.id, "testName", e.target.value)}
                                  className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary focus:outline-none rounded px-1 py-0.5 text-xs font-medium"
                                />
                                {matchedName && matchedName !== row.testName && (
                                  <div className="flex items-center gap-1 px-1">
                                    <Check className="h-2.5 w-2.5 text-green-600 shrink-0" />
                                    <span className="text-[10px] text-green-700 font-medium truncate">{matchedName}</span>
                                    {row.matchConfidence !== undefined && row.matchConfidence < 100 && (
                                      <span className={`text-[9px] px-1 rounded-full font-medium shrink-0 ${
                                        row.lowConfidence ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                                      }`}>{row.matchConfidence}%</span>
                                    )}
                                  </div>
                                )}
                                {showOriginal && (
                                  <div className="px-1">
                                    <span className="text-[10px] text-muted-foreground">Original: {originalName}</span>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Value */}
                            <td className="px-1 py-1.5">
                              <input
                                value={row.value}
                                onChange={e => updateRow(row.id, "value", e.target.value)}
                                className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary focus:outline-none rounded px-1 py-0.5 text-xs"
                              />
                              {row.converted && row.originalValue && (
                                <div className="text-[9px] text-muted-foreground px-1">was {row.originalValue}</div>
                              )}
                            </td>

                            {/* Unit */}
                            <td className="px-1 py-1.5">
                              {unitOptions.length > 1 ? (
                                <Select value={row.unit} onValueChange={v => updateRow(row.id, "unit", v)}>
                                  <SelectTrigger className="h-6 text-xs border-transparent hover:border-border px-1">
                                    <SelectValue placeholder="unit" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {unitOptions.map(u => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <input
                                  value={row.unit}
                                  onChange={e => updateRow(row.id, "unit", e.target.value)}
                                  placeholder="unit"
                                  className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary focus:outline-none rounded px-1 py-0.5 text-xs"
                                />
                              )}
                            </td>

                            {/* Collection Date */}
                            <td className="px-1 py-1.5">
                              <input
                                type="date"
                                value={row.collectionDate}
                                onChange={e => updateRow(row.id, "collectionDate", e.target.value)}
                                className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary focus:outline-none rounded px-1 py-0.5 text-xs"
                              />
                            </td>

                            {/* Ref Range */}
                            <td className="px-1 py-1.5">
                              <input
                                value={row.referenceRange}
                                onChange={e => updateRow(row.id, "referenceRange", e.target.value)}
                                placeholder="e.g. 3.5–12.5"
                                className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary focus:outline-none rounded px-1 py-0.5 text-xs"
                              />
                            </td>

                            {/* Source file */}
                            <td className="px-1 py-1.5 text-center">
                              {row.sourceFileUrl ? (
                                <a href={row.sourceFileUrl} target="_blank" rel="noopener noreferrer" title={row.sourceFileName ?? "Source document"} className="text-primary hover:text-primary/70 p-0.5 rounded inline-flex">
                                  <Paperclip className="h-3 w-3" />
                                </a>
                              ) : (
                                <span className="text-muted-foreground/30 p-0.5 inline-flex"><Paperclip className="h-3 w-3" /></span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="px-1 py-1.5 text-center">
                              <RowActionsMenu
                                row={row}
                                onReview={() => setDrawerRowId(row.id)}
                                onConfirm={() => confirmRow(row.id)}
                                onSkip={() => skipRow(row.id)}
                                onRemove={() => removeRow(row.id)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {displayedRows.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mb-2 text-green-500" />
                      <p className="text-sm font-medium">All rows reviewed</p>
                      <p className="text-xs mt-1">Switch to &ldquo;All&rdquo; tab to see the full list</p>
                    </div>
                  )}
                </div>
                {/* Bottom action bar */}
                <div className="shrink-0 px-4 py-3 border-t bg-background flex items-center justify-between gap-3">
                  <Button variant="outline" size="sm" onClick={addEmptyRow} className="gap-1 text-xs h-8">
                    <Plus className="h-3.5 w-3.5" /> Add Row
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleClose} className="h-8">Cancel</Button>
                    <Button
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={handleImport}
                      disabled={rows.filter(r => r.testName.trim() && r.value.trim()).length === 0}
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Final Import / Save ({rows.filter(r => r.testName.trim() && r.value.trim()).length} results)</span>
                      <span className="sm:hidden">Save {rows.filter(r => r.testName.trim() && r.value.trim()).length} Results</span>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

        {/* Match Review Drawer */}
      {drawerRowId && (
        <>
          <div className="fixed inset-0 z-[55] bg-black/20 hidden sm:block" onClick={() => setDrawerRowId(null)} />
          <MatchReviewDrawer
            row={drawerRow}
            matchOverride={drawerRow ? matchOverrides[drawerRow.id] : undefined}
            onClose={() => setDrawerRowId(null)}
            onSaveMatch={entry => drawerRow && handleMatchOverride(drawerRow.id, entry)}
            onSaveAlias={handleSaveAsAlias}
            onConfirmRow={confirmRow}
            onSkipRow={skipRow}
            savingAlias={!!drawerRow && savingAliasId === drawerRow.id}
          />
        </>
      )}
    </>
  );
}
