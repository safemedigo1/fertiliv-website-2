import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, Loader2, FlaskConical, CheckCircle2, Sparkles, BookPlus } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";

export type ResultType =
  | "Quantitative"
  | "Qualitative"
  | "Molecular/PCR"
  | "Genetic"
  | "Microbiology Culture"
  | "Microscopy/Parasitology"
  | "Panel/Profile"
  | "Pathology/Biopsy"
  | "Semen Analysis"
  | "Semen DNA"
  | "Therapeutic Drug Monitoring"
  | "Descriptive/Report";

export interface LabDictionaryEntry {
  id: number;
  canonicalName: string;
  displayName: string;
  abbreviation?: string | null;
  resultType: ResultType;
  category?: string | null;
  specimen?: string | null;
  commonUnits?: string | null;
  suggestedModule?: string | null;
  analyteGroup?: string | null;
  orderType?: string | null;
}

interface Props {
  value?: string;
  onSelect: (entry: LabDictionaryEntry | null, rawName: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  /** If provided, unknown tests will be submitted for dictionary approval */
  patientId?: number;
  /** Whether to show the "Submit to dictionary" button for unknown tests */
  enableDictionarySubmit?: boolean;
}

const RESULT_TYPE_COLORS: Record<ResultType, string> = {
  Quantitative: "bg-blue-100 text-blue-700",
  Qualitative: "bg-green-100 text-green-700",
  "Molecular/PCR": "bg-purple-100 text-purple-700",
  Genetic: "bg-violet-100 text-violet-700",
  "Microbiology Culture": "bg-orange-100 text-orange-700",
  "Microscopy/Parasitology": "bg-amber-100 text-amber-700",
  "Panel/Profile": "bg-cyan-100 text-cyan-700",
  "Pathology/Biopsy": "bg-rose-100 text-rose-700",
  "Semen Analysis": "bg-teal-100 text-teal-700",
  "Semen DNA": "bg-indigo-100 text-indigo-700",
  "Therapeutic Drug Monitoring": "bg-yellow-100 text-yellow-700",
  "Descriptive/Report": "bg-gray-100 text-gray-700",
};

export function LabTestAutocomplete({
  value = "",
  onSelect,
  placeholder = "Search test name (e.g., TSH, AMH, CBC...)",
  disabled = false,
  className,
  autoFocus = false,
  patientId,
  enableDictionarySubmit = false,
}: Props) {
  const submitPendingMutation = trpc.labDictionary.submitPending.useMutation();
  const [submittedNames, setSubmittedNames] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitToDictionary = async (rawName: string) => {
    if (!rawName.trim()) return;
    setSubmitting(true);
    try {
      const result = await submitPendingMutation.mutateAsync({
        rawName: rawName.trim(),
        source: "patient_entry",
        patientId,
      });
      if (result.deduplicated) {
        toast.info('Already submitted', { description: `"${rawName}" is already pending admin review.` });
      } else {
        toast.success('Submitted for review', { description: `"${rawName}" has been sent to the admin for dictionary approval.` });
      }
      setSubmittedNames(prev => new Set(Array.from(prev).concat(rawName.trim().toLowerCase())));
    } catch {
      toast.error('Submission failed', { description: 'Could not submit test for review. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };
  const [inputValue, setInputValue] = useState(value);
  const [open, setOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<LabDictionaryEntry | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(inputValue, 200);

  const { data: results, isFetching } = trpc.labDictionary.search.useQuery(
    { query: debouncedQuery, limit: 12 },
    {
      enabled: debouncedQuery.trim().length >= 2 && !selectedEntry,
      staleTime: 30_000,
    }
  );

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Open dropdown when results arrive
  useEffect(() => {
    if (results && results.length > 0 && !selectedEntry) {
      setOpen(true);
    }
  }, [results, selectedEntry]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setInputValue(v);
    if (selectedEntry) {
      setSelectedEntry(null);
    }
    // Always emit raw text to parent so it can show custom-test flow
    onSelect(null, v);
    if (v.length < 2) setOpen(false);
  };

  const handleSelect = useCallback(
    (entry: LabDictionaryEntry) => {
      setSelectedEntry(entry);
      setInputValue(entry.displayName);
      setOpen(false);
      onSelect(entry, entry.displayName);
    },
    [onSelect]
  );

  const handleClear = () => {
    setInputValue("");
    setSelectedEntry(null);
    setOpen(false);
    onSelect(null, "");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (results && results.length > 0 && !selectedEntry) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className={cn(
            "pl-9 pr-9",
            selectedEntry && "border-green-500 bg-green-50/50 dark:bg-green-950/20"
          )}
        />
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {selectedEntry && !isFetching && (
          <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
        )}
      </div>

      {/* Dropdown */}
      {open && results && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden"
        >
          <div className="max-h-72 overflow-y-auto">
            {results.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-accent text-left transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(entry as LabDictionaryEntry);
                }}
              >
                <FlaskConical className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">
                      {entry.displayName}
                    </span>
                    {entry.abbreviation && (
                      <span className="text-xs text-muted-foreground">
                        ({entry.abbreviation})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-xs px-1.5 py-0 h-4",
                        RESULT_TYPE_COLORS[entry.resultType as ResultType]
                      )}
                    >
                      {entry.resultType}
                    </Badge>
                    {entry.category && (
                      <span className="text-xs text-muted-foreground truncate">
                        {entry.category}
                      </span>
                    )}
                    {entry.commonUnits && (
                      <span className="text-xs text-muted-foreground">
                        · {entry.commonUnits}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {/* "Not found" footer */}
          <div className="border-t px-3 py-2 bg-muted/30 flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">Can't find the exact test?</p>
            <div className="flex flex-wrap gap-2">
              {enableDictionarySubmit ? (
                <button
                  type="button"
                  disabled={submitting || submittedNames.has(inputValue.trim().toLowerCase())}
                  className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1 rounded-md font-medium disabled:opacity-60 transition-colors"
                  onMouseDown={async (e) => {
                    e.preventDefault();
                    // Use as custom test immediately
                    setOpen(false);
                    onSelect(null, inputValue);
                    // Also submit to dictionary
                    await handleSubmitToDictionary(inputValue);
                  }}
                >
                  {submitting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : submittedNames.has(inputValue.trim().toLowerCase()) ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <BookPlus className="h-3 w-3" />
                  )}
                  {submittedNames.has(inputValue.trim().toLowerCase())
                    ? 'Submitted to Dictionary ✓'
                    : 'Submit to Dictionary + Use as custom test'}
                </button>
              ) : (
                <button
                  type="button"
                  className="text-xs text-primary font-medium underline"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setOpen(false);
                    onSelect(null, inputValue);
                  }}
                >
                  Use "{inputValue}" as custom test
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* No results */}
      {open && debouncedQuery.length >= 2 && results && results.length === 0 && !isFetching && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg"
        >
          <div className="px-3 py-3 text-sm">
            <p className="text-muted-foreground mb-2">No tests found for "{debouncedQuery}".</p>
            <div className="flex flex-col gap-1.5">
              {enableDictionarySubmit ? (
                <button
                  type="button"
                  disabled={submitting || submittedNames.has(inputValue.trim().toLowerCase())}
                  className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1.5 rounded-md font-medium disabled:opacity-60 transition-colors w-fit"
                  onMouseDown={async (e) => {
                    e.preventDefault();
                    // Use as custom test immediately
                    setOpen(false);
                    onSelect(null, inputValue);
                    // Also submit to dictionary
                    await handleSubmitToDictionary(inputValue);
                  }}
                >
                  {submitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : submittedNames.has(inputValue.trim().toLowerCase()) ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <BookPlus className="h-3.5 w-3.5" />
                  )}
                  {submittedNames.has(inputValue.trim().toLowerCase())
                    ? 'Submitted to Dictionary ✓'
                    : 'Submit to Dictionary + Use as custom test'}
                </button>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-primary font-medium text-sm hover:underline"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setOpen(false);
                    onSelect(null, inputValue);
                  }}
                >
                  <span className="text-base">+</span> Use "{inputValue}" as custom test
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { RESULT_TYPE_COLORS };
