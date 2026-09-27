# Path-Preserving Passive Rolling Diagnostics Seam v0.1

The rolling diagnostics seam observes `RollingListeningSession` without supplying or replacing its analyzer. Consumers select it with the optional `onDiagnostic` callback and must omit `analyze` to measure the Engine 0.3 built-in production rolling path.

```ts
const session = createRollingListeningSession({
  sampleRate,
  readTime,
  onUpdate,
  onDiagnostic(record) {
    rollingLatencyProbe.record(record);
  },
});
```

`onDiagnostic` receives one immutable record after each successfully delivered rolling update and after the session has finalized its running/coalescing state for that publication. Its return value is ignored, it is never awaited, and synchronous exceptions are swallowed so diagnostics cannot fail listening. The callback does not select an analyzer; only the pre-existing `analyze` option retains that behavior.

## Identity and timing

`sessionId` is unique within the loaded Engine module. `runId` is monotonic within a session and identifies one eligible analysis. `requestId` identifies the request that produced that run. `publicationId` currently equals `runId` because a successful run publishes at most one update.

All `wallClockMilliseconds` values come from the same monotonic `performance.now()` clock:

- `requested`: cadence or manual analysis request creation.
- `eligible`: the request acquired the session's single running-analysis slot. For a coalesced rerun this follows completion of the preceding run.
- `analysisStarted`: immediately before invoking the selected analyzer.
- `analysisCompleted`: immediately after its promise resolves.
- `updatePrepared`: the rolling map, events, evidence sizing, and update object are complete.
- `updatePublished`: the consumer's `onUpdate` callback returned.

These boundaries support scheduling wait (`eligible - requested`), analyzer runtime (`analysisCompleted - analysisStarted`), rolling preparation (`updatePrepared - analysisCompleted`), update delivery (`updatePublished - updatePrepared`), and request-to-publication wall time.

`audioTimeSeconds` values are not wall-clock timestamps:

- `sessionAtAnalysisStart`: the existing `readTime()` value captured for the snapshot.
- `sessionAtPublication`: the existing `readTime()` value captured before rolling-map publication.
- `historyDuration`: duration of the bounded PCM snapshot, capped at 12 seconds.
- `newestIncludedInput`: session-relative source input position included in that snapshot, derived from accepted source sample count.

The Engine does not expose a newest acoustic-evidence timestamp through this seam. A consumer may compare session and input positions only when it knows those clocks share an origin; the seam does not manufacture an evidence-age metric.

## Coalescing, profiling, and compatibility

While an analysis is busy, existing behavior retains one latest rerun. Its record uses `eligibility: 'coalesced'` and reports how many requests were coalesced. Cadence, rollover, dropped-request accounting, and stop/dispose behavior are unchanged.

When internal Browser LIVE Stage Profiling is enabled, its record receives the same `rollingSessionId` and `rollingRunId`. Outer diagnostics report lifecycle wall time; the stage profiler reports internal decomposition. No browser global or profiler package-root export is installed.

Supplying `analyze` continues to select the legacy custom analyzer path. Diagnostics can observe it and mark `analyzer: 'custom-override'`, but those measurements are not equivalent to production incremental rolling analysis. Zoë must remove its `analyze` override and use `onDiagnostic` when migrating its LIVE latency probe.
