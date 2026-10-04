import { describe, expect, it } from "vitest";
import { decryptServerCredential, encryptServerCredential } from "./serverCredentialCrypto";

describe("server-only provider credential encryption", () => {
  it("encrypts and decrypts a synthetic credential without retaining plaintext in the stored representation", () => {
    const plaintext = "synthetic-provider-credential-for-test-only";
    const encrypted = encryptServerCredential(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(encrypted.split(".")).toHaveLength(4);
    expect(decryptServerCredential(encrypted)).toBe(plaintext);
  });

  it("rejects tampered encrypted credential representations", () => {
    const encrypted = encryptServerCredential("synthetic-provider-credential-for-test-only");
    const [version, iv, ciphertext] = encrypted.split(".");
    const tampered = `${version}.${iv}.${ciphertext}.invalid-auth-tag`;
    expect(() => decryptServerCredential(tampered)).toThrow("Stored provider credential is invalid.");
  });
});
