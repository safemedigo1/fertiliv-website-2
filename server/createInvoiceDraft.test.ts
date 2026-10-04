import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const patientDetail = fs.readFileSync(path.join(root, "client/src/pages/PatientDetailPage.tsx"), "utf8");
const draftHook = fs.readFileSync(path.join(root, "client/src/hooks/useDraftForm.tsx"), "utf8");

describe("Create Invoice local draft lifecycle", () => {
  it("uses a versioned patient-and-financial-scope-specific browser key", () => {
    expect(patientDetail).toContain("fertiliv:create-invoice-draft:v1:patient:${patientId}:scope:${draftScope}");
    expect(patientDetail).toContain("disabled: !open || !patientId || !patientData");
  });

  it("persists coordinator inputs but excludes server-derived Tax, FX, settlement, and credit previews", () => {
    expect(patientDetail).toContain("const nextDraft: CreateInvoiceDraft = { items, currency, notes, payments, notifyPartner, discountPercent, pricingMode, finalAgreedPrice, invoiceAdjustmentOpen, openSendAfterSave };");
    expect(patientDetail).toContain("openSendAfterSave: boolean;");
    const draftShape = patientDetail.slice(patientDetail.indexOf("type CreateInvoiceDraft ="), patientDetail.indexOf("const [items, setItems]"));
    expect(draftShape).not.toContain("taxPreview");
    expect(draftShape).not.toContain("initialPaymentPreview");
    expect(draftShape).not.toContain("totalSettled");
    expect(draftShape).not.toContain("balanceRemaining");
  });

  it("restores a saved draft before optional hand-off defaults and keeps overlay/X close non-destructive", () => {
    expect(patientDetail).toContain("const sourceDraft = hasPersistedInvoiceDraft");
    expect(patientDetail).toContain("? persistedInvoiceDraft");
    expect(patientDetail).toContain("Overlay/X close intentionally retains the local draft for later resume.");
    expect(patientDetail).toContain("useBeforeUnload(open && isCreateInvoiceDraftDirty)");
  });

  it("clears the draft only after explicit Cancel or successful invoice creation", () => {
    const createMutation = patientDetail.slice(patientDetail.indexOf("const createInvoice = trpc.finance.createInvoice.useMutation"), patientDetail.indexOf("const handleOpenChange"));
    expect(createMutation).toContain("clearInvoiceDraft();");
    expect(patientDetail).toContain("const cancelCreateInvoice = () => {");
    expect(patientDetail).toContain("onClick={cancelCreateInvoice}");
    expect(patientDetail).not.toContain("if (!isOpen) {\n      setItems([]);");
  });

  it("rechecks draft lifecycle when the active key changes and exposes readiness before initialization", () => {
    expect(draftHook).toContain("const activeKeyRef = useRef(key);");
    expect(draftHook).toContain("if (activeKeyRef.current === key) return;");
    expect(draftHook).toContain("isReady: boolean;");
    expect(draftHook).toContain("setIsReady(true);");
  });

  it("flags unavailable restored Tax Rules for manual review rather than silent substitution", () => {
    expect(patientDetail).toContain("A saved Tax Rule is no longer available.");
    expect(patientDetail).toContain("Review the affected line and select the intended current Tax Rule before creating this invoice.");
  });
});
