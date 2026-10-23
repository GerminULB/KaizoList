import { db } from '../firebase-config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { t } from './i18n.js';
import { clearDataCache } from './data.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const HATS = [
    ['top_hat', 'Top Hat'], ['bowler_hat', 'Bowler Hat'], ['yeehaw', 'Yeehaw'], ['detective', 'Detective'], ['party_hat', 'Party Hat'],
    ['propeller_hat', 'Propeller Hat'], ['red_cap', 'Red Cap'], ['blue_cap', 'Blue Cap'], ['green_cap', 'Green Cap'], ['santa', 'Santa'],
    ['elf', 'Elf'], ['princess', 'Princess'], ['royal_crown', 'Royal Crown'], ['knight', 'Knight'], ['hood', 'Hood'],
    ['red_hood', 'Red Hood'], ['blue_hood', 'Blue Hood'], ['green_hood', 'Green Hood'], ['hairdo', 'Hairdo'], ['long_hair', 'Long Hair'],
    ['bunny', 'Bunny'], ['cat', 'Cat'], ['frog', 'Frog'], ['shork', 'Shork'], ['unicorn', 'Unicorn'],
    ['horns', 'Horns'], ['antennae', 'Antennae'], ['satellite_dish', 'Satellite Dish'], ['pinwheel', 'Pinwheel'], ['pin_head', 'Pin Head'],
    ['open_hatch', 'Open Hatch'], ['big_brain', 'Big Brain'], ['chrome_dome', 'Chrome Dome'], ['puzzle_cube', 'Puzzle Cube'], ['pipe_organ', 'Pipe Organ'],
    ['ceramic', 'Ceramic'], ['icecream', 'Icecream'], ['volcano', 'Volcano'], ['tree', 'Tree'], ['grass', 'Grass'],
    ['oyster', 'Oyster'], ['rumba', 'Rumba'], ['glasses', 'Glasses'], ['four_eyes', 'Four Eyes'],
    ['goofy_eyes', 'Goofy Eyes'], ['blue_eyes', 'Blue Eyes'], ['green_eyes', 'Green Eyes'], ['cyclops', 'Cyclops'], ['prowler', 'Prowler'],
    ['nose', 'Nose'], ['goatee', 'Goatee'], ['underbite', 'Underbite'], ['low_res', 'Low Res'], ['emptiness', 'Emptiness'],
];
export const SPECIAL_HATS = [
    ['special_top1', 'Top 1', { top: 1 }], ['special_top5', 'Top 5', { top: 5 }], ['special_top10', 'Top 10', { top: 10 }],
    ['special_top15', 'Top 15', { top: 15 }], ['special_top25', 'Top 25', { top: 25 }], ['special_top50', 'Top 50', { top: 50 }],
    ['special_enjoyment', 'Cool Shades', { enjoyment: 6, minRatings: 3 }],
    ['special_germin', 'Germin', { owner: true }],
];

const ALL = new Map([...HATS, ...SPECIAL_HATS.map(([id, name]) => [id, name])]);
export const hatName = (id) => ALL.get(id) || '';

export function unlockedSpecials(player, levels = [], creatorEnjoy = null) {
    const out = new Set();
    if (!player) return out;
    const mine = new Set([...(player.beatenLevels || []), ...(player.verifiedLevels || [])].map(String));
    const idx = levels.findIndex(l => mine.has(String(l.id)));
    const best = idx < 0 ? Infinity : idx + 1;
    for (const [id, , need] of SPECIAL_HATS) {
        if (need.top && best <= need.top) out.add(id);
        if (need.role && player.role === need.role) out.add(id);
        if (need.owner && player.role === 'owner') out.add(id);
        if (need.enjoyment && creatorEnjoy) {
            const e = creatorEnjoy.get(String(player.username || '').trim().toLowerCase());
            if (e && e.avg >= need.enjoyment && e.ratings >= need.minRatings) out.add(id);
        }
    }
    return out;
}

export function hatOf(player, levels = null, creatorEnjoy = null) {
    const h = player?.look?.hat;
    if (!h || !ALL.has(h)) return '';
    if (h.startsWith('special_')) return levels && unlockedSpecials(player, levels, creatorEnjoy).has(h) ? h : '';
    return h;
}

export function carbo(hat = '', scale = 2, title = '') {
    const h = ALL.has(hat) ? hat : '';
    return `<span class="carbo" style="--px:${scale}px" ${title ? `title="${esc(title)}"` : ''}>
        <img class="carbo-body" src="/images/hats/carbo.png" alt="">
        ${h ? `<img class="carbo-hat" src="/images/hats/${esc(h)}.png" alt="">` : ''}</span>`;
}

export function openHatPicker(user, player, onSaved, levels = [], creatorEnjoy = null) {
    let current = hatOf(player, levels, creatorEnjoy);
    let tab = current.startsWith('special_') ? 'special' : 'normal';
    let peek = current.startsWith('special_') ? current : '';
    const unlocked = unlockedSpecials(player, levels, creatorEnjoy);
    const overlay = document.createElement('div');
    overlay.className = 'account-overlay';
    overlay.innerHTML = '<div class="account-window panel-9slice hat-window"></div>';
    document.body.appendChild(overlay);
    const win = overlay.querySelector('.hat-window');
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    function draw(msg = '') {
        const list = tab === 'normal' ? HATS : SPECIAL_HATS.map(([id, name]) => [id, name]);
        win.innerHTML = `
            <button type="button" class="account-close" aria-label="Close">X</button>
            <div class="hat-tabs">
                <button type="button" class="hat-tab ${tab === 'normal' ? 'on' : ''}" data-tab="normal">${esc(t('hats_normal'))}</button>
                <button type="button" class="hat-tab ${tab === 'special' ? 'on' : ''}" data-tab="special">${esc(t('hats_special'))}</button>
            </div>
            <div class="hat-preview">${carbo(current, 5)}
                <p class="hat-wearing">${esc(t('hats_wearing', { hat: current ? hatName(current) : t('hats_none') }))}</p></div>
            ${tab === 'special' ? `<p class="hat-special-note">${peek
                ? `<b>${esc(hatName(peek))}</b>${unlocked.has(peek) ? '' : ` <span class="hat-locked-tag">${esc(t('hats_locked_tag'))}</span>`}<br>${esc(t('hat_desc_' + peek))}`
                : esc(t('hats_special_pick'))}</p>` : ''}
            <div class="hat-grid">
                ${tab === 'normal' ? `<button type="button" class="hat-cell ${!current ? 'on' : ''}" data-hat="" title="${esc(t('hats_none'))}">${carbo('', 2)}</button>` : ''}
                ${list.map(([id, name]) => {
                    const locked = tab === 'special' && !unlocked.has(id);
                    return `<button type="button" class="hat-cell ${current === id ? 'on' : ''} ${locked ? 'locked' : ''}" data-hat="${esc(id)}"
                        title="${esc(tab === 'special' ? `${name}: ${t('hat_desc_' + id)}` : name)}" ${locked ? 'aria-disabled="true"' : ''}>${carbo(id, 2)}${locked ? '<span class="hat-lock kl-ico kl-ico-lock"></span>' : ''}</button>`;
                }).join('')}
            </div>
            <p class="account-msg">${esc(msg)}</p>
            <div class="account-actions">
                <button type="button" class="hub-button" data-save>${esc(t('hats_save'))}</button>
                <button type="button" class="account-link" data-close>${esc(t('account_back'))}</button>
            </div>`;
        win.querySelector('.account-close').onclick = close;
        win.querySelector('[data-close]').onclick = close;
        win.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; peek = current.startsWith('special_') ? current : ''; draw(); });
        win.querySelectorAll('[data-hat]').forEach(b => b.onclick = () => {
            const id = b.dataset.hat;
            if (tab === 'special') peek = id;
            if (tab !== 'special' || unlocked.has(id)) current = id;
            draw();
        });
        win.querySelector('[data-save]').onclick = async () => {
            try {
                await updateDoc(doc(db, 'players', user.uid), { look: { hat: current } });
                player.look = { hat: current };
                clearDataCache();
                onSaved?.(current);
                close();
            } catch (err) { draw(err.message); }
        };
    }
    draw();
}
