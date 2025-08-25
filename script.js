function highlight(text, query) {
if (!query) return text;
const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const re = new RegExp(`(${esc})`, 'ig');
return text.replace(re, '<mark class="highlight">$1</mark>');
}


function rankClass(rank) {
if (rank === 1) return 'gold';
if (rank === 2) return 'silver';
if (rank === 3) return 'bronze';
return 'default';
}


async function loadLevels() {
const res = await fetch('levels.json');
const levels = await res.json();


const total = levels.reduce((s, l) => s + l.klp, 0);
document.getElementById('total-klp').textContent = `Total: ${total.toLocaleString()} KLP`;


const creatorFilter = document.getElementById('creator-filter');
const verifierFilter = document.getElementById('verifier-filter');
const searchInput = document.getElementById('search');
const sortSelect = document.getElementById('sort-filter');
const list = document.getElementById('level-list');
const empty = document.getElementById('empty');


// Populate filters
const creators = [...new Set(levels.flatMap(l => l.creator.split(',').map(s => s.trim())))].sort();
const verifiers = [...new Set(levels.map(l => l.verifier))].sort();
creatorFilter.innerHT
