import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { ENV } from "./_core/env";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const SALT = Buffer.from("fertiliv-external-report-source-assets", "utf8");
const INFO = Buffer.from("document-password", "utf8");

function encryptionKey() {
  const rootKey = Buffer.from(ENV.googleOAuthTokenEncryptionKey, "base64");
  if (!ENV.googleOAuthTokenEncryptionKey || rootKey.length !== 32) {
    throw new Error("Secure document-password storage is not configured.");
  }
  return Buffer.from(hkdfSync("sha256", rootKey, SALT, INFO, 32));
}

/** Stores protected-document secrets as an authenticated, domain-separated ciphertext envelope. */
export function encryptExternalReportDocumentPassword(password: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), ciphertext.toString("base64url"), authTag.toString("base64url")].join(".");
}

/** Decrypts only in a server-side processing path; plaintext must never be returned to the client or LLM. */
export function decryptExternalReportDocumentPassword(envelope: string) {
  const [version, ivEncoded, ciphertextEncoded, authTagEncoded, ...unexpected] = envelope.split(".");
  if (version !== VERSION || !ivEncoded || !ciphertextEncoded || !authTagEncoded || unexpected.length) {
    throw new Error("Stored document password is invalid.");
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivEncoded, "base64url"));
    decipher.setAuthTag(Buffer.from(authTagEncoded, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Stored document password is invalid.");
  }
}
