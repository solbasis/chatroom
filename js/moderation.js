// ─── Moderation Actions ─────────────────────────────────────────────────────
import { ROLES } from './config.js';
import { state } from './state.js';
import { getDb, serverTimestamp, esc, myRole, hasRole } from './utils.js';
import { addLocalMessage } from './commands.js';

// ─── Find user by name ──────────────────────────────────────────────────────
export async function findUser(username) {
  // Check online users first
  const found = state.allUsers.find(u => u.nameLower === username.toLowerCase());
  if (found) return found;

  // Query Firestore
  const db = getDb();
  const snap = await db.collection('users')
    .where('nameLower', '==', username.toLowerCase())
    .limit(1)
    .get();

  if (!snap.empty) {
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  }
  return null;
}

// ─── Permission check ───────────────────────────────────────────────────────
function canTarget(target) {
  if (!target) return 'User not found.';
  if ((target.id || target.uid) === state.me?.uid) return "Can't target yourself.";
  if ((ROLES[target.role] || 1) >= (ROLES[myRole()] || 1)) return "Insufficient permissions.";
  return null;
}

// ─── Set a user flag (muted, etc.) ──────────────────────────────────────────
export async function setUserFlag(username, field, value, verb) {
  const target = await findUser(username);
  const err = canTarget(target);
  if (err) { addLocalMessage(err, 'err'); return; }

  const db = getDb();
  try {
    await db.collection('users').doc(target.id).update({ [field]: value });
    await db.collection('messages').add({
      type: 'system',
      text: `${target.name} was ${verb} by ${state.me.name}`,
      ts: serverTimestamp()
    });
    addLocalMessage(`${target.name} ${verb}.`, 'ok');
  } catch (e) {
    addLocalMessage(`Failed: ${e.message}`, 'err');
  }
}

// ─── Kick user ──────────────────────────────────────────────────────────────
export async function kickUser(username) {
  const target = await findUser(username);
  const err = canTarget(target);
  if (err) { addLocalMessage(err, 'err'); return; }

  const db = getDb();
  try {
    await db.collection('users').doc(target.id).update({ online: false, kicked: true });
    await db.collection('messages').add({
      type: 'system',
      text: `${target.name} kicked by ${state.me.name}`,
      ts: serverTimestamp()
    });
    addLocalMessage(`${target.name} kicked.`, 'ok');
  } catch (e) {
    addLocalMessage(`Failed: ${e.message}`, 'err');
  }
}

// ─── Ban user ───────────────────────────────────────────────────────────────
export async function banUser(username) {
  const target = await findUser(username);
  const err = canTarget(target);
  if (err) { addLocalMessage(err, 'err'); return; }

  const db = getDb();
  try {
    await db.collection('bans').doc(target.nameLower).set({
      name: target.name,
      bannedBy: state.me.name,
      bannedAt: serverTimestamp()
    });
    await db.collection('users').doc(target.id).update({ online: false, kicked: true });
    await db.collection('messages').add({
      type: 'system',
      text: `${target.name} banned by ${state.me.name}`,
      ts: serverTimestamp()
    });
    addLocalMessage(`${target.name} banned.`, 'ok');
  } catch (e) {
    addLocalMessage(`Failed: ${e.message}`, 'err');
  }
}

// ─── Unban user ─────────────────────────────────────────────────────────────
export async function unbanUser(username) {
  if (!username) { addLocalMessage('/unban <user>', 'err'); return; }

  const db = getDb();
  try {
    await db.collection('bans').doc(username.toLowerCase()).delete();
    await db.collection('messages').add({
      type: 'system',
      text: `${username} unbanned by ${state.me.name}`,
      ts: serverTimestamp()
    });
    addLocalMessage(`${esc(username)} unbanned.`, 'ok');
  } catch (e) {
    addLocalMessage(`Failed: ${e.message}`, 'err');
  }
}

// ─── Show ban list ──────────────────────────────────────────────────────────
export async function showBanList() {
  const db = getDb();
  try {
    const snap = await db.collection('bans').get();
    if (snap.empty) { addLocalMessage('No bans.'); return; }

    const lines = snap.docs.map(d => {
      const data = d.data();
      return `  ${data.name} — by ${data.bannedBy}`;
    });
    addLocalMessage(`<strong>Bans (${snap.size}):</strong>\n${lines.join('\n')}`);
  } catch (e) {
    addLocalMessage(`Failed: ${e.message}`, 'err');
  }
}

// ─── Set role ───────────────────────────────────────────────────────────────
export async function setRole(username, role) {
  const target = await findUser(username);
  if (!target || (target.id || target.uid) === state.me?.uid) {
    addLocalMessage("Can't.", 'err');
    return;
  }

  const db = getDb();
  try {
    await db.collection('users').doc(target.id).update({ role });
    await db.collection('messages').add({
      type: 'system',
      text: `${target.name} → ${role.toUpperCase()} by ${state.me.name}`,
      ts: serverTimestamp()
    });
    addLocalMessage(`${target.name} is now ${role.toUpperCase()}.`, 'ok');
  } catch (e) {
    addLocalMessage(`Failed: ${e.message}`, 'err');
  }
}

// ─── Delete message ─────────────────────────────────────────────────────────
export async function deleteMessage(msgId) {
  if (!hasRole('admin')) return;

  const db = getDb();
  try {
    await db.collection('messages').doc(msgId).update({
      deleted: true,
      deletedBy: state.me.name
    });
    addLocalMessage('Deleted.', 'ok');
  } catch (e) {
    addLocalMessage(`Failed: ${e.message}`, 'err');
  }
}

// ─── Check if current user is muted ─────────────────────────────────────────
export async function checkMuted() {
  const db = getDb();
  try {
    const doc = await db.collection('users').doc(state.me.uid).get({ source: 'server' });
    if (doc.exists) {
      state.me.muted = doc.data().muted || false;
      if (doc.data().kicked) {
        const { forceDisconnect } = await import('./ui.js');
        forceDisconnect('Kicked.');
        return true;
      }
    }
  } catch {
    try {
      const doc = await db.collection('users').doc(state.me.uid).get();
      if (doc.exists) state.me.muted = doc.data().muted || false;
    } catch {}
  }
  return state.me?.muted || false;
}
