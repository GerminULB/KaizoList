(() => {
  let currentLevels = [];

  async function init() {
    try {
      const res = await fetch('../challenges.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      currentLevels = data.map((lvl, idx) => ({
        id: lvl.id ?? (idx + 1),
        name: lvl.name ?? '',
        creator: lvl.creator ?? '',
        verifier: lvl.verifier ?? '',
        klp: Number(lvl.klp) || 0
      }));

      currentLevels.sort((a, b) => b.klp - a.klp);
      currentLevels.forEach((lvl, index) => lvl.rank = index + 1);

      populateFilters(currentLevels);
      renderFilteredLevels();
    } catch (err) {
      console.error(err);
      const container = document.getElementById('level-list');
      if (container) container.innerHTML = `<div class="error">Could not load levels: ${err.message}</div>`;
    }

    attachListeners();
  }

  function attachListeners() {
    const searchEl = document.getElementById('search');
    if (searchEl) searchEl.addEventListener('input', debounce(renderFilteredLevels, 150));

    const creatorFilter = document.getElementById('creator-filter');
    const verifierFilter = document.getElementById('verifier-filter');
    const sortFilter = document.getElementById('sort-filter');
    const clearBtn = document.getElementById('clear-filters');

    if (creatorFilter) creatorFilter.addEventListener('change', renderFilteredLevels);
    if (verifierFilter) verifierFilter.addEventListener('change', renderFilteredLevels);
    if (sortFilter) sortFilter.addEventListener('change', renderFilteredLevels);
    if (clearBtn) clearBtn.addEventListener('click', () => {
      if (searchEl) searchEl.value = '';
      if (creatorFilter) creatorFilter.value = '';
      if (verifierFilter) verifierFilter.value = '';
      if (sortFilter) sortFilter.value = 'rank';
      renderFilteredLevels();
    });
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  }

  function populateFilters(levels) {
    const creatorCount = {};
    levels.forEach(lvl => {
      (lvl.creator || '').split(',').map(s => s.trim()).forEach(c => {
        if (!c) return;
        creatorCount[c] = (creatorCount[c] || 0) + 1;
      });
    });
    const creators = Object.keys(creatorCount).sort((a, b) => creatorCount[b] - creatorCount[a]);

    const verifierCount = {};
    levels.forEach(lvl => {
      const v = (lvl.verifier || '').trim();
      if (!v) return;
      verifierCount[v] = (verifierCount[v] || 0) + 1;
    });
    const verifiers = Object.keys(verifierCount).sort((a, b) => verifierCount[b] - verifierCount[a]);

    const creatorFilter = document.getElementById('creator-filter');
    const verifierFilter = document.getElementById('verifier-filter');

    if (creatorFilter) {
      creatorFilter.innerHTML = '<option value="">All Creators</option>' +
        creators.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    }
    if (verifierFilter) {
      verifierFilter.innerHTML = '<option value="">All Verifiers</option>' +
        verifiers.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    }
  }

  function renderFilteredLevels() {
    const search = (document.getElementById('search')?.value || '').toLowerCase();
    const selectedCreator = (document.getElementById('creator-filter')?.value) || '';
    const selectedVerifier = (document.getElementById('verifier-filter')?.value) || '';
    const sortMethod = (document.getElementById('sort-filter')?.value) || 'rank';

    let filtered = currentLevels.filter(lvl => {
      const creators = (lvl.creator || '').split(',').map(s => s.trim());
      const creatorMatch = selectedCreator === '' || creators.some(c => c === selectedCreator);
      const verifierMatch = selectedVerifier === '' || (lvl.verifier || '') === selectedVerifier;
      return (lvl.name || '').toLowerCase().includes(search) && creatorMatch && verifierMatch;
    });

    if (sortMethod === 'id-asc') filtered.sort((a, b) => +a.id - +b.id);
    else if (sortMethod === 'id-desc') filtered.sort((a, b) => +b.id - +a.id);
    else filtered.sort((a, b) => a.rank - b.rank);

    loadLevelsFromJSON(filtered);
  }

function loadLevelsFromJSON(levels) {
  const container = document.getElementById('level-list');
  const total = levels.reduce((sum, lvl) => sum + (Number(lvl.klp) || 0), 0);
  const totalEl = document.getElementById('total-klp');
  if (totalEl) totalEl.innerText = `Total: ${total.toLocaleString()} KLP`;
  if (!container) return;
  container.innerHTML = '';
  if (!levels.length) {
    container.innerHTML = '<div class="no-results">No results found.</div>';
    return;
  }

  levels.forEach((lvl, idx) => {
    const div = document.createElement('div');
    div.className = 'level';
    div.innerHTML = `
      <div class="level-summary" role="button" tabindex="0" aria-expanded="false">
        <span>#${lvl.rank}: ${highlightText(lvl.name)}</span>
        <strong>${escapeHtml(lvl.klp)} KLP</strong>
      </div>
      <div class="level-details">
        <p><strong>Creator:</strong> ${escapeHtml(lvl.creator)}</p>
        <p><strong>Verifier:</strong> ${escapeHtml(lvl.verifier)}</p>
        <p><strong>ID:</strong> ${escapeHtml(lvl.id)}</p>
      </div>
    `;
    div.querySelector('.level-summary').addEventListener('click', () => {
      window.location.href = `../LevelDetails.html?name=${encodeURIComponent(lvl.name)}`;
    });
    container.appendChild(div);
  });
}


 
  function highlightText(text) {
    const search = (document.getElementById('search')?.value || '').toLowerCase();
    if (!search) return escapeHtml(text || '');
    const regex = new RegExp(`(${escapeRegExp(search)})`, 'gi');
    return escapeHtml(text || '').replace(regex, '<mark>$1</mark>');
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }
  function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  init();
})();
