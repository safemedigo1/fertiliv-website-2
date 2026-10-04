/** Session signing key. A missing or short secret must fail closed, never fall back to a known string. */
export function jwtSecretBytes(): Uint8Array {
  const secret = process.env.JWT_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new Error("JWT_SECRET must be set to a random value of at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  ownerEmail: process.env.OWNER_EMAIL ?? "",
  // Cloudflare R2 storage
  r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  r2BucketName: process.env.R2_BUCKET_NAME ?? "",
  r2PublicUrl: process.env.R2_PUBLIC_URL ?? "",
  // Google Calendar G1 — server-only OAuth and durable-token encryption values.
  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
  googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
  googleOAuthRedirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "",
  googleOAuthTokenEncryptionKey: process.env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY ?? "",
  // Reuse the existing server-only encryption key for provider credentials unless
  // a dedicated WhatsApp credential key is explicitly provisioned.
  serverCredentialEncryptionKey: process.env.WHATSAPP_CREDENTIAL_ENCRYPTION_KEY ?? process.env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY ?? "",
};
