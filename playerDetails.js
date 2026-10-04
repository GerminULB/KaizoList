import { fetchJson } from './js/utils.js';
import { calculatePlayerScore } from './score.js';
import { BADGES, getSpecialBadgeByRank } from './js/badge.js';
import { renderBadgeDeck, handleBadgeSkew } from './js/badgeSystem.js';
import { t } from './js/i18n.js';

(async () => {
    const params = new URLSearchParams(window.location.search);
    const playerName = params.get('name');
    if (!playerName) return alert(t('error_no_player'));

    const nameEl = document.getElementById('player-name');
    if (nameEl) nameEl.innerText = playerName;

    const [levels, challenges, victorsData] = await Promise.all([
        fetchJson('levels.json'),
        fetchJson('challenges.json'),
        fetchJson('victors.json')
    ]);

    const allLevels = [...levels, ...challenges];
    const sortedByKLP = [...allLevels].sort((a, b) => b.klp - a.klp);

    const playerMap = {};

    allLevels.forEach(level => {
        if (!level.verifier) return;
        const v = level.verifier;
        if (!playerMap[v]) playerMap[v] = { klp: 0, levels: [] };
        playerMap[v].klp += level.klp;
        playerMap[v].levels.push({ name: level.name, klp: level.klp, type: 'Verification' });
    });

    Object.entries(victorsData).forEach(([player, levelNames]) => {
        levelNames.forEach(levelName => {
            const level = allLevels.find(l => l.name === levelName);
            if (!level) return;
            if (!playerMap[player]) playerMap[player] = { klp: 0, levels: [] };
            playerMap[player].klp += level.klp;
            playerMap[player].levels.push({ name: level.name, klp: level.klp, type: 'Victor' });
        });
    });

    const playerData = playerMap[playerName];
    if (!playerData) {
        console.error(t('error_player_not_found'), playerName);
        return;
    }

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
    renderBadgeDeck(playerTrophies, badgeRow, BADGES, playerName);

    document.addEventListener('mousemove', handleBadgeSkew);

    const totalKLP = playerData.klp;
    const victoryKLP = playerData.levels.filter(l => l.type === 'Victor').reduce((sum, l) => sum + l.klp, 0);
    const verificationKLP = playerData.levels.filter(l => l.type === 'Verification').reduce((sum, l) => sum + l.klp, 0);
    const plp = calculatePlayerScore(playerData.levels);

    document.getElementById('player-plp').innerText = plp.toFixed(0);
    document.getElementById('player-total-klp').innerText = totalKLP.toLocaleString();
    document.getElementById('player-victory-klp').innerText = victoryKLP.toLocaleString();
    document.getElementById('player-verification-klp').innerText = verificationKLP.toLocaleString();
    
    document.title = t('player_page_title_full', { name: playerName, plp: plp.toFixed(0) });

    // Every level is shown (no pagination), highest KLP first.
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

    const modal = document.getElementById('badge-modal');
    window.addEventListener('click', (e) => {
        if (e.target === modal || e.target.id === 'close-modal') modal.classList.add('hidden');
    });
})();