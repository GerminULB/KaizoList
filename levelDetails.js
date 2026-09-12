import { fetchJson, HISTORY_FILES, findLegacyTransition } from './js/utils.js';
import { BADGES, getSpecialBadgeByRank } from './js/badge.js';
import { renderBadgeDeck, handleBadgeSkew } from './js/badgeSystem.js';
import { t } from './js/i18n.js';

document.addEventListener('DOMContentLoaded', async () => {
    const ITEMS_PER_PAGE = 9;

    const LEGACY_RANK_CUTOFF = 100; // ranks 1-100 stay in the Main List, 101+ are Legacy

    const params = new URLSearchParams(window.location.search);
    const levelName = params.get('name');

    if (!levelName) return alert(t('error_no_level'));
    const [levels, challenges, victorsData] = await Promise.all([
        fetchJson('levels.json'),
        fetchJson('challenges.json'),
        fetchJson('victors.json')
    ]);

    const level = levels.find(l => l.name === levelName) || (challenges || []).find(l => l.name === levelName);
    
    if (!level) return alert(t('error_level_not_found'));


    const safeSet = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    };

    safeSet('level-name', level.name);
    safeSet('level-id', level.id || 'N/A');
    safeSet('level-klp', level.klp || 0);

    const rankEl = document.getElementById('level-rank');
    const klpRowEl = document.getElementById('level-klp-row');
    const isOnMainList = levels.some(l => l.name === levelName);
    let rank = 0;

    if (isOnMainList) {
        const sortedForRank = [...levels].sort((a, b) => b.klp - a.klp);
        rank = sortedForRank.findIndex(l => l.name === levelName) + 1;
        const isLegacy = rank > LEGACY_RANK_CUTOFF;

        if (isLegacy) {
            if (klpRowEl) klpRowEl.classList.add('hidden');
            if (rankEl) {
                rankEl.innerHTML = `${t('legacy_label', { defaultValue: 'Legacy' })} <span style="font-size: 0.7em; opacity: 0.6; margin-left: 5px;">${t('label_legacy_list', { defaultValue: '(Legacy List)' })}</span>`;
            }

            // Fire-and-forget: scan snapshot history for when this level first
            // showed up past the legacy cutoff. Doesn't block the rest of the page.
            const legacyDateRowEl = document.getElementById('level-legacy-date-row');
            const legacyDateEl = document.getElementById('level-legacy-date');
            if (legacyDateRowEl && legacyDateEl && level.id) {
                findLegacyTransition(level.id, LEGACY_RANK_CUTOFF, HISTORY_FILES).then(({ date, approximate, everSeenInHistory }) => {
                    if (date) {
                        legacyDateEl.innerText = approximate ? `~${date}` : date;
                        legacyDateEl.title = t('legacy_since_approx_tooltip', {
                            defaultValue: 'Approximate -- based on the earliest saved snapshot where this level already ranked below the cutoff.'
                        });
                        legacyDateRowEl.classList.remove('hidden');
                    } else if (!everSeenInHistory) {
                        // Not found in any snapshot -> likely dropped to Legacy after the most recent one
                        legacyDateEl.innerText = t('legacy_since_recent', { defaultValue: 'Recently' });
                        legacyDateRowEl.classList.remove('hidden');
                    }
                    // If date is null but everSeenInHistory is true, the level was
                    // confirmed non-legacy in the newest snapshot we have, and only
                    // dropped afterward -- leave the row hidden rather than guess.
                }).catch(() => { /* best-effort, no history data is not fatal */ });
            }
        } else if (rankEl) {
            rankEl.innerHTML = `${rank} <span style="font-size: 0.7em; opacity: 0.6; margin-left: 5px;">${t('label_main_list')}</span>`;
        }
    } else {
        rankEl?.closest('p')?.classList.add('hidden');
    }

    // badges
    const mainTrophies = [];
    const seriesTrophies = [];

    const specialKey = getSpecialBadgeByRank(rank);
    if (specialKey) {
        mainTrophies.push({ key: specialKey, levelName: level.name, rank: rank });
    }

    if (level.badges && Array.isArray(level.badges)) {
        level.badges.forEach(key => {
            const badgeData = BADGES[key];
            if (!badgeData) return;
            const trophyObj = { key: key, levelName: level.name, rank: rank };
            if (badgeData.type === 'series') seriesTrophies.push(trophyObj);
            else mainTrophies.push(trophyObj);
        });
    }

    const badgeRow = document.getElementById('badge-row');
    const seriesRow = document.getElementById('series-badge');
    
    document.title = t('level_page_title', { 
        prefix: t('prefix_kaizo'), 
        name: level.name, 
        klp: level.klp 
    });

    renderBadgeDeck(mainTrophies, badgeRow, BADGES);
    renderBadgeDeck(seriesTrophies, seriesRow, BADGES);

    document.addEventListener('mousemove', handleBadgeSkew);

    const historyEl = document.getElementById('history');
    if (historyEl && level) {
        historyEl.innerHTML = `<div style="opacity:0.6;">${t('history_scanning')}</div>`;
        
        let timeline = [];
        let lastKlp = null;
        const chronologicalFiles = [...HISTORY_FILES].sort();

        for (const file of chronologicalFiles) {
            const snap = await fetchJson(file);
            if (!snap) continue;
            
            const entry = snap.find(l => l.name === level.name);
            const date = file.match(/\d{4}-\d{2}-\d{2}/)?.[0] || t('unknown_date');

            if (entry) {
                const currentKlp = Number(entry.klp) || 0;
                if (lastKlp === null) {
                    timeline.push({ type: 'entry', date, klp: currentKlp });
                } else if (currentKlp !== lastKlp) {
                    timeline.push({ type: 'klp_change', date, oldKlp: lastKlp, newKlp: currentKlp });
                }
                lastKlp = currentKlp;
            }
        }

        const currentLiveKlp = Number(level.klp) || 0;
        if (lastKlp !== null && currentLiveKlp !== lastKlp) {
            timeline.push({ type: 'klp_change', date: t('live_update'), oldKlp: lastKlp, newKlp: currentLiveKlp });
        } else if (lastKlp === null) {
            timeline.push({ type: 'entry', date: t('just_added'), klp: currentLiveKlp });
        }

        historyEl.innerHTML = '';
        if (timeline.length === 0) {
            historyEl.innerHTML = `<div style="opacity:0.6;">${t('history_empty')}</div>`;
        } else {
            timeline.reverse().forEach(event => {
                const div = document.createElement('div');
                div.className = 'timeline-event';
                
                    if (event.type === 'entry') {
                        div.innerHTML = `
                            <span class="timeline-date">${event.date}</span>
                            <div class="timeline-desc">
                                <strong>${t('history_added_title')}</strong> 
                                ${t('history_added_at', { klp: event.klp })}
                            </div>
                        `;
                    } else {
                        div.innerHTML = `
                            <span class="timeline-date">${event.date}</span>
                            <div class="timeline-desc">
                                <strong>${t('history_adjusted_title')}</strong> 
                                ${event.oldKlp} ➔ ${event.newKlp}
                            </div>
                        `;
                    }
                historyEl.appendChild(div);
            });
        }
    }


    const victors = Object.entries(victorsData)
        .filter(([player, levelsArr]) => levelsArr.includes(levelName))
        .map(([player]) => player)
        .filter(player => player !== level.verifier);

    const victorsContainer = document.getElementById('victors-grid');
    if (victorsContainer) {
        let currentPage = 1;
        const totalPages = Math.ceil(victors.length / ITEMS_PER_PAGE);

        let pagination = victorsContainer.parentElement.querySelector('.victors-pagination');

        const renderPage = () => {
            victorsContainer.innerHTML = '';

            if (victors.length === 0) {
                victorsContainer.innerHTML = `<div class="empty-state">${t('no_victors_yet', { defaultValue: 'No victors yet.' })}</div>`;
                if (pagination) pagination.remove();
                return;
            }

            const pageItems = victors.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

            pageItems.forEach(player => {
                const cell = document.createElement('div');
                cell.className = 'grid-item clickable';
                cell.innerText = player;
                cell.onclick = () => window.location.href = `PlayerDetails.html?name=${encodeURIComponent(player)}`;
                victorsContainer.appendChild(cell);
            });

            if (totalPages > 1) {
                if (!pagination) {
                    pagination = document.createElement('div');
                    pagination.className = 'victors-pagination pagination';
                    victorsContainer.parentElement.appendChild(pagination);
                }
                pagination.innerHTML = '';
                for (let i = 1; i <= totalPages; i++) {
                    const btn = document.createElement('button');
                    btn.innerText = i;
                    if (i === currentPage) btn.disabled = true;
                    btn.onclick = () => { currentPage = i; renderPage(); };
                    pagination.appendChild(btn);
                }
            } else if (pagination) {
                pagination.remove();
                pagination = null;
            }
        };
        renderPage();
    }

    const setupLink = (id, rawValue, isCreator = false) => {
        const el = document.getElementById(id);
        if (!el || !rawValue) return;
        const names = rawValue.split(',').map(n => n.trim());
        el.innerHTML = '';
        names.forEach((name, i) => {
            const link = document.createElement('a');
            link.href = isCreator ? `CreatorDetails.html?name=${encodeURIComponent(name)}` : `PlayerDetails.html?name=${encodeURIComponent(name)}`;
            link.innerText = name;
            link.className = 'dynamic-link';
            el.appendChild(link);
            if (i < names.length - 1) el.appendChild(document.createTextNode(', '));
        });
    };

    setupLink('level-creator', level.creator, true);
    setupLink('level-verifier', level.verifier, false);

    const backBtn = document.getElementById('back-button');
    if (backBtn) {
        backBtn.onclick = (e) => {
            e.preventDefault();
            window.location.href = './MainList/';
        };
    }

    const modal = document.getElementById('badge-modal');
    window.addEventListener('click', (e) => {
        if (e.target === modal || e.target.id === 'close-modal') modal.classList.add('hidden');
    });
});