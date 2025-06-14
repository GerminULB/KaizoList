async function loadPlayers() {
  const [levelsRes, victorsRes] = await Promise.all([
    fetch('levels.json'),
    fetch('victors.json')
  ]);

  const levels = await levelsRes.json();
  const victors = await victorsRes.json();

  const playerMap = {};

  // Add KLP for verifiers ONLY (ignore creators)
  for (const level of levels) {
    const verifier = level.verifier;
    if (!playerMap[verifier]) playerMap[verifier] = { klp: 0, levels: [], type: 'Verifier' };
    playerMap[verifier].klp += level.klp;
    playerMap[verifier].levels.push({ name: level.name, klp: level.klp });
  }

  // Add KLP for victors (manual entries)
  for (const entry of victors) {
    const level = levels.find(l => l.id === entry.levelId);
    if (!level) continue;
    const player = entry.player;
    if (!playerMap[player]) playerMap[player] = { klp: 0, levels: [], type: 'Victor' };
    playerMap[player].klp += level.klp;
    playerMap[player].levels.push({ name: level.name, klp: level.klp });
  }

  // Convert to array and sort by KLP descending
  const playerList = Object.entries(playerMap)
    .map(([name, data]) => ({ name, klp: data.klp, levels: data.levels, type: data.type }))
    .sort((a, b) => b.klp - a.klp);

  const container = document.getElementById('player-list');
  container.innerHTML = '';  // clear previous content

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
      <div class="level-details" style="display:none;">
        ${player.levels.map(lvl => `<p>${lvl.name} (${lvl.klp} KLP)</p>`).join('')}
      </div>
    `;
    div.querySelector('.level-summary').addEventListener('click', () => {
      const details = div.querySelector('.level-details');
      details.style.display = details.style.display === 'none' ? 'block' : 'none';
    });
    container.appendChild(div);
  });
}

loadPlayers();
