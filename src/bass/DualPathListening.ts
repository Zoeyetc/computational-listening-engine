import { analyzePcmListening, type PcmAudio } from '../analysis/AudioAnalysis.ts';
import type { ListeningMap } from '../types.ts';
import { analyzeBassFromMelodyEvidence } from './BassAnalysis.ts';
import type { BassEvidence } from './types.ts';

export type DualPathListening = Readonly<{ listeningMap: ListeningMap; bassEvidence: BassEvidence }>;

/** Opt-in dual path: the existing Engine run supplies one shared candidate timeline. */
export function analyzeDualPathListening(pcm: PcmAudio): DualPathListening {
  const listeningMap = analyzePcmListening(pcm);
  if (!listeningMap.melodyEvidence) throw new Error('Melody candidate evidence unavailable');
  return { listeningMap, bassEvidence: analyzeBassFromMelodyEvidence(listeningMap.melodyEvidence) };
}
