import type { DualPathListening } from './bass/DualPathListening.ts';
import { selectMelodyEvidence } from './melody-evidence/selectMelodyEvidence.ts';
import type { DrumClassifierEvidence, DrumDecision } from './types.ts';

export type MelodyCandidateRecordV1 = Readonly<{
  midiFloat: number;
  pitchHz: number;
  noteName: string;
  score: number;
  periodicity: number;
  salience: number;
  selected: boolean;
}>;

export type MelodyRangeRejectedCandidateRecordV1 = Readonly<{
  frequencyHz: number;
  periodicity: number;
  salience: number;
  score: number;
  reason: 'BELOW_PITCH_RANGE' | 'ABOVE_PITCH_RANGE';
}>;

export type MelodyFrameRecordV1 = Readonly<{
  time: number;
  candidates: readonly MelodyCandidateRecordV1[];
  rangeRejected: readonly MelodyRangeRejectedCandidateRecordV1[];
  selectedCandidateIndex: number | null;
  selectedMidiFloat: number | null;
  selectedPitchHz: number | null;
  finalMidiFloat: number | null;
  finalPitchHz: number | null;
  finalConfidence: number;
  finalSalience: number;
  voiced: boolean;
  stage: 'input' | 'candidate' | 'path' | 'frame' | 'note' | 'track';
  reason: 'LOW_RMS' | 'NO_USABLE_CANDIDATE' | 'PATH_SELECTED_NULL'
    | 'LOW_CONFIDENCE' | 'VOICED' | 'MERGED_GAP';
}>;

export type MelodyRecordV1 = Readonly<{
  frames: readonly MelodyFrameRecordV1[];
}>;

export type BassCandidateRecordV1 = Readonly<{
  midiFloat: number;
  pitchHz: number;
  score: number;
  periodicity: number;
  salience: number;
  source: 'melody-usable' | 'melody-range-rejected-low';
  sourceRank: number;
  selected: boolean;
}>;

export type BassFrameRecordV1 = Readonly<{
  time: number;
  candidates: readonly BassCandidateRecordV1[];
  selectedCandidateIndex: number | null;
  selectedMidiFloat: number | null;
  selectedPitchHz: number | null;
  selectedScore: number | null;
  reason: 'SELECTED' | 'NO_CANDIDATE' | 'PATH_ABSTAINED';
}>;

export type BassLimitationsRecordV1 = Readonly<{
  nominalLowerFrequencyBoundHz: 80;
  upperCandidateFrequencyHz: 330;
  candidatesPrunedByMelody: true;
  voiceSeparation: false;
  calibratedConfidence: false;
}>;

export type BassRecordV1 = Readonly<{
  frames: readonly BassFrameRecordV1[];
  limitations: BassLimitationsRecordV1;
}>;

export type DrumHypothesisRecordV1 = Readonly<{
  kind: 'kick' | 'snare' | 'closed-hat' | 'open-hat' | 'tom';
  comparativeScore: number;
  rank: 1 | 2 | 3 | 4 | 5;
}>;

export type DrumClassifierEvidenceRecordV1 = Readonly<{
  hypotheses: readonly [DrumHypothesisRecordV1, DrumHypothesisRecordV1,
    DrumHypothesisRecordV1, DrumHypothesisRecordV1, DrumHypothesisRecordV1];
  topComparativeScore: number;
  secondComparativeScore: number;
  comparativeMargin: number;
  transientQuality: number;
  consistency: number;
  uncalibratedConfidence: number;
}>;

export type DrumAcousticRecordV1 = Readonly<{
  normalizedRms: number;
  normalizedOnsetStrength: number;
  localOnsetBaseline: number;
  appliedOnsetThreshold: number;
}>;

export type DrumSelectedDecisionRecordV1 = Readonly<{
  state: 'SELECTED';
  reason: 'NAMED_CLASS_ACCEPTED';
  selectedClass: DrumHypothesisRecordV1['kind'];
  classifierEvidence: DrumClassifierEvidenceRecordV1;
  physicalEventStrength: number;
  percussionEventId: string;
}>;

export type DrumAmbiguousDecisionRecordV1 = Readonly<{
  state: 'ABSTAINED';
  reason: 'AMBIGUOUS_CLASS_EVIDENCE';
  ambiguityFallback: 'other-percussion';
  ambiguityReasons: readonly ('MIXED_BROADBAND_EVIDENCE' | 'LOW_CLASS_MARGIN' | 'LOW_TOP_SCORE')[];
  classifierEvidence: DrumClassifierEvidenceRecordV1;
  physicalEventStrength: number;
  percussionEventId: string;
}>;

export type DrumInsufficientDecisionRecordV1 = Readonly<{
  state: 'ABSTAINED';
  reason: 'INSUFFICIENT_EVIDENCE';
  classifierEvidence: DrumClassifierEvidenceRecordV1;
}>;

export type DrumRejectedDecisionRecordV1 =
  | Readonly<{ state: 'REJECTED'; reason: 'NON_PERCUSSIVE_SUSTAINED' }>
  | Readonly<{ state: 'REJECTED'; reason: 'INCOMPLETE_RIGHT_EDGE' }>
  | Readonly<{
    state: 'REJECTED';
    reason: 'TEMPORAL_DEDUPLICATION';
    classifierEvidence: DrumClassifierEvidenceRecordV1;
  }>;

export type DrumDecisionRecordV1 = DrumSelectedDecisionRecordV1
  | DrumAmbiguousDecisionRecordV1
  | DrumInsufficientDecisionRecordV1
  | DrumRejectedDecisionRecordV1;

export type DrumAttemptRecordV1 = Readonly<{
  id: string;
  time: number;
  sourceFrame: number;
  acoustic: DrumAcousticRecordV1;
  decision: DrumDecisionRecordV1;
}>;

export type DrumAnalyzedWindowRecordV1 = Readonly<{
  start: number;
  end: number;
}>;

export type DrumRecordBaseV1 = Readonly<{
  calibration: 'UNCALIBRATED';
  analyzedWindow: DrumAnalyzedWindowRecordV1;
}>;

export type DrumUnavailableRecordV1 = DrumRecordBaseV1 & Readonly<{
  status: 'UNAVAILABLE';
  reason: 'ANALYSIS_NOT_RUN';
  trackCapability: 'UNAVAILABLE';
  attempts: readonly [];
}>;

export type DrumNoEventRecordV1 = DrumRecordBaseV1 & Readonly<{
  status: 'NO_EVENT';
  reason: 'NO_PERCUSSIVE_OPPORTUNITY';
  trackCapability: 'UNAVAILABLE';
  attempts: readonly [];
}>;

export type DrumObservedRecordV1 = DrumRecordBaseV1 & Readonly<{
  status: 'OBSERVED';
  trackCapability: 'AVAILABLE' | 'UNAVAILABLE';
  attempts: readonly [DrumAttemptRecordV1, ...DrumAttemptRecordV1[]];
}>;

export type DrumRecordV1 = DrumUnavailableRecordV1 | DrumNoEventRecordV1 | DrumObservedRecordV1;

export type ListeningRecordV1 = Readonly<{
  version: 1;
  duration: number;
  melody: MelodyRecordV1;
  bass: BassRecordV1;
  drum: DrumRecordV1;
}>;

function projectClassifierEvidence(evidence: DrumClassifierEvidence): DrumClassifierEvidenceRecordV1 {
  const hypotheses = evidence.hypotheses.map(hypothesis => ({
    kind: hypothesis.kind,
    comparativeScore: hypothesis.comparativeScore,
    rank: hypothesis.rank,
  })) as unknown as DrumClassifierEvidenceRecordV1['hypotheses'];
  return {
    hypotheses,
    topComparativeScore: evidence.topComparativeScore,
    secondComparativeScore: evidence.secondComparativeScore,
    comparativeMargin: evidence.comparativeMargin,
    transientQuality: evidence.transientQuality,
    consistency: evidence.consistency,
    uncalibratedConfidence: evidence.uncalibratedConfidence,
  };
}

function projectDecision(decision: DrumDecision): DrumDecisionRecordV1 {
  if (decision.state === 'SELECTED') return {
    state: decision.state,
    reason: decision.reason,
    selectedClass: decision.selectedClass,
    classifierEvidence: projectClassifierEvidence(decision.classifierEvidence),
    physicalEventStrength: decision.physicalEventStrength,
    percussionEventId: decision.percussionEventId,
  };
  if (decision.reason === 'AMBIGUOUS_CLASS_EVIDENCE') return {
    state: decision.state,
    reason: decision.reason,
    ambiguityFallback: decision.ambiguityFallback,
    ambiguityReasons: [...decision.ambiguityReasons],
    classifierEvidence: projectClassifierEvidence(decision.classifierEvidence),
    physicalEventStrength: decision.physicalEventStrength,
    percussionEventId: decision.percussionEventId,
  };
  if (decision.reason === 'INSUFFICIENT_EVIDENCE') return {
    state: decision.state,
    reason: decision.reason,
    classifierEvidence: projectClassifierEvidence(decision.classifierEvidence),
  };
  if (decision.reason === 'TEMPORAL_DEDUPLICATION') return {
    state: decision.state,
    reason: decision.reason,
    classifierEvidence: projectClassifierEvidence(decision.classifierEvidence),
  };
  return { state: decision.state, reason: decision.reason };
}

function assertJsonValue(value: unknown, path = 'record'): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`${path} must be finite`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${path} must be plain JSON data`);
  }
  Object.entries(value).forEach(([key, item]) => {
    if (item === undefined) throw new TypeError(`${path}.${key} must not be undefined`);
    assertJsonValue(item, `${path}.${key}`);
  });
}

/** Pure JSON-safe presentation projection over the existing public dual-path evidence. */
export function projectListeningRecordV1(result: DualPathListening): ListeningRecordV1 {
  const { listeningMap, bassEvidence } = result;
  const melodyEvidence = listeningMap.melodyEvidence;
  const melodyContour = listeningMap.melodyAnalysis?.contour;
  if (!melodyEvidence || !melodyContour) throw new Error('Melody evidence is unavailable');
  if (melodyContour.length !== melodyEvidence.frameCount) {
    throw new Error('Melody evidence and contour frame counts differ');
  }
  const melodyFrames = melodyContour.map((contourFrame, frameIndex): MelodyFrameRecordV1 => {
    const nextTime = melodyContour[frameIndex + 1]?.time;
    const lookupTime = frameIndex === 0 ? -1
      : nextTime === undefined ? contourFrame.time
        : contourFrame.time + (nextTime - contourFrame.time) / 2;
    const observation = selectMelodyEvidence(
      melodyEvidence,
      lookupTime,
      frameIndex === melodyContour.length - 1,
    );
    if (!observation || observation.frameIndex !== frameIndex) {
      throw new Error(`Melody frame ${frameIndex} cannot be selected unambiguously`);
    }
    return {
      time: observation.time,
      candidates: observation.candidates.map((candidate, candidateIndex) => ({
        midiFloat: candidate.midiFloat,
        pitchHz: candidate.pitchHz,
        noteName: candidate.noteName,
        score: candidate.score,
        periodicity: candidate.periodicity,
        salience: candidate.salience,
        selected: candidateIndex === observation.selectedCandidateIndex,
      })),
      rangeRejected: observation.rejectedCandidates.map(candidate => ({
        frequencyHz: candidate.frequencyHz,
        periodicity: candidate.periodicity,
        salience: candidate.salience,
        score: candidate.score,
        reason: candidate.reason,
      })),
      selectedCandidateIndex: observation.selectedCandidateIndex,
      selectedMidiFloat: observation.selectedMidiFloat,
      selectedPitchHz: observation.selectedPitchHz,
      finalMidiFloat: observation.finalMidiFloat,
      finalPitchHz: observation.finalPitchHz,
      finalConfidence: observation.finalConfidence,
      finalSalience: observation.finalSalience,
      voiced: observation.voiced,
      stage: observation.stage,
      reason: observation.reason,
    };
  });

  const bassFrames = bassEvidence.frames.map((frame): BassFrameRecordV1 => ({
    time: frame.time,
    candidates: frame.candidates.map((candidate, candidateIndex) => ({
      midiFloat: candidate.midiFloat,
      pitchHz: candidate.pitchHz,
      score: candidate.score,
      periodicity: candidate.periodicity,
      salience: candidate.salience,
      source: candidate.source,
      sourceRank: candidate.sourceRank,
      selected: candidateIndex === frame.selectedCandidateIndex,
    })),
    selectedCandidateIndex: frame.selectedCandidateIndex,
    selectedMidiFloat: frame.selectedMidiFloat,
    selectedPitchHz: frame.selectedPitchHz,
    selectedScore: frame.selectedScore,
    reason: frame.reason,
  }));

  const sourceDrum = listeningMap.drumEvidence;
  if (!sourceDrum) throw new Error('Drum evidence is unavailable');
  const drumBase = {
    calibration: sourceDrum.calibration,
    analyzedWindow: {
      start: sourceDrum.analyzedWindow.start,
      end: sourceDrum.analyzedWindow.end,
    },
  };
  let drum: DrumRecordV1;
  if (sourceDrum.status === 'UNAVAILABLE') drum = {
    ...drumBase,
    status: sourceDrum.status,
    reason: sourceDrum.reason,
    trackCapability: sourceDrum.trackCapability,
    attempts: [],
  };
  else if (sourceDrum.status === 'NO_EVENT') drum = {
    ...drumBase,
    status: sourceDrum.status,
    reason: sourceDrum.reason,
    trackCapability: sourceDrum.trackCapability,
    attempts: [],
  };
  else drum = {
    ...drumBase,
    status: sourceDrum.status,
    trackCapability: sourceDrum.trackCapability,
    attempts: sourceDrum.attempts.map(attempt => ({
      id: attempt.id,
      time: attempt.time,
      sourceFrame: attempt.sourceFrame,
      acoustic: {
        normalizedRms: attempt.acoustic.normalizedRms,
        normalizedOnsetStrength: attempt.acoustic.normalizedOnsetStrength,
        localOnsetBaseline: attempt.acoustic.localOnsetBaseline,
        appliedOnsetThreshold: attempt.acoustic.appliedOnsetThreshold,
      },
      decision: projectDecision(attempt.decision),
    })) as unknown as DrumObservedRecordV1['attempts'],
  };

  const record: ListeningRecordV1 = {
    version: 1,
    duration: listeningMap.duration,
    melody: { frames: melodyFrames },
    bass: {
      frames: bassFrames,
      limitations: {
        nominalLowerFrequencyBoundHz: bassEvidence.limitations.nominalLowerFrequencyBoundHz,
        upperCandidateFrequencyHz: bassEvidence.limitations.upperCandidateFrequencyHz,
        candidatesPrunedByMelody: bassEvidence.limitations.candidatesPrunedByMelody,
        voiceSeparation: bassEvidence.limitations.voiceSeparation,
        calibratedConfidence: bassEvidence.limitations.calibratedConfidence,
      },
    },
    drum,
  };
  assertJsonValue(record);
  return record;
}
