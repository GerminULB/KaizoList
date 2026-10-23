import { db } from '../firebase-config.js';
import { doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, where, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

export const submissionId = (uid, kind, levelId) => kind === 'victor' ? `${uid}_${levelId}` : `${uid}_v_${levelId}`;

export const VIDEO_RULE = /^https:\/\/[^\s]{5,295}$/;
export const LEVEL_ID_RULE = /^[0-9]{1,12}$/;

export async function loadMySubmissions(uid) {
    const snap = await getDocs(query(collection(db, 'submissions'), where('playerUid', '==', uid)));
    return snap.docs.map(d => ({ docId: d.id, ...d.data() }))
        .filter(s => s.playerUid === uid)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function sendSubmission(user, player, form) {
    const id = submissionId(user.uid, form.kind, form.levelId);
    const ref = doc(db, 'submissions', id);
    const old = await getDoc(ref);
    if (old.exists()) {
        if (old.data().status !== 'rejected') throw Object.assign(new Error('already sent'), { code: 'already-sent' });
        await deleteDoc(ref);
    }
    const data = {
        type: form.kind, playerUid: user.uid, username: player.username,
        levelId: form.levelId, levelName: form.levelName.trim(),
        inGameName: form.inGameName.trim(),
        videoUrl: form.videoUrl.trim(), klpOpinion: form.klpOpinion, thoughts: form.thoughts.trim(),
        status: 'pending', createdAt: serverTimestamp(),
    };
    if (form.kind === 'verification') data.creator = form.creator.trim();
    await setDoc(ref, data);
    return id;
}

export const withdrawSubmission = (docId) => deleteDoc(doc(db, 'submissions', docId));
