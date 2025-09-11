(async () => {
  const params = new URLSearchParams(window.location.search);
  const levelName = params.get('name');
  if (!levelName) return alert('No level specified');

  const historyEl = document.getElementById('history');

  // Fetch levels and challenges
  const [resLevels, resChallenges] = await Promise.all([
    fetch('levels.json'),
    fetch('challenges.json')
  ]);

  const levels = await resLevels.json();
  const challenges = await resChallenges.json();
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

  // Optional: show challenge info
  const challenge = challenges.find(c => c.name === levelName);
  if (challenge && document.getElementById('level-challenge')) {
    document.getElementById('level-challenge').innerText =
      `Challenge creator: ${challenge.creator}, verifier: ${challenge.verifier}`;
  }

  // History files
  const historyFiles = [

  ];

  let isNew = true; // assume level is new

  for (const file of historyFiles) {
    try {
      const res = await fetch(file);
      if (!res.ok) continue;

      const snapshot = await res.json();
      const snapLevel = snapshot.find(l => l.name === levelName);
      if (snapLevel) isNew = false;

      const snapSorted = snapshot.slice().sort((a, b) => b.klp - a.klp);
      const snapRank = snapSorted.findIndex(l => l.name === levelName) + 1;

      if (!snapLevel) continue;

      const rankChange = snapRank - rank;
      const klpChange = snapLevel.klp - level.klp;
      const date = file.match(/\d{4}-\d{2}-\d{2}/)[0];

      const div = document.createElement('div');
      div.innerText = `${date}: ${rankChange > 0 ? rankChange + ' spots down' :
        rankChange < 0 ? -rankChange + ' spots up' : 'No rank change'}, ${klpChange > 0 ? '+'+klpChange : klpChange} KLP`;
      historyEl.appendChild(div);
    } catch (err) {
      console.warn('Could not load history file', file, err);
    }
  }

  // If level is new, show notice at top
  if (isNew) {
    const div = document.createElement('div');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    div.innerText = `On ${today}, "${level.name}" was added to the Kaizo List at rank ${rank} with ${level.klp} KLP.`;
    historyEl.prepend(div);
  }

})();
