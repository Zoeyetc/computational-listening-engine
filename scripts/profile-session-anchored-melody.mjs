/** Development-only feasibility benchmark. The experiment is not package-root exported. */
import { isDeepStrictEqual } from 'node:util';
import { performance } from 'node:perf_hooks';
import {
  analyzeMelodyWithEvidence, extractMelodyAcousticFrames, MELODY_ANALYSIS,
} from '../src/analysis/MelodyAnalysis.ts';
import { analyzeBassFromMelodyEvidence } from '../src/bass/BassAnalysis.ts';
import { SessionAnchoredMelodyExperiment } from '../src/experiments/SessionAnchoredMelody.ts';
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
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
};
const summarize = values => ({ median: quantile(values, 0.5), p95: quantile(values, 0.95) });
const elapsed = action => {
  const started = performance.now();
  const value = action();
  return { value, milliseconds: performance.now() - started };
};

const oneShot = {};
for (const seconds of [2, 6, 12]) {
  const pcm = signal(48_000, seconds);
  const runs = [];
  for (let repetition = 0; repetition < 15; repetition += 1) {
    const experiment = new SessionAnchoredMelodyExperiment(48_000);
    const push = experiment.push(pcm);
    const temporal = elapsed(() => experiment.interpret());
    const bass = elapsed(() => analyzeBassFromMelodyEvidence(temporal.value.evidence));
    runs.push({
      resampling: push.resamplingMilliseconds,
      candidates: push.candidateMilliseconds,
      temporal: temporal.milliseconds,
      bass: bass.milliseconds,
      projected: push.resamplingMilliseconds + push.candidateMilliseconds
        + temporal.milliseconds + bass.milliseconds,
    });
  }
  oneShot[seconds] = Object.fromEntries(Object.keys(runs[0]).map(name =>
    [name, summarize(runs.map(run => run[name]))]));
}

const steadyRate = 48_000;
const steadyPcm = signal(steadyRate, 25);
const experiment = new SessionAnchoredMelodyExperiment(steadyRate);
let steadyCursor = 0;
while (steadyCursor < steadyRate * 12) {
  const end = Math.min(steadyRate * 12, steadyCursor + steadyRate / 2);
  experiment.push(steadyPcm.subarray(steadyCursor, end));
  steadyCursor = end;
}
const steadyRuns = [];
for (let update = 0; update < 25; update += 1) {
  const end = steadyCursor + steadyRate / 2;
  const push = experiment.push(steadyPcm.subarray(steadyCursor, end));
  steadyCursor = end;
  const temporal = elapsed(() => experiment.interpret());
  const bass = elapsed(() => analyzeBassFromMelodyEvidence(temporal.value.evidence));
  const snapshot = steadyPcm.subarray(steadyCursor - steadyRate * 12, steadyCursor);
  const baselineAcoustic = elapsed(() => extractMelodyAcousticFrames({ mono: snapshot, sampleRate: steadyRate }));
  const baselineMelody = elapsed(() => analyzeMelodyWithEvidence({ mono: snapshot, sampleRate: steadyRate }));
  steadyRuns.push({
    emittedFrames: push.emitted.length,
    resampling: push.resamplingMilliseconds,
    candidates: push.candidateMilliseconds,
    temporal: temporal.milliseconds,
    bass: bass.milliseconds,
    projected: push.resamplingMilliseconds + push.candidateMilliseconds
      + temporal.milliseconds + bass.milliseconds,
    baselineAcoustic: baselineAcoustic.milliseconds,
    baselineMelody: baselineMelody.milliseconds,
  });
}
const steady = {
  updates: steadyRuns.length,
  emittedFrames: summarize(steadyRuns.map(run => run.emittedFrames)),
  timings: Object.fromEntries(Object.keys(steadyRuns[0]).filter(name => name !== 'emittedFrames')
    .map(name => [name, summarize(steadyRuns.map(run => run[name]))])),
  retained: experiment.diagnostics(),
};

function withoutTime(frame) {
  const { time: _time, ...rest } = frame;
  return rest;
}

function compatibility(sampleRate, blockSizes) {
  const pcm = signal(sampleRate, 13.25);
  const publications = makeRollingPublications(pcm, sampleRate, blockSizes);
  const anchored = new SessionAnchoredMelodyExperiment(sampleRate);
  let cursor = 0;
  const result = {
    publications: publications.length,
    baselineFrames: 0,
    edgePaddedFrames: 0,
    alignedCompleteFrames: 0,
    timebaseUnmatchedCompleteFrames: 0,
    acousticCandidateDifferences: 0,
    temporalDecisionDifferencesOnAlignedFrames: 0,
    nearestTimebaseCandidateComparisons: 0,
    nearestTimebaseCandidateDifferences: 0,
    nearestTimebaseDecisionDifferences: 0,
    nearestTimebaseVoicingDifferences: 0,
    nearestTimebasePitchDifferencesOver50Cents: 0,
    meanNearestTimebaseOffsetSamples12k: 0,
    maximumNearestTimebaseOffsetSamples12k: 0,
    trackAvailabilityDifferencePublications: 0,
    noteMidiSequenceDifferencePublications: 0,
    exactAnalysisPublications: 0,
  };
  let nearestOffsetTotal = 0;
  const ratio = sampleRate / MELODY_ANALYSIS.analysisSampleRate;
  for (const publication of publications) {
    anchored.push(pcm.subarray(cursor, publication.publicationSample));
    cursor = publication.publicationSample;
    const baselineFrames = extractMelodyAcousticFrames({ mono: publication.pcm, sampleRate });
    const baseline = analyzeMelodyWithEvidence({ mono: publication.pcm, sampleRate });
    const anchoredResult = anchored.interpret();
    const anchoredFrames = anchored.frames();
    const anchoredBySource = new Map(anchoredFrames.map((frame, index) =>
      [`${frame.sourceStartSample}:${frame.sourceEndSampleExclusive}`, { frame, index }]));
    const signalLength = Math.max(1, Math.floor(publication.pcm.length / ratio));
    result.baselineFrames += baselineFrames.length;
    for (let index = 0; index < baselineFrames.length; index += 1) {
      const start = index * MELODY_ANALYSIS.hopSize;
      if (start + MELODY_ANALYSIS.frameSize > signalLength) {
        result.edgePaddedFrames += 1;
        continue;
      }
      const sourceStart = publication.snapshotStartSample + Math.floor(start * ratio);
      const lastOutput = start + MELODY_ANALYSIS.frameSize - 1;
      const lastFrom = Math.floor(lastOutput * ratio);
      const sourceEnd = publication.snapshotStartSample
        + Math.max(lastFrom + 1, Math.floor((lastOutput + 1) * ratio));
      const match = anchoredBySource.get(`${sourceStart}:${sourceEnd}`);
      if (!match) {
        result.timebaseUnmatchedCompleteFrames += 1;
        const absoluteCenterTime = publication.snapshotStartSample / sampleRate
          + (start + MELODY_ANALYSIS.frameSize / 2) / MELODY_ANALYSIS.analysisSampleRate;
        const nearest = anchoredFrames.reduce((best, frame, anchoredIndex) => {
          const distance = Math.abs(frame.acoustic.time - absoluteCenterTime);
          return !best || distance < best.distance ? { frame, anchoredIndex, distance } : best;
        }, null);
        if (nearest) {
          result.nearestTimebaseCandidateComparisons += 1;
          const offsetSamples = nearest.distance * MELODY_ANALYSIS.analysisSampleRate;
          nearestOffsetTotal += offsetSamples;
          result.maximumNearestTimebaseOffsetSamples12k = Math.max(
            result.maximumNearestTimebaseOffsetSamples12k, offsetSamples);
          if (!isDeepStrictEqual(withoutTime(baselineFrames[index]), withoutTime(nearest.frame.acoustic))) {
            result.nearestTimebaseCandidateDifferences += 1;
          }
          const baselineDecision = baseline.analysis.contour[index];
          const anchoredDecision = anchoredResult.analysis.contour[nearest.anchoredIndex];
          if (!isDeepStrictEqual(withoutTime(baselineDecision), withoutTime(anchoredDecision))) {
            result.nearestTimebaseDecisionDifferences += 1;
          }
          if (baselineDecision.voiced !== anchoredDecision.voiced) {
            result.nearestTimebaseVoicingDifferences += 1;
          } else if (baselineDecision.voiced && baselineDecision.pitchHz !== null
            && anchoredDecision.pitchHz !== null
            && 1200 * Math.abs(Math.log2(baselineDecision.pitchHz / anchoredDecision.pitchHz)) > 50) {
            result.nearestTimebasePitchDifferencesOver50Cents += 1;
          }
        }
        continue;
      }
      result.alignedCompleteFrames += 1;
      if (!isDeepStrictEqual(withoutTime(baselineFrames[index]), withoutTime(match.frame.acoustic))) {
        result.acousticCandidateDifferences += 1;
      }
      const baselineDecision = withoutTime(baseline.analysis.contour[index]);
      const anchoredDecision = withoutTime(anchoredResult.analysis.contour[match.index]);
      if (!isDeepStrictEqual(baselineDecision, anchoredDecision)) {
        result.temporalDecisionDifferencesOnAlignedFrames += 1;
      }
    }
    if (baseline.analysis.available !== anchoredResult.analysis.available) {
      result.trackAvailabilityDifferencePublications += 1;
    }
    if (!isDeepStrictEqual(baseline.analysis.notes.map(note => note.midi),
      anchoredResult.analysis.notes.map(note => note.midi))) {
      result.noteMidiSequenceDifferencePublications += 1;
    }
    if (isDeepStrictEqual(baseline.analysis, anchoredResult.analysis)) result.exactAnalysisPublications += 1;
  }
  result.meanNearestTimebaseOffsetSamples12k = result.nearestTimebaseCandidateComparisons
    ? nearestOffsetTotal / result.nearestTimebaseCandidateComparisons : 0;
  return result;
}

const compatibilityResults = {
  '44.1k_128': compatibility(44_100, [128]),
  '48k_128': compatibility(48_000, [128]),
  '48k_awkward': compatibility(48_000, [127, 211, 379]),
  '44.1k_half_second': compatibility(44_100, [22_050]),
};

console.log(JSON.stringify({
  method: 'development-only session-anchored Melody feasibility benchmark',
  node: process.version,
  repetitions: { oneShot: 15, steadyUpdates: 25 },
  units: 'milliseconds unless stated otherwise',
  oneShot,
  steady,
  compatibility: compatibilityResults,
}, null, 2));
