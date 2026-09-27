const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** Internal pitch-domain invariant shared by Melody evidence and Bass adaptation. */
export const isFinitePositiveFrequency = (frequency: number) =>
  Number.isFinite(frequency) && frequency > 0;

export const hzToMidi = (frequency: number) => 69 + 12 * Math.log2(frequency / 440);

export const midiToNoteName = (midi: number) =>
  `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
