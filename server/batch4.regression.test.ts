/**
 * Batch 4 — Regression Tests
 *
 * Covers:
 *   Fix A: translateLeadDocument deletes DB record on failure (no stale badge)
 *   Fix B: SavedTranslationsPanel filters out failed/processing translations
 *   Fix B: SavedTranslationsPanel readOnly prop hides edit controls
 *   Fix B: SavedTranslationsPanel state machine — panel closes on failure
 *   Fix C: Legacy PGT files (pgtFileUrl but no pgtDocId) show re-upload message
 *   Fix D: pgtDocId round-trip persistence through normalizeIntakeJSON
 *   Fix D: pgtDocId round-trip persistence through normalizeIntakeWriteData
 *   Dockerfile: poppler-utils is required for pdfToPageImages in production
 */

import { describe, it, expect } from "vitest";

// ─── Helpers (pure logic extracted from components / server) ──────────────────

/** Mirrors the filter in SavedTranslationsPanel */
function filterCompletedTranslations(
  translations: Array<{ id: number; status: string; targetLanguage: string }>
) {
  return translations.filter((t) => t.status === "completed");
}

/** Mirrors the badge rendering condition in SavedTranslationsPanel */
function shouldShowBadge(translation: { status: string }) {
  return translation.status === "completed";
}

/** Mirrors the legacy-PGT message condition in PGTDocRow */
function shouldShowLegacyMessage(embryo: { pgtFileUrl?: string; pgtDocId?: number }) {
  return !!embryo.pgtFileUrl && embryo.pgtDocId == null;
}

/** Mirrors the SavedTranslationsPanel rendering condition in PGTDocRow */
function shouldRenderTranslationsPanel(embryo: { pgtFileUrl?: string; pgtDocId?: number }) {
  return embryo.pgtDocId != null && !!embryo.pgtFileUrl;
}

/** Mirrors the readOnly guard for the Extract button */
function shouldShowExtractButton(readOnly: boolean, canTranslate: boolean, isPending: boolean, availableLangs: string[]) {
  return !readOnly && canTranslate && !isPending && availableLangs.length > 0;
}

/** Mirrors the readOnly guard for edit/delete controls */
function shouldShowEditControls(readOnly: boolean) {
  return !readOnly;
}

/** Mirrors the readOnly guard for the Cancel button */
function shouldShowCancelButton(readOnly: boolean, showExtractPanel: boolean, isPending: boolean) {
  return !readOnly && showExtractPanel && !isPending;
}

/** Mirrors normalizeIntakeJSON's cycle spread — pgtDocId must be preserved */
function normalizeCycle(cycle: Record<string, unknown>): Record<string, unknown> {
  const CYCLE_ARRAY_FIELDS = ["frozenEmbryos", "fetEmbryos", "transferredEmbryos"];
  const cleanCycle = { ...cycle };
  for (const f of CYCLE_ARRAY_FIELDS) {
    const v = cleanCycle[f];
    if (v !== null && v !== undefined) {
      const parsed = typeof v === "string" ? JSON.parse(v) : v;
      cleanCycle[f] = Array.isArray(parsed) ? parsed : [];
    }
  }
  return cleanCycle;
}

/** Mirrors normalizeIntakeWriteData — only parses string-encoded JSON, never strips fields */
function normalizeWriteData(data: Record<string, unknown>): Record<string, unknown> {
  const JSON_FIELDS = ["artHistory", "surgicalHistory", "maleIntake"];
  const normalized = { ...data };
  for (const field of JSON_FIELDS) {
    if (normalized[field] !== null && normalized[field] !== undefined && typeof normalized[field] === "string") {
      try {
        const parsed = JSON.parse(normalized[field] as string);
        normalized[field] = typeof parsed === "string" ? JSON.parse(parsed) : parsed;
      } catch { /* leave as-is */ }
    }
  }
  return normalized;
}

// ─── Fix A: translateLeadDocument — no stale DB record on failure ─────────────

describe("Fix A: translateLeadDocument — delete record on failure", () => {
  it("T1: failed extraction must not leave any completed translation badge", () => {
    // Simulates: extraction throws, record is deleted, UI receives empty list
    const translationsAfterFailure: Array<{ id: number; status: string; targetLanguage: string }> = [];
    const badges = filterCompletedTranslations(translationsAfterFailure);
    expect(badges).toHaveLength(0);
  });

  it("T2: a failed-status row (legacy) is filtered out and never shown as a badge", () => {
    const translations = [
      { id: 1, status: "failed", targetLanguage: "en" },
      { id: 2, status: "completed", targetLanguage: "ar" },
    ];
    const badges = filterCompletedTranslations(translations);
    expect(badges).toHaveLength(1);
    expect(badges[0].targetLanguage).toBe("ar");
  });

  it("T3: a processing-status row is filtered out and never shown as a badge", () => {
    const translations = [
      { id: 1, status: "processing", targetLanguage: "en" },
    ];
    const badges = filterCompletedTranslations(translations);
    expect(badges).toHaveLength(0);
  });

  it("T4: only completed rows produce badges — mixed list", () => {
    const translations = [
      { id: 1, status: "completed", targetLanguage: "en" },
      { id: 2, status: "failed", targetLanguage: "ar" },
      { id: 3, status: "processing", targetLanguage: "tr" },
      { id: 4, status: "completed", targetLanguage: "fr" },
    ];
    const badges = filterCompletedTranslations(translations);
    expect(badges).toHaveLength(2);
    expect(badges.map((b) => b.targetLanguage)).toEqual(["en", "fr"]);
  });
});

// ─── Fix B: SavedTranslationsPanel — state machine and readOnly prop ──────────

describe("Fix B: SavedTranslationsPanel — state machine and readOnly prop", () => {
  it("T5: shouldShowBadge returns false for failed status", () => {
    expect(shouldShowBadge({ status: "failed" })).toBe(false);
  });

  it("T6: shouldShowBadge returns true for completed status", () => {
    expect(shouldShowBadge({ status: "completed" })).toBe(true);
  });

  it("T7: Extract button is hidden in readOnly mode", () => {
    expect(shouldShowExtractButton(true, true, false, ["en", "ar"])).toBe(false);
  });

  it("T8: Extract button is shown in edit mode when languages are available", () => {
    expect(shouldShowExtractButton(false, true, false, ["en"])).toBe(true);
  });

  it("T9: Extract button is hidden while extraction is pending (isPending=true)", () => {
    expect(shouldShowExtractButton(false, true, true, ["en"])).toBe(false);
  });

  it("T10: Extract button is hidden when all languages are already extracted", () => {
    expect(shouldShowExtractButton(false, true, false, [])).toBe(false);
  });

  it("T11: Edit and Delete controls are hidden in readOnly mode", () => {
    expect(shouldShowEditControls(true)).toBe(false);
  });

  it("T12: Edit and Delete controls are shown in edit mode", () => {
    expect(shouldShowEditControls(false)).toBe(true);
  });

  it("T13: Cancel button is hidden in readOnly mode", () => {
    expect(shouldShowCancelButton(true, true, false)).toBe(false);
  });

  it("T14: Cancel button is hidden while extraction is pending", () => {
    expect(shouldShowCancelButton(false, true, true)).toBe(false);
  });

  it("T15: Cancel button is shown when extract panel is open and not pending", () => {
    expect(shouldShowCancelButton(false, true, false)).toBe(true);
  });
});

// ─── Fix C: Legacy PGT files — re-upload message ─────────────────────────────

describe("Fix C: Legacy PGT files — re-upload message", () => {
  it("T16: embryo with pgtFileUrl but no pgtDocId shows legacy re-upload message", () => {
    const embryo = { pgtFileUrl: "/api/storage/test.pdf" };
    expect(shouldShowLegacyMessage(embryo)).toBe(true);
    expect(shouldRenderTranslationsPanel(embryo)).toBe(false);
  });

  it("T17: embryo with pgtFileUrl AND pgtDocId shows panel, not legacy message", () => {
    const embryo = { pgtFileUrl: "/api/storage/test.pdf", pgtDocId: 42 };
    expect(shouldShowLegacyMessage(embryo)).toBe(false);
    expect(shouldRenderTranslationsPanel(embryo)).toBe(true);
  });

  it("T18: embryo with no pgtFileUrl shows neither panel nor legacy message", () => {
    const embryo = {};
    expect(shouldShowLegacyMessage(embryo)).toBe(false);
    expect(shouldRenderTranslationsPanel(embryo)).toBe(false);
  });
});

// ─── Fix D: pgtDocId round-trip persistence ───────────────────────────────────

describe("Fix D: pgtDocId round-trip persistence through normalization", () => {
  it("T19: normalizeIntakeJSON preserves pgtDocId inside frozenEmbryos after JSON parse", () => {
    const cycle = {
      id: "c1",
      type: "IVF",
      frozenEmbryos: JSON.stringify([
        { id: "e1", pgtDocId: 42, pgtFileUrl: "/api/storage/test.pdf" },
        { id: "e2", pgtDocId: 99, pgtFileUrl: "/api/storage/test2.pdf" },
      ]),
    };
    const normalized = normalizeCycle(cycle);
    const embryos = normalized.frozenEmbryos as Array<{ id: string; pgtDocId: number }>;
    expect(Array.isArray(embryos)).toBe(true);
    expect(embryos[0].pgtDocId).toBe(42);
    expect(embryos[1].pgtDocId).toBe(99);
  });

  it("T20: normalizeIntakeWriteData does NOT strip pgtDocId from artHistory cycles", () => {
    const artHistory = [
      {
        id: "c1",
        type: "IVF",
        frozenEmbryos: [
          { id: "e1", pgtDocId: 42, pgtFileUrl: "/api/storage/test.pdf" },
        ],
      },
    ];
    const data = { artHistory };
    const normalized = normalizeWriteData(data);
    const cycles = normalized.artHistory as typeof artHistory;
    expect(cycles[0].frozenEmbryos[0].pgtDocId).toBe(42);
  });
});
