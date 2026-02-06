//  constants
const PLP_DECAY = 0.15;  
const PLP_BASELINE = 5; 
const PLP_LOG_WEIGHT = 12;
const PLP_SQRT_WEIGHT = 4;

export function calculatePlayerScore(levelsCleared) {
  if (!levelsCleared || levelsCleared.length === 0) return 0;

  const klps = levelsCleared
    .map(l => Number(l.klp) || 0)
    .filter(k => k > 0)
    .sort((a, b) => b - a);

  if (klps.length === 0) return 0;


  const peakScore = PLP_A * Math.pow(klps[0], PLP_P);

  const consistencyScore =
    PLP_B *
    klps.reduce((acc, k, i) => {
      const baselineBoost =
        Math.pow(k + PLP_BASELINE, PLP_Q) -
        Math.pow(PLP_BASELINE, PLP_Q);

      const decay = Math.exp(-PLP_DECAY * i);
      return acc + baselineBoost * decay;
    }, 0);


  const m = klps.length;
  const breadthBonus =
    PLP_LOG_WEIGHT * Math.log(1 + m) +
    PLP_SQRT_WEIGHT * Math.sqrt(m);

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
      const baselineBoost =
        Math.pow(k + PLP_BASELINE, PLP_Q) -
        Math.pow(PLP_BASELINE, PLP_Q);

      const decay = Math.exp(-PLP_DECAY * i);
      return acc + baselineBoost * decay;
    }, 0);

  const m = klps.length;
  const breadth =
    PLP_LOG_WEIGHT * Math.log(1 + m) +
    PLP_SQRT_WEIGHT * Math.sqrt(m);

  return {
    total: peak + consistency + breadth,
    peak,
    consistency,
    breadth
  };
}

