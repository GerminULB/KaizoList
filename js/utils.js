// js/utils.js

export async function fetchJson(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.warn(`Failed to load ${path}`, e);
    return null;
  }
}

export function rankByKLP(levels) {
  if (!Array.isArray(levels)) return [];
  return [...levels]
    .sort((a, b) => b.klp - a.klp)
    .map((lvl, i) => ({ ...lvl, rank: i + 1 }));
}

export function splitNames(str) {
  return (str || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}
