import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { format } from "date-fns";
import { AlertCircle, CheckCircle2, DollarSign, Download, FileText, Loader2, MoreHorizontal, Search, Trash2, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

function formatInvoiceMoney(currency: string | null | undefined, value: unknown) {
  const code = currency || "USD";
  return `${code} ${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function groupInvoiceTotalsByCurrency(invoices: Array<{ currency?: string | null; totalAmount: unknown }>) {
  const totals = new Map<string, number>();
  for (const invoice of invoices) {
    const code = invoice.currency || "USD";
    totals.set(code, (totals.get(code) ?? 0) + Number(invoice.totalAmount ?? 0));
  }
  return Array.from(totals.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, total]) => formatInvoiceMoney(currency, total))
    .join(" · ");
}

export default function FinancePage() {
  const { user } = useAuth();
  const { data: stats } = trpc.finance.stats.useQuery();
  const [financialScope, setFinancialScope] = useState<"production" | "test" | "all">("production");
  const isAdmin = user?.role === "admin";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [issueDateFrom, setIssueDateFrom] = useState("");
  const [issueDateTo, setIssueDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(20);
  const [classifyTarget, setClassifyTarget] = useState<{ id: number; number: string } | null>(null);
  const [classificationReason, setClassificationReason] = useState("");
  const effectiveScope = isAdmin ? financialScope : "production";
  const dateRangeInvalid = Boolean(issueDateFrom && issueDateTo && issueDateFrom > issueDateTo);
  const listFilters = useMemo(() => ({
    scope: effectiveScope,
    search: search.trim() || undefined,
    status: statusFilter as "all" | "draft" | "issued" | "paid" | "partial" | "overdue" | "cancelled",
    issueDateFrom: issueDateFrom || undefined,
    issueDateTo: issueDateTo || undefined,
  }), [effectiveScope, search, statusFilter, issueDateFrom, issueDateTo]);
  const { data: invoiceList, isLoading, isFetching, error: invoiceListError, refetch } = trpc.finance.invoiceList.useQuery(
    { ...listFilters, page, pageSize },
    { enabled: !dateRangeInvalid },
  );
  const invoiceExport = trpc.finance.invoiceListExport.useQuery(listFilters, { enabled: false });
  const { data: offers } = trpc.finance.offers.useQuery({});
  const invoices = invoiceList?.data ?? [];
  const totalInvoices = invoiceList?.total ?? 0;
  const totalPages = invoiceList?.totalPages ?? 0;
  const currentPage = invoiceList?.page ?? page;

  // Delete state
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteConfirmNumber, setDeleteConfirmNumber] = useState<string>("");

  const deleteInvoice = trpc.finance.deleteInvoice.useMutation({
    onSuccess: () => { toast.success("Invoice deleted successfully"); refetch(); setDeleteConfirmId(null); },
    onError: (e) => toast.error(e.message || "Failed to delete invoice"),
  });

  const updateStatus = trpc.finance.updateInvoiceStatus.useMutation({
    onSuccess: () => { toast.success("Invoice updated"); refetch(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });
  const classifyFinancialScope = trpc.finance.classifyFinancialScope.useMutation({
    onSuccess: () => {
      toast.success("Invoice and linked financial records were classified as Test.");
      setClassifyTarget(null);
      setClassificationReason("");
      refetch();
    },
    onError: (e) => toast.error(e.message || "Could not classify the financial scope."),
  });

  const getExportInvoices = async () => {
    if (dateRangeInvalid) {
      toast.error("Issue Date From cannot be after Issue Date To.");
      return null;
    }
    const result = await invoiceExport.refetch();
    if (result.error || !result.data) {
      toast.error("Could not prepare the filtered invoice export. Please try again.");
      return null;
    }
    return result.data.data;
  };

  const unavailableMetrics = new Set(stats?.unavailableMetrics ?? []);
  const outstandingAsOf = stats?.outstandingReportingFx?.rateDates?.length === 1
    ? stats.outstandingReportingFx.rateDates[0]
    : null;
  const formatOutstandingAsOf = outstandingAsOf
    ? `As of ${format(new Date(`${outstandingAsOf}T00:00:00`), "dd MMM yyyy")}`
    : undefined;
  const formatReportingTRY = (metric: "totalRevenue" | "thisMonth" | "outstanding" | "overdue") =>
    unavailableMetrics.has(metric)
      ? "Not available"
      : `TRY ${Number(stats?.[metric] ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const statusColor: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    issued: "bg-blue-100 text-blue-700",
    paid: "bg-emerald-100 text-emerald-700",
    partial: "bg-yellow-100 text-yellow-700",
    overdue: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-400",
  };

  const exportPDF = async () => {
    const exportRows = await getExportInvoices();
    if (!exportRows) return;
    const printContent = `
      <html>
      <head>
        <title>Fertiliv - Invoice Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #111; }
          h1 { color: #0d9488; margin-bottom: 4px; }
          .subtitle { color: #666; font-size: 13px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #f0fdfa; color: #0d9488; padding: 8px 10px; text-align: left; border-bottom: 2px solid #99f6e4; }
          td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
          tr:nth-child(even) { background: #f9fafb; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; }
          .paid { background: #d1fae5; color: #065f46; }
          .overdue { background: #fee2e2; color: #991b1b; }
          .issued { background: #dbeafe; color: #1e40af; }
          .partial { background: #fef3c7; color: #92400e; }
          .footer { margin-top: 20px; font-size: 11px; color: #999; text-align: right; }
        </style>
      </head>
      <body>
        <h1>Fertiliv Clinic</h1>
        <p class="subtitle">Invoice Report — Generated ${format(new Date(), "MMMM d, yyyy")}</p>
        <table>
          <thead>
            <tr><th>Invoice #</th><th>Patient</th><th>Issue Date</th><th>Due Date</th><th>Total</th><th>Paid</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${exportRows.map(inv => `
              <tr>
                <td><strong>${inv.invoiceNumber}</strong></td>
                <td>${inv.patientFirstName} ${inv.patientLastName}</td>
                <td>${format(new Date(inv.issueDate), "MMM d, yyyy")}</td>
                <td>${inv.dueDate ? format(new Date(inv.dueDate), "MMM d, yyyy") : "—"}</td>
                <td><strong>${formatInvoiceMoney(inv.currency, inv.totalAmount)}</strong></td>
                <td>${formatInvoiceMoney(inv.currency, inv.paidAmount ?? 0)}</td>
                <td><span class="badge ${inv.status}">${inv.status}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <p class="footer">Total: ${exportRows.length} invoices · Invoice totals by currency: ${groupInvoiceTotalsByCurrency(exportRows)}</p>
      </body>
      </html>
    `;
    const win = window.open("", "_blank");
    if (!win) return toast.error("Popup blocked — allow popups to export PDF");
    win.document.write(printContent);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
    toast.success("PDF print dialog opened");
  };

  const exportCSV = async () => {
    const exportRows = await getExportInvoices();
    if (!exportRows) return;
    const rows = [
      ["Invoice #", "Patient", "Date", "Due Date", "Currency", "Total", "Paid", "Status"],
      ...(exportRows.map(inv => [
        inv.invoiceNumber,
        `${inv.patientFirstName} ${inv.patientLastName}`,
        format(new Date(inv.issueDate), "yyyy-MM-dd"),
        inv.dueDate ? format(new Date(inv.dueDate), "yyyy-MM-dd") : "",
        inv.currency ?? "USD",
        inv.totalAmount,
        inv.paidAmount ?? "0",
        inv.status,
      ])),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fertiliv-invoices-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    toast.success("CSV exported");
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{background:'rgba(227,178,176,0.18)'}}>
            <DollarSign className="h-6 w-6" style={{color:'#E3B2B0'}} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Finance</h1>
            <p className="text-sm text-muted-foreground">Bills, invoices, and offers</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={exportCSV} className="gap-2">
            <Download className="h-4 w-4" />CSV
          </Button>
          <Button variant="outline" onClick={exportPDF} className="gap-2">
            <FileText className="h-4 w-4" />PDF
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Revenue (TRY)" value={formatReportingTRY("totalRevenue")} icon={DollarSign} color="emerald" />
        <StatCard title="Fully Paid This Month (TRY)" value={formatReportingTRY("thisMonth")} icon={TrendingUp} color="blue" />
        <StatCard title="Outstanding (TRY)" value={formatReportingTRY("outstanding")} icon={AlertCircle} color="amber" note={unavailableMetrics.has("outstanding") ? "A current reporting FX rate is unavailable" : formatOutstandingAsOf} />
        <StatCard title="Overdue (TRY)" value={formatReportingTRY("overdue")} icon={AlertCircle} color="red" />
      </div>

      <Tabs defaultValue="invoices">
        <TabsList className="flex flex-wrap h-auto gap-1 w-full sm:w-auto">
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="offers">Offers & Discounts</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-4 mt-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search invoices..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={value => { setStatusFilter(value); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="issued">Issued</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            {isAdmin && (
              <Select value={financialScope} onValueChange={(value) => { setFinancialScope(value as "production" | "test" | "all"); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">Production only</SelectItem>
                  <SelectItem value="test">Test only</SelectItem>
                  <SelectItem value="all">All scopes</SelectItem>
                </SelectContent>
              </Select>
            )}
            <label className="flex items-center gap-1.5 w-[calc(50%-0.25rem)] sm:w-auto text-xs text-muted-foreground">
              <span>From</span>
              <Input aria-label="Invoice Issue Date From" type="date" value={issueDateFrom} max={issueDateTo || undefined} onChange={e => { setIssueDateFrom(e.target.value); setPage(1); }} className="h-9 w-full sm:w-36" />
            </label>
            <label className="flex items-center gap-1.5 w-[calc(50%-0.25rem)] sm:w-auto text-xs text-muted-foreground">
              <span>To</span>
              <Input aria-label="Invoice Issue Date To" type="date" value={issueDateTo} min={issueDateFrom || undefined} onChange={e => { setIssueDateTo(e.target.value); setPage(1); }} className="h-9 w-full sm:w-36" />
            </label>
            <Select value={String(pageSize)} onValueChange={value => { setPageSize(Number(value) as 20 | 50 | 100); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="20">Rows per page: 20</SelectItem>
                <SelectItem value="50">Rows per page: 50</SelectItem>
                <SelectItem value="100">Rows per page: 100</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {dateRangeInvalid && <p className="text-sm text-destructive">Issue Date From cannot be after Issue Date To.</p>}

          {dateRangeInvalid ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Correct the Issue Date range to view invoices.</div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : invoiceListError ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Could not load invoices. Please review the filters and try again.</div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No invoices found</div>
          ) : (
            <div className="space-y-2">
              {invoices.map(inv => (
                <div key={inv.id} className="flex flex-col gap-3 p-4 rounded-xl border bg-card transition-colors sm:flex-row sm:items-center sm:gap-3 sm:hover:bg-accent/20">
                  <div className="min-w-0 w-full sm:flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-sm font-mono">{inv.invoiceNumber}</p>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusColor[inv.status] ?? ""}`}>{inv.status}</span>
                      {inv.financialScope === "test" && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">TEST · Excluded from official reporting</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 break-words">{inv.patientFirstName} {inv.patientLastName} · {inv.patientMrn}</p>
                    <p className="text-xs text-muted-foreground">Issued: {format(new Date(inv.issueDate), "MMM d, yyyy")}{inv.dueDate ? ` · Due: ${format(new Date(inv.dueDate), "MMM d, yyyy")}` : ""}</p>
                  </div>
                  <div className="grid w-full grid-cols-1 gap-1 border-t pt-3 text-left sm:w-auto sm:border-t-0 sm:pt-0 sm:text-right">
                    <p className="font-bold">Total: {formatInvoiceMoney(inv.currency, inv.totalAmount)}</p>
                    {Number(inv.paidAmount) > 0 && <p className="text-xs text-emerald-600">Paid: {formatInvoiceMoney(inv.currency, inv.paidAmount)}</p>}
                    {Number(inv.totalAmount) > Number(inv.paidAmount ?? 0) && <p className="text-xs text-amber-600">Remaining: {formatInvoiceMoney(inv.currency, Number(inv.totalAmount) - Number(inv.paidAmount ?? 0))}</p>}
                  </div>
                  <div className="flex w-full items-center justify-between gap-2 border-t pt-3 sm:w-auto sm:justify-end sm:border-t-0 sm:pt-0">
                    <div className="flex items-center gap-2">
                      {inv.status !== "paid" && inv.status !== "cancelled" && <Button variant="outline" size="sm" className="text-xs" onClick={() => updateStatus.mutate({ id: inv.id, status: "paid", paidAmount: inv.totalAmount, paymentMethod: "cash" })}>Mark Paid</Button>}
                      {inv.status === "paid" && <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-label="Paid" />}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label={`More actions for ${inv.invoiceNumber}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {isAdmin && inv.financialScope === "production" && (
                          <>
                            <DropdownMenuItem onSelect={() => setClassifyTarget({ id: inv.id, number: inv.invoiceNumber })}>
                              Mark as Test
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => { setDeleteConfirmId(inv.id); setDeleteConfirmNumber(inv.invoiceNumber); }}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Invoice
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!isLoading && !dateRangeInvalid && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
              <p className="text-sm text-muted-foreground">{totalInvoices === 0 ? "0 results" : `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, totalInvoices)} of ${totalInvoices}`}{isFetching && <span className="ml-2">Updating…</span>}</p>
              {totalPages > 1 && (
                <div className="flex flex-wrap items-center gap-1">
                  <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</Button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1).filter(pageNumber => pageNumber === 1 || pageNumber === totalPages || Math.abs(pageNumber - currentPage) <= 1).map((pageNumber, index, visiblePages) => (
                    <div key={pageNumber} className="flex items-center gap-1">{index > 0 && pageNumber - visiblePages[index - 1] > 1 && <span className="px-1 text-muted-foreground">…</span>}<Button variant={pageNumber === currentPage ? "default" : "outline"} size="sm" className="min-w-8 px-2" onClick={() => setPage(pageNumber)}>{pageNumber}</Button></div>
                  ))}
                  <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="offers" className="space-y-3 mt-4">
          {!offers || offers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No offers configured</div>
          ) : (
            <div className="grid gap-3">
              {offers.map(offer => (
                <Card key={offer.id} className="border-dashed border-primary/40">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{offer.code ?? `Offer #${offer.id}`}</p>
                        {offer.description && <p className="text-xs text-muted-foreground mt-0.5">{offer.description}</p>}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          {offer.validFrom && <span>From: {format(new Date(offer.validFrom), "MMM d, yyyy")}</span>}
                          {offer.validUntil && <span>Until: {format(new Date(offer.validUntil), "MMM d, yyyy")}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-primary">
                          {offer.discountType === "percentage" ? `${offer.discountValue}%` : `$${offer.discountValue}`}
                        </p>
                        <p className="text-xs text-muted-foreground">{offer.discountType} discount</p>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded mt-1 inline-block ${offer.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                          {offer.status}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={open => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice {deleteConfirmNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the invoice and all its line items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteInvoice.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirmId !== null && deleteInvoice.mutate({ id: deleteConfirmId })}
              disabled={deleteInvoice.isPending}
            >
              {deleteInvoice.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Deleting...</>
              ) : (
                "Delete Invoice"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={classifyTarget !== null} onOpenChange={open => { if (!open) { setClassifyTarget(null); setClassificationReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Classify {classifyTarget?.number} as Test?</AlertDialogTitle>
            <AlertDialogDescription>
              This preserves the invoice and financial history but excludes it from official Finance reporting. This action is audited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={classificationReason}
            onChange={(event) => setClassificationReason(event.target.value)}
            placeholder="Required classification reason"
            maxLength={500}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={classifyFinancialScope.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-violet-700 text-white hover:bg-violet-800"
              disabled={classificationReason.trim().length < 3 || classifyFinancialScope.isPending}
              onClick={() => classifyTarget && classifyFinancialScope.mutate({
                invoiceId: classifyTarget.id,
                scope: "test",
                reason: classificationReason.trim(),
                setPatientDefault: true,
                confirmed: true,
              })}
            >
              {classifyFinancialScope.isPending ? "Classifying..." : "Confirm Test Classification"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, note }: { title: string; value: string; icon: React.ElementType; color: string; note?: string }) {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
  };
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colorMap[color] ?? "bg-gray-100 text-gray-600"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-xl font-bold">{value}</p>
          {note && <p className="text-[10px] text-amber-700 mt-0.5">{note}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
