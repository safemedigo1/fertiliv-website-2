import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

const dbSource = fs.readFileSync(path.resolve(__dirname, "db.ts"), "utf8");
const routerSource = fs.readFileSync(path.resolve(__dirname, "routers.ts"), "utf8");
const schemaSource = fs.readFileSync(path.resolve(__dirname, "../drizzle/schema.ts"), "utf8");
const patientPageSource = fs.readFileSync(path.resolve(__dirname, "../client/src/pages/PatientDetailPage.tsx"), "utf8");
const pdfRoutesSource = fs.readFileSync(path.resolve(__dirname, "pdfRoutes.ts"), "utf8");
const pdfServiceSource = fs.readFileSync(path.resolve(__dirname, "pdfService.ts"), "utf8");
const receiptDataSource = fs.readFileSync(path.resolve(__dirname, "receiptData.ts"), "utf8");
const lineDisplaySource = fs.readFileSync(path.resolve(__dirname, "../shared/invoiceLineDisplay.ts"), "utf8");

describe("Invoice Draft Revision", () => {
  it("adds additive revision snapshots and pointers without rewriting historical invoice items or payments", () => {
    expect(schemaSource).toContain('pgTable("invoice_revisions"');
    expect(schemaSource).toContain('pgEnum("pg_status_7", ["draft", "published", "discarded"])');
    expect(schemaSource).toContain("currentPublishedRevisionId");
    expect(schemaSource).toContain("activeDraftRevisionId");
    expect(schemaSource).toContain("previousTotals");
    expect(schemaSource).toContain("publishedTotals");
    expect(schemaSource).toContain("changeSummary");
  });

  it("captures a published baseline only when reopening and saves the one active draft without depending on a driver-specific affectedRows shape", () => {
    const reopenStart = dbSource.indexOf("export async function reopenInvoiceForDraftRevision");
    const reopenEnd = dbSource.indexOf("export async function saveInvoiceDraftRevision", reopenStart);
    const reopen = dbSource.slice(reopenStart, reopenEnd);
    const saveStart = reopenEnd;
    const saveEnd = dbSource.indexOf("export async function publishInvoiceDraftRevision", saveStart);
    const save = dbSource.slice(saveStart, saveEnd);
    expect(reopen).toContain("ensureInvoicePublishedRevision");
    expect(reopen).toContain('status: "draft"');
    expect(reopen).toContain("activeDraftRevisionId: draftId");
    expect(reopen).toContain("if (existingDraft) return existingDraft");
    expect(save).toContain("return db.transaction");
    expect(save).toContain("activeDraftRevisionId");
    expect(save).toContain("tx.update(invoiceRevisions)");
    expect(save).not.toContain("affectedRows");
    expect(save).not.toContain("tx.update(invoices)");
  });

  it("reissues atomically from the saved canonical draft and retains settlement/total guards", () => {
    const publishStart = dbSource.indexOf("export async function publishInvoiceDraftRevision");
    const publishEnd = dbSource.indexOf("export async function getInvoiceRevisions", publishStart);
    const publish = dbSource.slice(publishStart, publishEnd);
    const fullStart = dbSource.indexOf("async function updateInvoiceFullWithDb");
    const fullEnd = dbSource.indexOf("export async function updateInvoiceFull", fullStart);
    const full = dbSource.slice(fullStart, fullEnd);
    expect(publish).toContain("return db.transaction");
    expect(publish).toContain("updateInvoiceFullWithDb(tx, invoiceId");
    expect(publish).toContain("allowHistoricalLineEdits: true");
    expect(publish).toContain('status: "published"');
    expect(publish).toContain("currentPublishedRevisionId: draftRevisionId");
    expect(full).toContain("Invoice total cannot be reduced below the amount already settled");
    expect(full).toContain("hasPaymentHistory && !data.allowHistoricalLineEdits");
    expect(full).toContain("recalcInvoicePaidAmountWithDb");
  });

  it("runs existing server canonicalization before Draft Revision storage and exposes no automatic email action", () => {
    const draftSaveStart = routerSource.indexOf("saveInvoiceDraftRevision: staffOrAdminProcedure");
    const draftSaveEnd = routerSource.indexOf("reissueInvoiceDraftRevision", draftSaveStart);
    const draftSave = routerSource.slice(draftSaveStart, draftSaveEnd);
    const reissueStart = routerSource.indexOf("reissueInvoiceDraftRevision: staffOrAdminProcedure");
    const reissueEnd = routerSource.indexOf("// Payments sub-procedures", reissueStart);
    const reissue = routerSource.slice(reissueStart, reissueEnd);
    expect(routerSource).toContain("async function prepareInvoiceFullUpdate");
    expect(draftSave).toContain("prepareInvoiceFullUpdate(input, Array.isArray(baseItems) ? baseItems : undefined)");
    expect(draftSave).not.toContain("sendInvoiceEmail");
    expect(reissue).not.toContain("sendInvoiceEmail");
    expect(reissue).not.toContain("createPayment");
  });

  it("uses a separate Draft Revision staff workflow, resumes the active server draft, and keeps the current official invoice read-only until reopen", () => {
    expect(patientPageSource).toContain("Reopen for Editing");
    expect(patientPageSource).toContain("Resume Draft");
    expect(patientPageSource).toContain("Draft Revision ${existingActiveDraft.revisionNumber} in Progress");
    expect(patientPageSource).toContain("invoiceRevisionsLoading");
    expect(patientPageSource).toContain("Save Draft");
    expect(patientPageSource).toContain("Save & Re-issue");
    expect(patientPageSource).toContain("isPublishedReadOnly");
    expect(patientPageSource).toContain("useBeforeUnload(open && revisionDirty)");
    expect(patientPageSource).toContain("Revision history");
    expect(patientPageSource).toContain("Save & Record Payment");
    expect(patientPageSource).toContain("Current Official Invoice");
    expect(patientPageSource).toContain("A server-saved Draft Revision is in progress. Resume Draft restores its saved values; the current official invoice, payments, and receipts remain unchanged.");
    expect(patientPageSource).toContain("Finish this invoice revision first. Use Save &amp; Re-issue to apply your changes to the current official invoice, then record the payment from the invoice&apos;s Payments section.");
    expect(patientPageSource).toContain("Save Draft only saves your changes for later and does not update the current official invoice.");
    expect(patientPageSource).toContain("items.length > 0 && remaining > 0");
    expect(patientPageSource).not.toContain("The published invoice is unchanged.");
    expect(patientPageSource).not.toContain("Use Save &amp; Record Payment to save this invoice first");
  });

  it("exposes the existing Edit Invoice entry point for issued, partially paid, and paid invoices while preserving cancelled behavior", () => {
    const actionMenuStart = patientPageSource.indexOf("{/* Actions dropdown — works on both mobile and desktop */}");
    const actionMenuEnd = patientPageSource.indexOf("{/* Amounts row */}", actionMenuStart);
    const actionMenu = patientPageSource.slice(actionMenuStart, actionMenuEnd);
    expect(actionMenu).toContain('{inv.status !== "cancelled" && (');
    expect(actionMenu).toContain("setEditingInvoice(inv)");
    expect(actionMenu).toContain("Edit Invoice");
    expect(actionMenu).not.toContain('inv.status !== "paid" && inv.status !== "cancelled" && (\n                        <DropdownMenuItem onClick={() => setEditingInvoice(inv)}');
  });

  it("routes the menu entry to the existing Draft Revision modal rather than a new direct-edit flow", () => {
    expect(patientPageSource).toContain("<EditInvoiceModal");
    expect(patientPageSource).toContain("invoice={editingInvoice}");
    expect(patientPageSource).toContain("onClose={() => setEditingInvoice(null)}");
    expect(patientPageSource).toContain("existingActiveDraft");
    expect(patientPageSource).toContain("Resume Draft");
  });

  it("keeps mobile invoice actions and service cards inside the modal rather than forcing a horizontal footer", () => {
    expect(patientPageSource).toContain("flex w-full flex-col gap-2 border-t");
    expect(patientPageSource).toContain("safe-area-inset-bottom");
    expect(patientPageSource).toContain("flex flex-col gap-2 sm:flex-row sm:items-start");
    expect(patientPageSource).toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
  });

  it("uses the wide desktop invoice grid only where every pricing field has practical room, while preserving the card layout below it", () => {
    expect(patientPageSource).toContain("xl:!w-[calc(100vw-3rem)]");
    expect(patientPageSource).toContain("xl:!max-w-[1760px]");
    expect(patientPageSource).toContain("hidden xl:grid grid-cols-[minmax(280px,2.5fr)_56px_132px_176px_124px_188px_140px_40px]");
    expect(patientPageSource).toContain("space-y-3 xl:hidden");
    expect(patientPageSource).toContain("h-9 min-w-[112px] text-xs text-right");
    expect(patientPageSource).toContain("h-9 min-w-[52px] text-xs text-center");
  });

  it("keeps direct Invoice PDF on the current published invoice source and does not route Official Receipt through revisions", () => {
    expect(pdfRoutesSource).toContain("getInvoiceById");
    expect(pdfRoutesSource).toContain("getInvoiceItems");
    expect(pdfRoutesSource).not.toContain("invoiceRevisions");
  });

  it("persists an optional catalog-service Line Label through revisions without reinterpreting the original description", () => {
    expect(schemaSource).toContain('lineLabel: varchar("lineLabel", { length: 256 })');
    const createInvoiceStart = routerSource.indexOf("createInvoice: staffOrAdminProcedure");
    const createInvoiceBlock = routerSource.slice(createInvoiceStart, createInvoiceStart + 4000);
    expect(createInvoiceBlock).toContain("lineLabel: z.string().trim().max(256).nullable().optional()");
    expect(dbSource).toContain("lineLabel: item.lineLabel ?? null");
    expect(dbSource).toContain("previousItems = previous.items.map");
    expect(dbSource).toContain("nextItems = next.items.map");
    expect(lineDisplaySource).toContain("formatInvoiceLineDisplayName");
    expect(lineDisplaySource).toContain("const label = String(lineLabel ?? \"\").trim()");
  });

  it("shows Line Label only for catalog service lines, previews the canonical composed name, and omits it for custom lines", () => {
    expect(patientPageSource).toContain("Invoice line label (optional)");
    expect(patientPageSource).toContain("formatInvoiceLineDisplayName(item.description, item.lineLabel)");
    expect(patientPageSource).toContain('lineLabel: i.serviceId ? (i.lineLabel?.trim() || null) : undefined');
    expect(patientPageSource).toContain('lineLabel: "",\n      description: sel.service.name');
  });

  it("keeps the stored Final Agreed Price and mode stable when Edit Invoice closes and reopens", () => {
    expect(patientPageSource).toContain('setPricingMode(invoice.pricingMode === "agreed" ? "agreed" : "discount")');
    expect(patientPageSource).toContain('setFinalAgreedPrice(invoice.pricingMode === "agreed" && invoice.finalAgreedAmount != null ? String(invoice.finalAgreedAmount) : "")');
  });

  it("renders the derived negotiated-line discount in the visible Edit Invoice card before Tax details", () => {
    const lineItemsStart = patientPageSource.indexOf("{/* Line Items */}");
    const invoiceWideStart = patientPageSource.indexOf("{/* V3: Mode A / Mode B radio + single input */}", lineItemsStart);
    const lineItems = patientPageSource.slice(lineItemsStart, invoiceWideStart);
    const discountCardStart = lineItems.indexOf("Standard Line Total");
    const taxDetailsStart = lineItems.indexOf("{isTaxModelInvoice && hasTaxDetail && taxLine && (");
    const priceControlsStart = lineItems.indexOf("{!isHistoricalLine && (");
    expect(lineItems).toContain("finalLineTotal: lineTotal.toFixed(2)");
    expect(lineItems).toContain("Standard Line Total");
    expect(lineItems).toContain("Discount ({derivedLineDiscount.discountPercent}%)");
    expect(lineItems).toContain("Adjusted Service Price");
    expect(discountCardStart).toBeGreaterThan(-1);
    expect(discountCardStart).toBeLessThan(taxDetailsStart);
    expect(discountCardStart).toBeLessThan(priceControlsStart);
  });

  it("uses the same composed Line Label display in Invoice and Official Receipt PDF/Email data paths", () => {
    expect(pdfServiceSource).toContain("formatInvoiceLineDisplayName(item.description, item.lineLabel)");
    expect(pdfServiceSource).toContain("lineLabel?: string | null");
    expect(receiptDataSource).toContain("lineLabel: item.lineLabel ?? null");
    expect(routerSource).toContain("formatInvoiceLineDisplayName(i.description, i.lineLabel)");
  });
});
