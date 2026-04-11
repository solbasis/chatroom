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
  const db = getDb();
  const email = name.toLowerCase() + '@basis.chat';

  try {
    if (state.mode === 'signup') {
      await doSignup(au, db, email, name, pass);
    } else {
      await doLogin(au, db, email, name, pass);
    }
  } catch (e) {
    state.busy = false;
    const msg = friendlyError(e);
    showStatus(msg, 'err');
    setLoading(false);
  }
}

// ─── Signup flow ────────────────────────────────────────────────────────────
async function doSignup(au, db, email, name, pass) {
  const cred = await au.createUserWithEmailAndPassword(email, pass);
  await new Promise(resolve => {
    const unsub = au.onAuthStateChanged(user => { if (user) { unsub(); resolve(); } });
  });

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

// ─── Login flow ─────────────────────────────────────────────────────────────
async function doLogin(au, db, email, name, pass) {
  const cred = await au.signInWithEmailAndPassword(email, pass);

  // Wait for Firebase Auth to propagate the new session to all SDK services.
  // The Firestore SDK updates its internal auth state asynchronously via its
  // own onAuthStateChanged listener — waiting here ensures that listener has fired.
  await new Promise(resolve => {
    const unsub = au.onAuthStateChanged(user => { if (user) { unsub(); resolve(); } });
  });

  // Force-refresh the ID token. This causes Firebase Auth to deliver the fresh
  // token synchronously to the Firestore SDK's credential provider, guaranteeing
  // it is included in the next request.
  try { await cred.user.getIdToken(true); } catch {}

  let userDoc;
  try {
    userDoc = await db.collection('users').doc(cred.user.uid).get();
  } catch (e) {
    // Retry once if permission-denied — the auth token propagation to Firestore's
    // internal gRPC channel can lag behind the onAuthStateChanged notification.
    if (e.code === 'permission-denied') {
      await new Promise(r => setTimeout(r, 500));
      try {
        userDoc = await db.collection('users').doc(cred.user.uid).get();
      } catch (e2) {
        throw Object.assign(e2, { message: '[step:user-read code:' + e2.code + '] ' + e2.message });
      }
    } else {
      throw Object.assign(e, { message: '[step:user-read code:' + e.code + '] ' + e.message });
    }
  }

  if (!userDoc.exists) {
    state.busy = false;
    showStatus('Profile not found', 'err');
    setLoading(false);
    return;
  }

  // Check kicked
  if (userDoc.data().kicked) {
    await au.signOut();
    state.busy = false;
    showStatus('You have been kicked from this room', 'err');
    setLoading(false);
    return;
  }

  let banDoc;
  try {
    banDoc = await db.collection('bans').doc(userDoc.data().nameLower).get();
  } catch (e) { throw Object.assign(e, { message: '[step:ban-read] ' + e.message }); }

  if (banDoc.exists) {
    await au.signOut();
    state.busy = false;
    showStatus('You are banned', 'err');
    setLoading(false);
    return;
  }

  state.me = { uid: cred.user.uid, ...userDoc.data() };
  try {
    await db.collection('users').doc(cred.user.uid).update({
      online: true,
      lastSeen: serverTimestamp()
    });
  } catch (e) { throw Object.assign(e, { message: '[step:user-update] ' + e.message }); }

  try {
    await db.collection('messages').add({
      type: 'system',
      text: userDoc.data().name + ' has entered the room',
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
    default:
      return 'Auth failed: ' + (e.message || 'Unknown error');
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
  const db = getDb();

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
