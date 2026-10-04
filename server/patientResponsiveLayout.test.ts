import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COMPACT_PATIENT_LAYOUT_BREAKPOINT, isCompactPatientLayout } from "../shared/responsiveLayout";

describe("Patient Profile tablet responsive contract", () => {
  it("uses the protected-shell compact boundary across iPad portrait widths", () => {
    expect(COMPACT_PATIENT_LAYOUT_BREAKPOINT).toBe(1024);
    [768, 810, 820, 834, 1023].forEach(width => expect(isCompactPatientLayout(width)).toBe(true));
    expect(isCompactPatientLayout(1024)).toBe(false);
    expect(isCompactPatientLayout(1280)).toBe(false);
  });

  it("keeps the Patient header, tabs, shell, and dialog within the unified viewport contract", () => {
    const root = resolve(process.cwd());
    const patientPage = readFileSync(resolve(root, "client/src/pages/PatientDetailPage.tsx"), "utf8");
    const layout = readFileSync(resolve(root, "client/src/components/FertilizLayout.tsx"), "utf8");
    const dialog = readFileSync(resolve(root, "client/src/components/ui/dialog.tsx"), "utf8");

    expect(patientPage).toContain("const isCompactPatientLayout = useIsMobile()");
    expect(patientPage).toContain("compact={isCompactPatientLayout}");
    expect(patientPage).toContain("isCompactPatientLayout ? \"hidden\" : \"flex\"");
    expect(layout).toContain('isInboxRoute ? "min-w-0 min-h-0 flex-1 overflow-hidden" : "min-w-0 flex-1"');
    expect(dialog).toContain("max-h-[calc(100dvh-2rem)]");
  });
});
