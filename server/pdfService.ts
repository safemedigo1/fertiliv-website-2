/**
 * Fertiliv PDF Service
 * Generates invoice and refund receipt PDFs using PDFKit (pure Node.js).
 * Uses Quicksand (Latin) and Tajawal (Arabic) fonts.
 * Detects Arabic text and renders it RTL automatically.
 */

import PDFDocument from "pdfkit";
import { getInvoicePdfLineDiscountDisplay, shouldShowInvoiceLineDiscountColumn } from "../shared/invoicePdfLineDiscount";
import { isMethodNeutralSettlementModel } from "../shared/serviceTax";
import { deriveInvoiceDualBalancePresentation } from "../shared/invoiceDualBalance";
import { formatInvoiceLineDisplayName } from "../shared/invoiceLineDisplay";
import { deriveInvoiceLineDiscountPresentation } from "../shared/invoiceLineDiscount";
import path from "path";
import { fileURLToPath } from "url";
import { getClinicInfo } from "./db";
import { storageGetBytes } from "./storage";
import { createLegacyExternalReportDocument, type ExternalReportDocument } from "./externalReportDocument";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In dev: __dirname = server/ (tsx runs from source)
// In prod: __dirname = dist/ (esbuild bundles to dist/index.js, fonts copied to dist/fonts/)
// Try both locations to be robust
function resolveFontPath(filename: string): string {
  const candidates = [
    path.join(__dirname, "fonts", filename),
    path.join(__dirname, "..", "server", "fonts", filename),
    path.join(process.cwd(), "server", "fonts", filename),
    path.join(process.cwd(), "dist", "fonts", filename),
  ];
  for (const p of candidates) {
    try {
      const fs = require("fs");
      if (fs.existsSync(/*turbopackIgnore: true*/ p)) return p;
    } catch { /* ignore */ }
  }
  // Fallback to original path
  return path.join(__dirname, "fonts", filename);
}

// Font paths
const FONT = {
  regular: resolveFontPath("Quicksand-Regular.ttf"),
  bold:    resolveFontPath("Quicksand-Bold.ttf"),
  arRegular: resolveFontPath("Tajawal-Regular.ttf"),
  arBold:    resolveFontPath("Tajawal-Bold.ttf"),
};

// Brand colors
const DARK_PURPLE = "#1E0566";
const LIGHT_PINK  = "#E3B2B0";
const PEACH       = "#E5BA99";
const LIGHT_BG    = "#F9F5FF";
const GRAY        = "#6B7280";
const LIGHT_GRAY  = "#E5E7EB";

function renderFxAuditNote(note?: string | null): string | null {
  const trimmed = note?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^note\s*:\s*/i, "");
}

export interface InvoicePdfData {
  invoiceNumber: string;
  patientName: string;
  mrn?: string;
  issueDate: string;
  dueDate?: string;
  currency: string;
  subtotal: number;
  discountAmount?: number;
  discountPercent?: number;
  taxAmount?: number;
  taxModelVersion?: string | null;
  settlementModelVersion?: string | null;
  totalAmount: number;
  paidAmount?: number;
  status: string;
  notes?: string;
  /** Immutable legacy payment-adjustment snapshot, when the invoice has one. */
  cardSurchargePct?: number;
  pricingMode?: string;
  paymentDetails?: Array<{
    date: string;
    method: string;
    amount: number;
    currency?: string;
    /** Gross converted payment value before settlement is capped. */
    convertedAmountInInvoiceCurrency?: number;
    /** Persisted allocation actually settled to this invoice. */
    settledAmount?: number;
    invoiceCurrency?: string;
    conversionRateToInvoice?: string;
    fxRateSource?: "system" | "manual" | null;
    fxRateNote?: string | null;
    bankGrossAmountSent?: number | null;
    bankDeductionAmount?: number | null;
    bankDeductionPercent?: number | null;
    /** Immutable native Patient Credit lots actually created from this payment. */
    patientCredits?: Array<{ currency: string; amount: number }>;
  }>;
  items: Array<{
    description: string;
    lineLabel?: string | null;
    serviceDescription?: string | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    linePricingMethod?: "none" | "discount_percent" | "final_line_total" | "agreed_unit_price";
    lineDiscountPercent?: number | null;
    originalLineTotal?: number;
    taxLabelSnapshot?: string | null;
    taxRateSnapshot?: number | null;
    effectiveTaxableBase?: number | null;
    taxAmount?: number | null;
    priceEntryCurrency?: string | null;
    priceEntryAmount?: number | null;
    priceEntryKind?: "unit_price" | "final_line_total" | "tax_included_final_line_total" | "agreed_unit_price" | "tax_included_agreed_unit_price" | null;
    priceFxRateToInvoice?: string | null;
    priceFxSource?: "system" | "manual" | null;
    priceFxNote?: string | null;
  }>;
}

export interface ProposalPdfData {
  proposalCode: string;
  patientName: string;
  mrn?: string;
  issueDate: string;
  currency: string;
  totalAmount: number;
  appliedPriceType: string;
  notes?: string;
  cardSurchargePct?: number;
  items: Array<{
    serviceName?: string;
    description: string;
    serviceDescription?: string | null;
    quantity: number;
    unitPrice: number;
    discount?: number;
    totalPrice: number;
  }>;
}

export interface RefundPdfData {
  invoiceNumber: string;
  patientName: string;
  mrn?: string;
  refundDate: string;
  currency: string;
  refundAmount: number;
  reason?: string;
  notes?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtFxRate(rate: string): string {
  const numericRate = Number(rate);
  return Number.isFinite(numericRate)
    ? numericRate.toLocaleString("en", { useGrouping: false, maximumFractionDigits: 12 })
    : rate;
}

function isArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function pdfColor(doc: PDFKit.PDFDocument, hex: string) {
  doc.fillColor(hexToRgb(hex) as unknown as string);
}

function pdfStroke(doc: PDFKit.PDFDocument, hex: string) {
  doc.strokeColor(hexToRgb(hex) as unknown as string);
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    paid: "#065f46", issued: "#1e40af", partial: "#92400e",
    overdue: "#991b1b", draft: "#374151", cancelled: "#374151",
  };
  return map[status] ?? "#374151";
}

function statusBg(status: string): string {
  const map: Record<string, string> = {
    paid: "#d1fae5", issued: "#dbeafe", partial: "#fef3c7",
    overdue: "#fee2e2", draft: "#f3f4f6", cancelled: "#f3f4f6",
  };
  return map[status] ?? "#f3f4f6";
}

async function bufferFromDoc(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

/**
 * Fetch an image from a signed S3 URL and return as Buffer for PDFKit.
 */
async function fetchImageBuffer(storageKey: string): Promise<Buffer | null> {
  try {
    // Strip /api/storage/ or /manus-storage/ prefix so storageGetBytes gets the raw key
    const cleanKey = storageKey
      .replace(/^\/api\/storage\//, "")
      .replace(/^\/manus-storage\//, "");
    const { data } = await storageGetBytes(cleanKey);
    return data;
  } catch {
    return null;
  }
}

/**
 * Load clinic info + logo buffer from DB/S3.
 * logoVariant: 'en_light' | 'en_dark' | 'ar_light' | 'ar_dark'
 */
async function loadClinicAssets(logoVariant: "en_light" | "en_dark" | "ar_light" | "ar_dark" = "en_dark") {
  const info = await getClinicInfo().catch(() => null);
  if (!info) return { info: null, logoBuffer: null, stampBuffer: null };
  const logoKey = {
    en_light: info.logoEnLightKey,
    en_dark:  info.logoEnDarkKey,
    ar_light: info.logoArLightKey,
    ar_dark:  info.logoArDarkKey,
  }[logoVariant];
  const [logoBuffer, stampBuffer] = await Promise.all([
    logoKey ? fetchImageBuffer(logoKey) : Promise.resolve(null),
    info.stampKey ? fetchImageBuffer(info.stampKey) : Promise.resolve(null),
  ]);
  return { info, logoBuffer, stampBuffer };
}

/**
 * Smart text renderer: detects Arabic and uses Tajawal + RTL alignment.
 * Falls back to Quicksand for Latin text.
 */
function smartText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  opts: PDFKit.Mixins.TextOptions & { bold?: boolean; fontSize?: number } = {}
) {
  const arabic = isArabic(text);
  const { bold = false, fontSize, ...pdfOpts } = opts;

  if (fontSize) doc.fontSize(fontSize);

  if (arabic) {
    doc.font(bold ? FONT.arBold : FONT.arRegular);
    // RTL: right-align by default unless caller specifies
    if (!pdfOpts.align) pdfOpts.align = "right";
    if (!pdfOpts.features) pdfOpts.features = ["rtla"];
  } else {
    doc.font(bold ? FONT.bold : FONT.regular);
  }

  doc.text(text, x, y, pdfOpts);
}

/**
 * Keeps the Invoice item description block and its optional disclosure rows
 * vertically disjoint. The renderer supplies measured heights, so this stays
 * independent of financial values and can be regression-tested directly.
 */
export function getInvoicePdfItemRowLayout(descriptionHeight: number, detailHeights: number[]) {
  const descriptionTop = 7;
  const descriptionBottom = descriptionTop + Math.max(descriptionHeight, 10);
  const detailGap = detailHeights.length > 0 ? 4 : 0;
  let cursor = descriptionBottom + detailGap;
  const detailYs = detailHeights.map((height) => {
    const y = cursor;
    cursor += Math.max(height, 8) + 3;
    return y;
  });

  return {
    descriptionTop,
    descriptionBottom,
    detailYs,
    rowHeight: Math.max(24, cursor + 4),
  };
}

export function getInvoicePdfServiceNotesStartY(input: {
  currentY: number;
  sectionHeight: number;
  contentTop: number;
  contentBottom: number;
}) {
  return input.currentY + input.sectionHeight <= input.contentBottom
    ? input.currentY
    : input.contentTop;
}

function splitPdfTextToFitHeight(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  maxHeight: number,
) {
  const tokens = text.match(/\S+\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const token of tokens) {
    const candidate = `${current}${token}`;
    if (current && doc.heightOfString(candidate, { width }) > maxHeight) {
      chunks.push(current.trimEnd());
      current = token;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trimEnd());
  return chunks.length > 0 ? chunks : [text];
}

// ─── Invoice PDF ──────────────────────────────────────────────────────────────

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  // Load clinic info and logo assets
  const { info: clinic, logoBuffer, stampBuffer } = await loadClinicAssets("en_dark");
  const clinicName = clinic?.nameEn ?? "Fertiliv";
  const clinicSlogan = clinic?.sloganEn ?? "Fertility Clinic";
  const clinicEmail = clinic?.email ?? "info@fertiliv.com";
  const clinicWhatsapp = clinic?.whatsapp ?? "+90 501 114 70 60";
  const clinicAddress = clinic?.addressEn ?? "";
  const waLink = clinicWhatsapp ? `https://wa.me/${clinicWhatsapp.replace(/\D/g, "")}` : null;

  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
  const W = 595.28;
  const MARGIN = 40;
  const contentW = W - MARGIN * 2;
  const pageH = 841.89;
  const invoiceFooterHeight = 50;
  const invoiceContentBottom = pageH - invoiceFooterHeight - 12;
  const drawInvoiceFooter = () => {
    doc.rect(0, pageH - invoiceFooterHeight, W, invoiceFooterHeight).fill(hexToRgb(DARK_PURPLE) as unknown as string);
    doc.font("Regular").fontSize(8);
    pdfColor(doc, LIGHT_PINK);
    const footerParts = [clinicName, clinicEmail, clinicWhatsapp].filter(Boolean).join("  |  ");
    doc.text(footerParts, MARGIN, pageH - 32, { width: contentW, align: "center" });
    doc.font("Regular").fontSize(7);
    pdfColor(doc, PEACH);
    doc.text(`Thank you for choosing ${clinicName}`, MARGIN, pageH - 18, { width: contentW, align: "center" });
  };

  // Register fonts
  doc.registerFont("Regular",   FONT.regular);
  doc.registerFont("Bold",      FONT.bold);
  doc.registerFont("ArRegular", FONT.arRegular);
  doc.registerFont("ArBold",    FONT.arBold);

  // ── Header band ───────────────────────────────────────────────────────────────────
  doc.rect(0, 0, W, 110).fill(hexToRgb(DARK_PURPLE) as unknown as string);

  // Logo or clinic name
  if (logoBuffer) {
    try { doc.image(logoBuffer, MARGIN, 18, { height: 70, fit: [180, 70] }); } catch { /* fallback to text */ }
  }
  if (!logoBuffer) {
    doc.font("Bold").fontSize(22);
    pdfColor(doc, "#FFFFFF");
    doc.text(clinicName, MARGIN, 28);
    doc.font("Regular").fontSize(10);
    pdfColor(doc, LIGHT_PINK);
    doc.text(clinicSlogan, MARGIN, 54);
  }

  // Invoice label (right side)
  doc.font("Bold").fontSize(18);
  pdfColor(doc, "#FFFFFF");
  doc.text("INVOICE", W - MARGIN - 100, 28, { width: 100, align: "right" });

  doc.font("Regular").fontSize(10);
  pdfColor(doc, PEACH);
  doc.text(data.invoiceNumber ?? "", W - MARGIN - 160, 54, { width: 160, align: "right" });

  // Status badge
  const sbg = statusBg(data.status);
  const stxt = statusColor(data.status);
  doc.roundedRect(W - MARGIN - 80, 72, 80, 22, 4).fill(hexToRgb(sbg) as unknown as string);
  doc.font("Bold").fontSize(9);
  pdfColor(doc, stxt);
  doc.text(data.status.toUpperCase(), W - MARGIN - 80, 79, { width: 80, align: "center" });

  // ── Gradient divider ─────────────────────────────────────────────────────
  // Simulate gradient with two rects
  doc.rect(0, 110, W / 2, 4).fill(hexToRgb(LIGHT_PINK) as unknown as string);
  doc.rect(W / 2, 110, W / 2, 4).fill(hexToRgb(PEACH) as unknown as string);

  // ── Info row ─────────────────────────────────────────────────────────────
  let y = 130;
  const col2 = MARGIN + contentW / 2;

  // Left: patient (may be Arabic)
  doc.font("Bold").fontSize(9);
  pdfColor(doc, GRAY);
  doc.text("BILLED TO", MARGIN, y);
  y += 14;
  pdfColor(doc, DARK_PURPLE);
  // Measure the actual rendered height of the patient name to avoid MRN overlap
  const nameWidth = contentW / 2 - 10;
  doc.font("Bold").fontSize(11);
  const nameHeight = doc.heightOfString(data.patientName, { width: nameWidth });
  smartText(doc, data.patientName, MARGIN, y, { bold: true, fontSize: 11, width: nameWidth });
  if (data.mrn) {
    y += Math.max(nameHeight + 4, 16);
    doc.font("Regular").fontSize(9);
    pdfColor(doc, GRAY);
    doc.text(`MRN: ${data.mrn}`, MARGIN, y);
  } else {
    y += Math.max(nameHeight + 4, 16);
  }

  // Right: dates
  let ry = 130;
  doc.font("Bold").fontSize(9);
  pdfColor(doc, GRAY);
  doc.text("ISSUE DATE", col2, ry, { width: contentW / 2, align: "right" });
  ry += 14;
  doc.font("Regular").fontSize(10);
  pdfColor(doc, DARK_PURPLE);
  doc.text(data.issueDate ?? "", col2, ry, { width: contentW / 2, align: "right" });
  if (data.dueDate) {
    ry += 18;
    doc.font("Bold").fontSize(9);
    pdfColor(doc, GRAY);
    doc.text("DUE DATE", col2, ry, { width: contentW / 2, align: "right" });
    ry += 14;
    doc.font("Regular").fontSize(10);
    pdfColor(doc, DARK_PURPLE);
    doc.text(data.dueDate, col2, ry, { width: contentW / 2, align: "right" });
  }

  // ── Divider ───────────────────────────────────────────────────────────────
  y = Math.max(y + 16, ry + 16);
  pdfStroke(doc, LIGHT_GRAY);
  doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).stroke();
  y += 16;

  // ── Items table header ────────────────────────────────────────────────────
  // DISC% is conditional on an effective line-level discount. An overall
  // invoice discount remains in the summary block and is never copied to rows.
  const showLineDiscountColumn = shouldShowInvoiceLineDiscountColumn(data.items);
  const INV_HEADER_H = 22;
  doc.rect(MARGIN, y, contentW, INV_HEADER_H).fill(hexToRgb(DARK_PURPLE) as unknown as string);
  doc.font("Bold").fontSize(9);
  pdfColor(doc, "#FFFFFF");
  const colW = showLineDiscountColumn
    ? [contentW * 0.44, contentW * 0.11, contentW * 0.18, contentW * 0.09, contentW * 0.18]
    : [contentW * 0.49, contentW * 0.11, contentW * 0.20, contentW * 0.20];
  const colX = colW.reduce<number[]>((positions, width, index) => {
    positions.push(index === 0 ? MARGIN + 6 : positions[index - 1] + colW[index - 1]);
    return positions;
  }, []);
  const totalColumnIndex = showLineDiscountColumn ? 4 : 3;
  doc.text("DESCRIPTION", colX[0], y + 7, { width: colW[0] - 6 });
  doc.text("QTY",         colX[1], y + 7, { width: colW[1] - 6, align: "center" });
  doc.text("UNIT PRICE",  colX[2], y + 7, { width: colW[2] - 6, align: "right" });
  if (showLineDiscountColumn) {
    doc.text("DISC%", colX[3], y + 7, { width: colW[3] - 6, align: "right" });
  }
  doc.text("TOTAL", colX[totalColumnIndex], y + 7, { width: colW[totalColumnIndex] - 6, align: "right" });
  y += INV_HEADER_H;

  // ── Build footnotes list (only items with a non-empty serviceDescription) ──
  const invFootnotes: Array<{ idx: number; name: string; desc: string }> = [];
  data.items.forEach((item, idx) => {
    if (item.serviceDescription?.trim()) {
      invFootnotes.push({ idx: invFootnotes.length + 1, name: formatInvoiceLineDisplayName(item.description, item.lineLabel), desc: item.serviceDescription.trim() });
    }
  });

  // ── Items ─────────────────────────────────────────────────────────────────
  let footnoteCounter = 0;
  data.items.forEach((item, idx) => {
    const hasAdjustedLineTotal = item.originalLineTotal != null && Math.abs(item.totalPrice - item.originalLineTotal) > 0.005;
    const derivedDiscount = deriveInvoiceLineDiscountPresentation({
      originalLineTotal: item.originalLineTotal,
      finalLineTotal: item.totalPrice,
    });
    const hasTaxDetails = !!item.taxLabelSnapshot && ((item.taxAmount ?? 0) > 0.005 || item.taxLabelSnapshot === "Custom Tax");
    const hasSourcePriceDetails = !!item.priceEntryCurrency && item.priceEntryAmount != null;
    const descLabel = formatInvoiceLineDisplayName(item.description, item.lineLabel);
    const hasFootnote = !!item.serviceDescription?.trim();
    if (hasFootnote) footnoteCounter++;
    const superscript = hasFootnote ? String(footnoteCounter) : "";
    const descriptionWidth = colW[0] - (hasFootnote ? 18 : 12);
    const detailWidth = colW[0] + colW[1] + colW[2] - 12;
    const isTaxIncludedSourcePrice = item.priceEntryKind === "tax_included_final_line_total" || item.priceEntryKind === "tax_included_agreed_unit_price";
    const isAgreedUnitSourcePrice = item.priceEntryKind === "agreed_unit_price" || item.priceEntryKind === "tax_included_agreed_unit_price";
    const canonicalGross = isTaxIncludedSourcePrice
      ? Number(item.effectiveTaxableBase ?? item.totalPrice) + Number(item.taxAmount ?? 0)
      : item.totalPrice;
    const sourceLabel = isAgreedUnitSourcePrice
      ? (isTaxIncludedSourcePrice ? "Agreed gross unit price" : "Agreed unit price")
      : (isTaxIncludedSourcePrice ? "Agreed gross" : "Negotiated price");
    const sourceAmountDisplay = `${item.priceEntryCurrency} ${fmt(item.priceEntryAmount ?? 0)}${isAgreedUnitSourcePrice ? ` × ${item.quantity}` : ""}`;
    const fxDetail = item.priceEntryCurrency === data.currency
      ? `${sourceLabel}: ${sourceAmountDisplay} (same currency)`
      : `${sourceLabel}: ${sourceAmountDisplay} → ${data.currency} ${fmt(canonicalGross)} · FX ${item.priceFxSource === "manual" ? "Manual" : "System"}${item.priceFxRateToInvoice ? ` (1 ${item.priceEntryCurrency} = ${fmtFxRate(item.priceFxRateToInvoice)} ${data.currency})` : ""}`;
    const rateLabel = item.taxRateSnapshot != null ? ` (${Number(item.taxRateSnapshot).toFixed(2)}%)` : "";
    const detailTexts = [
      ...(hasAdjustedLineTotal ? [`Original line total: ${data.currency} ${fmt(item.originalLineTotal!)}`] : []),
      ...(derivedDiscount.applies ? [`Discount (${derivedDiscount.discountPercent}%): - ${data.currency} ${derivedDiscount.discountAmount}`] : []),
      ...(hasSourcePriceDetails ? [fxDetail] : []),
      ...(hasTaxDetails ? [`${item.taxLabelSnapshot}${rateLabel}: ${data.currency} ${fmt(item.taxAmount ?? 0)}`] : []),
    ];

    doc.font(isArabic(descLabel) ? FONT.arRegular : FONT.regular).fontSize(9);
    const descriptionHeight = doc.heightOfString(descLabel, {
      width: descriptionWidth,
      ...(isArabic(descLabel) ? { align: "right", features: ["rtla"] } : {}),
    });
    doc.font("Regular").fontSize(7);
    const detailHeights = detailTexts.map((text) => doc.heightOfString(text, { width: detailWidth }));
    const rowLayout = getInvoicePdfItemRowLayout(descriptionHeight, detailHeights);
    const rowH = rowLayout.rowHeight;
    if (idx % 2 === 1) {
      doc.rect(MARGIN, y, contentW, rowH).fill(hexToRgb(LIGHT_BG) as unknown as string);
    }
    pdfColor(doc, DARK_PURPLE);
    // Description may be Arabic — render it
    smartText(doc, descLabel, colX[0], y + rowLayout.descriptionTop, { fontSize: 9, width: descriptionWidth });
    if (hasFootnote) {
      // Render superscript number in teal
      doc.fontSize(9);
      const descWidth = doc.widthOfString(descLabel);
      const supX = Math.min(colX[0] + descWidth + 2, colX[0] + colW[0] - 16);
      doc.font("Bold").fontSize(7);
      pdfColor(doc, "#2A7B9B");
      doc.text(superscript, supX, y + 5, { width: 12 });
    }
    // Numbers are always Latin
    doc.font("Regular").fontSize(9);
    pdfColor(doc, DARK_PURPLE);
    doc.text(String(item.quantity),                         colX[1], y + 7, { width: colW[1] - 6, align: "center" });
    doc.text(`${data.currency} ${fmt(item.unitPrice)}`,    colX[2], y + 7, { width: colW[2] - 6, align: "right" });
    const lineDiscountDisplay = getInvoicePdfLineDiscountDisplay(item);
    if (showLineDiscountColumn) {
      doc.text(lineDiscountDisplay ?? "—",
        colX[3], y + 7, { width: colW[3] - 6, align: "right" });
    }
    doc.text(`${data.currency} ${fmt(item.totalPrice)}`, colX[totalColumnIndex], y + 7, { width: colW[totalColumnIndex] - 6, align: "right" });
    detailTexts.forEach((detailText, detailIndex) => {
      doc.font("Regular").fontSize(7);
      pdfColor(doc, GRAY);
      doc.text(detailText, colX[0], y + rowLayout.detailYs[detailIndex], { width: detailWidth });
    });
    y += rowH;
  });

  // ── Totals ────────────────────────────────────────────────────────────────
  // Keep the totals block and its adjacent stamp inside the printable area together.
  if (stampBuffer && y + 170 > invoiceContentBottom) {
    doc.addPage();
    y = MARGIN;
  }
  y += 10;
  pdfStroke(doc, LIGHT_GRAY);
  doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).stroke();
  y += 10;
  const invoiceTotalsTop = y;

  const totalsX  = W - MARGIN - 200;
  const totalsLW = 110;
  const totalsVW = 90;

  const addTotalRow = (label: string, value: string, bold = false, rowHeight = bold ? 18 : 15, fontSize = bold ? 10 : 9) => {
    doc.font(bold ? "Bold" : "Regular").fontSize(fontSize);
    pdfColor(doc, GRAY);
    doc.text(label, totalsX, y, { width: totalsLW, height: rowHeight });
    pdfColor(doc, DARK_PURPLE);
    doc.font(bold ? "Bold" : "Regular").fontSize(fontSize);
    doc.text(value, totalsX + totalsLW, y, { width: totalsVW, align: "right" });
    y += rowHeight;
  };

  const isTaxModelInvoice = data.taxModelVersion === "line_tax_v1";
  addTotalRow(isTaxModelInvoice ? "Service Total" : "Subtotal", `${data.currency} ${fmt(data.subtotal)}`);
  // Show Discount line for both Mode A and Mode B
  const invoiceDiscountAmt = data.pricingMode === "agreed"
    ? Math.max(0, data.subtotal - data.totalAmount)
    : (data.discountAmount ?? 0);
  if (invoiceDiscountAmt > 0.005) {
    const discLabel = data.pricingMode === "agreed"
      ? "Overall Discount"
      : (data.discountPercent
      ? `Discount (${data.discountPercent}%)`
      : "Discount");
    addTotalRow(discLabel, `- ${data.currency} ${fmt(invoiceDiscountAmt)}`);
  }
  const hasCustomTaxSnapshot = data.items.some(item => item.taxLabelSnapshot === "Custom Tax");
  if ((data.taxAmount ?? 0) > 0 || hasCustomTaxSnapshot) {
    addTotalRow(isTaxModelInvoice ? "Service Tax" : "Tax", `${data.currency} ${fmt(data.taxAmount ?? 0)}`);
  }

  y += 4;
  doc.rect(totalsX - 10, y - 4, 200 + 10, 28).fill(hexToRgb(DARK_PURPLE) as unknown as string);
  doc.font("Bold").fontSize(11);
  pdfColor(doc, "#FFFFFF");
  doc.text(isTaxModelInvoice ? "PATIENT TOTAL" : "TOTAL", totalsX, y + 4, { width: totalsLW });
  doc.text(`${data.currency} ${fmt(data.totalAmount)}`, totalsX + totalsLW, y + 4, { width: totalsVW, align: "right" });
  y += 32;

  const dualBalancePresentation = deriveInvoiceDualBalancePresentation({
    totalAmount: data.totalAmount,
    taxAmount: data.taxAmount ?? 0,
    netSettled: data.paidAmount ?? 0,
    taxModelVersion: data.taxModelVersion ?? null,
  });
  const canonicalBalance = Number(dualBalancePresentation.totalBalanceDueIncludingTax);

  if ((data.paidAmount ?? 0) > 0) {
    addTotalRow("Paid", `${data.currency} ${fmt(data.paidAmount ?? 0)}`);
  }
  if (dualBalancePresentation.shouldShowRemainingServiceAmountBeforeTax) {
    addTotalRow("Remaining Service Amount\n(Before Tax)", `${data.currency} ${dualBalancePresentation.remainingServiceAmountBeforeTax}`, false, 24, 7.5);
    doc.rect(totalsX - 10, y - 4, 200 + 10, 34).fill(hexToRgb(PEACH) as unknown as string);
    doc.font("Bold").fontSize(8);
    pdfColor(doc, DARK_PURPLE);
    doc.text("TOTAL BALANCE DUE\n(INCLUDING TAX)", totalsX, y + 3, { width: totalsLW, height: 26 });
    doc.font("Bold").fontSize(10);
    doc.text(`${data.currency} ${fmt(canonicalBalance)}`, totalsX + totalsLW, y + 10, { width: totalsVW, align: "right" });
    y += 38;
  } else if ((data.paidAmount ?? 0) > 0 && canonicalBalance > 0) {
      doc.rect(totalsX - 10, y - 4, 200 + 10, 26).fill(hexToRgb(PEACH) as unknown as string);
      doc.font("Bold").fontSize(10);
      pdfColor(doc, DARK_PURPLE);
      doc.text("BALANCE DUE", totalsX, y + 2, { width: totalsLW });
      doc.text(`${data.currency} ${fmt(canonicalBalance)}`, totalsX + totalsLW, y + 2, { width: totalsVW, align: "right" });
      y += 30;
  }

  // ── Clinic stamp — left of, and vertically anchored to, the totals block ─────────
  // This preserves the stamp's native proportions and reserves its box before later content.
  if (stampBuffer) {
    const invoiceStampBox = { width: 128, height: 88 };
    const invoiceStampX = MARGIN + 6;
    try {
      doc.image(stampBuffer, invoiceStampX, invoiceTotalsTop, {
        fit: [invoiceStampBox.width, invoiceStampBox.height],
      });
      y = Math.max(y, invoiceTotalsTop + invoiceStampBox.height + 4);
    } catch { /* ignore */ }
  }

  // ── Payment Details (actual recorded payments) ───────────────────────────────────────
  if (data.paymentDetails && data.paymentDetails.length > 0) {
    y += 14;
    doc.rect(MARGIN, y, contentW, 14).fill(hexToRgb(LIGHT_PINK) as unknown as string);
    doc.font("Bold").fontSize(9);
    pdfColor(doc, DARK_PURPLE);
    doc.text("PAYMENT DETAILS", MARGIN + 6, y + 3);
    y += 18;
    data.paymentDetails.forEach((pmt, idx) => {
      const rowBg = idx % 2 === 0 ? "#FFFFFF" : LIGHT_BG;
      const fxAuditNote = renderFxAuditNote(pmt.fxRateNote);
      const convertedDetail = pmt.currency && pmt.invoiceCurrency && pmt.currency !== pmt.invoiceCurrency && pmt.convertedAmountInInvoiceCurrency != null
        ? `Converted value: ${pmt.invoiceCurrency} ${fmt(pmt.convertedAmountInInvoiceCurrency)} · Direct FX: ${pmt.conversionRateToInvoice ?? "—"}${pmt.fxRateSource ? ` · Source: ${pmt.fxRateSource === "manual" ? "Manual" : "System"}` : ""}${fxAuditNote ? ` · FX audit note: ${fxAuditNote}` : ""}`
        : null;
      const appliedDetail = pmt.settledAmount != null && (
        pmt.currency !== pmt.invoiceCurrency
        || Math.abs(pmt.amount - pmt.settledAmount) > 0.005
      )
        ? `Applied to invoice: ${pmt.invoiceCurrency ?? data.currency} ${fmt(pmt.settledAmount)}`
        : null;
      const bankDetail = pmt.bankGrossAmountSent != null
        ? `Amount sent: ${pmt.currency ?? data.currency} ${fmt(pmt.bankGrossAmountSent)} · Bank Deduction: ${pmt.currency ?? data.currency} ${fmt(pmt.bankDeductionAmount ?? 0)}${pmt.bankDeductionPercent != null ? ` (${Number(pmt.bankDeductionPercent).toFixed(2)}%)` : ""} · Net received: ${pmt.currency ?? data.currency} ${fmt(pmt.amount)}`
        : null;
      const creditDetail = pmt.patientCredits && pmt.patientCredits.length > 0
        ? pmt.patientCredits.map(credit => `Patient Credit created: ${credit.currency} ${fmt(credit.amount)} (native currency)`).join(" · ")
        : null;
      const detailLines = [convertedDetail, appliedDetail, bankDetail, creditDetail].filter((detail): detail is string => Boolean(detail));
      const rowHeight = 22 + (detailLines.length * 14);
      doc.rect(MARGIN, y, contentW, rowHeight).fill(hexToRgb(rowBg) as unknown as string);
      // Three clean columns: Date (180px) | Method (120px) | Amount (right-aligned)
      const colDate = MARGIN + 8;
      const colMethod = colDate + 180;
      const colAmt = W - MARGIN - 8;
      doc.font("Regular").fontSize(9);
      pdfColor(doc, DARK_PURPLE);
      doc.text(pmt.date,   colDate,   y + 6, { width: 175 });
      doc.text(pmt.method, colMethod, y + 6, { width: 115 });
      doc.font("Bold").fontSize(9);
      doc.text(`${pmt.currency ?? data.currency} ${fmt(pmt.amount)}`, colDate, y + 6, { width: colAmt - colDate, align: "right" });
      detailLines.forEach((detail, detailIndex) => {
        doc.font("Regular").fontSize(7.5);
        pdfColor(doc, GRAY);
        doc.text(detail, colDate, y + 19 + (detailIndex * 14), { width: contentW - 16, height: 13, ellipsis: true });
      });
      y += rowHeight;
    });
    y += 6;
  }

  // ── Payment Options for Remaining Balance ─────────────────────────────────────────────
  {
    const surcharge = data.cardSurchargePct ?? 0;
    const paid = data.paidAmount ?? 0;
    const balance = canonicalBalance;
    const isFullyPaid = balance <= 0.01;
    const isMethodNeutralInvoice = isMethodNeutralSettlementModel(data.settlementModelVersion) || data.pricingMode === "agreed";
    const hasLegacySurchargeSnapshot = !isMethodNeutralInvoice && surcharge > 0;

    y += 14;
    // Section header
    doc.rect(MARGIN, y, contentW, 14).fill(hexToRgb(LIGHT_PINK) as unknown as string);
    doc.font("Bold").fontSize(9);
    pdfColor(doc, DARK_PURPLE);
    doc.text("PAYMENT OPTIONS", MARGIN + 6, y + 3);
    y += 18;

    if (isFullyPaid) {
      // Fully paid — show confirmation
      doc.font("Bold").fontSize(10);
      pdfColor(doc, "#065f46");
      doc.text("✓ Paid in Full", MARGIN + 6, y);
      y += 18;
    } else {
      // Tax-v2 and an established agreed total are method-neutral: payment
      // method never changes the patient's fixed remaining obligation.
      const cTotX = W - MARGIN - 270;
      if (!hasLegacySurchargeSnapshot) {
        doc.font("Regular").fontSize(9);
        pdfColor(doc, GRAY);
        doc.text("Remaining amount:", cTotX, y, { width: 170 });
        doc.font("Bold").fontSize(9);
        pdfColor(doc, DARK_PURPLE);
        doc.text(`${data.currency} ${fmt(balance)}`, cTotX + 170, y, { width: 100, align: "right" });
        y += 16;
        doc.font("Regular").fontSize(8);
        pdfColor(doc, GRAY);
        const methodNeutralNote = data.pricingMode === "agreed"
          ? "This invoice has a fixed agreed total. Cash, card, and bank transfer settle the same remaining amount."
          : "Cash, card, and bank transfer settle the same remaining amount. No payment-method surcharge is added.";
        doc.text(methodNeutralNote, MARGIN + 6, y, { width: contentW - 12 });
        y += doc.heightOfString(methodNeutralNote, { width: contentW - 12 }) + 10;
      } else {
      // Render a legacy payment adjustment only from the immutable invoice snapshot.
      const cardBalanceTotal = balance * (1 + surcharge / 100);
      const surchargeAmt = cardBalanceTotal - balance;

      // Cash option
      doc.font("Regular").fontSize(9);
      pdfColor(doc, GRAY);
      doc.text("Cash payment:", cTotX, y, { width: 170 });
      doc.font("Bold").fontSize(9);
      pdfColor(doc, DARK_PURPLE);
      doc.text(`${data.currency} ${fmt(balance)}`, cTotX + 170, y, { width: 100, align: "right" });
      y += 16;

      // Card / Bank Transfer option (expanded breakdown)
      doc.font("Regular").fontSize(9);
      pdfColor(doc, GRAY);
      doc.text(`Card / Bank Transfer (+${surcharge}%):`, cTotX, y, { width: 170 });
      y += 13;
      doc.fontSize(8);
      doc.text(`  Remaining balance: ${data.currency} ${fmt(balance)}`, cTotX, y, { width: 270 });
      y += 12;
      doc.text(`  Processing surcharge (${surcharge}%): ${data.currency} ${fmt(surchargeAmt)}`, cTotX, y, { width: 270 });
      y += 12;
      doc.font("Bold").fontSize(9);
      pdfColor(doc, DARK_PURPLE);
      doc.text(`  Total to pay by card/bank: ${data.currency} ${fmt(cardBalanceTotal)}`, cTotX, y, { width: 270 });
      y += 18;

      // Note
      doc.font("Regular").fontSize(8);
      pdfColor(doc, GRAY);
      const noteText = paid > 0
        ? `Card or bank transfer payments include an additional ${surcharge}% processing surcharge. Since this invoice is partially paid, the surcharge applies only to the remaining unpaid balance of ${data.currency} ${fmt(balance)}.`
        : `Cash is accepted as the standard payment method. For card or bank transfer payments, a ${surcharge}% processing surcharge applies. After payment, please share the receipt via WhatsApp or email.`;
      doc.text(noteText, MARGIN + 6, y, { width: contentW - 12 });
      y += doc.heightOfString(noteText, { width: contentW - 12 }) + 10;
      }
    }
  }

  // ── Service Notes (footnotes) ─────────────────────────────────────────────────
  if (invFootnotes.length > 0) {
    const serviceNotesHeaderHeight = 22;
    const noteWidth = contentW - 22;
    const noteLayouts = invFootnotes.map((fn) => {
      const noteText = `${fn.name} — ${fn.desc}`;
      doc.font(isArabic(noteText) ? FONT.arRegular : FONT.regular).fontSize(7.5);
      return {
        ...fn,
        noteText,
        noteHeight: Math.max(doc.heightOfString(noteText, { width: noteWidth }), 10),
      };
    });
    const fullSectionHeight = 12 + serviceNotesHeaderHeight + noteLayouts.reduce((total, note) => total + note.noteHeight + 4, 0) + 6;
    const proposedNotesY = y + 12;
    y = getInvoicePdfServiceNotesStartY({
      currentY: proposedNotesY,
      sectionHeight: fullSectionHeight,
      contentTop: MARGIN,
      contentBottom: invoiceContentBottom,
    });
    if (y === MARGIN && proposedNotesY !== MARGIN) doc.addPage();

    const drawServiceNotesHeader = (continued = false) => {
      doc.rect(MARGIN, y, contentW, 14).fill(hexToRgb("#E8F4F8") as unknown as string);
      doc.font("Bold").fontSize(8);
      pdfColor(doc, "#2A7B9B");
      doc.text(continued ? "SERVICE NOTES (CONTINUED)" : "SERVICE NOTES", MARGIN + 6, y + 3);
      y += 16;
      pdfStroke(doc, "#B0D4E3");
      doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).stroke();
      y += 6;
    };

    drawServiceNotesHeader();
    noteLayouts.forEach((note) => {
      if (y + note.noteHeight + 4 > invoiceContentBottom) {
        doc.addPage();
        y = MARGIN;
        drawServiceNotesHeader(true);
      }

      doc.font(isArabic(note.noteText) ? FONT.arRegular : FONT.regular).fontSize(7.5);
      const availableHeight = invoiceContentBottom - y - 4;
      const chunks = splitPdfTextToFitHeight(doc, note.noteText, noteWidth, availableHeight);
      chunks.forEach((chunk, chunkIndex) => {
        doc.font(isArabic(chunk) ? FONT.arRegular : FONT.regular).fontSize(7.5);
        const chunkHeight = Math.max(doc.heightOfString(chunk, { width: noteWidth }), 10);
        if (y + chunkHeight + 4 > invoiceContentBottom) {
          doc.addPage();
          y = MARGIN;
          drawServiceNotesHeader(true);
        }
        doc.font("Bold").fontSize(7);
        pdfColor(doc, "#2A7B9B");
        doc.text(chunkIndex === 0 ? String(note.idx) : "↳", MARGIN + 4, y, { width: 10 });
        doc.font(isArabic(chunk) ? FONT.arRegular : FONT.regular).fontSize(7.5);
        pdfColor(doc, "#4A5568");
        smartText(doc, chunk, MARGIN + 16, y, { width: noteWidth, fontSize: 7.5 });
        y += chunkHeight + 4;
      });
    });
    y += 6;
  }

  // ── PAID diagonal watermark (only for paid invoices) ─────────────────────
  if (data.status === "paid") {
    doc.save();
    doc.translate(W / 2, 841.89 / 2);
    doc.rotate(-40);
    doc.font("Bold").fontSize(80);
    doc.fillOpacity(0.06);
    pdfColor(doc, "#065f46");
    // Single text call — y offset accounts for PDFKit's internal line-height padding
    // PDFKit adds ~lineGap above text; at 80px font the actual glyph starts ~20px below y
    doc.text("PAID", -120, -60, { width: 240, align: "center", lineBreak: false });
    doc.fillOpacity(1);
    doc.restore();
  }

  // ── Footer on every buffered Invoice page ───────────────────────────────
  const invoicePages = doc.bufferedPageRange();
  for (let pageIndex = invoicePages.start; pageIndex < invoicePages.start + invoicePages.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    drawInvoiceFooter();
  }
  return bufferFromDoc(doc);
}

// ─── Official Receipt PDF ────────────────────────────────────────────────────

export interface ReceiptPdfData {
  receiptNumber: string;       // e.g. REC-INV-00014
  invoiceNumber: string;       // e.g. INV-00014
  patientName: string;
  mrn?: string;
  currency: string;
  taxModelVersion?: string | null;
  taxAmount?: number;
  pricingMode?: string | null;
  invoiceDiscountAmount?: number;
  invoiceDiscountPercent?: number;
  finalAgreedAmount?: number | null;
  serviceTotal?: number;
  invoiceTotal: number;        // original invoice total
  grossReceived: number;       // all valid external receipts historically received
  refunded: number;            // valid refunds/reversals in invoice currency
  totalSettled: number;        // cumulative payment settlement in invoice currency
  balanceDue: number;          // remaining balance after active payments
  invoiceSubtotal?: number;    // sum of item prices before discount (for Mode B display)
  invoiceItems: Array<{
    description: string;       // service name
    lineLabel?: string | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    taxRuleId?: number | null;
    taxLabelSnapshot?: string | null;
    taxRateSnapshot?: number | null;
    effectiveTaxableBase?: number | null;
    taxAmount?: number | null;
  }>;
  includedPayments: Array<{
    paymentId: number;
    paymentDate: Date;
    method: string;
    amount: number;
    currency: string;
    settledAmount: number;
    showAppliedToInvoice: boolean;
    patientCredits: Array<{ currency: string; amount: number }>;
  }>;
  receiptNote?: string;        // custom note written specifically for this receipt (not from invoice)
}

export async function generateReceiptPdf(data: ReceiptPdfData): Promise<Buffer> {
  const { info: clinic, logoBuffer, stampBuffer } = await loadClinicAssets("en_dark");
  const clinicName = clinic?.nameEn ?? "Fertiliv";
  const clinicSlogan = clinic?.sloganEn ?? "Fertility Clinic";
  const clinicEmail = clinic?.email ?? "info@fertiliv.com";
  const clinicWhatsapp = clinic?.whatsapp ?? "+90 501 114 70 60";

  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
  const W = 595.28;
  const MARGIN = 40;
  const contentW = W - MARGIN * 2;
  const receiptPageHeight = 841.89;
  const receiptFooterHeight = 50;
  const receiptContentBottom = receiptPageHeight - receiptFooterHeight - 14;
  const receiptInfoStampBox = { width: 88, height: 56 };
  const drawReceiptFooter = () => {
    doc.rect(0, receiptPageHeight - receiptFooterHeight, W, receiptFooterHeight).fill(hexToRgb(DARK_PURPLE) as unknown as string);
    doc.font("Regular").fontSize(8);
    pdfColor(doc, LIGHT_PINK);
    const footerParts = [clinicName, clinicEmail, clinicWhatsapp].filter(Boolean).join("  |  ");
    doc.text(footerParts, MARGIN, receiptPageHeight - 32, { width: contentW, align: "center" });
    doc.font("Regular").fontSize(7);
    pdfColor(doc, PEACH);
    doc.text(`Thank you for choosing ${clinicName}`, MARGIN, receiptPageHeight - 18, { width: contentW, align: "center" });
  };

  doc.registerFont("Regular",   FONT.regular);
  doc.registerFont("Bold",      FONT.bold);
  doc.registerFont("ArRegular", FONT.arRegular);
  doc.registerFont("ArBold",    FONT.arBold);

  // ── Header band ──────────────────────────────────────────────────────────
  doc.rect(0, 0, W, 110).fill(hexToRgb(DARK_PURPLE) as unknown as string);

  if (logoBuffer) {
    try { doc.image(logoBuffer, MARGIN, 18, { height: 70, fit: [180, 70] }); } catch { /* fallback */ }
  }
  if (!logoBuffer) {
    doc.font("Bold").fontSize(22);
    pdfColor(doc, "#FFFFFF");
    doc.text(clinicName, MARGIN, 28);
    doc.font("Regular").fontSize(10);
    pdfColor(doc, LIGHT_PINK);
    doc.text(clinicSlogan, MARGIN, 54);
  }

  // Title on right — "OFFICIAL RECEIPT" + receipt number + PAID badge stacked
  doc.font("Bold").fontSize(15);
  pdfColor(doc, "#FFFFFF");
  doc.text("OFFICIAL", W - MARGIN - 160, 18, { width: 160, align: "right" });
  doc.text("RECEIPT", W - MARGIN - 160, 36, { width: 160, align: "right" });

  // Receipt number on its own line below title
  doc.font("Regular").fontSize(9);
  pdfColor(doc, PEACH);
  doc.text(data.receiptNumber ?? "", W - MARGIN - 160, 56, { width: 160, align: "right" });

  // Status badge — PAID IN FULL or PARTIALLY PAID
  if (data.balanceDue <= 0.01) {
    doc.roundedRect(W - MARGIN - 100, 72, 100, 20, 4).fill(hexToRgb("#d1fae5") as unknown as string);
    doc.font("Bold").fontSize(8);
    pdfColor(doc, "#065f46");
    doc.text("PAID IN FULL", W - MARGIN - 100, 78, { width: 100, align: "center" });
  } else {
    doc.roundedRect(W - MARGIN - 110, 72, 110, 20, 4).fill(hexToRgb("#fef3c7") as unknown as string);
    doc.font("Bold").fontSize(8);
    pdfColor(doc, "#92400e");
    doc.text("PARTIALLY PAID", W - MARGIN - 110, 78, { width: 110, align: "center" });
  }

  // Gradient divider
  doc.rect(0, 110, W / 2, 4).fill(hexToRgb(LIGHT_PINK) as unknown as string);
  doc.rect(W / 2, 110, W / 2, 4).fill(hexToRgb(PEACH) as unknown as string);

  // ── Info row ─────────────────────────────────────────────────────────────
  let y = 130;
  const receiptInfoStampX = MARGIN + (contentW - receiptInfoStampBox.width) / 2;
  const receiptInfoStampY = 122;
  const receiptInfoStampBottom = receiptInfoStampY + receiptInfoStampBox.height;
  const ensureReceiptContentSpace = (requiredHeight: number) => {
    if (y + requiredHeight <= receiptContentBottom) return;
    doc.addPage();
    y = MARGIN;
  };

  doc.font("Bold").fontSize(9);
  pdfColor(doc, GRAY);
  doc.text("RECEIVED FROM", MARGIN, y);
  y += 14;
  pdfColor(doc, DARK_PURPLE);
  const recNameWidth = stampBuffer ? receiptInfoStampX - MARGIN - 24 : contentW / 2 - 10;
  doc.font("Bold").fontSize(11);
  const recNameH = doc.heightOfString(data.patientName, { width: recNameWidth });
  smartText(doc, data.patientName, MARGIN, y, { bold: true, fontSize: 11, width: recNameWidth });
  if (data.mrn) {
    y += Math.max(recNameH + 4, 16);
    doc.font("Regular").fontSize(9);
    pdfColor(doc, GRAY);
    doc.text(`MRN: ${data.mrn}`, MARGIN, y);
  } else {
    y += Math.max(recNameH + 4, 16);
  }

  // Right: invoice reference only. An invoice-level receipt intentionally has no false aggregate payment date.
  doc.font("Bold").fontSize(9);
  pdfColor(doc, GRAY);
  doc.text("INVOICE REF", W - MARGIN - 160, 130, { width: 160, align: "right" });
  doc.font("Regular").fontSize(9);
  pdfColor(doc, DARK_PURPLE);
  doc.text(data.invoiceNumber, W - MARGIN - 160, 144, { width: 160, align: "right" });

  // The Receipt stamp occupies only the centered whitespace between the two identity blocks.
  if (stampBuffer) {
    try {
      doc.image(stampBuffer, receiptInfoStampX, receiptInfoStampY, {
        fit: [receiptInfoStampBox.width, receiptInfoStampBox.height],
        align: "center",
      });
    } catch { /* ignore */ }
  }

  y = Math.max(y + 24, stampBuffer ? receiptInfoStampBottom + 12 : 0);
  pdfStroke(doc, LIGHT_GRAY);
  doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).stroke();
  y += 20;

  // ── Cumulative invoice settlement box ─────────────────────────────────────
  const hasRefund = data.refunded > 0.005;
  const settlementBoxHeight = hasRefund ? 96 : 80;
  const totalSettledLabelY = hasRefund ? y + 52 : y + 32;
  const totalSettledValueY = hasRefund ? y + 68 : y + 48;
  const balanceDueY = hasRefund ? y + 76 : y + 64;
  doc.rect(MARGIN, y, contentW, settlementBoxHeight).fill(hexToRgb("#f0fdf4") as unknown as string);
  doc.font("Bold").fontSize(10);
  pdfColor(doc, GRAY);
  doc.text("GROSS RECEIVED", MARGIN + 16, y + 12);
  if (hasRefund) doc.text("REFUNDED", MARGIN + 16, y + 32);
  doc.text("TOTAL SETTLED TO THIS INVOICE", MARGIN + 16, totalSettledLabelY);
  doc.font("Regular").fontSize(10);
  pdfColor(doc, DARK_PURPLE);
  doc.text(`${data.currency} ${fmt(data.grossReceived)}`, MARGIN + 190, y + 12, { width: 120, align: "right" });
  if (hasRefund) {
    pdfColor(doc, "#be123c");
    doc.text(`${data.currency} ${fmt(data.refunded)}`, MARGIN + 190, y + 32, { width: 120, align: "right" });
  }
  doc.font("Bold").fontSize(20);
  pdfColor(doc, "#065f46");
  doc.text(`${data.currency} ${fmt(data.totalSettled)}`, MARGIN + 16, totalSettledValueY);
  doc.font("Regular").fontSize(10);
  pdfColor(doc, GRAY);
  doc.text(`BALANCE DUE: ${data.currency} ${fmt(data.balanceDue)}`, MARGIN + 230, balanceDueY, { width: contentW - 246, align: "right" });
  y += settlementBoxHeight + 16;

  // ── Payments Included ─────────────────────────────────────────────────────
  if (data.includedPayments.length > 0) {
    const firstPaymentHeight = data.includedPayments[0]!.patientCredits.length > 0 ? 34 : 20;
    ensureReceiptContentSpace(10 + 16 + 16 + firstPaymentHeight + 8);
    y += 10;
    doc.rect(MARGIN, y, contentW, 16).fill(hexToRgb(LIGHT_PINK) as unknown as string);
    doc.font("Bold").fontSize(9);
    pdfColor(doc, DARK_PURPLE);
    doc.text("PAYMENTS INCLUDED", MARGIN + 6, y + 4);
    y += 20;

    const hasAppliedColumn = data.includedPayments.some(payment => payment.showAppliedToInvoice);
    const dateW = hasAppliedColumn ? 102 : 130;
    const methodW = hasAppliedColumn ? 98 : 125;
    const amountW = hasAppliedColumn ? 128 : contentW - dateW - methodW;
    const appliedW = hasAppliedColumn ? contentW - dateW - methodW - amountW : 0;
    const cols = [MARGIN, MARGIN + dateW, MARGIN + dateW + methodW, MARGIN + dateW + methodW + amountW];

    doc.rect(MARGIN, y, contentW, 16).fill(hexToRgb("#f7f3fb") as unknown as string);
    doc.font("Bold").fontSize(7.5);
    pdfColor(doc, GRAY);
    doc.text("PAYMENT DATE", cols[0] + 5, y + 4, { width: dateW - 8 });
    doc.text("METHOD", cols[1] + 5, y + 4, { width: methodW - 8 });
    doc.text("AMOUNT RECEIVED", cols[2] + 5, y + 4, { width: amountW - 8, align: "right" });
    if (hasAppliedColumn) doc.text("APPLIED TO INVOICE", cols[3] + 5, y + 4, { width: appliedW - 8, align: "right" });
    y += 16;

    data.includedPayments.forEach((payment, index) => {
      const rowBg = index % 2 === 0 ? "#FFFFFF" : LIGHT_BG;
      const creditDetail = payment.patientCredits.length > 0
        ? payment.patientCredits.map(credit => `Patient Credit created: ${credit.currency} ${fmt(credit.amount)} (native currency)`).join(" · ")
        : null;
      const rowHeight = creditDetail ? 34 : 20;
      ensureReceiptContentSpace(rowHeight);
      doc.rect(MARGIN, y, contentW, rowHeight).fill(hexToRgb(rowBg) as unknown as string);
      doc.font("Regular").fontSize(8);
      pdfColor(doc, DARK_PURPLE);
      const receivedDate = payment.paymentDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      doc.text(receivedDate, cols[0] + 5, y + 6, { width: dateW - 8 });
      doc.text(payment.method, cols[1] + 5, y + 6, { width: methodW - 8 });
      doc.font("Bold").fontSize(8);
      doc.text(`${payment.currency} ${fmt(payment.amount)}`, cols[2] + 5, y + 6, { width: amountW - 8, align: "right" });
      if (hasAppliedColumn) {
        doc.font("Regular").fontSize(8);
        doc.text(payment.showAppliedToInvoice ? `${data.currency} ${fmt(payment.settledAmount)}` : "—", cols[3] + 5, y + 6, { width: appliedW - 8, align: "right" });
      }
      if (creditDetail) {
        doc.font("Regular").fontSize(7.5);
        pdfColor(doc, GRAY);
        doc.text(creditDetail, cols[0] + 5, y + 20, { width: contentW - 10, height: 11, ellipsis: true });
      }
      y += rowHeight;
    });
    y += 8;
  }

  // ── Services received (invoice items) ──────────────────────────────────────────────────────
  if (data.invoiceItems.length > 0) {
    doc.font("Regular").fontSize(9);
    const firstServiceName = formatInvoiceLineDisplayName(data.invoiceItems[0]!.description, data.invoiceItems[0]!.lineLabel);
    const firstServiceRowHeight = Math.max(doc.heightOfString(firstServiceName, { width: contentW * 0.65 - 8 }), 14) + 10;
    ensureReceiptContentSpace(10 + 16 + firstServiceRowHeight + 8);
    y += 10;
    doc.rect(MARGIN, y, contentW, 16).fill(hexToRgb(LIGHT_PINK) as unknown as string);
    doc.font("Bold").fontSize(9);
    pdfColor(doc, DARK_PURPLE);
    doc.text("SERVICES RECEIVED", MARGIN + 6, y + 4);
    y += 20;

    const itemsTotal = data.invoiceItems.reduce((sum, i) => sum + i.totalPrice, 0);
    data.invoiceItems.forEach((item, idx) => {
      const rowBg = idx % 2 === 0 ? "#FFFFFF" : LIGHT_BG;
      const lineDisplayName = formatInvoiceLineDisplayName(item.description, item.lineLabel);
      const descH = Math.max(doc.heightOfString(lineDisplayName, { width: contentW * 0.65 - 8 }), 14);
      const rowH = descH + 10;
      ensureReceiptContentSpace(rowH);
      doc.rect(MARGIN, y, contentW, rowH).fill(hexToRgb(rowBg) as unknown as string);
      doc.font("Regular").fontSize(9);
      pdfColor(doc, DARK_PURPLE);
      doc.text(lineDisplayName, MARGIN + 8, y + 5, { width: contentW * 0.65 - 8 });
      if (item.quantity > 1) {
        doc.font("Regular").fontSize(8);
        pdfColor(doc, GRAY);
        doc.text(`x${item.quantity}`, MARGIN + contentW * 0.65, y + 5, { width: contentW * 0.15, align: "center" });
      }
      // Fix C: Show original invoice item price, not proportional share of amount received
      doc.font("Bold").fontSize(9);
      pdfColor(doc, DARK_PURPLE);
      doc.text(`${data.currency} ${fmt(item.totalPrice)}`, MARGIN + contentW * 0.8, y + 5, { width: contentW * 0.2 - 8, align: "right" });
      y += rowH;
    });
    y += 8;
  }

  // Invoice Summary — always shown, uses standard patient-facing terminology
  {
    const itemsSubtotal = data.invoiceSubtotal
      ?? data.invoiceItems.reduce((s, i) => s + i.totalPrice, 0);
    const isTaxModelInvoice = data.taxModelVersion === "line_tax_v1";
    const savedCommercialAdjustment = Math.max(0, data.invoiceDiscountAmount ?? 0);
    const legacyDiscountAmt = Math.max(0, itemsSubtotal - data.invoiceTotal);
    y += 6;
    doc.rect(MARGIN, y, contentW, 14).fill(hexToRgb(LIGHT_PINK) as unknown as string);
    doc.font("Bold").fontSize(9);
    pdfColor(doc, DARK_PURPLE);
    doc.text("INVOICE SUMMARY", MARGIN + 6, y + 3);
    y += 18;
    const summaryLW = 160;
    const summaryVW = contentW - summaryLW - 12;
    const summaryX = MARGIN + 6;
    const addSummaryRow = (label: string, value: string, bold = false, color?: string) => {
      doc.font(bold ? "Bold" : "Regular").fontSize(9);
      pdfColor(doc, color ?? DARK_PURPLE);
      doc.text(label, summaryX, y);
      doc.font(bold ? "Bold" : "Regular").fontSize(9);
      pdfColor(doc, color ?? DARK_PURPLE);
      doc.text(value, summaryX + summaryLW, y, { width: summaryVW, align: "right" });
      y += 14;
    };
    if (isTaxModelInvoice) {
      addSummaryRow("Service Subtotal:", `${data.currency} ${fmt(itemsSubtotal)}`);
      if (savedCommercialAdjustment > 0.005) {
        const adjustmentLabel = data.pricingMode === "agreed"
          ? "Final Agreed Service Price Adjustment:"
          : data.invoiceDiscountPercent && data.invoiceDiscountPercent > 0
            ? `Discount (${Number(data.invoiceDiscountPercent).toFixed(2)}%):`
            : "Discount:";
        addSummaryRow(adjustmentLabel, `- ${data.currency} ${fmt(savedCommercialAdjustment)}`);
      }
      addSummaryRow("Service Total:", `${data.currency} ${fmt(data.serviceTotal ?? Math.max(0, data.invoiceTotal - (data.taxAmount ?? 0)))}`);
      // The aggregate is an immutable invoice fact. Never infer a single rate for mixed Tax lines.
      addSummaryRow("Service Tax:", `${data.currency} ${fmt(data.taxAmount ?? 0)}`);
      addSummaryRow("Invoice Total:", `${data.currency} ${fmt(data.invoiceTotal)}`, true);
    } else {
      addSummaryRow("Subtotal:", `${data.currency} ${fmt(itemsSubtotal)}`);
      if (legacyDiscountAmt > 0.005) {
        addSummaryRow("Discount:", `- ${data.currency} ${fmt(legacyDiscountAmt)}`);
      }
      addSummaryRow("Invoice Total:", `${data.currency} ${fmt(data.invoiceTotal)}`, true);
    }
    // Thin divider
    pdfStroke(doc, LIGHT_GRAY);
    doc.moveTo(summaryX, y).lineTo(W - MARGIN, y).stroke();
    y += 8;
    addSummaryRow("Total Settled to This Invoice:", `${data.currency} ${fmt(data.totalSettled)}`);
    const balanceColor = data.balanceDue > 0.01 ? "#92400e" : "#065f46";
    addSummaryRow("Balance Due:", `${data.currency} ${fmt(data.balanceDue)}`, true, balanceColor);
    y += 4;
    // Status line
    const statusLabel = data.balanceDue <= 0.01 ? "PAID IN FULL" : "PARTIALLY PAID";
    const statusBgColor = data.balanceDue <= 0.01 ? "#d1fae5" : "#fef3c7";
    const statusTxtColor = data.balanceDue <= 0.01 ? "#065f46" : "#92400e";
    doc.rect(summaryX, y, summaryVW + summaryLW, 20).fill(hexToRgb(statusBgColor) as unknown as string);
    doc.font("Bold").fontSize(9);
    pdfColor(doc, statusTxtColor);
    doc.text(statusLabel, summaryX, y + 5, { width: summaryVW + summaryLW, align: "center" });
    y += 24;
  }

  // ── Receipt note (custom, not from invoice) ────────────────────────────────────────────────
  if (data.receiptNote) {
    y += 10;
    doc.rect(MARGIN, y, contentW, 14).fill(hexToRgb(LIGHT_PINK) as unknown as string);
    doc.font("Bold").fontSize(9);
    pdfColor(doc, DARK_PURPLE);
    doc.text("NOTES", MARGIN + 6, y + 3);
    y += 18;
    pdfColor(doc, DARK_PURPLE);
    smartText(doc, data.receiptNote, MARGIN + 6, y, { fontSize: 9, width: contentW - 12 });
    y += 24;
  }

  // ── Confirmation text + footer-safe stamp ─────────────────────────────────────────────
  y += 16;
  doc.font("Regular").fontSize(9);
  pdfColor(doc, GRAY);
  const confirmText = data.balanceDue <= 0.01
    ? "This official receipt confirms that the invoice has been paid in full. Please retain this document for your records."
    : `This official receipt confirms cumulative settlement of ${data.currency} ${fmt(data.totalSettled)} to this invoice. The remaining balance of ${data.currency} ${fmt(data.balanceDue)} is still outstanding. Please retain this document for your records.`;
  const confirmationHeight = doc.heightOfString(confirmText, { width: contentW });
  if (y + confirmationHeight > receiptContentBottom) {
    doc.addPage();
    y = MARGIN;
  }
  doc.text(confirmText, MARGIN, y, { width: contentW });

  // ── Watermark — PAID IN FULL (green) or PARTIAL (amber) ─────────────────────
  if (data.balanceDue <= 0.01) {
    doc.save();
    doc.translate(W / 2, receiptPageHeight / 2);
    doc.rotate(-40);
    doc.font("Bold").fontSize(70);
    doc.fillOpacity(0.05);
    pdfColor(doc, "#065f46");
    doc.text("PAID", -105, -52, { width: 210, align: "center", lineBreak: false });
    doc.fillOpacity(1);
    doc.restore();
  }

  // ── Footer on every buffered Receipt page ───────────────────────────
  const receiptPages = doc.bufferedPageRange();
  for (let pageIndex = receiptPages.start; pageIndex < receiptPages.start + receiptPages.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    drawReceiptFooter();
  }

  return bufferFromDoc(doc);
}

// ─── Proposal PDF──────────────────────────────────────────────────────────────────

export async function generateProposalPdf(data: ProposalPdfData): Promise<Buffer> {
  // Load clinic info and logo assets
  const { info: clinic, logoBuffer, stampBuffer } = await loadClinicAssets("en_dark");
  const clinicName = clinic?.nameEn ?? "Fertiliv";
  const clinicSlogan = clinic?.sloganEn ?? "Fertility Clinic";
  const clinicEmail = clinic?.email ?? "info@fertiliv.com";
  const clinicWhatsapp = clinic?.whatsapp ?? "+90 501 114 70 60";

  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
  const W = 595.28;
  const MARGIN = 40;
  const contentW = W - MARGIN * 2;

  doc.registerFont("Regular",   FONT.regular);
  doc.registerFont("Bold",      FONT.bold);
  doc.registerFont("ArRegular", FONT.arRegular);
  doc.registerFont("ArBold",    FONT.arBold);

  // ── Header band ──────────────────────────────────────────────────────────
  doc.rect(0, 0, W, 110).fill(hexToRgb(DARK_PURPLE) as unknown as string);

  // Logo or clinic name
  if (logoBuffer) {
    try { doc.image(logoBuffer, MARGIN, 18, { height: 70, fit: [180, 70] }); } catch { /* fallback */ }
  }
  if (!logoBuffer) {
    doc.font("Bold").fontSize(22);
    pdfColor(doc, "#FFFFFF");
    doc.text(clinicName, MARGIN, 28);
    doc.font("Regular").fontSize(10);
    pdfColor(doc, LIGHT_PINK);
    doc.text(clinicSlogan, MARGIN, 54);
  }

  // Title: two lines stacked to avoid overlap with proposal code
  doc.font("Bold").fontSize(14);
  pdfColor(doc, "#FFFFFF");
  doc.text("TREATMENT", W - MARGIN - 160, 22, { width: 160, align: "right" });
  doc.text("PROPOSAL", W - MARGIN - 160, 40, { width: 160, align: "right" });

  doc.font("Regular").fontSize(10);
  pdfColor(doc, PEACH);
  doc.text(data.proposalCode ?? "", W - MARGIN - 160, 62, { width: 160, align: "right" });

  // Price type badge — show only LOCAL, never show "INTERNATIONAL"
  if (data.appliedPriceType !== "international") {
    doc.roundedRect(W - MARGIN - 100, 72, 100, 22, 4).fill(hexToRgb("#d1fae5") as unknown as string);
    doc.font("Bold").fontSize(9);
    pdfColor(doc, "#065f46");
    doc.text("LOCAL", W - MARGIN - 100, 79, { width: 100, align: "center" });
  }

  // Gradient divider
  doc.rect(0, 110, W / 2, 4).fill(hexToRgb(LIGHT_PINK) as unknown as string);
  doc.rect(W / 2, 110, W / 2, 4).fill(hexToRgb(PEACH) as unknown as string);

  // ── Info row ─────────────────────────────────────────────────────────────
  let y = 130;
  const col2 = MARGIN + contentW / 2;

  doc.font("Bold").fontSize(9);
  pdfColor(doc, GRAY);
  doc.text("PREPARED FOR", MARGIN, y);
  y += 14;
  pdfColor(doc, DARK_PURPLE);
  // Measure the actual rendered height of the patient name to avoid MRN overlap
  const propNameWidth = contentW / 2 - 10;
  doc.font("Bold").fontSize(11);
  const propNameHeight = doc.heightOfString(data.patientName, { width: propNameWidth });
  smartText(doc, data.patientName, MARGIN, y, { bold: true, fontSize: 11, width: propNameWidth });
  if (data.mrn) {
    y += Math.max(propNameHeight + 4, 16);
    doc.font("Regular").fontSize(9);
    pdfColor(doc, GRAY);
    doc.text(`MRN: ${data.mrn}`, MARGIN, y);
  } else {
    y += Math.max(propNameHeight + 4, 16);
  }

  doc.font("Bold").fontSize(9);
  pdfColor(doc, GRAY);
  doc.text("DATE", col2, 130, { width: contentW / 2, align: "right" });
  doc.font("Regular").fontSize(10);
  pdfColor(doc, DARK_PURPLE);
  doc.text(data.issueDate ?? "", col2, 144, { width: contentW / 2, align: "right" });

  // ── Divider ───────────────────────────────────────────────────────────────
  y = Math.max(y + 16, 174);
  pdfStroke(doc, LIGHT_GRAY);
  doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).stroke();
  y += 16;

  // ── Items table header ────────────────────────────────────────────────────
  // Columns: SERVICE / DESCRIPTION | QTY | UNIT PRICE | DISC% | TOTAL
  // Widths:  38%                     8%    17%           9%      14%  (+ inner padding)
  const HEADER_H = 26;
  doc.rect(MARGIN, y, contentW, HEADER_H).fill(hexToRgb(DARK_PURPLE) as unknown as string);
  doc.font("Bold").fontSize(8.5);
  pdfColor(doc, "#FFFFFF");

  // Column widths (fractions of contentW) — no DESCRIPTION column
  const colW = [
    contentW * 0.58,  // 0: Service name (wider now)
    contentW * 0.08,  // 1: Qty
    contentW * 0.15,  // 2: Unit price
    contentW * 0.08,  // 3: Disc%
    contentW * 0.11,  // 4: Total
  ];
  // Cumulative x positions (left edge of each column)
  const colX = [
    MARGIN + 6,
    MARGIN + colW[0] + 6,
    MARGIN + colW[0] + colW[1] + 6,
    MARGIN + colW[0] + colW[1] + colW[2] + 6,
    MARGIN + colW[0] + colW[1] + colW[2] + colW[3] + 6,
  ];

  const hY = y + 9;
  doc.text("SERVICE",    colX[0], hY, { width: colW[0] - 8 });
  doc.text("QTY",        colX[1], hY, { width: colW[1] - 6, align: "center" });
  doc.text("UNIT PRICE", colX[2], hY, { width: colW[2] - 6, align: "right" });
  doc.text("DISC%",      colX[3], hY, { width: colW[3] - 6, align: "right" });
  doc.text("TOTAL",      colX[4], hY, { width: colW[4] - 6, align: "right" });
  y += HEADER_H;

  // Thin separator line under header
  pdfStroke(doc, LIGHT_PINK);
  doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).stroke();
  y += 2; // ensure first item row starts below the separator line

  // ── Build proposal footnotes list ─────────────────────────────────────────
  const propFootnotes: Array<{ idx: number; name: string; desc: string }> = [];
  data.items.forEach((item) => {
    if (item.serviceDescription?.trim()) {
      propFootnotes.push({ idx: propFootnotes.length + 1, name: item.serviceName ?? item.description, desc: item.serviceDescription.trim() });
    }
  });

  // ── Items ─────────────────────────────────────────────────────────────────
  let propFootnoteCounter = 0;
  data.items.forEach((item, idx) => {
    const PAD = 7;
    const serviceText = item.serviceName ?? item.description ?? "";

    // Measure text height to determine row height dynamically
    doc.font("Bold").fontSize(9);
    const serviceH = serviceText
      ? doc.heightOfString(serviceText, { width: colW[0] - 14 })
      : 0;

    const contentH = Math.max(serviceH, 12);
    const rowH = contentH + PAD * 2;

    // Alternating row background
    if (idx % 2 === 1) {
      doc.rect(MARGIN, y, contentW, rowH).fill(hexToRgb(LIGHT_BG) as unknown as string);
    }

    const textY = y + PAD;

    // Service name (bold, may be Arabic) + optional footnote superscript
    const propHasFootnote = !!item.serviceDescription?.trim();
    if (propHasFootnote) propFootnoteCounter++;
    if (serviceText) {
      pdfColor(doc, DARK_PURPLE);
      smartText(doc, serviceText, colX[0], textY, { bold: true, fontSize: 9, width: colW[0] - (propHasFootnote ? 18 : 14) });
      if (propHasFootnote) {
        doc.fontSize(9);
        const svcWidth = doc.widthOfString(serviceText);
        const supXP = Math.min(colX[0] + svcWidth + 2, colX[0] + colW[0] - 14);
        doc.font("Bold").fontSize(7);
        pdfColor(doc, "#2A7B9B");
        doc.text(String(propFootnoteCounter), supXP, textY - 1, { width: 12 });
      }
    }

    // Numeric columns — always Latin, right-aligned (indices shifted: no description col)
    doc.font("Regular").fontSize(8.5);
    pdfColor(doc, DARK_PURPLE);
    const numY = y + PAD;
    doc.text(String(item.quantity),
      colX[1], numY, { width: colW[1] - 6, align: "center" });
    doc.text(`${data.currency} ${fmt(item.unitPrice)}`,
      colX[2], numY, { width: colW[2] - 6, align: "right" });
    const discVal = item.discount ?? 0;
    doc.text(discVal > 0 ? `${discVal.toFixed(1)}%` : "—",
      colX[3], numY, { width: colW[3] - 6, align: "right" });
    doc.font("Bold").fontSize(8.5);
    pdfColor(doc, DARK_PURPLE);
    doc.text(`${data.currency} ${fmt(item.totalPrice)}`,
      colX[4], numY, { width: colW[4] - 6, align: "right" });

    // Bottom border for each row
    pdfStroke(doc, LIGHT_GRAY);
    doc.moveTo(MARGIN, y + rowH).lineTo(W - MARGIN, y + rowH).stroke();

    y += rowH;
  });

  // ── Total ─────────────────────────────────────────────────────────────────
  y += 10;
  pdfStroke(doc, LIGHT_GRAY);
  doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).stroke();
  y += 10;

  const totalsX  = W - MARGIN - 200;
  const totalsLW = 110;
  const totalsVW = 90;

  doc.rect(totalsX - 10, y - 4, 200 + 10, 28).fill(hexToRgb(DARK_PURPLE) as unknown as string);
  doc.font("Bold").fontSize(11);
  pdfColor(doc, "#FFFFFF");
  doc.text("TOTAL", totalsX, y + 4, { width: totalsLW });
  doc.text(`${data.currency} ${fmt(data.totalAmount)}`, totalsX + totalsLW, y + 4, { width: totalsVW, align: "right" });
  y += 36;

  // ── Card / Bank Transfer total row ─────────────────────────────────────────────────────
  {
    const surcharge = data.cardSurchargePct ?? 23;
    const cardTotal = data.totalAmount * (1 + surcharge / 100);
    y += 10;
    // Wider layout: label 170 + value 100 = 270 total
    const cTotX = W - MARGIN - 270;
    doc.font("Regular").fontSize(9);
    pdfColor(doc, GRAY);
    doc.text(`Card / Bank Transfer (+${surcharge}%):`, cTotX, y, { width: 170 });
    pdfColor(doc, DARK_PURPLE);
    doc.font("Bold").fontSize(9);
    doc.text(`${data.currency} ${fmt(cardTotal)}`, cTotX + 170, y, { width: 100, align: "right" });
    y += 18;
  }

  // ── Payment Methods ───────────────────────────────────────────────────────
  y += 6;
  doc.rect(MARGIN, y, contentW, 14).fill(hexToRgb(LIGHT_PINK) as unknown as string);
  doc.font("Bold").fontSize(9);
  pdfColor(doc, DARK_PURPLE);
  doc.text("PAYMENT METHODS", MARGIN + 6, y + 3);
  y += 18;
  doc.font("Regular").fontSize(9);
  pdfColor(doc, DARK_PURPLE);
  const propSurcharge = data.cardSurchargePct ?? 23;
  doc.text(`Cash is accepted as the standard payment method. For card or bank transfer payments, kindly use the "Card / Bank Transfer Total (+${propSurcharge}%)" amount shown on the invoice. After payment, please share the receipt via the provided WhatsApp number or email.`, MARGIN + 6, y, { width: contentW - 12 });
  y += 30;

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (data.notes) {
    y += 6;
    doc.rect(MARGIN, y, contentW, 14).fill(hexToRgb(LIGHT_PINK) as unknown as string);
    doc.font("Bold").fontSize(9);
    pdfColor(doc, DARK_PURPLE);
    doc.text("NOTES", MARGIN + 6, y + 3);
    y += 18;
    pdfColor(doc, DARK_PURPLE);
    smartText(doc, data.notes, MARGIN + 6, y, { fontSize: 9, width: contentW - 12 });
    y += 20;
  }

  // ── Service Notes (footnotes) ─────────────────────────────────────────────────
  if (propFootnotes.length > 0) {
    y += 12;
    doc.rect(MARGIN, y, contentW, 14).fill(hexToRgb("#E8F4F8") as unknown as string);
    doc.font("Bold").fontSize(8);
    pdfColor(doc, "#2A7B9B");
    doc.text("SERVICE NOTES", MARGIN + 6, y + 3);
    y += 16;
    pdfStroke(doc, "#B0D4E3");
    doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).stroke();
    y += 6;
    propFootnotes.forEach((fn) => {
      doc.font("Bold").fontSize(7);
      pdfColor(doc, "#2A7B9B");
      doc.text(String(fn.idx), MARGIN + 4, y, { width: 10 });
      doc.font("Regular").fontSize(7.5);
      pdfColor(doc, "#4A5568");
      const noteText = `${fn.name} — ${fn.desc}`;
      const noteH = doc.heightOfString(noteText, { width: contentW - 22 });
      doc.text(noteText, MARGIN + 16, y, { width: contentW - 22 });
      y += Math.max(noteH, 10) + 4;
    });
    y += 6;
  }

  // ── Validity note ─────────────────────────────────────────────────────────────────
  y += 10;
  doc.font("Regular").fontSize(9);
  pdfColor(doc, GRAY);
  doc.text("This proposal is valid for 30 days from the issue date. Prices are subject to change. Please contact us to confirm availability and schedule your treatment.", MARGIN, y, { width: contentW });

  //  // ── Stamp (above footer, on white background) ─────────────────────────────────────────────────────
  if (stampBuffer) {
    try {
      y += 12;
      doc.image(stampBuffer, W - MARGIN - 90, y, { height: 80, fit: [90, 80] });
      y += 90;
    } catch { /* ignore */ }
  }

  // ── Footer ─────────────────────────────────────────────────────
  const pageH = 841.89;
  doc.rect(0, pageH - 50, W, 50).fill(hexToRgb(DARK_PURPLE) as unknown as string);
  doc.font("Regular").fontSize(8);
  pdfColor(doc, LIGHT_PINK);
  const footerPartsP = [clinicName, clinicEmail, clinicWhatsapp].filter(Boolean).join("  |  ");
  doc.text(footerPartsP, MARGIN, pageH - 32, { width: contentW, align: "center" });
  doc.font("Regular").fontSize(7);
  pdfColor(doc, PEACH);
  doc.text(`Thank you for choosing ${clinicName}`, MARGIN, pageH - 18, { width: contentW, align: "center" });

  return bufferFromDoc(doc);
}

// ─── Refund PDF ────────────────────────────────────────────────────────────────────────────────

export async function generateRefundPdf(data: RefundPdfData): Promise<Buffer> {
  // Load clinic info for refund PDF
  const { info: clinic, logoBuffer, stampBuffer } = await loadClinicAssets("en_dark");
  const clinicName = clinic?.nameEn ?? "Fertiliv";
  const clinicSlogan = clinic?.sloganEn ?? "Fertility Clinic";
  const clinicEmail = clinic?.email ?? "info@fertiliv.com";
  const clinicWhatsapp = clinic?.whatsapp ?? "+90 501 114 70 60";

  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
  const W = 595.28;
  const MARGIN = 40;
  const contentW = W - MARGIN * 2;

  doc.registerFont("Regular",   FONT.regular);
  doc.registerFont("Bold",      FONT.bold);
  doc.registerFont("ArRegular", FONT.arRegular);
  doc.registerFont("ArBold",    FONT.arBold);

  // ── Header band ──────────────────────────────────────────────────────────
  doc.rect(0, 0, W, 110).fill(hexToRgb(DARK_PURPLE) as unknown as string);

  // Logo or clinic name
  if (logoBuffer) {
    try { doc.image(logoBuffer, MARGIN, 18, { height: 70, fit: [180, 70] }); } catch { /* fallback */ }
  }
  if (!logoBuffer) {
    doc.font("Bold").fontSize(22);
    pdfColor(doc, "#FFFFFF");
    doc.text(clinicName, MARGIN, 28);
    doc.font("Regular").fontSize(10);
    pdfColor(doc, LIGHT_PINK);
    doc.text(clinicSlogan, MARGIN, 54);
  }

  doc.font("Bold").fontSize(18);
  pdfColor(doc, "#FFFFFF");
  doc.text("REFUND RECEIPT", W - MARGIN - 160, 28, { width: 160, align: "right" });

  doc.font("Regular").fontSize(10);
  pdfColor(doc, PEACH);
  doc.text(`Ref: ${data.invoiceNumber ?? ""}`, W - MARGIN - 160, 54, { width: 160, align: "right" });

  // Status badge
  doc.roundedRect(W - MARGIN - 80, 72, 80, 22, 4).fill(hexToRgb("#d1fae5") as unknown as string);
  doc.font("Bold").fontSize(9);
  pdfColor(doc, "#065f46");
  doc.text("REFUNDED", W - MARGIN - 80, 79, { width: 80, align: "center" });

  // Gradient divider
  doc.rect(0, 110, W / 2, 4).fill(hexToRgb(LIGHT_PINK) as unknown as string);
  doc.rect(W / 2, 110, W / 2, 4).fill(hexToRgb(PEACH) as unknown as string);

  // ── Info ──────────────────────────────────────────────────────────────────
  let y = 130;

  doc.font("Bold").fontSize(9);
  pdfColor(doc, GRAY);
  doc.text("PATIENT", MARGIN, y);
  y += 14;
  pdfColor(doc, DARK_PURPLE);
  smartText(doc, data.patientName, MARGIN, y, { bold: true, fontSize: 12, width: contentW / 2 - 10 });
  if (data.mrn) {
    y += 18;
    doc.font("Regular").fontSize(9);
    pdfColor(doc, GRAY);
    doc.text(`MRN: ${data.mrn}`, MARGIN, y);
  }

  // Right: date
  doc.font("Bold").fontSize(9);
  pdfColor(doc, GRAY);
  doc.text("REFUND DATE", W - MARGIN - 160, 130, { width: 160, align: "right" });
  doc.font("Regular").fontSize(10);
  pdfColor(doc, DARK_PURPLE);
  doc.text(data.refundDate, W - MARGIN - 160, 144, { width: 160, align: "right" });

  y += 24;
  pdfStroke(doc, LIGHT_GRAY);
  doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).stroke();
  y += 20;

  // ── Refund amount box ─────────────────────────────────────────────────────
  doc.rect(MARGIN, y, contentW, 60).fill(hexToRgb(LIGHT_BG) as unknown as string);
  doc.font("Bold").fontSize(11);
  pdfColor(doc, GRAY);
  doc.text("REFUND AMOUNT", MARGIN + 16, y + 12);
  doc.font("Bold").fontSize(22);
  pdfColor(doc, DARK_PURPLE);
  doc.text(`${data.currency} ${fmt(data.refundAmount)}`, MARGIN + 16, y + 28);
  y += 76;

  // ── Details ───────────────────────────────────────────────────────────────
  if (data.reason) {
    doc.font("Bold").fontSize(9);
    pdfColor(doc, GRAY);
    doc.text("REASON FOR REFUND", MARGIN, y);
    y += 14;
    pdfColor(doc, DARK_PURPLE);
    smartText(doc, data.reason, MARGIN, y, { fontSize: 10, width: contentW });
    y += 20;
  }

  if (data.notes) {
    y += 6;
    doc.rect(MARGIN, y, contentW, 14).fill(hexToRgb(LIGHT_PINK) as unknown as string);
    doc.font("Bold").fontSize(9);
    pdfColor(doc, DARK_PURPLE);
    doc.text("NOTES", MARGIN + 6, y + 3);
    y += 18;
    pdfColor(doc, DARK_PURPLE);
    smartText(doc, data.notes, MARGIN + 6, y, { fontSize: 9, width: contentW - 12 });
    y += 20;
  }

  y += 20;
  doc.font("Regular").fontSize(10);
  pdfColor(doc, GRAY);
  doc.text("This document confirms that the above refund has been processed. Please allow 3–5 business days for the amount to reflect in your account.", MARGIN, y, { width: contentW });

  // ── Footer ────────────────────────────────────────────────────────────────
  const pageH = 841.89;
  doc.rect(0, pageH - 50, W, 50).fill(hexToRgb(DARK_PURPLE) as unknown as string);
  doc.font("Regular").fontSize(8);
  pdfColor(doc, LIGHT_PINK);
  const footerPartsR = [clinicName, clinicEmail, clinicWhatsapp].filter(Boolean).join("  |  ");
  doc.text(footerPartsR, MARGIN, pageH - 32, { width: contentW, align: "center" });
  doc.font("Regular").fontSize(7);
  pdfColor(doc, PEACH);
  doc.text(`Thank you for choosing ${clinicName}`, MARGIN, pageH - 18, { width: contentW, align: "center" });
  if (stampBuffer) {
    try { doc.image(stampBuffer, W - MARGIN - 50, pageH - 48, { height: 40, fit: [50, 40] }); } catch { /* ignore */ }
  }

  return bufferFromDoc(doc);
}

// ─── Treatment Plan PDF ───────────────────────────────────────────────────────
export interface TreatmentPlanPdfData {
  planCode: string;
  patientName: string;
  mrn?: string;
  issueDate: string;
  doctorName?: string;
  clinicalSummary?: string;
  language?: string;
  qaAnswers?: Array<{
    question: string;
    askedBy: "female" | "male";
    answer: string;
  }>;
  scenarios: Array<{
    title: string;
    summary?: string;
    services: Array<{
      serviceName: string;
      category: string;
      quantity: number;
      isMedication?: boolean;
      dosage?: string;
      frequency?: string;
      notes?: string;
    }>;
  }>;
}

export async function generateTreatmentPlanPdf(data: TreatmentPlanPdfData): Promise<Buffer> {
  // Load clinic info
  const { info: clinic, logoBuffer } = await loadClinicAssets("en_dark");
  const clinicName = clinic?.nameEn ?? "Fertiliv";
  const clinicSlogan = clinic?.sloganEn ?? "Fertility Clinic";
  const clinicEmail = clinic?.email ?? "info@fertiliv.com";
  const clinicWhatsapp = clinic?.whatsapp ?? "+90 501 114 70 60";

  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
  const W = 595.28;
  const MARGIN = 40;
  const contentW = W - MARGIN * 2;

  doc.registerFont("Regular",   FONT.regular);
  doc.registerFont("Bold",      FONT.bold);
  doc.registerFont("ArRegular", FONT.arRegular);
  doc.registerFont("ArBold",    FONT.arBold);

  // ── Header band ──────────────────────────────────────────────────────────────────────
  doc.rect(0, 0, W, 110).fill(hexToRgb(DARK_PURPLE) as unknown as string);
  if (logoBuffer) {
    try { doc.image(logoBuffer, MARGIN, 18, { height: 70, fit: [180, 70] }); } catch { /* fallback */ }
  }
  if (!logoBuffer) {
    doc.font("Bold").fontSize(22);
    pdfColor(doc, "#FFFFFF");
    doc.text(clinicName, MARGIN, 28);
    doc.font("Regular").fontSize(10);
    pdfColor(doc, LIGHT_PINK);
    doc.text(clinicSlogan, MARGIN, 54);
  }

  doc.font("Bold").fontSize(14);
  pdfColor(doc, "#FFFFFF");
  doc.text("TREATMENT", W - MARGIN - 160, 22, { width: 160, align: "right" });
  doc.text("PLAN", W - MARGIN - 160, 40, { width: 160, align: "right" });
  doc.font("Regular").fontSize(10);
  pdfColor(doc, PEACH);
  doc.text(data.planCode, W - MARGIN - 160, 62, { width: 160, align: "right" });

  doc.roundedRect(W - MARGIN - 110, 72, 110, 22, 4).fill(hexToRgb("#fef3c7") as unknown as string);
  doc.font("Bold").fontSize(8);
  pdfColor(doc, "#92400e");
  doc.text("INTERNAL / CLINICAL", W - MARGIN - 110, 79, { width: 110, align: "center" });

  doc.rect(0, 110, W / 2, 4).fill(hexToRgb(LIGHT_PINK) as unknown as string);
  doc.rect(W / 2, 110, W / 2, 4).fill(hexToRgb(PEACH) as unknown as string);

  // ── Patient & Doctor info row ───────────────────────────────────────────────
  let y = 130;
  doc.font("Bold").fontSize(9);
  pdfColor(doc, GRAY);
  doc.text("PATIENT", MARGIN, y);
  y += 14;
  pdfColor(doc, DARK_PURPLE);
  const tpNameW = contentW / 2 - 10;
  doc.font("Bold").fontSize(11);
  const tpNameH = doc.heightOfString(data.patientName, { width: tpNameW });
  smartText(doc, data.patientName, MARGIN, y, { bold: true, fontSize: 11, width: tpNameW });
  if (data.mrn) {
    y += Math.max(tpNameH + 4, 16);
    doc.font("Regular").fontSize(9);
    pdfColor(doc, GRAY);
    doc.text("MRN: " + data.mrn, MARGIN, y);
  } else {
    y += Math.max(tpNameH + 4, 16);
  }

  doc.font("Bold").fontSize(9);
  pdfColor(doc, GRAY);
  doc.text("DATE", W - MARGIN - 160, 130, { width: 160, align: "right" });
  doc.font("Regular").fontSize(10);
  pdfColor(doc, DARK_PURPLE);
  doc.text(data.issueDate, W - MARGIN - 160, 144, { width: 160, align: "right" });

  if (data.doctorName) {
    doc.font("Bold").fontSize(9);
    pdfColor(doc, GRAY);
    doc.text("DOCTOR", W - MARGIN - 160, 162, { width: 160, align: "right" });
    doc.font("Regular").fontSize(9);
    pdfColor(doc, DARK_PURPLE);
    doc.text(data.doctorName, W - MARGIN - 160, 176, { width: 160, align: "right" });
  }

  y += 28;
  pdfStroke(doc, LIGHT_GRAY);
  doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).stroke();
  y += 16;

  // ── Clinical Summary ────────────────────────────────────────────────────────
  if (data.clinicalSummary) {
    doc.rect(MARGIN, y, contentW, 14).fill(hexToRgb(DARK_PURPLE) as unknown as string);
    doc.font("Bold").fontSize(9);
    pdfColor(doc, "#FFFFFF");
    doc.text("CLINICAL SUMMARY", MARGIN + 6, y + 3);
    y += 18;
    pdfColor(doc, DARK_PURPLE);
    const sh = doc.fontSize(9).heightOfString(data.clinicalSummary, { width: contentW - 12 });
    smartText(doc, data.clinicalSummary, MARGIN + 6, y, { fontSize: 9, width: contentW - 12 });
    y += sh + 16;
  }

  // ── Q&A Answers ─────────────────────────────────────────────────────────────
  if (data.qaAnswers && data.qaAnswers.length > 0) {
    doc.rect(MARGIN, y, contentW, 14).fill(hexToRgb(DARK_PURPLE) as unknown as string);
    doc.font("Bold").fontSize(9);
    pdfColor(doc, "#FFFFFF");
    doc.text("PATIENT QUESTIONS & DOCTOR ANSWERS", MARGIN + 6, y + 3);
    y += 18;

    for (const qa of data.qaAnswers) {
      if (y > 750) { doc.addPage(); y = 40; }
      const askedByLabel = qa.askedBy === "female" ? "Female Patient" : "Male Patient";
      const qText = "Q (" + askedByLabel + "): " + qa.question;
      const aText = "A: " + (qa.answer || "—");
      doc.font("Bold").fontSize(9);
      const qH = doc.heightOfString(qText, { width: contentW - 12 });
      doc.font("Regular").fontSize(9);
      const aH = doc.heightOfString(aText, { width: contentW - 24 });
      const blockH = qH + aH + 20;
      doc.rect(MARGIN, y, contentW, blockH).fill(hexToRgb(LIGHT_BG) as unknown as string);
      doc.font("Bold").fontSize(9);
      pdfColor(doc, DARK_PURPLE);
      doc.text(qText, MARGIN + 6, y + 6, { width: contentW - 12 });
      doc.font("Regular").fontSize(9);
      pdfColor(doc, GRAY);
      doc.text(aText, MARGIN + 18, y + 6 + qH + 4, { width: contentW - 24 });
      y += blockH + 6;
    }
    y += 6;
  }

  // ── Scenarios ────────────────────────────────────────────────────────────────
  if (data.scenarios && data.scenarios.length > 0) {
    for (let si = 0; si < data.scenarios.length; si++) {
      const scenario = data.scenarios[si];
      if (y > 700) { doc.addPage(); y = 40; }

      doc.rect(MARGIN, y, contentW, 18).fill(hexToRgb(LIGHT_PINK) as unknown as string);
      pdfColor(doc, DARK_PURPLE);
      smartText(doc, "SCENARIO " + (si + 1) + ": " + scenario.title.toUpperCase(), MARGIN + 8, y + 4, { bold: true, fontSize: 10, width: contentW - 16 });
      y += 22;

      if (scenario.summary) {
        pdfColor(doc, DARK_PURPLE);
        const sh2 = doc.fontSize(9).heightOfString(scenario.summary, { width: contentW - 12 });
        smartText(doc, scenario.summary, MARGIN + 6, y, { fontSize: 9, width: contentW - 12 });
        y += sh2 + 10;
      }

      if (scenario.services && scenario.services.length > 0) {
        const colCatW = Math.round(contentW * 0.28);
        const colSvcW = Math.round(contentW * 0.52);
        const colQtyW = contentW - colCatW - colSvcW;

        doc.rect(MARGIN, y, contentW, 14).fill(hexToRgb(GRAY) as unknown as string);
        doc.font("Bold").fontSize(8);
        pdfColor(doc, "#FFFFFF");
        doc.text("CATEGORY", MARGIN + 4, y + 3, { width: colCatW - 4 });
        doc.text("SERVICE", MARGIN + colCatW + 4, y + 3, { width: colSvcW - 4 });
        doc.text("QTY", MARGIN + colCatW + colSvcW + 4, y + 3, { width: colQtyW - 4, align: "center" });
        y += 14;

        for (let ri = 0; ri < scenario.services.length; ri++) {
          const svc = scenario.services[ri];
          const rowBg = ri % 2 === 0 ? "#FFFFFF" : LIGHT_BG;
          doc.font("Regular").fontSize(8.5);
          const svcH = Math.max(doc.heightOfString(svc.serviceName, { width: colSvcW - 8 }), 14);
          const rowH = svcH + 8;
          doc.rect(MARGIN, y, contentW, rowH).fill(hexToRgb(rowBg) as unknown as string);
          pdfColor(doc, GRAY);
          smartText(doc, svc.category, MARGIN + 4, y + 4, { fontSize: 8.5, width: colCatW - 8 });
          pdfColor(doc, DARK_PURPLE);
          smartText(doc, svc.serviceName, MARGIN + colCatW + 4, y + 4, { fontSize: 8.5, width: colSvcW - 8 });
          doc.font("Bold").fontSize(8.5);
          pdfColor(doc, DARK_PURPLE);
          doc.text(String(svc.quantity), MARGIN + colCatW + colSvcW + 4, y + 4, { width: colQtyW - 8, align: "center" });
          pdfStroke(doc, LIGHT_GRAY);
          doc.moveTo(MARGIN, y + rowH).lineTo(W - MARGIN, y + rowH).stroke();
          y += rowH;
        }
      }
      y += 16;
    }
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
  const pageH = 841.89;
  doc.rect(0, pageH - 50, W, 50).fill(hexToRgb(DARK_PURPLE) as unknown as string);
  doc.font("Regular").fontSize(8);
  pdfColor(doc, LIGHT_PINK);
  const footerPartsT = [clinicName, clinicEmail, clinicWhatsapp].filter(Boolean).join("  |  ");
  doc.text(footerPartsT, MARGIN, pageH - 32, { width: contentW, align: "center" });
  doc.font("Regular").fontSize(7);
  pdfColor(doc, PEACH);
  doc.text("CONFIDENTIAL — For clinical use only", MARGIN, pageH - 18, { width: contentW, align: "center" });

  return bufferFromDoc(doc);
}

// ─── Medical Report PDF ───────────────────────────────────────────────────────
export interface MedicalReportPdfData {
  reportRef: string;
  visitDate: string;
  noteType: string;
  patientName: string;
  mrn: string;
  dateOfBirth?: string;
  age?: number;
  gender?: string;
  nationality?: string;
  phone?: string;
  doctorName?: string;
  doctorTitle?: string;
  doctorSpecialty?: string;
  doctorStampKey?: string;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  physicalExamination?: string;
  assessment?: string;
  plan?: string;
  diagnosis?: string;
  medications?: string;
  additionalNotes?: string;
}

export async function generateMedicalReportPdf(data: MedicalReportPdfData): Promise<Buffer> {
  const { info: clinic, logoBuffer } = await loadClinicAssets("en_dark");
  const clinicName  = clinic?.nameEn  ?? "Fertiliv IVF Center";
  const clinicEmail = clinic?.email   ?? "info@fertiliv.com";
  const clinicPhone = clinic?.whatsapp ?? "+90 501 114 70 60";
  const clinicAddr  = clinic?.addressEn ?? "";

  let doctorStampBuffer: Buffer | null = null;
  if (data.doctorStampKey) {
    doctorStampBuffer = await fetchImageBuffer(data.doctorStampKey).catch(() => null);
  }

  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
  const W      = 595.28;
  const MARGIN = 45;
  const cW     = W - MARGIN * 2;

  doc.registerFont("Regular",   FONT.regular);
  doc.registerFont("Bold",      FONT.bold);
  doc.registerFont("ArRegular", FONT.arRegular);
  doc.registerFont("ArBold",    FONT.arBold);

  // Header band
  doc.rect(0, 0, W, 115).fill(hexToRgb(DARK_PURPLE) as unknown as string);
  if (logoBuffer) {
    try { doc.image(logoBuffer, MARGIN, 18, { height: 65, fit: [170, 65] }); } catch { /* ignore */ }
  } else {
    doc.font("Bold").fontSize(20);
    pdfColor(doc, "#FFFFFF");
    doc.text(clinicName, MARGIN, 30, { width: 200 });
  }
  doc.font("Regular").fontSize(8);
  pdfColor(doc, LIGHT_PINK);
  const contactLines = [clinicAddr, clinicEmail, clinicPhone].filter(Boolean);
  contactLines.forEach((line, i) => {
    doc.text(line, MARGIN + 180, 22 + i * 14, { width: cW - 180, align: "right" });
  });

  // Title bar
  doc.rect(0, 115, W, 30).fill(hexToRgb(LIGHT_PINK) as unknown as string);
  doc.font("Bold").fontSize(13);
  pdfColor(doc, DARK_PURPLE);
  doc.text("MEDICAL REPORT", MARGIN, 123, { width: cW / 2 });
  doc.font("Regular").fontSize(9);
  doc.text(`Ref: ${data.reportRef}   |   Date: ${data.visitDate}`, MARGIN + cW / 2, 125, { width: cW / 2, align: "right" });

  let y = 160;
  const tableRowH = 22;

  // Patient info table header
  doc.rect(MARGIN, y, cW, tableRowH).fill(hexToRgb("#EDE9FE") as unknown as string);
  doc.font("Bold").fontSize(9);
  pdfColor(doc, DARK_PURPLE);
  doc.text("PATIENT INFORMATION", MARGIN + 8, y + 6);
  y += tableRowH;

  // 3-column grid layout for patient info
  // Each cell: label on top, value below
  const cellW = cW / 3;
  const cellH = 34; // height for label + value
  const patientCells: { label: string; value: string }[] = [
    { label: "Patient Name", value: data.patientName },
    { label: "Date of Birth", value: data.dateOfBirth ?? "—" },
    { label: "Age", value: data.age !== undefined ? `${data.age} years` : "—" },
    { label: "Medical Record No.", value: data.mrn },
    { label: "Gender", value: data.gender ? data.gender.charAt(0).toUpperCase() + data.gender.slice(1) : "—" },
    { label: "Nationality", value: data.nationality ?? "—" },
    ...(data.phone ? [{ label: "Contact", value: data.phone }] : []),
  ];

  // Render cells in rows of 3
  for (let i = 0; i < patientCells.length; i++) {
    const col = i % 3;
    const rowStart = Math.floor(i / 3);
    if (col === 0) {
      // Start of new row — draw row background
      const rowBg = rowStart % 2 === 0 ? "#FAFAFA" : "#FFFFFF";
      doc.rect(MARGIN, y + rowStart * cellH, cW, cellH).fill(hexToRgb(rowBg) as unknown as string);
      // Draw bottom border
      pdfStroke(doc, LIGHT_GRAY);
      doc.moveTo(MARGIN, y + (rowStart + 1) * cellH).lineTo(W - MARGIN, y + (rowStart + 1) * cellH).stroke();
    }
    const cellX = MARGIN + col * cellW;
    const cellY = y + rowStart * cellH;
    // Vertical divider (except first col)
    if (col > 0) {
      pdfStroke(doc, LIGHT_GRAY);
      doc.moveTo(cellX, cellY).lineTo(cellX, cellY + cellH).stroke();
    }
    doc.font("Bold").fontSize(7.5);
    pdfColor(doc, GRAY);
    doc.text(patientCells[i].label, cellX + 6, cellY + 5, { width: cellW - 12 });
    doc.font("Regular").fontSize(8.5);
    pdfColor(doc, "#111827");
    doc.text(patientCells[i].value, cellX + 6, cellY + 16, { width: cellW - 12 });
  }

  const numRows = Math.ceil(patientCells.length / 3);
  y += numRows * cellH;

  // Visit info row
  doc.rect(MARGIN, y, cW, tableRowH).fill(hexToRgb("#EDE9FE") as unknown as string);
  doc.font("Bold").fontSize(8.5);
  pdfColor(doc, DARK_PURPLE);
  doc.text(`Visit Type: ${data.noteType}`, MARGIN + 8, y + 6, { width: cW / 2 });
  if (data.doctorName) {
    doc.text(`Physician: ${data.doctorTitle ? data.doctorTitle + " " : ""}${data.doctorName}`, MARGIN + cW / 2 + 8, y + 6, { width: cW / 2 - 16 });
  }
  y += tableRowH + 18;

  // Clinical sections
  const sections: { label: string; value?: string | null }[] = [
    { label: "Chief Complaint",            value: data.chiefComplaint },
    { label: "History of Present Illness", value: data.historyOfPresentIllness },
    { label: "Physical Examination",       value: data.physicalExamination },
    { label: "Assessment",                 value: data.assessment },
    { label: "Diagnosis",                  value: data.diagnosis },
    { label: "Plan",                       value: data.plan },
    { label: "Medications",                value: data.medications },
    { label: "Additional Notes",           value: data.additionalNotes },
  ].filter(s => s.value && s.value.trim());

  for (const section of sections) {
    if (y > 720) { doc.addPage(); y = 40; }
    doc.rect(MARGIN, y, cW, 18).fill(hexToRgb("#F3F0FF") as unknown as string);
    doc.font("Bold").fontSize(9);
    pdfColor(doc, DARK_PURPLE);
    doc.text(section.label.toUpperCase(), MARGIN + 8, y + 4, { width: cW - 16 });
    y += 18;
    doc.fontSize(9);
    const textH = doc.heightOfString(section.value!, { width: cW - 16 });
    doc.rect(MARGIN, y, cW, textH + 12).fill(hexToRgb("#FFFFFF") as unknown as string);
    pdfStroke(doc, LIGHT_GRAY);
    doc.rect(MARGIN, y, cW, textH + 12).stroke();
    doc.font("Regular").fontSize(9);
    pdfColor(doc, "#111827");
    doc.text(section.value!, MARGIN + 8, y + 6, { width: cW - 16 });
    y += textH + 12 + 10;
  }

  y += 20;
  if (y > 680) { doc.addPage(); y = 40; }

  // Signature section
  pdfStroke(doc, LIGHT_GRAY);
  doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).stroke();
  y += 14;
  const drLabel = [data.doctorTitle, data.doctorName].filter(Boolean).join(" ");
  doc.font("Bold").fontSize(10);
  pdfColor(doc, DARK_PURPLE);
  doc.text(drLabel || "Physician", MARGIN, y, { width: cW * 0.55 });
  y += 16;
  if (data.doctorSpecialty) {
    doc.font("Regular").fontSize(8.5);
    pdfColor(doc, GRAY);
    doc.text(data.doctorSpecialty, MARGIN, y, { width: cW * 0.55 });
    y += 14;
  }
  if (doctorStampBuffer) {
    try { doc.image(doctorStampBuffer, MARGIN, y + 6, { height: 90, fit: [130, 90] }); } catch { /* ignore */ }
  }

  // Footer
  const pageH = 841.89;
  doc.rect(0, pageH - 50, W, 50).fill(hexToRgb(DARK_PURPLE) as unknown as string);
  doc.font("Regular").fontSize(8);
  pdfColor(doc, LIGHT_PINK);
  const footerText = [clinicName, clinicEmail, clinicPhone].filter(Boolean).join("  |  ");
  doc.text(footerText, MARGIN, pageH - 38, { width: cW, align: "center" });
  doc.font("Regular").fontSize(7);
  pdfColor(doc, PEACH);
  doc.text("CONFIDENTIAL — For clinical use only", MARGIN, pageH - 24, { width: cW, align: "center" });

  return bufferFromDoc(doc);
}

// ─── External Report PDF ──────────────────────────────────────────────────────

export interface ExternalReportPdfData {
  reportRef: string;
  reportDate: string;
  reportType?: string | null;
  sourceOrganization?: string;
  processingNote?: string;
  processedContent: string;
  processedDocument?: ExternalReportDocument | null;
  patientName: string;
  mrn?: string;
  dateOfBirth?: string;
  age?: number;
  gender?: string;
  nationality?: string;
  phone?: string;
}

export const EXTERNAL_REPORT_PDF_CONTINUATION_MARGIN = 48;

export function normalizeExternalReportPdfType(reportType?: string | null): string | null {
  const normalized = reportType?.trim() ?? "";
  return normalized && normalized.toLowerCase() !== "not specified" ? normalized : null;
}

export function buildExternalReportPdfFilename(reportRef?: string | null, reportType?: string | null): string {
  const safeRef = (reportRef?.trim() || "External-Report")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "External-Report";
  const safeType = normalizeExternalReportPdfType(reportType)
    ?.replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safeType || "External-Report"}-${safeRef}.pdf`;
}

function drawExternalReportTable(doc: PDFKit.PDFDocument, block: Extract<ExternalReportDocument["blocks"][number], { type: "table" }>, y: number, margin: number, contentWidth: number, pageHeight: number) {
  const columns = block.columns.slice(0, 8);
  const columnWidth = contentWidth / Math.max(columns.length, 1);
  const drawHeader = () => {
    doc.rect(margin, y, contentWidth, 22).fill(hexToRgb(DARK_PURPLE) as unknown as string);
    columns.forEach((column, index) => { pdfColor(doc, "#FFFFFF"); smartText(doc, column, margin + index * columnWidth + 4, y + 6, { bold: true, fontSize: 7.5, width: columnWidth - 8 }); });
    y += 22;
  };
  if (block.caption) { if (y > pageHeight - 130) { doc.addPage(); y = margin; } smartText(doc, block.caption, margin, y, { bold: true, fontSize: 9, width: contentWidth }); y += 15; }
  if (y > pageHeight - 150) { doc.addPage(); y = margin; }
  drawHeader();
  block.rows.map((row) => row.slice(0, columns.length)).forEach((row, rowIndex) => {
    const rowHeight = Math.max(24, ...row.map((cell) => { doc.font(isArabic(cell) ? FONT.arRegular : FONT.regular).fontSize(8); return doc.heightOfString(cell, { width: columnWidth - 8 }) + 10; }));
    if (y + rowHeight > pageHeight - 56) { doc.addPage(); y = margin; drawHeader(); }
    if (rowIndex % 2 === 1) doc.rect(margin, y, contentWidth, rowHeight).fill(hexToRgb(LIGHT_BG) as unknown as string);
    row.forEach((cell, index) => {
      pdfStroke(doc, LIGHT_GRAY); doc.rect(margin + index * columnWidth, y, columnWidth, rowHeight).lineWidth(0.4).stroke();
      pdfColor(doc, "#1F2937"); smartText(doc, cell, margin + index * columnWidth + 4, y + 5, { fontSize: 8, width: columnWidth - 8, features: isArabic(cell) ? ["rtla"] : undefined });
    });
    y += rowHeight;
  });
  return y + 8;
}

function drawExternalReportDocument(doc: PDFKit.PDFDocument, reportDocument: ExternalReportDocument, initialY: number, margin: number, contentWidth: number, pageHeight: number) {
  let y = initialY;
  for (const block of reportDocument.blocks) {
    if (block.type === "table") { y = drawExternalReportTable(doc, block, y, margin, contentWidth, pageHeight); continue; }
    const text = block.type === "list" ? block.items.map((item, index) => block.ordered ? `${index + 1}. ${item}` : `• ${item}`).join("\n") : block.type === "callout" ? `${block.label}: ${block.text}` : "text" in block ? block.text : "";
    if (!text.trim()) continue;
    const fontSize = block.type === "heading" ? (block.level === 1 ? 13 : 10.5) : block.type === "callout" ? 9.5 : 9;
    doc.font(isArabic(text) ? FONT.arRegular : FONT.regular).fontSize(fontSize);
    const height = doc.heightOfString(text, { width: contentWidth });
    // Legacy text is continuous prose. PDFKit paginates it naturally, allowing page one to
    // use available space instead of moving a whole plain-text report to a new page.
    if (block.type === "legacy_text") {
      pdfColor(doc, "#1F2937");
      smartText(doc, text, margin, y, { fontSize, width: contentWidth });
      y = doc.y + 7;
      continue;
    }
    if (y + height > pageHeight - 70) { doc.addPage(); y = margin; }
    if (block.type === "callout") { pdfColor(doc, "#EEF6FF"); doc.roundedRect(margin, y - 3, contentWidth, height + 10, 4).fill(); }
    pdfColor(doc, block.type === "heading" ? DARK_PURPLE : "#1F2937");
    smartText(doc, text, margin, y + (block.type === "callout" ? 2 : 0), { bold: block.type === "heading", fontSize, width: contentWidth });
    y += height + (block.type === "heading" ? 9 : 7);
  }
  return y;
}

export function resolveExternalReportPdfDocument(data: Pick<ExternalReportPdfData, "processedContent" | "processedDocument">) {
  const document = data.processedDocument ?? createLegacyExternalReportDocument(data.processedContent, "und");
  return {
    document,
    usesStructuredDocument: document.blocks.some((block) => block.type !== "legacy_text"),
  } as const;
}

export async function generateExternalReportPdf(data: ExternalReportPdfData): Promise<Buffer> {
  const { info: clinic, logoBuffer } = await loadClinicAssets("en_dark");
  const MARGIN = EXTERNAL_REPORT_PDF_CONTINUATION_MARGIN;
  // PDFKit uses the document margin when automatically flowing continuous legacy text
  // onto a continuation page. Explicit first-page coordinates and structured blocks
  // remain unchanged, while every automatic continuation starts within this safe area.
  const doc = new PDFDocument({ size: "A4", margin: EXTERNAL_REPORT_PDF_CONTINUATION_MARGIN, bufferPages: true });
  const pageW = 595.28;
  const pageH = 841.89;
  const cW = pageW - MARGIN * 2;
  const reportType = normalizeExternalReportPdfType(data.reportType);

  // ── Header bar ──────────────────────────────────────────────────────────────
  pdfColor(doc, DARK_PURPLE);
  doc.rect(0, 0, pageW, 80).fill();

  if (logoBuffer) {
    try { doc.image(logoBuffer, MARGIN, 16, { height: 48, fit: [160, 48] }); } catch { /* skip */ }
  } else {
    doc.font(FONT.bold).fontSize(18);
    pdfColor(doc, "#FFFFFF");
    doc.text(clinic?.nameEn ?? "Fertiliv IVF Center", MARGIN, 28);
  }

  const clinicLine1 = clinic?.nameEn ?? "Fertiliv IVF Center";
  const clinicLine2 = [clinic?.addressEn].filter(Boolean).join(", ");
  const clinicLine3 = clinic?.whatsapp ?? "";
  doc.font(FONT.regular).fontSize(8);
  pdfColor(doc, "#E3B2B0");
  doc.text(clinicLine1, MARGIN, 18, { width: cW, align: "right" });
  if (clinicLine2) doc.text(clinicLine2, MARGIN, 30, { width: cW, align: "right" });
  if (clinicLine3) doc.text(clinicLine3, MARGIN, 42, { width: cW, align: "right" });

  // ── Report title band ────────────────────────────────────────────────────────
  pdfColor(doc, LIGHT_BG);
  doc.rect(0, 80, pageW, 44).fill();
  if (reportType) {
    doc.font(FONT.bold).fontSize(16);
    pdfColor(doc, DARK_PURPLE);
    doc.text(reportType.toUpperCase(), MARGIN, 92, { width: cW * 0.6 });
  }
  doc.font(FONT.regular).fontSize(9);
  pdfColor(doc, GRAY);
  doc.text(`Ref: ${data.reportRef}`, MARGIN + cW * 0.6, 92, { width: cW * 0.4, align: "right" });
  doc.text(`Date: ${data.reportDate}`, MARGIN + cW * 0.6, 106, { width: cW * 0.4, align: "right" });

  // ── Patient info grid (3 columns) ────────────────────────────────────────────
  let y = 140;
  pdfColor(doc, LIGHT_BG);
  doc.rect(MARGIN, y, cW, 64).fill();
  const colW3 = cW / 3;
  const fields: Array<[string, string | undefined]> = [
    ["Patient Name", data.patientName],
    ["Date of Birth", data.dateOfBirth],
    ["Age", data.age !== undefined ? `${data.age} years` : undefined],
    ["MRN", data.mrn],
    ["Gender", data.gender ? data.gender.charAt(0).toUpperCase() + data.gender.slice(1) : undefined],
    ["Nationality", data.nationality],
  ];
  fields.forEach(([label, value], i) => {
    if (!value) return;
    const col = i % 3;
    const row = Math.floor(i / 3);
    const fx = MARGIN + col * colW3 + 10;
    const fy = y + 10 + row * 28;
    doc.font(FONT.regular).fontSize(7);
    pdfColor(doc, GRAY);
    doc.text(label.toUpperCase(), fx, fy, { width: colW3 - 12 });
    doc.font(FONT.bold).fontSize(9);
    pdfColor(doc, DARK_PURPLE);
    doc.text(value, fx, fy + 9, { width: colW3 - 12 });
  });

  // ── Source organization ──────────────────────────────────────────────────────
  y += 74;
  if (data.sourceOrganization) {
    doc.font(FONT.regular).fontSize(8);
    pdfColor(doc, GRAY);
    doc.text("SOURCE ORGANIZATION", MARGIN, y);
    doc.font(FONT.bold).fontSize(10);
    pdfColor(doc, DARK_PURPLE);
    doc.text(data.sourceOrganization, MARGIN, y + 12);
    y += 34;
  }

  // ── Divider ──────────────────────────────────────────────────────────────────
  pdfStroke(doc, LIGHT_GRAY);
  doc.moveTo(MARGIN, y).lineTo(MARGIN + cW, y).lineWidth(0.5).stroke();
  y += 14;

  // ── Report content (canonical structured document with legacy fallback) ───────
  doc.font(FONT.bold).fontSize(10);
  pdfColor(doc, DARK_PURPLE);
  doc.text("REPORT CONTENT", MARGIN, y);
  y += 16;

  const { document: reportDocument } = resolveExternalReportPdfDocument(data);
  y = drawExternalReportDocument(doc, reportDocument, y, MARGIN, cW, pageH);

  // ── AI processing footer note ────────────────────────────────────────────────
  const processingLabel: Record<string, string> = {
    translated: "translated",
    simplified: "simplified for patient understanding",
    formatted: "formatted",
    translate_simplify_ar: "translated to Arabic and simplified for patient understanding",
    translate_simplify_tr: "translated to Turkish and simplified for patient understanding",
  };
  const noteText = `This report has been ${processingLabel[data.processingNote ?? "translated"] ?? "processed"} by Fertiliv IVF Center using AI-assisted technology for patient communication purposes. The original source document was issued by ${data.sourceOrganization ?? "an external medical facility"}.`;
  doc.font(FONT.regular).fontSize(7.5);
  const footerReserve = 36;
  const noteHeight = doc.heightOfString(noteText, { width: cW });
  const noteSectionHeight = 20 + noteHeight;
  y += 20;
  if (y + noteSectionHeight > pageH - footerReserve) { doc.addPage(); y = MARGIN; }
  pdfStroke(doc, LIGHT_GRAY);
  doc.moveTo(MARGIN, y).lineTo(MARGIN + cW, y).lineWidth(0.5).stroke();
  y += 10;
  pdfColor(doc, GRAY);
  doc.text(noteText, MARGIN, y, { width: cW });

  // ── Page footer ──────────────────────────────────────────────────────────────
  const totalPages = (doc as any).bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    // Content flows with the printable continuation margin. Footer coordinates are
    // intentionally below that content area, so disable automatic text-flow bounds
    // only while stamping the fixed footer on already-created pages.
    doc.page.margins.top = 0;
    doc.page.margins.bottom = 0;
    pdfColor(doc, LIGHT_BG);
    doc.rect(0, pageH - 28, pageW, 28).fill();
    doc.font(FONT.regular).fontSize(7.5);
    pdfColor(doc, PEACH);
    doc.text(`Page ${i + 1} of ${totalPages}`, MARGIN, pageH - 18, { width: cW / 2 });
    doc.text("CONFIDENTIAL — Fertiliv IVF Center", MARGIN, pageH - 18, { width: cW, align: "right" });
  }

  return bufferFromDoc(doc);
}
