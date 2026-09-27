import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeMelodyAcousticFrame, interpretMelodyAcousticFrames, MELODY_ANALYSIS,
} from '../src/analysis/MelodyAnalysis.ts';
import {
  bassCandidatesFromMelodyEvidence,
  createCompactMelodyEvidenceTimeline,
  createRollingListeningSession,
  readCompactMelodyEvidenceStorage,
  retainMelodyRejectedCandidate,
  selectMelodyEvidence,
  type RollingAnalysisDiagnosticRecord,
  type RollingListeningUpdate,
} from '../src/index.ts';
import { negativeMelodyFrequencyFixture } from './negativeMelodyFrequencyFixture.ts';

const frameTime = MELODY_ANALYSIS.frameSize / (2 * MELODY_ANALYSIS.analysisSampleRate);
const duration = MELODY_ANALYSIS.frameSize / MELODY_ANALYSIS.analysisSampleRate;

const thresholds = {
  minimumRms: MELODY_ANALYSIS.minimumRms,
  minimumHz: MELODY_ANALYSIS.minimumHz,
  maximumHz: MELODY_ANALYSIS.maximumHz,
  voicingConfidence: MELODY_ANALYSIS.voicingThreshold,
  trackConfidence: MELODY_ANALYSIS.availabilityThreshold,
  minimumUsableDuration: MELODY_ANALYSIS.minimumUsableDuration,
  minimumVoicedFrameRatio: 0.12,
  minimumNoteDuration: MELODY_ANALYSIS.minimumNoteDuration,
} as const;
const unavailableTrack = {
  available: false, confidence: 0, voicedFrameRatio: 0, usableDuration: 0,
  noteCountBeforeTrackGate: 0, acceptedNoteCount: 0, rejectedShortNoteCount: 0,
  noteReasons: [], reasons: ['TRACK_NO_NOTES'],
} as const;

test('non-positive YIN interpolation is invalid generation rather than range-rejected pitch evidence', () => {
  const acoustic = analyzeMelodyAcousticFrame(negativeMelodyFrequencyFixture(), frameTime);

  assert.equal(acoustic.generation.attempted, true);
  assert.equal(acoustic.generation.searchMode, 'GLOBAL_MINIMUM_FALLBACK');
  assert.equal(acoustic.generation.localMinimumCount, 0);
  assert.equal(acoustic.generation.rawCandidateCount, 0);
  assert.equal(acoustic.generation.outcome, 'ATTEMPTED_NO_RAW_CANDIDATE');
  assert.equal(acoustic.outOfRangeCandidateCount, 0);
  assert.deepEqual(acoustic.candidates, []);
  assert.deepEqual(acoustic.rejectedCandidates, []);

  const interpreted = interpretMelodyAcousticFrames([acoustic], duration);
  const observation = selectMelodyEvidence(interpreted.evidence, duration, true)!;
  assert.equal(observation.observedPitch.source, 'NONE');
  assert.equal(observation.observedPitch.frequencyHz, null);
  assert.equal(readCompactMelodyEvidenceStorage(interpreted.evidence)
    .rejectedCandidateFrequencyHz.length, 0);
});

test('compact Melody evidence rejects invalid frequencies instead of retaining them as pitch', () => {
  const invalidValues = [0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  const baseFrame = {
    time: 0, rms: 0.1, candidates: [],
    generation: { attempted: true, outcome: 'ATTEMPTED_NO_RAW_CANDIDATE' as const,
      searchMode: 'GLOBAL_MINIMUM_FALLBACK' as const, localMinimumCount: 0,
      rawCandidateCount: 0, inRangeCandidateCountBeforeDeduplication: 0,
      duplicateCandidateRemovalCount: 0 },
    outOfRangeCandidateCount: 0, rejectedCandidates: [], selectedCandidateIndex: null,
    finalPitchHz: null, finalConfidence: 0, finalSalience: 0,
    voiced: false, reason: 'NO_USABLE_CANDIDATE' as const,
  };

  for (const invalid of invalidValues) {
    assert.deepEqual(retainMelodyRejectedCandidate([], {
      frequencyHz: invalid, periodicity: 0.5, salience: 0.5, score: 0.5,
      reason: 'BELOW_PITCH_RANGE',
    }), []);
    assert.throws(() => createCompactMelodyEvidenceTimeline([{
      ...baseFrame,
      rejectedCandidates: [{ frequencyHz: invalid, periodicity: 0.5,
        salience: 0.5, score: 0.5, reason: 'BELOW_PITCH_RANGE' }],
    }], thresholds, unavailableTrack), /finite and positive/);
    assert.throws(() => createCompactMelodyEvidenceTimeline([{
      ...baseFrame,
      candidates: [{ pitchHz: invalid, periodicity: 0.5, salience: 0.5, score: 0.5 }],
    }], thresholds, unavailableTrack), /finite and positive/);
    assert.throws(() => createCompactMelodyEvidenceTimeline([{
      ...baseFrame, finalPitchHz: invalid,
    }], thresholds, unavailableTrack), /finite and positive/);
  }
});

test('built-in rolling production completes the negative-frequency reproduction', async () => {
  const updates: RollingListeningUpdate[] = [];
  const diagnostics: RollingAnalysisDiagnosticRecord[] = [];
  let session: ReturnType<typeof createRollingListeningSession>;
  const completed = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('rolling reproduction did not publish')), 5_000);
    session = createRollingListeningSession({
      sampleRate: MELODY_ANALYSIS.analysisSampleRate,
      readTime: () => duration,
      onUpdate(update) { updates.push(update); },
      onDiagnostic(record) {
        diagnostics.push(record);
        clearTimeout(timeout);
        resolve();
      },
    });
  });
  session!.push([negativeMelodyFrequencyFixture()]);
  try { await completed; } finally { session!.stop(); }

  assert.equal(updates.length, 1);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].analyzer, 'built-in-production');
  const timeline = updates[0].map.melodyEvidence!;
  const observation = selectMelodyEvidence(timeline, duration, true)!;
  assert.equal(observation.observedPitch.frequencyHz, null);
  assert.ok(observation.candidates.every(candidate =>
    Number.isFinite(candidate.pitchHz) && candidate.pitchHz > 0 && Number.isFinite(candidate.midiFloat)));
  assert.ok(observation.rejectedCandidates.every(candidate =>
    Number.isFinite(candidate.frequencyHz) && candidate.frequencyHz > 0));
  assert.ok(bassCandidatesFromMelodyEvidence(timeline).every(frame => frame.candidates.every(candidate =>
    Number.isFinite(candidate.pitchHz) && candidate.pitchHz > 0 && Number.isFinite(candidate.midiFloat))));
});
