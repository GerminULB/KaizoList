import { BADGES } from "../js/badge.js";
import { t } from '../js/i18n.js';

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
                klp: Number(lvl.klp) || 0,
                badges: lvl.badges || [] 
            }));

            currentLevels.sort((a, b) => b.klp - a.klp);
            currentLevels.forEach((lvl, index) => lvl.rank = index + 1);

            populateFilters(currentLevels);
            renderFilteredLevels();
        } catch (err) {
            console.error(err);
            const container = document.getElementById('level-list');
            if (container) container.innerHTML = `<div class="error">Could not load challenges: ${err.message}</div>`;
        }

        attachListeners();
    }

    function attachListeners() {
        const searchEl = document.getElementById('search');
        if (searchEl) searchEl.addEventListener('input', debounce(renderFilteredLevels, 150));

        const creatorFilter = document.getElementById('creator-filter');
        const verifierFilter = document.getElementById('verifier-filter');
        const badgeFilter = document.getElementById('badge-filter');
        const sortFilter = document.getElementById('sort-filter');
        const clearBtn = document.getElementById('clear-filters');

        if (creatorFilter) creatorFilter.addEventListener('change', renderFilteredLevels);
        if (verifierFilter) verifierFilter.addEventListener('change', renderFilteredLevels);
        if (badgeFilter) badgeFilter.addEventListener('change', renderFilteredLevels);
        if (sortFilter) sortFilter.addEventListener('change', renderFilteredLevels);
        
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
            (lvl.creator || '').split(',').map(s => s.trim()).forEach(c => {
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

        let filtered = currentLevels.filter(lvl => {
            const creators = (lvl.creator || '').split(',').map(s => s.trim());
            const creatorMatch = selectedCreator === '' || creators.some(c => c === selectedCreator);
            const verifierMatch = selectedVerifier === '' || (lvl.verifier || '') === selectedVerifier;
            const badgeMatch = selectedBadge === '' || (lvl.badges && lvl.badges.includes(selectedBadge));

            return (lvl.name || '').toLowerCase().includes(search) && creatorMatch && verifierMatch && badgeMatch;
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
        
        if (totalEl) totalEl.innerText = t('total_klp', { count: total.toLocaleString() });
        
        if (!container) return;
        container.innerHTML = '';
        if (!levels.length) {
            container.innerHTML = `<div class="no-results">${t('no_results_found')}</div>`;
            return;
        }

        levels.forEach((lvl) => {
            const levelLink = document.createElement('a');
            levelLink.className = 'level-link-wrapper';
            levelLink.href = `/KaizoList/LevelDetails.html?name=${encodeURIComponent(lvl.name)}&from=challenge`;

            const div = document.createElement('div');
            div.className = 'level';
            
            div.innerHTML = `
            <div class="level-summary" role="button">
                <span>#${lvl.rank}: ${highlightText(lvl.name)}</span>
                <div class="summary-right">
                <div class="mini-badge-list"></div>
                <strong>${escapeHtml(lvl.klp)} KLP</strong>
                </div>
            </div>
            <div class="level-details">
                <p><strong>${t('creator')}:</strong> ${escapeHtml(lvl.creator)}</p>
                <p><strong>${t('verifier')}:</strong> ${escapeHtml(lvl.verifier)}</p>
                <p><strong>${t('id')}:</strong> ${escapeHtml(lvl.id)}</p>
            </div>
            `;

            const badgeContainer = div.querySelector('.mini-badge-list');
            const badges = lvl.badges || [];
            const overlap = badges.length > 10 ? -15 : -10;

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