import type { BassCandidate, BassCandidateFrame, BassPath } from './types.ts';

/** Structural starter objective; these weights are not tuned or calibrated. */
export const BASS_PATH_OBJECTIVE = Object.freeze({
  baseline: 0.55,
  lowRegisterPreference: 0.20,
  semitoneJumpCost: 0.025,
  entryExitCost: 0.10,
  octaveJumpCost: 0.08,
});

function emission(candidate: BassCandidate, frame: BassCandidateFrame): number {
  const lowerCount = frame.candidates.filter(other => other.midiFloat > candidate.midiFloat).length;
  const registerOrder = frame.candidates.length > 1 ? lowerCount / (frame.candidates.length - 1) : 0;
  return candidate.score - BASS_PATH_OBJECTIVE.baseline
    + BASS_PATH_OBJECTIVE.lowRegisterPreference * registerOrder;
}

function transition(previous: BassCandidate | null, current: BassCandidate | null): number {
  if (previous === null && current === null) return 0;
  if (previous === null || current === null) return -BASS_PATH_OBJECTIVE.entryExitCost;
  const jump = Math.abs(current.midiFloat - previous.midiFloat);
  return -BASS_PATH_OBJECTIVE.semitoneJumpCost * jump
    - (Math.abs(jump - 12) <= 0.5 ? BASS_PATH_OBJECTIVE.octaveJumpCost : 0);
}

/** Single-track dynamic program; low-register support and continuity matter alongside local score. */
export function solveBassPath(frames: readonly BassCandidateFrame[]): BassPath {
  if (!frames.length) return Object.freeze({ version: 1, selectedCandidateIndexes: Object.freeze([]), objective: 0 });
  frames.forEach((frame, index) => {
    if (!Number.isFinite(frame.time) || frame.time < 0 || (index > 0 && frame.time < frames[index - 1].time)) {
      throw new RangeError('Bass frame times must be finite, nonnegative, and nondecreasing');
    }
    frame.candidates.forEach(candidate => {
      if (!Number.isFinite(candidate.pitchHz) || candidate.pitchHz <= 0 || !Number.isFinite(candidate.midiFloat)
        || !Number.isFinite(candidate.score) || candidate.score < 0 || candidate.score > 1) {
        throw new RangeError('Invalid bass candidate');
      }
    });
  });
  type State = { candidateIndex: number | null; score: number; previousState: number };
  const layers: State[][] = [];
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex];
    const states = [null, ...frame.candidates.map((_, index) => index)];
    const previous = layers[frameIndex - 1];
    const layer = states.map((candidateIndex): State => {
      const candidate = candidateIndex === null ? null : frame.candidates[candidateIndex];
      const local = candidate ? emission(candidate, frame) : 0;
      if (!previous) return { candidateIndex, score: local, previousState: -1 };
      let best = Number.NEGATIVE_INFINITY, previousState = 0;
      previous.forEach((state, index) => {
        const earlier = state.candidateIndex === null ? null : frames[frameIndex - 1].candidates[state.candidateIndex];
        const objective = state.score + transition(earlier, candidate) + local;
        if (objective > best) { best = objective; previousState = index; }
      });
      return { candidateIndex, score: best, previousState };
    });
    layers.push(layer);
  }
  const final = layers.at(-1)!;
  let current = final.reduce((best, state, index) => state.score > final[best].score ? index : best, 0);
  const objective = final[current].score;
  const selectedCandidateIndexes: (number | null)[] = Array(frames.length).fill(null);
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const state = layers[index][current];
    selectedCandidateIndexes[index] = state.candidateIndex;
    current = state.previousState;
  }
  return Object.freeze({ version: 1, selectedCandidateIndexes: Object.freeze(selectedCandidateIndexes), objective });
}
