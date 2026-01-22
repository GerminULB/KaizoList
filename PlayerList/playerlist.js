import { fetchJson, splitNames, applyRandomPattern } from '../js/utils.js';
import { calculatePlayerScore } from '../score.js';

(async function() {

  // --- Fetch all data ---
  const levels = await fetchJson('../levels.json');
  const challenges = await fetchJson('../challenges.json');
  const victorsData = await fetchJson('../victors.json');
  const allLevels = [...levels, ...challenges];

  const playerMap = {};

  // --- Add verifiers ---
  allLevels.forEach(level => {
    if (!level.verifier) return;
    const v = level.verifier;
    if (!playerMap[v]) playerMap[v] = { klp: 0, levels: [] };
    playerMap[v].klp += level.klp;
    playerMap[v].levels.push({ name: level.name, klp: level.klp, type: 'Verification' });
  });

  // --- Add victors ---
  Object.entries(victorsData).forEach(([player, levelNames]) => {
    levelNames.forEach(levelName => {
      const level = allLevels.find(l => l.name === levelName);
      if (!level) return;
      if (!playerMap[player]) playerMap[player] = { klp: 0, levels: [] };
      playerMap[player].klp += level.klp;
      playerMap[player].levels.push({ name: level.name, klp: level.klp, type: 'Victor' });
    });
  });

  // --- Convert to array & compute PLP ---
  let playerList = Object.entries(playerMap).map(([name, data]) => ({
    name,
    klp: data.klp,
    levels: data.levels,
    plp: calculatePlayerScore(data.levels)
  }));

  // --- Sort by PLP initially ---
  playerList.sort((a,b) => b.plp - a.plp);

  // --- Inject filters dynamically ---
  const container = document.querySelector('.container');
  const filterHTML = `
    <div id="player-filters" class="filters" style="margin-bottom:15px;">
      <input type="text" id="player-search" placeholder="Search Player..." />
      <select id="point-type">
        <option value="plp">PLP</option>
        <option value="klp">KLP</option>
      </select>
      <select id="klp-type">
        <option value="all">All KLP Types</option>
        <option value="Verification">KLP Verifications</option>
        <option value="Victor">KLP Victors</option>
      </select>
    </div>
  `;
  container.insertAdjacentHTML('afterbegin', filterHTML);

  const searchInput = document.getElementById('player-search');
  const pointTypeSelect = document.getElementById('point-type');
  const klpTypeSelect = document.getElementById('klp-type');

  // Hide KLP type initially if PLP is selected
  klpTypeSelect.style.display = pointTypeSelect.value === 'klp' ? 'inline-block' : 'none';

  // --- Event listeners ---
  searchInput.addEventListener('input', renderPlayers);
  pointTypeSelect.addEventListener('change', () => {
    klpTypeSelect.style.display = pointTypeSelect.value === 'klp' ? 'inline-block' : 'none';
    renderPlayers();
  });
  klpTypeSelect.addEventListener('change', renderPlayers);

  // --- Render total points / filtered players ---
  function renderPlayers() {
    const search = (searchInput.value || '').toLowerCase();
    const pointType = pointTypeSelect.value;
    const klpType = klpTypeSelect.value;

    // --- Filter by search (player name + level names) ---
    let filtered = playerList.filter(p => {
      const nameMatch = p.name.toLowerCase().includes(search);
      const levelMatch = p.levels.some(l => l.name.toLowerCase().includes(search));
      return nameMatch || levelMatch;
    });

    // --- Map display points ---
    filtered = filtered.map(p => {
      if(pointType === 'klp') {
        const klpLevels = klpType === 'all' ? p.levels : p.levels.filter(l => l.type === klpType);
        return {
          ...p,
          displayPoints: klpLevels.reduce((sum,l) => sum + l.klp, 0)
        };
      } else {
        return { ...p, displayPoints: p.plp };
      }
    });

    // --- Sort descending with tiebreaker ---
    filtered.sort((a,b) => {
      if(b.displayPoints !== a.displayPoints) return b.displayPoints - a.displayPoints;
      return a.name.localeCompare(b.name);
    });

    // --- Update total KLP ---
    const totalPoints = filtered.reduce((sum,p) => sum + p.displayPoints, 0);
    document.getElementById('player-total-klp').innerText =
      pointType === 'klp' ? `Total: ${totalPoints.toLocaleString()} KLP` : `Total: ${totalPoints.toLocaleString()} PLP`;

    // --- Render players ---
    const listContainer = document.getElementById('player-list');
    listContainer.innerHTML = '';
    if(!filtered.length) {
      listContainer.innerHTML = '<div class="no-results">No players found.</div>';
      return;
    }

    filtered.forEach((p, idx) => {
      const div = document.createElement('div');
      div.className = 'level';
      div.innerHTML = `
        <div class="level-summary" role="button" tabindex="0">
          <span>#${idx+1}: ${highlightText(p.name, search)}</span>
          <strong>${Math.round(p.displayPoints)}</strong>
          <span class="subtle">(${p.levels.length} levels)</span>
        </div>
      `;
      div.querySelector('.level-summary').addEventListener('click', () => {
        window.location.href = `../PlayerDetails.html?name=${encodeURIComponent(p.name)}`;
      });
      listContainer.appendChild(div);
    });
  }

  renderPlayers();

  // --- Highlight utility ---
  function highlightText(text, search) {
    if(!search) return escapeHtml(text || '');
    const regex = new RegExp(`(${escapeRegExp(search)})`, 'gi');
    return escapeHtml(text || '').replace(regex, '<mark>$1</mark>');
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, s => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }
  function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

})();
