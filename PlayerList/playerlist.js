import { fetchJson, splitNames, applyRandomPattern } from '../js/utils.js';
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

  // --- DOM elements ---
  const searchInput = document.getElementById('player-search');
  const pointTypeSelect = document.getElementById('metric-filter'); // PLP/KLP
  const klpTypeSelect = document.getElementById('klp-type-filter'); // Verification/Victor/All
  const clearBtn = document.getElementById('clear-filters');
  const listContainer = document.getElementById('player-list');
  const totalEl = document.getElementById('player-total-klp');

  // --- Show/hide KLP type filter based on metric ---
  function updateKLPTypeVisibility() {
    if (!klpTypeSelect) return;
    klpTypeSelect.style.display = pointTypeSelect.value === 'klp' ? 'inline-block' : 'none';
  }

  // --- Event listeners ---
  searchInput.addEventListener('input', renderPlayers);
  pointTypeSelect.addEventListener('change', () => {
    updateKLPTypeVisibility();
    renderPlayers();
  });
  klpTypeSelect.addEventListener('change', renderPlayers);
  if (clearBtn) clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    pointTypeSelect.value = 'plp';
    klpTypeSelect.value = 'all';
    updateKLPTypeVisibility();
    renderPlayers();
  });

  // --- Render players ---
  function renderPlayers() {
    const search = (searchInput.value || '').toLowerCase();
    const pointType = pointTypeSelect.value;
    const klpType = klpTypeSelect.value;

    // Filter players by name
    let filtered = playerList.filter(p => p.name.toLowerCase().includes(search));

    // Compute display points for each player
    filtered = filtered.map(p => {
      let displayPoints;
      if (pointType === 'plp') {
        displayPoints = p.plp;
      } else { // KLP
        let levels = p.levels;
        if (klpType !== 'all') levels = levels.filter(l => l.type === klpType);
        displayPoints = levels.reduce((sum,l)=>sum+l.klp,0);
      }
      return { ...p, displayPoints };
    });

    // Sort descending
    filtered.sort((a,b) => b.displayPoints - a.displayPoints);

    // Update total points (all players)
    let totalPoints;
    if (pointType === 'plp') {
      totalPoints = playerList.reduce((sum,p)=>sum + p.plp, 0);
    } else {
      totalPoints = playerList.reduce((sum,p)=>{
        let levels = p.levels;
        if (klpType !== 'all') levels = levels.filter(l => l.type === klpType);
        return sum + levels.reduce((s,l)=>s+l.klp,0);
      },0);
    }
    totalEl.innerText = `Total: ${totalPoints.toLocaleString()} ${pointType.toUpperCase()}`;

    // Render list
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
          <span>#${idx+1}: ${highlightText(p.name)}</span>
          <strong>${Math.round(p.displayPoints)} ${pointType.toUpperCase()}</strong>
        </div>
      `;
      div.querySelector('.level-summary').addEventListener('click', () => {
        window.location.href = `../PlayerDetails.html?name=${encodeURIComponent(p.name)}`;
      });
      listContainer.appendChild(div);
    });
  }

  // --- Highlight text helper (from MainList) ---
  function highlightText(text) {
    const search = (searchInput.value || '').toLowerCase();
    if (!search) return escapeHtml(text || '');
    const regex = new RegExp(`(${escapeRegExp(search)})`, 'gi');
    return escapeHtml(text || '').replace(regex, '<mark>$1</mark>');
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }
  function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // --- Initial setup ---
  updateKLPTypeVisibility();
  renderPlayers();

})();
