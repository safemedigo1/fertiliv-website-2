/**
 * Tests for Lab Dictionary Router
 * Validates seed data structure, result type classification, and alias logic.
 */
import { describe, it, expect } from "vitest";
import { LAB_SEED_DATA } from "../shared/labDictionarySeed";

const VALID_RESULT_TYPES = [
  "Quantitative",
  "Qualitative",
  "Molecular/PCR",
  "Genetic",
  "Microbiology Culture",
  "Microscopy/Parasitology",
  "Panel/Profile",
  "Pathology/Biopsy",
  "Semen Analysis",
  "Semen DNA",
  "Therapeutic Drug Monitoring",
  "Descriptive/Report",
] as const;

const VALID_MODULES = [
  "general_lab",
  "semen_analysis",
  "semen_dna",
  "genetic",
  "radiology",
  "pathology",
] as const;

describe("Lab Dictionary Seed Data", () => {
  it("should have at least 400 entries", () => {
    expect(LAB_SEED_DATA.length).toBeGreaterThanOrEqual(400);
  });

  it("every entry has required fields", () => {
    for (const entry of LAB_SEED_DATA) {
      expect(entry.canonicalName, `canonicalName missing for entry`).toBeTruthy();
      expect(entry.displayName, `displayName missing for ${entry.canonicalName}`).toBeTruthy();
      expect(entry.resultType, `resultType missing for ${entry.canonicalName}`).toBeTruthy();
      expect(entry.category, `category missing for ${entry.canonicalName}`).toBeTruthy();
    }
  });

  it("every entry has a valid resultType", () => {
    for (const entry of LAB_SEED_DATA) {
      expect(
        VALID_RESULT_TYPES.includes(entry.resultType as any),
        `Invalid resultType "${entry.resultType}" for ${entry.canonicalName}`
      ).toBe(true);
    }
  });

  it("every entry has a valid suggestedModule", () => {
    for (const entry of LAB_SEED_DATA) {
      expect(
        VALID_MODULES.includes(entry.suggestedModule as any),
        `Invalid suggestedModule "${entry.suggestedModule}" for ${entry.canonicalName}`
      ).toBe(true);
    }
  });

  it("aliases are arrays of strings", () => {
    for (const entry of LAB_SEED_DATA) {
      expect(Array.isArray(entry.aliases), `aliases not array for ${entry.canonicalName}`).toBe(true);
      for (const alias of entry.aliases) {
        expect(typeof alias).toBe("string");
        expect(alias.length).toBeGreaterThan(0);
      }
    }
  });

  it("canonical names are unique", () => {
    const names = LAB_SEED_DATA.map((e) => e.canonicalName.toLowerCase().trim());
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("Semen Analysis tests use semen_analysis module", () => {
    const semenTests = LAB_SEED_DATA.filter((e) => e.resultType === "Semen Analysis");
    expect(semenTests.length).toBeGreaterThan(0);
    for (const t of semenTests) {
      expect(t.suggestedModule).toBe("semen_analysis");
    }
  });

  it("Genetic tests use genetic module", () => {
    const geneticTests = LAB_SEED_DATA.filter((e) => e.resultType === "Genetic");
    expect(geneticTests.length).toBeGreaterThan(0);
    for (const t of geneticTests) {
      expect(t.suggestedModule).toBe("genetic");
    }
  });

  it("AMH test has correct result type and aliases", () => {
    const amh = LAB_SEED_DATA.find(
      (e) => e.canonicalName === "Anti-Mullerian Hormone" || e.canonicalName.includes("AMH")
    );
    expect(amh).toBeDefined();
    expect(amh!.resultType).toBe("Quantitative");
    // Should have AMH as an alias
    const hasAMHAlias = amh!.aliases.some((a) =>
      a.toLowerCase().includes("amh")
    );
    expect(hasAMHAlias).toBe(true);
  });

  it("FSH test has correct result type", () => {
    const fsh = LAB_SEED_DATA.find(
      (e) => e.canonicalName.toLowerCase().includes("fsh") ||
             e.canonicalName.toLowerCase().includes("follicle stimulating")
    );
    expect(fsh).toBeDefined();
    expect(fsh!.resultType).toBe("Quantitative");
  });

  it("HBsAg test has Qualitative result type", () => {
    const hbsag = LAB_SEED_DATA.find(
      (e) => e.canonicalName.toLowerCase().includes("hbsag") ||
             e.canonicalName.toLowerCase().includes("hepatitis b surface antigen")
    );
    expect(hbsag).toBeDefined();
    expect(hbsag!.resultType).toBe("Qualitative");
  });

  it("CBC panel has Panel/Profile result type", () => {
    const cbc = LAB_SEED_DATA.find(
      (e) => e.canonicalName.toLowerCase().includes("complete blood count") ||
             e.canonicalName.toLowerCase() === "cbc"
    );
    expect(cbc).toBeDefined();
    expect(cbc!.resultType).toBe("Panel/Profile");
  });
});

describe("Alias deduplication logic", () => {
  it("no entry has exact duplicate aliases (case-sensitive)", () => {
    for (const entry of LAB_SEED_DATA) {
      const exact = entry.aliases.map((a) => a.trim());
      const unique = new Set(exact);
      expect(
        unique.size,
        `${entry.canonicalName} has exact duplicate aliases: ${exact}`
      ).toBe(exact.length);
    }
  });

  it("aliases are non-empty strings", () => {
    for (const entry of LAB_SEED_DATA) {
      for (const alias of entry.aliases) {
        expect(alias.trim().length, `Empty alias in ${entry.canonicalName}`).toBeGreaterThan(0);
      }
    }
  });
});
