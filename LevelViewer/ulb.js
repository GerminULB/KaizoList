export async function parseUlb(text) {
    const comma = text.indexOf(',');
    if (comma === -1) throw new Error('Not a .ulb file (no comma found).');

    const hash = text.slice(0, comma).trim();
    const base64 = text.slice(comma + 1).trim();

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const level = JSON.parse(new TextDecoder().decode(bytes));

    let hashOk = null;
    if (globalThis.crypto && crypto.subtle) {
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        const hex = [...digest].map(b => b.toString(16).padStart(2, '0')).join('');
        hashOk = hex.toUpperCase() === hash.toUpperCase();
    }

    return { level, hashOk };
}
