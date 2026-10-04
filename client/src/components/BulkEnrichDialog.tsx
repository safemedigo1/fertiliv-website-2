import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Sparkles, ChevronDown, ChevronUp, CheckCircle2, Loader2, AlertCircle, Wand2 } from "lucide-react";

type SuggestionItem = {
  id: number;
  canonicalName: string;
  missingFields: string[];
  suggestions: {
    aliases?: string[];
    canonicalUnit?: string;
    alternativeUnits?: string[];
    conversionFactors?: Record<string, number>;
    category?: string;
    specimen?: string;
    notes?: string;
  };
};

type ApplyItem = {
  id: number;
  applyAliases?: string[];
  canonicalUnit?: string;
  alternativeUnits?: string[];
  conversionFactors?: Record<string, number>;
  category?: string;
  specimen?: string;
  notes?: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
  totalTests: number;
}

const BATCH_SIZE = 10;

export function BulkEnrichDialog({ open, onClose, onApplied, totalTests }: Props) {
  const [offset, setOffset] = useState(0);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [done, setDone] = useState(false);
  const [applyResult, setApplyResult] = useState<{ appliedCount: number; aliasesAdded: number } | null>(null);

  const previewMutation = trpc.labDictionary.bulkEnrichPreview.useMutation();
  const applyMutation = trpc.labDictionary.bulkEnrichApply.useMutation();

  const handlePreview = async (newOffset = 0) => {
    setIsLoading(true);
    setSuggestions([]);
    setSelected(new Set());
    setExpanded(new Set());
    setDone(false);
    setApplyResult(null);
    try {
      const result = await previewMutation.mutateAsync({ batchSize: BATCH_SIZE, offset: newOffset });
      setSuggestions(result.suggestions);
      // Auto-select all
      setSelected(new Set(result.suggestions.map(s => s.id)));
      setOffset(newOffset);
      if (result.suggestions.length === 0) {
        toast.success("All tests in this batch are already fully enriched!");
      }
    } catch {
      toast.error("Failed to generate suggestions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = async () => {
    if (selected.size === 0) {
      toast.error("Please select at least one test to apply.");
      return;
    }
    setIsApplying(true);
    try {
      const items: ApplyItem[] = suggestions
        .filter(s => selected.has(s.id))
        .map(s => ({
          id: s.id,
          applyAliases: s.suggestions.aliases,
          canonicalUnit: s.suggestions.canonicalUnit,
          alternativeUnits: s.suggestions.alternativeUnits,
          conversionFactors: s.suggestions.conversionFactors,
          category: s.suggestions.category,
          specimen: s.suggestions.specimen,
          notes: s.suggestions.notes,
        }));
      const result = await applyMutation.mutateAsync({ items });
      setApplyResult(result);
      setDone(true);
      onApplied();
      toast.success(`Applied enrichment to ${result.appliedCount} tests, added ${result.aliasesAdded} aliases.`);
    } catch {
      toast.error("Failed to apply enrichment. Please try again.");
    } finally {
      setIsApplying(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(suggestions.map(s => s.id)));
  const deselectAll = () => setSelected(new Set());

  const fieldLabel: Record<string, string> = {
    aliases: "Aliases",
    canonicalUnit: "Standard Unit",
    alternativeUnits: "Alt. Units",
    conversionFactors: "Conversion",
    category: "Category",
    specimen: "Specimen",
    notes: "Notes",
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="w-5 h-5 text-purple-600" />
            Bulk AI Enrichment — Lab Dictionary
          </DialogTitle>
          <DialogDescription>
            AI will analyze each test and suggest missing fields (aliases, units, category, specimen, notes).
            Review the suggestions below, then apply the ones you approve.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Generate */}
        {suggestions.length === 0 && !isLoading && !done && (
          <div className="flex flex-col items-center gap-4 py-10">
            <div className="w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center">
              <Wand2 className="w-8 h-8 text-purple-600" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground">Ready to enrich {totalTests} tests</p>
              <p className="text-sm text-muted-foreground mt-1">
                AI will process {BATCH_SIZE} tests at a time. You can review and apply each batch separately.
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => handlePreview(0)} className="bg-purple-600 hover:bg-purple-700 text-white gap-2">
                <Sparkles className="w-4 h-4" />
                Generate Suggestions (First {BATCH_SIZE})
              </Button>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Loader2 className="w-10 h-10 text-purple-600 animate-spin" />
            <p className="text-sm text-muted-foreground">AI is analyzing tests and generating suggestions...</p>
            <p className="text-xs text-muted-foreground">This may take 15–30 seconds for {BATCH_SIZE} tests.</p>
          </div>
        )}

        {/* Done state */}
        {done && applyResult && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground">Enrichment Applied Successfully!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Updated {applyResult.appliedCount} tests · Added {applyResult.aliasesAdded} new aliases
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handlePreview(offset + BATCH_SIZE)}>
                Process Next {BATCH_SIZE} Tests
              </Button>
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}

        {/* Suggestions table */}
        {suggestions.length > 0 && !done && (
          <div className="space-y-3">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{suggestions.length} tests with suggestions</span>
                <Badge variant="secondary">{selected.size} selected</Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll}>Select All</Button>
                <Button variant="ghost" size="sm" onClick={deselectAll}>Deselect All</Button>
              </div>
            </div>

            {/* Test rows */}
            <div className="border rounded-lg divide-y divide-border overflow-hidden">
              {suggestions.map(item => (
                <div key={item.id} className={`transition-colors ${selected.has(item.id) ? "bg-purple-50/50" : "bg-background"}`}>
                  {/* Row header */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Checkbox
                      checked={selected.has(item.id)}
                      onCheckedChange={() => toggleSelect(item.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm text-foreground">{item.canonicalName}</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.missingFields.map(f => (
                          <Badge key={f} variant="outline" className="text-[10px] px-1.5 py-0 border-purple-300 text-purple-700">
                            {fieldLabel[f] ?? f}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground"
                      onClick={() => toggleExpand(item.id)}
                    >
                      {expanded.has(item.id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      {expanded.has(item.id) ? "Hide" : "Preview"}
                    </Button>
                  </div>

                  {/* Expanded details */}
                  {expanded.has(item.id) && (
                    <div className="px-4 pb-3 space-y-2 bg-muted/20">
                      {item.suggestions.aliases && item.suggestions.aliases.length > 0 && (
                        <div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Aliases</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.suggestions.aliases.map(a => (
                              <Badge key={a} variant="secondary" className="text-xs">{a}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {item.suggestions.canonicalUnit && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Standard Unit:</span>
                          <Badge className="bg-blue-100 text-blue-800 border-0 text-xs">{item.suggestions.canonicalUnit}</Badge>
                        </div>
                      )}
                      {item.suggestions.alternativeUnits && item.suggestions.alternativeUnits.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Alt. Units:</span>
                          {item.suggestions.alternativeUnits.map(u => (
                            <Badge key={u} variant="outline" className="text-xs">{u}</Badge>
                          ))}
                        </div>
                      )}
                      {item.suggestions.conversionFactors && Object.keys(item.suggestions.conversionFactors).length > 0 && (
                        <div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conversion Factors</span>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {Object.entries(item.suggestions.conversionFactors).map(([unit, factor]) => (
                              <span key={unit} className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                                1 {unit} = {factor} {item.suggestions.canonicalUnit}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {item.suggestions.category && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category:</span>
                          <span className="text-xs text-foreground">{item.suggestions.category}</span>
                        </div>
                      )}
                      {item.suggestions.specimen && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Specimen:</span>
                          <span className="text-xs text-foreground">{item.suggestions.specimen}</span>
                        </div>
                      )}
                      {item.suggestions.notes && (
                        <div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</span>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.suggestions.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>AI suggestions are based on medical knowledge. Please review before applying, especially conversion factors and units.</span>
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={() => handlePreview(offset)} disabled={isApplying}>
                Regenerate Suggestions
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={isApplying}>Cancel</Button>
                <Button
                  onClick={handleApply}
                  disabled={selected.size === 0 || isApplying}
                  className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
                >
                  {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Apply to {selected.size} Tests
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
