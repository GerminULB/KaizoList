// For the buckos that's looking in the code

const PLP_N = 10;        // top N clears to count for consistency
const PLP_P = 0.85;     // peak exponent (jumper-friendly, sublinear)
const PLP_Q = 0.65;     // consistency exponent (grinder-friendly)
const PLP_A = 1.0;      // peak weight
const PLP_B = 0.6;      // consistency weight
const PLP_C = 20;       // breadth bonus multiplier

function calculatePlayerScore(levelsCleared) {
  // levelsCleared = array of { name, klp } objects
  if (!levelsCleared || levelsCleared.length === 0) return 0;

  const klps = levelsCleared
    .map(l => Number(l.klp) || 0)
    .filter(k => k > 0)
    .sort((a, b) => b - a);

  if (klps.length === 0) return 0;

  // Peak skill (single hardest clear)
  const peakScore = PLP_A * Math.pow(klps[0], PLP_P);

  // Consistency skill (top N clears, diminishing returns)
  const topKlps = klps.slice(0, PLP_N);
  const consistencyScore =
    PLP_B * topKlps.reduce((acc, k) => acc + Math.pow(k, PLP_Q), 0);

  // Breadth / activity bonus (log-scaled)
  const breadthBonus = PLP_C * Math.log(1 + klps.length);

  return peakScore + consistencyScore + breadthBonus;
}
