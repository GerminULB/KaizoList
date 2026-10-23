import { db } from '../firebase-config.js';
import { collection, doc, getDoc, getDocs, query, where, writeBatch, updateDoc, deleteDoc, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { watchAccount, signIn } from './auth.js';
import { t, tn } from './i18n.js';
import { carbo, hatOf } from './carbo.js';
import { loadPlayers, loadLevels } from './data.js';
import { BADGES, getSpecialBadgeByRank } from './badge.js';
import { calculatePlayerScore } from '../score.js';

export const COMMENT_MAX = 500;
const COOLDOWN_MS = 30 * 1000;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ms = (ts) => ts?.toMillis ? ts.toMillis() : (ts?.seconds ? ts.seconds * 1000 : (typeof ts === 'number' ? ts : 0));

function ago(ts) {
    const m = ms(ts);
    if (!m) return t('comments_just_now');
    const s = Math.max(0, (Date.now() - m) / 1000);
    if (s < 60) return t('comments_just_now');
    if (s < 3600) return tn('comments_min_ago', Math.floor(s / 60));
    if (s < 86400) return tn('comments_hours_ago', Math.floor(s / 3600));
    if (s < 86400 * 30) return tn('comments_days_ago', Math.floor(s / 86400));
    return new Date(m).toLocaleDateString();
}

const LINK_RE = /(?<![^\s(\[])(?:(?:https?:\/\/)?(?:www\.)?kaizolist\.com|https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)?\/(?:LevelDetails\.html\?(?:id=(\d{1,12})|name=([^\s#&<>"']+))|PlayerDetails\.html\?name=([^\s#&<>"']+))[^\s<>"']*|\b(lvl|l|p)!\[([^\]\n]{1,60})\]/gi;
const MAX_CARDS = 3;
const isLevel = (l, ref) => ref.byName ? String(l.name).toLowerCase() === ref.key.toLowerCase() : String(l.id) === ref.key;
const MAX_CARD_BADGES = 6;

function decodeName(raw) {
    try { return decodeURIComponent(raw.replace(/\+/g, ' ')); } catch { return raw; }
}

function linkify(text, labelFor = () => null) {
    let html = '', last = 0;
    const refs = [];
    const same = (a, b) => a.kind === b.kind && String(a.label || a.key).toLowerCase() === String(b.label || b.key).toLowerCase();
    for (const m of text.matchAll(LINK_RE)) {
        let url = m[0];
        const code = m[4] && m[4].toLowerCase();
        const trail = !code && url.match(/[.,!?;:)\]]+$/);
        if (trail) url = url.slice(0, -trail[0].length);
        const val = code ? m[5].trim() : '';
        const ref = code === 'p' ? { kind: 'player', key: val }
            : code ? (/^\d+$/.test(val) ? { kind: 'level', key: val } : { kind: 'level', key: val, byName: true })
            : m[1] ? { kind: 'level', key: m[1] } : m[2] ? { kind: 'level', key: decodeName(m[2]), byName: true } : { kind: 'player', key: decodeName(m[3]) };
        const label = labelFor(ref);
        ref.label = label;
        const hasCard = label && (refs.some(r => same(r, ref)) || (refs.length < MAX_CARDS && refs.push(ref)));
        const edge = code ? text.trim() === url
            : !text.slice(0, m.index).trim() || !text.slice(m.index + url.length).replace(/^[.,!?;:)\]]+/, '').trim();
        let link = '';
        if (code && !label) link = esc(url);
        else if (!hasCard || !edge) {
            const href = ref.kind === 'player' ? `/PlayerDetails.html?name=${encodeURIComponent(ref.key)}`
                : ref.byName ? `/LevelDetails.html?name=${encodeURIComponent(ref.key)}` : `/LevelDetails.html?id=${ref.key}`;
            link = `<a class="comment-link" href="${esc(href)}" title="${esc(url)}">${esc(label || url)}</a>`;
        }
        html += esc(text.slice(last, m.index)) + link;
        last = m.index + url.length;
    }
    html = (html + esc(text.slice(last))).replace(/[ \t]{2,}/g, ' ').replace(/^\s+|\s+$/g, '');
    return { html, refs };
}

const badgeImgs = (keys) => keys.slice(0, MAX_CARD_BADGES)
    .map(k => BADGES[k] ? `<img src="/${esc(BADGES[k].icon)}" alt="" title="${esc(BADGES[k].label)}">` : '').join('')
    + (keys.length > MAX_CARD_BADGES ? `<span class="cc-more">+${keys.length - MAX_CARD_BADGES}</span>` : '');

function playerStats(levels, players) {
    const byId = new Map(levels.map(l => [String(l.id), l]));
    const rankOf = new Map(levels.map((l, i) => [String(l.id), i + 1]));
    const stats = new Map();
    for (const p of players) {
        if (!p.username) continue;
        const done = [...p.verifiedLevels.map(id => [id, 'Verification']), ...p.beatenLevels.map(id => [id, 'Victor'])]
            .map(([id, type]) => ({ l: byId.get(String(id)), type })).filter(x => x.l);
        const badges = done.map(x => ({ key: getSpecialBadgeByRank(rankOf.get(String(x.l.id))), rank: rankOf.get(String(x.l.id)) }))
            .filter(b => b.key && BADGES[b.key]).sort((a, b) => a.rank - b.rank).map(b => b.key);
        stats.set(p.username.toLowerCase(), {
            name: p.username, docId: p.docId, retired: p.retired,
            plp: done.length ? calculatePlayerScore(done.map(x => ({ name: x.l.name, klp: x.l.klp, type: x.type }))) : 0,
            badges,
        });
    }
    let rank = 0;
    [...stats.values()].filter(s => !s.retired && s.plp > 0).sort((a, b) => b.plp - a.plp).forEach(s => { s.rank = ++rank; });
    return stats;
}

export function mountCommentDrawer(section) {
    if (!section || section.dataset.drawer) return;
    section.dataset.drawer = '1';
    document.body.appendChild(section);
    section.classList.add('comments-drawer');
    section.classList.remove('hidden');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'account-close comments-close';
    close.setAttribute('aria-label', 'Close');
    section.prepend(close);

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'comments-tab board-9slice';
    tab.innerHTML = `<span class="kl-ico kl-ico-comment" role="img" aria-label=""></span><span class="comments-tab-label">${esc(t('comments_title'))}</span><span class="comments-tab-count hidden"></span>`;
    document.body.appendChild(tab);

    const shade = document.createElement('div');
    shade.className = 'comments-shade';
    document.body.appendChild(shade);

    const setOpen = (open) => {
        document.body.classList.toggle('comments-open', open);
        if (open) setTimeout(() => section.querySelector('.comments-compose textarea')?.focus({ preventScroll: true }), 250);
    };
    tab.onclick = () => setOpen(!document.body.classList.contains('comments-open'));
    close.onclick = () => setOpen(false);
    shade.onclick = () => setOpen(false);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    if (location.hash === '#comments') setOpen(true);
}

export function mountComments(box, target, targetId, label) {
    if (!box || !targetId) return;
    targetId = String(targetId);
    let state = { user: null, player: null };
    let comments = [];
    let lastPost = 0;
    let editing = null;
    let replying = null;

    box.innerHTML = `
        <div class="comments-compose"></div>
        <div class="comments-list"><p class="muted"><span class="kl-loading"></span> ${esc(t('comments_loading'))}</p></div>`;
    const compose = box.querySelector('.comments-compose');
    const list = box.querySelector('.comments-list');

    let looks = new Map();
    let allLevels = [], stats = new Map();
    async function load() {
        try {
            const [lv, ps] = await Promise.all([loadLevels(), loadPlayers()]);
            const ce = await import('./enjoyment.js').then(m => m.loadCreatorEnjoyment(lv, ps)).catch(() => null);
            looks = new Map(ps.map(p => [p.docId, hatOf(p, lv, ce)]));
            allLevels = lv;
            stats = playerStats(lv, ps);
        } catch { }
        try {
            const snap = await getDocs(query(collection(db, 'comments'), where('target', '==', target), where('targetId', '==', targetId)));
            comments = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .filter(c => c.target === target && c.targetId === targetId)
                .sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
        } catch (err) { console.error('Could not load comments:', err); comments = []; }
        drawList();
    }

    let locked = false, banned = false;
    async function loadGates() {
        const [lock, ban] = await Promise.all([
            getDoc(doc(db, 'meta', 'lockdown')).catch(() => null),
            state.user ? getDoc(doc(db, 'bans', state.user.uid)).catch(() => null) : null,
        ]);
        locked = !!lock?.exists() && lock.data().comments === true;
        banned = !!ban?.exists();
        drawCompose();
    }

    const isTeam = () => ['owner', 'listadmin'].includes(state.player?.role);

    function card(ref) {
        if (ref.kind === 'level') {
            const i = allLevels.findIndex(l => isLevel(l, ref));
            if (i < 0) return '';
            const l = allLevels[i];
            return `<a class="comment-card board-9slice sm" href="/LevelDetails.html?id=${encodeURIComponent(l.id)}">
                <img class="cc-thumb" src="/thumbs/${encodeURIComponent(l.id)}.png" alt="" loading="lazy" onerror="this.remove()">
                <span class="cc-rank">#${i + 1}</span><span class="cc-name">${esc(l.name)}</span><span class="cc-score">${esc(l.klp)} KLP</span>
                <span class="cc-badges">${badgeImgs(l.badges || [])}</span></a>`;
        }
        const p = stats.get(ref.key.toLowerCase());
        if (!p) return '';
        return `<a class="comment-card board-9slice sm" href="/PlayerDetails.html?name=${encodeURIComponent(p.name)}">
            <span class="cc-rank">${p.rank ? `#${p.rank}` : '-'}</span>
            <span class="cc-name"><span class="cc-carbo">${carbo(looks.get(p.docId) || '', 1)}</span>${esc(p.name)}</span>
            <span class="cc-score">${Math.round(p.plp)} PLP</span>
            <span class="cc-badges">${badgeImgs(p.badges)}</span></a>`;
    }
    function commentText(text) {
        const { html, refs } = linkify(String(text || ''), (ref) => ref.kind === 'level'
            ? allLevels.find(l => isLevel(l, ref))?.name
            : stats.get(ref.key.toLowerCase())?.name);
        const cards = refs.map(card).join('');
        return `${html ? `<div class="comment-text">${html}</div>` : ''}${cards ? `<div class="comment-cards">${cards}</div>` : ''}`;
    }

    function drawList() {
        document.querySelectorAll('.comments-count').forEach(el => { el.textContent = comments.length ? `(${comments.length})` : ''; });
        document.querySelectorAll('.comments-tab-count').forEach(el => {
            el.textContent = comments.length; el.classList.toggle('hidden', !comments.length);
        });
        const ids = new Set(comments.map(c => c.id));
        const tops = comments.filter(c => !c.replyTo || !ids.has(c.replyTo));
        const repliesOf = (id) => comments.filter(c => c.replyTo === id).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
        list.innerHTML = comments.length ? tops.map(c => {
            const replies = repliesOf(c.id);
            const box = replying && replying.root === c.id ? `
                <div class="comment-reply-box">
                    <textarea class="account-input comments-text" maxlength="${COMMENT_MAX}" data-reply-text placeholder="${esc(t('comments_reply_placeholder', { name: replying.name }))}">${esc(replying.prefill)}</textarea>
                    <div class="comments-actions">
                        <button type="button" class="hub-button" data-reply-post>${esc(t('comments_post'))}</button>
                        <button type="button" class="account-link" data-reply-cancel>${esc(t('comments_cancel'))}</button>
                        <span class="comments-msg" data-reply-msg></span>
                    </div>
                </div>` : '';
            return `<div class="comment-thread">${commentHtml(c)}${replies.length || box ? `<div class="comment-replies">${replies.map(commentHtml).join('')}${box}</div>` : ''}</div>`;
        }).join('') : `<p class="muted">${esc(t('comments_none'))}</p>`;
        const reply = list.querySelector('[data-reply-text]');
        if (reply) { reply.focus(); reply.setSelectionRange(reply.value.length, reply.value.length); }
    }

    function commentHtml(c) {
        const mine = state.user && c.playerUid === state.user.uid;
        const canDelete = mine || isTeam();
        if (editing === c.id) return `
            <div class="comment" data-id="${esc(c.id)}">
                <textarea class="account-input comments-text" maxlength="${COMMENT_MAX}" data-edit-text>${esc(c.text)}</textarea>
                <div class="comments-actions">
                    <button type="button" class="hub-button" data-save>${esc(t('comments_save'))}</button>
                    <button type="button" class="account-link" data-cancel>${esc(t('comments_cancel'))}</button>
                </div>
            </div>`;
        return `
            <div class="comment${c.replyTo ? ' is-reply' : ''}" data-id="${esc(c.id)}">
                <a class="comment-carbo" href="/PlayerDetails.html?name=${encodeURIComponent(c.username)}" tabindex="-1">${carbo(looks.get(c.playerUid) || '', 2)}</a>
                <div class="comment-body">
                <div class="comment-head">
                    <a class="comment-author" href="/PlayerDetails.html?name=${encodeURIComponent(c.username)}">${esc(c.username)}</a>
                    <span class="comment-time" title="${esc(new Date(ms(c.createdAt) || Date.now()).toLocaleString())}">${esc(ago(c.createdAt))}</span>
                    ${c.editedAt ? `<span class="comment-edited" title="${esc(new Date(ms(c.editedAt) || Date.now()).toLocaleString())}">${esc(t('comments_edited'))}</span>` : ''}
                    <span class="comment-tools">
                        ${mine ? `<button type="button" class="kl-iconbtn" data-edit title="${esc(t('comments_edit'))}"><span class="kl-ico kl-ico-edit" role="img" aria-label="${esc(t('comments_edit'))}"></span></button>` : ''}
                        ${canDelete ? `<button type="button" class="kl-iconbtn" data-delete title="${esc(t('comments_delete'))}"><span class="kl-ico kl-ico-delete" role="img" aria-label="${esc(t('comments_delete'))}"></span></button>` : ''}
                    </span>
                </div>
                ${commentText(c.text)}
                ${state.player ? `<button type="button" class="account-link comment-reply" data-reply>${esc(t('comments_reply'))}</button>` : ''}
                </div>
            </div>`;
    }

    function drawCompose() {
        if (!state.user || !state.player) {
            compose.innerHTML = `<p class="comments-note">${esc(t(state.user ? 'comments_need_name' : 'comments_need_signin'))}
                <button type="button" class="account-link" data-gate>${esc(t(state.user ? 'account_pick_name_short' : 'account_sign_in'))}</button></p>`;
            compose.querySelector('[data-gate]').onclick = async () => {
                if (state.user) return document.getElementById('account-btn')?.click();
                signIn();
            };
            return;
        }
        if (banned || (locked && !isTeam())) {
            compose.innerHTML = `<p class="comments-note">${esc(t(banned ? 'comments_banned' : 'comments_locked'))}</p>`;
            return;
        }
        compose.innerHTML = `
            <textarea class="account-input comments-text" maxlength="${COMMENT_MAX}" placeholder="${esc(t('comments_placeholder', { name: state.player.username }))}"></textarea>
            <div class="comments-actions">
                <button type="button" class="hub-button" data-post>${esc(t('comments_post'))}</button>
                <span class="comments-counter">0 / ${COMMENT_MAX}</span>
                <span class="comments-msg"></span>
            </div>
            <p class="comments-tip">${esc(t('comments_tip'))}</p>`;
        const text = compose.querySelector('textarea');
        text.oninput = () => { compose.querySelector('.comments-counter').textContent = `${text.value.length} / ${COMMENT_MAX}`; };
        compose.querySelector('[data-post]').onclick = async () => {
            if (await post(text, compose.querySelector('[data-post]'), compose.querySelector('.comments-msg'))) { text.value = ''; text.oninput(); }
        };
    }

    async function post(text, btn, msg, replyTo = null) {
        const body = text.value.trim();
        if (!body) { msg.textContent = t('comments_empty'); return false; }
        const wait = Math.ceil((lastPost + COOLDOWN_MS - Date.now()) / 1000);
        if (wait > 0) { msg.textContent = tn('comments_wait', wait); return false; }
        btn.disabled = true;
        const batch = writeBatch(db);
        batch.set(doc(collection(db, 'comments')), {
            target, targetId, playerUid: state.user.uid, username: state.player.username,
            text: body.slice(0, COMMENT_MAX), createdAt: serverTimestamp(), ...(replyTo ? { replyTo } : {}),
        });
        batch.update(doc(db, 'players', state.user.uid), { lastCommentAt: serverTimestamp() });
        try {
            await batch.commit();
        } catch (err) {
            if (err.code === 'permission-denied') {
                await loadGates();
                msg.textContent = banned ? t('comments_banned') : locked && !isTeam() ? t('comments_locked') : tn('comments_wait', 30);
            } else msg.textContent = err.message;
            return false;
        } finally {
            btn.disabled = false;
        }
        lastPost = Date.now();
        msg.textContent = '';
        if (replyTo) replying = null;
        await load().catch(() => { });
        return true;
    }

    list.addEventListener('click', async (e) => {
        if (e.target.hasAttribute('data-reply-cancel')) { replying = null; drawList(); return; }
        if (e.target.hasAttribute('data-reply-post')) {
            await post(list.querySelector('[data-reply-text]'), e.target, list.querySelector('[data-reply-msg]'), replying.root);
            return;
        }
        const el = e.target.closest('[data-id]');
        if (!el) return;
        const c = comments.find(x => x.id === el.dataset.id);
        if (!c) return;
        if (e.target.hasAttribute('data-reply')) {
            const root = c.replyTo && comments.some(x => x.id === c.replyTo) ? c.replyTo : c.id;
            replying = { root, name: c.username, prefill: c.replyTo ? `@${c.username} ` : '' };
            drawList();
            return;
        }
        if (e.target.hasAttribute('data-edit')) { editing = c.id; drawList(); list.querySelector('[data-edit-text]')?.focus(); return; }
        if (e.target.hasAttribute('data-cancel')) { editing = null; drawList(); return; }
        if (e.target.hasAttribute('data-save')) {
            const body = list.querySelector('[data-edit-text]').value.trim();
            if (!body) return;
            if (body === c.text) { editing = null; drawList(); return; }
            try {
                await updateDoc(doc(db, 'comments', c.id), { text: body.slice(0, COMMENT_MAX), editedAt: serverTimestamp() });
                editing = null;
                await load();
            } catch (err) { alert(err.message); }
            return;
        }
        if (e.target.hasAttribute('data-delete')) {
            const mine = c.playerUid === state.user?.uid;
            if (!confirm(t(mine ? 'comments_delete_confirm' : 'comments_delete_other', { name: c.username }))) return;
            try {
                if (mine) await deleteDoc(doc(db, 'comments', c.id));
                else {
                    const batch = writeBatch(db);
                    batch.delete(doc(db, 'comments', c.id));
                    batch.set(doc(collection(db, 'changeLog')), {
                        at: serverTimestamp(), by: state.user.uid, byName: state.player.username, action: 'comment.delete',
                        target: c.username, details: `on ${label || targetId}: "${c.text.slice(0, 120)}${c.text.length > 120 ? '...' : ''}"`,
                    });
                    await batch.commit();
                }
                await load();
            } catch (err) { alert(err.message); }
        }
    });

    watchAccount((s) => {
        state = s;
        lastPost = ms(s.player?.lastCommentAt);
        drawCompose();
        drawList();
        loadGates();
    });
    load();
}
