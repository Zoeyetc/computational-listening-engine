# Incremental Acoustic Evidence v0.3 — production rolling integration

Status: **passes the production-integration gate**. The default Engine rolling session now owns a session-anchored Melody acoustic observer. FILE entry points, listening algorithms, public package exports, cadence, thresholds, and all non-Melody analyzers remain unchanged.

## Production architecture

```text
PCM blocks ─┬─→ bounded rolling PCM ─→ existing General/Rhythm/Percussion/Harmony/Tonal/Structure
            │                                                        │
            └─→ private session-anchored Melody observer             │
                 → immutable complete acoustic frames                │
                 → retained 12 s raw evidence                        │
                 → existing temporal/path/post-processing            │
                 → existing Bass derivation                          │
                                      └──────────────→ rolling map composition
```

`RollingAnalysisEngine` is private to the default rolling path. Each pushed block is downmixed once for the rolling ring and observer. At publication start, the engine synchronously snapshots the current retained acoustic history by rerunning the existing Melody temporal interpreter and derives Bass from that rebuilt evidence. It then awaits the existing full non-Melody analysis through a single internal `AudioAnalysis` composition seam. PCM arriving during that await belongs to the next publication and cannot mutate the captured Melody result.

The FILE functions continue through their original `resample → candidate extraction → temporal interpretation → final map` path. The internal composition seam only allows rolling analysis to supply a precomputed Melody result. It does not duplicate the AudioAnalysis pipeline. Custom `RollingListeningSessionOptions.analyze` injection retains the previous full-snapshot behavior.

The v0.2 experiment now aliases the promoted production observer, so feasibility tests and benchmarks remain an oracle without production depending on `src/experiments`.

## Equality and rolling comparison

Supplying the ordinary FILE Melody result through the new composition seam produces a complete `ListeningMap` strictly equal to ordinary `analyzePcmListeningAsync` output.

The complete rolling benchmark compares every publication through 13.25 seconds at identical sample-count boundaries:

| Comparison | 44.1 kHz / 128 | 48 kHz / 127,211,379 |
| --- | ---: | ---: |
| Publications | 27 | 27 |
| Non-Melody map differences | 0 | 0 |
| Non-Melody event differences | 0 | 0 |
| Non-Melody capability differences | 0 | 0 |
| Melody analysis differences | 27 | 27 |
| Melody note-event differences | 23 | 22 |
| Bass differences versus snapshot-grid Bass | 27 | 27 |
| Bass self-consistency failures | 0 | 0 |

The non-Melody comparison includes amplitude/general features, spectrum, Rhythm, Percussion, Harmony, Tonal Center, Structure handling, analysis metadata, capabilities other than Melody, and collected non-note events. These fields are strictly equal at every publication.

Complete maps are not expected to be deeply equal. Current baseline Melody includes a padded right-edge frame and, after rollover, restarts from a different acoustic grid. The production path intentionally uses the reviewed v0.2 semantics: absolute session frame identity and complete frames only. Melody notes/events and Bass inherit those expected evidence changes. No additional difference category was observed.

## Revision, Bass, and lifecycle

The observer retains raw acoustic frames rather than solved decisions. Every publication calls the existing path solver, backtracking, contour correction, gap merging, note construction, and availability logic over the current retained horizon. A deterministic ambiguity test demonstrates historical revision: an early 220 Hz choice changes to 329.63 Hz when later evidence makes the alternative path globally preferable.

Bass is rederived at every production publication from the newly solved compact Melody evidence. It is not cached independently and is not added to `ListeningMap` or the public rolling update type. Every tested production Bass result is strictly equal to calling the existing Bass adapter on that publication's composed Melody evidence.

Lifecycle tests cover initial partial input, warm-up, ordinary publications, rollover, a 14-second bounded history, stop/dispose, observer reset, and independent new sessions. Chunk-independent identity remains covered at 44.1, 48, and 32 kHz for 128-sample, awkward, and half-second block schedules. Disposed observers reject new input; new sessions reproduce identical maps and events with no retained state from prior sessions.

## Complete rolling performance

Apple M4 Pro, Node v24.19.0, deterministic candidate-heavy 48 kHz mono fixture. Twenty-five half-second updates are measured after the 12-second history is full. Each value is median / p95 milliseconds.

| Steady rolling work | Median / p95 |
| --- | ---: |
| **Production total rolling update** | **114.00 / 123.57** |
| Existing non-Melody async analysis | 88.19 / 94.33 |
| Continuous resampling | 0.03 / 0.76 |
| New acoustic candidates, 31 / 32 frames | 16.65 / 19.78 |
| Full 12 s Melody temporal re-solve | 6.64 / 7.91 |
| Bass derivation | 1.24 / 1.73 |
| Rolling map/publication preparation | 1.33 / 1.61 |
| **Same-fixture full-snapshot baseline total** | **506.96 / 525.44** |
| Baseline map preparation | 1.19 / 1.47 |
| Baseline Bass derivation | 1.54 / 2.00 |
| v0.2 Melody + Bass-only projection | 24.40 / 26.98 |

Independent medians do not sum exactly. The production total includes block resampling/candidate work, the full non-Melody analyzer and its deliberate async yields, temporal re-solving, Bass, and rolling-map preparation. The same-fixture baseline includes full-snapshot Melody rebuilding, rolling-map preparation, and Bass for a fair comparison. Median total falls by about 77%, from 506.96 ms to 114.00 ms. This fixture differs from the earlier 315.60 ms stage-profile fixture, so the same-run comparison is the valid integration measurement. It remains an Engine benchmark, not end-to-end Zoë latency.

At the end of the run, the observer retains 745 acoustic frames and 3,332 candidates. The numeric acoustic payload estimate is 219,536 bytes (214 KiB), excluding JavaScript container overhead. Pending working state is 1,968 resampled samples and zero source samples. The existing 12-second mono rolling PCM ring occupies 2,304,000 bytes at 48 kHz.

## Gate decision

v0.3 passes because:

- FILE composition is strictly equal.
- All non-Melody rolling maps, capabilities, and events are strictly equal.
- Melody differences match the reviewed session-timebase and complete-edge policy.
- Temporal history remains revisable.
- Bass follows the newly solved evidence with existing semantics.
- State is bounded and isolated by session lifecycle.
- The complete rolling benchmark shows material steady-state improvement.
- No public API or package-root export was added.

The next step should be package release preparation after this integration is reviewed and committed. Release work should separately choose a version, inspect the built npm artifact and root export surface, rerun consumer checks, and must not publish without explicit authorization.

Reproduce with `npm run profile:rolling-production`.
