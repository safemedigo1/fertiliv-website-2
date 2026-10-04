/**
 * Exchange Rate Service
 *
 * Convention: ALL rates stored and returned are "TRY per 1 foreign currency unit"
 *   e.g.  USD → 46.30  means  1 USD = 46.30 TRY
 *         EUR → 53.00  means  1 EUR = 53.00 TRY
 *         SAR → 12.35  means  1 SAR = 12.35 TRY
 *         AED → 12.60  means  1 AED = 12.60 TRY
 *         AUD → 30.00  means  1 AUD = 30.00 TRY
 *
 * Both Frankfurter and ExchangeRate-API return rates FROM TRY (base=TRY),
 * so their values are "1 TRY = X foreign".  We invert them: tryPerUnit = 1 / providerRate.
 *
 * Primary source:  Frankfurter API  (https://api.frankfurter.app)
 *   - Supports: USD, EUR, GBP  (the Finance registry uses the fallback for SAR, AED, AUD)
 * Supplement/Fallback: ExchangeRate-API (https://open.er-api.com)
 *   - Supports: ALL currencies including SAR, AED, AUD
 *
 * Strategy:
 * 1. Check DB for cached rates — if all exist and are from today, return them.
 * 2. If stale, fetch from Frankfurter for USD/EUR/GBP.
 * 3. Supplement missing currencies (SAR, AED, AUD) from ExchangeRate-API.
 * 4. If Frankfurter fails entirely, use ExchangeRate-API for all currencies.
 * 5. If both fail, return last known rates from DB with a staleness warning.
 * 6. Manual overrides are never overwritten by auto-fetch.
 */

import { getDb } from "./db";
import { exchangeRates, ExchangeRate } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "SAR", "AED", "AUD"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
const BASE_CURRENCY = "TRY";

// Currencies supported by Frankfurter (European currencies only)
const FRANKFURTER_CURRENCIES = ["USD", "EUR", "GBP"] as const;
// Currencies that need fallback (not in Frankfurter)
const FALLBACK_ONLY_CURRENCIES = ["SAR", "AED", "AUD"] as const;

export interface ExchangeRateRow {
  targetCurrency: string;
  rate: number;          // tryPerUnit — 1 [targetCurrency] = rate TRY
  sourceProvider: string | null;
  rateDate: string | null;
  fetchedAt: Date;
  isManualOverride: boolean;
}

export interface FetchResult {
  rates: Record<string, ExchangeRateRow>;
  stale: boolean;
  staleSince?: Date;
  fetchError?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // "2026-06-25"
}

function isToday(date: Date): boolean {
  return date.toISOString().slice(0, 10) === todayUTC();
}

/**
 * Convert provider rate (1 TRY = X foreign) → tryPerUnit (1 foreign = Y TRY)
 * tryPerUnit = 1 / providerRate
 */
function invertRate(providerRate: number): number {
  if (!providerRate || providerRate === 0) return 0;
  return 1 / providerRate;
}

// ─── Fetch from Frankfurter (USD/EUR/GBP only) ────────────────────────────────

async function fetchFromFrankfurter(): Promise<{
  rates: Record<string, number>; // already converted to tryPerUnit
  date: string;
  source: string;
} | null> {
  try {
    // Only request currencies Frankfurter actually supports
    const symbols = FRANKFURTER_CURRENCIES.join(",");
    const url = `https://api.frankfurter.app/latest?base=TRY&symbols=${symbols}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.rates) return null;

    const converted: Record<string, number> = {};
    for (const [cur, providerRate] of Object.entries(data.rates as Record<string, number>)) {
      converted[cur] = invertRate(providerRate);
    }

    return {
      rates: converted,
      date: data.date ?? todayUTC(),
      source: "frankfurter",
    };
  } catch {
    return null;
  }
}

// ─── Fetch from ExchangeRate-API (all currencies including SAR/AED/AUD) ───────

async function fetchFromExchangeRateApi(
  currenciesNeeded?: string[]
): Promise<{
  rates: Record<string, number>; // already converted to tryPerUnit
  date: string;
  source: string;
} | null> {
  try {
    const url = `https://open.er-api.com/v6/latest/TRY`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.result !== "success" || !data?.rates) return null;

    const targets = currenciesNeeded ?? [...SUPPORTED_CURRENCIES];
    const converted: Record<string, number> = {};
    for (const cur of targets) {
      if (data.rates[cur]) {
        converted[cur] = invertRate(data.rates[cur]);
      }
    }

    return {
      rates: converted,
      date: data.time_last_update_utc
        ? new Date(data.time_last_update_utc).toISOString().slice(0, 10)
        : todayUTC(),
      source: "exchangerate-api",
    };
  } catch {
    return null;
  }
}

// ─── Save rates to DB ─────────────────────────────────────────────────────────

async function saveRatesToDb(
  rates: Record<string, number>, // tryPerUnit values
  rateDate: string,
  source: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  for (const [currency, tryPerUnit] of Object.entries(rates)) {
    // Don't overwrite manual overrides
    const existing = await db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.baseCurrency, BASE_CURRENCY),
          eq(exchangeRates.targetCurrency, currency)
        )
      )
      .limit(1);

    if (existing.length > 0 && existing[0].isManualOverride) {
      continue; // Skip — manual override takes precedence
    }

    await db
      .insert(exchangeRates)
      .values({
        baseCurrency: BASE_CURRENCY,
        targetCurrency: currency,
        rate: String(tryPerUnit),
        sourceProvider: source,
        rateDate,
        fetchedAt: new Date(),
        isManualOverride: false,
      })
      .onConflictDoUpdate({ target: [exchangeRates.baseCurrency, exchangeRates.targetCurrency],
        set: {
          rate: String(tryPerUnit),
          sourceProvider: source,
          rateDate,
          fetchedAt: new Date(),
          isManualOverride: false,
          overriddenBy: null,
        },
      });
  }
}

// ─── Get rates from DB ────────────────────────────────────────────────────────

async function getRatesFromDb(): Promise<ExchangeRateRow[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(exchangeRates)
    .where(eq(exchangeRates.baseCurrency, BASE_CURRENCY));
  return rows.map((r: ExchangeRate) => ({
    targetCurrency: r.targetCurrency,
    rate: parseFloat(String(r.rate)), // tryPerUnit
    sourceProvider: r.sourceProvider,
    rateDate: r.rateDate,
    fetchedAt: r.fetchedAt,
    isManualOverride: r.isManualOverride,
  }));
}

// ─── Main public function ─────────────────────────────────────────────────────

/**
 * Get exchange rates (tryPerUnit). Uses DB cache if fresh (today's date).
 * Fetches from API if stale. Falls back to last known rates if API fails.
 *
 * Smart strategy:
 * - Frankfurter handles USD/EUR/GBP
 * - ExchangeRate-API supplements SAR/AED/AUD (and any other missing currencies)
 */
export async function getOrFetchExchangeRates(): Promise<FetchResult> {
  const cached = await getRatesFromDb();

  const cachedMap: Record<string, ExchangeRateRow> = {};
  for (const row of cached) {
    cachedMap[row.targetCurrency] = row;
  }

  const allPresent = SUPPORTED_CURRENCIES.every((c) => cachedMap[c]);
  const allFresh = allPresent && SUPPORTED_CURRENCIES.every((c) => isToday(cachedMap[c].fetchedAt));

  if (allFresh) {
    return { rates: cachedMap, stale: false };
  }

  // Determine which currencies need fetching (not fresh or missing)
  const staleOrMissing = SUPPORTED_CURRENCIES.filter(
    (c) => !cachedMap[c] || !isToday(cachedMap[c].fetchedAt)
  );

  // Step 1: Try Frankfurter for the currencies it supports
  const frankfurterNeeded = staleOrMissing.filter((c) =>
    (FRANKFURTER_CURRENCIES as readonly string[]).includes(c)
  );
  let frankfurterResult: Awaited<ReturnType<typeof fetchFromFrankfurter>> = null;

  if (frankfurterNeeded.length > 0) {
    frankfurterResult = await fetchFromFrankfurter();
    if (frankfurterResult) {
      await saveRatesToDb(frankfurterResult.rates, frankfurterResult.date, frankfurterResult.source);
    }
  }

  // Step 2: Supplement with ExchangeRate-API for fallback-only currencies.
  // Also use it as full fallback if Frankfurter failed
  const fallbackNeeded: string[] = [];

  // Always fetch fallback-only currencies from ExchangeRate-API.
  for (const cur of FALLBACK_ONLY_CURRENCIES) {
    if (!cachedMap[cur] || !isToday(cachedMap[cur].fetchedAt)) {
      fallbackNeeded.push(cur);
    }
  }

  // If Frankfurter failed, also get USD/EUR/GBP from fallback
  if (!frankfurterResult) {
    for (const cur of FRANKFURTER_CURRENCIES) {
      if (!cachedMap[cur] || !isToday(cachedMap[cur].fetchedAt)) {
        fallbackNeeded.push(cur);
      }
    }
  }

  let fallbackResult: Awaited<ReturnType<typeof fetchFromExchangeRateApi>> = null;
  if (fallbackNeeded.length > 0) {
    fallbackResult = await fetchFromExchangeRateApi(fallbackNeeded);
    if (fallbackResult) {
      await saveRatesToDb(fallbackResult.rates, fallbackResult.date, fallbackResult.source);
    }
  }

  // Re-read from DB after saves
  const updated = await getRatesFromDb();
  const updatedMap: Record<string, ExchangeRateRow> = {};
  for (const row of updated) updatedMap[row.targetCurrency] = row;

  const allNowPresent = SUPPORTED_CURRENCIES.every((c) => updatedMap[c]);

  if (allNowPresent) {
    const anyFresh = SUPPORTED_CURRENCIES.some((c) => isToday(updatedMap[c].fetchedAt));
    return { rates: updatedMap, stale: !anyFresh };
  }

  // Some currencies still missing — return what we have with warning
  const missingCurrencies = SUPPORTED_CURRENCIES.filter((c) => !updatedMap[c]);
  const fetchError = missingCurrencies.length > 0
    ? `Could not fetch rates for: ${missingCurrencies.join(", ")}. Please add manual rates.`
    : "Some exchange rates may be stale.";

  return {
    rates: updatedMap,
    stale: true,
    fetchError,
  };
}

/**
 * Force-fetch rates from API regardless of cache freshness.
 * Used by "Fetch live rates now" button and daily cron.
 */
export async function forceFetchExchangeRates(): Promise<{
  success: boolean;
  source?: string;
  rateDate?: string;
  error?: string;
  missingCurrencies?: string[];
}> {
  const errors: string[] = [];
  let anySuccess = false;

  // Step 1: Frankfurter for USD/EUR/GBP
  const frankfurterResult = await fetchFromFrankfurter();
  if (frankfurterResult) {
    await saveRatesToDb(frankfurterResult.rates, frankfurterResult.date, frankfurterResult.source);
    anySuccess = true;
  } else {
    errors.push("Frankfurter unavailable");
  }

  // Step 2: ExchangeRate-API for fallback-only currencies (+ USD/EUR/GBP if Frankfurter failed)
  const fallbackNeeded: string[] = [...FALLBACK_ONLY_CURRENCIES];
  if (!frankfurterResult) {
    fallbackNeeded.push(...FRANKFURTER_CURRENCIES);
  }

  const fallbackResult = await fetchFromExchangeRateApi(fallbackNeeded);
  if (fallbackResult) {
    await saveRatesToDb(fallbackResult.rates, fallbackResult.date, fallbackResult.source);
    anySuccess = true;
  } else {
    errors.push("ExchangeRate-API unavailable");
  }

  if (!anySuccess) {
    return {
      success: false,
      error: errors.join("; "),
    };
  }

  // Check which currencies are still missing
  const cached = await getRatesFromDb();
  const cachedCurrencies = new Set(cached.map((r) => r.targetCurrency));
  const missingCurrencies = SUPPORTED_CURRENCIES.filter((c) => !cachedCurrencies.has(c));

  return {
    success: true,
    source: frankfurterResult?.source ?? fallbackResult?.source,
    rateDate: frankfurterResult?.date ?? fallbackResult?.date,
    missingCurrencies: missingCurrencies.length > 0 ? missingCurrencies : undefined,
  };
}

/**
 * Set a manual override for a specific currency.
 * @param rate  tryPerUnit — 1 [currency] = rate TRY
 */
export async function setManualOverride(
  targetCurrency: string,
  rate: number, // tryPerUnit
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(exchangeRates)
    .values({
      baseCurrency: BASE_CURRENCY,
      targetCurrency,
      rate: String(rate),
      sourceProvider: "manual",
      rateDate: todayUTC(),
      fetchedAt: new Date(),
      isManualOverride: true,
      overriddenBy: userId,
    })
    .onConflictDoUpdate({ target: [exchangeRates.baseCurrency, exchangeRates.targetCurrency],
      set: {
        rate: String(rate),
        sourceProvider: "manual",
        rateDate: todayUTC(),
        fetchedAt: new Date(),
        isManualOverride: true,
        overriddenBy: userId,
      },
    });
}

/**
 * Clear manual override for a currency — next auto-fetch will update it.
 */
export async function clearManualOverride(targetCurrency: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(exchangeRates)
    .set({ isManualOverride: false, overriddenBy: null })
    .where(
      and(
        eq(exchangeRates.baseCurrency, BASE_CURRENCY),
        eq(exchangeRates.targetCurrency, targetCurrency)
      )
    );
}
