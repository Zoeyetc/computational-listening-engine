import { confidence, detection, finite, mean, options, ratio } from './common.ts';
import type { ConfidenceObservation, EvaluationOptions, PitchFrame } from './types.ts';

function validate(frames: readonly PitchFrame[]) {
  frames.forEach((frame, i) => {
    finite(frame.time, 'frame.time', 0); confidence(frame.confidence);
    if (frame.midi !== null) finite(frame.midi, 'frame.midi');
    if (i && frame.time <= frames[i - 1].time) throw new RangeError('Pitch frames must have strictly increasing times');
  });
}
export function scorePitch(reference: readonly PitchFrame[], predicted: readonly PitchFrame[], overrides: Partial<EvaluationOptions> = {}) {
  validate(reference); validate(predicted);
  const config = options(overrides);
  let tp = 0, fp = 0, fn = 0, tn = 0, correct = 0, octaves = 0, aligned = 0, cursor = 0;
  const errors: number[] = [], observations: ConfidenceObservation[] = [];
  for (const frame of reference) {
    while (cursor + 1 < predicted.length && Math.abs(predicted[cursor + 1].time - frame.time) < Math.abs(predicted[cursor].time - frame.time)) cursor++;
    const nearest = predicted[cursor];
    const p = nearest && Math.abs(nearest.time - frame.time) <= config.frameToleranceSeconds ? nearest : undefined;
    if (p) aligned++;
    const voiced = frame.midi !== null, detected = p !== undefined && p.midi !== null;
    if (voiced && detected) tp++; else if (voiced) fn++; else if (detected) fp++; else tn++;
    const cents = voiced && detected ? 100 * (p!.midi! - frame.midi!) : null;
    const accurate = cents !== null && Math.abs(cents) <= config.pitchToleranceCents;
    if (accurate) correct++;
    if (cents !== null) {
      errors.push(Math.abs(cents));
      const octave = Math.round(cents / 1200);
      if (octave !== 0 && Math.abs(cents - octave * 1200) <= config.pitchToleranceCents) octaves++;
    }
    // Engine pitch confidence describes emitted pitch, not probability of unvoiced audio.
    if (detected && p!.confidence !== undefined) observations.push({ confidence: p!.confidence, correct: accurate });
  }
  return { metrics: { pitchAccuracy: ratio(correct, tp + fn), centError: mean(errors), octaveErrorRate: ratio(octaves, tp),
    voiced: detection(tp, tp + fn, tp + fp),
    confusionMatrix: { voicedVoiced: tp, voicedUnvoiced: fn, unvoicedVoiced: fp, unvoicedUnvoiced: tn },
    referenceFrames: reference.length, alignedFrames: aligned, alignmentCoverage: ratio(aligned, reference.length),
    jointlyVoicedFrames: tp }, observations };
}
export const evaluatePitch = (reference: readonly PitchFrame[], predicted: readonly PitchFrame[], config: Partial<EvaluationOptions> = {}) => scorePitch(reference, predicted, config).metrics;
export type PitchMetrics = ReturnType<typeof evaluatePitch>;
