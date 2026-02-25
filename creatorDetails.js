import { fetchJson } from './js/utils.js';
import { t } from './js/i18n.js';

(async () => {
    const ITEMS_PER_PAGE = 9;
    const params = new URLSearchParams(window.location.search);
    const creatorName = params.get('name');
    
    if (!creatorName) return alert(t('error_no_creator'));

    const nameEl = document.getElementById('creator-name');
    if (nameEl) nameEl.innerText = creatorName;

    const [levels, challenges] = await Promise.all([
        fetchJson('levels.json'),
        fetchJson('challenges.json')
    ]);

    const allLevels = [...levels, ...challenges];

    const portfolio = allLevels.filter(lvl => {
        if (!lvl.creator) return false;
        const creators = lvl.creator.split(',').map(c => c.trim());
        return creators.includes(creatorName);
    });

    if (portfolio.length === 0) {
        console.error(t('error_no_levels_found'), creatorName);
        return;
    }

    const totalKLP = portfolio.reduce((sum, lvl) => sum + (lvl.klp || 0), 0);
    const avgKLP = totalKLP / portfolio.length;

    document.getElementById('total-klp').innerText = totalKLP.toLocaleString();
    document.getElementById('level-count').innerText = portfolio.length;
    document.getElementById('avg-klp').innerText = avgKLP.toFixed(0);

    document.title = t('builder_title', { name: creatorName });

    const container = document.getElementById('creator-portfolio');
    const pagination = document.querySelector('.pagination');
    
    let currentPage = 1;
    const totalPages = Math.ceil(portfolio.length / ITEMS_PER_PAGE);

    function renderPage() {
        if (!container) return;
        container.innerHTML = '';
        
        const pageItems = portfolio
            .sort((a, b) => b.klp - a.klp)
            .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

        pageItems.forEach(item => {
            const cell = document.createElement('div');
            cell.className = 'grid-item clickable'; 
            
            cell.innerHTML = `
                <div class="lvl-name">${item.name}</div>
                <div class="lvl-klp" style="font-size: 0.8em; opacity: 0.8;">${item.klp} KLP</div>
            `;
            cell.onclick = () => {
                window.location.href = `LevelDetails.html?name=${encodeURIComponent(item.name)}`;
            };
            container.appendChild(cell);
        });

        if (pagination) {
            pagination.innerHTML = '';
            if (totalPages > 1) {
                for (let i = 1; i <= totalPages; i++) {
                    const btn = document.createElement('button');
                    btn.innerText = i;
                    if (i === currentPage) btn.disabled = true;
                    btn.onclick = () => { 
                        currentPage = i; 
                        renderPage(); 
                        window.scrollTo(0, 0);
                    };
                    pagination.appendChild(btn);
                }
            }
        }
    }

    renderPage();
})();