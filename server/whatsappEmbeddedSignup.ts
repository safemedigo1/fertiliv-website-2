import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, or } from "drizzle-orm";
import {
  whatsappConnectionCredentials,
  whatsappConnectionTransitions,
  whatsappConnections,
  whatsappEmbeddedSignupSessions,
} from "../drizzle/schema";
import { FERTILIV_CLINIC_SCOPE } from "../shared/whatsappPhase1Contracts";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { encryptServerCredential } from "./serverCredentialCrypto";

const EMBEDDED_SIGNUP_SESSION_TTL_MS = 10 * 60 * 1000;
const DEFAULT_GRAPH_API_VERSION = "v26.0";
const META_GRAPH_BASE_URL = "https://graph.facebook.com";

const STANDARD_CLOUD_API_COMPLETION_EVENT = "FINISH";

export type WhatsAppEmbeddedSignupPublicConfig = {
  configured: boolean;
  appId: string | null;
  configId: string | null;
  graphApiVersion: string;
};

export type WhatsAppEmbeddedSignupCompleteInput = {
  requestId: string;
  authorizationCode: string;
  completionEvent: string;
  wabaId: string | null;
  phoneNumberId: string | null;
  businessPortfolioId: string | null;
};

export type WhatsAppEmbeddedSignupOutcome = {
  state: "authorized" | "cancelled" | "failed" | "conflict";
  category?: string;
  idempotent?: boolean;
};

type MetaTokenResponse = { access_token?: string; error?: { message?: string; code?: number } };
type MetaPhoneNumber = {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
};
type MetaPhoneNumbersResponse = { data?: MetaPhoneNumber[]; error?: { message?: string; code?: number } };
type MetaSubscriptionResponse = { success?: boolean; error?: { message?: string; code?: number } };

export class WhatsAppEmbeddedSignupError extends Error {
  constructor(
    readonly category:
      | "not_configured"
      | "invalid_session"
      | "expired_authorization"
      | "authorization_replayed"
      | "authorization_denied"
      | "coexistence_not_available"
      | "missing_waba"
      | "missing_phone_number"
      | "multiple_number_ambiguity"
      | "provider_validation_failed"
      | "webhook_subscription_failed"
      | "existing_persisted_connection"
      | "legacy_manual_configuration_conflict"
      | "credential_storage_failed",
    message: string,
  ) {
    super(message);
    this.name = "WhatsAppEmbeddedSignupError";
  }
}

function safeConfiguredValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function currentPublicConfig(): WhatsAppEmbeddedSignupPublicConfig {
  const appId = safeConfiguredValue(process.env.WHATSAPP_META_APP_ID);
  const configId = safeConfiguredValue(process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID);
  const credentialStorageReady = Buffer.from(ENV.serverCredentialEncryptionKey, "base64").length === 32;
  return {
    configured: Boolean(appId && configId && safeConfiguredValue(process.env.WHATSAPP_APP_SECRET) && credentialStorageReady),
    appId,
    configId,
    graphApiVersion: safeConfiguredValue(process.env.WHATSAPP_GRAPH_API_VERSION) ?? DEFAULT_GRAPH_API_VERSION,
  };
}

function assertServerConfiguration(): { appId: string; configId: string; graphApiVersion: string; appSecret: string } {
  const publicConfig = currentPublicConfig();
  const appSecret = safeConfiguredValue(process.env.WHATSAPP_APP_SECRET);
  if (!publicConfig.appId || !publicConfig.configId || !appSecret) {
    throw new WhatsAppEmbeddedSignupError(
      "not_configured",
      "Meta recommended onboarding is not configured. An administrator must complete the platform configuration.",
    );
  }
  if (Buffer.from(ENV.serverCredentialEncryptionKey, "base64").length !== 32) {
    throw new WhatsAppEmbeddedSignupError(
      "not_configured",
      "Secure server credential storage is not configured. No Meta authorization was started.",
    );
  }
  return { appId: publicConfig.appId, configId: publicConfig.configId, graphApiVersion: publicConfig.graphApiVersion, appSecret };
}

function createRequestId(): string {
  return randomBytes(24).toString("base64url");
}

export function getWhatsAppEmbeddedSignupAuthorizationCodeDigest(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function selectStandardEmbeddedSignupPhone(input: {
  wabaId: string | null;
  selectedPhoneNumberId: string | null;
  phoneNumbers: MetaPhoneNumber[];
}): { wabaId: string; phone: Required<MetaPhoneNumber> } {
  if (!input.wabaId) {
    throw new WhatsAppEmbeddedSignupError("missing_waba", "Meta did not return an authorized WhatsApp account. Please start a new authorization attempt.");
  }
  const candidates = input.phoneNumbers.filter((phone): phone is Required<MetaPhoneNumber> => Boolean(phone.id && phone.display_phone_number));
  if (!input.selectedPhoneNumberId) {
    if (candidates.length > 1) {
      throw new WhatsAppEmbeddedSignupError("multiple_number_ambiguity", "Meta authorized multiple phone numbers but did not identify the selected number. No Fertiliv connection was created.");
    }
    throw new WhatsAppEmbeddedSignupError("missing_phone_number", "Meta did not return an authorized phone number. Please start a new authorization attempt.");
  }
  const selected = candidates.find((phone) => phone.id === input.selectedPhoneNumberId);
  if (!selected) {
    throw new WhatsAppEmbeddedSignupError("provider_validation_failed", "Meta could not confirm the selected phone number for the authorized WhatsApp account.");
  }
  return { wabaId: input.wabaId, phone: selected };
}

function isDuplicateError(error: unknown): boolean {
  const candidate = error as { code?: string; errno?: number; message?: string } | null;
  return candidate?.code === "ER_DUP_ENTRY" || candidate?.errno === 1062 || candidate?.message?.includes("Duplicate entry") === true;
}

async function safeMetaFetch<T>(url: string, init: RequestInit, category: "provider_validation_failed" | "webhook_subscription_failed"): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new WhatsAppEmbeddedSignupError(category, "Meta could not be reached. Please start a new authorization attempt.");
  }

  const payload = await response.json().catch(() => ({})) as T;
  if (!response.ok) {
    throw new WhatsAppEmbeddedSignupError(category, category === "webhook_subscription_failed"
      ? "Meta could not subscribe the authorized account to webhooks. No Fertiliv connection was activated."
      : "Meta could not validate the authorized WhatsApp account. Please start a new authorization attempt.");
  }
  return payload;
}

async function exchangeAuthorizationCode(input: { code: string; appId: string; appSecret: string; graphApiVersion: string }): Promise<string> {
  const params = new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    code: input.code,
  });
  const payload = await safeMetaFetch<MetaTokenResponse>(
    `${META_GRAPH_BASE_URL}/${input.graphApiVersion}/oauth/access_token?${params.toString()}`,
    { method: "GET" },
    "provider_validation_failed",
  );
  if (!payload.access_token) {
    throw new WhatsAppEmbeddedSignupError("provider_validation_failed", "Meta did not grant a connection authorization. Please start a new authorization attempt.");
  }
  return payload.access_token;
}

async function validateSelectedPhone(input: {
  businessToken: string;
  graphApiVersion: string;
  wabaId: string | null;
  selectedPhoneNumberId: string | null;
}): Promise<{ wabaId: string; phone: Required<MetaPhoneNumber> }> {
  if (!input.wabaId) {
    throw new WhatsAppEmbeddedSignupError("missing_waba", "Meta did not return an authorized WhatsApp account. Please start a new authorization attempt.");
  }

  const payload = await safeMetaFetch<MetaPhoneNumbersResponse>(
    `${META_GRAPH_BASE_URL}/${input.graphApiVersion}/${encodeURIComponent(input.wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name`,
    { headers: { authorization: `Bearer ${input.businessToken}` } },
    "provider_validation_failed",
  );
  return selectStandardEmbeddedSignupPhone({
    wabaId: input.wabaId,
    selectedPhoneNumberId: input.selectedPhoneNumberId,
    phoneNumbers: payload.data ?? [],
  });
}

async function subscribeAuthorizedWaba(input: { businessToken: string; graphApiVersion: string; wabaId: string }): Promise<void> {
  const payload = await safeMetaFetch<MetaSubscriptionResponse>(
    `${META_GRAPH_BASE_URL}/${input.graphApiVersion}/${encodeURIComponent(input.wabaId)}/subscribed_apps`,
    { method: "POST", headers: { authorization: `Bearer ${input.businessToken}` } },
    "webhook_subscription_failed",
  );
  if (payload.success !== true) {
    throw new WhatsAppEmbeddedSignupError("webhook_subscription_failed", "Meta could not subscribe the authorized account to webhooks. No Fertiliv connection was activated.");
  }
}

async function markSessionFailure(requestId: string, category: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(whatsappEmbeddedSignupSessions).set({ state: "failed", failureCategory: category })
    .where(eq(whatsappEmbeddedSignupSessions.requestId, requestId));
}

export function getWhatsAppEmbeddedSignupPublicConfig(): WhatsAppEmbeddedSignupPublicConfig {
  return currentPublicConfig();
}

export async function startWhatsAppEmbeddedSignup(adminUserId: number): Promise<{ requestId: string; appId: string; configId: string; graphApiVersion: string }> {
  const config = assertServerConfiguration();
  const db = await getDb();
  if (!db) throw new WhatsAppEmbeddedSignupError("not_configured", "Recommended WhatsApp onboarding is temporarily unavailable. Please try again later.");

  const requestId = createRequestId();
  await db.insert(whatsappEmbeddedSignupSessions).values({
    requestId,
    startedById: adminUserId,
    state: "started",
    expiresAt: new Date(Date.now() + EMBEDDED_SIGNUP_SESSION_TTL_MS),
  });
  return { requestId, appId: config.appId, configId: config.configId, graphApiVersion: config.graphApiVersion };
}

export async function recordWhatsAppEmbeddedSignupCancellation(input: {
  requestId: string;
  adminUserId: number;
  currentStep?: string | null;
  category: "cancelled" | "authorization_denied" | "provider_error";
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(whatsappEmbeddedSignupSessions).set({
    state: "cancelled",
    currentStep: input.currentStep?.slice(0, 80) ?? null,
    failureCategory: input.category,
  }).where(and(
    eq(whatsappEmbeddedSignupSessions.requestId, input.requestId),
    eq(whatsappEmbeddedSignupSessions.startedById, input.adminUserId),
    eq(whatsappEmbeddedSignupSessions.state, "started"),
  ));
}

async function reserveAuthorizationCode(input: { requestId: string; adminUserId: number; digest: string }) {
  const db = await getDb();
  if (!db) throw new WhatsAppEmbeddedSignupError("credential_storage_failed", "Recommended WhatsApp onboarding is temporarily unavailable. Please try again later.");

  const [session] = await db.select().from(whatsappEmbeddedSignupSessions).where(and(
    eq(whatsappEmbeddedSignupSessions.requestId, input.requestId),
    eq(whatsappEmbeddedSignupSessions.startedById, input.adminUserId),
  )).limit(1);
  if (!session) throw new WhatsAppEmbeddedSignupError("invalid_session", "This authorization attempt is no longer valid. Start again from Settings.");
  if (session.state === "completed") return { idempotent: true as const, session };
  if (session.state !== "started") throw new WhatsAppEmbeddedSignupError("invalid_session", "This authorization attempt is no longer active. Start again from Settings.");
  if (session.expiresAt.getTime() <= Date.now()) {
    await markSessionFailure(input.requestId, "expired_authorization");
    throw new WhatsAppEmbeddedSignupError("expired_authorization", "The Meta authorization result expired. Start a new authorization attempt.");
  }

  try {
    const result = await db.update(whatsappEmbeddedSignupSessions).set({ authorizationCodeDigest: input.digest })
      .where(and(
        eq(whatsappEmbeddedSignupSessions.id, session.id),
        isNull(whatsappEmbeddedSignupSessions.authorizationCodeDigest),
        eq(whatsappEmbeddedSignupSessions.state, "started"),
      ));
    if (Number((result as any)[0]?.affectedRows ?? (result as any).affectedRows ?? 0) !== 1) {
      throw new WhatsAppEmbeddedSignupError("authorization_replayed", "This authorization result has already been used. Start a new authorization attempt.");
    }
  } catch (error) {
    if (error instanceof WhatsAppEmbeddedSignupError) throw error;
    if (isDuplicateError(error)) {
      throw new WhatsAppEmbeddedSignupError("authorization_replayed", "This authorization result has already been used. Start a new authorization attempt.");
    }
    throw new WhatsAppEmbeddedSignupError("credential_storage_failed", "The authorization result could not be reserved safely. Start a new authorization attempt.");
  }
  return { idempotent: false as const, session };
}

async function assertNoConnectionConflict(input: { wabaId: string; phoneNumberId: string }): Promise<void> {
  const legacyPhone = safeConfiguredValue(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const legacyWaba = safeConfiguredValue(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID);
  if (legacyPhone === input.phoneNumberId || (legacyWaba && legacyWaba === input.wabaId)) {
    throw new WhatsAppEmbeddedSignupError("legacy_manual_configuration_conflict", "This Meta account overlaps the current Manual Cloud API configuration. No migration or credential replacement was performed.");
  }

  const db = await getDb();
  if (!db) throw new WhatsAppEmbeddedSignupError("credential_storage_failed", "Recommended WhatsApp onboarding is temporarily unavailable. Please try again later.");
  const [existing] = await db.select({ id: whatsappConnections.id }).from(whatsappConnections).where(and(
    eq(whatsappConnections.provider, "meta"),
    or(eq(whatsappConnections.providerPhoneNumberId, input.phoneNumberId), eq(whatsappConnections.wabaId, input.wabaId)),
  )).limit(1);
  if (existing) {
    throw new WhatsAppEmbeddedSignupError("existing_persisted_connection", "This Meta phone number or WhatsApp account is already recorded in Fertiliv. No duplicate connection was created.");
  }
}

async function persistAuthorizedConnection(input: {
  requestId: string;
  adminUserId: number;
  completionEvent: string;
  wabaId: string;
  phone: Required<MetaPhoneNumber>;
  businessPortfolioId: string | null;
  businessToken: string;
  graphApiVersion: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new WhatsAppEmbeddedSignupError("credential_storage_failed", "Recommended WhatsApp onboarding is temporarily unavailable. Please try again later.");

  let encryptedCredential: string;
  try {
    encryptedCredential = encryptServerCredential(input.businessToken);
  } catch {
    throw new WhatsAppEmbeddedSignupError("credential_storage_failed", "Secure connection credential storage is not configured. No Fertiliv connection was created.");
  }

  try {
    await db.transaction(async (tx) => {
      const [session] = await tx.select().from(whatsappEmbeddedSignupSessions).where(and(
        eq(whatsappEmbeddedSignupSessions.requestId, input.requestId),
        eq(whatsappEmbeddedSignupSessions.startedById, input.adminUserId),
      )).limit(1);
      if (!session || session.state !== "started") {
        throw new WhatsAppEmbeddedSignupError("authorization_replayed", "This authorization attempt is no longer active. Start a new authorization attempt.");
      }

      const [existing] = await tx.select({ id: whatsappConnections.id }).from(whatsappConnections).where(and(
        eq(whatsappConnections.provider, "meta"),
        or(eq(whatsappConnections.providerPhoneNumberId, input.phone.id), eq(whatsappConnections.wabaId, input.wabaId)),
      )).limit(1);
      if (existing) throw new WhatsAppEmbeddedSignupError("existing_persisted_connection", "This Meta phone number or WhatsApp account is already recorded in Fertiliv. No duplicate connection was created.");

      const [connectionResult] = await tx.insert(whatsappConnections).values({
        clinicScope: FERTILIV_CLINIC_SCOPE,
        provider: "meta",
        onboardingMethod: "meta_embedded_signup",
        providerPhoneNumberId: input.phone.id,
        wabaId: input.wabaId,
        businessPortfolioId: input.businessPortfolioId,
        displayPhone: input.phone.display_phone_number,
        normalizedDisplayPhone: input.phone.display_phone_number.replace(/\D/g, ""),
        displayName: input.phone.verified_name ?? null,
        providerMetadata: {
          onboarding: "meta_embedded_signup",
          completionEvent: input.completionEvent,
          serverValidated: true,
          webhookSubscribed: true,
          graphApiVersion: input.graphApiVersion,
        },
        credentialSource: "secret_reference",
        credentialRef: "secret://whatsapp_connection_credentials/pending",
        lifecycleStatus: "onboarding",
        providerStateSnapshot: { state: "authorized_pending_activation" },
        healthState: "unknown",
        lastTransitionAt: new Date(),
        createdById: input.adminUserId,
        updatedById: input.adminUserId,
      });
      const connectionId = Number((connectionResult as any).insertId);
      if (!connectionId) throw new WhatsAppEmbeddedSignupError("credential_storage_failed", "The authorized Meta connection could not be stored safely.");

      await tx.insert(whatsappConnectionCredentials).values({
        connectionId,
        credentialKind: "business_access_token",
        encryptedCredential,
        encryptionVersion: "v1",
      });
      await tx.update(whatsappConnections).set({
        credentialRef: `secret://whatsapp_connection_credentials/${connectionId}`,
        updatedById: input.adminUserId,
      }).where(eq(whatsappConnections.id, connectionId));
      await tx.insert(whatsappConnectionTransitions).values({
        connectionId,
        toOnboardingMethod: "meta_embedded_signup",
        toCredentialSource: "secret_reference",
        transitionReason: "embedded_signup_authorized",
        transitionedById: input.adminUserId,
      });
      await tx.update(whatsappEmbeddedSignupSessions).set({
        state: "completed",
        completionEvent: input.completionEvent,
        providerWabaId: input.wabaId,
        providerPhoneNumberId: input.phone.id,
        providerBusinessPortfolioId: input.businessPortfolioId,
        connectionId,
        completedAt: new Date(),
      }).where(eq(whatsappEmbeddedSignupSessions.id, session.id));
    });
  } catch (error) {
    if (error instanceof WhatsAppEmbeddedSignupError) throw error;
    if (isDuplicateError(error)) {
      throw new WhatsAppEmbeddedSignupError("existing_persisted_connection", "This Meta phone number or WhatsApp account is already recorded in Fertiliv. No duplicate connection was created.");
    }
    throw new WhatsAppEmbeddedSignupError("credential_storage_failed", "The authorized Meta connection could not be stored safely. No Fertiliv connection was activated.");
  }
}

export async function completeWhatsAppEmbeddedSignup(input: WhatsAppEmbeddedSignupCompleteInput, adminUserId: number): Promise<WhatsAppEmbeddedSignupOutcome> {
  if (input.completionEvent === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
    await markSessionFailure(input.requestId, "coexistence_not_available");
    throw new WhatsAppEmbeddedSignupError("coexistence_not_available", "WhatsApp Business App coexistence is not available in this onboarding step.");
  }
  if (input.completionEvent !== STANDARD_CLOUD_API_COMPLETION_EVENT) {
    await markSessionFailure(input.requestId, "unsupported_completion_event");
    throw new WhatsAppEmbeddedSignupError("provider_validation_failed", "Meta did not return a standard Cloud API number authorization. Start a new authorization attempt.");
  }

  const reservation = await reserveAuthorizationCode({ requestId: input.requestId, adminUserId, digest: getWhatsAppEmbeddedSignupAuthorizationCodeDigest(input.authorizationCode) });
  if (reservation.idempotent) return { state: "authorized", idempotent: true };

  try {
    const config = assertServerConfiguration();
    const businessToken = await exchangeAuthorizationCode({
      code: input.authorizationCode,
      appId: config.appId,
      appSecret: config.appSecret,
      graphApiVersion: config.graphApiVersion,
    });
    const validated = await validateSelectedPhone({
      businessToken,
      graphApiVersion: config.graphApiVersion,
      wabaId: input.wabaId,
      selectedPhoneNumberId: input.phoneNumberId,
    });
    await assertNoConnectionConflict({ wabaId: validated.wabaId, phoneNumberId: validated.phone.id });
    await subscribeAuthorizedWaba({ businessToken, graphApiVersion: config.graphApiVersion, wabaId: validated.wabaId });
    await persistAuthorizedConnection({
      requestId: input.requestId,
      adminUserId,
      completionEvent: input.completionEvent,
      wabaId: validated.wabaId,
      phone: validated.phone,
      businessPortfolioId: input.businessPortfolioId,
      businessToken,
      graphApiVersion: config.graphApiVersion,
    });
    return { state: "authorized" };
  } catch (error) {
    const category = error instanceof WhatsAppEmbeddedSignupError ? error.category : "provider_validation_failed";
    await markSessionFailure(input.requestId, category);
    throw error;
  }
}
