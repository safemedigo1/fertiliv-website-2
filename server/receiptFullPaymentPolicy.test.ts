import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isOfficialReceiptEligible,
  OFFICIAL_RECEIPT_UNAVAILABLE_MESSAGE,
  type CumulativeReceiptData,
} from "./receiptData";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const activePayment = {
  paymentId: 1,
  paymentDate: new Date("2026-08-06T10:08:00.000Z"),
  method: "Credit card",
  amount: 51_000,
  currency: "TRY",
  settledAmount: 1_071.51,
  showAppliedToInvoice: true,
};

function receipt(overrides: Partial<CumulativeReceiptData> = {}): CumulativeReceiptData {
  return {
    receiptNumber: "REC-INV-TEST",
    invoiceNumber: "INV-TEST",
    patientName: "Test Patient",
    currency: "USD",
    invoiceTotal: 3_700,
    totalSettled: 3_700,
    balanceDue: 0,
    invoiceItems: [],
    includedPayments: [activePayment],
    ...overrides,
  };
}

describe("Receipt Full-Payment Policy Alignment", () => {
  const pdfRoutes = read("server/pdfRoutes.ts");
  const routers = read("server/routers.ts");
  const client = read("client/src/pages/PatientDetailPage.tsx");

  it("RFP-1: denies a receipt with no active payment source", () => {
    expect(isOfficialReceiptEligible(null)).toBe(false);
    expect(isOfficialReceiptEligible(receipt({ includedPayments: [] }))).toBe(false);
  });

  it("RFP-2: denies a partial INV-00023-equivalent settlement", () => {
    expect(isOfficialReceiptEligible(receipt({ totalSettled: 3_571.51, balanceDue: 128.49 }))).toBe(false);
  });

  it("RFP-3: permits an exact fully paid INV-00025-equivalent settlement", () => {
    expect(isOfficialReceiptEligible(receipt({ currency: "TRY", invoiceTotal: 41_400, totalSettled: 41_400 }))).toBe(true);
  });

  it("RFP-4: honors the existing one-cent monetary tolerance", () => {
    expect(isOfficialReceiptEligible(receipt({ totalSettled: 3_699.99, balanceDue: 0.01 }))).toBe(true);
    expect(isOfficialReceiptEligible(receipt({ totalSettled: 3_699.98, balanceDue: 0.02 }))).toBe(false);
  });

  it("RFP-5: protects direct downloads and receipt emails on the server", () => {
    expect(pdfRoutes).toContain("isOfficialReceiptEligible(receiptData)");
    expect(routers).toContain("isOfficialReceiptEligible(receiptData)");
    expect(pdfRoutes).toContain("OFFICIAL_RECEIPT_UNAVAILABLE_MESSAGE");
    expect(routers).toContain("OFFICIAL_RECEIPT_UNAVAILABLE_MESSAGE");
  });

  it("RFP-6: uses the approved partial-invoice business message", () => {
    expect(OFFICIAL_RECEIPT_UNAVAILABLE_MESSAGE).toBe(
      "Official Receipt is available after the invoice has been paid in full. Use the Invoice to show partial payments and the remaining balance.",
    );
  });

  it("RFP-7: leaves PDF Receipt and Send Official Receipt actions paid-only in the client", () => {
    const actionMenu = client.slice(client.indexOf("{/* Actions dropdown"), client.indexOf("Send Invoice Email"));
    expect(actionMenu).toContain('{inv.status === "paid" && (');
    expect(actionMenu).toContain("PDF Receipt");
  });
});
