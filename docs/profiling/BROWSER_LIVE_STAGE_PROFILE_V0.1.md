# Browser LIVE Stage Profiling v0.1

Status: internal development measurement infrastructure. Profiling is disabled by default, has no package-root export, installs no browser global, emits no automatic console output, and retains at most 64 completed rolling-analysis records. It does not change listening decisions, scheduling, cadence, or deliberate yields.

## Instrumentation points

| Metric | Exact boundary |
| --- | --- |
| `rollingPcmSnapshotCopy` | `RollingPcmBuffer.snapshot()` only: copying the bounded PCM history into the analysis snapshot. |
| `generalFrameLoopWall` | Input validation, mono copy/downmix, and the complete general-frame generator from start to finish, including its deliberate yield waits. |
| `generalFrameFftFeatures` | `generalFrameLoopWall` minus measured deliberate yield waits. It contains frame windowing, FFT, spectral bands, flux/onsets, centroid, spread, flatness, RMS, and allocations. It is synchronous wall time rather than a hardware CPU counter and can include GC or browser preemption. |
| `deliberateAsyncYieldWait` | Sum of wall-clock intervals beginning immediately before each existing `setTimeout(0)` await and ending when its continuation resumes. This includes timer clamping and all browser/event-loop scheduling delay. The record also reports the number of yields. |
| `generalMapPreparation` | General-frame percentile references, normalization, spectrum regions, and amplitude regions. |
| `rhythm` | Rhythm input projection plus the existing Rhythm analyzer. |
| `percussion` | Percussion input projection plus the existing Percussion analyzer. |
| `harmony` | Existing Harmony analyzer, including its internal PCM feature work. |
| `tonalCenter` | Existing Tonal Center analyzer using the Harmony result. |
| `structure` | Structural-frame construction plus the existing Structure analyzer. Structure is measured even though the rolling mapper suppresses Structure from the published LIVE map. |
| `finalMapAssembly` | Audio-analysis metadata, capability flags, and final full-buffer `ListeningMap` object assembly. |
| `melodyResampling` | Accumulated continuous 12 kHz resampling work since the preceding rolling analysis. This work occurs during PCM pushes. |
| `melodyAcousticCandidates` | Accumulated new-frame RMS/YIN/periodicity/salience/candidate extraction since the preceding rolling analysis. This work occurs during PCM pushes; the record also reports the emitted-frame count. |
| `melodyTemporalPathPostProcessing` | Full interpretation of retained acoustic frames: path inference, backtracking, contour correction, note construction, and availability logic. |
| `bassDerivation` | Existing Bass derivation from the newly interpreted Melody evidence. |
| `nonMelodyAnalysisWall` | Wall time around the complete async non-Melody analysis call. It includes general frames, deliberate yield waits, Rhythm, Percussion, Harmony, Tonal Center, Structure, general map preparation, and final map assembly. |
| `rollingMapPreparation` | Time shifting and capability gating, compact Melody evidence rebuilding, event collection/deduplication, retained-event update, diagnostics sizing, and construction of the rolling update object. It excludes the consumer `onUpdate` callback. |
| `totalRollingUpdate` | Contiguous wall time from immediately before the PCM snapshot through rolling update-object preparation. It excludes the consumer callback. Incremental Melody resampling/candidate work normally occurred earlier during PCM pushes and is reported separately rather than added to this wall interval. |
| `totalExcludingDeliberateYields` | `totalRollingUpdate - deliberateAsyncYieldWait`. This isolates the known intentional wait but is not a hardware CPU measurement; synchronous browser preemption and GC can remain. |

All timers use `performance.now()`. Instrumentation is activated only through the internal collector. Each completed default production rolling analysis contributes exactly one record; stopped or superseded work that does not publish an update contributes none.

## Browser access status

The stage collector and timing instrumentation are implemented and verified to preserve Engine output, but direct Zoë/browser access is not currently wired.

An attempted Zoë development bridge was rejected after measurement-equivalence testing showed that it supplied the `analyze` override and therefore selected the legacy snapshot-reanalysis path instead of the built-in production rolling analyzer. Measurements from that alternate path cannot be compared with normal Zoë LIVE.

Browser measurements remain pending a path-preserving passive diagnostics seam around the built-in rolling path. That seam must observe the normal analyzer without supplying or replacing `RollingListeningSessionOptions.analyze`. Until it exists, this module is available only to internal Engine tests and development tooling.
