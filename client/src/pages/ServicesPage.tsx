import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Checkbox } from "@/components/ui/checkbox";
import { Edit2, Loader2, Percent, Plus, Settings2, Trash2, TrendingUp, Download, Upload, CheckSquare, ChevronDown, ChevronUp, Wrench, RefreshCw, Zap, Info, Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "consultation", label: "Consultations", icon: "👨‍⚕️" },
  { value: "lab_test", label: "Lab Tests", icon: "🧪" },
  { value: "radiology_test", label: "Radiology", icon: "🔬" },
  { value: "pathology_test", label: "Pathology", icon: "🧫" },
  { value: "other_test", label: "Others", icon: "📋" },
  { value: "procedure", label: "Procedures", icon: "⚕️" },
  { value: "medicine", label: "Medicines", icon: "💊" },
];

const CURRENCIES = ["USD", "EUR", "GBP", "SAR", "AED"];

const CATEGORY_PREFIX: Record<string, string> = {
  lab_test: "LAB",
  radiology_test: "RAD",
  pathology_test: "PATH",
  procedure: "PROC",
  consultation: "CONS",
  medicine: "MED",
  other_test: "OTHER",
};

function calcForeignPrice(localTRY: string | null | undefined, markupPct: number, rate: number): string {
  if (!localTRY) return "—";
  const base = parseFloat(localTRY);
  if (isNaN(base) || rate === 0) return "—";
  const withMarkup = base * (1 + markupPct / 100);
  return (withMarkup / rate).toFixed(2);
}

export default function ServicesPage() {
  const { data: services, isLoading, refetch } = trpc.services.list.useQuery({});
  const { data: settings } = trpc.settings.get.useQuery();
  // Live exchange rates from exchange_rates table (tryPerUnit: 1 foreign = X TRY)
  const { data: liveExchangeRates, refetch: refetchExchangeRates } = trpc.settings.getExchangeRates.useQuery();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [showAdd, setShowAdd] = useState(false);
  const [editService, setEditService] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showBulkAdjust, setShowBulkAdjust] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState("USD");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleSelect = (id: number) => setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const clearSelection = () => setSelectedIds(new Set());
  const [priceLegendOpen, setPriceLegendOpen] = useState(false);
  const [mobileCat, setMobileCat] = useState("consultation");

  const importServices = trpc.services.bulkImport.useMutation({
    onSuccess: (data) => { toast.success(`Imported ${(data as any).imported} services`); refetch(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const handleExportCSV = () => {
    if (!services || services.length === 0) return toast.error("No services to export");
    const headers = ["name", "category", "code", "localPriceTRY", "duration", "description", "preparationInstructions", "status"];
    const rows = services.map(s => [
      `"${(s.name ?? "").replace(/"/g, '""')}"`,
      s.category ?? "",
      s.code ?? "",
      s.localPriceTRY ?? s.price ?? "",
      s.duration ?? "",
      `"${(s.description ?? "").replace(/"/g, '""')}"`,
      `"${(s.preparationInstructions ?? "").replace(/"/g, '""')}"`,
      s.status ?? "active",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "services.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) return toast.error("CSV must have a header row and at least one data row");
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
      const nameIdx = headers.indexOf("name");
      const catIdx = headers.indexOf("category");
      const priceIdx = headers.indexOf("localpricetry");
      if (nameIdx === -1 || priceIdx === -1) return toast.error("CSV must have 'name' and 'localPriceTRY' columns");
      const importRows = lines.slice(1).map(line => {
        const cols = line.match(/(?:"([^"]*(?:""[^"]*)*)"|([^,]*))/g)?.map(c => c.replace(/^"|"$/g, "").replace(/""/g, '"')) ?? [];
        return {
          name: cols[nameIdx] ?? "",
          category: (cols[catIdx] ?? "other_test") as any,
          price: cols[priceIdx] ?? "0",
          localPriceTRY: cols[priceIdx] ?? "0",
          code: headers.indexOf("code") !== -1 ? cols[headers.indexOf("code")] : undefined,
          description: headers.indexOf("description") !== -1 ? cols[headers.indexOf("description")] : undefined,
          status: "active" as const,
        };
      }).filter(r => r.name);
      if (importRows.length === 0) return toast.error("No valid rows found in CSV");
      importServices.mutate({ services: importRows });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const deleteServiceMut = trpc.services.delete.useMutation({
    onSuccess: () => { toast.success("Service deleted"); refetch(); setDeleteConfirmId(null); },
    onError: (e) => toast.error(e.message || "Failed to delete service"),
  });

  const updateService = trpc.services.update.useMutation({
    onSuccess: () => { toast.success("Service updated"); refetch(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const bulkDeleteMut = trpc.services.bulkDelete.useMutation({
    onSuccess: (data: any) => { toast.success(`Deleted ${data.deleted} services`); refetch(); clearSelection(); },
    onError: (e) => toast.error(e.message || "Failed to delete services"),
  });
  const bulkStatusMut = trpc.services.bulkSetStatus.useMutation({
    onSuccess: (data: any) => { toast.success(`Updated ${data.updated} services`); refetch(); clearSelection(); },
    onError: (e) => toast.error(e.message || "Failed to update services"),
  });
  const markupPct = parseFloat(settings?.foreign_price_markup_pct ?? "30");
  // tryPerUnit: 1 [selectedCurrency] = rate TRY — use division to convert TRY → foreign
  const rate = liveExchangeRates?.rates?.[selectedCurrency]?.rate ?? 0;

  const byCategory = (cat: string) => services?.filter(s => s.category === cat) ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="space-y-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Services</h1>
            <p className="text-sm text-muted-foreground">{services?.length ?? 0} services configured</p>
          </div>
          {/* Mobile: + Add + Tools dropdown | Desktop: all buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <Button onClick={() => setShowAdd(true)} className="gap-2">
              <Plus className="h-4 w-4" /><span className="hidden sm:inline">Add Service</span>
            </Button>
            {/* Tools dropdown — visible on mobile only */}
            <div className="sm:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <Wrench className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={handleExportCSV}>
                    <Download className="h-4 w-4 mr-2" />Export CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => importInputRef.current?.click()} disabled={importServices.isPending}>
                    <Upload className="h-4 w-4 mr-2" />{importServices.isPending ? "Importing..." : "Import CSV"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowBulkAdjust(true)}>
                    <TrendingUp className="h-4 w-4 mr-2" />Adjust Prices
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowSettings(true)}>
                    <Settings2 className="h-4 w-4 mr-2" />Exchange Rates
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Desktop toolbar — hidden on mobile */}
        <div className="hidden sm:flex flex-wrap items-center gap-2">
          <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5" />Export CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => importInputRef.current?.click()} disabled={importServices.isPending}>
            <Upload className="h-3.5 w-3.5" />{importServices.isPending ? "Importing..." : "Import CSV"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowBulkAdjust(true)}>
            <TrendingUp className="h-3.5 w-3.5" />Adjust Prices
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowSettings(true)}>
            <Settings2 className="h-3.5 w-3.5" />Exchange Rates
          </Button>
        </div>

        {/* Mobile: currency selector row */}
        <div className="sm:hidden flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Currency:</span>
          <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <input ref={importInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />

      {/* Pricing legend — collapsible on mobile, always open on desktop */}
      <div className="bg-muted/40 rounded-lg overflow-hidden">
        {/* Mobile toggle header */}
        <button
          className="sm:hidden w-full flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground"
          onClick={() => setPriceLegendOpen(v => !v)}
        >
          <span className="font-medium">Price rules</span>
          {priceLegendOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {/* Legend content — always visible on desktop, toggled on mobile */}
        <div className={`flex flex-wrap gap-3 text-xs text-muted-foreground px-4 py-2.5 ${
          priceLegendOpen ? "block" : "hidden sm:flex"
        }`}>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Local Price (TRY) — cash</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />Foreign Price ({selectedCurrency}) — local TRY +{markupPct}% markup, converted</span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Tabs value={mobileCat} onValueChange={setMobileCat} defaultValue="consultation">
          {/* Desktop tabs: flex-wrap */}
          <TabsList className="hidden sm:flex flex-wrap h-auto gap-1 w-full">
            {CATEGORIES.map(c => (
              <TabsTrigger key={c.value} value={c.value} className="text-xs">
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {/* Mobile: category dropdown selector */}
          <div className="sm:hidden space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Category:</p>
            <Select value={mobileCat} onValueChange={setMobileCat}>
              <SelectTrigger className="w-full h-10 text-sm font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value} className="text-sm">
                    {c.icon} {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {CATEGORIES.map(cat => (
            <TabsContent key={cat.value} value={cat.value} className="space-y-3 mt-4">
              {selectedIds.size > 0 && isAdmin && (
                <div className="flex items-center gap-2 bg-muted/60 rounded-lg px-4 py-2.5 border">
                  <CheckSquare className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">{selectedIds.size} selected</span>
                  <div className="flex gap-2 ml-auto">
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => bulkStatusMut.mutate({ ids: Array.from(selectedIds), status: "active" })} disabled={bulkStatusMut.isPending}>
                      Activate All
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => bulkStatusMut.mutate({ ids: Array.from(selectedIds), status: "inactive" })} disabled={bulkStatusMut.isPending}>
                      Deactivate All
                    </Button>
                    <Button size="sm" variant="destructive" className="h-7 text-xs gap-1"
                      onClick={() => { if (confirm(`Delete ${selectedIds.size} services?`)) bulkDeleteMut.mutate({ ids: Array.from(selectedIds) }); }} disabled={bulkDeleteMut.isPending}>
                      <Trash2 className="h-3 w-3" />Delete All
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearSelection}>Clear</Button>
                  </div>
                </div>
              )}
              {byCategory(cat.value).length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <p className="text-muted-foreground text-sm">No {cat.label.toLowerCase()} configured</p>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
                    <Plus className="h-3.5 w-3.5" />Add {cat.label.replace(/s$/, "")} Service
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3">
                  {byCategory(cat.value).map(service => {
                    const localTRY = service.localPriceTRY ?? service.price;
                    const foreignPrice = calcForeignPrice(localTRY, markupPct, rate);
                    return (
                      <Card key={service.id} className={selectedIds.has(service.id) ? "ring-2 ring-primary" : ""}>
                        {/* ── Desktop layout (sm+): side-by-side ── */}
                        <CardContent className="hidden sm:flex p-4 items-start gap-4">
                          {isAdmin && <Checkbox className="mt-0.5 shrink-0" checked={selectedIds.has(service.id)} onCheckedChange={() => toggleSelect(service.id)} />}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm">{service.name}</p>
                              {service.code && <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{service.code}</span>}
                              <Badge variant={service.status === "active" ? "default" : "secondary"} className="text-[10px] h-4">{service.status}</Badge>
                            </div>
                            {service.description && <p className="text-xs text-muted-foreground mt-0.5">{service.description}</p>}
                            {service.preparationInstructions && (
                              <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded mt-1.5">Prep: {service.preparationInstructions}</p>
                            )}
                            {service.duration && <p className="text-xs text-muted-foreground mt-0.5">Duration: {service.duration} min</p>}
                          </div>
                          <div className="text-right shrink-0 space-y-1 min-w-[180px]">
                            <div className="space-y-0.5">
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Local (TRY)</p>
                              <p className="text-base font-bold text-blue-600">₺{Number(localTRY).toLocaleString()}</p>
                            </div>
                            <div className="space-y-0.5 border-t pt-1">
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Foreign ({selectedCurrency})</p>
                              <div className="flex items-center gap-1">
                                <p className="text-base font-bold text-purple-600">{selectedCurrency} {foreignPrice}</p>
                                {rate > 0 && localTRY && foreignPrice !== "—" && (
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button type="button" className="text-muted-foreground hover:text-foreground">
                                          <Info className="h-3 w-3" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="left" className="text-xs max-w-[220px] space-y-0.5 p-3">
                                        <p className="font-semibold mb-1">Price Breakdown</p>
                                        <p>₺{Number(localTRY).toLocaleString()} TRY (local)</p>
                                        {markupPct > 0 && <p>+ {markupPct}% markup = ₺{(parseFloat(localTRY) * (1 + markupPct / 100)).toFixed(2)} TRY</p>}
                                        <p>÷ {rate.toFixed(2)} (1 {selectedCurrency} = {rate.toFixed(2)} TRY)</p>
                                        <p className="font-semibold border-t pt-1 mt-1">= {selectedCurrency} {foreignPrice}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1 mt-2 justify-end">
                              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => setEditService(service)}><Edit2 className="h-3 w-3" />Edit</Button>
                              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => updateService.mutate({ id: service.id, data: { status: service.status === "active" ? "inactive" : "active" } })}>{service.status === "active" ? "Deactivate" : "Activate"}</Button>
                              {isAdmin && <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => setDeleteConfirmId(service.id)}><Trash2 className="h-3 w-3" />Delete</Button>}
                            </div>
                          </div>
                        </CardContent>

                        {/* ── Mobile layout: stacked ── */}
                        <CardContent className="sm:hidden p-4 space-y-3">
                          {/* Row 1: checkbox + name */}
                          <div className="flex items-start gap-2.5">
                            {isAdmin && <Checkbox className="mt-0.5 shrink-0" checked={selectedIds.has(service.id)} onCheckedChange={() => toggleSelect(service.id)} />}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm leading-snug">{service.name}</p>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {service.code && <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{service.code}</span>}
                                <Badge variant={service.status === "active" ? "default" : "secondary"} className="text-[10px] h-4">{service.status}</Badge>
                              </div>
                            </div>
                          </div>
                          {/* Row 2: description + prep + duration */}
                          {(service.description || service.preparationInstructions || service.duration) && (
                            <div className="space-y-1">
                              {service.description && <p className="text-xs text-muted-foreground">{service.description}</p>}
                              {service.preparationInstructions && (
                                <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">Prep: {service.preparationInstructions}</p>
                              )}
                              {service.duration && <p className="text-xs text-muted-foreground">Duration: {service.duration} min</p>}
                            </div>
                          )}
                          {/* Row 3: prices */}
                          <div className="grid grid-cols-2 gap-2 bg-muted/30 rounded-lg p-2.5">
                            <div>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Local (TRY)</p>
                              <p className="text-sm font-bold text-blue-600">₺{Number(localTRY).toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Foreign ({selectedCurrency})</p>
                              <p className="text-sm font-bold text-purple-600">{selectedCurrency} {foreignPrice}</p>
                            </div>
                          </div>
                          {/* Row 4: Actions dropdown */}
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                                  Actions <ChevronDown className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={() => setEditService(service)}>
                                  <Edit2 className="h-4 w-4 mr-2" />Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => updateService.mutate({ id: service.id, data: { status: service.status === "active" ? "inactive" : "active" } })}>
                                  {service.status === "active" ? "Deactivate" : "Activate"}
                                </DropdownMenuItem>
                                {isAdmin && (
                                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteConfirmId(service.id)}>
                                    <Trash2 className="h-4 w-4 mr-2" />Delete
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <AddServiceModal open={showAdd} onClose={() => setShowAdd(false)} onSuccess={() => { refetch(); setShowAdd(false); }} />
      {editService && (
        <EditServiceModal service={editService} onClose={() => setEditService(null)} onSuccess={() => { refetch(); setEditService(null); }} />
      )}
      <ExchangeRatesModal open={showSettings} onClose={() => setShowSettings(false)} settings={settings} onSuccess={() => { refetchExchangeRates(); setShowSettings(false); }} />
      <BulkAdjustModal open={showBulkAdjust} onClose={() => setShowBulkAdjust(false)} onSuccess={() => { refetch(); setShowBulkAdjust(false); }} />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Service</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to permanently delete this service? This action cannot be undone.</p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteServiceMut.isPending}
              onClick={() => deleteConfirmId !== null && deleteServiceMut.mutate({ id: deleteConfirmId })}>
              {deleteServiceMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Add Service Modal ────────────────────────────────────────────────────────
function AddServiceModal({ open, onClose, onSuccess }: any) {
  const { data: activeTaxRules = [] } = trpc.services.taxRules.list.useQuery({ includeInactive: false }, { enabled: open });
  const { data: categoryTaxDefaults = [] } = trpc.services.categoryTaxDefaults.list.useQuery(undefined, { enabled: open });
  const createService = trpc.services.create.useMutation({
    onSuccess: () => { toast.success("Service created"); onSuccess(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });
  const aiAutofill = trpc.services.aiAutofill.useMutation({
    onSuccess: (data) => {
      setForm(prev => ({
        ...prev,
        description: data.description || prev.description,
        preparationInstructions: data.preparationInstructions || prev.preparationInstructions,
        duration: data.duration != null ? String(data.duration) : prev.duration,
        category: data.category || prev.category,
        // code is NOT filled by AI — it is auto-generated by the system
      }));
      toast.success("AI fields generated — review before saving");
    },
    onError: (e) => toast.error(e.message || "AI autofill failed"),
  });
  const [form, setForm] = useState({
    name: "", category: "lab_test" as string, description: "", price: "",
    localPriceTRY: "", duration: "", preparationInstructions: "", code: "",
    taxOverrideMode: "inherit" as "inherit" | "rule" | "no_tax", taxOverrideRuleId: "",
  });
  const categoryDefaultRuleId = (categoryTaxDefaults as any[]).find(row => row.category === form.category)?.taxRuleId;
  const categoryDefaultRule = (activeTaxRules as any[]).find(rule => rule.id === categoryDefaultRuleId);

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Service</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Name + AI button row */}
            <div className="col-span-2 space-y-1.5">
              <Label>Name *</Label>
              <div className="flex gap-2">
                <Input className="flex-1" value={form.name} onChange={f("name")} placeholder="e.g. FSH Blood Test" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5 text-purple-700 border-purple-300 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-700 dark:hover:bg-purple-950/30"
                  disabled={!form.name.trim() || aiAutofill.isPending}
                  onClick={() => aiAutofill.mutate({ name: form.name, existingCategory: form.category })}
                >
                  {aiAutofill.isPending
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating...</>
                    : <><Sparkles className="h-3.5 w-3.5" />Generate with AI</>}
                </Button>
              </div>
              {aiAutofill.isPending && (
                <p className="text-xs text-purple-600 animate-pulse">AI is generating fields based on the service name…</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(prev => ({ ...prev, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Code <span className="text-xs text-muted-foreground">(auto-generated if empty)</span></Label>
              <Input
                value={form.code}
                onChange={f("code")}
                placeholder={`e.g. ${CATEGORY_PREFIX[form.category] ?? "SVC"}-001`}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Local Price (TRY) *</Label>
              <Input type="number" value={form.localPriceTRY || form.price} onChange={e => setForm(prev => ({ ...prev, localPriceTRY: e.target.value, price: e.target.value }))} placeholder="₺" />
            </div>
            <div className="space-y-1.5">
              <Label>Duration (min)</Label>
              <Input type="number" value={form.duration} onChange={f("duration")} />
            </div>
            <div className="col-span-2 space-y-2 rounded-lg border bg-muted/20 p-3">
              <div>
                <Label>Tax Treatment</Label>
                <p className="text-xs text-muted-foreground">Service prices remain pre-Tax. This controls only the suggested Tax on future invoice lines.</p>
              </div>
              <Select value={form.taxOverrideMode} onValueChange={value => setForm(prev => ({ ...prev, taxOverrideMode: value as typeof prev.taxOverrideMode, taxOverrideRuleId: value === "rule" ? prev.taxOverrideRuleId : "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">Inherit Category Default</SelectItem>
                  <SelectItem value="no_tax">No Tax</SelectItem>
                  <SelectItem value="rule">Specific Tax Rule</SelectItem>
                </SelectContent>
              </Select>
              {form.taxOverrideMode === "inherit" && <p className="text-xs text-muted-foreground">Category Default: {categoryDefaultRule ? `${categoryDefaultRule.label} (${Number(categoryDefaultRule.ratePercent).toFixed(2)}%)` : "No Tax"}</p>}
              {form.taxOverrideMode === "rule" && <Select value={form.taxOverrideRuleId} onValueChange={value => setForm(prev => ({ ...prev, taxOverrideRuleId: value }))}>
                <SelectTrigger><SelectValue placeholder="Choose active Tax Rule" /></SelectTrigger>
                <SelectContent>{(activeTaxRules as any[]).map(rule => <SelectItem key={rule.id} value={String(rule.id)}>{rule.label} ({Number(rule.ratePercent).toFixed(2)}%)</SelectItem>)}</SelectContent>
              </Select>}
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={f("description")} rows={2} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Preparation Instructions</Label>
              <Input value={form.preparationInstructions} onChange={f("preparationInstructions")} placeholder="e.g. Fasting 8 hours required" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => createService.mutate({
                ...form,
                price: form.localPriceTRY || form.price,
                duration: form.duration ? parseInt(form.duration) : undefined,
                category: form.category as any,
                taxOverrideMode: form.taxOverrideMode,
                taxOverrideRuleId: form.taxOverrideMode === "rule" && form.taxOverrideRuleId ? Number(form.taxOverrideRuleId) : null,
              })}
              disabled={!form.name || !(form.localPriceTRY || form.price) || (form.taxOverrideMode === "rule" && !form.taxOverrideRuleId) || createService.isPending}
            >
              {createService.isPending ? "Creating..." : "Create Service"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
// ─── Edit Service Modal ───────────────────────────────────────────────────────
function EditServiceModal({ service, onClose, onSuccess }: any) {
  const { data: activeTaxRules = [] } = trpc.services.taxRules.list.useQuery({ includeInactive: false });
  const { data: categoryTaxDefaults = [] } = trpc.services.categoryTaxDefaults.list.useQuery();
  const updateService = trpc.services.update.useMutation({
    onSuccess: () => { toast.success("Service updated"); onSuccess(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });
  const aiAutofill = trpc.services.aiAutofill.useMutation({
    onSuccess: (data) => {
      setForm(prev => ({
        ...prev,
        description: data.description || prev.description,
        preparationInstructions: data.preparationInstructions || prev.preparationInstructions,
        duration: data.duration != null ? String(data.duration) : prev.duration,
        // Do NOT overwrite category or code in edit mode — code is auto-generated by system, never by AI
      }));
      toast.success("AI fields generated — review before saving");
    },
    onError: (e) => toast.error(e.message || "AI autofill failed"),
  });
  const [form, setForm] = useState({
    name: service.name ?? "",
    description: service.description ?? "",
    price: service.price ?? "",
    localPriceTRY: service.localPriceTRY ?? service.price ?? "",
    duration: service.duration ? String(service.duration) : "",
    preparationInstructions: service.preparationInstructions ?? "",
    code: service.code ?? "",
    status: service.status ?? "active",
    taxOverrideMode: (service.taxOverrideMode ?? "inherit") as "inherit" | "rule" | "no_tax",
    taxOverrideRuleId: service.taxOverrideRuleId == null ? "" : String(service.taxOverrideRuleId),
  });
  const categoryDefaultRuleId = (categoryTaxDefaults as any[]).find(row => row.category === service.category)?.taxRuleId;
  const categoryDefaultRule = (activeTaxRules as any[]).find(rule => rule.id === categoryDefaultRuleId);

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit Service — {service.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Name + AI button row */}
            <div className="col-span-2 space-y-1.5">
              <Label>Name *</Label>
              <div className="flex gap-2">
                <Input className="flex-1" value={form.name} onChange={f("name")} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5 text-purple-700 border-purple-300 hover:bg-purple-50 dark:text-purple-400 dark:border-purple-700 dark:hover:bg-purple-950/30"
                  disabled={!form.name.trim() || aiAutofill.isPending}
                  onClick={() => aiAutofill.mutate({ name: form.name, existingCategory: service.category })}
                >
                  {aiAutofill.isPending
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating...</>
                    : <><Sparkles className="h-3.5 w-3.5" />Generate with AI</>}
                </Button>
              </div>
              {aiAutofill.isPending && (
                <p className="text-xs text-purple-600 animate-pulse">AI is generating fields based on the service name…</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input value={form.code} onChange={f("code")} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(prev => ({ ...prev, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Local Price (TRY) *</Label>
              <Input type="number" value={form.localPriceTRY} onChange={e => setForm(prev => ({ ...prev, localPriceTRY: e.target.value, price: e.target.value }))} placeholder="₺" />
            </div>
            <div className="space-y-1.5">
              <Label>Duration (min)</Label>
              <Input type="number" value={form.duration} onChange={f("duration")} />
            </div>
            <div className="col-span-2 space-y-2 rounded-lg border bg-muted/20 p-3">
              <div>
                <Label>Tax Treatment</Label>
                <p className="text-xs text-muted-foreground">Affects only future invoice suggestions. Saved invoice Tax snapshots remain unchanged.</p>
              </div>
              <Select value={form.taxOverrideMode} onValueChange={value => setForm(prev => ({ ...prev, taxOverrideMode: value as typeof prev.taxOverrideMode, taxOverrideRuleId: value === "rule" ? prev.taxOverrideRuleId : "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">Inherit Category Default</SelectItem>
                  <SelectItem value="no_tax">No Tax</SelectItem>
                  <SelectItem value="rule">Specific Tax Rule</SelectItem>
                </SelectContent>
              </Select>
              {form.taxOverrideMode === "inherit" && <p className="text-xs text-muted-foreground">Category Default: {categoryDefaultRule ? `${categoryDefaultRule.label} (${Number(categoryDefaultRule.ratePercent).toFixed(2)}%)` : "No Tax"}</p>}
              {form.taxOverrideMode === "rule" && <Select value={form.taxOverrideRuleId} onValueChange={value => setForm(prev => ({ ...prev, taxOverrideRuleId: value }))}>
                <SelectTrigger><SelectValue placeholder="Choose active Tax Rule" /></SelectTrigger>
                <SelectContent>{(activeTaxRules as any[]).map(rule => <SelectItem key={rule.id} value={String(rule.id)}>{rule.label} ({Number(rule.ratePercent).toFixed(2)}%)</SelectItem>)}</SelectContent>
              </Select>}
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={f("description")} rows={2} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Preparation Instructions</Label>
              <Input value={form.preparationInstructions} onChange={f("preparationInstructions")} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => updateService.mutate({
                id: service.id,
                data: {
                  name: form.name,
                  code: form.code || undefined,
                  description: form.description || undefined,
                  price: form.localPriceTRY || form.price,
                  localPriceTRY: form.localPriceTRY || form.price,
                  duration: form.duration ? parseInt(form.duration) : undefined,
                  preparationInstructions: form.preparationInstructions || undefined,
                  status: form.status as any,
                  taxOverrideMode: form.taxOverrideMode,
                  taxOverrideRuleId: form.taxOverrideMode === "rule" && form.taxOverrideRuleId ? Number(form.taxOverrideRuleId) : null,
                },
              })}
              disabled={!form.name || (form.taxOverrideMode === "rule" && !form.taxOverrideRuleId) || updateService.isPending}
            >
              {updateService.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Exchange Rates Modal ─────────────────────────────────────────────────────
function ExchangeRatesModal({ open, onClose, settings, onSuccess }: any) {
  const utils = trpc.useUtils();
  const { data: taxRules = [], refetch: refetchTaxRules } = trpc.services.taxRules.list.useQuery({ includeInactive: true }, { enabled: open });
  const { data: categoryTaxDefaults = [], refetch: refetchCategoryTaxDefaults } = trpc.services.categoryTaxDefaults.list.useQuery(undefined, { enabled: open });
  const createTaxRule = trpc.services.taxRules.create.useMutation({
    onSuccess: () => { toast.success("Tax rule created"); refetchTaxRules(); },
    onError: (e) => toast.error(e.message || "Unable to create Tax rule."),
  });
  const updateTaxRule = trpc.services.taxRules.update.useMutation({
    onSuccess: () => { toast.success("Tax rule updated"); refetchTaxRules(); },
    onError: (e) => toast.error(e.message || "Unable to update Tax rule."),
  });
  const setCategoryTaxDefault = trpc.services.categoryTaxDefaults.set.useMutation({
    onSuccess: () => { toast.success("Category Tax default saved"); refetchCategoryTaxDefaults(); },
    onError: (e) => toast.error(e.message || "Unable to save Category Tax default."),
  });

  // New: fetch from exchange_rates table with full metadata
  const { data: liveRates, refetch: refetchLiveRates } = trpc.settings.getExchangeRates.useQuery(undefined, { enabled: open });

  const bulkSet = trpc.settings.bulkSetExchangeRates.useMutation({
    onSuccess: () => {
      toast.success("Pricing rules updated");
      utils.settings.get.invalidate();
      utils.settings.getExchangeRates.invalidate(); // Refresh rates in parent ServicesPage immediately
      onSuccess();
    },
    onError: (e) => { toast.error((e as any)?.message || "Something went wrong."); },
  });
  const setManualRate = trpc.settings.setManualRate.useMutation({
    onSuccess: (_, vars) => { toast.success(`${vars.currency} rate saved manually`); refetchLiveRates(); utils.settings.get.invalidate(); },
    onError: (e) => { toast.error(e.message || "Failed to save rate"); },
  });
  const clearManualRate = trpc.settings.clearManualRate.useMutation({
    onSuccess: (_, vars) => { toast.success(`${vars.currency} manual override cleared — will auto-update`); refetchLiveRates(); },
    onError: (e) => { toast.error(e.message || "Failed to clear override"); },
  });
  const fetchLive = trpc.settings.fetchLiveRates.useMutation({
    onSuccess: (data) => {
      const msg = data.missingCurrencies?.length
        ? `Rates fetched from ${data.source}. Missing: ${data.missingCurrencies.join(", ")} — add manually.`
        : `Live rates fetched from ${data.source} (${data.rateDate})`;
      toast.success(msg);
      refetchLiveRates();
      utils.settings.get.invalidate();
      utils.settings.getExchangeRates.invalidate(); // Refresh rates in parent ServicesPage immediately
    },
    onError: (e) => { toast.error(e.message || "Failed to fetch live rates"); },
  });
  const setAutoUpdate = trpc.settings.setAutoUpdate.useMutation({
    onSuccess: (data) => {
      toast.success(data.enabled ? "Auto-update enabled \u2014 rates will update daily" : "Auto-update disabled");
      utils.settings.get.invalidate();
    },
    onError: (e) => { toast.error(e.message || "Failed to update setting"); },
  });

  const [autoEnabled, setAutoEnabled] = useState(settings?.auto_exchange_rates_enabled === "true");
  const [pricingRules, setPricingRules] = useState({
    foreignMarkupPct: settings?.foreign_price_markup_pct ?? "30",
    cardSurchargePct: settings?.card_surcharge_pct ?? "23",
  });
  // Per-currency manual edit state
  const [editingRates, setEditingRates] = useState<Record<string, string>>({});
  const [editingCur, setEditingCur] = useState<string | null>(null);
  const [newTaxLabel, setNewTaxLabel] = useState("");
  const [newTaxRate, setNewTaxRate] = useState("");

  useEffect(() => {
    if (open && settings) {
      setAutoEnabled(settings.auto_exchange_rates_enabled === "true");
      setPricingRules({
        foreignMarkupPct: settings.foreign_price_markup_pct ?? "30",
        cardSurchargePct: settings.card_surcharge_pct ?? "23",
      });
    }
  }, [open, settings]);

  function getRate(cur: string): string {
    const row = liveRates?.rates?.[cur];
    if (!row || !row.rate) return "—";
    // Display 2-4 decimal places (trim trailing zeros after 2nd decimal)
    const n = row.rate;
    if (n >= 10) return n.toFixed(2);        // e.g. 46.49
    if (n >= 1) return n.toFixed(3);         // e.g. 1.234
    return n.toFixed(4);                     // e.g. 0.0215 (shouldn't happen with correct direction)
  }
  function getMeta(cur: string) {
    return liveRates?.rates?.[cur];
  }

  return (
<Dialog open={open} onOpenChange={(v) => { if (!v) { (document.activeElement as HTMLElement)?.blur(); onClose(); } }}>
      <DialogContent className="max-w-md flex flex-col p-0 gap-0 max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-4rem)]">
        {/* Sticky header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2"><Settings2 className="h-4 w-4" />Exchange Rates & Pricing Rules</DialogTitle>
        </DialogHeader>
        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Stale warning */}
          {liveRates?.stale && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5">
              <span className="text-amber-600 text-sm">\u26a0\ufe0f</span>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {liveRates.fetchError ?? "Exchange rates may be outdated. Please fetch live rates."}
              </p>
            </div>
          )}

          {/* Auto-update toggle card */}
          <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30">
            <CardContent className="px-4 py-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium">Auto-update daily</p>
                    <p className="text-xs text-muted-foreground">Frankfurter API (fallback: ExchangeRate-API)</p>
                  </div>
                </div>
                <Switch
                  checked={autoEnabled}
                  onCheckedChange={(checked) => { setAutoEnabled(checked); setAutoUpdate.mutate({ enabled: checked }); }}
                  disabled={setAutoUpdate.isPending}
                />
              </div>
              <Button
                variant="outline" size="sm"
                className="w-full gap-2 text-blue-700 border-blue-300 hover:bg-blue-100"
                onClick={() => fetchLive.mutate()}
                disabled={fetchLive.isPending}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${fetchLive.isPending ? 'animate-spin' : ''}`} />
                {fetchLive.isPending ? "Fetching live rates..." : "Fetch live rates now"}
              </Button>
            </CardContent>
          </Card>

          {/* Exchange Rates — one row per currency with metadata */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm">Exchange Rates</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">All values mean: 1 [currency] = X TRY &middot; Manual override locks from auto-update</p>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-4">
              {CURRENCIES.map(cur => {
                const meta = getMeta(cur);
                const isManual = meta?.isManualOverride ?? false;
                const isEditing = editingCur === cur;
                const editVal = parseFloat(editingRates[cur] ?? "");
                // Warn if value looks inverted (< 1 TRY for major currencies)
                const isLikelyInverted = !isNaN(editVal) && editVal > 0 && editVal < 1;
                return (
                  <div key={cur} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-sm font-semibold">1 {cur} =</Label>
                        {isManual && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300">Manual</span>
                        )}
                        {!isManual && meta?.sourceProvider && (
                          <span className="text-[10px] text-muted-foreground">{meta.sourceProvider}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {isManual && (
                          <button
                            className="text-xs text-muted-foreground underline hover:text-foreground"
                            onClick={() => clearManualRate.mutate({ currency: cur })}
                            disabled={clearManualRate.isPending}
                          >Clear override</button>
                        )}
                        {!isEditing && (
                          <button
                            className="text-xs text-blue-600 underline hover:text-blue-800 ml-1"
                            onClick={() => { setEditingCur(cur); setEditingRates(prev => ({ ...prev, [cur]: getRate(cur) })); }}
                          >Edit</button>
                        )}
                      </div>
                    </div>
                    {isEditing ? (
                      <div className="space-y-1">
                        <div className="flex gap-1.5">
                          <div className="relative flex-1">
                            <Input
                              type="number" step="0.01" autoFocus
                              className="h-9 pr-10" style={{ fontSize: '16px' }}
                              value={editingRates[cur] ?? ""}
                              onChange={e => setEditingRates(prev => ({ ...prev, [cur]: e.target.value }))}
                              placeholder={`e.g. 46.30`}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">TRY</span>
                          </div>
                          <Button size="sm" className="h-9 px-3"
                            onClick={() => {
                              const val = parseFloat(editingRates[cur]);
                              if (!isNaN(val) && val > 0) { setManualRate.mutate({ currency: cur, rate: val }); }
                              setEditingCur(null);
                            }}
                            disabled={setManualRate.isPending}
                          >Save</Button>
                          <Button size="sm" variant="outline" className="h-9 px-3" onClick={() => setEditingCur(null)}>✕</Button>
                        </div>
                        {isLikelyInverted && (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                            ⚠️ This rate looks inverted. Expected TRY per 1 {cur} (e.g. 46.30), not a fraction.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                        <span className="text-sm font-mono font-medium">
                          {getRate(cur) !== "—" ? `${getRate(cur)} TRY` : (
                            <span className="text-muted-foreground text-xs">
                              Not set — {["SAR","AED"].includes(cur) ? "click Fetch live rates" : "click Edit"}
                            </span>
                          )}
                        </span>
                        {meta?.rateDate && (
                          <span className="text-xs text-muted-foreground">{meta.rateDate}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Pricing Rules */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Pricing Rules</CardTitle></CardHeader>
            <CardContent className="px-4 pb-3 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Foreign Patient Markup %</Label>
                <div className="flex items-center gap-1.5">
                  <Input type="number" className="h-10 flex-1" style={{ fontSize: '16px' }} value={pricingRules.foreignMarkupPct}
                    onChange={e => setPricingRules(prev => ({ ...prev, foreignMarkupPct: e.target.value }))} />
                  <span className="text-sm text-muted-foreground font-medium">%</span>
                </div>
              </div>
              <div className="border-t pt-3 space-y-3">
                <div>
                  <p className="text-sm font-medium">Service Tax Rules</p>
                  <p className="text-xs text-muted-foreground">Rules are snapshotted on new invoice lines. Editing a rule never changes issued invoices.</p>
                </div>
                <div className="grid grid-cols-[1fr_6rem_auto] gap-2">
                  <Input value={newTaxLabel} onChange={e => setNewTaxLabel(e.target.value)} placeholder="Tax label" className="h-9" />
                  <Input type="number" min="0" max="100" step="0.01" value={newTaxRate} onChange={e => setNewTaxRate(e.target.value)} placeholder="Rate %" className="h-9" />
                  <Button size="sm" className="h-9" disabled={createTaxRule.isPending || !newTaxLabel.trim() || Number(newTaxRate) < 0} onClick={() => createTaxRule.mutate({ label: newTaxLabel.trim(), ratePercent: Number(newTaxRate), isActive: true })}>Add</Button>
                </div>
                <div className="space-y-1">
                  {(taxRules as any[]).map(rule => <div key={rule.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs">
                    <span className={rule.isActive ? "font-medium" : "text-muted-foreground line-through"}>{rule.label} · {Number(rule.ratePercent).toFixed(2)}%</span>
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={updateTaxRule.isPending} onClick={() => updateTaxRule.mutate({ id: rule.id, data: { isActive: !rule.isActive } })}>{rule.isActive ? "Deactivate" : "Activate"}</Button>
                  </div>)}
                  {taxRules.length === 0 && <p className="text-xs text-muted-foreground">No Tax rules yet. New invoice lines default to No Tax.</p>}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Category Default Tax</p>
                  {CATEGORIES.map(category => {
                    const current = (categoryTaxDefaults as any[]).find(row => row.category === category.value)?.taxRuleId;
                    return <div key={category.value} className="grid grid-cols-[1fr_10rem] items-center gap-2 text-xs"><span>{category.label}</span><Select value={current == null ? "none" : String(current)} onValueChange={value => setCategoryTaxDefault.mutate({ category: category.value as any, taxRuleId: value === "none" ? null : Number(value) })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No Tax</SelectItem>{(taxRules as any[]).filter(rule => rule.isActive).map(rule => <SelectItem key={rule.id} value={String(rule.id)}>{rule.label} ({Number(rule.ratePercent).toFixed(2)}%)</SelectItem>)}</SelectContent></Select></div>;
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="h-4" />
        </div>
        {/* Sticky footer */}
        <div
          className="flex gap-2 px-5 pt-4 border-t shrink-0 bg-background"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <Button variant="outline" className="flex-1" onClick={() => { (document.activeElement as HTMLElement)?.blur(); onClose(); }}>Cancel</Button>
          <Button className="flex-1" onClick={() => bulkSet.mutate(pricingRules)} disabled={bulkSet.isPending}>
            {bulkSet.isPending ? "Saving..." : "Save Rules"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk Price Adjustment Modal ──────────────────────────────────────────────
function BulkAdjustModal({ open, onClose, onSuccess }: any) {
  const bulkAdjust = trpc.settings.bulkAdjustPrices.useMutation({
    onSuccess: (data) => { toast.success(`${data.updated} service prices updated`); onSuccess(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });
  const [category, setCategory] = useState<string>("all");
  const [pct, setPct] = useState("10");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" />Global Price Adjustment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Adjust the base (TRY) price for all services in a category by a percentage. Foreign prices will update automatically.</p>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Adjustment %</Label>
            <div className="flex items-center gap-2">
              <Input type="number" value={pct} onChange={e => setPct(e.target.value)} className="h-9" placeholder="e.g. 10 or -5" />
              <Percent className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
            <p className="text-xs text-muted-foreground">Use positive values to increase, negative to decrease (e.g. -5 for a 5% reduction)</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => bulkAdjust.mutate({ category: category as any, pct: parseFloat(pct) })}
              disabled={!pct || isNaN(parseFloat(pct)) || bulkAdjust.isPending}
            >
              {bulkAdjust.isPending ? "Adjusting..." : "Apply Adjustment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
