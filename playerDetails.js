import { loadLevels, loadPlayers } from './js/data.js';
import { calculatePlayerScore } from './score.js';
import { BADGES, getSpecialBadgeByRank } from './js/badge.js';
import { renderBadgeDeck, handleBadgeSkew } from './js/badgeSystem.js';
import { t } from './js/i18n.js';

document.getElementById('back-button')?.addEventListener('click', (e) => {
    const fromSite = document.referrer && new URL(document.referrer).origin === location.origin;
    if (fromSite && history.length > 1) { e.preventDefault(); history.back(); }
});

(async () => {
    const params = new URLSearchParams(window.location.search);
    const playerName = params.get('name');
    if (!playerName) return alert(t('error_no_player'));

    const nameEl = document.getElementById('player-name');
    if (nameEl) nameEl.innerText = playerName;

    const [allLevels, players] = await Promise.all([loadLevels(), loadPlayers()]);
    document.getElementById('player-loading')?.remove();
    const sortedByKLP = allLevels;
    const levelById = new Map(allLevels.map(l => [String(l.id), l]));

    const player = players.find(p => p.username === playerName)
        || players.find(p => p.username.toLowerCase() === playerName.toLowerCase());
    const playerData = { klp: 0, levels: [] };
    if (player) {
        const add = (id, type) => {
            const level = levelById.get(String(id));
            if (!level) return;
            playerData.klp += level.klp;
            playerData.levels.push({ name: level.name, klp: level.klp, type });
        };
        player.verifiedLevels.forEach(id => add(id, 'Verification'));
        player.beatenLevels.forEach(id => add(id, 'Victor'));
    }
    const key = (player ? player.username : playerName).trim().toLowerCase();
    const created = allLevels.filter(l => String(l.creator || '').split(',').some(c => c.trim().toLowerCase() === key));
    const show = (id, on) => document.getElementById(id)?.classList.toggle('hidden', !on);

    if (!player && !created.length) {
        console.error(t('error_player_not_found'), playerName);
        show('player-empty', true);
        show('player-stats-block', false);
        show('player-levels-block', false);
        return;
    }
    if (player && nameEl) nameEl.innerText = player.username;

    const hasPlayed = playerData.levels.length > 0;
    show('player-stats-block', hasPlayed);
    show('player-levels-block', hasPlayed);
    show('player-retired', !!player?.retired);
    show('player-empty', !hasPlayed && !created.length);
    if (created.length) {
        show('player-created-block', true);
        show('player-architect-block', true);
        const total = created.reduce((sum, l) => sum + (l.klp || 0), 0);
        document.getElementById('creator-level-count').innerText = created.length;
        document.getElementById('creator-total-klp').innerText = total.toLocaleString();
        document.getElementById('creator-avg-klp').innerText = Math.round(total / created.length).toLocaleString();
        import('./js/enjoyment.js').then(async m => {
            const scores = [...(await m.loadEnjoyment(created.map(l => l.id), players)).values()];
            if (!scores.length) return;
            const avg = scores.reduce((s, e) => s + e.avg, 0) / scores.length;
            const el = document.getElementById('creator-avg-enjoy');
            el.innerText = (Math.round(avg * 10) / 10).toFixed(1);
            el.title = t('creator_enjoy_hint', { count: scores.length, total: created.length });
        }).catch(err => console.error(err));
    }

    import('./js/carbo.js').then(async ({ carbo, hatOf, hatName, openHatPicker }) => {
        const box = document.getElementById('player-carbo');
        const paint = (hat) => { box.innerHTML = carbo(hat, 4, hat ? hatName(hat) : ''); };
        const ce = await import('./js/enjoyment.js').then(m => m.loadCreatorEnjoyment(allLevels, players)).catch(() => null);
        paint(hatOf(player, allLevels, ce));
        if (!player) return;
        const { watchAccount } = await import('./js/auth.js');
        watchAccount((s) => {
            const mine = !!s.player && (s.player.docId === player.docId
                || String(s.player.username || '').toLowerCase() === String(player.username || '').toLowerCase());
            const btn = document.getElementById('change-hat');
            btn.classList.toggle('hidden', !mine);
            if (mine) btn.onclick = () => openHatPicker(s.user, { ...player, ...s.player }, (hat) => { player.look = { hat }; paint(hatOf(player, allLevels, ce)); }, allLevels, ce);
        });
    }).catch(err => console.error(err));

    show('player-comments-section', true);
    import('./js/comments.js').then(m => { m.mountComments(document.getElementById('player-comments'), 'player', key, player ? player.username : playerName);
        m.mountCommentDrawer(document.getElementById('player-comments-section')); })
        .catch(err => console.error(err));

    const playerTrophies = [];
    playerData.levels.forEach(l => {
        const rank = sortedByKLP.findIndex(lvl => lvl.name === l.name) + 1;
        const key = getSpecialBadgeByRank(rank);
        if (key) {
            playerTrophies.push({ key: key, levelName: l.name, rank: rank });
        }
    });

    playerTrophies.sort((a, b) => a.rank - b.rank);

    const badgeRow = document.getElementById('badge-row');
    renderBadgeDeck(playerTrophies, badgeRow, BADGES, player ? player.username : playerName);

    document.addEventListener('mousemove', handleBadgeSkew);

    const totalKLP = playerData.klp;
    const victoryKLP = playerData.levels.filter(l => l.type === 'Victor').reduce((sum, l) => sum + l.klp, 0);
    const verificationKLP = playerData.levels.filter(l => l.type === 'Verification').reduce((sum, l) => sum + l.klp, 0);
    const plp = calculatePlayerScore(playerData.levels);

    document.getElementById('player-plp').innerText = plp.toFixed(0);
    document.getElementById('player-total-klp').innerText = totalKLP.toLocaleString();
    document.getElementById('player-victory-klp').innerText = victoryKLP.toLocaleString();
    document.getElementById('player-verification-klp').innerText = verificationKLP.toLocaleString();
    
    document.querySelector('title')?.removeAttribute('data-i18n');
    document.title = hasPlayed ? t('player_page_title_full', { name: player.username, plp: plp.toFixed(0) })
                               : t('builder_title', { name: player ? player.username : playerName });

    // show every level, no pages, highest KLP first
    function renderLevelGrid(items, container) {
        if (!container) return;
        container.innerHTML = '';

        if (!items.length) {
            container.innerHTML = `<div class="empty-state">${t('no_levels_yet')}</div>`;
            return;
        }

        [...items].sort((a, b) => b.klp - a.klp || a.name.localeCompare(b.name)).forEach(item => {
            const cell = document.createElement('div');
            cell.className = 'grid-item clickable board-9slice sm';
            cell.innerText = `${item.name} (${item.klp} KLP)`;
            cell.onclick = () => {
                window.location.href = `LevelDetails.html?name=${encodeURIComponent(item.name)}`;
            };
            container.appendChild(cell);
        });
    }

    renderLevelGrid(playerData.levels.filter(l => l.type === 'Victor'), document.getElementById('player-victors'));
    renderLevelGrid(playerData.levels.filter(l => l.type === 'Verification'), document.getElementById('player-verifications'));
    renderLevelGrid(created, document.getElementById('player-created'));

    const modal = document.getElementById('badge-modal');
    window.addEventListener('click', (e) => {
        if (e.target === modal || e.target.id === 'close-modal') modal.classList.add('hidden');
    });
})();