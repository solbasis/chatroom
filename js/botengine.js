// ─── Bot Engine (Client-Side) ───────────────────────────────────────────────
import { state } from './state.js';
import { getDb, serverTimestamp } from './utils.js';
import { getPrices, fmtNum, fmtUSD, BASIS_SUPPLY } from './prices.js';

// ─── Config ───────────────────────────────────────────────────────────────────
const BASIS_MINT   = 'A5BJBQUTR5sTzkM89hRDuApWyvgjdXpR7B7rW1r9pump';
const SOL_MINT     = 'So11111111111111111111111111111111111111112';
const HELIUS_KEY   = '00ddde2e-972f-4cbf-a505-f17e13f54dfb';
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
// HELIUS HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const HELIUS_REST = `https://api.helius.xyz/v0`;

const KNOWN_WALLETS = {
  '39azUYFWPz3VChUwbpURdCHRxjWVowf5jUJjg': 'Pump.fun Bonding Curve',
};

async function heliusPost(method, params) {
  const r = await fetch(HELIUS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'bot', method, params }),
  });
  if (!r.ok) throw new Error(`Helius HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'RPC error');
  return j.result;
}

// Paginate ALL token accounts and aggregate by owner wallet (mirrors terminal logic)
async function fetchAllHolders(maxPages = 15) {
  const owners = new Map();
  let page = 1;
  while (page <= maxPages) {
    const res = await heliusPost('getTokenAccounts', {
      mint: BASIS_MINT,
      page,
      limit: 1000,
      displayOptions: {},
    });
    const accounts = res?.token_accounts ?? [];
    if (!accounts.length) break;
    for (const a of accounts) {
      if (!a.owner) continue;
      const amt = (Number(a.amount) || 0) / 1e6;
      if (amt > 0) owners.set(a.owner, (owners.get(a.owner) || 0) + amt);
    }
    if (accounts.length < 1000) break;
    page++;
    await new Promise(r => setTimeout(r, 50));
  }
  return [...owners.entries()]
    .map(([owner, amount]) => ({ owner, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function holderTier(a) {
  if (a >= 1e7) return 'Whale';
  if (a >= 1e6) return 'Shark';
  if (a >= 1e5) return 'Dolphin';
  if (a >= 1e4) return 'Fish';
  if (a >= 1e3) return 'Shrimp';
  if (a >= 1) return 'Plankton';
  return 'Dust';
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

async function tryLock(lockId, ttlMs = 15000) {
  const db = getDb();
  const ref = db.collection('bot-locks').doc(lockId);
  try {
    return await db.runTransaction(async txn => {
      const doc = await txn.get(ref);
      if (doc.exists) {
        const age = Date.now() - (doc.data().ts?.toMillis?.() || 0);
        if (age < ttlMs) return false;
      }
      txn.set(ref, { ts: serverTimestamp(), by: state.me?.uid || 'unknown' });
      return true;
    });
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

    // Deterministic 20-second bucket — all clients generate the same lock ID
    const bucket = Math.floor(Date.now() / 20000);
    const lockId = `welcome-${name.toLowerCase().replace(/\W/g, '')}-${bucket}`;
    if (!(await tryLock(lockId))) return;

    // Detect returning user: lastSeen exists and is > 2 minutes old
    const userProfile = state.allUsers.find(u => u.name === name);
    const lastSeenMs = userProfile?.lastSeen?.toMillis?.() || 0;
    const isReturning = lastSeenMs > 0 && (Date.now() - lastSeenMs) > 120000;

    setTimeout(async () => {
      const greeting = pick(GREETINGS)(name);
      if (isReturning) {
        // Short welcome for regulars
        await botPost(greeting);
      } else {
        // Full welcome for newcomers
        const bull = pick(BULLISH);
        const info = pick(INFO_BLOCKS)();
        const closer = Math.random() > 0.5 ? '\n\n' + pick(CLOSERS) : '';
        await botPost(`${greeting}\n\n${bull}\n\n${info}${closer}`);
      }
    }, 1500);
    return;
  }

  const kickMatch = text.match(/^(.+) (kicked|banned) by/);
  if (kickMatch) {
    const name = kickMatch[1];
    const bucket = Math.floor(Date.now() / 20000);
    const lockId = `bye-${name.toLowerCase().replace(/\W/g, '')}-${bucket}`;
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
  // Slash commands — always unambiguous
  '/price', '/basis', '/sol', '/ca', '/links', '/contract',
  '/mcap', '/website', '/site', '/chart', '/dex',
  '/twitter', '/x', '/tg', '/telegram',
  // Short shorthands that are clear in a crypto context
  'price', 'price?', '$basis',
  'sol price', 'sol price?',
  // CA requests
  'ca?', 'what is the ca', 'whats the ca', "what's the ca",
  'send ca', 'drop the ca', 'ca pls', 'contract address',
  'drop ca', 'give ca', 'where to buy', 'how to buy',
  // Market cap
  'mcap', 'market cap', 'marketcap',
  // Advanced commands
  '/volume', '/ath', '/holders', '/whales', '/supply',
];

// Commands that accept arguments — match by prefix
const BOT_PREFIX_CMDS = ['/balance', '/rank', '/tx', '/compare'];

export function isBotCommand(text) {
  const t = text.trim().toLowerCase();
  if (BOT_TRIGGERS.includes(t)) return true;
  return BOT_PREFIX_CMDS.some(cmd => t === cmd || t.startsWith(cmd + ' '));
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
  if (['/sol', 'sol price', 'sol price?'].includes(t)) {
    try {
      const p = await getPrices();
      if (p.sol) await botPost(`SOL: $${fmtNum(p.sol, 2)} USD`);
      else await botPost('⚠ Unable to fetch SOL price.');
    } catch { await botPost('⚠ Unable to fetch SOL price.'); }
    return true;
  }

  // ── CA / links ────────────────────────────────────────────────────────
  if (['/ca', 'ca?', '/links', '/contract',
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
  if (['/mcap', 'mcap', 'market cap', 'marketcap'].includes(t)) {
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
  if (['/website', '/site'].includes(t)) { await botPost(`BASIS Website: ${TOKEN.website}`); return true; }

  // ── Chart / DEX ───────────────────────────────────────────────────────
  if (['/chart', '/dex'].includes(t)) { await botPost(`$BASIS Chart: ${TOKEN.dex}`); return true; }

  // ── Twitter ───────────────────────────────────────────────────────────
  if (['/twitter', '/x'].includes(t)) { await botPost(`Follow $BASIS on X: ${TOKEN.twitter}`); return true; }

  // ── Telegram ──────────────────────────────────────────────────────────
  if (['/tg', '/telegram'].includes(t)) { await botPost(`Join the $BASIS Telegram: ${TOKEN.telegram}`); return true; }

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
      const recorded = snap.exists ? (snap.data().athMcap || 0) : 0;
      if (recorded > 0) {
        await botPost(`$BASIS ATH Market Cap: ${fmtUSD(recorded)}\n\nChart: ${TOKEN.dex}`);
      } else {
        // Fall back to live price as minimum known ATH
        const p = await getPrices();
        if (p.basis) {
          const liveMcap = p.basis * BASIS_SUPPLY;
          await botPost(`$BASIS Market Cap (live): ${fmtUSD(liveMcap)}\n\nATH tracking begins once the buy-alert poller records a new high.\n\nChart: ${TOKEN.dex}`);
        } else {
          await botPost('⚠ ATH data not available yet.');
        }
      }
    } catch { await botPost('⚠ Unable to fetch ATH data.'); }
    return true;
  }

  // ── Top 5 holders ─────────────────────────────────────────────────────
  if (t === '/holders') {
    try {
      await botPost('⏳ Fetching holder data…');
      const holders = await fetchAllHolders();
      if (!holders.length) { await botPost('⚠ No holder data available.'); return true; }
      const top5 = holders.slice(0, 5);
      let msg = `$BASIS Top 5 Holders (${holders.length.toLocaleString()} total):\n\n`;
      top5.forEach((h, i) => {
        const short = h.owner.slice(0, 4) + '...' + h.owner.slice(-4);
        const amt = h.amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
        const pct = (h.amount / BASIS_SUPPLY * 100).toFixed(2);
        const label = KNOWN_WALLETS[h.owner] ? ` [${KNOWN_WALLETS[h.owner]}]` : '';
        msg += `${i + 1}. ${short} — ${amt} BASIS (${pct}%)${label}\n`;
      });
      msg += `\nhttps://orbmarkets.io/token/${BASIS_MINT}`;
      await botPost(msg);
    } catch (e) { await botPost('⚠ Unable to fetch holder data: ' + e.message); }
    return true;
  }

  // ── Top 10 whales ──────────────────────────────────────────────────────
  if (t === '/whales') {
    try {
      await botPost('⏳ Fetching whale data…');
      const holders = await fetchAllHolders();
      if (!holders.length) { await botPost('⚠ No holder data available.'); return true; }
      const top10 = holders.slice(0, 10);
      const whaleTotal = top10.reduce((s, h) => s + h.amount, 0);
      let msg = `$BASIS Top 10 Holders:\n\n`;
      top10.forEach((h, i) => {
        const short = h.owner.slice(0, 4) + '...' + h.owner.slice(-4);
        const amt = h.amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
        const pct = (h.amount / BASIS_SUPPLY * 100).toFixed(2);
        const label = KNOWN_WALLETS[h.owner] ? ` [${KNOWN_WALLETS[h.owner]}]` : '';
        msg += `${i + 1}. ${short} — ${amt} BASIS (${pct}%)${label}\n`;
      });
      msg += `\nTop 10 hold: ${(whaleTotal / BASIS_SUPPLY * 100).toFixed(2)}% of supply`;
      await botPost(msg);
    } catch (e) { await botPost('⚠ Unable to fetch whale data: ' + e.message); }
    return true;
  }

  // ── Supply distribution ────────────────────────────────────────────────
  if (t === '/supply') {
    try {
      await botPost('⏳ Fetching supply data…');
      const holders = await fetchAllHolders();
      if (!holders.length) { await botPost('⚠ No holder data available.'); return true; }
      const inWallets = holders.reduce((s, h) => s + h.amount, 0);
      const top10pct  = (holders.slice(0, 10).reduce((s, h) => s + h.amount, 0) / BASIS_SUPPLY * 100).toFixed(2);
      const top50pct  = (holders.slice(0, 50).reduce((s, h) => s + h.amount, 0) / BASIS_SUPPLY * 100).toFixed(2);
      const top100pct = (holders.slice(0, 100).reduce((s, h) => s + h.amount, 0) / BASIS_SUPPLY * 100).toFixed(2);
      const tiers = [
        { n: 'Whale 🐳',   min: 1e7 },
        { n: 'Shark 🦈',   min: 1e6 },
        { n: 'Dolphin 🐬', min: 1e5 },
        { n: 'Fish 🐟',    min: 1e4 },
        { n: 'Shrimp 🦐',  min: 1e3 },
        { n: 'Plankton',   min: 1 },
      ];
      let msg = `$BASIS Supply Distribution:\n\n`;
      msg += `Total Supply: ${BASIS_SUPPLY.toLocaleString()} BASIS\n`;
      msg += `In Wallets:   ${inWallets.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n`;
      msg += `Holders:      ${holders.length.toLocaleString()}\n\n`;
      msg += `Concentration:\n`;
      msg += `Top 10:  ${top10pct}%\n`;
      msg += `Top 50:  ${top50pct}%\n`;
      msg += `Top 100: ${top100pct}%\n\n`;
      msg += `Tiers:\n`;
      tiers.forEach(tier => {
        const count = holders.filter(h => h.amount >= tier.min).length;
        if (count > 0) msg += `${tier.n}: ${count.toLocaleString()}\n`;
      });
      await botPost(msg);
    } catch (e) { await botPost('⚠ Unable to fetch supply data: ' + e.message); }
    return true;
  }

  // ── Wallet balance ─────────────────────────────────────────────────────
  if (t.startsWith('/balance')) {
    const wallet = text.trim().split(/\s+/)[1];
    if (!wallet) { await botPost('Usage: /balance <wallet address>'); return true; }
    try {
      const res = await heliusPost('getTokenAccounts', { mint: BASIS_MINT, owner: wallet, displayOptions: {} });
      let total = 0;
      for (const a of (res?.token_accounts ?? [])) total += (Number(a.amount) || 0) / 1e6;
      if (total === 0) { await botPost(`No $BASIS found for ${wallet.slice(0, 8)}...`); return true; }
      const pct = (total / BASIS_SUPPLY * 100).toFixed(4);
      const short = wallet.slice(0, 4) + '...' + wallet.slice(-4);
      await botPost(
        `$BASIS Balance:\n\n` +
        `${short}\n` +
        `${total.toLocaleString('en-US', { maximumFractionDigits: 0 })} BASIS\n` +
        `${pct}% of supply\n` +
        `Tier: ${holderTier(total)}\n\n` +
        `https://orbmarkets.io/account/${wallet}`
      );
    } catch (e) { await botPost('⚠ Unable to fetch balance: ' + e.message); }
    return true;
  }

  // ── Holder rank ────────────────────────────────────────────────────────
  if (t.startsWith('/rank')) {
    const wallet = text.trim().split(/\s+/)[1];
    if (!wallet) { await botPost('Usage: /rank <wallet address>'); return true; }
    try {
      await botPost('⏳ Fetching rank data…');
      const holders = await fetchAllHolders();
      const idx = holders.findIndex(h => h.owner === wallet);
      if (idx === -1) { await botPost('Wallet not found among $BASIS holders.'); return true; }
      const h = holders[idx];
      const rank = idx + 1;
      const pctile = ((holders.length - idx) / holders.length * 100).toFixed(1);
      const short = wallet.slice(0, 4) + '...' + wallet.slice(-4);
      await botPost(
        `$BASIS Holder Rank:\n\n` +
        `${short}\n` +
        `Rank: #${rank} of ${holders.length.toLocaleString()}\n` +
        `Top ${pctile}% of holders\n` +
        `${h.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })} BASIS (${(h.amount / BASIS_SUPPLY * 100).toFixed(4)}%)\n` +
        `Tier: ${holderTier(h.amount)}\n\n` +
        `https://orbmarkets.io/account/${wallet}`
      );
    } catch (e) { await botPost('⚠ Unable to fetch rank: ' + e.message); }
    return true;
  }

  // ── Recent transfers ───────────────────────────────────────────────────
  if (t.startsWith('/tx')) {
    const wallet = text.trim().split(/\s+/)[1];
    if (!wallet) { await botPost('Usage: /tx <wallet address>'); return true; }
    try {
      const url = `${HELIUS_REST}/addresses/${wallet}/transactions?api-key=${HELIUS_KEY}&limit=20&type=TRANSFER`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const txs = await r.json();
      const bTxs = [];
      for (const tx of (txs || [])) {
        for (const tt of (tx.tokenTransfers || [])) {
          if (tt.mint !== BASIS_MINT) continue;
          bTxs.push({
            type: tt.fromUserAccount === wallet ? 'SENT' : 'RECV',
            amount: tt.tokenAmount || 0,
            other: (tt.fromUserAccount === wallet ? tt.toUserAccount : tt.fromUserAccount) || '?',
            time: tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleDateString() : '',
          });
        }
      }
      if (!bTxs.length) { await botPost(`No recent $BASIS transfers for ${wallet.slice(0, 8)}...`); return true; }
      const short = wallet.slice(0, 4) + '...' + wallet.slice(-4);
      let msg = `$BASIS Recent Transfers — ${short}:\n\n`;
      bTxs.slice(0, 8).forEach(tx => {
        const amt = tx.amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
        const cp = tx.other.slice(0, 4) + '...' + tx.other.slice(-4);
        msg += `${tx.type}  ${amt} BASIS  ${tx.type === 'SENT' ? '→' : '←'} ${cp}${tx.time ? '  · ' + tx.time : ''}\n`;
      });
      msg += `\nhttps://orbmarkets.io/account/${wallet}`;
      await botPost(msg);
    } catch (e) { await botPost('⚠ Unable to fetch transactions: ' + e.message); }
    return true;
  }

  return false;
}
