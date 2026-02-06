// ===== legacy tuning constants =====
const PLP_P = 0.85;
const PLP_Q = 0.65;
const PLP_A = 1.0;
const PLP_B = 0.6;

// ===== new tuning =====
const PLP_EARLY_BONUS = 0.6;
const PLP_EARLY_WINDOW = 12;
const PLP_VOLUME_WEIGHT = 0.06;
const PLP_RECENT_RATIO = 0.10; // latest 10%

export function calculatePlayerScore(levelsCleared) {
  if (!levelsCleared || levelsCleared.length === 0) return 0;

  const klps = levelsCleared
    .map(l => Number(l.klp) || 0)
    .filter(k => k > 0)
    .sort((a, b) => b - a);

  if (klps.length === 0) return 0;

  // ===== peak =====
  const peakScore = PLP_A * Math.pow(klps[0], PLP_P);

  // ===== consistency =====
  const consistencyScore =
    PLP_B *
    klps.reduce((acc, k, i) => {
      const base = Math.pow(k, PLP_Q);
      const earlyFactor =
        i < PLP_EARLY_WINDOW
          ? 1 + PLP_EARLY_BONUS * (1 - i / PLP_EARLY_WINDOW)
          : 1;
      return acc + base * earlyFactor;
    }, 0);

  // ===== recent volume bonus =====
  const recentCount = Math.max(1, Math.ceil(klps.length * PLP_RECENT_RATIO));
  const recentKlps = klps.slice(0, recentCount);
  const recentEffort = recentKlps.reduce((a, b) => a + b, 0);

  const breadthBonus = PLP_VOLUME_WEIGHT * Math.sqrt(recentEffort);

  return peakScore + consistencyScore + breadthBonus;
}

export function calculatePlayerScoreBreakdown(levelsCleared) {
  if (!levelsCleared || levelsCleared.length === 0) {
    return { total: 0, peak: 0, consistency: 0, breadth: 0 };
  }

  const klps = levelsCleared
    .map(l => Number(l.klp) || 0)
    .filter(k => k > 0)
    .sort((a, b) => b - a);

  if (klps.length === 0) {
    return { total: 0, peak: 0, consistency: 0, breadth: 0 };
  }

  const peak = PLP_A * Math.pow(klps[0], PLP_P);

  const consistency =
    PLP_B *
    klps.reduce((acc, k, i) => {
      const base = Math.pow(k, PLP_Q);
      const earlyFactor =
        i < PLP_EARLY_WINDOW
          ? 1 + PLP_EARLY_BONUS * (1 - i / PLP_EARLY_WINDOW)
          : 1;
      return acc + base * earlyFactor;
    }, 0);

  const recentCount = Math.max(1, Math.ceil(klps.length * PLP_RECENT_RATIO));
  const recentEffort = klps
    .slice(0, recentCount)
    .reduce((a, b) => a + b, 0);

  const breadth = PLP_VOLUME_WEIGHT * Math.sqrt(recentEffort);

  return {
    total: peak + consistency + breadth,
    peak,
    consistency,
    breadth
  };
}
