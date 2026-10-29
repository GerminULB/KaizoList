import { parseUlb } from './ulb.js';
import { loadAssets, readArea, renderToCanvas, loadBackground, thumbnailCells } from './renderer.js';
import { loadLevels } from '../js/data.js';

const COLS = 40, ROWS = 12, SCALE = 2;

const $ = (id) => document.getElementById(id);
const made = [];
let assets = null;

function log(text, kind = '') {
    const li = document.createElement('li');
    li.textContent = text;
    li.className = kind;
    $('log').appendChild(li);
    li.scrollIntoView({ block: 'nearest' });
}

async function makeThumb(text) {
    const { level } = await parseUlb(text);
    const z = (id) => (assets.map.items[id] || {}).z || 0;
    const area = readArea(level.mainData, { z });
    await loadBackground(assets, area.background);
    const { canvas } = renderToCanvas(assets, area, thumbnailCells(area, COLS, ROWS), SCALE, {
        unknown: 'skip', background: 'art', links: $('links').checked, start: false, hideEditor: true, border: false,
    });
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

async function addThumb(id, text, label) {
    try {
        const blob = await makeThumb(text);
        made.push({ name: `${id}.png`, blob });
        const img = document.createElement('img');
        img.src = URL.createObjectURL(blob);
        img.title = `${label} → ${id}.png`;
        $('previews').appendChild(img);
        log(`${label} → ${id}.png (${Math.round(blob.size / 1024)} KB)`, 'ok');
    } catch (err) {
        log(`${label}: could not read (${err.message})`, 'bad');
    }
    $('save').disabled = made.length === 0;
    $('count').textContent = made.length ? `${made.length} thumbnail${made.length === 1 ? '' : 's'} ready` : '';
}

$('fromSite').onclick = async () => {
    $('fromSite').disabled = true;
    try {
        // the list lives in Firestore since 1.3 (levels.json is gone)
        const list = await loadLevels();
        let found = 0;
        const missing = [];
        for (const lvl of list) {
            if (!lvl.id) continue;
            const res = await fetch(`../levels/${encodeURIComponent(lvl.id)}.ulb`).catch(() => null);
            if (!res || !res.ok) { missing.push(lvl.name || lvl.id); continue; }
            found++;
            await addThumb(lvl.id, await res.text(), lvl.name);
        }
        if (!found) log('No level files found in levels/. Name them after the level ID, like levels/913800.ulb.', 'bad');
        else if (missing.length) log(`No .ulb file for: ${missing.join(', ')}`, 'bad');
    } catch (err) {
        log(`Could not load the level list (${err.message})`, 'bad');
    }
    $('fromSite').disabled = false;
};

$('files').onchange = async (e) => {
    for (const f of e.target.files) await addThumb(f.name.replace(/\.ulb$/i, ''), await f.text(), f.name);
    e.target.value = '';
};

$('save').onclick = async () => {
    const onSite = await fetch('../thumbs/list.json').then(r => r.ok ? r.json() : []).catch(() => []);
    const ids = [...new Set([...onSite, ...made.map(f => f.name.replace(/\.png$/, ''))])].sort();
    const list = { name: 'list.json', blob: new Blob([JSON.stringify(ids)], { type: 'application/json' }) };
    const zip = await makeZip([...made, list]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zip);
    a.download = 'thumbs.zip';
    a.click();
};

$('clear').onclick = () => {
    made.length = 0;
    $('previews').innerHTML = '';
    $('log').innerHTML = '';
    $('save').disabled = true;
    $('count').textContent = '';
};

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}
async function makeZip(files) {
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
        const data = new Uint8Array(await f.blob.arrayBuffer());
        const name = new TextEncoder().encode(f.name);
        const crc = crc32(data);
        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true);
        local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
        local.setUint16(26, name.length, true);
        parts.push(local, name, data);
        const cen = new DataView(new ArrayBuffer(46));
        cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true);
        cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
        cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
        central.push(cen, name);
        offset += 30 + name.length + data.length;
    }
    const size = central.reduce((s, p) => s + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, size, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

assets = await loadAssets();
$('status').textContent = 'Ready.';
$('fromSite').disabled = false;
