// discord sign in: turns discord's code into a firebase token
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const N = require('./notify.js');

initializeApp();

const DISCORD_CLIENT_ID = '1560332678409232385';
const DISCORD_CLIENT_SECRET = defineSecret('DISCORD_CLIENT_SECRET');

const MIN_ACCOUNT_DAYS = 1;
const discordCreated = (id) => Number((BigInt(id) >> 22n) + 1420070400000n);

const SITES = [/^https:\/\/(www\.)?kaizolist\.com$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const allowedRedirect = (uri) => {
    try {
        const u = new URL(uri);
        return u.pathname === '/Discord/' && SITES.some(re => re.test(u.origin));
    } catch { return false; }
};

exports.discordAuth = onRequest({ secrets: [DISCORD_CLIENT_SECRET], cors: SITES, maxInstances: 3 }, async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const { code, redirectUri } = req.body || {};
    if (typeof code !== 'string' || !code || code.length > 200 || !allowedRedirect(redirectUri)) {
        return res.status(400).json({ error: 'Bad request' });
    }

    try {
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET.value(),
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
            }),
        });
        if (!tokenRes.ok) {
            console.error('Discord token exchange failed', tokenRes.status, await tokenRes.text(), 'client_id', DISCORD_CLIENT_ID, 'redirect', redirectUri);
            return res.status(401).json({ error: 'Discord did not accept the sign-in. Try again.' });
        }
        const { access_token } = await tokenRes.json();

        const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${access_token}` } });
        if (!userRes.ok) return res.status(401).json({ error: 'Could not read your Discord account.' });
        const user = await userRes.json();
        const discordUid = String(user.id);
        const discordName = String(user.username || '').slice(0, 60);

        // accounts made before Discord sign-in (like the owner's) are linked by hand in discordLinks haha lol
        const db = getFirestore();
        const linkRef = db.doc(`discordLinks/${discordUid}`);
        const link = await linkRef.get();
        const uid = link.exists && link.data().uid ? link.data().uid : `discord_${discordUid}`;
        if ((await db.doc(`bans/${uid}`).get()).exists) {
            return res.status(403).json({ error: 'This account is banned from the Kaizo List.' });
        }
            if (!link.exists) {
                const days = (Date.now() - discordCreated(discordUid)) / 86400000;
                if (days < MIN_ACCOUNT_DAYS && !(await db.doc(`earlyAccess/${discordUid}`).get()).exists) {
                    const from = new Date(discordCreated(discordUid) + MIN_ACCOUNT_DAYS * 86400000)
                        .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/Berlin' });
                    return res.status(403).json({ error: `Your Discord account is too new to sign in here yet (this keeps spam accounts out). You can sign in from ${from}.` });
                }
                await linkRef.set({ uid });
            }
        await db.doc(`accounts/${uid}`).set({ discordUid, discordName, lastSignIn: FieldValue.serverTimestamp() }, { merge: true });
        const token = await getAuth().createCustomToken(uid, { discordUid, discordName });
        res.json({ token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Sign-in failed. Try again in a bit.' });
    }
});

const TITLE = 'KAIZO LIST';
const ICON = `${N.SITE}/images/app/icon-192.png`;
const BADGE = `${N.SITE}/images/app/badge-96.png`;
const DAILY_CAP = 6;

const TRIGGER_REGION = 'europe-west3';

async function push(uid, type, vars, link, extra = {}) {
    const db = getFirestore();
    const ref = db.doc(`pushSubs/${uid}`);
    const sub = await ref.get();
    if (!sub.exists || !sub.data().token) return false;
    const s = sub.data();
    const { day } = N.berlin();
    const count = s.sentDay === day ? (s.sentCount || 0) : 0;
    if (count >= DAILY_CAP) return false;
    const body = N.pickLine(type, vars);
    if (!body) return false;
    try {
        await getMessaging().send({
            token: s.token,
            notification: { title: TITLE, body },
            webpush: { notification: { icon: ICON, badge: BADGE }, fcmOptions: { link: link || N.SITE } },
        });
    } catch (err) {
        if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument'].includes(err.code)) await ref.delete();
        else console.error('push failed', uid, err.code || err);
        return false;
    }
    await ref.update({ sentDay: day, sentCount: count + 1, ...extra });
    return true;
}

async function playerName(uid) {
    const p = await getFirestore().doc(`players/${uid}`).get();
    return p.exists ? p.data().username : null;
}

exports.notifySubmission = onDocumentUpdated({ document: 'submissions/{id}', region: TRIGGER_REGION }, async (event) => {
    const before = event.data.before.data(), after = event.data.after.data();
    if (before.status !== 'pending' || !['accepted', 'rejected'].includes(after.status)) return;
    const link = after.type === 'victor' ? N.levelLink(after.levelId) : `${N.SITE}/Submit/`;
    await push(after.playerUid, after.status === 'accepted' ? 'sub_accepted' : 'sub_rejected',
        { level: after.levelName, reason: after.rejectReason || 'no reason given' }, link);
});

exports.notifyComment = onDocumentCreated({ document: 'comments/{id}', region: TRIGGER_REGION }, async (event) => {
    const c = event.data.data();
    const db = getFirestore();
    let page = c.targetId, link = N.SITE;
    if (c.target === 'level') {
        const l = await db.doc(`levels/${c.targetId}`).get();
        page = l.exists ? l.data().name : c.targetId;
        link = N.levelLink(c.targetId) + '#comments';
    } else {
        const owner = await db.doc(`usernames/${c.targetId}`).get();
        page = owner.exists ? (await playerName(owner.data().uid)) || c.targetId : c.targetId;
        link = N.playerLink(page) + '#comments';
    }
    const told = new Set([c.playerUid]);
    if (c.replyTo) {
        const parent = await db.doc(`comments/${c.replyTo}`).get();
        const to = parent.exists ? parent.data().playerUid : null;
        if (to && !told.has(to)) { told.add(to); await push(to, 'reply', { replier: c.username, page }, link); }
    }
    if (c.target === 'player') {
        const owner = await db.doc(`usernames/${c.targetId}`).get();
        const to = owner.exists ? owner.data().uid : null;
        if (to && !told.has(to)) await push(to, 'profile_comment', { commenter: c.username }, link);
    }
});

exports.kaizoHourly = onSchedule({ schedule: 'every 60 minutes', timeZone: 'Europe/Berlin' }, async () => {
    const db = getFirestore();
    const [lv, ps, subs, stateDoc] = await Promise.all([
        db.collection('levels').get(), db.collection('players').get(), db.collection('pushSubs').get(), db.doc('meta/pushState').get(),
    ]);
    const ranked = N.rankLevels(lv.docs.map(d => ({ id: d.id, ...d.data() })));
    const players = ps.docs.map(d => ({ docId: d.id, ...d.data() }));
    const pranks = N.rankPlayers(players, ranked);
    const state = N.snapshot(ranked, pranks);
    if (!stateDoc.exists) { await stateDoc.ref.set(state); return; }

    const { day, hour } = N.berlin();
    if (hour < 9 || hour >= 22) return;
    const events = N.diffEvents(stateDoc.data(), ranked, pranks);
    await stateDoc.ref.set(state);

    const byId = new Map(players.map(p => [p.docId, p]));
    for (const sub of subs.docs) {
        const uid = sub.id, s = sub.data(), player = byId.get(uid);
        if (!player) continue;
        const mine = events.filter(e => N.reaches(e, uid, player));
        let extra = {};
        const slot = N.fillerHours(uid, day).indexOf(hour);
        const key = `${day}#${slot}`;
        if (slot >= 0 && s.fillerDay !== key) {
            const seen = s.lastSeen?.toMillis ? s.lastSeen.toMillis() : Date.now();
            const days = Math.floor((Date.now() - seen) / 86400000);
            const stage = s.awayRef === seen ? (s.awayStage || 0) : 0;
            const away = slot === 0 ? N.awayType(days, stage) : null;
            if (away) {
                mine.push({ type: away[0], vars: { days }, link: N.SITE });
                extra = { fillerDay: key, awayStage: away[1], awayRef: seen };
            } else if (slot === 0 || days < 3) {
                mine.push({ type: 'filler', vars: {}, link: N.SITE });
                extra = { fillerDay: key };
            }
        }
        const base = N.personalVars(player, pranks, ranked);
        for (const e of mine.sort(N.byPriority).slice(0, 2)) {
            await push(uid, e.type, { ...base, ...e.vars }, e.link, extra);
            extra = {};
        }
    }
});
