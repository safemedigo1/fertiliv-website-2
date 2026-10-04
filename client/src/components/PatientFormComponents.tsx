import { Input } from "@/components/ui/input";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
// Re-export CONTACT_METHODS from shared constant so both Lead and Patient forms
// use the same 5-value list. Import from here to avoid breaking existing imports.
export { CONTACT_METHODS } from "@shared/contactMethods";

export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "tr", label: "Turkish" },
  { value: "ru", label: "Russian" },
  { value: "de", label: "German" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "fa", label: "Persian" },
  { value: "ur", label: "Urdu" },
  { value: "other", label: "Other" },
];

// CONTACT_METHODS is now imported from shared/contactMethods.ts (see re-export above)

// ─── Multi-Select Component ─────────────────────────────────────────────────
export function MultiSelect({ options, value, onChange, placeholder }: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  return (
    <div ref={ref} className="relative w-full">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full h-10 px-3 border border-input rounded-lg bg-background text-sm text-left hover:bg-accent/30 transition-colors">
        <span className="truncate text-muted-foreground">
          {value.length === 0 ? (placeholder ?? "Select…") : value.map(v => options.find(o => o.value === v)?.label ?? v).join(", ")}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.map(opt => (
            <button key={opt.value} type="button" onClick={() => toggle(opt.value)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent/40 transition-colors text-left">
              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${value.includes(opt.value) ? "bg-primary border-primary" : "border-input"}`}>
                {value.includes(opt.value) && <Check className="h-3 w-3 text-white" />}
              </div>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Multi-Select for Doctors ────────────────────────────────────────────────
export function DoctorMultiSelect({ doctors, value, onChange, isLoading }: {
  doctors: { id: number; name: string | null }[];
  value: number[];
  onChange: (v: number[]) => void;
  isLoading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  // Build label: if the doctors list hasn't loaded yet but we have selected IDs, show a loading indicator
  // instead of raw numeric IDs.
  const isListLoaded = doctors.length > 0 || !isLoading;
  const label = value.length === 0
    ? "Select doctors…"
    : isListLoaded
      ? value.map(id => doctors.find(d => d.id === id)?.name ?? "Unknown Doctor").join(", ")
      : "Loading…";
  return (
    <div ref={ref} className="relative w-full">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full h-10 px-3 border border-input rounded-lg bg-background text-sm text-left hover:bg-accent/30 transition-colors">
        <span className={`truncate ${value.length === 0 ? "text-muted-foreground" : "text-foreground"}`}>{label}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {isLoading && doctors.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Loading doctors…</p>}
          {!isLoading && doctors.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No doctors available</p>}
          {doctors.map(d => (
            <button key={d.id} type="button" onClick={() => toggle(d.id)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent/40 transition-colors text-left">
              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${value.includes(d.id) ? "bg-primary border-primary" : "border-input"}`}>
                {value.includes(d.id) && <Check className="h-3 w-3 text-white" />}
              </div>
              {d.name ?? "—"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Searchable Combobox ─────────────────────────────────────────────────────
export function SearchableCombobox({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())).slice(0, 80);
  const selected = options.find(o => o.value === value);
  return (
    <div ref={ref} className="relative w-full">
      <button type="button" onClick={() => { setOpen(o => !o); setSearch(""); }}
        className="flex items-center justify-between w-full h-10 px-3 border border-input rounded-lg bg-background text-sm text-left hover:bg-accent/30 transition-colors">
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>{selected?.label ?? placeholder ?? "Select…"}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-background border border-border rounded-lg shadow-lg">
          <div className="p-2 border-b">
            <Input autoFocus className="h-8 text-sm" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.map(opt => (
              <button key={opt.value} type="button" onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent/40 transition-colors text-left ${opt.value === value ? "bg-primary/10 font-medium" : ""}`}>
                {opt.value === value && <Check className="h-3 w-3 text-primary shrink-0" />}
                {opt.label}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No results</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Language Select With Primary Designation ────────────────────────────────
/**
 * Allows selecting multiple languages and designating one as the primary language.
 * Uses the centralized referenceData from the DB (falls back to LANGUAGES constant).
 */
export function LanguageSelectWithPrimary({
  languages,
  primaryLanguage,
  onLanguagesChange,
  onPrimaryChange,
  options,
}: {
  languages: string[];
  primaryLanguage?: string | null;
  onLanguagesChange: (v: string[]) => void;
  onPrimaryChange: (v: string | null) => void;
  options?: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const opts = options ?? LANGUAGES;
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (v: string) => {
    const next = languages.includes(v) ? languages.filter(x => x !== v) : [...languages, v];
    onLanguagesChange(next);
    // If we removed the primary language, clear it
    if (!next.includes(primaryLanguage ?? "") && primaryLanguage === v) {
      onPrimaryChange(null);
    }
    // If this is the first language selected, auto-set as primary
    if (next.length === 1) {
      onPrimaryChange(next[0]);
    }
  };

  const setPrimary = (e: React.MouseEvent, v: string) => {
    e.stopPropagation();
    onPrimaryChange(v === primaryLanguage ? null : v);
  };

  const displayLabel = languages.length === 0
    ? "Select languages…"
    : languages.map(v => {
        const label = opts.find(o => o.value === v)?.label ?? v;
        return v === primaryLanguage ? `★ ${label}` : label;
      }).join(", ");

  return (
    <div ref={ref} className="relative w-full space-y-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full h-10 px-3 border border-input rounded-lg bg-background text-sm text-left hover:bg-accent/30 transition-colors"
      >
        <span className="truncate text-muted-foreground">{displayLabel}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-background border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {opts.map(opt => (
            <div
              key={opt.value}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent/40 transition-colors cursor-pointer"
              onClick={() => toggle(opt.value)}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${languages.includes(opt.value) ? "bg-primary border-primary" : "border-input"}`}>
                {languages.includes(opt.value) && <Check className="h-3 w-3 text-white" />}
              </div>
              <span className="flex-1">{opt.label}</span>
              {languages.includes(opt.value) && (
                <button
                  type="button"
                  title={opt.value === primaryLanguage ? "Primary language" : "Set as primary"}
                  onClick={(e) => setPrimary(e, opt.value)}
                  className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${opt.value === primaryLanguage ? "bg-primary text-white border-primary" : "border-input text-muted-foreground hover:border-primary hover:text-primary"}`}
                >
                  {opt.value === primaryLanguage ? "★ Primary" : "Set primary"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {primaryLanguage && languages.includes(primaryLanguage) && (
        <p className="text-xs text-muted-foreground">
          Primary: <strong>{opts.find(o => o.value === primaryLanguage)?.label ?? primaryLanguage}</strong> — used for invoices, proposals, and reports.
        </p>
      )}
    </div>
  );
}
