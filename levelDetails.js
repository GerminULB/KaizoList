import { fetchJson, loadHistory, rankByKLP, buildLevelTimeline, findLegacyTransition, LEGACY_RANK_CUTOFF, escapeHtml } from './js/utils.js';
import { BADGES, getSpecialBadgeByRank } from './js/badge.js';
import { renderBadgeDeck, handleBadgeSkew } from './js/badgeSystem.js';
import { t } from './js/i18n.js';

document.addEventListener('DOMContentLoaded', async () => {
    const ITEMS_PER_PAGE = 9;

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
            if (legacyDateRowEl && legacyDateEl) {
                findLegacyTransition(level.name, LEGACY_RANK_CUTOFF).then(({ date, approximate, everSeenInHistory }) => {
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

    // History loads in the background so it never holds up the rest of the page.
    void (async () => {
        const historyEl = document.getElementById('history');
        if (historyEl && level) {
            historyEl.innerHTML = `<div style="opacity:0.6;">${t('history_scanning')}</div>`;

            const history = await loadHistory();

            // Live levels.json is the newest "snapshot" so the timeline includes unsaved changes.
            const liveRanked = rankByKLP(levels.map(l => ({ ...l, badges: Array.isArray(l.badges) ? l.badges : undefined })));
            const frames = [
                ...history.map(s => ({ date: s.date, levels: s.levels })),
                { date: t('live_update'), levels: liveRanked, isLive: true }
            ];

            const timeline = buildLevelTimeline(frames, level.name).reverse(); // newest first
            const existingNames = new Set(levels.map(l => l.name));
            const HISTORY_PREVIEW = 8;
            const MAX_NAMES = 3;

            const nameList = (names) => {
                const shown = names.slice(0, MAX_NAMES).map(n => existingNames.has(n)
                    ? `<a class="change-link" href="LevelDetails.html?name=${encodeURIComponent(n)}">${escapeHtml(n)}</a>`
                    : `<em>${escapeHtml(n)}</em>`);
                const rest = names.length - shown.length;
                return shown.join(', ') + (rest > 0 ? ` ${t('history_more', { count: rest })}` : '');
            };

            const eventHtml = (event) => {
                const date = event.isLive ? t(event.type === 'entry' ? 'just_added' : 'live_update') : event.date;

            if (event.type === 'removed') {
                return `
                    <span class="timeline-date">${escapeHtml(date)}</span>
                    <div class="timeline-desc">
                        <strong>${t('changes_removed_from_list')}</strong>
                        ${t('changes_was_rank', { rank: event.rank })}
                    </div>`;
            }

                if (event.type === 'entry') {
                    return `
                        <span class="timeline-date">${escapeHtml(date)}</span>
                        <div class="timeline-desc">
                            <strong>${t('history_added_title')}</strong>
                            ${t('history_added_at', { klp: event.klp })}
                            <span class="timeline-rank">(#${event.rank})</span>
                        </div>`;
                }

                const { prev, curr, own, rankDelta, cause } = event;
                const parts = [];
                if (curr.klp !== prev.klp) parts.push(`${prev.klp} ➔ ${curr.klp} KLP`);
                if (rankDelta) {
                    parts.push(`<span class="timeline-delta">#${prev.rank} ➔ #${curr.rank} (${rankDelta > 0 ? '▲' : '▼'}${Math.abs(rankDelta)})</span>`);
                }
                if (own?.leftMain) parts.push(t('changes_left_main'));
                if (own?.enteredMain) parts.push(t('changes_back_to_main'));
                const bn = k => escapeHtml((BADGES[k]?.label || k).replace(/ Badge$/, ''));
                (own?.badgesAdded || []).forEach(k => parts.push(`+${bn(k)}`));
                (own?.badgesRemoved || []).forEach(k => parts.push(`-${bn(k)}`));

                // own change (KLP / badges / Main<->Legacy) -> "KLP Adjusted", otherwise it only got pushed around
                const ownChanged = curr.klp !== prev.klp || (own && (own.badgesAdded.length || own.badgesRemoved.length || own.leftMain || own.enteredMain));
                const title = ownChanged ? t('history_adjusted_title') : t('history_shifted_title');

                const why = [];
                if (cause) {
                    if (cause.added.length)   why.push(t('history_cause_added',   { names: nameList(cause.added) }));
                    if (cause.passed.length)  why.push(t('history_cause_passed',  { names: nameList(cause.passed) }));
                    if (cause.removed.length) why.push(t('history_cause_removed', { names: nameList(cause.removed) }));
                    if (cause.dropped.length) why.push(t('history_cause_dropped', { names: nameList(cause.dropped) }));
                }

                return `
                    <span class="timeline-date">${escapeHtml(date)}</span>
                    <div class="timeline-desc">
                        <strong>${title}</strong>
                        ${parts.join(' &middot; ')}
                        ${why.map(w => `<div><small>${w}</small></div>`).join('')}
                    </div>`;
            };

            const renderHistory = (showAll) => {
                historyEl.innerHTML = '';
                if (timeline.length === 0) {
                    historyEl.innerHTML = `<div style="opacity:0.6;">${t('history_empty')}</div>`;
                    return;
                }

                (showAll ? timeline : timeline.slice(0, HISTORY_PREVIEW)).forEach(event => {
                    const div = document.createElement('div');
                    const dir = event.type === 'change' && event.rankDelta ? (event.rankDelta > 0 ? ' is-up' : ' is-down') : '';
                    div.className = 'timeline-event board-9slice sm' + dir;
                    div.innerHTML = eventHtml(event);
                    historyEl.appendChild(div);
                });

                if (timeline.length > HISTORY_PREVIEW) {
                    const btn = document.createElement('button');
                    btn.className = 'hub-button history-toggle';
                    btn.style.marginTop = '6px';
                    btn.innerText = showAll ? t('history_show_less') : t('history_show_all', { count: timeline.length });
                    btn.onclick = () => renderHistory(!showAll);
                    historyEl.appendChild(btn);
                }
            };
            renderHistory(false);
        }
    })().catch(err => console.error('History failed to load:', err));

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
                cell.className = 'grid-item clickable board-9slice sm';
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