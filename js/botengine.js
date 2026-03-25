// ─── Bot Engine (Client-Side) ───────────────────────────────────────────────
// Price fetching copied VERBATIM from the working databasis.info live prices page.

import { state } from './state.js';
import { getDb, serverTimestamp } from './utils.js';

// ─── Config (identical to databasis.info) ───────────────────────────────────
const BASIS_MINT   = 'A5BJBQUTR5sTzkM89hRDuApWyvgjdXpR7B7rW1r9pump';
const SOL_MINT     = 'So11111111111111111111111111111111111111112';
const BASIS_SUPPLY = 1_000_000_000;
const HELIUS_KEY   = 'c417718c-6576-4e1b-9f59-557124378a12';
const HELIUS_URL   = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const DEX_URL      = `https://api.dexscreener.com/tokens/v1/solana/${BASIS_MINT},${SOL_MINT}`;
const JUP_URL      = `https://api.jup.ag/price/v2?ids=${BASIS_MINT},${SOL_MINT}`;

const TOKEN = {
  ca:       BASIS_MINT,
  dex:      'https://dexscreener.com/solana/cf8bkjprah98nxyuttx9o2r8edxfbvjw7t1f55xv5fpi',
  twitter:  'https://x.com/solbasis',
  telegram: 'https://t.me/solbasis',
  website:  'https://databasis.info/',
};

const pick = a => a[Math.floor(Math.random() * a.length)];

// ═══════════════════════════════════════════════════════════════════════════════
// PRICE FETCHING — EXACT COPY from databasis.info/index.html
// ═══════════════════════════════════════════════════════════════════════════════

// Source 1: DexScreener (free, no key, pump.fun native)
async function fetchDexScreener() {
  const r = await fetch(DEX_URL);
  if (!r.ok) throw new Error(`DexScreener HTTP ${r.status}`);
  const data = await r.json();
  const pairs = Array.isArray(data) ? data : (data.pairs ?? []);

  let solPrice = null, solVol = 0;
  let basisPrice = null, basisVol = 0;

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

  return { sol: solPrice, basis: basisPrice };
}

// Source 2: Jupiter Price API v2 (fallback)
async function fetchJupiter() {
  const r = await fetch(JUP_URL);
  if (!r.ok) throw new Error(`Jupiter HTTP ${r.status}`);
  const d = await r.json();
  return {
    sol:   parseFloat(d?.data?.[SOL_MINT]?.price)   || null,
    basis: parseFloat(d?.data?.[BASIS_MINT]?.price)  || null,
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

// Waterfall: DexScreener → Jupiter → Helius DAS (SAME as databasis.info)
async function getPrices() {
  let solPrice   = null;
  let basisPrice = null;

  // Try Source 1: DexScreener
  try {
    const dex = await fetchDexScreener();
    solPrice   = dex.sol;
    basisPrice = dex.basis;
  } catch (e) { console.warn('[bot] DexScreener failed:', e.message); }

  // Try Source 2: Jupiter (fill any still-null values)
  if (solPrice === null || basisPrice === null) {
    try {
      const jup = await fetchJupiter();
      if (solPrice   === null) solPrice   = jup.sol;
      if (basisPrice === null) basisPrice = jup.basis;
    } catch (e) { console.warn('[bot] Jupiter failed:', e.message); }
  }

  // Try Source 3: Helius DAS (fill any still-null values)
  if (solPrice === null || basisPrice === null) {
    try {
      const [s, b] = await Promise.all([
        solPrice   === null ? fetchHeliusDAS(SOL_MINT)   : Promise.resolve(null),
        basisPrice === null ? fetchHeliusDAS(BASIS_MINT) : Promise.resolve(null),
      ]);
      if (solPrice   === null) solPrice   = s;
      if (basisPrice === null) basisPrice = b;
    } catch (e) { console.warn('[bot] Helius DAS failed:', e.message); }
  }

  return { sol: solPrice, basis: basisPrice };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMATTERS (same as databasis.info)
// ═══════════════════════════════════════════════════════════════════════════════

function fmtNum(n, d = 2) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtUSD(n) {
  if (!n || isNaN(n)) return '$—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(4);
}

// ═══════════════════════════════════════════════════════════════════════════════
// WELCOME / GOODBYE MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════

const GREETINGS = [
  n => `Welcome to the terminal, ${n}.`,
  n => `${n} just connected to the BASIS network.`,
  n => `A new node has entered the room. Welcome, ${n}.`,
  n => `Signal acquired. Welcome aboard, ${n}.`,
  n => `${n} has plugged into the matrix. Welcome.`,
  n => `Transmission received from ${n}. Welcome to BASIS.`,
  n => `New connection established: ${n}. Welcome.`,
  n => `${n} has entered the chat. The network grows stronger.`,
  n => `Welcome to the grid, ${n}. You're one of us now.`,
  n => `${n} just dialed in. Welcome to the BASIS terminal.`,
  n => `Another node online. Welcome, ${n}.`,
  n => `Initializing session for ${n}... Welcome.`,
  n => `Hey ${n}, welcome to the BASIS chatroom.`,
  n => `${n} — you've found the right terminal. Welcome.`,
  n => `Access granted. Welcome to BASIS, ${n}.`,
  n => `The network welcomes ${n}. Pull up a chair.`,
  n => `${n} is now online. Good to have you here.`,
  n => `Welcome, ${n}. The future is decentralized.`,
  n => `New signal detected: ${n}. Welcome to the room.`,
  n => `${n} has synced with the network. Welcome.`,
  n => `Hello ${n}. You're now part of the BASIS collective.`,
  n => `${n} just dropped in. Welcome to the terminal.`,
  n => `We've been expecting you, ${n}. Welcome.`,
  n => `Connection secure. Welcome to BASIS, ${n}.`,
  n => `${n} has arrived. The room just got better.`,
  n => `The BASIS terminal recognizes ${n}. Welcome.`,
  n => `${n} is here. Let the transmissions begin.`,
  n => `Welcome to the data layer, ${n}.`,
  n => `Authenticated: ${n}. Welcome to the room.`,
  n => `${n} just booted up. Welcome to the network.`,
];

const BULLISH = [
  `$BASIS is building the future, one block at a time.`,
  `The data layer doesn't sleep. $BASIS keeps grinding.`,
  `Diamond hands don't need convincing. $BASIS speaks for itself.`,
  `Not just a token — $BASIS is infrastructure.`,
  `While they chase pumps, we build foundations. $BASIS.`,
  `The terminal is alive. $BASIS is just getting started.`,
  `Stack your $BASIS. This is generational.`,
  `$BASIS isn't a bet — it's a conviction.`,
  `The smart money is already here. $BASIS.`,
  `Solana speed. BASIS vision. Unstoppable.`,
  `The data doesn't lie. $BASIS is the play.`,
  `$BASIS — the quietest alpha in the room.`,
  `In a sea of noise, $BASIS is the signal.`,
  `We don't hope for pumps. We build $BASIS.`,
  `$BASIS is what happens when devs actually ship.`,
  `This isn't a chatroom. It's a launchpad. $BASIS.`,
  `The network grows. The signal strengthens. $BASIS.`,
  `$BASIS — we're not early, we're on time.`,
  `The terminal never lies. $BASIS is the way.`,
  `Some tokens pump. $BASIS compounds.`,
  `Real builders don't need hype. $BASIS.`,
  `$BASIS moves in silence. Then it moves in price.`,
  `If you know, you know. $BASIS.`,
  `$BASIS — Solana's best kept secret.`,
  `Community, code, conviction. That's $BASIS.`,
  `$BASIS is the foundation. Everything else is noise.`,
  `When the dust settles, $BASIS will still be here.`,
  `One terminal to rule them all. $BASIS.`,
  `We build in bear. We thrive in bull. $BASIS.`,
  `$BASIS — where degens become believers.`,
  `Keep it simple. Keep it $BASIS.`,
  `Every dip is a gift. $BASIS builders know.`,
  `$BASIS — when the market zigs, we zag.`,
  `The next 100x isn't on your timeline. It's on $BASIS.`,
  `Forget the charts. Look at what $BASIS is building.`,
];

const INFO_BLOCKS = [
  () => `CA: ${TOKEN.ca}\nDEX: ${TOKEN.dex}\nX: ${TOKEN.twitter}\nTG: ${TOKEN.telegram}\nWeb: ${TOKEN.website}`,
  () => `Contract: ${TOKEN.ca}\nChart: ${TOKEN.dex}\nTwitter: ${TOKEN.twitter} | Telegram: ${TOKEN.telegram}`,
  () => `${TOKEN.dex}\nCA: ${TOKEN.ca}\n${TOKEN.website}`,
  () => `Track $BASIS: ${TOKEN.dex}\nJoin us: ${TOKEN.telegram}\nFollow: ${TOKEN.twitter}`,
  () => `CA: ${TOKEN.ca}\nLinks: ${TOKEN.dex} | ${TOKEN.twitter} | ${TOKEN.telegram}`,
  () => `$BASIS info:\nCA: ${TOKEN.ca}\nDEX: ${TOKEN.dex}\nTG: ${TOKEN.telegram} | X: ${TOKEN.twitter}`,
];

const CLOSERS = [
  `Type /help to see what you can do here.`,
  `Say /price to check the latest $BASIS stats.`,
  `Need the CA? Just type /ca.`,
  `Explore the terminal. Type /help to get started.`,
  `The terminal is yours. Make yourself at home.`,
  `WAGMI.`,
];

const GOODBYES = [
  n => `${n} has disconnected from the terminal.`,
  n => `Signal lost: ${n}. Until next time.`,
  n => `${n} has left the network. The terminal remembers.`,
  n => `${n} went offline. See you on the other side.`,
  n => `Connection closed: ${n}. Come back soon.`,
  n => `${n} signed off. The grid will be here when you return.`,
  n => `${n} has exited the room. Stay based.`,
  n => `Transmission ended: ${n}. WAGMI.`,
  n => `${n} unplugged. The network awaits your return.`,
  n => `${n} has left the chat. Keep stacking $BASIS.`,
];

// ═══════════════════════════════════════════════════════════════════════════════
// LOCK (prevents duplicate bot responses from multiple clients)
// ═══════════════════════════════════════════════════════════════════════════════

async function tryLock(lockId, ttlMs = 10000) {
  const db = getDb();
  const ref = db.collection('bot-locks').doc(lockId);
  try {
    const doc = await ref.get();
    if (doc.exists) {
      const age = Date.now() - (doc.data().ts?.toMillis?.() || 0);
      if (age < ttlMs) return false;
    }
    await ref.set({ ts: serverTimestamp(), by: state.me?.uid || 'unknown' });
    return true;
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST BOT MESSAGE
// ═══════════════════════════════════════════════════════════════════════════════

async function botPost(text) {
  if (!state.me) return;
  const db = getDb();
  await db.collection('messages').add({
    type: 'user',
    uid: state.me.uid,
    name: 'databasis',
    color: '#6ee75a',
    role: 'bot',
    avatarUrl: '',
    text,
    ts: serverTimestamp(),
    deleted: false,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM MESSAGE HANDLER (join / kick / ban)
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleBotSystemMessage(text) {
  if (!state.me) return;

  const joinMatch = text.match(/^(.+) has entered the room$/);
  if (joinMatch) {
    const name = joinMatch[1];
    if (name.toLowerCase() === 'databasis') return;
    if (name === state.me?.name) return;

    const lockId = `welcome-${name}-${Date.now().toString(36).slice(-4)}`;
    if (!(await tryLock(lockId))) return;

    setTimeout(async () => {
      const greeting = pick(GREETINGS)(name);
      const bull = pick(BULLISH);
      const info = pick(INFO_BLOCKS)();
      const closer = Math.random() > 0.5 ? '\n\n' + pick(CLOSERS) : '';
      await botPost(`${greeting}\n\n${bull}\n\n${info}${closer}`);
    }, 1500);
    return;
  }

  const kickMatch = text.match(/^(.+) (kicked|banned) by/);
  if (kickMatch) {
    const name = kickMatch[1];
    const lockId = `bye-${name}-${Date.now().toString(36).slice(-4)}`;
    if (!(await tryLock(lockId))) return;

    setTimeout(async () => {
      await botPost(pick(GOODBYES)(name));
    }, 1000);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

const BOT_TRIGGERS = [
  '/price', '/basis', 'price', 'price?', '$basis',
  '/sol', 'sol price', 'sol price?', 'sol?',
  '/ca', 'ca', 'ca?', '/links', 'links', '/contract', 'contract',
  'what is the ca', 'whats the ca', "what's the ca",
  'send ca', 'drop the ca', 'ca pls', 'contract address',
  'drop ca', 'give ca', 'where to buy', 'how to buy',
  '/mcap', 'mcap', 'market cap', 'marketcap', 'mc', 'mc?',
  '/website', 'website', 'site', '/site',
  '/chart', '/dex', 'chart', 'dex', 'chart?',
  '/twitter', '/x', 'twitter', 'x?',
  '/tg', '/telegram', 'telegram', 'tg', 'tg?',
];

export function isBotCommand(text) {
  return BOT_TRIGGERS.includes(text.trim().toLowerCase());
}

export async function handleBotCommand(text) {
  const t = text.trim().toLowerCase();

  // ── Price ─────────────────────────────────────────────────────────────
  if (['/price', '/basis', 'price', 'price?', '$basis'].includes(t)) {
    try {
      const p = await getPrices();
      let msg = '';
      if (p.basis) {
        msg += `$BASIS: $${p.basis < 0.001 ? p.basis.toFixed(8) : fmtNum(p.basis, 6)}`;
        msg += `\nMarket Cap: ${fmtUSD(p.basis * BASIS_SUPPLY)}`;
      } else {
        msg += `$BASIS: N/A`;
      }
      if (p.sol) msg += `\n\nSOL: $${fmtNum(p.sol, 2)}`;
      msg += `\n\nChart: ${TOKEN.dex}`;
      await botPost(msg);
    } catch { await botPost('⚠ Unable to fetch price data. Try again shortly.'); }
    return true;
  }

  // ── SOL price ─────────────────────────────────────────────────────────
  if (['/sol', 'sol price', 'sol price?', 'sol?'].includes(t)) {
    try {
      const p = await getPrices();
      if (p.sol) await botPost(`SOL: $${fmtNum(p.sol, 2)} USD`);
      else await botPost('⚠ Unable to fetch SOL price.');
    } catch { await botPost('⚠ Unable to fetch SOL price.'); }
    return true;
  }

  // ── CA / links ────────────────────────────────────────────────────────
  if (['/ca', 'ca', 'ca?', '/links', 'links', '/contract', 'contract',
       'what is the ca', 'whats the ca', "what's the ca",
       'send ca', 'drop the ca', 'ca pls', 'contract address',
       'drop ca', 'give ca', 'where to buy', 'how to buy'].includes(t)) {
    await botPost(pick([
      () => `$BASIS Contract Address:\n${TOKEN.ca}\n\nDEX: ${TOKEN.dex}\nX: ${TOKEN.twitter}\nTG: ${TOKEN.telegram}\nWeb: ${TOKEN.website}`,
      () => `Here's everything you need:\n\nCA: ${TOKEN.ca}\nChart: ${TOKEN.dex}\nTwitter: ${TOKEN.twitter}\nTelegram: ${TOKEN.telegram}\nWebsite: ${TOKEN.website}`,
      () => `$BASIS links:\nCA: ${TOKEN.ca}\n${TOKEN.dex}\n${TOKEN.twitter}\n${TOKEN.telegram}\n${TOKEN.website}`,
    ])());
    return true;
  }

  // ── Market cap ────────────────────────────────────────────────────────
  if (['/mcap', 'mcap', 'market cap', 'marketcap', 'mc', 'mc?'].includes(t)) {
    try {
      const p = await getPrices();
      if (p.basis) {
        const mcap = p.basis * BASIS_SUPPLY;
        await botPost(`$BASIS Market Cap: ${fmtUSD(mcap)}\n\nChart: ${TOKEN.dex}`);
      } else {
        await botPost('⚠ Unable to fetch market cap data.');
      }
    } catch { await botPost('⚠ Unable to fetch market cap data.'); }
    return true;
  }

  // ── Website ───────────────────────────────────────────────────────────
  if (['/website', 'website', 'site', '/site'].includes(t)) { await botPost(`BASIS Website: ${TOKEN.website}`); return true; }

  // ── Chart / DEX ───────────────────────────────────────────────────────
  if (['/chart', '/dex', 'chart', 'dex', 'chart?'].includes(t)) { await botPost(`$BASIS Chart: ${TOKEN.dex}`); return true; }

  // ── Twitter ───────────────────────────────────────────────────────────
  if (['/twitter', '/x', 'twitter', 'x?'].includes(t)) { await botPost(`Follow $BASIS on X: ${TOKEN.twitter}`); return true; }

  // ── Telegram ──────────────────────────────────────────────────────────
  if (['/tg', '/telegram', 'telegram', 'tg', 'tg?'].includes(t)) { await botPost(`Join the $BASIS Telegram: ${TOKEN.telegram}`); return true; }

  return false;
}
