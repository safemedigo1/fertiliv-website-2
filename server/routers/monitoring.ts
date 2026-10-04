/**
 * monitoring.ts — Remote Monitoring tRPC Router
 *
 * Access rules:
 * - Admin only: getSettings, updateSettings, getAuditLog, getMonitorableEmployees, startSession, endSession, logScreenshot
 * - Monitorable roles: staff, manager only (doctors and patients are NEVER monitored)
 * - WebRTC signaling: sendSignal (any authenticated), pollSignals (any authenticated)
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { monitoringSettings, monitoringSessions, monitoringConsents, monitoringSignals, users } from "../../drizzle/schema";
import { eq, desc, and, inArray, lt } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// Roles that CAN be monitored (staff and manager only)
const MONITORABLE_ROLES = ["staff", "manager"];

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

export const monitoringRouter = router({
  // ─── Settings ───────────────────────────────────────────────────────────────

  getSettings: adminProcedure.query(async () => {
    const db = await requireDb();
    const rows = await db.select().from(monitoringSettings).where(eq(monitoringSettings.id, 1));
    if (rows.length === 0) {
      return {
        id: 1,
        screenEnabled: false,
        screenshotEnabled: false,
        screenshotIntervalSeconds: 60,
        cameraEnabled: false,
        microphoneEnabled: false,
        updatedAt: new Date(),
        updatedById: null,
      };
    }
    return rows[0];
  }),

  updateSettings: adminProcedure
    .input(z.object({
      screenEnabled: z.boolean().optional(),
      screenshotEnabled: z.boolean().optional(),
      screenshotIntervalSeconds: z.number().int().min(10).max(3600).optional(),
      cameraEnabled: z.boolean().optional(),
      microphoneEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.update(monitoringSettings)
        .set({ ...input, updatedById: ctx.user.id })
        .where(eq(monitoringSettings.id, 1));
      const rows = await db.select().from(monitoringSettings).where(eq(monitoringSettings.id, 1));
      return rows[0];
    }),

  // ─── Monitorable Employees ───────────────────────────────────────────────────

  getMonitorableEmployees: adminProcedure.query(async () => {
    const db = await requireDb();
    const employees = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        avatarUrl: users.avatarUrl,
        lastSignedIn: users.lastSignedIn,
        isActive: users.isActive,
      })
      .from(users)
      .where(and(
        inArray(users.role, ["staff", "manager"]),
        eq(users.isActive, true),
      ))
      .orderBy(users.name);
    return employees;
  }),

  // ─── Sessions ───────────────────────────────────────────────────────────────

  startSession: adminProcedure
    .input(z.object({
      employeeId: z.number().int(),
      monitoringType: z.enum(["screen", "screenshot", "camera", "microphone"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const emp = await db.select({ role: users.role }).from(users).where(eq(users.id, input.employeeId));
      if (emp.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      if (!MONITORABLE_ROLES.includes(emp[0].role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This user role cannot be monitored" });
      }
      const result = await db.insert(monitoringSessions).values({
        adminId: ctx.user.id,
        employeeId: input.employeeId,
        monitoringType: input.monitoringType,
        startTime: new Date(),
      });
      const sessionId = (result as any)[0]?.insertId as number;
      return { sessionId };
    }),

  endSession: adminProcedure
    .input(z.object({ sessionId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const rows = await db.select().from(monitoringSessions).where(eq(monitoringSessions.id, input.sessionId));
      if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      const session = rows[0];
      if (session.adminId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your session" });
      const endTime = new Date();
      const durationSeconds = Math.round((endTime.getTime() - session.startTime.getTime()) / 1000);
      await db.update(monitoringSessions)
        .set({ endTime, durationSeconds })
        .where(eq(monitoringSessions.id, input.sessionId));
      return { success: true, durationSeconds };
    }),

  logScreenshot: adminProcedure
    .input(z.object({
      sessionId: z.number().int(),
      screenshotUrl: z.string(),
      capturedAt: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const rows = await db.select().from(monitoringSessions).where(eq(monitoringSessions.id, input.sessionId));
      if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      const existing = (rows[0].screenshotUrls as Array<{ url: string; capturedAt: string }>) ?? [];
      const updated = [...existing, { url: input.screenshotUrl, capturedAt: input.capturedAt }];
      await db.update(monitoringSessions)
        .set({ screenshotUrls: updated })
        .where(eq(monitoringSessions.id, input.sessionId));
      return { success: true };
    }),

  // ─── Audit Log ──────────────────────────────────────────────────────────────

  getAuditLog: adminProcedure
    .input(z.object({
      employeeId: z.number().int().optional(),
      monitoringType: z.enum(["screen", "screenshot", "camera", "microphone"]).optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions: ReturnType<typeof eq>[] = [];
      if (input.employeeId) conditions.push(eq(monitoringSessions.employeeId, input.employeeId));
      if (input.monitoringType) conditions.push(eq(monitoringSessions.monitoringType, input.monitoringType));

      const sessions = await db
        .select({
          id: monitoringSessions.id,
          adminId: monitoringSessions.adminId,
          employeeId: monitoringSessions.employeeId,
          monitoringType: monitoringSessions.monitoringType,
          startTime: monitoringSessions.startTime,
          endTime: monitoringSessions.endTime,
          durationSeconds: monitoringSessions.durationSeconds,
          screenshotUrls: monitoringSessions.screenshotUrls,
          adminName: users.name,
        })
        .from(monitoringSessions)
        .leftJoin(users, eq(monitoringSessions.adminId, users.id))
        .where(conditions.length > 0 ? and(...(conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]])) : undefined)
        .orderBy(desc(monitoringSessions.startTime))
        .limit(input.limit)
        .offset(input.offset);

      const employeeIds: number[] = Array.from(new Set(sessions.map(s => s.employeeId)));
      const employeeRows = employeeIds.length > 0
        ? await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(inArray(users.id, employeeIds))
        : [];
      const empMap: Record<number, { id: number; name: string | null; role: string }> = {};
      for (const e of employeeRows) empMap[e.id] = e;

      return sessions.map(s => ({
        ...s,
        employeeName: empMap[s.employeeId]?.name ?? "Unknown",
        employeeRole: empMap[s.employeeId]?.role ?? "unknown",
      }));
    }),

  // ─── Consent ────────────────────────────────────────────────────────────────

  logConsent: protectedProcedure
    .input(z.object({
      ipAddress: z.string().optional(),
      userAgent: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!MONITORABLE_ROLES.includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only staff and managers can consent to monitoring" });
      }
      const db = await requireDb();
      await db.insert(monitoringConsents).values({
        userId: ctx.user.id,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
      return { success: true };
    }),

  // ─── WebRTC Signaling ────────────────────────────────────────────────────────
  // Used for peer-to-peer streaming: admin sends offer → employee answers → streams flow

  sendSignal: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      toUserId: z.number().int(),
      type: z.enum(["offer", "answer", "ice-candidate", "request", "reject", "end"]),
      payload: z.string(), // JSON-serialized SDP or ICE candidate
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      // Validate: admin can send to staff/manager; staff/manager can only answer back to admin
      if (ctx.user.role === "admin") {
        // Admin can signal any staff/manager
        const target = await db.select({ role: users.role }).from(users).where(eq(users.id, input.toUserId));
        if (target.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Target user not found" });
        if (!MONITORABLE_ROLES.includes(target[0].role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Target user cannot be monitored" });
        }
      } else if (MONITORABLE_ROLES.includes(ctx.user.role)) {
        // Employee can only send answer/ice-candidate/reject/end back to an admin
        const target = await db.select({ role: users.role }).from(users).where(eq(users.id, input.toUserId));
        if (target.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Target user not found" });
        if (target[0].role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Can only signal back to admin" });
        }
        if (!["answer", "ice-candidate", "reject", "end"].includes(input.type)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Employees can only send answer/ice/reject/end signals" });
        }
      } else {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your role cannot use monitoring signals" });
      }

      await db.insert(monitoringSignals).values({
        sessionId: input.sessionId,
        fromUserId: ctx.user.id,
        toUserId: input.toUserId,
        type: input.type,
        payload: input.payload,
        consumed: false,
        createdAt: Date.now(),
      });

      return { success: true };
    }),

  // Poll for pending signals addressed to the current user (long-poll style)
  pollSignals: protectedProcedure
    .input(z.object({
      sessionId: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();

      const conditions = [
        eq(monitoringSignals.toUserId, ctx.user.id),
        eq(monitoringSignals.consumed, false),
      ];
      if (input.sessionId) {
        conditions.push(eq(monitoringSignals.sessionId, input.sessionId));
      }

      const signals = await db
        .select()
        .from(monitoringSignals)
        .where(and(...(conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]])))
        .orderBy(monitoringSignals.createdAt)
        .limit(20);

      if (signals.length > 0) {
        const ids = signals.map(s => s.id);
        await db.update(monitoringSignals)
          .set({ consumed: true })
          .where(inArray(monitoringSignals.id, ids));
      }

      // Clean up old consumed signals older than 5 minutes
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      await db.delete(monitoringSignals)
        .where(and(
          eq(monitoringSignals.consumed, true),
          lt(monitoringSignals.createdAt, fiveMinutesAgo),
        ));

      return signals;
    }),
});
