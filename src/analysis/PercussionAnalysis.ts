import type { PercussionAnalysis, PercussionDescriptors, PercussionKind } from '../types.ts';
import {
  analyzePercussionCore,
  classifyPercussionCore,
  PERCUSSION_CORE_ROLES,
  publicPercussionClassification,
} from './PercussionAnalysisCore.ts';

export type PercussionAnalysisFrame = Readonly<{
  time: number;
  rms: number;
  onsetStrength: number;
  sub: number;
  lowMid: number;
  mid: number;
  high: number;
  air: number;
  centroid: number;
  spread: number;
  flatness: number;
}>;

export type PercussionClassification = Readonly<{
  role: PercussionKind;
  confidence: number;
  topScore: number;
  secondScore: number;
  margin: number;
  scores: Readonly<Record<PercussionKind, number>>;
}>;

/**
 * Transparent deterministic baseline. Scores combine spectral shape with decay;
 * low class margin is represented honestly as Other Percussive.
 */
export function classifyPercussion(descriptor: PercussionDescriptors): PercussionClassification {
  return publicPercussionClassification(classifyPercussionCore(descriptor));
}

export function analyzePercussion(frames: readonly PercussionAnalysisFrame[], duration: number,
  sampleRate: number, hopSeconds: number): PercussionAnalysis {
  return analyzePercussionCore(frames, duration, sampleRate, hopSeconds, false).analysis;
}

export const PERCUSSION_ROLES = PERCUSSION_CORE_ROLES;
