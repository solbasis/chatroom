// ─── Shared Price Fetching Module ────────────────────────────────────────────
// Extracted from botengine.js so both the bot and live ticker can use it.

const BASIS_MINT   = 'A5BJBQUTR5sTzkM89hRDuApWyvgjdXpR7B7rW1r9pump';
const SOL_MINT     = 'So11111111111111111111111111111111111111112';
export const BASIS_SUPPLY = 1_000_000_000;
const HELIUS_KEY   = '00ddde2e-972f-4cbf-a505-f17e13f54dfb';
const HELIUS_URL   = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const DEX_URL      = `https://api.dexscreener.com/tokens/v1/solana/${BASIS_MINT},${SOL_MINT}`;
const JUP_URL      = `https://api.jup.ag/price/v2?ids=${BASIS_MINT},${SOL_MINT}`;
const DEX_PAIR_URL = `https://api.dexscreener.com/latest/dex/tokens/${BASIS_MINT}`;

// Source 1: DexScreener (free, no key, pump.fun native)
export async function fetchDexScreener() {
  const r = await fetch(DEX_URL);
  if (!r.ok) throw new Error(`DexScreener HTTP ${r.status}`);
  const data = await r.json();
  const pairs = Array.isArray(data) ? data : (data.pairs ?? []);

  let solPrice = null, solVol = 0;
  let basisPrice = null, basisVol = 0;
  let change24h = null;
  let volume24h = null;

  for (const pair of pairs) {
    const base  = pair.baseToken?.address ?? '';
    const quote = pair.quoteToken?.address ?? '';
    const price = parseFloat(pair.priceUsd);
    if (!price || isNaN(price)) continue;
    const vol = pair.volume?.h24 ?? 0;

    if (base === BASIS_MINT || quote === BASIS_MINT) {
      const p = base === BASIS_MINT ? price : 1 / price;
      if (basisPrice === null || vol > basisVol) {
        basisPrice = p;
        basisVol = vol;
        change24h = pair.priceChange?.h24 ?? null;
        volume24h = vol;
      }
    }
    if (base === SOL_MINT || quote === SOL_MINT) {
      const p = base === SOL_MINT ? price : 1 / price;
      if (solPrice === null || vol > solVol) {
        solPrice = p;
        solVol = vol;
      }
    }
  }

  return { sol: solPrice, basis: basisPrice, change24h, volume24h };
}

// Source 2: Jupiter Price API v2 (fallback)
async function fetchJupiter() {
  const r = await fetch(JUP_URL);
  if (!r.ok) throw new Error(`Jupiter HTTP ${r.status}`);
  const d = await r.json();
  return {
    sol:   parseFloat(d?.data?.[SOL_MINT]?.price)   || null,
    basis: parseFloat(d?.data?.[BASIS_MINT]?.price)  || null,
    change24h: null,
    volume24h: null,
  };
}

// Source 3: Helius DAS (second fallback)
async function fetchHeliusDAS(mint) {
  const r = await fetch(HELIUS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'p', method: 'getAsset',
      params: { id: mint, displayOptions: { showFungible: true } },
    }),
  });
  if (!r.ok) throw new Error(`Helius DAS HTTP ${r.status}`);
  const d = await r.json();
  return d?.result?.token_info?.price_info?.price_per_token ?? null;
}

// Waterfall: DexScreener → Jupiter → Helius DAS
export async function getPrices() {
  let solPrice   = null;
  let basisPrice = null;
  let change24h  = null;
  let volume24h  = null;

  try {
    const dex = await fetchDexScreener();
    solPrice   = dex.sol;
    basisPrice = dex.basis;
    change24h  = dex.change24h;
    volume24h  = dex.volume24h;
  } catch (e) { console.warn('[prices] DexScreener failed:', e.message); }

  if (solPrice === null || basisPrice === null) {
    try {
      const jup = await fetchJupiter();
      if (solPrice   === null) solPrice   = jup.sol;
      if (basisPrice === null) basisPrice = jup.basis;
    } catch (e) { console.warn('[prices] Jupiter failed:', e.message); }
  }

  if (solPrice === null || basisPrice === null) {
    try {
      const [s, b] = await Promise.all([
        solPrice   === null ? fetchHeliusDAS(SOL_MINT)   : Promise.resolve(null),
        basisPrice === null ? fetchHeliusDAS(BASIS_MINT) : Promise.resolve(null),
      ]);
      if (solPrice   === null) solPrice   = s;
      if (basisPrice === null) basisPrice = b;
    } catch (e) { console.warn('[prices] Helius DAS failed:', e.message); }
  }

  return { sol: solPrice, basis: basisPrice, change24h, volume24h };
}

// ─── Formatters ──────────────────────────────────────────────────────────────
export function fmtNum(n, d = 2) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtUSD(n) {
  if (!n || isNaN(n)) return '$—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(4);
}
