import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { fmtDateLong } from "@/lib/dateFormat";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, FileText, Trash2, Send, CheckCircle, XCircle, Clock, FileDown, Tag, Mail, Edit2, Download, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

interface TreatmentProposalsTabProps {
  patientId?: number;
  leadId?: number;
  isReadOnly?: boolean;
  patient?: any;
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

const statusIcons: Record<string, React.ReactNode> = {
  draft: <Clock className="h-3 w-3" />,
  sent: <Send className="h-3 w-3" />,
  accepted: <CheckCircle className="h-3 w-3" />,
  rejected: <XCircle className="h-3 w-3" />,
};

interface LineItem {
  description: string;
  amount: string;
  quantity: number;
  discount?: number; // percentage 0-100
  serviceId?: string;
}

const CURRENCIES = ["USD", "EUR", "GBP", "TRY"] as const;

const EMPTY_FORM = {
  currency: "USD" as typeof CURRENCIES[number],
  staffNotes: "",
  customItems: [] as LineItem[],
  packageIds: [] as number[],
};

export function TreatmentProposalsTab({ patientId, leadId, isReadOnly, patient }: TreatmentProposalsTabProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState<number | null>(null);
  const [showSendEmail, setShowSendEmail] = useState<number | null>(null);
  const [sendIsUpdate, setSendIsUpdate] = useState(false);
  const [sendAttachPdf, setSendAttachPdf] = useState(true);
  // Edit mode state for detail dialog
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<{ currency: string; staffNotes: string; customItems: LineItem[] }>({
    currency: "USD", staffNotes: "", customItems: [],
  });
  const [editNewItem, setEditNewItem] = useState({ description: "", amount: "", quantity: 1, discount: 0, serviceId: "" });
  const [form, setForm] = useState(EMPTY_FORM);
  const [newItem, setNewItem] = useState({ description: "", amount: "", quantity: 1, discount: 0, serviceId: "" });
  const [notifyPartner, setNotifyPartner] = useState(false);
  const hasLinkedPartner = !!(patient as any)?.partnerId;

  const { data: services } = trpc.services.list.useQuery({});
  const { data: packages } = trpc.treatmentPackages.list.useQuery();
  const { data: settings } = trpc.settings.get.useQuery();

  // ─── Pricing helpers (same logic as invoice) ──────────────────────────────
  const markupPct = parseFloat((settings as any)?.foreign_price_markup_pct ?? "30");
  const isInternational = ((patient as any)?.patientType ?? "international") === "international";
  const markupMultiplier = isInternational ? 1 + markupPct / 100 : 1;
  const appliedPriceType = isInternational ? "international" : "local";

  const getExchangeRate = (cur: string): number => {
    if (cur === "TRY") return 1;
    return parseFloat((settings as any)?.[`exchange_rate_${cur}`] ?? "0") || 1;
  };

  // TRY base → apply markup → convert to selected currency
  const convertFromTRY = (tryAmount: number, cur: string): number => {
    const markedUp = tryAmount * markupMultiplier;
    if (cur === "TRY") return markedUp;
    return markedUp / getExchangeRate(cur);
  };

  // Reset form when dialog closes
  useEffect(() => {
    if (!showCreate) {
      setForm(EMPTY_FORM);
      setNewItem({ description: "", amount: "", quantity: 1, discount: 0, serviceId: "" });
      setNotifyPartner(false);
    }
  }, [showCreate]);

  const { data: proposals, refetch } = trpc.treatmentProposals.list.useQuery(leadId != null ? { leadId } : { patientId });

  const createProposal = trpc.treatmentProposals.create.useMutation({
    onSuccess: () => {
      toast.success("Proposal created");
      refetch();
      setShowCreate(false);
    },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const upsertItems = trpc.treatmentProposals.upsertItems.useMutation({
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const sendProposal = trpc.treatmentProposals.sendProposal.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Proposal sent successfully!");
        refetch();
        setShowSendEmail(null);
      } else {
        toast.error("Failed to send email. Please check the patient has an email address on file.");
      }
    },
    onError: (e) => { toast.error(e.message || "Failed to send proposal."); },
  });

  const updateProposal = trpc.treatmentProposals.update.useMutation({
    onSuccess: () => { toast.success("Proposal updated"); refetch(); setEditMode(false); },
    onError: (e) => { toast.error(e.message || "Failed to update proposal."); },
  });

  // Helper: generate PDF via server and open in new tab
  const handleDownloadPdf = async (proposalId: number) => {
    try {
      const res = await fetch(`/api/proposals/${proposalId}/pdf`);
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      // Fallback to print dialog
      const p = (proposals ?? []).find((x: any) => x.id === proposalId);
      if (p) handlePrint(p);
    }
  };

  const deleteProposal = trpc.treatmentProposals.delete.useMutation({
    onSuccess: () => { toast.success("Proposal deleted"); refetch(); setConfirmDeleteId(null); },
    onError: (e) => { toast.error(e.message || "Failed to delete proposal."); },
  });

  const updateStatus = trpc.treatmentProposals.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status updated"); refetch(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const addItem = () => {
    if (!newItem.description || !newItem.amount) return toast.error("Description and amount required");
    setForm(f => ({ ...f, customItems: [...f.customItems, { ...newItem }] }));
    setNewItem({ description: "", amount: "", quantity: 1, discount: 0, serviceId: "" });
  };

  const addFromService = (svcId: string) => {
    const svc = (services ?? []).find((s: any) => String(s.id) === svcId);
    if (!svc) return;
    // Use localPriceTRY as base for local patients, price (international TRY base) for international
    const baseTRY = isInternational
      ? parseFloat((svc as any).price ?? "0")
      : parseFloat((svc as any).localPriceTRY ?? (svc as any).price ?? "0");
    const converted = convertFromTRY(baseTRY, form.currency);
    const price = converted.toFixed(2);
    setForm(f => ({
      ...f,
      customItems: [...f.customItems, {
        description: svc.name,
        amount: price,
        quantity: 1,
        discount: 0,
        serviceId: String(svc.id),
      }],
    }));
  };

  const removeItem = (idx: number) => {
    setForm(f => ({ ...f, customItems: f.customItems.filter((_, i) => i !== idx) }));
  };

  const updateItemField = (idx: number, field: keyof LineItem, value: any) => {
    setForm(f => ({ ...f, customItems: f.customItems.map((item, i) => i === idx ? { ...item, [field]: value } : item) }));
  };

  const togglePackage = (pkgId: number) => {
    setForm(f => ({
      ...f,
      packageIds: f.packageIds.includes(pkgId)
        ? f.packageIds.filter(id => id !== pkgId)
        : [...f.packageIds, pkgId],
    }));
  };

  const lineTotal = (item: LineItem) => {
    const base = parseFloat(item.amount || "0") * (item.quantity || 1);
    const disc = (item.discount ?? 0) / 100;
    return base * (1 - disc);
  };

  const total = form.customItems.reduce((sum, item) => sum + lineTotal(item), 0);

  const handleCreate = async () => {
    if (form.customItems.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    const proposal = await createProposal.mutateAsync({
      ...(leadId != null ? { leadId } : { patientId }),
      currency: form.currency,
      appliedPriceType: appliedPriceType as any,
      packageId: form.packageIds.length > 0 ? form.packageIds[0] : undefined,
      totalAmount: total.toFixed(2),
      customItems: form.customItems,
      staffNotes: form.staffNotes || undefined,
      notifyPartner: notifyPartner || undefined,
    });
    // Save structured proposal items
    if ((proposal as any)?.insertId) {
      await upsertItems.mutateAsync({
        proposalId: (proposal as any).insertId,
        items: form.customItems.map(item => ({
          serviceId: item.serviceId ? parseInt(item.serviceId) : undefined,
          description: item.description,
          quantity: item.quantity,
          unitPrice: parseFloat(item.amount || "0"),
          discount: item.discount ?? 0,
          totalPrice: lineTotal(item),
        })),
      });
    }
  };

  const BRAND_LOGO = "/manus-storage/logo-horizontal_473c1b94.png";
  const BRAND_STAMP_BILLS = "/manus-storage/stamp-bills_23e4f414.png";

  const handlePrint = (proposal: any) => {
    const items: LineItem[] = Array.isArray(proposal.customItems) ? proposal.customItems : [];
    const printTotal = items.reduce((s: number, i: LineItem) => {
      const base = parseFloat(i.amount || "0") * (i.quantity || 1);
      const disc = (i.discount ?? 0) / 100;
      return s + base * (1 - disc);
    }, 0);
    const proposalDate = proposal.createdAt ? fmtDateLong(proposal.createdAt) : "";
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Treatment Proposal</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; padding: 40px; color: #111; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 3px solid #140063; padding-bottom: 20px; }
    .logo { height: 52px; }
    .clinic-info { text-align: right; font-size: 11px; color: #555; line-height: 1.7; }
    .proposal-title { font-size: 26px; font-weight: 700; color: #140063; letter-spacing: 1px; margin-bottom: 6px; }
    .proposal-meta { display: flex; gap: 32px; margin-bottom: 28px; }
    .meta-block h4 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #888; margin-bottom: 4px; }
    .meta-block p { font-size: 13px; font-weight: 600; }
    .meta-block .sub { font-size: 11px; font-weight: 400; color: #555; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead th { background: #140063; color: #fff; padding: 10px 12px; font-size: 11px; text-align: left; }
    tbody tr:nth-child(even) { background: #f5f3ff; }
    tbody td { padding: 9px 12px; font-size: 12px; border-bottom: 1px solid #e8e4f5; }
    .totals { margin-left: auto; width: 280px; }
    .totals tr td { padding: 5px 10px; font-size: 12px; }
    .totals tr.total td { font-weight: 700; font-size: 15px; border-top: 2px solid #140063; padding-top: 8px; }
    .notes { background: #fdf8f3; border-left: 4px solid #FECFB3; padding: 10px 14px; border-radius: 4px; font-size: 11px; color: #555; margin-bottom: 20px; }
    .stamps { display: flex; justify-content: flex-end; gap: 32px; margin-top: 40px; align-items: flex-end; }
    .stamp-block { text-align: center; }
    .stamp-block img { height: 90px; opacity: 0.92; }
    .stamp-block p { font-size: 10px; color: #888; margin-top: 4px; }
    .footer { margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 14px; text-align: center; font-size: 10px; color: #999; line-height: 1.8; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="${window.location.origin}${BRAND_LOGO}" class="logo" alt="Fertiliv" />
    <div class="clinic-info">
      <strong>Fertiliv IVF Center</strong><br/>
      Halaskargazi, Vali Konağı Cd. No:73, 34371 Şişli/İstanbul, Turkey<br/>
      +90 501 114 70 60 &nbsp;·&nbsp; info@fertiliv.com<br/>
      Mon–Fri 09:00–18:00 &nbsp;·&nbsp; Sat 09:00–14:00
    </div>
  </div>
  <div class="proposal-title">TREATMENT PROPOSAL</div>
  <div class="proposal-meta">
    <div class="meta-block">
      <h4>Prepared For</h4>
      <p>${patient?.firstName ?? ""} ${patient?.lastName ?? ""}</p>
      ${patient?.mrn ? `<p class="sub">MRN: ${patient.mrn}</p>` : ""}
    </div>
    <div class="meta-block">
      <h4>Proposal Details</h4>
      <p>Date: ${proposalDate}</p>
      <p class="sub">Currency: ${proposal.currency}</p>
    </div>
  </div>
  <table>
    <thead><tr><th style="width:45%">Description</th><th style="width:10%">Qty</th><th style="width:15%">Unit Price</th><th style="width:12%">Disc%</th><th style="width:18%">Total</th></tr></thead>
    <tbody>
      ${items.map((i: LineItem) => {
        const base = parseFloat(i.amount || "0") * (i.quantity || 1);
        const disc = (i.discount ?? 0) / 100;
        const lineAmt = base * (1 - disc);
        return `<tr><td>${i.description}</td><td>${i.quantity}</td><td style="text-align:right;">${parseFloat(i.amount).toLocaleString()} ${proposal.currency}</td><td style="text-align:center;">${i.discount ?? 0}%</td><td style="text-align:right;">${lineAmt.toLocaleString()} ${proposal.currency}</td></tr>`;
      }).join("")}
    </tbody>
  </table>
  <table class="totals">
    <tr class="total"><td>Total</td><td style="text-align:right;">${printTotal.toLocaleString()} ${proposal.currency}</td></tr>
  </table>
  ${proposal.staffNotes ? `<div class="notes"><strong>Notes:</strong> ${proposal.staffNotes}</div>` : ""}
  <div class="stamps">
    <div class="stamp-block">
      <img src="${window.location.origin}${BRAND_STAMP_BILLS}" alt="Official Stamp" />
      <p>Official Stamp</p>
    </div>
  </div>
  <div class="footer">
    Fertiliv IVF Center &nbsp;·&nbsp; Halaskargazi, Vali Konağı Cd. No:73, 34371 Şişli/İstanbul, Turkey<br/>
    +90 501 114 70 60 &nbsp;·&nbsp; info@fertiliv.com &nbsp;·&nbsp; fertiliv.com<br/>
    Instagram: @fertiliv &nbsp;·&nbsp; WhatsApp: +90 501 114 70 60
  </div>
  <div class="no-print" style="text-align:center;margin-top:24px;">
    <button onclick="window.print()" style="background:#140063;color:#fff;border:none;padding:10px 28px;border-radius:6px;font-size:14px;cursor:pointer;">Print / Save as PDF</button>
  </div>
</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  const selectedProposal = proposals?.find(p => p.id === showDetail);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Treatment Proposals</h3>
        {!isReadOnly && (
          <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" /> New Proposal
          </Button>
        )}
      </div>

      {!proposals || proposals.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No proposals yet</p>
          {!isReadOnly && <p className="text-xs mt-1">Create a treatment proposal to share with the patient</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map(p => {
            const items: LineItem[] = Array.isArray(p.customItems) ? p.customItems as LineItem[] : [];
            const propTotal = items.reduce((s, i) => {
              const base = parseFloat(i.amount || "0") * (i.quantity || 1);
              const disc = (i.discount ?? 0) / 100;
              return s + base * (1 - disc);
            }, 0);
            return (
              <Card key={p.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setShowDetail(p.id)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{(p as any).code ?? `PROP-${p.id}`}</span>
                        <Badge className={`text-xs gap-1 ${statusColors[p.status]}`}>
                          {statusIcons[p.status]}{p.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{format(new Date(p.createdAt), "dd MMM yyyy")}</span>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {items.length} item{items.length !== 1 ? "s" : ""} · {p.currency} {propTotal.toLocaleString()}
                      </div>
                      {p.staffNotes && <p className="text-xs text-muted-foreground mt-1 truncate">{p.staffNotes}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {/* PDF */}
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Preview PDF" onClick={() => handleDownloadPdf(p.id)}>
                        <FileDown className="h-3.5 w-3.5" />
                      </Button>
                      {/* Send Email */}
                      {!isReadOnly && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Send Email" onClick={() => {
                          setSendIsUpdate(p.status === "sent" || p.status === "accepted" || p.status === "rejected");
                          setSendAttachPdf(true);
                          setShowSendEmail(p.id);
                        }}>
                          <Mail className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {/* Accept / Reject — only when sent */}
                      {!isReadOnly && p.status === "sent" && (
                        <>
                          <Button variant="outline" size="sm" className="text-xs h-7 text-emerald-600 border-emerald-200" onClick={() => updateStatus.mutate({ id: p.id, status: "accepted" })}>
                            <CheckCircle className="h-3 w-3 mr-1" />Accept
                          </Button>
                          <Button variant="outline" size="sm" className="text-xs h-7 text-red-600 border-red-200" onClick={() => updateStatus.mutate({ id: p.id, status: "rejected" })}>
                            <XCircle className="h-3 w-3 mr-1" />Reject
                          </Button>
                        </>
                      )}
                      {/* Delete — admin only */}
                      {isAdmin && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" title="Delete proposal" onClick={() => setConfirmDeleteId(p.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={confirmDeleteId !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Proposal
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to permanently delete this proposal? This action cannot be undone.</p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteProposal.isPending}
              onClick={() => { if (confirmDeleteId !== null) deleteProposal.mutate({ id: confirmDeleteId }); }}
            >
              {deleteProposal.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Proposal Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Treatment Proposal</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="space-y-1 w-40">
                <Label className="text-xs">Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 pb-1">
                <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
                  isInternational ? "bg-purple-50 text-purple-700 border border-purple-200" : "bg-teal-50 text-teal-700 border border-teal-200"
                }`}>
                  {isInternational ? `🌍 International (+${markupPct}% markup applied)` : "🇹🇷 Local pricing"}
                </span>
              </div>
            </div>

            {/* Package multi-select */}
            {packages && packages.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1"><Tag className="h-3 w-3" />Treatment Packages (optional)</Label>
                <div className="flex flex-wrap gap-2">
                  {packages.map((pkg: any) => (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => togglePackage(pkg.id)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${form.packageIds.includes(pkg.id) ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:border-primary/50"}`}
                    >
                      {pkg.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Add from service catalog */}
            <div className="flex items-center gap-2">
              <Label className="text-xs font-semibold shrink-0">Add from catalog:</Label>
              <Select onValueChange={v => { addFromService(v); }}>
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Select service..." /></SelectTrigger>
                <SelectContent>
                  {(services ?? []).filter((s: any) => s.status === "active").map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Line Items</Label>
              {form.customItems.length > 0 && (
                <div className="grid grid-cols-12 gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1">
                  <div className="col-span-5">Description</div>
                  <div className="col-span-1 text-center">Qty</div>
                  <div className="col-span-2 text-right">Unit Price</div>
                  <div className="col-span-2 text-right">Disc%</div>
                  <div className="col-span-1 text-right">Total</div>
                  <div className="col-span-1"></div>
                </div>
              )}
              {form.customItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1 items-center border rounded p-1.5">
                  <div className="col-span-5">
                    <Input value={item.description} onChange={e => updateItemField(idx, "description", e.target.value)} className="h-7 text-xs" />
                  </div>
                  <div className="col-span-1">
                    <Input type="number" min={1} value={item.quantity} onChange={e => updateItemField(idx, "quantity", parseInt(e.target.value) || 1)} className="h-7 text-xs text-center" />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" step="0.01" value={item.amount} onChange={e => updateItemField(idx, "amount", e.target.value)} className="h-7 text-xs text-right" />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" min={0} max={100} value={item.discount ?? 0} onChange={e => updateItemField(idx, "discount", parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right" placeholder="0" />
                  </div>
                  <div className="col-span-1 text-right text-xs font-medium pr-1">
                    {lineTotal(item).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive text-xs">✕</button>
                  </div>
                </div>
              ))}

              {/* Manual add row */}
              <div className="grid grid-cols-12 gap-1 items-end border border-dashed rounded p-1.5 bg-muted/20">
                <div className="col-span-5 space-y-0.5">
                  <Label className="text-[10px]">Custom description</Label>
                  <Input placeholder="e.g. IVF with ICSI" value={newItem.description}
                    onChange={e => setNewItem(n => ({ ...n, description: e.target.value }))} className="h-7 text-xs" />
                </div>
                <div className="col-span-1 space-y-0.5">
                  <Label className="text-[10px]">Qty</Label>
                  <Input type="number" min={1} value={newItem.quantity}
                    onChange={e => setNewItem(n => ({ ...n, quantity: parseInt(e.target.value) || 1 }))} className="h-7 text-xs text-center" />
                </div>
                <div className="col-span-2 space-y-0.5">
                  <Label className="text-[10px]">Price</Label>
                  <Input type="number" placeholder="0.00" value={newItem.amount}
                    onChange={e => setNewItem(n => ({ ...n, amount: e.target.value }))} className="h-7 text-xs text-right" />
                </div>
                <div className="col-span-2 space-y-0.5">
                  <Label className="text-[10px]">Disc%</Label>
                  <Input type="number" min={0} max={100} placeholder="0" value={newItem.discount}
                    onChange={e => setNewItem(n => ({ ...n, discount: parseFloat(e.target.value) || 0 }))} className="h-7 text-xs text-right" />
                </div>
                <div className="col-span-2 flex justify-end">
                  <Button variant="outline" size="sm" onClick={addItem} className="h-7 text-xs gap-1">
                    <Plus className="h-3 w-3" />Add
                  </Button>
                </div>
              </div>
            </div>

            {form.customItems.length > 0 && (
              <div className="flex justify-end text-sm font-semibold border-t pt-2">
                Total: {total.toLocaleString(undefined, { maximumFractionDigits: 2 })} {form.currency}
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Staff Notes (internal)</Label>
              <Textarea placeholder="Internal notes about this proposal..." value={form.staffNotes}
                onChange={e => setForm(f => ({ ...f, staffNotes: e.target.value }))} rows={2} />
            </div>

            {hasLinkedPartner && (
              <div className="flex items-start gap-3 rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-700 p-3">
                <input
                  type="checkbox"
                  id="proposalNotifyPartner"
                  checked={notifyPartner}
                  onChange={e => setNotifyPartner(e.target.checked)}
                  className="mt-0.5 accent-orange-500"
                />
                <div>
                  <label htmlFor="proposalNotifyPartner" className="text-sm font-medium text-orange-700 dark:text-orange-400 cursor-pointer">
                    Also send proposal email to linked partner
                  </label>
                  <p className="text-xs text-orange-600 dark:text-orange-500 mt-0.5">
                    The partner account linked to this patient will receive a copy of this proposal.
                  </p>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createProposal.isPending || upsertItems.isPending}>
                {createProposal.isPending ? "Creating..." : "Create Proposal"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Proposal Detail Dialog */}
      {selectedProposal && (() => {
        const editLineTotal = (item: LineItem) => {
          const base = parseFloat(item.amount || "0") * (item.quantity || 1);
          const disc = (item.discount ?? 0) / 100;
          return base * (1 - disc);
        };
        const editTotal = editForm.customItems.reduce((s, i) => s + editLineTotal(i), 0);

        const openEdit = () => {
          setEditForm({
            currency: selectedProposal.currency ?? "USD",
            staffNotes: selectedProposal.staffNotes ?? "",
            customItems: Array.isArray(selectedProposal.customItems)
              ? (selectedProposal.customItems as LineItem[]).map(i => ({ ...i }))
              : [],
          });
          setEditNewItem({ description: "", amount: "", quantity: 1, discount: 0, serviceId: "" });
          setEditMode(true);
        };

        const handleSaveEdit = () => {
          // If proposal was accepted or rejected, reset to 'sent' so it can be re-reviewed
          const newStatus = (selectedProposal.status === "accepted" || selectedProposal.status === "rejected")
            ? "sent"
            : undefined;
          updateProposal.mutate({
            id: selectedProposal.id,
            currency: editForm.currency as any,
            staffNotes: editForm.staffNotes || undefined,
            customItems: editForm.customItems,
            totalAmount: editTotal.toFixed(2),
            ...(newStatus ? { status: newStatus } : {}),
          });
          upsertItems.mutate({
            proposalId: selectedProposal.id,
            items: editForm.customItems.map(item => ({
              serviceId: item.serviceId ? parseInt(item.serviceId) : undefined,
              description: item.description,
              quantity: item.quantity,
              unitPrice: parseFloat(item.amount || "0"),
              discount: item.discount ?? 0,
              totalPrice: editLineTotal(item),
            })),
          });
        };

        const addEditFromService = (svcId: string) => {
          const svc = (services ?? []).find((s: any) => String(s.id) === svcId);
          if (!svc) return;
          const baseTRY = isInternational
            ? parseFloat((svc as any).price ?? "0")
            : parseFloat((svc as any).localPriceTRY ?? (svc as any).price ?? "0");
          const converted = convertFromTRY(baseTRY, editForm.currency);
          setEditForm(f => ({
            ...f,
            customItems: [...f.customItems, {
              description: svc.name,
              amount: converted.toFixed(2),
              quantity: 1,
              discount: 0,
              serviceId: String(svc.id),
            }],
          }));
        };

        const addEditItem = () => {
          if (!editNewItem.description || !editNewItem.amount) return toast.error("Description and amount required");
          setEditForm(f => ({ ...f, customItems: [...f.customItems, { ...editNewItem }] }));
          setEditNewItem({ description: "", amount: "", quantity: 1, discount: 0, serviceId: "" });
        };

        return (
          <Dialog open onOpenChange={() => { setShowDetail(null); setEditMode(false); }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(selectedProposal as any).code ?? `PROP-${selectedProposal.id}`}
                  <Badge className={`text-xs ${statusColors[selectedProposal.status]}`}>{selectedProposal.status}</Badge>

                </DialogTitle>
              </DialogHeader>

              {!editMode ? (
                /* ── VIEW MODE ── */
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    Created {format(new Date(selectedProposal.createdAt), "dd MMM yyyy, HH:mm")} · {selectedProposal.appliedPriceType} pricing · {selectedProposal.currency}
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-1">Description</th>
                        <th className="text-right py-1">Qty</th>
                        <th className="text-right py-1">Price</th>
                        <th className="text-right py-1">Disc%</th>
                        <th className="text-right py-1">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(Array.isArray(selectedProposal.customItems) ? selectedProposal.customItems as LineItem[] : []).map((item: LineItem, i: number) => (
                        <tr key={i} className="border-b">
                          <td className="py-1.5">{item.description}</td>
                          <td className="text-right py-1.5">{item.quantity}</td>
                          <td className="text-right py-1.5">{parseFloat(item.amount).toLocaleString()}</td>
                          <td className="text-right py-1.5">{item.discount ?? 0}%</td>
                          <td className="text-right py-1.5 font-medium">{lineTotal(item).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td colSpan={4} className="pt-2">TOTAL</td>
                        <td className="text-right pt-2">
                          {(Array.isArray(selectedProposal.customItems) ? selectedProposal.customItems as LineItem[] : []).reduce((s, i) => s + lineTotal(i), 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} {selectedProposal.currency}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {selectedProposal.staffNotes && (
                    <div className="bg-muted/50 rounded p-3 text-sm">
                      <span className="font-medium text-xs">Notes: </span>{selectedProposal.staffNotes}
                    </div>
                  )}
                  <div className="flex flex-wrap justify-end gap-2 pt-2">
                    {/* PDF */}
                    <Button variant="outline" size="sm" onClick={() => handleDownloadPdf(selectedProposal.id)}>
                      <FileDown className="h-3.5 w-3.5 mr-1.5" /> PDF
                    </Button>
                    {/* Send Email */}
                    {!isReadOnly && (
                      <Button variant="outline" size="sm" onClick={() => {
                        setSendIsUpdate(selectedProposal.status === "sent" || selectedProposal.status === "accepted" || selectedProposal.status === "rejected");
                        setSendAttachPdf(true);
                        setShowSendEmail(selectedProposal.id);
                      }}>
                        <Mail className="h-3.5 w-3.5 mr-1.5" /> Send Email
                      </Button>
                    )}
                    {/* Edit */}
                    {!isReadOnly && (
                      <Button variant="outline" size="sm" onClick={openEdit}>
                        <Edit2 className="h-3.5 w-3.5 mr-1.5" /> Edit
                      </Button>
                    )}
                    {/* Accept */}
                    {!isReadOnly && selectedProposal.status === "sent" && (
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => {
                        updateStatus.mutate({ id: selectedProposal.id, status: "accepted" });
                        setShowDetail(null);
                      }}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Accept
                      </Button>
                    )}
                    {/* Reject */}
                    {!isReadOnly && selectedProposal.status === "sent" && (
                      <Button size="sm" variant="destructive" onClick={() => {
                        updateStatus.mutate({ id: selectedProposal.id, status: "rejected" });
                        setShowDetail(null);
                      }}>
                        <XCircle className="h-3.5 w-3.5 mr-1.5" /> Reject
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                /* ── EDIT MODE ── */
                <div className="space-y-4">
                  {/* Currency */}
                  <div className="flex items-center gap-3">
                    <Label className="text-xs w-20 shrink-0">Currency</Label>
                    <Select value={editForm.currency} onValueChange={v => setEditForm(f => ({ ...f, currency: v }))}>
                      <SelectTrigger className="h-8 w-32 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${isInternational ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                      {isInternational ? `🌍 International (+${markupPct}% markup)` : "🇹🇷 Local pricing"}
                    </div>
                  </div>

                  {/* Add from service catalog */}
                  <div className="space-y-1">
                    <Label className="text-xs">Add from service catalog</Label>
                    <Select onValueChange={addEditFromService}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select a service to add..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(services ?? []).map((s: any) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Line items */}
                  <div className="space-y-2">
                    <Label className="text-xs">Line Items</Label>
                    {editForm.customItems.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-1 items-center">
                        <Input className="col-span-4 h-7 text-xs" value={item.description}
                          onChange={e => setEditForm(f => ({ ...f, customItems: f.customItems.map((it, i) => i === idx ? { ...it, description: e.target.value } : it) }))} />
                        <Input type="number" min={1} className="col-span-1 h-7 text-xs text-center" value={item.quantity}
                          onChange={e => setEditForm(f => ({ ...f, customItems: f.customItems.map((it, i) => i === idx ? { ...it, quantity: parseInt(e.target.value) || 1 } : it) }))} />
                        <Input type="number" min={0} className="col-span-3 h-7 text-xs text-right" value={item.amount}
                          onChange={e => setEditForm(f => ({ ...f, customItems: f.customItems.map((it, i) => i === idx ? { ...it, amount: e.target.value } : it) }))} />
                        <Input type="number" min={0} max={100} className="col-span-2 h-7 text-xs text-right" value={item.discount ?? 0}
                          onChange={e => setEditForm(f => ({ ...f, customItems: f.customItems.map((it, i) => i === idx ? { ...it, discount: parseFloat(e.target.value) || 0 } : it) }))} />
                        <div className="col-span-1 text-right text-xs font-medium">{editLineTotal(item).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        <Button variant="ghost" size="icon" className="col-span-1 h-7 w-7 text-destructive"
                          onClick={() => setEditForm(f => ({ ...f, customItems: f.customItems.filter((_, i) => i !== idx) }))}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    {/* Column headers */}
                    {editForm.customItems.length > 0 && (
                      <div className="grid grid-cols-12 gap-1 text-xs text-muted-foreground">
                        <div className="col-span-4">Description</div>
                        <div className="col-span-1 text-center">Qty</div>
                        <div className="col-span-3 text-right">Unit Price</div>
                        <div className="col-span-2 text-right">Disc%</div>
                        <div className="col-span-1 text-right">Total</div>
                        <div className="col-span-1" />
                      </div>
                    )}
                    {/* Add new item row */}
                    <div className="grid grid-cols-12 gap-1 items-center border-t pt-2">
                      <Input className="col-span-4 h-7 text-xs" placeholder="Description" value={editNewItem.description}
                        onChange={e => setEditNewItem(n => ({ ...n, description: e.target.value }))} />
                      <Input type="number" min={1} className="col-span-1 h-7 text-xs text-center" value={editNewItem.quantity}
                        onChange={e => setEditNewItem(n => ({ ...n, quantity: parseInt(e.target.value) || 1 }))} />
                      <Input type="number" min={0} className="col-span-3 h-7 text-xs text-right" placeholder="0.00" value={editNewItem.amount}
                        onChange={e => setEditNewItem(n => ({ ...n, amount: e.target.value }))} />
                      <Input type="number" min={0} max={100} className="col-span-2 h-7 text-xs text-right" placeholder="0" value={editNewItem.discount}
                        onChange={e => setEditNewItem(n => ({ ...n, discount: parseFloat(e.target.value) || 0 }))} />
                      <div className="col-span-1" />
                      <Button variant="outline" size="icon" className="col-span-1 h-7 w-7" onClick={addEditItem}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    {editForm.customItems.length > 0 && (
                      <div className="flex justify-end text-sm font-semibold border-t pt-2">
                        Total: {editTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} {editForm.currency}
                      </div>
                    )}
                  </div>

                  {/* Staff Notes */}
                  <div className="space-y-1">
                    <Label className="text-xs">Staff Notes (internal)</Label>
                    <Textarea placeholder="Internal notes..." value={editForm.staffNotes}
                      onChange={e => setEditForm(f => ({ ...f, staffNotes: e.target.value }))} rows={2} />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>Cancel</Button>
                    <Button size="sm" onClick={handleSaveEdit} disabled={updateProposal.isPending || upsertItems.isPending}>
                      {updateProposal.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        );
      })()}
      {/* Send Proposal Email Dialog */}
      {showSendEmail !== null && (() => {
        const prop = (proposals ?? []).find((p: any) => p.id === showSendEmail);
        if (!prop) return null;
        const propItems: LineItem[] = Array.isArray(prop.customItems) ? prop.customItems as LineItem[] : [];
        const propTotal = propItems.reduce((s, i) => {
          const base = parseFloat(i.amount || "0") * (i.quantity || 1);
          const disc = (i.discount ?? 0) / 100;
          return s + base * (1 - disc);
        }, 0);
        const patientEmail = (patient as any)?.email ?? "";
        return (
          <Dialog open onOpenChange={() => setShowSendEmail(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Send Proposal Email
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Send proposal <strong>{prop.code ?? `PROP-${prop.id}`}</strong> to the patient's email address.
                </p>

                {/* Summary card */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Proposal</span>
                    <span className="font-medium">{prop.code ?? `PROP-${prop.id}`}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-medium">{prop.currency} {propTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge className={`text-xs ${statusColors[prop.status]}`}>{prop.status}</Badge>
                  </div>
                  {patientEmail && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">To</span>
                      <span className="font-medium text-xs">{patientEmail}</span>
                    </div>
                  )}
                  {settings?.card_surcharge_pct && (
                    <div className="pt-1.5 border-t border-border space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Cash Total</span>
                        <span className="font-medium">{prop.currency} {propTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Card / Bank Transfer (+{settings.card_surcharge_pct}%)</span>
                        <span className="font-medium">{prop.currency} {(propTotal * (1 + parseFloat(settings.card_surcharge_pct) / 100)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )}
                </div>

                {!patientEmail && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    No email address on file for this patient. Please add one before sending.
                  </div>
                )}

                {/* isUpdate toggle */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="sendIsUpdate"
                    checked={sendIsUpdate}
                    onChange={e => setSendIsUpdate(e.target.checked)}
                    className="accent-primary"
                  />
                  <label htmlFor="sendIsUpdate" className="text-sm cursor-pointer">
                    Mark as <strong>Updated</strong> proposal (not new)
                  </label>
                </div>

                {/* attachPdf toggle */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="sendAttachPdf"
                    checked={sendAttachPdf}
                    onChange={e => setSendAttachPdf(e.target.checked)}
                    className="accent-primary"
                  />
                  <label htmlFor="sendAttachPdf" className="text-sm cursor-pointer">
                    Attach PDF to email
                  </label>
                </div>
                <p className="text-xs text-muted-foreground -mt-2 ml-6">
                  💡 You can preview the PDF first by clicking the PDF button on the proposal card.
                </p>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowSendEmail(null)}>Cancel</Button>
                  <Button
                    size="sm"
                    disabled={!patientEmail || sendProposal.isPending}
                    onClick={() => sendProposal.mutate({
                      proposalId: showSendEmail,
                      isUpdate: sendIsUpdate,
                      attachPdf: sendAttachPdf,
                    })}
                  >
                    <Mail className="h-3.5 w-3.5 mr-1.5" />
                    {sendProposal.isPending ? "Sending..." : "Send Proposal Email"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
