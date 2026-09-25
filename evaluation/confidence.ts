import { confidence, finite, ratio } from './common.ts';
import type { ConfidenceObservation } from './types.ts';

export function evaluateConfidence(observations: readonly ConfidenceObservation[], binCount = 10) {
  if (!Number.isInteger(binCount) || binCount < 1 || binCount > 10000) throw new RangeError('binCount must be an integer from 1 to 10000');
  const bins = Array.from({ length: binCount }, (_, index) => ({
    lower: index / binCount, upper: (index + 1) / binCount, count: 0, weight: 0, confidenceSum: 0, correctSum: 0,
  }));
  let weight = 0, brier = 0, nll = 0;
  for (const observation of observations) {
    confidence(observation.confidence);
    if (typeof observation.confidence !== 'number' || typeof observation.correct !== 'boolean') throw new TypeError('Expected confidence and binary correctness');
    const w = observation.weight ?? 1;
    finite(w, 'weight', Number.MIN_VALUE);
    const p = observation.confidence, y = Number(observation.correct);
    const bin = bins[Math.min(binCount - 1, Math.floor(p * binCount))];
    bin.count++; bin.weight += w; bin.confidenceSum += w * p; bin.correctSum += w * y;
    weight += w; brier += w * (p - y) ** 2;
    // Preserve infinite loss for a confidently wrong prediction; no hidden clipping.
    nll += w * -Math.log(observation.correct ? p : 1 - p);
  }
  const reliabilityCurve = bins.map(bin => ({ lower: bin.lower, upper: bin.upper, count: bin.count,
    weight: bin.weight, meanConfidence: ratio(bin.confidenceSum, bin.weight), accuracy: ratio(bin.correctSum, bin.weight) }));
  const occupied = reliabilityCurve.filter(bin => bin.weight > 0);
  const gap = (bin: typeof reliabilityCurve[number]) => Math.abs(bin.meanConfidence! - bin.accuracy!);
  return { count: observations.length, weight, reliabilityCurve,
    ece: ratio(occupied.reduce((sum, bin) => sum + bin.weight * gap(bin), 0), weight),
    mce: occupied.length ? Math.max(...occupied.map(gap)) : null,
    brierScore: ratio(brier, weight), negativeLogLikelihood: ratio(nll, weight) };
}
export type ConfidenceMetrics = ReturnType<typeof evaluateConfidence>;
