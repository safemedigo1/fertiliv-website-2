/**
 * Produces the patient-facing line name for every Finance surface.
 * The stored line label is not rewritten; only surrounding display whitespace
 * is normalized. A label that already begins with the standard separator is
 * not given a duplicate separator.
 */
export function formatInvoiceLineDisplayName(
  serviceName: string | null | undefined,
  lineLabel: string | null | undefined,
): string {
  const base = String(serviceName ?? "").trim();
  const label = String(lineLabel ?? "").trim();
  if (!label) return base;
  if (!base) return label;
  return label.startsWith("—") ? `${base} ${label}` : `${base} — ${label}`;
}
