import { decodeNormalizedEvidence, readCompactMelodyEvidenceStorage } from '../melody-evidence/compactTimeline.ts';
import type { MelodyEvidenceTimeline } from '../melody-evidence/types.ts';
import { hzToMidi } from '../pitch.ts';
import type { BassCandidate, BassCandidateFrame } from './types.ts';

/** Adapt retained candidates only. Melody selections and final confidence are never read. */
export function bassCandidatesFromMelodyEvidence(timeline: MelodyEvidenceTimeline): readonly BassCandidateFrame[] {
  const storage = readCompactMelodyEvidenceStorage(timeline);
  const frames: BassCandidateFrame[] = [];
  for (let frameIndex = 0; frameIndex < timeline.frameCount; frameIndex += 1) {
    const candidates: BassCandidate[] = [];
    for (let index = storage.candidateOffsets[frameIndex]; index < storage.candidateOffsets[frameIndex + 1]; index += 1) {
      const pitchHz = storage.candidatePitchHz[index];
      if (pitchHz > 330) continue;
      candidates.push(Object.freeze({
        pitchHz, midiFloat: hzToMidi(pitchHz),
        score: decodeNormalizedEvidence(storage.candidateScore[index]),
        periodicity: decodeNormalizedEvidence(storage.candidatePeriodicity[index]),
        salience: decodeNormalizedEvidence(storage.candidateSalience[index]),
        source: 'melody-usable', sourceRank: index - storage.candidateOffsets[frameIndex] + 1,
      }));
    }
    for (let index = storage.rejectedCandidateOffsets[frameIndex]; index < storage.rejectedCandidateOffsets[frameIndex + 1]; index += 1) {
      if (storage.rejectedCandidateReasonCodes[index] !== 0) continue;
      const pitchHz = storage.rejectedCandidateFrequencyHz[index];
      candidates.push(Object.freeze({
        pitchHz, midiFloat: hzToMidi(pitchHz),
        score: decodeNormalizedEvidence(storage.rejectedCandidateScore[index]),
        periodicity: decodeNormalizedEvidence(storage.rejectedCandidatePeriodicity[index]),
        salience: decodeNormalizedEvidence(storage.rejectedCandidateSalience[index]),
        source: 'melody-range-rejected-low', sourceRank: index - storage.rejectedCandidateOffsets[frameIndex] + 1,
      }));
    }
    frames.push(Object.freeze({ time: storage.frameTimes[frameIndex], candidates: Object.freeze(candidates) }));
  }
  return Object.freeze(frames);
}
