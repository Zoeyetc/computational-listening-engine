import { confidence, detection, finite, matchEvents, mean, median, options } from './common.ts';
import type { ConfidenceObservation, EvaluationOptions, Rhythm } from './types.ts';

function validate(rhythm: Rhythm) {
  if (rhythm.bpm !== null) finite(rhythm.bpm, 'bpm', Number.MIN_VALUE);
  confidence(rhythm.confidence);
  rhythm.beats.forEach(time => finite(time, 'beat.time', 0));
}
export function scoreRhythm(reference: Rhythm, predicted: Rhythm, overrides: Partial<EvaluationOptions> = {}) {
  validate(reference); validate(predicted);
  const config = options(overrides);
  const r = [...reference.beats].sort((a, b) => a - b), p = [...predicted.beats].sort((a, b) => a - b);
  const pairs = matchEvents(r, p, (a, b) => Math.abs(a - b) <= config.beatToleranceSeconds);
  const offsets = pairs.map(([i, j]) => p[j] - r[i]);
  const tempoErrorBpm = reference.bpm !== null && predicted.bpm !== null ? Math.abs(predicted.bpm - reference.bpm) : null;
  const observations: ConfidenceObservation[] = reference.bpm !== null && predicted.bpm !== null && predicted.confidence !== undefined
    ? [{ confidence: predicted.confidence, correct: tempoErrorBpm! <= config.tempoToleranceBpm }] : [];
  return { metrics: { tempoErrorBpm, tempoReferenceAvailable: reference.bpm !== null, tempoPredictionAvailable: predicted.bpm !== null,
    beats: detection(pairs.length, r.length, p.length), beatAlignmentError: mean(offsets.map(Math.abs)), medianBeatOffset: median(offsets) }, observations };
}
export const evaluateRhythm = (reference: Rhythm, predicted: Rhythm, config: Partial<EvaluationOptions> = {}) => scoreRhythm(reference, predicted, config).metrics;
export type RhythmMetrics = ReturnType<typeof evaluateRhythm>;
