import { describe, expect, it } from "vitest";
import { parseMetaEmbeddedSignupMessage } from "../client/src/lib/whatsappEmbeddedSignup";

describe("Meta Embedded Signup browser boundary", () => {
  it("accepts only a trusted Meta-origin standard completion payload", () => {
    const parsed = parseMetaEmbeddedSignupMessage({
      origin: "https://www.facebook.com",
      data: JSON.stringify({
        type: "WA_EMBEDDED_SIGNUP",
        event: "FINISH",
        data: { waba_id: "waba-1", phone_number_id: "phone-1", business_id: "business-1" },
      }),
    } as MessageEvent);
    expect(parsed).toEqual({
      event: "FINISH",
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
      businessPortfolioId: "business-1",
      currentStep: null,
    });
  });

  it("captures only bounded cancellation metadata and rejects untrusted origins", () => {
    const cancelled = parseMetaEmbeddedSignupMessage({
      origin: "https://business.facebook.com",
      data: { type: "WA_EMBEDDED_SIGNUP", event: "CANCEL", data: { current_step: "PHONE_NUMBER_SETUP" } },
    } as MessageEvent);
    const untrusted = parseMetaEmbeddedSignupMessage({
      origin: "https://attacker.example",
      data: { type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { waba_id: "bad" } },
    } as MessageEvent);
    expect(cancelled).toMatchObject({ event: "CANCEL", currentStep: "PHONE_NUMBER_SETUP", wabaId: null, phoneNumberId: null });
    expect(untrusted).toBeNull();
  });
});
