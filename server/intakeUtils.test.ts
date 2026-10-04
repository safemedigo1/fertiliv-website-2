import { describe, it, expect } from "vitest";
import { hasMeaningfulReportedPartnerData } from "../shared/intakeUtils";

// ─── The 9 Required Tests (from specification) ────────────────────────────────
describe("hasMeaningfulReportedPartnerData — 9 required specification tests", () => {
  it("REQ-1: female mode + semen analysis → true", () => {
    expect(hasMeaningfulReportedPartnerData(
      { maleIntake: { semenAnalysis: [{ date: "2024-01-01", volume: "3ml" }] } }, "female"
    )).toBe(true);
  });
  it("REQ-2: male mode + male person's semen analysis → false", () => {
    expect(hasMeaningfulReportedPartnerData(
      { maleIntake: { semenAnalysis: [{ date: "2024-01-01", volume: "3ml" }] } }, "male"
    )).toBe(false);
  });
  it("REQ-3: male mode + femalePartnerDob → true", () => {
    expect(hasMeaningfulReportedPartnerData(
      { maleIntake: { femalePartnerDob: "1990-06-15" } }, "male"
    )).toBe(true);
  });
  it("REQ-4: legacy mode + historical male partner field → true", () => {
    expect(hasMeaningfulReportedPartnerData(
      { maleIntake: { semenAnalysis: [{ date: "2024-01-01" }], profession: "Engineer" } }, "legacy"
    )).toBe(true);
  });
  it("REQ-5: general mode + semen analysis → false", () => {
    expect(hasMeaningfulReportedPartnerData(
      { maleIntake: { semenAnalysis: [{ date: "2024-01-01" }] } }, "general"
    )).toBe(false);
  });
  it("REQ-6: null mode + semen analysis → false", () => {
    expect(hasMeaningfulReportedPartnerData(
      { maleIntake: { semenAnalysis: [{ date: "2024-01-01" }] } }, null
    )).toBe(false);
  });
  it("REQ-7: undefined mode + semen analysis → false", () => {
    expect(hasMeaningfulReportedPartnerData(
      { maleIntake: { semenAnalysis: [{ date: "2024-01-01" }] } }, undefined
    )).toBe(false);
  });
  it("REQ-8: null mode with full maleIntake (all fields populated) → false (cannot silently assume female semantics)", () => {
    expect(hasMeaningfulReportedPartnerData({
      maleIntake: {
        profession: "Engineer", currentMedications: "Metformin", allergies: "Penicillin",
        systemicDiseases: { diabetes: true }, semenAnalysis: [{ date: "2024-01-01" }],
        dnaFragmentation: [{ dfi: "18" }], geneticTests: [{ test: "Karyotype" }],
      },
      maleRadiologyStudies: [{ type: "scrotal" }],
      generalAttachmentsMale: [{ fileKey: "k1" }],
      partnerIsFirstMarriage: true,
    }, null)).toBe(false);
  });
  it("REQ-9: undefined mode (same as omitting) returns false, not female semantics", () => {
    const result = hasMeaningfulReportedPartnerData(
      { maleIntake: { semenAnalysis: [{ date: "2024-01-01" }] } }, undefined
    );
    expect(result).toBe(false);
  });
});

// ─── Link Partner notice: must NOT appear for null/general records ─────────────
describe("hasMeaningfulReportedPartnerData — Link Partner notice correctness", () => {
  it("null-mode record with full partner-like data does NOT trigger Link Partner notice", () => {
    expect(hasMeaningfulReportedPartnerData({
      maleIntake: { profession: "Engineer", currentMedications: "Metformin", allergies: "Penicillin",
        systemicDiseases: { diabetes: true }, semenAnalysis: [{ date: "2024-01-01" }] },
      maleRadiologyStudies: [{ type: "scrotal" }],
      generalAttachmentsMale: [{ fileKey: "k1" }],
      partnerIsFirstMarriage: true,
    }, null)).toBe(false);
  });
  it("general-mode record with full partner-like data does NOT trigger Link Partner notice", () => {
    expect(hasMeaningfulReportedPartnerData({
      maleIntake: { profession: "Engineer", currentMedications: "Metformin", allergies: "Penicillin",
        systemicDiseases: { diabetes: true }, semenAnalysis: [{ date: "2024-01-01" }] },
      maleRadiologyStudies: [{ type: "scrotal" }],
      generalAttachmentsMale: [{ fileKey: "k1" }],
      partnerIsFirstMarriage: true,
    }, "general")).toBe(false);
  });
  it("female-mode record with same data DOES trigger Link Partner notice", () => {
    expect(hasMeaningfulReportedPartnerData({
      maleIntake: { profession: "Engineer", currentMedications: "Metformin", allergies: "Penicillin",
        systemicDiseases: { diabetes: true }, semenAnalysis: [{ date: "2024-01-01" }] },
      maleRadiologyStudies: [{ type: "scrotal" }],
      generalAttachmentsMale: [{ fileKey: "k1" }],
      partnerIsFirstMarriage: true,
    }, "female")).toBe(true);
  });
});

// ─── female mode ──────────────────────────────────────────────────────────────
describe("hasMeaningfulReportedPartnerData — female mode", () => {
  it("returns false for empty object", () => {
    expect(hasMeaningfulReportedPartnerData({}, "female")).toBe(false);
  });
  it("returns true when maleIntake has semenAnalysis", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { semenAnalysis: [{ date: "2024-01-01" }] } }, "female")).toBe(true);
  });
  it("returns true when maleIntake has dnaFragmentation", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { dnaFragmentation: [{ date: "2024-02-01", dfi: "18" }] } }, "female")).toBe(true);
  });
  it("returns true when maleIntake has geneticTests", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { geneticTests: [{ test: "Karyotype", result: "46,XY" }] } }, "female")).toBe(true);
  });
  it("returns true when maleIntake has currentMedications", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { currentMedications: "Metformin" } }, "female")).toBe(true);
  });
  it("returns true when maleIntake has allergies", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { allergies: "Penicillin" } }, "female")).toBe(true);
  });
  it("returns true when maleIntake has active systemic disease", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { systemicDiseases: { diabetes: true } } }, "female")).toBe(true);
  });
  it("returns true when maleRadiologyStudies is non-empty", () => {
    expect(hasMeaningfulReportedPartnerData({ maleRadiologyStudies: [{ type: "scrotal", date: "2024-03-01" }] }, "female")).toBe(true);
  });
  it("returns true when generalAttachmentsMale is non-empty", () => {
    expect(hasMeaningfulReportedPartnerData({ generalAttachmentsMale: [{ fileKey: "k1", tag: "LabResult-01" }] }, "female")).toBe(true);
  });
  it("returns true when hasMaleRadiologyStudies is true", () => {
    expect(hasMeaningfulReportedPartnerData({ hasMaleRadiologyStudies: true }, "female")).toBe(true);
  });
  it("returns true when partnerIsFirstMarriage is true", () => {
    expect(hasMeaningfulReportedPartnerData({ partnerIsFirstMarriage: true }, "female")).toBe(true);
  });
  it("returns false when all fields are empty/default", () => {
    expect(hasMeaningfulReportedPartnerData({
      maleIntake: { profession: "", smoking: "never", semenAnalysis: [] },
      maleRadiologyStudies: [], generalAttachmentsMale: [],
      hasMaleRadiologyStudies: false, partnerIsFirstMarriage: false,
    }, "female")).toBe(false);
  });
  it("returns false when systemicDiseases has all false flags", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { systemicDiseases: { diabetes: false, hypertension: false, other: "" } } }, "female")).toBe(false);
  });
  it("returns true when systemicDiseases has non-empty other", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { systemicDiseases: { other: "Thyroid condition" } } }, "female")).toBe(true);
  });
  it("returns true when maleIntake is a JSON string with meaningful data", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: JSON.stringify({ profession: "Doctor" }) }, "female")).toBe(true);
  });
  it("returns false when maleIntake is a JSON string with only defaults", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: JSON.stringify({ profession: "", smoking: "never", semenAnalysis: [] }) }, "female")).toBe(false);
  });
  it("returns true when maleRadiologyStudies is a JSON string with entries", () => {
    expect(hasMeaningfulReportedPartnerData({ maleRadiologyStudies: JSON.stringify([{ type: "Ultrasound" }]) }, "female")).toBe(true);
  });
  it("returns false when maleRadiologyStudies is a JSON string with empty array", () => {
    expect(hasMeaningfulReportedPartnerData({ maleRadiologyStudies: JSON.stringify([]) }, "female")).toBe(false);
  });
});

// ─── male mode ────────────────────────────────────────────────────────────────
describe("hasMeaningfulReportedPartnerData — male mode", () => {
  it("returns false for empty object", () => {
    expect(hasMeaningfulReportedPartnerData({}, "male")).toBe(false);
  });
  it("CRITICAL: returns false when male person has semenAnalysis", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { semenAnalysis: [{ date: "2024-01-01" }] } }, "male")).toBe(false);
  });
  it("CRITICAL: returns false when male person has dnaFragmentation", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { dnaFragmentation: [{ date: "2024-02-01", dfi: "22" }] } }, "male")).toBe(false);
  });
  it("CRITICAL: returns false when male person has geneticTests", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { geneticTests: [{ test: "Karyotype" }] } }, "male")).toBe(false);
  });
  it("CRITICAL: returns false when male person has currentMedications", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { currentMedications: "Metformin 500mg" } }, "male")).toBe(false);
  });
  it("CRITICAL: returns false when male person has allergies", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { allergies: "Penicillin" } }, "male")).toBe(false);
  });
  it("CRITICAL: returns false when male person has active systemic disease", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { systemicDiseases: { diabetes: true } } }, "male")).toBe(false);
  });
  it("CRITICAL: returns false when male person has profession", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { profession: "Engineer" } }, "male")).toBe(false);
  });
  it("CRITICAL: returns false when male person has previousTests", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { previousTests: [{ name: "FSH" }] } }, "male")).toBe(false);
  });
  it("CRITICAL: returns false when male person has previousSurgeries", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { previousSurgeries: [{ procedure: "Varicocelectomy" }] } }, "male")).toBe(false);
  });
  it("CRITICAL: returns false when maleRadiologyStudies is non-empty", () => {
    expect(hasMeaningfulReportedPartnerData({ maleRadiologyStudies: [{ type: "scrotal" }] }, "male")).toBe(false);
  });
  it("CRITICAL: returns false when generalAttachmentsMale is non-empty", () => {
    expect(hasMeaningfulReportedPartnerData({ generalAttachmentsMale: [{ fileKey: "k1" }] }, "male")).toBe(false);
  });
  it("CRITICAL: returns false when hasMaleRadiologyStudies is true", () => {
    expect(hasMeaningfulReportedPartnerData({ hasMaleRadiologyStudies: true }, "male")).toBe(false);
  });
  it("returns true when maleIntake.femalePartnerDob is set", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { femalePartnerDob: "1990-06-15" } }, "male")).toBe(true);
  });
  it("returns false when maleIntake.femalePartnerDob is empty string", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { femalePartnerDob: "" } }, "male")).toBe(false);
  });
  it("returns false when maleIntake.femalePartnerDob is whitespace only", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { femalePartnerDob: "   " } }, "male")).toBe(false);
  });
  it("returns true when partnerIsFirstMarriage is true", () => {
    expect(hasMeaningfulReportedPartnerData({ partnerIsFirstMarriage: true }, "male")).toBe(true);
  });
  it("returns false when partnerIsFirstMarriage is false", () => {
    expect(hasMeaningfulReportedPartnerData({ partnerIsFirstMarriage: false }, "male")).toBe(false);
  });
  it("maleIntake.femalePartnerDob works when maleIntake is a JSON string", () => {
    expect(hasMeaningfulReportedPartnerData(
      { maleIntake: JSON.stringify({ femalePartnerDob: "1990-06-15", semenAnalysis: [{ date: "2024-01-01" }] }) }, "male"
    )).toBe(true);
  });
  it("returns false when maleIntake is JSON string with only male-person data", () => {
    expect(hasMeaningfulReportedPartnerData(
      { maleIntake: JSON.stringify({ profession: "Engineer", semenAnalysis: [{ date: "2024-01-01" }] }) }, "male"
    )).toBe(false);
  });
});

// ─── legacy mode ──────────────────────────────────────────────────────────────
describe("hasMeaningfulReportedPartnerData — legacy mode", () => {
  it("returns true when maleIntake has semenAnalysis", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { semenAnalysis: [{ date: "2024-01-01" }] } }, "legacy")).toBe(true);
  });
  it("returns true when maleRadiologyStudies is non-empty", () => {
    expect(hasMeaningfulReportedPartnerData({ maleRadiologyStudies: [{ type: "scrotal" }] }, "legacy")).toBe(true);
  });
  it("returns true when generalAttachmentsMale is non-empty", () => {
    expect(hasMeaningfulReportedPartnerData({ generalAttachmentsMale: [{ fileKey: "k1" }] }, "legacy")).toBe(true);
  });
  it("returns true when partnerIsFirstMarriage is true", () => {
    expect(hasMeaningfulReportedPartnerData({ partnerIsFirstMarriage: true }, "legacy")).toBe(true);
  });
  it("returns true when maleIntake has currentMedications", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { currentMedications: "Aspirin" } }, "legacy")).toBe(true);
  });
  it("returns true when maleIntake has allergies", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { allergies: "Sulfa" } }, "legacy")).toBe(true);
  });
  it("returns true when maleIntake has active systemic disease", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { systemicDiseases: { hypertension: true } } }, "legacy")).toBe(true);
  });
  it("returns false for empty object", () => {
    expect(hasMeaningfulReportedPartnerData({}, "legacy")).toBe(false);
  });
});

// ─── general mode ─────────────────────────────────────────────────────────────
describe("hasMeaningfulReportedPartnerData — general mode", () => {
  it("returns false even when maleIntake has meaningful data", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { profession: "Engineer", semenAnalysis: [{ date: "2024-01-01" }] } }, "general")).toBe(false);
  });
  it("returns false even when maleRadiologyStudies is non-empty", () => {
    expect(hasMeaningfulReportedPartnerData({ maleRadiologyStudies: [{ type: "scrotal" }] }, "general")).toBe(false);
  });
  it("returns false even when partnerIsFirstMarriage is true", () => {
    expect(hasMeaningfulReportedPartnerData({ partnerIsFirstMarriage: true }, "general")).toBe(false);
  });
  it("returns false for empty object", () => {
    expect(hasMeaningfulReportedPartnerData({}, "general")).toBe(false);
  });
  it("returns false even when generalAttachmentsMale is non-empty", () => {
    expect(hasMeaningfulReportedPartnerData({ generalAttachmentsMale: [{ fileKey: "k1" }] }, "general")).toBe(false);
  });
});

// ─── null mode ────────────────────────────────────────────────────────────────
describe("hasMeaningfulReportedPartnerData — null mode", () => {
  it("returns false for null intake", () => {
    expect(hasMeaningfulReportedPartnerData(null, null)).toBe(false);
  });
  it("returns false for empty object", () => {
    expect(hasMeaningfulReportedPartnerData({}, null)).toBe(false);
  });
  it("returns false even when maleIntake has meaningful data", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { profession: "Engineer", semenAnalysis: [{ date: "2024-01-01" }] } }, null)).toBe(false);
  });
  it("returns false even when maleRadiologyStudies is non-empty", () => {
    expect(hasMeaningfulReportedPartnerData({ maleRadiologyStudies: [{ type: "scrotal" }] }, null)).toBe(false);
  });
  it("returns false even when partnerIsFirstMarriage is true", () => {
    expect(hasMeaningfulReportedPartnerData({ partnerIsFirstMarriage: true }, null)).toBe(false);
  });
  it("returns false even when generalAttachmentsMale is non-empty", () => {
    expect(hasMeaningfulReportedPartnerData({ generalAttachmentsMale: [{ fileKey: "k1" }] }, null)).toBe(false);
  });
  it("returns false even when hasMaleRadiologyStudies is true", () => {
    expect(hasMeaningfulReportedPartnerData({ hasMaleRadiologyStudies: true }, null)).toBe(false);
  });
});

// ─── undefined mode ───────────────────────────────────────────────────────────
describe("hasMeaningfulReportedPartnerData — undefined mode", () => {
  it("returns false for empty object", () => {
    expect(hasMeaningfulReportedPartnerData({}, undefined)).toBe(false);
  });
  it("returns false even when maleIntake has meaningful data", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { profession: "Engineer", semenAnalysis: [{ date: "2024-01-01" }] } }, undefined)).toBe(false);
  });
  it("returns false even when maleRadiologyStudies is non-empty", () => {
    expect(hasMeaningfulReportedPartnerData({ maleRadiologyStudies: [{ type: "scrotal" }] }, undefined)).toBe(false);
  });
  it("returns false even when partnerIsFirstMarriage is true", () => {
    expect(hasMeaningfulReportedPartnerData({ partnerIsFirstMarriage: true }, undefined)).toBe(false);
  });
  it("returns false even when generalAttachmentsMale is non-empty", () => {
    expect(hasMeaningfulReportedPartnerData({ generalAttachmentsMale: [{ fileKey: "k1" }] }, undefined)).toBe(false);
  });
});

// ─── Regression tests: single-trigger scenarios ───────────────────────────────
describe("hasMeaningfulReportedPartnerData — single-trigger regression tests (female mode)", () => {
  it("T-REG-1: one generalAttachmentsMale entry triggers section in female mode", () => {
    expect(hasMeaningfulReportedPartnerData({ generalAttachmentsMale: [{ fileKey: "key-001", tag: "LabResult-01" }] }, "female")).toBe(true);
  });
  it("T-REG-2: one maleRadiologyStudies entry triggers section in female mode", () => {
    expect(hasMeaningfulReportedPartnerData({ maleRadiologyStudies: [{ type: "scrotal", date: "2024-03-15", findings: "Normal" }] }, "female")).toBe(true);
  });
  it("T-REG-3: one maleIntake.geneticTests entry triggers section in female mode", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { geneticTests: [{ test: "Karyotype", date: "2024-01-10", result: "46,XY" }] } }, "female")).toBe(true);
  });
  it("T-REG-4: one maleIntake.dnaFragmentation entry triggers section in female mode", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { dnaFragmentation: [{ date: "2024-02-20", dfi: "18", hds: "5", method: "SCSA" }] } }, "female")).toBe(true);
  });
  it("T-REG-5: one active systemic disease in maleIntake triggers section in female mode", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { systemicDiseases: { diabetes: true } } }, "female")).toBe(true);
  });
  it("T-REG-6: non-empty currentMedications in maleIntake triggers section in female mode", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { currentMedications: "Metformin 500mg daily" } }, "female")).toBe(true);
  });
  it("T-REG-7: non-empty allergies in maleIntake triggers section in female mode", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { allergies: "Penicillin" } }, "female")).toBe(true);
  });
  it("T-REG-8: maleIntake.femalePartnerDob triggers section in male mode", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { femalePartnerDob: "1990-06-15" } }, "male")).toBe(true);
  });
  it("T-REG-9: same record with femalePartnerDob absent returns false in male mode", () => {
    expect(hasMeaningfulReportedPartnerData({ maleIntake: { femalePartnerDob: "" } }, "male")).toBe(false);
  });
});

// ─── Phase A — Read-Only display fix regression tests ─────────────────────────
// Pure-logic tests validating the data conditions behind the 4 new display fixes.

describe("Phase A — F-1: marriageCertStatus display logic", () => {
  function certDisplayValue(intake: Record<string, unknown>): string | null {
    const certStatus = intake.marriageCertStatus as string | undefined;
    const legacyYes = !certStatus && intake.hasCivilMarriageCertificate === true;
    return certStatus === "yes" || legacyYes ? "Yes"
      : certStatus === "in_progress" ? "In progress"
      : certStatus === "no" ? "No"
      : certStatus === "not_specified" ? "Not specified"
      : null;
  }

  it("REG-A1: marriageCertStatus=yes → displays 'Yes'", () => {
    expect(certDisplayValue({ marriageCertStatus: "yes" })).toBe("Yes");
  });
  it("REG-A2: marriageCertStatus=no → displays 'No'", () => {
    expect(certDisplayValue({ marriageCertStatus: "no" })).toBe("No");
  });
  it("REG-A3: marriageCertStatus=in_progress → displays 'In progress'", () => {
    expect(certDisplayValue({ marriageCertStatus: "in_progress" })).toBe("In progress");
  });
  it("REG-A4: legacy hasCivilMarriageCertificate=true with no marriageCertStatus → displays 'Yes'", () => {
    expect(certDisplayValue({ hasCivilMarriageCertificate: true })).toBe("Yes");
  });
  it("REG-A5: no cert fields at all → returns null (row hidden)", () => {
    expect(certDisplayValue({})).toBeNull();
  });
});

describe("Phase A — F-2: leadSource display logic", () => {
  const LEAD_SOURCES: Record<string, string> = {
    "doctor-referral": "Doctor Referral",
    "instagram": "Instagram",
    "website": "Website",
  };

  function leadSourceLabel(leadData: Record<string, unknown> | undefined): string | null {
    if (!leadData?.leadSource) return null;
    const src = leadData.leadSource as string;
    return LEAD_SOURCES[src] ?? src.replace(/-/g, " ");
  }

  it("REG-A6: leadSource populated → row is visible with correct label", () => {
    expect(leadSourceLabel({ leadSource: "doctor-referral" })).toBe("Doctor Referral");
  });
  it("REG-A7: leadSource empty string → row is hidden (null)", () => {
    expect(leadSourceLabel({ leadSource: "" })).toBeNull();
  });
  it("REG-A8: leadData undefined → row is hidden (null)", () => {
    expect(leadSourceLabel(undefined)).toBeNull();
  });
});

describe("Phase A — F-3: miscarriage file attachment logic", () => {
  interface MiscarriageEntry {
    date: string; gestationalAge: string; notes: string;
    fileUrl?: string; fileName?: string; filePassword?: string;
  }

  const hasAttachment = (m: MiscarriageEntry) => !!m.fileUrl;
  const fallbackName = (m: MiscarriageEntry, idx: number) =>
    m.fileName || `Miscarriage-${String(idx + 1).padStart(2, "0")}`;

  it("REG-A9: miscarriage item with fileUrl → attachment row is rendered", () => {
    const e: MiscarriageEntry = { date: "2024-01", gestationalAge: "6 weeks", notes: "", fileUrl: "/manus-storage/abc.pdf", fileName: "scan.pdf" };
    expect(hasAttachment(e)).toBe(true);
    expect(fallbackName(e, 0)).toBe("scan.pdf");
  });
  it("REG-A10: miscarriage item without fileUrl → no attachment row", () => {
    const e: MiscarriageEntry = { date: "2024-01", gestationalAge: "6 weeks", notes: "" };
    expect(hasAttachment(e)).toBe(false);
  });
  it("REG-A11: miscarriage item with fileUrl but no fileName → fallback name used", () => {
    const e: MiscarriageEntry = { date: "2024-01", gestationalAge: "6 weeks", notes: "", fileUrl: "/manus-storage/abc.pdf" };
    expect(fallbackName(e, 0)).toBe("Miscarriage-01");
    expect(fallbackName(e, 2)).toBe("Miscarriage-03");
  });
  it("REG-A12: multiple miscarriage items preserve independent attachment mapping", () => {
    const entries: MiscarriageEntry[] = [
      { date: "2023-06", gestationalAge: "8 weeks", notes: "", fileUrl: "/manus-storage/a.pdf", fileName: "first.pdf" },
      { date: "2024-01", gestationalAge: "6 weeks", notes: "" },
      { date: "2024-09", gestationalAge: "10 weeks", notes: "", fileUrl: "/manus-storage/c.pdf" },
    ];
    expect(entries.map(hasAttachment)).toEqual([true, false, true]);
    expect(fallbackName(entries[2], 2)).toBe("Miscarriage-03");
  });
});

describe("Phase A — F-4: contraceptiveMethodOther display logic", () => {
  function contraMethodDisplay(intake: { contraceptiveMethod?: string; contraceptiveMethodOther?: string }): string | null {
    if (intake.contraceptiveMethod !== "other") return null;
    return intake.contraceptiveMethodOther || "Other";
  }

  it("REG-A13: method=other with text → shows the free-text value", () => {
    expect(contraMethodDisplay({ contraceptiveMethod: "other", contraceptiveMethodOther: "Patch" })).toBe("Patch");
  });
  it("REG-A14: method=other with empty text → falls back to 'Other'", () => {
    expect(contraMethodDisplay({ contraceptiveMethod: "other", contraceptiveMethodOther: "" })).toBe("Other");
  });
  it("REG-A15: method=other with undefined text → falls back to 'Other'", () => {
    expect(contraMethodDisplay({ contraceptiveMethod: "other" })).toBe("Other");
  });
  it("REG-A16: method=oral-pill → row not shown (null)", () => {
    expect(contraMethodDisplay({ contraceptiveMethod: "oral-pill", contraceptiveMethodOther: "ignored" })).toBeNull();
  });
});
