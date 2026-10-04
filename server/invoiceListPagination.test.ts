import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Finance invoice-list Issue Date filtering and pagination", () => {
  const db = () => read("server/db.ts");
  const router = () => read("server/routers.ts");
  const page = () => read("client/src/pages/FinancePage.tsx");

  it("ILP-1 applies Search, Status, Scope, Issue Date, count, and pagination in one authoritative database query model", () => {
    const source = db();
    const start = source.indexOf("export async function getPaginatedInvoices");
    const query = source.slice(start, start + 10000);
    expect(query).toContain('if (input.scope !== "all") conditions.push(eq(invoices.financialScope, input.scope));');
    expect(query).toContain('if (input.status && input.status !== "all") conditions.push(eq(invoices.status, input.status));');
    expect(query).toContain("like(invoices.invoiceNumber, pattern)");
    expect(query).toContain("like(patients.firstName, pattern)");
    expect(query).toContain("const [{ total }] = await db");
    expect(query).toContain(".limit(input.pageSize)");
    expect(query).toContain(".offset((page - 1) * input.pageSize)");
  });

  it("ILP-2 filters only the persisted business Issue Date, inclusive of the selected To day", () => {
    const source = db();
    const start = source.indexOf("export async function getPaginatedInvoices");
    const query = source.slice(start, start + 10000);
    expect(query).toContain("gte(invoices.issueDate, input.issueDateFrom)");
    expect(query).toContain("lt(invoices.issueDate, input.issueDateToExclusive)");
    expect(source.slice(start - 500, start)).toContain("Issue Date is the persisted business date");
    expect(query).not.toContain("payments.receivedAt");
    expect(query).not.toContain("payments.createdAt");
  });

  it("ILP-3 preserves newest-first order with an ID tie-breaker so page membership is deterministic", () => {
    const source = db();
    const start = source.indexOf("export async function getPaginatedInvoices");
    expect(source.slice(start, start + 10000)).toContain(".orderBy(desc(invoices.issueDate), desc(invoices.id))");
  });

  it("ILP-4 admits only the approved page sizes and rejects an inverted Issue Date range", () => {
    const source = router();
    const start = source.indexOf("invoiceList: protectedProcedure");
    const procedure = source.slice(start, start + 5000);
    expect(procedure).toContain("z.union([z.literal(20), z.literal(50), z.literal(100)]).default(20)");
    expect(procedure).toContain("Issue Date From cannot be after Issue Date To.");
    expect(procedure).toContain("issueDateToExclusive.setUTCDate");
  });

  it("ILP-5 protects Test and All invoice lists with the existing Admin-only scope rule", () => {
    const source = router();
    const start = source.indexOf("invoiceList: protectedProcedure");
    const procedure = source.slice(start, start + 5000);
    expect(procedure).toContain('requestedScope === "test" || requestedScope === "all"');
    expect(procedure).toContain("Only Admin can view Test or combined financial records.");
  });

  it("ILP-6 uses page one and the default size initially, resetting to page one when every filter dimension changes", () => {
    const source = page();
    expect(source).toContain("const [page, setPage] = useState(1)");
    expect(source).toContain("const [pageSize, setPageSize] = useState<20 | 50 | 100>(20)");
    expect(source).toContain("setSearch(e.target.value); setPage(1);");
    expect(source).toContain("setStatusFilter(value); setPage(1);");
    expect(source).toContain("setFinancialScope(value as \"production\" | \"test\" | \"all\"); setPage(1);");
    expect(source).toContain("setIssueDateFrom(e.target.value); setPage(1);");
    expect(source).toContain("setIssueDateTo(e.target.value); setPage(1);");
    expect(source).toContain("setPageSize(Number(value) as 20 | 50 | 100); setPage(1);");
  });

  it("ILP-7 presents result-set context and disables Previous/Next at the pagination boundaries", () => {
    const source = page();
    expect(source).toContain("of ${totalInvoices}");
    expect(source).toContain("disabled={currentPage <= 1}");
    expect(source).toContain("disabled={currentPage >= totalPages}");
    expect(source).toContain("flex flex-wrap items-center gap-1");
  });

  it("ILP-8 preserves filtered-dataset export behavior through an explicit on-demand server query rather than the visible page", () => {
    const source = router();
    expect(source).toContain("invoiceListExport: protectedProcedure");
    expect(source).toContain("exportAll: true");
    const client = page();
    expect(client).toContain("const invoiceExport = trpc.finance.invoiceListExport.useQuery");
    expect(client).toContain("return result.data.data;");
  });

  it("ILP-9 leaves the Finance-card query separate from the invoice-list query", () => {
    const source = page();
    expect(source).toContain("const { data: stats } = trpc.finance.stats.useQuery();");
    expect(source).toContain("trpc.finance.invoiceList.useQuery");
  });
});
