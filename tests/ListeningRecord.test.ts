import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  analyzeDualPathListening,
  createCompactMelodyEvidenceTimeline,
  projectListeningRecordV1,
  type DrumClassifierEvidence,
  type DrumEvidence,
  type DualPathListening,
  type ListeningRecordV1,
} from '../src/index.ts';

const SAMPLE_RATE = 12_000;
const pcm = {
  sampleRate: SAMPLE_RATE,
  channels: [Float32Array.from({ length: SAMPLE_RATE }, (_, index) =>
    0.7 * Math.sin(2 * Math.PI * 110 * index / SAMPLE_RATE))],
};
const analyzed = analyzeDualPathListening(pcm);

function visit(value: unknown, check: (value: unknown) => void): void {
  check(value);
  if (Array.isArray(value)) value.forEach(item => visit(item, check));
  else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(item => visit(item, check));
  }
}

function withBassFrames(frames: DualPathListening['bassEvidence']['frames']): DualPathListening {
  return {
    ...analyzed,
    bassEvidence: {
      ...analyzed.bassEvidence,
      frames,
      path: { version: 1, selectedCandidateIndexes: frames.map(frame => frame.selectedCandidateIndex), objective: 0 },
    },
  };
}

const classifierEvidence: DrumClassifierEvidence = {
  calibration: 'UNCALIBRATED',
  hypotheses: [
    { kind: 'kick', comparativeScore: 0.8, rank: 1 },
    { kind: 'snare', comparativeScore: 0.6, rank: 2 },
    { kind: 'tom', comparativeScore: 0.4, rank: 3 },
    { kind: 'closed-hat', comparativeScore: 0.2, rank: 4 },
    { kind: 'open-hat', comparativeScore: 0.1, rank: 5 },
  ],
  topComparativeScore: 0.8,
  secondComparativeScore: 0.6,
  comparativeMargin: 0.2,
  transientQuality: 0.7,
  consistency: 0.65,
  uncalibratedConfidence: 0.72,
};

const acoustic = {
  normalizedRms: 0.7,
  normalizedOnsetStrength: 0.9,
  localOnsetBaseline: 0.1,
  appliedOnsetThreshold: 0.2,
};

test('Listening Record V1 is recursively plain, finite, and JSON round-trip safe', () => {
  const record = projectListeningRecordV1(analyzed);
  const json = JSON.stringify(record);
  assert.deepStrictEqual(JSON.parse(json), record);
  visit(record, value => {
    assert.equal(ArrayBuffer.isView(value), false);
    if (typeof value === 'number') assert.equal(Number.isFinite(value), true);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      assert.equal(Object.getPrototypeOf(value), Object.prototype);
    }
  });
  assert.equal(json.includes('_compactStorage'), false);
});

test('very short tracks retain every Melody frame even when terminal timestamps coincide', () => {
  const short = analyzeDualPathListening({ sampleRate: SAMPLE_RATE,
    channels: [new Float32Array(SAMPLE_RATE * 0.05)] });
  assert.equal(short.listeningMap.melodyAnalysis?.contour.length, 2);
  assert.equal(short.listeningMap.melodyAnalysis?.contour[0].time,
    short.listeningMap.melodyAnalysis?.contour[1].time);
  assert.equal(projectListeningRecordV1(short).melody.frames.length, 2);
});

test('Melody projection uses the public selector and preserves selected candidate identity', () => {
  const implementation = readFileSync(new URL('../src/ListeningRecord.ts', import.meta.url), 'utf8');
  assert.match(implementation, /selectMelodyEvidence\(/);
  assert.doesNotMatch(implementation, /readCompactMelodyEvidenceStorage|_compactStorage/);

  const record = projectListeningRecordV1(analyzed);
  const selected = record.melody.frames.find(frame => frame.selectedCandidateIndex !== null);
  assert.ok(selected && selected.selectedCandidateIndex !== null);
  assert.equal(selected.candidates.filter(candidate => candidate.selected).length, 1);
  assert.equal(selected.candidates[selected.selectedCandidateIndex].selected, true);
  assert.equal(selected.candidates[selected.selectedCandidateIndex].pitchHz, selected.selectedPitchHz);
  assert.equal(selected.candidates[selected.selectedCandidateIndex].midiFloat, selected.selectedMidiFloat);
});

test('Melody selected-but-unvoiced remains distinct from voiced output', () => {
  const evidence = createCompactMelodyEvidenceTimeline([{
    time: 0.1,
    rms: 0.01,
    candidates: [{ pitchHz: 220, periodicity: 0.5, salience: 0.4, score: 0.45 }],
    generation: {
      attempted: true,
      outcome: 'USABLE_CANDIDATES_SURVIVED',
      searchMode: 'LOCAL_MINIMA',
      localMinimumCount: 1,
      rawCandidateCount: 1,
      inRangeCandidateCountBeforeDeduplication: 1,
      duplicateCandidateRemovalCount: 0,
    },
    outOfRangeCandidateCount: 1,
    rejectedCandidates: [{ frequencyHz: 75, periodicity: 0.3, salience: 0.2, score: 0.25,
      reason: 'BELOW_PITCH_RANGE' }],
    selectedCandidateIndex: 0,
    finalPitchHz: 220,
    finalConfidence: 0.45,
    finalSalience: 0.4,
    voiced: false,
    reason: 'LOW_CONFIDENCE',
  }], {
    minimumRms: 0.0025,
    minimumHz: 80,
    maximumHz: 1400,
    voicingConfidence: 0.56,
    trackConfidence: 0.58,
    minimumUsableDuration: 0.5,
    minimumVoicedFrameRatio: 0.12,
    minimumNoteDuration: 0.08,
  }, {
    available: false,
    confidence: 0,
    voicedFrameRatio: 0,
    usableDuration: 0,
    noteCountBeforeTrackGate: 0,
    acceptedNoteCount: 0,
    rejectedShortNoteCount: 0,
    noteReasons: [],
    reasons: ['TRACK_LOW_CONFIDENCE'],
  });
  const source: DualPathListening = {
    ...analyzed,
    listeningMap: {
      ...analyzed.listeningMap,
      melodyEvidence: evidence,
      melodyAnalysis: {
        ...analyzed.listeningMap.melodyAnalysis!,
        contour: [{ time: 0.1, voiced: false, pitchHz: null, midiFloat: null, confidence: 0, salience: 0 }],
      },
    },
  };
  const frame = projectListeningRecordV1(source).melody.frames[0];
  assert.equal(frame.selectedCandidateIndex, 0);
  assert.equal(frame.candidates[0].selected, true);
  assert.equal(frame.selectedPitchHz, 220);
  assert.equal(frame.finalPitchHz, 220);
  assert.equal(frame.voiced, false);
  assert.equal(frame.reason, 'LOW_CONFIDENCE');
  assert.deepEqual(frame.rangeRejected, [{ frequencyHz: 75, periodicity: 0.30000762951094834,
    salience: 0.2, score: 0.2500038147554742, reason: 'BELOW_PITCH_RANGE' }]);
});

test('Bass NO_CANDIDATE and PATH_ABSTAINED remain distinct', () => {
  const candidate = {
    pitchHz: 110,
    midiFloat: 45,
    score: 0.4,
    periodicity: 0.5,
    salience: 0.3,
    source: 'melody-usable' as const,
    sourceRank: 1,
  };
  const source = withBassFrames([
    { time: 0.1, candidates: [], selectedCandidateIndex: null, selectedPitchHz: null,
      selectedMidiFloat: null, selectedScore: null, reason: 'NO_CANDIDATE' },
    { time: 0.2, candidates: [candidate], selectedCandidateIndex: null, selectedPitchHz: null,
      selectedMidiFloat: null, selectedScore: null, reason: 'PATH_ABSTAINED' },
  ]);
  const frames = projectListeningRecordV1(source).bass.frames;
  assert.equal(frames[0].reason, 'NO_CANDIDATE');
  assert.equal(frames[1].reason, 'PATH_ABSTAINED');
  assert.equal(frames[1].candidates[0].selected, false);
});

test('Drum decision variants retain only their source-specific data', () => {
  const drumEvidence: DrumEvidence = {
    version: 1,
    experimental: true,
    calibration: 'UNCALIBRATED',
    analyzedWindow: { start: 0, end: 1 },
    status: 'OBSERVED',
    trackCapability: 'AVAILABLE',
    attemptCount: 5,
    attempts: [
      { id: 'selected', time: 0.1, sourceFrame: 1, acoustic,
        decision: { state: 'SELECTED', reason: 'NAMED_CLASS_ACCEPTED', selectedClass: 'kick',
          classifierEvidence, physicalEventStrength: 0.8, percussionEventId: 'event-1' } },
      { id: 'ambiguous', time: 0.2, sourceFrame: 2, acoustic,
        decision: { state: 'ABSTAINED', reason: 'AMBIGUOUS_CLASS_EVIDENCE',
          ambiguityFallback: 'other-percussion', ambiguityReasons: ['LOW_CLASS_MARGIN'],
          classifierEvidence, physicalEventStrength: 0.6, percussionEventId: 'event-2' } },
      { id: 'insufficient', time: 0.3, sourceFrame: 3, acoustic,
        decision: { state: 'ABSTAINED', reason: 'INSUFFICIENT_EVIDENCE', classifierEvidence } },
      { id: 'rejected', time: 0.4, sourceFrame: 4, acoustic,
        decision: { state: 'REJECTED', reason: 'NON_PERCUSSIVE_SUSTAINED' } },
      { id: 'deduplicated', time: 0.5, sourceFrame: 5, acoustic,
        decision: { state: 'REJECTED', reason: 'TEMPORAL_DEDUPLICATION', classifierEvidence } },
    ],
  };
  const source: DualPathListening = {
    ...analyzed,
    listeningMap: { ...analyzed.listeningMap, drumEvidence },
  };
  const decisions = projectListeningRecordV1(source).drum.attempts.map(attempt => attempt.decision);
  assert.deepEqual(decisions.map(decision => decision.state),
    ['SELECTED', 'ABSTAINED', 'ABSTAINED', 'REJECTED', 'REJECTED']);
  assert.equal('selectedClass' in decisions[0], true);
  assert.equal('ambiguityFallback' in decisions[1], true);
  assert.equal('physicalEventStrength' in decisions[1], true);
  assert.equal('selectedClass' in decisions[1], false);
  assert.equal('classifierEvidence' in decisions[2], true);
  assert.equal('physicalEventStrength' in decisions[2], false);
  assert.equal('classifierEvidence' in decisions[3], false);
  assert.equal('percussionEventId' in decisions[3], false);
  assert.equal('classifierEvidence' in decisions[4], true);
  assert.equal('percussionEventId' in decisions[4], false);
  assert.deepEqual((decisions[0] as { classifierEvidence: DrumClassifierEvidence }).classifierEvidence.hypotheses,
    classifierEvidence.hypotheses);
});

test('Listening Record V1 is exported as a public type', () => {
  const record: ListeningRecordV1 = projectListeningRecordV1(analyzed);
  assert.equal(record.version, 1);
});
