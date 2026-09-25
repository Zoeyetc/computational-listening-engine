# Incremental Acoustic Evidence v0.1 — experimental gate

**Result: stopped at the frame-identity gate.** No cache, incremental analysis path, or production instrumentation was added. Engine output and all listening behavior remain unchanged.

The checked-in oracle harness reproduces the rolling buffer's sample-count publication cadence, records every PCM snapshot, and provides a strict deep-equality comparator for every successive publication. Its mechanics are tested across initial fill, overlap, and 12-second rollover at 48, 44.1, and 32 kHz, with silence, bass-heavy tones, melody changes, transients, and awkward block sizes. Because the identity gate failed before a candidate analyzer existed, this is **not** a claim that baseline and incremental ListeningMaps are equivalent. The comparator has no incremental output to compare yet.

## Identity finding

Melody independently box-resamples each snapshot to 12 kHz and starts 2048-sample frames every 192 resampled samples from snapshot position zero. A safe reusable acoustic frame would require equivalent input samples in the same order, identical resampling cell boundaries and floating-point operations, full-frame versus right-edge padding state, and the same acoustic configuration. Its cached value must exclude snapshot-relative `time`; that time must be rebuilt for each publication. The eventual cache would retain frame-local RMS, YIN/periodicity, salience, candidate scores and ordering, generation counts, and rejected candidates, while rerunning path inference and all later decisions.

The first necessary condition for **overlap-based**, position-preserving reuse is that a complete frame starts at the same absolute source sample as a previously analyzed complete frame. The gate test counts this optimistic condition after 24 seconds of a 36-second deterministic publication schedule, retaining up to 12 seconds of previous frame starts. It deliberately ignores resampling phase, the remaining source samples, and padding, so these counts can overstate safe reuse. Content-identical frames at unrelated positions are outside this overlap-reuse experiment.

| Input schedule | Source-aligned complete-frame hits / frames | Optimistic hit rate |
| --- | ---: | ---: |
| 44.1 kHz, 128-sample blocks | 0 / 17,760 | 0% |
| 48 kHz, repeating 127/211/379-sample blocks | 0 / 17,020 | 0% |
| 44.1 kHz, exact 0.5-second blocks | 15,375 / 18,500 | 83.1% |

The exact-half-second control shows that overlapping content alone is insufficient: publication boundaries determine whether frame grids recur. Common 44.1 kHz / 128-sample publication boundaries provide no source-aligned frames after rollover in this measurement. A cache keyed only by the previous snapshot fares worse; an absolute-time key without resampling and padding validation is unsafe. Achieving robust reuse across these schedules would require a broader resampling/frame-alignment strategy or a separate content-addressed experiment, neither justified within this bounded v0.1 scope.

## Timing and equivalence status

The existing development-only stage profiler was rerun (3 warmups, 25 repetitions per duration). Its temporary instrumented source remained deeply equal to the uninstrumented full analyzer at 2, 6, and 12 seconds. The prior reviewed [stage timing table](STAGE_PROFILE_V0.1.md) gives baseline median/p95: total 48.60/51.51, 156.55/161.83, and 315.60/320.39 ms; Melody candidates 35.81/37.38, 110.38/114.89, and 221.70/224.89 ms for 2/6/12 seconds respectively. The rerun again placed 12-second Melody candidates near 224 ms median. Those timings are full-analysis fixtures, **not** a rolling cache benchmark.

| Required candidate result | Status |
| --- | --- |
| Exact baseline versus incremental maps, historical revisions, and Bass outputs | Not measured: no candidate path built after gate failure |
| Safe cache hits/misses/invalidations | Not measured: the table above is only a necessary alignment opportunity |
| Incremental 2/6/12-second median and p95 | Not measured |
| Steady-state rolling 12-second candidate and total runtime | Not measured |
| Listening-semantic differences | None introduced; production analysis was not changed |

The next decision is architectural: either accept a scope-expanded, explicitly measured content-addressed frame experiment, or change how rolling snapshots establish the 12 kHz frame grid under a separate design review. Neither should be folded into v0.1. The current stage profile still identifies Melody acoustic extraction as the expensive stage, but does not prove that its work is reusable under arbitrary LIVE publication boundaries.
