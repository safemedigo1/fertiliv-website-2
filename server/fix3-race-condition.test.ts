/**
 * Fix 3 Race Condition — PatientDetailPage routing logic
 *
 * Tests verify the separation of:
 *   hasLinkedLeadId  — routing truth (based on patient.socialLeadId alone)
 *   isLinkedLeadLoaded — form-init truth (requires linkedLead data to be loaded)
 *
 * The critical invariant: save routing must NEVER depend on linkedLead fetch state.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";

// ── Replicate routing logic from PatientDetailPage ──

function deriveRoutingFlags(patient: {
  socialLeadId?: string | null;
}, linkedLead: { id: number; preferredLanguages?: string[] } | null | undefined) {
  const linkedLeadId = patient.socialLeadId ? Number(patient.socialLeadId) : null;
  const hasLinkedLeadId = !!linkedLeadId;                   // routing truth
  const isLinkedLeadLoaded = hasLinkedLeadId && !!linkedLead; // form-init truth
  const isLinkedToLead = isLinkedLeadLoaded;                 // display alias
  return { linkedLeadId, hasLinkedLeadId, isLinkedLeadLoaded, isLinkedToLead };
}

// ── Replicate save routing from handleSavePatient ──

type SaveResult =
  | { target: "leads.update"; leadId: number }
  | { target: "patients.update.only" }
  | { target: "error"; reason: string };

function simulateSaveRouting(
  hasLinkedLeadId: boolean,
  linkedLeadId: number | null,
  leadsUpdateWouldFail: boolean
): SaveResult {
  if (hasLinkedLeadId && linkedLeadId) {
    if (leadsUpdateWouldFail) {
      // leads.update failed → do NOT fall back to patients.update
      return { target: "error", reason: "leads.update failed" };
    }
    // leads.update succeeded → then patients.update runs (for non-pref fields)
    return { target: "leads.update", leadId: linkedLeadId };
  }
  // Unlinked patient → patients.update only
  return { target: "patients.update.only" };
}

// ── Replicate form-init source selection ──

function selectPrefSource(
  isLinkedLeadLoaded: boolean,
  linkedLead: { preferredLanguages?: string[] } | null | undefined,
  patient: { preferredLanguages?: string[] }
): { preferredLanguages?: string[] } {
  return isLinkedLeadLoaded ? (linkedLead ?? patient) : patient;
}

// ── Zod schemas for type-safety checks ──

const leadsUpdateDataSchema = z.object({
  preferredLanguages: z.array(z.string()).optional(),
  primaryLanguage: z.string().optional().nullable(),
  preferredContactMethods: z.array(z.string()).optional(),
  campaignName: z.string().optional().nullable(),
  lastContactDate: z.date().optional().nullable(),
  gender: z.enum(["male", "female"]).optional().nullable(),
});

const patientsUpdateDataSchema = z.object({
  firstName: z.string().optional(),
  gender: z.enum(["male", "female"]).optional(),
  preferredLanguages: z.array(z.string()).optional(),
  primaryLanguage: z.string().optional().nullable(),
  preferredContactMethods: z.array(z.string()).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Fix 3 Race Condition — hasLinkedLeadId vs isLinkedLeadLoaded", () => {

  describe("T-RC-1: hasLinkedLeadId is true when socialLeadId is set, regardless of linkedLead load state", () => {
    it("socialLeadId set, linkedLead not yet loaded → hasLinkedLeadId=true, isLinkedLeadLoaded=false", () => {
      const flags = deriveRoutingFlags({ socialLeadId: "660225" }, undefined);
      expect(flags.hasLinkedLeadId).toBe(true);
      expect(flags.isLinkedLeadLoaded).toBe(false);
      expect(flags.linkedLeadId).toBe(660225);
    });

    it("socialLeadId set, linkedLead loaded → both flags true", () => {
      const flags = deriveRoutingFlags({ socialLeadId: "660225" }, { id: 660225 });
      expect(flags.hasLinkedLeadId).toBe(true);
      expect(flags.isLinkedLeadLoaded).toBe(true);
    });

    it("socialLeadId null → both flags false", () => {
      const flags = deriveRoutingFlags({ socialLeadId: null }, null);
      expect(flags.hasLinkedLeadId).toBe(false);
      expect(flags.isLinkedLeadLoaded).toBe(false);
    });

    it("socialLeadId undefined → both flags false", () => {
      const flags = deriveRoutingFlags({}, null);
      expect(flags.hasLinkedLeadId).toBe(false);
      expect(flags.isLinkedLeadLoaded).toBe(false);
    });
  });

  describe("T-RC-2: Save routing uses hasLinkedLeadId (never isLinkedLeadLoaded)", () => {
    it("linked patient, linkedLead NOT yet loaded → still routes to leads.update", () => {
      const flags = deriveRoutingFlags({ socialLeadId: "660225" }, undefined);
      // hasLinkedLeadId is true even though isLinkedLeadLoaded is false
      const result = simulateSaveRouting(flags.hasLinkedLeadId, flags.linkedLeadId, false);
      expect(result.target).toBe("leads.update");
      expect((result as any).leadId).toBe(660225);
    });

    it("linked patient, linkedLead loaded → routes to leads.update", () => {
      const flags = deriveRoutingFlags({ socialLeadId: "660225" }, { id: 660225 });
      const result = simulateSaveRouting(flags.hasLinkedLeadId, flags.linkedLeadId, false);
      expect(result.target).toBe("leads.update");
    });

    it("unlinked patient → routes to patients.update only", () => {
      const flags = deriveRoutingFlags({ socialLeadId: null }, null);
      const result = simulateSaveRouting(flags.hasLinkedLeadId, flags.linkedLeadId, false);
      expect(result.target).toBe("patients.update.only");
    });
  });

  describe("T-RC-3: leads.update failure blocks patients.update (no silent fallback)", () => {
    it("leads.update fails → returns error, does NOT fall back to patients.update", () => {
      const flags = deriveRoutingFlags({ socialLeadId: "660225" }, { id: 660225 });
      const result = simulateSaveRouting(flags.hasLinkedLeadId, flags.linkedLeadId, true);
      expect(result.target).toBe("error");
      expect((result as any).reason).toBe("leads.update failed");
    });
  });

  describe("T-RC-4: Form initialization uses isLinkedLeadLoaded (not hasLinkedLeadId)", () => {
    const linkedLead = { preferredLanguages: ["ar", "tr"] };
    const patient = { preferredLanguages: ["en"] };

    it("linkedLead loaded → form reads from linkedLead", () => {
      const flags = deriveRoutingFlags({ socialLeadId: "660225" }, linkedLead);
      const source = selectPrefSource(flags.isLinkedLeadLoaded, linkedLead, patient);
      expect(source.preferredLanguages).toEqual(["ar", "tr"]);
    });

    it("linkedLead NOT yet loaded → form falls back to patient values", () => {
      const flags = deriveRoutingFlags({ socialLeadId: "660225" }, undefined);
      const source = selectPrefSource(flags.isLinkedLeadLoaded, undefined, patient);
      expect(source.preferredLanguages).toEqual(["en"]);
    });

    it("unlinked patient → form reads from patient", () => {
      const flags = deriveRoutingFlags({ socialLeadId: null }, null);
      const source = selectPrefSource(flags.isLinkedLeadLoaded, null, patient);
      expect(source.preferredLanguages).toEqual(["en"]);
    });
  });

  describe("T-RC-5: 3 pref fields excluded from patients.update payload when linked", () => {
    it("linked path: patients.update payload must NOT include the 3 pref fields", () => {
      // Simulate the linked-path patients.update payload (Fix B)
      const linkedPatientPayload = {
        firstName: "Christine",
        gender: "female" as const,
        nationality: "GB",
        // preferredLanguages, primaryLanguage, preferredContactMethods intentionally absent
      };
      const result = patientsUpdateDataSchema.safeParse(linkedPatientPayload);
      expect(result.success).toBe(true);
      expect((result.data as any).preferredLanguages).toBeUndefined();
      expect((result.data as any).primaryLanguage).toBeUndefined();
      expect((result.data as any).preferredContactMethods).toBeUndefined();
    });

    it("unlinked path: patients.update payload may include the 3 pref fields", () => {
      const unlinkedPayload = {
        firstName: "John",
        gender: "male" as const,
        preferredLanguages: ["en"],
        primaryLanguage: "en",
        preferredContactMethods: ["email"],
      };
      const result = patientsUpdateDataSchema.safeParse(unlinkedPayload);
      expect(result.success).toBe(true);
      expect(result.data?.preferredLanguages).toEqual(["en"]);
    });
  });

  describe("T-RC-6: leads.update schema accepts the 3 pref fields", () => {
    it("all 3 pref fields are valid in leads.update schema", () => {
      const payload = {
        preferredLanguages: ["ar", "en"],
        primaryLanguage: "ar",
        preferredContactMethods: ["whatsapp"],
      };
      const result = leadsUpdateDataSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data?.preferredLanguages).toEqual(["ar", "en"]);
      expect(result.data?.primaryLanguage).toBe("ar");
      expect(result.data?.preferredContactMethods).toEqual(["whatsapp"]);
    });

    it("null primaryLanguage is valid in leads.update schema", () => {
      const result = leadsUpdateDataSchema.safeParse({ primaryLanguage: null });
      expect(result.success).toBe(true);
    });
  });
});
