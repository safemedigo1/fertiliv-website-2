import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  createLegacyExternalReportDocument,
  externalReportDocumentSchema,
  parseExternalReportDocument,
  readExternalReportDocument,
} from "./externalReportDocument";
import { buildExternalReportWriteColumns, persistExternalReportCreate } from "./db";
import { decryptExternalReportDocumentPassword, encryptExternalReportDocumentPassword } from "./externalReportSourceCrypto";
import { executeExternalReportPlainTextOneCall, ExternalReportPlainTextEmptyResultError, getExternalReportProviderError as getPlainTextProviderError, plainTextMedicalReportInstruction, resolveExternalReportProcessing } from "./externalReportProcessing";
import { EXTERNAL_REPORT_FINALIZE_STAGES, classifyExternalReportFinalizeFailure, classifyExternalReportSourceAssetStorageFailure, logExternalReportFinalizeFailure, logExternalReportFinalizeStage } from "./externalReportFinalizeObservability";
import { assertSourceBackedExternalReportTables, classifyExternalReportProcessingFailure, EXTERNAL_REPORT_DOCUMENT_RESPONSE_SCHEMA, externalReportDocumentToPlainText, extractFirstCompleteJsonObject, getExternalReportProviderError, getExternalReportStructuredFailureReason, hydrateSourceBackedExternalReportTables, parseStructuredExternalReportOutput, shouldRetryStructuredExternalReportOutput, structuredMedicalReportInstruction } from "./externalReportStructuredProcessing";
import { buildExternalReportSourceAssetPayload, ExternalReportSourceFileRows, removeExternalReportSourceFile } from "../client/src/components/ExternalReportsTab";
import { StructuredExternalReportReview } from "../client/src/components/StructuredExternalReportReview";
import { buildExternalReportPdfFilename, EXTERNAL_REPORT_PDF_CONTINUATION_MARGIN, generateExternalReportPdf, normalizeExternalReportPdfType, resolveExternalReportPdfDocument } from "./pdfService";
import { sanitizeStorageContentType, sanitizeStorageHeaderFileName } from "./storage";

const projectRoot = resolve(import.meta.dirname, "..");
const source = (relativePath: string) => readFileSync(resolve(projectRoot, relativePath), "utf8");

const sourceFixtures = [
  { name: "Semen Analysis", text: "Volume | 2 | mL | 1.5–6.0\nMotility | 42.5 | % | ≥40\nLaboratory comment: Sample collected after 3 days abstinence." },
  { name: "CBC", text: "Hemoglobin | 12.8 | g/dL | 12.0–16.0\nWBC | 6.4 | 10^9/L | 4.0–11.0\nFlag: Normal" },
  { name: "Hormone Panel", text: "FSH | 7.5 | IU/L | 3.0–10.0\nLH | 4.2 | IU/L | 2.0–12.0" },
  { name: "Biochemistry Panel", text: "Glucose | 5.6 | mmol/L | 3.9–5.5\nALT | 26 | U/L | 7–56" },
  { name: "Genetic Report", text: "Karyotype: 46,XX\nLaboratory conclusion: No numerical chromosomal abnormality detected." },
  { name: "Arabic / RTL", text: "تحليل الهرمونات\nFSH | 7.5 | IU/L | 3.0–10.0\nملاحظة المختبر: العينة صالحة للتحليل." },
  { name: "Ambiguous Table", text: "Test    Result\nVolume 2 mL 1.5–6.0\nNote follows without clear column boundaries" },
  { name: "Plain Prose", text: "The laboratory report documents a completed assessment. No tabular structure is asserted by this source." },
];

function transactionHarness() {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  let insertId = 40;
  const tx = {
    insert: () => ({ values: async (value: unknown) => { inserts.push(value); return { insertId: ++insertId }; } }),
    update: () => ({ set: (value: unknown) => ({ where: async () => { updates.push(value); } }) }),
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) }),
  };
  return { tx, inserts, updates };
}

describe("External Reports Phase A authoritative processing", () => {
  it("derives the effective instruction and resolved output language from a single canonical goal", () => {
    expect(resolveExternalReportProcessing({ processingGoal: "translate", requestedTargetLanguage: "ar", sourceLanguage: "en" })).toMatchObject({ processingGoal: "translate", requestedTargetLanguage: "ar", resolvedOutputLanguage: "ar" });
    expect(resolveExternalReportProcessing({ processingGoal: "translate_simplify", requestedTargetLanguage: "tr", sourceLanguage: "en" })).toMatchObject({ processingGoal: "translate_simplify", requestedTargetLanguage: "tr", resolvedOutputLanguage: "tr" });
    expect(resolveExternalReportProcessing({ processingGoal: "simplify", requestedTargetLanguage: "ar", sourceLanguage: "tr" })).toMatchObject({ processingGoal: "simplify", requestedTargetLanguage: null, resolvedOutputLanguage: "tr" });
    expect(resolveExternalReportProcessing({ processingGoal: "format_only", requestedTargetLanguage: "en", sourceLanguage: "ar" })).toMatchObject({ processingGoal: "format_only", requestedTargetLanguage: null, resolvedOutputLanguage: "ar" });
    expect(resolveExternalReportProcessing({ processingGoal: "summarize", requestedTargetLanguage: "source", sourceLanguage: "ar" })).toMatchObject({ processingGoal: "summarize", requestedTargetLanguage: "source", resolvedOutputLanguage: "ar" });
  });

  it("rejects translation goals that have no explicit target language", () => {
    expect(() => resolveExternalReportProcessing({ processingGoal: "translate", requestedTargetLanguage: "source", sourceLanguage: "en" })).toThrow("target language is required");
    expect(() => resolveExternalReportProcessing({ processingGoal: "translate_simplify", sourceLanguage: "en" })).toThrow("target language is required");
  });

  it("does not retain a contradictory requested language for source-language goals", () => {
    const simplified = resolveExternalReportProcessing({ processingGoal: "simplify", requestedTargetLanguage: "ar", sourceLanguage: "en" });
    const formatted = resolveExternalReportProcessing({ processingGoal: "format_only", requestedTargetLanguage: "tr", sourceLanguage: "en" });
    expect(simplified.requestedTargetLanguage).toBeNull();
    expect(simplified.resolvedOutputLanguage).toBe("en");
    expect(formatted.requestedTargetLanguage).toBeNull();
    expect(formatted.resolvedOutputLanguage).toBe("en");
  });
});

describe("External Reports Phase B document compatibility", () => {
  it.each(sourceFixtures)("preserves every legacy $name fixture verbatim without inferring structure", ({ text }) => {
    const document = createLegacyExternalReportDocument(text, "en");
    expect(document.blocks).toEqual([{ type: "legacy_text", text }]);
    expect(externalReportDocumentSchema.parse(document)).toEqual(document);
  });

  it("accepts validated structured blocks but rejects malformed rows safely", () => {
    const valid = {
      version: 1,
      language: "en",
      blocks: [{ type: "table", columns: ["Test", "Result"], rows: [["Volume", "2"]], sourceVerified: true }],
    };
    expect(parseExternalReportDocument(valid)).toEqual(valid);
    expect(parseExternalReportDocument({ ...valid, blocks: [{ type: "table", columns: ["Test", "Result"], rows: [["Volume"]] }] })).toBeNull();
    expect(parseExternalReportDocument("not JSON")).toBeNull();
  });

  it("falls back to one valid legacy_text block for malformed or absent structured content without rewriting the legacy text", () => {
    const legacy = "Value | 1.25 | mg/dL | 0.8–1.2";
    const document = readExternalReportDocument({ processedDocumentJson: "{broken", processedContent: legacy, legacyLanguage: "ar" });
    expect(document).toEqual({ version: 1, language: "ar", blocks: [{ type: "legacy_text", text: legacy }] });
  });

  it("writes canonical processing fields without placing source-capture inputs on the mutable report row", () => {
    const originalText = "LH | 4.2 | IU/L | 2.0–12.0";
    const write = buildExternalReportWriteColumns({
      patientId: 1,
      originalContent: originalText,
      processedContent: originalText,
      createdById: 12,
      sourceCapture: { sourceText: originalText, inputMethod: "text", sourceLanguage: "en" },
      processing: { processingGoal: "translate", requestedTargetLanguage: "ar", resolvedOutputLanguage: "ar" },
    }, createLegacyExternalReportDocument(originalText, "ar"), true) as Record<string, unknown>;

    expect(write).toMatchObject({ processingGoal: "translate", requestedTargetLanguage: "ar", resolvedOutputLanguage: "ar", createdById: 12, originalContent: originalText });
    expect(write).not.toHaveProperty("sourceCapture");
    expect(write).not.toHaveProperty("processing");
  });

  it("persists report, source revision, encrypted asset reference, and processing run through the actual transaction path", async () => {
    const { tx, inserts, updates } = transactionHarness();
    const password = "report-open-password";
    const encryptedPassword = encryptExternalReportDocumentPassword(password);
    const reportId = await persistExternalReportCreate(tx, {
      patientId: 7,
      originalContent: "FSH | 7.5 | IU/L | 3.0–10.0",
      processedContent: "FSH | 7.5 | IU/L | 3.0–10.0",
      status: "final",
      createdById: 4,
      sourceCapture: {
        sourceText: "FSH | 7.5 | IU/L | 3.0–10.0",
        inputMethod: "files",
        sourceLanguage: "en",
        sourceAssetRefs: [{ key: "source/report.pdf", tag: "ExternalReport-01", documentPasswordCiphertext: encryptedPassword }],
      },
      processing: { processingGoal: "translate", requestedTargetLanguage: "ar", resolvedOutputLanguage: "ar", humanReviewFinalized: true },
    });

    expect(reportId).toBe(41);
    expect(inserts).toHaveLength(3);
    expect(inserts[0]).toMatchObject({ processingGoal: "translate", requestedTargetLanguage: "ar", resolvedOutputLanguage: "ar" });
    expect(inserts[1]).toMatchObject({ reportId: 41, revisionNumber: 1, inputMethod: "files", sourceLanguage: "en" });
    expect(JSON.stringify(inserts[1])).toContain("ExternalReport-01");
    expect(JSON.stringify(inserts[1])).toContain(encryptedPassword);
    expect(JSON.stringify(inserts[1])).not.toContain(password);
    expect(inserts[2]).toMatchObject({ reportId: 41, sourceRevisionId: 42, processingGoal: "translate", processingStatus: "finalized" });
    expect(updates).toEqual([{ activeSourceRevisionId: 42 }]);
  });
});

describe("External Reports Phase A–B form safety", () => {
  it("uses one Processing Goal selector rather than overlapping Processing Type, AI Action, and Output Language controls", () => {
    const component = source("client/src/components/ExternalReportsTab.tsx");
    expect(component).toContain("Processing Goal");
    expect(component).not.toContain('label="Processing Type"');
    expect(component).not.toContain("AI Action");
    expect(component).toContain("Target Language *");
    expect(component).toContain("Summary Language");
  });

  it("keeps source and processed content distinct, includes required document controls, and uses mobile-aware layout classes", () => {
    const component = source("client/src/components/ExternalReportsTab.tsx");
    expect(component).toContain("Original Source Content");
    expect(component).toContain("Processed / Patient-ready Content");
    expect(component).toContain("Document password (if protected)");
    expect(component).toContain("ExternalReport-");
    expect(component).toContain("Remove file");
    expect(component).toContain("sm:grid-cols-2");
    expect(component).toContain("flex flex-wrap gap-2");
  });

  it("uses actual immutable source-revision data for edits and never infers source language from output language", () => {
    const component = source("client/src/components/ExternalReportsTab.tsx");
    expect(component).toContain("sourceRevisions.useQuery");
    expect(component).toContain("activeSourceRevision?.sourceLanguage");
    expect(component).toContain("effectiveSourceText = activeSourceRevision?.sourceText ?? form.originalContent");
    expect(component).toContain("!effectiveSourceText.trim()");
    expect(component).toContain('sourceLanguage: "und"');
    expect(component).not.toContain("const sourceLanguage: SourceLanguage =");
  });

  it("uses the current server-owned goal and language resolver with a one-call plain-text compatibility contract", () => {
    const router = source("server/routers.ts");
    const processStart = router.indexOf("processWithAI: staffOrAdminProcedure");
    const extractionStart = router.indexOf("extractFromFiles: staffOrAdminProcedure");
    const processingSource = router.slice(processStart, extractionStart);
    expect(processingSource).toContain("processingGoal");
    expect(processingSource).toContain("resolveExternalReportProcessing");
    expect(processingSource).toContain("plainTextMedicalReportInstruction");
    expect(processingSource).toContain("createLegacyExternalReportDocument");
    expect(processingSource).toContain("providerCallCount: 1");
    expect(processingSource).not.toContain("parseStructuredExternalReportOutput");
    expect(processingSource).not.toContain("hydrateSourceBackedExternalReportTables");
    expect(processingSource).not.toContain("shouldRetryStructuredExternalReportOutput");
    expect(processingSource).not.toContain("response_format");
    expect(source("client/src/components/ExternalReportsTab.tsx")).toContain("Processing is available when creating a new report.");
  });

  it.each([
    ["translate", "en", "tr"],
    ["translate", "tr", "en"],
    ["translate", "ar", "en"],
    ["simplify", null, "en"],
    ["translate_simplify", "ar", "en"],
    ["format_only", null, "tr"],
    ["summarize", "source", "ar"],
  ] as const)("builds a plain-text contract for current goal %s without a structured document requirement", (processingGoal, requestedTargetLanguage, sourceLanguage) => {
    const resolved = resolveExternalReportProcessing({ processingGoal, requestedTargetLanguage, sourceLanguage });
    const instruction = plainTextMedicalReportInstruction(resolved.instruction, resolved.processingGoal);
    expect(instruction).toContain(resolved.instruction);
    expect(instruction).toContain("patient-ready plain text");
    expect(instruction).toContain("Do not return JSON");
    expect(instruction).not.toContain("exact top-level shape");
    expect(instruction).not.toContain("sourceVerified");
  });

  it("requires Translate to preserve all meaningful source sections while leaving other processing goals selective or source-language specific", async () => {
    const multiSectionSyntheticSource = [
      "Report header and non-identifying metadata",
      "Result: 42.5 %; reference range: 40–100",
      "Laboratory comment and explanatory legend",
      "External laboratory contact and closing footer",
    ].join("\n\n");
    const translate = plainTextMedicalReportInstruction(
      resolveExternalReportProcessing({ processingGoal: "translate", requestedTargetLanguage: "ar", sourceLanguage: "tr" }).instruction,
      "translate",
    );
    expect(translate).toContain("complete translation, not a summary or selective extraction");
    expect(translate).toContain("every meaningful source section");
    expect(translate).toContain("explanatory notes and legends");
    expect(translate).toContain("addresses, contact details, or closing/footer text");
    expect(translate).toContain("numbers, percentages, units, reference ranges, dates, flags, and qualitative results faithfully");
    expect(await executeExternalReportPlainTextOneCall(async () => ({ choices: [{ message: { content: multiSectionSyntheticSource } }] }))).toBe(multiSectionSyntheticSource);

    expect(plainTextMedicalReportInstruction("Simplify", "simplify")).not.toContain("complete translation");
    expect(plainTextMedicalReportInstruction("Format", "format_only")).not.toContain("complete translation");
    expect(plainTextMedicalReportInstruction("Summarize", "summarize")).toContain("summary selective");
    expect(plainTextMedicalReportInstruction("Translate and simplify", "translate_simplify")).not.toContain("complete translation");
  });

  it("rejects only a provider error envelope or empty output before the compatibility document is created", () => {
    expect(getPlainTextProviderError({ error: { message: "provider unavailable" } })).toBe("provider unavailable");
    expect(getPlainTextProviderError({ choices: [{ message: { content: "patient-ready text" } }] })).toBeNull();
    const router = source("server/routers.ts");
    const processStart = router.indexOf("processWithAI: staffOrAdminProcedure");
    const extractionStart = router.indexOf("extractFromFiles: staffOrAdminProcedure");
    const processingSource = router.slice(processStart, extractionStart);
    expect(processingSource).toContain('error instanceof ExternalReportPlainTextEmptyResultError ? "empty_result" : "provider_failure"');
    expect(processingSource).toContain('flowTelemetry.fail(error, { failureCategory: category })');
    expect(processingSource).toContain("createLegacyExternalReportDocument(processedContent, resolved.resolvedOutputLanguage)");
  });

  it("executes exactly one de-identified transformation callback and accepts its plain-text result", async () => {
    let providerCalls = 0;
    const result = await executeExternalReportPlainTextOneCall(async () => {
      providerCalls += 1;
      return { choices: [{ message: { content: "Patient-ready plain text." } }] };
    });
    expect(providerCalls).toBe(1);
    expect(result).toBe("Patient-ready plain text.");
    await expect(executeExternalReportPlainTextOneCall(async () => ({ choices: [{ message: { content: "  " } }] }))).rejects.toBeInstanceOf(ExternalReportPlainTextEmptyResultError);
    await expect(executeExternalReportPlainTextOneCall(async () => ({ error: { message: "provider unavailable" } }))).rejects.toThrow("provider unavailable");
  });

  it("safely extracts a complete JSON object from harmless wrappers before strictly validating a canonical report document", () => {
    const document = parseStructuredExternalReportOutput("```json\n{\"version\":1,\"language\":\"en\",\"blocks\":[{\"type\":\"paragraph\",\"text\":\"Source finding retained.\"}]}\n```");
    expect(document.blocks).toEqual([{ type: "paragraph", text: "Source finding retained." }]);
    const wrapped = parseStructuredExternalReportOutput("Here is the structured report:\n~~~json\n{\"version\":1,\"language\":\"en\",\"blocks\":[{\"type\":\"paragraph\",\"text\":\"Source finding retained.\"}]}\n~~~\nReview it carefully.");
    expect(wrapped).toEqual(document);
    expect(extractFirstCompleteJsonObject('{\"text\":\"brace } inside a string\"} trailing prose')).toBe('{\"text\":\"brace } inside a string\"}');
    expect(() => parseStructuredExternalReportOutput("Preamble {\"version\":1,\"language\":\"en\"")).toThrow("complete JSON object");
    expect(getExternalReportStructuredFailureReason(new Error("Structured report response does not contain a complete JSON object."))).toBe("incomplete_json_object");
    expect(getExternalReportStructuredFailureReason(new Error("Structured report table is not source-verified or aligned."))).toBe("invalid_table");
    const noncanonicalSourceVerification = { version: 1, language: "en", blocks: [{ type: "table", columns: ["Test", "Result"], rows: [["FSH", "7.5"]], source_verified: "true" }] };
    expect(() => parseStructuredExternalReportOutput(noncanonicalSourceVerification)).toThrow("source-verified");
    expect(parseStructuredExternalReportOutput(noncanonicalSourceVerification, { allowSourceVerificationNormalization: true }).blocks[0]).toMatchObject({ type: "table", sourceVerified: true });
    expect(structuredMedicalReportInstruction("Translate into English.")).toContain("The exact top-level shape");
    expect(structuredMedicalReportInstruction("Summarize in English.", "summarize")).toContain("Do not return a table block");
  });

  it("uses the validated document renderer for review previews while retaining legacy-text compatibility", () => {
    const component = source("client/src/components/ExternalReportsTab.tsx");
    expect(component).toContain("ProcessedDocumentPreview document={report.processedDocument}");
    expect(component).toContain("legacy_text");
    expect(component).toContain("StructuredExternalReportReview");
  });

  it("retains selected source assets with editable tags and optional protected-document passwords", () => {
    const component = source("client/src/components/ExternalReportsTab.tsx");
    const router = source("server/routers.ts");
    expect(component).toContain("sourceAssets: sourceAssets.length ? sourceAssets : undefined");
    expect(component).toContain("Document password (if protected)");
    expect(component).toContain("ExternalReport-");
    expect(router).toContain("sourceAssets: z.array");
    expect(router).toContain("documentPassword: z.string().max(512).optional()");
    expect(router).toContain("external-reports/source/");
    expect(router).toContain("sourceAssetRefs: storedSourceAssets.length ? storedSourceAssets : reportInput.sourceAssetRefs");
  });

  it("uses a ciphertext envelope instead of plaintext when retaining a protected-document password", () => {
    const secret = "protected-document-password";
    const envelope = encryptExternalReportDocumentPassword(secret);
    expect(envelope).not.toContain(secret);
    expect(decryptExternalReportDocumentPassword(envelope)).toBe(secret);
    const router = source("server/routers.ts");
    expect(router).toContain("documentPasswordCiphertext");
    expect(router).not.toContain("documentPassword: asset.documentPassword");
  });

  it("removes only the chosen source file before submission metadata is generated", () => {
    const files = [{ tag: "ExternalReport-01" }, { tag: "ExternalReport-02" }, { tag: "ExternalReport-03" }];
    expect(removeExternalReportSourceFile(files, 1)).toEqual([{ tag: "ExternalReport-01" }, { tag: "ExternalReport-03" }]);
    const component = source("client/src/components/ExternalReportsTab.tsx");
    expect(component).toContain("removeExternalReportSourceFile(entries, index)");
    expect(component).toContain("sourceAssets: sourceAssets.length ? sourceAssets : undefined");
  });

  it("builds submission asset metadata from the remaining selected files", async () => {
    const sourceFiles = [
      { file: { name: "cbc.pdf", type: "application/pdf", size: 3, arrayBuffer: async () => new Uint8Array([65, 66, 67]).buffer } as File, tag: " CBC-01 ", password: "open-cbc" },
      { file: { name: "hormone.pdf", type: "application/pdf", size: 3, arrayBuffer: async () => new Uint8Array([68, 69, 70]).buffer } as File, tag: "Hormone-02", password: "open-hormone" },
    ];
    const remaining = removeExternalReportSourceFile(sourceFiles, 0);
    await expect(buildExternalReportSourceAssetPayload(remaining)).resolves.toEqual([{
      fileBase64: "REVG",
      fileName: "hormone.pdf",
      mimeType: "application/pdf",
      tag: "Hormone-02",
      documentPassword: "open-hormone",
    }]);
  });

  it("renders each selected source file with responsive tag, password, and remove controls", () => {
    const entries = [
      { file: { name: "cbc.pdf", size: 1024 } as File, tag: "ExternalReport-01", password: "" },
      { file: { name: "hormones.pdf", size: 2048 } as File, tag: "ExternalReport-02", password: "secret" },
    ];
    const markup = renderToStaticMarkup(createElement(ExternalReportSourceFileRows, { entries, onChange: () => undefined }));
    expect(markup).toContain("cbc.pdf");
    expect(markup).toContain("hormones.pdf");
    expect(markup).toContain("File label for cbc.pdf");
    expect(markup).toContain("Document password for hormones.pdf");
    expect(markup).toContain("Remove file");
    expect(markup).toContain("sm:grid-cols-2");
  });

  it("keeps finalization loading while source assets are prepared and avoids exposing raw mutation errors", () => {
    const component = source("client/src/components/ExternalReportsTab.tsx");
    expect(component).toContain("isPreparingSourceAssets");
    expect(component).toContain("createReport.isPending || updateReport.isPending || isPreparingSourceAssets");
    expect(component).not.toContain("toast.error(error.message");
    expect(component).toContain("We could not save the External Report. Please try again.");
  });

  it("validates clear source-backed tables, preserves Arabic RTL review, and does not force ambiguous prose into cells", () => {
    const structured = parseStructuredExternalReportOutput({
      version: 1,
      language: "ar",
      blocks: [
        { type: "heading", level: 2, text: "نتائج المختبر" },
        { type: "table", caption: "نتائج الهرمونات", columns: ["الاختبار", "النتيجة", "الوحدة", "المدى المرجعي"], rows: [["FSH", "7.5", "IU/L", "3.0–10.0"]], sourceVerified: true },
        { type: "paragraph", text: "ملاحظة المختبر: العينة صالحة للتحليل." },
      ],
    });
    expect(externalReportDocumentToPlainText(structured)).toContain("FSH | 7.5 | IU/L | 3.0–10.0");
    expect(() => parseStructuredExternalReportOutput({ version: 1, language: "en", blocks: [{ type: "table", columns: ["Test", "Result"], rows: [["FSH"]], sourceVerified: true }] })).toThrow();
    expect(structuredMedicalReportInstruction("Format the report.")).toContain("Never invent units");
    const markup = renderToStaticMarkup(createElement(StructuredExternalReportReview, { document: structured }));
    expect(markup).toContain('dir="rtl"');
    expect(markup).toContain("<table");
    expect(markup).toContain("7.5");
  });

  it("passes the same persisted structured document to download, email, and WhatsApp PDF routes", () => {
    const router = source("server/routers.ts");
    const pdfRoutes = source("server/pdfRoutes.ts");
    const pdfService = source("server/pdfService.ts");
    expect(router.match(/processedDocument: report\.processedDocument \?\? null/g)?.length).toBeGreaterThanOrEqual(2);
    expect(pdfRoutes).toContain("processedDocument: (report as any).processedDocument ?? null");
    expect(pdfService).toContain("drawExternalReportDocument");
    expect(pdfService).toContain("drawExternalReportTable");
    expect(pdfService).toContain("createLegacyExternalReportDocument");
  });

  it("renders a canonical Arabic structured table in a PDF without requiring a legacy text block", async () => {
    const input = {
      reportRef: "EXT-TEST-001",
      reportDate: "30 August 2026",
      reportType: "Hormonal Profile",
      processedContent: "legacy fallback must not be needed",
      patientName: "Test Patient",
      processedDocument: {
        version: 1,
        language: "ar",
        blocks: [
          { type: "heading", level: 2, text: "نتائج الهرمونات" },
          { type: "table", caption: "نتائج المختبر", columns: ["الاختبار", "النتيجة", "الوحدة", "المدى المرجعي"], rows: [["FSH", "7.5", "IU/L", "3.0–10.0"]], sourceVerified: true },
        ],
      },
    };
    const selected = resolveExternalReportPdfDocument(input);
    expect(selected.usesStructuredDocument).toBe(true);
    expect(selected.document.blocks.some((block) => block.type === "table")).toBe(true);
    expect(selected.document.blocks.some((block) => block.type === "heading" && block.text.includes("الهرمونات"))).toBe(true);
    const pdf = await generateExternalReportPdf(input);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(1_000);
  });

  it("composes the controlled new-report path from protected source through plain-text review, persistence payload, and free-text PDF without a live provider", async () => {
    const sourceAssets = await buildExternalReportSourceAssetPayload([{ file: { name: "hormones.pdf", type: "application/pdf", size: 3, arrayBuffer: async () => new Uint8Array([70, 83, 72]).buffer } as File, tag: "Hormones-01", password: "open" }]);
    const plainText = "Hormone results are ready for patient review. FSH: 7.5 IU/L.";
    const processedDocument = createLegacyExternalReportDocument(plainText, "en");
    const review = renderToStaticMarkup(createElement(StructuredExternalReportReview, { document: processedDocument }));
    const { tx, inserts } = transactionHarness();
    await persistExternalReportCreate(tx, { patientId: 8, originalContent: "FSH | 7.5 | IU/L", processedContent: plainText, processedDocument, createdById: 4, sourceCapture: { sourceText: "FSH | 7.5 | IU/L", inputMethod: "files", sourceLanguage: "en", sourceAssetRefs: sourceAssets }, processing: { processingGoal: "format_only", requestedTargetLanguage: null, resolvedOutputLanguage: "en", humanReviewFinalized: true } });
    const pdfSelection = resolveExternalReportPdfDocument({ processedContent: plainText, processedDocument });
    const pdf = await generateExternalReportPdf({ reportRef: "EXT-TEST-002", reportDate: "30 August 2026", reportType: "Hormonal Profile", processedContent: plainText, processedDocument, patientName: "Test Patient" });
    expect(sourceAssets).toHaveLength(1);
    expect(review).toContain(plainText);
    expect(review).not.toContain("<table");
    expect(inserts).toHaveLength(3);
    expect(pdfSelection.usesStructuredDocument).toBe(false);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("renders a new Arabic legacy-text review right-to-left without requiring a table", () => {
    const document = createLegacyExternalReportDocument("نتيجة مبسطة للمراجعة.", "ar");
    const markup = renderToStaticMarkup(createElement(StructuredExternalReportReview, { document }));
    expect(markup).toContain('dir="rtl"');
    expect(markup).toContain("نتيجة مبسطة للمراجعة.");
    expect(markup).not.toContain("<table");
  });

  it("does not allow the historical report-update contract to submit a newly structured AI document", () => {
    const router = source("server/routers.ts");
    const updateStart = router.indexOf("update: staffOrAdminProcedure", router.indexOf("externalReports: router"));
    const deleteStart = router.indexOf("delete: staffOrAdminProcedure", updateStart);
    expect(router.slice(updateStart, deleteStart)).not.toContain("processedDocument:");
  });
});

describe("External Reports Phase C provider transport compatibility", () => {
  it("adapts the provider-compatible generic transport block into the strict canonical medical-document contract", () => {
    const document = parseStructuredExternalReportOutput({ version: 1, language: "en", blocks: [{ type: "table", level: 1, text: "Hormone result", label: "hormone", ordered: false, items: [], caption: "Hormone panel", columns: ["Test", "Result", "Unit"], rows: [["FSH", "7.5", "IU/L"]], sourceVerified: true }] });
    expect(document.blocks[0]).toMatchObject({ type: "table", columns: ["Test", "Result", "Unit"], sourceVerified: true });
    expect(EXTERNAL_REPORT_DOCUMENT_RESPONSE_SCHEMA.properties.blocks.items.type).toBe("object");
    expect(JSON.stringify(EXTERNAL_REPORT_DOCUMENT_RESPONSE_SCHEMA)).not.toContain("anyOf");
    expect(getExternalReportProviderError({ error: { message: "response_schema properties[blocks].items missing field" } })).toContain("response_schema");
    expect(classifyExternalReportProcessingFailure(new Error("response_schema missing field"))).toBe("provider_schema");
  });

  it("keeps historic structured helpers isolated from the current plain-text processor", () => {
    expect(shouldRetryStructuredExternalReportOutput("structured_parse", 0)).toBe(true);
    expect(shouldRetryStructuredExternalReportOutput("structured_validation", 0)).toBe(true);
    expect(shouldRetryStructuredExternalReportOutput("output_language", 0)).toBe(true);
    expect(shouldRetryStructuredExternalReportOutput("structured_parse", 1)).toBe(false);
    expect(shouldRetryStructuredExternalReportOutput("provider_transport", 0)).toBe(false);
    expect(shouldRetryStructuredExternalReportOutput("provider_schema", 0)).toBe(false);
    expect(shouldRetryStructuredExternalReportOutput("source_safety", 0)).toBe(true);

    const router = source("server/routers.ts");
    const processStart = router.indexOf("processWithAI: staffOrAdminProcedure");
    const extractionStart = router.indexOf("extractFromFiles: staffOrAdminProcedure");
    const processingSource = router.slice(processStart, extractionStart);
    expect(processingSource).toContain("plainTextMedicalReportInstruction");
    expect(processingSource).not.toContain("shouldRetryStructuredExternalReportOutput");
    expect(processingSource).not.toContain('stage: "structured_document_retry"');
    expect(processingSource).not.toContain("getExternalReportStructuredFailureReason(error)");
    expect(processingSource).not.toContain("candidate.language !== resolved.resolvedOutputLanguage");
    expect(processingSource).not.toContain("retryInstruction");
  });

  it("verifies immutable table fact cells without rejecting translated labels and does not force summaries to reproduce every source row", () => {
    const sourceText = [
      "TETKİK ADI | SONUÇ | BİRİM | REFERANS ARALIĞI",
      "Sperm Sayısı | 87 MİLYON/ML | mL | -",
      "Toplam Hareketlilik | %40 | - | ≥40",
    ].join("\n");
    const translated = parseStructuredExternalReportOutput({
      version: 1,
      language: "en",
      blocks: [{
        type: "table",
        columns: ["Test Name", "Result", "Unit", "Reference Range"],
        rows: [["Sperm Count", "87 MİLYON/ML", "mL", "-"], ["Total Motility", "%40", "-", "≥40"]],
        sourceVerified: true,
      }],
    });
    expect(() => assertSourceBackedExternalReportTables(sourceText, translated, "translate")).not.toThrow();

    const mutated = parseStructuredExternalReportOutput({
      version: 1,
      language: "en",
      blocks: [{
        type: "table",
        columns: ["Test Name", "Result", "Unit", "Reference Range"],
        rows: [["Sperm Count", "87 million/mL", "mL", "-"], ["Total Motility", "%40", "-", "≥40"]],
        sourceVerified: true,
      }],
    });
    const hydrated = hydrateSourceBackedExternalReportTables(sourceText, mutated, "translate");
    expect(hydrated.blocks[0]).toMatchObject({ rows: [["Sperm Count", "87 MİLYON/ML", "mL", "-"], ["Total Motility", "%40", "-", "≥40"]] });
    expect(classifyExternalReportProcessingFailure(new Error("A source-backed table structure could not be safely aligned with the immutable source."))).toBe("source_safety");

    const formattedValueAndUnit = parseStructuredExternalReportOutput({
      version: 1,
      language: "tr",
      blocks: [{
        type: "table",
        columns: ["Test", "Sonuç"],
        rows: [["Sperm Sayısı", "87 MİLYON/ML mL"], ["Toplam Hareketlilik", "%40 ≥40"]],
        sourceVerified: true,
      }],
    });
    expect(() => assertSourceBackedExternalReportTables(sourceText, formattedValueAndUnit, "format_only")).toThrow("safely aligned");

    const summary = parseStructuredExternalReportOutput({ version: 1, language: "en", blocks: [{ type: "paragraph", text: "A short source-grounded summary is available for review." }] });
    expect(() => assertSourceBackedExternalReportTables(sourceText, summary, "summarize")).not.toThrow();
  });
});

describe("External Reports current plain-text processing restoration", () => {
  it("keeps the current engine to one provider call and removes every structured/table/fallback success dependency", () => {
    const router = source("server/routers.ts");
    const processStart = router.indexOf("processWithAI: staffOrAdminProcedure");
    const extractionStart = router.indexOf("extractFromFiles: staffOrAdminProcedure");
    const processingSource = router.slice(processStart, extractionStart);
    expect(processingSource.match(/workloadId: "medical_document_translation"/g)?.length).toBe(1);
    expect(processingSource).toContain("plain_text_success");
    expect(processingSource).not.toContain("structured_document_retry");
    expect(processingSource).not.toContain("structured_success");
    expect(processingSource).not.toContain("structured_retry_success");
    expect(processingSource).not.toContain("plain_text_fallback");
    expect(processingSource).not.toContain("parseStructuredExternalReportOutput");
    expect(processingSource).not.toContain("hydrateSourceBackedExternalReportTables");
    expect(processingSource).toContain("flowOutcome: \"hard_failure\"");
    expect(processingSource).toContain("flowId");
    expect(processingSource).toContain('createAiTelemetrySession("medical_document_translation", { logicalRequestId: flowId })');
    expect(processingSource.match(/aiTelemetry: flowTelemetry/g)?.length).toBe(1);
    expect(processingSource).toContain("flowTelemetry.succeed()");
    expect(processingSource).toContain("flowTelemetry.fail(error, { failureCategory: category })");
    expect(processingSource).not.toContain("createExternalReport(");
    const component = source("client/src/components/ExternalReportsTab.tsx");
    expect(component).not.toContain("Plain-text fallback");
    expect(component).not.toContain("setProcessingRepresentation");
    expect(component).toContain('processedDocument?.blocks.some((block) => block.type !== "legacy_text")');
  });

  it("keeps Finalize stage observability metadata-only and maps only allowlisted categories", () => {
    expect(EXTERNAL_REPORT_FINALIZE_STAGES).toEqual([
      "input_validated", "source_asset_payload_prepared", "source_asset_size_validated", "source_asset_key_allocated", "source_asset_uploaded", "source_asset_upload_retry_started", "source_asset_retry_key_allocated", "source_asset_retry_uploaded", "source_assets_stored", "processing_contract_resolved", "transaction_started", "processed_document_validated", "report_inserted", "source_revision_inserted", "source_revision_linked", "processing_run_inserted", "transaction_committed", "readback_completed",
    ]);
    expect(classifyExternalReportFinalizeFailure({ code: "BAD_REQUEST", message: "source text must not be logged" }, "input_validated")).toBe("input_validation");
    expect(classifyExternalReportFinalizeFailure(new Error("payload preparation must not be logged"), "source_asset_key_allocated")).toBe("source_asset_preparation");
    expect(classifyExternalReportFinalizeFailure(new Error("upload must not be logged"), "source_asset_upload_retry_started")).toBe("source_asset_storage");
    expect(classifyExternalReportFinalizeFailure(new Error("storage content must not be logged"), "source_assets_stored")).toBe("source_asset_storage");
    expect(classifyExternalReportSourceAssetStorageFailure({ code: "ERR_INVALID_CHAR" })).toBe("source_asset_http_metadata");
    expect(classifyExternalReportSourceAssetStorageFailure({ $metadata: { httpStatusCode: 415 } })).toBe("source_asset_provider_validation");
    expect(classifyExternalReportSourceAssetStorageFailure({ code: "ETIMEDOUT" })).toBe("source_asset_timeout_or_network");
    expect(classifyExternalReportSourceAssetStorageFailure({ $metadata: { httpStatusCode: 403 } })).toBe("source_asset_authentication");
    expect(classifyExternalReportFinalizeFailure(new Error("database content must not be logged"), "report_inserted")).toBe("database_or_readback");
    expect(source("server/externalReportFinalizeObservability.ts")).not.toContain("sourceText");
    expect(source("server/externalReportFinalizeObservability.ts")).not.toContain("processedText");
    expect(source("server/routers.ts")).toContain("logExternalReportFinalizeFailure(flowId, stage, error, transactionStarted, transactionCommitted)");
    expect(source("server/routers.ts")).toContain("return await createExternalReport(");
  });

  it("keeps Finalize observability non-blocking and preserves the existing single transaction boundary", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => { throw new Error("logging unavailable"); });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => { throw new Error("logging unavailable"); });
    expect(() => logExternalReportFinalizeStage("metadata-only-flow", "report_inserted", true, false)).not.toThrow();
    expect(() => logExternalReportFinalizeFailure("metadata-only-flow", "processing_run_inserted", new Error("must not leak"), true, false)).not.toThrow();
    info.mockRestore();
    warn.mockRestore();

    const dbSource = source("server/db.ts");
    expect(dbSource).toContain("db.transaction((tx) => persistExternalReportCreate(tx, data, onStage))");
    expect(dbSource).toContain('onStage?.("processed_document_validated")');
    expect(dbSource).toContain('onStage?.("processing_run_inserted")');
    expect(dbSource).not.toContain("logExternalReportFinalize");
  });

  it("normalizes only storage request metadata for unusual source file characteristics while preserving source bytes and user-visible app metadata", () => {
    expect(sanitizeStorageHeaderFileName("report \u0130\u011eDIR \"final\".pdf")).toBe("report IGDIR final.pdf");
    expect(sanitizeStorageHeaderFileName("../../\u5b9e\u9a8c.pdf")).toBe("....__.pdf");
    expect(sanitizeStorageContentType("application/pdf")).toBe("application/pdf");
    expect(sanitizeStorageContentType("image/jpeg; charset=binary")).toBe("image/jpeg; charset=binary");
    expect(sanitizeStorageContentType("invalid content type\nheader")).toBe("application/octet-stream");
    expect(source("server/storage.ts")).toContain("Body: body");
    expect(source("server/storage.ts")).toContain("Metadata: { \"original-filename\": safeName }");
  });

  it("uses a bounded fresh-key retry for source storage only before a create transaction and keeps one-call AI processing unchanged", () => {
    const router = source("server/routers.ts");
    const createStart = router.indexOf("create: staffOrAdminProcedure", router.indexOf("externalReports: router"));
    const updateStart = router.indexOf("update: staffOrAdminProcedure", createStart);
    const createSource = router.slice(createStart, updateStart);
    expect(createSource).toContain("const uploadSessionId = randomUUID()");
    expect(createSource).toContain("const allocateFreshKey");
    expect(createSource).toContain('mark("source_asset_upload_retry_started")');
    expect(createSource).toContain('mark("source_asset_retry_key_allocated")');
    expect(createSource.match(/storagePut\(allocateFreshKey\(\)/g)).toHaveLength(2);
    expect(createSource.indexOf('mark("source_asset_upload_retry_started")')).toBeLessThan(createSource.indexOf("return await createExternalReport"));

    const processStart = router.indexOf("processWithAI: staffOrAdminProcedure");
    const extractionStart = router.indexOf("extractFromFiles: staffOrAdminProcedure");
    const processingSource = router.slice(processStart, extractionStart);
    expect(processingSource.match(/workloadId: "medical_document_translation"/g)).toHaveLength(1);
  });

  it("cleans report-owned child metadata transactionally, releases only exclusive report source references afterward, and never lets storage cleanup undo a database deletion", () => {
    const dbSource = source("server/db.ts");
    const deleteStart = dbSource.indexOf("export async function deleteExternalReport");
    const deleteEnd = dbSource.indexOf("// ─── Link to Existing Patient", deleteStart);
    const deleteSource = dbSource.slice(deleteStart, deleteEnd);
    expect(deleteSource).toContain('const reportOwnedSourcePrefix = "external-reports/source/"');
    expect(deleteSource).toContain("await db.transaction(async (tx) =>");
    expect(deleteSource.indexOf("tx.delete(externalReportProcessingRuns)")).toBeLessThan(deleteSource.indexOf("tx.delete(externalReportSourceRevisions)"));
    expect(deleteSource.indexOf("tx.delete(externalReportSourceRevisions)")).toBeLessThan(deleteSource.indexOf("tx.delete(externalReports)"));
    expect(deleteSource).toContain("referencedByLiveReport");
    expect(deleteSource).toContain("exclusivelyOwnedSourceKeys");
    expect(deleteSource.indexOf("await db.transaction")).toBeLessThan(deleteSource.indexOf("storageDelete"));
    expect(deleteSource).toContain("storageCleanupPending");
    expect(source("client/src/components/ExternalReportsTab.tsx")).toContain("source-object cleanup is pending");
  });

  it("keeps legacy plain text flowing across available page space and measures the disclaimer before adding a page, while structured table drawing remains intact", () => {
    const pdfSource = source("server/pdfService.ts");
    const legacyStart = pdfSource.indexOf('if (block.type === "legacy_text")');
    const legacyEnd = pdfSource.indexOf("continue;", legacyStart);
    const legacyBranch = pdfSource.slice(legacyStart, legacyEnd);
    expect(legacyBranch).toContain("smartText(doc, text, margin, y");
    expect(legacyBranch).toContain("y = doc.y + 7");
    expect(legacyBranch).not.toContain("doc.addPage()");
    expect(pdfSource).toContain("const noteHeight = doc.heightOfString(noteText, { width: cW })");
    expect(pdfSource).toContain("if (y + noteSectionHeight > pageH - footerReserve)");
    expect(pdfSource).toContain("drawExternalReportTable");
  });

  it("keeps a short legacy-text report and its disclaimer on one page when space permits, while a long legacy-text report paginates", async () => {
    const pageCount = (pdf: Buffer) => pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;
    const base = { reportRef: "EXT-PAGINATION", reportDate: "31 August 2026", reportType: "Hormonal Profile", patientName: "Test Patient" };
    const shortText = "Patient-ready plain-text report content for review.";
    const shortPdf = await generateExternalReportPdf({ ...base, processedContent: shortText, processedDocument: createLegacyExternalReportDocument(shortText, "en") });
    expect(pageCount(shortPdf)).toBe(1);

    const longText = Array.from({ length: 220 }, (_, index) => `Patient-ready continuation line ${index + 1}.`).join("\n");
    const longPdf = await generateExternalReportPdf({ ...base, processedContent: longText, processedDocument: createLegacyExternalReportDocument(longText, "en") });
    expect(pageCount(longPdf)).toBeGreaterThan(1);
  });

  it("treats Not specified as semantic report-type absence and omits its PDF title while preserving meaningful types", async () => {
    expect(normalizeExternalReportPdfType(null)).toBeNull();
    expect(normalizeExternalReportPdfType(" ")).toBeNull();
    expect(normalizeExternalReportPdfType("Not specified")).toBeNull();
    expect(normalizeExternalReportPdfType("Semen Analysis")).toBe("Semen Analysis");
    const pdf = await generateExternalReportPdf({
      reportRef: "EXT-TYPE-001",
      reportDate: "02 September 2026",
      reportType: null,
      processedContent: "Patient-ready plain-text content.",
      patientName: "Test Patient",
    });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const component = source("client/src/components/ExternalReportsTab.tsx");
    expect(component).toContain('const REPORT_TYPE_NOT_SPECIFIED = "not_specified"');
    expect(component).toContain("reportType: REPORT_TYPE_NOT_SPECIFIED");
    expect(component).toContain("form.reportType === REPORT_TYPE_NOT_SPECIFIED ? undefined : form.reportType");
    expect(source("server/pdfService.ts")).toContain("if (reportType)");
  });

  it("creates neutral or report-type PDF download names without patient data or duplicate extensions", () => {
    expect(buildExternalReportPdfFilename("EXT-390001", null)).toBe("External-Report-EXT-390001.pdf");
    expect(buildExternalReportPdfFilename("EXT-390001", "Not specified")).toBe("External-Report-EXT-390001.pdf");
    expect(buildExternalReportPdfFilename("EXT-390001", "Semen Analysis")).toBe("Semen-Analysis-EXT-390001.pdf");
    const sanitized = buildExternalReportPdfFilename("EXT 390001.pdf", "Other / Type");
    expect(sanitized).toBe("Other-Type-EXT-390001-pdf.pdf");
    expect((sanitized.match(/\.pdf/g) ?? [])).toHaveLength(1);
    expect(sanitized).not.toContain("Patient");
  });

  it("uses the shared printable margin for every automatic External Reports continuation page without altering legacy text width", () => {
    expect(EXTERNAL_REPORT_PDF_CONTINUATION_MARGIN).toBe(48);
    const pdfSource = source("server/pdfService.ts");
    expect(pdfSource).toContain("margin: EXTERNAL_REPORT_PDF_CONTINUATION_MARGIN");
    expect(pdfSource).toContain("smartText(doc, text, margin, y, { fontSize, width: contentWidth })");
    expect(pdfSource).toContain("if (y + noteSectionHeight > pageH - footerReserve)");
  });
});
