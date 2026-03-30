import { fetchJson, renderRecentChanges } from "../js/utils.js";
import { t } from '../js/i18n.js';

(() => {
    let currentLevels = [];

    function getTierInfo(score) {
        if (score === 100) return { label: "Golden Seal", color: "#FFD700", className: "seal-gold" };
        if (score >= 90) return { label: "Silver Seal", color: "#C0C0C0", className: "seal-silver" };
        if (score >= 80) return { label: "Bronze Seal", color: "#CD7F32", className: "seal-bronze" };
        if (score >= 70) return { label: "Top Recommendation", color: "#4CAF50", className: "seal-recommended" };
        if (score >= 60) return { label: "Germin Approved", color: "#8BC34A", className: "seal-approved" };
        if (score >= 50) return { label: "Average", color: "#FFEB3B", className: "seal-average" };
        if (score >= 40) return { label: "Okay-ish", color: "#FFC107", className: "seal-okay" };
        if (score >= 30) return { label: "Below Average", color: "#FF9800", className: "seal-below" };
        if (score >= 20) return { label: "Messy and Bad", color: "#FF5722", className: "seal-messy" };
        if (score >= 10) return { label: "Dumpster Fire", color: "#F44336", className: "seal-dumpster" };
        return { label: "Germinal Garbage", color: "#212121", className: "seal-garbage" };
    }

    async function init() {
        try {
            // Load from the new dedicated JSON germeter file awesome
            const data = await fetchJson('../germeter.json');
            if (!data) throw new Error("Failed to load germeter.json");
            
            currentLevels = data.map((lvl, idx) => ({
                id: lvl.id ?? (idx + 1),
                name: lvl.name ?? '',
                creator: lvl.creator ?? '',
                rating: Number(lvl.rating) || 0,
                comment: lvl.comment ?? ''
            }));

            // Sort by highest rating by default
            currentLevels.sort((a, b) => b.rating - a.rating);

            renderFilteredLevels();
        } catch (err) {
            console.error(err);
            const container = document.getElementById('germeter-list');
            if (container) container.innerHTML = `<div class="error">Could not load ratings: ${err.message}</div>`;
        }

        attachListeners();
    }

    function attachListeners() {
        const searchEl = document.getElementById('search');
        if (searchEl) searchEl.addEventListener('input', debounce(renderFilteredLevels, 150));

        const sealFilter = document.getElementById('seal-filter');
        const sortFilter = document.getElementById('sort-filter');

        if (sealFilter) sealFilter.addEventListener('change', renderFilteredLevels);
        if (sortFilter) sortFilter.addEventListener('change', renderFilteredLevels);
    }

    function debounce(fn, wait) {
        let t;
        return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
    }

    function renderFilteredLevels() {
        const search = (document.getElementById('search')?.value || '').toLowerCase();
        const selectedSeal = (document.getElementById('seal-filter')?.value) || '';
        const sortMethod = (document.getElementById('sort-filter')?.value) || 'rating-desc';

        let filtered = currentLevels.filter(lvl => {
            const tier = getTierInfo(lvl.rating);
            
            // Map the dropdown values to the actual tier labels
            let matchesSeal = true;
            if (selectedSeal === 'gold') matchesSeal = tier.label === "Golden Seal";
            if (selectedSeal === 'silver') matchesSeal = tier.label === "Silver Seal";
            if (selectedSeal === 'bronze') matchesSeal = tier.label === "Bronze Seal";
            if (selectedSeal === 'recommended') matchesSeal = tier.label === "Top Recommendation";

            return (lvl.name || '').toLowerCase().includes(search) && matchesSeal;
        });

        if (sortMethod === 'rating-asc') filtered.sort((a, b) => a.rating - b.rating);
        else filtered.sort((a, b) => b.rating - a.rating);

        loadLevelsFromJSON(filtered);
    }

function loadLevelsFromJSON(levels) {
        const container = document.getElementById('germeter-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!levels.length) {
            container.innerHTML = `<div class="no-results">${t('no_results_found') || 'No levels found.'}</div>`;
            return;
        }

        levels.forEach((lvl, index) => {
            const tier = getTierInfo(lvl.rating);
            
            const div = document.createElement('div');
            div.className = 'level';
            
            div.innerHTML = `
            <div class="level-summary" role="button" style="border-left: 5px solid ${tier.color};">
                <span>#${index + 1}: ${highlightText(lvl.name)}</span>
                <div class="summary-right">
                    <span class="level-rating-badge ${tier.className}" style="background-color:${tier.color}; color:${lvl.rating >= 80 ? '#000' : '#fff'}; padding: 4px 8px; border-radius: 4px; font-weight: bold;">
                        ${tier.label}
                    </span>
                    <strong style="margin-left: 10px; font-size: 1.2em;">${escapeHtml(lvl.rating)}/100</strong>
                </div>
            </div>
            <div class="level-details" style="padding: 10px; background: rgba(0,0,0,0.1); margin-top: 5px;">
                <p><strong>${t('creator') || 'Creator'}:</strong> ${escapeHtml(lvl.creator)}</p>
                <p><strong>ID:</strong> <em>${escapeHtml(lvl.id)}</em></p>
            </div>
            `;

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

    document.addEventListener('keydown', e => {
        if (e.shiftKey && e.key === 'E') {
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            const headers = ['Date', 'Level Name', 'Creator', 'Rating', 'Tier', 'Comment'];

            const rows = currentLevels.map(lvl => [
                dateStr,
                `"${lvl.name}"`,
                `"${lvl.creator}"`,
                lvl.rating,
                `"${getTierInfo(lvl.rating).label}"`,
                `"${lvl.comment}"`
            ]);

            const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `germeter_snapshot_${dateStr}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            console.log(`Secret CSV export triggered! File: germeter_snapshot_${dateStr}.csv`);
        }
    });
})();
