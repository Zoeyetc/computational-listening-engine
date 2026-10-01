import type { ListeningFieldRecordV1 } from '../../../adapters/listening-field/index.ts';
import type { PcmAudio } from '../../../src/index.ts';

export type AudioProbe = Readonly<{
  sampleRate: number;
  channelCount: number;
  duration: number;
  codecName: string;
  formatNames: readonly string[];
}>;

export type AnalysisTimings = Readonly<{
  probeMs: number;
  decodeMs: number;
  analysisMs: number;
}>;

export type AnalyzeUploadResult = Readonly<{
  record: ListeningFieldRecordV1;
  timings: AnalysisTimings;
}>;

export type MediaDecoder = Readonly<{
  probe(path: string, signal?: AbortSignal): Promise<AudioProbe>;
  decode(path: string, probe: AudioProbe, signal?: AbortSignal): Promise<PcmAudio>;
}>;
