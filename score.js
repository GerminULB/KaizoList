// Constants
const PLP_N = 10;
const PLP_P = 0.85;
const PLP_Q = 0.65;
const PLP_A = 1.0;
const PLP_B = 0.6;
const PLP_C = 20;

// Existing function (UNCHANGED)
export function calculatePlayerScore(levelsCleared) {
  if (!levelsCleared || levelsCleared.length === 0) return 0;

  const klps = levelsCleared
    .map(l => Number(l.klp) || 0)
    .filter(k => k > 0)
    .sort((a, b) => b - a);

  if (klps.length === 0) return 0;

  const peakScore = PLP_A * Math.pow(klps[0], PLP_P);
  const topKlps = klps.slice(0, PLP_N);
  const consistencyScore =
    PLP_B * topKlps.reduce((acc, k) => acc + Math.pow(k, PLP_Q), 0);
  const breadthBonus = PLP_C * Math.log(1 + klps.length);

  return peakScore + consistencyScore + breadthBonus;
}

// NEW helper (safe)
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
  const topKlps = klps.slice(0, PLP_N);
  const consistency =
    PLP_B * topKlps.reduce((acc, k) => acc + Math.pow(k, PLP_Q), 0);
  const breadth = PLP_C * Math.log(1 + klps.length);

  return {
    total: peak + consistency + breadth,
    peak,
    consistency,
    breadth
  };
}
