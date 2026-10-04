/**
 * Fertiliv Email Service
 * Sends transactional emails via Resend.
 *
 * TWO MODES (auto-selected per email type):
 *  1. Template mode  — when a RESEND_TEMPLATE_* env var is set, sends via
 *                      Resend's template API (resend.emails.send with template_id + variables).
 *  2. Inline mode    — falls back to the built-in multilingual HTML templates
 *                      (EN/AR/TR hardcoded, AI-translated for all other languages).
 *
 * To activate template mode for an email type, set the corresponding env var:
 *   RESEND_TEMPLATE_APPOINTMENT_CREATED
 *   RESEND_TEMPLATE_APPOINTMENT_CONFIRMED
 *   RESEND_TEMPLATE_APPOINTMENT_CANCELLED
 *   RESEND_TEMPLATE_APPOINTMENT_RESCHEDULED
 *   RESEND_TEMPLATE_INVOICE_ISSUED
 *
 * Each value should be the Resend template ID (e.g. "d-xxxxxxxxxxxxxxxxxxxxxxxx").
 */

import { Resend } from "resend";
import { invokeLLM } from "./_core/llm";
import { getClinicInfo } from "./db";
import { getAppointmentCommunicationLocaleResource, resolveAppointmentCommunicationLocale } from "../shared/appointmentCommunicationLocales";
import { formatFinanceCopy, formatFinancePaymentMethod, getFinanceCommunicationLocaleResource } from "../shared/financeCommunicationLocales";
import { deriveInvoiceLineDiscountPresentation } from "../shared/invoiceLineDiscount";
import { isMethodNeutralSettlementModel } from "../shared/serviceTax";

// Logo embedded as base64 constant — works in all email clients and all environments
const LOGO_DATA_URI = "data:image/png;base64,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";
// Export just the base64 part (no data: prefix) for CID attachments and the logo endpoint
export const LOGO_BASE64 = LOGO_DATA_URI.replace(/^data:image\/png;base64,/, "");
function getLogoDataUri(): string {
  return LOGO_DATA_URI;
}

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = "Fertiliv <info@fertiliv.com>";

// ─── Template IDs from environment ───────────────────────────────────────────
const TEMPLATE_IDS = {
  appointmentCreated:    process.env.RESEND_TEMPLATE_APPOINTMENT_CREATED,
  appointmentConfirmed:  process.env.RESEND_TEMPLATE_APPOINTMENT_CONFIRMED,
  appointmentCancelled:  process.env.RESEND_TEMPLATE_APPOINTMENT_CANCELLED,
  appointmentRescheduled: process.env.RESEND_TEMPLATE_APPOINTMENT_RESCHEDULED,
  invoiceIssued:         process.env.RESEND_TEMPLATE_INVOICE_ISSUED,
  invoiceUpdated:        process.env.RESEND_TEMPLATE_INVOICE_UPDATED,
  refundReceipt:         process.env.RESEND_TEMPLATE_REFUND_RECEIPT,
} as const;

// ─── Brand colors ─────────────────────────────────────────────────────────────
const BRAND = {
  darkPurple: "#1E0566",
  lightPink:  "#E3B2B0",
  peach:      "#E5BA99",
  get logoUrl() { return getLogoDataUri(); },
};

type EmailHeaderTone = "light" | "dark";

const EXISTING_DARK_NAVY_LOGO_URL = "https://pro.fertiliv.com/manus-storage/fertiliv-logo-darkblue_72725610.png";

export function getEmailHeaderPresentation(tone: EmailHeaderTone = "light") {
  return tone === "light"
    ? { backgroundColor: BRAND.lightPink, logoSrc: EXISTING_DARK_NAVY_LOGO_URL, logoAlt: "Fertiliv IVF Center" }
    : { backgroundColor: BRAND.darkPurple, logoSrc: "cid:fertiliv-logo-white", logoAlt: "Fertiliv IVF Center" };
}

function getEmailHeaderAttachments(tone: EmailHeaderTone = "light") {
  if (tone === "light") return [];
  return [{
    content: LOGO_BASE64,
    filename: "fertiliv-logo-white.png",
    contentId: "fertiliv-logo-white",
    contentType: "image/png",
  }];
}

// ─── Translation helper (used in inline mode only) ───────────────────────────
async function translateContent(
  content: { subject: string; body: string },
  targetLang: string
): Promise<{ subject: string; body: string }> {
  const langNames: Record<string, string> = {
    en: "English", ar: "Arabic", tr: "Turkish", fr: "French",
    es: "Spanish", ru: "Russian", it: "Italian", de: "German",
    pt: "Portuguese", nl: "Dutch", pl: "Polish", zh: "Chinese",
  };
  const langName = langNames[targetLang] ?? targetLang;

  const response = await invokeLLM({
    workloadId: "email_translation",
    messages: [
      {
        role: "system",
        content: `You are a professional medical translator. Translate the following email subject and body into ${langName}. 
Keep the HTML structure intact. Only translate the text content. 
Return JSON with keys "subject" and "body".
For RTL languages (Arabic, Hebrew, Persian), wrap the body in a div with dir="rtl" and style="direction:rtl;text-align:right".`,
      },
      {
        role: "user",
        content: JSON.stringify(content),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "translation",
        strict: true,
        schema: {
          type: "object",
          properties: {
            subject: { type: "string" },
            body: { type: "string" },
          },
          required: ["subject", "body"],
          additionalProperties: false,
        },
      },
    },
  });

  try {
    const raw = response.choices[0].message.content as string;
    return JSON.parse(raw);
  } catch {
    return content; // fallback to English if translation fails
  }
}

// ─── Clinic info cache (loaded once per request) ────────────────────────────
async function getClinicForEmail() {
  try {
    return await getClinicInfo();
  } catch {
    return null;
  }
}

// ─── Base HTML wrapper (inline mode) ─────────────────────────────────────────
function financeLtrSensitiveToken(value: string, rtl: boolean): string {
  const safeValue = escapeHtml(value);
  return rtl
    ? `<span dir="ltr" style="display:inline-block;direction:ltr;unicode-bidi:bidi-override;white-space:nowrap;text-align:left;">${safeValue}</span>`
    : safeValue;
}

/** A phone number is one canonical LTR token; non-breaking separators prevent Gmail/iOS splitting it internally. */
function financeLtrPhoneToken(value: string, rtl: boolean): string {
  const safeValue = escapeHtml(value).replace(/ /g, "&nbsp;");
  return rtl
    ? `<bdi dir="ltr" style="display:inline-block;direction:ltr;unicode-bidi:bidi-override;white-space:nowrap;text-align:left;">${safeValue}</bdi>`
    : safeValue;
}

function wrapEmail(body: string, isRTL = false, clinicOverride?: {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  waLink?: string;
}, htmlLanguage = isRTL ? "ar" : "en", headerTone: EmailHeaderTone = "light", chromeCopy?: { footerDisclaimer?: string }, isolateRtlSensitiveTokens = false): string {
  const cn = clinicOverride?.name ?? "Fertiliv IVF Center";
  const ca = clinicOverride?.address ?? "Halaskargazi, Vali Konağı Cd. No:73, 34371 Şişli/İstanbul, Turkey";
  const cp = clinicOverride?.phone ?? "+90 501 114 70 60";
  const ce = clinicOverride?.email ?? "info@fertiliv.com";
  const cw = clinicOverride?.website ?? "https://fertiliv.com";
  const waLink = clinicOverride?.waLink;
  const header = getEmailHeaderPresentation(headerTone);
  const headerBackgroundStyle = `background-color:${header.backgroundColor};background-image:linear-gradient(${header.backgroundColor},${header.backgroundColor});`;
  const footerBackgroundStyle = `background-color:${BRAND.lightPink};background-image:linear-gradient(${BRAND.lightPink},${BRAND.lightPink});`;
  const ltrToken = (value: string) => isolateRtlSensitiveTokens
    ? financeLtrSensitiveToken(value, isRTL)
    : value;
  const phoneToken = (value: string) => isolateRtlSensitiveTokens
    ? financeLtrPhoneToken(value, isRTL)
    : value;
  return `<!DOCTYPE html>
<html lang="${htmlLanguage}" dir="${isRTL ? "rtl" : "ltr"}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>Fertiliv</title>
  <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f5f0fb; font-family: ${isRTL ? "'Tajawal', Arial" : "'Quicksand', Arial"}, sans-serif; color: ${BRAND.darkPurple}; }
    .wrapper { max-width: 620px; margin: 32px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(30,5,102,0.10); }
    .header { background-color: ${header.backgroundColor}; background-image: linear-gradient(${header.backgroundColor}, ${header.backgroundColor}); padding: 28px 32px; text-align: center; }
    .header img { height: 48px; }
    .header-divider { height: 4px; background: linear-gradient(90deg, ${BRAND.lightPink} 0%, ${BRAND.peach} 100%); }
    .body { padding: 32px 40px; color: ${BRAND.darkPurple}; line-height: 1.6; direction: ${isRTL ? "rtl" : "ltr"}; text-align: ${isRTL ? "right" : "left"}; }
    .body h2 { color: ${BRAND.darkPurple}; font-size: 18px; margin-top: 0; margin-bottom: 16px; }
    .info-box { background: #faf7ff; border: 1px solid #e8e0f8; border-radius: 10px; overflow: hidden; margin: 20px 0; }
    .info-box-header { background: ${BRAND.darkPurple}; padding: 8px 18px; }
    .info-box-header span { color: ${BRAND.lightPink}; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
    .info-row { display: flex; justify-content: space-between; padding: 10px 18px; border-bottom: 1px solid #ede8f8; font-size: 14px; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #6b5fa0; font-weight: 500; }
    .info-value { color: ${BRAND.darkPurple}; font-weight: 600; }
    .appointment-info-table { width:100%; border:1px solid #e8e0f8; border-radius:10px; border-spacing:0; overflow:hidden; background:#faf7ff; margin:20px 0; }
    .appointment-info-label { width:42%; padding:11px 16px; border-bottom:1px solid #ede8f8; color:#6b5fa0; font-size:14px; font-weight:600; vertical-align:top; text-align:${isRTL ? "right" : "left"}; }
    .appointment-info-value { padding:11px 16px; border-bottom:1px solid #ede8f8; color:${BRAND.darkPurple}; font-size:14px; font-weight:700; vertical-align:top; text-align:${isRTL ? "right" : "left"}; overflow-wrap:anywhere; word-break:break-word; }
    .appointment-info-table tr:last-child td { border-bottom:none; }
    .appointment-help { margin:20px 0; padding:16px; border:1px solid #d7f2df; background:#f3fcf6; border-radius:10px; color:#195c35; }
    .appointment-help p { margin:6px 0 14px; font-size:14px; line-height:1.65; }
    .appointment-whatsapp-button { display:inline-block; background-color:#25D366; background-image:linear-gradient(#25D366,#25D366); color:#ffffff !important; -webkit-text-fill-color:#ffffff !important; text-decoration:none; font-weight:700; padding:12px 18px; border-radius:8px; }
    .appointment-whatsapp-button span { color:#ffffff !important; -webkit-text-fill-color:#ffffff !important; }
    .info-row-total { background: linear-gradient(90deg, ${BRAND.lightPink} 0%, ${BRAND.peach} 100%); }
    .info-row-total .info-label, .info-row-total .info-value { color: ${BRAND.darkPurple}; font-size: 15px; font-weight: 700; }
    .footer-divider { height: 3px; background: linear-gradient(90deg, ${BRAND.lightPink} 0%, ${BRAND.peach} 100%); }
    .footer { background-color: ${BRAND.lightPink}; background-image: linear-gradient(${BRAND.lightPink}, ${BRAND.lightPink}); padding: 20px 32px; text-align: center; }
    .footer p { color: ${BRAND.darkPurple}; font-size: 12px; line-height: 1.8; }
    .footer a { color: ${BRAND.darkPurple}; text-decoration: none; }
  </style>
</head>
<body>
    <div class="wrapper">
      <div class="header" style="${headerBackgroundStyle}">
      <img src="${header.logoSrc}" alt="${header.logoAlt}" style="height:48px;" />
    </div>
    <div class="header-divider"></div>
    <div class="body">
      ${body}
    </div>
    <div class="footer-divider"></div>
    <div class="footer" style="${footerBackgroundStyle}">
      <p><strong style="color:${BRAND.darkPurple};">${cn}</strong><br/>
      ${ca ? `${ca}<br/>` : ""}
      ${cp ? `<a${isolateRtlSensitiveTokens && isRTL ? ' dir="ltr" style="display:inline-block;direction:ltr;unicode-bidi:bidi-override;white-space:nowrap;text-align:left;"' : ""} href="tel:${cp.replace(/\D/g, "")}">${phoneToken(cp)}</a>` : ""}
      ${cp && ce ? " &nbsp;·&nbsp; " : ""}
      ${ce ? `<a${isolateRtlSensitiveTokens && isRTL ? ' dir="ltr" style="display:inline-block;direction:ltr;unicode-bidi:bidi-override;white-space:nowrap;text-align:left;"' : ""} href="mailto:${ce}">${ltrToken(ce)}</a>` : ""}
      ${(cp || ce) && cw ? " &nbsp;·&nbsp; " : ""}
      ${cw ? `<a${isolateRtlSensitiveTokens && isRTL ? ' dir="ltr" style="display:inline-block;direction:ltr;unicode-bidi:bidi-override;white-space:nowrap;text-align:left;"' : ""} href="${cw}">${ltrToken(cw.replace(/^https?:\/\//, ""))}</a>` : ""}
      ${waLink ? ` &nbsp;·&nbsp; <a${isolateRtlSensitiveTokens && isRTL ? ' dir="ltr" style="display:inline-block;direction:ltr;unicode-bidi:bidi-override;white-space:nowrap;text-align:left;"' : ""} href="${waLink}">${ltrToken("WhatsApp")}</a>` : ""}
      </p>
      <p style="margin-top:10px;font-size:11px;color:#563f8f;">${chromeCopy?.footerDisclaimer ?? `This email was sent because you have an account or active treatment at ${cn}.`}</p>
    </div>
  </div>
</body>
  </html>`;
}

/**
 * Email clients do not consistently preserve flex layout from class-based CSS.
 * Finance amount rows therefore use a minimal presentation table with inline cells.
 * This is display-only: callers must supply already prepared financial facts.
 */
function financialEmailRow(
  label: string,
  value: string,
  options: { total?: boolean; labelColor?: string; valueColor?: string; fontSize?: string; rtl?: boolean; stack?: boolean } = {},
): string {
  const labelColor = options.labelColor ?? "#6b5fa0";
  const valueColor = options.valueColor ?? BRAND.darkPurple;
  const fontSize = options.fontSize ?? (options.total ? "15px" : "14px");
  const weight = options.total ? "700" : "600";
  const background = options.total ? `background:linear-gradient(90deg, ${BRAND.lightPink} 0%, ${BRAND.peach} 100%);` : "";
  const labelAlign = options.rtl ? "right" : "left";
  const valueAlign = options.rtl ? "left" : "right";
  if (options.stack) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="display:table;width:100%;max-width:100%;min-width:0;box-sizing:border-box;table-layout:fixed;border-collapse:collapse;${background}"><tbody><tr><td width="100%" valign="top" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:10px 18px 2px;color:${labelColor};font-size:${fontSize};font-weight:${weight};text-align:${labelAlign};white-space:normal;overflow-wrap:anywhere;word-wrap:break-word;word-break:break-word;">${label}</td></tr><tr><td width="100%" valign="top" dir="ltr" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:2px 18px 10px;border-bottom:1px solid #ede8f8;color:${valueColor};font-size:${fontSize};font-weight:${weight};text-align:${valueAlign};white-space:normal;overflow-wrap:anywhere;word-wrap:break-word;word-break:break-word;direction:ltr;unicode-bidi:embed;"><span style="display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;white-space:normal;overflow-wrap:anywhere;word-wrap:break-word;word-break:break-word;">${value}</span></td></tr></tbody></table>`;
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border-collapse:collapse;${background}"><tbody><tr><td valign="top" style="width:58%;padding:10px 18px;border-bottom:1px solid #ede8f8;color:${labelColor};font-size:${fontSize};font-weight:${weight};text-align:${labelAlign};white-space:normal;overflow-wrap:anywhere;word-wrap:break-word;word-break:break-word;">${label}</td><td valign="top" align="${valueAlign}" dir="ltr" style="padding:10px 18px;border-bottom:1px solid #ede8f8;color:${valueColor};font-size:${fontSize};font-weight:${weight};text-align:${valueAlign};white-space:nowrap;direction:ltr;unicode-bidi:embed;">${value}</td></tr></tbody></table>`;
}

/**
 * Payment dates are canonical Finance display values. Keep each date together,
 * but do not force the whole translated method/metadata label onto one line.
 */
function financePaymentDetailRow(
  label: string,
  value: string,
  rtl: boolean,
  _options: { fullWidth?: boolean } = {},
): string {
  const labelAlign = rtl ? "right" : "left";
  const valueAlign = rtl ? "right" : "left";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="display:table;width:100%;max-width:100%;min-width:0;box-sizing:border-box;table-layout:fixed;border-collapse:collapse;"><tbody><tr><td width="100%" valign="top" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:7px 0 0;color:#6b7280;font-size:12px;font-weight:600;text-align:${labelAlign};white-space:normal;overflow-wrap:anywhere;word-wrap:break-word;word-break:break-word;">${label}</td></tr><tr><td width="100%" valign="top" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:2px 0 4px;color:#6b7280;font-size:12px;font-weight:500;text-align:${valueAlign};white-space:normal;overflow-wrap:anywhere;word-wrap:break-word;word-break:break-word;"><span style="display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;white-space:normal;overflow-wrap:anywhere;word-wrap:break-word;word-break:break-word;">${value}</span></td></tr></tbody></table>`;
}

function financePaymentEmailRow(
  paymentDate: string,
  paymentMethod: string,
  amountLabel: string,
  amount: string,
  supplementalHtml: string,
  rtl: boolean,
): string {
  const labelAlign = rtl ? "right" : "left";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="display:table;width:100%;max-width:100%;min-width:0;box-sizing:border-box;table-layout:fixed;border-collapse:collapse;"><tbody><tr><td width="100%" valign="top" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:10px 18px 2px;color:#6b5fa0;font-size:14px;font-weight:600;text-align:${labelAlign};white-space:normal;overflow-wrap:anywhere;word-wrap:break-word;word-break:break-word;"><span dir="ltr" style="direction:ltr;unicode-bidi:isolate;white-space:normal;overflow-wrap:anywhere;word-wrap:break-word;">${paymentDate}</span><span aria-hidden="true"> · </span><span>${paymentMethod}</span></td></tr><tr><td width="100%" valign="top" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:0 18px 10px;border-bottom:1px solid #ede8f8;">${financePaymentDetailRow(amountLabel, amount, rtl)}${supplementalHtml}</td></tr></tbody></table>`;
}

function isolateRtlSubjectTokens(subject: string, rtl: boolean): string {
  if (!rtl) return subject;
  const isolatedReference = "\u2066$&\u2069";
  return subject
    .replace(/\b(?:INV|REC)-[A-Za-z0-9-]+\b/g, isolatedReference)
    .replace(/\bFertiliv\b/g, "\u2066Fertiliv\u2069")
    .replace(/\s[—–-]\s/g, " \u200E$&\u200E ");
}

/** Arabic subjects deliberately contain only one isolated LTR document reference. */
function formatArabicFinanceSubject(label: string, reference: string): string {
  return `${label}: \u2066${reference}\u2069`;
}

/** Metadata can stack on narrow clients without changing the canonical displayed value. */
function metadataEmailRow(label: string, value: string, rtl = false, stack = false): string {
  return financialEmailRow(label, value, { rtl, stack });
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface AppointmentEmailData {
  patientName: string;
  appointmentDate: string;
  appointmentTime: string;
  doctorName?: string;
  appointmentType?: string;
  notes?: string;
  clinicAddress?: string;
}

export type AppointmentDetailsLanguage = string;

export interface AppointmentDetailsEmailData {
  recipientName?: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  operationalLabel: string;
  modeLabel: string;
  communicationKind?: "details" | "confirmation" | "cancellation";
  locationLabel?: string;
  mapLink?: string;
  meetingLink?: string;
  clinicName?: string;
  clinicAddress?: string;
  whatsAppLink?: string;
}

export type AppointmentDetailsEmailResult = {
  sent: boolean;
  providerMessageId?: string;
  failureClassification?: "recipient_rejected" | "provider_unavailable" | "provider_error" | "invalid_idempotent_request";
  failureCode?: string;
};

export interface InvoiceEmailData {
  waLink?: string;
  patientName: string;
  invoiceNumber: string;
  totalAmount: string;
  currency: string;
  issueDate?: string;
  dueDate?: string;
  notes?: string;
  items?: Array<{
    name: string;
    amount: string;
    quantity?: number;
    taxLabelSnapshot?: string | null;
    taxRateSnapshot?: number | null;
    effectiveTaxableBase?: string | null;
    taxAmount?: string | null;
    priceEntryCurrency?: string | null;
    priceEntryAmount?: string | null;
    priceEntryKind?: "unit_price" | "final_line_total" | "tax_included_final_line_total" | "agreed_unit_price" | "tax_included_agreed_unit_price" | null;
    priceFxRateToInvoice?: string | null;
    priceFxSource?: "system" | "manual" | null;
    priceFxNote?: string | null;
    originalLineTotal?: string | null;
    finalLineTotal?: string | null;
  }>;
  itemsSummary?: string;
  isUpdate?: boolean; // true = "Invoice Updated", false = "New Invoice"
  pricingMode?: string;
  cardSurchargePct?: number;
  /** Canonical net settlement, prepared by the server for disclosure only. */
  netSettled?: string;
  /** Canonical tax-inclusive remaining balance, never derived inside the email renderer. */
  balanceDue: string;
  /** Server-authoritative settlement state based on the same canonical balance. */
  isFullySettled: boolean;
  /** Informational pre-tax remainder prepared from immutable tax facts and net settlement. */
  remainingServiceAmountBeforeTax?: string;
  /** Canonical tax-inclusive balance prepared by the server; equals balanceDue. */
  totalBalanceDueIncludingTax?: string;
  /** Limits the additional disclosure to modern invoices with a persisted positive tax snapshot. */
  shouldShowRemainingServiceAmountBeforeTax?: boolean;
  /** Legacy non-cash collection display prepared by the server from the immutable snapshot. */
  legacyPaymentOptionAmount?: string;
  taxModelVersion?: string | null;
  settlementModelVersion?: string | null;
  serviceTotal?: string;
  taxAmount?: string;
  paymentDetails?: Array<{
    date: string;
    method: string;
    amount: number;
    currency?: string;
    convertedAmountInInvoiceCurrency?: number;
    settledAmount?: number;
    invoiceCurrency?: string;
    conversionRateToInvoice?: string;
    fxRateSource?: "system" | "manual" | null;
    fxRateNote?: string | null;
    bankGrossAmountSent?: number | null;
    bankDeductionAmount?: number | null;
    bankDeductionPercent?: number | null;
    patientCredits?: Array<{ currency: string; amount: number }>;
  }>;
}

export interface RefundEmailData {
  patientName: string;
  invoiceNumber: string;
  refundAmount: string;
  currency: string;
  refundDate: string;
  reason?: string;
  notes?: string;
}

// ─── Inline template builders (English base) ─────────────────────────────────

function buildAppointmentConfirmedEmail(data: AppointmentEmailData): { subject: string; body: string } {
  return {
    subject: `Appointment Confirmed – ${data.appointmentDate}`,
    body: `
      <h2>Your Appointment is Confirmed ✓</h2>
      <p>Dear <strong>${data.patientName}</strong>,</p>
      <p>We are pleased to confirm your appointment at Fertiliv. Please find the details below:</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Date</span><span class="info-value">${data.appointmentDate}</span></div>
        <div class="info-row"><span class="info-label">Time</span><span class="info-value">${data.appointmentTime}</span></div>
        ${data.doctorName ? `<div class="info-row"><span class="info-label">Doctor</span><span class="info-value">${data.doctorName}</span></div>` : ""}
        ${data.appointmentType ? `<div class="info-row"><span class="info-label">Type</span><span class="info-value">${data.appointmentType}</span></div>` : ""}
        ${data.clinicAddress ? `<div class="info-row"><span class="info-label">Location</span><span class="info-value">${data.clinicAddress}</span></div>` : ""}
      </div>
      ${data.notes ? `<p><strong>Notes:</strong> ${data.notes}</p>` : ""}
      <p>Please arrive 10 minutes before your scheduled time. If you need to reschedule or cancel, please contact us at least 24 hours in advance.</p>
      <p>We look forward to seeing you.</p>
      <p>Warm regards,<br/><strong>The Fertiliv Team</strong></p>
    `,
  };
}

function buildAppointmentCreatedEmail(data: AppointmentEmailData): { subject: string; body: string } {
  return {
    subject: `Appointment Scheduled – ${data.appointmentDate}`,
    body: `
      <h2>Appointment Scheduled</h2>
      <p>Dear <strong>${data.patientName}</strong>,</p>
      <p>Your appointment has been scheduled at Fertiliv. Here are the details:</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Date</span><span class="info-value">${data.appointmentDate}</span></div>
        <div class="info-row"><span class="info-label">Time</span><span class="info-value">${data.appointmentTime}</span></div>
        ${data.doctorName ? `<div class="info-row"><span class="info-label">Doctor</span><span class="info-value">${data.doctorName}</span></div>` : ""}
        ${data.appointmentType ? `<div class="info-row"><span class="info-label">Type</span><span class="info-value">${data.appointmentType}</span></div>` : ""}
        ${data.clinicAddress ? `<div class="info-row"><span class="info-label">Location</span><span class="info-value">${data.clinicAddress}</span></div>` : ""}
      </div>
      <p>Please arrive 10 minutes before your scheduled time. If you need to reschedule or cancel, please contact us at least 24 hours in advance.</p>
      <p>Warm regards,<br/><strong>The Fertiliv Team</strong></p>
    `,
  };
}

function buildAppointmentCancelledEmail(data: AppointmentEmailData & { reason?: string }): { subject: string; body: string } {
  return {
    subject: `Appointment Cancelled – ${data.appointmentDate}`,
    body: `
      <h2>Appointment Cancelled</h2>
      <p>Dear <strong>${data.patientName}</strong>,</p>
      <p>We regret to inform you that your appointment scheduled for <strong>${data.appointmentDate} at ${data.appointmentTime}</strong> has been cancelled.</p>
      ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ""}
      <p>Please contact us to reschedule your appointment at your earliest convenience.</p>
      <p>We apologize for any inconvenience this may cause.</p>
      <p>Warm regards,<br/><strong>The Fertiliv Team</strong></p>
    `,
  };
}

function buildAppointmentRescheduledEmail(data: AppointmentEmailData & { oldDate: string; oldTime: string }): { subject: string; body: string } {
  return {
    subject: `Appointment Rescheduled – New Date: ${data.appointmentDate}`,
    body: `
      <h2>Appointment Rescheduled</h2>
      <p>Dear <strong>${data.patientName}</strong>,</p>
      <p>Your appointment has been rescheduled. Here are your new appointment details:</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">New Date</span><span class="info-value">${data.appointmentDate}</span></div>
        <div class="info-row"><span class="info-label">New Time</span><span class="info-value">${data.appointmentTime}</span></div>
        ${data.doctorName ? `<div class="info-row"><span class="info-label">Doctor</span><span class="info-value">${data.doctorName}</span></div>` : ""}
        <div class="info-row"><span class="info-label">Previous Date</span><span class="info-value">${data.oldDate} at ${data.oldTime}</span></div>
      </div>
      <p>If you have any questions or need to make further changes, please don't hesitate to contact us.</p>
      <p>Warm regards,<br/><strong>The Fertiliv Team</strong></p>
    `,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeInfoRow(label: string, value?: string): string {
  if (!value?.trim()) return "";
  return `<tr><td class="appointment-info-label">${escapeHtml(label)}</td><td class="appointment-info-value">${escapeHtml(value)}</td></tr>`;
}

function safeLinkRow(label: string, href?: string, text?: string): string {
  if (!href?.trim()) return "";
  const escapedHref = escapeHtml(href.trim());
  return `<tr><td class="appointment-info-label">${escapeHtml(label)}</td><td class="appointment-info-value"><a href="${escapedHref}" style="color:${BRAND.darkPurple};">${escapeHtml(text ?? href.trim())}</a></td></tr>`;
}

function safeWhatsAppLink(phone?: string | null): string | undefined {
  const normalized = phone?.replace(/\D/g, "") ?? "";
  return /^\d{7,15}$/.test(normalized) ? `https://wa.me/${normalized}` : undefined;
}

export function renderAppointmentDetailsEmail(data: AppointmentDetailsEmailData, language: AppointmentDetailsLanguage): { subject: string; body: string } {
  const kind = data.communicationKind ?? "details";
  const legacyCopy = {
    en: {
      subject: kind === "confirmation" ? `Appointment Confirmed – ${data.appointmentDate}` : kind === "cancellation" ? `Appointment Cancelled – ${data.appointmentDate}` : `Appointment Details – ${data.appointmentDate}`,
      heading: kind === "confirmation" ? "Appointment Confirmed" : kind === "cancellation" ? "Appointment Cancelled" : "Your Appointment Details",
      greeting: data.recipientName ? `Dear <strong>${escapeHtml(data.recipientName)}</strong>,` : "Hello,",
      intro: kind === "confirmation" ? "Your appointment with Fertiliv has been confirmed. Here are the confirmed appointment details." : kind === "cancellation" ? "Your appointment with Fertiliv has been cancelled. The cancelled appointment details are below." : "Here are the current operational details of your appointment.",
      date: "Date", start: "Start time", end: "End time", type: "Appointment", mode: "Mode", location: "Location", map: "Open map", meeting: "Join meeting",
      helpHeading: kind === "cancellation" ? "Need help arranging a new appointment?" : "Need to change your appointment?",
      helpText: kind === "cancellation" ? "To arrange a new appointment or if you need assistance, please contact us on WhatsApp." : "To change your appointment or if you need assistance, please contact us on WhatsApp.",
      helpButton: "Contact us on WhatsApp",
      closing: kind === "cancellation" ? "To arrange a new appointment or if you need assistance, please contact Fertiliv." : "If you need assistance, please contact Fertiliv.",
    },
    ar: {
      subject: kind === "confirmation" ? `تم تأكيد موعدك – ${data.appointmentDate}` : kind === "cancellation" ? `تم إلغاء موعدك – ${data.appointmentDate}` : `تفاصيل موعدك – ${data.appointmentDate}`,
      heading: kind === "confirmation" ? "تم تأكيد موعدك" : kind === "cancellation" ? "تم إلغاء موعدك" : "تفاصيل موعدك",
      greeting: data.recipientName ? `مرحبًا <strong>${escapeHtml(data.recipientName)}</strong>،` : "مرحبًا،",
      intro: kind === "confirmation" ? "تم تأكيد موعدك لدى Fertiliv. تجد أدناه تفاصيل الموعد المؤكد." : kind === "cancellation" ? "نود إعلامكم بأنه تم إلغاء موعدكم لدى Fertiliv. تجد أدناه تفاصيل الموعد الملغى." : "هذه هي التفاصيل الحالية لموعدك.",
      date: "التاريخ", start: "وقت البداية", end: "وقت الانتهاء", type: "الموعد", mode: "النمط", location: "الموقع", map: "فتح الخريطة", meeting: "الانضمام إلى الاجتماع",
      helpHeading: kind === "cancellation" ? "هل تحتاج إلى ترتيب موعد جديد؟" : "هل تحتاج إلى تغيير موعدك؟",
      helpText: kind === "cancellation" ? "لترتيب موعد جديد أو للحصول على المساعدة، يرجى التواصل معنا عبر واتساب." : "لتعديل موعدك أو للحصول على المساعدة، يرجى التواصل معنا عبر واتساب.",
      helpButton: "تواصل معنا عبر واتساب",
      closing: kind === "cancellation" ? "لترتيب موعد جديد أو للحصول على المساعدة، يرجى التواصل مع Fertiliv." : "للمساعدة، يرجى التواصل مع Fertiliv.",
    },
    tr: {
      subject: kind === "confirmation" ? `Randevunuz Onaylandı – ${data.appointmentDate}` : kind === "cancellation" ? `Randevunuz İptal Edildi – ${data.appointmentDate}` : `Randevu Bilgileriniz – ${data.appointmentDate}`,
      heading: kind === "confirmation" ? "Randevunuz Onaylandı" : kind === "cancellation" ? "Randevunuz İptal Edildi" : "Randevu Bilgileriniz",
      greeting: data.recipientName ? `Merhaba <strong>${escapeHtml(data.recipientName)}</strong>,` : "Merhaba,",
      intro: kind === "confirmation" ? "Fertiliv'deki randevunuz onaylandı. Onaylanan randevu bilgileri aşağıdadır." : kind === "cancellation" ? "Fertiliv'deki randevunuz iptal edildi. İptal edilen randevu bilgileri aşağıdadır." : "Randevunuzun güncel operasyonel bilgileri aşağıdadır.",
      date: "Tarih", start: "Başlangıç saati", end: "Bitiş saati", type: "Randevu", mode: "Tür", location: "Konum", map: "Haritayı aç", meeting: "Toplantıya katıl",
      helpHeading: kind === "cancellation" ? "Yeni bir randevu ayarlamak ister misiniz?" : "Randevunuzu değiştirmek mi istiyorsunuz?",
      helpText: kind === "cancellation" ? "Yeni bir randevu ayarlamak veya yardım almak için lütfen WhatsApp üzerinden bizimle iletişime geçin." : "Randevunuzu değiştirmek veya yardım almak için lütfen WhatsApp üzerinden bizimle iletişime geçin.",
      helpButton: "WhatsApp'tan bize ulaşın",
      closing: kind === "cancellation" ? "Yeni bir randevu ayarlamak veya yardım almak için lütfen Fertiliv ile iletişime geçin." : "Yardıma ihtiyacınız olursa lütfen Fertiliv ile iletişime geçin.",
    },
  }[language as "en" | "ar" | "tr"];
  const l1 = getAppointmentCommunicationLocaleResource(language).copy;
  const copy = legacyCopy ?? {
    subject: kind === "confirmation" ? l1.subject_confirmation.replace("{date}", data.appointmentDate) : kind === "cancellation" ? l1.subject_cancellation.replace("{date}", data.appointmentDate) : l1.subject_details.replace("{date}", data.appointmentDate),
    heading: kind === "confirmation" ? l1.heading_confirmation : kind === "cancellation" ? l1.heading_cancellation : l1.heading_details,
    greeting: data.recipientName ? l1.greeting_named.replace("{name}", `<strong>${escapeHtml(data.recipientName)}</strong>`) : l1.greeting_generic,
    intro: kind === "confirmation" ? l1.intro_confirmation : kind === "cancellation" ? l1.intro_cancellation : l1.intro_details,
    date: l1.date, start: l1.start, end: l1.end, type: l1.appointment, mode: l1.mode, location: l1.location, map: l1.map, meeting: l1.meeting,
    helpHeading: kind === "cancellation" ? l1.help_cancellation_heading : l1.help_standard_heading,
    helpText: kind === "cancellation" ? l1.help_cancellation_text : l1.help_standard_text,
    helpButton: l1.help_button,
    closing: kind === "cancellation" ? l1.closing_cancellation : l1.closing_standard,
  };
  const cancellation = kind === "cancellation";
  const whatsAppLink = safeWhatsAppLink(data.whatsAppLink);

  return {
    subject: copy.subject,
    body: `<h2>${copy.heading}</h2><p>${copy.greeting}</p><p>${copy.intro}</p><table class="appointment-info-table" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tbody>${safeInfoRow(copy.date, data.appointmentDate)}${safeInfoRow(copy.start, data.startTime)}${safeInfoRow(copy.end, data.endTime)}${safeInfoRow(copy.type, data.operationalLabel)}${cancellation ? "" : safeInfoRow(copy.mode, data.modeLabel)}${cancellation ? "" : safeInfoRow(copy.location, data.locationLabel)}${cancellation ? "" : safeLinkRow(copy.map, data.mapLink, copy.map)}${cancellation ? "" : safeLinkRow(copy.meeting, data.meetingLink, copy.meeting)}</tbody></table>${whatsAppLink ? `<div class="appointment-help"><strong>${copy.helpHeading}</strong><p>${copy.helpText}</p><a class="appointment-whatsapp-button" href="${escapeHtml(whatsAppLink)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#25D366;background-image:linear-gradient(#25D366,#25D366);color:#ffffff !important;-webkit-text-fill-color:#ffffff !important;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px;"><span style="color:#ffffff !important;-webkit-text-fill-color:#ffffff !important;">${copy.helpButton}</span></a></div>` : ""}<p>${copy.closing}</p><p>— <strong>Fertiliv</strong></p>`,
  };
}

/**
 * Wraps fixed appointment-communication content with the language and direction
 * published for the resolved delivery locale. Legacy inline translation paths
 * intentionally continue to use their existing wrapper behavior.
 */
export function wrapAppointmentCommunicationEmail(
  body: string,
  requestedLanguage: AppointmentDetailsLanguage,
  clinicOverride?: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    waLink?: string;
  },
): string {
  const locale = resolveAppointmentCommunicationLocale(requestedLanguage).deliveredLocale;
  const resource = getAppointmentCommunicationLocaleResource(locale);
  return wrapEmail(body, resource.direction === "rtl", clinicOverride, locale);
}

export function wrapFinanceCommunicationEmail(
  body: string,
  requestedLanguage: string,
  clinicOverride?: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    waLink?: string;
  },
): string {
  const resource = getFinanceCommunicationLocaleResource(requestedLanguage);
  return wrapEmail(body, resource.direction === "rtl", clinicOverride, resource.locale, "light", { footerDisclaimer: resource.copy.footerDisclaimer }, true);
}

export function buildInvoiceEmail(data: InvoiceEmailData, requestedLanguage = "en"): { subject: string; body: string } {
  const resource = getFinanceCommunicationLocaleResource(requestedLanguage);
  const copy = resource.copy;
  const rtl = resource.direction === "rtl";
  const row = (label: string, value: string, options: Omit<Parameters<typeof financialEmailRow>[2], "rtl" | "stack"> = {}) => financialEmailRow(label, value, { ...options, rtl, stack: true });
  const isTaxModelInvoice = data.taxModelVersion === "line_tax_v1";
  const isMethodNeutralInvoice = isMethodNeutralSettlementModel(data.settlementModelVersion)
    || data.pricingMode === "agreed"
    || !(data.cardSurchargePct && data.cardSurchargePct > 0);
  const itemsHtml = data.items?.map(item => {
    const isAgreedUnit = item.priceEntryKind === "agreed_unit_price" || item.priceEntryKind === "tax_included_agreed_unit_price";
    const isTaxIncludedAgreedUnit = item.priceEntryKind === "tax_included_agreed_unit_price";
    const sourceLabel = isAgreedUnit ? (isTaxIncludedAgreedUnit ? copy.agreedGrossUnitPrice : copy.agreedUnitPrice) : copy.negotiatedSourcePrice;
    const sourceValue = `${item.priceEntryCurrency} ${item.priceEntryAmount}${isAgreedUnit ? ` × ${item.quantity ?? 1}` : ""}${item.priceEntryCurrency !== data.currency && item.priceFxRateToInvoice ? ` · ${item.priceFxSource === "manual" ? copy.manualFx : copy.systemFx}: 1 ${item.priceEntryCurrency} = ${item.priceFxRateToInvoice} ${data.currency}` : ""}`;
    const derivedDiscount = deriveInvoiceLineDiscountPresentation({ originalLineTotal: item.originalLineTotal, finalLineTotal: item.finalLineTotal });
    const discountLabel = formatFinanceCopy(copy.discountWithRate, { rate: derivedDiscount.discountPercent });
    const formatDerivedLineMoney = (value: string) => `${data.currency} ${Number(value).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `${derivedDiscount.applies ? row(copy.originalLineTotal, formatDerivedLineMoney(derivedDiscount.originalLineTotal), { fontSize: "12px", labelColor: "#6b7280", valueColor: "#6b7280" }) : ""}${derivedDiscount.applies ? row(discountLabel, `- ${formatDerivedLineMoney(derivedDiscount.discountAmount)}`, { fontSize: "12px", labelColor: "#059669", valueColor: "#059669" }) : ""}${row(item.name, item.amount)}${item.priceEntryCurrency && item.priceEntryAmount != null ? row(sourceLabel, sourceValue, { fontSize: "12px", labelColor: "#6b7280", valueColor: "#6b7280" }) : ""}${isTaxModelInvoice && item.taxAmount != null ? row(`${item.taxLabelSnapshot ?? copy.tax}${item.taxRateSnapshot != null ? ` (${Number(item.taxRateSnapshot).toFixed(2)}%)` : ""}`, `${data.currency} ${item.taxAmount}`, { fontSize: "12px", labelColor: "#6b7280", valueColor: "#6b7280" }) : ""}`;
  }).join("") ?? "";
  const paymentDetailsHtml = data.paymentDetails?.length
    ? `<div class="info-box finance-info-box" style="display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;margin-top:20px;overflow:visible;"><div class="info-box-header"><span>${copy.paymentDetails}</span></div>${data.paymentDetails.map(payment => {
      const received = `${escapeHtml(payment.currency ?? data.currency)} ${Number(payment.amount).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const fxAuditNote = payment.fxRateNote?.trim().replace(/^note\s*:\s*/i, "");
      const converted = payment.currency && payment.invoiceCurrency && payment.currency !== payment.invoiceCurrency && payment.convertedAmountInInvoiceCurrency != null
        ? `${financePaymentDetailRow(copy.convertedValue, `${escapeHtml(payment.invoiceCurrency)} ${Number(payment.convertedAmountInInvoiceCurrency).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, rtl)}${payment.conversionRateToInvoice ? financePaymentDetailRow(copy.directFx, escapeHtml(payment.conversionRateToInvoice), rtl) : ""}${payment.fxRateSource ? financePaymentDetailRow(copy.source, payment.fxRateSource === "manual" ? copy.manualFx : copy.systemFx, rtl) : ""}${fxAuditNote ? financePaymentDetailRow(copy.fxAuditNote, escapeHtml(fxAuditNote), rtl, { fullWidth: true }) : ""}`
        : "";
      const applied = payment.settledAmount != null && (payment.currency !== payment.invoiceCurrency || Math.abs(payment.amount - payment.settledAmount) > 0.005)
        ? financePaymentDetailRow(copy.appliedToInvoice, `${escapeHtml(payment.invoiceCurrency ?? data.currency)} ${Number(payment.settledAmount).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, rtl)
        : "";
      const credit = payment.patientCredits?.map(item => financePaymentDetailRow(copy.patientCreditCreated, `${escapeHtml(item.currency)} ${Number(item.amount).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${copy.nativeCurrency})`, rtl)).join("") ?? "";
      return `${financePaymentEmailRow(escapeHtml(payment.date), escapeHtml(formatFinancePaymentMethod(payment.method, resource.locale)), copy.amountReceived, received, `${converted}${applied}${credit}`, rtl)}`;
    }).join("")}</div>`
    : "";

  const title = data.isUpdate ? copy.invoiceUpdatedHeading : copy.invoiceHeading;
  const totalBalanceDueIncludingTax = data.totalBalanceDueIncludingTax ?? data.balanceDue;
  const dualBalanceDisclosure = data.shouldShowRemainingServiceAmountBeforeTax
    ? `${row(copy.remainingServiceAmountBeforeTax, `${data.currency} ${data.remainingServiceAmountBeforeTax ?? "0.00"}`, { labelColor: "#6b7280", valueColor: "#6b7280" })}<div style="margin:-4px 0 8px;font-size:11px;color:#6b7280;">${copy.remainingServiceAmountInfo}</div>${row(copy.totalBalanceDueIncludingTax, `${data.currency} ${totalBalanceDueIncludingTax}`, { total: true, valueColor: data.isFullySettled ? "#059669" : "#b45309" })}${data.isFullySettled ? row(copy.status, `${copy.paidInFull} ✓`, { labelColor: "#059669", valueColor: "#059669" }) : ""}`
    : (data.isFullySettled
      ? row(copy.status, `${copy.paidInFull} ✓`, { labelColor: "#059669", valueColor: "#059669" })
      : row(copy.balanceDue, `${data.currency} ${data.balanceDue}`, { total: true, valueColor: "#b45309" }));
  const subject = resource.locale === "ar"
    ? formatArabicFinanceSubject(data.isUpdate ? copy.invoiceUpdatedSubject : copy.invoiceIssuedSubject, data.invoiceNumber)
    : isolateRtlSubjectTokens(
      data.isUpdate
        ? `${copy.invoiceUpdatedHeading} — ${data.invoiceNumber} — Fertiliv`
        : formatFinanceCopy(copy.invoiceIssuedSubject, { invoiceNumber: data.invoiceNumber }),
      rtl,
    );
  const localizedFinanceWaButtonHtml = data.waLink
    ? `<div style="text-align:center;margin:24px 0;"><a href="${data.waLink}" target="_blank" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:50px;box-shadow:0 4px 12px rgba(37,211,102,0.35);">${copy.contactOnWhatsApp}</a></div>`
    : "";

  const waButtonHtml = data.waLink
    ? `<div style="text-align:center;margin:24px 0;">
        <a href="${data.waLink}" target="_blank" style="display:inline-flex;align-items:center;gap:10px;background:#25D366;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:50px;box-shadow:0 4px 12px rgba(37,211,102,0.35);">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#ffffff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Contact Us on WhatsApp
        </a>
      </div>`
    : "";

  return {
    subject,
    body: `
      <h2>${title}</h2>
      <p style="margin-bottom:16px;">${copy.greeting} <strong>${data.patientName}</strong>,<br/><br/>
      ${data.isUpdate
        ? copy.invoiceUpdatedIntro
        : copy.invoiceIssuedIntro}
      </p>
      <div class="info-box finance-info-box" style="display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;overflow:visible;">
        <div class="info-box-header"><span>${data.isUpdate ? copy.updatedInvoiceDetails : copy.invoiceDetails}</span></div>
        ${metadataEmailRow(copy.invoiceNumber, data.invoiceNumber, rtl, true)}
        ${data.issueDate ? metadataEmailRow(copy.issueDate, data.issueDate, rtl, true) : ""}
        ${data.dueDate ? metadataEmailRow(copy.dueDate, data.dueDate, rtl, true) : ""}
        ${itemsHtml}
        ${isTaxModelInvoice ? `${row(copy.serviceTotal, `${data.currency} ${data.serviceTotal ?? data.totalAmount}`)}${data.taxAmount && data.taxAmount !== "0.00" ? row(copy.serviceTax, `${data.currency} ${data.taxAmount}`) : ""}${row(copy.patientTotal, `${data.currency} ${data.totalAmount}`, { total: true })}` : row(copy.invoiceTotal, `${data.currency} ${data.totalAmount}`, { total: true })}
        ${data.netSettled && data.netSettled !== "0.00" ? row(copy.amountPaid, `− ${data.currency} ${data.netSettled}`, { labelColor: "#059669", valueColor: "#059669" }) : ""}
        ${dualBalanceDisclosure}
      </div>
      ${paymentDetailsHtml}
      ${data.isFullySettled ? "" : isMethodNeutralInvoice ? `<div style="display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 18px;font-size:13px;color:#374151;margin-bottom:20px;"><div style="font-weight:700;margin-bottom:8px;color:#1e0566;">${copy.paymentOptions}</div>${row(copy.cashCardBankTransfer, `${data.currency} ${data.balanceDue}`)}<div style="margin-top:10px;font-size:11px;color:#6b7280;">${copy.paymentOptionsNeutral}</div></div>` : data.legacyPaymentOptionAmount ? `<div style="display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 18px;font-size:13px;color:#374151;margin-bottom:20px;"><div style="font-weight:700;margin-bottom:8px;color:#1e0566;">${copy.paymentOptions}</div>${row(copy.cashPayment, `${data.currency} ${data.balanceDue}`)}${row(formatFinanceCopy(copy.cardBankTransferWithRate, { rate: data.cardSurchargePct ?? 23 }), `${data.currency} ${data.legacyPaymentOptionAmount}`, { valueColor: "#d97706" })}<div style="margin-top:10px;font-size:11px;color:#6b7280;">${formatFinanceCopy(copy.legacyPaymentOptionsExplanation, { rate: data.cardSurchargePct ?? 23 })}</div></div>` : ""}
      ${data.notes ? `<div style="background:#fff8f5;border-left:4px solid ${BRAND.peach};border-radius:4px;padding:12px 16px;font-size:13px;color:#5a4030;margin-bottom:20px;"><strong>${copy.note}:</strong> ${data.notes}</div>` : ""}
      <div style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:8px;padding:14px 18px;font-size:13px;color:#1e3a8a;margin-bottom:20px;line-height:1.7;">
        <strong>${copy.paymentMethods}:</strong> ${isMethodNeutralInvoice ? copy.paymentMethodsNeutral : formatFinanceCopy(copy.legacyPaymentOptionsExplanation, { rate: data.cardSurchargePct ?? 23 })}
      </div>
      ${localizedFinanceWaButtonHtml}
      <p style="font-size:14px;color:#4a3080;line-height:1.7;margin-bottom:20px;">${copy.contactCopy} <a href="mailto:info@fertiliv.com" style="color:${BRAND.darkPurple};font-weight:600;">${financeLtrSensitiveToken("info@fertiliv.com", rtl)}</a> ${copy.callPhoneConnector} <strong>${financeLtrPhoneToken("+90 501 114 70 60", rtl)}</strong>.</p>
      <p style="font-size:14px;">${copy.warmRegards},<br/><strong>${copy.team}</strong></p>
    `,
  };
}

function buildRefundEmail(data: RefundEmailData): { subject: string; body: string } {
  return {
    subject: `Refund Processed – Invoice #${data.invoiceNumber} – Fertiliv`,
    body: `
      <h2>Refund Processed</h2>
      <p style="margin-bottom:16px;">Dear <strong>${data.patientName}</strong>,<br/><br/>
      We confirm that a refund has been processed for your account. Please find the details below.
      </p>
      <div class="info-box">
        <div class="info-box-header"><span>Refund Details</span></div>
        <div class="info-row"><span class="info-label">Reference Invoice</span><span class="info-value">${data.invoiceNumber}</span></div>
        <div class="info-row"><span class="info-label">Refund Date</span><span class="info-value">${data.refundDate}</span></div>
        ${data.reason ? `<div class="info-row"><span class="info-label">Reason</span><span class="info-value">${data.reason}</span></div>` : ""}
        <div class="info-row info-row-total"><span class="info-label">Refund Amount</span><span class="info-value">${data.currency} ${data.refundAmount}</span></div>
      </div>
      <div style="background:#f0f8f0;border:1px solid #b8e0b8;border-radius:8px;padding:14px 18px;font-size:13px;color:#1a5c1a;margin-bottom:20px;line-height:1.7;">
        &#10003; &nbsp;Your refund has been processed. Please allow 3–7 business days for the amount to reflect in your account.
      </div>
      ${data.notes ? `<div style="background:#fff8f5;border-left:4px solid ${BRAND.lightPink};border-radius:4px;padding:12px 16px;font-size:13px;color:#5a4030;margin-bottom:20px;"><strong>Note:</strong> ${data.notes}</div>` : ""}
      <p style="font-size:14px;color:#4a3080;line-height:1.7;margin-bottom:20px;">If you have not received your refund within 7 business days or have any questions, please contact us at <a href="mailto:info@fertiliv.com" style="color:${BRAND.darkPurple};font-weight:600;">info@fertiliv.com</a> or call <strong>+90 501 114 70 60</strong>.</p>
      <p style="font-size:14px;">Warm regards,<br/><strong>The Fertiliv Team</strong></p>
    `,
  };
}

// ─── Template-mode sender ─────────────────────────────────────────────────────

async function sendWithTemplate(
  to: string,
  templateId: string,
  subject: string,
  variables: Record<string, string>
): Promise<boolean> {
  try {
    // Resend template API: pass variables as `params` (Resend's variable interpolation)
    const result = await (resend.emails.send as any)({
      from: FROM_EMAIL,
      to,
      subject,
      template_id: templateId,
      params: variables,
    });

    if (result.error) {
      console.error("[EmailService] Resend template error:", result.error);
      return false;
    }

    console.log(`[EmailService] Sent template "${templateId}" to ${to}`);
    return true;
  } catch (err) {
    console.error("[EmailService] Failed to send template email:", err);
    return false;
  }
}

// ─── Inline-mode sender ───────────────────────────────────────────────────────

async function sendInline({
  to,
  templateFn,
  data,
  preferredLanguage = "en",
  attachments,
}: {
  to: string;
  templateFn: (data: any) => { subject: string; body: string };
  data: any;
  preferredLanguage?: string;
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
}): Promise<boolean> {
  try {
    const clinic = await getClinicForEmail();
    const waLink = clinic?.whatsapp ? `https://wa.me/${clinic.whatsapp.replace(/\D/g, "")}` : undefined;
    const clinicOverride = clinic ? {
      name: clinic.nameEn ?? undefined,
      address: clinic.addressEn ?? undefined,
      phone: clinic.whatsapp ?? undefined,
      email: clinic.email ?? undefined,
      website: clinic.website ?? undefined,
      waLink,
    } : undefined;

    // Inject waLink into template data so templates can render a WhatsApp button
    const enrichedData = waLink ? { ...data, waLink } : data;
    let { subject, body } = templateFn(enrichedData);
    const isRTL = preferredLanguage === "ar";

    if (preferredLanguage !== "en") {
      const translated = await translateContent({ subject, body }, preferredLanguage);
      subject = translated.subject;
      body = translated.body;
    }

    const html = wrapEmail(body, isRTL, clinicOverride);

    const allAttachments = [...getEmailHeaderAttachments(), ...(attachments ?? [])];

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      attachments: allAttachments,
    } as any);

    if (result.error) {
      console.error("[EmailService] Resend inline error:", result.error);
      return false;
    }

    console.log(`[EmailService] Sent inline "${subject}" to ${to} (lang: ${preferredLanguage})`);
    return true;
  } catch (err) {
    console.error("[EmailService] Failed to send inline email:", err);
    return false;
  }
}

/**
 * Finance Phase A renders version-controlled Finance resources. Resend remains
 * the transport, but neither the generic AI translation path nor an optional
 * hosted template is permitted to bypass the resolved Finance locale.
 */
async function sendFinanceInline({
  to,
  templateFn,
  data,
  preferredLanguage = "en",
  attachments,
}: {
  to: string;
  templateFn: (data: any, language?: string) => { subject: string; body: string };
  data: any;
  preferredLanguage?: string;
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
}): Promise<boolean> {
  try {
    const locale = getFinanceCommunicationLocaleResource(preferredLanguage);
    const clinic = await getClinicForEmail();
    const waLink = clinic?.whatsapp ? `https://wa.me/${clinic.whatsapp.replace(/\D/g, "")}` : undefined;
    const clinicOverride = clinic ? {
      name: clinic.nameEn ?? undefined,
      address: clinic.addressEn ?? undefined,
      phone: clinic.whatsapp ?? undefined,
      email: clinic.email ?? undefined,
      website: clinic.website ?? undefined,
      waLink,
    } : undefined;
    const enrichedData = waLink ? { ...data, waLink } : data;
    const { subject, body } = templateFn(enrichedData, locale.locale);
    const html = wrapFinanceCommunicationEmail(body, locale.locale, clinicOverride);
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      attachments: [...getEmailHeaderAttachments(), ...(attachments ?? [])],
    } as any);
    if (result.error) {
      console.error("[EmailService] Finance inline error:", result.error);
      return false;
    }
    console.log(`[EmailService] Sent deterministic Finance email to ${to} (lang: ${locale.locale})`);
    return true;
  } catch (err) {
    console.error("[EmailService] Failed to send deterministic Finance email:", err);
    return false;
  }
}

function classifyAppointmentDetailsEmailFailure(statusCode?: number): Pick<AppointmentDetailsEmailResult, "failureClassification" | "failureCode"> {
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return { failureClassification: "recipient_rejected", failureCode: `provider_${statusCode}` };
  }
  if (statusCode && statusCode >= 500) {
    return { failureClassification: "provider_unavailable", failureCode: `provider_${statusCode}` };
  }
  return { failureClassification: "provider_error", failureCode: "provider_delivery_error" };
}

/**
 * Phase A sender: deliberately uses approved static EN/AR/TR templates only.
 * It never calls the automatic translation fallback and returns no email body.
 */
export async function sendAppointmentDetailsEmail(
  to: string,
  data: AppointmentDetailsEmailData,
  language: AppointmentDetailsLanguage,
): Promise<AppointmentDetailsEmailResult> {
  try {
    const deliveredLanguage = resolveAppointmentCommunicationLocale(language).deliveredLocale as AppointmentDetailsLanguage;
    const clinic = await getClinicForEmail();
    const localizedName = deliveredLanguage === "ar" ? clinic?.nameAr : deliveredLanguage === "tr" ? clinic?.nameTr : clinic?.nameEn;
    const localizedAddress = deliveredLanguage === "ar" ? clinic?.addressAr : deliveredLanguage === "tr" ? clinic?.addressTr : clinic?.addressEn;
    const waLink = safeWhatsAppLink(clinic?.whatsapp);
    const template = renderAppointmentDetailsEmail({ ...data, whatsAppLink: waLink }, deliveredLanguage);
    const html = wrapAppointmentCommunicationEmail(template.body, deliveredLanguage, {
      name: data.clinicName ?? localizedName ?? undefined,
      address: data.clinicAddress ?? localizedAddress ?? undefined,
      phone: clinic?.whatsapp ?? undefined,
      email: clinic?.email ?? undefined,
      website: clinic?.website ?? undefined,
      waLink,
    });
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: template.subject,
      html,
      attachments: getEmailHeaderAttachments(),
    } as any);
    if (result.error) {
      const statusCode = Number((result.error as any)?.statusCode);
      return { sent: false, ...classifyAppointmentDetailsEmailFailure(Number.isFinite(statusCode) ? statusCode : undefined) };
    }
    return {
      sent: true,
      providerMessageId: (result as any).data?.id ?? (result as any).id ?? undefined,
    };
  } catch (error) {
    const statusCode = Number((error as any)?.statusCode);
    return { sent: false, ...classifyAppointmentDetailsEmailFailure(Number.isFinite(statusCode) ? statusCode : undefined) };
  }
}

/**
 * Fixed Reminder Foundation V1 sender. It reuses the existing fixed
 * participant-safe appointment projection and locale wrapper. No LLM, email
 * body persistence, partner-recipient expansion, or calendar integration is
 * involved. The provider idempotency key remains stable across retries.
 */
export async function sendAppointmentReminderEmail(
  to: string,
  data: AppointmentDetailsEmailData,
  language: AppointmentDetailsLanguage,
  offsetMinutes: number,
  idempotencyKey: string,
): Promise<AppointmentDetailsEmailResult> {
  try {
    const deliveredLanguage = resolveAppointmentCommunicationLocale(language).deliveredLocale as AppointmentDetailsLanguage;
    const clinic = await getClinicForEmail();
    const localizedName = deliveredLanguage === "ar" ? clinic?.nameAr : deliveredLanguage === "tr" ? clinic?.nameTr : clinic?.nameEn;
    const localizedAddress = deliveredLanguage === "ar" ? clinic?.addressAr : deliveredLanguage === "tr" ? clinic?.addressTr : clinic?.addressEn;
    const waLink = safeWhatsAppLink(clinic?.whatsapp);
    const detailsTemplate = renderAppointmentDetailsEmail({ ...data, whatsAppLink: waLink, communicationKind: "details" }, deliveredLanguage);
    // The fixed locale registry owns all rendered text. Until each published
    // locale gains a dedicated reminder phrase, do not insert an English
    // reminder label into non-English emails. The scheduled offset is retained
    // in metadata/history, while the localized operational details are sent.
    void offsetMinutes;
    const html = wrapAppointmentCommunicationEmail(detailsTemplate.body, deliveredLanguage, {
      name: data.clinicName ?? localizedName ?? undefined,
      address: data.clinicAddress ?? localizedAddress ?? undefined,
      phone: clinic?.whatsapp ?? undefined,
      email: clinic?.email ?? undefined,
      website: clinic?.website ?? undefined,
      waLink,
    });
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: detailsTemplate.subject,
      html,
      attachments: getEmailHeaderAttachments(),
    } as any, { idempotencyKey } as any);
    if (result.error) {
      const statusCode = Number((result.error as any)?.statusCode);
      if ((result.error as any)?.name === "concurrent_idempotent_requests") return { sent: false, failureClassification: "provider_unavailable", failureCode: "concurrent_idempotent_requests" };
      if ((result.error as any)?.name === "invalid_idempotent_request") return { sent: false, failureClassification: "invalid_idempotent_request", failureCode: "invalid_idempotent_request" };
      return { sent: false, ...classifyAppointmentDetailsEmailFailure(Number.isFinite(statusCode) ? statusCode : undefined) };
    }
    return { sent: true, providerMessageId: (result as any).data?.id ?? (result as any).id ?? undefined };
  } catch (error) {
    const statusCode = Number((error as any)?.statusCode);
    return { sent: false, ...classifyAppointmentDetailsEmailFailure(Number.isFinite(statusCode) ? statusCode : undefined) };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendAppointmentConfirmedEmail(
  to: string,
  data: AppointmentEmailData,
  preferredLanguage = "en"
): Promise<boolean> {
  const templateId = TEMPLATE_IDS.appointmentConfirmed;
  if (templateId) {
    return sendWithTemplate(to, templateId, `Appointment Confirmed – ${data.appointmentDate}`, {
      patientName: data.patientName,
      appointmentDate: data.appointmentDate,
      appointmentTime: data.appointmentTime,
      doctorName: data.doctorName ?? "",
      appointmentType: data.appointmentType ?? "",
      clinicAddress: data.clinicAddress ?? "",
    });
  }
  return sendInline({ to, templateFn: buildAppointmentConfirmedEmail, data, preferredLanguage });
}

export async function sendAppointmentCreatedEmail(
  to: string,
  data: AppointmentEmailData,
  preferredLanguage = "en"
): Promise<boolean> {
  const templateId = TEMPLATE_IDS.appointmentCreated;
  if (templateId) {
    return sendWithTemplate(to, templateId, `Appointment Scheduled – ${data.appointmentDate}`, {
      patientName: data.patientName,
      appointmentDate: data.appointmentDate,
      appointmentTime: data.appointmentTime,
      doctorName: data.doctorName ?? "",
      appointmentType: data.appointmentType ?? "",
      clinicAddress: data.clinicAddress ?? "",
    });
  }
  return sendInline({ to, templateFn: buildAppointmentCreatedEmail, data, preferredLanguage });
}

export async function sendAppointmentCancelledEmail(
  to: string,
  data: AppointmentEmailData & { reason?: string },
  preferredLanguage = "en"
): Promise<boolean> {
  const templateId = TEMPLATE_IDS.appointmentCancelled;
  if (templateId) {
    return sendWithTemplate(to, templateId, `Appointment Cancelled – ${data.appointmentDate}`, {
      patientName: data.patientName,
      appointmentDate: data.appointmentDate,
      appointmentTime: data.appointmentTime,
      doctorName: data.doctorName ?? "",
      cancellationReason: data.reason ?? "No reason provided",
    });
  }
  return sendInline({ to, templateFn: buildAppointmentCancelledEmail, data, preferredLanguage });
}

export async function sendAppointmentRescheduledEmail(
  to: string,
  data: AppointmentEmailData & { oldDate: string; oldTime: string; isReactivation?: boolean },
  preferredLanguage = "en"
): Promise<boolean> {
  const templateId = TEMPLATE_IDS.appointmentRescheduled;
  const subject = data.isReactivation
    ? `Appointment Re-activated – ${data.appointmentDate}`
    : `Appointment Rescheduled – New Date: ${data.appointmentDate}`;
  if (templateId) {
    return sendWithTemplate(to, templateId, subject, {
      patientName: data.patientName,
      appointmentDate: data.appointmentDate,
      appointmentTime: data.appointmentTime,
      doctorName: data.doctorName ?? "",
      clinicAddress: data.clinicAddress ?? "",
      oldDate: data.oldDate,
      oldTime: data.oldTime,
    });
  }
  return sendInline({ to, templateFn: buildAppointmentRescheduledEmail, data, preferredLanguage });
}

export async function sendInvoiceEmail(
  to: string,
  data: InvoiceEmailData,
  preferredLanguage = "en",
  pdfBuffer?: Buffer,
  externalReceiptBuffer?: Buffer
): Promise<boolean> {
  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
  if (pdfBuffer) attachments.push({ filename: `Invoice-${data.invoiceNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" });
  if (externalReceiptBuffer) attachments.push({ filename: `Receipt-${data.invoiceNumber}.pdf`, content: externalReceiptBuffer, contentType: "application/pdf" });
  return sendFinanceInline({ to, templateFn: buildInvoiceEmail, data, preferredLanguage, attachments: attachments.length > 0 ? attachments : undefined });
}

// ─── Official Receipt Email ──────────────────────────────────────────────────

export interface ReceiptEmailData {
  patientName: string;
  receiptNumber: string;
  invoiceNumber: string;
  invoiceCurrency: string;
  taxModelVersion?: string | null;
  serviceTotal?: string;
  taxAmount?: string;
  pricingMode?: string | null;
  invoiceDiscountAmount?: string;
  invoiceDiscountPercent?: string;
  finalAgreedAmount?: string | null;
  invoiceTotal: string;
  totalSettled: string;
  balanceDue: string;
  includedPayments: Array<{
    paymentDate: string;
    method: string;
    amount: string;
    currency: string;
    appliedToInvoice?: string;
    patientCredits?: Array<{ currency: string; amount: string }>;
  }>
  receiptNote?: string;
  /** Injected only by the Finance sender from the canonical clinic WhatsApp setting. */
  waLink?: string;
}

export function buildReceiptEmail(data: ReceiptEmailData, requestedLanguage = "en"): { subject: string; body: string } {
  const resource = getFinanceCommunicationLocaleResource(requestedLanguage);
  const copy = resource.copy;
  const rtl = resource.direction === "rtl";
  const row = (label: string, value: string, options: Omit<Parameters<typeof financialEmailRow>[2], "rtl"> = {}) => financialEmailRow(label, value, { ...options, rtl });
  const paymentsHtml = data.includedPayments.map(payment =>
    financePaymentEmailRow(
      payment.paymentDate,
      formatFinancePaymentMethod(payment.method, resource.locale),
      copy.amountReceived,
      `${payment.currency} ${payment.amount}`,
      `${payment.appliedToInvoice ? `<br/><small>${copy.appliedToInvoice}: ${payment.appliedToInvoice}</small>` : ""}${payment.patientCredits?.length ? payment.patientCredits.map(credit => `<br/><small>${copy.patientCreditCreated}: ${credit.currency} ${credit.amount} (${copy.nativeCurrency})</small>`).join("") : ""}`,
      rtl,
    )
  ).join("");
  const fullySettled = Number(data.balanceDue.replace(/,/g, "")) <= 0.01;
  const isTaxModelInvoice = data.taxModelVersion === "line_tax_v1";
  const savedCommercialAdjustment = Number(data.invoiceDiscountAmount?.replace(/,/g, "") ?? "0");
  const commercialAdjustmentHtml = isTaxModelInvoice && savedCommercialAdjustment > 0.005
    ? row(
      data.pricingMode === "agreed"
        ? copy.finalAgreedServicePriceAdjustment
        : data.invoiceDiscountPercent && Number(data.invoiceDiscountPercent) > 0
          ? formatFinanceCopy(copy.discountWithRate, { rate: Number(data.invoiceDiscountPercent).toFixed(2) })
          : copy.discount,
      `− ${data.invoiceCurrency} ${data.invoiceDiscountAmount}`,
    )
    : "";
  const invoiceSummaryHtml = isTaxModelInvoice
    ? `${commercialAdjustmentHtml}${row(copy.serviceTotal, `${data.invoiceCurrency} ${data.serviceTotal ?? data.invoiceTotal}`)}${row(copy.serviceTax, `${data.invoiceCurrency} ${data.taxAmount ?? "0.00"}`)}${row(copy.invoiceTotal, `${data.invoiceCurrency} ${data.invoiceTotal}`, { total: true })}`
    : row(copy.invoiceTotal, `${data.invoiceCurrency} ${data.invoiceTotal}`, { total: true });
  const whatsappButtonHtml = data.waLink
    ? `<div style="text-align:center;margin:24px 0;"><a href="${data.waLink}" target="_blank" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:50px;box-shadow:0 4px 12px rgba(37,211,102,0.35);">${copy.contactOnWhatsApp}</a></div>`
    : "";

  return {
    subject: resource.locale === "ar"
      ? formatArabicFinanceSubject(copy.receiptSubject, data.receiptNumber)
      : isolateRtlSubjectTokens(formatFinanceCopy(copy.receiptSubject, { receiptNumber: data.receiptNumber }), rtl),
    body: `
      <h2>${copy.receiptHeading}</h2>
      <p style="margin-bottom:16px;">${copy.greeting} <strong>${data.patientName}</strong>,<br/><br/>
      ${formatFinanceCopy(copy.receiptIntro, { invoiceNumber: data.invoiceNumber })}
      </p>
      <div class="info-box">
        <div class="info-box-header"><span>${copy.receiptDetails}</span></div>
        ${metadataEmailRow(copy.receiptNumber, data.receiptNumber, rtl)}
        ${metadataEmailRow(copy.invoiceReference, data.invoiceNumber, rtl)}
        ${invoiceSummaryHtml}
        ${row(copy.totalSettled, `${data.invoiceCurrency} ${data.totalSettled}`, { total: true })}
        ${row(copy.balanceDue, `${data.invoiceCurrency} ${data.balanceDue}`, { total: true })}
        <div class="info-box-header" style="margin-top:16px;"><span>${copy.paymentsIncluded}</span></div>
        ${paymentsHtml}
      </div>
      ${data.receiptNote ? `<div style="background:#f0fdf4;border-left:4px solid #6ee7b7;border-radius:4px;padding:12px 16px;font-size:13px;color:#065f46;margin-bottom:20px;"><strong>${copy.note}:</strong> ${data.receiptNote}</div>` : ""}
      <div style="background:#f0fdf4;border:1px solid #6ee7b7;border-radius:8px;padding:14px 18px;font-size:13px;color:#065f46;margin-bottom:20px;line-height:1.7;">
        &#10003; &nbsp;${fullySettled ? copy.receiptPaidInFull : copy.receiptPartiallyPaid} ${copy.receiptRetain}
      </div>
      ${whatsappButtonHtml}
      <p style="font-size:14px;color:#4a3080;line-height:1.7;margin-bottom:20px;">${copy.contactCopy} <a href="mailto:info@fertiliv.com" style="color:#1e0566;font-weight:600;">${financeLtrSensitiveToken("info@fertiliv.com", rtl)}</a> ${copy.callPhoneConnector} <strong>${financeLtrPhoneToken("+90 501 114 70 60", rtl)}</strong>.</p>
      <p style="font-size:14px;">${copy.warmRegards},<br/><strong>${copy.team}</strong></p>
    `,
  };
}

export async function sendReceiptEmailDirect(
  to: string,
  data: ReceiptEmailData,
  preferredLanguage = "en",
  pdfBuffer?: Buffer,
  extraAttachmentBuffer?: Buffer,
  extraAttachmentName?: string
): Promise<boolean> {
  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
  if (pdfBuffer) attachments.push({ filename: `Receipt-${data.receiptNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" });
  if (extraAttachmentBuffer && extraAttachmentName) attachments.push({ filename: extraAttachmentName, content: extraAttachmentBuffer, contentType: "application/pdf" });
  return sendFinanceInline({ to, templateFn: buildReceiptEmail, data, preferredLanguage, attachments: attachments.length > 0 ? attachments : undefined });
}

export async function sendRefundEmail(
  to: string,
  data: RefundEmailData,
  preferredLanguage = "en",
  pdfBuffer?: Buffer
): Promise<boolean> {
  const attachments = pdfBuffer
    ? [{ filename: `Refund-${data.invoiceNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" }]
    : undefined;

  const templateId = TEMPLATE_IDS.refundReceipt;
  if (templateId) {
    return sendWithTemplate(to, templateId, `Refund Processed – Invoice #${data.invoiceNumber} – Fertiliv`, {
      patientName: data.patientName,
      invoiceNumber: data.invoiceNumber,
      refundAmount: data.refundAmount,
      currency: data.currency,
      refundDate: data.refundDate,
      reason: data.reason ?? "",
      notes: data.notes ?? "",
    });
  }
  return sendInline({ to, templateFn: buildRefundEmail, data, preferredLanguage, attachments });
}

// ─── Proposal Email ───────────────────────────────────────────────────────────

export interface ProposalEmailData {
  proposalCode: string;
  patientName: string;
  totalAmount: string;
  currency: string;
  issueDate?: string;
  notes?: string;
  items?: Array<{ name: string }>;
  isUpdate?: boolean;
  cardSurchargePct?: number;
  cardTotal?: string;
  waLink?: string;
}
function buildProposalEmail(data: ProposalEmailData): { subject: string; body: string } {
  const itemsHtml = data.items && data.items.length > 0
    ? data.items.map(i => `<div class="info-row"><span class="info-label">${i.name}</span></div>`).join("")
    : "";
  const title = data.isUpdate ? "Updated Treatment Proposal" : "Treatment Proposal";
  const intro = data.isUpdate
    ? `Your treatment proposal <strong>${data.proposalCode}</strong> has been updated. Please find the revised proposal attached.`
    : `Thank you for choosing Fertiliv. Please find your personalised treatment proposal attached.`;

  const waButtonHtml = data.waLink
    ? `<div style="text-align:center;margin:24px 0;">
        <a href="${data.waLink}" target="_blank" style="display:inline-flex;align-items:center;gap:10px;background:#25D366;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:50px;box-shadow:0 4px 12px rgba(37,211,102,0.35);">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#ffffff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Contact Us on WhatsApp
        </a>
      </div>`
    : "";

  return {
    subject: data.isUpdate ? `Updated Proposal ${data.proposalCode} – Fertiliv` : `Treatment Proposal ${data.proposalCode} – Fertiliv`,
    body: `
      <h2>${title}</h2>
      <p style="margin-bottom:16px;">Dear <strong>${data.patientName}</strong>,<br/><br/>
      ${intro}
      </p>
      <div class="info-box">
        <div class="info-box-header"><span>Proposal Details</span></div>
        <div class="info-row"><span class="info-label">Proposal Number</span><span class="info-value">${data.proposalCode}</span></div>
        ${data.issueDate ? `<div class="info-row"><span class="info-label">Date</span><span class="info-value">${data.issueDate}</span></div>` : ""}
        ${itemsHtml}
        <div class="info-row info-row-total"><span class="info-label">Total Amount</span><span class="info-value">${data.currency} ${data.totalAmount}</span></div>
        ${data.cardTotal ? `<div class="info-row"><span class="info-label" style="color:#6b7280;">Cash Total</span><span class="info-value" style="color:#1e0566;">${data.currency} ${data.totalAmount}</span></div><div class="info-row"><span class="info-label" style="color:#6b7280;">Card / Bank Transfer (+${data.cardSurchargePct ?? 23}%)</span><span class="info-value" style="color:#1e0566;">${data.currency} ${data.cardTotal}</span></div>` : ""}
      </div>
      ${data.notes ? `<div style="background:#fff8f5;border-left:4px solid #f9a8d4;border-radius:4px;padding:12px 16px;font-size:13px;color:#5a4030;margin-bottom:20px;"><strong>Note:</strong> ${data.notes}</div>` : ""}
      <div style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:8px;padding:14px 18px;font-size:13px;color:#1e3a8a;margin-bottom:20px;line-height:1.7;">
        <strong>Payment Methods:</strong> Cash is accepted as the standard payment method. For card or bank transfer payments, kindly use the &ldquo;Card / Bank Transfer Total (+${data.cardSurchargePct ?? 23}%)&rdquo; amount shown on the invoice. After payment, please share the receipt via the provided WhatsApp number or email.
      </div>
      ${waButtonHtml}
      <p style="font-size:14px;color:#4a3080;line-height:1.7;margin-bottom:20px;">This proposal is valid for 30 days. For any queries, please contact us at <a href="mailto:info@fertiliv.com" style="color:#4a3080;font-weight:600;">info@fertiliv.com</a> or call <strong>+90 501 114 70 60</strong>.</p>
      <p style="font-size:14px;">Warm regards,<br/><strong>The Fertiliv Team</strong></p>
    `,
  };
}

export async function sendProposalEmail(
  to: string,
  data: ProposalEmailData,
  preferredLanguage = "en",
  pdfBuffer?: Buffer
): Promise<boolean> {
  const attachments = pdfBuffer
    ? [{ filename: `Proposal-${data.proposalCode}.pdf`, content: pdfBuffer, contentType: "application/pdf" }]
    : undefined;
  return sendInline({ to, templateFn: buildProposalEmail, data, preferredLanguage, attachments });
}

// ─── Doctor Case Assignment Notification ─────────────────────────────────────
interface DoctorCaseAssignmentData {
  doctorName: string;
  caseName: string;
  caseType: "lead" | "patient";
  caseId: number;
  assignedBy: string;
  appUrl: string;
}

function buildDoctorCaseAssignmentEmail(data: DoctorCaseAssignmentData) {
  const caseLabel = data.caseType === "patient" ? "Patient" : "Lead";
  const caseUrl = `${data.appUrl}/${data.caseType === "patient" ? "patients" : "leads"}/${data.caseId}`;
  return {
    subject: `New Case Assigned: ${data.caseName} – Fertiliv`,
    body: `
      <h2>New Case Assigned to You</h2>
      <p style="margin-bottom:16px;">Dear <strong>Dr. ${data.doctorName}</strong>,<br/><br/>
      A new ${caseLabel.toLowerCase()} case has been assigned to you by <strong>${data.assignedBy}</strong>. Please review the case details and prepare your treatment plan.
      </p>
      <div class="info-box">
        <div class="info-box-header"><span>Case Details</span></div>
        <div class="info-row"><span class="info-label">Name</span><span class="info-value">${data.caseName}</span></div>
        <div class="info-row"><span class="info-label">Case Type</span><span class="info-value">${caseLabel}</span></div>
        <div class="info-row"><span class="info-label">Assigned By</span><span class="info-value">${data.assignedBy}</span></div>
      </div>
      <p style="margin-top:20px;">
        <a href="${caseUrl}" style="display:inline-block;background:#1E0566;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">View Case &rarr;</a>
      </p>
      <p style="font-size:14px;color:#4a3080;margin-top:20px;">You can also access this case from the <strong>My Cases</strong> section in your Fertiliv dashboard.</p>
      <p style="font-size:14px;">Warm regards,<br/><strong>The Fertiliv Team</strong></p>
    `,
  };
}

export async function sendDoctorCaseAssignmentEmail(
  to: string,
  data: DoctorCaseAssignmentData
): Promise<boolean> {
  return sendInline({ to, templateFn: buildDoctorCaseAssignmentEmail, data });
}

// ─── External Report Email ────────────────────────────────────────────────────

export interface ExternalReportEmailData {
  patientName: string;
  reportRef: string;
  reportType: string;
  reportDate: string;
  sourceOrganization?: string;
}

function buildExternalReportEmail(data: ExternalReportEmailData): { subject: string; body: string } {
  return {
    subject: `Medical Report – ${data.reportType} – Fertiliv IVF Center`,
    body: `
      <div class="section">
        <p>Dear ${data.patientName},</p>
        <p>Please find attached your medical report processed by Fertiliv IVF Center.</p>
      </div>
      <div class="section">
        <div class="info-row"><span class="info-label">Report Reference</span><span class="info-value">${data.reportRef}</span></div>
        <div class="info-row"><span class="info-label">Report Type</span><span class="info-value">${data.reportType}</span></div>
        <div class="info-row"><span class="info-label">Report Date</span><span class="info-value">${data.reportDate}</span></div>
        ${data.sourceOrganization ? `<div class="info-row"><span class="info-label">Source</span><span class="info-value">${data.sourceOrganization}</span></div>` : ""}
      </div>
      <div class="section">
        <p style="font-size:12px;color:#6b7280;">This report has been translated and formatted by Fertiliv IVF Center using AI-assisted technology for patient communication purposes.</p>
      </div>
    `,
  };
}

export async function sendExternalReportEmail(
  to: string,
  data: ExternalReportEmailData,
  pdfBuffer?: Buffer,
  originalAttachmentBuffer?: Buffer,
  originalAttachmentName?: string
): Promise<boolean> {
  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
  if (pdfBuffer) attachments.push({ filename: `${data.reportRef}.pdf`, content: pdfBuffer, contentType: "application/pdf" });
  if (originalAttachmentBuffer && originalAttachmentName) {
    attachments.push({ filename: originalAttachmentName, content: originalAttachmentBuffer, contentType: "application/octet-stream" });
  }
  return sendInline({ to, templateFn: buildExternalReportEmail, data, attachments: attachments.length > 0 ? attachments : undefined });
}
