import { fetchJson, rankByKLP, paginateGrid } from '/js/utils.js';

(async () => {
  const params = new URLSearchParams(window.location.search);
  const levelName = params.get('name');
  if (!levelName) return alert('No level specified');

  const historyEl = document.getElementById('history');
  
const levels = await fetchJson('levels.json');
const challenges = await fetchJson('challenges.json');
const victorsData = await fetchJson('victors.json');

  const allLevels = [...levels, ...challenges];

  const level = allLevels.find(l => l.name === levelName);
  if (!level) return alert('Level not found');

  // Display main info
  document.getElementById('level-name').innerText = level.name;
  document.getElementById('level-creator').innerText = level.creator || 'Unknown';
  document.getElementById('level-verifier').innerText = level.verifier || 'Unknown';
  document.getElementById('level-id').innerText = level.id || 'N/A';
  document.getElementById('level-klp').innerText = level.klp || 0;

  // Compute rank
  const sortedLevels = allLevels.slice().sort((a, b) => b.klp - a.klp);
  const rank = sortedLevels.findIndex(l => l.name === levelName) + 1;
  document.getElementById('level-rank').innerText = rank;

  // --- Victors ---
  const victors = Object.entries(victorsData)
    .filter(([player, levels]) => levels.includes(levelName))
    .map(([player]) => player)
    .filter(player => player !== level.verifier); // exclude verifier

  const victorsContainer = document.getElementById('victors-grid');
  victorsContainer.innerHTML = '';

  const ITEMS_PER_PAGE = 9;
  let currentPage = 1;
  const totalPages = Math.ceil(victors.length / ITEMS_PER_PAGE);

  function renderVictorsPage() {
    victorsContainer.innerHTML = '';

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageItems = victors.slice(start, start + ITEMS_PER_PAGE);

    pageItems.forEach(player => {
      const cell = document.createElement('div');
      cell.className = 'grid-item clickable';
      cell.innerText = player;
      cell.addEventListener('click', () => {
        window.location.href = `/KaizoList/PlayerDetails.html?name=${encodeURIComponent(player)}`;
      });
      victorsContainer.appendChild(cell);
    });

    // Pagination
    let pagination = document.querySelector('.victors-pagination');
    if (!pagination) {
      pagination = document.createElement('div');
      pagination.className = 'victors-pagination';
      victorsContainer.parentElement.appendChild(pagination);
    }
    pagination.innerHTML = '';

    if (totalPages > 1) {
      for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.innerText = i;
        if (i === currentPage) btn.disabled = true;
        btn.addEventListener('click', () => {
          currentPage = i;
          renderVictorsPage();
        });
        pagination.appendChild(btn);
      }
    }
  }

  if (victors.length > 0) renderVictorsPage();
  
renderRecentChanges('history', undefined, 'levels.json');

})();
