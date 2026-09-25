import type { BenchmarkDataset, Note, PitchFrame } from '../types.ts';

export type PcmInput = Readonly<{ sampleRate: number; channels: readonly Float32Array[] }>;
const sampleRate = 12000;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
function tone(samples: Float32Array, start: number, end: number, midi: number, gain: number) {
  for (let i = Math.round(start * sampleRate); i < Math.min(samples.length, Math.round(end * sampleRate)); i++) {
    const t = i / sampleRate - start;
    const envelope = Math.min(1, t / 0.01, (end - i / sampleRate) / 0.01);
    samples[i] += gain * envelope * Math.sin(2 * Math.PI * hz(midi) * t);
  }
}
const pcm = (samples: Float32Array): PcmInput => ({ sampleRate, channels: [samples] });

/** Authored truth comes from synthesis parameters, never from Engine output. */
export function createSyntheticDataset(): BenchmarkDataset<PcmInput> {
  const melody: Note[] = [
    { start: 0.25, end: 1, midi: 69 }, { start: 1.2, end: 2, midi: 72 }, { start: 2.2, end: 3, midi: 76 },
  ];
  const melodyAudio = new Float32Array(sampleRate * 3.5);
  melody.forEach(note => tone(melodyAudio, note.start, note.end, note.midi, 0.7));
  const pitch: PitchFrame[] = Array.from({ length: Math.ceil(3.5 / 0.016) }, (_, i) => {
    const time = i * 0.016;
    return { time, midi: melody.find(note => note.start <= time && note.end > time)?.midi ?? null };
  });
  const beats = Array.from({ length: 16 }, (_, i) => 0.2 + i * 0.5);
  const rhythmAudio = new Float32Array(sampleRate * 8.2);
  for (const time of beats) {
    for (let j = 0; j < 216; j++) rhythmAudio[Math.round(time * sampleRate) + j] += 0.9 * (0.5 - 0.5 * Math.cos(2 * Math.PI * j / 216)) * Math.sin(2 * Math.PI * 1200 * j / sampleRate);
  }
  const chordAudio = new Float32Array(sampleRate * 16);
  const triads = [[60, 64, 67], [55, 59, 62], [60, 64, 67], [55, 59, 62], [62, 66, 69], [57, 61, 64], [62, 66, 69], [57, 61, 64]];
  const roots = [0, 7, 0, 7, 2, 9, 2, 9];
  const chords = triads.map((notes, i) => {
    notes.forEach(midi => tone(chordAudio, i * 2, (i + 1) * 2, midi, 0.22));
    return { start: i * 2, end: (i + 1) * 2, label: `${roots[i]}:major` };
  });
  return { id: 'synthetic-v0.1', description: 'Deterministic authored tones, clicks, triads and silence at 12 kHz. Smoke benchmark only; nominal key labels describe the composed progression, not perceptual certainty.', cases: [
    { id: 'monophonic-phrase', input: pcm(melodyAudio), truth: { pitch, melody } },
    { id: '120-bpm-clicks', input: pcm(rhythmAudio), truth: { rhythm: { bpm: 120, beats } } },
    { id: 'major-triads-key-change', input: pcm(chordAudio), truth: { harmony: { chords, keys: [
      { start: 0, end: 8, label: '0:major' }, { start: 8, end: 16, label: '2:major' },
    ] } } },
    { id: 'silence', input: pcm(new Float32Array(sampleRate)), truth: {
      pitch: Array.from({ length: 63 }, (_, i) => ({ time: i * 0.016, midi: null })), melody: [], rhythm: { bpm: null, beats: [] },
      harmony: { chords: [{ start: 0, end: 1, label: null }], keys: [] },
    } },
  ] };
}
