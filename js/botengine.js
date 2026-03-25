// ─── Bot Engine (Client-Side) ───────────────────────────────────────────────
// Runs in the browser — no server needed. Handles welcome messages,
// goodbye messages, and slash commands like /price, /ca, /mcap.
// Responses appear as system-style messages posted to Firestore.

import { state, $ } from './state.js';
import { getDb, serverTimestamp } from './utils.js';

// ─── Token Info ─────────────────────────────────────────────────────────────
const TOKEN = {
  ca:       'A5BJBQUTR5sTzkM89hRDuApWyvgjdXpR7B7rW1r9pump',
  dex:      'https://dexscreener.com/solana/cf8bkjprah98nxyuttx9o2r8edxfbvjw7t1f55xv5fpi',
  twitter:  'https://x.com/solbasis',
  telegram: 'https://t.me/solbasis',
  website:  'https://databasis.info/',
};

const HELIUS_KEY = 'c417718c-6576-4e1b-9f59-557124378a12';
const WSOL = 'So11111111111111111111111111111111111111112';
const JUPITER_PRICE = 'https://api.jup.ag/price/v2';

const pick = a => a[Math.floor(Math.random() * a.length)];

// ─── Welcome Messages (30 greetings × 40 bullish × 6 info = 7200+ combos) ──
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
  `The fundamentals are clear. $BASIS is undervalued.`,
  `$BASIS — Solana's best kept secret.`,
  `Community, code, conviction. That's $BASIS.`,
  `Buy the infrastructure, not the narrative. $BASIS.`,
  `$BASIS is the foundation. Everything else is noise.`,
  `When the dust settles, $BASIS will still be here.`,
  `$BASIS doesn't need a bull market. But it'll love one.`,
  `One terminal to rule them all. $BASIS.`,
  `The alpha is in the room. The room is $BASIS.`,
  `We build in bear. We thrive in bull. $BASIS.`,
  `$BASIS — where degens become believers.`,
  `Keep it simple. Keep it $BASIS.`,
  `Every dip is a gift. $BASIS builders know.`,
  `$BASIS — when the market zigs, we zag.`,
  `The next 100x isn't on your timeline. It's on $BASIS.`,
  `Forget the charts for a second. Look at what $BASIS is building.`,
  `$BASIS: the data layer will be worth more than the hype layer.`,
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

// ─── Lock mechanism (prevents duplicate responses from multiple clients) ────
async function tryLock(lockId, ttlMs = 10000) {
  const db = getDb();
  const ref = db.collection('bot-locks').doc(lockId);
  try {
    const doc = await ref.get();
    if (doc.exists) {
      const age = Date.now() - (doc.data().ts?.toMillis?.() || 0);
      if (age < ttlMs) return false; // another client already handling
    }
    await ref.set({ ts: serverTimestamp(), by: state.me?.uid || 'unknown' });
    return true;
  } catch { return false; }
}

// ─── Post a bot response ────────────────────────────────────────────────────
// Uses the current user's uid so Firestore rules allow the write.
// Displays as "databasis" via the name/color/role fields.
async function botPost(text) {
  if (!state.me) return;
  const db = getDb();
  await db.collection('messages').add({
    type: 'user',
    uid: state.me.uid,        // must match auth uid for rules
    name: 'databasis',        // displayed as bot name
    color: '#6ee75a',
    role: 'bot',
    avatarUrl: '',
    text,
    ts: serverTimestamp(),
    deleted: false,
  });
}

// ─── System message handler (join / kick / ban) ─────────────────────────────
export async function handleBotSystemMessage(text) {
  if (!state.me) return;

  // New user joined
  const joinMatch = text.match(/^(.+) has entered the room$/);
  if (joinMatch) {
    const name = joinMatch[1];
    if (name.toLowerCase() === 'databasis') return;
    if (name === state.me?.name) return; // don't welcome yourself

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

  // Kicked or banned
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

// ─── Command handler (called from chat.js when a user types a message) ──────
// Returns true if the message was a bot command (so chat.js skips normal send)
export async function handleBotCommand(text) {
  const t = text.trim().toLowerCase();

  // ── Price ─────────────────────────────────────────────────────────────
  if (['/price', '/basis', 'price', 'price?', '$basis'].includes(t)) {
    await cmdPrice();
    return true;
  }

  // ── SOL price ─────────────────────────────────────────────────────────
  if (['/sol', 'sol price', 'sol price?', 'sol?'].includes(t)) {
    await cmdSol();
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
    await cmdMcap();
    return true;
  }

  // ── Website ───────────────────────────────────────────────────────────
  if (['/website', 'website', 'site', '/site'].includes(t)) {
    await botPost(`BASIS Website: ${TOKEN.website}`);
    return true;
  }

  // ── Chart / DEX ───────────────────────────────────────────────────────
  if (['/chart', '/dex', 'chart', 'dex', 'chart?'].includes(t)) {
    await botPost(`$BASIS Chart: ${TOKEN.dex}`);
    return true;
  }

  // ── Twitter ───────────────────────────────────────────────────────────
  if (['/twitter', '/x', 'twitter', 'x?'].includes(t)) {
    await botPost(`Follow $BASIS on X: ${TOKEN.twitter}`);
    return true;
  }

  // ── Telegram ──────────────────────────────────────────────────────────
  if (['/tg', '/telegram', 'telegram', 'tg', 'tg?'].includes(t)) {
    await botPost(`Join the $BASIS Telegram: ${TOKEN.telegram}`);
    return true;
  }

  return false; // not a bot command
}

// ─── Price command ──────────────────────────────────────────────────────────
async function cmdPrice() {
  try {
    // Fetch from Jupiter (SOL + BASIS prices)
    const jupRes = await fetch(`${JUPITER_PRICE}?ids=${WSOL},${TOKEN.ca}`);
    const jupData = await jupRes.json();
    const solUsd   = parseFloat(jupData?.data?.[WSOL]?.price || 0);
    const basisUsd = parseFloat(jupData?.data?.[TOKEN.ca]?.price || 0);

    // Fetch supply from Helius DAS
    let mcap = 0;
    try {
      const dasRes = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 'bp',
          method: 'getAsset',
          params: { id: TOKEN.ca, displayOptions: { showFungible: true } },
        }),
      });
      const dasData = await dasRes.json();
      const info = dasData?.result?.token_info;
      if (info?.supply && basisUsd) {
        const supply = info.supply / Math.pow(10, info.decimals || 6);
        mcap = basisUsd * supply;
      }
    } catch {}

    const fmt = (n, d = 2) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d });

    let msg = `$BASIS: $${fmt(basisUsd, 10)}`;
    if (mcap > 0) msg += `\nMarket Cap: $${fmt(mcap, 0)}`;
    if (solUsd > 0) msg += `\n\nSOL: $${fmt(solUsd)}`;
    msg += `\n\nChart: ${TOKEN.dex}`;

    await botPost(msg);
  } catch (e) {
    await botPost('⚠ Unable to fetch price data. Try again shortly.');
  }
}

// ─── SOL price command ──────────────────────────────────────────────────────
async function cmdSol() {
  try {
    const res = await fetch(`${JUPITER_PRICE}?ids=${WSOL}`);
    const data = await res.json();
    const price = parseFloat(data?.data?.[WSOL]?.price || 0);
    if (price > 0) {
      await botPost(`SOL: $${Number(price).toLocaleString('en-US', { maximumFractionDigits: 2 })} USD`);
    } else {
      await botPost('⚠ Unable to fetch SOL price.');
    }
  } catch {
    await botPost('⚠ Unable to fetch SOL price.');
  }
}

// ─── Market cap command ─────────────────────────────────────────────────────
async function cmdMcap() {
  try {
    const [jupRes, dasRes] = await Promise.all([
      fetch(`${JUPITER_PRICE}?ids=${TOKEN.ca}`),
      fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 'mc',
          method: 'getAsset',
          params: { id: TOKEN.ca, displayOptions: { showFungible: true } },
        }),
      }),
    ]);

    const jupData = await jupRes.json();
    const dasData = await dasRes.json();
    const price  = parseFloat(jupData?.data?.[TOKEN.ca]?.price || 0);
    const info   = dasData?.result?.token_info;
    const supply = info?.supply ? info.supply / Math.pow(10, info.decimals || 6) : 0;
    const mcap   = price * supply;

    if (mcap > 0) {
      await botPost(`$BASIS Market Cap: $${Number(mcap).toLocaleString('en-US', { maximumFractionDigits: 0 })}\n\nChart: ${TOKEN.dex}`);
    } else {
      await botPost('⚠ Unable to fetch market cap data.');
    }
  } catch {
    await botPost('⚠ Unable to fetch market cap data.');
  }
}
