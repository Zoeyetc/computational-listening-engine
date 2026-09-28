import {
  analyzePcmListeningWithPercussionTrace,
  type PcmAudio,
} from '../analysis/AudioAnalysis.ts';
import type {
  PercussionAmbiguityReason,
  PercussionCandidateDisposition,
  PercussionNamedKind,
} from '../analysis/PercussionAnalysisCore.ts';
import type { ListeningMap, PercussionDescriptors, PercussionKind } from '../types.ts';

export type DrumEvidenceHypothesis = Readonly<{
  rank: number;
  role: PercussionNamedKind;
  score: number;
}>;

export type DrumEvidenceDecision = Readonly<{
  state: 'SELECTED' | 'ABSTAINED' | 'REJECTED';
  role: PercussionNamedKind | null;
  reason:
    | 'NAMED_CLASS_ACCEPTED'
    | 'AMBIGUOUS_CLASS_EVIDENCE'
    | 'INSUFFICIENT_EVIDENCE'
    | 'NON_PERCUSSIVE_SUSTAINED'
    | 'INCOMPLETE_RIGHT_EDGE'
    | 'TEMPORAL_DEDUPLICATION';
}>;

export type DrumEvidenceEvent = Readonly<{
  frameIndex: number;
  time: number;
  acoustic: Readonly<{
    rms: number;
    onsetStrength: number;
    localOnsetBaseline: number;
    onsetThreshold: number;
  }>;
  descriptors: PercussionDescriptors | null;
  hypotheses: readonly DrumEvidenceHypothesis[];
  ambiguityFallback: Readonly<{
    role: 'other-percussion';
    support: number;
    reasons: readonly PercussionAmbiguityReason[];
  }> | null;
  production: Readonly<{
    disposition: PercussionCandidateDisposition;
    accepted: boolean;
    role: PercussionKind | null;
    confidence: number | null;
    topScore: number | null;
    secondScore: number | null;
    margin: number | null;
    eventId: string | null;
  }>;
  decision: DrumEvidenceDecision;
}>;

export type DrumEvidenceProbe = Readonly<{
  version: 0;
  taxonomy: Readonly<{
    named: readonly PercussionNamedKind[];
    ambiguityFallback: 'other-percussion';
  }>;
  frameCount: number;
  onsetCandidateCount: number;
  selectedCount: number;
  abstainedCount: number;
  rejectedCount: number;
  events: readonly DrumEvidenceEvent[];
  retainedNumericPayloadBytes: number;
  performance: Readonly<{
    traceCollectionMilliseconds: number;
    contractAssemblyMilliseconds: number;
    incrementalProbeMilliseconds: number;
    incrementalMillisecondsPerCandidate: number;
    incrementalMillisecondsPerFrame: number;
    fullAnalysisWallMilliseconds: number;
    reusedGeneralFftAndTransientFeatures: true;
    duplicatedAcousticComputation: false;
  }>;
  limitations: Readonly<{
    deterministicHeuristicClassifier: true;
    calibratedClassProbabilities: false;
    sourceSeparation: false;
    temporalDrumPath: false;
    syntheticFixturesEstablishCodePathsOnly: true;
  }>;
}>;

export type DrumEvidenceProbeResult = Readonly<{
  map: ListeningMap;
  drum: DrumEvidenceProbe;
}>;

const NAMED_ROLES: readonly PercussionNamedKind[] = [
  'kick', 'snare', 'closed-hat', 'open-hat', 'tom',
];

function decisionFor(disposition: PercussionCandidateDisposition,
  role: PercussionKind | null): DrumEvidenceDecision {
  if (disposition === 'ACCEPTED' && role && role !== 'other-percussion') {
    return Object.freeze({ state: 'SELECTED', role, reason: 'NAMED_CLASS_ACCEPTED' });
  }
  if (disposition === 'ACCEPTED') {
    return Object.freeze({ state: 'ABSTAINED', role: null, reason: 'AMBIGUOUS_CLASS_EVIDENCE' });
  }
  if (disposition === 'INSUFFICIENT_EVIDENCE_REJECTED') {
    return Object.freeze({ state: 'ABSTAINED', role: null, reason: 'INSUFFICIENT_EVIDENCE' });
  }
  if (disposition === 'SUSTAINED_NON_PERCUSSIVE_REJECTED') {
    return Object.freeze({ state: 'REJECTED', role: null, reason: 'NON_PERCUSSIVE_SUSTAINED' });
  }
  if (disposition === 'END_GUARD_REJECTED') {
    return Object.freeze({ state: 'REJECTED', role: null, reason: 'INCOMPLETE_RIGHT_EDGE' });
  }
  return Object.freeze({ state: 'REJECTED', role: null, reason: 'TEMPORAL_DEDUPLICATION' });
}

function numericPayloadBytes(events: readonly DrumEvidenceEvent[]) {
  return events.reduce((bytes, event) => {
    const acousticNumbers = 4;
    const descriptorNumbers = event.descriptors ? 14 : 0;
    const hypothesisNumbers = event.hypotheses.length * 2;
    const fallbackNumbers = event.ambiguityFallback ? 1 : 0;
    const productionNumbers = event.production.confidence === null ? 0 : 4;
    return bytes + (2 + acousticNumbers + descriptorNumbers + hypothesisNumbers
      + fallbackNumbers + productionNumbers) * Float64Array.BYTES_PER_ELEMENT;
  }, 0);
}

export function probeDrumEvidence(pcm: PcmAudio): DrumEvidenceProbeResult {
  const fullStarted = performance.now();
  const result = analyzePcmListeningWithPercussionTrace(pcm);
  const assemblyStarted = performance.now();
  const events = result.trace.candidates.map(candidate => {
    const classification = candidate.classification;
    const hypotheses = classification
      ? NAMED_ROLES.map(role => ({ role, score: classification.scores[role] }))
        .sort((a, b) => b.score - a.score || a.role.localeCompare(b.role))
        .map((hypothesis, index) => Object.freeze({ ...hypothesis, rank: index + 1 }))
      : [];
    const ambiguityFallback = classification?.role === 'other-percussion'
      ? Object.freeze({ role: 'other-percussion' as const,
        support: classification.scores['other-percussion'], reasons: classification.ambiguityReasons })
      : null;
    return Object.freeze({
      frameIndex: candidate.frameIndex,
      time: candidate.time,
      acoustic: Object.freeze({ rms: candidate.rms, onsetStrength: candidate.onsetStrength,
        localOnsetBaseline: candidate.localOnsetBaseline, onsetThreshold: candidate.onsetThreshold }),
      descriptors: candidate.descriptors,
      hypotheses: Object.freeze(hypotheses),
      ambiguityFallback,
      production: Object.freeze({ disposition: candidate.disposition,
        accepted: candidate.disposition === 'ACCEPTED',
        role: classification?.role ?? null, confidence: classification?.confidence ?? null,
        topScore: classification?.topScore ?? null, secondScore: classification?.secondScore ?? null,
        margin: classification?.margin ?? null, eventId: candidate.acceptedEventId }),
      decision: decisionFor(candidate.disposition, classification?.role ?? null),
    });
  });
  const contractAssemblyMilliseconds = performance.now() - assemblyStarted;
  const incrementalProbeMilliseconds = result.trace.collectionMilliseconds + contractAssemblyMilliseconds;
  const selectedCount = events.filter(event => event.decision.state === 'SELECTED').length;
  const abstainedCount = events.filter(event => event.decision.state === 'ABSTAINED').length;
  const rejectedCount = events.filter(event => event.decision.state === 'REJECTED').length;
  const drum: DrumEvidenceProbe = Object.freeze({
    version: 0,
    taxonomy: Object.freeze({ named: NAMED_ROLES, ambiguityFallback: 'other-percussion' }),
    frameCount: result.trace.frameCount,
    onsetCandidateCount: result.trace.candidateCount,
    selectedCount, abstainedCount, rejectedCount,
    events: Object.freeze(events),
    retainedNumericPayloadBytes: numericPayloadBytes(events),
    performance: Object.freeze({
      traceCollectionMilliseconds: result.trace.collectionMilliseconds,
      contractAssemblyMilliseconds,
      incrementalProbeMilliseconds,
      incrementalMillisecondsPerCandidate: result.trace.candidateCount
        ? incrementalProbeMilliseconds / result.trace.candidateCount : 0,
      incrementalMillisecondsPerFrame: result.trace.frameCount
        ? incrementalProbeMilliseconds / result.trace.frameCount : 0,
      fullAnalysisWallMilliseconds: performance.now() - fullStarted,
      reusedGeneralFftAndTransientFeatures: true,
      duplicatedAcousticComputation: false,
    }),
    limitations: Object.freeze({
      deterministicHeuristicClassifier: true,
      calibratedClassProbabilities: false,
      sourceSeparation: false,
      temporalDrumPath: false,
      syntheticFixturesEstablishCodePathsOnly: true,
    }),
  });
  return Object.freeze({ map: result.map, drum });
}
