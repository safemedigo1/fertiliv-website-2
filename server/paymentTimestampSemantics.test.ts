import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Payment timestamp semantics", () => {
  const client = read("client/src/pages/PatientDetailPage.tsx");
  const pdfRoutes = read("server/pdfRoutes.ts");
  const routers = read("server/routers.ts");

  it("orders Payment Received timeline events by receivedAt with a createdAt legacy fallback", () => {
    expect(client).toContain("const receivedDate = new Date(p.receivedAt ?? p.createdAt)");
    expect(client).toContain("date: receivedDate");
    expect(client).toContain("txns.sort((a, b) => b.date.getTime() - a.date.getTime())");
  });

  it("shows Recorded in Fertiliv only when a real receivedAt materially differs from creation", () => {
    expect(client).toContain("showRecordedAt");
    expect(client).toContain("Recorded in Fertiliv:");
    expect(client).toContain("5 * 60 * 1000");
  });

  it("shows payment history with Received and conditional Recorded labels", () => {
    expect(client).toContain("Received: ${format(new Date(p.receivedAt)");
    expect(client).toContain("Recorded: {format(new Date(p.createdAt)");
  });

  it("uses receivedAt first for direct and emailed Invoice PDF payment details", () => {
    expect(pdfRoutes).toContain("new Date(p.receivedAt ?? p.createdAt)");
    expect(routers).toContain("new Date(p.receivedAt ?? p.createdAt)");
  });

  it("leaves cumulative receipt date rendering to receipt-specific semantics", () => {
    const receiptStart = pdfRoutes.indexOf("Official Receipt PDF");
    const receiptBody = pdfRoutes.slice(receiptStart, receiptStart + 4000);
    expect(receiptBody).toContain("buildCumulativeReceiptData");
    expect(receiptBody).not.toContain("mostRecent.createdAt");
  });
});
