import { parseUlb } from './ulb.js';
import { loadAssets, readArea, findMissing, renderToCanvas, drawLinks, drawBackground, loadBackground, clampCamera, minZoom, drawBorder, thumbnailCells, backgroundColor, TILE } from './renderer.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const ctx = canvas.getContext('2d');

const state = {
    assets: null,
    level: null,
    areas: null,
    which: 'main',
    zoom: 3,
    camX: 0, camY: 0,
};

const area = () => state.areas && state.areas[state.which];

function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    draw();
}

const CHUNK = 25;
const CHUNK_BUDGET = 24e6;
let chunks = new Map();
const clearChunks = () => { chunks = new Map(); };

function chunkScale() {
    const z = state.zoom * (window.devicePixelRatio || 1);
    return z <= 1 ? 1 : z <= 2 ? 2 : 4;
}

function getChunk(cx, cy, scale) {
    const id = scale + ':' + cx + ',' + cy;
    let c = chunks.get(id);
    if (c) { chunks.delete(id); chunks.set(id, c); return c; }
    const cells = { minX: cx * CHUNK, maxX: cx * CHUNK + CHUNK - 1, minY: cy * CHUNK, maxY: cy * CHUNK + CHUNK - 1 };
    c = renderToCanvas(state.assets, area(), cells, scale, {
        background: 'none',
        links: false,
        border: false,
        unknown: $('showUnknown').checked ? 'mark' : 'skip',
        hideBack: $('layoutMode').checked,
        hideDeco: $('layoutMode').checked,
    }).canvas;
    chunks.set(id, c);
    return c;
}

function trimChunks(keep) {
    let total = 0;
    for (const c of chunks.values()) total += c.width * c.height;
    for (const [id, c] of chunks) {
        if (total <= CHUNK_BUDGET) break;
        if (keep.has(id)) continue;
        chunks.delete(id);
        total -= c.width * c.height;
    }
}

function draw() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = area() && state.assets ? backgroundColor(state.assets, area()) : '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!area() || !state.assets) return;

    clampCamera(state, canvas.clientWidth / state.zoom, canvas.clientHeight / state.zoom);
    const z = state.zoom * dpr;
    ctx.setTransform(z, 0, 0, z, Math.round(-state.camX * z), Math.round(-state.camY * z));
    const scale = chunkScale();
    ctx.imageSmoothingEnabled = z < scale;
    if ($('showArt').checked) drawBackground(ctx, state.assets, area().background);

    const b = area().bounds;
    const left = state.camX, right = state.camX + canvas.width / z;
    const top = state.camY, bottom = state.camY + canvas.height / z;
    const x0 = Math.max(Math.floor(left / TILE), b.minX - 8), x1 = Math.min(Math.floor(right / TILE), b.maxX + 8);
    const y1 = Math.min(Math.floor(-top / TILE) + 1, b.maxY + 8), y0 = Math.max(Math.floor(-bottom / TILE), b.minY - 8);
    const used = new Set();
    for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
        for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) {
            ctx.drawImage(getChunk(cx, cy, scale), cx * CHUNK * TILE, -(cy * CHUNK + CHUNK - 1) * TILE, CHUNK * TILE, CHUNK * TILE);
            used.add(scale + ':' + cx + ',' + cy);
        }
    }
    trimChunks(used);
    ctx.imageSmoothingEnabled = false;
    drawBorder(ctx);
    if ($('showLinks').checked) drawLinks(ctx, state.assets, area().items, { left, top, right, bottom });
}

function fit() {
    const b = area().bounds;
    const w = (b.maxX - b.minX + 3) * TILE, h = (b.maxY - b.minY + 3) * TILE;
    const z = Math.min(canvas.clientWidth / w, canvas.clientHeight / h);
    state.zoom = Math.max(minZoom(canvas.clientWidth, canvas.clientHeight), Math.min(6, z >= 1 ? Math.floor(z) : z));
    state.camX = (b.minX - 1) * TILE - (canvas.clientWidth / state.zoom - w) / 2;
    state.camY = -(b.maxY + 1) * TILE - (canvas.clientHeight / state.zoom - h) / 2;
    draw();
}

function goToStart() {
    const a = area();
    state.zoom = 3;
    state.camX = (a.start.x ?? a.bounds.minX) * TILE - canvas.clientWidth / state.zoom / 4;
    state.camY = -(a.start.y ?? a.bounds.maxY) * TILE - canvas.clientHeight / state.zoom / 2;
    draw();
}

function zoomAt(factor, sx, sy) {
    const before = state.zoom;
    state.zoom = Math.max(minZoom(canvas.clientWidth, canvas.clientHeight), Math.min(12, state.zoom * factor));
    state.camX += sx / before - sx / state.zoom;
    state.camY += sy / before - sy / state.zoom;
    draw();
}

async function openText(text, fileName) {
    try {
        const { level, hashOk } = await parseUlb(text);
        state.level = level;
        const z = (id) => (state.assets.map.items[id] || {}).z || 0;
        state.areas = { main: readArea(level.mainData, { z }), sub: readArea(level.subData || {}, { z }) };
        state.which = 'main';
        clearChunks();
        await Promise.all([loadBackground(state.assets, state.areas.main.background), loadBackground(state.assets, state.areas.sub.background)]);
        $('subBtn').disabled = state.areas.sub.items.length === 0;
        $('title').textContent = `${level.levelName || fileName || 'Untitled'} — by ${level.creator || 'unknown'}`;
        $('hash').textContent = hashOk === null ? '' : hashOk ? 'file check OK' : 'file check FAILED (edited or corrupted)';
        document.body.classList.add('loaded');
        resize();
        goToStart();
        report();
    } catch (err) {
        $('title').textContent = 'Could not read that file: ' + err.message;
        console.error(err);
    }
}

function report() {
    const a = area();
    $('stats').textContent = `${a.blockCount} blocks, ${a.objectCount} objects`;
    const list = [...findMissing(state.assets, a.items)].sort((p, q) => q[1] - p[1]).map(([name, n]) => `${name} (×${n})`);
    $('missing').textContent = list.length ? `No sprite yet for: ${list.join(', ')}` : 'Every ID in this level has a sprite.';
    $('missing').style.color = list.length ? '' : '#8a8';
}

function download(canvasToSave, name) {
    canvasToSave.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
}

const safeName = () => (state.level.levelName || 'level').replace(/[^\w-]+/g, '_');

$('saveThumb').onclick = () => {
    const { canvas: c } = renderToCanvas(state.assets, area(), thumbnailCells(area()), 1, { unknown: 'skip', links: $('showLinks').checked, hideBack: $('layoutMode').checked, hideDeco: $('layoutMode').checked, background: $('showArt').checked ? 'art' : backgroundColor(state.assets, area()) });
    download(c, safeName() + '_thumb.png');
};
$('saveFull').onclick = () => {
    const b = area().bounds;
    const cells = { minX: b.minX - 1, maxX: b.maxX + 1, minY: b.minY - 1, maxY: b.maxY + 1 };
    const { canvas: c } = renderToCanvas(state.assets, area(), cells, 1, { unknown: 'skip', links: $('showLinks').checked, hideBack: $('layoutMode').checked, hideDeco: $('layoutMode').checked, background: $('showArt').checked ? 'art' : backgroundColor(state.assets, area()) });
    download(c, safeName() + '_full.png');
};

$('file').onchange = async (e) => { const f = e.target.files[0]; if (f) openText(await f.text(), f.name); };
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) openText(await f.text(), f.name);
});

$('mainBtn').onclick = () => { state.which = 'main'; clearChunks(); goToStart(); report(); };
$('subBtn').onclick = () => { state.which = 'sub'; clearChunks(); fit(); report(); };
$('fitBtn').onclick = fit;
$('startBtn').onclick = goToStart;
$('zoomIn').onclick = () => zoomAt(1.5, canvas.clientWidth / 2, canvas.clientHeight / 2);
$('zoomOut').onclick = () => zoomAt(1 / 1.5, canvas.clientWidth / 2, canvas.clientHeight / 2);
$('showUnknown').onchange = () => { clearChunks(); draw(); };
$('showArt').onchange = draw;
$('showLinks').onchange = draw;
$('layoutMode').onchange = () => { clearChunks(); draw(); };

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.offsetX, e.offsetY);
}, { passive: false });

let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    state.camX -= (e.clientX - drag.x) / state.zoom;
    state.camY -= (e.clientY - drag.y) / state.zoom;
    drag = { x: e.clientX, y: e.clientY };
    draw();
});
canvas.addEventListener('pointerup', () => { drag = null; });
window.addEventListener('resize', resize);

state.assets = await loadAssets();
$('title').textContent = 'Drop a .ulb file here, or use the button.';

const fileParam = new URLSearchParams(location.search).get('file');
if (fileParam) {
    const res = await fetch(fileParam);
    if (res.ok) openText(await res.text(), fileParam.split('/').pop());
    else $('title').textContent = 'Could not load ' + fileParam;
}

window.ulbViewer = { state, renderToCanvas, thumbnailCells, readArea, loadBackground };
