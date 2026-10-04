import type { ExternalReportProcessingGoal, ExternalReportSourceLanguage } from "./externalReportProcessing";

export const externalReportV2SafetyStates = ["auto_verified", "manual_verification_required"] as const;
export type ExternalReportV2SafetyState = (typeof externalReportV2SafetyStates)[number];
export const externalReportV2UnsupportedFactTypes = [
  "unsupported_numeric_token",
  "unsupported_percentage_token",
  "unsupported_unit_token",
  "unsupported_range_token",
  "unsupported_date_token",
  "unsupported_qualitative_status_token",
  "unsupported_other_deterministic_token",
] as const;
export type ExternalReportV2UnsupportedFactType = (typeof externalReportV2UnsupportedFactTypes)[number];

export class ExternalReportV2UnsupportedFactError extends Error {
  constructor(readonly subreason: ExternalReportV2UnsupportedFactType) {
    super("V2_UNSUPPORTED_DETERMINISTIC_FACT");
  }
}

export type ExternalReportV2SafetyAssessment = {
  state: ExternalReportV2SafetyState;
  sourceFactCount: number;
  outputFactCount: number;
  missingSourceFactCount: number;
  reasons: Array<"ambiguous_source" | "source_fact_omitted" | "narrative_requires_review">;
};

const NUMERIC_FACT = /[-+]?\d+(?:[.,]\d+)?\s*(?:%|x10\^?\d+\/?[a-zµμ]+|10\^?\d+\/?[a-zµμ]+|(?:million|milyon)\s*(?:\/|per)\s*ml|ng\/?ml|pg\/?ml|iu\/?l|u\/?l|miu\/?ml|mmol\/?l|mg\/?dl|g\/?dl|g\/?l|fl|pg|(?:milli|mil)[l]?it(?:er|re)s?|ml|mm|cm|µm|μm|hours?|hrs?|days?|weeks?|mins?|minutes?|dk\.?|dakika|gün|gun)?/gi;
const RANGE_FACT = /(?:[<>≤≥]\s*)?[-+]?\d+(?:[.,]\d+)?\s*(?:-|–|—|to)\s*[-+]?\d+(?:[.,]\d+)?(?:\s*(?:%|[a-zµμ]+\/?[a-zµμ]+))?/gi;
const DATE_FACT = /\b(?:19|20)\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b/g;
const NUMERIC_UNIT_FACT = /^([<>≤≥]?[-+]?\d+(?:\.\d+)?)(.+)$/;
const SAME_SCALE_UNIT_ALIASES: Readonly<Record<string, string>> = {
  ml: "ml", milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml", mililiter: "ml", mililitre: "ml",
  "million/ml": "million/ml", "millionperml": "million/ml", "milyon/ml": "million/ml", "milyonperml": "million/ml",
  min: "min", mins: "min", minute: "min", minutes: "min", dk: "min", dakika: "min",
  day: "day", days: "day", gün: "day", gun: "day",
  hour: "hour", hours: "hour", hr: "hour", hrs: "hour", week: "week", weeks: "week",
  "ng/ml": "ng/ml", "pg/ml": "pg/ml", "iu/l": "iu/l", "u/l": "u/l", "miu/ml": "miu/ml",
  "mg/dl": "mg/dl", "mmol/l": "mmol/l", "g/dl": "g/dl", "g/l": "g/l", fl: "fl", pg: "pg", mm: "mm", cm: "cm", µm: "µm", μm: "µm",
};
const STATUS_WORDS = [
  "positive", "negative", "reactive", "nonreactive", "non-reactive", "normal", "abnormal", "high", "low",
  "pozitif", "negatif", "reaktif", "nonreaktif", "normal", "anormal", "yüksek", "dusuk", "düşük",
  "إيجابي", "سلبي", "تفاعلي", "غير تفاعلي", "طبيعي", "غير طبيعي", "مرتفع", "منخفض",
];

function caseFoldFactText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\u0307/g, "").replace(/ı/g, "i");
}

function normalizeFact(value: string) {
  return caseFoldFactText(value).replace(/[−–—]/g, "-").replace(/\s+/g, " ")
    .replace(/\s*([/%^<>≤≥-])\s*/g, "$1").replace(/,/g, ".")
    .replace(/milyon\/ml/g, "million/ml")
    .trim();
}

function canonicalizeSameScaleUnit(value: string): string | undefined {
  const normalized = caseFoldFactText(value)
    .replace(/[.·]/g, "")
    .replace(/[／⁄]/g, "/")
    .replace(/\s+/g, "");
  return SAME_SCALE_UNIT_ALIASES[normalized];
}

function sameScaleNumericUnitFact(left: string, right: string) {
  const leftMatch = left.match(NUMERIC_UNIT_FACT);
  const rightMatch = right.match(NUMERIC_UNIT_FACT);
  if (!leftMatch || !rightMatch || leftMatch[1] !== rightMatch[1]) return false;
  const leftUnit = canonicalizeSameScaleUnit(leftMatch[2] ?? "");
  const rightUnit = canonicalizeSameScaleUnit(rightMatch[2] ?? "");
  return Boolean(leftUnit && rightUnit && leftUnit === rightUnit);
}

export function extractExternalReportV2DeterministicFacts(text: string): string[] {
  const facts = new Set<string>();
  const searchableText = caseFoldFactText(text);
  for (const pattern of [RANGE_FACT, NUMERIC_FACT, DATE_FACT]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(searchableText)) !== null) {
      const normalized = normalizeFact(match[0] ?? "");
      if (normalized) facts.add(normalized);
    }
  }
  const normalizedText = ` ${normalizeFact(text)} `;
  for (const status of STATUS_WORDS) {
    const normalized = normalizeFact(status);
    if (normalizedText.includes(` ${normalized} `)) facts.add(`status:${normalized}`);
  }
  return Array.from(facts).sort();
}

function tokenSupported(fact: string, candidates: Set<string>) {
  if (candidates.has(fact)) return true;
  if (Array.from(candidates).some((candidate) => sameScaleNumericUnitFact(fact, candidate))) return true;
  if (!fact.startsWith("status:")) return false;
  const status = fact.slice("status:".length);
  const equivalence = new Map<string, string[]>([
    ["positive", ["pozitif", "إيجابي"]], ["negative", ["negatif", "سلبي"]],
    ["reactive", ["reaktif", "تفاعلي"]], ["nonreactive", ["nonreaktif", "non-reactive", "غير تفاعلي"]],
    ["normal", ["طبيعي"]], ["abnormal", ["anormal", "غير طبيعي"]],
    ["high", ["yüksek", "مرتفع"]], ["low", ["dusuk", "düşük", "منخفض"]],
  ]);
  const variants = [status, ...(equivalence.get(status) ?? [])];
  equivalence.forEach((translations, canonical) => {
    if (translations.includes(status)) variants.push(canonical, ...translations);
  });
  return variants.some((variant) => candidates.has(`status:${normalizeFact(variant)}`));
}

/** Classifies an already-extracted fact without recording that fact or its source. */
export function classifyExternalReportV2UnsupportedFactType(fact: string): ExternalReportV2UnsupportedFactType {
  if (fact.startsWith("status:")) return "unsupported_qualitative_status_token";
  DATE_FACT.lastIndex = 0;
  if (DATE_FACT.test(fact)) { DATE_FACT.lastIndex = 0; return "unsupported_date_token"; }
  RANGE_FACT.lastIndex = 0;
  if (RANGE_FACT.test(fact)) { RANGE_FACT.lastIndex = 0; return "unsupported_range_token"; }
  if (/%/.test(fact)) return "unsupported_percentage_token";
  if (/\d/.test(fact) && /[a-zµμ]/i.test(fact)) return "unsupported_unit_token";
  if (/\d/.test(fact)) return "unsupported_numeric_token";
  return "unsupported_other_deterministic_token";
}

export function assessExternalReportV2Safety(input: {
  sourceText: string;
  outputText: string;
  processingGoal: ExternalReportProcessingGoal;
  outputLanguage: ExternalReportSourceLanguage;
}): ExternalReportV2SafetyAssessment {
  const sourceFacts = extractExternalReportV2DeterministicFacts(input.sourceText);
  const outputFacts = extractExternalReportV2DeterministicFacts(input.outputText);
  const sourceSet = new Set(sourceFacts);
  const outputSet = new Set(outputFacts);
  const unsupportedFact = outputFacts.find((fact) => !tokenSupported(fact, sourceSet));
  if (unsupportedFact) throw new ExternalReportV2UnsupportedFactError(classifyExternalReportV2UnsupportedFactType(unsupportedFact));

  const missingSource = input.processingGoal === "summarize" ? [] : sourceFacts.filter((fact) => !tokenSupported(fact, outputSet));
  const reasons: ExternalReportV2SafetyAssessment["reasons"] = [];
  if (sourceFacts.length === 0) reasons.push("ambiguous_source");
  if (missingSource.length > 0) reasons.push("source_fact_omitted");
  if (sourceFacts.length < 2 || /(?:impression|interpretation|conclusion|yorum|sonuç|الخلاصة|الانطباع)/i.test(input.sourceText)) reasons.push("narrative_requires_review");
  return {
    state: reasons.length > 0 ? "manual_verification_required" : "auto_verified",
    sourceFactCount: sourceFacts.length,
    outputFactCount: outputFacts.length,
    missingSourceFactCount: missingSource.length,
    reasons: Array.from(new Set(reasons)),
  };
}
