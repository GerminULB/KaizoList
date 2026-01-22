import { fetchJson } from '../js/utils.js';
import {
  calculatePlayerScore,
  calculatePlayerScoreBreakdown
} from '../score.js';

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

  const players = Object.entries(playerMap)
    .map(([name, data]) => ({
      name,
      levels: data.levels,
      klp: data.levels.reduce((s, l) => s + l.klp, 0),
      plp: calculatePlayerScore(data.levels)
    }))
    .sort((a, b) => b.plp - a.plp);

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

    plpPeak: document.getElementById('plp-peak'),
    plpConsistency: document.getElementById('plp-consistency'),
    plpBreadth: document.getElementById('plp-breadth'),

    breakdown: document.getElementById('breakdown-table')
  };

  /* =========================
     Animation Helpers
  ========================= */

  function animateNumber(el, from, to, duration = 500, formatter = v => v) {
    const start = performance.now();

    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = t * (2 - t); // easeOutQuad
      const value = from + (to - from) * eased;

      el.textContent = formatter(value);

      if (t < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  function animateRank(el, from, to, duration = 400) {
    if (from === to) {
      el.textContent = `${from} → ${to}`;
      return;
    }

    let current = from;
    const dir = to > from ? 1 : -1;
    const stepTime = duration / Math.abs(to - from);

    function step() {
      current += dir;
      el.textContent = `${from} → ${current}`;
      if (current !== to) {
        setTimeout(step, stepTime);
      }
    }

    step();
  }

  /* =========================
     Dropdown Logic
  ========================= */

  function populatePlayers() {
    playerSelect.innerHTML = '';
    playerSelect.appendChild(new Option(DUMMY.name, DUMMY.name));

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
     Simulation
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

    const breakdown = calculatePlayerScoreBreakdown(newLevels);
    const newPLP = breakdown.total;
    const plpDelta = newPLP - basePlayer.plp;
    const totalKLP = newLevels.reduce((s, l) => s + l.klp, 0);

    /* ----- Rank ----- */
    let oldRank = '–';
    let newRank = '–';

    if (playerName !== DUMMY.name) {
      oldRank = players.findIndex(p => p.name === basePlayer.name) + 1;

      const simulated = players
        .map(p => p.name === basePlayer.name
          ? { ...p, plp: newPLP }
          : p
        )
        .sort((a, b) => b.plp - a.plp);

      newRank = simulated.findIndex(p => p.name === basePlayer.name) + 1;
    }

    /* ----- UI Updates ----- */

    ui.klpGain.textContent = `+${level.klp.toLocaleString()}`;
    ui.totalKlp.textContent = totalKLP.toLocaleString();

    animateNumber(
      ui.totalPlp,
      basePlayer.plp,
      newPLP,
      600,
      v => v.toFixed(2)
    );

    ui.plpChange.textContent =
      `${plpDelta >= 0 ? '+' : '−'}${Math.abs(plpDelta).toFixed(2)}`;

    ui.plpPeak.textContent = breakdown.peak.toFixed(2);
    ui.plpConsistency.textContent = breakdown.consistency.toFixed(2);
    ui.plpBreadth.textContent = breakdown.breadth.toFixed(2);

    if (playerName !== DUMMY.name) {
      animateRank(ui.rank, oldRank, newRank);
    } else {
      ui.rank.textContent = '–';
    }

    /* ----- Breakdown Table ----- */

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
     Init
  ========================= */

  playerSelect.addEventListener('change', updateLevelSelect);
  levelSelect.addEventListener('change', simulate);

  populatePlayers();
  updateLevelSelect();

})();
