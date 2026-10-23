import { db, auth } from '../firebase-config.js';
import { signOut, onAuthStateChanged, deleteUser }
    from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { doc, getDoc, getDocs, collection, writeBatch, setDoc, updateDoc, deleteDoc, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { clearDataCache, loadPlayers } from './data.js';
import { startDiscordSignIn } from './discord.js';

export const signIn = () => startDiscordSignIn();
export const signOutUser = () => signOut(auth);

export const NAME_RULE = /^[\p{L}\p{N}_ .()-]{2,24}$/u;
export const nameKey = (name) => name.trim().toLowerCase();

export function watchAccount(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (!user) return callback({ user: null });
        try {
            const p = await getDoc(doc(db, 'players', user.uid));
            if (p.exists()) {
                loadPlayers().then(list => { if (!list.some(x => x.docId === p.id)) clearDataCache(); }).catch(() => { });
                return callback({ user, player: { docId: p.id, ...p.data() } });
            }
            const c = await getDoc(doc(db, 'claims', user.uid));
            callback({ user, player: null, claim: c.exists() ? c.data() : null });
        } catch (err) {
            console.error('Could not load the account:', err);
            callback({ user, player: null, claim: null, error: err });
        }
    });
}

export async function checkName(name) {
    name = name.trim();
    if (!NAME_RULE.test(name)) return { status: 'invalid' };
    const reserved = await getDoc(doc(db, 'usernames', nameKey(name)));
    let record = null;
    if (reserved.exists()) {
        const p = await getDoc(doc(db, 'players', reserved.data().uid));
        record = p.exists() ? { docId: p.id, ...p.data() } : null;
    } else {
        const snap = await getDocs(collection(db, 'players'));
        const d = snap.docs.find(x => nameKey(x.data().username || '') === nameKey(name));
        record = d ? { docId: d.id, ...d.data() } : null;
    }
    if (!record) return reserved.exists() ? { status: 'taken' } : { status: 'free' };
    if (record.legacy === true && record.claimed !== true) return { status: 'claimable', record };
    return { status: 'taken' };
}

export async function createAccount(user, name) {
    name = name.trim();
    const batch = writeBatch(db);
    batch.set(doc(db, 'players', user.uid), {
        username: name, role: 'player', legacy: false, claimed: false, retired: false,
        beatenLevels: [], verifiedLevels: [], oldCompletions: [],
        createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'usernames', nameKey(name)), { uid: user.uid });
    await batch.commit();
    clearDataCache();
}

export async function fileClaim(user, record) {
    const { claims } = await user.getIdTokenResult();
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const pick = crypto.getRandomValues(new Uint32Array(6));
    const code = 'KL-' + [...pick].map(n => letters[n % letters.length]).join('');
    await setDoc(doc(db, 'claims', user.uid), {
        legacyPlayerId: record.docId, usernameRequested: record.username, discordNote: String(claims.discordName || ''),
        code, status: 'pending', createdAt: serverTimestamp(),
    });
    return code;
}

export const cancelClaim = (user) => deleteDoc(doc(db, 'claims', user.uid));

export const hasLevels = (player) => !!(player.beatenLevels?.length || player.verifiedLevels?.length);
export async function deleteMyAccount(user, player) {
    if (hasLevels(player) || player.legacy || player.claimed || player.role !== 'player') {
        await updateDoc(doc(db, 'players', user.uid), { deleteRequested: true });
        return 'requested';
    }
    const batch = writeBatch(db);
    batch.delete(doc(db, 'players', user.uid));
    batch.delete(doc(db, 'usernames', nameKey(player.username)));
    batch.delete(doc(db, 'claims', user.uid));
    await batch.commit();
    clearDataCache();
    try { await deleteUser(user); }
    catch (err) {
        if (err.code !== 'auth/requires-recent-login') throw err;
        await signOut(auth);
    }
    return 'deleted';
}
export const cancelDeleteRequest = (user) => updateDoc(doc(db, 'players', user.uid), { deleteRequested: false });
