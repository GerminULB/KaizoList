(async () => {
  const params = new URLSearchParams(window.location.search);
  const levelName = params.get('name');
  if (!levelName) return alert('No level specified');

  // Fetch levels
  const resLevels = await fetch('levels.json');
  const levels = await resLevels.json();
  const level = levels.find(l => l.name === levelName);
  if (!level) return alert('Level not found');

  document.getElementById('level-name').innerText = level.name;
  document.getElementById('level-creator').innerText = level.creator;
  document.getElementById('level-verifier').innerText = level.verifier;
  document.getElementById('level-id').innerText = level.id;
  document.getElementById('level-klp').innerText = level.klp;

  const sortedLevels = levels.slice().sort((a, b) => b.klp - a.klp);
  const rank = sortedLevels.findIndex(l => l.name === levelName) + 1;
  document.getElementById('level-rank').innerText = rank;

  // Fetch challenges too
  const resChallenges = await fetch('challenges.json');
  const challenges = await resChallenges.json();
  const challenge = challenges.find(c => c.name === levelName);
  if (challenge) {
    document.getElementById('level-challenge').innerText = `Challenge creator: ${challenge.creator}, verifier: ${challenge.verifier}`;
  }

  // History
  const historyFiles = [
    'history/2025-12-02-levels.json',
    'history/2025-12-15-levels.json'
  ];
  const historyEl = document.getElementById('history');

  for (const file of historyFiles) {
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
  }
})();

const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

// check if level is new (YOU KNOW WHAT COMMENTS ARE GOOD LOWKEY)
let isNew = true;
if (historyFiles.length) {
  const latestRes = await fetch(historyFiles[historyFiles.length - 1]);
  const latestSnapshot = await latestRes.json();
  isNew = !latestSnapshot.some(l => l.name === levelName);
}

if (isNew) {
  const div = document.createElement('div');
  div.innerText = `On ${today}, ${level.name} was added to the Kaizo List at rank ${rank} with ${level.klp} KLP.`;
  historyEl.prepend(div); 
}


