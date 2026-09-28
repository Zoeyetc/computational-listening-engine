import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { probeDrumEvidence } from '../src/experiments/DrumEvidenceProbe.ts';
import {
  classifyPercussionCore,
  PERCUSSION_CORE_THRESHOLDS,
} from '../src/analysis/PercussionAnalysisCore.ts';

export const DRUM_EVENT_WINDOWS = Object.freeze([
  Object.freeze({ id: 'kit-kick', label: 'kick', start: 7.5, end: 17.5 }),
  Object.freeze({ id: 'kit-snare', label: 'snare', start: 35.5, end: 45.5 }),
  Object.freeze({ id: 'kit-hi-hat', label: 'hi-hat', start: 63, end: 73 }),
  Object.freeze({ id: 'kit-tom', label: 'tom', start: 85, end: 95 }),
]);
export const MATCH_TOLERANCE_SECONDS = 0.07;

const KIT_FILE = 'Kit Calibration.wav';
const EXPECTED_KIT_SHA256 = 'c4960207cee841517e4a95f581cdf9be6f719aeae93016513f0a483b9687e2d1';
const NEGATIVE_CONTROLS = Object.freeze([
  Object.freeze({ file: 'Calibration Sections.wav', id: 'piano', start: 80, end: 87.5,
    limitation: 'human-confirmed weak section label' }),
  Object.freeze({ file: 'Calibration Sections.wav', id: 'bass', start: 87.5, end: 95,
    limitation: 'human-confirmed weak section label' }),
  Object.freeze({ file: 'Funk Bass Solo.wav', id: 'funk-bass-solo', start: 0, end: null,
    limitation: 'filename-level bass label; monophony and drum absence are not annotated' }),
  Object.freeze({ file: 'Bass Pocket.wav', id: 'bass-pocket', start: 0, end: null,
    limitation: 'filename-level bass label; monophony and drum absence are not annotated' }),
]);

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
      fmt = { format: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4), bits: buffer.readUInt16LE(start + 14) };
    }
    if (id === 'data') data = { start, size };
    offset = start + size + (size & 1);
  }
  if (!fmt || !data || fmt.format !== 1 || fmt.bits !== 16) throw new Error(`Unsupported WAV: ${path}`);
  const frameBytes = fmt.channels * 2;
  const frameCount = Math.floor(data.size / frameBytes);
  const channels = Array.from({ length: fmt.channels }, () => new Float32Array(frameCount));
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < fmt.channels; channel += 1) {
      channels[channel][frame] = buffer.readInt16LE(data.start + frame * frameBytes + channel * 2) / 32768;
    }
  }
  return { pcm: { sampleRate: fmt.sampleRate, channels }, sha256: createHash('sha256').update(buffer).digest('hex') };
}

const inRange = (time, start, end) => time >= start && time < end;
const ratio = (numerator, denominator) => denominator ? numerator / denominator : null;
const round = (value, digits = 6) => value === null ? null
  : Math.round(value * 10 ** digits) / 10 ** digits;
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const percentile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
};
const distribution = values => ({ count: values.length, min: round(percentile(values, 0)),
  median: round(percentile(values, 0.5)), p95: round(percentile(values, 0.95)),
  max: round(percentile(values, 1)), mean: round(mean(values)) });
const countBy = (values, key) => Object.fromEntries([...new Set(values.map(key))].sort()
  .map(value => [value, values.filter(item => key(item) === value).length]));

function generalFrameStages(map) {
  const frames = map.amplitude.map(region => ({
    time: region.start, rms: region.rms[0], onset: region.onsetStrength[0],
  }));
  return frames.map((frame, index) => {
    const previous = frames[index - 1]?.onset ?? 0;
    const next = frames[index + 1]?.onset ?? 0;
    const baselineFrames = frames.slice(Math.max(0, index - 8), index);
    const baseline = baselineFrames.length
      ? baselineFrames.reduce((sum, item) => sum + item.onset, 0) / baselineFrames.length : 0;
    const peak = index > 0 && frame.onset > 0 && frame.onset >= previous && frame.onset >= next;
    const floor = peak && frame.onset >= PERCUSSION_CORE_THRESHOLDS.onset;
    const threshold = Math.max(PERCUSSION_CORE_THRESHOLDS.onset, baseline * 1.35 + 0.06);
    const adaptive = floor && frame.onset >= threshold;
    const candidate = adaptive && frame.rms >= 0.025;
    return { ...frame, baseline, threshold, peak, floor, adaptive, candidate };
  });
}

function better(a, b) {
  if (!b || a.matches !== b.matches) return !b || a.matches > b.matches;
  if (Math.abs(a.cost - b.cost) > 1e-12) return a.cost < b.cost;
  return a.priority < b.priority;
}

/** Maximum-cardinality, minimum-total-offset, order-preserving one-to-one matching. */
export function matchOnsets(humanTimes, engineTimes, toleranceSeconds = MATCH_TOLERANCE_SECONDS) {
  const humans = humanTimes.map((time, index) => ({ time, index })).sort((a, b) => a.time - b.time || a.index - b.index);
  const engines = engineTimes.map((time, index) => ({ time, index })).sort((a, b) => a.time - b.time || a.index - b.index);
  const rows = humans.length + 1;
  const columns = engines.length + 1;
  const table = Array.from({ length: rows }, () => Array(columns));
  table[humans.length][engines.length] = { matches: 0, cost: 0, action: 'done', priority: 9 };
  for (let i = humans.length; i >= 0; i -= 1) {
    for (let j = engines.length; j >= 0; j -= 1) {
      if (i === humans.length && j === engines.length) continue;
      let best = null;
      if (i < humans.length) {
        const tail = table[i + 1][j];
        const option = { matches: tail.matches, cost: tail.cost, action: 'skip-human', priority: 2 };
        if (better(option, best)) best = option;
      }
      if (j < engines.length) {
        const tail = table[i][j + 1];
        const option = { matches: tail.matches, cost: tail.cost, action: 'skip-engine', priority: 1 };
        if (better(option, best)) best = option;
      }
      if (i < humans.length && j < engines.length) {
        const offset = engines[j].time - humans[i].time;
        if (Math.abs(offset) <= toleranceSeconds) {
          const tail = table[i + 1][j + 1];
          const option = { matches: tail.matches + 1, cost: tail.cost + Math.abs(offset),
            action: 'match', priority: 0 };
          if (better(option, best)) best = option;
        }
      }
      table[i][j] = best;
    }
  }
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < humans.length || j < engines.length) {
    const action = table[i][j].action;
    if (action === 'match') {
      pairs.push({ humanIndex: humans[i].index, engineIndex: engines[j].index,
        humanTime: humans[i].time, engineTime: engines[j].time,
        offsetSeconds: engines[j].time - humans[i].time });
      i += 1; j += 1;
    } else if (action === 'skip-human') i += 1;
    else if (action === 'skip-engine') j += 1;
    else break;
  }
  const matchedHumans = new Set(pairs.map(pair => pair.humanIndex));
  const matchedEngines = new Set(pairs.map(pair => pair.engineIndex));
  return Object.freeze({ pairs: Object.freeze(pairs),
    unmatchedHumanIndexes: Object.freeze(humanTimes.flatMap((_, index) => matchedHumans.has(index) ? [] : [index])),
    unmatchedEngineIndexes: Object.freeze(engineTimes.flatMap((_, index) => matchedEngines.has(index) ? [] : [index])) });
}

export function counterfactualClassification(descriptors) {
  const classification = classifyPercussionCore(descriptors, true);
  const hypotheses = Object.entries(classification.scores)
    .filter(([role]) => role !== 'other-percussion')
    .map(([role, score]) => ({ role, score }))
    .sort((a, b) => b.score - a.score || a.role.localeCompare(b.role));
  const insufficient = classification.confidence < PERCUSSION_CORE_THRESHOLDS.confidence
    || descriptors.onsetStrength < PERCUSSION_CORE_THRESHOLDS.onset;
  const decision = insufficient ? 'INSUFFICIENT_EVIDENCE'
    : classification.role === 'other-percussion' ? 'AMBIGUOUS_CLASS_EVIDENCE' : 'NAMED_CLASS';
  return Object.freeze({ decision, role: decision === 'NAMED_CLASS' ? classification.role : null,
    hypotheses: Object.freeze(hypotheses), topHypothesis: hypotheses[0], secondHypothesis: hypotheses[1],
    margin: classification.margin, confidence: classification.confidence,
    ambiguityReasons: classification.ambiguityReasons,
    ambiguitySupport: classification.scores['other-percussion'] });
}

function gateInputs(event) {
  const descriptor = event.descriptors;
  const highDominance = descriptor.highRatio + descriptor.airRatio;
  return { duration: descriptor.duration, highDominance, flatness: descriptor.flatness,
    longLowHighDominance: descriptor.duration > 0.45 && highDominance < 0.38,
    stablePitchedBody: descriptor.flatness < 0.01 && descriptor.duration > 0.3,
    onsetStrength: descriptor.onsetStrength, rms: descriptor.rms,
    lowPersistence: descriptor.lowPersistence, highPersistence: descriptor.highPersistence };
}

function counterfactualSummary(events) {
  const rows = events.map(event => ({ time: event.time, gate: gateInputs(event),
    classification: counterfactualClassification(event.descriptors) }));
  const named = rows.filter(row => row.classification.decision === 'NAMED_CLASS');
  return { sustainedRejectCount: rows.length,
    hypotheticalNamedCount: named.length,
    hypotheticalNamedRate: ratio(named.length, rows.length),
    ambiguousCount: rows.filter(row => row.classification.decision === 'AMBIGUOUS_CLASS_EVIDENCE').length,
    insufficientCount: rows.filter(row => row.classification.decision === 'INSUFFICIENT_EVIDENCE').length,
    namedClassDistribution: countBy(named, row => row.classification.role),
    confidence: distribution(rows.map(row => row.classification.confidence)),
    margin: distribution(rows.map(row => row.classification.margin)), rows };
}

function validateAnnotations(value) {
  if (!value || value.version !== '0.1' || value.sourceFile !== KIT_FILE
    || value.sourceSha256 !== EXPECTED_KIT_SHA256 || !Array.isArray(value.windows)) {
    throw new Error('Annotation file does not identify the expected Kit Calibration.wav asset');
  }
  for (const expected of DRUM_EVENT_WINDOWS) {
    const window = value.windows.find(item => item.id === expected.id);
    if (!window || window.label !== expected.label || window.start !== expected.start || window.end !== expected.end
      || !Array.isArray(window.annotations)) throw new Error(`Invalid annotation window ${expected.id}`);
    let previous = -Infinity;
    for (const annotation of window.annotations) {
      if (!Number.isFinite(annotation.timeSeconds) || annotation.timeSeconds < expected.start
        || annotation.timeSeconds >= expected.end || annotation.label !== expected.label
        || annotation.timeSeconds < previous) throw new Error(`Invalid annotation in ${expected.id}`);
      previous = annotation.timeSeconds;
    }
  }
  return value;
}

function engineWindowSummary(window, result, stages) {
  const frames = stages.filter(frame => inRange(frame.time, window.start, window.end));
  const events = result.drum.events.filter(event => inRange(event.time, window.start, window.end));
  const published = result.map.percussionAnalysis.events.filter(event => inRange(event.time, window.start, window.end));
  return { ...window, duration: window.end - window.start,
    acousticPeakCount: frames.filter(frame => frame.peak).length,
    fixedFloorCount: frames.filter(frame => frame.floor).length,
    adaptiveOnsetCount: frames.filter(frame => frame.adaptive).length,
    productionCandidateCount: events.length,
    sustainedRejectCount: events.filter(event => event.decision.reason === 'NON_PERCUSSIVE_SUSTAINED').length,
    scoringCount: events.filter(event => event.hypotheses.length).length,
    publishedCount: published.length,
    publishedRoles: countBy(published, event => event.type) };
}

function humanWindowStudy(window, annotationWindow, result, stages) {
  const humans = annotationWindow.annotations.map(item => item.timeSeconds);
  const frames = stages.filter(frame => inRange(frame.time, window.start, window.end));
  const trace = result.drum.events.filter(event => inRange(event.time, window.start, window.end));
  const stageLists = {
    acousticPeak: frames.filter(frame => frame.peak), fixedFloor: frames.filter(frame => frame.floor),
    adaptiveOnset: frames.filter(frame => frame.adaptive), productionCandidate: trace,
  };
  const matches = Object.fromEntries(Object.entries(stageLists).map(([name, items]) =>
    [name, matchOnsets(humans, items.map(item => item.time))]));
  const production = matches.productionCandidate;
  const matchedTrace = production.pairs.map(pair => ({ pair, event: trace[pair.engineIndex] }));
  const sustained = matchedTrace.filter(item => item.event.decision.reason === 'NON_PERCUSSIVE_SUSTAINED');
  const scoring = matchedTrace.filter(item => item.event.hypotheses.length > 0);
  const selected = matchedTrace.filter(item => item.event.decision.state === 'SELECTED');
  const abstained = matchedTrace.filter(item => item.event.decision.state === 'ABSTAINED');
  const rejected = matchedTrace.filter(item => item.event.decision.state === 'REJECTED');
  const published = matchedTrace.filter(item => item.event.production.accepted);
  const correctRoles = window.label === 'hi-hat' ? new Set(['closed-hat', 'open-hat']) : new Set([window.label]);
  const productionRows = matchedTrace.map(item => ({
    humanTime: item.pair.humanTime, candidateTime: item.event.time,
    offsetSeconds: item.pair.offsetSeconds, decision: item.event.decision,
    productionRole: item.event.production.role,
  }));
  const counterfactualRows = sustained.map(item => {
    const classification = counterfactualClassification(item.event.descriptors);
    const outcome = classification.decision === 'AMBIGUOUS_CLASS_EVIDENCE' ? 'AMBIGUOUS'
      : classification.decision === 'INSUFFICIENT_EVIDENCE' ? 'INSUFFICIENT'
        : correctRoles.has(classification.role) ? 'INTENDED_CLASS' : 'WRONG_CLASS';
    return { humanTime: item.pair.humanTime, candidateTime: item.event.time,
      offsetSeconds: item.pair.offsetSeconds, gate: gateInputs(item.event), classification, outcome };
  });
  const gateRows = sustained.map(item => gateInputs(item.event));
  const matchedCount = name => matches[name].pairs.length;
  return { ...window, annotatedHumanHits: humans.length,
    funnel: {
      matchedAcousticPeaks: matchedCount('acousticPeak'),
      passedFixedOnsetFloor: matchedCount('fixedFloor'),
      passedAdaptiveOnset: matchedCount('adaptiveOnset'),
      matchedProductionCandidates: production.pairs.length,
      survivedSustainedGate: production.pairs.length - sustained.length,
      reachedClassScoring: scoring.length,
      selected: selected.length, abstained: abstained.length, rejected: rejected.length,
      published: published.length,
    },
    proportionsOfHumanHits: {
      peakMatchRate: ratio(matchedCount('acousticPeak'), humans.length),
      productionCandidateMatchRate: ratio(production.pairs.length, humans.length),
      sustainedGateSurvivalRate: ratio(production.pairs.length - sustained.length, production.pairs.length),
      scoringReachRate: ratio(scoring.length, humans.length), selectedRate: ratio(selected.length, humans.length),
      abstentionRate: ratio(abstained.length, humans.length), publishedRate: ratio(published.length, humans.length),
    },
    sustainedGateFalseRejectionCount: sustained.length,
    productionDecisions: {
      intendedNamedCount: selected.filter(item => correctRoles.has(item.event.decision.role)).length,
      wrongNamedCount: selected.filter(item => !correctRoles.has(item.event.decision.role)).length,
      selectedRoleDistribution: countBy(selected, item => item.event.decision.role),
      abstentionReasonDistribution: countBy(abstained, item => item.event.decision.reason),
      rejectionReasonDistribution: countBy(rejected, item => item.event.decision.reason),
      rows: productionRows,
    },
    gateInputDistributions: {
      duration: distribution(gateRows.map(row => row.duration)),
      highDominance: distribution(gateRows.map(row => row.highDominance)),
      flatness: distribution(gateRows.map(row => row.flatness)),
      longLowHighDominanceCount: gateRows.filter(row => row.longLowHighDominance).length,
      stablePitchedBodyCount: gateRows.filter(row => row.stablePitchedBody).length,
    },
    counterfactual: {
      intendedClassCount: counterfactualRows.filter(row => row.outcome === 'INTENDED_CLASS').length,
      wrongClassCount: counterfactualRows.filter(row => row.outcome === 'WRONG_CLASS').length,
      ambiguousCount: counterfactualRows.filter(row => row.outcome === 'AMBIGUOUS').length,
      insufficientCount: counterfactualRows.filter(row => row.outcome === 'INSUFFICIENT').length,
      margin: distribution(counterfactualRows.map(row => row.classification.margin)), rows: counterfactualRows,
    },
    matching: {
      toleranceSeconds: MATCH_TOLERANCE_SECONDS,
      productionOffsets: distribution(production.pairs.map(pair => pair.offsetSeconds)),
      unmatchedHumanTimesAtProductionCandidate: production.unmatchedHumanIndexes.map(index => humans[index]),
      unmatchedProductionCandidateTimes: production.unmatchedEngineIndexes.map(index => trace[index].time),
    } };
}

async function main() {
  const assetRoot = process.argv[2];
  const annotationPath = process.argv[3] ?? null;
  if (!assetRoot) throw new Error('Usage: node scripts/drum-counterfactual-gate-study.mjs <asset-root> [annotations.json]');
  const kit = readWav(`${assetRoot}/${KIT_FILE}`);
  if (kit.sha256 !== EXPECTED_KIT_SHA256) throw new Error('Kit Calibration.wav SHA-256 does not match Gate A');
  const kitResult = probeDrumEvidence(kit.pcm);
  const kitStages = generalFrameStages(kitResult.map);
  const output = {
    version: '0.1', study: 'Drum Event Annotation + Counterfactual Gate Study',
    productionBehaviorChanged: false,
    matchingPolicy: { toleranceSeconds: MATCH_TOLERANCE_SECONDS, oneToOne: true,
      objective: 'maximum-cardinality then minimum-total-absolute-offset, order-preserving',
      sourceSampleRate: 48000, frameSize: 2048, hopSize: 1024,
      frameSeconds: 2048 / 48000, hopSeconds: 1024 / 48000 },
    selectedWindows: DRUM_EVENT_WINDOWS.map(window => engineWindowSummary(window, kitResult, kitStages)),
    annotationStatus: annotationPath ? 'loaded' : 'required', humanHitStudies: [], negativeControls: [],
  };
  if (annotationPath) {
    const annotations = validateAnnotations(JSON.parse(fs.readFileSync(annotationPath, 'utf8')));
    output.humanHitStudies = DRUM_EVENT_WINDOWS.map(window => humanWindowStudy(window,
      annotations.windows.find(item => item.id === window.id), kitResult, kitStages));
  }
  const cache = new Map([[KIT_FILE, { pcm: kit.pcm, result: kitResult }]]);
  for (const control of NEGATIVE_CONTROLS) {
    if (!cache.has(control.file)) {
      const source = readWav(`${assetRoot}/${control.file}`);
      cache.set(control.file, { pcm: source.pcm, result: probeDrumEvidence(source.pcm) });
    }
    const { pcm, result } = cache.get(control.file);
    const duration = pcm.channels[0].length / pcm.sampleRate;
    const end = control.end ?? duration;
    const trace = result.drum.events.filter(event => inRange(event.time, control.start, end));
    const sustained = trace.filter(event => event.decision.reason === 'NON_PERCUSSIVE_SUSTAINED');
    output.negativeControls.push({ ...control, end, duration: end - control.start,
      productionCandidateCount: trace.length, ...counterfactualSummary(sustained) });
  }
  console.log(JSON.stringify(output, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
