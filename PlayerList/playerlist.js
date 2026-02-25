import { fetchJson, splitNames, applyRandomPattern } from '../js/utils.js';
import { calculatePlayerScore } from '../score.js';
import { t } from '../js/i18n.js';
(async function() {

    // Fetch all data
    const levels = await fetchJson('../levels.json');
    const challenges = await fetchJson('../challenges.json');
    const victorsData = await fetchJson('../victors.json');
    const allLevels = [...levels, ...challenges];

    const playerMap = {};

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

    // Convert to array & compute PLP
    let playerList = Object.entries(playerMap).map(([name, data]) => ({
        name,
        klp: data.klp,
        levels: data.levels,
        plp: calculatePlayerScore(data.levels)
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

        // --- OVERHAUL: translated total label ---
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
            
            const suffix = pointType.toUpperCase();

            div.innerHTML = `
                <div class="level-summary" role="button">
                    <span>#${idx + 1}: ${highlightText(p.name)}</span>
                    <strong>${Math.round(p.displayPoints)} ${suffix}</strong>
                </div>
            `;

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