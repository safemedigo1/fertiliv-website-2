import {
  decryptServerCredential,
  encryptServerCredential,
} from "./serverCredentialCrypto";

/** Google Calendar compatibility wrapper over the shared server-only credential cipher. */
export function encryptGoogleRefreshToken(refreshToken: string): string {
  return encryptServerCredential(refreshToken);
}

/** Google Calendar compatibility wrapper over the shared server-only credential cipher. */
export function decryptGoogleRefreshToken(serializedToken: string): string {
  try {
    return decryptServerCredential(serializedToken);
  } catch {
    throw new Error("Stored Google Calendar authorization is invalid.");
  }
}
