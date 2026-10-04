import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  clearGoogleCalendarTestEvent: vi.fn(),
  deleteGoogleCalendarConnection: vi.fn(),
  ensureGoogleCalendarAppointmentSync: vi.fn(),
  getGoogleCalendarAppointmentForSync: vi.fn(),
  getGoogleCalendarAppointmentSync: vi.fn(),
  getGoogleCalendarOperationalHealth: vi.fn(),
  getGoogleCalendarConnection: vi.fn(),
  listEligibleUnmappedFutureGoogleCalendarAppointments: vi.fn(),
  listRetryableGoogleCalendarAppointmentSyncs: vi.fn(),
  logAppointmentActivity: vi.fn(),
  markGoogleCalendarAppointmentEventVerified: vi.fn(),
  markGoogleCalendarAppointmentSyncFailure: vi.fn(),
  markGoogleCalendarAppointmentSyncSucceeded: vi.fn(),
  markGoogleCalendarConnection: vi.fn(),
  saveGoogleCalendarConnection: vi.fn(),
  setGoogleCalendarAppointmentSyncDestination: vi.fn(),
  setGoogleCalendarAppointmentSyncEventId: vi.fn(),
  setGoogleCalendarAppointmentSyncPending: vi.fn(),
  setGoogleCalendarDestination: vi.fn(),
  setGoogleCalendarTestEvent: vi.fn(),
  clearGoogleCalendarAppointmentEventReadiness: vi.fn(),
  updateAppointment: vi.fn(),
}));

vi.mock("./db", () => dbMocks);
vi.mock("./googleCalendarCrypto", () => ({
  decryptGoogleRefreshToken: () => "test-refresh-token",
  encryptGoogleRefreshToken: () => "v1.test-encrypted-token",
}));

import {
  buildGoogleCalendarAppointmentEvent,
  clearGoogleCalendarAppointmentConference,
  deleteGoogleCalendarAppointmentEvent,
  executeGoogleCalendarBackfill,
  generateGoogleCalendarAppointmentMeet,
  getGoogleCalendarAppointmentEventLink,
  previewGoogleCalendarBackfill,
  retryGoogleCalendarAppointmentSync,
  syncGoogleCalendarAppointment,
} from "./googleCalendarService";

const patientSource = {
  id: 71,
  patientId: 450001,
  leadId: 1140001,
  title: "Visit — Lead",
  appointmentDate: new Date("2026-08-18T07:00:00.000Z"),
  endDate: null,
  duration: 45,
  type: "consultation",
  appointmentType: "external",
  googleReminderMode: "calendar_default" as const,
  purpose: "medical-consultation",
  externalLocation: "North Clinic",
  status: "upcoming",
  code: "APT-00071",
  patientFirstName: "Christine",
  patientLastName: "F",
  leadFirstName: "Amna",
  leadLastName: "Arshad",
  doctorName: "Aydin",
  hostUserName: null,
  relatedEntityType: "patient" as const,
  relatedEntityId: 450001,
  relatedEntityDisplayName: "Christine F",
  shortAppointmentLabel: "Medical Consultation",
};

function connectedDestination() {
  return {
    id: 1,
    provider: "google",
    encryptedRefreshToken: "v1.anything",
    status: "connected" as const,
    destinationCalendarId: "clinic-operations@group.calendar.google.com",
    destinationCalendarName: "Fertiliv Clinical Operations",
  };
}

function mapping(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    appointmentId: 71,
    googleCalendarId: "clinic-operations@group.calendar.google.com",
    googleEventId: "g2appt27",
    operation: "upsert" as const,
    syncStatus: "pending" as const,
    payloadHash: null,
    retryCount: 0,
    ...overrides,
  };
}

describe("Google Calendar G2 outbound synchronization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.values(dbMocks).forEach(mock => mock.mockReset());
    dbMocks.getGoogleCalendarConnection.mockResolvedValue(connectedDestination());
    dbMocks.getGoogleCalendarOperationalHealth.mockResolvedValue({ pendingCount: 0, failedCount: 0, lastSuccessfulSyncAt: null });
    dbMocks.getGoogleCalendarAppointmentForSync.mockResolvedValue(patientSource);
    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(null);
    dbMocks.ensureGoogleCalendarAppointmentSync.mockResolvedValue(mapping());
    dbMocks.listEligibleUnmappedFutureGoogleCalendarAppointments.mockResolvedValue([]);
    dbMocks.logAppointmentActivity.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("builds a private Istanbul event with Patient priority and no sensitive appointment content", () => {
    const event = buildGoogleCalendarAppointmentEvent(patientSource);
    const serialized = JSON.stringify(event).toLowerCase();

    expect(event).toMatchObject({
      summary: "Christine F — Medical Consultation",
      location: "North Clinic",
      visibility: "private",
      start: { timeZone: "Europe/Istanbul" },
      end: { timeZone: "Europe/Istanbul" },
    });
    expect(serialized).toContain("doctor: dr. aydin");
    for (const forbidden of ["visit – lead", "amna", "mrn", "phone", "email", "diagnosis", "notes", "finance", "passport"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("uses clinic Calendar Defaults when no Custom Clinic Reminder mode is selected", () => {
    const event = buildGoogleCalendarAppointmentEvent(patientSource);

    expect(event).toMatchObject({
      reminders: { useDefault: true },
      visibility: "private",
    });
    expect((event as Record<string, unknown>).reminders).not.toHaveProperty("overrides");
    expect(event).not.toHaveProperty("attendees");
  });

  it("uses only the approved custom Email 24-hour and Popup 2-hour Clinic Reminder overrides", () => {
    const event = buildGoogleCalendarAppointmentEvent({ ...patientSource, googleReminderMode: "custom" });

    expect(event).toMatchObject({
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 1440 },
          { method: "popup", minutes: 120 },
        ],
      },
      visibility: "private",
    });
    expect(event).not.toHaveProperty("attendees");
  });

  it("projects the online link without a physical location and keeps external partner location", () => {
    const onlineEvent = buildGoogleCalendarAppointmentEvent({
      ...patientSource,
      appointmentType: "online",
      meetingLink: "https://meet.google.com/example-room",
      externalLocation: "Stale external address",
    });
    expect(onlineEvent).toMatchObject({ location: undefined });
    expect(String(onlineEvent.description)).toContain("Join link: https://meet.google.com/example-room");
    expect(String(onlineEvent.description)).not.toContain("Stale external address");

    const externalEvent = buildGoogleCalendarAppointmentEvent({
      ...patientSource,
      appointmentType: "external",
      meetingLink: null,
      externalLocation: "في البيت",
      partnerClinicName: "Partner Clinic",
      partnerClinicAddress: "Partner Street 1",
      partnerClinicId: 7,
    });
    expect(externalEvent).toMatchObject({ location: "Partner Clinic, Partner Street 1" });
    expect(String(externalEvent.description)).not.toContain("Join link:");
  });

  it("keeps a Google 403 rate-limit response retryable without marking authorization as reconnect-required", async () => {
    dbMocks.getGoogleCalendarAppointmentForSync.mockResolvedValue(patientSource);
    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ payloadHash: "obsolete", syncStatus: "synced" }));
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "test-access" }), { status: 200 });
      return new Response(JSON.stringify({ error: { errors: [{ reason: "rateLimitExceeded" }] } }), { status: 403 });
    });

    const result = await syncGoogleCalendarAppointment(71, false);

    expect(result).toEqual({ status: "failed", message: "Google Calendar is temporarily rate-limited. Please retry manually in a moment." });
    expect(dbMocks.markGoogleCalendarConnection).not.toHaveBeenCalled();
    expect(dbMocks.markGoogleCalendarAppointmentSyncFailure).toHaveBeenCalledWith(expect.objectContaining({ retryable: true }));
  });

  it("retries Google Meet generation on the same mapped event without a second event or conference", async () => {
    const onlineSource = { ...patientSource, appointmentType: "online", meetingLink: null, externalLocation: null };
    dbMocks.getGoogleCalendarAppointmentForSync.mockResolvedValue(onlineSource);
    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ payloadHash: "obsolete", syncStatus: "synced" }));
    const conferenceRequestBodies: string[] = [];
    let eventReadCount = 0;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const target = String(url);
      if (target.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "test-access" }), { status: 200 });
      if (!init?.method && target.includes("conferenceDataVersion=1")) {
        eventReadCount += 1;
        return new Response(JSON.stringify(eventReadCount === 1 ? {} : {
          conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/same-room" }] },
        }), { status: 200 });
      }
      if (String(init?.body).includes("conferenceData")) {
        conferenceRequestBodies.push(String(init?.body));
        return new Response(JSON.stringify({ id: "g2appt27" }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: "g2appt27" }), { status: 200 });
    });

    const first = await generateGoogleCalendarAppointmentMeet(71);
    const second = await generateGoogleCalendarAppointmentMeet(71);

    expect(first.status).toBe("pending");
    expect(second).toEqual({ status: "generated", meetingLink: "https://meet.google.com/same-room" });
    expect(conferenceRequestBodies).toHaveLength(1);
    expect(conferenceRequestBodies[0]).toContain("fertiliv-71-g2appt27");
    expect(dbMocks.updateAppointment).toHaveBeenCalledWith(71, { meetingLink: "https://meet.google.com/same-room" });
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url).endsWith("/events?sendUpdates=none") && (init as RequestInit | undefined)?.method === "POST")).toBe(false);
  });

  it("blocks Google Meet generation for a cancelled Online appointment without changing retained data or calling Google", async () => {
    dbMocks.getGoogleCalendarAppointmentForSync.mockResolvedValue({ ...patientSource, status: "cancelled", appointmentType: "online", meetingLink: null });

    const result = await generateGoogleCalendarAppointmentMeet(71);

    expect(result).toEqual({ status: "skipped", message: "Google Meet cannot be generated for a cancelled appointment." });
    expect(dbMocks.updateAppointment).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("clears conferenceData on the same mapped event without changing its identity or creating another event", async () => {
    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ syncStatus: "synced" }));
    const eventUrl = "https://calendar.google.com/calendar/event?eid=same-event";
    const patchBodies: string[] = [];
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const target = String(url);
      if (target.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "test-access" }), { status: 200 });
      if ((init as RequestInit | undefined)?.method === "PATCH") {
        patchBodies.push(String((init as RequestInit).body));
        expect(target).toContain("conferenceDataVersion=1&sendUpdates=none");
        return new Response(JSON.stringify({ id: "g2appt27", htmlLink: eventUrl }), { status: 200 });
      }
      const priorToPatch = patchBodies.length === 0;
      return new Response(JSON.stringify(priorToPatch
        ? { id: "g2appt27", htmlLink: eventUrl, conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/old-room" }] } }
        : { id: "g2appt27", htmlLink: eventUrl }), { status: 200 });
    });

    const result = await clearGoogleCalendarAppointmentConference(71);

    expect(result).toEqual({ status: "cleared" });
    expect(patchBodies).toEqual([JSON.stringify({ conferenceData: null })]);
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url).endsWith("/events?sendUpdates=none") && (init as RequestInit | undefined)?.method === "POST")).toBe(false);
  });

  it("fails Google Meet generation safely when the clinic connection is unavailable", async () => {
    dbMocks.getGoogleCalendarAppointmentForSync.mockResolvedValue({ ...patientSource, appointmentType: "online", meetingLink: null });
    dbMocks.getGoogleCalendarConnection.mockResolvedValue(null);

    const result = await generateGoogleCalendarAppointmentMeet(71);

    expect(result.status).toBe("failed");
    expect(result.message).toContain("Google Calendar is not connected");
    expect(dbMocks.updateAppointment).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails Google Meet generation safely when authorization needs reconnection", async () => {
    dbMocks.getGoogleCalendarAppointmentForSync.mockResolvedValue({ ...patientSource, appointmentType: "online", meetingLink: null });
    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ payloadHash: "obsolete", syncStatus: "synced" }));
    dbMocks.getGoogleCalendarConnection.mockResolvedValue({ ...connectedDestination(), status: "needs_attention" });

    const result = await generateGoogleCalendarAppointmentMeet(71);

    expect(result.status).toBe("failed");
    expect(result.message).toContain("authorization needs to be reconnected");
    expect(dbMocks.updateAppointment).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("previews only unmapped future candidates and returns zero after mappings exist, without calling Google", async () => {
    const referenceNow = new Date("2026-11-01T00:00:00.000Z");
    dbMocks.listEligibleUnmappedFutureGoogleCalendarAppointments.mockResolvedValueOnce([{
      id: 501,
      code: "APT-00501",
      status: "upcoming",
      appointmentDate: new Date("2026-12-01T10:00:00.000Z"),
      patientId: null,
      leadId: 73,
    }]);

    const firstPreview = await previewGoogleCalendarBackfill(referenceNow);

    expect(firstPreview).toEqual({
      count: 1,
      appointments: [{
        id: 501,
        code: "APT-00501",
        status: "upcoming",
        appointmentDate: new Date("2026-12-01T10:00:00.000Z"),
        recordType: "lead",
      }],
    });
    expect(dbMocks.listEligibleUnmappedFutureGoogleCalendarAppointments).toHaveBeenCalledWith(referenceNow, 25);
    expect(fetch).not.toHaveBeenCalled();

    dbMocks.listEligibleUnmappedFutureGoogleCalendarAppointments.mockResolvedValueOnce([]);
    expect(await previewGoogleCalendarBackfill(referenceNow)).toEqual({ count: 0, appointments: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accounts for a backfill failure safely, persists it for retry, and recovers through the existing mapping", async () => {
    dbMocks.listEligibleUnmappedFutureGoogleCalendarAppointments.mockResolvedValueOnce([{
      id: 71,
      code: "APT-00071",
      status: "upcoming",
      appointmentDate: new Date("2026-12-01T10:00:00.000Z"),
      patientId: 450001,
      leadId: 1140001,
    }]);
    dbMocks.ensureGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ googleEventId: null }));
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Temporary provider outage" } }), { status: 503 }));

    const failedBackfill = await executeGoogleCalendarBackfill(9);

    expect(failedBackfill).toMatchObject({ attempted: 1, succeeded: 0, failed: 1, skipped: 0, batchLimit: 25 });
    expect(dbMocks.markGoogleCalendarAppointmentSyncFailure).toHaveBeenCalledWith(expect.objectContaining({
      appointmentId: 71,
      operation: "upsert",
      retryable: true,
      nextRetryAt: expect.any(Date),
    }));
    expect(dbMocks.logAppointmentActivity).toHaveBeenCalledWith(71, 9, "google_calendar_backfill_failed", "Controlled future-only backfill", "Google Calendar synchronization failed");

    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping({
      syncStatus: "failed",
      googleEventId: null,
      retryCount: 1,
      payloadHash: "obsolete",
    }));
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "backfill-recovered-event" }), { status: 200 }));

    const recovered = await retryGoogleCalendarAppointmentSync(71);

    expect(recovered).toMatchObject({ status: "synced", didSync: true });
    expect(dbMocks.ensureGoogleCalendarAppointmentSync).toHaveBeenCalledTimes(1);
    expect(dbMocks.setGoogleCalendarAppointmentSyncEventId).toHaveBeenCalledWith(71, "backfill-recovered-event");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("/events?sendUpdates=none");
  });

  it("marks cancellation and no-show operationally without deleting the event", () => {
    expect(buildGoogleCalendarAppointmentEvent({ ...patientSource, status: "cancelled" }).summary)
      .toBe("Cancelled — Christine F — Medical Consultation");
    expect(buildGoogleCalendarAppointmentEvent({ ...patientSource, status: "no_show" }).summary)
      .toBe("No Show — Christine F — Medical Consultation");
  });

  it("uses Lead identity when no Patient relationship exists", () => {
    const event = buildGoogleCalendarAppointmentEvent({
      ...patientSource,
      patientId: null,
      patientFirstName: null,
      patientLastName: null,
      leadId: 1140001,
      leadFirstName: "Amna",
      leadLastName: "Arshad",
      relatedEntityType: "lead",
      relatedEntityId: 1140001,
      relatedEntityDisplayName: "Amna Arshad",
    });
    expect(event.summary).toBe("Amna Arshad — Medical Consultation");
    expect(JSON.stringify(event)).not.toContain("Christine");
  });

  it("keeps Patient display priority for the existing dual-linked exceptional state", () => {
    const event = buildGoogleCalendarAppointmentEvent(patientSource);
    expect(event.summary).toContain("Christine F");
    expect(event.summary).not.toContain("Amna Arshad");
  });

  it("preserves Istanbul appointment timing when an appointment is rescheduled", () => {
    const before = buildGoogleCalendarAppointmentEvent(patientSource) as any;
    const after = buildGoogleCalendarAppointmentEvent({ ...patientSource, appointmentDate: new Date("2026-08-19T09:30:00.000Z") }) as any;
    expect(before.start.timeZone).toBe("Europe/Istanbul");
    expect(before.start.dateTime).toBe("2026-08-18T10:00:00");
    expect(before.end.dateTime).toBe("2026-08-18T10:45:00");
    expect(after.start.timeZone).toBe("Europe/Istanbul");
    expect(after.start.dateTime).toBe("2026-08-19T12:30:00");
    expect(after.start.dateTime).not.toBe(before.start.dateTime);
  });

  it("maps a canonical 08:00Z appointment to the same 11:00 Istanbul wall clock in Google", () => {
    const event = buildGoogleCalendarAppointmentEvent({
      ...patientSource,
      appointmentDate: new Date("2026-08-28T08:00:00.000Z"),
      endDate: new Date("2026-08-28T08:30:00.000Z"),
    }) as any;

    expect(event.start).toEqual({ dateTime: "2026-08-28T11:00:00", timeZone: "Europe/Istanbul" });
    expect(event.end).toEqual({ dateTime: "2026-08-28T11:30:00", timeZone: "Europe/Istanbul" });
  });

  it("creates one mapped event with the persisted selected destination for a new eligible appointment", async () => {
    dbMocks.ensureGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ googleEventId: null }));
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "google-provider-event-1" }), { status: 200 }));

    const result = await syncGoogleCalendarAppointment(71, true);

    expect(result.status).toBe("synced");
    expect(dbMocks.ensureGoogleCalendarAppointmentSync).toHaveBeenCalledWith(expect.objectContaining({
      appointmentId: 71,
      googleCalendarId: "clinic-operations@group.calendar.google.com",
    }));
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("clinic-operations%40group.calendar.google.com/events?sendUpdates=none");
    expect(String((fetchMock.mock.calls[2]?.[1] as RequestInit).body)).not.toContain('"id"');
    expect(dbMocks.setGoogleCalendarAppointmentSyncEventId).toHaveBeenCalledWith(71, "google-provider-event-1");
    expect(dbMocks.markGoogleCalendarAppointmentSyncSucceeded).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: 71 }));
  });

  it("creates one mapped event for a newly confirmed appointment", async () => {
    dbMocks.getGoogleCalendarAppointmentForSync.mockResolvedValue({ ...patientSource, status: "confirmed" });
    dbMocks.ensureGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ googleEventId: null }));
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "google-provider-event-2" }), { status: 200 }));

    const result = await syncGoogleCalendarAppointment(71, true);

    expect(result.status).toBe("synced");
    expect(dbMocks.ensureGoogleCalendarAppointmentSync).toHaveBeenCalledTimes(1);
  });

  it("updates the persisted event without creating a duplicate after a repeated save", async () => {
    const stableEvent = buildGoogleCalendarAppointmentEvent(patientSource);
    const serialized = JSON.stringify(stableEvent);
    const stableHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
    const hash = Array.from(new Uint8Array(stableHash)).map(byte => byte.toString(16).padStart(2, "0")).join("");
    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ syncStatus: "synced", payloadHash: hash }));

    const result = await syncGoogleCalendarAppointment(71, false);

    expect(result.status).toBe("synced");
    expect(result.didSync).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the original mapped calendar instead of a later selected destination", async () => {
    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ googleCalendarId: "original-clinic-calendar" }));
    dbMocks.getGoogleCalendarConnection.mockResolvedValue({ ...connectedDestination(), destinationCalendarId: "newly-selected-calendar" });
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "g2appt27" }), { status: 200 }));

    const result = await syncGoogleCalendarAppointment(71, false);

    expect(result.status).toBe("synced");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("original-clinic-calendar");
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain("newly-selected-calendar");
  });

  it("returns an exact Google-provided event link only for a successful persisted mapping", async () => {
    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping({
      syncStatus: "synced",
      operation: "upsert",
      googleCalendarId: "clinic-operations@group.calendar.google.com",
      googleEventId: "google-provider-event-1",
    }));
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "google-provider-event-1", htmlLink: "https://calendar.google.com/calendar/event?eid=exact-mapped-event" }), { status: 200 }));

    const result = await getGoogleCalendarAppointmentEventLink(71);

    expect(result).toBe("https://calendar.google.com/calendar/event?eid=exact-mapped-event");
    expect(dbMocks.markGoogleCalendarAppointmentEventVerified).toHaveBeenCalledWith(71, "https://calendar.google.com/calendar/event?eid=exact-mapped-event");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("google-provider-event-1");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("clinic-operations%40group.calendar.google.com");
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain("Christine");
  });

  it("clears persisted readiness only when the exact mapped Google event returns a confirmed 404", async () => {
    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ syncStatus: "synced", operation: "upsert" }));
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Not found" } }), { status: 404 }));

    await expect(getGoogleCalendarAppointmentEventLink(71)).resolves.toBeNull();

    expect(dbMocks.clearGoogleCalendarAppointmentEventReadiness).toHaveBeenCalledWith(71);
    expect(dbMocks.markGoogleCalendarAppointmentEventVerified).not.toHaveBeenCalled();
  });

  it("retains persisted readiness on a transient mapped-event verification failure", async () => {
    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ syncStatus: "synced", operation: "upsert" }));
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Temporary outage" } }), { status: 503 }));

    await expect(getGoogleCalendarAppointmentEventLink(71)).rejects.toMatchObject({ status: 503 });

    expect(dbMocks.clearGoogleCalendarAppointmentEventReadiness).not.toHaveBeenCalled();
    expect(dbMocks.markGoogleCalendarAppointmentEventVerified).not.toHaveBeenCalled();
  });

  it("does not query Google or expose a link for unmapped, failed, or deleted appointments", async () => {
    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(null);
    expect(await getGoogleCalendarAppointmentEventLink(71)).toBeNull();

    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ syncStatus: "failed", googleEventId: "google-provider-event-1" }));
    expect(await getGoogleCalendarAppointmentEventLink(71)).toBeNull();

    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ syncStatus: "deleted", googleEventId: "google-provider-event-1" }));
    expect(await getGoogleCalendarAppointmentEventLink(71)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("updates the single mapped event after an appointment edit", async () => {
    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ payloadHash: "obsolete" }));
    dbMocks.getGoogleCalendarAppointmentForSync.mockResolvedValue({ ...patientSource, purpose: "follow-up", duration: 60 });
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "g2appt27" }), { status: 200 }));

    const result = await syncGoogleCalendarAppointment(71, false);

    expect(result.status).toBe("synced");
    expect(result.didSync).toBe(true);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "PATCH" });
    expect(dbMocks.ensureGoogleCalendarAppointmentSync).not.toHaveBeenCalled();
  });

  it("patches the existing mapped event when Clinic Reminder mode changes without creating a second event", async () => {
    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ payloadHash: "obsolete" }));
    dbMocks.getGoogleCalendarAppointmentForSync.mockResolvedValue({ ...patientSource, googleReminderMode: "custom" });
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "g2appt27" }), { status: 200 }));

    const result = await syncGoogleCalendarAppointment(71, false);
    const body = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));

    expect(result).toMatchObject({ status: "synced", didSync: true });
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe("PATCH");
    expect(body.reminders).toEqual({
      useDefault: false,
      overrides: [
        { method: "email", minutes: 1440 },
        { method: "popup", minutes: 120 },
      ],
    });
    expect(dbMocks.ensureGoogleCalendarAppointmentSync).not.toHaveBeenCalled();
    expect(body).not.toHaveProperty("attendees");
  });

  it("updates the same mapped event for cancellation rather than deleting it", async () => {
    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ payloadHash: "obsolete" }));
    dbMocks.getGoogleCalendarAppointmentForSync.mockResolvedValue({ ...patientSource, status: "cancelled" });
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "g2appt27" }), { status: 200 }));

    const result = await syncGoogleCalendarAppointment(71, false);
    const body = String((fetchMock.mock.calls[1]?.[1] as RequestInit).body);

    expect(result.status).toBe("synced");
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe("PATCH");
    expect(body).toContain("Cancelled");
  });

  it("records Google failure without rejecting the already-saved Fertiliv appointment", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network unavailable"));

    const result = await syncGoogleCalendarAppointment(71, true);

    expect(result.status).toBe("failed");
    expect(dbMocks.markGoogleCalendarAppointmentSyncFailure).toHaveBeenCalledWith(expect.objectContaining({
      appointmentId: 71,
      operation: "upsert",
      retryable: true,
    }));
  });

  it("records a disconnected destination as a safe failure without calling Google", async () => {
    dbMocks.getGoogleCalendarConnection.mockResolvedValue(null);
    dbMocks.ensureGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ googleCalendarId: null }));

    const result = await syncGoogleCalendarAppointment(71, true);

    expect(result.status).toBe("failed");
    expect(fetch).not.toHaveBeenCalled();
    expect(dbMocks.markGoogleCalendarAppointmentSyncFailure).toHaveBeenCalledWith(expect.objectContaining({ retryable: false }));
  });

  it("does not create a mapping for an existing ineligible appointment", async () => {
    dbMocks.getGoogleCalendarAppointmentForSync.mockResolvedValue({ ...patientSource, status: "completed" });

    const result = await syncGoogleCalendarAppointment(71, false);

    expect(result.status).toBe("skipped");
    expect(dbMocks.ensureGoogleCalendarAppointmentSync).not.toHaveBeenCalled();
  });

  it("does not backfill a pre-existing upcoming appointment when no mapping exists", async () => {
    const result = await syncGoogleCalendarAppointment(71, false);

    expect(result.status).toBe("skipped");
    expect(dbMocks.ensureGoogleCalendarAppointmentSync).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps an already-mapped completed appointment without deleting its Google event", async () => {
    dbMocks.getGoogleCalendarAppointmentForSync.mockResolvedValue({ ...patientSource, status: "completed" });
    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ syncStatus: "synced" }));
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "g2appt27" }), { status: 200 }));

    const result = await syncGoogleCalendarAppointment(71, false);

    expect(result.status).toBe("synced");
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")).toBe(false);
  });

  it("uses the durable mapping for retry and does not create a second mapping", async () => {
    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ syncStatus: "failed" }));
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "g2appt27" }), { status: 200 }));

    const result = await retryGoogleCalendarAppointmentSync(71);

    expect(result.status).toBe("synced");
    expect(dbMocks.ensureGoogleCalendarAppointmentSync).not.toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("g2appt27");
  });

  it("recovers a provider-created event through private metadata after a response-loss retry", async () => {
    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping({ googleEventId: null, syncStatus: "failed" }));
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "google-recovered-event" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "google-recovered-event" }), { status: 200 }));

    const result = await retryGoogleCalendarAppointmentSync(71);

    expect(result.status).toBe("synced");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("privateExtendedProperty=fertiliv.appointment%3D71");
    expect(dbMocks.setGoogleCalendarAppointmentSyncEventId).toHaveBeenCalledWith(71, "google-recovered-event");
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes("/events?") && (init as RequestInit | undefined)?.method === "POST")).toBe(false);
  });

  it("hard delete removes only the mapped external event and leaves no appointment data in the request", async () => {
    dbMocks.getGoogleCalendarAppointmentSync.mockResolvedValue(mapping());
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-access" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await deleteGoogleCalendarAppointmentEvent(71);

    expect(result.status).toBe("deleted");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "DELETE" });
    expect(JSON.stringify(fetchMock.mock.calls[1])).not.toContain("Christine");
    expect(dbMocks.markGoogleCalendarAppointmentSyncSucceeded).toHaveBeenCalledWith({ appointmentId: 71, deleted: true });
  });

  it("does not project tasks, CRM, finance, clinical notes, attendees, or invitations to Google", () => {
    const event = buildGoogleCalendarAppointmentEvent({ ...patientSource, title: "Sensitive internal title" });
    const serialized = JSON.stringify(event).toLowerCase();
    for (const forbidden of ["sensitive internal title", "attendees", "tasks", "crm", "finance", "diagnosis", "notes", "meetinglink", "passport"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(event).not.toHaveProperty("attendees");
    expect(event).not.toHaveProperty("conferenceData");
  });
});
