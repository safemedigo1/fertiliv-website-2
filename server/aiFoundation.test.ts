import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { AI_WORKLOAD_REGISTRY, getAiWorkload } from "./ai/workloadRegistry";
import { categorizeAiError } from "./ai/usageTelemetry";
import { createMedicalScribeGenerator } from "./medicalScribeAI";

const validSummary = JSON.stringify({
  chiefComplaint: "", historyOfPresentIllness: "", physicalExamination: "", assessment: "",
  plan: "", diagnosis: "", medications: "", additionalNotes: "",
});

describe("AI control plane foundation", () => {
  it("AI-F1 keeps the current fixed Medical Scribe and speech-to-text provider routes in the application-owned registry", () => {
    expect(getAiWorkload("medical_scribe").currentPrimary).toEqual({ provider: "groq", model: "qwen/qwen3.8-27b" });
    expect(getAiWorkload("speech_to_text").currentPrimary).toEqual({ provider: "groq", model: "whisper-large-v3-turbo" });
    expect(AI_WORKLOAD_REGISTRY.medical_scribe.requiresFallback).toBe(true);
  });

  it("AI-F2 preserves one logical telemetry session across current Medical Scribe fallback attempts", async () => {
    const telemetry = {
      logicalRequestId: "safe-test-id",
      workloadId: "medical_scribe" as const,
      beginAttempt: vi.fn(() => ({ attemptId: "safe-attempt", succeed: vi.fn(), fail: vi.fn() })),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
    const generate = createMedicalScribeGenerator({
      invokeGroq: vi.fn().mockRejectedValueOnce(new Error("rate limit")).mockResolvedValueOnce({ content: validSummary }),
      invokeBuiltIn: vi.fn(),
      createTelemetry: () => telemetry,
    });

    const result = await generate({ rawText: "Clinical input is not telemetry", noteType: "follow_up" });

    expect(result.provider).toBe("groq-gpt-oss");
    expect(telemetry.succeed).toHaveBeenCalledTimes(1);
    expect(telemetry.fail).not.toHaveBeenCalled();
  });

  it("AI-C1 captures immutable attempt ordinals when attempts are created, before asynchronous telemetry writes", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "ai/usageTelemetry.ts"), "utf8");
    expect(source).toContain("const attemptNumber = attemptCount");
    expect(source).toContain("attemptNumber }));");
    expect(source).not.toContain("attemptNumber: attemptCount" );
  });

  it("AI-C2 preserves primary-then-fallback provider route order for a two-stage Medical Scribe success", async () => {
    const telemetry = {
      logicalRequestId: "safe-two-stage-id",
      workloadId: "medical_scribe" as const,
      beginAttempt: vi.fn(() => ({ attemptId: "safe-attempt", succeed: vi.fn(), fail: vi.fn() })),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
    const invokeGroq = vi.fn().mockRejectedValueOnce(new Error("rate limit")).mockResolvedValueOnce({ content: validSummary });
    const generate = createMedicalScribeGenerator({
      invokeGroq,
      invokeBuiltIn: vi.fn(),
      createTelemetry: () => telemetry,
    });

    await generate({ rawText: "Non-clinical QA input", noteType: "follow_up" });

    expect(invokeGroq.mock.calls.map(([input]) => input.model)).toEqual(["qwen/qwen3.8-27b", "openai/gpt-oss-120b"]);
    expect(telemetry.succeed).toHaveBeenCalledTimes(1);
    expect(telemetry.fail).not.toHaveBeenCalled();
  });

  it("AI-C3 records the complete three-stage route order and retains safe all-fail behavior", async () => {
    const telemetry = {
      logicalRequestId: "safe-three-stage-id",
      workloadId: "medical_scribe" as const,
      beginAttempt: vi.fn(() => ({ attemptId: "safe-attempt", succeed: vi.fn(), fail: vi.fn() })),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
    const invokeGroq = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    const invokeBuiltIn = vi.fn().mockRejectedValue(new Error("network reset"));
    const generate = createMedicalScribeGenerator({
      invokeGroq,
      invokeBuiltIn,
      createTelemetry: () => telemetry,
    });

    await expect(generate({ rawText: "Non-clinical QA input", noteType: "follow_up" })).rejects.toThrow("temporarily unavailable");

    expect(invokeGroq.mock.calls.map(([input]) => input.model)).toEqual(["qwen/qwen3.8-27b", "openai/gpt-oss-120b"]);
    expect(invokeBuiltIn.mock.calls.map(([input]) => input.model)).toEqual(["openai/gpt-oss-20b"]);
    expect(telemetry.fail).toHaveBeenCalledTimes(1);
    expect(telemetry.succeed).not.toHaveBeenCalled();
  });

  it("AI-F3 categorizes safe operational failures without retaining raw provider details", () => {
    expect(categorizeAiError(new Error("HTTP 429 rate limit"))).toBe("rate_limit");
    expect(categorizeAiError(new Error("socket network reset"))).toBe("network_error");
    expect(categorizeAiError(new Error("unexpected JSON parse"))).toBe("malformed_structured_output");
    expect(categorizeAiError(new Error("GenerateContentRequest response_schema invalid_argument"))).toBe("provider_schema");
  });

  it("AI-F4 metadata-only ledger schema excludes prompt, response, person, document, and credential columns", () => {
    const migration = fs.readFileSync(path.resolve(__dirname, "../drizzle/0079_ai_control_plane_foundation.sql"), "utf8").toLowerCase();
    for (const prohibited of ["prompt", "response", "patientid", "leadid", "documentid", "fileurl", "credential", "apikey", "rawerror"]) {
      expect(migration).not.toContain(`\`${prohibited}\``);
    }
    expect(migration).toContain("logicalrequestid");
    expect(migration).toContain("attemptnumber");
    expect(migration).toContain("fallbackused");
  });

  it("AI-F5 keeps telemetry non-blocking at the transport boundary", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "_core/llm.ts"), "utf8");
    expect(source).toContain("createAiTelemetrySession");
    expect(source).toContain("telemetryAttempt");
    expect(source).not.toContain("await telemetry");
  });

  it("AI-F6 gives every unchanged built-in caller a fixed safe workload identity and keeps explicit workload IDs typed", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "_core/llm.ts"), "utf8");
    expect(source).toContain('params.workloadId ?? "structured_json_generation"');
    expect(AI_WORKLOAD_REGISTRY.structured_json_generation.currentPrimary).toEqual({ provider: "manus_forge", model: "gemini-2.5-flash" });
    expect(getAiWorkload("intake_form_translation").capability).toBe("structured_json");
    expect(getAiWorkload("laboratory_dictionary_enrichment").phiSensitivity).toBe("medium");
    const labDictionarySource = fs.readFileSync(path.resolve(__dirname, "routers/labDictionary.ts"), "utf8");
    expect(labDictionarySource).toContain("workloadId: \"laboratory_dictionary_enrichment\"");
  });

  it("AI-F7 keeps provider-attempt metadata bounded to provider, model, timing, usage and safe outcome fields", () => {
    const migration = fs.readFileSync(path.resolve(__dirname, "../drizzle/0079_ai_control_plane_foundation.sql"), "utf8").toLowerCase();
    for (const required of ["provider", "model", "latencyms", "inputtokens", "outputtokens", "totaltokens", "failurecategory", "providerusageavailable"]) {
      expect(migration).toContain(required);
    }
    expect(migration).not.toContain("prompttext");
    expect(migration).not.toContain("responsebody");
  });
});
