async function loadPlayers() {
  const [levelsRes, challengesRes, victorsRes] = await Promise.all([
    fetch('levels.json'),
    fetch('challenges.json'),
    fetch('victors.json')
  ]);
  const levels = await levelsRes.json();
  const challenges = await challengesRes.json();
  const victors = await victorsRes.json();

  const allLevels = [...levels, ...challenges];
  const playerMap = {};

  // Verifiers
  for (const level of allLevels) {
    const verifier = level.verifier;
    if (!playerMap[verifier]) playerMap[verifier] = { klp: 0, levels: [] };
    playerMap[verifier].klp += level.klp;
    playerMap[verifier].levels.push({ name: level.name, klp: level.klp, type: 'Verification' });
  }

  // Victors
  for (const entry of victors) {
    const level = allLevels.find(l => l.name === entry.levelName);
    if (!level) continue;
    const player = entry.player;
    if (!playerMap[player]) playerMap[player] = { klp: 0, levels: [] };
    playerMap[player].klp += level.klp;
    playerMap[player].levels.push({ name: level.name, klp: level.klp, type: 'Victor' });
  }

  const playerList = Object.entries(playerMap)
    .map(([name, data]) => ({ name, klp: data.klp, levels: data.levels }))
    .sort((a, b) => b.klp - a.klp);

  const container = document.getElementById('player-list');
  container.innerHTML = '';

  const totalKLP = playerList.reduce((sum, p) => sum + p.klp, 0);
  document.getElementById('player-total-klp').innerText = `Total: ${totalKLP.toLocaleString()} KLP`;

  playerList.forEach((player, index) => {
    const div = document.createElement('div');
    div.className = 'level';
    div.innerHTML = `
      <div class="level-summary">
        <span>#${index + 1}: ${player.name}</span>
        <strong>${player.klp} KLP</strong>
      </div>
      <div class="level-details">
        ${player.levels.map(lvl => `<p>[${lvl.type}] ${lvl.name} (${lvl.klp} KLP)</p>`).join('')}
      </div>
    `;
    div.querySelector('.level-summary').addEventListener('click', () => {
      const details = div.querySelector('.level-details');
      const isHidden = window.getComputedStyle(details).display === 'none';
      details.style.display = isHidden ? 'block' : 'none';
    });
    container.appendChild(div);
  });
}
loadPlayers();
