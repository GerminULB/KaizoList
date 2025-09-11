(async () => {
  const ITEMS_PER_PAGE = 9; // 3x3 grid per page

  // Fetch all sources
  const [levelsRes, challengesRes, victorsRes] = await Promise.all([
    fetch('levels.json'),
    fetch('challenges.json'),
    fetch('victors.json')
  ]);

  const levels = await levelsRes.json();
  const challenges = await challengesRes.json();
  const victorsData = await victorsRes.json();

  const allLevels = [...levels, ...challenges];

  // Build player map
  const playerMap = {};

  // Add verifiers from levels & challenges
  allLevels.forEach(level => {
    if (!level.verifier) return;
    if (!playerMap[level.verifier]) playerMap[level.verifier] = { klp: 0, levels: [], history: [] };
    playerMap[level.verifier].klp += level.klp;
    playerMap[level.verifier].levels.push({ name: level.name, klp: level.klp, type: 'Verification' });
  });

  // Add victors
  Object.entries(victorsData).forEach(([player, levelNames]) => {
    levelNames.forEach(levelName => {
      const level = allLevels.find(l => l.name === levelName);
      if (!level) return;
      if (!playerMap[player]) playerMap[player] = { klp: 0, levels: [], history: [] };
      playerMap[player].klp += level.klp;
      playerMap[player].levels.push({ name: level.name, klp: level.klp, type: 'Victor' });
    });
  });

  // Convert to array & sort by KLP
  const players = Object.entries(playerMap)
    .map(([name, data]) => ({ name, klp: data.klp, levels: data.levels }))
    .sort((a, b) => b.klp - a.klp);

  // Render total KLP
  const totalKLP = players.reduce((sum, p) => sum + p.klp, 0);
  document.getElementById('player-total-klp').innerText = `Total: ${totalKLP.toLocaleString()} KLP`;

  // Render players list
  const container = document.getElementById('player-list');
  container.innerHTML = '';

  players.forEach((player, idx) => {
    const div = document.createElement('div');
    div.className = 'level';
    div.innerHTML = `
      <div class="level-summary">
        <span>#${idx + 1}: ${player.name}</span>
        <strong>${player.klp} KLP</strong>
      </div>
      <div class="level-details">
        <div class="stats-left">
          <p><strong>Total KLP:</strong> ${player.klp}</p>
          <p><strong>KLP from Verifications:</strong> ${player.levels.filter(l=>l.type==='Verification').reduce((sum,l)=>sum+l.klp,0)}</p>
          <p><strong>KLP from Victories:</strong> ${player.levels.filter(l=>l.type==='Victor').reduce((sum,l)=>sum+l.klp,0)}</p>
        </div>
        <div class="grids-right">
          <h4>Victors</h4>
          <div class="grid victors-grid"></div>
          <h4>Verifications</h4>
          <div class="grid verifications-grid"></div>
        </div>
      </div>
    `;

    const summary = div.querySelector('.level-summary');
    const details = div.querySelector('.level-details');
    summary.addEventListener('click', () => {
      const isHidden = window.getComputedStyle(details).display === 'none';
      details.style.display = isHidden ? 'flex' : 'none';

      if (isHidden) {
        // Render grids with pagination
        renderPaginatedGrid(player.levels.filter(l=>l.type==='Victor'), details.querySelector('.victors-grid'));
        renderPaginatedGrid(player.levels.filter(l=>l.type==='Verification'), details.querySelector('.verifications-grid'));
      }
    });

    container.appendChild(div);
  });

  // --- Pagination / Grid Functions ---
  function renderPaginatedGrid(items, container) {
    let currentPage = 1;
    const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);

    function renderPage() {
      container.innerHTML = '';
      const pageItems = items.slice((currentPage-1)*ITEMS_PER_PAGE, currentPage*ITEMS_PER_PAGE);

      pageItems.forEach(item => {
        const cell = document.createElement('div');
        cell.className = 'grid-item';
        cell.innerText = `${item.name} (${item.klp} KLP)`;
        cell.addEventListener('click', () => {
          window.open(`levelDetails.html?name=${encodeURIComponent(item.name)}`, '_blank');
        });
        container.appendChild(cell);
      });

      // Pagination buttons
      let pagination = container.parentElement.querySelector('.pagination');
      if (!pagination) {
        pagination = document.createElement('div');
        pagination.className = 'pagination';
        container.parentElement.appendChild(pagination);
      }
      pagination.innerHTML = '';

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

    renderPage();
  }

})();
