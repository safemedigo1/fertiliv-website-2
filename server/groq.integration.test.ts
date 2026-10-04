/**
 * Groq API Integration Tests
 * Validates both GROQ_WHISPER_API_KEY and GROQ_LLM_API_KEY are set and functional.
 */
import { describe, it, expect } from "vitest";
import { validateGroqWhisperKey } from "./_core/groqTranscription";
import { validateGroqLLMKey, invokeGroqLLM } from "./_core/groqLLM";

describe("Groq Voice Transcription (Whisper)", () => {
  it("should have GROQ_WHISPER_API_KEY set in environment", () => {
    expect(process.env.GROQ_WHISPER_API_KEY).toBeDefined();
    expect(process.env.GROQ_WHISPER_API_KEY).toMatch(/^gsk_/);
  });

  it("should successfully validate the Groq Whisper API key", async () => {
    const isValid = await validateGroqWhisperKey();
    expect(isValid).toBe(true);
  }, 15000);
});

describe("Groq AI Medical Scribe (LLaMA 3)", () => {
  it("should have GROQ_LLM_API_KEY set in environment", () => {
    expect(process.env.GROQ_LLM_API_KEY).toBeDefined();
    expect(process.env.GROQ_LLM_API_KEY).toMatch(/^gsk_/);
  });

  it("should successfully validate the Groq LLM API key", async () => {
    const isValid = await validateGroqLLMKey();
    expect(isValid).toBe(true);
  }, 15000);

  it("should generate a structured medical note from raw text", async () => {
    const result = await invokeGroqLLM({
      messages: [
        {
          role: "system",
          content: `You are a medical scribe. Return ONLY valid JSON with keys: chiefComplaint, historyOfPresentIllness, physicalExamination, assessment, plan, diagnosis, medications.`,
        },
        {
          role: "user",
          content: "Patient is a 32-year-old female presenting with irregular cycles. No medications. Normal exam.",
        },
      ],
      responseFormat: "json",
    });

    expect(result.content).toBeTruthy();
    const parsed = JSON.parse(result.content);
    expect(parsed).toHaveProperty("chiefComplaint");
    expect(parsed).toHaveProperty("assessment");
    expect(parsed).toHaveProperty("plan");
  }, 30000);
});
