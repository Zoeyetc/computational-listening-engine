import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzePcmListening, analyzeDualPathListening, analyzeBassFromMelodyEvidence,
  bassCandidatesFromMelodyEvidence, lookupBassSnapshot, solveBassPath, readCompactMelodyEvidenceStorage,
  type BassCandidate, type BassDataset, type BassEvaluation,
} from '../src/index.ts';

const candidate = (midiFloat: number, score: number): BassCandidate => ({
  midiFloat, pitchHz: 440 * 2 ** ((midiFloat - 69) / 12), score,
  periodicity: score, salience: score, source: 'melody-usable', sourceRank: 1,
});
const frame = (time: number, candidates: readonly BassCandidate[]) => ({ time, candidates });
const sine = (hz: number, seconds = 1, sampleRate = 12_000) => ({ sampleRate,
  channels: [Float32Array.from({ length: seconds * sampleRate }, (_, index) =>
    0.6 * Math.sin(2 * Math.PI * hz * index / sampleRate))] });

test('bass solver follows a low continuous path instead of highest local candidate score', () => {
  const frames = [frame(0, [candidate(69, 0.8), candidate(45, 0.7)]),
    frame(0.016, [candidate(69, 0.8), candidate(45, 0.7)]),
    frame(0.032, [candidate(69, 0.8), candidate(45, 0.7)])];
  assert.deepEqual(solveBassPath(frames).selectedCandidateIndexes, [1, 1, 1]);
  assert.deepEqual(solveBassPath(frames), solveBassPath(frames));
  assert.equal(frames[0].candidates[0].score > frames[0].candidates[1].score, true);
});

test('bass path has an independent null state and respects gaps', () => {
  const low = candidate(45, 0.85);
  const path = solveBassPath([frame(0, [low]), frame(0.016, []), frame(0.032, [low])]);
  assert.deepEqual(path.selectedCandidateIndexes, [0, null, 0]);
  assert.deepEqual(solveBassPath([]).selectedCandidateIndexes, []);
  assert.deepEqual(solveBassPath([frame(0, [candidate(45, 0.1)])]).selectedCandidateIndexes, [null]);
  assert.throws(() => solveBassPath([frame(1, []), frame(0, [])]), /nondecreasing/);
  assert.throws(() => solveBassPath([frame(0, [candidate(45, Number.NaN)])]), /candidate/);
});

test('dual path reuses candidates while Melody and the PCM input remain identical', () => {
  const pcm = sine(110);
  const original = pcm.channels[0].slice();
  const baseline = analyzePcmListening(pcm);
  const first = analyzeDualPathListening(pcm);
  const second = analyzeDualPathListening(pcm);
  assert.deepEqual(first.listeningMap, baseline);
  assert.deepEqual(first, second);
  assert.deepEqual(pcm.channels[0], original);
  assert.ok(first.bassEvidence.frames.length > 0);
  assert.equal(first.bassEvidence.frames.length, baseline.melodyEvidence?.frameCount);
  assert.equal(first.bassEvidence.path.selectedCandidateIndexes.length, first.bassEvidence.frames.length);
  assert.deepEqual(first.bassEvidence, analyzeBassFromMelodyEvidence(baseline.melodyEvidence!));
});

test('bass candidate adapter ignores Melody path and confidence decisions', () => {
  const map = analyzePcmListening(sine(220));
  const original = bassCandidatesFromMelodyEvidence(map.melodyEvidence!);
  const storage = readCompactMelodyEvidenceStorage(map.melodyEvidence!);
  storage.selectedCandidateIndexes.fill(-1);
  storage.finalConfidence.fill(0);
  storage.voiced.fill(0);
  const copied = bassCandidatesFromMelodyEvidence(map.melodyEvidence!);
  assert.deepEqual(original, copied);
  assert.ok(original.some(item => item.candidates.length > 0));
  assert.ok(original.every(item => item.candidates.every(item => item.pitchHz <= 330)));
});

test('high-only input exposes harmonic ambiguity without claiming a correct bass', () => {
  const result = analyzeDualPathListening(sine(880));
  assert.ok(result.bassEvidence.frames.some(frame => frame.candidates.length > 0));
  assert.ok(result.bassEvidence.frames.every(frame => frame.candidates.every(candidate => candidate.pitchHz <= 330)));
  assert.equal(result.bassEvidence.limitations.upperCandidateFrequencyHz, 330);
  // Subharmonic candidates from a high tone can look like bass; no correction is tuned here.
  assert.ok(result.bassEvidence.frames.some(frame => frame.selectedCandidateIndex !== null));
});

test('bass snapshot is independent and does not invent note or calibrated confidence', () => {
  const result = analyzeDualPathListening(sine(110));
  const evidence = result.bassEvidence;
  const voiced = evidence.frames.find(frame => frame.selectedCandidateIndex !== null)!;
  const snapshot = lookupBassSnapshot(evidence, voiced.time);
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.pitchHz, voiced.selectedPitchHz);
  assert.equal(snapshot.candidateScore, voiced.selectedScore);
  assert.equal('confidence' in snapshot, false);
  assert.equal(lookupBassSnapshot(evidence, -1).reason, 'OUTSIDE_EVIDENCE');
  assert.throws(() => lookupBassSnapshot(evidence, Infinity), /finite/);
});

test('future evaluation and dataset types require no production evaluator', () => {
  const dataset: BassDataset = { id: 'proposed', version: '0.1', cases: [{ id: 'a', reference: [{ time: 0, midiFloat: 45 }] }] };
  const evaluation: BassEvaluation = { datasetId: dataset.id, datasetVersion: dataset.version,
    evaluatedCases: 0, pitchAccuracy: null, centError: null, voicedF1: null, pathContinuity: null };
  assert.equal(evaluation.evaluatedCases, 0);
});
