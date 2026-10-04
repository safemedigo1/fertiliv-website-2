import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getInvoicePdfItemRowLayout, getInvoicePdfServiceNotesStartY } from "./pdfService";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Invoice PDF long-description item layout", () => {
  it("places adjustment, agreed-price, and Tax rows strictly below a wrapped description", () => {
    // A 3-line description plus all three disclosure rows: adjustment, source price, and Tax.
    const layout = getInvoicePdfItemRowLayout(30, [8, 8, 8]);

    expect(layout.descriptionBottom).toBeGreaterThan(layout.descriptionTop);
    expect(layout.detailYs).toHaveLength(3);
    expect(layout.detailYs[0]).toBeGreaterThan(layout.descriptionBottom);
    expect(layout.detailYs[1]).toBeGreaterThan(layout.detailYs[0]);
    expect(layout.detailYs[2]).toBeGreaterThan(layout.detailYs[1]);
    expect(layout.rowHeight).toBeGreaterThan(layout.detailYs[2]);
  });

  it("keeps a short standard row compact without relying on fixed 14px detail slots", () => {
    const layout = getInvoicePdfItemRowLayout(10, []);

    expect(layout.detailYs).toEqual([]);
    expect(layout.rowHeight).toBe(24);
  });

  it("measures the real wrapped description and each disclosure row before rendering the shared Invoice PDF", () => {
    const pdfService = read("server/pdfService.ts");

    expect(pdfService).toContain("const descriptionHeight = doc.heightOfString(descLabel");
    expect(pdfService).toContain("const detailHeights = detailTexts.map((text) => doc.heightOfString(text");
    expect(pdfService).toContain("const rowLayout = getInvoicePdfItemRowLayout(descriptionHeight, detailHeights)");
    expect(pdfService).toContain("y + rowLayout.detailYs[detailIndex]");
    expect(pdfService).toContain("y += rowH");
  });

  it("keeps direct download and Invoice Email attachment on the same corrected renderer", () => {
    const pdfRoutes = read("server/pdfRoutes.ts");
    const routers = read("server/routers.ts");

    expect(pdfRoutes).toContain("generateInvoicePdf({");
    expect(routers).toContain("generateInvoicePdf({");
  });

  it("moves the whole Service Notes block to a footer-safe page when it cannot fit below invoice content", () => {
    expect(getInvoicePdfServiceNotesStartY({
      currentY: 720,
      sectionHeight: 90,
      contentTop: 40,
      contentBottom: 780,
    })).toBe(40);
    expect(getInvoicePdfServiceNotesStartY({
      currentY: 620,
      sectionHeight: 90,
      contentTop: 40,
      contentBottom: 780,
    })).toBe(620);
  });

  it("keeps Service Notes headers attached to notes and reserves the Invoice footer area", () => {
    const pdfService = read("server/pdfService.ts");

    expect(pdfService).toContain("const invoiceContentBottom = pageH - invoiceFooterHeight - 12");
    expect(pdfService).toContain("getInvoicePdfServiceNotesStartY({");
    expect(pdfService).toContain("SERVICE NOTES (CONTINUED)");
    expect(pdfService).toContain("splitPdfTextToFitHeight");
    expect(pdfService).toContain("const proposedNotesY = y + 12");
    expect(pdfService).toContain("sectionHeight: fullSectionHeight");
  });

  it("places the Invoice stamp beside the totals before Payment Options and paints a footer on each buffered page", () => {
    const pdfService = read("server/pdfService.ts");

    expect(pdfService).toContain("const invoiceTotalsTop = y;");
    expect(pdfService).toContain("const invoiceStampX = MARGIN + 6;");
    expect(pdfService).toContain("doc.image(stampBuffer, invoiceStampX, invoiceTotalsTop");
    expect(pdfService).toContain("y = Math.max(y, invoiceTotalsTop + invoiceStampBox.height + 4);");
    expect(pdfService).toContain("const invoicePages = doc.bufferedPageRange()");
    expect(pdfService).toContain("drawInvoiceFooter();");
  });

});
