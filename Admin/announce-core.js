// the announcement brain. no firebase in here, just list before + list now -> discord messages
// own file so i can test it without the whole site hahahahahahahahahahahaahahah lol lol ololololololloolololololoolsolsagokpfdblmcvlksajgfslfjaöslkgahldkhjWOGHWOITI   OTHROWITHWOPTQWPFOdbwsldgnÖSLDGöslbvjSÖLDKVJaölkfhSAFLKahslödASHFÖLKAHSLKFÖshlöfSHÖLDsfhöldSFHLÖsfhjfSDsfdhfSDsfhSFHsfSGsfhjsgh
import { calculatePlayerScore } from '../score.js';
import { BADGES } from '../js/badge.js';

export const SITE = 'https://kaizolist.com';
const TIERS = [50, 25, 15, 10, 5];
const MAIN = 100;
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
// so it doesnt say "welcome to the Level Period" lmao
const NOT_A_PERIOD = new Set(['level', 'kaizo', 'challenge', 'ultra', 'remake', 'ldm', 'v2', 'ii', 'iii', 'edition', 'version', 'hard', 'easy']);

const count = (n) => n <= 10 ? `${WORDS[n]} (${n})` : String(n);
export const joinList = (a) => a.length <= 1 ? (a[0] || '') : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(', ')}, and ${a[a.length - 1]}`;
const tierOf = (rank) => rank === 1 ? 1 : [5, 10, 15, 25, 50].find(t => rank <= t) || null;
const emoji = (t) => t ? `:badge_top_${t}:` : '';
const sameList = (a = [], b = []) => a.length === b.length && a.every((x, i) => x === b[i]);
const badgeName = (k) => (BADGES[k]?.label || k).replace(/ Badge$/, '');

export function periodName(levelName) {
    const w = String(levelName || '').trim().split(/\s+/).pop() || '';
    if (!/^[A-Za-zÀ-ÿ]{3,}$/.test(w) || NOT_A_PERIOD.has(w.toLowerCase())) return null;
    return w.charAt(0).toUpperCase() + w.slice(1);
}

function rankLevels(list) {
    return list.map(l => ({ ...l, id: String(l.id), klp: Number(l.klp) || 0 }))
        .sort((a, b) => (b.klp - a.klp) || ((a.position ?? 1e9) - (b.position ?? 1e9)) || String(a.name).localeCompare(String(b.name)))
        .map((l, i) => ({ ...l, rank: i + 1 }));
}

// state looks like { levels: {id: {name, klp, rank, creator, verifier, badges}},
//           players: {docId: {name, plp, rank, retired, beaten, verified}}, top1, topPlayer }
export function buildState(levelList, playerList) {
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
        levels: Object.fromEntries(ranked.map(l => [l.id, {
            name: l.name, klp: l.klp, rank: l.rank, creator: l.creator || '', verifier: l.verifier || '',
            badges: (l.badges || []).filter(b => !String(b).startsWith('special_')),
        }])),
        players: Object.fromEntries(scored.map(p => [p.docId, {
            name: p.name, plp: Math.round(p.plp), rank: rankOf.get(p.docId) ?? null, retired: p.retired, beaten: p.beaten, verified: p.verified,
        }])),
        top1: ranked[0]?.id || null,
        topPlayer: board[0]?.docId || null,
    };
}

export function duration(fromMs, toMs = Date.now()) {
    const a = new Date(fromMs), b = new Date(toMs);
    let y = b.getFullYear() - a.getFullYear(), m = b.getMonth() - a.getMonth(), d = b.getDate() - a.getDate();
    if (d < 0) { m--; d += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
    if (m < 0) { y--; m += 12; }
    const parts = [[y, 'year'], [m, 'month'], [d, 'day']].filter(([n]) => n > 0).map(([n, w]) => `${n} ${w}${n === 1 ? '' : 's'}`);
    return parts.length ? joinList(parts).replace(/, and /, ' and ') : '0 days';
}

// opts: links ('all' / 'levels' / 'none'), noEmbeds, pingMajor, pingMinor, top1SinceMs, now, kind ('auto' / 'everyone' / 'major' / 'minor')
// gives back the paragraphs + notes (notes = stuff to double check, not in the post)
// auto: new #1 = everyone, levels added/removed = major, everything else = minor
// minor posts are more detailed since theres less going on
export function buildPost(prev, now, opts = {}) {
    const { links = 'all', noEmbeds = true, pingMajor = '', pingMinor = '', top1SinceMs = null, kind: wanted = 'auto' } = opts;
    const nowMs = opts.now ?? Date.now();
    const url = (u) => noEmbeds ? `<${u}>` : u;
    const lvl = (id, l = now.levels[id] || prev.levels[id]) => links === 'none' ? l.name : `[${l.name}](${url(`${SITE}/LevelDetails.html?id=${encodeURIComponent(id)}`)})`;
    const ply = (name) => links === 'all' ? `[${name}](${url(`${SITE}/PlayerDetails.html?name=${encodeURIComponent(name)}`)})` : name;
    const it = (s) => `*${s}*`;
    const people = (c) => String(c || '').split(/\s*(?:,|&)\s*/).filter(Boolean);
    const credit = (c) => people(c).map(it).join(' & ');

    const P = [], notes = [];
    const ids = (s) => Object.keys(s.levels);
    const byRank = (s) => (a, b) => s.levels[a].rank - s.levels[b].rank;
    const atRank = Object.fromEntries(Object.entries(now.levels).map(([id, l]) => [l.rank, id]));
    const neighbours = (id) => {
        const r = now.levels[id].rank, a = atRank[r - 1], b = atRank[r + 1];
        const an = a && now.levels[a].name, bn = b && now.levels[b].name;
        return an && bn ? ` below ${it(an)} and above ${it(bn)}` : bn ? ` above ${it(bn)}` : an ? ` below ${it(an)}` : '';
    };

    const added = ids(now).filter(id => !prev.levels[id]).sort(byRank(now));
    const removed = ids(prev).filter(id => !now.levels[id]).sort(byRank(prev));
    const kept = ids(now).filter(id => prev.levels[id]);
    const klpMoved = kept.filter(id => prev.levels[id].klp !== now.levels[id].klp).sort(byRank(now));
    const movedSet = new Set(klpMoved);
    const newTop = !!(prev.top1 && now.top1 && prev.top1 !== now.top1);
    const changes = added.length + klpMoved.length + removed.length;
    const autoKind = newTop ? 'everyone' : (added.length || removed.length) ? 'major' : 'minor';
    const kind = wanted === 'auto' ? autoKind : wanted;
    const detailed = kind === 'minor';

    // new levels
    if (added.length) {
        const lines = [`Added ${count(added.length)} level${added.length === 1 ? '' : 's'}:`];
        for (const id of added) {
            const l = now.levels[id];
            const verifiedBy = l.verifier && !people(l.creator).map(x => x.toLowerCase()).includes(l.verifier.toLowerCase()) ? ` (verified by ${it(l.verifier)})` : '';
            const legacy = l.rank > MAIN ? ' (Legacy List)' : '';
            lines.push(`- ${emoji(tierOf(l.rank))}${lvl(id)}${l.creator ? ` by ${credit(l.creator)}` : ''}${verifiedBy} with **${l.klp}KLP** at #${l.rank}${legacy}`);
        }
        P.push(lines.join('\n'));
    }

    // new #1 + everything that got pushed around
    const para = [];
    if (newTop) {
        const old = now.levels[prev.top1] || prev.levels[prev.top1];
        const held = top1SinceMs ? `${Math.floor((nowMs - top1SinceMs) / 86400000)} days` : '[N] days';
        const how = added.includes(now.top1) ? 'This change dethrones' : `${lvl(now.top1)} takes #1, dethroning`;
        para.push(`${how} ${lvl(prev.top1, old)} (${old.klp}KLP), which held #1 for ${held}.`);
        if (!top1SinceMs) notes.push('Fill in how long the old #1 held the throne ([N] days / [duration]).');
    }
    const down = Object.fromEntries(TIERS.map(t => [t, []])), up = Object.fromEntries(TIERS.map(t => [t, []]));
    const outOfMain = [], backInMain = [];
    for (const id of kept) {
        if (movedSet.has(id)) continue;
        const p = prev.levels[id].rank, n = now.levels[id].rank, name = it(now.levels[id].name);
        const fell = [...TIERS].reverse().find(t => p <= t && n > t);
        const rose = TIERS.find(t => p > t && n <= t);
        if (fell) down[fell].push(name);
        if (rose && !(rose === 5 && n === 1)) up[rose].push(name);
        if (p <= MAIN && n > MAIN) outOfMain.push(name);
        if (p > MAIN && n <= MAIN) backInMain.push(name);
    }
    const downParts = TIERS.filter(t => down[t].length).map(t => `${joinList(down[t])} out of the Top ${t} ${emoji(t)}`);
    const upParts = TIERS.filter(t => up[t].length).map(t => `${joinList(up[t])} into the Top ${t} ${emoji(t)}`);
    if (downParts.length) para.push(`${newTop ? 'It also pushes' : changes > 1 ? 'These changes push' : 'This change pushes'} ${joinList(downParts)}.`);
    if (outOfMain.length) para.push(`${joinList(outOfMain)} ${outOfMain.length === 1 ? 'was' : 'were'} pushed out of the Main List as well.`);
    if (upParts.length) para.push(`${downParts.length ? 'Meanwhile, this moves' : newTop ? 'It also moves' : changes > 1 ? 'These changes move' : 'This change moves'} ${joinList(upParts)}.`);
    if (backInMain.length) para.push(`${joinList(backInMain)} ${backInMain.length === 1 ? 'is' : 'are'} back in the Main List.`);
    if (para.length) P.push(para.join('\n'));

    // level edits
    const edits = [];
    const lowOut = klpMoved.filter(id => prev.levels[id].rank <= MAIN && now.levels[id].rank > MAIN);
    if (lowOut.length) edits.push(`${joinList(lowOut.map(id => lvl(id)))} ${lowOut.length === 1 ? 'has' : 'have'} been lowered out of the Main List.`);
    for (const id of klpMoved) {
        if (lowOut.includes(id)) continue;
        const p = prev.levels[id], n = now.levels[id];
        const before = tierOf(p.rank), after = tierOf(n.rank);
        const tagged = `${before ? emoji(before) + ' ' : ''}${lvl(id)}${after && after !== before ? ' ' + emoji(after) : ''}`;
        const verb = n.klp > p.klp ? 'buffed' : 'lowered';
        const intoMain = p.rank > MAIN && n.rank <= MAIN ? ' (back into the Main List)' : '';
        if (p.rank === n.rank) edits.push(`${tagged} has been ${verb} from ${p.klp} to **${n.klp}KLP** (still #${n.rank}).`);
        else edits.push(`${tagged} has been ${verb} from #${p.rank} to #${n.rank}${neighbours(id)} with **${n.klp}KLP**${intoMain}.`);
    }
    for (const id of kept) {
        const p = prev.levels[id], n = now.levels[id];
        if (p.name !== n.name) edits.push(`${it(p.name)} has been renamed to ${lvl(id)}.`);
        if (p.creator !== undefined && p.verifier !== undefined && (p.creator !== n.creator || p.verifier !== n.verifier))
            edits.push(`Credits for ${lvl(id)} updated: by ${credit(n.creator) || '?'}${n.verifier ? `, verified by ${it(n.verifier)}` : ''}.`);
    }
    for (const id of removed) edits.push(`${it(prev.levels[id].name)} has been removed from the list.`);
    if (edits.length) P.push(edits.join('\n'));

    // badges (no approval badges, on purpose)
    const badgeLines = [];
    for (const id of kept) {
        const p = prev.levels[id].badges, n = now.levels[id].badges;
        if (!p) continue;
        const shown = (b) => !String(b).startsWith('approved_');
        const plus = [...new Set(n.filter(b => shown(b) && !p.includes(b)))], minus = [...new Set(p.filter(b => shown(b) && !n.includes(b)))];
        if (!plus.length && !minus.length) continue;
        badgeLines.push(`- ${lvl(id)}: ${[...plus.map(b => `+${badgeName(b)}`), ...minus.map(b => `−${badgeName(b)}`)].join(', ')}`);
    }
    if (badgeLines.length) P.push(['Badge changes:', ...badgeLines].join('\n'));

    // submissions + removed completions
    const prevBeatenBy = new Set(Object.values(prev.players).flatMap(p => p.beaten));
    const gains = [], losses = [];
    for (const [docId, n] of Object.entries(now.players)) {
        const p = prev.players[docId] || { beaten: [], verified: [], plp: 0, rank: null };
        const had = new Set([...p.beaten, ...p.verified]), has = new Set([...n.beaten, ...n.verified]);
        const beat = n.beaten.filter(id => !had.has(id) && now.levels[id]);
        const verified = n.verified.filter(id => !had.has(id) && now.levels[id] && prev.levels[id]);
        if (beat.length || verified.length) gains.push({ docId, n, p, beat, all: [...beat, ...verified] });
        for (const id of had) if (!has.has(id) && now.levels[id]) losses.push({ n, id });
    }
    const subLines = [];
    if (gains.length && detailed) {
        gains.sort((a, b) => b.n.plp - a.n.plp);
        subLines.push(`Accepted submission${gains.reduce((k, g) => k + g.all.length, 0) === 1 ? '' : 's'}:`);
        for (const g of gains) {
            const d = g.n.plp - (g.p.plp || 0);
            subLines.push(`- ${ply(g.n.name)}: ${joinList([...g.all].sort(byRank(now)).map(id => lvl(id)))} (**${g.n.plp}PLP**, ${d >= 0 ? '+' : ''}${d})`);
        }
    } else if (gains.length) {
        gains.sort((a, b) => a.n.name.localeCompare(b.n.name));
        if (gains.length === 1 && gains[0].all.length === 1) subLines.push(`${lvl(gains[0].all[0])} submission by ${ply(gains[0].n.name)} has been accepted.`);
        else if (gains.length === 1) subLines.push(`Several submissions by ${ply(gains[0].n.name)} have been accepted.`);
        else subLines.push(`Submissions by ${joinList(gains.map(g => ply(g.n.name)))} were accepted.`);
    }
    for (const { n, id } of losses) subLines.push(`${ply(n.name)}'s completion of ${lvl(id)} has been removed.`);
    if (subLines.length) P.push(subLines.join('\n'));

    // players
    const cheers = [];
    if (prev.topPlayer && now.topPlayer && prev.topPlayer !== now.topPlayer) {
        const a = now.players[now.topPlayer], b = now.players[prev.topPlayer] || prev.players[prev.topPlayer];
        cheers.push(`${ply(a.name)} (**${a.plp}PLP**) is the new #1 player, taking the spot from ${ply(b.name)}!`);
    }
    for (const { n, p, beat } of gains) {
        if (!beat.length || n.rank === 1 && now.topPlayer !== prev.topPlayer) continue;
        const firsts = beat.filter(id => prev.levels[id] && !prevBeatenBy.has(id)).sort(byRank(now));
        const hardest = (firsts.length ? firsts : [...beat].sort(byRank(now)))[0];
        const newcomer = n.rank && !p.rank && !p.plp;
        const rankUp = n.rank && p.rank && n.rank < p.rank;
        if (!firsts.length && !newcomer && !(rankUp && n.rank <= 10)) continue;
        let line = `Congratulations to ${ply(n.name)} (**${n.plp}PLP**) for beating ${lvl(hardest)}`;
        if (firsts.length) line += firsts.length > 1 ? `, making them the first victor of ${firsts.length} levels` : ', making them the first victor of the level';
        if (newcomer) line += `, which puts them on the Leaderboards at #${n.rank}. Welcome!`;
        else if (rankUp) line += `${firsts.length ? ' which' : ', which'} pushes them into the #${n.rank} spot of the Leaderboards.`;
        else line += '.';
        cheers.push(line);
    }
    for (const [docId, n] of Object.entries(now.players)) {
        const p = prev.players[docId];
        if (p && p.name !== n.name) cheers.push(`${it(p.name)} is now known as ${ply(n.name)}.`);
        if (p && p.retired !== undefined && p.retired !== n.retired) cheers.push(n.retired ? `${ply(n.name)} has retired from the Leaderboards. Thank you for everything!` : `${ply(n.name)} is back on the Leaderboards!`);
        const before = Math.floor((p?.plp || 0) / 1000), after = Math.floor(n.plp / 1000);
        if (after > before && after >= 1) {
            const mark = after * 1000;
            const first = !Object.entries(prev.players).some(([id, x]) => id !== docId && x.plp >= mark);
            cheers.push(`${ply(n.name)} also hits **${n.plp}PLP**, ${first ? `making them the first player to surpass the ${mark}PLP mark` : `passing the ${mark}PLP mark`}.`);
        }
    }
    if (cheers.length) P.push(cheers.join('\n'));

    if (detailed) {
        const moves = Object.entries(now.players)
            .map(([id, n]) => ({ n, p: prev.players[id] }))
            .filter(({ n, p }) => n.rank && p && p.rank !== n.rank)
            .sort((a, b) => a.n.rank - b.n.rank);
        if (moves.length) P.push(['Leaderboard changes:', ...moves.map(({ n, p }) =>
            `- ${ply(n.name)}: ${p.rank ? `#${p.rank}` : 'new'} → **#${n.rank}** (${n.plp}PLP)`)].join('\n'));
    }

    if (newTop) {
        const oldName = (now.levels[prev.top1] || prev.levels[prev.top1]).name;
        const a = periodName(oldName) || '[Old Period]', b = periodName(now.levels[now.top1].name) || '[New Period]';
        if (a.startsWith('[') || b.startsWith('[')) notes.push('The Period name couldn\'t be guessed from the level name. Fill it in.');
        P.push(`${a} Period is over (${top1SinceMs ? duration(top1SinceMs, nowMs) : '[duration]'}). Welcome to the ${b} Period.`);
    }

    if (!P.length) { P.push('(Nothing changed since then.)'); notes.push('Nothing changed, so there is nothing to announce.'); }
    const major = pingMajor || '@Major List Changes Ping', minor = pingMinor || '@Minor List Changes Ping';
    P.push(kind === 'everyone' ? '@everyone' : kind === 'major' ? `${major}\n${minor}` : minor);
    return { paragraphs: P, notes, kind, autoKind };
}

// packs paragraphs into discord messages under the limit, pings always at the end
export function splitMessages(paragraphs, limit = 2000) {
    const msgs = [];
    let cur = '';
    const push = () => { if (cur) msgs.push(cur); cur = ''; };
    const add = (chunk, sep) => {
        if (!cur) { cur = chunk; return; }
        if ((cur + sep + chunk).length <= limit) cur += sep + chunk;
        else { push(); cur = chunk; }
    };
    for (const para of paragraphs) {
        if (para.length <= limit) { add(para, '\n\n'); continue; }
        // paragraph too long on its own, split it by lines
        const lines = para.split('\n');
        let first = true;
        for (let line of lines) {
            while (line.length > limit) { add(line.slice(0, limit), first ? '\n\n' : '\n'); line = line.slice(limit); first = false; }
            add(line, first ? '\n\n' : '\n');
            first = false;
        }
    }
    push();
    return msgs;
}
