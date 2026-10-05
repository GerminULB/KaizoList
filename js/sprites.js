const SPRITES = {
    board: { src: '/images/ui/board_9slice.png', base: 223 },
    frame: { src: '/images/ui/frame_9slice.png', base: 223 },
};

const TINTS = {
    light: { board: '#81b885', frame: '#71b688' },
    dark:  { board: '#161616', frame: '#646464' },
};

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

function tintToDataUrl(img, hex, base) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    const [r, g, b] = hexToRgb(hex);

    for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) continue;
        const k = px[i] / base;
        px[i]     = Math.min(255, Math.round(r * k));
        px[i + 1] = Math.min(255, Math.round(g * k));
        px[i + 2] = Math.min(255, Math.round(b * k));
    }

    ctx.putImageData(data, 0, 0);
    return canvas.toDataURL('image/png');
}

export async function initSprites() {
    const root = document.documentElement;
    try {
        await Promise.all(Object.entries(SPRITES).map(async ([name, { src, base }]) => {
            const img = await loadImage(src);
            for (const theme of ['light', 'dark']) {
                root.style.setProperty(`--${name}-img-${theme}`, `url("${tintToDataUrl(img, TINTS[theme][name], base)}")`);
            }
        }));
    } catch (err) {
        // If anything fails the boards/frames are simply invisible; the page still works. phew.
        console.warn('Sprite tinting failed:', err);
    }
}

initSprites();
