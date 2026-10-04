/**
 * Resend API Key Validation Test
 * Verifies that the RESEND_API_KEY environment variable is set and valid.
 */
import { describe, it, expect } from "vitest";
import { validateResendApiKey } from "./_core/email";

describe("Resend Email Service", () => {
  it("should have RESEND_API_KEY set in environment", () => {
    expect(process.env.RESEND_API_KEY).toBeDefined();
    expect(process.env.RESEND_API_KEY).not.toBe("");
    expect(process.env.RESEND_API_KEY).toMatch(/^re_/);
  });

  it("should successfully validate the Resend API key", async () => {
    const isValid = await validateResendApiKey();
    expect(isValid).toBe(true);
  }, 15000); // 15s timeout for network call
});
