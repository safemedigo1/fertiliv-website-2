import { and, asc, count, desc, eq, getTableColumns, gte, inArray, like, lt, lte, ne, or, sql, aliasedTable, isNull, isNotNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createHash } from "crypto";
import { getNextCode } from "./codeSequences";
import { drizzle } from "drizzle-orm/postgres-js";
import Decimal from "decimal.js";
import { appDatabaseUrl } from "./databaseUrl";
import { createPostgresClient } from "./pgClient";
import { normalizeCalendarAppointmentIdentity } from "../shared/calendarIdentity";
import { computePaymentFxSnapshots } from "../shared/paymentFx";
import { calculateOutstandingReportingTRY } from "../shared/reportingFx";
import { resolveRecipientProfileLanguage } from "../shared/appointmentCommunicationLocales";
import { computeInvoiceLinePricing, type InvoiceLinePricingMethod } from "../shared/invoiceLinePricing";
import { quantizeFinanceMoney } from "../shared/invoicePricing";
import {
  computeServicePriceFxSnapshot,
  servicePriceEntryKinds,
  type ServicePriceEntry,
} from "../shared/servicePriceFx";
import {
  resolveTaxForNewInvoiceLine,
  type InvoiceLineTaxSelection,
  type ServiceTaxOverrideMode,
} from "../shared/invoiceTaxSelection";
import { computeRefundAwareSettlementTotals } from "../shared/refundNetSettlement";
import { resolveCreditOperationIdempotency } from "../shared/creditOperationIdempotency";
import {
  InsertAppointment,
  InsertLabOrder,
  InsertLabResult,
  InsertMedicalNote,
  InsertNotification,
  InsertPatient,
  InsertService,
  InsertUser,
  appointmentActivityLog,
  appointmentRescheduleEvents,
  appointmentCommunicationDeliveries,
  appointments,
  doctors,
  invoiceItems,
  invoices,
  invoiceRevisions,
  labOrders,
  labResults,
  medicalNotes,
  messages,
  notifications,
  offers,
  patients,
  salesNotes,
  salesTasks,
  services,
  serviceTaxRules,
  serviceCategoryTaxDefaults,
  users,
  type User,
  leads,
  leadCommunications,
  leadDocuments,
  medicalIntake,
  InsertLead,
  InsertLeadCommunication,
  InsertLeadDocument,
  InsertMedicalIntake,
  treatmentPackages,
  treatmentProposals,
  InsertTreatmentPackage,
  InsertTreatmentProposal,
  partnerClinics,
  InsertPartnerClinic,
  systemSettings,
  googleCalendarConnections,
  googleCalendarAppointmentSyncs,
  googleCalendarOAuthStates,
  clinicInfo,
  staffAvailability,
  patientCommunications,
  treatmentCycles,
  InsertTreatmentCycle,
  cycleMonitoringVisits,
  InsertCycleMonitoringVisit,
  cycleMedications,
  tasks,
  InsertTask,
  Task,
  InsertCycleMedication,
  medicationAdherenceLog,
  InsertMedicationAdherenceLog,
  cycleOutcomes,
  InsertCycleOutcome,
  clinicTags,
  InsertClinicTag,
  specializations,
  InsertSpecialization,
  subSpecializations,
  InsertSubSpecialization,
  doctorSubSpecializations,
  documentTranslations,
  InsertDocumentTranslation,
  auditLogs,
  InsertAuditLog,
  payments,
  InsertPayment,
  invoiceSettlements,
  exchangeRates,
  proposalItems,
  InsertProposalItem,
  whatsappMessages,
  InsertWhatsappMessage,
  creditTransactions,
  CreditTransaction,
  patientCreditApplications,
  patientCreditApplicationAllocations,
  patientCreditApplicationReversals,
  patientCreditPayouts,
  patientCreditPayoutAllocations,
  refunds,
  Refund,
  taskTags,
  TaskTag,
  patientDoctors,
  PatientDoctor,
  InsertPatientDoctor,
  referenceData,
  ReferenceData,
  caseComments,
  CaseComment,
  InsertCaseComment,
  treatmentPlans,
  TreatmentPlan,
  InsertTreatmentPlan,
  treatmentPlanScenarios,
  TreatmentPlanScenario,
  InsertTreatmentPlanScenario,
  doctorReviewRequests,
  DoctorReviewRequest,
  InsertDoctorReviewRequest,
  externalReports,
  ExternalReport,
  InsertExternalReport,
  externalReportSourceRevisions,
  ExternalReportSourceRevision,
  externalReportProcessingRuns,
  ExternalReportProcessingRun,
  conflictResolutionLog,
  InsertConflictResolutionLog,
  draftSessions,
  DraftSession,
  InsertDraftSession,
  saveIdempotency,
  SaveIdempotency,
  InsertSaveIdempotency,
  extractionAttempts,
  ExtractionAttempt,
  InsertExtractionAttempt,
  aiUsageRequests,
  aiUsageAttempts,
} from "../drizzle/schema";
import { CLINIC_OWNER_EMAIL } from "../shared/clinicOwner";
import { ENV } from "./_core/env";
import { normalizePhone } from "../shared/phoneUtils";
import { withDbError } from "./dbError";
import type { AppointmentDeletionAuditSnapshot } from "../shared/appointmentDeletionAudit";
import {
  createLegacyExternalReportDocument,
  parseExternalReportDocument,
  readExternalReportDocument,
  type ExternalReportDocument,
} from "./externalReportDocument";
import {
  type ExternalReportProcessingGoal,
  type ExternalReportProcessingRepresentation,
  type ExternalReportSourceLanguage,
} from "./externalReportProcessing";
import {
  DEFAULT_CLINIC_WEEKLY_WORKING_HOURS,
  addIstanbulCalendarDays,
  getIstanbulDateKey,
  getIstanbulTimeKey,
  getIstanbulWeekday,
  isIstanbulIntervalWithinWorkingHours,
  istanbulDateTimeToUtc,
  isSourceTimeOffOverrideActive,
  normalizeWeeklyWorkingHours,
  validateWeeklyWorkingHours,
  type WeeklyWorkingHours,
} from "../shared/availabilityFoundation";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (_db) return _db;
  const databaseUrl = appDatabaseUrl();
  if (!databaseUrl) {
    console.warn("[Database] Postgres URL is not configured");
    return null;
  }
  try {
    _db = drizzle(createPostgresClient(databaseUrl));
  } catch (error) {
    console.warn("[Database] Failed to connect:", error instanceof Error ? error.name : "connection failed");
    _db = null;
  }
  return _db;
}

// ─── AI Control Plane Foundation: metadata-only usage ledger ────────────────
// These helpers intentionally accept operational metadata only. They never
// receive prompts, responses, patient/lead IDs, document content, file URLs,
// credentials, or raw provider errors. Callers must treat all failures as
// non-blocking observability failures.
type AiUsageNumbersInput = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
  totalTokens?: number | null;
  nonTokenUnit?: string | null;
  nonTokenQuantity?: number | null;
  providerUsageAvailable?: boolean;
};

function aiUsageNumberFields(numbers?: AiUsageNumbersInput) {
  return {
    inputTokens: numbers?.inputTokens ?? null,
    outputTokens: numbers?.outputTokens ?? null,
    cachedTokens: numbers?.cachedTokens ?? null,
    totalTokens: numbers?.totalTokens ?? null,
    nonTokenUnit: numbers?.nonTokenUnit ?? null,
    nonTokenQuantity: numbers?.nonTokenQuantity == null ? null : String(numbers.nonTokenQuantity),
  };
}

export async function recordAiUsageRequest(input: { logicalRequestId: string; workloadId: string }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(aiUsageRequests).values({
    logicalRequestId: input.logicalRequestId,
    workloadId: input.workloadId,
    configurationScope: "platform_default",
    status: "started",
  });
}

export async function recordAiUsageAttempt(input: {
  attemptId: string;
  logicalRequestId: string;
  workloadId: string;
  provider: string;
  model: string;
  attemptNumber: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(aiUsageAttempts).values({ ...input, status: "started" });
}

export async function updateAiUsageAttempt(input: {
  attemptId: string;
  status: "succeeded" | "failed";
  latencyMs: number;
  failureCategory?: string;
  numbers?: AiUsageNumbersInput;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(aiUsageAttempts).set({
    status: input.status,
    latencyMs: input.latencyMs,
    failureCategory: input.failureCategory ?? null,
    providerUsageAvailable: input.numbers?.providerUsageAvailable ?? false,
    ...aiUsageNumberFields(input.numbers),
    completedAt: new Date(),
  }).where(eq(aiUsageAttempts.attemptId, input.attemptId));
}

export async function completeAiUsageRequest(input: {
  logicalRequestId: string;
  status: "succeeded" | "failed";
  attemptCount: number;
  fallbackUsed: boolean;
  totalLatencyMs: number;
  failureCategory?: string;
  numbers?: AiUsageNumbersInput;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(aiUsageRequests).set({
    status: input.status,
    attemptCount: input.attemptCount,
    fallbackUsed: input.fallbackUsed,
    totalLatencyMs: input.totalLatencyMs,
    failureCategory: input.failureCategory ?? null,
    ...aiUsageNumberFields(input.numbers),
    completedAt: new Date(),
  }).where(eq(aiUsageRequests.logicalRequestId, input.logicalRequestId));
}

// ─── Shared Link Consistency Helper ─────────────────────────────────────────

/**
 * Write BOTH sides of a Lead ↔ Patient link inside a single transaction.
 *
 * Rule: whenever the system creates or confirms a Lead/Patient link, both of
 * the following must be written atomically:
 *   Lead.convertedPatientId  = patientId
 *   Patient.socialLeadId     = String(leadId)
 *
 * If either write fails, the transaction rolls back and no partial link state
 * is left in the database.
 *
 * @param leadId     - The Lead that was converted / linked
 * @param patientId  - The Patient that was created / linked
 * @param extraLeadFields - Optional extra fields to set on the Lead row (e.g. leadStatus)
 */
export async function writeBothLinkSides(
  leadId: number,
  patientId: number,
  extraLeadFields: Record<string, unknown> = {},
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({ convertedPatientId: patientId, ...extraLeadFields } as any)
      .where(eq(leads.id, leadId));
    await tx
      .update(patients)
      .set({ socialLeadId: String(leadId) } as any)
      .where(eq(patients.id, patientId));
  });
}

// ─── Audit Logs ──────────────────────────────────────────────────────────────

export async function logAudit(entry: {
  userId?: number | null;
  userName?: string | null;
  userRole?: string | null;
  action: string;
  category: "auth" | "patient" | "lead" | "appointment" | "medical_note" | "user_management" | "navigation" | "other";
  description?: string;
  recordId?: number | null;
  recordType?: string;
  page?: string;
  durationSeconds?: number;
  ipAddress?: string;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(auditLogs).values({
      userId: entry.userId ?? null,
      userName: entry.userName ?? null,
      userRole: entry.userRole ?? null,
      action: entry.action,
      category: entry.category,
      description: entry.description ?? null,
      recordId: entry.recordId ?? null,
      recordType: entry.recordType ?? null,
      page: entry.page ?? null,
      durationSeconds: entry.durationSeconds ?? null,
      ipAddress: entry.ipAddress ?? null,
    });
  } catch (err) {
    // Never throw from audit logging — it must not break the main operation
    console.warn("[Audit] Failed to log:", err);
  }
}

export async function getAuditLogs(opts: {
  userId?: number;
  category?: string;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
}) {
  const db = await getDb();
  if (!db) return { logs: [], total: 0 };

  const { and, like, eq, gte, lte, desc } = await import("drizzle-orm");
  const conditions: any[] = [];

  if (opts.userId) conditions.push(eq(auditLogs.userId, opts.userId));
  if (opts.category) conditions.push(eq(auditLogs.category, opts.category as any));
  if (opts.search) conditions.push(like(auditLogs.description, `%${opts.search}%`));
  if (opts.dateFrom) conditions.push(gte(auditLogs.createdAt, opts.dateFrom));
  if (opts.dateTo) conditions.push(lte(auditLogs.createdAt, opts.dateTo));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const pageSize = opts.pageSize ?? 50;
  const offset = ((opts.page ?? 1) - 1) * pageSize;

  const [logs, countResult] = await Promise.all([
    db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(pageSize).offset(offset),
    db.select({ count: auditLogs.id }).from(auditLogs).where(where),
  ]);

  return { logs, total: countResult.length };
}

export async function getAuditLogUsers(): Promise<{ userId: number; userName: string; userRole: string }[]> {
  const db = await getDb();
  if (!db) return [];
  const { eq, inArray, asc, isNotNull } = await import("drizzle-orm");
  // Get IDs of users who have audit log entries
  const auditUserIds = await db
    .selectDistinct({ userId: auditLogs.userId })
    .from(auditLogs)
    .where(isNotNull(auditLogs.userId));
  const ids = auditUserIds.map((r) => r.userId).filter((id): id is number => id != null);
  if (ids.length === 0) return [];
  // Return only active users (exist in users table) who have audit log entries
  const activeUsers = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(inArray(users.id, ids))
    .orderBy(asc(users.name));
  return activeUsers
    .filter((u) => u.name != null)
    .map((u) => ({
      userId: u.id,
      userName: u.name as string,
      userRole: u.role as string,
    }));
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// Wrap a DB query with a timeout so the login page shows an error instead of hanging
async function withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Database query timed out")), ms)
    ),
  ]);
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");
  const normalized = email.trim().toLowerCase();
  const result = await withTimeout(
    db.select().from(users).where(sql`lower(${users.email}) = ${normalized}`).limit(1)
  );
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  try {
    const result = await withTimeout(
      db.select().from(users).where(eq(users.id, id)).limit(1),
      5000
    );
    return result[0];
  } catch {
    return undefined;
  }
}

export async function createUserWithPassword(data: {
  name: string;
  email: string;
  authUserId: string;
  role: "patient" | "staff" | "doctor" | "admin" | "manager";
  phone?: string;
  status?: "pending" | "active" | "rejected";
  firstName?: string;
  secondName?: string;
  thirdName?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const email = data.email.trim().toLowerCase();
  const openId = `supabase:${data.authUserId}`;
  const displayName = data.firstName
    ? [data.firstName, data.secondName, data.thirdName].filter(Boolean).join(" ")
    : data.name;
  await db.insert(users).values({
    openId,
    authUserId: data.authUserId,
    name: displayName,
    email,
    passwordHash: null,
    loginMethod: "supabase",
    role: data.role,
    status: data.status ?? "active",
    isActive: true,
    phone: data.phone ?? null,
    firstName: data.firstName ?? null,
    secondName: data.secondName ?? null,
    thirdName: data.thirdName ?? null,
    lastSignedIn: new Date(),
  });
  const result = await db.select().from(users).where(eq(users.authUserId, data.authUserId)).limit(1);
  return result[0];
}

const SIGN_IN_TOUCH_MS = 5 * 60 * 1000;

export type ClinicLinkResult =
  | { status: "ok"; user: User }
  | { status: "blocked"; reason: "pending" | "rejected" | "inactive" }
  | { status: "closed" };

/**
 * Connects a verified Supabase user to the clinic directory.
 * Only dev@safemedigo.com may be created this way. Every other new identity is refused.
 */
export async function linkSupabaseIdentity(authUser: { id: string; email: string; name?: string | null }): Promise<ClinicLinkResult> {
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");
  const email = authUser.email.trim().toLowerCase();
  const owner = email === CLINIC_OWNER_EMAIL;
  const [byAuth] = await db.select().from(users).where(eq(users.authUserId, authUser.id)).limit(1);
  if (byAuth) return finishLinkedUser(db, byAuth, owner);

  const matches = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(5);
  // Only the owner email may attach itself to an existing clinic row. Other staff are linked by an admin.
  const existing = owner ? matches[0] : undefined;
  if (existing) {
    if (existing.authUserId && existing.authUserId !== authUser.id) return { status: "closed" };
    await db.update(users).set({
      authUserId: authUser.id,
      loginMethod: "supabase",
      email,
      role: "admin",
      status: "active",
      isActive: true,
    }).where(eq(users.id, existing.id));
    const [fresh] = await db.select().from(users).where(eq(users.id, existing.id)).limit(1);
    if (!fresh) return { status: "closed" };
    console.info("[auth] linked the owner clinic account", { userId: fresh.id });
    return finishLinkedUser(db, fresh, true);
  }
  if (!owner) return { status: "closed" };

  try {
    await db.insert(users).values({
      openId: `supabase:${authUser.id}`,
      authUserId: authUser.id,
      email,
      name: authUser.name?.trim() || "Clinic Admin",
      role: "admin",
      status: "active",
      isActive: true,
      loginMethod: "supabase",
      lastSignedIn: new Date(),
    });
    console.info("[auth] owner clinic account created");
  } catch (error) {
    console.info("[auth] owner clinic insert was already claimed", { name: error instanceof Error ? error.name : "unknown" });
  }
  const [created] = await db.select().from(users).where(eq(users.authUserId, authUser.id)).limit(1);
  if (!created) return { status: "closed" };
  return finishLinkedUser(db, created, true);
}

async function syncAuthEmail(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number, email: string) {
  const normalized = email.trim().toLowerCase();
  const [current] = await db.select({ authUserId: users.authUserId, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (normalized === CLINIC_OWNER_EMAIL && current?.email?.toLowerCase() !== CLINIC_OWNER_EMAIL) {
    throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });
  }
  if (!current?.authUserId || current.email?.toLowerCase() === normalized) return;
  const { updateAuthEmail } = await import("./_core/supabaseAuth");
  await updateAuthEmail(current.authUserId, normalized);
}

async function finishLinkedUser(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, user: User, owner: boolean): Promise<ClinicLinkResult> {
  if (owner && (user.role !== "admin" || user.status !== "active" || !user.isActive)) {
    await db.update(users).set({ role: "admin", status: "active", isActive: true, loginMethod: "supabase" }).where(eq(users.id, user.id));
    user = { ...user, role: "admin", status: "active", isActive: true, loginMethod: "supabase" };
  }
  if (user.status === "pending") return { status: "blocked", reason: "pending" };
  if (user.status === "rejected") return { status: "blocked", reason: "rejected" };
  if (!user.isActive) return { status: "blocked", reason: "inactive" };
  if (user.status !== "active") return { status: "closed" };
  const last = user.lastSignedIn ? new Date(user.lastSignedIn).getTime() : 0;
  if (Date.now() - last > SIGN_IN_TOUCH_MS) {
    await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
  }
  return { status: "ok", user };
}

export async function updateUserStatus(userId: number, status: "pending" | "active" | "rejected") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function updateUserRoleAndStatus(userId: number, role: "patient" | "staff" | "doctor" | "admin" | "manager", status: "pending" | "active" | "rejected") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role, status, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function deactivateUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  // Soft-deactivate: set isActive = false. Never hard-delete to preserve audit trail and linked records.
  await db.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function reactivateUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ isActive: true, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function saveAuthUserId(userId: number, authUserId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ authUserId, loginMethod: "supabase", passwordHash: null, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function updateUserLastSignedIn(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}

export async function countUsers() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(users);
  return Number(result[0]?.count ?? 0);
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function getStaffUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(and(
      inArray(users.role, ["staff", "admin", "manager", "doctor"]),
      eq(users.status, "active"),
      eq(users.isActive, true),
    ))
    .orderBy(users.name);
}

export async function updateUserRole(userId: number, role: "patient" | "staff" | "doctor" | "admin" | "manager") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function countAdmins() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, "admin"));
  return Number(result[0]?.count ?? 0);
}

export async function updateOwnProfile(userId: number, data: { name?: string; email?: string; phone?: string; firstName?: string; secondName?: string; thirdName?: string; jobTitle?: string; languages?: string[]; primaryLanguage?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.email !== undefined) await syncAuthEmail(db, userId, data.email);
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (data.email !== undefined) updates.email = data.email.trim().toLowerCase();
  if (data.phone !== undefined) updates.phone = data.phone;
  if (data.firstName !== undefined) updates.firstName = data.firstName;
  if (data.secondName !== undefined) updates.secondName = data.secondName;
  if (data.thirdName !== undefined) updates.thirdName = data.thirdName;
  if (data.jobTitle !== undefined) updates.jobTitle = data.jobTitle;
  if (data.languages !== undefined) updates.languages = JSON.stringify(data.languages);
  if (data.primaryLanguage !== undefined) updates.primaryLanguage = data.primaryLanguage;
  // Auto-build display name from parts
  const first = data.firstName ?? undefined;
  if (first !== undefined || data.secondName !== undefined || data.thirdName !== undefined) {
    const existing = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const u = existing[0];
    const fn = data.firstName !== undefined ? data.firstName : (u?.firstName ?? "");
    const mn = data.secondName !== undefined ? data.secondName : (u?.secondName ?? "");
    const ln = data.thirdName !== undefined ? data.thirdName : (u?.thirdName ?? "");
    updates.name = [fn, mn, ln].filter(Boolean).join(" ") || (data.name ?? u?.name ?? "");
  } else if (data.name !== undefined) {
    updates.name = data.name;
  }
  await db.update(users).set(updates).where(eq(users.id, userId));
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0];
}

// ─── Doctors ──────────────────────────────────────────────────────────────────

export async function getAllDoctors() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: doctors.id,
      userId: doctors.userId,
      specialty: doctors.specialty,
      licenseNumber: doctors.licenseNumber,
      bio: doctors.bio,
      consultationFee: doctors.consultationFee,
      name: users.name,
      email: users.email,
      phone: users.phone,
      userAvatarUrl: users.avatarUrl,
      isActive: users.isActive,
      createdAt: doctors.createdAt,
      title: doctors.title,
      firstName: doctors.firstName,
      secondName: doctors.secondName,
      thirdName: doctors.thirdName,
      specializationId: doctors.specializationId,
      avatarUrl: doctors.avatarUrl,
      stampUrl: doctors.stampUrl,
    })
    .from(doctors)
    .leftJoin(users, eq(doctors.userId, users.id))
    .orderBy(desc(doctors.createdAt));
}

export async function getDoctorById(doctorId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({
      id: doctors.id,
      userId: doctors.userId,
      specialty: doctors.specialty,
      licenseNumber: doctors.licenseNumber,
      bio: doctors.bio,
      consultationFee: doctors.consultationFee,
      name: users.name,
      email: users.email,
      phone: users.phone,
      userAvatarUrl: users.avatarUrl,
      isActive: users.isActive,
      createdAt: doctors.createdAt,
      title: doctors.title,
      firstName: doctors.firstName,
      secondName: doctors.secondName,
      thirdName: doctors.thirdName,
      specializationId: doctors.specializationId,
      avatarUrl: doctors.avatarUrl,
      stampUrl: doctors.stampUrl,
    })
    .from(doctors)
    .leftJoin(users, eq(doctors.userId, users.id))
    .where(eq(doctors.id, doctorId))
    .limit(1);
  if (!result[0]) return undefined;
  // Fetch sub-specializations for this doctor
  const subSpecs = await db
    .select({ id: subSpecializations.id, name: subSpecializations.name, specializationId: subSpecializations.specializationId })
    .from(doctorSubSpecializations)
    .leftJoin(subSpecializations, eq(doctorSubSpecializations.subSpecializationId, subSpecializations.id))
    .where(eq(doctorSubSpecializations.doctorId, doctorId));
  return { ...result[0], subSpecializationIds: subSpecs.map(s => s.id).filter(Boolean) as number[] };
}

export async function createDoctor(data: {
  name: string;
  email: string;
  password: string;
  specialty?: string;
  licenseNumber?: string;
  bio?: string;
  consultationFee?: number;
  phone?: string;
  title?: string;
  firstName?: string;
  secondName?: string;
  thirdName?: string;
  specializationId?: number;
  subSpecializationIds?: number[];
  avatarUrl?: string;
  stampUrl?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (data.email.trim().toLowerCase() === CLINIC_OWNER_EMAIL) throw new Error("EMAIL_IN_USE");
  const displayName = data.name || [data.title, data.firstName, data.secondName, data.thirdName].filter(Boolean).join(" ");
  const { createConfirmedAuthUser, deleteAuthUser } = await import("./_core/supabaseAuth");
  const authUser = await createConfirmedAuthUser({ email: data.email, password: data.password, name: displayName });
  let userId: number | undefined;
  try {
    await db.insert(users).values({
      openId: `supabase:${authUser.id}`,
      authUserId: authUser.id,
      name: displayName,
      email: data.email.trim().toLowerCase(),
      passwordHash: null,
      loginMethod: "supabase",
      role: "doctor",
      status: "active",
      phone: data.phone ?? null,
      isActive: true,
      lastSignedIn: new Date(),
    });
    const userResult = await db.select({ id: users.id }).from(users).where(eq(users.authUserId, authUser.id)).limit(1);
    userId = userResult[0]?.id;
    if (!userId) throw new Error("Failed to create user");
  } catch (error) {
    await deleteAuthUser(authUser.id);
    throw error;
  }
  // Insert doctor profile
  await db.insert(doctors).values({
    userId,
    specialty: data.specialty ?? null,
    licenseNumber: data.licenseNumber ?? null,
    bio: data.bio ?? null,
    title: data.title ?? null,
    firstName: data.firstName ?? null,
    secondName: data.secondName ?? null,
    thirdName: data.thirdName ?? null,
    specializationId: data.specializationId ?? null,
    avatarUrl: data.avatarUrl ?? null,
    stampUrl: data.stampUrl ?? null,
    code: (data as any)._code ?? null,
  });
  // Get the doctor id
  const doctorResult = await db.select({ id: doctors.id }).from(doctors).where(eq(doctors.userId, userId)).limit(1);
  const doctorId = doctorResult[0]?.id;
  // Insert sub-specializations
  if (doctorId && data.subSpecializationIds && data.subSpecializationIds.length > 0) {
    await db.insert(doctorSubSpecializations).values(
      data.subSpecializationIds.map(sid => ({ doctorId, subSpecializationId: sid }))
    );
  }
  return { userId, doctorId };
}

export async function updateDoctor(doctorId: number, data: {
  name?: string;
  email?: string;
  specialty?: string;
  licenseNumber?: string;
  bio?: string;
  consultationFee?: number;
  phone?: string;
  isActive?: boolean;
  title?: string;
  firstName?: string;
  secondName?: string;
  thirdName?: string;
  specializationId?: number;
  subSpecializationIds?: number[];
  avatarUrl?: string;
  stampUrl?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Get the doctor row with userId
  const doctorRow = await db
    .select({ userId: doctors.userId, title: doctors.title, firstName: doctors.firstName, secondName: doctors.secondName, thirdName: doctors.thirdName })
    .from(doctors).where(eq(doctors.id, doctorId)).limit(1);
  const { userId } = doctorRow[0] ?? {};
  if (!userId) throw new Error("Doctor not found");
  // Build auto-generated display name if name parts are being updated
  const newTitle = data.title ?? doctorRow[0].title;
  const newFirst = data.firstName ?? doctorRow[0].firstName;
  const newSecond = data.secondName ?? doctorRow[0].secondName;
  const newThird = data.thirdName ?? doctorRow[0].thirdName;
  const autoName = [newTitle, newFirst, newSecond, newThird].filter(Boolean).join(" ");
  // Update user fields
  const userUpdate: Record<string, unknown> = {};
  if (autoName) userUpdate.name = autoName;
  else if (data.name !== undefined) userUpdate.name = data.name;
  if (data.email !== undefined) userUpdate.email = data.email;
  if (data.phone !== undefined) userUpdate.phone = data.phone;
  if (data.isActive !== undefined) userUpdate.isActive = data.isActive;
  if (Object.keys(userUpdate).length > 0) {
    await db.update(users).set(userUpdate).where(eq(users.id, userId));
  }
  // Update doctor profile fields
  const doctorUpdate: Record<string, unknown> = {};
  if (data.specialty !== undefined) doctorUpdate.specialty = data.specialty;
  if (data.licenseNumber !== undefined) doctorUpdate.licenseNumber = data.licenseNumber;
  if (data.bio !== undefined) doctorUpdate.bio = data.bio;
  if (data.title !== undefined) doctorUpdate.title = data.title;
  if (data.firstName !== undefined) doctorUpdate.firstName = data.firstName;
  if (data.secondName !== undefined) doctorUpdate.secondName = data.secondName;
  if (data.thirdName !== undefined) doctorUpdate.thirdName = data.thirdName;
  if (data.specializationId !== undefined) doctorUpdate.specializationId = data.specializationId;
  if (data.avatarUrl !== undefined) doctorUpdate.avatarUrl = data.avatarUrl;
  if (data.stampUrl !== undefined) doctorUpdate.stampUrl = data.stampUrl;
  if (Object.keys(doctorUpdate).length > 0) {
    await db.update(doctors).set(doctorUpdate).where(eq(doctors.id, doctorId));
  }
  // Update sub-specializations (replace all)
  if (data.subSpecializationIds !== undefined) {
    await db.delete(doctorSubSpecializations).where(eq(doctorSubSpecializations.doctorId, doctorId));
    if (data.subSpecializationIds.length > 0) {
      await db.insert(doctorSubSpecializations).values(
        data.subSpecializationIds.map(sid => ({ doctorId, subSpecializationId: sid }))
      );
    }
  }
}

export async function deleteDoctor(doctorId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Get the userId for this doctor
  const doctorRow = await db.select({ userId: doctors.userId }).from(doctors).where(eq(doctors.id, doctorId)).limit(1);
  const userId = doctorRow[0]?.userId;
  if (!userId) throw new Error("Doctor not found");
  // Delete doctor profile first (FK constraint)
  await db.delete(doctors).where(eq(doctors.id, doctorId));
  // Deactivate the user account (soft delete — preserve audit trail)
  await db.update(users).set({ isActive: false, role: "patient" }).where(eq(users.id, userId));
}

export async function getDoctorByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({
      id: doctors.id,
      userId: doctors.userId,
      specialty: doctors.specialty,
      licenseNumber: doctors.licenseNumber,
      bio: doctors.bio,
      consultationFee: doctors.consultationFee,
      name: users.name,
      email: users.email,
      phone: users.phone,
      createdAt: doctors.createdAt,
      title: doctors.title,
      firstName: doctors.firstName,
      secondName: doctors.secondName,
      thirdName: doctors.thirdName,
      specializationId: doctors.specializationId,
      avatarUrl: doctors.avatarUrl,
      stampUrl: doctors.stampUrl,
    })
    .from(doctors)
    .leftJoin(users, eq(doctors.userId, users.id))
    .where(eq(doctors.userId, userId))
    .limit(1);
  if (!result[0]) return undefined;
  // Fetch sub-specializations for this doctor
  const subSpecs = await db
    .select({ id: subSpecializations.id })
    .from(doctorSubSpecializations)
    .leftJoin(subSpecializations, eq(doctorSubSpecializations.subSpecializationId, subSpecializations.id))
    .where(eq(doctorSubSpecializations.doctorId, result[0].id));
  return { ...result[0], subSpecializationIds: subSpecs.map(s => s.id).filter(Boolean) as number[] };
}

// ─── Patients ─────────────────────────────────────────────────────────────────

export async function getAllPatients(
  search?: string,
  statusFilter?: string[],
  page = 1,
  pageSize = 20,
  doctorId?: number,  // if set, only return patients assigned to this doctor
  sortBy: "updatedAt" | "name" | "createdAt" = "updatedAt",
  country?: string
): Promise<{ data: any[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const db = await getDb();
  if (!db) return { data: [], total: 0, page, pageSize, totalPages: 0 };
  const conditions: any[] = [];
  if (search) {
    // Strip non-digits from search term for phone fuzzy matching
    const phoneDigits = search.replace(/\D/g, "");
    const phoneConditions: any[] = [
      like(patients.firstName, `%${search}%`),
      like(patients.lastName, `%${search}%`),
      like(patients.mrn, `%${search}%`),
      like(patients.email, `%${search}%`),
      like(patients.phone, `%${search}%`),
    ];
    // If search looks like a phone number (4+ digits), also match by last 9 digits
    if (phoneDigits.length >= 4) {
      const last9 = phoneDigits.slice(-9);
      const likePattern = `%${last9}%`;
      phoneConditions.push(sql`REPLACE(REPLACE(REPLACE(REPLACE(${patients.phone}, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ${likePattern}`);
      phoneConditions.push(sql`REPLACE(REPLACE(REPLACE(REPLACE(${patients.secondaryPhone}, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ${likePattern}`);
    }
    conditions.push(or(...phoneConditions));
  }
  if (statusFilter && statusFilter.length > 0) {
    conditions.push(inArray(patients.status, statusFilter as any[]));
  }
  // Doctor visibility filter: only show patients assigned to this doctor
  if (country) conditions.push(eq(patients.country, country));
  if (doctorId) {
    const assignedPatientIds = await db
      .select({ patientId: patientDoctors.patientId })
      .from(patientDoctors)
      .where(eq(patientDoctors.doctorId, doctorId));
    const ids = assignedPatientIds.map(r => r.patientId).filter(Boolean) as number[];
    if (ids.length === 0) return { data: [], total: 0, page, pageSize, totalPages: 0 };
    conditions.push(inArray(patients.id, ids));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const [countResult, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(patients).where(whereClause),
    db
      .select({
        id: patients.id,
        mrn: patients.mrn,
        firstName: patients.firstName,
        middleName: patients.middleName,
        lastName: patients.lastName,
        dateOfBirth: patients.dateOfBirth,
        gender: patients.gender,
        phone: patients.phone,
        email: patients.email,
        bloodType: patients.bloodType,
        status: patients.status,
        interestLevel: patients.interestLevel,
        assignedDoctorId: patients.assignedDoctorId,
        createdAt: patients.createdAt,
        insuranceProvider: patients.insuranceProvider,
        tags: patients.tags,
        source: patients.source,
        city: patients.city,
        nextFollowUpDate: patients.nextFollowUpDate,
        lastContactDate: patients.lastContactDate,
        rating: patients.rating,
        budgetRange: patients.budgetRange,
      })
      .from(patients)
      .where(whereClause)
      .orderBy(
        sortBy === "name"
          ? asc(patients.firstName)
          : sortBy === "createdAt"
          ? desc(patients.createdAt)
          : desc(patients.updatedAt)
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);
  const total = Number(countResult[0]?.count ?? 0);
  return { data: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getPatientById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(patients).where(eq(patients.id, id)).limit(1);
  const row = result[0];
  if (!row) return row;
  // Parse JSON string columns that MySQL may return as strings
  const jsonCols = [
    'preferredLanguages', 'preferredContactMethods', 'fertilityDiagnosis',
    'maleFertilityDiagnosis', 'mainMedicalInterest', 'tags',
  ] as const;
  const parsed = { ...row } as any;
  for (const col of jsonCols) {
    parsed[col] = parseJsonCol((row as any)[col]);
  }
  // Fix C: Resilient linked Lead resolution.
  // If patients.socialLeadId is missing, resolve it from the Lead side
  // (Lead.convertedPatientId = patient.id). This handles any future partial data
  // without requiring a DB write — it only enriches the in-memory response.
  if (!parsed.socialLeadId) {
    const linkedLeadRow = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq((leads as any).convertedPatientId, id))
      .limit(1);
    if (linkedLeadRow[0]) {
      parsed.socialLeadId = String(linkedLeadRow[0].id);
      // Internal flag so callers can detect this was resolved from the Lead side
      parsed._socialLeadIdResolvedFromLead = true;
    }
  }
  return parsed;
}

/**
 * Returns the two existing profile facts used by the appointment-language
 * resolver. It deliberately does not resolve a locale itself, so all delivery
 * domains share `resolveRecipientProfileLanguage` and the central fallback.
 */
export async function getPatientCommunicationLanguageFacts(patientId: number): Promise<{
  directProfileLanguage: string | null;
  convertedLeadProfileLanguage: string | null;
} | null> {
  const db = await getDb();
  if (!db) return null;
  const [patientRows, convertedLeadRows] = await Promise.all([
    db.select({ primaryLanguage: patients.primaryLanguage })
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1),
    db.select({ primaryLanguage: leads.primaryLanguage })
      .from(leads)
      .where(eq(leads.convertedPatientId, patientId))
      .limit(1),
  ]);
  const patient = patientRows[0];
  if (!patient) return null;
  return {
    directProfileLanguage: patient.primaryLanguage ?? null,
    convertedLeadProfileLanguage: convertedLeadRows[0]?.primaryLanguage ?? null,
  };
}

export async function createPatient(data: InsertPatient) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Normalize phone numbers before insert
  if (data.phone) data = { ...data, phone: normalizePhone(data.phone) ?? data.phone };
  if (data.secondaryPhone) data = { ...data, secondaryPhone: normalizePhone(data.secondaryPhone) ?? data.secondaryPhone };
  const result = await db.insert(patients).values(data);
  return result[0];
}

export async function updatePatient(id: number, data: Partial<InsertPatient>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Normalize phone numbers before update
  if (data.phone) data = { ...data, phone: normalizePhone(data.phone) ?? data.phone };
  if (data.secondaryPhone) data = { ...data, secondaryPhone: normalizePhone(data.secondaryPhone) ?? data.secondaryPhone };
  await db.update(patients).set(data).where(eq(patients.id, id));
}

export async function deletePatient(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  await db.transaction(async (tx) => {
    // A patient deletion must be all-or-nothing from the user's perspective.  Do
    // every dependency check before deleting documents, unlinking medical intake,
    // clearing leads, or touching any related record.
    const dependencyCounts = await Promise.all([
      tx.select({ count: count() }).from(payments).where(eq(payments.patientId, id)),
      tx.select({ count: count() }).from(refunds).where(eq(refunds.patientId, id)),
      tx.select({ count: count() }).from(invoices).where(eq(invoices.patientId, id)),
      tx.select({ count: count() }).from(creditTransactions).where(eq(creditTransactions.patientId, id)),
      tx.select({ count: count() }).from(appointments).where(eq(appointments.patientId, id)),
      tx.select({ count: count() }).from(offers).where(eq(offers.patientId, id)),
      tx.select({ count: count() }).from(labOrders).where(eq(labOrders.patientId, id)),
      tx.select({ count: count() }).from(labResults).where(eq(labResults.patientId, id)),
      tx.select({ count: count() }).from(medicalNotes).where(eq(medicalNotes.patientId, id)),
      tx.select({ count: count() }).from(leadDocuments).where(eq(leadDocuments.patientId, id)),
      tx.select({ count: count() }).from(patientCommunications).where(eq(patientCommunications.patientId, id)),
      tx.select({ count: count() }).from(patientDoctors).where(eq(patientDoctors.patientId, id)),
      tx.select({ count: count() }).from(treatmentCycles).where(eq(treatmentCycles.patientId, id)),
      tx.select({ count: count() }).from(treatmentPlans).where(eq(treatmentPlans.patientId, id)),
      tx.select({ count: count() }).from(treatmentProposals).where(eq(treatmentProposals.patientId, id)),
      tx.select({ count: count() }).from(doctorReviewRequests).where(eq(doctorReviewRequests.patientId, id)),
      tx.select({ count: count() }).from(externalReports).where(eq(externalReports.patientId, id)),
      tx.select({ count: count() }).from(draftSessions).where(eq(draftSessions.patientId, id)),
      tx.select({ count: count() }).from(whatsappMessages).where(eq(whatsappMessages.patientId, id)),
    ]);

    if (dependencyCounts.some((rows) => Number(rows[0]?.count ?? 0) > 0)) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "This patient has financial or operational history and cannot be permanently deleted. Archive/deactivate the record or preserve the financial history.",
      });
    }

    // The converting lead and shared intake stay. Only the patient link is cleared.
    await tx.update(leads).set({ convertedPatientId: null }).where(eq(leads.convertedPatientId, id));
    await tx.update(medicalIntake).set({ patientId: null }).where(eq(medicalIntake.patientId, id));
    await tx.delete(patients).where(eq(patients.id, id));
  });
}

export async function getPatientOutstandingBalance(patientId: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ total: invoices.totalAmount, paid: invoices.paidAmount, status: invoices.status, currency: invoices.currency, exchangeRateSnapshot: invoices.exchangeRateSnapshot })
    .from(invoices)
    .where(and(eq(invoices.patientId, patientId), sql`${invoices.status} NOT IN ('paid', 'cancelled')`));
  // Return per-currency breakdown so the UI can display the correct currency symbol
  const byCurrency: Record<string, number> = {};
  for (const r of rows) {
    const due = Number(r.total ?? 0) - Number(r.paid ?? 0);
    if (due <= 0.001) continue;
    const cur = r.currency ?? "TRY";
    byCurrency[cur] = (byCurrency[cur] ?? 0) + due;
  }
  return byCurrency;
}

export async function getPatientStats() {
  const db = await getDb();
  if (!db) return { total: 0, active: 0, new_this_month: 0 };
  const total = await db.select({ count: sql<number>`count(*)` }).from(patients);
  const active = await db.select({ count: sql<number>`count(*)` }).from(patients).where(eq(patients.status, "active_patient"));
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const newThisMonth = await db.select({ count: sql<number>`count(*)` }).from(patients).where(gte(patients.createdAt, startOfMonth));
  return {
    total: Number(total[0]?.count ?? 0),
    active: Number(active[0]?.count ?? 0),
    new_this_month: Number(newThisMonth[0]?.count ?? 0),
  };
}

// ─── Appointments ─────────────────────────────────────────────────────────────

export async function getAppointments(filters?: {
  patientId?: number;
  leadId?: number;
  doctorId?: number;
  hostUserId?: number;
  status?: string;
  purpose?: string;
  appointmentType?: string;
  from?: Date;
  to?: Date;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.patientId) conditions.push(eq(appointments.patientId, filters.patientId));
  if (filters?.leadId) conditions.push(eq((appointments as any).leadId, filters.leadId));
  if (filters?.doctorId) conditions.push(eq(appointments.doctorId, filters.doctorId));
  if (filters?.hostUserId) conditions.push(eq((appointments as any).hostUserId, filters.hostUserId));
  if (filters?.status) conditions.push(eq(appointments.status, filters.status as any));
  if (filters?.purpose) conditions.push(eq((appointments as any).purpose, filters.purpose));
  if (filters?.appointmentType) conditions.push(eq((appointments as any).appointmentType, filters.appointmentType));
  if (filters?.from) conditions.push(gte(appointments.appointmentDate, filters.from));
  if (filters?.to) conditions.push(lte(appointments.appointmentDate, filters.to));

  const hostUsers = aliasedTable(users, 'hostUser');
  const linkedLeads = aliasedTable(leads, 'linkedLead');

  const query = db
    .select({
      id: appointments.id,
      patientId: appointments.patientId,
      leadId: (appointments as any).leadId,
      doctorId: appointments.doctorId,
      serviceId: appointments.serviceId,
      hostUserId: (appointments as any).hostUserId,
      title: appointments.title,
      appointmentDate: appointments.appointmentDate,
      endDate: appointments.endDate,
      duration: appointments.duration,
      type: appointments.type,
      appointmentType: (appointments as any).appointmentType,
      purpose: (appointments as any).purpose,
      meetingLink: (appointments as any).meetingLink,
      externalLocation: (appointments as any).externalLocation,
      partnerClinicId: (appointments as any).partnerClinicId,
      partnerClinicName: partnerClinics.name,
      partnerClinicAddress: partnerClinics.address,
      partnerClinicGoogleMapsUrl: partnerClinics.googleMapsUrl,
      status: appointments.status,
      notes: appointments.notes,
      cancellationReason: appointments.cancellationReason,
      availabilityOverrideReason: appointments.availabilityOverrideReason,
      availabilityOverrideById: appointments.availabilityOverrideById,
      availabilityOverrideAt: appointments.availabilityOverrideAt,
      googleReminderMode: (appointments as any).googleReminderMode,
      createdAt: appointments.createdAt,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
      patientMrn: patients.mrn,
      leadFirstName: linkedLeads.firstName,
      leadLastName: linkedLeads.lastName,
      doctorName: users.name,
      hostUserName: hostUsers.name,
    })
    .from(appointments)
    .leftJoin(patients, eq(appointments.patientId, patients.id))
    .leftJoin(linkedLeads, eq((appointments as any).leadId, linkedLeads.id))
    .leftJoin(doctors, eq(appointments.doctorId, doctors.id))
    .leftJoin(partnerClinics, eq((appointments as any).partnerClinicId, partnerClinics.id))
    .leftJoin(users, eq(doctors.userId, users.id))
    .leftJoin(hostUsers, eq((appointments as any).hostUserId, hostUsers.id))
    .orderBy(desc(appointments.appointmentDate));

  const rows = conditions.length > 0
    ? await query.where(and(...conditions))
    : await query;

  return rows.map(row => ({
    ...row,
    ...normalizeCalendarAppointmentIdentity(row),
  }));
}

export async function batchUpdateAppointments(ids: number[], data: Partial<{ status: string; cancellationReason: string }>) {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  await db.update(appointments).set(data as any).where(sql`${appointments.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);
}

export async function createAppointment(data: InsertAppointment) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(appointments).values(data);
  return Number((result as any)[0]?.insertId ?? (result as any).insertId ?? 0);
}

export async function updateAppointment(id: number, data: Partial<InsertAppointment>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(appointments).set(data).where(eq(appointments.id, id));
}

/**
 * Check for scheduling conflicts before creating/updating an appointment.
 * Rules:
 *  1. Same doctor cannot have two active appointments overlapping in time.
 *  2. Same patient cannot have two active appointments overlapping in time.
 * "Active" = status IN ('upcoming','confirmed','completed').
 * Overlap: [start1, end1) overlaps [start2, end2) when start1 < end2 AND end1 > start2.
 */
export async function checkAppointmentConflicts({
  appointmentDate,
  duration,
  doctorId,
  patientId,
  excludeId,
}: {
  appointmentDate: Date;
  duration: number;
  doctorId?: number | null;
  patientId?: number | null;
  excludeId?: number;
}): Promise<{ type: "doctor" | "patient"; conflictingId: number; conflictingTitle: string; conflictingDate: Date }[]> {
  const db = await getDb();
  if (!db) return [];
  const endTime = new Date(appointmentDate.getTime() + duration * 60_000);
  // Fetch active appointments in a ±1 day window to keep the query fast
  const windowStart = new Date(appointmentDate.getTime() - 24 * 60 * 60_000);
  const windowEnd = new Date(appointmentDate.getTime() + 24 * 60 * 60_000);
  const rows = await db
    .select({
      id: appointments.id,
      title: appointments.title,
      appointmentDate: appointments.appointmentDate,
      duration: appointments.duration,
      doctorId: appointments.doctorId,
      patientId: appointments.patientId,
    })
    .from(appointments)
    .where(
      and(
        gte(appointments.appointmentDate, windowStart),
        lte(appointments.appointmentDate, windowEnd),
        sql`${appointments.status} IN ('upcoming','confirmed','completed')`,
      )
    );
  const conflicts: { type: "doctor" | "patient"; conflictingId: number; conflictingTitle: string; conflictingDate: Date }[] = [];
  for (const row of rows) {
    if (excludeId && row.id === excludeId) continue;
    const rowStart = new Date(row.appointmentDate);
    const rowEnd = new Date(rowStart.getTime() + (row.duration ?? 30) * 60_000);
    const overlaps = appointmentDate < rowEnd && endTime > rowStart;
    if (!overlaps) continue;
    if (doctorId && row.doctorId === doctorId) {
      conflicts.push({ type: "doctor", conflictingId: row.id, conflictingTitle: row.title, conflictingDate: rowStart });
    }
    if (patientId && row.patientId === patientId) {
      conflicts.push({ type: "patient", conflictingId: row.id, conflictingTitle: row.title, conflictingDate: rowStart });
    }
  }
  return conflicts;
}

export async function getAppointmentStats() {
  const db = await getDb();
  if (!db) return { today: 0, upcoming: 0, completed: 0, cancelled: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayCount = await db.select({ count: sql<number>`count(*)` }).from(appointments)
    .where(and(gte(appointments.appointmentDate, today), lte(appointments.appointmentDate, tomorrow)));
  const upcomingCount = await db.select({ count: sql<number>`count(*)` }).from(appointments)
    .where(and(eq(appointments.status, "upcoming"), gte(appointments.appointmentDate, new Date())));
  const completedCount = await db.select({ count: sql<number>`count(*)` }).from(appointments)
    .where(eq(appointments.status, "completed"));
  const cancelledCount = await db.select({ count: sql<number>`count(*)` }).from(appointments)
    .where(eq(appointments.status, "cancelled"));

  return {
    today: Number(todayCount[0]?.count ?? 0),
    upcoming: Number(upcomingCount[0]?.count ?? 0),
    completed: Number(completedCount[0]?.count ?? 0),
    cancelled: Number(cancelledCount[0]?.count ?? 0),
  };
}

// ─── Medical Notes ────────────────────────────────────────────────────────────

export async function getMedicalNotes(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  // Alias tables for the two separate joins (doctor's user and enteredBy user)
  const doctorUsers = aliasedTable(users, 'doctor_users');
  const enteredByUsers = aliasedTable(users, 'entered_by_users');
  return db
    .select({
      id: medicalNotes.id,
      patientId: medicalNotes.patientId,
      doctorId: medicalNotes.doctorId,
      enteredById: medicalNotes.enteredById,
      noteType: medicalNotes.noteType,
      chiefComplaint: medicalNotes.chiefComplaint,
      historyOfPresentIllness: medicalNotes.historyOfPresentIllness,
      physicalExamination: medicalNotes.physicalExamination,
      assessment: medicalNotes.assessment,
      plan: medicalNotes.plan,
      diagnosis: medicalNotes.diagnosis,
      medications: medicalNotes.medications,
      aiSummary: medicalNotes.aiSummary,
      isAiGenerated: medicalNotes.isAiGenerated,
      visitDate: medicalNotes.visitDate,
      createdAt: medicalNotes.createdAt,
      additionalNotes: medicalNotes.additionalNotes,
      doctorName: doctorUsers.name,
      enteredByName: enteredByUsers.name,
    })
    .from(medicalNotes)
    .leftJoin(doctors, eq(medicalNotes.doctorId, doctors.id))
    .leftJoin(doctorUsers, eq(doctors.userId, doctorUsers.id))
    .leftJoin(enteredByUsers, eq(medicalNotes.enteredById, enteredByUsers.id))
    .where(eq(medicalNotes.patientId, patientId))
    .orderBy(desc(medicalNotes.visitDate));
}

export async function createMedicalNote(data: InsertMedicalNote) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(medicalNotes).values(data);
}

export async function getMedicalNoteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(medicalNotes).where(eq(medicalNotes.id, id)).limit(1);
  return result[0] ?? undefined;
}

export async function updateMedicalNote(id: number, data: Partial<InsertMedicalNote>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(medicalNotes).set(data).where(eq(medicalNotes.id, id));
}

// ─── Services ─────────────────────────────────────────────────────────────────

export async function getAllServices(category?: string) {
  const db = await getDb();
  if (!db) return [];
  if (category) {
    return db.select().from(services).where(eq(services.category, category as any)).orderBy(services.name);
  }
  return db.select().from(services).orderBy(services.category, services.name);
}

async function validateServiceTaxOverride(
  db: any,
  policy: { taxOverrideMode?: ServiceTaxOverrideMode | null; taxOverrideRuleId?: number | null },
) {
  const taxOverrideMode = policy.taxOverrideMode ?? "inherit";
  const taxOverrideRuleId = policy.taxOverrideRuleId ?? null;
  if (taxOverrideMode !== "inherit" && taxOverrideMode !== "rule" && taxOverrideMode !== "no_tax") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid Service Tax Treatment." });
  }
  if (taxOverrideMode !== "rule") {
    if (taxOverrideRuleId != null) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Only Specific Tax Rule may include a Tax Rule selection." });
    }
    return { taxOverrideMode, taxOverrideRuleId: null };
  }
  if (taxOverrideRuleId == null || !Number.isInteger(taxOverrideRuleId) || taxOverrideRuleId <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active Tax Rule for Specific Tax Rule." });
  }
  const [rule] = await db
    .select({ id: serviceTaxRules.id, isActive: serviceTaxRules.isActive })
    .from(serviceTaxRules)
    .where(eq(serviceTaxRules.id, taxOverrideRuleId))
    .limit(1);
  if (!rule || !rule.isActive) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active Tax Rule for Specific Tax Rule." });
  }
  return { taxOverrideMode, taxOverrideRuleId };
}

export async function createService(data: InsertService) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const taxOverride = await validateServiceTaxOverride(db, data as any);
  await db.insert(services).values({ ...data, ...taxOverride });
}

export async function updateService(id: number, data: Partial<InsertService>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [existing] = await db
    .select({ taxOverrideMode: services.taxOverrideMode, taxOverrideRuleId: services.taxOverrideRuleId })
    .from(services)
    .where(eq(services.id, id))
    .limit(1);
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Service not found." });
  const taxOverride = await validateServiceTaxOverride(db, {
    taxOverrideMode: data.taxOverrideMode ?? existing.taxOverrideMode,
    taxOverrideRuleId: data.taxOverrideRuleId !== undefined ? data.taxOverrideRuleId : existing.taxOverrideRuleId,
  });
  await db.update(services).set({ ...data, ...taxOverride }).where(eq(services.id, id));
}

export async function deleteService(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(services).where(eq(services.id, id));
  return { success: true };
}

// ─── Service Tax Rules (forward-only) ────────────────────────────────────────

export const serviceTaxCategories = [
  "lab_test",
  "radiology_test",
  "pathology_test",
  "other_test",
  "procedure",
  "consultation",
  "medicine",
] as const;

export type ServiceTaxCategory = typeof serviceTaxCategories[number];

export async function getServiceTaxRules(includeInactive = false) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(serviceTaxRules)
    .where(includeInactive ? undefined : eq(serviceTaxRules.isActive, true))
    .orderBy(asc(serviceTaxRules.sortOrder), asc(serviceTaxRules.label));
}

export async function getServiceCategoryTaxDefaults() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(serviceCategoryTaxDefaults).orderBy(asc(serviceCategoryTaxDefaults.category));
}

export async function createServiceTaxRule(data: {
  label: string;
  ratePercent: string;
  isActive?: boolean;
  sortOrder?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(serviceTaxRules).values({
    label: data.label.trim(),
    ratePercent: data.ratePercent as any,
    isActive: data.isActive ?? true,
    sortOrder: data.sortOrder ?? 0,
  }).returning({ id: serviceTaxRules.id });
  return { id: result[0]?.id ?? 0 };
}

export async function updateServiceTaxRule(id: number, data: {
  label?: string;
  ratePercent?: string;
  isActive?: boolean;
  sortOrder?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const updates = {
    ...(data.label !== undefined && { label: data.label.trim() }),
    ...(data.ratePercent !== undefined && { ratePercent: data.ratePercent as any }),
    ...(data.isActive !== undefined && { isActive: data.isActive }),
    ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
    updatedAt: new Date(),
  };
  await db.update(serviceTaxRules).set(updates).where(eq(serviceTaxRules.id, id));
  return { success: true };
}

export async function upsertServiceCategoryTaxDefault(category: ServiceTaxCategory, taxRuleId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (taxRuleId != null) {
    const [rule] = await db
      .select({ id: serviceTaxRules.id, isActive: serviceTaxRules.isActive })
      .from(serviceTaxRules)
      .where(eq(serviceTaxRules.id, taxRuleId))
      .limit(1);
    if (!rule || !rule.isActive) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active Tax rule for a Category default." });
    }
  }
  await db
    .insert(serviceCategoryTaxDefaults)
    .values({ category: category as any, taxRuleId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: serviceCategoryTaxDefaults.category, set: { taxRuleId, updatedAt: new Date() } });
  return { success: true };
}

export async function getActiveServiceTaxRule(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [rule] = await db
    .select()
    .from(serviceTaxRules)
    .where(and(eq(serviceTaxRules.id, id), eq(serviceTaxRules.isActive, true)))
    .limit(1);
  return rule ?? null;
}

export async function getActiveServiceTaxRulesByIds(ids: number[]) {
  const uniqueIds = ids.filter((id, index, source) => Number.isInteger(id) && id > 0 && source.indexOf(id) === index);
  if (uniqueIds.length === 0) return [];
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db
    .select({ id: serviceTaxRules.id, label: serviceTaxRules.label, ratePercent: serviceTaxRules.ratePercent })
    .from(serviceTaxRules)
    .where(and(inArray(serviceTaxRules.id, uniqueIds), eq(serviceTaxRules.isActive, true)));
}

/** Resolves only new invoice lines. Existing saved line snapshots intentionally bypass this policy. */
export async function resolveTaxForNewInvoiceLines(items: Array<{
  serviceId?: number | null;
  explicitLineTaxSelection?: InvoiceLineTaxSelection | null;
}>) {
  const serviceIds = Array.from(new Set(items.flatMap(item => item.serviceId != null ? [item.serviceId] : [])));
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const serviceRows = serviceIds.length === 0
    ? []
    : await db
        .select({
          id: services.id,
          category: services.category,
          taxOverrideMode: services.taxOverrideMode,
          taxOverrideRuleId: services.taxOverrideRuleId,
        })
        .from(services)
        .where(inArray(services.id, serviceIds));
  const servicesById = new Map(serviceRows.map(service => [service.id, service]));
  if (servicesById.size !== serviceIds.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A selected Service is no longer available." });
  }

  const categoryDefaults = await db
    .select({ category: serviceCategoryTaxDefaults.category, taxRuleId: serviceCategoryTaxDefaults.taxRuleId })
    .from(serviceCategoryTaxDefaults);
  const categoryDefaultRuleIds = new Map(categoryDefaults.map(row => [row.category, row.taxRuleId]));
  const requestedRuleIds = new Set<number>();
  for (const item of items) {
    if (item.explicitLineTaxSelection?.type === "rule") requestedRuleIds.add(item.explicitLineTaxSelection.taxRuleId);
    const service = item.serviceId == null ? undefined : servicesById.get(item.serviceId);
    if (service?.taxOverrideMode === "rule" && service.taxOverrideRuleId != null) requestedRuleIds.add(service.taxOverrideRuleId);
    const categoryRuleId = service ? categoryDefaultRuleIds.get(service.category) : null;
    if (categoryRuleId != null) requestedRuleIds.add(categoryRuleId);
  }
  const activeRules = await getActiveServiceTaxRulesByIds(Array.from(requestedRuleIds));
  const activeRulesById = new Map(activeRules.map(rule => [rule.id, rule]));

  try {
    return items.map(item => {
      const service = item.serviceId == null ? undefined : servicesById.get(item.serviceId);
      const categoryDefaultRuleId = service ? categoryDefaultRuleIds.get(service.category) : null;
      const categoryDefaultRule = categoryDefaultRuleId == null ? null : activeRulesById.get(categoryDefaultRuleId) ?? null;
      return resolveTaxForNewInvoiceLine({
        explicitLineTaxSelection: item.explicitLineTaxSelection,
        servicePolicy: service,
        categoryDefaultRule,
        activeRulesById,
      });
    });
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Unable to resolve Service Tax.",
    });
  }
}

export async function getServiceCategoryTaxDefault(category: ServiceTaxCategory) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      taxRuleId: serviceCategoryTaxDefaults.taxRuleId,
      label: serviceTaxRules.label,
      ratePercent: serviceTaxRules.ratePercent,
      isActive: serviceTaxRules.isActive,
    })
    .from(serviceCategoryTaxDefaults)
    .leftJoin(serviceTaxRules, eq(serviceCategoryTaxDefaults.taxRuleId, serviceTaxRules.id))
    .where(eq(serviceCategoryTaxDefaults.category, category as any))
    .limit(1);
  if (!row?.taxRuleId || !row.isActive) return null;
  return { id: row.taxRuleId, label: row.label!, ratePercent: String(row.ratePercent) };
}

// ─── Finance ──────────────────────────────────────────────────────────────────

export type FinancialScope = "production" | "test";

async function getPatientDefaultFinancialScope(db: any, patientId: number): Promise<FinancialScope> {
  const [patient] = await db
    .select({ defaultFinancialScope: patients.defaultFinancialScope })
    .from(patients)
    .where(eq(patients.id, patientId))
    .limit(1);
  if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "Patient not found." });
  return (patient.defaultFinancialScope ?? "production") as FinancialScope;
}

export async function getInvoices(
  patientId?: number,
  financialScope: FinancialScope | "all" = patientId ? "all" : "production",
) {
  const db = await getDb();
  if (!db) return [];
  const query = db
    .select({
      id: invoices.id,
      patientId: invoices.patientId,
      financialScope: invoices.financialScope,
      invoiceNumber: invoices.invoiceNumber,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      currency: invoices.currency,
      subtotal: invoices.subtotal,
      discountAmount: invoices.discountAmount,
      discountPercent: invoices.discountPercent,
      taxAmount: invoices.taxAmount,
      taxModelVersion: invoices.taxModelVersion,
      settlementModelVersion: invoices.settlementModelVersion,
      totalAmount: invoices.totalAmount,
      paidAmount: invoices.paidAmount,
      status: invoices.status,
      paymentMethod: invoices.paymentMethod,
      paymentDate: invoices.paymentDate,
      notes: invoices.notes,
      createdAt: invoices.createdAt,
      exchangeRateSnapshot: invoices.exchangeRateSnapshot,
      snapshotSource: invoices.snapshotSource,
      snapshotRateDate: invoices.snapshotRateDate,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
      patientMrn: patients.mrn,
    })
    .from(invoices)
    .leftJoin(patients, eq(invoices.patientId, patients.id))
    .orderBy(desc(invoices.issueDate));

  const conditions = [] as any[];
  if (patientId) conditions.push(eq(invoices.patientId, patientId));
  if (financialScope !== "all") conditions.push(eq(invoices.financialScope, financialScope));
  if (conditions.length === 0) return query;
  return query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
}

export type InvoiceListStatus = "all" | "draft" | "issued" | "paid" | "partial" | "overdue" | "cancelled";

export type PaginatedInvoiceListInput = {
  scope: FinancialScope | "all";
  search?: string;
  status?: InvoiceListStatus;
  issueDateFrom?: Date;
  issueDateToExclusive?: Date;
  page: number;
  pageSize: 20 | 50 | 100;
  exportAll?: boolean;
};

/**
 * Global Finance invoice list only. Filters are authoritative and applied before
 * counting and pagination. Issue Date is the persisted business date; it is
 * non-null by schema, so no createdAt or payment-date fallback is used.
 */
export async function getPaginatedInvoices(input: PaginatedInvoiceListInput) {
  const db = await getDb();
  if (!db) return { data: [], total: 0, page: input.page, pageSize: input.pageSize, totalPages: 0 };

  const conditions = [] as any[];
  if (input.scope !== "all") conditions.push(eq(invoices.financialScope, input.scope));
  if (input.status && input.status !== "all") conditions.push(eq(invoices.status, input.status));
  if (input.issueDateFrom) conditions.push(gte(invoices.issueDate, input.issueDateFrom));
  if (input.issueDateToExclusive) conditions.push(lt(invoices.issueDate, input.issueDateToExclusive));
  const search = input.search?.trim();
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(
      like(invoices.invoiceNumber, pattern),
      like(patients.firstName, pattern),
      like(patients.lastName, pattern),
      like(patients.mrn, pattern),
    ));
  }
  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
  const [{ total }] = await db
    .select({ total: count() })
    .from(invoices)
    .leftJoin(patients, eq(invoices.patientId, patients.id))
    .where(whereClause);
  const totalCount = Number(total ?? 0);
  const totalPages = Math.ceil(totalCount / input.pageSize);
  const page = totalPages === 0 ? 1 : Math.min(input.page, totalPages);
  const baseDataQuery = db
    .select({
      id: invoices.id,
      patientId: invoices.patientId,
      financialScope: invoices.financialScope,
      invoiceNumber: invoices.invoiceNumber,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      currency: invoices.currency,
      subtotal: invoices.subtotal,
      discountAmount: invoices.discountAmount,
      discountPercent: invoices.discountPercent,
      taxAmount: invoices.taxAmount,
      totalAmount: invoices.totalAmount,
      paidAmount: invoices.paidAmount,
      status: invoices.status,
      paymentMethod: invoices.paymentMethod,
      paymentDate: invoices.paymentDate,
      notes: invoices.notes,
      createdAt: invoices.createdAt,
      exchangeRateSnapshot: invoices.exchangeRateSnapshot,
      snapshotSource: invoices.snapshotSource,
      snapshotRateDate: invoices.snapshotRateDate,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
      patientMrn: patients.mrn,
    })
    .from(invoices)
    .leftJoin(patients, eq(invoices.patientId, patients.id));
  const orderedDataQuery = baseDataQuery
    .where(whereClause)
    .orderBy(desc(invoices.issueDate), desc(invoices.id));
  const data = input.exportAll
    ? await orderedDataQuery
    : await orderedDataQuery
      .limit(input.pageSize)
      .offset((page - 1) * input.pageSize);

  return { data, total: totalCount, page, pageSize: input.pageSize, totalPages };
}

export async function getInvoiceById(invoiceId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      totalAmount: invoices.totalAmount,
      paidAmount: invoices.paidAmount,
      subtotal: invoices.subtotal,
      discountAmount: invoices.discountAmount,
      discountPercent: invoices.discountPercent,
      taxAmount: invoices.taxAmount,
      currency: invoices.currency,
      patientId: invoices.patientId,
      financialScope: invoices.financialScope,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      notes: invoices.notes,
      pricingMode: invoices.pricingMode,
      finalAgreedAmount: invoices.finalAgreedAmount,
      paymentAdjustmentRateSnapshot: invoices.paymentAdjustmentRateSnapshot,
      taxModelVersion: invoices.taxModelVersion,
      settlementModelVersion: invoices.settlementModelVersion,
    })
    .from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  return rows[0] ?? null;
}

export async function getInvoiceItems(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: invoiceItems.id,
      invoiceId: invoiceItems.invoiceId,
      serviceId: invoiceItems.serviceId,
      lineLabel: invoiceItems.lineLabel,
      description: invoiceItems.description,
      quantity: invoiceItems.quantity,
      unitPrice: invoiceItems.unitPrice,
      totalPrice: invoiceItems.totalPrice,
      linePricingMethod: invoiceItems.linePricingMethod,
      lineDiscountPercent: invoiceItems.lineDiscountPercent,
      taxRuleId: invoiceItems.taxRuleId,
      taxLabelSnapshot: invoiceItems.taxLabelSnapshot,
      taxRateSnapshot: invoiceItems.taxRateSnapshot,
      taxIncludedMode: invoiceItems.taxIncludedMode,
      effectiveTaxableBase: invoiceItems.effectiveTaxableBase,
      taxAmount: invoiceItems.taxAmount,
      priceEntryCurrency: invoiceItems.priceEntryCurrency,
      priceEntryAmount: invoiceItems.priceEntryAmount,
      priceEntryKind: invoiceItems.priceEntryKind,
      priceFxRateToInvoice: invoiceItems.priceFxRateToInvoice,
      priceFxSourceToTryRate: invoiceItems.priceFxSourceToTryRate,
      priceFxInvoiceToTryRate: invoiceItems.priceFxInvoiceToTryRate,
      priceFxSource: invoiceItems.priceFxSource,
      priceFxEffectiveAt: invoiceItems.priceFxEffectiveAt,
      priceFxNote: invoiceItems.priceFxNote,
      serviceDescription: services.description,
    })
    .from(invoiceItems)
    .leftJoin(services, eq(invoiceItems.serviceId, services.id))
    .where(eq(invoiceItems.invoiceId, invoiceId));
  return rows;
}

export async function createInvoice(data: {
  patientId: number;
  invoiceNumber: string;
  dueDate?: Date;
  currency?: "USD" | "EUR" | "GBP" | "TRY" | "SAR" | "AED";
  subtotal: string;
  discountAmount?: string;
  discountPercent?: number;
  taxAmount?: string;
  totalAmount: string;
  paidAmount?: string;
  status?: "draft" | "issued" | "paid" | "partial" | "overdue" | "cancelled";
  notes?: string;
  exchangeRateSnapshot?: number;
  snapshotSource?: string;
  snapshotRateDate?: string;
  rateDirection?: string;
  createdById?: number;
    items: Array<{
      serviceId?: number | null;
      lineLabel?: string | null;
      description: string;
    quantity: number;
    unitPrice: string;
    totalPrice?: string;
    linePricingMethod?: InvoiceLinePricingMethod;
    lineDiscountPercent?: number | string | null;
    taxRuleId?: number | null;
    taxLabelSnapshot?: string | null;
    taxRateSnapshot?: string | null;
    taxIncludedMode?: boolean | null;
    effectiveTaxableBase?: string | null;
    taxAmount?: string | null;
    priceEntryCurrency?: "USD" | "EUR" | "GBP" | "TRY" | "SAR" | "AED" | null;
    priceEntryAmount?: string | null;
    priceEntryKind?: "unit_price" | "final_line_total" | "tax_included_final_line_total" | "agreed_unit_price" | "tax_included_agreed_unit_price" | null;
    priceFxRateToInvoice?: string | null;
    priceFxSourceToTryRate?: string | null;
    priceFxInvoiceToTryRate?: string | null;
    priceFxSource?: "system" | "manual" | null;
    priceFxEffectiveAt?: Date | null;
    priceFxNote?: string | null;
  }>;
  pricingMode?: string;
  finalAgreedAmount?: string;
  paymentAdjustmentRateSnapshot?: string | null;
  taxModelVersion?: string | null;
  settlementModelVersion?: string | null;
  initialPayments?: Array<{
    amount: string;
    currency: "USD" | "EUR" | "GBP" | "TRY" | "SAR" | "AED" | "AUD";
    method: "cash" | "credit_card" | "bank_transfer" | "insurance" | "other";
    receivedAt?: Date | string | null;
    notes?: string;
    manualFx?: ManualPaymentFxInput | null;
    bankDeduction?: BankDeductionInput | null;
  }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const financialScope = await getPatientDefaultFinancialScope(db, data.patientId);
  const canonicalItems = data.items.map(item => {
    try {
      return { ...item, ...computeInvoiceLinePricing(item) };
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid line pricing." });
    }
  });
  const canonicalSubtotal = canonicalItems.reduce((sum, item) => sum.plus(item.totalPrice), new Decimal(0));
  const requestedSubtotal = new Decimal(String(data.subtotal));
  if (!requestedSubtotal.isFinite() || requestedSubtotal.minus(canonicalSubtotal).abs().gt(0.01)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice subtotal does not match the canonical line totals." });
  }
  return db.transaction(async (tx) => {
  await tx.insert(invoices).values({
    patientId: data.patientId,
    financialScope,
    invoiceNumber: data.invoiceNumber,
    dueDate: data.dueDate,
    currency: (data.currency ?? "TRY") as any,
    subtotal: data.subtotal,
    discountAmount: data.discountAmount ?? "0",
    discountPercent: data.discountPercent != null ? data.discountPercent.toFixed(2) as any : "0",
    taxAmount: data.taxAmount ?? "0",
    totalAmount: data.totalAmount,
    paidAmount: data.paidAmount ?? "0",
    notes: data.notes,
    exchangeRateSnapshot: data.exchangeRateSnapshot != null ? String(data.exchangeRateSnapshot) as any : undefined,
    snapshotSource: data.snapshotSource,
    snapshotRateDate: data.snapshotRateDate,
    rateDirection: data.rateDirection ?? "TRY_PER_UNIT",
    createdById: data.createdById,
    status: data.status ?? "issued",
    pricingMode: data.pricingMode ?? "discount",
    finalAgreedAmount: data.finalAgreedAmount ?? null,
    paymentAdjustmentRateSnapshot: data.paymentAdjustmentRateSnapshot ?? null,
    taxModelVersion: data.taxModelVersion ?? null,
    settlementModelVersion: data.settlementModelVersion ?? null,
  });
  const created = await tx.select().from(invoices).where(eq(invoices.invoiceNumber, data.invoiceNumber)).limit(1);
  if (created[0] && canonicalItems.length > 0) {
    await tx.insert(invoiceItems).values(canonicalItems.map(item => ({
      invoiceId: created[0].id,
      serviceId: item.serviceId,
      lineLabel: item.lineLabel ?? null,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice as any,
      totalPrice: item.totalPrice as any,
      linePricingMethod: item.linePricingMethod,
      lineDiscountPercent: item.lineDiscountPercent as any,
      taxRuleId: item.taxRuleId ?? null,
      taxLabelSnapshot: item.taxLabelSnapshot ?? null,
      taxRateSnapshot: item.taxRateSnapshot as any ?? null,
      taxIncludedMode: item.taxIncludedMode ?? null,
      effectiveTaxableBase: item.effectiveTaxableBase as any ?? null,
      taxAmount: item.taxAmount as any ?? "0",
      priceEntryCurrency: item.priceEntryCurrency as any ?? null,
      priceEntryAmount: item.priceEntryAmount as any ?? null,
      priceEntryKind: item.priceEntryKind as any ?? null,
      priceFxRateToInvoice: item.priceFxRateToInvoice as any ?? null,
      priceFxSourceToTryRate: item.priceFxSourceToTryRate as any ?? null,
      priceFxInvoiceToTryRate: item.priceFxInvoiceToTryRate as any ?? null,
      priceFxSource: item.priceFxSource as any ?? null,
      priceFxEffectiveAt: item.priceFxEffectiveAt ?? null,
      priceFxNote: item.priceFxNote ?? null,
    })));
  }
  const initialPaymentResults: Array<{ paymentId: number; creditTransactionId?: number; creditAmount?: string }> = [];
  if (created[0]) {
    for (const payment of data.initialPayments ?? []) {
      initialPaymentResults.push(await recordPaymentWithSettlement(tx, {
        invoiceId: created[0].id,
        patientId: data.patientId,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        receivedAt: payment.receivedAt,
        notes: payment.notes,
        manualFx: payment.manualFx,
        bankDeduction: payment.bankDeduction,
        recordedById: data.createdById ?? 0,
      }));
    }
  }
  return { ...created[0], initialPaymentResults };
  });
}

export async function updateInvoice(id: number, data: {
  dueDate?: Date | null;
  subtotal: string;
  discountAmount?: string;
  discountPercent?: number;
  taxAmount?: string;
  totalAmount: string;
  notes?: string;
  items: Array<{ serviceId?: number; description: string; quantity: number; unitPrice: string; totalPrice: string }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(invoices).set({
    dueDate: data.dueDate ?? undefined,
    subtotal: data.subtotal,
    discountAmount: data.discountAmount ?? "0",
    discountPercent: data.discountPercent != null ? data.discountPercent.toFixed(2) as any : "0",
    taxAmount: data.taxAmount ?? "0",
    totalAmount: data.totalAmount,
    notes: data.notes,
  }).where(eq(invoices.id, id));
  // Replace all items
  await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
  if (data.items.length > 0) {
    await db.insert(invoiceItems).values(data.items.map(item => ({ ...item, invoiceId: id })));
  }
}

export async function updateInvoiceStatus(id: number, status: string, paidAmount?: string, paymentMethod?: string, externalReceiptKey?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const updateData: Record<string, unknown> = { status };
  if (paidAmount !== undefined) updateData.paidAmount = paidAmount;
  if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
  if (status === "paid") updateData.paymentDate = new Date();
  if (externalReceiptKey !== undefined) updateData.externalReceiptKey = externalReceiptKey;
  await db.update(invoices).set(updateData as any).where(eq(invoices.id, id));
}

export async function cancelInvoice(id: number, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const updateData: Record<string, unknown> = { status: "cancelled" };
  if (reason) updateData.notes = reason;
  await db.update(invoices).set(updateData as any).where(eq(invoices.id, id));
}

export async function deleteInvoice(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Guard: block deletion if payment rows exist (preserves financial history)
  const [payCount] = await db.select({ c: count() }).from(payments).where(eq(payments.invoiceId, id));
  if ((payCount?.c ?? 0) > 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Cannot delete an invoice with recorded payments. Void/cancel the invoice or resolve the payment relationship first.",
    });
  }
  // Guard: block deletion if refund rows exist (same philosophy as payments)
  const [refCount] = await db.select({ c: count() }).from(refunds).where(eq(refunds.invoiceId, id));
  if ((refCount?.c ?? 0) > 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Cannot delete an invoice with recorded refunds. Void/cancel the invoice or resolve the refund relationship first.",
    });
  }
  // Delete line items first (FK constraint)
  await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
  await db.delete(invoices).where(eq(invoices.id, id));
}

/** Convert a foreign-currency amount to TRY using the invoice's saved snapshot.
 *  Direction: 1 foreignCurrency = snapshot TRY  →  tryAmt = foreignAmt × snapshot
 *  If snapshot < 1 for a non-TRY currency it was saved inverted → use 1/snapshot.
 */
function toTRY(amount: number, currency: string, snapshot: number | null | undefined): number {
  if (currency === "TRY" || !currency) return amount;
  let rate = Number(snapshot ?? 0);
  if (rate <= 0) return amount; // no snapshot: return as-is (best effort)
  // Auto-correct inverted snapshots (e.g. 0.0215 instead of 46.49)
  if (rate < 1) rate = 1 / rate;
  return amount * rate;
}

export async function getFinanceStats() {
  const db = await getDb();
  if (!db) return {
    totalRevenue: 0,
    outstanding: 0,
    overdue: 0,
    thisMonth: 0,
    reportingCurrency: "TRY" as const,
    unavailableMetrics: [] as string[],
    outstandingReportingFx: null as null | {
      valuationDate: string;
      rateDates: string[];
      rates: Array<{ currency: string; rate: number; rateDate: string | null; sourceProvider: string | null }>;
    },
  };

  // Fetch all invoices with currency + snapshot so we can convert to TRY.
  // This Month is the value of invoices that became fully paid in the month;
  // its financial date is the latest active payment date, with legacy invoice
  // paymentDate used only where no payment-row history exists.
  const allInvoices = await db
    .select({
      id: invoices.id,
      status: invoices.status,
      totalAmount: invoices.totalAmount,
      paidAmount: invoices.paidAmount,
      currency: invoices.currency,
      exchangeRateSnapshot: invoices.exchangeRateSnapshot,
      paymentDate: invoices.paymentDate,
    })
    .from(invoices)
    .where(eq(invoices.financialScope, "production"));

  const activePaymentDates = await db
    .select({
      invoiceId: payments.invoiceId,
      receivedAt: payments.receivedAt,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(and(
      eq(payments.status, "active"),
      eq(payments.financialScope, "production"),
      eq(invoices.financialScope, "production"),
    ));

  const latestActivePaymentDate = new Map<number, Date>();
  for (const payment of activePaymentDates) {
    const financialDate = new Date(payment.receivedAt ?? payment.createdAt);
    const currentLatest = latestActivePaymentDate.get(payment.invoiceId);
    if (!currentLatest || financialDate > currentLatest) {
      latestActivePaymentDate.set(payment.invoiceId, financialDate);
    }
  }

  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
  const startOfNextMonth = new Date(startOfMonth); startOfNextMonth.setMonth(startOfNextMonth.getMonth() + 1);

  // Reporting FX is valuation-only. It values current open invoice balances in
  // TRY without using or changing immutable transaction/payment FX snapshots.
  const openBalancesByCurrency = new Map<string, number>();
  for (const inv of allInvoices) {
    if (!(["issued", "partial", "overdue"] as const).includes(inv.status as "issued" | "partial" | "overdue")) continue;
    const nativeOpenBalance = Math.max(0, Number(inv.totalAmount ?? 0) - Number(inv.paidAmount ?? 0));
    if (nativeOpenBalance <= 0) continue;
    const currency = inv.currency ?? "TRY";
    openBalancesByCurrency.set(currency, (openBalancesByCurrency.get(currency) ?? 0) + nativeOpenBalance);
  }

  const reportingRates = new Map<string, { rate: number; rateDate: string | null; sourceProvider: string | null }>();
  const reportingCurrencies = Array.from(openBalancesByCurrency.keys()).filter((currency) => currency !== "TRY");
  let outstandingReportingFx: null | {
    valuationDate: string;
    rateDates: string[];
    rates: Array<{ currency: string; rate: number; rateDate: string | null; sourceProvider: string | null }>;
  } = null;
  let reportingFxUnavailable = false;

  if (reportingCurrencies.length > 0) {
    try {
      const { getOrFetchExchangeRates } = await import("./exchangeRateService");
      const result = await getOrFetchExchangeRates();
      for (const currency of reportingCurrencies) {
        const currentRate = result.rates[currency];
        const rate = Number(currentRate?.rate ?? 0);
        if (!Number.isFinite(rate) || rate <= 0) {
          reportingFxUnavailable = true;
          continue;
        }
        reportingRates.set(currency, {
          rate,
          rateDate: currentRate.rateDate ?? null,
          sourceProvider: currentRate.sourceProvider ?? null,
        });
      }
    } catch {
      reportingFxUnavailable = true;
    }
    if (reportingRates.size !== reportingCurrencies.length) reportingFxUnavailable = true;
  }

  if (!reportingFxUnavailable) {
    const rates = Array.from(reportingRates.entries()).map(([currency, meta]) => ({ currency, ...meta }));
    const rateDates = Array.from(new Set(rates.map((item) => item.rateDate).filter((date): date is string => Boolean(date))));
    outstandingReportingFx = {
      valuationDate: new Date().toISOString().slice(0, 10),
      rateDates,
      rates,
    };
  }

  let totalRevenue = 0;
  let outstanding = 0;
  let overdue = 0;
  let thisMonth = 0;
  const unavailableMetrics = new Set<string>();

  for (const inv of allInvoices) {
    const financialPaymentDate = latestActivePaymentDate.get(inv.id) ?? inv.paymentDate ?? null;
    const cur = inv.currency ?? "TRY";
    const snap = inv.exchangeRateSnapshot != null ? Number(inv.exchangeRateSnapshot) : null;
    const requiresHistoricalFx = cur !== "TRY";
    const hasHistoricalFx = !requiresHistoricalFx || (snap != null && snap > 0);

    // Never add an unconvertible foreign-currency value to a TRY aggregate.
    // Retain the existing numeric fields for callers, but flag affected Finance cards
    // so the UI can withhold an incomplete aggregate rather than present it as TRY.
    if (!hasHistoricalFx) {
      if (inv.status === "paid") {
        unavailableMetrics.add("totalRevenue");
        if (financialPaymentDate && financialPaymentDate >= startOfMonth && financialPaymentDate < startOfNextMonth) {
          unavailableMetrics.add("thisMonth");
        }
      } else if (inv.status === "overdue") {
        unavailableMetrics.add("overdue");
      }
      continue;
    }
    const paid = toTRY(Number(inv.paidAmount ?? 0), cur, snap);
    const total = toTRY(Number(inv.totalAmount ?? 0), cur, snap);
    const remaining = Math.max(0, total - paid);

    if (inv.status === "paid") {
      totalRevenue += paid;
      if (financialPaymentDate && financialPaymentDate >= startOfMonth && financialPaymentDate < startOfNextMonth) {
        thisMonth += paid;
      }
    } else if (inv.status === "overdue") {
      overdue += remaining;
    }
  }

  const reportingOutstanding = reportingFxUnavailable
    ? null
    : calculateOutstandingReportingTRY(
      Array.from(openBalancesByCurrency.entries()).map(([currency, nativeOutstanding]) => ({ currency, nativeOutstanding })),
      Array.from(reportingRates.entries()).map(([currency, meta]) => ({ currency, rate: meta.rate })),
    );

  if (reportingOutstanding == null) {
    unavailableMetrics.add("outstanding");
  } else {
    outstanding = reportingOutstanding;
  }

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    outstanding: Math.round(outstanding * 100) / 100,
    overdue: Math.round(overdue * 100) / 100,
    thisMonth: Math.round(thisMonth * 100) / 100,
    reportingCurrency: "TRY" as const,
    unavailableMetrics: Array.from(unavailableMetrics),
    outstandingReportingFx,
  };
}

export async function getOffers(patientId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (patientId) {
    return db.select().from(offers).where(or(eq(offers.patientId, patientId), isNull(offers.patientId))).orderBy(desc(offers.createdAt));
  }
  return db.select().from(offers).orderBy(desc(offers.createdAt));
}

// ─── Sales ────────────────────────────────────────────────────────────────────

export async function getSalesNotes(patientId?: number, leadId?: number) {
  const db = await getDb();
  if (!db) return [];
  const condition = leadId != null
    ? eq(salesNotes.leadId, leadId)
    : eq(salesNotes.patientId, patientId!);
  return db
    .select({
      id: salesNotes.id,
      patientId: salesNotes.patientId,
      leadId: salesNotes.leadId,
      content: salesNotes.content,
      createdAt: salesNotes.createdAt,
      authorName: users.name,
    })
    .from(salesNotes)
    .leftJoin(users, eq(salesNotes.authorId, users.id))
    .where(condition)
    .orderBy(desc(salesNotes.createdAt));
}

export async function createSalesNote(patientId: number | undefined | null, authorId: number, content: string, leadId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(salesNotes).values({ patientId: patientId ?? null, leadId: leadId ?? null, authorId, content });
}

export async function getSalesTasks(patientId?: number, leadId?: number) {
  const db = await getDb();
  if (!db) return [];
  const condition = leadId != null
    ? eq(salesTasks.leadId, leadId)
    : eq(salesTasks.patientId, patientId!);
  return db
    .select({
      id: salesTasks.id,
      patientId: salesTasks.patientId,
      leadId: salesTasks.leadId,
      title: salesTasks.title,
      description: salesTasks.description,
      dueDate: salesTasks.dueDate,
      priority: salesTasks.priority,
      status: salesTasks.status,
      createdAt: salesTasks.createdAt,
      assignedToName: users.name,
    })
    .from(salesTasks)
    .leftJoin(users, eq(salesTasks.assignedToId, users.id))
    .where(condition)
    .orderBy(desc(salesTasks.createdAt));
}

export async function createSalesTask(data: {
  patientId?: number | null;
  leadId?: number | null;
  title: string;
  description?: string;
  dueDate?: Date;
  priority: "low" | "medium" | "high";
  assignedToId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(salesTasks).values(data as any);
}

export async function updateSalesTask(id: number, data: { status?: string; title?: string; priority?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(salesTasks).set(data as any).where(eq(salesTasks.id, id));
}

// ─── Lab & Radiology ──────────────────────────────────────────────────────────

export async function getLabOrders(patientId?: number, category?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (patientId) conditions.push(eq(labOrders.patientId, patientId));
  if (category) conditions.push(eq(labOrders.category, category as any));

  const query = db
    .select({
      id: labOrders.id,
      patientId: labOrders.patientId,
      orderNumber: labOrders.orderNumber,
      testName: labOrders.testName,
      category: labOrders.category,
      status: labOrders.status,
      priority: labOrders.priority,
      orderedDate: labOrders.orderedDate,
      collectedDate: labOrders.collectedDate,
      resultDate: labOrders.resultDate,
      notes: labOrders.notes,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
      doctorName: users.name,
    })
    .from(labOrders)
    .leftJoin(patients, eq(labOrders.patientId, patients.id))
    .leftJoin(doctors, eq(labOrders.doctorId, doctors.id))
    .leftJoin(users, eq(doctors.userId, users.id))
    .orderBy(desc(labOrders.orderedDate));

  if (conditions.length > 0) return query.where(and(...conditions));
  return query;
}

export async function createLabOrder(data: InsertLabOrder) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(labOrders).values(data);
}

export async function updateLabOrder(id: number, data: Partial<InsertLabOrder>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(labOrders).set(data).where(eq(labOrders.id, id));
}

export async function getLabResults(labOrderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(labResults).where(eq(labResults.labOrderId, labOrderId));
}

export async function getLabResultsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: labResults.id,
      labOrderId: labResults.labOrderId,
      parameter: labResults.parameter,
      value: labResults.value,
      unit: labResults.unit,
      referenceRange: labResults.referenceRange,
      flag: labResults.flag,
      interpretation: labResults.interpretation,
      createdAt: labResults.createdAt,
      testName: labOrders.testName,
      category: labOrders.category,
      orderNumber: labOrders.orderNumber,
    })
    .from(labResults)
    .leftJoin(labOrders, eq(labResults.labOrderId, labOrders.id))
    .where(eq(labResults.patientId, patientId))
    .orderBy(desc(labResults.createdAt));
}

export async function createLabResult(data: InsertLabResult) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(labResults).values(data);
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function getUserNotifications(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notifications).values(data);
}

export async function markNotificationRead(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
}

export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return Number(result[0]?.count ?? 0);
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function getUserMessages(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: messages.id,
      fromUserId: messages.fromUserId,
      toUserId: messages.toUserId,
      subject: messages.subject,
      content: messages.content,
      isRead: messages.isRead,
      createdAt: messages.createdAt,
      fromName: users.name,
    })
    .from(messages)
    .leftJoin(users, eq(messages.fromUserId, users.id))
    .where(eq(messages.toUserId, userId))
    .orderBy(desc(messages.createdAt));
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getRevenueByMonth() {
  const db = await getDb();
  if (!db) return [];
  // Fetch individual rows so we can apply TRY conversion per invoice
  const rows = await db
    .select({
      month: sql<string>`to_char("paymentDate", 'YYYY-MM')`,
      paidAmount: invoices.paidAmount,
      currency: invoices.currency,
      exchangeRateSnapshot: invoices.exchangeRateSnapshot,
    })
    .from(invoices)
    .where(eq(invoices.status, "paid"))
    .orderBy(sql`to_char("paymentDate", 'YYYY-MM')`);

  // Group and sum in TRY
  const byMonth: Record<string, number> = {};
  for (const row of rows) {
    const month = row.month;
    if (!month) continue;
    const tryAmt = toTRY(Number(row.paidAmount ?? 0), row.currency ?? "TRY", row.exchangeRateSnapshot != null ? Number(row.exchangeRateSnapshot) : null);
    byMonth[month] = (byMonth[month] ?? 0) + tryAmt;
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, revenue]) => ({ month, revenue: String(Math.round(revenue * 100) / 100) }));
}

export async function getAppointmentsByDay() {
  const db = await getDb();
  if (!db) return [];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return db
    .select({
      day: sql<string>`to_char("appointmentDate", 'YYYY-MM-DD')`,
      count: sql<number>`count(*)`,
    })
    .from(appointments)
    .where(gte(appointments.appointmentDate, sevenDaysAgo))
    .groupBy(sql`to_char("appointmentDate", 'YYYY-MM-DD')`)
    .orderBy(sql`to_char("appointmentDate", 'YYYY-MM-DD')`);
}

export async function getServiceUtilization() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      category: services.category,
      count: sql<number>`count(*)`,
    })
    .from(appointments)
    .leftJoin(services, eq(appointments.serviceId, services.id))
    .groupBy(services.category)
    .orderBy(desc(sql`count(*)`));
}

// ─── Appointment Activity Log ─────────────────────────────────────────────────

export async function deleteAppointment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.transaction(async (tx) => {
    // Delete activity log entries first (FK constraint), atomically with the appointment row.
    await tx.delete(appointmentActivityLog).where(eq(appointmentActivityLog.appointmentId, id));
    await tx.delete(appointments).where(eq(appointments.id, id));
  });
}

export async function cancelAppointmentWithLifecycle(data: {
  appointmentId: number;
  userId: number;
  userName?: string | null;
  userRole?: string | null;
  reason?: string;
  ipAddress?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.transaction(async (tx) => {
    const updateResult = await tx
      .update(appointments)
      .set({ status: "cancelled", cancellationReason: data.reason ?? null } as any)
      .where(and(eq(appointments.id, data.appointmentId), inArray(appointments.status, ["upcoming", "confirmed"])));
    const affectedRows = Number((updateResult as any)[0]?.affectedRows ?? (updateResult as any).affectedRows ?? 0);
    if (affectedRows !== 1) return false;

    await tx.insert(appointmentActivityLog).values([
      { appointmentId: data.appointmentId, userId: data.userId, action: "status_changed_to_cancelled" },
      {
        appointmentId: data.appointmentId,
        userId: data.userId,
        action: "appointment_cancelled",
        newValue: data.reason ?? "No cancellation reason recorded.",
      },
    ]);
    await tx.insert(auditLogs).values({
      userId: data.userId,
      userName: data.userName ?? null,
      userRole: data.userRole ?? null,
      action: "appointment_cancelled",
      category: "appointment",
      description: `Bulk-cancelled appointment ${data.appointmentId}${data.reason ? `: ${data.reason}` : ""}`,
      recordId: data.appointmentId,
      recordType: "appointment",
      ipAddress: data.ipAddress ?? null,
    });
    return true;
  });
}

export async function logAppointmentActivity(
  appointmentId: number,
  userId: number,
  action: string,
  oldValue?: string,
  newValue?: string
) {
  const db = await getDb();
  if (!db) return;
  await db.insert(appointmentActivityLog).values({ appointmentId, userId, action, oldValue, newValue });
}

export async function getAppointmentActivityLog(appointmentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: appointmentActivityLog.id,
      action: appointmentActivityLog.action,
      oldValue: appointmentActivityLog.oldValue,
      newValue: appointmentActivityLog.newValue,
      createdAt: appointmentActivityLog.createdAt,
      userName: users.name,
    })
    .from(appointmentActivityLog)
    .leftJoin(users, eq(appointmentActivityLog.userId, users.id))
    .where(eq(appointmentActivityLog.appointmentId, appointmentId))
    .orderBy(desc(appointmentActivityLog.createdAt));
}

// ─── Leads ────────────────────────────────────────────────────────────────────

export async function getLeads(filters?: {
  search?: string;
  status?: string;
  assignedStaffId?: number;
  brand?: string;
  origin?: string;
  country?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "updatedAt" | "name" | "createdAt";
}): Promise<{ data: any[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const db = await getDb();
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  if (!db) return { data: [], total: 0, page, pageSize, totalPages: 0 };
  const conditions: any[] = [];
  if (filters?.status) conditions.push(eq(leads.leadStatus, filters.status as any));
  if (filters?.assignedStaffId) conditions.push(eq(leads.assignedStaffId, filters.assignedStaffId));
  if (filters?.brand) conditions.push(eq(leads.brand, filters.brand as any));
  if (filters?.origin) conditions.push(eq(leads.leadOrigin, filters.origin as any));
  if (filters?.country) conditions.push(eq(leads.country, filters.country));
  if (filters?.search) {
    // Strip non-digits from search term for phone fuzzy matching
    const phoneDigits = filters.search.replace(/\D/g, "");
    const phoneConditions: any[] = [
      like(leads.firstName, `%${filters.search}%`),
      like(leads.lastName, `%${filters.search}%`),
      like(leads.email, `%${filters.search}%`),
      like(leads.phone, `%${filters.search}%`),
      // Also search linked Patient name for converted Leads (Option A)
      sql`(${leads.convertedPatientId} IS NOT NULL AND EXISTS (
        SELECT 1 FROM patients p
        WHERE p.id = ${leads.convertedPatientId}
        AND (p."firstName" ILIKE ${`%${filters.search}%`} OR p."lastName" ILIKE ${`%${filters.search}%`})
      ))`,
    ];
    // If search looks like a phone number (4+ digits), also match by last 9 digits
    if (phoneDigits.length >= 4) {
      const last9 = phoneDigits.slice(-9);
      const likePattern = `%${last9}%`;
      phoneConditions.push(sql`REPLACE(REPLACE(REPLACE(REPLACE(${leads.phone}, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ${likePattern}`);
      phoneConditions.push(sql`REPLACE(REPLACE(REPLACE(REPLACE(${leads.secondaryPhone}, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ${likePattern}`);
    }
    conditions.push(or(...phoneConditions));
  }
  // Alias patients table for the display JOIN to avoid conflicts
  const linkedPatients = aliasedTable(patients, 'linked_patient_display');
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const [countResult, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(leads).where(whereClause),
    db
      .select({
        id: leads.id,
        // Raw Lead identity fields (kept for internal use / CRM)
        firstName: leads.firstName,
        lastName: leads.lastName,
        // Display identity: COALESCE(patient, lead) — Patient is source of truth when linked
        displayFirstName: sql<string>`COALESCE(${linkedPatients.firstName}, ${leads.firstName})`,
        displayLastName: sql<string>`COALESCE(${linkedPatients.lastName}, ${leads.lastName})`,
        displayDateOfBirth: sql<Date | null>`COALESCE(${linkedPatients.dateOfBirth}, ${leads.dateOfBirth})`,
        displayGender: sql<string | null>`COALESCE(${linkedPatients.gender}, ${leads.gender})`,
        email: leads.email,
        phone: leads.phone,
        nationality: leads.nationality,
        leadStatus: leads.leadStatus,
        leadSource: leads.leadSource,
        brand: leads.brand,
        rating: leads.rating,
        interestLevel: leads.interestLevel,
        assignedStaffId: leads.assignedStaffId,
        nextFollowUpDate: leads.nextFollowUpDate,
        lastContactDate: leads.lastContactDate,
        convertedPatientId: leads.convertedPatientId,
        partnerId: leads.partnerId,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
        leadOrigin: leads.leadOrigin,
        mainMedicalInterest: leads.mainMedicalInterest,
        country: leads.country,
        assignedStaffName: users.name,
      })
      .from(leads)
      .leftJoin(users, eq(leads.assignedStaffId, users.id))
      .leftJoin(linkedPatients, eq(leads.convertedPatientId, linkedPatients.id))
      .where(whereClause)
      .orderBy(
        filters?.sortBy === "name"
          ? asc(leads.firstName)
          : filters?.sortBy === "createdAt"
          ? desc(leads.createdAt)
          : desc(leads.updatedAt)
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);
  const total = Number(countResult[0]?.count ?? 0);
  return { data: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

function parseJsonCol(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v) || (typeof v === 'object')) return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

export async function getLeadById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  // Step 1: fetch all lead columns (no explicit column list to avoid missing-column errors)
  const leadRows = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  const row = leadRows[0];
  if (!row) return row;
  // Step 2: fetch display identity via a minimal JOIN — only the 5 display fields
  // This avoids Drizzle orderSelectedFields crash from undefined column references
  const linkedPatients = aliasedTable(patients, 'linked_patient_detail');
  const [displayRow] = await db
    .select({
      displayFirstName: sql<string>`COALESCE(${linkedPatients.firstName}, ${leads.firstName})`,
      displayLastName: sql<string>`COALESCE(${linkedPatients.lastName}, ${leads.lastName})`,
      displayMiddleName: sql<string | null>`COALESCE(${linkedPatients.middleName}, ${leads.middleName})`,
      displayDateOfBirth: sql<Date | null>`COALESCE(${linkedPatients.dateOfBirth}, ${leads.dateOfBirth})`,
      displayGender: sql<string | null>`COALESCE(${linkedPatients.gender}, ${leads.gender})`,
    })
    .from(leads)
    .leftJoin(linkedPatients, eq(leads.convertedPatientId, linkedPatients.id))
    .where(eq(leads.id, id))
    .limit(1);
  // Parse JSON string columns that MySQL may return as strings
  const jsonCols = [
    'maleFertilityDiagnosis', 'fertilityDiagnosis', 'preferredLanguages',
    'preferredContactMethods', 'mainMedicalInterest', 'tags',
  ] as const;
  const parsed = { ...row } as any;
  for (const col of jsonCols) {
    parsed[col] = parseJsonCol((row as any)[col]);
  }
  // Merge display fields onto the lead row
  if (displayRow) {
    parsed.displayFirstName = displayRow.displayFirstName;
    parsed.displayLastName = displayRow.displayLastName;
    parsed.displayMiddleName = displayRow.displayMiddleName;
    parsed.displayDateOfBirth = displayRow.displayDateOfBirth;
    parsed.displayGender = displayRow.displayGender;
  }
  return parsed;
}

export async function createLead(data: InsertLead) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Normalize phone numbers before insert
  if (data.phone) data = { ...data, phone: normalizePhone(data.phone) ?? data.phone };
  if ((data as any).secondaryPhone) data = { ...data, secondaryPhone: normalizePhone((data as any).secondaryPhone) ?? (data as any).secondaryPhone } as any;
  try {
    await db.insert(leads).values(data);
  } catch (err: any) {
    console.error('[createLead] MySQL error:', err?.message, '| errno:', err?.errno, '| sqlState:', err?.sqlState, '| sql:', err?.sql?.slice(0, 300));
    throw err;
  }
  const created = await db.select().from(leads)
    .where(and(eq(leads.firstName, data.firstName), eq(leads.lastName, data.lastName)))
    .orderBy(desc(leads.createdAt)).limit(1);
  return created[0];
}

export async function updateLead(id: number, data: Partial<InsertLead>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Normalize phone numbers before update
  if (data.phone) data = { ...data, phone: normalizePhone(data.phone) ?? data.phone };
  if ((data as any).secondaryPhone) data = { ...data, secondaryPhone: normalizePhone((data as any).secondaryPhone) ?? (data as any).secondaryPhone } as any;
  await db.update(leads).set({ ...data, modifiedAt: new Date() } as any).where(eq(leads.id, id));
}

export async function deleteLead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Cascade delete: remove all related records before deleting the lead
  // Note: partner lead (partnerLeadId on leads table) is NOT deleted — it's an independent lead

  // 1. Delete physical files from Cloudflare R2 before removing DB rows
  const docs = await db
    .select({ id: leadDocuments.id, fileKey: leadDocuments.fileKey })
    .from(leadDocuments)
    .where(eq(leadDocuments.leadId, id));
  if (docs.length > 0) {
    const { storageDelete } = await import("./storage");
    await Promise.allSettled(docs.map((d) => d.fileKey ? storageDelete(d.fileKey) : Promise.resolve()));
  }

  // 2. Delete DB rows
  await db.delete(medicalIntake).where(eq(medicalIntake.leadId, id));
  await db.delete(leadCommunications).where(eq(leadCommunications.leadId, id));
  // Delete translation rows linked to this lead's documents before removing the documents
  if (docs.length > 0) {
    const docIds = docs.map((d) => d.id).filter(Boolean) as number[];
    if (docIds.length > 0) {
      await db.delete(documentTranslations).where(inArray(documentTranslations.leadDocumentId, docIds));
    }
  }
  await db.delete(leadDocuments).where(eq(leadDocuments.leadId, id));
  await db.delete(appointments).where(eq(appointments.leadId, id));
  await db.delete(invoices).where(eq(invoices.leadId, id));
  await db.delete(salesNotes).where(eq(salesNotes.leadId, id));
  await db.delete(salesTasks).where(eq(salesTasks.leadId, id));
  await db.delete(treatmentProposals).where(eq(treatmentProposals.leadId, id));
  await db.delete(whatsappMessages).where(eq(whatsappMessages.leadId, id));
  await db.delete(tasks).where(eq(tasks.leadId, id));
  await db.delete(doctorReviewRequests).where(eq(doctorReviewRequests.leadId, id));
  // Note: Partner Lead is a separate independent lead — it is NOT deleted here.
  // The UI handles unlinking the partner relationship before deletion if needed.
  await db.delete(leads).where(eq(leads.id, id));
}

export async function getLeadCommunications(leadId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: leadCommunications.id,
      note: leadCommunications.note,
      createdAt: leadCommunications.createdAt,
      authorName: users.name,
    })
    .from(leadCommunications)
    .leftJoin(users, eq(leadCommunications.createdBy, users.id))
    .where(and(eq(leadCommunications.leadId, leadId), isNull(leadCommunications.deletedAt)))
    .orderBy(desc(leadCommunications.createdAt), desc(leadCommunications.id));
}

export async function createLeadCommunication(leadId: number, note: string, createdBy: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(leadCommunications).values({ leadId, note, createdBy });
  // Update lastContactDate
  await db.update(leads).set({ lastContactDate: new Date() }).where(eq(leads.id, leadId));
}
export async function updateLeadCommunication(
  id: number,
  leadId: number,
  note: string,
  updatedBy: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Ownership + soft-delete guard: the row must belong to the supplied leadId and not be deleted
  const [row] = await db
    .select({ id: leadCommunications.id, deletedAt: leadCommunications.deletedAt })
    .from(leadCommunications)
    .where(and(eq(leadCommunications.id, id), eq(leadCommunications.leadId, leadId)))
    .limit(1);
  if (!row) throw new Error("Note not found or does not belong to this Lead");
  if (row.deletedAt) throw new Error("Cannot edit a deleted note");
  await db
    .update(leadCommunications)
    .set({ note, updatedAt: new Date(), updatedBy })
    .where(eq(leadCommunications.id, id));
}

export async function softDeleteLeadCommunication(
  id: number,
  leadId: number,
  deletedBy: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Ownership guard: the row must belong to the supplied leadId
  const [row] = await db
    .select({ id: leadCommunications.id, deletedAt: leadCommunications.deletedAt })
    .from(leadCommunications)
    .where(and(eq(leadCommunications.id, id), eq(leadCommunications.leadId, leadId)))
    .limit(1);
  if (!row) throw new Error("Note not found or does not belong to this Lead");
  if (row.deletedAt) throw new Error("Note is already deleted");
  await db
    .update(leadCommunications)
    .set({ deletedAt: new Date(), deletedBy })
    .where(eq(leadCommunications.id, id));
}
export async function getLeadDocumentById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(leadDocuments).where(eq(leadDocuments.id, id)).limit(1);
  return result[0] ?? null;
}

export async function getLeadDocuments(leadId: number) {
  const db = await getDb();
  if (!db) return [];
  // Exclude deletion-pending and pending-draft documents from user-facing results.
  // deletion-pending: being permanently deleted, S3 deletion still pending.
  // pending-draft: uploaded inside a Health Record edit form, not yet saved — must not appear
  //   in the Documents Library until the form is saved and the doc is promoted to 'active'.
  const notHidden = sql`(${leadDocuments.lifecycleStatus} IS NULL OR (${leadDocuments.lifecycleStatus} != 'deletion-pending' AND ${leadDocuments.lifecycleStatus} != 'pending-draft'))`;
  // Canonical resolver: also include documents owned by the linked patient so that
  // the Lead Documents tab shows all documents regardless of which page uploaded them.
  const linkedPatientId = await resolveLinkedPatientId(leadId);
  if (linkedPatientId) {
    // Union: docs owned by leadId OR by the linked patientId
    return db
      .select()
      .from(leadDocuments)
      .where(
        and(
          or(
            eq(leadDocuments.leadId, leadId),
            eq(leadDocuments.patientId, linkedPatientId),
          ),
          notHidden,
        ),
      )
      .orderBy(desc(leadDocuments.createdAt));
  }
  // Lead without a linked patient: query by leadId only
  return db
    .select()
    .from(leadDocuments)
    .where(
      and(
        eq(leadDocuments.leadId, leadId),
        notHidden,
      ),
    )
    .orderBy(desc(leadDocuments.createdAt));
}

export async function createLeadDocument(data: InsertLeadDocument): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(leadDocuments).values(data);
  // MySQL2 returns [{ insertId }] via drizzle
  return (result as any)[0]?.insertId ?? (result as any).insertId ?? 0;
}

export async function updateLeadDocumentTag(id: number, tag: string | null) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(leadDocuments).set({ tag }).where(eq(leadDocuments.id, id));
}

export async function updateLeadDocumentPassword(id: number, docPassword: string | null) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(leadDocuments).set({ docPassword }).where(eq(leadDocuments.id, id));
}

export async function deleteLeadDocument(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [doc] = await db.select().from(leadDocuments).where(eq(leadDocuments.id, id)).limit(1);
  if (!doc) return null;
  // Delete linked translation rows BEFORE deleting the document (avoids orphaned translations
  // that could appear under a new document that reuses the same auto-increment ID)
  await db.delete(documentTranslations).where(eq(documentTranslations.leadDocumentId, id));
  await db.delete(leadDocuments).where(eq(leadDocuments.id, id));
  // Delete the actual file from Cloudflare R2 (best-effort, won't block on failure)
  if (doc.fileKey) {
    const { storageDelete } = await import("./storage");
    await storageDelete(doc.fileKey).catch(() => {});
  }
  // Also remove the file entry from medical intake JSON arrays (cascade cleanup)
  try {
    const removeDocFromIntakeArrays = async (intakeRow: any, upsertFn: (data: any) => Promise<void>) => {
      if (!intakeRow) return;
      const parseArr = (v: any): any[] => {
        if (!v) return [];
        if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
        return Array.isArray(v) ? v : [];
      };
      const filterById = (arr: any[]) => arr.filter((e: any) => e.docId !== id && e.id !== String(id));
      const filterFiles = (arr: any[]) => arr.map((e: any) => ({
        ...e,
        files: Array.isArray(e.files) ? e.files.filter((f: any) => f.docId !== id) : e.files,
        reportFiles: Array.isArray(e.reportFiles) ? e.reportFiles.filter((f: any) => f.docId !== id) : e.reportFiles,
        images: Array.isArray(e.images) ? e.images.filter((f: any) => f.docId !== id) : e.images,
        dicomFiles: Array.isArray(e.dicomFiles) ? e.dicomFiles.filter((f: any) => f.docId !== id) : e.dicomFiles,
      }));
      const updates: any = {};
      const topLevelArrayFields = ["generalAttachmentsFemale", "generalAttachmentsMale"];
      for (const field of topLevelArrayFields) {
        const arr = parseArr((intakeRow as any)[field]);
        const filtered = filterById(arr);
        if (filtered.length !== arr.length) updates[field] = filtered;
      }
      // Nested arrays in maleIntake
      const maleIntakeObj = intakeRow.maleIntake ? (typeof intakeRow.maleIntake === "string" ? JSON.parse(intakeRow.maleIntake) : intakeRow.maleIntake) : null;
      if (maleIntakeObj) {
        let maleChanged = false;
        const maleFields = ["semenAnalysis", "dnaFragmentation"];
        for (const field of maleFields) {
          const arr = parseArr(maleIntakeObj[field]);
          const filtered = filterById(arr);
          if (filtered.length !== arr.length) { maleIntakeObj[field] = filtered; maleChanged = true; }
        }
        const maleNestedFields = ["previousTests", "previousSurgeries", "geneticTests"];
        for (const field of maleNestedFields) {
          const arr = parseArr(maleIntakeObj[field]);
          const filtered = filterFiles(arr).filter((e: any) => !Array.isArray(e.files) || e.files.length > 0);
          if (JSON.stringify(filtered) !== JSON.stringify(arr)) { maleIntakeObj[field] = filtered; maleChanged = true; }
        }
        if (maleChanged) updates.maleIntake = maleIntakeObj;
      }
      // Top-level nested array fields
      const nestedArrayFields = ["artHistory", "surgicalHistory", "previousTests", "radiologyStudies", "maleRadiologyStudies"];
      for (const field of nestedArrayFields) {
        const arr = parseArr((intakeRow as any)[field]);
        const filtered = filterFiles(filterById(arr)).filter((e: any) => {
          if (field === "radiologyStudies" || field === "maleRadiologyStudies") return true; // keep study even if empty
          return !Array.isArray(e.files) || e.files.length > 0;
        });
        if (JSON.stringify(filtered) !== JSON.stringify(arr)) updates[field] = filtered;
      }
      if (Object.keys(updates).length > 0) await upsertFn(updates);
    };
    if (doc.leadId) {
      const intake = await getMedicalIntake(doc.leadId);
      await removeDocFromIntakeArrays(intake, (data) => upsertMedicalIntake(doc.leadId!, data));
    } else if (doc.patientId) {
      const intake = await getMedicalIntakeByPatientId(doc.patientId);
      await removeDocFromIntakeArrays(intake, (data) => upsertMedicalIntakeForPatient(doc.patientId!, data));
    }
  } catch (e) {
    // Intake cleanup is best-effort — don't fail the delete
    console.error("[deleteLeadDocument] intake cleanup error:", e);
  }
  return doc.fileKey ?? null;
}
export async function getPatientDocuments(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  // Canonical resolver: also include documents owned by the linked lead so that
  // the Patient Documents tab shows all documents regardless of which page uploaded them.
  const linkedLeadId = await resolveLinkedLeadId(patientId);
  const notHiddenP = sql`(${leadDocuments.lifecycleStatus} IS NULL OR (${leadDocuments.lifecycleStatus} != 'deletion-pending' AND ${leadDocuments.lifecycleStatus} != 'pending-draft'))`;
  if (linkedLeadId) {
    // Union: docs owned by patientId OR by the linked leadId
    return db
      .select()
      .from(leadDocuments)
      .where(
        and(
          or(
            eq(leadDocuments.patientId, patientId),
            eq(leadDocuments.leadId, linkedLeadId),
          ),
          notHiddenP,
        ),
      )
      .orderBy(desc(leadDocuments.createdAt));
  }
  // Directly-created patient (no linked lead): query by patientId only
  return db
    .select()
    .from(leadDocuments)
    .where(
      and(
        eq(leadDocuments.patientId, patientId),
        notHiddenP,
      ),
    )
    .orderBy(desc(leadDocuments.createdAt));
}

/**
 * Normalize a medical intake row: parse any double-encoded JSON string fields back to
 * their proper types (array/object). This runs on every read so the frontend always
 * receives clean data regardless of what is stored in the DB.
 */
function normalizeIntakeJSON(row: any): any {
  if (!row) return row;
  const JSON_ARRAY_FIELDS = [
    "artHistory", "surgicalHistory", "miscarriageHistory", "previousTests",
    "radiologyStudies", "maleRadiologyStudies",
    "generalAttachmentsFemale", "generalAttachmentsMale", "femaleGeneticTests",
  ];
  const JSON_OBJECT_FIELDS = ["systemicDiseases", "maleIntake", "patientQuestions", "doctorAnswers"];
  const parseField = (v: any, fallback: any): any => {
    if (v === null || v === undefined) return v;
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        // Handle double-encoding: if result is still a string, parse again
        if (typeof parsed === "string") {
          try { return JSON.parse(parsed); } catch { return fallback; }
        }
        return parsed;
      } catch { return fallback; }
    }
    return v;
  };
  const normalized = { ...row };
  for (const field of JSON_ARRAY_FIELDS) {
    if (normalized[field] !== null && normalized[field] !== undefined) {
      const parsed = parseField(normalized[field], []);
      normalized[field] = Array.isArray(parsed) ? parsed : [];
    }
  }
  for (const field of JSON_OBJECT_FIELDS) {
    if (normalized[field] !== null && normalized[field] !== undefined) {
      const parsed = parseField(normalized[field], null);
      normalized[field] = (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : normalized[field];
    }
  }
  // Deep-normalize nested array fields inside maleIntake
  if (normalized.maleIntake && typeof normalized.maleIntake === "object") {
    const MALE_INTAKE_ARRAY_FIELDS = [
      "semenAnalysis", "dnaFragmentation", "previousTests",
      "geneticTests", "previousSurgeries",
    ];
    for (const f of MALE_INTAKE_ARRAY_FIELDS) {
      const v = normalized.maleIntake[f];
      if (v !== null && v !== undefined) {
        const parsed = parseField(v, []);
        normalized.maleIntake[f] = Array.isArray(parsed) ? parsed : [];
      }
    }
  }
  // Deep-normalize nested array fields inside artHistory cycles
  if (Array.isArray(normalized.artHistory)) {
    normalized.artHistory = normalized.artHistory.map((cycle: any) => {
      if (!cycle || typeof cycle !== "object") return cycle;
      const CYCLE_ARRAY_FIELDS = ["frozenEmbryos", "fetEmbryos", "transferredEmbryos"];
      const cleanCycle = { ...cycle };
      for (const f of CYCLE_ARRAY_FIELDS) {
        const v = cleanCycle[f];
        if (v !== null && v !== undefined) {
          const parsed = parseField(v, []);
          cleanCycle[f] = Array.isArray(parsed) ? parsed : [];
        }
      }
      return cleanCycle;
    });
  }
  return normalized;
}

export async function getMedicalIntake(leadId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(medicalIntake).where(eq(medicalIntake.leadId, leadId)).limit(1);
  return normalizeIntakeJSON(result[0]);
}

/** Hard-delete the entire medical intake record for a lead so it can be started fresh. */
export async function deleteIntakeByLeadId(leadId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(medicalIntake).where(eq(medicalIntake.leadId, leadId));
}

/**
 * Normalize intake data before writing to DB: parse any string-encoded JSON fields
 * back to objects/arrays so Drizzle's json() column doesn't double-encode them.
 */
function normalizeIntakeWriteData(data: any): any {
  const JSON_FIELDS = [
    "artHistory", "surgicalHistory", "miscarriageHistory", "previousTests",
    "radiologyStudies", "maleRadiologyStudies",
    "generalAttachmentsFemale", "generalAttachmentsMale", "femaleGeneticTests",
    "systemicDiseases", "maleIntake", "patientQuestions", "doctorAnswers",
  ];
  const normalized = { ...data };
  for (const field of JSON_FIELDS) {
    if (normalized[field] !== null && normalized[field] !== undefined && typeof normalized[field] === "string") {
      try {
        const parsed = JSON.parse(normalized[field]);
        // Handle double-encoding
        normalized[field] = typeof parsed === "string" ? JSON.parse(parsed) : parsed;
      } catch { /* leave as-is if unparseable */ }
    }
  }
  return normalized;
}

export async function upsertMedicalIntake(leadId: number, data: Partial<InsertMedicalIntake>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Normalize the caller-provided data (JSON field deserialization etc.)
  const clean = normalizeIntakeWriteData(data);

  // ── Atomic INSERT ... ON DUPLICATE KEY UPDATE ─────────────────────────────────────────────────
  // Uses the DB-level UNIQUE constraint on `leadId` to guarantee atomicity.
  // This eliminates the SELECT-then-INSERT race condition where two concurrent
  // saves could both see "no row" and both try to INSERT, causing a duplicate-key
  // error or silent data loss.
  //
  // INSERT branch: default intakeMode to 'legacy' when not explicitly provided.
  //   This ensures every NEW row has an explicit intakeMode.
  // UPDATE branch: only write columns that were explicitly provided in `data`.
  //   intakeMode is NOT defaulted in the update set — preserving the existing value.
  //   patientId IS allowed in the update set when explicitly provided (cross-stamping).
  const insertValues = { intakeMode: "legacy" as const, ...clean, leadId };
  const allCols = getTableColumns(medicalIntake);
  const updateSet: Record<string, unknown> = {};
  for (const [colName] of Object.entries(allCols)) {
    // id and leadId are immutable (primary key / unique key used for the upsert lookup).
    // createdAt is set once on INSERT and never updated.
    if (colName === "id" || colName === "leadId" || colName === "createdAt") continue;
    // Only include columns that were explicitly provided in `data` (after normalization).
    // This preserves existing values for fields not being updated.
    if (Object.prototype.hasOwnProperty.call(clean, colName)) {
      updateSet[colName] = (clean as any)[colName];
    }
  }
  // Always update updatedAt to reflect the save time (MySQL's ON UPDATE CURRENT_TIMESTAMP
  // only fires on actual row changes, so we force it here for consistency).
  if (Object.keys(updateSet).length === 0) {
    // No fields to update — just ensure the row exists.
    updateSet.updatedAt = new Date();
  }

  await db
    .insert(medicalIntake)
    .values(insertValues as InsertMedicalIntake)
    .onConflictDoUpdate({ target: medicalIntake.leadId, set: updateSet as any });
}

export async function convertLeadToPatient(leadId: number, createdBy: number): Promise<{ patientId: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const lead = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead[0]) throw new Error("Lead not found");
  const l = lead[0];

  // ── Rule 1: Backend idempotency guard — reject if already converted ──────────
  // This is the source-of-truth check; the UI guard alone is insufficient.
  if ((l as any).convertedPatientId) {
    const name = [l.firstName, l.lastName].filter(Boolean).join(" ");
    throw new Error(`Lead "${name}" has already been converted to a patient (Patient ID: ${(l as any).convertedPatientId}). Cannot convert again.`);
  }

  // Generate MRN using the atomic sequence counter (prevents duplicate MRNs)
  // Format: FRT-XXXXX / LEAD-XXXXX (appends the lead code for full traceability)
  const baseMrn = await getNextCode("patient");
  const mrn = l.code ? `${baseMrn} / ${l.code}` : baseMrn;

  // Helper: serialize arrays/objects to JSON strings for TEXT columns in patients table
  const toJsonStr = (v: unknown) => {
    if (v === null || v === undefined) return undefined;
    if (typeof v === "string") return v; // already serialized
    return JSON.stringify(v);
  };
  // Transfer ALL lead fields to the new patient record
  await db.insert(patients).values({
    mrn,
    firstName: l.firstName,
    middleName: l.middleName ?? undefined,
    lastName: l.lastName,
    dateOfBirth: l.dateOfBirth ?? undefined,
    email: l.email ?? undefined,
    secondaryEmail: (l as any).secondaryEmail ?? undefined,
    phone: l.phone ?? undefined,
    secondaryPhone: l.secondaryPhone ?? undefined,
    address: l.address ?? undefined,
    nationality: l.nationality ?? undefined,
    countryOfResidency: (l as any).countryOfResidency ?? undefined,
    gender: l.gender ?? undefined,
    preferredLanguages: toJsonStr(l.preferredLanguages) as any,
    primaryLanguage: l.primaryLanguage ?? undefined,
    preferredContactMethods: toJsonStr(l.preferredContactMethods) as any,
    // Lead source & campaign
    source: l.leadSource ?? undefined,
    leadSource: l.leadSource ?? undefined,
    socialLeadId: l.socialLeadId ?? undefined,
    campaignName: l.campaignName ?? undefined,
    // Clinical / fertility
    ivfExperience: l.ivfExperience ?? undefined,
    fertilityDiagnosis: toJsonStr(l.fertilityDiagnosis) as any,
    maleFertilityDiagnosis: toJsonStr((l as any).maleFertilityDiagnosis) as any,
    interestedProcedureId: l.interestedProcedureId ?? undefined,
    // CRM / pipeline
    budgetRange: l.budgetRange ?? undefined,
    decisionTimeline: l.decisionTimeline ?? undefined,
    travelReadiness: l.travelReadiness ?? undefined,
    rating: l.rating ?? undefined,
    tags: toJsonStr(l.tags) as any,
    assignedStaffId: l.assignedStaffId ?? undefined,
    lastContactDate: l.lastContactDate ?? undefined,
    nextFollowUpDate: l.nextFollowUpDate ?? undefined,
    // Location
    city: l.city ?? undefined,
    country: l.country ?? undefined,
    // Logistics
    accommodationHotel: l.accommodationHotel ?? undefined,
    accommodationLocation: l.accommodationLocation ?? undefined,
    transportationAirportPickup: l.transportationAirportPickup ?? false,
    transportationLocalTransfer: l.transportationLocalTransfer ?? false,
    // AI-generated content & notes
    caseSummary: l.caseSummary ?? undefined,
    salesNote: l.salesNote ?? undefined,
    // Transfer AI/notes to the patient notes field (concatenated)
    notes: [l.caseSummary, l.salesNote].filter(Boolean).join('\n\n---\n\n') || undefined,
    // Medical interest
    mainMedicalInterest: toJsonStr(l.mainMedicalInterest) as any,
    // Partner link (will be updated after both leads are converted)
    partnerId: undefined,
    // Brand & meta
    // Patient type (local/international) — drives pricing in invoices and proposals
    patientType: (l.patientType === "not-specified" ? undefined : (l.patientType as any)) ?? undefined,
    brand: l.brand ?? "fertiliv",
    status: "active_patient",
    createdBy,
  } as any);

  const created = await db.select({ id: patients.id }).from(patients).where(eq(patients.mrn, mrn)).limit(1);
  const patientId = created[0]?.id;
  if (!patientId) throw new Error("Failed to create patient");

  // The established Lead UI stores "Country of Residence" in `country`.
  // Preserve it in the patient-specific countryOfResidency field on conversion.
  if (l.country) {
    await db.update(patients)
      .set({ countryOfResidency: l.country } as any)
      .where(eq(patients.id, patientId));
  }

  // ── Rule 8: Shared-intake principle — keep leadId, only ADD patientId ─────────
  // Do NOT remove leadId. This ensures that if the Patient is deleted later,
  // the Health Record remains accessible from the Lead context.
  const existingIntake = await db.select({ id: medicalIntake.id }).from(medicalIntake).where(eq(medicalIntake.leadId, leadId)).limit(1);
  if (existingIntake[0]) {
    await db.update(medicalIntake)
      .set({ patientId } as any)          // keep leadId — do NOT set leadId: null
      .where(eq(medicalIntake.leadId, leadId));
  }

  // Re-link treatment proposals: set patientId (keep leadId for history)
  await db.update(treatmentProposals)
    .set({ patientId })
    .where(eq(treatmentProposals.leadId, leadId));

  // Transfer appointments: set patientId on all appointments linked to this lead
  await db.update(appointments)
    .set({ patientId })
    .where(eq(appointments.leadId, leadId));

  // Transfer documents: set patientId on all lead documents (keep leadId for history)
  await db.update(leadDocuments)
    .set({ patientId })
    .where(eq(leadDocuments.leadId, leadId));

  // Copy lead communications to patient communications
  const leadComms = await db.select().from(leadCommunications).where(eq(leadCommunications.leadId, leadId));
  if (leadComms.length > 0) {
    await db.insert(patientCommunications).values(
      leadComms.map(c => ({
        patientId,
        note: c.note,
        createdBy: c.createdBy,
        createdAt: c.createdAt,
      }))
    );
  }

  // Mark lead as converted — write BOTH sides of the link atomically inside a transaction.
  // writeBothLinkSides guarantees that if either write fails, neither is committed,
  // preventing one-sided link state from ever being created.
  await writeBothLinkSides(leadId, patientId, { leadStatus: "converted", modifiedAt: new Date() });

  return { patientId };
}

export async function getLeadStats() {
  const db = await getDb();
  if (!db) return { total: 0, intake: 0, converted: 0, lost: 0 };
  const total = await db.select({ c: sql<number>`count(*)` }).from(leads);
  const intake = await db.select({ c: sql<number>`count(*)` }).from(leads).where(eq(leads.leadStatus, "intake"));
  const converted = await db.select({ c: sql<number>`count(*)` }).from(leads).where(eq(leads.leadStatus, "converted"));
  const lost = await db.select({ c: sql<number>`count(*)` }).from(leads).where(eq(leads.leadStatus, "lost"));
  return {
    total: Number(total[0]?.c ?? 0),
    intake: Number(intake[0]?.c ?? 0),
    converted: Number(converted[0]?.c ?? 0),
    lost: Number(lost[0]?.c ?? 0),
  };
}

// ─── Treatment Packages ───────────────────────────────────────────────────────

export async function getTreatmentPackages() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(treatmentPackages).where(eq(treatmentPackages.isActive, true)).orderBy(treatmentPackages.name);
}

export async function createTreatmentPackage(data: InsertTreatmentPackage) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(treatmentPackages).values(data);
  const created = await db.select().from(treatmentPackages).orderBy(desc(treatmentPackages.createdAt)).limit(1);
  return created[0];
}

export async function updateTreatmentPackage(id: number, data: Partial<InsertTreatmentPackage>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(treatmentPackages).set(data as any).where(eq(treatmentPackages.id, id));
}

// ─── Treatment Proposals ──────────────────────────────────────────────────────

export async function getTreatmentProposals(filters?: { leadId?: number; patientId?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters?.leadId) conditions.push(eq(treatmentProposals.leadId, filters.leadId));
  if (filters?.patientId) conditions.push(eq(treatmentProposals.patientId, filters.patientId));
  const query = db.select().from(treatmentProposals).orderBy(desc(treatmentProposals.createdAt));
  if (conditions.length > 0) return query.where(and(...conditions));
  return query;
}

export async function getProposalById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(treatmentProposals).where(eq(treatmentProposals.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function createTreatmentProposal(data: InsertTreatmentProposal) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(treatmentProposals).values(data);
  const created = await db.select().from(treatmentProposals).orderBy(desc(treatmentProposals.createdAt)).limit(1);
  return created[0];
}

export async function updateTreatmentProposal(id: number, data: Partial<InsertTreatmentProposal>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(treatmentProposals).set(data as any).where(eq(treatmentProposals.id, id));
}

export async function deleteTreatmentProposal(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(treatmentProposals).where(eq(treatmentProposals.id, id));
}

// ─── Partner Clinics ──────────────────────────────────────────────────────────

export async function getPartnerClinics() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(partnerClinics).orderBy(partnerClinics.name);
}

export async function createPartnerClinic(data: InsertPartnerClinic) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(partnerClinics).values(data);
  const created = await db.select().from(partnerClinics).orderBy(desc(partnerClinics.createdAt)).limit(1);
  return created[0];
}

export async function updatePartnerClinic(id: number, data: Partial<InsertPartnerClinic>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(partnerClinics).set(data as any).where(eq(partnerClinics.id, id));
}

export async function deletePartnerClinic(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(partnerClinics).set({ isActive: false } as any).where(eq(partnerClinics.id, id));
}

// ─── Lab Result Visibility ────────────────────────────────────────────────────

export async function toggleLabResultVisibility(id: number, isVisibleToPatient: boolean) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(labResults).set({ isVisibleToPatient } as any).where(eq(labResults.id, id));
}

// ─── MRN Counter ─────────────────────────────────────────────────────────────
/** Preview the next MRN without consuming it */
export async function previewNextMRN(): Promise<string> {
  try {
    const db = await getDb();
    if (!db) return "FRT-00001";
    // Self-heal: get the actual max MRN from patients table
    const maxRows: any = await db.execute(
      // @ts-ignore
      `SELECT COALESCE(MAX(CAST(SUBSTRING(mrn, 5) AS UNSIGNED)), 0) AS max_n FROM patients WHERE mrn LIKE 'FRT-%'`
    );
    const maxData = Array.isArray(maxRows) && Array.isArray(maxRows[0]) ? maxRows[0] : (Array.isArray(maxRows) ? maxRows : []);
    const maxN = Number(maxData[0]?.max_n ?? maxData[0]?.[0] ?? 0);
    // Also check code_sequences counter
    const seqRows: any = await db.execute(
      // @ts-ignore
      `SELECT last_number FROM code_sequences WHERE entity_type = 'patient' LIMIT 1`
    );
    const seqData = Array.isArray(seqRows) && Array.isArray(seqRows[0]) ? seqRows[0] : (Array.isArray(seqRows) ? seqRows : []);
    const seqN = Number(seqData[0]?.last_number ?? seqData[0]?.[0] ?? 0);
    // Next MRN = max of both + 1
    const nextN = Math.max(maxN, seqN) + 1;
    return `FRT-${String(nextN).padStart(5, "0")}`;
  } catch {
    return "FRT-00001";
  }
}

/** Atomically consume the next MRN and return it (increments the counter) */
export async function consumeNextMRN(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.execute(sql`UPDATE mrn_counter SET next_value = next_value + 1 WHERE id = 1 RETURNING (next_value - 1) AS used`);
  const usedVal = Number((rows as unknown as Array<{ used?: number }>)[0]?.used ?? 1);
  return `FRT-${String(usedVal).padStart(5, "0")}`;
}

/** Admin-only: override a patient's MRN */
export async function updatePatientMRN(patientId: number, newMRN: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Check uniqueness
  const existing = await db.select({ id: patients.id }).from(patients).where(eq(patients.mrn, newMRN)).limit(1);
  if (existing[0] && existing[0].id !== patientId) throw new Error("MRN already in use by another patient");
  await db.update(patients).set({ mrn: newMRN } as any).where(eq(patients.id, patientId));
}

// ─── System Settings ──────────────────────────────────────────────────────────
export async function getSystemSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(systemSettings);
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

/**
 * Get the current exchange rate for a currency from the exchange_rates table.
 * Returns tryPerUnit: 1 [currency] = X TRY.
 * Falls back to system_settings for backward compatibility if not found.
 */
export async function getLiveExchangeRate(currency: string): Promise<number> {
  if (currency === "TRY") return 1;
  try {
    const { getOrFetchExchangeRates } = await import("./exchangeRateService");
    const result = await getOrFetchExchangeRates();
    if (result.rates[currency] && result.rates[currency].rate > 0) {
      return result.rates[currency].rate; // tryPerUnit
    }
  } catch { /* fall through to settings fallback */ }
  // Fallback: system_settings (legacy)
  const settings = await getSystemSettings();
  return parseFloat(settings[`exchange_rate_${currency}`] ?? "0") || 1;
}

/**
 * Strict approved-rate resolver used only when creating immutable payment FX
 * snapshots. Unlike the legacy display helper, it never silently substitutes 1
 * for an unavailable foreign-currency rate.
 */
type ApprovedPaymentRate = { rate: number; fxEffectiveAt: Date };

function paymentRateDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function paymentRateEffectiveAt(rateDate: string): Date {
  return new Date(`${rateDate}T00:00:00.000Z`);
}

export type ResolvedServicePriceEntry = {
  priceEntryCurrency: ServicePriceEntry["currency"];
  priceEntryAmount: string;
  priceEntryKind: ServicePriceEntry["kind"];
  priceFxRateToInvoice: string;
  priceFxSourceToTryRate: string | null;
  priceFxInvoiceToTryRate: string | null;
  priceFxSource: "system" | "manual" | null;
  priceFxEffectiveAt: Date | null;
  priceFxNote: string | null;
  convertedAmount: string;
};

/**
 * Resolves immutable source-price facts for one explicitly negotiated invoice
 * line. This path is intentionally unrelated to payments and never reads a
 * payment's Received At or FX snapshot.
 */
export async function resolveServicePriceEntry(input: {
  invoiceCurrency: ServicePriceEntry["currency"];
  priceEntry: ServicePriceEntry;
  /** Agreed-unit lines provide quantity × the stored source unit amount here. */
  sourceLineAmount?: string;
}): Promise<ResolvedServicePriceEntry> {
  const { invoiceCurrency, priceEntry } = input;
  if (!servicePriceEntryKinds.includes(priceEntry.kind)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Service price entry kind is invalid." });
  }
  const amount = new Decimal(String(priceEntry.amount ?? ""));
  if (!amount.isFinite() || amount.lte(0)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Negotiated service price must be greater than zero." });
  }
  const sourceAmount = input.sourceLineAmount ?? priceEntry.amount;
  const resolvedSourceAmount = new Decimal(String(sourceAmount));
  if (!resolvedSourceAmount.isFinite() || resolvedSourceAmount.lte(0)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Negotiated service line amount must be greater than zero." });
  }

  if (priceEntry.currency === invoiceCurrency) {
    const snapshot = computeServicePriceFxSnapshot({
      sourceCurrency: priceEntry.currency,
      invoiceCurrency,
      sourceAmount,
      source: null,
    });
    return {
      priceEntryCurrency: priceEntry.currency,
      priceEntryAmount: amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      priceEntryKind: priceEntry.kind,
      priceFxRateToInvoice: snapshot.rateToInvoice,
      priceFxSourceToTryRate: null,
      priceFxInvoiceToTryRate: null,
      priceFxSource: null,
      priceFxEffectiveAt: null,
      priceFxNote: null,
      convertedAmount: snapshot.convertedAmount,
    };
  }

  const fx = priceEntry.fx;
  if (!fx || (fx.source !== "system" && fx.source !== "manual")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose System FX or Manual Approved FX for a cross-currency service price." });
  }

  if (fx.source === "manual") {
    const note = String(fx.note ?? "").trim();
    if (note.length > 500) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Manual FX note cannot exceed 500 characters." });
    }
    let snapshot;
    try {
      snapshot = computeServicePriceFxSnapshot({
        sourceCurrency: priceEntry.currency,
        invoiceCurrency,
        sourceAmount,
        directRateToInvoice: fx.rateToInvoice,
        source: "manual",
      });
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Manual service price FX is invalid." });
    }
    return {
      priceEntryCurrency: priceEntry.currency,
      priceEntryAmount: amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      priceEntryKind: priceEntry.kind,
      priceFxRateToInvoice: snapshot.rateToInvoice,
      priceFxSourceToTryRate: null,
      priceFxInvoiceToTryRate: null,
      priceFxSource: "manual",
      priceFxEffectiveAt: new Date(),
      priceFxNote: note || null,
      convertedAmount: snapshot.convertedAmount,
    };
  }

  try {
    const { getOrFetchExchangeRates } = await import("./exchangeRateService");
    const rateData = await getOrFetchExchangeRates();
    const rateFor = (currency: string) => currency === "TRY"
      ? { rate: 1, rateDate: new Date().toISOString().slice(0, 10) }
      : rateData.rates[currency];
    const sourceRate = rateFor(priceEntry.currency);
    const invoiceRate = rateFor(invoiceCurrency);
    if (!sourceRate?.rate || sourceRate.rate <= 0 || !invoiceRate?.rate || invoiceRate.rate <= 0) {
      throw new Error("An approved Finance FX rate is unavailable for the selected price or invoice currency.");
    }
    const snapshot = computeServicePriceFxSnapshot({
      sourceCurrency: priceEntry.currency,
      invoiceCurrency,
      sourceAmount,
      sourceToTryRate: sourceRate.rate,
      invoiceToTryRate: invoiceRate.rate,
      source: "system",
    });
    const effectiveDate = sourceRate.rateDate && invoiceRate.rateDate && sourceRate.rateDate === invoiceRate.rateDate
      ? sourceRate.rateDate
      : sourceRate.rateDate ?? invoiceRate.rateDate ?? new Date().toISOString().slice(0, 10);
    return {
      priceEntryCurrency: priceEntry.currency,
      priceEntryAmount: amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      priceEntryKind: priceEntry.kind,
      priceFxRateToInvoice: snapshot.rateToInvoice,
      priceFxSourceToTryRate: snapshot.sourceToTryRate,
      priceFxInvoiceToTryRate: snapshot.invoiceToTryRate,
      priceFxSource: "system",
      priceFxEffectiveAt: paymentRateEffectiveAt(effectiveDate),
      priceFxNote: null,
      convertedAmount: snapshot.convertedAmount,
    };
  } catch (error) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: error instanceof Error ? error.message : "An approved Finance FX rate is unavailable for this service price.",
    });
  }
}

/**
 * Resolves the approved TRY-per-unit rate that applies to the actual received
 * date. It intentionally never falls back to legacy system_settings: those
 * display values may be stale or use an inverse convention.
 */
async function resolveApprovedPaymentExchangeRate(currency: string, receivedAt: Date): Promise<ApprovedPaymentRate> {
  if (Number.isNaN(receivedAt.getTime()) || receivedAt.getTime() > Date.now() + 60_000) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Payment Date must be a valid time that is not in the future." });
  }
  const requestedDate = paymentRateDateKey(receivedAt);
  if (currency === "TRY") return { rate: 1, fxEffectiveAt: paymentRateEffectiveAt(requestedDate) };

  const today = paymentRateDateKey(new Date());
  if (requestedDate === today) {
    try {
      const { getOrFetchExchangeRates } = await import("./exchangeRateService");
      const result = await getOrFetchExchangeRates();
      const current = result.rates[currency];
      if (current?.rate && current.rate > 0) {
        return { rate: current.rate, fxEffectiveAt: paymentRateEffectiveAt(current.rateDate ?? requestedDate) };
      }
    } catch { /* return the explicit review requirement below */ }
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `An approved exchange rate is unavailable for ${currency}. Refresh rates and try again.` });
  }

  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const stored = await db.select({ rate: exchangeRates.rate, rateDate: exchangeRates.rateDate })
    .from(exchangeRates)
    .where(and(
      eq(exchangeRates.baseCurrency, "TRY"),
      eq(exchangeRates.targetCurrency, currency),
      eq(exchangeRates.rateDate, requestedDate),
    ))
    .limit(1);
  const storedRate = parseFloat(String(stored[0]?.rate ?? "0"));
  if (Number.isFinite(storedRate) && storedRate > 0) {
    return { rate: storedRate, fxEffectiveAt: paymentRateEffectiveAt(requestedDate) };
  }

  // Frankfurter is the established approved provider for historical USD/EUR/GBP.
  // It returns 1 TRY = X foreign, so invert to the app's TRY-per-unit convention.
  if (["USD", "EUR", "GBP"].includes(currency)) {
    try {
      const response = await fetch(`https://api.frankfurter.app/${requestedDate}?from=TRY&to=${currency}`, { signal: AbortSignal.timeout(8_000) });
      const payload = await response.json() as { rates?: Record<string, number>; date?: string };
      const providerRate = payload.rates?.[currency];
      if (response.ok && providerRate && providerRate > 0) {
        return { rate: 1 / providerRate, fxEffectiveAt: paymentRateEffectiveAt(payload.date ?? requestedDate) };
      }
    } catch { /* return the explicit review requirement below */ }
  }

  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: `No approved historical exchange rate is available for ${currency} on ${requestedDate}. Record review is required before this payment can be entered.`,
  });
}

type PaymentFxRateResolution = {
  paymentToTryRate: number;
  invoiceToTryRate: number;
  fxEffectiveAt: Date;
  fxRateSource: "system" | "manual" | null;
  fxRateNote: string | null;
};

function parseManualPaymentFxRate(
  value: string | number | null | undefined,
  currency: string,
): number {
  const rate = new Decimal(String(value ?? ""));
  if (!rate.isFinite() || rate.lte(0)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Enter a valid approved rate for 1 ${currency} in TRY.`,
    });
  }
  return Number(rate.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4));
}

/**
 * Resolves the two TRY-per-unit values consumed by the existing immutable
 * payment snapshot calculator. Manual rates are scoped to this payment only.
 */
async function resolvePaymentFxRates(input: {
  paymentCurrency: string;
  invoiceCurrency: string;
  receivedAt: Date;
  manualFx?: ManualPaymentFxInput | null;
}): Promise<PaymentFxRateResolution> {
  const { paymentCurrency, invoiceCurrency, receivedAt, manualFx } = input;
  if (!manualFx) {
    const [paymentRate, invoiceRate] = await Promise.all([
      resolveApprovedPaymentExchangeRate(paymentCurrency, receivedAt),
      resolveApprovedPaymentExchangeRate(invoiceCurrency, receivedAt),
    ]);
    return {
      paymentToTryRate: paymentRate.rate,
      invoiceToTryRate: invoiceRate.rate,
      fxEffectiveAt: invoiceRate.fxEffectiveAt,
      fxRateSource: paymentCurrency === invoiceCurrency ? null : "system",
      fxRateNote: null,
    };
  }

  if (paymentCurrency === invoiceCurrency) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Manual FX is only available when the payment currency differs from the invoice currency.",
    });
  }
  const note = String(manualFx.note ?? "").trim();
  if (note.length < 3 || note.length > 500) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A manual FX audit note between 3 and 500 characters is required.",
    });
  }

  return {
    paymentToTryRate: paymentCurrency === "TRY" ? 1 : parseManualPaymentFxRate(manualFx.paymentToTryRate, paymentCurrency),
    invoiceToTryRate: invoiceCurrency === "TRY" ? 1 : parseManualPaymentFxRate(manualFx.invoiceToTryRate, invoiceCurrency),
    fxEffectiveAt: paymentRateEffectiveAt(paymentRateDateKey(receivedAt)),
    fxRateSource: "manual",
    fxRateNote: note,
  };
}

async function getApprovedPaymentExchangeRate(currency: string): Promise<number> {
  return (await resolveApprovedPaymentExchangeRate(currency, new Date())).rate;
}

export async function setSystemSetting(key: string, value: string, updatedBy?: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Use Drizzle ORM for consistent connection handling
  const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  if (existing.length > 0) {
    await db.update(systemSettings)
      .set({ value, ...(updatedBy ? { updatedBy } : {}) })
      .where(eq(systemSettings.key, key));
  } else {
    await db.insert(systemSettings).values({ key, value, ...(updatedBy ? { updatedBy } : {}) });
  }
}

// ─── Google Calendar G1 connection state ──────────────────────────────────────
// Tokens are encrypted before reaching these helpers. Do not use system_settings
// for credentials, and do not expose these raw rows through a client procedure.
const GOOGLE_CALENDAR_PROVIDER = "google";

export async function getGoogleCalendarConnection() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const rows = await db.select().from(googleCalendarConnections)
    .where(eq(googleCalendarConnections.provider, GOOGLE_CALENDAR_PROVIDER)).limit(1);
  return rows[0] ?? null;
}

export type GoogleCalendarAppointmentSyncState = "pending" | "synced" | "failed" | "deletion_pending" | "deleted";
export type GoogleCalendarAppointmentSyncOperation = "upsert" | "delete";

export async function getGoogleCalendarAppointmentSync(appointmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const rows = await db.select().from(googleCalendarAppointmentSyncs)
    .where(eq(googleCalendarAppointmentSyncs.appointmentId, appointmentId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Controlled one-time backfill inventory. This intentionally returns only
 * unmapped, non-terminal, future appointments with a Fertiliv Lead or Patient
 * relationship. It never creates a mapping or calls Google.
 */
export async function listEligibleUnmappedFutureGoogleCalendarAppointments(now: Date, limit = 25) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const safeLimit = Math.max(1, Math.min(limit, 25));
  return db.select({
    id: appointments.id,
    code: appointments.code,
    status: appointments.status,
    appointmentDate: appointments.appointmentDate,
    patientId: appointments.patientId,
    leadId: (appointments as any).leadId,
  }).from(appointments)
    .leftJoin(googleCalendarAppointmentSyncs, eq(googleCalendarAppointmentSyncs.appointmentId, appointments.id))
    .where(and(
      inArray(appointments.status, ["upcoming", "confirmed"] as any[]),
      gte(appointments.appointmentDate, now),
      or(isNotNull(appointments.patientId), isNotNull((appointments as any).leadId)),
      isNull(googleCalendarAppointmentSyncs.id),
    ))
    .orderBy(asc(appointments.appointmentDate), asc(appointments.id))
    .limit(safeLimit);
}

/** Persist the mapping before Google is called; never move its original calendar. */
export async function ensureGoogleCalendarAppointmentSync(input: {
  appointmentId: number;
  googleCalendarId: string | null;
  payloadHash: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const existing = await getGoogleCalendarAppointmentSync(input.appointmentId);
  if (existing) return existing;
  try {
    await db.insert(googleCalendarAppointmentSyncs).values({
      appointmentId: input.appointmentId,
      provider: GOOGLE_CALENDAR_PROVIDER,
      googleCalendarId: input.googleCalendarId,
      googleEventId: null,
      operation: "upsert",
      syncStatus: "pending",
      payloadHash: input.payloadHash,
      retryCount: 0,
      nextRetryAt: new Date(),
    });
  } catch {
    // A competing appointment save may have inserted the one permissible row.
  }
  const persisted = await getGoogleCalendarAppointmentSync(input.appointmentId);
  if (!persisted) throw new Error("Could not persist Google Calendar appointment mapping.");
  return persisted;
}

export async function setGoogleCalendarAppointmentSyncPending(input: {
  appointmentId: number;
  operation: GoogleCalendarAppointmentSyncOperation;
  payloadHash?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.update(googleCalendarAppointmentSyncs).set({
    operation: input.operation,
    syncStatus: input.operation === "delete" ? "deletion_pending" : "pending",
    ...(input.payloadHash !== undefined ? { payloadHash: input.payloadHash } : {}),
    lastSyncError: null,
    nextRetryAt: new Date(),
  }).where(eq(googleCalendarAppointmentSyncs.appointmentId, input.appointmentId));
}

export async function markGoogleCalendarAppointmentSyncSucceeded(input: {
  appointmentId: number;
  payloadHash?: string | null;
  deleted?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.update(googleCalendarAppointmentSyncs).set({
    syncStatus: input.deleted ? "deleted" : "synced",
    operation: input.deleted ? "delete" : "upsert",
    ...(input.payloadHash !== undefined ? { payloadHash: input.payloadHash } : {}),
    ...(input.deleted ? { googleEventHtmlLink: null, lastVerifiedEventAt: null } : {}),
    lastSyncedAt: new Date(),
    lastSyncError: null,
    retryCount: 0,
    nextRetryAt: null,
  }).where(eq(googleCalendarAppointmentSyncs.appointmentId, input.appointmentId));
}

export async function setGoogleCalendarAppointmentSyncDestination(appointmentId: number, googleCalendarId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  // An existing event remains in its original destination even if G1 settings later change.
  await db.update(googleCalendarAppointmentSyncs).set({ googleCalendarId })
    .where(and(eq(googleCalendarAppointmentSyncs.appointmentId, appointmentId), isNull(googleCalendarAppointmentSyncs.googleCalendarId)));
}

export async function setGoogleCalendarAppointmentSyncEventId(appointmentId: number, googleEventId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.update(googleCalendarAppointmentSyncs).set({
    googleEventId,
    googleEventHtmlLink: null,
    lastVerifiedEventAt: null,
  })
    .where(eq(googleCalendarAppointmentSyncs.appointmentId, appointmentId));
}

/** Store successful same-mapping Google event verification for deterministic reopen hydration. */
export async function markGoogleCalendarAppointmentEventVerified(appointmentId: number, googleEventHtmlLink: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.update(googleCalendarAppointmentSyncs).set({
    googleEventHtmlLink,
    lastVerifiedEventAt: new Date(),
  }).where(eq(googleCalendarAppointmentSyncs.appointmentId, appointmentId));
}

/** Clear only readiness metadata when the mapped event is confirmed unavailable or deleted. */
export async function clearGoogleCalendarAppointmentEventReadiness(appointmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.update(googleCalendarAppointmentSyncs).set({
    googleEventHtmlLink: null,
    lastVerifiedEventAt: null,
  }).where(eq(googleCalendarAppointmentSyncs.appointmentId, appointmentId));
}

export async function markGoogleCalendarAppointmentSyncFailure(input: {
  appointmentId: number;
  operation: GoogleCalendarAppointmentSyncOperation;
  safeError: string;
  retryable: boolean;
  nextRetryAt: Date | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const current = await getGoogleCalendarAppointmentSync(input.appointmentId);
  if (!current) return;
  await db.update(googleCalendarAppointmentSyncs).set({
    operation: input.operation,
    syncStatus: input.operation === "delete" ? "deletion_pending" : "failed",
    lastSyncError: input.safeError.slice(0, 512),
    retryCount: current.retryCount + (input.retryable ? 1 : 0),
    nextRetryAt: input.retryable ? input.nextRetryAt : null,
  }).where(eq(googleCalendarAppointmentSyncs.id, current.id));
}

export async function listRetryableGoogleCalendarAppointmentSyncs(now: Date, limit: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  return db.select().from(googleCalendarAppointmentSyncs)
    .where(and(
      inArray(googleCalendarAppointmentSyncs.syncStatus, ["pending", "failed", "deletion_pending"]),
      lt(googleCalendarAppointmentSyncs.retryCount, 5),
      or(isNull(googleCalendarAppointmentSyncs.nextRetryAt), lte(googleCalendarAppointmentSyncs.nextRetryAt, now)),
    ))
    .orderBy(asc(googleCalendarAppointmentSyncs.updatedAt))
    .limit(limit);
}

/** Operational aggregate only: no appointment, Lead, Patient, event, or credential data. */
export async function getGoogleCalendarOperationalHealth() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const counts = await db.select({
    status: googleCalendarAppointmentSyncs.syncStatus,
    total: count(),
  }).from(googleCalendarAppointmentSyncs)
    .where(ne(googleCalendarAppointmentSyncs.syncStatus, "deleted"))
    .groupBy(googleCalendarAppointmentSyncs.syncStatus);
  const lastSuccessRows = await db.select({
    lastSuccessfulSyncAt: sql<Date | null>`max(${googleCalendarAppointmentSyncs.lastSyncedAt})`,
  }).from(googleCalendarAppointmentSyncs)
    .where(eq(googleCalendarAppointmentSyncs.syncStatus, "synced"));
  const countByStatus = new Map(counts.map(row => [row.status, Number(row.total)]));
  return {
    pendingCount: (countByStatus.get("pending") ?? 0) + (countByStatus.get("deletion_pending") ?? 0),
    failedCount: countByStatus.get("failed") ?? 0,
    lastSuccessfulSyncAt: lastSuccessRows[0]?.lastSuccessfulSyncAt ?? null,
  };
}

export async function getGoogleCalendarAppointmentForSync(appointmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const hostUsers = aliasedTable(users, "g2HostUser");
  const linkedLeads = aliasedTable(leads, "g2LinkedLead");
  const rows = await db.select({
    id: appointments.id,
    patientId: appointments.patientId,
    leadId: (appointments as any).leadId,
    title: appointments.title,
    appointmentDate: appointments.appointmentDate,
    endDate: appointments.endDate,
    duration: appointments.duration,
    type: appointments.type,
    appointmentType: (appointments as any).appointmentType,
    googleReminderMode: (appointments as any).googleReminderMode,
    purpose: (appointments as any).purpose,
    meetingLink: (appointments as any).meetingLink,
    externalLocation: (appointments as any).externalLocation,
    partnerClinicId: (appointments as any).partnerClinicId,
    partnerClinicName: partnerClinics.name,
    partnerClinicAddress: partnerClinics.address,
    partnerClinicGoogleMapsUrl: partnerClinics.googleMapsUrl,
    status: appointments.status,
    code: appointments.code,
    patientFirstName: patients.firstName,
    patientLastName: patients.lastName,
    leadFirstName: linkedLeads.firstName,
    leadLastName: linkedLeads.lastName,
    doctorName: users.name,
    hostUserName: hostUsers.name,
  }).from(appointments)
    .leftJoin(patients, eq(appointments.patientId, patients.id))
    .leftJoin(linkedLeads, eq((appointments as any).leadId, linkedLeads.id))
    .leftJoin(doctors, eq(appointments.doctorId, doctors.id))
    .leftJoin(partnerClinics, eq((appointments as any).partnerClinicId, partnerClinics.id))
    .leftJoin(users, eq(doctors.userId, users.id))
    .leftJoin(hostUsers, eq((appointments as any).hostUserId, hostUsers.id))
    .where(eq(appointments.id, appointmentId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const clinic = await getClinicInfo();
  return {
    ...row,
    clinicName: clinic?.nameEn?.trim() || clinic?.nameTr?.trim() || clinic?.nameAr?.trim() || null,
    clinicAddress: clinic?.addressEn?.trim() || clinic?.addressTr?.trim() || clinic?.addressAr?.trim() || null,
    ...normalizeCalendarAppointmentIdentity(row),
  };
}

export async function saveGoogleCalendarConnection(input: {
  connectedAccountEmail: string;
  encryptedRefreshToken: string;
  connectedByUserId: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const existing = await getGoogleCalendarConnection();
  const now = new Date();
  const values = {
    connectedAccountEmail: input.connectedAccountEmail,
    encryptedRefreshToken: input.encryptedRefreshToken,
    destinationCalendarId: null,
    destinationCalendarName: null,
    businessTimezone: "Europe/Istanbul",
    status: "connected" as const,
    connectedByUserId: input.connectedByUserId,
    connectedAt: now,
    lastValidatedAt: null,
    lastError: null,
    testEventId: null,
    testEventCalendarId: null,
  };
  if (existing) {
    await db.update(googleCalendarConnections).set(values).where(eq(googleCalendarConnections.id, existing.id));
    return;
  }
  await db.insert(googleCalendarConnections).values({ provider: GOOGLE_CALENDAR_PROVIDER, ...values });
}

export async function setGoogleCalendarDestination(input: { calendarId: string; calendarName: string; userId: number }): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const connection = await getGoogleCalendarConnection();
  if (!connection) throw new Error("Google Calendar is not connected.");
  await db.update(googleCalendarConnections).set({
    destinationCalendarId: input.calendarId,
    destinationCalendarName: input.calendarName,
    connectedByUserId: input.userId,
    status: "connected",
    lastError: null,
    testEventId: null,
    testEventCalendarId: null,
  }).where(eq(googleCalendarConnections.id, connection.id));
}

export async function markGoogleCalendarConnection(input: {
  status: "connected" | "needs_attention";
  lastError?: string | null;
  validatedAt?: Date | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const connection = await getGoogleCalendarConnection();
  if (!connection) return;
  await db.update(googleCalendarConnections).set({
    status: input.status,
    lastError: input.lastError ?? null,
    ...(input.validatedAt ? { lastValidatedAt: input.validatedAt } : {}),
  }).where(eq(googleCalendarConnections.id, connection.id));
}

export async function setGoogleCalendarTestEvent(eventId: string, calendarId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const connection = await getGoogleCalendarConnection();
  if (!connection) throw new Error("Google Calendar is not connected.");
  await db.update(googleCalendarConnections).set({ testEventId: eventId, testEventCalendarId: calendarId })
    .where(eq(googleCalendarConnections.id, connection.id));
}

export async function clearGoogleCalendarTestEvent(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const connection = await getGoogleCalendarConnection();
  if (!connection) return;
  await db.update(googleCalendarConnections).set({ testEventId: null, testEventCalendarId: null })
    .where(eq(googleCalendarConnections.id, connection.id));
}

export async function deleteGoogleCalendarConnection(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.delete(googleCalendarConnections).where(eq(googleCalendarConnections.provider, GOOGLE_CALENDAR_PROVIDER));
}

export async function createGoogleCalendarOAuthState(input: { stateHash: string; userId: number; expiresAt: Date }): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.insert(googleCalendarOAuthStates).values(input);
}

export async function consumeGoogleCalendarOAuthState(stateHash: string, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const rows = await db.select().from(googleCalendarOAuthStates)
    .where(and(eq(googleCalendarOAuthStates.stateHash, stateHash), eq(googleCalendarOAuthStates.userId, userId))).limit(1);
  const state = rows[0];
  if (!state) return false;
  await db.delete(googleCalendarOAuthStates).where(eq(googleCalendarOAuthStates.id, state.id));
  return state.expiresAt.getTime() > Date.now();
}

export async function bulkAdjustServicePrices(category: string, pct: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const multiplier = 1 + pct / 100;
  const allServices = category === "all"
    ? await db.select().from(services)
    : await db.select().from(services).where(eq(services.category, category as any));
  let updated = 0;
  for (const svc of allServices) {
    const newPrice = (parseFloat(svc.price) * multiplier).toFixed(2);
    const newLocalTRY = svc.localPriceTRY ? (parseFloat(svc.localPriceTRY) * multiplier).toFixed(2) : null;
    await db.update(services).set({
      price: newPrice,
      ...(newLocalTRY ? { localPriceTRY: newLocalTRY } : {}),
    } as any).where(eq(services.id, svc.id));
    updated++;
  }
  return updated;
}

// ─── Couple-Centric CRM ───────────────────────────────────────────────────────

/** Link two leads as partners (sets partnerId on both) */
export async function linkLeadPartner(leadId: number, partnerId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (leadId === partnerId) throw new Error("A lead cannot be their own partner");

  // One-to-one validation: reject if either side already has an active partner link
  const [currentLead, targetLead] = await Promise.all([
    db.select({ partnerId: leads.partnerId, firstName: leads.firstName, lastName: leads.lastName, convertedPatientId: (leads as any).convertedPatientId }).from(leads).where(eq(leads.id, leadId)).limit(1),
    db.select({ partnerId: leads.partnerId, firstName: leads.firstName, lastName: leads.lastName, convertedPatientId: (leads as any).convertedPatientId }).from(leads).where(eq(leads.id, partnerId)).limit(1),
  ]);

  // ── Rule 5: Prevent linking a converted Lead as a Lead partner ───────────────
  // If a Lead is already converted to a Patient, it should not be linked as a
  // Lead partner. Use Patient Partner Linking from the Patient profile instead.
  if (currentLead[0]?.convertedPatientId) {
    const name = [currentLead[0].firstName, currentLead[0].lastName].filter(Boolean).join(" ");
    throw new Error(`Lead "${name}" has already been converted to a patient. Please use Patient Partner Linking from the Patient profile instead.`);
  }
  if (targetLead[0]?.convertedPatientId) {
    const name = [targetLead[0].firstName, targetLead[0].lastName].filter(Boolean).join(" ");
    throw new Error(`Lead "${name}" has already been converted to a patient. Please use Patient Partner Linking from the Patient profile instead.`);
  }

  if (currentLead[0]?.partnerId && currentLead[0].partnerId !== partnerId) {
    throw new Error("This record already has a linked partner. Please unlink the current partner before linking a new one.");
  }
  if (targetLead[0]?.partnerId && targetLead[0].partnerId !== leadId) {
    throw new Error("The selected record already has a linked partner. Please unlink it first before creating a new partner link.");
  }

  await db.update(leads).set({ partnerId } as any).where(eq(leads.id, leadId));
  await db.update(leads).set({ partnerId: leadId } as any).where(eq(leads.id, partnerId));
}

/** Remove partner link from both leads */
export async function unlinkLeadPartner(leadId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const lead = await db.select({ partnerId: leads.partnerId }).from(leads).where(eq(leads.id, leadId)).limit(1);
  const pid = lead[0]?.partnerId;
  await db.update(leads).set({ partnerId: null } as any).where(eq(leads.id, leadId));
  if (pid) {
    await db.update(leads).set({ partnerId: null } as any).where(eq(leads.id, pid));
  }
}

/** Get the partner lead's basic info for a given leadId */
export async function getLeadPartner(leadId: number) {
  const db = await getDb();
  if (!db) return null;
  const lead = await db.select({ partnerId: leads.partnerId }).from(leads).where(eq(leads.id, leadId)).limit(1);
  const pid = lead[0]?.partnerId;
  if (!pid) return null;
  const partner = await db.select().from(leads).where(eq(leads.id, pid)).limit(1);
  return partner[0] ?? null;
}

/** Convert both leads in a couple to patients simultaneously. */
export async function convertCoupleToPatients(
  lead1Id: number,
  lead2Id: number,
  createdBy: number,
): Promise<{ patient1Id: number; patient2Id: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const [l1Row, l2Row] = await Promise.all([
    db.select().from(leads).where(eq(leads.id, lead1Id)).limit(1),
    db.select().from(leads).where(eq(leads.id, lead2Id)).limit(1),
  ]);
  if (!l1Row[0]) throw new Error(`Lead ${lead1Id} not found`);
  if (!l2Row[0]) throw new Error(`Lead ${lead2Id} not found`);
  const l1 = l1Row[0];
  const l2 = l2Row[0];

  // ── Idempotency guard: reject if either lead is already converted ────────────
  if ((l1 as any).convertedPatientId) {
    const name = [l1.firstName, l1.lastName].filter(Boolean).join(" ");
    throw new Error(`Lead "${name}" has already been converted to a patient. Cannot convert again.`);
  }
  if ((l2 as any).convertedPatientId) {
    const name = [l2.firstName, l2.lastName].filter(Boolean).join(" ");
    throw new Error(`Lead "${name}" has already been converted to a patient. Cannot convert again.`);
  }

  const baseMrn1 = await consumeNextMRN();
  const baseMrn2 = await consumeNextMRN();
  const mrn1 = l1.code ? `${baseMrn1} / ${l1.code}` : baseMrn1;
  const mrn2 = l2.code ? `${baseMrn2} / ${l2.code}` : baseMrn2;

  const toJsonStr = (v: unknown) => {
    if (v === null || v === undefined) return undefined;
    if (typeof v === "string") return v;
    return JSON.stringify(v);
  };

  const buildPatientValues = (l: typeof l1, mrn: string) => ({
    mrn,
    firstName: l.firstName,
    middleName: l.middleName ?? undefined,
    lastName: l.lastName,
    dateOfBirth: l.dateOfBirth ?? undefined,
    email: l.email ?? undefined,
    secondaryEmail: (l as any).secondaryEmail ?? undefined,
    phone: l.phone ?? undefined,
    secondaryPhone: l.secondaryPhone ?? undefined,
    address: l.address ?? undefined,
    nationality: l.nationality ?? undefined,
    countryOfResidency: (l as any).countryOfResidency ?? undefined,
    gender: l.gender ?? undefined,
    preferredLanguages: toJsonStr(l.preferredLanguages) as any,
    primaryLanguage: l.primaryLanguage ?? undefined,
    preferredContactMethods: toJsonStr(l.preferredContactMethods) as any,
    source: l.leadSource ?? undefined,
    leadSource: l.leadSource ?? undefined,
    socialLeadId: l.socialLeadId ?? undefined,
    campaignName: l.campaignName ?? undefined,
    ivfExperience: l.ivfExperience ?? undefined,
    fertilityDiagnosis: toJsonStr(l.fertilityDiagnosis) as any,
    maleFertilityDiagnosis: toJsonStr((l as any).maleFertilityDiagnosis) as any,
    interestedProcedureId: l.interestedProcedureId ?? undefined,
    budgetRange: l.budgetRange ?? undefined,
    decisionTimeline: l.decisionTimeline ?? undefined,
    travelReadiness: l.travelReadiness ?? undefined,
    rating: l.rating ?? undefined,
    tags: toJsonStr(l.tags) as any,
    assignedStaffId: l.assignedStaffId ?? undefined,
    lastContactDate: l.lastContactDate ?? undefined,
    nextFollowUpDate: l.nextFollowUpDate ?? undefined,
    city: l.city ?? undefined,
    country: l.country ?? undefined,
    accommodationHotel: l.accommodationHotel ?? undefined,
    accommodationLocation: l.accommodationLocation ?? undefined,
    transportationAirportPickup: l.transportationAirportPickup ?? false,
    transportationLocalTransfer: l.transportationLocalTransfer ?? false,
    caseSummary: l.caseSummary ?? undefined,
    salesNote: l.salesNote ?? undefined,
    notes: [l.caseSummary, l.salesNote].filter(Boolean).join('\n\n---\n\n') || undefined,
    mainMedicalInterest: toJsonStr(l.mainMedicalInterest) as any,
    patientType: (l.patientType === "not-specified" ? undefined : (l.patientType as any)) ?? undefined,
    brand: l.brand ?? "fertiliv",
    status: "active_patient" as const,
    createdBy,
  });

  await db.insert(patients).values(buildPatientValues(l1, mrn1) as any);
  const p1Row = await db.select({ id: patients.id }).from(patients).where(eq(patients.mrn, mrn1)).limit(1);
  const patient1Id = p1Row[0]?.id;
  if (!patient1Id) throw new Error("Failed to create patient 1");

  await db.insert(patients).values(buildPatientValues(l2, mrn2) as any);
  const p2Row = await db.select({ id: patients.id }).from(patients).where(eq(patients.mrn, mrn2)).limit(1);
  const patient2Id = p2Row[0]?.id;
  if (!patient2Id) throw new Error("Failed to create patient 2");

  // Mirror the established Lead "Country of Residence" value to each patient.
  await Promise.all([
    l1.country
      ? db.update(patients).set({ countryOfResidency: l1.country } as any).where(eq(patients.id, patient1Id))
      : Promise.resolve(),
    l2.country
      ? db.update(patients).set({ countryOfResidency: l2.country } as any).where(eq(patients.id, patient2Id))
      : Promise.resolve(),
  ]);

  await db.update(patients).set({ partnerId: patient2Id } as any).where(eq(patients.id, patient1Id));
  await db.update(patients).set({ partnerId: patient1Id } as any).where(eq(patients.id, patient2Id));

  // Phase 2 fix: each partner has their own separate medical_intake row.
  // Assign each intake to its own patient — do NOT use OR + limit(1) which picks one arbitrarily.
  const intake1Row = await db.select({ id: medicalIntake.id }).from(medicalIntake)
    .where(eq(medicalIntake.leadId, lead1Id)).limit(1);
  if (intake1Row[0]) {
    await db.update(medicalIntake)
      .set({ patientId: patient1Id, leadId: lead1Id } as any)
      .where(eq(medicalIntake.id, intake1Row[0].id));
  }
  const intake2Row = await db.select({ id: medicalIntake.id }).from(medicalIntake)
    .where(eq(medicalIntake.leadId, lead2Id)).limit(1);
  if (intake2Row[0]) {
    await db.update(medicalIntake)
      .set({ patientId: patient2Id, leadId: lead2Id } as any)
      .where(eq(medicalIntake.id, intake2Row[0].id));
  }

  // Write BOTH sides of each link atomically inside individual transactions.
  // writeBothLinkSides guarantees no partial link state is left if either write fails.
  await writeBothLinkSides(lead1Id, patient1Id, { leadStatus: "converted", modifiedAt: new Date() });
  await writeBothLinkSides(lead2Id, patient2Id, { leadStatus: "converted", modifiedAt: new Date() });

  return { patient1Id, patient2Id };
}

/**
 * Resolve the linked leadId for a patient.
 * Checks patients.socialLeadId first (fast path), then falls back to
 * leads.convertedPatientId (resilient path for partial-link states).
 * Returns null if the patient was created directly (no linked lead).
 */
export async function resolveLinkedLeadId(patientId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  // Fast path: patient row carries socialLeadId
  const patRow = await db
    .select({ socialLeadId: patients.socialLeadId })
    .from(patients)
    .where(eq(patients.id, patientId))
    .limit(1);
  const socialLeadId = patRow[0]?.socialLeadId ? Number(patRow[0].socialLeadId) : null;
  if (socialLeadId) return socialLeadId;
  // Resilient path: find the lead whose convertedPatientId = patientId
  const leadRow = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq((leads as any).convertedPatientId, patientId))
    .limit(1);
  return leadRow[0]?.id ?? null;
}

/**
 * Resolve the linked patientId for a lead.
 * Returns null if the lead has not been converted to a patient.
 */
export async function resolveLinkedPatientId(leadId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const row = await db
    .select({ convertedPatientId: (leads as any).convertedPatientId })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  return row[0]?.convertedPatientId ?? null;
}

export async function getMedicalIntakeByPatientId(patientId: number) {
  // ── Canonical resolver: always read from the lead-owned row when a link exists ──
  // This ensures the Lead page and Patient page always see the same intake row.
  const linkedLeadId = await resolveLinkedLeadId(patientId);
  if (linkedLeadId) return getMedicalIntake(linkedLeadId);
  // Directly-created patient (no linked lead): read by patientId
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(medicalIntake).where(eq(medicalIntake.patientId, patientId)).limit(1);
  return normalizeIntakeJSON(result[0]);
}

/**
 * Canonical intake write path for a patient (by patientId).
 *
 * Routing rules (single canonical write path — Issue #1):
 *   A) Converted person (linked lead exists):
 *      → Delegates to upsertMedicalIntake(linkedLeadId, { ...data, patientId })
 *        so BOTH pages always update the SAME row (the lead-keyed row).
 *        patientId is cross-stamped on every write so the patient-UNIQUE index
 *        also resolves to the same row.
 *   B) Directly-created patient (no linked lead):
 *      → Uses INSERT ... ON DUPLICATE KEY UPDATE on the patientId UNIQUE key.
 *        This is the only case where a patient-keyed row exists without a leadId.
 *
 * This function can NEVER create a second row for a converted person.
 */
export async function upsertMedicalIntakeForPatient(patientId: number, data: Partial<InsertMedicalIntake>) {
  // ── Case A: Converted person — always write to the lead-owned canonical row ──
  const linkedLeadId = await resolveLinkedLeadId(patientId);
  if (linkedLeadId) {
    // Delegate to the atomic lead-path upsert.
    // patientId is explicitly stamped so the patient UNIQUE index resolves to the same row.
    await upsertMedicalIntake(linkedLeadId, { ...data, patientId });
    return;
  }
  // ── Case B: Directly-created patient (no linked lead) ──
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const clean = normalizeIntakeWriteData(data);
  const allCols = getTableColumns(medicalIntake);
  const updateSet: Record<string, unknown> = {};
  for (const [colName] of Object.entries(allCols)) {
    // patientId is the UNIQUE key for this path — never overwrite it.
    if (colName === "id" || colName === "leadId" || colName === "patientId" || colName === "createdAt") continue;
    if (Object.prototype.hasOwnProperty.call(clean, colName)) {
      updateSet[colName] = (clean as any)[colName];
    }
  }
  if (Object.keys(updateSet).length === 0) {
    updateSet.updatedAt = new Date();
  }
  await db
    .insert(medicalIntake)
    .values({ intakeMode: "legacy" as const, ...clean, patientId } as InsertMedicalIntake)
    .onConflictDoUpdate({ target: medicalIntake.patientId, set: updateSet as any });
}

/** Link two patients as partners */
export async function linkPatientPartner(patientId: number, partnerId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (patientId === partnerId) throw new Error("A patient cannot be their own partner");

  // One-to-one validation: reject if either side already has an active partner link
  const [currentPatient, targetPatient] = await Promise.all([
    db.select({ partnerId: patients.partnerId }).from(patients).where(eq(patients.id, patientId)).limit(1),
    db.select({ partnerId: patients.partnerId }).from(patients).where(eq(patients.id, partnerId)).limit(1),
  ]);
  if (currentPatient[0]?.partnerId && currentPatient[0].partnerId !== partnerId) {
    throw new Error("This record already has a linked partner. Please unlink the current partner before linking a new one.");
  }
  if (targetPatient[0]?.partnerId && targetPatient[0].partnerId !== patientId) {
    throw new Error("The selected record already has a linked partner. Please unlink it first before creating a new partner link.");
  }

  await db.update(patients).set({ partnerId } as any).where(eq(patients.id, patientId));
  await db.update(patients).set({ partnerId: patientId } as any).where(eq(patients.id, partnerId));
}

/** Remove partner link from both patients */
export async function unlinkPatientPartner(patientId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const patient = await db.select({ partnerId: patients.partnerId }).from(patients).where(eq(patients.id, patientId)).limit(1);
  const pid = patient[0]?.partnerId;
  await db.update(patients).set({ partnerId: null } as any).where(eq(patients.id, patientId));
  if (pid) {
    await db.update(patients).set({ partnerId: null } as any).where(eq(patients.id, pid));
  }
}

/** Get the partner patient's basic info for a given patientId */
export async function getPatientPartner(patientId: number) {
  const db = await getDb();
  if (!db) return null;
  const patient = await db.select({ partnerId: patients.partnerId }).from(patients).where(eq(patients.id, patientId)).limit(1);
  const pid = patient[0]?.partnerId;
  if (!pid) return null;
  const partner = await db.select().from(patients).where(eq(patients.id, pid)).limit(1);
  return partner[0] ?? null;
}

export async function getAppointmentById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Returns only the non-clinical values that must remain auditable after a hard appointment delete. */
export async function getAppointmentDeletionAuditSnapshot(appointmentId: number): Promise<AppointmentDeletionAuditSnapshot | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      appointmentId: appointments.id,
      appointmentCode: appointments.code,
      appointmentDate: appointments.appointmentDate,
      status: appointments.status,
      patientId: appointments.patientId,
      leadId: appointments.leadId,
      patientFirstName: patients.firstName,
      patientMiddleName: patients.middleName,
      patientLastName: patients.lastName,
      leadFirstName: leads.firstName,
      leadLastName: leads.lastName,
    })
    .from(appointments)
    .leftJoin(patients, eq(appointments.patientId, patients.id))
    .leftJoin(leads, eq(appointments.leadId, leads.id))
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const patientName = [row.patientFirstName, row.patientMiddleName, row.patientLastName].filter(Boolean).join(" ").trim();
  const leadName = [row.leadFirstName, row.leadLastName].filter(Boolean).join(" ").trim();
  const personType = row.patientId ? "Patient" : row.leadId ? "Lead" : "Unlinked";
  const personName = row.patientId ? patientName || "Patient" : row.leadId ? leadName || "Lead" : "Unlinked appointment";
  return {
    appointmentId: row.appointmentId,
    appointmentReference: row.appointmentCode?.trim() || `Appointment ${row.appointmentId}`,
    personType,
    personName,
    appointmentDate: row.appointmentDate,
    status: row.status,
  };
}

export type AppointmentCommunicationRecipientSource = "primary" | "partner";
export type AppointmentCommunicationRecipient = {
  source: AppointmentCommunicationRecipientSource;
  recipientType: "patient" | "lead" | "partner";
  displayName: string;
  email: string;
  preferredLanguage: string | null;
};

export type AppointmentCommunicationContext = {
  appointment: {
    id: number;
    status: string;
    appointmentDate: Date;
    endDate: Date | null;
    duration: number | null;
    type: string;
    appointmentType: string | null;
    purpose: string | null;
    meetingLink: string | null;
    partnerClinicId: number | null;
    externalLocation: string | null;
  };
  primaryRecipient: AppointmentCommunicationRecipient | null;
  partnerRecipient: AppointmentCommunicationRecipient | null;
  partnerClinic: { name: string; address: string | null; googleMapsUrl: string | null } | null;
  clinic: {
    nameEn: string | null;
    nameAr: string | null;
    nameTr: string | null;
    addressEn: string | null;
    addressAr: string | null;
    addressTr: string | null;
    mapsLink: string | null;
  } | null;
};

function formatCommunicationName(firstName?: string | null, middleName?: string | null, lastName?: string | null): string {
  return [firstName, middleName, lastName].filter((part): part is string => Boolean(part?.trim())).join(" ").trim();
}

/**
 * Returns only the data required to construct a participant-facing appointment
 * communication. This intentionally excludes appointment title, notes, clinical
 * data, financial data, MRN, cancellation reason, and all CRM details.
 */
export async function getAppointmentCommunicationContext(appointmentId: number): Promise<AppointmentCommunicationContext | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select({
      id: appointments.id,
      patientId: appointments.patientId,
      leadId: appointments.leadId,
      status: appointments.status,
      appointmentDate: appointments.appointmentDate,
      endDate: appointments.endDate,
      duration: appointments.duration,
      type: appointments.type,
      appointmentType: appointments.appointmentType,
      purpose: appointments.purpose,
      meetingLink: appointments.meetingLink,
      partnerClinicId: appointments.partnerClinicId,
      externalLocation: appointments.externalLocation,
      partnerClinicName: partnerClinics.name,
      partnerClinicAddress: partnerClinics.address,
      partnerClinicGoogleMapsUrl: partnerClinics.googleMapsUrl,
    })
    .from(appointments)
    .leftJoin(partnerClinics, eq(appointments.partnerClinicId, partnerClinics.id))
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  const appointment = rows[0];
  if (!appointment) return null;

  let primaryRecipient: AppointmentCommunicationRecipient | null = null;
  let partnerRecipient: AppointmentCommunicationRecipient | null = null;

  // The same Patient-first relationship rule used by the Calendar identity contract.
  if (appointment.patientId) {
    const primaryRows = await db.select({
      id: patients.id,
      firstName: patients.firstName,
      middleName: patients.middleName,
      lastName: patients.lastName,
      email: patients.email,
      primaryLanguage: patients.primaryLanguage,
    }).from(patients).where(eq(patients.id, appointment.patientId)).limit(1);
    const primary = primaryRows[0];
    // Patient Edit manages language preferences through the converted Lead record.
    // Keep Patient identity/email, while honoring the language the user sees and edits there.
    const convertedLeadRows = await db.select({ primaryLanguage: leads.primaryLanguage })
      .from(leads)
      .where(eq(leads.convertedPatientId, appointment.patientId))
      .limit(1);
    const effectivePrimaryLanguage = resolveRecipientProfileLanguage(
      primary?.primaryLanguage,
      convertedLeadRows[0]?.primaryLanguage,
    );
    if (primary?.email?.trim()) {
      primaryRecipient = {
        source: "primary",
        recipientType: "patient",
        displayName: formatCommunicationName(primary.firstName, primary.middleName, primary.lastName) || "Patient",
        email: primary.email.trim(),
        preferredLanguage: effectivePrimaryLanguage,
      };
    }

    const patientRows = await db.select({ partnerId: patients.partnerId }).from(patients).where(eq(patients.id, appointment.patientId)).limit(1);
    if (patientRows[0]?.partnerId) {
      const partnerRows = await db.select({
        id: patients.id,
        firstName: patients.firstName,
        middleName: patients.middleName,
        lastName: patients.lastName,
        email: patients.email,
        primaryLanguage: patients.primaryLanguage,
      }).from(patients).where(eq(patients.id, patientRows[0].partnerId)).limit(1);
      const partner = partnerRows[0];
      // Resolve the linked partner from that person's own converted Lead, if any.
      // The primary recipient's language must never be reused here.
      const partnerConvertedLeadRows = partner
        ? await db.select({ primaryLanguage: leads.primaryLanguage })
            .from(leads)
            .where(eq(leads.convertedPatientId, partner.id))
            .limit(1)
        : [];
      const effectivePartnerLanguage = resolveRecipientProfileLanguage(
        partner?.primaryLanguage,
        partnerConvertedLeadRows[0]?.primaryLanguage,
      );
      if (partner?.email?.trim()) {
        partnerRecipient = {
          source: "partner",
          recipientType: "partner",
          displayName: formatCommunicationName(partner.firstName, partner.middleName, partner.lastName) || "Partner",
          email: partner.email.trim(),
          preferredLanguage: effectivePartnerLanguage,
        };
      }
    }
  } else if (appointment.leadId) {
    const primaryRows = await db.select({
      id: leads.id,
      firstName: leads.firstName,
      middleName: leads.middleName,
      lastName: leads.lastName,
      email: leads.email,
      primaryLanguage: leads.primaryLanguage,
    }).from(leads).where(eq(leads.id, appointment.leadId)).limit(1);
    const primary = primaryRows[0];
    if (primary?.email?.trim()) {
      primaryRecipient = {
        source: "primary",
        recipientType: "lead",
        displayName: formatCommunicationName(primary.firstName, primary.middleName, primary.lastName) || "Lead",
        email: primary.email.trim(),
        preferredLanguage: primary.primaryLanguage ?? null,
      };
    }

    const leadRows = await db.select({ partnerId: leads.partnerId }).from(leads).where(eq(leads.id, appointment.leadId)).limit(1);
    if (leadRows[0]?.partnerId) {
      const partnerRows = await db.select({
        firstName: leads.firstName,
        middleName: leads.middleName,
        lastName: leads.lastName,
        email: leads.email,
        primaryLanguage: leads.primaryLanguage,
      }).from(leads).where(eq(leads.id, leadRows[0].partnerId)).limit(1);
      const partner = partnerRows[0];
      if (partner?.email?.trim()) {
        partnerRecipient = {
          source: "partner",
          recipientType: "partner",
          displayName: formatCommunicationName(partner.firstName, partner.middleName, partner.lastName) || "Partner",
          email: partner.email.trim(),
          preferredLanguage: partner.primaryLanguage ?? null,
        };
      }
    }
  }

  const clinicRows = await db.select({
    nameEn: clinicInfo.nameEn,
    nameAr: clinicInfo.nameAr,
    nameTr: clinicInfo.nameTr,
    addressEn: clinicInfo.addressEn,
    addressAr: clinicInfo.addressAr,
    addressTr: clinicInfo.addressTr,
    mapsLink: clinicInfo.mapsLink,
  }).from(clinicInfo).limit(1);

  return {
    appointment: {
      id: appointment.id,
      status: appointment.status,
      appointmentDate: appointment.appointmentDate,
      endDate: appointment.endDate,
      duration: appointment.duration,
      type: appointment.type,
      appointmentType: appointment.appointmentType,
      purpose: appointment.purpose,
      meetingLink: appointment.meetingLink,
      partnerClinicId: appointment.partnerClinicId,
      externalLocation: appointment.externalLocation,
    },
    primaryRecipient,
    partnerRecipient,
    partnerClinic: appointment.partnerClinicName ? {
      name: appointment.partnerClinicName,
      address: appointment.partnerClinicAddress,
      googleMapsUrl: appointment.partnerClinicGoogleMapsUrl,
    } : null,
    clinic: clinicRows[0] ?? null,
  };
}

export async function createAppointmentCommunicationDelivery(data: {
  appointmentId: number;
  sendGroupId: string;
  recipientEmail: string;
  recipientType: "patient" | "lead" | "partner" | "additional";
  profileLanguage?: string | null;
  language: string;
  localeFallbackUsed?: boolean;
  templateKey: string;
  templateVersion: string;
  sentByUserId: number;
  deliveryStatus: "sent" | "failed";
  providerMessageId?: string | null;
  failureClassification?: string | null;
  failureCode?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(appointmentCommunicationDeliveries).values({
    ...data,
    communicationType: "manual_appointment_details",
    channel: "email",
  });
}

// ─── Feature 1: Lead-linked appointments helpers ──────────────────────────────
// Re-link all appointments from a lead to the converted patient
export async function relinkLeadAppointmentsToPatient(leadId: number, patientId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(appointments)
    .set({ patientId, leadId } as any)
    .where(eq((appointments as any).leadId, leadId));
}

// ─── Feature 2: Staff Availability helpers ────────────────────────────────────
export async function createStaffAvailability(data: {
  userId: number;
  title: string;
  startDate: Date;
  endDate: Date;
  reason: string;
  notes?: string;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  const result = await db.insert(staffAvailability).values(data as any);
  return Number((result as any)[0]?.insertId ?? (result as any).insertId ?? 0);
}

/** Whole-day V1 Time-Off, persisted at Europe/Istanbul business-day boundaries. */
export async function createWholeDayStaffAvailability(data: {
  userId: number;
  title: string;
  startDateKey: string;
  endDateKey: string;
  reason: string;
  notes?: string;
  createdBy?: number;
}) {
  const startDate = istanbulDateTimeToUtc(data.startDateKey, "00:00:00");
  const endDate = istanbulDateTimeToUtc(data.endDateKey, "23:59:59.999");
  if (endDate < startDate) throw new Error("Time-Off end date must not be before its start date.");
  return createStaffAvailability({
    userId: data.userId,
    title: data.title,
    startDate,
    endDate,
    reason: data.reason,
    notes: data.notes,
    createdBy: data.createdBy,
  });
}

export async function getStaffAvailability(filters?: { userId?: number; from?: Date; to?: Date }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.userId) conditions.push(eq(staffAvailability.userId, filters.userId));
  if (filters?.from) conditions.push(gte(staffAvailability.endDate, filters.from));
  if (filters?.to) conditions.push(lte(staffAvailability.startDate, filters.to));
  const hostUsers = aliasedTable(users, 'availUser');
  const query = db
    .select({
      id: staffAvailability.id,
      userId: staffAvailability.userId,
      title: staffAvailability.title,
      startDate: staffAvailability.startDate,
      endDate: staffAvailability.endDate,
      reason: staffAvailability.reason,
      notes: staffAvailability.notes,
      createdAt: staffAvailability.createdAt,
      userName: hostUsers.name,
      userRole: hostUsers.role,
    })
    .from(staffAvailability)
    .leftJoin(hostUsers, eq(staffAvailability.userId, hostUsers.id))
    .orderBy(staffAvailability.startDate);
  if (conditions.length > 0) return query.where(and(...conditions));
  return query;
}

export async function deleteStaffAvailability(id: number) {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  await db.delete(staffAvailability).where(eq(staffAvailability.id, id));
}

// Returns appointments that overlap with the given date range for a specific user (doctor/host)
export async function getConflictingAppointments(userId: number, startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return [];
  // Find appointments where the doctor or host is this user and the appointment falls within the unavailability window
  const doctorRows = await db
    .select({ doctorId: doctors.id })
    .from(doctors)
    .where(eq(doctors.userId, userId))
    .limit(1);
  const doctorId = doctorRows[0]?.doctorId;

  const conditions = [
    sql`${appointments.appointmentDate} < ${endDate}`,
    sql`COALESCE(${appointments.endDate}, DATE_ADD(${appointments.appointmentDate}, INTERVAL COALESCE(${appointments.duration}, 30) MINUTE)) > ${startDate}`,
    sql`${appointments.status} IN ('upcoming', 'confirmed')`,
  ];

  const orConditions = [eq((appointments as any).hostUserId, userId)];
  if (doctorId) orConditions.push(eq(appointments.doctorId, doctorId));

  const hostUsers = aliasedTable(users, 'hostUser');
  return db
    .select({
      id: appointments.id,
      title: appointments.title,
      appointmentDate: appointments.appointmentDate,
      duration: appointments.duration,
      status: appointments.status,
      patientId: appointments.patientId,
      doctorId: appointments.doctorId,
      hostUserId: (appointments as any).hostUserId,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
      doctorName: users.name,
      hostUserName: hostUsers.name,
    })
    .from(appointments)
    .leftJoin(patients, eq(appointments.patientId, patients.id))
    .leftJoin(doctors, eq(appointments.doctorId, doctors.id))
    .leftJoin(users, eq(doctors.userId, users.id))
    .leftJoin(hostUsers, eq((appointments as any).hostUserId, hostUsers.id))
    .where(and(...conditions, or(...orConditions)))
    .orderBy(appointments.appointmentDate);
}

// Check if a user is unavailable on a given date
export async function isUserUnavailable(userId: number, date: Date): Promise<{ unavailable: boolean; reason?: string; title?: string }> {
  const db = await getDb();
  if (!db) return { unavailable: false };
  const rows = await db
    .select()
    .from(staffAvailability)
    .where(and(
      eq(staffAvailability.userId, userId),
      lte(staffAvailability.startDate, date),
      gte(staffAvailability.endDate, date),
    ))
    .limit(1);
  if (rows.length > 0) {
    return { unavailable: true, reason: rows[0].reason, title: rows[0].title };
  }
  return { unavailable: false };
}

export type AppointmentAvailabilityConflict = {
  id: number;
  userId: number;
  userName: string | null;
  title: string;
  reason: string;
  startDate: Date;
  endDate: Date;
};

/**
 * Resolves only explicit doctor/host ownership. `appointments.staffId` is
 * intentionally excluded because current usage is a coordinator callback field,
 * not a reliable clinical scheduling owner.
 */
export async function getAppointmentAvailabilityConflicts(input: {
  appointmentStart: Date;
  appointmentEnd: Date;
  doctorId?: number | null;
  hostUserId?: number | null;
}): Promise<AppointmentAvailabilityConflict[]> {
  const db = await getDb();
  if (!db) return [];
  const ownerIds = new Set<number>();
  if (input.hostUserId) ownerIds.add(input.hostUserId);
  if (input.doctorId) {
    const rows = await db.select({ userId: doctors.userId }).from(doctors).where(eq(doctors.id, input.doctorId)).limit(1);
    if (rows[0]?.userId) ownerIds.add(rows[0].userId);
  }
  if (ownerIds.size === 0) return [];
  const availabilityUsers = aliasedTable(users, "availabilityOwner");
  return db
    .select({
      id: staffAvailability.id,
      userId: staffAvailability.userId,
      userName: availabilityUsers.name,
      title: staffAvailability.title,
      reason: staffAvailability.reason,
      startDate: staffAvailability.startDate,
      endDate: staffAvailability.endDate,
    })
    .from(staffAvailability)
    .leftJoin(availabilityUsers, eq(staffAvailability.userId, availabilityUsers.id))
    .where(and(
      inArray(staffAvailability.userId, Array.from(ownerIds)),
      sql`${staffAvailability.startDate} < ${input.appointmentEnd}`,
      sql`${staffAvailability.endDate} > ${input.appointmentStart}`,
    ));
}

export async function getEffectiveWorkingHours(userId?: number | null): Promise<{
  clinicDefault: WeeklyWorkingHours;
  staffOverride: WeeklyWorkingHours | null;
  effective: WeeklyWorkingHours;
}> {
  const db = await getDb();
  if (!db) return { clinicDefault: DEFAULT_CLINIC_WEEKLY_WORKING_HOURS, staffOverride: null, effective: DEFAULT_CLINIC_WEEKLY_WORKING_HOURS };
  const clinic = await db.select({ schedule: clinicInfo.defaultWeeklySchedule }).from(clinicInfo).limit(1);
  const parsedClinic = normalizeWeeklyWorkingHours(clinic[0]?.schedule);
  const clinicDefault = Object.keys(parsedClinic).length > 0 ? parsedClinic : DEFAULT_CLINIC_WEEKLY_WORKING_HOURS;
  if (!userId) return { clinicDefault, staffOverride: null, effective: clinicDefault };
  const staff = await db.select({ schedule: users.weeklySchedule }).from(users).where(eq(users.id, userId)).limit(1);
  const parsedStaff = normalizeWeeklyWorkingHours(staff[0]?.schedule);
  const staffOverride = Object.keys(parsedStaff).length > 0 ? parsedStaff : null;
  return { clinicDefault, staffOverride, effective: staffOverride ?? clinicDefault };
}

export async function saveClinicDefaultWorkingHours(schedule: WeeklyWorkingHours, updatedBy: number) {
  const normalized = validateWeeklyWorkingHours(schedule);
  await saveClinicInfo({ defaultWeeklySchedule: normalized as any }, updatedBy);
  return normalized;
}

export async function saveStaffWorkingHoursOverride(userId: number, schedule: WeeklyWorkingHours) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const normalized = validateWeeklyWorkingHours(schedule);
  const staff = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!staff[0] || (staff[0].role !== "staff" && staff[0].role !== "doctor")) {
    throw new Error("Working-hours overrides are available only for staff and doctor users.");
  }
  await db.update(users).set({ weeklySchedule: normalized as any, updatedAt: new Date() }).where(eq(users.id, userId));
  return normalized;
}

// ─── Rescheduling Assistant V1 ───────────────────────────────────────────────
// The assistant is deliberately proposal-first. No candidate mutates an appointment.
export type ReschedulingCandidate = {
  start: Date;
  end: Date;
  label: "suggested" | "alternative";
  relativeToTimeOff: "before" | "after";
  score: number;
  withinDoctorRegularDefault: boolean;
};

export type ReschedulingReviewItem = {
  appointmentId: number;
  appointmentCode: string | null;
  title: string;
  patientName: string | null;
  doctorName: string | null;
  hostUserName: string | null;
  currentStart: Date;
  currentEnd: Date;
  durationMinutes: number;
  status: string;
  updatedAt: Date;
  candidates: ReschedulingCandidate[];
  requiresAction: boolean;
  resolution?: "rescheduled" | "exception";
  resolvedStart?: Date;
  resolvedEnd?: Date;
  resolvedAt?: Date;
  exceptionReason?: string;
  unresolvedReason?: string;
};

function appointmentEnd(appointment: { appointmentDate: Date; endDate?: Date | null; duration?: number | null }) {
  return appointment.endDate ?? new Date(appointment.appointmentDate.getTime() + (appointment.duration ?? 30) * 60_000);
}

async function getAppointmentOwnerUserIds(appointment: { doctorId?: number | null; hostUserId?: number | null }) {
  const ownerIds = new Set<number>();
  if (appointment.hostUserId) ownerIds.add(appointment.hostUserId);
  if (appointment.doctorId) {
    const db = await getDb();
    if (db) {
      const rows = await db.select({ userId: doctors.userId }).from(doctors).where(eq(doctors.id, appointment.doctorId)).limit(1);
      if (rows[0]?.userId) ownerIds.add(rows[0].userId);
    }
  }
  return Array.from(ownerIds);
}

type ReschedulingScheduleContext = {
  clinicHardHours: WeeklyWorkingHours;
  doctorRegularDefault: WeeklyWorkingHours | null;
};

type ReschedulingCandidateQueryContext = {
  ownerIds: number[];
  availabilityBlocks: Array<{ userId?: number; startDate: Date; endDate: Date }>;
  activeAppointments: Array<{
    id: number;
    appointmentDate: Date;
    endDate: Date | null;
    duration: number | null;
    doctorId: number | null;
    patientId: number | null;
    hostUserId: number | null;
  }>;
};

async function getReschedulingScheduleContext(appointment: { doctorId?: number | null; hostUserId?: number | null }): Promise<ReschedulingScheduleContext> {
  const clinicHardHours = (await getEffectiveWorkingHours()).clinicDefault;
  const db = await getDb();
  if (!db) return { clinicHardHours, doctorRegularDefault: null };
  let regularOwnerId = appointment.hostUserId ?? null;
  if (appointment.doctorId) {
    const doctorRows = await db.select({ userId: doctors.userId }).from(doctors).where(eq(doctors.id, appointment.doctorId)).limit(1);
    regularOwnerId = doctorRows[0]?.userId ?? regularOwnerId;
  }
  if (!regularOwnerId) return { clinicHardHours, doctorRegularDefault: null };
  const rows = await db.select({ schedule: users.weeklySchedule }).from(users).where(eq(users.id, regularOwnerId)).limit(1);
  const schedule = normalizeWeeklyWorkingHours(rows[0]?.schedule);
  return { clinicHardHours, doctorRegularDefault: Object.keys(schedule).length > 0 ? schedule : null };
}

async function getReschedulingCandidateQueryContext(input: {
  appointment: NonNullable<Awaited<ReturnType<typeof getAppointmentById>>>;
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<ReschedulingCandidateQueryContext> {
  const db = await getDb();
  const ownerIds = await getAppointmentOwnerUserIds(input.appointment);
  if (!db || ownerIds.length === 0) return { ownerIds, availabilityBlocks: [], activeAppointments: [] };
  const windowStart = new Date(input.rangeStart.getTime() - 24 * 60 * 60_000);
  const windowEnd = new Date(input.rangeEnd.getTime() + 24 * 60 * 60_000);
  const [availabilityBlocks, activeAppointments] = await Promise.all([
    db.select({ userId: staffAvailability.userId, startDate: staffAvailability.startDate, endDate: staffAvailability.endDate })
      .from(staffAvailability)
      .where(and(inArray(staffAvailability.userId, ownerIds), sql`${staffAvailability.startDate} < ${input.rangeEnd}`, sql`${staffAvailability.endDate} > ${input.rangeStart}`)),
    db.select({
      id: appointments.id,
      appointmentDate: appointments.appointmentDate,
      endDate: appointments.endDate,
      duration: appointments.duration,
      doctorId: appointments.doctorId,
      patientId: appointments.patientId,
      hostUserId: appointments.hostUserId,
    }).from(appointments).where(and(
      gte(appointments.appointmentDate, windowStart),
      lte(appointments.appointmentDate, windowEnd),
      sql`${appointments.status} IN ('upcoming','confirmed','completed')`,
    )),
  ]);
  return { ownerIds, availabilityBlocks, activeAppointments };
}

type ReschedulingNearbyReviewWindow = {
  firstDate: string;
  lastDate: string;
  rangeStart: Date;
  rangeEnd: Date;
};

function getReschedulingNearbyReviewWindow(input: {
  timeOff: { startDate: Date; endDate: Date };
  now: Date;
}): ReschedulingNearbyReviewWindow {
  const timeOffStartDate = getIstanbulDateKey(input.timeOff.startDate);
  // Time-Off boundaries are canonical half-open intervals; subtracting 1ms identifies
  // the final covered calendar day without admitting a midnight boundary as blocked.
  const timeOffLastCoveredDate = getIstanbulDateKey(new Date(input.timeOff.endDate.getTime() - 1));
  const todayKey = getIstanbulDateKey(input.now);
  const firstDate = [addIstanbulCalendarDays(timeOffStartDate, -2), todayKey].sort().at(-1)!;
  const lastDate = addIstanbulCalendarDays(timeOffLastCoveredDate, 2);
  return {
    firstDate,
    lastDate,
    rangeStart: istanbulDateTimeToUtc(firstDate, "00:00:00"),
    rangeEnd: istanbulDateTimeToUtc(addIstanbulCalendarDays(lastDate, 1), "00:00:00"),
  };
}

function getClinicWindowCandidateStarts(input: {
  firstDate: string;
  lastDate: string;
  clinicHardHours: WeeklyWorkingHours;
}): Array<{ start: Date; minuteOfDay: number }> {
  const starts: Array<{ start: Date; minuteOfDay: number }> = [];
  for (let dateKey = input.firstDate; dateKey <= input.lastDate; dateKey = addIstanbulCalendarDays(dateKey, 1)) {
    const weekday = getIstanbulWeekday(istanbulDateTimeToUtc(dateKey, "12:00:00"));
    for (const window of input.clinicHardHours[weekday] ?? []) {
      const startMinute = Number(window.start.slice(0, 2)) * 60 + Number(window.start.slice(3));
      const endMinute = Number(window.end.slice(0, 2)) * 60 + Number(window.end.slice(3));
      const firstAlignedMinute = Math.ceil(startMinute / 15) * 15;
      for (let minute = firstAlignedMinute; minute < endMinute; minute += 15) {
        const timeKey = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
        starts.push({ start: istanbulDateTimeToUtc(dateKey, `${timeKey}:00`), minuteOfDay: minute });
      }
    }
  }
  return starts;
}

type ReschedulingNearbyReviewSnapshot = {
  clinicHardHours: WeeklyWorkingHours;
  availabilityBlocks: Array<{ userId: number; startDate: Date; endDate: Date }>;
  activeAppointments: ReschedulingCandidateQueryContext["activeAppointments"];
};

async function getReschedulingNearbyReviewSnapshot(input: {
  ownerIds: number[];
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<ReschedulingNearbyReviewSnapshot> {
  const [effectiveHours, db] = await Promise.all([getEffectiveWorkingHours(), getDb()]);
  if (!db || input.ownerIds.length === 0) {
    return { clinicHardHours: effectiveHours.clinicDefault, availabilityBlocks: [], activeAppointments: [] };
  }
  const windowStart = new Date(input.rangeStart.getTime() - 24 * 60 * 60_000);
  const windowEnd = new Date(input.rangeEnd.getTime() + 24 * 60 * 60_000);
  const [availabilityBlocks, activeAppointments] = await Promise.all([
    db.select({ userId: staffAvailability.userId, startDate: staffAvailability.startDate, endDate: staffAvailability.endDate })
      .from(staffAvailability)
      .where(and(
        inArray(staffAvailability.userId, input.ownerIds),
        sql`${staffAvailability.startDate} < ${input.rangeEnd}`,
        sql`${staffAvailability.endDate} > ${input.rangeStart}`,
      )),
    db.select({
      id: appointments.id,
      appointmentDate: appointments.appointmentDate,
      endDate: appointments.endDate,
      duration: appointments.duration,
      doctorId: appointments.doctorId,
      patientId: appointments.patientId,
      hostUserId: appointments.hostUserId,
    }).from(appointments).where(and(
      gte(appointments.appointmentDate, windowStart),
      lte(appointments.appointmentDate, windowEnd),
      sql`${appointments.status} IN ('upcoming','confirmed','completed')`,
    )),
  ]);
  return { clinicHardHours: effectiveHours.clinicDefault, availabilityBlocks, activeAppointments };
}

async function hasHostAppointmentOverlap(input: {
  hostUserId?: number | null;
  start: Date;
  end: Date;
  excludeId: number;
}) {
  if (!input.hostUserId) return false;
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(
      eq(appointments.hostUserId, input.hostUserId),
      sql`${appointments.status} IN ('upcoming', 'confirmed', 'completed')`,
      sql`${appointments.appointmentDate} < ${input.end}`,
      sql`COALESCE(${appointments.endDate}, DATE_ADD(${appointments.appointmentDate}, INTERVAL COALESCE(${appointments.duration}, 30) MINUTE)) > ${input.start}`,
      ne(appointments.id, input.excludeId),
    ))
    .limit(1);
  return rows.length > 0;
}

async function getOwnerAdjacencyScore(input: {
  hostUserId?: number | null;
  doctorId?: number | null;
  start: Date;
  end: Date;
  excludeId: number;
}) {
  if (!input.hostUserId && !input.doctorId) return 0;
  const db = await getDb();
  if (!db) return 0;
  const ownerConditions = [];
  if (input.hostUserId) ownerConditions.push(eq(appointments.hostUserId, input.hostUserId));
  if (input.doctorId) ownerConditions.push(eq(appointments.doctorId, input.doctorId));
  const rows = await db
    .select({ start: appointments.appointmentDate, end: appointments.endDate, duration: appointments.duration })
    .from(appointments)
    .where(and(
      or(...ownerConditions),
      sql`${appointments.status} IN ('upcoming', 'confirmed')`,
      ne(appointments.id, input.excludeId),
      gte(appointments.appointmentDate, new Date(input.start.getTime() - 24 * 60 * 60_000)),
      lte(appointments.appointmentDate, new Date(input.end.getTime() + 24 * 60 * 60_000)),
    ));
  return rows.some((row) => {
    const rowStart = row.start;
    const rowEnd = row.end ?? new Date(rowStart.getTime() + (row.duration ?? 30) * 60_000);
    return rowEnd.getTime() === input.start.getTime() || rowStart.getTime() === input.end.getTime();
  }) ? -250 : 0;
}

async function isCandidateAvailable(input: {
  appointment: NonNullable<Awaited<ReturnType<typeof getAppointmentById>>>;
  start: Date;
  end: Date;
}) {
  const availabilityConflicts = await getAppointmentAvailabilityConflicts({
    appointmentStart: input.start,
    appointmentEnd: input.end,
    doctorId: input.appointment.doctorId,
    hostUserId: input.appointment.hostUserId,
  });
  if (availabilityConflicts.length > 0) return false;
  const appointmentConflicts = await checkAppointmentConflicts({
    appointmentDate: input.start,
    duration: Math.round((input.end.getTime() - input.start.getTime()) / 60_000),
    doctorId: input.appointment.doctorId,
    patientId: input.appointment.patientId,
    excludeId: input.appointment.id,
  });
  if (appointmentConflicts.length > 0) return false;
  return !(await hasHostAppointmentOverlap({
    hostUserId: input.appointment.hostUserId,
    start: input.start,
    end: input.end,
    excludeId: input.appointment.id,
  }));
}

async function validateReschedulingCandidate(input: {
  timeOff: { id: number; userId: number; startDate: Date; endDate: Date };
  appointment: NonNullable<Awaited<ReturnType<typeof getAppointmentById>>>;
  candidateStart: Date;
  outsideClinicHoursOverride?: boolean;
  now?: Date;
}) {
  const details = await getReschedulingCandidateDetails(input);
  const isOutsideClinicHoursException = details.state === "outside_working_hours" && details.outsideClinicHoursExceptionEligible;
  if (input.outsideClinicHoursOverride ? !isOutsideClinicHoursException : details.state !== "valid") return null;
  const durationMinutes = Math.round((appointmentEnd(input.appointment).getTime() - input.appointment.appointmentDate.getTime()) / 60_000);
  return {
    start: input.candidateStart,
    end: new Date(input.candidateStart.getTime() + durationMinutes * 60_000),
    durationMinutes,
    outsideClinicHoursOverride: isOutsideClinicHoursException,
  };
}

type ReschedulingCandidateState = "valid" | "blocked" | "occupied" | "outside_working_hours" | "past";

async function getReschedulingCandidateDetails(input: {
  timeOff: { id: number; userId: number; startDate: Date; endDate: Date };
  appointment: NonNullable<Awaited<ReturnType<typeof getAppointmentById>>>;
  candidateStart: Date;
  now?: Date;
  scheduleContext?: ReschedulingScheduleContext;
  queryContext?: ReschedulingCandidateQueryContext;
}): Promise<{ state: ReschedulingCandidateState; withinDoctorRegularDefault: boolean; outsideClinicHoursExceptionEligible: boolean }> {
  if (input.candidateStart.getTime() <= (input.now ?? new Date()).getTime()) return { state: "past", withinDoctorRegularDefault: false, outsideClinicHoursExceptionEligible: false };
  if (input.candidateStart.getTime() % 60_000 !== 0 || Math.floor(input.candidateStart.getTime() / 60_000) % 15 !== 0) return { state: "outside_working_hours", withinDoctorRegularDefault: false, outsideClinicHoursExceptionEligible: false };
  const durationMinutes = Math.round((appointmentEnd(input.appointment).getTime() - input.appointment.appointmentDate.getTime()) / 60_000);
  const candidateEnd = new Date(input.candidateStart.getTime() + durationMinutes * 60_000);
  const ownerIds = input.queryContext?.ownerIds ?? await getAppointmentOwnerUserIds(input.appointment);
  if (!ownerIds.includes(input.timeOff.userId) || ownerIds.length === 0) return { state: "outside_working_hours", withinDoctorRegularDefault: false, outsideClinicHoursExceptionEligible: false };
  if (!(candidateEnd <= input.timeOff.startDate || input.candidateStart >= input.timeOff.endDate)) return { state: "blocked", withinDoctorRegularDefault: false, outsideClinicHoursExceptionEligible: false };
  const scheduleContext = input.scheduleContext ?? await getReschedulingScheduleContext(input.appointment);
  const isOutsideClinicWorkingHours = !isIstanbulIntervalWithinWorkingHours(input.candidateStart, candidateEnd, scheduleContext.clinicHardHours);
  const withinDoctorRegularDefault = Boolean(scheduleContext.doctorRegularDefault && isIstanbulIntervalWithinWorkingHours(input.candidateStart, candidateEnd, scheduleContext.doctorRegularDefault));
  if (input.queryContext) {
    if (input.queryContext.availabilityBlocks.some((block) => block.startDate < candidateEnd && block.endDate > input.candidateStart)) return { state: "blocked", withinDoctorRegularDefault, outsideClinicHoursExceptionEligible: false };
    const appointmentOverlap = input.queryContext.activeAppointments.some((row) => {
      if (row.id === input.appointment.id) return false;
      const rowEnd = row.endDate ?? new Date(row.appointmentDate.getTime() + (row.duration ?? 30) * 60_000);
      if (!(input.candidateStart < rowEnd && candidateEnd > row.appointmentDate)) return false;
      return (Boolean(input.appointment.doctorId) && row.doctorId === input.appointment.doctorId)
        || (Boolean(input.appointment.patientId) && row.patientId === input.appointment.patientId)
        || (Boolean(input.appointment.hostUserId) && row.hostUserId === input.appointment.hostUserId);
    });
    if (appointmentOverlap) return { state: "occupied", withinDoctorRegularDefault, outsideClinicHoursExceptionEligible: false };
  } else {
    const availabilityConflicts = await getAppointmentAvailabilityConflicts({
      appointmentStart: input.candidateStart,
      appointmentEnd: candidateEnd,
      doctorId: input.appointment.doctorId,
      hostUserId: input.appointment.hostUserId,
    });
    if (availabilityConflicts.length > 0) return { state: "blocked", withinDoctorRegularDefault, outsideClinicHoursExceptionEligible: false };
    const appointmentConflicts = await checkAppointmentConflicts({
      appointmentDate: input.candidateStart,
      duration: durationMinutes,
      doctorId: input.appointment.doctorId,
      patientId: input.appointment.patientId,
      excludeId: input.appointment.id,
    });
    if (appointmentConflicts.length > 0) return { state: "occupied", withinDoctorRegularDefault, outsideClinicHoursExceptionEligible: false };
    if (await hasHostAppointmentOverlap({ hostUserId: input.appointment.hostUserId, start: input.candidateStart, end: candidateEnd, excludeId: input.appointment.id })) return { state: "occupied", withinDoctorRegularDefault, outsideClinicHoursExceptionEligible: false };
  }
  return { state: isOutsideClinicWorkingHours ? "outside_working_hours" : "valid", withinDoctorRegularDefault, outsideClinicHoursExceptionEligible: isOutsideClinicWorkingHours };
}

async function getReschedulingCandidateState(input: {
  timeOff: { id: number; userId: number; startDate: Date; endDate: Date };
  appointment: NonNullable<Awaited<ReturnType<typeof getAppointmentById>>>;
  candidateStart: Date;
  now?: Date;
  scheduleContext?: ReschedulingScheduleContext;
}): Promise<ReschedulingCandidateState> {
  return (await getReschedulingCandidateDetails(input)).state;
}

export async function getReschedulingAvailabilityForDate(input: {
  timeOffId: number;
  appointmentId: number;
  dateKey: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const now = new Date();
  const todayKey = getIstanbulDateKey(now);
  if (input.dateKey < todayKey) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Availability cannot be viewed for a past Istanbul date." });
  }
  const timeOffRows = await db.select({
    id: staffAvailability.id,
    userId: staffAvailability.userId,
    startDate: staffAvailability.startDate,
    endDate: staffAvailability.endDate,
  }).from(staffAvailability).where(eq(staffAvailability.id, input.timeOffId)).limit(1);
  const timeOff = timeOffRows[0];
  const appointment = await getAppointmentById(input.appointmentId);
  if (!timeOff || !appointment) throw new TRPCError({ code: "NOT_FOUND", message: "The Time-Off record or appointment is no longer available." });
  const scheduleContext = await getReschedulingScheduleContext(appointment);
  const dayStart = istanbulDateTimeToUtc(input.dateKey, "00:00:00");
  const dayEnd = istanbulDateTimeToUtc(addIstanbulCalendarDays(input.dateKey, 1), "00:00:00");
  const queryContext = await getReschedulingCandidateQueryContext({ appointment, rangeStart: dayStart, rangeEnd: dayEnd });
  const durationMinutes = Math.round((appointmentEnd(appointment).getTime() - appointment.appointmentDate.getTime()) / 60_000);
  const slots: Array<{ start: Date; end: Date; state: ReschedulingCandidateState; withinDoctorRegularDefault: boolean; outsideClinicHoursExceptionEligible: boolean }> = [];
  for (let minute = 0; minute < 24 * 60; minute += 15) {
    const timeKey = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const start = istanbulDateTimeToUtc(input.dateKey, `${timeKey}:00`);
    const details = await getReschedulingCandidateDetails({ timeOff, appointment, candidateStart: start, now, scheduleContext, queryContext });
    slots.push({ start, end: new Date(start.getTime() + durationMinutes * 60_000), ...details });
  }
  return {
    dateKey: input.dateKey,
    durationMinutes,
    timeOff: { startDate: timeOff.startDate, endDate: timeOff.endDate },
    slots,
  };
}

export async function getActiveAppointmentAvailabilityOverride(input: {
  appointmentDate: Date;
  endDate?: Date | null;
  duration?: number | null;
  doctorId?: number | null;
  hostUserId?: number | null;
  availabilityOverrideReason?: string | null;
  availabilityOverrideTimeOffId?: number | null;
}) {
  if (!input.availabilityOverrideReason) {
    return { isActive: false, reason: null as string | null, timeOffId: null as number | null };
  }
  const end = appointmentEnd(input);
  const db = await getDb();
  if (!db) return { isActive: false, reason: null as string | null, timeOffId: null as number | null };

  if (input.availabilityOverrideTimeOffId) {
    const sourceRows = await db.select({
      id: staffAvailability.id,
      userId: staffAvailability.userId,
      startDate: staffAvailability.startDate,
      endDate: staffAvailability.endDate,
    }).from(staffAvailability).where(eq(staffAvailability.id, input.availabilityOverrideTimeOffId)).limit(1);
    const source = sourceRows[0];
    const owners = await getAppointmentOwnerUserIds(input);
    const isActive = isSourceTimeOffOverrideActive({
      source,
      ownerIds: owners,
      appointmentStart: input.appointmentDate,
      appointmentEnd: end,
    });
    return {
      isActive,
      reason: isActive ? input.availabilityOverrideReason : null,
      timeOffId: isActive ? source!.id : null,
    };
  }

  // Legacy manual overrides remain active only while an authoritative conflict remains.
  const conflicts = await getAppointmentAvailabilityConflicts({
    appointmentStart: input.appointmentDate,
    appointmentEnd: end,
    doctorId: input.doctorId,
    hostUserId: input.hostUserId,
  });
  return {
    isActive: conflicts.length > 0,
    reason: conflicts.length > 0 ? input.availabilityOverrideReason : null,
    timeOffId: null as number | null,
  };
}

export async function getAppointmentTimeOffReviewState(input: {
  appointmentDate: Date;
  endDate?: Date | null;
  duration?: number | null;
  doctorId?: number | null;
  hostUserId?: number | null;
  status?: string | null;
  availabilityOverrideReason?: string | null;
  availabilityOverrideTimeOffId?: number | null;
}) {
  if (input.status && !["upcoming", "confirmed"].includes(input.status)) {
    return { isNeedsRescheduling: false, timeOffIds: [] as number[] };
  }
  const end = appointmentEnd(input);
  const conflicts = await getAppointmentAvailabilityConflicts({
    appointmentStart: input.appointmentDate,
    appointmentEnd: end,
    doctorId: input.doctorId,
    hostUserId: input.hostUserId,
  });
  if (!conflicts.length) return { isNeedsRescheduling: false, timeOffIds: [] as number[] };
  const activeOverride = await getActiveAppointmentAvailabilityOverride(input);
  const unresolved = conflicts.filter((conflict) => conflict.id !== activeOverride.timeOffId);
  return { isNeedsRescheduling: unresolved.length > 0, timeOffIds: unresolved.map((conflict) => conflict.id) };
}

export async function getReschedulingReviewForTimeOff(timeOffId: number): Promise<{
  timeOff: { id: number; userId: number; startDate: Date; endDate: Date } | null;
  items: ReschedulingReviewItem[];
}> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const timeOffRows = await db.select({
    id: staffAvailability.id,
    userId: staffAvailability.userId,
    startDate: staffAvailability.startDate,
    endDate: staffAvailability.endDate,
  }).from(staffAvailability).where(eq(staffAvailability.id, timeOffId)).limit(1);
  const timeOff = timeOffRows[0] ?? null;
  if (!timeOff) return { timeOff: null, items: [] };

  const affected = await getConflictingAppointments(timeOff.userId, timeOff.startDate, timeOff.endDate);
  const rescheduleEvents = await db
    .select()
    .from(appointmentRescheduleEvents)
    .where(and(
      eq(appointmentRescheduleEvents.timeOffId, timeOff.id),
      inArray(appointmentRescheduleEvents.source, [
        "staff_time_off_rescheduling_assistant",
        "manual_outside_clinic_hours_override",
      ]),
    ))
    .orderBy(desc(appointmentRescheduleEvents.executedAt), desc(appointmentRescheduleEvents.id));
  const reviewNow = new Date();
  const nearbyWindow = getReschedulingNearbyReviewWindow({ timeOff, now: reviewNow });
  const ownerIdsByAppointment = new Map<number, number[]>();
  await Promise.all(affected.map(async (summary) => {
    const appointment = await getAppointmentById(summary.id);
    if (appointment) ownerIdsByAppointment.set(appointment.id, await getAppointmentOwnerUserIds(appointment));
  }));
  const reviewOwnerIds = Array.from(new Set(Array.from(ownerIdsByAppointment.values()).flat()));
  const snapshotStartedAt = Date.now();
  const reviewSnapshot = await getReschedulingNearbyReviewSnapshot({
    ownerIds: reviewOwnerIds,
    rangeStart: nearbyWindow.rangeStart,
    rangeEnd: nearbyWindow.rangeEnd,
  });
  const clinicWindowCandidateStarts = getClinicWindowCandidateStarts({
    firstDate: nearbyWindow.firstDate,
    lastDate: nearbyWindow.lastDate,
    clinicHardHours: reviewSnapshot.clinicHardHours,
  });
  const snapshotElapsedMs = Date.now() - snapshotStartedAt;
  const reviewConstructionStartedAt = Date.now();
  const items: Array<ReschedulingReviewItem | null> = await Promise.all(affected.map(async (summary): Promise<ReschedulingReviewItem | null> => {
    const appointment = await getAppointmentById(summary.id);
    if (!appointment) return null;
    const currentEnd = appointmentEnd(appointment);
    const durationMinutes = Math.round((currentEnd.getTime() - appointment.appointmentDate.getTime()) / 60_000);
    const activeOverride = await getActiveAppointmentAvailabilityOverride(appointment);
    if (activeOverride.isActive && activeOverride.timeOffId === timeOff.id) {
      return {
        appointmentId: appointment.id,
        appointmentCode: appointment.code ?? null,
        title: summary.title,
        patientName: [summary.patientFirstName, summary.patientLastName].filter(Boolean).join(" ") || null,
        doctorName: summary.doctorName ?? null,
        hostUserName: summary.hostUserName ?? null,
        currentStart: appointment.appointmentDate,
        currentEnd,
        durationMinutes,
        status: appointment.status,
        updatedAt: appointment.updatedAt,
        candidates: [],
        requiresAction: false,
        resolution: "exception",
        resolvedAt: appointment.availabilityOverrideAt ?? undefined,
        exceptionReason: activeOverride.reason ?? undefined,
      } satisfies ReschedulingReviewItem;
    }
    const ownerIds = ownerIdsByAppointment.get(appointment.id) ?? await getAppointmentOwnerUserIds(appointment);
    if (ownerIds.length === 0) {
      return {
        appointmentId: appointment.id,
        appointmentCode: appointment.code ?? null,
        title: summary.title,
        patientName: [summary.patientFirstName, summary.patientLastName].filter(Boolean).join(" ") || null,
        doctorName: summary.doctorName ?? null,
        hostUserName: summary.hostUserName ?? null,
        currentStart: appointment.appointmentDate,
        currentEnd,
        durationMinutes,
        status: appointment.status,
        updatedAt: appointment.updatedAt,
        candidates: [],
        requiresAction: true,
        unresolvedReason: "No explicit staff or doctor scheduling owner is assigned; staff review is required.",
      } satisfies ReschedulingReviewItem;
    }

    const baseScheduleContext = await getReschedulingScheduleContext(appointment);
    const scheduleContext = { ...baseScheduleContext, clinicHardHours: reviewSnapshot.clinicHardHours };
    const queryContext: ReschedulingCandidateQueryContext = {
      ownerIds,
      availabilityBlocks: reviewSnapshot.availabilityBlocks.filter((block) => ownerIds.includes(block.userId)),
      activeAppointments: reviewSnapshot.activeAppointments,
    };
    const beforePotential: Array<{ start: Date; end: Date; score: number; relativeToTimeOff: "before"; withinDoctorRegularDefault: boolean }> = [];
    const afterPotential: Array<{ start: Date; end: Date; score: number; relativeToTimeOff: "after"; withinDoctorRegularDefault: boolean }> = [];
    const originalMinutes = Number(getIstanbulTimeKey(appointment.appointmentDate).slice(0, 2)) * 60 + Number(getIstanbulTimeKey(appointment.appointmentDate).slice(3));
    for (const { start, minuteOfDay: minute } of clinicWindowCandidateStarts) {
      const end = new Date(start.getTime() + durationMinutes * 60_000);
      if (start.getTime() <= reviewNow.getTime()) continue;
      if (!isIstanbulIntervalWithinWorkingHours(start, end, scheduleContext.clinicHardHours)) continue;
      const dateDistance = Math.abs((start.getTime() - appointment.appointmentDate.getTime()) / 86_400_000);
      const minuteDistance = Math.abs(minute - originalMinutes);
      const candidate = {
        start,
        end,
        score: dateDistance * 10_000 + minuteDistance,
        withinDoctorRegularDefault: Boolean(scheduleContext.doctorRegularDefault && isIstanbulIntervalWithinWorkingHours(start, end, scheduleContext.doctorRegularDefault)),
      };
      if (end.getTime() <= timeOff.startDate.getTime()) {
        beforePotential.push({ ...candidate, relativeToTimeOff: "before" });
      } else if (start.getTime() >= timeOff.endDate.getTime()) {
        afterPotential.push({ ...candidate, relativeToTimeOff: "after" });
      }
    }
    const sortByScore = <T extends { score: number; start: Date; withinDoctorRegularDefault: boolean }>(candidates: T[]) => candidates.sort((a, b) => Number(b.withinDoctorRegularDefault) - Number(a.withinDoctorRegularDefault) || a.score - b.score || a.start.getTime() - b.start.getTime());
    sortByScore(beforePotential);
    sortByScore(afterPotential);

    const checked = new Set<number>();
    const collectEligible = async <T extends { start: Date; end: Date; score: number; relativeToTimeOff: "before" | "after"; withinDoctorRegularDefault: boolean }>(
      potential: T[],
      limit: number,
      selected: Array<T>,
    ) => {
      for (const candidate of potential) {
        if (selected.length >= limit) break;
        if (checked.has(candidate.start.getTime())) continue;
        checked.add(candidate.start.getTime());
        const details = await getReschedulingCandidateDetails({
          timeOff,
          appointment,
          candidateStart: candidate.start,
          now: reviewNow,
          scheduleContext,
          queryContext,
        });
        if (details.state !== "valid") continue;
        const adjacency = await getOwnerAdjacencyScore({ hostUserId: appointment.hostUserId, doctorId: appointment.doctorId, start: candidate.start, end: candidate.end, excludeId: appointment.id });
        selected.push({ ...candidate, score: candidate.score + adjacency });
      }
    };

    const before: Array<{ start: Date; end: Date; score: number; relativeToTimeOff: "before" | "after"; withinDoctorRegularDefault: boolean }> = [];
    const after: Array<{ start: Date; end: Date; score: number; relativeToTimeOff: "before" | "after"; withinDoctorRegularDefault: boolean }> = [];
    await collectEligible(beforePotential, 2, before);
    await collectEligible(afterPotential, 2, after);

    // Preserve a 2-before / 2-after balance whenever both sides have valid slots.
    // If one side has fewer than two valid slots, fill only the remaining capacity
    // from the other validated side instead of emitting invalid or duplicate slots.
    const candidates = [...before, ...after];
    if (candidates.length < 4) {
      await collectEligible(sortByScore([...beforePotential, ...afterPotential]), 4, candidates);
    }
    sortByScore(candidates);
    return {
      appointmentId: appointment.id,
      appointmentCode: appointment.code ?? null,
      title: summary.title,
      patientName: [summary.patientFirstName, summary.patientLastName].filter(Boolean).join(" ") || null,
      doctorName: summary.doctorName ?? null,
      hostUserName: summary.hostUserName ?? null,
      currentStart: appointment.appointmentDate,
      currentEnd,
      durationMinutes,
      status: appointment.status,
      updatedAt: appointment.updatedAt,
      candidates: candidates.slice(0, 4).map((candidate, index) => ({
        ...candidate,
        label: index === 0 ? "suggested" : "alternative",
      })),
      requiresAction: true,
      unresolvedReason: candidates.length === 0 ? "No eligible slot was found within the approved review range." : undefined,
    } satisfies ReschedulingReviewItem;
  }));
  const activeItems = items.filter((item): item is ReschedulingReviewItem => item !== null);
  const activeIds = new Set(activeItems.map((item) => item.appointmentId));
  const latestEventByAppointment = new Map<number, typeof rescheduleEvents[number]>();
  for (const event of rescheduleEvents) {
    if (!latestEventByAppointment.has(event.appointmentId)) latestEventByAppointment.set(event.appointmentId, event);
  }
  const resolvedItems: ReschedulingReviewItem[] = [];
  for (const event of Array.from(latestEventByAppointment.values())) {
    if (activeIds.has(event.appointmentId)) continue;
    const appointment = await getAppointmentById(event.appointmentId);
    if (!appointment) continue;
    const snapshot = await getAppointmentDeletionAuditSnapshot(appointment.id);
    resolvedItems.push({
      appointmentId: appointment.id,
      appointmentCode: appointment.code ?? event.appointmentCode ?? null,
      title: appointment.title ?? appointment.code ?? `Appointment ${appointment.id}`,
      patientName: snapshot?.personName ?? null,
      doctorName: null,
      hostUserName: null,
      currentStart: event.oldStart,
      currentEnd: event.oldEnd,
      durationMinutes: Math.round((event.oldEnd.getTime() - event.oldStart.getTime()) / 60_000),
      status: appointment.status,
      updatedAt: appointment.updatedAt,
      candidates: [],
      requiresAction: false,
      resolution: "rescheduled",
      resolvedStart: event.newStart,
      resolvedEnd: event.newEnd,
      resolvedAt: event.executedAt,
    });
  }
  const unresolvedItems = activeItems.filter((item) => item.requiresAction);
  const exceptionItems = activeItems.filter((item) => !item.requiresAction);
  console.info("[rescheduling-review-timing]", JSON.stringify({
    timeOffId,
    affectedCount: affected.length,
    unresolvedCount: unresolvedItems.length,
    nearbyCandidateStartCount: clinicWindowCandidateStarts.length,
    snapshotElapsedMs,
    reviewConstructionElapsedMs: Date.now() - reviewConstructionStartedAt,
  }));
  return { timeOff, items: [...unresolvedItems, ...exceptionItems, ...resolvedItems] };
}

export async function getReschedulingReviewSummaries(timeOffIds: number[]) {
  const uniqueIds = Array.from(new Set(timeOffIds.filter((id) => Number.isInteger(id) && id > 0)));
  return Promise.all(uniqueIds.map(async (timeOffId) => {
    const review = await getReschedulingReviewForTimeOff(timeOffId);
    const unresolvedCount = review.items.filter((item) => item.requiresAction).length;
    const reviewedCount = review.items.length - unresolvedCount;
    return {
      timeOffId,
      exists: Boolean(review.timeOff),
      totalCount: review.items.length,
      unresolvedCount,
      reviewedCount,
      isCompleted: review.items.length > 0 && unresolvedCount === 0,
    };
  }));
}

export type ReschedulingApplyStage =
  | "review_recomputation"
  | "candidate_validation"
  | "optimistic_version_check"
  | "appointment_update"
  | "durable_reschedule_event_insert";

export type ReschedulingApplyMarker =
  | "candidate_precondition_validation_started"
  | "availability_validation_passed"
  | "availability_validation_failed"
  | "db_transaction_started"
  | "appointment_mutation_completed"
  | "transaction_committed"
  | "transaction_rolled_back";

export type ReschedulingApplySource = "inline_candidate" | "more_availability";

export class ReschedulingApplyOperationalError extends Error {
  constructor(public readonly stage: ReschedulingApplyStage) {
    super("Rescheduling apply could not complete.");
    this.name = "ReschedulingApplyOperationalError";
  }
}

async function getReschedulingApplyPrecondition(input: { timeOffId: number; appointmentId: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const timeOffRows = await db.select({
    id: staffAvailability.id,
    userId: staffAvailability.userId,
    startDate: staffAvailability.startDate,
    endDate: staffAvailability.endDate,
  }).from(staffAvailability).where(eq(staffAvailability.id, input.timeOffId)).limit(1);
  const timeOff = timeOffRows[0];
  const appointment = await getAppointmentById(input.appointmentId);
  if (!timeOff || !appointment || !["upcoming", "confirmed"].includes(appointment.status)) return null;

  const appointmentEndDate = appointmentEnd(appointment);
  const ownerIds = await getAppointmentOwnerUserIds(appointment);
  const sourceStillApplies = ownerIds.includes(timeOff.userId)
    && appointment.appointmentDate < timeOff.endDate
    && appointmentEndDate > timeOff.startDate;
  if (!sourceStillApplies) return null;

  const activeOverride = await getActiveAppointmentAvailabilityOverride(appointment);
  if (activeOverride.isActive && activeOverride.timeOffId === timeOff.id) return null;
  return { timeOff, appointment };
}

export async function applyReschedulingCandidate(input: {
  timeOffId: number;
  appointmentId: number;
  candidateStart: Date;
  expectedUpdatedAt: Date;
  actorId: number;
  outsideClinicHoursOverride?: boolean;
  exceptionReason?: string;
  onStage?: (marker: ReschedulingApplyMarker, elapsedMs: number) => Promise<void> | void;
}) {
  const startedAt = Date.now();
  let stage: ReschedulingApplyStage = "review_recomputation";
  let transactionStarted = false;
  let transactionCommitted = false;
  const mark = async (marker: ReschedulingApplyMarker) => {
    try { await input.onStage?.(marker, Date.now() - startedAt); } catch { /* Observability cannot change scheduling behavior. */ }
  };
  try {
    await mark("candidate_precondition_validation_started");
    const precondition = await getReschedulingApplyPrecondition({
      timeOffId: input.timeOffId,
      appointmentId: input.appointmentId,
    });
    stage = "candidate_validation";
    const selected = precondition
      ? await validateReschedulingCandidate({
        timeOff: precondition.timeOff,
        appointment: precondition.appointment,
        candidateStart: input.candidateStart,
        outsideClinicHoursOverride: input.outsideClinicHoursOverride,
      })
      : null;
    if (!selected) {
      await mark("availability_validation_failed");
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This appointment is no longer eligible for the selected rescheduling candidate. Refresh the review." });
    }
    await mark("availability_validation_passed");
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const event = await db.transaction(async (tx) => {
      transactionStarted = true;
      await mark("db_transaction_started");
      stage = "optimistic_version_check";
      const rows = await tx.select().from(appointments).where(eq(appointments.id, input.appointmentId)).limit(1);
      const appointment = rows[0];
      if (!appointment || appointment.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The appointment changed while you were reviewing candidates. Refresh and try again." });
      }
      const oldEnd = appointmentEnd(appointment);
      stage = "appointment_update";
      const updateResult = await tx.update(appointments).set({
        appointmentDate: selected.start,
        endDate: selected.end,
        appointmentScheduleRevision: Number(appointment.appointmentScheduleRevision ?? 1) + 1,
        availabilityOverrideReason: null,
        availabilityOverrideById: null,
        availabilityOverrideAt: null,
        availabilityOverrideTimeOffId: null,
        updatedAt: new Date(),
      }).where(and(eq(appointments.id, appointment.id), eq(appointments.updatedAt, appointment.updatedAt)));
      const affectedRows = Number((updateResult as any)[0]?.affectedRows ?? (updateResult as any).affectedRows ?? 0);
      if (affectedRows !== 1) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The appointment changed while the selected candidate was being applied. Refresh the review." });
      }
      await mark("appointment_mutation_completed");
      stage = "durable_reschedule_event_insert";
      const inserted = await tx.insert(appointmentRescheduleEvents).values({
        appointmentId: appointment.id,
        appointmentCode: appointment.code,
        patientId: appointment.patientId,
        leadId: appointment.leadId,
        timeOffId: input.timeOffId,
        oldStart: appointment.appointmentDate,
        oldEnd,
        newStart: selected.start,
        newEnd: selected.end,
        actorId: input.actorId,
        source: selected.outsideClinicHoursOverride ? "manual_outside_clinic_hours_override" : "staff_time_off_rescheduling_assistant",
        exceptionReason: selected.outsideClinicHoursOverride ? input.exceptionReason?.trim() || null : null,
      } as any);
      return { appointment, oldEnd, eventId: Number((inserted as any)[0]?.insertId ?? (inserted as any).insertId ?? 0) };
    });
    transactionCommitted = true;
    await mark("transaction_committed");
    return { ...event, newStart: selected.start, newEnd: selected.end };
  } catch (error) {
    if (transactionStarted && !transactionCommitted) await mark("transaction_rolled_back");
    if (error instanceof TRPCError) throw error;
    throw new ReschedulingApplyOperationalError(stage);
  }
}

export async function keepAppointmentAsTimeOffException(input: {
  timeOffId: number;
  appointmentId: number;
  expectedUpdatedAt: Date;
  actorId: number;
  reason: string;
}) {
  const review = await getReschedulingReviewForTimeOff(input.timeOffId);
  const item = review.items.find((candidate) => candidate.appointmentId === input.appointmentId);
  if (!review.timeOff || !item || !item.requiresAction) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This appointment no longer requires a Time-Off exception. Refresh the review." });
  }
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const now = new Date();
  const result = await db.update(appointments).set({
    availabilityOverrideReason: input.reason,
    availabilityOverrideById: input.actorId,
    availabilityOverrideAt: now,
    availabilityOverrideTimeOffId: input.timeOffId,
    updatedAt: now,
  }).where(and(
    eq(appointments.id, input.appointmentId),
    eq(appointments.updatedAt, input.expectedUpdatedAt),
  ));
  const affectedRows = Number((result as any)[0]?.affectedRows ?? (result as any).affectedRows ?? 0);
  if (affectedRows !== 1) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The appointment changed while you were reviewing the Time-Off. Refresh and try again." });
  }
  return { approvedAt: now };
}

// ─── Patient Communications ───────────────────────────────────────────────────

export async function getPatientCommunications(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: patientCommunications.id,
      patientId: patientCommunications.patientId,
      note: patientCommunications.note,
      createdBy: patientCommunications.createdBy,
      createdAt: patientCommunications.createdAt,
      authorName: users.name,
    })
    .from(patientCommunications)
    .leftJoin(users, eq(patientCommunications.createdBy, users.id))
    .where(and(eq(patientCommunications.patientId, patientId), isNull(patientCommunications.deletedAt)))
    .orderBy(desc(patientCommunications.createdAt), desc(patientCommunications.id));
}

export async function createPatientCommunication(data: { patientId: number; note: string; createdBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(patientCommunications).values(data);
  return { id: (result as any).insertId };
}

export async function updatePatientCommunication(
  id: number,
  patientId: number,
  note: string,
  updatedBy: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db
    .select({ id: patientCommunications.id, deletedAt: patientCommunications.deletedAt })
    .from(patientCommunications)
    .where(and(eq(patientCommunications.id, id), eq(patientCommunications.patientId, patientId)))
    .limit(1);
  if (!row) throw new Error("Note not found or does not belong to this Patient");
  if (row.deletedAt) throw new Error("Cannot edit a deleted note");
  await db
    .update(patientCommunications)
    .set({ note, updatedAt: new Date(), updatedBy })
    .where(eq(patientCommunications.id, id));
}

export async function softDeletePatientCommunication(
  id: number,
  patientId: number,
  deletedBy: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db
    .select({ id: patientCommunications.id, deletedAt: patientCommunications.deletedAt })
    .from(patientCommunications)
    .where(and(eq(patientCommunications.id, id), eq(patientCommunications.patientId, patientId)))
    .limit(1);
  if (!row) throw new Error("Note not found or does not belong to this Patient");
  if (row.deletedAt) throw new Error("Note is already deleted");
  await db
    .update(patientCommunications)
    .set({ deletedAt: new Date(), deletedBy })
    .where(eq(patientCommunications.id, id));
}

// ─── Treatment Cycles ─────────────────────────────────────────────────────────

export async function getTreatmentCycles(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: treatmentCycles.id,
      patientId: treatmentCycles.patientId,
      ivfNo: treatmentCycles.ivfNo,
      cycleType: treatmentCycles.cycleType,
      protocol: treatmentCycles.protocol,
      status: treatmentCycles.status,
      doctorId: treatmentCycles.doctorId,
      startDate: treatmentCycles.startDate,
      endDate: treatmentCycles.endDate,
      d3Fsh: treatmentCycles.d3Fsh,
      d3Lh: treatmentCycles.d3Lh,
      d3E2: treatmentCycles.d3E2,
      d3Amh: treatmentCycles.d3Amh,
      d3Prl: treatmentCycles.d3Prl,
      d3Tsh: treatmentCycles.d3Tsh,
      d3Bmi: treatmentCycles.d3Bmi,
      infertilityDuration: treatmentCycles.infertilityDuration,
      infertilityReasonFemale: treatmentCycles.infertilityReasonFemale,
      infertilityReasonMale: treatmentCycles.infertilityReasonMale,
      frozenTissue: treatmentCycles.frozenTissue,
      spermCount: treatmentCycles.spermCount,
      spermMotility: treatmentCycles.spermMotility,
      spermMorphology: treatmentCycles.spermMorphology,
      spermTmss: treatmentCycles.spermTmss,
      karyotype: treatmentCycles.karyotype,
      serology: treatmentCycles.serology,
      previousTreatment: treatmentCycles.previousTreatment,
      surgery: treatmentCycles.surgery,
      adjuvantMedications: treatmentCycles.adjuvantMedications,
      notes: treatmentCycles.notes,
      createdAt: treatmentCycles.createdAt,
      doctorName: users.name,
    })
    .from(treatmentCycles)
    .leftJoin(doctors, eq(treatmentCycles.doctorId, doctors.id))
    .leftJoin(users, eq(doctors.userId, users.id))
    .where(eq(treatmentCycles.patientId, patientId))
    .orderBy(treatmentCycles.startDate);
}

export async function getTreatmentCycleById(cycleId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: treatmentCycles.id,
      patientId: treatmentCycles.patientId,
      ivfNo: treatmentCycles.ivfNo,
      cycleType: treatmentCycles.cycleType,
      protocol: treatmentCycles.protocol,
      status: treatmentCycles.status,
      doctorId: treatmentCycles.doctorId,
      startDate: treatmentCycles.startDate,
      endDate: treatmentCycles.endDate,
      d3Fsh: treatmentCycles.d3Fsh,
      d3Lh: treatmentCycles.d3Lh,
      d3E2: treatmentCycles.d3E2,
      d3Amh: treatmentCycles.d3Amh,
      d3Prl: treatmentCycles.d3Prl,
      d3Tsh: treatmentCycles.d3Tsh,
      d3Bmi: treatmentCycles.d3Bmi,
      infertilityDuration: treatmentCycles.infertilityDuration,
      infertilityReasonFemale: treatmentCycles.infertilityReasonFemale,
      infertilityReasonMale: treatmentCycles.infertilityReasonMale,
      frozenTissue: treatmentCycles.frozenTissue,
      spermCount: treatmentCycles.spermCount,
      spermMotility: treatmentCycles.spermMotility,
      spermMorphology: treatmentCycles.spermMorphology,
      spermTmss: treatmentCycles.spermTmss,
      karyotype: treatmentCycles.karyotype,
      serology: treatmentCycles.serology,
      previousTreatment: treatmentCycles.previousTreatment,
      surgery: treatmentCycles.surgery,
      adjuvantMedications: treatmentCycles.adjuvantMedications,
      notes: treatmentCycles.notes,
      createdAt: treatmentCycles.createdAt,
      doctorName: users.name,
    })
    .from(treatmentCycles)
    .leftJoin(doctors, eq(treatmentCycles.doctorId, doctors.id))
    .leftJoin(users, eq(doctors.userId, users.id))
    .where(eq(treatmentCycles.id, cycleId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createTreatmentCycle(data: InsertTreatmentCycle) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(treatmentCycles).values(data);
  return { id: (result as any).insertId };
}

export async function updateTreatmentCycle(cycleId: number, data: Partial<InsertTreatmentCycle>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(treatmentCycles).set(data).where(eq(treatmentCycles.id, cycleId));
  return { success: true };
}

export async function deleteTreatmentCycle(cycleId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Delete related records first
  await db.delete(cycleMonitoringVisits).where(eq(cycleMonitoringVisits.cycleId, cycleId));
  await db.delete(cycleMedications).where(eq(cycleMedications.cycleId, cycleId));
  await db.delete(medicationAdherenceLog).where(eq(medicationAdherenceLog.cycleId, cycleId));
  await db.delete(cycleOutcomes).where(eq(cycleOutcomes.cycleId, cycleId));
  await db.delete(treatmentCycles).where(eq(treatmentCycles.id, cycleId));
  return { success: true };
}

// ─── Cycle Monitoring Visits ──────────────────────────────────────────────────

export async function getCycleMonitoringVisits(cycleId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(cycleMonitoringVisits)
    .where(eq(cycleMonitoringVisits.cycleId, cycleId))
    .orderBy(cycleMonitoringVisits.visitDate);
}

export async function createCycleMonitoringVisit(data: InsertCycleMonitoringVisit) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(cycleMonitoringVisits).values(data);
  return { id: (result as any).insertId };
}

export async function updateCycleMonitoringVisit(visitId: number, data: Partial<InsertCycleMonitoringVisit>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(cycleMonitoringVisits).set(data).where(eq(cycleMonitoringVisits.id, visitId));
  return { success: true };
}

export async function deleteCycleMonitoringVisit(visitId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(cycleMonitoringVisits).where(eq(cycleMonitoringVisits.id, visitId));
  return { success: true };
}

// ─── Cycle Medications ────────────────────────────────────────────────────────

export async function getCycleMedications(cycleId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(cycleMedications)
    .where(eq(cycleMedications.cycleId, cycleId))
    .orderBy(cycleMedications.startDate);
}

export async function createCycleMedication(data: InsertCycleMedication) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(cycleMedications).values(data);
  return { id: (result as any).insertId };
}

export async function updateCycleMedication(medId: number, data: Partial<InsertCycleMedication>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(cycleMedications).set(data).where(eq(cycleMedications.id, medId));
  return { success: true };
}

export async function deleteCycleMedication(medId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(medicationAdherenceLog).where(eq(medicationAdherenceLog.medicationId, medId));
  await db.delete(cycleMedications).where(eq(cycleMedications.id, medId));
  return { success: true };
}

// ─── Medication Adherence ─────────────────────────────────────────────────────

export async function getMedicationAdherence(cycleId: number, patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(medicationAdherenceLog)
    .where(and(
      eq(medicationAdherenceLog.cycleId, cycleId),
      eq(medicationAdherenceLog.patientId, patientId),
    ))
    .orderBy(medicationAdherenceLog.scheduledDate);
}

export async function confirmMedicationAdherence(data: InsertMedicationAdherenceLog) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Check if already confirmed for this date+medication
  const existing = await db
    .select()
    .from(medicationAdherenceLog)
    .where(and(
      eq(medicationAdherenceLog.medicationId, data.medicationId),
      eq(medicationAdherenceLog.patientId, data.patientId),
      eq(medicationAdherenceLog.scheduledDate, data.scheduledDate),
    ))
    .limit(1);
  if (existing.length > 0) return { id: existing[0].id, alreadyConfirmed: true };
  const [result] = await db.insert(medicationAdherenceLog).values(data);
  return { id: (result as any).insertId, alreadyConfirmed: false };
}

// ─── Cycle Outcomes ───────────────────────────────────────────────────────────

export async function getCycleOutcome(cycleId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(cycleOutcomes)
    .where(eq(cycleOutcomes.cycleId, cycleId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertCycleOutcome(data: InsertCycleOutcome) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await getCycleOutcome(data.cycleId);
  if (existing) {
    await db.update(cycleOutcomes).set(data).where(eq(cycleOutcomes.cycleId, data.cycleId));
    return { id: existing.id };
  }
  const [result] = await db.insert(cycleOutcomes).values(data);
  return { id: (result as any).insertId };
}

// ─── Clinic Tags ──────────────────────────────────────────────────────────────

export async function getAllClinicTags() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clinicTags).orderBy(clinicTags.name);
}

export async function createClinicTag(data: { name: string; color?: string; createdByUserId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(clinicTags).values({
    name: data.name.trim(),
    color: data.color ?? "#6366f1",
    createdByUserId: data.createdByUserId ?? null,
  });
  return { id: (result as any).insertId };
}

export async function updateClinicTag(id: number, data: { name?: string; color?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name.trim();
  if (data.color !== undefined) update.color = data.color;
  if (Object.keys(update).length > 0) {
    await db.update(clinicTags).set(update).where(eq(clinicTags.id, id));
  }
  return { success: true };
}

export async function deleteClinicTag(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(clinicTags).where(eq(clinicTags.id, id));
  return { success: true };
}

// ─── Specializations ──────────────────────────────────────────────────────────

export async function getAllSpecializations() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(specializations).orderBy(specializations.name);
}

export async function createSpecialization(name: string) {
  return withDbError(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const [result] = await db.insert(specializations).values({ name: name.trim() });
    return { id: (result as any).insertId };
  });
}

export async function updateSpecialization(id: number, name: string) {
  return withDbError(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    await db.update(specializations).set({ name: name.trim() }).where(eq(specializations.id, id));
    return { success: true };
  });
}

export async function deleteSpecialization(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(specializations).where(eq(specializations.id, id));
  return { success: true };
}

// ─── Sub-Specializations ────────────────────────────────────────────────────
export async function getAllSubSpecializations(specializationId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (specializationId) {
    return db.select().from(subSpecializations).where(eq(subSpecializations.specializationId, specializationId)).orderBy(subSpecializations.name);
  }
  return db.select().from(subSpecializations).orderBy(subSpecializations.specializationId, subSpecializations.name);
}

export async function createSubSpecialization(name: string, specializationId: number) {
  return withDbError(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const [result] = await db.insert(subSpecializations).values({ name: name.trim(), specializationId });
    return { id: (result as any).insertId };
  });
}

export async function updateSubSpecialization(id: number, name: string) {
  return withDbError(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    await db.update(subSpecializations).set({ name: name.trim() }).where(eq(subSpecializations.id, id));
    return { success: true };
  });
}

export async function deleteSubSpecialization(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(subSpecializations).where(eq(subSpecializations.id, id));
  return { success: true };
}

// ─── Document Translations ────────────────────────────────────────────────────
export async function createDocumentTranslation(data: {
  patientId: number;
  labResultId?: number;
  leadDocumentId?: number;
  originalFileUrl?: string;
  originalFileName?: string;
  originalLanguage?: string;
  targetLanguage?: string;
  translatedById?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(documentTranslations).values({
    patientId: data.patientId,
    labResultId: data.labResultId ?? null,
    leadDocumentId: data.leadDocumentId ?? null,
    originalFileUrl: data.originalFileUrl ?? null,
    originalFileName: data.originalFileName ?? null,
    originalLanguage: data.originalLanguage ?? null,
    targetLanguage: data.targetLanguage ?? "en",
    status: "pending",
    translatedById: data.translatedById ?? null,
  });
  return { id: (result as any).insertId };
}
export async function getDocumentTranslationsByLeadDocument(leadDocumentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documentTranslations)
    .where(eq(documentTranslations.leadDocumentId, leadDocumentId))
    .orderBy(desc(documentTranslations.createdAt));
}

export async function updateDocumentTranslation(id: number, data: {
  status?: "pending" | "processing" | "completed" | "failed";
  translatedText?: string;
  extractedText?: string;
  originalLanguage?: string;
  errorMessage?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(documentTranslations).set(data).where(eq(documentTranslations.id, id));
  return { success: true };
}

export async function getDocumentTranslationsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documentTranslations)
    .where(eq(documentTranslations.patientId, patientId))
    .orderBy(desc(documentTranslations.createdAt));
}

export async function deleteDocumentTranslation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(documentTranslations).where(eq(documentTranslations.id, id));
  return { success: true };
}

// ─── Doctor Profile Auto-Link ─────────────────────────────────────────────────

/**
 * Ensures a doctor profile exists for a given userId.
 * If one already exists, does nothing. Otherwise creates a minimal profile.
 */
export async function ensureDoctorProfile(
  userId: number,
  name: string,
  phone?: string | null,
  firstName?: string | null,
  secondName?: string | null,
  thirdName?: string | null,
) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select({ id: doctors.id }).from(doctors).where(eq(doctors.userId, userId)).limit(1);
  if (existing.length > 0) return; // already has a profile
  // Create doctor profile
  await db.insert(doctors).values({
    userId,
    specialty: null,
    licenseNumber: null,
    bio: null,
    title: null,
    firstName: firstName ?? null,
    secondName: secondName ?? null,
    thirdName: thirdName ?? null,
    specializationId: null,
    avatarUrl: null,
    stampUrl: null,
  });
}

// ─── Admin: Update Any User's Profile ────────────────────────────────────────

export async function updateUserProfileByAdmin(userId: number, data: {
  firstName?: string;
  secondName?: string;
  thirdName?: string;
  email?: string;
  phone?: string;
  role?: "patient" | "staff" | "doctor" | "manager" | "admin";
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (data.email !== undefined) await syncAuthEmail(db, userId, data.email);
  const displayName = [data.firstName, data.secondName, data.thirdName].filter(Boolean).join(" ") || undefined;
  await db.update(users).set({
    ...(data.firstName !== undefined && { firstName: data.firstName }),
    ...(data.secondName !== undefined && { secondName: data.secondName }),
    ...(data.thirdName !== undefined && { thirdName: data.thirdName }),
    ...(displayName && { name: displayName }),
    ...(data.email !== undefined && { email: data.email.trim().toLowerCase() }),
    ...(data.phone !== undefined && { phone: data.phone }),
    ...(data.role !== undefined && { role: data.role }),
    updatedAt: new Date(),
  }).where(eq(users.id, userId));
  // If role changed to doctor, ensure doctor profile exists
  if (data.role === "doctor") {
    const userRow = await db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1);
    if (userRow[0]) await ensureDoctorProfile(userId, displayName ?? userRow[0].name ?? "Doctor", userRow[0].phone);
  }
  // Sync name/phone/email changes to linked patient record (if any)
  const patientRow = await db.select({ id: patients.id }).from(patients).where(eq(patients.userId, userId)).limit(1);
  if (patientRow.length > 0) {
    const patientUpdate: Record<string, any> = {};
    if (data.firstName !== undefined) patientUpdate.firstName = data.firstName;
    if (data.secondName !== undefined) patientUpdate.middleName = data.secondName; // users.secondName → patients.middleName
    if (data.thirdName !== undefined) patientUpdate.lastName = data.thirdName;   // users.thirdName → patients.lastName
    if (data.email !== undefined) patientUpdate.email = data.email.trim().toLowerCase();
    if (data.phone !== undefined) patientUpdate.phone = data.phone;
    if (Object.keys(patientUpdate).length > 0) {
      await db.update(patients).set(patientUpdate).where(eq(patients.id, patientRow[0].id));
    }
  }
  return { success: true };
}

// ─── Auto-create Patient Profile for user with role=patient ──────────────────

export async function ensurePatientProfile(
  userId: number,
  firstName: string,
  lastName: string,
  phone?: string | null,
  email?: string | null,
) {
  const db = await getDb();
  if (!db) return;
  // Check if a patient record already linked to this userId exists
  const existing = await db.select({ id: patients.id }).from(patients).where(eq(patients.userId, userId)).limit(1);
  if (existing.length > 0) return; // already has a patient profile
  // Generate MRN
  const mrn = await consumeNextMRN();
  // Create patient record linked to this user
  await db.insert(patients).values({
    userId,
    mrn,
    firstName: firstName || "Unknown",
    lastName: lastName || "Patient",
    phone: phone ?? null,
    email: email ?? null,
    status: "active_patient",
    interestLevel: "warm",
  } as any);
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export type PaymentQuoteInput = {
  invoiceId: number;
  amount: number | string;
  currency?: string | null;
  method?: string | null;
  receivedAt?: Date | string | null;
  manualFx?: ManualPaymentFxInput | null;
  bankDeduction?: BankDeductionInput | null;
};

/**
 * Payment-specific optional override. Each rate preserves the established
 * convention: 1 currency unit = X TRY. It never alters global FX settings.
 */
export type ManualPaymentFxInput = {
  paymentToTryRate?: string | number | null;
  invoiceToTryRate?: string | number | null;
  note?: string | null;
};

export type BankDeductionInput = {
  amount?: string | number | null;
  percent?: string | number | null;
};

type ResolvedBankDeduction = {
  grossAmount: Decimal | null;
  deductionAmount: Decimal | null;
  deductionPercent: Decimal | null;
  netAmount: Decimal;
};

export function resolveBankDeduction(input: { amount: string | number; method?: string | null; bankDeduction?: BankDeductionInput | null }): ResolvedBankDeduction {
  const gross = new Decimal(String(input.amount));
  if (!gross.isFinite() || gross.lte(0)) throw new TRPCError({ code: "BAD_REQUEST", message: "Payment amount must be greater than zero." });
  if (input.method !== "bank_transfer") return { grossAmount: null, deductionAmount: null, deductionPercent: null, netAmount: gross };
  const suppliedAmount = input.bankDeduction?.amount == null || input.bankDeduction.amount === "" ? null : new Decimal(String(input.bankDeduction.amount));
  const suppliedPercent = input.bankDeduction?.percent == null || input.bankDeduction.percent === "" ? null : new Decimal(String(input.bankDeduction.percent));
  if (suppliedAmount && suppliedPercent) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter Bank Deduction as either an amount or a percentage, not both." });
  if (suppliedAmount && (suppliedAmount.lt(0) || suppliedAmount.gte(gross))) throw new TRPCError({ code: "BAD_REQUEST", message: "Bank Deduction must be zero or greater and lower than the amount sent." });
  if (suppliedPercent && (suppliedPercent.lt(0) || suppliedPercent.gte(100))) throw new TRPCError({ code: "BAD_REQUEST", message: "Bank Deduction percentage must be from 0% up to, but not including, 100%." });
  const deductionAmount = (suppliedAmount ?? gross.mul(suppliedPercent ?? 0).div(100)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const netAmount = gross.minus(deductionAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (netAmount.lte(0)) throw new TRPCError({ code: "BAD_REQUEST", message: "Bank Transfer net received amount must be greater than zero." });
  return { grossAmount: gross.toDecimalPlaces(2, Decimal.ROUND_HALF_UP), deductionAmount, deductionPercent: suppliedPercent, netAmount };
}

export type PaymentQuote = {
  enteredAmount: string;
  grossAmountSent: string | null;
  bankDeductionAmount: string | null;
  bankDeductionPercent: string | null;
  paymentCurrency: string;
  invoiceCurrency: string;
  receivedAt: Date;
  fxEffectiveAt: Date;
  exchangeRateAtPayment: string;
  conversionRateToInvoice: string;
  amountInInvoiceCurrency: string;
  adjustmentRateSnapshot: string | null;
  settledAmount: string;
  currentRemaining: string;
  expectedRemaining: string;
  fullySettling: boolean;
  exceedsRequired: boolean;
  pricingMode: string;
  fxRateSource: "system" | "manual" | null;
  fxRateNote: string | null;
  paymentToTryRate: string;
  invoiceToTryRate: string;
};

type NativeOverpaymentQuoteInput = {
  enteredAmount: string | number;
  currentRemaining: string | number;
  conversionRateToInvoice: string | number;
  method: string | null | undefined;
  pricingMode: string | null | undefined;
  adjustmentRateSnapshot: string | null | undefined;
  settlementModelVersion: string | null | undefined;
};

/**
 * Calculates the native amount that would be retained as Patient Credit after
 * applying only the invoice-required settlement. Used by quote and save paths
 * so preview disclosure cannot invent a different credit amount.
 */
export function computeNativeOverpaymentCredit(input: NativeOverpaymentQuoteInput): Decimal {
  const entered = new Decimal(String(input.enteredAmount));
  const remaining = Decimal.max(new Decimal(String(input.currentRemaining)), 0);
  const conversionRate = new Decimal(String(input.conversionRateToInvoice));
  const isMethodNeutral = input.settlementModelVersion === "method_neutral_v2";
  const methodMultiplier = !isMethodNeutral && input.pricingMode !== "agreed" && (input.method === "credit_card" || input.method === "bank_transfer")
    ? new Decimal(1).plus(new Decimal(input.adjustmentRateSnapshot ?? "0").div(100))
    : new Decimal(1);
  const requiredReceipt = remaining.eq(0)
    ? new Decimal(0)
    : remaining.div(conversionRate).mul(methodMultiplier);
  return Decimal.max(new Decimal(0), entered.minus(requiredReceipt)).toDecimalPlaces(2);
}

function paymentReceivedAt(value?: Date | string | null): Date {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now() + 60_000) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Payment Date must be a valid time that is not in the future." });
  }
  return parsed;
}

type PaymentQuoteInvoiceFacts = {
  currency: string | null;
  pricingMode: string | null;
  paymentAdjustmentRateSnapshot: string | null;
  settlementModelVersion?: string | null;
  totalAmount: string | number | null;
  paidAmount: string | number | null;
};

async function quotePaymentForInvoiceFacts(
  input: Omit<PaymentQuoteInput, "invoiceId">,
  invoice: PaymentQuoteInvoiceFacts,
): Promise<PaymentQuote> {
  const receivedAt = paymentReceivedAt(input.receivedAt);
  const bankDeduction = resolveBankDeduction(input);
  const paymentCurrency = input.currency ?? "TRY";
  const invoiceCurrency = invoice.currency ?? "TRY";
  const rateResolution = await resolvePaymentFxRates({
    paymentCurrency,
    invoiceCurrency,
    receivedAt,
    manualFx: input.manualFx,
  });
  const fx = computePaymentFxSnapshots({
    amount: bankDeduction.netAmount.toFixed(2),
    paymentCurrency,
    invoiceCurrency,
    paymentToTryRate: rateResolution.paymentToTryRate,
    invoiceToTryRate: rateResolution.invoiceToTryRate,
  });
  const pricingMode = (invoice.pricingMode as string) ?? "discount_legacy";
  const adjustmentRateSnapshot = invoice.paymentAdjustmentRateSnapshot != null
    ? String(invoice.paymentAdjustmentRateSnapshot)
    : null;
  const { computePaymentSettlement } = await import("../shared/invoicePricing");
  const settlement = computePaymentSettlement({
    amount: bankDeduction.netAmount.toFixed(2),
    method: input.method ?? "cash",
    pricingMode: pricingMode as any,
    adjustmentRateSnapshot,
    amountInInvoiceCurrency: fx.amountInInvoiceCurrency,
    settlementModelVersion: invoice.settlementModelVersion ?? null,
  });
  const remainingDecimal = new Decimal(String(invoice.totalAmount ?? "0")).minus(String(invoice.paidAmount ?? "0"));
  const currentRemaining = remainingDecimal.gt(0) ? remainingDecimal : new Decimal(0);
  const settledDecimal = new Decimal(settlement.settledAmount);
  const exceedsRequired = settledDecimal.gt(currentRemaining.plus("0.005"));
  const expectedRemaining = currentRemaining.minus(settledDecimal);
  return {
    enteredAmount: bankDeduction.netAmount.toFixed(2),
    grossAmountSent: bankDeduction.grossAmount?.toFixed(2) ?? null,
    bankDeductionAmount: bankDeduction.deductionAmount?.toFixed(2) ?? null,
    bankDeductionPercent: bankDeduction.deductionPercent?.toFixed(4) ?? null,
    paymentCurrency,
    invoiceCurrency,
    receivedAt,
    fxEffectiveAt: rateResolution.fxEffectiveAt,
    exchangeRateAtPayment: fx.exchangeRateAtPayment,
    conversionRateToInvoice: fx.conversionRateToInvoice,
    amountInInvoiceCurrency: fx.amountInInvoiceCurrency,
    adjustmentRateSnapshot: pricingMode === "agreed" ? null : adjustmentRateSnapshot,
    settledAmount: settlement.settledAmount,
    currentRemaining: currentRemaining.toFixed(2),
    expectedRemaining: (expectedRemaining.gt(0) ? expectedRemaining : new Decimal(0)).toFixed(2),
    fullySettling: !exceedsRequired && settledDecimal.gte(currentRemaining.minus("0.005")),
    exceedsRequired,
    pricingMode,
    fxRateSource: rateResolution.fxRateSource,
    fxRateNote: rateResolution.fxRateNote,
    paymentToTryRate: new Decimal(rateResolution.paymentToTryRate).toFixed(4),
    invoiceToTryRate: new Decimal(rateResolution.invoiceToTryRate).toFixed(4),
  };
}

export async function quotePayment(input: PaymentQuoteInput): Promise<PaymentQuote> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [invoice] = await db.select({
    currency: invoices.currency,
    pricingMode: invoices.pricingMode,
    paymentAdjustmentRateSnapshot: invoices.paymentAdjustmentRateSnapshot,
    settlementModelVersion: invoices.settlementModelVersion,
    totalAmount: invoices.totalAmount,
    paidAmount: invoices.paidAmount,
  }).from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
  if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
  const { invoiceId: _invoiceId, ...quoteInput } = input;
  return quotePaymentForInvoiceFacts(quoteInput, invoice);
}

export async function quoteInitialPayment(input: Omit<PaymentQuoteInput, "invoiceId"> & {
  invoiceCurrency: string;
  totalAmount: string | number;
  pricingMode: "discount" | "agreed";
  paymentAdjustmentRateSnapshot?: string | number | null;
  settlementModelVersion?: string | null;
}): Promise<PaymentQuote> {
  const {
    invoiceCurrency,
    totalAmount,
    pricingMode,
    paymentAdjustmentRateSnapshot = null,
    settlementModelVersion = "method_neutral_v2",
    ...quoteInput
  } = input;
  return quotePaymentForInvoiceFacts(quoteInput, {
    currency: invoiceCurrency,
    pricingMode,
    paymentAdjustmentRateSnapshot: paymentAdjustmentRateSnapshot == null ? null : String(paymentAdjustmentRateSnapshot),
    settlementModelVersion,
    totalAmount,
    paidAmount: "0",
  });
}

export async function quoteInitialPayments(input: {
  invoiceCurrency: string;
  totalAmount: string | number;
  pricingMode: "discount" | "agreed";
  paymentAdjustmentRateSnapshot?: string | number | null;
  settlementModelVersion?: string | null;
  payments: Array<Omit<PaymentQuoteInput, "invoiceId">>;
}): Promise<{
  payments: PaymentQuote[];
  totalReceivedInInvoiceCurrency: string;
  totalSettled: string;
  remaining: string;
  expectedNativePatientCredits: Array<{
    paymentIndex: number;
    currency: string;
    amount: string;
    amountInInvoiceCurrency: string;
    appliedToInvoice: string;
  }>;
}> {
  let paidAmount = new Decimal(0);
  let receivedInInvoiceCurrency = new Decimal(0);
  const totalAmount = new Decimal(String(input.totalAmount));
  const previews: PaymentQuote[] = [];
  const expectedNativePatientCredits: Array<{ paymentIndex: number; currency: string; amount: string; amountInInvoiceCurrency: string; appliedToInvoice: string }> = [];
  for (let paymentIndex = 0; paymentIndex < input.payments.length; paymentIndex += 1) {
    const payment = input.payments[paymentIndex];
    const quote = await quoteInitialPayment({
      ...payment,
      invoiceCurrency: input.invoiceCurrency,
      totalAmount: input.totalAmount,
      pricingMode: input.pricingMode,
      paymentAdjustmentRateSnapshot: input.paymentAdjustmentRateSnapshot,
      settlementModelVersion: input.settlementModelVersion ?? "method_neutral_v2",
    });
    const remaining = Decimal.max(totalAmount.minus(paidAmount), 0);
    const allocation = Decimal.min(new Decimal(quote.settledAmount), remaining);
    const nativeCreditAmount = computeNativeOverpaymentCredit({
      enteredAmount: quote.enteredAmount,
      currentRemaining: remaining.toString(),
      conversionRateToInvoice: quote.conversionRateToInvoice,
      method: payment.method,
      pricingMode: quote.pricingMode,
      adjustmentRateSnapshot: quote.adjustmentRateSnapshot,
      settlementModelVersion: input.settlementModelVersion ?? "method_neutral_v2",
    });
    const expectedRemaining = Decimal.max(remaining.minus(allocation), 0);
    previews.push({
      ...quote,
      settledAmount: allocation.toFixed(2),
      currentRemaining: remaining.toFixed(2),
      expectedRemaining: expectedRemaining.toFixed(2),
      fullySettling: allocation.gte(remaining.minus("0.005")),
      exceedsRequired: new Decimal(quote.settledAmount).gt(remaining.plus("0.005")),
    });
    receivedInInvoiceCurrency = receivedInInvoiceCurrency.plus(quote.amountInInvoiceCurrency);
    if (nativeCreditAmount.gt(0)) {
      expectedNativePatientCredits.push({
        paymentIndex,
        currency: quote.paymentCurrency,
        amount: nativeCreditAmount.toFixed(2),
        amountInInvoiceCurrency: quote.amountInInvoiceCurrency,
        appliedToInvoice: allocation.toFixed(2),
      });
    }
    paidAmount = paidAmount.plus(allocation);
  }
  return {
    payments: previews,
    totalReceivedInInvoiceCurrency: receivedInInvoiceCurrency.toFixed(2),
    totalSettled: paidAmount.toFixed(2),
    remaining: Decimal.max(totalAmount.minus(paidAmount), 0).toFixed(2),
    expectedNativePatientCredits,
  };
}

type SettlementPaymentInput = {
  invoiceId: number;
  patientId: number;
  amount: string;
  currency: "USD" | "EUR" | "GBP" | "TRY" | "SAR" | "AED" | "AUD";
  method: "cash" | "credit_card" | "bank_transfer" | "insurance" | "other";
  receivedAt?: Date | string | null;
  notes?: string;
  manualFx?: ManualPaymentFxInput | null;
  bankDeduction?: BankDeductionInput | null;
  recordedById: number;
};

/**
 * Records one physical receipt, allocates only the invoice-required settlement,
 * and creates native-currency Patient Credit for the genuine surplus. It must be
 * called inside the transaction that owns the invoice lock.
 */
async function recordPaymentWithSettlement(tx: any, input: SettlementPaymentInput) {
  const receivedAt = paymentReceivedAt(input.receivedAt);
  const bankDeduction = resolveBankDeduction(input);
  const entered = bankDeduction.netAmount;

  await tx.execute(sql`SELECT id FROM invoices WHERE id = ${input.invoiceId} FOR UPDATE`);
  const [invoice] = await tx.select({
    patientId: invoices.patientId,
    currency: invoices.currency,
    totalAmount: invoices.totalAmount,
    paidAmount: invoices.paidAmount,
    pricingMode: invoices.pricingMode,
    paymentAdjustmentRateSnapshot: invoices.paymentAdjustmentRateSnapshot,
    settlementModelVersion: invoices.settlementModelVersion,
    financialScope: invoices.financialScope,
  }).from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
  if (!invoice || invoice.patientId == null) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
  if (input.patientId && input.patientId !== invoice.patientId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Payment patient does not match the invoice owner." });
  }

  const invoiceCurrency = String(invoice.currency ?? "TRY");
  const rateResolution = await resolvePaymentFxRates({
    paymentCurrency: input.currency,
    invoiceCurrency,
    receivedAt,
    manualFx: input.manualFx,
  });
  const fx = computePaymentFxSnapshots({
    amount: entered.toFixed(2),
    paymentCurrency: input.currency,
    invoiceCurrency,
    paymentToTryRate: rateResolution.paymentToTryRate,
    invoiceToTryRate: rateResolution.invoiceToTryRate,
  });
  const pricingMode = String(invoice.pricingMode ?? "discount_legacy");
  const adjustmentRateSnapshot = invoice.paymentAdjustmentRateSnapshot != null
    ? String(invoice.paymentAdjustmentRateSnapshot)
    : null;
  const { computePaymentSettlement } = await import("../shared/invoicePricing");
  const { isMethodNeutralSettlementModel } = await import("../shared/serviceTax");
  const settlementQuote = computePaymentSettlement({
    amount: entered.toFixed(2),
    method: input.method,
    pricingMode: pricingMode as any,
    adjustmentRateSnapshot,
    amountInInvoiceCurrency: fx.amountInInvoiceCurrency,
    settlementModelVersion: invoice.settlementModelVersion ?? null,
  });

  const currentRemaining = new Decimal(String(invoice.totalAmount ?? "0"))
    .minus(String(invoice.paidAmount ?? "0"));
  const remaining = currentRemaining.gt(0) ? currentRemaining : new Decimal(0);
  const quotedSettlement = new Decimal(settlementQuote.settledAmount);
  const allocation = Decimal.min(quotedSettlement, remaining);
  const creditAmount = computeNativeOverpaymentCredit({
    enteredAmount: entered.toString(),
    currentRemaining: remaining.toString(),
    conversionRateToInvoice: fx.conversionRateToInvoice,
    method: input.method,
    pricingMode,
    adjustmentRateSnapshot,
    settlementModelVersion: invoice.settlementModelVersion,
  });

  const [paymentResult] = await tx.insert(payments).values({
    patientId: invoice.patientId,
    invoiceId: input.invoiceId,
    financialScope: invoice.financialScope ?? "production",
    amount: entered.toFixed(2) as any,
    currency: input.currency as any,
    method: input.method as any,
    exchangeRateAtPayment: fx.exchangeRateAtPayment as any,
    conversionRateToInvoice: fx.conversionRateToInvoice as any,
    amountInInvoiceCurrency: fx.amountInInvoiceCurrency as any,
    bankGrossAmountSent: bankDeduction.grossAmount?.toFixed(2) as any ?? null,
    bankDeductionAmount: bankDeduction.deductionAmount?.toFixed(2) as any ?? null,
    bankDeductionPercent: bankDeduction.deductionPercent?.toFixed(4) as any ?? null,
    settledAmount: allocation.toFixed(2) as any,
    recordedById: input.recordedById,
    receivedAt,
    fxEffectiveAt: rateResolution.fxEffectiveAt,
    fxRateSource: rateResolution.fxRateSource as any,
    fxRateNote: rateResolution.fxRateNote,
    notes: input.notes,
  } as any);
  const paymentId = (paymentResult as any).insertId as number;

  let settlementId: number | undefined;
  if (allocation.gt(0)) {
    const [settlementResult] = await tx.insert(invoiceSettlements).values({
      patientId: invoice.patientId,
      invoiceId: input.invoiceId,
      financialScope: invoice.financialScope ?? "production",
      currency: invoiceCurrency as any,
      amount: allocation.toFixed(2) as any,
      sourceType: "payment",
      paymentId,
      recordedById: input.recordedById,
    } as any);
    settlementId = (settlementResult as any).insertId as number;
  }

  let creditTransactionId: number | undefined;
  if (creditAmount.gt(0)) {
    const [creditResult] = await tx.insert(creditTransactions).values({
      patientId: invoice.patientId,
      financialScope: invoice.financialScope ?? "production",
      currency: input.currency as any,
      amount: creditAmount.toFixed(2) as any,
      type: "overpayment",
      invoiceId: input.invoiceId,
      originInvoiceId: input.invoiceId,
      originPaymentId: paymentId,
      settlementId: settlementId ?? null,
      originPaymentMethod: input.method as any,
      recordedById: input.recordedById,
      notes: `Native-currency overpayment credit from payment ${paymentId}.`,
    } as any);
    creditTransactionId = (creditResult as any).insertId as number;
  }

  await recalcInvoicePaidAmountWithDb(tx, input.invoiceId);
  return { paymentId, creditTransactionId, creditAmount: creditAmount.gt(0) ? creditAmount.toFixed(2) : undefined };
}

export async function createPayment(data: InsertPayment & { receivedAt?: Date | string | null; manualFx?: ManualPaymentFxInput | null }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  let result: { paymentId: number; creditTransactionId?: number; creditAmount?: string } = { paymentId: 0 };
  await db.transaction(async (tx) => {
    result = await recordPaymentWithSettlement(tx, {
      invoiceId: data.invoiceId,
      patientId: data.patientId ?? 0,
      amount: String(data.amount ?? "0"),
      currency: (data.currency as any) ?? "TRY",
      method: (data.method as any) ?? "cash",
      receivedAt: data.receivedAt,
      notes: data.notes ?? undefined,
      manualFx: data.manualFx,
      recordedById: data.recordedById,
    });
  });
  return { id: result.paymentId, creditTransactionId: result.creditTransactionId, creditAmount: result.creditAmount };
}

/**
 * Controlled one-way historical correction for a confirmed fixed-agreement
 * legacy invoice. This is deliberately separate from ordinary invoice editing.
 */
export async function correctLegacyInvoicePricingToAgreed(input: {
  invoiceId: number;
  reason: string;
  actor: { id?: number | null; name?: string | null; role?: string | null };
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A correction reason between 3 and 500 characters is required." });
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM invoices WHERE id = ${input.invoiceId} FOR UPDATE`);
    const [invoice] = await tx.select({
      invoiceNumber: invoices.invoiceNumber,
      pricingMode: invoices.pricingMode,
      totalAmount: invoices.totalAmount,
      finalAgreedAmount: invoices.finalAgreedAmount,
      paymentAdjustmentRateSnapshot: invoices.paymentAdjustmentRateSnapshot,
      paidAmount: invoices.paidAmount,
    }).from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
    if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
    if (invoice.pricingMode !== "discount_legacy") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only legacy invoices can receive a historical pricing-semantics correction." });
    }
    const agreedAmount = new Decimal(String(invoice.totalAmount ?? "0"));
    if (!agreedAmount.isFinite() || agreedAmount.lte(0) || new Decimal(String(invoice.paidAmount ?? "0")).gt(agreedAmount.plus("0.005"))) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This invoice is not eligible for a historical pricing-semantics correction." });
    }
    await tx.update(invoices).set({
      pricingMode: "agreed" as any,
      finalAgreedAmount: agreedAmount.toFixed(2) as any,
      paymentAdjustmentRateSnapshot: null,
    }).where(eq(invoices.id, input.invoiceId));
    await tx.insert(auditLogs).values({
      userId: input.actor.id ?? null,
      userName: input.actor.name ?? null,
      userRole: input.actor.role ?? null,
      action: "correct_legacy_invoice_pricing_to_agreed",
      category: "other",
      recordId: input.invoiceId,
      recordType: "invoice",
      page: "finance",
      description: `Historical pricing-semantics correction for ${invoice.invoiceNumber}: pricingMode discount_legacy → agreed; finalAgreedAmount ${invoice.finalAgreedAmount ?? "NULL"} → ${agreedAmount.toFixed(2)}; paymentAdjustmentRateSnapshot ${invoice.paymentAdjustmentRateSnapshot ?? "NULL"} → NULL; paidAmount preserved at ${invoice.paidAmount ?? "0"}; reason: ${reason}`,
    });
    await recalcInvoicePaidAmountWithDb(tx, input.invoiceId);
  });
  return { success: true };
}

/** Controlled, auditable reclassification of existing financial history. */
export async function classifyInvoiceFinancialScope(input: {
  invoiceId: number;
  scope: FinancialScope;
  reason: string;
  actor: { id: number; name?: string | null; role?: string | null };
  setPatientDefault: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A classification reason between 3 and 500 characters is required." });
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM invoices WHERE id = ${input.invoiceId} FOR UPDATE`);
    const [invoice] = await tx.select({
      invoiceNumber: invoices.invoiceNumber,
      patientId: invoices.patientId,
      financialScope: invoices.financialScope,
    }).from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
    if (!invoice || invoice.patientId == null) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
    if (invoice.financialScope === input.scope) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This invoice is already in the requested financial scope." });
    }
    const [paymentCount] = await tx.select({ count: count() }).from(payments).where(eq(payments.invoiceId, input.invoiceId));
    const [refundCount] = await tx.select({ count: count() }).from(refunds).where(eq(refunds.invoiceId, input.invoiceId));
    const [creditCount] = await tx.select({ count: count() }).from(creditTransactions).where(eq(creditTransactions.invoiceId, input.invoiceId));
    await tx.update(invoices).set({ financialScope: input.scope }).where(eq(invoices.id, input.invoiceId));
    await tx.update(payments).set({ financialScope: input.scope }).where(eq(payments.invoiceId, input.invoiceId));
    await tx.update(refunds).set({ financialScope: input.scope }).where(eq(refunds.invoiceId, input.invoiceId));
    await tx.update(creditTransactions).set({ financialScope: input.scope }).where(eq(creditTransactions.invoiceId, input.invoiceId));
    if (input.setPatientDefault) {
      await tx.update(patients).set({ defaultFinancialScope: input.scope }).where(eq(patients.id, invoice.patientId));
    }
    await tx.insert(auditLogs).values({
      userId: input.actor.id,
      userName: input.actor.name ?? null,
      userRole: input.actor.role ?? null,
      action: "classify_financial_scope",
      category: "other",
      recordId: input.invoiceId,
      recordType: "financial_scope",
      page: "finance",
      description: JSON.stringify({
        event: "financial_scope_classification",
        invoiceId: input.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        patientId: invoice.patientId,
        fromScope: invoice.financialScope,
        toScope: input.scope,
        paymentCount: Number(paymentCount?.count ?? 0),
        refundCount: Number(refundCount?.count ?? 0),
        creditCount: Number(creditCount?.count ?? 0),
        setPatientDefault: input.setPatientDefault,
        reason,
      }),
    });
  });
  return { success: true };
}

export async function listPaymentsByInvoice(invoiceId: number, includeVoided = false) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const recordedByUser = aliasedTable(users, "invoicePaymentRecordedByUser");
  const voidedByUser = aliasedTable(users, "invoicePaymentVoidedByUser");
  return db
    .select({
      ...getTableColumns(payments),
      recordedByName: recordedByUser.name,
      voidedByName: voidedByUser.name,
    })
    .from(payments)
    .leftJoin(recordedByUser, eq(payments.recordedById, recordedByUser.id))
    .leftJoin(voidedByUser, eq(payments.voidedById, voidedByUser.id))
    .where(
      includeVoided
        ? eq(payments.invoiceId, invoiceId)
        : and(eq(payments.invoiceId, invoiceId), eq(payments.status, "active"))
    )
    .orderBy(asc(payments.createdAt));
}

export async function listPaymentsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  const recordedByUser = aliasedTable(users, "paymentRecordedByUser");
  const voidedByUser = aliasedTable(users, "paymentVoidedByUser");
  return db
    .select({
      id: payments.id,
      invoiceId: payments.invoiceId,
      amount: payments.amount,
      currency: payments.currency,
      method: payments.method,
      receivedAt: payments.receivedAt,
      createdAt: payments.createdAt,
      fxEffectiveAt: payments.fxEffectiveAt,
      fxRateSource: payments.fxRateSource,
      fxRateNote: payments.fxRateNote,
      notes: payments.notes,
      status: payments.status,
      voidedAt: payments.voidedAt,
      voidReason: payments.voidReason,
      recordedById: payments.recordedById,
      voidedById: payments.voidedById,
      recordedByName: recordedByUser.name,
      voidedByName: voidedByUser.name,
    })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .leftJoin(recordedByUser, eq(payments.recordedById, recordedByUser.id))
    .leftJoin(voidedByUser, eq(payments.voidedById, voidedByUser.id))
    .where(eq(invoices.patientId, patientId))
    .orderBy(desc(payments.createdAt));
}

export async function voidPayment(id: number, voidReason: string, voidedById: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const reason = voidReason.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Provide a void reason between 3 and 500 characters." });
  }

  await db.transaction(async (tx) => {
    const [payment] = await tx
      .select({ id: payments.id, invoiceId: payments.invoiceId, status: payments.status })
      .from(payments)
      .where(eq(payments.id, id))
      .limit(1);
    if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found." });
    if (payment.status === "voided") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This payment has already been voided." });
    }

    // Until payment-linked refund/credit accounting is introduced, do not allow a
    // payment-only recalculation to overwrite independently recorded finance events.
    const [refundCount] = await tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(refunds)
      .where(eq(refunds.invoiceId, payment.invoiceId));
    const [creditCount] = await tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(creditTransactions)
      .where(eq(creditTransactions.invoiceId, payment.invoiceId));
    if (Number(refundCount?.count ?? 0) > 0 || Number(creditCount?.count ?? 0) > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "This payment cannot be voided while the invoice has related refund or credit activity. Resolve it through the appropriate finance workflow.",
      });
    }

    const updateResult = await tx
      .update(payments)
      .set({ status: "voided", voidedAt: new Date(), voidedById, voidReason: reason } as any)
      .where(and(eq(payments.id, id), eq(payments.status, "active")));
    const affectedRows = Number((updateResult as any)[0]?.affectedRows ?? (updateResult as any).affectedRows ?? 0);
    if (affectedRows !== 1) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This payment has already been voided." });
    }
    await tx.update(invoiceSettlements)
      .set({ status: "voided", voidedAt: new Date(), voidedById, voidReason: reason } as any)
      .where(and(eq(invoiceSettlements.paymentId, id), eq(invoiceSettlements.status, "active")));
    await recalcInvoicePaidAmountWithDb(tx, payment.invoiceId);
  });

  return { success: true };
}

type InvoiceFinancialSummary = {
  invoiceId: number;
  currency: string;
  invoiceTotal: Decimal;
  grossReceived: Decimal;
  grossExternalSettled: Decimal;
  nonCashSettled: Decimal;
  grossSettled: Decimal;
  refunded: Decimal;
  netSettled: Decimal;
  balanceDue: Decimal;
  isFullySettled: boolean;
  maxRefundable: Decimal;
};

function refundInvoiceCurrencyAmount(row: any, invoiceCurrency: string): Decimal {
  if (row.amountInInvoiceCurrency != null) return new Decimal(String(row.amountInInvoiceCurrency));
  if (String(row.currency) === invoiceCurrency) return new Decimal(String(row.amount));
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "A historical foreign-currency refund lacks its immutable invoice-currency conversion. Financial review is required before recalculation.",
  });
}

async function getInvoiceFinancialSummaryWithDb(db: any, invoiceId: number): Promise<InvoiceFinancialSummary | null> {
  // Historical payments keep their persisted settledAmount. Newer receipts have an
  // authoritative invoice_settlement row. A mixed invoice must add both sources
  // without counting a payment twice when its settlement row exists.
  const [inv] = await db
    .select({ totalAmount: invoices.totalAmount, currency: invoices.currency, financialScope: invoices.financialScope, pricingMode: invoices.pricingMode, paymentAdjustmentRateSnapshot: invoices.paymentAdjustmentRateSnapshot })
    .from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) return null;
  // Derive invoice patientId for cross-check
  const [invPatient] = await db.select({ patientId: invoices.patientId }).from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  const invoicePatientId = invPatient?.patientId ?? null;

  const settlementRows = await db
    .select({ amount: invoiceSettlements.amount, patientId: invoiceSettlements.patientId, paymentId: invoiceSettlements.paymentId, financialScope: invoiceSettlements.financialScope, sourceType: invoiceSettlements.sourceType })
    .from(invoiceSettlements)
    .where(and(eq(invoiceSettlements.invoiceId, invoiceId), eq(invoiceSettlements.status, "active")));
  const legitimateSettlements = settlementRows.filter((row: any) =>
    (invoicePatientId == null || String(row.patientId) === String(invoicePatientId))
    && String(row.financialScope ?? inv.financialScope) === String(inv.financialScope),
  );
  const representedPaymentIds = new Set(
    legitimateSettlements
      .map((row: any) => row.paymentId == null ? null : Number(row.paymentId))
      .filter((paymentId: number | null): paymentId is number => paymentId != null),
  );
  const paymentRows = await db
    .select({ id: payments.id, amountInInvoiceCurrency: payments.amountInInvoiceCurrency, settledAmount: (payments as any).settledAmount, patientId: payments.patientId, financialScope: payments.financialScope })
    .from(payments)
    .where(and(eq(payments.invoiceId, invoiceId), eq(payments.status, "active")));
  const validPaymentRows = paymentRows.filter((row: any) =>
    (invoicePatientId == null || row.patientId == null || String(row.patientId) === String(invoicePatientId))
    && String(row.financialScope ?? inv.financialScope) === String(inv.financialScope),
  );
  const unmatchedLegacyRows = validPaymentRows.filter((row: any) =>
    !representedPaymentIds.has(Number(row.id))
  );
  const paymentSettlementTotal = legitimateSettlements
    .filter((row: any) => row.sourceType === "payment")
    .reduce((sum: Decimal, row: any) => sum.plus(String(row.amount ?? 0)), new Decimal(0));
  const nonCashSettled = legitimateSettlements
    .filter((row: any) => row.sourceType !== "payment")
    .reduce((sum: Decimal, row: any) => sum.plus(String(row.amount ?? 0)), new Decimal(0));
  const unmatchedLegacySettled = unmatchedLegacyRows
    .reduce((sum: Decimal, row: any) => sum.plus(String(row.settledAmount ?? 0)), new Decimal(0));
  const grossExternalSettled = quantizeFinanceMoney(paymentSettlementTotal.plus(unmatchedLegacySettled));
  const grossReceived = quantizeFinanceMoney(validPaymentRows.reduce(
    (sum: Decimal, row: any) => sum.plus(String(row.amountInInvoiceCurrency ?? row.settledAmount ?? 0)),
    new Decimal(0),
  ));
  const refundRows = await db
    .select({ amount: refunds.amount, currency: refunds.currency, amountInInvoiceCurrency: (refunds as any).amountInInvoiceCurrency, financialScope: refunds.financialScope })
    .from(refunds)
    .where(eq(refunds.invoiceId, invoiceId));
  const refundAmounts = refundRows
    .filter((row: any) => String(row.financialScope ?? inv.financialScope) === String(inv.financialScope))
    .map((row: any) => refundInvoiceCurrencyAmount(row, String(inv.currency ?? "TRY")));
  const refundAwareTotals = computeRefundAwareSettlementTotals({
    externalSettlementAmounts: [grossExternalSettled],
    nonCashSettlementAmounts: [nonCashSettled],
    refundAmountsInInvoiceCurrency: refundAmounts,
  });
  const invoiceTotal = quantizeFinanceMoney(String(inv.totalAmount ?? 0));
  const balanceDue = quantizeFinanceMoney(Decimal.max(0, invoiceTotal.minus(refundAwareTotals.netSettled)));
  return {
    invoiceId,
    currency: String(inv.currency ?? "TRY"),
    invoiceTotal,
    grossReceived,
    grossExternalSettled: refundAwareTotals.grossExternalSettled,
    nonCashSettled: refundAwareTotals.nonCashSettled,
    grossSettled: refundAwareTotals.grossSettled,
    refunded: refundAwareTotals.refunded,
    netSettled: refundAwareTotals.netSettled,
    balanceDue,
    isFullySettled: balanceDue.lte("0.005"),
    maxRefundable: refundAwareTotals.maxRefundable,
  };
}

export async function getInvoiceFinancialSummary(invoiceId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const summary = await getInvoiceFinancialSummaryWithDb(db, invoiceId);
  if (!summary) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
  return {
    invoiceId: summary.invoiceId,
    currency: summary.currency,
    invoiceTotal: summary.invoiceTotal.toFixed(2),
    grossReceived: summary.grossReceived.toFixed(2),
    grossExternalSettled: summary.grossExternalSettled.toFixed(2),
    nonCashSettled: summary.nonCashSettled.toFixed(2),
    grossSettled: summary.grossSettled.toFixed(2),
    refunded: summary.refunded.toFixed(2),
    netSettled: summary.netSettled.toFixed(2),
    balanceDue: summary.balanceDue.toFixed(2),
    isFullySettled: summary.isFullySettled,
    maxRefundable: summary.maxRefundable.toFixed(2),
  };
}

async function recalcInvoicePaidAmountWithDb(db: any, invoiceId: number) {
  const [inv] = await db
    .select({ totalAmount: invoices.totalAmount })
    .from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) return;
  const summary = await getInvoiceFinancialSummaryWithDb(db, invoiceId);
  if (!summary) return;
  const total = summary.netSettled;

  const totalAmount = new Decimal(String(inv.totalAmount ?? 0));
  let status: "draft" | "issued" | "paid" | "partial" | "overdue" | "cancelled" = "issued";
  if (total.lte(0)) status = "issued";
  else if (total.gte(totalAmount.minus("0.01"))) status = "paid";
  else status = "partial";

  await db.update(invoices)
    // Store the settled service amount (sum of settledAmount per payment).
    // For cash and Mode B: settledAmount = actual received. For Mode A non-cash: settledAmount < actual received.
    .set({ paidAmount: total.toFixed(2) as any, status })
    .where(eq(invoices.id, invoiceId));
}

async function recalcInvoicePaidAmount(invoiceId: number) {
  const db = await getDb();
  if (!db) return;
  await recalcInvoicePaidAmountWithDb(db, invoiceId);
}

// ─── Invoice Full Edit ────────────────────────────────────────────────────────

export type InvoiceFullUpdateInput = {
    currency?: "USD" | "EUR" | "GBP" | "TRY" | "SAR" | "AED";
    discountAmount?: number;
    discountPercent?: number;
    taxAmount?: number;
    notes?: string;
    dueDate?: Date | null;
    // V3 pricing fields (server-computed, passed from router)
    subtotal?: string;
    totalAmount?: string;
    pricingMode?: string;
    finalAgreedAmount?: string;
    paymentAdjustmentRateSnapshot?: string;
    items: Array<{
      id?: number; // existing item to update
      serviceId?: number | null;
      lineLabel?: string | null;
      description: string;
      quantity: number;
      unitPrice: number | string;
      totalPrice?: number | string;
    linePricingMethod?: InvoiceLinePricingMethod;
    lineDiscountPercent?: number | string | null;
    taxRuleId?: number | null;
    taxLabelSnapshot?: string | null;
      taxRateSnapshot?: string | null;
      effectiveTaxableBase?: string | null;
      taxAmount?: string | null;
      priceEntryCurrency?: "USD" | "EUR" | "GBP" | "TRY" | "SAR" | "AED" | null;
      priceEntryAmount?: string | null;
      priceEntryKind?: "unit_price" | "final_line_total" | "tax_included_final_line_total" | "agreed_unit_price" | "tax_included_agreed_unit_price" | null;
      priceFxRateToInvoice?: string | null;
      priceFxSourceToTryRate?: string | null;
      priceFxInvoiceToTryRate?: string | null;
      priceFxSource?: "system" | "manual" | null;
      priceFxEffectiveAt?: Date | null;
      priceFxNote?: string | null;
    }>;
  // Draft Revision publication is the only controlled exception to the normal
  // per-line payment-history lock. Currency, pricing-model, settlement, and
  // total-not-below-settled guards remain authoritative in all cases.
  allowHistoricalLineEdits?: boolean;
};

async function updateInvoiceFullWithDb(
  db: any,
  invoiceId: number,
  data: InvoiceFullUpdateInput,
) {

  const [existingInvForFinancialGuards] = await db
    .select({ currency: invoices.currency, paidAmount: invoices.paidAmount, pricingMode: invoices.pricingMode })
    .from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!existingInvForFinancialGuards) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });

  // A payment row is immutable financial history, even if later voided. Do not
  // re-denominate recorded FX / settlement history by changing invoice currency.
  if (data.currency !== undefined && data.currency !== existingInvForFinancialGuards.currency) {
    const [paymentHistoryCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(payments).where(eq(payments.invoiceId, invoiceId));
    if (Number(paymentHistoryCount?.count ?? 0) > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Invoice currency cannot be changed after financial activity has been recorded. Cancel and recreate the invoice if the currency must change.",
      });
    }
    const [sourcePriceLineCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(invoiceItems)
      .where(and(eq(invoiceItems.invoiceId, invoiceId), isNotNull(invoiceItems.priceEntryCurrency)));
    if (Number(sourcePriceLineCount?.count ?? 0) > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Invoice currency cannot be changed after negotiated source-price facts have been saved. Cancel and recreate the invoice if its currency must change.",
      });
    }
  }

  // ─── Pricing Mode Lock ────────────────────────────────────────────────────
  // Once a payment exists, pricingMode cannot be changed because historical
  // payments have immutable persisted settledAmount values calculated under
  // the original pricing model. Switching modes would make those values
  // internally inconsistent with any new payments recorded after the change.
  if (data.pricingMode !== undefined) {
    const [existingInvForLock] = await db
      .select({ pricingMode: invoices.pricingMode })
      .from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    const currentMode = (existingInvForLock?.pricingMode as string) ?? "discount";
    // Normalise: discount_legacy is treated as discount for comparison purposes
    const normalise = (m: string) => (m === "discount_legacy" ? "discount" : m);
    if (normalise(currentMode) !== normalise(data.pricingMode)) {
      // Check whether any payment rows exist for this invoice
      const [paymentCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(payments).where(eq(payments.invoiceId, invoiceId));
      if (Number(paymentCount?.count ?? 0) > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Pricing mode cannot be changed after payments have been recorded. " +
            "Cancel and recreate the invoice if the pricing structure must change.",
        });
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const canonicalItems = data.items.map(item => {
    try {
      return { ...item, ...computeInvoiceLinePricing(item) };
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid line pricing." });
    }
  });
  const subtotalCalc = canonicalItems.reduce((sum, item) => sum.plus(item.totalPrice), new Decimal(0));
  if (data.subtotal !== undefined && !new Decimal(String(data.subtotal)).minus(subtotalCalc).abs().lte(0.01)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice subtotal does not match the canonical line totals." });
  }

  // V3: use server-computed values when provided (from router), else fall back to legacy calculation
  const subtotalFinal = subtotalCalc.toFixed(2);
  const discountPercent = data.discountPercent ?? 0;
  const discountAmount = data.discountAmount ?? (discountPercent > 0 ? subtotalCalc.mul(discountPercent).div(100).toNumber() : 0);
  const taxAmount = data.taxAmount ?? 0;
  const totalAmountFinal = data.totalAmount ?? subtotalCalc.minus(discountAmount).plus(taxAmount).toFixed(2);
  const newTotalAmount = new Decimal(String(totalAmountFinal ?? "0"));
  const currentActivePaidAmount = new Decimal(String(existingInvForFinancialGuards.paidAmount ?? "0"));
  if (!newTotalAmount.isFinite() || newTotalAmount.lt(currentActivePaidAmount)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Invoice total cannot be reduced below the amount already settled. Resolve the existing financial activity first.",
    });
  }

  {
    const tx = db;
    const existingItems = await tx
      .select({
        id: invoiceItems.id,
        serviceId: invoiceItems.serviceId,
        lineLabel: invoiceItems.lineLabel,
        description: invoiceItems.description,
        quantity: invoiceItems.quantity,
        unitPrice: invoiceItems.unitPrice,
        taxRuleId: invoiceItems.taxRuleId,
        taxLabelSnapshot: invoiceItems.taxLabelSnapshot,
        taxRateSnapshot: invoiceItems.taxRateSnapshot,
        effectiveTaxableBase: invoiceItems.effectiveTaxableBase,
        taxAmount: invoiceItems.taxAmount,
        priceEntryCurrency: invoiceItems.priceEntryCurrency,
        priceEntryAmount: invoiceItems.priceEntryAmount,
        priceEntryKind: invoiceItems.priceEntryKind,
        priceFxRateToInvoice: invoiceItems.priceFxRateToInvoice,
        priceFxSourceToTryRate: invoiceItems.priceFxSourceToTryRate,
        priceFxInvoiceToTryRate: invoiceItems.priceFxInvoiceToTryRate,
        priceFxSource: invoiceItems.priceFxSource,
        priceFxEffectiveAt: invoiceItems.priceFxEffectiveAt,
        priceFxNote: invoiceItems.priceFxNote,
      })
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, invoiceId)) as any[];
    const [paymentHistoryCount] = await tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    const hasPaymentHistory = Number(paymentHistoryCount?.count ?? 0) > 0;
    const existingById = new Map(existingItems.map(item => [item.id, item]));
    const requestedExistingIds = new Set<number>();

    for (const item of canonicalItems) {
      if (item.id === undefined) continue;
      const existing = existingById.get(item.id);
      if (!existing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "An invoice line does not belong to this invoice." });
      }
      requestedExistingIds.add(item.id);
      if (hasPaymentHistory && !data.allowHistoricalLineEdits) {
        const sameService = String(existing.serviceId ?? "") === String(item.serviceId ?? "");
        const sameDescription = existing.description === item.description;
        const sameQuantity = Number(existing.quantity) === item.quantity;
        const sameUnitPrice = new Decimal(String(existing.unitPrice)).eq(item.unitPrice);
        const sameTaxRule = String(existing.taxRuleId ?? "") === String(item.taxRuleId ?? "");
        const sameTaxLabel = String(existing.taxLabelSnapshot ?? "") === String(item.taxLabelSnapshot ?? "");
        const sameTaxRate = String(existing.taxRateSnapshot ?? "") === String(item.taxRateSnapshot ?? "");
        const samePriceEntry = String(existing.priceEntryCurrency ?? "") === String(item.priceEntryCurrency ?? "")
          && String(existing.priceEntryAmount ?? "") === String(item.priceEntryAmount ?? "")
          && String(existing.priceEntryKind ?? "") === String(item.priceEntryKind ?? "")
          && String(existing.priceFxRateToInvoice ?? "") === String(item.priceFxRateToInvoice ?? "")
          && String(existing.priceFxSource ?? "") === String(item.priceFxSource ?? "")
          && String(existing.priceFxEffectiveAt?.getTime?.() ?? "") === String(item.priceFxEffectiveAt?.getTime?.() ?? "");
        if (!sameService || !sameDescription || !sameQuantity || !sameUnitPrice || !sameTaxRule || !sameTaxLabel || !sameTaxRate || !samePriceEntry) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Existing service, quantity, standard unit price, and Tax rule cannot be changed after payment history has been recorded.",
          });
        }
      }
    }

    if (hasPaymentHistory && !data.allowHistoricalLineEdits) {
      const omittedHistoricalLine = existingItems.some(item => !requestedExistingIds.has(item.id));
      if (omittedHistoricalLine) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Existing invoice lines cannot be removed after payment history has been recorded.",
        });
      }
    } else {
      for (const existing of existingItems) {
        if (!requestedExistingIds.has(existing.id)) {
          await tx.delete(invoiceItems).where(eq(invoiceItems.id, existing.id));
        }
      }
    }

    for (const item of canonicalItems) {
      const existing = item.id === undefined ? undefined : existingById.get(item.id);
      const values = {
        serviceId: item.serviceId ?? null,
        lineLabel: item.lineLabel === undefined ? existing?.lineLabel ?? null : item.lineLabel,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice as any,
        totalPrice: item.totalPrice as any,
        linePricingMethod: item.linePricingMethod,
        lineDiscountPercent: item.lineDiscountPercent as any,
        taxRuleId: item.taxRuleId ?? null,
        taxLabelSnapshot: item.taxLabelSnapshot ?? null,
        taxRateSnapshot: item.taxRateSnapshot as any ?? null,
        effectiveTaxableBase: item.effectiveTaxableBase as any ?? null,
        taxAmount: item.taxAmount as any ?? "0",
        priceEntryCurrency: item.priceEntryCurrency === undefined ? existing?.priceEntryCurrency as any ?? null : item.priceEntryCurrency as any,
        priceEntryAmount: item.priceEntryAmount === undefined ? existing?.priceEntryAmount as any ?? null : item.priceEntryAmount as any,
        priceEntryKind: item.priceEntryKind === undefined ? existing?.priceEntryKind as any ?? null : item.priceEntryKind as any,
        priceFxRateToInvoice: item.priceFxRateToInvoice === undefined ? existing?.priceFxRateToInvoice as any ?? null : item.priceFxRateToInvoice as any,
        priceFxSourceToTryRate: item.priceFxSourceToTryRate === undefined ? existing?.priceFxSourceToTryRate as any ?? null : item.priceFxSourceToTryRate as any,
        priceFxInvoiceToTryRate: item.priceFxInvoiceToTryRate === undefined ? existing?.priceFxInvoiceToTryRate as any ?? null : item.priceFxInvoiceToTryRate as any,
        priceFxSource: item.priceFxSource === undefined ? existing?.priceFxSource as any ?? null : item.priceFxSource as any,
        priceFxEffectiveAt: item.priceFxEffectiveAt === undefined ? existing?.priceFxEffectiveAt ?? null : item.priceFxEffectiveAt,
        priceFxNote: item.priceFxNote === undefined ? existing?.priceFxNote ?? null : item.priceFxNote,
      };
      if (item.id !== undefined) {
        await tx.update(invoiceItems).set(values).where(and(eq(invoiceItems.id, item.id), eq(invoiceItems.invoiceId, invoiceId)));
      } else {
        await tx.insert(invoiceItems).values({ invoiceId, ...values });
      }
    }

    await tx.update(invoices).set({
      ...(data.currency && { currency: data.currency as any }),
      subtotal: subtotalFinal as any,
      discountAmount: discountAmount.toFixed ? discountAmount.toFixed(2) as any : discountAmount as any,
      discountPercent: discountPercent.toFixed(2) as any,
      taxAmount: taxAmount.toFixed(2) as any,
      totalAmount: totalAmountFinal as any,
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
      ...(data.pricingMode !== undefined && { pricingMode: data.pricingMode }),
      ...(data.finalAgreedAmount !== undefined && { finalAgreedAmount: data.finalAgreedAmount as any }),
      ...(data.paymentAdjustmentRateSnapshot !== undefined && { paymentAdjustmentRateSnapshot: data.paymentAdjustmentRateSnapshot as any }),
      updatedAt: new Date(),
    }).where(eq(invoices.id, invoiceId));

    await recalcInvoicePaidAmountWithDb(tx as any, invoiceId);
  }
  return { success: true };
}

export async function updateInvoiceFull(
  invoiceId: number,
  data: InvoiceFullUpdateInput,
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.transaction((tx) => updateInvoiceFullWithDb(tx, invoiceId, data));
}

type InvoiceRevisionSnapshot = {
  updateData: InvoiceFullUpdateInput;
  capturedAt: string;
};

function revisionTotals(invoice: any) {
  return {
    subtotal: String(invoice.subtotal ?? "0"),
    discountAmount: String(invoice.discountAmount ?? "0"),
    taxAmount: String(invoice.taxAmount ?? "0"),
    totalAmount: String(invoice.totalAmount ?? "0"),
    paidAmount: String(invoice.paidAmount ?? "0"),
    currency: invoice.currency,
  };
}

function normalizeRevisionSnapshot(value: unknown): InvoiceRevisionSnapshot {
  const snapshot = value as InvoiceRevisionSnapshot;
  if (!snapshot?.updateData || !Array.isArray(snapshot.updateData.items)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This Draft Revision is incomplete and cannot be re-issued." });
  }
  const updateData = {
    ...snapshot.updateData,
    dueDate: snapshot.updateData.dueDate ? new Date(snapshot.updateData.dueDate as any) : null,
    items: snapshot.updateData.items.map((item: any) => ({
      ...item,
      priceFxEffectiveAt: item.priceFxEffectiveAt ? new Date(item.priceFxEffectiveAt) : null,
    })),
  } as InvoiceFullUpdateInput;
  return { ...snapshot, updateData };
}

function summarizeInvoiceRevisionChange(previous: InvoiceFullUpdateInput, next: InvoiceFullUpdateInput) {
  const changedFields = ["currency", "discountPercent", "discountAmount", "taxAmount", "notes", "dueDate", "pricingMode", "finalAgreedAmount"]
    .filter((key) => JSON.stringify((previous as any)[key]) !== JSON.stringify((next as any)[key]));
  const previousItems = previous.items.map((item) => ({ id: item.id ?? null, description: item.description, lineLabel: item.lineLabel ?? null, quantity: item.quantity, taxRuleId: item.taxRuleId ?? null, totalPrice: String(item.totalPrice ?? "") }));
  const nextItems = next.items.map((item) => ({ id: item.id ?? null, description: item.description, lineLabel: item.lineLabel ?? null, quantity: item.quantity, taxRuleId: item.taxRuleId ?? null, totalPrice: String(item.totalPrice ?? "") }));
  return { changedFields, previousItems, nextItems };
}

async function buildInvoiceRevisionSnapshot(tx: any, invoiceId: number): Promise<InvoiceRevisionSnapshot> {
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
  const items = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId)) as any[];
  return {
    capturedAt: new Date().toISOString(),
    updateData: {
      currency: invoice.currency as InvoiceFullUpdateInput["currency"],
      discountAmount: Number(invoice.discountAmount ?? 0),
      discountPercent: Number(invoice.discountPercent ?? 0),
      taxAmount: Number(invoice.taxAmount ?? 0),
      notes: invoice.notes ?? "",
      dueDate: invoice.dueDate ?? null,
      subtotal: String(invoice.subtotal ?? "0"),
      totalAmount: String(invoice.totalAmount ?? "0"),
      pricingMode: invoice.pricingMode ?? undefined,
      finalAgreedAmount: invoice.finalAgreedAmount == null ? undefined : String(invoice.finalAgreedAmount),
      paymentAdjustmentRateSnapshot: invoice.paymentAdjustmentRateSnapshot == null ? undefined : String(invoice.paymentAdjustmentRateSnapshot),
      items: items.map((item) => ({
        id: item.id,
        serviceId: item.serviceId,
        lineLabel: item.lineLabel,
        description: item.description,
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
        totalPrice: String(item.totalPrice),
        linePricingMethod: item.linePricingMethod as InvoiceLinePricingMethod,
        lineDiscountPercent: item.lineDiscountPercent == null ? null : String(item.lineDiscountPercent),
        taxRuleId: item.taxRuleId,
        taxLabelSnapshot: item.taxLabelSnapshot,
        taxRateSnapshot: item.taxRateSnapshot == null ? null : String(item.taxRateSnapshot),
        effectiveTaxableBase: item.effectiveTaxableBase == null ? null : String(item.effectiveTaxableBase),
        taxAmount: item.taxAmount == null ? null : String(item.taxAmount),
        priceEntryCurrency: item.priceEntryCurrency as any,
        priceEntryAmount: item.priceEntryAmount == null ? null : String(item.priceEntryAmount),
        priceEntryKind: item.priceEntryKind as any,
        priceFxRateToInvoice: item.priceFxRateToInvoice == null ? null : String(item.priceFxRateToInvoice),
        priceFxSourceToTryRate: item.priceFxSourceToTryRate == null ? null : String(item.priceFxSourceToTryRate),
        priceFxInvoiceToTryRate: item.priceFxInvoiceToTryRate == null ? null : String(item.priceFxInvoiceToTryRate),
        priceFxSource: item.priceFxSource as any,
        priceFxEffectiveAt: item.priceFxEffectiveAt ?? null,
        priceFxNote: item.priceFxNote,
      })),
    },
  };
}

async function ensureInvoicePublishedRevision(tx: any, invoice: any, createdById?: number) {
  if (invoice.currentPublishedRevisionId) return Number(invoice.currentPublishedRevisionId);
  const baseline = await buildInvoiceRevisionSnapshot(tx, invoice.id);
  const revisionNumber = Number(invoice.currentRevisionNumber ?? 1);
  const inserted = await tx.insert(invoiceRevisions).values({
    invoiceId: invoice.id,
    revisionNumber,
    status: "published",
    snapshot: baseline as any,
    previousTotals: revisionTotals(invoice) as any,
    publishedTotals: revisionTotals(invoice) as any,
    createdById: createdById ?? null,
    publishedById: createdById ?? null,
    publishedAt: new Date(),
  } as any);
  const id = Number((inserted as any).insertId ?? (inserted as any)[0]?.insertId ?? 0);
  await tx.update(invoices).set({
    currentRevisionNumber: revisionNumber,
    currentPublishedRevisionId: id,
  } as any).where(eq(invoices.id, invoice.id));
  return id;
}

export async function reopenInvoiceForDraftRevision(invoiceId: number, createdById?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
    if (invoice.status === "cancelled") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Cancelled invoices cannot be reopened for editing." });
    if (invoice.activeDraftRevisionId) {
      const [existingDraft] = await tx.select().from(invoiceRevisions).where(and(eq(invoiceRevisions.id, invoice.activeDraftRevisionId), eq(invoiceRevisions.status, "draft"))).limit(1);
      if (existingDraft) return existingDraft;
    }
    const parentPublishedRevisionId = await ensureInvoicePublishedRevision(tx, invoice, createdById);
    const snapshot = await buildInvoiceRevisionSnapshot(tx, invoiceId);
    const revisionNumber = Number(invoice.currentRevisionNumber ?? 1) + 1;
    const inserted = await tx.insert(invoiceRevisions).values({
      invoiceId,
      revisionNumber,
      status: "draft",
      parentPublishedRevisionId,
      snapshot: snapshot as any,
      createdById: createdById ?? null,
    } as any);
    const draftId = Number((inserted as any).insertId ?? (inserted as any)[0]?.insertId ?? 0);
    await tx.update(invoices).set({ activeDraftRevisionId: draftId } as any).where(eq(invoices.id, invoiceId));
    const [draft] = await tx.select().from(invoiceRevisions).where(eq(invoiceRevisions.id, draftId)).limit(1);
    return draft;
  });
}

export async function saveInvoiceDraftRevision(invoiceId: number, draftRevisionId: number, snapshot: InvoiceRevisionSnapshot, editedById?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!invoice || Number(invoice.activeDraftRevisionId ?? 0) !== draftRevisionId) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Draft Revision is no longer available. Reopen the invoice and try again." });
    }
    const [draft] = await tx.select().from(invoiceRevisions).where(and(
      eq(invoiceRevisions.id, draftRevisionId),
      eq(invoiceRevisions.invoiceId, invoiceId),
      eq(invoiceRevisions.status, "draft"),
    )).limit(1);
    if (!draft) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Draft Revision is no longer available. Reopen the invoice and try again." });

    // Do not infer write success from the driver-specific update result shape.
    // The active pointer and draft status are checked inside this transaction,
    // before the snapshot is updated, which also preserves one-active-draft
    // semantics under concurrent resume/save requests.
    await tx.update(invoiceRevisions).set({
      snapshot: snapshot as any,
      createdById: editedById ?? null,
      updatedAt: new Date(),
    } as any).where(eq(invoiceRevisions.id, draftRevisionId));
    return { success: true };
  });
}

export async function publishInvoiceDraftRevision(invoiceId: number, draftRevisionId: number, publishedById?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!invoice || invoice.activeDraftRevisionId !== draftRevisionId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This Draft Revision is no longer the active revision for the invoice." });
    const [draft] = await tx.select().from(invoiceRevisions).where(and(eq(invoiceRevisions.id, draftRevisionId), eq(invoiceRevisions.status, "draft"))).limit(1);
    if (!draft) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Draft Revision not found." });
    const [published] = await tx.select().from(invoiceRevisions).where(eq(invoiceRevisions.id, invoice.currentPublishedRevisionId ?? 0)).limit(1);
    if (!published) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Published Revision history is unavailable. Reopen the invoice again before re-issuing." });
    const previous = normalizeRevisionSnapshot(published.snapshot);
    const next = normalizeRevisionSnapshot(draft.snapshot);
    await updateInvoiceFullWithDb(tx, invoiceId, { ...next.updateData, allowHistoricalLineEdits: true });
    const [publishedInvoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    const now = new Date();
    await tx.update(invoiceRevisions).set({
      status: "published",
      previousTotals: revisionTotals(invoice) as any,
      publishedTotals: revisionTotals(publishedInvoice) as any,
      changeSummary: summarizeInvoiceRevisionChange(previous.updateData, next.updateData) as any,
      publishedById: publishedById ?? null,
      publishedAt: now,
      updatedAt: now,
    } as any).where(eq(invoiceRevisions.id, draftRevisionId));
    await tx.update(invoices).set({
      currentRevisionNumber: draft.revisionNumber,
      currentPublishedRevisionId: draftRevisionId,
      activeDraftRevisionId: null,
      updatedAt: now,
    } as any).where(eq(invoices.id, invoiceId));
    return { success: true, revisionNumber: draft.revisionNumber };
  });
}

export async function getInvoiceRevisions(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: invoiceRevisions.id,
    revisionNumber: invoiceRevisions.revisionNumber,
    status: invoiceRevisions.status,
    parentPublishedRevisionId: invoiceRevisions.parentPublishedRevisionId,
    changeSummary: invoiceRevisions.changeSummary,
    previousTotals: invoiceRevisions.previousTotals,
    publishedTotals: invoiceRevisions.publishedTotals,
    createdById: invoiceRevisions.createdById,
    publishedById: invoiceRevisions.publishedById,
    createdAt: invoiceRevisions.createdAt,
    updatedAt: invoiceRevisions.updatedAt,
    publishedAt: invoiceRevisions.publishedAt,
  }).from(invoiceRevisions).where(eq(invoiceRevisions.invoiceId, invoiceId)).orderBy(desc(invoiceRevisions.revisionNumber));
}

export async function getInvoiceRevisionById(invoiceId: number, revisionId: number) {
  const db = await getDb();
  if (!db) return null;
  const [revision] = await db.select().from(invoiceRevisions).where(and(eq(invoiceRevisions.invoiceId, invoiceId), eq(invoiceRevisions.id, revisionId))).limit(1);
  return revision ?? null;
}

// ─── Proposal Items ───────────────────────────────────────────────────────────

export async function upsertProposalItems(proposalId: number, items: InsertProposalItem[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Delete existing items
  await db.delete(proposalItems).where(eq(proposalItems.proposalId, proposalId));
  // Insert new items
  for (const item of items) {
    await db.insert(proposalItems).values({ ...item, proposalId } as any);
  }
  return { success: true };
}

export async function listProposalItems(proposalId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db
    .select({
      id: proposalItems.id,
      proposalId: proposalItems.proposalId,
      serviceId: proposalItems.serviceId,
      description: proposalItems.description,
      quantity: proposalItems.quantity,
      unitPrice: proposalItems.unitPrice,
      discount: proposalItems.discount,
      totalPrice: proposalItems.totalPrice,
      serviceName: services.name,
      serviceDescription: services.description,
    })
    .from(proposalItems)
    .leftJoin(services, eq(proposalItems.serviceId, services.id))
    .where(eq(proposalItems.proposalId, proposalId));
  return rows;
}

// ─── WhatsApp Messages ────────────────────────────────────────────────────────

export async function createWhatsappMessage(data: InsertWhatsappMessage) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(whatsappMessages).values(data as any);
  return { id: (result as any).insertId as number };
}

export async function listWhatsappMessages(filters: { leadId?: number; patientId?: number; limit?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const conditions = [];
  if (filters.leadId) conditions.push(eq(whatsappMessages.leadId, filters.leadId));
  if (filters.patientId) conditions.push(eq(whatsappMessages.patientId, filters.patientId));
  const query = db.select().from(whatsappMessages);
  if (conditions.length > 0) {
    // @ts-ignore
    return query.where(conditions.length === 1 ? conditions[0] : and(...conditions)).orderBy(whatsappMessages.createdAt).limit(filters.limit ?? 100);
  }
  return query.orderBy(whatsappMessages.createdAt).limit(filters.limit ?? 100);
}

// ─── Credit & Refund Helpers ──────────────────────────────────────────────────

type CreditCurrency = "USD" | "EUR" | "GBP" | "TRY" | "SAR" | "AED" | "AUD";

/** Get the current credit balance for a patient in a specific currency */
export async function getPatientCreditBalance(patientId: number, currency: CreditCurrency, financialScope: FinancialScope = "production"): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ amount: creditTransactions.amount })
    .from(creditTransactions)
    .where(and(
      eq(creditTransactions.patientId, patientId),
      eq(creditTransactions.currency, currency),
      eq(creditTransactions.financialScope, financialScope)
    ));
  return rows.reduce((sum, r) => sum + parseFloat(String(r.amount)), 0);
}

/** Get all credit transactions for a patient */
export async function getCreditTransactions(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.patientId, patientId))
    .orderBy(desc(creditTransactions.createdAt));
}

/**
 * Returns only the immutable, native-currency Patient Credit lots genuinely
 * created from payments recorded against one invoice. This is presentation
 * data for invoice/receipt documents; it neither derives a surplus nor changes
 * FIFO balances, settlements, refunds, or credit activity.
 */
export async function listOverpaymentCreditLotsByInvoice(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: creditTransactions.id,
      originPaymentId: creditTransactions.originPaymentId,
      currency: creditTransactions.currency,
      amount: creditTransactions.amount,
      financialScope: creditTransactions.financialScope,
    })
    .from(creditTransactions)
    .where(and(
      eq(creditTransactions.invoiceId, invoiceId),
      eq(creditTransactions.type, "overpayment"),
    ))
    .orderBy(asc(creditTransactions.createdAt), asc(creditTransactions.id));
}

/** Explicit non-cash FX precision closures; these never represent payment received. */
export async function getPatientFxRoundingAdjustments(patientId: number, financialScope?: FinancialScope) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    eq(invoiceSettlements.patientId, patientId),
    eq(invoiceSettlements.sourceType, "fx_rounding_adjustment"),
    eq(invoiceSettlements.status, "active"),
  ];
  if (financialScope) conditions.push(eq(invoiceSettlements.financialScope, financialScope));
  return db
    .select({
      id: invoiceSettlements.id,
      invoiceId: invoiceSettlements.invoiceId,
      amount: invoiceSettlements.amount,
      currency: invoiceSettlements.currency,
      financialScope: invoiceSettlements.financialScope,
      sourceCreditCurrency: invoiceSettlements.sourceCreditCurrency,
      sourceCreditAmount: invoiceSettlements.sourceCreditAmount,
      conversionRate: invoiceSettlements.creditConversionRateToInvoice,
      fxEffectiveAt: invoiceSettlements.creditFxEffectiveAt,
      reason: invoiceSettlements.fxRoundingReason,
      sourceMinorUnit: invoiceSettlements.fxRoundingSourceMinorUnit,
      recordedById: invoiceSettlements.recordedById,
      createdAt: invoiceSettlements.createdAt,
      invoiceNumber: invoices.invoiceNumber,
    })
    .from(invoiceSettlements)
    .innerJoin(invoices, eq(invoiceSettlements.invoiceId, invoices.id))
    .where(and(...conditions))
    .orderBy(desc(invoiceSettlements.createdAt));
}

/** Add a native-currency credit transaction; historical rows remain untouched. */
export async function addCreditTransaction(data: {
  patientId: number;
  currency: CreditCurrency;
  amount: number;
  type: "overpayment" | "applied_to_invoice" | "refund_deduction" | "manual_adjustment";
  invoiceId?: number;
  notes?: string;
  recordedById?: number;
  originPaymentId?: number;
  originInvoiceId?: number;
  sourceCreditTransactionId?: number;
  settlementId?: number;
  originPaymentMethod?: "cash" | "credit_card" | "bank_transfer" | "insurance" | "other";
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const patientScope = await getPatientDefaultFinancialScope(db, data.patientId);
  let financialScope: FinancialScope = patientScope;
  if (data.invoiceId != null) {
    const [invoice] = await db.select({ patientId: invoices.patientId, financialScope: invoices.financialScope })
      .from(invoices).where(eq(invoices.id, data.invoiceId)).limit(1);
    if (!invoice || invoice.patientId !== data.patientId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Credit transaction invoice does not belong to this patient." });
    }
    financialScope = (invoice.financialScope ?? "production") as FinancialScope;
  }

  const [result] = await db.insert(creditTransactions).values({
    patientId: data.patientId,
    currency: data.currency as any,
    amount: data.amount.toFixed(2) as any,
    type: data.type,
    invoiceId: data.invoiceId ?? null,
    financialScope,
    originPaymentId: data.originPaymentId ?? null,
    originInvoiceId: data.originInvoiceId ?? null,
    sourceCreditTransactionId: data.sourceCreditTransactionId ?? null,
    settlementId: data.settlementId ?? null,
    originPaymentMethod: data.originPaymentMethod ?? null,
    notes: data.notes ?? null,
    recordedById: data.recordedById ?? null,
  } as any);
  return { id: (result as any).insertId as number };
}

/**
 * Derive native-credit availability from immutable ledger rows. Positive reversal
 * rows replenish the exact source lot; legacy negative rows without a source link
 * are conservatively consumed FIFO so they are never ignored or double counted.
 */
function getCreditAvailabilityBySource(credits: any[]) {
  const originCredits = credits.filter((row: any) =>
    new Decimal(String(row.amount)).gt(0) && row.type !== "applied_credit_reversal",
  );
  const originIds = new Set(originCredits.map((row: any) => Number(row.id)));
  const debitsBySource = new Map<number, Decimal>();
  let unallocatedLegacyDebit = new Decimal(0);

  for (const row of credits) {
    const amount = new Decimal(String(row.amount ?? "0"));
    const sourceId = row.sourceCreditTransactionId == null ? null : Number(row.sourceCreditTransactionId);
    if (sourceId != null && originIds.has(sourceId)) {
      if (row.type === "applied_to_invoice" || row.type === "credit_payout" || row.type === "applied_credit_reversal") {
        debitsBySource.set(sourceId, (debitsBySource.get(sourceId) ?? new Decimal(0)).plus(amount));
      }
    } else if (amount.lt(0)) {
      unallocatedLegacyDebit = unallocatedLegacyDebit.plus(amount.abs());
    }
  }

  for (const origin of originCredits) {
    if (unallocatedLegacyDebit.lte(0)) break;
    const currentAvailable = new Decimal(String(origin.amount)).plus(debitsBySource.get(origin.id) ?? new Decimal(0));
    const consumed = Decimal.min(currentAvailable, unallocatedLegacyDebit);
    if (consumed.lte(0)) continue;
    debitsBySource.set(origin.id, (debitsBySource.get(origin.id) ?? new Decimal(0)).minus(consumed));
    unallocatedLegacyDebit = unallocatedLegacyDebit.minus(consumed);
  }

  const available = originCredits.reduce(
    (total: Decimal, row: any) => total.plus(String(row.amount)).plus(debitsBySource.get(row.id) ?? new Decimal(0)),
    new Decimal(0),
  );
  return { originCredits, debitsBySource, available: Decimal.max(0, available) };
}

/** Apply same-currency Patient Credit through immutable ledger and settlement rows. */
export async function applyCreditToInvoice(data: {
  patientId: number;
  invoiceId: number;
  amount: number;         // amount in invoice currency to apply
  currency: CreditCurrency; // invoice currency
  recordedById?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const requested = new Decimal(data.amount);
  if (!requested.isFinite() || requested.lte(0)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Credit amount must be greater than zero." });
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM invoices WHERE id = ${data.invoiceId} FOR UPDATE`);
    const [inv] = await tx.select({ patientId: invoices.patientId, paidAmount: invoices.paidAmount, totalAmount: invoices.totalAmount, currency: invoices.currency, financialScope: invoices.financialScope })
      .from(invoices).where(eq(invoices.id, data.invoiceId)).limit(1);
    if (!inv || inv.patientId !== data.patientId) throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice does not belong to this patient." });
    if (String(inv.currency) !== data.currency) throw new TRPCError({ code: "BAD_REQUEST", message: "Patient Credit must match the invoice currency." });
    const scope = (inv.financialScope ?? "production") as FinancialScope;
    const remaining = Decimal.max(new Decimal(0), new Decimal(String(inv.totalAmount)).minus(String(inv.paidAmount ?? "0")));
    if (requested.gt(remaining.plus("0.005"))) throw new TRPCError({ code: "BAD_REQUEST", message: "Credit application exceeds the amount currently required for this invoice." });

    const credits = await tx.select().from(creditTransactions).where(and(
      eq(creditTransactions.patientId, data.patientId),
      eq(creditTransactions.currency, data.currency as any),
      eq(creditTransactions.financialScope, scope)
    )).orderBy(asc(creditTransactions.createdAt), asc(creditTransactions.id));
    const { originCredits, debitsBySource, available } = getCreditAvailabilityBySource(credits);
    if (requested.gt(available.plus("0.005"))) throw new TRPCError({ code: "BAD_REQUEST", message: `Insufficient ${data.currency} Patient Credit.` });

    const [applicationResult] = await tx.insert(patientCreditApplications).values({
      patientId: data.patientId,
      invoiceId: data.invoiceId,
      financialScope: scope,
      sourceCurrency: data.currency as any,
      targetInvoiceCurrency: data.currency as any,
      sourceCreditAmount: requested.toFixed(2) as any,
      creditSettlementAmount: requested.toFixed(2) as any,
      fxRoundingAdjustmentAmount: "0" as any,
      finalSettlementAmount: requested.toFixed(2) as any,
      createdById: data.recordedById ?? 0,
    } as any);
    const applicationId = (applicationResult as any).insertId as number;

    let remainingToApply = requested;
    for (const origin of originCredits) {
      const originAvailable = new Decimal(String(origin.amount)).plus(debitsBySource.get(origin.id) ?? new Decimal(0));
      const applied = Decimal.min(originAvailable, remainingToApply);
      if (applied.lte(0)) continue;
      const [debitResult] = await tx.insert(creditTransactions).values({
        patientId: data.patientId, financialScope: scope, currency: data.currency as any,
        amount: applied.negated().toFixed(2) as any, type: "applied_to_invoice", invoiceId: data.invoiceId,
        originPaymentId: origin.originPaymentId, originInvoiceId: origin.originInvoiceId,
        sourceCreditTransactionId: origin.id, originPaymentMethod: origin.originPaymentMethod,
        patientCreditApplicationId: applicationId,
        recordedById: data.recordedById ?? null, notes: "Manual Patient Credit application.",
      } as any);
      const creditDebitId = (debitResult as any).insertId as number;
      const [settlementResult] = await tx.insert(invoiceSettlements).values({
        patientId: data.patientId, invoiceId: data.invoiceId, financialScope: scope,
        currency: data.currency as any, amount: applied.toFixed(2) as any, sourceType: "credit",
        creditTransactionId: creditDebitId, patientCreditApplicationId: applicationId, recordedById: data.recordedById ?? 0,
      } as any);
      const settlementId = (settlementResult as any).insertId as number;
      await tx.update(creditTransactions).set({ settlementId } as any).where(eq(creditTransactions.id, creditDebitId));
      await tx.insert(patientCreditApplicationAllocations).values({
        applicationId,
        sourceCreditTransactionId: origin.id,
        creditDebitTransactionId: creditDebitId,
        creditSettlementId: settlementId,
        nativeSourceAmount: applied.toFixed(2) as any,
        targetSettlementAmount: applied.toFixed(2) as any,
      } as any);
      remainingToApply = remainingToApply.minus(applied);
      if (remainingToApply.lte(0)) break;
    }
    await recalcInvoicePaidAmountWithDb(tx, data.invoiceId);
    const [updated] = await tx.select({ paidAmount: invoices.paidAmount, status: invoices.status }).from(invoices).where(eq(invoices.id, data.invoiceId)).limit(1);
    return { success: true, newPaid: Number(updated?.paidAmount ?? 0), newStatus: updated?.status };
  });
}

type CrossCurrencyCreditInput = {
  patientId: number;
  invoiceId: number;
  sourceCurrency: CreditCurrency;
  sourceAmount?: number;
  targetAmount?: number;
  applyMaximum?: boolean;
  recordedById?: number;
};

const FINANCE_CURRENCY_MINOR_UNIT = new Decimal("0.01");

function calculateFifoCrossCurrencySettlement(
  originCredits: any[],
  debitsBySource: Map<number, Decimal>,
  sourceAmount: Decimal,
  conversionRate: Decimal,
) {
  let remainingNative = sourceAmount;
  let convertedTotal = new Decimal(0);
  for (const origin of originCredits) {
    const originAvailable = new Decimal(String(origin.amount)).plus(debitsBySource.get(origin.id) ?? new Decimal(0));
    const nativeConsumed = Decimal.min(originAvailable, remainingNative).toDecimalPlaces(2, Decimal.ROUND_DOWN);
    if (nativeConsumed.lte(0)) continue;
    convertedTotal = quantizeFinanceMoney(convertedTotal.plus(quantizeFinanceMoney(nativeConsumed.mul(conversionRate))));
    remainingNative = remainingNative.minus(nativeConsumed);
    if (remainingNative.lte(0)) break;
  }
  return { convertedTotal, fullyAllocated: remainingNative.lte("0.005") };
}

function findMaximumSafeCrossCurrencySource(
  originCredits: any[],
  debitsBySource: Map<number, Decimal>,
  available: Decimal,
  remaining: Decimal,
  conversionRate: Decimal,
) {
  let candidate = Decimal.min(available, remaining.div(conversionRate))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  let settlement = calculateFifoCrossCurrencySettlement(originCredits, debitsBySource, candidate, conversionRate).convertedTotal;

  while (candidate.gt(0) && settlement.gt(remaining)) {
    candidate = candidate.minus(FINANCE_CURRENCY_MINOR_UNIT);
    settlement = calculateFifoCrossCurrencySettlement(originCredits, debitsBySource, candidate, conversionRate).convertedTotal;
  }
  while (candidate.plus(FINANCE_CURRENCY_MINOR_UNIT).lte(available)) {
    const nextCandidate = candidate.plus(FINANCE_CURRENCY_MINOR_UNIT);
    const nextSettlement = calculateFifoCrossCurrencySettlement(originCredits, debitsBySource, nextCandidate, conversionRate).convertedTotal;
    if (nextSettlement.gt(remaining)) break;
    candidate = nextCandidate;
    settlement = nextSettlement;
  }
  return { sourceAmount: Decimal.max(0, candidate), settlementAmount: settlement };
}

async function getCrossCurrencyCreditQuote(tx: any, input: Omit<CrossCurrencyCreditInput, "recordedById">) {
  const [invoice] = await tx.select({
    patientId: invoices.patientId,
    currency: invoices.currency,
    totalAmount: invoices.totalAmount,
    paidAmount: invoices.paidAmount,
    financialScope: invoices.financialScope,
  }).from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
  if (!invoice || invoice.patientId !== input.patientId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice does not belong to this patient." });
  }
  const targetCurrency = String(invoice.currency ?? "TRY") as CreditCurrency;
  if (input.sourceCurrency === targetCurrency) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Use the existing Apply Credit action for same-currency Patient Credit." });
  }
  const scope = (invoice.financialScope ?? "production") as FinancialScope;
  const credits = await tx.select().from(creditTransactions).where(and(
    eq(creditTransactions.patientId, input.patientId),
    eq(creditTransactions.currency, input.sourceCurrency as any),
    eq(creditTransactions.financialScope, scope),
  )).orderBy(asc(creditTransactions.createdAt), asc(creditTransactions.id));
  const { originCredits, debitsBySource, available } = getCreditAvailabilityBySource(credits);
  const remaining = Decimal.max(new Decimal(0), new Decimal(String(invoice.totalAmount ?? "0")).minus(String(invoice.paidAmount ?? "0")));
  const applicationTime = new Date();
  const [sourceRate, targetRate] = await Promise.all([
    resolveApprovedPaymentExchangeRate(input.sourceCurrency, applicationTime),
    resolveApprovedPaymentExchangeRate(targetCurrency, applicationTime),
  ]);
  const conversionRate = new Decimal(String(sourceRate.rate)).div(String(targetRate.rate));
  const maximumSafe = remaining.eq(0)
    ? { sourceAmount: new Decimal(0), settlementAmount: new Decimal(0) }
    : findMaximumSafeCrossCurrencySource(originCredits, debitsBySource, available, remaining, conversionRate);
  const maximumUsable = maximumSafe.sourceAmount;
  const maximumTargetSettlement = maximumSafe.settlementAmount;
  const requestedTarget = input.targetAmount == null ? null : quantizeFinanceMoney(input.targetAmount);
  if (requestedTarget != null && (!requestedTarget.isFinite() || requestedTarget.lte(0))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Target invoice amount must be greater than zero." });
  }
  if (requestedTarget != null && requestedTarget.gt(remaining)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Target amount exceeds the invoice amount currently required." });
  }
  // The target field always means the final amount removed from the invoice balance.
  // A precision-only non-cash adjustment may make that final amount larger than the
  // converted credit settlement, but it never changes the source-credit debit.
  const requestedFinalTarget = input.applyMaximum ? remaining : requestedTarget;
  const targetCeiling = requestedFinalTarget ?? remaining;
  let requested = input.applyMaximum
    ? maximumUsable
    : requestedTarget != null
      ? Decimal.min(available, requestedTarget.div(conversionRate)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      : new Decimal(input.sourceAmount ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  let requestedSimulation = calculateFifoCrossCurrencySettlement(originCredits, debitsBySource, requested, conversionRate);
  while (requested.gt(0) && requestedSimulation.convertedTotal.gt(targetCeiling)) {
    requested = requested.minus(FINANCE_CURRENCY_MINOR_UNIT);
    requestedSimulation = calculateFifoCrossCurrencySettlement(originCredits, debitsBySource, requested, conversionRate);
  }
  if (!requested.isFinite() || requested.lte(0)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Credit amount must be greater than zero." });
  }
  const settlementSimulation = requestedSimulation;
  const convertedSettlementAmount = settlementSimulation.convertedTotal;
  const residualAfterConverted = quantizeFinanceMoney(Decimal.max(new Decimal(0), remaining.minus(convertedSettlementAmount)));
  const nextSourceAmount = requested.plus(FINANCE_CURRENCY_MINOR_UNIT);
  const nextSettlementAmount = calculateFifoCrossCurrencySettlement(originCredits, debitsBySource, nextSourceAmount, conversionRate).convertedTotal;
  const desiredResidual = requestedFinalTarget == null
    ? new Decimal(0)
    : quantizeFinanceMoney(Decimal.max(new Decimal(0), requestedFinalTarget.minus(convertedSettlementAmount)));
  const isFxPrecisionResidual = requestedFinalTarget != null
    && available.gte(nextSourceAmount)
    && desiredResidual.gt(0)
    && nextSettlementAmount.gt(requestedFinalTarget);
  const fxRoundingAdjustmentAmount = isFxPrecisionResidual ? desiredResidual : new Decimal(0);
  const finalTargetAmount = quantizeFinanceMoney(convertedSettlementAmount.plus(fxRoundingAdjustmentAmount));
  const maximumNextSourceAmount = maximumUsable.plus(FINANCE_CURRENCY_MINOR_UNIT);
  const maximumNextSettlementAmount = calculateFifoCrossCurrencySettlement(originCredits, debitsBySource, maximumNextSourceAmount, conversionRate).convertedTotal;
  const maximumResidual = quantizeFinanceMoney(Decimal.max(new Decimal(0), remaining.minus(maximumTargetSettlement)));
  const maximumFxRoundingAdjustmentAmount = available.gte(maximumNextSourceAmount)
    && maximumResidual.gt(0)
    && maximumNextSettlementAmount.gt(remaining)
    ? maximumResidual
    : new Decimal(0);
  const maximumFinalTargetAmount = quantizeFinanceMoney(maximumTargetSettlement.plus(maximumFxRoundingAdjustmentAmount));
  const fxEffectiveAt = new Date(Math.max(sourceRate.fxEffectiveAt.getTime(), targetRate.fxEffectiveAt.getTime()));
  return {
    invoice,
    targetCurrency,
    scope,
    originCredits,
    debitsBySource,
    available,
    remaining,
    requested,
    requestedTarget,
    maximumUsable,
    maximumTargetSettlement,
    maximumFinalTargetAmount,
    conversionRate,
    convertedSettlementAmount,
    fxRoundingAdjustmentAmount,
    finalTargetAmount,
    sourceMinorUnit: FINANCE_CURRENCY_MINOR_UNIT,
    fxEffectiveAt,
  };
}

/** Preview a manual native-credit conversion using approved Finance FX only. */
export async function quoteCrossCurrencyCreditApplication(input: Omit<CrossCurrencyCreditInput, "recordedById">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const quote = await getCrossCurrencyCreditQuote(db, input);
  const finalTargetAmount = quote.finalTargetAmount;
  const allowed = quote.requested.lte(quote.available.plus("0.005"))
    && finalTargetAmount.lte(quote.remaining.plus("0.005"));
  return {
    sourceCurrency: input.sourceCurrency,
    sourceAmount: quote.requested.toFixed(2),
    sourceAvailable: quote.available.toFixed(2),
    targetCurrency: quote.targetCurrency,
    // targetAmount is deliberately the coordinator's final invoice settlement.
    targetAmount: finalTargetAmount.toFixed(2),
    creditSettlementAmount: quote.convertedSettlementAmount.toFixed(2),
    fxRoundingAdjustmentAmount: quote.fxRoundingAdjustmentAmount.toFixed(2),
    finalTargetAmount: finalTargetAmount.toFixed(2),
    invoiceRemainingBefore: quote.remaining.toFixed(2),
    invoiceRemainingAfter: Decimal.max(new Decimal(0), quote.remaining.minus(finalTargetAmount)).toFixed(2),
    conversionRate: quote.conversionRate.toFixed(12),
    fxEffectiveAt: quote.fxEffectiveAt,
    fxSource: "approved_exchange_rate",
    maximumSourceAmount: quote.maximumUsable.toFixed(2),
    maximumTargetAmount: quote.maximumFinalTargetAmount.toFixed(2),
    sourceMinorUnit: quote.sourceMinorUnit.toFixed(2),
    targetAmountRequested: quote.requestedTarget?.toFixed(2) ?? null,
    allowed,
  };
}

/**
 * Consume native Patient Credit FIFO, freeze approved FX, and settle a compatible
 * invoice. This creates credit ledger and settlement rows only — never a payment.
 */
export async function applyCrossCurrencyCreditToInvoice(input: CrossCurrencyCreditInput) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM invoices WHERE id = ${input.invoiceId} FOR UPDATE`);
    const quote = await getCrossCurrencyCreditQuote(tx, input);
    const finalTargetAmount = quote.finalTargetAmount;
    if (quote.requested.gt(quote.available.plus("0.005"))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Insufficient ${input.sourceCurrency} Patient Credit.` });
    }
    if (finalTargetAmount.gt(quote.remaining.plus("0.005"))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Converted credit exceeds the amount currently required for this invoice." });
    }
    if (quote.convertedSettlementAmount.lte(0)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The selected credit cannot settle this invoice." });
    }

    const [applicationResult] = await tx.insert(patientCreditApplications).values({
      patientId: input.patientId,
      invoiceId: input.invoiceId,
      financialScope: quote.scope,
      sourceCurrency: input.sourceCurrency as any,
      targetInvoiceCurrency: quote.targetCurrency as any,
      sourceCreditAmount: quote.requested.toFixed(2) as any,
      creditSettlementAmount: quote.convertedSettlementAmount.toFixed(2) as any,
      fxRoundingAdjustmentAmount: quote.fxRoundingAdjustmentAmount.toFixed(2) as any,
      finalSettlementAmount: finalTargetAmount.toFixed(2) as any,
      conversionRateToInvoice: quote.conversionRate.toFixed(12) as any,
      fxEffectiveAt: quote.fxEffectiveAt,
      fxSource: "approved_exchange_rate",
      createdById: input.recordedById ?? 0,
    } as any);
    const applicationId = (applicationResult as any).insertId as number;

    let remainingNative = quote.requested;
    let convertedTotal = new Decimal(0);
    const appliedCreditTransactionIds: number[] = [];
    for (const origin of quote.originCredits) {
      const originAvailable = new Decimal(String(origin.amount)).plus(quote.debitsBySource.get(origin.id) ?? new Decimal(0));
      const nativeConsumed = Decimal.min(originAvailable, remainingNative).toDecimalPlaces(2, Decimal.ROUND_DOWN);
      if (nativeConsumed.lte(0)) continue;
      const targetSettled = quantizeFinanceMoney(nativeConsumed.mul(quote.conversionRate));
      if (targetSettled.lte(0)) continue;
      const [debitResult] = await tx.insert(creditTransactions).values({
        patientId: input.patientId,
        financialScope: quote.scope,
        currency: input.sourceCurrency as any,
        amount: nativeConsumed.negated().toFixed(2) as any,
        type: "applied_to_invoice",
        invoiceId: input.invoiceId,
        originPaymentId: origin.originPaymentId,
        originInvoiceId: origin.originInvoiceId,
        sourceCreditTransactionId: origin.id,
        originPaymentMethod: origin.originPaymentMethod,
        patientCreditApplicationId: applicationId,
        targetInvoiceCurrency: quote.targetCurrency as any,
        targetSettlementAmount: targetSettled.toFixed(2) as any,
        creditConversionRateToInvoice: quote.conversionRate.toFixed(12) as any,
        creditFxEffectiveAt: quote.fxEffectiveAt,
        creditFxSource: "approved_exchange_rate",
        sourceCreditAvailableBefore: originAvailable.toFixed(2) as any,
        recordedById: input.recordedById ?? null,
        notes: `Manual cross-currency Patient Credit application: ${nativeConsumed.toFixed(2)} ${input.sourceCurrency} → ${targetSettled.toFixed(2)} ${quote.targetCurrency}.`,
      } as any);
      const creditDebitId = (debitResult as any).insertId as number;
      const [settlementResult] = await tx.insert(invoiceSettlements).values({
        patientId: input.patientId,
        invoiceId: input.invoiceId,
        financialScope: quote.scope,
        currency: quote.targetCurrency as any,
        amount: targetSettled.toFixed(2) as any,
        sourceType: "credit",
        creditTransactionId: creditDebitId,
        patientCreditApplicationId: applicationId,
        sourceCreditCurrency: input.sourceCurrency as any,
        sourceCreditAmount: nativeConsumed.toFixed(2) as any,
        creditConversionRateToInvoice: quote.conversionRate.toFixed(12) as any,
        creditFxEffectiveAt: quote.fxEffectiveAt,
        creditFxSource: "approved_exchange_rate",
        recordedById: input.recordedById ?? 0,
      } as any);
      const settlementId = (settlementResult as any).insertId as number;
      await tx.update(creditTransactions).set({ settlementId } as any).where(eq(creditTransactions.id, creditDebitId));
      await tx.insert(patientCreditApplicationAllocations).values({
        applicationId,
        sourceCreditTransactionId: origin.id,
        creditDebitTransactionId: creditDebitId,
        creditSettlementId: settlementId,
        nativeSourceAmount: nativeConsumed.toFixed(2) as any,
        targetSettlementAmount: targetSettled.toFixed(2) as any,
      } as any);
      appliedCreditTransactionIds.push(creditDebitId);
      remainingNative = remainingNative.minus(nativeConsumed);
      convertedTotal = convertedTotal.plus(targetSettled);
      if (remainingNative.lte(0)) break;
    }
    if (remainingNative.gt("0.005")) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Patient Credit changed while this conversion was being processed. Please refresh and try again." });
    }
    let fxRoundingAdjustmentSettlementId: number | null = null;
    if (quote.fxRoundingAdjustmentAmount.gt(0)) {
      const [adjustmentResult] = await tx.insert(invoiceSettlements).values({
        patientId: input.patientId,
        invoiceId: input.invoiceId,
        financialScope: quote.scope,
        currency: quote.targetCurrency as any,
        amount: quote.fxRoundingAdjustmentAmount.toFixed(2) as any,
        sourceType: "fx_rounding_adjustment",
        creditTransactionId: appliedCreditTransactionIds[0] ?? null,
        patientCreditApplicationId: applicationId,
        sourceCreditCurrency: input.sourceCurrency as any,
        sourceCreditAmount: quote.requested.toFixed(2) as any,
        creditConversionRateToInvoice: quote.conversionRate.toFixed(12) as any,
        creditFxEffectiveAt: quote.fxEffectiveAt,
        creditFxSource: "approved_exchange_rate",
        fxRoundingReason: "Cross-currency Patient Credit precision residual",
        fxRoundingSourceMinorUnit: quote.sourceMinorUnit.toFixed(2) as any,
        recordedById: input.recordedById ?? 0,
      } as any);
      fxRoundingAdjustmentSettlementId = (adjustmentResult as any).insertId as number;
    }
    await recalcInvoicePaidAmountWithDb(tx, input.invoiceId);
    const [updated] = await tx.select({ paidAmount: invoices.paidAmount, status: invoices.status }).from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
    return {
      success: true,
      appliedCreditTransactionIds,
      applicationId,
      sourceAmount: quote.requested.toFixed(2),
      sourceCurrency: input.sourceCurrency,
      // This is the final invoice settlement, not merely the converted-credit row.
      targetAmount: finalTargetAmount.toFixed(2),
      creditSettlementAmount: convertedTotal.toFixed(2),
      fxRoundingAdjustmentAmount: quote.fxRoundingAdjustmentAmount.toFixed(2),
      finalTargetAmount: finalTargetAmount.toFixed(2),
      fxRoundingAdjustmentSettlementId,
      targetCurrency: quote.targetCurrency,
      conversionRate: quote.conversionRate.toFixed(12),
      fxEffectiveAt: quote.fxEffectiveAt,
      newPaid: Number(updated?.paidAmount ?? 0),
      newStatus: updated?.status,
    };
  });
}

/** List only durable, currently reversible Patient Credit applications for one invoice. */
export async function getReversiblePatientCreditApplications(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: patientCreditApplications.id,
    patientId: patientCreditApplications.patientId,
    invoiceId: patientCreditApplications.invoiceId,
    financialScope: patientCreditApplications.financialScope,
    sourceCurrency: patientCreditApplications.sourceCurrency,
    sourceCreditAmount: patientCreditApplications.sourceCreditAmount,
    targetInvoiceCurrency: patientCreditApplications.targetInvoiceCurrency,
    finalSettlementAmount: patientCreditApplications.finalSettlementAmount,
    fxRoundingAdjustmentAmount: patientCreditApplications.fxRoundingAdjustmentAmount,
    createdAt: patientCreditApplications.createdAt,
  }).from(patientCreditApplications).where(and(
    eq(patientCreditApplications.invoiceId, invoiceId),
    eq(patientCreditApplications.status, "active"),
  )).orderBy(desc(patientCreditApplications.createdAt));
}

export async function getReversiblePatientCreditApplicationsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: patientCreditApplications.id,
    patientId: patientCreditApplications.patientId,
    invoiceId: patientCreditApplications.invoiceId,
    financialScope: patientCreditApplications.financialScope,
    sourceCurrency: patientCreditApplications.sourceCurrency,
    sourceCreditAmount: patientCreditApplications.sourceCreditAmount,
    targetInvoiceCurrency: patientCreditApplications.targetInvoiceCurrency,
    finalSettlementAmount: patientCreditApplications.finalSettlementAmount,
    fxRoundingAdjustmentAmount: patientCreditApplications.fxRoundingAdjustmentAmount,
    createdAt: patientCreditApplications.createdAt,
  }).from(patientCreditApplications).where(and(
    eq(patientCreditApplications.patientId, patientId),
    eq(patientCreditApplications.status, "active"),
  )).orderBy(desc(patientCreditApplications.createdAt));
}

export async function getPatientCreditApplicationHistory(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  const [applications, reversals] = await Promise.all([
    db.select().from(patientCreditApplications)
      .where(eq(patientCreditApplications.patientId, patientId))
      .orderBy(desc(patientCreditApplications.createdAt)),
    db.select().from(patientCreditApplicationReversals)
      .where(eq(patientCreditApplicationReversals.patientId, patientId))
      .orderBy(desc(patientCreditApplicationReversals.createdAt)),
  ]);
  const reversalByApplication = new Map(reversals.map((row: any) => [Number(row.applicationId), row]));
  return applications.map((application: any) => ({ ...application, reversal: reversalByApplication.get(Number(application.id)) ?? null }));
}

/** Reverse a complete durable Patient Credit application. Partial reversal is intentionally out of scope. */
export async function reversePatientCreditApplication(input: {
  patientId: number;
  invoiceId: number;
  applicationId: number;
  idempotencyKey: string;
  reason?: string;
  recordedById: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const reason = input.reason?.trim() || null;
  if (reason != null && reason.length > 500) throw new TRPCError({ code: "BAD_REQUEST", message: "Reversal reason must be 500 characters or fewer." });

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM invoices WHERE id = ${input.invoiceId} FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM patient_credit_applications WHERE id = ${input.applicationId} FOR UPDATE`);
    const [application] = await tx.select().from(patientCreditApplications).where(eq(patientCreditApplications.id, input.applicationId)).limit(1);
    if (!application || application.invoiceId !== input.invoiceId || application.patientId !== input.patientId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "The selected Patient Credit application is not available for this invoice." });
    }
    if (application.status !== "active") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This Patient Credit application has already been reversed." });
    }
    const [invoice] = await tx.select({ patientId: invoices.patientId, financialScope: invoices.financialScope })
      .from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
    if (!invoice || invoice.patientId !== input.patientId || String(invoice.financialScope ?? "production") !== String(application.financialScope)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Patient Credit reversal does not match this invoice's patient or financial scope." });
    }
    const [sameRequest] = await tx.select().from(patientCreditApplicationReversals)
      .where(eq(patientCreditApplicationReversals.idempotencyKey, input.idempotencyKey)).limit(1);
    let idempotencyDecision;
    try {
      idempotencyDecision = resolveCreditOperationIdempotency(sameRequest, { patientId: input.patientId, financialScope: application.financialScope, applicationId: input.applicationId });
    } catch (error) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Invalid reversal request key." });
    }
    if (idempotencyDecision.kind === "replay") {
      const prior = idempotencyDecision.record;
      const [currentInvoice] = await tx.select({ paidAmount: invoices.paidAmount, status: invoices.status })
        .from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
      return {
        success: true, idempotent: true, reversalId: prior.id,
        restoredSourceAmount: String(prior.restoredSourceAmount), sourceCurrency: application.sourceCurrency,
        reopenedInvoiceAmount: new Decimal(String(application.finalSettlementAmount)).toFixed(2), invoiceCurrency: application.targetInvoiceCurrency,
        reversedFxRoundingAdjustmentAmount: String(prior.reversedFxRoundingAdjustmentAmount),
        newPaid: Number(currentInvoice?.paidAmount ?? 0), newStatus: currentInvoice?.status,
      };
    }
    const existingReversals = await tx.select({ id: patientCreditApplicationReversals.id })
      .from(patientCreditApplicationReversals).where(eq(patientCreditApplicationReversals.applicationId, input.applicationId)).limit(1);
    if (existingReversals.length > 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This Patient Credit application has already been reversed." });

    const allocations = await tx.select().from(patientCreditApplicationAllocations)
      .where(eq(patientCreditApplicationAllocations.applicationId, input.applicationId))
      .orderBy(asc(patientCreditApplicationAllocations.id));
    if (allocations.length === 0) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This historical Patient Credit application has no reversible allocation record." });
    }
    const allocationSettlementIds = allocations.map((row: any) => Number(row.creditSettlementId));
    const creditSettlements = await tx.select().from(invoiceSettlements).where(and(
      eq(invoiceSettlements.patientCreditApplicationId, input.applicationId),
      eq(invoiceSettlements.sourceType, "credit"),
      eq(invoiceSettlements.status, "active"),
    ));
    if (creditSettlements.length !== allocationSettlementIds.length || creditSettlements.some((row: any) => !allocationSettlementIds.includes(Number(row.id)))) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The linked Patient Credit settlements are no longer reversible. Financial review is required." });
    }
    const fxAdjustments = await tx.select().from(invoiceSettlements).where(and(
      eq(invoiceSettlements.patientCreditApplicationId, input.applicationId),
      eq(invoiceSettlements.sourceType, "fx_rounding_adjustment"),
      eq(invoiceSettlements.status, "active"),
    ));
    const expectedFxAdjustment = new Decimal(String(application.fxRoundingAdjustmentAmount ?? "0"));
    const actualFxAdjustment = fxAdjustments.reduce((sum: Decimal, row: any) => sum.plus(String(row.amount)), new Decimal(0));
    if (!actualFxAdjustment.eq(expectedFxAdjustment)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The linked FX rounding adjustment is inconsistent. Financial review is required." });
    }

    let restoredSourceAmount = new Decimal(0);
    let reversedCreditSettlementAmount = new Decimal(0);
    for (const allocation of allocations) {
      const [originalDebit] = await tx.select().from(creditTransactions)
        .where(eq(creditTransactions.id, allocation.creditDebitTransactionId)).limit(1);
      if (!originalDebit || originalDebit.type !== "applied_to_invoice" || Number(originalDebit.sourceCreditTransactionId) !== Number(allocation.sourceCreditTransactionId)) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A linked Patient Credit debit is inconsistent. Financial review is required." });
      }
      const nativeAmount = new Decimal(String(allocation.nativeSourceAmount));
      const [reversalDebit] = await tx.insert(creditTransactions).values({
        patientId: input.patientId,
        financialScope: application.financialScope,
        currency: application.sourceCurrency as any,
        amount: nativeAmount.toFixed(2) as any,
        type: "applied_credit_reversal",
        invoiceId: input.invoiceId,
        originPaymentId: originalDebit.originPaymentId,
        originInvoiceId: originalDebit.originInvoiceId,
        originPaymentMethod: originalDebit.originPaymentMethod,
        sourceCreditTransactionId: allocation.sourceCreditTransactionId,
        patientCreditApplicationId: input.applicationId,
        targetInvoiceCurrency: application.targetInvoiceCurrency as any,
        targetSettlementAmount: allocation.targetSettlementAmount,
        creditConversionRateToInvoice: application.conversionRateToInvoice,
        creditFxEffectiveAt: application.fxEffectiveAt,
        creditFxSource: application.fxSource,
        recordedById: input.recordedById,
        notes: `Applied Credit Reversed${reason ? `: ${reason}` : "."}`,
      } as any);
      const reversalCreditTransactionId = (reversalDebit as any).insertId as number;
      await tx.update(patientCreditApplicationAllocations)
        .set({ reversalCreditTransactionId } as any)
        .where(eq(patientCreditApplicationAllocations.id, allocation.id));
      restoredSourceAmount = restoredSourceAmount.plus(nativeAmount);
      reversedCreditSettlementAmount = reversedCreditSettlementAmount.plus(String(allocation.targetSettlementAmount));
    }

    const voidedAt = new Date();
    await tx.update(invoiceSettlements).set({
      status: "voided", voidedAt, voidedById: input.recordedById,
      voidReason: `Applied Credit Reversed${reason ? `: ${reason}` : ""}`,
    } as any).where(and(
      eq(invoiceSettlements.patientCreditApplicationId, input.applicationId),
      eq(invoiceSettlements.status, "active"),
    ));
    const [reversalResult] = await tx.insert(patientCreditApplicationReversals).values({
      applicationId: input.applicationId,
      patientId: input.patientId,
      invoiceId: input.invoiceId,
      financialScope: application.financialScope,
      restoredSourceAmount: restoredSourceAmount.toFixed(2) as any,
      reversedCreditSettlementAmount: reversedCreditSettlementAmount.toFixed(2) as any,
      reversedFxRoundingAdjustmentAmount: actualFxAdjustment.toFixed(2) as any,
      reason,
      idempotencyKey: input.idempotencyKey,
      recordedById: input.recordedById,
    } as any);
    const reversalId = (reversalResult as any).insertId as number;
    await tx.update(patientCreditApplications).set({
      status: "reversed", reversalReason: reason, reversedAt: voidedAt, reversedById: input.recordedById,
    } as any).where(eq(patientCreditApplications.id, input.applicationId));
    await recalcInvoicePaidAmountWithDb(tx, input.invoiceId);
    const [updated] = await tx.select({ paidAmount: invoices.paidAmount, status: invoices.status })
      .from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
    return {
      success: true,
      reversalId,
      restoredSourceAmount: restoredSourceAmount.toFixed(2),
      sourceCurrency: application.sourceCurrency,
      reopenedInvoiceAmount: new Decimal(String(application.finalSettlementAmount)).toFixed(2),
      invoiceCurrency: application.targetInvoiceCurrency,
      reversedFxRoundingAdjustmentAmount: actualFxAdjustment.toFixed(2),
      newPaid: Number(updated?.paidAmount ?? 0),
      newStatus: updated?.status,
    };
  });
}

type PatientCreditPayoutInput = {
  patientId: number;
  financialScope: FinancialScope;
  sourceCurrency: CreditCurrency;
  sourceAmount: number;
  payoutCurrency: CreditCurrency;
  method: "cash" | "bank_transfer";
  payoutDate?: Date;
  reference?: string;
  notes?: string;
  idempotencyKey: string;
  recordedById?: number;
};

function payoutTimestamp(value?: Date) {
  return paymentReceivedAt(value);
}

async function getPatientCreditPayoutQuoteWithDb(db: any, input: Omit<PatientCreditPayoutInput, "recordedById" | "idempotencyKey">) {
  const sourceAmount = quantizeFinanceMoney(input.sourceAmount);
  if (!sourceAmount.isFinite() || sourceAmount.lte(0)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Patient Credit payout amount must be greater than zero." });
  }
  const payoutDate = payoutTimestamp(input.payoutDate);
  const credits = await db.select().from(creditTransactions).where(and(
    eq(creditTransactions.patientId, input.patientId),
    eq(creditTransactions.currency, input.sourceCurrency as any),
    eq(creditTransactions.financialScope, input.financialScope),
  )).orderBy(asc(creditTransactions.createdAt), asc(creditTransactions.id));
  const availability = getCreditAvailabilityBySource(credits);
  if (sourceAmount.gt(availability.available.plus("0.005"))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Payout cannot exceed available ${input.sourceCurrency} Patient Credit (${availability.available.toFixed(2)}).` });
  }
  if (input.method !== "cash" && input.method !== "bank_transfer") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Patient Credit Payout supports Cash or Bank Transfer only. Card reversal is not available." });
  }
  if (input.payoutCurrency === input.sourceCurrency) {
    return {
      sourceAmount, payoutAmount: sourceAmount, conversionRate: null as Decimal | null,
      fxEffectiveAt: null as Date | null, originCredits: availability.originCredits, debitsBySource: availability.debitsBySource,
      sourceAvailable: availability.available, payoutDate,
    };
  }
  const [sourceRate, payoutRate] = await Promise.all([
    resolveApprovedPaymentExchangeRate(input.sourceCurrency, payoutDate),
    resolveApprovedPaymentExchangeRate(input.payoutCurrency, payoutDate),
  ]);
  const conversionRate = new Decimal(String(sourceRate.rate)).div(String(payoutRate.rate));
  const payoutAmount = quantizeFinanceMoney(sourceAmount.mul(conversionRate));
  return {
    sourceAmount, payoutAmount, conversionRate,
    fxEffectiveAt: new Date(Math.max(sourceRate.fxEffectiveAt.getTime(), payoutRate.fxEffectiveAt.getTime())),
    originCredits: availability.originCredits, debitsBySource: availability.debitsBySource,
    sourceAvailable: availability.available, payoutDate,
  };
}

export async function quotePatientCreditPayout(input: Omit<PatientCreditPayoutInput, "recordedById" | "idempotencyKey">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const quote = await getPatientCreditPayoutQuoteWithDb(db, input);
  return {
    sourceCurrency: input.sourceCurrency,
    sourceAmount: quote.sourceAmount.toFixed(2),
    sourceAvailable: quote.sourceAvailable.toFixed(2),
    payoutCurrency: input.payoutCurrency,
    payoutAmount: quote.payoutAmount.toFixed(2),
    conversionRateToPayout: quote.conversionRate?.toFixed(12) ?? null,
    fxEffectiveAt: quote.fxEffectiveAt,
    fxSource: quote.conversionRate ? "approved_exchange_rate" : null,
    method: input.method,
    payoutDate: quote.payoutDate,
  };
}

/** Record a manual Cash/Bank native-credit payout; never creates payment, refund, or settlement rows. */
export async function createPatientCreditPayout(input: PatientCreditPayoutInput) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const reference = input.reference?.trim() || null;
  const notes = input.notes?.trim() || null;
  if (reference != null && reference.length > 256) throw new TRPCError({ code: "BAD_REQUEST", message: "Payout reference must be 256 characters or fewer." });
  if (notes != null && notes.length > 1000) throw new TRPCError({ code: "BAD_REQUEST", message: "Payout notes must be 1000 characters or fewer." });
  return db.transaction(async (tx) => {
    const [sameRequest] = await tx.select().from(patientCreditPayouts)
      .where(eq(patientCreditPayouts.idempotencyKey, input.idempotencyKey)).limit(1);
    let idempotencyDecision;
    try {
      idempotencyDecision = resolveCreditOperationIdempotency(sameRequest, { patientId: input.patientId, financialScope: input.financialScope });
    } catch (error) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Invalid payout request key." });
    }
    if (idempotencyDecision.kind === "replay") {
      const prior = idempotencyDecision.record;
      return {
        success: true, idempotent: true, payoutId: prior.id,
        sourceCurrency: prior.sourceCurrency, sourceAmount: String(prior.sourceCreditAmount),
        payoutCurrency: prior.payoutCurrency, payoutAmount: String(prior.payoutAmount),
        conversionRateToPayout: prior.conversionRateToPayout == null ? null : String(prior.conversionRateToPayout),
        fxEffectiveAt: prior.fxEffectiveAt,
      };
    }
    await tx.execute(sql`SELECT id FROM credit_transactions WHERE patientId = ${input.patientId} AND currency = ${input.sourceCurrency} AND financialScope = ${input.financialScope} FOR UPDATE`);
    const quote = await getPatientCreditPayoutQuoteWithDb(tx, input);
    const [payoutResult] = await tx.insert(patientCreditPayouts).values({
      patientId: input.patientId,
      financialScope: input.financialScope,
      sourceCurrency: input.sourceCurrency as any,
      sourceCreditAmount: quote.sourceAmount.toFixed(2) as any,
      payoutCurrency: input.payoutCurrency as any,
      payoutAmount: quote.payoutAmount.toFixed(2) as any,
      conversionRateToPayout: quote.conversionRate?.toFixed(12) as any ?? null,
      fxEffectiveAt: quote.fxEffectiveAt,
      fxSource: quote.conversionRate ? "approved_exchange_rate" : null,
      method: input.method,
      payoutDate: quote.payoutDate,
      reference,
      notes,
      idempotencyKey: input.idempotencyKey,
      recordedById: input.recordedById ?? 0,
    } as any);
    const payoutId = (payoutResult as any).insertId as number;
    let remainingNative = quote.sourceAmount;
    for (const origin of quote.originCredits) {
      const originAvailable = new Decimal(String(origin.amount)).plus(quote.debitsBySource.get(origin.id) ?? new Decimal(0));
      const consumed = Decimal.min(originAvailable, remainingNative).toDecimalPlaces(2, Decimal.ROUND_DOWN);
      if (consumed.lte(0)) continue;
      const [debitResult] = await tx.insert(creditTransactions).values({
        patientId: input.patientId,
        financialScope: input.financialScope,
        currency: input.sourceCurrency as any,
        amount: consumed.negated().toFixed(2) as any,
        type: "credit_payout",
        originPaymentId: origin.originPaymentId,
        originInvoiceId: origin.originInvoiceId,
        originPaymentMethod: origin.originPaymentMethod,
        sourceCreditTransactionId: origin.id,
        patientCreditPayoutId: payoutId,
        recordedById: input.recordedById ?? 0,
        notes: `Patient Credit Payout: ${consumed.toFixed(2)} ${input.sourceCurrency} → ${quote.payoutAmount.toFixed(2)} ${input.payoutCurrency} via ${input.method}.${reference ? ` Ref: ${reference}.` : ""}`,
      } as any);
      const creditDebitTransactionId = (debitResult as any).insertId as number;
      await tx.insert(patientCreditPayoutAllocations).values({
        payoutId,
        sourceCreditTransactionId: origin.id,
        creditDebitTransactionId,
        nativeSourceAmount: consumed.toFixed(2) as any,
      } as any);
      remainingNative = remainingNative.minus(consumed);
      if (remainingNative.lte(0)) break;
    }
    if (remainingNative.gt("0.005")) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Patient Credit changed while this payout was being processed. Please refresh and try again." });
    }
    return {
      success: true,
      payoutId,
      sourceCurrency: input.sourceCurrency,
      sourceAmount: quote.sourceAmount.toFixed(2),
      payoutCurrency: input.payoutCurrency,
      payoutAmount: quote.payoutAmount.toFixed(2),
      conversionRateToPayout: quote.conversionRate?.toFixed(12) ?? null,
      fxEffectiveAt: quote.fxEffectiveAt,
    };
  });
}

export async function getPatientCreditPayouts(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(patientCreditPayouts)
    .where(eq(patientCreditPayouts.patientId, patientId))
    .orderBy(desc(patientCreditPayouts.createdAt));
}

export async function getPatientCreditPayoutReceipt(payoutId: number) {
  const db = await getDb();
  if (!db) return null;
  const [receipt] = await db.select({
    payout: patientCreditPayouts,
    patient: {
      id: patients.id,
      firstName: patients.firstName,
      middleName: patients.middleName,
      lastName: patients.lastName,
      mrn: patients.mrn,
    },
  }).from(patientCreditPayouts)
    .innerJoin(patients, eq(patientCreditPayouts.patientId, patients.id))
    .where(eq(patientCreditPayouts.id, payoutId))
    .limit(1);
  return receipt ?? null;
}

/** Get all refunds for a patient */
export async function getRefunds(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(refunds)
    .where(eq(refunds.patientId, patientId))
    .orderBy(desc(refunds.createdAt));
}

/** Create a refund record tied to an invoice */
export async function createRefund(data: {
  patientId: number;
  invoiceId: number;
  amount: number;
  currency: CreditCurrency;
  method: "cash" | "bank_transfer" | "card_reversal" | "other";
  refundDate?: Date;
  notes?: string;
  recordedById?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM invoices WHERE id = ${data.invoiceId} FOR UPDATE`);
    const [invoice] = await tx.select({ patientId: invoices.patientId, currency: invoices.currency, financialScope: invoices.financialScope })
      .from(invoices).where(eq(invoices.id, data.invoiceId)).limit(1);
    if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
    if (invoice.patientId !== data.patientId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Refund patient does not match the invoice owner. Cannot issue a refund for a different patient.",
      });
    }

    const entered = new Decimal(String(data.amount));
    if (!entered.isFinite() || entered.lte(0)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Refund amount must be greater than zero." });
    }
    const refundDate = paymentReceivedAt(data.refundDate);
    const invoiceCurrency = String(invoice.currency ?? "TRY");
    const [refundRate, invoiceRate] = await Promise.all([
      resolveApprovedPaymentExchangeRate(data.currency, refundDate),
      resolveApprovedPaymentExchangeRate(invoiceCurrency, refundDate),
    ]);
    const fx = computePaymentFxSnapshots({
      amount: entered.toFixed(2),
      paymentCurrency: data.currency,
      invoiceCurrency,
      paymentToTryRate: refundRate.rate,
      invoiceToTryRate: invoiceRate.rate,
    });
    const refundInInvoiceCurrency = new Decimal(fx.amountInInvoiceCurrency);
    const financialSummary = await getInvoiceFinancialSummaryWithDb(tx, data.invoiceId);
    if (!financialSummary) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
    if (refundInInvoiceCurrency.gt(financialSummary.maxRefundable.plus("0.005"))) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Refund amount (${invoiceCurrency} ${refundInInvoiceCurrency.toFixed(2)}) exceeds the currently refundable external receipts (${invoiceCurrency} ${financialSummary.maxRefundable.toFixed(2)}).`,
      });
    }

    const [result] = await tx.insert(refunds).values({
      patientId: data.patientId,
      invoiceId: data.invoiceId,
      amount: entered.toFixed(2) as any,
      currency: data.currency,
      amountInInvoiceCurrency: refundInInvoiceCurrency.toFixed(2) as any,
      conversionRateToInvoice: fx.conversionRateToInvoice as any,
      fxEffectiveAt: invoiceRate.fxEffectiveAt,
      method: data.method,
      financialScope: invoice.financialScope ?? "production",
      refundDate,
      notes: data.notes ?? null,
      recordedById: data.recordedById ?? null,
    } as any);

    // Preserve the existing TRY credit-deduction behavior, but use the same
    // approved refund-date snapshot rather than a live-rate recomputation.
    const refundInTRY = quantizeFinanceMoney(entered.mul(refundRate.rate));
    const tryBalance = await getPatientCreditBalance(data.patientId, "TRY");
    if (tryBalance > 0) {
      const deductionTRY = Decimal.min(refundInTRY, new Decimal(String(tryBalance)));
      await addCreditTransaction({
        patientId: data.patientId,
        currency: "TRY" as any,
        amount: deductionTRY.negated().toNumber(),
        type: "refund_deduction",
        invoiceId: data.invoiceId,
        notes: `Deducted TRY ${deductionTRY.toFixed(2)} for ${data.currency} ${entered.toFixed(2)} refund.`,
        recordedById: data.recordedById,
      });
    }

    await recalcInvoicePaidAmountWithDb(tx, data.invoiceId);
    return { id: (result as any).insertId as number };
  });
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function createTask(data: InsertTask) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(tasks).values(data);
  return { id: (result as any).insertId as number };
}

export async function getTasks(filters?: {
  leadId?: number;
  patientId?: number;
  assignedToId?: number;
  status?: string;
  type?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  /** When set, restricts results to tasks created by OR assigned to this user (doctor scoping) */
  scopedToUserId?: number;
  page?: number;
  pageSize?: number;
}): Promise<{ data: any[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const db = await getDb();
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  if (!db) return { data: [], total: 0, page, pageSize, totalPages: 0 };
  const conditions: any[] = [];
  if (filters?.leadId) conditions.push(eq(tasks.leadId, filters.leadId));
  if (filters?.patientId) conditions.push(eq(tasks.patientId, filters.patientId));
  if (filters?.assignedToId) conditions.push(eq(tasks.assignedToId, filters.assignedToId));
  if (filters?.status) conditions.push(eq(tasks.status, filters.status as any));
  if (filters?.type) conditions.push(eq(tasks.type, filters.type as any));
  if (filters?.dueDateFrom) conditions.push(gte(tasks.dueDate, filters.dueDateFrom));
  if (filters?.dueDateTo) conditions.push(lte(tasks.dueDate, filters.dueDateTo));
  // Doctor scoping: only tasks created by or assigned to this user
  if (filters?.scopedToUserId) {
    conditions.push(
      or(
        eq(tasks.createdById, filters.scopedToUserId),
        eq(tasks.assignedToId, filters.scopedToUserId)
      )
    );
  }
  const assignedUsers = aliasedTable(users, 'taskAssignedUser');
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const [countResult, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(tasks).where(whereClause),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        type: tasks.type,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        dueTime: tasks.dueTime,
        communicationMethod: tasks.communicationMethod,
        notes: tasks.notes,
        leadId: tasks.leadId,
        patientId: tasks.patientId,
        assignedToId: tasks.assignedToId,
        createdById: tasks.createdById,
        closedAt: tasks.closedAt,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        tags: tasks.tags,
        assignedToName: assignedUsers.name,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
        patientFirstName: patients.firstName,
        patientLastName: patients.lastName,
      })
      .from(tasks)
      .leftJoin(assignedUsers, eq(tasks.assignedToId, assignedUsers.id))
      .leftJoin(leads, eq(tasks.leadId, leads.id))
      .leftJoin(patients, eq(tasks.patientId, patients.id))
      .where(whereClause)
      .orderBy(tasks.dueDate, tasks.dueTime, desc(tasks.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);
  const total = Number(countResult[0]?.count ?? 0);
  return { data: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getTaskById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateTask(id: number, data: Partial<InsertTask>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(tasks).set(data).where(eq(tasks.id, id));
}

export async function closeTask(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(tasks).set({ status: "done", closedAt: new Date() }).where(eq(tasks.id, id));
}

export async function deleteTask(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(tasks).where(eq(tasks.id, id));
}

// ─── Task Tags ────────────────────────────────────────────────────────────────
export async function getAllTaskTags(): Promise<TaskTag[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(taskTags).orderBy(taskTags.name);
}

export async function createTaskTag(data: { name: string; color?: string; createdByUserId?: number }): Promise<TaskTag | null> {
  const db = await getDb();
  if (!db) return null;
  await db.insert(taskTags).values({
    name: data.name.trim(),
    color: data.color ?? "#6366f1",
    createdByUserId: data.createdByUserId ?? null,
  });
  const rows = await db.select().from(taskTags).where(eq(taskTags.name, data.name.trim())).limit(1);
  return rows[0] ?? null;
}

export async function updateTaskTag(id: number, data: { name?: string; color?: string }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(taskTags).set({
    ...(data.name !== undefined ? { name: data.name.trim() } : {}),
    ...(data.color !== undefined ? { color: data.color } : {}),
  }).where(eq(taskTags.id, id));
}

export async function deleteTaskTag(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(taskTags).where(eq(taskTags.id, id));
}

// ─── Bulk helpers ─────────────────────────────────────────────────────────────
export async function bulkUpdateLeads(ids: number[], data: Partial<InsertLead>): Promise<void> {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  await db.update(leads).set({ ...data, modifiedAt: new Date() } as any).where(inArray(leads.id, ids));
}

export async function bulkDeleteLeads(ids: number[]): Promise<void> {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  // Delete translation rows linked to documents of these leads
  const bulkDocs = await db
    .select({ id: leadDocuments.id })
    .from(leadDocuments)
    .where(inArray(leadDocuments.leadId, ids));
  if (bulkDocs.length > 0) {
    const bulkDocIds = bulkDocs.map((d) => d.id);
    await db.delete(documentTranslations).where(inArray(documentTranslations.leadDocumentId, bulkDocIds));
  }
  await db.delete(leadCommunications).where(inArray(leadCommunications.leadId, ids));
  await db.delete(leadDocuments).where(inArray(leadDocuments.leadId, ids));
  await db.delete(medicalIntake).where(inArray(medicalIntake.leadId, ids));
  await db.delete(leads).where(inArray(leads.id, ids));
}

export async function bulkUpdateTasks(ids: number[], data: Partial<InsertTask>): Promise<void> {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  await db.update(tasks).set(data).where(inArray(tasks.id, ids));
}

export async function bulkDeleteTasks(ids: number[]): Promise<void> {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  await db.delete(tasks).where(inArray(tasks.id, ids));
}

// ─── Patient Doctors (many-to-many) ──────────────────────────────────────────

export async function getPatientDoctors(patientId: number): Promise<PatientDoctor[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(patientDoctors).where(eq(patientDoctors.patientId, patientId));
}

/** Replace all doctor assignments for a patient with the given list. */
export async function setPatientDoctors(
  patientId: number,
  doctorIds: number[],
  assignedBy?: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Delete existing
  await db.delete(patientDoctors).where(eq(patientDoctors.patientId, patientId));
  if (doctorIds.length === 0) return;
  // Insert new
  const rows: InsertPatientDoctor[] = doctorIds.map((doctorId, idx) => ({
    patientId,
    doctorId,
    isPrimary: idx === 0, // first in list is primary
    assignedBy: assignedBy ?? null,
  }));
  await db.insert(patientDoctors).values(rows);
}

// ─── Reference Data (centralized master data: languages, countries, cities, nationalities) ─────
export async function getReferenceData(type?: "language" | "country" | "city" | "nationality"): Promise<ReferenceData[]> {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(referenceData).orderBy(referenceData.sortOrder, referenceData.label);
  if (type) {
    return db.select().from(referenceData).where(eq(referenceData.type, type)).orderBy(referenceData.sortOrder, referenceData.label);
  }
  return query;
}

export async function upsertReferenceData(data: {
  id?: number;
  type: "language" | "country" | "city" | "nationality";
  code: string;
  label: string;
  labelAr?: string;
  labelTr?: string;
  sortOrder?: number;
  isActive?: boolean;
}): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) return { success: false };
  if (data.id) {
    await db.update(referenceData).set({
      type: data.type,
      code: data.code,
      label: data.label,
      labelAr: data.labelAr ?? null,
      labelTr: data.labelTr ?? null,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    }).where(eq(referenceData.id, data.id));
  } else {
    await db.insert(referenceData).values({
      type: data.type,
      code: data.code,
      label: data.label,
      labelAr: data.labelAr ?? null,
      labelTr: data.labelTr ?? null,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    });
  }
  return { success: true };
}

export async function deleteReferenceData(id: number): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) return { success: false };
  await db.delete(referenceData).where(eq(referenceData.id, id));
  return { success: true };
}

// ─── Case Comments ────────────────────────────────────────────────────────────

export async function listCaseComments(opts: {
  leadId?: number;
  patientId?: number;
  viewerRole?: string; // used to filter by visibility
}): Promise<(CaseComment & { authorName: string; authorRole: string })[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [];
  if (opts.leadId) conditions.push(eq(caseComments.leadId, opts.leadId));
  if (opts.patientId) conditions.push(eq(caseComments.patientId, opts.patientId));

  // Visibility filter: doctors only see 'all' and 'doctor_only'; staff see 'all' and 'staff_only'
  if (opts.viewerRole === "doctor") {
    const { inArray } = await import("drizzle-orm");
    conditions.push(inArray(caseComments.visibility, ["all", "doctor_only"]));
  } else if (opts.viewerRole === "staff") {
    const { inArray } = await import("drizzle-orm");
    conditions.push(inArray(caseComments.visibility, ["all", "staff_only"]));
  }
  // admin/manager see everything — no filter

  const rows = await db
    .select({
      id: caseComments.id,
      leadId: caseComments.leadId,
      patientId: caseComments.patientId,
      authorId: caseComments.authorId,
      content: caseComments.content,
      isSystemEvent: caseComments.isSystemEvent,
      visibility: caseComments.visibility,
      createdAt: caseComments.createdAt,
      authorName: users.name,
      authorRole: users.role,
    })
    .from(caseComments)
    .leftJoin(users, eq(caseComments.authorId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(caseComments.createdAt);

  return rows.map((r) => ({
    ...r,
    authorName: r.authorName ?? "Unknown",
    authorRole: r.authorRole ?? "staff",
  }));
}

export async function createCaseComment(data: {
  leadId?: number;
  patientId?: number;
  authorId: number;
  content: string;
  isSystemEvent?: boolean;
  visibility?: "all" | "doctor_only" | "staff_only";
}): Promise<CaseComment> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(caseComments).values({
    leadId: data.leadId ?? null,
    patientId: data.patientId ?? null,
    authorId: data.authorId,
    content: data.content,
    isSystemEvent: data.isSystemEvent ?? false,
    visibility: data.visibility ?? "all",
  });

  const result = await db
    .select()
    .from(caseComments)
    .where(
      and(
        data.leadId ? eq(caseComments.leadId, data.leadId) : eq(caseComments.patientId, data.patientId!),
        eq(caseComments.authorId, data.authorId)
      )
    )
    .orderBy(desc(caseComments.createdAt))
    .limit(1);

  return result[0];
}

export async function deleteCaseComment(id: number, requesterId: number, requesterRole: string): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) return { success: false };

  const existing = await db.select().from(caseComments).where(eq(caseComments.id, id)).limit(1);
  if (!existing[0]) return { success: false };

  // Only the author or admin/manager can delete
  const isOwner = existing[0].authorId === requesterId;
  const isAdmin = requesterRole === "admin" || requesterRole === "manager";
  if (!isOwner && !isAdmin) throw new Error("Not authorized to delete this comment");

  await db.delete(caseComments).where(eq(caseComments.id, id));
  return { success: true };
}

// ─── Doctor Cases (cases assigned to a specific doctor) ──────────────────────

export async function listDoctorCases(doctorId: number): Promise<{
  leads: { id: number; firstName: string; lastName: string; code: string | null; leadStatus: string; assignedDoctorId: number | null; createdAt: Date }[];
  patients: { id: number; firstName: string; lastName: string; mrn: string; assignedDoctorId: number | null; createdAt: Date }[];
}> {
  const db = await getDb();
  if (!db) return { leads: [], patients: [] };

  const [assignedLeads, assignedPatients] = await Promise.all([
    db
      .select({
        id: leads.id,
        firstName: leads.firstName,
        lastName: leads.lastName,
        code: leads.code,
        leadStatus: leads.leadStatus,
        assignedDoctorId: leads.assignedDoctorId,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(eq(leads.assignedDoctorId, doctorId))
      .orderBy(desc(leads.createdAt)),
    db
      .select({
        id: patients.id,
        firstName: patients.firstName,
        lastName: patients.lastName,
        mrn: patients.mrn,
        assignedDoctorId: patients.assignedDoctorId,
        createdAt: patients.createdAt,
      })
      .from(patients)
      .where(eq(patients.assignedDoctorId, doctorId))
      .orderBy(desc(patients.createdAt)),
  ]);

  return { leads: assignedLeads, patients: assignedPatients };
}

// ─── Treatment Plans ──────────────────────────────────────────────────────────

export async function upsertTreatmentPlan(data: InsertTreatmentPlan) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Check if a plan already exists for this lead/patient
  const conditions = data.leadId
    ? eq(treatmentPlans.leadId, data.leadId)
    : eq(treatmentPlans.patientId, data.patientId!);
  const existing = await db.select().from(treatmentPlans).where(conditions).limit(1);
  if (existing[0]) {
    await db.update(treatmentPlans).set({ ...data, updatedAt: new Date() }).where(eq(treatmentPlans.id, existing[0].id));
    return existing[0].id;
  } else {
    const result = await db.insert(treatmentPlans).values(data);
    return (result[0] as any).insertId as number;
  }
}

export async function getTreatmentPlanByCase(opts: { leadId?: number; patientId?: number }) {
  const db = await getDb();
  if (!db) return null;
  const condition = opts.leadId
    ? eq(treatmentPlans.leadId, opts.leadId)
    : eq(treatmentPlans.patientId, opts.patientId!);
  const result = await db.select().from(treatmentPlans).where(condition).limit(1);
  return result[0] ?? null;
}

export async function getTreatmentPlanById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(treatmentPlans).where(eq(treatmentPlans.id, id)).limit(1);
  return result[0] ?? null;
}

// ─── Treatment Plan Scenarios ─────────────────────────────────────────────────

export async function listScenariosByPlan(treatmentPlanId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(treatmentPlanScenarios)
    .where(eq(treatmentPlanScenarios.treatmentPlanId, treatmentPlanId))
    .orderBy(treatmentPlanScenarios.sortOrder);
}

export async function createScenario(data: InsertTreatmentPlanScenario) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(treatmentPlanScenarios).values(data);
  return (result[0] as any).insertId as number;
}

export async function updateScenario(id: number, data: Partial<InsertTreatmentPlanScenario>) {
  const db = await getDb();
  if (!db) return;
  await db.update(treatmentPlanScenarios).set({ ...data, updatedAt: new Date() }).where(eq(treatmentPlanScenarios.id, id));
}

export async function deleteScenario(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(treatmentPlanScenarios).where(eq(treatmentPlanScenarios.id, id));
}

export async function reorderScenarios(planId: number, orderedIds: number[]) {
  const db = await getDb();
  if (!db) return;
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(treatmentPlanScenarios)
      .set({ sortOrder: i })
      .where(and(eq(treatmentPlanScenarios.id, orderedIds[i]), eq(treatmentPlanScenarios.treatmentPlanId, planId)));
  }
}

// ─── Doctor Review Requests ───────────────────────────────────────────────────

export async function createDoctorReviewRequest(data: InsertDoctorReviewRequest) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(doctorReviewRequests).values(data);
  return (result[0] as any).insertId as number;
}

export async function getLatestReviewRequest(opts: { leadId?: number; patientId?: number }) {
  const db = await getDb();
  if (!db) return null;
  const condition = opts.leadId
    ? eq(doctorReviewRequests.leadId, opts.leadId)
    : eq(doctorReviewRequests.patientId, opts.patientId!);
  const result = await db
    .select()
    .from(doctorReviewRequests)
    .where(condition)
    .orderBy(desc(doctorReviewRequests.requestedAt))
    .limit(1);
  return result[0] ?? null;
}

export async function updateReviewRequestStatus(
  id: number,
  status: "pending" | "in_review" | "plan_ready",
  extra?: { reviewStartedAt?: Date; planReadyAt?: Date }
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(doctorReviewRequests)
    .set({ status, ...extra })
    .where(eq(doctorReviewRequests.id, id));
}

export async function listPendingReviewRequestsForDoctor(doctorId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(doctorReviewRequests)
    .where(and(eq(doctorReviewRequests.doctorId, doctorId), or(eq(doctorReviewRequests.status, "pending"), eq(doctorReviewRequests.status, "in_review"))))
    .orderBy(desc(doctorReviewRequests.requestedAt));
}

// ─── Clinic Information ───────────────────────────────────────────────────────

export async function getClinicInfo() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(clinicInfo).limit(1);
  return rows[0] ?? null;
}

export async function saveClinicInfo(data: Partial<typeof clinicInfo.$inferInsert>, updatedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Always upsert row id=1 (singleton)
  const existing = await db.select({ id: clinicInfo.id }).from(clinicInfo).limit(1);
  if (existing.length > 0) {
    await db.update(clinicInfo).set({ ...data, updatedBy: updatedBy ?? null } as any).where(eq(clinicInfo.id, existing[0].id));
  } else {
    await db.insert(clinicInfo).values({ ...data, updatedBy: updatedBy ?? null } as any);
  }
}

// ─── Treatment Plan Multi-Plan Helpers ───────────────────────────────────────

export async function createTreatmentPlan(data: InsertTreatmentPlan) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(treatmentPlans).values(data);
  return (result[0] as any).insertId as number;
}

export async function updateTreatmentPlanById(id: number, data: Partial<InsertTreatmentPlan>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(treatmentPlans).set({ ...data, updatedAt: new Date() }).where(eq(treatmentPlans.id, id));
}

export async function listTreatmentPlansByDoctor(doctorId: number) {
  const db = await getDb();
  if (!db) return [];
  // Join with leads and patients to get patient/lead name
  const rows = await db
    .select({
      id: treatmentPlans.id,
      leadId: treatmentPlans.leadId,
      patientId: treatmentPlans.patientId,
      doctorId: treatmentPlans.doctorId,
      title: treatmentPlans.title,
      requestNotes: treatmentPlans.requestNotes,
      requestedById: treatmentPlans.requestedById,
      status: treatmentPlans.status,
      clinicalSummary: treatmentPlans.clinicalSummary,
      confirmedAt: treatmentPlans.confirmedAt,
      createdAt: treatmentPlans.createdAt,
      updatedAt: treatmentPlans.updatedAt,
      leadFirstName: leads.firstName,
      leadLastName: leads.lastName,
      leadCode: leads.code,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
      patientMrn: patients.mrn,
    })
    .from(treatmentPlans)
    .leftJoin(leads, eq(treatmentPlans.leadId, leads.id))
    .leftJoin(patients, eq(treatmentPlans.patientId, patients.id))
    .where(eq(treatmentPlans.doctorId, doctorId))
    .orderBy(desc(treatmentPlans.createdAt));
  return rows;
}

export async function listTreatmentPlansByLead(leadId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(treatmentPlans)
    .where(eq(treatmentPlans.leadId, leadId))
    .orderBy(desc(treatmentPlans.createdAt));
}

export async function listTreatmentPlansByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(treatmentPlans)
    .where(eq(treatmentPlans.patientId, patientId))
    .orderBy(desc(treatmentPlans.createdAt));
}

// ─── External Reports ─────────────────────────────────────────────────────────

export async function listExternalReports(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(externalReports)
    .where(eq(externalReports.patientId, patientId))
    .orderBy(desc(externalReports.createdAt));
  return rows.map(withExternalReportDocument);
}

export async function getExternalReportById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(externalReports).where(eq(externalReports.id, id)).limit(1);
  return rows[0] ? withExternalReportDocument(rows[0]) : null;
}

export async function getExternalReportByV2SubmissionKey(submissionKey: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(externalReports).where(eq(externalReports.v2SubmissionKey, submissionKey)).limit(1);
  return rows[0] ? withExternalReportDocument(rows[0]) : null;
}

/** Provides a validated structured document for new reports and a non-mutating legacy adapter for history. */
function withExternalReportDocument(report: ExternalReport) {
  return {
    ...report,
    processedDocument: readExternalReportDocument({
      processedDocumentJson: report.processedDocumentJson,
      processedContent: report.processedContent,
      resolvedOutputLanguage: report.resolvedOutputLanguage,
      legacyLanguage: report.language,
    }),
  };
}

export type ExternalReportSourceCapture = {
  sourceText?: string | null;
  inputMethod: "text" | "voice" | "files";
  sourceLanguage?: ExternalReportSourceLanguage | null;
  sourceAssetRefs?: unknown;
  correctionReason?: string | null;
};

export type ExternalReportProcessingMetadata = {
  processingGoal: ExternalReportProcessingGoal;
  requestedTargetLanguage?: "en" | "ar" | "tr" | "source" | null;
  resolvedOutputLanguage: ExternalReportSourceLanguage;
  processedDocumentVersion?: number | null;
  humanReviewFinalized?: boolean;
};

export type ExternalReportWriteData = {
  patientId?: number;
  reportRef?: string;
  sourceOrganization?: string;
  reportType?: string;
  reportDate?: Date;
  originalContent?: string;
  processedContent?: string;
  processingNote?: string;
  language?: string;
  processingRepresentation?: ExternalReportProcessingRepresentation | null;
  v2SubmissionKey?: string | null;
  v2Metadata?: { version: 2; safetyState: "auto_verified" | "manual_verification_required"; manuallyEdited: boolean } | null;
  originalFiles?: string;
  status?: "draft" | "final";
  createdById?: number;
  sourceCapture?: ExternalReportSourceCapture;
  processing?: ExternalReportProcessingMetadata;
  processedDocument?: ExternalReportDocument | null;
};

function hashExternalReportSource(text: string | null | undefined) {
  return createHash("sha256").update(text ?? "").digest("hex");
}

function normalizeProcessedDocument(input: ExternalReportWriteData): ExternalReportDocument | null {
  if (input.processedDocument === null) return null;
  if (input.processedDocument !== undefined) {
    const parsed = parseExternalReportDocument(input.processedDocument);
    if (!parsed) throw new TRPCError({ code: "BAD_REQUEST", message: "Processed document is invalid." });
    return parsed;
  }
  if (input.processing) {
    return createLegacyExternalReportDocument(input.processedContent, input.processing.resolvedOutputLanguage);
  }
  return null;
}

export function buildExternalReportWriteColumns(input: ExternalReportWriteData, processedDocument: ExternalReportDocument | null, includeCreator = false) {
  const {
    sourceCapture: _sourceCapture,
    processing: _processing,
    processedDocument: _processedDocument,
    createdById,
    ...base
  } = input;
  const processing = input.processing;
  return {
    ...base,
    ...(includeCreator && createdById !== undefined ? { createdById } : {}),
    ...(processing ? {
      processingGoal: processing.processingGoal,
      requestedTargetLanguage: processing.requestedTargetLanguage === "source" ? null : processing.requestedTargetLanguage ?? null,
      resolvedOutputLanguage: processing.resolvedOutputLanguage,
      // Retain legacy display fields only as a compatibility projection.
      language: processing.resolvedOutputLanguage === "und" ? input.language ?? "en" : processing.resolvedOutputLanguage,
      processedDocumentJson: processedDocument ?? null,
      processedDocumentVersion: processedDocument?.version ?? null,
    } : {}),
  };
}

async function insertExternalReportSourceRevision(
  tx: any,
  reportId: number,
  capture: ExternalReportSourceCapture,
  capturedById?: number,
): Promise<number> {
  const latest = await tx
    .select({ revisionNumber: externalReportSourceRevisions.revisionNumber })
    .from(externalReportSourceRevisions)
    .where(eq(externalReportSourceRevisions.reportId, reportId))
    .orderBy(desc(externalReportSourceRevisions.revisionNumber))
    .limit(1);
  const revisionNumber = (latest[0]?.revisionNumber ?? 0) + 1;
  const result = await tx.insert(externalReportSourceRevisions).values({
    reportId,
    revisionNumber,
    sourceText: capture.sourceText ?? null,
    inputMethod: capture.inputMethod,
    sourceLanguage: capture.sourceLanguage ?? null,
    sourceAssetRefs: capture.sourceAssetRefs ?? null,
    sourceHash: hashExternalReportSource(capture.sourceText),
    correctionReason: capture.correctionReason ?? null,
    capturedById: capturedById ?? null,
  } as any);
  return Number((result as any).insertId ?? (result as any)[0]?.insertId ?? 0);
}

async function insertExternalReportProcessingRun(
  tx: any,
  opts: {
    reportId: number;
    sourceRevisionId?: number | null;
    processing: ExternalReportProcessingMetadata;
    createdById?: number;
    final: boolean;
  },
) {
  const now = new Date();
  const finalized = opts.final || opts.processing.humanReviewFinalized === true;
  await tx.insert(externalReportProcessingRuns).values({
    reportId: opts.reportId,
    sourceRevisionId: opts.sourceRevisionId ?? null,
    processingGoal: opts.processing.processingGoal,
    requestedTargetLanguage: opts.processing.requestedTargetLanguage === "source" ? null : opts.processing.requestedTargetLanguage ?? null,
    resolvedOutputLanguage: opts.processing.resolvedOutputLanguage,
    processedDocumentVersion: opts.processing.processedDocumentVersion ?? 1,
    processingStatus: finalized ? "finalized" : "processed",
    reviewedAt: finalized ? now : null,
    reviewedById: finalized ? opts.createdById ?? null : null,
    finalizedAt: finalized ? now : null,
    finalizedById: finalized ? opts.createdById ?? null : null,
    createdById: opts.createdById ?? null,
  } as any);
}

export async function persistExternalReportCreate(
  tx: any,
  data: ExternalReportWriteData & { patientId: number },
  onStage?: (stage: import("./externalReportFinalizeObservability").ExternalReportFinalizeStage) => void,
) {
  const processedDocument = normalizeProcessedDocument(data);
  onStage?.("processed_document_validated");
  const insertResult = await tx.insert(externalReports).values(buildExternalReportWriteColumns(data, processedDocument, true) as any);
  const reportId = Number((insertResult as any).insertId ?? (insertResult as any)[0]?.insertId ?? 0);
  onStage?.("report_inserted");
  let sourceRevisionId: number | null = null;
  if (data.sourceCapture) {
    sourceRevisionId = await insertExternalReportSourceRevision(tx, reportId, data.sourceCapture, data.createdById);
    onStage?.("source_revision_inserted");
    await tx.update(externalReports).set({ activeSourceRevisionId: sourceRevisionId } as any).where(eq(externalReports.id, reportId));
    onStage?.("source_revision_linked");
  }
  if (data.processing) {
    await insertExternalReportProcessingRun(tx, {
      reportId,
      sourceRevisionId,
      processing: data.processing,
      createdById: data.createdById,
      final: data.status === "final",
    });
    onStage?.("processing_run_inserted");
  }
  return reportId;
}

export async function createExternalReport(
  data: ExternalReportWriteData & { patientId: number },
  onStage?: (stage: import("./externalReportFinalizeObservability").ExternalReportFinalizeStage) => void,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  onStage?.("transaction_started");
  const result = await db.transaction((tx) => persistExternalReportCreate(tx, data, onStage));
  onStage?.("transaction_committed");
  const insertId = result;
  const report = await getExternalReportById(Number(insertId));
  onStage?.("readback_completed");
  return report;
}

export async function updateExternalReport(id: number, data: ExternalReportWriteData) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const processedDocument = normalizeProcessedDocument(data);
  await db.transaction(async (tx) => {
    let sourceRevisionId: number | null = null;
    if (data.sourceCapture) {
      sourceRevisionId = await insertExternalReportSourceRevision(tx, id, data.sourceCapture, data.createdById);
    }
    const writeData = buildExternalReportWriteColumns(data, processedDocument) as Record<string, unknown>;
    if (sourceRevisionId) writeData.activeSourceRevisionId = sourceRevisionId;
    await tx.update(externalReports).set(writeData as any).where(eq(externalReports.id, id));
    if (data.processing) {
      const current = await tx.select({ activeSourceRevisionId: externalReports.activeSourceRevisionId }).from(externalReports).where(eq(externalReports.id, id)).limit(1);
      await insertExternalReportProcessingRun(tx, {
        reportId: id,
        sourceRevisionId: sourceRevisionId ?? current[0]?.activeSourceRevisionId ?? null,
        processing: data.processing,
        createdById: data.createdById,
        final: data.status === "final",
      });
    }
  });
  return getExternalReportById(id);
}

export async function getExternalReportSourceRevisions(reportId: number): Promise<ExternalReportSourceRevision[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(externalReportSourceRevisions)
    .where(eq(externalReportSourceRevisions.reportId, reportId))
    .orderBy(desc(externalReportSourceRevisions.revisionNumber));
}

export async function getExternalReportProcessingRuns(reportId: number): Promise<ExternalReportProcessingRun[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(externalReportProcessingRuns)
    .where(eq(externalReportProcessingRuns.reportId, reportId))
    .orderBy(desc(externalReportProcessingRuns.processedAt));
}

export async function deleteExternalReport(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const reportOwnedSourcePrefix = "external-reports/source/";
  const normalizeExternalReportSourceKey = (value: string) => value
    .trim()
    .replace(/^\/?api\/storage\//, "")
    .replace(/^\/?manus-storage\//, "");
  const sourceKeysFromRefs = (sourceAssetRefs: unknown): string[] => {
    if (!Array.isArray(sourceAssetRefs)) return [];
    return sourceAssetRefs.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || !("key" in entry) || typeof (entry as { key?: unknown }).key !== "string") return [];
      const key = normalizeExternalReportSourceKey((entry as { key: string }).key);
      return key.startsWith(reportOwnedSourcePrefix) ? [key] : [];
    });
  };

  const reportOwnedSourceKeys = await db.transaction(async (tx) => {
    const revisions = await tx.select({ sourceAssetRefs: externalReportSourceRevisions.sourceAssetRefs })
      .from(externalReportSourceRevisions)
      .where(eq(externalReportSourceRevisions.reportId, id));
    const sourceKeys = new Set(revisions.flatMap((revision) => sourceKeysFromRefs(revision.sourceAssetRefs)));

    await tx.delete(externalReportProcessingRuns).where(eq(externalReportProcessingRuns.reportId, id));
    await tx.delete(externalReportSourceRevisions).where(eq(externalReportSourceRevisions.reportId, id));
    await tx.delete(externalReports).where(eq(externalReports.id, id));
    return Array.from(sourceKeys);
  });

  const remainingSourceRefs = await db.select({ sourceAssetRefs: externalReportSourceRevisions.sourceAssetRefs })
    .from(externalReportSourceRevisions);
  const referencedByLiveReport = new Set(remainingSourceRefs.flatMap((revision) => sourceKeysFromRefs(revision.sourceAssetRefs)));
  const exclusivelyOwnedSourceKeys = reportOwnedSourceKeys.filter((key) => !referencedByLiveReport.has(key));

  // Storage cleanup runs only after a successful database commit. It is best-effort and cannot
  // corrupt the deletion transaction; keys remaining referenced by a live report are never removed.
  const { storageDelete } = await import("./storage");
  const cleanupResults = await Promise.allSettled(exclusivelyOwnedSourceKeys.map((key) => storageDelete(key)));
  const storageCleanupPending = cleanupResults.some((result) => result.status === "rejected" || result.value === false);
  return { success: true, releasedSourceAssetCount: exclusivelyOwnedSourceKeys.length, storageCleanupPending };
}

// ─── Link to Existing Patient ─────────────────────────────────────────────────

/**
 * Conservative intake emptiness check.
 * Returns true ONLY when the intake is truly empty — no meaningful data entered.
 * Errs on the side of "not empty" when uncertain.
 * 
 * Rules:
 * - null / undefined → empty for that field
 * - empty string / whitespace-only string → empty
 * - JSON arrays: empty array [] → empty; array with any item → NOT empty
 * - JSON objects: all values falsy → empty; any truthy value → NOT empty
 * - Numbers: 0 is the DB default for gravida/para/abortus/livingChildren — treated as empty
 *   BUT only if the field has a known default of 0. Explicit non-zero → NOT empty.
 * - Booleans: false is the DB default for most flags → treated as empty.
 *   true → NOT empty (intentionally set).
 * - Dates/timestamps: any date → NOT empty.
 * - Decimal strings: "0" or "0.0" → empty; any other number → NOT empty.
 * - If any uncertainty, returns false (treat as NOT empty).
 */
export function isIntakeEmpty(intake: Record<string, unknown>): boolean {
  // Fields to skip entirely (system/metadata — not medical data)
  const SKIP_FIELDS = new Set([
    "id", "leadId", "patientId", "intakeMode",
    "createdAt", "updatedAt",
    "maleIntakeMigrated", "maleIntakeMigratedAt", "maleIntakeMigratedBy",
    // Default-false flags that carry no clinical meaning when false
    "hasCivilMarriageCertificate", "bmiManual",
    "hasRadiologyStudies", "hasMaleRadiologyStudies",
  ]);

  // Fields with a known numeric default of 0 — only non-zero values are meaningful
  const ZERO_DEFAULT_FIELDS = new Set([
    "gravida", "para", "abortus", "livingChildren", "childrenFromPreviousMarriage",
  ]);

  // Default-false boolean fields — only true is meaningful
  const FALSE_DEFAULT_BOOL_FIELDS = new Set([
    "dysmenorrhea", "hirsutism", "consanguinity",
    "familyBreastCancer", "familyEarlyMenopause", "familyInfertility",
  ]);

  function isValueEmpty(key: string, value: unknown): boolean {
    if (SKIP_FIELDS.has(key)) return true;
    if (value === null || value === undefined) return true;

    // String fields
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return true;
      // Decimal strings like "0" or "0.0" from MySQL decimal columns
      if (/^0+(\.0+)?$/.test(trimmed)) return true;
      return false; // non-empty string → NOT empty
    }

    // Number fields
    if (typeof value === "number") {
      if (ZERO_DEFAULT_FIELDS.has(key) && value === 0) return true;
      return value === 0 ? true : false; // any non-zero number → NOT empty
    }

    // Boolean fields
    if (typeof value === "boolean") {
      if (FALSE_DEFAULT_BOOL_FIELDS.has(key) && value === false) return true;
      return !value; // true → NOT empty
    }

    // Date objects
    if (value instanceof Date) return false; // any date → NOT empty

    // JSON arrays (stored as parsed arrays after normalizeIntakeJSON)
    if (Array.isArray(value)) {
      if (value.length === 0) return true;
      // Array with items — check if all items are empty objects
      const allEmpty = value.every(item => {
        if (item === null || item === undefined) return true;
        if (typeof item !== "object") return false; // primitive in array → NOT empty
        return Object.values(item as Record<string, unknown>).every(v =>
          v === null || v === undefined || v === "" || v === false || v === 0
        );
      });
      return allEmpty;
    }

    // JSON objects (systemicDiseases, maleIntake, etc.)
    if (typeof value === "object") {
      const entries = Object.values(value as Record<string, unknown>);
      if (entries.length === 0) return true;
      // If any value is truthy (non-null, non-empty, non-false, non-zero) → NOT empty
      const anyMeaningful = entries.some(v => {
        if (v === null || v === undefined || v === "" || v === false) return false;
        if (typeof v === "number" && v === 0) return false;
        if (Array.isArray(v) && v.length === 0) return false;
        return true;
      });
      return !anyMeaningful;
    }

    // Unknown type — treat as NOT empty (conservative)
    return false;
  }

  for (const [key, value] of Object.entries(intake)) {
    if (!isValueEmpty(key, value)) return false;
  }
  return true;
}

/**
 * Link a Lead to an existing Patient without creating a new Patient.
 * Implements the Shared-Intake principle: one medical_intake row per person.
 * 
 * Returns:
 * - { status: "success" } on clean link
 * - { status: "intake_conflict", leadIntake, patientIntake } when both have real data
 *   (caller must re-invoke with resolveIntakeConflict set)
 * 
 * Throws TRPCError on validation failures.
 */
export async function linkLeadToExistingPatient(input: {
  leadId: number;
  patientId: number;
  resolveIntakeConflict?: "useLeadIntake" | "usePatientIntake";
  /** When true and lead.gender is known but patient.gender is null, set patient.gender = lead.gender */
  stampPatientGender?: boolean;
  /** When true, caller has explicitly confirmed the DOB minor-mismatch warning and wants to proceed */
  confirmDobWarning?: boolean;
}): Promise<
  | { status: "linked" }
  | { status: "linked"; warning: string }
  | { status: "intake_conflict"; leadIntake: Record<string, unknown>; patientIntake: Record<string, unknown> }
  | { status: "dob_warning"; message: string }
> {
  const { TRPCError } = await import("@trpc/server");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

  // ── Validation 1: Lead must exist and not already be linked to a different Patient ──
  const leadRow = await db.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
  if (!leadRow[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
  const lead = leadRow[0] as any;
  if (lead.convertedPatientId && lead.convertedPatientId !== input.patientId) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `This Lead is already linked to Patient ID ${lead.convertedPatientId}. Please unlink first.`,
    });
  }

  // ── Validation 2: Patient must exist ──
  const patientRow = await db.select().from(patients).where(eq(patients.id, input.patientId)).limit(1);
  if (!patientRow[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Patient not found." });
  const patient = patientRow[0] as any;

  // ── Validation 3: Patient must not already be linked to a different Lead ──
  if (patient.socialLeadId && String(patient.socialLeadId) !== String(input.leadId)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `This Patient is already linked to Lead ID ${patient.socialLeadId}. Please unlink first.`,
    });
  }

  // ── Validation 4: No other Lead should have convertedPatientId pointing to this Patient ──
  const otherLeadWithSamePatient = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(
      eq((leads as any).convertedPatientId, input.patientId),
      sql`${leads.id} != ${input.leadId}`
    ))
    .limit(1);
  if (otherLeadWithSamePatient[0]) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Another Lead (ID ${otherLeadWithSamePatient[0].id}) is already linked to this Patient. Please resolve that link first.`,
    });
  }

  // ── V5: Gender mismatch — hard block ──
  if (lead.gender && patient.gender && lead.gender !== patient.gender) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Gender mismatch: this Lead and Patient may not be the same person. Please review and correct the demographics before linking.",
    });
  }

  // ── V6: DOB mismatch ──
  if (lead.dateOfBirth && patient.dateOfBirth) {
    const leadDob = new Date(lead.dateOfBirth).getTime();
    const patientDob = new Date(patient.dateOfBirth).getTime();
    const diffMs = Math.abs(leadDob - patientDob);
    const diffYears = diffMs / (365.25 * 24 * 60 * 60 * 1000);
    if (diffYears > 1) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Date of birth mismatch: this Lead and Patient may not be the same person.",
      });
    } else if (diffYears > 0 && !input.confirmDobWarning) {
      // Minor mismatch — return warning, let frontend ask for confirmation
      return {
        status: "dob_warning",
        message: "The dates of birth differ slightly (within 1 year). This may be a data entry error. Please confirm you want to proceed with linking.",
      };
    }
  }

  // ── Fetch intakes ──
  const leadIntakeRow = await db.select().from(medicalIntake).where(eq(medicalIntake.leadId, input.leadId)).limit(1);
  const patientIntakeRow = await db.select().from(medicalIntake).where(eq(medicalIntake.patientId, input.patientId)).limit(1);
  const leadIntake = leadIntakeRow[0] ? normalizeIntakeJSON(leadIntakeRow[0]) as Record<string, unknown> : null;
  const patientIntake = patientIntakeRow[0] ? normalizeIntakeJSON(patientIntakeRow[0]) as Record<string, unknown> : null;

  const leadEmpty = !leadIntake || isIntakeEmpty(leadIntake);
  const patientEmpty = !patientIntake || isIntakeEmpty(patientIntake);

  // ── Intake conflict: both have real data and no resolution specified ──
  if (!leadEmpty && !patientEmpty && !input.resolveIntakeConflict) {
    return {
      status: "intake_conflict",
      leadIntake: leadIntake!,
      patientIntake: patientIntake!,
    };
  }

  // ── Resolve intake ──
  if (leadIntake && patientIntake) {
    // Both exist — determine which is the "winner"
    const useLeadIntake =
      input.resolveIntakeConflict === "useLeadIntake" ||
      (!leadEmpty && patientEmpty);
    const usePatientIntake =
      input.resolveIntakeConflict === "usePatientIntake" ||
      (leadEmpty && !patientEmpty);

    if (useLeadIntake) {
      // Lead intake is the winner: detach patient intake FIRST (avoid UNIQUE violation), then stamp patientId on lead intake
      await db.update(medicalIntake)
        .set({ leadId: null as any, patientId: null as any })
        .where(eq(medicalIntake.id, (patientIntake as any).id));
      await db.update(medicalIntake)
        .set({ patientId: input.patientId } as any)
        .where(eq(medicalIntake.id, (leadIntake as any).id));
    } else if (usePatientIntake) {
      // Patient intake is the winner: detach lead intake FIRST (avoid UNIQUE violation), then stamp leadId on patient intake
      await db.update(medicalIntake)
        .set({ leadId: null as any, patientId: null as any })
        .where(eq(medicalIntake.id, (leadIntake as any).id));
      await db.update(medicalIntake)
        .set({ leadId: input.leadId } as any)
        .where(eq(medicalIntake.id, (patientIntake as any).id));
    } else {
      // Both empty — use lead intake as the shared row: detach patient intake FIRST, then stamp patientId on lead intake
      await db.update(medicalIntake)
        .set({ leadId: null as any, patientId: null as any })
        .where(eq(medicalIntake.id, (patientIntake as any).id));
      await db.update(medicalIntake)
        .set({ patientId: input.patientId } as any)
        .where(eq(medicalIntake.id, (leadIntake as any).id));
    }
  } else if (leadIntake && !patientIntake) {
    // Only lead intake exists — stamp patientId on it
    await db.update(medicalIntake)
      .set({ patientId: input.patientId } as any)
      .where(eq(medicalIntake.id, (leadIntake as any).id));
  } else if (!leadIntake && patientIntake) {
    // Only patient intake exists — stamp leadId on it
    await db.update(medicalIntake)
      .set({ leadId: input.leadId } as any)
      .where(eq(medicalIntake.id, (patientIntake as any).id));
  }
  // If neither has an intake — no intake action needed

  // ── V5 optional: Stamp Patient gender from Lead ──
  if (input.stampPatientGender && lead.gender && !patient.gender) {
    await db.update(patients)
      .set({ gender: lead.gender } as any)
      .where(eq(patients.id, input.patientId));
  }

  // ── Write BOTH sides of the link atomically inside a transaction ──
  // writeBothLinkSides guarantees that if either write fails, neither is committed,
  // preventing one-sided link state from ever being created.
  await writeBothLinkSides(input.leadId, input.patientId, { leadStatus: "converted" });

  // ── Q7: Empty-only preference copy: Patient → Lead ──
  // Rule: Copy Patient preference fields to Lead ONLY when the Lead field is empty/null.
  // If both Lead and Patient have non-empty values that differ, PRESERVE the Lead value
  // and log the conflict. No silent overwrite. No UI conflict dialog in Phase 2.
  // TODO (Phase 3): Surface conflicts to the coordinator in the UI so they can choose.
  const prefUpdate: Record<string, unknown> = {};
  const patientPrefs = patient as any;
  const leadPrefs = lead as any;

  const patientContactMethods: string[] = Array.isArray(patientPrefs.preferredContactMethods)
    ? patientPrefs.preferredContactMethods
    : (patientPrefs.preferredContactMethods ? [patientPrefs.preferredContactMethods] : []);
  const leadContactMethods: string[] = Array.isArray(leadPrefs.preferredContactMethods)
    ? leadPrefs.preferredContactMethods
    : (leadPrefs.preferredContactMethods ? [leadPrefs.preferredContactMethods] : []);

  if (patientContactMethods.length > 0 && leadContactMethods.length === 0) {
    prefUpdate.preferredContactMethods = patientContactMethods;
  } else if (patientContactMethods.length > 0 && leadContactMethods.length > 0) {
    const patientSet = new Set(patientContactMethods);
    const leadSet = new Set(leadContactMethods);
    const hasDiff = Array.from(patientSet).some(v => !leadSet.has(v)) || Array.from(leadSet).some(v => !patientSet.has(v));
    if (hasDiff) {
      console.warn(`[linkLeadToExistingPatient] preferredContactMethods conflict: Lead ${input.leadId} has [${leadContactMethods.join(',')}], Patient ${input.patientId} has [${patientContactMethods.join(',')}]. Preserving Lead values.`);
    }
  }

  const patientLanguages: string[] = Array.isArray(patientPrefs.preferredLanguages)
    ? patientPrefs.preferredLanguages
    : (patientPrefs.preferredLanguages ? [patientPrefs.preferredLanguages] : []);
  const leadLanguages: string[] = Array.isArray(leadPrefs.preferredLanguages)
    ? leadPrefs.preferredLanguages
    : (leadPrefs.preferredLanguages ? [leadPrefs.preferredLanguages] : []);

  if (patientLanguages.length > 0 && leadLanguages.length === 0) {
    prefUpdate.preferredLanguages = patientLanguages;
    // Also copy primaryLanguage if Lead's is empty
    if (!leadPrefs.primaryLanguage && patientPrefs.primaryLanguage) {
      prefUpdate.primaryLanguage = patientPrefs.primaryLanguage;
    }
  } else if (patientLanguages.length > 0 && leadLanguages.length > 0) {
    const patientSet = new Set(patientLanguages);
    const leadSet = new Set(leadLanguages);
    const hasDiff = Array.from(patientSet).some(v => !leadSet.has(v)) || Array.from(leadSet).some(v => !patientSet.has(v));
    if (hasDiff) {
      console.warn(`[linkLeadToExistingPatient] preferredLanguages conflict: Lead ${input.leadId} has [${leadLanguages.join(',')}], Patient ${input.patientId} has [${patientLanguages.join(',')}]. Preserving Lead values.`);
    }
  }

  if (Object.keys(prefUpdate).length > 0) {
    await db.update(leads).set(prefUpdate).where(eq(leads.id, input.leadId));
  }

  return { status: "linked" };
}

// ─── Document Lifecycle Management ───────────────────────────────────────────

/**
 * Canonical traversal helper: extracts every lead_documents.id (docId) referenced
 * anywhere in a medical_intake row. This is the single source of truth for which
 * documents belong to a given intake. Add new fields here when new docId-bearing
 * sections are added to the intake form.
 */
export function extractDocIdsFromIntake(intake: any): number[] {
  const ids = new Set<number>();
  if (!intake) return [];

  const parseArr = (v: any): any[] => {
    if (!v) return [];
    if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
    return Array.isArray(v) ? v : [];
  };
  const parseMaleIntake = (v: any): any => {
    if (!v) return null;
    if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } }
    return v;
  };
  const addId = (v: any) => { if (typeof v === "number" && v > 0) ids.add(v); };

  // Top-level
  addId((intake as any).marriageCertDocId);

  // artHistory: cycleDocId + embryo pgtDocId
  for (const cycle of parseArr(intake.artHistory)) {
    addId(cycle.cycleDocId);
    for (const emb of parseArr(cycle.frozenEmbryos)) addId(emb.pgtDocId);
    for (const emb of parseArr(cycle.transferredEmbryos)) addId(emb.pgtDocId);
  }

  // Radiology studies (female + male) — top-level docId + nested images[].docId + dicomFiles[].docId
  for (const study of parseArr(intake.radiologyStudies)) {
    addId(study.docId);
    for (const img of parseArr(study.images)) addId(img.docId);       // T4: radiologyStudies[].images[].docId
    for (const dcm of parseArr(study.dicomFiles)) addId(dcm.docId);   // T5: radiologyStudies[].dicomFiles[].docId
    for (const rf of parseArr(study.reportFiles)) addId(rf.docId);    // reportFiles[].docId
  }
  for (const study of parseArr(intake.maleRadiologyStudies)) {
    addId(study.docId);
    for (const img of parseArr(study.images)) addId(img.docId);       // T6: maleRadiologyStudies[].images[].docId
    for (const dcm of parseArr(study.dicomFiles)) addId(dcm.docId);   // T6: maleRadiologyStudies[].dicomFiles[].docId
    for (const rf of parseArr(study.reportFiles)) addId(rf.docId);    // reportFiles[].docId
  }

  // General attachments
  for (const att of parseArr(intake.generalAttachmentsFemale)) addId(att.docId);
  for (const att of parseArr(intake.generalAttachmentsMale)) addId(att.docId);

  // Female genetic tests
  for (const test of parseArr(intake.femaleGeneticTests)) addId(test.docId);

  // Miscarriage history — each entry may have a docId (T1)
  for (const m of parseArr(intake.miscarriageHistory)) addId(m.docId);

  // Surgical history + female previous tests
  for (const entry of parseArr(intake.surgicalHistory)) addId(entry.docId);
  for (const entry of parseArr(intake.previousTests)) addId(entry.docId);

  // maleIntake nested arrays
  const mi = parseMaleIntake(intake.maleIntake);
  if (mi) {
    for (const s of parseArr(mi.semenAnalysis)) addId(s.docId);
    for (const d of parseArr(mi.dnaFragmentation)) addId(d.docId);
    for (const h of parseArr(mi.hormonePanel)) addId(h.docId);
    // Male previous tests — direct docId on each TestEntry (T2)
    for (const t of parseArr(mi.previousTests)) addId(t.docId);
    // Male genetic tests — direct docId on each GeneticTestEntry (T3)
    for (const g of parseArr(mi.geneticTests)) addId(g.docId);
    // Male previous surgeries — direct docId on each SurgicalEntry
    for (const ps of parseArr(mi.previousSurgeries)) addId(ps.docId);
  }

  return Array.from(ids);
}

/**
 * Archive all documents belonging to an intake (non-destructive reset).
 * Sets lifecycleStatus = 'historical', archivedAt = now, archiveReason = 'health-record-reset'.
 * Preserves S3 files and translation records.
 */
export async function archiveIntakeDocuments(
  leadId: number,
  patientId: number | null,
  _intakeId: number,
  docIds: number[],
): Promise<number[]> {
  if (docIds.length === 0) return [];
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const now = new Date();
  // Correction 5: filter by OR(leadId, patientId) so patient-keyed docs are also archived.
  const ownerFilter = patientId
    ? or(eq(leadDocuments.leadId, leadId), eq(leadDocuments.patientId, patientId))
    : eq(leadDocuments.leadId, leadId);
  await db
    .update(leadDocuments)
    .set({
      lifecycleStatus: "historical" as any,
      archivedAt: now,
      archiveReason: "health-record-reset",
    } as any)
    .where(
      and(
        ownerFilter,
        inArray(leadDocuments.id, docIds),
        // Explicit guard: never archive direct-upload documents even if their docId
        // accidentally appears in the intake JSON due to a future bug.
        ne(leadDocuments.lifecycleStatus as any, "direct-upload"),
      ),
    );
  return docIds;
}

/**
 * Permanently delete all documents belonging to an intake.
 *
 * Correct operation order (prevents retry metadata loss):
 * A. Successful deletion:
 *    1. Mark row as deletion-pending (hides from UI, preserves retry metadata)
 *    2. Delete translation rows
 *    3. Attempt S3 deletion
 *    4. On success: hard-delete the document row
 *    5. Report completed deletion
 *
 * B. Storage deletion failure:
 *    1. Row is already marked deletion-pending (hidden from UI)
 *    2. Translation rows already deleted
 *    3. S3 deletion failed — row preserved with storageDeletePending=true
 *    4. Return partial/pending result (not full success)
 *
 * Returns { deleted: number[], storagePending: number[] }.
 */
export async function permanentlyDeleteIntakeDocuments(
  leadId: number,
  patientId: number | null,
  docIds: number[],
): Promise<{ deleted: number[]; storagePending: number[] }> {
  if (docIds.length === 0) return { deleted: [], storagePending: [] };
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const deleted: number[] = [];
  const storagePending: number[] = [];

  // Correction 5: filter by OR(leadId, patientId) so patient-keyed docs are also deleted.
  const ownerFilter = patientId
    ? or(eq(leadDocuments.leadId, leadId), eq(leadDocuments.patientId, patientId))
    : eq(leadDocuments.leadId, leadId);

  const docs = await db
    .select()
    .from(leadDocuments)
    .where(
      and(
        ownerFilter,
        inArray(leadDocuments.id, docIds),
        // Explicit guard: never permanently delete direct-upload documents even if their
        // docId accidentally appears in the intake JSON due to a future bug.
        ne(leadDocuments.lifecycleStatus as any, "direct-upload"),
      ),
    );

  for (const doc of docs) {
    // Step 1: Mark as deletion-pending FIRST — hides from UI, preserves retry metadata.
    // This must happen before any destructive operation so the row is never lost.
    await db
      .update(leadDocuments)
      .set({ lifecycleStatus: "deletion-pending" as any, storageDeletePending: true } as any)
      .where(eq(leadDocuments.id, doc.id));

    // Step 2: Delete translation rows (permanent-delete semantics: translations are gone)
    await db
      .delete(documentTranslations)
      .where(eq(documentTranslations.leadDocumentId, doc.id));

    // Step 3: Attempt S3 deletion
    let storageOk = true;
    if (doc.fileKey) {
      try {
        const { storageDelete } = await import("./storage");
        await storageDelete(doc.fileKey);
      } catch {
        storageOk = false;
      }
    }

    if (storageOk) {
      // Step 4: S3 succeeded — hard-delete the document row
      await db.delete(leadDocuments).where(eq(leadDocuments.id, doc.id));
      deleted.push(doc.id);
    } else {
      // Step 4 (failure): Row is already hidden (deletion-pending) and storageDeletePending=true.
      // Retry mechanism can pick this up later using retryPendingStorageDeletions.
      console.warn(`[permanentlyDeleteIntakeDocuments] S3 deletion failed for doc ${doc.id}, key: ${doc.fileKey}. Preserved for retry.`);
      storagePending.push(doc.id);
    }
  }

  return { deleted, storagePending };
}

/**
 * Retry storage deletion for documents with lifecycleStatus='deletion-pending' and storageDeletePending=true.
 * Processes all pending documents across all leads (global retry) or a specific lead.
 * Idempotent: safe to call multiple times for the same document.
 * Batch limit: processes at most `batchLimit` documents per call (default 50).
 *
 * C. Retry success:
 *    1. Delete the exact storage object using its preserved file key
 *    2. Hard-delete the pending document row
 *    3. Clear the pending item
 *
 * D. Retry failure:
 *    1. Preserve the pending item
 *    2. Return/log the real failure
 *    3. Remain idempotent
 */
export async function retryPendingStorageDeletions(
  leadId?: number,
  batchLimit = 50,
): Promise<{ retried: number[]; stillPending: number[]; processed: number; alerted: number[] }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Query for deletion-pending documents (with or without leadId filter)
  const whereClause = leadId != null
    ? and(
        eq(leadDocuments.leadId, leadId),
        eq(leadDocuments.lifecycleStatus as any, "deletion-pending"),
        eq(leadDocuments.storageDeletePending as any, 1),
      )
    : and(
        eq(leadDocuments.lifecycleStatus as any, "deletion-pending"),
        eq(leadDocuments.storageDeletePending as any, 1),
      );

  const pending = await db
    .select()
    .from(leadDocuments)
    .where(whereClause)
    .limit(batchLimit);

  const retried: number[] = [];
  const stillPending: number[] = [];
  const alerted: number[] = [];
  const now = new Date();

  for (const doc of pending) {
    let ok = false;
    let storageErrMsg: string | null = null;

    if (doc.fileKey) {
      try {
        const { storageDelete } = await import("./storage");
        await storageDelete(doc.fileKey);
        ok = true;
      } catch (err: any) {
        const msg: string = err?.message ?? "Unknown storage error";
        // Treat "Not Found" / "NoSuchKey" as successful physical cleanup
        // (the object is already gone — safe to hard-delete the DB row)
        if (msg.includes("NoSuchKey") || msg.includes("Not Found") || msg.includes("404")) {
          ok = true;
        } else {
          ok = false;
          // Sanitize: strip any potential clinical content from the error message
          storageErrMsg = msg.replace(/[\r\n]/g, " ").slice(0, 500);
          console.warn(`[retryPendingStorageDeletions] S3 retry failed for doc ${doc.id}, key: ${doc.fileKey}: ${storageErrMsg}`);
        }
      }
    } else {
      // No fileKey — nothing to delete in S3; treat as successful
      ok = true;
    }

    if (ok) {
      // Success: delete AI translation rows and extraction attempts, then hard-delete the doc row
      try {
        await db.delete(documentTranslations).where(eq(documentTranslations.leadDocumentId, doc.id));
      } catch (err: any) {
        console.warn(`[retryPendingStorageDeletions] Failed to delete translations for doc ${doc.id}: ${err?.message}`);
      }
      try {
        const { extractionAttempts } = await import("../drizzle/schema");
        await db.delete(extractionAttempts).where(eq(extractionAttempts.documentId, doc.id));
      } catch { /* best-effort */ }
      await db.delete(leadDocuments).where(eq(leadDocuments.id, doc.id));
      retried.push(doc.id);
    } else {
      // Failure: increment attempt counter and record error
      const prevAttempts: number = (doc as any).storageDeleteAttempts ?? 0;
      const newAttempts = prevAttempts + 1;
      await db
        .update(leadDocuments)
        .set({
          storageDeleteAttempts: newAttempts,
          lastStorageDeleteAttemptAt: now,
          lastStorageDeleteError: storageErrMsg,
        } as any)
        .where(eq(leadDocuments.id, doc.id));

      // After 3 failures: create one operations alert (guard with cleanupAlertedAt)
      const alreadyAlerted = !!(doc as any).cleanupAlertedAt;
      if (newAttempts >= 3 && !alreadyAlerted) {
        try {
          const { notifyOwner } = await import("./_core/notification");
          const docAny = doc as any;
          const leadRef = docAny.leadId ? `Lead #${docAny.leadId}` : (docAny.patientId ? `Patient #${docAny.patientId}` : "Unknown");
          const sessionRef = docAny.draftSessionId ? ` | Session: ${docAny.draftSessionId}` : "";
          const delivered = await notifyOwner({
            title: "Storage Cleanup Alert: Persistent Deletion Failure",
            content: [
              `Document ID: ${doc.id}`,
              `${leadRef}${sessionRef}`,
              `Attempts: ${newAttempts}`,
              `Last attempt: ${now.toISOString()}`,
              `Error: ${storageErrMsg ?? "Unknown"}`,
              `Required action: Manual S3 cleanup for key: ${doc.fileKey ?? "N/A"}`,
            ].join("\n"),
            dedupeKey: `storage-cleanup:${doc.id}`,
          });
          if (delivered) {
            await db
              .update(leadDocuments)
              .set({ cleanupAlertedAt: now } as any)
              .where(eq(leadDocuments.id, doc.id));
            alerted.push(doc.id);
          }
        } catch (alertErr: any) {
          // Alert creation failed — log but do not lose the deletion-pending row
          console.error(`[retryPendingStorageDeletions] Failed to send alert for doc ${doc.id}: ${alertErr?.message}`);
        }
      }

      stillPending.push(doc.id);
    }
  }

  console.log(`[retryPendingStorageDeletions] processed=${pending.length} retried=${retried.length} stillPending=${stillPending.length} alerted=${alerted.length}`);
  return { retried, stillPending, processed: pending.length, alerted };
}

/**
 * Count documents with lifecycleStatus='deletion-pending' for a given lead.
 * Used by resetMedicalIntake to block resets when pending storage deletions exist.
 *
 * @param leadId - The lead whose documents to count
 * @returns The number of deletion-pending documents
 */
export async function countPendingDeletionDocuments(leadId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(leadDocuments)
    .where(
      and(
        eq(leadDocuments.leadId, leadId),
        eq(leadDocuments.lifecycleStatus as any, "deletion-pending"),
      ),
    );
  return Number(result[0]?.count ?? 0);
}

/**
 * Resolve the canonical intake state for a person identified by either leadId or patientId.
 *
 * Returns one of three statuses:
 * - { status: "none" }                    — no intake row exists for this person
 * - { status: "resolved", intake, leadId, patientId }
 *                                         — exactly one row, shared or standalone
 * - { status: "conflict", leadIntakeSummary, patientIntakeSummary, leadIntakeId, patientIntakeId }
 *                                         — two separate rows exist with real clinical data
 *                                           (one keyed by leadId, one keyed by patientId)
 *                                           Callers MUST block all writes and surface the conflict UI.
 *
 * The conflict case can only arise for persons who were linked AFTER both sides had
 * independently created intake rows (i.e., the linkLeadToExistingPatient flow was not
 * used, or was bypassed). Under normal operation (convert or link flows), this should
 * never occur because those flows resolve the conflict at link time.
 */
export type CanonicalIntakeResult =
  | { status: "none" }
  | { status: "resolved"; intake: ReturnType<typeof normalizeIntakeJSON>; leadId: number | null; patientId: number | null }
  | {
      status: "conflict";
      leadIntakeId: number;
      patientIntakeId: number;
      leadIntakeSummary: {
        id: number; intakeMode: string | null; updatedAt: Date | null;
        hasDocuments: boolean; sectionCount: number;
      };
      patientIntakeSummary: {
        id: number; intakeMode: string | null; updatedAt: Date | null;
        hasDocuments: boolean; sectionCount: number;
      };
    };

function buildIntakeSummary(intake: Record<string, unknown>, docCount: number): {
  id: number; intakeMode: string | null; updatedAt: Date | null;
  hasDocuments: boolean; sectionCount: number;
} {
  const SECTION_KEYS = [
    "artHistory", "surgicalHistory", "miscarriageHistory", "previousTests",
    "radiologyStudies", "maleRadiologyStudies", "generalAttachmentsFemale",
    "generalAttachmentsMale", "femaleGeneticTests", "systemicDiseases",
    "maleIntake", "patientQuestions",
  ];
  let sectionCount = 0;
  for (const key of SECTION_KEYS) {
    const v = intake[key];
    if (Array.isArray(v) && v.length > 0) sectionCount++;
    else if (v && typeof v === "object" && Object.keys(v as object).length > 0) sectionCount++;
  }
  return {
    id: intake.id as number,
    intakeMode: (intake.intakeMode as string) ?? null,
    updatedAt: intake.updatedAt instanceof Date ? intake.updatedAt : null,
    hasDocuments: docCount > 0,
    sectionCount,
  };
}

export async function resolveCanonicalIntake(
  leadId: number | null | undefined,
  patientId: number | null | undefined,
): Promise<CanonicalIntakeResult> {
  const db = await getDb();
  if (!db) return { status: "none" };

  // Resolve the linked counterpart if only one side is provided
  const resolvedLeadId = leadId ?? (patientId ? await resolveLinkedLeadId(patientId) : null);
  const resolvedPatientId = patientId ?? (leadId ? await resolveLinkedPatientId(leadId) : null);

  // Fetch both possible rows in parallel
  const [leadIntakeRows, patientIntakeRows] = await Promise.all([
    resolvedLeadId
      ? db.select().from(medicalIntake).where(eq(medicalIntake.leadId, resolvedLeadId)).limit(1)
      : Promise.resolve([]),
    resolvedPatientId
      ? db.select().from(medicalIntake).where(eq(medicalIntake.patientId, resolvedPatientId)).limit(1)
      : Promise.resolve([]),
  ]);

  const leadRow = leadIntakeRows[0] ? normalizeIntakeJSON(leadIntakeRows[0]) as Record<string, unknown> : null;
  const patientRow = patientIntakeRows[0] ? normalizeIntakeJSON(patientIntakeRows[0]) as Record<string, unknown> : null;

  // Same row (patientId already stamped on the lead-owned row) → resolved
  if (leadRow && patientRow && (leadRow as any).id === (patientRow as any).id) {
    return {
      status: "resolved",
      intake: leadRow,
      leadId: resolvedLeadId ?? null,
      patientId: resolvedPatientId ?? null,
    };
  }

  // Only one row exists → resolved
  if (leadRow && !patientRow) {
    return { status: "resolved", intake: leadRow, leadId: resolvedLeadId ?? null, patientId: resolvedPatientId ?? null };
  }
  if (!leadRow && patientRow) {
    return { status: "resolved", intake: patientRow, leadId: resolvedLeadId ?? null, patientId: resolvedPatientId ?? null };
  }

  // No rows at all → none
  if (!leadRow && !patientRow) {
    return { status: "none" };
  }

  // Two separate rows — check if both have real clinical data
  const leadEmpty = isIntakeEmpty(leadRow!);
  const patientEmpty = isIntakeEmpty(patientRow!);

  // If one side is empty, treat the non-empty side as canonical (auto-resolve)
  if (leadEmpty && !patientEmpty) {
    return { status: "resolved", intake: patientRow!, leadId: resolvedLeadId ?? null, patientId: resolvedPatientId ?? null };
  }
  if (!leadEmpty && patientEmpty) {
    return { status: "resolved", intake: leadRow!, leadId: resolvedLeadId ?? null, patientId: resolvedPatientId ?? null };
  }
  if (leadEmpty && patientEmpty) {
    // Both empty — return the lead-owned row as canonical (arbitrary but consistent)
    return { status: "resolved", intake: leadRow!, leadId: resolvedLeadId ?? null, patientId: resolvedPatientId ?? null };
  }

  // Both rows have real clinical data → conflict
  // Count documents for each row to include in summaries
  const [leadDocCount, patientDocCount] = await Promise.all([
    resolvedLeadId
      ? db.select({ count: sql<number>`count(*)` }).from(leadDocuments).where(eq(leadDocuments.leadId, resolvedLeadId))
          .then(r => Number(r[0]?.count ?? 0))
      : Promise.resolve(0),
    resolvedPatientId
      ? db.select({ count: sql<number>`count(*)` }).from(leadDocuments).where(eq(leadDocuments.patientId, resolvedPatientId))
          .then(r => Number(r[0]?.count ?? 0))
      : Promise.resolve(0),
  ]);

  return {
    status: "conflict",
    leadIntakeId: (leadRow as any).id as number,
    patientIntakeId: (patientRow as any).id as number,
    leadIntakeSummary: buildIntakeSummary(leadRow!, leadDocCount),
    patientIntakeSummary: buildIntakeSummary(patientRow!, patientDocCount),
  };
}

/**
 * resolveIntakeConflict v2 — Admin-only transactional conflict resolution.
 *
 * Safety corrections implemented:
 *   1. Fully transactional document handling (doc updates inside the transaction).
 *   2. Stale-state revalidation using updatedAt timestamps (not just IDs).
 *   3. Server-side patientId resolution (ignores client-supplied patientId).
 *   4. requestId idempotency (using conflict_resolution_log table).
 *   5. Correct lifecycle filters: OR(leadId, patientId) for archive/delete.
 *   6. (See getConflictScope for server-calculated scope query.)
 *   7. (See resolveConflict procedure for no-default intakeMode enforcement.)
 *   8. (See resolveConflict procedure for full cache invalidation.)
 *   9. (See conflictResolutionV2.test.ts for 21 required tests.)
 *
 * Transaction covers: doc archive/delete + delete both rows + insert new row + idempotency log.
 * Audit log is fire-and-forget outside the transaction.
 */
export async function resolveIntakeConflict(opts: {
  leadId: number;
  requestId: string;
  expectedLeadIntakeId: number;
  expectedPatientIntakeId: number;
  expectedLeadUpdatedAt: Date;
  expectedPatientUpdatedAt: Date;
  docHandling: "archive" | "delete";
  newIntakeMode: "female" | "male" | "general";
  resolvedBy: number;
}): Promise<{ newIntakeId: number; archivedDocs: number[]; deletedDocs: number[]; storagePendingDocs: number[]; idempotent?: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // ── Correction 4: requestId idempotency check ─────────────────────────────
  const existingLog = await db
    .select()
    .from(conflictResolutionLog)
    .where(eq(conflictResolutionLog.requestId, opts.requestId))
    .limit(1);
  if (existingLog.length > 0) {
    const log = existingLog[0];
    return {
      newIntakeId: log.newIntakeId ?? 0,
      archivedDocs: (log.archivedDocs as number[]) ?? [],
      deletedDocs: (log.deletedDocs as number[]) ?? [],
      storagePendingDocs: (log.storagePendingDocs as number[]) ?? [],
      idempotent: true,
    };
  }

  // ── Correction 3: Server-side patientId resolution ────────────────────────
  // Never trust client-supplied patientId. Resolve it server-side from leadId.
  const resolvedPatientId = await resolveLinkedPatientId(opts.leadId);
  if (!resolvedPatientId) {
    throw new Error("no_linked_patient");
  }

  // ── Step 1: Revalidation guard (IDs + updatedAt stale-state check) ────────
  const [leadRows, patientRows] = await Promise.all([
    db.select({ id: medicalIntake.id, updatedAt: medicalIntake.updatedAt }).from(medicalIntake).where(eq(medicalIntake.leadId, opts.leadId)).limit(1),
    db.select({ id: medicalIntake.id, updatedAt: medicalIntake.updatedAt }).from(medicalIntake).where(eq(medicalIntake.patientId, resolvedPatientId)).limit(1),
  ]);
  const liveLeadRow = leadRows[0] ?? null;
  const livePatientRow = patientRows[0] ?? null;
  const liveLeadIntakeId = liveLeadRow?.id ?? null;
  const livePatientIntakeId = livePatientRow?.id ?? null;

  if (!liveLeadIntakeId || !livePatientIntakeId) {
    throw new Error("conflict_already_resolved");
  }
  if (liveLeadIntakeId !== opts.expectedLeadIntakeId || livePatientIntakeId !== opts.expectedPatientIntakeId) {
    throw new Error("conflict_state_changed");
  }

  // ── Correction 2: Stale-state revalidation using updatedAt ───────────────
  const leadUpdatedAt = liveLeadRow!.updatedAt instanceof Date
    ? liveLeadRow!.updatedAt
    : new Date(liveLeadRow!.updatedAt as any);
  const patientUpdatedAt = livePatientRow!.updatedAt instanceof Date
    ? livePatientRow!.updatedAt
    : new Date(livePatientRow!.updatedAt as any);
  const expectedLeadTs = opts.expectedLeadUpdatedAt instanceof Date
    ? opts.expectedLeadUpdatedAt.getTime()
    : new Date(opts.expectedLeadUpdatedAt as any).getTime();
  const expectedPatientTs = opts.expectedPatientUpdatedAt instanceof Date
    ? opts.expectedPatientUpdatedAt.getTime()
    : new Date(opts.expectedPatientUpdatedAt as any).getTime();
  // Correction 8 (v3): Compare at second-level precision (MySQL TIMESTAMP has 1-second resolution).
  // Math.floor(ms / 1000) strips sub-second noise from JSON round-trips while still
  // detecting a genuinely different stored second as stale.
  if (Math.floor(leadUpdatedAt.getTime() / 1000) !== Math.floor(expectedLeadTs / 1000)) {
    throw new Error("lead_intake_stale");
  }
  if (Math.floor(patientUpdatedAt.getTime() / 1000) !== Math.floor(expectedPatientTs / 1000)) {
    throw new Error("patient_intake_stale");
  }

  // ── Step 2: Collect non-direct-upload document IDs from both rows ─────────
  const allDocs = await db
    .select({ id: leadDocuments.id })
    .from(leadDocuments)
    .where(
      and(
        or(
          eq(leadDocuments.leadId, opts.leadId),
          eq(leadDocuments.patientId, resolvedPatientId),
        ),
        ne(leadDocuments.lifecycleStatus as any, "direct-upload"),
        ne(leadDocuments.lifecycleStatus as any, "deletion-pending"),
      ),
    );
  const docIds = allDocs.map((d) => d.id);

  // ── Correction 1: Fully transactional document handling ───────────────────
  // All document updates, row deletes, new row insert, and idempotency log
  // happen inside a single transaction. If any step fails, the entire
  // operation is rolled back — no partial state left behind.
  let newIntakeId!: number;
  let archivedDocs: number[] = [];
  let deletedDocs: number[] = [];
  let storagePendingDocs: number[] = [];

  await db.transaction(async (tx) => {
    // ── Step 3 (inside tx): Document handling ─────────────────────────────
    if (docIds.length > 0) {
      const now = new Date();
      if (opts.docHandling === "archive") {
        // Correction 5: OR(leadId, patientId) filter
        const ownerFilter = or(
          eq(leadDocuments.leadId, opts.leadId),
          eq(leadDocuments.patientId, resolvedPatientId),
        );
        await tx
          .update(leadDocuments)
          .set({
            lifecycleStatus: "historical" as any,
            archivedAt: now,
            archiveReason: "health-record-reset",
          } as any)
          .where(
            and(
              ownerFilter,
              inArray(leadDocuments.id, docIds),
              ne(leadDocuments.lifecycleStatus as any, "direct-upload"),
            ),
          );
        archivedDocs = docIds;
      } else {
        // Permanent delete: mark deletion-pending inside tx, then handle S3 outside
        // Correction 5: OR(leadId, patientId) filter
        const ownerFilter = or(
          eq(leadDocuments.leadId, opts.leadId),
          eq(leadDocuments.patientId, resolvedPatientId),
        );
        await tx
          .update(leadDocuments)
          .set({ lifecycleStatus: "deletion-pending" as any, storageDeletePending: true } as any)
          .where(
            and(
              ownerFilter,
              inArray(leadDocuments.id, docIds),
              ne(leadDocuments.lifecycleStatus as any, "direct-upload"),
            ),
          );
        // Translation rows deleted inside tx
        for (const docId of docIds) {
          await tx.delete(documentTranslations).where(eq(documentTranslations.leadDocumentId, docId));
        }
        // S3 deletions happen OUTSIDE the tx (after commit) to avoid tx timeout
        deletedDocs = [];
        storagePendingDocs = docIds; // all marked pending; resolved below
      }
    }

    // ── Steps 4 & 5: Delete both rows, insert new canonical row ──────────
    await tx.delete(medicalIntake).where(eq(medicalIntake.id, liveLeadIntakeId));
    await tx.delete(medicalIntake).where(eq(medicalIntake.id, livePatientIntakeId));
    const [result] = await tx.insert(medicalIntake).values({
      leadId: opts.leadId,
      patientId: resolvedPatientId,
      intakeMode: opts.newIntakeMode,
    });
    newIntakeId = (result as any).insertId as number;

    // ── Correction 4: Write idempotency record inside tx ─────────────────
    await tx.insert(conflictResolutionLog).values({
      requestId: opts.requestId,
      leadId: opts.leadId,
      patientId: resolvedPatientId,
      resolvedBy: opts.resolvedBy,
      newIntakeId,
      docHandling: opts.docHandling,
      newIntakeMode: opts.newIntakeMode,
      archivedDocs: archivedDocs as any,
      deletedDocs: [] as any,
      storagePendingDocs: storagePendingDocs as any,
    } as InsertConflictResolutionLog);
  });

  // ── Post-transaction: S3 deletions (for permanent delete mode) ────────────
  if (opts.docHandling === "delete" && storagePendingDocs.length > 0) {
    const actualDeleted: number[] = [];
    const stillPending: number[] = [];
    const db2 = await getDb();
    if (db2) {
      for (const docId of storagePendingDocs) {
        const docRows = await db2.select().from(leadDocuments).where(eq(leadDocuments.id, docId)).limit(1);
        const doc = docRows[0];
        if (!doc) { actualDeleted.push(docId); continue; }
        let storageOk = true;
        if (doc.fileKey) {
          try {
            const { storageDelete } = await import("./storage");
            await storageDelete(doc.fileKey);
          } catch {
            storageOk = false;
          }
        }
        if (storageOk) {
          await db2.delete(leadDocuments).where(eq(leadDocuments.id, docId));
          actualDeleted.push(docId);
        } else {
          stillPending.push(docId);
        }
      }
    }
    deletedDocs = actualDeleted;
    storagePendingDocs = stillPending;

    // Update idempotency log with final S3 results
    try {
      const db3 = await getDb();
      if (db3) {
        await db3.update(conflictResolutionLog)
          .set({ deletedDocs: actualDeleted as any, storagePendingDocs: stillPending as any })
          .where(eq(conflictResolutionLog.requestId, opts.requestId));
      }
    } catch {
      // Non-critical: idempotency log update failure does not affect the resolution result
    }
  }

  // ── Audit log (fire-and-forget, outside transaction) ─────────────────────
  try {
    await logAudit({
      action: "resolve_intake_conflict_v2",
      category: "medical_note",
      entityType: "medical_intake",
      entityId: newIntakeId,
      userId: opts.resolvedBy,
      metadata: {
        leadId: opts.leadId,
        patientId: resolvedPatientId,
        requestId: opts.requestId,
        deletedLeadIntakeId: liveLeadIntakeId,
        deletedPatientIntakeId: livePatientIntakeId,
        docHandling: opts.docHandling,
        newIntakeMode: opts.newIntakeMode,
        archivedDocs,
        deletedDocs,
        storagePendingDocs,
      },
    } as any);
  } catch {
    // Audit failure must not roll back the resolution — log silently.
  }

  return { newIntakeId, archivedDocs, deletedDocs, storagePendingDocs };
}

/**
 * getConflictScope — Server-calculated scope query for the Resolve Conflict dialog.
 *
 * Correction 4 (v3): Returns 9 separate document-category counts so the dialog
 * can display a precise breakdown for both Archive and Permanent Delete modes.
 *
 * Category definitions:
 *   activeDocCount       — active docs referenced by either conflicting intake row
 *   historicalDocCount   — historical docs belonging to the same canonical person
 *   directUploadCount    — direct-upload docs (always excluded from processing)
 *   deletionPendingCount — deletion-pending docs (excluded from reprocessing)
 *   unclassifiedCount    — docs with NULL lifecycleStatus (excluded unless safely attributable)
 *   archiveEligibleCount — unique docs that Archive will convert to historical (= active only)
 *   deleteEligibleCount  — unique docs that Permanent Delete will mark deletion-pending (active + historical)
 *   duplicatesRemoved    — number of duplicate doc IDs removed during deduplication
 *
 * The client must not calculate or submit document IDs.
 */
export async function getConflictScope(leadId: number): Promise<{
  leadIntakeId: number;
  patientIntakeId: number;
  leadUpdatedAt: Date;
  patientUpdatedAt: Date;
  leadSectionCount: number;
  patientSectionCount: number;
  // v4: intake mode of each conflicting row
  leadIntakeMode: string | null;
  patientIntakeMode: string | null;
  // v3 expanded counts
  activeDocCount: number;
  historicalDocCount: number;
  directUploadCount: number;
  deletionPendingCount: number;
  unclassifiedCount: number;
  archiveEligibleCount: number;
  deleteEligibleCount: number;
  duplicatesRemoved: number;
  // backward-compat total (= archiveEligibleCount)
  affectedDocCount: number;
} | null> {
  const db = await getDb();
  if (!db) return null;
  const resolvedPatientId = await resolveLinkedPatientId(leadId);
  if (!resolvedPatientId) return null;
  const [leadRows, patientRows] = await Promise.all([
    db.select().from(medicalIntake).where(eq(medicalIntake.leadId, leadId)).limit(1),
    db.select().from(medicalIntake).where(eq(medicalIntake.patientId, resolvedPatientId)).limit(1),
  ]);
  const leadRow = leadRows[0] ? normalizeIntakeJSON(leadRows[0]) as Record<string, unknown> : null;
  const patientRow = patientRows[0] ? normalizeIntakeJSON(patientRows[0]) as Record<string, unknown> : null;
  if (!leadRow || !patientRow) return null;
  // Only return scope if both rows are distinct (actual conflict)
  if ((leadRow as any).id === (patientRow as any).id) return null;
  const leadSummary = buildIntakeSummary(leadRow, 0);
  const patientSummary = buildIntakeSummary(patientRow, 0);

  // Fetch all docs owned by this lead or patient (any lifecycle status)
  const allDocs = await db
    .select({ id: leadDocuments.id, lifecycleStatus: leadDocuments.lifecycleStatus })
    .from(leadDocuments)
    .where(
      or(
        eq(leadDocuments.leadId, leadId),
        eq(leadDocuments.patientId, resolvedPatientId),
      ),
    );

  // Deduplicate by ID (a doc could theoretically appear under both leadId and patientId)
  const seenIds = new Set<number>();
  const uniqueDocs: { id: number; lifecycleStatus: string | null }[] = [];
  let duplicatesRemoved = 0;
  for (const doc of allDocs) {
    if (seenIds.has(doc.id)) {
      duplicatesRemoved++;
    } else {
      seenIds.add(doc.id);
      uniqueDocs.push({ id: doc.id, lifecycleStatus: doc.lifecycleStatus ?? null });
    }
  }

  let activeDocCount = 0;
  let historicalDocCount = 0;
  let directUploadCount = 0;
  let deletionPendingCount = 0;
  let unclassifiedCount = 0;

  for (const doc of uniqueDocs) {
    const s = doc.lifecycleStatus;
    if (s === "active") activeDocCount++;
    else if (s === "historical") historicalDocCount++;
    else if (s === "direct-upload") directUploadCount++;
    else if (s === "deletion-pending") deletionPendingCount++;
    else unclassifiedCount++; // null or unknown
  }

  // Archive: only active docs become historical
  const archiveEligibleCount = activeDocCount;
  // Permanent Delete: active + historical docs are eligible (direct-upload, deletion-pending, unclassified excluded)
  const deleteEligibleCount = activeDocCount + historicalDocCount;

  const leadUpdatedAt = (leadRow as any).updatedAt instanceof Date
    ? (leadRow as any).updatedAt
    : new Date((leadRow as any).updatedAt ?? Date.now());
  const patientUpdatedAt = (patientRow as any).updatedAt instanceof Date
    ? (patientRow as any).updatedAt
    : new Date((patientRow as any).updatedAt ?? Date.now());
  const leadIntakeMode = ((leadRow as any).intakeMode as string | null | undefined) ?? null;
  const patientIntakeMode = ((patientRow as any).intakeMode as string | null | undefined) ?? null;
  return {
    leadIntakeId: (leadRow as any).id as number,
    patientIntakeId: (patientRow as any).id as number,
    leadUpdatedAt,
    patientUpdatedAt,
    leadSectionCount: leadSummary.sectionCount,
    patientSectionCount: patientSummary.sectionCount,
    leadIntakeMode,
    patientIntakeMode,
    activeDocCount,
    historicalDocCount,
    directUploadCount,
    deletionPendingCount,
    unclassifiedCount,
    archiveEligibleCount,
    deleteEligibleCount,
    duplicatesRemoved,
    affectedDocCount: archiveEligibleCount, // backward-compat
  };
}

// ─── Pending-Draft Document Helpers ──────────────────────────────────────────
// These helpers manage the 'pending-draft' lifecycle for Health Record uploads.
// A pending-draft document is created when a user uploads a file inside the
// Health Record edit form. It is promoted to 'active' on Save, or deleted on Cancel.

/**
 * Create a pending-draft document row.
 * Returns the new document ID.
 */
export async function createPendingDraftDocument(data: {
  leadId?: number;
  patientId?: number;
  fileKey: string;
  fileUrl: string;
  fileName: string;
  mimeType?: string;
  uploadedBy: number;
  tag?: string;
  intakeSection?: string;
  docPassword?: string;
  sourceIntakeId?: number;
  draftSessionId: string;
  pendingSection?: string;
  pendingEntryKey?: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
  const result = await db.insert(leadDocuments).values({
    leadId: data.leadId,
    patientId: data.patientId,
    fileKey: data.fileKey,
    fileUrl: data.fileUrl,
    fileName: data.fileName,
    mimeType: data.mimeType,
    uploadedBy: data.uploadedBy,
    tag: data.tag,
    intakeSection: data.intakeSection,
    docPassword: data.docPassword,
    sourceIntakeId: data.sourceIntakeId,
    lifecycleStatus: "pending-draft" as any,
    draftSessionId: data.draftSessionId,
    draftLastActivityAt: now,
    pendingExpiresAt: expiresAt,
    pendingCreatedBy: data.uploadedBy,
    pendingSection: data.pendingSection,
    pendingEntryKey: data.pendingEntryKey,
  });
  return (result as any)[0]?.insertId ?? (result as any).insertId ?? 0;
}

/**
 * Fetch all pending-draft documents for a given draft session.
 * Used to validate ownership and restore draft state.
 */
export async function getPendingDraftDocsBySession(draftSessionId: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(leadDocuments)
    .where(
      and(
        eq(leadDocuments.draftSessionId as any, draftSessionId),
        eq(leadDocuments.lifecycleStatus as any, "pending-draft"),
      ),
    )
    .orderBy(desc(leadDocuments.createdAt));
}

/**
 * Promote a list of pending-draft documents to 'active'.
 * Called during the atomic Save transaction.
 * Sets lifecycleStatus = 'active', promotedAt = now, clears pending metadata.
 */
export async function promotePendingDraftDocs(docIds: number[], sourceIntakeId?: number) {
  if (docIds.length === 0) return;
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const now = new Date();
  await db
    .update(leadDocuments)
    .set({
      lifecycleStatus: "active" as any,
      promotedAt: now,
      draftSessionId: null,
      draftLastActivityAt: null,
      pendingExpiresAt: null,
      pendingCreatedBy: null,
      pendingSection: null,
      pendingEntryKey: null,
      ...(sourceIntakeId ? { sourceIntakeId } : {}),
    } as any)
    .where(
      and(
        sql`${leadDocuments.id} IN (${sql.join(docIds.map(id => sql`${id}`), sql`, `)})`,
        eq(leadDocuments.lifecycleStatus as any, "pending-draft"),
      ),
    );
}

/**
 * Cancel (delete) all pending-draft documents for a given draft session.
 * Sets lifecycleStatus = 'deletion-pending' and storageDeletePending = true
 * so the storage cleanup retry job can remove the S3 objects.
 */
export async function cancelPendingDraftDocs(draftSessionId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Mark for deletion — the storage retry job handles S3 cleanup
  await db
    .update(leadDocuments)
    .set({
      lifecycleStatus: "deletion-pending" as any,
      storageDeletePending: true,
    } as any)
    .where(
      and(
        eq(leadDocuments.draftSessionId as any, draftSessionId),
        eq(leadDocuments.lifecycleStatus as any, "pending-draft"),
      ),
    );
}

/**
 * Expire old pending-draft documents that have passed their pendingExpiresAt timestamp.
 * Called by the hourly cleanup Heartbeat job.
 * Marks expired docs as 'deletion-pending' so the storage retry job removes them.
 * Returns the count of docs marked for deletion.
 */
export async function expireOldPendingDraftDocs(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const now = new Date();
  const result = await db
    .update(leadDocuments)
    .set({
      lifecycleStatus: "deletion-pending" as any,
      storageDeletePending: true,
    } as any)
    .where(
      and(
        eq(leadDocuments.lifecycleStatus as any, "pending-draft"),
        and(
          isNotNull(leadDocuments.pendingExpiresAt),
          lt(leadDocuments.pendingExpiresAt, now),
        ),
      ),
    );
  return (result as any)[0]?.affectedRows ?? 0;
}

/**
 * Update the draft activity timestamp for a session (throttled by caller).
 * Extends the 24-hour expiry window.
 */
export async function touchDraftSession(draftSessionId: string) {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  await db
    .update(leadDocuments)
    .set({
      draftLastActivityAt: now,
      pendingExpiresAt: expiresAt,
    } as any)
    .where(
      and(
        eq(leadDocuments.draftSessionId as any, draftSessionId),
        eq(leadDocuments.lifecycleStatus as any, "pending-draft"),
      ),
    );
}

/**
 * Immediately cancel a draft session:
 * 1. Fetch all pending-draft docs for the session
 * 2. Delete their S3 storage objects immediately (best-effort)
 * 3. Delete their document_translations rows
 * 4. Hard-delete the lead_documents rows
 * Returns the count of docs cleaned up.
 */
export async function cancelDraftSessionImmediate(draftSessionId: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // 1. Fetch all pending-draft docs for this session
  const pendingDocs = await db
    .select({
      id: leadDocuments.id,
      fileKey: leadDocuments.fileKey,
    })
    .from(leadDocuments)
    .where(
      and(
        eq(leadDocuments.draftSessionId as any, draftSessionId),
        eq(leadDocuments.lifecycleStatus as any, "pending-draft"),
      ),
    );

  if (pendingDocs.length === 0) return 0;

  const docIds = pendingDocs.map((d) => d.id);

  // 2. Delete S3 storage objects immediately (best-effort, don't fail on missing)
  const { storageDelete } = await import("./storage");
  await Promise.allSettled(
    pendingDocs
      .filter((d) => d.fileKey)
      .map((d) => storageDelete(d.fileKey!)),
  );

  // 3. Delete document_translations rows for these docs
  await db
    .delete(documentTranslations)
    .where(inArray(documentTranslations.leadDocumentId, docIds));

  // 4. Hard-delete the lead_documents rows
  await db
    .delete(leadDocuments)
    .where(
      and(
        inArray(leadDocuments.id, docIds),
        eq(leadDocuments.lifecycleStatus as any, "pending-draft"),
      ),
    );

  return docIds.length;
}

// ─── Writer Token Validation ──────────────────────────────────────────────────
/**
 * Validate that the provided activeWriterToken matches the active draft session.
 * Throws FORBIDDEN if the token is wrong or the session is not active.
 * Returns the session row on success.
 */
export async function validateWriterToken(opts: {
  draftSessionId: string;
  activeWriterToken: string;
}): Promise<DraftSession> {
  const { TRPCError } = await import("@trpc/server");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
  const rows = await db
    .select()
    .from(draftSessions)
    .where(eq(draftSessions.draftSessionId, opts.draftSessionId))
    .limit(1);
  const session = rows[0];
  if (!session) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Draft session not found. Please refresh and try again." });
  }
  if (session.status === "cancelled") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This draft session has been cancelled." });
  }
  if (session.status === "expired") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This draft session has expired. Please refresh and start a new edit." });
  }
  if (session.status === "saved") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This draft session has already been saved." });
  }
  if (session.activeWriterToken !== opts.activeWriterToken) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your write session has been taken over by another tab or device. Please refresh to continue." });
  }
  if (new Date() > new Date(session.writerLeaseExpiresAt)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your write session has expired. Please refresh to continue." });
  }
  return session as DraftSession;
}

// ─── Extraction Attempt Helpers ───────────────────────────────────────────────
/**
 * Register a new extraction attempt for a document.
 * If a previous attempt exists for the same document, supersede it.
 * Returns the new attemptId and generationId.
 */
export async function registerExtractionAttempt(opts: {
  documentId: number;
  draftSessionId?: string | null;
  createdBy: number;
}): Promise<{ attemptId: string; generationId: number }> {
  const { TRPCError } = await import("@trpc/server");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

  const { documentId, draftSessionId, createdBy } = opts;

  // Find any existing active/processing attempt for this document
  const existing = await db
    .select()
    .from(extractionAttempts)
    .where(
      and(
        eq(extractionAttempts.documentId, documentId),
        inArray(extractionAttempts.status, ["pending", "processing"]),
      ),
    )
    .orderBy(desc(extractionAttempts.generationId))
    .limit(1);

  const prevGeneration = existing[0]?.generationId ?? 0;
  const newGenerationId = prevGeneration + 1;
  const newAttemptId = crypto.randomUUID();

  // Supersede any previous active attempt
  if (existing[0]) {
    await db
      .update(extractionAttempts)
      .set({
        status: "superseded",
        supersededBy: newAttemptId,
        updatedAt: new Date(),
      } as any)
      .where(eq(extractionAttempts.id, existing[0].id));
  }

  // Insert new attempt
  await db.insert(extractionAttempts).values({
    attemptId: newAttemptId,
    documentId,
    draftSessionId: draftSessionId ?? null,
    generationId: newGenerationId,
    status: "processing",
    createdBy,
    startedAt: new Date(),
  } as any);

  return { attemptId: newAttemptId, generationId: newGenerationId };
}

/**
 * Complete an extraction attempt (after LLM write succeeds).
 * Returns false if the attempt was superseded or cancelled (late-write rejection).
 */
export async function completeExtractionAttempt(opts: {
  attemptId: string;
  translationId: number;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Re-read the attempt to check it's still valid
  const rows = await db
    .select()
    .from(extractionAttempts)
    .where(eq(extractionAttempts.attemptId, opts.attemptId))
    .limit(1);
  const attempt = rows[0];
  if (!attempt) return false;
  if (attempt.status !== "processing") {
    // Superseded or cancelled — reject the late write
    return false;
  }

  await db
    .update(extractionAttempts)
    .set({
      status: "completed",
      translationId: opts.translationId,
      completedAt: new Date(),
      updatedAt: new Date(),
    } as any)
    .where(eq(extractionAttempts.attemptId, opts.attemptId));

  return true;
}

/**
 * Cancel all active extraction attempts for a draft session.
 * Called when the session is cancelled or expired.
 */
export async function cancelExtractionAttemptsBySession(draftSessionId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  await db
    .update(extractionAttempts)
    .set({
      status: "canceled",
      canceledAt: now,
      updatedAt: now,
    } as any)
    .where(
      and(
        eq(extractionAttempts.draftSessionId, draftSessionId),
        inArray(extractionAttempts.status, ["pending", "processing"]),
      ),
    );
}

/**
 * Cancel all active extraction attempts for a specific document.
 * Called when the document is deleted (Cancel path).
 */
export async function cancelExtractionAttemptsByDocument(documentId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  await db
    .update(extractionAttempts)
    .set({
      status: "canceled",
      canceledAt: now,
      updatedAt: now,
    } as any)
    .where(
      and(
        eq(extractionAttempts.documentId, documentId),
        inArray(extractionAttempts.status, ["pending", "processing"]),
      ),
    );
}

// ─── Updated cancelDraftSessionImmediate with terminal state ─────────────────
/**
 * Immediately cancel a draft session (Phase 2 Final Correction):
 * 1. Atomically set draft_sessions.status = 'cancelled', record canceledAt, canceledBy
 * 2. Cancel all active extraction attempts for this session
 * 3. Fetch all pending-draft docs for the session
 * 4. Delete their S3 storage objects immediately (best-effort)
 * 5. Delete their document_translations rows
 * 6. Hard-delete the lead_documents rows
 * Returns the count of docs cleaned up.
 */
export async function cancelDraftSessionImmediateV2(opts: {
  draftSessionId: string;
  canceledBy?: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available"); // intentionally not TRPCError — called from cleanup paths

  const { draftSessionId, canceledBy } = opts;
  const now = new Date();

  // 1. Atomically mark session as cancelled
  await db
    .update(draftSessions)
    .set({
      status: "cancelled",
      canceledAt: now,
      canceledBy: canceledBy ?? null,
      activeWriterToken: "REVOKED-" + crypto.randomUUID().slice(0, 8),
      updatedAt: now,
    } as any)
    .where(
      and(
        eq(draftSessions.draftSessionId, draftSessionId),
        inArray(draftSessions.status, ["active"]),
      ),
    );

  // 2. Cancel all active extraction attempts for this session
  await cancelExtractionAttemptsBySession(draftSessionId);

  // 3. Fetch all pending-draft docs for this session
  const pendingDocs = await db
    .select({
      id: leadDocuments.id,
      fileKey: leadDocuments.fileKey,
    })
    .from(leadDocuments)
    .where(
      and(
        eq(leadDocuments.draftSessionId as any, draftSessionId),
        eq(leadDocuments.lifecycleStatus as any, "pending-draft"),
      ),
    );

  if (pendingDocs.length === 0) return 0;

  const docIds = pendingDocs.map((d) => d.id);

  // 4. Delete S3 storage objects immediately (best-effort, don't fail on missing)
  const { storageDelete } = await import("./storage");
  await Promise.allSettled(
    pendingDocs
      .filter((d) => d.fileKey)
      .map((d) => storageDelete(d.fileKey!)),
  );

  // 5. Delete document_translations rows for these docs
  await db
    .delete(documentTranslations)
    .where(inArray(documentTranslations.leadDocumentId, docIds));

  // 6. Hard-delete the lead_documents rows
  await db
    .delete(leadDocuments)
    .where(
      and(
        inArray(leadDocuments.id, docIds),
        eq(leadDocuments.lifecycleStatus as any, "pending-draft"),
      ),
    );

  return docIds.length;
}

// ─── Updated expireOldPendingDraftDocs with terminal session state ────────────
/**
 * Expire old pending-draft sessions and their documents.
 * Phase 2 Final Correction: also marks draft_sessions.status = 'expired'.
 */
export async function expireOldDraftSessionsAndDocs(): Promise<{ expiredSessions: number; expiredDocs: number }> {
  const db = await getDb();
  if (!db) return { expiredSessions: 0, expiredDocs: 0 };
  const now = new Date();

  // 1. Find sessions past their pendingExpiresAt (or writerLeaseExpiresAt if no pendingExpiresAt)
  const expiredSessionRows = await db
    .select({ draftSessionId: draftSessions.draftSessionId })
    .from(draftSessions)
    .where(
      and(
        eq(draftSessions.status, "active"),
        or(
          and(isNotNull(draftSessions.pendingExpiresAt), lt(draftSessions.pendingExpiresAt, now)),
          and(isNull(draftSessions.pendingExpiresAt), lt(draftSessions.writerLeaseExpiresAt, now)),
        ),
      ),
    );

  let expiredSessions = 0;
  let expiredDocs = 0;

  for (const { draftSessionId } of expiredSessionRows) {
    // Mark session expired
    await db
      .update(draftSessions)
      .set({
        status: "expired",
        expiredAt: now,
        activeWriterToken: "EXPIRED-" + crypto.randomUUID().slice(0, 8),
        updatedAt: now,
      } as any)
      .where(eq(draftSessions.draftSessionId, draftSessionId));

    // Cancel active extraction attempts
    await cancelExtractionAttemptsBySession(draftSessionId);

    // Mark pending docs as deletion-pending
    const result = await db
      .update(leadDocuments)
      .set({
        lifecycleStatus: "deletion-pending" as any,
        storageDeletePending: true,
      } as any)
      .where(
        and(
          eq(leadDocuments.draftSessionId as any, draftSessionId),
          eq(leadDocuments.lifecycleStatus as any, "pending-draft"),
        ),
      );
    expiredDocs += (result as any)[0]?.affectedRows ?? 0;
    expiredSessions++;
  }

  return { expiredSessions, expiredDocs };
}
