import { fetchJson, splitNames } from '../js/utils.js';
import { calculatePlayerScore } from '../score.js';

(async function() {

  const levels = await fetchJson('../levels.json');
  const challenges = await fetchJson('../challenges.json');
  const victorsData = await fetchJson('../victors.json');

  const allLevels = [...levels, ...challenges];

  // --- Build player data ---
  const playerMap = {};
  allLevels.forEach(level => {
    if(level.verifier){
      const v = level.verifier;
      if(!playerMap[v]) playerMap[v] = { klp:0, levels:[] };
      playerMap[v].klp += level.klp;
      playerMap[v].levels.push({ name: level.name, klp: level.klp, type:'Verification' });
    }
  });

  Object.entries(victorsData).forEach(([player, levelNames])=>{
    levelNames.forEach(levelName=>{
      const level = allLevels.find(l=>l.name===levelName);
      if(!level) return;
      if(!playerMap[player]) playerMap[player] = { klp:0, levels:[] };
      playerMap[player].klp += level.klp;
      playerMap[player].levels.push({ name: level.name, klp: level.klp, type:'Victor' });
    });
  });

  let playerList = Object.entries(playerMap).map(([name,data])=>({
    name,
    klp: data.klp,
    levels: data.levels,
    plp: calculatePlayerScore(data.levels)
  }));

  // --- Add Dummy Player ---
  playerList.push({
    name:'Player-Dummy',
    klp:0,
    levels:[],
    plp:0
  });

  // --- Populate player select ---
  const playerSelect = document.getElementById('player-select');
  playerList.sort((a,b)=>b.plp-a.plp);
  playerList.forEach(p=>{
    const option = document.createElement('option');
    option.value = p.name;
    option.textContent = p.name;
    playerSelect.appendChild(option);
  });

  // --- Populate level select (exclude completed levels) ---
  const levelSelect = document.getElementById('level-select');
  function getLevelsForPlayer(playerName){
    const completed = new Set(playerMap[playerName]?.levels.map(l=>l.name) || []);
    return allLevels.filter(l=>!completed.has(l.name));
  }

  playerSelect.addEventListener('change',()=>{
    const selectedPlayer = playerSelect.value;
    const levelsForPlayer = getLevelsForPlayer(selectedPlayer);
    levelSelect.innerHTML = '<option value="" disabled selected>Select Level</option>';
    levelsForPlayer.forEach(l=>{
      const option = document.createElement('option');
      option.value = l.name;
      option.textContent = l.name;
      levelSelect.appendChild(option);
    });
    document.getElementById('compare-results').style.display='none';
  });

  // --- Compute simulation ---
  levelSelect.addEventListener('change',()=>{
    const playerName = playerSelect.value;
    const levelName = levelSelect.value;
    if(!playerName || !levelName) return;

    const player = playerList.find(p=>p.name===playerName);
    const level = allLevels.find(l=>l.name===levelName);

    // KLP gain
    const klpGain = level.klp;

    // Total new KLP & PLP
    const newLevels = [...player.levels, { name:level.name, klp:level.klp, type:'Victor' }];
    const newKLP = player.klp + klpGain;
    const newPLP = calculatePlayerScore(newLevels);
    const plpChange = newPLP - player.plp;

    // --- Rank simulation ---
    const simulatedList = playerList.map(p=>{
      if(p.name===player.name){
        return { ...p, plp:newPLP };
      }
      return { ...p };
    });
    simulatedList.sort((a,b)=>b.plp-a.plp);
    const oldRank = simulatedList.findIndex(p=>p.name===player.name,0)+1;
    const newRank = simulatedList.findIndex(p=>p.name===player.name,0)+1;

    // --- Update UI ---
    document.getElementById('compare-results').style.display='block';
    document.getElementById('klp-gain').textContent = `KLP Gain: ${klpGain.toLocaleString()} KLP`;
    document.getElementById('plp-change').textContent = `PLP Change: ${plpChange.toFixed(2)} PLP`;
    document.getElementById('rank-change').textContent = `Rank: #${oldRank} → #${newRank}`;

    // Optional breakdown table
    const breakdown = newLevels.map(l=>`<tr><td>${l.name}</td><td>${l.klp} KLP</td><td>${l.type}</td></tr>`).join('');
    document.getElementById('breakdown-table').innerHTML = `
      <h3>Level Breakdown</h3>
      <table style="width:100%;text-align:left;">
        <thead><tr><th>Level</th><th>KLP</th><th>Type</th></tr></thead>
        <tbody>${breakdown}</tbody>
      </table>
    `;
  });

})();
