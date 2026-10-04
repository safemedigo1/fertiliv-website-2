import { effectiveAppointmentEnd } from "./appointmentScheduling";
import { resolvePhysicalAppointmentLocation } from "./appointmentPhysicalLocation";
import { getAppointmentCommunicationLocaleResource, resolveAppointmentCommunicationLocale } from "./appointmentCommunicationLocales";

export type AppointmentCommunicationLanguage = string;
export type AppointmentCommunicationKind = "details" | "confirmation" | "cancellation";

export function isManualAppointmentCommunicationStatus(status?: string | null): boolean {
  return status === "upcoming" || status === "confirmed" || status === "rescheduled" || status === "cancelled";
}

export function communicationKindForAppointmentStatus(status?: string | null): AppointmentCommunicationKind {
  if (status === "confirmed") return "confirmation";
  if (status === "cancelled") return "cancellation";
  return "details";
}

export function appointmentCommunicationActionLabel(status?: string | null): string | null {
  if (!isManualAppointmentCommunicationStatus(status)) return null;
  if (status === "confirmed") return "Send Confirmation";
  if (status === "cancelled") return "Send Cancellation Notice";
  return "Send Details";
}

export type AppointmentCommunicationProjectionInput = {
  recipientName?: string | null;
  appointment: {
    appointmentDate: Date;
    endDate?: Date | null;
    duration?: number | null;
    type?: string | null;
    appointmentType?: string | null;
    status?: string | null;
    meetingLink?: string | null;
    partnerClinicId?: number | null;
    externalLocation?: string | null;
  };
  partnerClinic?: { name: string; address?: string | null; googleMapsUrl?: string | null } | null;
  clinic?: {
    nameEn?: string | null;
    nameAr?: string | null;
    nameTr?: string | null;
    addressEn?: string | null;
    addressAr?: string | null;
    addressTr?: string | null;
    mapsLink?: string | null;
  } | null;
};

export type AppointmentCommunicationProjection = {
  recipientName?: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  operationalLabel: string;
  modeLabel: string;
  communicationKind: AppointmentCommunicationKind;
  locationLabel?: string;
  mapLink?: string;
  meetingLink?: string;
  clinicName?: string;
  clinicAddress?: string;
};

const legacyCopyByLanguage: Record<string, {
  operationalLabels: Record<string, string>;
  modeLabels: Record<string, string>;
}> = {
  en: {
    operationalLabels: {
      consultation: "Consultation",
      follow_up: "Follow-up appointment",
      procedure: "Procedure appointment",
      lab: "Laboratory appointment",
      radiology: "Imaging appointment",
      other: "Appointment",
    },
    modeLabels: { "in-clinic": "In-clinic", online: "Online", external: "External" },
  },
  ar: {
    operationalLabels: {
      consultation: "استشارة",
      follow_up: "موعد متابعة",
      procedure: "موعد إجراء",
      lab: "موعد مختبر",
      radiology: "موعد تصوير",
      other: "موعد",
    },
    modeLabels: { "in-clinic": "في العيادة", online: "عبر الإنترنت", external: "خارجي" },
  },
  tr: {
    operationalLabels: {
      consultation: "Konsültasyon",
      follow_up: "Takip randevusu",
      procedure: "İşlem randevusu",
      lab: "Laboratuvar randevusu",
      radiology: "Görüntüleme randevusu",
      other: "Randevu",
    },
    modeLabels: { "in-clinic": "Klinikte", online: "Çevrim içi", external: "Harici" },
  },
};

export function formatAppointmentDateTimeInIstanbul(
  date: Date,
  language: AppointmentCommunicationLanguage,
): { date: string; time: string } {
  const locale = getAppointmentCommunicationLocaleResource(language).intlLocale;
  return {
    date: new Intl.DateTimeFormat(locale, {
      timeZone: "Europe/Istanbul", day: "2-digit", month: "long", year: "numeric",
    }).format(date),
    time: new Intl.DateTimeFormat(locale, {
      timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hour12: language === "en",
    }).format(date),
  };
}

function localizedClinicValue(
  clinic: AppointmentCommunicationProjectionInput["clinic"],
  language: AppointmentCommunicationLanguage,
  kind: "name" | "address",
): string | undefined {
  if (!clinic) return undefined;
  const value = language === "ar"
    ? kind === "name" ? clinic.nameAr : clinic.addressAr
    : language === "tr"
      ? kind === "name" ? clinic.nameTr : clinic.addressTr
      : kind === "name" ? clinic.nameEn : clinic.addressEn;
  return value?.trim() || undefined;
}

function safeHttpUrl(value?: string | null): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A privacy boundary for Phase A. It intentionally does not accept title, notes,
 * diagnosis, cancellation reason, finance, MRN, passport, provider, or CRM data.
 */
export function buildAppointmentCommunicationProjection(
  input: AppointmentCommunicationProjectionInput,
  language: AppointmentCommunicationLanguage,
): AppointmentCommunicationProjection {
  const resource = getAppointmentCommunicationLocaleResource(language);
  const copy = resource.copy;
  const appointmentType = input.appointment.appointmentType ?? "in-clinic";
  const communicationKind = communicationKindForAppointmentStatus(input.appointment.status);
  const appointmentDate = new Date(input.appointment.appointmentDate);
  const endDate = effectiveAppointmentEnd({
    appointmentDate,
    endDate: input.appointment.endDate,
    duration: input.appointment.duration,
  });
  const clinicName = localizedClinicValue(input.clinic, language, "name");
  const clinicAddress = localizedClinicValue(input.clinic, language, "address");
  const locationLabel = resolvePhysicalAppointmentLocation({
    appointmentType,
    externalLocation: input.appointment.externalLocation,
    partnerClinicId: input.appointment.partnerClinicId,
    partnerClinicName: input.partnerClinic?.name,
    partnerClinicAddress: input.partnerClinic?.address,
    clinicName,
    clinicAddress,
  });

  return {
    recipientName: input.recipientName?.trim() || undefined,
    appointmentDate: formatAppointmentDateTimeInIstanbul(appointmentDate, language).date,
    startTime: formatAppointmentDateTimeInIstanbul(appointmentDate, language).time,
    endTime: formatAppointmentDateTimeInIstanbul(endDate, language).time,
    operationalLabel: copy[`operational_${(input.appointment.type ?? "other").replace("-", "_")}` as keyof typeof copy] ?? copy.operational_other,
    modeLabel: copy[`mode_${appointmentType.replace("-", "_")}` as keyof typeof copy] ?? copy.mode_in_clinic,
    communicationKind,
    locationLabel: locationLabel ?? undefined,
    mapLink: appointmentType === "in-clinic"
      ? safeHttpUrl(input.clinic?.mapsLink)
      : appointmentType === "external"
        ? safeHttpUrl(input.partnerClinic?.googleMapsUrl)
        : undefined,
    meetingLink: appointmentType === "online" ? safeHttpUrl(input.appointment.meetingLink) : undefined,
    clinicName,
    clinicAddress,
  };
}
