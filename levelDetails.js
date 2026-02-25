import { fetchJson, HISTORY_FILES } from './js/utils.js';
import { BADGES, getSpecialBadgeByRank } from './js/badge.js';
import { renderBadgeDeck, handleBadgeSkew } from './js/badgeSystem.js';
import { t } from './js/i18n.js';

document.addEventListener('DOMContentLoaded', async () => {
    const ITEMS_PER_PAGE = 9;

    const params = new URLSearchParams(window.location.search);
    const levelName = params.get('name');
    const from = params.get('from') || 'main';
    

    if (!levelName) return alert(t('error_no_level'));

    const [levels, challenges, victorsData] = await Promise.all([
        fetchJson('levels.json'),
        fetchJson('challenges.json'),
        fetchJson('victors.json')
    ]);

    const allLevels = [...levels, ...challenges];
    const level = allLevels.find(l => l.name === levelName);
    
    if (!level) return alert(t('error_level_not_found'));


    const safeSet = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    };

    safeSet('level-name', level.name);
    safeSet('level-id', level.id || 'N/A');
    safeSet('level-klp', level.klp || 0);

    let rankingPile = [];
    let listLabelKey = "";

    if (from === 'challenge') {
        rankingPile = [...challenges];
        listLabelKey = "label_challenge_list";
    } else {
        rankingPile = [...levels];
        listLabelKey = "label_main_list"; 
    }

    const sortedForRank = rankingPile.sort((a, b) => b.klp - a.klp);
    const rank = sortedForRank.findIndex(l => l.name === levelName) + 1;
    
    const rankEl = document.getElementById('level-rank');
    if (rankEl) {
        rankEl.innerHTML = `${rank} <span style="font-size: 0.7em; opacity: 0.6; margin-left: 5px;">${t(listLabelKey)}</span>`;
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
    
    const prefix = (from === 'challenge') ? t('prefix_challenge') : t('prefix_kaizo');
    document.title = t('level_page_title', { 
        prefix: prefix, 
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

        const renderPage = () => {
            victorsContainer.innerHTML = '';
            const pageItems = victors.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

            pageItems.forEach(player => {
                const cell = document.createElement('div');
                cell.className = 'grid-item clickable';
                cell.innerText = player;
                cell.onclick = () => window.location.href = `PlayerDetails.html?name=${encodeURIComponent(player)}`;
                victorsContainer.appendChild(cell);
            });

            let pagination = victorsContainer.parentElement.querySelector('.victors-pagination');
            if (!pagination) {
                pagination = document.createElement('div');
                pagination.className = 'victors-pagination panel-9slice';
                victorsContainer.parentElement.appendChild(pagination);
            }
            pagination.innerHTML = '';
            if (totalPages > 1) {
                for (let i = 1; i <= totalPages; i++) {
                    const btn = document.createElement('button');
                    btn.innerText = i;
                    if (i === currentPage) btn.disabled = true;
                    btn.onclick = () => { currentPage = i; renderPage(); };
                    pagination.appendChild(btn);
                }
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
            window.location.href = (from === 'challenge') ? './ChallengeList/' : './MainList/';
        };
    }

    const modal = document.getElementById('badge-modal');
    window.addEventListener('click', (e) => {
        if (e.target === modal || e.target.id === 'close-modal') modal.classList.add('hidden');
    });
});