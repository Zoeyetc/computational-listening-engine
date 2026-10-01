import {
  analyzeDualPathListening,
  projectListeningRecordV1,
  type PcmAudio,
} from '../../src/index.ts';
import {
  projectListeningFieldRecordV1,
  type ListeningFieldRecordV1,
} from './ListeningFieldRecord.ts';

export type {
  ListeningFieldMelodyEvent,
  ListeningFieldMelodyState,
  ListeningFieldRecordV1,
} from './ListeningFieldRecord.ts';
export { projectListeningFieldRecordV1 } from './ListeningFieldRecord.ts';

/**
 * Web-service-facing composition over the production decoded-PCM analysis.
 * Decoding container formats such as MP3/WAV remains the caller's concern.
 */
export function analyzeListeningFieldFromAudio(audio: PcmAudio): ListeningFieldRecordV1 {
  const analyzed = analyzeDualPathListening(audio);
  const publicRecord = projectListeningRecordV1(analyzed);
  return projectListeningFieldRecordV1(publicRecord);
}
