import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeMelodyWithEvidence, extractMelodyAcousticFrames, interpretMelodyAcousticFrames,
} from '../src/analysis/MelodyAnalysis.ts';
import { analyzeBassFromMelodyEvidence } from '../src/bass/BassAnalysis.ts';
import { SessionAnchoredMelodyExperiment } from '../src/experiments/SessionAnchoredMelody.ts';

function signal(sampleRate: number, seconds: number) {
  return Float32Array.from({ length: Math.floor(sampleRate * seconds) }, (_, index) => {
    const time = index / sampleRate;
    if (time < 0.25) return 0;
    const melodyHz = time < 1.35 ? 440 : 523.2511306011972;
    const transient = index % Math.round(sampleRate * 0.37) < 9 ? 0.2 : 0;
    return 0.28 * Math.sin(2 * Math.PI * melodyHz * time)
      + 0.18 * Math.sin(2 * Math.PI * 110 * time) + transient;
  });
}

function runSchedule(samples: Float32Array, sampleRate: number, blockSizes: readonly number[]) {
  const experiment = new SessionAnchoredMelodyExperiment(sampleRate);
  const emitted = [] as ReturnType<SessionAnchoredMelodyExperiment['frames']>[number][];
  let cursor = 0;
  let block = 0;
  while (cursor < samples.length) {
    const end = Math.min(samples.length, cursor + blockSizes[block % blockSizes.length]);
    emitted.push(...experiment.push(samples.subarray(cursor, end)).emitted);
    cursor = end;
    block += 1;
  }
  return { experiment, emitted };
}

for (const sampleRate of [44_100, 48_000, 32_000]) {
  test(`session acoustic frames are chunk-independent at ${sampleRate} Hz`, () => {
    const samples = signal(sampleRate, 2.4);
    const small = runSchedule(samples, sampleRate, [128]);
    const awkward = runSchedule(samples, sampleRate, [127, 211, 379]);
    const halfSecond = runSchedule(samples, sampleRate, [Math.floor(sampleRate / 2)]);
    assert.ok(small.emitted.length > 100);
    assert.deepStrictEqual(awkward.emitted, small.emitted);
    assert.deepStrictEqual(halfSecond.emitted, small.emitted);
    assert.deepStrictEqual(analyzeBassFromMelodyEvidence(awkward.experiment.interpret().evidence),
      analyzeBassFromMelodyEvidence(small.experiment.interpret().evidence));
  });
}

test('completed acoustic evidence is immutable when later PCM arrives', () => {
  const sampleRate = 44_100;
  const samples = signal(sampleRate, 2);
  const experiment = new SessionAnchoredMelodyExperiment(sampleRate);
  const first = experiment.push(samples.subarray(0, sampleRate)).emitted[0];
  assert.ok(first);
  const value = structuredClone(first);
  experiment.push(samples.subarray(sampleRate));
  assert.deepStrictEqual(first, value);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.acoustic));
  assert.ok(Object.isFrozen(first.acoustic.candidates));
});

test('precomputed acoustic frames feed the unchanged temporal interpretation exactly', () => {
  const sampleRate = 48_000;
  const mono = signal(sampleRate, 2.5);
  const baseline = analyzeMelodyWithEvidence({ mono, sampleRate });
  const frames = extractMelodyAcousticFrames({ mono, sampleRate });
  const rebuilt = interpretMelodyAcousticFrames(frames, mono.length / sampleRate);
  assert.deepStrictEqual(rebuilt, baseline);
});

test('session horizon prunes interpreted evidence without redefining frame identity', () => {
  const sampleRate = 48_000;
  const experiment = new SessionAnchoredMelodyExperiment(sampleRate);
  experiment.push(new Float32Array(sampleRate * 14));
  const frames = experiment.frames();
  assert.ok(frames.length > 700 && frames.length < 760);
  assert.ok(frames[0].acoustic.time >= 2);
  assert.equal(frames[1].startSample12k - frames[0].startSample12k, 192);
  assert.ok(experiment.diagnostics().pendingSourceSamples < 5);
  assert.ok(experiment.diagnostics().pendingResampledSamples < 2048);
});
