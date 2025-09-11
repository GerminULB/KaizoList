(async () => {
  const ITEMS_PER_PAGE = 9; // 3x3 grid per page

  const params = new URLSearchParams(window.location.search);
  const playerName = params.get('name');
  if (!playerName) return alert('No player specified');

  // DOM references
  const statsEl = document.getElementById('player-stats');
  const victorsEl = document.getElementById('player-victors');
  const verificationsEl = document.getElementById('player-verifications');

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
    if (!playerMap[level.verifier]) playerMap[level.verifier] = { klp: 0, levels: [] };
    playerMap[level.verifier].klp += level.klp;
    playerMap[level.verifier].levels.push({ ...level, type: 'Verification' });
  });

  // Add victors
  Object.entries(victorsData).forEach(([player, levelNames]) => {
    levelNames.forEach(levelName => {
      const level = allLevels.find(l => l.name === levelName);
      if (!level) return;
      if (!playerMap[player]) playerMap[player] = { klp: 0, levels: [] };
      playerMap[player].klp += level.klp;
      playerMap[player].levels.push({ ...level, type: 'Victor' });
    });
  });

  const playerData = playerMap[playerName];
  if (!playerData) return alert('Player not found');

  // Stats (left column)
  const totalKLP = playerData.klp;
  const klpVerifications = playerData.levels.filter(l => l.type === 'Verification').reduce((sum, l) => sum + l.klp, 0);
  const klpVictories = playerData.levels.filter(l => l.type === 'Victor').reduce((sum, l) => sum + l.klp, 0);

  statsEl.innerHTML = `
    <h2>${playerName}</h2>
    <p><strong>Total KLP:</strong> ${totalKLP}</p>
    <p><strong>KLP from Verifications:</strong> ${klpVerifications}</p>
    <p><strong>KLP from Victories:</strong> ${klpVictories}</p>
  `;

  // --- Right column grids ---
  function renderGrid(items, container) {
    container.innerHTML = '';
    const paginatedContainer = document.createElement('div');
    paginatedContainer.className = 'grid';
    container.appendChild(paginatedContainer);

    let currentPage = 1;
    const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);

    function renderPage() {
      paginatedContainer.innerHTML = '';
      const pageItems = items.slice((currentPage-1)*ITEMS_PER_PAGE, currentPage*ITEMS_PER_PAGE);

      pageItems.forEach(item => {
        const cell = document.createElement('div');
        cell.className = 'grid-item';
        cell.innerText = `${item.name} (${item.klp} KLP)`;
        cell.addEventListener('click', () => {
          window.open(`levelDetails.html?name=${encodeURIComponent(item.name)}`, '_blank');
        });
        paginatedContainer.appendChild(cell);
      });

      // Pagination buttons
      let pagination = container.querySelector('.pagination');
      if (!pagination) {
        pagination = document.createElement('div');
        pagination.className = 'pagination';
        container.appendChild(pagination);
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

  // Separate Victor and Verification levels
  const victors = playerData.levels.filter(l => l.type === 'Victor');
  const verifications = playerData.levels.filter(l => l.type === 'Verification');

  victorsEl.innerHTML = '<h3>Victories</h3>';
  verificationsEl.innerHTML = '<h3>Verifications</h3>';

  renderGrid(victors, victorsEl);
  renderGrid(verifications, verificationsEl);

})();
