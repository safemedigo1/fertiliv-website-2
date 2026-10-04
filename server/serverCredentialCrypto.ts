import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ENV } from "./_core/env";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function getEncryptionKey(): Buffer {
  const key = Buffer.from(ENV.serverCredentialEncryptionKey, "base64");
  if (!ENV.serverCredentialEncryptionKey || key.length !== 32) {
    throw new Error("Secure provider credential storage is not configured.");
  }
  return key;
}

/** Encrypts a provider credential for server-only at-rest storage. */
export function encryptServerCredential(credential: string): string {
  if (!credential) throw new Error("Provider credential is empty.");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(credential, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), ciphertext.toString("base64url"), authTag.toString("base64url")].join(".");
}

/** Decrypts a provider credential only inside server-side provider operations. */
export function decryptServerCredential(serializedCredential: string): string {
  const [version, ivEncoded, ciphertextEncoded, authTagEncoded, ...unexpected] = serializedCredential.split(".");
  if (version !== VERSION || !ivEncoded || !ciphertextEncoded || !authTagEncoded || unexpected.length > 0) {
    throw new Error("Stored provider credential is invalid.");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivEncoded, "base64url"));
    decipher.setAuthTag(Buffer.from(authTagEncoded, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Stored provider credential is invalid.");
  }
}
