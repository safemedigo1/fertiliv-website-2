/**
 * ServicePickerModal
 * ──────────────────
 * Responsive service picker:
 *  - Desktop (≥ md / 768px): existing two-column split layout
 *  - Mobile (< md): single-column with horizontal chip row, compact selected summary, sticky footer
 *
 * All pricing/selection logic is unchanged.
 */

import { useState, useMemo, useCallback, useRef, useEffect, memo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Search, Plus, Minus, X, AlertTriangle, CheckCircle2, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ServiceItem = {
  id: number;
  name: string;
  category: string;
  code?: string | null;
  price: string; // base TRY price
  description?: string | null;
};

export type SelectedService = {
  service: ServiceItem;
  quantity: number;
  unitPrice: string; // in the invoice currency
  tryPrice: string;  // base TRY price
};

export type ServicePickerMode = "create" | "edit";

export type ServicePickerResult =
  | { action: "add_to_invoice"; items: SelectedService[] }
  | { action: "create_new_invoice"; items: SelectedService[] };

interface ServicePickerModalProps {
  open: boolean;
  onClose: () => void;
  services: ServiceItem[];
  currency: string;
  /** Called when user confirms their selection */
  onResult: (result: ServicePickerResult) => void;
  /** "edit" mode shows the smart routing (add vs new invoice) */
  mode: ServicePickerMode;
  /** Whether the current invoice has unsaved changes (only relevant in edit mode) */
  hasUnsavedChanges?: boolean;
  /** Convert TRY amount to invoice currency */
  convertFromTRY: (tryAmount: number, currency: string) => number;
}

// ─── Category label map ───────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  lab_test: "Lab Test",
  radiology_test: "Radiology",
  pathology_test: "Pathology",
  other_test: "Other Test",
  procedure: "Procedure",
  consultation: "Consultation",
  medicine: "Medicine",
};

// ─── Virtual list row height ──────────────────────────────────────────────────
const ROW_H = 64; // px per service row
const VISIBLE_ROWS = 10; // rows visible at once

// ─── SelectedCard (module-level to prevent remount on parent re-render) ──────
//
// Root cause of the iOS focus-loss bug:
//   When SelectedCard was defined INSIDE ServicePickerModal's render body, every
//   call to updatePrice (which updates the `selected` Map) caused the parent to
//   re-render, React saw a new SelectedCard function reference, unmounted the old
//   DOM node, and mounted a fresh one — destroying the focused <input> after each
//   keystroke.
//
// Fix:
//   - Define SelectedCard at module level (stable identity across renders).
//   - Keep a local `editingValue` string state inside SelectedCard.
//   - While focused: user types freely into the raw string; parent Map is NOT updated.
//   - On blur: validate, normalise to 2dp, commit to parent via onPriceChange.
//   - Use inputMode="decimal" + type="text" for correct iOS decimal keyboard.

interface SelectedCardProps {
  service: ServiceItem;
  quantity: number;
  unitPrice: string;
  currency: string;
  onQuantityChange: (id: number, delta: number) => void;
  onPriceChange: (id: number, value: string) => void;
  onRemove: (id: number) => void;
}

const SelectedCard = memo(function SelectedCard({
  service: s,
  quantity,
  unitPrice,
  currency,
  onQuantityChange,
  onPriceChange,
  onRemove,
}: SelectedCardProps) {
  // Local raw-string editing state — avoids committing on every keystroke
  const [editingValue, setEditingValue] = useState(unitPrice);

  // Sync when the committed price changes from outside (e.g. initial load)
  // but NOT while the user is actively typing (focus guard via ref)
  const isFocusedRef = useRef(false);
  useEffect(() => {
    if (!isFocusedRef.current) {
      setEditingValue(unitPrice);
    }
  }, [unitPrice]);

  const committedPrice = parseFloat(unitPrice || "0");
  const lineTotal = (quantity * committedPrice).toFixed(2);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = true;
    // Select all text on focus so the user can immediately replace the value
    e.currentTarget.select();
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    // Normalise: strip non-numeric except decimal point
    const raw = editingValue.replace(/[^0-9.]/g, "");
    const parsed = parseFloat(raw);
    const normalised = isNaN(parsed) || parsed < 0 ? "0.00" : parsed.toFixed(2);
    setEditingValue(normalised);
    onPriceChange(s.id, normalised);
  };

  return (
    <div className="bg-background rounded-lg border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium leading-tight flex-1">{s.name}</p>
        <button onClick={() => onRemove(s.id)} className="shrink-0 text-muted-foreground hover:text-destructive transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        {/* Quantity stepper */}
        <div className="flex items-center border rounded h-7">
          <button onClick={() => onQuantityChange(s.id, -1)} className="px-2 h-full hover:bg-muted rounded-l transition-colors">
            <Minus className="h-3 w-3" />
          </button>
          <span className="px-2 text-xs font-semibold min-w-[2rem] text-center">{quantity}</span>
          <button onClick={() => onQuantityChange(s.id, 1)} className="px-2 h-full hover:bg-muted rounded-r transition-colors">
            <Plus className="h-3 w-3" />
          </button>
        </div>
        {/* Unit price — raw text input, committed on blur only */}
        <div className="flex-1 relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{currency}</span>
          <Input
            type="text"
            inputMode="decimal"
            value={editingValue}
            onChange={e => setEditingValue(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className="h-7 text-xs pl-10"
          />
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Line total: {currency} {lineTotal}</span>
      </div>
    </div>
  );
});

// ─── Component ───────────────────────────────────────────────────────────────

export function ServicePickerModal({
  open,
  onClose,
  services,
  currency,
  onResult,
  mode,
  hasUnsavedChanges = false,
  convertFromTRY,
}: ServicePickerModalProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [selected, setSelected] = useState<Map<number, SelectedService>>(new Map());
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Mobile: selected summary drawer open/closed
  const [mobileSelectedOpen, setMobileSelectedOpen] = useState(false);

  // Smart routing dialog states
  const [showAddWarning, setShowAddWarning] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<"add" | "new" | null>(null);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setSearch("");
      setActiveCategory("");
      setSelected(new Map());
      setScrollTop(0);
      setShowAddWarning(false);
      setShowUnsavedDialog(false);
      setPendingAction(null);
      setMobileSelectedOpen(false);
    }
  }, [open]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const categories = useMemo(() => {
    const cats = new Set<string>();
    services.forEach(s => cats.add(s.category ?? "other"));
    return Array.from(cats).sort();
  }, [services]);

  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter(s => {
      const matchCat = !activeCategory || s.category === activeCategory;
      if (!matchCat) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.code ?? "").toLowerCase().includes(q) ||
        (s.category ?? "").toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [services, search, activeCategory]);

  // ── Virtual list ────────────────────────────────────────────────────────────

  const totalH = filteredServices.length * ROW_H;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - 2);
  const endIdx = Math.min(filteredServices.length, startIdx + VISIBLE_ROWS + 4);
  const visibleServices = filteredServices.slice(startIdx, endIdx);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // ── Selection helpers ────────────────────────────────────────────────────────

  const getDisplayPrice = useCallback((s: ServiceItem): string => {
    const tryPrice = parseFloat(s.price ?? "0");
    return convertFromTRY(tryPrice, currency).toFixed(2);
  }, [convertFromTRY, currency]);

  const toggleService = useCallback((s: ServiceItem) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(s.id)) {
        next.delete(s.id);
      } else {
        const tryPrice = s.price ?? "0";
        const unitPrice = convertFromTRY(parseFloat(tryPrice), currency).toFixed(2);
        next.set(s.id, { service: s, quantity: 1, unitPrice, tryPrice });
      }
      return next;
    });
  }, [convertFromTRY, currency]);

  const updateQuantity = useCallback((id: number, delta: number) => {
    setSelected(prev => {
      const next = new Map(prev);
      const entry = next.get(id);
      if (!entry) return prev;
      const newQty = Math.max(1, entry.quantity + delta);
      next.set(id, { ...entry, quantity: newQty });
      return next;
    });
  }, []);

  const updatePrice = useCallback((id: number, value: string) => {
    setSelected(prev => {
      const next = new Map(prev);
      const entry = next.get(id);
      if (!entry) return prev;
      next.set(id, { ...entry, unitPrice: value });
      return next;
    });
  }, []);

  const removeSelected = useCallback((id: number) => {
    setSelected(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const selectedList = Array.from(selected.values());
  const selectedCount = selectedList.length;

  // ── Action handlers ──────────────────────────────────────────────────────────

  const handleAddToInvoice = () => {
    if (selectedCount === 0) { toast.error("Select at least one service"); return; }
    if (mode === "edit") {
      setShowAddWarning(true);
    } else {
      onResult({ action: "add_to_invoice", items: selectedList });
      onClose();
    }
  };

  const handleCreateNewInvoice = () => {
    if (selectedCount === 0) { toast.error("Select at least one service"); return; }
    if (mode === "edit" && hasUnsavedChanges) {
      setPendingAction("new");
      setShowUnsavedDialog(true);
    } else {
      onResult({ action: "create_new_invoice", items: selectedList });
      onClose();
    }
  };

  const confirmAddToInvoice = () => {
    setShowAddWarning(false);
    onResult({ action: "add_to_invoice", items: selectedList });
    onClose();
  };

  const handleUnsavedChoice = (choice: "save" | "discard" | "cancel") => {
    setShowUnsavedDialog(false);
    if (choice === "cancel") { setPendingAction(null); return; }
    if (pendingAction === "new") {
      onResult({ action: "create_new_invoice", items: selectedList });
      onClose();
    }
    setPendingAction(null);
  };

  // ── Shared sub-components ────────────────────────────────────────────────────

  /** Single service row — used in both desktop and mobile lists */
  const ServiceRow = ({ s, idx }: { s: ServiceItem; idx: number }) => {
    const isSelected = selected.has(s.id);
    const displayPrice = getDisplayPrice(s);
    return (
      <div
        key={s.id}
        style={{ position: "absolute", top: idx * ROW_H, left: 0, right: 0, height: ROW_H }}
        onClick={() => toggleService(s)}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors mx-1 ${isSelected ? "bg-primary/8 border border-primary/20" : "hover:bg-muted/60"}`}
      >
        {/* Checkbox */}
        <div className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
          {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-primary-foreground fill-current" />}
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{s.name}</span>
            {s.code && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">{s.code}</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0 font-normal">
              {CATEGORY_LABELS[s.category] ?? s.category?.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>
        {/* Price */}
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold">{currency} {displayPrice}</p>
        </div>
      </div>
    );
  };

  /** Footer action buttons — shared between desktop and mobile */
  const FooterActions = ({ compact = false }: { compact?: boolean }) => (
    <>
      {selectedCount > 0 && !compact && (
        <div className="text-xs text-muted-foreground text-right mb-1">
          Total cash: {currency} {selectedList.reduce((s, i) => s + i.quantity * parseFloat(i.unitPrice || "0"), 0).toFixed(2)}
        </div>
      )}
      {mode === "edit" ? (
        <>
          <Button className="w-full h-9 text-sm gap-1.5" onClick={handleCreateNewInvoice} disabled={selectedCount === 0}>
            <Plus className="h-4 w-4" />
            Create New Invoice ({selectedCount} service{selectedCount !== 1 ? "s" : ""})
          </Button>
          {!compact && <p className="text-[10px] text-center text-emerald-700 font-medium">← Recommended for additional services</p>}
          <Button variant="outline" className="w-full h-8 text-xs gap-1.5" onClick={handleAddToInvoice} disabled={selectedCount === 0}>
            Add to this invoice
          </Button>
        </>
      ) : (
        <Button className="w-full h-10 text-sm gap-1.5" onClick={handleAddToInvoice} disabled={selectedCount === 0}>
          <Plus className="h-4 w-4" />
          {selectedCount > 0
            ? `Add ${selectedCount} Service${selectedCount !== 1 ? "s" : ""} to Invoice`
            : "Add Services to Invoice"}
        </Button>
      )}
      <Button variant="ghost" className="w-full h-8 text-xs" onClick={onClose}>
        Cancel
      </Button>
    </>
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent
          className="!p-0 !gap-0 w-[95vw] !max-w-[1200px] !max-h-[92dvh] !flex flex-col"
          style={{ minHeight: 520 }}
        >
          <DialogHeader className="shrink-0 px-5 pt-4 pb-3 border-b">
            <DialogTitle className="text-base font-semibold">Add Services</DialogTitle>
          </DialogHeader>

          {/* ════════════════════════════════════════════════════════════════════
              DESKTOP layout (md and above) — two-column split, unchanged
          ════════════════════════════════════════════════════════════════════ */}
          <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">

            {/* Left: search + filter + list */}
            <div className="flex flex-col flex-1 min-w-0 border-r">
              {/* Search bar */}
              <div className="px-4 pt-3 pb-2 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    autoFocus
                    placeholder="Search by name, code, or category…"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setScrollTop(0); }}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
              </div>
              {/* Category chips */}
              <div className="flex flex-wrap gap-1.5 px-4 pb-2 shrink-0">
                <button
                  onClick={() => { setActiveCategory(""); setScrollTop(0); }}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${!activeCategory ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                >
                  All ({services.length})
                </button>
                {categories.map(cat => {
                  const count = services.filter(s => s.category === cat).length;
                  return (
                    <button
                      key={cat}
                      onClick={() => { setActiveCategory(cat === activeCategory ? "" : cat); setScrollTop(0); }}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${activeCategory === cat ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                    >
                      {CATEGORY_LABELS[cat] ?? cat.replace(/_/g, " ")} ({count})
                    </button>
                  );
                })}
              </div>
              {/* Results count */}
              <div className="px-4 pb-1 shrink-0">
                <p className="text-xs text-muted-foreground">
                  {filteredServices.length} service{filteredServices.length !== 1 ? "s" : ""}
                  {search ? ` matching "${search}"` : ""}
                </p>
              </div>
              {/* Virtualized service list */}
              <div ref={listRef} className="flex-1 overflow-y-auto px-2 pb-2" onScroll={handleScroll} style={{ overscrollBehavior: "contain" }}>
                {filteredServices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                    <Search className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No services found</p>
                    {search && <button className="text-xs text-primary underline" onClick={() => setSearch("")}>Clear search</button>}
                  </div>
                ) : (
                  <div style={{ height: totalH, position: "relative" }}>
                    {visibleServices.map((s, i) => (
                      <ServiceRow key={s.id} s={s} idx={startIdx + i} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: selected services panel */}
            <div className="flex flex-col w-[340px] shrink-0 bg-muted/20">
              <div className="px-4 pt-3 pb-2 border-b shrink-0">
                <p className="text-sm font-semibold text-foreground">
                  Selected
                  {selectedCount > 0 && <Badge className="ml-2 h-5 px-1.5 text-xs">{selectedCount}</Badge>}
                </p>
                {selectedCount > 0 && (
                  <button onClick={() => setSelected(new Map())} className="text-xs text-muted-foreground hover:text-destructive mt-0.5 transition-colors">
                    Clear all
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {selectedCount === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-8">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <Plus className="h-5 w-5 opacity-40" />
                    </div>
                    <p className="text-xs text-center">Click services on the left to add them here</p>
                  </div>
                ) : (
                  selectedList.map(item => <SelectedCard key={item.service.id} {...item} currency={currency} onQuantityChange={updateQuantity} onPriceChange={updatePrice} onRemove={removeSelected} />)
                )}
              </div>
              <div className="shrink-0 p-3 border-t space-y-2">
                <FooterActions />
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════════
              MOBILE layout (below md / 768px) — single column
          ════════════════════════════════════════════════════════════════════ */}
          <div className="flex md:hidden flex-col flex-1 min-h-0 overflow-hidden">

            {/* Search bar — sticky */}
            <div className="px-3 pt-3 pb-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search services…"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setScrollTop(0); }}
                  className="pl-9 h-11 text-base"
                />
              </div>
            </div>

            {/* Category chips — horizontal scroll, no wrap */}
            <div
              className="flex gap-2 px-3 pb-2 shrink-0 overflow-x-auto"
              style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
            >
              <button
                onClick={() => { setActiveCategory(""); setScrollTop(0); }}
                className={`text-sm px-3 py-1.5 rounded-full border whitespace-nowrap shrink-0 transition-colors ${!activeCategory ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
              >
                All {services.length}
              </button>
              {categories.map(cat => {
                const count = services.filter(s => s.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => { setActiveCategory(cat === activeCategory ? "" : cat); setScrollTop(0); }}
                    className={`text-sm px-3 py-1.5 rounded-full border whitespace-nowrap shrink-0 transition-colors ${activeCategory === cat ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                  >
                    {CATEGORY_LABELS[cat] ?? cat.replace(/_/g, " ")} {count}
                  </button>
                );
              })}
            </div>

            {/* Results count */}
            <div className="px-3 pb-1 shrink-0">
              <p className="text-xs text-muted-foreground">
                {filteredServices.length} service{filteredServices.length !== 1 ? "s" : ""}
                {search ? ` matching "${search}"` : ""}
              </p>
            </div>

            {/* Service list — full width, virtualized */}
            <div
              ref={listRef}
              className="flex-1 overflow-y-auto px-2 pb-2"
              onScroll={handleScroll}
              style={{ overscrollBehavior: "contain" }}
            >
              {filteredServices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <Search className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No services found</p>
                  {search && <button className="text-xs text-primary underline" onClick={() => setSearch("")}>Clear search</button>}
                </div>
              ) : (
                <div style={{ height: totalH, position: "relative" }}>
                  {visibleServices.map((s, i) => (
                    <ServiceRow key={s.id} s={s} idx={startIdx + i} />
                  ))}
                </div>
              )}
            </div>

            {/* Selected summary bar + collapsible drawer */}
            {selectedCount > 0 && (
              <div className="shrink-0 border-t bg-background">
                {/* Drawer — shown when expanded */}
                {mobileSelectedOpen && (
                  <div className="max-h-52 overflow-y-auto px-3 py-2 space-y-2 border-b" style={{ overscrollBehavior: "contain" }}>
                    {selectedList.map(item => <SelectedCard key={item.service.id} {...item} currency={currency} onQuantityChange={updateQuantity} onPriceChange={updatePrice} onRemove={removeSelected} />)}
                  </div>
                )}
                {/* Summary bar */}
                <button
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium"
                  onClick={() => setMobileSelectedOpen(v => !v)}
                >
                  <span>
                    <Badge className="mr-2 h-5 px-1.5 text-xs">{selectedCount}</Badge>
                    {selectedCount} service{selectedCount !== 1 ? "s" : ""} selected
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {mobileSelectedOpen ? (
                      <><ChevronDown className="h-4 w-4" /> Hide</>
                    ) : (
                      <><ChevronUp className="h-4 w-4" /> View &amp; edit</>
                    )}
                  </span>
                </button>
              </div>
            )}

            {/* Sticky footer */}
            <div
              className="shrink-0 flex gap-2 px-3 py-3 border-t bg-background"
              style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
            >
              <Button variant="outline" className="flex-1 h-12 text-base" onClick={onClose}>
                Cancel
              </Button>
              {mode === "edit" ? (
                <Button className="flex-1 h-12 text-base gap-1.5" onClick={handleCreateNewInvoice} disabled={selectedCount === 0}>
                  {selectedCount > 0
                    ? `New Invoice (${selectedCount})`
                    : "Create New Invoice"}
                </Button>
              ) : (
                <Button className="flex-1 h-12 text-base gap-1.5" onClick={handleAddToInvoice} disabled={selectedCount === 0}>
                  {selectedCount > 0
                    ? `Add ${selectedCount} Service${selectedCount !== 1 ? "s" : ""}`
                    : "Add Services to Invoice"}
                </Button>
              )}
            </div>
          </div>

        </DialogContent>
      </Dialog>

      {/* ── Warning: add to existing invoice ── */}
      <AlertDialog open={showAddWarning} onOpenChange={setShowAddWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Adding to Existing Invoice
            </AlertDialogTitle>
            <AlertDialogDescription>
              This invoice already exists and may have payments or locked pricing. Adding new services will change the invoice total and balance.
              <br /><br />
              <strong>For additional services, creating a new invoice is recommended.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAddToInvoice} className="bg-amber-500 hover:bg-amber-600 text-white">
              Add Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Unsaved changes dialog ── */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in this invoice. What would you like to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => handleUnsavedChoice("cancel")}>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={() => handleUnsavedChoice("discard")}>Discard Changes &amp; Continue</Button>
            <AlertDialogAction onClick={() => handleUnsavedChoice("save")}>Save &amp; Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
