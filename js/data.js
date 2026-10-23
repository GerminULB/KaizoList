import { db } from '../firebase-config.js';
import { collection, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

let levelsPromise = null;
let playersPromise = null;
let ratingsPromise = null;
let snapshotsPromise = null;

// every visitor used to re-read whole collections on every page; keep them for a few minutes instead
const CACHE_KEY = 'kl-cache-v1:';
const CACHE_TTL = 10 * 60 * 1000;

// the admin page bumps meta/version after every change, so a cache from before that is thrown away
let versionPromise = null;
function dataVersion() {
    versionPromise = versionPromise || getDoc(doc(db, 'meta', 'version'))
        .then(s => s.data()?.at?.toMillis?.() || 0).catch(() => 0);
    return versionPromise;
}

async function cached(name, fetcher) {
    const v = await dataVersion();
    try {
        const c = JSON.parse(localStorage.getItem(CACHE_KEY + name));
        if (c && c.v === v && Date.now() - c.t < CACHE_TTL) return c.d;
    } catch { }
    const d = await fetcher();
    try { localStorage.setItem(CACHE_KEY + name, JSON.stringify({ t: Date.now(), v, d })); } catch { }
    return d;
}

export function clearDataCache() {
    levelsPromise = playersPromise = ratingsPromise = versionPromise = null;
    try {
        for (const k of Object.keys(localStorage)) if (k.startsWith(CACHE_KEY)) localStorage.removeItem(k);
    } catch { }
}

export function loadLevels() {
    levelsPromise = levelsPromise || cached('levels', async () => {
        const snap = await getDocs(collection(db, 'levels'));
        return snap.docs.map(d => {
            const x = d.data();
            return {
                name: x.name ?? '', klp: Number(x.klp) || 0, creator: x.creator ?? '', verifier: x.verifier ?? '',
                id: String(x.id ?? d.id), badges: Array.isArray(x.badges) ? x.badges : [],
                position: Number.isFinite(x.position) ? x.position : 1e9,
            };
        }).sort((a, b) => (b.klp - a.klp) || (a.position - b.position) || a.name.localeCompare(b.name));
    });
    return levelsPromise;
}

export function loadPlayers() {
    playersPromise = playersPromise || cached('players', async () => {
        const snap = await getDocs(collection(db, 'players'));
        return snap.docs.map(d => {
            const x = d.data();
            return {
                docId: d.id, username: x.username ?? '', role: x.role ?? 'player', retired: !!x.retired,
                beatenLevels: x.beatenLevels || [], verifiedLevels: x.verifiedLevels || [], oldCompletions: x.oldCompletions || [],
                look: x.look || null, unlockedHats: x.unlockedHats || [],
            };
        });
    });
    return playersPromise;
}

export function loadRatings() {
    ratingsPromise = ratingsPromise || cached('ratings', async () => {
        const snap = await getDocs(collection(db, 'enjoymentRatings'));
        return snap.docs.map(d => {
            const r = d.data();
            return { playerUid: r.playerUid, levelId: String(r.levelId), rating: Number(r.rating) || 0 };
        });
    });
    return ratingsPromise;
}

export function loadSnapshots() {
    snapshotsPromise = snapshotsPromise || getDocs(collection(db, 'snapshots')).then(snap =>
        new Map(snap.docs.map(d => [d.data().date || d.id, d.data().levels || []])));
    return snapshotsPromise;
}
