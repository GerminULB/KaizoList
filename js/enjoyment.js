import { db } from '../firebase-config.js';
import { doc, setDoc, deleteDoc, getDocs, collection, query, where, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { watchAccount } from './auth.js';
import { loadRatings as loadAllRatings, clearDataCache } from './data.js';
import { t, tn } from './i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);

const stillHas = (p, levelId) => !!p && (p.beatenLevels.map(String).includes(levelId) || p.verifiedLevels.map(String).includes(levelId));

export async function loadEnjoyment(levelIds, players) {
    const ids = [...new Set(levelIds.map(String))];
    const out = new Map();
    for (const r of await loadAllRatings()) {
        if (!ids.includes(r.levelId) || !stillHas(players.find(p => p.docId === r.playerUid), r.levelId)) continue;
        const e = out.get(r.levelId) || { sum: 0, count: 0 };
        e.sum += r.rating; e.count++;
        out.set(r.levelId, e);
    }
    for (const [k, e] of out) out.set(k, { avg: e.sum / e.count, count: e.count });
    return out;
}

let creatorPromise = null;
export function loadCreatorEnjoyment(levels, players) {
    creatorPromise = creatorPromise || (async () => {
        const perLevel = new Map();
        for (const r of await loadAllRatings()) {
            if (!stillHas(players.find(p => p.docId === r.playerUid), String(r.levelId))) continue;
            const e = perLevel.get(String(r.levelId)) || { sum: 0, count: 0 };
            e.sum += r.rating; e.count++;
            perLevel.set(String(r.levelId), e);
        }
        const out = new Map();
        for (const l of levels) {
            const e = perLevel.get(String(l.id));
            if (!e) continue;
            for (const c of String(l.creator || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)) {
                const o = out.get(c) || { sumAvg: 0, levels: 0, ratings: 0 };
                o.sumAvg += e.sum / e.count; o.levels++; o.ratings += e.count;
                out.set(c, o);
            }
        }
        for (const [c, o] of out) out.set(c, { avg: o.sumAvg / o.levels, ratings: o.ratings });
        return out;
    })();
    return creatorPromise;
}

export async function mountEnjoyment(level, players) {
    const avgEl = document.getElementById('level-enjoyment');
    const box = document.getElementById('level-rate');
    if (!avgEl || !box || !level.id) return;
    const levelId = String(level.id);
    const hasLevel = (p) => !!p && (p.beatenLevels.map(String).includes(levelId) || p.verifiedLevels.map(String).includes(levelId));

    let ratings = [];
    async function loadRatings() {
        try {
            const snap = await getDocs(query(collection(db, 'enjoymentRatings'), where('levelId', '==', levelId)));
            ratings = snap.docs.map(d => d.data())
                .filter(r => r.levelId === levelId && hasLevel(players.find(p => p.docId === r.playerUid)));
        } catch (err) { console.error('Could not load ratings:', err); ratings = []; }
        const n = ratings.length;
        avgEl.textContent = n
            ? `${fmt(ratings.reduce((s, r) => s + r.rating, 0) / n)} / 10 (${tn('enjoy_count', n)})`
            : t('enjoy_none');
    }
    await loadRatings();

    watchAccount((s) => {
        box.classList.remove('hidden');
        if (!s.user) return note(t('enjoy_sign_in'));
        if (!s.player) return note(t('enjoy_pick_name'));
        const me = players.find(p => p.docId === s.player.docId) || s.player;
        if (!hasLevel({ beatenLevels: me.beatenLevels || [], verifiedLevels: me.verifiedLevels || [] })) return note(t('enjoy_beat_first'));
        drawRater(s.user, s.player);
    });

    function note(text) { box.innerHTML = `<p class="level-rate-note">${esc(text)}</p>`; }

    function drawRater(user, player) {
        const mine = ratings.find(r => r.playerUid === user.uid);
        const start = mine ? mine.rating : 5;
        box.innerHTML = `
            <label class="level-rate-label" for="rate-slider">${esc(t(mine ? 'enjoy_yours' : 'enjoy_rate'))}</label>
            <div class="level-rate-row">
                <div class="kl-slider">
                    <div class="kl-slider-fill"></div>
                    <img class="kl-slider-knob" src="/images/ui/slider_knob.png" alt="">
                    <input type="range" id="rate-slider" min="0" max="10" step="0.1" value="${start}">
                </div>
                <span id="rate-value" class="level-rate-value">${fmt(start)}</span>
            </div>
            <div class="level-rate-actions">
                <button type="button" id="rate-save" class="hub-button">${esc(t(mine ? 'enjoy_update' : 'enjoy_save'))}</button>
                ${mine ? `<button type="button" id="rate-remove" class="kl-iconbtn" title="${esc(t('enjoy_remove'))}"><span class="kl-ico kl-ico-revert" role="img" aria-label="${esc(t('enjoy_remove'))}"></span></button>` : ''}
                <span id="rate-msg" class="level-rate-msg"></span>
            </div>`;
        const slider = box.querySelector('#rate-slider');
        const paintSlider = () => {
            const v = Number(slider.value);
            box.querySelector('.kl-slider').style.setProperty('--pos', v / 10);
            box.querySelector('#rate-value').textContent = fmt(v);
        };
        slider.oninput = paintSlider;
        paintSlider();
        const ref = doc(db, 'enjoymentRatings', `${user.uid}_${levelId}`);

        box.querySelector('#rate-save').onclick = async () => {
            const rating = Math.round(Number(slider.value) * 10) / 10;
            try {
                await setDoc(ref, { playerUid: user.uid, username: player.username, levelId, rating, updatedAt: serverTimestamp() });
                clearDataCache();
                await loadRatings();
                drawRater(user, player);
                box.querySelector('#rate-msg').textContent = t('enjoy_saved');
            } catch (err) { box.querySelector('#rate-msg').textContent = err.message; }
        };
        box.querySelector('#rate-remove')?.addEventListener('click', async () => {
            try { await deleteDoc(ref); clearDataCache(); await loadRatings(); drawRater(user, player); }
            catch (err) { box.querySelector('#rate-msg').textContent = err.message; }
        });
    }
}
