/**
 * @file market.service.js
 * @description Orchestrator for all market data. Aggregates crypto, fiat, and
 *   metals into a single unified ASSETS array consumed by the UI. This is the
 *   only module the UI should import from when it needs cross-asset data.
 *
 * Data flow:
 *   CryptoService  ──┐
 *   FiatService    ──┼──► MarketService.getAssets() ──► UI layer
 *   MetalsService  ──┘
 */

import { CryptoService }  from './crypto.service.js';
import { FiatService }    from './fiat.service.js';
import { MetalsService }  from './metals.service.js';

// ─── Iranian Rial constants ────────────────────────────────────────────────
// Free-market / Nobitex-derived rates (1 unit of foreign currency → IRR).
// In a future iteration these will be fetched from MetalsService / FiatService.
export const IRR_RATES = {
  USD:  625_000,   // 1 USD  → ﷼
  EUR:  680_000,   // 1 EUR  → ﷼
  GBP:  790_000,   // 1 GBP  → ﷼
};

// ─── Virtual IRR / Toman assets injected by this service ──────────────────
const IRR_VIRTUAL_ASSETS = [
  {
    id: 'irr',
    name: 'Iranian Rial (IRR)',
    sym: 'IRR',
    icon: '﷼',
    bg: '#00914322',
    type: 'fiat',
    price: 1 / IRR_RATES.USD,
    change: 0,
    mcap: '—', vol: '—', ath: '—', low24: '—', high24: '—',
    rank: 'Local', supply: '—',
    desc: 'The Iranian Rial (IRR) is the official currency of Iran, issued by the Central Bank of the Islamic Republic of Iran. Due to international sanctions and domestic inflation, the free-market rate diverges significantly from the official rate. NexRate tracks the free-market USD/IRR rate via Nobitex USDT/IRT order books.',
  },
  {
    id: 'toman',
    name: 'Iranian Toman',
    sym: 'IRT',
    icon: 'T',
    bg: '#00914322',
    type: 'fiat',
    price: 1 / (IRR_RATES.USD / 10),
    change: 0,
    mcap: '—', vol: '—', ath: '—', low24: '—', high24: '—',
    rank: 'Local', supply: '—',
    desc: 'The Iranian Toman (IRT) is the informal monetary unit widely used in everyday commerce in Iran. One Toman equals 10 Rials. NexRate displays Toman values alongside USD prices for practical local reference.',
  },
];

// ─── MarketService ─────────────────────────────────────────────────────────

export class MarketService {
  /**
   * @param {{ cacheTTL?: number }} [options]
   *   cacheTTL — milliseconds to keep the last successful fetch (default 60 000).
   */
  constructor(options = {}) {
    this._cacheTTL   = options.cacheTTL ?? 60_000;
    this._cache      = null;   // { data: Asset[], ts: number }
    this._listeners  = new Set();

    this._crypto  = new CryptoService();
    this._fiat    = new FiatService();
    this._metals  = new MetalsService();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Returns the unified asset list. Uses cache when fresh; otherwise fetches
   * all three sources in parallel and merges results.
   *
   * @returns {Promise<Asset[]>}
   */
  async getAssets() {
    if (this._isCacheValid()) return this._cache.data;

    const [cryptoAssets, fiatAssets, metalAssets] = await Promise.allSettled([
      this._crypto.fetchPrices(),
      this._fiat.fetchRates(),
      this._metals.fetchPrices(),
    ]);

    const assets = [
      ...this._unwrap(cryptoAssets,  CryptoService.FALLBACK),
      ...this._unwrap(fiatAssets,    FiatService.FALLBACK),
      ...this._unwrap(metalAssets,   MetalsService.FALLBACK),
    ];

    this._cache = { data: assets, ts: Date.now() };
    this._emit(assets);
    return assets;
  }

  /**
   * Returns ASSETS + virtual IRR/Toman assets — used by the Calculator page.
   * @returns {Promise<Asset[]>}
   */
  async getAllAssets() {
    const base = await this.getAssets();
    return [...base, ...IRR_VIRTUAL_ASSETS];
  }

  /**
   * Returns a single asset by id.
   * @param {string} id
   * @returns {Promise<Asset|undefined>}
   */
  async getAssetById(id) {
    const assets = await this.getAssets();
    return assets.find(a => a.id === id);
  }

  /**
   * Returns assets filtered by type.
   * @param {'crypto'|'fiat'|'commodity'} type
   * @returns {Promise<Asset[]>}
   */
  async getAssetsByType(type) {
    const assets = await this.getAssets();
    return assets.filter(a => a.type === type);
  }

  /**
   * Converts a USD value to Iranian Rial.
   * @param {number} usdValue
   * @returns {number} IRR value
   */
  toRial(usdValue) {
    return Math.round(usdValue * IRR_RATES.USD);
  }

  /**
   * Converts a USD value to Iranian Toman (1 Toman = 10 Rial).
   * @param {number} usdValue
   * @returns {number} Toman value
   */
  toToman(usdValue) {
    return Math.round(usdValue * IRR_RATES.USD / 10);
  }

  /**
   * Registers a callback invoked whenever fresh data is fetched.
   * @param {function(Asset[]): void} fn
   * @returns {function(): void} unsubscribe
   */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /**
   * Applies a simulated live-price tick to cached data (used in offline/demo
   * mode until real WebSocket streams are wired up).
   * @returns {Asset[]} mutated snapshot
   */
  simulatePriceTick() {
    if (!this._cache) return [];
    this._cache.data.forEach(a => {
      const delta = (Math.random() - 0.499) * a.price * 0.002;
      a.price = Math.max(0.0001, a.price + delta);
    });
    this._emit(this._cache.data);
    return this._cache.data;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  _isCacheValid() {
    return this._cache && (Date.now() - this._cache.ts) < this._cacheTTL;
  }

  _unwrap(settled, fallback) {
    return settled.status === 'fulfilled' ? settled.value : fallback;
  }

  _emit(data) {
    this._listeners.forEach(fn => { try { fn(data); } catch (_) {} });
  }
}

/**
 * @typedef {Object} Asset
 * @property {string}  id       — internal slug (e.g. 'btc', 'eur', 'xau')
 * @property {string}  name     — display name
 * @property {string}  sym      — ticker symbol (e.g. 'BTC', 'EUR', 'XAU/USD')
 * @property {string}  icon     — emoji / unicode glyph
 * @property {string}  bg       — CSS rgba background for icon container
 * @property {'crypto'|'fiat'|'commodity'} type
 * @property {number}  price    — current price in USD
 * @property {number}  change   — 24h % change
 * @property {string}  mcap     — formatted market cap string
 * @property {string}  vol      — formatted 24h volume string
 * @property {string}  ath      — all-time high string
 * @property {string}  low24    — 24h low string
 * @property {string}  high24   — 24h high string
 * @property {string}  rank     — rank or category label
 * @property {string}  supply   — circulating supply string
 * @property {string}  desc     — long-form description
 */

// ─── Singleton export ──────────────────────────────────────────────────────
export const marketService = new MarketService();
