import {
  analyzeBassFromMelodyEvidence,
  lookupBassSnapshot,
  readCompactMelodyEvidenceStorage,
  selectMelodyEvidence,
} from '../src/index.ts';
import { probeDrumEvidence } from '../src/experiments/DrumEvidenceProbe.ts';
import { DRUM_PROBE_CONTROLLED_FIXTURES } from '../tests/drumProbeFixtures.ts';

const repetitions = 12;
const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))] ?? 0;
};
const round = (value, digits = 3) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const summaries = [];
for (const fixture of DRUM_PROBE_CONTROLLED_FIXTURES) {
  const pcm = fixture.create();
  probeDrumEvidence(pcm);
  const runs = Array.from({ length: repetitions }, () => probeDrumEvidence(pcm));
  const representative = runs.at(-1);
  const evidence = representative.drum;
  const duration = pcm.channels[0].length / pcm.sampleRate;
  const probeTime = evidence.events.find(event => event.decision.state === 'SELECTED')?.time
    ?? evidence.events[0]?.time ?? Math.min(duration, 0.25);
  const melody = selectMelodyEvidence(representative.map.melodyEvidence, probeTime, true);
  const melodyStorage = readCompactMelodyEvidenceStorage(representative.map.melodyEvidence);
  const bassEvidence = analyzeBassFromMelodyEvidence(representative.map.melodyEvidence);
  const bass = lookupBassSnapshot(bassEvidence, probeTime);
  const acceptedPercussion = representative.map.percussionAnalysis?.events ?? [];
  summaries.push({
    id: fixture.id,
    fixtureLimitation: fixture.limitation,
    duration,
    probeTime,
    observedPitch: melody?.observedPitch ?? null,
    melodyCandidates: melody ? {
      usable: melody.candidates.length,
      rangeRejected: melody.rejectedCandidates.length,
      retainedCandidateCount: melodyStorage.candidatePitchHz.length,
      retainedCandidatePitchPreview: Array.from(melodyStorage.candidatePitchHz.slice(0, 4)),
      selectedPitchHz: melody.selectedPitchHz,
      finalPitchHz: melody.finalPitchHz,
      reason: melody.reason,
      trackAvailable: representative.map.melodyAnalysis?.available ?? false,
    } : null,
    bass: { available: bass.available, pitchHz: bass.pitchHz, reason: bass.reason },
    rhythm: {
      available: representative.map.rhythmAnalysis?.available ?? false,
      bpm: representative.map.rhythmAnalysis?.bpm ?? null,
      confidence: representative.map.rhythmAnalysis?.confidence ?? 0,
    },
    percussion: {
      available: representative.map.percussionAnalysis?.available ?? false,
      accepted: acceptedPercussion.length,
      roles: acceptedPercussion.map(event => event.type),
      confidence: representative.map.percussionAnalysis?.confidence ?? 0,
    },
    drum: {
      candidates: evidence.onsetCandidateCount,
      selected: evidence.selectedCount,
      abstained: evidence.abstainedCount,
      rejected: evidence.rejectedCount,
      decisions: evidence.events.map(event => ({ time: event.time, ...event.decision,
        hypotheses: event.hypotheses.slice(0, 3) })),
    },
    performance: {
      incrementalMedianMilliseconds: round(percentile(runs.map(run =>
        run.drum.performance.incrementalProbeMilliseconds), 0.5)),
      incrementalP95Milliseconds: round(percentile(runs.map(run =>
        run.drum.performance.incrementalProbeMilliseconds), 0.95)),
      perCandidateMedianMilliseconds: round(percentile(runs.map(run =>
        run.drum.performance.incrementalMillisecondsPerCandidate), 0.5), 6),
      perFrameMedianMilliseconds: round(percentile(runs.map(run =>
        run.drum.performance.incrementalMillisecondsPerFrame), 0.5), 6),
      fullAnalysisMedianMilliseconds: round(percentile(runs.map(run =>
        run.drum.performance.fullAnalysisWallMilliseconds), 0.5)),
      retainedNumericPayloadBytes: evidence.retainedNumericPayloadBytes,
    },
  });
}

console.log(JSON.stringify({ version: 0, repetitions, summaries }, null, 2));
