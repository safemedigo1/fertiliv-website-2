import { and, eq } from "drizzle-orm";
import { whatsappConnections } from "../drizzle/schema";
import {
  FERTILIV_CLINIC_SCOPE,
  isConnectionLifecycleActiveForIngress,
  isSafeStoredCredentialReference,
  isWhatsAppPhase1PersistedConnectionCutoverEnabled,
  type ResolvedWhatsAppConnection,
} from "../shared/whatsappPhase1Contracts";
import {
  buildWhatsAppManualSettingsStatus,
  type WhatsAppManualSettingsStatus,
} from "../shared/whatsappManualSettings";
import { getDb } from "./db";

export type ResolvedOutboundWhatsAppConnection = ResolvedWhatsAppConnection & {
  /** Present in memory only after an approved server-side credential resolution. */
  accessToken: string;
};

export type InboundConnectionResolution = {
  connection: ResolvedWhatsAppConnection | null;
  routingState: "legacy_env" | "resolved" | "unmapped" | "mismatched";
  failureCategory: "unmapped_connection" | "waba_mismatch" | "inactive_connection" | null;
};

/**
 * Returns only non-secret configuration state for the Settings UI. Raw
 * credentials and project-level webhook secrets never leave the server.
 */
export function getWhatsAppManualSettingsStatus(): WhatsAppManualSettingsStatus {
  return buildWhatsAppManualSettingsStatus({
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    accessToken: process.env.WHATSAPP_API_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    persistedConnectionCutoverEnabled: isWhatsAppPhase1PersistedConnectionCutoverEnabled(),
  });
}

export function buildLegacyEnvConnection(input: {
  phoneNumberId?: string;
  wabaId?: string;
} = {}): ResolvedWhatsAppConnection | null {
  const phoneNumberId = input.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) return null;

  const wabaId = input.wabaId ?? process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? null;
  return {
    id: null,
    clinicScope: FERTILIV_CLINIC_SCOPE,
    provider: "meta",
    onboardingMethod: "manual_cloud_api",
    phoneNumberId,
    wabaId,
    businessPortfolioId: null,
    displayPhone: null,
    normalizedDisplayPhone: null,
    displayName: null,
    credentialSource: "legacy_env",
    credentialRef: "env://WHATSAPP_API_TOKEN",
    lifecycleStatus: "connected",
    route: "legacy_env",
  };
}

function toResolvedConnection(row: typeof whatsappConnections.$inferSelect): ResolvedWhatsAppConnection {
  return {
    id: row.id,
    clinicScope: row.clinicScope,
    provider: row.provider,
    onboardingMethod: row.onboardingMethod,
    phoneNumberId: row.providerPhoneNumberId,
    wabaId: row.wabaId,
    businessPortfolioId: row.businessPortfolioId,
    displayPhone: row.displayPhone,
    normalizedDisplayPhone: row.normalizedDisplayPhone,
    displayName: row.displayName,
    credentialSource: row.credentialSource,
    credentialRef: row.credentialRef,
    lifecycleStatus: row.lifecycleStatus,
    route: "persisted",
  };
}

export async function resolveInboundWhatsAppConnection(input: {
  wabaId: string | null;
  phoneNumberId: string | null;
}): Promise<InboundConnectionResolution> {
  if (!input.phoneNumberId) {
    return {
      connection: null,
      routingState: "unmapped",
      failureCategory: "unmapped_connection",
    };
  }

  const db = await getDb();
  if (db) {
    const [persisted] = await db
      .select()
      .from(whatsappConnections)
      .where(and(
        eq(whatsappConnections.provider, "meta"),
        eq(whatsappConnections.providerPhoneNumberId, input.phoneNumberId),
      ))
      .limit(1);

    if (persisted) {
      if (!persisted.wabaId || !input.wabaId || persisted.wabaId !== input.wabaId) {
        return {
          connection: null,
          routingState: "mismatched",
          failureCategory: "waba_mismatch",
        };
      }
      if (!isConnectionLifecycleActiveForIngress(persisted.lifecycleStatus)) {
        return {
          connection: null,
          routingState: "mismatched",
          failureCategory: "inactive_connection",
        };
      }
      return {
        connection: toResolvedConnection(persisted),
        routingState: "resolved",
        failureCategory: null,
      };
    }
  }

  const legacy = buildLegacyEnvConnection();
  if (legacy && legacy.phoneNumberId === input.phoneNumberId) {
    if (!legacy.wabaId || !input.wabaId || legacy.wabaId !== input.wabaId) {
      return {
        connection: null,
        routingState: "mismatched",
        failureCategory: "waba_mismatch",
      };
    }
    return {
      connection: legacy,
      routingState: "legacy_env",
      failureCategory: null,
    };
  }

  return {
    connection: null,
    routingState: "unmapped",
    failureCategory: "unmapped_connection",
  };
}

/**
 * Phase 1 deliberately preserves the legacy route by default. A persisted
 * record can only become sendable after a later explicit cutover and a
 * connection-specific credential resolver are approved.
 */
export async function resolveOutboundWhatsAppConnection(): Promise<ResolvedOutboundWhatsAppConnection> {
  const legacy = buildLegacyEnvConnection();
  const token = process.env.WHATSAPP_API_TOKEN;

  if (legacy && token && !isWhatsAppPhase1PersistedConnectionCutoverEnabled()) {
    return { ...legacy, accessToken: token };
  }

  if (isWhatsAppPhase1PersistedConnectionCutoverEnabled()) {
    const db = await getDb();
    if (db) {
      const [persisted] = await db
        .select()
        .from(whatsappConnections)
        .where(and(
          eq(whatsappConnections.provider, "meta"),
          eq(whatsappConnections.lifecycleStatus, "connected"),
        ))
        .limit(1);

      if (persisted?.credentialSource === "legacy_env" && isSafeStoredCredentialReference(persisted.credentialRef) && token) {
        return { ...toResolvedConnection(persisted), accessToken: token };
      }
    }
  }

  throw new Error("WhatsApp transport is not configured for an approved connection route");
}
