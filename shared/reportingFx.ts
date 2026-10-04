import Decimal from "decimal.js";

export type ReportingOpenBalance = {
  currency: string;
  nativeOutstanding: number | string;
};

export type ReportingFxRate = {
  currency: string;
  rate: number | string;
};

/**
 * Values current open invoice balances in TRY for reporting only.
 * This does not participate in payment conversion, settlement, or accounting.
 * Returns null rather than mixing currencies if any non-TRY balance lacks a
 * current approved reporting rate.
 */
export function calculateOutstandingReportingTRY(
  balances: ReportingOpenBalance[],
  rates: ReportingFxRate[],
): number | null {
  const rateByCurrency = new Map(rates.map((item) => [item.currency, new Decimal(item.rate)]));
  let total = new Decimal(0);

  for (const balance of balances) {
    const nativeOutstanding = new Decimal(balance.nativeOutstanding);
    if (nativeOutstanding.lte(0)) continue;
    if (balance.currency === "TRY") {
      total = total.plus(nativeOutstanding);
      continue;
    }
    const rate = rateByCurrency.get(balance.currency);
    if (!rate || !rate.isFinite() || rate.lte(0)) return null;
    total = total.plus(nativeOutstanding.times(rate));
  }

  return total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}
