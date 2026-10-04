/**
 * dataIO.ts — Export & Import router for all Fertiliv modules
 *
 * Export: returns rows as JSON (frontend converts to XLSX using SheetJS)
 * Import: accepts parsed rows, upserts with user-chosen conflict strategy
 *
 * Modules:
 *   leads, patients, tasks, notes (salesNotes), appointments,
 *   invoices, labResults, documents, services, users, medicalIntake
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  leads,
  patients,
  tasks,
  salesNotes,
  leadCommunications,
  patientCommunications,
  appointments,
  invoices,
  labResults,
  leadDocuments,
  services,
  users,
  medicalIntake,
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExportModule =
  | "leads"
  | "patients"
  | "tasks"
  | "notes"
  | "appointments"
  | "invoices"
  | "labResults"
  | "documents"
  | "services"
  | "users"
  | "medicalIntake";

export type ParentModule = "lead" | "patient" | "none";
export type ConflictStrategy = "update" | "skip" | "create";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Safely parse JSON columns that MySQL returns as strings */
function parseJsonCol(val: unknown): unknown {
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return val; }
  }
  return val;
}

/** Flatten a row for Excel — JSON arrays become comma-separated strings */
function flattenRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (Array.isArray(v)) {
      out[k] = v.join(", ");
    } else if (v instanceof Date) {
      out[k] = v.toISOString();
    } else if (v !== null && typeof v === "object") {
      out[k] = JSON.stringify(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function parseArr(val: unknown): string[] {
  if (Array.isArray(val)) return val as string[];
  if (typeof val === "string" && val.trim().startsWith("[")) {
    try { return JSON.parse(val); } catch { /* fall through */ }
  }
  if (typeof val === "string" && val.trim()) return val.split(",").map((s) => s.trim());
  return [];
}

function toNum(val: unknown): number | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

function toDate(val: unknown): Date | undefined {
  if (!val) return undefined;
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? undefined : d;
}

// ─── Export helpers per module ────────────────────────────────────────────────

async function exportLeads(db: Db, parentId?: number, parentModule?: ParentModule) {
  const rows = await db.select().from(leads);
  return rows.map((r) => ({
    ...r,
    preferredLanguages: parseJsonCol(r.preferredLanguages),
    preferredContactMethods: parseJsonCol(r.preferredContactMethods),
    fertilityDiagnosis: parseJsonCol(r.fertilityDiagnosis),
    maleFertilityDiagnosis: parseJsonCol(r.maleFertilityDiagnosis),
    tags: parseJsonCol(r.tags),
    mainMedicalInterest: parseJsonCol(r.mainMedicalInterest),
  }));
}

async function exportPatients(db: Db) {
  return db.select().from(patients);
}

async function exportTasks(db: Db, parentId?: number, parentModule?: ParentModule) {
  if (parentId && parentModule === "lead") {
    return db.select().from(tasks).where(eq(tasks.leadId, parentId));
  }
  if (parentId && parentModule === "patient") {
    return db.select().from(tasks).where(eq(tasks.patientId, parentId));
  }
  return db.select().from(tasks);
}

async function exportNotes(db: Db, parentId?: number, parentModule?: ParentModule) {
  // Export from lead_communications / patient_communications — the actual notes tables used in the app
  if (parentId && parentModule === "lead") {
    const rows = await db.select().from(leadCommunications).where(eq(leadCommunications.leadId, parentId));
    return rows.map(r => ({ id: r.id, leadId: r.leadId, patientId: null, authorId: r.createdBy, content: r.note, createdAt: r.createdAt }));
  }
  if (parentId && parentModule === "patient") {
    const rows = await db.select().from(patientCommunications).where(eq(patientCommunications.patientId, parentId));
    return rows.map(r => ({ id: r.id, leadId: null, patientId: r.patientId, authorId: r.createdBy, content: r.note, createdAt: r.createdAt }));
  }
  // Export all: combine lead_communications + patient_communications
  const leadRows = await db.select().from(leadCommunications);
  const patientRows = await db.select().from(patientCommunications);
  return [
    ...leadRows.map(r => ({ id: r.id, leadId: r.leadId, patientId: null, authorId: r.createdBy, content: r.note, createdAt: r.createdAt })),
    ...patientRows.map(r => ({ id: r.id, leadId: null, patientId: r.patientId, authorId: r.createdBy, content: r.note, createdAt: r.createdAt })),
  ];
}

async function exportAppointments(db: Db, parentId?: number, parentModule?: ParentModule) {
  if (parentId && parentModule === "lead") {
    return db.select().from(appointments).where(eq(appointments.leadId, parentId));
  }
  if (parentId && parentModule === "patient") {
    return db.select().from(appointments).where(eq(appointments.patientId, parentId));
  }
  return db.select().from(appointments);
}

async function exportInvoices(db: Db, parentId?: number, parentModule?: ParentModule) {
  if (parentId && parentModule === "lead") {
    return db.select().from(invoices).where(eq(invoices.leadId, parentId));
  }
  if (parentId && parentModule === "patient") {
    return db.select().from(invoices).where(eq(invoices.patientId, parentId));
  }
  return db.select().from(invoices);
}

async function exportLabResults(db: Db, parentId?: number, parentModule?: ParentModule) {
  if (parentId && parentModule === "patient") {
    return db.select().from(labResults).where(eq(labResults.patientId, parentId));
  }
  return db.select().from(labResults);
}

async function exportDocuments(db: Db, parentId?: number, parentModule?: ParentModule) {
  if (parentId && parentModule === "lead") {
    return db.select().from(leadDocuments).where(eq(leadDocuments.leadId, parentId));
  }
  if (parentId && parentModule === "patient") {
    return db.select().from(leadDocuments).where(eq(leadDocuments.patientId, parentId));
  }
  return db.select().from(leadDocuments);
}

async function exportServices(db: Db) {
  return db.select().from(services);
}

async function exportUsers(db: Db) {
  return db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    phone: users.phone,
    createdAt: users.createdAt,
  }).from(users);
}

async function exportMedicalIntake(db: Db, parentId?: number, parentModule?: ParentModule) {
  if (parentId && parentModule === "lead") {
    return db.select().from(medicalIntake).where(eq(medicalIntake.leadId, parentId));
  }
  if (parentId && parentModule === "patient") {
    return db.select().from(medicalIntake).where(eq(medicalIntake.patientId, parentId));
  }
  return db.select().from(medicalIntake);
}

// ─── Import result type ───────────────────────────────────────────────────────

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

// ─── Router ───────────────────────────────────────────────────────────────────

const MODULE_ENUM = z.enum(["leads", "patients", "tasks", "notes", "appointments", "invoices", "labResults", "documents", "services", "users", "medicalIntake"]);
const PARENT_ENUM = z.enum(["lead", "patient", "none"]);
const CONFLICT_ENUM = z.enum(["update", "skip", "create"]);

export const dataIORouter = router({
  /**
   * Export: returns rows as JSON array ready for XLSX conversion on the frontend
   */
  export: protectedProcedure
    .input(
      z.object({
        module: MODULE_ENUM,
        parentModule: PARENT_ENUM.optional(),
        parentId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      let rows: Record<string, unknown>[] = [];

      switch (input.module) {
        case "leads":
          rows = (await exportLeads(db, input.parentId, input.parentModule)) as Record<string, unknown>[];
          break;
        case "patients":
          rows = (await exportPatients(db)) as Record<string, unknown>[];
          break;
        case "tasks":
          rows = (await exportTasks(db, input.parentId, input.parentModule)) as Record<string, unknown>[];
          break;
        case "notes":
          rows = (await exportNotes(db, input.parentId, input.parentModule)) as Record<string, unknown>[];
          break;
        case "appointments":
          rows = (await exportAppointments(db, input.parentId, input.parentModule)) as Record<string, unknown>[];
          break;
        case "invoices":
          rows = (await exportInvoices(db, input.parentId, input.parentModule)) as Record<string, unknown>[];
          break;
        case "labResults":
          rows = (await exportLabResults(db, input.parentId, input.parentModule)) as Record<string, unknown>[];
          break;
        case "documents":
          rows = (await exportDocuments(db, input.parentId, input.parentModule)) as Record<string, unknown>[];
          break;
        case "services":
          rows = (await exportServices(db)) as Record<string, unknown>[];
          break;
        case "users":
          rows = (await exportUsers(db)) as Record<string, unknown>[];
          break;
        case "medicalIntake":
          rows = (await exportMedicalIntake(db, input.parentId, input.parentModule)) as Record<string, unknown>[];
          break;
      }

      const flatRows = rows.map(flattenRow);
      return {
        module: input.module,
        parentModule: input.parentModule ?? "none",
        count: flatRows.length,
        rows: flatRows,
      };
    }),

  /**
   * Import: accepts parsed rows from uploaded CSV/XLSX, upserts with conflict strategy
   */
  import: protectedProcedure
    .input(
      z.object({
        module: MODULE_ENUM,
        conflictStrategy: CONFLICT_ENUM,
        rows: z.array(z.record(z.string(), z.unknown())),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

      for (const rawRow of input.rows) {
        try {
          const row = rawRow as Record<string, unknown>;

          switch (input.module) {
            case "leads":
              await importLead(db, row, input.conflictStrategy, ctx.user.id, result);
              break;
            case "patients":
              await importPatient(db, row, input.conflictStrategy, result);
              break;
            case "tasks":
              await importTask(db, row, input.conflictStrategy, ctx.user.id, result);
              break;
            case "notes":
              await importNote(db, row, input.conflictStrategy, ctx.user.id, result);
              break;
            case "appointments":
              await importAppointment(db, row, input.conflictStrategy, result);
              break;
            case "invoices":
              await importInvoice(db, row, input.conflictStrategy, result);
              break;
            case "documents":
              await importDocument(db, row, input.conflictStrategy, ctx.user.id, result);
              break;
            case "services":
              await importService(db, row, input.conflictStrategy, result);
              break;
            case "medicalIntake":
              await importMedicalIntake(db, row, input.conflictStrategy, result);
              break;
            case "labResults":
            case "users":
              result.skipped++;
              if (result.errors.length < 3) {
                result.errors.push(`Module "${input.module}" is read-only — import not supported.`);
              }
              break;
          }
        } catch (err) {
          result.failed++;
          const msg = err instanceof Error ? err.message : String(err);
          if (result.errors.length < 20) result.errors.push(msg);
        }
      }

      return result;
    }),

  /**
   * Preview: parse uploaded file rows without saving — returns first 10 rows for user review
   */
  preview: protectedProcedure
    .input(
      z.object({
        module: MODULE_ENUM,
        rows: z.array(z.record(z.string(), z.unknown())),
      })
    )
    .mutation(async ({ input }) => {
      return {
        module: input.module,
        totalRows: input.rows.length,
        preview: input.rows.slice(0, 10),
        columns: input.rows[0] ? Object.keys(input.rows[0]) : [],
      };
    }),
});

// ─── Per-module import helpers ────────────────────────────────────────────────

async function importLead(db: Db, row: Record<string, unknown>, strategy: ConflictStrategy, userId: number, result: ImportResult) {
  const id = toNum(row.id);
  const existing = id ? await db.select({ id: leads.id }).from(leads).where(eq(leads.id, id)).limit(1) : [];

  if (existing.length > 0) {
    if (strategy === "skip") { result.skipped++; return; }
    if (strategy === "update") {
      await db.update(leads).set({
        firstName: row.firstName ? String(row.firstName) : undefined,
        lastName: row.lastName ? String(row.lastName) : undefined,
        email: row.email ? String(row.email) : undefined,
        phone: row.phone ? String(row.phone) : undefined,
        nationality: row.nationality ? String(row.nationality) : undefined,
        country: row.country ? String(row.country) : undefined,
        city: row.city ? String(row.city) : undefined,
        leadStatus: row.leadStatus ? (row.leadStatus as any) : undefined,
        fertilityDiagnosis: parseArr(row.fertilityDiagnosis) as any,
        maleFertilityDiagnosis: parseArr(row.maleFertilityDiagnosis) as any,
        tags: parseArr(row.tags) as any,
        modifiedBy: userId,
        modifiedAt: new Date(),
      }).where(eq(leads.id, id!));
      result.updated++;
      return;
    }
  }

  // Create new (strategy === "create" or no existing record)
  await db.insert(leads).values({
    firstName: String(row.firstName ?? "Unknown"),
    lastName: String(row.lastName ?? "Unknown"),
    middleName: row.middleName ? String(row.middleName) : undefined,
    email: row.email ? String(row.email) : undefined,
    phone: row.phone ? String(row.phone) : undefined,
    nationality: row.nationality ? String(row.nationality) : undefined,
    country: row.country ? String(row.country) : undefined,
    city: row.city ? String(row.city) : undefined,
    leadStatus: (row.leadStatus as any) ?? "intake",
    fertilityDiagnosis: parseArr(row.fertilityDiagnosis) as any,
    maleFertilityDiagnosis: parseArr(row.maleFertilityDiagnosis) as any,
    tags: parseArr(row.tags) as any,
    createdBy: userId,
    createdAt: toDate(row.createdAt) ?? new Date(),
  });
  result.created++;
}

async function importPatient(db: Db, row: Record<string, unknown>, strategy: ConflictStrategy, result: ImportResult) {
  const id = toNum(row.id);
  const existing = id ? await db.select({ id: patients.id }).from(patients).where(eq(patients.id, id)).limit(1) : [];

  if (existing.length > 0) {
    if (strategy === "skip") { result.skipped++; return; }
    if (strategy === "update") {
      await db.update(patients).set({
        firstName: row.firstName ? String(row.firstName) : undefined,
        lastName: row.lastName ? String(row.lastName) : undefined,
        email: row.email ? String(row.email) : undefined,
        phone: row.phone ? String(row.phone) : undefined,
        nationality: row.nationality ? String(row.nationality) : undefined,
        updatedAt: new Date(),
      }).where(eq(patients.id, id!));
      result.updated++;
      return;
    }
  }

  // mrn is required — use from row or generate a placeholder
  const mrn = row.mrn ? String(row.mrn) : `IMPORT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await db.insert(patients).values({
    mrn,
    firstName: String(row.firstName ?? "Unknown"),
    lastName: String(row.lastName ?? "Unknown"),
    email: row.email ? String(row.email) : undefined,
    phone: row.phone ? String(row.phone) : undefined,
    nationality: row.nationality ? String(row.nationality) : undefined,
    createdAt: toDate(row.createdAt) ?? new Date(),
  });
  result.created++;
}

async function importTask(db: Db, row: Record<string, unknown>, strategy: ConflictStrategy, userId: number, result: ImportResult) {
  const id = toNum(row.id);
  const existing = id ? await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, id)).limit(1) : [];

  if (existing.length > 0) {
    if (strategy === "skip") { result.skipped++; return; }
    if (strategy === "update") {
      await db.update(tasks).set({
        title: row.title ? String(row.title) : undefined,
        status: row.status ? (row.status as any) : undefined,
        priority: row.priority ? (row.priority as any) : undefined,
        notes: row.notes ? String(row.notes) : undefined,
        updatedAt: new Date(),
      }).where(eq(tasks.id, id!));
      result.updated++;
      return;
    }
  }

  await db.insert(tasks).values({
    title: String(row.title ?? "Imported Task"),
    type: (row.type as any) ?? "other",
    status: (row.status as any) ?? "open",
    priority: (row.priority as any) ?? "medium",
    leadId: toNum(row.leadId),
    patientId: toNum(row.patientId),
    notes: row.notes ? String(row.notes) : undefined,
    createdById: userId,
    createdAt: toDate(row.createdAt) ?? new Date(),
  });
  result.created++;
}

async function importNote(db: Db, row: Record<string, unknown>, strategy: ConflictStrategy, userId: number, result: ImportResult) {
  const id = toNum(row.id);
  const existing = id ? await db.select({ id: salesNotes.id }).from(salesNotes).where(eq(salesNotes.id, id)).limit(1) : [];

  if (existing.length > 0) {
    if (strategy === "skip") { result.skipped++; return; }
    if (strategy === "update") {
      await db.update(salesNotes).set({
        content: row.content ? String(row.content) : undefined,
        updatedAt: new Date(),
      }).where(eq(salesNotes.id, id!));
      result.updated++;
      return;
    }
  }

  await db.insert(salesNotes).values({
    content: String(row.content ?? ""),
    leadId: toNum(row.leadId),
    patientId: toNum(row.patientId),
    authorId: userId,
    createdAt: toDate(row.createdAt) ?? new Date(),
  });
  result.created++;
}

async function importAppointment(db: Db, row: Record<string, unknown>, strategy: ConflictStrategy, result: ImportResult) {
  const id = toNum(row.id);
  const existing = id ? await db.select({ id: appointments.id }).from(appointments).where(eq(appointments.id, id)).limit(1) : [];

  if (existing.length > 0) {
    if (strategy === "skip") { result.skipped++; return; }
    if (strategy === "update") {
      await db.update(appointments).set({
        title: row.title ? String(row.title) : undefined,
        status: row.status ? (row.status as any) : undefined,
        notes: row.notes ? String(row.notes) : undefined,
        updatedAt: new Date(),
      }).where(eq(appointments.id, id!));
      result.updated++;
      return;
    }
  }

  const apptDate = toDate(row.appointmentDate);
  if (!apptDate) {
    result.failed++;
    result.errors.push(`Row ${id ?? "?"}: missing or invalid appointmentDate`);
    return;
  }

  await db.insert(appointments).values({
    title: String(row.title ?? "Imported Appointment"),
    appointmentDate: apptDate,
    type: (row.type as any) ?? "consultation",
    status: (row.status as any) ?? "upcoming",
    leadId: toNum(row.leadId),
    patientId: toNum(row.patientId),
    notes: row.notes ? String(row.notes) : undefined,
    createdAt: toDate(row.createdAt) ?? new Date(),
  });
  result.created++;
}

async function importInvoice(db: Db, row: Record<string, unknown>, strategy: ConflictStrategy, result: ImportResult) {
  const invoiceNumber = String(row.invoiceNumber ?? "").trim();
  if (!invoiceNumber) {
    result.failed++;
    result.errors.push("Row missing invoiceNumber");
    return;
  }

  const existing = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.invoiceNumber, invoiceNumber)).limit(1);

  if (existing.length > 0) {
    if (strategy === "skip") { result.skipped++; return; }
    if (strategy === "update") {
      await db.update(invoices).set({
        status: row.status ? (row.status as any) : undefined,
        notes: row.notes ? String(row.notes) : undefined,
        updatedAt: new Date(),
      }).where(eq(invoices.invoiceNumber, invoiceNumber));
      result.updated++;
      return;
    }
  }

  await db.insert(invoices).values({
    invoiceNumber,
    leadId: toNum(row.leadId),
    patientId: toNum(row.patientId),
    subtotal: String(row.subtotal ?? "0"),
    totalAmount: String(row.totalAmount ?? "0"),
    currency: (row.currency as any) ?? "USD",
    status: (row.status as any) ?? "draft",
    notes: row.notes ? String(row.notes) : undefined,
    createdAt: toDate(row.createdAt) ?? new Date(),
  });
  result.created++;
}

async function importDocument(db: Db, row: Record<string, unknown>, strategy: ConflictStrategy, userId: number, result: ImportResult) {
  const fileKey = String(row.fileKey ?? "").trim();
  if (!fileKey) {
    result.failed++;
    result.errors.push("Row missing fileKey");
    return;
  }

  const existing = await db.select({ id: leadDocuments.id }).from(leadDocuments).where(eq(leadDocuments.fileKey, fileKey)).limit(1);

  if (existing.length > 0) {
    if (strategy === "skip") { result.skipped++; return; }
    if (strategy === "update") {
      await db.update(leadDocuments).set({
        tag: row.tag ? String(row.tag) : undefined,
        fileUrl: row.fileUrl ? String(row.fileUrl) : undefined,
      }).where(eq(leadDocuments.fileKey, fileKey));
      result.updated++;
      return;
    }
  }

  const fileUrl = String(row.fileUrl ?? "").trim();
  if (!fileUrl) {
    result.failed++;
    result.errors.push(`Row with fileKey "${fileKey}": missing fileUrl`);
    return;
  }

  await db.insert(leadDocuments).values({
    fileKey,
    fileUrl,
    fileName: String(row.fileName ?? fileKey),
    mimeType: row.mimeType ? String(row.mimeType) : undefined,
    leadId: toNum(row.leadId),
    patientId: toNum(row.patientId),
    tag: row.tag ? String(row.tag) : undefined,
    uploadedBy: userId,
    createdAt: toDate(row.createdAt) ?? new Date(),
  });
  result.created++;
}

async function importService(db: Db, row: Record<string, unknown>, strategy: ConflictStrategy, result: ImportResult) {
  const id = toNum(row.id);
  const existing = id ? await db.select({ id: services.id }).from(services).where(eq(services.id, id)).limit(1) : [];

  if (existing.length > 0) {
    if (strategy === "skip") { result.skipped++; return; }
    if (strategy === "update") {
      await db.update(services).set({
        name: row.name ? String(row.name) : undefined,
        description: row.description ? String(row.description) : undefined,
        price: row.price ? String(row.price) : undefined,
        status: row.status ? (row.status as any) : undefined,
      }).where(eq(services.id, id!));
      result.updated++;
      return;
    }
  }

  await db.insert(services).values({
    name: String(row.name ?? "Imported Service"),
    category: (row.category as any) ?? "other_test",
    description: row.description ? String(row.description) : undefined,
    price: String(row.price ?? "0"),
    status: (row.status as any) ?? "active",
    createdAt: toDate(row.createdAt) ?? new Date(),
  });
  result.created++;
}

async function importMedicalIntake(db: Db, row: Record<string, unknown>, strategy: ConflictStrategy, result: ImportResult) {
  const leadId = toNum(row.leadId);
  const patientId = toNum(row.patientId);

  if (!leadId && !patientId) {
    result.failed++;
    result.errors.push("Row missing leadId or patientId");
    return;
  }

  const existing = leadId
    ? await db.select({ id: medicalIntake.id }).from(medicalIntake).where(eq(medicalIntake.leadId, leadId)).limit(1)
    : await db.select({ id: medicalIntake.id }).from(medicalIntake).where(eq(medicalIntake.patientId, patientId!)).limit(1);

  if (existing.length > 0) {
    if (strategy === "skip") { result.skipped++; return; }
    if (strategy === "update") {
      await db.update(medicalIntake).set({
        infertilityType: row.infertilityType ? (row.infertilityType as any) : undefined,
        infertilityDuration: row.infertilityDuration ? String(row.infertilityDuration) : undefined,
        additionalNotes: row.additionalNotes ? String(row.additionalNotes) : undefined,
        updatedAt: new Date(),
      }).where(eq(medicalIntake.id, existing[0].id));
      result.updated++;
      return;
    }
  }

  await db.insert(medicalIntake).values({
    leadId,
    patientId,
    infertilityType: row.infertilityType ? (row.infertilityType as any) : undefined,
    infertilityDuration: row.infertilityDuration ? String(row.infertilityDuration) : undefined,
    additionalNotes: row.additionalNotes ? String(row.additionalNotes) : undefined,
    createdAt: toDate(row.createdAt) ?? new Date(),
    updatedAt: new Date(),
  });
  result.created++;
}
