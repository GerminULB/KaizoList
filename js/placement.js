export function placeLevel(levels, klp, self = null) {
    const others = levels.filter(l => !self || String(l.id) !== String(self.id));
    const myPos = self?.position ?? Infinity;
    const ahead = others.filter(l => l.klp > klp || (l.klp === klp && (l.position ?? 1e9) < myPos)).length;
    return { rank: ahead + 1, above: others[ahead - 1] || null, below: others[ahead] || null };
}

export function placementText(levels, klp, self, t, legacyCutoff = 100) {
    if (!Number.isFinite(klp) || klp < 0) return '';
    const { rank, above, below } = placeLevel(levels, klp, self);
    const lv = (l, r) => `${l.name} (#${r}, ${l.klp})`;
    let where;
    if (above && below) where = t('place_between', { a: lv(above, rank - 1), b: lv(below, rank + 1) });
    else if (below) where = t('place_top', { b: lv(below, rank + 1) });
    else if (above) where = t('place_bottom', { a: lv(above, rank - 1) });
    else where = '';
    const legacy = rank > legacyCutoff ? ' ' + t('place_legacy') : '';
    return t('place_line', { klp, rank, where }) + legacy;
}

const EN = {
    place_line: 'With {klp} KLP it would be #{rank}{where}.',
    place_between: ', between {a} and {b}',
    place_top: ', the new top level, above {b}',
    place_bottom: ', the last level, below {a}',
    place_legacy: '(That is in the Legacy List.)',
};
export const enT = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), EN[key] || key);
