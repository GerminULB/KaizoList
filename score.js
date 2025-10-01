const PLP_N = 10;         // top N clears to count
const PLP_ALPHA = 1.25;   // superlinear exponent
const PLP_BETA = 20;      // breadth bonus multiplier

function calculatePlayerScore(levelsCleared) {
  // levelsCleared = array of { name, klp } objects
  if (!levelsCleared || levelsCleared.length === 0) return 0;

  const klps = levelsCleared
    .map(l => Number(l.klp) || 0)
    .sort((a, b) => b - a);

  const topKlps = klps.slice(0, PLP_N);
  const sumTop = topKlps.reduce((acc, k) => acc + Math.pow(k, PLP_ALPHA), 0);
  const breadthBonus = PLP_BETA * Math.log(1 + klps.length);

  return sumTop + breadthBonus;
}
