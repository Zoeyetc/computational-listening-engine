import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, evaluatePitch, evaluateMelody, evaluateRhythm, evaluateHarmony, evaluateConfidence } from '../evaluation/index.ts';

const near = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const note = (start: number, end: number, midi = 60) => ({ start, end, midi });
const label = (start: number, end: number, text: string | null) => ({ start, end, label: text });

test('pitch: known cent, octave, voicing errors and confusion orientation', () => {
  const truth = [60, 60, 60, null, null].map((midi, time) => ({ time, midi }));
  const prediction = [60.25, 72, null, 60, null].map((midi, time) => ({ time, midi }));
  const result = evaluatePitch(truth, prediction);
  near(result.pitchAccuracy, 1 / 3); near(result.centError, 612.5); near(result.octaveErrorRate, 0.5);
  near(result.voiced.precision, 2 / 3); near(result.voiced.recall, 2 / 3); near(result.voiced.f1, 2 / 3);
  assert.deepEqual(result.confusionMatrix, { voicedVoiced: 2, voicedUnvoiced: 1, unvoicedVoiced: 1, unvoicedUnvoiced: 1 });
  near(evaluatePitch([{ time: 0, midi: 72 }], [{ time: 0, midi: 60 }]).octaveErrorRate, 1);
});

test('pitch: alignment tolerance, missing frames and empty denominators are explicit', () => {
  const truth = [{ time: 0, midi: 60 }, { time: 1, midi: 62 }];
  const result = evaluatePitch(truth, [{ time: 0.025, midi: 60 }, { time: 1.1, midi: 62 }]);
  near(result.pitchAccuracy, 0.5); near(result.alignmentCoverage, 0.5);
  near(evaluatePitch(truth, []).voiced.recall, 0);
  assert.equal(evaluatePitch([], []).pitchAccuracy, null);
  assert.equal(evaluatePitch([{ time: 0, midi: null }], []).centError, null);
  assert.throws(() => evaluatePitch([{ time: 1, midi: 60 }, { time: 0, midi: 60 }], []), /increasing/);
  assert.throws(() => evaluatePitch([{ time: 0, midi: NaN }], []), /finite/);
});

test('melody: perfect, duplicate, fragmented, missed and offset-only failures', () => {
  const truth = [note(0, 1), note(1, 2, 62)];
  const perfect = evaluateMelody(truth, truth);
  near(perfect.notes.f1, 1); near(perfect.pitchPathContinuity, 1); near(perfect.trackFragmentation, 0);
  const duplicates = evaluateMelody([note(0, 1)], [note(0, 1), note(0, 1)]);
  near(duplicates.notes.precision, 0.5); near(duplicates.notes.recall, 1);
  const split = evaluateMelody([note(0, 1)], [note(0, 0.5), note(0.5, 1)]);
  near(split.trackFragmentation, 1); near(split.notes.f1, 0); near(split.offsetError, 0.5);
  const late = evaluateMelody([note(0, 1)], [note(0.02, 1.5)]);
  near(late.notes.recall, 0); near(late.onsetError, 0.02); near(late.offsetError, 0.5);
  near(evaluateMelody(truth, []).pitchPathContinuity, 0);
  assert.equal(evaluateMelody([], []).notes.f1, null);
  assert.throws(() => evaluateMelody([note(1, 0)], []), /end/);
});

test('event matching finds maximum cardinality when greedy first match would fail', () => {
  const result = evaluateRhythm({ bpm: 120, beats: [0.1, 0.2] }, { bpm: 120, beats: [0.05, 0.12] }, { beatToleranceSeconds: 0.1 });
  assert.equal(result.beats.matches, 2);
  const notes = evaluateMelody([note(0.1, 1.1), note(0.2, 1.2)], [note(0.12, 1.12), note(0.05, 1.05)], { onsetToleranceSeconds: 0.1 });
  assert.equal(notes.notes.matches, 2);
});

test('rhythm: signed median offset, absolute alignment, tempo and duplicate penalties', () => {
  const result = evaluateRhythm({ bpm: 120, beats: [1, 2, 3] }, { bpm: 123, beats: [1.02, 2.04, 3.06, 3.06] });
  near(result.tempoErrorBpm, 3); near(result.beats.precision, 0.75); near(result.beats.recall, 1);
  near(result.beatAlignmentError, 0.04); near(result.medianBeatOffset, 0.04);
  near(evaluateRhythm({ bpm: null, beats: [1] }, { bpm: null, beats: [0.98] }).medianBeatOffset, -0.02);
  const missed = evaluateRhythm({ bpm: 120, beats: [1] }, { bpm: null, beats: [] });
  assert.equal(missed.tempoErrorBpm, null); assert.equal(missed.tempoPredictionAvailable, false); near(missed.beats.f1, 0);
});

test('harmony: duration weighting, ranked top two, confusion matrix and missing coverage', () => {
  const reference = { chords: [label(0, 3, 'C'), label(3, 4, 'G')], keys: [] };
  const predicted = { chords: [label(0, 3, 'C'), { ...label(3, 4, 'D'), top2: ['D', 'G'] }], keys: [] };
  const result = evaluateHarmony(reference, predicted);
  near(result.chordAccuracy, 0.75); near(result.top2Accuracy, 1);
  assert.deepEqual(result.chordConfusionMatrix, [
    { reference: 'C', predicted: 'C', missing: false, seconds: 3 },
    { reference: 'G', predicted: 'D', missing: false, seconds: 1 },
  ]);
  const gaps = evaluateHarmony({ chords: [label(0, 2, null)], keys: [] }, { chords: [label(0, 1, null)], keys: [] });
  near(gaps.chordAccuracy, 0.5); near(gaps.chordCoverage, 0.5);
  assert.equal(gaps.chordConfusionMatrix[1].missing, true);
  assert.throws(() => evaluateHarmony({ chords: [label(0, 2, 'C'), label(1, 3, 'G')], keys: [] }, predicted), /overlap/);
});

test('harmony: exact key identity and transition accuracy penalize spurious changes', () => {
  const result = evaluateHarmony({ chords: [], keys: [label(0, 2, 'C:major'), label(2, 4, 'G:major')] }, {
    chords: [], keys: [label(0, 2, 'C:major'), label(2, 3, 'G:major'), label(3, 4, 'G:minor')],
  });
  near(result.tonalCenterAccuracy, 0.75); near(result.keyTransitionAccuracy, 0.5);
  assert.equal(result.keyTransitions.matches, 1);
  assert.equal(evaluateHarmony({ chords: [], keys: [] }, { chords: [], keys: [] }).keyTransitionAccuracy, null);
});

test('confidence: calibrated 0.80 group, weighted bins, bin boundaries and analytic losses', () => {
  const result = evaluateConfidence(Array.from({ length: 10 }, (_, i) => ({ confidence: 0.8, correct: i < 8 })));
  near(result.ece, 0); near(result.mce, 0); near(result.brierScore, 0.16);
  near(result.negativeLogLikelihood, -(0.8 * Math.log(0.8) + 0.2 * Math.log(0.2)));
  assert.equal(result.reliabilityCurve[8].count, 10); near(result.reliabilityCurve[8].accuracy, 0.8);
  const weighted = evaluateConfidence([{ confidence: 0.8, correct: true, weight: 4 }, { confidence: 0.8, correct: false }]);
  near(weighted.ece, 0); near(weighted.brierScore, 0.16);
  const endpoints = evaluateConfidence([{ confidence: 0, correct: false }, { confidence: 1, correct: true }]);
  near(endpoints.negativeLogLikelihood, 0); assert.equal(endpoints.reliabilityCurve[9].count, 1);
  const wrong = evaluateConfidence([{ confidence: 1, correct: false }]);
  near(wrong.ece, 1); near(wrong.mce, 1); near(wrong.brierScore, 1); assert.equal(wrong.negativeLogLikelihood, Infinity);
  assert.equal(evaluateConfidence([]).ece, null);
  assert.throws(() => evaluateConfidence([{ confidence: 1.1, correct: true }]), /confidence/);
  assert.throws(() => evaluateConfidence([{ confidence: 0.5, correct: true, weight: 0 }]), /weight/);
  assert.throws(() => evaluateConfidence([], 0), /binCount/);
});

test('confidence: ECE weights bins while MCE finds worst occupied bin', () => {
  const result = evaluateConfidence([{ confidence: 0.2, correct: true }, { confidence: 0.9, correct: true }, { confidence: 0.9, correct: true }]);
  near(result.ece, 1 / 3); near(result.mce, 0.8);
});

test('evaluation: omitted annotation differs from missing output and claims stay domain-specific', () => {
  const missing = evaluate({ pitch: [{ time: 0, midi: 60 }], melody: [note(0, 1)] }, {});
  near(missing.pitch!.pitchAccuracy, 0); near(missing.melody!.notes.recall, 0);
  assert.equal(missing.rhythm, null); assert.equal(missing.confidence.pitch.count, 0);
  const result = evaluate({ pitch: [{ time: 0, midi: 60 }], melody: [note(0, 1)], harmony: { chords: [label(0, 2, 'C')], keys: [] } }, {
    pitch: [{ time: 0, midi: 72, confidence: 0.8 }], melody: [{ ...note(0, 1), confidence: 0.8 }],
    harmony: { chords: [{ ...label(0, 2, 'C'), confidence: 0.8 }], keys: [] },
  });
  near(result.confidence.pitch.ece, 0.8); near(result.confidence.melody.ece, 0.2);
  near(result.confidence.chords.weight, 2);
});

test('evaluation is deterministic, accepts frozen data, and rejects invalid tolerances', () => {
  const frames = Object.freeze([Object.freeze({ time: 0, midi: 60 })]);
  const truth = Object.freeze({ pitch: frames });
  assert.deepEqual(evaluate(truth, truth), evaluate(truth, truth));
  assert.throws(() => evaluate(truth, truth, { beatToleranceSeconds: -1 }), /beatToleranceSeconds/);
  assert.throws(() => evaluate(truth, truth, { pitchToleranceCents: NaN }), /pitchToleranceCents/);
});
