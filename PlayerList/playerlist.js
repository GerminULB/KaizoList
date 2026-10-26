import { applyRandomPattern } from '../js/utils.js';
import { loadLevels, loadPlayers } from '../js/data.js';
import { BADGES, getSpecialBadgeByRank } from '../js/badge.js';
import { calculatePlayerScore } from '../score.js';
import { t } from '../js/i18n.js';

(async function() {

    const [allLevels, players] = await Promise.all([loadLevels(), loadPlayers()]);
    const levelById = new Map(allLevels.map(l => [String(l.id), l]));

    const playerMap = {};
    const retiredPlayers = new Set(players.filter(p => p.retired).map(p => p.username));
    [...players].sort((a, b) => a.username.localeCompare(b.username)).forEach(p => {
        const entries = [
            ...p.verifiedLevels.map(id => [id, 'Verification']),
            ...p.beatenLevels.map(id => [id, 'Victor']),
        ];
        entries.forEach(([id, type]) => {
            const level = levelById.get(String(id));
            if (!level) return;
            if (!playerMap[p.username]) playerMap[p.username] = { klp: 0, levels: [] };
            playerMap[p.username].klp += level.klp;
            playerMap[p.username].levels.push({ name: level.name, klp: level.klp, type });
        });
    });

    // level rank by KLP for the top N badges
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

    const creatorMap = new Map();
    allLevels.forEach(l => String(l.creator || '').split(',').map(c => c.trim()).filter(Boolean).forEach(c => {
        const key = c.toLowerCase();
        const entry = creatorMap.get(key) || { name: players.find(p => p.username.toLowerCase() === key)?.username || c, levels: [] };
        entry.levels.push(l);
        creatorMap.set(key, entry);
    }));
    const creatorList = [...creatorMap.values()].map(c => {
        const klp = c.levels.reduce((s, l) => s + l.klp, 0);
        return { name: c.name, count: c.levels.length, klp, avgKlp: Math.round(klp / c.levels.length), ids: c.levels.map(l => String(l.id)), badges: [] };
    });
    let creatorEnjoy = null;
    async function loadCreatorEnjoy() {
        const { loadEnjoyment } = await import('../js/enjoyment.js');
        const perLevel = await loadEnjoyment(allLevels.map(l => l.id), players).catch(() => new Map());
        creatorEnjoy = new Map(creatorList.map(c => {
            const scores = c.ids.map(id => perLevel.get(id)?.avg).filter(v => v != null);
            return [c.name, scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : null];
        }));
    }

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

        const arch = pointType.startsWith('arch_');
        if (pointType === 'arch_enjoy' && !creatorEnjoy) {
            listContainer.innerHTML = '<p class="submit-center"><span class="kl-loading"></span></p>';
            loadCreatorEnjoy().then(renderPlayers);
            return;
        }
        let filtered = (arch ? creatorList : playerList).filter(p => p.name.toLowerCase().includes(search));

        if (arch) filtered = filtered.map(c => {
            const enjoy = creatorEnjoy?.get(c.name);
            const shown = {
                arch_levels: [c.count, `${c.count} ${t(c.count === 1 ? 'arch_level_unit_one' : 'arch_level_unit')}`],
                arch_klp: [c.klp, `${c.klp.toLocaleString()} KLP`],
                arch_avgklp: [c.avgKlp, `${c.avgKlp.toLocaleString()} ${t('arch_avg_klp_unit')}`],
                arch_enjoy: [enjoy ?? -1, `<img class="kl-score-ico" src="/images/icon/enjoyment.png" alt="">${enjoy == null ? '-' : (Math.round(enjoy * 10) / 10).toFixed(1)}`],
            }[pointType];
            return { ...c, displayPoints: shown[0], displayText: shown[1] };
        });
        else filtered = filtered.map(p => {
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
            const anyActive = search !== '' || pointType !== 'plp' || (pointType === 'klp' && klpType !== 'all');
            clearBtn.style.display = anyActive ? '' : 'none';
        }

        let totalPoints;
        if (arch) {
            totalPoints = pointType === 'arch_levels' ? allLevels.length
                : pointType === 'arch_klp' ? allLevels.reduce((s, l) => s + l.klp, 0) : 0;
        } else if (pointType === 'plp') {
            totalPoints = playerList.reduce((sum, p) => sum + p.plp, 0);
        } else {
            totalPoints = playerList.reduce((sum, p) => {
                let levels = p.levels;
                if (klpType !== 'all') levels = levels.filter(l => l.type === klpType);
                return sum + levels.reduce((s, l) => s + l.klp, 0);
            }, 0);
        }

        const totalLabel = pointType === 'arch_levels' ? t('total_levels_created', { count: totalPoints.toLocaleString() })
            : pointType === 'arch_klp' ? t('total_klp', { count: totalPoints.toLocaleString() })
            : arch ? t('total_creators', { count: creatorList.length.toLocaleString() })
            : pointType === 'klp' 
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
                        <strong class="score-board board-9slice sm">${p.displayText ?? `${Math.round(p.displayPoints)} ${suffix}`}</strong>
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
                if (i > 0) img.style.marginLeft = '-22px';
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

})();