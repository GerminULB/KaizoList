(async () => {
  const params = new URLSearchParams(window.location.search);
  const playerName = params.get('name');
  if (!playerName) return alert('No player specified');

  // Fetch all data
  const [levelsRes, challengesRes, victorsRes] = await Promise.all([
    fetch('levels.json'),
    fetch('challenges.json'),
    fetch('victors.json')
  ]);

  const levels = await levelsRes.json();
  const challenges = await challengesRes.json();
  const victors = await victorsRes.json();
  const allLevels = [...levels, ...challenges];

  // Find player's levels
  const playerLevels = [];
  let totalKLP = 0;
  let levelKLP = 0;
  let challengeKLP = 0;

  // Collect verifications
  for (const lvl of allLevels) {
    if (lvl.verifier === playerName) {
      playerLevels.push({ ...lvl, type: 'Verification' });
      totalKLP += lvl.klp;
      levelKLP += lvl.klp;
    }
  }

  // Collect victors
  const playerVictors = victors[playerName] || [];
  const victorLevels = [];
  for (const lvlName of playerVictors) {
    const lvl = allLevels.find(l => l.name === lvlName);
    if (!lvl) continue;
    playerLevels.push({ ...lvl, type: 'Victor' });
    totalKLP += lvl.klp;
    challengeKLP += lvl.klp;
    victorLevels.push(lvl);
  }

  // Sort by KLP descending
  playerLevels.sort((a, b) => b.klp - a.klp);

  // Render left stats column
  const statsEl = document.getElementById('player-stats');
  statsEl.innerHTML = `
    <h2>${playerName}</h2>
    <p><strong>Total KLP:</strong> ${totalKLP}</p>
    <p><strong>KLP from Verifications:</strong> ${levelKLP}</p>
    <p><strong>KLP from Victories:</strong> ${challengeKLP}</p>
    <h3>Recent Levels</h3>
    <ul>
      ${playerLevels.map(l => `<li>[${l.type}] <a href="levelDetails.html?name=${encodeURIComponent(l.name)}" target="_blank">${l.name}</a> (${l.klp} KLP)</li>`).join('')}
    </ul>
  `;

  // Render right column: victors paginated 3x3
  const victorsEl = document.getElementById('player-victors');
  let currentPage = 0;
  const pageSize = 9;
  const totalPages = Math.ceil(victorLevels.length / pageSize);

  function renderPage(page) {
    victorsEl.innerHTML = '';
    const start = page * pageSize;
    const end = start + pageSize;
    const slice = victorLevels.slice(start, end);

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    grid.style.gap = '10px';

    slice.forEach(lvl => {
      const div = document.createElement('div');
      div.style.background = '#1e1e2e';
      div.style.padding = '10px';
      div.style.borderRadius = '5px';
      div.style.cursor = 'pointer';
      div.style.color = '#fff';
      div.innerHTML = `${lvl.name} (${lvl.klp} KLP)`;
      div.addEventListener('click', () => {
        window.open(`levelDetails.html?name=${encodeURIComponent(lvl.name)}`, '_blank');
      });
      grid.appendChild(div);
    });

    victorsEl.appendChild(grid);

    // Pagination buttons
    const pagination = document.createElement('div');
    pagination.style.marginTop = '10px';
    pagination.style.textAlign = 'center';

    if (page > 0) {
      const prevBtn = document.createElement('button');
      prevBtn.innerText = 'Prev';
      prevBtn.addEventListener('click', () => {
        currentPage--;
        renderPage(currentPage);
      });
      pagination.appendChild(prevBtn);
    }

    if (page < totalPages - 1) {
      const nextBtn = document.createElement('button');
      nextBtn.innerText = 'Next';
      nextBtn.style.marginLeft = '10px';
      nextBtn.addEventListener('click', () => {
        currentPage++;
        renderPage(currentPage);
      });
      pagination.appendChild(nextBtn);
    }

    victorsEl.appendChild(pagination);
  }

  renderPage(currentPage);

  // Verifications on right column under victors
  const verificationsEl = document.getElementById('player-verifications');
  const playerVerifications = playerLevels.filter(l => l.type === 'Verification');
  verificationsEl.innerHTML = `<h3>Verifications</h3>`;
  if (playerVerifications.length) {
    const list = document.createElement('ul');
    playerVerifications.forEach(lvl => {
      const li = document.createElement('li');
      li.innerHTML = `<a href="levelDetails.html?name=${encodeURIComponent(lvl.name)}" target="_blank">${lvl.name}</a> (${lvl.klp} KLP)`;
      list.appendChild(li);
    });
    verificationsEl.appendChild(list);
  } else {
    verificationsEl.innerHTML += '<p>None yet.</p>';
  }
})();
