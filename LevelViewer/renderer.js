export const TILE = 16;

export async function loadAssets(base = new URL('.', import.meta.url)) {
    const getJson = async (path) => (await fetch(new URL(path, base))).json();
    const [sheet, map, colors, backgrounds] = await Promise.all([
        getJson('data/sprites.json'), getJson('data/blockmap.json'), getJson('data/colors.json'),
        getJson('data/backgrounds.json'),
    ]);

    const atlases = await Promise.all(sheet.atlases.map(file => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not load atlas ' + file));
        img.src = new URL('atlas/' + file, base);
    })));

    return { sprites: sheet.sprites, atlases, map, colors, backgrounds, base, backgroundImages: new Map(),
             colourable: new Set(colors.colorable), cache: new Map() };
}

function getSprite(assets, key, rot) {
    const id = key + '|' + rot;
    if (assets.cache.has(id)) return assets.cache.get(id);

    const rect = assets.sprites[key];
    if (!rect) { assets.cache.set(id, null); return null; }
    const [atlasIndex, sx, sy, w, h] = rect;

    const turned = rot % 2 === 1;
    const canvas = document.createElement('canvas');
    canvas.width = turned ? h : w;
    canvas.height = turned ? w : h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rot * Math.PI / 2);
    ctx.drawImage(assets.atlases[atlasIndex], sx, sy, w, h, -w / 2, -h / 2, w, h);

    canvas.res = rect[5] || 1;
    assets.cache.set(id, canvas);
    return canvas;
}

function put(ctx, sprite, x, y) {
    const res = sprite.res || 1;
    if (res === 1) { ctx.drawImage(sprite, Math.round(x), Math.round(y)); return; }
    ctx.drawImage(sprite, x, y, sprite.width / res, sprite.height / res);
}

function tintFor(assets, item, background) {
    const colourable = item.color && assets.colourable.has(item.id);
    const c = colourable ? assets.colors.colors[item.color] : null;
    const b = item.back ? (assets.colors.backTintByBackground[background] || assets.colors.backTint) : null;
    if (!c && !b) return null;
    const mul = (i) => Math.round((c ? c[i] : 255) * (b ? b[i] : 255) / 255);
    return [mul(0), mul(1), mul(2)];
}

function getTintedSprite(assets, key, rot, tint) {
    const base = getSprite(assets, key, rot);
    if (!base || !tint) return base;
    const id = key + '|' + rot + '|' + tint.join(',');
    if (assets.cache.has(id)) return assets.cache.get(id);

    const canvas = document.createElement('canvas');
    canvas.width = base.width;
    canvas.height = base.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(base, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${tint[0]}, ${tint[1]}, ${tint[2]})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(base, 0, 0);

    canvas.res = base.res;
    assets.cache.set(id, canvas);
    return canvas;
}

function lookup(assets, kind, id, variant) {
    let table;
    if (kind === 'liquid') {
        table = assets.map.liquid[id];
        if (!table) return undefined;
    } else {
        const item = assets.map.items[id];
        if (!item) return undefined;
        if (kind === 'block' && item.kind === 'object') return null;
        table = item.v;
    }
    const hit = table[variant] || table['15'] || table['0'] || Object.values(table)[0];
    return { key: hit[0], rot: hit[1], dx: hit[2], dy: hit[3] };
}

export function readArea(area, options = {}) {
    const back = [], front = [], liquids = [], overlays = [], objects = [];

    const liquidAt = new Map();
    for (const b of area.blocks || []) {
        if (b[8] !== -1) liquidAt.set(b[12] + ',' + b[13], b[8]);
    }
    for (const b of area.blocks || []) {
        const x = b[12], y = b[13];
        if (b[3] !== -1) back.push({ kind: 'block', id: b[3], variant: b[4], color: b[5], back: true, x, y });
        if (b[0] !== -1) front.push({ kind: 'block', id: b[0], variant: b[1], color: b[2], x, y });
        if (b[6] !== -1) overlays.push({ kind: 'overlay', id: b[6], variant: b[7], x, y });
        if (b[8] !== -1) {
            const covered = liquidAt.get(x + ',' + (y + 1)) === b[8];
            liquids.push({ kind: 'liquid', id: b[8], variant: covered ? 1 : 0, x, y });
        }
    }

    for (const p of area.placements || []) {
        const inner = p.placement.inner;
        if (inner && p.placement.type === 109) objects.push({ kind: 'object', id: inner.type, variant: inner.rotation, color: inner.color, x: p.x, y: p.y });
        const q = p.placement;
        const other = (q.otherX || q.otherY) ? { x: q.otherX, y: q.otherY } : null;
        const mods = (q.Modifiers || []).map(m => ({ id: m.type, variant: m.rotation, color: m.color }));
        objects.push({ kind: 'object', id: q.type, variant: q.rotation, color: q.color, other, mods, x: p.x, y: p.y });
    }

    for (const [where, p] of Object.entries(area.platforms || {})) {
        const [x1, y1, x2, y2] = where.split(',').map(Number);
        objects.push({ kind: 'span', id: p.type, variant: p.rotation, color: p.color, x: x1, y: y1, x2, y2 });
    }

    const zOf = options.z || (() => 0);
    objects.forEach((o, i) => { o.fileOrder = i; });
    objects.sort((a, b) => (zOf(a.id) - zOf(b.id)) || (b.fileOrder - a.fileOrder));
    const behind = objects.filter(o => zOf(o.id) < 0), above = objects.filter(o => zOf(o.id) >= 0);
    const items = [...back, ...behind, ...front, ...liquids, ...overlays, ...above];
    const blockCount = back.length + front.length;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const it of items) {
        minX = Math.min(minX, it.x); maxX = Math.max(maxX, it.x);
        minY = Math.min(minY, it.y); maxY = Math.max(maxY, it.y);
        if (it.kind === 'span') {
            minX = Math.min(minX, it.x2); maxX = Math.max(maxX, it.x2);
            minY = Math.min(minY, it.y2); maxY = Math.max(maxY, it.y2);
        }
    }
    if (!items.length) { minX = maxX = area.startX || 0; minY = maxY = area.startY || 0; }

    return {
        items, blockCount, objectCount: objects.length,
        bounds: { minX, maxX, minY, maxY },
        start: { x: area.startX, y: area.startY },
        background: area.background,
    };
}

function rotateExact(ctx, angle) {
    const quarter = Math.round(angle / (Math.PI / 2));
    if (Math.abs(angle - quarter * Math.PI / 2) < 1e-6) {
        const [c, s] = [[1, 0], [0, 1], [-1, 0], [0, -1]][((quarter % 4) + 4) % 4];
        ctx.transform(c, s, -s, c, 0, 0);
    } else {
        ctx.rotate(angle);
    }
}

const centre = (x, y) => [x * TILE + TILE / 2, -y * TILE + TILE / 2];

function drawSpan(ctx, assets, it) {
    const item = assets.map.items[it.id];
    const span = item && item.span;
    if (!span) return false;

    let a = { x: it.x, y: it.y }, b = { x: it.x2, y: it.y2 };
    if (span.ordered && (b.x < a.x || (b.x === a.x && b.y < a.y))) [a, b] = [b, a];
    const [ax, ay] = centre(a.x, a.y), [bx, by] = centre(b.x, b.y);
    const length = Math.hypot(bx - ax, by - ay);
    const angle = Math.atan2(by - ay, bx - ax) + Math.PI / 2;

    const mid = span.m && getSprite(assets, span.m, 0);
    const from = span.stable ? 0 : TILE / 2, to = span.stable ? length : length - TILE / 2;
    if (mid && to > from) {
        ctx.save();
        ctx.translate(ax, ay);
        rotateExact(ctx, angle);
        if (span.tiled) {
            for (let done = from; done < to; done += mid.height) {
                const h = Math.min(mid.height, to - done);
                ctx.drawImage(mid, 0, mid.height - h, mid.width, h, -mid.width / 2, -done - h, mid.width, h);
            }
        } else {
            ctx.drawImage(mid, -mid.width / 2, -to, mid.width, to - from);
        }
        ctx.restore();
    }
    for (const [end, px, py, turn] of [[span.l, ax, ay, 0], [span.r, bx, by, Math.PI]]) {
        const sprite = end && getSprite(assets, end[0], 0);
        if (!sprite) continue;
        ctx.save();
        ctx.translate(px, py);
        if (!span.stable) rotateExact(ctx, angle + turn);
        ctx.drawImage(sprite, end[1] - TILE / 2, end[2] - TILE / 2);
        ctx.restore();
    }
    return true;
}

function drawLink(ctx, assets, it) {
    const item = assets.map.items[it.id];
    if (!item || !item.beam) return;
    const [ax, ay] = centre(it.x, it.y), [bx, by] = centre(it.other.x, it.other.y);
    if (ax === bx && ay === by) return;
    const zoom = Math.hypot(ctx.getTransform().a, ctx.getTransform().b) || 1;
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(0.75, 1 / zoom);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();
}

const ATTACH_SCALE = 0.8;
function drawAttachment(ctx, assets, host, m) {
    const entry = assets.map.items[m.id], mod = entry && entry.mod;
    if (!mod) return;
    const tint = m.color && assets.colourable.has(m.id) ? assets.colors.colors[m.color] : null;
    const sprite = getTintedSprite(assets, mod[0], 0, tint);
    if (!sprite) return;
    ctx.save();
    ctx.translate(host.x * TILE + TILE / 2, -host.y * TILE + TILE / 2);
    if (m.variant) rotateExact(ctx, m.variant * Math.PI / 2);
    ctx.scale(ATTACH_SCALE, ATTACH_SCALE);
    put(ctx, sprite, mod[1] - TILE / 2, mod[2] - TILE / 2);
    ctx.restore();
}

export function drawItems(ctx, assets, items, options = {}) {
    const vis = options.visible;
    const unknownStyle = options.unknown || 'mark';
    const missing = new Map();
    ctx.imageSmoothingEnabled = false;

    const onScreen = (x1, y1, x2, y2) => !vis || !(
        Math.max(x1, x2) * TILE < vis.left - 96 || Math.min(x1, x2) * TILE > vis.right + 96 ||
        -Math.min(y1, y2) * TILE < vis.top - 96 || -Math.max(y1, y2) * TILE > vis.bottom + 96);

    const markUnknown = (it) => {
        const name = it.kind + ' ' + it.id;
        missing.set(name, (missing.get(name) || 0) + 1);
        if (unknownStyle !== 'mark') return;
        const px = it.x * TILE, py = -it.y * TILE;
        ctx.fillStyle = 'rgba(255, 0, 200, 0.35)';
        ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
        ctx.strokeStyle = 'rgba(255, 0, 200, 0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 1.5, py + 1.5, TILE - 3, TILE - 3);
    };

    for (const it of items) {
        if (options.start === false && it.kind === 'block' && it.id === 125) continue;
        if (options.hideBack && it.back) continue;
        if (options.hideDeco && it.kind === 'block' && !it.back && assets.map.items[it.id]?.deco) continue;
        if (it.kind === 'span') {
            if (!onScreen(it.x, it.y, it.x2, it.y2)) continue;
            if (!drawSpan(ctx, assets, it)) {
                const mid = { ...it, kind: 'object', x: (it.x + it.x2) / 2, y: (it.y + it.y2) / 2 };
                const found = lookup(assets, 'object', it.id, it.variant);
                const sprite = found && getSprite(assets, found.key, found.rot);
                if (sprite) put(ctx, sprite, mid.x * TILE + found.dx, -mid.y * TILE + found.dy);
                else if (found !== null) markUnknown(it);
            }
            continue;
        }
        if (!onScreen(it.x, it.y, it.x, it.y)) continue;

        const found = lookup(assets, it.kind, it.id, it.variant);
        if (found === null) continue;
        const sprite = found && getTintedSprite(assets, found.key, found.rot, tintFor(assets, it, options.background));
        if (!sprite) { markUnknown(it); continue; }
        put(ctx, sprite, it.x * TILE + found.dx, -it.y * TILE + found.dy);
        for (const m of it.mods || []) drawAttachment(ctx, assets, it, m);
    }
    if (options.border !== false) drawBorder(ctx);
    if (options.links !== false) drawLinks(ctx, assets, items, vis);
    return missing;
}

const LEVEL = 250 * TILE;
export function drawBorder(ctx) {
    const top = TILE - LEVEL;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, top, 2, LEVEL);
    ctx.fillRect(LEVEL - 2, top, 2, LEVEL);
    ctx.fillRect(0, top, LEVEL, 2);
    ctx.fillRect(0, top + LEVEL - 2, LEVEL, 2);
}

export function clampCamera(cam, viewW, viewH, margin = 2 * TILE) {
    const clamp = (v, lo, size, view) => size + 2 * margin <= view
        ? lo + size / 2 - view / 2
        : Math.max(lo - margin, Math.min(v, lo + size + margin - view));
    cam.camX = clamp(cam.camX, 0, LEVEL, viewW);
    cam.camY = clamp(cam.camY, TILE - LEVEL, LEVEL, viewH);
}

export function minZoom(viewW, viewH, margin = 2 * TILE) {
    return Math.min(viewW, viewH) / (LEVEL + 2 * margin) || 0.1;
}

export function drawLinks(ctx, assets, items, view) {
    for (const it of items) {
        if (!it.other) continue;
        const px = it.x * TILE, py = -it.y * TILE;
        if (view && (px + TILE <= view.left || px >= view.right || py + TILE <= view.top || py >= view.bottom)) continue;
        drawLink(ctx, assets, it);
    }
}

export function backgroundColor(assets, area) {
    const bg = assets.backgrounds[area.background];
    return bg ? `rgb(${bg.color[0]}, ${bg.color[1]}, ${bg.color[2]})` : '#000';
}

export async function loadBackground(assets, index) {
    const bg = assets.backgrounds[index];
    if (!bg) return;
    await Promise.all(bg.layers.map(layer => {
        if (assets.backgroundImages.has(layer.image + (layer.cutout ? '|cut' : ''))) return null;
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const c = canvas.getContext('2d');
                c.drawImage(img, 0, 0);
                if (layer.cutout) {
                    const data = c.getImageData(0, 0, canvas.width, canvas.height);
                    for (let i = 3; i < data.data.length; i += 4) data.data[i] = data.data[i] > 127 ? 255 : 0;
                    c.putImageData(data, 0, 0);
                }
                assets.backgroundImages.set(layer.image + (layer.cutout ? '|cut' : ''), canvas);
                resolve();
            };
            img.onerror = () => resolve();
            img.src = new URL('backgrounds/' + layer.image, assets.base);
        });
    }));
}

export function drawBackground(ctx, assets, index) {
    const bg = assets.backgrounds[index];
    if (!bg) return;
    const SIZE = 250 * TILE;
    const py = (cells) => TILE - cells * TILE;
    for (const layer of bg.layers) {
        const img = assets.backgroundImages.get(layer.image + (layer.cutout ? '|cut' : ''));
        if (!img) continue;
        const pattern = ctx.createPattern(img, 'repeat');
        pattern.setTransform(new DOMMatrix()
            .translate(0, py(layer.y0))
            .scale(layer.tileW * TILE / img.width, layer.tileH * TILE / img.height));
        ctx.fillStyle = pattern;
        ctx.fillRect(0, py(layer.y1), SIZE, py(layer.y0) - py(layer.y1));
    }
}

export function findMissing(assets, items) {
    const missing = new Map();
    for (const it of items) {
        const found = lookup(assets, it.kind === 'span' ? 'object' : it.kind, it.id, it.variant);
        if (found === null) continue;
        if (!found || !assets.sprites[found.key]) {
            const name = it.kind + ' ' + it.id;
            missing.set(name, (missing.get(name) || 0) + 1);
        }
    }
    return missing;
}

export function renderToCanvas(assets, area, cells, scale = 1, options = {}) {
    const w = (cells.maxX - cells.minX + 1) * TILE, h = (cells.maxY - cells.minY + 1) * TILE;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    const art = options.background === 'art';
    if (options.background !== 'none') {
        ctx.fillStyle = art ? backgroundColor(assets, area) : (options.background || '#000');
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const left = cells.minX * TILE, top = -cells.maxY * TILE;
    ctx.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);
    ctx.imageSmoothingEnabled = false;
    if (art) drawBackground(ctx, assets, area.background);
    const missing = drawItems(ctx, assets, area.items, {
        visible: { left, top, right: left + w, bottom: top + h },
        unknown: options.unknown,
        background: area.background,
        links: options.links,
        start: options.start,
        border: options.border,
        hideBack: options.hideBack,
        hideDeco: options.hideDeco,
    });
    return { canvas, missing };
}

export function thumbnailCells(area, cols = 32, rows = 18) {
    const b = area.bounds;
    const clamp = (want, size, lo, hi) => (hi - lo + 1 <= size) ? Math.floor((lo + hi) / 2 - size / 2 + 0.5)
        : Math.max(lo, Math.min(want, hi - size + 1));
    const sx = area.start.x ?? b.minX, sy = area.start.y ?? b.maxY;
    const minX = clamp(sx - Math.floor(cols / 4), cols, b.minX - 1, b.maxX + 1);
    const minY = clamp(sy - Math.floor(rows / 2), rows, b.minY - 1, b.maxY + 1);
    return { minX, maxX: minX + cols - 1, minY, maxY: minY + rows - 1 };
}
