import { fetchJson, splitNames, renderRecentChanges } from "../js/utils.js";
import { BADGES } from "../js/badge.js";
import { t } from '../js/i18n.js';
import { loadLevels } from '../js/data.js';

(() => {
    const LEGACY_RANK_CUTOFF = 100; // ranks 1-100 stay in the Main List, 101+ are Legacy

    let currentLevels = [];   // everything, in original levels.json order, each tagged with .rank and .isLegacy
    let mainLevels = [];      // rank 1-100
    let legacyLevels = [];    // rank 101+, kept in original levels.json order
    let activeTab = 'main';
    let thumbIds = new Set();
    let enjoyment = null;

    async function loadEnjoyment() {
        if (enjoyment) return enjoyment;
        const [{ loadEnjoyment: load }, { loadPlayers }] = await Promise.all([import('../js/enjoyment.js'), import('../js/data.js')]);
        enjoyment = await load(currentLevels.map(l => l.id), await loadPlayers()).catch(() => new Map());
        return enjoyment;
    }
    const enjoyOf = (lvl) => enjoyment?.get(String(lvl.id))?.avg;

    async function init() {
        thumbIds = new Set(((await fetchJson('../thumbs/list.json').catch(() => null)) || []).map(String));

        try {
            const data = await loadLevels();
            if (!data || !data.length) throw new Error("Failed to load the levels");

            const normalized = data.map((lvl, idx) => ({
                id: lvl.id ?? (idx + 1),
                name: lvl.name ?? '',
                creator: lvl.creator ?? '',
                verifier: lvl.verifier ?? '',
                klp: Number(lvl.klp) || 0,
                badges: lvl.badges || []
            }));

            // Rank is derived from KLP, but we keep the array itself in the
            // original levels.json order so the Legacy List can display
            // top-to-bottom-of-file order rather than a KLP re-sort.
            const rankByName = new Map(
                [...normalized]
                    .sort((a, b) => b.klp - a.klp)
                    .map((lvl, i) => [lvl.name, i + 1])
            );

            currentLevels = normalized.map(lvl => {
                const rank = rankByName.get(lvl.name);
                return { ...lvl, rank, isLegacy: rank > LEGACY_RANK_CUTOFF };
            });

            mainLevels = currentLevels.filter(lvl => !lvl.isLegacy);
            legacyLevels = currentLevels.filter(lvl => lvl.isLegacy);

            populateFilters(currentLevels);
            renderFilteredLevels();
        } catch (err) {
            console.error(err);
            const container = document.getElementById('level-list');
            if (container) container.innerHTML = `<div class="error">Could not load levels: ${err.message}</div>`;
        }

        attachListeners();
    }

    const egg = document.getElementById('legacy-egg');
    if (egg) {
        const open = (e) => import('../js/auth-ui.js').then(m => m.openPushEgg(e.clientX || innerWidth / 2, e.clientY || innerHeight / 2));
        egg.addEventListener('click', open);
        egg.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e); });
    }

    function setActiveTab(tab) {
        activeTab = tab;

        const mainBtn = document.getElementById('tab-main');
        const legacyBtn = document.getElementById('tab-legacy');
        const legacyNote = document.getElementById('legacy-note');

        if (mainBtn) {
            mainBtn.classList.toggle('active', tab === 'main');
            mainBtn.setAttribute('aria-selected', tab === 'main');
        }
        if (legacyBtn) {
            legacyBtn.classList.toggle('active', tab === 'legacy');
            legacyBtn.setAttribute('aria-selected', tab === 'legacy');
        }
        if (legacyNote) legacyNote.classList.toggle('hidden', tab !== 'legacy');

        renderFilteredLevels();
    }

    function attachListeners() {
        const searchEl = document.getElementById('search');
        if (searchEl) searchEl.addEventListener('input', debounce(renderFilteredLevels, 150));

        const creatorFilter = document.getElementById('creator-filter');
        const verifierFilter = document.getElementById('verifier-filter');
        const badgeFilter = document.getElementById('badge-filter');
        const sortFilter = document.getElementById('sort-filter');
        const clearBtn = document.getElementById('clear-filters');
        const mainTabBtn = document.getElementById('tab-main');
        const legacyTabBtn = document.getElementById('tab-legacy');

        if (creatorFilter) creatorFilter.addEventListener('change', renderFilteredLevels);
        if (verifierFilter) verifierFilter.addEventListener('change', renderFilteredLevels);
        if (badgeFilter) badgeFilter.addEventListener('change', renderFilteredLevels);
        if (sortFilter) sortFilter.addEventListener('change', renderFilteredLevels);
        if (mainTabBtn) mainTabBtn.addEventListener('click', () => setActiveTab('main'));
        if (legacyTabBtn) legacyTabBtn.addEventListener('click', () => setActiveTab('legacy'));
        
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (searchEl) searchEl.value = '';
                if (creatorFilter) creatorFilter.value = '';
                if (verifierFilter) verifierFilter.value = '';
                if (badgeFilter) badgeFilter.value = '';
                if (sortFilter) sortFilter.value = 'rank';
                renderFilteredLevels();
            });
        }
    }

    function debounce(fn, wait) {
        let t;
        return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
    }

    function populateFilters(levels) {
        const creatorCount = {};
        const verifierCount = {};
        const usedBadges = new Set();

        levels.forEach(lvl => {
            splitNames(lvl.creator).forEach(c => {
                if (c) creatorCount[c] = (creatorCount[c] || 0) + 1;
            });
            const v = (lvl.verifier || '').trim();
            if (v) verifierCount[v] = (verifierCount[v] || 0) + 1;
            if (lvl.badges) lvl.badges.forEach(b => usedBadges.add(b));
        });

        const creators = Object.keys(creatorCount).sort((a, b) => creatorCount[b] - creatorCount[a]);
        const verifiers = Object.keys(verifierCount).sort((a, b) => verifierCount[b] - verifierCount[a]);

        const creatorFilter = document.getElementById('creator-filter');
        const verifierFilter = document.getElementById('verifier-filter');
        const badgeFilter = document.getElementById('badge-filter');

        if (creatorFilter) {
            creatorFilter.innerHTML = `<option value="">${t('filter_all_creators')}</option>` +
                creators.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        }
        if (verifierFilter) {
            verifierFilter.innerHTML = `<option value="">${t('filter_all_verifiers')}</option>` +
                verifiers.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
        }

        if (badgeFilter) {
            const sortedBadgeKeys = Array.from(usedBadges).sort((a, b) => {
                const labelA = BADGES[a]?.label || a;
                const labelB = BADGES[b]?.label || b;
                return labelA.localeCompare(labelB);
            });

            badgeFilter.innerHTML = `<option value="">${t('filter_all_badges')}</option>` +
                sortedBadgeKeys.map(key => {
                    const label = BADGES[key]?.label || key;
                    return `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`;
                }).join('');
        }
    }

    function renderFilteredLevels() {
        const search = (document.getElementById('search')?.value || '').toLowerCase();
        const selectedCreator = (document.getElementById('creator-filter')?.value) || '';
        const selectedVerifier = (document.getElementById('verifier-filter')?.value) || '';
        const selectedBadge = (document.getElementById('badge-filter')?.value) || '';
        const sortMethod = (document.getElementById('sort-filter')?.value) || 'rank';

        const sourceLevels = activeTab === 'legacy' ? legacyLevels : mainLevels;

        let filtered = sourceLevels.filter(lvl => {
            const creators = (lvl.creator || '').split(',').map(s => s.trim());
            const creatorMatch = selectedCreator === '' || creators.some(c => c === selectedCreator);
            const verifierMatch = selectedVerifier === '' || (lvl.verifier || '') === selectedVerifier;
            const badgeMatch = selectedBadge === '' || (lvl.badges && lvl.badges.includes(selectedBadge));

            return (lvl.name || '').toLowerCase().includes(search) && 
                   creatorMatch && verifierMatch && badgeMatch;
        });

        if (sortMethod === 'enjoy' && !enjoyment) {
            loadEnjoyment().then(renderFilteredLevels);
            document.getElementById('level-list').innerHTML = '<p class="submit-center"><span class="kl-loading"></span></p>';
            return;
        }
        if (sortMethod === 'enjoy') filtered.sort((a, b) => ((enjoyOf(b) ?? -1) - (enjoyOf(a) ?? -1)) || (a.rank - b.rank));
        else if (sortMethod === 'id-asc') filtered.sort((a, b) => +a.id - +b.id);
        else if (sortMethod === 'id-desc') filtered.sort((a, b) => +b.id - +a.id);
        else filtered.sort((a, b) => a.rank - b.rank);

        // "Clear Filters" only shows while something is actually filtered or re-sorted.
        const clearBtn = document.getElementById('clear-filters');
        if (clearBtn) {
            const anyActive = search !== '' || selectedCreator !== '' || selectedVerifier !== '' ||
                              selectedBadge !== '' || sortMethod !== 'rank';
            clearBtn.style.display = anyActive ? '' : 'none';
        }

        loadLevelsFromJSON(filtered, sortMethod === 'enjoy');
    }

    function loadLevelsFromJSON(levels, showEnjoy = false) {
        const container = document.getElementById('level-list');
        const totalEl = document.getElementById('total-klp');

        if (totalEl) {
            if (activeTab === 'legacy') {
                totalEl.innerText = t('total_legacy_count', { count: levels.length.toLocaleString() });
            } else {
                const total = levels.reduce((sum, lvl) => sum + (Number(lvl.klp) || 0), 0);
                totalEl.innerText = t('total_klp', { count: total.toLocaleString() });
            }
        }
        
        if (!container) return;
        container.innerHTML = '';
        if (!levels.length) {
            container.innerHTML = `<div class="no-results">${t('no_results_found')}</div>`;
            return;
        }

        levels.forEach(lvl => {
            const levelLink = document.createElement('a');
            levelLink.className = 'level-link-wrapper';
            levelLink.href = `/LevelDetails.html?name=${encodeURIComponent(lvl.name)}`;
            
            const div = document.createElement('div');
            div.className = 'level';

            const enjoy = enjoyOf(lvl);
            const scoreMarkup = showEnjoy
                ? `<strong><img class="kl-score-ico" src="/images/icon/enjoyment.png" alt="">${enjoy == null ? '-' : (Math.round(enjoy * 10) / 10).toFixed(1)}</strong>`
                : lvl.isLegacy
                ? `<strong class="legacy-tag">${t('legacy_label', { defaultValue: 'Legacy' })}</strong>`
                : `<strong>${escapeHtml(lvl.klp)} KLP</strong>`;
            
            div.innerHTML = `
            <div class="level-summary" role="button">
                <span class="rank-board board-9slice sm">#${lvl.rank}</span>
                <span class="name-board board-9slice sm">${highlightText(lvl.name)}</span>
                <div class="summary-right">
                <div class="mini-badge-list"></div>
                <span class="score-board board-9slice sm">${scoreMarkup}</span>
                </div>
            </div>
            <div class="level-details">
                <p><img class="kl-info-ico" src="/images/icon/creator.png" width="32" height="32" alt=""><strong>${t('creator')}:</strong> ${escapeHtml(lvl.creator)}</p>
                <p><img class="kl-info-ico" src="/images/icon/victor.png" width="24" height="28" alt=""><strong>${t('verifier')}:</strong> ${escapeHtml(lvl.verifier)}</p>
                <p><img class="kl-info-ico" src="/images/icon/id.png" width="22" height="26" alt=""><strong>${t('id')}:</strong> ${escapeHtml(lvl.id)}</p>
            </div>
            `;

            if (lvl.id && thumbIds.has(String(lvl.id))) {
                const details = div.querySelector('.level-details');
                const thumb = document.createElement('img');
                thumb.className = 'level-thumb';
                thumb.alt = '';
                thumb.loading = 'lazy';
                thumb.decoding = 'async';
                thumb.onload = () => details.classList.add('has-thumb');
                thumb.onerror = () => thumb.remove();
                thumb.src = `../thumbs/${encodeURIComponent(lvl.id)}.png`;
                details.prepend(thumb);
            }

            const badgeContainer = div.querySelector('.mini-badge-list');
            const badges = lvl.badges || [];
            const priorityOrder = Object.keys(BADGES);
            badges.sort((a, b) => priorityOrder.indexOf(a) - priorityOrder.indexOf(b));

            let overlap = -22;
            if (badges.length > 10) {
                overlap = Math.min(-22, -17 - (badges.length * 0.6));
                if (badges.length > 25) overlap = -34;
            }

            badges.forEach((key, index) => {
                const bData = BADGES[key];
                if (!bData) return;
                const img = document.createElement('img');
                img.src = `../${bData.icon}`;
                img.className = 'mini-badge';
                img.title = bData.label;
                if (index > 0) img.style.marginLeft = `${overlap}px`;
                badgeContainer.appendChild(img);
            });

            levelLink.appendChild(div);
            container.appendChild(levelLink);
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

loadLevels().then(levels => renderRecentChanges('recent-changes', undefined, levels));