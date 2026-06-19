/**
 * @file crypto.service.js
 * @description Fetches live cryptocurrency prices from the CoinGecko public API.
 *   Falls back to static seed data when the network is unavailable or rate-limited.
 *
 * API: https://api.coingecko.com/api/v3/coins/markets
 *   — No API key required for up to ~30 req/min on the free tier.
 *   — Response fields used: id, symbol, name, current_price,
 *     price_change_percentage_24h, market_cap, total_volume,
 *     ath, low_24h, high_24h, market_cap_rank, circulating_supply
 *
 * Data flow:
 *   CoinGecko REST ──► _normalize() ──► Asset[] ──► MarketService
 */

// ─── Static fallback ───────────────────────────────────────────────────────
// Reflects the original ASSETS seed values from the monolithic HTML.
// Kept as a named export so MarketService can reference it directly.
export const CRYPTO_FALLBACK = [
  { id:'btc',  name:'Bitcoin',   sym:'BTC',  icon:'₿', bg:'#F7931A22', type:'crypto', price:67450,  change:2.34,  mcap:'$1.33T', vol:'$28.4B', ath:'$73,750', low24:'$65,200', high24:'$68,100', rank:'#1',  supply:'19.7M BTC',  desc:'Bitcoin is the world\'s first decentralized digital currency. Created in 2009 by Satoshi Nakamoto, it operates on a peer-to-peer network without a central authority. Bitcoin uses SHA-256 proof-of-work mining and has a fixed supply of 21 million coins, making it deflationary by design.' },
  { id:'eth',  name:'Ethereum',  sym:'ETH',  icon:'⬡', bg:'#627EEA22', type:'crypto', price:3520,   change:1.82,  mcap:'$422B',  vol:'$14.2B', ath:'$4,878',  low24:'$3,410',  high24:'$3,580',  rank:'#2',  supply:'120M ETH',   desc:'Ethereum is a decentralized platform enabling smart contracts and dApps. After the Merge in 2022, Ethereum transitioned to Proof of Stake, reducing energy consumption by ~99.95% and making ETH deflationary through EIP-1559 fee burning.' },
  { id:'usdt', name:'Tether',    sym:'USDT', icon:'₮', bg:'#26A17B22', type:'crypto', price:1.00,   change:0.01,  mcap:'$114B',  vol:'$52.1B', ath:'$1.21',   low24:'$0.999',  high24:'$1.001',  rank:'#3',  supply:'114B USDT',  desc:'Tether (USDT) is the world\'s largest stablecoin by market cap, pegged 1:1 to the US Dollar. It\'s the most traded cryptocurrency by volume, serving as a bridge between fiat and crypto markets.' },
  { id:'bnb',  name:'BNB',       sym:'BNB',  icon:'◈', bg:'#F3BA2F22', type:'crypto', price:580,    change:-0.92, mcap:'$85B',   vol:'$1.8B',  ath:'$686',    low24:'$571',    high24:'$590',    rank:'#4',  supply:'147M BNB',   desc:'BNB is the native token of the BNB Chain ecosystem, originally launched by Binance in 2017. Quarterly token burns reduce the total supply to a target of 100M BNB.' },
  { id:'sol',  name:'Solana',    sym:'SOL',  icon:'◎', bg:'#9945FF22', type:'crypto', price:172,    change:3.45,  mcap:'$80B',   vol:'$3.2B',  ath:'$259',    low24:'$165',    high24:'$175',    rank:'#5',  supply:'464M SOL',   desc:'Solana achieves ~65,000 TPS with sub-second finality using its unique Proof of History consensus, making it popular for DeFi and NFTs.' },
  { id:'xrp',  name:'XRP',       sym:'XRP',  icon:'✕', bg:'#00AAE422', type:'crypto', price:0.52,   change:-1.23, mcap:'$29B',   vol:'$1.1B',  ath:'$3.84',   low24:'$0.50',   high24:'$0.54',   rank:'#6',  supply:'55B XRP',    desc:'XRP facilitates fast cross-border payments as a bridge currency. Transactions settle in 3-5 seconds with very low fees, ideal for global remittance payments.' },
  { id:'usdc', name:'USD Coin',  sym:'USDC', icon:'$', bg:'#2775CA22', type:'crypto', price:1.00,   change:0.00,  mcap:'$33B',   vol:'$7.4B',  ath:'$1.17',   low24:'$0.9998', high24:'$1.0002', rank:'#7',  supply:'33B USDC',   desc:'USD Coin (USDC) is a fully regulated, fully backed dollar stablecoin issued by Circle. Each USDC is backed 1:1 by cash and US Treasury bonds.' },
  { id:'ada',  name:'Cardano',   sym:'ADA',  icon:'₳', bg:'#0D172222', type:'crypto', price:0.44,   change:1.67,  mcap:'$15B',   vol:'$380M',  ath:'$3.10',   low24:'$0.42',   high24:'$0.45',   rank:'#8',  supply:'35B ADA',    desc:'Cardano is a proof-of-stake blockchain platform built on peer-reviewed academic research using the Ouroboros PoS protocol.' },
  { id:'doge', name:'Dogecoin',  sym:'DOGE', icon:'Ð', bg:'#C2A63322', type:'crypto', price:0.168,  change:4.12,  mcap:'$24B',   vol:'$1.5B',  ath:'$0.73',   low24:'$0.158',  high24:'$0.172',  rank:'#9',  supply:'144B DOGE',  desc:'Dogecoin started in 2013 as a meme cryptocurrency but has grown into one of the top digital assets by market cap. It gained mainstream attention through Elon Musk endorsements.' },
  { id:'trx',  name:'TRON',      sym:'TRX',  icon:'⬡', bg:'#EB0C2922', type:'crypto', price:0.12,   change:0.88,  mcap:'$10B',   vol:'$425M',  ath:'$0.30',   low24:'$0.115',  high24:'$0.122',  rank:'#10', supply:'87B TRX',    desc:'TRON offers high throughput (2,000 TPS), zero transaction fees, and delegated proof-of-stake. It acquired BitTorrent and hosts a large portion of USDT transactions.' },
  { id:'dot',  name:'Polkadot',  sym:'DOT',  icon:'●', bg:'#E6007A22', type:'crypto', price:6.82,   change:-2.10, mcap:'$9.5B',  vol:'$290M',  ath:'$55',     low24:'$6.60',   high24:'$7.10',   rank:'#11', supply:'1.4B DOT',   desc:'Polkadot enables interoperability between blockchains through its relay chain and parachain architecture. DOT is used for governance, staking, and bonding parachains.' },
  { id:'link', name:'Chainlink', sym:'LINK', icon:'⬡', bg:'#2A5ADA22', type:'crypto', price:13.45,  change:1.33,  mcap:'$7.9B',  vol:'$340M',  ath:'$52.88',  low24:'$13.10',  high24:'$13.80',  rank:'#12', supply:'587M LINK',  desc:'Chainlink is a decentralized oracle network providing real-world data to smart contracts, securing tens of billions across DeFi and enterprise blockchain applications.' },
];

// ─── CoinGecko config ──────────────────────────────────────────────────────
const COINGECKO_BASE  = 'https://api.coingecko.com/api/v3';
const COINGECKO_IDS   = 'bitcoin,ethereum,tether,binancecoin,solana,ripple,usd-coin,cardano,dogecoin,tron,polkadot,chainlink';

// Map CoinGecko IDs → NexRate IDs
const CG_ID_MAP = {
  'bitcoin':      'btc',
  'ethereum':     'eth',
  'tether':       'usdt',
  'binancecoin':  'bnb',
  'solana':       'sol',
  'ripple':       'xrp',
  'usd-coin':     'usdc',
  'cardano':      'ada',
  'dogecoin':     'doge',
  'tron':         'trx',
  'polkadot':     'dot',
  'chainlink':    'link',
};

// ─── CryptoService ─────────────────────────────────────────────────────────

export class CryptoService {
  /** @type {import('./market.service.js').Asset[]} */
  static FALLBACK = CRYPTO_FALLBACK;

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Fetches current prices for all tracked cryptocurrencies.
   * On network failure, logs a warning and returns the static fallback.
   *
   * @returns {Promise<import('./market.service.js').Asset[]>}
   */
  async fetchPrices() {
    try {
      const url = new URL(`${COINGECKO_BASE}/coins/markets`);
      url.searchParams.set('vs_currency', 'usd');
      url.searchParams.set('ids', COINGECKO_IDS);
      url.searchParams.set('order', 'market_cap_desc');
      url.searchParams.set('per_page', '20');
      url.searchParams.set('page', '1');
      url.searchParams.set('sparkline', 'false');
      url.searchParams.set('price_change_percentage', '24h');

      const res  = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
      const json = await res.json();

      return this._mergeWithFallback(json);
    } catch (err) {
      console.warn('[CryptoService] Live fetch failed, using fallback.', err.message);
      return CRYPTO_FALLBACK;
    }
  }

  /**
   * Fetches a 7-day OHLC series for a single coin (used by the detail chart).
   * Returns null on failure.
   *
   * @param {string} nexrateId — NexRate asset id (e.g. 'btc')
   * @param {number} [days=7]
   * @returns {Promise<number[]|null>}  array of closing prices, oldest first
   */
  async fetchHistoricalPrices(nexrateId, days = 7) {
    const cgId = this._toCoinGeckoId(nexrateId);
    if (!cgId) return null;

    try {
      const url = `${COINGECKO_BASE}/coins/${cgId}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
      const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
      const json = await res.json();
      // json.prices = [[timestamp, price], ...]
      return (json.prices || []).map(([, p]) => p);
    } catch (err) {
      console.warn('[CryptoService] Historical fetch failed.', err.message);
      return null;
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * Merges live CoinGecko data with fallback to preserve static metadata
   * (icon, bg, desc, etc.) while updating volatile price fields.
   *
   * @param {object[]} rawItems — CoinGecko market items
   * @returns {import('./market.service.js').Asset[]}
   */
  _mergeWithFallback(rawItems) {
    const liveMap = new Map();
    for (const item of rawItems) {
      const id = CG_ID_MAP[item.id];
      if (!id) continue;
      liveMap.set(id, item);
    }

    return CRYPTO_FALLBACK.map(fallback => {
      const live = liveMap.get(fallback.id);
      if (!live) return fallback;

      return {
        ...fallback,
        price:  live.current_price                  ?? fallback.price,
        change: live.price_change_percentage_24h    ?? fallback.change,
        mcap:   this._fmtMarketCap(live.market_cap) ?? fallback.mcap,
        vol:    this._fmtVol(live.total_volume)     ?? fallback.vol,
        ath:    live.ath ? `$${live.ath.toLocaleString()}` : fallback.ath,
        low24:  live.low_24h  ? `$${live.low_24h.toLocaleString()}`  : fallback.low24,
        high24: live.high_24h ? `$${live.high_24h.toLocaleString()}` : fallback.high24,
        rank:   live.market_cap_rank ? `#${live.market_cap_rank}` : fallback.rank,
        supply: live.circulating_supply
          ? `${(live.circulating_supply / 1e6).toFixed(2)}M ${fallback.sym}`
          : fallback.supply,
      };
    });
  }

  _toCoinGeckoId(nexrateId) {
    return Object.entries(CG_ID_MAP).find(([, v]) => v === nexrateId)?.[0] ?? null;
  }

  _fmtMarketCap(n) {
    if (!n) return null;
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`;
    return `$${n.toLocaleString()}`;
  }

  _fmtVol(n) {
    if (!n) return null;
    if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6)  return `$${(n / 1e6).toFixed(0)}M`;
    return `$${n.toLocaleString()}`;
  }
}
