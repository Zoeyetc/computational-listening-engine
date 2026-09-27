import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzePcmListeningAsync } from '../src/analysis/AudioAnalysis.ts';
import {
  browserLiveStageProfile,
} from '../src/profiling/BrowserLiveStageProfile.ts';
import {
  createRollingListeningSession,
  type RollingAnalysisDiagnosticRecord,
  type RollingAnalysisDiagnosticsSink,
  type RollingListeningUpdate,
} from '../src/index.ts';

const signal = (sampleRate: number, seconds: number) => Float32Array.from(
  { length: Math.floor(sampleRate * seconds) }, (_, index) => {
    const time = index / sampleRate;
    const melody = time < 6 ? 440 : 523.2511306011972;
    const transient = index % Math.round(sampleRate * 0.47) < 10 ? 0.15 : 0;
    return 0.25 * Math.sin(2 * Math.PI * melody * time)
      + 0.14 * Math.sin(2 * Math.PI * 110 * time) + transient;
  });

type Published = Readonly<{
  map: RollingListeningUpdate['map'];
  time: number;
  events: RollingListeningUpdate['events'];
}>;

async function runPublications(sampleRate: number, checkpoints: readonly number[],
  onDiagnostic: RollingAnalysisDiagnosticsSink | null | 'collect' = 'collect') {
  const mono = signal(sampleRate, checkpoints.at(-1) ?? 0);
  const updates: Published[] = [];
  const diagnostics: RollingAnalysisDiagnosticRecord[] = [];
  let sessionTime = 0;
  let cursor = 0;
  let resolveUpdate: (() => void) | null = null;
  const session = createRollingListeningSession({
    sampleRate,
    readTime: () => sessionTime,
    ...(onDiagnostic === null ? {}
      : { onDiagnostic: onDiagnostic === 'collect' ? (record => diagnostics.push(record)) : onDiagnostic }),
    onUpdate(update) {
      updates.push({ map: update.map, time: update.time, events: update.events });
      resolveUpdate?.();
      resolveUpdate = null;
    },
  });
  for (const checkpoint of checkpoints) {
    const end = Math.floor(checkpoint * sampleRate);
    sessionTime = checkpoint;
    const published = new Promise<void>(resolve => { resolveUpdate = resolve; });
    session.push([mono.subarray(cursor, end)]);
    cursor = end;
    await published;
  }
  session.stop();
  return { updates, diagnostics, session };
}

function assertOrdered(record: RollingAnalysisDiagnosticRecord) {
  const wall = record.wallClockMilliseconds;
  assert.ok(wall.requested <= wall.eligible);
  assert.ok(wall.eligible <= wall.analysisStarted);
  assert.ok(wall.analysisStarted <= wall.analysisCompleted);
  assert.ok(wall.analysisCompleted <= wall.updatePrepared);
  assert.ok(wall.updatePrepared <= wall.updatePublished);
}

test('passive diagnostics preserve complete built-in rolling publications through rollover', async () => {
  const checkpoints = [0.25, 2, 12, 12.75] as const;
  const baseline = await runPublications(32_000, checkpoints, null);
  browserLiveStageProfile.enable();
  const observed = await runPublications(32_000, checkpoints);
  const latestProfile = browserLiveStageProfile.latest();
  browserLiveStageProfile.disable();

  assert.deepStrictEqual(observed.updates, baseline.updates);
  assert.equal(observed.diagnostics.length, checkpoints.length);
  const sessionIds = new Set(observed.diagnostics.map(record => record.sessionId));
  assert.equal(sessionIds.size, 1);
  for (const [index, record] of observed.diagnostics.entries()) {
    assert.equal(record.version, 1);
    assert.equal(record.runId, index + 1);
    assert.equal(record.publicationId, record.runId);
    assert.equal(record.analyzer, 'built-in-production');
    assert.equal(record.eligibility, 'immediate');
    assert.equal(record.coalescedRequestCount, 0);
    assert.equal(record.audioTimeSeconds.sessionAtAnalysisStart, checkpoints[index]);
    assert.equal(record.audioTimeSeconds.sessionAtPublication, checkpoints[index]);
    assert.ok(record.audioTimeSeconds.historyDuration <= 12);
    assert.equal(record.audioTimeSeconds.newestIncludedInput, checkpoints[index]);
    assertOrdered(record);
    assert.ok(Object.isFrozen(record));
  }
  assert.ok(latestProfile);
  assert.equal(latestProfile.rollingSessionId, observed.diagnostics.at(-1)?.sessionId);
  assert.equal(latestProfile.rollingRunId, observed.diagnostics.at(-1)?.runId);

  const countBeforeStop = observed.diagnostics.length;
  observed.session.push([new Float32Array(32_000)]);
  await observed.session.analyzeNow();
  assert.equal(observed.diagnostics.length, countBeforeStop);
});

test('diagnostic timestamps stay valid across supported rolling sample rates', async () => {
  const sessionIds: number[] = [];
  for (const sampleRate of [44_100, 48_000]) {
    const run = await runPublications(sampleRate, [0.25]);
    assert.equal(run.diagnostics.length, 1);
    sessionIds.push(run.diagnostics[0].sessionId);
    assert.equal(run.diagnostics[0].analyzer, 'built-in-production');
    assert.equal(run.diagnostics[0].audioTimeSeconds.newestIncludedInput, 0.25);
    assertOrdered(run.diagnostics[0]);
  }
  assert.notEqual(sessionIds[0], sessionIds[1]);
});

test('busy built-in analysis retains one latest coalesced rerun with stable identifiers', async () => {
  const sampleRate = 32_000;
  const mono = signal(sampleRate, 12.5);
  const diagnostics: RollingAnalysisDiagnosticRecord[] = [];
  const updates: RollingListeningUpdate[] = [];
  let sessionTime = 12;
  let resolve: (() => void) | null = null;
  const completed = new Promise<void>(done => { resolve = done; });
  const session = createRollingListeningSession({
    sampleRate,
    readTime: () => sessionTime,
    onDiagnostic: record => diagnostics.push(record),
    onUpdate(update) {
      updates.push(update);
      if (updates.length === 2) { session.stop(); resolve?.(); }
    },
  });
  session.push([mono.subarray(0, sampleRate * 12)]);
  sessionTime = 12.5;
  session.push([mono.subarray(sampleRate * 12)]);
  await completed;

  assert.equal(updates.length, 2);
  assert.equal(diagnostics.length, 2);
  assert.deepStrictEqual(diagnostics.map(record => record.runId), [1, 2]);
  assert.equal(diagnostics[0].eligibility, 'immediate');
  assert.equal(diagnostics[1].eligibility, 'coalesced');
  assert.equal(diagnostics[1].coalescedRequestCount, 1);
  assert.ok(diagnostics[1].wallClockMilliseconds.requested
    <= diagnostics[1].wallClockMilliseconds.eligible);
});

test('diagnostic callback failures cannot break listening or change output', async () => {
  const baseline = await runPublications(32_000, [0.75], null);
  const observed = await runPublications(32_000, [0.75], () => {
    throw new Error('diagnostic failure');
  });
  assert.deepStrictEqual(observed.updates, baseline.updates);
});

test('legacy custom analyze override remains selected and does not start stage profiling', async () => {
  const sampleRate = 32_000;
  const mono = signal(sampleRate, 0.5);
  const diagnostics: RollingAnalysisDiagnosticRecord[] = [];
  const deliveryOrder: string[] = [];
  let analyzeCalls = 0;
  let resolve: ((update: RollingListeningUpdate) => void) | null = null;
  const published = new Promise<RollingListeningUpdate>(done => { resolve = done; });
  browserLiveStageProfile.enable();
  const session = createRollingListeningSession({
    sampleRate,
    readTime: () => 0.5,
    analyze: async pcm => { analyzeCalls += 1; return analyzePcmListeningAsync(pcm); },
    onDiagnostic(record) { deliveryOrder.push('diagnostic'); diagnostics.push(record); },
    onUpdate(update) { deliveryOrder.push('update'); session.stop(); resolve?.(update); },
  });
  session.push([mono]);
  const update = await published;
  const profile = browserLiveStageProfile.latest();
  browserLiveStageProfile.disable();

  assert.equal(analyzeCalls, 1);
  assert.ok(update.map);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].analyzer, 'custom-override');
  assert.deepStrictEqual(deliveryOrder, ['update', 'diagnostic']);
  assert.equal(profile, null);
});
