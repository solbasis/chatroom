// ─── Bot Engine (Client-Side) ───────────────────────────────────────────────
import { state } from './state.js';
import { getDb, serverTimestamp } from './utils.js';
import { getPrices, fmtNum, fmtUSD, BASIS_SUPPLY } from './prices.js';

// ─── Config ───────────────────────────────────────────────────────────────────
const BASIS_MINT   = 'A5BJBQUTR5sTzkM89hRDuApWyvgjdXpR7B7rW1r9pump';
const SOL_MINT     = 'So11111111111111111111111111111111111111112';
const HELIUS_KEY   = 'c417718c-6576-4e1b-9f59-557124378a12';
const HELIUS_URL   = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
// Note: DEX_URL, JUP_URL, price fetching functions moved to js/prices.js

const TOKEN = {
  ca:       BASIS_MINT,
  dex:      'https://dexscreener.com/solana/cf8bkjprah98nxyuttx9o2r8edxfbvjw7t1f55xv5fpi',
  twitter:  'https://x.com/solbasis',
  telegram: 'https://t.me/solbasis',
  website:  'https://databasis.info/',
};

const pick = a => a[Math.floor(Math.random() * a.length)];

// ═══════════════════════════════════════════════════════════════════════════════
// PRICE / HELIUS HELPERS (local to bot)
// ═══════════════════════════════════════════════════════════════════════════════

// Helius DAS fetch (for /holders)
async function heliusPost(method, params) {
  const r = await fetch(HELIUS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'bot', method, params }),
  });
  if (!r.ok) throw new Error(`Helius HTTP ${r.status}`);
  return (await r.json()).result;
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
    uid: 'bot-databasis',
    name: 'databasis',
    color: '#6ee75a',
    role: 'bot',
    avatarUrl: 'https://chat.databasis.info/bot-avatar.jpg',
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
  '/volume', '/ath', '/holders',
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

  // ── Volume ────────────────────────────────────────────────────────────
  if (t === '/volume') {
    try {
      const p = await getPrices();
      if (p.volume24h != null) {
        await botPost(`$BASIS 24h Trading Volume: ${fmtUSD(p.volume24h)}\n\nChart: ${TOKEN.dex}`);
      } else {
        await botPost('⚠ Unable to fetch volume data.');
      }
    } catch { await botPost('⚠ Unable to fetch volume data.'); }
    return true;
  }

  // ── ATH mcap ──────────────────────────────────────────────────────────
  if (t === '/ath') {
    try {
      const db = getDb();
      const snap = await db.collection('bot-state').doc('buy-alerts').get();
      if (snap.exists && snap.data().athMcap) {
        const ath = snap.data().athMcap;
        await botPost(`$BASIS ATH Market Cap: ${fmtUSD(ath)}\n\nChart: ${TOKEN.dex}`);
      } else {
        await botPost('⚠ ATH data not available yet.');
      }
    } catch { await botPost('⚠ Unable to fetch ATH data.'); }
    return true;
  }

  // ── Top holders ───────────────────────────────────────────────────────
  if (t === '/holders') {
    try {
      const result = await heliusPost('getTokenAccounts', {
        mint: BASIS_MINT,
        limit: 10,
        sortBy: { sortBy: 'ui_token_amount', sortDirection: 'desc' },
      });
      const accounts = result?.token_accounts ?? [];
      if (!accounts.length) { await botPost('⚠ No holder data available.'); return true; }
      const top5 = accounts.slice(0, 5);
      let msg = '$BASIS Top 5 Holders:\n\n';
      top5.forEach((a, i) => {
        const addr = a.owner || a.address || '???';
        const short = addr.length > 10 ? addr.slice(0, 4) + '...' + addr.slice(-4) : addr;
        const amt = a.amount ? (parseFloat(a.amount) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '?';
        msg += `${i + 1}. ${short} — ${amt} BASIS\n`;
      });
      msg += `\nhttps://solscan.io/token/${BASIS_MINT}#holders`;
      await botPost(msg);
    } catch (e) { await botPost('⚠ Unable to fetch holder data: ' + e.message); }
    return true;
  }

  return false;
}
