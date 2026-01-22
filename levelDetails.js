import { fetchJson } from './js/utils.js';

document.addEventListener('DOMContentLoaded', async () => {
  const ITEMS_PER_PAGE = 9; // for victors pagination

  // --- Parse level name from URL ---
  const params = new URLSearchParams(window.location.search);
  const levelName = params.get('name');
  if (!levelName) return alert('No level specified');

  // --- Fetch data ---
  const levels = await fetchJson('levels.json');
  const challenges = await fetchJson('challenges.json');
  const victorsData = await fetchJson('victors.json');

  const allLevels = [...levels, ...challenges];

  // --- Find the level ---
  const level = allLevels.find(l => l.name === levelName);
  if (!level) return alert('Level not found');

  // --- Fill main info safely ---
  const safeSet = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
  };

  safeSet('level-name', level.name);
  safeSet('level-creator', level.creator || 'Unknown');
  safeSet('level-verifier', level.verifier || 'Unknown');
  safeSet('level-id', level.id || 'N/A');
  safeSet('level-klp', level.klp || 0);

  // --- Compute rank ---
  const sortedLevels = allLevels.slice().sort((a, b) => b.klp - a.klp);
  const rank = sortedLevels.findIndex(l => l.name === levelName) + 1;
  safeSet('level-rank', rank);

  // --- History scrollable ---
  const historyEl = document.getElementById('history');
  if (historyEl) {
    historyEl.innerHTML = '';
    // Combine level history (e.g., KLP additions) if available
    const historyItems = level.history || []; // optional, can be empty
    if (historyItems.length === 0) {
      const div = document.createElement('div');
      div.innerText = 'No recent changes.';
      historyEl.appendChild(div);
    } else {
      historyItems.forEach(item => {
        const div = document.createElement('div');
        div.innerText = `${item.date || ''}: +${item.klp || 0} KLP`;
        historyEl.appendChild(div);
      });
    }
  }

  // --- Victors pagination ---
  const victors = Object.entries(victorsData)
    .filter(([player, levelsArr]) => levelsArr.includes(levelName))
    .map(([player]) => player)
    .filter(player => player !== level.verifier); // exclude verifier

  const victorsContainer = document.getElementById('victors-grid');
  if (victorsContainer) {
    let currentPage = 1;
    const totalPages = Math.ceil(victors.length / ITEMS_PER_PAGE);

    function renderPage() {
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
      let pagination = victorsContainer.parentElement.querySelector('.victors-pagination');
      if (!pagination) {
        pagination = document.createElement('div');
        pagination.className = 'victors-pagination panel-9slice';
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
            renderPage();
          });
          pagination.appendChild(btn);
        }
      }
    }

    renderPage();
  }

});
