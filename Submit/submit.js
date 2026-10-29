import { t } from '../js/i18n.js';
import { loadLevels } from '../js/data.js';
import { watchAccount, signIn } from '../js/auth.js';
import { placementText } from '../js/placement.js';
import { loadMySubmissions, sendSubmission, withdrawSubmission, VIDEO_RULE, LEVEL_ID_RULE } from '../js/submissions.js';

const LEGACY_RANK_CUTOFF = 100;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const show = (el, on) => $(el).classList.toggle('hidden', !on);

let state = { user: null, player: null };
let levels = [];
let mine = [];

watchAccount(async (s) => {
    state = s;
    show('submit-loading', false);
    if (!s.user || !s.player) return showGate();
    show('submit-gate', false);
    show('submit-form', true);
    $('submit-as').innerHTML = t('submit_as', { name: `<b>${esc(s.player.username)}</b>` });
    if (!levels.length) levels = (await loadLevels()).map((l, i) => ({ ...l, rank: i + 1 }));
    await refreshMine();
});

function showGate() {
    show('submit-form', false);
    show('my-subs-box', false);
    show('submit-gate', true);
    const signedIn = !!state.user;
    $('submit-gate-text').textContent = t(signedIn ? 'submit_need_name' : 'submit_need_signin');
    $('submit-gate-btn').textContent = t(signedIn ? 'account_pick_name_short' : 'account_sign_in');
    $('submit-gate-btn').onclick = async () => {
        if (signedIn) return document.getElementById('account-btn')?.click();
        signIn();
    };
}

function submittable() {
    const have = new Set([...(state.player.beatenLevels || []), ...(state.player.verifiedLevels || [])].map(String));
    const waiting = new Set(mine.filter(s => s.type === 'victor' && s.status !== 'rejected').map(s => String(s.levelId)));
    return levels.filter(l => l.rank <= LEGACY_RANK_CUTOFF && !have.has(String(l.id)) && !waiting.has(String(l.id)));
}

function fillLevelList() {
    $('sub-level').placeholder = t('submit_level_placeholder');
    $('sub-level-list').innerHTML = submittable().map(l => `<option value="${esc(l.name)}">#${l.rank} | ${l.klp} KLP</option>`).join('');
}

function pickedLevel() {
    const name = $('sub-level').value.trim().toLowerCase();
    if (!name) return { level: null, why: '' };
    const level = levels.find(l => l.name.trim().toLowerCase() === name);
    if (!level) return { level: null, why: t('submit_level_unknown') };
    const id = String(level.id);
    if ((state.player.beatenLevels || []).map(String).includes(id) || (state.player.verifiedLevels || []).map(String).includes(id))
        return { level: null, why: t('submit_level_have') };
    if (mine.some(s => s.type === 'victor' && String(s.levelId) === id && s.status === 'pending')) return { level: null, why: t('submit_level_waiting') };
    if (mine.some(s => s.type === 'victor' && String(s.levelId) === id && s.status === 'accepted')) return { level: null, why: t('submit_level_have') };
    if (level.rank > LEGACY_RANK_CUTOFF) return { level: null, why: t('submit_level_legacy') };
    return { level, why: '' };
}

$('sub-level').addEventListener('input', () => {
    const { level, why } = pickedLevel();
    $('sub-level-info').textContent = level ? t('submit_level_found', { rank: level.rank, klp: level.klp, creator: level.creator, id: level.id }) : why;
    showPlacement();
});

function showPlacement() {
    const raw = $('sub-klp').value;
    const kind = document.querySelector('input[name="kind"]:checked').value;
    const self = kind === 'victor' ? pickedLevel().level : null;
    $('sub-klp-place').textContent = raw === '' ? '' : placementText(levels, Math.round(Number(raw)), self, t, LEGACY_RANK_CUTOFF);
}
$('sub-klp').addEventListener('input', showPlacement);

document.querySelectorAll('input[name="kind"]').forEach(r => r.addEventListener('change', () => {
    const kind = document.querySelector('input[name="kind"]:checked').value;
    document.querySelectorAll('[data-kind]').forEach(el => el.classList.toggle('hidden', el.dataset.kind !== kind));
    $('submit-msg').textContent = '';
    showPlacement();
}));

$('submit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('submit-msg');
    const kind = document.querySelector('input[name="kind"]:checked').value;
    const form = {
        kind, inGameName: $('sub-ign').value,
        videoUrl: $('sub-video').value.trim(), thoughts: $('sub-thoughts').value,
        klpOpinion: $('sub-klp').value === '' ? null : Math.round(Number($('sub-klp').value)),
    };

    if (kind === 'victor') {
        const { level, why } = pickedLevel();
        if (!level) { msg.textContent = why || t('submit_err_level'); return; }
        form.levelId = String(level.id);
        form.levelName = level.name;
    } else {
        form.levelName = $('sub-newname').value.trim();
        form.levelId = $('sub-newid').value.trim();
        form.creator = $('sub-creator').value.trim();
        if (form.levelName.length < 1) { msg.textContent = t('submit_err_newname'); return; }
        if (!LEVEL_ID_RULE.test(form.levelId)) { msg.textContent = t('submit_err_newid'); return; }
        if (levels.some(l => String(l.id) === form.levelId)) { msg.textContent = t('submit_err_onlist'); return; }
        if (!form.creator) { msg.textContent = t('submit_err_creator'); return; }
    }
    if (!form.inGameName.trim()) { msg.textContent = t('submit_err_ign'); return; }
    if (!VIDEO_RULE.test(form.videoUrl)) { msg.textContent = t('submit_err_video'); return; }
    if (form.klpOpinion === null || !Number.isFinite(form.klpOpinion) || form.klpOpinion < 0 || form.klpOpinion > 10000) {
        msg.textContent = t('submit_err_klp'); return;
    }

    $('submit-send').disabled = true;
    msg.textContent = t('submit_sending');
    try {
        await sendSubmission(state.user, state.player, form);
        $('submit-form').reset();
        document.querySelectorAll('[data-kind]').forEach(el => el.classList.toggle('hidden', el.dataset.kind !== 'victor'));
        $('sub-level-info').textContent = '';
        $('sub-klp-place').textContent = '';
        msg.textContent = t('submit_sent');
        await refreshMine();
    } catch (err) {
        msg.textContent = err.code === 'already-sent' ? t('submit_level_waiting') : t('submit_err_failed', { error: err.message });
    }
    $('submit-send').disabled = false;
});

async function refreshMine() {
    try { mine = await loadMySubmissions(state.user.uid); } catch (err) { console.error(err); mine = []; }
    fillLevelList();
    show('my-subs-box', true);
    $('my-subs').innerHTML = mine.length ? mine.map(s => `
        <div class="sub-row sub-${esc(s.status)}">
            <div>
                <b>${esc(s.levelName)}</b> <span class="muted">(${esc(s.levelId)})</span>
                <span class="sub-kind">${s.type === 'victor' ? '<img class="kl-inline" src="/images/icon/victor.png" alt=""> ' : ''}${esc(t(s.type === 'victor' ? 'submit_kind_victor_short' : 'submit_kind_verification_short'))}</span><br>
                <span class="sub-status">${s.status === 'accepted' ? '<img class="kl-inline" src="/images/icon/check.png" alt=""> ' : s.status === 'rejected' ? '<img class="kl-inline" src="/images/icon/cross.png" alt=""> ' : ''}${esc(t('submit_status_' + s.status))}${s.status === 'rejected' && s.rejectReason ? `<span class="muted">: ${esc(s.rejectReason)}</span>` : ''}</span>
                ${s.status !== 'pending' && s.decidedByName ? `<span class="muted"> (${esc(t('submit_by', { name: s.decidedByName }))})</span>` : ''}
            </div>
            ${s.status === 'accepted' ? '' : `<button type="button" class="kl-iconbtn" data-withdraw="${esc(s.docId)}" title="${esc(t(s.status === 'pending' ? 'submit_withdraw' : 'submit_dismiss'))}"><span class="kl-ico kl-ico-${s.status === 'pending' ? 'revert' : 'delete'}" role="img"></span></button>`}
        </div>`).join('') : `<p class="muted">${esc(t('submit_none'))}</p>`;
}

$('my-subs').addEventListener('click', async (e) => {
    const id = e.target.dataset.withdraw;
    if (!id) return;
    const s = mine.find(x => x.docId === id);
    if (s?.status === 'pending' && !confirm(t('submit_withdraw_confirm', { level: s.levelName }))) return;
    try { await withdrawSubmission(id); } catch (err) { return alert(err.message); }
    await refreshMine();
});
