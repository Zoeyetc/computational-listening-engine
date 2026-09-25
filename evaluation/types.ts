/** Evaluation-only contracts. Times are seconds; pitch is fractional MIDI. */
export type PitchFrame = Readonly<{ time: number; midi: number | null; confidence?: number }>;
export type Note = Readonly<{ start: number; end: number; midi: number; confidence?: number }>;
export type LabelSegment = Readonly<{
  start: number; end: number; label: string | null;
  top2?: readonly string[]; confidence?: number;
}>;
export type Rhythm = Readonly<{ bpm: number | null; beats: readonly number[]; confidence?: number }>;
export type Harmony = Readonly<{ chords: readonly LabelSegment[]; keys: readonly LabelSegment[] }>;
export type EvaluationData = Readonly<{
  pitch?: readonly PitchFrame[];
  melody?: readonly Note[];
  rhythm?: Rhythm;
  harmony?: Harmony;
}>;
export type ConfidenceObservation = Readonly<{ confidence: number; correct: boolean; weight?: number }>;
export type EvaluationOptions = Readonly<{
  pitchToleranceCents: number;
  frameToleranceSeconds: number;
  onsetToleranceSeconds: number;
  offsetToleranceSeconds: number;
  offsetToleranceRatio: number;
  beatToleranceSeconds: number;
  keyTransitionToleranceSeconds: number;
  tempoToleranceBpm: number;
  calibrationBins: number;
}>;
export const DEFAULT_OPTIONS: EvaluationOptions = Object.freeze({
  pitchToleranceCents: 50, frameToleranceSeconds: 0.025,
  onsetToleranceSeconds: 0.05, offsetToleranceSeconds: 0.05, offsetToleranceRatio: 0.2,
  beatToleranceSeconds: 0.07, keyTransitionToleranceSeconds: 0.5,
  tempoToleranceBpm: 2, calibrationBins: 10,
});
export type BenchmarkCase<Input> = Readonly<{ id: string; input: Input; truth: EvaluationData }>;
export type BenchmarkDataset<Input> = Readonly<{
  id: string; description: string; cases: readonly BenchmarkCase<Input>[];
}>;
