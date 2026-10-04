import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, Loader2, Printer } from "lucide-react";
import { format } from "date-fns";
import { fmtDateAge } from "@/lib/dateFormat";
import { useRef } from "react";

interface PatientExportPDFProps {
  patientId: number;
  open: boolean;
  onClose: () => void;
}

export default function PatientExportPDF({ patientId, open, onClose }: PatientExportPDFProps) {
  const { data, isLoading, error } = trpc.patients.exportProfile.useQuery(
    { patientId },
    { enabled: open, retry: 1 }
  );
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Patient Profile — ${data?.patient?.firstName ?? ""} ${data?.patient?.lastName ?? ""}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    h2 { font-size: 13px; margin: 16px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; color: #333; }
    h3 { font-size: 11px; font-weight: bold; margin: 10px 0 4px; color: #555; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .mrn { font-family: monospace; font-size: 12px; color: #666; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
    .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px 12px; }
    .field { margin-bottom: 3px; }
    .label { color: #666; font-size: 10px; }
    .value { font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 10px; }
    th { background: #f0f0f0; text-align: left; padding: 3px 6px; border: 1px solid #ddd; }
    td { padding: 3px 6px; border: 1px solid #ddd; vertical-align: top; }
    .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: bold; }
    .badge-normal { background: #d1fae5; color: #065f46; }
    .badge-high { background: #fee2e2; color: #991b1b; }
    .badge-low { background: #dbeafe; color: #1e40af; }
    .badge-critical { background: #fef3c7; color: #92400e; }
    .page-break { page-break-before: always; }
    @media print { body { padding: 10px; } }
  </style>
</head>
<body>${content.innerHTML}</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  };

  const p = data?.patient as any;
  const intake = data?.intake as any;
  const notes = (data?.notes ?? []) as any[];
  const labOrders = (data?.labOrders ?? []) as any[];
  const labResults = (data?.labResults ?? []) as any[];
  const appointments = (data?.appointments ?? []) as any[];
  const invoices = (data?.invoices ?? []) as any[];

  const fmt = (d: any) => d ? format(new Date(d), "MMM d, yyyy") : "—";
  const fmtDt = (d: any) => d ? format(new Date(d), "MMM d, yyyy HH:mm") : "—";
  // Format snake_case / camelCase status values to readable Title Case
  const fmtLabel = (s: any) => s ? String(s).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase()) : '—';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Patient Profile Export</DialogTitle>
            <div className="flex gap-2">
              <Button size="sm" onClick={handlePrint} disabled={isLoading} className="gap-1.5">
                <Printer className="h-3.5 w-3.5" /> Print / Save as PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading patient data...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load patient data. Please try again.</span>
          </div>
        ) : !p ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <span>No patient data found.</span>
          </div>
        ) : (
          <div ref={printRef} className="text-sm space-y-4 p-2">
            {/* Header */}
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <h1 className="text-xl font-bold">{p?.firstName} {p?.lastName}</h1>
                <div className="flex items-center gap-3 mt-1 text-muted-foreground text-xs">
                  <span className="font-mono font-semibold">{p?.mrn}</span>
                  {p?.gender && <span className="capitalize">{p.gender}</span>}
                  {p?.dateOfBirth && <span>DOB: {fmtDateAge(p.dateOfBirth)}</span>}
                  {p?.bloodType && <span className="text-rose-600 font-semibold">{p.bloodType}</span>}
                </div>
              </div>
              <div className="text-xs text-right text-muted-foreground">
                <div>Exported: {format(new Date(), "MMM d, yyyy HH:mm")}</div>
                <div className="font-semibold mt-0.5">{fmtLabel(p?.status)}</div>
              </div>
            </div>

            {/* Demographics */}
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Demographics</h2>
              <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-xs">
                {p?.phone && <div><span className="text-muted-foreground">Phone: </span>{p.phone}</div>}
                {p?.email && <div><span className="text-muted-foreground">Email: </span>{p.email}</div>}
                {p?.address && <div><span className="text-muted-foreground">Address: </span>{p.address}</div>}
                {p?.nationality && <div><span className="text-muted-foreground">Nationality: </span>{p.nationality}</div>}
                {p?.allergies && <div className="col-span-3 text-amber-700"><span className="font-semibold">⚠ Allergies: </span>{p.allergies}</div>}
                {p?.emergencyContactName && <div><span className="text-muted-foreground">Emergency Contact: </span>{p.emergencyContactName} {p.emergencyContactPhone ? `(${p.emergencyContactPhone})` : ""}</div>}
              </div>
            </section>

            {/* Intake Summary */}
            {intake && (
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Medical Intake</h2>
                <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-xs">
                  {intake.infertilityType && <div><span className="text-muted-foreground">Infertility Type: </span><span className="capitalize">{intake.infertilityType}</span></div>}
                  {intake.infertilityDuration && <div><span className="text-muted-foreground">Duration: </span>{intake.infertilityDuration} months</div>}
                  {intake.referralSource && <div><span className="text-muted-foreground">Referral: </span>{intake.referralSource}</div>}
                  {intake.heightCm && <div><span className="text-muted-foreground">Height: </span>{intake.heightCm} cm</div>}
                  {intake.weightKg && <div><span className="text-muted-foreground">Weight: </span>{intake.weightKg} kg</div>}
                  {intake.bmi && <div><span className="text-muted-foreground">BMI: </span>{intake.bmi}</div>}
                  {intake.gravida !== null && intake.gravida !== undefined && <div><span className="text-muted-foreground">G/P/A/L: </span>{intake.gravida}/{intake.para ?? 0}/{intake.abortus ?? 0}/{intake.livingChildren ?? 0}</div>}
                  {intake.lastMenstrualPeriod && <div><span className="text-muted-foreground">LMP: </span>{fmt(intake.lastMenstrualPeriod)}</div>}
                  {intake.cycleRegularity && <div><span className="text-muted-foreground">Cycle: </span><span className="capitalize">{intake.cycleRegularity}</span></div>}
                  {intake.smoking && <div><span className="text-muted-foreground">Smoking: </span><span className="capitalize">{intake.smoking}</span></div>}
                  {intake.alcohol && <div><span className="text-muted-foreground">Alcohol: </span><span className="capitalize">{intake.alcohol}</span></div>}
                </div>
                {intake.currentMedications && <div className="text-xs mt-1"><span className="text-muted-foreground">Medications: </span>{intake.currentMedications}</div>}
                {intake.allergies && <div className="text-xs mt-1"><span className="text-muted-foreground">Allergies (intake): </span>{intake.allergies}</div>}
              </section>
            )}

            {/* ART History */}
            {intake?.artHistory && (() => {
              try {
                const art = JSON.parse(intake.artHistory as string);
                if (art?.length > 0) return (<>
                  <section>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">ART History</h2>
                    <table className="w-full text-xs border-collapse">
                      <thead><tr className="bg-muted/40">
                        <th className="border px-2 py-1 text-left">Type</th>
                        <th className="border px-2 py-1 text-left">Date</th>
                        <th className="border px-2 py-1 text-left">Clinic</th>
                        <th className="border px-2 py-1 text-left">Protocol</th>
                        <th className="border px-2 py-1 text-left">Eggs</th>
                        <th className="border px-2 py-1 text-left">Fertilized</th>
                        <th className="border px-2 py-1 text-left">Transferred</th>
                        <th className="border px-2 py-1 text-left">Result</th>
                      </tr></thead>
                      <tbody>{art.map((a: any, i: number) => (
                        <tr key={i} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                          <td className="border px-2 py-1">{a.type}</td>
                          <td className="border px-2 py-1">{a.date || "—"}</td>
                          <td className="border px-2 py-1">{a.clinic || "—"}</td>
                          <td className="border px-2 py-1">{a.protocol || "—"}</td>
                          <td className="border px-2 py-1">{a.eggsCollected ?? "—"}</td>
                          <td className="border px-2 py-1">{a.embryosFertilized ?? "—"}</td>
                          <td className="border px-2 py-1">{a.embryosTransferred ?? "—"}</td>
                          <td className="border px-2 py-1">{a.result || "—"}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </section>
                </>);
              } catch { return null; }
            })()}

            {/* Lab Orders & Results */}
            {labOrders.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Lab Orders & Results</h2>
                <table className="w-full text-xs border-collapse">
                  <thead><tr className="bg-muted/40">
                    <th className="border px-2 py-1 text-left">Test</th>
                    <th className="border px-2 py-1 text-left">Category</th>
                    <th className="border px-2 py-1 text-left">Status</th>
                    <th className="border px-2 py-1 text-left">Ordered</th>
                    <th className="border px-2 py-1 text-left">Parameter</th>
                    <th className="border px-2 py-1 text-left">Value</th>
                    <th className="border px-2 py-1 text-left">Flag</th>
                  </tr></thead>
                  <tbody>{labOrders.map((order: any) => {
                    const results = labResults.filter((r: any) => r.labOrderId === order.id);
                    if (results.length === 0) return (
                      <tr key={order.id}>
                        <td className="border px-2 py-1">{order.testName}</td>
                        <td className="border px-2 py-1 capitalize">{order.category}</td>
                        <td className="border px-2 py-1 capitalize">{order.status}</td>
                        <td className="border px-2 py-1">{fmt(order.createdAt)}</td>
                        <td className="border px-2 py-1 text-muted-foreground" colSpan={3}>No results yet</td>
                      </tr>
                    );
                    return results.map((r: any, ri: number) => (
                      <tr key={`${order.id}-${ri}`} className={ri % 2 === 0 ? "" : "bg-muted/20"}>
                        {ri === 0 && <td className="border px-2 py-1" rowSpan={results.length}>{order.testName}</td>}
                        {ri === 0 && <td className="border px-2 py-1 capitalize" rowSpan={results.length}>{order.category}</td>}
                        {ri === 0 && <td className="border px-2 py-1 capitalize" rowSpan={results.length}>{order.status}</td>}
                        {ri === 0 && <td className="border px-2 py-1" rowSpan={results.length}>{fmt(order.createdAt)}</td>}
                        <td className="border px-2 py-1">{r.parameter}</td>
                        <td className="border px-2 py-1">{r.value} {r.unit || ""}</td>
                        <td className="border px-2 py-1 capitalize">{r.flag || "normal"}</td>
                      </tr>
                    ));
                  })}</tbody>
                </table>
              </section>
            )}

            {/* Medical Notes */}
            {notes.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Medical Notes ({notes.length})</h2>
                <div className="space-y-2">
                  {notes.slice(0, 10).map((n: any) => (
                    <div key={n.id} className="border rounded p-2 text-xs">
                      <div className="flex items-center gap-2 mb-1 text-muted-foreground">
                        <span className="font-semibold capitalize">{n.noteType?.replace(/_/g, " ")}</span>
                        <span>·</span>
                        <span>{fmtDt(n.createdAt)}</span>
                        {n.doctorName && <><span>·</span><span>{n.doctorName}</span></>}
                      </div>
                      <p className="text-foreground line-clamp-3">{n.content}</p>
                    </div>
                  ))}
                  {notes.length > 10 && <p className="text-xs text-muted-foreground">... and {notes.length - 10} more notes</p>}
                </div>
              </section>
            )}

            {/* Appointments */}
            {appointments.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Appointments ({appointments.length})</h2>
                <table className="w-full text-xs border-collapse">
                  <thead><tr className="bg-muted/40">
                    <th className="border px-2 py-1 text-left">Date & Time</th>
                    <th className="border px-2 py-1 text-left">Type</th>
                    <th className="border px-2 py-1 text-left">Doctor</th>
                    <th className="border px-2 py-1 text-left">Status</th>
                    <th className="border px-2 py-1 text-left">Notes</th>
                  </tr></thead>
                  <tbody>{appointments.slice(0, 20).map((a: any, i: number) => (
                    <tr key={a.id} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                      <td className="border px-2 py-1">{fmtDt(a.scheduledAt)}</td>
                      <td className="border px-2 py-1 capitalize">{a.appointmentType?.replace(/_/g, " ")}</td>
                      <td className="border px-2 py-1">{a.doctorName || "—"}</td>
                      <td className="border px-2 py-1 capitalize">{a.status}</td>
                      <td className="border px-2 py-1 max-w-xs truncate">{a.notes || "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
                {appointments.length > 20 && <p className="text-xs text-muted-foreground mt-1">... and {appointments.length - 20} more appointments</p>}
              </section>
            )}

            {/* Invoices */}
            {invoices.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Invoices ({invoices.length})</h2>
                <table className="w-full text-xs border-collapse">
                  <thead><tr className="bg-muted/40">
                    <th className="border px-2 py-1 text-left">Invoice #</th>
                    <th className="border px-2 py-1 text-left">Date</th>
                    <th className="border px-2 py-1 text-left">Total</th>
                    <th className="border px-2 py-1 text-left">Paid</th>
                    <th className="border px-2 py-1 text-left">Status</th>
                  </tr></thead>
                  <tbody>{invoices.map((inv: any, i: number) => (
                    <tr key={inv.id} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                      <td className="border px-2 py-1 font-mono">{inv.invoiceNumber}</td>
                      <td className="border px-2 py-1">{fmt(inv.createdAt)}</td>
                      <td className="border px-2 py-1">{Number(inv.totalAmount ?? 0).toLocaleString()} TRY</td>
                      <td className="border px-2 py-1">{Number(inv.paidAmount ?? 0).toLocaleString()} TRY</td>
                      <td className="border px-2 py-1 capitalize">{inv.status}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </section>
            )}

            <div className="text-[10px] text-muted-foreground text-center pt-4 border-t">
              Fertiliv Patient Management System · Confidential Medical Record · Exported {format(new Date(), "PPP")}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
