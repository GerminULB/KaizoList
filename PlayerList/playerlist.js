import { fetchJson } from '../js/utils.js';
import { calculatePlayerScore } from '../score.js';

(async function() {
  // Fetch all data
  const levels = await fetchJson('../levels.json');
  const challenges = await fetchJson('../challenges.json');
  const victorsData = await fetchJson('../victors.json');
  const allLevels = [...levels, ...challenges];

  const playerMap = {};

  // Add verifiers
  allLevels.forEach(level => {
    if (!level.verifier) return;
    const v = level.verifier;
    if (!playerMap[v]) playerMap[v] = { klp: 0, levels: [] };
    playerMap[v].klp += level.klp;
    playerMap[v].levels.push({ name: level.name, klp: level.klp, type: 'Verification' });
  });

  // Add victors
  Object.entries(victorsData).forEach(([player, levelNames]) => {
    levelNames.forEach(levelName => {
      const level = allLevels.find(l => l.name === levelName);
      if (!level) return;
      if (!playerMap[player]) playerMap[player] = { klp: 0, levels: [] };
      playerMap[player].klp += level.klp;
      playerMap[player].levels.push({ name: level.name, klp: level.klp, type: 'Victor' });
    });
  });

  // Convert to array & compute PLP
  let playerList = Object.entries(playerMap).map(([name, data]) => ({
    name,
    klp: data.klp,
    levels: data.levels,
    plp: calculatePlayerScore(data.levels)
  }));

  // Sort by PLP initially
  playerList.sort((a,b) => b.plp - a.plp);

  // Reference static elements
  const searchInput = document.getElementById('player-search');
  const pointTypeSelect = document.getElementById('point-type');
  const klpTypeSelect = document.getElementById('klp-type');
  const listContainer = document.getElementById('player-list');

  // Hide KLP type initially if PLP is selected
  klpTypeSelect.style.display = pointTypeSelect.value === 'klp' ? 'inline-block' : 'none';

  // Event listeners
  searchInput.addEventListener('input', renderPlayers);
  pointTypeSelect.addEventListener('change', () => {
    klpTypeSelect.style.display = pointTypeSelect.value === 'klp' ? 'inline-block' : 'none';
    renderPlayers();
  });
  klpTypeSelect.addEventListener('change', renderPlayers);

  // Render function
  function renderPlayers() {
    const search = (searchInput.value || '').toLowerCase();
    const pointType = pointTypeSelect.value;
    const klpType = klpTypeSelect.value;

    let filtered = playerList.filter(p => p.name.toLowerCase().includes(search));

    // Filter by KLP type if applicable
    if (pointType === 'klp') {
      filtered = filtered.map(p => {
        const klpLevels = klpType === 'all'
          ? p.levels
          : p.levels.filter(l => l.type === klpType);
        return { ...p, displayPoints: klpLevels.reduce((sum,l)=>sum+l.klp,0) };
      });
    } else {
      filtered = filtered.map(p => ({ ...p, displayPoints: p.plp }));
    }

    // Sort descending by selected metric
    filtered.sort((a,b) => b.displayPoints - a.displayPoints);

    // Update total KLP
    const totalPoints = filtered.reduce((sum,p) => sum + p.displayPoints, 0);
    document.getElementById('player-total-klp').innerText = `Total: ${totalPoints.toLocaleString()} ${pointType.toUpperCase()}`;

    // Render players
    listContainer.innerHTML = '';
    if (!filtered.length) {
      listContainer.innerHTML = '<div class="no-results">No players found.</div>';
      return;
    }

    filtered.forEach((p, idx) => {
      const div = document.createElement('div');
      div.className = 'level';
      div.innerHTML = `
        <div class="level-summary" role="button" tabindex="0">
          <span>#${idx+1}: ${p.name}</span>
          <strong>${Math.round(p.displayPoints)}</strong>
        </div>
      `;
      div.querySelector('.level-summary').addEventListener('click', () => {
        window.location.href = `../PlayerDetails.html?name=${encodeURIComponent(p.name)}`;
      });
      listContainer.appendChild(div);
    });
  }

  document.getElementById('clear-filters').addEventListener('click', () => {
    searchInput.value = '';
    pointTypeSelect.value = 'plp';
    klpTypeSelect.value = 'all';
    klpTypeSelect.style.display = 'none';
    renderPlayers();
});

  
  renderPlayers();
})();
