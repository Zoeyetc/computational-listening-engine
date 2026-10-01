import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeDualPathListening,
  projectListeningRecordV1,
  type ListeningRecordV1,
} from '../src/index.ts';
import {
  analyzeListeningFieldFromAudio,
  projectListeningFieldRecordV1,
  type ListeningFieldRecordV1,
} from '../adapters/listening-field/index.ts';

type Frame = ListeningRecordV1['melody']['frames'][number];

const candidate = (midiFloat: number, selected = true) => ({
  midiFloat,
  pitchHz: 440 * 2 ** ((midiFloat - 69) / 12),
  noteName: 'test',
  score: 0.8,
  periodicity: 0.8,
  salience: 0.8,
  selected,
});

function frame(time: number, options: Readonly<{
  midi?: number;
  voiced?: boolean;
  rejectedHz?: readonly number[];
}> = {}): Frame {
  const midi = options.midi ?? null;
  const candidates = midi === null ? [] : [candidate(midi)];
  return {
    time,
    candidates,
    rangeRejected: (options.rejectedHz ?? []).map(frequencyHz => ({
      frequencyHz, periodicity: 0.7, salience: 0.6, score: 0.5,
      reason: frequencyHz < 80 ? 'BELOW_PITCH_RANGE' as const : 'ABOVE_PITCH_RANGE' as const,
    })),
    selectedCandidateIndex: midi === null ? null : 0,
    selectedMidiFloat: midi,
    selectedPitchHz: midi === null ? null : candidates[0]!.pitchHz,
    finalMidiFloat: midi,
    finalPitchHz: midi === null ? null : candidates[0]!.pitchHz,
    finalConfidence: options.voiced ? 0.8 : 0.4,
    finalSalience: 0.6,
    voiced: options.voiced ?? false,
    stage: midi === null ? 'candidate' : 'frame',
    reason: midi === null ? 'NO_USABLE_CANDIDATE' : options.voiced ? 'VOICED' : 'LOW_CONFIDENCE',
  };
}

function source(frames: readonly Frame[], duration = 1): Pick<ListeningRecordV1,
  'version' | 'duration' | 'melody'> {
  return { version: 1, duration, melody: { frames } };
}

function visit(value: unknown, check: (item: unknown) => void): void {
  check(value);
  if (Array.isArray(value)) value.forEach(item => visit(item, check));
  else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(item => visit(item, check));
  }
}

test('Listening Field projection preserves the three states and causal intervals', () => {
  const projected = projectListeningFieldRecordV1(source([
    frame(0.1, { midi: 60.2, voiced: true, rejectedHz: [55] }),
    frame(0.116, { midi: 60.3, voiced: true, rejectedHz: [55] }),
    frame(0.132, { midi: 62.1 }),
    frame(0.3),
  ]));
  assert.deepEqual(projected, {
    version: 1,
    sourceDuration: 1,
    melody: [
      { id: 'melody-voiced-000001', start: 0.1, end: 0.132,
        midi: 60, state: 'voiced' },
      { id: 'melody-range-rejected-000002', start: 0.1, end: 0.132,
        midi: 33, state: 'range-rejected' },
      { id: 'melody-selected-unvoiced-000003', start: 0.132, end: 0.14800000000000002,
        midi: 62, state: 'selected-unvoiced' },
    ],
  });
});

test('Listening Field output is deterministic, finite, unique, bounded, and JSON-safe', () => {
  const input = source([
    frame(0.1, { midi: 60.4, voiced: true }),
    frame(0.116, { midi: 60.4, voiced: true }),
    frame(0.5, { rejectedHz: [55, 55, 2_000] }),
  ], 0.51);
  const first: ListeningFieldRecordV1 = projectListeningFieldRecordV1(input);
  const second = projectListeningFieldRecordV1(input);
  assert.deepEqual(second, first);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.equal(new Set(first.melody.map(event => event.id)).size, first.melody.length);
  for (const event of first.melody) {
    assert.ok(0 <= event.start && event.start <= event.end && event.end <= first.sourceDuration);
  }
  visit(first, value => {
    if (typeof value === 'number') assert.equal(Number.isFinite(value), true);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      assert.equal(Object.getPrototypeOf(value), Object.prototype);
    }
  });
});

test('audio adapter composes the production analysis and public record projection', () => {
  const sampleRate = 12_000;
  const audio = {
    sampleRate,
    channels: [Float32Array.from({ length: sampleRate / 4 }, (_, index) =>
      0.7 * Math.sin(2 * Math.PI * 220 * index / sampleRate))],
  };
  const expected = projectListeningFieldRecordV1(
    projectListeningRecordV1(analyzeDualPathListening(audio)),
  );
  const actual = analyzeListeningFieldFromAudio(audio);
  assert.deepEqual(actual, expected);
  assert.equal(actual.sourceDuration, audio.channels[0]!.length / audio.sampleRate);
});
