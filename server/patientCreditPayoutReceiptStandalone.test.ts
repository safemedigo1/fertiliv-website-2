import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const db = readFileSync(resolve(root, "server/db.ts"), "utf8");
const routers = readFileSync(resolve(root, "server/routers.ts"), "utf8");
const app = readFileSync(resolve(root, "client/src/App.tsx"), "utf8");
const patientFinance = readFileSync(resolve(root, "client/src/pages/PatientDetailPage.tsx"), "utf8");
const receiptPage = readFileSync(resolve(root, "client/src/pages/PatientCreditPayoutReceiptPage.tsx"), "utf8");

describe("standalone Patient Credit Payout receipt identity", () => {
  it("opens the receipt through a durable payout-ID URL rather than transient parent-page HTML", () => {
    expect(patientFinance).toContain("/finance/payout-receipts/${payoutId}");
    expect(app).toContain('path="/finance/payout-receipts/:payoutId"');
    expect(patientFinance).not.toContain('function exportPatientCreditPayoutPDF');
  });

  it("resolves payout to the authoritative patient identity server-side and enforces Test scope", () => {
    expect(db).toContain("getPatientCreditPayoutReceipt");
    expect(db).toContain(".innerJoin(patients, eq(patientCreditPayouts.patientId, patients.id))");
    expect(routers).toContain("getPatientCreditPayoutReceipt: staffOrAdminProcedure");
    expect(routers).toContain("Only Admin can view Test Patient Credit payout receipts.");
    expect(receiptPage).toContain("trpc.finance.getPatientCreditPayoutReceipt.useQuery({ payoutId })");
  });

  it("renders name and MRN from the resolved patient on direct open or refresh, with fallback only for genuine absence", () => {
    expect(receiptPage).toContain("resolvePatientReceiptIdentity(patient)");
    expect(receiptPage).toContain("MRN: {identity.mrn}");
    expect(receiptPage).toContain("The payout receipt or its patient identity could not be resolved.");
  });
});
