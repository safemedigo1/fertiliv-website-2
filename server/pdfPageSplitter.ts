/**
 * pdfPageSplitter.ts
 * Converts a PDF buffer into an array of base64-encoded PNG images (one per page)
 * using the system `pdftoppm` command (poppler-utils, pre-installed on the server).
 *
 * This enables parallel per-page AI translation of multi-page PDFs.
 */
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Split a PDF buffer into an array of base64-encoded PNG images.
 * @param pdfBuffer - The raw PDF file buffer
 * @param maxPages - Maximum pages to process (default 20)
 * @returns Array of base64 PNG data URLs (one per page)
 */
export async function pdfToPageImages(
  pdfBuffer: Buffer,
  maxPages = 20,
  password?: string,
): Promise<string[]> {
  // Write PDF to a temp file
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fertiliv-pdf-"));
  const pdfPath = path.join(tmpDir, "input.pdf");
  const outputPrefix = path.join(tmpDir, "page");

  try {
    fs.writeFileSync(pdfPath, pdfBuffer);

    // Run pdftoppm: converts each page to a PNG image
    // -r 150 = 150 DPI (good quality for OCR without being too large)
    // -l maxPages = stop after maxPages
    const args = ["-r", "150", "-png", "-l", String(maxPages)];
    if (password) args.push("-upw", password);
    args.push(pdfPath, outputPrefix);
    execFileSync("pdftoppm", args, { timeout: 60000, stdio: "pipe" });

    // Collect all generated page images (sorted by page number)
    const files = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith("page") && f.endsWith(".png"))
      .sort((a, b) => {
        // Extract page number from filename like "page-1.png" or "page-01.png"
        const numA = parseInt(a.replace(/[^0-9]/g, ""), 10) || 0;
        const numB = parseInt(b.replace(/[^0-9]/g, ""), 10) || 0;
        return numA - numB;
      });

    if (files.length === 0) {
      throw new Error("pdftoppm produced no output pages");
    }

    // Read each page image and convert to base64 data URL
    const pageDataUrls = files.map((file) => {
      const imgBuffer = fs.readFileSync(path.join(tmpDir, file));
      return `data:image/png;base64,${imgBuffer.toString("base64")}`;
    });

    return pageDataUrls;
  } finally {
    // Clean up temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Get the number of pages in a PDF without converting them.
 */
export function getPdfPageCount(pdfBuffer: Buffer): number {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fertiliv-pdfcount-"));
  const pdfPath = path.join(tmpDir, "input.pdf");
  try {
    fs.writeFileSync(pdfPath, pdfBuffer);
    const output = execFileSync("pdfinfo", [pdfPath], {
      timeout: 10000,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const match = output.match(/Pages:\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : 1;
  } catch {
    return 1;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
