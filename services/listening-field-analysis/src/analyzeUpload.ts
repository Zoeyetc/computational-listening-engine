import { performance } from 'node:perf_hooks';
import {
  analyzeListeningFieldFromAudio,
  type ListeningFieldRecordV1,
} from '../../../adapters/listening-field/index.ts';
import type { PcmAudio } from '../../../src/index.ts';
import { ServiceError } from './errors.ts';
import { createNativeMediaDecoder } from './ffmpegDecode.ts';
import type { AnalyzeUploadResult, MediaDecoder } from './types.ts';
import { validatePcmAudio } from './validateUpload.ts';
import { validateListeningFieldRecordV1 } from './validateResult.ts';

export type AnalyzeUploadOptions = Readonly<{
  decoder?: MediaDecoder;
  analyzeAudio?: (audio: PcmAudio) => ListeningFieldRecordV1;
  signal?: AbortSignal;
}>;

export async function analyzeUpload(path: string,
  options: AnalyzeUploadOptions = {}): Promise<AnalyzeUploadResult> {
  const decoder = options.decoder ?? createNativeMediaDecoder();
  const probeStarted = performance.now();
  const probe = await decoder.probe(path, options.signal);
  const probeMs = performance.now() - probeStarted;

  const decodeStarted = performance.now();
  const audio = validatePcmAudio(await decoder.decode(path, probe, options.signal));
  const decodeMs = performance.now() - decodeStarted;

  const analysisStarted = performance.now();
  let unvalidated: ListeningFieldRecordV1;
  try {
    unvalidated = (options.analyzeAudio ?? analyzeListeningFieldFromAudio)(audio);
  } catch (error) {
    throw new ServiceError('ANALYSIS_FAILED', 'Listening Field analysis failed', 500,
      error instanceof Error ? { cause: error } : undefined);
  }
  const record = validateListeningFieldRecordV1(unvalidated);
  const analysisMs = performance.now() - analysisStarted;
  return { record, timings: { probeMs, decodeMs, analysisMs } };
}
