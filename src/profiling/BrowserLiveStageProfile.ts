export const BROWSER_LIVE_STAGE_PROFILE_HISTORY_LIMIT = 64;

export type BrowserLiveStageName =
  | 'rollingPcmSnapshotCopy'
  | 'generalFrameLoopWall'
  | 'generalFrameFftFeatures'
  | 'deliberateAsyncYieldWait'
  | 'generalMapPreparation'
  | 'rhythm'
  | 'percussion'
  | 'harmony'
  | 'tonalCenter'
  | 'structure'
  | 'finalMapAssembly'
  | 'melodyResampling'
  | 'melodyAcousticCandidates'
  | 'melodyTemporalPathPostProcessing'
  | 'bassDerivation'
  | 'nonMelodyAnalysisWall'
  | 'rollingMapPreparation'
  | 'totalRollingUpdate'
  | 'totalExcludingDeliberateYields';

export type BrowserLiveStageTimingSink = Readonly<{
  add(stage: BrowserLiveStageName, milliseconds: number): void;
  addCount(count: 'deliberateAsyncYields' | 'emittedMelodyAcousticFrames', amount: number): void;
}>;

export type BrowserLiveStageRecord = Readonly<{
  sequence: number;
  completedAtMilliseconds: number;
  stages: Readonly<Record<BrowserLiveStageName, number>>;
  counts: Readonly<{
    deliberateAsyncYields: number;
    emittedMelodyAcousticFrames: number;
  }>;
}>;

type BrowserLiveStageStatistics = Readonly<{
  latest: number;
  median: number;
  p95: number;
  max: number;
  count: number;
}>;

export type BrowserLiveStageSummary = Readonly<{
  enabled: boolean;
  count: number;
  historyLimit: number;
  stages: Readonly<Record<BrowserLiveStageName, BrowserLiveStageStatistics>>;
}>;

type BrowserLiveStageConsole = Readonly<{
  enable(): void;
  disable(): void;
  clear(): void;
  latest(): BrowserLiveStageRecord | null;
  summary(): BrowserLiveStageSummary;
}>;

const STAGES: readonly BrowserLiveStageName[] = Object.freeze([
  'rollingPcmSnapshotCopy',
  'generalFrameLoopWall',
  'generalFrameFftFeatures',
  'deliberateAsyncYieldWait',
  'generalMapPreparation',
  'rhythm',
  'percussion',
  'harmony',
  'tonalCenter',
  'structure',
  'finalMapAssembly',
  'melodyResampling',
  'melodyAcousticCandidates',
  'melodyTemporalPathPostProcessing',
  'bassDerivation',
  'nonMelodyAnalysisWall',
  'rollingMapPreparation',
  'totalRollingUpdate',
  'totalExcludingDeliberateYields',
]);

const rounded = (value: number) => Math.round(value * 1_000) / 1_000;
const quantile = (values: readonly number[], fraction: number) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] ?? 0;
};

let enabled = false;
let sequence = 0;
let history: BrowserLiveStageRecord[] = [];

function emptyStages(): Record<BrowserLiveStageName, number> {
  return Object.fromEntries(STAGES.map(stage => [stage, 0])) as Record<BrowserLiveStageName, number>;
}

export function beginBrowserLiveStageProfile(): (BrowserLiveStageTimingSink & Readonly<{
  finish(): BrowserLiveStageRecord;
}>) | null {
  if (!enabled) return null;
  const stages = emptyStages();
  const counts = { deliberateAsyncYields: 0, emittedMelodyAcousticFrames: 0 };
  return Object.freeze({
    add(stage: BrowserLiveStageName, milliseconds: number) {
      if (Number.isFinite(milliseconds) && milliseconds >= 0) stages[stage] += milliseconds;
    },
    addCount(count: keyof typeof counts, amount: number) {
      if (Number.isFinite(amount) && amount >= 0) counts[count] += amount;
    },
    finish() {
      stages.totalExcludingDeliberateYields = Math.max(0,
        stages.totalRollingUpdate - stages.deliberateAsyncYieldWait);
      const record: BrowserLiveStageRecord = Object.freeze({
        sequence: sequence += 1,
        completedAtMilliseconds: performance.now(),
        stages: Object.freeze({ ...stages }),
        counts: Object.freeze({ ...counts }),
      });
      history = [...history, record].slice(-BROWSER_LIVE_STAGE_PROFILE_HISTORY_LIMIT);
      return record;
    },
  });
}

function latest() {
  return history.at(-1) ?? null;
}

function summary(): BrowserLiveStageSummary {
  const last = latest();
  const stageStatistics = Object.fromEntries(STAGES.map(stage => {
    const values = history.map(record => record.stages[stage]);
    return [stage, Object.freeze({
      latest: rounded(last?.stages[stage] ?? 0),
      median: rounded(quantile(values, 0.5)),
      p95: rounded(quantile(values, 0.95)),
      max: rounded(values.length ? Math.max(...values) : 0),
      count: values.length,
    })];
  })) as Record<BrowserLiveStageName, BrowserLiveStageStatistics>;
  return Object.freeze({ enabled, count: history.length,
    historyLimit: BROWSER_LIVE_STAGE_PROFILE_HISTORY_LIMIT, stages: Object.freeze(stageStatistics) });
}

export const browserLiveStageProfile: BrowserLiveStageConsole = Object.freeze({
  enable() { history = []; sequence = 0; enabled = true; },
  disable() { enabled = false; },
  clear() { history = []; sequence = 0; },
  latest,
  summary,
});
