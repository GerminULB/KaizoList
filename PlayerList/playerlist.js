async function loadPlayers() {
  // Fetch all sources
  const [levelsRes, challengesRes, victorsRes] = await Promise.all([
    fetch('../levels.json'),
    fetch('../challenges.json'),
    fetch('../victors.json')
  ]);

// Parameters
const N = 10;        // top 10 clears count
const alpha = 1.25;  // superlinear exponent
const beta = 20;     // breadth bonus multiplier

function calculatePlayerScore(levelsCleared) {
    // levelsCleared = array of {name, klp} objects
    const klps = levelsCleared.map(l => l.klp).sort((a,b)=>b-a);
    const topKlps = klps.slice(0, N);
    const transformed = topKlps.map(k => Math.pow(k, alpha));
    const sumTop = transformed.reduce((a,b)=>a+b,0);
    const breadthBonus = beta * Math.log(1 + klps.length);
    return sumTop + breadthBonus;
}

  
  const levels = await levelsRes.json();
  const challenges = await challengesRes.json();
  const victors = await victorsRes.json();

  // Merge levels + challenges
  const allLevels = [...levels, ...challenges];

  const playerMap = {};

  // Add verifiers from existing levels
  for (const level of allLevels) {
    const verifier = level.verifier;
    if (!verifier) continue;
    if (!playerMap[verifier]) playerMap[verifier] = { klp: 0, levels: [] };
    playerMap[verifier].klp += level.klp;
    playerMap[verifier].levels.push({ name: level.name, klp: level.klp, type: 'Verification' });
  }

  // Add victors
  for (const [player, levelNames] of Object.entries(victors)) {
    for (const levelName of levelNames) {
      const level = allLevels.find(l => l.name === levelName);
      if (!level) continue;
      if (!playerMap[player]) playerMap[player] = { klp: 0, levels: [] };
      playerMap[player].klp += level.klp;
      playerMap[player].levels.push({ name: level.name, klp: level.klp, type: 'Victor' });
    }
  }

  // Convert map to array & sort by KLP descending
const playerList = Object.entries(playerMap)
  .map(([name, data]) => ({
      name,
      klp: data.klp,
      levels: data.levels,
      plp: calculatePlayerScore(data.levels) // NEW: Player List Points
  }))
  .sort((a, b) => b.plp - a.plp); // sort by PLP instead of raw KLP

  // Render total KLP
  const totalKLP = playerList.reduce((sum, p) => sum + p.klp, 0);
  document.getElementById('player-total-klp').innerText = `Total: ${totalKLP.toLocaleString()} KLP`;

  // Render players
  const container = document.getElementById('player-list');
  container.innerHTML = '';

  playerList.forEach((player, index) => {
    const div = document.createElement('div');
    div.className = 'level';
    div.innerHTML = `
   <div class="level-summary">
    <span>#${index + 1}: ${player.name}</span>
    <strong>${player.plp.toFixed(0)} PLP</strong>
  </div>
    `;

    // Click opens playerDetails.html in a NOT new tab LMAOOOOO
    div.querySelector('.level-summary').addEventListener('click', () => {
      window.location.href = `../PlayerDetails.html?name=${encodeURIComponent(player.name)}`;
    });

    container.appendChild(div);
  });
}

loadPlayers();
