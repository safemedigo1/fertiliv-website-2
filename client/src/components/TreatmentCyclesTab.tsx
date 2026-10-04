import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Plus, FlaskConical, Loader2, ChevronRight, Trash2, Edit,
  Activity, Pill, CheckCircle2, TrendingUp, Calendar, Printer
} from "lucide-react";

// Merged cycle + procedure type options
const CYCLE_PROCEDURE_TYPES = [
  "IVF", "ICSI", "IUI", "OI", "FET", "Egg_Freezing",
  "TESE", "TFSA", "CF_Mut", "Donor_Egg", "Other"
] as const;

const PROTOCOLS = ["antagonist", "long", "oks_long", "patch_ant", "mikrodoz", "other"] as const;
const CYCLE_STATUSES = ["planned", "stimulation", "retrieval", "transfer", "completed", "cancelled"] as const;
const OUTCOME_RESULTS = ["positive", "negative", "biochemical", "clinical", "ongoing", "delivered", "miscarriage", "pending"] as const;

const cycleStatusColor: Record<string, string> = {
  planned: "bg-blue-100 text-blue-700",
  stimulation: "bg-amber-100 text-amber-700",
  retrieval: "bg-purple-100 text-purple-700",
  transfer: "bg-indigo-100 text-indigo-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

const outcomeResultColor: Record<string, string> = {
  positive: "bg-emerald-100 text-emerald-700",
  negative: "bg-red-100 text-red-700",
  biochemical: "bg-amber-100 text-amber-700",
  clinical: "bg-blue-100 text-blue-700",
  ongoing: "bg-indigo-100 text-indigo-700",
  delivered: "bg-green-100 text-green-700",
  miscarriage: "bg-rose-100 text-rose-700",
  pending: "bg-gray-100 text-gray-600",
};

// Parse cycleType from JSON string or return array as-is
function parseCycleType(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return [val]; }
}

function formatCycleType(types: string[]): string {
  return types.map(t => t.replace(/_/g, " ")).join(" + ") || "—";
}

// Multi-select checkboxes component for cycle/procedure types
function CycleTypeMultiSelect({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (t: string) => {
    onChange(value.includes(t) ? value.filter(x => x !== t) : [...value, t]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {CYCLE_PROCEDURE_TYPES.map(t => (
        <label key={t} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border cursor-pointer text-xs transition-colors ${value.includes(t) ? "bg-purple-100 border-purple-400 text-purple-800 font-medium" : "border-border hover:bg-muted/50"}`}>
          <Checkbox
            checked={value.includes(t)}
            onCheckedChange={() => toggle(t)}
            className="h-3 w-3"
          />
          {t.replace(/_/g, " ")}
        </label>
      ))}
    </div>
  );
}

interface Props {
  patientId: number;
  isReadOnly?: boolean;
}

export default function TreatmentCyclesTab({ patientId, isReadOnly = false }: Props) {
  const [selectedCycleId, setSelectedCycleId] = useState<number | null>(null);
  const [showNewCycleDialog, setShowNewCycleDialog] = useState(false);
  const [newCycleForm, setNewCycleForm] = useState<any>({ cycleType: [], status: "planned" });

  useEffect(() => {
    if (!showNewCycleDialog) setNewCycleForm({ cycleType: [], status: "planned" });
  }, [showNewCycleDialog]);

  const { data: cycles, isLoading, refetch } = trpc.treatmentCycles.list.useQuery({ patientId });
  const { data: doctors } = trpc.doctors.list.useQuery();

  const createCycle = trpc.treatmentCycles.create.useMutation({
    onSuccess: () => { toast.success("Treatment cycle created"); refetch(); setShowNewCycleDialog(false); },
    onError: (e) => { toast.error((e as any)?.data?.zodError ? "Please check the form fields." : (e.message || "Something went wrong.")); },
  });

  const deleteCycle = trpc.treatmentCycles.delete.useMutation({
    onSuccess: () => { toast.success("Cycle deleted"); refetch(); setSelectedCycleId(null); },
    onError: (e) => { toast.error(e.message || "Failed to delete cycle"); },
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-32">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  if (selectedCycleId) {
    return (
      <CycleDetail
        cycleId={selectedCycleId}
        patientId={patientId}
        isReadOnly={isReadOnly}
        onBack={() => { setSelectedCycleId(null); refetch(); }}
        onDelete={() => deleteCycle.mutate({ cycleId: selectedCycleId })}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-purple-600" />
          ART Treatment Cycles
        </h3>
        {!isReadOnly && (
          <Button size="sm" className="gap-1.5" onClick={() => setShowNewCycleDialog(true)}>
            <Plus className="h-3.5 w-3.5" /> New Cycle
          </Button>
        )}
      </div>

      {!cycles || cycles.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">
          <FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No treatment cycles recorded yet</p>
          {!isReadOnly && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowNewCycleDialog(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Start First Cycle
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {cycles.map(cycle => {
            const types = parseCycleType(cycle.cycleType);
            return (
              <div
                key={cycle.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/40 cursor-pointer transition-colors"
                onClick={() => setSelectedCycleId(cycle.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                    <FlaskConical className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{formatCycleType(types)}</span>
                      {cycle.ivfNo && <span className="text-xs text-muted-foreground font-mono">#{cycle.ivfNo}</span>}
                      <Badge className={`text-xs ${cycleStatusColor[cycle.status] ?? "bg-gray-100 text-gray-600"}`} variant="outline">
                        {cycle.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      {cycle.startDate && <span>{format(new Date(cycle.startDate), "MMM d, yyyy")}</span>}
                      {cycle.protocol && <span className="capitalize">{cycle.protocol.replace(/_/g, " ")}</span>}
                      {cycle.doctorName && <span>{cycle.doctorName}</span>}
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            );
          })}
        </div>
      )}

      {/* New Cycle Dialog */}
      <Dialog open={showNewCycleDialog} onOpenChange={setShowNewCycleDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Treatment Cycle</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">IVF No.</Label>
                <Input placeholder="e.g. 001" value={newCycleForm.ivfNo ?? ""} onChange={e => setNewCycleForm((f: any) => ({ ...f, ivfNo: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={newCycleForm.status} onValueChange={v => setNewCycleForm((f: any) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CYCLE_STATUSES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Protocol</Label>
                <Select value={newCycleForm.protocol ?? ""} onValueChange={v => setNewCycleForm((f: any) => ({ ...f, protocol: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select protocol" /></SelectTrigger>
                  <SelectContent>{PROTOCOLS.map(p => <SelectItem key={p} value={p}>{p.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Doctor</Label>
                <Select value={newCycleForm.doctorId ? String(newCycleForm.doctorId) : "_none"} onValueChange={v => setNewCycleForm((f: any) => ({ ...f, doctorId: v === "_none" ? undefined : parseInt(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None —</SelectItem>
                    {doctors?.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={newCycleForm.startDate ?? ""} onChange={e => setNewCycleForm((f: any) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={newCycleForm.endDate ?? ""} onChange={e => setNewCycleForm((f: any) => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>

            {/* Cycle / Procedure Type multi-select */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Cycle / Procedure Type * <span className="text-muted-foreground font-normal">(select all that apply)</span></Label>
              <CycleTypeMultiSelect value={newCycleForm.cycleType ?? []} onChange={v => setNewCycleForm((f: any) => ({ ...f, cycleType: v }))} />
              {(!newCycleForm.cycleType || newCycleForm.cycleType.length === 0) && (
                <p className="text-xs text-red-500">At least one type is required</p>
              )}
            </div>

            {/* Baseline D3 */}
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Day 3 Baseline Hormones</p>
              <div className="grid grid-cols-4 gap-2">
                {["d3Fsh", "d3Lh", "d3E2", "d3Amh", "d3Prl", "d3Tsh", "d3Bmi"].map(field => (
                  <div key={field} className="space-y-1">
                    <Label className="text-xs">{field.replace("d3", "").toUpperCase()}</Label>
                    <Input placeholder="—" value={newCycleForm[field] ?? ""} onChange={e => setNewCycleForm((f: any) => ({ ...f, [field]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>

            {/* Clinical details */}
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Clinical Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Infertility Duration</Label>
                  <Input placeholder="e.g. 3 years" value={newCycleForm.infertilityDuration ?? ""} onChange={e => setNewCycleForm((f: any) => ({ ...f, infertilityDuration: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Karyotype</Label>
                  <Input placeholder="e.g. 46,XX" value={newCycleForm.karyotype ?? ""} onChange={e => setNewCycleForm((f: any) => ({ ...f, karyotype: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Infertility Reason — Female</Label>
                <Textarea rows={2} placeholder="e.g. PCOS, low AMH..." value={newCycleForm.infertilityReasonFemale ?? ""} onChange={e => setNewCycleForm((f: any) => ({ ...f, infertilityReasonFemale: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Infertility Reason — Male</Label>
                <Textarea rows={2} placeholder="e.g. azoospermia, low motility..." value={newCycleForm.infertilityReasonMale ?? ""} onChange={e => setNewCycleForm((f: any) => ({ ...f, infertilityReasonMale: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Serology</Label>
                <Textarea rows={2} placeholder="e.g. Hepatitis B, HIV results..." value={newCycleForm.serology ?? ""} onChange={e => setNewCycleForm((f: any) => ({ ...f, serology: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Previous Treatment</Label>
                <Textarea rows={2} placeholder="e.g. 2 previous IVF attempts..." value={newCycleForm.previousTreatment ?? ""} onChange={e => setNewCycleForm((f: any) => ({ ...f, previousTreatment: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Surgery History</Label>
                <Textarea rows={2} placeholder="e.g. laparoscopy 2020..." value={newCycleForm.surgery ?? ""} onChange={e => setNewCycleForm((f: any) => ({ ...f, surgery: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Adjuvant Medications</Label>
                <Textarea rows={2} placeholder="e.g. DHEA, CoQ10, aspirin..." value={newCycleForm.adjuvantMedications ?? ""} onChange={e => setNewCycleForm((f: any) => ({ ...f, adjuvantMedications: e.target.value }))} />
              </div>
            </div>

            {/* Sperm parameters */}
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Sperm Parameters</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "spermCount", label: "Count (M/ml)" },
                  { key: "spermMotility", label: "Motility (%)" },
                  { key: "spermMorphology", label: "Morphology (%)" },
                  { key: "spermTmss", label: "TMSS" },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input placeholder="—" value={newCycleForm[key] ?? ""} onChange={e => setNewCycleForm((f: any) => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Checkbox
                  id="frozenTissue-new"
                  checked={!!newCycleForm.frozenTissue}
                  onCheckedChange={v => setNewCycleForm((f: any) => ({ ...f, frozenTissue: !!v }))}
                />
                <Label htmlFor="frozenTissue-new" className="text-xs cursor-pointer">Frozen Tissue Used</Label>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={3} value={newCycleForm.notes ?? ""} onChange={e => setNewCycleForm((f: any) => ({ ...f, notes: e.target.value }))} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowNewCycleDialog(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!newCycleForm.cycleType || newCycleForm.cycleType.length === 0) {
                    toast.error("Please select at least one cycle/procedure type");
                    return;
                  }
                  createCycle.mutate({
                    patientId,
                    ...newCycleForm,
                    startDate: newCycleForm.startDate ? new Date(newCycleForm.startDate) : undefined,
                    endDate: newCycleForm.endDate ? new Date(newCycleForm.endDate) : undefined,
                  });
                }}
                disabled={createCycle.isPending}
              >
                {createCycle.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Create Cycle
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Cycle Detail View ────────────────────────────────────────────────────────

function CycleDetail({ cycleId, patientId, isReadOnly, onBack, onDelete }: {
  cycleId: number;
  patientId: number;
  isReadOnly: boolean;
  onBack: () => void;
  onDelete: () => void;
}) {
  const [activeTab, setActiveTab] = useState("monitoring");
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  const { data: cycle, isLoading, refetch } = trpc.treatmentCycles.get.useQuery({ cycleId });
  const { data: visits, refetch: refetchVisits } = trpc.treatmentCycles.listVisits.useQuery({ cycleId });
  const { data: medications, refetch: refetchMeds } = trpc.treatmentCycles.listMedications.useQuery({ cycleId });
  const { data: outcome, refetch: refetchOutcome } = trpc.treatmentCycles.getOutcome.useQuery({ cycleId });
  const { data: doctors } = trpc.doctors.list.useQuery();

  const updateCycle = trpc.treatmentCycles.update.useMutation({
    onSuccess: () => { toast.success("Cycle updated"); refetch(); setShowEditDialog(false); },
    onError: (e) => { toast.error((e as any)?.data?.zodError ? "Please check the form fields." : (e.message || "Something went wrong.")); },
  });

  const openEdit = () => {
    const types = parseCycleType(cycle?.cycleType);
    setEditForm({
      ...cycle,
      cycleType: types,
      startDate: cycle?.startDate ? format(new Date(cycle.startDate), "yyyy-MM-dd") : "",
      endDate: cycle?.endDate ? format(new Date(cycle.endDate), "yyyy-MM-dd") : "",
    });
    setShowEditDialog(true);
  };

  const handlePrintCycle = (cycle: any, visits: any[], medications: any[], outcome: any) => {
    const win = window.open("", "_blank");
    if (!win) return;
    const types = parseCycleType(cycle.cycleType);
    const visitRows = visits.map((v: any) => `
      <tr>
        <td>${v.visitDate ? format(new Date(v.visitDate), "dd/MM") : "—"}</td>
        <td>${v.cycleDay ?? "—"}</td>
        <td>${v.e2 ?? "—"}</td>
        <td>${v.lh ?? "—"}</td>
        <td>${v.p4 ?? "—"}</td>
        <td>${v.endometriumMm ?? "—"}</td>
        <td>${Array.isArray(v.folliclesRight) ? v.folliclesRight.join(", ") : (v.folliclesRight ?? "—")}</td>
        <td>${Array.isArray(v.folliclesLeft) ? v.folliclesLeft.join(", ") : (v.folliclesLeft ?? "—")}</td>
        <td>${v.fshDose ?? "—"}</td>
        <td>${v.hmgDose ?? "—"}</td>
        <td>${v.gnrhaDose ?? "—"}</td>
        <td>${v.antagonistDose ?? "—"}</td>
      </tr>
    `).join("");
    const medRows = medications.map((m: any) => `
      <tr><td>${m.medicationName}</td><td>${m.dose ?? "—"}</td><td>${m.frequency ?? "—"}</td><td>${m.route ?? "—"}</td><td>${m.instructions ?? "—"}</td></tr>
    `).join("");
    win.document.write(`
      <!DOCTYPE html><html><head><title>ART Cycle Summary</title>
      <style>
        body{font-family:Arial,sans-serif;padding:20px;font-size:11px;color:#111;}
        h1{font-size:16px;margin-bottom:2px;}h2{font-size:12px;margin:12px 0 4px;}
        .meta{color:#555;font-size:10px;margin-bottom:12px;}
        table{width:100%;border-collapse:collapse;margin-bottom:8px;}
        th{background:#f3f4f6;padding:4px 6px;text-align:left;border:1px solid #e5e7eb;font-size:10px;}
        td{padding:4px 6px;border:1px solid #e5e7eb;}
        .outcome{background:#f9fafb;padding:10px;border-radius:4px;margin-top:8px;}
        .outcome-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;}
        .outcome-item p:first-child{font-size:9px;color:#666;margin:0;}
        .outcome-item p:last-child{font-weight:bold;margin:0;}
      </style></head><body>
      <h1>ART İndüksiyon Takip Formu — ${formatCycleType(types)}</h1>
      <div class="meta">
        IVF No: ${cycle.ivfNo ?? "—"} &nbsp;|&nbsp;
        Protocol: ${cycle.protocol ?? "—"} &nbsp;|&nbsp;
        Status: ${cycle.status} &nbsp;|&nbsp;
        Start: ${cycle.startDate ? format(new Date(cycle.startDate), "dd MMM yyyy") : "—"}
      </div>
      <h2>Baseline (D3)</h2>
      <table><tr>
        <th>FSH</th><th>LH</th><th>E2</th><th>AMH</th><th>PRL</th><th>TSH</th><th>BMI</th><th>Karyotype</th>
      </tr><tr>
        <td>${cycle.d3Fsh ?? "—"}</td><td>${cycle.d3Lh ?? "—"}</td><td>${cycle.d3E2 ?? "—"}</td>
        <td>${cycle.d3Amh ?? "—"}</td><td>${cycle.d3Prl ?? "—"}</td><td>${cycle.d3Tsh ?? "—"}</td>
        <td>${cycle.d3Bmi ?? "—"}</td><td>${cycle.karyotype ?? "—"}</td>
      </tr></table>
      <h2>Monitoring Visits</h2>
      <table><thead><tr>
        <th>Date</th><th>Day</th><th>E2</th><th>LH</th><th>P4</th><th>Endo.</th>
        <th>Follicles R</th><th>Follicles L</th><th>FSH</th><th>HMG</th><th>GnRHa</th><th>Antag.</th>
      </tr></thead><tbody>${visitRows || "<tr><td colspan=12>No visits recorded</td></tr>"}</tbody></table>
      ${medications.length > 0 ? `
      <h2>Medications</h2>
      <table><thead><tr><th>Name</th><th>Dose</th><th>Frequency</th><th>Route</th><th>Instructions</th></tr></thead>
      <tbody>${medRows}</tbody></table>` : ""}
      ${outcome ? `
      <h2>Outcome</h2>
      <div class="outcome"><div class="outcome-grid">
        <div class="outcome-item"><p>Total Oocytes</p><p>${outcome.totalOocytes ?? "—"}</p></div>
        <div class="outcome-item"><p>MII</p><p>${outcome.matureOocytes ?? "—"}</p></div>
        <div class="outcome-item"><p>Fertilized</p><p>${outcome.fertilized ?? "—"}</p></div>
        <div class="outcome-item"><p>Blastocysts</p><p>${outcome.blastocystCount ?? "—"}</p></div>
        <div class="outcome-item"><p>Transferred</p><p>${outcome.transferred ?? "—"}</p></div>
        <div class="outcome-item"><p>Cryopreserved</p><p>${outcome.cryopreserved ?? "—"}</p></div>
        <div class="outcome-item"><p>HCG</p><p>${outcome.hcgLevel ?? "—"}</p></div>
        <div class="outcome-item"><p>Result</p><p>${outcome.result ?? "—"}</p></div>
      </div></div>` : ""}
      <div style="margin-top:20px;font-size:9px;color:#aaa;">Generated by Fertiliv — ${format(new Date(), "dd MMM yyyy, HH:mm")}</div>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  if (isLoading || !cycle) return (
    <div className="flex items-center justify-center h-32">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  const cycleTypes = parseCycleType(cycle.cycleType);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">← Back</Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{formatCycleType(cycleTypes)}</span>
            {cycle.ivfNo && <span className="text-xs font-mono text-muted-foreground">#{cycle.ivfNo}</span>}
            <Badge className={`text-xs ${cycleStatusColor[cycle.status] ?? ""}`} variant="outline">
              {cycle.status}
            </Badge>
            {cycle.protocol && (
              <Badge variant="secondary" className="text-xs capitalize">
                {cycle.protocol.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
          {cycle.startDate && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Started {format(new Date(cycle.startDate), "MMM d, yyyy")}
              {cycle.endDate && ` · Ended ${format(new Date(cycle.endDate), "MMM d, yyyy")}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => handlePrintCycle(cycle, visits ?? [], medications ?? [], outcome)} className="gap-1">
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
          {!isReadOnly && (
            <>
              <Button variant="outline" size="sm" onClick={openEdit}>
                <Edit className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Baseline info */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {[
              { label: "FSH (D3)", value: cycle.d3Fsh },
              { label: "LH (D3)", value: cycle.d3Lh },
              { label: "E2 (D3)", value: cycle.d3E2 },
              { label: "AMH", value: cycle.d3Amh },
              { label: "PRL", value: cycle.d3Prl },
              { label: "TSH", value: cycle.d3Tsh },
              { label: "BMI", value: cycle.d3Bmi },
              { label: "Karyotype", value: cycle.karyotype },
            ].filter(i => i.value).map(item => (
              <div key={item.label}>
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="font-medium">{item.value}</p>
              </div>
            ))}
          </div>
          {/* Sperm parameters */}
          {(cycle.spermCount || cycle.spermMotility || cycle.spermMorphology || cycle.spermTmss) && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2">Sperm Parameters</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {[
                  { label: "Count (M/ml)", value: cycle.spermCount },
                  { label: "Motility (%)", value: cycle.spermMotility },
                  { label: "Morphology (%)", value: cycle.spermMorphology },
                  { label: "TMSS", value: cycle.spermTmss },
                ].filter(i => i.value).map(item => (
                  <div key={item.label}>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="font-medium">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Clinical notes */}
          {(cycle.infertilityReasonFemale || cycle.infertilityReasonMale || cycle.serology || cycle.previousTreatment || cycle.surgery || cycle.adjuvantMedications) && (
            <div className="mt-3 pt-3 border-t space-y-2">
              {cycle.infertilityReasonFemale && <div><p className="text-xs text-muted-foreground">Infertility — Female</p><p className="text-sm">{cycle.infertilityReasonFemale}</p></div>}
              {cycle.infertilityReasonMale && <div><p className="text-xs text-muted-foreground">Infertility — Male</p><p className="text-sm">{cycle.infertilityReasonMale}</p></div>}
              {cycle.serology && <div><p className="text-xs text-muted-foreground">Serology</p><p className="text-sm">{cycle.serology}</p></div>}
              {cycle.previousTreatment && <div><p className="text-xs text-muted-foreground">Previous Treatment</p><p className="text-sm">{cycle.previousTreatment}</p></div>}
              {cycle.surgery && <div><p className="text-xs text-muted-foreground">Surgery</p><p className="text-sm">{cycle.surgery}</p></div>}
              {cycle.adjuvantMedications && <div><p className="text-xs text-muted-foreground">Adjuvant Medications</p><p className="text-sm">{cycle.adjuvantMedications}</p></div>}
            </div>
          )}
          {cycle.notes && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{cycle.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="monitoring" className="gap-1.5 text-xs">
            <Activity className="h-3.5 w-3.5" /> Monitoring
          </TabsTrigger>
          <TabsTrigger value="medications" className="gap-1.5 text-xs">
            <Pill className="h-3.5 w-3.5" /> Medications
          </TabsTrigger>
          <TabsTrigger value="adherence" className="gap-1.5 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" /> Adherence
          </TabsTrigger>
          <TabsTrigger value="outcome" className="gap-1.5 text-xs">
            <TrendingUp className="h-3.5 w-3.5" /> Outcome
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monitoring">
          <MonitoringVisitsTab cycleId={cycleId} visits={visits ?? []} isReadOnly={isReadOnly} onRefetch={refetchVisits} />
        </TabsContent>
        <TabsContent value="medications">
          <MedicationsTab cycleId={cycleId} medications={medications ?? []} isReadOnly={isReadOnly} onRefetch={refetchMeds} />
        </TabsContent>
        <TabsContent value="adherence">
          <AdherenceTab cycleId={cycleId} patientId={patientId} medications={medications ?? []} />
        </TabsContent>
        <TabsContent value="outcome">
          <OutcomeTab cycleId={cycleId} outcome={outcome} isReadOnly={isReadOnly} onRefetch={refetchOutcome} />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Cycle</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">IVF No.</Label>
                <Input value={editForm.ivfNo ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, ivfNo: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={editForm.status ?? ""} onValueChange={v => setEditForm((f: any) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CYCLE_STATUSES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Protocol</Label>
                <Select value={editForm.protocol ?? ""} onValueChange={v => setEditForm((f: any) => ({ ...f, protocol: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{PROTOCOLS.map(p => <SelectItem key={p} value={p}>{p.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Doctor</Label>
                <Select value={editForm.doctorId ? String(editForm.doctorId) : "_none"} onValueChange={v => setEditForm((f: any) => ({ ...f, doctorId: v === "_none" ? null : parseInt(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None —</SelectItem>
                    {doctors?.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={editForm.startDate ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={editForm.endDate ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>

            {/* Cycle / Procedure Type multi-select */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Cycle / Procedure Type <span className="text-muted-foreground font-normal">(select all that apply)</span></Label>
              <CycleTypeMultiSelect value={editForm.cycleType ?? []} onChange={v => setEditForm((f: any) => ({ ...f, cycleType: v }))} />
            </div>

            {/* Baseline D3 */}
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Day 3 Baseline</p>
              <div className="grid grid-cols-4 gap-2">
                {["d3Fsh", "d3Lh", "d3E2", "d3Amh", "d3Prl", "d3Tsh", "d3Bmi"].map(field => (
                  <div key={field} className="space-y-1">
                    <Label className="text-xs">{field.replace("d3", "").toUpperCase()}</Label>
                    <Input value={editForm[field] ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, [field]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>

            {/* Clinical details */}
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Clinical Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Infertility Duration</Label>
                  <Input value={editForm.infertilityDuration ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, infertilityDuration: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Karyotype</Label>
                  <Input value={editForm.karyotype ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, karyotype: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Infertility Reason — Female</Label>
                <Textarea rows={2} value={editForm.infertilityReasonFemale ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, infertilityReasonFemale: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Infertility Reason — Male</Label>
                <Textarea rows={2} value={editForm.infertilityReasonMale ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, infertilityReasonMale: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Serology</Label>
                <Textarea rows={2} value={editForm.serology ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, serology: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Previous Treatment</Label>
                <Textarea rows={2} value={editForm.previousTreatment ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, previousTreatment: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Surgery</Label>
                <Textarea rows={2} value={editForm.surgery ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, surgery: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Adjuvant Medications</Label>
                <Textarea rows={2} value={editForm.adjuvantMedications ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, adjuvantMedications: e.target.value }))} />
              </div>
            </div>

            {/* Sperm parameters */}
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Sperm Parameters</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "spermCount", label: "Count (M/ml)" },
                  { key: "spermMotility", label: "Motility (%)" },
                  { key: "spermMorphology", label: "Morphology (%)" },
                  { key: "spermTmss", label: "TMSS" },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input value={editForm[key] ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Checkbox
                  id="frozenTissue-edit"
                  checked={!!editForm.frozenTissue}
                  onCheckedChange={v => setEditForm((f: any) => ({ ...f, frozenTissue: !!v }))}
                />
                <Label htmlFor="frozenTissue-edit" className="text-xs cursor-pointer">Frozen Tissue Used</Label>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={3} value={editForm.notes ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, notes: e.target.value }))} />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
              <Button
                onClick={() => updateCycle.mutate({
                  cycleId,
                  data: {
                    ...editForm,
                    startDate: editForm.startDate ? new Date(editForm.startDate) : null,
                    endDate: editForm.endDate ? new Date(editForm.endDate) : null,
                  },
                })}
                disabled={updateCycle.isPending}
              >
                {updateCycle.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Monitoring Visits Tab ────────────────────────────────────────────────────

function MonitoringVisitsTab({ cycleId, visits, isReadOnly, onRefetch }: {
  cycleId: number;
  visits: any[];
  isReadOnly: boolean;
  onRefetch: () => void;
}) {
  const [showAddVisit, setShowAddVisit] = useState(false);
  const [showEditVisit, setShowEditVisit] = useState(false);
  const [editingVisit, setEditingVisit] = useState<any>(null);
  const [visitForm, setVisitForm] = useState<any>({ visitDate: format(new Date(), "yyyy-MM-dd") });
  const [editVisitForm, setEditVisitForm] = useState<any>({});

  const addVisit = trpc.treatmentCycles.addVisit.useMutation({
    onSuccess: () => { toast.success("Visit recorded"); onRefetch(); setShowAddVisit(false); setVisitForm({ visitDate: format(new Date(), "yyyy-MM-dd") }); },
    onError: (e) => { toast.error((e as any)?.data?.zodError ? "Please check the form fields." : (e.message || "Something went wrong.")); },
  });

  const updateVisit = trpc.treatmentCycles.updateVisit.useMutation({
    onSuccess: () => { toast.success("Visit updated"); onRefetch(); setShowEditVisit(false); setEditingVisit(null); },
    onError: (e) => { toast.error((e as any)?.data?.zodError ? "Please check the form fields." : (e.message || "Something went wrong.")); },
  });

  const deleteVisit = trpc.treatmentCycles.deleteVisit.useMutation({
    onSuccess: () => { toast.success("Visit deleted"); onRefetch(); },
    onError: (e) => { toast.error(e.message || "Failed to delete visit"); },
  });

  const openEditVisit = (v: any) => {
    setEditingVisit(v);
    setEditVisitForm({
      ...v,
      visitDate: v.visitDate ? format(new Date(v.visitDate), "yyyy-MM-dd") : "",
      folliclesRightStr: Array.isArray(v.folliclesRight) ? v.folliclesRight.join(", ") : (v.folliclesRight ?? ""),
      folliclesLeftStr: Array.isArray(v.folliclesLeft) ? v.folliclesLeft.join(", ") : (v.folliclesLeft ?? ""),
    });
    setShowEditVisit(true);
  };

  const parseFollicles = (str: string) => str ? str.split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n)) : undefined;

  // VisitFormFields inlined directly in dialogs below to avoid focus-loss on re-render

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Monitoring Visits ({visits.length})</p>
        {!isReadOnly && (
          <Button size="sm" variant="outline" onClick={() => setShowAddVisit(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Visit
          </Button>
        )}
      </div>

      {visits.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No monitoring visits yet</p>
      ) : (
        <div className="overflow-x-auto" style={{ touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left p-2 font-medium">Date</th>
                <th className="text-left p-2 font-medium">Day</th>
                <th className="text-left p-2 font-medium">E2</th>
                <th className="text-left p-2 font-medium">LH</th>
                <th className="text-left p-2 font-medium">P4</th>
                <th className="text-left p-2 font-medium">Endo (mm)</th>
                <th className="text-left p-2 font-medium">Follicles R</th>
                <th className="text-left p-2 font-medium">Follicles L</th>
                <th className="text-left p-2 font-medium">FSH Dose</th>
                <th className="text-left p-2 font-medium">HMG</th>
                <th className="text-left p-2 font-medium">GnRHa</th>
                <th className="text-left p-2 font-medium">Antagonist</th>
                {!isReadOnly && <th className="p-2"></th>}
              </tr>
            </thead>
            <tbody>
              {visits.map(v => (
                <tr key={v.id} className="border-t hover:bg-muted/30">
                  <td className="p-2">{format(new Date(v.visitDate), "MMM d")}</td>
                  <td className="p-2">{v.cycleDay ?? "—"}</td>
                  <td className="p-2">{v.e2 ?? "—"}</td>
                  <td className="p-2">{v.lh ?? "—"}</td>
                  <td className="p-2">{v.p4 ?? "—"}</td>
                  <td className="p-2">{v.endometriumMm ?? "—"}</td>
                  <td className="p-2">{v.folliclesRight ? (Array.isArray(v.folliclesRight) ? v.folliclesRight.join(", ") : v.folliclesRight) : "—"}</td>
                  <td className="p-2">{v.folliclesLeft ? (Array.isArray(v.folliclesLeft) ? v.folliclesLeft.join(", ") : v.folliclesLeft) : "—"}</td>
                  <td className="p-2">{v.fshDose ?? "—"}</td>
                  <td className="p-2">{v.hmgDose ?? "—"}</td>
                  <td className="p-2">{v.gnrhaDose ?? "—"}</td>
                  <td className="p-2">{v.antagonistDose ?? "—"}</td>
                  {!isReadOnly && (
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-blue-500 hover:bg-blue-50"
                          onClick={() => openEditVisit(v)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-50"
                          onClick={() => deleteVisit.mutate({ visitId: v.id })}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Follicle Growth Visualization */}
      {visits.length > 0 && (() => {
        const visitsWithFollicles = visits.filter(v =>
          (Array.isArray(v.folliclesRight) && v.folliclesRight.length > 0) ||
          (Array.isArray(v.folliclesLeft) && v.folliclesLeft.length > 0)
        );
        if (visitsWithFollicles.length === 0) return null;
        const maxSize = Math.max(
          ...visitsWithFollicles.flatMap(v => [
            ...(Array.isArray(v.folliclesRight) ? v.folliclesRight : []),
            ...(Array.isArray(v.folliclesLeft) ? v.folliclesLeft : []),
          ])
        );
        return (
          <div className="border rounded-lg p-3 bg-muted/20">
            <p className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Follicle Growth Chart</p>
            <div className="flex gap-4 items-end overflow-x-auto pb-1" style={{ touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
              {visitsWithFollicles.map((v, vi) => {
                const rFollicles: number[] = Array.isArray(v.folliclesRight) ? v.folliclesRight : [];
                const lFollicles: number[] = Array.isArray(v.folliclesLeft) ? v.folliclesLeft : [];
                return (
                  <div key={vi} className="flex flex-col items-center gap-1 shrink-0">
                    <div className="flex gap-1 items-end" style={{ height: 80 }}>
                      {rFollicles.map((size: number, i: number) => (
                        <div key={`r${i}`} title={`R: ${size}mm`}
                          className="rounded-full bg-blue-400 opacity-80 flex items-center justify-center text-white"
                          style={{ width: Math.max(12, (size / maxSize) * 28), height: Math.max(12, (size / maxSize) * 28), fontSize: 7 }}>
                          {size >= 14 ? size : ""}
                        </div>
                      ))}
                      {lFollicles.map((size: number, i: number) => (
                        <div key={`l${i}`} title={`L: ${size}mm`}
                          className="rounded-full bg-rose-400 opacity-80 flex items-center justify-center text-white"
                          style={{ width: Math.max(12, (size / maxSize) * 28), height: Math.max(12, (size / maxSize) * 28), fontSize: 7 }}>
                          {size >= 14 ? size : ""}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{v.cycleDay ? `D${v.cycleDay}` : format(new Date(v.visitDate), "MMM d")}</p>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-3 h-3 rounded-full bg-blue-400" /> Right ovary
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-3 h-3 rounded-full bg-rose-400" /> Left ovary
              </div>
              <div className="text-xs text-muted-foreground ml-auto">Size shown in mm (≥14mm labeled)</div>
            </div>
          </div>
        );
      })()}

      {/* Add Visit Dialog */}
      <Dialog open={showAddVisit} onOpenChange={setShowAddVisit}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Monitoring Visit</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Visit Date *</Label>
                <Input type="date" value={visitForm.visitDate ?? ""} onChange={e => setVisitForm((f: any) => ({ ...f, visitDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cycle Day</Label>
                <Input type="number" placeholder="e.g. 5" value={visitForm.cycleDay ?? ""} onChange={e => setVisitForm((f: any) => ({ ...f, cycleDay: e.target.value ? parseInt(e.target.value) : undefined }))} />
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Hormone Levels</p>
              <div className="grid grid-cols-4 gap-2">
                {(["e2", "lh", "p4"] as const).map(key => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{key.toUpperCase()}</Label>
                    <Input placeholder="—" value={(visitForm as any)[key] ?? ""} onChange={e => setVisitForm((f: any) => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
                <div className="space-y-1">
                  <Label className="text-xs">Endo (mm)</Label>
                  <Input placeholder="—" value={visitForm.endometriumMm ?? ""} onChange={e => setVisitForm((f: any) => ({ ...f, endometriumMm: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Follicle Sizes (comma-separated mm)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Right Ovary</Label>
                  <Input placeholder="e.g. 12, 14, 16" value={visitForm.folliclesRightStr ?? ""} onChange={e => setVisitForm((f: any) => ({ ...f, folliclesRightStr: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Left Ovary</Label>
                  <Input placeholder="e.g. 11, 13, 15" value={visitForm.folliclesLeftStr ?? ""} onChange={e => setVisitForm((f: any) => ({ ...f, folliclesLeftStr: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Medications Given</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: "fshDose", label: "FSH" },
                  { key: "hmgDose", label: "HMG" },
                  { key: "gnrhaDose", label: "GnRHa" },
                  { key: "antagonistDose", label: "Antagonist" },
                  { key: "ccLetrDose", label: "CC/Letr" },
                  { key: "hcgDose", label: "HCG" },
                ] as const).map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input placeholder="dose" value={(visitForm as any)[key] ?? ""} onChange={e => setVisitForm((f: any) => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={visitForm.notes ?? ""} onChange={e => setVisitForm((f: any) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowAddVisit(false)}>Cancel</Button>
            <Button
              onClick={() => addVisit.mutate({
                cycleId,
                visitDate: new Date(visitForm.visitDate),
                cycleDay: visitForm.cycleDay,
                e2: visitForm.e2 || undefined,
                lh: visitForm.lh || undefined,
                p4: visitForm.p4 || undefined,
                endometriumMm: visitForm.endometriumMm || undefined,
                folliclesRight: parseFollicles(visitForm.folliclesRightStr ?? ""),
                folliclesLeft: parseFollicles(visitForm.folliclesLeftStr ?? ""),
                fshDose: visitForm.fshDose || undefined,
                hmgDose: visitForm.hmgDose || undefined,
                gnrhaDose: visitForm.gnrhaDose || undefined,
                antagonistDose: visitForm.antagonistDose || undefined,
                ccLetrDose: visitForm.ccLetrDose || undefined,
                hcgDose: visitForm.hcgDose || undefined,
                notes: visitForm.notes || undefined,
              })}
              disabled={addVisit.isPending}
            >
              {addVisit.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save Visit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Visit Dialog */}
      <Dialog open={showEditVisit} onOpenChange={v => { setShowEditVisit(v); if (!v) setEditingVisit(null); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Monitoring Visit</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Visit Date *</Label>
                <Input type="date" value={editVisitForm.visitDate ?? ""} onChange={e => setEditVisitForm((f: any) => ({ ...f, visitDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cycle Day</Label>
                <Input type="number" placeholder="e.g. 5" value={editVisitForm.cycleDay ?? ""} onChange={e => setEditVisitForm((f: any) => ({ ...f, cycleDay: e.target.value ? parseInt(e.target.value) : undefined }))} />
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Hormone Levels</p>
              <div className="grid grid-cols-4 gap-2">
                {(["e2", "lh", "p4"] as const).map(key => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{key.toUpperCase()}</Label>
                    <Input placeholder="—" value={(editVisitForm as any)[key] ?? ""} onChange={e => setEditVisitForm((f: any) => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
                <div className="space-y-1">
                  <Label className="text-xs">Endo (mm)</Label>
                  <Input placeholder="—" value={editVisitForm.endometriumMm ?? ""} onChange={e => setEditVisitForm((f: any) => ({ ...f, endometriumMm: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Follicle Sizes (comma-separated mm)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Right Ovary</Label>
                  <Input placeholder="e.g. 12, 14, 16" value={editVisitForm.folliclesRightStr ?? ""} onChange={e => setEditVisitForm((f: any) => ({ ...f, folliclesRightStr: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Left Ovary</Label>
                  <Input placeholder="e.g. 11, 13, 15" value={editVisitForm.folliclesLeftStr ?? ""} onChange={e => setEditVisitForm((f: any) => ({ ...f, folliclesLeftStr: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Medications Given</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: "fshDose", label: "FSH" },
                  { key: "hmgDose", label: "HMG" },
                  { key: "gnrhaDose", label: "GnRHa" },
                  { key: "antagonistDose", label: "Antagonist" },
                  { key: "ccLetrDose", label: "CC/Letr" },
                  { key: "hcgDose", label: "HCG" },
                ] as const).map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input placeholder="dose" value={(editVisitForm as any)[key] ?? ""} onChange={e => setEditVisitForm((f: any) => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={editVisitForm.notes ?? ""} onChange={e => setEditVisitForm((f: any) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => { setShowEditVisit(false); setEditingVisit(null); }}>Cancel</Button>
            <Button
              onClick={() => {
                if (!editingVisit) return;
                updateVisit.mutate({
                  visitId: editingVisit.id,
                  data: {
                    visitDate: new Date(editVisitForm.visitDate),
                    cycleDay: editVisitForm.cycleDay ?? null,
                    e2: editVisitForm.e2 || null,
                    lh: editVisitForm.lh || null,
                    p4: editVisitForm.p4 || null,
                    endometriumMm: editVisitForm.endometriumMm || null,
                    folliclesRight: parseFollicles(editVisitForm.folliclesRightStr ?? "") ?? null,
                    folliclesLeft: parseFollicles(editVisitForm.folliclesLeftStr ?? "") ?? null,
                    fshDose: editVisitForm.fshDose || null,
                    hmgDose: editVisitForm.hmgDose || null,
                    gnrhaDose: editVisitForm.gnrhaDose || null,
                    antagonistDose: editVisitForm.antagonistDose || null,
                    ccLetrDose: editVisitForm.ccLetrDose || null,
                    hcgDose: editVisitForm.hcgDose || null,
                    notes: editVisitForm.notes || null,
                  },
                });
              }}
              disabled={updateVisit.isPending}
            >
              {updateVisit.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Medications Tab ──────────────────────────────────────────────────────────

function MedicationsTab({ cycleId, medications, isReadOnly, onRefetch }: {
  cycleId: number;
  medications: any[];
  isReadOnly: boolean;
  onRefetch: () => void;
}) {
  const [showAddMed, setShowAddMed] = useState(false);
  const [showEditMed, setShowEditMed] = useState(false);
  const [editingMed, setEditingMed] = useState<any>(null);
  const [medForm, setMedForm] = useState<any>({});
  const [editMedForm, setEditMedForm] = useState<any>({});

  const addMed = trpc.treatmentCycles.addMedication.useMutation({
    onSuccess: () => { toast.success("Medication added"); onRefetch(); setShowAddMed(false); setMedForm({}); },
    onError: (e) => { toast.error((e as any)?.data?.zodError ? "Please check the form fields." : (e.message || "Something went wrong.")); },
  });

  const updateMed = trpc.treatmentCycles.updateMedication.useMutation({
    onSuccess: () => { toast.success("Medication updated"); onRefetch(); setShowEditMed(false); setEditingMed(null); },
    onError: (e) => { toast.error((e as any)?.data?.zodError ? "Please check the form fields." : (e.message || "Something went wrong.")); },
  });

  const deleteMed = trpc.treatmentCycles.deleteMedication.useMutation({
    onSuccess: () => { toast.success("Medication removed"); onRefetch(); },
    onError: (e) => { toast.error(e.message || "Failed to delete medication"); },
  });

  const toggleActive = trpc.treatmentCycles.updateMedication.useMutation({
    onSuccess: () => onRefetch(),
    onError: (e) => { toast.error(e.message || "Failed to update medication"); },
  });

  const openEditMed = (med: any) => {
    setEditingMed(med);
    setEditMedForm({
      ...med,
      startDate: med.startDate ? format(new Date(med.startDate), "yyyy-MM-dd") : "",
      endDate: med.endDate ? format(new Date(med.endDate), "yyyy-MM-dd") : "",
    });
    setShowEditMed(true);
  };

  // MedFormFields inlined directly in dialogs below to avoid focus-loss on re-render

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Protocol Medications ({medications.length})</p>
        {!isReadOnly && (
          <Button size="sm" variant="outline" onClick={() => setShowAddMed(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Medication
          </Button>
        )}
      </div>

      {medications.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No medications in protocol yet</p>
      ) : (
        <div className="space-y-2">
          {medications.map(med => (
            <div key={med.id} className={`flex items-start justify-between p-3 border rounded-lg ${med.isActive ? "" : "opacity-60"}`}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Pill className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span className="font-medium text-sm">{med.medicationName}</span>
                  {!med.isActive && <Badge variant="secondary" className="text-xs">Stopped</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  {med.dose && <span className="mr-3">Dose: {med.dose}</span>}
                  {med.frequency && <span className="mr-3">Freq: {med.frequency}</span>}
                  {med.route && <span className="mr-3">Route: {med.route}</span>}
                  {med.startDate && <span className="mr-3">From: {format(new Date(med.startDate), "MMM d")}</span>}
                  {med.endDate && <span>To: {format(new Date(med.endDate), "MMM d")}</span>}
                </div>
                {med.instructions && <p className="text-xs text-muted-foreground mt-1 italic">{med.instructions}</p>}
              </div>
              {!isReadOnly && (
                <div className="flex items-center gap-1 ml-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500 hover:bg-blue-50"
                    onClick={() => openEditMed(med)}>
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost" size="sm" className="text-xs h-7"
                    onClick={() => toggleActive.mutate({ medId: med.id, data: { isActive: !med.isActive } })}
                  >
                    {med.isActive ? "Stop" : "Resume"}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50"
                    onClick={() => deleteMed.mutate({ medId: med.id })}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Medication Dialog */}
      <Dialog open={showAddMed} onOpenChange={setShowAddMed}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Medication to Protocol</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Medication Name *</Label>
              <Input placeholder="e.g. Gonal-F 150 IU" value={medForm.medicationName ?? ""} onChange={e => setMedForm((f: any) => ({ ...f, medicationName: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Dose</Label>
                <Input placeholder="e.g. 150 IU" value={medForm.dose ?? ""} onChange={e => setMedForm((f: any) => ({ ...f, dose: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Frequency</Label>
                <Input placeholder="e.g. Once daily" value={medForm.frequency ?? ""} onChange={e => setMedForm((f: any) => ({ ...f, frequency: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Route</Label>
                <Input placeholder="e.g. SC, IM, PO" value={medForm.route ?? ""} onChange={e => setMedForm((f: any) => ({ ...f, route: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={medForm.startDate ?? ""} onChange={e => setMedForm((f: any) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={medForm.endDate ?? ""} onChange={e => setMedForm((f: any) => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Instructions for Patient</Label>
              <Textarea rows={2} placeholder="e.g. Inject subcutaneously in the abdomen at the same time each day" value={medForm.instructions ?? ""} onChange={e => setMedForm((f: any) => ({ ...f, instructions: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowAddMed(false)}>Cancel</Button>
            <Button
              onClick={() => addMed.mutate({
                cycleId,
                medicationName: medForm.medicationName,
                dose: medForm.dose || undefined,
                frequency: medForm.frequency || undefined,
                route: medForm.route || undefined,
                startDate: medForm.startDate ? new Date(medForm.startDate) : undefined,
                endDate: medForm.endDate ? new Date(medForm.endDate) : undefined,
                instructions: medForm.instructions || undefined,
              })}
              disabled={addMed.isPending || !medForm.medicationName}
            >
              {addMed.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Add Medication
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Medication Dialog */}
      <Dialog open={showEditMed} onOpenChange={v => { setShowEditMed(v); if (!v) setEditingMed(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Medication</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Medication Name *</Label>
              <Input placeholder="e.g. Gonal-F 150 IU" value={editMedForm.medicationName ?? ""} onChange={e => setEditMedForm((f: any) => ({ ...f, medicationName: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Dose</Label>
                <Input placeholder="e.g. 150 IU" value={editMedForm.dose ?? ""} onChange={e => setEditMedForm((f: any) => ({ ...f, dose: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Frequency</Label>
                <Input placeholder="e.g. Once daily" value={editMedForm.frequency ?? ""} onChange={e => setEditMedForm((f: any) => ({ ...f, frequency: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Route</Label>
                <Input placeholder="e.g. SC, IM, PO" value={editMedForm.route ?? ""} onChange={e => setEditMedForm((f: any) => ({ ...f, route: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={editMedForm.startDate ?? ""} onChange={e => setEditMedForm((f: any) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={editMedForm.endDate ?? ""} onChange={e => setEditMedForm((f: any) => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Instructions for Patient</Label>
              <Textarea rows={2} placeholder="e.g. Inject subcutaneously in the abdomen at the same time each day" value={editMedForm.instructions ?? ""} onChange={e => setEditMedForm((f: any) => ({ ...f, instructions: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => { setShowEditMed(false); setEditingMed(null); }}>Cancel</Button>
            <Button
              onClick={() => {
                if (!editingMed) return;
                updateMed.mutate({
                  medId: editingMed.id,
                  data: {
                    medicationName: editMedForm.medicationName || undefined,
                    dose: editMedForm.dose || null,
                    frequency: editMedForm.frequency || null,
                    route: editMedForm.route || null,
                    startDate: editMedForm.startDate ? new Date(editMedForm.startDate) : null,
                    endDate: editMedForm.endDate ? new Date(editMedForm.endDate) : null,
                    instructions: editMedForm.instructions || null,
                  },
                });
              }}
              disabled={updateMed.isPending || !editMedForm.medicationName}
            >
              {updateMed.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Adherence Tab ────────────────────────────────────────────────────────────

function AdherenceTab({ cycleId, patientId, medications }: {
  cycleId: number;
  patientId: number;
  medications: any[];
}) {
  const [confirmDate, setConfirmDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [confirmNote, setConfirmNote] = useState("");

  const { data: adherence, refetch } = trpc.treatmentCycles.getAdherence.useQuery({ cycleId, patientId });

  const confirm = trpc.treatmentCycles.confirmAdherence.useMutation({
    onSuccess: (data) => {
      if (data.alreadyConfirmed) {
        toast.info("Already confirmed for this date");
      } else {
        toast.success("Medication confirmed!");
      }
      refetch();
      setConfirmNote("");
    },
    onError: (e) => { toast.error(e.message || "Failed to confirm"); },
  });

  const activeMeds = medications.filter(m => m.isActive);
  const confirmedSet = new Set(adherence?.map(a => `${a.medicationId}-${format(new Date(a.scheduledDate), "yyyy-MM-dd")}`) ?? []);

  return (
    <div className="space-y-4 pt-3">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-sm font-medium text-blue-800 flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4" />
          Medication Adherence Confirmation
        </p>
        <p className="text-xs text-blue-600 mt-1">
          Confirm that you have taken each medication as prescribed. Your doctor can see your adherence record.
        </p>
      </div>

      {activeMeds.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No active medications in this cycle</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="space-y-1 flex-1">
              <Label className="text-xs">Confirm for Date</Label>
              <Input type="date" value={confirmDate} onChange={e => setConfirmDate(e.target.value)} className="max-w-[180px]" />
            </div>
          </div>

          <div className="space-y-2">
            {activeMeds.map(med => {
              const key = `${med.id}-${confirmDate}`;
              const isConfirmed = confirmedSet.has(key);
              return (
                <div key={med.id} className={`flex items-center justify-between p-3 border rounded-lg ${isConfirmed ? "border-emerald-200 bg-emerald-50" : ""}`}>
                  <div>
                    <p className="text-sm font-medium">{med.medicationName}</p>
                    <p className="text-xs text-muted-foreground">{med.dose} {med.frequency} {med.route && `· ${med.route}`}</p>
                    {med.instructions && <p className="text-xs text-blue-600 mt-0.5">{med.instructions}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {isConfirmed ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-700 font-medium">
                        <CheckCircle2 className="h-4 w-4" /> Confirmed
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        onClick={() => confirm.mutate({
                          cycleId,
                          medicationId: med.id,
                          patientId,
                          scheduledDate: new Date(confirmDate),
                          notes: confirmNote || undefined,
                        })}
                        disabled={confirm.isPending}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark as Taken
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {adherence && adherence.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Recent Confirmations</p>
              <div className="space-y-1">
                {adherence.slice(-10).reverse().map(a => (
                  <div key={a.id} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{medications.find(m => m.id === a.medicationId)?.medicationName ?? `Med #${a.medicationId}`}</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(a.scheduledDate), "MMM d, yyyy")}
                      <CheckCircle2 className="h-3 w-3 text-emerald-600 ml-1" />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Outcome Tab ──────────────────────────────────────────────────────────────

function OutcomeTab({ cycleId, outcome, isReadOnly, onRefetch }: {
  cycleId: number;
  outcome: any;
  isReadOnly: boolean;
  onRefetch: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<any>({});

  const saveOutcome = trpc.treatmentCycles.saveOutcome.useMutation({
    onSuccess: () => { toast.success("Outcome saved"); onRefetch(); setEditMode(false); },
    onError: (e) => { toast.error((e as any)?.data?.zodError ? "Please check the form fields." : (e.message || "Something went wrong.")); },
  });

  const openEdit = () => {
    setForm({
      totalOocytes: outcome?.totalOocytes ?? "",
      matureOocytes: outcome?.matureOocytes ?? "",
      fertilized: outcome?.fertilized ?? "",
      blastocystCount: outcome?.blastocystCount ?? "",
      transferred: outcome?.transferred ?? "",
      cryopreserved: outcome?.cryopreserved ?? "",
      embryoQuality: outcome?.embryoQuality ?? "",
      triggerDate: outcome?.triggerDate ? format(new Date(outcome.triggerDate), "yyyy-MM-dd") : "",
      opuDate: outcome?.opuDate ? format(new Date(outcome.opuDate), "yyyy-MM-dd") : "",
      transferDate: outcome?.transferDate ? format(new Date(outcome.transferDate), "yyyy-MM-dd") : "",
      hcgLevel: outcome?.hcgLevel ?? "",
      pregnancyTestDate: outcome?.pregnancyTestDate ? format(new Date(outcome.pregnancyTestDate), "yyyy-MM-dd") : "",
      result: outcome?.result ?? "",
      notes: outcome?.notes ?? "",
    });
    setEditMode(true);
  };

  if (!outcome && !editMode) {
    return (
      <div className="text-center py-10 text-muted-foreground pt-6">
        <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No outcome recorded yet</p>
        {!isReadOnly && (
          <Button variant="outline" size="sm" className="mt-3" onClick={openEdit}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Record Outcome
          </Button>
        )}
      </div>
    );
  }

  if (editMode) {
    return (
      <div className="space-y-4 pt-3">
        {/* Key ART dates */}
        <div className="border-b pb-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Key Dates</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { key: "triggerDate", label: "Trigger Date" },
              { key: "opuDate", label: "OPU Date" },
              { key: "transferDate", label: "Transfer Date" },
              { key: "pregnancyTestDate", label: "Pregnancy Test Date" },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input type="date" value={form[key] ?? ""} onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
        </div>

        {/* Lab counts */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { key: "totalOocytes", label: "Total Oocytes" },
            { key: "matureOocytes", label: "Mature (MII)" },
            { key: "fertilized", label: "Fertilized" },
            { key: "blastocystCount", label: "Blastocysts" },
            { key: "transferred", label: "Transferred" },
            { key: "cryopreserved", label: "Cryopreserved" },
            { key: "hcgLevel", label: "HCG Level" },
          ].map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs">{label}</Label>
              <Input
                type={key === "hcgLevel" ? "text" : "number"}
                value={form[key] ?? ""}
                onChange={e => setForm((f: any) => ({ ...f, [key]: key === "hcgLevel" ? e.target.value : (e.target.value ? parseInt(e.target.value) : "") }))}
              />
            </div>
          ))}
          <div className="space-y-1">
            <Label className="text-xs">Result</Label>
            <Select value={form.result ?? ""} onValueChange={v => setForm((f: any) => ({ ...f, result: v }))}>
              <SelectTrigger><SelectValue placeholder="Select result" /></SelectTrigger>
              <SelectContent>{OUTCOME_RESULTS.map(r => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Embryo Quality</Label>
          <Input placeholder="e.g. 2 blastocysts grade AA" value={form.embryoQuality ?? ""} onChange={e => setForm((f: any) => ({ ...f, embryoQuality: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Notes</Label>
          <Textarea rows={3} value={form.notes ?? ""} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => {
            setEditMode(false);
            setForm({
              totalOocytes: outcome?.totalOocytes ?? "",
              matureOocytes: outcome?.matureOocytes ?? "",
              fertilized: outcome?.fertilized ?? "",
              blastocystCount: outcome?.blastocystCount ?? "",
              transferred: outcome?.transferred ?? "",
              cryopreserved: outcome?.cryopreserved ?? "",
              embryoQuality: outcome?.embryoQuality ?? "",
              triggerDate: outcome?.triggerDate ? format(new Date(outcome.triggerDate), "yyyy-MM-dd") : "",
              opuDate: outcome?.opuDate ? format(new Date(outcome.opuDate), "yyyy-MM-dd") : "",
              transferDate: outcome?.transferDate ? format(new Date(outcome.transferDate), "yyyy-MM-dd") : "",
              hcgLevel: outcome?.hcgLevel ?? "",
              pregnancyTestDate: outcome?.pregnancyTestDate ? format(new Date(outcome.pregnancyTestDate), "yyyy-MM-dd") : "",
              result: outcome?.result ?? "",
              notes: outcome?.notes ?? "",
            });
          }}>Cancel</Button>
          <Button
            onClick={() => saveOutcome.mutate({
              cycleId,
              ...form,
              totalOocytes: form.totalOocytes !== "" ? Number(form.totalOocytes) : undefined,
              matureOocytes: form.matureOocytes !== "" ? Number(form.matureOocytes) : undefined,
              fertilized: form.fertilized !== "" ? Number(form.fertilized) : undefined,
              blastocystCount: form.blastocystCount !== "" ? Number(form.blastocystCount) : undefined,
              transferred: form.transferred !== "" ? Number(form.transferred) : undefined,
              cryopreserved: form.cryopreserved !== "" ? Number(form.cryopreserved) : undefined,
              triggerDate: form.triggerDate ? new Date(form.triggerDate) : undefined,
              opuDate: form.opuDate ? new Date(form.opuDate) : undefined,
              transferDate: form.transferDate ? new Date(form.transferDate) : undefined,
              pregnancyTestDate: form.pregnancyTestDate ? new Date(form.pregnancyTestDate) : undefined,
              result: form.result || undefined,
            })}
            disabled={saveOutcome.isPending}
          >
            {saveOutcome.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save Outcome
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Cycle Outcome</p>
        {!isReadOnly && (
          <Button variant="outline" size="sm" onClick={openEdit}>
            <Edit className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
        )}
      </div>
      {outcome.result && (
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${outcomeResultColor[outcome.result] ?? "bg-gray-100 text-gray-600"}`}>
          <TrendingUp className="h-4 w-4" />
          {outcome.result.charAt(0).toUpperCase() + outcome.result.slice(1)}
        </div>
      )}

      {/* Key dates */}
      {(outcome.triggerDate || outcome.opuDate || outcome.transferDate || outcome.pregnancyTestDate) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Trigger Date", value: outcome.triggerDate },
            { label: "OPU Date", value: outcome.opuDate },
            { label: "Transfer Date", value: outcome.transferDate },
            { label: "Pregnancy Test", value: outcome.pregnancyTestDate },
          ].filter(i => i.value).map(item => (
            <div key={item.label} className="bg-muted/40 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-sm font-medium mt-0.5">{format(new Date(item.value), "MMM d, yyyy")}</p>
            </div>
          ))}
        </div>
      )}

      {/* Lab counts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Oocytes", value: outcome.totalOocytes },
          { label: "Mature (MII)", value: outcome.matureOocytes },
          { label: "Fertilized", value: outcome.fertilized },
          { label: "Blastocysts", value: outcome.blastocystCount },
          { label: "Transferred", value: outcome.transferred },
          { label: "Cryopreserved", value: outcome.cryopreserved },
          { label: "HCG Level", value: outcome.hcgLevel },
        ].filter(i => i.value !== null && i.value !== undefined).map(item => (
          <div key={item.label} className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-xl font-bold mt-0.5">{item.value}</p>
          </div>
        ))}
      </div>
      {outcome.embryoQuality && (
        <div>
          <p className="text-xs text-muted-foreground">Embryo Quality</p>
          <p className="text-sm mt-0.5">{outcome.embryoQuality}</p>
        </div>
      )}
      {outcome.notes && (
        <div>
          <p className="text-xs text-muted-foreground">Notes</p>
          <p className="text-sm mt-0.5">{outcome.notes}</p>
        </div>
      )}
    </div>
  );
}
