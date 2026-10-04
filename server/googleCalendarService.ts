import { createHash, randomBytes } from "node:crypto";
import {
  clearGoogleCalendarTestEvent,
  deleteGoogleCalendarConnection,
  ensureGoogleCalendarAppointmentSync,
  getGoogleCalendarAppointmentForSync,
  getGoogleCalendarAppointmentSync,
  getGoogleCalendarOperationalHealth,
  getGoogleCalendarConnection,
  listEligibleUnmappedFutureGoogleCalendarAppointments,
  listRetryableGoogleCalendarAppointmentSyncs,
  logAppointmentActivity,
  markGoogleCalendarAppointmentEventVerified,
  markGoogleCalendarAppointmentSyncFailure,
  markGoogleCalendarAppointmentSyncSucceeded,
  markGoogleCalendarConnection,
  saveGoogleCalendarConnection,
  setGoogleCalendarAppointmentSyncDestination,
  setGoogleCalendarAppointmentSyncEventId,
  setGoogleCalendarAppointmentSyncPending,
  setGoogleCalendarDestination,
  setGoogleCalendarTestEvent,
  clearGoogleCalendarAppointmentEventReadiness,
  updateAppointment,
} from "./db";
import { ENV } from "./_core/env";
import { decryptGoogleRefreshToken, encryptGoogleRefreshToken } from "./googleCalendarCrypto";
import { resolvePhysicalAppointmentLocation } from "../shared/appointmentPhysicalLocation";
import { canUseMeetingLinkActions } from "../shared/appointmentMeetingLinkLifecycle";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const BUSINESS_TIMEZONE = "Europe/Istanbul";
const TEST_EVENT_TITLE = "Fertiliv Google Calendar Integration Test";

// `email` and `openid` are used solely to display the dynamically authenticated
// Google account. The Calendar scopes remain limited to calendar-list reading
// and events on calendars owned by that connected account.
export const GOOGLE_CALENDAR_G1_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.owned",
] as const;

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    readonly needsReconnection = false,
    readonly retryable = false,
    readonly status?: number,
    readonly providerReason?: string,
  ) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

export type GoogleCalendarOption = { id: string; name: string; isPrimary: boolean };

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
};

type GoogleCalendarListResponse = {
  items?: Array<{ id?: string; summary?: string; primary?: boolean; accessRole?: string }>;
  nextPageToken?: string;
};

type GoogleEventResponse = {
  id?: string;
  htmlLink?: string;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
    createRequest?: { status?: { statusCode?: string } };
  };
};
type GoogleErrorResponse = { error?: { message?: string; errors?: Array<{ reason?: string }> } };

function assertGoogleConfiguration(): void {
  if (!ENV.googleOAuthClientId || !ENV.googleOAuthClientSecret || !ENV.googleOAuthRedirectUri || !ENV.googleOAuthTokenEncryptionKey) {
    throw new GoogleCalendarError("Google Calendar integration is not configured. Ask an administrator to complete the secure Google configuration.");
  }
}

function getSafeGoogleFailureMessage(status: number, payload?: GoogleErrorResponse): GoogleCalendarError {
  const providerReason = payload?.error?.errors?.[0]?.reason;
  const transient403Reasons = new Set(["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded", "backendError"]);
  if (status === 403 && providerReason && transient403Reasons.has(providerReason)) {
    return new GoogleCalendarError("Google Calendar is temporarily rate-limited. Please retry manually in a moment.", false, true, status, providerReason);
  }
  if (status === 401 || status === 403) {
    return new GoogleCalendarError("Google Calendar authorization needs to be reconnected.", true, false, status, providerReason);
  }
  if (status === 404) {
    return new GoogleCalendarError("The selected Google Calendar is no longer available. Refresh the calendar list and select a clinic-owned calendar.", false, false, status, providerReason);
  }
  if (status === 429) {
    return new GoogleCalendarError("Google Calendar is temporarily rate-limited. Please retry manually in a moment.", false, true, status, providerReason);
  }
  return new GoogleCalendarError("Google Calendar could not complete this request. Please retry manually.", false, status >= 500, status, providerReason);
}

function localIstanbulDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
}

/**
 * Appointment timestamps are canonical UTC instants. Serialize the actual
 * Europe/Istanbul wall clock for Google alongside the explicit event timezone.
 * This must match the time staff see in Fertiliv and avoid sending the UTC
 * storage hour as though it were an Istanbul local hour.
 */
function appointmentIstanbulWallClock(date: Date): string {
  return localIstanbulDateTime(date);
}

export function buildGoogleCalendarTestEvent(start: Date): Record<string, unknown> {
  const end = new Date(start.getTime() + 15 * 60 * 1000);
  return {
    summary: TEST_EVENT_TITLE,
    description: "Fertiliv integration verification event. No personal or clinical content is included.",
    start: { dateTime: localIstanbulDateTime(start), timeZone: BUSINESS_TIMEZONE },
    end: { dateTime: localIstanbulDateTime(end), timeZone: BUSINESS_TIMEZONE },
    visibility: "private",
    transparency: "transparent",
    extendedProperties: { private: { "fertiliv.integration": "g1-test" } },
  };
}

export function hashGoogleOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function createGoogleOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function buildGoogleAuthorizationUrl(state: string): string {
  assertGoogleConfiguration();
  const params = new URLSearchParams({
    client_id: ENV.googleOAuthClientId,
    redirect_uri: ENV.googleOAuthRedirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_G1_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTHORIZATION_ENDPOINT}?${params.toString()}`;
}

async function postGoogleForm(url: string, form: Record<string, string>): Promise<GoogleTokenResponse> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new GoogleCalendarError("Google Calendar could not be reached. Please retry manually.", false, true);
  }

  const payload = await response.json().catch(() => ({})) as GoogleTokenResponse;
  if (!response.ok) throw getSafeGoogleFailureMessage(response.status, payload as GoogleErrorResponse);
  return payload;
}

async function fetchGoogleJson<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new GoogleCalendarError("Google Calendar could not be reached. Please retry manually.", false, true);
  }
  if (response.status === 204) return {} as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw getSafeGoogleFailureMessage(response.status, payload as GoogleErrorResponse);
  return payload as T;
}

async function getGoogleAccessToken(options?: { allowNeedsAttention?: boolean }): Promise<string> {
  const connection = await getGoogleCalendarConnection();
  if (!connection) throw new GoogleCalendarError("Google Calendar is not connected.");
  if (connection.status === "needs_attention" && !options?.allowNeedsAttention) {
    throw new GoogleCalendarError("Google Calendar authorization needs to be reconnected.", true);
  }

  let refreshToken: string;
  try {
    refreshToken = decryptGoogleRefreshToken(connection.encryptedRefreshToken);
  } catch {
    throw new GoogleCalendarError("Google Calendar authorization needs to be reconnected.", true, false, undefined, "credential_decryption_failure");
  }
  const token = await postGoogleForm(GOOGLE_TOKEN_ENDPOINT, {
    client_id: ENV.googleOAuthClientId,
    client_secret: ENV.googleOAuthClientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  if (!token.access_token) throw new GoogleCalendarError("Google Calendar authorization needs to be reconnected.", true);
  return token.access_token;
}

async function withGoogleAuthorization<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof GoogleCalendarError && error.needsReconnection) {
      await markGoogleCalendarConnection({ status: "needs_attention", lastError: error.message });
    }
    throw error;
  }
}

export async function exchangeAndSaveGoogleAuthorization(code: string, adminUserId: number): Promise<void> {
  assertGoogleConfiguration();
  const token = await postGoogleForm(GOOGLE_TOKEN_ENDPOINT, {
    code,
    client_id: ENV.googleOAuthClientId,
    client_secret: ENV.googleOAuthClientSecret,
    redirect_uri: ENV.googleOAuthRedirectUri,
    grant_type: "authorization_code",
  });
  if (!token.access_token || !token.refresh_token) {
    throw new GoogleCalendarError("Google did not grant persistent Calendar access. Reconnect and approve the requested permissions.");
  }

  const profile = await fetchGoogleJson<{ email?: string; email_verified?: boolean }>(GOOGLE_USERINFO_ENDPOINT, token.access_token);
  if (!profile.email || profile.email_verified === false) {
    throw new GoogleCalendarError("Google did not provide a verified account identity. Reconnect and approve the requested identity permission.");
  }

  await saveGoogleCalendarConnection({
    connectedAccountEmail: profile.email,
    encryptedRefreshToken: encryptGoogleRefreshToken(token.refresh_token),
    connectedByUserId: adminUserId,
  });
}

export async function listOwnedGoogleCalendars(options?: { allowNeedsAttention?: boolean }): Promise<GoogleCalendarOption[]> {
  return withGoogleAuthorization(async () => {
    const accessToken = await getGoogleAccessToken(options);
    const calendars: GoogleCalendarOption[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({ minAccessRole: "owner", maxResults: "250" });
      if (pageToken) query.set("pageToken", pageToken);
      const payload = await fetchGoogleJson<GoogleCalendarListResponse>(`${GOOGLE_CALENDAR_API}/users/me/calendarList?${query.toString()}`, accessToken);
      for (const calendar of payload.items ?? []) {
        if (calendar.id && calendar.summary && calendar.accessRole === "owner") {
          calendars.push({ id: calendar.id, name: calendar.summary, isPrimary: calendar.primary === true });
        }
      }
      pageToken = payload.nextPageToken;
    } while (pageToken);
    return calendars.sort((left, right) => left.name.localeCompare(right.name));
  });
}

export async function selectGoogleCalendarDestination(input: { calendarId: string; userId: number }): Promise<void> {
  const ownedCalendars = await listOwnedGoogleCalendars();
  const selected = ownedCalendars.find(calendar => calendar.id === input.calendarId);
  if (!selected) {
    throw new GoogleCalendarError("Select a calendar owned by the connected Google account.");
  }
  await setGoogleCalendarDestination({ calendarId: selected.id, calendarName: selected.name, userId: input.userId });
}

export async function executeGoogleCalendarTestEventLifecycle(input: {
  persistedEventId: string | null;
  create: () => Promise<string>;
  update: (eventId: string) => Promise<void>;
  delete: (eventId: string) => Promise<void>;
  persist: (eventId: string) => Promise<void>;
  clear: () => Promise<void>;
}): Promise<void> {
  let eventId = input.persistedEventId;
  if (!eventId) {
    eventId = await input.create();
    await input.persist(eventId);
  }
  await input.update(eventId);
  await input.delete(eventId);
  await input.clear();
}

async function getConfiguredGoogleDestination() {
  const connection = await getGoogleCalendarConnection();
  if (!connection?.destinationCalendarId) {
    throw new GoogleCalendarError("Select a clinic-owned destination calendar before testing the connection.");
  }
  return connection;
}

export async function runGoogleCalendarTestLifecycle(): Promise<void> {
  await withGoogleAuthorization(async () => {
    const connection = await getConfiguredGoogleDestination();
    const accessToken = await getGoogleAccessToken({ allowNeedsAttention: true });
    const ownedCalendars = await listOwnedGoogleCalendars({ allowNeedsAttention: true });
    const calendarId = connection.destinationCalendarId;
    if (!calendarId) {
      throw new GoogleCalendarError("Select a clinic-owned destination calendar before testing the connection.");
    }
    if (!ownedCalendars.some(calendar => calendar.id === calendarId)) {
      throw new GoogleCalendarError("The selected Google Calendar is no longer owned by the connected account. Refresh and select a valid clinic calendar.");
    }

    let persistedEventId = connection.testEventId && connection.testEventCalendarId === calendarId ? connection.testEventId : null;
    const eventBody = buildGoogleCalendarTestEvent(new Date(Date.now() + 10 * 60 * 1000));
    const update = async (eventId: string) => {
      await fetchGoogleJson<GoogleEventResponse>(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`, accessToken, {
        method: "PUT",
        body: JSON.stringify({ ...eventBody, description: "Fertiliv integration verification event updated. No personal or clinical content is included." }),
      });
    };
    try {
      await executeGoogleCalendarTestEventLifecycle({
        persistedEventId,
        create: async () => {
          const created = await fetchGoogleJson<GoogleEventResponse>(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`, accessToken, {
            method: "POST",
            body: JSON.stringify(eventBody),
          });
          if (!created.id) throw new GoogleCalendarError("Google Calendar did not return a test-event identity.");
          return created.id;
        },
        update,
        delete: eventId => fetchGoogleJson<void>(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`, accessToken, { method: "DELETE" }),
        persist: eventId => setGoogleCalendarTestEvent(eventId, calendarId),
        clear: () => clearGoogleCalendarTestEvent(),
      });
    } catch (error) {
      // A prior test event may have been removed manually. Clear only its local
      // reference; a manual retry then creates a fresh non-clinical test event.
      if (persistedEventId && error instanceof GoogleCalendarError && error.message === "The selected Google Calendar is no longer available. Refresh the calendar list and select a clinic-owned calendar.") {
        await clearGoogleCalendarTestEvent();
        persistedEventId = null;
      }
      throw error;
    }
    await markGoogleCalendarConnection({ status: "connected", lastError: null, validatedAt: new Date() });
  });
}

const G2_TIMEZONE = "Europe/Istanbul";
const G2_RETRY_DELAYS_MS = [5, 15, 30, 60, 240].map(minutes => minutes * 60_000);

type GoogleCalendarAppointmentSource = NonNullable<Awaited<ReturnType<typeof getGoogleCalendarAppointmentForSync>>>;

function isGoogleCalendarEligibleStatus(status: string): boolean {
  return status === "upcoming" || status === "confirmed";
}

function eventSummaryForAppointment(source: GoogleCalendarAppointmentSource): string {
  const base = `${source.relatedEntityDisplayName} — ${source.shortAppointmentLabel}`;
  if (source.status === "cancelled") return `Cancelled — ${base}`;
  if (source.status === "no_show") return `No Show — ${base}`;
  return base;
}

function eventLocationForAppointment(source: GoogleCalendarAppointmentSource): string | undefined {
  return resolvePhysicalAppointmentLocation(source) ?? undefined;
}

function eventDescriptionForAppointment(source: GoogleCalendarAppointmentSource): string {
  const lines = ["Fertiliv appointment"];
  if (source.code) lines.push(`Reference: ${source.code}`);
  if (source.relatedEntityType) lines.push(`Record: ${source.relatedEntityType === "patient" ? "Patient" : "Lead"}`);
  if (source.doctorName) lines.push(`Doctor: Dr. ${source.doctorName}`);
  else if (source.hostUserName) lines.push(`Host: ${source.hostUserName}`);
  if (source.appointmentType) lines.push(`Mode: ${source.appointmentType}`);
  if (source.appointmentType === "online" && source.meetingLink) lines.push(`Join link: ${source.meetingLink}`);
  if (source.appointmentType === "external" && source.partnerClinicGoogleMapsUrl) lines.push(`Map: ${source.partnerClinicGoogleMapsUrl}`);
  return lines.join("\n");
}

export function buildGoogleCalendarAppointmentEvent(source: GoogleCalendarAppointmentSource): Record<string, unknown> {
  const start = new Date(source.appointmentDate);
  const end = source.endDate
    ? new Date(source.endDate)
    : new Date(start.getTime() + (source.duration ?? 30) * 60_000);
  const googleReminderMode = source.googleReminderMode === "custom" ? "custom" : "calendar_default";
  return {
    summary: eventSummaryForAppointment(source),
    description: eventDescriptionForAppointment(source),
    location: eventLocationForAppointment(source),
    start: { dateTime: appointmentIstanbulWallClock(start), timeZone: G2_TIMEZONE },
    end: { dateTime: appointmentIstanbulWallClock(end), timeZone: G2_TIMEZONE },
    visibility: "private",
    reminders: googleReminderMode === "custom"
      ? {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 1440 },
            { method: "popup", minutes: 120 },
          ],
        }
      : { useDefault: true },
    extendedProperties: { private: { "fertiliv.appointment": String(source.id), "fertiliv.g2": "1" } },
  };
}

function hashGoogleCalendarAppointmentEvent(event: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(event)).digest("hex");
}

function nextGoogleCalendarRetryAt(currentRetryCount: number): Date {
  const delay = G2_RETRY_DELAYS_MS[Math.min(currentRetryCount, G2_RETRY_DELAYS_MS.length - 1)] ?? G2_RETRY_DELAYS_MS.at(-1)!;
  return new Date(Date.now() + delay);
}

function toGoogleCalendarSyncFailure(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof GoogleCalendarError) {
    return { message: error.message, retryable: error.retryable };
  }
  return { message: "Google Calendar synchronization could not complete. Please retry manually.", retryable: true };
}

async function getG2DestinationCalendarId(): Promise<string | null> {
  const connection = await getGoogleCalendarConnection();
  if (!connection || connection.status === "needs_attention" || !connection.destinationCalendarId) return null;
  return connection.destinationCalendarId;
}

async function findGoogleCalendarAppointmentEventId(input: {
  calendarId: string;
  appointmentId: number;
  accessToken: string;
}): Promise<string | null> {
  const query = new URLSearchParams({
    privateExtendedProperty: `fertiliv.appointment=${input.appointmentId}`,
    maxResults: "2",
  });
  const payload = await fetchGoogleJson<GoogleCalendarListResponse>(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(input.calendarId)}/events?${query.toString()}`,
    input.accessToken,
  );
  return payload.items?.find(item => item.id)?.id ?? null;
}

async function putOrInsertGoogleCalendarAppointmentEvent(input: {
  calendarId: string;
  eventId: string | null;
  event: Record<string, unknown>;
  accessToken: string;
}): Promise<string> {
  let eventId = input.eventId ?? await findGoogleCalendarAppointmentEventId({
    calendarId: input.calendarId,
    appointmentId: Number((input.event.extendedProperties as any)?.private?.["fertiliv.appointment"]),
    accessToken: input.accessToken,
  });

  if (eventId) {
    const url = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`;
    try {
      await fetchGoogleJson<GoogleEventResponse>(url, input.accessToken, { method: "PATCH", body: JSON.stringify(input.event) });
      return eventId;
    } catch (error) {
      if (!(error instanceof GoogleCalendarError) || error.status !== 404) throw error;
      eventId = null;
    }
  }

  const created = await fetchGoogleJson<GoogleEventResponse>(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(input.calendarId)}/events?sendUpdates=none`, input.accessToken, {
    method: "POST",
    body: JSON.stringify(input.event),
  });
  if (!created.id) throw new GoogleCalendarError("Google Calendar did not return an event identity.", false, true);
  return created.id;
}

function meetingUriFromEvent(event: GoogleEventResponse): string | null {
  return event.conferenceData?.entryPoints?.find(entry => entry.entryPointType === "video" && entry.uri)?.uri ?? null;
}

export type GoogleConferenceClearExperimentResult = {
  requestShape: { method: "PATCH"; query: "conferenceDataVersion=1&sendUpdates=none"; body: { conferenceData: null } };
  before: { hasConferenceData: boolean; eventIdMatchesMapping: boolean; hasHtmlLink: boolean };
  after?: { hasConferenceData: boolean; eventIdMatchesMapping: boolean; htmlLinkPreserved: boolean };
  outcome: "cleared" | "retained" | "error";
  error?: { status: number | null; providerReason: string | null; message: string };
};

/**
 * User-approved, QA-only experiment. It mutates only the explicitly supplied
 * mapped event and exposes no identifiers, URLs, payload text, or credentials.
 */
export async function runGoogleConferenceClearExperiment(input: {
  appointmentId: number;
  expectedAppointmentCode: string;
}): Promise<GoogleConferenceClearExperimentResult> {
  const source = await getGoogleCalendarAppointmentForSync(input.appointmentId);
  if (!source || source.code !== input.expectedAppointmentCode) {
    throw new GoogleCalendarError("The approved QA appointment could not be verified.");
  }
  const mapping = await getGoogleCalendarAppointmentSync(input.appointmentId);
  if (!mapping?.googleCalendarId || !mapping.googleEventId || mapping.syncStatus !== "synced") {
    throw new GoogleCalendarError("The approved QA appointment does not have a successful mapped Google event.");
  }
  const requestShape = { method: "PATCH" as const, query: "conferenceDataVersion=1&sendUpdates=none" as const, body: { conferenceData: null } };
  try {
    return await withGoogleAuthorization(async () => {
      const accessToken = await getGoogleAccessToken();
      const eventUrl = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(mapping.googleCalendarId!)}/events/${encodeURIComponent(mapping.googleEventId!)}?conferenceDataVersion=1`;
      const before = await fetchGoogleJson<GoogleEventResponse>(eventUrl, accessToken);
      const patched = await fetchGoogleJson<GoogleEventResponse>(`${eventUrl}&sendUpdates=none`, accessToken, {
        method: "PATCH",
        body: JSON.stringify(requestShape.body),
      });
      const after = await fetchGoogleJson<GoogleEventResponse>(eventUrl, accessToken);
      const hasConferenceData = Boolean(after.conferenceData?.entryPoints?.length || after.conferenceData?.createRequest);
      return {
        requestShape,
        before: {
          hasConferenceData: Boolean(before.conferenceData?.entryPoints?.length || before.conferenceData?.createRequest),
          eventIdMatchesMapping: before.id === mapping.googleEventId,
          hasHtmlLink: Boolean(before.htmlLink),
        },
        after: {
          hasConferenceData,
          eventIdMatchesMapping: patched.id === mapping.googleEventId && after.id === mapping.googleEventId,
          htmlLinkPreserved: Boolean(before.htmlLink && after.htmlLink && before.htmlLink === after.htmlLink),
        },
        outcome: hasConferenceData ? "retained" : "cleared",
      };
    });
  } catch (error) {
    const failure = error instanceof GoogleCalendarError
      ? { status: error.status ?? null, providerReason: error.providerReason ?? null, message: error.message }
      : { status: null, providerReason: null, message: "Google Calendar conference-clear experiment could not complete." };
    return { requestShape, before: { hasConferenceData: false, eventIdMatchesMapping: false, hasHtmlLink: false }, outcome: "error", error: failure };
  }
}

export async function clearGoogleCalendarAppointmentConference(appointmentId: number): Promise<{
  status: "cleared" | "skipped" | "failed";
  message?: string;
}> {
  const mapping = await getGoogleCalendarAppointmentSync(appointmentId);
  if (!mapping?.googleCalendarId || !mapping.googleEventId || mapping.syncStatus !== "synced") {
    return { status: "skipped", message: "No successful mapped Google event is available." };
  }
  try {
    return await withGoogleAuthorization(async () => {
      const accessToken = await getGoogleAccessToken();
      const eventUrl = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(mapping.googleCalendarId!)}/events/${encodeURIComponent(mapping.googleEventId!)}?conferenceDataVersion=1`;
      await fetchGoogleJson<GoogleEventResponse>(`${eventUrl}&sendUpdates=none`, accessToken, {
        method: "PATCH",
        body: JSON.stringify({ conferenceData: null }),
      });
      const verified = await fetchGoogleJson<GoogleEventResponse>(eventUrl, accessToken);
      const conferenceRemains = Boolean(verified.conferenceData?.entryPoints?.length || verified.conferenceData?.createRequest);
      if (conferenceRemains) return { status: "failed", message: "Google Calendar retained the conference data." };
      return { status: "cleared" };
    });
  } catch (error) {
    const failure = toGoogleCalendarSyncFailure(error);
    return { status: "failed", message: failure.message };
  }
}

export async function generateGoogleCalendarAppointmentMeet(appointmentId: number): Promise<{
  status: "generated" | "pending" | "skipped" | "failed";
  meetingLink?: string;
  message?: string;
}> {
  const source = await getGoogleCalendarAppointmentForSync(appointmentId);
  if (!source) return { status: "skipped", message: "Appointment no longer exists." };
  if (!canUseMeetingLinkActions(source.status)) return { status: "skipped", message: "Google Meet cannot be generated for a cancelled appointment." };
  if (source.appointmentType !== "online") return { status: "skipped", message: "Google Meet is available for online appointments only." };
  if (source.meetingLink?.trim()) return { status: "skipped", meetingLink: source.meetingLink, message: "This appointment already has a meeting link." };

  const sync = await syncGoogleCalendarAppointment(appointmentId, true);
  if (sync.status !== "synced") return { status: "failed", message: sync.message ?? "Google Calendar synchronization could not complete." };
  const mapping = await getGoogleCalendarAppointmentSync(appointmentId);
  if (!mapping?.googleCalendarId || !mapping.googleEventId) {
    return { status: "failed", message: "The Google Calendar event mapping is unavailable." };
  }

  try {
    return await withGoogleAuthorization(async () => {
      const accessToken = await getGoogleAccessToken();
      const eventUrl = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(mapping.googleCalendarId!)}/events/${encodeURIComponent(mapping.googleEventId!)}?conferenceDataVersion=1`;
      const current = await fetchGoogleJson<GoogleEventResponse>(eventUrl, accessToken);
      const existingMeetingLink = meetingUriFromEvent(current);
      if (existingMeetingLink) {
        await updateAppointment(appointmentId, { meetingLink: existingMeetingLink } as any);
        await syncGoogleCalendarAppointment(appointmentId, false);
        return { status: "generated", meetingLink: existingMeetingLink };
      }

      const requestId = `fertiliv-${appointmentId}-${mapping.googleEventId}`.slice(0, 100);
      const created = await fetchGoogleJson<GoogleEventResponse>(
        `${eventUrl}&sendUpdates=none`,
        accessToken,
        {
          method: "PATCH",
          body: JSON.stringify({
            conferenceData: {
              createRequest: {
                requestId,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
          }),
        },
      );
      const meetingLink = meetingUriFromEvent(created);
      if (!meetingLink) {
        return { status: "pending", message: "Google Meet is being prepared. Retry in a moment to retrieve the same conference." };
      }
      await updateAppointment(appointmentId, { meetingLink } as any);
      const synced = await syncGoogleCalendarAppointment(appointmentId, false);
      if (synced.status !== "synced") return { status: "failed", message: synced.message ?? "Google Meet was created but the appointment could not be refreshed." };
      return { status: "generated", meetingLink };
    });
  } catch (error) {
    const failure = toGoogleCalendarSyncFailure(error);
    return { status: "failed", message: failure.message };
  }
}

export async function syncGoogleCalendarAppointment(appointmentId: number, allowCreateMapping: boolean): Promise<{
  status: "synced" | "failed" | "skipped";
  message?: string;
  didSync?: boolean;
}> {
  const source = await getGoogleCalendarAppointmentForSync(appointmentId);
  if (!source) return { status: "skipped", message: "Appointment no longer exists." };
  let mapping = await getGoogleCalendarAppointmentSync(appointmentId);
  if (!mapping && !isGoogleCalendarEligibleStatus(source.status)) {
    return { status: "skipped", message: "Appointment is not eligible for initial Google synchronization." };
  }

  const event = buildGoogleCalendarAppointmentEvent(source);
  const payloadHash = hashGoogleCalendarAppointmentEvent(event);
  if (!mapping) {
    if (!allowCreateMapping) return { status: "skipped", message: "No Google mapping exists for this appointment." };
    const destinationCalendarId = await getG2DestinationCalendarId();
    mapping = await ensureGoogleCalendarAppointmentSync({ appointmentId, googleCalendarId: destinationCalendarId, payloadHash });
  }

  if (mapping.syncStatus === "synced" && mapping.operation === "upsert" && mapping.payloadHash === payloadHash) {
    return { status: "synced", didSync: false };
  }

  let calendarId = mapping.googleCalendarId;
  if (!calendarId) {
    const configuredDestination = await getG2DestinationCalendarId();
    if (configuredDestination) {
      await setGoogleCalendarAppointmentSyncDestination(appointmentId, configuredDestination);
      calendarId = configuredDestination;
    }
  }

  if (!calendarId) {
    await markGoogleCalendarAppointmentSyncFailure({
      appointmentId,
      operation: "upsert",
      safeError: "Google Calendar is not connected or no clinic destination calendar is selected.",
      retryable: false,
      nextRetryAt: null,
    });
    return { status: "failed", message: "Google Calendar is not connected or no clinic destination calendar is selected." };
  }

  await setGoogleCalendarAppointmentSyncPending({ appointmentId, operation: "upsert", payloadHash });
  try {
    await withGoogleAuthorization(async () => {
      const accessToken = await getGoogleAccessToken();
      const googleEventId = await putOrInsertGoogleCalendarAppointmentEvent({ calendarId, eventId: mapping!.googleEventId, event, accessToken });
      await setGoogleCalendarAppointmentSyncEventId(appointmentId, googleEventId);
    });
    await markGoogleCalendarAppointmentSyncSucceeded({ appointmentId, payloadHash });
    return { status: "synced", didSync: true };
  } catch (error) {
    const failure = toGoogleCalendarSyncFailure(error);
    console.warn("[GoogleCalendarG2] outbound sync failed", {
      appointmentId,
      status: error instanceof GoogleCalendarError ? error.status ?? null : null,
      providerReason: error instanceof GoogleCalendarError ? error.providerReason ?? null : null,
      retryable: failure.retryable,
    });
    await markGoogleCalendarAppointmentSyncFailure({
      appointmentId,
      operation: "upsert",
      safeError: failure.message,
      retryable: failure.retryable,
      nextRetryAt: failure.retryable ? nextGoogleCalendarRetryAt(mapping.retryCount) : null,
    });
    return { status: "failed", message: failure.message };
  }
}

export async function deleteGoogleCalendarAppointmentEvent(appointmentId: number): Promise<{
  status: "deleted" | "failed" | "skipped";
  message?: string;
}> {
  const mapping = await getGoogleCalendarAppointmentSync(appointmentId);
  if (!mapping || mapping.syncStatus === "deleted") return { status: "skipped" };
  if (!mapping.googleCalendarId) return { status: "skipped" };
  await setGoogleCalendarAppointmentSyncPending({ appointmentId, operation: "delete" });
  try {
    await withGoogleAuthorization(async () => {
      const accessToken = await getGoogleAccessToken();
      const eventId = mapping.googleEventId ?? await findGoogleCalendarAppointmentEventId({ calendarId: mapping.googleCalendarId!, appointmentId, accessToken });
      if (!eventId) return;
      await setGoogleCalendarAppointmentSyncEventId(appointmentId, eventId);
      try {
        await fetchGoogleJson<void>(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(mapping.googleCalendarId!)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`, accessToken, { method: "DELETE" });
      } catch (error) {
        // A manually removed event already satisfies the requested external deletion.
        if (!(error instanceof GoogleCalendarError) || error.status !== 404) throw error;
      }
    });
    await markGoogleCalendarAppointmentSyncSucceeded({ appointmentId, deleted: true });
    return { status: "deleted" };
  } catch (error) {
    const failure = toGoogleCalendarSyncFailure(error);
    await markGoogleCalendarAppointmentSyncFailure({
      appointmentId,
      operation: "delete",
      safeError: failure.message,
      retryable: failure.retryable,
      nextRetryAt: failure.retryable ? nextGoogleCalendarRetryAt(mapping.retryCount) : null,
    });
    return { status: "failed", message: failure.message };
  }
}

export async function retryGoogleCalendarAppointmentSync(appointmentId: number) {
  const mapping = await getGoogleCalendarAppointmentSync(appointmentId);
  if (!mapping) return { status: "skipped" as const, message: "No Google sync mapping exists for this appointment." };
  return mapping.operation === "delete"
    ? deleteGoogleCalendarAppointmentEvent(appointmentId)
    : syncGoogleCalendarAppointment(appointmentId, false);
}

export async function retryPendingGoogleCalendarAppointmentSyncs(limit = 20) {
  const mappings = await listRetryableGoogleCalendarAppointmentSyncs(new Date(), limit);
  const results: Array<{ appointmentId: number; status: string }> = [];
  for (const mapping of mappings) {
    const result = await retryGoogleCalendarAppointmentSync(mapping.appointmentId);
    results.push({ appointmentId: mapping.appointmentId, status: result.status });
  }
  return { processed: mappings.length, results };
}

export const GOOGLE_CALENDAR_BACKFILL_BATCH_LIMIT = 25;

/** Read-only inventory for the controlled, future-only Google Calendar backfill. */
export async function previewGoogleCalendarBackfill(now = new Date()) {
  const appointments = await listEligibleUnmappedFutureGoogleCalendarAppointments(now, GOOGLE_CALENDAR_BACKFILL_BATCH_LIMIT);
  return {
    count: appointments.length,
    appointments: appointments.map(appointment => ({
      id: appointment.id,
      code: appointment.code,
      status: appointment.status,
      appointmentDate: appointment.appointmentDate,
      recordType: appointment.patientId ? "patient" as const : "lead" as const,
    })),
  };
}

/**
 * Executes at most one small controlled batch. Eligibility is re-evaluated when
 * the administrator confirms, so a newly mapped appointment is skipped rather
 * than creating a duplicate Google event.
 */
export async function executeGoogleCalendarBackfill(userId: number) {
  const connection = await getGoogleCalendarConnection();
  if (!connection || connection.status !== "connected" || !connection.destinationCalendarId) {
    throw new GoogleCalendarError("Connect Google Calendar and select the clinic destination calendar before running the backfill.");
  }

  const eligible = await listEligibleUnmappedFutureGoogleCalendarAppointments(new Date(), GOOGLE_CALENDAR_BACKFILL_BATCH_LIMIT);
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const appointment of eligible) {
    const result = await syncGoogleCalendarAppointment(appointment.id, true);
    if (result.status === "synced" && result.didSync !== false) {
      succeeded += 1;
      await logAppointmentActivity(appointment.id, userId, "google_calendar_backfill_synced", "Controlled future-only backfill", "Google Calendar event synchronized").catch(() => undefined);
    } else if (result.status === "failed") {
      failed += 1;
      await logAppointmentActivity(appointment.id, userId, "google_calendar_backfill_failed", "Controlled future-only backfill", "Google Calendar synchronization failed").catch(() => undefined);
    } else {
      skipped += 1;
    }
  }

  return { attempted: eligible.length, succeeded, failed, skipped, batchLimit: GOOGLE_CALENDAR_BACKFILL_BATCH_LIMIT };
}

/**
 * Resolves the Google-provided browser URL only for an exact successful G2
 * mapping. The event identity always comes from persisted mapping fields, never
 * from appointment title or other mutable clinical text.
 */
export async function getGoogleCalendarAppointmentEventLink(appointmentId: number): Promise<string | null> {
  const mapping = await getGoogleCalendarAppointmentSync(appointmentId);
  if (!mapping || mapping.syncStatus !== "synced" || mapping.operation !== "upsert" || !mapping.googleCalendarId || !mapping.googleEventId) {
    return null;
  }
  try {
    return await withGoogleAuthorization(async () => {
      const accessToken = await getGoogleAccessToken();
      const event = await fetchGoogleJson<GoogleEventResponse>(
        `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(mapping.googleCalendarId!)}/events/${encodeURIComponent(mapping.googleEventId!)}`,
        accessToken,
      );
      if (!event.htmlLink) return null;
      const url = new URL(event.htmlLink);
      if (url.protocol !== "https:" || !url.hostname.endsWith("google.com")) return null;
      const verifiedUrl = url.toString();
      await markGoogleCalendarAppointmentEventVerified(appointmentId, verifiedUrl);
      return verifiedUrl;
    });
  } catch (error) {
    if (error instanceof GoogleCalendarError && error.status === 404) {
      await clearGoogleCalendarAppointmentEventReadiness(appointmentId);
      return null;
    }
    throw error;
  }
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const connection = await getGoogleCalendarConnection();
  if (!connection) return;
  try {
    const refreshToken = decryptGoogleRefreshToken(connection.encryptedRefreshToken);
    await fetch(GOOGLE_REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // Local credential removal remains the safety boundary even if remote revocation is unavailable.
  } finally {
    await deleteGoogleCalendarConnection();
  }
}

export async function getGoogleCalendarSafeStatus() {
  const connection = await getGoogleCalendarConnection();
  const health = await getGoogleCalendarOperationalHealth();
  if (!connection) {
    return { connected: false, accountEmail: null, status: "disconnected" as const, destinationCalendar: null, timezone: BUSINESS_TIMEZONE, lastError: null, health };
  }
  return {
    connected: true,
    accountEmail: connection.connectedAccountEmail,
    status: connection.status,
    destinationCalendar: connection.destinationCalendarId ? { id: connection.destinationCalendarId, name: connection.destinationCalendarName ?? connection.destinationCalendarId } : null,
    timezone: connection.businessTimezone,
    lastError: connection.lastError,
    health,
  };
}
