import { type Express, type Request, type Response } from "express";
import {
  getProposalById,
  listProposalItems,
  getPatientById,
  getLeadById,
  getSystemSettings,
  getInvoiceById,
  getInvoiceItems,
  getInvoiceFinancialSummary,
  getTreatmentPlanById,
  listScenariosByPlan,
  getDoctorById,
  getAllServices,
  listPaymentsByInvoice,
  listOverpaymentCreditLotsByInvoice,
  getMedicalNoteById,
  getExternalReportById,
} from "./db.js";
import { buildExternalReportPdfFilename, generateProposalPdf, generateInvoicePdf, generateTreatmentPlanPdf, generateReceiptPdf, generateMedicalReportPdf, generateExternalReportPdf } from "./pdfService.js";
import {
  buildCumulativeReceiptData,
  isOfficialReceiptEligible,
  OFFICIAL_RECEIPT_UNAVAILABLE_MESSAGE,
} from "./receiptData.js";
import { invokeLLM } from "./_core/llm.js";
import multer from "multer";
import { storagePut } from "./storage.js";

// Multer: store in memory, max 5MB
const receiptUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
// Multer for temp uploads (PDF import, up to 20MB)
const tempUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Helper: translate a block of text via LLM
async function translateTextForPdf(text: string, targetLang: string): Promise<string> {
  if (!text || !text.trim()) return text;
  const langNames: Record<string, string> = { en: "English", ar: "Arabic", tr: "Turkish" };
  const langName = langNames[targetLang] ?? targetLang;
  try {
    const resp = await invokeLLM({
      workloadId: "medical_document_translation",
      messages: [
        {
          role: "system",
          content: `You are a professional medical translator. Translate the following text to ${langName}. Return ONLY the translated text, no explanations or extra content.`,
        },
        { role: "user", content: text },
      ],
    });
    return (resp as any)?.choices?.[0]?.message?.content?.trim() ?? text;
  } catch {
    return text;
  }
}

export function registerPdfRoutes(app: Express) {
  // ── Public Logo Endpoint (no auth required, used in email templates) ──────
  app.get("/api/logo.png", (_req: Request, res: Response) => {
    const { LOGO_BASE64 } = require("./emailService.js");
    const buf = Buffer.from(LOGO_BASE64, "base64");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buf);
  });

  // ── Proposal PDF ──────────────────────────────────────────────────────────
  app.get("/api/proposals/:id/pdf", async (req: Request, res: Response) => {
    try {
      const proposalId = parseInt(req.params.id, 10);
      if (isNaN(proposalId)) return res.status(400).json({ error: "Invalid proposal ID" });

      const proposal = await getProposalById(proposalId);
      if (!proposal) return res.status(404).json({ error: "Proposal not found" });

      const items = await listProposalItems(proposalId);
      const sysSettings = await getSystemSettings();
      const cardSurchargePct = parseFloat(sysSettings.card_surcharge_pct ?? "23") || 23;

      let patientName = "Valued Patient";
      let mrn: string | undefined;

      if ((proposal as any).patientId) {
        const pat = await getPatientById((proposal as any).patientId);
        if (pat) {
          patientName = `${pat.firstName} ${pat.middleName ? pat.middleName + " " : ""}${pat.lastName}`.trim();
          mrn = pat.mrn ?? undefined;
        }
      } else if ((proposal as any).leadId) {
        const lead = await getLeadById((proposal as any).leadId);
        if (lead) {
          patientName = `${lead.firstName} ${lead.lastName}`.trim();
        }
      }

      const proposalCode = (proposal as any).code ?? `PROP-${proposal.id}`;
      const issueDate = new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      const totalNum = parseFloat((proposal as any).totalAmount ?? "0");

      // Resolve items: prefer proposal_items table rows; fall back to customItems JSON
      let resolvedItems: Array<{
        serviceName?: string;
        description: string;
        serviceDescription?: string;
        quantity: number;
        unitPrice: number;
        discount: number;
        totalPrice: number;
      }>;

      if (items.length > 0) {
        resolvedItems = items.map((i: any) => {
          const discPct = parseFloat(i.discount ?? "0") || 0;
          const unitP = parseFloat(i.unitPrice);
          const qty = Number(i.quantity);
          const total = discPct > 0 ? unitP * qty * (1 - discPct / 100) : parseFloat(i.totalPrice);
          return {
            serviceName: i.serviceName ?? undefined,
            description: i.description,
            serviceDescription: i.serviceDescription ?? undefined,
            quantity: qty,
            unitPrice: unitP,
            discount: discPct,
            totalPrice: total,
          };
        });
      } else {
        // customItems JSON stored on the proposal row
        const customItems: any[] = (proposal as any).customItems ?? [];
        const allServices = await getAllServices();
        const serviceMap = new Map(allServices.map((s: any) => [String(s.id), s]));
        resolvedItems = customItems.map((ci: any) => {
          const svc = serviceMap.get(String(ci.serviceId));
          const discPct = parseFloat(ci.discount ?? "0") || 0;
          const unitP = parseFloat(ci.amount ?? ci.unitPrice ?? "0");
          const qty = Number(ci.quantity ?? 1);
          const total = discPct > 0 ? unitP * qty * (1 - discPct / 100) : unitP * qty;
          return {
            serviceName: svc?.name ?? ci.serviceName ?? undefined,
            description: ci.description ?? svc?.name ?? "",
            serviceDescription: svc?.description ?? undefined,
            quantity: qty,
            unitPrice: unitP,
            discount: discPct,
            totalPrice: total,
          };
        });
      }

      const pdfBuffer = await generateProposalPdf({
        proposalCode,
        patientName,
        mrn,
        issueDate,
        currency: (proposal as any).currency ?? "USD",
        totalAmount: totalNum,
        appliedPriceType: (proposal as any).appliedPriceType ?? "local",
        notes: (proposal as any).staffNotes ?? undefined,
        cardSurchargePct,
        items: resolvedItems,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${proposalCode}.pdf"`
      );
      res.send(pdfBuffer);
    } catch (err) {
      console.error("[PDF] Proposal PDF error:", err);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

  // ── Invoice PDF ───────────────────────────────────────────────────────────
  app.get("/api/invoices/:id/pdf", async (req: Request, res: Response) => {
    try {
      const invoiceId = parseInt(req.params.id, 10);
      if (isNaN(invoiceId)) return res.status(400).json({ error: "Invalid invoice ID" });

      const invoice = await getInvoiceById(invoiceId);
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });

      const items = await getInvoiceItems(invoiceId);

      let patientName = "Valued Patient";
      let mrn: string | undefined;

      if ((invoice as any).patientId) {
        const pat = await getPatientById((invoice as any).patientId);
        if (pat) {
          patientName = `${pat.firstName} ${pat.middleName ? pat.middleName + " " : ""}${pat.lastName}`.trim();
          mrn = pat.mrn ?? undefined;
        }
      }

      const invoiceCode = (invoice as any).invoiceNumber ?? `INV-${invoice.id}`;
      const rawInvoice = invoice as any;
      const paymentAdjustmentRateSnapshot = rawInvoice.paymentAdjustmentRateSnapshot != null
        ? Number(rawInvoice.paymentAdjustmentRateSnapshot)
        : undefined;
      const issueDate = rawInvoice.issueDate
        ? new Date(rawInvoice.issueDate).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })
        : rawInvoice.createdAt
        ? new Date(rawInvoice.createdAt).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })
        : new Date().toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          });
      const totalNum = parseFloat(rawInvoice.totalAmount ?? "0");
      const financialSummary = await getInvoiceFinancialSummary(invoiceId);
      const paidNum = Number(financialSummary.netSettled);
      // For Mode B (agreed price), DB subtotal may be null — compute from items so the discount line renders.
      const itemsSubtotalComputed = items.reduce((s: number, i: any) => s + parseFloat(i.totalPrice ?? "0"), 0);
      const subtotalNum = rawInvoice.subtotal
        ? parseFloat(rawInvoice.subtotal)
        : (itemsSubtotalComputed > totalNum + 0.005 ? itemsSubtotalComputed : totalNum);
        // Invoice-level pricing remains separate from V4 service-line adjustments.
        const invDiscountPct = parseFloat(rawInvoice.discountPercent ?? "0") || 0;
      const invDiscountAmt = parseFloat(rawInvoice.discountAmount ?? "0") || 0;

      const pdfBuffer = await generateInvoicePdf({
        invoiceNumber: invoiceCode,
        patientName,
        mrn,
        issueDate,
        dueDate: rawInvoice.dueDate
          ? new Date(rawInvoice.dueDate).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })
          : undefined,
        currency: rawInvoice.currency ?? "USD",
        status: rawInvoice.status ?? "unpaid",
        subtotal: subtotalNum,
        discountAmount: invDiscountAmt,
        discountPercent: invDiscountPct,
        taxAmount: Number(rawInvoice.taxAmount ?? 0),
        taxModelVersion: rawInvoice.taxModelVersion ?? null,
        settlementModelVersion: rawInvoice.settlementModelVersion ?? null,
        totalAmount: totalNum,
        paidAmount: paidNum,
        notes: rawInvoice.notes ?? undefined,
        cardSurchargePct: paymentAdjustmentRateSnapshot,
        pricingMode: rawInvoice.pricingMode ?? "discount",
        paymentDetails: await (async () => {
          const [pmts, overpaymentCreditLots] = await Promise.all([
            listPaymentsByInvoice(invoiceId),
            listOverpaymentCreditLotsByInvoice(invoiceId),
          ]);
          return pmts.map((p: any) => ({
            date: new Date(p.receivedAt ?? p.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
            method: p.method ? (p.method.charAt(0).toUpperCase() + p.method.slice(1).replace(/_/g, " ")) : "Cash",
            amount: Number(p.amount),
            currency: p.currency,
            convertedAmountInInvoiceCurrency: Number(p.amountInInvoiceCurrency),
            settledAmount: p.settledAmount != null ? Number(p.settledAmount) : undefined,
            invoiceCurrency: rawInvoice.currency ?? "USD",
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
        })(),
        items: items.map((i: any) => {
          const itemUnitPrice = parseFloat(i.unitPrice);
          const itemQty = Number(i.quantity);
          const linePricingMethod = i.linePricingMethod ?? "none";
          const itemDiscPct = linePricingMethod === "discount_percent"
            ? parseFloat(i.lineDiscountPercent ?? "0") || 0
            : 0;
          const itemTotal = parseFloat(i.totalPrice);
          return {
            description: i.description,
            lineLabel: i.lineLabel ?? null,
            serviceDescription: i.serviceDescription ?? undefined,
            quantity: itemQty,
            unitPrice: itemUnitPrice,
            totalPrice: itemTotal,
            linePricingMethod,
            lineDiscountPercent: itemDiscPct,
            originalLineTotal: itemUnitPrice * itemQty,
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

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${invoiceCode}.pdf"`
      );
      res.send(pdfBuffer);
    } catch (err) {
      console.error("[PDF] Invoice PDF error:", err);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

  // ── Official Receipt PDF ────────────────────────────────────────────────────────────────
  app.get("/api/invoices/:id/receipt", async (req: Request, res: Response) => {
    try {
      const invoiceId = parseInt(req.params.id, 10);
      if (isNaN(invoiceId)) return res.status(400).json({ error: "Invalid invoice ID" });

      const invoice = await getInvoiceById(invoiceId);
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });

      const rawInvoice = invoice as any;

      let patientName = "Valued Patient";
      let mrn: string | undefined;
      if (rawInvoice.patientId) {
        const pat = await getPatientById(rawInvoice.patientId);
        if (pat) {
          patientName = `${pat.firstName} ${pat.middleName ? pat.middleName + " " : ""}${pat.lastName}`.trim();
          mrn = pat.mrn ?? undefined;
        }
      }

      const receiptData = await buildCumulativeReceiptData({ invoiceId, patientName, mrn });
      if (!isOfficialReceiptEligible(receiptData)) {
        return res.status(409).json({
          error: OFFICIAL_RECEIPT_UNAVAILABLE_MESSAGE,
        });
      }

      // Optional custom receipt note from query param (used when downloading directly)
      const receiptNote = typeof req.query.note === "string" && req.query.note.trim() ? req.query.note.trim() : undefined;

      const pdfBuffer = await generateReceiptPdf({
        ...receiptData,
        receiptNote,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Receipt-${receiptData.invoiceNumber}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("[PDF] Receipt PDF error:", err);
      res.status(500).json({ error: "Failed to generate receipt PDF" });
    }
  });

  // ── Treatment Plan PDF (internal/clinical) ────────────────────────────────────────────
  // Supports ?lang=en|ar|tr for AI translation
  app.get("/api/treatment-plans/:id/pdf", async (req: Request, res: Response) => {
    try {
      const planId = parseInt(req.params.id, 10);
      if (isNaN(planId)) return res.status(400).json({ error: "Invalid treatment plan ID" });

      const plan = await getTreatmentPlanById(planId);
      if (!plan) return res.status(404).json({ error: "Treatment plan not found" });

      const scenarios = await listScenariosByPlan(planId);

      // Optional language translation
      const lang = typeof req.query.lang === "string" ? req.query.lang : "en";
      const shouldTranslate = lang && lang !== "en";

      // Resolve patient name + MRN
      let patientName = "Valued Patient";
      let mrn: string | undefined;

      if ((plan as any).patientId) {
        const pat = await getPatientById((plan as any).patientId);
        if (pat) {
          patientName = `${pat.firstName} ${pat.middleName ? pat.middleName + " " : ""}${pat.lastName}`.trim();
          mrn = pat.mrn ?? undefined;
        }
      } else if ((plan as any).leadId) {
        const lead = await getLeadById((plan as any).leadId);
        if (lead) {
          patientName = `${lead.firstName} ${lead.lastName}`.trim();
        }
      }

      // Resolve doctor name
      let doctorName: string | undefined;
      if ((plan as any).doctorId) {
        const doctor = await getDoctorById((plan as any).doctorId);
        if (doctor) {
          doctorName = doctor.name ?? undefined;
        }
      }

      const planCode = `TP-${plan.id}`;
      const issueDate = new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

      // Parse qaAnswers from JSON
      let qaAnswers: Array<{ question: string; askedBy: "female" | "male"; answer: string }> = [];
      if ((plan as any).qaAnswers) {
        try {
          const raw = typeof (plan as any).qaAnswers === "string"
            ? JSON.parse((plan as any).qaAnswers)
            : (plan as any).qaAnswers;
          if (Array.isArray(raw)) qaAnswers = raw;
        } catch {
          // ignore parse errors
        }
      }

      // Parse scenarios services from JSON
      const scenarioData = scenarios.map((s: any) => {
        let services: Array<{ serviceName: string; category: string; quantity: number; isMedication?: boolean; dosage?: string; frequency?: string; notes?: string }> = [];
        if (s.services) {
          try {
            const raw = typeof s.services === "string" ? JSON.parse(s.services) : s.services;
            if (Array.isArray(raw)) {
              services = raw.map((sv: any) => ({
                serviceName: sv.serviceName ?? sv.name ?? "Unknown Service",
                category: sv.category ?? "General",
                quantity: Number(sv.quantity) || 1,
                isMedication: sv.isMedication ?? false,
                dosage: sv.dosage ?? undefined,
                frequency: sv.frequency ?? undefined,
                notes: sv.notes ?? undefined,
              }));
            }
          } catch {
            // ignore parse errors
          }
        }
        return {
          title: s.title ?? `Scenario ${s.id}`,
          summary: s.summary ?? undefined,
          services,
        };
      });

      // Apply AI translation if requested
      let clinicalSummary = (plan as any).clinicalSummary ?? undefined;
      let translatedQaAnswers = qaAnswers;
      let translatedScenarios = scenarioData;

      if (shouldTranslate) {
        // Translate clinical summary
        if (clinicalSummary) {
          clinicalSummary = await translateTextForPdf(clinicalSummary, lang);
        }
        // Translate Q&A answers
        translatedQaAnswers = await Promise.all(
          qaAnswers.map(async (qa) => ({
            ...qa,
            question: await translateTextForPdf(qa.question, lang),
            answer: qa.answer ? await translateTextForPdf(qa.answer, lang) : qa.answer,
          }))
        );
        // Translate scenario titles, summaries, and service names
        translatedScenarios = await Promise.all(
          scenarioData.map(async (sc) => ({
            ...sc,
            title: await translateTextForPdf(sc.title, lang),
            summary: sc.summary ? await translateTextForPdf(sc.summary, lang) : sc.summary,
            services: await Promise.all(
              sc.services.map(async (sv) => ({
                ...sv,
                serviceName: await translateTextForPdf(sv.serviceName, lang),
                notes: sv.notes ? await translateTextForPdf(sv.notes, lang) : sv.notes,
                frequency: sv.frequency ? await translateTextForPdf(sv.frequency, lang) : sv.frequency,
              }))
            ),
          }))
        );
      }

      const pdfBuffer = await generateTreatmentPlanPdf({
        planCode,
        patientName,
        mrn,
        issueDate,
        doctorName,
        clinicalSummary,
        qaAnswers: translatedQaAnswers,
        scenarios: translatedScenarios,
        language: lang,
      });

      const langSuffix = shouldTranslate ? `-${lang}` : "";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${planCode}${langSuffix}.pdf"`
      );
      res.send(pdfBuffer);
    } catch (err) {
      console.error("[PDF] Treatment Plan PDF error:", err);
        res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

  // ─── Receipt Attachment Upload (multipart) ────────────────────────────────────
  app.post("/api/invoices/upload-receipt-attachment",
    receiptUpload.single("file"),
    async (req: any, res: any) => {
      try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: "No file provided" });
        const ext = (file.originalname.split(".").pop() ?? "pdf").toLowerCase();
        const key = `invoices/receipt-attachments/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { key: storedKey, url } = await storagePut(key, file.buffer, file.mimetype);
        return res.json({ key: storedKey, url });
      } catch (err) {
        console.error("[Upload] Receipt attachment error:", err);
        return res.status(500).json({ error: "Upload failed" });
      }
    }
  );

  // ── Medical Note Report PDF ───────────────────────────────────────────────
  app.get("/api/medical-notes/:id/pdf", async (req: Request, res: Response) => {
    try {
      const noteId = parseInt(req.params.id, 10);
      if (isNaN(noteId)) return res.status(400).json({ error: "Invalid note ID" });

      const note = await getMedicalNoteById(noteId);
      if (!note) return res.status(404).json({ error: "Medical note not found" });

      const patient = await getPatientById((note as any).patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      // Build patient name
      const patientName = [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(" ");

      // Calculate age from dateOfBirth
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

      // Doctor info
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

      // Note type label
      const noteTypeMap: Record<string, string> = {
        consultation: "Consultation",
        follow_up: "Follow Up",
        procedure: "Procedure",
        lab_review: "Lab Review",
        general: "General",
      };
      const noteTypeLabel = noteTypeMap[(note as any).noteType ?? "consultation"] ?? "Consultation";

      // Report reference
      const reportRef = `MR-${String(noteId).padStart(5, "0")}`;
      const visitDate = (note as any).visitDate
        ? new Date((note as any).visitDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
        : new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

      const pdfBuffer = await generateMedicalReportPdf({
        reportRef,
        visitDate,
        noteType: noteTypeLabel,
        patientName,
        mrn: patient.mrn,
        dateOfBirth: dateOfBirthStr,
        age,
        gender: patient.gender ?? undefined,
        nationality: patient.nationality ?? undefined,
        phone: patient.phone ?? undefined,
        doctorName,
        doctorTitle,
        doctorSpecialty,
        doctorStampKey,
        chiefComplaint: (note as any).chiefComplaint ?? undefined,
        historyOfPresentIllness: (note as any).historyOfPresentIllness ?? undefined,
        physicalExamination: (note as any).physicalExamination ?? undefined,
        assessment: (note as any).assessment ?? undefined,
        plan: (note as any).plan ?? undefined,
        diagnosis: (note as any).diagnosis ?? undefined,
        medications: (note as any).medications ?? undefined,
        additionalNotes: (note as any).additionalNotes ?? undefined,
      });

      const filename = `Medical-Report-${patient.mrn}-${reportRef}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("[PDF] Medical note PDF error:", err);
      res.status(500).json({ error: "Failed to generate medical report PDF" });
    }
  });

  // ── External Report PDF ─────────────────────────────────────────────────────
  app.get("/api/external-reports/:id/pdf", async (req: Request, res: Response) => {
    try {
      const reportId = parseInt(req.params.id, 10);
      if (isNaN(reportId)) return res.status(400).json({ error: "Invalid report ID" });

      const report = await getExternalReportById(reportId);
      if (!report) return res.status(404).json({ error: "Report not found" });

      const patient = await getPatientById((report as any).patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      const patientName = `${patient.firstName} ${patient.middleName ? patient.middleName + " " : ""}${patient.lastName}`.trim();

      let age: number | undefined;
      let dateOfBirthStr: string | undefined;
      if (patient.dateOfBirth) {
        const dob = new Date(patient.dateOfBirth);
        dateOfBirthStr = dob.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
        age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
      }

      const reportDate = (report as any).reportDate
        ? new Date((report as any).reportDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
        : new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

      const pdfBuffer = await generateExternalReportPdf({
        reportRef: (report as any).code ?? `EXT-${String(reportId).padStart(5, "0")}`,
        reportDate,
        reportType: (report as any).reportType ?? null,
        sourceOrganization: (report as any).sourceOrganization ?? undefined,
        processingNote: (report as any).processingNote ?? "translated",
        processedContent: (report as any).processedContent ?? "",
        processedDocument: (report as any).processedDocument ?? null,
        patientName,
        mrn: patient.mrn ?? undefined,
        dateOfBirth: dateOfBirthStr,
        age,
        gender: patient.gender ?? undefined,
        nationality: patient.nationality ?? undefined,
        phone: patient.phone ?? undefined,
      });

      const filename = buildExternalReportPdfFilename((report as any).code ?? `EXT-${String(reportId).padStart(5, "0")}`, (report as any).reportType ?? null);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("[PDF] External report PDF error:", err);
      res.status(500).json({ error: "Failed to generate external report PDF" });
    }
  });

  // ── Temp file upload (for PDF dictionary import) ─────────────────────────────────
  app.post("/api/upload-temp", tempUpload.single("file"), async (req: any, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const ext = req.file.originalname.split(".").pop() ?? "bin";
      const key = `temp-uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { url } = await storagePut(key, req.file.buffer, req.file.mimetype);
      res.json({ url, key });
    } catch (err) {
      console.error("[upload-temp] error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });
}
