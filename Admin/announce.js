
import { db } from '../firebase-config.js';
import { collection, doc, getDoc, getDocs, setDoc, query, where, writeBatch, serverTimestamp, Timestamp }
    from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { calculatePlayerScore } from '../score.js';


const PING_MAJOR = '<@&1291483903818989659>';
const PING_MINOR = '<@&1292021069192101898>';

const TIERS = [50, 25, 15, 10, 5];
const MAIN = 100;
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const count = (n) => n <= 10 ? `${WORDS[n]} (${n})` : String(n);
const joinList = (a) => a.length <= 1 ? (a[0] || '') : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(', ')}, and ${a[a.length - 1]}`;
const tierOf = (rank) => rank === 1 ? 1 : [5, 10, 15, 25, 50].find(t => rank <= t) || null;
const emoji = (t) => t ? `:badge_top_${t}:` : '';
const period = (name) => { const w = String(name || '').trim().split(/\s+/).pop() || ''; return w.charAt(0).toUpperCase() + w.slice(1); };

function rankLevels(list) {
    return list.map(l => ({ ...l, id: String(l.id), klp: Number(l.klp) || 0 }))
        .sort((a, b) => (b.klp - a.klp) || ((a.position ?? 1e9) - (b.position ?? 1e9)) || String(a.name).localeCompare(String(b.name)))
        .map((l, i) => ({ ...l, rank: i + 1 }));
}

function buildState(levelList, playerList) {
    const ranked = rankLevels(levelList);
    const byId = new Map(ranked.map(l => [l.id, l]));
    const scored = playerList.filter(p => p.username).map(p => {
        const beaten = (p.beatenLevels || []).map(String), verified = (p.verifiedLevels || []).map(String);
        const done = [...verified, ...beaten].map(id => byId.get(id)).filter(Boolean);
        return { docId: p.docId, name: p.username, retired: !!p.retired, beaten, verified, plp: done.length ? calculatePlayerScore(done) : 0 };
    });
    const board = scored.filter(p => !p.retired && p.plp > 0).sort((a, b) => b.plp - a.plp);
    const rankOf = new Map(board.map((p, i) => [p.docId, i + 1]));
    return {
        levels: Object.fromEntries(ranked.map(l => [l.id, { name: l.name, klp: l.klp, rank: l.rank, creator: l.creator || '' }])),
        players: Object.fromEntries(scored.map(p => [p.docId, { name: p.name, plp: Math.round(p.plp), rank: rankOf.get(p.docId) ?? null, beaten: p.beaten, verified: p.verified }])),
        top1: ranked[0]?.id || null,
    };
}

function duration(fromMs, toMs = Date.now()) {
    const a = new Date(fromMs), b = new Date(toMs);
    let y = b.getFullYear() - a.getFullYear(), m = b.getMonth() - a.getMonth(), d = b.getDate() - a.getDate();
    if (d < 0) { m--; d += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
    if (m < 0) { y--; m += 12; }
    const parts = [[y, 'year'], [m, 'month'], [d, 'day']].filter(([n]) => n > 0).map(([n, w]) => `${n} ${w}${n === 1 ? '' : 's'}`);
    return parts.length ? joinList(parts).replace(/, and /, ' and ') : '0 days';
}

const SITE = 'https://kaizolist.com';
const lvl = (l) => `[${l.name}](${SITE}/LevelDetails.html?id=${encodeURIComponent(l.id)})`;
const ply = (name) => `[${name}](${SITE}/PlayerDetails.html?name=${encodeURIComponent(name)})`;
const it = (name) => `*${name}*`;
const creators = (c) => String(c || '').split(/\s*(?:,|&)\s*/).filter(Boolean).map(it).join(' & ');

export function buildPost(prev, now, top1SinceMs) {
    const out = [];
    const ids = (s) => Object.keys(s.levels);
    const byRank = (s) => (a, b) => s.levels[a].rank - s.levels[b].rank;
    const atRank = Object.fromEntries(Object.entries(now.levels).map(([id, l]) => [l.rank, l]));

    const added = ids(now).filter(id => !prev.levels[id]).sort(byRank(now));
    const removed = ids(prev).filter(id => !now.levels[id]).sort(byRank(prev));
    const moved = ids(now).filter(id => prev.levels[id] && prev.levels[id].klp !== now.levels[id].klp).sort(byRank(now));
    const movedSet = new Set(moved);
    const newTop = !!(prev.top1 && now.top1 && prev.top1 !== now.top1);
    const changes = added.length + moved.length + removed.length;

    if (added.length) {
        out.push(`Added ${count(added.length)} level${added.length === 1 ? '' : 's'}:`);
        for (const id of added) {
            const l = now.levels[id];
            out.push(`- ${emoji(tierOf(l.rank))}${lvl({ ...l, id })}${l.creator ? ` by ${creators(l.creator)}` : ''} with **${l.klp}KLP** at #${l.rank}`);
        }
        out.push('');
    }

    const pushParts = [], mainOut = [];
    const pushed = Object.fromEntries(TIERS.map(t => [t, []]));
    for (const id of ids(now)) {
        const p = prev.levels[id], n = now.levels[id];
        if (!p || movedSet.has(id)) continue;
        const t = [...TIERS].reverse().find(t => p.rank <= t && n.rank > t);
        if (t) pushed[t].push(it(n.name));
        if (p.rank <= MAIN && n.rank > MAIN) mainOut.push(it(n.name));
    }
    for (const t of TIERS) if (pushed[t].length) pushParts.push(`${joinList(pushed[t])} out of the Top ${t} ${emoji(t)}`);

    const para = [];
    if (newTop) {
        const old = now.levels[prev.top1] || prev.levels[prev.top1];
        const held = top1SinceMs ? `${Math.floor((Date.now() - top1SinceMs) / 86400000)} days` : '[N] days';
        para.push(`This change dethrones ${lvl({ ...old, id: prev.top1 })} (${old.klp}KLP), which held #1 for ${held}.`);
    }
    if (pushParts.length) para.push(`${newTop ? 'It also pushes' : changes > 1 ? 'These changes push' : 'This change pushes'} ${joinList(pushParts)}.`);
    if (mainOut.length) para.push(`${joinList(mainOut)} ${mainOut.length === 1 ? 'was' : 'were'} pushed out of the Main List as well.`);
    if (para.length) out.push(...para, '');

    const moveLines = [];
    const droppedOut = moved.filter(id => prev.levels[id].rank <= MAIN && now.levels[id].rank > MAIN);
    if (droppedOut.length) moveLines.push(`${joinList(droppedOut.map(id => lvl({ ...now.levels[id], id })))} ${droppedOut.length === 1 ? 'has' : 'have'} been lowered out of the Main List.`);
    for (const id of moved) {
        if (droppedOut.includes(id)) continue;
        const p = prev.levels[id], n = now.levels[id];
        const before = tierOf(p.rank), after = tierOf(n.rank);
        const name = before === after ? `${emoji(before)}${before ? ' ' : ''}${lvl({ ...n, id })}` : `${emoji(before)}${before ? ' ' : ''}${lvl({ ...n, id })}${after ? ` ${emoji(after)}` : ''}`;
        const verb = n.klp > p.klp ? 'buffed' : 'lowered';
        if (p.rank === n.rank) { moveLines.push(`${name} has been ${verb} from ${p.klp} to **${n.klp}KLP** (still #${n.rank}).`); continue; }
        const above = atRank[n.rank - 1], below = atRank[n.rank + 1];
        const where = above && below ? ` below ${it(above.name)} and above ${it(below.name)}` : below ? ` above ${it(below.name)}` : above ? ` below ${it(above.name)}` : '';
        moveLines.push(`${name} has been ${verb} from #${p.rank} to #${n.rank}${where} with **${n.klp}KLP**.`);
    }
    for (const id of removed) moveLines.push(`${it(prev.levels[id].name)} has been removed from the list.`);
    if (moveLines.length) out.push(...moveLines, '');

    // completions gained since then (verifications of the new levels themselves don't count as submissions)
    const prevBeatenBy = new Set(Object.values(prev.players).flatMap(p => p.beaten));
    const gains = [];
    for (const [docId, n] of Object.entries(now.players)) {
        const p = prev.players[docId] || { beaten: [], verified: [], plp: 0, rank: null };
        const had = new Set([...p.beaten, ...p.verified]);
        const beat = n.beaten.filter(id => !had.has(id) && now.levels[id]);
        const verified = n.verified.filter(id => !had.has(id) && now.levels[id] && prev.levels[id]);
        if (beat.length || verified.length) gains.push({ docId, n, p, beat, all: [...beat, ...verified] });
    }
    if (gains.length) {
        gains.sort((a, b) => a.n.name.localeCompare(b.n.name));
        if (gains.length === 1 && gains[0].all.length === 1) out.push(`${lvl({ ...now.levels[gains[0].all[0]], id: gains[0].all[0] })} submission by ${ply(gains[0].n.name)} has been accepted.`);
        else if (gains.length === 1) out.push(`Several submissions by ${ply(gains[0].n.name)} have been accepted.`);
        else out.push(`Submissions by ${joinList(gains.map(g => ply(g.n.name)))} were accepted.`);
        out.push('');
    }

    const cheers = [];
    for (const { n, p, beat } of gains) {
        if (!beat.length) continue;
        const firsts = beat.filter(id => prev.levels[id] && !prevBeatenBy.has(id)).sort(byRank(now));
        const hardest = (firsts.length ? firsts : [...beat].sort(byRank(now)))[0];
        const rankUp = n.rank && (!p.rank || n.rank < p.rank);
        if (!firsts.length && !(rankUp && n.rank <= 10)) continue;
        let line = `Congratulations to ${ply(n.name)} (**${n.plp}PLP**) for beating ${lvl({ ...now.levels[hardest], id: hardest })}`;
        if (firsts.length) line += ', making them the first victor of the level';
        if (rankUp) line += `${firsts.length ? ' which' : ', which'} pushes them into the #${n.rank} spot of the Leaderboards`;
        cheers.push(line + '.');
    }
    for (const [docId, n] of Object.entries(now.players)) {
        const p = prev.players[docId];
        const before = Math.floor((p?.plp || 0) / 1000), after = Math.floor(n.plp / 1000);
        if (after <= before || after < 1) continue;
        const mark = after * 1000;
        const first = !Object.entries(prev.players).some(([id, x]) => id !== docId && x.plp >= mark);
        cheers.push(`${ply(n.name)} also hits **${n.plp}PLP**, ${first ? `making them the first player to surpass the ${mark}PLP mark` : `passing the ${mark}PLP mark`}.`);
    }
    if (cheers.length) out.push(...cheers, '');

    if (newTop) {
        const oldName = (now.levels[prev.top1] || prev.levels[prev.top1]).name;
        out.push(`${period(oldName)} Period is over (${top1SinceMs ? duration(top1SinceMs) : '[duration]'}). Welcome to the ${period(now.levels[now.top1].name)} Period.`, '');
    }

    if (!changes && !gains.length) out.push('(Nothing changed since then.)', '');
    out.push(newTop ? '@everyone' : `${PING_MAJOR || '@Major List Changes Ping'}\n${PING_MINOR || '@Minor List Changes Ping'}`);
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function plpTable(prev, now) {
    const rows = Object.entries(now.players).map(([id, n]) => ({ n, p: prev.players[id] || { plp: 0, rank: null } }))
        .filter(({ n, p }) => n.plp !== p.plp || n.rank !== p.rank)
        .sort((a, b) => (a.n.rank ?? 1e9) - (b.n.rank ?? 1e9));
    if (!rows.length) return '<tr><td colspan="3" class="muted">No PLP changes.</td></tr>';
    const r = (x) => x ? `#${x}` : '–';
    return rows.map(({ n, p }) => {
        const d = n.plp - p.plp;
        return `<tr><td>${esc(n.name)}</td><td>${p.plp} → <b>${n.plp}</b> <span class="${d >= 0 ? 'ok' : 'bad'}">(${d >= 0 ? '+' : ''}${d})</span></td><td>${r(p.rank)} → <b>${r(n.rank)}</b></td></tr>`;
    }).join('');
}


async function stateFromSnapshot(snapDoc, levelsNow, playersNow) {
    const snapLevels = snapDoc.levels || [];
    const since = new Date(`${snapDoc.date || snapDoc.id}T00:00:00`);
    const lg = await getDocs(query(collection(db, 'changeLog'), where('at', '>=', Timestamp.fromDate(since)))).catch(() => ({ docs: [] }));
    const byName = new Map([...levelsNow, ...snapLevels].map(l => [String(l.name).toLowerCase(), String(l.id)]));
    const strip = (s) => String(s || '').replace(/^verification of /, '').replace(/(\s\((?:\d+ KLP|own submission)\))+$/, '').trim().toLowerCase();
    const minus = new Map();
    for (const d of lg.docs) {
        const e = d.data();
        if (e.action !== 'submission.accept' && e.action !== 'victor.add') continue;
        const id = byName.get(strip(e.details));
        if (!id) continue;
        const k = String(e.target).toLowerCase();
        if (!minus.has(k)) minus.set(k, new Set());
        minus.get(k).add(id);
    }
    const playersThen = playersNow.map(p => {
        const m = minus.get(String(p.username).toLowerCase());
        if (!m) return p;
        return { ...p, beatenLevels: p.beatenLevels.filter(id => !m.has(String(id))), verifiedLevels: p.verifiedLevels.filter(id => !m.has(String(id))) };
    });
    return buildState(snapLevels, playersThen);
}

export function initAnnounce({ levels, players, me }) {
    let saved = null, snaps = [], prev = null, now = null, prevTop1Since = null;

    async function load() {
        const [st, sn] = await Promise.all([
            getDoc(doc(db, 'meta', 'announceState')).catch(() => null),
            getDocs(collection(db, 'snapshots')).catch(() => ({ docs: [] })),
        ]);
        saved = st?.exists() ? st.data() : null;
        snaps = sn.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.id.localeCompare(a.id));
        const opts = [];
        if (saved) opts.push(`<option value="saved">Last announcement (${esc(saved.at?.toDate?.().toLocaleString('en-GB') || '?')})</option>`);
        for (const s of snaps) opts.push(`<option value="${esc(s.id)}">Snapshot ${esc(s.id)}</option>`);
        $('annBase').innerHTML = opts.join('') || '<option value="">No starting point saved yet</option>';
        $('annStatus').innerHTML = saved ? '' : '<span class="muted">No announcement marked yet, so pick the snapshot from right after your last post.</span>';
    }

    $('annBuild').onclick = async () => {
        $('annBuild').disabled = true;
        try {
            now = buildState(levels(), players());
            const base = $('annBase').value;
            if (base === 'saved' && saved) { prev = saved; prevTop1Since = saved.top1Since?.toMillis?.() || null; }
            else {
                const s = snaps.find(x => x.id === base);
                if (!s) throw new Error('Pick a starting point first.');
                prev = await stateFromSnapshot(s, levels(), players());
                prevTop1Since = saved && saved.top1 === prev.top1 ? saved.top1Since?.toMillis?.() || null : null;
            }
            $('annText').value = buildPost(prev, now, prevTop1Since);
            $('annPlp').innerHTML = plpTable(prev, now);
            $('annMark').disabled = false;
        } catch (err) { $('annStatus').innerHTML = `<span class="bad">${esc(err.message)}</span>`; }
        $('annBuild').disabled = false;
    };

    $('annCopy').onclick = async () => {
        try { await navigator.clipboard.writeText($('annText').value); $('annStatus').innerHTML = '<span class="ok">Copied!</span>'; }
        catch { $('annText').select(); $('annStatus').innerHTML = '<span class="muted">Select all and copy it by hand.</span>'; }
    };

    $('annMark').onclick = async () => {
        if (!now) return;
        $('annMark').disabled = true;
        try {
            const newTop = !prev?.top1 || prev.top1 !== now.top1;
            const batch = writeBatch(db);
            batch.set(doc(db, 'meta', 'announceState'), {
                ...now, at: serverTimestamp(),
                top1Since: newTop ? serverTimestamp() : (prevTop1Since ? Timestamp.fromMillis(prevTop1Since) : null),
            });

            const m = me();
            batch.set(doc(collection(db, 'changeLog')), { at: serverTimestamp(), by: m.uid, byName: m.name, action: 'announce', target: 'list changes', details: '' });
            await batch.commit();
            $('annStatus').innerHTML = '<span class="ok">Marked as announced. The next post starts from here.</span>';
            await load();
        } catch (err) { $('annStatus').innerHTML = `<span class="bad">${esc(err.message)}</span>`; $('annMark').disabled = false; }
    };

    document.querySelector('[data-tab="announce"]')?.addEventListener('click', () => { if (me()?.role === 'owner') load(); });
}
