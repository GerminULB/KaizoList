(async () => {
  // Get level name from URL
  const params = new URLSearchParams(window.location.search);
  const levelName = params.get('name');
  if (!levelName) {
    document.getElementById('level-name').innerText = 'No level specified';
    return;
  }

  // Fetch latest levels to get current info
  const resLevels = await fetch('levels.json');
  const levels = await resLevels.json();
  const level = levels.find(l => l.name === levelName);

  if (!level) {
    document.getElementById('level-name').innerText = 'Level not found';
    return;
  }

  // Populate current info
  document.getElementById('level-name').innerText = level.name;
  document.getElementById('level-creator').innerText = level.creator;
  document.getElementById('level-verifier').innerText = level.verifier;
  document.getElementById('level-id').innerText = level.id;
  document.getElementById('level-klp').innerText = level.klp;

  // Calculate current rank
  const sorted = levels.slice().sort((a, b) => b.klp - a.klp);
  const rank = sorted.findIndex(l => l.name === levelName) + 1;
  document.getElementById('level-rank').innerText = rank;

  // Fetch history snapshots
  const historyFiles = [
    'history/2025-12-02-levels.json',
    'history/2025-12-15-levels.json'
    // Add more snapshots as needed
  ];

  const historyEl = document.getElementById('history');
  for (const file of historyFiles) {
    try {
      const res = await fetch(file);
      const snapshot = await res.json();
      const snapLevel = snapshot.find(l => l.name === levelName);
      if (!snapLevel) continue;

      const snapSorted = snapshot.slice().sort((a, b) => b.klp - a.klp);
      const snapRank = snapSorted.findIndex(l => l.name === levelName) + 1;

      const rankChange = snapRank - rank;
      const klpChange = snapLevel.klp - level.klp;

      const date = file.match(/\d{4}-\d{2}-\d{2}/)[0];
      const div = document.createElement('div');
      div.innerText = `${date}: ${rankChange > 0 ? rankChange + ' spots down' : rankChange < 0 ? -rankChange + ' spots up' : 'No rank change'}, ${klpChange > 0 ? '+'+klpChange : klpChange} KLP`;
      historyEl.appendChild(div);
    } catch (err) {
      console.error('Error loading history', file, err);
    }
  }
})();
