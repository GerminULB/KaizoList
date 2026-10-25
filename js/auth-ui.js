import { t } from './i18n.js';
import { watchAccount, signIn, signOutUser, checkName, createAccount, fileClaim, cancelClaim, NAME_RULE,
    deleteMyAccount, cancelDeleteRequest, hasLevels } from './auth.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROOT = '/';
const OWNER_DISCORD = 'hypergermented';
let state = { user: null };
let ready = false;
const LAST_NAME = 'kl_last_name';
const lastName = () => { try { return localStorage.getItem(LAST_NAME) || ''; } catch { return ''; } };

function mountButton() {
    const menu = document.querySelector('.settings-menu');
    if (!menu || document.getElementById('account-box')) return;
    const box = document.createElement('div');
    box.id = 'account-box';
    box.innerHTML = `<button type="button" id="account-btn" class="account-btn loading" aria-busy="true">${esc(lastName() || '...')}</button>
        <div id="account-menu" class="account-menu panel-9slice hidden"></div>`;
    menu.appendChild(box);
    document.getElementById('account-btn').addEventListener('click', onButton);
    document.addEventListener('click', (e) => { if (!box.contains(e.target)) closeMenu(); });
}

const closeMenu = () => document.getElementById('account-menu')?.classList.add('hidden');

function drawButton() {
    const btn = document.getElementById('account-btn');
    if (!btn) return;
    btn.classList.remove('needs-attention', 'loading');
    btn.removeAttribute('aria-busy');
    try { if (state.player) localStorage.setItem(LAST_NAME, state.player.username); else localStorage.removeItem(LAST_NAME); } catch { }
    if (!state.user) btn.textContent = t('account_sign_in');
    else if (state.player) btn.textContent = state.player.username;
    else if (state.claim?.status === 'pending') btn.textContent = t('account_claim_pending_short');
    else { btn.textContent = t('account_pick_name_short'); btn.classList.add('needs-attention'); }
}

async function onButton() {
    if (!ready) return;
    if (!state.user) {
        signIn();
        return;
    }
    if (!state.player) return openWindow();
    const m = document.getElementById('account-menu');
    const isTeam = state.player.role === 'owner' || state.player.role === 'listadmin';
    m.innerHTML = `
        <a href="${ROOT}PlayerDetails.html?name=${encodeURIComponent(state.player.username)}"><span class="kl-ico kl-menuico kl-ico-profile"></span>${esc(t('account_my_profile'))}</a>
        ${isTeam ? `<a href="${ROOT}Admin/"><span class="kl-ico kl-menuico kl-ico-edit"></span>${esc(t('account_admin_panel'))}</a>` : ''}
        ${pushFlagged() ? `<button type="button" id="account-push"><span class="kl-ico kl-menuico kl-ico-comment"></span>${esc(t('push_menu'))}</button>` : ''}
        <button type="button" id="account-signout"><span class="kl-ico kl-menuico kl-ico-logout"></span>${esc(t('account_sign_out'))}</button>
        ${state.player.role === 'owner' ? '' : `<button type="button" id="account-delete" class="account-danger"><span class="kl-ico kl-menuico kl-ico-delete"></span>${esc(t('account_delete'))}</button>`}`;
    m.classList.toggle('hidden');
    document.getElementById('account-signout').onclick = () => { closeMenu(); signOutUser(); };
    document.getElementById('account-push')?.addEventListener('click', () => { closeMenu(); showPush(); });
    if (document.getElementById('account-delete')) document.getElementById('account-delete').onclick = () => { closeMenu(); openWindow(); showDelete(); };
}

let overlay = null;

function ensureOverlay() {
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'account-overlay hidden';
        overlay.innerHTML = '<div class="account-window panel-9slice"></div>';
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeWindow(); });
        document.body.appendChild(overlay);
    }
}

function openWindow() {
    ensureOverlay();
    overlay.classList.remove('hidden');
    if (state.claim) showClaimStatus(); else showPickName();
}
function closeWindow() {
    if (!overlay) return;
    overlay.classList.add('hidden');
    if (overlay.classList.contains('egg')) {
        overlay.classList.remove('egg', 'egg-in');
        document.documentElement.classList.remove('kl-egg-lock');
        eggRunning = false;
        sfx('end');
        const a = ambient;
        ambient = null;
        fadeTo(a, 0, 800, () => a?.pause());
        document.querySelectorAll('.kl-red-engulf').forEach(red => { red.classList.add('out'); setTimeout(() => red.remove(), 900); });
    }
}
const win = () => overlay.querySelector('.account-window');

function frame(title, body) {
    win().innerHTML = `<button type="button" class="account-close" aria-label="Close">X</button>
        <h2>${esc(title)}</h2>${body}`;
    win().querySelector('.account-close').onclick = closeWindow;
}

function showPickName(prefill = '', message = '') {
    frame(t('account_welcome_title'), `
        <p>${esc(t('account_pick_name_text'))}</p>
        <input id="acct-name" class="account-input" maxlength="24" value="${esc(prefill)}" placeholder="${esc(t('account_name_placeholder'))}">
        <p class="account-hint">${esc(t('account_name_rule'))}</p>
        <p id="acct-msg" class="account-msg">${message}</p>
        <div class="account-actions">
            <button type="button" id="acct-next" class="hub-button">${esc(t('account_continue'))}</button>
            <button type="button" id="acct-out" class="account-link">${esc(t('account_sign_out'))}</button>
        </div>`);
    const input = win().querySelector('#acct-name');
    input.focus();
    input.onkeydown = (e) => { if (e.key === 'Enter') next(); };
    win().querySelector('#acct-next').onclick = next;
    win().querySelector('#acct-out').onclick = () => { closeWindow(); signOutUser(); };

    async function next() {
        const name = input.value.trim();
        const msg = win().querySelector('#acct-msg');
        if (!NAME_RULE.test(name)) { msg.textContent = t('account_name_invalid'); return; }
        win().querySelector('#acct-next').disabled = true;
        msg.textContent = t('account_checking');
        try {
            const r = await checkName(name);
            if (r.status === 'free') return makeAccount(name);
            if (r.status === 'claimable') return showClaimOffer(r.record);
            msg.textContent = t('account_name_taken');
        } catch (err) { msg.textContent = err.message; }
        win().querySelector('#acct-next').disabled = false;
    }
}

async function makeAccount(name) {
    try {
        await createAccount(state.user, name);
        state = { user: state.user, player: { docId: state.user.uid, username: name, role: 'player' } };
        drawButton();
        frame(t('account_done_title'), `<p>${esc(t('account_done_text', { name }))}</p>
            <div class="account-actions"><button type="button" class="hub-button" id="acct-ok">${esc(t('account_ok'))}</button></div>`);
        win().querySelector('#acct-ok').onclick = closeWindow;
    } catch (err) {
        showPickName(name, esc(t('account_name_taken')));
    }
}

async function showClaimOffer(record) {
    const done = (record.beatenLevels?.length || 0) + (record.verifiedLevels?.length || 0);
    let created = 0;
    try {
        const { loadLevels } = await import('./data.js');
        const key = record.username.trim().toLowerCase();
        created = (await loadLevels()).filter(l => String(l.creator || '').split(',').some(c => c.trim().toLowerCase() === key)).length;
    } catch { }
    const one = (n, key) => t(n === 1 ? key + '_one' : key, { count: n });
    const details = [done ? one(done, 'account_claim_done') : '', created ? one(created, 'account_claim_created') : ''].filter(Boolean).join(', ');
    frame(t('account_claim_title'), `
        <p>${t('account_claim_text', { name: `<b>${esc(record.username)}</b>`, details: esc(details || t('account_claim_on_list')) })}</p>
        <p id="acct-msg" class="account-msg"></p>
        <div class="account-actions">
            <button type="button" id="acct-claim" class="hub-button">${esc(t('account_claim_send'))}</button>
            <button type="button" id="acct-back" class="account-link">${esc(t('account_claim_not_me'))}</button>
        </div>`);
    win().querySelector('#acct-back').onclick = () => showPickName('');
    win().querySelector('#acct-claim').onclick = async () => {
        win().querySelector('#acct-claim').disabled = true;
        try {
            const code = await fileClaim(state.user, record);
            state = { user: state.user, player: null, claim: { status: 'pending', usernameRequested: record.username, code } };
            drawButton();
            showClaimStatus();
        } catch (err) {
            win().querySelector('#acct-msg').textContent = err.message;
            win().querySelector('#acct-claim').disabled = false;
        }
    };
}

function showClaimStatus() {
    const c = state.claim;
    const rejected = c.status === 'rejected';
    frame(t(rejected ? 'account_claim_rejected_title' : 'account_claim_pending_title'), `
        <p>${t(rejected ? 'account_claim_rejected_text' : 'account_claim_pending_text', { name: `<b>${esc(c.usernameRequested)}</b>` })}</p>
        <div class="account-actions">
            ${rejected ? '' : `<button type="button" class="hub-button" id="acct-ok">${esc(t('account_ok'))}</button>`}
            <button type="button" id="acct-cancel" class="${rejected ? 'hub-button' : 'account-link'}">${esc(t(rejected ? 'account_pick_other' : 'account_claim_cancel'))}</button>
        </div>`);
    win().querySelector('#acct-ok')?.addEventListener('click', closeWindow);
    win().querySelector('#acct-cancel').onclick = async () => {
        try { await cancelClaim(state.user); } catch (err) { return alert(err.message); }
        state = { user: state.user, player: null, claim: null };
        drawButton();
        showPickName('');
    };
}

const PUSH_TRIED = 'kl_push_tried';
const pushFlagged = () => { try { return !!state.user && (localStorage.getItem('kl_push_on') === state.user.uid || localStorage.getItem(PUSH_TRIED) === '1' || eggDone()); } catch { return false; } };
const markPushTried = () => { try { localStorage.setItem(PUSH_TRIED, '1'); } catch { } };

let eggRunning = false;
let ambient = null;
function sfx(name, { volume = 1, loop = false } = {}) {
    try {
        const a = new Audio(`/sound/egg/${name}.mp3`);
        a.volume = volume;
        a.loop = loop;
        a.play().catch(() => { });
        return a;
    } catch { return null; }
}
function fadeTo(a, target, ms, done) {
    if (!a) return done?.();
    const start = a.volume, t0 = performance.now();
    const step = (now) => {
        const k = Math.max(0, Math.min(1, (now - t0) / ms));
        a.volume = start + (target - start) * k;
        if (k < 1) requestAnimationFrame(step); else done?.();
    };
    requestAnimationFrame(step);
}

const EGG_DONE = 'kl_egg_done';
const eggDone = () => { try { return localStorage.getItem(EGG_DONE) === '1'; } catch { return false; } };

function voidEgg() {
    eggRunning = true;
    document.documentElement.classList.add('kl-egg-lock');
    ambient = sfx('ambient', { volume: 0, loop: true });
    fadeTo(ambient, 0.6, 4000);
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const red = document.createElement('div');
    red.className = 'kl-red-engulf kl-void';
    const list = document.createElement('div');
    list.className = 'kl-void-lines';
    list.setAttribute('aria-live', 'polite');
    red.appendChild(list);
    document.body.appendChild(red);
    requestAnimationFrame(() => requestAnimationFrame(() => red.classList.add('on')));

    const name = state.player?.username;
    const lines = [];
    for (let i = 1; t(`egg_void_${i}`) !== `egg_void_${i}`; i++) {
        const key = `egg_void_${i}`;
        if (t(key).includes('{name}') && !name) continue;
        lines.push(t(key, { name }));
    }
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const say = (text, cls) => {
        const p = document.createElement('p');
        p.textContent = text;
        if (cls) p.className = cls;
        list.appendChild(p);
    };
    const finish = () => {
        timers.forEach(clearTimeout);
        document.removeEventListener('keydown', onKey);
        const a = ambient;
        ambient = null;
        fadeTo(a, 0, 800, () => a?.pause());
        red.classList.add('out');
        setTimeout(() => {
            red.remove();
            document.documentElement.classList.remove('kl-egg-lock');
            eggRunning = false;
        }, 900);
    };
    const onKey = (e) => { if (e.key === 'Escape') finish(); };
    document.addEventListener('keydown', onKey);

    let at = calm ? 50 : 4100, gap = 1600;
    lines.forEach(text => { later(() => say(text), at); at += gap; gap = Math.max(110, gap * 0.92); });
    at += 1800;
    later(() => { ambient?.pause(); ambient = null; }, at - 600);
    later(() => say(t('egg_void_end'), 'kl-void-end'), at);
    later(() => {
        document.removeEventListener('keydown', onKey);
        location.replace('/connection/');
    }, at + 3500);
}

export function openPushEgg(x, y) {
    ensureOverlay();
    if (eggRunning || !overlay.classList.contains('hidden')) return;
    if (eggDone()) return voidEgg();
    eggRunning = true;
    markPushTried();
    document.documentElement.classList.add('kl-egg-lock');
    sfx('scream');
    ambient = sfx('ambient', { volume: 0, loop: true });
    fadeTo(ambient, 0.6, 4000);
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const red = document.createElement('div');
    red.className = 'kl-red-engulf';
    red.style.setProperty('--x', `${(x / innerWidth) * 100}%`);
    red.style.setProperty('--y', `${(y / innerHeight) * 100}%`);
    document.body.appendChild(red);
    requestAnimationFrame(() => requestAnimationFrame(() => red.classList.add('on')));
    setTimeout(() => {
        overlay.classList.add('egg');
        overlay.classList.remove('hidden');
        if (state.user) showPush(true);
        else {
            frame(t('push_egg_title'), `<p>${esc(t('push_egg_signin'))}</p>
                <div class="account-actions"><button type="button" class="hub-button" id="acct-in">${esc(t('account_sign_in'))}</button></div>`);
            win().querySelector('#acct-in').onclick = () => signIn();
        }
        requestAnimationFrame(() => requestAnimationFrame(() => { overlay.classList.add('egg-in'); sfx('stone'); }));
    }, calm ? 50 : 4100);
}

async function showPush(egg = false) {
    ensureOverlay();
    overlay.classList.remove('hidden');
    const title = t(egg ? 'push_egg_title' : 'push_title');
    markPushTried();
    frame(title, `<p><span class="kl-loading"></span></p>`);
    const push = await import('./push.js').catch(() => null);
    const status = push ? await push.pushStatus(state.user) : 'unsupported';
    if (status === 'denied') return showPushDenied(title, egg);
    if (status === 'ios' || status === 'unsupported') {
        frame(title, `<p>${esc(t('push_' + status))}</p>
            <div class="account-actions"><button type="button" class="hub-button" id="acct-ok">${esc(t('account_ok'))}</button></div>`);
        win().querySelector('#acct-ok').onclick = closeWindow;
        return;
    }
    const on = status === 'on';
    frame(title, `
        <p>${esc(t('push_text'))}</p>
        <p class="account-hint">${esc(t(on ? 'push_is_on' : 'push_is_off'))}</p>
        <p id="acct-msg" class="account-msg"></p>
        <div class="account-actions">
            <button type="button" class="hub-button" id="acct-toggle">${esc(t(on ? 'push_disable' : 'push_enable'))}</button>
        </div>`);
    win().querySelector('#acct-toggle').onclick = async (e) => {
        e.target.disabled = true;
        try {
            const result = on ? await push.disablePush(state.user) : await push.enablePush(state.user);
            if (egg && result === 'on') { try { localStorage.setItem(EGG_DONE, '1'); } catch { } }
            if (result === 'denied') return showPushDenied(title, egg);
            frame(title, `<p>${esc(t(result === 'on' ? 'push_done' : result === 'denied' ? 'push_denied' : 'push_off_done'))}</p>
                <div class="account-actions"><button type="button" class="hub-button" id="acct-ok">${esc(t('account_ok'))}</button></div>`);
            win().querySelector('#acct-ok').onclick = closeWindow;
        } catch (err) {
            win().querySelector('#acct-msg').textContent = err.message;
            e.target.disabled = false;
        }
    };
}

function showPushDenied(title, egg) {
    frame(title, `<p>${esc(t('push_denied'))}</p>
        <div class="account-actions">
            <button type="button" class="hub-button" id="acct-retry">${esc(t('push_retry'))}</button>
            <button type="button" class="hub-button" id="acct-ok">${esc(t('account_ok'))}</button>
        </div>`);
    win().querySelector('#acct-retry').onclick = () => showPush(egg);
    win().querySelector('#acct-ok').onclick = closeWindow;
}

function showDelete() {
    const p = state.player;
    if (p.deleteRequested) {
        frame(t('account_delete_title'), `<p>${esc(t('account_delete_waiting'))}</p>
            <div class="account-actions">
                <button type="button" class="hub-button" id="acct-ok">${esc(t('account_ok'))}</button>
                <button type="button" class="account-link" id="acct-undo">${esc(t('account_delete_undo'))}</button>
            </div>`);
        win().querySelector('#acct-ok').onclick = closeWindow;
        win().querySelector('#acct-undo').onclick = async () => {
            try { await cancelDeleteRequest(state.user); } catch (err) { return alert(err.message); }
            state.player.deleteRequested = false;
            closeWindow();
        };
        return;
    }
    const keep = hasLevels(p) || p.legacy || p.claimed || p.role !== 'player';
    frame(t('account_delete_title'), `
        <p>${esc(t(keep ? 'account_delete_text_levels' : 'account_delete_text', { owner: OWNER_DISCORD }))}</p>
        <label class="account-hint" for="acct-confirm">${esc(t('account_delete_type', { name: p.username }))}</label>
        <input id="acct-confirm" class="account-input" maxlength="24" autocomplete="off">
        <p id="acct-msg" class="account-msg"></p>
        <div class="account-actions">
            <button type="button" id="acct-del" class="hub-button danger" disabled>${esc(t(keep ? 'account_delete_ask' : 'account_delete_now'))}</button>
            <button type="button" id="acct-back" class="account-link">${esc(t('account_back'))}</button>
        </div>`);
    const input = win().querySelector('#acct-confirm'), go = win().querySelector('#acct-del');
    input.focus();
    input.oninput = () => { go.disabled = input.value.trim().toLowerCase() !== p.username.trim().toLowerCase(); };
    win().querySelector('#acct-back').onclick = closeWindow;
    go.onclick = async () => {
        go.disabled = true;
        try {
            const result = await deleteMyAccount(state.user, p);
            if (result === 'requested') { state.player.deleteRequested = true; return showDelete(); }
            frame(t('account_delete_title'), `<p>${esc(t('account_deleted'))}</p>
                <div class="account-actions"><button type="button" class="hub-button" id="acct-ok">${esc(t('account_ok'))}</button></div>`);
            win().querySelector('#acct-ok').onclick = () => { closeWindow(); location.reload(); };
        } catch (err) {
            win().querySelector('#acct-msg').textContent = err.message;
            go.disabled = false;
        }
    };
}

function start() {
    mountButton();
    try { if (localStorage.getItem('kl_push_on')) import('./push.js').catch(() => { }); } catch { }
    watchAccount((s) => {
        state = s;
        ready = true;
        drawButton();
        const asked = sessionStorage.getItem('kl_name_asked');
        if (s.user && !s.player && (!asked || s.claim?.status === 'rejected')) {
            try { sessionStorage.setItem('kl_name_asked', '1'); } catch { }
            openWindow();
        }
    });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
