# Full async analysis stage profile — development measurement

Measured 2026-09-25 for `analyzePcmListeningAsync`. This report is a local benchmark, not a production latency guarantee. No listening algorithm, threshold, frame size, hop size, score, evidence field, or public FILE behavior was changed. The profiling tool lives at [`scripts/profile-stages.mjs`](../../scripts/profile-stages.mjs) and instruments a **temporary copy** of the current source; it does not add timing hooks to the built Engine or npm artifact.

## Method

- Apple M4 Pro, macOS arm64, Node v24.19.0. One 48 kHz mono deterministic PCM fixture at 2, 6, and 12 seconds: changing bass and melody tones, a harmonic layer, and half-second clicks. Input generation is outside the timed analysis.
- Three warmups per duration, then 25 measured runs per duration, interleaved 2 → 6 → 12 seconds. Median is the middle observation; p95 uses the nearest-rank observation. No forced garbage collection.
- The temporary copy wraps current call boundaries and records `performance.now()` wall-clock intervals. Before measurement, full returned maps from the instrumented and uninstrumented async functions were deeply equal at all three durations. The source-copy script fails if an instrumentation anchor changes.
- The reference from Zoë LIVE was approximately 356 ms median for a 12-second rolling history. This local 12-second fixture measured 315.60 ms median. Hardware, signal content, event-loop load, and outer LIVE work differ, so these numbers should not be equated.

### Stage timing

Each cell is **median / p95 in milliseconds**. The percentage is that stage's 12-second median divided by the 12-second total wall median. Medians are computed independently, so adding rows need not exactly equal the total median. Subrows of Melody do not double-count the Melody total.

| Stage | 2 s median / p95 | 6 s median / p95 | 12 s median / p95 | 12 s wall share |
| --- | ---: | ---: | ---: | ---: |
| PCM downmix | 0.08 / 0.09 | 0.25 / 0.29 | 0.44 / 0.69 | 0.1% |
| General frame construction, FFT, features | 5.74 / 6.05 | 17.12 / 17.63 | 34.24 / 35.62 | 10.8% |
| General map preparation | 0.17 / 0.19 | 0.50 / 0.81 | 1.06 / 1.21 | 0.3% |
| Rhythm | 0.01 / 0.02 | 4.68 / 6.05 | 11.68 / 12.34 | 3.7% |
| Percussion | 0.05 / 0.07 | 0.13 / 0.28 | 0.25 / 0.32 | 0.1% |
| Melody resampling | 0.09 / 0.11 | 0.25 / 0.28 | 0.47 / 0.54 | 0.1% |
| Melody acoustic candidate extraction | 35.81 / 37.38 | 110.38 / 114.89 | 221.70 / 224.89 | 70.2% |
| Melody temporal inference and post-processing | 0.50 / 0.62 | 1.21 / 1.36 | 2.37 / 3.08 | 0.8% |
| Melody evidence packing | 0.09 / 0.22 | 0.19 / 0.24 | 0.35 / 0.72 | 0.1% |
| Harmony | 2.64 / 3.00 | 7.74 / 8.25 | 15.52 / 15.93 | 4.9% |
| Tonal Center | 0.07 / 0.09 | 0.07 / 0.09 | 0.14 / 0.17 | <0.1% |
| Structure, including input preparation | 0.21 / 0.24 | 0.89 / 1.29 | 1.61 / 1.95 | 0.5% |
| Final map assembly | <0.01 / <0.01 | <0.01 / <0.01 | <0.01 / <0.01 | <0.1% |
| Unattributed glue work | 0.01 / 0.02 | 0.01 / 0.02 | 0.02 / 0.02 | <0.1% |
| Deliberate async yield wall time | 3.52 / 4.18 | 11.96 / 13.49 | 25.32 / 26.52 | 8.0% |
| **Computation, excluding yields** | **45.59 / 47.33** | **144.29 / 149.39** | **289.92 / 295.24** | **91.9%** |
| **Total async wall time** | **48.60 / 51.51** | **156.55 / 161.83** | **315.60 / 320.39** | **100%** |

The async path deliberately awaits `setTimeout(0)` once every 24 general frames. That produced **3, 11, and 23 yields** at 2, 6, and 12 seconds respectively. The yield row measures elapsed wall time around those awaits, including scheduler latency; it is not CPU computation. Computation is per-run total wall time minus measured yield wall time. The general-frame row likewise subtracts those awaits from its loop wall time. The residual captures small carrier construction and timing overhead between the wrapped boundaries.

### What each boundary includes

- **General frames** starts after downmix and covers `frameGenerator` iteration, including windowing, FFT, spectral bands, flux, descriptors, and frame array pushes. **General map preparation** covers reference percentiles, normalization, spectrum and amplitude region construction before Rhythm.
- **Rhythm** includes construction of its normalized input array and `analyzeRhythm`; **Percussion** includes its input array and `analyzePercussion`.
- **Melody resampling** is `resampleForAnalysis`. **Acoustic candidates** is the entire `candidateFrames` call: frame windows, short-window RMS, YIN lag search, periodicity, harmonic salience, candidate scoring/ranking, deduplication, and range rejection. These cannot be further separated without timing inside the inner DSP loops. **Temporal inference and post-processing** covers `choosePath`, contour/octave and gap handling, note segmentation, track availability/confidence decisions, and small glue work. At 12 seconds, `choosePath` alone was **0.77 ms median / 1.29 ms p95**; note segmentation was **1.18 / 1.84 ms**. **Evidence packing** covers evidence-frame preparation and `createCompactMelodyEvidenceTimeline`.
- **Harmony** includes its own resampling, chroma and chord work. **Tonal Center** is its analyzer call. **Structure** includes construction of `structuralFrames` (nearest Harmony frame lookup for each general frame) and `analyzeStructure`; this is the closest non-invasive combined boundary, so the analyzer's isolated cost is not claimed. **Final map assembly** covers metadata and the returned map object after Structure.

## Findings

**Melody acoustic candidate extraction dominates.** Its median increases from 35.81 ms at 2 seconds to 221.70 ms at 12 seconds (6.2× for a 6× duration increase), adding about **186 ms**. It accounts for **70.2% of total wall time** and about **76.5% of non-yield computation** at 12 seconds. General frame/feature computation grows from 5.74 to 34.24 ms (about 6.0×), and Harmony from 2.64 to 15.52 ms (about 5.9×). These are the next largest absolute compute costs. Rhythm is tiny at 2 seconds on this signal, then costs 4.68 and 11.68 ms at 6 and 12 seconds; its branch behavior prevents treating the 2-second value as a simple scaling baseline. Structure grows from 0.21 to 1.61 ms as its self-similarity size grows from 2 to 25 bins, but remains small in absolute terms.

**Structure is measured even though LIVE discards it.** At 12 seconds the Structure call and its input preparation take **1.61 ms median / 1.95 ms p95**, roughly **0.5%** of this full analysis. The current rolling mapper sets `structureAnalysis: null` and its Structure capability false after the full analysis returns. Skipping this stage could save at most approximately this measured cost for this fixture; it is not the dominant LIVE delay.

**Melody path inference is cheap relative to acoustic extraction.** The full temporal/post-processing portion is **2.37 ms median / 3.08 ms p95** at 12 seconds, versus **221.70 / 224.89 ms** for candidate extraction. Evidence packing is another **0.35 / 0.72 ms**. The measurements support rerunning temporal inference if a future design can reuse unchanged acoustic candidates exactly.

The **first optimization experiment** should test a snapshot-equivalent Melody acoustic candidate cache across overlapping rolling windows while still rerunning the existing path, contour, note, and track decisions. Measure the same stages and compare complete output and evidence maps against full analysis. This profile justifies that experiment as a high-impact target; it does **not** establish that cached candidates preserve boundary conditions, resampling context, or exact output. No cache or incremental analysis is implemented here. Eliminating Structure first would target only about 0.5% of measured wall time.

The earlier proposed snapshot-equivalent Melody cache is therefore **still justified as an experiment**, conditional on exact equivalence testing. It should not be treated as a proven optimization or deployed based on this timing alone. The 12-second signal is deterministic and musically mixed, but it is one fixture on one machine; recorded material, silence, and stressed event loops can shift stage proportions and p95 tails.

## Reproduce

Run `npm run profile:stages` in a development checkout. The script prints machine-readable JSON with median and p95 timings. It copies `src/` into an OS temporary directory, inserts benchmark-only timers into that copy, and imports the copy. It never writes to Engine source or changes the production build. Source refactors that move the measured boundaries cause an explicit anchor error rather than silently misreporting a stage.
