import { db, auth } from '../firebase-config.js';
import { signOut, onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch, serverTimestamp, arrayUnion, arrayRemove, query, orderBy, limit, documentId, where }
    from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { BADGES } from '../js/badge.js';
import { calculatePlayerScore } from '../score.js';
import { placementText, enT } from '../js/placement.js';
import { HELP } from './help.js';
import { startDiscordSignIn } from '../js/discord.js';
import { clearDataCache } from '../js/data.js';

(function applyHelp() {
    const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    document.querySelectorAll('[data-help]').forEach(el => {
        const text = (HELP[el.dataset.help] || '').trim();
        if (!text) return;
        el.innerHTML = esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    });
})();

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const splitNames = (s = '') => String(s).split(',').map(x => x.trim()).filter(Boolean);
const slug = (name) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'player';
const today = () => new Date().toISOString().slice(0, 10);

let levels = [];
let players = [];
let me = null;
let log = [];
let claims = [];
let reqs = [];
let subs = [];
let bans = [];
let lockdown = false;
let changed = false;

$('signIn').onclick = () => startDiscordSignIn();
$('signOut').onclick = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
    $('signIn').classList.toggle('hidden', !!user);
    $('signOut').classList.toggle('hidden', !user);
    $('tools').classList.add('hidden');
    if (!user) { $('who').textContent = 'Not signed in.'; $('roleNote').textContent = ''; return; }

    $('who').textContent = 'Signed in.';
    const mine = await getDoc(doc(db, 'players', user.uid)).catch(() => null);
    const role = mine && mine.exists() ? mine.data().role : null;
    me = { uid: user.uid, name: (mine && mine.exists() && mine.data().username) || user.uid, role,
          approvalBadge: (mine && mine.exists() && mine.data().approvalBadge) || '' };
    $('who').textContent = `Signed in as ${me.name}`;
    if (role === 'owner' || role === 'listadmin') {
        document.body.dataset.role = role;
        $('roleNote').innerHTML = role === 'owner'
            ? '<span class="ok">You are the owner.</span>'
            : '<span class="ok">You are a ListAdmin.</span> You can review victory submissions, fix players\' beaten levels, request KLP and badge changes, and put your approval badge on levels.';
        $('tools').classList.remove('hidden');
        await reload();
    } else {
        $('roleNote').innerHTML = `<span class="warn">This account isn't on the team.</span> Account ID: <code>${esc(user.uid)}</code>
            <br><span class="muted">To make it a ListAdmin, the owner adds this ID on the Team tab.</span>`;
    }
});

async function reload() {
    clearDataCache();
    if (changed) {
        changed = false;
        setDoc(doc(db, 'meta', 'version'), { at: serverTimestamp() }).catch(err => console.warn('Could not bump meta/version:', err));
    }
    const [ls, ps, snap, snaps, lg, sb, rq] = await Promise.all([
        getDocs(collection(db, 'levels')), getDocs(collection(db, 'players')), getDoc(doc(db, 'snapshots', today())),
        getDocs(query(collection(db, 'snapshots'), orderBy(documentId(), 'desc'), limit(1))).catch(() => ({ docs: [] })),
        fetchLog(logTabOpen() ? LOG_FULL : LOG_SHORT),
        getDocs(collection(db, 'submissions')).catch(() => ({ docs: [] })),
        getDocs(collection(db, 'changeRequests')).catch(() => ({ docs: [] })),
    ]);
    const [bn, lk] = await Promise.all([
        getDocs(collection(db, 'bans')).catch(() => ({ docs: [] })),
        getDoc(doc(db, 'meta', 'lockdown')).catch(() => null),
    ]);
    bans = bn.docs.map(d => ({ uid: d.id, ...d.data() }));
    lockdown = !!lk?.exists() && lk.data().comments === true;
    reqs = rq.docs.map(d => ({ docId: d.id, ...d.data() }));
    subs = sb.docs.map(d => ({ docId: d.id, ...d.data() }));
    lastSnapshot = snaps.docs[0]?.id || null;
    log = lg.docs.map(d => d.data());
    logIsFull = logTabOpen();
    if (me.role === 'owner') {
        const cl = await getDocs(collection(db, 'claims')).catch(() => ({ docs: [] }));
        claims = cl.docs.map(d => ({ uid: d.id, ...d.data() }));
    }
    levels = ls.docs.map(d => ({ ...d.data(), id: d.id, klp: Number(d.data().klp) || 0, badges: d.data().badges || [] }))
        .sort((a, b) => (b.klp - a.klp) || ((a.position ?? 1e9) - (b.position ?? 1e9)) || a.name.localeCompare(b.name));
    players = ps.docs.map(d => ({ docId: d.id, ...d.data(), beatenLevels: d.data().beatenLevels || [], verifiedLevels: d.data().verifiedLevels || [], oldCompletions: d.data().oldCompletions || [] }));
    $('snapBanner').classList.toggle('hidden', snap.exists());
    $('playerNames').innerHTML = players.filter(p => p.username).map(p => `<option value="${esc(p.username)}">`).join('');
    $('levelNames').innerHTML = levels.map(l => `<option value="${esc(l.name)}">`).join('');
    if (me.role === 'owner') await reserveNames();
    drawLevels();
    drawDashboard();
    drawTeam();
    drawLog();
    drawClaims();
    drawSubs();
    drawReqs();
    if (openPlayerName) showPlayer(openPlayerName);
}
let lastSnapshot = null;

const LOG_SHORT = 25, LOG_FULL = 200;
let logIsFull = false;
const logTabOpen = () => !!document.querySelector('[data-tab="log"].active');
const fetchLog = (n) => getDocs(query(collection(db, 'changeLog'), orderBy('at', 'desc'), limit(n))).catch(() => ({ docs: [] }));
document.querySelector('[data-tab="log"]')?.addEventListener('click', async () => {
    if (logIsFull || !me) return;
    logIsFull = true;
    log = (await fetchLog(LOG_FULL)).docs.map(d => d.data());
    drawLog();
});

function logEntry(batch, action, target, details = '') {
    changed = true;
    batch.set(doc(collection(db, 'changeLog')), { at: serverTimestamp(), by: me.uid, byName: me.name, action, target, details });
}
const ACTION_LABEL = {
    'snapshot': 'Saved a snapshot', 'level.add': 'Added a level', 'level.edit': 'Edited a level', 'level.remove': 'Removed a level',
    'victor.add': 'Added a victor', 'victor.remove': 'Removed a victor', 'team.role': 'Changed a role', 'player.retired': 'Changed retired status',
    'claim.approve': 'Approved a claim', 'claim.reject': 'Turned down a claim',
    'submission.accept': 'Accepted a submission', 'submission.reject': 'Turned down a submission',
    'account.unlink': 'Unlinked an account', 'account.delete': 'Deleted an account',
    'request.make': 'Made a request', 'request.approve': 'Approved a request', 'request.reject': 'Turned down a request',
    'level.badge': 'Changed their approval badge', 'team.badge': 'Set an approval badge',
    'comment.delete': 'Deleted a comment',
    'player.ban': 'Banned a player', 'player.unban': 'Unbanned a player', 'comment.purge': 'Deleted all comments by a player',
    'comments.lock': 'Paused comments', 'comments.unlock': 'Reopened comments',
};
const when = (t) => {
    const d = t?.toDate ? t.toDate() : (t ? new Date(t) : null);
    return d && !isNaN(d) ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'just now';
};
const logRow = (e) => `<tr><td class="nowrap">${esc(when(e.at))}</td><td>${esc(e.byName)}</td>
    <td>${esc(ACTION_LABEL[e.action] || e.action)}</td><td>${esc(e.target)}</td><td>${esc(e.details)}</td></tr>`;

function drawLog() {
    const q = ($('logSearch')?.value || '').trim().toLowerCase();
    const rows = log.filter(e => !q || [e.byName, e.target, e.details, ACTION_LABEL[e.action]].join(' ').toLowerCase().includes(q));
    $('logRows').innerHTML = rows.length ? rows.map(logRow).join('') : '<tr><td colspan="5" class="muted">Nothing logged yet.</td></tr>';
}
$('logSearch').oninput = drawLog;

function drawDashboard() {
    const totalKlp = levels.reduce((s, l) => s + l.klp, 0);
    const activePlayers = players.filter(p => p.beatenLevels.length || p.verifiedLevels.length).length;
    const team = players.filter(p => p.role === 'listadmin' || p.role === 'owner').length;
    $('stats').innerHTML = [
        ['Levels', levels.length], ['Players', activePlayers], ['Total KLP', totalKlp.toLocaleString()],
        ['Submissions waiting', subs.filter(x => x.status === 'pending').length],
        [me.role === 'owner' ? 'Requests waiting' : 'Your requests waiting', reqs.filter(r => r.status === 'pending' && (me.role === 'owner' || r.requestedBy === me.uid)).length],
        ['Last snapshot', lastSnapshot || 'none yet'], ['Team', team],
        ...(me.role === 'owner' ? [['Claims waiting', claims.filter(c => c.status === 'pending').length]] : []),
        ...(me.role === 'owner' && players.some(p => p.deleteRequested && !p.legacy) ? [['Delete requests (Team tab)', players.filter(p => p.deleteRequested && !p.legacy).length]] : []),
    ].map(([k, v]) => `<div class="stat board-9slice"><div class="stat-v">${esc(v)}</div><div class="stat-k">${esc(k)}</div></div>`).join('');
    $('dashTop').innerHTML = levels.slice(0, 5).map((l, i) => `<li><span>#${i + 1} ${esc(l.name)}</span><span>${l.klp} KLP</span></li>`).join('');
    $('dashLog').innerHTML = log.length ? log.slice(0, 8).map(logRow).join('') : '<tr><td colspan="5" class="muted">Nothing logged yet. Changes you make from now on show up here.</td></tr>';
    drawRaid();
}

function drawRaid() {
    $('lockState').innerHTML = lockdown ? '<span class="bad">Comments are paused.</span> Only the team can post.' : '<span class="ok">Comments are open.</span>';
    $('lockToggle').textContent = lockdown ? 'Reopen comments' : 'Pause comments';
    $('banRows').innerHTML = bans.length ? bans.map(b => `<tr><td>${esc(b.username || b.uid)}</td><td>${esc(b.reason || '')}</td><td>${esc(b.byName || '')}</td>
        <td class="nowrap">${esc(when(b.at))}</td><td><button class="small" data-unban="${esc(b.uid)}">Unban</button></td></tr>`).join('')
        : '<tr><td colspan="5" class="muted">Nobody is banned.</td></tr>';
}

function banTarget() {
    const raw = $('banName').value.trim();
    if (!raw) return null;
    const p = findPlayer(raw);
    if (p) return p.legacy && !p.claimed ? { error: `${p.username} is an old record without an account. There's nothing to ban.` } : { uid: p.docId, name: p.username, role: p.role };
    if (/^[A-Za-z0-9_]{20,40}$/.test(raw)) return { uid: raw, name: raw, role: 'player' };
    return { error: `There's no player called ${raw}.` };
}

async function purgeComments(uid, name) {
    const snap = await getDocs(query(collection(db, 'comments'), where('playerUid', '==', uid)));
    for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 400).forEach(d => batch.delete(doc(db, 'comments', d.id)));
        if (i === 0) logEntry(batch, 'comment.purge', name, `${snap.docs.length} comments`);
        await batch.commit();
    }
    return snap.docs.length;
}

$('lockToggle').onclick = async () => {
    $('lockToggle').disabled = true;
    try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'meta', 'lockdown'), { comments: !lockdown, by: me.uid, at: serverTimestamp() });
        logEntry(batch, lockdown ? 'comments.unlock' : 'comments.lock', 'all comments');
        await batch.commit();
        lockdown = !lockdown;
        drawRaid();
        toast(lockdown ? 'Comments paused.' : 'Comments reopened.');
    } catch (err) { say('banStatus', err.message, 'bad'); }
    $('lockToggle').disabled = false;
};

$('banBtn').onclick = async () => {
    const tg = banTarget();
    if (!tg) return say('banStatus', 'Type a player name or account ID first.', 'bad');
    if (tg.error) return say('banStatus', tg.error, 'bad');
    if (tg.uid === me.uid) return say('banStatus', "You can't ban yourself.", 'bad');
    if (tg.role && tg.role !== 'player') return say('banStatus', `${tg.name} is on the team. Take their role away on the Team tab first.`, 'bad');
    if (bans.some(b => b.uid === tg.uid)) return say('banStatus', `${tg.name} is already banned.`, 'bad');
    $('banBtn').disabled = true;
    try {
        const reason = $('banReason').value.trim().slice(0, 200);
        const batch = writeBatch(db);
        batch.set(doc(db, 'bans', tg.uid), { username: tg.name, reason, by: me.uid, byName: me.name, at: serverTimestamp() });
        logEntry(batch, 'player.ban', tg.name, reason);
        await batch.commit();
        const n = $('banPurge').checked ? await purgeComments(tg.uid, tg.name) : 0;
        say('banStatus', `Banned ${tg.name}.${$('banPurge').checked ? ` Deleted ${n} comment${n === 1 ? '' : 's'}.` : ''}`, 'ok');
        $('banName').value = ''; $('banReason').value = '';
        reload();
    } catch (err) { say('banStatus', err.message, 'bad'); }
    $('banBtn').disabled = false;
};

$('purgeBtn').onclick = async () => {
    const tg = banTarget();
    if (!tg) return say('banStatus', 'Type a player name or account ID first.', 'bad');
    if (tg.error) return say('banStatus', tg.error, 'bad');
    if (tg.role && tg.role !== 'player' && me.role !== 'owner') return say('banStatus', `${tg.name} is on the team. Only the owner can delete a team member's comments.`, 'bad');
    $('purgeBtn').disabled = true;
    try {
        const n = await purgeComments(tg.uid, tg.name);
        say('banStatus', `Deleted ${n} comment${n === 1 ? '' : 's'} by ${tg.name}.`, 'ok');
        reload();
    } catch (err) { say('banStatus', err.message, 'bad'); }
    $('purgeBtn').disabled = false;
};

$('banRows').addEventListener('click', async (e) => {
    const uid = e.target.dataset?.unban;
    if (!uid) return;
    const b = bans.find(x => x.uid === uid);
    e.target.disabled = true;
    try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'bans', uid));
        logEntry(batch, 'player.unban', b?.username || uid);
        await batch.commit();
        toast(`Unbanned ${b?.username || uid}.`);
        reload();
    } catch (err) { say('banStatus', err.message, 'bad'); e.target.disabled = false; }
});

const findPlayer = (name) => players.find(p => (p.username || '').toLowerCase() === String(name).trim().toLowerCase());

$('saveSnap').onclick = async () => {
    $('saveSnap').disabled = true;
    try {
        const snapshot = levels.map(l => ({ name: l.name, klp: l.klp, creator: l.creator || '', verifier: l.verifier || '', id: l.id, badges: l.badges }));
        const batch = writeBatch(db);
        batch.set(doc(db, 'snapshots', today()), { date: today(), levels: snapshot, savedAt: serverTimestamp() });
        logEntry(batch, 'snapshot', today(), `${snapshot.length} levels`);
        await batch.commit();
        reload();
        $('snapStatus').innerHTML = `<span class="ok">Saved the ${today()} snapshot (${snapshot.length} levels).</span>`;
        $('snapBanner').classList.add('hidden');
    } catch (err) {
        $('snapStatus').innerHTML = `<span class="bad">${esc(err.message)}</span>`;
    }
    $('saveSnap').disabled = false;
};

function drawLevels() {
    const q = $('levelSearch').value.trim().toLowerCase();
    $('levelRows').innerHTML = levels.map((l, i) => ({ l, rank: i + 1 }))
        .filter(({ l }) => !q || l.name.toLowerCase().includes(q) || String(l.id).includes(q))
        .map(({ l, rank }) => `<tr>
            <td>${rank}</td><td>${esc(l.name)}</td><td>${l.klp}</td><td>${esc(l.verifier)}</td><td><code>${esc(l.id)}</code></td>
            <td><button class="small" data-edit="${esc(l.id)}">Edit</button></td></tr>`).join('');
}
$('levelSearch').oninput = drawLevels;
$('levelRows').onclick = (e) => { const id = e.target.dataset.edit; if (id) openForm(levels.find(l => l.id === id)); };
$('addLevel').onclick = () => openForm(null);
$('cancelLevel').onclick = () => { $('levelForm').classList.add('hidden'); fromSubmission = null; };

const pickableBadges = Object.entries(BADGES).filter(([, b]) => b.type !== 'special');
let editing = null;
let fromSubmission = null;

function openForm(level) {
    editing = level;
    $('formTitle').textContent = level ? `Edit "${level.name}"` : 'Add a level';
    $('f_name').value = level?.name || '';
    $('f_id').value = level?.id || '';
    $('f_id').disabled = !!level;
    $('f_klp').value = level ? level.klp : '';
    $('f_creator').value = level?.creator || '';
    $('f_verifier').value = level?.verifier || '';
    fromSubmission = null;
    $('f_opinions').textContent = level ? opinionsText(level.id) : '';
    showEditorPlacement();
    const have = new Set(level?.badges || []);
    $('f_badges').innerHTML = pickableBadges.map(([key, b]) => `
        <label><input type="checkbox" value="${esc(key)}" ${have.has(key) ? 'checked' : ''}>
        <img src="../${esc(b.icon)}" alt="">${esc(b.label.replace(/ Badge$/, ''))}</label>`).join('');
    $('deleteLevel').classList.toggle('hidden', !level);
    $('levelStatus').textContent = '';
    $('levelForm').classList.remove('hidden');
    $('levelForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showEditorPlacement() {
    const raw = $('f_klp').value;
    $('f_place').textContent = raw === '' ? '' : placementText(levels, Number(raw), editing, enT);
}
$('f_klp').oninput = showEditorPlacement;

$('saveLevel').onclick = async () => {
    const id = $('f_id').value.trim();
    const name = $('f_name').value.trim();
    const klp = Number($('f_klp').value);
    const verifier = $('f_verifier').value.trim();
    if (!id || !/^\d+$/.test(id)) return say('levelStatus', 'The level ID should be the number from the game.', 'bad');
    if (!name) return say('levelStatus', 'The level needs a name.', 'bad');
    if (!Number.isFinite(klp) || klp < 0) return say('levelStatus', 'KLP should be a number.', 'bad');
    if (!editing && levels.some(l => l.id === id)) return say('levelStatus', `ID ${id} is already on the list (${levels.find(l => l.id === id).name}).`, 'bad');
    const badges = [...$('f_badges').querySelectorAll('input:checked')].map(i => i.value);

    const batch = writeBatch(db);
    const data = {
        name, id, klp, creator: $('f_creator').value.trim(), verifier, badges, lastUpdatedAt: serverTimestamp(),
        position: editing?.position ?? Math.max(-1, ...levels.map(l => l.position ?? -1)) + 1,
    };
    if (!editing) data.addedAt = serverTimestamp();
    batch.set(doc(db, 'levels', id), data, { merge: true });
    const sub = !editing && fromSubmission && fromSubmission.levelId === id ? fromSubmission : null;
    if (sub) {
        batch.update(doc(db, 'submissions', sub.docId), decision('accepted', $('f_klp').value));
        logEntry(batch, 'submission.accept', sub.username, `verification of ${name}`);
    }

    const before = new Set(splitNames(editing?.verifier)), after = new Set(splitNames(verifier));
    for (const v of before) if (!after.has(v)) { const p = findPlayer(v); if (p) batch.update(doc(db, 'players', p.docId), { verifiedLevels: arrayRemove(id) }); }
    for (const v of after) if (!before.has(v)) playerWrite(batch, v, { verifiedLevels: arrayUnion(id), oldCompletions: arrayRemove(name) });
    logEntry(batch, editing ? 'level.edit' : 'level.add', name, describeLevelChange(editing, { name, klp, creator: data.creator, verifier, badges }));

    try {
        await batch.commit();
        $('levelForm').classList.add('hidden');
        fromSubmission = null;
        await reload();
        flash(sub ? `Added "${name}" and accepted ${sub.username}'s verification.` : `Saved "${name}".`);
    } catch (err) { say('levelStatus', err.message, 'bad'); }
};

$('deleteLevel').onclick = async () => {
    if (!editing || !confirm(`Remove "${editing.name}" from the list?\n\nPlayers who beat it keep it as an old completion.`)) return;
    const batch = writeBatch(db);
    batch.delete(doc(db, 'levels', editing.id));
    logEntry(batch, 'level.remove', editing.name, `was ${editing.klp} KLP`);
    for (const p of players) {
        if (p.beatenLevels.includes(editing.id) || p.verifiedLevels.includes(editing.id)) {
            batch.update(doc(db, 'players', p.docId), {
                beatenLevels: arrayRemove(editing.id), verifiedLevels: arrayRemove(editing.id), oldCompletions: arrayUnion(editing.name),
            });
        }
    }
    try {
        await batch.commit();
        $('levelForm').classList.add('hidden');
        const name = editing.name;
        await reload();
        flash(`Removed "${name}".`);
    } catch (err) { say('levelStatus', err.message, 'bad'); }
};

function describeLevelChange(before, after) {
    const badgeName = (k) => (BADGES[k]?.label || k).replace(/ Badge$/, '');
    if (!before) return `${after.klp} KLP, verified by ${after.verifier || '?'}${after.badges.length ? ', ' + after.badges.map(badgeName).join(', ') : ''}`;
    const parts = [];
    if (before.name !== after.name) parts.push(`renamed from ${before.name}`);
    if (before.klp !== after.klp) parts.push(`${before.klp} -> ${after.klp} KLP`);
    if ((before.creator || '') !== after.creator) parts.push(`creator ${before.creator || '-'} -> ${after.creator || '-'}`);
    if ((before.verifier || '') !== after.verifier) parts.push(`verifier ${before.verifier || '-'} -> ${after.verifier || '-'}`);
    const had = new Set(before.badges || []), has = new Set(after.badges);
    for (const k of has) if (!had.has(k)) parts.push(`+${badgeName(k)}`);
    for (const k of had) if (!has.has(k)) parts.push(`-${badgeName(k)}`);
    return parts.join(', ') || 'no changes';
}

function playerWrite(batch, name, changes) {
    const p = findPlayer(name);
    if (p) { batch.update(doc(db, 'players', p.docId), changes); return; }
    let id = slug(name);
    while (players.some(x => x.docId === id)) id += '-2';
    batch.set(doc(db, 'players', id), {
        username: name, role: 'player', legacy: true, claimed: false, retired: false,
        beatenLevels: [], verifiedLevels: [], oldCompletions: [], createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'players', id), changes);
    players.push({ docId: id, username: name, beatenLevels: [], verifiedLevels: [], oldCompletions: [] });
}

let openPlayerName = null;

$('openPlayer').onclick = () => showPlayer($('playerPick').value);
$('playerPick').onkeydown = (e) => { if (e.key === 'Enter') showPlayer($('playerPick').value); };

function showPlayer(name) {
    name = String(name || '').trim();
    if (!name) return;
    openPlayerName = name;
    const p = findPlayer(name);
    $('playerPanel').classList.remove('hidden');
    $('playerTitle').textContent = p ? p.username : `${name} (new player, made when you add their first level)`;
    const beaten = (p?.beatenLevels || []).map(id => levels.find(l => l.id === id) || { id, name: `unknown level ${id}`, klp: 0 })
        .sort((a, b) => b.klp - a.klp);
    $('beatenChips').innerHTML = beaten.length
        ? beaten.map(l => `<span class="chip">${esc(l.name)} <small style="color:#888">${l.klp}</small>
            <button class="small danger" data-unbeat="${esc(l.id)}" title="Remove">X</button></span>`).join('')
        : '<span style="color:#888">No beaten levels yet.</span>';
    const verified = (p?.verifiedLevels || []).map(id => levels.find(l => l.id === id)?.name).filter(Boolean);
    $('oldNote').innerHTML = [
        verified.length ? `Verified: ${verified.map(esc).join(', ')}` : '',
        p?.oldCompletions?.length ? `Old completions (no longer on the list): ${p.oldCompletions.map(esc).join(', ')}` : '',
    ].filter(Boolean).join('<br>');
}

$('addVictory').onclick = async () => {
    const lvl = levels.find(l => l.name.toLowerCase() === $('levelPick').value.trim().toLowerCase());
    if (!lvl) return say('playerStatus', 'Pick a level from the list.', 'bad');
    if (!openPlayerName) return;
    const p = findPlayer(openPlayerName);
    if (p?.beatenLevels.includes(lvl.id)) return say('playerStatus', 'They already have that one.', 'warn');
    if (!p && me.role !== 'owner') return say('playerStatus', `There's no player called ${openPlayerName}. Only I can add new players.`, 'bad');
    const batch = writeBatch(db);
    const changes = { beatenLevels: arrayUnion(lvl.id) };
    if (me.role === 'owner' && p?.oldCompletions.includes(lvl.name)) changes.oldCompletions = arrayRemove(lvl.name);
    playerWrite(batch, openPlayerName, changes);
    logEntry(batch, 'victor.add', p ? p.username : openPlayerName, lvl.name);
    try {
        await batch.commit();
        $('levelPick').value = '';
        await reload();
        say('playerStatus', `Added ${lvl.name}.`, 'ok');
    } catch (err) { say('playerStatus', err.message, 'bad'); }
};

$('beatenChips').onclick = async (e) => {
    const id = e.target.dataset.unbeat;
    if (!id) return;
    const p = findPlayer(openPlayerName);
    const lvl = levels.find(l => l.id === id);
    if (!p || !confirm(`Remove ${lvl ? lvl.name : id} from ${p.username}?`)) return;
    try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'players', p.docId), { beatenLevels: arrayRemove(id) });
        logEntry(batch, 'victor.remove', p.username, lvl ? lvl.name : id);
        await batch.commit();
        await reload();
        say('playerStatus', 'Removed.', 'ok');
    } catch (err) { say('playerStatus', err.message, 'bad'); }
};

function decision(status, klpOpinion, reason = '') {
    const d = { status, decidedAt: serverTimestamp(), decidedBy: me.uid, decidedByName: me.name };
    const klp = String(klpOpinion ?? '').trim() === '' ? null : Math.round(Number(klpOpinion));
    if (Number.isFinite(klp) && klp !== null) d.reviewerKlpOpinion = klp;
    if (reason.trim()) d.rejectReason = reason.trim().slice(0, 200);
    return d;
}

function opinionsText(levelId) {
    const ops = [];
    for (const x of subs.filter(x => x.levelId === levelId && x.status === 'accepted')) {
        if (Number.isFinite(x.klpOpinion)) ops.push([x.klpOpinion, x.username]);
        if (Number.isFinite(x.reviewerKlpOpinion)) ops.push([x.reviewerKlpOpinion, `${x.decidedByName}, reviewer`]);
    }
    if (!ops.length) return '';
    const avg = Math.round(ops.reduce((s, [v]) => s + v, 0) / ops.length);
    return `KLP opinions: ${ops.map(([v, who]) => `${v} (${who})`).join(', ')} | average ${avg}`;
}

const $$tab = (name) => document.querySelector(`[data-tab="${name}"]`)?.click();
const isLink = (u) => /^https:\/\//.test(u || '');

function drawSubs() {
    const showMine = $('subsMineToo').checked;
    const waiting = subs.filter(x => x.status === 'pending' && (showMine || x.playerUid !== me.uid))
        .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    const tab = document.querySelector('[data-tab="subs"]');
    const n = subs.filter(x => x.status === 'pending').length;
    if (tab) tab.textContent = n ? `Submissions (${n})` : 'Submissions';

    $('subsWaiting').innerHTML = waiting.length ? waiting.map(x => {
        const lvl = levels.find(l => l.id === x.levelId);
        const rank = lvl ? levels.indexOf(lvl) + 1 : null;
        const player = players.find(p => p.docId === x.playerUid);
        const victor = x.type === 'victor';
        const canDecide = victor ? true : me.role === 'owner';
        const problem = !player ? 'This account no longer exists.'
            : victor && !lvl ? 'This level is no longer on the list.'
            : victor && player.beatenLevels.includes(x.levelId) ? 'They already have this level (added some other way).'
            : !victor && lvl ? 'A level with this ID is already on the list.' : '';
        return `<div class="sub-card ${victor ? 'victor' : 'verification'}" data-sub="${esc(x.docId)}">
            <div class="sub-head">
                <div class="sub-title"><b>${esc(x.username)}</b> ${victor ? 'beat' : 'verified'} <b>${esc(x.levelName)}</b>
                    <span class="tag">${victor ? 'victory' : 'new level'}</span>${x.playerUid === me.uid ? '<span class="tag">yours</span>' : ''}</div>
                <div class="muted">${esc(when(x.createdAt))}</div>
            </div>
            <div class="muted" style="font-size:.88em">
                ${victor ? (lvl ? `#${rank} | ${lvl.klp} KLP now | by ${esc(lvl.creator)}` : '') : `ID <code>${esc(x.levelId)}</code> | by ${esc(x.creator)}`}
                | in-game name: ${esc(x.inGameName)} | their KLP opinion: <b>${esc(x.klpOpinion ?? '-')}</b>
            </div>
            ${Number.isFinite(x.klpOpinion) ? `<div class="place-line">Their opinion: ${esc(placementText(levels, x.klpOpinion, victor ? lvl : null, enT))}</div>` : ''}
            <div style="margin-top:4px">${isLink(x.videoUrl) ? `<a href="${esc(x.videoUrl)}" target="_blank" rel="noopener noreferrer">Watch the video</a> <span class="muted" style="font-size:.8em">${esc(x.videoUrl)}</span>` : '<span class="bad">no valid link</span>'}</div>
            ${x.thoughts ? `<div class="sub-thoughts">${esc(x.thoughts)}</div>` : ''}
            ${problem ? `<p class="warn">${esc(problem)}</p>` : ''}
            ${canDecide ? `<div class="row">
                <input type="number" min="0" max="10000" placeholder="My KLP opinion" data-klp style="width:210px">
                <input placeholder="Reason, if turning down" data-reason maxlength="200" style="flex:1; min-width:180px">
            </div>
            <div class="place-line" data-place></div>
            <div class="row" style="margin-bottom:0">
                ${victor ? `<button class="hub-button" data-accept ${problem ? 'disabled' : ''}><img class="btn-icon" src="../images/icon/check.png" alt="">Accept</button>`
                         : `<button class="hub-button" data-addlevel ${problem ? 'disabled' : ''}>Add to list...</button>`}
                <button class="hub-button danger" data-reject><img class="btn-icon" src="../images/icon/cross.png" alt="">Turn down</button>
            </div>` : '<p class="muted">I decide verifications.</p>'}
        </div>`;
    }).join('') : '<p class="muted">Nothing waiting.</p>';

    const done = subs.filter(x => x.status !== 'pending')
        .sort((a, b) => (b.decidedAt?.seconds || 0) - (a.decidedAt?.seconds || 0)).slice(0, 50);
    $('subsDone').innerHTML = done.length ? done.map(x => `<tr>
        <td class="nowrap">${esc(when(x.decidedAt))}</td><td>${esc(x.username)}</td>
        <td>${esc(x.levelName)}${x.type === 'verification' ? ' <span class="muted">(new)</span>' : ''}</td>
        <td>${x.status === 'accepted' ? '<span class="ok">accepted</span>' : `<span class="bad">turned down</span>${x.rejectReason ? `: ${esc(x.rejectReason)}` : ''}`}</td>
        <td>${esc(x.decidedByName)}</td>
        <td>${esc(x.klpOpinion ?? '-')} / ${esc(x.reviewerKlpOpinion ?? '-')}</td></tr>`).join('')
        : '<tr><td colspan="6" class="muted">Nothing decided yet.</td></tr>';
}
$('subsMineToo').onchange = drawSubs;

$('subsWaiting').oninput = (e) => {
    if (!e.target.hasAttribute('data-klp')) return;
    const card = e.target.closest('[data-sub]');
    const x = subs.find(s => s.docId === card.dataset.sub);
    const lvl = x?.type === 'victor' ? levels.find(l => l.id === x.levelId) : null;
    card.querySelector('[data-place]').textContent = e.target.value === '' ? '' : 'Yours: ' + placementText(levels, Number(e.target.value), lvl, enT);
};

$('subsWaiting').onclick = async (e) => {
    const card = e.target.closest('[data-sub]');
    if (!card || e.target.tagName !== 'BUTTON') return;
    const x = subs.find(s => s.docId === card.dataset.sub);
    if (!x) return;
    const klp = card.querySelector('[data-klp]')?.value ?? '';
    const reason = card.querySelector('[data-reason]')?.value ?? '';
    const lvl = levels.find(l => l.id === x.levelId);

    if (e.target.hasAttribute('data-addlevel')) {
        $$tab('levels');
        openForm(null);
        fromSubmission = x;
        $('f_name').value = x.levelName; $('f_id').value = x.levelId; $('f_creator').value = x.creator || '';
        $('f_verifier').value = x.username; $('f_klp').value = klp || x.klpOpinion || '';
        showEditorPlacement();
        $('formTitle').textContent = `Add "${x.levelName}" (verification by ${x.username})`;
        $('f_opinions').textContent = `Their KLP opinion: ${x.klpOpinion ?? '-'}${klp ? ` | yours: ${klp}` : ''}`;
        return;
    }

    const accept = e.target.hasAttribute('data-accept');
    if (!accept && !e.target.hasAttribute('data-reject')) return;
    if (accept && !confirm(`Accept ${x.username}'s victory on ${x.levelName}? It goes on their profile right away.`)) return;
    if (!accept && !reason.trim() && !confirm('Turn it down without a reason? They\'ll only see "Turned down".')) return;
    e.target.disabled = true;
    const batch = writeBatch(db);
    batch.update(doc(db, 'submissions', x.docId), decision(accept ? 'accepted' : 'rejected', klp, accept ? '' : reason));
    if (accept) {
        batch.update(doc(db, 'players', x.playerUid), { beatenLevels: arrayUnion(x.levelId) });
        logEntry(batch, 'submission.accept', x.username, `${x.levelName}${lvl ? ` (${lvl.klp} KLP)` : ''}${x.playerUid === me.uid ? ' (own submission)' : ''}`);
    } else {
        logEntry(batch, 'submission.reject', x.username, `${x.type === 'victor' ? '' : 'verification of '}${x.levelName}${reason.trim() ? `: ${reason.trim()}` : ''}`);
    }
    try { await batch.commit(); await reload(); toast(accept ? `Accepted. ${x.levelName} is on ${x.username}'s profile.` : 'Turned down.'); }
    catch (err) { e.target.disabled = false; alert(err.message); }
};

const APPROVAL_BADGES = Object.entries(BADGES).filter(([k]) => k.startsWith('approved_'));
const requestableBadges = pickableBadges.filter(([k]) => !k.startsWith('approved_'));
const badgeName = (k) => (BADGES[k]?.label || k).replace(/ Badge$/, '');
const badgeIcon = (k) => BADGES[k] ? `<img src="../${esc(BADGES[k].icon)}" alt="">` : '';

function describeReq(r) {
    if (r.type === 'klp') return `KLP ${r.before ?? '?'} -> ${r.value}`;
    return `<span class="req-inline">${r.type === 'badge_add' ? 'add' : 'remove'} ${badgeIcon(r.value)} ${esc(badgeName(r.value))}</span>`;
}

function reqProblem(r, lvl) {
    if (!lvl) return 'This level is no longer on the list.';
    if (r.type === 'klp' && lvl.klp === r.value) return `It's already at ${r.value} KLP.`;
    if (r.type === 'badge_add' && lvl.badges.includes(r.value)) return 'It already has this badge.';
    if (r.type === 'badge_remove' && !lvl.badges.includes(r.value)) return "It doesn't have this badge anymore.";
    return '';
}

function drawReqs() {
    const waitingAll = reqs.filter(r => r.status === 'pending');
    const tab = document.querySelector('[data-tab="reqs"]');
    const n = me.role === 'owner' ? waitingAll.length : waitingAll.filter(r => r.requestedBy === me.uid).length;
    if (tab) tab.textContent = n ? `Requests (${n})` : 'Requests';
    $('reqSnapHint').classList.toggle('hidden', !waitingAll.length || $('snapBanner').classList.contains('hidden'));

    $('reqWaiting').innerHTML = waitingAll.length ? waitingAll.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)).map(r => {
        const lvl = levels.find(l => l.id === r.levelId);
        const problem = reqProblem(r, lvl);
        const place = r.type === 'klp' && lvl ? placementText(levels, r.value, lvl, enT) : '';
        return `<div class="sub-card" data-req="${esc(r.docId)}">
            <div class="sub-head"><div class="sub-title"><b>${esc(r.requestedByName)}</b> asks: <b>${esc(r.levelName)}</b> ${describeReq(r)}</div>
                <div class="muted">${esc(when(r.createdAt))}</div></div>
            ${lvl ? `<div class="muted" style="font-size:.88em">Now: #${levels.indexOf(lvl) + 1} | ${lvl.klp} KLP</div>` : ''}
            ${place ? `<div class="place-line">${esc(place)}</div>` : ''}
            ${r.type === 'klp' && lvl && opinionsText(lvl.id) ? `<div class="muted" style="font-size:.8em">${esc(opinionsText(lvl.id))}</div>` : ''}
            ${r.reason ? `<div class="sub-thoughts">${esc(r.reason)}</div>` : ''}
            ${problem ? `<p class="warn">${esc(problem)}</p>` : ''}
            <div class="row" style="margin-bottom:0">
                <button class="hub-button" data-approve-req ${problem ? 'disabled' : ''}><img class="btn-icon" src="../images/icon/check.png" alt="">Approve</button>
                <input placeholder="Reason, if turning down" data-reason maxlength="200" style="flex:1; min-width:180px">
                <button class="hub-button danger" data-reject-req><img class="btn-icon" src="../images/icon/cross.png" alt="">Turn down</button>
            </div></div>`;
    }).join('') : '<p class="muted">Nothing waiting.</p>';

    const shown = reqs.filter(r => r.status !== 'pending' || (me.role !== 'owner' && r.requestedBy === me.uid))
        .sort((a, b) => ((b.decidedAt || b.createdAt)?.seconds || 0) - ((a.decidedAt || a.createdAt)?.seconds || 0)).slice(0, 50);
    $('reqDoneTitle').textContent = me.role === 'owner' ? 'Decided' : 'Requests (yours waiting, and everyone\'s decided)';
    $('reqDone').innerHTML = shown.length ? shown.map(r => `<tr>
        <td class="nowrap">${esc(when(r.decidedAt || r.createdAt))}</td><td>${esc(r.requestedByName)}</td><td>${esc(r.levelName)}</td>
        <td>${describeReq(r)}${r.reason ? `<br><span class="muted" style="font-size:.85em">${esc(r.reason)}</span>` : ''}</td>
        <td>${r.status === 'pending' ? `<span class="warn">waiting</span> <button class="small" data-cancel-req="${esc(r.docId)}">Take back</button>`
            : r.status === 'approved' ? `<span class="ok">approved</span> <span class="muted">(${esc(r.decidedByName)})</span>`
            : `<span class="bad">turned down</span>${r.rejectReason ? `: ${esc(r.rejectReason)}` : ''}`}</td></tr>`).join('')
        : '<tr><td colspan="5" class="muted">Nothing yet.</td></tr>';

    if (reqLevel) showReqLevel(reqLevel.id);
}

let reqLevel = null;
$('reqLevel').oninput = () => {
    const lvl = levels.find(l => l.name.toLowerCase() === $('reqLevel').value.trim().toLowerCase());
    if (lvl) showReqLevel(lvl.id); else { reqLevel = null; $('reqLevelBox').classList.add('hidden'); }
};

function showReqLevel(id) {
    reqLevel = levels.find(l => l.id === id) || null;
    if (!reqLevel) { $('reqLevelBox').classList.add('hidden'); return; }
    const l = reqLevel;
    $('reqLevelBox').classList.remove('hidden');
    $('reqLevelInfo').innerHTML = `<b>${esc(l.name)}</b>: #${levels.indexOf(l) + 1} | ${l.klp} KLP | by ${esc(l.creator)}
        <span class="req-inline">${l.badges.map(badgeIcon).join(' ')}</span>
        ${opinionsText(l.id) ? `<br><span class="muted" style="font-size:.85em">${esc(opinionsText(l.id))}</span>` : ''}`;
    const have = new Set(l.badges);
    $('reqBadges').innerHTML = requestableBadges.map(([k, b]) => `
        <label><input type="checkbox" value="${esc(k)}" ${have.has(k) ? 'checked' : ''}><img src="../${esc(b.icon)}" alt="">${esc(badgeName(k))}</label>`).join('');
    const mine = me.approvalBadge;
    $('reqMyBadge').innerHTML = mine && BADGES[mine]
        ? `<div class="req-badge-mine">${badgeIcon(mine)} <span>Your approval badge is ${l.badges.includes(mine) ? '<b>on</b>' : 'not on'} this level.</span>
            <button class="hub-button" id="reqMyBadgeBtn">${l.badges.includes(mine) ? 'Take it off' : 'Put it on'}</button></div>`
        : '<p class="muted">You don\'t have an approval badge yet, I\'ll give you one.</p>';
    $('reqMyBadgeBtn')?.addEventListener('click', toggleMyBadge);
    showReqPlacement();
}

function showReqPlacement() {
    const raw = $('reqKlp').value;
    $('reqKlpPlace').textContent = !reqLevel || raw === '' ? '' : placementText(levels, Number(raw), reqLevel, enT);
}
$('reqKlp').oninput = showReqPlacement;

function newRequest(batch, type, value, reason) {
    batch.set(doc(collection(db, 'changeRequests')), {
        type, levelId: reqLevel.id, levelName: reqLevel.name, value,
        before: type === 'klp' ? reqLevel.klp : null, reason: reason.trim().slice(0, 300),
        requestedBy: me.uid, requestedByName: me.name, status: 'pending', createdAt: serverTimestamp(),
    });
}
const alreadyAsked = (type, value) => reqs.some(r => r.status === 'pending' && r.requestedBy === me.uid
    && r.levelId === reqLevel.id && r.type === type && (type === 'klp' || r.value === value));

$('reqKlpSend').onclick = async () => {
    if (!reqLevel) return;
    const value = Math.round(Number($('reqKlp').value));
    if ($('reqKlp').value === '' || !Number.isFinite(value) || value < 0 || value > 10000) return say('reqStatus', 'Type the KLP you think it should have.', 'bad');
    if (value === reqLevel.klp) return say('reqStatus', `It's already at ${value} KLP.`, 'warn');
    if (alreadyAsked('klp')) return say('reqStatus', 'You already asked for this one. Take it back first to change it.', 'warn');
    const batch = writeBatch(db);
    newRequest(batch, 'klp', value, $('reqKlpReason').value);
    logEntry(batch, 'request.make', reqLevel.name, `KLP ${reqLevel.klp} -> ${value}`);
    try { await batch.commit(); $('reqKlp').value = ''; $('reqKlpReason').value = ''; await reload(); say('reqStatus', 'Sent!', 'ok'); }
    catch (err) { say('reqStatus', err.message, 'bad'); }
};

$('reqBadgeSend').onclick = async () => {
    if (!reqLevel) return;
    const ticked = new Set([...$('reqBadges').querySelectorAll('input:checked')].map(i => i.value));
    const had = new Set(reqLevel.badges.filter(k => !k.startsWith('approved_')));
    const add = [...ticked].filter(k => !had.has(k)), remove = [...had].filter(k => !ticked.has(k) && requestableBadges.some(([x]) => x === k));
    const todo = [...add.map(k => ['badge_add', k]), ...remove.map(k => ['badge_remove', k])].filter(([t, k]) => !alreadyAsked(t, k));
    if (!todo.length) return say('reqStatus', 'Tick or untick the badges you want changed first.', 'warn');
    const batch = writeBatch(db);
    for (const [type, k] of todo) newRequest(batch, type, k, $('reqBadgeReason').value);
    logEntry(batch, 'request.make', reqLevel.name, todo.map(([t, k]) => `${t === 'badge_add' ? 'add' : 'remove'} ${badgeName(k)}`).join(', '));
    try { await batch.commit(); $('reqBadgeReason').value = ''; await reload(); say('reqStatus', `Sent ${todo.length} badge request${todo.length > 1 ? 's' : ''}!`, 'ok'); }
    catch (err) { say('reqStatus', err.message, 'bad'); }
};

async function toggleMyBadge() {
    const mine = me.approvalBadge, l = reqLevel;
    if (!mine || !l) return;
    const on = l.badges.includes(mine);
    const batch = writeBatch(db);
    batch.update(doc(db, 'levels', l.id), { badges: on ? arrayRemove(mine) : arrayUnion(mine) });
    logEntry(batch, 'level.badge', l.name, `${on ? 'took off' : 'put on'} ${badgeName(mine)}`);
    try { await batch.commit(); await reload(); say('reqStatus', on ? 'Your badge is off.' : 'Your badge is on.', 'ok'); }
    catch (err) { say('reqStatus', err.message, 'bad'); }
}

$('reqDone').onclick = async (e) => {
    const id = e.target.dataset.cancelReq;
    if (!id || !confirm('Take back this request?')) return;
    try { await deleteDoc(doc(db, 'changeRequests', id)); await reload(); } catch (err) { alert(err.message); }
};

$('reqWaiting').onclick = async (e) => {
    const card = e.target.closest('[data-req]');
    if (!card || e.target.tagName !== 'BUTTON') return;
    const r = reqs.find(x => x.docId === card.dataset.req);
    if (!r) return;
    const approve = e.target.hasAttribute('data-approve-req');
    if (!approve && !e.target.hasAttribute('data-reject-req')) return;
    const reason = card.querySelector('[data-reason]').value.trim();
    const lvl = levels.find(l => l.id === r.levelId);
    if (approve && !$('snapBanner').classList.contains('hidden')
        && !confirm("Today's snapshot isn't saved yet, so History won't show what this changes. Approve anyway?")) return;
    e.target.disabled = true;
    const batch = writeBatch(db);
    const decided = { status: approve ? 'approved' : 'rejected', decidedAt: serverTimestamp(), decidedBy: me.uid, decidedByName: me.name };
    if (!approve && reason) decided.rejectReason = reason.slice(0, 200);
    batch.update(doc(db, 'changeRequests', r.docId), decided);
    const what = r.type === 'klp' ? `KLP ${lvl ? lvl.klp : r.before} -> ${r.value}` : `${r.type === 'badge_add' ? 'add' : 'remove'} ${badgeName(r.value)}`;
    if (approve) {
        const change = r.type === 'klp' ? { klp: r.value }
            : { badges: r.type === 'badge_add' ? arrayUnion(r.value) : arrayRemove(r.value) };
        batch.update(doc(db, 'levels', r.levelId), { ...change, lastUpdatedAt: serverTimestamp() });
        logEntry(batch, 'request.approve', r.levelName, `${what} (asked by ${r.requestedByName})`);
    } else {
        logEntry(batch, 'request.reject', r.levelName, `${what} (asked by ${r.requestedByName})${reason ? `: ${reason}` : ''}`);
    }
    try { await batch.commit(); await reload(); toast(approve ? `Approved: ${r.levelName}, ${what}.` : 'Turned down.'); }
    catch (err) { e.target.disabled = false; alert(err.message); }
};

function say(el, text, kind) { $(el).innerHTML = `<span class="${kind}">${esc(text)}</span>`; }
const flash = (text) => toast(text);
function toast(text) {
    const t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#2f5f3a;border:1px solid #4a8a57;padding:8px 14px;border-radius:6px;z-index:9';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
}

const ROLE_NAME = { owner: 'Owner', listadmin: 'ListAdmin', player: 'Player' };

function drawTeam() {
    const team = players.filter(p => p.role === 'owner' || p.role === 'listadmin')
        .sort((a, b) => (a.role === 'owner' ? -1 : 0) - (b.role === 'owner' ? -1 : 0) || (a.username || '').localeCompare(b.username || ''));
    $('teamRows').innerHTML = team.map(p => `<tr>
        <td>${esc(p.username || '(no name)')}</td><td>${ROLE_NAME[p.role]}</td><td><code>${esc(p.docId)}</code></td>
        <td>${p.role === 'listadmin' ? `<select data-approval="${esc(p.docId)}"><option value="">none</option>${APPROVAL_BADGES.map(([k, b]) =>
            `<option value="${esc(k)}" ${p.approvalBadge === k ? 'selected' : ''}>${esc(b.label.replace(/ Badge$/, ''))}</option>`).join('')}</select>` : ''}</td>
        <td>${p.role === 'listadmin' ? `<button class="small danger" data-demote="${esc(p.docId)}">Remove from team</button>` : ''}</td></tr>`).join('');
    const asked = players.filter(p => p.deleteRequested && !p.legacy);
    $('deleteRequests').innerHTML = asked.length
        ? 'Asked to delete their account (Unlink them): ' + asked.map(p => `<a href="#" data-fix="${esc(p.username)}">${esc(p.username)}</a>`).join(', ')
        : '';
    const retired = players.filter(p => p.retired).map(p => p.username);
    $('retiredList').textContent = retired.length ? retired.join(', ') : 'nobody';
}

$('addAdmin').onclick = async () => {
    const uid = $('adminUid').value.trim(), name = $('adminName').value.trim();
    if (!/^[A-Za-z0-9_]{20,40}$/.test(uid)) return say('teamStatus', "That doesn't look like an account ID. They can find it by signing in to /Admin/.", 'bad');
    if (!name) return say('teamStatus', 'Give them a name (their player name).', 'bad');
    const existing = players.find(p => p.docId === uid);
    if (existing?.role === 'owner') return say('teamStatus', "That's the owner's account.", 'bad');
    const batch = writeBatch(db);
    const record = !existing && players.find(p => p.docId !== uid && (p.username || '').toLowerCase() === name.toLowerCase());
    if (existing) batch.update(doc(db, 'players', uid), { role: 'listadmin' });
    else batch.set(doc(db, 'players', uid), {
        username: record ? record.username : name, role: 'listadmin', legacy: false, claimed: !!record,
        retired: record ? !!record.retired : false,
        beatenLevels: record ? record.beatenLevels : [], verifiedLevels: record ? record.verifiedLevels : [],
        oldCompletions: record ? record.oldCompletions : [], createdAt: serverTimestamp(),
    });
    if (record) batch.delete(doc(db, 'players', record.docId));
    logEntry(batch, 'team.role', existing?.username || record?.username || name, record ? 'made ListAdmin (their player record moved onto their account)' : 'made ListAdmin');
    try {
        await batch.commit();
        $('adminUid').value = ''; $('adminName').value = '';
        await reload();
        say('teamStatus', `${existing?.username || name} is now a ListAdmin.`, 'ok');
    } catch (err) { say('teamStatus', err.message, 'bad'); }
};

$('teamRows').onclick = async (e) => {
    const uid = e.target.dataset.demote;
    const p = players.find(x => x.docId === uid);
    if (!p || !confirm(`Remove ${p.username} from the team? They stay a normal player.`)) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'players', uid), { role: 'player' });
    logEntry(batch, 'team.role', p.username, 'removed from the team');
    try { await batch.commit(); await reload(); say('teamStatus', `${p.username} is a normal player again.`, 'ok'); }
    catch (err) { say('teamStatus', err.message, 'bad'); }
};

$('teamRows').onchange = async (e) => {
    const id = e.target.dataset.approval;
    const p = players.find(x => x.docId === id);
    if (!p) return;
    const badge = e.target.value;
    const taken = players.find(x => x.docId !== id && x.approvalBadge === badge && badge);
    if (taken && !confirm(`${taken.username} already has that badge. Give it to ${p.username} instead?`)) { drawTeam(); return; }
    const batch = writeBatch(db);
    batch.update(doc(db, 'players', id), { approvalBadge: badge });
    if (taken) batch.update(doc(db, 'players', taken.docId), { approvalBadge: '' });
    logEntry(batch, 'team.badge', p.username, badge ? `approval badge: ${BADGES[badge]?.label || badge}` : 'no approval badge');
    try { await batch.commit(); await reload(); say('teamStatus', `Saved ${p.username}'s approval badge.`, 'ok'); }
    catch (err) { say('teamStatus', err.message, 'bad'); }
};

$('toggleRetired').onclick = async () => {
    const p = findPlayer($('retiredPick').value);
    if (!p) return say('teamStatus', 'Pick a player from the list.', 'bad');
    const batch = writeBatch(db);
    batch.update(doc(db, 'players', p.docId), { retired: !p.retired });
    logEntry(batch, 'player.retired', p.username, p.retired ? 'back on the leaderboard' : 'retired');
    try { await batch.commit(); $('retiredPick').value = ''; await reload(); say('teamStatus', `${p.username} is ${p.retired ? 'back on the leaderboard' : 'now retired'}.`, 'ok'); }
    catch (err) { say('teamStatus', err.message, 'bad'); }
};

function pickAccount() {
    const p = findPlayer($('fixPick').value);
    if (!p) { say('fixStatus', 'Pick a player from the list.', 'bad'); return null; }
    if (p.role === 'owner' || p.docId === me.uid) { say('fixStatus', "That's your own account.", 'bad'); return null; }
    return p;
}

$('deleteRequests').onclick = (e) => {
    if (!e.target.dataset.fix) return;
    e.preventDefault();
    $('fixPick').value = e.target.dataset.fix;
};

$('unlinkAccount').onclick = async () => {
    const p = pickAccount();
    if (!p) return;
    const lv = p.beatenLevels.length + p.verifiedLevels.length;
    if (p.legacy) return say('fixStatus', `${p.username} is already an old record nobody has claimed.`, 'bad');
    if (!p.claimed && !lv) return say('fixStatus', `${p.username} has no levels: use Delete account instead.`, 'bad');
    if (!confirm(`Unlink ${p.username} from their account? Their levels go back to an unclaimed record.`)) return;
    let id = slug(p.username);
    while (players.some(x => x.docId === id)) id += '-2';
    const { docId, claimedAt, deleteRequested, googleEmail, discordId, ...data } = p;
    const batch = writeBatch(db);
    batch.set(doc(db, 'players', id), { ...data, role: 'player', legacy: true, claimed: false });
    batch.delete(doc(db, 'players', p.docId));
    batch.set(doc(db, 'usernames', p.username.trim().toLowerCase()), { uid: id });
    batch.delete(doc(db, 'claims', p.docId));
    logEntry(batch, 'account.unlink', p.username, `was linked to ${p.docId}`);
    try { await batch.commit(); $('fixPick').value = ''; await reload(); say('fixStatus', `${p.username} is an unclaimed record again.`, 'ok'); }
    catch (err) { say('fixStatus', err.message, 'bad'); }
};

$('deleteAccount').onclick = async () => {
    const p = pickAccount();
    if (!p) return;
    if (p.claimed) return say('fixStatus', `${p.username} is a claimed record from the list. Use Unlink instead.`, 'bad');
    if (p.legacy) return say('fixStatus', `${p.username} is an old record nobody has claimed: nothing to fix.`, 'bad');
    if (p.beatenLevels.length || p.verifiedLevels.length) return say('fixStatus', `${p.username} has levels. Remove them first if you really mean it.`, 'bad');
    if (!confirm(`Delete the account ${p.username} ? They can sign in again and pick a different name.`)) return;
    const batch = writeBatch(db);
    batch.delete(doc(db, 'players', p.docId));
    batch.delete(doc(db, 'usernames', p.username.trim().toLowerCase()));
    batch.delete(doc(db, 'claims', p.docId));
    logEntry(batch, 'account.delete', p.username, `account ${p.docId}`);
    try { await batch.commit(); $('fixPick').value = ''; await reload(); say('fixStatus', `Deleted ${p.username}.`, 'ok'); }
    catch (err) { say('fixStatus', err.message, 'bad'); }
};

function download(name, rows) {
    const cell = (v) => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    const blob = new Blob([rows.map(r => r.map(cell).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('csvLevels').onclick = () => download(`mainlist_snapshot_${today()}.csv`, [
    ['Date', 'Rank', 'Level Name', 'Creator', 'Verifier', 'KLP', 'Badges', 'ID'],
    ...levels.map((l, i) => [today(), i + 1, l.name, l.creator || '', l.verifier || '', l.klp, l.badges.join('; '), l.id]),
]);
$('csvPlayers').onclick = () => {
    const byId = new Map(levels.map(l => [l.id, l]));
    const rows = players.filter(p => p.username).map(p => {
        const ver = p.verifiedLevels.map(id => byId.get(id)).filter(Boolean);
        const vic = p.beatenLevels.map(id => byId.get(id)).filter(Boolean);
        const all = [...ver, ...vic];
        return { p, ver, vic, plp: calculatePlayerScore(all), klp: all.reduce((s, l) => s + l.klp, 0) };
    }).filter(r => r.ver.length || r.vic.length).sort((a, b) => b.plp - a.plp);
    download(`player_data_${today()}.csv`, [
        ['Date', 'Name', 'Role', 'Retired', 'PLP', 'KLP', 'Verifications', 'Victors'],
        ...rows.map(r => [today(), r.p.username, ROLE_NAME[r.p.role] || 'Player', r.p.retired ? 'yes' : '', Math.round(r.plp), r.klp,
            r.ver.map(l => `${l.name}(${l.klp})`).join('; '), r.vic.map(l => `${l.name}(${l.klp})`).join('; ')]),
    ]);
};

async function reserveNames() {
    const snap = await getDocs(collection(db, 'usernames')).catch(() => null);
    if (!snap) return;
    const known = new Set(players.map(p => (p.username || '').trim().toLowerCase()));
    const creatorBatch = writeBatch(db);
    let made = 0;
    for (const l of levels) for (const c of splitNames(l.creator)) {
        if (known.has(c.toLowerCase()) || c.includes('/')) continue;
        known.add(c.toLowerCase());
        let id = slug(c);
        while (players.some(x => x.docId === id)) id += '-2';
        const rec = { username: c, role: 'player', legacy: true, claimed: false, retired: false,
            beatenLevels: [], verifiedLevels: [], oldCompletions: [], createdAt: serverTimestamp() };
        creatorBatch.set(doc(db, 'players', id), rec);
        players.push({ docId: id, ...rec });
        made++;
    }
    if (made) await creatorBatch.commit().catch(err => console.warn('Could not add creator records:', err));
    const taken = new Map(snap.docs.map(d => [d.id, d.data().uid]));
    const ids = new Set(players.map(p => p.docId));
    const batch = writeBatch(db);
    let n = 0;
    for (const p of players) {
        if (!p.username) continue;
        const key = p.username.trim().toLowerCase();
        if (key.includes('/')) continue;
        const holder = taken.get(key);
        if (holder === p.docId || (holder && ids.has(holder))) continue;
        batch.set(doc(db, 'usernames', key), { uid: p.docId });
        taken.set(key, p.docId);
        n++;
    }
    if (n) await batch.commit().catch(err => console.warn('Could not reserve player names:', err));
}

function drawClaims() {
    const pending = claims.filter(c => c.status === 'pending');
    const tab = document.querySelector('[data-tab="claims"]');
    if (tab) tab.textContent = pending.length ? `Claims (${pending.length})` : 'Claims';
    $('claimRows').innerHTML = pending.length ? pending.map(c => {
        const rec = players.find(p => p.docId === c.legacyPlayerId);
        const lv = rec ? rec.beatenLevels.length + rec.verifiedLevels.length : 0;
        const made = rec ? levels.filter(l => splitNames(l.creator).some(n => n.toLowerCase() === rec.username.toLowerCase())).length : 0;
        const what = [`${lv} beaten/verified`, made ? `${made} created` : ''].filter(Boolean).join(', ');
        return `<tr><td>${esc(c.usernameRequested)}<br><span class="muted">${rec ? what : 'record no longer exists'}</span></td>
            <td>${esc(c.discordNote)}</td><td><b>${esc(c.code || '-')}</b></td><td class="muted">${esc(c.uid)}</td><td class="nowrap">${esc(when(c.createdAt))}</td>
            <td class="nowrap"><button class="small" data-approve="${esc(c.uid)}" ${rec ? '' : 'disabled'}>Approve</button>
                <button class="small danger" data-reject="${esc(c.uid)}">Turn down</button></td></tr>`;
    }).join('') : '<tr><td colspan="6" class="muted">No claims waiting.</td></tr>';
    const done = claims.filter(c => c.status !== 'pending').sort((a, b) => String(b.decidedAt?.seconds || 0).localeCompare(String(a.decidedAt?.seconds || 0)));
    $('claimDone').innerHTML = done.map(c => `<li>${esc(c.usernameRequested)}: ${c.status === 'approved' ? 'approved' : 'turned down'} (${esc(c.discordNote)})</li>`).join('') || '<li class="muted">None yet.</li>';
}

$('claimRows').onclick = async (e) => {
    const approve = e.target.dataset.approve, reject = e.target.dataset.reject;
    const c = claims.find(x => x.uid === (approve || reject));
    if (!c) return;
    const batch = writeBatch(db);
    if (approve) {
        const rec = players.find(p => p.docId === c.legacyPlayerId);
        if (!rec || !confirm(`Give ${rec.username}'s record to the Discord account ${c.discordNote}?`)) return;
        const { docId, googleEmail, discordId, ...data } = rec;
        batch.set(doc(db, 'players', c.uid), {
            ...data, legacy: false, claimed: true, role: data.role === 'listadmin' ? 'listadmin' : 'player',
            claimedAt: serverTimestamp(),
        });
        batch.delete(doc(db, 'players', rec.docId));
        batch.set(doc(db, 'usernames', rec.username.trim().toLowerCase()), { uid: c.uid });
        batch.update(doc(db, 'claims', c.uid), { status: 'approved', decidedAt: serverTimestamp(), decidedBy: me.name });
        logEntry(batch, 'claim.approve', rec.username, `linked to Discord ${c.discordNote}`);
    } else {
        if (!confirm(`Turn down the claim for ${c.usernameRequested}?`)) return;
        batch.update(doc(db, 'claims', c.uid), { status: 'rejected', decidedAt: serverTimestamp(), decidedBy: me.name });
        logEntry(batch, 'claim.reject', c.usernameRequested, `from Discord ${c.discordNote}`);
    }
    try { await batch.commit(); await reload(); toast(approve ? 'Claim approved.' : 'Claim turned down.'); }
    catch (err) { alert(err.message); }
};
