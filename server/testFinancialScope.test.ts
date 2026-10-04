import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Test Financial Scope and patient-delete safety", () => {
  const db = () => read("server/db.ts");
  const router = () => read("server/routers.ts");
  const schema = () => read("drizzle/schema.ts");

  it("SCOPE-1 persists production as the default financial scope on every financial table", () => {
    const source = schema();
    expect(source).toContain('defaultFinancialScope: pg_defaultFinancialScope("defaultFinancialScope").notNull().default("production")');
    for (const table of ["invoices", "payments", "refunds", "creditTransactions"]) {
      const start = source.indexOf(`export const ${table}`);
      expect(start).toBeGreaterThan(-1);
      expect(source.slice(start, start + 5000)).toContain('financialScope: pg_financialScope("financialScope").notNull().default("production")');
    }
  });

  it("SCOPE-2 inherits a new invoice scope from the patient's persisted default, not a retroactive inference", () => {
    const source = db();
    expect(source).toContain("async function getPatientDefaultFinancialScope");
    expect(source).toContain("patients.defaultFinancialScope");
    expect(source).toContain("const financialScope = await getPatientDefaultFinancialScope(db, data.patientId);");
    expect(source).toContain("financialScope,");
  });

  it("SCOPE-3 excludes Test invoices and payments from official Finance statistics", () => {
    const source = db();
    const statsStart = source.indexOf("export async function getFinanceStats");
    const stats = source.slice(statsStart, statsStart + 10000);
    expect(stats).toContain('eq(invoices.financialScope, "production")');
    expect(stats).toContain('eq(payments.financialScope, "production")');
  });

  it("SCOPE-4 returns only production records for the global invoice list by default", () => {
    expect(db()).toContain('financialScope: FinancialScope | "all" = patientId ? "all" : "production"');
  });

  it("SCOPE-5 preserves both scopes for an explicitly requested patient-level invoice view", () => {
    const source = db();
    expect(source).toContain('financialScope: FinancialScope | "all" = patientId ? "all" : "production"');
    expect(source).toContain('if (financialScope !== "all") conditions.push(eq(invoices.financialScope, financialScope));');
  });

  it("SCOPE-6 inherits the parent invoice scope for payments, credits, and refunds", () => {
    const source = db();
    expect(source).toContain("financialScope: invoice.financialScope ?? \"production\"");
    expect(source).toContain("financialScope = (invoice.financialScope ?? \"production\") as FinancialScope");
    expect(source).toContain("const scope = (inv.financialScope ?? \"production\") as FinancialScope");
  });

  it("SCOPE-7 atomically reclassifies the invoice and all linked financial records, optionally updating the patient default", () => {
    const source = db();
    const start = source.indexOf("export async function classifyInvoiceFinancialScope");
    const classification = source.slice(start, start + 7000);
    expect(classification).toContain("await db.transaction(async (tx) =>");
    expect(classification).toContain("tx.update(invoices).set({ financialScope: input.scope })");
    expect(classification).toContain("tx.update(payments).set({ financialScope: input.scope })");
    expect(classification).toContain("tx.update(refunds).set({ financialScope: input.scope })");
    expect(classification).toContain("tx.update(creditTransactions).set({ financialScope: input.scope })");
    expect(classification).toContain("tx.update(patients).set({ defaultFinancialScope: input.scope })");
    expect(classification).toContain("financial_scope_classification");
  });

  it("SCOPE-8 rejects a classification request that requests the invoice's existing scope", () => {
    const source = db();
    const start = source.indexOf("export async function classifyInvoiceFinancialScope");
    expect(source.slice(start, start + 3000)).toContain('code: "PRECONDITION_FAILED"');
  });

  it("SCOPE-9 exposes scope classification only to Admin users and requires confirmation plus an audit reason", () => {
    const source = router();
    const start = source.indexOf("classifyFinancialScope:");
    const procedure = source.slice(start, start + 3000);
    expect(procedure).toContain("adminProcedure");
    expect(procedure).toContain("reason: z.string().trim().min(3).max(500)");
    expect(procedure).toContain("confirmed: z.literal(true)");
  });

  it("SCOPE-10 blocks patient deletion before any destructive cleanup when financial or operational history exists", () => {
    const source = db();
    const start = source.indexOf("export async function deletePatient");
    const deletion = source.slice(start, start + 6000);
    expect(deletion).toContain("await db.transaction(async (tx) =>");
    for (const dependency of ["payments", "refunds", "invoices", "creditTransactions", "appointments", "leadDocuments", "treatmentCycles"]) {
      expect(deletion).toContain(`.from(${dependency})`);
    }
    expect(deletion).toContain("await tx.update(medicalIntake).set({ patientId: null })");
    expect(deletion).toContain("await tx.update(leads).set({ convertedPatientId: null })");
    expect(deletion).toContain('code: "PRECONDITION_FAILED"');
    expect(deletion.indexOf("dependencyCounts.some")).toBeLessThan(deletion.indexOf("tx.delete(patients)"));
  });

  it("SCOPE-11 permits a patient delete only after the complete preflight finds no dependent history", () => {
    const source = db();
    const start = source.indexOf("export async function deletePatient");
    const deletion = source.slice(start, start + 6000);
    expect(deletion).toContain("// The converting lead and shared intake stay. Only the patient link is cleared.");
    expect(deletion).toContain("await tx.delete(patients).where(eq(patients.id, id));");
  });

  it("SCOPE-12 keeps Test-scope selection separate from patient type and makes it Admin-only in the patient form", () => {
    const source = read("client/src/pages/PatientsPage.tsx");
    expect(source).toContain("Test financial scope");
    expect(source).toContain('defaultFinancialScope: "production"');
    expect(source).toContain("{isAdmin && (");
  });

  it("SCOPE-13 gives Admin an explicit reason-confirmed Test classification action in Finance", () => {
    const source = read("client/src/pages/FinancePage.tsx");
    expect(source).toContain("Mark as Test");
    expect(source).toContain("Required classification reason");
    expect(source).toContain("confirmed: true");
  });
});
