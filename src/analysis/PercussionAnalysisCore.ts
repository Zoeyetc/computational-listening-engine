import type { PercussionAnalysis, PercussionDescriptors, PercussionHit, PercussionKind } from '../types.ts';
import type { PercussionAnalysisFrame, PercussionClassification } from './PercussionAnalysis.ts';

export const PERCUSSION_CORE_ROLES: readonly PercussionKind[] = [
  'kick', 'snare', 'closed-hat', 'open-hat', 'tom', 'other-percussion',
];
export const PERCUSSION_CORE_REFRACTORY: Readonly<Record<PercussionKind, number>> = {
  kick: 0.075, snare: 0.065, 'closed-hat': 0.035, 'open-hat': 0.08, tom: 0.075,
  'other-percussion': 0.05,
};
export const PERCUSSION_CORE_THRESHOLDS = Object.freeze({
  onset: 0.2, confidence: 0.34, capability: 0.42,
});

export type PercussionNamedKind = Exclude<PercussionKind, 'other-percussion'>;
export type PercussionAmbiguityReason =
  | 'MIXED_BROADBAND_EVIDENCE'
  | 'LOW_CLASS_MARGIN'
  | 'LOW_TOP_SCORE';
export type PercussionCandidateDisposition =
  | 'ACCEPTED'
  | 'END_GUARD_REJECTED'
  | 'SUSTAINED_NON_PERCUSSIVE_REJECTED'
  | 'INSUFFICIENT_EVIDENCE_REJECTED'
  | 'REFRACTORY_REJECTED';

export type PercussionCoreClassification = PercussionClassification & Readonly<{
  ambiguityReasons: readonly PercussionAmbiguityReason[];
}>;

export type PercussionCandidateTrace = Readonly<{
  frameIndex: number;
  time: number;
  rms: number;
  onsetStrength: number;
  localOnsetBaseline: number;
  onsetThreshold: number;
  descriptors: PercussionDescriptors | null;
  classification: PercussionCoreClassification | null;
  disposition: PercussionCandidateDisposition;
  acceptedEventId: string | null;
}>;

export type PercussionCoreTrace = Readonly<{
  frameCount: number;
  candidateCount: number;
  candidates: readonly PercussionCandidateTrace[];
  collectionMilliseconds: number;
}>;

const clamp01 = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
const mean = (values: readonly number[]) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const NO_AMBIGUITY_REASONS: readonly PercussionAmbiguityReason[] = Object.freeze([]);

export function classifyPercussionCore(descriptor: PercussionDescriptors,
  collectAmbiguityReasons = false): PercussionCoreClassification {
  const d = descriptor;
  const short = clamp01(1 - d.duration / 0.16);
  const sustained = clamp01((d.duration - 0.07) / 0.35);
  const high = clamp01(d.highRatio + d.airRatio);
  const low = clamp01(d.subRatio + d.lowMidRatio);
  const broadband = clamp01(1 - Math.max(d.subRatio, d.lowMidRatio, d.midRatio, d.highRatio, d.airRatio));
  const named = {
    kick: clamp01(0.52 * d.subRatio + 0.18 * d.lowPersistence + 0.16 * (1 - d.centroid) + 0.14 * short),
    snare: clamp01(0.22 * d.midRatio + 0.18 * d.highRatio + 0.34 * d.flatness
      + 0.12 * broadband + 0.14 * short + 0.18 * d.centroid
      + (d.flatness > 0.72 && d.midRatio > 0.06 && d.lowMidRatio < 0.1 ? 0.18 : 0)),
    'closed-hat': clamp01((0.45 * high + 0.23 * d.centroid + 0.2 * short
      + 0.12 * (1 - d.highPersistence)) * (1 - 0.2 * d.flatness)),
    'open-hat': clamp01((0.38 * high + 0.2 * d.centroid + 0.25 * sustained
      + 0.17 * d.highPersistence) * (1 - 0.6 * d.flatness)),
    tom: clamp01(0.42 * d.lowMidRatio + 0.2 * d.midRatio + 0.16 * low
      + 0.14 * (1 - d.flatness) + 0.08 * d.lowPersistence),
  };
  const ranked = Object.entries(named).sort((a, b) => b[1] - a[1]) as [PercussionNamedKind, number][];
  const topScore = ranked[0][1];
  const secondScore = ranked[1][1];
  const margin = clamp01(topScore - secondScore);
  const transientQuality = clamp01(0.5 * d.onsetStrength + 0.3 * d.rms
    + 0.2 * (1 - Math.min(1, d.duration / 0.8)));
  const consistency = clamp01(topScore * 0.7 + margin * 1.6);
  const confidence = clamp01(0.38 * topScore + 0.28 * margin * 2
    + 0.2 * transientQuality + 0.14 * consistency);
  const mixedOther = d.flatness > 0.65 && d.lowMidRatio > 0.12 && high > 0.4;
  const lowMargin = margin < 0.075;
  const lowTopScore = topScore < 0.38;
  const ambiguityReasons: PercussionAmbiguityReason[] | readonly PercussionAmbiguityReason[]
    = collectAmbiguityReasons ? [] : NO_AMBIGUITY_REASONS;
  if (collectAmbiguityReasons) {
    if (mixedOther) (ambiguityReasons as PercussionAmbiguityReason[]).push('MIXED_BROADBAND_EVIDENCE');
    if (lowMargin) (ambiguityReasons as PercussionAmbiguityReason[]).push('LOW_CLASS_MARGIN');
    if (lowTopScore) (ambiguityReasons as PercussionAmbiguityReason[]).push('LOW_TOP_SCORE');
  }
  const ambiguous = mixedOther || lowMargin || lowTopScore;
  const role: PercussionKind = ambiguous ? 'other-percussion' : ranked[0][0];
  const otherScore = ambiguous ? clamp01(0.48 + (0.075 - margin) * 3 + broadband * 0.15)
    : clamp01(0.15 + broadband * 0.25);
  return { role,
    confidence: ambiguous ? Math.max(PERCUSSION_CORE_THRESHOLDS.confidence, confidence * 0.82) : confidence,
    topScore, secondScore, margin, scores: { ...named, 'other-percussion': otherScore },
    ambiguityReasons,
  };
}

function descriptorFor(frames: readonly PercussionAnalysisFrame[], index: number,
  hopSeconds: number): PercussionDescriptors {
  const frame = frames[index];
  const bandTotal = Math.max(1e-9, frame.sub + frame.lowMid + frame.mid + frame.high + frame.air);
  const peakEnergy = Math.max(frame.rms, 1e-9);
  let tail = index + 1;
  while (tail < frames.length && tail - index < 24
    && frames[tail].rms > peakEnergy * 0.22) tail += 1;
  const duration = Math.max(hopSeconds, (tail - index) * hopSeconds);
  const tailFrames = frames.slice(index + 1, Math.min(frames.length, tail + 1));
  const highNow = frame.high + frame.air;
  const lowNow = frame.sub + frame.lowMid;
  const highPersistence = highNow > 1e-9
    ? clamp01(mean(tailFrames.map(item => item.high + item.air)) / highNow) : 0;
  const lowPersistence = lowNow > 1e-9
    ? clamp01(mean(tailFrames.map(item => item.sub + item.lowMid)) / lowNow) : 0;
  const endRms = frames[Math.min(frames.length - 1, tail)]?.rms ?? 0;
  return {
    subRatio: clamp01(frame.sub / bandTotal), lowMidRatio: clamp01(frame.lowMid / bandTotal),
    midRatio: clamp01(frame.mid / bandTotal), highRatio: clamp01(frame.high / bandTotal),
    airRatio: clamp01(frame.air / bandTotal), centroid: clamp01(frame.centroid),
    spread: clamp01(frame.spread), flatness: clamp01(frame.flatness), duration,
    decay: clamp01(1 - endRms / peakEnergy), onsetStrength: clamp01(frame.onsetStrength),
    highPersistence, lowPersistence, rms: clamp01(frame.rms),
  };
}

function emptyCounts(): Record<PercussionKind, number> {
  return { kick: 0, snare: 0, 'closed-hat': 0, 'open-hat': 0, tom: 0, 'other-percussion': 0 };
}

export function publicPercussionClassification(
  classification: PercussionCoreClassification): PercussionClassification {
  return {
    role: classification.role, confidence: classification.confidence,
    topScore: classification.topScore, secondScore: classification.secondScore,
    margin: classification.margin, scores: classification.scores,
  };
}

export function analyzePercussionCore(frames: readonly PercussionAnalysisFrame[], duration: number,
  sampleRate: number, hopSeconds: number, collectTrace: boolean): Readonly<{
    analysis: PercussionAnalysis;
    trace: PercussionCoreTrace | null;
  }> {
  let collectionMilliseconds = 0;
  const traces: PercussionCandidateTrace[] | null = collectTrace ? [] : null;
  const localBaseline = (index: number) => mean(frames.slice(Math.max(0, index - 8), index)
    .map(frame => frame.onsetStrength));
  const candidateIndices = frames.flatMap((frame, index) => {
    const previous = frames[index - 1]?.onsetStrength ?? 0;
    const next = frames[index + 1]?.onsetStrength ?? 0;
    const threshold = Math.max(PERCUSSION_CORE_THRESHOLDS.onset, localBaseline(index) * 1.35 + 0.06);
    return index > 0 && frame.onsetStrength >= threshold && frame.onsetStrength >= previous
      && frame.onsetStrength >= next && frame.rms >= 0.025 ? [index] : [];
  });
  const record = (index: number, descriptors: PercussionDescriptors | null,
    classification: PercussionCoreClassification | null,
    disposition: PercussionCandidateDisposition, acceptedEventId: string | null) => {
    if (!traces) return;
    const started = performance.now();
    const frame = frames[index];
    const baseline = localBaseline(index);
    traces.push(Object.freeze({
      frameIndex: index, time: frame.time, rms: frame.rms, onsetStrength: frame.onsetStrength,
      localOnsetBaseline: baseline,
      onsetThreshold: Math.max(PERCUSSION_CORE_THRESHOLDS.onset, baseline * 1.35 + 0.06),
      descriptors, classification, disposition, acceptedEventId,
    }));
    collectionMilliseconds += performance.now() - started;
  };
  const events: PercussionHit[] = [];
  const lastByRole = new Map<PercussionKind, number>();
  let lastAcceptedTime = -Infinity;
  for (const index of candidateIndices) {
    const frame = frames[index];
    if (frame.time > duration - 0.3) {
      record(index, null, null, 'END_GUARD_REJECTED', null);
      continue;
    }
    const descriptors = descriptorFor(frames, index, hopSeconds);
    const highDominance = descriptors.highRatio + descriptors.airRatio;
    if ((descriptors.duration > 0.45 && highDominance < 0.38)
      || (descriptors.flatness < 0.01 && descriptors.duration > 0.3)) {
      record(index, descriptors, null, 'SUSTAINED_NON_PERCUSSIVE_REJECTED', null);
      continue;
    }
    const classification = classifyPercussionCore(descriptors, collectTrace);
    if (classification.confidence < PERCUSSION_CORE_THRESHOLDS.confidence
      || descriptors.onsetStrength < PERCUSSION_CORE_THRESHOLDS.onset) {
      record(index, descriptors, classification, 'INSUFFICIENT_EVIDENCE_REJECTED', null);
      continue;
    }
    const previous = lastByRole.get(classification.role) ?? -Infinity;
    if (frame.time - previous < PERCUSSION_CORE_REFRACTORY[classification.role]
      || frame.time - lastAcceptedTime < 0.03) {
      record(index, descriptors, classification, 'REFRACTORY_REJECTED', null);
      continue;
    }
    const intensity = clamp01(0.5 * descriptors.onsetStrength + 0.3 * descriptors.rms
      + 0.2 * Math.sqrt(descriptors.onsetStrength * descriptors.rms));
    const id = `percussion-${String(index).padStart(6, '0')}-${classification.role}`;
    events.push({ id, time: frame.time, type: classification.role, strength: intensity,
      confidence: classification.confidence, topScore: classification.topScore,
      secondScore: classification.secondScore, margin: classification.margin, descriptors });
    lastByRole.set(classification.role, frame.time);
    lastAcceptedTime = frame.time;
    record(index, descriptors, classification, 'ACCEPTED', id);
  }
  const classCounts = emptyCounts();
  for (const event of events) classCounts[event.type] += 1;
  const density = duration > 0 ? events.length / duration : 0;
  const confidence = events.length ? mean(events.map(event => event.confidence ?? 0)) : 0;
  const pathological = density > 28;
  const eventSpan = events.length > 1 ? events.at(-1)!.time - events[0].time : 0;
  const available = events.length >= 3 && eventSpan >= 0.5
    && confidence >= PERCUSSION_CORE_THRESHOLDS.capability && !pathological;
  const analysis: PercussionAnalysis = {
    version: 1, available, confidence: clamp01(confidence), candidateCount: candidateIndices.length,
    acceptedEventCount: events.length, eventDensity: Number.isFinite(density) ? density : 0,
    classCounts, events,
    metadata: {
      preprocessing: 'positive-spectral-difference-shared-stft', frameSize: 2048, hopSize: 1024,
      bandsHz: { sub: [20, 160], lowMid: [160, 600], mid: [600, 2500],
        high: [2500, Math.min(8000, sampleRate / 2)],
        air: [Math.min(8000, sampleRate / 2), sampleRate / 2] },
      descriptorNormalization: 'unit-energy-ratios-and-nyquist-normalized-moments',
      classifier: 'deterministic-rule-scores-v1', onsetThreshold: PERCUSSION_CORE_THRESHOLDS.onset,
      confidenceThreshold: PERCUSSION_CORE_THRESHOLDS.confidence,
      capabilityThreshold: PERCUSSION_CORE_THRESHOLDS.capability,
      refractorySeconds: PERCUSSION_CORE_REFRACTORY,
    },
  };
  return Object.freeze({ analysis,
    trace: traces ? Object.freeze({ frameCount: frames.length, candidateCount: candidateIndices.length,
      candidates: Object.freeze(traces), collectionMilliseconds }) : null,
  });
}
