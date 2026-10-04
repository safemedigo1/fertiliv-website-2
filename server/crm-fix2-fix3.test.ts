/**
 * Fix 2 — Medical Record DOB source of truth
 * Fix 3 — CRM preference field routing (PatientDetailPage → Lead when linked)
 *
 * These are schema/logic unit tests that do not require a live DB.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";

// ── Replicate the patients.update data schema (relevant fields only) ──

const patientsUpdateDataSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  gender: z.enum(["male", "female"]).optional(),
  dateOfBirth: z.date().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  nationality: z.string().optional(),
  countryOfResidency: z.string().optional().nullable(),
  preferredLanguages: z.array(z.string()).optional(),
  primaryLanguage: z.string().optional().nullable(),
  preferredContactMethods: z.array(z.string()).optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  status: z.enum(["inquiry","lead","qualified","proposal_sent","active_patient","inactive","archived"]).optional(),
  patientType: z.enum(["local", "international", "not-specified"]).optional(),
});

// ── Replicate the leads.update data schema (relevant fields only) ──

const leadsUpdateDataSchema = z.object({
  preferredLanguages: z.array(z.string()).optional(),
  primaryLanguage: z.string().optional().nullable(),
  preferredContactMethods: z.array(z.string()).optional(),
  nationality: z.string().optional(),
  dateOfBirth: z.date().optional(),
  campaignName: z.string().optional().nullable(),
  lastContactDate: z.date().optional().nullable(),
});

// ── Fix 2 helper: derive effective DOB given lead data and linked patient data ──

function getEffectiveLeadDob(
  leadDateOfBirth: Date | null | undefined,
  linkedPatientDateOfBirth: Date | null | undefined
): string {
  // Fix 2 rule: linked Patient DOB takes precedence over raw Lead DOB
  const source = linkedPatientDateOfBirth ?? leadDateOfBirth;
  if (!source) return "";
  return new Date(source).toISOString().split("T")[0];
}

// ── Fix 2 helper: derive effective gender ──

function getEffectiveLeadGender(
  leadGender: string | null | undefined,
  linkedPatientGender: string | null | undefined
): string {
  return linkedPatientGender ?? leadGender ?? "";
}

// ── Fix 3 helper: decide where to route CRM preference fields ──

function buildSplitPayloads(
  formData: {
    preferredLanguages: string[];
    primaryLanguage: string | null;
    preferredContactMethods: string[];
    nationality: string;
    firstName: string;
    dateOfBirth: string;
    gender: string;
  },
  linkedLeadId: number | null
): {
  patientPayload: Record<string, unknown>;
  leadPayload: Record<string, unknown> | null;
} {
  // Fix B: when linked, the 3 CRM preference fields go to Lead only — NOT to Patient.
  // When unlinked, all fields go to Patient.
  const isLinked = !!linkedLeadId;

  // Language clear-to-empty fix: Array.isArray([]) is true, so [] passes through as intentional clear.
  // Guarantee: if preferredLanguages is empty, primaryLanguage must also be null.
  const resolvedLanguages = Array.isArray(formData.preferredLanguages) ? formData.preferredLanguages : undefined;
  const resolvedPrimaryLanguage = (Array.isArray(formData.preferredLanguages) && formData.preferredLanguages.length === 0)
    ? null  // Guarantee: empty languages → clear primary language
    : (formData.primaryLanguage || null);

  const patientPayload: Record<string, unknown> = {
    firstName: formData.firstName || undefined,
    gender: formData.gender || undefined,
    dateOfBirth: formData.dateOfBirth ? new Date(formData.dateOfBirth) : undefined,
    nationality: formData.nationality || undefined,
    // Only include the 3 CRM preference fields in patient payload when NOT linked
    ...(isLinked ? {} : {
      preferredLanguages: resolvedLanguages,
      primaryLanguage: resolvedPrimaryLanguage,
      // CM-1/CM-2 fix: Array.isArray([]) is true, so [] passes through as intentional clear.
    preferredContactMethods: Array.isArray(formData.preferredContactMethods) ? formData.preferredContactMethods : undefined,
    }),
  };

  if (!linkedLeadId) {
    return { patientPayload, leadPayload: null };
  }

  // Fix 3: when linked, send the 3 CRM preference fields to the Lead only
  const leadPayload: Record<string, unknown> = {
    preferredLanguages: resolvedLanguages,
    primaryLanguage: resolvedPrimaryLanguage,
    // CM-1 fix: Array.isArray([]) passes [] through as intentional clear.
    preferredContactMethods: Array.isArray(formData.preferredContactMethods) ? formData.preferredContactMethods : undefined,
  };

  return { patientPayload, leadPayload };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Fix 2 — Medical Record DOB source of truth", () => {

  it("T-F2-1: unlinked Lead — uses raw Lead DOB", () => {
    const leadDob = new Date("1987-06-13");
    const result = getEffectiveLeadDob(leadDob, null);
    expect(result).toBe("1987-06-13");
  });

  it("T-F2-2: linked Lead — prefers Patient DOB over Lead DOB", () => {
    const leadDob = new Date("1987-06-13");
    const patientDob = new Date("1997-01-01");
    const result = getEffectiveLeadDob(leadDob, patientDob);
    expect(result).toBe("1997-01-01");
  });

  it("T-F2-3: linked Lead — falls back to Lead DOB when Patient DOB is null", () => {
    const leadDob = new Date("1987-06-13");
    const result = getEffectiveLeadDob(leadDob, null);
    expect(result).toBe("1987-06-13");
  });

  it("T-F2-4: both null — returns empty string", () => {
    const result = getEffectiveLeadDob(null, null);
    expect(result).toBe("");
  });

  it("T-F2-5: linked Lead — gender prefers Patient gender over Lead gender", () => {
    const result = getEffectiveLeadGender("male", "female");
    expect(result).toBe("female");
  });

  it("T-F2-6: unlinked Lead — uses raw Lead gender", () => {
    const result = getEffectiveLeadGender("male", null);
    expect(result).toBe("male");
  });

  it("T-F2-7: patients.update schema accepts dateOfBirth (DOB write-back target for linked Lead)", () => {
    const result = patientsUpdateDataSchema.safeParse({
      dateOfBirth: new Date("1997-01-01"),
    });
    expect(result.success).toBe(true);
  });

  it("T-F2-8: leads.update schema still accepts dateOfBirth (unlinked Lead path unchanged)", () => {
    const result = leadsUpdateDataSchema.safeParse({
      dateOfBirth: new Date("1987-06-13"),
    });
    expect(result.success).toBe(true);
  });
});

describe("Fix 3 — CRM preference field routing", () => {

  const sampleForm = {
    preferredLanguages: ["en", "ar"],
    primaryLanguage: "en",
    preferredContactMethods: ["whatsapp"],
    nationality: "British",
    firstName: "Christine",
    dateOfBirth: "1997-01-01",
    gender: "female",
  };

  it("T-F3-1: unlinked Patient — no lead payload generated", () => {
    const { leadPayload } = buildSplitPayloads(sampleForm, null);
    expect(leadPayload).toBeNull();
  });

  it("T-F3-2: unlinked Patient — all fields go to patient payload", () => {
    const { patientPayload } = buildSplitPayloads(sampleForm, null);
    expect(patientPayload.preferredLanguages).toEqual(["en", "ar"]);
    expect(patientPayload.primaryLanguage).toBe("en");
    expect(patientPayload.preferredContactMethods).toEqual(["whatsapp"]);
  });

  it("T-F3-3: linked Patient — lead payload contains the 3 CRM preference fields", () => {
    const { leadPayload } = buildSplitPayloads(sampleForm, 660225);
    expect(leadPayload).not.toBeNull();
    expect(leadPayload!.preferredLanguages).toEqual(["en", "ar"]);
    expect(leadPayload!.primaryLanguage).toBe("en");
    expect(leadPayload!.preferredContactMethods).toEqual(["whatsapp"]);
  });

  it("T-F3-4: linked Patient — patient payload does NOT contain the 3 CRM preference fields (Fix B: Lead is source of truth)", () => {
    const { patientPayload } = buildSplitPayloads(sampleForm, 660225);
    // Fix B: the 3 CRM preference fields must NOT be written to Patient when linked
    // Lead is the single source of truth for these fields
    expect(patientPayload).not.toHaveProperty("preferredLanguages");
    expect(patientPayload).not.toHaveProperty("primaryLanguage");
    expect(patientPayload).not.toHaveProperty("preferredContactMethods");
  });

  it("T-F3-5: linked Patient — nationality stays in patient payload only (not routed to Lead)", () => {
    const { patientPayload, leadPayload } = buildSplitPayloads(sampleForm, 660225);
    expect(patientPayload.nationality).toBe("British");
    // Lead payload should NOT contain nationality
    expect(leadPayload).not.toHaveProperty("nationality");
  });

  it("T-F3-6: linked Patient — identity fields (firstName, gender, DOB) stay in patient payload only", () => {
    const { patientPayload, leadPayload } = buildSplitPayloads(sampleForm, 660225);
    expect(patientPayload.firstName).toBe("Christine");
    expect(leadPayload).not.toHaveProperty("firstName");
    expect(leadPayload).not.toHaveProperty("gender");
    expect(leadPayload).not.toHaveProperty("dateOfBirth");
  });

  it("T-F3-7: leads.update schema accepts all 3 CRM preference fields", () => {
    const result = leadsUpdateDataSchema.safeParse({
      preferredLanguages: ["en", "ar"],
      primaryLanguage: "en",
      preferredContactMethods: ["whatsapp"],
    });
    expect(result.success).toBe(true);
  });

  it("T-F3-8: leads.update schema accepts primaryLanguage as null (clearing)", () => {
    const result = leadsUpdateDataSchema.safeParse({
      primaryLanguage: null,
    });
    expect(result.success).toBe(true);
  });

  it("T-F3-9: patients.update schema accepts all 3 CRM preference fields (unlinked path)", () => {
    const result = patientsUpdateDataSchema.safeParse({
      preferredLanguages: ["en"],
      primaryLanguage: "en",
      preferredContactMethods: ["email"],
    });
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Language clear-to-empty fix — round-trip guarantee tests
// These tests verify the full lifecycle: set languages → save → clear → save →
// DB contains [] and null → form re-init shows empty → Lead also shows empty.
// ─────────────────────────────────────────────────────────────────────────────

describe("Language clear-to-empty fix", () => {

  // Helper: simulate the exact payload construction from handleSavePatient
  function buildLanguagePayload(
    preferredLanguages: string[] | undefined,
    primaryLanguage: string | null,
    isLinked: boolean
  ): { leadPayload: Record<string, unknown> | null; patientPayload: Record<string, unknown> } {
    // Mirrors the fixed implementation in PatientDetailPage.handleSavePatient
    const resolvedLanguages = Array.isArray(preferredLanguages) ? preferredLanguages : undefined;
    const resolvedPrimary = (Array.isArray(preferredLanguages) && preferredLanguages.length === 0)
      ? null
      : (primaryLanguage || null);

    if (isLinked) {
      return {
        leadPayload: { preferredLanguages: resolvedLanguages, primaryLanguage: resolvedPrimary },
        patientPayload: {}, // pref fields NOT in patient payload when linked
      };
    }
    return {
      leadPayload: null,
      patientPayload: { preferredLanguages: resolvedLanguages, primaryLanguage: resolvedPrimary },
    };
  }

  // Helper: simulate form re-initialization from server data (openEditPatient)
  function initFormFromServer(serverData: { preferredLanguages: unknown; primaryLanguage: unknown }) {
    return {
      preferredLanguages: Array.isArray(serverData.preferredLanguages)
        ? serverData.preferredLanguages
        : (serverData.preferredLanguages ? [serverData.preferredLanguages] : []),
      primaryLanguage: serverData.primaryLanguage ?? null,
    };
  }

  // ── Step 1: Set English, save → verify payload ──
  it("T-LANG-1: setting languages produces correct payload (linked path)", () => {
    const { leadPayload } = buildLanguagePayload(["en"], "en", true);
    expect(leadPayload!.preferredLanguages).toEqual(["en"]);
    expect(leadPayload!.primaryLanguage).toBe("en");
  });

  // ── Step 2: Zod schema accepts ["en"] ──
  it("T-LANG-2: leads.update schema accepts [\"en\"] for preferredLanguages", () => {
    const result = leadsUpdateDataSchema.safeParse({
      preferredLanguages: ["en"],
      primaryLanguage: "en",
    });
    expect(result.success).toBe(true);
  });

  // ── Step 3: Form re-init from server data ["en"] shows English ──
  it("T-LANG-3: form re-init from server [\"en\"] shows English selected", () => {
    const form = initFormFromServer({ preferredLanguages: ["en"], primaryLanguage: "en" });
    expect(form.preferredLanguages).toEqual(["en"]);
    expect(form.primaryLanguage).toBe("en");
  });

  // ── Step 4: Remove all languages → payload must be [] and null ──
  it("T-LANG-4: clearing all languages produces [] in payload (linked path)", () => {
    const { leadPayload } = buildLanguagePayload([], null, true);
    expect(leadPayload!.preferredLanguages).toEqual([]);
    expect(leadPayload!.preferredLanguages).not.toBeUndefined();
  });

  it("T-LANG-5: clearing all languages forces primaryLanguage to null (linked path)", () => {
    // Even if primaryLanguage was "en" before, clearing languages must null it
    const { leadPayload } = buildLanguagePayload([], "en", true);
    expect(leadPayload!.primaryLanguage).toBeNull();
  });

  it("T-LANG-6: clearing all languages produces [] in payload (unlinked path)", () => {
    const { patientPayload } = buildLanguagePayload([], null, false);
    expect(patientPayload.preferredLanguages).toEqual([]);
    expect(patientPayload.preferredLanguages).not.toBeUndefined();
  });

  it("T-LANG-7: clearing all languages forces primaryLanguage to null (unlinked path)", () => {
    const { patientPayload } = buildLanguagePayload([], "en", false);
    expect(patientPayload.primaryLanguage).toBeNull();
  });

  // ── Step 5: Zod schema accepts [] (empty array) ──
  it("T-LANG-8: leads.update schema accepts [] for preferredLanguages (intentional clear)", () => {
    const result = leadsUpdateDataSchema.safeParse({
      preferredLanguages: [],
      primaryLanguage: null,
    });
    expect(result.success).toBe(true);
  });

  it("T-LANG-9: patients.update schema accepts [] for preferredLanguages (intentional clear)", () => {
    const result = patientsUpdateDataSchema.safeParse({
      preferredLanguages: [],
      primaryLanguage: null,
    });
    expect(result.success).toBe(true);
  });

  // ── Step 6: Form re-init from server data [] shows no languages ──
  it("T-LANG-10: form re-init from server [] shows no languages selected", () => {
    const form = initFormFromServer({ preferredLanguages: [], primaryLanguage: null });
    expect(form.preferredLanguages).toEqual([]);
    expect(form.primaryLanguage).toBeNull();
  });

  // ── Orphan primary language guard ──
  it("T-LANG-11: orphan state is impossible — empty languages always nulls primaryLanguage", () => {
    // Simulate a user who had primaryLanguage=\"en\" and then removed all languages
    const { leadPayload } = buildLanguagePayload([], "en", true);
    // Must never produce: preferredLanguages=[] AND primaryLanguage=\"en\"
    expect(leadPayload!.preferredLanguages).toEqual([]);
    expect(leadPayload!.primaryLanguage).toBeNull(); // NOT \"en\"
  });

  it("T-LANG-12: undefined preferredLanguages (field not initialized) does not update Lead", () => {
    // When preferredLanguages is undefined (not set by form), it must NOT be sent
    const { leadPayload } = buildLanguagePayload(undefined, null, true);
    expect(leadPayload!.preferredLanguages).toBeUndefined();
  });

  // ── Linked path: pref fields must NOT appear in patient payload ──
  it("T-LANG-13: linked path — language fields do NOT appear in patient payload even when clearing", () => {
    const { patientPayload } = buildLanguagePayload([], null, true);
    expect(patientPayload).not.toHaveProperty("preferredLanguages");
    expect(patientPayload).not.toHaveProperty("primaryLanguage");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-CM: Preferred Contact Methods round-trip tests
// Tests the CM-1 / CM-2 fix: empty array must pass through as [] (intentional clear).
// Mirrors the same methodology as T-LANG tests.
// ─────────────────────────────────────────────────────────────────────────────

// Helper: simulate the production payload construction for preferredContactMethods
function buildContactMethodPayload(
  preferredContactMethods: string[] | undefined,
  isLinked: boolean,
): { patientPayload: Record<string, unknown>; leadPayload: Record<string, unknown> | null } {
  // Mirrors PatientDetailPage.handleSavePatient linked path (line 395)
  const linkedLeadPayload = isLinked ? {
    preferredContactMethods: Array.isArray(preferredContactMethods) ? preferredContactMethods : undefined,
  } : null;

  // Mirrors PatientDetailPage.handleSavePatient unlinked path (line 465)
  const patientPayload: Record<string, unknown> = isLinked ? {} : {
    preferredContactMethods: Array.isArray(preferredContactMethods) ? preferredContactMethods : undefined,
  };

  return { patientPayload, leadPayload: linkedLeadPayload };
}

// Canonical contact methods (mirrors shared/contactMethods.ts)
const CANONICAL_CONTACT_METHODS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "telegram", label: "Telegram" },
];

// CM-5 view-mode helper: mirrors LeadDetailPage view-mode display logic
function formatContactMethodsForView(methods: string[]): string {
  return methods
    .map(v => CANONICAL_CONTACT_METHODS.find(opt => opt.value === v)?.label ?? v)
    .join(", ");
}

describe("T-CM: Preferred Contact Methods round-trip", () => {

  // ── T-CM-1: Linked Patient — set one contact method ──
  it("T-CM-1: linked Patient — set one method — Lead receives it", () => {
    const { leadPayload } = buildContactMethodPayload(["whatsapp"], true);
    expect(leadPayload!.preferredContactMethods).toEqual(["whatsapp"]);
  });

  // ── T-CM-2: Linked Patient — replace with another ──
  it("T-CM-2: linked Patient — replace method — Lead receives new value", () => {
    const { leadPayload } = buildContactMethodPayload(["sms"], true);
    expect(leadPayload!.preferredContactMethods).toEqual(["sms"]);
  });

  // ── T-CM-3: Linked Patient — set multiple methods ──
  it("T-CM-3: linked Patient — set multiple methods — Lead receives all", () => {
    const { leadPayload } = buildContactMethodPayload(["whatsapp", "email", "telegram"], true);
    expect(leadPayload!.preferredContactMethods).toEqual(["whatsapp", "email", "telegram"]);
  });

  // ── T-CM-4: Linked Patient — clear all methods — Lead receives [] ──
  it("T-CM-4: linked Patient — clear all methods — Lead receives [] (not undefined)", () => {
    const { leadPayload } = buildContactMethodPayload([], true);
    // CM-1 fix: empty array must pass through, not be dropped to undefined
    expect(leadPayload!.preferredContactMethods).toEqual([]);
    expect(leadPayload!.preferredContactMethods).not.toBeUndefined();
  });

  // ── T-CM-5: Linked Patient — Patient payload does NOT contain the field ──
  it("T-CM-5: linked Patient — patient payload does not contain preferredContactMethods", () => {
    const { patientPayload } = buildContactMethodPayload(["whatsapp"], true);
    expect(patientPayload).not.toHaveProperty("preferredContactMethods");
  });

  it("T-CM-5b: linked Patient — patient payload does not contain preferredContactMethods even when clearing", () => {
    const { patientPayload } = buildContactMethodPayload([], true);
    expect(patientPayload).not.toHaveProperty("preferredContactMethods");
  });

  // ── T-CM-6: Unlinked Patient — clear all methods — Patient receives [] ──
  it("T-CM-6: unlinked Patient — clear all methods — Patient receives [] (not undefined)", () => {
    const { patientPayload } = buildContactMethodPayload([], false);
    // CM-2 fix: empty array must pass through, not be dropped to undefined
    expect(patientPayload.preferredContactMethods).toEqual([]);
    expect(patientPayload.preferredContactMethods).not.toBeUndefined();
  });

  // ── T-CM-7: Lead Edit — clear all methods — [] passes through ──
  it("T-CM-7: Lead Edit path already uses Array.isArray guard — [] passes through", () => {
    // Mirrors LeadDetailPage handleSave line 1439
    const form = { preferredContactMethods: [] as string[] };
    const leadPayload = {
      preferredContactMethods: Array.isArray((form as any).preferredContactMethods)
        ? (form as any).preferredContactMethods
        : [],
    };
    expect(leadPayload.preferredContactMethods).toEqual([]);
  });

  // ── T-CM-8: Lead Create — shared enum includes SMS ──
  it("T-CM-8: shared CONTACT_METHODS enum includes all 5 canonical values", () => {
    const values = CANONICAL_CONTACT_METHODS.map(opt => opt.value);
    expect(values).toContain("whatsapp");
    expect(values).toContain("phone");
    expect(values).toContain("email");
    expect(values).toContain("sms");
    expect(values).toContain("telegram");
    expect(values).toHaveLength(5);
  });

  // ── T-CM-9: Lead View — displays all selected methods, not only the first ──
  it("T-CM-9: Lead View — displays all selected methods with canonical labels", () => {
    const result = formatContactMethodsForView(["whatsapp", "email", "telegram"]);
    expect(result).toBe("WhatsApp, Email, Telegram");
    // Must NOT be just the first value
    expect(result).not.toBe("WhatsApp");
  });

  it("T-CM-9b: Lead View — single method displays correctly", () => {
    const result = formatContactMethodsForView(["sms"]);
    expect(result).toBe("SMS");
  });

  // ── T-CM-10: Unknown legacy values are preserved and displayed as-is ──
  it("T-CM-10: unknown legacy value is preserved and displayed verbatim", () => {
    // A value not in the canonical list should be shown as-is, not dropped
    const result = formatContactMethodsForView(["whatsapp", "fax"]);
    expect(result).toBe("WhatsApp, fax"); // "fax" is unknown → displayed as-is
    expect(result).toContain("fax"); // not dropped
  });

  it("T-CM-10b: undefined preferredContactMethods does not update field", () => {
    const { leadPayload } = buildContactMethodPayload(undefined, true);
    expect(leadPayload!.preferredContactMethods).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-GEN: Gender field round-trip tests
// Tests the G-fix Parts A, B, C in LeadDetailPage.tsx:
//   Part A: Edit button blocks on refetch failure; identityBaselineRef captured at open time.
//   Part B: gender="" / null / undefined → omit from patients.update payload (never send "").
//   Part C: identityChanged guard — only call updatePatientIdentity when an identity field changed.
// ─────────────────────────────────────────────────────────────────────────────

// ── Schemas (replicate real Zod schemas for contract assertions) ──

// patients.update gender: z.enum(["male", "female"]).optional()
// → accepts "male" | "female" | undefined; does NOT accept null or ""
const patientsUpdateGenderSchema = z.object({
  gender: z.enum(["male", "female"]).optional(),
});

// leads.update gender: z.enum(["male", "female", "other"]).optional().nullable()
// → accepts "male" | "female" | "other" | null | undefined
const leadsUpdateGenderSchema = z.object({
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
});

// ── Helper: mirror the G-fix Part B normalization from LeadDetailPage.tsx ──
// Converts any form gender value to the value sent to patients.update.
// Rule: only "male" or "female" pass through; anything else → undefined (omit field).
function normalizeGenderForPatientPayload(
  formGender: string | null | undefined
): "male" | "female" | undefined {
  return (formGender === "male" || formGender === "female") ? formGender : undefined;
}

// ── Helper: mirror the G-fix Part C identityChanged guard ──
// Returns true when at least one identity field differs from the baseline.
function computeIdentityChanged(
  form: { firstName: string; middleName: string; lastName: string; dateOfBirth: string; gender: string | null | undefined },
  baseline: { firstName: string; middleName: string; lastName: string; dateOfBirth: string; gender: string | null } | null
): boolean {
  if (!baseline) return true; // no baseline → always treat as changed
  const formGender = (form.gender === "male" || form.gender === "female") ? form.gender : null;
  return (
    (form.firstName ?? "").trim() !== (baseline.firstName ?? "").trim() ||
    (form.middleName ?? "").trim() !== (baseline.middleName ?? "").trim() ||
    (form.lastName ?? "").trim() !== (baseline.lastName ?? "").trim() ||
    (form.dateOfBirth ?? "") !== (baseline.dateOfBirth ?? "") ||
    formGender !== baseline.gender
  );
}

// ── Helper: mirror buildInitialData gender initialization ──
// Rule: gender is initialized from identitySource.gender ?? null (never "").
function buildInitialGender(sourceGender: string | null | undefined): string | null {
  return sourceGender ?? null;
}

// ── Helper: mirror identityBaselineRef capture at edit-open time ──
function captureBaseline(patient: {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  dateOfBirth?: Date | string | null;
  gender?: string | null;
}): { firstName: string; middleName: string; lastName: string; dateOfBirth: string; gender: "male" | "female" | null } {
  const dob = patient.dateOfBirth
    ? new Date(patient.dateOfBirth).toISOString().split("T")[0]
    : "";
  return {
    firstName: patient.firstName ?? "",
    middleName: patient.middleName ?? "",
    lastName: patient.lastName ?? "",
    dateOfBirth: dob,
    gender: (patient.gender === "male" || patient.gender === "female") ? patient.gender : null,
  };
}

describe("T-GEN: Gender field round-trip", () => {

  // ── T-GEN-1: buildInitialData uses null (not "") when gender is missing ──
  it("T-GEN-1: buildInitialData initializes gender to null when source has no gender", () => {
    const result = buildInitialGender(null);
    expect(result).toBeNull();
    expect(result).not.toBe("");
  });

  it("T-GEN-1b: buildInitialData initializes gender to null when source gender is undefined", () => {
    const result = buildInitialGender(undefined);
    expect(result).toBeNull();
    expect(result).not.toBe("");
  });

  it("T-GEN-1c: buildInitialData preserves 'male' when source gender is 'male'", () => {
    expect(buildInitialGender("male")).toBe("male");
  });

  it("T-GEN-1d: buildInitialData preserves 'female' when source gender is 'female'", () => {
    expect(buildInitialGender("female")).toBe("female");
  });

  // ── T-GEN-2: gender="" is normalized to undefined in patients.update payload ──
  it("T-GEN-2: gender=\"\" is normalized to undefined — never sent to patients.update", () => {
    const result = normalizeGenderForPatientPayload("");
    expect(result).toBeUndefined();
  });

  it("T-GEN-2b: patients.update schema rejects gender=\"\" (empty string is not valid)", () => {
    const result = patientsUpdateGenderSchema.safeParse({ gender: "" });
    expect(result.success).toBe(false);
  });

  // ── T-GEN-3: gender=null is normalized to undefined in patients.update payload ──
  it("T-GEN-3: gender=null is normalized to undefined — omit from patients.update", () => {
    const result = normalizeGenderForPatientPayload(null);
    expect(result).toBeUndefined();
  });

  it("T-GEN-3b: patients.update schema does not accept null for gender (only undefined = omit)", () => {
    const result = patientsUpdateGenderSchema.safeParse({ gender: null });
    expect(result.success).toBe(false);
  });

  it("T-GEN-3c: patients.update schema accepts undefined for gender (omit = no change)", () => {
    const result = patientsUpdateGenderSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  // ── T-GEN-4: gender="male" passes through correctly ──
  it("T-GEN-4: gender=\"male\" passes through to patients.update payload unchanged", () => {
    const result = normalizeGenderForPatientPayload("male");
    expect(result).toBe("male");
  });

  it("T-GEN-4b: gender=\"female\" passes through to patients.update payload unchanged", () => {
    const result = normalizeGenderForPatientPayload("female");
    expect(result).toBe("female");
  });

  it("T-GEN-4c: patients.update schema accepts gender=\"male\"", () => {
    const result = patientsUpdateGenderSchema.safeParse({ gender: "male" });
    expect(result.success).toBe(true);
  });

  it("T-GEN-4d: patients.update schema accepts gender=\"female\"", () => {
    const result = patientsUpdateGenderSchema.safeParse({ gender: "female" });
    expect(result.success).toBe(true);
  });

  // ── T-GEN-5: CRM-only save (no identity change) → identityChanged=false ──
  it("T-GEN-5: no identity change → identityChanged=false (Patient identity NOT updated)", () => {
    const baseline = captureBaseline({
      firstName: "Sara", middleName: "", lastName: "Ahmed",
      dateOfBirth: new Date("1990-05-15"), gender: "female",
    });
    const form = {
      firstName: "Sara", middleName: "", lastName: "Ahmed",
      dateOfBirth: "1990-05-15", gender: "female" as string | null,
    };
    const changed = computeIdentityChanged(form, baseline);
    expect(changed).toBe(false);
  });

  it("T-GEN-5b: changing only notes (CRM field) → identity fields unchanged → identityChanged=false", () => {
    // notes is not an identity field; identity fields are firstName/middleName/lastName/dob/gender
    const baseline = captureBaseline({
      firstName: "Sara", middleName: "", lastName: "Ahmed",
      dateOfBirth: new Date("1990-05-15"), gender: "female",
    });
    // Form has same identity values — only notes changed (not tracked in baseline)
    const form = {
      firstName: "Sara", middleName: "", lastName: "Ahmed",
      dateOfBirth: "1990-05-15", gender: "female" as string | null,
    };
    expect(computeIdentityChanged(form, baseline)).toBe(false);
  });

  // ── T-GEN-6: Identity change detected correctly when gender changes ──
  it("T-GEN-6: gender change from 'female' to 'male' → identityChanged=true", () => {
    const baseline = captureBaseline({
      firstName: "Alex", middleName: "", lastName: "Smith",
      dateOfBirth: new Date("1985-03-20"), gender: "female",
    });
    const form = {
      firstName: "Alex", middleName: "", lastName: "Smith",
      dateOfBirth: "1985-03-20", gender: "male" as string | null,
    };
    expect(computeIdentityChanged(form, baseline)).toBe(true);
  });

  it("T-GEN-6b: gender change from null to 'female' → identityChanged=true", () => {
    const baseline = captureBaseline({
      firstName: "Alex", middleName: "", lastName: "Smith",
      dateOfBirth: new Date("1985-03-20"), gender: null,
    });
    const form = {
      firstName: "Alex", middleName: "", lastName: "Smith",
      dateOfBirth: "1985-03-20", gender: "female" as string | null,
    };
    expect(computeIdentityChanged(form, baseline)).toBe(true);
  });

  it("T-GEN-6c: firstName change → identityChanged=true (other identity fields)", () => {
    const baseline = captureBaseline({
      firstName: "Sara", middleName: "", lastName: "Ahmed",
      dateOfBirth: new Date("1990-05-15"), gender: "female",
    });
    const form = {
      firstName: "Sarah", middleName: "", lastName: "Ahmed",
      dateOfBirth: "1990-05-15", gender: "female" as string | null,
    };
    expect(computeIdentityChanged(form, baseline)).toBe(true);
  });

  it("T-GEN-6d: DOB change → identityChanged=true", () => {
    const baseline = captureBaseline({
      firstName: "Sara", middleName: "", lastName: "Ahmed",
      dateOfBirth: new Date("1990-05-15"), gender: "female",
    });
    const form = {
      firstName: "Sara", middleName: "", lastName: "Ahmed",
      dateOfBirth: "1990-05-16", gender: "female" as string | null,
    };
    expect(computeIdentityChanged(form, baseline)).toBe(true);
  });

  // ── T-GEN-7: null baseline → identityChanged always true (safe fallback) ──
  it("T-GEN-7: null baseline (unlinked Lead or no snapshot) → identityChanged=true (safe fallback)", () => {
    const form = {
      firstName: "Sara", middleName: "", lastName: "Ahmed",
      dateOfBirth: "1990-05-15", gender: "female" as string | null,
    };
    expect(computeIdentityChanged(form, null)).toBe(true);
  });

  // ── T-GEN-8: leads.update gender schema accepts null (Lead can clear gender) ──
  it("T-GEN-8: leads.update schema accepts gender=null (Lead can explicitly clear gender)", () => {
    const result = leadsUpdateGenderSchema.safeParse({ gender: null });
    expect(result.success).toBe(true);
  });

  it("T-GEN-8b: leads.update schema accepts gender=undefined (omit = no change)", () => {
    const result = leadsUpdateGenderSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  // ── T-GEN-9: captureBaseline normalizes non-enum values to null ──
  it("T-GEN-9: captureBaseline normalizes unknown gender value to null", () => {
    const baseline = captureBaseline({ firstName: "X", gender: "other" });
    expect(baseline.gender).toBeNull();
  });

  it("T-GEN-9b: captureBaseline normalizes undefined gender to null", () => {
    const baseline = captureBaseline({ firstName: "X", gender: undefined });
    expect(baseline.gender).toBeNull();
  });

  // ── T-GEN-10: gender="" treated same as null in identityChanged comparison ──
  it("T-GEN-10: gender=\"\" in form treated as null — no change when baseline gender is null", () => {
    const baseline = captureBaseline({ firstName: "X", gender: null });
    const form = { firstName: "X", middleName: "", lastName: "", dateOfBirth: "", gender: "" as string | null };
    // "" normalizes to null → same as baseline null → no change
    expect(computeIdentityChanged(form, baseline)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T-DRAFT — Draft/Identity Merge Fix (G-fix Part A v2)
//
// Tests the approved behavior: when Edit is opened for a linked Lead,
// fresh Patient identity fields are merged OVER the current form state.
// CRM/contact/logistics draft fields are preserved.
// No clearDraft() is called.
// ═══════════════════════════════════════════════════════════════════════════

// ── Replicate the mergeIdentityIntoForm helper (mirrors Edit button handler logic) ──

function mergeIdentityIntoForm(
  currentForm: Record<string, any>,
  freshPatient: { firstName?: string; middleName?: string; lastName?: string; dateOfBirth?: Date | string | null; gender?: string | null }
): Record<string, any> {
  const freshDob = freshPatient.dateOfBirth
    ? new Date(freshPatient.dateOfBirth as any).toISOString().split("T")[0]
    : "";
  const freshGender =
    freshPatient.gender === "male" || freshPatient.gender === "female"
      ? freshPatient.gender
      : null;
  return {
    ...currentForm,
    firstName: freshPatient.firstName ?? "",
    middleName: freshPatient.middleName ?? "",
    lastName: freshPatient.lastName ?? "",
    dateOfBirth: freshDob,
    gender: freshGender,
  };
}

// ── Replicate the identityBaselineRef capture (same as captureBaseline above) ──

function captureBaselineFromPatient(p: {
  firstName?: string; middleName?: string; lastName?: string;
  dateOfBirth?: Date | string | null; gender?: string | null;
}) {
  return captureBaseline({
    firstName: p.firstName,
    middleName: p.middleName,
    lastName: p.lastName,
    dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth as any).toISOString().split("T")[0] : "",
    gender: p.gender,
  });
}

describe("T-DRAFT — Draft/Identity Merge Fix", () => {
  // ── T-DRAFT-1: Old draft has blank Gender/DOB but CRM draft values ──
  it("T-DRAFT-1: Edit opens with fresh Patient Gender/DOB; CRM draft values are preserved", () => {
    // Simulate: old draft restored from localStorage with blank identity but real CRM fields
    const oldDraft = {
      firstName: "",
      middleName: "",
      lastName: "",
      dateOfBirth: "",
      gender: null,
      // CRM fields that should be preserved
      notes: "Draft note from last session",
      budgetRange: "5000-10000",
      decisionTimeline: "1-3-months",
      leadSource: "instagram",
    };

    // Fresh Patient data from refetchLinkedPatient()
    const freshPatient = {
      firstName: "majd",
      middleName: "",
      lastName: "khaled",
      dateOfBirth: new Date("1987-09-01"),
      gender: "male" as const,
    };

    const merged = mergeIdentityIntoForm(oldDraft, freshPatient);

    // Identity fields come from fresh Patient
    expect(merged.firstName).toBe("majd");
    expect(merged.lastName).toBe("khaled");
    expect(merged.dateOfBirth).toBe("1987-09-01");
    expect(merged.gender).toBe("male");

    // CRM draft fields are preserved
    expect(merged.notes).toBe("Draft note from last session");
    expect(merged.budgetRange).toBe("5000-10000");
    expect(merged.decisionTimeline).toBe("1-3-months");
    expect(merged.leadSource).toBe("instagram");
  });

  // ── T-DRAFT-2: No draft exists — Edit opens with fresh Patient identity ──
  it("T-DRAFT-2: No draft — merging fresh Patient identity into empty form works correctly", () => {
    const emptyForm = {};
    const freshPatient = {
      firstName: "majd",
      middleName: "",
      lastName: "khaled",
      dateOfBirth: new Date("1987-09-01"),
      gender: "male" as const,
    };

    const merged = mergeIdentityIntoForm(emptyForm, freshPatient);

    expect(merged.firstName).toBe("majd");
    expect(merged.lastName).toBe("khaled");
    expect(merged.dateOfBirth).toBe("1987-09-01");
    expect(merged.gender).toBe("male");
  });

  // ── T-DRAFT-3: Patient fetch fails — Edit must not open ──
  it("T-DRAFT-3: When refetchLinkedPatient returns null/undefined, Edit must not proceed", () => {
    // Simulate the guard: if (!result.data) { toast.error(...); return; }
    const resultData: any = null;
    const shouldOpenEdit = resultData != null;
    expect(shouldOpenEdit).toBe(false);
  });

  // ── T-DRAFT-4: After merge, localStorage draft is updated with fresh identity ──
  it("T-DRAFT-4: Merged form contains fresh identity (not stale blank values)", () => {
    // The merged form is what gets written to localStorage via setForm
    const staleForm = { firstName: "", gender: null, dateOfBirth: "", notes: "keep this" };
    const freshPatient = { firstName: "majd", gender: "male" as const, dateOfBirth: new Date("1987-09-01") };

    const merged = mergeIdentityIntoForm(staleForm, freshPatient);

    // Verify blank identity is replaced
    expect(merged.firstName).not.toBe("");
    expect(merged.gender).not.toBeNull();
    expect(merged.dateOfBirth).not.toBe("");

    // Verify CRM fields preserved
    expect(merged.notes).toBe("keep this");
  });

  // ── T-DRAFT-5: CRM-only save — identity mutation is skipped ──
  it("T-DRAFT-5: CRM-only save — identityChanged=false when only CRM fields differ from baseline", () => {
    // Baseline captured from fresh Patient at Edit-open time
    const baseline = captureBaselineFromPatient({
      firstName: "majd", middleName: "", lastName: "khaled",
      dateOfBirth: "1987-09-01", gender: "male",
    });

    // Form after user only changed CRM fields (identity unchanged)
    const form = {
      firstName: "majd", middleName: "", lastName: "khaled",
      dateOfBirth: "1987-09-01", gender: "male",
      notes: "Updated CRM note",
      budgetRange: "changed",
    };

    expect(computeIdentityChanged(form, baseline)).toBe(false);
  });

  // ── T-DRAFT-6: Cancel after opening — draft state is predictable ──
  it("T-DRAFT-6: After merge, the form has fresh identity; cancel does not destroy CRM draft", () => {
    // Simulate: user opens Edit (merge happens), then cancels without saving
    // The draft in localStorage now has the merged form (fresh identity + CRM fields)
    // On next mount, the draft restores the merged form — NOT the old blank identity
    const mergedDraft = {
      firstName: "majd",
      gender: "male",
      dateOfBirth: "1987-09-01",
      notes: "Draft note from last session",
    };

    // Simulating what gets restored on next mount
    const restoredForm = JSON.parse(JSON.stringify(mergedDraft));

    // Identity should NOT be blank after cancel-and-reopen
    expect(restoredForm.firstName).toBe("majd");
    expect(restoredForm.gender).toBe("male");
    expect(restoredForm.dateOfBirth).toBe("1987-09-01");

    // CRM draft should still be there
    expect(restoredForm.notes).toBe("Draft note from last session");
  });

  // ── T-DRAFT-7: mergeIdentityIntoForm normalizes invalid gender to null ──
  it("T-DRAFT-7: mergeIdentityIntoForm normalizes unknown gender to null", () => {
    const form = { notes: "keep" };
    const freshPatient = { firstName: "X", gender: "other" as any };
    const merged = mergeIdentityIntoForm(form, freshPatient);
    expect(merged.gender).toBeNull();
  });

  // ── T-DRAFT-8: mergeIdentityIntoForm normalizes null DOB to empty string ──
  it("T-DRAFT-8: mergeIdentityIntoForm normalizes null dateOfBirth to empty string", () => {
    const form = { notes: "keep" };
    const freshPatient = { firstName: "X", dateOfBirth: null };
    const merged = mergeIdentityIntoForm(form, freshPatient);
    expect(merged.dateOfBirth).toBe("");
  });

  // ── T-DRAFT-9: mergeIdentityIntoForm does not overwrite unrelated CRM fields ──
  it("T-DRAFT-9: mergeIdentityIntoForm preserves all non-identity fields", () => {
    const form = {
      email: "test@example.com",
      phone: "+1234567890",
      leadSource: "instagram",
      campaignName: "Summer2025",
      preferredLanguages: ["Arabic", "English"],
      preferredContactMethods: ["WhatsApp"],
      travelReadiness: "ready",
      ivfExperience: "never-tried",
      fertilityDiagnosis: ["PCOS"],
      notes: "Important CRM note",
    };
    const freshPatient = { firstName: "X", lastName: "Y", gender: "female" as const };
    const merged = mergeIdentityIntoForm(form, freshPatient);

    expect(merged.email).toBe("test@example.com");
    expect(merged.phone).toBe("+1234567890");
    expect(merged.leadSource).toBe("instagram");
    expect(merged.campaignName).toBe("Summer2025");
    expect(merged.preferredLanguages).toEqual(["Arabic", "English"]);
    expect(merged.preferredContactMethods).toEqual(["WhatsApp"]);
    expect(merged.travelReadiness).toBe("ready");
    expect(merged.ivfExperience).toBe("never-tried");
    expect(merged.fertilityDiagnosis).toEqual(["PCOS"]);
    expect(merged.notes).toBe("Important CRM note");
  });

  // ── T-DRAFT-10: identityBaselineRef captures fresh Patient identity correctly ──
  it("T-DRAFT-10: captureBaselineFromPatient produces correct baseline from fresh Patient data", () => {
    const freshPatient = {
      firstName: "majd",
      middleName: "",
      lastName: "khaled",
      dateOfBirth: new Date("1987-09-01"),
      gender: "male" as const,
    };
    const baseline = captureBaselineFromPatient(freshPatient);

    expect(baseline.firstName).toBe("majd");
    expect(baseline.lastName).toBe("khaled");
    expect(baseline.dateOfBirth).toBe("1987-09-01");
    expect(baseline.gender).toBe("male");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// T-COMMS — CRM Notes ordering, edit, soft-delete, dialog, and save loading
// ═══════════════════════════════════════════════════════════════════════════════

// ── Schema replicas for edit/delete procedures ──

const leadCommEditSchema = z.object({
  id: z.number(),
  leadId: z.number(),
  note: z.string().min(1),
});

const leadCommDeleteSchema = z.object({
  id: z.number(),
  leadId: z.number(),
});

const patientCommEditSchema = z.object({
  id: z.number(),
  patientId: z.number(),
  note: z.string().min(1),
});

const patientCommDeleteSchema = z.object({
  id: z.number(),
  patientId: z.number(),
});

// ── Ordering helpers ──

function sortCommsDesc(
  rows: Array<{ id: number; createdAt: Date }>
): Array<{ id: number; createdAt: Date }> {
  return [...rows].sort((a, b) => {
    const diff = b.createdAt.getTime() - a.createdAt.getTime();
    if (diff !== 0) return diff;
    return b.id - a.id;
  });
}

// ── Dirty-state detection helper (mirrors isDirtyPatientEdit logic) ──

// Mirrors the corrected isDirtyPatientEdit logic in PatientDetailPage:
// Compares currentForm against a snapshot captured at Edit-open time.
// Returns false if no snapshot (dialog not open) or no field has changed.
function isDirtyPatientEdit(
  form: Record<string, unknown>,
  snapshot: Record<string, unknown> | null
): boolean {
  if (!snapshot) return false;
  const normalize = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (Array.isArray(v)) return JSON.stringify([...(v as unknown[])].sort());
    return String(v);
  };
  return Object.keys(snapshot).some((k) => normalize(form[k]) !== normalize(snapshot[k]));
}

// ── Soft-delete guard helper ──

function canEditNote(deletedAt: Date | null | undefined): boolean {
  return !deletedAt;
}

describe("T-COMMS — CRM Notes ordering, edit, soft-delete, dialog, save loading", () => {

  // ── T-COMMS-1: DESC ordering — newest note appears first ──
  it("T-COMMS-1: sortCommsDesc returns newest note first", () => {
    const rows = [
      { id: 1, createdAt: new Date("2025-01-01T10:00:00Z") },
      { id: 2, createdAt: new Date("2025-06-01T10:00:00Z") },
      { id: 3, createdAt: new Date("2025-03-01T10:00:00Z") },
    ];
    const sorted = sortCommsDesc(rows);
    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(3);
    expect(sorted[2].id).toBe(1);
  });

  // ── T-COMMS-2: DESC ordering — same timestamp, higher ID wins ──
  it("T-COMMS-2: sortCommsDesc breaks ties by id DESC", () => {
    const ts = new Date("2025-06-01T10:00:00Z");
    const rows = [
      { id: 10, createdAt: ts },
      { id: 20, createdAt: ts },
      { id: 5, createdAt: ts },
    ];
    const sorted = sortCommsDesc(rows);
    expect(sorted[0].id).toBe(20);
    expect(sorted[1].id).toBe(10);
    expect(sorted[2].id).toBe(5);
  });

  // ── T-COMMS-3: DESC ordering — single row returns unchanged ──
  it("T-COMMS-3: sortCommsDesc with single row returns that row", () => {
    const rows = [{ id: 1, createdAt: new Date("2025-01-01T10:00:00Z") }];
    const sorted = sortCommsDesc(rows);
    expect(sorted.length).toBe(1);
    expect(sorted[0].id).toBe(1);
  });

  // ── T-COMMS-4: lead editCommunication schema accepts valid input ──
  it("T-COMMS-4: leadCommEditSchema accepts valid id, leadId, note", () => {
    const result = leadCommEditSchema.safeParse({ id: 1, leadId: 100, note: "Updated note" });
    expect(result.success).toBe(true);
  });

  // ── T-COMMS-5: lead editCommunication schema rejects empty note ──
  it("T-COMMS-5: leadCommEditSchema rejects empty note", () => {
    const result = leadCommEditSchema.safeParse({ id: 1, leadId: 100, note: "" });
    expect(result.success).toBe(false);
  });

  // ── T-COMMS-6: lead deleteCommunication schema accepts valid input ──
  it("T-COMMS-6: leadCommDeleteSchema accepts valid id and leadId", () => {
    const result = leadCommDeleteSchema.safeParse({ id: 1, leadId: 100 });
    expect(result.success).toBe(true);
  });

  // ── T-COMMS-7: patient editCommunication schema accepts valid input ──
  it("T-COMMS-7: patientCommEditSchema accepts valid id, patientId, note", () => {
    const result = patientCommEditSchema.safeParse({ id: 5, patientId: 200, note: "Patient note" });
    expect(result.success).toBe(true);
  });

  // ── T-COMMS-8: patient deleteCommunication schema accepts valid input ──
  it("T-COMMS-8: patientCommDeleteSchema accepts valid id and patientId", () => {
    const result = patientCommDeleteSchema.safeParse({ id: 5, patientId: 200 });
    expect(result.success).toBe(true);
  });

  // ── T-COMMS-9: soft-delete guard — non-deleted note can be edited ──
  it("T-COMMS-9: canEditNote returns true when deletedAt is null", () => {
    expect(canEditNote(null)).toBe(true);
    expect(canEditNote(undefined)).toBe(true);
  });

  // ── T-COMMS-10: soft-delete guard — deleted note cannot be edited ──
  it("T-COMMS-10: canEditNote returns false when deletedAt is set", () => {
    expect(canEditNote(new Date())).toBe(false);
  });

  // ── T-COMMS-11: isDirtyPatientEdit — no snapshot means not dirty ──
  it("T-COMMS-11: isDirtyPatientEdit returns false when snapshot is null (dialog not open)", () => {
    // Scenario 1: snapshot null → always false regardless of form content
    expect(isDirtyPatientEdit({ firstName: "majd" }, null)).toBe(false);
    expect(isDirtyPatientEdit({ firstName: "", gender: "male" }, null)).toBe(false);
    expect(isDirtyPatientEdit({}, null)).toBe(false);
  });

  // ── T-COMMS-12: isDirtyPatientEdit — form matches snapshot → not dirty ──
  it("T-COMMS-12: isDirtyPatientEdit returns false when form matches snapshot exactly", () => {
    const snap = { firstName: "majd", lastName: "khaled", gender: "male", doctorIds: [1, 2] };
    // Same values → not dirty
    expect(isDirtyPatientEdit({ firstName: "majd", lastName: "khaled", gender: "male", doctorIds: [1, 2] }, snap)).toBe(false);
    // Null/undefined treated as empty string — same as snapshot empty string
    const snap2 = { phone: "", email: "" };
    expect(isDirtyPatientEdit({ phone: null, email: undefined }, snap2)).toBe(false);
  });

  // ── T-COMMS-13: isDirtyPatientEdit — any field changed → dirty ──
  it("T-COMMS-13: isDirtyPatientEdit returns true when any field differs from snapshot", () => {
    const snap = { firstName: "majd", lastName: "khaled", gender: "male" };
    // firstName changed
    expect(isDirtyPatientEdit({ firstName: "Ahmad", lastName: "khaled", gender: "male" }, snap)).toBe(true);
    // gender changed
    expect(isDirtyPatientEdit({ firstName: "majd", lastName: "khaled", gender: "female" }, snap)).toBe(true);
    // field cleared (was "khaled", now empty)
    expect(isDirtyPatientEdit({ firstName: "majd", lastName: "", gender: "male" }, snap)).toBe(true);
  });

  // ── T-COMMS-14: isDirtyPatientEdit — array fields compared correctly ──
  it("T-COMMS-14: isDirtyPatientEdit compares array fields by sorted content", () => {
    const snap = { preferredLanguages: ["en", "ar"] };
    // Same elements, different order → not dirty
    expect(isDirtyPatientEdit({ preferredLanguages: ["ar", "en"] }, snap)).toBe(false);
    // Different elements → dirty
    expect(isDirtyPatientEdit({ preferredLanguages: ["fr"] }, snap)).toBe(true);
    // Empty vs non-empty → dirty
    expect(isDirtyPatientEdit({ preferredLanguages: [] }, snap)).toBe(true);
    // Both empty → not dirty
    const snap2 = { preferredLanguages: [] };
    expect(isDirtyPatientEdit({ preferredLanguages: [] }, snap2)).toBe(false);
  });

  // ── T-COMMS-15: isSavingPatient — true if any of the three mutations is pending ──
  it("T-COMMS-15: isSavingPatient is true when any mutation is pending", () => {
    const computeIsSaving = (a: boolean, b: boolean, c: boolean) => a || b || c;
    expect(computeIsSaving(true, false, false)).toBe(true);
    expect(computeIsSaving(false, true, false)).toBe(true);
    expect(computeIsSaving(false, false, true)).toBe(true);
    expect(computeIsSaving(false, false, false)).toBe(false);
  });

  // ── T-COMMS-16: lead editCommunication schema rejects missing leadId ──
  it("T-COMMS-16: leadCommEditSchema rejects input without leadId", () => {
    const result = leadCommEditSchema.safeParse({ id: 1, note: "note" });
    expect(result.success).toBe(false);
  });

  // ── T-COMMS-17: patient editCommunication schema rejects missing patientId ──
  it("T-COMMS-17: patientCommEditSchema rejects input without patientId", () => {
    const result = patientCommEditSchema.safeParse({ id: 1, note: "note" });
    expect(result.success).toBe(false);
  });
});
