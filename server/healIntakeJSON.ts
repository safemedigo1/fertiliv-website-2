/**
 * healIntakeJSON.ts
 *
 * Self-healing startup migration for medical_intake JSON corruption.
 *
 * Problem: Some rows in medical_intake have JSON columns stored as double-encoded
 * strings (a JSON string inside a JSON column) instead of proper arrays/objects.
 * This causes .map() crashes on the frontend when rendering the Medical Intake form.
 *
 * Solution: On every server startup, scan all rows and fix any corrupted fields
 * in-place. This is idempotent — running it multiple times is safe.
 */

import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { medicalIntake } from "../drizzle/schema";

// All top-level JSON array columns in medical_intake
const ARRAY_FIELDS = [
  "artHistory",
  "surgicalHistory",
  "miscarriageHistory",
  "previousTests",
  "radiologyStudies",
  "maleRadiologyStudies",
  "generalAttachmentsFemale",
  "generalAttachmentsMale",
] as const;

// Top-level JSON object columns
const OBJECT_FIELDS = [
  "systemicDiseases",
  "maleIntake",
  "patientQuestions",
  "doctorAnswers",
] as const;

// Nested array fields inside maleIntake
const MALE_INTAKE_ARRAY_FIELDS = [
  "semenAnalysis",
  "dnaFragmentation",
  "previousTests",
  "geneticTests",
  "previousSurgeries",
] as const;

// Nested array fields inside each artHistory cycle
const CYCLE_ARRAY_FIELDS = [
  "frozenEmbryos",
  "fetEmbryos",
  "transferredEmbryos",
] as const;

/**
 * Safely parse a value that might be a JSON string, double-encoded string,
 * or already a proper JS value.
 */
function safeParse(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val !== "string") return val;
  try {
    const parsed = JSON.parse(val);
    // Handle double-encoding: if result is still a string, parse again
    if (typeof parsed === "string") {
      try {
        return JSON.parse(parsed);
      } catch {
        return parsed;
      }
    }
    return parsed;
  } catch {
    return val;
  }
}

function ensureArray(val: unknown): unknown[] {
  const parsed = safeParse(val);
  return Array.isArray(parsed) ? parsed : [];
}

function ensureObject(val: unknown): Record<string, unknown> | null {
  const parsed = safeParse(val);
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return null;
}

/**
 * Normalize a single medical_intake row. Returns the cleaned data object
 * (only the fields that need updating), or null if nothing changed.
 */
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> | null {
  const updates: Record<string, unknown> = {};
  let changed = false;

  // Fix top-level array fields
  for (const field of ARRAY_FIELDS) {
    const original = row[field];
    if (original === null || original === undefined) continue;
    if (typeof original === "string") {
      const fixed = ensureArray(original);
      updates[field] = fixed;
      changed = true;
    }
  }

  // Fix top-level object fields
  for (const field of OBJECT_FIELDS) {
    const original = row[field];
    if (original === null || original === undefined) continue;
    if (typeof original === "string") {
      const fixed = ensureObject(original);
      if (fixed !== null) {
        updates[field] = fixed;
        changed = true;
      }
    }
  }

  // Deep-fix maleIntake nested arrays
  const maleIntakeRaw = updates["maleIntake"] ?? row["maleIntake"];
  if (maleIntakeRaw && typeof maleIntakeRaw === "object" && !Array.isArray(maleIntakeRaw)) {
    const maleIntake = { ...(maleIntakeRaw as Record<string, unknown>) };
    let maleChanged = false;
    for (const f of MALE_INTAKE_ARRAY_FIELDS) {
      const v = maleIntake[f];
      if (v !== null && v !== undefined && typeof v === "string") {
        maleIntake[f] = ensureArray(v);
        maleChanged = true;
      }
    }
    if (maleChanged) {
      updates["maleIntake"] = maleIntake;
      changed = true;
    }
  }

  // Deep-fix artHistory cycle nested arrays
  const artHistoryRaw = updates["artHistory"] ?? row["artHistory"];
  if (Array.isArray(artHistoryRaw)) {
    let artChanged = false;
    const fixedArt = (artHistoryRaw as unknown[]).map((cycle) => {
      if (!cycle || typeof cycle !== "object" || Array.isArray(cycle)) return cycle;
      const c = { ...(cycle as Record<string, unknown>) };
      let cycleChanged = false;
      for (const f of CYCLE_ARRAY_FIELDS) {
        const v = c[f];
        if (v !== null && v !== undefined && typeof v === "string") {
          c[f] = ensureArray(v);
          cycleChanged = true;
        }
      }
      if (cycleChanged) artChanged = true;
      return c;
    });
    if (artChanged) {
      updates["artHistory"] = fixedArt;
      changed = true;
    }
  }

  return changed ? updates : null;
}

/**
 * Run the self-healing migration. Called once on server startup.
 * Scans all medical_intake rows and fixes any corrupted JSON fields.
 */
export async function healIntakeJSON(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[healIntakeJSON] DB not available, skipping migration");
    return;
  }

  try {
    const rows = await db.select().from(medicalIntake);
    let fixed = 0;

    for (const row of rows) {
      const updates = normalizeRow(row as unknown as Record<string, unknown>);
      if (updates) {
        await db
          .update(medicalIntake)
          .set(updates as any)
          .where(eq(medicalIntake.id, row.id));
        fixed++;
      }
    }

    if (fixed > 0) {
      console.log(`[healIntakeJSON] Fixed ${fixed} corrupted medical_intake row(s)`);
    } else {
      console.log("[healIntakeJSON] All medical_intake rows are clean");
    }
  } catch (err) {
    // Never crash the server startup due to this migration
    console.error("[healIntakeJSON] Migration error (non-fatal):", err);
  }
}
