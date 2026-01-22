import { fetchJson } from '../js/utils.js';
import { calculatePlayerScore } from '../score.js';

(async function () {

  // --- Fetch data ---
  const levels = await fetchJson('../levels.json');
  const challenges = await fetchJson('../challenges.json');
  const victorsData = await fetchJson('../victors.json');
  const allLevels = [...levels, ...challenges];

  // --- Level lookup ---
  const levelByName = {};
  allLevels.forEach(l => levelByName[l.name] = l);

  // --- Build player data ---
  const playerMap = {};

  // Verifiers
  allLevels.forEach(level => {
    if (!level.verifier) return;
    const p = level.verifier;
    if (!playerMap[p]) playerMap[p] = { levels: [] };
    playerMap[p].levels.push({ name: level.name, klp: level.klp });
  });

  // Victors
  Object.entries(victorsData).forEach(([player, names]) => {
    names.forEach(n => {
      const lvl = levelByName[n];
      if (!lvl) return;
      if (!playerMap[player]) playerMap[player] = { levels: [] };
      playerMap[player].levels.push({ name: lvl.name, klp: lvl.klp });
    });
  });

  // --- Convert to list ---
  let players = Object.entries(playerMap).map(([name, data]) => ({
    name,
    levels: data.levels,
    klp: data.levels.reduce((sum, l) => sum + l.klp, 0),
    plp: calculatePlayerScore(data.levels)
  }));

  // --- Dummy player ---
  const DUMMY = { name: 'Player-Dummy', levels: [], klp: 0, plp: 0 };
  players.sort((a, b) => b.plp - a.plp);

  // --- DOM ---
  const playerSelect = document.getElementById('player-select');
  const levelSelect = document.getElementById('level-select');
  const resultsBox = document.getElementById('compare-results');

  // --- Totals container (always there) ---
  let totalContainer = document.getElementById('totals-container');
  if (!totalContainer) {
    totalContainer = document.createElement('div');
    totalContainer.id = 'totals-container';
    totalContainer.style.marginBottom = '1em';
    resultsBox.prepend(totalContainer);
  }

  // --- Populate player dropdown ---
  playerSelect.innerHTML = '';
  const dummyOpt = document.createElement('option');
  dummyOpt.value = DUMMY.name;
  dummyOpt.textContent = 'Player-Dummy';
  playerSelect.appendChild(dummyOpt);

  players.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    playerSelect.appendChild(opt);
  });

  // --- Available levels ---
  function getAvailableLevels(playerName) {
    if (playerName === DUMMY.name) return allLevels.slice(); // all levels selectable
    const completed = new Set(playerMap[playerName]?.levels.map(l => l.name) || []);
    return allLevels.filter(l => !completed.has(l.name));
  }

  // --- Player change ---
  function updateLevelSelect() {
    const name = playerSelect.value;
    const available = getAvailableLevels(name);
    available.sort((a, b) => b.klp - a.klp);

    levelSelect.innerHTML = '<option value="" disabled selected>Select Level</option>';
    available.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.name;
      opt.textContent = l.name;
      levelSelect.appendChild(opt);
    });
    levelSelect.disabled = !available.length;
    resultsBox.style.display = 'none';
  }

  playerSelect.addEventListener('change', updateLevelSelect);

  // --- Simulation ---
  levelSelect.addEventListener('change', () => {
    const playerName = playerSelect.value;
    const levelName = levelSelect.value;
    if (!playerName || !levelName) return;

    const player = playerName === DUMMY.name ? DUMMY : players.find(p => p.name === playerName);
    const level = levelByName[levelName];

    const newLevels = [...player.levels, { name: level.name, klp: level.klp }];
    const newPLP = calculatePlayerScore(newLevels);
    const plpChange = newPLP - (player.plp || 0);

    // --- Rank calculations ---
    const baseRanks = players.slice().sort((a, b) => b.plp - a.plp).map(p => p.name);
    const oldRank = playerName === DUMMY.name ? '–' : baseRanks.indexOf(player.name) + 1;
    const simulated = players.map(p =>
      p.name === player.name ? { ...p, plp: newPLP } : p
    ).sort((a, b) => b.plp - a.plp);
    const newRank = playerName === DUMMY.name ? '–' : simulated.findIndex(p => p.name === player.name) + 1;

    // --- Totals ---
    const totalKLP = newLevels.reduce((sum, l) => sum + l.klp, 0);
    const totalPLP = newPLP;
    totalContainer.innerHTML = `
      <strong>Total KLP:</strong> ${totalKLP.toLocaleString()} KLP |
      <strong>Total PLP Curve:</strong> ${totalPLP.toFixed(2)} PLP
    `;

    // --- Update UI ---
    resultsBox.style.display = 'block';
    document.getElementById('klp-gain').textContent =
      `KLP Gain: +${level.klp.toLocaleString()} KLP`;
    document.getElementById('plp-change').textContent =
      `PLP Change: ${plpChange >= 0 ? '+' : '−'}${Math.abs(plpChange).toFixed(2)} PLP`;
    document.getElementById('rank-change').textContent =
      `Rank: ${oldRank} → ${newRank}`;

    // --- Breakdown ---
    document.getElementById('breakdown-table').innerHTML = `
      <h3>Level Breakdown</h3>
      <table style="width:100%;text-align:left;">
        <thead>
          <tr><th>Level</th><th>KLP</th></tr>
        </thead>
        <tbody>
          ${newLevels.map(l => `
            <tr ${l.name === level.name ? 'style="font-weight:bold;"' : ''}>
              <td>${l.name}${l.name === level.name ? ' (simulated)' : ''}</td>
              <td>${l.klp} KLP</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  });

  // --- Initial setup ---
  playerSelect.value = DUMMY.name;
  updateLevelSelect();

})();
