import { fetchJson } from '../js/utils.js';
import { calculatePlayerScore } from '../score.js';

(async function () {

  // --- Fetch data ---
  const levels = await fetchJson('../levels.json');
  const challenges = await fetchJson('../challenges.json');
  const victorsData = await fetchJson('../victors.json');

  const allLevels = [...levels, ...challenges];

  // --- Normalize level lookup ---
  const levelByName = {};
  allLevels.forEach(l => levelByName[l.name] = l);

  // --- Build player data ---
  const playerMap = {};

  // Verifiers
  allLevels.forEach(level => {
    if (!level.verifier) return;
    const v = level.verifier;
    if (!playerMap[v]) playerMap[v] = { klp: 0, levels: [] };
    playerMap[v].klp += level.klp;
    playerMap[v].levels.push({
      name: level.name,
      klp: level.klp
    });
  });

  // Victors
  Object.entries(victorsData).forEach(([player, levelNames]) => {
    levelNames.forEach(name => {
      const level = levelByName[name];
      if (!level) return;
      if (!playerMap[player]) playerMap[player] = { klp: 0, levels: [] };
      playerMap[player].klp += level.klp;
      playerMap[player].levels.push({
        name: level.name,
        klp: level.klp
      });
    });
  });

  // --- Convert to list ---
  let playerList = Object.entries(playerMap).map(([name, data]) => ({
    name,
    klp: data.klp,
    levels: data.levels,
    plp: calculatePlayerScore(data.levels)
  }));

  // --- Optional dummy (excluded later) ---
  playerList.push({
    name: 'Player-Dummy',
    klp: 0,
    levels: [],
    plp: 0
  });

  // --- Real players only ---
  const REAL_PLAYERS = playerList.filter(p => p.name !== 'Player-Dummy');

  // --- DOM ---
  const playerSelect = document.getElementById('player-select');
  const levelSelect = document.getElementById('level-select');
  const resultsBox = document.getElementById('compare-results');

  // --- Populate player select ---
  REAL_PLAYERS
    .slice()
    .sort((a, b) => b.plp - a.plp)
    .forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.name;
      playerSelect.appendChild(opt);
    });

  // --- Levels not yet completed ---
  function getAvailableLevels(playerName) {
    const completed = new Set(
      playerMap[playerName]?.levels.map(l => l.name) || []
    );
    return allLevels.filter(l => !completed.has(l.name));
  }

  // --- Player change ---
  playerSelect.addEventListener('change', () => {
    const name = playerSelect.value;
    const remaining = getAvailableLevels(name);

    levelSelect.innerHTML =
      '<option value="" disabled selected>Select Level</option>';

    if (!remaining.length) {
      const opt = document.createElement('option');
      opt.disabled = true;
      opt.textContent = 'No remaining levels';
      levelSelect.appendChild(opt);
      levelSelect.disabled = true;
    } else {
      levelSelect.disabled = false;
      remaining.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.name;
        opt.textContent = l.name;
        levelSelect.appendChild(opt);
      });
    }

    resultsBox.style.display = 'none';
  });

  // --- Simulation ---
  levelSelect.addEventListener('change', () => {
    const playerName = playerSelect.value;
    const levelName = levelSelect.value;
    if (!playerName || !levelName) return;

    const player = REAL_PLAYERS.find(p => p.name === playerName);
    const level = levelByName[levelName];

    // --- New PLP ---
    const newLevels = [...player.levels, {
      name: level.name,
      klp: level.klp
    }];

    const newPLP = calculatePlayerScore(newLevels);
    const plpChange = newPLP - player.plp;

    // --- Rank BEFORE ---
    const baselineRanks = REAL_PLAYERS
      .slice()
      .sort((a, b) => b.plp - a.plp)
      .map(p => p.name);

    const oldRank = baselineRanks.indexOf(player.name) + 1;

    // --- Rank AFTER ---
    const simulated = REAL_PLAYERS.map(p =>
      p.name === player.name ? { ...p, plp: newPLP } : p
    );

    simulated.sort((a, b) => b.plp - a.plp);
    const newRank = simulated.findIndex(p => p.name === player.name) + 1;

    // --- UX formatting ---
    const sign = plpChange >= 0 ? '+' : '−';
    const plpText = `${sign}${Math.abs(plpChange).toFixed(2)} PLP`;

    let arrow = '→';
    if (newRank < oldRank) arrow = '▲';
    if (newRank > oldRank) arrow = '▼';

    // --- Update UI ---
    resultsBox.style.display = 'block';
    document.getElementById('klp-gain').textContent =
      `KLP Gain: +${level.klp.toLocaleString()} KLP`;
    document.getElementById('plp-change').textContent =
      `PLP Change: ${plpText}`;
    document.getElementById('rank-change').textContent =
      `Rank Change: ${arrow} #${oldRank} → #${newRank}`;

    // --- Breakdown ---
    const rows = newLevels.map(l => {
      const isNew = l.name === level.name;
      return `
        <tr ${isNew ? 'style="font-weight:bold;"' : ''}>
          <td>${l.name}${isNew ? ' (simulated)' : ''}</td>
          <td>${l.klp} KLP</td>
        </tr>
      `;
    }).join('');

    document.getElementById('breakdown-table').innerHTML = `
      <h3>Level Breakdown</h3>
      <table style="width:100%;text-align:left;">
        <thead>
          <tr><th>Level</th><th>KLP</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  });

})();
