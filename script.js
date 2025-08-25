let currentLevels = [];

// Load levels.json and initialize
fetch('levels.json')
  .then(res => res.json())
  .then(data => {
    currentLevels = data;

    // Compute rank automatically based on KLP descending
    currentLevels.sort((a, b) => b.klp - a.klp);
    currentLevels.forEach((lvl, index) => lvl.rank = index + 1);

    populateFilters(currentLevels);
    renderFilteredLevels();
  })
  .catch(err => console.error('Error loading levels.json:', err));

// Load levels into the DOM
function loadLevelsFromJSON(levels) {
  const container = document.getElementById('level-list');
  const total = levels.reduce((sum,lvl)=>sum+lvl.klp,0);
  document.getElementById('total-klp').innerText = `Total: ${total.toLocaleString()} KLP`;
  container.innerHTML = '';

  levels.forEach((lvl) => {
    const div = document.createElement('div');
    div.className='level';
    div.innerHTML=`
      <div class="level-summary">
        <span>#${lvl.rank}: ${lvl.name}</span>
        <strong>${lvl.klp} KLP</strong>
      </div>
      <div class="level-details">
        <p><strong>Creator:</strong> ${lvl.creator}</p>
        <p><strong>Verifier:</strong> ${lvl.verifier}</p>
      </div>
    `;
    div.querySelector('.level-summary').addEventListener('click',()=>{
      const details = div.querySelector('.level-details');
      const isHidden = window.getComputedStyle(details).display==='none';
      details.style.display = isHidden ? 'block' : 'none';
    });
    container.appendChild(div);
  });
}

// Populate filters
function populateFilters(levels) {
  const creators = [...new Set(levels.flatMap(l => l.creator.split(',').map(s=>s.trim())))].sort();
  const verifiers = [...new Set(levels.map(l=>l.verifier))].sort();

  const creatorFilter = document.getElementById('creator-filter');
  const verifierFilter = document.getElementById('verifier-filter');
  creators.forEach(c=>creatorFilter.innerHTML+=`<option value="${c}">${c}</option>`);
  verifiers.forEach(v=>verifierFilter.innerHTML+=`<option value="${v}">${v}</option>`);
}

// Render filtered levels
function renderFilteredLevels() {
  const search = document.getElementById('search').value.toLowerCase();
  const selectedCreator = document.getElementById('creator-filter').value;
  const selectedVerifier = document.getElementById('verifier-filter').value;
  const sortMethod = document.getElementById('sort-filter').value;

  let filtered = currentLevels.filter(lvl => {
    const creators = lvl.creator.split(',').map(s=>s.trim());
    return (
      lvl.name.toLowerCase().includes(search) &&
      (selectedCreator==='' || creators.includes(selectedCreator)) &&
      (selectedVerifier==='' || lvl.verifier===selectedVerifier)
    );
  });

  if(sortMethod==='id-asc') filtered.sort((a,b)=>+a.id - +b.id);
  else if(sortMethod==='id-desc') filtered.sort((a,b)=>+b.id - +a.id);
  else filtered.sort((a,b)=>a.rank - b.rank);

  loadLevelsFromJSON(filtered);
}

// Event listeners
document.getElementById('search').addEventListener('input', renderFilteredLevels);
document.getElementById('creator-filter').addEventListener('change', renderFilteredLevels);
document.getElementById('verifier-filter').addEventListener('change', renderFilteredLevels);
document.getElementById('sort-filter').addEventListener('change', renderFilteredLevels);
