/** Development-only complete rolling integration benchmark. */
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { analyzePcmListeningAsync } from '../src/analysis/AudioAnalysis.ts';
import { analyzeBassFromMelodyEvidence } from '../src/bass/BassAnalysis.ts';
import { collectListeningEvents } from '../src/ListeningTimeline.ts';
import { RollingAnalysisEngine } from '../src/streaming/RollingAnalysisEngine.ts';
import {
  mapRollingListeningResult, ROLLING_LISTENING_WINDOW_SECONDS,
} from '../src/streaming/RollingListeningSession.ts';
import { makeRollingPublications } from '../tests/rollingEquivalenceHarness.ts';

function signal(sampleRate, seconds) {
  return Float32Array.from({ length: Math.floor(sampleRate * seconds) }, (_, index) => {
    const time = index / sampleRate;
    if (time < 0.3 || (time > 7.2 && time < 7.45)) return 0;
    const melody = time % 6 < 3 ? 440 : 523.2511306011972;
    const transient = index % Math.round(sampleRate * 0.43) < 12 ? 0.18 : 0;
    return 0.26 * Math.sin(2 * Math.PI * melody * time)
      + 0.16 * Math.sin(2 * Math.PI * 110 * time) + transient;
  });
}

const quantile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(values.length * fraction) - 1)] ?? 0;
};
const summary = values => ({ median: quantile(values, 0.5), p95: quantile(values, 0.95) });

function withoutMelody(map) {
  return { ...map, capabilities: { ...map.capabilities, melody: false }, melody: null,
    melodyAnalysis: null, melodyEvidence: null };
}

const events = map => collectListeningEvents(map, {
  includeInitialTonalCenter: true, includeHarmonyEnds: false, percussionDefaultConfidence: 0,
  noteOffFirstAtSameTime: false,
});
const nonMelodyEvents = map => events(map)
  .filter(event => event.type !== 'note-on' && event.type !== 'note-off');

async function compatibility(sampleRate, blockSizes) {
  const pcm = signal(sampleRate, 13.25);
  const publications = makeRollingPublications(pcm, sampleRate, blockSizes);
  const production = new RollingAnalysisEngine(sampleRate, ROLLING_LISTENING_WINDOW_SECONDS);
  let cursor = 0;
  const counts = { publications: publications.length, exactCompleteMaps: 0, nonMelodyMapDifferences: 0,
    nonMelodyEventDifferences: 0, melodyAnalysisDifferences: 0, melodyEventDifferences: 0,
    bassDifferences: 0, bassSelfConsistencyFailures: 0, nonMelodyCapabilityDifferences: 0 };
  for (const publication of publications) {
    production.pushMono(pcm.subarray(cursor, publication.publicationSample));
    cursor = publication.publicationSample;
    const input = { sampleRate, channels: [publication.pcm] };
    const baseline = await analyzePcmListeningAsync(input);
    const candidate = await production.analyzeSnapshot(input);
    const time = publication.publicationSample / sampleRate;
    const offset = publication.snapshotStartSample / sampleRate;
    const baselineMap = mapRollingListeningResult(baseline, offset, time);
    const candidateMap = mapRollingListeningResult(candidate.map, offset, time, 0);
    if (isDeepStrictEqual(baselineMap, candidateMap)) counts.exactCompleteMaps += 1;
    if (!isDeepStrictEqual(withoutMelody(baselineMap), withoutMelody(candidateMap))) {
      counts.nonMelodyMapDifferences += 1;
    }
    if (!isDeepStrictEqual(nonMelodyEvents(baselineMap), nonMelodyEvents(candidateMap))) {
      counts.nonMelodyEventDifferences += 1;
    }
    if (!isDeepStrictEqual(baselineMap.melodyAnalysis, candidateMap.melodyAnalysis)) {
      counts.melodyAnalysisDifferences += 1;
    }
    const baselineNoteEvents = events(baselineMap).filter(event => event.type === 'note-on' || event.type === 'note-off');
    const candidateNoteEvents = events(candidateMap).filter(event => event.type === 'note-on' || event.type === 'note-off');
    if (!isDeepStrictEqual(baselineNoteEvents, candidateNoteEvents)) counts.melodyEventDifferences += 1;
    const baselineBass = analyzeBassFromMelodyEvidence(baselineMap.melodyEvidence);
    const candidateBass = analyzeBassFromMelodyEvidence(candidateMap.melodyEvidence);
    if (!isDeepStrictEqual(baselineBass, candidateBass)) counts.bassDifferences += 1;
    if (!isDeepStrictEqual(candidate.bassEvidence,
      analyzeBassFromMelodyEvidence(candidate.map.melodyEvidence))) {
      counts.bassSelfConsistencyFailures += 1;
    }
    const baselineCapabilities = { ...baselineMap.capabilities, melody: false };
    const candidateCapabilities = { ...candidateMap.capabilities, melody: false };
    if (!isDeepStrictEqual(baselineCapabilities, candidateCapabilities)) {
      counts.nonMelodyCapabilityDifferences += 1;
    }
  }
  production.dispose();
  return counts;
}

const sampleRate = 48_000;
const pcm = signal(sampleRate, 25);
const production = new RollingAnalysisEngine(sampleRate, ROLLING_LISTENING_WINDOW_SECONDS);
let cursor = 0;
while (cursor < sampleRate * 12) {
  const end = Math.min(sampleRate * 12, cursor + sampleRate / 2);
  production.pushMono(pcm.subarray(cursor, end));
  cursor = end;
}
// Consume initial-fill accounting; measured updates contain only their new half-second work.
await production.analyzeSnapshot({ sampleRate, channels: [pcm.subarray(0, sampleRate * 12)] });

const runs = [];
for (let update = 0; update < 25; update += 1) {
  const end = cursor + sampleRate / 2;
  const snapshot = pcm.subarray(end - sampleRate * 12, end);
  const productionStarted = performance.now();
  production.pushMono(pcm.subarray(cursor, end));
  cursor = end;
  const analyzed = await production.analyzeSnapshot({ sampleRate, channels: [snapshot] });
  const mapStarted = performance.now();
  mapRollingListeningResult(analyzed.map, cursor / sampleRate - 12, cursor / sampleRate, 0);
  const mapMilliseconds = performance.now() - mapStarted;
  const productionTotal = performance.now() - productionStarted;

  const baselineStarted = performance.now();
  const baseline = await analyzePcmListeningAsync({ sampleRate, channels: [snapshot] });
  const baselineMapStarted = performance.now();
  const baselineMap = mapRollingListeningResult(baseline, cursor / sampleRate - 12, cursor / sampleRate);
  const baselineMapMilliseconds = performance.now() - baselineMapStarted;
  const baselineBassStarted = performance.now();
  analyzeBassFromMelodyEvidence(baselineMap.melodyEvidence);
  const baselineBassMilliseconds = performance.now() - baselineBassStarted;
  const baselineTotal = performance.now() - baselineStarted;
  runs.push({ productionTotal, nonMelody: analyzed.timings.nonMelodyAnalysisMilliseconds,
    resampling: analyzed.timings.resamplingMilliseconds, candidates: analyzed.timings.candidateMilliseconds,
    temporal: analyzed.timings.temporalMilliseconds, bass: analyzed.timings.bassMilliseconds,
    map: mapMilliseconds, emittedFrames: analyzed.timings.emittedAcousticFrames,
    baselineTotal, baselineMap: baselineMapMilliseconds, baselineBass: baselineBassMilliseconds });
}

const fields = Object.keys(runs[0]);
const steady = Object.fromEntries(fields.map(field => [field, summary(runs.map(run => run[field]))]));
const retained = production.diagnostics();
production.dispose();

console.log(JSON.stringify({
  method: 'complete production rolling integration benchmark',
  node: process.version,
  sampleRate,
  historySeconds: 12,
  cadenceSeconds: 0.5,
  measuredUpdates: runs.length,
  units: 'milliseconds except emittedFrames and retainedState',
  steady,
  retainedState: { ...retained, rollingPcmBytes: sampleRate * 12 * Float32Array.BYTES_PER_ELEMENT },
  v02Projection: { median: 24.40, p95: 26.98, scope: 'Melody plus Bass only' },
  comparison: {
    '44.1k_128': await compatibility(44_100, [128]),
    '48k_awkward': await compatibility(48_000, [127, 211, 379]),
  },
}, null, 2));
