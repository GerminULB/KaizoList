let currentLevels = [];

// Load challenges.json and initialize UwU
fetch('challenges.json')
  .then(res => res.json())
  .then(data => {
    currentLevels = data;

    // Ensure id field exists and compute rank automatically by KLP >:)
    currentLevels.forEach((lvl, index) => {
      if (!lvl.id) lvl.id = index + 1; // default id if empty
    });
    currentLevels.sort((a, b) => b.klp - a.klp);
    currentLevels.forEach((lvl, index) => lvl.rank = index + 1);

    populateFilters(currentLevels);
    renderFilteredLevels();
  })
  .catch(err => console.error('Error loading levels.json:', err));

// Load levels into the DOM
function loadLevelsFromJSON(levels) {
  const container = document.getElementById('level-list');
  const total = levels.reduce((sum, lvl) => sum + lvl.klp, 0);
  document.getElementById('total-klp').innerText = `Total: ${total.toLocaleString()} KLP`;
  container.innerHTML = '';

  levels.forEach((lvl) => {
    const div = document.createElement('div');
    div.className = 'level';
    div.innerHTML = `
      <div class="level-summary">
        <span>#${lvl.rank}: ${lvl.name}</span><span>#${lvl.rank}: ${highlightText(lvl.name)}</span>
        <strong>${lvl.klp} KLP</strong>
      </div>
      <div class="level-details">
        <p><strong>Creator:</strong> ${lvl.creator}</p>
        <p><strong>Verifier:</strong> ${lvl.verifier}</p>
        <p><strong>ID:</strong> ${lvl.id}</p>
      </div>
    `;
    div.querySelector('.level-summary').addEventListener('click', () => {
      const details = div.querySelector('.level-details');
      const isHidden = window.getComputedStyle(details).display === 'none';
      details.style.display = isHidden ? 'block' : 'none';
    });
    container.appendChild(div);
  });
}

function populateFilters(levels) {
  // Count frequency of each creator
  const creatorCount = {};
  levels.forEach(lvl => {
    lvl.creator.split(',').map(s => s.trim()).forEach(c => {
      if (!c) return;
      if (!creatorCount[c]) creatorCount[c] = 0;
      creatorCount[c]++;
    });
  });

  // Sort creators by frequency (most first)
  const creators = Object.keys(creatorCount).sort((a, b) => creatorCount[b] - creatorCount[a]);

  // Count frequency of each verifier
  const verifierCount = {};
  levels.forEach(lvl => {
    const v = lvl.verifier;
    if (!v) return;
    if (!verifierCount[v]) verifierCount[v] = 0;
    verifierCount[v]++;
  });

  const verifiers = Object.keys(verifierCount).sort((a, b) => verifierCount[b] - verifierCount[a]);

  // Populate the dropdowns
  const creatorFilter = document.getElementById('creator-filter');
  const verifierFilter = document.getElementById('verifier-filter');

  creatorFilter.innerHTML = '<option value="">All Creators</option>';
  creators.forEach(c => creatorFilter.innerHTML += `<option value="${c}">${c}</option>`);

  verifierFilter.innerHTML = '<option value="">All Verifiers</option>';
  verifiers.forEach(v => verifierFilter.innerHTML += `<option value="${v}">${v}</option>`);
}


// Render levels according to search, filters, and sort method
function renderFilteredLevels() {
  const search = document.getElementById('search').value.toLowerCase();
  const selectedCreator = document.getElementById('creator-filter').value;
  const selectedVerifier = document.getElementById('verifier-filter').value;
  const sortMethod = document.getElementById('sort-filter').value;

  let filtered = currentLevels.filter(lvl => {
    const creators = lvl.creator.split(',').map(s => s.trim());
    const creatorMatch = selectedCreator === '' || creators.some(c => c === selectedCreator);
    const verifierMatch = selectedVerifier === '' || lvl.verifier === selectedVerifier;
    return lvl.name.toLowerCase().includes(search) && creatorMatch && verifierMatch;
  });

  if (sortMethod === 'id-asc') filtered.sort((a, b) => +a.id - +b.id);
  else if (sortMethod === 'id-desc') filtered.sort((a, b) => +b.id - +a.id);
  else filtered.sort((a, b) => a.rank - b.rank);

  loadLevelsFromJSON(filtered);
}

function highlightText(text) {
  const search = document.getElementById('search').value.toLowerCase();
  if (!search) return text;
  const regex = new RegExp(`(${search})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

// Scroll to top button
const scrollBtn = document.getElementById('scroll-top');
window.addEventListener('scroll', () => {
  scrollBtn.style.display = (window.scrollY > 300) ? 'block' : 'none';
});
scrollBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});


// Event listeners
document.getElementById('search').addEventListener('input', renderFilteredLevels);
document.getElementById('creator-filter').addEventListener('change', renderFilteredLevels);
document.getElementById('verifier-filter').addEventListener('change', renderFilteredLevels);
document.getElementById('sort-filter').addEventListener('change', renderFilteredLevels);
document.getElementById('clear-filters').addEventListener('click', () => {
  document.getElementById('search').value = '';
  document.getElementById('creator-filter').value = '';
  document.getElementById('verifier-filter').value = '';
  document.getElementById('sort-filter').value = 'rank';
  renderFilteredLevels();
});

