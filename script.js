async function loadLevels() {
  const res = await fetch('levels.json');
  const levels = await res.json();
  const container = document.getElementById('level-list');
  const total = levels.reduce((sum, lvl) => sum + lvl.klp, 0);
  document.getElementById('total-klp').innerText = `Total: ${total.toLocaleString()} KLP`;

  // Populate dropdown filters
  <p><strong>Creator:</strong> ${lvl.creator.split(',').map(s => s.trim()).join(', ')}</p>
  const verifiers = [...new Set(levels.map(l => l.verifier))].sort();
  const creatorFilter = document.getElementById('creator-filter');
  const verifierFilter = document.getElementById('verifier-filter');
  creators.forEach(c => creatorFilter.innerHTML += `<option value="${c}">${c}</option>`);
  verifiers.forEach(v => verifierFilter.innerHTML += `<option value="${v}">${v}</option>`);

  const render = () => {
    const search = document.getElementById('search').value.toLowerCase();
    const selectedCreator = creatorFilter.value;
    const selectedVerifier = verifierFilter.value;
    const sortMethod = document.getElementById('sort-filter').value;

    container.innerHTML = '';
    let filtered = levels.filter(lvl => {
      const levelCreators = lvl.creator.split(',').map(s => s.trim());
      return lvl.name.toLowerCase().includes(search) &&
        (selectedCreator === '' || levelCreators.includes(selectedCreator)) &&
        (selectedVerifier === '' || lvl.verifier === selectedVerifier);
    });


    if (sortMethod === 'id-asc') {
      filtered.sort((a, b) => +a.id - +b.id);
    } else if (sortMethod === 'id-desc') {
      filtered.sort((a, b) => +b.id - +a.id);
    } else {
      filtered.sort((a, b) => a.rank - b.rank);
    }

    filtered.forEach(lvl => {
      const div = document.createElement('div');
      div.className = 'level';
      div.innerHTML = `
        <div class="level-summary">
          <span>#${lvl.rank}: ${lvl.name}</span>
          <strong>${lvl.klp} KLP</strong>
        </div>
        <div class="level-details">
          <p><strong>ID:</strong> ${lvl.id}</p>
          <p><strong>Creator:</strong> ${lvl.creator}</p>
          <p><strong>Verifier:</strong> ${lvl.verifier}</p>
        </div>
      `;

      div.querySelector('.level-summary').addEventListener('click', () => {
        const details = div.querySelector('.level-details');
        details.style.display = details.style.display === 'none' ? 'block' : 'none';
      });

      container.appendChild(div);
    });
  };

  // Attach events
  document.getElementById('search').addEventListener('input', render);
  creatorFilter.addEventListener('change', render);
  verifierFilter.addEventListener('change', render);
  document.getElementById('sort-filter').addEventListener('change', render);

  render();
}

loadLevels();
