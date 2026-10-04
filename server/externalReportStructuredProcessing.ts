import {
  externalReportDocumentSchema,
  type ExternalReportDocument,
} from "./externalReportDocument";
import type { ExternalReportProcessingGoal } from "./externalReportProcessing";

/**
 * Strict transport contract accepted by the Forge/Gemini structured-output gateway.
 * Gemini requires a concrete `items` schema and string-only enum values. The canonical
 * document is reconstructed and strictly validated below before it reaches any review
 * or persistence path.
 */
export const EXTERNAL_REPORT_DOCUMENT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    version: { type: "integer" },
    language: { type: "string", enum: ["en", "ar", "tr", "und"] },
    blocks: {
      type: "array",
      minItems: 1,
      maxItems: 1000,
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["heading", "paragraph", "list", "table", "callout", "verbatim"] },
          level: { type: "integer" }, text: { type: "string" }, label: { type: "string" }, ordered: { type: "boolean" },
          items: { type: "array", items: { type: "string" } }, caption: { type: "string" }, columns: { type: "array", items: { type: "string" } },
          rows: { type: "array", items: { type: "array", items: { type: "string" } } }, sourceVerified: { type: "boolean" },
        },
        required: ["type", "level", "text", "label", "ordered", "items", "caption", "columns", "rows", "sourceVerified"],
        additionalProperties: false,
      },
    },
  },
  required: ["version", "language", "blocks"],
  additionalProperties: false,
} as const;

type TransportBlock = Record<string, unknown>;
type StructuredOutputParseOptions = { allowSourceVerificationNormalization?: boolean };

const asText = (value: unknown, field: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Structured report block is missing ${field}.`);
  return value.trim();
};
const asStringList = (value: unknown, field: string) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`Structured report block has invalid ${field}.`);
  return value.map((item) => item.trim()).filter(Boolean);
};

function normalizeTransportBlock(block: TransportBlock, options: StructuredOutputParseOptions) {
  const type = asText(block.type, "type");
  if (type === "heading") return { type, level: [1, 2, 3].includes(block.level as number) ? block.level as 1 | 2 | 3 : 2, text: asText(block.text, "heading text") } as const;
  if (type === "paragraph") return { type, text: asText(block.text, "paragraph text"), ...(typeof block.label === "string" && block.label.trim() ? { label: block.label.trim() } : {}) } as const;
  if (type === "list") return { type, ordered: Boolean(block.ordered), items: asStringList(block.items, "list items") } as const;
  if (type === "table") {
    const columns = asStringList(block.columns, "table columns");
    const rows = !Array.isArray(block.rows) ? [] : block.rows.map((row) => asStringList(row, "table row"));
    const sourceVerified = block.sourceVerified === true
      || (options.allowSourceVerificationNormalization && (block.sourceVerified === "true" || block.source_verified === true || block.source_verified === "true"));
    if (!columns.length || !rows.length || rows.some((row) => row.length !== columns.length) || !sourceVerified) throw new Error("Structured report table is not source-verified or aligned.");
    return { type, ...(typeof block.caption === "string" && block.caption.trim() ? { caption: block.caption.trim() } : {}), columns, rows, sourceVerified: true } as const;
  }
  if (type === "callout") return { type, label: asText(block.label, "callout label"), text: asText(block.text, "callout text") } as const;
  if (type === "verbatim") return { type, text: asText(block.text, "verbatim text"), ...(typeof block.label === "string" && block.label.trim() ? { label: block.label.trim() } : {}) } as const;
  throw new Error("Structured report block has an unsupported type.");
}

export type ExternalReportProcessingFailureCategory = "provider_schema" | "provider_transport" | "structured_parse" | "structured_validation" | "output_language" | "source_safety";
export type ExternalReportStructuredFailureReason =
  | "no_json_object"
  | "incomplete_json_object"
  | "invalid_json"
  | "missing_blocks"
  | "invalid_block"
  | "invalid_table"
  | "canonical_schema"
  | "output_language"
  | "source_table_alignment"
  | "unknown";

/**
 * A fresh generation can occasionally correct malformed or wrong-language JSON without
 * relaxing any canonical validation. Provider failures are never retried here.
 */
export function shouldRetryStructuredExternalReportOutput(
  category: ExternalReportProcessingFailureCategory,
  attempt: number,
) {
  return attempt === 0 && (category === "structured_parse" || category === "structured_validation" || category === "output_language" || category === "source_safety");
}

const normalizeSourceFactCell = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ");

function isLikelyTableHeader(cells: string[]) {
  const text = cells.join(" ");
  return !cells.some((cell) => /\d/.test(cell)) && /(test|tetkik|result|sonuç|unit|birim|reference|referans)/i.test(text);
}

type ClearSourceTable = { columns: string[]; rows: string[][] };

function extractClearSourceTables(sourceText: string): ClearSourceTable[] {
  const rows = sourceText
    .split(/\r?\n/)
    .map((line) => line.split("|").map(normalizeSourceFactCell));
  const tables: ClearSourceTable[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const header = rows[index];
    if (header.length < 2 || header.some((cell) => !cell) || !isLikelyTableHeader(header)) continue;
    const tableRows: string[][] = [];
    for (let rowIndex = index + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      if (row.length !== header.length || row.some((cell) => !cell)) break;
      tableRows.push(row);
      index = rowIndex;
    }
    if (tableRows.length) tables.push({ columns: header, rows: tableRows });
  }

  return tables;
}

/**
 * For non-summary reports, a structurally aligned model table keeps only model-provided headers
 * and first-column labels. All other cells are copied from the immutable source deterministically.
 * This permits translated labels without allowing a model to mutate values, units, ranges, flags,
 * or qualitative results. Any ambiguous source or generated structure is rejected rather than guessed.
 */
export function hydrateSourceBackedExternalReportTables(
  sourceText: string,
  document: ExternalReportDocument,
  processingGoal: ExternalReportProcessingGoal,
) : ExternalReportDocument {
  if (processingGoal === "summarize") return document;

  const sourceTables = extractClearSourceTables(sourceText);
  const generatedTables = document.blocks.filter((block): block is Extract<ExternalReportDocument["blocks"][number], { type: "table" }> => block.type === "table" && block.sourceVerified);
  if (!sourceTables.length) {
    if (generatedTables.length) throw new Error("A source-verified table requires clearly aligned source rows.");
    return document;
  }
  if (generatedTables.length !== sourceTables.length) {
    throw new Error("A source-backed table structure could not be safely aligned with the immutable source.");
  }

  let tableIndex = 0;
  return {
    ...document,
    blocks: document.blocks.map((block) => {
      if (block.type !== "table" || !block.sourceVerified) return block;
      const sourceTable = sourceTables[tableIndex++];
      if (block.columns.length !== sourceTable.columns.length || block.rows.length !== sourceTable.rows.length) {
        throw new Error("A source-backed table structure could not be safely aligned with the immutable source.");
      }
      return {
        ...block,
        rows: block.rows.map((row, rowIndex) => [row[0], ...sourceTable.rows[rowIndex].slice(1)]),
      };
    }),
  };
}

/** Retained for callers that need a validation-only source-safety assertion. */
export function assertSourceBackedExternalReportTables(
  sourceText: string,
  document: ExternalReportDocument,
  processingGoal: ExternalReportProcessingGoal,
) {
  hydrateSourceBackedExternalReportTables(sourceText, document, processingGoal);
}

export function getExternalReportProviderError(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("error" in value) || !(value as { error?: unknown }).error) return null;
  const error = (value as { error: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") return (error as { message: string }).message;
  return "Provider returned an invalid error envelope.";
}

export function classifyExternalReportProcessingFailure(error: unknown): ExternalReportProcessingFailureCategory {
  const detail = error instanceof Error ? error.message : String(error);
  if (/response_schema|generation_config|invalid_argument|enum value/i.test(detail)) return "provider_schema";
  if (/network|timeout|fetch|http|LLM invoke failed/i.test(detail)) return "provider_transport";
  if (/immutable source facts|source-backed table|source-verified table|immutable source/i.test(detail)) return "source_safety";
  if (/JSON/i.test(detail)) return "structured_parse";
  return "structured_validation";
}

/** Produces non-sensitive structural evidence for operational logs; never return or log response content. */
export function getExternalReportStructuredFailureReason(error: unknown): ExternalReportStructuredFailureReason {
  const detail = error instanceof Error ? error.message : String(error);
  if (/does not contain a JSON object/i.test(detail)) return "no_json_object";
  if (/does not contain a complete JSON object/i.test(detail)) return "incomplete_json_object";
  if (/Unexpected token|Unexpected end of JSON input|JSON/i.test(detail)) return "invalid_json";
  if (/has no blocks/i.test(detail)) return "missing_blocks";
  if (/table is not source-verified or aligned/i.test(detail)) return "invalid_table";
  if (/block is invalid|block is missing|block has invalid|unsupported type/i.test(detail)) return "invalid_block";
  if (/structured medical-document contract/i.test(detail)) return "canonical_schema";
  if (/output language/i.test(detail)) return "output_language";
  if (/source-backed table|source-verified table|immutable source/i.test(detail)) return "source_table_alignment";
  return "unknown";
}

/**
 * Extracts a single balanced JSON object without interpreting or repairing its contents.
 * This accepts harmless model wrappers (prose or nonstandard fences) while incomplete or
 * malformed JSON still reaches the unchanged parser as a safe failure.
 */
export function extractFirstCompleteJsonObject(value: string): string {
  const text = value.trim();
  let start = text.indexOf("{");
  while (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') { inString = true; continue; }
      if (character === "{") depth += 1;
      if (character === "}") {
        depth -= 1;
        if (depth === 0) return text.slice(start, index + 1);
      }
    }
    // This opening brace did not form an object; do not silently accept a later fragment.
    throw new Error("Structured report response does not contain a complete JSON object.");
  }
  throw new Error("Structured report response does not contain a JSON object.");
}

export function parseStructuredExternalReportOutput(value: unknown, options: StructuredOutputParseOptions = {}): ExternalReportDocument {
  const normalizedText = typeof value === "string"
    ? value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    : value;
  const candidate = typeof normalizedText === "string" ? JSON.parse(extractFirstCompleteJsonObject(normalizedText)) : normalizedText;
  if (!candidate || typeof candidate !== "object" || !Array.isArray((candidate as { blocks?: unknown }).blocks)) throw new Error("Structured report response has no blocks.");
  const normalized = {
    version: (candidate as { version?: unknown }).version,
    language: (candidate as { language?: unknown }).language,
    blocks: (candidate as { blocks: unknown[] }).blocks.map((block) => {
      if (!block || typeof block !== "object" || Array.isArray(block)) throw new Error("Structured report block is invalid.");
      return normalizeTransportBlock(block as TransportBlock, options);
    }),
  };
  const parsed = externalReportDocumentSchema.safeParse(normalized);
  if (!parsed.success || parsed.data.blocks.some((block) => block.type === "legacy_text")) {
    throw new Error("The AI response did not satisfy the structured medical-document contract.");
  }
  return parsed.data;
}

/** A compatibility projection for existing plain-text previews, email, and legacy PDF consumers. */
export function externalReportDocumentToPlainText(document: ExternalReportDocument): string {
  return document.blocks.map((block) => {
    if (block.type === "heading") return block.text;
    if (block.type === "legacy_text") return block.text;
    if (block.type === "paragraph" || block.type === "callout" || block.type === "verbatim") return block.label ? `${block.label}: ${block.text}` : block.text;
    if (block.type === "list") return block.items.map((item, index) => block.ordered ? `${index + 1}. ${item}` : `• ${item}`).join("\n");
    const caption = block.caption ? `${block.caption}\n` : "";
    return `${caption}${block.columns.join(" | ")}\n${block.rows.map((row) => row.join(" | ")).join("\n")}`;
  }).filter(Boolean).join("\n\n");
}

export function structuredMedicalReportInstruction(
  resolvedInstruction: string,
  processingGoal?: ExternalReportProcessingGoal,
): string {
  const summaryRule = processingGoal === "summarize"
    ? " For a summary, use only heading, paragraph, list, and callout blocks. Do not return a table block or claim source verification; the immutable source remains the complete evidence."
    : "";
  return `${resolvedInstruction}

Return only one JSON object and no Markdown code fence. The exact top-level shape is {"version":1,"language":"en|ar|tr|und","blocks":[...]}. Each block must use exactly one allowed type: heading {"type":"heading","level":1|2|3,"text":"..."}; paragraph {"type":"paragraph","text":"...","label":"optional"}; list {"type":"list","ordered":true|false,"items":["..."]}; table {"type":"table","caption":"optional","columns":["..."],"rows":[["..."]],"sourceVerified":true}; callout {"type":"callout","label":"...","text":"..."}; or verbatim {"type":"verbatim","text":"...","label":"optional"}. Preserve every test identity, numeric value, qualitative result, unit, reference range, date, and source finding exactly. Translate only textual labels and explanatory prose when requested. In every sourceVerified table, copy each value, unit, reference-range, flag, and qualitative-result cell from the source character-for-character; only table headers and the first-column test labels may be translated. Never invent units, reference ranges, diagnoses, or clinical interpretation. When laboratory rows have clearly aligned columns in the source, return a sourceVerified table using only columns and cells supported by the source. Otherwise preserve the content in paragraphs, lists, or verbatim blocks. Keep explanatory text as a separate paragraph or callout rather than forcing it into laboratory cells. For Arabic, use Arabic labels but preserve numeric values and measurement tokens exactly as written.${summaryRule}`;
}
