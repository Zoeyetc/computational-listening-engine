# Drum Event Annotation + Counterfactual Gate Study v0.1

Status: **complete for the supplied annotation export: 36 kick taps and zero snare, hi-hat, or tom taps**.

This is a development-only evaluation of the existing Percussion implementation. It does not alter production behavior, thresholds, class scores, evidence semantics, package exports, or Zoë.

## 1. Selected annotation windows

The study uses four centered 10-second windows from the human-confirmed isolated sections in `Kit Calibration.wav`. They remain at least five seconds from a section boundary and contain sustained Engine acoustic/candidate activity. The latest human export records 36 kick taps and no taps in the other three windows.

| Class | Absolute window | Distance from section edges | Acoustic peaks | Production candidates | Published events |
| --- | --- | ---: | ---: | ---: | ---: |
| Kick | `00:07.500–00:17.500` | 7.5 s / 7.5 s | 143 | 52 | 32 |
| Snare | `00:35.500–00:45.500` | 10.5 s / 10.5 s | 131 | 43 | 24 |
| Hi-hat | `01:03.000–01:13.000` | 7 s / 7 s | 128 | 73 | 16 |
| Tom | `01:25.000–01:35.000` | 5 s / 5 s | 148 | 44 | 17 |

These Engine counts only confirm that the windows are active. They were not used as human onset labels.

## 2. Annotation method

Open `scripts/drum-event-annotator.html` in a browser and select the external `Kit Calibration.wav` file. The helper never uploads or copies the audio into the repository.

- Space: play/pause the selected window.
- `T`: record the current absolute file timestamp with the section class.
- `U`: undo the last annotation in that window.
- Left/right arrow: move by 50 ms for paused review.
- Playback rates: 0.5×, 0.75×, and 1×.
- Export JSON produces `drum-event-annotations-v0.1.json` with the source SHA-256, fixed windows, and onset timestamps.

Only audible drum-hit onset and intended section class are collected. Confidence, strength, velocity, offsets, and spectral attributes are not requested. Times are human annotations and are not represented as sample-accurate.

## 3. Annotation counts

The exported annotation file passed source filename, SHA-256, window identity, boundary, label, and timestamp-order validation.

| Class | Annotated audible hits |
| --- | ---: |
| Kick | 36 |
| Snare | 0 |
| Hi-hat | 0 |
| Tom | 0 |
| **Total** | **36** |

The empty arrays for snare, hi-hat, and tom are preserved as supplied. Engine peaks, candidates, or public events are not substituted for human hits.

The kick annotations contain 16 adjacent intervals at or below the 70 ms matching tolerance, including five intervals at or below 20 ms and a minimum interval of 2 ms. The study does not automatically merge them. The one-to-one policy therefore requires separate Engine evidence for every submitted tap. This makes the kick match proportions sensitive to any accidental duplicate taps.

## 4. Matching policy

The fixed tolerance is **±70 ms**. At 48 kHz, the 2048-sample analysis frame is 42.67 ms and the 1024-sample hop is 21.33 ms. Seventy milliseconds covers one analysis frame plus roughly one additional hop of human alignment uncertainty while remaining narrow relative to ordinary isolated-hit spacing.

Matching is deterministic, order-preserving, and one-to-one. It first maximizes match count and then minimizes total absolute timing offset. One Engine event cannot satisfy multiple human hits, and one human hit cannot consume multiple Engine events. Unmatched human hits and unmatched Engine candidates are retained separately.

Each nested Engine stage is matched independently to the same human onsets:

`acoustic peak → fixed onset floor → adaptive onset → RMS/production candidate`

Production-candidate matches are then followed through the actual candidate identity for:

`sustained gate → scoring → selected/abstained/rejected → published`.

## 5. Human-hit funnel

| Class | Human hits | Peak matches | Fixed-floor | Adaptive | Production candidate | Sustained survivor | Scored | Selected | Abstained | Rejected | Published |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Kick | 36 | 30 | 30 | 18 | 18 | 13 | 13 | 10 | 1 | 7 | 11 |
| Snare | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Hi-hat | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Tom | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Kick proportions are:

- peak match: 30/36, **83.3%**;
- fixed-floor match: 30/36, **83.3%**;
- adaptive-onset and production-candidate match: 18/36, **50.0%**;
- sustained-gate survival among matched candidates: 13/18, **72.2%**;
- scoring reach: 13/36, **36.1%**;
- named selection: 10/36, **27.8%**;
- abstention: 1/36, **2.8%**;
- publication: 11/36, **30.6%**.

Six submitted kick taps had no acoustic-peak match. Twelve more matched a peak above the fixed floor but did not match an adaptive-onset survivor. RMS removed no additional matched hit. At the production-candidate stage, 18 human taps and 34 Engine candidates were unmatched separately. Matched candidate offsets ranged from −35.7 to +67.7 ms, with a median of −15.0 ms and mean of +1.8 ms.

Unmatched submitted kick taps, seconds:

```text
7.713, 8.238, 8.440, 9.158, 9.230, 10.046, 10.632, 10.796, 10.848,
11.290, 11.313, 12.248, 14.589, 14.838, 15.325, 15.338, 16.323, 17.373
```

Unmatched production candidates in the kick window, seconds:

```text
7.787, 7.915, 8.021, 8.640, 8.704, 8.939, 9.451, 9.707, 10.155, 10.219,
10.453, 11.456, 11.712, 11.733, 11.968, 12.053, 12.096, 12.480, 12.736,
12.992, 13.184, 13.504, 14.272, 14.507, 14.763, 15.019, 15.253, 15.509,
15.723, 16.021, 16.149, 16.811, 17.045, 17.237
```

Snare, hi-hat, and tom proportions retain a zero denominator and remain **not available**, rather than zero percent.

## 6. Sustained-gate false rejection

The existing gate uses exactly these variables and conditions:

```text
highDominance = highRatio + airRatio

(duration > 0.45 && highDominance < 0.38)
||
(flatness < 0.01 && duration > 0.3)
```

For every matched human hit rejected here, the study retains duration, high dominance, flatness, both condition outcomes, onset strength, RMS, and low/high persistence.

Five of 18 matched kick candidates were rejected by the sustained gate. All five triggered the first condition: duration was exactly 0.512 s and high dominance was below 0.38. None triggered the low-flatness stable-pitched-body condition. Two additional matched candidates were rejected by refractory deduplication. No matched kick was rejected by RMS, incomplete-edge, insufficient-evidence, or another reason.

## 7. Gate-input distributions by class

| Kick sustained rejects | Min | Median | Mean | Max |
| --- | ---: | ---: | ---: | ---: |
| Duration, seconds | 0.512 | 0.512 | 0.512 | 0.512 |
| High dominance | 0.000013 | 0.004218 | 0.004156 | 0.012165 |
| Flatness | 0.017648 | 0.054933 | 0.047469 | 0.072461 |

All five rejects were long, low-high-dominance candidates. This supports the specific explanation that kick low-frequency decay/persistence is being interpreted as a sustained non-percussive body in these examples. Snare, hi-hat, and tom distributions remain unavailable.

## 8. Counterfactual classifier

For a sustained-gate reject, evaluation code passes the already-computed descriptor into the unchanged `classifyPercussionCore` function. It records the five existing named scores, top and second hypotheses, margin, confidence, ambiguity reasons/support, and hypothetical named, ambiguous, or insufficient decision.

This bypass exists only in the evaluation script. It does not apply refractory logic, publish an event, or change production output.

For the five human-matched kick candidates rejected by the sustained gate:

- 3/5, **60%**, would become the intended named `kick` class;
- 2/5, **40%**, would become the wrong named `tom` class;
- 0 would remain ambiguous;
- 0 would remain insufficient.

Counterfactual margins ranged from 0.159 to 0.420, with median 0.222 and mean 0.282. The three kick wins had top scores 0.837, 0.838, and 0.623. The two wrong tom wins had top tom scores 0.646 and 0.670 versus kick scores 0.487 and 0.448. The gate is therefore hiding some useful kick evidence and some existing kick/tom confusion.

## 9. Pitched negative controls

The current sustained gate provides substantial protection. Results below classify only the existing sustained rejects counterfactually.

| Control | Production candidates | Sustained rejects | Hypothetical named | Ambiguous | Hypothetical named distribution | Median confidence | Median margin |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| Piano, `80.0–87.5` | 49 | 49 | 42 (85.7%) | 7 | 35 tom, 7 kick | 0.580 | 0.190 |
| Bass, `87.5–95.0` | 53 | 49 | 38 (77.6%) | 11 | 27 tom, 11 kick | 0.589 | 0.221 |
| `Funk Bass Solo.wav` | 239 | 207 | 179 (86.5%) | 28 | 160 tom, 19 kick | 0.668 | 0.270 |
| `Bass Pocket.wav` | 585 | 581 | 391 (67.3%) | 190 | 231 tom, 158 kick, 2 open-hat | 0.499 | 0.121 |

The calibration piano and bass controls have human-confirmed weak section labels. The two standalone bass files have filename-level labels only; their monophony and absence of drums are not event-annotated. They are supporting observations rather than equivalent controls.

Removing the sustained gate without another discriminator would expose many pitched candidates as confident kick or tom events. The zero-hit annotation supplies no corresponding true-hit counterfactual against which to balance that protection.

## 10. Class discrimination

Among the 18 human-matched kick candidates, production selected 6 as kick and 4 as tom, accepted 1 as ambiguous other-percussion, rejected 5 as sustained, and rejected 2 through refractory deduplication. Only 6/10 named selections agreed with the intended kick section label. Together with the counterfactual 3 kick versus 2 tom split, this confirms that gate retention and kick/tom discrimination are separate limitations.

Snare, hi-hat, and tom remain event-level unevaluable. Gate A's weaker section-level findings remain visible: kick/tom competition was unstable, and snare/hat section correspondence was poor.

## 11. Pattern conclusion

The result is mixed by class:

- **Kick: Pattern C is primary.** Only 18/36 submitted taps matched a production candidate. Six lacked a peak match and twelve more were lost between fixed-floor and adaptive-onset matching. The close-tap clusters make the exact magnitude uncertain, but onset/detection requires investigation before treating every miss as a sustained-gate failure.
- **Kick gate subset: mixed Pattern A/B.** The sustained gate rejected 5/18 matched candidates. Counterfactually, 3 would be useful kick classifications and 2 would be wrong tom classifications. The gate hides useful evidence, while the underlying classifier also has a kick/tom problem.
- **Snare, hi-hat, tom: non-informative zero-event result.** Their Pattern A/B/C/D status cannot be inferred.

The study does not support Pattern D for kick, and it does not justify any production threshold change.

## 12. Implications for Drum v1

Drum v1 should investigate kick onset matching and sustained-gate discrimination together. A blanket bypass is ruled out by the pitched controls, while the kick counterfactual shows that the gate does hide some valid class evidence. The next annotation pass should first review the 16 close-tap clusters, then obtain non-empty snare, hi-hat, and tom annotations. No threshold should be changed from this small and partly empty study.

## 13. Development-only files

- `scripts/drum-event-annotator.html`
- `scripts/drum-counterfactual-gate-study.mjs`
- `tests/DrumCounterfactualGateStudy.test.ts`
- `tests/fixtures/drum-event-annotations-v0.1.json`
- `docs/profiling/DRUM_EVENT_ANNOTATION_COUNTERFACTUAL_V0.1.md`

The same research milestone includes the Gate A basis:

- `scripts/probe-drum-real-audio-gate-a.mjs`
- `docs/profiling/DRUM_REAL_AUDIO_GATE_A_V0.1.md`

## 14. Validation status

- Matching/classification study tests: 3/3 passed.
- Completed annotation fixture validated and consumed successfully.
- Human-hit study consumed 36 kick taps; snare, hi-hat, and tom preserve null zero-denominator semantics.
- Counterfactual negative-control study completed on four pitched controls.
- Repeated Gate A outputs remain deterministic.
- Complete Engine suite: 209/209 passed with the completed annotation fixture and study implementation.
