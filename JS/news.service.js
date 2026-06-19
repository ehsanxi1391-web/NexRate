/**
 * @file news.service.js
 * @description Provides all data for the Analysis Hub page:
 *   - Market news headlines
 *   - Market sentiment scores
 *   - Fear & Greed index
 *   - Analyst forecasts
 *
 * Current implementation: returns curated static data matching the original
 * monolithic HTML. The interface is designed for a future drop-in replacement
 * with live APIs (CryptoPanic, Alternative.me, NewsAPI, etc.) without any
 * changes to the UI layer.
 *
 * Future API integrations (plug-in points marked with TODO):
 *   Fear & Greed  → https://api.alternative.me/fng/
 *   Crypto News   → https://cryptopanic.com/api/v1/posts/
 *   Forex News    → https://newsapi.org (requires key)
 *
 * Data flow:
 *   Static data / future REST ──► NewsService ──► Analysis Hub UI
 */

// ─── Type definitions (JSDoc) ──────────────────────────────────────────────
/**
 * @typedef {Object} NewsItem
 * @property {string} source     — publication name
 * @property {string} color      — hex accent color for the source badge
 * @property {string} time       — human-readable relative time (e.g. '2h ago')
 * @property {string} headline   — article headline
 * @property {string} [url]      — article URL (optional, for future linking)
 */

/**
 * @typedef {Object} SentimentItem
 * @property {string} label      — asset label (e.g. 'Bitcoin')
 * @property {number} bull       — bullish % (0–100)
 * @property {string} color      — CSS color for the bar
 */

/**
 * @typedef {Object} FearGreedResult
 * @property {number} value      — index value (0–100)
 * @property {string} label      — 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed'
 * @property {string} cssColor   — CSS variable string (e.g. 'var(--green)')
 * @property {string} timestamp  — ISO date string of last update
 */

/**
 * @typedef {Object} Forecast
 * @property {string} asset      — asset symbol (e.g. 'BTC')
 * @property {string} target     — price target string (e.g. '$85,000')
 * @property {string} timeframe  — e.g. 'Q3 2025'
 * @property {string} firm       — analyst / institution
 * @property {string} stance     — 'Bullish' | 'Bearish' | 'Neutral' | 'Cautious'
 * @property {string} color      — CSS color for stance badge
 */

// ─── Static data ───────────────────────────────────────────────────────────
// Mirrors the original buildNews() / buildSentiment() / buildForecasts() data.

const STATIC_NEWS = [
  { source:'Reuters',    color:'#FF8200', time:'2h ago',  headline:'Bitcoin surges past $67,000 as ETF inflows hit weekly record of $1.2B' },
  { source:'Bloomberg',  color:'#9D5CFF', time:'4h ago',  headline:'Federal Reserve signals potential rate cuts in Q3 2025, boosting risk appetite globally' },
  { source:'CoinDesk',   color:'#00D4FF', time:'5h ago',  headline:'Ethereum Layer-2 networks process record 12M daily transactions amid DeFi surge' },
  { source:'FT',         color:'#FCD200', time:'7h ago',  headline:'Gold extends rally above $2,300 as central banks continue record purchasing pace' },
  { source:'WSJ',        color:'#0080FF', time:'9h ago',  headline:'USD strengthens against EM currencies as Treasury yields rise on jobs report beat' },
  { source:'Al Jazeera', color:'#00875A', time:'11h ago', headline:'Iranian Rial stabilizes as government introduces new foreign currency management measures' },
];

const STATIC_SENTIMENT = [
  { label:'Bitcoin',  bull:68, color:'var(--gold)' },
  { label:'Ethereum', bull:72, color:'#627EEA'     },
  { label:'Gold',     bull:76, color:'var(--gold)' },
  { label:'USD/IRR',  bull:55, color:'var(--green)'},
  { label:'Oil (WTI)',bull:44, color:'var(--text-muted)' },
  { label:'Silver',   bull:63, color:'#C0C0C0'     },
];

const STATIC_FORECASTS = [
  { asset:'BTC',     target:'$85,000', timeframe:'Q3 2025', firm:'Standard Chartered', stance:'Bullish',  color:'var(--green)' },
  { asset:'ETH',     target:'$5,500',  timeframe:'YE 2025', firm:'Galaxy Digital',     stance:'Bullish',  color:'var(--green)' },
  { asset:'Gold',    target:'$2,600',  timeframe:'Q4 2025', firm:'Goldman Sachs',       stance:'Bullish',  color:'var(--green)' },
  { asset:'USD/IRR', target:'700,000', timeframe:'YE 2025', firm:'Analytical Est.',     stance:'Cautious', color:'var(--gold)'  },
  { asset:'Oil WTI', target:'$72',     timeframe:'Q3 2025', firm:'JP Morgan',           stance:'Neutral',  color:'var(--gold)'  },
];

const STATIC_FEAR_GREED = 72; // The original hardcoded value

// ─── NewsService ───────────────────────────────────────────────────────────

export class NewsService {
  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Returns the latest market news headlines.
   *
   * TODO: Replace with CryptoPanic or NewsAPI call:
   *   const res = await fetch('https://cryptopanic.com/api/v1/posts/?auth_token=TOKEN&public=true');
   *
   * @returns {Promise<NewsItem[]>}
   */
  async fetchNews() {
    // TODO: integrate live news API here
    return STATIC_NEWS;
  }

  /**
   * Returns market sentiment scores per asset.
   *
   * TODO: Can be derived from CoinGecko sentiment_votes_up_percentage,
   *   or from a dedicated sentiment API.
   *
   * @returns {Promise<SentimentItem[]>}
   */
  async fetchSentiment() {
    // TODO: integrate live sentiment API here
    return STATIC_SENTIMENT;
  }

  /**
   * Returns the current Fear & Greed index.
   *
   * TODO: Replace with Alternative.me live API:
   *   const res = await fetch('https://api.alternative.me/fng/?limit=1');
   *   const json = await res.json();
   *   const value = parseInt(json.data[0].value, 10);
   *
   * @returns {Promise<FearGreedResult>}
   */
  async fetchFearGreed() {
    // TODO: integrate alternative.me/fng here
    const value = STATIC_FEAR_GREED;
    return this._buildFearGreedResult(value);
  }

  /**
   * Returns analyst / institutional price forecasts.
   *
   * TODO: Could be sourced from a curated CMS or structured JSON feed.
   *
   * @returns {Promise<Forecast[]>}
   */
  async fetchForecasts() {
    // TODO: integrate live forecasts feed here
    return STATIC_FORECASTS;
  }

  /**
   * Convenience method — fetches all Analysis Hub data in parallel.
   *
   * @returns {Promise<{news: NewsItem[], sentiment: SentimentItem[], fearGreed: FearGreedResult, forecasts: Forecast[]}>}
   */
  async fetchAll() {
    const [news, sentiment, fearGreed, forecasts] = await Promise.all([
      this.fetchNews(),
      this.fetchSentiment(),
      this.fetchFearGreed(),
      this.fetchForecasts(),
    ]);
    return { news, sentiment, fearGreed, forecasts };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * @param {number} value — 0–100
   * @returns {FearGreedResult}
   */
  _buildFearGreedResult(value) {
    let label, cssColor;

    if      (value < 25) { label = 'Extreme Fear'; cssColor = 'var(--red)';  }
    else if (value < 45) { label = 'Fear';          cssColor = 'var(--red)';  }
    else if (value < 55) { label = 'Neutral';        cssColor = 'var(--gold)'; }
    else if (value < 75) { label = 'Greed';          cssColor = 'var(--green)';}
    else                 { label = 'Extreme Greed'; cssColor = 'var(--green)';}

    return {
      value,
      label,
      cssColor,
      timestamp: new Date().toISOString(),
    };
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────
export const newsService = new NewsService();
