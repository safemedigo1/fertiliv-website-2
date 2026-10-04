import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { CLINIC_OWNER_EMAIL } from "../shared/clinicOwner";
import { UNIFIED_INBOX_TEXT_LIMIT, UNIFIED_INBOX_TEXT_LIMIT_MESSAGE } from "../shared/unifiedInbox";
import { getSessionCookieOptions } from "./_core/cookies";
import {
  createConfirmedAuthUser,
  deleteAuthUser,
  findAuthUserIdByEmail,
  passwordMatches,
  requestOrigin,
  sendPasswordReset,
  setAuthPassword,
  signInForLink,
  signOutFromRequest,
  supabaseAdmin,
  supabaseForRequest,
} from "./_core/supabaseAuth";
import { invokeLLM } from "./_core/llm";
import { createAiTelemetrySession } from "./ai/usageTelemetry";
import { invokeAiWorkload } from "./ai/runtime";
import {
  sendAppointmentDetailsEmail,
  sendInvoiceEmail,
  sendRefundEmail,
  sendReceiptEmailDirect,
  sendDoctorCaseAssignmentEmail,
  type RefundEmailData,
} from "./emailService";
import { resolveFinanceEmailRecipients } from "./financeEmailRecipients";
import { appointmentCommunicationActionLabel, buildAppointmentCommunicationProjection, isManualAppointmentCommunicationStatus, type AppointmentCommunicationLanguage } from "../shared/appointmentCommunication";
import { APPOINTMENT_COMMUNICATION_PUBLISHED_LOCALES, APPOINTMENT_COMMUNICATION_TEMPLATE_VERSION, resolveAppointmentCommunicationLocale } from "../shared/appointmentCommunicationLocales";
import { generateInvoicePdf, generateRefundPdf, generateReceiptPdf } from "./pdfService";
import { calculateTaxIncludedLine } from "../shared/serviceTax";
import { computeCollectionHint } from "../shared/invoicePricing";
import { deriveInvoiceDualBalancePresentation } from "../shared/invoiceDualBalance";
import { formatInvoiceLineDisplayName } from "../shared/invoiceLineDisplay";
import { getAgreedUnitSourceLineAmount, isAgreedUnitServicePriceEntry, servicePriceEntryKinds } from "../shared/servicePriceFx";
import {
  buildCumulativeReceiptData,
  isOfficialReceiptEligible,
  OFFICIAL_RECEIPT_UNAVAILABLE_MESSAGE,
} from "./receiptData";
import { pdfToPageImages } from "./pdfPageSplitter";
import { externalReportDateKey, isValidExternalReportDate } from "../shared/externalReportDate";
import { getNextCode, checkDuplicate } from "./codeSequences";
import { notifyOwner } from "./_core/notification";
import { sendNewIntakeNotification } from "./_core/email";
import { transcribeAudioGroq } from "./_core/groqTranscription";
import { encryptExternalReportDocumentPassword } from "./externalReportSourceCrypto";
import { logExternalReportFinalizeFailure, logExternalReportFinalizeStage, type ExternalReportFinalizeStage } from "./externalReportFinalizeObservability";
import { createLegacyExternalReportDocument, externalReportDocumentSchema } from "./externalReportDocument";
import {
  externalReportInputMethodSchema,
  externalReportLanguageSchema,
  externalReportProcessingGoalSchema,
  externalReportSourceLanguageSchema,
  executeExternalReportPlainTextOneCall,
  ExternalReportPlainTextEmptyResultError,
  legacyProcessingNoteForGoal,
  plainTextMedicalReportInstruction,
  resolveExternalReportProcessing,
} from "./externalReportProcessing";
import {
  acceptExternalReportV2Response,
  buildExternalReportV2Prompt,
  classifyExternalReportV2Failure,
  executeExternalReportV2OneCall,
  externalReportV2ProcessInputSchema,
  getExternalReportV2SourceSafetySubreason,
} from "./externalReportV2Processing";
import {
  createExternalReportV2ProcessProof,
  externalReportV2FinalizeInputSchema,
  validateExternalReportV2Finalize,
} from "./externalReportV2Finalize";
import { logExternalReportV2Finalize, logExternalReportV2Processing } from "./externalReportV2Observability";
import { generateMedicalScribeSummary, MedicalScribeUnavailableError } from "./medicalScribeAI";
import { systemRouter } from "./_core/systemRouter";
import { monitoringRouter } from "./routers/monitoring";
import { intakeFormsRouter } from "./routers/intakeForms";
import { dataIORouter } from "./routers/dataIO";
import { labDictionaryRouter } from "./routers/labDictionary";
import { googleCalendarRouter } from "./routers/googleCalendar";
import {
  deleteGoogleCalendarAppointmentEvent,
  generateGoogleCalendarAppointmentMeet,
  clearGoogleCalendarAppointmentConference,
  getGoogleCalendarAppointmentEventLink,
  getGoogleCalendarSafeStatus,
  retryGoogleCalendarAppointmentSync,
  syncGoogleCalendarAppointment,
} from "./googleCalendarService";
import { normalizeAppointmentTiming, normalizeModeScopedAppointmentFields, type AppointmentMode } from "../shared/appointmentScheduling";
import { assertMeetingLinkActionAllowed, canUseMeetingLinkActions } from "../shared/appointmentMeetingLinkLifecycle";
import { isAppointmentReactivation } from "../shared/appointmentCancellationLifecycle";
import { hasAuthoritativeAppointmentScheduleChanged } from "../shared/appointmentReminderPolicy";
import {
  getAppointmentReminderHistory,
  invalidateAppointmentReminderDeliveries,
  reconcileAppointmentReminderSchedule,
  restoreCancelledAppointmentReminders,
} from "./appointmentReminderService";
import { getBulkCancelOutcome, resolveBulkAppointmentReason, summarizeBulkAppointmentOutcomes, type AppointmentBulkCancelStatus } from "../shared/appointmentBulkActions";
import { formatAppointmentDeletionAuditDescription } from "../shared/appointmentDeletionAudit";
import { istanbulDateTimeToUtc } from "../shared/availabilityFoundation";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  getAllTaskTags,
  createTaskTag,
  updateTaskTag,
  deleteTaskTag,
  batchUpdateAppointments,
  checkAppointmentConflicts,
  createAppointment,
  createAppointmentCommunicationDelivery,
  createLabOrder,
  createLabResult,
  createMedicalNote,
  createNotification,
  createPatient,
  previewNextMRN,
  consumeNextMRN,
  updatePatientMRN,
  createSalesNote,
  createSalesTask,
  createService,
  createUserWithPassword,
  getAllDoctors,
  getDoctorById,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  getAllPatients,
  getAllServices,
  getAllUsers,
  getStaffUsers,
  getAppointmentStats,
  getAppointmentById,
  getAppointmentDeletionAuditSnapshot,
  getAppointmentCommunicationContext,
  getAppointments,
  getAppointmentsByDay,
  getFinanceStats,
  getInvoices,
  getPaginatedInvoices,
  getInvoiceById,
  getInvoiceItems,
  getLabOrders,
  getLabResults,
  getLabResultsByPatient,
  getMedicalNotes,
  getOffers,
  getPatientById,
  getPatientCommunicationLanguageFacts,
  getPatientStats,
  getRevenueByMonth,
  getSalesNotes,
  getSalesTasks,
  getServiceUtilization,
  getUnreadNotificationCount,
  getUserByEmail,
  linkSupabaseIdentity,
  saveAuthUserId,
  getUserById,
  getUserMessages,
  getUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateAppointment,
  updateInvoiceStatus,
  cancelInvoice,
  deleteInvoice,
  updateInvoice,
  updateLabOrder,
  updateMedicalNote,
  updatePatient,
  deletePatient,
  getPatientOutstandingBalance,
  updateSalesTask,
  updateService,
  updateUserLastSignedIn,
  updateUserRole,
  createInvoice,
  logAppointmentActivity,
  getAppointmentActivityLog,
  getGoogleCalendarAppointmentSync,
  cancelAppointmentWithLifecycle,
  deleteAppointment,
  getLeads,
  getLeadById,
  createLead,
  updateLead,
  getLeadCommunications,
  createLeadCommunication,
  updateLeadCommunication,
  softDeleteLeadCommunication,
  getLeadDocuments,
  getPatientDocuments,
  createLeadDocument,
  updateLeadDocumentTag,
  updateLeadDocumentPassword,
  deleteLeadDocument,
  getMedicalIntake,
  upsertMedicalIntake,
  deleteIntakeByLeadId,
  extractDocIdsFromIntake,
  archiveIntakeDocuments,
  permanentlyDeleteIntakeDocuments,
  retryPendingStorageDeletions,
  convertLeadToPatient,
  getLeadStats,
  getPartnerClinics,
  createPartnerClinic,
  updatePartnerClinic,
  deletePartnerClinic,
  getTreatmentPackages,
  createTreatmentPackage,
  updateTreatmentPackage,
  getTreatmentProposals,
  createTreatmentProposal,
  updateTreatmentProposal,
  deleteTreatmentProposal,
  linkLeadPartner,
  unlinkLeadPartner,
  getLeadPartner,
  convertCoupleToPatients,
  linkLeadToExistingPatient,
  isIntakeEmpty,
  bulkUpdateLeads,
  bulkDeleteLeads,
  bulkUpdateTasks,
  bulkDeleteTasks,
  getMedicalIntakeByPatientId,
  upsertMedicalIntakeForPatient,
  resolveLinkedLeadId,
  resolveLinkedPatientId,
  resolveCanonicalIntake,
  resolveIntakeConflict,
  getConflictScope,
  linkPatientPartner,
  unlinkPatientPartner,
  getPatientPartner,
  createStaffAvailability,
  getStaffAvailability,
  deleteStaffAvailability,
  getConflictingAppointments,
  getReschedulingReviewForTimeOff,
  getReschedulingReviewSummaries,
  getReschedulingAvailabilityForDate,
  applyReschedulingCandidate,
  ReschedulingApplyOperationalError,
  keepAppointmentAsTimeOffException,
  getActiveAppointmentAvailabilityOverride,
  getAppointmentTimeOffReviewState,
  isUserUnavailable,
  createWholeDayStaffAvailability,
  getAppointmentAvailabilityConflicts,
  getEffectiveWorkingHours,
  saveClinicDefaultWorkingHours,
  saveStaffWorkingHoursOverride,
  getPatientCommunications,
  createPatientCommunication,
  updatePatientCommunication,
  softDeletePatientCommunication,
  getTreatmentCycles,
  getTreatmentCycleById,
  createTreatmentCycle,
  updateTreatmentCycle,
  deleteTreatmentCycle,
  getCycleMonitoringVisits,
  createCycleMonitoringVisit,
  updateCycleMonitoringVisit,
  deleteCycleMonitoringVisit,
  getCycleMedications,
  createCycleMedication,
  updateCycleMedication,
  deleteCycleMedication,
  getMedicationAdherence,
  confirmMedicationAdherence,
  getCycleOutcome,
  upsertCycleOutcome,
  getAllClinicTags,
  createClinicTag,
  updateClinicTag,
  deleteClinicTag,
  getAllSpecializations,
  createSpecialization,
  updateSpecialization,
  deleteSpecialization,
  getAllSubSpecializations,
  createSubSpecialization,
  updateSubSpecialization,
  deleteSubSpecialization,
  createDocumentTranslation,
  updateDocumentTranslation,
  getDocumentTranslationsByPatient,
  getDocumentTranslationsByLeadDocument,
  deleteDocumentTranslation,
  getDoctorByUserId,
  deleteService,
  deleteLead,
  updateUserStatus,
  updateUserRoleAndStatus,
  deactivateUser,
  reactivateUser,
  countAdmins,
  updateOwnProfile,
  logAudit,
  getAuditLogs,
  ensureDoctorProfile,
  ensurePatientProfile,
  updateUserProfileByAdmin,
  createPayment,
  classifyInvoiceFinancialScope,
  quotePayment,
  quoteInitialPayments,
  correctLegacyInvoicePricingToAgreed,
  listPaymentsByInvoice,
  listOverpaymentCreditLotsByInvoice,
  voidPayment,
  updateInvoiceFull,
  reopenInvoiceForDraftRevision,
  saveInvoiceDraftRevision,
  publishInvoiceDraftRevision,
  getInvoiceRevisions,
  getInvoiceRevisionById,
  upsertProposalItems,
  listProposalItems,
  createWhatsappMessage,
  listWhatsappMessages,
  getPatientCreditBalance,
  addCreditTransaction,
  applyCreditToInvoice,
  quoteCrossCurrencyCreditApplication,
  applyCrossCurrencyCreditToInvoice,
  getReversiblePatientCreditApplications,
  getReversiblePatientCreditApplicationsByPatient,
  getPatientCreditApplicationHistory,
  reversePatientCreditApplication,
  quotePatientCreditPayout,
  createPatientCreditPayout,
  getPatientCreditPayouts,
  getPatientCreditPayoutReceipt,
  getPatientFxRoundingAdjustments,
  getSystemSettings,
  getCreditTransactions,
  getRefunds,
  getInvoiceFinancialSummary,
  createRefund,
  resolveTaxForNewInvoiceLines,
  resolveServicePriceEntry,
  listPaymentsByPatient,
  createTask,
  getTasks,
  getTaskById,
  updateTask as updateTaskDb,
  closeTask,
  deleteTask,
  getPatientDoctors,
  setPatientDoctors,
  getProposalById,
  getReferenceData,
  upsertReferenceData,
  deleteReferenceData,
  listCaseComments,
  createCaseComment,
  deleteCaseComment,
  listDoctorCases,
  upsertTreatmentPlan,
  getTreatmentPlanByCase,
  getTreatmentPlanById,
  listScenariosByPlan,
  createScenario,
  updateScenario,
  deleteScenario,
  reorderScenarios,
  createDoctorReviewRequest,
  getLatestReviewRequest,
  updateReviewRequestStatus,
  listPendingReviewRequestsForDoctor,
  createTreatmentPlan,
  updateTreatmentPlanById,
  listTreatmentPlansByDoctor,
  listTreatmentPlansByLead,
  listTreatmentPlansByPatient,
  listExternalReports,
  getExternalReportById,
  getExternalReportByV2SubmissionKey,
  createExternalReport,
  updateExternalReport,
  deleteExternalReport,
  getExternalReportSourceRevisions,
  getExternalReportProcessingRuns,
  getLiveExchangeRate,
  countPendingDeletionDocuments,
} from "./db";

const invoiceLineTaxSelectionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("rule"), taxRuleId: z.number().int().positive() }),
  z.object({ type: z.literal("custom"), ratePercent: z.string().trim().min(1).max(16) }),
]);

const servicePriceEntrySchema = z.object({
  currency: z.enum(["USD", "EUR", "GBP", "TRY", "SAR", "AED"]),
  amount: z.string().trim().min(1).max(32),
  kind: z.enum(servicePriceEntryKinds),
  fx: z.object({
    source: z.enum(["system", "manual"]),
    // Direct, unambiguous direction: 1 source currency = X invoice currency.
    rateToInvoice: z.string().trim().min(1).max(32).optional(),
    note: z.string().trim().max(500).optional(),
  }).optional(),
});

const invoiceFullUpdateInputSchema = z.object({
  id: z.number(),
  currency: z.enum(["USD", "EUR", "GBP", "TRY", "SAR", "AED"]).optional(),
  discountAmount: z.number().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  taxAmount: z.number().optional(),
  notes: z.string().optional(),
  dueDate: z.date().nullish(),
  pricingMode: z.enum(["discount", "agreed"]).optional(),
  finalAgreedAmount: z.string().optional(),
  items: z.array(z.object({
    id: z.number().optional(),
    serviceId: z.number().nullish(),
    lineLabel: z.string().trim().max(256).nullable().optional(),
    description: z.string(),
    quantity: z.number().min(1),
    unitPrice: z.number().min(0),
    totalPrice: z.number().min(0).optional(),
    linePricingMethod: z.enum(["none", "discount_percent", "final_line_total", "agreed_unit_price"]).optional(),
    lineDiscountPercent: z.number().min(0).max(100).nullable().optional(),
    taxIncludedMode: z.boolean().optional(),
    taxIncludedGross: z.string().trim().min(1).optional(),
    priceEntry: servicePriceEntrySchema.optional(),
    taxSelection: invoiceLineTaxSelectionSchema.optional(),
    taxRuleId: z.number().int().positive().nullable().optional(),
  })),
});

function legacyTaxSelectionToExplicit(input: { taxRuleId?: number | null }) {
  if (input.taxRuleId === undefined) return undefined;
  return input.taxRuleId === null ? { type: "none" as const } : { type: "rule" as const, taxRuleId: input.taxRuleId };
}

function canonicalizeTaxIncludedLine<T extends {
  linePricingMethod?: string | null;
  taxIncludedMode?: boolean | null;
  taxIncludedGross?: string | null;
  totalPrice: string;
}>(item: T, tax: { taxLabelSnapshot: string | null; taxRateSnapshot: string | null }): T {
  if (!item.taxIncludedMode) return item;
  if (item.taxIncludedGross == null || item.taxIncludedGross === "") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Enter the Tax-Included line total." });
  }
  if (item.linePricingMethod !== "final_line_total" && item.linePricingMethod !== "agreed_unit_price") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tax-Included price entry is available only for an agreed price." });
  }
  if (!tax.taxLabelSnapshot || tax.taxRateSnapshot == null) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a Tax before entering a Tax-Included line price." });
  }
  const included = calculateTaxIncludedLine({
    grossAmount: item.taxIncludedGross,
    taxRatePercent: tax.taxRateSnapshot,
  });
  return { ...item, totalPrice: included.taxableBase, taxIncludedGross: included.totalWithTax };
}

/**
 * Canonicalises a deliberately negotiated source-price entry before Tax is
 * calculated. It never consults payment records or Received At.
 */
async function canonicalizeServicePriceEntry<T extends {
  quantity: number;
  unitPrice: string | number;
  totalPrice?: string | number;
  linePricingMethod?: "none" | "discount_percent" | "final_line_total" | "agreed_unit_price";
  lineDiscountPercent?: string | number | null;
  taxIncludedMode?: boolean;
  taxIncludedGross?: string;
  priceEntry?: z.infer<typeof servicePriceEntrySchema>;
}>(item: T, invoiceCurrency: "USD" | "EUR" | "GBP" | "TRY" | "SAR" | "AED"): Promise<T & Record<string, unknown>> {
  if (!item.priceEntry) return item;
  const { priceEntry } = item;
  const sourceLineAmount = isAgreedUnitServicePriceEntry(priceEntry)
    ? getAgreedUnitSourceLineAmount(priceEntry, item.quantity)
    : undefined;
  const resolved = await resolveServicePriceEntry({ invoiceCurrency, priceEntry, sourceLineAmount });
  const base = { ...item } as Record<string, unknown>;
  delete base.priceEntry;
  const canonical: Record<string, unknown> = {
    ...base,
    priceEntryCurrency: resolved.priceEntryCurrency,
    priceEntryAmount: resolved.priceEntryAmount,
    priceEntryKind: resolved.priceEntryKind,
    priceFxRateToInvoice: resolved.priceFxRateToInvoice,
    priceFxSourceToTryRate: resolved.priceFxSourceToTryRate,
    priceFxInvoiceToTryRate: resolved.priceFxInvoiceToTryRate,
    priceFxSource: resolved.priceFxSource,
    priceFxEffectiveAt: resolved.priceFxEffectiveAt,
    priceFxNote: resolved.priceFxNote,
  };

  if (priceEntry.kind === "unit_price") {
    return {
      ...canonical,
      unitPrice: resolved.convertedAmount,
      totalPrice: undefined,
      linePricingMethod: "none",
      lineDiscountPercent: null,
      taxIncludedMode: false,
      taxIncludedGross: undefined,
    } as T & Record<string, unknown>;
  }

  if (priceEntry.kind === "tax_included_final_line_total" || priceEntry.kind === "tax_included_agreed_unit_price") {
    return {
      ...canonical,
      totalPrice: resolved.convertedAmount,
      linePricingMethod: priceEntry.kind === "tax_included_agreed_unit_price" ? "agreed_unit_price" : "final_line_total",
      lineDiscountPercent: null,
      taxIncludedMode: true,
      taxIncludedGross: resolved.convertedAmount,
    } as T & Record<string, unknown>;
  }

  return {
    ...canonical,
    totalPrice: resolved.convertedAmount,
    linePricingMethod: priceEntry.kind === "agreed_unit_price" ? "agreed_unit_price" : "final_line_total",
    lineDiscountPercent: null,
    taxIncludedMode: false,
    taxIncludedGross: undefined,
  } as T & Record<string, unknown>;
}

async function prepareInvoiceFullUpdate(input: z.infer<typeof invoiceFullUpdateInputSchema>, baseItems?: any[]) {
  const { id, ...data } = input;
  const { computeInvoiceTotals } = await import("../shared/invoicePricing");
  const { computeInvoiceLinePricing } = await import("../shared/invoiceLinePricing");
  const { computeServiceTaxInvoice, TAX_MODEL_VERSION } = await import("../shared/serviceTax");
  const pricingMode = data.pricingMode ?? "discount";
  const existingInv = await getInvoiceById(id) as any;
  if (!existingInv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
  const isTaxModelInvoice = existingInv.taxModelVersion === TAX_MODEL_VERSION;
  if (!isTaxModelInvoice && data.items.some(item => item.taxRuleId !== undefined || item.taxSelection !== undefined)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tax cannot be added to a legacy invoice. Create a new invoice to use Service Tax." });
  }
  const existingItems = baseItems ?? await getInvoiceItems(id) as any[];
  const existingTaxByItemId = new Map(existingItems.map(item => [item.id, item]));
  const explicitTaxByIndex = data.items.map(item => {
    const existingItem = item.id == null ? null : existingTaxByItemId.get(item.id);
    if (item.taxSelection !== undefined) return item.taxSelection;
    if (!existingItem) return legacyTaxSelectionToExplicit(item);
    if (item.taxRuleId === undefined || item.taxRuleId === existingItem.taxRuleId) return undefined;
    return legacyTaxSelectionToExplicit(item);
  });
  const newOrExplicitItems = data.items.flatMap((item, index) => {
    const existingItem = item.id == null ? null : existingTaxByItemId.get(item.id);
    const explicitLineTaxSelection = explicitTaxByIndex[index];
    if (existingItem && explicitLineTaxSelection === undefined) return [];
    return [{ index, serviceId: existingItem ? undefined : item.serviceId ?? undefined, explicitLineTaxSelection }];
  });
  const resolvedNewOrExplicitTaxes = await resolveTaxForNewInvoiceLines(newOrExplicitItems);
  const resolvedTaxByIndex = new Map(newOrExplicitItems.map((item, index) => [item.index, resolvedNewOrExplicitTaxes[index]! ]));
  const existingRate = existingInv?.paymentAdjustmentRateSnapshot != null ? String(existingInv.paymentAdjustmentRateSnapshot) : null;
  let canonicalItems: any[];
  try {
    canonicalItems = await Promise.all(data.items.map(async (item, index) => {
      const existingItem = item.id == null ? null : existingTaxByItemId.get(item.id);
      const resolvedTax = resolvedTaxByIndex.get(index);
      const tax = resolvedTax ?? {
        taxRuleId: existingItem?.taxRuleId ?? null,
        taxLabelSnapshot: existingItem?.taxLabelSnapshot ?? null,
        taxRateSnapshot: existingItem?.taxRateSnapshot == null ? null : String(existingItem.taxRateSnapshot),
      };
      const sourcePriced = item.priceEntry
        ? await canonicalizeServicePriceEntry(item, (data.currency ?? existingInv.currency ?? "TRY") as any)
        : {
            ...item,
            lineLabel: item.lineLabel === undefined ? existingItem?.lineLabel ?? null : item.lineLabel,
            priceEntryCurrency: existingItem?.priceEntryCurrency ?? null,
            priceEntryAmount: existingItem?.priceEntryAmount ?? null,
            priceEntryKind: existingItem?.priceEntryKind ?? null,
            priceFxRateToInvoice: existingItem?.priceFxRateToInvoice ?? null,
            priceFxSourceToTryRate: existingItem?.priceFxSourceToTryRate ?? null,
            priceFxInvoiceToTryRate: existingItem?.priceFxInvoiceToTryRate ?? null,
            priceFxSource: existingItem?.priceFxSource ?? null,
            priceFxEffectiveAt: existingItem?.priceFxEffectiveAt ?? null,
            priceFxNote: existingItem?.priceFxNote ?? null,
          };
      return canonicalizeTaxIncludedLine({
        ...sourcePriced,
        ...computeInvoiceLinePricing(sourcePriced as any),
        taxRuleId: tax.taxRuleId,
        taxLabelSnapshot: tax.taxLabelSnapshot,
        taxRateSnapshot: tax.taxRateSnapshot,
      }, tax);
    }));
  } catch (error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid line pricing." });
  }
  const subtotalNum = canonicalItems.reduce((sum: number, item: any) => sum + Number(item.totalPrice), 0);
  const computed = computeInvoiceTotals({
    subtotal: subtotalNum.toFixed(2),
    pricingMode,
    discountPercent: pricingMode === "discount" ? (data.discountPercent ?? 0) : undefined,
    finalAgreedAmount: pricingMode === "agreed" ? data.finalAgreedAmount : undefined,
    adjustmentRate: isTaxModelInvoice ? null : existingRate,
  });
  const taxComputed = isTaxModelInvoice ? computeServiceTaxInvoice({
    lines: canonicalItems.map((item, index) => ({
      key: index,
      totalPrice: item.totalPrice,
      taxIncludedGross: item.taxIncludedGross,
      tax: { taxRuleId: item.taxRuleId, taxLabelSnapshot: item.taxLabelSnapshot, taxRateSnapshot: item.taxRateSnapshot },
    })),
    invoiceWideDiscountAmount: pricingMode === "discount" ? computed.discountAmount : undefined,
    finalAgreedServiceAmount: pricingMode === "agreed" ? computed.totalAmount : undefined,
  }) : null;
  if (taxComputed) {
    canonicalItems = canonicalItems.map((item, index) => ({ ...item, effectiveTaxableBase: taxComputed.lines[index].effectiveTaxableBase, taxAmount: taxComputed.lines[index].taxAmount }));
  }
  return {
    id,
    data: {
      ...data,
      items: canonicalItems,
      dueDate: data.dueDate ?? null,
      subtotal: subtotalNum.toFixed(2),
      discountAmount: parseFloat(computed.discountAmount),
      discountPercent: parseFloat(computed.discountPercent),
      taxAmount: taxComputed ? Number(taxComputed.totalTaxAmount) : data.taxAmount ?? 0,
      totalAmount: taxComputed?.grandTotal ?? computed.totalAmount,
      pricingMode: computed.pricingMode,
      finalAgreedAmount: pricingMode === "agreed" ? taxComputed?.effectiveServiceSubtotal ?? computed.totalAmount : undefined,
      paymentAdjustmentRateSnapshot: computed.paymentAdjustmentRateSnapshot ?? undefined,
    },
  };
}

async function runGoogleCalendarG2Sync(
  appointmentId: number,
  allowCreateMapping: boolean,
  audit?: { userId: number; successAction: string },
) {
  try {
    const result = await syncGoogleCalendarAppointment(appointmentId, allowCreateMapping);
    if (audit && result.status === "synced" && result.didSync) {
      await logAppointmentActivity(appointmentId, audit.userId, audit.successAction, undefined, "Google Calendar synchronization completed.");
    } else if (audit && result.status === "failed") {
      await logAppointmentActivity(appointmentId, audit.userId, "google_sync_failed", undefined, "Google Calendar synchronization requires attention.");
    }
    return result;
  } catch {
    // Fertiliv remains authoritative: external-sync infrastructure failures never reject a saved appointment.
    console.warn("[GoogleCalendarG2] Appointment synchronization could not be started.");
    if (audit) await logAppointmentActivity(appointmentId, audit.userId, "google_sync_failed", undefined, "Google Calendar synchronization could not be started.");
    return { status: "failed" as const, message: "Google Calendar synchronization could not be started." };
  }
}

async function runGoogleCalendarG2Deletion(appointmentId: number) {
  try {
    return await deleteGoogleCalendarAppointmentEvent(appointmentId);
  } catch {
    // The durable mapping records a later deletion retry where possible; never restore a deleted Fertiliv appointment.
    console.warn("[GoogleCalendarG2] Appointment deletion synchronization could not be started.");
    return { status: "failed" as const, message: "Google Calendar deletion synchronization could not be started." };
  }
}

const passwordSchema = z.string().min(8).max(72);

function authFailure(error: unknown, fallback: string) {
  const code = error instanceof Error ? error.message : "";
  if (code === "EMAIL_IN_USE") return new TRPCError({ code: "CONFLICT", message: "Email already in use" });
  if (code === "WEAK_PASSWORD") return new TRPCError({ code: "BAD_REQUEST", message: "Password must be 8 to 72 characters." });
  if (code === "AUTH_NOT_CONFIGURED") return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Sign-in is not configured." });
  console.info("[auth] request failed", { code: code || "unknown" });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: fallback });
}

function blockedSignInMessage(reason: "pending" | "rejected" | "inactive") {
  if (reason === "pending") return "Your account is pending admin approval. Please wait for an administrator to activate your account.";
  if (reason === "rejected") return "Your account registration has been rejected. Please contact the clinic for assistance.";
  return "Your account has been deactivated. Please contact Fertiliv administration to reactivate your account.";
}

async function bindAuthPassword(user: { id: number; email: string | null; name: string | null; authUserId: string | null }, password: string) {
  if (!user.email) throw new TRPCError({ code: "BAD_REQUEST", message: "This account has no email address." });
  let authUserId = user.authUserId;
  let created = false;
  if (!authUserId) {
    try {
      const createdUser = await createConfirmedAuthUser({ email: user.email, password, name: user.name || "Clinic user" });
      authUserId = createdUser.id;
      created = true;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "EMAIL_IN_USE") throw error;
      authUserId = await findAuthUserIdByEmail(user.email);
      if (!authUserId) throw error;
    }
  }
  if (!created) await setAuthPassword(authUserId, password);
  if (authUserId !== user.authUserId) await saveAuthUserId(user.id, authUserId);
}

// ─── Admin middleware ─────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  return next({ ctx });
});

const staffOrAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "staff" && ctx.user.role !== "doctor" && ctx.user.role !== "manager") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Staff access required" });
  }
  return next({ ctx });
});

type AvailabilityOverrideResolution = {
  updates: Record<string, unknown>;
  applied: boolean;
  conflictCount: number;
};

async function resolveAppointmentAvailabilityOverride(input: {
  actor: { id: number; role: string };
  appointmentStart: Date;
  appointmentEnd: Date;
  doctorId?: number | null;
  hostUserId?: number | null;
  reason?: string;
  hasExistingOverride?: boolean;
  availabilityContextChanged: boolean;
}): Promise<AvailabilityOverrideResolution> {
  const conflicts = await getAppointmentAvailabilityConflicts({
    appointmentStart: input.appointmentStart,
    appointmentEnd: input.appointmentEnd,
    doctorId: input.doctorId,
    hostUserId: input.hostUserId,
  });
  if (conflicts.length === 0) {
    return {
      updates: input.availabilityContextChanged
        ? { availabilityOverrideReason: null, availabilityOverrideById: null, availabilityOverrideAt: null, availabilityOverrideTimeOffId: null }
        : {},
      applied: false,
      conflictCount: 0,
    };
  }
  const reason = input.reason?.trim();
  if (input.hasExistingOverride && !input.availabilityContextChanged && !reason) {
    return { updates: {}, applied: false, conflictCount: conflicts.length };
  }
  if (input.actor.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This appointment overlaps Staff Time-Off. Only an administrator can approve an availability override.",
    });
  }
  if (!reason || reason.length < 3) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "An availability override reason of at least 3 characters is required.",
    });
  }
  return {
    updates: {
      availabilityOverrideReason: reason,
      availabilityOverrideById: input.actor.id,
      availabilityOverrideAt: new Date(),
      availabilityOverrideTimeOffId: null,
    },
    applied: true,
    conflictCount: conflicts.length,
  };
}

const appointmentCommunicationsProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "staff") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Staff or administrator access is required to send appointment details." });
  }
  return next({ ctx });
});

type PostSaveAppointmentEmailOutcome = "sent" | "failed" | "unavailable";

async function sendPostSaveAppointmentDetailsEmail(input: {
  appointmentId: number;
  sentByUserId: number;
}): Promise<{ requested: true; outcome: PostSaveAppointmentEmailOutcome }> {
  try {
    const context = await getAppointmentCommunicationContext(input.appointmentId);
    if (!context || !isManualAppointmentCommunicationStatus(context.appointment.status)) {
      return { requested: true, outcome: "unavailable" };
    }

    const primary = context.primaryRecipient;
    if (!primary) return { requested: true, outcome: "unavailable" };

    const localeResolution = resolveAppointmentCommunicationLocale(primary.preferredLanguage);
    const language = localeResolution.deliveredLocale as AppointmentCommunicationLanguage;
    const projection = buildAppointmentCommunicationProjection({
      recipientName: primary.displayName,
      appointment: context.appointment,
      partnerClinic: context.partnerClinic,
      clinic: context.clinic,
    }, language);
    const delivery = await sendAppointmentDetailsEmail(primary.email, projection, language);
    await createAppointmentCommunicationDelivery({
      appointmentId: input.appointmentId,
      sendGroupId: randomUUID(),
      recipientEmail: primary.email,
      recipientType: primary.recipientType,
      language,
      templateKey: `appointment_${projection.communicationKind}`,
      templateVersion: APPOINTMENT_COMMUNICATION_TEMPLATE_VERSION,
      profileLanguage: primary.preferredLanguage,
      localeFallbackUsed: localeResolution.fallbackUsed,
      sentByUserId: input.sentByUserId,
      deliveryStatus: delivery.sent ? "sent" : "failed",
      providerMessageId: delivery.providerMessageId,
      failureClassification: delivery.failureClassification,
      failureCode: delivery.failureCode,
    });
    await logAppointmentActivity(
      input.appointmentId,
      input.sentByUserId,
      "appointment_details_email_post_save",
      undefined,
      `Post-save appointment details email: ${delivery.sent ? "1 sent" : "1 failed"}.`,
    );
    return { requested: true, outcome: delivery.sent ? "sent" : "failed" };
  } catch (error) {
    console.warn("[AppointmentPostSaveEmail] Delivery could not be completed after appointment persistence.", {
      appointmentId: input.appointmentId,
      error: error instanceof Error ? error.name : "unknown",
    });
    return { requested: true, outcome: "failed" };
  }
}

const financeVoidProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "staff" && ctx.user.role !== "manager") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin, manager, or staff access is required to void payments." });
  }
  return next({ ctx });
});

const financeCorrectionProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "manager") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin or manager access is required for historical pricing corrections." });
  }
  return next({ ctx });
});

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  monitoring: monitoringRouter,
  intakeForms: intakeFormsRouter,
  dataIO: dataIORouter,
  labDictionary: labDictionaryRouter,
  googleCalendar: googleCalendarRouter,

  auth: router({
    ownerAccount: publicProcedure.query(async () => {
      try {
        const owner = await getUserByEmail(CLINIC_OWNER_EMAIL);
        return { email: CLINIC_OWNER_EMAIL, ready: Boolean(owner?.authUserId) };
      } catch (error) {
        console.info("[auth] owner lookup failed", { unavailable: error instanceof Error && error.message === "DB_UNAVAILABLE" });
        return { email: CLINIC_OWNER_EMAIL, ready: false };
      }
    }),

    signUpOwner: publicProcedure
      .input(z.object({
        firstName: z.string().trim().min(1).max(80),
        secondName: z.string().trim().max(80).optional(),
        thirdName: z.string().trim().max(80).optional(),
        password: passwordSchema,
      }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getUserByEmail(CLINIC_OWNER_EMAIL).catch(() => null);
        if (existing?.authUserId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "The owner account already exists. Sign in instead." });
        }
        const name = [input.firstName, input.secondName, input.thirdName].filter(Boolean).join(" ");
        let authUserId: string;
        try {
          const created = await createConfirmedAuthUser({ email: CLINIC_OWNER_EMAIL, password: input.password, name });
          authUserId = created.id;
        } catch (error) {
          if (!(error instanceof Error) || error.message !== "EMAIL_IN_USE") throw authFailure(error, "The owner account could not be created.");
          const recovered = await signInForLink(CLINIC_OWNER_EMAIL, input.password);
          if (!recovered) throw new TRPCError({ code: "FORBIDDEN", message: "The owner account already exists. Sign in instead." });
          authUserId = recovered.id;
        }
        const linked = await linkSupabaseIdentity({ id: authUserId, email: CLINIC_OWNER_EMAIL, name });
        if (linked.status !== "ok") throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The owner account could not be opened." });
        const supabase = supabaseForRequest(ctx.req, ctx.res);
        const signedIn = await supabase.auth.signInWithPassword({ email: CLINIC_OWNER_EMAIL, password: input.password });
        if (signedIn.error) {
          console.info("[auth] owner account exists but the session cookie was not set", { status: signedIn.error.status ?? 0 });
          return { success: true, signedIn: false };
        }
        ctx.res.clearCookie(COOKIE_NAME, { path: "/" });
        console.info("[auth] owner account opened", { userId: linked.user.id });
        return { success: true, signedIn: true };
      }),

    signIn: publicProcedure
      .input(z.object({
        email: z.string().trim().email().max(320),
        password: z.string().min(1).max(72),
      }))
      .mutation(async ({ input, ctx }) => {
        const email = input.email.toLowerCase();
        let supabase;
        try {
          supabase = supabaseForRequest(ctx.req, ctx.res);
        } catch (error) {
          throw authFailure(error, "Sign-in is not configured.");
        }
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: input.password });
        if (error || !data.user?.id || !data.user.email) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }
        let linked;
        try {
          linked = await linkSupabaseIdentity({
            id: data.user.id,
            email: data.user.email,
            name: typeof data.user.user_metadata?.name === "string" ? data.user.user_metadata.name : null,
          });
        } catch (lookupError) {
          await supabase.auth.signOut();
          const unavailable = lookupError instanceof Error && lookupError.message === "DB_UNAVAILABLE";
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: unavailable ? "Database is temporarily unavailable. Please try again in a moment." : "Login service error. Please try again.",
          });
        }
        if (linked.status === "blocked") {
          await supabase.auth.signOut();
          throw new TRPCError({ code: "UNAUTHORIZED", message: blockedSignInMessage(linked.reason) });
        }
        if (linked.status !== "ok") {
          await supabase.auth.signOut();
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }
        ctx.res.clearCookie(COOKIE_NAME, { path: "/" });
        await logAudit({
          userId: linked.user.id, userName: linked.user.name, userRole: linked.user.role,
          action: "login", category: "auth",
          description: "User signed in",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return { success: true, user: { id: linked.user.id, name: linked.user.name, email: linked.user.email, role: linked.user.role } };
      }),

    me: publicProcedure.query(({ ctx }) => {
      if (!ctx.user) return null;
      return {
        id: ctx.user.id,
        name: ctx.user.name,
        email: ctx.user.email,
        role: ctx.user.role,
        avatarUrl: ctx.user.avatarUrl ?? null,
        phone: ctx.user.phone ?? null,
      };
    }),

    logout: publicProcedure.mutation(async ({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      if (ctx.user) {
        await logAudit({
          userId: ctx.user.id, userName: ctx.user.name, userRole: ctx.user.role,
          action: "logout", category: "auth",
          description: "User signed out",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
      }
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      if (typeof ctx.res.cookie === "function") await signOutFromRequest(ctx.req, ctx.res);
      return { success: true } as const;
    }),

    register: adminProcedure
      .input(z.object({
        name: z.string().min(1).max(200).optional(),
        firstName: z.string().trim().min(1).max(80),
        secondName: z.string().trim().max(80).optional(),
        thirdName: z.string().trim().max(80).optional(),
        email: z.string().trim().email().max(320),
        password: passwordSchema,
        role: z.enum(["patient", "staff", "doctor", "manager"]),
        phone: z.string().max(32).optional(),
      }))
      .mutation(async ({ input }) => {
        const email = input.email.toLowerCase();
        if (email === CLINIC_OWNER_EMAIL) throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });
        const existing = await getUserByEmail(email);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });
        const displayName = [input.firstName, input.secondName, input.thirdName].filter(Boolean).join(" ");
        let authUserId = "";
        let user: Awaited<ReturnType<typeof createUserWithPassword>> | undefined;
        try {
          const created = await createConfirmedAuthUser({ email, password: input.password, name: displayName });
          authUserId = created.id;
          user = await createUserWithPassword({
            name: displayName,
            firstName: input.firstName,
            secondName: input.secondName,
            thirdName: input.thirdName,
            email,
            authUserId,
            role: input.role,
            phone: input.phone,
            status: "active",
          });
        } catch (error) {
          if (authUserId && !user) await deleteAuthUser(authUserId);
          throw authFailure(error, "The account could not be created.");
        }
        if (input.role === "doctor" && user?.id) {
          await ensureDoctorProfile(user.id, displayName, input.phone, input.firstName, input.secondName, input.thirdName);
        }
        if (input.role === "patient" && user?.id) {
          const lastName = input.thirdName || input.secondName || input.firstName;
          await ensurePatientProfile(user.id, input.firstName, lastName, input.phone, email);
        }
        await logAudit({
          userId: undefined, userName: "Admin", userRole: "admin",
          action: "create_user", category: "user_management",
          description: `Admin created user ${user?.id ?? "unknown"} with role ${input.role}`,
          recordType: "user",
        });
        return { success: true, user: { id: user?.id, name: user?.name, email: user?.email, role: user?.role } };
      }),

    forgotPassword: publicProcedure
      .input(z.object({ email: z.string().trim().email().max(320) }))
      .mutation(async ({ input, ctx }) => {
        try {
          const origin = requestOrigin(ctx.req);
          const user = origin ? await getUserByEmail(input.email) : null;
          if (origin && user?.email && user.authUserId && user.status === "active" && user.isActive) {
            await sendPasswordReset(user.email, `${origin}/reset-password`);
          }
        } catch (error) {
          console.info("[auth] password reset was not sent", { unavailable: error instanceof Error && error.message === "DB_UNAVAILABLE" });
        }
        return { success: true };
      }),

    resetPassword: publicProcedure
      .input(z.object({
        accessToken: z.string().min(20).max(8192),
        password: passwordSchema,
      }))
      .mutation(async ({ input }) => {
        const { data, error } = await supabaseAdmin().auth.getUser(input.accessToken);
        if (error || !data.user?.email) throw new TRPCError({ code: "BAD_REQUEST", message: "This reset link is invalid or has expired." });
        const user = await getUserByEmail(data.user.email).catch(() => null);
        if (!user || (user.authUserId && user.authUserId !== data.user.id)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This reset link is invalid or has expired." });
        }
        try {
          await setAuthPassword(data.user.id, input.password);
          if (!user.authUserId) await saveAuthUserId(user.id, data.user.id);
        } catch (resetError) {
          throw authFailure(resetError, "The password could not be reset.");
        }
        console.info("[auth] password reset completed", { userId: user.id });
        return { success: true };
      }),
  }),

  // ─── Users ──────────────────────────────────────────────────────────────────
  users: router({
    list: adminProcedure.query(() => getAllUsers()),
    listStaff: staffOrAdminProcedure.query(() => getStaffUsers()),
    updateRole: adminProcedure
      .input(z.object({ userId: z.number(), role: z.enum(["patient", "staff", "doctor", "manager"]) }))
      .mutation(async ({ input }) => {
        return updateUserRole(input.userId, input.role);
      }),

    approve: adminProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(["patient", "staff", "doctor", "manager"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await updateUserRoleAndStatus(input.userId, input.role, "active");
        // Auto-create patient record if approved as patient
        if (input.role === "patient") {
          const userRow = await getUserById(input.userId);
          if (userRow) {
            const fn = (userRow as any).firstName ?? userRow.name?.split(" ")[0] ?? "Unknown";
            const ln = (userRow as any).thirdName ?? (userRow as any).secondName ?? userRow.name?.split(" ").slice(1).join(" ") ?? "Patient";
            await ensurePatientProfile(input.userId, fn, ln, userRow.phone, userRow.email);
          }
        }
        await logAudit({
          userId: ctx.user?.id, userName: ctx.user?.name, userRole: ctx.user?.role,
          action: "approve_user", category: "user_management",
          description: `Approved user ID ${input.userId} with role ${input.role}`,
          recordId: input.userId, recordType: "user",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return result;
      }),

    getOwnProfile: protectedProcedure.query(async ({ ctx }) => {
      const user = await getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatarUrl: user.avatarUrl,
        jobTitle: (user as any).jobTitle ?? null,
        languages: (() => { try { return JSON.parse((user as any).languages ?? "[]"); } catch { return []; } })(),
        primaryLanguage: (user as any).primaryLanguage ?? null,
        weeklySchedule: (() => { try { return JSON.parse((user as any).weeklySchedule ?? "{}"); } catch { return {}; } })(),
        slotDurationMinutes: (user as any).slotDurationMinutes ?? 30,
      };
    }),

    updateOwnProfile: protectedProcedure
      .input(z.object({
        name: z.string().min(1).optional(),
        firstName: z.string().min(1).optional(),
        secondName: z.string().optional(),
        thirdName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        jobTitle: z.string().optional(),
        languages: z.array(z.string()).optional(),
        primaryLanguage: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return updateOwnProfile(ctx.user.id, input);
      }),

    updateOwnPassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string().min(1).max(72),
        newPassword: passwordSchema,
      }))
      .mutation(async ({ input, ctx }) => {
        const user = await getUserById(ctx.user.id);
        if (!user?.email || !user.authUserId) throw new TRPCError({ code: "BAD_REQUEST", message: "This account is not ready for a password change." });
        const matches = await passwordMatches(user.email, input.currentPassword);
        if (!matches) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
        try {
          await setAuthPassword(user.authUserId, input.newPassword);
        } catch (error) {
          throw authFailure(error, "The password could not be changed.");
        }
        return { success: true };
      }),

    uploadOwnAvatar: protectedProcedure
      .input(z.object({
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "png";
        const key = `users/avatar/${ctx.user.id}-${Date.now()}.${ext}`;
        const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType, input.fileName);
        await updateOwnProfile(ctx.user.id, {});
        const { users: usersTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await (await import("./db")).getDb();
        if (db) await db.update(usersTable).set({ avatarUrl: url }).where(eq(usersTable.id, ctx.user.id));
        return { url };
      }),

    reject: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await updateUserStatus(input.userId, "rejected");
        await logAudit({
          userId: ctx.user?.id, userName: ctx.user?.name, userRole: ctx.user?.role,
          action: "reject_user", category: "user_management",
          description: `Rejected user ID ${input.userId}`,
          recordId: input.userId, recordType: "user",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return result;
      }),

    setStatus: adminProcedure
      .input(z.object({ userId: z.number(), status: z.enum(["pending", "active", "rejected"]) }))
      .mutation(async ({ input, ctx }) => {
        const result = await updateUserStatus(input.userId, input.status);
        await logAudit({
          userId: ctx.user?.id, userName: ctx.user?.name, userRole: ctx.user?.role,
          action: `set_user_status_${input.status}`, category: "user_management",
          description: `Set user ID ${input.userId} status to ${input.status}`,
          recordId: input.userId, recordType: "user",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return result;
      }),

    // Admin: edit any user's profile
    updateProfile: adminProcedure
      .input(z.object({
        userId: z.number(),
        firstName: z.string().min(1).optional(),
        secondName: z.string().optional(),
        thirdName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        role: z.enum(["patient", "staff", "doctor", "manager", "admin"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { userId, ...data } = input;
        const result = await updateUserProfileByAdmin(userId, data);
        // If role changed to doctor, ensure doctor profile exists
        if (data.role === "doctor") {
          const userRow = await getUserById(userId);
          if (userRow) await ensureDoctorProfile(
            userId,
            userRow.name ?? "Doctor",
            userRow.phone,
            (userRow as any).firstName ?? null,
            (userRow as any).secondName ?? null,
            (userRow as any).thirdName ?? null,
          );
        }
        // If role changed to patient, ensure patient record exists
        if (data.role === "patient") {
          const userRow = await getUserById(userId);
          if (userRow) {
            const fn = (userRow as any).firstName ?? userRow.name?.split(" ")[0] ?? "Unknown";
            const ln = (userRow as any).thirdName ?? (userRow as any).secondName ?? userRow.name?.split(" ").slice(1).join(" ") ?? "Patient";
            await ensurePatientProfile(userId, fn, ln, userRow.phone, userRow.email);
          }
        }
        await logAudit({
          userId: ctx.user?.id, userName: ctx.user?.name, userRole: ctx.user?.role,
          action: "update_user_profile", category: "user_management",
          description: `Admin updated profile of user ID ${userId}`,
          recordId: userId, recordType: "user",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return result;
      }),

    deactivate: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (input.userId === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Cannot deactivate your own account" });
        await deactivateUser(input.userId);
        await logAudit({
          userId: ctx.user?.id, userName: ctx.user?.name, userRole: ctx.user?.role,
          action: "deactivate_user", category: "user_management",
          description: `Deactivated user ID ${input.userId}`,
          recordId: input.userId, recordType: "user",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return { success: true };
      }),

    reactivate: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await reactivateUser(input.userId);
        await logAudit({
          userId: ctx.user?.id, userName: ctx.user?.name, userRole: ctx.user?.role,
          action: "reactivate_user", category: "user_management",
          description: `Reactivated user ID ${input.userId}`,
          recordId: input.userId, recordType: "user",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return { success: true };
      }),

    adminResetPassword: adminProcedure
      .input(z.object({
        userId: z.number(),
        newPassword: passwordSchema,
      }))
      .mutation(async ({ input, ctx }) => {
        const user = await getUserById(input.userId);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        try {
          await bindAuthPassword(user, input.newPassword);
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw authFailure(error, "The password could not be reset.");
        }
        await logAudit({
          userId: ctx.user?.id, userName: ctx.user?.name, userRole: ctx.user?.role,
          action: "admin_reset_password", category: "user_management",
          description: `Admin reset password for user ID ${input.userId}`,
          recordId: input.userId, recordType: "user",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return { success: true };
      }),

    // ── Coordinator weekly schedule ────────────────────────────────────────────
    getWeeklySchedule: protectedProcedure
      .query(async ({ ctx }) => {
        const { getDb } = await import("./db");
        const { users: usersTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const row = await db.select().from(usersTable).where(eq(usersTable.id, ctx.user.id)).limit(1);
        const u = row[0];
        if (!u) throw new TRPCError({ code: "NOT_FOUND" });
        const rawSchedule = (u as any).weeklySchedule;
        const schedule = typeof rawSchedule === "string" ? JSON.parse(rawSchedule || "{}") : (rawSchedule ?? {});
        return {
          weeklySchedule: schedule as Record<string, Array<{start: string; end: string}>>,
          slotDurationMinutes: (u as any).slotDurationMinutes ?? 30,
        };
      }),

    updateWeeklySchedule: protectedProcedure
      .input(z.object({
        weeklySchedule: z.record(z.string(), z.array(z.object({ start: z.string(), end: z.string() }))),
        slotDurationMinutes: z.number().int().min(15).max(120).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import("./db");
        const { users: usersTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        await db.update(usersTable).set({
          weeklySchedule: JSON.stringify(input.weeklySchedule) as any,
          slotDurationMinutes: input.slotDurationMinutes ?? 30,
          updatedAt: new Date(),
        }).where(eq(usersTable.id, ctx.user.id));
        return { success: true };
      }),

    // ── List coordinators (staff/doctor users with profile info) ───────────────
    listCoordinators: publicProcedure
      .query(async () => {
        const { getDb } = await import("./db");
        const { users: usersTable } = await import("../drizzle/schema");
        const { eq, and, inArray } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return [];
        const rows = await db.select({
          id: usersTable.id,
          name: usersTable.name,
          firstName: usersTable.firstName,
          secondName: usersTable.secondName,
          thirdName: usersTable.thirdName,
          email: usersTable.email,
          avatarUrl: usersTable.avatarUrl,
          bio: usersTable.bio,
          jobTitle: usersTable.jobTitle,
          languages: usersTable.languages,
          primaryLanguage: usersTable.primaryLanguage,
          weeklySchedule: usersTable.weeklySchedule,
          slotDurationMinutes: usersTable.slotDurationMinutes,
          role: usersTable.role,
        }).from(usersTable)
          .where(and(
            inArray(usersTable.role, ["staff", "doctor", "manager"]),
            eq(usersTable.isActive, true),
            eq(usersTable.status, "active"),
          ));
        return rows.map(r => ({
          ...r,
          languages: typeof r.languages === "string" ? JSON.parse(r.languages || "[]") : ((r.languages as string[]) ?? []),
          weeklySchedule: typeof r.weeklySchedule === "string" ? JSON.parse(r.weeklySchedule || "{}") : ((r.weeklySchedule as Record<string, Array<{start:string;end:string}>>) ?? {}),
        }));
      }),

    // ── Get available booking slots for a coordinator ──────────────────────────
    getAvailableSlots: publicProcedure
      .input(z.object({
        coordinatorId: z.number(),
        fromDate: z.string(), // YYYY-MM-DD
        toDate: z.string(),   // YYYY-MM-DD
        timezone: z.string().optional(), // IANA timezone e.g. "Asia/Riyadh"
      }))
      .query(async ({ input }) => {
        const { getDb } = await import("./db");
        const { users: usersTable, appointments: apptsTable } = await import("../drizzle/schema");
        const { eq, and, gte, lte } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return [];
        const row = await db.select().from(usersTable).where(eq(usersTable.id, input.coordinatorId)).limit(1);
        const u = row[0];
        if (!u) return [];
        const rawSchedule = (u as any).weeklySchedule;
        const schedule: Record<string, Array<{start: string; end: string}>> =
          typeof rawSchedule === "string" ? JSON.parse(rawSchedule || "{}") : (rawSchedule ?? {});
        const slotDuration = (u as any).slotDurationMinutes ?? 30;

        // Get existing appointments for this coordinator in the date range
        const from = new Date(input.fromDate + "T00:00:00.000Z");
        const to = new Date(input.toDate + "T23:59:59.999Z");
        const existingAppts = await db.select({
          appointmentDate: apptsTable.appointmentDate,
          duration: apptsTable.duration,
        }).from(apptsTable)
          .where(and(
            eq(apptsTable.staffId, input.coordinatorId),
            gte(apptsTable.appointmentDate, from),
            lte(apptsTable.appointmentDate, to),
          ));

        // Generate slots day by day
        const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
        const slots: Array<{ date: string; start: string; end: string; isoStart: string; isoEnd: string }> = [];
        const cursor = new Date(from);
        cursor.setUTCHours(0, 0, 0, 0);
        const endDay = new Date(to);
        endDay.setUTCHours(23, 59, 59, 999);

        while (cursor <= endDay) {
          const dayName = DAY_NAMES[cursor.getUTCDay()];
          const daySlots = schedule[dayName] ?? [];
          const dateStr = cursor.toISOString().split("T")[0];

          for (const window of daySlots) {
            // Parse start/end times as UTC on this date
            const [sh, sm] = window.start.split(":").map(Number);
            const [eh, em] = window.end.split(":").map(Number);
            const windowStart = new Date(cursor);
            windowStart.setUTCHours(sh, sm, 0, 0);
            const windowEnd = new Date(cursor);
            windowEnd.setUTCHours(eh, em, 0, 0);

            // Generate slots within the window
            let slotStart = new Date(windowStart);
            while (slotStart.getTime() + slotDuration * 60000 <= windowEnd.getTime()) {
              const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);
              // Check if this slot conflicts with existing appointments
              const isBooked = existingAppts.some(appt => {
                if (!appt.appointmentDate) return false;
                const apptStart = new Date(appt.appointmentDate);
                const apptEnd = new Date(apptStart.getTime() + (appt.duration ?? slotDuration) * 60000);
                return slotStart < apptEnd && slotEnd > apptStart;
              });
              if (!isBooked) {
                const startHH = String(slotStart.getUTCHours()).padStart(2, "0");
                const startMM = String(slotStart.getUTCMinutes()).padStart(2, "0");
                const endHH = String(slotEnd.getUTCHours()).padStart(2, "0");
                const endMM = String(slotEnd.getUTCMinutes()).padStart(2, "0");
                slots.push({
                  date: dateStr,
                  start: `${startHH}:${startMM}`,
                  end: `${endHH}:${endMM}`,
                  isoStart: slotStart.toISOString(),
                  isoEnd: slotEnd.toISOString(),
                });
              }
              slotStart = slotEnd;
            }
          }
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        return slots;
      }),

  }),

  // ─── Doctors ────────────────────────────────────────────────────────────────
  doctors: router({
    list: protectedProcedure.query(() => getAllDoctors()),

    me: protectedProcedure.query(({ ctx }) => getDoctorByUserId(ctx.user.id)),

    get: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getDoctorById(input.id)),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        email: z.string().email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters").max(72),
        specialty: z.string().optional(),
        licenseNumber: z.string().optional(),
        bio: z.string().optional(),
        consultationFee: z.number().positive().optional(),
        phone: z.string().optional(),
        title: z.string().optional(),
        firstName: z.string().optional(),
        secondName: z.string().optional(),
        thirdName: z.string().optional(),
        specializationId: z.number().optional(),
        subSpecializationIds: z.array(z.number()).optional(),
        avatarUrl: z.string().optional(),
        stampUrl: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const doctorCode = await getNextCode("doctor");
          return await createDoctor({ ...input, _code: doctorCode } as any);
        } catch (e: any) {
          const message = typeof e?.message === "string" ? e.message : "";
          if (message === "EMAIL_IN_USE" || message.includes("Duplicate entry") || e?.code === "23505") {
            throw new TRPCError({ code: "CONFLICT", message: "A user with this email already exists" });
          }
          if (message === "WEAK_PASSWORD") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Password must be 8 to 72 characters." });
          }
          console.info("[doctors] create failed", { code: e?.code ?? (message || "unknown") });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create doctor" });
        }
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(2).optional(),
        email: z.string().email().optional(),
        specialty: z.string().optional(),
        licenseNumber: z.string().optional(),
        bio: z.string().optional(),
        consultationFee: z.number().positive().optional(),
        phone: z.string().optional(),
        isActive: z.boolean().optional(),
        title: z.string().optional(),
        firstName: z.string().optional(),
        secondName: z.string().optional(),
        thirdName: z.string().optional(),
        specializationId: z.number().optional(),
        subSpecializationIds: z.array(z.number()).optional(),
        avatarUrl: z.string().optional(),
        stampUrl: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        try {
          await updateDoctor(id, data);
          return { success: true };
        } catch (e: any) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "Failed to update doctor" });
        }
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        try {
          await deleteDoctor(input.id);
          return { success: true };
        } catch (e: any) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "Failed to delete doctor" });
        }
      }),

    uploadImage: adminProcedure
      .input(z.object({
        doctorId: z.number(),
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        imageType: z.enum(["avatar", "stamp"]),
      }))
      .mutation(async ({ input }) => {
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "png";
        const key = `doctors/${input.imageType}/${input.doctorId}-${Date.now()}.${ext}`;
        const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType, input.fileName);
        const updateData = input.imageType === "avatar" ? { avatarUrl: url } : { stampUrl: url };
        await updateDoctor(input.doctorId, updateData);
        return { key: storedKey, url };
      }),

    // Doctor updates their own profile
    updateOwnProfile: protectedProcedure
      .input(z.object({
        firstName: z.string().min(1).optional(),
        secondName: z.string().optional(),
        thirdName: z.string().optional(),
        phone: z.string().optional(),
        specialty: z.string().optional(),
        licenseNumber: z.string().optional(),
        bio: z.string().optional(),
        consultationFee: z.number().positive().optional(),
        title: z.string().optional(),
        specializationId: z.number().optional(),
        subSpecializationIds: z.array(z.number()).optional(),
        jobTitle: z.string().optional(),
        languages: z.array(z.string()).optional(),
        primaryLanguage: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Find the doctor profile linked to the current user
        const doctorRow = await getDoctorByUserId(ctx.user.id);
        if (!doctorRow) throw new TRPCError({ code: "NOT_FOUND", message: "Doctor profile not found" });
        try {
          const { subSpecializationIds, jobTitle, languages, primaryLanguage, ...doctorData } = input;
          await updateDoctor(doctorRow.id, { ...doctorData, subSpecializationIds });
          // Update user-level fields (name parts + coordinator fields)
          const userUpdates: Record<string, any> = {};
          if (input.firstName !== undefined) userUpdates.firstName = input.firstName;
          if (input.secondName !== undefined) userUpdates.secondName = input.secondName;
          if (input.thirdName !== undefined) userUpdates.thirdName = input.thirdName;
          if (jobTitle !== undefined) userUpdates.jobTitle = jobTitle;
          if (languages !== undefined) userUpdates.languages = languages;
          if (primaryLanguage !== undefined) userUpdates.primaryLanguage = primaryLanguage;
          if (Object.keys(userUpdates).length > 0) {
            await updateOwnProfile(ctx.user.id, userUpdates);
          }
          return { success: true };
        } catch (e: any) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "Failed to update profile" });
        }
      }),

    // Doctor uploads their own avatar
    uploadOwnAvatar: protectedProcedure
      .input(z.object({
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const doctorRow = await getDoctorByUserId(ctx.user.id);
        if (!doctorRow) throw new TRPCError({ code: "NOT_FOUND", message: "Doctor profile not found" });
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "png";
        const key = `doctors/avatar/${doctorRow.id}-${Date.now()}.${ext}`;
        const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType, input.fileName);
        await updateDoctor(doctorRow.id, { avatarUrl: url });
        return { url };
      }),

    // Doctor uploads their own stamp
    uploadOwnStamp: protectedProcedure
      .input(z.object({
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const doctorRow = await getDoctorByUserId(ctx.user.id);
        if (!doctorRow) throw new TRPCError({ code: "NOT_FOUND", message: "Doctor profile not found" });
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "png";
        const key = `doctors/stamp/${doctorRow.id}-${Date.now()}.${ext}`;
        const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType, input.fileName);
        await updateDoctor(doctorRow.id, { stampUrl: url });
        return { url };
      }),
  }),

  // ─── Patients ───────────────────────────────────────────────────────────────
  patients: router({
    list: protectedProcedure
      .input(z.object({
        search: z.string().optional(),
        statusFilter: z.array(z.string()).optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(1000).optional(),
        sortBy: z.enum(["updatedAt", "name", "createdAt"]).optional(),
        country: z.string().optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        // Doctors can only see patients assigned to them
        let doctorId: number | undefined;
        if (ctx.user.role === "doctor") {
          const doctorProfile = await getDoctorByUserId(ctx.user.id);
          doctorId = doctorProfile?.id;
        }
        return getAllPatients(input?.search, input?.statusFilter, input?.page ?? 1, input?.pageSize ?? 20, doctorId, input?.sortBy ?? "updatedAt", input?.country);
      }),

    get: staffOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getPatientById(input.id)),

    stats: staffOrAdminProcedure.query(() => getPatientStats()),

    create: staffOrAdminProcedure
      .input(z.object({
        firstName: z.string().min(1),
        middleName: z.string().optional(),
        lastName: z.string().min(1),
        mrn: z.string().optional(),
        dateOfBirth: z.date().optional(),
        gender: z.enum(["male", "female"]).optional(),
        phone: z.string().optional(),
        secondaryPhone: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        secondaryEmail: z.string().email().optional().or(z.literal("")),
        address: z.string().optional(),
        nationality: z.string().optional(),
        bloodType: z.string().optional(),
        allergies: z.string().optional(),
        emergencyContactName: z.string().optional(),
        emergencyContactPhone: z.string().optional(),
        insuranceProvider: z.string().optional(),
        insuranceNumber: z.string().optional(),
        assignedDoctorId: z.number().optional(),
        interestLevel: z.enum(["cold", "warm", "hot"]).optional(),
        leadSource: z.string().optional(),
        tags: z.string().optional(),
        notes: z.string().optional(),
        patientType: z.enum(["local", "international", "not-specified"]).optional(),
        preferredLanguages: z.array(z.string()).optional(),
        primaryLanguage: z.string().optional(),
        preferredContactMethods: z.array(z.string()).optional(),
        mainMedicalInterest: z.array(z.string()).optional(),
        countryOfResidency: z.string().optional(),
        defaultFinancialScope: z.enum(["production", "test"]).optional(),
        doctorIds: z.array(z.number()).min(1, "Please assign at least one doctor"),
      }))
       .mutation(async ({ input, ctx }) => {
        const { doctorIds, ...patientData } = input;
        if (patientData.defaultFinancialScope === "test" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only Admin can create a patient with Test financial scope." });
        }
        const mrnToUse = patientData.mrn || await getNextCode("patient");
        let patient: any;
        try {
          patient = await createPatient({
            ...patientData,
            defaultFinancialScope: patientData.defaultFinancialScope ?? "production",
            mrn: mrnToUse,
            email: patientData.email || undefined,
            patientType: (patientData.patientType === "not-specified" ? undefined : patientData.patientType) as any,
          });
        } catch (e: any) {
          // DrizzleQueryError wraps the real DB error in e.cause
          const dbErr = e?.cause ?? e;
          const dbMsg: string = dbErr?.message ?? e?.message ?? "";
          if (dbMsg.includes("Duplicate entry") || dbErr?.code === "ER_DUP_ENTRY" || e?.code === "ER_DUP_ENTRY") {
            if (dbMsg.includes("mrn") || dbMsg.includes("MRN")) {
              throw new TRPCError({ code: "CONFLICT", message: "A patient with this MRN already exists. Please use a different MRN." });
            }
            if (dbMsg.includes("email")) {
              throw new TRPCError({ code: "CONFLICT", message: "A patient with this email address already exists." });
            }
            throw new TRPCError({ code: "CONFLICT", message: "A patient with the same information already exists. Please check for duplicates." });
          }
          if (e instanceof TRPCError) throw e;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create patient. Please try again." });
        }
        const patientId = (patient as any)?.insertId;
        // Set multi-doctor assignments
        if (patientId && doctorIds && doctorIds.length > 0) {
          await setPatientDoctors(patientId, doctorIds, ctx.user?.id);
        }
        await logAudit({
          userId: ctx.user?.id, userName: ctx.user?.name, userRole: ctx.user?.role,
          action: "create_patient", category: "patient",
          description: `Created patient: ${patientData.firstName} ${patientData.lastName}`,
          recordId: patientId ?? undefined, recordType: "patient",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return patient;
      }),
    previewNextMRN: staffOrAdminProcedure
      .query(() => previewNextMRN()),

    // Quick-create a minimal patient record (used from appointment modal)
    quickCreate: staffOrAdminProcedure
      .input(z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        phone: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
      }))
      .mutation(async ({ input, ctx }) => {
        const mrn = await getNextCode("patient");
        const patient = await createPatient({
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          email: input.email || undefined,
          mrn,
        });
        const patientId = (patient as any)?.insertId;
        await logAudit({
          userId: ctx.user?.id, userName: ctx.user?.name, userRole: ctx.user?.role,
          action: "create_patient", category: "patient",
          description: `Quick-created patient: ${input.firstName} ${input.lastName}`,
          recordId: patientId ?? undefined, recordType: "patient",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return { id: patientId, mrn, firstName: input.firstName, lastName: input.lastName };
      }),

    updateMRN: adminProcedure
      .input(z.object({ patientId: z.number(), mrn: z.string().min(1) }))
      .mutation(({ input }) => updatePatientMRN(input.patientId, input.mrn)),
    update: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          firstName: z.string().optional(),
          middleName: z.string().optional(),
          lastName: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().optional(),
          address: z.string().optional(),
          bloodType: z.string().optional(),
          allergies: z.string().optional(),
          interestLevel: z.enum(["cold", "warm", "hot"]).optional(),
          tags: z.string().optional(),
          notes: z.string().optional(),
          status: z.enum(["inquiry","lead","qualified","proposal_sent","active_patient","inactive","archived"]).optional(),
          assignedDoctorId: z.number().optional(),
          nationality: z.string().optional(),
          preferredLanguages: z.array(z.string()).optional(),
          primaryLanguage: z.string().optional().nullable(),
          preferredContactMethods: z.array(z.string()).optional(),
          secondaryPhone: z.string().optional().nullable(),
          secondaryEmail: z.string().optional().nullable(),
          dateOfBirth: z.date().optional(),
          gender: z.enum(["male", "female"]).optional(),
          emergencyContactName: z.string().optional(),
          emergencyContactPhone: z.string().optional(),
          insuranceProvider: z.string().optional(),
          insuranceNumber: z.string().optional(),
          isLocalPatient: z.boolean().optional(),
          patientType: z.enum(["local", "international", "not-specified"]).optional(),
          // CRM fields
          source: z.enum(["paid","employee-referral","external-referral","website","maps","partner","public-relations","instagram","tiktok","doctor-referral","youtube","facebook","awatef-guide","salim-guide","organic"]).optional().nullable(),
          socialLeadId: z.string().optional().nullable(),
          campaignName: z.string().optional().nullable(),
          budgetRange: z.string().optional().nullable(),
          rating: z.string().optional().nullable(),
          travelReadiness: z.enum(["ready","considering","prefers-home","local-patient"]).optional().nullable(),
          fertilityDiagnosis: z.array(z.string()).optional().nullable(),
          maleFertilityDiagnosis: z.array(z.string()).optional().nullable(),
          ivfExperience: z.enum(["never-tried","tried-unsuccessful","tried-again","tried-multiple"]).optional().nullable(),
          decisionTimeline: z.enum(["immediately","1-2-weeks","1-month","2-months","3-months","1-3-months","6-months","exploring"]).optional().nullable(),
          assignedStaffId: z.number().optional().nullable(),
          lastContactDate: z.date().optional().nullable(),
          nextFollowUpDate: z.date().optional().nullable(),
          city: z.string().optional().nullable(),
          country: z.string().optional().nullable(),
          accommodationHotel: z.string().optional().nullable(),
          accommodationLocation: z.string().optional().nullable(),
          transportationAirportPickup: z.union([z.boolean(), z.string(), z.null()]).optional().nullable().transform(v => (v === "" || v === null || v === undefined) ? null : (v === true || v === "yes" || v === "true")),
          transportationLocalTransfer: z.union([z.boolean(), z.string(), z.null()]).optional().nullable().transform(v => (v === "" || v === null || v === undefined) ? null : (v === true || v === "yes" || v === "true")),
          caseSummary: z.string().optional().nullable(),
          salesNote: z.string().optional().nullable(),
          caseSummaryTranslations: z.string().optional().nullable(),
          salesNoteTranslations: z.string().optional().nullable(),
          mainMedicalInterest: z.array(z.string()).optional().nullable(),
          countryOfResidency: z.string().optional().nullable(),
        }),
        doctorIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { doctorIds, ...rest } = input;
        // Capture old assignedDoctorId before update for notification comparison
        const oldPatient = await getPatientById(rest.id);
        const result = await updatePatient(rest.id, {
          ...rest.data,
          patientType: (rest.data.patientType === "not-specified" ? undefined : rest.data.patientType) as any,
        });
        // Update multi-doctor assignments if provided
        if (doctorIds !== undefined) {
          await setPatientDoctors(rest.id, doctorIds, ctx.user?.id);
        }
        // Notify doctor if assignedDoctorId changed
        if (rest.data.assignedDoctorId && rest.data.assignedDoctorId !== oldPatient?.assignedDoctorId) {
          const doctor = await getDoctorById(rest.data.assignedDoctorId);
          const patient = await getPatientById(rest.id);
          if (doctor && patient) {
            const caseName = `${patient.firstName} ${patient.lastName}`;
            const assignedBy = ctx.user?.name ?? "The team";
            const appUrl = ctx.req.headers["origin"] as string ?? "";
            // Dashboard notification
            if (doctor.userId) {
              await createNotification({
                userId: doctor.userId,
                type: "general",
                title: "New Case Assigned",
                message: `Patient ${caseName} has been assigned to you by ${assignedBy}.`,
                relatedId: rest.id,
                relatedType: "patient",
              });
            }
            // Email notification
            if (doctor.email) {
              const doctorFullName = [doctor.firstName, doctor.secondName].filter(Boolean).join(" ") || doctor.name || "Doctor";
              sendDoctorCaseAssignmentEmail(doctor.email, {
                doctorName: doctorFullName,
                caseName,
                caseType: "patient",
                caseId: rest.id,
                assignedBy,
                appUrl,
              }).catch(console.error);
            }
          }
        }
        await logAudit({
          userId: ctx.user?.id, userName: ctx.user?.name, userRole: ctx.user?.role,
          action: "update_patient", category: "patient",
          description: `Updated patient ID ${rest.id}`,
          recordId: rest.id, recordType: "patient",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return result;
      }),
    getDoctors: staffOrAdminProcedure
      .input(z.object({ patientId: z.number() }))
      .query(({ input }) => getPatientDoctors(input.patientId)),
    setDoctors: staffOrAdminProcedure
      .input(z.object({ patientId: z.number(), doctorIds: z.array(z.number()) }))
      .mutation(({ input, ctx }) => setPatientDoctors(input.patientId, input.doctorIds, ctx.user?.id)),
    documents: staffOrAdminProcedure
      .input(z.object({ patientId: z.number() }))
      .query(({ input }) => getPatientDocuments(input.patientId)),
    deleteDocument: staffOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteLeadDocument(input.id)),
    // ── Canonical Direct Upload to Documents Library (Patient page) ────────────────────────────
    // Returns person-centric destinations for direct upload from the Patient page.
    // For converted persons, resolves the canonical lead-side ownership.
    getDirectUploadDestinations: staffOrAdminProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ input }) => {
        const patient = await getPatientById(input.patientId);
        if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "Patient not found" });
        const linkedLeadId = await resolveLinkedLeadId(input.patientId);
        const ownerType = linkedLeadId ? "lead" : "patient";
        const ownerId = linkedLeadId ?? input.patientId;
        const primaryName = [(patient as any).firstName, (patient as any).lastName].filter(Boolean).join(" ") || "This Patient";
        const primaryGender: "female" | "male" | "unknown" =
          (patient as any).gender === "female" ? "female" :
          (patient as any).gender === "male" ? "male" : "unknown";
        const destinations: Array<{
          key: string;
          personName: string;
          gender: "female" | "male" | "unknown";
          patientId: number;
          leadId: number | null;
          ownerType: string;
          ownerId: number;
          isPrimary: boolean;
        }> = [];
        destinations.push({
          key: `primary-${input.patientId}`,
          personName: primaryName,
          gender: primaryGender,
          patientId: input.patientId,
          leadId: linkedLeadId ?? null,
          ownerType,
          ownerId,
          isPrimary: true,
        });
        // Partner: resolve via patient partner link
        const partner = await getPatientPartner(input.patientId);
        if (partner) {
          const partnerLinkedLeadId = await resolveLinkedLeadId((partner as any).id);
          const partnerOwnerType = partnerLinkedLeadId ? "lead" : "patient";
          const partnerOwnerId = partnerLinkedLeadId ?? (partner as any).id;
          const partnerGender: "female" | "male" | "unknown" =
            (partner as any).gender === "female" ? "female" :
            (partner as any).gender === "male" ? "male" : "unknown";
          const partnerName = [(partner as any).firstName, (partner as any).lastName].filter(Boolean).join(" ") || "Partner";
          destinations.push({
            key: `partner-${(partner as any).id}`,
            personName: partnerName,
            gender: partnerGender,
            patientId: (partner as any).id,
            leadId: partnerLinkedLeadId ?? null,
            ownerType: partnerOwnerType,
            ownerId: partnerOwnerId,
            isPrimary: false,
          });
        }
        return destinations;
      }),
    // Direct upload to Documents Library from the Patient page — no conflict guard.
    directUpload: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string().optional(),
        tag: z.string().optional(),
        docPassword: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const patient = await getPatientById(input.patientId);
        if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "Patient not found" });
        const linkedLeadId = await resolveLinkedLeadId(input.patientId);
        const ownerType = linkedLeadId ? "lead" : "patient";
        const ownerId = linkedLeadId ?? input.patientId;
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "bin";
        const key = `direct-upload/patient-${input.patientId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType, input.fileName);
        const personName = [(patient as any).firstName, (patient as any).lastName].filter(Boolean).join(" ") || "Patient";
        const docId = await createLeadDocument({
          patientId: input.patientId,
          ...(linkedLeadId ? { leadId: linkedLeadId } : {}),
          fileKey: storedKey,
          fileUrl: url,
          fileName: input.fileName,
          mimeType: input.mimeType,
          uploadedBy: ctx.user.id,
          tag: input.tag ?? null,
          docPassword: input.docPassword ?? null,
          lifecycleStatus: "direct-upload",
          ownerType,
          ownerId,
        } as any);
        return { docId, personName, linkedLeadId: linkedLeadId ?? null };
      }),
    addDocumentToSection: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        gender: z.enum(["female", "male"]),
        section: z.string(),
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        tag: z.string().optional(),
        docPassword: z.string().optional(),
        // When provided, attach this file to an existing study instead of creating a new one.
        // The frontend generates a shared studyId before the upload loop so all files in the
        // same upload session land in the same study.
        targetStudyId: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // ── Conflict guard: section uploads are blocked during an intake conflict ──
        // Resolve the linked leadId first (needed for both the guard and ownership).
        const linkedLeadIdForDoc = await resolveLinkedLeadId(input.patientId);
        if (linkedLeadIdForDoc) {
          const { resolveCanonicalIntake } = await import("./db");
          const canonical = await resolveCanonicalIntake(linkedLeadIdForDoc, input.patientId);
          if (canonical.status === "conflict") {
            throw new TRPCError({ code: "CONFLICT", message: "intake_conflict" });
          }
        }
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "bin";
        const key = `intake-files/patient-${input.patientId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType, input.fileName);
        const tag = input.tag ?? input.section;
        // ── Canonical ownership: person-level rule, independent of which page uploaded ──
        // Converted person (linked lead exists): ownerType=lead, ownerId=leadId
        // Patient-only (no linked lead): ownerType=patient, ownerId=patientId
        const canonicalOwnerType = linkedLeadIdForDoc ? "lead" : "patient";
        const canonicalOwnerId = linkedLeadIdForDoc ?? input.patientId;
        const docId = await createLeadDocument({
          patientId: input.patientId,
          ...(linkedLeadIdForDoc ? { leadId: linkedLeadIdForDoc } : {}),
          fileKey: storedKey,
          fileUrl: url,
          fileName: input.fileName,
          mimeType: input.mimeType,
          uploadedBy: ctx.user.id,
          intakeSection: input.section,
          tag,
          docPassword: input.docPassword ?? null,
          lifecycleStatus: "active",
          ownerType: canonicalOwnerType,
          ownerId: canonicalOwnerId,
        });
        const intake = await getMedicalIntakeByPatientId(input.patientId);
        const fileEntry = { fileKey: storedKey, fileUrl: url, fileName: input.fileName, mimeType: input.mimeType, tag, docPassword: input.docPassword ?? null, docId };
        const parseArr = (v: any): any[] => {
          if (!v) return [];
          if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
          return Array.isArray(v) ? v : [];
        };
        // Helper: add a file to an existing study (identified by targetStudyId) or push a new study
        const addFileToStudyArray = (arr: any[], newStudy: any): any[] => {
          if (input.targetStudyId) {
            const idx = arr.findIndex((s: any) => s.id === input.targetStudyId);
            if (idx !== -1) {
              // Attach to existing study
              const study = { ...arr[idx] };
              if (Array.isArray(study.files)) {
                study.files = [...study.files, fileEntry];
              } else {
                // Single-file study format (semenAnalysis / dnaFragmentation): convert to multi-file
                study.extraFiles = [...(study.extraFiles ?? []), fileEntry];
              }
              const updated = [...arr];
              updated[idx] = study;
              return updated;
            }
          }
          // No matching study found or no targetStudyId → create new
          return [...arr, newStudy];
        };
        if (input.gender === "female") {
          const s = input.section;
          if (s === "generalAttachmentsFemale") {
            const arr = parseArr(intake?.generalAttachmentsFemale);
            arr.push(fileEntry);
            await upsertMedicalIntakeForPatient(input.patientId, { generalAttachmentsFemale: arr } as any);
          } else if (s === "previousTests") {
            const arr = parseArr(intake?.previousTests);
            const updated = addFileToStudyArray(arr, { id: input.targetStudyId ?? Date.now().toString(), files: [fileEntry] });
            await upsertMedicalIntakeForPatient(input.patientId, { previousTests: updated } as any);
          } else if (s === "artHistory") {
            const arr = parseArr(intake?.artHistory);
            const updated = addFileToStudyArray(arr, { id: input.targetStudyId ?? Date.now().toString(), files: [fileEntry] });
            await upsertMedicalIntakeForPatient(input.patientId, { artHistory: updated } as any);
          } else if (s === "surgicalHistory") {
            const arr = parseArr(intake?.surgicalHistory);
            const updated = addFileToStudyArray(arr, { id: input.targetStudyId ?? Date.now().toString(), files: [fileEntry] });
            await upsertMedicalIntakeForPatient(input.patientId, { surgicalHistory: updated } as any);
          } else if (s === "radiology") {
            const arr = parseArr(intake?.radiologyStudies);
            arr.push({ id: Date.now().toString(), type: "other", studyName: tag || "Radiology", date: "", fileKey: storedKey, fileUrl: url, fileName: input.fileName, mimeType: input.mimeType, tag, docPassword: input.docPassword ?? null, docId });
            await upsertMedicalIntakeForPatient(input.patientId, { radiologyStudies: arr, hasRadiologyStudies: true } as any);
          } else if (s === "geneticTests") {
            const arr = parseArr(intake?.generalAttachmentsFemale);
            arr.push({ ...fileEntry, tag: tag || "Genetic Tests", intakeSection: "geneticTests" });
            await upsertMedicalIntakeForPatient(input.patientId, { generalAttachmentsFemale: arr } as any);
          }
        } else {
          const maleIntakeObj: any = intake?.maleIntake ? (typeof intake.maleIntake === "string" ? JSON.parse(intake.maleIntake as string) : intake.maleIntake) : {};
          const s = input.section;
          const parseArrM = (v: any): any[] => {
            if (!v) return [];
            if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
            return Array.isArray(v) ? v : [];
          };
          if (s === "semenAnalysis") {
            const arr = parseArrM(maleIntakeObj.semenAnalysis);
            const newStudy = { id: input.targetStudyId ?? Date.now().toString(), date: "", fileKey: storedKey, fileUrl: url, fileName: input.fileName, mimeType: input.mimeType, tag, docPassword: input.docPassword ?? null, docId, extraFiles: [] };
            const updated = addFileToStudyArray(arr, newStudy);
            await upsertMedicalIntakeForPatient(input.patientId, { maleIntake: { ...maleIntakeObj, semenAnalysis: updated } } as any);
          } else if (s === "dnaFragmentation") {
            const arr = parseArrM(maleIntakeObj.dnaFragmentation);
            const newStudy = { id: input.targetStudyId ?? Date.now().toString(), date: "", fileKey: storedKey, fileUrl: url, fileName: input.fileName, mimeType: input.mimeType, tag, docPassword: input.docPassword ?? null, docId, extraFiles: [] };
            const updated = addFileToStudyArray(arr, newStudy);
            await upsertMedicalIntakeForPatient(input.patientId, { maleIntake: { ...maleIntakeObj, dnaFragmentation: updated } } as any);
          } else if (s === "generalAttachmentsMale") {
            const arr = parseArr(intake?.generalAttachmentsMale);
            arr.push(fileEntry);
            await upsertMedicalIntakeForPatient(input.patientId, { generalAttachmentsMale: arr } as any);
          } else if (s === "previousTests") {
            const arr = parseArrM(maleIntakeObj.previousTests);
            const updated = addFileToStudyArray(arr, { id: input.targetStudyId ?? Date.now().toString(), files: [fileEntry] });
            await upsertMedicalIntakeForPatient(input.patientId, { maleIntake: { ...maleIntakeObj, previousTests: updated } } as any);
          } else if (s === "previousSurgeries") {
            const arr = parseArrM(maleIntakeObj.surgicalHistory ?? []);
            const updated = addFileToStudyArray(arr, { id: input.targetStudyId ?? Date.now().toString(), files: [fileEntry] });
            await upsertMedicalIntakeForPatient(input.patientId, { maleIntake: { ...maleIntakeObj, surgicalHistory: updated } } as any);
          } else if (s === "geneticTests") {
            const arr = parseArr(intake?.generalAttachmentsMale);
            arr.push({ ...fileEntry, tag: tag || "Genetic Tests", intakeSection: "geneticTests" });
            await upsertMedicalIntakeForPatient(input.patientId, { generalAttachmentsMale: arr } as any);
          } else if (s === "radiology") {
            const arr = parseArrM(maleIntakeObj.radiologyStudies ?? []);
            arr.push({ id: Date.now().toString(), type: "other", studyName: tag || "Radiology", date: "", fileKey: storedKey, fileUrl: url, fileName: input.fileName, mimeType: input.mimeType, tag, docPassword: input.docPassword ?? null, docId });
            await upsertMedicalIntakeForPatient(input.patientId, { maleIntake: { ...maleIntakeObj, radiologyStudies: arr } } as any);
          }
        }
        return { fileKey: storedKey, fileUrl: url, fileName: input.fileName, docId, tag, linkedLeadId: linkedLeadIdForDoc ?? null };
      }),
    updateDocumentTag: staffOrAdminProcedure
      .input(z.object({ id: z.number(), tag: z.string().nullable() }))
      .mutation(({ input }) => updateLeadDocumentTag(input.id, input.tag)),
    updateDocumentPassword: staffOrAdminProcedure
      .input(z.object({ id: z.number(), docPassword: z.string().nullable() }))
      .mutation(({ input }) => updateLeadDocumentPassword(input.id, input.docPassword)),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await deletePatient(input.id);
        await logAudit({
          userId: ctx.user?.id, userName: ctx.user?.name, userRole: ctx.user?.role,
          action: "delete_patient", category: "patient",
          description: `Deleted patient ID ${input.id}`,
          recordId: input.id, recordType: "patient",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return result;
      }),
    outstandingBalance: staffOrAdminProcedure
      .input(z.object({ patientId: z.number() }))
      .query(({ input }) => getPatientOutstandingBalance(input.patientId)),
    // ─── Partner procedures ───────────────────────────────────────────────────────────────
    getPartner: staffOrAdminProcedure
      .input(z.object({ patientId: z.number() }))
      .query(({ input }) => getPatientPartner(input.patientId)),
    linkPartner: staffOrAdminProcedure
      .input(z.object({ patientId: z.number(), partnerId: z.number() }))
      .mutation(async ({ input }) => {
        await linkPatientPartner(input.patientId, input.partnerId);
        return { success: true };
      }),
    unlinkPartner: staffOrAdminProcedure
      .input(z.object({ patientId: z.number() }))
      .mutation(async ({ input }) => {
        await unlinkPatientPartner(input.patientId);
        return { success: true };
      }),
    // Intake form (accessible from patient record)
    getIntake: staffOrAdminProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ input }) => {
        const linkedLeadId = await resolveLinkedLeadId(input.patientId);
        const result = await resolveCanonicalIntake(null, input.patientId);
        if (result.status === "conflict") {
          return {
            intake: null,
            linkedLeadId: linkedLeadId ?? null,
            conflict: {
              leadIntakeId: result.leadIntakeId,
              patientIntakeId: result.patientIntakeId,
              leadIntakeSummary: result.leadIntakeSummary,
              patientIntakeSummary: result.patientIntakeSummary,
            },
          };
        }
        return {
          intake: result.status === "resolved" ? result.intake : null,
          linkedLeadId: linkedLeadId ?? null,
          conflict: null,
        };
      }),
    saveIntake: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        infertilityType: z.enum(["primary", "secondary"]).nullish(),
        infertilityDuration: z.string().nullish(),
        referralSource: z.string().nullish(),
        profession: z.string().nullish(),
        marriageDate: z.date().nullish(),
        isFirstMarriage: z.boolean().nullish(),
        partnerIsFirstMarriage: z.boolean().nullish(),
        hasCivilMarriageCertificate: z.boolean().nullish(),
        marriageCertStatus: z.string().nullish(),
        heightCm: z.string().nullish(),
        weightKg: z.string().nullish(),
        bmi: z.string().nullish(),
        bmiManual: z.boolean().nullish(),
        waistCm: z.string().nullish(),
        hipCm: z.string().nullish(),
        gravida: z.number().nullish(),
        para: z.number().nullish(),
        abortus: z.number().nullish(),
        livingChildren: z.number().nullish(),
        childrenFromPreviousMarriage: z.number().nullish(),
        lastMenstrualPeriod: z.date().nullish(),
        cycleRegularity: z.enum(["regular", "irregular", "absent"]).nullish(),
        cycleLengthDays: z.number().nullish(),
        menstrualFlowDays: z.number().nullish(),
        dysmenorrhea: z.boolean().nullish(),
        miscarriageHistory: z.any().optional(),
        artHistory: z.any().optional(),
        surgicalHistory: z.any().optional(),
        previousTests: z.any().optional(),
        hasPreviousTests: z.boolean().nullish(),
        systemicDiseases: z.any().optional(),
        smoking: z.enum(["never", "former", "current"]).nullish(),
        smokingPacksPerDay: z.string().nullish(),
        alcohol: z.enum(["never", "occasional", "regular"]).nullish(),
        currentMedications: z.string().nullish(),
        allergies: z.string().nullish(),
        hirsutism: z.boolean().nullish(),
        consanguinity: z.boolean().nullish(),
        hereditaryDiseases: z.string().nullish(),
        familyBreastCancer: z.boolean().nullish(),
        familyEarlyMenopause: z.boolean().nullish(),
        familyInfertility: z.boolean().nullish(),
        contraceptiveHistory: z.any().optional(),
        femaleGeneticTests: z.any().optional(),
        maleIntake: z.any().optional(),
        additionalNotes: z.string().nullish(),
        expectedVisitDate: z.date().nullish(),
        patientQuestions: z.any().optional(),
        radiologyStudies: z.any().optional(),
        maleRadiologyStudies: z.any().optional(),
        generalAttachmentsFemale: z.any().optional(),
        generalAttachmentsMale: z.any().optional(),
        marriageCertFileKey: z.string().nullish(),
        marriageCertFileUrl: z.string().nullish(),
        marriageCertFileName: z.string().nullish(),
        marriageCertDocId: z.number().nullish(),
        marriageCertFilePassword: z.string().nullish(),
        // Phase 2 fix: allow intakeMode to be set from Patient context (directly-created patients)
        intakeMode: z.enum(["legacy", "female", "male", "general"]).optional(),
        // Pending-draft lifecycle: promote pending docs on save
        draftSessionId: z.string().optional(),
        // Phase 2 Correction: atomic Save fields
        activeWriterToken: z.string().optional(),
        requestId: z.string().optional(),
        expectedUpdatedAt: z.date().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { patientId, draftSessionId, activeWriterToken, requestId, expectedUpdatedAt, ...data } = input;
        // ── Conflict guard ────────────────────────────────────────────────────
        // Block writes when two separate intake rows exist for the same person.
        const conflictCheckP = await resolveCanonicalIntake(null, patientId);
        if (conflictCheckP.status === "conflict") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "intake_conflict",
            cause: {
              leadIntakeId: conflictCheckP.leadIntakeId,
              patientIntakeId: conflictCheckP.patientIntakeId,
            },
          });
        }
        // ── End conflict guard ────────────────────────────────────────────────
        // ── Backend future-date validation ────────────────────────────────────
        const now = new Date(); now.setHours(0,0,0,0);
        const isDateFuture = (d: Date | null | undefined) => !!d && new Date(d) > now;
        const isMonthFuture = (s: string | null | undefined) => {
          if (!s) return false;
          const [y, m] = s.split('-').map(Number);
          if (!y) return false;
          const cur = new Date(); const curYM = cur.getFullYear()*12+(cur.getMonth()+1);
          return m ? (y*12+m) > curYM : y > cur.getFullYear();
        };
        const futureFields: string[] = [];
        if (isDateFuture(data.marriageDate)) futureFields.push('marriageDate');
        if (isDateFuture(data.lastMenstrualPeriod)) futureFields.push('lastMenstrualPeriod');
        if (isDateFuture(data.expectedVisitDate)) { /* expectedVisitDate is a scheduling field, skip */ }
        const miscarriages: {date?:string}[] = Array.isArray(data.miscarriageHistory) ? data.miscarriageHistory : [];
        miscarriages.forEach((m,i) => { if (isMonthFuture(m.date)) futureFields.push(`miscarriageHistory[${i}].date`); });
        const artHistory: {date?:string}[] = Array.isArray(data.artHistory) ? data.artHistory : [];
        artHistory.forEach((a,i) => { if (isMonthFuture(a.date)) futureFields.push(`artHistory[${i}].date`); });
        const surgicalHistory: {date?:string}[] = Array.isArray(data.surgicalHistory) ? data.surgicalHistory : [];
        surgicalHistory.forEach((s,i) => { if (s.date && new Date(s.date) > now) futureFields.push(`surgicalHistory[${i}].date`); });
        const previousTests: {collectionDate?:string;reportDate?:string}[] = Array.isArray(data.previousTests) ? data.previousTests : [];
        previousTests.forEach((t,i) => {
          if (t.collectionDate && new Date(t.collectionDate) > now) futureFields.push(`previousTests[${i}].collectionDate`);
          if (t.reportDate && new Date(t.reportDate) > now) futureFields.push(`previousTests[${i}].reportDate`);
        });
        const radiology: {studyDate?:string}[] = Array.isArray(data.radiologyStudies) ? data.radiologyStudies : [];
        radiology.forEach((r,i) => { if (r.studyDate && new Date(r.studyDate) > now) futureFields.push(`radiologyStudies[${i}].studyDate`); });
        if (futureFields.length > 0) {
          const { TRPCError } = await import('@trpc/server');
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Future dates are not allowed for historical records: ${futureFields.join(', ')}` });
        }
        // ── End backend validation ───────────────────────────────────────────────────
        // Strip null values — treat null same as undefined (not provided)
        const cleanData = Object.fromEntries(
          Object.entries(data).filter(([, v]) => v !== null && v !== undefined)
        );
        // ── Atomic Save (Phase 2 Correction) ─────────────────────────────────
        if (draftSessionId && activeWriterToken && requestId) {
          const { saveHealthRecord } = await import("./saveHealthRecord");
          await saveHealthRecord({
            patientId,
            draftSessionId,
            activeWriterToken,
            requestId,
            expectedUpdatedAt: expectedUpdatedAt ?? undefined,
            intakeData: cleanData as any,
            callerUserId: ctx.user.id,
          });
        } else {
          // Legacy path: no draft session — direct upsert (backward compat)
          await upsertMedicalIntakeForPatient(patientId, cleanData as any);
        }
        const linkedLeadId = await resolveLinkedLeadId(patientId);
        return { success: true, linkedLeadId: linkedLeadId ?? null };
      }),

    // Upload a file for a specific intake section entry (patient mode)
    uploadIntakeFile: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        intakeSection: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // ── Conflict guard: section uploads are blocked during an intake conflict ──
        const linkedLeadIdForUpload = await resolveLinkedLeadId(input.patientId);
        if (linkedLeadIdForUpload) {
          const { resolveCanonicalIntake } = await import("./db");
          const canonical = await resolveCanonicalIntake(linkedLeadIdForUpload, input.patientId);
          if (canonical.status === "conflict") {
            throw new TRPCError({ code: "CONFLICT", message: "intake_conflict" });
          }
        }
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "bin";
        const key = `intake-files/patient-${input.patientId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType, input.fileName);
        // ── Canonical ownership: person-level rule, independent of which page uploaded ──
        const canonicalOwnerType = linkedLeadIdForUpload ? "lead" : "patient";
        const canonicalOwnerId = linkedLeadIdForUpload ?? input.patientId;
        // Register in lead_documents so it appears in the Documents tab
        const docId = await createLeadDocument({
          patientId: input.patientId,
          ...(linkedLeadIdForUpload ? { leadId: linkedLeadIdForUpload } : {}),
          fileKey: storedKey,
          fileUrl: url,
          fileName: input.fileName,
          mimeType: input.mimeType,
          uploadedBy: ctx.user.id,
          intakeSection: input.intakeSection ?? null,
          tag: input.intakeSection ?? null,
          lifecycleStatus: "active",
          ownerType: canonicalOwnerType,
          ownerId: canonicalOwnerId,
        });
        return { fileKey: storedKey, fileUrl: url, fileName: input.fileName, docId, linkedLeadId: linkedLeadIdForUpload ?? null };
      }),

    // ── Pending-Draft Upload: upload a file as pending-draft (not yet saved to intake) ──
    // ── Init Draft Session: create or restore a server-managed draft session ──
    // Returns a server-issued activeWriterToken (distinct from draftSessionId).
    // Client MUST call this on edit open and store the returned token in React state.
    initDraftSession: staffOrAdminProcedure
      .input(z.object({
        draftSessionId: z.string(),
        patientId: z.number().optional(),
        intakeId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { createOrResolveDraftSession } = await import("./saveHealthRecord");
        const result = await createOrResolveDraftSession({
          draftSessionId: input.draftSessionId,
          patientId: input.patientId,
          intakeId: input.intakeId,
          createdBy: ctx.user.id,
        });
        return result;
      }),

    // ── Takeover Draft Session: rotate the writer token (cross-tab takeover) ──
    takeoverDraftSession: staffOrAdminProcedure
      .input(z.object({ draftSessionId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { takeOverDraftSession } = await import("./saveHealthRecord");
        const result = await takeOverDraftSession({
          draftSessionId: input.draftSessionId,
          requestingUserId: ctx.user.id,
        });
        return result;
      }),

    uploadPendingIntakeFile: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        intakeSection: z.string().optional(),
        draftSessionId: z.string(),
        activeWriterToken: z.string(),
        pendingSection: z.string().optional(),
        pendingEntryKey: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // ── Writer token validation ──
        const { validateWriterToken } = await import("./db");
        await validateWriterToken({ draftSessionId: input.draftSessionId, activeWriterToken: input.activeWriterToken });
        const linkedLeadId = await resolveLinkedLeadId(input.patientId);
        if (linkedLeadId) {
          const { resolveCanonicalIntake } = await import("./db");
          const canonical = await resolveCanonicalIntake(linkedLeadId, input.patientId);
          if (canonical.status === "conflict") {
            throw new TRPCError({ code: "CONFLICT", message: "intake_conflict" });
          }
        }
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "bin";
        const key = `intake-files/patient-${input.patientId}/pending/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType, input.fileName);
        const { createPendingDraftDocument } = await import("./db");
        const docId = await createPendingDraftDocument({
          patientId: input.patientId,
          ...(linkedLeadId ? { leadId: linkedLeadId } : {}),
          fileKey: storedKey,
          fileUrl: url,
          fileName: input.fileName,
          mimeType: input.mimeType,
          uploadedBy: ctx.user.id,
          intakeSection: input.intakeSection,
          tag: input.intakeSection,
          draftSessionId: input.draftSessionId,
          pendingSection: input.pendingSection,
          pendingEntryKey: input.pendingEntryKey,
        });
        return { fileKey: storedKey, fileUrl: url, fileName: input.fileName, docId, draftSessionId: input.draftSessionId };
      }),

    // ── Cancel Draft Session: terminal cancel state + immediate S3 + AI cleanup ──
    cancelDraftSession: staffOrAdminProcedure
      .input(z.object({ draftSessionId: z.string(), activeWriterToken: z.string() }))
      .mutation(async ({ input, ctx }) => {
        // Validate writer token before cancelling — prevents stale tabs from cancelling active sessions
        const { validateWriterToken, cancelDraftSessionImmediateV2 } = await import("./db");
        await validateWriterToken({ draftSessionId: input.draftSessionId, activeWriterToken: input.activeWriterToken });
        await cancelDraftSessionImmediateV2({ draftSessionId: input.draftSessionId, canceledBy: ctx.user.id });
        return { ok: true };
      }),

    // ── Touch Draft Session: extend expiry for an active draft session ──
    touchDraftSession: staffOrAdminProcedure
      .input(z.object({ draftSessionId: z.string(), activeWriterToken: z.string() }))
      .mutation(async ({ input }) => {
        const { validateWriterToken, touchDraftSession } = await import("./db");
        await validateWriterToken({ draftSessionId: input.draftSessionId, activeWriterToken: input.activeWriterToken });
        await touchDraftSession(input.draftSessionId);
        return { ok: true };
      }),

    // ── Get Pending Draft Docs: fetch pending-draft docs for a session (for restoration) ──
    getPendingDraftDocs: staffOrAdminProcedure
      .input(z.object({ draftSessionId: z.string() }))
      .query(async ({ input }) => {
        const { getPendingDraftDocsBySession } = await import("./db");
        return getPendingDraftDocsBySession(input.draftSessionId);
      }),

    exportProfile: staffOrAdminProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ input }) => {
        const { patientId } = input;
        const [patient, intake, notes, labOrders, labResults, appointments, invoices] = await Promise.all([
          getPatientById(patientId),
          getMedicalIntakeByPatientId(patientId),
          getMedicalNotes(patientId),
          getLabOrders(patientId, undefined),
          getLabResultsByPatient(patientId),
          getAppointments({ patientId }),
          getInvoices(patientId),
        ]);
        return { patient, intake, notes, labOrders, labResults, appointments, invoices };
      }),

    checkNumber: staffOrAdminProcedure
      .input(z.object({ search: z.string().min(1) }))
      .query(async ({ input }) => {
        const { search } = input;
        // Search patients table
        const patientResults = await getAllPatients(search, undefined, 1, 100);
        const patientRows = (patientResults.data).map((p) => ({
          id: p.id as number,
          recordType: "patient" as const,
          mrn: p.mrn ?? null,
          firstName: p.firstName as string,
          middleName: (p.middleName ?? null) as string | null,
          lastName: p.lastName as string,
          phone: (p.phone ?? null) as string | null,
          email: (p.email ?? null) as string | null,
          nationality: (p.nationality ?? null) as string | null,
          status: (p.status ?? null) as string | null,
          interestLevel: (p.interestLevel ?? null) as string | null,
          patientType: (p.patientType ?? null) as string | null,
          createdAt: p.createdAt as Date,
        }));
        // Search leads table
        const leadResults = await getLeads({ search, pageSize: 100 });
        const leadRows = (leadResults.data).map((l) => ({
          id: l.id as number,
          recordType: "lead" as const,
          mrn: null as string | null,
          firstName: l.firstName as string,
          middleName: null as string | null,
          lastName: l.lastName as string,
          phone: (l.phone ?? null) as string | null,
          email: (l.email ?? null) as string | null,
          nationality: (l.nationality ?? null) as string | null,
          status: (l.leadStatus ?? null) as string | null,
          interestLevel: (l.rating ?? null) as string | null,
          patientType: null as string | null,
          createdAt: l.createdAt as Date,
        }));
        return [...patientRows, ...leadRows];
      }),
  }),
  // ─── Appointments ─────────────────────────────────────────────────────────────
  appointments: router({
    list: protectedProcedure
      .input(z.object({
        patientId: z.number().optional(),
        leadId: z.number().optional(),
        doctorId: z.number().optional(),
        hostUserId: z.number().optional(),
        status: z.string().optional(),
        purpose: z.string().optional(),
        appointmentType: z.string().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
      }).optional())
      .query(({ input }) => getAppointments(input ?? {})),

    availabilityOverrideState: staffOrAdminProcedure
      .input(z.object({ appointmentId: z.number() }))
      .query(async ({ input }) => {
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Appointment not found." });
        const activeOverride = await getActiveAppointmentAvailabilityOverride(appointment);
        const reviewState = await getAppointmentTimeOffReviewState(appointment);
        return {
          isOverridden: activeOverride.isActive,
          reason: activeOverride.reason,
          approvedAt: activeOverride.isActive ? appointment.availabilityOverrideAt ?? null : null,
          timeOffId: activeOverride.timeOffId,
          isNeedsRescheduling: reviewState.isNeedsRescheduling,
          reviewTimeOffIds: reviewState.timeOffIds,
        };
      }),

    reschedulingReview: staffOrAdminProcedure
      .input(z.object({ timeOffId: z.number() }))
      .query(({ input }) => getReschedulingReviewForTimeOff(input.timeOffId)),

    reschedulingAvailabilityForDate: staffOrAdminProcedure
      .input(z.object({
        timeOffId: z.number(),
        appointmentId: z.number(),
        dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }))
      .query(({ input }) => getReschedulingAvailabilityForDate(input)),

    recordReschedulingDiagnostic: adminProcedure
      .input(z.object({
        operation: z.enum(["accept_candidate", "keep_exception", "picker_select"]),
        timeOffId: z.number(),
        appointmentId: z.number(),
        appointmentCode: z.string().max(32).optional(),
        candidateValue: z.string().max(128).optional(),
        candidateValueType: z.string().max(64).optional(),
        dateValidity: z.enum(["valid", "invalid", "missing"]),
        errorCategory: z.enum(["client_exception", "transport", "server_response", "unknown"]),
        correlationId: z.string().uuid().optional(),
        applySource: z.enum(["inline_candidate", "more_availability"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await logAudit({
          userId: ctx.user.id,
          userName: ctx.user.name,
          userRole: ctx.user.role,
          action: "rescheduling_review_technical_diagnostic",
          category: "appointment",
          description: `Rescheduling diagnostic | Correlation: ${input.correlationId ?? "not-supplied"} | Apply source: ${input.applySource ?? "not-supplied"} | Operation: ${input.operation} | Appointment: ${input.appointmentCode ?? input.appointmentId} | Time-Off: ${input.timeOffId} | Candidate type: ${input.candidateValueType ?? "missing"} | Date validity: ${input.dateValidity} | Error category: ${input.errorCategory}${input.candidateValue ? ` | Candidate: ${input.candidateValue}` : ""}`,
          recordId: input.appointmentId,
          recordType: "appointment",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return { success: true };
      }),

    acceptReschedulingCandidate: adminProcedure
      .input(z.object({
        timeOffId: z.number(),
        appointmentId: z.number(),
        candidateStart: z.date(),
        expectedUpdatedAt: z.date(),
        correlationId: z.string().uuid(),
        applySource: z.enum(["inline_candidate", "more_availability"]),
        outsideClinicHoursOverride: z.boolean().optional(),
        exceptionReason: z.string().trim().max(500).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const requestStartedAt = Date.now();
        const auditApplyOutcome = async (action: string, details: string, elapsedMs = Date.now() - requestStartedAt) => {
          try {
            await logAudit({
              userId: ctx.user.id,
              userName: ctx.user.name,
              userRole: ctx.user.role,
              action,
              category: "appointment",
              description: `Rescheduling apply | Correlation: ${input.correlationId} | Apply source: ${input.applySource} | Appointment ID: ${input.appointmentId} | Time-Off ID: ${input.timeOffId} | Candidate: ${input.candidateStart.toISOString()} | Elapsed: ${elapsedMs}ms${details ? ` | ${details}` : ""}`,
              recordId: input.appointmentId,
              recordType: "appointment",
              ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
            });
          } catch {
            // Observability cannot block the scheduling decision itself.
          }
        };
        await auditApplyOutcome("rescheduling_apply_request_received", "Outcome: received", 0);
        let applied;
        try {
          applied = await applyReschedulingCandidate({
            ...input,
            actorId: ctx.user.id,
            onStage: (marker, elapsedMs) => auditApplyOutcome("rescheduling_apply_stage", `Outcome: stage | Stage: ${marker}`, elapsedMs),
          });
        } catch (error) {
          if (error instanceof ReschedulingApplyOperationalError) {
            await auditApplyOutcome("rescheduling_apply_operational_failure", `Outcome: operational_failure | Stage: ${error.stage}`);
            throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "The appointment was not changed due to a temporary system error. Please try again." });
          }
          if (error instanceof TRPCError) {
            await auditApplyOutcome("rescheduling_apply_precondition_rejected", `Outcome: precondition_rejected | Code: ${error.code}`);
          }
          throw error;
        }
        await auditApplyOutcome("rescheduling_apply_committed", `Outcome: committed | Reschedule event ID: ${applied.eventId}`);
        await invalidateAppointmentReminderDeliveries(input.appointmentId, "rescheduled");
        await reconcileAppointmentReminderSchedule({ appointmentId: input.appointmentId, source: "reschedule" });
        const oldInterval = JSON.stringify({ start: applied.appointment.appointmentDate.toISOString(), end: applied.oldEnd.toISOString() });
        const newInterval = JSON.stringify({ start: applied.newStart.toISOString(), end: applied.newEnd.toISOString() });
        await logAppointmentActivity(
          input.appointmentId,
          ctx.user.id,
          "rescheduled_due_to_staff_time_off",
          oldInterval,
          newInterval,
        );
        await logAudit({
          userId: ctx.user.id,
          userName: ctx.user.name,
          userRole: ctx.user.role,
          action: "appointment_rescheduled_due_to_staff_time_off",
          category: "appointment",
          description: `Rescheduled appointment ${applied.appointment.code ?? input.appointmentId} due to Staff Time-Off (Time-Off ID ${input.timeOffId}).`,
          recordId: input.appointmentId,
          recordType: "appointment",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        let googleSyncOperationalFailure = false;
        try {
          await auditApplyOutcome("rescheduling_apply_stage", "Outcome: stage | Stage: g2_update_started");
          await runGoogleCalendarG2Sync(input.appointmentId, false, {
            userId: ctx.user.id,
            successAction: "google_event_rescheduled",
          });
          await auditApplyOutcome("rescheduling_apply_stage", "Outcome: stage | Stage: g2_update_completed");
        } catch {
          googleSyncOperationalFailure = true;
          try {
            await logAudit({
              userId: ctx.user.id,
              userName: ctx.user.name,
              userRole: ctx.user.role,
              action: "rescheduling_apply_post_commit_google_failure",
              category: "appointment",
              description: `Rescheduling apply | Correlation: ${input.correlationId} | Apply source: ${input.applySource} | Appointment ID: ${input.appointmentId} | Time-Off ID: ${input.timeOffId} | Elapsed: ${Date.now() - requestStartedAt}ms | Outcome: post_commit_google_failure | Stage: post_commit_google_update`,
              recordId: input.appointmentId,
              recordType: "appointment",
              ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
            });
          } catch {
            // The committed appointment move must remain successful even if audit logging is unavailable.
          }
        }
        await auditApplyOutcome("rescheduling_apply_stage", "Outcome: stage | Stage: response_returned");
        return {
          success: true,
          eventId: applied.eventId,
          newStart: applied.newStart,
          newEnd: applied.newEnd,
          googleSyncOperationalFailure,
          correlationId: input.correlationId,
          applySource: input.applySource,
        };
      }),

    keepReschedulingException: adminProcedure
      .input(z.object({
        timeOffId: z.number(),
        appointmentId: z.number(),
        expectedUpdatedAt: z.date(),
        reason: z.string().trim().min(3).max(500),
      }))
      .mutation(async ({ input, ctx }) => {
        const kept = await keepAppointmentAsTimeOffException({
          ...input,
          actorId: ctx.user.id,
        });
        const appointment = await getAppointmentById(input.appointmentId);
        const appointmentReference = appointment?.code ?? input.appointmentId;
        await logAppointmentActivity(
          input.appointmentId,
          ctx.user.id,
          "availability_exception_kept_for_staff_time_off",
          undefined,
          `Time-Off ID ${input.timeOffId}: ${input.reason}`,
        );
        await logAudit({
          userId: ctx.user.id,
          userName: ctx.user.name,
          userRole: ctx.user.role,
          action: "appointment_availability_exception_kept_for_staff_time_off",
          category: "appointment",
          description: `Kept appointment ${appointmentReference} as an exception for Staff Time-Off (Time-Off ID ${input.timeOffId}). Reason: ${input.reason}`,
          recordId: input.appointmentId,
          recordType: "appointment",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return { success: true, approvedAt: kept.approvedAt };
      }),

    stats: staffOrAdminProcedure.query(() => getAppointmentStats()),

    checkConflicts: staffOrAdminProcedure
      .input(z.object({
        appointmentDate: z.date(),
        duration: z.number().default(30),
        doctorId: z.number().optional(),
        patientId: z.number().optional(),
        excludeId: z.number().optional(),
      }))
      .query(({ input }) => checkAppointmentConflicts(input)),

    create: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number().optional(),
        leadId: z.number().optional(),
        doctorId: z.number().optional(),
        serviceId: z.number().optional(),
        hostUserId: z.number().optional(),
        title: z.string().min(1),
        appointmentDate: z.date(),
        endDate: z.date().optional(),
        duration: z.number().optional(),
        type: z.enum(["consultation", "follow_up", "procedure", "lab", "radiology", "other"]).optional(),
        appointmentType: z.enum(["in-clinic", "online", "external"]).optional(),
        purpose: z.enum(["sales-consultation", "medical-consultation", "follow-up", "procedure", "diagnostic-test"]).optional(),
        meetingLink: z.string().url().refine(value => /^https?:\/\//i.test(value), "Meeting link must use http or https.").optional(),
        partnerClinicId: z.number().optional(),
        externalLocation: z.string().optional(),
        googleReminderMode: z.enum(["calendar_default", "custom"]).optional(),
        notes: z.string().optional(),
        notifyPartner: z.boolean().optional(),
        sendDetailsAfterSave: z.boolean().optional(),
        availabilityOverrideReason: z.string().trim().min(3).max(500).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { notifyPartner, sendDetailsAfterSave, availabilityOverrideReason, ...apptData } = input;
        let timing;
        try {
          timing = normalizeAppointmentTiming({
            appointmentDate: apptData.appointmentDate,
            endDate: apptData.endDate,
            duration: apptData.duration,
          });
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Appointment timing is invalid." });
        }
        const modeFields = normalizeModeScopedAppointmentFields({
          appointmentType: (apptData.appointmentType ?? "in-clinic") as AppointmentMode,
          meetingLink: apptData.meetingLink ?? null,
          externalLocation: apptData.externalLocation ?? null,
          partnerClinicId: apptData.partnerClinicId ?? null,
        });
        const availability = await resolveAppointmentAvailabilityOverride({
          actor: ctx.user,
          appointmentStart: timing.appointmentDate,
          appointmentEnd: timing.endDate,
          doctorId: apptData.doctorId,
          hostUserId: apptData.hostUserId,
          reason: availabilityOverrideReason,
          availabilityContextChanged: true,
        });
        const apptCode = await getNextCode("appointment");
        const appointmentId = await createAppointment({ ...apptData, ...timing, ...modeFields, ...availability.updates, status: "upcoming", code: apptCode } as any);
        await reconcileAppointmentReminderSchedule({ appointmentId, source: "creation" });
        const initialGoogleSync = await runGoogleCalendarG2Sync(appointmentId, true, { userId: ctx.user.id, successAction: "google_event_created" });
        if (modeFields.appointmentType === "online" && !modeFields.meetingLink && initialGoogleSync.status === "synced") {
          const meetResult = await generateGoogleCalendarAppointmentMeet(appointmentId);
          if (meetResult.status === "generated") {
            await logAppointmentActivity(appointmentId, ctx.user.id, "google_meet_generated", undefined, "Google Meet was generated for the mapped Google Calendar event.");
          } else if (meetResult.status === "pending") {
            await logAppointmentActivity(appointmentId, ctx.user.id, "google_meet_pending", undefined, "Google Meet is being prepared for the mapped Google Calendar event.");
          }
        }
        await logAudit({
          userId: ctx.user?.id, userName: ctx.user?.name, userRole: ctx.user?.role,
          action: "create_appointment", category: "appointment",
          description: `Created appointment: ${input.title}`,
          recordId: appointmentId, recordType: "appointment",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        if (availability.applied) {
          await logAppointmentActivity(appointmentId, ctx.user.id, "availability_override_applied", undefined, availabilityOverrideReason!.trim());
          await logAudit({
            userId: ctx.user.id, userName: ctx.user.name, userRole: ctx.user.role,
            action: "appointment_availability_override", category: "appointment",
            description: `Admin availability override approved for appointment ${appointmentId}.`,
            recordId: appointmentId, recordType: "appointment",
            ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
          });
        }
        if (input.patientId) {
          await createNotification({
            userId: input.patientId,
            type: "appointment_reminder",
            title: "Appointment Scheduled",
            message: `Your appointment "${input.title}" has been scheduled for ${input.appointmentDate.toLocaleDateString()}.`,
            relatedType: "appointment",
          });
        }
        const postSaveEmail = sendDetailsAfterSave
          ? await sendPostSaveAppointmentDetailsEmail({ appointmentId, sentByUserId: ctx.user.id })
          : { requested: false as const };
        return { success: true, postSaveEmail };
      }),

    update: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        availabilityOverrideReason: z.string().trim().min(3).max(500).optional(),
        data: z.object({
          status: z.enum(["upcoming", "confirmed", "completed", "cancelled", "no_show", "rescheduled"]).optional(),
          appointmentDate: z.date().optional(),
          endDate: z.date().nullable().optional(),
          duration: z.number().optional(),
          title: z.string().optional(),
          doctorId: z.number().optional(),
          hostUserId: z.number().optional(),
          serviceId: z.number().optional(),
          type: z.enum(["consultation", "follow_up", "procedure", "lab", "radiology", "other"]).optional(),
          appointmentType: z.enum(["in-clinic", "online", "external"]).optional(),
          purpose: z.enum(["sales-consultation", "medical-consultation", "follow-up", "procedure", "diagnostic-test"]).optional(),
          meetingLink: z.string().url().refine(value => /^https?:\/\//i.test(value), "Meeting link must use http or https.").nullable().optional(),
          partnerClinicId: z.number().nullable().optional(),
          externalLocation: z.string().nullable().optional(),
          googleReminderMode: z.enum(["calendar_default", "custom"]).optional(),
          notes: z.string().optional(),
          cancellationReason: z.string().optional(),
          notifyPartner: z.boolean().optional(),
          sendDetailsAfterSave: z.boolean().optional(),
        }),
      }))
      .mutation(async ({ input, ctx }) => {
        // Strip non-DB fields before passing to DB
        const { notifyPartner, sendDetailsAfterSave, ...dbData } = input.data;
        const existing = await getAppointmentById(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Appointment not found." });
        if (dbData.meetingLink !== undefined) {
          try {
            assertMeetingLinkActionAllowed(existing.status);
          } catch (error) {
            throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Meeting link action is unavailable." });
          }
        }
        // Server-side guard: cannot mark as completed if appointment is in the future
        if (dbData.status === 'completed') {
          const appt = existing;
          if (appt && new Date(appt.appointmentDate) > new Date()) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot mark an appointment as completed before its scheduled time has passed.',
            });
          }
        }
        // Server-side guard: cannot cancel or change status of a completed appointment
        if (dbData.status && dbData.status !== 'completed') {
          const appt = existing;
          if (appt?.status === 'completed') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot modify a completed appointment.',
            });
          }
        }
        const shouldNormalizeTiming = dbData.appointmentDate !== undefined || dbData.endDate !== undefined || dbData.duration !== undefined;
        let timingUpdate: Record<string, unknown> = {};
        if (shouldNormalizeTiming) {
          try {
            timingUpdate = normalizeAppointmentTiming({
              appointmentDate: dbData.appointmentDate ?? existing.appointmentDate,
              endDate: dbData.endDate !== undefined
                ? dbData.endDate
                : (dbData.appointmentDate !== undefined || dbData.duration !== undefined ? null : existing.endDate),
              duration: dbData.duration ?? existing.duration,
            });
          } catch (error) {
            throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Appointment timing is invalid." });
          }
        }
        const shouldNormalizeMode = dbData.appointmentType !== undefined || dbData.meetingLink !== undefined || dbData.externalLocation !== undefined || dbData.partnerClinicId !== undefined;
        const modeUpdate = shouldNormalizeMode
          ? normalizeModeScopedAppointmentFields({
              appointmentType: (dbData.appointmentType ?? existing.appointmentType ?? "in-clinic") as AppointmentMode,
              meetingLink: dbData.meetingLink !== undefined ? dbData.meetingLink : existing.meetingLink,
              externalLocation: dbData.externalLocation !== undefined ? dbData.externalLocation : existing.externalLocation,
              partnerClinicId: dbData.partnerClinicId !== undefined ? dbData.partnerClinicId : existing.partnerClinicId,
            })
          : {};
        const shouldClearGoogleConference = existing.appointmentType === "online" && Boolean(existing.meetingLink) && (modeUpdate as Record<string, unknown>).meetingLink === null;
        const isReactivation = isAppointmentReactivation(existing.status, dbData.status);
        const availabilityContextChanged = shouldNormalizeTiming || dbData.doctorId !== undefined || dbData.hostUserId !== undefined;
        const proposedStart = (timingUpdate.appointmentDate ?? existing.appointmentDate) as Date;
        const proposedEnd = ((timingUpdate.endDate ?? existing.endDate) as Date | null)
          ?? new Date(proposedStart.getTime() + Number(timingUpdate.duration ?? existing.duration ?? 30) * 60_000);
        const existingActiveOverride = await getActiveAppointmentAvailabilityOverride(existing);
        const availability = (availabilityContextChanged || input.availabilityOverrideReason)
          ? await resolveAppointmentAvailabilityOverride({
              actor: ctx.user,
              appointmentStart: proposedStart,
              appointmentEnd: proposedEnd,
              doctorId: (dbData.doctorId ?? existing.doctorId) as number | null | undefined,
              hostUserId: (dbData.hostUserId ?? existing.hostUserId) as number | null | undefined,
              reason: input.availabilityOverrideReason,
              hasExistingOverride: existingActiveOverride.isActive,
              availabilityContextChanged,
            })
          : { updates: {}, applied: false, conflictCount: 0 };
        const appointmentUpdate = { ...dbData, ...timingUpdate, ...modeUpdate, ...availability.updates } as Record<string, unknown>;
        const scheduleChanged = shouldNormalizeTiming && hasAuthoritativeAppointmentScheduleChanged(existing, {
          appointmentDate: (timingUpdate.appointmentDate ?? existing.appointmentDate) as Date,
          endDate: (timingUpdate.endDate ?? existing.endDate) as Date | null,
          duration: (timingUpdate.duration ?? existing.duration) as number | null,
        });
        if (scheduleChanged) appointmentUpdate.appointmentScheduleRevision = Number(existing.appointmentScheduleRevision ?? 1) + 1;
        if (isReactivation) appointmentUpdate.cancellationReason = null;
        await updateAppointment(input.id, appointmentUpdate as any);
        if (scheduleChanged) {
          await invalidateAppointmentReminderDeliveries(input.id, "rescheduled");
          await reconcileAppointmentReminderSchedule({ appointmentId: input.id, source: "reschedule" });
        } else if (dbData.status === "cancelled") {
          await invalidateAppointmentReminderDeliveries(input.id, "cancelled");
        } else if (isReactivation) {
          await restoreCancelledAppointmentReminders(input.id);
        } else if (dbData.status === "completed" || dbData.status === "no_show") {
          await invalidateAppointmentReminderDeliveries(input.id, `status_${dbData.status}`);
        }
        const googleAuditAction = input.data.status === "cancelled"
          ? "google_event_cancelled"
          : input.data.status === "no_show"
            ? "google_event_no_show"
            : input.data.status === "rescheduled" || input.data.appointmentDate
              ? "google_event_rescheduled"
              : "google_event_updated";
        await runGoogleCalendarG2Sync(input.id, false, { userId: ctx.user.id, successAction: googleAuditAction });
        if (shouldClearGoogleConference) {
          const clearConference = await clearGoogleCalendarAppointmentConference(input.id);
          if (clearConference.status === "cleared") {
            await logAppointmentActivity(input.id, ctx.user.id, "google_meet_cleared", undefined, "Google Meet conference data was removed from the mapped Google Calendar event.");
          } else if (clearConference.status === "failed") {
            await logAppointmentActivity(input.id, ctx.user.id, "google_meet_clear_failed", undefined, "Google Meet conference cleanup requires attention.");
          }
        }
        await logAudit({
          userId: ctx.user?.id, userName: ctx.user?.name, userRole: ctx.user?.role,
          action: input.data.status ? `appointment_${input.data.status}` : "update_appointment",
          category: "appointment",
          description: input.data.status ? `Appointment ${input.id} status changed to ${input.data.status}` : `Updated appointment ${input.id}`,
          recordId: input.id, recordType: "appointment",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        if (availability.applied) {
          await logAppointmentActivity(input.id, ctx.user.id, "availability_override_applied", undefined, input.availabilityOverrideReason!.trim());
          await logAudit({
            userId: ctx.user.id, userName: ctx.user.name, userRole: ctx.user.role,
            action: "appointment_availability_override", category: "appointment",
            description: `Admin availability override approved for appointment ${input.id}.`,
            recordId: input.id, recordType: "appointment",
            ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
          });
        }
        // Log activity
        if (input.data.status) {
          await logAppointmentActivity(input.id, ctx.user.id, `status_changed_to_${input.data.status}`);
          if (input.data.status === "cancelled") {
            await logAppointmentActivity(
              input.id,
              ctx.user.id,
              "appointment_cancelled",
              undefined,
              input.data.cancellationReason?.trim() || "No cancellation reason recorded."
            );
          } else if (isReactivation) {
            await logAppointmentActivity(
              input.id,
              ctx.user.id,
              "appointment_reactivated",
              existing.cancellationReason ?? undefined,
              "Cancellation reason cleared from the current appointment state."
            );
          }
        }
        const postSaveEmail = sendDetailsAfterSave
          ? await sendPostSaveAppointmentDetailsEmail({ appointmentId: input.id, sentByUserId: ctx.user.id })
          : { requested: false as const };
        return { success: true, postSaveEmail };
      }),

    batchUpdate: staffOrAdminProcedure
      .input(z.object({
        ids: z.array(z.number()).min(1),
        data: z.object({
          status: z.enum(["upcoming", "confirmed", "completed", "cancelled", "no_show", "rescheduled"]).optional(),
          cancellationReason: z.string().optional(),
        }),
      }))
      .mutation(async ({ input, ctx }) => {
        if (input.data.status === "cancelled") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Bulk cancellation is available only to administrators through the dedicated Bulk Cancel action." });
        }
        await batchUpdateAppointments(input.ids, input.data);
        // Log activity for each
        for (const id of input.ids) {
          if (input.data.status) {
            await logAppointmentActivity(id, ctx.user.id, `batch_status_changed_to_${input.data.status}`);
            if (input.data.status === "completed" || input.data.status === "no_show") {
              await invalidateAppointmentReminderDeliveries(id, `status_${input.data.status}`);
            }
          }
          await runGoogleCalendarG2Sync(id, false, { userId: ctx.user.id, successAction: "google_event_updated" });
        }
        return { success: true, count: input.ids.length };
      }),

    bulkCancel: adminProcedure
      .input(z.object({
        appointments: z.array(z.object({
          appointmentId: z.number().int().positive(),
          reason: z.string().trim().max(500).optional(),
        })).min(1).refine(items => new Set(items.map(item => item.appointmentId)).size === items.length, "Each appointment may be selected only once."),
        generalReason: z.string().trim().max(500).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const results: Array<{ appointmentId: number; outcome: "cancelled" | "skipped_already_cancelled" | "skipped_completed" | "skipped_no_show" | "skipped_rescheduled" | "failed"; googleSync: "synced" | "pending" | "not_applicable"; message?: string }> = [];
        for (const action of input.appointments) {
          try {
            const appointment = await getAppointmentById(action.appointmentId);
            if (!appointment) {
              results.push({ appointmentId: action.appointmentId, outcome: "failed", googleSync: "not_applicable", message: "Appointment could not be found." });
              continue;
            }
            const eligibleOutcome = getBulkCancelOutcome(appointment.status as AppointmentBulkCancelStatus);
            if (eligibleOutcome !== "cancelled") {
              results.push({ appointmentId: action.appointmentId, outcome: eligibleOutcome, googleSync: "not_applicable" });
              continue;
            }

            const reason = resolveBulkAppointmentReason(action.reason, input.generalReason);
            const cancelled = await cancelAppointmentWithLifecycle({
              appointmentId: action.appointmentId,
              userId: ctx.user.id,
              userName: ctx.user.name,
              userRole: ctx.user.role,
              reason,
              ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
            });
            if (!cancelled) {
              results.push({ appointmentId: action.appointmentId, outcome: "failed", googleSync: "not_applicable", message: "Appointment changed before it could be cancelled. Refresh and retry this appointment." });
              continue;
            }
            await invalidateAppointmentReminderDeliveries(action.appointmentId, "cancelled");
            const sync = await runGoogleCalendarG2Sync(action.appointmentId, false, { userId: ctx.user.id, successAction: "google_event_cancelled" });
            results.push({
              appointmentId: action.appointmentId,
              outcome: "cancelled",
              googleSync: sync.status === "failed" ? "pending" : "synced",
            });
          } catch {
            console.warn("[BulkAppointmentCancel] An appointment could not be cancelled.", { appointmentId: action.appointmentId });
            results.push({ appointmentId: action.appointmentId, outcome: "failed", googleSync: "not_applicable", message: "Appointment could not be cancelled. Retry this appointment." });
          }
        }
        return { results, summary: summarizeBulkAppointmentOutcomes(results) };
      }),

    bulkDelete: adminProcedure
      .input(z.object({
        appointments: z.array(z.object({
          appointmentId: z.number().int().positive(),
          reason: z.string().trim().max(500).optional(),
        })).min(1).refine(items => new Set(items.map(item => item.appointmentId)).size === items.length, "Each appointment may be selected only once."),
        generalReason: z.string().trim().max(500).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const results: Array<{ appointmentId: number; outcome: "deleted" | "failed"; googleDeletion: "deleted" | "pending" | "skipped" | "not_applicable"; message?: string }> = [];
        for (const action of input.appointments) {
          try {
            const snapshot = await getAppointmentDeletionAuditSnapshot(action.appointmentId);
            if (!snapshot) {
              results.push({ appointmentId: action.appointmentId, outcome: "failed", googleDeletion: "not_applicable", message: "Appointment could not be found." });
              continue;
            }
            const reason = resolveBulkAppointmentReason(action.reason, input.generalReason);
            // This deliberately performs a direct hard delete; it never creates a cancellation lifecycle event.
            await logAppointmentActivity(action.appointmentId, ctx.user.id, "deleted", undefined, reason ?? "No reason provided");
            await logAudit({
              userId: ctx.user.id, userName: ctx.user.name, userRole: ctx.user.role,
              action: "delete_appointment", category: "appointment",
              description: formatAppointmentDeletionAuditDescription(snapshot, reason),
              recordId: action.appointmentId, recordType: "appointment",
              ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
            });
            await deleteAppointment(action.appointmentId);
            const deletionSync = await runGoogleCalendarG2Deletion(action.appointmentId);
            const googleDeletion = deletionSync.status === "failed" ? "pending" : deletionSync.status;
            await logAudit({
              userId: ctx.user.id, userName: ctx.user.name, userRole: ctx.user.role,
              action: googleDeletion === "pending" ? "google_event_removal_pending" : "google_event_removed",
              category: "appointment",
              description: googleDeletion === "pending"
                ? `Google Calendar event removal requires retry for bulk-deleted appointment ${action.appointmentId}`
                : `Google Calendar event removal completed for bulk-deleted appointment ${action.appointmentId}`,
              recordId: action.appointmentId, recordType: "appointment",
              ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
            });
            results.push({ appointmentId: action.appointmentId, outcome: "deleted", googleDeletion });
          } catch {
            console.warn("[BulkAppointmentDelete] An appointment could not be deleted.", { appointmentId: action.appointmentId });
            results.push({ appointmentId: action.appointmentId, outcome: "failed", googleDeletion: "not_applicable", message: "Appointment could not be deleted. Retry this appointment." });
          }
        }
        return { results, summary: summarizeBulkAppointmentOutcomes(results) };
      }),

    activityLog: staffOrAdminProcedure
      .input(z.object({ appointmentId: z.number() }))
      .query(({ input }) => getAppointmentActivityLog(input.appointmentId)),

    reminderHistory: adminProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .query(({ input }) => getAppointmentReminderHistory(input.appointmentId)),

    communicationOptions: appointmentCommunicationsProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const context = await getAppointmentCommunicationContext(input.appointmentId);
        if (!context) throw new TRPCError({ code: "NOT_FOUND", message: "Appointment not found." });
        const canSend = isManualAppointmentCommunicationStatus(context.appointment.status);
        const languageRegistry = await getReferenceData("language");
        const supportedLocales = languageRegistry.filter(item => APPOINTMENT_COMMUNICATION_PUBLISHED_LOCALES.includes(item.code)).map(item => ({ code: item.code, label: item.label }));
        return {
          canSend,
          status: context.appointment.status,
          actionLabel: appointmentCommunicationActionLabel(context.appointment.status),
          recipients: [context.primaryRecipient, context.partnerRecipient]
            .filter((recipient): recipient is NonNullable<typeof recipient> => Boolean(recipient))
            .map(recipient => {
              const locale = resolveAppointmentCommunicationLocale(recipient.preferredLanguage);
              return {
                source: recipient.source,
                displayName: recipient.displayName,
                email: recipient.email,
                recipientType: recipient.recipientType,
                preferredLanguage: recipient.preferredLanguage,
                defaultLanguage: locale.deliveredLocale,
                localeFallbackUsed: locale.fallbackUsed,
                localeFallbackFrom: locale.fallbackUsed ? recipient.preferredLanguage ?? null : null,
              };
            }),
          supportedLocales,
        };
      }),

    sendDetails: appointmentCommunicationsProcedure
      .input(z.object({
        appointmentId: z.number().int().positive(),
        recipients: z.array(z.object({
          source: z.enum(["primary", "partner", "additional"]),
          email: z.string().trim().email(),
          language: z.string().trim().min(2).max(16),
        })).min(1, "Select at least one recipient.").max(10, "A maximum of 10 recipients can be sent at once."),
      }))
      .mutation(async ({ input, ctx }) => {
        const context = await getAppointmentCommunicationContext(input.appointmentId);
        if (!context) throw new TRPCError({ code: "NOT_FOUND", message: "Appointment not found." });
        if (!isManualAppointmentCommunicationStatus(context.appointment.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Manual appointment communication is available only for upcoming, confirmed, rescheduled, or cancelled appointments." });
        }

        const normalizeEmail = (email: string) => email.trim().toLowerCase();
        const primary = context.primaryRecipient;
        const partner = context.partnerRecipient;
        const seenEmails = new Set<string>();
        const approvedRecipients = input.recipients.map(recipient => {
          const email = normalizeEmail(recipient.email);
          if (seenEmails.has(email)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Each recipient email may be selected only once." });
          }
          seenEmails.add(email);

          if (recipient.source === "primary") {
            if (!primary || normalizeEmail(primary.email) !== email) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "The selected primary recipient is no longer available for this appointment." });
            }
            return { ...recipient, email, recipientType: primary.recipientType, recipientName: primary.displayName };
          }
          if (recipient.source === "partner") {
            if (!partner || normalizeEmail(partner.email) !== email) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "The selected linked partner is no longer available for this appointment." });
            }
            return { ...recipient, email, recipientType: "partner" as const, recipientName: partner.displayName };
          }
          return { ...recipient, email, recipientType: "additional" as const, recipientName: undefined };
        });

        const sendGroupId = randomUUID();
        const outcomes = [] as Array<{ sent: boolean }>;
        for (const recipient of approvedRecipients) {
          const localeResolution = resolveAppointmentCommunicationLocale(recipient.language);
          const language = localeResolution.deliveredLocale as AppointmentCommunicationLanguage;
          const projection = buildAppointmentCommunicationProjection({
            recipientName: recipient.recipientName,
            appointment: context.appointment,
            partnerClinic: context.partnerClinic,
            clinic: context.clinic,
          }, language);
          const delivery = await sendAppointmentDetailsEmail(recipient.email, projection, language);
          await createAppointmentCommunicationDelivery({
            appointmentId: input.appointmentId,
            sendGroupId,
            recipientEmail: recipient.email,
            recipientType: recipient.recipientType,
            language,
            templateKey: `appointment_${projection.communicationKind}`,
            templateVersion: APPOINTMENT_COMMUNICATION_TEMPLATE_VERSION,
            profileLanguage: recipient.source === "primary" ? primary?.preferredLanguage : recipient.source === "partner" ? partner?.preferredLanguage : null,
            localeFallbackUsed: localeResolution.fallbackUsed,
            sentByUserId: ctx.user.id,
            deliveryStatus: delivery.sent ? "sent" : "failed",
            providerMessageId: delivery.providerMessageId,
            failureClassification: delivery.failureClassification,
            failureCode: delivery.failureCode,
          });
          outcomes.push({ sent: delivery.sent });
        }

        const sentCount = outcomes.filter(outcome => outcome.sent).length;
        const failedCount = outcomes.length - sentCount;
        await logAppointmentActivity(
          input.appointmentId,
          ctx.user.id,
          "appointment_details_email_manual_send",
          undefined,
          `Manual appointment ${context.appointment.status === "cancelled" ? "cancellation notice" : context.appointment.status === "confirmed" ? "confirmation" : "details"} email: ${sentCount} sent, ${failedCount} failed.`,
        );
        return { sendGroupId, sentCount, failedCount };
      }),

    googleSyncStatus: staffOrAdminProcedure
      .input(z.object({ appointmentId: z.number() }))
      .query(async ({ input }) => {
        const sync = await getGoogleCalendarAppointmentSync(input.appointmentId);
        if (!sync) return null;
        const connection = await getGoogleCalendarSafeStatus();
        const reconnectRequired = connection.status === "needs_attention";
        return {
          status: reconnectRequired ? "reconnect_required" : sync.syncStatus,
          operation: sync.operation,
          lastSyncedAt: sync.lastSyncedAt,
          lastError: reconnectRequired
            ? connection.lastError ?? "Google Calendar authorization needs to be reconnected."
            : sync.lastSyncError,
          destinationCalendarName: connection.destinationCalendar?.id === sync.googleCalendarId
            ? connection.destinationCalendar.name
            : null,
          verifiedEventUrl: reconnectRequired ? null : sync.googleEventHtmlLink,
          lastVerifiedEventAt: reconnectRequired ? null : sync.lastVerifiedEventAt,
          canRetry: !reconnectRequired && ["pending", "failed", "deletion_pending"].includes(sync.syncStatus),
          canOpenInGoogle: !reconnectRequired && sync.syncStatus === "synced" && sync.operation === "upsert" && Boolean(sync.googleCalendarId && sync.googleEventId),
        };
      }),

    googleSyncEventLink: staffOrAdminProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .query(async ({ input }) => ({ url: await getGoogleCalendarAppointmentEventLink(input.appointmentId) })),

    retryGoogleSync: staffOrAdminProcedure
      .input(z.object({ appointmentId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await retryGoogleCalendarAppointmentSync(input.appointmentId);
        if (result.status === "synced" || result.status === "deleted") {
          await logAppointmentActivity(input.appointmentId, ctx.user.id, "google_sync_manual_retry_succeeded", undefined, "Google Calendar retry completed.");
        } else if (result.status === "failed") {
          await logAppointmentActivity(input.appointmentId, ctx.user.id, "google_sync_manual_retry_failed", undefined, "Google Calendar retry requires attention.");
        }
        return result;
      }),

    generateGoogleMeet: staffOrAdminProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Appointment not found." });
        if (!canUseMeetingLinkActions(appointment.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Google Meet cannot be generated while an appointment is cancelled. Re-activate the appointment first." });
        }
        const result = await generateGoogleCalendarAppointmentMeet(input.appointmentId);
        if (result.status === "generated") {
          await logAppointmentActivity(input.appointmentId, ctx.user.id, "google_meet_generated", undefined, "Google Meet link generated for this online appointment.");
        } else if (result.status === "failed") {
          await logAppointmentActivity(input.appointmentId, ctx.user.id, "google_meet_generation_failed", undefined, "Google Meet generation requires attention.");
        }
        return result;
      }),

    markNoShow: staffOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await updateAppointment(input.id, { status: "no_show" } as any);
        await invalidateAppointmentReminderDeliveries(input.id, "status_no_show");
        await runGoogleCalendarG2Sync(input.id, false, { userId: ctx.user.id, successAction: "google_event_no_show" });
        await logAppointmentActivity(input.id, ctx.user.id, "status_changed_to_no_show");
        return { success: true };
      }),

    delete: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const snapshot = await getAppointmentDeletionAuditSnapshot(input.id);
        if (!snapshot) throw new TRPCError({ code: "NOT_FOUND", message: "Appointment not found." });
        const reason = input.reason?.trim() || undefined;
        // Log deletion before deleting (activity log rows will be deleted with the appointment)
        await logAppointmentActivity(input.id, ctx.user.id, "deleted", undefined, reason ?? "No reason provided");
        await logAudit({
          userId: ctx.user?.id, userName: ctx.user?.name, userRole: ctx.user?.role,
          action: "delete_appointment", category: "appointment",
          description: formatAppointmentDeletionAuditDescription(snapshot, reason),
          recordId: input.id, recordType: "appointment",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        await invalidateAppointmentReminderDeliveries(input.id, "appointment_deleted");
        await deleteAppointment(input.id);
        const deletionSync = await runGoogleCalendarG2Deletion(input.id);
        await logAudit({
          userId: ctx.user?.id, userName: ctx.user?.name, userRole: ctx.user?.role,
          action: deletionSync.status === "deleted" || deletionSync.status === "skipped" ? "google_event_removed" : "google_event_removal_pending",
          category: "appointment",
          description: deletionSync.status === "deleted" || deletionSync.status === "skipped"
            ? `Google Calendar event removal completed for deleted appointment ID ${input.id}`
            : `Google Calendar event removal requires retry for deleted appointment ID ${input.id}`,
          recordId: input.id, recordType: "appointment",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return { success: true };
      }),

    bulkRescheduleOrReassign: staffOrAdminProcedure
      .input(z.object({
        actions: z.array(z.object({
          appointmentId: z.number(),
          newDate: z.date().optional(),
          newDoctorId: z.number().optional(),
          newHostUserId: z.number().optional(),
          availabilityOverrideReason: z.string().trim().min(3).max(500).optional(),
          dismiss: z.boolean().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const results: { appointmentId: number; success: boolean; error?: string }[] = [];
        for (const action of input.actions) {
          try {
            if (action.dismiss) {
              results.push({ appointmentId: action.appointmentId, success: true });
              continue;
            }
            const updates: Record<string, unknown> = {};
            if (action.newDate) updates.appointmentDate = action.newDate;
            if (action.newDoctorId !== undefined) updates.doctorId = action.newDoctorId;
            if (action.newHostUserId !== undefined) (updates as any).hostUserId = action.newHostUserId;
            if (Object.keys(updates).length > 0) {
              const existing = await getAppointmentById(action.appointmentId);
              if (!existing) throw new Error("Appointment not found.");
              const proposedStart = (action.newDate ?? existing.appointmentDate) as Date;
              const proposedEnd = new Date(proposedStart.getTime() + Number(existing.duration ?? 30) * 60_000);
              const availability = await resolveAppointmentAvailabilityOverride({
                actor: ctx.user,
                appointmentStart: proposedStart,
                appointmentEnd: proposedEnd,
                doctorId: action.newDoctorId ?? existing.doctorId,
                hostUserId: action.newHostUserId ?? existing.hostUserId,
                reason: action.availabilityOverrideReason,
                hasExistingOverride: Boolean(existing.availabilityOverrideReason),
                availabilityContextChanged: true,
              });
              if (action.newDate && action.newDate.getTime() !== existing.appointmentDate.getTime()) {
                updates.appointmentScheduleRevision = Number(existing.appointmentScheduleRevision ?? 1) + 1;
              }
              await updateAppointment(action.appointmentId, { ...updates, ...availability.updates });
              if (action.newDate && action.newDate.getTime() !== existing.appointmentDate.getTime()) {
                await invalidateAppointmentReminderDeliveries(action.appointmentId, "rescheduled");
                await reconcileAppointmentReminderSchedule({ appointmentId: action.appointmentId, source: "reschedule" });
              }
              await runGoogleCalendarG2Sync(action.appointmentId, false, { userId: ctx.user.id, successAction: "google_event_rescheduled" });
              const logNote = [
                action.newDate ? "rescheduled" : "",
                action.newDoctorId ? "reassigned doctor" : "",
                action.newHostUserId ? "reassigned host" : "",
              ].filter(Boolean).join(", ");
              await logAppointmentActivity(action.appointmentId, ctx.user.id, "rescheduled", undefined, `Bulk action: ${logNote}`);
              if (availability.applied) {
                await logAppointmentActivity(action.appointmentId, ctx.user.id, "availability_override_applied", undefined, action.availabilityOverrideReason!.trim());
                await logAudit({
                  userId: ctx.user.id, userName: ctx.user.name, userRole: ctx.user.role,
                  action: "appointment_availability_override", category: "appointment",
                  description: `Admin availability override approved for appointment ${action.appointmentId}.`,
                  recordId: action.appointmentId, recordType: "appointment",
                  ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
                });
              }
            }
            results.push({ appointmentId: action.appointmentId, success: true });
          } catch (e: any) {
            results.push({ appointmentId: action.appointmentId, success: false, error: e.message });
          }
        }
        return { results };
      }),
  }),
  // ─── Medical Notes ────────────────────────────────────────────────────────────
  medicalNotes: router({
    list: staffOrAdminProcedure
      .input(z.object({ patientId: z.number() }))
      .query(({ input }) => getMedicalNotes(input.patientId)),

    create: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        doctorId: z.number().optional(),
        noteType: z.enum(["consultation", "follow_up", "procedure", "lab_review", "general"]).optional(),
        chiefComplaint: z.string().optional(),
        historyOfPresentIllness: z.string().optional(),
        physicalExamination: z.string().optional(),
        assessment: z.string().optional(),
        plan: z.string().optional(),
        diagnosis: z.string().optional(),
        medications: z.string().optional(),
        visitDate: z.date().optional(),
        isAiGenerated: z.boolean().optional(),
        additionalNotes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Role-aware authorship:
        // - doctor role: doctorId is auto-set on frontend to their profile; enteredById = same user
        // - admin/staff role: doctorId must be selected on frontend; enteredById = the staff user
        const enteredById = ctx.user.id;
        const result = await createMedicalNote({ ...input, authorId: ctx.user.id, enteredById });
        await logAudit({
          userId: ctx.user?.id, userName: ctx.user?.name, userRole: ctx.user?.role,
          action: "create_medical_note", category: "medical_note",
          description: `Created medical note for patient ID ${input.patientId}`,
          recordId: input.patientId, recordType: "patient",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return result;
      }),

    update: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          chiefComplaint: z.string().optional(),
          historyOfPresentIllness: z.string().optional(),
          physicalExamination: z.string().optional(),
          assessment: z.string().optional(),
          plan: z.string().optional(),
          diagnosis: z.string().optional(),
          medications: z.string().optional(),
          aiSummary: z.string().optional(),
          doctorId: z.number().optional(),
          additionalNotes: z.string().optional().nullable(),
          visitDate: z.date().optional(),
        }),
      }))
      .mutation(({ input }) => updateMedicalNote(input.id, input.data)),

    // Voice transcription: base64 audio → text (powered by Groq Whisper)
    transcribeVoice: staffOrAdminProcedure
      .input(z.object({
        audioBase64: z.string().min(1),
        mimeType: z.string().optional(),
        language: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await transcribeAudioGroq({
          audioBase64: input.audioBase64,
          mimeType: input.mimeType,
          language: input.language,
        });
        if ("error" in result) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error });
        return { text: result.text, language: result.language };
      }),

    // AI-assisted: transcribe + summarize
    generateAiSummary: staffOrAdminProcedure
      .input(z.object({
        rawText: z.string().min(10),
        noteType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const result = await generateMedicalScribeSummary(input);
          return result.summary;
        } catch (error) {
          if (error instanceof MedicalScribeUnavailableError) {
            throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: error.message });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI Medical Scribe could not generate a valid structured note. Please retry or complete the note manually." });
        }
      }),
    // Request cancellation (doctor or staff — no direct delete allowed)
    requestCancellation: protectedProcedure
      .input(z.object({
        id: z.number(),
        reason: z.string().min(1, "Please provide a reason for cancellation"),
      }))
      .mutation(async ({ input, ctx }) => {
        const role = ctx.user.role;
        if (role !== "doctor" && role !== "staff" && role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only doctors and staff can request cancellation" });
        }
        const { medicalNotes: mnTable } = await import("../drizzle/schema");
        const { getDb } = await import("./db");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        await db.update(mnTable)
          .set({
            cancellationStatus: "requested",
            cancellationReason: input.reason,
            cancellationRequestedBy: ctx.user.id,
            cancellationRequestedAt: Date.now(),
          })
          .where(eq(mnTable.id, input.id));
        try {
          await notifyOwner({
            title: "Medical Note Cancellation Requested",
            content: `${ctx.user.name ?? "User"} (${role}) requested cancellation of medical note ID ${input.id}. Reason: ${input.reason}`,
          });
        } catch (error) {
          console.warn("[medicalNotes] owner alert failed", error instanceof Error ? error.name : "error");
        }
        return { success: true };
      }),
    // Approve cancellation = permanently delete the note (admin only)
    approveCancellation: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { medicalNotes: mnTable } = await import("../drizzle/schema");
        const { getDb } = await import("./db");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        await db.delete(mnTable).where(eq(mnTable.id, input.id));
        await logAudit({
          userId: ctx.user.id, userName: ctx.user.name ?? "", userRole: ctx.user.role,
          action: "delete", category: "medical_note",
          description: `Admin approved cancellation and deleted medical note ID ${input.id}`,
          recordId: input.id, recordType: "medical_note",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return { success: true };
      }),
    // Reject cancellation request (admin only)
    rejectCancellation: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { medicalNotes: mnTable } = await import("../drizzle/schema");
        const { getDb } = await import("./db");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        await db.update(mnTable)
          .set({ cancellationStatus: "rejected" })
          .where(eq(mnTable.id, input.id));
        return { success: true };
      }),

    // ── Send Medical Note via Email ──────────────────────────────────────────
    sendEmail: staffOrAdminProcedure
      .input(z.object({
        noteId: z.number(),
        patientId: z.number(),
        toEmail: z.string().email(),
        attachPdf: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        const { generateMedicalReportPdf } = await import("./pdfService");
        const { getMedicalNoteById, getPatientById, getDoctorById } = await import("./db");
        const { Resend } = await import("resend");

        const note = await getMedicalNoteById(input.noteId);
        if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Medical note not found" });
        const patient = await getPatientById(input.patientId);
        if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "Patient not found" });

        const patientName = [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(" ");
        let age: number | undefined;
        let dateOfBirthStr: string | undefined;
        if (patient.dateOfBirth) {
          const dob = new Date(patient.dateOfBirth);
          const now = new Date();
          age = now.getFullYear() - dob.getFullYear();
          const m = now.getMonth() - dob.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
          dateOfBirthStr = dob.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
        }
        let doctorName: string | undefined;
        let doctorTitle: string | undefined;
        let doctorSpecialty: string | undefined;
        let doctorStampKey: string | undefined;
        if ((note as any).doctorId) {
          const doctor = await getDoctorById((note as any).doctorId);
          if (doctor) {
            doctorName = [doctor.firstName, doctor.secondName, doctor.thirdName].filter(Boolean).join(" ") || doctor.name || undefined;
            doctorTitle = (doctor as any).title ?? undefined;
            doctorSpecialty = doctor.specialty ?? undefined;
            doctorStampKey = (doctor as any).stampUrl ?? undefined;
          }
        }
        const noteTypeMap: Record<string, string> = { consultation: "Consultation", follow_up: "Follow Up", procedure: "Procedure", lab_review: "Lab Review", general: "General" };
        const noteTypeLabel = noteTypeMap[(note as any).noteType ?? "consultation"] ?? "Consultation";
        const reportRef = `MR-${String(input.noteId).padStart(5, "0")}`;
        const visitDate = (note as any).visitDate
          ? new Date((note as any).visitDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
          : new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

        const attachments: Array<{ filename: string; content: string }> = [];
        if (input.attachPdf) {
          const pdfBuffer = await generateMedicalReportPdf({
            reportRef, visitDate, noteType: noteTypeLabel, patientName, mrn: patient.mrn,
            dateOfBirth: dateOfBirthStr, age, gender: patient.gender ?? undefined,
            nationality: patient.nationality ?? undefined, phone: patient.phone ?? undefined,
            doctorName, doctorTitle, doctorSpecialty, doctorStampKey,
            chiefComplaint: (note as any).chiefComplaint ?? undefined,
            historyOfPresentIllness: (note as any).historyOfPresentIllness ?? undefined,
            physicalExamination: (note as any).physicalExamination ?? undefined,
            assessment: (note as any).assessment ?? undefined,
            plan: (note as any).plan ?? undefined,
            diagnosis: (note as any).diagnosis ?? undefined,
            medications: (note as any).medications ?? undefined,
            additionalNotes: (note as any).additionalNotes ?? undefined,
          });
          attachments.push({ filename: `Medical-Report-${patient.mrn ?? patientName}-${reportRef}.pdf`, content: pdfBuffer.toString("base64") });
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: "Fertiliv IVF Center <no-reply@fertiliv.com>",
          to: input.toEmail,
          subject: `Medical Report ${reportRef} — ${patientName} — Fertiliv IVF Center`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#1e0566;padding:24px 32px;border-radius:8px 8px 0 0;">
              <h1 style="color:#fff;margin:0;font-size:22px;">Fertiliv IVF Center</h1>
              <p style="color:#e3b2b0;margin:4px 0 0;font-size:13px;">Medical Report</p>
            </div>
            <div style="background:#f9f5ff;padding:24px 32px;">
              <p style="color:#1e0566;font-size:15px;">Dear <strong>${patientName}</strong>,</p>
              <p style="color:#374151;font-size:14px;line-height:1.6;">Please find attached your <strong>${noteTypeLabel}</strong> dated <strong>${visitDate}</strong>.</p>
              <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
                <p style="margin:0 0 6px;font-size:13px;"><span style="color:#6b7280;">Reference:</span> <strong>${reportRef}</strong></p>
                <p style="margin:0 0 6px;font-size:13px;"><span style="color:#6b7280;">Visit Date:</span> <strong>${visitDate}</strong></p>
                <p style="margin:0;font-size:13px;"><span style="color:#6b7280;">Type:</span> <strong>${noteTypeLabel}</strong></p>
              </div>
              ${doctorName ? `<p style="color:#374151;font-size:13px;">Physician: <strong>${doctorTitle ? doctorTitle + " " : ""}${doctorName}</strong>${doctorSpecialty ? " — " + doctorSpecialty : ""}</p>` : ""}
              <p style="color:#374151;font-size:13px;margin-top:16px;">If you have any questions, please contact us at <a href="mailto:info@fertiliv.com" style="color:#1e0566;">info@fertiliv.com</a> or call <strong>+90 501 114 70 60</strong>.</p>
              <p style="color:#374151;font-size:13px;">Warm regards,<br/><strong>The Fertiliv Team</strong></p>
            </div>
            <div style="background:#1e0566;padding:12px 32px;border-radius:0 0 8px 8px;text-align:center;">
              <p style="color:#e3b2b0;font-size:11px;margin:0;">Fertiliv IVF Center — Istanbul, Turkey — CONFIDENTIAL</p>
            </div>
          </div>`,
          attachments,
        });
        return { success: true };
      }),
  }),
  // ─── Services ────────────────────────────────────────────────────────────────
  services: router({
    list: protectedProcedure
      .input(z.object({ category: z.string().optional() }).optional())
      .query(({ input }) => getAllServices(input?.category)),

    taxRules: router({
      list: protectedProcedure
        .input(z.object({ includeInactive: z.boolean().optional() }).optional())
        .query(async ({ input }) => {
          const { getServiceTaxRules } = await import("./db");
          return getServiceTaxRules(input?.includeInactive ?? false);
        }),
      create: adminProcedure
        .input(z.object({
          label: z.string().trim().min(1, "Tax rule label is required.").max(128),
          ratePercent: z.number().min(0).max(100),
          isActive: z.boolean().optional(),
          sortOrder: z.number().int().min(0).max(9999).optional(),
        }))
        .mutation(async ({ input }) => {
          const { createServiceTaxRule } = await import("./db");
          return createServiceTaxRule({ ...input, ratePercent: input.ratePercent.toFixed(4) });
        }),
      update: adminProcedure
        .input(z.object({
          id: z.number().int().positive(),
          data: z.object({
            label: z.string().trim().min(1).max(128).optional(),
            ratePercent: z.number().min(0).max(100).optional(),
            isActive: z.boolean().optional(),
            sortOrder: z.number().int().min(0).max(9999).optional(),
          }),
        }))
        .mutation(async ({ input }) => {
          const { updateServiceTaxRule } = await import("./db");
          return updateServiceTaxRule(input.id, {
            ...(input.data.label !== undefined && { label: input.data.label }),
            ...(input.data.isActive !== undefined && { isActive: input.data.isActive }),
            ...(input.data.sortOrder !== undefined && { sortOrder: input.data.sortOrder }),
            ...(input.data.ratePercent !== undefined && { ratePercent: input.data.ratePercent.toFixed(4) }),
          });
        }),
    }),

    categoryTaxDefaults: router({
      list: protectedProcedure.query(async () => {
        const { getServiceCategoryTaxDefaults } = await import("./db");
        return getServiceCategoryTaxDefaults();
      }),
      set: adminProcedure
        .input(z.object({
          category: z.enum(["lab_test", "radiology_test", "pathology_test", "other_test", "procedure", "consultation", "medicine"]),
          taxRuleId: z.number().int().positive().nullable(),
        }))
        .mutation(async ({ input }) => {
          const { upsertServiceCategoryTaxDefault } = await import("./db");
          return upsertServiceCategoryTaxDefault(input.category, input.taxRuleId);
        }),
    }),

    bulkImport: adminProcedure
      .input(z.object({
        services: z.array(z.object({
          name: z.string().min(1),
          category: z.enum(["lab_test", "radiology_test", "pathology_test", "other_test", "procedure", "consultation", "medicine"]).default("other_test"),
          price: z.string().default("0"),
          localPriceTRY: z.string().optional(),
          code: z.string().optional(),
          description: z.string().optional(),
          status: z.enum(["active", "inactive"]).default("active"),
        })),
      }))
      .mutation(async ({ input }) => {
        let imported = 0;
        for (const svc of input.services) {
          await createService({ ...svc, price: svc.price, localPriceTRY: svc.localPriceTRY ?? svc.price } as any);
          imported++;
        }
        return { imported };
      }),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        category: z.enum(["lab_test", "radiology_test", "pathology_test", "other_test", "procedure", "consultation", "medicine"]),
        description: z.string().optional(),
        price: z.string(),
        duration: z.number().optional(),
        preparationInstructions: z.string().optional(),
        code: z.string().optional(),
        taxOverrideMode: z.enum(["inherit", "rule", "no_tax"]).optional(),
        taxOverrideRuleId: z.number().int().positive().nullable().optional(),
      }))
       .mutation(async ({ input }) => {
        // Generate category-based code if not provided
        let code = (input as any).code;
        if (!code) {
          const categoryPrefix: Record<string, string> = {
            lab_test: "LAB",
            radiology_test: "RAD",
            pathology_test: "PATH",
            procedure: "PROC",
            consultation: "CONS",
            medicine: "MED",
            other_test: "OTHER",
          };
          const prefix = categoryPrefix[input.category] ?? "SVC";
          // Get max number for this prefix in services table
          const { getDb } = await import("./db");
          const db = await getDb();
          if (db) {
            const rows: any = await db.execute(
              // @ts-ignore
              `SELECT COALESCE(MAX(CAST(SUBSTRING(code, ${prefix.length + 2}) AS UNSIGNED)), 0) AS max_n FROM services WHERE code LIKE '${prefix}-%'`
            );
            const data = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : (Array.isArray(rows) ? rows : []);
            const maxN = Number(data[0]?.max_n ?? data[0]?.[0] ?? 0);
            code = `${prefix}-${String(maxN + 1).padStart(3, "0")}`;
          } else {
            code = await getNextCode("service");
          }
        }
        return createService({ ...input, code } as any);
      }),
    update: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          name: z.string().optional(),
          price: z.string().optional(),
          localPriceTRY: z.string().optional(),
          description: z.string().optional(),
          preparationInstructions: z.string().optional(),
          code: z.string().optional(),
          status: z.enum(["active", "inactive"]).optional(),
          duration: z.number().optional(),
          taxOverrideMode: z.enum(["inherit", "rule", "no_tax"]).optional(),
          taxOverrideRuleId: z.number().int().positive().nullable().optional(),
        }),
      }))
      .mutation(({ input }) => updateService(input.id, input.data as any)),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteService(input.id)),
    bulkDelete: adminProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ input }) => {
        let deleted = 0;
        for (const id of input.ids) { await deleteService(id); deleted++; }
        return { deleted };
      }),
    bulkSetStatus: adminProcedure
      .input(z.object({ ids: z.array(z.number()), status: z.enum(["active", "inactive"]) }))
      .mutation(async ({ input }) => {
        let updated = 0;
        for (const id of input.ids) { await updateService(id, { status: input.status } as any); updated++; }
        return { updated };
      }),

    // AI autofill: generate non-price fields from service name
    aiAutofill: staffOrAdminProcedure
      .input(z.object({
        name: z.string().min(1),
        existingCategory: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const systemPrompt = `You are a medical clinic service catalog assistant for a fertility IVF clinic (Fertiliv IVF Center) in Turkey.
Given a service name, generate structured metadata for the clinic's service catalog.

Rules:
- Do NOT generate or suggest any prices — prices are always set manually.
- description: MAXIMUM 1 short sentence (under 15 words). Professional, neutral, no first-person pronouns (no "our", "we"). Example: "Blood test measuring follicle-stimulating hormone levels to assess ovarian reserve."
- preparationInstructions: ALWAYS provide practical patient instructions (e.g. "Fast for 8 hours before the test.", "No special preparation required."). Never return null — always give at least a brief instruction.
- duration: estimated duration in minutes as a number. Return null if not applicable.
- category: one of: consultation, lab_test, radiology_test, pathology_test, other_test, procedure, medicine. Choose the most appropriate.

Return ONLY valid JSON with these exact keys: description, preparationInstructions, duration, category.`;

	        const userPrompt = `Service name: "${input.name}"${
	          input.existingCategory ? `\nCurrent category: ${input.existingCategory}` : ""
	        }\n\nGenerate the metadata fields.`;

	        const response = await invokeLLM({
	          workloadId: "structured_json_generation",
	          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "service_autofill",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  description: { type: "string", description: "One short sentence description, max 15 words" },
                  preparationInstructions: { type: "string", description: "Patient preparation instructions — always required, never empty" },
                  duration: { type: ["number", "null"], description: "Duration in minutes, or null if not applicable" },
                  category: {
                    type: "string",
                    enum: ["consultation", "lab_test", "radiology_test", "pathology_test", "other_test", "procedure", "medicine"],
                    description: "Service category"
                  },
                },
                required: ["description", "preparationInstructions", "duration", "category"],
                additionalProperties: false,
              },
            },
          },
        });

        const rawContent = response?.choices?.[0]?.message?.content;
        const raw = typeof rawContent === "string" ? rawContent : null;
        if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI did not return a response" });

        try {
          const parsed = JSON.parse(raw);
          return {
            description: parsed.description ?? "",
            preparationInstructions: parsed.preparationInstructions ?? "No special preparation required.",
            duration: typeof parsed.duration === "number" ? parsed.duration : null,
            category: parsed.category ?? input.existingCategory ?? "other_test",
            // code is intentionally NOT returned — it is auto-generated by the system, never by AI
          };
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned invalid JSON" });
        }
      }),
  }),

  // ─── Finance ─────────────────────────────────────────────────────────────────
  finance: router({
    invoiceList: protectedProcedure
      .input(z.object({
        scope: z.enum(["production", "test", "all"]).optional(),
        search: z.string().trim().max(256).optional(),
        status: z.enum(["all", "draft", "issued", "paid", "partial", "overdue", "cancelled"]).optional(),
        issueDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        issueDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.union([z.literal(20), z.literal(50), z.literal(100)]).default(20),
      }))
      .query(async ({ input, ctx }) => {
        const requestedScope = input.scope ?? "production";
        if ((requestedScope === "test" || requestedScope === "all") && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only Admin can view Test or combined financial records." });
        }
        const issueDateFrom = input.issueDateFrom ? new Date(`${input.issueDateFrom}T00:00:00.000Z`) : undefined;
        const issueDateToExclusive = input.issueDateTo
          ? new Date(`${input.issueDateTo}T00:00:00.000Z`)
          : undefined;
        if (issueDateToExclusive) issueDateToExclusive.setUTCDate(issueDateToExclusive.getUTCDate() + 1);
        if (issueDateFrom && issueDateToExclusive && issueDateFrom >= issueDateToExclusive) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Issue Date From cannot be after Issue Date To." });
        }
        return getPaginatedInvoices({
          scope: requestedScope,
          search: input.search,
          status: input.status,
          issueDateFrom,
          issueDateToExclusive,
          page: input.page,
          pageSize: input.pageSize,
        });
      }),

    invoiceListExport: protectedProcedure
      .input(z.object({
        scope: z.enum(["production", "test", "all"]).optional(),
        search: z.string().trim().max(256).optional(),
        status: z.enum(["all", "draft", "issued", "paid", "partial", "overdue", "cancelled"]).optional(),
        issueDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        issueDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }))
      .query(async ({ input, ctx }) => {
        const requestedScope = input.scope ?? "production";
        if ((requestedScope === "test" || requestedScope === "all") && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only Admin can export Test or combined financial records." });
        }
        const issueDateFrom = input.issueDateFrom ? new Date(`${input.issueDateFrom}T00:00:00.000Z`) : undefined;
        const issueDateToExclusive = input.issueDateTo
          ? new Date(`${input.issueDateTo}T00:00:00.000Z`)
          : undefined;
        if (issueDateToExclusive) issueDateToExclusive.setUTCDate(issueDateToExclusive.getUTCDate() + 1);
        if (issueDateFrom && issueDateToExclusive && issueDateFrom >= issueDateToExclusive) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Issue Date From cannot be after Issue Date To." });
        }
        return getPaginatedInvoices({
          scope: requestedScope,
          search: input.search,
          status: input.status,
          issueDateFrom,
          issueDateToExclusive,
          page: 1,
          pageSize: 20,
          exportAll: true,
        });
      }),

    invoices: protectedProcedure
      .input(z.object({ patientId: z.number().optional(), scope: z.enum(["production", "test", "all"]).optional() }).optional())
      .query(({ input, ctx }) => {
        const requestedScope = input?.scope ?? (input?.patientId ? "all" : "production");
        if ((requestedScope === "test" || requestedScope === "all") && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only Admin can view Test or combined financial records." });
        }
        return getInvoices(input?.patientId, requestedScope);
      }),

    invoiceItems: protectedProcedure
      .input(z.object({ invoiceId: z.number() }))
      .query(({ input }) => getInvoiceItems(input.invoiceId)),

    stats: staffOrAdminProcedure.query(() => getFinanceStats()),

    offers: protectedProcedure
      .input(z.object({ patientId: z.number().optional() }).optional())
      .query(({ input }) => getOffers(input?.patientId)),

    createInvoice: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        dueDate: z.date().optional(),
        currency: z.enum(["USD", "EUR", "GBP", "TRY", "SAR", "AED"]).optional(),
        subtotal: z.string(),
        discountAmount: z.string().optional(),
        discountPercent: z.number().min(0).max(100).optional(),
        taxAmount: z.string().optional(),
        totalAmount: z.string(),
        paidAmount: z.string().optional(),
        status: z.enum(["draft", "issued", "paid", "partial", "overdue", "cancelled"]).optional(),
        notes: z.string().optional(),
        notifyPartner: z.boolean().optional(),
        pricingMode: z.enum(["discount", "agreed"]).optional(),
        finalAgreedAmount: z.string().optional(),
        initialPayments: z.array(z.object({
          amount: z.string(),
          currency: z.enum(["USD", "EUR", "GBP", "TRY", "SAR", "AED", "AUD"]),
          method: z.enum(["cash", "credit_card", "bank_transfer", "insurance", "other"]),
          receivedAt: z.date().optional(),
          notes: z.string().max(1000).optional(),
          manualFx: z.object({
            paymentToTryRate: z.string().optional(),
            invoiceToTryRate: z.string().optional(),
            note: z.string().max(500).optional(),
          }).optional(),
         bankDeduction: z.object({ amount: z.string().optional(), percent: z.string().optional() }).optional(),
       })).optional(),
        items: z.array(z.object({
         serviceId: z.number().optional(),
         description: z.string(),
         lineLabel: z.string().trim().max(256).nullable().optional(),
         quantity: z.number().int().min(1),
         unitPrice: z.string(),
         totalPrice: z.string().optional(),
          linePricingMethod: z.enum(["none", "discount_percent", "final_line_total", "agreed_unit_price"]).optional(),
         lineDiscountPercent: z.number().min(0).max(100).nullable().optional(),
          taxIncludedMode: z.boolean().optional(),
          taxIncludedGross: z.string().trim().min(1).optional(),
          priceEntry: servicePriceEntrySchema.optional(),
          taxSelection: invoiceLineTaxSelectionSchema.optional(),
          taxRuleId: z.number().int().positive().nullable().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const invoiceNumber = await getNextCode("invoice");
        // New invoices use the forward-only Service Tax / method-neutral model.
        // V4 line pricing remains the authoritative pre-tax service basis.
        const { computeInvoiceTotals } = await import("../shared/invoicePricing");
        const { computeInvoiceLinePricing } = await import("../shared/invoiceLinePricing");
        const { computeServiceTaxInvoice, TAX_MODEL_VERSION, METHOD_NEUTRAL_SETTLEMENT_MODEL_VERSION } = await import("../shared/serviceTax");
        const resolvedTaxes = await resolveTaxForNewInvoiceLines(input.items.map(item => ({
          serviceId: item.serviceId,
          explicitLineTaxSelection: item.taxSelection ?? legacyTaxSelectionToExplicit(item),
        })));
        let canonicalItems;
        try {
          canonicalItems = await Promise.all(input.items.map(async (item, index) => {
            const sourcePriced = await canonicalizeServicePriceEntry(item, (input.currency ?? "TRY") as any);
            const priced = computeInvoiceLinePricing(sourcePriced as any);
            const tax = resolvedTaxes[index]!;
            const pricedLine = canonicalizeTaxIncludedLine({
              ...sourcePriced,
              ...priced,
              taxRuleId: tax.taxRuleId,
              taxLabelSnapshot: tax.taxLabelSnapshot,
              taxRateSnapshot: tax.taxRateSnapshot,
            }, tax);
            const lineLabel = item.serviceId && item.lineLabel?.trim() ? item.lineLabel.trim().slice(0, 256) : null;
            return { ...pricedLine, lineLabel };
          }));
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid line pricing." });
        }
        const canonicalSubtotal = canonicalItems.reduce((sum, item) => sum + Number(item.totalPrice), 0);
        const pricingMode = input.pricingMode ?? "discount";
        const finalAgreedAmount = input.finalAgreedAmount;
        const computed = computeInvoiceTotals({
          subtotal: canonicalSubtotal.toFixed(2),
          pricingMode,
          discountPercent: pricingMode === "discount" ? (input.discountPercent ?? 0) : undefined,
          finalAgreedAmount: pricingMode === "agreed" ? finalAgreedAmount : undefined,
          adjustmentRate: null,
        });
        const taxComputed = computeServiceTaxInvoice({
          lines: canonicalItems.map((item, index) => ({
            key: index,
            totalPrice: item.totalPrice,
            taxIncludedGross: item.taxIncludedGross,
            tax: {
              taxRuleId: item.taxRuleId,
              taxLabelSnapshot: item.taxLabelSnapshot,
              taxRateSnapshot: item.taxRateSnapshot,
            },
          })),
          invoiceWideDiscountAmount: pricingMode === "discount" ? computed.discountAmount : undefined,
          finalAgreedServiceAmount: pricingMode === "agreed" ? computed.totalAmount : undefined,
        });
        canonicalItems = canonicalItems.map((item, index) => ({
          ...item,
          effectiveTaxableBase: taxComputed.lines[index].effectiveTaxableBase,
          taxAmount: taxComputed.lines[index].taxAmount,
        }));
        // Snapshot the exchange rate at time of invoice creation
        // Convention: exchangeRateSnapshot = tryPerUnit (1 [currency] = X TRY)
        let exchangeRateSnapshot: number | undefined;
        let snapshotSource: string | undefined;
        let snapshotRateDate: string | undefined;
        if (input.currency && input.currency !== "TRY") {
          try {
            const { getOrFetchExchangeRates } = await import("./exchangeRateService");
            const rateData = await getOrFetchExchangeRates();
            const cur = input.currency as string;
            if (rateData.rates[cur]) {
              exchangeRateSnapshot = rateData.rates[cur].rate;   // tryPerUnit
              snapshotSource = rateData.rates[cur].sourceProvider ?? undefined;
              snapshotRateDate = rateData.rates[cur].rateDate ?? undefined;
            }
          } catch (_e) { /* non-fatal */ }
        }
        const result = await createInvoice({
          ...input,
          items: canonicalItems,
          subtotal: canonicalSubtotal.toFixed(2),
          invoiceNumber,
          createdById: ctx.user.id,
          exchangeRateSnapshot,
          snapshotSource,
          snapshotRateDate,
          rateDirection: "TRY_PER_UNIT",
          // V3 pricing fields — server-computed, not trusted from client
          pricingMode: computed.pricingMode,
          discountAmount: computed.discountAmount,
          discountPercent: parseFloat(computed.discountPercent),
          taxAmount: taxComputed.totalTaxAmount,
          totalAmount: taxComputed.grandTotal,
          finalAgreedAmount: pricingMode === "agreed" ? taxComputed.effectiveServiceSubtotal : undefined,
          paymentAdjustmentRateSnapshot: null,
          taxModelVersion: TAX_MODEL_VERSION,
          settlementModelVersion: METHOD_NEUTRAL_SETTLEMENT_MODEL_VERSION,
          initialPayments: input.initialPayments,
        });
        await createNotification({
          userId: input.patientId,
          type: "invoice_issued",
          title: "New Invoice Issued",
          message: `Invoice ${invoiceNumber} for ${taxComputed.grandTotal} has been issued.`,
          relatedType: "invoice",
          relatedId: result?.id,
        });
        return result;
      }),

    uploadInvoiceReceipt: staffOrAdminProcedure
      .input(z.object({
        invoiceId: z.number(),
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string().default("application/pdf"),
      }))
      .mutation(async ({ input }) => {
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "pdf";
        const key = `invoices/receipts/${input.invoiceId}-receipt-${Date.now()}.${ext}`;
        const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType, input.fileName);
        return { key: storedKey, url };
      }),
    updateInvoiceStatus: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["draft", "issued", "paid", "partial", "overdue", "cancelled"]),
        paidAmount: z.string().optional(),
        paymentMethod: z.string().optional(),
        patientId: z.number().optional(),
        externalReceiptKey: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (input.status === "paid") {
          // "Marked as Paid" must create a real payment record for audit trail.
          // Fetch the invoice to find the remaining unpaid amount.
          // Fetch invoice by ID using the db helper
          const { getInvoiceById } = await import("./db");
          const inv = await getInvoiceById(input.id);
          if (inv) {
            const remaining = Math.max(0, Number(inv.totalAmount ?? 0) - Number(inv.paidAmount ?? 0));
            if (remaining > 0.01) {
              const cur = (inv.currency as string) ?? "TRY";
              // createPayment resolves and freezes all approved FX snapshots server-side.
              await createPayment({
                invoiceId: input.id,
                patientId: (inv as any).patientId,
                amount: remaining.toFixed(2) as any,
                currency: cur as any,
                method: (input.paymentMethod ?? "cash") as any,
                recordedById: ctx.user.id,
                notes: "Marked as paid by staff",
              } as any);
              // recalcInvoicePaidAmount is called inside createPayment, so status is updated automatically
              // Save external receipt key if provided
              if (input.externalReceiptKey) {
                await updateInvoiceStatus(input.id, "paid", undefined, undefined, input.externalReceiptKey);
              }
              return { success: true };
            }
          }
          // If already fully paid or invoice not found, just update status directly
          await updateInvoiceStatus(input.id, input.status, input.paidAmount, input.paymentMethod, input.externalReceiptKey);
        } else {
          await updateInvoiceStatus(input.id, input.status, input.paidAmount, input.paymentMethod);
        }
        return { success: true };
      }),
    cancelInvoice: adminProcedure
      .input(z.object({
        id: z.number(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await cancelInvoice(input.id, input.reason);
        return { success: true };
      }),

    deleteInvoice: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteInvoice(input.id);
        return { success: true };
      }),

    updateInvoice: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        dueDate: z.date().optional(),
        subtotal: z.string(),
        discountAmount: z.string().optional(),
        discountPercent: z.number().min(0).max(100).optional(),
        taxAmount: z.string().optional(),
        totalAmount: z.string(),
        notes: z.string().optional(),
        items: z.array(z.object({
          serviceId: z.number().optional(),
          description: z.string(),
          quantity: z.number(),
          unitPrice: z.string(),
          totalPrice: z.string(),
        })),
      }))
      .mutation(async ({ input }) => {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The legacy invoice update path is disabled. Use the current invoice editor.",
        });
      }),

    updateFull: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        currency: z.enum(["USD", "EUR", "GBP", "TRY", "SAR", "AED"]).optional(),
        discountAmount: z.number().optional(),
        discountPercent: z.number().min(0).max(100).optional(),
        taxAmount: z.number().optional(),
        notes: z.string().optional(),
        dueDate: z.date().nullish(),
        pricingMode: z.enum(["discount", "agreed"]).optional(),
        finalAgreedAmount: z.string().optional(),
        items: z.array(z.object({
          id: z.number().optional(),
          serviceId: z.number().nullish(),
          description: z.string(),
          quantity: z.number().min(1),
          unitPrice: z.number().min(0),
          totalPrice: z.number().min(0).optional(),
          linePricingMethod: z.enum(["none", "discount_percent", "final_line_total", "agreed_unit_price"]).optional(),
          lineDiscountPercent: z.number().min(0).max(100).nullable().optional(),
          taxIncludedMode: z.boolean().optional(),
          taxIncludedGross: z.string().trim().min(1).optional(),
          priceEntry: servicePriceEntrySchema.optional(),
          taxSelection: invoiceLineTaxSelectionSchema.optional(),
          taxRuleId: z.number().int().positive().nullable().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        // V3: recompute totals server-side using the shared pricing engine
        const { computeInvoiceTotals } = await import("../shared/invoicePricing");
        const { computeInvoiceLinePricing } = await import("../shared/invoiceLinePricing");
        const { computeServiceTaxInvoice, TAX_MODEL_VERSION } = await import("../shared/serviceTax");
        const pricingMode = data.pricingMode ?? "discount";
        const { getInvoiceById, getInvoiceItems } = await import("./db");
        const existingInv = await getInvoiceById(id) as any;
        if (!existingInv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
        if (existingInv.status !== "draft") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Published invoices must be changed through Draft Revision and Re-issue." });
        }
        const isTaxModelInvoice = existingInv.taxModelVersion === TAX_MODEL_VERSION;
        if (!isTaxModelInvoice && data.items.some(item => item.taxRuleId !== undefined || item.taxSelection !== undefined)) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tax cannot be added to a legacy invoice. Create a new invoice to use Service Tax." });
        }
        const existingItems = await getInvoiceItems(id) as any[];
        const existingTaxByItemId = new Map(existingItems.map(item => [item.id, item]));
        const explicitTaxByIndex = data.items.map(item => {
          const existingItem = item.id == null ? null : existingTaxByItemId.get(item.id);
          if (item.taxSelection !== undefined) return item.taxSelection;
          if (!existingItem) return legacyTaxSelectionToExplicit(item);
          if (item.taxRuleId === undefined || item.taxRuleId === existingItem.taxRuleId) return undefined;
          return legacyTaxSelectionToExplicit(item);
        });
        const newOrExplicitItems = data.items.flatMap((item, index) => {
          const existingItem = item.id == null ? null : existingTaxByItemId.get(item.id);
          const explicitLineTaxSelection = explicitTaxByIndex[index];
          if (existingItem && explicitLineTaxSelection === undefined) return [];
          return [{ index, serviceId: existingItem ? undefined : item.serviceId ?? undefined, explicitLineTaxSelection }];
        });
        const resolvedNewOrExplicitTaxes = await resolveTaxForNewInvoiceLines(newOrExplicitItems);
        const resolvedTaxByIndex = new Map(newOrExplicitItems.map((item, index) => [item.index, resolvedNewOrExplicitTaxes[index]! ]));
        const existingRate = existingInv?.paymentAdjustmentRateSnapshot != null
          ? String(existingInv.paymentAdjustmentRateSnapshot)
          : null;
        let canonicalItems;
        try {
          canonicalItems = await Promise.all(data.items.map(async (item, index) => {
            const existingItem = item.id == null ? null : existingTaxByItemId.get(item.id);
            const resolvedTax = resolvedTaxByIndex.get(index);
            const tax = resolvedTax ?? {
              taxRuleId: existingItem?.taxRuleId ?? null,
              taxLabelSnapshot: existingItem?.taxLabelSnapshot ?? null,
              taxRateSnapshot: existingItem?.taxRateSnapshot == null ? null : String(existingItem.taxRateSnapshot),
            };
            const sourcePriced = item.priceEntry
              ? await canonicalizeServicePriceEntry(item, (data.currency ?? existingInv.currency ?? "TRY") as any)
              : {
                  ...item,
                  priceEntryCurrency: existingItem?.priceEntryCurrency ?? null,
                  priceEntryAmount: existingItem?.priceEntryAmount ?? null,
                  priceEntryKind: existingItem?.priceEntryKind ?? null,
                  priceFxRateToInvoice: existingItem?.priceFxRateToInvoice ?? null,
                  priceFxSourceToTryRate: existingItem?.priceFxSourceToTryRate ?? null,
                  priceFxInvoiceToTryRate: existingItem?.priceFxInvoiceToTryRate ?? null,
                  priceFxSource: existingItem?.priceFxSource ?? null,
                  priceFxEffectiveAt: existingItem?.priceFxEffectiveAt ?? null,
                  priceFxNote: existingItem?.priceFxNote ?? null,
                };
            return canonicalizeTaxIncludedLine({
              ...sourcePriced,
              ...computeInvoiceLinePricing(sourcePriced as any),
              taxRuleId: tax.taxRuleId,
              taxLabelSnapshot: tax.taxLabelSnapshot,
              taxRateSnapshot: tax.taxRateSnapshot,
            }, tax);
          }));
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid line pricing." });
        }
        const subtotalNum = canonicalItems.reduce((s: number, i: any) => s + Number(i.totalPrice), 0);
        const computed = computeInvoiceTotals({
          subtotal: subtotalNum.toFixed(2),
          pricingMode,
          discountPercent: pricingMode === "discount" ? (data.discountPercent ?? 0) : undefined,
          finalAgreedAmount: pricingMode === "agreed" ? data.finalAgreedAmount : undefined,
          adjustmentRate: isTaxModelInvoice ? null : existingRate,
        });
        const taxComputed = isTaxModelInvoice
          ? computeServiceTaxInvoice({
              lines: canonicalItems.map((item, index) => ({
                key: index,
                totalPrice: item.totalPrice,
                taxIncludedGross: item.taxIncludedGross,
                tax: {
                  taxRuleId: item.taxRuleId,
                  taxLabelSnapshot: item.taxLabelSnapshot,
                  taxRateSnapshot: item.taxRateSnapshot,
                },
              })),
              invoiceWideDiscountAmount: pricingMode === "discount" ? computed.discountAmount : undefined,
              finalAgreedServiceAmount: pricingMode === "agreed" ? computed.totalAmount : undefined,
            })
          : null;
        if (taxComputed) {
          canonicalItems = canonicalItems.map((item, index) => ({
            ...item,
            effectiveTaxableBase: taxComputed.lines[index].effectiveTaxableBase,
            taxAmount: taxComputed.lines[index].taxAmount,
          }));
        }
        await updateInvoiceFull(id, {
          ...data,
          items: canonicalItems,
          dueDate: data.dueDate ?? null,
          // V3 server-computed fields
          subtotal: subtotalNum.toFixed(2),
          discountAmount: parseFloat(computed.discountAmount),
          discountPercent: parseFloat(computed.discountPercent),
          taxAmount: taxComputed ? Number(taxComputed.totalTaxAmount) : data.taxAmount ?? 0,
          totalAmount: taxComputed?.grandTotal ?? computed.totalAmount,
          pricingMode: computed.pricingMode,
          finalAgreedAmount: pricingMode === "agreed" ? taxComputed?.effectiveServiceSubtotal ?? computed.totalAmount : undefined,
          paymentAdjustmentRateSnapshot: computed.paymentAdjustmentRateSnapshot ?? undefined,
        });
        return { success: true };
      }),

    invoiceRevisions: staffOrAdminProcedure
      .input(z.object({ invoiceId: z.number() }))
      .query(async ({ input }) => getInvoiceRevisions(input.invoiceId)),

    reopenInvoiceForRevision: staffOrAdminProcedure
      .input(z.object({ invoiceId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const draft = await reopenInvoiceForDraftRevision(input.invoiceId, ctx.user.id);
        return { draft };
      }),

    getInvoiceRevision: staffOrAdminProcedure
      .input(z.object({ invoiceId: z.number(), revisionId: z.number() }))
      .query(async ({ input }) => getInvoiceRevisionById(input.invoiceId, input.revisionId)),

    saveInvoiceDraftRevision: staffOrAdminProcedure
      .input(invoiceFullUpdateInputSchema.extend({ draftRevisionId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const existingDraft = await getInvoiceRevisionById(input.id, input.draftRevisionId);
        if (!existingDraft || existingDraft.status !== "draft") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Draft Revision is no longer available. Reopen the invoice and try again." });
        const baseItems = (existingDraft.snapshot as any)?.updateData?.items;
        const prepared = await prepareInvoiceFullUpdate(input, Array.isArray(baseItems) ? baseItems : undefined);
        await saveInvoiceDraftRevision(input.id, input.draftRevisionId, {
          updateData: prepared.data as any,
          capturedAt: new Date().toISOString(),
        }, ctx.user.id);
        return { success: true };
      }),

    reissueInvoiceDraftRevision: staffOrAdminProcedure
      .input(z.object({ invoiceId: z.number(), draftRevisionId: z.number() }))
      .mutation(async ({ input, ctx }) => publishInvoiceDraftRevision(input.invoiceId, input.draftRevisionId, ctx.user.id)),

    // Payments sub-procedures
    createPayment: staffOrAdminProcedure
      .input(z.object({
        invoiceId: z.number(),
        amount: z.number().positive(),
        currency: z.enum(["USD", "EUR", "GBP", "TRY", "SAR", "AED", "AUD"]).optional(),
        method: z.enum(["cash", "credit_card", "bank_transfer", "insurance", "other"]).optional(),
        notes: z.string().optional(),
        receivedAt: z.date().optional(),
        manualFx: z.object({
          paymentToTryRate: z.string().optional(),
          invoiceToTryRate: z.string().optional(),
          note: z.string().max(500).optional(),
        }).optional(),
        bankDeduction: z.object({ amount: z.string().optional(), percent: z.string().optional() }).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const cur = input.currency ?? "TRY";
        // Derive patientId server-side from the invoice — never trust client-supplied patientId
        const { getInvoiceById } = await import("./db");
        const inv = await getInvoiceById(input.invoiceId);
        if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
        const patientId = (inv as any).patientId as number;
        // createPayment resolves and freezes all approved FX snapshots server-side.
        return createPayment({
          invoiceId: input.invoiceId,
          patientId,
          amount: input.amount.toFixed(2) as any,
          currency: cur as any,
          method: input.method ?? "cash",
          recordedById: ctx.user.id,
          notes: input.notes ?? null,
          receivedAt: input.receivedAt ?? new Date(),
          manualFx: input.manualFx,
          bankDeduction: input.bankDeduction,
        } as any);
      }),

    previewPayment: staffOrAdminProcedure
      .input(z.object({
        invoiceId: z.number(),
        amount: z.number().positive(),
        currency: z.enum(["USD", "EUR", "GBP", "TRY", "SAR", "AED", "AUD"]),
        method: z.enum(["cash", "credit_card", "bank_transfer", "insurance", "other"]),
        receivedAt: z.date(),
        manualFx: z.object({
          paymentToTryRate: z.string().optional(),
          invoiceToTryRate: z.string().optional(),
          note: z.string().max(500).optional(),
        }).optional(),
        bankDeduction: z.object({ amount: z.string().optional(), percent: z.string().optional() }).optional(),
      }))
      .query(({ input }) => quotePayment(input)),

    previewInitialPayments: staffOrAdminProcedure
      .input(z.object({
        invoiceCurrency: z.enum(["USD", "EUR", "GBP", "TRY", "SAR", "AED"]),
        pricingMode: z.enum(["discount", "agreed"]),
        discountPercent: z.number().min(0).max(100).optional(),
        finalAgreedAmount: z.string().optional(),
        items: z.array(z.object({
          serviceId: z.number().optional(),
          quantity: z.number().int().min(1),
          unitPrice: z.string(),
          totalPrice: z.string().optional(),
          linePricingMethod: z.enum(["none", "discount_percent", "final_line_total", "agreed_unit_price"]).optional(),
          lineDiscountPercent: z.number().min(0).max(100).nullable().optional(),
          taxIncludedMode: z.boolean().optional(),
          taxIncludedGross: z.string().trim().min(1).optional(),
          priceEntry: servicePriceEntrySchema.optional(),
          taxSelection: invoiceLineTaxSelectionSchema.optional(),
          taxRuleId: z.number().int().positive().nullable().optional(),
        })).min(1),
        payments: z.array(z.object({
          amount: z.number().positive(),
          currency: z.enum(["USD", "EUR", "GBP", "TRY", "SAR", "AED", "AUD"]),
          method: z.enum(["cash", "credit_card", "bank_transfer", "insurance", "other"]),
          receivedAt: z.date(),
          manualFx: z.object({
            paymentToTryRate: z.string().optional(),
            invoiceToTryRate: z.string().optional(),
            note: z.string().max(500).optional(),
          }).optional(),
          bankDeduction: z.object({ amount: z.string().optional(), percent: z.string().optional() }).optional(),
        })).min(1),
      }))
      .query(async ({ input }) => {
        const { computeInvoiceLinePricing } = await import("../shared/invoiceLinePricing");
        const { computeInvoiceTotals } = await import("../shared/invoicePricing");
        const { computeServiceTaxInvoice } = await import("../shared/serviceTax");
        const resolvedTaxes = await resolveTaxForNewInvoiceLines(input.items.map(item => ({
          serviceId: item.serviceId,
          explicitLineTaxSelection: item.taxSelection ?? legacyTaxSelectionToExplicit(item),
        })));
        let canonicalItems;
        try {
          canonicalItems = await Promise.all(input.items.map(async (item, index) => {
            const tax = resolvedTaxes[index]!;
            const sourcePriced = await canonicalizeServicePriceEntry(item, input.invoiceCurrency as any);
            return canonicalizeTaxIncludedLine({
              ...sourcePriced,
              ...computeInvoiceLinePricing(sourcePriced as any),
              ...tax,
            }, tax);
          }));
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid line pricing." });
        }
        const subtotal = canonicalItems.reduce((sum, item) => sum + Number(item.totalPrice), 0);
        const totals = computeInvoiceTotals({
          subtotal: subtotal.toFixed(2),
          pricingMode: input.pricingMode,
          discountPercent: input.pricingMode === "discount" ? (input.discountPercent ?? 0) : undefined,
          finalAgreedAmount: input.pricingMode === "agreed" ? input.finalAgreedAmount : undefined,
          adjustmentRate: null,
        });
        const taxTotals = computeServiceTaxInvoice({
          lines: canonicalItems.map((item, index) => {
            return {
              key: index,
              totalPrice: item.totalPrice,
              taxIncludedGross: item.taxIncludedGross,
              tax: {
                taxRuleId: item.taxRuleId,
                taxLabelSnapshot: item.taxLabelSnapshot,
                taxRateSnapshot: item.taxRateSnapshot,
              },
            };
          }),
          invoiceWideDiscountAmount: input.pricingMode === "discount" ? totals.discountAmount : undefined,
          finalAgreedServiceAmount: input.pricingMode === "agreed" ? totals.totalAmount : undefined,
        });
        return quoteInitialPayments({
          payments: input.payments,
          invoiceCurrency: input.invoiceCurrency,
          totalAmount: taxTotals.grandTotal,
          pricingMode: totals.pricingMode,
          paymentAdjustmentRateSnapshot: null,
          settlementModelVersion: "method_neutral_v2",
        });
      }),

    correctLegacyPricingToAgreed: financeCorrectionProcedure
      .input(z.object({
        invoiceId: z.number(),
        reason: z.string().trim().min(3).max(500),
        confirmed: z.literal(true),
      }))
      .mutation(({ input, ctx }) => correctLegacyInvoicePricingToAgreed({
        invoiceId: input.invoiceId,
        reason: input.reason,
        actor: { id: ctx.user.id, name: ctx.user.name, role: ctx.user.role },
      })),

    classifyFinancialScope: adminProcedure
      .input(z.object({
        invoiceId: z.number(),
        scope: z.enum(["production", "test"]),
        reason: z.string().trim().min(3).max(500),
        setPatientDefault: z.boolean().default(false),
        confirmed: z.literal(true),
      }))
      .mutation(({ input, ctx }) => classifyInvoiceFinancialScope({
        invoiceId: input.invoiceId,
        scope: input.scope,
        reason: input.reason,
        setPatientDefault: input.setPatientDefault,
        actor: { id: ctx.user.id, name: ctx.user.name, role: ctx.user.role },
      })),

    listPayments: protectedProcedure
      .input(z.object({ invoiceId: z.number(), includeVoided: z.boolean().optional() }))
      .query(({ input }) => listPaymentsByInvoice(input.invoiceId, input.includeVoided === true)),

    voidPayment: financeVoidProcedure
      .input(z.object({ id: z.number(), voidReason: z.string().trim().min(3).max(500) }))
      .mutation(({ ctx, input }) => voidPayment(input.id, input.voidReason, ctx.user.id)),
    paymentsByPatient: staffOrAdminProcedure
      .input(z.object({ patientId: z.number() }))
      .query(({ input }) => listPaymentsByPatient(input.patientId)),
    // ─── Credit ───────────────────────────────────────────────────────────────
    getCreditBalance: staffOrAdminProcedure
      .input(z.object({ patientId: z.number(), currency: z.enum(["USD","EUR","GBP","TRY","SAR","AED","AUD"]), scope: z.enum(["production", "test"]).optional() }))
      .query(async ({ input, ctx }) => {
        const scope = input.scope ?? "production";
        if (scope === "test" && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only Admin can view Test Patient Credit." });
        const balance = await getPatientCreditBalance(input.patientId, input.currency as any, scope as any);
        return { balance, currency: input.currency, scope };
      }),
    getCreditTransactions: staffOrAdminProcedure
      .input(z.object({ patientId: z.number(), scope: z.enum(["production", "test"]).optional() }))
      .query(async ({ input, ctx }) => {
        const scope = input.scope ?? "production";
        if (scope === "test" && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only Admin can view Test Patient Credit." });
        const rows = await getCreditTransactions(input.patientId);
        return rows.filter((row: any) => (row.financialScope ?? "production") === scope);
      }),
    getFxRoundingAdjustments: staffOrAdminProcedure
      .input(z.object({ patientId: z.number(), scope: z.enum(["production", "test"]).optional() }))
      .query(async ({ input, ctx }) => {
        const scope = input.scope ?? "production";
        if (scope === "test" && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only Admin can view Test Finance adjustments." });
        return getPatientFxRoundingAdjustments(input.patientId, scope as any);
      }),
    addCredit: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        currency: z.enum(["USD","EUR","GBP","TRY","SAR","AED","AUD"]),
        amount: z.number().positive(),
        type: z.enum(["overpayment","applied_to_invoice","refund_deduction","manual_adjustment"]),
        invoiceId: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => addCreditTransaction({ ...input, recordedById: ctx.user.id })),
    applyCredit: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        invoiceId: z.number(),
        amount: z.number().positive(),
        currency: z.enum(["USD","EUR","GBP","TRY","SAR","AED","AUD"]),
      }))
      .mutation(async ({ input, ctx }) => applyCreditToInvoice({ ...input, recordedById: ctx.user.id })),
    previewCrossCurrencyCredit: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        invoiceId: z.number(),
        sourceCurrency: z.enum(["USD","EUR","GBP","TRY","SAR","AED","AUD"]),
        sourceAmount: z.number().positive().optional(),
        targetAmount: z.number().positive().optional(),
        applyMaximum: z.boolean().optional(),
      }))
      .query(({ input }) => quoteCrossCurrencyCreditApplication(input)),
    applyCrossCurrencyCredit: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        invoiceId: z.number(),
        sourceCurrency: z.enum(["USD","EUR","GBP","TRY","SAR","AED","AUD"]),
        sourceAmount: z.number().positive().optional(),
        targetAmount: z.number().positive().optional(),
        applyMaximum: z.boolean().optional(),
      }))
      .mutation(({ input, ctx }) => applyCrossCurrencyCreditToInvoice({ ...input, recordedById: ctx.user.id })),
    getReversibleCreditApplications: staffOrAdminProcedure
      .input(z.object({ invoiceId: z.number() }))
      .query(async ({ input, ctx }) => {
        const rows = await getReversiblePatientCreditApplications(input.invoiceId);
        return ctx.user.role === "admin" ? rows : rows.filter((row: any) => row.financialScope !== "test");
      }),
    getReversibleCreditApplicationsByPatient: staffOrAdminProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ input, ctx }) => {
        const rows = await getReversiblePatientCreditApplicationsByPatient(input.patientId);
        return ctx.user.role === "admin" ? rows : rows.filter((row: any) => row.financialScope !== "test");
      }),
    getPatientCreditApplicationHistory: staffOrAdminProcedure
      .input(z.object({ patientId: z.number(), scope: z.enum(["production", "test"]).optional() }))
      .query(async ({ input, ctx }) => {
        const scope = input.scope ?? "production";
        if (scope === "test" && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only Admin can view Test Patient Credit history." });
        const rows = await getPatientCreditApplicationHistory(input.patientId);
        return rows.filter((row: any) => (row.financialScope ?? "production") === scope);
      }),
    reverseAppliedCredit: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        invoiceId: z.number(),
        applicationId: z.number(),
        idempotencyKey: z.string().uuid(),
        reason: z.string().trim().max(500).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const applications = await getReversiblePatientCreditApplications(input.invoiceId);
        const application = applications.find((row: any) => Number(row.id) === input.applicationId && Number(row.patientId) === input.patientId);
        if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "The selected Patient Credit application is not available for reversal." });
        if ((application as any).financialScope === "test" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only Admin can reverse Test Patient Credit." });
        }
        return reversePatientCreditApplication({ ...input, recordedById: ctx.user.id });
      }),
    getPatientCreditPayouts: staffOrAdminProcedure
      .input(z.object({ patientId: z.number(), scope: z.enum(["production", "test"]).optional() }))
      .query(async ({ input, ctx }) => {
        const scope = input.scope ?? "production";
        if (scope === "test" && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only Admin can view Test Patient Credit payouts." });
        const rows = await getPatientCreditPayouts(input.patientId);
        return rows.filter((row: any) => (row.financialScope ?? "production") === scope);
      }),
    getPatientCreditPayoutReceipt: staffOrAdminProcedure
      .input(z.object({ payoutId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const receipt = await getPatientCreditPayoutReceipt(input.payoutId);
        if (!receipt) throw new TRPCError({ code: "NOT_FOUND", message: "Patient Credit Payout receipt was not found." });
        if ((receipt.payout.financialScope ?? "production") === "test" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only Admin can view Test Patient Credit payout receipts." });
        }
        return receipt;
      }),
    previewPatientCreditPayout: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        financialScope: z.enum(["production", "test"]),
        sourceCurrency: z.enum(["USD", "EUR", "GBP", "TRY", "SAR", "AED", "AUD"]),
        sourceAmount: z.number().positive(),
        payoutCurrency: z.enum(["USD", "EUR", "GBP", "TRY", "SAR", "AED", "AUD"]),
        method: z.enum(["cash", "bank_transfer"]),
        payoutDate: z.date().optional(),
      }))
      .query(({ input, ctx }) => {
        if (input.financialScope === "test" && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only Admin can preview Test Patient Credit payout." });
        return quotePatientCreditPayout(input);
      }),
    createPatientCreditPayout: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        financialScope: z.enum(["production", "test"]),
        sourceCurrency: z.enum(["USD", "EUR", "GBP", "TRY", "SAR", "AED", "AUD"]),
        sourceAmount: z.number().positive(),
        payoutCurrency: z.enum(["USD", "EUR", "GBP", "TRY", "SAR", "AED", "AUD"]),
        method: z.enum(["cash", "bank_transfer"]),
        payoutDate: z.date().optional(),
        idempotencyKey: z.string().uuid(),
        reference: z.string().trim().max(256).optional(),
        notes: z.string().trim().max(1000).optional(),
      }))
      .mutation(({ input, ctx }) => {
        if (input.financialScope === "test" && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only Admin can pay out Test Patient Credit." });
        return createPatientCreditPayout({ ...input, recordedById: ctx.user.id });
      }),
    // ─── Refunds ───────────────────────────────────────────────────────────────
    getInvoiceFinancialSummary: staffOrAdminProcedure
      .input(z.object({ invoiceId: z.number() }))
      .query(({ input }) => getInvoiceFinancialSummary(input.invoiceId)),
    getRefunds: staffOrAdminProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ input }) => getRefunds(input.patientId)),
    createRefund: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        invoiceId: z.number(),
        amount: z.number().positive(),
        currency: z.enum(["USD","EUR","GBP","TRY","SAR","AED"]),
        method: z.enum(["cash","bank_transfer","card_reversal","other"]),
        refundDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => createRefund({ ...input, recordedById: ctx.user.id })),
    refundCredit: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        amount: z.number().positive(),
        currency: z.enum(["USD","EUR","GBP","TRY","SAR","AED"]),
        method: z.enum(["cash","bank_transfer","card_reversal","other"]),
        notes: z.string().optional(),
      }))
      .mutation(() => {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Legacy Credit Refund is unavailable. Use the server-authoritative Patient Credit Payout action." });
      }),

    // ── Manual email sending (invoice) ───────────────────────────────────────
    sendInvoiceEmail: staffOrAdminProcedure
      .input(z.object({
        invoiceId: z.number(),
        isUpdate: z.boolean().default(false),
        attachPdf: z.boolean().default(false),
        notifyPartner: z.boolean().default(false),
        manualEmail: z.string().trim().email().max(320).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const invoice = await getInvoiceById(input.invoiceId) as any;
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
        const patient = await getPatientById(invoice.patientId);
        if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "Patient not found" });
        const partner = input.notifyPartner && patient.partnerId
          ? await getPatientById(patient.partnerId)
          : null;
        const patientName = `${patient.firstName} ${patient.lastName}`;
        const [patientLanguageFacts, partnerLanguageFacts] = await Promise.all([
          getPatientCommunicationLanguageFacts(invoice.patientId),
          partner ? getPatientCommunicationLanguageFacts(partner.id) : Promise.resolve(null),
        ]);
        const recipients = resolveFinanceEmailRecipients([
          {
            source: "patient",
            email: patient.email,
            displayName: patientName,
            directProfileLanguage: patientLanguageFacts?.directProfileLanguage,
            convertedLeadProfileLanguage: patientLanguageFacts?.convertedLeadProfileLanguage,
          },
          ...(partner ? [{
            source: "partner" as const,
            email: partner.email,
            displayName: `${partner.firstName} ${partner.lastName}`,
            directProfileLanguage: partnerLanguageFacts?.directProfileLanguage,
            convertedLeadProfileLanguage: partnerLanguageFacts?.convertedLeadProfileLanguage,
          }] : []),
          ...(input.manualEmail ? [{ source: "manual" as const, email: input.manualEmail, displayName: patientName, inheritLanguageFrom: "patient" as const }] : []),
        ]);
        if (recipients.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Add a valid email address before sending this invoice." });
        }

        // Invoice documents use only the invoice's immutable legacy adjustment snapshot.
        const items = await getInvoiceItems(input.invoiceId);

        const issueDate = invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "";
        const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : undefined;
        const totalNum = Number(invoice.totalAmount);
        const isMethodNeutralInvoice = (invoice as any).settlementModelVersion === "method_neutral_v2" || (invoice as any).pricingMode === "agreed";
        const paymentAdjustmentRateSnapshot = (invoice as any).paymentAdjustmentRateSnapshot != null
          ? Number((invoice as any).paymentAdjustmentRateSnapshot)
          : undefined;
        const cardTotal = !isMethodNeutralInvoice && paymentAdjustmentRateSnapshot != null && paymentAdjustmentRateSnapshot > 0
          ? totalNum * (1 + paymentAdjustmentRateSnapshot / 100)
          : undefined;
        const isTaxModelInvoice = (invoice as any).taxModelVersion === "line_tax_v1";
        const taxAmount = Number(invoice.taxAmount ?? 0);
        const serviceTotal = Math.max(0, totalNum - taxAmount);
        const [invoicePayments, overpaymentCreditLots, financialSummary] = await Promise.all([
          listPaymentsByInvoice(input.invoiceId),
          listOverpaymentCreditLotsByInvoice(input.invoiceId),
          getInvoiceFinancialSummary(input.invoiceId),
        ]);
        const balanceDue = financialSummary.balanceDue;
        const dualBalancePresentation = deriveInvoiceDualBalancePresentation({
          totalAmount: financialSummary.invoiceTotal,
          taxAmount,
          netSettled: financialSummary.netSettled,
          taxModelVersion: (invoice as any).taxModelVersion ?? null,
        });
        const legacyPaymentOptionAmount = !isMethodNeutralInvoice && paymentAdjustmentRateSnapshot != null && paymentAdjustmentRateSnapshot > 0
          ? computeCollectionHint(balanceDue, "card", (invoice as any).pricingMode ?? "discount", paymentAdjustmentRateSnapshot)
          : null;
        const formatEmailMoney = (amount: string) => Number(amount).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const paymentDetails = invoicePayments.map((p: any) => ({
          date: new Date(p.receivedAt ?? p.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
          method: p.method ? (p.method.charAt(0).toUpperCase() + p.method.slice(1).replace(/_/g, " ")) : "Cash",
          amount: Number(p.amount),
          currency: p.currency,
          convertedAmountInInvoiceCurrency: Number(p.amountInInvoiceCurrency),
          settledAmount: p.settledAmount != null ? Number(p.settledAmount) : undefined,
          invoiceCurrency: (invoice as any).currency ?? "USD",
          conversionRateToInvoice: p.conversionRateToInvoice != null ? String(p.conversionRateToInvoice) : undefined,
          fxRateSource: p.fxRateSource,
          fxRateNote: p.fxRateNote,
          bankGrossAmountSent: p.bankGrossAmountSent != null ? Number(p.bankGrossAmountSent) : null,
          bankDeductionAmount: p.bankDeductionAmount != null ? Number(p.bankDeductionAmount) : null,
          bankDeductionPercent: p.bankDeductionPercent != null ? Number(p.bankDeductionPercent) : null,
          patientCredits: overpaymentCreditLots
            .filter((credit: any) => Number(credit.originPaymentId) === Number(p.id))
            .map((credit: any) => ({ currency: credit.currency, amount: Number(credit.amount) })),
        }));

        const emailData = {
          patientName,
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: formatEmailMoney(financialSummary.invoiceTotal),
          currency: invoice.currency ?? "TRY",
          issueDate,
          dueDate,
          notes: invoice.notes ?? undefined,
          items: items.map((i: any) => ({
            name: formatInvoiceLineDisplayName(i.description, i.lineLabel),
            amount: `${invoice.currency ?? "TRY"} ${Number(i.totalPrice).toLocaleString("en", { minimumFractionDigits: 2 })}`,
            quantity: Number(i.quantity),
            originalLineTotal: String(Number(i.unitPrice) * Number(i.quantity)),
            finalLineTotal: String(i.totalPrice),
            taxLabelSnapshot: i.taxLabelSnapshot ?? null,
            taxRateSnapshot: i.taxRateSnapshot != null ? Number(i.taxRateSnapshot) : null,
            effectiveTaxableBase: i.effectiveTaxableBase != null ? String(i.effectiveTaxableBase) : null,
            taxAmount: i.taxAmount != null ? Number(i.taxAmount).toLocaleString("en", { minimumFractionDigits: 2 }) : null,
            priceEntryCurrency: i.priceEntryCurrency ?? null,
            priceEntryAmount: i.priceEntryAmount != null ? Number(i.priceEntryAmount).toLocaleString("en", { minimumFractionDigits: 2 }) : null,
            priceEntryKind: i.priceEntryKind ?? null,
            priceFxRateToInvoice: i.priceFxRateToInvoice != null ? String(i.priceFxRateToInvoice) : null,
            priceFxSource: i.priceFxSource ?? null,
            priceFxNote: i.priceFxNote ?? null,
          })),
          itemsSummary: items.map((i: any) => formatInvoiceLineDisplayName(i.description, i.lineLabel)).join(", ") || "Services",
          isUpdate: input.isUpdate,
          pricingMode: (invoice as any).pricingMode ?? "discount",
          cardSurchargePct: paymentAdjustmentRateSnapshot,
          netSettled: formatEmailMoney(financialSummary.netSettled),
          balanceDue: formatEmailMoney(balanceDue),
          isFullySettled: financialSummary.isFullySettled,
          remainingServiceAmountBeforeTax: formatEmailMoney(dualBalancePresentation.remainingServiceAmountBeforeTax),
          totalBalanceDueIncludingTax: formatEmailMoney(dualBalancePresentation.totalBalanceDueIncludingTax),
          shouldShowRemainingServiceAmountBeforeTax: dualBalancePresentation.shouldShowRemainingServiceAmountBeforeTax,
          legacyPaymentOptionAmount: legacyPaymentOptionAmount ? formatEmailMoney(legacyPaymentOptionAmount) : undefined,
          taxModelVersion: (invoice as any).taxModelVersion ?? null,
          settlementModelVersion: (invoice as any).settlementModelVersion ?? null,
          serviceTotal: isTaxModelInvoice ? serviceTotal.toLocaleString("en", { minimumFractionDigits: 2 }) : undefined,
          taxAmount: isTaxModelInvoice ? taxAmount.toLocaleString("en", { minimumFractionDigits: 2 }) : undefined,
          paymentDetails,
        };

        let pdfBuffer: Buffer | undefined;
        if (input.attachPdf) {
          pdfBuffer = await generateInvoicePdf({
            invoiceNumber: invoice.invoiceNumber,
            patientName: `${patient.firstName} ${patient.lastName}`,
            mrn: patient.mrn ?? undefined,
            issueDate,
            dueDate,
            currency: invoice.currency ?? "TRY",
            // Fix B: For Mode B (agreed), derive subtotal from item totals so PDF shows
            // "Service Subtotal / Agreed Price Adjustment / TOTAL" correctly.
            // For Mode A (discount), use stored subtotal (or totalAmount as fallback).
            subtotal: (() => {
              if ((invoice as any).pricingMode === "agreed") {
                return items.reduce((s: number, i: any) => s + Number(i.totalPrice), 0);
              }
              return Number(invoice.subtotal ?? invoice.totalAmount);
            })(),
            discountAmount: (() => {
              if ((invoice as any).pricingMode === "agreed") {
                const itemsSubtotal = items.reduce((s: number, i: any) => s + Number(i.totalPrice), 0);
                return Math.max(0, itemsSubtotal - totalNum);
              }
              return Number(invoice.discountAmount ?? 0);
            })(),
            discountPercent: (invoice as any).pricingMode === "agreed" ? 0 : Number(invoice.discountPercent ?? 0),
            taxAmount,
            taxModelVersion: (invoice as any).taxModelVersion ?? null,
            settlementModelVersion: (invoice as any).settlementModelVersion ?? null,
            totalAmount: totalNum,
            paidAmount: Number(financialSummary.netSettled),
            status: invoice.status,
            notes: invoice.notes ?? undefined,
            cardSurchargePct: paymentAdjustmentRateSnapshot,
            pricingMode: (invoice as any).pricingMode ?? "discount",
            paymentDetails,
            items: items.map((i: any) => {
              const unitPrice = Number(i.unitPrice);
              const qty = Number(i.quantity);
              const linePricingMethod = i.linePricingMethod ?? "none";
              const itemDiscPct = linePricingMethod === "discount_percent"
                ? Number(i.lineDiscountPercent ?? 0)
                : 0;
              return {
                description: i.description,
                lineLabel: i.lineLabel ?? null,
                serviceDescription: i.serviceDescription ?? undefined,
                quantity: qty,
                unitPrice,
                totalPrice: Number(i.totalPrice),
                linePricingMethod,
                lineDiscountPercent: itemDiscPct,
                originalLineTotal: unitPrice * qty,
                taxLabelSnapshot: i.taxLabelSnapshot ?? null,
                taxRateSnapshot: i.taxRateSnapshot != null ? Number(i.taxRateSnapshot) : null,
                effectiveTaxableBase: i.effectiveTaxableBase != null ? Number(i.effectiveTaxableBase) : null,
                taxAmount: i.taxAmount != null ? Number(i.taxAmount) : null,
                priceEntryCurrency: i.priceEntryCurrency ?? null,
                priceEntryAmount: i.priceEntryAmount != null ? Number(i.priceEntryAmount) : null,
                priceEntryKind: i.priceEntryKind ?? null,
                priceFxRateToInvoice: i.priceFxRateToInvoice != null ? String(i.priceFxRateToInvoice) : null,
                priceFxSource: i.priceFxSource ?? null,
                priceFxNote: i.priceFxNote ?? null,
              };
            }),
          });
        }

        let sentCount = 0;
        let failedCount = 0;
        for (const recipient of recipients) {
          try {
            const sent = await sendInvoiceEmail(
              recipient.email,
              { ...emailData, patientName: recipient.displayName },
              recipient.preferredLanguage,
              pdfBuffer,
            );
            if (sent) sentCount += 1;
            else failedCount += 1;
          } catch (error) {
            console.error("[Finance] Invoice email delivery failed", { invoiceId: input.invoiceId, recipientSource: recipient.source, error });
            failedCount += 1;
          }
        }
        return { success: sentCount > 0, sentCount, failedCount };
      }),

    // ── Manual email sending (refund receipt) ────────────────────────────────
    sendRefundReceiptEmail: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        invoiceId: z.number(),
        invoiceNumber: z.string(),
        refundAmount: z.number(),
        currency: z.string(),
        reason: z.string().optional(),
        notes: z.string().optional(),
        attachPdf: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        const patient = await getPatientById(input.patientId);
        if (!patient?.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Patient has no email address" });

        const refundDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
        const emailData: RefundEmailData = {
          patientName: `${patient.firstName} ${patient.lastName}`,
          invoiceNumber: input.invoiceNumber,
          refundAmount: input.refundAmount.toLocaleString("en", { minimumFractionDigits: 2 }),
          currency: input.currency,
          refundDate,
          reason: input.reason,
          notes: input.notes,
        };

        let pdfBuffer: Buffer | undefined;
        if (input.attachPdf) {
          pdfBuffer = await generateRefundPdf({
            invoiceNumber: input.invoiceNumber,
            patientName: `${patient.firstName} ${patient.lastName}`,
            mrn: patient.mrn ?? undefined,
            refundDate,
            currency: input.currency,
            refundAmount: input.refundAmount,
            reason: input.reason,
            notes: input.notes,
          });
        }

        await sendRefundEmail(patient.email, emailData, (Array.isArray(patient.preferredLanguages) ? (patient.preferredLanguages as string[])[0] : patient.preferredLanguages as string) ?? "en", pdfBuffer);
        return { success: true };
      }),

    // ── Send official receipt email ───────────────────────────────────────────────────
    sendReceiptEmail: staffOrAdminProcedure
      .input(z.object({
        invoiceId: z.number(),
        receiptNote: z.string().optional(),
        attachmentKey: z.string().optional(), // S3 key of an extra file to attach
        manualEmail: z.string().trim().email().max(320).optional(),
      }))
      .mutation(async ({ input }) => {
        const invoice = await getInvoiceById(input.invoiceId) as any;
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
        const patient = await getPatientById(invoice.patientId);
        if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "Patient not found" });

        const patientName = `${patient.firstName} ${patient.lastName}`;
        const patientLanguageFacts = await getPatientCommunicationLanguageFacts(invoice.patientId);
        const recipients = resolveFinanceEmailRecipients([
          {
            source: "patient",
            email: patient.email,
            displayName: patientName,
            directProfileLanguage: patientLanguageFacts?.directProfileLanguage,
            convertedLeadProfileLanguage: patientLanguageFacts?.convertedLeadProfileLanguage,
          },
          ...(input.manualEmail ? [{ source: "manual" as const, email: input.manualEmail, displayName: patientName, inheritLanguageFrom: "patient" as const }] : []),
        ]);
        if (recipients.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Add a valid email address before sending this official receipt." });
        }
        const receiptData = await buildCumulativeReceiptData({
          invoiceId: input.invoiceId,
          patientName,
          mrn: patient.mrn ?? undefined,
        });
        if (!isOfficialReceiptEligible(receiptData)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: OFFICIAL_RECEIPT_UNAVAILABLE_MESSAGE,
          });
        }
        const pdfBuffer = await generateReceiptPdf({
          ...receiptData,
          receiptNote: input.receiptNote,
        });

        // Fetch extra attachment from storage if provided
        let extraAttachmentBuffer: Buffer | undefined;
        let extraAttachmentName: string | undefined;
        if (input.attachmentKey) {
          try {
            const { storageGetBytes } = await import("./storage");
            const result = await storageGetBytes(input.attachmentKey);
            if (result?.data) {
              extraAttachmentBuffer = result.data;
              // Derive filename from key (last segment)
              extraAttachmentName = input.attachmentKey.split("/").pop() ?? "attachment";
            }
          } catch {
            // Non-fatal: send without attachment if fetch fails
          }
        }

        const receiptEmailData = {
            patientName,
            receiptNumber: receiptData.receiptNumber,
            invoiceNumber: receiptData.invoiceNumber,
            invoiceCurrency: receiptData.currency,
            taxModelVersion: receiptData.taxModelVersion,
            serviceTotal: receiptData.serviceTotal?.toLocaleString("en", { minimumFractionDigits: 2 }),
            taxAmount: receiptData.taxAmount?.toLocaleString("en", { minimumFractionDigits: 2 }),
            pricingMode: receiptData.pricingMode,
            invoiceDiscountAmount: receiptData.invoiceDiscountAmount?.toLocaleString("en", { minimumFractionDigits: 2 }),
            invoiceDiscountPercent: receiptData.invoiceDiscountPercent?.toLocaleString("en", { minimumFractionDigits: 2 }),
            finalAgreedAmount: receiptData.finalAgreedAmount?.toLocaleString("en", { minimumFractionDigits: 2 }) ?? null,
            invoiceTotal: receiptData.invoiceTotal.toLocaleString("en", { minimumFractionDigits: 2 }),
            totalSettled: receiptData.totalSettled.toLocaleString("en", { minimumFractionDigits: 2 }),
            balanceDue: receiptData.balanceDue.toLocaleString("en", { minimumFractionDigits: 2 }),
            includedPayments: receiptData.includedPayments.map(payment => ({
              paymentDate: payment.paymentDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
              method: payment.method,
              amount: payment.amount.toLocaleString("en", { minimumFractionDigits: 2 }),
              currency: payment.currency,
              appliedToInvoice: payment.showAppliedToInvoice
                ? `${receiptData.currency} ${payment.settledAmount.toLocaleString("en", { minimumFractionDigits: 2 })}`
                : undefined,
              patientCredits: payment.patientCredits.map(credit => ({
                currency: credit.currency,
                amount: credit.amount.toLocaleString("en", { minimumFractionDigits: 2 }),
              })),
            })),
            receiptNote: input.receiptNote,
          };
        let sentCount = 0;
        let failedCount = 0;
        for (const recipient of recipients) {
          try {
            const sent = await sendReceiptEmailDirect(
              recipient.email,
              { ...receiptEmailData, patientName: recipient.displayName },
              recipient.preferredLanguage,
              pdfBuffer,
              extraAttachmentBuffer,
              extraAttachmentName,
            );
            if (sent) sentCount += 1;
            else failedCount += 1;
          } catch (error) {
            console.error("[Finance] Official receipt email delivery failed", { invoiceId: input.invoiceId, recipientSource: recipient.source, error });
            failedCount += 1;
          }
        }
        return { success: sentCount > 0, sentCount, failedCount };
      }),
  }),
  // ─── Lab & Radiology ─────────────────────────────────────────────────────────────
  lab: router({
    orders: protectedProcedure
      .input(z.object({ patientId: z.number().optional(), category: z.string().optional() }).optional())
      .query(({ input }) => getLabOrders(input?.patientId, input?.category)),

    results: protectedProcedure
      .input(z.object({ labOrderId: z.number() }))
      .query(({ input }) => getLabResults(input.labOrderId)),

    resultsByPatient: protectedProcedure
      .input(z.object({ patientId: z.number() }))
      .query(({ input }) => getLabResultsByPatient(input.patientId)),

    createOrder: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        doctorId: z.number().optional(),
        serviceId: z.number().optional(),
        testName: z.string().min(1),
        category: z.enum(["lab", "radiology", "pathology", "other"]),
        priority: z.enum(["routine", "urgent", "stat"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const orderNumber = await getNextCode("lab_order");
        return createLabOrder({ ...input, orderNumber, code: orderNumber });
      }),

    updateOrder: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          status: z.enum(["ordered", "sample_collected", "processing", "completed", "cancelled"]).optional(),
          collectedDate: z.date().optional(),
          resultDate: z.date().optional(),
          notes: z.string().optional(),
        }),
      }))
      .mutation(({ input }) => updateLabOrder(input.id, input.data)),

    addResult: staffOrAdminProcedure
      .input(z.object({
        labOrderId: z.number(),
        patientId: z.number(),
        parameter: z.string().optional().default(""),
        value: z.string().optional().default(""),
        unit: z.string().optional(),
        referenceRange: z.string().optional(),
        refRangeFrom: z.string().optional(),
        refRangeTo: z.string().optional(),
        flag: z.enum(["normal", "low", "high", "critical"]).optional(),
        flagManualOverride: z.boolean().optional(),
        interpretation: z.string().optional(),
        clinicalInterpretation: z.string().optional(),
        resultFileUrl: z.string().optional(),
        resultFileKey: z.string().optional(),
        unitConversionFormula: z.string().optional(),
        sampleCollectedAt: z.date().optional(),
        reportedAt: z.date().optional(),
        isVisibleToPatient: z.boolean().optional(),
        resultType: z.enum(["structured", "freetext"]).optional().default("structured"),
      }))
      .mutation(async ({ input, ctx }) => {
        // For freetext results (non-blood), use a placeholder parameter if not provided
        const finalInput = {
          ...input,
          parameter: input.parameter || "Report",
          value: input.value || "See attached file",
          enteredById: ctx.user.id,
        };
        await createLabResult(finalInput as any);
        return { success: true };
      }),

    toggleResultVisibility: staffOrAdminProcedure
      .input(z.object({ id: z.number(), isVisibleToPatient: z.boolean() }))
      .mutation(async ({ input }) => {
        const { toggleLabResultVisibility } = await import("./db");
        await toggleLabResultVisibility(input.id, input.isVisibleToPatient);
        return { success: true };
      }),

    updateOrderLocation: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        location: z.enum(["in-clinic", "partner-clinic", "patient-country"]),
        partnerClinicId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await updateLabOrder(input.id, { location: input.location, partnerClinicId: input.partnerClinicId } as any);
        return { success: true };
      }),

    aiExtractResult: staffOrAdminProcedure
      .input(z.object({ fileUrl: z.string(), testName: z.string().optional() }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
	        const prompt = `You are a medical lab result extractor. Given the URL of a lab result file or report, extract the key fields and return them as JSON.
Test name context: ${input.testName ?? "unknown"}
File URL: ${input.fileUrl}

	Return JSON with these fields (all optional, only include what you can extract):
	{ "parameter": string, "value": string, "unit": string, "refFrom": string, "refTo": string, "interpretation": string }`;
	        const res = await invokeLLM({
	          workloadId: "laboratory_extraction",
	          messages: [
            { role: "system", content: "You are a medical data extraction assistant. Always respond with valid JSON only." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_schema", json_schema: {
            name: "lab_result_extraction", strict: true,
            schema: {
              type: "object",
              properties: {
                parameter: { type: "string" }, value: { type: "string" },
                unit: { type: "string" }, refFrom: { type: "string" },
                refTo: { type: "string" }, interpretation: { type: "string" },
              },
              required: ["parameter", "value", "unit", "refFrom", "refTo", "interpretation"],
              additionalProperties: false,
            },
          }},
        });
        const content = res.choices?.[0]?.message?.content ?? "{}";
        return JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
      }),

    uploadResultFile: staffOrAdminProcedure
      .input(z.object({
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        labOrderId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { storagePut, storageGetSignedUrl } = await import("./storage");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "bin";
        const key = `lab-results/${ctx.user.id}-${Date.now()}.${ext}`;
        const { key: savedKey } = await storagePut(key, buffer, input.mimeType, input.fileName);
        // Get a presigned public URL so the LLM can access the file
        const signedUrl = await storageGetSignedUrl(savedKey);
        return { key: savedKey, url: signedUrl };
      }),

    transcribeVoiceResult: staffOrAdminProcedure
      .input(z.object({ audioBase64: z.string(), testName: z.string().optional() }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        // Use LLM to map transcribed text to result fields
	        const prompt = `The following is a voice recording transcription of a medical lab result entry for test: ${input.testName ?? "unknown"}.
Audio (base64): [audio data provided]
Extract the lab result fields from the spoken content and return as JSON:
{ "parameter": string, "value": string, "unit": string, "refFrom": string, "refTo": string, "interpretation": string }
	If the audio cannot be processed, return best-effort extraction from context.`;
	        const res = await invokeLLM({
	          workloadId: "laboratory_extraction",
	          messages: [
            { role: "system", content: "You are a medical voice transcription assistant. Extract lab result data from audio content. Always respond with valid JSON only." },
            { role: "user", content: [{ type: "text", text: prompt }, { type: "file_url", file_url: { url: `data:audio/webm;base64,${input.audioBase64}`, mime_type: "audio/mp4" } }] },
          ],
          response_format: { type: "json_schema", json_schema: {
            name: "voice_result_extraction", strict: true,
            schema: {
              type: "object",
              properties: {
                parameter: { type: "string" }, value: { type: "string" },
                unit: { type: "string" }, refFrom: { type: "string" },
                refTo: { type: "string" }, interpretation: { type: "string" },
              },
              required: ["parameter", "value", "unit", "refFrom", "refTo", "interpretation"],
              additionalProperties: false,
            },
          }},
        });
        const content = res.choices?.[0]?.message?.content ?? "{}";
        return JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
      }),

    importLabResultsFromText: staffOrAdminProcedure
      .input(z.object({
        text: z.string().optional(),
        fileUrls: z.array(z.string()).optional(), // legacy: plain URLs
        files: z.array(z.object({ url: z.string(), mimeType: z.string(), password: z.string().optional(), name: z.string().optional(), key: z.string().optional() })).optional(),
        /** All existing test names in the patient's lab table (predefined + AI-added + manual) */
        existingTestNames: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        console.log("[importLabResultsFromText] called with text length:", input.text?.length ?? 0, "files:", (input.files?.length ?? input.fileUrls?.length ?? 0));
        const { invokeLLM } = await import("./_core/llm");

        const systemPrompt = `You are a medical lab result extractor. Extract ALL individual test results from the provided text or image files.

For each test, extract: testName, value (the result value as a string — can be numeric like "5.7" OR qualitative like "Negative", "Positive", "Reactive", "Non Reactive", "Normal", "Abnormal", or any other text result — NEVER leave this empty if a result exists), unit (empty string if none), collectionDate (ISO date YYYY-MM-DD or empty string), reportDate (ISO date YYYY-MM-DD or empty string), referenceRange (string or empty string), interpretation (string or empty string).

IMPORTANT DATE RULE: If only ONE date is visible on the report, put it in collectionDate and leave reportDate empty. Only populate reportDate if you can clearly identify it as a separate report/issue date distinct from the sample collection date.

CRITICAL: Extract EVERY result without exception, including those with qualitative/text values like Negative, Positive, Reactive, Non Reactive, etc. Do NOT skip any result because its value is not a number.

PCR / MOLECULAR GROUPING RULE (very important):
When you see a Molecular/PCR test (e.g. HBV DNA, HCV RNA, CMV PCR, EBV PCR, HPV DNA), group ALL sub-fields of that test into ONE single result entry:
- Use the canonical test name as testName (e.g. "HBV DNA", "HCV RNA", "CMV PCR")
- Put the primary qualitative result (Detected/Not Detected/Positive/Negative) in the "value" field
- Put the viral load numeric value (e.g. "12400") in a separate field "viralLoad" if present
- Put the viral load unit (e.g. "IU/mL", "copies/mL") in "viralLoadUnit" if present
- Put the Ct value (e.g. "29.4") in "ctValue" if present
- Put the genotype (e.g. "1b", "3a") in "genotype" if present
Do NOT create separate rows for "HBV DNA Viral load", "HBV DNA Ct value", "HBV DNA Quantitative" — they all belong to one "HBV DNA" entry.

HPV GROUPING RULE:
Group all HPV type results under one "HPV DNA" entry. Put individual type results (e.g. "Type 16: Positive, Type 18: Negative") in the "value" field as a summary string.

For panels with multiple INDEPENDENT sub-results (e.g. "Hep B Core Ab, IgM — Negative" and "Hep B Core Ab, total — Positive"), create one SEPARATE entry per sub-result with its own testName and value.

MICROBIOLOGY CULTURE GROUPING RULE:
When you see a Culture/Sensitivity test (e.g. Urine Culture, Blood Culture, Semen Culture, Wound Culture), group ALL sub-fields into ONE entry:
- Put the growth result ("No Growth", "Growth", "Positive", "Negative") in the "value" field
- Put the identified organism name (e.g. "E. coli", "Klebsiella pneumoniae") in "organism" if present
- Put the antibiogram/sensitivity summary (e.g. "Sensitive: Amoxicillin, Ciprofloxacin; Resistant: Ampicillin") in "antibiogram" if present
Do NOT create separate rows for each antibiotic — summarize them in the "antibiogram" field.

Return a JSON object with a "results" array. Each result may include optional extra fields: viralLoad, viralLoadUnit, ctValue, genotype, organism, antibiogram.
If a date is not found, use empty string "". Do not guess dates. Do not use null.
Always return the results array, even for a single result.

FILE SOURCE TRACKING: When multiple files are provided, each file is preceded by a [FILE_INDEX:N] marker (e.g. [FILE_INDEX:0], [FILE_INDEX:1]). For each result, set the "fileIndex" field to the integer index of the file it came from. If only one file or text input, use 0.`;

        const userContent: any[] = [];
        if (input.text) {
          userContent.push({ type: "text", text: `Lab report text:\n${input.text}` });
        }
        // Helper: resolve a storage URL to a base64 data URL the LLM can actually access
        const resolveFileUrl = async (url: string, mimeType: string): Promise<string> => {
          // Handle any internal storage URL: /manus-storage/, /api/storage/, or relative manus-storage/
          const isInternalStorage = url.startsWith("/manus-storage/") || url.startsWith("manus-storage/") || url.startsWith("/api/storage/");
          if (isInternalStorage) {
            try {
              const { storageGetBytes } = await import("./storage");
              // Normalize: strip /api/storage/ prefix so storageGetBytes gets just the key
              const normalizedKey = url.replace(/^\/api\/storage\//, "").replace(/^\/manus-storage\//, "").replace(/^manus-storage\//, "");
              const { data, contentType } = await storageGetBytes(normalizedKey);
              const base64 = data.toString("base64");
              const mime = mimeType || contentType || "application/octet-stream";
              console.log("[importLabResultsFromText] resolved file to base64 data URL, mime:", mime, "size:", data.length);
              return `data:${mime};base64,${base64}`;
            } catch (e) {
              console.error("[importLabResultsFromText] failed to fetch storage bytes:", e);
              return url; // fallback to original URL
            }
          }
          return url; // already an absolute external URL
        };

        // New: files array with explicit mimeType (preferred)
        if (input.files?.length) {
          for (let fi = 0; fi < input.files.length; fi++) {
            const f = input.files[fi];
            // Insert a text marker before each file so the LLM knows which file index it is
            const fileLabel = input.files.length > 1 ? `[FILE_INDEX:${fi}]` : `[FILE_INDEX:0]`;
            const labelText = f.password
              ? `${fileLabel} Note: The following file is password-protected. Password: ${f.password}`
              : fileLabel;
            userContent.push({ type: "text", text: labelText });
            const resolvedUrl = await resolveFileUrl(f.url, f.mimeType ?? "");
            if (f.mimeType === "application/pdf") {
              userContent.push({ type: "file_url", file_url: { url: resolvedUrl, mime_type: "application/pdf" } });
            } else {
              userContent.push({ type: "image_url", image_url: { url: resolvedUrl, detail: "high" } });
            }
          }
        } else if (input.fileUrls?.length) {
          // Legacy fallback: guess type from URL extension
          for (const url of input.fileUrls) {
            const lower = url.toLowerCase();
            const resolvedUrl = await resolveFileUrl(url, lower.includes(".pdf") ? "application/pdf" : "image/jpeg");
            if (lower.includes(".pdf")) {
              userContent.push({ type: "file_url", file_url: { url: resolvedUrl, mime_type: "application/pdf" } });
            } else {
              userContent.push({ type: "image_url", image_url: { url: resolvedUrl, detail: "high" } });
            }
          }
        }
	        if (userContent.length === 0) {
	          return { results: [] };
	        }

	        const res = await invokeLLM({
	          workloadId: "laboratory_extraction",
	          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "lab_results_bulk",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        testName:       { type: "string", description: "Name of the test. For PCR/Molecular tests, use the canonical test name (e.g. 'HBV DNA', 'HCV RNA', 'CMV PCR')" },
                        value:          { type: "string", description: "Primary result value — qualitative (Detected/Not Detected/Positive/Negative) for PCR tests, numeric for quantitative tests. Never leave empty if a result is present." },
                        unit:           { type: "string", description: "Unit of measurement, empty string if none" },
                        collectionDate: { type: "string", description: "ISO date string YYYY-MM-DD or empty string if not found" },
                        reportDate:     { type: "string", description: "ISO date string YYYY-MM-DD or empty string if not found" },
                        referenceRange: { type: "string", description: "Reference range as string or empty string" },
                        interpretation: { type: "string", description: "Interpretation such as Negative, Positive, Reactive, or empty string" },
                        viralLoad:      { type: "string", description: "Viral load numeric value for PCR tests (e.g. '12400'), empty string if not applicable" },
                        viralLoadUnit:  { type: "string", description: "Viral load unit (e.g. 'IU/mL', 'copies/mL'), empty string if not applicable" },
                        ctValue:        { type: "string", description: "Ct value for PCR tests (e.g. '29.4'), empty string if not applicable" },
                        genotype:       { type: "string", description: "Genotype for PCR tests (e.g. '1b', '3a'), empty string if not applicable" },
                        organism:       { type: "string", description: "Identified organism for culture tests (e.g. 'E. coli', 'Klebsiella pneumoniae'), empty string if not applicable" },
                        antibiogram:    { type: "string", description: "Antibiotic sensitivity summary for culture tests (e.g. 'Sensitive: Amoxicillin; Resistant: Ampicillin'), empty string if not applicable" },
                        colonyCount:    { type: "string", description: "Colony count for culture tests (e.g. '>100,000 CFU/mL'), empty string if not applicable" },
                        specimen:       { type: "string", description: "Specimen type for culture tests (e.g. 'Urine', 'Blood', 'Semen', 'Wound swab'), empty string if not applicable" },
                        conclusion:     { type: "string", description: "Overall conclusion or summary for culture/descriptive tests (e.g. 'No growth detected', 'Significant bacteriuria'), empty string if not applicable" },
                        fileIndex:      { type: "integer", description: "0-based index of the source file this result was extracted from. Use 0 if only one file or text input." },
                      },
                      required: ["testName", "value", "unit", "collectionDate", "reportDate", "referenceRange", "interpretation", "viralLoad", "viralLoadUnit", "ctValue", "genotype", "organism", "antibiogram", "colonyCount", "specimen", "conclusion", "fileIndex"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["results"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = res.choices?.[0]?.message?.content ?? '{"results":[]}';
        let parsed: any = { results: [] };
        try {
          parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
        } catch {
          // If JSON parse fails, return empty
        }
        // Filter only requires testName to be present; value can be any non-empty string (including qualitative like Negative/Positive)
        const rawResults = (parsed.results ?? []).filter((r: any) => r.testName && r.testName.trim());

        // ── PCR Post-processing: group stray PCR sub-rows that AI may have split ──
        // PCR parent tests: if we see rows like "HBV DNA Viral load" or "HBV DNA Ct value",
        // merge them back into the parent "HBV DNA" row.
        const PCR_PARENT_PATTERNS: Array<{ parent: string; subPatterns: RegExp[] }> = [
          { parent: "HBV DNA", subPatterns: [/hbv\s*dna\s*(viral\s*load|quantitative|quant|ct|pcr|copies|iu)/i] },
          { parent: "HCV RNA", subPatterns: [/hcv\s*(rna|viral\s*load|quantitative|quant|ct|pcr|copies|iu)/i] },
          { parent: "CMV PCR", subPatterns: [/cmv\s*(pcr|viral\s*load|quantitative|quant|ct|copies|iu)/i] },
          { parent: "EBV PCR", subPatterns: [/ebv\s*(pcr|viral\s*load|quantitative|quant|ct|copies|iu)/i] },
          { parent: "HPV DNA", subPatterns: [/hpv\s*(dna|type|genotype|high.risk|low.risk|\d+)/i] },
          { parent: "HIV RNA", subPatterns: [/hiv\s*(rna|viral\s*load|quantitative|quant|ct|copies|iu)/i] },
          { parent: "BK Virus PCR", subPatterns: [/bk\s*virus\s*(pcr|viral\s*load|quantitative|ct|copies|iu)/i] },
          { parent: "JC Virus PCR", subPatterns: [/jc\s*virus\s*(pcr|viral\s*load|quantitative|ct|copies|iu)/i] },
        ];

        const mergedResults: any[] = [];
        const usedIndices = new Set<number>();

        for (let i = 0; i < rawResults.length; i++) {
          if (usedIndices.has(i)) continue;
          const row = rawResults[i];
          const rowName = row.testName.trim();

          // Check if this row is a PCR parent
          const parentMatch = PCR_PARENT_PATTERNS.find(p =>
            rowName.toLowerCase().includes(p.parent.toLowerCase()) &&
            !p.subPatterns.some(sp => sp.test(rowName))
          );

          if (parentMatch) {
            // Look ahead for sub-rows belonging to this parent
            const mergedRow = { ...row };
            for (let j = i + 1; j < rawResults.length; j++) {
              if (usedIndices.has(j)) continue;
              const subRow = rawResults[j];
              const subName = subRow.testName.trim();
              const isSubRow = parentMatch.subPatterns.some(sp => sp.test(subName)) ||
                subName.toLowerCase().startsWith(parentMatch.parent.toLowerCase());
              if (isSubRow) {
                // Merge sub-row fields into parent
                const subNameLower = subName.toLowerCase();
                if (subNameLower.includes("viral load") || subNameLower.includes("quantitative") || subNameLower.includes("copies") || subNameLower.includes("iu")) {
                  if (!mergedRow.viralLoad && subRow.value) mergedRow.viralLoad = subRow.value;
                  if (!mergedRow.viralLoadUnit && subRow.unit) mergedRow.viralLoadUnit = subRow.unit;
                } else if (subNameLower.includes("ct") || subNameLower.includes("cycle threshold")) {
                  if (!mergedRow.ctValue && subRow.value) mergedRow.ctValue = subRow.value;
                } else if (subNameLower.includes("genotype")) {
                  if (!mergedRow.genotype && subRow.value) mergedRow.genotype = subRow.value;
                } else if (!mergedRow.value && subRow.value) {
                  // Use sub-row value as primary if parent has no value
                  mergedRow.value = subRow.value;
                }
                usedIndices.add(j);
              }
            }
            mergedResults.push(mergedRow);
          } else {
            // Check if this is a stray sub-row that should have been merged but wasn't
            const isStraySubRow = PCR_PARENT_PATTERNS.some(p =>
              p.subPatterns.some(sp => sp.test(rowName))
            );
            if (!isStraySubRow) {
              mergedResults.push(row);
            } else {
              // It's a stray sub-row — check if parent was already added
              const parentEntry = PCR_PARENT_PATTERNS.find(p =>
                p.subPatterns.some(sp => sp.test(rowName))
              );
              if (parentEntry) {
                const existingParent = mergedResults.find(r =>
                  r.testName.toLowerCase().includes(parentEntry.parent.toLowerCase())
                );
                if (existingParent) {
                  // Merge into existing parent
                  const subNameLower = rowName.toLowerCase();
                  if (subNameLower.includes("viral load") || subNameLower.includes("quantitative")) {
                    if (!existingParent.viralLoad && row.value) existingParent.viralLoad = row.value;
                    if (!existingParent.viralLoadUnit && row.unit) existingParent.viralLoadUnit = row.unit;
                  } else if (subNameLower.includes("ct")) {
                    if (!existingParent.ctValue && row.value) existingParent.ctValue = row.value;
                  } else if (subNameLower.includes("genotype")) {
                    if (!existingParent.genotype && row.value) existingParent.genotype = row.value;
                  }
                } else {
                  // No parent found — add as-is
                  mergedResults.push(row);
                }
              } else {
                mergedResults.push(row);
              }
            }
          }
        }

        // Normalize and match extracted test names to predefined canonical names + all existing patient tests
        const { matchTestName, normalizeDate, ALL_PREDEFINED_TESTS, levenshtein, isFuzzyMatch, hasSuffixConflict } = await import("../shared/labNormalize");
        // Build the full match pool: predefined + all existing patient test names (deduped)
        const existingTestNames: string[] = input.existingTestNames ?? [];
        const allMatchTargets = Array.from(new Set([...ALL_PREDEFINED_TESTS, ...existingTestNames]));

        // Also look up dictionary for result type and suggested module
        const { getDb: getDbConn } = await import("./db");
        const db = await getDbConn();
        const { labDictionary, labDictionaryAliases } = await import("../drizzle/schema");
        const { eq: eqOp, or: orOp, and: andOp, sql: sqlOp } = await import("drizzle-orm");

        /** 4-step dictionary lookup: exact canonical → exact alias → LIKE fuzzy → Levenshtein fuzzy */
        const lookupDictionaryEntry = async (name: string): Promise<{ id: number; resultType: string | null; suggestedModule: string | null; analyteGroup?: string | null; orderType?: string | null; canonicalName?: string; matchedVia?: string; matchConfidence?: number; lowConfidence?: boolean } | null> => {
          if (!db) return null;
          const normalizedName = name.trim().toLowerCase();
          // Strip spaces/punctuation for fuzzy comparison
          const strippedName = normalizedName.replace(/[\s\-_\.%#]/g, "");
          try {
            // Step 1: exact canonical (case-insensitive)
            const exact = await db
              .select({ id: labDictionary.id, resultType: labDictionary.resultType, suggestedModule: labDictionary.suggestedModule, analyteGroup: labDictionary.analyteGroup, orderType: labDictionary.orderType, canonicalName: labDictionary.canonicalName })
              .from(labDictionary)
              .where(andOp(eqOp(labDictionary.isActive, true), sqlOp`LOWER(${labDictionary.canonicalName}) = ${normalizedName}`))
              .limit(1);
            if (exact.length > 0 && !hasSuffixConflict(name, exact[0].canonicalName ?? '')) return { ...exact[0], matchedVia: 'exact', matchConfidence: 100, lowConfidence: false };

            // Step 2: exact alias match
            const aliasMatch = await db
              .select({ dictionaryId: labDictionaryAliases.dictionaryId, alias: labDictionaryAliases.alias })
              .from(labDictionaryAliases)
              .where(sqlOp`LOWER(${labDictionaryAliases.alias}) = ${normalizedName}`)
              .limit(1);
            if (aliasMatch.length > 0) {
              const [entry] = await db
                .select({ id: labDictionary.id, resultType: labDictionary.resultType, suggestedModule: labDictionary.suggestedModule, analyteGroup: labDictionary.analyteGroup, orderType: labDictionary.orderType, canonicalName: labDictionary.canonicalName })
                .from(labDictionary)
                .where(eqOp(labDictionary.id, aliasMatch[0].dictionaryId))
                .limit(1);
              if (entry && !hasSuffixConflict(name, entry.canonicalName ?? '')) return { ...entry, matchedVia: `alias:${aliasMatch[0].alias}`, matchConfidence: 95, lowConfidence: false };
            }

            // Step 3: LIKE fuzzy on canonical / display / abbreviation
            // BLOCKED if suffix conflict (# vs %)
            const likeFuzzy = await db
              .select({ id: labDictionary.id, resultType: labDictionary.resultType, suggestedModule: labDictionary.suggestedModule, analyteGroup: labDictionary.analyteGroup, orderType: labDictionary.orderType, canonicalName: labDictionary.canonicalName })
              .from(labDictionary)
              .where(andOp(
                eqOp(labDictionary.isActive, true),
                orOp(
                  sqlOp`LOWER(${labDictionary.canonicalName}) LIKE ${`%${normalizedName}%`}`,
                  sqlOp`LOWER(${labDictionary.displayName}) LIKE ${`%${normalizedName}%`}`,
                  sqlOp`LOWER(${labDictionary.abbreviation}) LIKE ${`%${normalizedName}%`}`,
                )
              ))
              .limit(5); // get top 5 to filter by suffix
            const likeFiltered = likeFuzzy.filter(e => !hasSuffixConflict(name, e.canonicalName ?? ''));
            if (likeFiltered.length > 0) return { ...likeFiltered[0], matchedVia: 'like', matchConfidence: 88, lowConfidence: false };

            // Step 4: Levenshtein fuzzy — load all active entries and find closest match
            // Also checks stripped versions (removes spaces/punctuation) to catch "Neutrophil%" vs "Neutrophil %"
            const allEntries = await db
              .select({ id: labDictionary.id, resultType: labDictionary.resultType, suggestedModule: labDictionary.suggestedModule, analyteGroup: labDictionary.analyteGroup, orderType: labDictionary.orderType, canonicalName: labDictionary.canonicalName, displayName: labDictionary.displayName, abbreviation: labDictionary.abbreviation })
              .from(labDictionary)
              .where(eqOp(labDictionary.isActive, true));

            let bestEntry: typeof allEntries[0] | null = null;
            let bestDist = Infinity;
            let bestMatchedAlias: string | null = null;
            for (const entry of allEntries) {
              // Block suffix conflicts: Neutrophil# must never match Neutrophil %
              if (hasSuffixConflict(name, entry.canonicalName ?? '')) continue;
              const candidates = [
                entry.canonicalName?.toLowerCase() ?? "",
                entry.displayName?.toLowerCase() ?? "",
                entry.abbreviation?.toLowerCase() ?? "",
                // stripped versions (no spaces/punctuation)
                (entry.canonicalName?.toLowerCase() ?? "").replace(/[\s\-_\.%#]/g, ""),
                (entry.displayName?.toLowerCase() ?? "").replace(/[\s\-_\.%#]/g, ""),
              ].filter(Boolean);

              for (const candidate of candidates) {
                // Check both original and stripped
                for (const testStr of [normalizedName, strippedName]) {
                  const maxLen = Math.max(testStr.length, candidate.length);
                  // Tighter threshold: max 2 edits, require 75% similarity
                  const threshold = Math.min(2, Math.max(1, Math.floor(maxLen / 10)));
                  const dist = levenshtein(testStr, candidate);
                  const similarity = 1 - dist / maxLen;
                  if (dist <= threshold && similarity >= 0.75 && dist < bestDist) {
                    bestDist = dist;
                    bestEntry = entry;
                    bestMatchedAlias = candidate;
                  }
                }
              }
            }
            if (bestEntry) {
              const maxLen = Math.max(normalizedName.length, (bestMatchedAlias ?? '').length);
              const confidence = Math.round((1 - bestDist / maxLen) * 100);
              return { ...bestEntry, matchedVia: `fuzzy:${bestMatchedAlias}`, matchConfidence: confidence, lowConfidence: confidence < 85 };
            }

          } catch {
            // best-effort
          }
          return null;
        };

        const enriched = await Promise.all(mergedResults.map(async (r: any) => {
          const match = matchTestName(r.testName, allMatchTargets);
          // Normalize dates: handle DD/MM/YYYY → YYYY-MM-DD
          const collectionDate = normalizeDate(r.collectionDate ?? "") || (r.collectionDate ?? "");
          const reportDate = normalizeDate(r.reportDate ?? "") || (r.reportDate ?? "");

          // Look up dictionary entry for result type — try canonical name first, then raw AI name
          let dictionaryId: number | null = null;
          let resultType: string | null = null;
          let suggestedModule: string | null = null;
          const dictEntry = await lookupDictionaryEntry(match.canonicalName ?? r.testName)
            ?? (match.canonicalName ? await lookupDictionaryEntry(r.testName) : null);
          let analyteGroup: string | null = null;
          let orderType: string | null = null;
          if (dictEntry) {
            dictionaryId = dictEntry.id;
            resultType = dictEntry.resultType ?? null;
            suggestedModule = dictEntry.suggestedModule ?? null;
            analyteGroup = dictEntry.analyteGroup ?? null;
            orderType = dictEntry.orderType ?? null;
          }

          // Build extraFields for PCR and Culture tests
          const extraFields: Record<string, string> = {};
          if (r.viralLoad) extraFields.viralLoad = r.viralLoad;
          if (r.viralLoadUnit) extraFields.viralLoadUnit = r.viralLoadUnit;
          if (r.ctValue) extraFields.ctValue = r.ctValue;
          if (r.genotype) extraFields.genotype = r.genotype;
          if (r.organism) extraFields.organism = r.organism;
          if (r.antibiogram) extraFields.antibiogram = r.antibiogram;
          if (r.colonyCount) extraFields.colonyCount = r.colonyCount;
          if (r.specimen) extraFields.specimen = r.specimen;
          if (r.conclusion) extraFields.conclusion = r.conclusion;

          // Determine needsReview:
          // Flag as needsReview if: no dictionary match, OR low-confidence fuzzy match.
          // IMPORTANT: if dictEntry found a confident match (exact canonical or exact alias),
          // that overrides any low-confidence signal from the predefined matchTestName.
          const isKnownTest = !!dictionaryId;
          const dictIsConfident = !!dictEntry && !(dictEntry.lowConfidence ?? false);
          const isLowConfidence = dictIsConfident
            ? false  // dictionary found a confident match — trust it, don't flag for review
            : (dictEntry?.lowConfidence ?? false) || (match.lowConfidence ?? false);
          const needsReview = (!isKnownTest && !match.isMatched) || isLowConfidence;
          const reviewReason = !match.isMatched && !isKnownTest
            ? "unmatched_test_name"
            : isLowConfidence
            ? "low_confidence_match"
            : !resultType && !isKnownTest
            ? "missing_result_type"
            : undefined;

          // If dictionary found a canonical name but predefined match didn't, use dictionary's canonical name
          const resolvedCanonicalName = match.canonicalName ?? dictEntry?.canonicalName ?? null;
          const resolvedIsMatched = match.isMatched || !!dictionaryId;

          // Build matchedVia string for UI display:
          // Shows how the match was made: 'exact', 'alias:xyz', 'like', 'fuzzy:xyz'
          const matchedVia = dictEntry?.matchedVia ?? (match.matchType && match.matchType !== 'none' ? match.matchType : undefined);
          const matchConfidence = dictEntry?.matchConfidence ?? match.confidence ?? (resolvedIsMatched ? 100 : 0);

          // Check if the ORIGINAL raw name (r.testName) is already a confirmed alias in the dictionary.
          // This prevents the Alias Suggestions Banner from showing names that are already known aliases.
          // (dictEntry may have been found via match.canonicalName, not r.testName directly)
          // IMPORTANT: if originalNameIsAlias=true, we also override needsReview and lowConfidence to false
          // so the row is treated as fully Matched — no review required, no alias suggestion.
          let originalNameIsAlias = false;
          let aliasMatchedDictionaryId: number | null = null;
          if (db && r.testName) {
            const rawLower = r.testName.trim().toLowerCase();
            const canonLower = (resolvedCanonicalName ?? "").toLowerCase();
            if (rawLower !== canonLower) {
              // Only check if raw name differs from canonical (otherwise it's an exact match, not an alias)
              const aliasCheck = await db
                .select({ id: labDictionaryAliases.id, dictionaryId: labDictionaryAliases.dictionaryId })
                .from(labDictionaryAliases)
                .where(sqlOp`LOWER(${labDictionaryAliases.alias}) = ${rawLower}`)
                .limit(1);
              if (aliasCheck.length > 0) {
                originalNameIsAlias = true;
                aliasMatchedDictionaryId = aliasCheck[0].dictionaryId;
              }
            }
          }

          // Resolve per-file source info from fileIndex
          const fileIdx = typeof r.fileIndex === 'number' ? r.fileIndex : 0;
          const sourceFile = input.files?.[fileIdx];
          const sourceFileName = sourceFile?.name ?? undefined;
          const sourceFileKey = sourceFile?.key ?? undefined;
          const sourceFileUrl = sourceFile?.url ?? undefined;

          // If the raw name is already a confirmed alias, treat as fully Matched:
          // override needsReview=false, lowConfidence=false, matchedVia=alias:<name>
          // Also use the alias's dictionaryId if we didn't have one already.
          const finalNeedsReview = originalNameIsAlias ? false : needsReview;
          const finalLowConfidence = originalNameIsAlias ? false : isLowConfidence;
          const finalMatchedVia = originalNameIsAlias
            ? `alias:${r.testName.trim()}`
            : matchedVia;
          const finalDictionaryId = originalNameIsAlias && !dictionaryId && aliasMatchedDictionaryId
            ? aliasMatchedDictionaryId
            : dictionaryId;
          const finalIsMatched = originalNameIsAlias ? true : resolvedIsMatched;
          const finalReviewReason = originalNameIsAlias ? undefined : reviewReason;

          return {
            ...r,
            collectionDate,
            reportDate,
            matchedTestName: resolvedCanonicalName,  // canonical from predefined OR dictionary
            isMatched: finalIsMatched,
            normalizedRaw: match.normalizedRaw,      // for debugging
            dictionaryId: finalDictionaryId,
            resultType,
            suggestedModule,
            analyteGroup,
            orderType,
            extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
            needsReview: finalNeedsReview,
            reviewReason: finalReviewReason,
            matchedVia: finalMatchedVia,
            matchConfidence: originalNameIsAlias ? 95 : matchConfidence,
            lowConfidence: finalLowConfidence,
            originalNameIsAlias, // true if raw name is already a confirmed alias
            sourceFileName,    // original file name for UI display
            sourceFileKey,     // storage key for the source file
            sourceFileUrl,     // storage URL for the source file
          };
        }));

        return { results: enriched };
      }),

    autoInvoice: staffOrAdminProcedure
      .input(z.object({ labOrderId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // Fetch the lab order
        const orders = await getLabOrders(undefined, undefined);
        const order = orders.find((o: any) => o.id === input.labOrderId);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Lab order not found" });
        if (!order.patientId) throw new TRPCError({ code: "BAD_REQUEST", message: "Lab order has no patient" });

        // Fetch service price if linked
        let unitPrice = "0";
        let description = (order as any).testName;
        const serviceId = (order as any).serviceId;
        if (serviceId) {
          const services = await getAllServices();
          const svc = services.find((s: any) => s.id === serviceId);
          if (svc) {
            unitPrice = svc.localPriceTRY ?? svc.price ?? "0";
          }
        }

        const invoiceNumber = `INV-LAB-${Date.now()}`;
        const result = await createInvoice({
          patientId: order.patientId,
          invoiceNumber,
          subtotal: unitPrice,
          totalAmount: unitPrice,
          notes: `Auto-generated from lab order ${order.orderNumber}`,
          createdById: ctx.user.id,
          items: [{
            description,
            quantity: 1,
            unitPrice,
            totalPrice: unitPrice,
            serviceId: serviceId ?? undefined,
          }],
        } as any);
        // Update lab order with invoice reference
        if (result?.id) {
          await updateLabOrder(input.labOrderId, { invoiceId: result.id, invoiceStatus: "issued" } as any);
        }
        return { invoiceId: result?.id, invoiceNumber };
      }),

    // ─── AI Import Draft persistence ──────────────────────────────────────────
    saveDraft: protectedProcedure
      .input(z.object({
        draftKey: z.string().min(1).max(256),
        step: z.enum(["input", "preview"]).default("input"),
        pasteText: z.string().optional(),
        uploadedFiles: z.any().optional(),
        rows: z.any().optional(),
        selectedIds: z.any().optional(),
        matchOverrides: z.any().optional(),
        manualMatchAliasOptIn: z.any().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { aiImportDrafts } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const existing = await db.select({ id: aiImportDrafts.id })
          .from(aiImportDrafts)
          .where(and(eq(aiImportDrafts.draftKey, input.draftKey), eq(aiImportDrafts.userId, ctx.user.id)))
          .limit(1);
        if (existing.length > 0) {
          await db.update(aiImportDrafts)
            .set({
              step: input.step,
              pasteText: input.pasteText ?? null,
              uploadedFiles: (input.uploadedFiles ?? null) as any,
              rows: (input.rows ?? null) as any,
              selectedIds: (input.selectedIds ?? null) as any,
              matchOverrides: (input.matchOverrides ?? null) as any,
              manualMatchAliasOptIn: (input.manualMatchAliasOptIn ?? null) as any,
              lastSavedAt: new Date(),
            })
            .where(eq(aiImportDrafts.id, existing[0].id));
        } else {
          await db.insert(aiImportDrafts).values({
            draftKey: input.draftKey,
            userId: ctx.user.id,
            step: input.step,
            pasteText: input.pasteText ?? null,
            uploadedFiles: (input.uploadedFiles ?? null) as any,
            rows: (input.rows ?? null) as any,
            selectedIds: (input.selectedIds ?? null) as any,
            matchOverrides: (input.matchOverrides ?? null) as any,
            manualMatchAliasOptIn: (input.manualMatchAliasOptIn ?? null) as any,
          });
        }
        return { ok: true };
      }),

    loadDraft: protectedProcedure
      .input(z.object({ draftKey: z.string().min(1).max(256) }))
      .query(async ({ input, ctx }) => {
        const { aiImportDrafts } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) return null;
        const draftRows = await db.select()
          .from(aiImportDrafts)
          .where(and(eq(aiImportDrafts.draftKey, input.draftKey), eq(aiImportDrafts.userId, ctx.user.id)))
          .limit(1);
        if (draftRows.length === 0) return null;
        return draftRows[0];
      }),

    deleteDraft: protectedProcedure
      .input(z.object({ draftKey: z.string().min(1).max(256) }))
      .mutation(async ({ input, ctx }) => {
        const { aiImportDrafts } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        await db.delete(aiImportDrafts)
          .where(and(eq(aiImportDrafts.draftKey, input.draftKey), eq(aiImportDrafts.userId, ctx.user.id)));
        return { ok: true };
      }),
  }),
  // ─── Notifications ────────────────────────────────────────────────────────────────
  notifications: router({  list: protectedProcedure.query(({ ctx }) => getUserNotifications(ctx.user.id)),
    unreadCount: protectedProcedure.query(({ ctx }) => getUnreadNotificationCount(ctx.user.id)),
    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => markNotificationRead(input.id)),
    markAllRead: protectedProcedure.mutation(({ ctx }) => markAllNotificationsRead(ctx.user.id)),
  }),

  // ─── Messages ────────────────────────────────────────────────────────────────
  messages: router({
    list: protectedProcedure.query(({ ctx }) => getUserMessages(ctx.user.id)),
  }),

  // Read-only, channel-neutral Inbox projection. The current implementation
  // projects Linked Device Conversations only; future channels can reuse this
  // contract without changing the Conversation data model.
  inbox: router({
    conversations: staffOrAdminProcedure
      .input(z.object({
        resolution: z.enum(["all", "unresolved", "known"]).optional(),
        search: z.string().max(80).optional(),
        operational: z.enum(["all", "unread", "assigned_to_me", "unassigned", "new_contacts", "known_contacts"]).optional(),
        lineId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const { listUnifiedInboxConversations } = await import("./unifiedInbox");
        return listUnifiedInboxConversations(input, { id: ctx.user.id, role: ctx.user.role });
      }),
    conversationDetail: staffOrAdminProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const { getUnifiedInboxConversationDetail } = await import("./unifiedInbox");
        return getUnifiedInboxConversationDetail(input.conversationId, { id: ctx.user.id, role: ctx.user.role });
      }),
    operationalContext: staffOrAdminProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const { getOperationalInboxContext } = await import("./operationalInbox");
        return getOperationalInboxContext(input.conversationId, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null });
      }),
    markRead: staffOrAdminProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const actor = { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null };
        const { markInboxConversationRead } = await import("./operationalInbox");
        const result = await markInboxConversationRead(input.conversationId, actor, true);
        const { markZernioConversationRead } = await import("./zernio/send");
        await markZernioConversationRead({ conversationId: input.conversationId, actor }).catch((error) => {
          console.warn("[zernio] read receipt skipped", error instanceof Error ? error.name : "error");
        });
        return result;
      }),
    markUnread: staffOrAdminProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const { markInboxConversationRead } = await import("./operationalInbox");
        return markInboxConversationRead(input.conversationId, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null }, false);
      }),
    assign: staffOrAdminProcedure
      .input(z.object({ conversationId: z.number().int().positive(), assignedUserId: z.number().int().positive().nullable() }))
      .mutation(async ({ input, ctx }) => {
        const { assignInboxConversation } = await import("./operationalInbox");
        return assignInboxConversation(input.conversationId, input.assignedUserId, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null });
      }),
    assignToMe: staffOrAdminProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const { assignInboxConversation } = await import("./operationalInbox");
        return assignInboxConversation(input.conversationId, ctx.user.id, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null });
      }),
    searchCrm: staffOrAdminProcedure
      .input(z.object({ query: z.string().min(1).max(80) }))
      .query(async ({ input, ctx }) => {
        const { searchInboxCrmRecords } = await import("./operationalInbox");
        return searchInboxCrmRecords(input.query, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null });
      }),
    newConversationLines: staffOrAdminProcedure
      .query(async ({ ctx }) => {
        const { listInboxNewConversationLines } = await import("./operationalInbox");
        return listInboxNewConversationLines({ id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null });
      }),
    eligibleSyntheticTestRecipients: staffOrAdminProcedure
      .input(z.object({ lineId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const { listInboxEligibleSyntheticTestRecipients } = await import("./operationalInbox");
        return listInboxEligibleSyntheticTestRecipients({ ...input, actor: { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null } });
      }),
    syntheticTestRecipients: adminProcedure
      .input(z.object({ lineId: z.number().int().positive().optional() }).optional())
      .query(async ({ input, ctx }) => {
        const { listInboxSyntheticTestRecipients } = await import("./operationalInbox");
        return listInboxSyntheticTestRecipients({ lineId: input?.lineId, actor: { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null } });
      }),
    approveSyntheticTestRecipient: adminProcedure
      .input(z.object({ lineId: z.number().int().positive(), phone: z.string().trim().min(1).max(32), label: z.string().trim().max(128).optional() }))
      .mutation(async ({ input, ctx }) => {
        const { approveInboxSyntheticTestRecipient } = await import("./operationalInbox");
        return approveInboxSyntheticTestRecipient({ ...input, actor: { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null } });
      }),
    revokeSyntheticTestRecipient: adminProcedure
      .input(z.object({ recipientId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const { revokeInboxSyntheticTestRecipient } = await import("./operationalInbox");
        return revokeInboxSyntheticTestRecipient({ ...input, actor: { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null } });
      }),
    newConversationSearch: staffOrAdminProcedure
      .input(z.object({ query: z.string().trim().min(1).max(80) }))
      .query(async ({ input, ctx }) => {
        const { searchInboxNewConversationTargets } = await import("./operationalInbox");
        return searchInboxNewConversationTargets(input.query, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null });
      }),
    newConversationRecord: staffOrAdminProcedure
      .input(z.object({ recordType: z.enum(["person", "lead", "patient"]), recordId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const { getInboxNewConversationRecordTarget } = await import("./operationalInbox");
        return getInboxNewConversationRecordTarget({ ...input, actor: { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null } });
      }),
    prepareNewConversation: staffOrAdminProcedure
      .input(z.object({
        lineId: z.number().int().positive(),
        phone: z.string().trim().max(32).optional(),
        approvedRecipientId: z.number().int().positive().optional(),
        record: z.object({
          recordType: z.enum(["person", "lead", "patient"]).optional(),
          recordId: z.number().int().positive().optional(),
          phoneKey: z.string().trim().max(80).optional(),
        }).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { prepareInboxNewConversation } = await import("./operationalInbox");
        return prepareInboxNewConversation({ ...input, actor: { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null } });
      }),
    startNewConversation: staffOrAdminProcedure
      .input(z.object({
        lineId: z.number().int().positive(),
        phone: z.string().trim().max(32).optional(),
        approvedRecipientId: z.number().int().positive().optional(),
        record: z.object({
          recordType: z.enum(["person", "lead", "patient"]).optional(),
          recordId: z.number().int().positive().optional(),
          phoneKey: z.string().trim().max(80).optional(),
        }).optional(),
        text: z.string().trim().min(1, "Enter a message before sending.").max(UNIFIED_INBOX_TEXT_LIMIT, UNIFIED_INBOX_TEXT_LIMIT_MESSAGE),
        linkRecord: z.boolean().default(false),
        idempotencyKey: z.string().trim().min(8, "Refresh the Inbox and try again.").max(128),
        clientActionId: z.string().trim().min(8, "Refresh the Inbox and try again.").max(64).regex(/^[A-Za-z0-9._:-]+$/),
      }))
      .mutation(async ({ input, ctx }) => {
        const { startInboxNewConversation } = await import("./operationalInbox");
        return startInboxNewConversation({ ...input, actor: { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null } });
      }),
    linkExisting: staffOrAdminProcedure
      .input(z.object({ conversationId: z.number().int().positive(), recordType: z.enum(["person", "lead", "patient"]), recordId: z.number().int().positive(), confirmReassignment: z.boolean().default(false) }))
      .mutation(async ({ input, ctx }) => {
        const { linkInboxConversationRecord } = await import("./operationalInbox");
        return linkInboxConversationRecord({ ...input, actor: { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null } });
      }),
    createLeadAndLink: staffOrAdminProcedure
      .input(z.object({ conversationId: z.number().int().positive(), firstName: z.string().trim().min(1).max(128), lastName: z.string().trim().min(1).max(128), phone: z.string().trim().max(32).optional(), relationshipRole: z.enum(["patient", "husband", "wife", "representative", "family", "translator", "other"]).default("other") }))
      .mutation(async ({ input, ctx }) => {
        const { createLeadAndLinkInboxConversation } = await import("./operationalInbox");
        return createLeadAndLinkInboxConversation({ ...input, actor: { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null } });
      }),
    linkCase: staffOrAdminProcedure
      .input(z.object({ conversationId: z.number().int().positive(), caseId: z.number().int().positive(), relationshipRole: z.enum(["patient", "husband", "wife", "representative", "family", "translator", "other"]) }))
      .mutation(async ({ input, ctx }) => {
        const { linkInboxConversationCase } = await import("./operationalInbox");
        return linkInboxConversationCase({ ...input, actor: { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null } });
      }),
    unlinkExisting: staffOrAdminProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const { unlinkInboxConversationRecord } = await import("./operationalInbox");
        return unlinkInboxConversationRecord(input.conversationId, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null });
      }),
    unlinkCase: staffOrAdminProcedure
      .input(z.object({ conversationId: z.number().int().positive(), caseId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const { unlinkInboxConversationCase } = await import("./operationalInbox");
        return unlinkInboxConversationCase({ ...input, actor: { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null } });
      }),
    sendText: staffOrAdminProcedure
      .input(z.object({ conversationId: z.number().int().positive(), text: z.string().trim().min(1, "Enter a message before sending.").max(UNIFIED_INBOX_TEXT_LIMIT, UNIFIED_INBOX_TEXT_LIMIT_MESSAGE), idempotencyKey: z.string().trim().min(8, "Refresh the Inbox and try again.").max(128), clientActionId: z.string().trim().min(8, "Refresh the Inbox and try again.").max(64).regex(/^[A-Za-z0-9._:-]+$/) }))
      .mutation(async ({ input, ctx }) => {
        const actor = { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null };
        const { sendZernioInboxText } = await import("./zernio/send");
        const zernio = await sendZernioInboxText({ ...input, actor });
        if (zernio) return zernio;
        const { sendInboxSyntheticText } = await import("./operationalInbox");
        return sendInboxSyntheticText({ ...input, actor });
      }),
    prepareMediaUpload: staffOrAdminProcedure
      .input(z.object({
        conversationId: z.number().int().positive(),
        filename: z.string().trim().min(1).max(512),
        mimeType: z.string().trim().min(1).max(128),
        byteSize: z.number().int().positive().max(16_000_000),
      }))
      .mutation(async ({ input, ctx }) => {
        const { prepareZernioMediaUpload } = await import("./zernio/send");
        return prepareZernioMediaUpload({ ...input, actor: { id: ctx.user.id, role: ctx.user.role } });
      }),
    uploadMediaPart: staffOrAdminProcedure
      .input(z.object({
        conversationId: z.number().int().positive(),
        storageKey: z.string().trim().min(20).max(180).regex(/^whatsapp-outbound\/[A-Za-z0-9_-]{6,64}\/[a-f0-9]{32}\/[A-Za-z0-9._-]{1,80}$/),
        uploadId: z.string().trim().min(8).max(800),
        partNumber: z.number().int().min(1).max(8),
        fileBase64: z.string().min(1).max(3_000_000),
      }))
      .mutation(async ({ input, ctx }) => {
        const { uploadZernioMediaPart } = await import("./zernio/send");
        return uploadZernioMediaPart({ ...input, actor: { id: ctx.user.id, role: ctx.user.role } });
      }),
    abortMediaUpload: staffOrAdminProcedure
      .input(z.object({
        conversationId: z.number().int().positive(),
        storageKey: z.string().trim().min(20).max(180),
        uploadId: z.string().trim().min(8).max(800),
      }))
      .mutation(async ({ input, ctx }) => {
        const { abortZernioMediaUpload } = await import("./zernio/send");
        return abortZernioMediaUpload({ ...input, actor: { id: ctx.user.id, role: ctx.user.role } });
      }),
    sendMedia: staffOrAdminProcedure
      .input(z.object({
        conversationId: z.number().int().positive(),
        fileBase64: z.string().min(1, "Choose an attachment before sending.").optional(),
        storageKey: z.string().trim().min(20).max(180).regex(/^whatsapp-outbound\/[A-Za-z0-9_-]{6,64}\/[a-f0-9]{32}\/[A-Za-z0-9._-]{1,80}$/).optional(),
        uploadId: z.string().trim().min(8).max(800).optional(),
        byteSize: z.number().int().positive().max(16_000_000).optional(),
        mimeType: z.string().trim().min(1).max(128),
        filename: z.string().trim().min(1).max(512),
        caption: z.string().trim().max(UNIFIED_INBOX_TEXT_LIMIT, UNIFIED_INBOX_TEXT_LIMIT_MESSAGE).optional(),
        idempotencyKey: z.string().trim().min(8, "Refresh the Inbox and try again.").max(128),
        clientActionId: z.string().trim().min(8, "Refresh the Inbox and try again.").max(64).regex(/^[A-Za-z0-9._:-]+$/),
      }).refine((value) => {
        const inline = Boolean(value.fileBase64);
        const direct = Boolean(value.storageKey);
        return inline !== direct && (!direct || Boolean(value.byteSize));
      }, { message: "Choose an attachment before sending." }))
      .mutation(async ({ input, ctx }) => {
        const actor = { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null };
        const { sendZernioInboxMedia } = await import("./zernio/send");
        const zernio = await sendZernioInboxMedia({ ...input, actor });
        if (zernio) return zernio;
        if (!input.fileBase64) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an attachment before sending." });
        }
        const { sendInboxSyntheticMedia } = await import("./operationalInbox");
        return sendInboxSyntheticMedia({ ...input, fileBase64: input.fileBase64, actor });
      }),
    whatsappConnection: staffOrAdminProcedure.query(async () => {
      try {
        const { connectedZernioSummary } = await import("./zernio/store");
        return await connectedZernioSummary();
      } catch (error) {
        console.error("[zernio] connection status failed", error instanceof Error ? error.name : "error");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "WhatsApp status could not be loaded." });
      }
    }),
    connectWhatsApp: staffOrAdminProcedure
      .input(z.object({ popup: z.boolean().optional() }).optional())
      .mutation(async ({ ctx, input }) => {
      const host = String(ctx.req.headers.host ?? "");
      if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This site address cannot be used for WhatsApp connect." });
      }
      const origin = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? `http://${host}` : `https://${host}`;
      const { buildZernioConnectUrl } = await import("./zernio/connect");
      const url = await buildZernioConnectUrl({ userId: ctx.user.id, origin, popup: input?.popup === true });
      console.info("[zernio] connect url issued", { popup: input?.popup === true, userId: ctx.user.id });
      return { url };
    }),
    disconnectWhatsApp: staffOrAdminProcedure.mutation(async () => {
      try {
        const { disconnectZernioWhatsApp } = await import("./zernio/store");
        return await disconnectZernioWhatsApp();
      } catch (error) {
        if (error instanceof Error && error.message === "whatsapp_not_connected") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "WhatsApp is not connected." });
        }
        console.error("[zernio] disconnect failed", error instanceof Error ? error.name : "error");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "WhatsApp could not be disconnected." });
      }
    }),
    sendTemplate: staffOrAdminProcedure
      .input(z.object({
        conversationId: z.number().int().positive(),
        templateName: z.string().trim().min(1).max(128).regex(/^[a-z0-9_]+$/),
        language: z.string().trim().min(2).max(16),
        variables: z.array(z.string().max(512)).max(10),
        idempotencyKey: z.string().trim().min(8).max(128),
      }))
      .mutation(async ({ input, ctx }) => {
        const { sendZernioInboxTemplate } = await import("./zernio/send");
        return sendZernioInboxTemplate({ ...input, actor: { id: ctx.user.id, role: ctx.user.role } });
      }),
    react: staffOrAdminProcedure
      .input(z.object({
        conversationId: z.number().int().positive(),
        providerMessageId: z.string().trim().min(1).max(128),
        emoji: z.string().trim().min(1).max(16),
      }))
      .mutation(async ({ input, ctx }) => {
        const { reactToZernioMessage } = await import("./zernio/send");
        return reactToZernioMessage({ ...input, actor: { id: ctx.user.id, role: ctx.user.role } });
      }),
    typing: staffOrAdminProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const { notifyZernioTyping } = await import("./zernio/send");
        return notifyZernioTyping({ conversationId: input.conversationId, actor: { id: ctx.user.id, role: ctx.user.role } });
      }),
    activity: staffOrAdminProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const { getInboxConversationActivity } = await import("./operationalInbox");
        return getInboxConversationActivity(input.conversationId, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null });
      }),
    setTag: staffOrAdminProcedure
      .input(z.object({ conversationId: z.number().int().positive(), tag: z.string().trim().min(1).max(64), enabled: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const { setInboxConversationTag } = await import("./operationalInbox");
        return setInboxConversationTag({ ...input, actor: { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null } });
      }),
    mediaAccess: staffOrAdminProcedure
      .input(z.object({ conversationId: z.number().int().positive(), mediaId: z.number().int().positive(), action: z.enum(["open", "download"]) }))
      .mutation(async ({ input, ctx }) => {
        const { requestInboxMediaAccess } = await import("./operationalInbox");
        return requestInboxMediaAccess({ ...input, actor: { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null } });
      }),
    notificationPreferences: protectedProcedure.query(async ({ ctx }) => {
      const { getInboxNotificationPreferences } = await import("./whatsappOperationalNotifications");
      return getInboxNotificationPreferences(ctx.user.id);
    }),
    updateNotificationPreferences: protectedProcedure
      .input(z.object({ notifyNewConversation: z.boolean(), notifyNewMessage: z.boolean(), notifyAssignment: z.boolean(), notifyHealth: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const { updateInboxNotificationPreferences } = await import("./whatsappOperationalNotifications");
        return updateInboxNotificationPreferences(ctx.user.id, input);
      }),
    policies: adminProcedure.query(async ({ ctx }) => {
      const { getInboxPolicies } = await import("./operationalInbox");
      return getInboxPolicies({ id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null });
    }),
    updatePolicies: adminProcedure
      .input(z.object({ policies: z.object({ phoneVisibility: z.enum(["full_authorized", "mask_selected_roles", "admin_only_full"]), newSenderBehavior: z.enum(["conversation_only", "create_contact", "create_lead"]), exactPhoneMatch: z.enum(["suggest", "auto_link_trusted", "never_auto_link"]), duplicateDetection: z.enum(["suggest", "require_confirmation"]), caseSuggestions: z.boolean(), automaticPatient: z.boolean(), automaticMrn: z.boolean(), automaticClinicalRecord: z.boolean() }) }))
      .mutation(async ({ input, ctx }) => {
        const { updateInboxPolicies } = await import("./operationalInbox");
        return updateInboxPolicies({ ...input, actor: { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null } });
      }),
  }),

  whatsappPlatform: router({
    connectedNumbers: staffOrAdminProcedure.query(async ({ ctx }) => {
      const { listConnectedWhatsAppNumbers } = await import("./whatsappConnectionsPlatform");
      return listConnectedWhatsAppNumbers({ id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null });
    }),
    embeddedSignupReadiness: adminProcedure.query(async () => {
      const { getEmbeddedSignupReadiness } = await import("./whatsappConnectionsPlatform");
      return getEmbeddedSignupReadiness();
    }),
    acknowledgeCoexistenceResearch: adminProcedure.mutation(async ({ ctx }) => {
      const { acknowledgeCoexistenceResearch } = await import("./whatsappConnectionsPlatform");
      return acknowledgeCoexistenceResearch({ id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null });
    }),
    sessionMonitor: adminProcedure.query(async ({ ctx }) => {
      const { listLinkedDeviceSessionMonitoring } = await import("./whatsappConnectionsPlatform");
      return listLinkedDeviceSessionMonitoring({ id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null });
    }),
    refreshSessionHealth: adminProcedure
      .input(z.object({ lineId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const { refreshLinkedDeviceMonitor } = await import("./whatsappConnectionsPlatform");
        return refreshLinkedDeviceMonitor(input.lineId, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name ?? null });
      }),
  }),

  // Gold standalone WhatsApp Engine. This intentionally persists only its
  // selected-chat communication model and does not route through frozen Linked
  // Device or Unified Inbox transport paths.
  wppConnect: router({
    listConnections: staffOrAdminProcedure.query(async ({ ctx }) => {
      const { listWppConnections } = await import("./wppConnectIntegration");
      return listWppConnections({ id: ctx.user.id, role: ctx.user.role, name: ctx.user.name });
    }),
    createConnection: staffOrAdminProcedure
      .input(z.object({ lineName: z.string().trim().min(2).max(128).optional() }))
      .mutation(async ({ input, ctx }) => {
        const { createWppConnection } = await import("./wppConnectIntegration");
        return createWppConnection({ lineName: input.lineName, actor: { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name } });
      }),
    status: staffOrAdminProcedure
      .input(z.object({ connectionId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const { getWppConnectionStatus } = await import("./wppConnectIntegration");
        return getWppConnectionStatus(input.connectionId, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name });
      }),
    reconnect: staffOrAdminProcedure
      .input(z.object({ connectionId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const { reconnectWppConnection } = await import("./wppConnectIntegration");
        return reconnectWppConnection(input.connectionId, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name });
      }),
    disconnect: staffOrAdminProcedure
      .input(z.object({ connectionId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const { disconnectWppConnection } = await import("./wppConnectIntegration");
        return disconnectWppConnection(input.connectionId, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name });
      }),
    discoverChats: staffOrAdminProcedure
      .input(z.object({ connectionId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const { discoverWppChats } = await import("./wppConnectIntegration");
        return discoverWppChats(input.connectionId, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name });
      }),
    addChats: staffOrAdminProcedure
      .input(z.object({
        connectionId: z.number().int().positive(),
        chats: z.array(z.object({ externalChatId: z.string().trim().min(1).max(191), phone: z.string().trim().min(1).max(32), name: z.string().trim().max(256).optional() })).min(1).max(50),
      }))
      .mutation(async ({ input, ctx }) => {
        const { addWppChats } = await import("./wppConnectIntegration");
        return addWppChats(input.connectionId, input.chats, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name });
      }),
    staff: staffOrAdminProcedure
      .input(z.object({ connectionId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const { getWppConnectionStaff } = await import("./wppConnectIntegration");
        return getWppConnectionStaff(input.connectionId, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name });
      }),
    updateStaff: adminProcedure
      .input(z.object({ connectionId: z.number().int().positive(), authorizedStaffIds: z.array(z.number().int().positive()).min(1).max(100) }))
      .mutation(async ({ input, ctx }) => {
        const { updateWppConnectionStaff } = await import("./wppConnectIntegration");
        return updateWppConnectionStaff(input.connectionId, input.authorizedStaffIds, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name });
      }),
    allowedChats: staffOrAdminProcedure
      .input(z.object({ connectionId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const { listAllowedWppChats } = await import("./wppConnectIntegration");
        return listAllowedWppChats(input.connectionId, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name });
      }),
    syncChat: staffOrAdminProcedure
      .input(z.object({ connectionId: z.number().int().positive(), allowedChatId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const { syncAllowedWppChat } = await import("./wppConnectIntegration");
        return syncAllowedWppChat(input.connectionId, input.allowedChatId, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name });
      }),
    messages: staffOrAdminProcedure
      .input(z.object({ connectionId: z.number().int().positive(), allowedChatId: z.number().int().positive(), limit: z.number().int().min(1).max(250).default(100) }))
      .query(async ({ input, ctx }) => {
        const { listWppMessages } = await import("./wppConnectIntegration");
        return listWppMessages(input.connectionId, input.allowedChatId, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name }, input.limit);
      }),
    sendText: staffOrAdminProcedure
      .input(z.object({ connectionId: z.number().int().positive(), allowedChatId: z.number().int().positive(), text: z.string().trim().min(1).max(4096) }))
      .mutation(async ({ input, ctx }) => {
        const { sendWppText } = await import("./wppConnectIntegration");
        return sendWppText(input.connectionId, input.allowedChatId, input.text, { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name });
      }),
    sendMedia: staffOrAdminProcedure
      .input(z.object({ connectionId: z.number().int().positive(), allowedChatId: z.number().int().positive(), fileBase64: z.string().min(1), mimeType: z.string().trim().min(1).max(128), filename: z.string().trim().min(1).max(255), caption: z.string().trim().max(4096).optional(), mode: z.enum(["file", "ptt"]).default("file") }))
      .mutation(async ({ input, ctx }) => {
        const { sendWppMedia } = await import("./wppConnectIntegration");
        return sendWppMedia({ lineId: input.connectionId, allowedChatId: input.allowedChatId, fileBase64: input.fileBase64, mimeType: input.mimeType, filename: input.filename, caption: input.caption, mode: input.mode, actor: { id: ctx.user.id, role: ctx.user.role, name: ctx.user.name } });
      }),
  }),

  // ─── Analytics ───────────────────────────────────────────────────────────────
  analytics: router({
    overview: staffOrAdminProcedure.query(async () => {
      const [patientStats, appointmentStats, financeStats, revenueByMonth, appointmentsByDay, serviceUtilization] =
        await Promise.all([
          getPatientStats(),
          getAppointmentStats(),
          getFinanceStats(),
          getRevenueByMonth(),
          getAppointmentsByDay(),
          getServiceUtilization(),
        ]);
      return { patientStats, appointmentStats, financeStats, revenueByMonth, appointmentsByDay, serviceUtilization };
    }),
  }),

  // ─── Sales ───────────────────────────────────────────────────────────────────
  sales: router({
    notes: staffOrAdminProcedure
      .input(z.object({ patientId: z.number().optional(), leadId: z.number().optional() }))
      .query(({ input }) => getSalesNotes(input.patientId, input.leadId)),

    addNote: staffOrAdminProcedure
      .input(z.object({ patientId: z.number().optional(), leadId: z.number().optional(), content: z.string().min(1) }))
      .mutation(({ input, ctx }) => createSalesNote(input.patientId, ctx.user.id, input.content, input.leadId)),

    tasks: staffOrAdminProcedure
      .input(z.object({ patientId: z.number().optional(), leadId: z.number().optional() }))
      .query(({ input }) => getSalesTasks(input.patientId, input.leadId)),

    createTask: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number().optional(),
        leadId: z.number().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        dueDate: z.date().optional(),
        priority: z.enum(["low", "medium", "high"]),
        assignedToId: z.number().optional(),
      }))
      .mutation(({ input }) => createSalesTask(input)),

    updateTask: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
        title: z.string().optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
      }))
      .mutation(({ input }) => updateSalesTask(input.id, input)),
  }),

  // ─── Treatment Packages ───────────────────────────────────────────────────────
  treatmentPackages: router({
    list: staffOrAdminProcedure.query(() => getTreatmentPackages()),

    create: staffOrAdminProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        localPriceUSD: z.string().optional(),
        localPriceEUR: z.string().optional(),
        localPriceGBP: z.string().optional(),
        localPriceTRY: z.string().optional(),
        intlPriceUSD: z.string().optional(),
        intlPriceEUR: z.string().optional(),
        intlPriceGBP: z.string().optional(),
        intlPriceTRY: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const code = await getNextCode("package");
        return createTreatmentPackage({ ...input, code } as any);
      }),
    update: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          localPriceUSD: z.string().optional(),
          localPriceEUR: z.string().optional(),
          localPriceGBP: z.string().optional(),
          localPriceTRY: z.string().optional(),
          intlPriceUSD: z.string().optional(),
          intlPriceEUR: z.string().optional(),
          intlPriceGBP: z.string().optional(),
          intlPriceTRY: z.string().optional(),
          isActive: z.boolean().optional(),
        }),
      }))
      .mutation(({ input }) => updateTreatmentPackage(input.id, input.data as any)),
  }),

  // ─── Treatment Proposals ────────────────────────────────────────────────────
  treatmentProposals: router({
    list: staffOrAdminProcedure
      .input(z.object({ leadId: z.number().optional(), patientId: z.number().optional() }).optional())
      .query(({ input }) => getTreatmentProposals(input ?? {})),

    create: staffOrAdminProcedure
      .input(z.object({
        leadId: z.number().optional(),
        patientId: z.number().optional(),
        packageId: z.number().optional(),
        currency: z.enum(["USD", "EUR", "GBP", "TRY"]).optional(),
        appliedPriceType: z.enum(["local", "international"]).optional(),
        totalAmount: z.string().optional(),
        customItems: z.any().optional(),
        staffNotes: z.string().optional(),
        notifyPartner: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { notifyPartner, ...proposalData } = input;
        const proposalCode = await getNextCode("proposal");
        const proposal = await createTreatmentProposal({ ...proposalData, createdBy: ctx.user.id, code: proposalCode } as any);
        // Send partner email if requested
        if (notifyPartner && input.patientId) {
          try {
            const patient = await getPatientById(input.patientId);
            if (patient?.partnerId) {
              const partner = await getPatientById(patient.partnerId);
              if (partner?.email) {
                const { Resend } = await import("resend");
                const resend = new Resend(process.env.RESEND_API_KEY);
                await resend.emails.send({
                  from: "Fertiliv IVF Center <noreply@fertiliv.com>",
                  to: partner.email,
                  subject: `Treatment Proposal – Fertiliv IVF Center`,
                  html: `<p>Dear ${partner.firstName ?? ""} ${partner.lastName ?? ""},</p><p>A treatment proposal has been prepared for your partner's account at Fertiliv IVF Center. Please contact us for details.</p><p>Best regards,<br/>Fertiliv IVF Center</p>`,
                });
              }
            }
          } catch (e) { /* non-critical */ }
        }
        return proposal;
      }),

    update: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        currency: z.enum(["USD", "EUR", "GBP", "TRY"]).optional(),
        appliedPriceType: z.enum(["local", "international"]).optional(),
        totalAmount: z.string().optional(),
        customItems: z.any().optional(),
        staffNotes: z.string().optional(),
        status: z.enum(["draft", "sent", "accepted", "rejected"]).optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateTreatmentProposal(id, data as any);
      }),
    updateStatus: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["draft", "sent", "accepted", "rejected"]),
      }))
      .mutation(({ input }) => updateTreatmentProposal(input.id, {
        status: input.status,
        sentAt: input.status === "sent" ? new Date() : undefined,
      } as any)),

    listItems: protectedProcedure
      .input(z.object({ proposalId: z.number() }))
      .query(({ input }) => listProposalItems(input.proposalId)),

    upsertItems: staffOrAdminProcedure
      .input(z.object({
        proposalId: z.number(),
        items: z.array(z.object({
          serviceId: z.number().nullish(),
          description: z.string(),
          quantity: z.number().min(1),
          unitPrice: z.number().min(0),
          discount: z.number().min(0).optional(),
          totalPrice: z.number().min(0),
        })),
      }))
      .mutation(async ({ input }) => {
        await upsertProposalItems(input.proposalId, input.items.map(item => ({
          proposalId: input.proposalId,
          serviceId: item.serviceId ?? null,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toFixed(2) as any,
          discount: (item.discount ?? 0).toFixed(2) as any,
          totalPrice: item.totalPrice.toFixed(2) as any,
        } as any)));
         return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteTreatmentProposal(input.id);
        return { success: true };
      }),

    sendProposal: staffOrAdminProcedure
      .input(z.object({
        proposalId: z.number(),
        isUpdate: z.boolean().default(false),
        attachPdf: z.boolean().default(true),
        preferredLanguage: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { generateProposalPdf } = await import("./pdfService.js");
        const { sendProposalEmail } = await import("./emailService.js");
        const proposal = await getProposalById(input.proposalId);
        if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
        const items = await listProposalItems(input.proposalId);
        let patientName = "Valued Patient";
        let mrn: string | undefined;
        let recipientEmail: string | undefined;
        let preferredLang = input.preferredLanguage ?? "en";
        if ((proposal as any).patientId) {
          const pat = await getPatientById((proposal as any).patientId);
          if (pat) {
            patientName = `${pat.firstName} ${pat.lastName}`;
            mrn = pat.mrn ?? undefined;
            recipientEmail = pat.email ?? undefined;
            if (!input.preferredLanguage) {
              const langs = pat.preferredLanguages;
              preferredLang = (Array.isArray(langs) ? langs[0] : langs) ?? "en";
            }
          }
        } else if ((proposal as any).leadId) {
          const lead = await getLeadById((proposal as any).leadId);
          if (lead) {
            patientName = `${lead.firstName} ${lead.lastName}`;
            recipientEmail = lead.email ?? undefined;
          }
        }
        if (!recipientEmail) throw new TRPCError({ code: "BAD_REQUEST", message: "No email address found for this patient/lead" });
        const proposalCode = (proposal as any).code ?? `PROP-${proposal.id}`;
        const issueDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
        const sysSettings = await getSystemSettings();
        const cardSurchargePct = parseFloat(sysSettings.card_surcharge_pct ?? "23") || 23;
        const totalNum = parseFloat((proposal as any).totalAmount ?? "0");
        const cardTotal = totalNum * (1 + cardSurchargePct / 100);
        // Resolve items: prefer proposal_items table rows; fall back to customItems JSON
        let resolvedPdfItems: Array<{
          serviceName?: string; description: string; serviceDescription?: string;
          quantity: number; unitPrice: number; discount: number; totalPrice: number;
        }>;
        if (items.length > 0) {
          resolvedPdfItems = items.map((i: any) => {
            const discPct = parseFloat(i.discount ?? "0") || 0;
            const unitP = parseFloat(i.unitPrice);
            const qty = Number(i.quantity);
            return { serviceName: i.serviceName ?? undefined, description: i.description, serviceDescription: i.serviceDescription ?? undefined, quantity: qty, unitPrice: unitP, discount: discPct, totalPrice: discPct > 0 ? unitP * qty * (1 - discPct / 100) : parseFloat(i.totalPrice) };
          });
        } else {
          const customItems: any[] = (proposal as any).customItems ?? [];
          const allSvcs = await getAllServices();
          const svcMap = new Map(allSvcs.map((s: any) => [String(s.id), s]));
          resolvedPdfItems = customItems.map((ci: any) => {
            const svc = svcMap.get(String(ci.serviceId));
            const discPct = parseFloat(ci.discount ?? "0") || 0;
            const unitP = parseFloat(ci.amount ?? ci.unitPrice ?? "0");
            const qty = Number(ci.quantity ?? 1);
            return { serviceName: svc?.name ?? ci.serviceName ?? undefined, description: ci.description ?? svc?.name ?? "", serviceDescription: svc?.description ?? undefined, quantity: qty, unitPrice: unitP, discount: discPct, totalPrice: discPct > 0 ? unitP * qty * (1 - discPct / 100) : unitP * qty };
          });
        }
        let pdfBuffer: Buffer | undefined;
        if (input.attachPdf) {
          pdfBuffer = await generateProposalPdf({
            proposalCode,
            patientName,
            mrn,
            issueDate,
            currency: (proposal as any).currency ?? "USD",
            totalAmount: totalNum,
            appliedPriceType: (proposal as any).appliedPriceType ?? "international",
            notes: (proposal as any).staffNotes ?? undefined,
            cardSurchargePct,
            items: resolvedPdfItems,
          });
        }
        const sent = await sendProposalEmail(
          recipientEmail,
          {
            proposalCode,
            patientName,
            totalAmount: totalNum.toLocaleString("en", { minimumFractionDigits: 2 }),
            currency: (proposal as any).currency ?? "USD",
            issueDate,
            notes: (proposal as any).staffNotes ?? undefined,
            items: items.map((i: any) => ({ name: i.description })),
            isUpdate: input.isUpdate,
            cardSurchargePct,
            cardTotal: cardTotal.toLocaleString("en", { minimumFractionDigits: 2 }),
          },
          preferredLang,
          pdfBuffer
        );
        if (sent) {
          await updateTreatmentProposal(input.proposalId, { status: "sent", sentAt: new Date() } as any);
        }
        return { success: sent };
      }),
  }),
  // ─── Leads CRM ───────────────────────────────────────────────────────────────
  leads: router({
    list: staffOrAdminProcedure
      .input(z.object({
        search: z.string().optional(),
        status: z.string().optional(),
        assignedStaffId: z.number().optional(),
        brand: z.string().optional(),
        origin: z.string().optional(),
        country: z.string().optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(1000).optional(),
        sortBy: z.enum(["updatedAt", "name", "createdAt"]).optional(),
      }).optional())
      .query(({ input }) => getLeads(input ?? {})),

    stats: staffOrAdminProcedure.query(() => getLeadStats()),

    get: staffOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getLeadById(input.id)),

    create: staffOrAdminProcedure
      .input(z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        nationality: z.string().optional(),
        preferredLanguages: z.array(z.string()).optional(),
        primaryLanguage: z.string().optional(),
        preferredContactMethods: z.array(z.string()).optional(),
        leadSource: z.enum(["paid","employee-referral","external-referral","website","maps","partner","public-relations","instagram","tiktok","doctor-referral","youtube","facebook","awatef-guide","salim-guide","organic"]).optional(),
        brand: z.enum(["fertiliv", "safemedigo", "dr-nilay-karaca"]).optional(),
        leadStatus: z.enum(["intake","attempted-to-contact","contacted-awaiting-info","medical-reports-received","doctor-feedback-shared","follow-up-negotiation","ready-to-travel","converted","cold","lost","not-qualified","junk"]).optional(),
        assignedStaffId: z.number().optional(),
        notes: z.string().optional(),
        country: z.string().optional(),
        city: z.string().optional(),
        budgetRange: z.string().optional(),
        decisionTimeline: z.enum(["immediately","1-2-weeks","1-month","2-months","3-months","1-3-months","6-months","exploring"]).optional(),
        travelReadiness: z.enum(["ready","considering","prefers-home","local-patient"]).optional(),
        nextFollowUpDate: z.date().optional(),
        gender: z.enum(["male", "female", "other"]).optional(),
        middleName: z.string().optional(),
        dateOfBirth: z.date().optional(),
        patientType: z.enum(["local", "international", "not-specified"]).optional(),
        secondaryPhone: z.string().optional(),
        secondaryEmail: z.string().optional(),
        mainMedicalInterest: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const code = await getNextCode("lead");
        const lead = await createLead({ ...input, createdBy: ctx.user.id, code, leadOrigin: "staff-created" } as any);
        await logAudit({
          userId: ctx.user?.id, userName: ctx.user?.name, userRole: ctx.user?.role,
          action: "create_lead", category: "lead",
          description: `Created lead: ${input.firstName} ${input.lastName}`,
          recordId: (lead as any)?.insertId ?? undefined, recordType: "lead",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return lead;
      }),

    update: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
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
          gender: z.enum(["male", "female", "other"]).optional().nullable(),
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
        }),
      }))
      .mutation(async ({ input, ctx }) => {
        // Capture old assignedDoctorId before update for notification comparison
        const oldLead = await getLeadById(input.id);
        // Guard: when lead is linked to a Patient, strip identity fields so they
        // are never written back to the leads table (Patient is the source of truth).
        let dataToWrite: typeof input.data = input.data;
        if ((oldLead as any)?.convertedPatientId) {
          const { firstName, lastName, middleName, dateOfBirth, gender, ...crmOnly } = input.data as any;
          dataToWrite = crmOnly;
        }
        await updateLead(input.id, { ...dataToWrite, modifiedBy: ctx.user.id } as any);
        // Notify doctor if assignedDoctorId changed
        if (input.data.assignedDoctorId && input.data.assignedDoctorId !== (oldLead as any)?.assignedDoctorId) {
          const doctor = await getDoctorById(input.data.assignedDoctorId);
          const lead = await getLeadById(input.id);
          if (doctor && lead) {
            const caseName = `${(lead as any).firstName} ${(lead as any).lastName}`;
            const assignedBy = ctx.user?.name ?? "The team";
            const appUrl = ctx.req.headers["origin"] as string ?? "";
            if (doctor.userId) {
              await createNotification({
                userId: doctor.userId,
                type: "general",
                title: "New Case Assigned",
                message: `Lead ${caseName} has been assigned to you by ${assignedBy}.`,
                relatedId: input.id,
                relatedType: "lead",
              });
            }
            if (doctor.email) {
              const doctorFullName = [doctor.firstName, doctor.secondName].filter(Boolean).join(" ") || doctor.name || "Doctor";
              sendDoctorCaseAssignmentEmail(doctor.email, {
                doctorName: doctorFullName,
                caseName,
                caseType: "lead",
                caseId: input.id,
                assignedBy,
                appUrl,
              }).catch(console.error);
            }
          }
        }
        return { success: true };
      }),

    communications: staffOrAdminProcedure
      .input(z.object({ leadId: z.number() }))
      .query(({ input }) => getLeadCommunications(input.leadId)),

    addCommunication: staffOrAdminProcedure
      .input(z.object({ leadId: z.number(), note: z.string().min(1) }))
      .mutation(({ input, ctx }) => createLeadCommunication(input.leadId, input.note, ctx.user.id)),
    editCommunication: staffOrAdminProcedure
      .input(z.object({ id: z.number(), leadId: z.number(), note: z.string().min(1) }))
      .mutation(({ input, ctx }) => updateLeadCommunication(input.id, input.leadId, input.note, ctx.user.id)),
    deleteCommunication: staffOrAdminProcedure
      .input(z.object({ id: z.number(), leadId: z.number() }))
      .mutation(({ input, ctx }) => softDeleteLeadCommunication(input.id, input.leadId, ctx.user.id)),
    documents: staffOrAdminProcedure
      .input(z.object({ leadId: z.number() }))
      .query(({ input }) => getLeadDocuments(input.leadId)),

    addDocument: staffOrAdminProcedure
      .input(z.object({
        leadId: z.number(),
        fileKey: z.string(),
        fileUrl: z.string(),
        fileName: z.string(),
        mimeType: z.string().optional(),
        tag: z.string().optional(),
        docPassword: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // ── Direct-upload path: no conflict guard (direct uploads are always allowed) ──
        // Stamp dual IDs and canonical ownership so the document appears on both pages.
        const linkedPatientIdForDirect = await resolveLinkedPatientId(input.leadId);
        return createLeadDocument({
          ...input,
          ...(linkedPatientIdForDirect ? { patientId: linkedPatientIdForDirect } : {}),
          uploadedBy: ctx.user.id,
          tag: input.tag ?? null,
          docPassword: input.docPassword ?? null,
          lifecycleStatus: "direct-upload",
          ownerType: "lead",
          ownerId: input.leadId,
        } as any);
      }),
    updateDocumentTag: staffOrAdminProcedure
      .input(z.object({ id: z.number(), tag: z.string().nullable() }))
      .mutation(({ input }) => updateLeadDocumentTag(input.id, input.tag)),
    updateDocumentPassword: staffOrAdminProcedure
      .input(z.object({ id: z.number(), docPassword: z.string().nullable() }))
      .mutation(({ input }) => updateLeadDocumentPassword(input.id, input.docPassword)),
    deleteDocument: staffOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteLeadDocument(input.id)),
    // ── Canonical Direct Upload to Documents Library ──────────────────────────────────────────────
    // Returns person-centric destinations for direct upload (no Health Record required).
    // Server-side authorization: resolves real names, canonical IDs, and ownership for each destination.
    getDirectUploadDestinations: staffOrAdminProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => {
        const lead = await getLeadById(input.leadId);
        if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
        const partner = (lead as any).partnerId ? await getLeadPartner(input.leadId) : null;
        const primaryPatientId = await resolveLinkedPatientId(input.leadId);
        const primaryName = [(lead as any).firstName, (lead as any).lastName].filter(Boolean).join(" ") || "This Person";
        const primaryGender: "female" | "male" | "unknown" =
          (lead as any).contactRole === "female-patient" || (lead as any).contactRole === "wife-for-couple" ? "female" :
          (lead as any).contactRole === "male-patient" || (lead as any).contactRole === "husband-for-couple" ? "male" :
          (lead as any).gender === "female" ? "female" :
          (lead as any).gender === "male" ? "male" : "unknown";
        const destinations: Array<{
          key: string;
          personName: string;
          gender: "female" | "male" | "unknown";
          leadId: number;
          patientId: number | null;
          ownerType: string;
          ownerId: number;
          isPrimary: boolean;
        }> = [];
        destinations.push({
          key: `primary-${input.leadId}`,
          personName: primaryName,
          gender: primaryGender,
          leadId: input.leadId,
          patientId: primaryPatientId ?? null,
          ownerType: "lead",
          ownerId: input.leadId,
          isPrimary: true,
        });
        if (partner) {
          const partnerPatientId = await resolveLinkedPatientId(partner.id);
          const partnerGender: "female" | "male" | "unknown" =
            (partner as any).contactRole === "female-patient" || (partner as any).contactRole === "wife-for-couple" ? "female" :
            (partner as any).contactRole === "male-patient" || (partner as any).contactRole === "husband-for-couple" ? "male" :
            (partner as any).gender === "female" ? "female" :
            (partner as any).gender === "male" ? "male" : "unknown";
          const partnerName = [(partner as any).firstName, (partner as any).lastName].filter(Boolean).join(" ") || "Partner";
          destinations.push({
            key: `partner-${partner.id}`,
            personName: partnerName,
            gender: partnerGender,
            leadId: partner.id,
            patientId: partnerPatientId ?? null,
            ownerType: "lead",
            ownerId: partner.id,
            isPrimary: false,
          });
        }
        return destinations;
      }),
    // Direct upload to Documents Library — no conflict guard, no intake JSON modification.
    // Accepts base64-encoded file, resolves canonical ownership server-side.
    directUpload: staffOrAdminProcedure
      .input(z.object({
        leadId: z.number(),
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string().optional(),
        tag: z.string().optional(),
        docPassword: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const lead = await getLeadById(input.leadId);
        if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
        const linkedPatientId = await resolveLinkedPatientId(input.leadId);
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "bin";
        const key = `direct-upload/lead-${input.leadId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType, input.fileName);
        const personName = [(lead as any).firstName, (lead as any).lastName].filter(Boolean).join(" ") || "Person";
        const docId = await createLeadDocument({
          leadId: input.leadId,
          ...(linkedPatientId ? { patientId: linkedPatientId } : {}),
          fileKey: storedKey,
          fileUrl: url,
          fileName: input.fileName,
          mimeType: input.mimeType,
          uploadedBy: ctx.user.id,
          tag: input.tag ?? null,
          docPassword: input.docPassword ?? null,
          lifecycleStatus: "direct-upload",
          ownerType: "lead",
          ownerId: input.leadId,
        } as any);
        return { docId, personName, linkedPatientId: linkedPatientId ?? null };
      }),
    // Upload a file for a specific intake section entry and register it in lead_documents
    uploadIntakeFile: staffOrAdminProcedure
      .input(z.object({
        leadId: z.number(),
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        intakeSection: z.string().optional(), // e.g. "Semen Analysis", "Hormone Panel"
      }))
      .mutation(async ({ input, ctx }) => {
        // ── Conflict guard: section uploads are blocked during an intake conflict ──
        const linkedPatientIdForUpload = await resolveLinkedPatientId(input.leadId);
        const canonical = await resolveCanonicalIntake(input.leadId, linkedPatientIdForUpload);
        if (canonical.status === "conflict") {
          throw new TRPCError({ code: "CONFLICT", message: "intake_conflict" });
        }
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "bin";
        const key = `intake-files/lead-${input.leadId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType, input.fileName);
        // ── Canonical ownership: lead-path always owns the row ──
        // Stamp patientId when a linked patient exists so both IDs are written.
        const docId = await createLeadDocument({
          leadId: input.leadId,
          ...(linkedPatientIdForUpload ? { patientId: linkedPatientIdForUpload } : {}),
          fileKey: storedKey,
          fileUrl: url,
          fileName: input.fileName,
          mimeType: input.mimeType,
          uploadedBy: ctx.user.id,
          intakeSection: input.intakeSection ?? null,
          tag: input.intakeSection ?? null,
          lifecycleStatus: "active",
          ownerType: "lead",
          ownerId: input.leadId,
        } as any);
                return { fileKey: storedKey, fileUrl: url, fileName: input.fileName, docId, linkedPatientId: linkedPatientIdForUpload ?? null };
      }),

    // ── Init Draft Session: create or restore a server-managed draft session ──
    // Returns a server-issued activeWriterToken (distinct from draftSessionId).
    initDraftSession: staffOrAdminProcedure
      .input(z.object({
        draftSessionId: z.string(),
        leadId: z.number().optional(),
        intakeId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { createOrResolveDraftSession } = await import("./saveHealthRecord");
        const result = await createOrResolveDraftSession({
          draftSessionId: input.draftSessionId,
          leadId: input.leadId,
          intakeId: input.intakeId,
          createdBy: ctx.user.id,
        });
        return result;
      }),

    // ── Takeover Draft Session: rotate the writer token (cross-tab takeover) ──
    takeoverDraftSession: staffOrAdminProcedure
      .input(z.object({ draftSessionId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { takeOverDraftSession } = await import("./saveHealthRecord");
        const result = await takeOverDraftSession({
          draftSessionId: input.draftSessionId,
          requestingUserId: ctx.user.id,
        });
        return result;
      }),

    // ── Pending-Draft Upload: upload a file as pending-draft (not yet saved to intake) ──
    uploadPendingIntakeFile: staffOrAdminProcedure
      .input(z.object({
        leadId: z.number(),
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        intakeSection: z.string().optional(),
        draftSessionId: z.string(),
        activeWriterToken: z.string(),
        pendingSection: z.string().optional(),
        pendingEntryKey: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // ── Writer token validation ──
        // Creates documents with lifecycleStatus=pending-draft until the session is saved
        const { validateWriterToken } = await import("./db");
        await validateWriterToken({ draftSessionId: input.draftSessionId, activeWriterToken: input.activeWriterToken });
        const linkedPatientId = await resolveLinkedPatientId(input.leadId);
        const canonical = await resolveCanonicalIntake(input.leadId, linkedPatientId);
        if (canonical.status === "conflict") {
          throw new TRPCError({ code: "CONFLICT", message: "intake_conflict" });
        }
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "bin";
        const key = `intake-files/lead-${input.leadId}/pending/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType, input.fileName);
        const { createPendingDraftDocument } = await import("./db");
        const docId = await createPendingDraftDocument({
          leadId: input.leadId,
          ...(linkedPatientId ? { patientId: linkedPatientId } : {}),
          fileKey: storedKey,
          fileUrl: url,
          fileName: input.fileName,
          mimeType: input.mimeType,
          uploadedBy: ctx.user.id,
          intakeSection: input.intakeSection,
          tag: input.intakeSection,
          draftSessionId: input.draftSessionId,
          pendingSection: input.pendingSection,
          pendingEntryKey: input.pendingEntryKey,
        });
        return { fileKey: storedKey, fileUrl: url, fileName: input.fileName, docId, draftSessionId: input.draftSessionId };
      }),

    // ── Cancel Draft Session: terminal cancel state + immediate S3 + AI cleanup ──
    cancelDraftSession: staffOrAdminProcedure
      .input(z.object({ draftSessionId: z.string(), activeWriterToken: z.string() }))
      .mutation(async ({ input, ctx }) => {
        // Validate writer token before cancelling — prevents stale tabs from cancelling active sessions
        const { validateWriterToken, cancelDraftSessionImmediateV2 } = await import("./db");
        await validateWriterToken({ draftSessionId: input.draftSessionId, activeWriterToken: input.activeWriterToken });
        await cancelDraftSessionImmediateV2({ draftSessionId: input.draftSessionId, canceledBy: ctx.user.id });
        return { ok: true };
      }),

    // ── Touch Draft Session: extend expiry for an active draft session ──
    touchDraftSession: staffOrAdminProcedure
      .input(z.object({ draftSessionId: z.string(), activeWriterToken: z.string() }))
      .mutation(async ({ input }) => {
        const { validateWriterToken, touchDraftSession } = await import("./db");
        await validateWriterToken({ draftSessionId: input.draftSessionId, activeWriterToken: input.activeWriterToken });
        await touchDraftSession(input.draftSessionId);
        return { ok: true };
      }),

    // ── Get Pending Draft Docs: fetch pending-draft docs for a session (for restoration) ──
    getPendingDraftDocs: staffOrAdminProcedure
      .input(z.object({ draftSessionId: z.string() }))
      .query(async ({ input }) => {
        const { getPendingDraftDocsBySession } = await import("./db");
        return getPendingDraftDocsBySession(input.draftSessionId);
      }),

    // Upload a document directly from the Documents tab into a specific intake section
    addDocumentToSection: staffOrAdminProcedure
      .input(z.object({
        leadId: z.number(),
        gender: z.enum(["female", "male"]),
        section: z.string(),
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        tag: z.string().optional(),
        docPassword: z.string().optional(),
        targetStudyId: z.string().optional(), // for radiologyImages/radiologyDicom: attach to existing study
        studyName: z.string().optional(), // user-provided study name for new study creation
      }))
      .mutation(async ({ input, ctx }) => {
        // ── Conflict guard: section uploads are blocked during an intake conflict ──
        const linkedPatientIdForSection = await resolveLinkedPatientId(input.leadId);
        const canonical = await resolveCanonicalIntake(input.leadId, linkedPatientIdForSection);
        if (canonical.status === "conflict") {
          throw new TRPCError({ code: "CONFLICT", message: "intake_conflict" });
        }
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "bin";
        const key = `intake-files/lead-${input.leadId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType, input.fileName);
        const tag = input.tag ?? input.section;
        // ── Canonical ownership: lead-path always owns; stamp patientId when linked ──
        const docId = await createLeadDocument({
          leadId: input.leadId,
          ...(linkedPatientIdForSection ? { patientId: linkedPatientIdForSection } : {}),
          fileKey: storedKey,
          fileUrl: url,
          fileName: input.fileName,
          mimeType: input.mimeType,
          uploadedBy: ctx.user.id,
          intakeSection: input.section,
          tag,
          docPassword: input.docPassword ?? null,
          lifecycleStatus: "active",
          ownerType: "lead",
          ownerId: input.leadId,
        });
        const intake = await getMedicalIntake(input.leadId);
        const fileEntry = { fileKey: storedKey, fileUrl: url, fileName: input.fileName, mimeType: input.mimeType, tag, docPassword: input.docPassword ?? null, docId };
        const parseArr = (v: any): any[] => {
          if (!v) return [];
          if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
          return Array.isArray(v) ? v : [];
        };
        if (input.gender === "female") {
          const s = input.section;
          if (s === "artHistory") {
            const arr = parseArr(intake?.artHistory);
            arr.push({ id: Date.now().toString(), files: [fileEntry] });
            await upsertMedicalIntake(input.leadId, { artHistory: arr } as any);
          } else if (s === "surgicalHistory") {
            const arr = parseArr(intake?.surgicalHistory);
            arr.push({ id: Date.now().toString(), files: [fileEntry] });
            await upsertMedicalIntake(input.leadId, { surgicalHistory: arr } as any);
          } else if (s === "previousTests") {
            const arr = parseArr(intake?.previousTests);
            arr.push({ id: Date.now().toString(), files: [fileEntry] });
            await upsertMedicalIntake(input.leadId, { previousTests: arr } as any);
          } else if (s === "radiologyReport" || s === "radiologyImages" || s === "radiologyDicom") {
            const arr = parseArr(intake?.radiologyStudies);
            const newStudyName = input.studyName || input.fileName;
            if (!input.targetStudyId || input.targetStudyId === "__new__") {
              // Create a new study entry
              const subType = s === "radiologyReport" ? "report" : s === "radiologyImages" ? "image" : "dicom";
              arr.push({ id: Date.now().toString(), type: subType, studyName: newStudyName, fileKey: storedKey, fileUrl: url, fileName: input.fileName, mimeType: input.mimeType, tag, docId });
            } else {
              // Attach to existing study
              const studyIdx = arr.findIndex((st: any) => st.id === input.targetStudyId);
              if (studyIdx === -1) {
                // Study not found — fall back to creating new
                const subType = s === "radiologyReport" ? "report" : s === "radiologyImages" ? "image" : "dicom";
                arr.push({ id: Date.now().toString(), type: subType, studyName: newStudyName, fileKey: storedKey, fileUrl: url, fileName: input.fileName, mimeType: input.mimeType, tag, docId });
              } else if (s === "radiologyReport") {
                // Attach additional report file to existing study
                const reportFiles = Array.isArray(arr[studyIdx].reportFiles) ? arr[studyIdx].reportFiles : [];
                reportFiles.push({ id: Date.now().toString(), fileKey: storedKey, fileUrl: url, fileName: input.fileName, fileMimeType: input.mimeType, docId, label: tag });
                arr[studyIdx] = { ...arr[studyIdx], reportFiles };
              } else if (s === "radiologyImages") {
                const images = Array.isArray(arr[studyIdx].images) ? arr[studyIdx].images : [];
                images.push({ id: Date.now().toString(), fileKey: storedKey, fileUrl: url, fileName: input.fileName, fileMimeType: input.mimeType, docId, label: tag });
                arr[studyIdx] = { ...arr[studyIdx], images };
              } else {
                // radiologyDicom
                const dicomFiles = Array.isArray(arr[studyIdx].dicomFiles) ? arr[studyIdx].dicomFiles : [];
                dicomFiles.push({ id: Date.now().toString(), fileKey: storedKey, fileUrl: url, fileName: input.fileName, docId, label: tag });
                arr[studyIdx] = { ...arr[studyIdx], dicomFiles };
              }
            }
            await upsertMedicalIntake(input.leadId, { radiologyStudies: arr } as any);
          } else if (s === "generalAttachmentsFemale") {
            const arr = parseArr(intake?.generalAttachmentsFemale);
            arr.push(fileEntry);
            await upsertMedicalIntake(input.leadId, { generalAttachmentsFemale: arr } as any);
          } else if (s === "geneticTests") {
            // Female genetic tests are stored in generalAttachmentsFemale with a geneticTest tag
            const arr = parseArr(intake?.generalAttachmentsFemale);
            arr.push({ ...fileEntry, tag: tag || "GeneticTest-01", section: "geneticTests" });
            await upsertMedicalIntake(input.leadId, { generalAttachmentsFemale: arr } as any);
          }
        } else {
          const maleIntake: any = (intake?.maleIntake as any) ?? {};
          const s = input.section;
          const parseArrM = (v: any): any[] => {
            if (!v) return [];
            if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
            return Array.isArray(v) ? v : [];
          };
          if (s === "semenAnalysis") {
            const arr = parseArrM(maleIntake.semenAnalysis);
            arr.push({ id: Date.now().toString(), date: "", fileKey: storedKey, fileUrl: url, fileName: input.fileName, mimeType: input.mimeType, tag, docPassword: input.docPassword ?? null, docId });
            await upsertMedicalIntake(input.leadId, { maleIntake: { ...maleIntake, semenAnalysis: arr } } as any);
          } else if (s === "dnaFragmentation") {
            const arr = parseArrM(maleIntake.dnaFragmentation);
            arr.push({ id: Date.now().toString(), date: "", fileKey: storedKey, fileUrl: url, fileName: input.fileName, mimeType: input.mimeType, tag, docPassword: input.docPassword ?? null, docId });
            await upsertMedicalIntake(input.leadId, { maleIntake: { ...maleIntake, dnaFragmentation: arr } } as any);
          } else if (s === "previousTests") {
            const arr = parseArrM(maleIntake.previousTests);
            arr.push({ id: Date.now().toString(), files: [fileEntry] });
            await upsertMedicalIntake(input.leadId, { maleIntake: { ...maleIntake, previousTests: arr } } as any);
          } else if (s === "previousSurgeries") {
            const arr = parseArrM(maleIntake.previousSurgeries);
            arr.push({ id: Date.now().toString(), files: [fileEntry] });
            await upsertMedicalIntake(input.leadId, { maleIntake: { ...maleIntake, previousSurgeries: arr } } as any);
          } else if (s === "geneticTests") {
            const arr = parseArrM(maleIntake.geneticTests);
            arr.push({ id: Date.now().toString(), testName: "Genetic Test", files: [fileEntry] });
            await upsertMedicalIntake(input.leadId, { maleIntake: { ...maleIntake, geneticTests: arr } } as any);
          } else if (s === "radiologyReport" || s === "radiologyImages" || s === "radiologyDicom") {
            const arr = parseArr(intake?.maleRadiologyStudies);
            const newStudyNameM = input.studyName || input.fileName;
            if (!input.targetStudyId || input.targetStudyId === "__new__") {
              // Create a new study entry
              const subType = s === "radiologyReport" ? "report" : s === "radiologyImages" ? "image" : "dicom";
              arr.push({ id: Date.now().toString(), type: subType, studyName: newStudyNameM, fileKey: storedKey, fileUrl: url, fileName: input.fileName, mimeType: input.mimeType, tag, docId });
            } else {
              // Attach to existing study
              const studyIdx = arr.findIndex((st: any) => st.id === input.targetStudyId);
              if (studyIdx === -1) {
                // Study not found — fall back to creating new
                const subType = s === "radiologyReport" ? "report" : s === "radiologyImages" ? "image" : "dicom";
                arr.push({ id: Date.now().toString(), type: subType, studyName: newStudyNameM, fileKey: storedKey, fileUrl: url, fileName: input.fileName, mimeType: input.mimeType, tag, docId });
              } else if (s === "radiologyReport") {
                // Attach additional report file to existing study
                const reportFiles = Array.isArray(arr[studyIdx].reportFiles) ? arr[studyIdx].reportFiles : [];
                reportFiles.push({ id: Date.now().toString(), fileKey: storedKey, fileUrl: url, fileName: input.fileName, fileMimeType: input.mimeType, docId, label: tag });
                arr[studyIdx] = { ...arr[studyIdx], reportFiles };
              } else if (s === "radiologyImages") {
                const images = Array.isArray(arr[studyIdx].images) ? arr[studyIdx].images : [];
                images.push({ id: Date.now().toString(), fileKey: storedKey, fileUrl: url, fileName: input.fileName, fileMimeType: input.mimeType, docId, label: tag });
                arr[studyIdx] = { ...arr[studyIdx], images };
              } else {
                // radiologyDicom
                const dicomFiles = Array.isArray(arr[studyIdx].dicomFiles) ? arr[studyIdx].dicomFiles : [];
                dicomFiles.push({ id: Date.now().toString(), fileKey: storedKey, fileUrl: url, fileName: input.fileName, docId, label: tag });
                arr[studyIdx] = { ...arr[studyIdx], dicomFiles };
              }
            }
            await upsertMedicalIntake(input.leadId, { maleRadiologyStudies: arr } as any);
          } else if (s === "generalAttachmentsMale") {
            const arr = parseArr(intake?.generalAttachmentsMale);
            arr.push(fileEntry);
            await upsertMedicalIntake(input.leadId, { generalAttachmentsMale: arr } as any);
          }
        }
        // Return linkedPatientId so the client can cross-invalidate patients.documents
        const linkedPatientIdForDoc = await resolveLinkedPatientId(input.leadId);
        return { fileKey: storedKey, fileUrl: url, fileName: input.fileName, docId, tag, linkedPatientId: linkedPatientIdForDoc ?? null };
      }),
    medicalIntake: staffOrAdminProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => {
        const result = await resolveCanonicalIntake(input.leadId, null);
        if (result.status === "conflict") {
          return {
            intake: null,
            conflict: {
              leadIntakeId: result.leadIntakeId,
              patientIntakeId: result.patientIntakeId,
              leadIntakeSummary: result.leadIntakeSummary,
              patientIntakeSummary: result.patientIntakeSummary,
            },
          };
        }
        return {
          intake: result.status === "resolved" ? result.intake : null,
          conflict: null,
        };
      }),
    // Returns existing radiology studies for a lead (for the "attach to study" picker)
    getRadiologyStudies: staffOrAdminProcedure
      .input(z.object({ leadId: z.number(), gender: z.enum(["female", "male"]) }))
      .query(async ({ input }) => {
        const intake = await getMedicalIntake(input.leadId);
        const parseArr = (v: any): any[] => {
          if (!v) return [];
          if (typeof v === "string") {
            try {
              const parsed = JSON.parse(v);
              // Handle double-encoded JSON (string-within-a-string)
              if (typeof parsed === "string") {
                try { return JSON.parse(parsed); } catch { return []; }
              }
              return Array.isArray(parsed) ? parsed : [];
            } catch { return []; }
          }
          return Array.isArray(v) ? v : [];
        };
        const studies = input.gender === "female"
          ? parseArr(intake?.radiologyStudies)
          : parseArr(intake?.maleRadiologyStudies);
        // Return id, studyName, type, date for display in picker
        return studies.map((s: any) => ({
          id: s.id as string,
          studyName: (s.studyName ?? s.fileName ?? "Unnamed Study") as string,
          type: (s.type ?? "other") as string,
          date: (s.date ?? "") as string,
        }));
      }),

    getUploadDestinations: staffOrAdminProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => {
        const lead = await getLeadById(input.leadId);
        if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
        const partner = lead.partnerId ? await getLeadPartner(input.leadId) : null;
        const intake = await getMedicalIntake(input.leadId);
        const partnerIntake = partner ? await getMedicalIntake(partner.id) : null;

        // Determine the primary person's gender from contactRole, gender, or serviceFor
        const primaryGender: "female" | "male" | "unknown" =
          (lead as any).contactRole === "female-patient" || (lead as any).contactRole === "wife-for-couple" ? "female" :
          (lead as any).contactRole === "male-patient" || (lead as any).contactRole === "husband-for-couple" ? "male" :
          (lead as any).gender === "female" ? "female" :
          (lead as any).gender === "male" ? "male" :
          "unknown";

        const destinations: Array<{
          key: string;
          label: string;
          personName: string;
          gender: "female" | "male" | "unknown";
          leadId: number;
          hasIntake: boolean;
          isPrimary: boolean;
        }> = [];

        // Primary person
        destinations.push({
          key: `primary-${primaryGender}`,
          label: primaryGender === "female" ? "Wife (Female) — Health Record" : primaryGender === "male" ? "Husband (Male) — Health Record" : "This Person — Health Record",
          personName: [(lead as any).firstName, (lead as any).lastName].filter(Boolean).join(" "),
          gender: primaryGender,
          leadId: input.leadId,
          hasIntake: !!intake,
          isPrimary: true,
        });

        // Partner (only if linked)
        if (partner) {
          const partnerGender: "female" | "male" | "unknown" =
            (partner as any).contactRole === "female-patient" || (partner as any).contactRole === "wife-for-couple" ? "female" :
            (partner as any).contactRole === "male-patient" || (partner as any).contactRole === "husband-for-couple" ? "male" :
            (partner as any).gender === "female" ? "female" :
            (partner as any).gender === "male" ? "male" :
            "unknown";
          destinations.push({
            key: `partner-${partnerGender}`,
            label: partnerGender === "female" ? "Wife (Female) — Health Record" : partnerGender === "male" ? "Husband (Male) — Health Record" : "Partner — Health Record",
            personName: [(partner as any).firstName, (partner as any).lastName].filter(Boolean).join(" "),
            gender: partnerGender,
            leadId: partner.id,
            hasIntake: !!partnerIntake,
            isPrimary: false,
          });
        }

        return destinations;
      }),
    saveMedicalIntake: staffOrAdminProcedure
      .input(z.object({
        leadId: z.number(),
        infertilityType: z.enum(["primary", "secondary"]).optional(),
        infertilityDuration: z.string().optional(),
        referralSource: z.string().optional(),
        profession: z.string().optional(),
        marriageDate: z.date().optional(),
        isFirstMarriage: z.boolean().optional(),
        partnerIsFirstMarriage: z.boolean().optional(),
        hasCivilMarriageCertificate: z.boolean().optional(),
        marriageCertStatus: z.string().optional(),
        heightCm: z.string().optional(),
        weightKg: z.string().optional(),
        bmi: z.string().optional(),
        bmiManual: z.boolean().optional(),
        waistCm: z.string().optional(),
        hipCm: z.string().optional(),
        gravida: z.number().optional(),
        para: z.number().optional(),
        abortus: z.number().optional(),
        livingChildren: z.number().optional(),
        childrenFromPreviousMarriage: z.number().optional(),
        lastMenstrualPeriod: z.date().optional(),
        cycleRegularity: z.enum(["regular", "irregular", "absent"]).optional(),
        cycleLengthDays: z.number().optional(),
        menstrualFlowDays: z.number().optional(),
        dysmenorrhea: z.boolean().optional(),
        miscarriageHistory: z.any().optional(),
        artHistory: z.any().optional(),
        surgicalHistory: z.any().optional(),
        previousTests: z.any().optional(),
        hasPreviousTests: z.boolean().optional(),
        systemicDiseases: z.any().optional(),
        smoking: z.enum(["never", "former", "current"]).optional(),
        smokingPacksPerDay: z.string().optional(),
        alcohol: z.enum(["never", "occasional", "regular"]).optional(),
        currentMedications: z.string().optional(),
        allergies: z.string().optional(),
        hirsutism: z.boolean().optional(),
        consanguinity: z.boolean().optional(),
        hereditaryDiseases: z.string().optional(),
        familyBreastCancer: z.boolean().optional(),
        familyEarlyMenopause: z.boolean().optional(),
        familyInfertility: z.boolean().optional(),
        contraceptiveHistory: z.any().optional(),
        femaleGeneticTests: z.any().optional(),
        maleIntake: z.any().optional(),
        additionalNotes: z.string().optional(),
        expectedVisitDate: z.date().optional(),
        patientQuestions: z.any().optional(),
        radiologyStudies: z.any().optional(),
        maleRadiologyStudies: z.any().optional(),
        generalAttachmentsFemale: z.any().optional(),
        generalAttachmentsMale: z.any().optional(),
        marriageCertFileKey: z.string().optional(),
        marriageCertFileUrl: z.string().optional(),
        marriageCertFileName: z.string().optional(),
        marriageCertDocId: z.number().optional(),
        marriageCertFilePassword: z.string().optional(),
        // Phase 2 — intake mode
        intakeMode: z.enum(["legacy", "female", "male", "general"]).optional(),
        personGender: z.enum(["female", "male"]).optional(),
        // Pending-draft lifecycle: promote pending docs on save
        draftSessionId: z.string().optional(),
        // Phase 2 Correction: atomic Save fields
        activeWriterToken: z.string().optional(),
        requestId: z.string().optional(),
        expectedUpdatedAt: z.date().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { leadId, draftSessionId, activeWriterToken, requestId, expectedUpdatedAt, ...data } = input;
        // ── Conflict guard ────────────────────────────────────────────────────
        // Block writes when two separate intake rows exist for the same person
        // (one keyed by leadId, one by patientId). Staff must resolve the conflict
        // before any further saves are allowed.
        const conflictCheck = await resolveCanonicalIntake(leadId, null);
        if (conflictCheck.status === "conflict") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "intake_conflict",
            cause: {
              leadIntakeId: conflictCheck.leadIntakeId,
              patientIntakeId: conflictCheck.patientIntakeId,
            },
          });
        }
        // ── End conflict guard ────────────────────────────────────────────────
        // Validate marriage date: must be 1900 or later
        if (data.marriageDate) {
          const minDate = new Date('1900-01-01');
          if (data.marriageDate < minDate) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Marriage date must be 1900 or later.',
            });
          }
        }
        // ── Backend future-date validation ──────────────────────────────────
        const now = new Date(); now.setHours(0,0,0,0);
        const isDateFuture = (d: Date | null | undefined) => !!d && new Date(d) > now;
        const isMonthFuture = (s: string | null | undefined) => {
          if (!s) return false;
          const [y, m] = s.split('-').map(Number);
          if (!y) return false;
          const cur = new Date(); const curYM = cur.getFullYear()*12+(cur.getMonth()+1);
          return m ? (y*12+m) > curYM : y > cur.getFullYear();
        };
        const futureFields: string[] = [];
        if (isDateFuture(data.marriageDate)) futureFields.push('marriageDate');
        if (isDateFuture(data.lastMenstrualPeriod)) futureFields.push('lastMenstrualPeriod');
        const miscarriages: {date?:string}[] = Array.isArray(data.miscarriageHistory) ? data.miscarriageHistory : [];
        miscarriages.forEach((m,i) => { if (isMonthFuture(m.date)) futureFields.push(`miscarriageHistory[${i}].date`); });
        const artHistory: {date?:string}[] = Array.isArray(data.artHistory) ? data.artHistory : [];
        artHistory.forEach((a,i) => { if (isMonthFuture(a.date)) futureFields.push(`artHistory[${i}].date`); });
        const surgicalHistory: {date?:string}[] = Array.isArray(data.surgicalHistory) ? data.surgicalHistory : [];
        surgicalHistory.forEach((s,i) => { if (s.date && new Date(s.date) > now) futureFields.push(`surgicalHistory[${i}].date`); });
        const previousTests: {collectionDate?:string;reportDate?:string}[] = Array.isArray(data.previousTests) ? data.previousTests : [];
        previousTests.forEach((t,i) => {
          if (t.collectionDate && new Date(t.collectionDate) > now) futureFields.push(`previousTests[${i}].collectionDate`);
          if (t.reportDate && new Date(t.reportDate) > now) futureFields.push(`previousTests[${i}].reportDate`);
        });
        const radiology: {studyDate?:string}[] = Array.isArray(data.radiologyStudies) ? data.radiologyStudies : [];
        radiology.forEach((r,i) => { if (r.studyDate && new Date(r.studyDate) > now) futureFields.push(`radiologyStudies[${i}].studyDate`); });
        if (futureFields.length > 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Future dates are not allowed for historical records: ${futureFields.join(', ')}` });
        }
        // ── End backend validation ───────────────────────────────────────────────────
        // Phase 2 fix: if no intakeMode is provided, check if record already exists
        // New records (no existing intake) must default to 'general', not NULL/legacy
        if (!data.intakeMode) {
          const existingIntake = await getMedicalIntake(leadId);
          if (!existingIntake) {
            // Brand-new record: default to 'general' so it never silently becomes legacy
            (data as any).intakeMode = 'general';
          }
          // Existing records: do not overwrite their intakeMode (preserve legacy/female/male/general)
        }
                // ── Atomic Save (Phase 2 Correction) ─────────────────────────────────
        if (draftSessionId && activeWriterToken && requestId) {
          const { saveHealthRecord } = await import("./saveHealthRecord");
          await saveHealthRecord({
            leadId,
            draftSessionId,
            activeWriterToken,
            requestId,
            expectedUpdatedAt: expectedUpdatedAt ?? undefined,
            intakeData: data as any,
            callerUserId: ctx.user.id,
          });
        } else {
          // Legacy path: no draft session — direct upsert (backward compat)
          await upsertMedicalIntake(leadId, data as any);
        }
        // Return linkedPatientId so the client can cross-invalidate patients.getIntake
        const linkedPatientId = await resolveLinkedPatientId(leadId);
        return { success: true, linkedPatientId: linkedPatientId ?? null };
      }),
    resetMedicalIntake: staffOrAdminProcedure
      .input(z.object({
        leadId: z.number(),
        mode: z.enum(["archive", "permanent"]),
        // Required for permanent mode — server rejects permanent requests without this flag.
        confirmPermanentDeletion: z.boolean().optional(),
        // Optimistic lock: client sends the updatedAt timestamp it last saw.
        // If the intake was modified since then, the reset is blocked.
        intakeUpdatedAt: z.string().optional(),
        // Client-generated request ID for audit traceability
        requestId: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // ── Conflict guard ────────────────────────────────────────────────────
        // Block resets when two separate intake rows exist for the same person.
        const conflictCheckR = await resolveCanonicalIntake(input.leadId, null);
        if (conflictCheckR.status === "conflict") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "intake_conflict",
            cause: {
              leadIntakeId: conflictCheckR.leadIntakeId,
              patientIntakeId: conflictCheckR.patientIntakeId,
            },
          });
        }
        // ── End conflict guard ────────────────────────────────────────────────
        // Guard: permanent mode requires explicit client confirmation flag
        if (input.mode === "permanent" && !input.confirmPermanentDeletion) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Permanent deletion requires explicit confirmation. Please complete the confirmation step.",
          });
        }

        const existingIntake = await getMedicalIntake(input.leadId);

        // Optimistic lock check
        if (existingIntake && input.intakeUpdatedAt) {
          const serverTs = existingIntake.updatedAt instanceof Date
            ? existingIntake.updatedAt.toISOString()
            : String(existingIntake.updatedAt ?? "");
          if (serverTs !== input.intakeUpdatedAt) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "The Health Record was modified by another session. Please reload the page before resetting.",
            });
          }
        }

        const performedAt = new Date().toISOString();
        const staffName = ctx.user?.name ?? "Staff";
        const staffId = ctx.user?.id ?? 0;

        if (existingIntake) {
          // ── Metadata-only audit log entry ─────────────────────────────────────────────────
          // Write a metadata-only record to audit_logs (NOT lead_communications).
          // No clinical data is written here — only identifiers, timestamps, and action context.
          // This is NOT a fail-safe: if this write fails the reset continues (fire-and-forget).
          // The full clinical snapshot is NOT stored anywhere — the reset is intentionally
          // destructive and the staff member is responsible for confirming the deletion.
          await logAudit({
            userId: staffId,
            userName: staffName,
            userRole: ctx.user?.role,
            action: input.mode === "archive" ? "archive_reset_health_record" : "permanent_delete_reset_health_record",
            category: "lead",
            description: `Health Record ${input.mode === "archive" ? "archived" : "permanently deleted"} for lead ${input.leadId} (intakeId=${existingIntake.id ?? "null"}, intakeMode=${existingIntake.intakeMode ?? "null"}, requestedMode=${input.mode}, confirmPermanentDeletion=${input.confirmPermanentDeletion ?? false}, requestId=${input.requestId ?? "none"}, performedAt=${performedAt})`,
            recordId: input.leadId,
            recordType: "lead",
            ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
          });
        }

        // ── Pending-deletion guard ─────────────────────────────────────────────────────────
        // Block the reset if any documents for this lead are in 'deletion-pending' state.
        // These documents are mid-deletion: their DB rows exist but S3 deletion is in progress
        // or has failed and is awaiting retry. Allowing a reset while deletions are pending
        // could cause the Heartbeat retry to operate on documents that have been re-classified
        // or re-used, leading to data corruption.
        //
        // The client should surface a clear message: "Storage cleanup is in progress. Please
        // wait for the retry job to complete (runs every 30 minutes) and try again."
        const pendingCount = await countPendingDeletionDocuments(input.leadId);
        if (pendingCount > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "pending_storage_deletions",
            cause: { pendingCount },
          });
        }

        // Extract all docIds referenced in the intake
        const docIds = extractDocIdsFromIntake(existingIntake);

        let archivedIds: number[] = [];
        let permanentlyDeletedIds: number[] = [];
        let pendingStorageIds: number[] = [];

        // Resolve patientId for OR-filter in archive/delete (Correction 5)
        const linkedPatientIdForReset = await resolveLinkedPatientId(input.leadId);

        if (input.mode === "archive") {
          // Non-destructive: mark documents as historical, preserve S3 + translations
          await archiveIntakeDocuments(input.leadId, linkedPatientIdForReset ?? null, existingIntake?.id ?? 0, docIds);
          archivedIds = docIds;
        } else {
          // Destructive: delete documents, translations, and S3 objects
          const deleteResult = await permanentlyDeleteIntakeDocuments(input.leadId, linkedPatientIdForReset ?? null, docIds);
          permanentlyDeletedIds = deleteResult?.deleted ?? [];
          pendingStorageIds = deleteResult?.storagePending ?? [];
        }

        // Delete the intake row (both modes)
        await deleteIntakeByLeadId(input.leadId);

        // Completion audit
        if (existingIntake) {
          await logAudit({
            userId: staffId,
            userName: staffName,
            userRole: ctx.user?.role,
            action: input.mode === "archive" ? "archive_reset_health_record_completed" : "permanent_delete_reset_health_record_completed",
            category: "lead",
            description: `Reset completed: executedMode=${input.mode}, archivedIds=[${archivedIds.join(",")}], permanentlyDeletedIds=[${permanentlyDeletedIds.join(",")}], pendingStorageIds=[${pendingStorageIds.join(",")}]`,
            recordId: input.leadId,
            recordType: "lead",
            ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
          });
        }

        // Return linkedPatientId so the client can cross-invalidate patients.documents and patients.getIntake
        // (linkedPatientIdForReset was already resolved above for the OR-filter)
        return {
          success: true,
          executedMode: input.mode,
          mode: input.mode, // backward compat
          documentsProcessed: docIds.length,
          archivedIds,
          permanentlyDeletedIds,
          pendingStorageIds,
          linkedPatientId: linkedPatientIdForReset ?? null,
        };
      }),

    // ── Admin-only: Get server-calculated scope for the Resolve Conflict dialog ──
    // Correction 6: server-calculated scope query so the dialog shows accurate data.
    getConflictScope: adminProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => {
        const scope = await getConflictScope(input.leadId);
        if (!scope) return null;
        return scope;
      }),

    // ── Admin-only: Resolve an intake conflict by deleting both rows and creating a new canonical row ──
    resolveConflict: adminProcedure
      .input(z.object({
        leadId: z.number(),
        // Correction 3: patientId is no longer accepted from the client — resolved server-side
        requestId: z.string().uuid(),
        expectedLeadIntakeId: z.number(),
        expectedPatientIntakeId: z.number(),
        // Correction 2: stale-state revalidation timestamps
        expectedLeadUpdatedAt: z.date(),
        expectedPatientUpdatedAt: z.date(),
        docHandling: z.enum(["archive", "delete"]),
        newIntakeMode: z.enum(["female", "male", "general"]),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify the caller is an admin (already enforced by adminProcedure middleware)
        // Verify the lead exists and the caller has access
        const lead = await getLeadById(input.leadId);
        if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
        try {
          const result = await resolveIntakeConflict({
            leadId: input.leadId,
            requestId: input.requestId,
            expectedLeadIntakeId: input.expectedLeadIntakeId,
            expectedPatientIntakeId: input.expectedPatientIntakeId,
            expectedLeadUpdatedAt: input.expectedLeadUpdatedAt,
            expectedPatientUpdatedAt: input.expectedPatientUpdatedAt,
            docHandling: input.docHandling,
            newIntakeMode: input.newIntakeMode,
            resolvedBy: ctx.user.id,
          });
          return {
            success: true,
            newIntakeId: result.newIntakeId,
            archivedDocs: result.archivedDocs,
            deletedDocs: result.deletedDocs,
            storagePendingDocs: result.storagePendingDocs,
            idempotent: result.idempotent ?? false,
          };
        } catch (err: any) {
          if (err?.message === "conflict_already_resolved") {
            throw new TRPCError({ code: "CONFLICT", message: "The intake conflict has already been resolved. Please refresh the page." });
          }
          if (err?.message === "conflict_state_changed") {
            throw new TRPCError({ code: "CONFLICT", message: "The conflict state has changed since you loaded this page. Please refresh and try again." });
          }
          if (err?.message === "lead_intake_stale") {
            throw new TRPCError({ code: "CONFLICT", message: "The lead health record was modified since you loaded this page. Please refresh and try again." });
          }
          if (err?.message === "patient_intake_stale") {
            throw new TRPCError({ code: "CONFLICT", message: "The patient health record was modified since you loaded this page. Please refresh and try again." });
          }
          if (err?.message === "no_linked_patient") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "This lead has no linked patient. Cannot resolve conflict." });
          }
          // Correction 7 (v3): Handle concurrent duplicate requestId race.
          // MySQL errno 1062 (ER_DUP_ENTRY) means a concurrent request already committed
          // the same requestId. Re-read the log and return the idempotent result instead
          // of INTERNAL_SERVER_ERROR.
          const isDupEntry =
            err?.code === "ER_DUP_ENTRY" ||
            err?.errno === 1062 ||
            (typeof err?.message === "string" && err.message.includes("Duplicate entry"));
          if (isDupEntry) {
            try {
              const { getDb: _getDb } = await import("./db");
              const db = await _getDb();
              if (db) {
                const { conflictResolutionLog } = await import("../drizzle/schema");
                const { eq } = await import("drizzle-orm");
                const existing = await db
                  .select()
                  .from(conflictResolutionLog)
                  .where(eq(conflictResolutionLog.requestId, input.requestId))
                  .limit(1);
                if (existing.length > 0) {
                  const log = existing[0];
                  return {
                    success: true,
                    newIntakeId: log.newIntakeId ?? 0,
                    archivedDocs: (log.archivedDocs as number[]) ?? [],
                    deletedDocs: (log.deletedDocs as number[]) ?? [],
                    storagePendingDocs: (log.storagePendingDocs as number[]) ?? [],
                    idempotent: true,
                  };
                }
              }
            } catch {
              // Fall through to generic error
            }
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to resolve conflict. Please try again." });
        }
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteLead(input.id);
        await logAudit({
          userId: ctx.user?.id, userName: ctx.user?.name, userRole: ctx.user?.role,
          action: "delete_lead", category: "lead",
          description: `Deleted lead ID ${input.id}`,
          recordId: input.id, recordType: "lead",
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return { success: true };
      }),

    convert: staffOrAdminProcedure
      .input(z.object({
        leadId: z.number(),
        doctorIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await convertLeadToPatient(input.leadId, ctx.user.id);
        if (result.patientId && input.doctorIds && input.doctorIds.length > 0) {
          await setPatientDoctors(result.patientId, input.doctorIds, ctx.user.id);
        }
        return result;
      }),

    generateCaseSummary: staffOrAdminProcedure
      .input(z.object({ leadId: z.number() }))
      .mutation(async ({ input }) => {
        const lead = await getLeadById(input.leadId);
        if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
        const intake = await getMedicalIntake(input.leadId);

        // ── Helper: parse JSON array safely ──────────────────────────────────
        const parseArr = (v: any): any[] => {
          if (!v) return [];
          if (Array.isArray(v)) return v;
          try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
        };
        const parseObj = (v: any): Record<string, any> => {
          if (!v) return {};
          if (typeof v === "object" && !Array.isArray(v)) return v;
          try { return JSON.parse(v) ?? {}; } catch { return {}; }
        };

        // ── Helper: get latest entry per test name ────────────────────────────
        const latestPerTest = (tests: any[]): any[] => {
          const map = new Map<string, any>();
          for (const t of tests) {
            const name = (t.name ?? "").trim().toLowerCase();
            if (!name) continue;
            const existing = map.get(name);
            const tDate = t.reportDate || t.collectionDate || t.date || "";
            const eDate = existing ? (existing.reportDate || existing.collectionDate || existing.date || "") : "";
            if (!existing || tDate > eDate) map.set(name, t);
          }
          return Array.from(map.values());
        };

        // ── Helper: format test result ────────────────────────────────────────
        const fmtTest = (t: any): string => {
          const parts: string[] = [t.name];
          if (t.resultSummary) parts.push(t.resultSummary);
          else if (t.result) parts.push(t.result);
          if (t.unit) parts.push(t.unit);
          if (t.referenceRange) parts.push(`(ref: ${t.referenceRange})`);
          if (t.interpretation) parts.push(`[${t.interpretation}]`);
          const d = t.reportDate || t.collectionDate || t.date;
          if (d) parts.push(`@ ${String(d).split("T")[0]}`);
          return parts.join(" ");
        };

        // ── Female lab tests (previousTests) — latest per test ────────────────
        const femaleTests = latestPerTest(parseArr(intake?.previousTests));
        const femaleTestsStr = femaleTests.length > 0 ? femaleTests.map(fmtTest).join("\n  ") : "";

        // ── Radiology studies ─────────────────────────────────────────────────
        const radiology = parseArr(intake?.radiologyStudies);
        const radiologyStr = radiology.length > 0
          ? radiology.map((r: any) => {
              const parts = [r.type ?? "Study"];
              if (r.date) parts.push(`@ ${String(r.date).split("T")[0]}`);
              if (r.performedBy) parts.push(`by ${r.performedBy}`);
              if (r.findings) parts.push(`Findings: ${r.findings}`);
              if (r.conclusion) parts.push(`Conclusion: ${r.conclusion}`);
              if (r.tvus) {
                const tv = r.tvus;
                const tvParts: string[] = [];
                if (tv.endometrialThickness) tvParts.push(`EMT ${tv.endometrialThickness}mm`);
                if (tv.rightOvaryAFC != null || tv.leftOvaryAFC != null) tvParts.push(`AFC R:${tv.rightOvaryAFC ?? "?"} L:${tv.leftOvaryAFC ?? "?"}`);
                if (tvParts.length) parts.push(`(${tvParts.join(", ")})`);
              }
              if (r.hsg) {
                const h = r.hsg;
                const hParts: string[] = [];
                if (h.uterineCavity) hParts.push(`Cavity: ${h.uterineCavity}`);
                if (h.rightTubePatency) hParts.push(`R-tube: ${h.rightTubePatency}`);
                if (h.leftTubePatency) hParts.push(`L-tube: ${h.leftTubePatency}`);
                if (hParts.length) parts.push(`(${hParts.join(", ")})`);
              }
              return parts.join(" | ");
            }).join("\n  ")
          : "";

        // ── Miscarriage history ───────────────────────────────────────────────
        const miscarriages = parseArr(intake?.miscarriageHistory);
        const miscarriagesStr = miscarriages.length > 0
          ? miscarriages.map((m: any) => `${m.date ? String(m.date).split("T")[0] : "?"} GA:${m.gestationalAge ?? "?"} ${m.notes ?? ""}`.trim()).join("; ")
          : "";

        // ── ART history ───────────────────────────────────────────────────────
        const artHistoryArr = parseArr(intake?.artHistory);
        // Helper: format embryo details array for AI
        const fmtEmbryos = (arr: any[]) =>
          arr.map((e: any) => [
            e.stage, e.grade, e.gender,
            e.pgtStatus && e.pgtStatus !== "Not tested" ? `PGT:${e.pgtStatus}` : null,
            e.pgtNotes ? `(${e.pgtNotes})` : null,
          ].filter(Boolean).join("/")).join("; ");

        const artStr = artHistoryArr.length > 0
          ? artHistoryArr.map((a: any) => {
              const lines: string[] = [];
              // Header line
              const header = [a.type ?? "ART"];
              if (a.date) header.push(String(a.date).split("T")[0]);
              if (a.clinic) header.push(`at ${a.clinic}`);
              if (a.protocol) header.push(`protocol:${a.protocol}`);
              if (a.donorType) header.push(`donor:${a.donorType}`);
              lines.push(header.join(" "));
              // Egg / embryo counts
              if (a.eggsCollected != null) lines.push(`  Eggs collected: ${a.eggsCollected}`);
              if (a.embryosFertilized != null) lines.push(`  Fertilized (2PN): ${a.embryosFertilized}`);
              // Transferred — use correct field name
              const tc = a.transferredCount ?? a.embryosTransferred;
              if (tc != null) lines.push(`  Transferred: ${tc}`);
              const tEmbs: any[] = Array.isArray(a.transferredEmbryos) ? a.transferredEmbryos : [];
              if (tEmbs.length > 0) lines.push(`    Transferred embryos: ${fmtEmbryos(tEmbs)}`);
              // Frozen
              if (a.frozenCount != null) lines.push(`  Frozen: ${a.frozenCount}`);
              const fEmbs: any[] = Array.isArray(a.frozenEmbryos) ? a.frozenEmbryos : [];
              if (fEmbs.length > 0) lines.push(`    Frozen embryos: ${fmtEmbryos(fEmbs)}`);
              // Second collection
              if (a.hasSecondCollection && a.secondCollection) {
                const sc = a.secondCollection;
                lines.push(`  Second collection: eggs:${sc.eggsCollected ?? "?"}, fertilized:${sc.embryosFertilized ?? "?"}, transferred:${sc.transferredCount ?? "?"}, frozen:${sc.frozenCount ?? "?"}`);
              }
              // FET-specific
              if (a.type === "FET") {
                if (a.fetProtocol) lines.push(`  FET protocol: ${a.fetProtocol}`);
                const fetEmbs: any[] = Array.isArray(a.fetEmbryos) ? a.fetEmbryos : [];
                if (fetEmbs.length > 0) lines.push(`  FET embryos: ${fmtEmbryos(fetEmbs)}`);
              }
              // IUI-specific
              if (a.type === "IUI") {
                if (a.iuiStimulation) lines.push(`  Stimulation: ${a.iuiStimulation}`);
                if (a.iuiFollicleCount != null) lines.push(`  Follicles: ${a.iuiFollicleCount}`);
                if (a.iuiSpermSource) lines.push(`  Sperm source: ${a.iuiSpermSource}`);
              }
              // OI-specific
              if (a.type === "OI") {
                if (a.oiMedication) lines.push(`  Medication: ${a.oiMedication}`);
                if (a.oiFollicleCount != null) lines.push(`  Follicles: ${a.oiFollicleCount}`);
              }
              // Outcome + notes (notes is the free-text field in the form)
              if (a.outcome) lines.push(`  Outcome: ${a.outcome}`);
              if (a.notes) lines.push(`  Notes: ${a.notes}`);
              return lines.join("\n");
            }).join("\n\n")
          : "";

        // ── Surgical history ──────────────────────────────────────────────────
        const surgicalHistoryArr = parseArr(intake?.surgicalHistory);
        const surgicalStr = surgicalHistoryArr.length > 0
          ? surgicalHistoryArr.map((s: any) => `${s.procedure ?? "Procedure"}${s.date ? " (" + String(s.date).split("T")[0] + ")" : ""}${s.notes ? ": " + s.notes : ""}`).join("; ")
          : "";

        // ── Systemic diseases ─────────────────────────────────────────────────
        const sysDiseases = parseObj(intake?.systemicDiseases);
        const activeDiseases = Object.entries(sysDiseases)
          .filter(([k, v]) => k !== "other" && v === true).map(([k]) => k);
        if (sysDiseases.other) activeDiseases.push(sysDiseases.other as string);
        const sysDiseasesStr = activeDiseases.length > 0 ? activeDiseases.join(", ") : "";

        // ── Contraceptive history ─────────────────────────────────────────────
        const contraceptive = parseArr(intake?.contraceptiveHistory);
        const contraceptiveStr = contraceptive.length > 0
          ? contraceptive.map((c: any) => `${c.method ?? "?"}${c.duration ? " for " + c.duration : ""}${c.stoppedDate ? ", stopped " + String(c.stoppedDate).split("T")[0] : ""}`).join("; ")
          : "";

        // ── Family history ────────────────────────────────────────────────────
        const familyFlags: string[] = [];
        if (intake?.familyBreastCancer) familyFlags.push("breast cancer");
        if (intake?.familyEarlyMenopause) familyFlags.push("early menopause");
        if (intake?.familyInfertility) familyFlags.push("infertility");
        if (intake?.hereditaryDiseases) familyFlags.push(intake.hereditaryDiseases);
        if (intake?.consanguinity) familyFlags.push("consanguinity");
        const familyStr = familyFlags.length > 0 ? familyFlags.join(", ") : "";

        // ── Male partner intake ───────────────────────────────────────────────
        const maleIntakeData = parseObj(intake?.maleIntake);
        const maleSemen: any[] = parseArr(maleIntakeData.semenAnalysis);
        const latestSemen = maleSemen.sort((a, b) => (b.date ?? "") > (a.date ?? "") ? 1 : -1)[0];
        const semenStr = latestSemen
          ? [
              `Date: ${latestSemen.date ?? "?"}`,
              latestSemen.volume ? `Volume: ${latestSemen.volume} mL` : "",
              latestSemen.concentration ? `Concentration: ${latestSemen.concentration}` : "",
              latestSemen.totalMotility ? `Total motility: ${latestSemen.totalMotility}%` : "",
              latestSemen.progressiveMotility ? `Progressive: ${latestSemen.progressiveMotility}%` : "",
              latestSemen.morphology ? `Morphology: ${latestSemen.morphology}%` : "",
              latestSemen.notes ? `Notes: ${latestSemen.notes}` : "",
            ].filter(Boolean).join(", ")
          : "";

        const maleDna: any[] = parseArr(maleIntakeData.dnaFragmentation);
        const latestDna = maleDna.sort((a, b) => (b.date ?? "") > (a.date ?? "") ? 1 : -1)[0];
        const dnaStr = latestDna
          ? `DFI: ${latestDna.dfi ?? "?"}%${latestDna.hds ? ", HDS: " + latestDna.hds + "%" : ""}${latestDna.method ? " (" + latestDna.method + ")" : ""}${latestDna.date ? " @ " + String(latestDna.date).split("T")[0] : ""}`
          : "";

        const maleTests = latestPerTest(parseArr(maleIntakeData.previousTests));
        const maleTestsStr = maleTests.length > 0 ? maleTests.map(fmtTest).join("\n  ") : "";

        const maleGeneticTests: any[] = parseArr(maleIntakeData.geneticTests);
        const maleGeneticStr = maleGeneticTests.length > 0
          ? maleGeneticTests.map((g: any) => `${g.test ?? "?"}${g.result ? ": " + g.result : ""}${g.date ? " @ " + String(g.date).split("T")[0] : ""}`).join("; ")
          : "";

        const maleSysDiseases = parseObj(maleIntakeData.systemicDiseases);
        const maleDiseaseFlags = Object.entries(maleSysDiseases)
          .filter(([k, v]) => k !== "other" && v === true).map(([k]) => k);
        if (maleSysDiseases.other) maleDiseaseFlags.push(maleSysDiseases.other as string);
        const maleSysStr = maleDiseaseFlags.length > 0 ? maleDiseaseFlags.join(", ") : "";

        // ── Fertility diagnosis from lead ─────────────────────────────────────
        const femaleDx = Array.isArray(lead.fertilityDiagnosis) ? (lead.fertilityDiagnosis as string[]).join(", ") : (lead.fertilityDiagnosis ?? "");
        const maleDx = Array.isArray(lead.maleFertilityDiagnosis) ? (lead.maleFertilityDiagnosis as string[]).join(", ") : (lead.maleFertilityDiagnosis ?? "");
        const ivfExp = (lead as any).ivfExperience && (lead as any).ivfExperience !== "never-tried" ? (lead as any).ivfExperience : "";

        // ── Build context string ──────────────────────────────────────────────
        const contextLines: string[] = [
          `Patient: ${lead.firstName} ${lead.lastName}`,
          (lead as any).gender ? `Gender: ${(lead as any).gender}` : "",
          lead.nationality ? `Nationality: ${lead.nationality}` : "",
          lead.dateOfBirth ? `DOB: ${new Date(lead.dateOfBirth).toISOString().split("T")[0]}` : "",
          // Fertility overview
          femaleDx ? `Female fertility diagnosis: ${femaleDx}` : "",
          maleDx ? `Male fertility diagnosis: ${maleDx}` : "",
          ivfExp ? `IVF experience: ${ivfExp}` : "",
          intake?.infertilityType ? `Infertility type: ${intake.infertilityType}` : "",
          intake?.infertilityDuration ? `Duration trying: ${intake.infertilityDuration}` : "",
          // Obstetric history
          intake?.gravida != null ? `Obstetric: G${intake.gravida} P${intake.para ?? 0} A${intake.abortus ?? 0}, Living children: ${intake.livingChildren ?? 0}` : "",
          miscarriagesStr ? `Miscarriage history: ${miscarriagesStr}` : "",
          // Menstrual history
          intake?.lastMenstrualPeriod ? `LMP: ${new Date(intake.lastMenstrualPeriod).toISOString().split("T")[0]}` : "",
          intake?.cycleRegularity ? `Cycle: ${intake.cycleRegularity}${intake.cycleLengthDays ? ", " + intake.cycleLengthDays + " days" : ""}${intake.menstrualFlowDays ? ", flow " + intake.menstrualFlowDays + " days" : ""}${intake.dysmenorrhea ? ", dysmenorrhea" : ""}` : "",
          // Physical
          intake?.heightCm || intake?.weightKg ? `Body: ${intake.heightCm ? intake.heightCm + " cm" : "?"} / ${intake.weightKg ? intake.weightKg + " kg" : "?"} BMI ${intake.bmi ?? "?"}` : "",
          intake?.hirsutism ? "Hirsutism: Yes" : "",
          // Lifestyle
          intake?.smoking && intake.smoking !== "never" ? `Smoking: ${intake.smoking}${intake.smokingPacksPerDay ? " (" + intake.smokingPacksPerDay + " packs/day)" : ""}` : "",
          intake?.alcohol && intake.alcohol !== "never" ? `Alcohol: ${intake.alcohol}` : "",
          // ART history
          artStr ? `ART / IVF history:\n  ${artStr}` : "",
          // Surgical history
          surgicalStr ? `Surgical history: ${surgicalStr}` : "",
          // Contraceptive history
          contraceptiveStr ? `Contraceptive history: ${contraceptiveStr}` : "",
          // Systemic diseases
          sysDiseasesStr ? `Systemic diseases (female): ${sysDiseasesStr}` : "",
          // Family history
          familyStr ? `Family history: ${familyStr}` : "",
          // Medications & allergies
          intake?.currentMedications ? `Current medications: ${intake.currentMedications}` : "",
          intake?.allergies ? `Allergies: ${intake.allergies}` : "",
          // Female lab tests (latest per test)
          femaleTestsStr ? `Female lab results (latest per test):\n  ${femaleTestsStr}` : "",
          // Radiology
          radiologyStr ? `Radiology / Imaging:\n  ${radiologyStr}` : "",
          // Male partner
          semenStr ? `Male partner — Semen analysis (latest): ${semenStr}` : "",
          dnaStr ? `Male partner — DNA fragmentation: ${dnaStr}` : "",
          maleTestsStr ? `Male partner — Lab results (latest per test):\n  ${maleTestsStr}` : "",
          maleGeneticStr ? `Male partner — Genetic tests: ${maleGeneticStr}` : "",
          maleSysStr ? `Male partner — Systemic diseases: ${maleSysStr}` : "",
          maleIntakeData.currentMedications ? `Male partner — Medications: ${maleIntakeData.currentMedications}` : "",
          maleIntakeData.allergies ? `Male partner — Allergies: ${maleIntakeData.allergies}` : "",
          maleIntakeData.additionalNotes ? `Male partner — Notes: ${maleIntakeData.additionalNotes}` : "",
          // Additional notes
          intake?.additionalNotes ? `Additional clinical notes: ${intake.additionalNotes}` : "",
        ];
	        const context = contextLines.filter(Boolean).join("\n");

	        const response = await invokeLLM({
	          workloadId: "clinical_case_summary",
	          messages: [
            { role: "system", content: "You are a senior medical coordinator at a fertility clinic. Write a comprehensive, professional case summary for the medical team based on all the patient intake information provided. Cover: patient background, fertility history, obstetric history, menstrual history, ART/IVF experience, lab results (highlight abnormal values), radiology findings, male partner data if available, systemic diseases, lifestyle factors, and family history. Write in 3-5 paragraphs using clinical language. Only mention sections for which data is available." },
            { role: "user", content: `Please generate a comprehensive case summary for this patient:\n\n${context}` },
          ],
        });
        const summary = response.choices?.[0]?.message?.content ?? "";
        if (!summary) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI failed to generate summary" });
        await updateLead(input.leadId, { caseSummary: summary } as any); // eslint-disable-line
        return { summary };
      }),

    generateSalesNote: staffOrAdminProcedure
      .input(z.object({ leadId: z.number() }))
      .mutation(async ({ input }) => {
        const lead = await getLeadById(input.leadId);
        if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
        const intake = await getMedicalIntake(input.leadId);

        const context = [
          `Lead: ${lead.firstName} ${lead.lastName}`,
          lead.nationality ? `Nationality: ${lead.nationality}` : "",
          lead.budgetRange ? `Budget: ${lead.budgetRange}` : "",
          lead.decisionTimeline ? `Decision timeline: ${lead.decisionTimeline}` : "",
          lead.travelReadiness ? `Travel readiness: ${lead.travelReadiness}` : "",
          lead.leadSource ? `Lead source: ${lead.leadSource}` : "",
          intake?.infertilityDuration ? `Trying for: ${intake.infertilityDuration}` : "",
          intake?.gravida != null ? `Gravida/Para: ${intake.gravida}/${intake.para ?? 0}` : "",
          intake?.artHistory ? `ART history: ${typeof intake.artHistory === "string" ? intake.artHistory : JSON.stringify(intake.artHistory)}` : "",
          (lead as any).caseSummary ? `Previous notes: ${(lead as any).caseSummary}` : "",
	        ].filter(Boolean).join("\n");

	        const response = await invokeLLM({
	          workloadId: "sales_note_generation",
	          messages: [
            { role: "system", content: "You are a patient coordinator at a fertility clinic. Write a brief, empathetic sales note to help the team understand how to approach this potential patient. Highlight their key concerns, motivations, and what treatment options might be most relevant. Keep it to 2 paragraphs, professional but warm." },
            { role: "user", content: `Generate a sales note for this lead:\n\n${context}` },
          ],
        });
        const note = response.choices?.[0]?.message?.content ?? "";
        if (!note) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI failed to generate note" });
        await updateLead(input.leadId, { salesNote: note } as any);
        return { note };
      }),
    // ─── Couple / Partner procedures ──────────────────────────────────────────
    linkPartner: staffOrAdminProcedure
      .input(z.object({ leadId: z.number(), partnerId: z.number() }))
      .mutation(async ({ input }) => {
        await linkLeadPartner(input.leadId, input.partnerId);
        return { success: true };
      }),
    unlinkPartner: staffOrAdminProcedure
      .input(z.object({ leadId: z.number() }))
      .mutation(async ({ input }) => {
        await unlinkLeadPartner(input.leadId);
        return { success: true };
      }),
    getPartner: staffOrAdminProcedure
      .input(z.object({ leadId: z.number() }))
      .query(({ input }) => getLeadPartner(input.leadId)),

    // ─── Phase 1: Informational metadata procedures ───────────────────────────
    // updateContactRole: sets contactRole and serviceFor on a lead (informational only)
    updateContactRole: staffOrAdminProcedure
      .input(z.object({
        leadId: z.number(),
        contactRole: z.enum(["female-patient","male-patient","husband-for-couple","wife-for-couple","family-member","agent","unknown"]).nullable().optional(),
        serviceFor: z.enum(["female-only","male-only","couple"]).nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { leadId, contactRole, serviceFor } = input;
        const { leads: leadsTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { getDb } = await import("./db");
        const dbConn = await getDb();
        if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const updateData: Record<string, unknown> = {};
        if (contactRole !== undefined) updateData.contactRole = contactRole;
        if (serviceFor !== undefined) updateData.serviceFor = serviceFor;
        await dbConn.update(leadsTable)
          .set(updateData as any)
          .where(eq(leadsTable.id, leadId));
        return { success: true };
      }),

    // getPendingPartnerData: returns the maleIntake JSON from a lead's medical_intake
    // Used to show the Pending Partner Data banner when a partner lead has not yet been created
    getPendingPartnerData: staffOrAdminProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => {
        const { medicalIntake: medicalIntakeTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { getDb } = await import("./db");
        const dbConn = await getDb();
        if (!dbConn) return { hasPendingData: false, maleIntake: null, migrated: false };
        const intake = await dbConn.select({
          id: medicalIntakeTable.id,
          maleIntake: medicalIntakeTable.maleIntake,
          maleIntakeMigrated: (medicalIntakeTable as any).maleIntakeMigrated,
          maleIntakeMigratedAt: (medicalIntakeTable as any).maleIntakeMigratedAt,
        })
          .from(medicalIntakeTable)
          .where(eq(medicalIntakeTable.leadId, input.leadId))
          .limit(1);
        if (!intake[0]) return { hasPendingData: false, maleIntake: null, migrated: false };
        const row = intake[0];
        const maleData = row.maleIntake as Record<string, unknown> | null;
        const hasMeaningfulData = maleData && Object.keys(maleData).some(k => {
          const v = maleData[k];
          return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
        });
        return {
          hasPendingData: !!hasMeaningfulData && !row.maleIntakeMigrated,
          maleIntake: hasMeaningfulData ? maleData : null,
          migrated: !!row.maleIntakeMigrated,
          intakeId: row.id,
        };
      }),

    // Phase 2 — get the partner's own medical_intake by the partner's leadId
    getPartnerIntake: staffOrAdminProcedure
      .input(z.object({ partnerLeadId: z.number() }))
      .query(async ({ input }) => {
        const intake = await getMedicalIntake(input.partnerLeadId);
        return intake ?? null;
      }),

    // Phase 2 — create an empty medical_intake record for a partner lead (no data copy)
    createPartnerIntake: staffOrAdminProcedure
      .input(z.object({
        partnerLeadId: z.number(),
        intakeMode: z.enum(["female", "male", "general"]).optional(),
      }))
      .mutation(async ({ input }) => {
        // Check if intake already exists
        const existing = await getMedicalIntake(input.partnerLeadId);
        if (existing) return { success: true, intakeId: existing.id, alreadyExisted: true };
        // Phase 2 fix: infer intakeMode from partner lead's gender if not explicitly provided
        let resolvedMode: "female" | "male" | "general" = input.intakeMode ?? "general";
        if (!input.intakeMode) {
          const partnerLead = await getLeadById(input.partnerLeadId);
          if (partnerLead?.gender === "female") resolvedMode = "female";
          else if (partnerLead?.gender === "male") resolvedMode = "male";
          else resolvedMode = "general"; // unknown / other / missing → general
        }
        // Create empty record — no data copy, no maleIntake movement
        await upsertMedicalIntake(input.partnerLeadId, {
          intakeMode: resolvedMode,
        } as any);
        const created = await getMedicalIntake(input.partnerLeadId);
        return { success: true, intakeId: created?.id ?? null, alreadyExisted: false, inferredMode: resolvedMode };
      }),

    convertCouple: staffOrAdminProcedure
      .input(z.object({ lead1Id: z.number(), lead2Id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await convertCoupleToPatients(input.lead1Id, input.lead2Id, ctx.user.id);
        return result;
      }),

    linkToExistingPatient: staffOrAdminProcedure
      .input(z.object({
        leadId: z.number(),
        patientId: z.number(),
        resolveIntakeConflict: z.enum(["useLeadIntake", "usePatientIntake"]).optional(),
        /** Stamp the patient's gender with the lead's gender when patient gender is missing */
        stampPatientGender: z.boolean().optional(),
        /** Caller has confirmed the DOB minor-mismatch warning and wants to proceed */
        confirmDobWarning: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await linkLeadToExistingPatient({
          leadId: input.leadId,
          patientId: input.patientId,
          resolveIntakeConflict: input.resolveIntakeConflict,
          stampPatientGender: input.stampPatientGender,
          confirmDobWarning: input.confirmDobWarning,
        });
        return result;
      }),

    searchPatientsForLink: staffOrAdminProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(async ({ input }) => {
        // Search patients by name, phone, or MRN for the Link to Existing Patient dialog
        const { getDb } = await import("./db");
        const { patients } = await import("../drizzle/schema");
        const { or, like } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return [];
        const q = `%${input.query}%`;
        const rows = await db
          .select({
            id: patients.id,
            firstName: patients.firstName,
            lastName: patients.lastName,
            phone: patients.phone,
            mrn: patients.mrn,
            gender: patients.gender,
            dateOfBirth: patients.dateOfBirth,
            socialLeadId: patients.socialLeadId,
          })
          .from(patients)
          .where(or(
            like(patients.firstName, q),
            like(patients.lastName, q),
            like(patients.phone, q),
            like(patients.mrn, q),
          ))
          .limit(20);
        return rows;
      }),
    bulkUpdate: staffOrAdminProcedure
      .input(z.object({
        ids: z.array(z.number()).min(1),
        data: z.object({
          assignedStaffId: z.number().nullable().optional(),
          leadStatus: z.enum(["intake","attempted-to-contact","contacted-awaiting-info","medical-reports-received","doctor-feedback-shared","follow-up-negotiation","ready-to-travel","converted","cold","lost","not-qualified","junk"]).optional(),
          brand: z.enum(["fertiliv","safemedigo","dr-nilay-karaca"]).optional(),
          leadSource: z.enum(["paid","employee-referral","external-referral","website","maps","partner","public-relations","instagram","tiktok","doctor-referral","youtube","facebook","awatef-guide","salim-guide","organic"]).optional(),
          rating: z.string().optional(),
          tags: z.string().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await bulkUpdateLeads(input.ids, input.data as any);
        return { updated: input.ids.length };
      }),
    bulkDelete: adminProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input }) => {
        await bulkDeleteLeads(input.ids);
        return { deleted: input.ids.length };
      }),

    merge: staffOrAdminProcedure
      .input(z.object({
        survivingLeadId: z.number(),
        duplicateLeadId: z.number(),
        // Chosen field values (from either lead) to apply to the surviving lead
        chosenFields: z.object({
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          nationality: z.string().optional(),
          country: z.string().optional(),
          city: z.string().optional(),
          gender: z.string().optional(),
          leadStatus: z.string().optional(),
          rating: z.string().optional(),
          leadSource: z.string().optional(),
          brand: z.string().optional(),
          assignedStaffId: z.number().optional(),
          preferredLanguages: z.array(z.string()).optional(),
          preferredContactMethod: z.string().optional(),
          budgetRange: z.string().optional(),
          decisionTimeline: z.string().optional(),
          travelReadiness: z.string().optional(),
          ivfExperience: z.string().optional(),
          mainMedicalInterest: z.union([z.string(), z.array(z.string())]).optional(),
          fertilityDiagnosis: z.array(z.string()).optional(),
          tags: z.string().optional(),
          notes: z.string().optional(),
          // Secondary fields for preserving both values
          secondaryPhone: z.string().optional(),
          secondaryEmail: z.string().optional(),
        }),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import("./db");
        const {
          leads: leadsTable,
          leadCommunications,
          tasks: tasksTable,
          salesNotes,
          salesTasks,
          treatmentProposals,
          leadDocuments,
          medicalIntake,
        } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const dbConn = await getDb();
        if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const surviving = await dbConn.select().from(leadsTable).where(eq(leadsTable.id, input.survivingLeadId)).limit(1);
        const duplicate = await dbConn.select().from(leadsTable).where(eq(leadsTable.id, input.duplicateLeadId)).limit(1);
        if (!surviving.length) throw new TRPCError({ code: "NOT_FOUND", message: "Surviving lead not found" });
        if (!duplicate.length) throw new TRPCError({ code: "NOT_FOUND", message: "Duplicate lead not found" });
        // 1. Apply chosen field values to the surviving lead
        // Pass arrays directly — Drizzle handles json columns natively (no manual stringify needed)
        const chosenFieldsToSave: Record<string, any> = { ...input.chosenFields };
        await dbConn.update(leadsTable)
          .set({
            ...chosenFieldsToSave,
            modifiedBy: ctx.user.id,
            modifiedAt: new Date(),
          } as any)
          .where(eq(leadsTable.id, input.survivingLeadId));

        // 2. Transfer all notes/communications from duplicate → surviving
        await dbConn.update(leadCommunications)
          .set({ leadId: input.survivingLeadId })
          .where(eq(leadCommunications.leadId, input.duplicateLeadId));

        // 3. Transfer tasks
        await dbConn.update(tasksTable)
          .set({ leadId: input.survivingLeadId })
          .where(eq(tasksTable.leadId, input.duplicateLeadId));

        // 4. Transfer sales notes
        await dbConn.update(salesNotes)
          .set({ leadId: input.survivingLeadId })
          .where(eq(salesNotes.leadId, input.duplicateLeadId));

        // 5. Transfer sales tasks
        await dbConn.update(salesTasks)
          .set({ leadId: input.survivingLeadId })
          .where(eq(salesTasks.leadId, input.duplicateLeadId));

        // 6. Transfer treatment proposals
        await dbConn.update(treatmentProposals)
          .set({ leadId: input.survivingLeadId })
          .where(eq(treatmentProposals.leadId, input.duplicateLeadId));

        // 7. Transfer lead documents
        await dbConn.update(leadDocuments)
          .set({ leadId: input.survivingLeadId })
          .where(eq(leadDocuments.leadId, input.duplicateLeadId));

        // 8. Transfer medical intake if surviving doesn't have one
        const survivingIntake = await dbConn.select({ id: medicalIntake.id }).from(medicalIntake).where(eq(medicalIntake.leadId, input.survivingLeadId)).limit(1);
        if (!survivingIntake.length) {
          await dbConn.update(medicalIntake)
            .set({ leadId: input.survivingLeadId })
            .where(eq(medicalIntake.leadId, input.duplicateLeadId));
        }

        // 9. Mark duplicate as merged
        await dbConn.update(leadsTable)
          .set({
            mergedIntoLeadId: input.survivingLeadId,
            mergedAt: new Date(),
            leadStatus: "junk" as any,
          })
          .where(eq(leadsTable.id, input.duplicateLeadId));

        return { success: true, survivingLeadId: input.survivingLeadId };
      }),

    translateRadiology: staffOrAdminProcedure
      .input(z.object({
        fileUrl: z.string(),
        mimeType: z.string().optional(),
        targetLanguage: z.enum(["en", "ar", "tr"]),
      }))
      .mutation(async ({ input }) => {
        const langName: Record<string, string> = { en: "English", ar: "Arabic", tr: "Turkish" };
        const targetLangName = langName[input.targetLanguage] ?? "English";
        const isImage = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(input.mimeType ?? "");
        const isPdf = input.mimeType === "application/pdf";
        const systemPrompt = `You are a medical radiology report OCR and translation assistant. Extract all text from the document and translate it to ${targetLangName}. Present findings and measurements in a markdown table where applicable (columns: Parameter, Value/Finding). Return the translated content only, preserving the structure of the report.`;
        let translatedText = "";

	        if (isImage) {
	          // Single image: send directly to vision model
	          const fullUrl = input.fileUrl.startsWith("/") ? `http://localhost:${process.env.PORT ?? 3000}${input.fileUrl}` : input.fileUrl;
	          const res = await invokeLLM({
	            workloadId: "radiology_extraction",
	            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: [{ type: "image_url", image_url: { url: fullUrl } }, { type: "text", text: `OCR and translate this radiology report to ${targetLangName}.` }] },
            ],
          });
          translatedText = (res.choices?.[0]?.message?.content as string) ?? "Translation failed";

        } else if (isPdf) {
          // Multi-page PDF: split into page images and translate all pages in parallel
          const fullUrl = input.fileUrl.startsWith("/") ? `http://localhost:${process.env.PORT ?? 3000}${input.fileUrl}` : input.fileUrl;

          // Download the PDF buffer
          const pdfResponse = await fetch(fullUrl);
          if (!pdfResponse.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to download PDF for translation" });
          const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

          // Convert PDF pages to images (max 20 pages)
          const pageImages = await pdfToPageImages(pdfBuffer, 20);

          if (pageImages.length === 0) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not extract pages from PDF" });
          }

          // Translate all pages in parallel
	          const pageTranslations = await Promise.all(
	            pageImages.map(async (pageDataUrl, idx) => {
	              try {
	                const res = await invokeLLM({
	                  workloadId: "radiology_extraction",
	                  messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: [
                      { type: "image_url", image_url: { url: pageDataUrl } },
                      { type: "text", text: `OCR and translate page ${idx + 1} of this radiology report to ${targetLangName}. If the page contains no readable text, respond with "[blank page]".` },
                    ]},
                  ],
                });
                return (res.choices?.[0]?.message?.content as string) ?? "";
              } catch {
                return `[Page ${idx + 1} translation failed]`;
              }
            })
          );

          // Stitch pages together, skipping blank pages
          const nonBlankPages = pageTranslations.filter(
            (t) => t.trim() && t.trim().toLowerCase() !== "[blank page]"
          );

          if (nonBlankPages.length === 0) {
            translatedText = "No readable text found in this PDF.";
          } else if (nonBlankPages.length === 1) {
            translatedText = nonBlankPages[0];
          } else {
            translatedText = nonBlankPages
              .map((t, i) => `**— Page ${i + 1} —**\n\n${t}`)
              .join("\n\n---\n\n");
          }

        } else {
          translatedText = "Unsupported file type for AI extraction. Please upload a PDF or image file.";
        }
        return { translatedText, language: input.targetLanguage };
      }),

    extractSemenAnalysis: staffOrAdminProcedure
      .input(z.object({
        fileUrl: z.string(),
        mimeType: z.string().optional(),
        filePassword: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const systemPrompt = `You are a medical laboratory report extractor specializing in semen analysis (spermiyogram) and DNA fragmentation reports.

CRITICAL RULES:
1. ALL output values MUST be in ENGLISH regardless of the source language of the document. Even if the document is in Arabic, Turkish, Russian, Spanish, French, or any other language, you MUST translate ALL text values to English before returning them. This is mandatory and non-negotiable.
2. For categorical values (viscosity, appearance, agglutination, preparationMethod, method), always use standard English medical terms.
3. For free-text fields (labComment, notes), translate the content to English if it is in any other language.
4. Detect what type of report this is and set the "reportType" field accordingly:
   - "semenAnalysis" if the report contains only semen analysis (spermiyogram) data
   - "dnaFragmentation" if the report contains only DNA fragmentation data
   - "both" if the report contains both semen analysis and DNA fragmentation data
   - "unknown" if the report type cannot be determined

Extract ALL available fields from the provided document. Return a JSON object with three top-level keys: "reportType", "semenAnalysis", and "dnaFragmentation".

semenAnalysis fields (all optional strings, empty string "" if not found in the report):
- date (YYYY-MM format, e.g. "2024-03")
- volume (mL, numeric string only)
- concentration (million/mL, numeric string only)
- totalMotility (%, numeric string only)
- progressiveMotility (%, numeric string only)
- nonProgressiveMotility (%, numeric string only)
- immotilePercent (%, numeric string only)
- morphology (%, numeric string — Kruger or WHO)
- leukocyteCount (million/mL, numeric string only)
- ph (numeric string only)
- viscosity (English: "Normal", "Increased", "Decreased", or other English descriptor)
- appearance (English: "Normal", "Turbid", "Yellowish", or other English descriptor)
- liquefactionTime (minutes, numeric string only)
- agglutination (English: "None", "Mild", "Moderate", "Severe")
- abstinenceDays (days, numeric string only)
- preparationMethod (English: "PSSG", "Swim-up", "Density gradient", etc.)
- postPrepConcentration (million/mL, numeric string only)
- postPrepMotility (%, numeric string only)
- postPrepImmotile (%, numeric string only)
- postPrepForwardMotile (%, numeric string only)
- postPrepInPlaceMotile (%, numeric string only)
- labComment (translate to English if needed)
- notes (translate to English if needed)

dnaFragmentation fields (all optional strings, empty string "" if not found in the report):
- date (YYYY-MM format)
- dfi (DFI %, numeric string only)
- hds (HDS %, numeric string only)
- method (English: "SCSA", "TUNEL", "Comet", "SCD", etc.)
- notes (translate to English if needed)

IMPORTANT: If the report does NOT contain DNA fragmentation data, set all dnaFragmentation fields to empty string "". If the report does NOT contain semen analysis data, set all semenAnalysis fields to empty string "".
Return ONLY the JSON object. Use empty string "" for any field not found. Do not use null.`;

        const userContent: any[] = [];
        if (input.filePassword) {
          userContent.push({ type: "text", text: `Note: The following file is password-protected. Password: ${input.filePassword}` });
        }
        const isPdf = input.mimeType === "application/pdf" || input.fileUrl.toLowerCase().endsWith(".pdf");
        const fullUrl = input.fileUrl.startsWith("/") ? `http://localhost:${process.env.PORT ?? 3000}${input.fileUrl}` : input.fileUrl;
        if (isPdf) {
          userContent.push({ type: "file_url", file_url: { url: fullUrl, mime_type: "application/pdf" } });
        } else {
          userContent.push({ type: "image_url", image_url: { url: fullUrl, detail: "high" } });
        }
	        userContent.push({ type: "text", text: "Extract all semen analysis and DNA fragmentation values from this report. Return only the JSON object as described." });

	        const res = await invokeLLM({
	          workloadId: "laboratory_extraction",
	          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "semen_analysis_extraction",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  reportType: { type: "string", enum: ["semenAnalysis", "dnaFragmentation", "both", "unknown"] },
                  semenAnalysis: {
                    type: "object",
                    properties: {
                      date: { type: "string" }, volume: { type: "string" }, concentration: { type: "string" },
                      totalMotility: { type: "string" }, progressiveMotility: { type: "string" },
                      nonProgressiveMotility: { type: "string" }, immotilePercent: { type: "string" },
                      morphology: { type: "string" }, leukocyteCount: { type: "string" }, ph: { type: "string" },
                      viscosity: { type: "string" }, appearance: { type: "string" }, liquefactionTime: { type: "string" },
                      agglutination: { type: "string" }, abstinenceDays: { type: "string" },
                      preparationMethod: { type: "string" }, postPrepConcentration: { type: "string" },
                      postPrepMotility: { type: "string" }, postPrepImmotile: { type: "string" },
                      postPrepForwardMotile: { type: "string" }, postPrepInPlaceMotile: { type: "string" },
                      labComment: { type: "string" }, notes: { type: "string" },
                    },
                    required: ["date","volume","concentration","totalMotility","progressiveMotility","nonProgressiveMotility","immotilePercent","morphology","leukocyteCount","ph","viscosity","appearance","liquefactionTime","agglutination","abstinenceDays","preparationMethod","postPrepConcentration","postPrepMotility","postPrepImmotile","postPrepForwardMotile","postPrepInPlaceMotile","labComment","notes"],
                    additionalProperties: false,
                  },
                  dnaFragmentation: {
                    type: "object",
                    properties: {
                      date: { type: "string" }, dfi: { type: "string" }, hds: { type: "string" },
                      method: { type: "string" }, notes: { type: "string" },
                    },
                    required: ["date","dfi","hds","method","notes"],
                    additionalProperties: false,
                  },
                },
                required: ["reportType","semenAnalysis","dnaFragmentation"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = res.choices?.[0]?.message?.content ?? '{"reportType":"unknown","semenAnalysis":{},"dnaFragmentation":{}}';
        let parsed: any = { reportType: "unknown", semenAnalysis: {}, dnaFragmentation: {} };
        try {
          parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
        } catch { /* ignore parse errors */ }
        // Determine if DNA fragmentation data is actually present (has at least one non-empty field)
        const dnaData = parsed.dnaFragmentation ?? {};
        const hasDnaData = Object.values(dnaData).some((v) => typeof v === "string" && (v as string).trim() !== "");
        return {
          reportType: (parsed.reportType ?? "unknown") as "semenAnalysis" | "dnaFragmentation" | "both" | "unknown",
          semenAnalysis: parsed.semenAnalysis ?? {},
          dnaFragmentation: hasDnaData ? dnaData : null,
        };
      }),
  }),

  // ─── Partner Clinics ───────────────────────────────────────────────────────
  partnerClinics: router({
    list: protectedProcedure.query(() => getPartnerClinics()),

    create: staffOrAdminProcedure
      .input(z.object({
        name: z.string().min(1),
        specialty: z.string().optional(),
        address: z.string().optional(),
        googleMapsUrl: z.string().url("Enter a valid Google Maps URL.").max(2048).optional(),
        phone: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const code = await getNextCode("partner_clinic");
        return createPartnerClinic({ ...input, code } as any);
      }),
    update: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          name: z.string().optional(),
          specialty: z.string().optional(),
          address: z.string().optional(),
          googleMapsUrl: z.string().url("Enter a valid Google Maps URL.").max(2048).nullable().optional(),
          phone: z.string().optional(),
          notes: z.string().optional(),
          isActive: z.boolean().optional(),
        }),
      }))
      .mutation(({ input }) => updatePartnerClinic(input.id, input.data as any)),

    delete: staffOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deletePartnerClinic(input.id)),
  }),

  // ─── System Settings ────────────────────────────────────────────────────────────
  settings: router({
    get: protectedProcedure.query(async () => {
      const { getSystemSettings } = await import("./db");
      return getSystemSettings();
    }),
    set: adminProcedure
      .input(z.object({ key: z.string(), value: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { setSystemSetting } = await import("./db");
        await setSystemSetting(input.key, input.value, ctx.user.id);
        return { success: true };
      }),
    // Get exchange rates from DB cache (with metadata)
    getExchangeRates: protectedProcedure.query(async () => {
      const { getOrFetchExchangeRates } = await import("./exchangeRateService");
      const result = await getOrFetchExchangeRates();
      return result;
    }),

    // Manual override for a specific currency
    setManualRate: adminProcedure
      .input(z.object({
        currency: z.string(),
        rate: z.number().positive(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { setManualOverride } = await import("./exchangeRateService");
        await setManualOverride(input.currency, input.rate, ctx.user.id);
        return { success: true };
      }),

    // Clear manual override — let auto-fetch take over
    clearManualRate: adminProcedure
      .input(z.object({ currency: z.string() }))
      .mutation(async ({ input }) => {
        const { clearManualOverride } = await import("./exchangeRateService");
        await clearManualOverride(input.currency);
        return { success: true };
      }),

    // Bulk save pricing rules (markup %, surcharge %)
    bulkSetExchangeRates: adminProcedure
      .input(z.object({
        foreignMarkupPct: z.string().optional(),
        cardSurchargePct: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { setSystemSetting } = await import("./db");
        const entries: [string, string][] = [];
        if (input.foreignMarkupPct !== undefined) entries.push(["foreign_price_markup_pct", input.foreignMarkupPct]);
        if (input.cardSurchargePct !== undefined) entries.push(["card_surcharge_pct", input.cardSurchargePct]);
        for (const [key, value] of entries) {
          await setSystemSetting(key, value, ctx.user.id);
        }
        return { updated: entries.length };
      }),
    bulkAdjustPrices: adminProcedure
      .input(z.object({
        category: z.enum(["all", "lab_test", "radiology_test", "pathology_test", "other_test", "procedure", "consultation"]),
        pct: z.number().min(-50).max(200),
      }))
      .mutation(async ({ input }) => {
        const { bulkAdjustServicePrices } = await import("./db");
        const updated = await bulkAdjustServicePrices(input.category, input.pct);
        return { updated };
      }),

    // Force-fetch live rates from API (Frankfurter primary, ExchangeRate-API fallback)
    fetchLiveRates: adminProcedure.mutation(async () => {
      const { forceFetchExchangeRates } = await import("./exchangeRateService");
      const result = await forceFetchExchangeRates();
      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Failed to fetch live exchange rates" });
      }
      return {
        success: true,
        source: result.source,
        rateDate: result.rateDate,
        timestamp: new Date().toISOString(),
        missingCurrencies: result.missingCurrencies ?? [],
      };
    }),

    // Toggle auto-update on/off
    setAutoUpdate: adminProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const { setSystemSetting } = await import("./db");
        await setSystemSetting("auto_exchange_rates_enabled", input.enabled ? "true" : "false", ctx.user.id);
                return { enabled: input.enabled };
      }),
  }),
  // ─── Dropdown Options (Dynamic Field Options) ─────────────────────────────────────────────
  dropdownOptions: router({
    list: protectedProcedure
      .input(z.object({ fieldKey: z.string() }))
      .query(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { dropdownOptions } = await import("../drizzle/schema");
        const { eq, asc } = await import("drizzle-orm");
        return db
          .select()
          .from(dropdownOptions)
          .where(eq(dropdownOptions.fieldKey, input.fieldKey))
          .orderBy(asc(dropdownOptions.sortOrder), asc(dropdownOptions.id));
      }),
    listFieldKeys: protectedProcedure.query(async () => {
      const db = await (await import("./db")).getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { dropdownOptions } = await import("../drizzle/schema");
      const rows = await db
        .selectDistinct({ fieldKey: dropdownOptions.fieldKey })
        .from(dropdownOptions)
        .orderBy(dropdownOptions.fieldKey);
      return rows.map((r) => r.fieldKey);
    }),
    create: adminProcedure
      .input(z.object({
        fieldKey: z.string().min(1).max(64),
        label: z.string().min(1).max(256),
        value: z.string().min(1).max(256),
        sortOrder: z.number().int().optional(),
        groupLabel: z.string().max(200).optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { dropdownOptions } = await import("../drizzle/schema");
        const { eq, max } = await import("drizzle-orm");
        let sortOrder = input.sortOrder;
        if (sortOrder === undefined) {
          const [maxRow] = await db
            .select({ maxOrder: max(dropdownOptions.sortOrder) })
            .from(dropdownOptions)
            .where(eq(dropdownOptions.fieldKey, input.fieldKey));
          sortOrder = ((maxRow?.maxOrder ?? 0) as number) + 1;
        }
        await db.insert(dropdownOptions).values({
          fieldKey: input.fieldKey,
          label: input.label,
          value: input.value,
          sortOrder,
          isActive: true,
          groupLabel: input.groupLabel ?? null,
        });
        return { success: true };
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number().int(),
        label: z.string().min(1).max(256).optional(),
        value: z.string().min(1).max(256).optional(),
        sortOrder: z.number().int().optional(),
        isActive: z.boolean().optional(),
        groupLabel: z.string().max(200).nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { dropdownOptions } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { id, ...updates } = input;
        await db.update(dropdownOptions).set(updates).where(eq(dropdownOptions.id, id));
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { dropdownOptions } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.delete(dropdownOptions).where(eq(dropdownOptions.id, input.id));
        return { success: true };
      }),
    reorder: adminProcedure
      .input(z.array(z.object({ id: z.number().int(), sortOrder: z.number().int() })))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { dropdownOptions } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        for (const item of input) {
          await db.update(dropdownOptions).set({ sortOrder: item.sortOrder }).where(eq(dropdownOptions.id, item.id));
        }
        return { success: true };
      }),
  }),
  // ─── Clinic Information ───────────────────────────────────────────────────────────────────
  clinicInfo: router({
    get: protectedProcedure.query(async () => {
      const { getClinicInfo } = await import("./db");
      return getClinicInfo();
    }),
    save: adminProcedure
      .input(z.object({
        nameEn: z.string().optional(),
        nameAr: z.string().optional(),
        nameTr: z.string().optional(),
        sloganEn: z.string().optional(),
        sloganAr: z.string().optional(),
        sloganTr: z.string().optional(),
        addressEn: z.string().optional(),
        addressAr: z.string().optional(),
        addressTr: z.string().optional(),
        bioEn: z.string().optional(),
        bioAr: z.string().optional(),
        bioTr: z.string().optional(),
        email: z.string().optional(),
        whatsapp: z.string().optional(),
        website: z.string().optional(),
        mapsLink: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { saveClinicInfo } = await import("./db");
        await saveClinicInfo(input, ctx.user.id);
        return { success: true };
      }),
    uploadLogo: adminProcedure
      .input(z.object({
        variant: z.enum(["en_light", "en_dark", "ar_light", "ar_dark"]),
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string().default("image/png"),
      }))
      .mutation(async ({ input, ctx }) => {
        const { storagePut } = await import("./storage");
        const { saveClinicInfo } = await import("./db");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "png";
        const key = `clinic/logo-${input.variant}-${Date.now()}.${ext}`;
        const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType, input.fileName);
        const fieldMap: Record<string, string> = {
          en_light: "logoEnLightKey",
          en_dark: "logoEnDarkKey",
          ar_light: "logoArLightKey",
          ar_dark: "logoArDarkKey",
        };
        await saveClinicInfo({ [fieldMap[input.variant]]: storedKey }, ctx.user.id);
        return { key: storedKey, url };
      }),
    uploadStamp: adminProcedure
      .input(z.object({
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string().default("image/png"),
      }))
      .mutation(async ({ input, ctx }) => {
        const { storagePut } = await import("./storage");
        const { saveClinicInfo } = await import("./db");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "png";
        const key = `clinic/stamp-${Date.now()}.${ext}`;
        const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType, input.fileName);
        await saveClinicInfo({ stampKey: storedKey }, ctx.user.id);
        return { key: storedKey, url };
      }),
  }),

  // ─── Staff Availability / Time-Off ────────────────────────────────────────────
  availability: router({
    list: staffOrAdminProcedure
      .input(z.object({
        userId: z.number().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
      }).optional())
      .query(async ({ input }) => {
        const entries = await getStaffAvailability(input ?? {});
        if (entries.length === 0) return entries;
        const summaries = await getReschedulingReviewSummaries(entries.map((entry) => entry.id));
        const byTimeOffId = new Map(summaries.map((summary) => [summary.timeOffId, summary]));
        return entries.map((entry) => ({ ...entry, reviewSummary: byTimeOffId.get(entry.id) ?? null }));
      }),

    create: staffOrAdminProcedure
      .input(z.object({
        userId: z.number(),
        title: z.string().min(1),
        startDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.enum(["vacation", "sick_leave", "training", "personal", "other"]),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (input.endDateKey < input.startDateKey) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "End date must not be before start date." });
        }
        const timeOffId = await createWholeDayStaffAvailability({ ...input, createdBy: ctx.user.id });
        return { success: true, timeOffId };
      }),

    delete: staffOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteStaffAvailability(input.id)),

    getConflicts: staffOrAdminProcedure
      .input(z.object({
        userId: z.number(),
        startDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }))
      .query(({ input }) => getConflictingAppointments(
        input.userId,
        istanbulDateTimeToUtc(input.startDateKey, "00:00:00"),
        istanbulDateTimeToUtc(input.endDateKey, "23:59:59.999"),
      )),

    reviewSummaries: staffOrAdminProcedure
      .input(z.object({ timeOffIds: z.array(z.number().int().positive()).max(100) }))
      .query(({ input }) => getReschedulingReviewSummaries(input.timeOffIds)),

    checkUnavailable: staffOrAdminProcedure
      .input(z.object({
        userId: z.number(),
        date: z.date(),
      }))
      .query(({ input }) => isUserUnavailable(input.userId, input.date)),

    getWorkingHours: staffOrAdminProcedure
      .input(z.object({ userId: z.number().optional() }).optional())
      .query(({ input }) => getEffectiveWorkingHours(input?.userId)),

    saveClinicDefaultWorkingHours: adminProcedure
      .input(z.object({
        schedule: z.record(z.string(), z.array(z.object({ start: z.string(), end: z.string() }))),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const schedule = await saveClinicDefaultWorkingHours(input.schedule, ctx.user.id);
          await logAudit({
            userId: ctx.user.id, userName: ctx.user.name, userRole: ctx.user.role,
            action: "clinic_default_working_hours_updated", category: "other",
            description: "Clinic default weekly working hours updated.",
            recordType: "clinic_info", ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
          });
          return { schedule };
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Working hours are invalid." });
        }
      }),

    saveStaffWorkingHoursOverride: adminProcedure
      .input(z.object({
        userId: z.number(),
        schedule: z.record(z.string(), z.array(z.object({ start: z.string(), end: z.string() }))),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const schedule = await saveStaffWorkingHoursOverride(input.userId, input.schedule);
          await logAudit({
            userId: ctx.user.id, userName: ctx.user.name, userRole: ctx.user.role,
            action: "staff_working_hours_override_updated", category: "user_management",
            description: `Weekly working-hours override updated for user ${input.userId}.`,
            recordId: input.userId, recordType: "user", ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
          });
          return { schedule };
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Working hours are invalid." });
        }
      }),
  }),

  // ─── Patient Communications ───────────────────────────────────────────────────
  patientComms: router({
    list: staffOrAdminProcedure
      .input(z.object({ patientId: z.number() }))
      .query(({ input }) => getPatientCommunications(input.patientId)),
    create: staffOrAdminProcedure
      .input(z.object({ patientId: z.number(), note: z.string().min(1) }))
      .mutation(({ input, ctx }) => createPatientCommunication({ ...input, createdBy: ctx.user.id })),
    edit: staffOrAdminProcedure
      .input(z.object({ id: z.number(), patientId: z.number(), note: z.string().min(1) }))
      .mutation(({ input, ctx }) => updatePatientCommunication(input.id, input.patientId, input.note, ctx.user.id)),
    delete: staffOrAdminProcedure
      .input(z.object({ id: z.number(), patientId: z.number() }))
      .mutation(({ input, ctx }) => softDeletePatientCommunication(input.id, input.patientId, ctx.user.id)),
  }),

  // ─── Treatment Cycles ─────────────────────────────────────────────────────────
  treatmentCycles: router({
    list: staffOrAdminProcedure
      .input(z.object({ patientId: z.number() }))
      .query(({ input }) => getTreatmentCycles(input.patientId)),

    get: staffOrAdminProcedure
      .input(z.object({ cycleId: z.number() }))
      .query(({ input }) => getTreatmentCycleById(input.cycleId)),

    create: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        ivfNo: z.string().optional(),
        cycleType: z.array(z.string()).min(1), // multi-select array e.g. ["ICSI","TESE"]
        protocol: z.enum(["antagonist","long","oks_long","patch_ant","mikrodoz","other"]).optional(),
        status: z.enum(["planned","stimulation","retrieval","transfer","completed","cancelled"]).optional(),
        doctorId: z.number().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        d3Tsh: z.string().optional(), d3Fsh: z.string().optional(), d3Lh: z.string().optional(),
        d3E2: z.string().optional(), d3Amh: z.string().optional(), d3Prl: z.string().optional(), d3Bmi: z.string().optional(),
        infertilityDuration: z.string().optional(),
        infertilityReasonFemale: z.string().optional(),
        infertilityReasonMale: z.string().optional(),
        frozenTissue: z.boolean().optional(),
        spermCount: z.string().optional(), spermMotility: z.string().optional(),
        spermMorphology: z.string().optional(), spermTmss: z.string().optional(),
        karyotype: z.string().optional(), serology: z.string().optional(),
        previousTreatment: z.string().optional(), surgery: z.string().optional(),
        adjuvantMedications: z.string().optional(), notes: z.string().optional(),
      }))
       .mutation(async ({ input, ctx }) => {
        const code = await getNextCode("treatment_cycle");
        const cycleTypeJson = JSON.stringify(input.cycleType);
        return createTreatmentCycle({ ...input, cycleType: cycleTypeJson, createdBy: ctx.user.id, code } as any);
      }),
    update: staffOrAdminProcedure
      .input(z.object({
        cycleId: z.number(),
        data: z.object({
          ivfNo: z.string().optional(),
          cycleType: z.array(z.string()).optional(), // multi-select array
          protocol: z.enum(["antagonist","long","oks_long","patch_ant","mikrodoz","other"]).optional().nullable(),
          status: z.enum(["planned","stimulation","retrieval","transfer","completed","cancelled"]).optional(),
          doctorId: z.number().optional().nullable(),
          startDate: z.date().optional().nullable(),
          endDate: z.date().optional().nullable(),
          d3Tsh: z.string().optional().nullable(), d3Fsh: z.string().optional().nullable(),
          d3Lh: z.string().optional().nullable(), d3E2: z.string().optional().nullable(),
          d3Amh: z.string().optional().nullable(), d3Prl: z.string().optional().nullable(), d3Bmi: z.string().optional().nullable(),
          infertilityDuration: z.string().optional().nullable(),
          infertilityReasonFemale: z.string().optional().nullable(),
          infertilityReasonMale: z.string().optional().nullable(),
          frozenTissue: z.boolean().optional(),
          spermCount: z.string().optional().nullable(), spermMotility: z.string().optional().nullable(),
          spermMorphology: z.string().optional().nullable(), spermTmss: z.string().optional().nullable(),
          karyotype: z.string().optional().nullable(), serology: z.string().optional().nullable(),
          previousTreatment: z.string().optional().nullable(), surgery: z.string().optional().nullable(),
          adjuvantMedications: z.string().optional().nullable(), notes: z.string().optional().nullable(),
        }),
      }))
      .mutation(({ input }) => {
        const data: any = { ...input.data };
        if (data.cycleType) data.cycleType = JSON.stringify(data.cycleType);
        return updateTreatmentCycle(input.cycleId, data);
      }),

    delete: staffOrAdminProcedure
      .input(z.object({ cycleId: z.number() }))
      .mutation(({ input }) => deleteTreatmentCycle(input.cycleId)),

    // Monitoring visits
    listVisits: staffOrAdminProcedure
      .input(z.object({ cycleId: z.number() }))
      .query(({ input }) => getCycleMonitoringVisits(input.cycleId)),

    addVisit: staffOrAdminProcedure
      .input(z.object({
        cycleId: z.number(),
        visitDate: z.date(),
        cycleDay: z.number().optional(),
        doctorId: z.number().optional(),
        e2: z.string().optional(), lh: z.string().optional(), p4: z.string().optional(),
        endometriumMm: z.string().optional(),
        folliclesRight: z.array(z.number()).optional(),
        folliclesLeft: z.array(z.number()).optional(),
        fshDose: z.string().optional(), hmgDose: z.string().optional(),
        gnrhaDose: z.string().optional(), antagonistDose: z.string().optional(),
        ccLetrDose: z.string().optional(), hcgDose: z.string().optional(),
        sexualAbstinence: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ input }) => createCycleMonitoringVisit(input as any)),

    updateVisit: staffOrAdminProcedure
      .input(z.object({
        visitId: z.number(),
        data: z.object({
          visitDate: z.date().optional(),
          cycleDay: z.number().optional().nullable(),
          doctorId: z.number().optional().nullable(),
          e2: z.string().optional().nullable(), lh: z.string().optional().nullable(), p4: z.string().optional().nullable(),
          endometriumMm: z.string().optional().nullable(),
          folliclesRight: z.array(z.number()).optional().nullable(),
          folliclesLeft: z.array(z.number()).optional().nullable(),
          fshDose: z.string().optional().nullable(), hmgDose: z.string().optional().nullable(),
          gnrhaDose: z.string().optional().nullable(), antagonistDose: z.string().optional().nullable(),
          ccLetrDose: z.string().optional().nullable(), hcgDose: z.string().optional().nullable(),
          sexualAbstinence: z.string().optional().nullable(),
          notes: z.string().optional().nullable(),
        }),
      }))
      .mutation(({ input }) => updateCycleMonitoringVisit(input.visitId, input.data as any)),

    deleteVisit: staffOrAdminProcedure
      .input(z.object({ visitId: z.number() }))
      .mutation(({ input }) => deleteCycleMonitoringVisit(input.visitId)),

    // Medications
    listMedications: staffOrAdminProcedure
      .input(z.object({ cycleId: z.number() }))
      .query(({ input }) => getCycleMedications(input.cycleId)),

    addMedication: staffOrAdminProcedure
      .input(z.object({
        cycleId: z.number(),
        medicationName: z.string().min(1),
        dose: z.string().optional(),
        frequency: z.string().optional(),
        route: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        instructions: z.string().optional(),
      }))
      .mutation(({ input }) => createCycleMedication(input as any)),

    updateMedication: staffOrAdminProcedure
      .input(z.object({
        medId: z.number(),
        data: z.object({
          medicationName: z.string().optional(),
          dose: z.string().optional().nullable(),
          frequency: z.string().optional().nullable(),
          route: z.string().optional().nullable(),
          startDate: z.date().optional().nullable(),
          endDate: z.date().optional().nullable(),
          instructions: z.string().optional().nullable(),
          isActive: z.boolean().optional(),
        }),
      }))
      .mutation(({ input }) => updateCycleMedication(input.medId, input.data as any)),

    deleteMedication: staffOrAdminProcedure
      .input(z.object({ medId: z.number() }))
      .mutation(({ input }) => deleteCycleMedication(input.medId)),

    // Medication adherence (patient confirms taking medication)
    getAdherence: protectedProcedure
      .input(z.object({ cycleId: z.number(), patientId: z.number() }))
      .query(({ input }) => getMedicationAdherence(input.cycleId, input.patientId)),

    confirmAdherence: protectedProcedure
      .input(z.object({
        cycleId: z.number(),
        medicationId: z.number(),
        patientId: z.number(),
        scheduledDate: z.date(),
        notes: z.string().optional(),
      }))
      .mutation(({ input }) => confirmMedicationAdherence(input as any)),

    // Outcomes
    getOutcome: staffOrAdminProcedure
      .input(z.object({ cycleId: z.number() }))
      .query(({ input }) => getCycleOutcome(input.cycleId)),

    saveOutcome: staffOrAdminProcedure
      .input(z.object({
        cycleId: z.number(),
        totalOocytes: z.number().optional(),
        matureOocytes: z.number().optional(),
        fertilized: z.number().optional(),
        blastocystCount: z.number().optional(),
        transferred: z.number().optional(),
        cryopreserved: z.number().optional(),
        embryoQuality: z.string().optional(),
        triggerDate: z.date().optional(),
        opuDate: z.date().optional(),
        transferDate: z.date().optional(),
        hcgLevel: z.string().optional(),
        pregnancyTestDate: z.date().optional(),
        result: z.enum(["positive","negative","biochemical","clinical","ongoing","delivered","miscarriage","pending"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ input }) => upsertCycleOutcome(input as any)),
  }),

  // ─── Clinic Tags ────────────────────────────────────────────────────────────
  clinicTags: router({
    list: protectedProcedure
      .query(() => getAllClinicTags()),

    create: staffOrAdminProcedure
      .input(z.object({
        name: z.string().min(1).max(64),
        color: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => createClinicTag({ ...input, createdByUserId: ctx.user.id })),

    update: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(64).optional(),
        color: z.string().optional(),
      }))
      .mutation(({ input }) => updateClinicTag(input.id, { name: input.name, color: input.color })),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteClinicTag(input.id)),
  }),

  // ─── Specializations ────────────────────────────────────────────────────────────────────────────
  specializations: router({
    list: staffOrAdminProcedure
      .query(() => getAllSpecializations()),
    create: adminProcedure
      .input(z.object({ name: z.string().min(1).max(128) }))
      .mutation(({ input }) => createSpecialization(input.name)),
    update: adminProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).max(128) }))
      .mutation(({ input }) => updateSpecialization(input.id, input.name)),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteSpecialization(input.id)),
  }),

  // ─── Sub-Specializations ────────────────────────────────────────────────────────────────────────────────────────
  subSpecializations: router({
    list: staffOrAdminProcedure
      .input(z.object({ specializationId: z.number().optional() }))
      .query(({ input }) => getAllSubSpecializations(input.specializationId)),
    create: adminProcedure
      .input(z.object({ name: z.string().min(1).max(128), specializationId: z.number() }))
      .mutation(({ input }) => createSubSpecialization(input.name, input.specializationId)),
    update: adminProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).max(128) }))
      .mutation(({ input }) => updateSubSpecialization(input.id, input.name)),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteSubSpecialization(input.id)),
  }),

  // ─── Document Translations ────────────────────────────────────────────────────────────────────────────────────────
  translations: router({
    listByPatient: staffOrAdminProcedure
      .input(z.object({ patientId: z.number() }))
      .query(({ input }) => getDocumentTranslationsByPatient(input.patientId)),

    create: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        labResultId: z.number().optional(),
        originalFileUrl: z.string().optional(),
        originalFileName: z.string().optional(),
        originalLanguage: z.string().optional(),
        targetLanguage: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => createDocumentTranslation({ ...input, translatedById: ctx.user.id })),

    translate: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        fileBase64: z.string().optional(),  // base64 of uploaded file
        fileName: z.string().optional(),
        mimeType: z.string().optional(),
        fileUrl: z.string().optional(),     // existing URL
        pdfPassword: z.string().optional(), // password for protected PDFs
        targetLanguage: z.string().default("en"),
        patientId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        await updateDocumentTranslation(input.id, { status: "processing" });
        try {
          const { storagePut } = await import("./storage");
          let fileUrl = input.fileUrl;
          let fileName = input.fileName ?? "document";

          // Upload file to storage if base64 provided
          if (input.fileBase64 && input.mimeType) {
            const buffer = Buffer.from(input.fileBase64, "base64");
            const ext = (input.fileName ?? "file").split(".").pop() ?? "pdf";
            const key = `translations/${input.patientId}-${Date.now()}.${ext}`;
            const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType, input.fileName);
            fileUrl = url;
          }

          if (!fileUrl) throw new Error("No file provided");

          // Download the file
          const response = await fetch(fileUrl.startsWith("/") ? `http://localhost:${process.env.PORT ?? 3000}${fileUrl}` : fileUrl);
          if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          let extractedText = "";

          // Extract text from PDF
          if (input.mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
            try {
              const pdfParse = (await import("pdf-parse")) as any;
              const options: any = {};
              if (input.pdfPassword) options.password = input.pdfPassword;
              const data = await (pdfParse.default ?? pdfParse)(buffer, options);
              extractedText = data.text ?? "";
            } catch (pdfErr: any) {
              // If PDF parsing fails (e.g., scanned image), use LLM vision
              extractedText = "[PDF text extraction failed — using vision OCR]";
            }
          } else {
            // For images, use LLM vision to extract text
            extractedText = "[Image — using vision OCR]";
          }

          // If text extraction was minimal (scanned PDF or image), use LLM vision for OCR
          const needsVisionOCR = extractedText.trim().length < 50 || extractedText.startsWith("[");

          let translatedText = "";
          const { invokeLLM } = await import("./_core/llm");
          const langNameMap: Record<string, string> = { en: "English", ar: "Arabic", tr: "Turkish", fr: "French", de: "German", es: "Spanish", ru: "Russian", zh: "Chinese" };
          const targetLangName = langNameMap[input.targetLanguage] ?? input.targetLanguage;

	          if (needsVisionOCR) {
	            const isImage = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(input.mimeType ?? "");
	            if (isImage && fileUrl) {
	              // Single image: use vision OCR directly
	              const fullUrl = fileUrl.startsWith("/") ? `http://localhost:${process.env.PORT ?? 3000}${fileUrl}` : fileUrl;
	              const res = await invokeLLM({
	                workloadId: "medical_document_translation",
	                messages: [
                  { role: "system", content: `You are a medical document OCR and translation assistant. Extract all text from the image and translate it to ${targetLangName}. Present lab results as a markdown table with columns: Test, Result, Unit, Reference Range. Return ONLY the translated ${targetLangName} text.` },
                  { role: "user", content: [{ type: "image_url", image_url: { url: fullUrl } }, { type: "text", text: `OCR and translate this medical document to ${targetLangName}. Return ONLY the ${targetLangName} translation.` }] },
                ],
              });
              translatedText = (res.choices?.[0]?.message?.content as string) ?? "Translation failed";
              extractedText = "[Extracted via vision OCR]";
	            } else {
	              // Scanned/multi-page PDF: split into pages and translate in parallel
	              try {
	                const pageImages = await pdfToPageImages(buffer, 20);
	                if (pageImages.length === 0) throw new Error("No pages extracted");
	                const pageResults = await Promise.all(
	                  pageImages.map(async (pageDataUrl, idx) => {
	                    try {
	                      const res = await invokeLLM({
	                        workloadId: "medical_document_translation",
	                        messages: [
                          { role: "system", content: `You are a medical document OCR and translation assistant. Extract all text from the image and translate it to ${targetLangName}. Return ONLY the translated ${targetLangName} text. Present lab results as a markdown table with columns: Test, Result, Unit, Reference Range.` },
                          { role: "user", content: [
                            { type: "image_url", image_url: { url: pageDataUrl } },
                            { type: "text", text: `OCR page ${idx + 1} and translate everything to ${targetLangName}. Return ONLY the ${targetLangName} translation. If blank, respond "[blank page]".` },
                          ]},
                        ],
                      });
                      return (res.choices?.[0]?.message?.content as string) ?? "";
                    } catch {
                      return `[Page ${idx + 1} translation failed]`;
                    }
                  })
                );
                const nonBlank = pageResults.filter((t) => t.trim() && t.trim().toLowerCase() !== "[blank page]");
                translatedText = nonBlank.length === 0
                  ? "No readable text found in this PDF."
                  : nonBlank.length === 1
                    ? nonBlank[0]
                    : nonBlank.map((t, i) => `**— Page ${i + 1} —**\n\n${t}`).join("\n\n---\n\n");
                extractedText = `[Extracted via parallel page OCR — ${pageImages.length} page(s)]`;
	              } catch {
	                // Fallback: translate the minimal extracted text
	                const res = await invokeLLM({
	                  workloadId: "medical_document_translation",
	                  messages: [
                    { role: "system", content: `You are a medical document translation assistant. Translate the following text to ${targetLangName}. Return ONLY the translated ${targetLangName} text.` },
                    { role: "user", content: `Translate to ${targetLangName}:\n\n${extractedText || "[Unable to extract text from document]"}` },
                  ],
                });
                translatedText = (res.choices?.[0]?.message?.content as string) ?? "Translation failed";
              }
            }
	          } else {
	            // Translate the extracted text directly
	            const res = await invokeLLM({
	              workloadId: "medical_document_translation",
	              messages: [
                { role: "system", content: `You are a medical document translation assistant. Translate the following text to ${targetLangName}. Return ONLY the translated ${targetLangName} text. Present any lab results as a markdown table with columns: Test, Result, Unit, Reference Range. Preserve the document structure.` },
                { role: "user", content: `Translate to ${targetLangName}:\n\n${extractedText}` },
              ],
            });
            translatedText = (res.choices?.[0]?.message?.content as string) ?? "Translation failed";
          }
                    await updateDocumentTranslation(input.id, {
            status: "completed",
            translatedText,
            extractedText,
            originalLanguage: input.targetLanguage === "en" ? "tr" : "other",
          });

          // Also update the file URL if we uploaded it
          if (fileUrl && !input.fileUrl) {
            const { getDb } = await import("./db");
            const { documentTranslations } = await import("../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            const db = await getDb();
            if (db) await db.update(documentTranslations).set({ originalFileUrl: fileUrl, originalFileName: fileName }).where(eq(documentTranslations.id, input.id));
          }

          return { success: true, translatedText, extractedText };
        } catch (err: any) {
          await updateDocumentTranslation(input.id, { status: "failed", errorMessage: err?.message ?? "Unknown error" });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err?.message ?? "Translation failed" });
        }
      }),

    delete: staffOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteDocumentTranslation(input.id)),

    updateText: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        translatedText: z.string(),
      }))
      .mutation(({ input }) => updateDocumentTranslation(input.id, { translatedText: input.translatedText })),

    listByLeadDocument: staffOrAdminProcedure
      .input(z.object({ leadDocumentId: z.number() }))
      .query(({ input }) => getDocumentTranslationsByLeadDocument(input.leadDocumentId)),
    translateLeadDocument: staffOrAdminProcedure
      .input(z.object({
        leadDocumentId: z.number(),
        fileUrl: z.string(),
        fileName: z.string(),
        mimeType: z.string().optional(),
        targetLanguage: z.string().default("en"),
        // patientId is 0 for leads — we use a sentinel value
        patientId: z.number().default(0),
        // For pending-draft documents: both fields are MANDATORY.
        // For active documents: both fields are optional (backward compatible).
        // The server derives the requirement from the document lifecycle.
        draftSessionId: z.string().optional(),
        activeWriterToken: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // ── AI Writer-Authority Gate (Phase 2 Final Acceptance) ─────────────────
        // Policy matrix:
        //   pending-draft IS allowed → MANDATORY draftSessionId + activeWriterToken; full 10-point validation
        //   active         → no draft token required; existing ownership/permission checks apply
        //   deletion-pending → always rejected
        //   missing/deleted  → always rejected
        const { getLeadDocumentById, registerExtractionAttempt, completeExtractionAttempt, validateWriterToken } = await import("./db");
        const docPre = await getLeadDocumentById(input.leadDocumentId);
        // Point 1: Document exists
        if (!docPre) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
        const preStatus = (docPre as any).lifecycleStatus;
        // Point 9: Not deletion-pending
        if (preStatus === "deletion-pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This document has been cancelled and is pending deletion. AI extraction is not available." });
        }
        // ── pending-draft: full writer-authority validation ────────────────────
        if (preStatus === "pending-draft") {
          // Points 2-3: draftSessionId and activeWriterToken are MANDATORY for pending-draft
          if (!input.draftSessionId || !input.activeWriterToken) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "DRAFT_WRITER_REQUIRED: AI extraction on a pending-draft document requires draftSessionId and activeWriterToken.",
            });
          }
          // Point 3: Document belongs to the supplied draftSessionId
          if ((docPre as any).draftSessionId !== input.draftSessionId) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "STALE_DRAFT_WRITER: This document does not belong to the supplied draft session.",
            });
          }
          // Points 4-8: Validate writer token (session exists, active, token matches, ownership)
          try {
            await validateWriterToken({
              draftSessionId: input.draftSessionId,
              activeWriterToken: input.activeWriterToken,
            });
          } catch (tokenErr: any) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "STALE_DRAFT_WRITER: " + (tokenErr?.message ?? "Writer token is invalid or the session has been taken over."),
            });
          }
        }
        // ── active document: preserve existing behavior (no draft token required) ──
        // Points for active docs: document exists (✓), not deletion-pending (✓),
        // ownership and permission checks are handled by staffOrAdminProcedure.
        // ── End pre-execution AI Writer-Authority Gate ────────────────────────

        // ── Register extraction attempt (for late-write rejection) ────────────
        const { attemptId } = await registerExtractionAttempt({
          documentId: input.leadDocumentId,
          draftSessionId: (docPre as any).draftSessionId ?? null,
          createdBy: ctx.user.id,
        });

        // Create a translation record linked to the lead document
        const { id } = await createDocumentTranslation({
          patientId: input.patientId,
          leadDocumentId: input.leadDocumentId,
          originalFileUrl: input.fileUrl,
          originalFileName: input.fileName,
          targetLanguage: input.targetLanguage,
          translatedById: ctx.user.id,
        });
        await updateDocumentTranslation(id, { status: "processing" });
        try {
          const langName: Record<string, string> = {
            en: "English", ar: "Arabic", fr: "French", es: "Spanish", de: "German",
            it: "Italian", pt: "Portuguese", ru: "Russian", tr: "Turkish", zh: "Chinese",
          };
          const targetLangName = langName[input.targetLanguage] ?? input.targetLanguage;
          // Resolve the full URL for server-side fetch
          const fullUrl = input.fileUrl.startsWith("/")
            ? `http://localhost:${process.env.PORT ?? 3000}${input.fileUrl}`
            : input.fileUrl;
          // Download the file as a buffer
          const response = await fetch(fullUrl);
          if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const fileName = input.fileName;
          const isPdf = (input.mimeType ?? "").includes("pdf") || fileName.toLowerCase().endsWith(".pdf");
          const isImage = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(input.mimeType ?? "") ||
            /\.(jpe?g|png|webp|gif)$/i.test(fileName);
          let extractedText = "";
          // Step 1: Try to extract text from PDF using pdf-parse
          if (isPdf) {
            try {
              const pdfParse = (await import("pdf-parse")) as any;
              const data = await (pdfParse.default ?? pdfParse)(buffer);
              extractedText = data.text ?? "";
            } catch {
              extractedText = "[PDF text extraction failed — using vision OCR]";
            }
          } else {
            extractedText = "[Image — using vision OCR]";
          }
          // Step 2: Decide whether to use vision OCR (scanned PDF or image)
          const needsVisionOCR = extractedText.trim().length < 50 || extractedText.startsWith("[");
          let translatedText = "";
          if (needsVisionOCR) {
            // Use vision model to OCR + translate in one step
            if (isImage) {
              // For images: convert buffer to base64 data URL (LLM cannot access internal localhost URLs)
              const mimeForImage = (input.mimeType && input.mimeType.startsWith("image/"))
                ? input.mimeType
                : /\.png$/i.test(input.fileName) ? "image/png"
                : /\.gif$/i.test(input.fileName) ? "image/gif"
                : /\.webp$/i.test(input.fileName) ? "image/webp"
                : "image/jpeg";
	              const imageBase64 = buffer.toString("base64");
	              const imageDataUrl = `data:${mimeForImage};base64,${imageBase64}`;
	              const res = await invokeLLM({
	                workloadId: "medical_document_translation",
	                messages: [
                  { role: "system", content: `You are a medical document OCR and translation assistant. Your task is to:
1. Extract all text from the image using OCR
2. Translate ALL extracted text into ${targetLangName}
3. Return ONLY the translated ${targetLangName} text — do NOT include the original language text, do NOT include bilingual output, do NOT include any explanations or preamble
4. Present lab results and measurements as a markdown table with columns: Test, Result, Unit, Reference Range
5. Preserve the document structure (headings, sections) in ${targetLangName}` },
                  { role: "user", content: [{ type: "image_url", image_url: { url: imageDataUrl } }, { type: "text", text: `OCR this medical document and translate everything to ${targetLangName}. Return ONLY the ${targetLangName} translation, nothing else.` }] },
                ],
              });
              translatedText = (res.choices?.[0]?.message?.content as string) ?? "";
              extractedText = "[Extracted via vision OCR]";
	            } else {
	              // For scanned/multi-page PDFs: split into page images and translate in parallel
	              try {
	                const pageImages = await pdfToPageImages(buffer, 20);
	                if (pageImages.length === 0) throw new Error("No pages extracted");
	                const pageResults = await Promise.all(
	                  pageImages.map(async (pageDataUrl, idx) => {
	                    try {
	                      const res = await invokeLLM({
	                        workloadId: "medical_document_translation",
	                        messages: [
{ role: "system", content: `You are a medical document OCR and translation assistant. Your task is to:
1. Extract all text from the image using OCR
2. Translate ALL extracted text into ${targetLangName}
3. Return ONLY the translated ${targetLangName} text — do NOT include the original language text, do NOT include bilingual output
4. Present lab results as a markdown table with columns: Test, Result, Unit, Reference Range` },
                            { role: "user", content: [
                            { type: "image_url", image_url: { url: pageDataUrl } },
                            { type: "text", text: `OCR page ${idx + 1} and translate everything to ${targetLangName}. Return ONLY the ${targetLangName} translation. If blank, respond "[blank page]".` },
                          ]},
                        ],
                      });
                      return (res.choices?.[0]?.message?.content as string) ?? "";
                    } catch {
                      return `[Page ${idx + 1} translation failed]`;
                    }
                  })
                );
                const nonBlank = pageResults.filter((t) => t.trim() && t.trim().toLowerCase() !== "[blank page]");
                translatedText = nonBlank.length === 1
                  ? nonBlank[0]
                  : nonBlank.map((t, i) => `**— Page ${i + 1} —**\n\n${t}`).join("\n\n---\n\n");
                extractedText = `[Extracted via parallel page OCR — ${pageImages.length} page(s)]`;
              } catch {
                throw new Error("Unable to extract text from this document. Please ensure it is a readable PDF or image.");
              }
            }
	          } else {
	            // Step 3: Translate the extracted text directly
	            const res = await invokeLLM({
	              workloadId: "medical_document_translation",
	              messages: [
{ role: "system", content: `You are a medical document translation assistant. Translate the following text to ${targetLangName}. Return ONLY the translated ${targetLangName} text — do NOT include the original text, do NOT produce bilingual output. Present any lab results as a markdown table with columns: Test, Result, Unit, Reference Range. Preserve the document structure.` },
              { role: "user", content: `Translate the following medical document to ${targetLangName}. Return ONLY the ${targetLangName} translation:\n\n${extractedText}` },
              ],
            });
            translatedText = (res.choices?.[0]?.message?.content as string) ?? "";
          }
          if (!translatedText) throw new Error("LLM returned empty translation");

          // ── 9-point write-time guard (Phase 2 Final Correction) ──────────────
          // Re-validate all conditions AFTER the LLM call to prevent orphaned writes.
          {
            const docPost = await getLeadDocumentById(input.leadDocumentId);
            // Point 1: Document still exists
            if (!docPost) throw new Error("Document was deleted during AI extraction. Translation discarded.");
            const postStatus = (docPost as any).lifecycleStatus;
            // Point 2: Not deletion-pending
            if (postStatus === "deletion-pending") throw new Error("Document was cancelled during AI extraction. Translation discarded.");
            // Point 3: Not hard-deleted (already covered by Point 1)
            // Point 4-6: If pending-draft, check session is still active
            if (postStatus === "pending-draft" && (docPost as any).draftSessionId) {
              const { getDb } = await import("./db");
              const { draftSessions } = await import("../drizzle/schema");
              const { eq } = await import("drizzle-orm");
              const db = await getDb();
              if (db) {
                const sessionRows = await db
                  .select({ status: draftSessions.status, activeWriterToken: draftSessions.activeWriterToken })
                  .from(draftSessions)
                  .where(eq(draftSessions.draftSessionId, (docPost as any).draftSessionId))
                  .limit(1);
                const sess = sessionRows[0];
                // Point 4: Session still exists
                if (!sess) throw new Error("Draft session was deleted during AI extraction. Translation discarded.");
                // Point 5: Session not cancelled
                if (sess.status === "cancelled") throw new Error("Draft session was cancelled during AI extraction. Translation discarded.");
                // Point 6: Session not expired
                if (sess.status === "expired") throw new Error("Draft session expired during AI extraction. Translation discarded.");
                // Point 7: Session not already saved (would mean doc was promoted, no longer pending)
                if (sess.status === "saved") throw new Error("Draft session was saved during AI extraction. Translation will be attached to the promoted document.");
              }
            }
            // Point 8: Extraction attempt not superseded or cancelled (late-write rejection)
            const accepted = await completeExtractionAttempt({ attemptId, translationId: id });
            if (!accepted) {
              // Attempt was superseded by a retry or cancelled — discard this result
              try { await deleteDocumentTranslation(id); } catch { /* best-effort */ }
              throw new Error("AI extraction was superseded by a newer request. Please check the latest result.");
            }
            // Point 9: All checks passed — write is safe
          }
          // ── End 9-point write-time guard ──────────────────────────────────────

          await updateDocumentTranslation(id, { status: "completed", translatedText, extractedText });
          return { success: true, id, translatedText };
        } catch (err: any) {
          // Delete the failed record so no stale badge appears in the UI.
          // A failed extraction must not leave any DB row — the user can retry from scratch.
          try { await deleteDocumentTranslation(id); } catch { /* best-effort cleanup */ }
          // Cancel the extraction attempt so future retries get a fresh generationId
          try {
            const { cancelExtractionAttemptsByDocument } = await import("./db");
            await cancelExtractionAttemptsByDocument(input.leadDocumentId);
          } catch { /* best-effort */ }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err?.message ?? "Translation failed" });
        }
      }),
    // Translate free-text content (intake section, Q&A, plan summary) to EN/AR/TR
    translateText: protectedProcedure
      .input(z.object({
        text: z.string().min(1),
        targetLanguage: z.enum(["en", "ar", "tr"]),
      }))
	      .mutation(async ({ input }) => {
	        const langName: Record<string, string> = { en: "English", ar: "Arabic", tr: "Turkish" };
	        const targetLangName = langName[input.targetLanguage] ?? input.targetLanguage;
	        const res = await invokeLLM({
	          workloadId: "intake_form_translation",
	          messages: [
            { role: "system", content: `You are a professional medical translator. Translate the following medical text to ${targetLangName}. Return only the translated text, no explanations or preamble.` },
            { role: "user", content: input.text },
          ],
        });
        const translated = (res.choices?.[0]?.message?.content as string) ?? "";
        if (!translated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Translation failed" });
        return { translated };
      }),
    // Rewrite treatment plan summary in formal clinical tone
    rewriteWithAI: protectedProcedure
      .input(z.object({ text: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const res = await invokeLLM({
	          workloadId: "treatment_plan_translation",
          messages: [
            { role: "system", content: "You are a senior IVF specialist. Rewrite the following treatment plan summary in a formal, professional clinical tone suitable for a medical document. Keep all medical facts accurate. Return only the rewritten text." },
            { role: "user", content: input.text },
          ],
        });
        const rewritten = (res.choices?.[0]?.message?.content as string) ?? "";
        if (!rewritten) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rewrite failed" });
        return { rewritten };
      }),
  }),
  // ─── Audit Logg ────────────────────────────────────────────────────────────────
  audit: router({
    list: adminProcedure
      .input(z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(200).default(50),
        userId: z.number().optional(),
        category: z.string().optional(),
        action: z.string().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        search: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return getAuditLogs({
          userId: input.userId,
          category: input.category,
          search: input.search,
          dateFrom: input.from,
          dateTo: input.to,
          page: input.page,
          pageSize: input.pageSize,
        });
      }),
    // Client-side page visit and click tracking
    track: protectedProcedure
      .input(z.object({
        action: z.enum(["page_visit", "page_leave", "click"]),
        page: z.string(),
        durationMs: z.number().optional(),
        detail: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        let description = "";
        let category: "navigation" | "other" = "navigation";
        if (input.action === "page_visit") {
          description = `Visited page: ${input.page}`;
        } else if (input.action === "page_leave") {
          const secs = input.durationMs ? Math.round(input.durationMs / 1000) : 0;
          description = `Left page: ${input.page} (spent ${secs}s)`;
          category = "navigation";
        } else if (input.action === "click") {
          description = `Clicked: ${input.detail ?? input.page} on ${input.page}`;
          category = "other";
        }
        await logAudit({
          userId: ctx.user.id,
          userName: ctx.user.name,
          userRole: ctx.user.role,
          action: input.action,
          category,
          description,
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(),
        });
        return { success: true };
      }),
    // Get distinct users who appear in audit logs (for filter dropdown)
    listUsers: adminProcedure.query(async () => {
      const { getAuditLogUsers } = await import("./db");
      return getAuditLogUsers();
    }),
  }),
  // ─── WhatsApp Messages ──────────────────────────────────────────────
  whatsapp: router({
    manualSettingsStatus: protectedProcedure.query(async () => {
      const { getWhatsAppManualSettingsStatus } = await import("./whatsappConnection");
      return getWhatsAppManualSettingsStatus();
    }),

    // WU-09 is admin-only onboarding. It returns public launch configuration and
    // safe lifecycle state only; it never exposes app secrets, verification
    // tokens, authorization codes, or connection-specific business tokens.
    embeddedSignupStatus: adminProcedure.query(async () => {
      const { getWhatsAppEmbeddedSignupPublicConfig } = await import("./whatsappEmbeddedSignup");
      return getWhatsAppEmbeddedSignupPublicConfig();
    }),

    startEmbeddedSignup: adminProcedure.mutation(async ({ ctx }) => {
      const { startWhatsAppEmbeddedSignup } = await import("./whatsappEmbeddedSignup");
      try {
        return await startWhatsAppEmbeddedSignup(ctx.user.id);
      } catch (error) {
        const { WhatsAppEmbeddedSignupError } = await import("./whatsappEmbeddedSignup");
        const message = error instanceof WhatsAppEmbeddedSignupError
          ? error.message
          : "Meta recommended onboarding could not be started. Please try again later.";
        throw new TRPCError({ code: "PRECONDITION_FAILED", message });
      }
    }),

    cancelEmbeddedSignup: adminProcedure
      .input(z.object({
        requestId: z.string().min(32).max(64),
        currentStep: z.string().max(80).optional().nullable(),
        category: z.enum(["cancelled", "authorization_denied", "provider_error"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const { recordWhatsAppEmbeddedSignupCancellation } = await import("./whatsappEmbeddedSignup");
        await recordWhatsAppEmbeddedSignupCancellation({ ...input, adminUserId: ctx.user.id });
        return { success: true };
      }),

    completeEmbeddedSignup: adminProcedure
      .input(z.object({
        requestId: z.string().min(32).max(64),
        authorizationCode: z.string().min(1).max(4096),
        completionEvent: z.string().min(1).max(80),
        wabaId: z.string().max(128).optional().nullable(),
        phoneNumberId: z.string().max(128).optional().nullable(),
        businessPortfolioId: z.string().max(128).optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { completeWhatsAppEmbeddedSignup, WhatsAppEmbeddedSignupError } = await import("./whatsappEmbeddedSignup");
        try {
          return await completeWhatsAppEmbeddedSignup({
            ...input,
            wabaId: input.wabaId ?? null,
            phoneNumberId: input.phoneNumberId ?? null,
            businessPortfolioId: input.businessPortfolioId ?? null,
          }, ctx.user.id);
        } catch (error) {
          if (error instanceof WhatsAppEmbeddedSignupError) {
            const code = ["existing_persisted_connection", "legacy_manual_configuration_conflict", "authorization_replayed"].includes(error.category)
              ? "CONFLICT"
              : "BAD_REQUEST";
            throw new TRPCError({ code, message: error.message });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Meta recommended onboarding could not be completed. Please start again." });
        }
      }),

    // Linked Device is an additional, provider-neutral foundation. It remains
    // explicitly blocked at the feasibility gate and cannot alter Meta Cloud
    // API, Embedded Signup, webhook verification, or the current send route.
    linkedDeviceStatus: adminProcedure.query(async () => {
      const { LINKED_DEVICE_FEASIBILITY_GATE, listSafeLinkedDeviceLines } = await import("./whatsappLinkedDevice");
      return {
        feasibility: LINKED_DEVICE_FEASIBILITY_GATE,
        lines: await listSafeLinkedDeviceLines(),
      };
    }),

    clearStaleF4LinkedDeviceState: adminProcedure
      .input(z.object({ lineId: z.literal(150001) }))
      .mutation(async ({ input, ctx }) => {
        const { clearStaleLinkedDeviceDisposableState } = await import("./whatsappLinkedDevice");
        try {
          return await clearStaleLinkedDeviceDisposableState({
            ...input,
            actor: { id: ctx.user.id, name: ctx.user.name, role: ctx.user.role },
          });
        } catch (error) {
          const knownMessages = new Set([
            "Administrator access is required to clear stale Linked Device state.",
            "This operational cleanup is authorized only for the F4 Linked Device line.",
            "Linked Device cleanup requires an available database.",
            "Linked Device line was not found.",
            "The authorized F4 line could not be confirmed.",
            "The stale F4 disposable session could not be found.",
          ]);
          const message = error instanceof Error && knownMessages.has(error.message)
            ? error.message
            : "The stale F4 Linked Device state could not be cleared safely.";
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
      }),

    linkedDeviceEligibleStaff: adminProcedure.query(async () => {
      const { listEligibleLinkedDeviceStaff } = await import("./whatsappLinkedDevice");
      return listEligibleLinkedDeviceStaff();
    }),

    createLinkedDeviceLine: adminProcedure
      .input(z.object({
        lineName: z.string().trim().min(2).max(128),
        authorizedStaffIds: z.array(z.number().int().positive()).min(1).max(100),
      }))
      .mutation(async ({ input, ctx }) => {
        const { createLinkedDeviceLine } = await import("./whatsappLinkedDevice");
        try {
          return await createLinkedDeviceLine({
            ...input,
            actor: { id: ctx.user.id, name: ctx.user.name, role: ctx.user.role },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Linked Device line could not be created.";
          throw new TRPCError({ code: message.includes("already") ? "CONFLICT" : "BAD_REQUEST", message });
        }
      }),

    updateLinkedDeviceLineStaff: adminProcedure
      .input(z.object({
        lineId: z.number().int().positive(),
        authorizedStaffIds: z.array(z.number().int().positive()).min(1).max(100),
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateLinkedDeviceLineStaff } = await import("./whatsappLinkedDevice");
        try {
          return await updateLinkedDeviceLineStaff({
            ...input,
            actor: { id: ctx.user.id, name: ctx.user.name, role: ctx.user.role },
          });
        } catch (error) {
          const knownMessages = new Set([
            "Administrator access is required to manage Linked Device staff.",
            "Linked Device staff management requires an available database.",
            "Linked Device line was not found.",
            "This WhatsApp line is no longer active.",
            "Select at least one authorized staff member for this line.",
            "One or more authorized staff members are no longer eligible.",
          ]);
          const message = error instanceof Error && knownMessages.has(error.message)
            ? error.message
            : "Authorized staff could not be updated. Please review the selected staff and try again.";
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
      }),

    requestLinkedDeviceQr: adminProcedure
      .input(z.object({ lineId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const { requestLinkedDeviceQr } = await import("./whatsappLinkedDevice");
        try {
          return await requestLinkedDeviceQr({
            ...input,
            actor: { id: ctx.user.id, name: ctx.user.name, role: ctx.user.role },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Linked Device QR request could not be processed.";
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
      }),

    startLinkedDeviceSandbox: adminProcedure
      .input(z.object({ lineId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const { startWppConnectSandboxSession } = await import("./whatsappLinkedDevice");
        try {
          return await startWppConnectSandboxSession({
            ...input,
            actor: { id: ctx.user.id, name: ctx.user.name, role: ctx.user.role },
          });
        } catch (error) {
          const knownMessages = new Set([
            "The non-production WPPConnect session could not be started. Verify the approved sandbox worker is reachable and try again.",
          ]);
          const message = error instanceof Error && knownMessages.has(error.message)
            ? error.message
            : "The non-production WPPConnect session could not be started.";
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
      }),

    getLinkedDeviceSandboxStatus: adminProcedure
      .input(z.object({ lineId: z.number().int().positive(), includeQr: z.boolean().optional() }))
      .query(async ({ input, ctx }) => {
        const { getWppConnectSandboxStatus } = await import("./whatsappLinkedDevice");
        try {
          return await getWppConnectSandboxStatus({
            ...input,
            actor: { id: ctx.user.id, name: ctx.user.name, role: ctx.user.role },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "The non-production WPPConnect status could not be loaded.";
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
      }),

    logoutLinkedDeviceSandbox: adminProcedure
      .input(z.object({ lineId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const { logoutWppConnectSandboxSession } = await import("./whatsappLinkedDevice");
        try {
          return await logoutWppConnectSandboxSession({
            ...input,
            actor: { id: ctx.user.id, name: ctx.user.name, role: ctx.user.role },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "The Linked Device session could not be disconnected.";
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
      }),

    deleteUnusedLinkedDeviceLine: adminProcedure
      .input(z.object({ lineId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteUnusedLinkedDeviceLine } = await import("./whatsappLinkedDevice");
        try {
          return await deleteUnusedLinkedDeviceLine({
            ...input,
            actor: { id: ctx.user.id, name: ctx.user.name, role: ctx.user.role },
          });
        } catch (error) {
          const knownMessages = new Set([
            "Administrator access is required to delete a WhatsApp line.",
            "WhatsApp line deletion requires an available database.",
            "Linked Device line was not found.",
            "Disconnect the Linked Device first. Delete line is available only when no session is active.",
          ]);
          const message = error instanceof Error && knownMessages.has(error.message)
            ? error.message
            : "The WhatsApp line could not be removed. Please try again.";
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
      }),

    // Test-only evidence bridge. It is separately environment-flagged, accepts
    // an explicit synthetic marker, and feeds the existing evidence/endpoint/
    // Conversation pipeline. It cannot activate production WPPConnect traffic.
    ingestWppConnectSyntheticEvent: adminProcedure
      .input(z.object({
        lineId: z.number().int().positive(),
        providerMessageId: z.string().trim().min(1).max(128),
        senderEndpointId: z.string().trim().min(1).max(128),
        lineProviderId: z.string().trim().min(1).max(128),
        sourceKind: z.literal("private_chat"),
        text: z.string().trim().min(1).max(4096),
        timestampMs: z.number().int().positive().max(4102444800000),
        synthetic: z.literal(true),
      }))
      .mutation(async ({ input, ctx }) => {
        const { ingestWppConnectSyntheticEvent } = await import("./whatsappLinkedDevice");
        try {
          return await ingestWppConnectSyntheticEvent({
            lineId: input.lineId,
            actor: { id: ctx.user.id, name: ctx.user.name, role: ctx.user.role },
            event: {
              providerMessageId: input.providerMessageId,
              senderEndpointId: input.senderEndpointId,
              lineProviderId: input.lineProviderId,
              sourceKind: input.sourceKind,
              text: input.text,
              timestamp: new Date(input.timestampMs),
              synthetic: true,
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Synthetic WPPConnect evidence could not be retained.";
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
      }),

    // List message history for a patient
    list: staffOrAdminProcedure
      .input(z.object({ patientId: z.number().optional() }).optional())
      .query(({ input }) => listWhatsappMessages({ patientId: input?.patientId })),

    // Send a free-text message via Meta Cloud API
    sendText: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        toPhone: z.string().min(5),
        message: z.string().min(1).max(4096),
      }))
      .mutation(async ({ input, ctx }) => {
        const { sendWhatsAppText, saveOutboundMessage, normalizePhone } = await import("./whatsapp");
        const { resolveOutboundWhatsAppConnection } = await import("./whatsappConnection");
        const toNorm = normalizePhone(input.toPhone);
        const connection = await resolveOutboundWhatsAppConnection();
        const result = await sendWhatsAppText(connection, ctx.user.id, toNorm, input.message);
        await saveOutboundMessage({
          connection,
          toPhone: toNorm,
          body: input.message,
          patientId: input.patientId,
          sentById: ctx.user.id,
          wamid: result.wamid,
          status: result.success ? "sent" : "failed",
        });
        if (!result.success) throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.outcome === "ambiguous"
            ? "WhatsApp delivery could not be confirmed. Please check before sending again."
            : "WhatsApp could not send the message. Please verify the recipient and try again.",
        });
        return { success: true, wamid: result.wamid };
      }),

    // Send a pre-approved template message
    sendTemplate: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        toPhone: z.string().min(5),
        templateName: z.string(),
        languageCode: z.string().default("en_US"),
      }))
      .mutation(async ({ input, ctx }) => {
        const { sendWhatsAppTemplate, saveOutboundMessage, normalizePhone } = await import("./whatsapp");
        const { resolveOutboundWhatsAppConnection } = await import("./whatsappConnection");
        const toNorm = normalizePhone(input.toPhone);
        const connection = await resolveOutboundWhatsAppConnection();
        const result = await sendWhatsAppTemplate(connection, ctx.user.id, toNorm, input.templateName, input.languageCode);
        await saveOutboundMessage({
          connection,
          toPhone: toNorm,
          body: `[Template: ${input.templateName}]`,
          templateName: input.templateName,
          patientId: input.patientId,
          sentById: ctx.user.id,
          wamid: result.wamid,
          status: result.success ? "sent" : "failed",
        });
        if (!result.success) throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.outcome === "ambiguous"
            ? "WhatsApp template delivery could not be confirmed. Please check before sending again."
            : "WhatsApp could not send the template. Please verify the recipient and try again.",
        });
        return { success: true, wamid: result.wamid };
      }),

    // Send a medical report PDF via WhatsApp
    sendMedicalReport: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        noteId: z.number(),
        toPhone: z.string().min(5),
        publicBaseUrl: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const { sendWhatsAppDocument, saveOutboundMessage, normalizePhone } = await import("./whatsapp");
        const { resolveOutboundWhatsAppConnection } = await import("./whatsappConnection");
        const { storagePut } = await import("./storage");
        const { generateMedicalReportPdf } = await import("./pdfService");
        const { getMedicalNoteById, getPatientById, getDoctorById } = await import("./db");

        const note = await getMedicalNoteById(input.noteId);
        if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Medical note not found" });
        const patient = await getPatientById(input.patientId);
        if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "Patient not found" });

        const patientName = [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(" ");
        let age: number | undefined;
        let dateOfBirthStr: string | undefined;
        if (patient.dateOfBirth) {
          const dob = new Date(patient.dateOfBirth);
          const now = new Date();
          age = now.getFullYear() - dob.getFullYear();
          const m = now.getMonth() - dob.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
          dateOfBirthStr = dob.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
        }
        let doctorName: string | undefined;
        let doctorTitle: string | undefined;
        let doctorSpecialty: string | undefined;
        let doctorStampKey: string | undefined;
        if ((note as any).doctorId) {
          const doctor = await getDoctorById((note as any).doctorId);
          if (doctor) {
            doctorName = [doctor.firstName, doctor.secondName, doctor.thirdName].filter(Boolean).join(" ") || doctor.name || undefined;
            doctorTitle = (doctor as any).title ?? undefined;
            doctorSpecialty = doctor.specialty ?? undefined;
            doctorStampKey = (doctor as any).stampUrl ?? undefined;
          }
        }
        const noteTypeMap: Record<string, string> = { consultation: "Consultation", follow_up: "Follow Up", procedure: "Procedure", lab_review: "Lab Review", general: "General" };
        const noteTypeLabel = noteTypeMap[(note as any).noteType ?? "consultation"] ?? "Consultation";
        const reportRef = `MR-${String(input.noteId).padStart(5, "0")}`;
        const visitDate = (note as any).visitDate
          ? new Date((note as any).visitDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
          : new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

        const pdfBuffer = await generateMedicalReportPdf({
          reportRef, visitDate, noteType: noteTypeLabel, patientName, mrn: patient.mrn,
          dateOfBirth: dateOfBirthStr, age, gender: patient.gender ?? undefined,
          nationality: patient.nationality ?? undefined, phone: patient.phone ?? undefined,
          doctorName, doctorTitle, doctorSpecialty, doctorStampKey,
          chiefComplaint: (note as any).chiefComplaint ?? undefined,
          historyOfPresentIllness: (note as any).historyOfPresentIllness ?? undefined,
          physicalExamination: (note as any).physicalExamination ?? undefined,
          assessment: (note as any).assessment ?? undefined,
          plan: (note as any).plan ?? undefined,
          diagnosis: (note as any).diagnosis ?? undefined,
          medications: (note as any).medications ?? undefined,
          additionalNotes: (note as any).additionalNotes ?? undefined,
        });

        // Upload PDF to storage to get a public URL
        const storageKey = `medical-reports/${reportRef}-${Date.now()}.pdf`;
        const { url: pdfStorageUrl } = await storagePut(storageKey, pdfBuffer, "application/pdf");
        // Build absolute public URL
        const absolutePdfUrl = pdfStorageUrl.startsWith("http") ? pdfStorageUrl : `${input.publicBaseUrl}${pdfStorageUrl}`;

        const toNorm = normalizePhone(input.toPhone);
        const filename = `Medical-Report-${patient.mrn}-${reportRef}.pdf`;
        const caption = `Medical Report — ${patientName} — ${visitDate}`;
        const connection = await resolveOutboundWhatsAppConnection();
        const result = await sendWhatsAppDocument(connection, ctx.user.id, toNorm, absolutePdfUrl, filename, caption);
        await saveOutboundMessage({
          connection,
          toPhone: toNorm,
          body: `[Medical Report PDF: ${filename}]`,
          patientId: input.patientId,
          sentById: ctx.user.id,
          wamid: result.wamid,
          status: result.success ? "sent" : "failed",
        });
        if (!result.success) throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.outcome === "ambiguous"
            ? "WhatsApp document delivery could not be confirmed. Please check before sending again."
            : "WhatsApp could not send the document. Please verify the recipient and try again.",
        });
        return { success: true, wamid: result.wamid };
      }),

    // Legacy: save a message record without calling the API (for manual logging)
    send: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        message: z.string().min(1),
        direction: z.enum(["outbound", "inbound"]).default("outbound"),
      }))
      .mutation(async ({ input }) => {
        const msg = await createWhatsappMessage({
          patientId: input.patientId,
          body: input.message,
          direction: input.direction,
          status: input.direction === "outbound" ? "sent" : "received",
        });
        return msg;
      }),
  }),
  // ─── Duplicate Detection ─────────────────────────────────────────────────────
  // ─── Public Intake Wizard ────────────────────────────────────────────────────
  intake: router({
    /**
     * Step 1: Submit basic info → create lead → return leadId + intakeToken
     * Called when the prospect submits the first step of the public intake wizard.
     */
    submitBasicInfo: publicProcedure
      .input(z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        phone: z.string().min(1),
        email: z.string().email().optional().or(z.literal("")),
        gender: z.enum(["male", "female"]).optional(),
        dateOfBirth: z.string().optional(), // ISO date string (optional in dynamic forms)
        preferredLanguages: z.array(z.string()).optional(),
        brand: z.enum(["fertiliv", "safemedigo", "dr-nilay-karaca"]).optional(),
        leadSource: z.string().optional(), // accepts any string; mapped to valid enum below
        campaignName: z.string().optional(),
        // Extra lead fields from dynamic form builder
        middleName: z.string().optional(),
        nationality: z.string().optional(),
        country: z.string().optional(),
        city: z.string().optional(),
        address: z.string().optional(),
        secondaryPhone: z.string().optional(),
        secondaryEmail: z.string().email().optional().or(z.literal("")),
        primaryLanguage: z.string().optional(),
        preferredContactMethods: z.array(z.string()).optional(),
        mainMedicalInterest: z.union([z.string(), z.array(z.string())]).optional(),
        ivfExperience: z.string().optional(),
        fertilityDiagnosis: z.array(z.string()).optional(),
        maleFertilityDiagnosis: z.array(z.string()).optional(),
        decisionTimeline: z.string().optional(),
        travelReadiness: z.string().optional(),
        budgetRange: z.string().optional(),
        callbackPreferredDate: z.string().optional(),
        callbackPreferredTime: z.string().optional(),
        callbackMethod: z.string().optional(),
        accommodationHotel: z.string().optional(),
        accommodationLocation: z.string().optional(),
        transportationAirportPickup: z.union([z.boolean(), z.string(), z.null()]).optional().nullable().transform(v => (v === "" || v === null || v === undefined) ? null : (v === true || v === "yes" || v === "true")),
        transportationLocalTransfer: z.union([z.boolean(), z.string(), z.null()]).optional().nullable().transform(v => (v === "" || v === null || v === undefined) ? null : (v === true || v === "yes" || v === "true")),
        patientType: z.string().optional(),
        // ── Female medical fields (f_*) — accepts both camelCase and snake_case catalog IDs ──
        f_infertilityType: z.string().optional(),
        f_infertility_type: z.string().optional(), // catalog alias
        f_infertilityDuration: z.string().optional(),
        f_duration: z.string().optional(), // catalog alias
        f_gravida: z.coerce.number().optional(),
        f_para: z.coerce.number().optional(),
        f_abortus: z.coerce.number().optional(),
        f_livingChildren: z.coerce.number().optional(),
        f_living_children: z.coerce.number().optional(), // catalog alias
        f_cycleRegularity: z.string().optional(),
        f_cycle_regularity: z.string().optional(), // catalog alias
        f_lmp: z.string().optional(),
        f_cycleLength: z.coerce.number().optional(),
        f_cycle_length: z.coerce.number().optional(), // catalog alias
        f_menstrualFlowDays: z.coerce.number().optional(),
        f_menstrual_flow_days: z.coerce.number().optional(), // catalog alias
        f_dysmenorrhea: z.union([z.boolean(), z.string()]).optional(),
        f_height: z.union([z.number(), z.string()]).optional(),
        f_weight: z.union([z.number(), z.string()]).optional(),
        f_height_weight: z.union([
          z.string(),
          z.object({
            height: z.union([z.string(), z.number()]).optional(),
            weight: z.union([z.string(), z.number()]).optional(),
            heightUnit: z.enum(["cm", "ft"]).optional(),
            weightUnit: z.enum(["kg", "lbs"]).optional(),
          })
        ]).optional(), // catalog combined field (string or structured object)
        f_smoking: z.string().optional(),
        f_alcohol: z.string().optional(),
        f_currentMedications: z.string().optional(),
        f_medications: z.string().optional(), // catalog alias
        f_allergies: z.string().optional(),
        f_systemicDiseases: z.union([z.array(z.string()), z.string()]).optional(),
        f_systemic: z.union([z.array(z.string()), z.string()]).optional(), // catalog alias
        f_previous_ivf: z.string().optional(),
        f_ivf_details: z.string().optional(),
        f_miscarriages: z.union([z.boolean(), z.string()]).optional(), // catalog field
        f_surgical_history: z.union([z.boolean(), z.string()]).optional(), // catalog field
        f_familyHistory: z.string().optional(),
        f_family_history: z.string().optional(), // catalog alias
        f_consanguinity: z.union([z.boolean(), z.string()]).optional(),
        f_hereditaryDiseases: z.string().optional(),
        f_hereditary_diseases: z.string().optional(), // catalog alias
        f_additionalNotes: z.string().optional(),
        f_additional_notes: z.string().optional(), // catalog alias
        f_marriage_date: z.string().optional(), // catalog field
        f_is_first_marriage: z.union([z.boolean(), z.string()]).optional(), // catalog field
        f_civil_marriage: z.union([z.boolean(), z.string()]).optional(), // catalog field
        f_profession: z.string().optional(), // catalog field
        f_hirsutism: z.union([z.boolean(), z.string()]).optional(), // catalog field
        f_expected_visit_date: z.string().optional(), // catalog field
        f_family_breast_cancer: z.union([z.boolean(), z.string()]).optional(), // catalog field
        f_family_early_menopause: z.union([z.boolean(), z.string()]).optional(), // catalog field
        f_family_infertility: z.union([z.boolean(), z.string()]).optional(), // catalog field
        f_contraceptive_history: z.union([z.boolean(), z.string()]).optional(), // catalog field
        // Repeatable section fields
        f_miscarriage_history: z.array(z.any()).optional(),
        f_art_history: z.array(z.any()).optional(),
        f_surgical_history_details: z.array(z.any()).optional(),
        f_contraceptive_history_details: z.array(z.any()).optional(),
        f_previous_tests: z.array(z.any()).optional(),
        f_radiology_studies: z.array(z.any()).optional(),  // female radiology
        f_general_attachments: z.array(z.any()).optional(), // female general attachments (file field stored as array)
        m_surgical_history_details: z.array(z.any()).optional(),
        m_genetic_tests_details: z.array(z.any()).optional(),
        m_previous_tests: z.array(z.any()).optional(),     // male previous tests
        m_radiology_studies: z.array(z.any()).optional(),  // male radiology
        m_general_attachments: z.array(z.any()).optional(), // male general attachments (file field stored as array)
        // ── Male medical fields (m_*) — accepts both naming conventions ──
        m_semen: z.string().optional(),
        m_semen_result: z.string().optional(),
        m_semen_date: z.string().optional(), // catalog field
        m_semen_volume: z.coerce.number().optional(), // catalog field
        m_semen_count: z.coerce.number().optional(), // catalog field
        m_semen_motility: z.coerce.number().optional(), // catalog field
        m_semen_morphology: z.coerce.number().optional(), // catalog field
        m_height: z.union([z.number(), z.string()]).optional(),
        m_weight: z.union([z.number(), z.string()]).optional(),
        m_height_weight: z.union([
          z.string(),
          z.object({
            height: z.union([z.string(), z.number()]).optional(),
            weight: z.union([z.string(), z.number()]).optional(),
            heightUnit: z.enum(["cm", "ft"]).optional(),
            weightUnit: z.enum(["kg", "lbs"]).optional(),
          })
        ]).optional(), // catalog combined field (string or structured object)
        m_smoking: z.string().optional(),
        m_alcohol: z.string().optional(),
        m_systemicDiseases: z.union([z.array(z.string()), z.string()]).optional(),
        m_systemic: z.union([z.array(z.string()), z.string()]).optional(), // catalog alias
        m_currentMedications: z.string().optional(),
        m_medications: z.string().optional(), // catalog alias
        m_surgical_history: z.string().optional(),
        m_family_history: z.string().optional(),
        m_genetic_tests: z.string().optional(),
        m_additional_notes: z.string().optional(),
        // ── Partner fields (p_*) ──
        p_firstName: z.string().optional(),
        p_lastName: z.string().optional(),
        p_dateOfBirth: z.string().optional(), // legacy alias
        p_dob: z.string().optional(), // catalog field alias for dateOfBirth
        p_nationality: z.string().optional(),
        p_idNumber: z.string().optional(),
        p_phone: z.string().optional(),
        p_email: z.string().optional(),
        p_occupation: z.string().optional(), // legacy alias
        p_profession: z.string().optional(), // catalog field alias for occupation
        p_height_weight: z.string().optional(),
        p_smoking: z.string().optional(),
        p_alcohol: z.string().optional(),
        p_semen_analysis: z.string().optional(),
        p_semen_result: z.string().optional(),
        p_systemic: z.union([z.array(z.string()), z.string()]).optional(),
        p_medications: z.string().optional(),
        p_surgical_history: z.string().optional(),
        p_genetic_tests: z.string().optional(),
        p_additional_notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Validate dateOfBirth: must be >= 1900 and not in the future
        // Silently ignore invalid/corrupted dates (e.g. from date picker bugs) rather than blocking submission
        let sanitizedDob: string | undefined = undefined;
        if (input.dateOfBirth) {
          const dob = new Date(input.dateOfBirth);
          if (!isNaN(dob.getTime()) && dob.getFullYear() >= 1900 && dob.getFullYear() <= 2100 && dob <= new Date()) {
            sanitizedDob = input.dateOfBirth;
          }
          // If date is invalid/out-of-range, we silently skip it (don't throw)
        }
        const crypto = await import("crypto");
        const intakeToken = crypto.randomBytes(32).toString("hex");
        const code = await getNextCode("lead");
        // Map free-form source param to valid enum values
        const VALID_SOURCES = ["paid","employee-referral","external-referral","website","maps","partner","public-relations","instagram","tiktok","doctor-referral","youtube","facebook","awatef-guide","salim-guide","organic"] as const;
        const sourceMap: Record<string, typeof VALID_SOURCES[number]> = {
          instagram: "instagram",
          facebook: "facebook",
          tiktok: "tiktok",
          youtube: "youtube",
          twitter: "organic",
          "social-media": "organic",
          "google-ads": "paid",
          google: "paid",
          "google-ad": "paid",
          paid: "paid",
          organic: "organic",
          seo: "organic",
          referral: "external-referral",
          reference: "external-referral",
          "external-referral": "external-referral",
          "employee-referral": "employee-referral",
          "doctor-referral": "doctor-referral",
          maps: "maps",
          partner: "partner",
          "public-relations": "public-relations",
          safemedigo: "partner",
          "safemedigo-platform": "partner",
          "dr-nilay": "doctor-referral",
          "dr-nilay-karaca": "doctor-referral",
          "dr-nilay-patient": "doctor-referral",
          "awatef-guide": "awatef-guide",
          "salim-guide": "salim-guide",
          website: "website",
          web: "website",
        };
        const rawSource = input.leadSource?.toLowerCase().trim();
        const mappedSource = rawSource
          ? (sourceMap[rawSource] ?? (VALID_SOURCES.includes(rawSource as any) ? rawSource as typeof VALID_SOURCES[number] : undefined))
          : undefined;
        // Sanitize enum fields: normalize underscore to hyphen and validate against allowed values
        const VALID_IVF_EXP = ["never-tried", "tried-unsuccessful", "tried-again", "tried-multiple"] as const;
        const VALID_DECISION = ["immediately", "1-2-weeks", "1-month", "2-months", "3-months", "1-3-months", "6-months", "exploring"] as const;
        const VALID_TRAVEL = ["ready", "considering", "prefers-home", "local-patient"] as const;
        const VALID_CALLBACK_METHOD = ["whatsapp", "phone", "video_call", "email"] as const;
        const VALID_GENDER = ["male", "female", "other"] as const;
        const normalizeEnum = (val: string | undefined | null) => val?.replace(/_/g, "-").toLowerCase().trim();
        const rawIvf = normalizeEnum(input.ivfExperience);
        const mappedIvf = rawIvf && VALID_IVF_EXP.includes(rawIvf as any) ? rawIvf as typeof VALID_IVF_EXP[number] : undefined;
        const rawDecision = normalizeEnum(input.decisionTimeline);
        const mappedDecision = rawDecision && VALID_DECISION.includes(rawDecision as any) ? rawDecision as typeof VALID_DECISION[number] : undefined;
        const rawTravel = normalizeEnum(input.travelReadiness);
        const mappedTravel = rawTravel && VALID_TRAVEL.includes(rawTravel as any) ? rawTravel as typeof VALID_TRAVEL[number] : undefined;
        const rawCallbackMethod = normalizeEnum(input.callbackMethod);
        const mappedCallbackMethod = rawCallbackMethod && VALID_CALLBACK_METHOD.includes(rawCallbackMethod as any) ? rawCallbackMethod as typeof VALID_CALLBACK_METHOD[number] : undefined;
        const rawGender = normalizeEnum(input.gender);
        const mappedGender = rawGender && VALID_GENDER.includes(rawGender as any) ? rawGender as typeof VALID_GENDER[number] : undefined;
        const lead = await createLead({
          firstName: input.firstName,
          lastName: input.lastName,
          middleName: input.middleName || undefined,
          phone: input.phone,
          secondaryPhone: input.secondaryPhone || undefined,
          email: input.email || undefined,
          secondaryEmail: input.secondaryEmail || undefined,
          gender: mappedGender,
          dateOfBirth: sanitizedDob ? new Date(sanitizedDob) : undefined,
          nationality: input.nationality || undefined,
          country: input.country || undefined,
          city: input.city || undefined,
          address: input.address || undefined,
          preferredLanguages: input.preferredLanguages,
          primaryLanguage: input.primaryLanguage || undefined,
          preferredContactMethods: input.preferredContactMethods,
          mainMedicalInterest: Array.isArray(input.mainMedicalInterest)
            ? input.mainMedicalInterest
            : (input.mainMedicalInterest ? [input.mainMedicalInterest] : undefined),
          ivfExperience: mappedIvf,
          fertilityDiagnosis: input.fertilityDiagnosis,
          maleFertilityDiagnosis: input.maleFertilityDiagnosis,
          decisionTimeline: mappedDecision,
          travelReadiness: mappedTravel,
          budgetRange: input.budgetRange || undefined,
          callbackPreferredDate: input.callbackPreferredDate || undefined,
          callbackPreferredTime: input.callbackPreferredTime || undefined,
          callbackMethod: mappedCallbackMethod,
          accommodationHotel: input.accommodationHotel || undefined,
          accommodationLocation: input.accommodationLocation || undefined,
          transportationAirportPickup: input.transportationAirportPickup,
          transportationLocalTransfer: input.transportationLocalTransfer,
          patientType: input.patientType || undefined,
          campaignName: input.campaignName || undefined,
          brand: input.brand ?? "fertiliv",
          leadSource: mappedSource,
          leadStatus: "intake",
          leadOrigin: "self-submitted",
          intakeToken,
          code,
        } as any);
        // createLead returns the full lead row with .id (not .insertId)
        const leadId = (lead as any)?.id ?? (lead as any)?.insertId;
        // Fire-and-forget notifications — never block the response
        Promise.resolve().then(async () => {
          try {
            await notifyOwner({
              title: "New Intake Submission",
              content: `New lead from public intake: ${input.firstName} ${input.lastName} (${input.phone})`,
            });
          } catch {}
          try {
            const timeout = new Promise<void>((_, rej) => setTimeout(() => rej(new Error('email timeout')), 10000));
            await Promise.race([
              sendNewIntakeNotification({
                firstName: input.firstName,
                lastName: input.lastName,
                phone: input.phone,
                email: input.email || null,
                gender: input.gender,
                brand: input.brand ?? "fertiliv",
                leadCode: code,
              }),
              timeout,
            ]);
          } catch {}
        });
        // ── Save medical_intake fields ──
        // Normalise field IDs: the dynamic form catalog uses snake_case IDs (f_infertility_type)
        // while some older code used camelCase (f_infertilityType). Accept both.
        const inp = input as any;
        const fInfertilityType    = inp.f_infertilityType    || inp.f_infertility_type;
        const fInfertilityDuration= inp.f_infertilityDuration|| inp.f_duration;
        const fCycleRegularity    = inp.f_cycleRegularity    || inp.f_cycle_regularity;
        const fCycleLength        = inp.f_cycleLength        != null ? inp.f_cycleLength        : inp.f_cycle_length;
        const fMenstrualFlowDays  = inp.f_menstrualFlowDays  != null ? inp.f_menstrualFlowDays  : inp.f_menstrual_flow_days;
        const fDysmenorrhea       = inp.f_dysmenorrhea       != null ? inp.f_dysmenorrhea       : inp.f_dysmenorrhea_yn;
        const fGravida            = inp.f_gravida            != null ? inp.f_gravida            : undefined;
        const fPara               = inp.f_para               != null ? inp.f_para               : undefined;
        const fAbortus            = inp.f_abortus            != null ? inp.f_abortus            : undefined;
        const fLivingChildren     = inp.f_livingChildren     != null ? inp.f_livingChildren     : inp.f_living_children;
        const fLmp                = inp.f_lmp;
        // Height/weight: new format is a structured object { height, weight, heightUnit, weightUnit }
        // Legacy format is a combined string like "165cm / 60kg"
        let fHeight = inp.f_height;
        let fWeight = inp.f_weight;
        if (!fHeight && !fWeight && inp.f_height_weight) {
          const hw = inp.f_height_weight;
          if (hw && typeof hw === "object" && (hw.height || hw.weight)) {
            // New structured format
            const hNum = parseFloat(String(hw.height || 0));
            const wNum = parseFloat(String(hw.weight || 0));
            const hUnit = hw.heightUnit ?? "cm";
            const wUnit = hw.weightUnit ?? "kg";
            // Convert to cm and kg for storage
            fHeight = hNum > 0 ? String(hUnit === "ft" ? hNum * 30.48 : hNum) : undefined;
            fWeight = wNum > 0 ? String(wUnit === "lbs" ? wNum * 0.453592 : wNum) : undefined;
          } else if (typeof hw === "string") {
            // Legacy combined string fallback
            const hwMatch = hw.match(/(\d+(?:\.\d+)?)\s*(?:cm)?[^\d]+(\d+(?:\.\d+)?)\s*(?:kg)?/i);
            if (hwMatch) { fHeight = hwMatch[1]; fWeight = hwMatch[2]; }
          }
        }
        // Male height/weight
        let mHeight = inp.m_height;
        let mWeight = inp.m_weight;
        if (!mHeight && !mWeight && inp.m_height_weight) {
          const hw = inp.m_height_weight;
          if (hw && typeof hw === "object" && (hw.height || hw.weight)) {
            const hNum = parseFloat(String(hw.height || 0));
            const wNum = parseFloat(String(hw.weight || 0));
            const hUnit = hw.heightUnit ?? "cm";
            const wUnit = hw.weightUnit ?? "kg";
            mHeight = hNum > 0 ? String(hUnit === "ft" ? hNum * 30.48 : hNum) : undefined;
            mWeight = wNum > 0 ? String(wUnit === "lbs" ? wNum * 0.453592 : wNum) : undefined;
          } else if (typeof hw === "string") {
            const hwMatch = hw.match(/(\d+(?:\.\d+)?)\s*(?:cm)?[^\d]+(\d+(?:\.\d+)?)\s*(?:kg)?/i);
            if (hwMatch) { mHeight = hwMatch[1]; mWeight = hwMatch[2]; }
          }
        }
        const fSmokingVal         = inp.f_smoking;
        const fAlcoholVal         = inp.f_alcohol;
        const fCurrentMeds        = inp.f_currentMedications || inp.f_medications;
        const fAllergies          = inp.f_allergies;
        const fPreviousIvf        = inp.f_previous_ivf;
        const fIvfDetails         = inp.f_ivf_details;
        const fFamilyHistory      = inp.f_familyHistory || inp.f_family_history;
        const fHereditaryDiseases = inp.f_hereditaryDiseases || inp.f_hereditary_diseases;
        const fAdditionalNotes    = inp.f_additionalNotes || inp.f_additional_notes;
        const fConsanguinity      = inp.f_consanguinity;
        const fSurgicalHistory    = inp.f_surgical_history;
        const fMiscarriages       = inp.f_miscarriages;
        // Repeatable section fields
        const fMiscarriageHistory = inp.f_miscarriage_history;
        const fArtHistory         = inp.f_art_history;
        const fSurgicalHistoryDetails = inp.f_surgical_history_details;
        const fContraceptiveHistoryDetails = inp.f_contraceptive_history_details;
        const fPreviousTests      = inp.f_previous_tests;
        const fRadiologyStudies   = inp.f_radiology_studies;   // female radiology
        const fGeneralAttachments = inp.f_general_attachments; // female general attachments
        const mSurgicalHistoryDetails = inp.m_surgical_history_details;
        const mGeneticTestsDetails = inp.m_genetic_tests_details;
        const mPreviousTests      = inp.m_previous_tests;      // male previous tests
        const mRadiologyStudies   = inp.m_radiology_studies;   // male radiology
        const mGeneralAttachments = inp.m_general_attachments; // male general attachments
        const fMarriageDate       = inp.f_marriage_date;
        const fIsFirstMarriage    = inp.f_is_first_marriage;
        const fCivilMarriage      = inp.f_civil_marriage;
        const fProfession         = inp.f_profession;
        const fFertilityDiagnosis = inp.f_fertility_diagnosis || inp.fertilityDiagnosis; // catalog alias
        // Systemic diseases: catalog sends as f_systemic (array), old code as f_systemicDiseases
        const fSystemicRaw        = inp.f_systemicDiseases || inp.f_systemic;
        const fSystemicObj = fSystemicRaw
          ? (Array.isArray(fSystemicRaw)
            ? Object.fromEntries((fSystemicRaw as string[]).filter(d => d !== 'none').map((d: string) => [d, true]))
            : (typeof fSystemicRaw === "string" ? { other: fSystemicRaw } : {}))
          : undefined;
        // Male fields
        const mSemen              = inp.m_semen;
        const mSemenResult        = inp.m_semen_result;
        const mSemenDate          = inp.m_semen_date;
        const mSemenVolume        = inp.m_semen_volume;
        const mSemenCount         = inp.m_semen_count;
        const mSemenMotility      = inp.m_semen_motility;
        const mSemenMorphology    = inp.m_semen_morphology;
        const mSmokingVal         = inp.m_smoking;
        const mAlcoholVal         = inp.m_alcohol;
        const mCurrentMeds        = inp.m_currentMedications || inp.m_medications;
        const mSurgicalHistory    = inp.m_surgical_history;
        const mFamilyHistory      = inp.m_family_history;
        const mGeneticTests       = inp.m_genetic_tests;
        const mAdditionalNotes    = inp.m_additional_notes;
        const mFertilityDiagnosis = inp.m_fertility_diagnosis || inp.maleFertilityDiagnosis; // catalog alias
        const mSystemicRaw        = inp.m_systemicDiseases || inp.m_systemic;
        const mSystemicObj = mSystemicRaw
          ? (Array.isArray(mSystemicRaw)
            ? Object.fromEntries((mSystemicRaw as string[]).filter(d => d !== 'none').map((d: string) => [d, true]))
            : (typeof mSystemicRaw === "string" ? { other: mSystemicRaw } : {}))
          : undefined;
        const maleIntakeData: Record<string, any> = {
          ...(mSemen != null ? { semenAnalysisDone: mSemen === "yes" } : {}),
          ...(mSemenResult ? { semenNotes: mSemenResult } : {}),
          ...(mSemenDate ? { semenAnalysisDate: mSemenDate } : {}),
          ...(mSemenVolume != null ? { semenVolume: Number(mSemenVolume) } : {}),
          ...(mSemenCount != null ? { semenCount: Number(mSemenCount) } : {}),
          ...(mSemenMotility != null ? { semenMotility: Number(mSemenMotility) } : {}),
          ...(mSemenMorphology != null ? { semenMorphology: Number(mSemenMorphology) } : {}),
          ...(mHeight ? { heightCm: parseFloat(String(mHeight)) } : {}),
          ...(mWeight ? { weightKg: parseFloat(String(mWeight)) } : {}),
          ...(mSmokingVal ? { smoking: mSmokingVal } : {}),
          ...(mAlcoholVal ? { alcohol: mAlcoholVal } : {}),
          ...(mSystemicObj ? { systemicDiseases: mSystemicObj } : {}),
          ...(mCurrentMeds ? { currentMedications: mCurrentMeds } : {}),
          ...(mSurgicalHistoryDetails && mSurgicalHistoryDetails.length > 0
            ? { surgicalHistory: mSurgicalHistoryDetails }
            : mSurgicalHistory ? { surgicalHistory: mSurgicalHistory } : {}),
          ...(mFamilyHistory ? { familyHistory: mFamilyHistory } : {}),
          ...(mGeneticTestsDetails && mGeneticTestsDetails.length > 0
            ? { geneticTests: mGeneticTestsDetails }
            : mGeneticTests ? { geneticTests: mGeneticTests } : {}),
          ...(mAdditionalNotes ? { additionalNotes: mAdditionalNotes } : {}),
          ...(mFertilityDiagnosis && mFertilityDiagnosis.length > 0 ? { fertilityDiagnosis: mFertilityDiagnosis } : {}),
          ...(mPreviousTests && mPreviousTests.length > 0 ? { previousTests: mPreviousTests } : {}),
          // Partner info stored in maleIntake.partner
          ...(inp.p_firstName || inp.p_lastName ? { partner: {
            firstName: inp.p_firstName,
            lastName: inp.p_lastName,
            dateOfBirth: inp.p_dateOfBirth || inp.p_dob, // support both aliases
            nationality: inp.p_nationality,
            idNumber: inp.p_idNumber,
            phone: inp.p_phone,
            email: inp.p_email,
            occupation: inp.p_occupation || inp.p_profession, // support both aliases
            heightWeight: inp.p_height_weight,
            smoking: inp.p_smoking,
            alcohol: inp.p_alcohol,
            semenAnalysis: inp.p_semen_analysis,
            semenResult: inp.p_semen_result,
            systemicDiseases: inp.p_systemic,
            medications: inp.p_medications,
            surgicalHistory: inp.p_surgical_history,
            geneticTests: inp.p_genetic_tests,
            additionalNotes: inp.p_additional_notes,
          }} : {}),
        };
        // Safe date parse helper — returns Date or undefined, never throws
        const safeDate = (s: string | undefined): Date | undefined => {
          if (!s) return undefined;
          const d = new Date(s);
          if (isNaN(d.getTime()) || d.getFullYear() < 1900 || d.getFullYear() > 2100) return undefined;
          return d;
        };
        const medicalData: Record<string, any> = {
          ...(fInfertilityType ? { infertilityType: fInfertilityType as any } : {}),
          ...(fInfertilityDuration ? { infertilityDuration: fInfertilityDuration } : {}),
          ...(fGravida != null ? { gravida: Number(fGravida) } : {}),
          ...(fPara != null ? { para: Number(fPara) } : {}),
          ...(fAbortus != null ? { abortus: Number(fAbortus) } : {}),
          ...(fLivingChildren != null ? { livingChildren: Number(fLivingChildren) } : {}),
          // Prefer detailed repeatable history over simple yes/no flag
          ...(fMiscarriageHistory && fMiscarriageHistory.length > 0
            ? { miscarriageHistory: fMiscarriageHistory }
            : fMiscarriages != null ? { miscarriageHistory: fMiscarriages === true || fMiscarriages === "yes" } : {}),
          ...(fPreviousTests && fPreviousTests.length > 0 ? { previousTests: fPreviousTests } : {}),
          ...(fRadiologyStudies && fRadiologyStudies.length > 0 ? { radiologyStudies: fRadiologyStudies } : {}),
          ...(fGeneralAttachments && fGeneralAttachments.length > 0 ? { generalAttachmentsFemale: fGeneralAttachments } : {}),
          ...(mRadiologyStudies && mRadiologyStudies.length > 0 ? { maleRadiologyStudies: mRadiologyStudies } : {}),
          ...(mGeneralAttachments && mGeneralAttachments.length > 0 ? { generalAttachmentsMale: mGeneralAttachments } : {}),
          ...(fContraceptiveHistoryDetails && fContraceptiveHistoryDetails.length > 0 ? { contraceptiveHistory: fContraceptiveHistoryDetails } : {}),
          ...(fSurgicalHistoryDetails && fSurgicalHistoryDetails.length > 0 ? { surgicalHistory: fSurgicalHistoryDetails } : {}),
          ...(fArtHistory && fArtHistory.length > 0 ? { artHistory: fArtHistory } : {}),
          ...(fCycleRegularity ? { cycleRegularity: fCycleRegularity as any } : {}),
          ...(fLmp && safeDate(fLmp) ? { lastMenstrualPeriod: safeDate(fLmp) } : {}),
          ...(fCycleLength != null ? { cycleLengthDays: Number(fCycleLength) } : {}),
          ...(fMenstrualFlowDays != null ? { menstrualFlowDays: Number(fMenstrualFlowDays) } : {}),
          ...(fDysmenorrhea != null ? { dysmenorrhea: fDysmenorrhea === true || fDysmenorrhea === "yes" } : {}),
          ...(fHeight ? { heightCm: parseFloat(String(fHeight)) } : {}),
          ...(fWeight ? { weightKg: parseFloat(String(fWeight)) } : {}),
          ...(fSmokingVal ? { smoking: fSmokingVal as any } : {}),
          ...(fAlcoholVal ? { alcohol: fAlcoholVal as any } : {}),
          ...(fCurrentMeds ? { currentMedications: fCurrentMeds } : {}),
          ...(fAllergies ? { allergies: fAllergies } : {}),
          ...(fSystemicObj ? { systemicDiseases: fSystemicObj } : {}),
          // Only use simple yes/no fallback if no detailed repeatable data was provided
          ...(!fArtHistory?.length && (fPreviousIvf != null || fIvfDetails) ? { artHistory: [{ type: "IVF", done: fPreviousIvf === true || fPreviousIvf === "yes", notes: fIvfDetails }] } : {}),
          ...(!fSurgicalHistoryDetails?.length && fSurgicalHistory != null ? { surgicalHistory: fSurgicalHistory === true || fSurgicalHistory === "yes" } : {}),
          ...(fFamilyHistory ? { hereditaryDiseases: fFamilyHistory } : {}),
          ...(fHereditaryDiseases ? { hereditaryDiseases: fHereditaryDiseases } : {}),
          ...(fConsanguinity != null ? { consanguinity: fConsanguinity === true || fConsanguinity === "yes" } : {}),
          ...(fAdditionalNotes ? { additionalNotes: fAdditionalNotes } : {}),
          ...(fMarriageDate && safeDate(fMarriageDate) ? { marriageDate: safeDate(fMarriageDate) } : {}),
          ...(fIsFirstMarriage != null ? { isFirstMarriage: fIsFirstMarriage === true || fIsFirstMarriage === "yes" } : {}),
          ...(fCivilMarriage != null ? { hasCivilMarriageCertificate: fCivilMarriage === true || fCivilMarriage === "yes" } : {}),
          ...(fProfession ? { profession: fProfession } : {}),
          ...(fFertilityDiagnosis && fFertilityDiagnosis.length > 0 ? { fertilityDiagnosis: fFertilityDiagnosis } : {}),
          // Male intake as JSON
          ...(Object.keys(maleIntakeData).length > 0 ? { maleIntake: maleIntakeData } : {}),
        };
        if (leadId) {
          try {
            const { upsertMedicalIntake } = await import("./db");
            // Always upsert — even an empty row ensures the Medical Record tab shows
            // the lead's intake summary instead of "No intake data recorded yet"
            await upsertMedicalIntake(leadId, medicalData as any);
          } catch (e) {
            // Non-fatal: log but don't fail the submission
            console.error("[submitBasicInfo] Failed to save medical fields:", e);
          }
        }
        // ── Auto-create a partner lead if partner name fields are provided ──
        // This creates a second linked lead record for the spouse/partner with opposite gender
        if (leadId && (inp.p_firstName || inp.p_lastName)) {
          try {
            const partnerFirstName = (inp.p_firstName || "").trim();
            const partnerLastName  = (inp.p_lastName  || "").trim();
            // Only create if at least one name part is non-empty
            if (partnerFirstName || partnerLastName) {
              // Determine partner gender: opposite of primary lead
              const primaryGender = mappedGender;
              const partnerGender: "male" | "female" | undefined =
                primaryGender === "female" ? "male"
                : primaryGender === "male" ? "female"
                : undefined;
              // Sanitize partner DOB
              const pDobRaw = inp.p_dob || inp.p_dateOfBirth;
              let pDob: Date | undefined;
              if (pDobRaw) {
                const d = new Date(pDobRaw);
                if (!isNaN(d.getTime()) && d.getFullYear() >= 1900 && d.getFullYear() <= 2100 && d <= new Date()) {
                  pDob = d;
                }
              }
              const partnerCode = await getNextCode("lead");
              const partnerLead = await createLead({
                firstName: partnerFirstName || "(Partner)",
                lastName:  partnerLastName  || "",
                phone:     inp.p_phone  || undefined,
                email:     inp.p_email  || undefined,
                gender:    partnerGender,
                dateOfBirth: pDob,
                nationality: inp.p_nationality || undefined,
                brand:       input.brand ?? "fertiliv",
                leadSource:  mappedSource,
                leadStatus:  "intake",
                leadOrigin:  "self-submitted",
                code:        partnerCode,
              } as any);
              const partnerLeadId = (partnerLead as any)?.id ?? (partnerLead as any)?.insertId;
              if (partnerLeadId) {
                // Link both leads as partners (bidirectional)
                await linkLeadPartner(leadId, partnerLeadId);
                // Save partner's medical data (profession) to their own medical intake
                const partnerOccupation = inp.p_profession || inp.p_occupation;
                if (partnerOccupation) {
                  const { upsertMedicalIntake: upsertMI } = await import("./db");
                  await upsertMI(partnerLeadId, { profession: partnerOccupation } as any);
                }
              }
            }
          } catch (e) {
            // Non-fatal: log but don't block the primary lead submission
            console.error("[submitBasicInfo] Failed to auto-create partner lead:", e);
          }
        }
        return { leadId, intakeToken };
      }),

    /**
     * Step 2A: Update treatment interest on lead by token
     */
    updateInterest: publicProcedure
      .input(z.object({
        intakeToken: z.string().min(1),
        mainMedicalInterest: z.enum(["ivf_icsi","iui","egg_freezing","fertility_checkup_couple","fertility_checkup_female","fertility_checkup_male","other"]),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        const { leads: leadsTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(leadsTable)
          .set({ mainMedicalInterest: input.mainMedicalInterest })
          .where(eq(leadsTable.intakeToken, input.intakeToken));
        return { success: true };
      }),

    /**
     * Step 2B option: Request callback — save preferred date/time/method on lead
     */
    requestCallback: publicProcedure
      .input(z.object({
        intakeToken: z.string().min(1),
        callbackPreferredDate: z.string().min(1),
        callbackPreferredTime: z.string().min(1),
        callbackMethod: z.enum(["whatsapp","phone","video_call","email"]),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        const { leads: leadsTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        // Fetch the lead details for the notification and task
        const leadRows = await db.select({
          id: leadsTable.id,
          firstName: leadsTable.firstName,
          lastName: leadsTable.lastName,
          phone: leadsTable.phone,
          email: leadsTable.email,
          code: leadsTable.code,
        }).from(leadsTable).where(eq(leadsTable.intakeToken, input.intakeToken)).limit(1);
        const lead = leadRows[0];
        if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid intake token" });
        await db.update(leadsTable)
          .set({
            callbackPreferredDate: input.callbackPreferredDate,
            callbackPreferredTime: input.callbackPreferredTime,
            callbackMethod: input.callbackMethod as any,
            callbackRequestedAt: new Date(),
          })
          .where(eq(leadsTable.intakeToken, input.intakeToken));
        const methodLabel: Record<string, string> = {
          whatsapp: "WhatsApp",
          phone: "Phone Call",
          video_call: "Video Call",
          email: "Email",
        };
        const method = methodLabel[input.callbackMethod] ?? input.callbackMethod;
        // Auto-create a task linked to this lead
        await createTask({
          title: `Callback: ${lead.firstName} ${lead.lastName}`,
          type: "callback_request",
          status: "open",
          priority: "high",
          dueDate: input.callbackPreferredDate,
          dueTime: input.callbackPreferredTime,
          communicationMethod: input.callbackMethod === "phone" ? "phone_call" : input.callbackMethod as any,
          notes: `Requested via intake form. Phone: ${lead.phone}${lead.email ? ` | Email: ${lead.email}` : ""}`,
          leadId: lead.id,
        });
        // Notify owner with full lead details
        await notifyOwner({
          title: `Callback Requested — ${lead.firstName} ${lead.lastName}`,
          content: `Lead ${lead.code ?? ""} (${lead.firstName} ${lead.lastName}) requested a callback.\nDate: ${input.callbackPreferredDate} at ${input.callbackPreferredTime}\nMethod: ${method}\nPhone: ${lead.phone}${lead.email ? `\nEmail: ${lead.email}` : ""}`,
        }).catch(() => {});
        return { success: true };
      }),

    /**
     * Submit medical intake data by token
     */
    submitMedicalIntake: publicProcedure
      .input(z.object({
        intakeToken: z.string().min(1),
        intakeData: z.record(z.string(), z.any()),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        const { leads: leadsTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const leadRows = await db.select({ id: leadsTable.id }).from(leadsTable).where(eq(leadsTable.intakeToken, input.intakeToken)).limit(1);
        const leadId = leadRows[0]?.id;
        if (!leadId) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid intake token" });
        await upsertMedicalIntake(leadId, input.intakeData as any);
        await notifyOwner({
          title: "Medical Intake Completed",
          content: `A lead completed their medical intake form (lead ID: ${leadId}).`,
        }).catch(() => {});
        return { success: true };
      }),

    /**
     * Schedule a callback appointment from the public intake form.
     * Creates an appointment in the system and notifies staff.
     */
    scheduleCallback: publicProcedure
      .input(z.object({
        intakeToken: z.string().min(1),
        date: z.string().optional(),  // YYYY-MM-DD (legacy)
        time: z.string().optional(),  // HH:MM (legacy)
        isoStart: z.string().optional(), // ISO datetime (new coordinator booking)
        isoEnd: z.string().optional(),   // ISO datetime (new coordinator booking)
        coordinatorId: z.number().optional(), // Staff user ID
        coordinatorName: z.string().optional(),
        fallbackNote: z.string().optional(), // "no suitable time" note
        leadName: z.string().optional(),
        leadPhone: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        const { leads: leadsTable, appointments: appointmentsTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        // Resolve lead by token
        const leadRows = await db.select({ id: leadsTable.id, firstName: leadsTable.firstName, lastName: leadsTable.lastName, phone: leadsTable.phone })
          .from(leadsTable).where(eq(leadsTable.intakeToken, input.intakeToken)).limit(1);
        const lead = leadRows[0];
        if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid intake token" });
        const leadName = `${lead.firstName} ${lead.lastName}`;

        // ── Fallback path: no suitable time ──────────────────────────────────
        if (input.fallbackNote) {
          await notifyOwner({
            title: `📞 Callback Request — ${leadName}`,
            content: `Lead ${leadName} (${lead.phone ?? "no phone"}) could not find a suitable time and left a note:\n\n"${input.fallbackNote}"`,
          }).catch(() => {});
          return { success: true, fallback: true };
        }

        // ── Slot booking path ─────────────────────────────────────────────────
        // Support both ISO start (new) and date+time (legacy)
        let appointmentAt: Date;
        let durationMinutes = 30;
        if (input.isoStart) {
          appointmentAt = new Date(input.isoStart);
          if (input.isoEnd) {
            durationMinutes = Math.round((new Date(input.isoEnd).getTime() - appointmentAt.getTime()) / 60000);
          }
        } else if (input.date && input.time) {
          appointmentAt = new Date(`${input.date}T${input.time}:00`);
        } else {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Either isoStart or date+time must be provided" });
        }
        if (isNaN(appointmentAt.getTime())) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid date or time" });

        // Create appointment (non-fatal if table schema differs)
        try {
          await db.insert(appointmentsTable).values({
            leadId: lead.id,
            staffId: input.coordinatorId ?? null,
            title: `Callback — ${leadName}`,
            scheduledAt: appointmentAt,
            appointmentDate: appointmentAt,
            duration: durationMinutes,
            type: "online" as any,
            purpose: "sales_consultation" as any,
            status: "scheduled" as any,
            notes: `Scheduled via intake form. Phone: ${lead.phone ?? input.leadPhone ?? "N/A"}${input.coordinatorName ? `. Coordinator: ${input.coordinatorName}` : ""}`,
          } as any);
        } catch (e) {
          console.error("[scheduleCallback] Failed to insert appointment:", e);
        }

        // Notify staff
        const dateStr = input.isoStart
          ? new Date(input.isoStart).toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })
          : `${input.date} at ${input.time}`;
        await notifyOwner({
          title: `📅 New Callback Scheduled — ${leadName}`,
          content: `Lead ${leadName} (${lead.phone ?? "no phone"}) scheduled a callback for ${dateStr} via the intake form.${input.coordinatorName ? ` Coordinator: ${input.coordinatorName}.` : ""}`,
        }).catch(() => {});
        return { success: true, appointmentAt: appointmentAt.toISOString() };
      }),

    /**
     * Check if a lead with the given email or phone already exists.
     * Used in the intake wizard to offer "resume" flow.
     */
    checkExistingLead: publicProcedure
      .input(z.object({
        email: z.string().email().optional(),
        phone: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        const { leads: leadsTable } = await import("../drizzle/schema");
        const { or, eq } = await import("drizzle-orm");
        if (!input.email && !input.phone) return { exists: false };
        const conditions = [];
        if (input.email) conditions.push(eq(leadsTable.email, input.email));
        if (input.phone) conditions.push(eq(leadsTable.phone, input.phone));
        const rows = await db.select({ id: leadsTable.id, intakeToken: leadsTable.intakeToken, email: leadsTable.email })
          .from(leadsTable)
          .where(or(...conditions))
          .limit(1);
        if (!rows[0] || !rows[0].intakeToken) return { exists: false };
        return { exists: true, maskedEmail: rows[0].email ? rows[0].email.replace(/(.{2}).+(@.+)/, "$1***$2") : undefined };
      }),

    /**
     * Send a 6-digit OTP to the lead's email for identity verification.
     * Stores the OTP (hashed) and expiry in the leads table.
     */
    sendOtp: publicProcedure
      .input(z.object({
        intakeToken: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        const { leads: leadsTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const rows = await db.select({ id: leadsTable.id, email: leadsTable.email, firstName: leadsTable.firstName })
          .from(leadsTable).where(eq(leadsTable.intakeToken, input.intakeToken)).limit(1);
        const lead = rows[0];
        if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid intake token" });
        if (!lead.email) throw new TRPCError({ code: "BAD_REQUEST", message: "No email address on file" });
        // Generate 6-digit OTP
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await db.update(leadsTable).set({ otpCode: otp, otpExpiresAt: expiresAt }).where(eq(leadsTable.id, lead.id));
        // Send email via Resend
        try {
          const { Resend } = await import("resend");
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: "Fertiliv <noreply@fertiliv.com>",
            to: lead.email,
            subject: "Your Fertiliv Verification Code",
            html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
              <h2 style="color:#1E0566">Verify your email</h2>
              <p>Hi ${lead.firstName ?? "there"},</p>
              <p>Your verification code for Fertiliv is:</p>
              <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1E0566;text-align:center;padding:24px;background:#f5f3ff;border-radius:12px;margin:24px 0">${otp}</div>
              <p style="color:#666">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
            </div>`,
          });
        } catch (e) {
          console.error("[sendOtp] Email send failed:", e);
          // Don't throw — still return success so user can see the code in dev
        }
        return { success: true, maskedEmail: lead.email.replace(/(.{2}).+(@.+)/, "$1***$2") };
      }),

    /**
     * Verify the OTP entered by the user.
     * On success: marks emailVerified=true and returns a formSessionToken.
     */
    verifyOtp: publicProcedure
      .input(z.object({
        intakeToken: z.string().min(1),
        otp: z.string().length(6),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        const { leads: leadsTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const rows = await db.select({ id: leadsTable.id, otpCode: leadsTable.otpCode, otpExpiresAt: leadsTable.otpExpiresAt })
          .from(leadsTable).where(eq(leadsTable.intakeToken, input.intakeToken)).limit(1);
        const lead = rows[0];
        if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid intake token" });
        if (!lead.otpCode) throw new TRPCError({ code: "BAD_REQUEST", message: "No OTP was sent. Please request a new code." });
        if (lead.otpExpiresAt && new Date() > new Date(lead.otpExpiresAt)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "OTP has expired. Please request a new code." });
        }
        if (lead.otpCode !== input.otp) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Incorrect code. Please try again." });
        }
        // OTP correct — mark verified and clear OTP
        const sessionToken = (await import("crypto")).randomBytes(32).toString("hex");
        await db.update(leadsTable).set({
          emailVerified: true,
          formSessionToken: sessionToken,
          otpCode: null,
          otpExpiresAt: null,
        }).where(eq(leadsTable.id, lead.id));
        return { success: true, formSessionToken: sessionToken };
      }),

    /**
     * Upload a file from the public intake form.
     * Authenticated by intakeToken — no login required.
     * Stores the file in S3 and registers it in lead_documents.
     */
    uploadFile: publicProcedure
      .input(z.object({
        intakeToken: z.string().min(1),
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        tag: z.string().optional(),
        password: z.string().optional(),
        fieldId: z.string().optional(), // e.g. "f_previous_tests"
      }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        const { leads: leadsTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        // Verify the intake token and get the lead id
        const rows = await db.select({ id: leadsTable.id })
          .from(leadsTable).where(eq(leadsTable.intakeToken, input.intakeToken)).limit(1);
        const lead = rows[0];
        if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid intake token" });
        // Upload to S3
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "bin";
        const key = `intake-files/lead-${lead.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType, input.fileName);
        // Save to lead_documents
        const { createLeadDocument } = await import("./db");
        const docId = await createLeadDocument({
          leadId: lead.id,
          patientId: null,
          fileKey: storedKey,
          fileUrl: url,
          fileName: input.fileName,
          mimeType: input.mimeType,
          uploadedBy: 0, // system/intake upload — 0 means system
          intakeSection: input.fieldId ?? null,
          tag: input.tag ?? input.fieldId ?? null,
          docPassword: input.password ?? null,
          ownerType: "lead",
          ownerId: lead.id,
        } as any);
        return { fileKey: storedKey, fileUrl: url, fileName: input.fileName, docId };
      }),

    /**
     * Bulk import leads from Zoho CRM CSV export.
     * Accepts an array of mapped row objects and inserts them as leads (+ optional notes/tasks).
     * Skips rows where email already exists in the leads table.
     */
    bulkImport: staffOrAdminProcedure
      .input(z.object({
        rows: z.array(z.object({
          zohoRecordId: z.string().optional(),
          firstName: z.string(),
          lastName: z.string(),
          email: z.string().optional(),
          phone: z.string().optional(),
          nationality: z.string().optional(),
          country: z.string().optional(),
          city: z.string().optional(),
          leadSource: z.string().optional(),
          leadStatus: z.string().optional(),
          brand: z.string().optional(),
          decisionTimeline: z.string().optional(),
          travelReadiness: z.string().optional(),
          ivfExperience: z.string().optional(),
          mainMedicalInterest: z.array(z.string()).optional(),
          fertilityDiagnosis: z.array(z.string()).optional(),
          preferredLanguage: z.string().optional(),
          budgetRange: z.string().optional(),
          notes: z.string().optional(),
          taskTitle: z.string().optional(),
          taskDueDate: z.string().optional(),
          rating: z.string().optional(), // Zoho "Rating" column
          createdAt: z.string().optional(), // Zoho "Created Time" column
        }))
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        const { leads: leadsTable, leadCommunications, tasks: tasksTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");

        // Zoho → Fertiliv status mapping
        const STATUS_MAP: Record<string, string> = {
          "intake": "intake",
          "attempted to contact": "attempted-to-contact",
          "contacted – awaiting info": "contacted-awaiting-info",
          "contacted - awaiting info": "contacted-awaiting-info",
          "medical reports received": "medical-reports-received",
          "doctor feedback shared": "doctor-feedback-shared",
          "follow-up / negotiation": "follow-up-negotiation",
          "follow-up/negotiation": "follow-up-negotiation",
          "ready to travel": "ready-to-travel",
          "converted to patient (won)": "converted",
          "cold / to reconnect": "cold",
          "lost / no response": "lost",
          "not qualified (financially/medically)": "not-qualified",
          "junk lead": "junk",
        };
        // Zoho → Fertiliv source mapping
        const SOURCE_MAP: Record<string, string> = {
          "organic": "organic",
          "paid": "paid",
          "advertisement": "paid",
          "google ads": "paid",
          "google-ads": "paid",
          "facebook": "facebook",
          "instagram": "instagram",
          "tiktok": "tiktok",
          "youtube": "youtube",
          "external referral": "external-referral",
          "external-referral": "external-referral",
          "employee referral": "employee-referral",
          "employee-referral": "employee-referral",
          "doctor referral": "doctor-referral",
          "doctor-referral": "doctor-referral",
          "maps": "maps",
          "partner": "partner",
          "public relations": "public-relations",
          "public-relations": "public-relations",
          "fertiliv website": "website",
          "website": "website",
          "web research": "website",
          "awatef": "awatef-guide",
          "awatef-guide": "awatef-guide",
          "salim": "salim-guide",
          "salim-guide": "salim-guide",
          "direct": "external-referral",
          "reference": "external-referral",
        };
        const VALID_STATUSES = ["intake","attempted-to-contact","contacted-awaiting-info","medical-reports-received","doctor-feedback-shared","follow-up-negotiation","ready-to-travel","converted","cold","lost","not-qualified","junk"] as const;
        const VALID_SOURCES = ["paid","employee-referral","external-referral","website","maps","partner","public-relations","instagram","tiktok","doctor-referral","youtube","facebook","awatef-guide","salim-guide","organic"] as const;

        let inserted = 0;
        let skipped = 0;
        const errors: string[] = [];
        // Map zohoRecordId → fertilivLeadId for notes/tasks linking
        const zohoIdMap: Record<string, number> = {};

        for (const row of input.rows) {
          try {
            // Duplicate check by email
            if (row.email) {
              const existing = await db.select({ id: leadsTable.id }).from(leadsTable).where(eq(leadsTable.email, row.email)).limit(1);
              if (existing.length > 0) {
                // Still record the mapping so notes/tasks can link
                if (row.zohoRecordId) zohoIdMap[row.zohoRecordId] = existing[0].id;
                skipped++; continue;
              }
            }

            // Frontend already maps Zoho values → system values before sending.
            // Just validate the received value is in VALID_STATUSES; fallback to "intake".
            const receivedStatus = (row.leadStatus ?? "").trim();
            const status = VALID_STATUSES.includes(receivedStatus as any)
              ? (receivedStatus as typeof VALID_STATUSES[number])
              : "intake";

            const rawSource = (row.leadSource ?? "").toLowerCase().trim();
            const mappedSource = SOURCE_MAP[rawSource];
            const source = mappedSource && VALID_SOURCES.includes(mappedSource as any) ? (mappedSource as typeof VALID_SOURCES[number]) : undefined;

            const VALID_TIMELINES = ["immediately","1-2-weeks","1-month","2-months","3-months","1-3-months","6-months","exploring"] as const;
            const VALID_TRAVEL = ["ready","considering","prefers-home","local-patient"] as const;
            const VALID_IVF = ["never-tried","tried-unsuccessful","tried-again","tried-multiple"] as const;
            const VALID_BRANDS = ["fertiliv","safemedigo","dr-nilay-karaca"] as const;
            const timeline = VALID_TIMELINES.includes(row.decisionTimeline as any) ? row.decisionTimeline as typeof VALID_TIMELINES[number] : undefined;
            const travel = VALID_TRAVEL.includes(row.travelReadiness as any) ? row.travelReadiness as typeof VALID_TRAVEL[number] : undefined;
            const ivf = VALID_IVF.includes(row.ivfExperience as any) ? row.ivfExperience as typeof VALID_IVF[number] : undefined;
            const brand = VALID_BRANDS.includes(row.brand as any) ? row.brand as typeof VALID_BRANDS[number] : "fertiliv";
            const [result] = await db.insert(leadsTable).values({
              firstName: row.firstName,
              lastName: row.lastName,
              email: row.email || undefined,
              phone: row.phone || undefined,
              nationality: row.nationality || undefined,
              country: row.country || undefined,
              city: row.city || undefined,
              leadSource: source,
              leadStatus: status,
              brand,
              decisionTimeline: timeline,
              travelReadiness: travel,
              ivfExperience: ivf,
              mainMedicalInterest: row.mainMedicalInterest && row.mainMedicalInterest.length > 0 ? row.mainMedicalInterest : undefined,
              fertilityDiagnosis: row.fertilityDiagnosis && row.fertilityDiagnosis.length > 0 ? row.fertilityDiagnosis : undefined,
              preferredLanguages: row.preferredLanguage ? [row.preferredLanguage] : undefined,
              budgetRange: row.budgetRange || undefined,
              rating: row.rating || undefined,
              ...(row.createdAt ? (() => { const d = new Date(row.createdAt!); return isNaN(d.getTime()) ? {} : { createdAt: d }; })() : {}),
            });
            const leadId = (result as any).insertId as number;
            if (row.zohoRecordId) zohoIdMap[row.zohoRecordId] = leadId;

            // Insert description as lead communication
            if (row.notes && row.notes.trim()) {
              await db.insert(leadCommunications).values({
                leadId,
                note: row.notes.trim(),
                createdBy: ctx.user.id,
              });
            }

            // Insert inline task if provided
            if (row.taskTitle && row.taskTitle.trim()) {
              await db.insert(tasksTable).values({
                title: row.taskTitle.trim(),
                leadId,
                createdById: ctx.user.id,
                dueDate: row.taskDueDate || undefined,
                status: "open",
                priority: "medium",
                type: "follow_up",
              });
            }

            inserted++;
          } catch (err: any) {
            errors.push(`Row ${row.firstName} ${row.lastName}: ${err?.message ?? "unknown error"}`);
          }
        }

        return { inserted, skipped, errors, zohoIdMap };
      }),

    /**
     * Bulk import notes from Zoho CRM Notes CSV export.
     * Links each note to a lead by matching zohoLeadId (Zoho's "Parent Id" column) or email.
     * The caller must pass a leadEmailMap built from the leads import result.
     */
    importNotes: staffOrAdminProcedure
      .input(z.object({
        rows: z.array(z.object({
          zohoLeadId: z.string().optional(),  // Zoho "Parent ID.id" column
          content: z.string(),                 // Zoho "Note Content" column
          createdAt: z.string().optional(),    // Zoho "Note Created Time" column
        })),
        zohoIdMap: z.record(z.string(), z.number()), // passed from leads import result
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        const { leadCommunications } = await import("../drizzle/schema");

        let inserted = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const row of input.rows) {
          if (!row.content?.trim()) { skipped++; continue; }
          try {
            const leadId = row.zohoLeadId ? input.zohoIdMap[row.zohoLeadId] : undefined;
            if (!leadId) { skipped++; continue; }
            // Strip HTML tags from Zoho note content (Zoho uses <br> etc.)
            const cleanNote = row.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            // Parse Zoho date string (e.g. "04/15/2026 01:23 PM") to timestamp
            let noteCreatedAt: number | undefined;
            if (row.createdAt) {
              const parsed = new Date(row.createdAt);
              if (!isNaN(parsed.getTime())) noteCreatedAt = parsed.getTime();
            }
            await db.insert(leadCommunications).values({
              leadId,
              note: cleanNote,
              createdBy: ctx.user.id,
              ...(noteCreatedAt ? { createdAt: new Date(noteCreatedAt) } : {}),
            });
            inserted++;
          } catch (err: any) {
            errors.push(`Note: ${err?.message ?? "unknown error"}`);
          }
        }
        return { inserted, skipped, errors };
      }),

    /**
     * Bulk import tasks from Zoho CRM Tasks CSV export.
     * Links each task to a lead by matching email.
     */
    importTasks: staffOrAdminProcedure
      .input(z.object({
        rows: z.array(z.object({
          zohoLeadId: z.string().optional(),  // Zoho "Related To.id" column
          title: z.string(),                   // Zoho "Subject" column
          dueDate: z.string().optional(),      // Zoho "Due Date" column
          status: z.string().optional(),       // Zoho "Status" column
          priority: z.string().optional(),     // Zoho "Priority" column
          notes: z.string().optional(),        // Zoho "Description" column
        })),
        zohoIdMap: z.record(z.string(), z.number()), // passed from leads import result
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        const { tasks: tasksTable } = await import("../drizzle/schema");

        let inserted = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const row of input.rows) {
          if (!row.title?.trim()) { skipped++; continue; }
          try {
            const leadId = row.zohoLeadId ? input.zohoIdMap[row.zohoLeadId] : undefined;
            // Zoho status → Fertiliv status
            const statusMap: Record<string, "open" | "in_progress" | "done"> = {
              "not started": "open", "in progress": "in_progress", "completed": "done",
              "deferred": "open", "waiting for input": "open",
            };
            const status = statusMap[(row.status ?? "").toLowerCase()] ?? "open";
            // Zoho priority → Fertiliv priority
            const priorityMap: Record<string, "low" | "medium" | "high"> = {
              "lowest": "low", "low": "low", "normal": "medium",
              "high": "high", "highest": "high",
            };
            const priority = priorityMap[(row.priority ?? "").toLowerCase()] ?? "medium";
            // Parse Zoho date format YYYY-MM-DD
            const dueDate = row.dueDate?.trim() || undefined;
            await db.insert(tasksTable).values({
              title: row.title.trim(),
              leadId: leadId ?? undefined,
              createdById: ctx.user.id,
              dueDate,
              notes: row.notes?.trim() || undefined,
              status,
              priority,
              type: "follow_up",
            });
            inserted++;
          } catch (err: any) {
            errors.push(`Task "${row.title}": ${err?.message ?? "unknown error"}`);
          }
        }
        return { inserted, skipped, errors };
      }),
  }),
  duplicateCheck: router({
    /**
     * Check if an email or phone already exists in a given entity table.
     * Returns { duplicate: true, field, conflictName } or { duplicate: false }.
     * Used for real-time validation in create/edit forms.
     */
    check: staffOrAdminProcedure
      .input(z.object({
        entity: z.enum(["patients", "leads", "users", "doctors", "partner_clinics"]),
        email: z.string().optional(),
        phone: z.string().optional(),
        secondaryPhone: z.string().optional(),
        excludeId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        // Returns array of all conflicts (soft warning — not a hard block)
        const conflicts = await checkDuplicate(
          input.entity,
          { email: input.email, phone: input.phone, secondaryPhone: input.secondaryPhone },
          input.excludeId
        );
        return {
          conflicts,
          hasDuplicate: conflicts.length > 0,
        };
      }),
  }),

  // ─── Tasks ───────────────────────────────────────────────────────────────────
  tasks: router({
    list: staffOrAdminProcedure
      .input(z.object({
        leadId: z.number().optional(),
        patientId: z.number().optional(),
        assignedToId: z.number().optional(),
        status: z.enum(["open", "in_progress", "done", "deferred"]).optional(),
        type: z.enum(["callback_request", "follow_up", "send_info", "consultation_request", "other"]).optional(),
        dueDateFrom: z.string().optional(),
        dueDateTo: z.string().optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(1000).optional(),
      }).optional())
      .query(({ ctx, input }) => {
        // Doctors only see tasks they created or that are assigned to them
        const scopedToUserId = ctx.user.role === "doctor" ? ctx.user.id : undefined;
        return getTasks({ ...(input ?? {}), scopedToUserId });
      }),

    create: staffOrAdminProcedure
      .input(z.object({
        title: z.string().min(1),
        type: z.enum(["callback_request", "follow_up", "send_info", "consultation_request", "other"]).default("follow_up"),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
        dueDate: z.string().optional(),
        dueTime: z.string().optional(),
        communicationMethod: z.enum(["whatsapp", "phone_call", "video_call", "email", "in_person"]).optional(),
        notes: z.string().optional(),
        leadId: z.number().optional(),
        patientId: z.number().optional(),
        // Doctors cannot assign tasks to others — always self-assigned
        assignedToId: z.number().optional(),
        tags: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const assignedToId = ctx.user.role === "doctor" ? ctx.user.id : input.assignedToId;
        return createTask({ ...input, assignedToId, createdById: ctx.user.id, status: "open" });
      }),

    update: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        type: z.enum(["callback_request", "follow_up", "send_info", "consultation_request", "other"]).optional(),
        status: z.enum(["open", "in_progress", "done", "deferred"]).optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        dueDate: z.string().optional(),
        dueTime: z.string().optional(),
        communicationMethod: z.enum(["whatsapp", "phone_call", "video_call", "email", "in_person"]).optional(),
        notes: z.string().optional(),
        assignedToId: z.number().optional(),
        patientId: z.number().optional(),
        leadId: z.number().optional(),
        tags: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateTaskDb(id, data);
        return { success: true };
      }),

    close: staffOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await closeTask(input.id);
        return { success: true };
      }),

     delete: staffOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteTask(input.id);
        return { success: true };
      }),
    bulkUpdate: staffOrAdminProcedure
      .input(z.object({
        ids: z.array(z.number()).min(1),
        data: z.object({
          assignedToId: z.number().nullable().optional(),
          status: z.enum(["open","in_progress","done","deferred"]).optional(),
          priority: z.enum(["low","medium","high"]).optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await bulkUpdateTasks(input.ids, input.data as any);
        return { updated: input.ids.length };
      }),
    bulkDelete: adminProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input }) => {
        await bulkDeleteTasks(input.ids);
        return { deleted: input.ids.length };
      }),
  }),
  // ─── Reference Data (centralized master data) ────────────────────────────────
  referenceData: router({
    list: publicProcedure
      .input(z.object({ type: z.enum(["language", "country", "city", "nationality"]).optional() }))
      .query(({ input }) => getReferenceData(input.type)),
    upsert: adminProcedure
      .input(z.object({
        id: z.number().optional(),
        type: z.enum(["language", "country", "city", "nationality"]),
        code: z.string().min(1).max(16),
        label: z.string().min(1).max(256),
        labelAr: z.string().optional(),
        labelTr: z.string().optional(),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(({ input }) => upsertReferenceData(input)),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteReferenceData(input.id)),
  }),
  // ─── Task Tags ────────────────────────────────────────────
  taskTags: router({
    list: staffOrAdminProcedure.query(() => getAllTaskTags()),
    create: staffOrAdminProcedure
      .input(z.object({ name: z.string().min(1).max(64), color: z.string().optional() }))
      .mutation(({ ctx, input }) => createTaskTag({ ...input, createdByUserId: ctx.user.id })),
    update: staffOrAdminProcedure
      .input(z.object({ id: z.number(), name: z.string().optional(), color: z.string().optional() }))
      .mutation(({ input }) => { const { id, ...data } = input; return updateTaskTag(id, data); }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteTaskTag(input.id)),
  }),

  // ─── Case Comments (Collaboration Thread) ────────────────────────────────────
  caseComments: router({
    list: protectedProcedure
      .input(z.object({
        leadId: z.number().optional(),
        patientId: z.number().optional(),
      }))
      .query(({ ctx, input }) =>
        listCaseComments({
          leadId: input.leadId,
          patientId: input.patientId,
          viewerRole: ctx.user.role,
        })
      ),

    create: protectedProcedure
      .input(z.object({
        leadId: z.number().optional(),
        patientId: z.number().optional(),
        content: z.string().min(1).max(4000),
        isSystemEvent: z.boolean().optional(),
        visibility: z.enum(["all", "doctor_only", "staff_only"]).optional(),
      }))
      .mutation(({ ctx, input }) => {
        if (!input.leadId && !input.patientId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Either leadId or patientId is required" });
        }
        return createCaseComment({
          leadId: input.leadId,
          patientId: input.patientId,
          authorId: ctx.user.id,
          content: input.content,
          isSystemEvent: input.isSystemEvent,
          visibility: input.visibility,
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) =>
        deleteCaseComment(input.id, ctx.user.id, ctx.user.role)
      ),
  }),

  // ─── Doctor Cases (cases assigned to the logged-in doctor) ──────────────────────
  doctorCases: router({
    // List all cases (leads + patients) assigned to the current doctor
    mine: protectedProcedure.query(async ({ ctx }) => {
      const doctorProfile = await getDoctorByUserId(ctx.user.id);
      console.log('[doctorCases.mine] userId:', ctx.user.id, 'email:', ctx.user.email, 'doctorProfile:', doctorProfile ? { id: doctorProfile.id, userId: doctorProfile.userId } : null);
      if (!doctorProfile) return { leads: [], patients: [], _debug: { userId: ctx.user.id, email: ctx.user.email, doctorProfile: null } };
      const result = await listDoctorCases(doctorProfile.id);
      console.log('[doctorCases.mine] result leads:', result.leads.length, 'patients:', result.patients.length);
      return { ...result, _debug: { userId: ctx.user.id, email: ctx.user.email, doctorId: doctorProfile.id } };
    }),

    // Get full case detail for doctor view: lead/patient + intake + documents + proposals + comments
    getCase: protectedProcedure
      .input(z.object({
        type: z.enum(["lead", "patient"]),
        id: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        // Doctors can only view cases assigned to them (or admin/manager can view all)
        const isAdminOrManager = ctx.user.role === "admin" || ctx.user.role === "manager";
        const isStaff = ctx.user.role === "staff";

        if (input.type === "lead") {
          const lead = await getLeadById(input.id);
          if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });

          if (!isAdminOrManager && !isStaff) {
            const doctorProfile = await getDoctorByUserId(ctx.user.id);
            if (!doctorProfile || lead.assignedDoctorId !== doctorProfile.id) {
              throw new TRPCError({ code: "FORBIDDEN", message: "Not assigned to this case" });
            }
          }

          const [intake, documents, proposals, comments] = await Promise.all([
            getMedicalIntake(input.id),
            getLeadDocuments(input.id),
            getTreatmentProposals({ leadId: input.id }),
            listCaseComments({ leadId: input.id, viewerRole: ctx.user.role }),
          ]);

          return { type: "lead" as const, case: lead, intake, documents, proposals, comments };
        } else {
          const patient = await getPatientById(input.id);
          if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "Patient not found" });

          if (!isAdminOrManager && !isStaff) {
            const doctorProfile = await getDoctorByUserId(ctx.user.id);
            if (!doctorProfile || patient.assignedDoctorId !== doctorProfile.id) {
              throw new TRPCError({ code: "FORBIDDEN", message: "Not assigned to this case" });
            }
          }

          const [intake, documents, proposals, comments] = await Promise.all([
            getMedicalIntakeByPatientId(input.id),
            getPatientDocuments(input.id),
            getTreatmentProposals({ patientId: input.id }),
            listCaseComments({ patientId: input.id, viewerRole: ctx.user.role }),
          ]);

          return { type: "patient" as const, case: patient, intake, documents, proposals, comments };
        }
      }),
    // Save doctor answers back to the medical intake's doctorAnswers field
    // Also syncs answers to the treatment plan's qaAnswers so the PDF includes them
    saveDoctorAnswers: protectedProcedure
      .input(z.object({
        type: z.enum(["lead", "patient"]),
        id: z.number(),
        // { female: { "0": "answer", "1": "answer" }, male: { "0": "answer" } }
        doctorAnswers: z.record(z.string(), z.record(z.string(), z.string())),
      }))
      .mutation(async ({ ctx, input }) => {
        const isAdminOrManager = ctx.user.role === "admin" || ctx.user.role === "manager";
        const isStaff = ctx.user.role === "staff";
        const isDoctor = ctx.user.role === "doctor";
        if (!isAdminOrManager && !isStaff && !isDoctor) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
        }

        // 1. Save answers to medical_intake.doctorAnswers
        if (input.type === "lead") {
          await upsertMedicalIntake(input.id, { doctorAnswers: input.doctorAnswers } as any);
        } else {
          await upsertMedicalIntakeForPatient(input.id, { doctorAnswers: input.doctorAnswers } as any);
        }

        // 2. Sync to treatment_plans.qaAnswers so the PDF includes them
        try {
          const intake = input.type === "lead"
            ? await getMedicalIntake(input.id)
            : await getMedicalIntakeByPatientId(input.id);

          if (intake) {
            const pq = (() => {
              const raw = (intake as any).patientQuestions;
              if (!raw) return { female: [] as string[], male: [] as string[] };
              const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
              return {
                female: Array.isArray(parsed?.female) ? parsed.female.filter(Boolean) : [] as string[],
                male: Array.isArray(parsed?.male) ? parsed.male.filter(Boolean) : [] as string[],
              };
            })();

            const qaAnswers = [
              ...pq.female.map((q: string, i: number) => ({
                question: q,
                askedBy: "female" as const,
                answer: input.doctorAnswers?.female?.[String(i)] ?? "",
              })),
              ...pq.male.map((q: string, i: number) => ({
                question: q,
                askedBy: "male" as const,
                answer: input.doctorAnswers?.male?.[String(i)] ?? "",
              })),
            ].filter((qa) => qa.question.trim());

            const opts = input.type === "lead" ? { leadId: input.id } : { patientId: input.id };
            const existingPlan = await getTreatmentPlanByCase(opts);
            if (existingPlan) {
              await upsertTreatmentPlan({
                ...existingPlan,
                qaAnswers: JSON.stringify(qaAnswers) as any,
              } as any);
            }
          }
        } catch {
          // Non-fatal: answers are already saved to intake; treatment plan sync failure is acceptable
        }

        return { ok: true };
      }),
  }),

  // ─── Treatment Plans ─────────────────────────────────────────────────────────
  treatmentPlans: router({
    // Staff requests a treatment plan from a doctor for a lead or patient
    requestPlan: protectedProcedure
      .input(z.object({
        type: z.enum(["lead", "patient"]),
        id: z.number(),
        doctorId: z.number(),
        title: z.string().optional(),
        requestNotes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const now = new Date();
        const monthYear = now.toLocaleString("en-US", { month: "long", year: "numeric" });
        const title = input.title?.trim() || `Treatment Plan - ${monthYear}`;
        const data: any = {
          doctorId: input.doctorId,
          title,
          requestNotes: input.requestNotes ?? null,
          requestedById: ctx.user.id,
          status: "draft",
        };
        if (input.type === "lead") data.leadId = input.id;
        else data.patientId = input.id;
        const planId = await createTreatmentPlan(data);
        // Also set assignedDoctorId on the lead/patient
        try {
          if (input.type === "lead") {
            await updateLead(input.id, { assignedDoctorId: input.doctorId });
          } else {
            await updatePatient(input.id, { assignedDoctorId: input.doctorId });
          }
        } catch (e) {
          console.warn("[treatmentPlans.requestPlan] assignedDoctorId update failed:", e);
        }
        // Notify doctor
        try {
          const doctor = await getDoctorById(input.doctorId);
          if (doctor?.userId) {
            await createNotification({
              userId: doctor.userId,
              type: "general",
              title: "New Treatment Plan Requested",
              message: `A treatment plan has been requested: "${title}"`,
              relatedId: planId,
              relatedType: "treatment_plan",
            });
          }
        } catch (e) {
          console.warn("[treatmentPlans.requestPlan] notification failed:", e);
        }
        return { planId };
      }),

    // Doctor: list all treatment plans assigned to me
    listByDoctor: protectedProcedure.query(async ({ ctx }) => {
      const doctorProfile = await getDoctorByUserId(ctx.user.id);
      if (!doctorProfile) return [];
      return listTreatmentPlansByDoctor(doctorProfile.id);
    }),

    // List all treatment plans for a lead
    listByLead: protectedProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => {
        return listTreatmentPlansByLead(input.leadId);
      }),

    // List all treatment plans for a patient
    listByPatient: protectedProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ input }) => {
        return listTreatmentPlansByPatient(input.patientId);
      }),

    // Get a specific treatment plan by ID (with scenarios)
    getById: protectedProcedure
      .input(z.object({ planId: z.number() }))
      .query(async ({ input }) => {
        const plan = await getTreatmentPlanById(input.planId);
        if (!plan) return null;
        const scenarios = await listScenariosByPlan(plan.id);
        return { plan, scenarios };
      }),

    // Update plan title or requestNotes
    updateMeta: protectedProcedure
      .input(z.object({
        planId: z.number(),
        title: z.string().optional(),
        requestNotes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await updateTreatmentPlanById(input.planId, {
          title: input.title,
          requestNotes: input.requestNotes,
        });
        return { success: true };
      }),

    // Update upsert to work by planId (not by lead/patient)
    upsertById: protectedProcedure
      .input(z.object({
        planId: z.number(),
        clinicalSummary: z.string().optional(),
        qaAnswers: z.array(z.object({
          question: z.string(),
          askedBy: z.enum(["female", "male"]),
          answer: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input }) => {
        await updateTreatmentPlanById(input.planId, {
          clinicalSummary: input.clinicalSummary ?? undefined,
          qaAnswers: input.qaAnswers ? JSON.stringify(input.qaAnswers) as any : undefined,
        });
        return { planId: input.planId };
      }),

    // Transcribe voice recording for treatment plan summary
    transcribeVoice: protectedProcedure
      .input(z.object({
        audioBase64: z.string().min(1),
        mimeType: z.string().optional(),
        language: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await transcribeAudioGroq({
          audioBase64: input.audioBase64,
          mimeType: input.mimeType,
          language: input.language,
        });
        if ("error" in result) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error });
        return { text: result.text, language: result.language };
      }),
    // Get treatment plan + scenarios for a case
    getByCase: protectedProcedure
      .input(z.object({
        type: z.enum(["lead", "patient"]),
        id: z.number(),
      }))
      .query(async ({ input }) => {
        const opts = input.type === "lead" ? { leadId: input.id } : { patientId: input.id };
        const plan = await getTreatmentPlanByCase(opts);
        if (!plan) return { plan: null, scenarios: [] };
        const scenarios = await listScenariosByPlan(plan.id);
        return { plan, scenarios };
      }),

    // Create or update a treatment plan (draft)
    upsert: protectedProcedure
      .input(z.object({
        type: z.enum(["lead", "patient"]),
        id: z.number(),
        clinicalSummary: z.string().optional(),
        qaAnswers: z.array(z.object({
          question: z.string(),
          askedBy: z.enum(["female", "male"]),
          answer: z.string(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const data: any = {
          status: "draft",
          clinicalSummary: input.clinicalSummary ?? null,
          qaAnswers: input.qaAnswers ? JSON.stringify(input.qaAnswers) : null,
          createdByUserId: ctx.user.id,
        };
        if (input.type === "lead") data.leadId = input.id;
        else data.patientId = input.id;
        const planId = await upsertTreatmentPlan(data);
        return { planId };
      }),

    // Confirm a treatment plan (lock it)
    confirm: protectedProcedure
      .input(z.object({ planId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { treatmentPlans: tpTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(tpTable).set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() }).where(eq(tpTable.id, input.planId));
        return { success: true };
      }),

     // Add a scenario to a plan
    addScenario: protectedProcedure
      .input(z.object({
        planId: z.number(),
        title: z.string(),
        summary: z.string().optional(),
        // services: array of service entries — standard or medication
        // Standard: { serviceId?, serviceName, category, isCustom? }
        // Medication: { serviceId?, serviceName, category: 'medicine', isCustom?, dosage, frequency, notes }
        services: z.array(z.object({
          serviceId: z.number().optional(),
          serviceName: z.string(),
          category: z.string(),
          isCustom: z.boolean().optional(),
          // medication-only fields
          dosage: z.string().optional(),
          frequency: z.string().optional(),
          notes: z.string().optional(),
        })).optional(),
      }))
      .mutation(async ({ input }) => {
        const existing = await listScenariosByPlan(input.planId);
        const sortOrder = existing.length;
        const id = await createScenario({
          treatmentPlanId: input.planId,
          title: input.title,
          summary: input.summary ?? null,
          services: input.services ? JSON.stringify(input.services) : null,
          sortOrder,
        });
        return { id };
      }),
    // Update a scenario
    updateScenario: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        summary: z.string().optional(),
        services: z.array(z.object({
          serviceId: z.number().optional(),
          serviceName: z.string(),
          category: z.string(),
          isCustom: z.boolean().optional(),
          dosage: z.string().optional(),
          frequency: z.string().optional(),
          notes: z.string().optional(),
        })).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...rest } = input;
        const data: any = {};
        if (rest.title !== undefined) data.title = rest.title;
        if (rest.summary !== undefined) data.summary = rest.summary;
        if (rest.services !== undefined) data.services = JSON.stringify(rest.services);
        await updateScenario(id, data);
        return { success: true };
      }),

    // Delete a scenario
    deleteScenario: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteScenario(input.id);
        return { success: true };
      }),

    // Duplicate a scenario
    duplicateScenario: protectedProcedure
      .input(z.object({ id: z.number(), newTitle: z.string().optional() }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { treatmentPlanScenarios: tpsTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const existing = await db.select().from(tpsTable).where(eq(tpsTable.id, input.id)).limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Scenario not found" });
        const src = existing[0];
        const siblings = await listScenariosByPlan(src.treatmentPlanId);
        const newId = await createScenario({
          treatmentPlanId: src.treatmentPlanId,
          title: input.newTitle ?? `${src.title} (Copy)`,
          summary: src.summary,
          services: src.services,
          sortOrder: siblings.length,
        });
        return { id: newId };
      }),

    // Revise a confirmed plan (unlock it back to draft for editing)
    revise: protectedProcedure
      .input(z.object({ planId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { treatmentPlans: tpTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(tpTable).set({ status: "draft", confirmedAt: null, updatedAt: new Date() }).where(eq(tpTable.id, input.planId));
        return { success: true };
      }),
    // Reorder scenarios
    reorder: protectedProcedure
      .input(z.object({ planId: z.number(), orderedIds: z.array(z.number()) }))
      .mutation(async ({ input }) => {
        await reorderScenarios(input.planId, input.orderedIds);
        return { success: true };
      }),

    // Generate a proposal from a treatment plan scenario
    generateProposal: protectedProcedure
      .input(z.object({
        planId: z.number(),
        scenarioId: z.number(),
        currency: z.enum(["USD", "EUR", "GBP", "TRY"]).default("USD"),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { treatmentPlans: tpTable, treatmentPlanScenarios: treatmentScenarios, treatmentProposals: tpProposals } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        // Get the plan
        const [plan] = await db.select().from(tpTable).where(eq(tpTable.id, input.planId));
        if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Treatment plan not found" });
        // Get the scenario
        const [scenario] = await db.select().from(treatmentScenarios).where(eq(treatmentScenarios.id, input.scenarioId));
        if (!scenario) throw new TRPCError({ code: "NOT_FOUND", message: "Scenario not found" });
        // Parse services from scenario
        let services: Array<{ serviceName?: string; name?: string; category?: string; quantity?: number }> = [];
        if (scenario.services) {
          try {
            const raw = typeof scenario.services === "string" ? JSON.parse(scenario.services) : scenario.services;
            if (Array.isArray(raw)) services = raw;
          } catch { /* ignore */ }
        }
        // Build custom items from scenario services
        const customItems = services.map((sv) => ({
          name: sv.serviceName ?? sv.name ?? "Service",
          category: sv.category ?? "General",
          quantity: Number(sv.quantity) || 1,
          unitPrice: "0",
          totalPrice: "0",
        }));
        // Generate proposal code
        const proposalCode = await getNextCode("proposal");
        // Create the proposal
        const proposalData: any = {
          code: proposalCode,
          currency: input.currency,
          customItems: JSON.stringify(customItems),
          staffNotes: `Generated from Treatment Plan #${input.planId} — ${scenario.title ?? "Scenario"}`,
          createdBy: ctx.user.id,
          status: "draft",
        };
        if ((plan as any).leadId) proposalData.leadId = (plan as any).leadId;
        if ((plan as any).patientId) proposalData.patientId = (plan as any).patientId;
        const [newProposal] = await db.insert(tpProposals).values(proposalData).returning({ id: tpProposals.id });
        return { proposalId: newProposal.id, proposalCode };
      }),
  }),

  // ─── Doctor Review Requests ───────────────────────────────────────────────────
  doctorReviewRequests: router({
    // Staff requests doctor review for a case
    request: protectedProcedure
      .input(z.object({
        type: z.enum(["lead", "patient"]),
        id: z.number(),
        doctorId: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const data: any = {
          doctorId: input.doctorId,
          requestedById: ctx.user.id,
          status: "pending",
          requestedAt: new Date(),
        };
        if (input.type === "lead") data.leadId = input.id;
        else data.patientId = input.id;
        const id = await createDoctorReviewRequest(data);
        // Also set assignedDoctorId on the lead/patient so it appears in doctor's My Cases
        try {
          if (input.type === "lead") {
            await updateLead(input.id, { assignedDoctorId: input.doctorId });
          } else {
            await updatePatient(input.id, { assignedDoctorId: input.doctorId });
          }
        } catch (e) {
          console.warn("[doctorReviewRequests.request] assignedDoctorId update failed:", e);
        }
        // Notify doctor via in-app notification
        try {
          const doctor = await getDoctorById(input.doctorId);
          if (doctor?.userId) {
            await createNotification({
              userId: doctor.userId,
              type: "general",
              title: "New Case Review Requested",
              message: `A case has been assigned to you for review.`,
              relatedId: input.id,
              relatedType: input.type,
            });
          }
        } catch (e) {
          console.warn("[doctorReviewRequests.request] notification failed:", e);
        }
        return { id };
      }),

    // Doctor updates status to in_review or plan_ready
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "in_review", "plan_ready"]),
      }))
      .mutation(async ({ input }) => {
        const extra: any = {};
        if (input.status === "in_review") extra.reviewStartedAt = new Date();
        if (input.status === "plan_ready") extra.planReadyAt = new Date();
        await updateReviewRequestStatus(input.id, input.status, extra);
        return { success: true };
      }),

    // Get latest review request for a case
    getLatest: protectedProcedure
      .input(z.object({
        type: z.enum(["lead", "patient"]),
        id: z.number(),
      }))
      .query(async ({ input }) => {
        const opts = input.type === "lead" ? { leadId: input.id } : { patientId: input.id };
        return getLatestReviewRequest(opts);
      }),

    // Doctor: list all pending/in_review cases
    listPendingForDoctor: protectedProcedure.query(async ({ ctx }) => {
      const doctorProfile = await getDoctorByUserId(ctx.user.id);
      if (!doctorProfile) return [];
      return listPendingReviewRequestsForDoctor(doctorProfile.id);
    }),
    // Admin: backfill assignedDoctorId on leads/patients from review requests
    backfillAssignedDoctor: adminProcedure.mutation(async () => {
      const { getDb } = await import('./db');
      const { sql } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      // Update leads that have a review request but no assignedDoctorId
      await db.execute(
        sql`UPDATE leads l
            INNER JOIN doctor_review_requests drr ON drr.leadId = l.id
            SET l.assignedDoctorId = drr.doctorId
            WHERE l.assignedDoctorId IS NULL AND drr.leadId IS NOT NULL`
      );
      // Update patients that have a review request but no assignedDoctorId
      await db.execute(
        sql`UPDATE patients p
            INNER JOIN doctor_review_requests drr ON drr.patientId = p.id
            SET p.assignedDoctorId = drr.doctorId
            WHERE p.assignedDoctorId IS NULL AND drr.patientId IS NOT NULL`
      );
      console.log('[backfillAssignedDoctor] backfill complete');
      return { success: true, message: 'Backfill complete' };
    }),
  }),

  // ─── External Reports ─────────────────────────────────────────────────────
  externalReports: router({
    list: protectedProcedure
      .input(z.object({ patientId: z.number() }))
      .query(({ input }) => listExternalReports(input.patientId)),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getExternalReportById(input.id)),

    create: staffOrAdminProcedure
      .input(z.object({
        patientId: z.number(),
        sourceOrganization: z.string().optional(),
        reportType: z.string().optional(),
        reportDate: z.date().optional(),
        originalContent: z.string().min(1, "Original source content is required."),
        sourceInputMethod: externalReportInputMethodSchema,
        sourceLanguage: externalReportSourceLanguageSchema.default("und"),
        sourceAssetRefs: z.array(z.object({ key: z.string(), name: z.string(), mimeType: z.string().optional() })).optional(),
        sourceAssets: z.array(z.object({
          fileBase64: z.string(),
          fileName: z.string().min(1).max(255),
          mimeType: z.string().min(1).max(128),
          tag: z.string().trim().min(1).max(120),
          documentPassword: z.string().max(512).optional(),
        })).max(12).optional(),
        processedContent: z.string().optional(),
        processedDocument: externalReportDocumentSchema.optional(),
        processingGoal: externalReportProcessingGoalSchema,
        requestedTargetLanguage: z.union([externalReportLanguageSchema, z.literal("source")]).nullable().optional(),
        status: z.enum(["draft", "final"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const flowId = randomUUID();
        let stage: ExternalReportFinalizeStage = "input_validated";
        let transactionStarted = false;
        let transactionCommitted = false;
        const mark = (nextStage: ExternalReportFinalizeStage) => {
          stage = nextStage;
          if (nextStage === "transaction_started") transactionStarted = true;
          if (nextStage === "transaction_committed") transactionCommitted = true;
          logExternalReportFinalizeStage(flowId, stage, transactionStarted, transactionCommitted);
        };
        try {
          if (input.reportDate && !isValidExternalReportDate(externalReportDateKey(input.reportDate))) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Report date must be between 1900 and today." });
          }
          mark("input_validated");
          const { sourceAssets, ...reportInput } = input;
          const storedSourceAssets: Array<{ key: string; url: string; name: string; mimeType: string; tag: string; documentPasswordCiphertext: string | null }> = [];
          const uploadSessionId = randomUUID();
          const { storagePut } = await import("./storage");
          for (const asset of sourceAssets ?? []) {
            const buffer = Buffer.from(asset.fileBase64, "base64");
            mark("source_asset_payload_prepared");
            if (buffer.byteLength > 16 * 1024 * 1024) {
              throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Each source document must be 16 MB or smaller." });
            }
            mark("source_asset_size_validated");
            const extension = asset.fileName.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "bin";
            const safeName = asset.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
            const allocateFreshKey = () => `external-reports/source/${reportInput.patientId}/${ctx.user.id}/${uploadSessionId}-${randomUUID()}-${safeName}.${extension}`;
            mark("source_asset_key_allocated");
            let storedAsset: { key: string; url: string };
            try {
              storedAsset = await storagePut(allocateFreshKey(), buffer, asset.mimeType, asset.fileName);
            } catch {
              // A one-time fresh-key retry is safe before any DB transaction because it cannot
              // reuse a deleted report asset, mutate source content, or create a report duplicate.
              mark("source_asset_upload_retry_started");
              mark("source_asset_retry_key_allocated");
              storedAsset = await storagePut(allocateFreshKey(), buffer, asset.mimeType, asset.fileName);
              mark("source_asset_retry_uploaded");
            }
            mark("source_asset_uploaded");
            storedSourceAssets.push({
              key: storedAsset.key,
              url: storedAsset.url,
              name: asset.fileName,
              mimeType: asset.mimeType,
              tag: asset.tag,
              documentPasswordCiphertext: asset.documentPassword?.trim() ? encryptExternalReportDocumentPassword(asset.documentPassword.trim()) : null,
            });
          }
          mark("source_assets_stored");
          const resolved = resolveExternalReportProcessing({
          processingGoal: reportInput.processingGoal,
          requestedTargetLanguage: reportInput.requestedTargetLanguage,
          sourceLanguage: reportInput.sourceLanguage,
          });
          mark("processing_contract_resolved");
          const reportRef = await getNextCode("external_report");
          return await createExternalReport({
          patientId: reportInput.patientId,
          sourceOrganization: reportInput.sourceOrganization,
          reportType: reportInput.reportType,
          reportDate: reportInput.reportDate,
          originalContent: reportInput.originalContent,
          processedContent: reportInput.processedContent,
          processedDocument: reportInput.processedDocument,
          processingNote: legacyProcessingNoteForGoal(resolved.processingGoal),
          language: resolved.resolvedOutputLanguage,
          reportRef,
          status: reportInput.status,
          createdById: ctx.user.id,
          sourceCapture: {
            sourceText: reportInput.originalContent,
            inputMethod: reportInput.sourceInputMethod,
            sourceLanguage: reportInput.sourceLanguage,
            sourceAssetRefs: storedSourceAssets.length ? storedSourceAssets : reportInput.sourceAssetRefs,
          },
          processing: {
            ...resolved,
            processedDocumentVersion: 1,
            humanReviewFinalized: reportInput.status === "final",
          },
          }, mark);
        } catch (error) {
          logExternalReportFinalizeFailure(flowId, stage, error, transactionStarted, transactionCommitted);
          throw error;
        }
      }),

    update: staffOrAdminProcedure
      .input(z.object({
        id: z.number(),
        sourceOrganization: z.string().optional(),
        reportType: z.string().optional(),
        reportDate: z.date().optional(),
        processedContent: z.string().optional(),
        processingGoal: externalReportProcessingGoalSchema,
        requestedTargetLanguage: z.union([externalReportLanguageSchema, z.literal("source")]).nullable().optional(),
        sourceLanguage: externalReportSourceLanguageSchema.default("und"),
        status: z.enum(["draft", "final"]).optional(),
      }))
      .mutation(({ input, ctx }) => {
        if (input.reportDate && !isValidExternalReportDate(externalReportDateKey(input.reportDate))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Report date must be between 1900 and today." });
        }
        const resolved = resolveExternalReportProcessing({
          processingGoal: input.processingGoal,
          requestedTargetLanguage: input.requestedTargetLanguage,
          sourceLanguage: input.sourceLanguage,
        });
        const { id, sourceLanguage: _sourceLanguage, ...data } = input;
        return updateExternalReport(id, {
          ...data,
          processingNote: legacyProcessingNoteForGoal(resolved.processingGoal),
          language: resolved.resolvedOutputLanguage,
          createdById: ctx.user.id,
          processing: {
            ...resolved,
            processedDocumentVersion: 1,
            humanReviewFinalized: input.status === "final",
          },
        });
      }),

    delete: staffOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteExternalReport(input.id)),

    sourceRevisions: staffOrAdminProcedure
      .input(z.object({ reportId: z.number() }))
      .query(({ input }) => getExternalReportSourceRevisions(input.reportId)),

    processingRuns: staffOrAdminProcedure
      .input(z.object({ reportId: z.number() }))
      .query(({ input }) => getExternalReportProcessingRuns(input.reportId)),

    // AI: extract text from uploaded files (images/PDFs) and process
    processWithAI: staffOrAdminProcedure
      .input(z.object({
        rawText: z.string().optional(),          // typed text or voice transcript
        fileUrls: z.array(z.string()).optional(), // storage URLs of uploaded files
        processingGoal: externalReportProcessingGoalSchema,
        requestedTargetLanguage: z.union([externalReportLanguageSchema, z.literal("source")]).nullable().optional(),
        sourceLanguage: externalReportSourceLanguageSchema.default("und"),
        reportType: z.string().optional(),
        sourceOrganization: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const flowId = randomUUID();
        // One metadata-only, non-blocking session correlates the single plain-text call.
        // It is never included in provider payloads.
        const flowTelemetry = createAiTelemetrySession("medical_document_translation", { logicalRequestId: flowId });
        const resolved = resolveExternalReportProcessing({
          processingGoal: input.processingGoal,
          requestedTargetLanguage: input.requestedTargetLanguage,
          sourceLanguage: input.sourceLanguage,
        });
        const reportContext = [
          input.reportType ? `Report type: ${input.reportType}` : "",
          input.sourceOrganization ? `Source organization: ${input.sourceOrganization}` : "",
        ].filter(Boolean).join(". ");
        const processingInstruction = plainTextMedicalReportInstruction(resolved.instruction, resolved.processingGoal);

        // Build multimodal message content
        const userContent: any[] = [];

        // Add file URLs as image_url or file_url content blocks
        if (input.fileUrls && input.fileUrls.length > 0) {
          for (const url of input.fileUrls) {
            const lowerUrl = url.toLowerCase();
            if (lowerUrl.match(/\.(jpg|jpeg|png|gif|webp)($|\?)/)) {
              userContent.push({ type: "image_url", image_url: { url, detail: "high" } });
            } else {
              // PDF or other document
              userContent.push({ type: "file_url", file_url: { url, mime_type: "application/pdf" } });
            }
          }
          userContent.push({
            type: "text",
            text: `The above file(s) are medical report documents. Please extract ALL text content from them verbatim first, then apply the following processing goal: ${processingInstruction}${reportContext ? " Context: " + reportContext : ""}`,
          });
        } else if (input.rawText) {
          userContent.push({
            type: "text",
            text: `Medical report text:\n\n${input.rawText}\n\nProcessing goal: ${processingInstruction}${reportContext ? " Context: " + reportContext : ""}`,
          });
        } else {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Provide either rawText or fileUrls" });
	        }

        let processedContent: string;
        try {
          processedContent = await executeExternalReportPlainTextOneCall(async () => invokeLLM({
              workloadId: "medical_document_translation",
              aiTelemetry: flowTelemetry,
              messages: [
                {
                  role: "system",
                  content: "You are a medical report specialist. Process external medical reports into clear patient-ready text. Follow the server-provided processing goal and language instruction. Preserve source facts; do not invent clinical information.",
                },
                { role: "user", content: userContent },
              ],
            } as any));
        } catch (error) {
          const category = error instanceof ExternalReportPlainTextEmptyResultError ? "empty_result" : "provider_failure";
          const stage = category === "empty_result" ? "plain_text_result" : "provider_request";
          console.warn("[ExternalReports:processWithAI]", { flowId, stage, category, processingGoal: resolved.processingGoal, resolvedOutputLanguage: resolved.resolvedOutputLanguage, providerCallCount: 1, flowOutcome: "hard_failure" });
          flowTelemetry.fail(error, { failureCategory: category });
          throw new TRPCError({ code: "BAD_GATEWAY", message: "AI processing could not be completed. The source content was not changed." });
        }

        const processedDocument = createLegacyExternalReportDocument(processedContent, resolved.resolvedOutputLanguage);
        console.info("[ExternalReports:processWithAI]", { flowId, stage: "plain_text_complete", flowOutcome: "plain_text_success", processingGoal: resolved.processingGoal, resolvedOutputLanguage: resolved.resolvedOutputLanguage, providerCallCount: 1 });
        flowTelemetry.succeed();
        return {
          processedContent,
          processedDocument,
          processingGoal: resolved.processingGoal,
          requestedTargetLanguage: resolved.requestedTargetLanguage,
          resolvedOutputLanguage: resolved.resolvedOutputLanguage,
        };
      }),

    // Voice transcription for external reports
    transcribeVoice: staffOrAdminProcedure
      .input(z.object({
        audioBase64: z.string().min(1),
        mimeType: z.string().optional(),
        language: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await transcribeAudioGroq({
          audioBase64: input.audioBase64,
          mimeType: input.mimeType,
          language: input.language,
        });
        if ("error" in result) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error });
        return { text: result.text, language: result.language };
      }),

    // Extract text from uploaded files (images/PDFs) via AI vision
    extractFromFiles: staffOrAdminProcedure
      .input(z.object({
        files: z.array(z.object({
          fileBase64: z.string(),
          fileName: z.string(),
          mimeType: z.string(),
          documentPassword: z.string().max(512).optional(),
        })),
        reportType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const userContent: any[] = [];
        for (const f of input.files) {
          const dataUrl = `data:${f.mimeType};base64,${f.fileBase64}`;
          if (f.mimeType.startsWith("image/")) {
            userContent.push({ type: "image_url", image_url: { url: dataUrl, detail: "high" } });
          } else if (f.mimeType === "application/pdf" && f.documentPassword?.trim()) {
            try {
              const pages = await pdfToPageImages(Buffer.from(f.fileBase64, "base64"), 20, f.documentPassword.trim());
              pages.forEach((url) => userContent.push({ type: "image_url", image_url: { url, detail: "high" } }));
            } catch {
              throw new TRPCError({ code: "BAD_REQUEST", message: `Unable to unlock ${f.fileName}. Check the document password and try again.` });
            }
          } else {
            // PDF - use file_url with data URL
            userContent.push({ type: "file_url", file_url: { url: dataUrl, mime_type: "application/pdf" } });
          }
        }
	        userContent.push({
	          type: "text",
	          text: `Extract ALL text content from the above file(s) verbatim. Preserve every number, measurement, date, and medical finding exactly as it appears. Do NOT summarize or omit anything. Return only the extracted text.${input.reportType ? ` Context: This is a ${input.reportType}.` : ""}`,
	        });
	        const response = await invokeLLM({
	          workloadId: "medical_document_extraction",
	          messages: [
            { role: "system", content: "You are a medical document OCR specialist. Extract all text from medical documents verbatim, preserving all measurements, values, and findings." },
            { role: "user", content: userContent },
          ],
        });
        const extractedText = response?.choices?.[0]?.message?.content ?? "";
        return { extractedText };
      }),

    // Send external report PDF via WhatsApp
    sendWhatsApp: staffOrAdminProcedure
      .input(z.object({
        reportId: z.number(),
        patientId: z.number(),
        toPhone: z.string().min(5),
        publicBaseUrl: z.string().min(1),
        includeOriginalFiles: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { sendWhatsAppDocument, saveOutboundMessage, normalizePhone } = await import("./whatsapp");
        const { resolveOutboundWhatsAppConnection } = await import("./whatsappConnection");
        const { storagePut, storageGetBytes } = await import("./storage");
        const { generateExternalReportPdf } = await import("./pdfService");
        const { getPatientById } = await import("./db");
        const report = await getExternalReportById(input.reportId);
        if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
        const patient = await getPatientById(input.patientId);
        if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "Patient not found" });
        const patientName = [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(" ");
        let age: number | undefined;
        let dateOfBirthStr: string | undefined;
        if (patient.dateOfBirth) {
          const dob = new Date(patient.dateOfBirth);
          const now = new Date();
          age = now.getFullYear() - dob.getFullYear();
          const m = now.getMonth() - dob.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
          dateOfBirthStr = dob.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
        }
        const reportDate = report.reportDate
          ? new Date(report.reportDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
          : new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
        const pdfBuffer = await generateExternalReportPdf({
          reportRef: report.reportRef ?? `EXT-${String(report.id).padStart(5, "0")}`,
          reportDate,
          reportType: report.reportType ?? "Medical Report",
          sourceOrganization: report.sourceOrganization ?? undefined,
          processingNote: report.processingNote ?? "translated",
          processedContent: report.processedContent ?? "",
          processedDocument: report.processedDocument ?? null,
          patientName, mrn: patient.mrn,
          dateOfBirth: dateOfBirthStr, age, gender: patient.gender ?? undefined,
          nationality: patient.nationality ?? undefined, phone: patient.phone ?? undefined,
        });
        const storageKey = `external-reports/${report.reportRef ?? report.id}-${Date.now()}.pdf`;
        const { url: pdfStorageUrl } = await storagePut(storageKey, pdfBuffer, "application/pdf");
        const absolutePdfUrl = pdfStorageUrl.startsWith("http") ? pdfStorageUrl : `${input.publicBaseUrl}${pdfStorageUrl}`;
        const toNorm = normalizePhone(input.toPhone);
        const filename = `Report-${patient.mrn}-${report.reportRef ?? report.id}.pdf`;
        const caption = `${report.reportType ?? "Medical Report"} — ${patientName} — ${reportDate}`;
        const connection = await resolveOutboundWhatsAppConnection();
        const result = await sendWhatsAppDocument(connection, ctx.user.id, toNorm, absolutePdfUrl, filename, caption);
        await saveOutboundMessage({
          connection,
          toPhone: toNorm,
          body: `[External Report PDF: ${filename}]`,
          patientId: input.patientId,
          sentById: ctx.user.id,
          wamid: result.wamid,
          status: result.success ? "sent" : "failed",
        });
        if (!result.success) throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.outcome === "ambiguous"
            ? "WhatsApp delivery could not be confirmed. Please check before sending again."
            : "WhatsApp could not send the report. Please verify the recipient and try again.",
        });
        return { success: true, wamid: result.wamid };
      }),

    // Send external report PDF via Email
    sendEmail: staffOrAdminProcedure
      .input(z.object({
        reportId: z.number(),
        patientId: z.number(),
        publicBaseUrl: z.string().min(1),
        toEmail: z.string().email().optional(),
        attachPdf: z.boolean().optional().default(true),
        includeOriginalFiles: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { storageGetBytes } = await import("./storage");
        const { generateExternalReportPdf } = await import("./pdfService");
        const { getPatientById } = await import("./db");
        const { Resend } = await import("resend");
        const report = await getExternalReportById(input.reportId);
        if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
        const patient = await getPatientById(input.patientId);
        // Use provided toEmail or fall back to patient's email on file
        const recipientEmail = input.toEmail ?? patient?.email;
        if (!recipientEmail) throw new TRPCError({ code: "BAD_REQUEST", message: "No email address provided" });
        if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "Patient not found" });
        const patientName = [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(" ");
        let age: number | undefined;
        let dateOfBirthStr: string | undefined;
        if (patient.dateOfBirth) {
          const dob = new Date(patient.dateOfBirth);
          const now = new Date();
          age = now.getFullYear() - dob.getFullYear();
          const m = now.getMonth() - dob.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
          dateOfBirthStr = dob.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
        }
        const reportDate = report.reportDate
          ? new Date(report.reportDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
          : new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
        const reportRef = report.reportRef ?? `EXT-${String(report.id).padStart(5, "0")}`;
        const reportTypeLabel = report.reportType ?? "Medical Report";
        // Collect attachments
        const attachments: Array<{ filename: string; content: string }> = [];
        // Attach generated PDF if requested
        if (input.attachPdf !== false) {
          const pdfBuffer = await generateExternalReportPdf({
            reportRef,
            reportDate,
            reportType: reportTypeLabel,
            sourceOrganization: report.sourceOrganization ?? undefined,
            processingNote: report.processingNote ?? "translated",
            processedContent: report.processedContent ?? "",
            processedDocument: report.processedDocument ?? null,
            patientName, mrn: patient.mrn,
            dateOfBirth: dateOfBirthStr, age, gender: patient.gender ?? undefined,
            nationality: patient.nationality ?? undefined, phone: patient.phone ?? undefined,
          });
          attachments.push({ filename: `Report-${patient.mrn ?? patientName}-${reportRef}.pdf`, content: pdfBuffer.toString("base64") });
        }
        // Optionally attach original files
        if (input.includeOriginalFiles && report.originalFiles) {
          try {
            const files: Array<{ key: string; name: string; mimeType: string }> = JSON.parse(report.originalFiles);
            for (const f of files.slice(0, 3)) { // max 3 originals
              const res = await storageGetBytes(f.key);
              if (res?.data) attachments.push({ filename: f.name, content: res.data.toString("base64") });
            }
          } catch { /* ignore */ }
        }
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: "Fertiliv IVF Center <no-reply@fertiliv.com>",
          to: recipientEmail,
          subject: `${reportTypeLabel} ${reportRef} — ${patientName} — Fertiliv IVF Center`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#1e0566;padding:24px 32px;border-radius:8px 8px 0 0;">
              <h1 style="color:#fff;margin:0;font-size:22px;">Fertiliv IVF Center</h1>
              <p style="color:#e3b2b0;margin:4px 0 0;font-size:13px;">External Report</p>
            </div>
            <div style="background:#f9f5ff;padding:24px 32px;">
              <p style="color:#1e0566;font-size:15px;">Dear <strong>${patientName}</strong>,</p>
              <p style="color:#374151;font-size:14px;line-height:1.6;">Please find attached your <strong>${reportTypeLabel}</strong>${report.sourceOrganization ? ` from <strong>${report.sourceOrganization}</strong>` : ""}, dated <strong>${reportDate}</strong>.</p>
              <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
                <p style="margin:0 0 6px;font-size:13px;"><span style="color:#6b7280;">Reference:</span> <strong>${reportRef}</strong></p>
                <p style="margin:0 0 6px;font-size:13px;"><span style="color:#6b7280;">Report Type:</span> <strong>${reportTypeLabel}</strong></p>
                ${report.sourceOrganization ? `<p style="margin:0;font-size:13px;"><span style="color:#6b7280;">Source:</span> <strong>${report.sourceOrganization}</strong></p>` : ""}
              </div>
              <p style="color:#374151;font-size:13px;">This report has been processed and formatted by Fertiliv IVF Center using AI-assisted technology for your convenience.</p>
              <p style="color:#374151;font-size:13px;margin-top:16px;">If you have any questions, please contact us at <a href="mailto:info@fertiliv.com" style="color:#1e0566;">info@fertiliv.com</a> or call <strong>+90 501 114 70 60</strong>.</p>
              <p style="color:#374151;font-size:13px;">Warm regards,<br/><strong>The Fertiliv Team</strong></p>
            </div>
            <div style="background:#1e0566;padding:12px 32px;border-radius:0 0 8px 8px;text-align:center;">
              <p style="color:#e3b2b0;font-size:11px;margin:0;">Fertiliv IVF Center — Istanbul, Turkey — CONFIDENTIAL</p>
            </div>
          </div>`,
          attachments,
        });
        return { success: true };
      }),
  }),

  // External Reports V2 is an isolated, admin-only sibling. It is intentionally not wired to
  // the current production UI until a separate cutover approval.
  externalReportsV2: router({
    process: adminProcedure
      .input(externalReportV2ProcessInputSchema)
      .mutation(async ({ input, ctx }) => {
        const resolved = resolveExternalReportProcessing(input);
        try {
          const accepted = await executeExternalReportV2OneCall(input, (messages) => invokeAiWorkload("medical_document_translation", { messages }));
          const proof = await createExternalReportV2ProcessProof({
            actorId: ctx.user.id,
            patientId: input.patientId,
            sourceText: input.sourceText,
            outputText: accepted.envelope.text,
            sourceLanguage: input.sourceLanguage,
            processingGoal: accepted.resolved.processingGoal,
            requestedTargetLanguage: accepted.resolved.requestedTargetLanguage,
            resolvedOutputLanguage: accepted.resolved.resolvedOutputLanguage,
            safetyState: accepted.safety.state,
          });
          logExternalReportV2Processing({
            outcome: "success",
            goal: accepted.resolved.processingGoal,
            outputLanguage: accepted.resolved.resolvedOutputLanguage,
            providerCallCount: 1,
            safetyState: accepted.safety.state,
          });
          return {
            processedContent: accepted.envelope.text,
            title: accepted.envelope.title ?? null,
            processedDocument: accepted.document,
            processingGoal: accepted.resolved.processingGoal,
            requestedTargetLanguage: accepted.resolved.requestedTargetLanguage,
            resolvedOutputLanguage: accepted.resolved.resolvedOutputLanguage,
            safetyState: accepted.safety.state,
            safetyReasons: accepted.safety.reasons,
            missingSourceFactCount: accepted.safety.missingSourceFactCount,
            processProof: proof.processProof,
            submissionKey: proof.submissionKey,
            providerCallCount: 1 as const,
            version: 2 as const,
          };
        } catch (error) {
          logExternalReportV2Processing({
            outcome: "failed",
            goal: resolved.processingGoal,
            outputLanguage: resolved.resolvedOutputLanguage,
            providerCallCount: 1,
            category: classifyExternalReportV2Failure(error),
            sourceSafetySubreason: getExternalReportV2SourceSafetySubreason(error),
          });
          throw new TRPCError({ code: "BAD_GATEWAY", message: "AI processing could not be completed. The source content was not changed." });
        }
      }),

    finalize: adminProcedure
      .input(externalReportV2FinalizeInputSchema)
      .mutation(async ({ input, ctx }) => {
        let stage: import("./externalReportV2Observability").ExternalReportV2FinalizeStage = "proof_validated";
        const mark = (next: typeof stage, outcome: "stage" | "failed" | "success" = "stage") => {
          stage = next;
          logExternalReportV2Finalize(stage, outcome);
        };
        try {
          if (input.reportDate && !isValidExternalReportDate(externalReportDateKey(input.reportDate))) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Report date must be between 1900 and today." });
          }
          const validated = await validateExternalReportV2Finalize({ ...input, actorId: ctx.user.id });
          mark("proof_validated");
          mark("source_snapshot_validated");
          mark("edited_output_revalidated");
          const existing = await getExternalReportByV2SubmissionKey(validated.submissionKey);
          mark("idempotency_checked");
          if (existing) return { report: existing, replayed: true as const };

          const storedSourceAssets = await Promise.all((input.sourceAssets ?? []).map(async (asset) => {
            const buffer = Buffer.from(asset.fileBase64, "base64");
            if (buffer.byteLength > 16 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Each source document must be 16 MB or smaller." });
            const extension = asset.fileName.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "bin";
            const safeName = asset.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
            const key = `external-reports/source/${input.patientId}/${ctx.user.id}/${Date.now()}-${randomUUID()}-${safeName}.${extension}`;
            const { key: storedKey, url } = await (await import("./storage")).storagePut(key, buffer, asset.mimeType, asset.fileName);
            return {
              key: storedKey,
              url,
              name: asset.fileName,
              mimeType: asset.mimeType,
              tag: asset.tag,
              documentPasswordCiphertext: asset.documentPassword?.trim() ? encryptExternalReportDocumentPassword(asset.documentPassword.trim()) : null,
            };
          }));
          const sourceAssetRefs = storedSourceAssets.length ? storedSourceAssets : input.sourceAssetRefs;
          const reportRef = await getNextCode("external_report");
          mark("transaction_started");
          try {
            const report = await createExternalReport({
              patientId: input.patientId,
              sourceOrganization: input.sourceOrganization,
              reportType: input.reportType,
              reportDate: input.reportDate,
              originalContent: input.sourceText,
              processedContent: input.processedText,
              processedDocument: validated.document,
              processingRepresentation: "structured",
              processingNote: legacyProcessingNoteForGoal(validated.resolved.processingGoal),
              language: validated.resolved.resolvedOutputLanguage,
              reportRef,
              status: "final",
              createdById: ctx.user.id,
              originalFiles: sourceAssetRefs?.length ? JSON.stringify(sourceAssetRefs) : undefined,
              v2SubmissionKey: validated.submissionKey,
              v2Metadata: validated.metadata,
              sourceCapture: {
                sourceText: input.sourceText,
                inputMethod: input.sourceInputMethod,
                sourceLanguage: input.sourceLanguage,
                sourceAssetRefs,
              },
              processing: {
                ...validated.resolved,
                processedDocumentVersion: 1,
                humanReviewFinalized: true,
              },
            });
            mark("transaction_committed");
            mark("readback_completed", "success");
            return { report, replayed: false as const };
          } catch (error) {
            const replay = await getExternalReportByV2SubmissionKey(validated.submissionKey);
            if (replay) {
              mark("readback_completed", "success");
              return { report: replay, replayed: true as const };
            }
            throw error;
          }
        } catch (error) {
          mark(stage, "failed");
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({ code: "BAD_REQUEST", message: "Report could not be finalized. No partial report was saved." });
        }
      }),
  }),
});
export type AppRouter = typeof appRouter;
