import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzePcmListeningAsync, analyzePcmListeningAsyncWithMelody,
} from '../src/analysis/AudioAnalysis.ts';
import {
  analyzeMelodyWithEvidence, interpretMelodyAcousticFrames,
  type MelodyAcousticFrame, type MelodyAcousticCandidate,
} from '../src/analysis/MelodyAnalysis.ts';
import { analyzeBassFromMelodyEvidence } from '../src/bass/BassAnalysis.ts';
import { collectListeningEvents } from '../src/ListeningTimeline.ts';
import { RollingAnalysisEngine } from '../src/streaming/RollingAnalysisEngine.ts';
import {
  createRollingListeningSession, mapRollingListeningResult, ROLLING_LISTENING_WINDOW_SECONDS,
  type RollingListeningUpdate,
} from '../src/streaming/RollingListeningSession.ts';
import { RollingMelodyAcousticObserver } from '../src/streaming/RollingMelodyAcousticObserver.ts';
import type { ListeningMap } from '../src/types.ts';
import { makeRollingPublications } from './rollingEquivalenceHarness.ts';

test('rolling production seams remain absent from the package root', async () => {
  const packageRoot: Record<string, unknown> = await import('../src/index.ts');
  for (const name of ['analyzePcmListeningAsyncWithMelody', 'mapRollingListeningResult',
    'RollingAnalysisEngine', 'RollingMelodyAcousticObserver']) {
    assert.equal(name in packageRoot, false, `${name} must remain internal`);
  }
});

function signal(sampleRate: number, seconds: number) {
  return Float32Array.from({ length: Math.floor(sampleRate * seconds) }, (_, index) => {
    const time = index / sampleRate;
    if (time < 0.2 || (time > 7.1 && time < 7.35)) return 0;
    const melody = time < 6 ? 440 : 523.2511306011972;
    const transient = index % Math.round(sampleRate * 0.47) < 10 ? 0.18 : 0;
    return 0.27 * Math.sin(2 * Math.PI * melody * time)
      + 0.16 * Math.sin(2 * Math.PI * 110 * time) + transient;
  });
}

function withoutMelody(map: ListeningMap) {
  return {
    ...map,
    capabilities: { ...map.capabilities, melody: false },
    melody: null,
    melodyAnalysis: null,
    melodyEvidence: null,
  };
}

const withoutMelodyEvents = (map: ListeningMap) => collectListeningEvents(map, {
  includeInitialTonalCenter: true, includeHarmonyEnds: false, percussionDefaultConfidence: 0,
  noteOffFirstAtSameTime: false,
}).filter(event => event.type !== 'note-on' && event.type !== 'note-off');

test('FILE async composition is exact when supplied the FILE Melody result', async () => {
  const sampleRate = 48_000;
  const mono = signal(sampleRate, 2.5);
  const pcm = { sampleRate, channels: [mono] };
  const baseline = await analyzePcmListeningAsync(pcm);
  const melody = analyzeMelodyWithEvidence({ mono, sampleRate });
  const composed = await analyzePcmListeningAsyncWithMelody(pcm, melody);
  assert.deepStrictEqual(composed, baseline);
});

test('production rolling composition changes only session-anchored Melody fields', async () => {
  const sampleRate = 48_000;
  const samples = signal(sampleRate, 12.75);
  const publications = makeRollingPublications(samples, sampleRate, [127, 211, 379]);
  const selected = [0, 3, 11, 22, publications.length - 1]
    .map(index => publications[index]).filter(Boolean);
  const production = new RollingAnalysisEngine(sampleRate, ROLLING_LISTENING_WINDOW_SECONDS);
  let cursor = 0;
  let sawExpectedMelodyDifference = false;
  for (const publication of selected) {
    production.pushMono(samples.subarray(cursor, publication.publicationSample));
    cursor = publication.publicationSample;
    const pcm = { sampleRate, channels: [publication.pcm] };
    const baseline = await analyzePcmListeningAsync(pcm);
    const candidate = await production.analyzeSnapshot(pcm);
    assert.deepStrictEqual(withoutMelody(candidate.map), withoutMelody(baseline));
    assert.deepStrictEqual(candidate.bassEvidence,
      analyzeBassFromMelodyEvidence(candidate.map.melodyEvidence!));

    const sessionTime = publication.publicationSample / sampleRate;
    const offset = publication.snapshotStartSample / sampleRate;
    const baselineRolling = mapRollingListeningResult(baseline, offset, sessionTime);
    const candidateRolling = mapRollingListeningResult(candidate.map, offset, sessionTime, 0);
    assert.deepStrictEqual(withoutMelody(candidateRolling), withoutMelody(baselineRolling));
    assert.deepStrictEqual(withoutMelodyEvents(candidateRolling), withoutMelodyEvents(baselineRolling));
    if (!isDeepEqualMelody(candidateRolling, baselineRolling)) sawExpectedMelodyDifference = true;
  }
  assert.equal(sawExpectedMelodyDifference, true);
  production.dispose();
});

function isDeepEqualMelody(left: ListeningMap, right: ListeningMap) {
  try {
    assert.deepStrictEqual({ analysis: left.melodyAnalysis, evidence: left.melodyEvidence },
      { analysis: right.melodyAnalysis, evidence: right.melodyEvidence });
    return true;
  } catch {
    return false;
  }
}

function candidate(pitchHz: number, score: number): MelodyAcousticCandidate {
  return { pitchHz, midiFloat: 69 + 12 * Math.log2(pitchHz / 440), periodicity: score,
    salience: score, score, scoreDiagnostic: null };
}

function frame(time: number, candidates: readonly MelodyAcousticCandidate[]): MelodyAcousticFrame {
  return { time, rms: 0.2, candidates, generation: { attempted: true,
    outcome: 'USABLE_CANDIDATES_SURVIVED', searchMode: 'LOCAL_MINIMA', localMinimumCount: candidates.length,
    rawCandidateCount: candidates.length, inRangeCandidateCountBeforeDeduplication: candidates.length,
    duplicateCandidateRemovalCount: 0 }, outOfRangeCandidateCount: 0, rejectedCandidates: [] };
}

test('retained acoustic frames are re-solved so later evidence can revise earlier path decisions', () => {
  const a = candidate(220, 0.80);
  const b = candidate(329.6275569128699, 0.79);
  const early = interpretMelodyAcousticFrames([frame(0.1, [a, b])], 0.2);
  const revised = interpretMelodyAcousticFrames([
    frame(0.1, [a, b]), frame(0.116, [candidate(b.pitchHz, 0.95)]),
  ], 0.3);
  assert.equal(early.analysis.contour[0].pitchHz, a.pitchHz);
  assert.equal(revised.analysis.contour[0].pitchHz, b.pitchHz);
});

test('observer reset, disposal, and new rolling sessions isolate acoustic state', async () => {
  const sampleRate = 32_000;
  const mono = signal(sampleRate, 2);
  const observer = new RollingMelodyAcousticObserver(sampleRate, 12);
  observer.push(mono);
  assert.ok(observer.diagnostics().completedFrameCount > 0);
  observer.reset();
  assert.equal(observer.diagnostics().completedFrameCount, 0);
  assert.equal(observer.frames().length, 0);
  observer.dispose();
  assert.throws(() => observer.push(mono), /disposed/);

  const runSession = () => new Promise<RollingListeningUpdate>(resolve => {
    let time = 2;
    const session = createRollingListeningSession({ sampleRate, readTime: () => time,
      onUpdate(update) { session.stop(); time = update.time; resolve(update); } });
    session.push([mono]);
  });
  const first = await runSession();
  const second = await runSession();
  assert.equal(first.map.melodyEvidence?.frameCount, 115);
  assert.deepStrictEqual(second.map, first.map);
  assert.deepStrictEqual(second.events, first.events);
});
