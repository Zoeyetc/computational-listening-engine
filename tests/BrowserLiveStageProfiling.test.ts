import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzePcmListeningAsync } from '../src/analysis/AudioAnalysis.ts';
import {
  beginBrowserLiveStageProfile,
  browserLiveStageProfile,
  BROWSER_LIVE_STAGE_PROFILE_HISTORY_LIMIT,
  type BrowserLiveStageRecord,
} from '../src/profiling/BrowserLiveStageProfile.ts';
import {
  createRollingListeningSession,
  type RollingListeningUpdate,
} from '../src/streaming/RollingListeningSession.ts';

const signal = (sampleRate: number, seconds: number) => Float32Array.from(
  { length: Math.floor(sampleRate * seconds) }, (_, index) => {
    const time = index / sampleRate;
    return 0.25 * Math.sin(2 * Math.PI * 220 * time)
      + 0.16 * Math.sin(2 * Math.PI * 440 * time);
  });

function runSession(sampleRate: number, mono: Float32Array) {
  return new Promise<RollingListeningUpdate>(resolve => {
    const session = createRollingListeningSession({
      sampleRate,
      readTime: () => mono.length / sampleRate,
      onUpdate(update) { session.stop(); resolve(update); },
    });
    session.push([mono]);
  });
}

test('browser LIVE profiling preserves rolling and FILE listening outputs', async () => {
  const sampleRate = 32_000;
  const mono = signal(sampleRate, 2.25);
  browserLiveStageProfile.enable();
  const profiled = await runSession(sampleRate, mono);
  const record = browserLiveStageProfile.latest();
  assert.ok(record);
  assert.equal(record.counts.emittedMelodyAcousticFrames, 130);
  assert.ok(record.counts.deliberateAsyncYields > 0);
  for (const value of Object.values(record.stages)) {
    assert.ok(Number.isFinite(value) && value >= 0);
  }
  assert.ok(record.stages.generalFrameLoopWall >= record.stages.deliberateAsyncYieldWait);
  assert.ok(record.stages.totalRollingUpdate >= record.stages.nonMelodyAnalysisWall);

  browserLiveStageProfile.disable();
  const ordinary = await runSession(sampleRate, mono);
  assert.deepStrictEqual(profiled.map, ordinary.map);
  assert.deepStrictEqual(profiled.events, ordinary.events);

  browserLiveStageProfile.enable();
  const profiledFile = await analyzePcmListeningAsync({ sampleRate, channels: [mono] });
  browserLiveStageProfile.disable();
  const ordinaryFile = await analyzePcmListeningAsync({ sampleRate, channels: [mono] });
  assert.deepStrictEqual(profiledFile, ordinaryFile);
});

test('browser LIVE profiler exposes bounded latest and summary records without package-root exports', async () => {
  browserLiveStageProfile.enable();
  let last: BrowserLiveStageRecord | null = null;
  for (let index = 0; index < BROWSER_LIVE_STAGE_PROFILE_HISTORY_LIMIT + 3; index += 1) {
    const run = beginBrowserLiveStageProfile();
    assert.ok(run);
    run.add('rhythm', index);
    last = run.finish();
  }
  assert.equal(browserLiveStageProfile.latest(), last);
  const summary = browserLiveStageProfile.summary();
  assert.equal(summary.count, BROWSER_LIVE_STAGE_PROFILE_HISTORY_LIMIT);
  assert.equal(summary.stages.rhythm.count, BROWSER_LIVE_STAGE_PROFILE_HISTORY_LIMIT);
  assert.equal(summary.stages.rhythm.latest, BROWSER_LIVE_STAGE_PROFILE_HISTORY_LIMIT + 2);
  assert.equal(summary.stages.rhythm.max, BROWSER_LIVE_STAGE_PROFILE_HISTORY_LIMIT + 2);
  browserLiveStageProfile.disable();

  const packageRoot: Record<string, unknown> = await import('../src/index.ts');
  for (const name of ['browserLiveStageProfile', 'beginBrowserLiveStageProfile',
    'BROWSER_LIVE_STAGE_PROFILE_HISTORY_LIMIT']) {
    assert.equal(name in packageRoot, false, `${name} must remain internal`);
  }
});

test('browser LIVE profiler is inactive by default and after disable', () => {
  browserLiveStageProfile.clear();
  browserLiveStageProfile.disable();
  assert.equal('__CLE_LIVE_STAGE_PROFILE__' in globalThis, false);
  assert.equal(beginBrowserLiveStageProfile(), null);
  assert.equal(browserLiveStageProfile.latest(), null);
  assert.equal(browserLiveStageProfile.summary().count, 0);
});
