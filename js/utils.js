
// js/utils.js
export const HISTORY_FILES = [
  "/KaizoList/history/2025-09-11.json",
  "/KaizoList/history/2025-09-20.json",
  "/KaizoList/history/2025-09-21.json",
  "/KaizoList/history/2025-09-28.json",
  "/KaizoList/history/2025-10-16.json",
  "/KaizoList/history/2025-10-29.json",
  "/KaizoList/history/2025-11-26.json",
  "/KaizoList/history/2026-01-08.json",
];

export async function fetchJson(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('fetchJson failed', path, e);
    return null;
  }
}

export function rankByKLP(levels = []) {
  return [...levels]
    .sort((a, b) => (b.klp || 0) - (a.klp || 0))
    .map((lvl, i) => ({ ...lvl, rank: i + 1 }));
}

export function splitNames(str = '') {
  return String(str).split(',').map(s => s.trim()).filter(Boolean);
}

// Apply random pattern to buttons
export function applyRandomPattern(buttonSelector, patterns) {
  document.querySelectorAll(buttonSelector).forEach(btn => {
    const idx = Math.floor(Math.random() * patterns.length);
    btn.style.backgroundImage = `url('${patterns[idx]}')`;
    btn.style.backgroundRepeat = 'repeat';
    btn.style.backgroundSize = '32px 32px';
    btn.style.color = '#ffffff';
    btn.style.border = '2px solid black';
    btn.style.imageRendering = 'pixelated';
    btn.style.textShadow = '1px 1px 0 #000';
  });
}

// Render recent changes INTO an element with id recentElId
export async function renderRecentChanges(recentElId, historyFiles = HISTORY_FILES, levelsPath = 'levels.json') {
  const recentChangesEl = document.getElementById(recentElId);
  if (!recentChangesEl) return;

  let previousSnapshot = null;
  let initialMessage = null;

  for (const file of historyFiles) {
    const snap = await fetchJson(file);
    if (!snap) continue;
    const ranked = rankByKLP(snap);
    if (!previousSnapshot && ranked.length) {
      const date = file.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? file;
      initialMessage = `On ${date}, "${ranked[0].name}" was recorded at rank ${ranked[0].rank} with ${ranked[0].klp} KLP.`;
    }
    previousSnapshot = ranked.map(l => ({ name: l.name, rank: l.rank, klp: l.klp }));
  }

  const latest = await fetchJson(levelsPath);
  if (!latest) {
    recentChangesEl.innerText = "Error loading recent changes.";
    return;
  }
  const latestRanked = rankByKLP(latest);
  const prevMap = Object.fromEntries((previousSnapshot || []).map(p => [p.name, p]));

  let changesFound = false;
  latestRanked.forEach(lvl => {
    const prev = prevMap[lvl.name];
    if (!prev) return;
    const rankChange = lvl.rank - prev.rank;
    const klpChange = (lvl.klp || 0) - (prev.klp || 0);
    if (rankChange === 0 && klpChange === 0) return;

    const div = document.createElement('div');
    div.style.marginBottom = '4px';
    const parts = [];
    if (rankChange !== 0) parts.push(rankChange > 0 ? `${rankChange} spots down` : `${-rankChange} spots up`);
    if (klpChange !== 0) parts.push(`${klpChange > 0 ? '+' : ''}${klpChange} KLP`);
    div.innerText = `${lvl.name}: ${parts.join(', ')}`;
    recentChangesEl.appendChild(div);
    recentChangesEl.appendChild(document.createElement('hr'));
    changesFound = true;
  });

  if (!changesFound && initialMessage) {
    const note = document.createElement('div');
    note.style.marginTop = '8px';
    note.style.fontWeight = 'bold';
    note.innerText = initialMessage;
    recentChangesEl.appendChild(note);
  }
  if (!changesFound && !initialMessage) {
    recentChangesEl.innerText = "No recent changes.";
  }
}

// Generic pagination helper
export function paginateGrid(items, containerId, opts = {}) {
  const {
    itemsPerPage = 9,
    renderItem = (item) => {
      const el = document.createElement('div');
      el.className = 'grid-item';
      el.innerText = item.name ?? item;
      return el;
    },
    onPageButtonClick = null
  } = opts;

  const container = document.getElementById(containerId);
  if (!container) return;

  let currentPage = 1;
  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));

  function render() {
    container.innerHTML = '';
    const pageItems = items.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    pageItems.forEach(item => container.appendChild(renderItem(item)));

    let pagination = container.parentElement.querySelector('.pagination');
    if (!pagination) {
      pagination = document.createElement('div');
      pagination.className = 'pagination';
      container.parentElement.appendChild(pagination);
    }
    pagination.innerHTML = '';

    if (totalPages > 1) {
      for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.innerText = i;
        if (i === currentPage) btn.disabled = true;
        btn.addEventListener('click', () => {
          currentPage = i;
          render();
          if (onPageButtonClick) onPageButtonClick(i);
        });
        pagination.appendChild(btn);
      }
    }
  }

  render();
}
