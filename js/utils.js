
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
  "/KaizoList/history/2026-23-01.json",
  "/KaizoList/history/2026-01-23.json",
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
export async function renderRecentChanges(recentElId, historyFiles = HISTORY_FILES, levelsPath = '../levels.json') {
    const recentChangesEl = document.getElementById(recentElId);
    if (!recentChangesEl) return;

    const latest = await fetchJson(levelsPath) || [];
    if (!latest.length) return;

    const sortedHistory = [...historyFiles].sort();
    const lastFile = sortedHistory[sortedHistory.length - 1];
    const prevSnap = await fetchJson(lastFile) || [];

    const prevMap = Object.fromEntries(prevSnap.map(l => [l.name, l]));
    
    const newLevels = [];
    const klpChanges = [];

    latest.forEach(lvl => {
        const prev = prevMap[lvl.name];
        if (!prev) {
            newLevels.push(lvl);
        } else if (Number(lvl.klp) !== Number(prev.klp)) {
            klpChanges.push({
                name: lvl.name,
                oldKlp: Number(prev.klp) || 0,
                newKlp: Number(lvl.klp) || 0
            });
        }
    });

    recentChangesEl.innerHTML = '';

    if (newLevels.length === 0 && klpChanges.length === 0) {
        recentChangesEl.innerHTML = `<div style="opacity:0.6; padding:10px;">The list is stable. No KLP balances recently.</div>`;
        return;
    }

    const updateDate = lastFile.match(/\d{4}-\d{2}-\d{2}/)?.[0] || 'Previous Update';

    let html = `
        <div class="update-summary">
            <p>Comparing to Snapshot: ${updateDate}</p>
            <ul>
                ${newLevels.length ? `<li>${newLevels.length} New Level(s) Added</li>` : ''}
                ${klpChanges.length ? `<li>${klpChanges.length} Level(s) Rebalanced</li>` : ''}
            </ul>
        </div>
    `;

    newLevels.forEach(lvl => {
        html += `
            <div class="change-item is-new">
                <span class="change-tag tag-new">NEW</span>
                <div class="change-details">${lvl.name}</div>
                <div class="change-numbers" style="color:#f2c27b;">${lvl.klp} KLP</div>
            </div>
        `;
    });

    klpChanges.forEach(change => {
        const isBuff = change.newKlp > change.oldKlp;
        const diff = Math.abs(change.newKlp - change.oldKlp);
        const tagClass = isBuff ? 'tag-buff' : 'tag-nerf';
        const itemClass = isBuff ? 'is-buff' : 'is-nerf';
        const color = isBuff ? '#baffc1' : '#ff6a6a';
        
        html += `
            <div class="change-item ${itemClass}">
                <span class="change-tag ${tagClass}">${isBuff ? 'BUFF' : 'NERF'}</span>
                <div class="change-details">${change.name}</div>
                <div class="change-numbers">
                    ${change.oldKlp} ➔ <span style="color:${color}; font-weight:bold;">${change.newKlp}</span> <br>
                    <span style="font-size:0.8em; color:${color}">${isBuff ? '+' : '-'}${diff} KLP</span>
                </div>
            </div>
        `;
    });

    recentChangesEl.innerHTML = html;
}

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

export function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    n
    const logo = document.querySelector('img.logo');
    if (logo) {
        const isDark = theme === 'dark';
        const currentSrc = logo.getAttribute('src');
        
        if (isDark && !currentSrc.includes('_dark')) {
            logo.src = currentSrc.replace('.png', '_dark.png');
        } else if (!isDark && currentSrc.includes('_dark')) {
            logo.src = currentSrc.replace('_dark.png', '.png');
        }
    }
}

export function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);
    return savedTheme;
}

export function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    const targetTheme = currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', targetTheme);
    applyTheme(targetTheme);
    return targetTheme;
}