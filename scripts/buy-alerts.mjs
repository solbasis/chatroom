// ─── Buy Alert Poller (GitHub Actions) ──────────────────────────────────────
// Runs every 5 minutes via GitHub Actions cron. Polls Helius for new $BASIS
// buys and writes alert messages to Firestore. Tracks last-seen transaction
// in a Firestore document to avoid duplicates across runs.

const TOKEN_CA    = 'A5BJBQUTR5sTzkM89hRDuApWyvgjdXpR7B7rW1r9pump';
const DEX_LINK    = 'https://dexscreener.com/solana/cf8bkjprah98nxyuttx9o2r8edxfbvjw7t1f55xv5fpi';
const WSOL        = 'So11111111111111111111111111111111111111112';
const JUP_PRICE   = 'https://lite-api.jup.ag/price/v2';
const DEX_TOKENS  = `https://api.dexscreener.com/tokens/v1/solana/${TOKEN_CA}`;
const BASIS_SUPPLY = 1_000_000_000;
const MIN_SOL     = 0.5;

async function main() {
  // ── 1. Init Firebase Admin ────────────────────────────────────────────
  const admin = (await import('firebase-admin')).default;
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const db = admin.firestore();
  const ts = () => admin.firestore.FieldValue.serverTimestamp();

  const HELIUS_KEY = process.env.HELIUS_API_KEY;
  if (!HELIUS_KEY) { console.error('No HELIUS_API_KEY'); process.exit(1); }

  // ── 2. Get last seen signature from Firestore ─────────────────────────
  const stateRef = db.collection('bot-state').doc('buy-alerts');
  const stateDoc = await stateRef.get();
  let lastSig = stateDoc.exists ? stateDoc.data().lastSignature : null;

  console.log('Last seen sig:', lastSig ? lastSig.slice(0, 12) + '...' : 'none (first run)');

  // ── 3. Fetch recent swaps from Helius ─────────────────────────────────
  const url = `https://api.helius.xyz/v0/addresses/${TOKEN_CA}/transactions?api-key=${HELIUS_KEY}&limit=20&type=SWAP`;
  const res = await fetch(url);
  if (!res.ok) { console.error('Helius error:', res.status); process.exit(1); }

  const txns = await res.json();
  if (!txns?.length) { console.log('No transactions found.'); process.exit(0); }

  // First run — just save the latest sig
  if (!lastSig) {
    await stateRef.set({ lastSignature: txns[0].signature, updatedAt: ts() });
    console.log('First run — anchored to:', txns[0].signature.slice(0, 12) + '...');
    process.exit(0);
  }

  // ── 4. Find new transactions since last seen ──────────────────────────
  const fresh = [];
  for (const tx of txns) {
    if (tx.signature === lastSig) break;
    fresh.push(tx);
  }

  if (!fresh.length) {
    console.log('No new transactions.');
    process.exit(0);
  }

  console.log(`Found ${fresh.length} new transactions.`);

  // Update last seen
  await stateRef.set({ lastSignature: fresh[0].signature, updatedAt: ts() });

  // ── 5. Parse buys ────────────────────────────────────────────────────
  const buys = [];
  for (const tx of fresh) {
    const buy = parseBuy(tx);
    if (buy && buy.solAmt >= MIN_SOL) buys.push(buy);
  }

  if (!buys.length) {
    console.log('No qualifying buys (min', MIN_SOL, 'SOL).');
    process.exit(0);
  }

  console.log(`${buys.length} buy alert(s) to post.`);

  // ── 6. Fetch current market cap for alerts ────────────────────────────
  let mcap = 0;
  // Try DexScreener first for price
  try {
    const dexRes = await fetch(DEX_TOKENS);
    if (dexRes.ok) {
      const dexData = await dexRes.json();
      const pairs = Array.isArray(dexData) ? dexData : (dexData.pairs ?? []);
      for (const pair of pairs) {
        const price = parseFloat(pair.priceUsd);
        if (pair.baseToken?.address === TOKEN_CA && price > 0) {
          mcap = price * BASIS_SUPPLY;
          break;
        }
      }
    }
  } catch (e) { console.warn('DexScreener mcap failed:', e.message); }

  // Fallback to Jupiter
  if (mcap === 0) {
    try {
      const jupRes = await fetch(`${JUP_PRICE}?ids=${TOKEN_CA}`);
      const jupData = await jupRes.json();
      const price = parseFloat(jupData?.data?.[TOKEN_CA]?.price || 0);
      if (price > 0) mcap = price * BASIS_SUPPLY;
    } catch (e) { console.warn('Jupiter mcap failed:', e.message); }
  }

  const mcapStr = mcap > 0
    ? '$' + Number(mcap).toLocaleString('en-US', { maximumFractionDigits: 0 })
    : '—';

  // ── 7. Post buy alerts to Firestore ───────────────────────────────────
  for (const buy of buys.reverse()) {  // oldest first
    const solFmt   = Number(buy.solAmt).toLocaleString('en-US', { maximumFractionDigits: 4 });
    const basisFmt = Number(buy.basisAmt).toLocaleString('en-US', { maximumFractionDigits: 0 });
    const addr     = buy.buyer.slice(0, 6) + '...' + buy.buyer.slice(-4);
    const txUrl    = `https://solscan.io/tx/${buy.sig}`;

    const text = `**$BASIS BUY DETECTED**\n\n` +
      `Amount: ${solFmt} SOL → ${basisFmt} $BASIS\n` +
      `Buyer: ${addr}\n` +
      `Txn: ${txUrl}\n` +
      `Market Cap: ${mcapStr}`;

    await db.collection('messages').add({
      type: 'user',
      uid: 'bot-databasis',
      name: 'databasis',
      color: '#6ee75a',
      role: 'bot',
      avatarUrl: '',
      text,
      ts: ts(),
      deleted: false,
    });

    console.log(`🟢 Posted alert: ${solFmt} SOL by ${addr}`);
  }

  console.log('Done.');
  process.exit(0);
}

// ─── Parse buy from Helius enhanced transaction ─────────────────────────────
function parseBuy(tx) {
  try {
    const buyer = tx.feePayer || '';
    let solAmt = 0, basisAmt = 0;

    // Swap events (Helius enhanced format)
    if (tx.events?.swap) {
      const swap = tx.events.swap;
      if (swap.nativeInput) solAmt = (swap.nativeInput.amount || 0) / 1e9;
      for (const ti of swap.tokenInputs || []) {
        if (ti.mint === WSOL) solAmt += parseFloat(ti.tokenAmount || 0);
      }
      for (const to of swap.tokenOutputs || []) {
        if (to.mint === TOKEN_CA) {
          basisAmt += to.rawTokenAmount
            ? parseFloat(to.rawTokenAmount.tokenAmount) / Math.pow(10, to.rawTokenAmount.decimals || 6)
            : parseFloat(to.tokenAmount || 0);
        }
      }
    }

    // Fallback: token transfers
    if (basisAmt === 0) {
      for (const t of tx.tokenTransfers || []) {
        if (t.mint === TOKEN_CA && t.toUserAccount === buyer) basisAmt += t.tokenAmount || 0;
      }
      for (const t of tx.nativeTransfers || []) {
        if (t.fromUserAccount === buyer) solAmt += (t.amount || 0) / 1e9;
      }
    }

    if (basisAmt <= 0 || solAmt <= 0) return null;
    return { sig: tx.signature, buyer, solAmt, basisAmt };
  } catch { return null; }
}

main().catch(e => { console.error(e); process.exit(1); });
