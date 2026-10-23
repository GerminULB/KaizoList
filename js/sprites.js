const BUTTON = { light: '#a7d8ac', dark: '#4a4a4a' };

const SPRITES = {
    board: { src: '/images/ui/board_9slice.png', base: 223, light: '#81b885', dark: '#161616' },
    frame: { src: '/images/ui/frame_9slice.png', base: 223, light: '#71b688', dark: '#646464' },

    'textbox':      { src: '/images/ui/textbox_9slice.png',  base: 173, light: '#b9e6bd', dark: '#3a3a3a' },
    'dropdown':     { src: '/images/ui/dropdown_9slice.png', base: 170, ...BUTTON },
    'slider-back':  { src: '/images/ui/slider_back.png',     base: 85,  light: '#4f7d56', dark: '#232323' },
    'slider-front': { src: '/images/ui/slider_front.png',    base: 170, ...BUTTON },
    'radio-off':    { src: '/images/ui/radio_off.png',       base: 170, ...BUTTON },

    'ico-back':    { src: '/images/icon/back.png',    base: 170, ...BUTTON, glyph: true },
    'ico-close':   { src: '/images/icon/close.png',   base: 170, ...BUTTON, glyph: true },
    'ico-delete':  { src: '/images/icon/delete.png',  base: 170, ...BUTTON, glyph: true },
    'ico-edit':    { src: '/images/icon/edit.png',    base: 170, ...BUTTON, glyph: true },
    'ico-profile': { src: '/images/icon/profile.png', base: 170, ...BUTTON, glyph: true },
    'ico-revert':  { src: '/images/icon/revert.png',  base: 170, ...BUTTON, glyph: true },

    'ico-lock':     { src: '/images/icon/lock.png',     base: 85, light: '#3a3a3a', dark: '#e2e2e2' },
    'ico-dropdown': { src: '/images/icon/dropdown.png', base: 64, light: '#2f2f2f', dark: '#e2e2e2' },
    'ico-search':   { src: '/images/icon/search.png',   base: 64, light: '#3d5a40', dark: '#e2e2e2' },
};
const GLYPH_DARK = [228, 228, 228];

function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Could not load ${src}`));
        img.src = src;
    });
}

function tintToDataUrl(img, hex, base, glyph) {
    const canvas = document.createElement('canvas');
    const w = canvas.width = img.naturalWidth;
    const h = canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);

    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    const src = new Uint8ClampedArray(px);
    const [r, g, b] = hexToRgb(hex);
    const opaque = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;

    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (src[i + 3] === 0) continue;
        if (glyph && src[i] < base * 0.65 && x >= 3 && y >= 3 && x < w - 3 && y < h - 3
            && [-1, 0, 1].every(dx => [-1, 0, 1].every(dy => opaque(x + dx, y + dy)))) {
            [px[i], px[i + 1], px[i + 2]] = GLYPH_DARK;
            continue;
        }
        const k = src[i] / base;
        px[i]     = Math.min(255, Math.round(r * k));
        px[i + 1] = Math.min(255, Math.round(g * k));
        px[i + 2] = Math.min(255, Math.round(b * k));
    }

    ctx.putImageData(data, 0, 0);
    return canvas.toDataURL('image/png');
}

export async function initSprites() {
    const root = document.documentElement;
    await Promise.all(Object.entries(SPRITES).map(async ([name, s]) => {
        try {
            const img = await loadImage(s.src);
            root.style.setProperty(`--${name}-img-light`, `url("${tintToDataUrl(img, s.light, s.base, false)}")`);
            root.style.setProperty(`--${name}-img-dark`, `url("${tintToDataUrl(img, s.dark, s.base, s.glyph)}")`);
        } catch (err) {
            console.warn('Sprite tinting failed:', err);
        }
    }));
}

initSprites();
