import { fetchJson } from './js/utils.js';
import { calculatePlayerScore } from './score.js';
import { BADGES, getSpecialBadgeByRank } from './js/badge.js';
import { renderBadgeDeck, handleBadgeSkew } from './js/badgeSystem.js';
import { t } from './js/i18n.js';

(async () => {
    const ITEMS_PER_PAGE = 9;
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

    const historyEl = document.getElementById('player-history');
    if (historyEl) {
        historyEl.innerHTML = '';
        const sortedHistory = [...playerData.levels].sort((a, b) => b.klp - a.klp);
        sortedHistory.forEach(l => {
            const div = document.createElement('div');
            const typeLabel = l.type === 'Victor' ? t('type_victor') : t('type_verification');
            
            div.innerText = t('player_history_entry', {
                type: typeLabel,
                name: l.name,
                klp: l.klp,
                defaultValue: `${typeLabel}: ${l.name} (+${l.klp} KLP)`
            });
            historyEl.appendChild(div);
        });
    }

    function renderPaginatedGrid(items, container) {
        if (!container) return;
        let currentPage = 1;
        const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
        const pagination = container.parentElement.querySelector('.pagination');

        function renderPage() {
            container.innerHTML = '';
            const pageItems = items.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

            pageItems.forEach(item => {
                const cell = document.createElement('div');
                cell.className = 'grid-item clickable'; 
                cell.innerText = `${item.name} (${item.klp} KLP)`;
                cell.onclick = () => {
                    window.location.href = `LevelDetails.html?name=${encodeURIComponent(item.name)}`;
                };
                container.appendChild(cell);
            });

            if (pagination) {
                pagination.innerHTML = '';
                if (totalPages > 1) {
                    for (let i = 1; i <= totalPages; i++) {
                        const btn = document.createElement('button');
                        btn.innerText = i;
                        if (i === currentPage) btn.disabled = true;
                        btn.onclick = () => { currentPage = i; renderPage(); };
                        pagination.appendChild(btn);
                    }
                }
            }
        }
        renderPage();
    }

    renderPaginatedGrid(playerData.levels.filter(l => l.type === 'Victor'), document.getElementById('player-victors'));
    renderPaginatedGrid(playerData.levels.filter(l => l.type === 'Verification'), document.getElementById('player-verifications'));

    const modal = document.getElementById('badge-modal');
    window.addEventListener('click', (e) => {
        if (e.target === modal || e.target.id === 'close-modal') modal.classList.add('hidden');
    });
})();