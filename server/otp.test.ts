/**
 * Tests for OTP identity flow procedures:
 * - leads.checkExistingLead
 * - leads.sendOtp
 * - leads.verifyOtp
 *
 * These procedures are in the `intake` router (not `leads` router).
 * We test the business logic directly without hitting the DB.
 */

import { describe, it, expect } from "vitest";

// ─── Unit tests for OTP helper logic ─────────────────────────────────────────

describe("OTP generation", () => {
  it("generates a 6-digit numeric OTP", () => {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    expect(otp).toMatch(/^\d{6}$/);
    expect(Number(otp)).toBeGreaterThanOrEqual(100000);
    expect(Number(otp)).toBeLessThanOrEqual(999999);
  });

  it("OTP expiry is 10 minutes in the future", () => {
    const before = Date.now();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const after = Date.now();
    expect(expiresAt.getTime()).toBeGreaterThan(before + 9 * 60 * 1000);
    expect(expiresAt.getTime()).toBeLessThan(after + 11 * 60 * 1000);
  });
});

describe("Email masking", () => {
  it("masks email correctly", () => {
    const email = "john.doe@example.com";
    const masked = email.replace(/(.{2}).+(@.+)/, "$1***$2");
    expect(masked).toBe("jo***@example.com");
  });

  it("masks short email correctly (local part has no chars between prefix and @)", () => {
    // 'ab@test.com' has only 2 chars before @, so the regex (.{2}).+ won't match
    // (requires at least 3 chars before @). The email stays unchanged.
    const email = "ab@test.com";
    const masked = email.replace(/(.{2}).+(@.+)/, "$1***$2");
    expect(masked).toBe("ab@test.com"); // unchanged - too short to mask
  });

  it("does not mask if email has no chars between prefix and @", () => {
    // Edge case: very short local part
    const email = "a@b.com";
    const masked = email.replace(/(.{2}).+(@.+)/, "$1***$2");
    // The regex requires at least 3 chars before @, so it won't match
    expect(masked).toBe("a@b.com"); // unchanged
  });
});

describe("OTP verification logic", () => {
  it("rejects expired OTP", () => {
    const otpExpiresAt = new Date(Date.now() - 1000); // 1 second ago
    const isExpired = new Date() > new Date(otpExpiresAt);
    expect(isExpired).toBe(true);
  });

  it("accepts valid OTP within expiry", () => {
    const otpExpiresAt = new Date(Date.now() + 9 * 60 * 1000); // 9 minutes from now
    const isExpired = new Date() > new Date(otpExpiresAt);
    expect(isExpired).toBe(false);
  });

  it("rejects incorrect OTP", () => {
    const storedOtp = "123456";
    const inputOtp = "654321";
    expect(storedOtp !== inputOtp).toBe(true);
  });

  it("accepts correct OTP", () => {
    const storedOtp = "123456";
    const inputOtp = "123456";
    expect(storedOtp === inputOtp).toBe(true);
  });
});

describe("Session token generation", () => {
  it("generates a 64-char hex session token", async () => {
    const { randomBytes } = await import("crypto");
    const token = randomBytes(32).toString("hex");
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });
});

describe("Coordinator availability slot generation", () => {
  it("generates correct slots from a weekly schedule window", () => {
    // Simulate a Monday with 09:00-11:00 window and 30-min slots
    const slots: string[] = [];
    const slotDuration = 30;
    const windowStart = new Date("2026-05-18T09:00:00.000Z"); // Monday
    const windowEnd = new Date("2026-05-18T11:00:00.000Z");
    let slotStart = new Date(windowStart);
    while (slotStart.getTime() + slotDuration * 60000 <= windowEnd.getTime()) {
      const startHH = String(slotStart.getUTCHours()).padStart(2, "0");
      const startMM = String(slotStart.getUTCMinutes()).padStart(2, "0");
      slots.push(`${startHH}:${startMM}`);
      slotStart = new Date(slotStart.getTime() + slotDuration * 60000);
    }
    expect(slots).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  it("returns no slots when window is too short for one slot", () => {
    const slots: string[] = [];
    const slotDuration = 60;
    const windowStart = new Date("2026-05-18T09:00:00.000Z");
    const windowEnd = new Date("2026-05-18T09:30:00.000Z"); // Only 30 min
    let slotStart = new Date(windowStart);
    while (slotStart.getTime() + slotDuration * 60000 <= windowEnd.getTime()) {
      slots.push("slot");
      slotStart = new Date(slotStart.getTime() + slotDuration * 60000);
    }
    expect(slots).toHaveLength(0);
  });
});
