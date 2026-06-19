/**
 * @file js/data.js
 * @description Central data bridge for NexRate.
 *
 * This module replaces the inline ASSETS array and scattered fetch calls
 * from the monolithic HTML. The UI layer imports only from here — it never
 * calls any service directly.
 *
 * Responsibilities:
 *   1. Bootstrap the MarketService singleton on first import.
 *   2. Expose IRR helpers (toRial, toToman, IRR_RATES).
 *   3. Expose the ASSETS array (kept in sync with each service refresh).
 *   4. Drive the 15-second simulated price tick (demo mode).
 *   5. Provide a typed fmt() formatter consistent with the original.
 *
 * Usage (ES module):
 *   import { ASSETS, ALL_ASSETS, IRR_RATES, toRial, toToman, fmt, refreshData } from './data.js';
 */

import { marketService, IRR_RATES } from '../services/market.service.js';
import { newsService }               from '../services/news.service.js';

export { IRR_RATES };

// ─── Mutable live snapshot ─────────────────────────────────────────────────
// These arrays are populated on init() and mutated on every price tick.
// They are exported as `let` references — UI code should read them directly
// (not cache them in local variables across renders).

/** @type {import('../services/market.service.js').Asset[]} */
export let ASSETS     = [];

/** @type {import('../services/market.service.js').Asset[]} — includes virtual IRR / Toman */
export let ALL_ASSETS = [];

// ─── IRR helpers (re-exported for convenience) ─────────────────────────────

/** @param {number} usdValue @returns {number} */
export function toRial(usdValue) {
  return marketService.toRial(usdValue);
}

/** @param {number} usdValue @returns {number} */
export function toToman(usdValue) {
  return marketService.toToman(usdValue);
}

// ─── Formatting helper ─────────────────────────────────────────────────────
/**
 * Formats a USD number into a compact display string.
 * Identical to the original fmt() from the monolithic HTML.
 *
 * @param {number} n
 * @returns {string}
 */
export function fmt(n) {
  if (n >= 1e9)  return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1000) return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1)    return '$' + n.toFixed(4);
  if (n >= 0.01) return '$' + n.toFixed(5);
  return '$' + n.toFixed(8);
}

// ─── Bootstrap ─────────────────────────────────────────────────────────────

/**
 * Fetches initial data from all services and populates ASSETS / ALL_ASSETS.
 * Called once from init() in the main application script.
 *
 * @returns {Promise<void>}
 */
export async function refreshData() {
  const [assets, allAssets] = await Promise.all([
    marketService.getAssets(),
    marketService.getAllAssets(),
  ]);
  // Mutate in-place so any module that holds a reference to ASSETS sees updates.
  ASSETS.length     = 0;
  ASSETS.push(...assets);
  ALL_ASSETS.length = 0;
  ALL_ASSETS.push(...allAssets);
}

// ─── Live-price simulation ─────────────────────────────────────────────────
/**
 * Applies one price-tick simulation to the cached snapshot and returns
 * the updated ASSETS array.
 * Called every 15 seconds from the main app loop.
 *
 * @returns {import('../services/market.service.js').Asset[]}
 */
export function simulatePriceTick() {
  const updated = marketService.simulatePriceTick();
  ASSETS.length = 0;
  ASSETS.push(...updated);
  return ASSETS;
}

// ─── News / Analysis data ─────────────────────────────────────────────────
export { newsService };

/**
 * Fetches all Analysis Hub data in one call.
 * @returns {Promise<{news, sentiment, fearGreed, forecasts}>}
 */
export async function fetchAnalysisData() {
  return newsService.fetchAll();
}
