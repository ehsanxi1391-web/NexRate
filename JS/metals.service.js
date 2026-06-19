/**
 * @file metals.service.js
 * @description Fetches live precious-metals and commodity spot prices from
 *   the metals.live public API. Falls back to static seed data on failure.
 *
 * API: https://metals.live/api/v1/spot
 *   — No API key required for basic spot prices.
 *   — Returns a JSON array: [{ metal, price, ... }, ...]
 *
 * Supported metals/commodities:
 *   Gold (XAU), Silver (XAG), Platinum (XPT), Crude Oil WTI (approximated)
 *
 * Data flow:
 *   metals.live REST ──► _normalize() ──► Asset[] ──► MarketService
 *
 * Note on WTI Crude Oil:
 *   metals.live does not provide oil prices. Crude oil therefore always
 *   uses the static fallback value. A future iteration can plug in the
 *   EIA or FRED open APIs here without changing the service interface.
 */

// ─── Static fallback ───────────────────────────────────────────────────────
export const METALS_FALLBACK = [
  {
    id: 'xau', name: 'Gold', sym: 'XAU/USD', icon: '🥇', bg: '#FFB80022', type: 'commodity',
    price: 2318.50, change: 0.82,
    mcap: '~$14T', vol: '$192B/day', ath: '$2,431', low24: '$2,299', high24: '$2,326',
    rank: 'Safe Haven', supply: '~212,582t mined',
    desc: 'Gold has served as a store of value and medium of exchange for over 5,000 years. As a safe-haven asset, gold prices typically rise during economic uncertainty, geopolitical tensions, and inflation. Central banks hold significant gold reserves, making it a cornerstone of global finance.',
  },
  {
    id: 'xag', name: 'Silver', sym: 'XAG/USD', icon: '🥈', bg: '#C0C0C022', type: 'commodity',
    price: 27.85, change: 1.44,
    mcap: '~$1.7T', vol: '$8.4B/day', ath: '$49.51', low24: '$27.30', high24: '$28.10',
    rank: 'Industrial', supply: '~1.74M t mined',
    desc: 'Silver has dual roles as both a precious metal and an industrial commodity. About 50% of silver demand comes from solar panels, electronics, and medical devices. Silver often amplifies gold\'s moves with higher volatility, making it attractive to speculative traders.',
  },
  {
    id: 'wti', name: 'Crude Oil (WTI)', sym: 'WTI/USD', icon: '🛢️', bg: '#2C2C2C22', type: 'commodity',
    price: 78.42, change: -0.65,
    mcap: '—', vol: '$1.4T/day', ath: '$147.27', low24: '$77.80', high24: '$79.10',
    rank: 'Key Commodity', supply: '~100M bbl/day',
    desc: 'West Texas Intermediate (WTI) is the main oil benchmark for the Americas. Prices are influenced by OPEC+ production decisions, US inventory data, geopolitical events, and USD strength. Crude oil is a major driver of global inflation and economic activity.',
  },
  {
    id: 'plat', name: 'Platinum', sym: 'XPT/USD', icon: '🔘', bg: '#E5E4E222', type: 'commodity',
    price: 984.20, change: -0.33,
    mcap: '~$95B', vol: '$670M/day', ath: '$2,270', low24: '$978', high24: '$992',
    rank: 'Rare Metal', supply: '~190t/year',
    desc: 'Platinum is one of the rarest precious metals, primarily produced in South Africa and Russia. It has extensive industrial uses in catalytic converters, jewelry, and hydrogen fuel cells. Platinum was historically more expensive than gold but has traded at a discount since 2015.',
  },
];

// ─── metals.live config ────────────────────────────────────────────────────
const METALS_API_BASE = 'https://metals.live/api/v1';

// Map metals.live metal name (lowercase) → NexRate id
const METAL_NAME_MAP = {
  gold:     'xau',
  silver:   'xag',
  platinum: 'plat',
  // palladium: 'xpd' — future addition
};

// ─── MetalsService ─────────────────────────────────────────────────────────

export class MetalsService {
  /** @type {import('./market.service.js').Asset[]} */
  static FALLBACK = METALS_FALLBACK;

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Fetches current spot prices for precious metals.
   * WTI crude oil always falls back to the static value (no metals.live support).
   * On network failure, returns the complete static fallback.
   *
   * @returns {Promise<import('./market.service.js').Asset[]>}
   */
  async fetchPrices() {
    try {
      const url  = `${METALS_API_BASE}/spot`;
      const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`metals.live HTTP ${res.status}`);
      const json = await res.json();

      // json = [{ metal: 'gold', price: 2315.40, change: 0.82, ... }, ...]
      return this._mergeWithFallback(Array.isArray(json) ? json : []);
    } catch (err) {
      console.warn('[MetalsService] Live fetch failed, using fallback.', err.message);
      return METALS_FALLBACK;
    }
  }

  /**
   * Returns the price of gold per gram in USD.
   * Gold spot prices are quoted per troy ounce; 1 troy oz = 31.1035 g.
   *
   * @returns {Promise<number>}
   */
  async getGoldPerGram() {
    const assets   = await this.fetchPrices();
    const gold     = assets.find(a => a.id === 'xau');
    const priceOz  = gold?.price ?? METALS_FALLBACK[0].price;
    return priceOz / 31.1035;
  }

  /**
   * Returns the price of 1 Bahar Azadi gold coin in USD.
   * 1 Bahar Azadi = 8.133g of 21.6-karat (90%) gold.
   *   purity factor: 0.9
   *   weight: 8.133g
   *   gold content: 8.133 * 0.9 ≈ 7.32g
   *
   * @returns {Promise<number>}
   */
  async getBaharAzadiPrice() {
    const goldPerGram   = await this.getGoldPerGram();
    const COIN_GOLD_G   = 8.133 * 0.9; // gold content in grams
    return goldPerGram * COIN_GOLD_G;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * Merges live metals.live data into fallback assets.
   * Assets not covered by metals.live (WTI) keep their fallback values.
   *
   * @param {object[]} rawItems
   * @returns {import('./market.service.js').Asset[]}
   */
  _mergeWithFallback(rawItems) {
    const liveMap = new Map();
    for (const item of rawItems) {
      const id = METAL_NAME_MAP[item.metal?.toLowerCase()];
      if (id) liveMap.set(id, item);
    }

    return METALS_FALLBACK.map(fallback => {
      const live = liveMap.get(fallback.id);
      if (!live) return fallback; // WTI, or if metal not in response

      return {
        ...fallback,
        price:  live.price  ?? fallback.price,
        change: live.change ?? fallback.change,
        // metals.live may provide high/low in future; guard with fallback
        low24:  live.low    ? `$${live.low.toLocaleString()}`  : fallback.low24,
        high24: live.high   ? `$${live.high.toLocaleString()}` : fallback.high24,
      };
    });
  }
}
