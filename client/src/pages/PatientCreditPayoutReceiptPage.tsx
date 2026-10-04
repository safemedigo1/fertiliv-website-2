import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { resolvePatientReceiptIdentity } from "@shared/patientReceiptIdentity";
import { FileText, Loader2, Printer } from "lucide-react";

export default function PatientCreditPayoutReceiptPage({ payoutId }: { payoutId: number }) {
  const { data, isLoading, error } = trpc.finance.getPatientCreditPayoutReceipt.useQuery({ payoutId });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-white"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>;
  }
  if (error || !data) {
    return <div className="min-h-screen flex items-center justify-center bg-white p-6 text-center"><div><FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><h1 className="text-xl font-semibold">Patient Credit Payout Receipt unavailable</h1><p className="mt-2 text-sm text-muted-foreground">The payout receipt or its patient identity could not be resolved.</p></div></div>;
  }

  const { payout, patient } = data;
  const identity = resolvePatientReceiptIdentity(patient);
  const receiptNo = `PCP-${String(payout.id).padStart(6, "0")}`;
  const date = new Date(payout.payoutDate ?? payout.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const money = (currency: string, amount: unknown) => `${currency} ${Number(amount ?? 0).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8 print:bg-white print:p-0">
    <section className="mx-auto max-w-3xl rounded-xl bg-white p-6 shadow-sm sm:p-10 print:max-w-none print:shadow-none">
      <header className="flex items-start justify-between gap-4 border-b-4 border-[#140063] pb-5">
        <div><p className="text-lg font-bold tracking-wide text-[#140063]">Fertiliv IVF Center</p><h1 className="mt-5 text-2xl font-bold text-[#140063]">Patient Credit Payout Receipt</h1></div>
        <div className="text-right text-sm text-[#140063]"><strong>{receiptNo}</strong><p className="text-muted-foreground">{date}</p></div>
      </header>
      <div className="mt-6 rounded-lg border p-5"><p className="text-xs text-muted-foreground">Patient</p><p className="font-semibold text-[#140063]">{identity.displayName}</p>{identity.mrn && <p className="mt-1 text-xs text-muted-foreground">MRN: {identity.mrn}</p>}</div>
      <div className="mt-5 rounded-lg border p-5"><p className="text-xs text-muted-foreground">Actual payout</p><p className="mt-1 text-3xl font-bold text-red-700">{money(payout.payoutCurrency, payout.payoutAmount)}</p><p className="mt-4 text-sm">Method: {(payout.method ?? "").replace(/_/g, " ")}</p><p className="mt-2 text-sm">Native Patient Credit reduced: {money(payout.sourceCurrency, payout.sourceCreditAmount)}</p>{payout.conversionRateToPayout && <p className="mt-2 text-sm">FX: 1 {payout.sourceCurrency} = {payout.conversionRateToPayout} {payout.payoutCurrency}</p>}{payout.reference && <p className="mt-2 text-sm">Reference: {payout.reference}</p>}{payout.notes && <p className="mt-2 text-sm">Note: {payout.notes}</p>}</div>
      <p className="mt-6 text-xs text-muted-foreground">This documents a Patient Credit payout. It is not an invoice refund, payment receipt, or external Card reversal.</p>
      <Button className="mt-6 print:hidden" variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print / Save as PDF</Button>
    </section>
  </main>;
}
