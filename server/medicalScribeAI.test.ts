import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  createMedicalScribeGenerator,
  MEDICAL_SCRIBE_FIRST_FALLBACK_MODEL,
  MEDICAL_SCRIBE_PRIMARY_MODEL,
  MEDICAL_SCRIBE_SECOND_FALLBACK_MODEL,
  MedicalScribeUnavailableError,
} from "./medicalScribeAI";

const validSummary = JSON.stringify({
  chiefComplaint: "Fertility evaluation",
  historyOfPresentIllness: "Two years of infertility.",
  physicalExamination: "AMH 1.2 ng/mL.",
  assessment: "Infertility evaluation in progress.",
  plan: "Review results with clinician.",
  diagnosis: "Infertility",
  medications: "None mentioned",
  additionalNotes: "",
});

const builtInResponse = (content: string) => ({
  id: "test-response",
  created: 1,
  model: "openai/gpt-oss-20b",
  choices: [{ index: 0, message: { role: "assistant" as const, content }, finish_reason: "stop" }],
});

describe("Medical Scribe fallback routing", () => {
  it("MS-1 uses the supported Groq Qwen model as the primary route", async () => {
    const invokeGroq = vi.fn().mockResolvedValue({ content: validSummary });
    const invokeBuiltIn = vi.fn();
    const generate = createMedicalScribeGenerator({ invokeGroq, invokeBuiltIn });

    const result = await generate({ rawText: "Patient is here for a fertility evaluation.", noteType: "consultation" });

    expect(result.provider).toBe("groq-qwen");
    expect(result.summary.diagnosis).toBe("Infertility");
    expect(invokeGroq).toHaveBeenCalledTimes(1);
    expect(invokeGroq.mock.calls[0][0].model).toBe(MEDICAL_SCRIBE_PRIMARY_MODEL);
    expect(invokeBuiltIn).not.toHaveBeenCalled();
  });

  it("MS-2 uses the independent Groq model fallback when the primary model fails", async () => {
    const invokeGroq = vi
      .fn()
      .mockRejectedValueOnce(new Error("primary unavailable"))
      .mockResolvedValueOnce({ content: validSummary });
    const invokeBuiltIn = vi.fn();
    const failed: string[] = [];
    const generate = createMedicalScribeGenerator({ invokeGroq, invokeBuiltIn, onAttemptFailure: (provider) => failed.push(provider) });

    const result = await generate({ rawText: "Patient reports two years of infertility.", noteType: "consultation" });

    expect(result.provider).toBe("groq-gpt-oss");
    expect(invokeGroq.mock.calls.map(([input]) => input.model)).toEqual([MEDICAL_SCRIBE_PRIMARY_MODEL, MEDICAL_SCRIBE_FIRST_FALLBACK_MODEL]);
    expect(failed).toEqual(["groq-qwen"]);
    expect(invokeBuiltIn).not.toHaveBeenCalled();
  });

  it("MS-3 uses the built-in provider as the second fallback after both Groq routes fail", async () => {
    const invokeGroq = vi.fn().mockRejectedValue(new Error("Groq unavailable"));
    const invokeBuiltIn = vi.fn().mockResolvedValue(builtInResponse(validSummary));
    const generate = createMedicalScribeGenerator({ invokeGroq, invokeBuiltIn });

    const result = await generate({ rawText: "Patient has ultrasound findings for review.", noteType: "follow_up" });

    expect(result.provider).toBe("builtin-gpt-5-mini");
    expect(invokeGroq).toHaveBeenCalledTimes(2);
    expect(invokeBuiltIn).toHaveBeenCalledTimes(1);
    expect(invokeBuiltIn.mock.calls[0][0].model).toBe(MEDICAL_SCRIBE_SECOND_FALLBACK_MODEL);
    expect(invokeBuiltIn.mock.calls[0][0].response_format.json_schema.strict).toBe(true);
  });

  it("MS-4 treats malformed model output as a failed attempt and continues to the next fallback", async () => {
    const invokeGroq = vi
      .fn()
      .mockResolvedValueOnce({ content: "not valid JSON" })
      .mockResolvedValueOnce({ content: validSummary });
    const generate = createMedicalScribeGenerator({ invokeGroq, invokeBuiltIn: vi.fn() });

    const result = await generate({ rawText: "Patient needs medication review today.", noteType: "follow_up" });

    expect(result.provider).toBe("groq-gpt-oss");
    expect(invokeGroq).toHaveBeenCalledTimes(2);
  });

  it("MS-5 never exposes provider failures when every route is unavailable", async () => {
    const invokeGroq = vi.fn().mockRejectedValue(new Error("Sensitive upstream detail"));
    const invokeBuiltIn = vi.fn().mockRejectedValue(new Error("Sensitive fallback detail"));
    const generate = createMedicalScribeGenerator({ invokeGroq, invokeBuiltIn });

    await expect(generate({ rawText: "Patient requests a follow-up appointment.", noteType: "general" })).rejects.toBeInstanceOf(MedicalScribeUnavailableError);
    await expect(generate({ rawText: "Patient requests a follow-up appointment.", noteType: "general" })).rejects.not.toThrow("Sensitive");
  });

  it("MS-6 requires the complete string-only clinical summary contract", async () => {
    const malformed = JSON.stringify({ chiefComplaint: "Only one field" });
    const invokeGroq = vi.fn().mockResolvedValue({ content: malformed });
    const invokeBuiltIn = vi.fn().mockResolvedValue(builtInResponse(validSummary));
    const generate = createMedicalScribeGenerator({ invokeGroq, invokeBuiltIn });

    const result = await generate({ rawText: "Patient presents for infertility counselling.", noteType: "consultation" });

    expect(result.provider).toBe("builtin-gpt-5-mini");
    expect(invokeGroq).toHaveBeenCalledTimes(2);
    expect(invokeBuiltIn).toHaveBeenCalledTimes(1);
  });

  it("MS-7 exposes only a safe availability message when all model routes fail", async () => {
    const source = fs.readFileSync(path.resolve(__dirname, "routers.ts"), "utf8");
    expect(source).toContain("error instanceof MedicalScribeUnavailableError");
    expect(source).toContain('code: "SERVICE_UNAVAILABLE"');
    expect(source).not.toContain("Sensitive upstream detail");
  });

  it("MS-8 tells the clinician that unsaved raw text remains available when service is unavailable", async () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../client/src/pages/PatientDetailPage.tsx"), "utf8");
    expect(source).toContain("Your raw text is still available; please retry or complete the note manually.");
  });
});
