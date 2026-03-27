// ─── Buy Alert Poller (GitHub Actions) ──────────────────────────────────────
// Runs every 5 minutes via GitHub Actions cron. Polls Helius for new $BASIS
// buys/sells and writes alert messages to Firestore. Tracks last-seen
// transaction in a Firestore document to avoid duplicates across runs.

const TOKEN_CA     = 'A5BJBQUTR5sTzkM89hRDuApWyvgjdXpR7B7rW1r9pump';
const DEX_LINK     = 'https://dexscreener.com/solana/cf8bkjprah98nxyuttx9o2r8edxfbvjw7t1f55xv5fpi';
const WSOL         = 'So11111111111111111111111111111111111111112';
const JUP_PRICE    = 'https://api.jup.ag/price/v2';
const DEX_TOKENS   = `https://api.dexscreener.com/tokens/v1/solana/${TOKEN_CA}`;
const BASIS_SUPPLY = 1_000_000_000;
const MIN_SOL      = 0.5;
const FETCH_LIMIT  = 50; // increased from 20

// ─── Tier thresholds (SOL) ───────────────────────────────────────────────────
const TIERS = [
  { min: 50,  emoji: '🐳', label: 'WHALE'   },
  { min: 10,  emoji: '🦈', label: 'SHARK'   },
  { min: 2,   emoji: '🐬', label: 'DOLPHIN' },
  { min: 0,   emoji: '🐟', label: 'FISH'    },
];

function getTier(solAmt) {
  return TIERS.find(t => solAmt >= t.min);
}

// ─── ASCII bar ───────────────────────────────────────────────────────────────
function buildBar(solAmt) {
  const max    = 50;
  const filled = Math.min(Math.round((solAmt / max) * 20), 20);
  const empty  = 20 - filled;
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}

// ─── Format helpers ──────────────────────────────────────────────────────────
function fmtUsd(usd) {
  if (usd >= 1_000_000) return '$' + (usd / 1_000_000).toFixed(2) + 'M';
  if (usd >= 1_000)     return '$' + (usd / 1_000).toFixed(1) + 'K';
  return '$' + usd.toFixed(2);
}

function fmtMcap(mcap) {
  if (!mcap || mcap === 0) return '—';
  if (mcap >= 1_000_000) return '$' + (mcap / 1_000_000).toFixed(2) + 'M';
  if (mcap >= 1_000)     return '$' + (mcap / 1_000).toFixed(1) + 'K';
  return '$' + mcap.toFixed(0);
}

function fmtPct(pct) {
  if (pct === null || pct === undefined || isNaN(pct)) return '—';
  const sign = pct >= 0 ? '+' : '';
  return sign + pct.toFixed(2) + '%';
}

async function main() {
  // ── 1. Init Firebase Admin ────────────────────────────────────────────
  const admin = (await import('firebase-admin')).default;
  const sa    = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const db = admin.firestore();
  const ts = () => admin.firestore.FieldValue.serverTimestamp();

  const HELIUS_KEY = process.env.HELIUS_API_KEY;
  if (!HELIUS_KEY) { console.error('No HELIUS_API_KEY'); process.exit(1); }

  // ── 2. Get state from Firestore ───────────────────────────────────────
  const stateRef  = db.collection('bot-state').doc('buy-alerts');
  const stateDoc  = await stateRef.get();
  const stateData = stateDoc.exists ? stateDoc.data() : {};
  let lastSig     = stateData.lastSignature || null;
  let athMcap     = stateData.athMcap       || 0;
  // Known buyers: { [wallet]: count }
  const knownBuyers = stateData.knownBuyers || {};

  console.log('Last seen sig:', lastSig ? lastSig.slice(0, 12) + '...' : 'none (first run)');
  console.log('ATH mcap:', fmtMcap(athMcap));

  // ── 3. Fetch recent swaps from Helius ─────────────────────────────────
  const url = `https://api.helius.xyz/v0/addresses/${TOKEN_CA}/transactions?api-key=${HELIUS_KEY}&limit=${FETCH_LIMIT}`;
  const res = await fetch(url);
  if (!res.ok) { console.error('Helius error:', res.status); process.exit(1); }

  const txns = await res.json();
  if (!txns?.length) { console.log('No transactions found.'); process.exit(0); }

  // First run — anchor and exit
  if (!lastSig) {
    await stateRef.set({ lastSignature: txns[0].signature, updatedAt: ts(), athMcap, knownBuyers });
    console.log('First run — anchored to:', txns[0].signature.slice(0, 12) + '...');
    process.exit(0);
  }

  // ── 4. Find new transactions since last seen ──────────────────────────
  const fresh = [];
  for (const tx of txns) {
    if (tx.signature === lastSig) break;
    fresh.push(tx);
  }

  if (!fresh.length) { console.log('No new transactions.'); process.exit(0); }
  console.log(`Found ${fresh.length} new transactions.`);

  // ── 5. Fetch market data (price, mcap, 24h change, volume) ───────────
  let price   = 0;
  let mcap    = 0;
  let pct24h  = null;
  let vol24h  = 0;
  let dexLink = DEX_LINK; // will be replaced with live pair URL if available

  try {
    const dexRes = await fetch(DEX_TOKENS);
    if (dexRes.ok) {
      const dexData = await dexRes.json();
      const pairs   = Array.isArray(dexData) ? dexData : (dexData.pairs ?? []);
      for (const pair of pairs) {
        const base  = pair.baseToken?.address ?? '';
        const quote = pair.quoteToken?.address ?? '';
        const p     = parseFloat(pair.priceUsd);
        if (!p || isNaN(p)) continue;
        if (base === TOKEN_CA || quote === TOKEN_CA) {
          price   = base === TOKEN_CA ? p : 1 / p;
          mcap    = price * BASIS_SUPPLY;
          pct24h  = parseFloat(pair.priceChange?.h24 ?? null);
          vol24h  = parseFloat(pair.volume?.h24 ?? 0);
          if (pair.url) dexLink = pair.url; // use live pair URL from DexScreener
          break;
        }
      }
    }
  } catch (e) { console.warn('DexScreener failed:', e.message); }

  // Fallback to Jupiter for price
  if (price === 0) {
    try {
      const jupRes  = await fetch(`${JUP_PRICE}?ids=${TOKEN_CA}`);
      const jupData = await jupRes.json();
      price = parseFloat(jupData?.data?.[TOKEN_CA]?.price || 0);
      if (price > 0) mcap = price * BASIS_SUPPLY;
    } catch (e) { console.warn('Jupiter price failed:', e.message); }
  }

  // ── 6. ATH check ─────────────────────────────────────────────────────
  let newAth = false;
  if (mcap > 0 && mcap > athMcap) {
    athMcap = mcap;
    newAth  = true;
    console.log('🏆 New ATH mcap:', fmtMcap(athMcap));
  }

  // ── 7. Parse buys and sells ───────────────────────────────────────────
  const alerts = [];
  for (const tx of fresh) {
    const txType = tx.type || 'UNKNOWN';
    const sig    = tx.signature?.slice(0, 12) || '?';
    console.log(`  Tx ${sig}... type=${txType}`);

    const buy = parseBuy(tx);
    if (buy) {
      if (buy.solAmt >= MIN_SOL) {
        alerts.push({ ...buy, kind: 'buy' });
        console.log(`    → BUY: ${buy.solAmt.toFixed(4)} SOL → ${buy.basisAmt.toFixed(0)} BASIS`);
      } else {
        console.log(`    → Skip buy: ${buy.solAmt.toFixed(4)} SOL < ${MIN_SOL} min`);
      }
      continue;
    }

    const sell = parseSell(tx);
    if (sell) {
      if (sell.basisAmt >= 10_000) { // min 10k BASIS to post sell alert
        alerts.push({ ...sell, kind: 'sell' });
        console.log(`    → SELL: ${sell.basisAmt.toFixed(0)} BASIS → ${sell.solAmt.toFixed(4)} SOL`);
      } else {
        console.log(`    → Skip sell: ${sell.basisAmt.toFixed(0)} BASIS < min`);
      }
      continue;
    }

    console.log(`    → Not a qualifying swap`);
  }

  // Update state
  await stateRef.set({
    lastSignature: fresh[0].signature,
    updatedAt: ts(),
    athMcap,
    knownBuyers,
  });

  if (!alerts.length) {
    console.log('No qualifying alerts.');
    process.exit(0);
  }

  console.log(`${alerts.length} alert(s) to post.`);

  // ── 8. Post alerts to Firestore ───────────────────────────────────────
  const batch = db.batch();
  const alertsCol   = db.collection('alerts');
  const messagesCol = db.collection('messages');

  for (const alert of alerts.reverse()) { // oldest first
    const walletShort = alert.buyer.slice(0, 6) + '...' + alert.buyer.slice(-4);
    const walletUrl   = `https://solscan.io/account/${alert.buyer}`;
    const txUrl       = `https://solscan.io/tx/${alert.sig}`;

    if (alert.kind === 'buy') {
      // Track buyer
      knownBuyers[alert.buyer] = (knownBuyers[alert.buyer] || 0) + 1;
      const buyCount    = knownBuyers[alert.buyer];
      const returning   = buyCount > 1 ? `🔁 Returning buyer (#${buyCount})` : '🆕 New buyer';

      const tier        = getTier(alert.solAmt);
      const usdValue    = price > 0 ? alert.solAmt * (price / (alert.basisAmt / alert.solAmt || 1)) : 0;
      // Simpler: USD = solAmt * SOL price. Estimate SOL price from mcap/supply ratio isn't right.
      // Use: if we have BASIS price in USD, usd = basisAmt * price
      const usdSpent    = price > 0 ? alert.basisAmt * price : 0;
      const pctSupply   = (alert.basisAmt / BASIS_SUPPLY * 100).toFixed(4);
      const bar         = buildBar(alert.solAmt);
      const solFmt      = alert.solAmt.toLocaleString('en-US', { maximumFractionDigits: 4 });
      const basisFmt    = alert.basisAmt.toLocaleString('en-US', { maximumFractionDigits: 0 });

      const athLine     = newAth ? `\n🏆 NEW ATH MCAP: ${fmtMcap(athMcap)}` : '';
      const vol24hLine  = vol24h > 0 ? `\n📊 24h Volume: ${fmtMcap(vol24h)}` : '';
      const pctLine     = pct24h !== null ? `\n📈 24h Change: ${fmtPct(pct24h)}` : '';

      const text =
        `${tier.emoji} **$BASIS ${tier.label} BUY!** ${tier.emoji}\n` +
        `${bar}\n\n` +
        `💰 ${solFmt} SOL${usdSpent > 0 ? ` (${fmtUsd(usdSpent)})` : ''} → ${basisFmt} $BASIS\n` +
        `📦 ${pctSupply}% of supply\n` +
        `👤 [${walletShort}](${walletUrl}) — ${returning}\n` +
        `🔗 [View Tx](${txUrl})\n` +
        `📉 MCap: ${fmtMcap(mcap)}${athLine}${pctLine}${vol24hLine}\n` +
        `📈 [Chart](${dexLink})`;

      const docData = {
        type: 'user',
        uid: 'bot-databasis',
        name: 'databasis',
        color: '#6ee75a',
        role: 'bot',
        avatarUrl: 'https://chat.databasis.info/bot-avatar.jpg',
        text,
        ts: ts(),
        deleted: false,
      };

      // Post to both main messages + dedicated alerts collection
      batch.set(messagesCol.doc(), docData);
      batch.set(alertsCol.doc(), { ...docData, kind: 'buy', solAmt: alert.solAmt, basisAmt: alert.basisAmt, buyer: alert.buyer, sig: alert.sig });

      console.log(`🟢 Buy alert: ${solFmt} SOL by ${walletShort} [${tier.label}]`);

    } else {
      // SELL alert
      const basisFmt  = alert.basisAmt.toLocaleString('en-US', { maximumFractionDigits: 0 });
      const solFmt    = alert.solAmt.toLocaleString('en-US', { maximumFractionDigits: 4 });
      const usdVal    = price > 0 ? alert.basisAmt * price : 0;
      const pctSupply = (alert.basisAmt / BASIS_SUPPLY * 100).toFixed(4);
      const walletShort2 = alert.buyer.slice(0, 6) + '...' + alert.buyer.slice(-4);
      const walletUrl2   = `https://solscan.io/account/${alert.buyer}`;

      const text =
        `🔴 **$BASIS SELL ALERT**\n\n` +
        `💸 ${basisFmt} $BASIS${usdVal > 0 ? ` (${fmtUsd(usdVal)})` : ''} → ${solFmt} SOL\n` +
        `📦 ${pctSupply}% of supply\n` +
        `👤 [${walletShort2}](${walletUrl2})\n` +
        `🔗 [View Tx](${txUrl})\n` +
        `📉 MCap: ${fmtMcap(mcap)}\n` +
        `📈 [Chart](${dexLink})`;

      const docData = {
        type: 'user',
        uid: 'bot-databasis',
        name: 'databasis',
        color: '#e75a5a',
        role: 'bot',
        avatarUrl: 'https://chat.databasis.info/bot-avatar.jpg',
        text,
        ts: ts(),
        deleted: false,
      };

      batch.set(messagesCol.doc(), docData);
      batch.set(alertsCol.doc(), { ...docData, kind: 'sell', solAmt: alert.solAmt, basisAmt: alert.basisAmt, buyer: alert.buyer, sig: alert.sig });

      console.log(`🔴 Sell alert: ${basisFmt} BASIS by ${walletShort2}`);
    }
  }

  // Persist updated knownBuyers
  await stateRef.update({ knownBuyers, athMcap, updatedAt: ts() });

  await batch.commit();
  console.log('Done.');
  process.exit(0);
}

// ─── Parse BUY from Helius enhanced transaction ──────────────────────────────
function parseBuy(tx) {
  try {
    const buyer = tx.feePayer || '';
    let solAmt = 0, basisAmt = 0;

    if (tx.events?.swap) {
      const swap = tx.events.swap;
      // Use nativeInput OR WSOL tokenInputs — not both (Jupiter wraps native SOL
      // into WSOL before the swap, so both can appear for the same SOL amount)
      if (swap.nativeInput?.amount > 0) {
        solAmt = swap.nativeInput.amount / 1e9;
      } else {
        for (const ti of swap.tokenInputs || []) {
          if (ti.mint === WSOL) solAmt += parseFloat(ti.tokenAmount || 0);
        }
      }
      for (const to of swap.tokenOutputs || []) {
        if (to.mint === TOKEN_CA) {
          basisAmt += to.rawTokenAmount
            ? parseFloat(to.rawTokenAmount.tokenAmount) / Math.pow(10, to.rawTokenAmount.decimals || 6)
            : parseFloat(to.tokenAmount || 0);
        }
      }
    }

    // Fallback: use tokenTransfers only (buyer receives BASIS, buyer sends WSOL)
    if (basisAmt === 0) {
      for (const t of tx.tokenTransfers || []) {
        if (t.mint === TOKEN_CA && t.toUserAccount === buyer) basisAmt += t.tokenAmount || 0;
        if (t.mint === WSOL && t.fromUserAccount === buyer && solAmt === 0) solAmt += t.tokenAmount || 0;
      }
    }

    if (basisAmt <= 0 || solAmt <= 0) return null;
    return { sig: tx.signature, buyer, solAmt, basisAmt };
  } catch { return null; }
}

// ─── Parse SELL from Helius enhanced transaction ─────────────────────────────
function parseSell(tx) {
  try {
    const seller = tx.feePayer || '';
    let solAmt = 0, basisAmt = 0;

    if (tx.events?.swap) {
      const swap = tx.events.swap;
      // Use nativeOutput OR WSOL tokenOutputs — not both (same double-counting
      // risk as on the buy side when Jupiter unwraps WSOL back to native SOL)
      if (swap.nativeOutput?.amount > 0) {
        solAmt = swap.nativeOutput.amount / 1e9;
      } else {
        for (const to of swap.tokenOutputs || []) {
          if (to.mint === WSOL) solAmt += parseFloat(to.tokenAmount || 0);
        }
      }
      for (const ti of swap.tokenInputs || []) {
        if (ti.mint === TOKEN_CA) {
          basisAmt += ti.rawTokenAmount
            ? parseFloat(ti.rawTokenAmount.tokenAmount) / Math.pow(10, ti.rawTokenAmount.decimals || 6)
            : parseFloat(ti.tokenAmount || 0);
        }
      }
    }

    // Fallback: use tokenTransfers only (seller sends BASIS, seller receives WSOL)
    if (basisAmt === 0) {
      for (const t of tx.tokenTransfers || []) {
        if (t.mint === TOKEN_CA && t.fromUserAccount === seller) basisAmt += t.tokenAmount || 0;
        if (t.mint === WSOL && t.toUserAccount === seller && solAmt === 0) solAmt += t.tokenAmount || 0;
      }
    }

    if (basisAmt <= 0 || solAmt <= 0) return null;
    return { sig: tx.signature, buyer: seller, solAmt, basisAmt };
  } catch { return null; }
}

main().catch(e => { console.error(e); process.exit(1); });
