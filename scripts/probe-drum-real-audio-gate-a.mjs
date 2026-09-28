import fs from 'node:fs';
import { probeDrumEvidence } from '../src/experiments/DrumEvidenceProbe.ts';
import {
  analyzeBassFromMelodyEvidence,
  readCompactMelodyEvidenceStorage,
} from '../src/index.ts';

const ROOT = process.argv[2];
if (!ROOT) throw new Error('Usage: node scripts/probe-drum-real-audio-gate-a.mjs <asset-root>');
const INPUTS = [
  {
    file: 'Kit Calibration.wav',
    sections: [
      [0, 25, 'kick'], [25, 56, 'snare'], [56, 80, 'hi-hat'], [80, 100, 'tom'],
      [100, 116.96, 'full-drums'],
    ],
  },
  {
    file: 'Calibration Sections.wav',
    sections: [
      [0, 16, 'kick'], [16, 30, 'snare'], [30, 46, 'hi-hat'], [46, 65, 'tom'],
      [65, 80, 'full-drums'], [80, 87.5, 'monophonic-piano'], [87.5, 95, 'bass'],
      [95, 107.68, 'piano+drums'],
    ],
  },
];

function readWav(path) {
  const buffer = fs.readFileSync(path);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`Not a RIFF/WAVE file: ${path}`);
  }
  let fmt = null;
  let data = null;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bits: buffer.readUInt16LE(start + 14),
      };
    }
    if (id === 'data') data = { start, size };
    offset = start + size + (size & 1);
  }
  if (!fmt || !data || fmt.format !== 1 || fmt.bits !== 16) throw new Error(`Unsupported WAV: ${path}`);
  const bytesPerSample = fmt.bits / 8;
  const frameBytes = bytesPerSample * fmt.channels;
  const frameCount = Math.floor(data.size / frameBytes);
  const channels = Array.from({ length: fmt.channels }, () => new Float32Array(frameCount));
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < fmt.channels; channel += 1) {
      channels[channel][frame] = buffer.readInt16LE(data.start + frame * frameBytes + channel * bytesPerSample) / 32768;
    }
  }
  return { sampleRate: fmt.sampleRate, channels };
}

const round = (value, digits = 4) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const density = (count, duration) => round(count / duration, 3);
const countBy = (values, key) => Object.fromEntries([...new Set(values.map(key))].sort()
  .map(value => [value, values.filter(item => key(item) === value).length]));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const inSection = (time, start, end) => time >= start && time < end;

function generalFrameStages(map) {
  const frames = map.amplitude.map(region => ({
    time: region.start,
    rms: region.rms[0],
    onset: region.onsetStrength[0],
  }));
  return frames.map((frame, index) => {
    const previous = frames[index - 1]?.onset ?? 0;
    const next = frames[index + 1]?.onset ?? 0;
    const baselineFrames = frames.slice(Math.max(0, index - 8), index);
    const baseline = baselineFrames.length
      ? baselineFrames.reduce((sum, item) => sum + item.onset, 0) / baselineFrames.length : 0;
    const localPeak = index > 0 && frame.onset > 0 && frame.onset >= previous && frame.onset >= next;
    const fixedOnsetFloor = localPeak && frame.onset >= 0.2;
    const adaptiveOnsetThreshold = Math.max(0.2, baseline * 1.35 + 0.06);
    const adaptiveOnset = fixedOnsetFloor && frame.onset >= adaptiveOnsetThreshold;
    const productionCandidate = adaptiveOnset && frame.rms >= 0.025;
    return { ...frame, baseline, adaptiveOnsetThreshold, localPeak, fixedOnsetFloor,
      adaptiveOnset, productionCandidate };
  });
}

function summarizeSection(input, result, stages, bassEvidence, section) {
  const [start, end, label] = section;
  const duration = end - start;
  const frames = stages.filter(frame => inSection(frame.time, start, end));
  const trace = result.drum.events.filter(event => inSection(event.time, start, end));
  const scored = trace.filter(event => event.hypotheses.length > 0);
  const selected = trace.filter(event => event.decision.state === 'SELECTED');
  const abstained = trace.filter(event => event.decision.state === 'ABSTAINED');
  const rejected = trace.filter(event => event.decision.state === 'REJECTED');
  const published = result.map.percussionAnalysis.events.filter(event => inSection(event.time, start, end));
  const ambiguityReasonEvents = abstained.filter(event => event.decision.reason === 'AMBIGUOUS_CLASS_EVIDENCE');
  const ambiguityReasons = {};
  for (const event of ambiguityReasonEvents) {
    for (const reason of event.ambiguityFallback?.reasons ?? []) {
      ambiguityReasons[reason] = (ambiguityReasons[reason] ?? 0) + 1;
    }
  }

  const evidence = result.map.melodyEvidence;
  const storage = readCompactMelodyEvidenceStorage(evidence);
  const melodyIndexes = Array.from(storage.frameTimes.keys())
    .filter(index => inSection(storage.frameTimes[index], start, end));
  const melodyCandidateCount = melodyIndexes.reduce((sum, index) =>
    sum + storage.candidateOffsets[index + 1] - storage.candidateOffsets[index], 0);
  const melodyCandidateFrames = melodyIndexes.filter(index =>
    storage.candidateOffsets[index + 1] > storage.candidateOffsets[index]).length;
  const melodyVoicedFrames = melodyIndexes.filter(index => storage.voiced[index] === 1).length;
  const melodyFinalPitches = melodyIndexes.map(index => storage.finalPitchHz[index]).filter(Number.isFinite);
  const bassFrames = bassEvidence.frames.filter(frame => inSection(frame.time, start, end));
  const bassSelected = bassFrames.filter(frame => frame.reason === 'SELECTED');
  const rhythmBeats = result.map.rhythmAnalysis.beats.filter(beat => {
    const time = typeof beat === 'number' ? beat : beat.time;
    return inSection(time, start, end);
  });

  const opportunityCount = frames.filter(frame => frame.localPeak).length;
  const fixedFloorCount = frames.filter(frame => frame.fixedOnsetFloor).length;
  const adaptiveCount = frames.filter(frame => frame.adaptiveOnset).length;
  const productionCandidateCount = frames.filter(frame => frame.productionCandidate).length;
  const actualCandidateCount = trace.length;
  const kickScores = scored.map(event => event.hypotheses.find(item => item.role === 'kick')?.score ?? 0);
  const tomScores = scored.map(event => event.hypotheses.find(item => item.role === 'tom')?.score ?? 0);
  return {
    file: input.file, label, start, end, duration,
    funnel: {
      acousticLocalPeaks: opportunityCount,
      fixedOnsetFloorPeaks: fixedFloorCount,
      adaptiveOnsetSurvivors: adaptiveCount,
      rmsSurvivorsProductionCandidates: productionCandidateCount,
      tracedProductionCandidates: actualCandidateCount,
      reachedDescriptorExtraction: trace.filter(event => event.descriptors !== null).length,
      reachedClassScoring: scored.length,
      selectedNamed: selected.length,
      abstained: abstained.length,
      rejected: rejected.length,
      publishedPercussionEvents: published.length,
    },
    densityPerSecond: {
      acousticLocalPeaks: density(opportunityCount, duration),
      fixedOnsetFloorPeaks: density(fixedFloorCount, duration),
      adaptiveOnsetSurvivors: density(adaptiveCount, duration),
      rmsSurvivorsProductionCandidates: density(productionCandidateCount, duration),
      reachedClassScoring: density(scored.length, duration),
      selectedNamed: density(selected.length, duration),
      abstained: density(abstained.length, duration),
      rejected: density(rejected.length, duration),
      publishedPercussionEvents: density(published.length, duration),
    },
    losses: {
      belowFixedOnsetFloor: opportunityCount - fixedFloorCount,
      belowAdaptiveOnsetThreshold: fixedFloorCount - adaptiveCount,
      belowRmsThreshold: adaptiveCount - productionCandidateCount,
      incompleteRightEdge: trace.filter(event => event.decision.reason === 'INCOMPLETE_RIGHT_EDGE').length,
      sustainedNonPercussive: trace.filter(event => event.decision.reason === 'NON_PERCUSSIVE_SUSTAINED').length,
      temporalDeduplication: trace.filter(event => event.decision.reason === 'TEMPORAL_DEDUPLICATION').length,
      insufficientEvidence: trace.filter(event => event.decision.reason === 'INSUFFICIENT_EVIDENCE').length,
      ambiguousClassEvidence: trace.filter(event => event.decision.reason === 'AMBIGUOUS_CLASS_EVIDENCE').length,
      other: trace.filter(event => ![
        'INCOMPLETE_RIGHT_EDGE', 'NON_PERCUSSIVE_SUSTAINED', 'TEMPORAL_DEDUPLICATION',
        'INSUFFICIENT_EVIDENCE', 'AMBIGUOUS_CLASS_EVIDENCE', 'NAMED_CLASS_ACCEPTED',
      ].includes(event.decision.reason)).length,
    },
    selectedRoles: countBy(selected, event => event.decision.role),
    publishedRoles: countBy(published, event => event.type),
    topScoredRoles: countBy(scored, event => event.hypotheses[0].role),
    ambiguityReasons,
    scoreCompetition: {
      meanKickScore: round(mean(kickScores) ?? 0),
      meanTomScore: round(mean(tomScores) ?? 0),
      kickAboveTom: scored.filter((_, index) => kickScores[index] > tomScores[index]).length,
      tomAboveKick: scored.filter((_, index) => tomScores[index] > kickScores[index]).length,
      equal: scored.filter((_, index) => tomScores[index] === kickScores[index]).length,
      meanTopScore: round(mean(scored.map(event => event.production.topScore)) ?? 0),
      meanMargin: round(mean(scored.map(event => event.production.margin)) ?? 0),
      meanConfidence: round(mean(scored.map(event => event.production.confidence)) ?? 0),
    },
    crossPath: {
      melodyCandidateCount,
      melodyCandidateFrames,
      melodyVoicedFrames,
      melodyVoicedFrameDensity: round(melodyVoicedFrames / Math.max(1, melodyIndexes.length), 3),
      medianFinalPitchHz: round(median(melodyFinalPitches) ?? 0, 2),
      melodyTrackAvailableGlobally: result.map.melodyAnalysis.available,
      bassSelectedFrames: bassSelected.length,
      bassFrameCount: bassFrames.length,
      rhythmAvailableGlobally: result.map.rhythmAnalysis.available,
      rhythmBpmGlobally: result.map.rhythmAnalysis.bpm,
      rhythmBeatsInSection: rhythmBeats.length,
    },
  };
}

const output = { version: '0.1', labels: 'weak-section-level', files: [], sections: [] };
for (const input of INPUTS) {
  const pcm = readWav(`${ROOT}/${input.file}`);
  const started = performance.now();
  const result = probeDrumEvidence(pcm);
  const wallMilliseconds = performance.now() - started;
  const stages = generalFrameStages(result.map);
  const bassEvidence = analyzeBassFromMelodyEvidence(result.map.melodyEvidence);
  const computedCandidates = stages.filter(frame => frame.productionCandidate).length;
  output.files.push({
    file: input.file,
    duration: pcm.channels[0].length / pcm.sampleRate,
    sampleRate: pcm.sampleRate,
    channels: pcm.channels.length,
    analysisWallMilliseconds: round(wallMilliseconds, 2),
    generalFrameCount: stages.length,
    computedProductionCandidates: computedCandidates,
    tracedProductionCandidates: result.drum.onsetCandidateCount,
    candidateReconstructionMatches: computedCandidates === result.drum.onsetCandidateCount,
    publishedEvents: result.map.percussionAnalysis.events.length,
    percussionAvailable: result.map.percussionAnalysis.available,
    percussionConfidence: result.map.percussionAnalysis.confidence,
    percussionDensity: result.map.percussionAnalysis.eventDensity,
  });
  for (const section of input.sections) {
    output.sections.push(summarizeSection(input, result, stages, bassEvidence, section));
  }
}
console.log(JSON.stringify(output, null, 2));
