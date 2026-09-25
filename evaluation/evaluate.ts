import { options } from './common.ts';
import { evaluateConfidence } from './confidence.ts';
import { scorePitch } from './pitch.ts';
import { scoreMelody } from './melody.ts';
import { scoreRhythm } from './rhythm.ts';
import { scoreHarmony } from './harmony.ts';
import type { EvaluationData, EvaluationOptions } from './types.ts';

/** Omitted truth domains are unannotated; omitted prediction domains are misses. */
export function evaluate(reference: EvaluationData, predicted: EvaluationData, overrides: Partial<EvaluationOptions> = {}) {
  const config = options(overrides);
  const pitch = reference.pitch === undefined ? null : scorePitch(reference.pitch, predicted.pitch ?? [], config);
  const melody = reference.melody === undefined ? null : scoreMelody(reference.melody, predicted.melody ?? [], config);
  const rhythm = reference.rhythm === undefined ? null : scoreRhythm(reference.rhythm, predicted.rhythm ?? { bpm: null, beats: [] }, config);
  const harmony = reference.harmony === undefined ? null : scoreHarmony(reference.harmony, predicted.harmony ?? { chords: [], keys: [] }, config);
  return { pitch: pitch?.metrics ?? null, melody: melody?.metrics ?? null, rhythm: rhythm?.metrics ?? null, harmony: harmony?.metrics ?? null,
    confidence: {
      pitch: evaluateConfidence(pitch?.observations ?? [], config.calibrationBins),
      melody: evaluateConfidence(melody?.observations ?? [], config.calibrationBins),
      tempo: evaluateConfidence(rhythm?.observations ?? [], config.calibrationBins),
      chords: evaluateConfidence(harmony?.chordObservations ?? [], config.calibrationBins),
      keys: evaluateConfidence(harmony?.keyObservations ?? [], config.calibrationBins),
    } };
}
export type EvaluationResult = ReturnType<typeof evaluate>;
