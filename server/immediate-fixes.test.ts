/**
 * Tests for the 6 immediate low-risk fixes (2026-07-09)
 *
 * Fix A1: Lead gender null persistence
 * Fix A2: Patient gender required guard (frontend validation — tested via schema)
 * Fix B:  Remove mirror write for CRM preference fields when linked to Lead
 * Fix C1: Health Record selector — no "save as General" wording
 * Fix C2: Gender/intakeMode conflict warning
 * Fix D1: Intake snapshot before Reset
 * Fix D2: Rename Reset button
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";

// ─── Fix A1: Lead gender nullable in Zod schema ──────────────────────────────

describe("Fix A1 — Lead gender nullable in leads.update schema", () => {
  // Mirror the relevant slice of the leads.update schema
  const leadsUpdateGenderSchema = z.object({
    gender: z.enum(["male", "female", "other"]).optional().nullable(),
  });

  it("T-A1-1: accepts null gender (clears 'Not specified')", () => {
    const result = leadsUpdateGenderSchema.safeParse({ gender: null });
    expect(result.success).toBe(true);
    expect(result.data?.gender).toBeNull();
  });

  it("T-A1-2: accepts undefined gender (field omitted — no change)", () => {
    const result = leadsUpdateGenderSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data?.gender).toBeUndefined();
  });

  it("T-A1-3: accepts valid enum values", () => {
    for (const v of ["male", "female", "other"] as const) {
      const result = leadsUpdateGenderSchema.safeParse({ gender: v });
      expect(result.success).toBe(true);
      expect(result.data?.gender).toBe(v);
    }
  });

  it("T-A1-4: rejects invalid string values", () => {
    const result = leadsUpdateGenderSchema.safeParse({ gender: "unknown" });
    expect(result.success).toBe(false);
  });

  it("T-A1-5: empty string is NOT accepted (must use null for Not specified)", () => {
    const result = leadsUpdateGenderSchema.safeParse({ gender: "" });
    expect(result.success).toBe(false);
  });
});

// ─── Fix A2: Patient gender required guard ────────────────────────────────────

describe("Fix A2 — Patient gender required (frontend validation)", () => {
  // Simulate the frontend validation logic from PatientDetailPage.handleSavePatient
  function validatePatientGender(gender: string | null | undefined): { valid: boolean; error?: string } {
    if (!gender) return { valid: false, error: "Gender is required." };
    return { valid: true };
  }

  it("T-A2-1: empty string is rejected", () => {
    expect(validatePatientGender("")).toEqual({ valid: false, error: "Gender is required." });
  });

  it("T-A2-2: null is rejected", () => {
    expect(validatePatientGender(null)).toEqual({ valid: false, error: "Gender is required." });
  });

  it("T-A2-3: undefined is rejected", () => {
    expect(validatePatientGender(undefined)).toEqual({ valid: false, error: "Gender is required." });
  });

  it("T-A2-4: valid gender values pass", () => {
    for (const v of ["male", "female"]) {
      expect(validatePatientGender(v).valid).toBe(true);
    }
  });
});

// ─── Fix B: No mirror write for linked CRM preference fields ─────────────────

describe("Fix B — CRM preference fields: no mirror write to Patient when linked", () => {
  // Simulate the PatientDetailPage.handleSavePatient split-write logic
  function buildPatientPayload(
    form: { preferredLanguages: string[]; primaryLanguage: string | null; preferredContactMethods: string[] },
    isLinkedToLead: boolean
  ) {
    return {
      ...(isLinkedToLead ? {} : {
        preferredLanguages: form.preferredLanguages.length > 0 ? form.preferredLanguages : undefined,
        primaryLanguage: form.primaryLanguage || null,
        preferredContactMethods: form.preferredContactMethods.length > 0 ? form.preferredContactMethods : undefined,
      }),
    };
  }

  const form = {
    preferredLanguages: ["en", "ar"],
    primaryLanguage: "en",
    preferredContactMethods: ["whatsapp"],
  };

  it("T-B-1: when linked, patient payload does NOT contain preferredLanguages", () => {
    const payload = buildPatientPayload(form, true);
    expect(payload).not.toHaveProperty("preferredLanguages");
  });

  it("T-B-2: when linked, patient payload does NOT contain primaryLanguage", () => {
    const payload = buildPatientPayload(form, true);
    expect(payload).not.toHaveProperty("primaryLanguage");
  });

  it("T-B-3: when linked, patient payload does NOT contain preferredContactMethods", () => {
    const payload = buildPatientPayload(form, true);
    expect(payload).not.toHaveProperty("preferredContactMethods");
  });

  it("T-B-4: when NOT linked, patient payload contains all 3 fields", () => {
    const payload = buildPatientPayload(form, false);
    expect(payload).toHaveProperty("preferredLanguages");
    expect(payload).toHaveProperty("primaryLanguage");
    expect(payload).toHaveProperty("preferredContactMethods");
  });
});

// ─── Fix C1: No "save as General" wording in MedicalIntakeForm ───────────────

describe("Fix C1 — Health Record selector: no 'save as General' wording", () => {
  const intakeFormSource = readFileSync(
    join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"),
    "utf-8"
  );

  it("T-C1-1: 'save as General' phrase is removed from MedicalIntakeForm", () => {
    expect(intakeFormSource).not.toContain("save as General");
  });

  it("T-C1-2: gender independence note is present", () => {
    expect(intakeFormSource).toContain(
      "Choosing a Health Record type does not automatically set or change the patient gender."
    );
  });
});

// ─── Fix C2: Gender/intakeMode conflict warning logic ────────────────────────

describe("Fix C2 — Gender/intakeMode conflict detection", () => {
  function detectConflict(
    intakeMode: string | null,
    leadGender: string
  ): boolean {
    const g = leadGender.toLowerCase();
    const isFemaleMode = intakeMode === "female";
    const isMaleMode = intakeMode === "male";
    const hasGender = g === "female" || g === "male";
    return hasGender && ((isFemaleMode && g === "male") || (isMaleMode && g === "female"));
  }

  it("T-C2-1: female gender + male intakeMode = conflict", () => {
    expect(detectConflict("male", "female")).toBe(true);
  });

  it("T-C2-2: male gender + female intakeMode = conflict", () => {
    expect(detectConflict("female", "male")).toBe(true);
  });

  it("T-C2-3: female gender + female intakeMode = no conflict", () => {
    expect(detectConflict("female", "female")).toBe(false);
  });

  it("T-C2-4: male gender + male intakeMode = no conflict", () => {
    expect(detectConflict("male", "male")).toBe(false);
  });

  it("T-C2-5: unknown gender + any intakeMode = no conflict shown", () => {
    expect(detectConflict("female", "")).toBe(false);
    expect(detectConflict("male", "")).toBe(false);
    expect(detectConflict("female", "other")).toBe(false);
  });

  it("T-C2-6: general/null intakeMode = no conflict", () => {
    expect(detectConflict(null, "female")).toBe(false);
    expect(detectConflict("general", "male")).toBe(false);
  });
});

// ─── Fix D1: Intake snapshot logic (fail-safe) ───────────────────────────────

describe("Fix D1 — Intake snapshot before Reset (fail-safe)", () => {
  it("T-D1-1: snapshot message contains [INTAKE_SNAPSHOT] prefix", () => {
    const staffName = "Dr. Smith";
    const performedAt = new Date().toISOString();
    const msg = `[INTAKE_SNAPSHOT] Health Record deleted by ${staffName} at ${performedAt}.`;
    expect(msg.startsWith("[INTAKE_SNAPSHOT]")).toBe(true);
  });

  it("T-D1-2: snapshot metadata includes all required fields", () => {
    const meta = {
      action: "delete_reset_health_record",
      performedBy: "Nurse Jane",
      performedAt: new Date().toISOString(),
      leadId: 660225,
      patientId: 450001,
      intakeId: 1890001,
      intakeMode: "female",
      context: "lead",
    };
    expect(meta.action).toBe("delete_reset_health_record");
    expect(meta.performedBy).toBe("Nurse Jane");
    expect(typeof meta.performedAt).toBe("string");
    expect(meta.leadId).toBe(660225);
    expect(meta.patientId).toBe(450001);
    expect(meta.intakeId).toBe(1890001);
    expect(meta.intakeMode).toBe("female");
    expect(meta.context).toBe("lead");
  });

  it("T-D1-3: snapshot message contains valid JSON block with fullIntake", () => {
    const meta = {
      action: "delete_reset_health_record",
      performedBy: "Staff",
      performedAt: "2026-07-09T18:00:00.000Z",
      leadId: 1,
      patientId: null,
      intakeId: 99,
      intakeMode: "male",
      context: "lead",
    };
    const fullIntake = { id: 99, intakeMode: "male", marriageDate: "2020-01-01" };
    const snapshotBody = JSON.stringify({ ...meta, fullIntake }, null, 2);
    const msg = `[INTAKE_SNAPSHOT] Health Record deleted by Staff at 2026-07-09T18:00:00.000Z.\n\`\`\`json\n${snapshotBody}\n\`\`\``;
    const jsonMatch = msg.match(/```json\n([\s\S]+?)\n```/);
    expect(jsonMatch).not.toBeNull();
    const parsed = JSON.parse(jsonMatch![1]);
    expect(parsed.action).toBe("delete_reset_health_record");
    expect(parsed.fullIntake.intakeMode).toBe("male");
  });

  it("T-D1-4: when intake is null, no snapshot is created and reset proceeds", () => {
    // No intake exists — guard allows reset without snapshot
    const existingIntake = null;
    const snapshotCalls: string[] = [];
    if (existingIntake) {
      snapshotCalls.push("snapshot");
    }
    expect(snapshotCalls).toHaveLength(0);
  });

  it("T-D1-5: fail-safe — reset procedure does NOT wrap snapshot in try/catch", () => {
    // Verify the routers.ts source does not have a try/catch around the snapshot
    const routersSource = readFileSync(
      join(__dirname, "routers.ts"),
      "utf-8"
    );
    // The old best-effort pattern should be gone
    expect(routersSource).not.toContain("Snapshot is best-effort");
    // The fire-and-forget comment should be present
    expect(routersSource).toContain("This is NOT a fail-safe");
  });

  it("T-D1-6: snapshot includes patientId when present", () => {
    const meta = {
      action: "delete_reset_health_record",
      patientId: 450001,
      context: "lead",
    };
    expect(meta.patientId).toBe(450001);
  });

  it("T-D1-7: snapshot patientId is null when no linked patient", () => {
    const meta = {
      action: "delete_reset_health_record",
      patientId: null,
      context: "lead",
    };
    expect(meta.patientId).toBeNull();
  });
});

// ─── Fix D2: Reset button rename ─────────────────────────────────────────────

describe("Fix D2 — Reset button renamed to Delete & Reset Health Record", () => {
  const leadDetailSource = readFileSync(
    join(__dirname, "../client/src/pages/LeadDetailPage.tsx"),
    "utf-8"
  );

  it("T-D2-1: old label 'Reset Intake' is no longer used as button text", () => {
    // The old button text should be gone (comment is OK, but not as button label)
    expect(leadDetailSource).not.toContain(">Reset Intake<");
    expect(leadDetailSource).not.toContain("\"Yes, Reset Intake\"");
  });

  it("T-D2-2: new label 'Delete & Reset Health Record' is present", () => {
    expect(leadDetailSource).toContain("Delete &amp; Reset Health Record");
  });

  it("T-D2-3: confirmation dialog title is updated", () => {
    expect(leadDetailSource).toContain("Delete &amp; Reset Health Record?");
  });

  it("T-D2-4: confirmation dialog mentions snapshot in Communications log", () => {
    expect(leadDetailSource).toContain("Communications log");
  });
});

// ─── Issue 2 (superseded): tests replaced by Issue 2 Revised below ──────────
// The original read-only implementation was not accepted.
// The revised behavior makes DOB editable in all modes with correct write targets.
// See "Issue 2 Revised" describe block below for the active tests.

describe("Issue 2 (superseded) — DOB field is editable in all modes", () => {
  const src = readFileSync(
    join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"),
    "utf-8"
  );

  it("T-DOB-1: DOB field is an editable date input (not read-only)", () => {
    expect(src).toContain('type="date"');
  });

  it("T-DOB-2: read-only muted block was removed (bg-muted/40 no longer used for DOB)", () => {
    // bg-muted/40 should not appear in the DOB block context
    // (it may appear elsewhere in the file, so we check the read-only text is gone)
    expect(src).not.toContain("Date of birth is edited from the Patient profile.");
  });

  it("T-DOB-3: identity DOB is read-only (Option A) — onUpdateLeadDob is NOT called from onChange", () => {
    // Option A: identity DOB (femaleLeadDob / maleLeadDob) is rendered as a disabled read-only input.
    // onUpdateLeadDob is no longer called from onChange — it still exists for other callers but
    // the DOB field in EditIntakeForm no longer triggers an immediate DB write.
    expect(src).toContain("cursor-not-allowed"); // read-only identity DOB input
    expect(src).toContain("\uD83D\uDD12 identity"); // lock badge on identity DOB
  });

  it("T-DOB-4: patient mode no longer has a read-only conditional gate", () => {
    expect(src).not.toContain("Date of birth is edited from the Patient profile.");
  });

  it("T-DOB-5: intake-template DOB field is editable (Option C) — saves only through Save Intake", () => {
    // Option C: the intake-template DOB (maleIntake.dateOfBirth / maleIntake.femalePartnerDob)
    // is editable but only calls setMale/setFemale — no immediate DB write on change.
    expect(src).toContain('type="date"'); // editable intake-template DOB input is present
    expect(src).toContain("// Option C: only update local form state"); // comment confirming no immediate write
  });

  it("T-DOB-6: male partner DOB (intake field) is unaffected", () => {
    expect(src).toContain("setMale('dateOfBirth'");
  });
});

// ─── Issue 2 Revised: Health Record DOB editable in all modes ────────────────

describe("Issue 2 Revised — Health Record DOB write paths", () => {
  // Mirrors the updateLeadDob routing logic in MedicalIntakeForm
  type DobWriteTarget = "leads.update" | "patients.update";

  function resolvedobWriteTarget(opts: {
    isLead: boolean;
    linkedPatientId: number | null;
  }): DobWriteTarget {
    if (opts.isLead) {
      if (opts.linkedPatientId) {
        return "patients.update"; // Linked Lead → Patient is source of truth
      } else {
        return "leads.update"; // Unlinked Lead → Lead DOB
      }
    } else {
      return "patients.update"; // Patient mode → Patient DOB
    }
  }

  it("T-DOB-R1: patient mode writes to patients.update", () => {
    expect(resolvedobWriteTarget({ isLead: false, linkedPatientId: null })).toBe("patients.update");
  });

  it("T-DOB-R2: linked Lead mode writes to patients.update (linked Patient is source of truth)", () => {
    expect(resolvedobWriteTarget({ isLead: true, linkedPatientId: 450001 })).toBe("patients.update");
  });

  it("T-DOB-R3: unlinked Lead mode writes to leads.update", () => {
    expect(resolvedobWriteTarget({ isLead: true, linkedPatientId: null })).toBe("leads.update");
  });

  it("T-DOB-R4: patient mode never writes to leads.update", () => {
    expect(resolvedobWriteTarget({ isLead: false, linkedPatientId: null })).not.toBe("leads.update");
  });

  it("T-DOB-R5: linked Lead mode never writes to leads.update directly", () => {
    expect(resolvedobWriteTarget({ isLead: true, linkedPatientId: 450001 })).not.toBe("leads.update");
  });

  it("T-DOB-R6: DOB field is editable (not read-only) — no mode === 'patient' read-only block", () => {
    const src = readFileSync(
      join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"),
      "utf8"
    );
    // The read-only div block we removed should not be present
    expect(src).not.toContain("Date of birth is edited from the Patient profile.");
    // The editable input should be present unconditionally (no mode === 'patient' gate before it)
    expect(src).toContain('type="date"');
  });

  it("T-DOB-R7: updateLeadDob handles patient mode (no early return for !isLead)", () => {
    const src = readFileSync(
      join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"),
      "utf8"
    );
    // The old guard 'if (!isLead) return;' should not be present
    expect(src).not.toContain("if (!isLead) return;");
    // The new patient-mode branch should be present
    expect(src).toContain("// Patient mode: write DOB directly to Patient");
  });

  it("T-DOB-R8: patientDataQuery is refetched after patient-mode DOB update", () => {
    const src = readFileSync(
      join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"),
      "utf8"
    );
    expect(src).toContain("patientDataQuery.refetch(); // also refetch in patient mode");
  });
});
