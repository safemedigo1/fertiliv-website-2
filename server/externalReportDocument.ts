import { z } from "zod";

const blockText = z.string().trim().min(1).max(50_000);

export const externalReportBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), text: blockText }),
  z.object({ type: z.literal("paragraph"), text: blockText, label: z.string().trim().min(1).max(200).optional() }),
  z.object({ type: z.literal("list"), ordered: z.boolean().default(false), items: z.array(blockText).min(1).max(100) }),
  z.object({
    type: z.literal("table"),
    caption: z.string().trim().min(1).max(500).optional(),
    columns: z.array(blockText.max(500)).min(1).max(16),
    rows: z.array(z.array(z.string().max(20_000)).min(1).max(16)).max(1_000),
    sourceVerified: z.boolean().default(false),
  }).superRefine((table, ctx) => {
    table.rows.forEach((row, index) => {
      if (row.length !== table.columns.length) {
        ctx.addIssue({ code: "custom", message: "Every table row must match the column count.", path: ["rows", index] });
      }
    });
  }),
  z.object({ type: z.literal("callout"), label: blockText.max(200), text: blockText }),
  z.object({ type: z.literal("verbatim"), text: blockText, label: z.string().trim().min(1).max(200).optional() }),
  z.object({ type: z.literal("legacy_text"), text: z.string().max(200_000) }),
]);

export const externalReportDocumentSchema = z.object({
  version: z.literal(1),
  language: z.enum(["en", "ar", "tr", "und"]),
  blocks: z.array(externalReportBlockSchema).min(1).max(1_000),
});

export type ExternalReportDocument = z.infer<typeof externalReportDocumentSchema>;

export function createLegacyExternalReportDocument(
  processedContent: string | null | undefined,
  language: string | null | undefined,
): ExternalReportDocument {
  const resolvedLanguage = language === "en" || language === "ar" || language === "tr" ? language : "und";
  return {
    version: 1,
    language: resolvedLanguage,
    blocks: [{ type: "legacy_text", text: processedContent ?? "" }],
  };
}

/** Parse a structured document only when it is a valid Phase B block model. */
export function parseExternalReportDocument(value: unknown): ExternalReportDocument | null {
  if (!value) return null;
  try {
    const candidate = typeof value === "string" ? JSON.parse(value) : value;
    return externalReportDocumentSchema.safeParse(candidate).data ?? null;
  } catch {
    return null;
  }
}

/**
 * New reports store a validated document; historical or malformed structured values fall back
 * to one legacy_text block without rewriting the persisted historical report.
 */
export function readExternalReportDocument(opts: {
  processedDocumentJson?: unknown;
  processedContent?: string | null;
  resolvedOutputLanguage?: string | null;
  legacyLanguage?: string | null;
}): ExternalReportDocument {
  return parseExternalReportDocument(opts.processedDocumentJson)
    ?? createLegacyExternalReportDocument(opts.processedContent, opts.resolvedOutputLanguage ?? opts.legacyLanguage);
}
