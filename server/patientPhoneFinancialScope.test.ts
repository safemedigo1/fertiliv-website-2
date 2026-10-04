import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeCallablePhone } from "../shared/phoneUtils";

const projectRoot = resolve(import.meta.dirname, "..");
const source = (relativePath: string) => readFileSync(resolve(projectRoot, relativePath), "utf8");

describe("explicit patient and lead phone call links", () => {
  it("preserves every digit of the reported Malaysian E.164 number", () => {
    expect(normalizeCallablePhone("+60176565912")).toBe("+60176565912");
  });

  it("normalizes presentation separators without truncating a long international number", () => {
    expect(normalizeCallablePhone("+971 50-123 4567")).toBe("+971501234567");
    expect(normalizeCallablePhone("0090 (555) 123-4567")).toBe("+905551234567");
    expect(normalizeCallablePhone("05551234567")).toBe("05551234567");
  });

  it("does not create a callable URI from invalid characters or an empty input", () => {
    expect(normalizeCallablePhone("+60 ext 123")).toBeNull();
    expect(normalizeCallablePhone(" ")).toBeNull();
    expect(normalizeCallablePhone(null)).toBeNull();
  });

  it("renders explicit no-wrap tel links from normalized values in both detail headers", () => {
    const patientPage = source("client/src/pages/PatientDetailPage.tsx");
    const leadPage = source("client/src/pages/LeadDetailPage.tsx");

    for (const page of [patientPage, leadPage]) {
      expect(page).toContain('normalizeCallablePhone(');
      expect(page).toContain('href={`tel:${');
      expect(page).toContain("whitespace-nowrap");
    }
  });
});

describe("Add Patient Test financial scope placement", () => {
  it("keeps the existing admin-only field inside collapsed Advanced options after the main form sections", () => {
    const patientsPage = source("client/src/pages/PatientsPage.tsx");
    const insuranceIndex = patientsPage.indexOf("{/* ── INSURANCE ── */}");
    const detailsIndex = patientsPage.indexOf("<details className=\"rounded-lg border border-violet-200 bg-violet-50\">");
    const testScopeIndex = patientsPage.indexOf("Test financial scope");

    expect(insuranceIndex).toBeGreaterThan(-1);
    expect(detailsIndex).toBeGreaterThan(insuranceIndex);
    expect(testScopeIndex).toBeGreaterThan(detailsIndex);
    expect(patientsPage).toContain("{isAdmin && (");
    expect(patientsPage).toContain('defaultFinancialScope === "test"');
    expect(patientsPage).toContain('event.target.checked ? "test" : "production"');
  });

  it("retains the server-side non-admin guard and production default", () => {
    const router = source("server/routers.ts");
    expect(router).toContain('patientData.defaultFinancialScope ?? "production"');
    expect(router).toContain("Only Admin can create a patient with Test financial scope.");
  });
});
