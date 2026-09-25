import { confidence, detection, finite, matchEvents, options, ratio } from './common.ts';
import type { ConfidenceObservation, EvaluationOptions, Harmony, LabelSegment } from './types.ts';

function sorted(segments: readonly LabelSegment[]) {
  const result = [...segments].sort((a, b) => a.start - b.start);
  result.forEach((segment, i) => {
    finite(segment.start, 'segment.start', 0); finite(segment.end, 'segment.end', 0); confidence(segment.confidence);
    if (segment.end <= segment.start || (i > 0 && segment.start < result[i - 1].end)) throw new RangeError('Label segments must have positive duration and cannot overlap');
    if (segment.label !== null && (typeof segment.label !== 'string' || !segment.label.length)) throw new TypeError('Labels must be nonempty strings or null');
    if (segment.top2 && (segment.top2.length > 2 || new Set(segment.top2).size !== segment.top2.length || segment.top2.some(label => typeof label !== 'string' || !label.length))) throw new RangeError('top2 must contain at most two distinct nonempty labels');
  });
  return result;
}
function scoreLabels(reference: readonly LabelSegment[], predicted: readonly LabelSegment[]) {
  let duration = 0, covered = 0, correct = 0, top2 = 0;
  const confusionMatrix: { reference: string | null; predicted: string | null; missing: boolean; seconds: number }[] = [];
  const observations: ConfidenceObservation[] = [];
  for (const r of reference) {
    const boundaries = [...new Set([r.start, r.end, ...predicted.flatMap(p => [p.start, p.end]).filter(t => t > r.start && t < r.end)])].sort((a, b) => a - b);
    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i], weight = boundaries[i + 1] - start;
      const p = predicted.find(candidate => candidate.start <= start && candidate.end > start);
      const isCorrect = p !== undefined && r.label === p.label;
      duration += weight;
      if (p) covered += weight;
      if (isCorrect) correct += weight;
      if (p && (p.top2 ? r.label !== null && p.top2.includes(r.label) : isCorrect)) top2 += weight;
      const row = confusionMatrix.find(row => row.reference === r.label && row.predicted === (p?.label ?? null) && row.missing === !p);
      if (row) row.seconds += weight;
      else confusionMatrix.push({ reference: r.label, predicted: p?.label ?? null, missing: !p, seconds: weight });
      if (p?.confidence !== undefined) observations.push({ confidence: p.confidence, correct: isCorrect, weight });
    }
  }
  return { accuracy: ratio(correct, duration), top2Accuracy: ratio(top2, duration), confusionMatrix,
    referenceSeconds: duration, coveredSeconds: covered, coverage: ratio(covered, duration), observations };
}
function transitions(segments: readonly LabelSegment[]) {
  return segments.flatMap((segment, i) => i && segments[i - 1].end === segment.start && segments[i - 1].label !== segment.label
    ? [{ time: segment.start, from: segments[i - 1].label, to: segment.label }] : []);
}
export function scoreHarmony(reference: Harmony, predicted: Harmony, overrides: Partial<EvaluationOptions> = {}) {
  const config = options(overrides);
  const rc = sorted(reference.chords), pc = sorted(predicted.chords), rk = sorted(reference.keys), pk = sorted(predicted.keys);
  const chords = scoreLabels(rc, pc), keys = scoreLabels(rk, pk);
  const rt = transitions(rk), pt = transitions(pk);
  const pairs = matchEvents(rt, pt, (a, b) => a.from === b.from && a.to === b.to && Math.abs(a.time - b.time) <= config.keyTransitionToleranceSeconds);
  return { metrics: { chordAccuracy: chords.accuracy, top2Accuracy: chords.top2Accuracy,
    chordConfusionMatrix: chords.confusionMatrix, chordReferenceSeconds: chords.referenceSeconds, chordCoverage: chords.coverage,
    tonalCenterAccuracy: keys.accuracy, keyReferenceSeconds: keys.referenceSeconds, keyCoverage: keys.coverage,
    // Intersection over union penalizes both missed and spurious transitions.
    keyTransitionAccuracy: ratio(pairs.length, rt.length + pt.length - pairs.length),
    keyTransitions: detection(pairs.length, rt.length, pt.length) },
    chordObservations: chords.observations, keyObservations: keys.observations };
}
export const evaluateHarmony = (reference: Harmony, predicted: Harmony, config: Partial<EvaluationOptions> = {}) => scoreHarmony(reference, predicted, config).metrics;
export type HarmonyMetrics = ReturnType<typeof evaluateHarmony>;
