/**
 * SmartMatchModal
 * Opens when admin clicks the "Possible match" link in Pending Review.
 *
 * DRAFT-FIRST design: nothing is written to the database until the user
 * clicks a final confirmation button.  Cancel / X always discards all
 * local draft state and returns the pending test to its previous state.
 *
 * Draft state machine:
 *   idle            – showing AI-suggested match (no local change yet)
 *   searching       – user clicked "Choose Different Match"; search open
 *   selected_alias  – user picked a canonical test from search; ready to confirm
 *   approve_new     – user decided no match exists; ready to approve as new
 *   rejected        – user wants to outright delete the pending test
 *
 * Final DB-writing actions (only these call mutations):
 *   • Confirm as Alias        → confirmAliasMut
 *   • Approve as New Test     → onApproveAsNew (parent handles dialog)
 *   • Reject Pending Test     → reviewPendingMut (action: "reject")
 *
 * Search behaviour (v2):
 *   • Search input is auto-prefilled with the pending test's rawName on open.
 *   • Results appear immediately — no need to type first.
 *   • An X button inside the field clears the query.
 *   • Manual editing (backspace, word delete, etc.) updates results normally.
 *   • Search never writes anything to the DB.
 *   • When there IS an AI suggestion, the original suggestion panel stays
 *     visible above the search so the user can compare.
 */
import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Search,
  ArrowRight,
  ArrowLeft,
  X,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type Verdict = "same" | "different" | "related_separate" | "unclear";
type DraftState =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "selected_alias"; dictionaryId: number; canonicalName: string }
  | { kind: "approve_new" }
  | { kind: "rejected" };

interface PendingRow {
  id: number;
  rawName: string;
  possibleMatchId?: number | null;
  possibleMatchName?: string | null;
  medicalVerdict?: Verdict | null;
  confidenceScore?: number | null;
  medicalReason?: string | null;
  suggestedAction?: string | null;
  /** Internal flag: when true, modal opens directly in searching state */
  _openInSearching?: boolean;
}

interface SmartMatchModalProps {
  pendingRow: PendingRow | null;
  onClose: () => void;
  onApproveAsNew: (pt: PendingRow) => void; // opens existing Approve-as-New dialog
  onResolved: () => void; // refetch pending list
}

// ── Verdict helpers ────────────────────────────────────────────────────────────
const VERDICT_CONFIG: Record<Verdict, {
  label: string;
  icon: React.FC<{ className?: string }>;
  colorClass: string;
  badgeClass: string;
}> = {
  same: {
    label: "Same Test",
    icon: ({ className }) => <CheckCircle2 className={className} />,
    colorClass: "text-green-700",
    badgeClass: "bg-green-50 text-green-700 border-green-200",
  },
  different: {
    label: "Different Test",
    icon: ({ className }) => <XCircle className={className} />,
    colorClass: "text-red-600",
    badgeClass: "bg-red-50 text-red-600 border-red-200",
  },
  related_separate: {
    label: "Related but Separate",
    icon: ({ className }) => <AlertTriangle className={className} />,
    colorClass: "text-amber-600",
    badgeClass: "bg-amber-50 text-amber-600 border-amber-200",
  },
  unclear: {
    label: "Needs Human Review",
    icon: ({ className }) => <HelpCircle className={className} />,
    colorClass: "text-blue-600",
    badgeClass: "bg-blue-50 text-blue-600 border-blue-200",
  },
};

function VerdictBadge({ verdict, confidence }: { verdict: Verdict; confidence: number }) {
  const cfg = VERDICT_CONFIG[verdict];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-sm font-semibold", cfg.badgeClass)}>
      <Icon className="h-4 w-4" />
      {cfg.label}
      <span className="ml-1 opacity-80 font-normal">{confidence}%</span>
    </span>
  );
}

// ── Full dict record section ───────────────────────────────────────────────────
function DictRecordSection({ dictionaryId }: { dictionaryId: number }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = trpc.labDictionary.getFullDictEntry.useQuery({ dictionaryId });

  if (isLoading) return (
    <div className="flex items-center gap-2 py-2 text-muted-foreground text-sm">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading dictionary record…
    </div>
  );
  if (!data) return <p className="text-sm text-muted-foreground">Dictionary record not found.</p>;

  const { entry, aliases, changelog } = data;
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-sm font-medium"
        onClick={() => setExpanded(e => !e)}
      >
        <span>Full Dictionary Record — <span className="font-semibold">{entry.canonicalName}</span></span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {expanded && (
        <div className="px-4 py-3 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <Field label="Canonical Name" value={entry.canonicalName} />
            <Field label="Display Name" value={entry.displayName} />
            <Field label="Abbreviation" value={entry.abbreviation} />
            <Field label="Result Type" value={entry.resultType} />
            <Field label="Category" value={entry.category} />
            <Field label="Specimen" value={entry.specimen} />
            <Field label="Common Units" value={entry.commonUnits} />
            <Field label="Canonical Unit" value={entry.canonicalUnit} />
            <Field label="Suggested Module" value={entry.suggestedModule} />
          </div>
          {entry.alternativeUnits && entry.alternativeUnits !== "[]" && (
            <Field label="Alternative Units" value={entry.alternativeUnits} />
          )}
          {entry.conversionFactors && entry.conversionFactors !== "{}" && (
            <Field label="Conversion Factors" value={entry.conversionFactors} />
          )}
          {entry.notes && (
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Notes</span>
              <p className="mt-0.5 text-foreground">{entry.notes}</p>
            </div>
          )}
          {aliases.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Aliases / Synonyms ({aliases.length})</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {aliases.map(a => (
                  <span key={a.id} className="px-2 py-0.5 bg-muted rounded-full text-xs border border-border">{a.alias}</span>
                ))}
              </div>
            </div>
          )}
          {changelog.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Recent Changes</span>
              <div className="mt-1 space-y-1">
                {changelog.slice(0, 5).map(c => (
                  <div key={c.id} className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="capitalize">{c.changeType.replace(/_/g, " ")}</span>
                    {c.newValue && <span className="text-foreground">→ {c.newValue}</span>}
                    <span>· {c.performedByName ?? "System"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</span>
      <p className="mt-0.5 text-foreground">{value}</p>
    </div>
  );
}

// ── Dictionary search input with auto-prefill, X clear, immediate results ─────
/**
 * Props:
 *   initialQuery  – prefilled text (usually the pending test's rawName)
 *   onSelect      – called when user clicks a result row; does NOT write to DB
 *   selectedId    – if set, hides the dropdown (a result is already chosen)
 */
function DictionarySearchInput({
  initialQuery,
  onSelect,
  selectedId,
}: {
  initialQuery: string;
  onSelect: (entry: { id: number; name: string }) => void;
  selectedId?: number | null;
}) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  // When initialQuery changes (e.g. modal reopens with a different row) reset
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  // Focus the input on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  // Fire the query for any non-empty string (≥ 1 char)
  const trimmed = query.trim();
  const { data: results, isFetching } = trpc.labDictionary.searchDictForMatch.useQuery(
    { query: trimmed },
    { enabled: trimmed.length >= 1 }
  );

  const handleSelect = (entry: { id: number; name: string }) => {
    setQuery(entry.name);
    onSelect(entry);
  };

  const handleClear = () => {
    setQuery("");
    onSelect({ id: -1, name: "" }); // signal "cleared" so parent can go back to searching
    inputRef.current?.focus();
  };

  // Show dropdown when: query is non-empty, results exist, and no item is selected yet
  const showDropdown = trimmed.length >= 1 && !!results && results.length > 0 && !selectedId;

  return (
    <div className="space-y-2">
      {/* Input row */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          className="pl-9 pr-8 h-9 text-sm"
          placeholder="Search dictionary…"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            // If user edits after a selection, clear the selection so dropdown reappears
            if (selectedId) onSelect({ id: -1, name: "" });
          }}
        />
        {/* X clear button — only shown when there is text */}
        {query.length > 0 && (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            onClick={handleClear}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {/* Subtle loading spinner inside field */}
        {isFetching && !query.length && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Results dropdown */}
      {showDropdown && (
        <div className="border rounded-md bg-popover shadow-sm max-h-48 overflow-y-auto">
          {results!.map(r => (
            <button
              key={r.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
              onClick={() => handleSelect({ id: r.id, name: r.displayName || r.canonicalName })}
            >
              <span className="font-medium">{r.displayName || r.canonicalName}</span>
              {r.abbreviation && <span className="text-muted-foreground ml-1.5">({r.abbreviation})</span>}
              {r.category && <span className="text-muted-foreground ml-1.5 text-xs">· {r.category}</span>}
            </button>
          ))}
        </div>
      )}

      {/* No results hint */}
      {trimmed.length >= 1 && !isFetching && results && results.length === 0 && (
        <p className="text-xs text-muted-foreground px-1">No dictionary entries found for "{trimmed}".</p>
      )}
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────
export function SmartMatchModal({ pendingRow, onClose, onApproveAsNew, onResolved }: SmartMatchModalProps) {
  const utils = trpc.useUtils();
  const open = !!pendingRow;

  // ── Draft state (local only — nothing committed until final action) ──────────
  const [draft, setDraft] = useState<DraftState>({ kind: "idle" });

  // ── Verification state ───────────────────────────────────────────────────────
  const [verifying, setVerifying] = useState(false);
  // Separate state for manually-selected match verification (not cached to DB)
  const [manualVerifying, setManualVerifying] = useState(false);
  const [manualVerification, setManualVerification] = useState<{
    verdict: Verdict;
    confidence: number;
    reason: string;
    suggestedAction: string;
  } | null>(null);
  const [verification, setVerification] = useState<{
    verdict: Verdict;
    confidence: number;
    reason: string;
    suggestedAction: string;
  } | null>(
    pendingRow?.medicalVerdict
      ? {
          verdict: pendingRow.medicalVerdict,
          confidence: pendingRow.confidenceScore ?? 0,
          reason: pendingRow.medicalReason ?? "",
          suggestedAction: pendingRow.suggestedAction ?? "",
        }
      : null
  );

  // Reset all local state when modal opens with a new row
  const [lastPendingId, setLastPendingId] = useState<number | null>(null);
  if (pendingRow && pendingRow.id !== lastPendingId) {
    setLastPendingId(pendingRow.id);
    // If the row has no AI suggestion or was explicitly opened in searching mode, skip idle
    setDraft(pendingRow._openInSearching ? { kind: "searching" } : { kind: "idle" });
    setManualVerification(null);
    setVerification(
      pendingRow.medicalVerdict
        ? {
            verdict: pendingRow.medicalVerdict,
            confidence: pendingRow.confidenceScore ?? 0,
            reason: pendingRow.medicalReason ?? "",
            suggestedAction: pendingRow.suggestedAction ?? "",
          }
        : null
    );
  }

  // ── Mutations (only called on final confirmation) ────────────────────────────
  const verifyMut = trpc.labDictionary.verifyMedicalMatch.useMutation({
    onError: (e) => toast.error("Verification failed: " + e.message),
  });

  const verifyManualMut = trpc.labDictionary.verifyManualMatch.useMutation({
    onError: (e) => toast.error("Verification failed: " + e.message),
  });

  const confirmAliasMut = trpc.labDictionary.confirmAsAlias.useMutation({
    onSuccess: () => {
      toast.success(`"${pendingRow?.rawName}" confirmed as alias`);
      utils.labDictionary.listPending.invalidate();
      onResolved();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const reviewPendingMut = trpc.labDictionary.reviewPending.useMutation({
    onSuccess: () => {
      toast.success("Pending test rejected");
      utils.labDictionary.listPending.invalidate();
      onResolved();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleVerify = async () => {
    if (!pendingRow) return;
    setVerifying(true);
    try {
      const result = await verifyMut.mutateAsync({ pendingId: pendingRow.id });
      setVerification(result as any);
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyManual = async () => {
    if (!pendingRow || draft.kind !== "selected_alias") return;
    setManualVerifying(true);
    try {
      const result = await verifyManualMut.mutateAsync({ pendingId: pendingRow.id, dictionaryId: draft.dictionaryId });
      setManualVerification(result as any);
    } finally {
      setManualVerifying(false);
    }
  };

  // Cancel: discard all draft state and close
  const handleCancel = () => {
    setDraft({ kind: "idle" });
    onClose();
  };

  if (!pendingRow) return null;

  const hasPossibleMatch = !!(pendingRow.possibleMatchId && pendingRow.possibleMatchName);

  // ── Handle selection from DictionarySearchInput ───────────────────────────
  // id === -1 means the user cleared the input or edited it after a selection
  const handleSearchSelect = (entry: { id: number; name: string }) => {
    if (entry.id === -1) {
      // User cleared or edited — go back to searching (no selection)
      setDraft({ kind: "searching" });
      setManualVerification(null);
    } else {
      setDraft({ kind: "selected_alias", dictionaryId: entry.id, canonicalName: entry.name });
      setManualVerification(null);
    }
  };

  // ── Final action handlers ─────────────────────────────────────────────────
  const handleConfirmAsAlias = () => {
    if (draft.kind === "selected_alias") {
      // User searched and selected a different canonical test
      confirmAliasMut.mutate({ pendingId: pendingRow.id, dictionaryId: draft.dictionaryId });
    } else if (hasPossibleMatch && pendingRow.possibleMatchId) {
      // User confirmed the original AI suggestion
      confirmAliasMut.mutate({ pendingId: pendingRow.id, dictionaryId: pendingRow.possibleMatchId });
    }
  };

  const handleApproveAsNew = () => {
    onApproveAsNew(pendingRow);
    onClose();
  };

  const handleRejectPending = () => {
    reviewPendingMut.mutate({ id: pendingRow.id, action: "reject" });
  };

  const isSaving = confirmAliasMut.isPending || reviewPendingMut.isPending;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Smart Match Review
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">

          {/* ── CASE A: No AI suggestion — clean search-first layout ── */}
          {!hasPossibleMatch && draft.kind !== "selected_alias" ? (
            <div className="space-y-3">
              {/* Pending test card */}
              <div className="bg-muted/40 border rounded-lg px-4 py-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Pending Test</p>
                <p className="font-semibold text-foreground text-base">{pendingRow.rawName}</p>
                <p className="text-xs text-muted-foreground mt-1">No dictionary match was found automatically. Search below or approve as a new test.</p>
              </div>

              {/* Search — always visible, prefilled with rawName */}
              <div className="border border-blue-200 rounded-lg px-4 py-3 bg-blue-50/40 space-y-3">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-blue-600 shrink-0" />
                  <p className="text-sm font-semibold text-blue-800">Search for a Dictionary Match</p>
                </div>
                <DictionarySearchInput
                  initialQuery={pendingRow.rawName}
                  onSelect={handleSearchSelect}
                  selectedId={null}
                />
              </div>
            </div>

          ) : (
            /* ── CASE B: Has AI suggestion OR user selected a match ── */
            <div className="space-y-3">
              {/* Similarity review header card */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-2">
                {hasPossibleMatch && (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">Similar names can still be medically distinct tests (e.g. bioavailable vs. total testosterone, fasting vs. random glucose). Verify carefully before merging.</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Similarity Review</p>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Pending Test</p>
                    <p className="font-semibold text-foreground truncate">{pendingRow.rawName}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0 mt-4" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {draft.kind === "selected_alias" ? "Selected Dictionary Test" : "AI Suggested Match"}
                    </p>
                    {draft.kind === "selected_alias" ? (
                      <p className="font-semibold text-blue-700 truncate">{draft.canonicalName}</p>
                    ) : hasPossibleMatch ? (
                      <p className="font-semibold text-amber-700 truncate">{pendingRow.possibleMatchName}</p>
                    ) : null}
                  </div>
                </div>

                {/* Status pill */}
                {draft.kind === "searching" && hasPossibleMatch && (
                  <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1 mt-1">
                    <Search className="h-3 w-3 shrink-0" />
                    Searching for a different match — nothing saved yet.
                    <button
                      type="button"
                      className="ml-auto text-muted-foreground hover:text-foreground underline text-xs"
                      onClick={() => setDraft({ kind: "idle" })}
                    >
                      ← Back to original suggestion
                    </button>
                  </div>
                )}
                {draft.kind === "selected_alias" && (
                  <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1 mt-1">
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-blue-600" />
                    Match selected — click <strong>Confirm as Alias</strong> below to save.
                    <button
                      type="button"
                      className="ml-auto text-muted-foreground hover:text-foreground underline text-xs"
                      onClick={() => { setDraft({ kind: "searching" }); setManualVerification(null); }}
                    >
                      Change
                    </button>
                  </div>
                )}
              </div>

              {/* ── Search box — shown when searching OR when user has selected a match
                   (so they can change their mind without clicking "Change" first)
                   Also shown immediately when there is NO AI suggestion.
                   ALWAYS prefilled with rawName. ── */}
              {(draft.kind === "searching" || draft.kind === "selected_alias" || !hasPossibleMatch) && (
                <div className="border border-blue-200 rounded-lg px-4 py-3 bg-blue-50/40 space-y-3">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-blue-600 shrink-0" />
                    <p className="text-sm font-semibold text-blue-800">
                      {draft.kind === "selected_alias" ? "Change Match" : "Choose a Different Match"}
                    </p>
                  </div>
                  <DictionarySearchInput
                    initialQuery={pendingRow.rawName}
                    onSelect={handleSearchSelect}
                    selectedId={draft.kind === "selected_alias" ? draft.dictionaryId : null}
                  />
                </div>
              )}
            </div>
          )}

          {/* 2. Medical Similarity Verification (only shown for original AI suggestion in idle) */}
          {hasPossibleMatch && draft.kind === "idle" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Medical Similarity Verification</p>
                {!verification && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
                    onClick={handleVerify}
                    disabled={verifying}
                  >
                    {verifying ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying…</>
                    ) : (
                      <><Sparkles className="h-3.5 w-3.5" /> Run AI Verification</>
                    )}
                  </Button>
                )}
              </div>

              {verification ? (
                <div className={cn("border rounded-lg px-4 py-3 space-y-2.5",
                  verification.verdict === "same" ? "bg-green-50 border-green-200" :
                  verification.verdict === "different" ? "bg-red-50 border-red-200" :
                  verification.verdict === "related_separate" ? "bg-amber-50 border-amber-200" :
                  "bg-blue-50 border-blue-200"
                )}>
                  <VerdictBadge verdict={verification.verdict} confidence={verification.confidence} />
                  <p className="text-sm text-foreground leading-relaxed">{verification.reason}</p>
                  <div className="flex items-start gap-1.5 text-sm">
                    <span className="text-muted-foreground shrink-0 font-medium">Suggested action:</span>
                    <span className="text-foreground">{verification.suggestedAction}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs text-muted-foreground hover:text-foreground px-1"
                    onClick={handleVerify}
                    disabled={verifying}
                  >
                    {verifying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Re-run verification
                  </Button>
                </div>
              ) : (
                <div className="border border-dashed rounded-lg px-4 py-4 text-center text-sm text-muted-foreground">
                  Click "Run AI Verification" to get a medical similarity analysis before deciding.
                </div>
              )}
            </div>
          )}

          {/* 3. Full dictionary record preview (original suggestion or selected match) */}
          {draft.kind === "idle" && hasPossibleMatch && pendingRow.possibleMatchId && (
            <DictRecordSection dictionaryId={pendingRow.possibleMatchId} />
          )}
          {draft.kind === "selected_alias" && (
            <DictRecordSection dictionaryId={draft.dictionaryId} />
          )}

          {/* AI Verify section — shown when user has manually selected a match */}
          {draft.kind === "selected_alias" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Medical Similarity Verification</p>
                {!manualVerification && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
                    onClick={handleVerifyManual}
                    disabled={manualVerifying}
                  >
                    {manualVerifying ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying…</>
                    ) : (
                      <><Sparkles className="h-3.5 w-3.5" /> ✨ AI Verify This Match</>
                    )}
                  </Button>
                )}
              </div>

              {manualVerification ? (
                <div className={cn("border rounded-lg px-4 py-3 space-y-2.5",
                  manualVerification.verdict === "same" ? "bg-green-50 border-green-200" :
                  manualVerification.verdict === "different" ? "bg-red-50 border-red-200" :
                  manualVerification.verdict === "related_separate" ? "bg-amber-50 border-amber-200" :
                  "bg-blue-50 border-blue-200"
                )}>
                  <VerdictBadge verdict={manualVerification.verdict} confidence={manualVerification.confidence} />
                  <p className="text-sm text-foreground leading-relaxed">{manualVerification.reason}</p>
                  <div className="flex items-start gap-1.5 text-sm">
                    <span className="text-muted-foreground shrink-0 font-medium">Suggested action:</span>
                    <span className="text-foreground">{manualVerification.suggestedAction}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs text-muted-foreground hover:text-foreground px-1"
                    onClick={handleVerifyManual}
                    disabled={manualVerifying}
                  >
                    {manualVerifying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Re-run verification
                  </Button>
                </div>
              ) : (
                <div className="border border-dashed rounded-lg px-4 py-4 text-center text-sm text-muted-foreground">
                  Click "✨ AI Verify This Match" to get a medical similarity analysis before confirming as alias.
                </div>
              )}
            </div>
          )}

          {/* 4. Decision buttons */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Save Decision</p>
              <p className="text-xs text-muted-foreground italic">Nothing is saved until you click a button below.</p>
            </div>
            <div className="flex flex-wrap gap-2">

              {/* ── Confirm as Alias (original AI suggestion or selected alternative) ── */}
              {(hasPossibleMatch || draft.kind === "selected_alias") && draft.kind !== "searching" && (
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                  disabled={isSaving}
                  onClick={handleConfirmAsAlias}
                >
                  {confirmAliasMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {draft.kind === "selected_alias"
                    ? `Confirm as Alias → ${draft.canonicalName}`
                    : "Confirm as Alias"}
                </Button>
              )}

              {/* ── Choose Different Match (local state change only — no DB write) ── */}
              {hasPossibleMatch && draft.kind === "idle" && (
                <Button
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 gap-1.5"
                  onClick={() => setDraft({ kind: "searching" })}
                >
                  <AlertTriangle className="h-4 w-4" />
                  Choose Different Match
                </Button>
              )}

              {/* ── Back to original suggestion (only when there IS an AI suggestion) ── */}
              {draft.kind === "searching" && hasPossibleMatch && (
                <Button
                  variant="outline"
                  className="border-muted text-muted-foreground hover:bg-muted/50 gap-1.5"
                  onClick={() => setDraft({ kind: "idle" })}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Original Suggestion
                </Button>
              )}

              {/* ── Approve as New Test ── */}
              <Button
                variant="outline"
                className="border-blue-300 text-blue-700 hover:bg-blue-50 gap-1.5"
                disabled={isSaving}
                onClick={handleApproveAsNew}
              >
                <Sparkles className="h-4 w-4" />
                Approve as New Test
              </Button>

              {/* ── Reject Pending Test (final — deletes from pending) ── */}
              <Button
                variant="outline"
                className="border-red-200 text-red-500 hover:bg-red-50 gap-1.5"
                disabled={isSaving}
                onClick={handleRejectPending}
              >
                {reviewPendingMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Reject Pending Test
              </Button>

              {/* ── Cancel (discards all draft state — no DB writes) ── */}
              <Button variant="ghost" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
