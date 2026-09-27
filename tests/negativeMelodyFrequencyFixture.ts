import { MELODY_ANALYSIS } from '../src/analysis/MelodyAnalysis.ts';

/**
 * Deterministic noisy moving-average frame that made the lower-bound YIN
 * fallback interpolate across zero in Engine 0.3.0. Before the invariant fix,
 * it generated approximately -2208.37 Hz. This is a synthetic regression
 * fixture and is not claimed to reproduce the unavailable Safari microphone PCM.
 */
export function negativeMelodyFrequencyFixture() {
  let state = 2;
  const noise = Float32Array.from({ length: MELODY_ANALYSIS.frameSize + 16 }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff * 2 - 1;
  });
  return Float32Array.from({ length: MELODY_ANALYSIS.frameSize }, (_, index) =>
    0.1 * (noise[index + 16] + 0.32400081 * noise[index + 9] + 0.151 * noise[index + 8]));
}
