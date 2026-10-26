// announce tab. compares the list now vs the last announcement (or a snapshot) and spits out the discord post
// the actual logic is in announce-core.js
import { db } from '../firebase-config.js';
import { collection, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp, Timestamp }
    from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { buildState, buildPost, splitMessages } from './announce-core.js';

// role pings (so they actually ping when pasted)
const PING_MAJOR = '<@&1291483903818989659>';
const PING_MINOR = '<@&1292021069192101898>';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pref = (k, d) => { try { return localStorage.getItem('kl-ann-' + k) ?? d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem('kl-ann-' + k, v); } catch { } };

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

// first time there's no saved state so we start from a snapshot
// completions back then = completions now minus whatever the change log says got added since
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
    // old snapshots dont have badges/credits so dont compare those
    const st = buildState(snapLevels, playersThen);
    for (const l of Object.values(st.levels)) { delete l.badges; delete l.creator; delete l.verifier; }
    for (const p of Object.values(st.players)) delete p.retired;
    return st;
}

function drawMessages(msgs, limit) {
    $('annOut').innerHTML = msgs.map((m, i) => `
        <div class="ann-msg" style="margin-top:12px">
            <div class="muted">Message ${i + 1} of ${msgs.length} · <span class="ann-count"></span></div>
            <textarea class="ann-text" rows="${Math.min(18, m.split('\n').length + 2)}" style="width:100%;font-family:inherit" spellcheck="false">${esc(m)}</textarea>
            <button class="hub-button ann-copy">Copy message ${i + 1}</button>
        </div>`).join('');
    $('annOut').querySelectorAll('.ann-msg').forEach(box => {
        const ta = box.querySelector('textarea'), c = box.querySelector('.ann-count');
        const upd = () => { const n = ta.value.length; c.innerHTML = `<span class="${n > limit ? 'bad' : 'ok'}">${n} / ${limit} characters</span>`; };
        ta.addEventListener('input', upd); upd();
        box.querySelector('.ann-copy').onclick = async () => {
            try { await navigator.clipboard.writeText(ta.value); box.querySelector('.ann-copy').textContent = 'Copied!'; }
            catch { ta.select(); }
        };
    });
}

export function initAnnounce({ levels, players, me }) {
    let saved = null, snaps = [], prev = null, now = null, prevTop1Since = null;
    $('annLimit').value = pref('limit', '2000');
    $('annLinks').value = pref('links', 'all');
    $('annEmbeds').checked = pref('noEmbeds', '1') === '1';

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

    function render() {
        if (!prev || !now) return;
        const limit = Number($('annLimit').value) || 2000;
        const { paragraphs, notes, kind, autoKind } = buildPost(prev, now, {
            kind: $('annKind').value, links: $('annLinks').value, noEmbeds: $('annEmbeds').checked,
            pingMajor: PING_MAJOR, pingMinor: PING_MINOR, top1SinceMs: prevTop1Since,
        });
        const msgs = splitMessages(paragraphs, limit);
        drawMessages(msgs, limit);
        const KIND = { everyone: '@everyone (new #1)', major: 'Major (both pings)', minor: 'Minor (Minor ping only, detailed)' };
        $('annKindNote').textContent = `Auto picked: ${KIND[autoKind]}${kind !== autoKind ? ` · using ${KIND[kind]} instead` : ''}`;
        $('annNotes').innerHTML = [
            msgs.length > 1 ? `Too long for one Discord message, so it's split into ${msgs.length}. Post them in order; the pings are in the last one.` : '',
            ...notes,
        ].filter(Boolean).map(n => `<div class="warn">⚠ ${esc(n)}</div>`).join('');
    }
    $('annKind').addEventListener('change', render);
    ['annLimit', 'annLinks', 'annEmbeds'].forEach(id => $(id).addEventListener('change', () => {
        keep('limit', $('annLimit').value); keep('links', $('annLinks').value); keep('noEmbeds', $('annEmbeds').checked ? '1' : '0');
        render();
    }));

    $('annBuild').onclick = async () => {
        $('annBuild').disabled = true;
        $('annStatus').innerHTML = '';
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
            render();
            $('annPlp').innerHTML = plpTable(prev, now);
            $('annMark').disabled = false;
        } catch (err) { $('annStatus').innerHTML = `<span class="bad">${esc(err.message)}</span>`; }
        $('annBuild').disabled = false;
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
            // not using logEntry here or it wipes everyone's cache
            const m = me();
            batch.set(doc(collection(db, 'changeLog')), { at: serverTimestamp(), by: m.uid, byName: m.name, action: 'announce', target: 'list changes', details: '' });
            await batch.commit();
            $('annStatus').innerHTML = '<span class="ok">Marked as announced. The next post starts from here.</span>';
            await load();
        } catch (err) { $('annStatus').innerHTML = `<span class="bad">${esc(err.message)}</span>`; $('annMark').disabled = false; }
    };

    document.querySelector('[data-tab="announce"]')?.addEventListener('click', () => { if (me()?.role === 'owner') load(); });
}
