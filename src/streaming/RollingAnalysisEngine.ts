import { analyzePcmListeningAsyncWithMelody, type PcmAudio } from '../analysis/AudioAnalysis.ts';
import { analyzeBassFromMelodyEvidence } from '../bass/BassAnalysis.ts';
import type { BassEvidence } from '../bass/types.ts';
import type { ListeningMap } from '../types.ts';
import type { BrowserLiveStageTimingSink } from '../profiling/BrowserLiveStageProfile.ts';
import {
  RollingMelodyAcousticObserver,
  type RollingMelodyAcousticDiagnostics,
  type RollingMelodyPushResult,
} from './RollingMelodyAcousticObserver.ts';

export type RollingProductionTimings = Readonly<{
  resamplingMilliseconds: number;
  candidateMilliseconds: number;
  emittedAcousticFrames: number;
  temporalMilliseconds: number;
  bassMilliseconds: number;
  nonMelodyAnalysisMilliseconds: number;
}>;

export type RollingProductionAnalysis = Readonly<{
  map: ListeningMap;
  bassEvidence: BassEvidence;
  acousticDiagnostics: RollingMelodyAcousticDiagnostics;
  timings: RollingProductionTimings;
}>;

/** Private stateful composition used only by the default rolling session path. */
export class RollingAnalysisEngine {
  readonly #melody: RollingMelodyAcousticObserver;
  #pendingResamplingMilliseconds = 0;
  #pendingCandidateMilliseconds = 0;
  #pendingFrameCount = 0;
  #disposed = false;

  constructor(sampleRate: number, historySeconds: number) {
    this.#melody = new RollingMelodyAcousticObserver(sampleRate, historySeconds);
  }

  pushMono(mono: Float32Array): RollingMelodyPushResult {
    if (this.#disposed) throw new Error('Rolling analysis engine is disposed');
    const result = this.#melody.push(mono);
    this.#pendingResamplingMilliseconds += result.resamplingMilliseconds;
    this.#pendingCandidateMilliseconds += result.candidateMilliseconds;
    this.#pendingFrameCount += result.emitted.length;
    return result;
  }

  async analyzeSnapshot(pcm: PcmAudio,
    timingSink: BrowserLiveStageTimingSink | null = null): Promise<RollingProductionAnalysis> {
    if (this.#disposed) throw new Error('Rolling analysis engine is disposed');
    const resamplingMilliseconds = this.#pendingResamplingMilliseconds;
    const candidateMilliseconds = this.#pendingCandidateMilliseconds;
    const emittedAcousticFrames = this.#pendingFrameCount;
    this.#pendingResamplingMilliseconds = 0;
    this.#pendingCandidateMilliseconds = 0;
    this.#pendingFrameCount = 0;
    timingSink?.add('melodyResampling', resamplingMilliseconds);
    timingSink?.add('melodyAcousticCandidates', candidateMilliseconds);
    timingSink?.addCount('emittedMelodyAcousticFrames', emittedAcousticFrames);

    const temporalStarted = performance.now();
    const melody = this.#melody.interpret();
    const temporalMilliseconds = performance.now() - temporalStarted;
    timingSink?.add('melodyTemporalPathPostProcessing', temporalMilliseconds);
    const bassStarted = performance.now();
    const bassEvidence = analyzeBassFromMelodyEvidence(melody.evidence);
    const bassMilliseconds = performance.now() - bassStarted;
    timingSink?.add('bassDerivation', bassMilliseconds);
    const nonMelodyStarted = performance.now();
    const map = await analyzePcmListeningAsyncWithMelody(pcm, melody, timingSink);
    const nonMelodyAnalysisMilliseconds = performance.now() - nonMelodyStarted;
    timingSink?.add('nonMelodyAnalysisWall', nonMelodyAnalysisMilliseconds);
    return Object.freeze({
      map,
      bassEvidence,
      acousticDiagnostics: this.#melody.diagnostics(),
      timings: Object.freeze({ resamplingMilliseconds, candidateMilliseconds, emittedAcousticFrames,
        temporalMilliseconds, bassMilliseconds, nonMelodyAnalysisMilliseconds }),
    });
  }

  diagnostics() { return this.#melody.diagnostics(); }

  reset() {
    if (this.#disposed) throw new Error('Rolling analysis engine is disposed');
    this.#melody.reset();
    this.#pendingResamplingMilliseconds = 0;
    this.#pendingCandidateMilliseconds = 0;
    this.#pendingFrameCount = 0;
  }

  dispose() {
    if (this.#disposed) return;
    this.#melody.dispose();
    this.#pendingResamplingMilliseconds = 0;
    this.#pendingCandidateMilliseconds = 0;
    this.#pendingFrameCount = 0;
    this.#disposed = true;
  }
}
