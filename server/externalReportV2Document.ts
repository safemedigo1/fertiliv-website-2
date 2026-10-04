import type { ExternalReportDocument } from "./externalReportDocument";
import type { ExternalReportSourceLanguage } from "./externalReportProcessing";

const BULLET_LINE = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/;

export function createExternalReportV2Document(input: { language: ExternalReportSourceLanguage; title?: string | null; text: string }): ExternalReportDocument {
  const blocks: ExternalReportDocument["blocks"] = [];
  if (input.title?.trim()) blocks.push({ type: "heading", level: 1, text: input.title.trim() });
  const sections = input.text.trim().split(/\n\s*\n+/).map((part) => part.trim()).filter(Boolean);
  for (const section of sections) {
    const lines = section.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const bulletItems = lines.map((line) => line.match(BULLET_LINE)?.[1]?.trim()).filter((item): item is string => Boolean(item));
    if (bulletItems.length === lines.length && bulletItems.length > 0) {
      blocks.push({ type: "list", ordered: /^\s*\d+[.)]/.test(lines[0] ?? ""), items: bulletItems });
    } else blocks.push({ type: "paragraph", text: lines.join("\n") });
  }
  if (blocks.length === 0) blocks.push({ type: "paragraph", text: input.text.trim() || "—" });
  return { version: 1, language: input.language, blocks };
}

