/**
 * Phone number normalization utilities.
 *
 * Converts any phone number format to a normalized digits-only string
 * suitable for consistent storage and fuzzy search.
 *
 * Examples:
 *   +34 604 87 80 04  → +34604878004
 *   0034 604 87 80 04 → +34604878004
 *   +34 (604) 87 80 04 → +34604878004
 *   00905551234567    → +905551234567
 *   05551234567       → 05551234567  (no country code — kept as-is)
 */

/**
 * Normalize a phone number for storage.
 * - Strips all spaces, dashes, dots, parentheses
 * - Converts leading 00XX to +XX (international prefix)
 * - Returns null/undefined as-is
 */
export function normalizePhone(phone: string | null | undefined): string | null | undefined {
  if (!phone) return phone;

  // Remove all whitespace, dashes, dots, parentheses, slashes
  let normalized = phone.replace(/[\s\-\.\(\)\/]/g, "");

  // Convert 00XX country code prefix to +XX
  if (normalized.startsWith("00")) {
    normalized = "+" + normalized.slice(2);
  }

  return normalized;
}

/**
 * Normalize a stored phone number for an explicit `tel:` URI.
 * This deliberately validates the complete normalized value and never slices,
 * formats, or infers a country code from the visible presentation string.
 */
export function normalizeCallablePhone(phone: string | null | undefined): string | null {
  const normalized = normalizePhone(phone)?.trim();
  if (!normalized || !/^\+?\d+$/.test(normalized)) return null;
  return normalized;
}

/**
 * Strip a phone number down to digits only (for search comparison).
 * Used to compare a search query against stored numbers regardless of format.
 */
export function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Check if two phone numbers refer to the same number (fuzzy match).
 * Compares digit sequences, handling country code prefix variations.
 */
export function phonesMatch(a: string, b: string): boolean {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da || !db) return false;
  // Exact match
  if (da === db) return true;
  // One may have country code, the other may not — compare last 9 digits
  const la = da.slice(-9);
  const lb = db.slice(-9);
  return la === lb && la.length === 9;
}
