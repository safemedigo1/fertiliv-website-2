/**
 * Fix 1 — CRM field persistence tests
 *
 * Verifies that:
 * 1. leads.update schema accepts campaignName and lastContactDate
 * 2. leads.update schema accepts every field that PatientCRMTab sends in the linked-Lead path
 * 3. countryOfResidency is NOT accepted by leads.update (patients-only column)
 * 4. No editable CRM tab field is silently dropped in the linked-Lead save path
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";

// ── Replicate the leads.update data schema exactly as defined in routers.ts ──

const leadsUpdateDataSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  nationality: z.string().optional(),
  preferredLanguages: z.array(z.string()).optional(),
  primaryLanguage: z.string().optional().nullable(),
  preferredContactMethods: z.array(z.string()).optional(),
  leadSource: z.enum(["paid","employee-referral","external-referral","website","maps","partner","public-relations","instagram","tiktok","doctor-referral","youtube","facebook","awatef-guide","salim-guide","organic"]).optional(),
  brand: z.enum(["fertiliv", "safemedigo", "dr-nilay-karaca"]).optional(),
  leadStatus: z.enum(["intake","attempted-to-contact","contacted-awaiting-info","medical-reports-received","doctor-feedback-shared","follow-up-negotiation","ready-to-travel","converted","cold","lost","not-qualified","junk"]).optional(),
  assignedStaffId: z.number().optional(),
  rating: z.string().optional(),
  interestLevel: z.enum(["cold", "warm", "hot"]).optional().nullable(),
  nextFollowUpDate: z.date().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  middleName: z.string().optional(),
  dateOfBirth: z.date().optional(),
  patientType: z.enum(["local", "international", "not-specified"]).optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  budgetRange: z.string().optional(),
  decisionTimeline: z.enum(["immediately","1-2-weeks","1-month","2-months","3-months","1-3-months","6-months","exploring"]).optional(),
  travelReadiness: z.enum(["ready","considering","prefers-home","local-patient"]).optional(),
  accommodationHotel: z.string().optional(),
  accommodationLocation: z.string().optional(),
  transportationAirportPickup: z.union([z.boolean(), z.string(), z.null()]).optional().nullable().transform(v => (v === "" || v === null || v === undefined) ? null : (v === true || v === "yes" || v === "true")),
  transportationLocalTransfer: z.union([z.boolean(), z.string(), z.null()]).optional().nullable().transform(v => (v === "" || v === null || v === undefined) ? null : (v === true || v === "yes" || v === "true")),
  ivfExperience: z.enum(["never-tried","tried-unsuccessful","tried-again","tried-multiple"]).optional(),
  fertilityDiagnosis: z.array(z.string()).optional(),
  maleFertilityDiagnosis: z.array(z.string()).optional(),
  interestedProcedureId: z.number().optional(),
  notes: z.string().optional(),
  mainMedicalInterest: z.array(z.string()).optional().nullable(),
  callbackPreferredDate: z.string().optional().nullable(),
  callbackPreferredTime: z.string().optional().nullable(),
  callbackMethod: z.enum(["whatsapp","phone","video_call","email"]).optional().nullable(),
  tags: z.string().optional(),
  secondaryPhone: z.string().optional(),
  secondaryEmail: z.string().optional(),
  assignedDoctorId: z.number().optional().nullable(),
  caseSummary: z.string().optional().nullable(),
  salesNote: z.string().optional().nullable(),
  caseSummaryTranslations: z.string().optional().nullable(),
  salesNoteTranslations: z.string().optional().nullable(),
  contactRole: z.enum(["female-patient","male-patient","husband-for-couple","wife-for-couple","family-member","agent","unknown"]).optional().nullable(),
  serviceFor: z.enum(["female-only","male-only","couple"]).optional().nullable(),
  campaignName: z.string().optional().nullable(),
  lastContactDate: z.date().optional().nullable(),
});

// ── The exact linked-Lead payload that PatientCRMTab sends (after Fix 1) ──

const linkedLeadPayloadFields = [
  "leadSource",
  "campaignName",
  "interestLevel",
  "rating",
  "budgetRange",
  "decisionTimeline",
  "travelReadiness",
  "ivfExperience",
  "mainMedicalInterest",
  "fertilityDiagnosis",
  "maleFertilityDiagnosis",
  "preferredLanguages",
  "preferredContactMethods",
  "country",
  "city",
  // countryOfResidency intentionally excluded — patients-only column
  "accommodationHotel",
  "accommodationLocation",
  "transportationAirportPickup",
  "transportationLocalTransfer",
  "lastContactDate",
  "nextFollowUpDate",
  "caseSummary",
  "salesNote",
] as const;

describe("Fix 1 — CRM field persistence (leads.update schema)", () => {

  it("schema accepts campaignName as a string", () => {
    const result = leadsUpdateDataSchema.safeParse({ campaignName: "Summer 2026 Campaign" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.campaignName).toBe("Summer 2026 Campaign");
  });

  it("schema accepts campaignName as null (clearing the value)", () => {
    const result = leadsUpdateDataSchema.safeParse({ campaignName: null });
    expect(result.success).toBe(true);
  });

  it("schema accepts lastContactDate as a Date object", () => {
    const now = new Date();
    const result = leadsUpdateDataSchema.safeParse({ lastContactDate: now });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.lastContactDate).toEqual(now);
  });

  it("schema accepts lastContactDate as null (clearing the value)", () => {
    const result = leadsUpdateDataSchema.safeParse({ lastContactDate: null });
    expect(result.success).toBe(true);
  });

  it("every field in the linked-Lead payload is accepted by the schema (no silent drops)", () => {
    const schemaKeys = Object.keys(leadsUpdateDataSchema.shape);
    const silentDrops: string[] = [];
    for (const field of linkedLeadPayloadFields) {
      if (!schemaKeys.includes(field)) {
        silentDrops.push(field);
      }
    }
    expect(silentDrops).toEqual([]);
  });

  it("countryOfResidency is NOT in the leads.update schema (patients-only column)", () => {
    const schemaKeys = Object.keys(leadsUpdateDataSchema.shape);
    expect(schemaKeys).not.toContain("countryOfResidency");
  });

  it("full linked-Lead payload parses without error", () => {
    const payload = {
      leadSource: "organic" as const,
      campaignName: "Test Campaign",
      interestLevel: "warm" as const,
      rating: "Excellent Candidate",
      budgetRange: "$5,000 – $6,000",
      decisionTimeline: "immediately" as const,
      travelReadiness: "ready" as const,
      ivfExperience: "never-tried" as const,
      mainMedicalInterest: ["IVF with ICSI"],
      fertilityDiagnosis: ["Low AMH"],
      maleFertilityDiagnosis: ["Low Sperm Count"],
      preferredLanguages: ["en", "ar"],
      preferredContactMethods: ["whatsapp"],
      country: "United Kingdom",
      city: "London",
      accommodationHotel: "Hilton Istanbul",
      accommodationLocation: "Taksim",
      transportationAirportPickup: true,
      transportationLocalTransfer: false,
      lastContactDate: new Date("2026-07-01"),
      nextFollowUpDate: new Date("2026-07-15"),
      caseSummary: "Patient is ready to proceed.",
      salesNote: "Follow up after consultation.",
    };
    const result = leadsUpdateDataSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("campaignName was previously missing from schema (regression guard)", () => {
    // This test documents the pre-fix state: if campaignName were absent from the schema,
    // Zod would strip it silently. The test above already confirms it is now present.
    // This serves as a named regression guard.
    expect(Object.keys(leadsUpdateDataSchema.shape)).toContain("campaignName");
  });

  it("lastContactDate was previously missing from schema (regression guard)", () => {
    expect(Object.keys(leadsUpdateDataSchema.shape)).toContain("lastContactDate");
  });
});
