(async () => {
  const ITEMS_PER_PAGE = 9; // 3x3 grid

  // Parse player name from URL
  const params = new URLSearchParams(window.location.search);
  const playerName = params.get('name');
  if (!playerName) return alert('No player specified');
  document.getElementById('player-name').innerText = playerName;

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

  const playerData = playerMap[playerName];
  if (!playerData) return alert('Player not found');

  // Fill stats on the left
  const totalKLP = playerData.klp;
  const victoryKLP = playerData.levels.filter(l => l.type === 'Victor').reduce((sum, l) => sum + l.klp, 0);
  const verificationKLP = playerData.levels.filter(l => l.type === 'Verification').reduce((sum, l) => sum + l.klp, 0);

  document.getElementById('player-total-klp').innerText = totalKLP.toLocaleString();
  document.getElementById('player-victory-klp').innerText = victoryKLP.toLocaleString();
  document.getElementById('player-verification-klp').innerText = verificationKLP.toLocaleString();

  // --- History (recent KLP additions) ---
  const historyEl = document.getElementById('player-history');
  historyEl.innerHTML = '';
  const sortedLevels = playerData.levels.sort((a, b) => b.klp - a.klp);
  sortedLevels.forEach(l => {
    const div = document.createElement('div');
    div.innerText = `${l.type}: ${l.name} (+${l.klp} KLP)`;
    historyEl.appendChild(div);
  });

  // --- Right Grids ---
  function renderPaginatedGrid(items, container) {
    let currentPage = 1;
    const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);

    function renderPage() {
      container.innerHTML = '';
      const pageItems = items.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

      pageItems.forEach(item => {
        const cell = document.createElement('div');
        cell.className = 'grid-item';
        cell.innerText = `${item.name} (${item.klp} KLP)`;
        cell.addEventListener('click', () => {
           window.location.href = `/KaizoList/PlayerDetails/?name=${encodeURIComponent(item.name)}`;
        });
        container.appendChild(cell);
      });

      // Pagination
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

  // Filter by type
  const victors = playerData.levels.filter(l => l.type === 'Victor');
  const verifications = playerData.levels.filter(l => l.type === 'Verification');

  renderPaginatedGrid(victors, document.getElementById('player-victors'));
  renderPaginatedGrid(verifications, document.getElementById('player-verifications'));

})();
