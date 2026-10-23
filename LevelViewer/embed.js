import { parseUlb } from './ulb.js';
import { loadAssets, readArea, renderToCanvas, drawLinks, drawBackground, loadBackground, backgroundColor, clampCamera, minZoom, drawBorder, TILE } from './renderer.js';

const DEFAULT_LABELS = {
    main: 'Main', sub: 'Sub', start: 'Start', fit: 'Whole level',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', fullscreen: 'Full screen', doorLines: 'Door lines',
    layoutMode: 'Layout mode',
    loading: 'Loading level…', hint: 'Drag to look around, scroll or pinch to zoom',
};

let assetsPromise = null;

export async function mountViewer(container, url, options = {}) {
    const L = { ...DEFAULT_LABELS, ...(options.labels || {}) };

    let level;
    try {
        assetsPromise = assetsPromise || loadAssets();
        const res = await fetch(url);
        if (!res.ok) return false;
        level = (await parseUlb(await res.text())).level;
    } catch (err) {
        console.warn('Level viewer: could not load', url, err);
        return false;
    }
    const assets = await assetsPromise;
    const z = (id) => (assets.map.items[id] || {}).z || 0;
    const areas = { main: readArea(level.mainData, { z }), sub: readArea(level.subData || {}, { z }) };
    await Promise.all([loadBackground(assets, areas.main.background), loadBackground(assets, areas.sub.background)]);

    container.classList.add('ulb-viewer');
    container.innerHTML = `
        <div class="ulb-viewer-bar">
            <button type="button" data-act="main" class="ulb-on">${L.main}</button>
            <button type="button" data-act="sub">${L.sub}</button>
            <span class="ulb-viewer-gap"></span>
            <button type="button" data-act="start">${L.start}</button>
            <button type="button" data-act="fit">${L.fit}</button>
            <button type="button" data-act="out" title="${L.zoomOut}" aria-label="${L.zoomOut}">-</button>
            <button type="button" data-act="in" title="${L.zoomIn}" aria-label="${L.zoomIn}">+</button>
            <button type="button" data-act="links" class="ulb-on">${L.doorLines}</button>
            <button type="button" data-act="bare">${L.layoutMode}</button>
            <button type="button" data-act="full">${L.fullscreen}</button>
        </div>
        <canvas class="ulb-viewer-canvas"></canvas>
        <div class="ulb-viewer-hint">${L.hint}</div>`;
    const canvas = container.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const button = (act) => container.querySelector(`[data-act="${act}"]`);
    if (!areas.sub.items.length) button('sub').remove();

    const state = { which: 'main', zoom: 3, camX: 0, camY: 0, links: true, bare: false };
    const area = () => areas[state.which];

    const CHUNK = 25, BUDGET = 16e6;
    let chunks = new Map();
    const chunkScale = () => {
        const s = state.zoom * (window.devicePixelRatio || 1);
        return s <= 1 ? 1 : s <= 2 ? 2 : 4;
    };
    function getChunk(cx, cy, scale) {
        const id = state.which + ':' + scale + ':' + cx + ',' + cy;
        let c = chunks.get(id);
        if (c) { chunks.delete(id); chunks.set(id, c); return c; }
        const cells = { minX: cx * CHUNK, maxX: cx * CHUNK + CHUNK - 1, minY: cy * CHUNK, maxY: cy * CHUNK + CHUNK - 1 };
        c = renderToCanvas(assets, area(), cells, scale, { background: 'none', links: false, border: false, unknown: 'skip', hideBack: state.bare, hideDeco: state.bare }).canvas;
        chunks.set(id, c);
        return c;
    }
    function trim(keep) {
        let total = 0;
        for (const c of chunks.values()) total += c.width * c.height;
        for (const [id, c] of chunks) {
            if (total <= BUDGET) break;
            if (keep.has(id)) continue;
            chunks.delete(id);
            total -= c.width * c.height;
        }
    }

    let queued = false;
    const draw = () => { if (!queued) { queued = true; requestAnimationFrame(drawNow); } };
    function drawNow() {
        queued = false;
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = backgroundColor(assets, area());
        ctx.fillRect(0, 0, w, h);

        clampCamera(state, canvas.clientWidth / state.zoom, canvas.clientHeight / state.zoom);
        const zz = state.zoom * dpr, scale = chunkScale();
        ctx.setTransform(zz, 0, 0, zz, Math.round(-state.camX * zz), Math.round(-state.camY * zz));
        ctx.imageSmoothingEnabled = zz < scale;
        drawBackground(ctx, assets, area().background);

        const b = area().bounds;
        const left = state.camX, right = state.camX + w / zz, top = state.camY, bottom = state.camY + h / zz;
        const x0 = Math.max(Math.floor(left / TILE), b.minX - 8), x1 = Math.min(Math.floor(right / TILE), b.maxX + 8);
        const y1 = Math.min(Math.floor(-top / TILE) + 1, b.maxY + 8), y0 = Math.max(Math.floor(-bottom / TILE), b.minY - 8);
        const used = new Set();
        for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
            for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) {
                ctx.drawImage(getChunk(cx, cy, scale), cx * CHUNK * TILE, -(cy * CHUNK + CHUNK - 1) * TILE, CHUNK * TILE, CHUNK * TILE);
                used.add(state.which + ':' + scale + ':' + cx + ',' + cy);
            }
        }
        trim(used);
        ctx.imageSmoothingEnabled = false;
        drawBorder(ctx);
        if (state.links) drawLinks(ctx, assets, area().items, { left, top, right, bottom });
    }

    const clampZoom = (v) => Math.max(minZoom(canvas.clientWidth, canvas.clientHeight), Math.min(12, v));
    function goToStart() {
        const a = area();
        state.zoom = Math.max(1, Math.min(3, Math.floor(canvas.clientWidth / (24 * TILE)) || 1));
        state.camX = (a.start.x ?? a.bounds.minX) * TILE - canvas.clientWidth / state.zoom / 4;
        state.camY = -(a.start.y ?? a.bounds.maxY) * TILE - canvas.clientHeight / state.zoom / 2;
        draw();
    }
    function fit() {
        const b = area().bounds;
        const w = (b.maxX - b.minX + 3) * TILE, h = (b.maxY - b.minY + 3) * TILE;
        const f = Math.min(canvas.clientWidth / w, canvas.clientHeight / h);
        state.zoom = clampZoom(f >= 1 ? Math.floor(f) : f);
        state.camX = (b.minX - 1) * TILE - (canvas.clientWidth / state.zoom - w) / 2;
        state.camY = -(b.maxY + 1) * TILE - (canvas.clientHeight / state.zoom - h) / 2;
        draw();
    }
    function zoomAt(factor, sx, sy) {
        const before = state.zoom;
        state.zoom = clampZoom(state.zoom * factor);
        state.camX += sx / before - sx / state.zoom;
        state.camY += sy / before - sy / state.zoom;
        draw();
    }

    container.querySelector('.ulb-viewer-bar').addEventListener('click', (e) => {
        const act = e.target.closest('button')?.dataset.act;
        if (!act) return;
        const mid = [canvas.clientWidth / 2, canvas.clientHeight / 2];
        if (act === 'main' || act === 'sub') {
            state.which = act;
            button('main').classList.toggle('ulb-on', act === 'main');
            button('sub')?.classList.toggle('ulb-on', act === 'sub');
            act === 'main' ? goToStart() : fit();
        }
        if (act === 'start') goToStart();
        if (act === 'fit') fit();
        if (act === 'in') zoomAt(1.5, ...mid);
        if (act === 'out') zoomAt(1 / 1.5, ...mid);
        if (act === 'bare') {
            state.bare = !state.bare;
            button('bare').classList.toggle('ulb-on', state.bare);
            chunks = new Map();
            draw();
        }
        if (act === 'links') { state.links = !state.links; button('links').classList.toggle('ulb-on', state.links); draw(); }
        if (act === 'full') {
            if (document.fullscreenElement) document.exitFullscreen();
            else container.requestFullscreen?.();
        }
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.offsetX, e.offsetY);
    }, { passive: false });

    const pointers = new Map();
    let pinch = null;
    canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
        container.classList.add('ulb-used');
    });
    canvas.addEventListener('pointermove', (e) => {
        const p = pointers.get(e.pointerId);
        if (!p) return;
        const now = { x: e.offsetX, y: e.offsetY };
        if (pointers.size === 1) {
            state.camX -= (now.x - p.x) / state.zoom;
            state.camY -= (now.y - p.y) / state.zoom;
            draw();
        } else if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            const other = a === p ? b : a;
            const dist = Math.hypot(now.x - other.x, now.y - other.y);
            if (pinch) zoomAt(dist / pinch, (now.x + other.x) / 2, (now.y + other.y) / 2);
            pinch = dist;
        }
        pointers.set(e.pointerId, now);
    });
    const lift = (e) => { pointers.delete(e.pointerId); pinch = null; };
    canvas.addEventListener('pointerup', lift);
    canvas.addEventListener('pointercancel', lift);

    let placed = false;
    new ResizeObserver(() => {
        if (!placed && canvas.clientWidth > 0) { placed = true; goToStart(); }
        else draw();
    }).observe(canvas);
    document.addEventListener('fullscreenchange', () => setTimeout(goToStart, 50));
    return true;
}
