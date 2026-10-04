import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import { createLegacyExternalReportDocument, readExternalReportDocument } from "./externalReportDocument";
import { createExternalReportV2Document } from "./externalReportV2Document";
import { createExternalReportV2ProcessProof, validateExternalReportV2Finalize } from "./externalReportV2Finalize";
import { logExternalReportV2Processing } from "./externalReportV2Observability";
import { acceptExternalReportV2Response, buildExternalReportV2Prompt, executeExternalReportV2OneCall, getExternalReportV2SourceSafetySubreason, hasSubstantialExternalReportV2Language } from "./externalReportV2Processing";
import { assessExternalReportV2Safety, classifyExternalReportV2UnsupportedFactType, extractExternalReportV2DeterministicFacts, ExternalReportV2UnsupportedFactError } from "./externalReportV2Safety";
import { externalReportV2Fixtures } from "./externalReportV2Fixtures";
import { generateExternalReportPdf } from "./pdfService";

function prose(language: "en" | "ar" | "tr" | "und") {
  if (language === "ar") return "يعرض هذا التقرير الطبي النتائج للمراجعة الإدارية الإلزامية قبل الحفظ النهائي واتخاذ أي قرار سريري.";
  if (language === "tr") return "Bu hasta raporu, sonuç ve değer bilgilerini zorunlu yönetici incelemesi için açık bir biçimde sunar.";
  return "This patient report presents each result and value clearly for mandatory Admin review before finalization.";
}
function acceptedText(sourceText: string, language: "en" | "ar" | "tr" | "und", summarize = false) {
  return `${prose(language)}${summarize ? "" : `\n${sourceText}`}`.trim();
}

describe("External Reports V2 isolated contracts", () => {
  beforeAll(() => { if (!ENV.cookieSecret) ENV.cookieSecret = "external-reports-v2-test-secret"; });

  it("uses a minimal prompt without legacy structured/fallback machinery", () => {
    const prompt = buildExternalReportV2Prompt({ patientId: 1, sourceText: "Volume: 2.5 mL", sourceLanguage: "en", processingGoal: "translate", requestedTargetLanguage: "tr" });
    expect(prompt).toContain("language, optional title, and text");
    expect(prompt).not.toContain("sourceVerified");
    expect(prompt).not.toContain("canonical blocks");
  });

  it("invokes the generation callback exactly once", async () => {
    let count = 0;
    const input = { patientId: 1, sourceText: "Result: 2.5 mL", sourceLanguage: "en" as const, processingGoal: "translate" as const, requestedTargetLanguage: "tr" as const };
    const result = await executeExternalReportV2OneCall(input, async () => {
      count += 1;
      return { choices: [{ message: { content: JSON.stringify({ language: "tr", text: `${prose("tr")} 2.5 ml` }) } }] };
    });
    expect(count).toBe(1);
    expect(result.document.blocks.every((block) => block.type !== "table")).toBe(true);
  });

  for (const fixture of externalReportV2Fixtures) {
    for (const goal of ["translate", "simplify", "translate_simplify", "format_only", "summarize"] as const) {
      it(`${fixture.id} accepts ${goal} with deterministic safety`, () => {
        const target = goal === "translate" || goal === "translate_simplify" || goal === "summarize" ? (fixture.sourceLanguage === "en" ? "tr" : "en") : null;
        const language = (target ?? fixture.sourceLanguage) as "en" | "ar" | "tr" | "und";
        const input = { patientId: 1, sourceText: fixture.sourceText, sourceLanguage: fixture.sourceLanguage, processingGoal: goal, requestedTargetLanguage: target };
        const result = acceptExternalReportV2Response(input, JSON.stringify({ language, title: "Review", text: acceptedText(fixture.sourceText, language, goal === "summarize") }));
        expect(result.document.blocks.every((block) => block.type !== "table")).toBe(true);
        expect(["auto_verified", "manual_verification_required"]).toContain(result.safety.state);
      });
    }
  }

  it("hard rejects an invented deterministic value", () => {
    expect(() => assessExternalReportV2Safety({ sourceText: "Volume: 2.5 mL", outputText: "The result is 3.5 mL.", processingGoal: "translate", outputLanguage: "en" })).toThrow("V2_UNSUPPORTED_DETERMINISTIC_FACT");
  });

  it("accepts only explicit same-scale unit representation variants", () => {
    const safety = (sourceText: string, outputText: string) => assessExternalReportV2Safety({ sourceText, outputText, processingGoal: "translate", outputLanguage: "en" });
    expect(() => safety("Volume: 2.5 mL", "Volume: 2.5 mL")).not.toThrow();
    expect(() => safety("Volume: 2.5 ML", "Volume: 2.5 mL.")).not.toThrow();
    expect(() => safety("Duration: 5 Gün", "Duration: 5 days")).not.toThrow();
    expect(() => safety("Duration: 2 DK.", "Duration: 2 min")).not.toThrow();
    const semenFixture = externalReportV2Fixtures.find((fixture) => fixture.id === "semen-tr");
    expect(semenFixture).toBeDefined();
    expect(() => safety(semenFixture!.sourceText, semenFixture!.sourceText.replace("MİLYON/ML", "million per mL"))).not.toThrow();
  });

  it("fails closed for incompatible units, conversions, changed values, and unsupported units", () => {
    const safety = (sourceText: string, outputText: string) => assessExternalReportV2Safety({ sourceText, outputText, processingGoal: "translate", outputLanguage: "en" });
    expect(() => safety("Volume: 2.5 mL", "Volume: 2.5 ng/mL")).toThrow("V2_UNSUPPORTED_DETERMINISTIC_FACT");
    expect(() => safety("Result: 2.5 mg/dL", "Result: 2.5 mmol/L")).toThrow("V2_UNSUPPORTED_DETERMINISTIC_FACT");
    expect(() => safety("Volume: 2.5 mL", "Volume: 3.5 ML")).toThrow("V2_UNSUPPORTED_DETERMINISTIC_FACT");
    expect(() => safety("Volume: 2.5 mL", "Volume: 2.5 mcg/mL")).toThrow("V2_UNSUPPORTED_DETERMINISTIC_FACT");
  });

  it("keeps percentage, range, status, and date rejection unchanged", () => {
    const safety = (sourceText: string, outputText: string) => assessExternalReportV2Safety({ sourceText, outputText, processingGoal: "translate", outputLanguage: "en" });
    expect(() => safety("Result: 52%", "Result: 53%")).toThrow("V2_UNSUPPORTED_DETERMINISTIC_FACT");
    expect(() => safety("Reference range: 0-35 U/L", "Reference range: 1-35 U/L")).toThrow("V2_UNSUPPORTED_DETERMINISTIC_FACT");
    expect(() => safety("Status: Normal", "Status: Abnormal")).toThrow("V2_UNSUPPORTED_DETERMINISTIC_FACT");
    expect(() => safety("Date: 2026-08-30", "Date: 2026-08-31")).toThrow("V2_UNSUPPORTED_DETERMINISTIC_FACT");
  });

  it("uses manual review for omitted or ambiguous facts", () => {
    expect(assessExternalReportV2Safety({ sourceText: "Volume: 2.5 mL", outputText: "The report is available for patient review.", processingGoal: "translate", outputLanguage: "en" }).state).toBe("manual_verification_required");
    expect(assessExternalReportV2Safety({ sourceText: "Narrative content only", outputText: "Narrative content for review", processingGoal: "format_only", outputLanguage: "en" }).reasons).toContain("ambiguous_source");
  });

  it("rejects substantially wrong prose language", () => {
    expect(hasSubstantialExternalReportV2Language("Bu hasta raporu ve sonuç değerleri Türkçe olarak sunulur ve inceleme için hazırlanır.", "en")).toBe(false);
  });

  it("wraps server-owned text blocks with Arabic language", () => {
    const document = createExternalReportV2Document({ language: "ar", title: "النتيجة", text: "فقرة طبية للمراجعة.\n\n- النتيجة الأولى\n- النتيجة الثانية" });
    expect(document.language).toBe("ar");
    expect(document.blocks.map((block) => block.type)).toEqual(["heading", "paragraph", "list"]);
  });

  it("binds Finalize to actor, patient, source, original output, and goal", async () => {
    const sourceText = "Volume: 2.5 mL\nMotility: 52%"; const outputText = `${prose("en")}\n${sourceText}`;
    const proof = await createExternalReportV2ProcessProof({ actorId: 7, patientId: 9, sourceText, outputText, sourceLanguage: "en", processingGoal: "format_only", requestedTargetLanguage: null, resolvedOutputLanguage: "en", safetyState: "auto_verified" });
    const result = await validateExternalReportV2Finalize({ actorId: 7, processProof: proof.processProof, patientId: 9, sourceText, originalProcessedText: outputText, processedText: outputText, sourceLanguage: "en", processingGoal: "format_only", requestedTargetLanguage: null, sourceInputMethod: "text" });
    expect(result.submissionKey).toBe(proof.submissionKey);
    expect(result.metadata).toEqual({ version: 2, safetyState: "auto_verified", manuallyEdited: false });
    await expect(validateExternalReportV2Finalize({ actorId: 8, processProof: proof.processProof, patientId: 9, sourceText, originalProcessedText: outputText, processedText: outputText, sourceLanguage: "en", processingGoal: "format_only", requestedTargetLanguage: null, sourceInputMethod: "text" })).rejects.toThrow("V2_PROOF_INVALID");
  });

  it("revalidates Admin edits", async () => {
    const sourceText = "Volume: 2.5 mL"; const outputText = `${prose("en")} 2.5 ml`;
    const proof = await createExternalReportV2ProcessProof({ actorId: 7, patientId: 9, sourceText, outputText, sourceLanguage: "en", processingGoal: "format_only", requestedTargetLanguage: null, resolvedOutputLanguage: "en", safetyState: "auto_verified" });
    await expect(validateExternalReportV2Finalize({ actorId: 7, processProof: proof.processProof, patientId: 9, sourceText, originalProcessedText: outputText, processedText: `${outputText} 3.5 mL`, sourceLanguage: "en", processingGoal: "format_only", requestedTargetLanguage: null, sourceInputMethod: "text" })).rejects.toThrow("V2_UNSUPPORTED_DETERMINISTIC_FACT");
  });

  it("keeps observability metadata-only", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logExternalReportV2Processing({ outcome: "failed", goal: "translate", outputLanguage: "en", providerCallCount: 1, category: "source_safety", sourceSafetySubreason: "unsupported_unit_token" });
    const serialized = JSON.stringify(spy.mock.calls);
    expect(serialized).not.toContain("patientId");
    expect(serialized).not.toContain("sourceText");
    expect(serialized).not.toContain("processedText");
    spy.mockRestore();
  });

  it("maps the existing source-safety hard rejection to a content-free subreason only", () => {
    expect(getExternalReportV2SourceSafetySubreason(new ExternalReportV2UnsupportedFactError("unsupported_numeric_token"))).toBe("unsupported_numeric_token");
    expect(getExternalReportV2SourceSafetySubreason(new Error("V2_LANGUAGE_MISMATCH"))).toBeUndefined();
  });

  it("classifies deterministic fact types without retaining their values", () => {
    expect(classifyExternalReportV2UnsupportedFactType("3.5")).toBe("unsupported_numeric_token");
    expect(classifyExternalReportV2UnsupportedFactType("52%")).toBe("unsupported_percentage_token");
    expect(classifyExternalReportV2UnsupportedFactType("2.5 ml")).toBe("unsupported_unit_token");
    expect(classifyExternalReportV2UnsupportedFactType("1.0-4.0")).toBe("unsupported_range_token");
    expect(classifyExternalReportV2UnsupportedFactType("2026-08-31")).toBe("unsupported_date_token");
    expect(classifyExternalReportV2UnsupportedFactType("status:abnormal")).toBe("unsupported_qualitative_status_token");
    expect(classifyExternalReportV2UnsupportedFactType("deterministic")).toBe("unsupported_other_deterministic_token");
  });

  it("renders V2 through the existing PDF path", async () => {
    const document = createExternalReportV2Document({ language: "en", title: "Review", text: "The patient report is ready for review. 2.5 mL" });
    const pdf = await generateExternalReportPdf({ reportRef: "EXT-V2-QA", reportDate: "30 August 2026", reportType: "Semen Analysis", processingNote: "translated", processedContent: "", processedDocument: document, patientName: "De-identified Patient" });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("mounts reversible Admin-only QA while keeping the current engine and history intact", () => {
    const legacy = readExternalReportDocument({ processedDocumentJson: null, processedContent: "Historical plain text", resolvedOutputLanguage: "en" });
    expect(legacy).toEqual(createLegacyExternalReportDocument("Historical plain text", "en"));
    const root = process.cwd();
    const router = fs.readFileSync(path.join(root, "server/routers.ts"), "utf8");
    const currentUi = fs.readFileSync(path.join(root, "client/src/components/ExternalReportsTab.tsx"), "utf8");
    const v2Ui = fs.readFileSync(path.join(root, "client/src/components/ExternalReportV2Workspace.tsx"), "utf8");
    const migration = fs.readFileSync(path.join(root, "drizzle/0089_external_reports_v2_metadata.sql"), "utf8");
    expect(router).toContain("externalReportsV2: router");
    expect(currentUi).toContain("ExternalReportV2Workspace");
    expect(currentUi).toContain('user?.role === "admin"');
    expect(currentUi).toContain('useState<"current" | "v2">("current")');
    expect(currentUi).toContain('qaWorkspace === "v2"');
    expect(currentUi).toContain("External Reports V2 — QA");
    expect(currentUi).toContain("Return to current engine");
    expect(currentUi).toContain("New Report");
    const v2Router = router.slice(router.indexOf("externalReportsV2: router"));
    expect(v2Router).toContain("process: adminProcedure");
    expect(v2Router).toContain("finalize: adminProcedure");
    expect(v2Ui).toContain("useDraftForm");
    expect(v2Ui).toContain("useBeforeUnload");
    expect(v2Ui).toContain("Extracting source documents…");
    expect(v2Ui).toContain("Generating patient-ready review…");
    expect(v2Ui).toContain("V2 could not safely generate the patient-ready review");
    expect(migration.toUpperCase()).not.toContain(" DROP ");
  });
});
