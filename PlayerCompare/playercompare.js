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
    klp: data.levels.reduce((a, b) => a + b.klp, 0),
    plp: calculatePlayerScore(data.levels)
  }));

  // --- Dummy player ---
  const DUMMY = {
    name: 'Player-Dummy',
    klp: 0,
    levels: [],
    plp: 0
  };

  // --- Sort players by PLP ---
  players.sort((a, b) => b.plp - a.plp);

  // --- DOM ---
  const playerSelect = document.getElementById('player-select');
  const levelSelect = document.getElementById('level-select');
  const resultsBox = document.getElementById('compare-results');

  // --- Populate player dropdown ---
  playerSelect.innerHTML = '';
  const dummyOpt = document.createElement('option');
  dummyOpt.value = DUMMY.name;
  dummyOpt.textContent = '#0 Player-Dummy';
  playerSelect.appendChild(dummyOpt);

  players.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = `#${i + 1} ${p.name}`;
    playerSelect.appendChild(opt);
  });

  // --- Available levels (sorted by KLP) ---
  function getAvailableLevels(playerName) {
    const completed = new Set(
      playerMap[playerName]?.levels.map(l => l.name) || []
    );

    return allLevels
      .filter(l => !completed.has(l.name))
      .sort((a, b) => b.klp - a.klp);
  }

  // --- Player change ---
  playerSelect.addEventListener('change', () => {
    const name = playerSelect.value;

    levelSelect.innerHTML =
      '<option value="" disabled selected>Select Level</option>';

    if (name === DUMMY.name) {
      levelSelect.disabled = true;
      resultsBox.style.display = 'none';
      return;
    }

    const available = getAvailableLevels(name);

    available.forEach((l, i) => {
      const opt = document.createElement('option');
      opt.value = l.name;
      opt.textContent = `#${i + 1} ${l.name}`;
      levelSelect.appendChild(opt);
    });

    levelSelect.disabled = !available.length;
    resultsBox.style.display = 'none';
  });

  // --- Simulation ---
  levelSelect.addEventListener('change', () => {
    const playerName = playerSelect.value;
    const levelName = levelSelect.value;
    if (!playerName || !levelName) return;

    const player = players.find(p => p.name === playerName);
    const level = levelByName[levelName];

    // --- New PLP ---
    const newLevels = [...player.levels, { name: level.name, klp: level.klp }];
    const newPLP = calculatePlayerScore(newLevels);
    const plpChange = newPLP - player.plp;

    // --- Rank before ---
    const baseRanks = players
      .slice()
      .sort((a, b) => b.plp - a.plp)
      .map(p => p.name);

    const oldRank = baseRanks.indexOf(player.name) + 1;

    // --- Rank after ---
    const simulated = players.map(p =>
      p.name === player.name ? { ...p, plp: newPLP } : p
    );

    simulated.sort((a, b) => b.plp - a.plp);
    const newRank = simulated.findIndex(p => p.name === player.name) + 1;

    // --- UI ---
    resultsBox.style.display = 'block';

    document.getElementById('klp-gain').textContent =
      `KLP Gain: +${level.klp.toLocaleString()} KLP`;

    document.getElementById('plp-change').textContent =
      `PLP Change: ${plpChange >= 0 ? '+' : '−'}${Math.abs(plpChange).toFixed(2)} PLP`;

    document.getElementById('rank-change').textContent =
      `Rank: #${oldRank} → #${newRank}`;

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

})();
