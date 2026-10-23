const LINES = require('./lines.js');
const { calculatePlayerScore } = require('./score.js');

const SITE = 'https://kaizolist.com';
const LEGACY_AFTER = 100;
const levelLink = (id) => `${SITE}/LevelDetails.html?id=${encodeURIComponent(id)}`;
const playerLink = (name) => `${SITE}/PlayerDetails.html?name=${encodeURIComponent(name)}`;

function fill(line, vars) {
    let missing = false;
    const out = line.replace(/\{(\w+)\}/g, (_, k) => {
        if (vars[k] === undefined || vars[k] === null || vars[k] === '') { missing = true; return ''; }
        return String(vars[k]);
    });
    return missing ? null : out;
}

function pickLine(type, vars, rnd = Math.random) {
    const usable = (LINES[type] || []).map(l => fill(l, vars)).filter(Boolean);
    return usable.length ? usable[Math.floor(rnd() * usable.length)] : null;
}

function rankLevels(levels) {
    return levels.map(l => ({ ...l, id: String(l.id), klp: Number(l.klp) || 0, position: Number.isFinite(l.position) ? l.position : 1e9 }))
        .sort((a, b) => (b.klp - a.klp) || (a.position - b.position) || String(a.name).localeCompare(String(b.name)))
        .map((l, i) => ({ ...l, rank: i + 1 }));
}

function rankPlayers(players, ranked) {
    const byId = new Map(ranked.map(l => [l.id, l]));
    const scored = players.filter(p => !p.retired && p.username).map(p => {
        const done = [...(p.verifiedLevels || []), ...(p.beatenLevels || [])].map(id => byId.get(String(id))).filter(Boolean);
        return { docId: p.docId, name: p.username, plp: done.length ? calculatePlayerScore(done) : 0 };
    }).filter(p => p.plp > 0).sort((a, b) => b.plp - a.plp);
    return new Map(scored.map((p, i) => [p.docId, { ...p, rank: i + 1 }]));
}

const hasLevel = (p, id) => (p.beatenLevels || []).map(String).includes(id) || (p.verifiedLevels || []).map(String).includes(id);

function snapshot(ranked, pranks) {
    return {
        levels: Object.fromEntries(ranked.map(l => [l.id, { rank: l.rank, klp: l.klp, name: l.name }])),
        players: Object.fromEntries([...pranks.values()].map(p => [p.docId, { rank: p.rank, name: p.name }])),
        top1: ranked[0]?.id || null,
    };
}

function diffEvents(prev, ranked, pranks) {
    const events = [];
    const now = Object.fromEntries(ranked.map(l => [l.id, l]));
    const top = ranked[0];
    const newTop = top && prev.top1 && top.id !== prev.top1;
    if (newTop) events.push({ to: 'all', type: 'new_top1', link: levelLink(top.id), vars: { level: top.name, old_level: prev.levels[prev.top1]?.name || now[prev.top1]?.name } });
    for (const l of ranked) {
        const before = prev.levels[l.id];
        if (!before) {
            if (!(newTop && l.id === top.id)) events.push({ to: 'all', type: 'new_level', link: levelLink(l.id), vars: { level: l.name, creator: l.creator, rank: l.rank, klp: l.klp } });
            continue;
        }
        if (l.rank > 95 && l.rank <= LEGACY_AFTER && before.rank <= 95) events.push({ to: 'unbeaten', level: l.id, type: 'legacy_soon', link: levelLink(l.id), vars: { level: l.name, rank: l.rank } });
        if (l.rank > LEGACY_AFTER && before.rank <= LEGACY_AFTER) events.push({ to: 'beaten', level: l.id, type: 'legacy_gone', link: levelLink(l.id), vars: { level: l.name } });
        if (l.klp !== before.klp) events.push({ to: 'beaten', level: l.id, type: 'klp_change', link: levelLink(l.id), vars: { level: l.name, old: before.klp, new: l.klp } });
    }
    for (const [docId, p] of pranks) {
        const before = prev.players[docId];
        if (!before) continue;
        if (p.rank < before.rank) {
            events.push({ to: docId, type: p.rank <= 10 && before.rank > 10 ? 'top10' : 'rank_up', link: playerLink(p.name), vars: { rank: p.rank, old_rank: before.rank } });
        } else if (p.rank > before.rank) {
            const rival = [...pranks.values()].filter(r => r.docId !== docId && prev.players[r.docId] && prev.players[r.docId].rank > before.rank && r.rank < p.rank)
                .sort((a, b) => a.rank - b.rank)[0];
            if (rival) events.push({ to: docId, type: 'passed_by', link: playerLink(rival.name), vars: { rival: rival.name, rank: rival.rank } });
        }
    }
    return events;
}

function reaches(event, uid, player) {
    if (event.to === 'all') return true;
    if (event.to === 'beaten') return hasLevel(player, event.level);
    if (event.to === 'unbeaten') return !hasLevel(player, event.level);
    return event.to === uid;
}

const PRIORITY = ['new_top1', 'sub_accepted', 'sub_rejected', 'top10', 'passed_by', 'rank_up', 'reply', 'profile_comment', 'new_level', 'legacy_soon', 'legacy_gone', 'klp_change', 'away_30', 'away_7', 'away_3', 'filler'];
const byPriority = (a, b) => PRIORITY.indexOf(a.type) - PRIORITY.indexOf(b.type);

function berlin(date = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
        .formatToParts(date).map(p => [p.type, p.value]));
    return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function hash(text) {
    let h = 2166136261;
    for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    return h;
}

function fillerHours(uid, day) {
    return [10 + (hash(`${uid}|${day}|a`) % 6), 16 + (hash(`${uid}|${day}|b`) % 6)];
}

function awayType(days, stage) {
    if (days >= 30 && stage < 3) return ['away_30', 3];
    if (days >= 7 && stage < 2) return ['away_7', 2];
    if (days >= 3 && stage < 1) return ['away_3', 1];
    return null;
}

function personalVars(player, pranks, ranked, rnd = Math.random) {
    const p = pranks.get(player.docId);
    const open = ranked.filter(l => l.rank <= LEGACY_AFTER && !hasLevel(player, l.id));
    const pool = open.length ? open : ranked.filter(l => l.rank <= LEGACY_AFTER);
    return {
        name: player.username,
        rank: p?.rank,
        plp: p ? Math.round(p.plp) : undefined,
        level: pool.length ? pool[Math.floor(rnd() * pool.length)].name : undefined,
    };
}

module.exports = { SITE, fill, pickLine, rankLevels, rankPlayers, snapshot, diffEvents, reaches, byPriority, berlin, fillerHours, awayType, personalVars, levelLink, playerLink };
