import { fetchJson, splitNames, applyRandomPattern } from '../js/utils.js';
import { BADGES, getSpecialBadgeByRank } from '../js/badge.js';
import { calculatePlayerScore } from '../score.js';
import { t } from '../js/i18n.js';

(async function() {

    // Fetch all data
    const levels = await fetchJson('../levels.json');
    const challenges = await fetchJson('../challenges.json');
    const victorsData = await fetchJson('../victors.json');
    const allLevels = [...levels, ...challenges];

    const playerMap = {};

    const retiredPlayers = new Set([
        "Ocelote"
    ]);

    // Add verifiers
    allLevels.forEach(level => {
        if (!level.verifier) return;
        const v = level.verifier;
        if (!playerMap[v]) playerMap[v] = { klp: 0, levels: [] };
        playerMap[v].klp += level.klp;
        playerMap[v].levels.push({ name: level.name, klp: level.klp, type: 'Verification' });
    });

    // Add victors
    Object.entries(victorsData).forEach(([player, levelNames]) => {
        levelNames.forEach(levelName => {
            const level = allLevels.find(l => l.name === levelName);
            if (!level) return;
            if (!playerMap[player]) playerMap[player] = { klp: 0, levels: [] };
            playerMap[player].klp += level.klp;
            playerMap[player].levels.push({ name: level.name, klp: level.klp, type: 'Victor' });
        });
    });

    // Level -> rank by KLP, used for each player's special (Top N) badges
    const rankByLevel = {};
    [...allLevels].sort((a, b) => b.klp - a.klp).forEach((l, i) => { rankByLevel[l.name] = i + 1; });

    const MAX_ROW_BADGES = 8;
    function topBadgesFor(playerLevels) {
        return playerLevels
            .map(l => ({ key: getSpecialBadgeByRank(rankByLevel[l.name]), rank: rankByLevel[l.name], level: l.name }))
            .filter(b => b.key && BADGES[b.key])
            .sort((a, b) => a.rank - b.rank);
    }

    // Convert to array & compute PLP, excluding retired players
    let playerList = Object.entries(playerMap)
        .filter(([name]) => !retiredPlayers.has(name)) // exclude retired players from leaderboard
        .map(([name, data]) => ({
            name,
            klp: data.klp,
            levels: data.levels,
            plp: calculatePlayerScore(data.levels),
            badges: topBadgesFor(data.levels)
        }));

    // Sort by PLP initially
    playerList.sort((a, b) => b.plp - a.plp);

    // --- DOM elements ---
    const searchInput = document.getElementById('player-search');
    const pointTypeSelect = document.getElementById('metric-filter');
    const klpTypeSelect = document.getElementById('klp-type-filter');
    const clearBtn = document.getElementById('clear-filters');
    const listContainer = document.getElementById('player-list');
    const totalEl = document.getElementById('player-total-klp');

    function updateKLPTypeVisibility() {
        if (!klpTypeSelect) return;
        klpTypeSelect.style.display = pointTypeSelect.value === 'klp' ? 'inline-block' : 'none';
    }

    searchInput.addEventListener('input', renderPlayers);
    pointTypeSelect.addEventListener('change', () => {
        updateKLPTypeVisibility();
        renderPlayers();
    });
    klpTypeSelect.addEventListener('change', renderPlayers);
    if (clearBtn) clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        pointTypeSelect.value = 'plp';
        klpTypeSelect.value = 'all';
        updateKLPTypeVisibility();
        renderPlayers();
    });

    function renderPlayers() {
        const search = (searchInput.value || '').toLowerCase();
        const pointType = pointTypeSelect.value;
        const klpType = klpTypeSelect.value;

        let filtered = playerList.filter(p => p.name.toLowerCase().includes(search));

        filtered = filtered.map(p => {
            let displayPoints;
            if (pointType === 'plp') {
                displayPoints = p.plp;
            } else { // KLP
                let levels = p.levels;
                if (klpType !== 'all') levels = levels.filter(l => l.type === klpType);
                displayPoints = levels.reduce((sum, l) => sum + l.klp, 0);
            }
            return { ...p, displayPoints };
        });

        filtered.sort((a, b) => b.displayPoints - a.displayPoints);

        if (clearBtn) {
            const anyActive = search !== '' || pointType !== 'plp' || klpType !== 'all';
            clearBtn.style.display = anyActive ? '' : 'none';
        }

        let totalPoints;
        if (pointType === 'plp') {
            totalPoints = playerList.reduce((sum, p) => sum + p.plp, 0);
        } else {
            totalPoints = playerList.reduce((sum, p) => {
                let levels = p.levels;
                if (klpType !== 'all') levels = levels.filter(l => l.type === klpType);
                return sum + levels.reduce((s, l) => s + l.klp, 0);
            }, 0);
        }

        const totalLabel = pointType === 'klp' 
            ? t('total_klp', { count: totalPoints.toLocaleString() })
            : t('total_plp', { count: totalPoints.toLocaleString(), defaultValue: `Total: ${totalPoints.toLocaleString()} PLP` });

        const suffix = pointType === 'klp' ? 'KLP' : 'PLP';
        totalEl.innerText = totalLabel;

        // --- Render list ---
        listContainer.innerHTML = '';
        if (!filtered.length) {
            listContainer.innerHTML = `<div class="no-results">${t('no_results_found')}</div>`;
            return;
        }

        filtered.forEach((p, idx) => {
            const playerLink = document.createElement('a');
            playerLink.className = 'level-link-wrapper';
            playerLink.href = `../PlayerDetails.html?name=${encodeURIComponent(p.name)}`;

            const div = document.createElement('div');
            div.className = 'level';
            
            div.innerHTML = `
                <div class="level-summary" role="button">
                    <span class="rank-board board-9slice sm">#${idx + 1}</span>
                    <span class="name-board board-9slice sm">${highlightText(p.name)}</span>
                    <div class="summary-right">
                        <div class="mini-badge-list"></div>
                        <strong class="score-board board-9slice sm">${Math.round(p.displayPoints)} ${suffix}</strong>
                    </div>
                </div>
            `;

            const badgeContainer = div.querySelector('.mini-badge-list');
            const shown = p.badges.slice(0, MAX_ROW_BADGES);
            shown.forEach((b, i) => {
                const img = document.createElement('img');
                img.src = `../${BADGES[b.key].icon}`;
                img.className = 'mini-badge';
                img.title = `${BADGES[b.key].label} - ${b.level}`;
                if (i > 0) img.style.marginLeft = '-10px';
                badgeContainer.appendChild(img);
            });
            if (p.badges.length > shown.length) {
                const more = document.createElement('span');
                more.className = 'mini-badge-more';
                more.textContent = `+${p.badges.length - shown.length}`;
                badgeContainer.appendChild(more);
            }

            playerLink.appendChild(div);
            listContainer.appendChild(playerLink);
        });

        const patterns = Array.from({ length: 13 }, (_, i) => `../images/pattern/pattern${i}.png`);
        applyRandomPattern('.level-summary', patterns);
    }

    function highlightText(text) {
        const search = (searchInput.value || '').toLowerCase();
        if (!search) return escapeHtml(text || '');
        const regex = new RegExp(`(${escapeRegExp(search)})`, 'gi');
        return escapeHtml(text || '').replace(regex, '<mark>$1</mark>');
    }

    function escapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
    }

    function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    updateKLPTypeVisibility();
    renderPlayers();

    // --- Secret CSV export ---
    document.addEventListener('keydown', e => {
        if (e.shiftKey && e.key === 'E') {
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0]; 
            const headers = ['Date', 'Name', 'PLP', 'KLP', 'Verifications', 'Victors'];

            const rows = playerList.map(p => {
                const verifications = p.levels
                    .filter(l => l.type === 'Verification')
                    .map(l => `${l.name}(${l.klp})`)
                    .join('; ');

                const victors = p.levels
                    .filter(l => l.type === 'Victor')
                    .map(l => `${l.name}(${l.klp})`)
                    .join('; ');

                return [
                    dateStr,       
                    p.name,
                    p.plp,
                    p.klp,
                    verifications,
                    victors
                ];
            });

            const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            const filename = `player_data_${dateStr}.csv`;
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);

            console.log(`Secret CSV export triggered! File: ${filename}`);
        }
    });

})();