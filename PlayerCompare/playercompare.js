import { fetchJson } from '../js/utils.js';
import { calculatePlayerScore } from '../score.js';

(async function () {

  /* =========================
     Fetch & Prepare Data
  ========================= */

  const levels = await fetchJson('../levels.json');
  const challenges = await fetchJson('../challenges.json');
  const victorsData = await fetchJson('../victors.json');

  const allLevels = [...levels, ...challenges];

  const levelByName = Object.fromEntries(
    allLevels.map(l => [l.name, l])
  );

  /* =========================
     Build Player Map
  ========================= */

  const playerMap = {};

  // Verifiers
  allLevels.forEach(level => {
    if (!level.verifier) return;
    const name = level.verifier;
    playerMap[name] ??= { levels: [] };
    playerMap[name].levels.push({ name: level.name, klp: level.klp });
  });

  // Victors
  Object.entries(victorsData).forEach(([player, levelNames]) => {
    playerMap[player] ??= { levels: [] };
    levelNames.forEach(lvlName => {
      const lvl = levelByName[lvlName];
      if (lvl) {
        playerMap[player].levels.push({ name: lvl.name, klp: lvl.klp });
      }
    });
  });

  /* =========================
     Player List
  ========================= */

  const players = Object.entries(playerMap).map(([name, data]) => ({
    name,
    levels: data.levels,
    klp: data.levels.reduce((s, l) => s + l.klp, 0),
    plp: calculatePlayerScore(data.levels)
  })).sort((a, b) => b.plp - a.plp);

  const DUMMY = {
    name: 'Player-Dummy',
    levels: [],
    klp: 0,
    plp: 0
  };

  /* =========================
     DOM References
  ========================= */

  const playerSelect = document.getElementById('player-select');
  const levelSelect = document.getElementById('level-select');
  const resultsBox = document.getElementById('compare-results');

  const ui = {
    klpGain: document.getElementById('klp-gain'),
    totalKlp: document.getElementById('total-klp'),
    plpChange: document.getElementById('plp-change'),
    totalPlp: document.getElementById('total-plp'),
    rank: document.getElementById('rank-change'),
    breakdown: document.getElementById('breakdown-table'),

    // Optional future use
    plpPeak: document.getElementById('plp-peak'),
    plpConsistency: document.getElementById('plp-consistency'),
    plpBreadth: document.getElementById('plp-breadth')
  };

  /* =========================
     Dropdown Population
  ========================= */

  function populatePlayers() {
    playerSelect.innerHTML = '';

    const dummyOpt = new Option(DUMMY.name, DUMMY.name);
    playerSelect.appendChild(dummyOpt);

    players.forEach(p => {
      playerSelect.appendChild(new Option(p.name, p.name));
    });

    playerSelect.value = DUMMY.name;
  }

  function getAvailableLevels(playerName) {
    if (playerName === DUMMY.name) return [...allLevels];

    const completed = new Set(
      playerMap[playerName]?.levels.map(l => l.name) ?? []
    );

    return allLevels.filter(l => !completed.has(l.name));
  }

  function updateLevelSelect() {
    const name = playerSelect.value;
    const available = getAvailableLevels(name)
      .sort((a, b) => b.klp - a.klp);

    levelSelect.innerHTML =
      '<option value="" disabled selected>Select Level</option>';

    available.forEach(l =>
      levelSelect.appendChild(new Option(l.name, l.name))
    );

    levelSelect.disabled = available.length === 0;
    resultsBox.style.display = 'none';
  }

  /* =========================
     Simulation + UI Update
  ========================= */

  function simulate() {
    const playerName = playerSelect.value;
    const levelName = levelSelect.value;
    if (!playerName || !levelName) return;

    const basePlayer =
      playerName === DUMMY.name
        ? DUMMY
        : players.find(p => p.name === playerName);

    const level = levelByName[levelName];

    const newLevels = [
      ...basePlayer.levels,
      { name: level.name, klp: level.klp }
    ];

    const newPLP = calculatePlayerScore(newLevels);
    const plpDelta = newPLP - basePlayer.plp;
    const totalKLP = newLevels.reduce((s, l) => s + l.klp, 0);

    /* ----- Rank ----- */
    let rankText = '–';

    if (playerName !== DUMMY.name) {
      const oldRank = players.findIndex(p => p.name === basePlayer.name) + 1;

      const simulated = players
        .map(p => p.name === basePlayer.name
          ? { ...p, plp: newPLP }
          : p
        )
        .sort((a, b) => b.plp - a.plp);

      const newRank = simulated.findIndex(p => p.name === basePlayer.name) + 1;
      rankText = `${oldRank} → ${newRank}`;
    }

    /* ----- UI ----- */
    ui.klpGain.textContent = `+${level.klp.toLocaleString()}`;
    ui.totalKlp.textContent = totalKLP.toLocaleString();
    ui.plpChange.textContent =
      `${plpDelta >= 0 ? '+' : '−'}${Math.abs(plpDelta).toFixed(2)}`;
    ui.totalPlp.textContent = newPLP.toFixed(2);
    ui.rank.textContent = rankText;

    /* ----- Breakdown ----- */
    ui.breakdown.innerHTML = `
      <h3>Level Breakdown</h3>
      <table style="width:100%;text-align:left;">
        <thead>
          <tr><th>Level</th><th>KLP</th></tr>
        </thead>
        <tbody>
          ${newLevels.map(l => `
            <tr ${l.name === level.name ? 'style="font-weight:bold;"' : ''}>
              <td>${l.name}${l.name === level.name ? ' (simulated)' : ''}</td>
              <td>${l.klp}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    resultsBox.style.display = 'block';
  }

  /* =========================
     Events & Init
  ========================= */

  playerSelect.addEventListener('change', updateLevelSelect);
  levelSelect.addEventListener('change', simulate);

  populatePlayers();
  updateLevelSelect();

})();
