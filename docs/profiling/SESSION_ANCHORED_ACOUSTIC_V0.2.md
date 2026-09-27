# Session-Anchored Acoustic Timeline v0.2 — feasibility report

Status: **passes the experimental feasibility gate**. This is an internal model and benchmark, not a production LIVE implementation. `RollingListeningSession`, FILE analysis, package-root exports, listening thresholds, frame sizes, hop sizes, scoring, and Bass behavior are unchanged.

## Semantic audit

The repository does not establish snapshot-relative Melody alignment as intentional listening semantics. The README promises that streaming analyzes bounded rolling PCM and retains causal evidence. `RollingListeningSession` snapshots its ring, invokes the ordinary full-buffer analyzer, then shifts the returned times. No contract, architecture document, public type, or pre-v0.2 test specifies that the 12 kHz resampling origin and 192-sample frame grid must restart when the rolling window's left edge moves. The alignment is therefore best classified as **unspecified behavior produced by the current implementation**, rather than a documented semantic promise. This result does not by itself authorize changing production LIVE output.

## Experimental timebase

The model owns monotonically increasing absolute source-sample and 12 kHz output-sample positions for one session. For output sample `i`, it preserves the current box-resampler cell boundaries `floor(i * sourceRate / 12000)` through `max(from + 1, floor((i + 1) * sourceRate / 12000))`. It emits an output sample only after that complete source cell exists. The resampling phase therefore survives arbitrary input chunk boundaries.

Melody frame identity is `melody-12k-{absoluteStartSample}`. Starts are `0, 192, 384, ...`; a frame is analyzed once only after all 2048 samples exist. Incomplete right-edge frames remain pending and are never zero-padded. Emitted raw frames are frozen and retain existing RMS gating, YIN, periodicity, harmonic salience, scores, ranking, generation counters, and rejected-candidate evidence. Frames whose center precedes `sessionDuration - 12 seconds` leave the interpretation history, without moving the acoustic grid.

```text
PCM blocks → continuous box-resampler → completed 2048/192 frames → immutable acoustic evidence
                                                                     ↓ bounded 12 s history
                                  Bass ← rebuilt Melody evidence ← existing temporal interpreter
```

The refactor in `MelodyAnalysis.ts` extracts one frame-local acoustic function and one temporal finalization function. The ordinary analyzer still calls both in its original order. Refeeding all of the ordinary analyzer's precomputed frames into the temporal seam reproduces its complete Melody analysis and compact evidence with strict deep equality. No candidate or path algorithm was copied.

## Determinism and chunk independence

Tests feed the same deterministic silence, melody changes, bass-heavy material, and transients using 128-sample blocks, repeating 127/211/379 blocks, and half-second blocks. At 44.1, 48, and 32 kHz, every emitted frame identity, source span, RMS, candidate, score, rejection, and generation field is strictly equal across schedules. An emitted frame remains strictly equal and frozen after later PCM arrives. Bass results derived from the newly interpreted evidence are also equal across chunk schedules.

## Compatibility with current LIVE observation

The comparison uses every rolling publication through 13.25 seconds. “Aligned” means the baseline and session frame consume the same absolute source span. “Nearest” compares a snapshot-grid frame with the closest session-grid frame only after source-span alignment has been lost.

| Schedule | Publications | Complete aligned | Complete timebase-unmatched | Padded edge | Raw differences when aligned | Decision differences when aligned |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 44.1 kHz / 128 | 27 | 8,432 | 2,220 | 27 | 0 | 0 |
| 48 kHz / 128 | 27 | 8,418 | 2,220 | 27 | 0 | 0 |
| 48 kHz / 127,211,379 | 27 | 8,527 | 2,220 | 27 | 0 | 0 |
| 44.1 kHz / 0.5 s | 26 | 9,132 | 1,480 | 26 | 0 | 0 |

Before rollover, both grids share the session origin; the only systematic difference is one current-analyzer right-edge padded frame per publication. After the 12-second left edge starts moving in these measured publications, complete snapshot frames lose source-span identity with the session grid. This is the expected timebase change found by v0.1, not a candidate implementation bug.

Nearest-frame raw values differ in 2,175/2,220, 2,174/2,220, 2,183/2,220, and 1,456/1,480 comparisons respectively. Exact decision records differ almost as often because frame samples and continuous confidence values change. The closest grids are offset by about 49–72 12 kHz samples on average (maximum 73–106.5 samples). Musical outcomes are much more stable on this fixture: only 3, 3, 4, and 0 nearest-frame voicing decisions differ; **no** jointly voiced comparison differs by more than 50 cents; track availability differs in 0 publications; and accepted-note MIDI sequences differ in 0 publications. Complete analyses are never deeply equal because the session path intentionally omits the padded edge and uses absolute session times.

These results classify observed differences as follows:

- **Timebase/frame alignment:** all 8,140 unmatched complete-frame comparisons across the four schedules.
- **Edge padding:** one incomplete snapshot frame per publication, 107 total; the session model waits for completion.
- **Actual raw/decision differences:** zero on identical source spans. Nearest-grid numeric differences are expected consequences of analyzing shifted windows; four or fewer voicing changes per schedule were observed, with no >50-cent, availability, or note-MIDI changes.
- **Bugs found:** none in the tested model.

This is a deterministic synthetic fixture, so broader musical evaluation remains necessary before production adoption. The observed differences are explained by the deliberately changed acoustic timebase, but this experiment cannot establish corpus-wide perceptual equivalence.

## Performance feasibility

Apple M4 Pro, Node v24.19.0. Inputs are deterministic 48 kHz mono mixtures. One-shot results use 15 repetitions. Steady state uses 25 half-second updates after the 12-second history is full. Each cell is median / p95 milliseconds.

| Experimental work | 2 s | 6 s | 12 s |
| --- | ---: | ---: | ---: |
| Session resampling | 0.26 / 3.00 | 0.66 / 3.12 | 1.44 / 1.97 |
| Acoustic candidates | 51.91 / 57.60 | 198.29 / 203.82 | 400.93 / 411.50 |
| Temporal re-solve | 0.96 / 2.43 | 3.24 / 4.53 | 5.86 / 7.48 |
| Bass derivation | 0.15 / 0.84 | 0.57 / 1.10 | 1.04 / 1.46 |
| Combined projection | 54.56 / 62.02 | 203.67 / 211.86 | 409.27 / 419.63 |

The one-shot table measures building a new session from scratch and mainly confirms duration scaling on this fixture. Its signal is more candidate-heavy than the earlier stage-profiler fixture, so its 12-second candidate number should not replace the earlier 221.70 ms baseline.

| Full-history steady update | Median / p95 ms |
| --- | ---: |
| New completed frames | 31 / 32 frames |
| Continuous resampling | 0.05 / 0.08 |
| New acoustic candidates | 17.54 / 19.52 |
| Full 12 s temporal re-solve | 5.53 / 7.22 |
| Bass derivation | 0.87 / 0.97 |
| **Experimental Melody + Bass projection** | **24.40 / 26.98** |
| Same-fixture full-snapshot acoustic rebuild | 412.08 / 423.07 |
| Same-fixture full-snapshot Melody analysis | 418.98 / 428.09 |

The experiment retains 745 frames and 3,332 candidates at the end of the steady run. Numeric payload is approximately 219,536 bytes (214 KiB), excluding JavaScript object, array, and string overhead. Pending working state is bounded: zero source samples and 1,968 resampled samples in that observation. The 24.40 ms figure is a projection for resampling, new Melody acoustic frames, full Melody temporal interpretation, and Bass. It excludes General, Harmony, Rhythm, Percussion, Tonal Center, Structure, async yields, rolling-map assembly, and product work, so it is not a claim about complete LIVE latency.

## Feasibility decision and production boundary

v0.2 passes because continuous resampling is chunk-independent without replacing the detector, candidate extraction separates cleanly from temporal interpretation, identical source spans are acoustically and temporally exact, observed musical changes are attributable to the explicit timebase/edge policy, and the experiment does not duplicate major Melody logic or expand into other analyzers.

A production proposal should keep all current public APIs and FILE entry points unchanged:

1. Add a private streaming-owned `MelodyAcousticObserver` that receives downmixed PCM blocks, owns absolute source/resampling/frame positions, and emits immutable complete raw frames.
2. Retain raw frames by the 12-second interpretation horizon and call the extracted existing temporal interpreter at each publication. Do not retain solved decisions.
3. Derive Bass from each newly solved compact Melody evidence timeline through the existing Bass adapter.
4. Add an internal AudioAnalysis composition seam so rolling analysis can provide its precomputed Melody result while General/Harmony/Rhythm/Percussion/Tonal Center/Structure continue through their current paths. Do not change `analyzePcmListening` or `analyzePcmListeningAsync` behavior.
5. Treat absolute session times and “complete frames only” as an explicit new LIVE semantic requiring review, corpus evaluation, and rolling-map/event integration tests before activation.

Reproduce with `npm run profile:session-acoustic`. The script is development-only and imports the unexported experiment directly from source.
