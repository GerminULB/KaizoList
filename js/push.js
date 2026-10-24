import { db, auth } from '../firebase-config.js';
import { getApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getMessaging, getToken, deleteToken, isSupported } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging.js";
import { doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

const VAPID_KEY = 'BEw4T4zbUSjSiODm0YYjDYILKmRDG6jwcLrH9ismvC_FlYOYNzd1V6PcmaeGt7d93puoEfcTB0iB12VVF1ACIXA';

const FLAG = 'kl_push_on';
const SEEN = 'kl_push_seen';
const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { } },
};
const today = () => new Date().toISOString().slice(0, 10);

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const pushIsOn = (user) => !!user && store.get(FLAG) === user.uid && typeof Notification !== 'undefined' && Notification.permission === 'granted';

export async function pushStatus(user) {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !(await isSupported().catch(() => false))) {
        return isIos() && !isStandalone() ? 'ios' : 'unsupported';
    }
    if (Notification.permission === 'denied') return 'denied';
    return pushIsOn(user) ? 'on' : 'off';
}

async function messaging() {
    await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const reg = await navigator.serviceWorker.ready;
    return { m: getMessaging(getApp()), reg };
}

export async function enablePush(user) {
    if (!user) throw new Error('signed-out');
    if (await Notification.requestPermission() !== 'granted') return 'denied';
    const { m, reg } = await messaging();
    const token = await getToken(m, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    await deleteDoc(doc(db, 'pushSubs', user.uid)).catch(() => { });
    await setDoc(doc(db, 'pushSubs', user.uid), { token, lastSeen: serverTimestamp(), updatedAt: serverTimestamp() });
    store.set(FLAG, user.uid);
    store.set(SEEN, today());
    return 'on';
}

export async function disablePush(user) {
    try { const { m } = await messaging(); await deleteToken(m); } catch { }
    if (user) await deleteDoc(doc(db, 'pushSubs', user.uid)).catch(() => { });
    store.set(FLAG, null);
    return 'off';
}

onAuthStateChanged(auth, (user) => {
    if (!user || store.get(FLAG) !== user.uid || store.get(SEEN) === today()) return;
    updateDoc(doc(db, 'pushSubs', user.uid), { lastSeen: serverTimestamp() })
        .then(() => store.set(SEEN, today()))
        .catch(() => store.set(FLAG, null));
});
