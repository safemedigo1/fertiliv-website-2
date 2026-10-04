/**
 * toast-config.test.ts
 * Phase 62 — Global Toast Dismissal (pasted_content_2.txt)
 *
 * Tests verify:
 * 1. Global Toaster has closeButton=true and duration=5000
 * 2. No custom duration overrides remain in MedicalIntakeForm.tsx
 * 3. No toast.loading / toast.promise / toast.custom calls exist
 * 4. The Sonner package version supports closeButton and duration as ToasterProps
 * 5. The 3 previously-overridden DNA Fragmentation toast calls now use global default
 */

import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const PROJECT_ROOT = path.resolve(__dirname, "..");
const APP_TSX = path.join(PROJECT_ROOT, "client/src/App.tsx");
const MEDICAL_INTAKE = path.join(PROJECT_ROOT, "client/src/components/MedicalIntakeForm.tsx");
const SONNER_UI = path.join(PROJECT_ROOT, "client/src/components/ui/sonner.tsx");
const SONNER_PKG = path.join(PROJECT_ROOT, "node_modules/sonner/package.json");

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

// ─── Part 1: Global Toaster configuration ────────────────────────────────────

describe("Global Toaster configuration (App.tsx)", () => {
  it("Toaster has closeButton prop", () => {
    const content = readFile(APP_TSX);
    expect(content).toMatch(/closeButton/);
  });

  it("Toaster has duration={5000} prop", () => {
    const content = readFile(APP_TSX);
    expect(content).toMatch(/duration=\{5000\}/);
  });

  it("Toaster has richColors prop", () => {
    const content = readFile(APP_TSX);
    expect(content).toMatch(/richColors/);
  });

  it("Toaster has position=\"top-right\" prop", () => {
    const content = readFile(APP_TSX);
    expect(content).toMatch(/position="top-right"/);
  });

  it("Toaster closeButton and duration appear on the same line", () => {
    const content = readFile(APP_TSX);
    const lines = content.split("\n");
    const toasterLine = lines.find(l => l.includes("<Toaster") && l.includes("closeButton") && l.includes("duration"));
    expect(toasterLine).toBeDefined();
  });
});

// ─── Part 2: No custom duration overrides in MedicalIntakeForm.tsx ───────────

describe("No custom duration overrides in MedicalIntakeForm.tsx", () => {
  it("No toast call uses { duration: 8000 }", () => {
    const content = readFile(MEDICAL_INTAKE);
    expect(content).not.toMatch(/duration:\s*8000/);
  });

  it("No toast call uses { duration: 6000 }", () => {
    const content = readFile(MEDICAL_INTAKE);
    expect(content).not.toMatch(/duration:\s*6000/);
  });

  it("No toast call uses { duration: 4000 } (old default — should use global)", () => {
    const content = readFile(MEDICAL_INTAKE);
    expect(content).not.toMatch(/duration:\s*4000/);
  });

  it("No toast call uses duration: Infinity (would block auto-dismiss)", () => {
    const content = readFile(MEDICAL_INTAKE);
    expect(content).not.toMatch(/duration:\s*Infinity/);
  });

  it("DNA Fragmentation wrong-section warning has no custom duration", () => {
    const content = readFile(MEDICAL_INTAKE);
    const match = content.match(/toast\.warning\("This report does not contain DNA Fragmentation[^"]*"([^)]*)\)/);
    expect(match).toBeTruthy();
    // The call should not include a duration option
    const callBody = match![1] ?? "";
    expect(callBody).not.toMatch(/duration/);
  });

  it("DNA Fragmentation no-data warning has no custom duration", () => {
    const content = readFile(MEDICAL_INTAKE);
    const match = content.match(/toast\.warning\("No DNA Fragmentation data was found[^"]*"([^)]*)\)/);
    expect(match).toBeTruthy();
    const callBody = match![1] ?? "";
    expect(callBody).not.toMatch(/duration/);
  });

  it("DNA Fragmentation success toast has no custom duration", () => {
    const content = readFile(MEDICAL_INTAKE);
    const match = content.match(/toast\.success\("DNA Fragmentation data extracted\. Semen Analysis[^"]*"([^)]*)\)/);
    expect(match).toBeTruthy();
    const callBody = match![1] ?? "";
    expect(callBody).not.toMatch(/duration/);
  });
});

// ─── Part 3: No unsupported toast patterns ───────────────────────────────────

describe("No unsupported toast patterns in client/src", () => {
  function readAllTsxFiles(dir: string): string {
    let combined = "";
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules") {
        combined += readAllTsxFiles(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) {
        combined += fs.readFileSync(fullPath, "utf-8") + "\n";
      }
    }
    return combined;
  }

  it("No toast.loading calls exist (would persist indefinitely without dismiss)", () => {
    const all = readAllTsxFiles(path.join(PROJECT_ROOT, "client/src"));
    expect(all).not.toMatch(/toast\.loading\s*\(/);
  });

  it("No toast.promise calls exist (complex lifecycle, not covered by global duration)", () => {
    const all = readAllTsxFiles(path.join(PROJECT_ROOT, "client/src"));
    expect(all).not.toMatch(/toast\.promise\s*\(/);
  });
});

// ─── Part 4: Sonner package capabilities ─────────────────────────────────────

describe("Sonner package supports required props", () => {
  it("Sonner version is 2.x (supports closeButton and duration as ToasterProps)", () => {
    const pkg = JSON.parse(readFile(SONNER_PKG));
    const version: string = pkg.version ?? "";
    const major = parseInt(version.split(".")[0] ?? "0", 10);
    expect(major).toBeGreaterThanOrEqual(2);
  });

  it("Sonner Toaster component wrapper passes through props via spread", () => {
    const content = readFile(SONNER_UI);
    expect(content).toMatch(/\.\.\.\s*props/);
  });

  it("Sonner Toaster wrapper does not hardcode a duration that would override App.tsx", () => {
    const content = readFile(SONNER_UI);
    expect(content).not.toMatch(/duration=/);
  });

  it("Sonner Toaster wrapper does not hardcode closeButton that would override App.tsx", () => {
    const content = readFile(SONNER_UI);
    expect(content).not.toMatch(/closeButton=/);
  });
});
