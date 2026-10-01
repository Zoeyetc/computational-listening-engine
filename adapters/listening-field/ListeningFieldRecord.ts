import type { ListeningRecordV1 } from '../../src/index.ts';

export type ListeningFieldMelodyState =
  | 'voiced'
  | 'selected-unvoiced'
  | 'range-rejected';

export type ListeningFieldMelodyEvent = {
  id: string;
  start: number;
  end: number;
  midi: number;
  state: ListeningFieldMelodyState;
};

export type ListeningFieldRecordV1 = {
  version: 1;
  sourceDuration: number;
  melody: ListeningFieldMelodyEvent[];
};

type ListeningFieldSourceRecordV1 = Pick<ListeningRecordV1, 'version' | 'duration' | 'melody'>;
type MelodyFrame = ListeningFieldSourceRecordV1['melody']['frames'][number];

type Observation = Readonly<{
  time: number;
  end: number;
  midi: number;
  state: ListeningFieldMelodyState;
}>;

type PendingInterval = {
  start: number;
  end: number;
  midi: number;
  state: ListeningFieldMelodyState;
  lastObservationTime: number;
};

const DEFAULT_FRAME_STEP_SECONDS = 1 / 60;
const MAX_FRAME_STEP_SECONDS = 0.05;
const CONTIGUOUS_HOPS = 1.5;
const EPSILON = 1e-9;

const STATE_ORDER: Readonly<Record<ListeningFieldMelodyState, number>> = {
  voiced: 0,
  'selected-unvoiced': 1,
  'range-rejected': 2,
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const frequencyToMidi = (frequencyHz: number) =>
  69 + 12 * Math.log2(frequencyHz / 440);

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.floor((sorted.length - 1) * fraction);
  return sorted[index]!;
}

/**
 * Engine records normally have a fixed frame hop. The lower quartile ignores
 * long analysis gaps while remaining stable under small timestamp jitter.
 */
function inferFrameStep(frames: readonly MelodyFrame[], sourceDuration: number): number {
  const times = frames.map(frame => frame.time).filter(Number.isFinite).sort((a, b) => a - b);
  const deltas: number[] = [];
  for (let index = 1; index < times.length; index += 1) {
    const delta = times[index]! - times[index - 1]!;
    if (delta > EPSILON) deltas.push(delta);
  }
  deltas.sort((a, b) => a - b);
  const inferred = percentile(deltas, 0.25);
  const fallback = sourceDuration > 0 ? Math.min(DEFAULT_FRAME_STEP_SECONDS, sourceDuration) : 0;
  if (!Number.isFinite(inferred)) return fallback;
  return Math.min(inferred, MAX_FRAME_STEP_SECONDS);
}

function hasPathSelectedCandidate(frame: MelodyFrame): boolean {
  const index = frame.selectedCandidateIndex;
  return index !== null && Number.isInteger(index) && index >= 0
    && index < frame.candidates.length && frame.candidates[index]?.selected === true;
}

function addObservation(observations: Observation[], time: number, frameEnd: number,
  midiFloat: number, state: ListeningFieldMelodyState): void {
  if (!Number.isFinite(midiFloat)) return;
  observations.push({ time, end: frameEnd, midi: Math.round(midiFloat), state });
}

function compareEvents(left: Omit<ListeningFieldMelodyEvent, 'id'>,
  right: Omit<ListeningFieldMelodyEvent, 'id'>): number {
  return left.start - right.start || left.end - right.end
    || STATE_ORDER[left.state] - STATE_ORDER[right.state] || left.midi - right.midi;
}

/**
 * Projects the public engine record into compact Listening Field intervals.
 * It makes no future-visibility decision: renderers reveal each interval with
 * `visibleEnd = min(event.end, currentPlaybackTime)`.
 */
export function projectListeningFieldRecordV1(
  source: ListeningFieldSourceRecordV1,
): ListeningFieldRecordV1 {
  if (source.version !== 1) throw new TypeError('ListeningRecord version must be 1');
  if (!Number.isFinite(source.duration) || source.duration < 0) {
    throw new RangeError('ListeningRecord duration must be finite and non-negative');
  }
  if (!source.melody || !Array.isArray(source.melody.frames)) {
    throw new TypeError('ListeningRecord melody.frames must be an array');
  }

  const sourceDuration = source.duration;
  const frames = [...source.melody.frames].sort((a, b) => a.time - b.time);
  const frameStep = inferFrameStep(frames, sourceDuration);
  const observations: Observation[] = [];

  for (const frame of frames) {
    if (!Number.isFinite(frame.time)) continue;
    const time = clamp(frame.time, 0, sourceDuration);
    const frameEnd = clamp(time + frameStep, time, sourceDuration);

    if (frame.voiced && frame.finalMidiFloat !== null) {
      addObservation(observations, time, frameEnd, frame.finalMidiFloat, 'voiced');
    } else if (!frame.voiced && frame.selectedMidiFloat !== null && hasPathSelectedCandidate(frame)) {
      addObservation(observations, time, frameEnd, frame.selectedMidiFloat, 'selected-unvoiced');
    }

    const rejectedMidiAtFrame = new Set<number>();
    for (const rejected of frame.rangeRejected) {
      if (!Number.isFinite(rejected.frequencyHz) || rejected.frequencyHz <= 0) continue;
      rejectedMidiAtFrame.add(Math.round(frequencyToMidi(rejected.frequencyHz)));
    }
    for (const midi of rejectedMidiAtFrame) {
      addObservation(observations, time, frameEnd, midi, 'range-rejected');
    }
  }

  const observationsByKey = new Map<string, Observation[]>();
  for (const observation of observations) {
    const key = `${observation.state}:${observation.midi}`;
    const group = observationsByKey.get(key);
    if (group) group.push(observation);
    else observationsByKey.set(key, [observation]);
  }

  const intervals: Omit<ListeningFieldMelodyEvent, 'id'>[] = [];
  const maximumGap = frameStep * CONTIGUOUS_HOPS + EPSILON;
  for (const group of observationsByKey.values()) {
    group.sort((a, b) => a.time - b.time || a.end - b.end);
    let pending: PendingInterval | undefined;
    for (const observation of group) {
      if (pending && observation.time - pending.lastObservationTime <= maximumGap) {
        pending.end = Math.max(pending.end, observation.end);
        pending.lastObservationTime = observation.time;
        continue;
      }
      if (pending) {
        const { lastObservationTime: _last, ...interval } = pending;
        intervals.push(interval);
      }
      pending = { start: observation.time, end: observation.end, midi: observation.midi,
        state: observation.state, lastObservationTime: observation.time };
    }
    if (pending) {
      const { lastObservationTime: _last, ...interval } = pending;
      intervals.push(interval);
    }
  }

  intervals.sort(compareEvents);
  const width = Math.max(6, String(intervals.length).length);
  const melody = intervals.map((interval, index) => ({
    id: `melody-${interval.state}-${String(index + 1).padStart(width, '0')}`,
    ...interval,
  }));
  return { version: 1, sourceDuration, melody };
}
