import { fetchJson } from '../js/utils.js';
import { calculatePlayerScore, calculatePlayerScoreBreakdown } from '../score.js';
import { t } from '../js/i18n.js';

(async function () {
    const levels = await fetchJson('../levels.json') || [];
    const challenges = await fetchJson('../challenges.json') || [];
    const victorsData = await fetchJson('../victors.json') || {};

    const allLevels = [...levels, ...challenges];
    const levelByName = Object.fromEntries(allLevels.map(l => [l.name, l]));

    const playerMap = {};
    //  duuummy start
    const DUMMY_NAME = t('dummy_player_name', { defaultValue: 'New Player (Simulation)' });

    function initPlayer(name) {
        if (!playerMap[name]) playerMap[name] = { levels: [] };
    }

    allLevels.forEach(lvl => {
        if (lvl.verifier) {
            initPlayer(lvl.verifier);
            playerMap[lvl.verifier].levels.push({ name: lvl.name, klp: lvl.klp });
        }
    });

    Object.entries(victorsData).forEach(([player, levelNames]) => {
        initPlayer(player);
        levelNames.forEach(lvlName => {
            const lvl = levelByName[lvlName];
            if (lvl) playerMap[player].levels.push({ name: lvl.name, klp: lvl.klp });
        });
    });

    const players = Object.entries(playerMap)
        .map(([name, data]) => ({
            name,
            levels: data.levels,
            klp: data.levels.reduce((s, l) => s + l.klp, 0),
            plp: calculatePlayerScore(data.levels)
        }))
        .sort((a, b) => b.plp - a.plp);

    const DUMMY_BASE = { name: DUMMY_NAME, levels: [], klp: 0, plp: 0 };

    const playerSelect = document.getElementById('player-select');
    const levelSelect = document.getElementById('level-select');
    const resultsBox = document.getElementById('compare-results');

    const ui = {
        klpGain: document.getElementById('klp-gain'),
        totalKlp: document.getElementById('total-klp'),
        plpChange: document.getElementById('plp-change'),
        totalPlp: document.getElementById('total-plp'),
        rank: document.getElementById('rank-change'),
        plpPeak: document.getElementById('plp-peak'),
        plpConsistency: document.getElementById('plp-consistency'),
        plpBreadth: document.getElementById('plp-breadth'),
        breakdown: document.getElementById('breakdown-table')
    };

    const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

    function populatePlayers() {
        playerSelect.innerHTML = "";
        const dummyOpt = new Option(DUMMY_NAME, DUMMY_NAME);
        playerSelect.appendChild(dummyOpt);
        
        players.forEach(p => playerSelect.appendChild(new Option(p.name, p.name)));
        playerSelect.value = DUMMY_NAME;
    }

    function updateLevelSelect() {
        const playerName = playerSelect.value;
        const completed = new Set(playerMap[playerName]?.levels.map(l => l.name) || []);
        
        const available = allLevels
            .filter(l => !completed.has(l.name))
            .sort((a, b) => b.klp - a.klp);

        levelSelect.innerHTML = `<option value="" disabled selected>${t('select_level_prompt', { defaultValue: 'Select Level to complete...' })}</option>`;
        
        available.forEach(l => {
            levelSelect.appendChild(new Option(`${l.name} (${l.klp} KLP)`, l.name));
        });

        levelSelect.disabled = available.length === 0;
        resultsBox.style.display = 'none';
    }

    function styleDelta(element, value, prefix = '+') {
        if (value > 0) {
            element.textContent = `${prefix}${fmt.format(value)}`;
            element.className = 'stat-delta delta-positive';
        } else {
            element.textContent = t('no_change', { defaultValue: 'No Change' });
            element.className = 'stat-delta delta-neutral';
        }
    }

    function simulate() {
        const playerName = playerSelect.value;
        const levelName = levelSelect.value;
        if (!playerName || !levelName) return;

        const basePlayer = playerName === DUMMY_NAME 
            ? DUMMY_BASE 
            : players.find(p => p.name === playerName);
        
        const level = levelByName[levelName];
        const newLevels = [...basePlayer.levels, { name: level.name, klp: level.klp }];

        // math logic
        const breakdown = calculatePlayerScoreBreakdown(newLevels);
        const newPLP = breakdown.total;
        const plpDelta = newPLP - basePlayer.plp;
        const totalKLP = newLevels.reduce((s, l) => s + l.klp, 0);

        // rank calculation logic
        let rankString = '';
        if (playerName !== DUMMY_NAME) {
            const oldRank = players.findIndex(p => p.name === basePlayer.name) + 1;
            const simulatedBoard = players
                .map(p => p.name === basePlayer.name ? { ...p, plp: newPLP } : p)
                .sort((a, b) => b.plp - a.plp);
            const newRank = simulatedBoard.findIndex(p => p.name === basePlayer.name) + 1;
            
            rankString = oldRank === newRank ? `#${newRank}` : `#${oldRank} ➔ #${newRank}`;
        } else {
            const projected = [...players, { ...DUMMY_BASE, plp: newPLP }].sort((a, b) => b.plp - a.plp);
            const entryRank = projected.findIndex(p => p.name === DUMMY_NAME) + 1;
            
            rankString = t('enters_at_rank', { rank: entryRank, defaultValue: `Enters at #${entryRank}` });
        }

        ui.rank.textContent = rankString;
        ui.totalPlp.textContent = fmt.format(newPLP);
        ui.totalKlp.textContent = fmt.format(totalKLP);
        
        styleDelta(ui.plpChange, plpDelta);
        styleDelta(ui.klpGain, level.klp);

        ui.plpPeak.textContent = fmt.format(breakdown.peak);
        ui.plpConsistency.textContent = fmt.format(breakdown.consistency);
        ui.plpBreadth.textContent = fmt.format(breakdown.breadth);

        const sortedNewLevels = [...newLevels].sort((a, b) => b.klp - a.klp);
        ui.breakdown.innerHTML = `
            <h3>${t('updated_roster_title', { defaultValue: 'Updated Level Roster' })}</h3>
            <div style="max-height: 300px; overflow-y: auto; padding-right: 5px;">
                <table class="rpg-table">
                    <thead>
                        <tr>
                            <th>${t('level_name_label', { defaultValue: 'Level Name' })}</th>
                            <th style="text-align: right;">KLP</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedNewLevels.map(l => `
                            <tr class="${l.name === level.name ? 'simulated-row' : ''}">
                                <td>
                                    ${l.name} 
                                    ${l.name === level.name ? `<small>(${t('simulated_label', { defaultValue: 'Simulated' })})</small>` : ''}
                                </td>
                                <td style="text-align: right;">${fmt.format(l.klp)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        resultsBox.style.display = 'block';
    }


    playerSelect.addEventListener('change', updateLevelSelect);
    levelSelect.addEventListener('change', simulate);

    populatePlayers();
    updateLevelSelect();

})();