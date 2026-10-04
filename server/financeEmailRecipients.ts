import {
  resolveAppointmentCommunicationLocale,
  resolveRecipientProfileLanguage,
} from "../shared/appointmentCommunicationLocales";

export type FinanceEmailRecipientSource = "patient" | "partner" | "manual";

export type FinanceEmailRecipientCandidate = {
  source: FinanceEmailRecipientSource;
  email?: string | null;
  displayName: string;
  /** Existing direct profile fact; this helper does not interpret it locally. */
  directProfileLanguage?: string | null;
  /** Existing Lead fact for this exact converted Patient or Partner, if any. */
  convertedLeadProfileLanguage?: string | null;
  /** A manual recipient inherits the already-resolved Patient delivery locale. */
  inheritLanguageFrom?: "patient";
};

export type ResolvedFinanceEmailRecipient = {
  source: FinanceEmailRecipientSource;
  email: string;
  displayName: string;
  profileLanguage: string | null;
  deliveredLocale: string;
  localeFallbackUsed: boolean;
  localeFallbackFrom: string | null;
  /** @deprecated Use deliveredLocale. Retained during this narrow wiring update. */
  preferredLanguage: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeFinanceEmailAddress(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized && normalized.length <= 320 && EMAIL_PATTERN.test(normalized) ? normalized : null;
}

export function resolveFinanceEmailRecipients(
  candidates: FinanceEmailRecipientCandidate[],
): ResolvedFinanceEmailRecipient[] {
  const languageBySource = new Map<FinanceEmailRecipientSource, {
    profileLanguage: string | null;
    deliveredLocale: string;
    fallbackUsed: boolean;
  }>();
  for (const candidate of candidates) {
    if (candidate.inheritLanguageFrom) continue;
    const profileLanguage = resolveRecipientProfileLanguage(
      candidate.directProfileLanguage,
      candidate.convertedLeadProfileLanguage,
    );
    const locale = resolveAppointmentCommunicationLocale(profileLanguage);
    languageBySource.set(candidate.source, {
      profileLanguage,
      deliveredLocale: locale.deliveredLocale,
      fallbackUsed: locale.fallbackUsed,
    });
  }

  const recipientsByEmail = new Map<string, ResolvedFinanceEmailRecipient>();
  for (const candidate of candidates) {
    const email = normalizeFinanceEmailAddress(candidate.email);
    if (!email || recipientsByEmail.has(email)) continue;
    const resolved = candidate.inheritLanguageFrom
      ? languageBySource.get(candidate.inheritLanguageFrom)
      : languageBySource.get(candidate.source);
    const profileLanguage = resolved?.profileLanguage ?? null;
    const deliveredLocale = resolved?.deliveredLocale ?? "en";
    const fallbackUsed = resolved?.fallbackUsed ?? false;
    recipientsByEmail.set(email, {
      source: candidate.source,
      email,
      displayName: candidate.displayName,
      profileLanguage,
      deliveredLocale,
      localeFallbackUsed: fallbackUsed,
      localeFallbackFrom: fallbackUsed ? profileLanguage : null,
      preferredLanguage: deliveredLocale,
    });
  }
  return Array.from(recipientsByEmail.values());
}
