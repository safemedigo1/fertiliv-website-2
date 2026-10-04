import { Request, Response } from "express";
import { getSystemSettings, setSystemSetting } from "./db";

/**
 * POST /api/scheduled/updateExchangeRates
 * Called daily by the Manus Heartbeat cron.
 * Checks if auto-update is enabled before fetching live rates.
 */
export async function handleScheduledExchangeRates(req: Request, res: Response) {
  try {
    // Check if auto-update is enabled
    const settings = await getSystemSettings();
    if (settings.auto_exchange_rates_enabled !== "true") {
      return res.json({ ok: true, skipped: "auto-update disabled" });
    }

    // Fetch live rates from open.er-api.com (free, no API key required)
    const apiRes = await fetch("https://open.er-api.com/v6/latest/TRY");
    if (!apiRes.ok) {
      return res.status(500).json({ error: "Failed to fetch exchange rates", status: apiRes.status });
    }

    const data = await apiRes.json() as { result: string; rates: Record<string, number> };
    if (data.result !== "success") {
      return res.status(500).json({ error: "Exchange rate API returned error", data });
    }

    const currencies = ["USD", "EUR", "GBP", "SAR", "AED", "AUD"];
    for (const cur of currencies) {
      const rate = data.rates[cur];
      if (rate) {
        await setSystemSetting(`exchange_rate_${cur}`, rate.toFixed(6));
      }
    }
    await setSystemSetting("exchange_rates_last_updated", new Date().toISOString());

    console.log(`[scheduledExchangeRates] Updated ${currencies.length} rates at ${new Date().toISOString()}`);
    return res.json({ ok: true, updated: currencies.length, timestamp: new Date().toISOString() });
  } catch (err: any) {
    console.error("[scheduledExchangeRates] Error:", err);
    return res.status(500).json({
      error: err?.message ?? "Unknown error",
      stack: err?.stack,
      context: { url: req.url },
      timestamp: new Date().toISOString(),
    });
  }
}
