import { confidence, detection, finite, matchEvents, mean, options, ratio } from './common.ts';
import type { ConfidenceObservation, EvaluationOptions, Note } from './types.ts';

function sorted(notes: readonly Note[]) {
  for (const note of notes) {
    finite(note.start, 'note.start', 0); finite(note.end, 'note.end', 0); finite(note.midi, 'note.midi'); confidence(note.confidence);
    if (note.end <= note.start) throw new RangeError('Note end must follow start');
  }
  return [...notes].sort((a, b) => a.start - b.start || a.end - b.end || a.midi - b.midi);
}
export function scoreMelody(reference: readonly Note[], predicted: readonly Note[], overrides: Partial<EvaluationOptions> = {}) {
  const r = sorted(reference), p = sorted(predicted), config = options(overrides);
  const pitchMatches = (a: Note, b: Note) => Math.abs(a.midi - b.midi) * 100 <= config.pitchToleranceCents;
  const onsetMatches = (a: Note, b: Note) => pitchMatches(a, b) && Math.abs(a.start - b.start) <= config.onsetToleranceSeconds;
  const timing = matchEvents(r, p, onsetMatches);
  const pairs = matchEvents(r, p, (a, b) => onsetMatches(a, b) && Math.abs(a.end - b.end) <= Math.max(config.offsetToleranceSeconds, config.offsetToleranceRatio * (a.end - a.start)));
  const matchedPredictions = new Set(pairs.map(([, j]) => j));
  const matchedReferences = new Map(pairs);
  let continuous = 0;
  for (let i = 1; i < r.length; i++) {
    const previous = matchedReferences.get(i - 1), current = matchedReferences.get(i);
    if (previous !== undefined && current === previous + 1 &&
      Math.abs((p[current].midi - p[previous].midi) - (r[i].midi - r[i - 1].midi)) * 100 <= config.pitchToleranceCents) continuous++;
  }
  // Splitting a reference note into multiple overlapping same-pitch detections is fragmentation.
  const fragments = r.reduce((sum, note) => sum + Math.max(0, p.filter(candidate => pitchMatches(note, candidate) && candidate.start < note.end && candidate.end > note.start).length - 1), 0);
  const observations: ConfidenceObservation[] = p.flatMap((note, j) => note.confidence === undefined ? [] : [{ confidence: note.confidence, correct: matchedPredictions.has(j) }]);
  return { metrics: { notes: detection(pairs.length, r.length, p.length),
    onsetError: mean(timing.map(([i, j]) => Math.abs(p[j].start - r[i].start))),
    offsetError: mean(timing.map(([i, j]) => Math.abs(p[j].end - r[i].end))), timingMatchedNotes: timing.length,
    pitchPathContinuity: ratio(continuous, Math.max(0, r.length - 1)),
    trackFragmentation: ratio(fragments, r.length), excessFragments: fragments }, observations };
}
export const evaluateMelody = (reference: readonly Note[], predicted: readonly Note[], config: Partial<EvaluationOptions> = {}) => scoreMelody(reference, predicted, config).metrics;
export type MelodyMetrics = ReturnType<typeof evaluateMelody>;
