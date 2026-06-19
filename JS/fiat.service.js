/**
 * @file fiat.service.js
 * @description Fetches live fiat currency exchange rates from the Frankfurter
 *   open API (https://www.frankfurter.app). All prices are expressed in USD.
 *   Falls back to static seed data when the network is unavailable.
 *
 * API: https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,...
 *   — No API key required, ~500 req/day free.
 *   — Rates are ECB reference rates, updated on weekdays.
 *
 * Data flow:
 *   Frankfurter REST ──► _normalize() ──► Asset[] ──► MarketService
 */

// ─── Static fallback ───────────────────────────────────────────────────────
export const FIAT_FALLBACK = [
  { id:'usd', name:'US Dollar',       sym:'USD', icon:'$',  bg:'#00914322', type:'fiat', price:1.0000, change:0.00,  mcap:'—', vol:'$6.6T/day',  ath:'—', low24:'—', high24:'—', rank:'World Reserve', supply:'~$2.3T M2',  desc:'The US Dollar is the world\'s primary reserve currency, accounting for roughly 60% of global foreign exchange reserves. It\'s used in the majority of international commodity transactions including oil, gold, and most financial instruments globally.' },
  { id:'eur', name:'Euro',            sym:'EUR', icon:'€',  bg:'#003B9622', type:'fiat', price:1.0820, change:0.21,  mcap:'—', vol:'$2.1T/day',  ath:'—', low24:'—', high24:'—', rank:'2nd Global',    supply:'~€1.4T M0',  desc:'The Euro is the official currency of 20 EU member states. Managed by the European Central Bank, it is the world\'s second most traded currency and second largest reserve currency, introduced in 1999.' },
  { id:'gbp', name:'British Pound',   sym:'GBP', icon:'£',  bg:'#00247D22', type:'fiat', price:1.2720, change:-0.14, mcap:'—', vol:'$630B/day',  ath:'—', low24:'—', high24:'—', rank:'4th Global',    supply:'~£92B M0',   desc:'The British Pound Sterling is the world\'s oldest currency still in use and the fourth most traded globally. London remains one of the world\'s largest forex trading centers, handling trillions in daily transactions.' },
  { id:'jpy', name:'Japanese Yen',    sym:'JPY', icon:'¥',  bg:'#BC002D22', type:'fiat', price:0.0067, change:0.35,  mcap:'—', vol:'$1.1T/day',  ath:'—', low24:'—', high24:'—', rank:'3rd Global',    supply:'~¥120T M2',  desc:'The Japanese Yen is the third most traded currency globally. JPY is often a safe-haven currency during market uncertainty. Japan\'s unique monetary policy made it a major funding currency for carry trades worldwide.' },
  { id:'chf', name:'Swiss Franc',     sym:'CHF', icon:'₣',  bg:'#FF000022', type:'fiat', price:1.1280, change:-0.08, mcap:'—', vol:'$243B/day',  ath:'—', low24:'—', high24:'—', rank:'6th Global',    supply:'~96B CHF',   desc:'The Swiss Franc is considered one of the world\'s safest currencies due to Switzerland\'s political neutrality, strong banking system, and low inflation. CHF is a major safe-haven asset.' },
  { id:'cad', name:'Canadian Dollar', sym:'CAD', icon:'C$', bg:'#FF000022', type:'fiat', price:0.7340, change:0.12,  mcap:'—', vol:'$192B/day',  ath:'—', low24:'—', high24:'—', rank:'7th Global',    supply:'~C$2T M2',   desc:'The Canadian Dollar (Loonie) is closely correlated with commodity prices, especially crude oil. Its economic ties with the US make it highly sensitive to USD movements.' },
  { id:'aud', name:'Australian Dollar',sym:'AUD',icon:'A$', bg:'#00843D22', type:'fiat', price:0.6580, change:-0.22, mcap:'—', vol:'$182B/day',  ath:'—', low24:'—', high24:'—', rank:'5th Global',    supply:'~A$3.4T M2', desc:'The Australian Dollar is a commodity-linked currency often used as a proxy for global growth sentiment. It is the 5th most traded currency globally, favored for its relatively high interest rates.' },
  { id:'cny', name:'Chinese Yuan',    sym:'CNY', icon:'¥',  bg:'#DE291022', type:'fiat', price:0.1376, change:0.05,  mcap:'—', vol:'$525B/day',  ath:'—', low24:'—', high24:'—', rank:'8th Global',    supply:'~¥250T M2',  desc:'The Chinese Yuan (Renminbi) is managed by the People\'s Bank of China under a tightly controlled floating exchange rate system, now included in the IMF\'s SDR basket.' },
];

// ─── Frankfurter config ────────────────────────────────────────────────────
const FRANKFURTER_BASE = 'https://api.frankfurter.app';

// Currencies to request (all expressed relative to USD)
const TARGET_CURRENCIES = 'EUR,GBP,JPY,CHF,CAD,AUD,CNY';

// Map Frankfurter currency code → NexRate id
const FX_CODE_MAP = {
  EUR: 'eur',
  GBP: 'gbp',
  JPY: 'jpy',
  CHF: 'chf',
  CAD: 'cad',
  AUD: 'aud',
  CNY: 'cny',
};

// ─── FiatService ───────────────────────────────────────────────────────────

export class FiatService {
  /** @type {import('./market.service.js').Asset[]} */
  static FALLBACK = FIAT_FALLBACK;

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Fetches current fiat exchange rates from Frankfurter.
   * Returns updated Asset[] for all fiat currencies.
   * On failure, returns the static fallback.
   *
   * @returns {Promise<import('./market.service.js').Asset[]>}
   */
  async fetchRates() {
    try {
      const url = `${FRANKFURTER_BASE}/latest?from=USD&to=${TARGET_CURRENCIES}`;
      const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
      const json = await res.json();

      // json.rates = { EUR: 0.923, GBP: 0.789, ... }  (these are "units per 1 USD")
      // NexRate price convention is "1 unit = X USD", so we invert.
      return this._mergeWithFallback(json.rates ?? {});
    } catch (err) {
      console.warn('[FiatService] Live fetch failed, using fallback.', err.message);
      return FIAT_FALLBACK;
    }
  }

  /**
   * Fetches historical end-of-day rates for a currency pair over a date range.
   * Returns an array of { date, rate } objects, or null on failure.
   *
   * @param {string} fromCode  — ISO 4217 code (e.g. 'USD')
   * @param {string} toCode    — ISO 4217 code (e.g. 'EUR')
   * @param {string} startDate — 'YYYY-MM-DD'
   * @param {string} endDate   — 'YYYY-MM-DD'
   * @returns {Promise<{date:string, rate:number}[]|null>}
   */
  async fetchHistoricalRates(fromCode, toCode, startDate, endDate) {
    try {
      const url = `${FRANKFURTER_BASE}/${startDate}..${endDate}?from=${fromCode}&to=${toCode}`;
      const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
      const json = await res.json();

      // json.rates = { 'YYYY-MM-DD': { EUR: 0.92 }, ... }
      return Object.entries(json.rates ?? {}).map(([date, rates]) => ({
        date,
        rate: rates[toCode] ?? null,
      })).filter(r => r.rate !== null);
    } catch (err) {
      console.warn('[FiatService] Historical fetch failed.', err.message);
      return null;
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * Merges live Frankfurter rates with fallback asset metadata.
   * USD is always price 1.0 (base currency).
   *
   * @param {Record<string, number>} rates — { EUR: 0.923, GBP: 0.789, ... }
   * @returns {import('./market.service.js').Asset[]}
   */
  _mergeWithFallback(rates) {
    return FIAT_FALLBACK.map(fallback => {
      if (fallback.id === 'usd') return fallback; // USD is always 1.0

      const code     = fallback.sym; // 'EUR', 'GBP', etc.
      const perUSD   = rates[code];  // units of `code` per 1 USD
      if (!perUSD) return fallback;

      const priceInUSD = 1 / perUSD; // 1 unit of `code` = how many USD

      return {
        ...fallback,
        price: priceInUSD,
        // 24h change is not provided by Frankfurter's /latest endpoint.
        // Preserved from fallback; a future upgrade can diff two /latest calls.
        change: fallback.change,
      };
    });
  }
}
