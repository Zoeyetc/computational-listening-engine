import {
  analyzeMelodyAcousticFrame, interpretMelodyAcousticFrames, MELODY_ANALYSIS,
  type MelodyAcousticFrame, type MelodyAnalysisWithEvidence,
} from '../analysis/MelodyAnalysis.ts';

export type SessionAnchoredAcousticFrame = Readonly<{
  id: `melody-12k-${number}`;
  startSample12k: number;
  sourceStartSample: number;
  sourceEndSampleExclusive: number;
  acoustic: MelodyAcousticFrame;
}>;

export type SessionAnchoredPushResult = Readonly<{
  emitted: readonly SessionAnchoredAcousticFrame[];
  resampledSampleCount: number;
  resamplingMilliseconds: number;
  candidateMilliseconds: number;
}>;

export type SessionAnchoredDiagnostics = Readonly<{
  sourceSampleCount: number;
  resampledSampleCount: number;
  completedFrameCount: number;
  retainedFrameCount: number;
  retainedCandidateCount: number;
  retainedRejectedCandidateCount: number;
  estimatedNumericPayloadBytes: number;
  pendingSourceSamples: number;
  pendingResampledSamples: number;
}>;

function immutableAcousticFrame(frame: MelodyAcousticFrame): MelodyAcousticFrame {
  return Object.freeze({
    ...frame,
    candidates: Object.freeze(frame.candidates.map(candidate => Object.freeze({ ...candidate }))),
    generation: Object.freeze({ ...frame.generation }),
    rejectedCandidates: Object.freeze(frame.rejectedCandidates.map(candidate => Object.freeze({ ...candidate }))),
  });
}

/**
 * Experimental session-anchored acoustic timeline. It is intentionally absent
 * from the package root and does not participate in RollingListeningSession.
 */
export class SessionAnchoredMelodyExperiment {
  readonly sourceSampleRate: number;
  readonly historySeconds: number;
  readonly #ratio: number;
  #source: number[] = [];
  #sourceBase = 0;
  #sourceSampleCount = 0;
  #nextOutputSample = 0;
  #resampled: number[] = [];
  #resampledBase = 0;
  #nextFrameStart = 0;
  #completedFrameCount = 0;
  #retained: SessionAnchoredAcousticFrame[] = [];

  constructor(sourceSampleRate: number, historySeconds = 12) {
    if (!Number.isFinite(sourceSampleRate) || sourceSampleRate <= 0) {
      throw new RangeError('Source sample rate must be positive');
    }
    if (!Number.isFinite(historySeconds) || historySeconds <= 0) {
      throw new RangeError('History duration must be positive');
    }
    this.sourceSampleRate = sourceSampleRate;
    this.historySeconds = historySeconds;
    this.#ratio = sourceSampleRate / MELODY_ANALYSIS.analysisSampleRate;
  }

  #cellStart(outputSample: number) {
    return Math.floor(outputSample * this.#ratio);
  }

  #cellEnd(outputSample: number) {
    const from = this.#cellStart(outputSample);
    return Math.max(from + 1, Math.floor((outputSample + 1) * this.#ratio));
  }

  push(mono: Float32Array): SessionAnchoredPushResult {
    for (const sample of mono) this.#source.push(sample);
    this.#sourceSampleCount += mono.length;

    const resamplingStarted = performance.now();
    while (this.#cellEnd(this.#nextOutputSample) <= this.#sourceSampleCount) {
      const from = this.#cellStart(this.#nextOutputSample);
      const to = this.#cellEnd(this.#nextOutputSample);
      let sum = 0;
      for (let sourceSample = from; sourceSample < to; sourceSample += 1) {
        sum += this.#source[sourceSample - this.#sourceBase] ?? 0;
      }
      this.#resampled.push(Math.fround(sum / (to - from)));
      this.#nextOutputSample += 1;
    }
    const resamplingMilliseconds = performance.now() - resamplingStarted;

    const noLongerNeeded = this.#cellStart(this.#nextOutputSample) - this.#sourceBase;
    if (noLongerNeeded > 0) {
      this.#source = this.#source.slice(noLongerNeeded);
      this.#sourceBase += noLongerNeeded;
    }

    const candidateStarted = performance.now();
    const emitted: SessionAnchoredAcousticFrame[] = [];
    while (this.#nextFrameStart + MELODY_ANALYSIS.frameSize <= this.#nextOutputSample) {
      const localStart = this.#nextFrameStart - this.#resampledBase;
      const samples = Float32Array.from(this.#resampled.slice(localStart,
        localStart + MELODY_ANALYSIS.frameSize));
      const centerTime = (this.#nextFrameStart + MELODY_ANALYSIS.frameSize / 2)
        / MELODY_ANALYSIS.analysisSampleRate;
      const item: SessionAnchoredAcousticFrame = Object.freeze({
        id: `melody-12k-${this.#nextFrameStart}`,
        startSample12k: this.#nextFrameStart,
        sourceStartSample: this.#cellStart(this.#nextFrameStart),
        sourceEndSampleExclusive: this.#cellEnd(this.#nextFrameStart + MELODY_ANALYSIS.frameSize - 1),
        acoustic: immutableAcousticFrame(analyzeMelodyAcousticFrame(samples, centerTime)),
      });
      emitted.push(item);
      this.#retained.push(item);
      this.#completedFrameCount += 1;
      this.#nextFrameStart += MELODY_ANALYSIS.hopSize;
    }
    const candidateMilliseconds = performance.now() - candidateStarted;

    const discardOutputCount = this.#nextFrameStart - this.#resampledBase;
    if (discardOutputCount > 0) {
      this.#resampled = this.#resampled.slice(discardOutputCount);
      this.#resampledBase += discardOutputCount;
    }
    const cutoff = this.duration - this.historySeconds;
    while (this.#retained[0] && this.#retained[0].acoustic.time < cutoff) this.#retained.shift();

    return Object.freeze({
      emitted: Object.freeze(emitted),
      resampledSampleCount: this.#nextOutputSample,
      resamplingMilliseconds,
      candidateMilliseconds,
    });
  }

  get duration() { return this.#sourceSampleCount / this.sourceSampleRate; }

  frames(): readonly SessionAnchoredAcousticFrame[] {
    return Object.freeze([...this.#retained]);
  }

  interpret(): MelodyAnalysisWithEvidence {
    return interpretMelodyAcousticFrames(this.#retained.map(frame => frame.acoustic), this.duration);
  }

  diagnostics(): SessionAnchoredDiagnostics {
    const retainedCandidateCount = this.#retained.reduce(
      (sum, frame) => sum + frame.acoustic.candidates.length, 0);
    const retainedRejectedCandidateCount = this.#retained.reduce(
      (sum, frame) => sum + frame.acoustic.rejectedCandidates.length, 0);
    // Scalar payload lower bound, excluding JavaScript object/array/string overhead.
    const estimatedNumericPayloadBytes = this.#retained.reduce((sum, frame) => sum
      + 8 * 10
      + frame.acoustic.candidates.length * 8 * 6
      + frame.acoustic.rejectedCandidates.length * 8 * 4, 0);
    return Object.freeze({
      sourceSampleCount: this.#sourceSampleCount,
      resampledSampleCount: this.#nextOutputSample,
      completedFrameCount: this.#completedFrameCount,
      retainedFrameCount: this.#retained.length,
      retainedCandidateCount,
      retainedRejectedCandidateCount,
      estimatedNumericPayloadBytes,
      pendingSourceSamples: this.#source.length,
      pendingResampledSamples: this.#resampled.length,
    });
  }
}
