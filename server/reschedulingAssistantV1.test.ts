import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const db = fs.readFileSync(path.join(root, "server", "db.ts"), "utf8");
const routers = fs.readFileSync(path.join(root, "server", "routers.ts"), "utf8");
const availabilityPage = fs.readFileSync(path.join(root, "client", "src", "pages", "AvailabilityPage.tsx"), "utf8");
const schema = fs.readFileSync(path.join(root, "drizzle", "schema.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "drizzle", "0077_rescheduling_assistant_v1.sql"), "utf8");
const exceptionMigration = fs.readFileSync(path.join(root, "drizzle", "0078_rescheduling_v1_exception_source.sql"), "utf8");
const outsideHoursMigration = fs.readFileSync(path.join(root, "drizzle", "0080_rescheduling_outside_clinic_hours_exception.sql"), "utf8");
const availabilityFoundation = fs.readFileSync(path.join(root, "shared", "availabilityFoundation.ts"), "utf8");

describe("Rescheduling Assistant V1", () => {
  it("retains append-only neutral reschedule evidence without appointment foreign keys", () => {
    expect(schema).toContain('pgTable("appointment_reschedule_events"');
    expect(schema).toContain('source: varchar("source", { length: 64 }).notNull()');
    expect(migration).not.toMatch(/FOREIGN KEY|ON DELETE|REFERENCES/i);
    expect(db).toContain("appointmentRescheduleEvents");
    expect(db).toContain('selected.outsideClinicHoursOverride ? "manual_outside_clinic_hours_override" : "staff_time_off_rescheduling_assistant"');
    expect(schema).toContain('exceptionReason: text("exceptionReason")');
    expect(outsideHoursMigration).toContain("ADD COLUMN `exceptionReason` text NULL");
  });

  it("generates nearby automatic candidates only within two Istanbul calendar days around Time-Off and only inside clinic windows", () => {
    expect(db).toContain("getReschedulingReviewForTimeOff");
    expect(db).toContain("getReschedulingNearbyReviewWindow");
    expect(db).toContain("addIstanbulCalendarDays(timeOffStartDate, -2)");
    expect(db).toContain("addIstanbulCalendarDays(timeOffLastCoveredDate, 2)");
    expect(db).toContain("getClinicWindowCandidateStarts");
    expect(db).toContain("for (const { start, minuteOfDay: minute } of clinicWindowCandidateStarts)");
    expect(db).toContain("minute += 15");
    expect(db).toContain("isIstanbulIntervalWithinWorkingHours");
    expect(db).toContain("getAppointmentAvailabilityConflicts");
    expect(db).toContain("checkAppointmentConflicts");
    expect(db).toContain("hasHostAppointmentOverlap");
    expect(db).toContain("No explicit staff or doctor scheduling owner is assigned");
    expect(availabilityFoundation).toContain("getIstanbulDateKey(start) !== getIstanbulDateKey(end)");
    expect(db).toContain('relativeToTimeOff: "before"');
    expect(db).toContain('relativeToTimeOff: "after"');
    expect(db).toContain("collectEligible(beforePotential, 2, before)");
    expect(db).toContain("collectEligible(afterPotential, 2, after)");
  });

  it("limits acceptance to Admin and revalidates before a same-row update and same-event G2 sync", () => {
    const appointmentSection = routers.slice(routers.indexOf("appointments: router({"), routers.indexOf("finance: router({"));
    expect(appointmentSection).toContain("reschedulingReview: staffOrAdminProcedure");
    expect(appointmentSection).toContain("acceptReschedulingCandidate: adminProcedure");
    expect(appointmentSection).toContain("applyReschedulingCandidate");
    expect(appointmentSection).toContain('"rescheduled_due_to_staff_time_off"');
    expect(appointmentSection).toContain('"appointment_rescheduled_due_to_staff_time_off"');
    expect(appointmentSection).toContain("runGoogleCalendarG2Sync(input.appointmentId, false");
    expect(appointmentSection).not.toContain("applyAllRescheduling");
    expect(db).toContain("getReschedulingApplyPrecondition");
    expect(db).toContain("candidate_precondition_validation_started");
    expect(db).toContain("validateReschedulingCandidate");
    expect(db).toContain("This appointment is no longer eligible for the selected rescheduling candidate");
  });

  it("requires an explicit source-linked Admin exception, keeps it visible as resolved, and never syncs Google for that decision", () => {
    const appointmentSection = routers.slice(routers.indexOf("appointments: router({"), routers.indexOf("finance: router({"));
    const keepSection = appointmentSection.slice(appointmentSection.indexOf("keepReschedulingException: adminProcedure"), appointmentSection.indexOf("stats: staffOrAdminProcedure"));
    expect(schema).toContain('availabilityOverrideTimeOffId: integer("availabilityOverrideTimeOffId")');
    expect(exceptionMigration).toContain("idx_appointments_availabilityOverrideTimeOffId");
    expect(db).toContain("keepAppointmentAsTimeOffException");
    expect(db).toContain("availabilityOverrideTimeOffId: input.timeOffId");
    expect(db).toContain("requiresAction: false");
    expect(db).toContain("availabilityOverrideTimeOffId: null");
    expect(appointmentSection).toContain("keepReschedulingException: adminProcedure");
    expect(keepSection).toContain('reason: z.string().trim().min(3).max(500)');
    expect(keepSection).toContain('"availability_exception_kept_for_staff_time_off"');
    expect(keepSection).not.toContain("runGoogleCalendarG2Sync");
  });

  it("derives source-linked exception activity from the current source rather than the retained historical reason", () => {
    expect(db).toContain("isSourceTimeOffOverrideActive");
    expect(availabilityFoundation).toContain("source still exists");
    expect(routers).toContain("isOverridden: activeOverride.isActive");
    expect(availabilityPage).toContain("utils.appointments.availabilityOverrideState.invalidate()");
    const calendar = fs.readFileSync(path.join(root, "client", "src", "pages", "CalendarPage.tsx"), "utf8");
    expect(calendar).toContain("availabilityOverrideState?.isOverridden &&");
    expect(calendar).not.toContain("availabilityOverrideState?.isOverridden || a.availabilityOverrideReason");
  });

  it("keeps one compact active review item with balanced suggestions and no reassignment or bulk execution", () => {
    const reviewSection = availabilityPage.slice(
      availabilityPage.indexOf("function CompactReschedulingReviewDialog"),
      availabilityPage.indexOf("function ReschedulingReviewDialog"),
    );
    expect(reviewSection).toContain("expandedAppointmentId");
    expect(reviewSection).toContain("unresolvedItems.map(renderQueueRow)");
    expect(reviewSection).toContain("Resolved");
    expect(reviewSection).toContain("Suggested");
    expect(reviewSection).toContain("Alternative");
    expect(reviewSection).toContain("Needs Rescheduling");
    expect(reviewSection).toContain("Before Time-Off");
    expect(reviewSection).toContain("After Time-Off");
    expect(reviewSection).toContain("Keep as Exception");
    expect(reviewSection).toContain("keepReschedulingException");
    expect(reviewSection).toContain("Kept as Exception");
    expect(reviewSection).toContain("acceptReschedulingCandidate");
    expect(reviewSection).toContain("View More Availability");
    expect(reviewSection).not.toContain("Reassign");
    expect(reviewSection).not.toContain("Apply All");
  });

  it("opens review from the authoritative saved Time-Off ID rather than a pre-save conflict guess", () => {
    expect(availabilityPage).toContain("timeOffId: created.timeOffId");
    expect(availabilityPage).toContain("<CompactReschedulingReviewDialog");
    expect(routers).toContain("return { success: true, timeOffId };");
  });

  it("refreshes remaining candidates after a move and retains durable resolved outcomes in the compact queue", () => {
    const compactReview = availabilityPage.slice(availabilityPage.indexOf("function CompactReschedulingReviewDialog"), availabilityPage.indexOf("function ReschedulingAvailabilityPicker"));
    expect(compactReview).toContain("Schedule changed — refreshing remaining suggestions");
    expect(compactReview).toContain("Refresh Suggestions");
    expect(compactReview).toContain("const result = await refetch()");
    expect(compactReview).not.toContain("utils.appointments.reschedulingReview.invalidate({ timeOffId })");
    expect(compactReview).toContain("const nextUnresolved = result.data?.items.find((item) => item.requiresAction)");
    expect(db).toContain("appointmentRescheduleEvents");
    expect(db).toContain("resolution: \"rescheduled\"");
    expect(db).toContain("const unresolvedItems = activeItems.filter((item) => item.requiresAction)");
  });

  it("reuses the authoritative availability engine for picker slots and exposes only server-classified states", () => {
    const appointmentSection = routers.slice(routers.indexOf("appointments: router({"), routers.indexOf("finance: router({"));
    expect(db).toContain("getReschedulingAvailabilityForDate");
    expect(db).toContain("getReschedulingCandidateState");
    expect(db).toContain('"valid" | "blocked" | "occupied" | "outside_working_hours" | "past"');
    expect(db).toContain("isIstanbulIntervalWithinWorkingHours");
    expect(db).toContain("getAppointmentAvailabilityConflicts");
    expect(db).toContain("checkAppointmentConflicts");
    expect(appointmentSection).toContain("reschedulingAvailabilityForDate: staffOrAdminProcedure");
    expect(availabilityPage).toContain("slot.state !== \"valid\"");
    expect(availabilityPage).toContain("Time-Off / blocked");
    expect(availabilityPage).toContain("Outside clinic hours");
  });

  it("uses Clinic Working Hours as the hard boundary and Doctor Regular Default Schedule only as soft preference context", () => {
    expect(db).toContain("type ReschedulingScheduleContext");
    expect(db).toContain("clinicHardHours: WeeklyWorkingHours");
    expect(db).toContain("doctorRegularDefault: WeeklyWorkingHours | null");
    expect(db).toContain("getReschedulingScheduleContext");
    expect(db).toContain("scheduleContext.clinicHardHours");
    expect(db).toContain("withinDoctorRegularDefault");
    expect(db).not.toContain("ownerHours.every((schedule) => isIstanbulIntervalWithinWorkingHours");
    expect(availabilityPage).toContain("Preferred doctor default hours");
    expect(availabilityPage).toContain("Valid clinic time outside default hours");
    expect(availabilityPage).toContain("Outside clinic hours");
  });

  it("allows only an Admin-confirmed outside-clinic-hours exception after hard checks, without expanding suggestions", () => {
    expect(db).toContain("outsideClinicHoursExceptionEligible");
    expect(db).toContain("const isOutsideClinicWorkingHours = !isIstanbulIntervalWithinWorkingHours");
    expect(db).toContain("input.outsideClinicHoursOverride ? !isOutsideClinicHoursException : details.state !== \"valid\"");
    expect(db).toContain('source: selected.outsideClinicHoursOverride ? "manual_outside_clinic_hours_override" : "staff_time_off_rescheduling_assistant"');
    expect(db).toContain("exceptionReason: selected.outsideClinicHoursOverride ? input.exceptionReason?.trim() || null : null");
    expect(routers).toContain("outsideClinicHoursOverride: z.boolean().optional()");
    expect(routers).toContain("exceptionReason: z.string().trim().max(500).optional()");
    expect(availabilityPage).toContain("Confirm Exception");
    expect(availabilityPage).toContain("outsideClinicHoursExceptionEligible");
    expect(db).toContain("getClinicWindowCandidateStarts");
  });

  it("retains every supported historical reschedule outcome in its original Time-Off Review after the appointment leaves the overlap", () => {
    const reviewProjection = db.slice(db.indexOf("export async function getReschedulingReviewForTimeOff"), db.indexOf("export async function getReschedulingReviewSummaries"));
    expect(reviewProjection).toContain("inArray(appointmentRescheduleEvents.source, [");
    expect(reviewProjection).toContain('"staff_time_off_rescheduling_assistant"');
    expect(reviewProjection).toContain('"manual_outside_clinic_hours_override"');
    expect(reviewProjection).toContain("if (activeIds.has(event.appointmentId)) continue;");
    expect(reviewProjection).toContain("currentStart: event.oldStart");
    expect(reviewProjection).toContain("resolvedStart: event.newStart");
    expect(reviewProjection).toContain("items: [...unresolvedItems, ...exceptionItems, ...resolvedItems]");
    expect(reviewProjection).not.toContain('eq(appointmentRescheduleEvents.source, "staff_time_off_rescheduling_assistant")');
  });

  it("uses a shared nearby review snapshot and retains per-candidate final validation during apply", () => {
    expect(db).toContain("getReschedulingCandidateQueryContext");
    expect(db).toContain("getReschedulingNearbyReviewSnapshot");
    expect(db).toContain("reviewSnapshot.availabilityBlocks.filter");
    expect(db).toContain("reviewSnapshot.activeAppointments");
    expect(db).toContain("queryContext?: ReschedulingCandidateQueryContext");
    expect(db).toContain("availabilityBlocks");
    expect(db).toContain("activeAppointments");
    expect(db).toContain("getReschedulingCandidateQueryContext({ appointment, rangeStart: dayStart, rangeEnd: dayEnd })");
    const applySection = db.slice(db.indexOf("export async function applyReschedulingCandidate"), db.indexOf("export async function keepAppointmentAsTimeOffException"));
    expect(applySection).toContain("validateReschedulingCandidate");
    expect(applySection).not.toContain("queryContext");
  });

  it("keeps manual calendar availability always accessible and unrestricted by the nearby automatic window", () => {
    const compactReview = availabilityPage.slice(availabilityPage.indexOf("function CompactReschedulingReviewDialog"), availabilityPage.indexOf("function ReschedulingReviewDialog"));
    const picker = availabilityPage.slice(availabilityPage.indexOf("function ReschedulingAvailabilityPicker"));
    expect(compactReview).toContain("View More Availability");
    expect(compactReview).toContain("initialDateKey={[getIstanbulDateKey(review.timeOff.startDate), getIstanbulDateKey(new Date())]");
    expect(picker).toContain("changeDate(7)");
    expect(picker).toContain("Jump to future date");
    expect(picker).not.toContain("addDateKeyDays(getIstanbulDateKey(review.timeOff.startDate), -7)");
  });

  it("keeps More Availability horizontally contained, mobile-compact, and save-safe while review counts wait for authority", () => {
    const compactReview = availabilityPage.slice(availabilityPage.indexOf("function CompactReschedulingReviewDialog"), availabilityPage.indexOf("function ReschedulingReviewDialog"));
    const picker = availabilityPage.slice(availabilityPage.indexOf("function ReschedulingAvailabilityPicker"));
    expect(compactReview).toContain("Review counts loading");
    expect(compactReview).toContain("isLoading ? <span");
    expect(picker).toContain("overflow-hidden overscroll-contain touch-pan-y");
    expect(picker).toContain("overflow-x-clip overflow-y-auto overscroll-contain touch-pan-y");
    expect(picker).toContain("touch-pan-y");
    expect(picker).toContain("grid-cols-[minmax(0,1fr)_auto_auto]");
    expect(picker).toContain("−7d");
    expect(picker).toContain("+7d");
    expect(picker).toContain("grid-cols-6");
    expect(picker).toContain("sticky bottom-0");
    expect(picker).toContain("Save Reschedule");
  });

  it("captures only safe technical diagnostics and never exposes raw technical text to the review user", () => {
    const appointmentSection = routers.slice(routers.indexOf("appointments: router({"), routers.indexOf("finance: router({"));
    const compactReview = availabilityPage.slice(availabilityPage.indexOf("function CompactReschedulingReviewDialog"), availabilityPage.indexOf("function ReschedulingReviewDialog"));
    expect(appointmentSection).toContain("recordReschedulingDiagnostic: adminProcedure");
    expect(appointmentSection).toContain("rescheduling_review_technical_diagnostic");
    expect(compactReview).toContain("recordDiagnostic");
    expect(compactReview).toContain("candidateValueType");
    expect(compactReview).not.toContain("toast.error(error.message");
  });

  it("distinguishes typed stale candidates from unexpected apply-stage operational failures without changing a review candidate", () => {
    const appointmentSection = routers.slice(routers.indexOf("appointments: router({"), routers.indexOf("finance: router({"));
    const compactReview = availabilityPage.slice(availabilityPage.indexOf("function CompactReschedulingReviewDialog"), availabilityPage.indexOf("function ReschedulingAvailabilityPicker"));
    expect(db).toContain("ReschedulingApplyOperationalError");
    expect(db).toContain('"review_recomputation"');
    expect(db).toContain('"candidate_validation"');
    expect(db).toContain('"optimistic_version_check"');
    expect(db).toContain('"appointment_update"');
    expect(db).toContain('"durable_reschedule_event_insert"');
    expect(db).toContain('if (error instanceof TRPCError) throw error');
    expect(appointmentSection).toContain("rescheduling_apply_operational_failure");
    expect(appointmentSection).toContain("SERVICE_UNAVAILABLE");
    expect(appointmentSection).toContain("rescheduling_apply_post_commit_google_failure");
    expect(appointmentSection).toContain("Stage: post_commit_google_update");
    expect(appointmentSection).toContain("The appointment was not changed due to a temporary system error. Please try again.");
    expect(compactReview).toContain('data?.code === "PRECONDITION_FAILED"');
    expect(compactReview).toContain("Availability changed. Suggestions were refreshed; select a current slot.");
    expect(compactReview).toContain("The appointment was not changed due to a temporary system error. Please try again.");
  });

  it("keeps the existing atomic update/event boundary and same mapped Google event path for a successful retry", () => {
    expect(db).toContain("await db.transaction");
    expect(db).toContain("await tx.insert(appointmentRescheduleEvents)");
    expect(routers).toContain("runGoogleCalendarG2Sync(input.appointmentId, false");
    expect(routers).toContain("googleSyncOperationalFailure");
    expect(routers).not.toContain("retryReschedulingCandidate");
  });

  it("uses a target-only source-Time-Off precondition before final validation rather than recomputing every affected review item during apply", () => {
    const applySection = db.slice(db.indexOf("export async function applyReschedulingCandidate"), db.indexOf("export async function keepAppointmentAsTimeOffException"));
    expect(db).toContain("async function getReschedulingApplyPrecondition");
    expect(applySection).toContain("getReschedulingApplyPrecondition({");
    expect(applySection).toContain("validateReschedulingCandidate({");
    expect(applySection).not.toContain("getReschedulingReviewForTimeOff(input.timeOffId)");
    expect(applySection).toContain("await db.transaction");
    expect(applySection).toContain("await tx.insert(appointmentRescheduleEvents)");
  });

  it("labels the durable original and new reschedule times explicitly in resolved review rows", () => {
    const compactReview = availabilityPage.slice(availabilityPage.indexOf("function CompactReschedulingReviewDialog"), availabilityPage.indexOf("function ReschedulingAvailabilityPicker"));
    expect(compactReview).toContain('"Original appointment: "');
    expect(compactReview).toContain("Original appointment: {formatIstanbulSlot(item.currentStart)}");
    expect(compactReview).toContain("Rescheduled to:");
  });

  it("correlates every accepted-candidate request from its appointment-scoped client attempt through server receipt and commit", () => {
    const appointmentSection = routers.slice(routers.indexOf("appointments: router({"), routers.indexOf("finance: router({"));
    const compactReview = availabilityPage.slice(availabilityPage.indexOf("function CompactReschedulingReviewDialog"), availabilityPage.indexOf("function ReschedulingAvailabilityPicker"));
    expect(availabilityPage).toContain("function createReschedulingCorrelationId");
    expect(compactReview).toContain("const correlationId = createReschedulingCorrelationId()");
    expect(compactReview).toContain("appointmentId: item.appointmentId");
    expect(compactReview).toContain("candidateStart,");
    expect(compactReview).toContain("expectedUpdatedAt: item.updatedAt");
    expect(compactReview).toContain("correlationId,");
    expect(appointmentSection).toContain("correlationId: z.string().uuid()");
    expect(appointmentSection).toContain("rescheduling_apply_request_received");
    expect(appointmentSection).toContain("rescheduling_apply_committed");
    expect(appointmentSection).toContain("correlationId: input.correlationId");
  });

  it("keeps A-first and B-first candidate attempts independent even when both use the same slot timestamp", () => {
    const compactReview = availabilityPage.slice(availabilityPage.indexOf("function CompactReschedulingReviewDialog"), availabilityPage.indexOf("function ReschedulingAvailabilityPicker"));
    expect(compactReview).toContain("items.find((entry) => entry.appointmentId === variables.appointmentId)");
    expect(compactReview).toContain("key={item.appointmentId}");
    expect(compactReview).toContain("exceptionReasons[item.appointmentId]");
    expect(compactReview).toContain("setPickerItem(item)");
    expect(compactReview).not.toContain("selectedCandidate");
  });

  it("records distinguishable safe outcomes for typed stale rejection, pre-receipt interruption, and operational failure after receipt", () => {
    const appointmentSection = routers.slice(routers.indexOf("appointments: router({"), routers.indexOf("finance: router({"));
    const compactReview = availabilityPage.slice(availabilityPage.indexOf("function CompactReschedulingReviewDialog"), availabilityPage.indexOf("function ReschedulingAvailabilityPicker"));
    expect(appointmentSection).toContain("rescheduling_apply_precondition_rejected");
    expect(appointmentSection).toContain("rescheduling_apply_operational_failure");
    expect(appointmentSection).toContain("Outcome: received");
    expect(appointmentSection).toContain("Outcome: committed");
    expect(compactReview).toContain('data?.code === "PRECONDITION_FAILED"');
    expect(compactReview).toContain("The appointment was not changed due to a temporary system error. Please try again.");
    expect(compactReview).not.toContain("retryReschedulingCandidate");
  });

  it("never initializes, navigates, returns, proposes, or applies past Istanbul availability", () => {
    const compactReview = availabilityPage.slice(availabilityPage.indexOf("function CompactReschedulingReviewDialog"), availabilityPage.indexOf("function ReschedulingReviewDialog"));
    const picker = availabilityPage.slice(availabilityPage.indexOf("function ReschedulingAvailabilityPicker"), availabilityPage.indexOf("function ReschedulingReviewDialog"));
    expect(compactReview).toContain("getIstanbulDateKey(new Date())");
    expect(picker).toContain("initialDateKey < todayKey ? todayKey : initialDateKey");
    expect(picker).toContain("disabled={dateKey <= todayKey || isSaving}");
    expect(picker).toContain("return next < todayKey ? todayKey : next");
    expect(db).toContain('Availability cannot be viewed for a past Istanbul date.');
    expect(db).toContain("if (input.candidateStart.getTime() <= (input.now ?? new Date()).getTime())");
    expect(db).toContain("if (start.getTime() <= reviewNow.getTime()) continue");
  });

  it("records the approved correlated validation, transaction, Google, and response stage markers without changing appointment semantics", () => {
    const appointmentSection = routers.slice(routers.indexOf("appointments: router({"), routers.indexOf("finance: router({"));
    expect(db).toContain('"candidate_precondition_validation_started"');
    expect(db).toContain('"availability_validation_passed"');
    expect(db).toContain('"availability_validation_failed"');
    expect(db).toContain('"db_transaction_started"');
    expect(db).toContain('"appointment_mutation_completed"');
    expect(db).toContain('"transaction_committed"');
    expect(db).toContain('"transaction_rolled_back"');
    expect(appointmentSection).toContain("rescheduling_apply_stage");
    expect(appointmentSection).toContain("g2_update_started");
    expect(appointmentSection).toContain("g2_update_completed");
    expect(appointmentSection).toContain("response_returned");
    expect(db).toContain("await db.transaction");
    expect(db).toContain("await tx.insert(appointmentRescheduleEvents)");
  });

  it("keeps inline and More Availability requests on the same mutation while recording only their safe source and elapsed evidence", () => {
    const appointmentSection = routers.slice(routers.indexOf("appointments: router({"), routers.indexOf("finance: router({"));
    const compactReview = availabilityPage.slice(availabilityPage.indexOf("function CompactReschedulingReviewDialog"), availabilityPage.indexOf("function ReschedulingAvailabilityPicker"));
    expect(compactReview).toContain('const applySource = operation === "picker_select" ? "more_availability" : "inline_candidate"');
    expect(compactReview).toContain("applySource,");
    expect(appointmentSection).toContain('applySource: z.enum(["inline_candidate", "more_availability"])');
    expect(appointmentSection).toContain("Apply source: ${input.applySource}");
    expect(appointmentSection).toContain("Elapsed: ${elapsedMs}ms");
    expect(db).toContain("onStage?: (marker: ReschedulingApplyMarker, elapsedMs: number)");
    expect(db).toContain("Date.now() - startedAt");
    expect(appointmentSection).toContain("onStage: (marker, elapsedMs)");
  });

  it("keeps review progress durable on the Time-Off record and resumes from current authoritative state", () => {
    const availabilitySection = routers.slice(routers.indexOf("availability: router({"));
    expect(db).toContain("getReschedulingReviewSummaries");
    expect(db).toContain("appointmentRescheduleEvents");
    expect(db).toContain("isCompleted: review.items.length > 0 && unresolvedCount === 0");
    expect(availabilitySection).toContain("reviewSummaries: staffOrAdminProcedure");
    expect(availabilityPage).toContain("Resume Review");
    expect(availabilityPage).toContain("All affected appointments reviewed ✓");
    expect(availabilityPage).toContain("setConflictEntry({ timeOffId: entry.id })");
  });

  it("returns each Time-Off card with its authoritative review summary instead of waiting for a second-stage card query", () => {
    const availabilitySection = routers.slice(routers.indexOf("availability: router({"));
    const availabilityList = availabilityPage.slice(availabilityPage.indexOf("export default function AvailabilityPage"), availabilityPage.indexOf("function AddTimeOffDialog"));
    expect(availabilitySection).toContain("const summaries = await getReschedulingReviewSummaries(entries.map((entry) => entry.id))");
    expect(availabilitySection).toContain("reviewSummary: byTimeOffId.get(entry.id) ?? null");
    expect(availabilityList).not.toContain("trpc.availability.reviewSummaries.useQuery");
    expect(availabilityList).toContain("Checking review status…");
    expect(availabilityList).toContain("const summary = entry.reviewSummary");
  });

  it("requires explicit picker confirmation and closes only the picker after an applied More Availability move", () => {
    const compactReview = availabilityPage.slice(availabilityPage.indexOf("function CompactReschedulingReviewDialog"), availabilityPage.indexOf("function ReschedulingAvailabilityPicker"));
    const picker = availabilityPage.slice(availabilityPage.indexOf("function ReschedulingAvailabilityPicker"), availabilityPage.indexOf("function ReschedulingReviewDialog"));
    expect(picker).toContain("const [selectedStart, setSelectedStart] = useState<Date | null>(null)");
    expect(picker).toContain("Selected time:");
    expect(picker).toContain("Save Reschedule");
    expect(picker).toContain("onClick={() => selectSlot(slot)}");
    expect(picker).not.toContain("onClick={() => onSelect(slot.start)}");
    expect(compactReview).toContain('if (variables.applySource === "more_availability") setPickerItem(null)');
    expect(compactReview).not.toContain("setPickerItem(null);\n    acceptCandidate.mutate");
    expect(compactReview).toContain("await refreshSuggestions(true)");
  });

  it("never lets picker selection, backdrop interaction, keyboard dismissal, or navigation apply an appointment", () => {
    const picker = availabilityPage.slice(availabilityPage.indexOf("function ReschedulingAvailabilityPicker"), availabilityPage.indexOf("function ReschedulingReviewDialog"));
    expect(picker).toContain("onPointerDownOutside={(event) => event.preventDefault()}");
    expect(picker).toContain("onInteractOutside={(event) => event.preventDefault()}");
    expect(picker).toContain("onEscapeKeyDown={(event) => event.preventDefault()}");
    expect(picker).toContain("onClick={() => selectSlot(slot)}");
    expect(picker).toContain("onClick={() => selectedStart && onSelect(selectedStart, selectedOutsideClinicHoursException, outsideClinicHoursReason)}");
    expect(picker).not.toContain("onClick={() => onSelect(slot.start)}");
    expect(picker).toContain("Back to review");
  });

  it("keeps the picker visibly stable while saving or loading and supports future-only day, week, and date-jump navigation", () => {
    const picker = availabilityPage.slice(availabilityPage.indexOf("function ReschedulingAvailabilityPicker"), availabilityPage.indexOf("function ReschedulingReviewDialog"));
    expect(picker).toContain("isSaving ? \"Saving…\" : \"Save Reschedule\"");
    expect(picker).toContain("disabled={!selectedStart || isSaving}");
    expect(picker).toContain('type="date"');
    expect(picker).toContain("min={todayKey}");
    expect(picker).toContain("Previous week");
    expect(picker).toContain("Next week");
    expect(picker).toContain("changeDate(-1)");
    expect(picker).toContain("changeDate(1)");
    expect(picker).toContain("changeDate(-7)");
    expect(picker).toContain("changeDate(7)");
    expect(picker).toContain("grid min-h-[348px]");
    expect(picker).toContain("Array.from({ length: 96 }");
    expect(picker).toContain("aria-busy={isDayLoading}");
    expect(picker).toContain("grid-cols-2 gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto_auto]");
    expect(picker).toContain("col-span-2 w-full max-w-full min-w-0 sm:col-span-1");
    expect(picker).toContain("w-full px-2 text-xs sm:w-auto sm:px-3");
    expect(picker).toContain("flex max-h-[calc(100dvh-1rem)]");
    expect(picker).toContain("min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto overscroll-contain touch-pan-y");
    expect(picker).toContain("grid min-h-[348px] grid-cols-6 gap-1 pb-4");
    expect(picker).toContain("z-10 shrink-0 space-y-3 border-t bg-background");
  });

  it("prefetches adjacent future display dates only and still relies on final server-side apply validation", () => {
    const picker = availabilityPage.slice(availabilityPage.indexOf("function ReschedulingAvailabilityPicker"), availabilityPage.indexOf("function ReschedulingReviewDialog"));
    expect(picker).toContain("utils.appointments.reschedulingAvailabilityForDate.prefetch");
    expect(picker).toContain("filter((key) => key >= todayKey)");
    expect(picker).toContain("staleTime: 30_000");
    const applySection = db.slice(db.indexOf("export async function applyReschedulingCandidate"), db.indexOf("export async function keepAppointmentAsTimeOffException"));
    expect(applySection).toContain("validateReschedulingCandidate");
  });

  it("requires a fresh explicit staff selection for every Add Time-Off session", () => {
    const addDialog = availabilityPage.slice(availabilityPage.indexOf("function AddTimeOffDialog"), availabilityPage.indexOf("function formatIstanbulSlot"));
    expect(addDialog).toContain('userId: ""');
    expect(addDialog).toContain("Select staff member…");
    expect(addDialog).toContain('if (!form.userId) return toast.error("Please select a staff member")');
    expect(addDialog).not.toContain("userId: currentUserId ? String(currentUserId)");
  });

  it("stacks Add Time-Off dates on narrow mobile while preserving the existing date input minima", () => {
    const addDialog = availabilityPage.slice(availabilityPage.indexOf("function AddTimeOffDialog"), availabilityPage.indexOf("function formatIstanbulSlot"));
    expect(addDialog).toContain("grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2");
    expect(addDialog).toContain("overflow-x-clip overflow-y-auto overscroll-contain touch-pan-y");
    expect(addDialog).toContain("min-w-0 space-y-4 overflow-x-clip");
    expect(addDialog).toContain('className="availability-native-date w-full max-w-full min-w-0"');
    expect(addDialog).toContain('type="date" min={todayStr} value={form.startDate}');
    expect(addDialog).toContain('type="date" min={form.startDate} value={form.endDate}');
    expect(addDialog).toContain("availability-native-date");
    expect(availabilityPage).toContain("availability-native-date col-span-2");
  });

  it("warns consistently before leaving unresolved review work and isolates toast interactions from modal dismissal", () => {
    const compactReview = availabilityPage.slice(availabilityPage.indexOf("function CompactReschedulingReviewDialog"), availabilityPage.indexOf("function ReschedulingAvailabilityPicker"));
    expect(compactReview).toContain("Unfinished Time-Off review");
    expect(compactReview).toContain("Continue Reviewing");
    expect(compactReview).toContain("Leave Review");
    expect(compactReview).toContain("onInteractOutside={keepToastInteractionInsideReview}");
    expect(compactReview).toContain('[data-sonner-toaster]');
    expect(compactReview).toContain("onEscapeKeyDown");
  });
});
