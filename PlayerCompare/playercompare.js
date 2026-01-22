import { fetchJson } from '../js/utils.js';
import {
  calculatePlayerScore,
  calculatePlayerScoreBreakdown
} from '../score.js';

(async function () {

  const levels = await fetchJson('../levels.json');
  const challenges = await fetchJson('../challenges.json');
  const victorsData = await fetchJson('../victors.json');
  const allLevels = [...levels, ...challenges];

  const levelByName = {};
  allLevels.forEach(l => levelByName[l.name] = l);

  const playerMap = {};

  // Verifiers
  allLevels.forEach(level => {
    if (!level.verifier) return;
    const v = level.verifier;
    if (!playerMap[v]) playerMap[v] = { klp: 0, levels: [] };
    playerMap[v].klp += level.klp;
    playerMap[v].levels.push({ name: level.name, klp: level.klp });
  });

  // Victors
  Object.entries(victorsData).forEach(([player, names]) => {
    names.forEach(name => {
      const level = levelByName[name];
      if (!level) return;
      if (!playerMap[player]) playerMap[player] = { klp: 0, levels: [] };
      playerMap[player].klp += level.klp;
      playerMap[player].levels.push({ name: level.name, klp: level.klp });
    });
  });

  let playerList = Object.entries(playerMap).map(([name, data]) => ({
    name,
    klp: data.klp,
    levels: data.levels,
    plp: calculatePlayerScore(data.levels)
  }));

  const REAL_PLAYERS = playerList;

  const playerSelect = document.getElementById('player-select');
  const levelSelect = document.getElementById('level-select');
  const resultsBox = document.getElementById('compare-results');

  // Populate players
  REAL_PLAYERS
    .slice()
    .sort((a, b) => b.plp - a.plp)
    .forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.name;
      playerSelect.appendChild(opt);
    });

  function getRemainingLevels(player) {
    const completed = new Set(player.levels.map(l => l.name));

    return allLevels
      .filter(l => !completed.has(l.name))
      .map(l => {
        const simulatedLevels = [...player.levels, { name: l.name, klp: l.klp }];
        const newPLP = calculatePlayerScore(simulatedLevels);
        return {
          ...l,
          plpGain: newPLP - player.plp
        };
      })
      .sort((a, b) => b.plpGain - a.plpGain);
  }

  playerSelect.addEventListener('change', () => {
    const player = REAL_PLAYERS.find(p => p.name === playerSelect.value);
    const remaining = getRemainingLevels(player);

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
        opt.textContent = `[+${l.plpGain.toFixed(2)} PLP] ${l.name}`;
        levelSelect.appendChild(opt);
      });
    }

    resultsBox.style.display = 'none';
  });

  levelSelect.addEventListener('change', () => {
    const player = REAL_PLAYERS.find(p => p.name === playerSelect.value);
    const level = levelByName[levelSelect.value];

    const newLevels = [...player.levels, { name: level.name, klp: level.klp }];

    const before = calculatePlayerScoreBreakdown(player.levels);
    const after = calculatePlayerScoreBreakdown(newLevels);

    const baselineRanks = REAL_PLAYERS
      .slice()
      .sort((a, b) => b.plp - a.plp)
      .map(p => p.name);

    const oldRank = baselineRanks.indexOf(player.name) + 1;

    const simulated = REAL_PLAYERS.map(p =>
      p.name === player.name ? { ...p, plp: after.total } : p
    );

    simulated.sort((a, b) => b.plp - a.plp);
    const newRank = simulated.findIndex(p => p.name === player.name) + 1;

    const plpDelta = after.total - before.total;
    const sign = plpDelta >= 0 ? '+' : '−';
    const arrow = newRank < oldRank ? '▲' : newRank > oldRank ? '▼' : '→';

    resultsBox.style.display = 'block';

    document.getElementById('klp-gain').textContent =
      `+${level.klp.toLocaleString()} KLP`;
    document.getElementById('total-klp').textContent =
      `${player.klp + level.klp} KLP`;
    document.getElementById('plp-change').textContent =
      `${sign}${Math.abs(plpDelta).toFixed(2)} PLP`;
    document.getElementById('total-plp').textContent =
      after.total.toFixed(2);
    document.getElementById('rank-change').textContent =
      `${arrow} #${oldRank} → #${newRank}`;

    document.getElementById('plp-peak').textContent =
      after.peak.toFixed(2);
    document.getElementById('plp-consistency').textContent =
      after.consistency.toFixed(2);
    document.getElementById('plp-breadth').textContent =
      after.breadth.toFixed(2);
  });

})();
