import { useState, useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useDebounce } from "@/hooks/useDebounce";
import { trpc } from "@/lib/trpc";
import { fmtDate } from "@/lib/dateFormat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Search,
  Plus,
  Edit,
  Power,
  Database,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FlaskConical,
  Tag,
  X,
  FileUp,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Clock,
  Trash2,
  ArrowUpDown,
  User,
  Calendar,
  Undo2,
  History,
  MoreHorizontal,
  Copy,
  Eye,
  Settings,
  ChevronDown,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RESULT_TYPE_COLORS, type ResultType } from "@/components/LabTestAutocomplete";
import { BulkEnrichDialog } from "@/components/BulkEnrichDialog";
import { SmartMatchModal } from "@/components/SmartMatchModal";

const RESULT_TYPES = [
  "Quantitative",
  "Qualitative",
  "Molecular/PCR",
  "Genetic",
  "Microbiology Culture",
  "Microscopy/Parasitology",
  "Panel/Profile",
  "Pathology/Biopsy",
  "Semen Analysis",
  "Semen DNA",
  "Therapeutic Drug Monitoring",
  "Descriptive/Report",
] as const;

const SUGGESTED_MODULES = [
  { value: "general_lab", label: "General Lab" },
  { value: "semen_analysis", label: "Semen Analysis" },
  { value: "semen_dna", label: "Semen DNA" },
  { value: "genetic", label: "Genetic" },
  { value: "radiology", label: "Radiology" },
  { value: "pathology", label: "Pathology" },
];

// ── Relative time helper ────────────────────────────────────────────────────────
function formatRelativeTime(date: Date | string): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(date);
}

// ── Change type badge ────────────────────────────────────────────────────────
const CHANGE_TYPE_LABELS: Record<string, { label: string; className: string }> = {
  created: { label: "Created", className: "bg-green-100 text-green-800" },
  updated: { label: "Updated", className: "bg-blue-100 text-blue-800" },
  alias_added: { label: "Alias Added", className: "bg-purple-100 text-purple-800" },
  alias_removed: { label: "Alias Removed", className: "bg-orange-100 text-orange-800" },
  approved_from_pending: { label: "Approved", className: "bg-teal-100 text-teal-800" },
  bulk_enriched: { label: "Bulk Enriched", className: "bg-indigo-100 text-indigo-800" },
};

// ── Change History Section (inside detail dialog) ────────────────────────────
function ChangeHistorySection({
  dictionaryId,
  undoChangeMut,
}: {
  dictionaryId: number;
  undoChangeMut: ReturnType<typeof trpc.labDictionary.undoChange.useMutation>;
}) {
  const { data: history, isLoading } = trpc.labDictionary.getChangeHistory.useQuery(
    { dictionaryId, limit: 30 },
    { enabled: !!dictionaryId }
  );

  if (isLoading) {
    return (
      <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading history...
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="mt-4">
        <Separator />
        <div className="flex items-center gap-2 mt-3 mb-1">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Change History</span>
        </div>
        <p className="text-xs text-muted-foreground">No changes recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <Separator />
      <div className="flex items-center gap-2 mt-3 mb-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-sm">Change History</span>
        <span className="text-xs text-muted-foreground ml-1">({history.length})</span>
      </div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {history.map((row) => {
          const typeInfo = CHANGE_TYPE_LABELS[row.changeType] ?? { label: row.changeType, className: "bg-gray-100 text-gray-700" };
          const canUndo = !row.isUndone && ["alias_added", "alias_removed", "updated"].includes(row.changeType);
          return (
            <div
              key={row.id}
              className={cn(
                "flex items-start gap-2 text-xs rounded-md px-2 py-1.5 border",
                row.isUndone ? "opacity-40 line-through bg-muted/30" : "bg-background"
              )}
            >
              <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-medium text-[10px] mt-0.5", typeInfo.className)}>
                {typeInfo.label}
              </span>
              <div className="flex-1 min-w-0">
                {row.changeType === "updated" && row.fieldName && (
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{row.fieldName}</span>:
                    {" "}
                    <span className="line-through text-red-500">{row.oldValue || "(empty)"}</span>
                    {" → "}
                    <span className="text-green-700">{row.newValue || "(empty)"}</span>
                  </span>
                )}
                {(row.changeType === "alias_added" || row.changeType === "alias_removed") && (
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{row.newValue || row.oldValue}</span>
                  </span>
                )}
                {(row.changeType === "created" || row.changeType === "approved_from_pending") && (
                  <span className="text-muted-foreground">Entry created</span>
                )}
                {row.changeType === "bulk_enriched" && (
                  <span className="text-muted-foreground">Bulk AI enrichment applied</span>
                )}
                <div className="flex items-center gap-1 mt-0.5 text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span>{row.performedByName ?? "Unknown"}</span>
                  <span className="mx-1">·</span>
                  <Clock className="h-3 w-3" />
                  <span title={new Date(row.createdAt).toLocaleString()}>
                    {formatRelativeTime(row.createdAt)}
                  </span>
                  {row.isUndone && <span className="ml-1 text-orange-500 font-medium">(undone)</span>}
                </div>
              </div>
              {canUndo && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50 shrink-0"
                  disabled={undoChangeMut.isPending}
                  onClick={() => undoChangeMut.mutate({ changeId: row.id })}
                  title="Undo this change"
                >
                  <Undo2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LabDictionaryAdmin() {
  const utils = trpc.useUtils();

  // Filters
  const [search, setSearch] = useState("");
  const [filterResultType, setFilterResultType] = useState<string>("all");
  const [filterActive, setFilterActive] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "createdAt" | "updatedAt">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  // Delete state
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState<string>("");

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [generatingAliasesForId, setGeneratingAliasesForId] = useState<number | null>(null);
  const [bulkGeneratingAliases, setBulkGeneratingAliases] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

  // Dialogs
  const [editEntry, setEditEntry] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [seedConfirm, setSeedConfirm] = useState(false);
  const [detailEntry, setDetailEntry] = useState<any>(null);

  // PDF Import state
  const [showPdfImport, setShowPdfImport] = useState(false);
  const [showBulkEnrich, setShowBulkEnrich] = useState(false);
  const [pdfImporting, setPdfImporting] = useState(false);

  type PdfNewTest = {
    name: string;           // corrected name from AI (editable)
    originalName: string;   // raw OCR name
    wasCorrected: boolean;
    correctionNote: string;
    reviewWarning: string;
    suggestedType: string;
    confidence: string;
    category: string;
    specimen: string;
    units: string;
    suggestedAliases: string[];
  };

  const [pdfResults, setPdfResults] = useState<null | {
    existing: Array<{ name: string; matchedId: number; matchedName: string }>;
    newTests: PdfNewTest[];
  }>(null);
  // Per-row editable overrides: key = originalName, value = edited fields
  const [pdfEdits, setPdfEdits] = useState<Record<string, Partial<PdfNewTest & { editedName: string }>>>({});
  const [selectedNewTests, setSelectedNewTests] = useState<Set<string>>(new Set());
  const [addingBulk, setAddingBulk] = useState(false);
  const pdfFileRef = useRef<HTMLInputElement>(null);
  const importPdfMut = trpc.labDictionary.importDictionaryFromPdf.useMutation();
  const createBulkMut = trpc.labDictionary.create.useMutation();

  const handlePdfImport = async (file: File) => {
    setPdfImporting(true);
    setPdfResults(null);
    setPdfEdits({});
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadResp = await fetch("/api/upload-temp", { method: "POST", body: formData });
      if (!uploadResp.ok) throw new Error("Upload failed");
      const { url } = await uploadResp.json();
      const result = await importPdfMut.mutateAsync({ fileUrl: url });
      // Ensure backward compat: fill missing fields
      const enriched: PdfNewTest[] = (result.newTests as any[]).map((t: any) => ({
        name: t.name ?? t.correctedName ?? "",
        originalName: t.originalName ?? t.extractedName ?? t.name ?? "",
        wasCorrected: t.wasCorrected ?? false,
        correctionNote: t.correctionNote ?? "",
        reviewWarning: t.reviewWarning ?? "",
        suggestedType: t.suggestedType ?? "Quantitative",
        confidence: t.confidence ?? "low",
        category: t.category ?? "",
        specimen: t.specimen ?? "Blood",
        units: t.units ?? "",
        suggestedAliases: t.suggestedAliases ?? [],
      }));
      setPdfResults({ existing: result.existing, newTests: enriched });
      setSelectedNewTests(new Set(enriched.map(t => t.originalName)));
    } catch (e: any) {
      toast.error("Import failed", { description: e.message });
    } finally {
      setPdfImporting(false);
    }
  };

  const handleAddSelectedTests = async () => {
    if (!pdfResults) return;
    const toAdd = pdfResults.newTests.filter(t => selectedNewTests.has(t.originalName));
    if (toAdd.length === 0) return;
    setAddingBulk(true);
    let added = 0;
    let skipped = 0;
    let failed = 0;
    for (const t of toAdd) {
      const edits = pdfEdits[t.originalName] ?? {};
      const finalName = edits.editedName ?? t.name;
      const rawType = edits.suggestedType ?? t.suggestedType;
      // Normalize resultType to valid enum value — fallback to Quantitative
      const validTypes = ["Quantitative","Qualitative","Molecular/PCR","Genetic","Microbiology Culture","Microscopy/Parasitology","Panel/Profile","Pathology/Biopsy","Semen Analysis","Semen DNA","Therapeutic Drug Monitoring","Descriptive/Report"] as const;
      const finalType = (validTypes as readonly string[]).includes(rawType) ? rawType : "Quantitative";
      const finalCategory = edits.category ?? t.category;
      const finalSpecimen = edits.specimen ?? t.specimen;
      const finalUnits = edits.units ?? t.units;
      try {
        const res = await createBulkMut.mutateAsync({
          canonicalName: finalName,
          displayName: finalName,
          resultType: (finalType as any),
          category: finalCategory || undefined,
          specimen: finalSpecimen || undefined,
          commonUnits: finalUnits || undefined,
        });
        if ((res as any).deduplicated) {
          skipped++;
        } else {
          added++;
          // Save suggested aliases for newly created tests
          const newId = (res as any).id;
          const finalAliases = edits.suggestedAliases ?? t.suggestedAliases ?? [];
          if (newId && finalAliases.length > 0) {
            for (const alias of finalAliases) {
              try {
                await addAliasMut.mutateAsync({ dictionaryId: newId, alias, scope: 'global' });
              } catch {
                // ignore duplicate alias errors
              }
            }
          }
        }
      } catch (err: any) {
        failed++;
        console.error('[PDF Import] Failed to add test:', finalName, err?.message ?? err);
      }
    }
    setAddingBulk(false);
    utils.labDictionary.list.invalidate();
    const parts: string[] = [];
    if (added > 0) parts.push(`${added} new test${added > 1 ? 's' : ''} added`);
    if (skipped > 0) parts.push(`${skipped} already existed (skipped)`);
    if (parts.length > 0) toast.success(parts.join(', '));
    if (failed > 0) toast.error(`${failed} test${failed > 1 ? 's' : ''} failed to add — check browser console for details`);
    if (added > 0 || skipped > 0) {
      setShowPdfImport(false);
      setPdfResults(null);
      setPdfEdits({});
    }
  };

  // Form state
  const emptyForm = {
    canonicalName: "",
    displayName: "",
    abbreviation: "",
    resultType: "Quantitative" as (typeof RESULT_TYPES)[number],
    category: "",
    specimen: "",
    commonUnits: "",
    canonicalUnit: "",
    alternativeUnits: "[]",
    conversionFactors: "{}",
    suggestedModule: "general_lab" as const,
    analyteGroup: "",
    orderType: "Single Result Test" as "Single Result Test" | "Timed Component" | "Protocol Name" | "Genetic / Molecular",
    notes: "",
    aliases: [] as string[],
    newAlias: "",
  };
  const [form, setForm] = useState(emptyForm);

  // Active tab
  const [activeTab, setActiveTab] = useState<"dictionary" | "pending">("dictionary");

  // Smart Match Modal
  const [smartMatchRow, setSmartMatchRow] = useState<any | null>(null);

  // Pending tests
  const { data: pendingData, isLoading: pendingLoading, refetch: refetchPending } = trpc.labDictionary.listPending.useQuery({ status: "pending" });
  const reviewPendingMut = trpc.labDictionary.reviewPending.useMutation({
    onSuccess: () => {
      refetchPending();
      utils.labDictionary.list.invalidate();
      toast.success('Review saved');
    },
    onError: (e) => toast.error(e.message),
  });

  // Approve as New dialog state
  const [approveDialogRow, setApproveDialogRow] = useState<any | null>(null);
  const [approveForm, setApproveForm] = useState({
    canonicalName: "",
    displayName: "",
    abbreviation: "",
    resultType: "Quantitative" as (typeof RESULT_TYPES)[number],
    suggestedModule: "general_lab" as const,
    analyteGroup: "",
    orderType: "Single Result Test" as "Single Result Test" | "Timed Component" | "Protocol Name" | "Genetic / Molecular",
    category: "",
    specimen: "",
    commonUnits: "",
    canonicalUnit: "",
    alternativeUnits: "[]",
    conversionFactors: "{}",
    notes: "",
    aliases: [] as string[],
    newAlias: "",
  });
  const [aiFillingApprove, setAiFillingApprove] = useState(false);
  const [aiFillingCreate, setAiFillingCreate] = useState(false);
  const aiSuggestFieldsMut = trpc.labDictionary.aiSuggestFields.useMutation({
    onError: (e) => toast.error("AI fill failed: " + e.message),
  });

  const openApproveDialog = (pt: any) => {
    setApproveDialogRow(pt);
    setApproveForm({
      canonicalName: pt.suggestedCanonicalName ?? pt.rawName,
      displayName: pt.suggestedDisplayName ?? pt.suggestedCanonicalName ?? pt.rawName,
      abbreviation: pt.suggestedAbbreviation ?? "",
      resultType: (RESULT_TYPES.includes(pt.suggestedResultType) ? pt.suggestedResultType : "Quantitative") as any,
      suggestedModule: "general_lab",
      analyteGroup: "",
      orderType: "Single Result Test",
      category: pt.suggestedCategory ?? "",
      specimen: pt.suggestedSpecimen ?? "",
      commonUnits: pt.suggestedUnits ?? "",
      canonicalUnit: "",
      alternativeUnits: "[]",
      conversionFactors: "{}",
      notes: "",
      aliases: [],
      newAlias: "",
    });
  };

  const handleAiFillCreate = async () => {
    if (!form.canonicalName.trim()) {
      toast.error("Enter a test name first before using AI fill");
      return;
    }
    setAiFillingCreate(true);
    try {
      const result = await aiSuggestFieldsMut.mutateAsync({ rawName: form.canonicalName.trim() });
      setForm(prev => ({
        ...prev,
        canonicalName: result.canonicalName,
        displayName: result.displayName,
        abbreviation: result.abbreviation,
        resultType: result.resultType as any,
        suggestedModule: result.suggestedModule as any,
        analyteGroup: (result as any).analyteGroup ?? prev.analyteGroup,
        orderType: (result as any).orderType ?? prev.orderType,
        category: result.category,
        specimen: result.specimen,
        commonUnits: result.commonUnits,
        canonicalUnit: result.canonicalUnit ?? "",
        alternativeUnits: result.alternativeUnits ?? "[]",
        conversionFactors: result.conversionFactors ?? "{}",
        notes: result.notes,
        aliases: result.aliases,
      }));
      toast.success("AI filled all fields — please review before saving");
    } catch {
      // error handled by mutation
    } finally {
      setAiFillingCreate(false);
    }
  };

  const handleAiFillApprove = async () => {
    if (!approveDialogRow) return;
    setAiFillingApprove(true);
    try {
      const result = await aiSuggestFieldsMut.mutateAsync({ rawName: approveDialogRow.rawName });
      setApproveForm(prev => ({
        ...prev,
        canonicalName: result.canonicalName,
        displayName: result.displayName,
        abbreviation: result.abbreviation,
        resultType: result.resultType as any,
        suggestedModule: result.suggestedModule as any,
        analyteGroup: (result as any).analyteGroup ?? prev.analyteGroup,
        orderType: (result as any).orderType ?? prev.orderType,
        category: result.category,
        specimen: result.specimen,
        commonUnits: result.commonUnits,
        canonicalUnit: result.canonicalUnit ?? "",
        alternativeUnits: result.alternativeUnits ?? "[]",
        conversionFactors: result.conversionFactors ?? "{}",
        notes: result.notes,
        aliases: result.aliases,
      }));
      toast.success("AI filled all fields — please review before saving");
    } catch {
      // error handled by mutation
    } finally {
      setAiFillingApprove(false);
    }
  };

  const handleApproveSubmit = () => {
    if (!approveDialogRow) return;
    const { newAlias, aliases, ...rest } = approveForm;
    reviewPendingMut.mutate({
      id: approveDialogRow.id,
      action: "approve",
      ...rest,
    }, {
      onSuccess: () => {
        setApproveDialogRow(null);
      },
    });
  };

  // Merge as Alias state — per-row
  const [mergeRowId, setMergeRowId] = useState<number | null>(null); // which pending row is in merge mode
  const [mergeSearch, setMergeSearch] = useState("");
  const debouncedMergeSearch = useDebounce(mergeSearch, 300);
  const { data: mergeResults } = trpc.labDictionary.search.useQuery(
    { query: debouncedMergeSearch, limit: 8 },
    { enabled: debouncedMergeSearch.length >= 2 }
  );
  const [mergeTarget, setMergeTarget] = useState<{ id: number; name: string } | null>(null);

  // Query
  const { data, isLoading, refetch } = trpc.labDictionary.list.useQuery({
    search: search || undefined,
    resultType: filterResultType !== "all" ? (filterResultType as any) : undefined,
    isActive: filterActive === "all" ? undefined : filterActive === "active",
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sortBy,
    sortDir,
    page,
    pageSize: 50,
  });

  // Detail query
  const { data: detail } = trpc.labDictionary.getById.useQuery(
    { id: detailEntry?.id ?? 0 },
    { enabled: !!detailEntry?.id }
  );

  // Mutations
  const createMut = trpc.labDictionary.create.useMutation({
    onSuccess: () => {
      toast.success("Test added to dictionary");
      setShowCreate(false);
      setForm(emptyForm);
      utils.labDictionary.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.labDictionary.update.useMutation({
    onSuccess: () => {
      toast.success("Entry updated");
      setEditEntry(null);
      utils.labDictionary.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.labDictionary.delete.useMutation({
    onSuccess: () => {
      toast.success("Test deleted from dictionary");
      setDeleteConfirmId(null);
      utils.labDictionary.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkDeleteMut = trpc.labDictionary.bulkDelete.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.deleted} test${r.deleted > 1 ? 's' : ''} deleted`);
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
      utils.labDictionary.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const generateAliasesForTestMut = trpc.labDictionary.generateAliasesForTest.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.added} aliases generated`);
      utils.labDictionary.getById.invalidate({ id: detailEntry?.id });
    },
    onError: (e) => toast.error('AI alias generation failed: ' + e.message),
  });

  const bulkGenerateAliasesMut = trpc.labDictionary.bulkGenerateAliases.useMutation();
  const getZeroAliasTestsMut = trpc.labDictionary.getTestsWithZeroAliases.useQuery(undefined, { enabled: false });

  // Batched alias generation — processes IDs in chunks of 5 to avoid timeout
  const BATCH_SIZE = 5;
  const runBatchedAliasGeneration = async (ids: number[]) => {
    if (ids.length === 0) {
      toast.info('No tests without aliases found');
      return;
    }
    setBulkGeneratingAliases(true);
    setBatchProgress({ done: 0, total: ids.length });
    let totalAdded = 0;
    let totalProcessed = 0;
    let errors = 0;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      try {
        const result = await bulkGenerateAliasesMut.mutateAsync({ ids: batch });
        totalAdded += result.totalAdded;
        totalProcessed += result.processed;
      } catch (e: any) {
        errors++;
        console.error('[bulkGenAliases] batch failed:', e?.message);
      }
      setBatchProgress({ done: Math.min(i + BATCH_SIZE, ids.length), total: ids.length });
    }
    setBulkGeneratingAliases(false);
    setBatchProgress(null);
    utils.labDictionary.list.invalidate();
    if (totalAdded > 0) {
      toast.success(`Generated ${totalAdded} aliases for ${totalProcessed} tests`);
    } else if (errors > 0) {
      toast.error(`Alias generation failed for ${errors} batch(es)`);
    } else {
      toast.info('No new aliases were generated (all tests may already have aliases)');
    }
  };

  const toggleMut = trpc.labDictionary.toggleActive.useMutation({
    onSuccess: () => {
      utils.labDictionary.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const seedMut = trpc.labDictionary.seedDictionary.useMutation({
    onSuccess: (r) => {
      if (r.success) toast.success(r.message);
      else toast.info(r.message);
      setSeedConfirm(false);
      utils.labDictionary.list.invalidate();
    },
    onError: (e) => toast.error("Seed failed: " + e.message),
  });

  const backfillMut = trpc.labDictionary.backfillChangelog.useMutation({
    onSuccess: (r) => {
      toast.success(`Backfill complete: ${r.entriesBackfilled} tests + ${r.aliasesBackfilled} aliases added to history`);
    },
    onError: (e) => toast.error("Backfill failed: " + e.message),
  });

  const addAliasMut = trpc.labDictionary.addAlias.useMutation({
    onSuccess: () => {
      utils.labDictionary.getById.invalidate({ id: detailEntry?.id });
      toast.success("Alias added");
    },
    onError: (e) => toast.error(e.message),
  });

  // Submit alias proposals through Pending Review instead of saving directly
  const submitPendingAliasMut = trpc.labDictionary.submitPending.useMutation({
    onSuccess: (res) => {
      if ((res as any).deduplicated) {
        toast.info("This alias is already in Pending Review.");
      } else {
        toast.success("Alias submitted for review — will appear in Pending Review for approval.");
      }
    },
    onError: (e) => toast.error(e.message || "Failed to submit alias for review"),
  });

  const handleAddAliasToPending = (alias: string, dictionaryEntry: { id: number; canonicalName: string }) => {
    if (!alias.trim()) return;
    submitPendingAliasMut.mutate({
      rawName: alias.trim(),
      source: "patient_entry",
      possibleMatchId: dictionaryEntry.id,
      possibleMatchName: dictionaryEntry.canonicalName,
      possibleMatchScore: 100,
    });
  };

  const deleteAliasMut = trpc.labDictionary.deleteAlias.useMutation({
    onSuccess: () => {
      utils.labDictionary.getById.invalidate({ id: detailEntry?.id });
      utils.labDictionary.getChangeHistory.invalidate({ dictionaryId: detailEntry?.id });
      toast.success("Alias removed");
    },
  });

  const undoChangeMut = trpc.labDictionary.undoChange.useMutation({
    onSuccess: () => {
      utils.labDictionary.getChangeHistory.invalidate({ dictionaryId: detailEntry?.id });
      utils.labDictionary.getById.invalidate({ id: detailEntry?.id });
      toast.success("Change undone");
    },
    onError: (e) => toast.error("Undo failed: " + e.message),
  });

  const handleCreate = () => {
    const { newAlias, ...rest } = form;
    createMut.mutate(rest);
  };

  const handleUpdate = () => {
    if (!editEntry) return;
    updateMut.mutate({
      id: editEntry.id,
      canonicalName: form.canonicalName,
      displayName: form.displayName,
      abbreviation: form.abbreviation || null,
      resultType: form.resultType,
      category: form.category || null,
      specimen: form.specimen || null,
      commonUnits: form.commonUnits || null,
      suggestedModule: form.suggestedModule,
      analyteGroup: form.analyteGroup || null,
      orderType: form.orderType || null,
      notes: form.notes || null,
    });
  };

  const openEdit = (entry: any) => {
    setEditEntry(entry);
    setForm({
      canonicalName: entry.canonicalName,
      displayName: entry.displayName,
      abbreviation: entry.abbreviation ?? "",
      resultType: entry.resultType,
      category: entry.category ?? "",
      specimen: entry.specimen ?? "",
      commonUnits: entry.commonUnits ?? "",
      canonicalUnit: entry.canonicalUnit ?? "",
      alternativeUnits: entry.alternativeUnits ?? "[]",
      conversionFactors: entry.conversionFactors ?? "{}",
      suggestedModule: entry.suggestedModule ?? "general_lab",
      analyteGroup: entry.analyteGroup ?? "",
      orderType: entry.orderType ?? "Single Result Test",
      notes: entry.notes ?? "",
      aliases: [],
      newAlias: "",
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-primary shrink-0" />
            Lab Test Dictionary
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.total ?? "..."} tests · Manage canonical names, result types, and aliases
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {/* Tools dropdown — admin/maintenance actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-1.5" />
                Tools
                <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => setSeedConfirm(true)}>
                <Database className="h-3.5 w-3.5 mr-2" />
                Seed Dictionary
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={backfillMut.isPending}
                onClick={() => backfillMut.mutate()}
              >
                {backfillMut.isPending
                  ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  : <History className="h-3.5 w-3.5 mr-2" />}
                Backfill History
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowBulkEnrich(true)} className="text-purple-700 focus:text-purple-700">
                <Sparkles className="h-3.5 w-3.5 mr-2" />
                AI Enrich All
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={bulkGeneratingAliases}
                className="text-purple-700 focus:text-purple-700"
                onClick={async () => {
                  const result = await utils.labDictionary.getTestsWithZeroAliases.fetch();
                  await runBatchedAliasGeneration(result.ids);
                }}
              >
                {bulkGeneratingAliases
                  ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  : <Sparkles className="h-3.5 w-3.5 mr-2" />}
                {bulkGeneratingAliases && batchProgress
                  ? `Generating… ${batchProgress.done}/${batchProgress.total}`
                  : 'Gen All Aliases'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" onClick={() => { setShowPdfImport(true); setPdfResults(null); }}>
            <FileUp className="h-4 w-4 mr-1.5" />
            Import from PDF
          </Button>
          <Button size="sm" onClick={() => { setForm(emptyForm); setShowCreate(true); }}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Test
          </Button>
        </div>
      </div>

      {/* Bulk Enrich Dialog */}
      <BulkEnrichDialog
        open={showBulkEnrich}
        onClose={() => setShowBulkEnrich(false)}
        onApplied={() => utils.labDictionary.list.invalidate()}
        totalTests={data?.total ?? 0}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setActiveTab("dictionary")}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "dictionary" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Dictionary
        </button>
        <button
          onClick={() => setActiveTab("pending")}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2",
            activeTab === "pending" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Pending Review
          {(pendingData?.rows?.length ?? 0) > 0 && (
            <span className="bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
              {pendingData?.rows?.length}
            </span>
          )}
        </button>
      </div>

      {/* Pending Tests Section */}
      {activeTab === "pending" && (
        <div className="space-y-4">
          {pendingLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !pendingData?.rows?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500" />
              <p className="font-medium">No pending tests</p>
              <p className="text-sm">All suggested tests have been reviewed.</p>
            </div>
          ) : (
            <>
              {/* ── MOBILE CARDS (hidden on md+) ─────────────────────────────── */}
              <div className="md:hidden space-y-3" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}>
                {pendingData.rows.map((pt: any) => (
                  <div key={pt.id} className="border rounded-xl bg-card p-4 space-y-3 shadow-sm">
                    {/* Test name + match status chip */}
                    <div>
                      <div className="font-semibold text-base text-foreground break-words">{pt.rawName}</div>
                      {pt.suggestedCanonicalName && pt.suggestedCanonicalName !== pt.rawName && (
                        <p className="text-xs text-muted-foreground mt-0.5">AI name: {pt.suggestedCanonicalName}</p>
                      )}
                      {/* Match status chip — informational only */}
                      <div className="mt-1.5">
                        {pt.possibleMatchName ? (
                          <span className={cn(
                            "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border",
                            pt.medicalVerdict === "same" ? "bg-green-50 text-green-700 border-green-200" :
                            pt.medicalVerdict === "different" ? "bg-red-50 text-red-600 border-red-200" :
                            pt.medicalVerdict === "related_separate" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            "bg-blue-50 text-blue-600 border-blue-200"
                          )}>
                            ● Suggested: {pt.possibleMatchName}
                            {pt.confidenceScore ? ` · ${pt.confidenceScore}%` : ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border bg-slate-50 text-slate-500 border-slate-200">
                            ○ No match selected
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Meta fields */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Type</span>
                        <div className="mt-0.5">
                          <Badge variant="secondary" className={cn("text-xs", RESULT_TYPE_COLORS[pt.suggestedResultType as ResultType] ?? "")}>
                            {pt.suggestedResultType ?? "—"}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Category</span>
                        <p className="mt-0.5 text-foreground">{pt.suggestedCategory ?? "—"}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Specimen</span>
                        <p className="mt-0.5 text-foreground">{pt.suggestedSpecimen ?? "—"}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Units</span>
                        <p className="mt-0.5 text-foreground">{pt.suggestedUnits ?? "—"}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Submitted by</span>
                        <p className="mt-0.5 text-foreground">{pt.submittedByName ?? "System"}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Confidence</span>
                        <p className={cn("mt-0.5 font-medium text-sm",
                          pt.aiConfidence === "high" ? "text-green-600" :
                          pt.aiConfidence === "medium" ? "text-yellow-600" : "text-red-500"
                        )}>{pt.aiConfidence ?? "—"}</p>
                      </div>
                    </div>

                    {/* Actions — single [Review] entry point + [...] overflow */}
                    <div className="pt-2 border-t flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {/* Primary: Review opens SmartMatchModal (draft-first) */}
                      <Button
                        className={cn(
                          "flex-1 justify-center",
                          pt.possibleMatchId
                            ? "bg-purple-600 hover:bg-purple-700 text-white"
                            : "bg-green-600 hover:bg-green-700 text-white"
                        )}
                        size="sm"
                        onClick={() => setSmartMatchRow({ ...pt, _openInSearching: !pt.possibleMatchId })}
                        disabled={reviewPendingMut.isPending}
                      >
                        <Sparkles className="h-4 w-4 mr-1.5" />
                        Review
                      </Button>
                      {/* Secondary: Add as New quick action */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 justify-center text-green-700 border-green-200 bg-green-50 hover:bg-green-100"
                        onClick={() => openApproveDialog(pt)}
                        disabled={reviewPendingMut.isPending}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        Add as New
                      </Button>
                      {/* Overflow: Reject */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => reviewPendingMut.mutate({ id: pt.id, action: "reject" })}
                            disabled={reviewPendingMut.isPending}
                          >
                            <X className="h-3.5 w-3.5 mr-2" />
                            Reject Pending Test
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── DESKTOP TABLE (hidden below md) ──────────────────────────── */}
              <div className="hidden md:block rounded-lg border overflow-hidden">
                <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                <table className="text-sm" style={{ minWidth: '860px', width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="border-b bg-muted">
                      <th className="text-left px-4 py-3 font-medium" style={{ minWidth: '200px' }}>Test Name</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ minWidth: '140px' }}>AI Suggested Type</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ minWidth: '110px' }}>Category</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ minWidth: '100px' }}>Specimen</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ minWidth: '80px' }}>Units</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ minWidth: '110px' }}>Submitted By</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ minWidth: '100px' }}>Confidence</th>
                      <th className="text-right px-4 py-3 font-medium" style={{ width: '60px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingData.rows.map((pt: any) => (
                      <tr key={pt.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3" style={{ maxWidth: '260px' }}>
                          {/* Test name — plain text, no duplicate clickable entry */}
                          <div className="font-medium whitespace-normal break-words">{pt.rawName}</div>
                          {pt.suggestedCanonicalName && pt.suggestedCanonicalName !== pt.rawName && (
                            <div className="text-xs text-muted-foreground mt-0.5">AI name: {pt.suggestedCanonicalName}</div>
                          )}
                          {/* Match status chip — status only, not a button */}
                          <div className="mt-1">
                            {pt.possibleMatchName ? (
                              <span className={cn(
                                "inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border",
                                pt.medicalVerdict === "same" ? "bg-green-50 text-green-700 border-green-200" :
                                pt.medicalVerdict === "different" ? "bg-red-50 text-red-600 border-red-200" :
                                pt.medicalVerdict === "related_separate" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                "bg-blue-50 text-blue-600 border-blue-200"
                              )}>
                                ● Suggested: {pt.possibleMatchName}
                                {pt.confidenceScore ? ` · ${pt.confidenceScore}%` : ""}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-slate-50 text-slate-500 border-slate-200">
                                ○ No match selected
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className={cn("text-xs", RESULT_TYPE_COLORS[pt.suggestedResultType as ResultType] ?? "")}>
                            {pt.suggestedResultType ?? "—"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{pt.suggestedCategory ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{pt.suggestedSpecimen ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{pt.suggestedUnits ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{pt.submittedByName ?? "System"}</td>
                        <td className="px-4 py-3">
                          <span className={cn("text-xs font-medium",
                            pt.aiConfidence === "high" ? "text-green-600" :
                            pt.aiConfidence === "medium" ? "text-yellow-600" : "text-red-500"
                          )}>
                            {pt.aiConfidence ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={reviewPendingMut.isPending}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem
                                onClick={() => setSmartMatchRow({ ...pt, _openInSearching: !pt.possibleMatchId })}
                              >
                                <Sparkles className="h-3.5 w-3.5 mr-2 text-purple-500" />
                                Review
                              </DropdownMenuItem>
                              {pt.possibleMatchId && (
                                <DropdownMenuItem
                                  onClick={() => reviewPendingMut.mutate({ id: pt.id, action: "merge", mergeIntoDictionaryId: pt.possibleMatchId })}
                                  disabled={reviewPendingMut.isPending}
                                >
                                  <Tag className="h-3.5 w-3.5 mr-2 text-blue-600" />
                                  Confirm as Alias
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => openApproveDialog(pt)}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-2 text-green-600" />
                                Add as New
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => { navigator.clipboard.writeText(pt.rawName); toast.success('Copied to clipboard'); }}
                              >
                                <Copy className="h-3.5 w-3.5 mr-2" />
                                Copy Test Name
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => reviewPendingMut.mutate({ id: pt.id, action: "reject" })}
                              >
                                <X className="h-3.5 w-3.5 mr-2" />
                                Reject
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>{/* end overflow-x-auto */}
              </div>
            </>
          )}
        </div>
      )}

      {/* Smart Match Modal */}
      <SmartMatchModal
        pendingRow={smartMatchRow}
        onClose={() => setSmartMatchRow(null)}
        onApproveAsNew={(pt) => { setSmartMatchRow(null); openApproveDialog(pt); }}
        onResolved={() => refetchPending()}
      />

      {/* Filters + Table (only shown in dictionary tab) */}
      {activeTab === "dictionary" && (<><div className="flex flex-col gap-2">
        {/* Row 1: Search + Sort + Advanced Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name, abbreviation, category..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          {/* Sort */}
          <Select value={sortBy} onValueChange={(v) => { setSortBy(v as "name" | "createdAt" | "updatedAt"); setPage(1); }}>
            <SelectTrigger className="w-[160px] h-10 shrink-0">
              <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 opacity-60" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name (A–Z)</SelectItem>
              <SelectItem value="createdAt">Date Added</SelectItem>
              <SelectItem value="updatedAt">Recently Updated</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
            title={sortDir === "asc" ? "Ascending" : "Descending"}
          >
            {sortDir === "asc" ? <span className="text-sm">↑</span> : <span className="text-sm">↓</span>}
          </Button>
        </div>
        {/* Row 2: Type + Status + Advanced Filters */}
        <div className="flex flex-wrap gap-2">
          <Select value={filterResultType} onValueChange={(v) => { setFilterResultType(v); setPage(1); }}>
            <SelectTrigger className="flex-1 min-w-[140px] h-9">
              <SelectValue placeholder="Result Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Result Types</SelectItem>
              {RESULT_TYPES.map((rt) => (
                <SelectItem key={rt} value={rt}>{rt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterActive} onValueChange={(v) => { setFilterActive(v); setPage(1); }}>
            <SelectTrigger className="flex-1 min-w-[120px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          {/* Advanced Filters popover — date range */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn("h-9 px-3 shrink-0", (dateFrom || dateTo) && "border-primary text-primary")}
              >
                <Calendar className="h-3.5 w-3.5 mr-1.5" />
                {dateFrom || dateTo ? "Date filtered" : "Date range"}
                {(dateFrom || dateTo) && (
                  <span
                    className="ml-1.5 text-xs bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); setDateFrom(""); setDateTo(""); setPage(1); }}
                  >×</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-4" align="end">
              <p className="text-sm font-medium mb-3">Filter by date added</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground">From</label>
                  <Input type="date" className="h-8 text-sm mt-1" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">To</label>
                  <Input type="date" className="h-8 text-sm mt-1" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
                </div>
                {(dateFrom || dateTo) && (
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}>
                    <X className="h-3 w-3 mr-1" /> Clear date filter
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium text-primary">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="text-purple-600 border-purple-300 hover:bg-purple-50"
              disabled={bulkGeneratingAliases}
              onClick={() => runBatchedAliasGeneration(Array.from(selectedIds))}
            >
              {bulkGeneratingAliases ? (
                batchProgress
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />{batchProgress.done}/{batchProgress.total}</>
                  : <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <><Sparkles className="h-3.5 w-3.5 mr-1.5" />Generate Aliases for Selected</>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-300 hover:bg-red-50"
              onClick={() => setBulkDeleteConfirm(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete Selected ({selectedIds.size})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Mobile Cards (hidden on md+) */}
      <div className="md:hidden space-y-2 pb-safe">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Loading...
          </div>
        ) : data?.rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No tests found.{" "}
            {data?.total === 0 && (
              <button className="text-primary underline" onClick={() => setSeedConfirm(true)}>
                Seed the dictionary
              </button>
            )}
          </div>
        ) : (
          data?.rows.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "border rounded-xl bg-card p-3.5 shadow-sm cursor-pointer active:bg-muted/40 transition-colors",
                !entry.isActive && "opacity-50",
                selectedIds.has(entry.id) && "ring-2 ring-primary/40 bg-primary/5"
              )}
              onClick={() => setDetailEntry(entry)}
            >
              <div className="flex items-start gap-2">
                <div
                  className="mt-0.5 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedIds(prev => {
                      const next = new Set(prev);
                      if (next.has(entry.id)) next.delete(entry.id);
                      else next.add(entry.id);
                      return next;
                    });
                  }}
                >
                  <Checkbox checked={selectedIds.has(entry.id)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground break-words leading-snug">{entry.displayName}</p>
                      {entry.abbreviation && (
                        <p className="text-xs text-muted-foreground mt-0.5">{entry.abbreviation}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => openEdit(entry)}>
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => setDetailEntry(entry)}>
                            <Eye className="h-3.5 w-3.5 mr-2" />
                            View Aliases
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setDetailEntry(entry); generateAliasesForTestMut.mutate({ id: entry.id }); }}>
                            <Sparkles className="h-3.5 w-3.5 mr-2" />
                            Generate Aliases
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => toggleMut.mutate({ id: entry.id, isActive: !entry.isActive })}>
                            <Power className={cn("h-3.5 w-3.5 mr-2", entry.isActive ? "text-amber-500" : "text-green-500")} />
                            {entry.isActive ? "Deactivate" : "Activate"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => { setDeleteConfirmId(entry.id); setDeleteConfirmName(entry.displayName); }}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <Badge variant="secondary" className={cn("text-xs", RESULT_TYPE_COLORS[entry.resultType as ResultType] ?? "bg-gray-100 text-gray-700")}>
                      {entry.resultType}
                    </Badge>
                    {entry.category && (
                      <span className="text-xs text-muted-foreground">{entry.category}</span>
                    )}
                    {entry.specimen && (
                      <span className="text-xs text-muted-foreground border-l pl-1.5">{entry.specimen}</span>
                    )}
                    {!entry.isActive && (
                      <Badge variant="outline" className="text-xs text-muted-foreground border-muted-foreground/30">Inactive</Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
        {/* Mobile pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 pb-safe">
            <span className="text-sm text-muted-foreground">Page {data.page} of {data.totalPages} · {data.total} total</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page === data.totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Table (hidden below md) */}
      <div className="hidden md:block rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="px-3 py-3 w-10">
                  <Checkbox
                    checked={data?.rows && data.rows.length > 0 && data.rows.every(r => selectedIds.has(r.id))}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedIds(new Set(data?.rows.map(r => r.id) ?? []));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                  />
                </th>
                <th className="text-left px-4 py-3 font-medium">Test Name</th>
                <th className="text-left px-4 py-3 font-medium">Result Type</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Specimen</th>
                <th className="text-left px-4 py-3 font-medium">Units</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Added On
                  </div>
                </th>
                <th className="text-left px-4 py-3 font-medium">
                  <div className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    Added By
                  </div>
                </th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Loading...
                  </td>
                </tr>
              ) : data?.rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-muted-foreground">
                    No tests found.{" "}
                    {data?.total === 0 && (
                      <button
                        className="text-primary underline"
                        onClick={() => setSeedConfirm(true)}
                      >
                        Seed the dictionary
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                data?.rows.map((entry) => (
                  <tr
                    key={entry.id}
                    className={cn(
                      "border-b hover:bg-muted/30 cursor-pointer transition-colors",
                      !entry.isActive && "opacity-50",
                      selectedIds.has(entry.id) && "bg-primary/5"
                    )}
                    onClick={() => setDetailEntry(entry)}
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(entry.id)}
                        onCheckedChange={(checked) => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (checked) next.add(entry.id);
                            else next.delete(entry.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{entry.displayName}</div>
                      {entry.abbreviation && (
                        <div className="text-xs text-muted-foreground">{entry.abbreviation}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-xs",
                          RESULT_TYPE_COLORS[entry.resultType as ResultType] ?? "bg-gray-100 text-gray-700"
                        )}
                      >
                        {entry.resultType}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{entry.category}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{entry.specimen}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{entry.commonUnits}</td>
                    <td className="px-4 py-3">
                      <Badge variant={entry.isActive ? "default" : "secondary"}>
                        {entry.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {entry.createdAt ? fmtDate(entry.createdAt) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {(entry as any).addedByName ? (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {(entry as any).addedByName}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/50">System</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ position: 'sticky', right: 0, zIndex: 1, backgroundColor: 'hsl(var(--background))', boxShadow: '-3px 0 6px -2px rgba(0,0,0,0.06)' }}>
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => openEdit(entry)}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => setDetailEntry(entry)}>
                              <Eye className="h-3.5 w-3.5 mr-2" />
                              View Aliases
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setDetailEntry(entry);
                                generateAliasesForTestMut.mutate({ id: entry.id });
                              }}
                            >
                              <Sparkles className="h-3.5 w-3.5 mr-2" />
                              Generate Aliases
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => toggleMut.mutate({ id: entry.id, isActive: !entry.isActive })}
                            >
                              <Power className={cn("h-3.5 w-3.5 mr-2", entry.isActive ? "text-amber-500" : "text-green-500")} />
                              {entry.isActive ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => { setDeleteConfirmId(entry.id); setDeleteConfirmName(entry.displayName); }}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
            <span className="text-sm text-muted-foreground">
              Page {data.page} of {data.totalPages} · {data.total} total
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page === data.totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div></> )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog
        open={showCreate || !!editEntry}
        onOpenChange={(open) => {
          if (!open) { setShowCreate(false); setEditEntry(null); }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editEntry ? "Edit Test Entry" : "Add New Test"}</DialogTitle>
          </DialogHeader>

          {/* AI Fill button — only shown when creating a new test */}
          {!editEntry && (
            <div className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <Sparkles className="h-4 w-4 text-purple-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-purple-900">AI Field Suggestions</p>
                <p className="text-xs text-purple-700">Type the test name above, then let AI fill all fields automatically. You can edit before saving.</p>
              </div>
              <Button
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
                onClick={handleAiFillCreate}
                disabled={aiFillingCreate || !form.canonicalName.trim()}
              >
                {aiFillingCreate ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Filling...</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5 mr-1.5" />✨ AI Fill Fields</>
                )}
              </Button>
            </div>
          )}

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Canonical Name *</Label>
                <Input
                  placeholder="e.g. TSH"
                  value={form.canonicalName}
                  onChange={(e) => setForm({ ...form, canonicalName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Abbreviation</Label>
                <Input
                  placeholder="e.g. TSH"
                  value={form.abbreviation}
                  onChange={(e) => setForm({ ...form, abbreviation: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Display Name *</Label>
              <Input
                placeholder="e.g. TSH (Thyroid Stimulating Hormone)"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Result Type *</Label>
                <Select
                  value={form.resultType}
                  onValueChange={(v) => setForm({ ...form, resultType: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESULT_TYPES.map((rt) => (
                      <SelectItem key={rt} value={rt}>{rt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Suggested Module</Label>
                <Select
                  value={form.suggestedModule}
                  onValueChange={(v) => setForm({ ...form, suggestedModule: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUGGESTED_MODULES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Analyte Group + Order Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Analyte Group</Label>
                <Input
                  placeholder="e.g. Glucose / OGTT, Thyroid, CBC"
                  value={form.analyteGroup}
                  onChange={(e) => setForm({ ...form, analyteGroup: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Order Type</Label>
                <Select
                  value={form.orderType}
                  onValueChange={(v) => setForm({ ...form, orderType: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Single Result Test">Single Result Test</SelectItem>
                    <SelectItem value="Timed Component">Timed Component</SelectItem>
                    <SelectItem value="Protocol Name">Protocol Name</SelectItem>
                    <SelectItem value="Genetic / Molecular">Genetic / Molecular</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input
                  placeholder="e.g. Thyroid, Hematology"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Specimen</Label>
                <Input
                  placeholder="e.g. Blood, Urine"
                  value={form.specimen}
                  onChange={(e) => setForm({ ...form, specimen: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Common Units</Label>
              <Input
                placeholder="e.g. mIU/L, ng/mL"
                value={form.commonUnits}
                onChange={(e) => setForm({ ...form, commonUnits: e.target.value })}
              />
            </div>
            {/* Unit Standardization */}
            <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-purple-700 uppercase tracking-wide">
                <span>⚖️</span> Unit Standardization (Turkish Lab Standards)
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Canonical Unit <span className="text-muted-foreground font-normal">(standard)</span></Label>
                  <Input
                    placeholder="e.g. mg/dL"
                    value={form.canonicalUnit}
                    onChange={(e) => setForm({ ...form, canonicalUnit: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Alternative Units <span className="text-muted-foreground font-normal">(JSON array)</span></Label>
                  <Input
                    placeholder='["mmol/L","mEq/L"]'
                    value={form.alternativeUnits}
                    onChange={(e) => setForm({ ...form, alternativeUnits: e.target.value })}
                    className="text-sm font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Conversion Factors <span className="text-muted-foreground font-normal">(JSON: alt_unit → multiply to get canonical)</span></Label>
                <Input
                  placeholder='{"mmol/L":38.67}'
                  value={form.conversionFactors}
                  onChange={(e) => setForm({ ...form, conversionFactors: e.target.value })}
                  className="text-sm font-mono"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                placeholder="Optional notes..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>

            {/* Aliases (create only) */}
            {!editEntry && (
              <div className="space-y-2">
                <Label>Aliases / Synonyms</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add alias..."
                    value={form.newAlias}
                    onChange={(e) => setForm({ ...form, newAlias: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && form.newAlias.trim()) {
                        e.preventDefault();
                        setForm({
                          ...form,
                          aliases: [...form.aliases, form.newAlias.trim()],
                          newAlias: "",
                        });
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (form.newAlias.trim()) {
                        setForm({
                          ...form,
                          aliases: [...form.aliases, form.newAlias.trim()],
                          newAlias: "",
                        });
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {form.aliases.map((alias, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {alias}
                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            aliases: form.aliases.filter((_, j) => j !== i),
                          })
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditEntry(null); }}>
              Cancel
            </Button>
            <Button
              onClick={editEntry ? handleUpdate : handleCreate}
              disabled={createMut.isPending || updateMut.isPending || !form.canonicalName || !form.displayName}
            >
              {(createMut.isPending || updateMut.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editEntry ? "Save Changes" : "Add Test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Approve as New Dialog ── */}
      <Dialog open={!!approveDialogRow} onOpenChange={(o) => { if (!o) setApproveDialogRow(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Approve as New Dictionary Entry
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Adding: <span className="font-medium text-foreground">{approveDialogRow?.rawName}</span>
            </p>
          </DialogHeader>

          {/* AI Fill button */}
          <div className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <Sparkles className="h-4 w-4 text-purple-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-purple-900">AI Field Suggestions</p>
              <p className="text-xs text-purple-700">Let AI fill all fields automatically based on the test name. You can edit before saving.</p>
            </div>
            <Button
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
              onClick={handleAiFillApprove}
              disabled={aiFillingApprove}
            >
              {aiFillingApprove ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Filling...</>
              ) : (
                <><Sparkles className="h-3.5 w-3.5 mr-1.5" />✨ AI Fill Fields</>
              )}
            </Button>
          </div>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Canonical Name *</Label>
                <Input
                  value={approveForm.canonicalName}
                  onChange={(e) => setApproveForm({ ...approveForm, canonicalName: e.target.value })}
                  placeholder="e.g. TSH"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Abbreviation</Label>
                <Input
                  value={approveForm.abbreviation}
                  onChange={(e) => setApproveForm({ ...approveForm, abbreviation: e.target.value })}
                  placeholder="e.g. TSH"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Display Name *</Label>
              <Input
                value={approveForm.displayName}
                onChange={(e) => setApproveForm({ ...approveForm, displayName: e.target.value })}
                placeholder="e.g. TSH (Thyroid Stimulating Hormone)"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Result Type *</Label>
                <Select
                  value={approveForm.resultType}
                  onValueChange={(v) => setApproveForm({ ...approveForm, resultType: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RESULT_TYPES.map((rt) => (
                      <SelectItem key={rt} value={rt}>{rt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Suggested Module</Label>
                <Select
                  value={approveForm.suggestedModule}
                  onValueChange={(v) => setApproveForm({ ...approveForm, suggestedModule: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUGGESTED_MODULES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
               </div>
            </div>
            {/* Analyte Group + Order Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Analyte Group</Label>
                <Input
                  placeholder="e.g. Glucose / OGTT, Thyroid, CBC"
                  value={approveForm.analyteGroup}
                  onChange={(e) => setApproveForm({ ...approveForm, analyteGroup: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Order Type</Label>
                <Select
                  value={approveForm.orderType}
                  onValueChange={(v) => setApproveForm({ ...approveForm, orderType: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Single Result Test">Single Result Test</SelectItem>
                    <SelectItem value="Timed Component">Timed Component</SelectItem>
                    <SelectItem value="Protocol Name">Protocol Name</SelectItem>
                    <SelectItem value="Genetic / Molecular">Genetic / Molecular</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input
                  value={approveForm.category}
                  onChange={(e) => setApproveForm({ ...approveForm, category: e.target.value })}
                  placeholder="e.g. Thyroid, Hematology"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Specimen</Label>
                <Input
                  value={approveForm.specimen}
                  onChange={(e) => setApproveForm({ ...approveForm, specimen: e.target.value })}
                  placeholder="e.g. Blood, Urine"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Common Units</Label>
              <Input
                value={approveForm.commonUnits}
                onChange={(e) => setApproveForm({ ...approveForm, commonUnits: e.target.value })}
                placeholder="e.g. mIU/L, ng/mL"
              />
            </div>
            {/* Unit Standardization */}
            <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-purple-700 uppercase tracking-wide">
                <span>⚖️</span> Unit Standardization (Turkish Lab Standards)
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Canonical Unit <span className="text-muted-foreground font-normal">(standard)</span></Label>
                  <Input
                    placeholder="e.g. mg/dL"
                    value={approveForm.canonicalUnit}
                    onChange={(e) => setApproveForm({ ...approveForm, canonicalUnit: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Alternative Units <span className="text-muted-foreground font-normal">(JSON array)</span></Label>
                  <Input
                    placeholder='["mmol/L","mEq/L"]'
                    value={approveForm.alternativeUnits}
                    onChange={(e) => setApproveForm({ ...approveForm, alternativeUnits: e.target.value })}
                    className="text-sm font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Conversion Factors <span className="text-muted-foreground font-normal">(JSON: alt_unit → multiply to get canonical)</span></Label>
                <Input
                  placeholder='{"mmol/L":38.67}'
                  value={approveForm.conversionFactors}
                  onChange={(e) => setApproveForm({ ...approveForm, conversionFactors: e.target.value })}
                  className="text-sm font-mono"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={approveForm.notes}
                onChange={(e) => setApproveForm({ ...approveForm, notes: e.target.value })}
                placeholder="Optional clinical notes..."
                rows={2}
              />
            </div>
            {/* Aliases */}
            <div className="space-y-2">
              <Label>Aliases / Synonyms</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add alias..."
                  value={approveForm.newAlias}
                  onChange={(e) => setApproveForm({ ...approveForm, newAlias: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && approveForm.newAlias.trim()) {
                      e.preventDefault();
                      setApproveForm({ ...approveForm, aliases: [...approveForm.aliases, approveForm.newAlias.trim()], newAlias: "" });
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (approveForm.newAlias.trim()) {
                      setApproveForm({ ...approveForm, aliases: [...approveForm.aliases, approveForm.newAlias.trim()], newAlias: "" });
                    }
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {approveForm.aliases.map((alias, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {alias}
                    <button
                      type="button"
                      onClick={() => setApproveForm({ ...approveForm, aliases: approveForm.aliases.filter((_, j) => j !== i) })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogRow(null)}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleApproveSubmit}
              disabled={reviewPendingMut.isPending || !approveForm.canonicalName || !approveForm.displayName}
            >
              {reviewPendingMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Approve & Add to Dictionary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail / Alias Management Dialog ── */}
      <Dialog open={!!detailEntry} onOpenChange={(o) => !o && setDetailEntry(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              {detailEntry?.displayName}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Result Type:</span>{" "}
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-xs ml-1",
                      RESULT_TYPE_COLORS[detail.resultType as ResultType]
                    )}
                  >
                    {detail.resultType}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Category:</span>{" "}
                  <span>{detail.category}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Specimen:</span>{" "}
                  <span>{detail.specimen}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Units:</span>{" "}
                  <span>{detail.commonUnits}</span>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">
                    Aliases ({detail.aliases.length})
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto h-7 px-2 text-xs text-purple-600 border-purple-300 hover:bg-purple-50"
                    disabled={generatingAliasesForId === detail.id}
                    onClick={async () => {
                      setGeneratingAliasesForId(detail.id);
                      try {
                        await generateAliasesForTestMut.mutateAsync({ id: detail.id });
                      } finally {
                        setGeneratingAliasesForId(null);
                      }
                    }}
                  >
                    {generatingAliasesForId === detail.id ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3 mr-1" />
                    )}
                    AI Generate Aliases
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {detail.aliases.map((a) => (
                    <Badge key={a.id} variant="outline" className="gap-1 text-xs">
                      {a.alias}
                      {a.scope === "patient" && (
                        <span className="text-muted-foreground">(patient)</span>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteAliasMut.mutate({ aliasId: a.id })}
                        className="ml-0.5 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                {/* Add alias */}
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Add alias..."
                    id="new-alias-input"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const v = (e.target as HTMLInputElement).value.trim();
                        if (v && detail) {
                          handleAddAliasToPending(v, { id: detail.id, canonicalName: detail.canonicalName });
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const input = document.getElementById("new-alias-input") as HTMLInputElement;
                      const v = input?.value.trim();
                      if (v && detail) {
                        handleAddAliasToPending(v, { id: detail.id, canonicalName: detail.canonicalName });
                        input.value = "";
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Change History ── */}
          {detail && <ChangeHistorySection dictionaryId={detail.id} undoChangeMut={undoChangeMut} />}
        </DialogContent>
      </Dialog>

      {/* ── PDF Import Dialog ── */}
      <Dialog open={showPdfImport} onOpenChange={(o) => { if (!o && !pdfImporting && !addingBulk) { setShowPdfImport(false); setPdfResults(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5 text-primary" />
              Import Tests from PDF
            </DialogTitle>
          </DialogHeader>

          {!pdfResults && !pdfImporting && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload a lab report PDF. The AI will extract all test names, compare them with the dictionary, and suggest details for new tests.
              </p>
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => pdfFileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file && file.type === "application/pdf") handlePdfImport(file);
                  else toast.error("Please upload a PDF file");
                }}
              >
                <FileUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">Drop a PDF here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">Supports any lab report PDF</p>
                <input
                  ref={pdfFileRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePdfImport(file);
                  }}
                />
              </div>
            </div>
          )}

          {pdfImporting && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="font-medium">Analyzing PDF...</p>
              <p className="text-sm text-muted-foreground">Extracting test names and comparing with dictionary</p>
            </div>
          )}

          {pdfResults && !pdfImporting && (
            <div className="space-y-5">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-3 flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
                  <div>
                    <div className="text-2xl font-bold text-green-700">{pdfResults.existing.length}</div>
                    <div className="text-xs text-green-600">Already in dictionary</div>
                  </div>
                </div>
                <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 p-3 flex items-center gap-3">
                  <Sparkles className="h-8 w-8 text-blue-600 shrink-0" />
                  <div>
                    <div className="text-2xl font-bold text-blue-700">{pdfResults.newTests.length}</div>
                    <div className="text-xs text-blue-600">New tests found</div>
                  </div>
                </div>
              </div>

              {/* New tests */}
              {pdfResults.newTests.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-blue-500" />
                      New Tests — Select to Add
                    </h3>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedNewTests(new Set(pdfResults.newTests.map(t => t.originalName)))}>
                        Select All
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedNewTests(new Set())}>
                        Deselect All
                      </Button>
                    </div>
                  </div>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground px-1">
                    <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400"></span>OCR corrected</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500"></span>Review warning</span>
                  </div>
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full text-xs min-w-[900px]">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="px-2 py-2 w-8"></th>
                          <th className="text-left px-2 py-2">Original (OCR)</th>
                          <th className="text-left px-2 py-2">Final Test Name <span className="text-muted-foreground font-normal">(editable)</span></th>
                          <th className="text-left px-2 py-2">Type</th>
                          <th className="text-left px-2 py-2">Category</th>
                          <th className="text-left px-2 py-2">Specimen</th>
                          <th className="text-left px-2 py-2">Units</th>
                          <th className="text-left px-2 py-2">Confidence</th>
                          <th className="text-left px-2 py-2">Suggested Aliases</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pdfResults.newTests.map((t) => {
                          const edits = pdfEdits[t.originalName] ?? {};
                          const finalName = edits.editedName ?? t.name;
                          const finalType = edits.suggestedType ?? t.suggestedType;
                          const finalCategory = edits.category ?? t.category;
                          const finalSpecimen = edits.specimen ?? t.specimen;
                          const finalUnits = edits.units ?? t.units;
                          const isSelected = selectedNewTests.has(t.originalName);
                          return (
                            <tr key={t.originalName} className={cn("border-b last:border-0 align-top", isSelected ? "bg-blue-50/50 dark:bg-blue-950/10" : "")}>
                              <td className="px-2 py-2 pt-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const next = new Set(Array.from(selectedNewTests));
                                    if (e.target.checked) next.add(t.originalName); else next.delete(t.originalName);
                                    setSelectedNewTests(next);
                                  }}
                                />
                              </td>
                              {/* Original OCR name */}
                              <td className="px-2 py-2 pt-3">
                                <div className="flex flex-col gap-0.5">
                                  <span className={cn("font-mono", t.wasCorrected ? "line-through text-muted-foreground" : "font-medium")}>{t.originalName}</span>
                                  {t.wasCorrected && (
                                    <span className="flex items-center gap-1 text-amber-600">
                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                      {t.correctionNote || "Auto-corrected"}
                                    </span>
                                  )}
                                  {t.reviewWarning && (
                                    <span className="flex items-center gap-1 text-orange-600 mt-0.5">
                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                                      {t.reviewWarning}
                                    </span>
                                  )}
                                </div>
                              </td>
                              {/* Editable final name */}
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={finalName}
                                  onChange={(e) => setPdfEdits(prev => ({ ...prev, [t.originalName]: { ...prev[t.originalName], editedName: e.target.value } }))}
                                  className="w-full min-w-[130px] border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                              </td>
                              {/* Type */}
                              <td className="px-2 py-1.5">
                                <select
                                  value={finalType}
                                  onChange={(e) => setPdfEdits(prev => ({ ...prev, [t.originalName]: { ...prev[t.originalName], suggestedType: e.target.value } }))}
                                  className="border rounded px-1.5 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary min-w-[100px]"
                                >
                                  {["Quantitative","Qualitative","Molecular/PCR","Genetic","Microbiology Culture","Microscopy/Parasitology","Panel/Profile","Pathology/Biopsy","Semen Analysis","Semen DNA","Therapeutic Drug Monitoring","Descriptive/Report"].map(rt => (
                                    <option key={rt} value={rt}>{rt}</option>
                                  ))}
                                </select>
                              </td>
                              {/* Category */}
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={finalCategory}
                                  onChange={(e) => setPdfEdits(prev => ({ ...prev, [t.originalName]: { ...prev[t.originalName], category: e.target.value } }))}
                                  className="w-full min-w-[90px] border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                              </td>
                              {/* Specimen */}
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={finalSpecimen}
                                  onChange={(e) => setPdfEdits(prev => ({ ...prev, [t.originalName]: { ...prev[t.originalName], specimen: e.target.value } }))}
                                  className="w-full min-w-[70px] border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                              </td>
                              {/* Units */}
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={finalUnits}
                                  onChange={(e) => setPdfEdits(prev => ({ ...prev, [t.originalName]: { ...prev[t.originalName], units: e.target.value } }))}
                                  className="w-full min-w-[80px] border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                              </td>
                              {/* Confidence */}
                              <td className="px-2 py-2 pt-3">
                                <span className={cn("text-xs font-medium", t.confidence === "high" ? "text-green-600" : t.confidence === "medium" ? "text-yellow-600" : "text-red-500")}>
                                  {t.confidence}
                                </span>
                              </td>
                              {/* Suggested Aliases */}
                              <td className="px-2 py-2 pt-3 max-w-[180px]">
                                <div className="flex flex-wrap gap-1">
                                  {(t.suggestedAliases ?? []).slice(0, 4).map((alias, ai) => (
                                    <span key={ai} className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]">{alias}</span>
                                  ))}
                                  {(t.suggestedAliases ?? []).length === 0 && <span className="text-muted-foreground">—</span>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Existing tests (collapsed) */}
              {pdfResults.existing.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    {pdfResults.existing.length} tests already in dictionary (click to view)
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                    {pdfResults.existing.map((e) => (
                      <Badge key={e.matchedId} variant="outline" className="text-xs text-green-700">
                        {e.name}
                      </Badge>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPdfImport(false); setPdfResults(null); }} disabled={pdfImporting || addingBulk}>
              Cancel
            </Button>
            {pdfResults && (
              <Button
                onClick={handleAddSelectedTests}
                disabled={addingBulk || selectedNewTests.size === 0}
              >
                {addingBulk ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Add {selectedNewTests.size} Selected Test{selectedNewTests.size !== 1 ? 's' : ''}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Test from Dictionary?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteConfirmName}</strong> from the lab dictionary?
              This will also remove all its aliases. Existing patient results will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteConfirmId && deleteMut.mutate({ id: deleteConfirmId })}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk Delete Confirm ── */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={(open) => { if (!open) setBulkDeleteConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Tests from Dictionary?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{selectedIds.size} selected tests</strong> from the lab dictionary?
              This will also remove all their aliases. Existing patient results will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => bulkDeleteMut.mutate({ ids: Array.from(selectedIds) })}
              disabled={bulkDeleteMut.isPending}
            >
              {bulkDeleteMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete {selectedIds.size} Tests
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Seed Confirm ── */}
      <AlertDialog open={seedConfirm} onOpenChange={setSeedConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Seed Lab Dictionary?</AlertDialogTitle>
            <AlertDialogDescription>
              This will import all 439 pre-classified tests with their result types, categories, and
              aliases. Existing entries will be updated, not duplicated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => seedMut.mutate({ force: false })}
              disabled={seedMut.isPending}
            >
              {seedMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Seed Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
