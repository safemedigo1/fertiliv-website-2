import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { googleCalendarConnections } from "../drizzle/schema";
import { googleCalendarRouter } from "./routers/googleCalendar";
import type { TrpcContext } from "./_core/context";
import {
  GOOGLE_CALENDAR_G1_SCOPES,
  buildGoogleCalendarTestEvent,
  createGoogleOAuthState,
  executeGoogleCalendarTestEventLifecycle,
  getGoogleCalendarSafeStatus,
  hashGoogleOAuthState,
} from "./googleCalendarService";
import { decryptGoogleRefreshToken, encryptGoogleRefreshToken } from "./googleCalendarCrypto";

function createNonAdminContext(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "non-admin",
      name: "Clinic Staff",
      email: "staff@example.test",
      passwordHash: null,
      loginMethod: "password",
      role: "staff",
      status: "active",
      avatarUrl: null,
      phone: null,
      firstName: null,
      secondName: null,
      thirdName: null,
      familyName: null,
      gender: null,
      dateOfBirth: null,
      address: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Google Calendar G1 safeguards", () => {
  it("maps the G1 connection state to the production status column", () => {
    const columns = getTableColumns(googleCalendarConnections);
    expect(columns.status?.name).toBe("status");
    expect(Object.values(columns).map(column => column.name)).not.toContain("googleCalendarConnectionStatus");
  });

  it("reads the G1 status from the actual connection table without throwing", async () => {
    const status = await getGoogleCalendarSafeStatus();
    expect(status).toMatchObject({ timezone: "Europe/Istanbul" });
    expect(typeof status.connected).toBe("boolean");
  });

  it("requests only connected identity, calendar-list reading, and owned-event permissions", () => {
    expect(GOOGLE_CALENDAR_G1_SCOPES).toEqual([
      "openid",
      "email",
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
      "https://www.googleapis.com/auth/calendar.events.owned",
    ]);
  });

  it("encrypts durable refresh tokens without retaining plaintext in storage format", () => {
    const source = "refresh-token-for-test-only";
    const encrypted = encryptGoogleRefreshToken(source);
    expect(encrypted).not.toContain(source);
    expect(decryptGoogleRefreshToken(encrypted)).toBe(source);
  });

  it("generates one-time state values whose persisted form is a deterministic hash", () => {
    const state = createGoogleOAuthState();
    expect(state).toHaveLength(43);
    expect(hashGoogleOAuthState(state)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashGoogleOAuthState(state)).toBe(hashGoogleOAuthState(state));
  });

  it("builds a non-clinical private test event in Europe/Istanbul", () => {
    const event = buildGoogleCalendarTestEvent(new Date("2026-08-13T09:00:00.000Z"));
    const serialized = JSON.stringify(event).toLowerCase();
    expect(event).toMatchObject({
      summary: "Fertiliv Google Calendar Integration Test",
      visibility: "private",
      transparency: "transparent",
      start: { timeZone: "Europe/Istanbul" },
      end: { timeZone: "Europe/Istanbul" },
    });
    for (const forbiddenTerm of ["patient", "lead", "mrn", "diagnosis", "phone", "@fertiliv.com"]) {
      expect(serialized).not.toContain(forbiddenTerm);
    }
  });

  it("creates, updates, and deletes one persisted test event without creating a duplicate", async () => {
    const operations: string[] = [];
    await executeGoogleCalendarTestEventLifecycle({
      persistedEventId: null,
      create: async () => { operations.push("create"); return "google-test-event"; },
      persist: async eventId => { operations.push(`persist:${eventId}`); },
      update: async eventId => { operations.push(`update:${eventId}`); },
      delete: async eventId => { operations.push(`delete:${eventId}`); },
      clear: async () => { operations.push("clear"); },
    });
    expect(operations).toEqual([
      "create",
      "persist:google-test-event",
      "update:google-test-event",
      "delete:google-test-event",
      "clear",
    ]);
  });

  it("reuses an interrupted test event instead of creating another one", async () => {
    const operations: string[] = [];
    await executeGoogleCalendarTestEventLifecycle({
      persistedEventId: "existing-google-test-event",
      create: async () => { operations.push("create"); return "unexpected"; },
      persist: async () => { operations.push("persist"); },
      update: async eventId => { operations.push(`update:${eventId}`); },
      delete: async eventId => { operations.push(`delete:${eventId}`); },
      clear: async () => { operations.push("clear"); },
    });
    expect(operations).toEqual([
      "update:existing-google-test-event",
      "delete:existing-google-test-event",
      "clear",
    ]);
  });

  it("rejects every Google Calendar configuration procedure for a non-admin user", async () => {
    const caller = googleCalendarRouter.createCaller(createNonAdminContext());
    await expect(caller.status()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.listOwnedCalendars()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.selectDestination({ calendarId: "clinic-calendar" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.testConnection()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.disconnect()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
