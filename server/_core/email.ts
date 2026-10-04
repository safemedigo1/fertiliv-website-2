/**
 * Fertiliv — Resend Email Helper
 * All outbound transactional emails go through this module.
 * Sender address uses Resend's shared onboarding domain until a custom
 * domain is verified in the Resend dashboard.
 */
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Sender address using the verified fertiliv.com domain
const FROM_ADDRESS = "Fertiliv IVF Center <info@fertiliv.com>";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppointmentEmailData {
  patientName: string;
  patientEmail: string;
  doctorName: string;
  appointmentDate: string; // e.g. "Tuesday, 15 April 2025"
  appointmentTime: string; // e.g. "10:00 AM"
  appointmentType: "in_person" | "online";
  meetingLink?: string;
  clinicName?: string;
}

export interface CancellationEmailData {
  patientName: string;
  patientEmail: string;
  appointmentDate: string;
  appointmentTime: string;
  cancellationReason: string;
  clinicName?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Send appointment confirmation email to patient.
 */
export async function sendAppointmentConfirmation(data: AppointmentEmailData): Promise<boolean> {
  const clinic = data.clinicName ?? "Fertiliv Clinic";
  const typeLabel = data.appointmentType === "online" ? "Online Consultation" : "In-Person Visit";

  const meetingSection = data.appointmentType === "online" && data.meetingLink
    ? `<p style="margin:12px 0"><strong>Meeting Link:</strong> <a href="${data.meetingLink}">${data.meetingLink}</a></p>`
    : "";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
      <h2 style="color:#2563eb;margin-top:0">${clinic}</h2>
      <h3 style="color:#111827">Appointment Confirmed ✓</h3>
      <p>Dear <strong>${data.patientName}</strong>,</p>
      <p>Your appointment has been confirmed. Here are the details:</p>
      <div style="background:#f9fafb;padding:16px;border-radius:6px;margin:16px 0">
        <p style="margin:8px 0"><strong>Date:</strong> ${data.appointmentDate}</p>
        <p style="margin:8px 0"><strong>Time:</strong> ${data.appointmentTime}</p>
        <p style="margin:8px 0"><strong>Doctor:</strong> ${data.doctorName}</p>
        <p style="margin:8px 0"><strong>Type:</strong> ${typeLabel}</p>
        ${meetingSection}
      </div>
      <p style="color:#6b7280;font-size:14px">If you need to reschedule or cancel, please contact the clinic as soon as possible.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
      <p style="color:#9ca3af;font-size:12px;margin:0">${clinic} — This is an automated message, please do not reply.</p>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: data.patientEmail,
      subject: `Appointment Confirmed — ${data.appointmentDate} at ${data.appointmentTime}`,
      html,
    });
    return !result.error;
  } catch {
    return false;
  }
}

/**
 * Send appointment cancellation email to patient.
 */
export async function sendAppointmentCancellation(data: CancellationEmailData): Promise<boolean> {
  const clinic = data.clinicName ?? "Fertiliv Clinic";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
      <h2 style="color:#2563eb;margin-top:0">${clinic}</h2>
      <h3 style="color:#dc2626">Appointment Cancelled</h3>
      <p>Dear <strong>${data.patientName}</strong>,</p>
      <p>We regret to inform you that your appointment has been cancelled.</p>
      <div style="background:#fef2f2;padding:16px;border-radius:6px;margin:16px 0;border-left:4px solid #dc2626">
        <p style="margin:8px 0"><strong>Date:</strong> ${data.appointmentDate}</p>
        <p style="margin:8px 0"><strong>Time:</strong> ${data.appointmentTime}</p>
        <p style="margin:8px 0"><strong>Reason:</strong> ${data.cancellationReason}</p>
      </div>
      <p>Please contact us to reschedule your appointment at your earliest convenience.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
      <p style="color:#9ca3af;font-size:12px;margin:0">${clinic} — This is an automated message, please do not reply.</p>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: data.patientEmail,
      subject: `Appointment Cancelled — ${data.appointmentDate}`,
      html,
    });
    return !result.error;
  } catch {
    return false;
  }
}

/**
 * Notify the clinic team about a new intake submission.
 */
export async function sendNewIntakeNotification(lead: {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  gender?: string | null;
  mainMedicalInterest?: string | null;
  brand?: string | null;
  leadCode?: string;
}): Promise<boolean> {
  const recipientEmail = process.env.OWNER_EMAIL || "info@fertiliv.com";
  const interest = lead.mainMedicalInterest?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) ?? "Not specified";
  const brand = lead.brand ?? "fertiliv";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 24px; border-radius: 8px;">
      <div style="background: #1a1464; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px;">New Intake Submission</h1>
        <p style="color: #a0a8d0; margin: 4px 0 0; font-size: 13px;">A new lead has submitted the public intake form</p>
      </div>
      <div style="background: #ffffff; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 13px; width: 140px;">Name</td>
            <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${lead.firstName} ${lead.lastName}</td>
          </tr>
          <tr style="border-top: 1px solid #f3f4f6;">
            <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Phone</td>
            <td style="padding: 8px 0; color: #111827; font-size: 14px;">${lead.phone}</td>
          </tr>
          ${lead.email ? `
          <tr style="border-top: 1px solid #f3f4f6;">
            <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Email</td>
            <td style="padding: 8px 0; color: #111827; font-size: 14px;">${lead.email}</td>
          </tr>` : ""}
          <tr style="border-top: 1px solid #f3f4f6;">
            <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Gender</td>
            <td style="padding: 8px 0; color: #111827; font-size: 14px; text-transform: capitalize;">${lead.gender ?? "—"}</td>
          </tr>
          <tr style="border-top: 1px solid #f3f4f6;">
            <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Medical Interest</td>
            <td style="padding: 8px 0; color: #111827; font-size: 14px;">${interest}</td>
          </tr>
          <tr style="border-top: 1px solid #f3f4f6;">
            <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Brand</td>
            <td style="padding: 8px 0; color: #111827; font-size: 14px; text-transform: capitalize;">${brand}</td>
          </tr>
          ${lead.leadCode ? `
          <tr style="border-top: 1px solid #f3f4f6;">
            <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Lead Code</td>
            <td style="padding: 8px 0; color: #111827; font-size: 14px; font-family: monospace;">${lead.leadCode}</td>
          </tr>` : ""}
        </table>
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
          <a href="https://pro.fertiliv.com" style="background: #1a1464; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600;">
            View in CRM &rarr;
          </a>
        </div>
      </div>
      <p style="text-align: center; color: #9ca3af; font-size: 11px; margin-top: 16px;">
        Fertiliv IVF Center &middot; info@fertiliv.com
      </p>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: recipientEmail,
      subject: `New Intake: ${lead.firstName} ${lead.lastName} — ${interest}`,
      html,
      replyTo: lead.email ?? undefined,
    });
    return !result.error;
  } catch {
    return false;
  }
}

/**
 * Lightweight API key validation — attempts to send a test email.
 * A 'restricted_api_key' error still means the key IS valid (just scoped to send-only).
 * Returns true if the key is valid, false if it is missing or rejected.
 */
export async function validateResendApiKey(): Promise<boolean> {
  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: "test@resend.dev", // Resend's sink address — never actually delivered
      subject: "API Key Validation",
      html: "<p>test</p>",
    });
    // If we get an error object back, check if it's a domain/permission error
    // (which still means the key itself is valid) vs an auth error (invalid key)
    if (result.error) {
      const name = (result.error as { name?: string }).name ?? "";
      // These errors mean the key IS valid but has domain/permission restrictions
      const validKeyErrors = ["restricted_api_key", "validation_error", "missing_required_field"];
      return validKeyErrors.some(e => name.includes(e));
    }
    return true;
  } catch {
    return false;
  }
}
