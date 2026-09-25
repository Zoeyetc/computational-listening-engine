import type { MelodyEvidenceTimeline } from '../melody-evidence/types.ts';
import { bassCandidatesFromMelodyEvidence } from './candidates.ts';
import { solveBassPath } from './solver.ts';
import type { BassEvidence, BassSnapshot } from './types.ts';

/** Runs an independent path over the same retained candidates used by Melody. */
export function analyzeBassFromMelodyEvidence(timeline: MelodyEvidenceTimeline): BassEvidence {
  const candidates = bassCandidatesFromMelodyEvidence(timeline);
  const path = solveBassPath(candidates);
  const frames = candidates.map((frame, index) => {
    const selectedCandidateIndex = path.selectedCandidateIndexes[index];
    const selected = selectedCandidateIndex === null ? null : frame.candidates[selectedCandidateIndex];
    return Object.freeze({ time: frame.time, candidates: frame.candidates,
      selectedCandidateIndex, selectedPitchHz: selected?.pitchHz ?? null,
      selectedMidiFloat: selected?.midiFloat ?? null, selectedScore: selected?.score ?? null,
      reason: selected ? 'SELECTED' as const : frame.candidates.length ? 'PATH_ABSTAINED' as const : 'NO_CANDIDATE' as const });
  });
  return Object.freeze({ version: 1, source: 'melody-candidate-evidence-v1', frames: Object.freeze(frames), path,
    limitations: Object.freeze({ nominalLowerFrequencyBoundHz: 80, upperCandidateFrequencyHz: 330, candidatesPrunedByMelody: true,
      voiceSeparation: false, calibratedConfidence: false }) });
}

/** Returns the latest frame decision at time, without inventing note boundaries. */
export function lookupBassSnapshot(evidence: BassEvidence, time: number): BassSnapshot {
  if (!Number.isFinite(time)) throw new RangeError('time must be finite');
  const frames = evidence.frames;
  if (!frames.length || time < frames[0].time || time > frames[frames.length - 1].time) {
    return { time, available: false, pitchHz: null, midiFloat: null, candidateScore: null,
      reason: 'OUTSIDE_EVIDENCE' };
  }
  let low = 0, high = frames.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >>> 1;
    if (frames[middle].time <= time) low = middle; else high = middle - 1;
  }
  const frame = frames[low];
  return { time, available: frame.selectedCandidateIndex !== null,
    pitchHz: frame.selectedPitchHz, midiFloat: frame.selectedMidiFloat,
    candidateScore: frame.selectedScore, reason: frame.reason };
}
