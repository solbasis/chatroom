// ─── Authentication ─────────────────────────────────────────────────────────
import { NODE_COLORS } from './config.js';
import { state, $ } from './state.js';
import { serverTimestamp, getDb, getAuth } from './utils.js';
import { enterChat } from './chat.js';

// ─── Switch login / signup mode ─────────────────────────────────────────────
export function switchAuthMode(mode) {
  state.mode = mode;
  $('tLog').classList.toggle('on', mode === 'login');
  $('tSign').classList.toggle('on', mode === 'signup');
  $('signF').style.display = mode === 'signup' ? 'block' : 'none';
  $('aBtn').querySelector('.bt').textContent = mode === 'login' ? '> ENTER ROOM' : '> CREATE ACCOUNT';
  $('resetLink').style.display = mode === 'login' ? 'block' : 'none';
  hideStatus();
}

// ─── Build color picker ─────────────────────────────────────────────────────
export function buildColorPicker() {
  const container = $('cPick');
  container.innerHTML = '';

  NODE_COLORS.forEach(color => {
    const btn = document.createElement('button');
    btn.className = 'colbtn' + (color === state.selCol ? ' on' : '');
    btn.style.background = color;
    btn.type = 'button';

    if (color === state.selCol) {
      btn.style.boxShadow = `0 0 0 2px var(--bg), 0 0 0 4px ${color}, 0 0 14px ${color}`;
    }

    btn.onclick = () => {
      state.selCol = color;
      container.querySelectorAll('.colbtn').forEach(b => {
        b.classList.remove('on');
        b.style.boxShadow = 'none';
      });
      btn.classList.add('on');
      btn.style.boxShadow = `0 0 0 2px var(--bg), 0 0 0 4px ${color}, 0 0 14px ${color}`;
    };

    container.appendChild(btn);
  });
}

// ─── Status messages ────────────────────────────────────────────────────────
function showStatus(msg, type) {
  const el = $('aSts');
  el.textContent = msg;
  el.className = 'sts show ' + type;
}

function hideStatus() {
  $('aSts').className = 'sts';
}

function setLoading(on) {
  const btn = $('aBtn');
  btn.classList.toggle('ld', on);
  btn.disabled = on;
}

// ─── Password reset ─────────────────────────────────────────────────────────
export async function doPasswordReset() {
  const name = $('aName').value.trim();
  if (!name) { showStatus('Enter your username first', 'err'); return; }

  const email = name.toLowerCase() + '@basis.chat';
  try {
    await getAuth().sendPasswordResetEmail(email);
  } catch { /* don't reveal account existence */ }

  // Always show same message (prevents enumeration)
  showStatus('Reset email sent (if account exists)', 'ok');
}

// ─── Main auth handler ──────────────────────────────────────────────────────
export async function doAuth() {
  const name = $('aName').value.trim();
  const pass = $('aPass').value.trim();

  // Validation
  if (!name || !pass) { showStatus('All fields required', 'err'); return; }
  if (/[\s'"@]/.test(name)) { showStatus('No spaces, quotes or @ allowed', 'err'); return; }
  if (name.length > 20) { showStatus('Username max 20 characters', 'err'); return; }
  if (pass.length < 6)  { showStatus('Password min 6 characters', 'err'); return; }

  hideStatus();
  setLoading(true);
  state.busy = true;

  const au = getAuth();
  const email = name.toLowerCase() + '@basis.chat';

  try {
    if (state.mode === 'signup') {
      await doSignup(au, email, name, pass);
    } else {
      await doLogin(au, email, name, pass);
    }
  } catch (e) {
    state.busy = false;
    const msg = friendlyError(e);
    showStatus(msg, 'err');
    setLoading(false);
  }
}

// ─── Signup flow ────────────────────────────────────────────────────────────
async function doSignup(au, email, name, pass) {
  const cred = await au.createUserWithEmailAndPassword(email, pass);
  await new Promise(resolve => {
    const unsub = au.onAuthStateChanged(user => { if (user) { unsub(); resolve(); } });
  });
  // Initialise Firestore NOW — while the user is already authenticated.
  // This ensures the SDK's credential provider starts in the signed-in state
  // and never needs the async token-delivery path that MetaMask/SES can break.
  const db = getDb();

  try {
    // Check ban
    const banDoc = await db.collection('bans').doc(name.toLowerCase()).get();
    if (banDoc.exists) {
      await cred.user.delete();
      state.busy = false;
      showStatus('Username banned', 'err');
      setLoading(false);
      return;
    }

    // Check uniqueness
    const existing = await db.collection('users').where('nameLower', '==', name.toLowerCase()).limit(1).get();
    if (!existing.empty) {
      await cred.user.delete();
      state.busy = false;
      showStatus('Username taken', 'err');
      setLoading(false);
      return;
    }

    // Role is ALWAYS 'user' on signup — dev/admin granted via Firestore only
    const profile = {
      name,
      nameLower: name.toLowerCase(),
      color: state.selCol,
      role: 'user',
      muted: false,
      kicked: false,
      bio: '',
      avatarUrl: '',
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      online: true
    };

    await db.collection('users').doc(cred.user.uid).set(profile);
    await db.collection('messages').add({
      type: 'system',
      text: name + ' has entered the room',
      ts: serverTimestamp()
    });

    state.me = { uid: cred.user.uid, ...profile };
    state.busy = false;
    enterChat();

  } catch (e) {
    try { await cred.user.delete(); } catch {}
    state.busy = false;
    showStatus(e.message || 'Signup failed', 'err');
    setLoading(false);
  }
}

// ─── Firestore REST helpers (bypass SDK auth for SES-restricted environments) ─
// Project basis-acfec has Firestore App Check enforcement enabled, so EVERY
// REST call must include both:
//   Authorization:        Bearer <Firebase Auth ID token>
//   X-Firebase-AppCheck:  <App Check token>
// Without the App Check header, Firestore returns 403 → the SDK error code
// "permission-denied" → the user sees "Missing or insufficient permissions"
// even though their auth and the rules are perfectly fine.
const FS_BASE = 'https://firestore.googleapis.com/v1/projects/basis-acfec/databases/(default)/documents';

// Cache the App Check token across login calls (it's good for ~1h, the SDK
// auto-refreshes). Falls back to null if App Check failed to initialise —
// the request will 403 and the caller will see a clear permission-denied
// instead of a silent indefinite hang.
async function getAppCheckTokenSafe() {
  try {
    const r = await firebase.appCheck().getToken(/* forceRefresh */ false);
    return r?.token ?? null;
  } catch (e) {
    console.warn('[appcheck] getToken failed:', e?.message ?? e);
    return null;
  }
}

function parseRestDoc(json) {
  if (!json || !json.fields) return null;
  const out = {};
  for (const [k, v] of Object.entries(json.fields)) {
    if ('stringValue'    in v) out[k] = v.stringValue;
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('doubleValue'  in v) out[k] = v.doubleValue;
    else if ('nullValue'    in v) out[k] = null;
    else if ('timestampValue' in v) {
      const d = new Date(v.timestampValue);
      out[k] = { toDate: () => d, seconds: Math.floor(d / 1000) };
    }
  }
  return out;
}

async function readDocRest(collection, docId, token) {
  if (!docId) return null;
  try {
    const url = `${FS_BASE}/${collection}/${encodeURIComponent(docId)}`;
    const headers = { Authorization: `Bearer ${token}` };
    const appCheckToken = await getAppCheckTokenSafe();
    if (appCheckToken) headers['X-Firebase-AppCheck'] = appCheckToken;
    const res = await fetch(url, { headers });
    console.log(`[rest] GET ${collection}/${docId} → ${res.status}${appCheckToken ? ' (appcheck:ok)' : ' (appcheck:missing)'}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error(`[rest] ${res.status} body:`, JSON.stringify(body));
      const err = new Error(body.error?.message || `REST ${res.status}`);
      err.code = res.status === 403 ? 'permission-denied' : 'unavailable';
      throw err;
    }
    return parseRestDoc(await res.json());
  } catch (e) {
    if (e.code) throw e;
    throw Object.assign(e, { code: 'unavailable' });
  }
}

async function readUserRest(uid, token) {
  return readDocRest('users', uid, token);
}

// ─── Login flow ─────────────────────────────────────────────────────────────
async function doLogin(au, email, name, pass) {
  // Pre-flight: mint an App Check token BEFORE any Firestore call. If
  // reCAPTCHA can't issue one (allowed-domains misconfiguration, blocked
  // by an extension, network failure, etc.) we fail fast with a clear
  // message instead of bouncing off Firestore with a generic permission
  // error that doesn't tell the user where the actual failure is.
  let appCheckToken = null;
  try {
    const r = await firebase.appCheck().getToken(false);
    appCheckToken = r?.token ?? null;
    console.log('[appcheck] token[:20]:', appCheckToken ? appCheckToken.substring(0, 20) : '(null)');
  } catch (acErr) {
    console.error('[appcheck] mint failed:', acErr);
    throw Object.assign(new Error('App Check token mint failed: ' + (acErr?.message ?? acErr)),
                        { code: 'app-check-mint-failed' });
  }
  if (!appCheckToken) {
    throw Object.assign(new Error('App Check returned no token (reCAPTCHA likely blocked or domain not allowed)'),
                        { code: 'app-check-no-token' });
  }

  let cred;
  try {
    cred = await au.signInWithEmailAndPassword(email, pass);
  } catch (e) { throw Object.assign(e, { message: '[step:auth-signin] ' + e.message }); }

  // Wait for Firebase Auth to propagate the new session.
  await new Promise(resolve => {
    const unsub = au.onAuthStateChanged(user => { if (user) { unsub(); resolve(); } });
  });

  // Get a fresh ID token and use the Firestore REST API for the login reads.
  // The Firestore SDK's internal auth-token delivery is broken by MetaMask/SES
  // regardless of initialisation order. The REST API accepts an explicit Bearer
  // token in the Authorization header and is completely unaffected by SES.
  const idToken = await cred.user.getIdToken(true);

  // ── DIAGNOSTIC: log token validity ───────────────────────────────────────
  console.log('[auth] uid:', cred.user.uid);
  console.log('[auth] token type:', typeof idToken);
  console.log('[auth] token ok:', typeof idToken === 'string' && idToken.startsWith('eyJ'));
  if (idToken) console.log('[auth] token[:20]:', idToken.substring(0, 20));

  // Validate token before making REST calls
  if (typeof idToken !== 'string' || !idToken.startsWith('eyJ')) {
    throw new Error('Token invalid after getIdToken(true) — cannot authenticate with Firestore');
  }

  // Also initialise the Firestore SDK now (post-auth) so that subsequent
  // real-time listeners and writes have the best chance of picking up the token.
  const db = getDb();

  let userData, banData;
  try { userData = await readUserRest(cred.user.uid, idToken); }
  catch (e) { throw Object.assign(e, { message: '[step:user-read] ' + e.message }); }
  try { banData  = await readDocRest('bans', userData && userData.nameLower, idToken); }
  catch (e) { throw Object.assign(e, { message: '[step:bans-read] ' + e.message }); }

  if (!userData) {
    state.busy = false;
    showStatus('Profile not found', 'err');
    setLoading(false);
    return;
  }

  // Check kicked
  if (userData.kicked) {
    await au.signOut();
    state.busy = false;
    showStatus('You have been kicked from this room', 'err');
    setLoading(false);
    return;
  }

  if (banData) {
    await au.signOut();
    state.busy = false;
    showStatus('You are banned', 'err');
    setLoading(false);
    return;
  }

  state.me = { uid: cred.user.uid, ...userData };
  try {
    await db.collection('users').doc(cred.user.uid).update({
      online: true,
      lastSeen: serverTimestamp()
    });
  } catch (e) { throw Object.assign(e, { message: '[step:user-update] ' + e.message }); }

  try {
    await db.collection('messages').add({
      type: 'system',
      text: userData.name + ' has entered the room',
      ts: serverTimestamp()
    });
  } catch (e) { throw Object.assign(e, { message: '[step:msg-add] ' + e.message }); }

  state.busy = false;
  enterChat();
}

// ─── Friendly error messages ───────────────────────────────────────────────
function friendlyError(e) {
  switch (e.code) {
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'User not found or wrong password';
    case 'auth/email-already-in-use':
      return 'Username taken';
    case 'auth/weak-password':
      return 'Password too weak';
    case 'auth/too-many-requests':
      return 'Too many attempts — try later';
    case 'auth/network-request-failed':
      return 'Network error — check connection';
    case 'app-check-mint-failed':
    case 'app-check-no-token':
      return 'App Check token unavailable — reCAPTCHA may be blocked or domain not allowed';
    default: {
      // Surface step + code + message so the failing path is obvious
      // from the UI alone (no DevTools required on mobile).
      const code = e?.code ? `[${e.code}] ` : '';
      const msg  = e?.message || 'Unknown error';
      return 'Auth failed: ' + code + msg;
    }
  }
}

// ─── Logout ─────────────────────────────────────────────────────────────────
export async function logout() {
  try {
    const db = getDb();
    if (state.me && !state.disconnected) {
      await db.collection('users').doc(state.me.uid).update({
        online: false,
        lastSeen: serverTimestamp()
      });
      try { await db.collection('typing').doc(state.me.uid).delete(); } catch {}
    }
  } catch {}

  // Clean up listeners
  Object.values(state.unsubs).forEach(fn => { if (fn) fn(); });
  Object.keys(state.unsubs).forEach(k => { state.unsubs[k] = null; });
  if (state.heartbeatIv) { clearInterval(state.heartbeatIv); state.heartbeatIv = null; }

  try { await getAuth().signOut(); } catch {}
  state.me = null;
  state.disconnected = false;
  state.dmView = null;

  showScreen('auth');
}

// ─── Screen switcher ────────────────────────────────────────────────────────
export function showScreen(id) {
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('on'));
  $('S_' + id).classList.add('on');
}

// ─── Init auth listeners ───────────────────────────────────────────────────
export function initAuth() {
  const au = getAuth();

  let progress = 0;
  const bar = $('ldBar');
  const iv = setInterval(() => {
    progress += Math.random() * 25;
    if (progress > 92) progress = 92;
    bar.style.width = progress + '%';
  }, 180);

  // Fallback: if Firebase Auth never resolves its initial state (e.g. MetaMask/SES
  // blocking IndexedDB session restore), show the auth screen after 5 seconds.
  const authFallback = setTimeout(() => {
    clearInterval(iv);
    bar.style.width = '100%';
    showScreen('auth');
  }, 5000);

  au.onAuthStateChanged(async user => {
    clearTimeout(authFallback); // cancel the fallback — Auth resolved normally
    if (state.busy) return;
    clearInterval(iv);
    bar.style.width = '100%';

    if (user) {
      try {
        // Initialise Firestore while the user is already authenticated (same
        // rationale as in doLogin — avoids async token-delivery path).
        const db = getDb();
        // Race Firestore read against a 5 s timeout so a stalled WebChannel
        // doesn't freeze the loading screen either.
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000));
        const doc = await Promise.race([
          db.collection('users').doc(user.uid).get(),
          timeout
        ]);
        if (doc.exists) {
          state.me = { uid: user.uid, ...doc.data() };
          setTimeout(() => enterChat(), 250);
          return;
        }
      } catch {}
    }

    try { await au.signOut(); } catch {}
    setTimeout(() => showScreen('auth'), 250);
  });
}
