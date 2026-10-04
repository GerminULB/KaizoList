// js/utils.js
import { BADGES } from './badge.js';
import { t, tn } from './i18n.js';

/** Ranks 1-100 are the Main List, 101+ are Legacy. Single source of truth. */
export const LEGACY_RANK_CUTOFF = 100;

/**
 * Fallback only. The real list of snapshots lives in /history/index.json
 * (see tools/save-snapshot.mjs), so adding a snapshot no longer needs a code edit.
 */
export const HISTORY_FILES = [
  "/history/2025-09-11.json",
  "/history/2025-09-20.json",
  "/history/2025-09-21.json",
  "/history/2025-09-28.json",
  "/history/2025-10-16.json",
  "/history/2025-10-29.json",
  "/history/2025-11-26.json",
  "/history/2026-01-08.json",
  "/history/2026-01-23.json",
  "/history/2026-02-01.json",
  "/history/2026-04-18.json",
  "/history/2026-09-12.json",
  "/history/2026-09-19.json",
  "/history/2026-09-26.json",
  "/history/2026-10-03.json",
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

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

/**
 * Rank by KLP (highest first). Ties keep their original order in the source
 * file, so a level's placement is identical everywhere (Main List, Level
 * Details, history) -- this is the one ranking function the whole site uses.
 */
export function rankByKLP(levels = []) {
  return levels
    .map((lvl, i) => ({ lvl, i }))
    .sort((a, b) => ((Number(b.lvl.klp) || 0) - (Number(a.lvl.klp) || 0)) || (a.i - b.i))
    .map(({ lvl }, idx) => ({ ...lvl, klp: Number(lvl.klp) || 0, rank: idx + 1 }));
}

// ---------------------------------------------------------------------------
// History loading
// ---------------------------------------------------------------------------

const dateOf = (file) => String(file).match(/\d{4}-\d{2}-\d{2}/)?.[0] || null;

let _historyPromise = null;

let _filesPromise = null;

/** Reads /history/index.json ({ "snapshots": ["2026-10-03.json", ...] }); falls back to HISTORY_FILES. Cached. */
export function getHistoryFiles() {
  if (!_filesPromise) {
    _filesPromise = (async () => {
      const manifest = await fetchJson('/history/index.json');
      const list = Array.isArray(manifest) ? manifest : manifest?.snapshots;
      if (Array.isArray(list) && list.length) {
        return list.map(f => (String(f).startsWith('/') ? f : `/history/${f}`)).sort();
      }
      return [...HISTORY_FILES].sort();
    })();
  }
  return _filesPromise;
}

/** Accepts both snapshot formats: legacy plain array, or v2 { version, date, levels, victors }. */
function normalizeSnapshot(raw, file) {
  const arr = Array.isArray(raw) ? raw : (raw?.levels || []);
  const levels = arr.map(l => ({
    ...l,
    // one 2026-04-18 entry has a "crea tor" typo key
    creator: l.creator ?? l['crea tor'] ?? '',
    // old snapshots (before 2026-04-18) have no badge data at all; keep that as `undefined`
    // so we never report "all badges removed" when we simply don't know.
    badges: Array.isArray(l.badges) ? l.badges : undefined,
  }));
  return {
    date: raw?.date || dateOf(file),
    file,
    levels: rankByKLP(levels),
    victors: Array.isArray(raw) ? null : (raw?.victors || null),
  };
}

const _snapshotCache = new Map(); // file -> Promise<snapshot|null>, so a file is never downloaded twice

function loadSnapshotFile(file) {
  if (!_snapshotCache.has(file)) {
    _snapshotCache.set(file, fetchJson(file).then(raw => (raw ? normalizeSnapshot(raw, file) : null)));
  }
  return _snapshotCache.get(file);
}

async function loadSnapshots(files) {
  const snaps = await Promise.all(files.map(loadSnapshotFile));
  return snaps
    .filter(s => s && s.levels.length)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/**
 * Loads every snapshot (cached), oldest -> newest. Each snapshot has its
 * levels ranked, so rank is always "the rank that level had on that date".
 * Only needed where the full timeline is shown (Level Details).
 */
export function loadHistory() {
  if (!_historyPromise) _historyPromise = getHistoryFiles().then(loadSnapshots);
  return _historyPromise;
}

/** Just the newest `n` snapshots (default 2). Recent Changes only ever needs the last two. */
export async function loadLatestSnapshots(n = 2) {
  const files = await getHistoryFiles();
  return loadSnapshots(files.slice(-n));
}

// ---------------------------------------------------------------------------
// Diffing
// ---------------------------------------------------------------------------

/**
 * Compares two ranked level lists (prev -> curr). Levels are matched by name,
 * the same way the rest of the site looks levels up (a rename shows as removed + new).
 *
 * rankDelta / klpDelta are positive when the level improved.
 */
export function diffLevels(prevRanked, currRanked, cutoff = LEGACY_RANK_CUTOFF) {
  const prevMap = new Map(prevRanked.map(l => [l.name, l]));
  const currMap = new Map(currRanked.map(l => [l.name, l]));

  const added = [];
  const removed = [];
  const changed = [];   // KLP, badges, or Main/Legacy boundary changed
  const shifted = [];   // only moved because other levels moved around them

  currRanked.forEach(c => {
    const p = prevMap.get(c.name);
    if (!p) { added.push(c); return; }

    const klpDelta = c.klp - p.klp;
    const rankDelta = p.rank - c.rank;

    let badgesAdded = [];
    let badgesRemoved = [];
    if (p.badges !== undefined && c.badges !== undefined) {
      const pb = new Set(p.badges);
      const cb = new Set(c.badges);
      badgesAdded = [...cb].filter(b => !pb.has(b));
      badgesRemoved = [...pb].filter(b => !cb.has(b));
    }

    const leftMain = p.rank <= cutoff && c.rank > cutoff;
    const enteredMain = p.rank > cutoff && c.rank <= cutoff;

    const entry = { name: c.name, prev: p, curr: c, klpDelta, rankDelta, badgesAdded, badgesRemoved, leftMain, enteredMain };

    if (klpDelta || badgesAdded.length || badgesRemoved.length || leftMain || enteredMain) changed.push(entry);
    else if (rankDelta) shifted.push(entry);
  });

  prevRanked.forEach(p => { if (!currMap.has(p.name)) removed.push(p); });

  return { added, removed, changed, shifted, isEmpty: !added.length && !removed.length && !changed.length && !shifted.length };
}

/**
 * When did this level first show up past the Legacy cutoff?
 * Uses the same ranking as everything else (and the real cutoff, 100).
 */
export async function findLegacyTransition(levelName, legacyRankCutoff = LEGACY_RANK_CUTOFF) {
  const history = await loadHistory();
  let earliestLegacyDate = null;
  let sawLevel = false;

  for (const snap of history) {
    const entry = snap.levels.find(l => l.name === levelName);
    if (!entry) continue;
    sawLevel = true;

    if (entry.rank > legacyRankCutoff) {
      earliestLegacyDate = snap.date;
      break;
    }
    earliestLegacyDate = null;
  }

  return {
    date: earliestLegacyDate,
    approximate: earliestLegacyDate !== null, // snapshot-bounded
    everSeenInHistory: sawLevel
  };
}

/**
 * Builds one level's history from a list of frames ({ date, levels (ranked), isLive? }, oldest -> newest).
 * An event is created whenever the level's KLP, badges, Main/Legacy status OR position changed.
 * For position changes it also works out WHY it moved, by comparing which levels sat above it
 * before and after:
 *   cause.added   levels that appeared above it (brand new levels)
 *   cause.passed  levels that climbed past it (their KLP went up)
 *   cause.removed levels above it that were removed from the list
 *   cause.dropped levels that used to be above it but fell below
 * Event types: 'entry' (added, or re-added), 'change', 'removed'. Returns events oldest -> newest.
 */
export function buildLevelTimeline(frames, levelName) {
  const events = [];
  let prevFrame = null;
  let prevEntry = null;

  for (const frame of frames) {
    const entry = frame.levels.find(l => l.name === levelName);
    if (!entry) {
      // the level was on the previous frame but is gone now -> it got removed from the list
      if (prevEntry) events.push({ type: 'removed', date: frame.date, isLive: !!frame.isLive, rank: prevEntry.rank });
      prevFrame = frame; prevEntry = null; continue;
    }

    if (!prevEntry) {
      // first appearance, or coming back after having been removed
      events.push({ type: 'entry', date: frame.date, isLive: !!frame.isLive, klp: entry.klp, rank: entry.rank });
    } else {
      const own = diffLevels([prevEntry], [entry]).changed[0] || null;
      const moved = prevEntry.rank !== entry.rank;

      if (own || moved) {
        let cause = null;
        if (moved) {
          const prevAbove = new Set(prevFrame.levels.filter(l => l.rank < prevEntry.rank).map(l => l.name));
          const currAbove = new Set(frame.levels.filter(l => l.rank < entry.rank).map(l => l.name));
          const prevNames = new Set(prevFrame.levels.map(l => l.name));
          const currNames = new Set(frame.levels.map(l => l.name));
          const currRank = new Map(frame.levels.map(l => [l.name, l.rank]));
          const prevRank = new Map(prevFrame.levels.map(l => [l.name, l.rank]));

          cause = { added: [], passed: [], removed: [], dropped: [] };
          currAbove.forEach(n => { if (!prevAbove.has(n)) (prevNames.has(n) ? cause.passed : cause.added).push(n); });
          prevAbove.forEach(n => { if (!currAbove.has(n)) (currNames.has(n) ? cause.dropped : cause.removed).push(n); });

          cause.added.sort((a, b) => currRank.get(a) - currRank.get(b));
          cause.passed.sort((a, b) => currRank.get(a) - currRank.get(b));
          cause.dropped.sort((a, b) => currRank.get(a) - currRank.get(b));
          cause.removed.sort((a, b) => prevRank.get(a) - prevRank.get(b));
        }
        events.push({
          type: 'change',
          date: frame.date,
          isLive: !!frame.isLive,
          prev: prevEntry,
          curr: entry,
          own,                       // KLP / badge / Main-Legacy change of the level itself (or null)
          rankDelta: prevEntry.rank - entry.rank, // positive = climbed
          cause,
        });
      }
    }
    prevFrame = frame;
    prevEntry = entry;
  }
  return events;
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

const fmtRank = (r) => `#${r}`;

function rankMove(from, to) {
  const up = from - to; // positive = climbed
  if (!up) return `<span class="rank-flat">${fmtRank(to)}</span>`;
  const cls = up > 0 ? 'rank-up' : 'rank-down';
  const arrow = up > 0 ? '▲' : '▼';
  return `${fmtRank(from)} ➔ <span class="${cls}">${fmtRank(to)} (${arrow}${Math.abs(up)})</span>`;
}

function badgeChips(keys, sign) {
  return keys.map(k => {
    const b = BADGES[k];
    const label = (b?.label || k).replace(/ Badge$/, '');
    const icon = b ? `<img src="/${escapeHtml(b.icon)}" class="change-badge-icon" alt="">` : '';
    return `<span class="change-badge ${sign === '+' ? 'badge-added' : sign === '-' ? 'badge-removed' : ''}" title="${escapeHtml(b?.label || k)}">${icon}${sign}${escapeHtml(label)}</span>`;
  }).join('');
}

function changeRow({ tag, tagClass, itemClass, name, sub = '', numbers = '' }) {
  return `
    <div class="change-item board-9slice sm ${itemClass}">
        <span class="change-tag ${tagClass}">${tag}</span>
        <div class="change-details">
            <a class="change-link" href="/LevelDetails.html?name=${encodeURIComponent(name)}">${escapeHtml(name)}</a>
            ${sub ? `<div class="change-sub">${sub}</div>` : ''}
        </div>
        <div class="change-numbers">${numbers}</div>
    </div>`;
}

function renderDiffHtml(diff, fromDate) {
  const { added, removed, changed, shifted } = diff;
  const rebalanced = changed.filter(c => c.klpDelta);
  const fellOut = changed.filter(c => c.leftMain);
  const returned = changed.filter(c => c.enteredMain);
  const badgeChanged = changed.filter(c => c.badgesAdded.length || c.badgesRemoved.length);

  const bullets = [
    added.length ? tn('changes_new_count', added.length) : '',
    removed.length ? tn('changes_removed_count', removed.length) : '',
    rebalanced.length ? tn('changes_rebalanced_count', rebalanced.length) : '',
    fellOut.length ? tn('changes_legacy_count', fellOut.length) : '',
    returned.length ? tn('changes_returned_count', returned.length) : '',
    badgeChanged.length ? tn('changes_badges_count', badgeChanged.length) : '',
    shifted.length ? tn('changes_shifted_count', shifted.length) : '',
  ].filter(Boolean);

  let html = `
    <div class="update-summary">
        <p>${t('changes_since', { date: fromDate })}</p>
        <ul>${bullets.map(b => `<li>${b}</li>`).join('')}</ul>
    </div>`;

  added.forEach(l => {
    const legacy = l.rank > LEGACY_RANK_CUTOFF;
    html += changeRow({
      tag: t('tag_new'), tagClass: 'tag-new', itemClass: 'is-new', name: l.name,
      sub: [legacy ? t('changes_added_legacy') : '', badgeChips(l.badges || [], '')].filter(Boolean).join(' '),
      numbers: `<span style="color:#f2c27b;">${l.klp} KLP</span><br><span class="change-rank">${fmtRank(l.rank)}</span>`
    });
  });

  changed.forEach(c => {
    const buff = c.klpDelta > 0;
    const nerf = c.klpDelta < 0;
    let tag, tagClass, itemClass;
    if (c.leftMain)         { tag = t('tag_legacy');   tagClass = 'tag-legacy';  itemClass = 'is-legacy'; }
    else if (c.enteredMain) { tag = t('tag_returned'); tagClass = 'tag-buff';    itemClass = 'is-buff'; }
    else if (buff)          { tag = t('tag_buff');     tagClass = 'tag-buff';    itemClass = 'is-buff'; }
    else if (nerf)          { tag = t('tag_nerf');     tagClass = 'tag-nerf';    itemClass = 'is-nerf'; }
    else                    { tag = t('tag_badges');   tagClass = 'tag-badges';  itemClass = 'is-badges'; }

    const color = buff ? '#baffc1' : '#ff6a6a';
    const klpLine = c.klpDelta
      ? `${c.prev.klp} ➔ <span style="color:${color}; font-weight:bold;">${c.curr.klp}</span> <span style="font-size:0.8em; color:${color}">(${buff ? '+' : '-'}${Math.abs(c.klpDelta)} KLP)</span>`
      : `${c.curr.klp} KLP`;

    const notes = [];
    if (c.leftMain) notes.push(`<span class="change-note note-legacy">${t('changes_left_main')}</span>`);
    if (c.enteredMain) notes.push(`<span class="change-note note-return">${t('changes_back_to_main')}</span>`);

    html += changeRow({
      tag, tagClass, itemClass, name: c.name,
      sub: [...notes, badgeChips(c.badgesAdded, '+'), badgeChips(c.badgesRemoved, '-')].filter(Boolean).join(' '),
      numbers: `${klpLine}<br><span class="change-rank">${rankMove(c.prev.rank, c.curr.rank)}</span>`
    });
  });

  removed.forEach(l => {
    html += changeRow({
      tag: t('tag_removed'), tagClass: 'tag-nerf', itemClass: 'is-nerf', name: l.name,
      sub: t('changes_removed_from_list'),
      numbers: `<span class="change-rank">${t('changes_was_rank', { rank: l.rank })}</span>`
    });
  });

  if (shifted.length) {
    const up = shifted.filter(s => s.rankDelta > 0).length;
    const down = shifted.length - up;
    html += `<div class="change-footnote">${tn('changes_shifted_note', shifted.length, { up, down })}</div>`;
  }

  return html;
}

// Render recent changes INTO an element with id recentElId.
// Compares the live levels.json against the newest snapshot; if nothing differs
// (e.g. the snapshot was just saved), shows what changed between the two newest snapshots.
export async function renderRecentChanges(recentElId, _historyFiles, levelsPath = '../levels.json') {
    const recentChangesEl = document.getElementById(recentElId);
    if (!recentChangesEl) return;

    const live = await fetchJson(levelsPath) || [];
    if (!live.length) return;

    const history = await loadLatestSnapshots(2); // only the newest two, not the whole archive
    const liveRanked = rankByKLP(live.map(l => ({ ...l, badges: Array.isArray(l.badges) ? l.badges : undefined })));

    let diff = null;
    let fromDate = '';

    if (history.length) {
        const latest = history[history.length - 1];
        diff = diffLevels(latest.levels, liveRanked);
        fromDate = latest.date;

        if (diff.isEmpty && history.length > 1) {
            const prev = history[history.length - 2];
            diff = diffLevels(prev.levels, latest.levels);
            fromDate = prev.date;
        }
    }

    if (!diff || diff.isEmpty) {
        recentChangesEl.innerHTML = `<div style="opacity:0.6; padding:10px;">${t('changes_stable')}</div>`;
        return;
    }

    recentChangesEl.innerHTML = renderDiffHtml(diff, fromDate);
}

export function paginateGrid(items, containerId, opts = {}) {
  const {
    itemsPerPage = 9,
    renderItem = (item) => {
      const el = document.createElement('div');
      el.className = 'grid-item board-9slice sm';
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