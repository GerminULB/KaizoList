async function loadPlayerList() {
  const [levelsRes, victorsRes] = await Promise.all([
    fetch('levels.json'),
    fetch('victors.json')
  ]);

  const levels = await levelsRes.json();
  const victors = await victorsRes.json();

  // --- Verifier Section ---
  const verifierScores = {};
  for (const level of levels) {
    const verifier = level.verifier;
    if (!verifierScores[verifier]) verifierScores[verifier] = 0;
    verifierScores[verifier] += level.klp;
  }

  const sortedVerifiers = Object.entries(verifierScores)
    .map(([name, klp]) => ({ name, klp }))
    .sort((a, b) => b.klp - a.klp);

  const verifierList = document.getElementById('verifier-list');
  sortedVerifiers.forEach(v => {
    const div = document.createElement('div');
    div.className = 'level'; // reuse styling
    div.textContent = `${v.name} - ${v.klp} KLP`;
    verifierList.appendChild(div);
  });

  // --- Victor Section ---
  const victorScores = {};
  for (const entry of victors) {
    const level = levels.find(l => l.id === entry.levelId);
    if (!level) continue;
    const player = entry.player;
    if (!victorScores[player]) victorScores[player] = 0;
    victorScores[player] += level.klp;
  }

  const sortedVictors = Object.entries(victorScores)
    .map(([name, klp]) => ({ name, klp }))
    .sort((a, b) => b.klp - a.klp);

  const victorList = document.getElementById('victor-list');
  sortedVictors.forEach(v => {
    const div = document.createElement('div');
    div.className = 'level'; // reuse styling
    div.textContent = `${v.name} - ${v.klp} KLP`;
    victorList.appendChild(div);
  });
}

loadPlayerList();
