import {
  isolatedClosedHat,
  isolatedKick,
  isolatedSnare,
  isolatedTom,
  syntheticPercussion,
  type SyntheticPcm,
} from './percussionFixtures.ts';

const SAMPLE_RATE = 48_000;

function tonalLine(frequencies: readonly number[], register: 'piano' | 'bass'): SyntheticPcm {
  const secondsPerNote = 0.5;
  const signal = new Float32Array(Math.floor(SAMPLE_RATE * frequencies.length * secondsPerNote));
  frequencies.forEach((frequency, noteIndex) => {
    const start = Math.floor(noteIndex * secondsPerNote * SAMPLE_RATE);
    const length = Math.floor(secondsPerNote * SAMPLE_RATE);
    for (let offset = 0; offset < length; offset += 1) {
      const time = offset / SAMPLE_RATE;
      const attack = Math.min(1, time / 0.008);
      const decay = Math.exp(-time / (register === 'piano' ? 0.32 : 0.55));
      const phase = 2 * Math.PI * frequency * time;
      const body = register === 'piano'
        ? Math.sin(phase) + 0.42 * Math.sin(phase * 2) + 0.18 * Math.sin(phase * 3)
        : Math.sin(phase) + 0.24 * Math.sin(phase * 2);
      signal[start + offset] += 0.38 * attack * decay * body;
    }
  });
  return { sampleRate: SAMPLE_RATE, channels: [signal] };
}

function mix(left: SyntheticPcm, right: SyntheticPcm, leftGain = 1, rightGain = 1): SyntheticPcm {
  if (left.sampleRate !== right.sampleRate) throw new Error('Fixture sample rates differ');
  const length = Math.max(left.channels[0].length, right.channels[0].length);
  const signal = Float32Array.from({ length }, (_, index) =>
    (left.channels[0][index] ?? 0) * leftGain + (right.channels[0][index] ?? 0) * rightGain);
  return { sampleRate: left.sampleRate, channels: [signal] };
}

export const drumProbeKickSolo = isolatedKick;
export const drumProbeSnareSolo = isolatedSnare;
export const drumProbeHatSolo = isolatedClosedHat;
export const drumProbeTomSolo = () => {
  const pcm = isolatedTom();
  const signal = pcm.channels[0];
  const gatedEnd = Math.floor(0.26 * pcm.sampleRate);
  signal.fill(0, gatedEnd);
  return pcm;
};

export const drumProbeFullSolo = () => syntheticPercussion(SAMPLE_RATE, 4,
  Array.from({ length: 16 }, (_, index) => ({
    time: 0.15 + index * 0.23,
    kind: index % 8 === 4 ? 'snare' as const
      : index % 4 === 0 ? 'kick' as const
      : index % 7 === 0 ? 'tom' as const
      : 'closed-hat' as const,
    gain: index % 3 === 0 ? 0.7 : 0.82,
  })));

export const drumProbePianoMelody = () => tonalLine([261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 261.63], 'piano');
export const drumProbeBassLine = () => tonalLine([82.41, 98, 110, 123.47, 110, 98, 92.5, 82.41], 'bass');
export const drumProbePianoWithDrums = () => mix(drumProbePianoMelody(), drumProbeFullSolo(), 0.72, 0.7);

export const DRUM_PROBE_CONTROLLED_FIXTURES = Object.freeze([
  Object.freeze({ id: 'kick-solo', create: drumProbeKickSolo, limitation: 'synthetic resonant kick proxy' }),
  Object.freeze({ id: 'snare-solo', create: drumProbeSnareSolo, limitation: 'synthetic noise-plus-tone snare proxy' }),
  Object.freeze({ id: 'hat-cymbal-solo', create: drumProbeHatSolo, limitation: 'synthetic short closed-hat proxy' }),
  Object.freeze({ id: 'tom-solo', create: drumProbeTomSolo,
    limitation: 'synthetic short gated two-partial resonant tom proxy' }),
  Object.freeze({ id: 'full-drum-solo', create: drumProbeFullSolo, limitation: 'synthetic mixed drum-pattern proxy' }),
  Object.freeze({ id: 'piano-melody', create: drumProbePianoMelody, limitation: 'additive decaying-tone piano proxy' }),
  Object.freeze({ id: 'bass-line', create: drumProbeBassLine, limitation: 'additive decaying-tone bass proxy' }),
  Object.freeze({ id: 'piano-plus-drums', create: drumProbePianoWithDrums,
    limitation: 'linear mix of synthetic piano and drum proxies; no room or microphone response' }),
] as const);
