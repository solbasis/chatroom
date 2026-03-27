// ─── Slash Commands ─────────────────────────────────────────────────────────
import { state, $ } from './state.js';
import { esc, getDb, serverTimestamp, buildMsgObj, hasRole, isValidUrl, isValidHex } from './utils.js';
import { renderChatMessages } from './render.js';
import { showConfirm } from './ui.js';
import {
  setUserFlag, kickUser, banUser, unbanUser,
  showBanList, setRole, checkMuted
} from './moderation.js';
import { openDM } from './dm.js';
import { openProfile } from './profile.js';

// ─── Add a local-only message (command output) ─────────────────────────────
export function addLocalMessage(text, type = 'info') {
  state.cmdResults.push({ type, text, ts: Date.now() });
  if (!state.dmView) renderChatMessages(state.cachedMsgs);
}

// ─── Command router ─────────────────────────────────────────────────────────
export async function handleCommand(raw) {
  const parts = raw.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg1 = parts[1] || '';
  const rest = parts.slice(1).join(' ');
  const db = getDb();

  switch (cmd) {

    // ─── USER COMMANDS ──────────────────────────────────────────────────
    case '/help':
      addLocalMessage(
        `<strong>— $BASIS —</strong> /price · /sol · /mcap · /ca · /links · /chart · /twitter · /tg · /website · /volume · /ath · /holders\n` +
        `<strong>— USER —</strong> /help · /me · /clear · /users · /profile · /bio · /avatar · /color · /roll · /flip · /shrug · /tableflip · <strong>/dm &lt;user&gt;</strong>\n` +
        `<strong>— MOD —</strong> /mute · /unmute\n` +
        `<strong>— ADMIN —</strong> /kick · /ban · /unban · /banlist · /mod · /unmod · DEL button\n` +
        `<strong>— DEV —</strong> /admin · /unadmin`
      );
      break;

    case '/dm':
      if (!arg1) { addLocalMessage('/dm <username>', 'err'); break; }
      await openDM(arg1);
      break;

    case '/me':
      if (!rest) { addLocalMessage('/me <action>', 'err'); break; }
      if (await checkMuted()) { addLocalMessage('Muted.', 'err'); break; }
      await db.collection('messages').add(buildMsgObj('action', rest));
      break;

    case '/clear':
      state.cmdResults = [];
      $('msgs').innerHTML =
        '<div class="msgs-empty">' +
          '<div class="msgs-empty-ic">◈</div>' +
          '<div class="msgs-empty-t">Cleared</div>' +
          '<div class="msgs-empty-s">New messages will appear below</div>' +
        '</div>';
      state.lastMsgCount = state.cachedMsgs.length;
      break;

    case '/users':
    case '/who':
      addLocalMessage(
        `<strong>Online (${state.allUsers.length}):</strong>\n` +
        state.allUsers.map(u =>
          `  ${u.name} [${u.role || 'user'}]${u.muted ? ' (muted)' : ''}`
        ).join('\n')
      );
      break;

    case '/profile':
      openProfile(state.me?.name);
      break;

    case '/bio':
      if (!rest) { addLocalMessage('/bio <text>', 'err'); break; }
      try {
        const bio = rest.substring(0, 200);
        await db.collection('users').doc(state.me.uid).update({ bio });
        state.me.bio = bio;
        addLocalMessage('Bio updated.', 'ok');
      } catch (e) { addLocalMessage('Failed: ' + e.message, 'err'); }
      break;

    case '/avatar':
      if (!arg1) { addLocalMessage('/avatar <url>', 'err'); break; }
      if (!isValidUrl(arg1)) { addLocalMessage('Avatar must be a valid http/https URL.', 'err'); break; }
      try {
        await db.collection('users').doc(state.me.uid).update({ avatarUrl: arg1 });
        state.me.avatarUrl = arg1;
        addLocalMessage('Avatar updated.', 'ok');
      } catch (e) { addLocalMessage('Failed: ' + e.message, 'err'); }
      break;

    case '/color':
      if (!arg1 || !isValidHex(arg1)) { addLocalMessage('/color #rrggbb', 'err'); break; }
      try {
        await db.collection('users').doc(state.me.uid).update({ color: arg1 });
        state.me.color = arg1;
        addLocalMessage('Color updated.', 'ok');
      } catch (e) { addLocalMessage('Failed: ' + e.message, 'err'); }
      break;

    case '/roll': {
      const match = arg1.match(/^(\d+)d(\d+)$/i);
      if (!match) { addLocalMessage('/roll NdS (e.g. 2d6)', 'err'); break; }
      const [, n, s] = [match[0], +match[1], +match[2]];
      if (s < 1 || s > 100 || n < 1 || n > 20) { addLocalMessage('1–20 dice, 1–100 sides', 'err'); break; }
      const rolls = Array.from({ length: n }, () => Math.floor(Math.random() * s) + 1);
      await db.collection('messages').add(
        buildMsgObj('action', `rolled ${arg1}: [${rolls.join(',')}] = ${rolls.reduce((a, b) => a + b, 0)}`)
      );
      break;
    }

    case '/flip':
      await db.collection('messages').add(
        buildMsgObj('action', 'flipped: ' + (Math.random() < 0.5 ? 'heads' : 'tails'))
      );
      break;

    case '/shrug':
      if (await checkMuted()) break;
      await db.collection('messages').add(buildMsgObj('user', '¯\\_(ツ)_/¯', { deleted: false }));
      break;

    case '/tableflip':
      if (await checkMuted()) break;
      await db.collection('messages').add(buildMsgObj('user', '(╯°□°)╯︵ ┻━┻', { deleted: false }));
      break;

    // ─── MOD COMMANDS ───────────────────────────────────────────────────
    case '/mute':
      if (!hasRole('mod')) { addLocalMessage('Requires mod+', 'err'); break; }
      if (!arg1) { addLocalMessage('/mute <user>', 'err'); break; }
      if (await showConfirm(arg1, 'mute')) await setUserFlag(arg1, 'muted', true, 'muted');
      break;

    case '/unmute':
      if (!hasRole('mod')) { addLocalMessage('Requires mod+', 'err'); break; }
      if (!arg1) { addLocalMessage('/unmute <user>', 'err'); break; }
      if (await showConfirm(arg1, 'unmute')) await setUserFlag(arg1, 'muted', false, 'unmuted');
      break;

    // ─── ADMIN COMMANDS ─────────────────────────────────────────────────
    case '/kick':
      if (!hasRole('admin')) { addLocalMessage('Requires admin+', 'err'); break; }
      if (!arg1) { addLocalMessage('/kick <user>', 'err'); break; }
      if (await showConfirm(arg1, 'kick')) await kickUser(arg1);
      break;

    case '/ban':
      if (!hasRole('admin')) { addLocalMessage('Requires admin+', 'err'); break; }
      if (!arg1) { addLocalMessage('/ban <user>', 'err'); break; }
      if (await showConfirm(arg1, 'ban')) await banUser(arg1);
      break;

    case '/unban':
      if (!hasRole('admin')) { addLocalMessage('Requires admin+', 'err'); break; }
      await unbanUser(arg1);
      break;

    case '/banlist':
      if (!hasRole('admin')) { addLocalMessage('Requires admin+', 'err'); break; }
      await showBanList();
      break;

    case '/mod':
      if (!hasRole('admin')) { addLocalMessage('Requires admin+', 'err'); break; }
      if (!arg1) { addLocalMessage('/mod <user>', 'err'); break; }
      if (await showConfirm(arg1, 'mod')) await setRole(arg1, 'mod');
      break;

    case '/unmod':
      if (!hasRole('admin')) { addLocalMessage('Requires admin+', 'err'); break; }
      if (!arg1) { addLocalMessage('/unmod <user>', 'err'); break; }
      if (await showConfirm(arg1, 'unmod')) await setRole(arg1, 'user');
      break;

    // ─── DEV COMMANDS ───────────────────────────────────────────────────
    case '/admin':
      if (!hasRole('dev')) { addLocalMessage('Requires dev', 'err'); break; }
      if (!arg1) { addLocalMessage('/admin <user>', 'err'); break; }
      if (await showConfirm(arg1, 'admin')) await setRole(arg1, 'admin');
      break;

    case '/unadmin':
      if (!hasRole('dev')) { addLocalMessage('Requires dev', 'err'); break; }
      if (!arg1) { addLocalMessage('/unadmin <user>', 'err'); break; }
      if (await showConfirm(arg1, 'unadmin')) await setRole(arg1, 'user');
      break;

    default:
      addLocalMessage(`Unknown: ${esc(cmd)}`, 'err');
  }
}
