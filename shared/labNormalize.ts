/**
 * Lab test name normalization and synonym matching.
 *
 * Used by both the server (importLabResultsFromText) and the client (LabImportModal)
 * to match raw AI-extracted test names to predefined canonical test names.
 */

// ─── Predefined canonical test names (must match FEMALE_DEFAULT_TESTS / MALE_DEFAULT_TESTS) ───

export const FEMALE_PREDEFINED_TESTS = [
  "AMH (Anti-Müllerian Hormone)",
  "FSH (Follicle-Stimulating Hormone)",
  "LH (Luteinizing Hormone)",
  "Estradiol (E2)",
  "Progesterone",
  "Prolactin",
  "TSH (Thyroid-Stimulating Hormone)",
  "AFC (Antral Follicle Count)",
  "Rubella IgG",
  "Hepatitis B (HBsAg)",
  "Hepatitis C (Anti-HCV)",
  "HIV",
];

export const MALE_PREDEFINED_TESTS = [
  "FSH (Follicle-Stimulating Hormone)",
  "LH (Luteinizing Hormone)",
  "Testosterone (Total)",
  "Prolactin",
  "TSH (Thyroid-Stimulating Hormone)",
  "Hepatitis B (HBsAg)",
  "Hepatitis C (Anti-HCV)",
  "HIV",
];

export const ALL_PREDEFINED_TESTS = Array.from(
  new Set([...FEMALE_PREDEFINED_TESTS, ...MALE_PREDEFINED_TESTS])
);

// ─── Synonym map: normalized alias → canonical test name ───────────────────────
// Keys are lowercase, prefix-stripped, punctuation-removed forms.
// Values are the canonical names from the predefined lists above.

const SYNONYM_MAP: Record<string, string> = {
  // AMH
  "amh": "AMH (Anti-Müllerian Hormone)",
  "antimullerian hormone": "AMH (Anti-Müllerian Hormone)",
  "anti mullerian hormone": "AMH (Anti-Müllerian Hormone)",
  "antimuller hormone": "AMH (Anti-Müllerian Hormone)",
  "antimüller hormone": "AMH (Anti-Müllerian Hormone)",
  "anti-müllerian hormone": "AMH (Anti-Müllerian Hormone)",
  "anti mullerian": "AMH (Anti-Müllerian Hormone)",
  "amh anti mullerian hormone": "AMH (Anti-Müllerian Hormone)",

  // FSH
  "fsh": "FSH (Follicle-Stimulating Hormone)",
  "follicle stimulating hormone": "FSH (Follicle-Stimulating Hormone)",
  "follicle-stimulating hormone": "FSH (Follicle-Stimulating Hormone)",
  "fsh follicle stimulating hormone": "FSH (Follicle-Stimulating Hormone)",

  // LH
  "lh": "LH (Luteinizing Hormone)",
  "luteinizing hormone": "LH (Luteinizing Hormone)",
  "luteinising hormone": "LH (Luteinizing Hormone)",
  "lh luteinizing hormone": "LH (Luteinizing Hormone)",

  // Estradiol
  "estradiol": "Estradiol (E2)",
  "oestradiol": "Estradiol (E2)",
  "e2": "Estradiol (E2)",
  "estradiol e2": "Estradiol (E2)",
  "17beta estradiol": "Estradiol (E2)",
  "17-beta estradiol": "Estradiol (E2)",

  // Progesterone
  "progesterone": "Progesterone",
  "p4": "Progesterone",
  "serum progesterone": "Progesterone",

  // Prolactin
  "prolactin": "Prolactin",
  "prl": "Prolactin",
  "serum prolactin": "Prolactin",

  // TSH
  "tsh": "TSH (Thyroid-Stimulating Hormone)",
  "thyroid stimulating hormone": "TSH (Thyroid-Stimulating Hormone)",
  "thyroid-stimulating hormone": "TSH (Thyroid-Stimulating Hormone)",
  "thyrotropin": "TSH (Thyroid-Stimulating Hormone)",
  "tsh thyroid stimulating hormone": "TSH (Thyroid-Stimulating Hormone)",

  // AFC
  "afc": "AFC (Antral Follicle Count)",
  "antral follicle count": "AFC (Antral Follicle Count)",
  "antral follicle": "AFC (Antral Follicle Count)",

  // Rubella
  "rubella igg": "Rubella IgG",
  "rubella": "Rubella IgG",
  "rubella antibody": "Rubella IgG",
  "rubella igg antibody": "Rubella IgG",

  // Hepatitis B
  "hepatitis b": "Hepatitis B (HBsAg)",
  "hbsag": "Hepatitis B (HBsAg)",
  "hepatitis b hbsag": "Hepatitis B (HBsAg)",
  "hbsag screen": "Hepatitis B (HBsAg)",
  "hepatitis b surface antigen": "Hepatitis B (HBsAg)",
  "hbs ag": "Hepatitis B (HBsAg)",
  "hbv": "Hepatitis B (HBsAg)",

  // Hepatitis C
  "hepatitis c": "Hepatitis C (Anti-HCV)",
  "hcv": "Hepatitis C (Anti-HCV)",
  "hcv ab": "Hepatitis C (Anti-HCV)",
  "anti hcv": "Hepatitis C (Anti-HCV)",
  "hepatitis c anti hcv": "Hepatitis C (Anti-HCV)",
  "hepatitis c antibody": "Hepatitis C (Anti-HCV)",
  "hcv antibody": "Hepatitis C (Anti-HCV)",

  // HIV
  "hiv": "HIV",
  "hiv screen": "HIV",
  "hiv screen 4th generation": "HIV",
  "hiv 1 2": "HIV",
  "hiv 1/2": "HIV",
  "hiv ab": "HIV",
  "hiv antibody": "HIV",
  "hiv antigen antibody": "HIV",
  "hiv ag ab": "HIV",

  // Testosterone
  "testosterone": "Testosterone (Total)",
  "total testosterone": "Testosterone (Total)",
  "testosterone total": "Testosterone (Total)",
  "serum testosterone": "Testosterone (Total)",
  "testosterone  total": "Testosterone (Total)",

  // Extra LH variants (after parenthetical stripping)
  "lh luteinising hormone": "LH (Luteinizing Hormone)",

  // SHBG (not in predefined but may be in patient's existing tests)
  "shbg": "SHBG (Sex Hormone-Binding Globulin)",
  "sex hormone binding globulin": "SHBG (Sex Hormone-Binding Globulin)",
  "sex hormone-binding globulin": "SHBG (Sex Hormone-Binding Globulin)",

  // HbA1c
  "hba1c": "HbA1c (Glycated Hemoglobin)",
  "glycated hemoglobin": "HbA1c (Glycated Hemoglobin)",
  "glycated haemoglobin": "HbA1c (Glycated Hemoglobin)",
  "hemoglobin a1c": "HbA1c (Glycated Hemoglobin)",
  "haemoglobin a1c": "HbA1c (Glycated Hemoglobin)",
  "a1c": "HbA1c (Glycated Hemoglobin)",

  // TPO Antibody
  "tpo": "TPO Antibody (Anti-Thyroid Peroxidase)",
  "tpo antibody": "TPO Antibody (Anti-Thyroid Peroxidase)",
  "anti tpo": "TPO Antibody (Anti-Thyroid Peroxidase)",
  "anti-tpo": "TPO Antibody (Anti-Thyroid Peroxidase)",
  "thyroid peroxidase antibody": "TPO Antibody (Anti-Thyroid Peroxidase)",
  "thyroid peroxidase ab": "TPO Antibody (Anti-Thyroid Peroxidase)",

  // Free T4 / Free T3
  "free t4": "Free T4 (Free Thyroxine)",
  "ft4": "Free T4 (Free Thyroxine)",
  "free thyroxine": "Free T4 (Free Thyroxine)",
  "thyroxine free": "Free T4 (Free Thyroxine)",
  "free t3": "Free T3 (Free Triiodothyronine)",
  "ft3": "Free T3 (Free Triiodothyronine)",
  "free triiodothyronine": "Free T3 (Free Triiodothyronine)",

  // Insulin
  "insulin": "Insulin (Fasting)",
  "fasting insulin": "Insulin (Fasting)",
  "insulin fasting": "Insulin (Fasting)",

  // Glucose
  "glucose": "Glucose (Fasting)",
  "fasting glucose": "Glucose (Fasting)",
  "blood glucose": "Glucose (Fasting)",
  "fasting blood glucose": "Glucose (Fasting)",
  "fasting blood sugar": "Glucose (Fasting)",
  "fbs": "Glucose (Fasting)",
};

// ─── Normalization helpers ─────────────────────────────────────────────────────

/**
 * Strip common lab prefixes and normalize a test name for matching.
 * Examples:
 *   "P-FSH"              → "fsh"
 *   "S-Prolactin"        → "prolactin"
 *   "B-HbA1c"            → "hba1c"
 *   "Serum TSH"          → "tsh"
 *   "Plasma Estradiol"   → "estradiol"
 *   "P-Antimüller hormone" → "antimüller hormone"
 */
export function normalizeName(raw: string): string {
  let s = raw.trim().toLowerCase();

  // Strip single-letter prefixes like P-, S-, B-, U-, C-, F-
  s = s.replace(/^[a-z]-\s*/i, "");

  // Strip word prefixes (at start of string)
  const wordPrefixes = [
    "serum", "plasma", "blood", "whole blood", "urine", "cerebrospinal fluid",
    "csf", "random", "fasting", "total", "free",
  ];
  for (const prefix of wordPrefixes) {
    const re = new RegExp(`^${prefix}\\s+`, "i");
    s = s.replace(re, "");
  }

  // Remove parenthetical abbreviation suffixes like " (LH)", " (E2)", " (HBsAg)" etc.
  // These appear at the END of the string and are just abbreviations for the full name
  s = s.replace(/\s*\([^)]{1,20}\)\s*$/, "");

  // Remove commas (e.g. "Testosterone, Total" → "Testosterone Total")
  s = s.replace(/,/g, "");

  // Normalize punctuation: replace hyphens/slashes/underscores with space
  s = s.replace(/[-_/]/g, " ");

  // Collapse multiple spaces
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

// ─── Main matching function ────────────────────────────────────────────────────

export interface MatchResult {
  /** The canonical predefined test name, or null if no match found */
  canonicalName: string | null;
  /** Whether a match was found in the predefined list */
  isMatched: boolean;
  /** The normalized form of the raw name (for debugging) */
  normalizedRaw: string;
  /** How the match was made: 'exact' | 'synonym' | 'partial' | 'token' | 'fuzzy' | 'none' */
  matchType?: string;
  /** Confidence score 0-100. <70 = low confidence, should show as needsReview */
  confidence?: number;
  /** Whether this match is low-confidence and should be flagged for user review */
  lowConfidence?: boolean;
}

/**
 * Compute Levenshtein edit distance between two strings.
 * Used for fuzzy/spell-correction matching of lab test names.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // Use a single row DP to save memory
  const prev: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  const curr: number[] = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,       // insertion
        prev[j] + 1,           // deletion
        prev[j - 1] + cost,    // substitution
      );
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[n];
}

/**
 * Returns true if two normalized names are "close enough" to be the same test.
 * Threshold scales with string length: allows 1 edit per 8 chars, min 1, max 3.
 */
export function isFuzzyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen < 3) return false;
  const threshold = Math.min(3, Math.max(1, Math.floor(maxLen / 8)));
  return levenshtein(a, b) <= threshold;
}

/**
 * Extract the "suffix type" of a lab test name.
 * Returns '#' for absolute counts, '%' for percentages, 'ratio' for ratios, '' otherwise.
 * Used to block cross-suffix fuzzy matches (e.g. Neutrophil# vs Neutrophil%).
 */
export function getSuffixType(name: string): string {
  const n = name.trim();
  if (/#$/.test(n) || /\s#$/.test(n) || /count$/i.test(n) || /absolute$/i.test(n)) return '#';
  if (/%$/.test(n) || /\s%$/.test(n) || /percent(age)?$/i.test(n)) return '%';
  if (/ratio$/i.test(n)) return 'ratio';
  return '';
}

/**
 * Check if two test names have incompatible suffixes (e.g. # vs %).
 * If both have a suffix type and they differ, they cannot be the same test.
 */
export function hasSuffixConflict(a: string, b: string): boolean {
  const sa = getSuffixType(a);
  const sb = getSuffixType(b);
  // If both have a suffix type and they differ → conflict
  if (sa && sb) return sa !== sb;
  // If one has a suffix and the other doesn't → conflict:
  // Hb% must NOT match unsuffixed Hb, and Hb# must NOT match unsuffixed Hb
  if (sa && !sb) return true;
  if (!sa && sb) return true;
  // Neither has a suffix → no conflict
  return false;
}

/**
 * Normalize a unit string for comparison.
 * Returns a canonical unit category: 'percent', 'count', 'mass', 'volume', 'iu', 'other', ''
 */
export function normalizeUnit(unit?: string): string {
  if (!unit) return '';
  const u = unit.trim().toLowerCase();
  if (u === '%' || u === 'percent' || u === 'pct') return 'percent';
  if (/^10[\^*]?[369]\/?(l|ul|ml)?$/.test(u) || u === 'cells/ul' || u === '/ul' || u === 'k/ul' || u === 'g/l') return 'count';
  if (u === 'g/dl' || u === 'g/l' || u === 'mg/dl' || u === 'mg/l' || u === 'ug/dl' || u === 'ng/dl' || u === 'pg/ml' || u === 'ng/ml' || u === 'ug/l') return 'mass';
  if (u === 'fl' || u === 'pl' || u === 'ul' || u === 'ml' || u === 'l') return 'volume';
  if (u === 'iu/l' || u === 'miu/ml' || u === 'miu/l' || u === 'iu/ml' || u === 'u/ml' || u === 'u/l') return 'iu';
  return 'other';
}

/**
 * Match a raw AI-extracted test name to a canonical predefined test name.
 *
 * Matching strategy (in order):
 * 1. Exact match (case-insensitive) against predefined list
 * 2. Synonym map lookup (after normalization)
 * 3. Partial/contains match against predefined list (normalized)
 * 4. No match → isMatched = false
 */
export function matchTestName(
  rawName: string,
  predefinedTests: string[] = ALL_PREDEFINED_TESTS
): MatchResult {
  const normalized = normalizeName(rawName);

  // 1. Exact case-insensitive match against predefined list
  const exactMatch = predefinedTests.find(
    p => p.toLowerCase() === rawName.trim().toLowerCase()
  );
  if (exactMatch) {
    return { canonicalName: exactMatch, isMatched: true, normalizedRaw: normalized };
  }

  // 2. Synonym map lookup
  const synonymMatch = SYNONYM_MAP[normalized];
  if (synonymMatch && predefinedTests.includes(synonymMatch)) {
    return { canonicalName: synonymMatch, isMatched: true, normalizedRaw: normalized };
  }

  // 3. Partial match: normalized predefined name contains normalized raw or vice versa
  const normalizedPredefined = predefinedTests.map(p => ({
    original: p,
    normalized: normalizeName(p),
  }));

  // Check if normalized raw is contained in any predefined normalized name
  const containsMatch = normalizedPredefined.find(
    p => !hasSuffixConflict(rawName, p.original) &&
      (p.normalized.includes(normalized) || normalized.includes(p.normalized))
  );
  if (containsMatch && normalized.length >= 3) {
    return { canonicalName: containsMatch.original, isMatched: true, normalizedRaw: normalized, matchType: 'partial', confidence: 85 };
  }

  // 4. Token-based matching: split into words and check if all significant tokens
  //    from the raw name appear in a predefined name (or vice versa)
  //    This handles cases like "Follicle Stimulating Hormone" matching "FSH (Follicle-Stimulating Hormone)"
  const STOP_WORDS = new Set(["the", "a", "an", "and", "or", "of", "in", "for", "test", "level", "serum", "plasma"]);
  const rawTokens = normalized.split(" ").filter(t => t.length > 2 && !STOP_WORDS.has(t));

  if (rawTokens.length >= 2) {
    // Find predefined test where ALL raw tokens appear in the normalized predefined name
    const tokenMatch = normalizedPredefined.find(p => {
      if (hasSuffixConflict(rawName, p.original)) return false;
      return rawTokens.every(token => p.normalized.includes(token));
    });
    if (tokenMatch) {
      return { canonicalName: tokenMatch.original, isMatched: true, normalizedRaw: normalized, matchType: 'token', confidence: 80 };
    }

    // Reverse: find predefined test where ALL its tokens appear in the raw name
    const reverseTokenMatch = normalizedPredefined.find(p => {
      if (hasSuffixConflict(rawName, p.original)) return false;
      const predTokens = p.normalized.split(" ").filter(t => t.length > 2 && !STOP_WORDS.has(t));
      return predTokens.length >= 2 && predTokens.every(token => normalized.includes(token));
    });
    if (reverseTokenMatch) {
      return { canonicalName: reverseTokenMatch.original, isMatched: true, normalizedRaw: normalized, matchType: 'token', confidence: 80 };
    }
  }

  // 5. Fuzzy Levenshtein match: find the closest predefined name within edit-distance threshold
  //    This catches spelling errors like "Neutrophil%" vs "Neutrophil %" or "Neutrophyll" vs "Neutrophil"
  //    BLOCKED if names have conflicting suffixes (# vs %)
  let bestFuzzyMatch: string | null = null;
  let bestFuzzyDist = Infinity;
  for (const p of normalizedPredefined) {
    // Block suffix conflicts: Neutrophil# must never match Neutrophil %
    if (hasSuffixConflict(rawName, p.original)) continue;
    const dist = levenshtein(normalized, p.normalized);
    const maxLen = Math.max(normalized.length, p.normalized.length);
    // Tighter threshold for fuzzy: max 2 edits (was 3), require at least 50% similarity
    const threshold = Math.min(2, Math.max(1, Math.floor(maxLen / 10)));
    const similarity = 1 - dist / maxLen;
    if (dist <= threshold && similarity >= 0.75 && dist < bestFuzzyDist) {
      bestFuzzyDist = dist;
      bestFuzzyMatch = p.original;
    }
  }
  if (bestFuzzyMatch) {
    // Fuzzy matches are low-confidence — flag for user review
    const maxLen = Math.max(normalized.length, normalizeName(bestFuzzyMatch).length);
    const confidence = Math.round((1 - bestFuzzyDist / maxLen) * 100);
    return {
      canonicalName: bestFuzzyMatch,
      isMatched: true,
      normalizedRaw: normalized,
      matchType: 'fuzzy',
      confidence,
      lowConfidence: confidence < 85,
    };
  }

  // 6. No match
  return { canonicalName: null, isMatched: false, normalizedRaw: normalized, matchType: 'none', confidence: 0 };
}

/**
 * Normalize a date string to ISO format YYYY-MM-DD.
 * Handles common formats: DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, YYYY-MM-DD.
 * Returns empty string if parsing fails.
 */
export function normalizeDate(raw: string): string {
  if (!raw) return "";
  const s = raw.trim();

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    // Assume DD/MM/YYYY (European/Middle East format)
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // MM/DD/YYYY (US format) — only if month > 12 is impossible
  const mmddyyyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mmddyyyy) {
    const [, m, d, y] = mmddyyyy;
    if (parseInt(m) <= 12 && parseInt(d) <= 31) {
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }

  return "";
}
