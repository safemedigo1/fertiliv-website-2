import { describe, expect, it } from "vitest";
import { invokeGroqLLM } from "./_core/groqLLM";
import { invokeLLM } from "./_core/llm";
import { MEDICAL_SCRIBE_FIRST_FALLBACK_MODEL, MEDICAL_SCRIBE_PRIMARY_MODEL, MEDICAL_SCRIBE_SECOND_FALLBACK_MODEL } from "./medicalScribeAI";

const harmlessPrompt = [
  { role: "system" as const, content: "Return only a JSON object with one required string key named status." },
  { role: "user" as const, content: "Return the status value ready." },
];

describe("Medical Scribe fallback live providers", () => {
  it("accepts the primary Groq model", async () => {
    const result = await invokeGroqLLM({
      model: MEDICAL_SCRIBE_PRIMARY_MODEL,
      messages: harmlessPrompt,
      responseFormat: "json",
    });

    expect(JSON.parse(result.content)).toMatchObject({ status: expect.any(String) });
  }, 30000);

  it("accepts the first Groq fallback model", async () => {
    const result = await invokeGroqLLM({
      model: MEDICAL_SCRIBE_FIRST_FALLBACK_MODEL,
      messages: harmlessPrompt,
      responseFormat: "json",
    });

    expect(JSON.parse(result.content)).toMatchObject({ status: expect.any(String) });
  }, 30000);

  it("accepts the independent built-in fallback provider with strict structured output", async () => {
    const result = await invokeLLM({
      model: MEDICAL_SCRIBE_SECOND_FALLBACK_MODEL,
      messages: harmlessPrompt,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "provider_health",
          strict: true,
          schema: {
            type: "object",
            properties: { status: { type: "string" } },
            required: ["status"],
            additionalProperties: false,
          },
        },
      },
    });

    expect(JSON.parse(String(result.choices[0]?.message.content))).toMatchObject({ status: expect.any(String) });
  }, 30000);
});
