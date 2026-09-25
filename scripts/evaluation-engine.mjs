import { analyzePcmListening } from '../src/index.ts';

/** Boundary adapter only: inspect current raw analysis; do not alter evidence. */
export function evaluatePcmWithEngine(input) {
  const map = analyzePcmListening(input);
  const harmony = map.harmonyAnalysis;
  const chordLabel = candidate => candidate ? `${candidate.rootPitchClass}:${candidate.quality}` : null;
  return {
    pitch: map.melodyAnalysis?.contour.map(frame => ({ time: frame.time,
      midi: frame.voiced ? frame.midiFloat : null, confidence: frame.confidence })) ?? [],
    melody: map.melodyAnalysis?.notes ?? [],
    rhythm: { bpm: map.rhythmAnalysis?.bpm ?? null, beats: map.rhythmAnalysis?.beats.map(beat => beat.time) ?? [],
      confidence: map.rhythmAnalysis?.confidence },
    harmony: {
      chords: harmony?.frames.map((frame, i, frames) => ({ start: frame.time,
        end: Math.min(map.duration, frames[i + 1]?.time ?? frame.time + harmony.metadata.hopSize / harmony.metadata.analysisSampleRate),
        label: chordLabel(frame.chord),
        top2: [...new Set([chordLabel(frame.topCandidate), chordLabel(frame.secondCandidate)].filter(label => label !== null))],
        // Confidence supports an accepted chord claim, not an abstention.
        confidence: frame.chord ? frame.confidence : undefined,
      })).filter(segment => segment.end > segment.start) ?? [],
      keys: map.tonalCenterAnalysis?.segments.map(segment => ({ start: segment.start, end: segment.end,
        label: `${segment.rootPitchClass}:${segment.mode}`, confidence: segment.confidence })) ?? [],
    },
  };
}
