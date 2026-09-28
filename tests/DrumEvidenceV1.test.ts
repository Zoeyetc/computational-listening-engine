import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzePcmListening,
  createRollingListeningSession,
  type DrumEvidence,
  type DrumEvidenceObserved,
  type PercussionDescriptors,
} from '../src/index.ts';
import {
  classifyPercussionCore,
  type PercussionCandidateTrace,
} from '../src/analysis/PercussionAnalysisCore.ts';
import { decisionFromPercussionCandidate } from '../src/drum/DrumEvidence.ts';
import { analyzeBassFromMelodyEvidence } from '../src/bass/BassAnalysis.ts';
import { readCompactMelodyEvidenceStorage } from '../src/melody-evidence/compactTimeline.ts';
import {
  ambiguousClap,
  fourOnFloorHats,
  isolatedKick,
  silence,
  syntheticPercussion,
} from './percussionFixtures.ts';
import { drumProbePianoMelody, drumProbeTomSolo } from './drumProbeFixtures.ts';

function observed(pcm: Parameters<typeof analyzePcmListening>[0]): DrumEvidenceObserved {
  const evidence = analyzePcmListening(pcm).drumEvidence;
  assert.equal(evidence?.status, 'OBSERVED');
  return evidence as DrumEvidenceObserved;
}

test('clear named Drum selection carries all five ranked uncalibrated hypotheses', () => {
  const attempt = observed(isolatedKick()).attempts.find(item => item.decision.state === 'SELECTED');
  assert.ok(attempt && attempt.decision.state === 'SELECTED');
  assert.equal(attempt.decision.selectedClass, 'kick');
  assert.equal(attempt.decision.classifierEvidence.calibration, 'UNCALIBRATED');
  assert.deepStrictEqual(attempt.decision.classifierEvidence.hypotheses.map(item => item.rank),
    [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(new Set(attempt.decision.classifierEvidence.hypotheses.map(item => item.kind)),
    new Set(['kick', 'snare', 'closed-hat', 'open-hat', 'tom']));
  assert.ok(attempt.decision.physicalEventStrength >= 0
    && attempt.decision.physicalEventStrength <= 1);
  assert.equal('probability' in attempt.decision.classifierEvidence, false);
});

test('other-percussion is an explicit abstention rather than a selected sixth hypothesis', () => {
  const attempt = observed(ambiguousClap()).attempts.find(
    item => item.decision.reason === 'AMBIGUOUS_CLASS_EVIDENCE',
  );
  assert.ok(attempt && attempt.decision.reason === 'AMBIGUOUS_CLASS_EVIDENCE');
  assert.equal(attempt.decision.state, 'ABSTAINED');
  assert.equal(attempt.decision.ambiguityFallback, 'other-percussion');
  assert.ok(attempt.decision.ambiguityReasons.length > 0);
  assert.equal(attempt.decision.classifierEvidence.hypotheses.length, 5);
  assert.equal(attempt.decision.classifierEvidence.hypotheses.some(
    hypothesis => (hypothesis.kind as string) === 'other-percussion'), false);
  assert.equal('selectedClass' in attempt.decision, false);
});

test('insufficient classifier evidence maps to abstention without a selected class', () => {
  const descriptor: PercussionDescriptors = {
    subRatio: 0.1, lowMidRatio: 0.15, midRatio: 0.25, highRatio: 0.25, airRatio: 0.25,
    centroid: 0.45, spread: 0.3, flatness: 0.35, duration: 0.1, decay: 0.8,
    onsetStrength: 0.9, highPersistence: 0.2, lowPersistence: 0.2, rms: 0.8,
  };
  const candidate: PercussionCandidateTrace = {
    frameIndex: 4, time: 0.1, rms: 0.8, onsetStrength: 0.9,
    localOnsetBaseline: 0.1, onsetThreshold: 0.2, descriptors: descriptor,
    classification: classifyPercussionCore(descriptor, true),
    disposition: 'INSUFFICIENT_EVIDENCE_REJECTED', acceptedEventId: null,
  };
  const decision = decisionFromPercussionCandidate(candidate, new Map());
  assert.equal(decision.state, 'ABSTAINED');
  assert.equal(decision.reason, 'INSUFFICIENT_EVIDENCE');
  assert.equal('selectedClass' in decision, false);
});

test('pre-classification sustained and right-edge rejections fabricate no class evidence', () => {
  const sustained = observed(drumProbePianoMelody()).attempts.find(
    item => item.decision.reason === 'NON_PERCUSSIVE_SUSTAINED',
  );
  assert.ok(sustained && sustained.decision.reason === 'NON_PERCUSSIVE_SUSTAINED');
  assert.equal(sustained.decision.state, 'REJECTED');
  assert.equal('classifierEvidence' in sustained.decision, false);

  const edgePcm = syntheticPercussion(48_000, 1, [{ time: 0.82, kind: 'kick' }]);
  const edge = observed(edgePcm).attempts.find(
    item => item.decision.reason === 'INCOMPLETE_RIGHT_EDGE',
  );
  assert.ok(edge && edge.decision.reason === 'INCOMPLETE_RIGHT_EDGE');
  assert.equal(edge.decision.state, 'REJECTED');
  assert.equal('classifierEvidence' in edge.decision, false);
});

test('refractory duplicate is rejected with its existing classifier evidence', () => {
  const duplicate = observed(isolatedKick()).attempts.find(
    item => item.decision.reason === 'TEMPORAL_DEDUPLICATION',
  );
  assert.ok(duplicate && duplicate.decision.reason === 'TEMPORAL_DEDUPLICATION');
  assert.equal(duplicate.decision.state, 'REJECTED');
  assert.equal(duplicate.decision.classifierEvidence.hypotheses.length, 5);
  assert.equal('percussionEventId' in duplicate.decision, false);
});

test('no percussive opportunity is distinct from decisions and explicit unavailability', () => {
  const noEvent = analyzePcmListening(silence()).drumEvidence;
  assert.deepStrictEqual(noEvent, {
    version: 1, experimental: true, calibration: 'UNCALIBRATED',
    trackCapability: 'UNAVAILABLE', analyzedWindow: { start: 0, end: 1 },
    status: 'NO_EVENT', reason: 'NO_PERCUSSIVE_OPPORTUNITY', attemptCount: 0, attempts: [],
  });
  const unavailable: DrumEvidence = {
    version: 1, experimental: true, calibration: 'UNCALIBRATED',
    trackCapability: 'UNAVAILABLE', analyzedWindow: { start: 0, end: 0 },
    status: 'UNAVAILABLE', reason: 'ANALYSIS_NOT_RUN', attemptCount: 0, attempts: [],
  };
  assert.notEqual(noEvent?.status, unavailable.status);
});

test('resonant tom Drum evidence does not suppress simultaneous pitch or Bass evidence', () => {
  const map = analyzePcmListening(drumProbeTomSolo());
  assert.ok(map.drumEvidence?.status === 'OBSERVED'
    && map.drumEvidence.attempts.some(attempt => attempt.decision.state === 'SELECTED'
      && attempt.decision.selectedClass === 'tom'));
  const storage = readCompactMelodyEvidenceStorage(map.melodyEvidence!);
  assert.ok(storage.candidatePitchHz.length > 0);
  assert.ok(analyzeBassFromMelodyEvidence(map.melodyEvidence!).frames
    .some(frame => frame.selectedPitchHz !== null));
});

test('rolling publication deduplicates accepted events while Drum evidence remains a bounded snapshot', async () => {
  const pcm = fourOnFloorHats();
  const updates: Parameters<Parameters<typeof createRollingListeningSession>[0]['onUpdate']>[0][] = [];
  let resolveFirst: (() => void) | null = null;
  const first = new Promise<void>(resolve => { resolveFirst = resolve; });
  const session = createRollingListeningSession({
    sampleRate: pcm.sampleRate,
    readTime: () => 2,
    onUpdate(update) { updates.push(update); resolveFirst?.(); resolveFirst = null; },
  });
  session.push(pcm.channels);
  await first;
  await session.analyzeNow();
  session.stop();

  assert.equal(updates.length, 2);
  assert.ok(updates[0].map.drumEvidence?.status === 'OBSERVED');
  assert.deepStrictEqual(updates[1].map.drumEvidence, updates[0].map.drumEvidence);
  assert.ok(updates[0].events.some(event => event.type === 'kick'
    || event.type === 'closed-hat' || event.type === 'open-hat'));
  assert.deepStrictEqual(updates[1].events.filter(event => event.type === 'kick'
    || event.type === 'snare' || event.type === 'closed-hat'
    || event.type === 'open-hat' || event.type === 'tom'
    || event.type === 'other-percussion'), []);
  assert.ok((updates[0].map.drumEvidence?.attemptCount ?? Infinity)
    <= (updates[0].map.percussionAnalysis?.candidateCount ?? -1));
});

test('existing public Percussion projection remains exactly aligned with accepted Drum decisions', () => {
  const map = analyzePcmListening(fourOnFloorHats());
  assert.deepStrictEqual(map.percussion, map.percussionAnalysis?.events);
  assert.ok(map.drumEvidence?.status === 'OBSERVED');
  const publishedIds = map.drumEvidence.attempts.flatMap(attempt =>
    'percussionEventId' in attempt.decision ? [attempt.decision.percussionEventId] : []);
  assert.deepStrictEqual(publishedIds, map.percussionAnalysis?.events.map(event => event.id));
  assert.equal(map.drumEvidence.attemptCount, map.percussionAnalysis?.candidateCount);
});
