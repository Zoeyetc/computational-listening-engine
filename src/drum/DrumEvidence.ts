import type {
  DrumAmbiguityReason,
  DrumClassifierEvidence,
  DrumDecision,
  DrumEvidence,
  DrumEvidenceAttempt,
  DrumHypothesis,
  DrumNamedKind,
  PercussionAnalysis,
  PercussionHit,
} from '../types.ts';
import type {
  PercussionCandidateTrace,
  PercussionCoreClassification,
  PercussionCoreTrace,
} from '../analysis/PercussionAnalysisCore.ts';

const NAMED_KINDS: readonly DrumNamedKind[] = Object.freeze([
  'kick', 'snare', 'closed-hat', 'open-hat', 'tom',
]);

function classifierEvidence(classification: PercussionCoreClassification): DrumClassifierEvidence {
  const hypotheses = NAMED_KINDS
    .map(kind => ({ kind, comparativeScore: classification.scores[kind] }))
    .sort((left, right) => right.comparativeScore - left.comparativeScore
      || NAMED_KINDS.indexOf(left.kind) - NAMED_KINDS.indexOf(right.kind))
    .map((hypothesis, index) => Object.freeze({
      ...hypothesis,
      rank: (index + 1) as DrumHypothesis['rank'],
    }));
  return Object.freeze({
    calibration: 'UNCALIBRATED',
    hypotheses: Object.freeze(hypotheses) as unknown as DrumClassifierEvidence['hypotheses'],
    topComparativeScore: classification.topScore,
    secondComparativeScore: classification.secondScore,
    comparativeMargin: classification.margin,
    transientQuality: classification.transientQuality,
    consistency: classification.consistency,
    uncalibratedConfidence: classification.confidence,
  });
}

function acceptedHit(candidate: PercussionCandidateTrace,
  hits: ReadonlyMap<string, PercussionHit>): PercussionHit {
  const id = candidate.acceptedEventId;
  const hit = id ? hits.get(id) : undefined;
  if (!hit) throw new Error('Accepted Drum evidence is missing its Percussion event');
  return hit;
}

/** Internal mapping seam, exported from its module for deterministic contract tests only. */
export function decisionFromPercussionCandidate(candidate: PercussionCandidateTrace,
  hits: ReadonlyMap<string, PercussionHit>): DrumDecision {
  const classification = candidate.classification;
  if (candidate.disposition === 'ACCEPTED') {
    if (!classification) throw new Error('Accepted Drum evidence is missing classifier evidence');
    const hit = acceptedHit(candidate, hits);
    const evidence = classifierEvidence(classification);
    if (classification.role === 'other-percussion') {
      if (!classification.ambiguityReasons.length) {
        throw new Error('Ambiguous Drum evidence is missing its abstention reason');
      }
      return Object.freeze({
        state: 'ABSTAINED',
        reason: 'AMBIGUOUS_CLASS_EVIDENCE',
        ambiguityFallback: 'other-percussion',
        ambiguityReasons: Object.freeze(
          [...classification.ambiguityReasons] as DrumAmbiguityReason[],
        ) as unknown as readonly [DrumAmbiguityReason, ...DrumAmbiguityReason[]],
        classifierEvidence: evidence,
        physicalEventStrength: hit.strength,
        percussionEventId: hit.id,
      });
    }
    return Object.freeze({
      state: 'SELECTED',
      reason: 'NAMED_CLASS_ACCEPTED',
      selectedClass: classification.role,
      classifierEvidence: evidence,
      physicalEventStrength: hit.strength,
      percussionEventId: hit.id,
    });
  }
  if (candidate.disposition === 'INSUFFICIENT_EVIDENCE_REJECTED') {
    if (!classification) throw new Error('Insufficient Drum evidence is missing classifier evidence');
    return Object.freeze({
      state: 'ABSTAINED',
      reason: 'INSUFFICIENT_EVIDENCE',
      classifierEvidence: classifierEvidence(classification),
    });
  }
  if (candidate.disposition === 'SUSTAINED_NON_PERCUSSIVE_REJECTED') {
    return Object.freeze({ state: 'REJECTED', reason: 'NON_PERCUSSIVE_SUSTAINED' });
  }
  if (candidate.disposition === 'END_GUARD_REJECTED') {
    return Object.freeze({ state: 'REJECTED', reason: 'INCOMPLETE_RIGHT_EDGE' });
  }
  if (!classification) throw new Error('Deduplicated Drum evidence is missing classifier evidence');
  return Object.freeze({
    state: 'REJECTED',
    reason: 'TEMPORAL_DEDUPLICATION',
    classifierEvidence: classifierEvidence(classification),
  });
}

export function createDrumEvidence(analysis: PercussionAnalysis, trace: PercussionCoreTrace,
  duration: number): DrumEvidence {
  const base = Object.freeze({
    version: 1 as const,
    experimental: true as const,
    calibration: 'UNCALIBRATED' as const,
    analyzedWindow: Object.freeze({ start: 0, end: duration }),
  });
  if (!trace.candidates.length) {
    return Object.freeze({
      ...base,
      status: 'NO_EVENT',
      reason: 'NO_PERCUSSIVE_OPPORTUNITY',
      trackCapability: 'UNAVAILABLE',
      attemptCount: 0,
      attempts: Object.freeze([]) as readonly [],
    });
  }
  const hits = new Map(analysis.events.map(hit => [hit.id, hit]));
  const attempts = trace.candidates.map((candidate): DrumEvidenceAttempt => Object.freeze({
    id: `drum-attempt-${String(candidate.frameIndex).padStart(6, '0')}`,
    time: candidate.time,
    sourceFrame: candidate.frameIndex,
    acoustic: Object.freeze({
      normalizedRms: candidate.rms,
      normalizedOnsetStrength: candidate.onsetStrength,
      localOnsetBaseline: candidate.localOnsetBaseline,
      appliedOnsetThreshold: candidate.onsetThreshold,
    }),
    decision: decisionFromPercussionCandidate(candidate, hits),
  }));
  return Object.freeze({
    ...base,
    status: 'OBSERVED',
    trackCapability: analysis.available ? 'AVAILABLE' : 'UNAVAILABLE',
    attemptCount: attempts.length,
    attempts: Object.freeze(attempts) as unknown as readonly [
      DrumEvidenceAttempt,
      ...DrumEvidenceAttempt[],
    ],
  });
}

export function shiftDrumEvidence(evidence: DrumEvidence | null | undefined, offset: number,
  trackAvailable: boolean): DrumEvidence | null {
  if (!evidence) return null;
  const trackCapability = trackAvailable ? 'AVAILABLE' as const : 'UNAVAILABLE' as const;
  const analyzedWindow = Object.freeze({
    start: evidence.analyzedWindow.start + offset,
    end: evidence.analyzedWindow.end + offset,
  });
  if (evidence.status === 'UNAVAILABLE') {
    return Object.freeze({ ...evidence, trackCapability: 'UNAVAILABLE', analyzedWindow });
  }
  if (evidence.status === 'NO_EVENT') {
    return Object.freeze({ ...evidence, trackCapability: 'UNAVAILABLE', analyzedWindow });
  }
  const attempts = evidence.attempts.map(attempt => Object.freeze({
    ...attempt,
    time: attempt.time + offset,
  })) as unknown as readonly [DrumEvidenceAttempt, ...DrumEvidenceAttempt[]];
  return Object.freeze({ ...evidence, trackCapability, analyzedWindow,
    attempts: Object.freeze(attempts) });
}
