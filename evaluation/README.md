# Evaluation Suite v0.1

Independent metrics for Computational Listening Engine. Nothing under `evaluation/` imports the Engine or changes its algorithms, evidence, public exports, or determinism. `scripts/evaluation-engine.mjs` is the boundary adapter: PCM → existing `analyzePcmListening` → evaluation contracts. This evaluates raw analysis output, including candidates below whole-track availability thresholds; it does not evaluate product presentation behavior.

## Run

```sh
npm run typecheck
npm test
npm run build
npm run test:evaluation
npm run benchmark
```

The last command writes [`evaluation-report.md`](../evaluation-report.md). It runs the actual Engine on four deterministic synthetic cases: a monophonic phrase, 120 BPM clicks, a triad progression with a nominal key change, and silence. Ground truth comes from synthesis parameters, independently of predictions. No random inputs, timestamps, performance timings, or network access affect the report.

Synthetic results are smoke benchmarks, not an estimate of accuracy on real music or speech. Large representative, separately annotated datasets are needed before drawing conclusions about calibration or generalization. Adjacent frames are correlated; observation counts are not independent sample counts. This version measures note continuity/fragmentation, not perturbation robustness or streaming consistency.

## Structure

```text
evaluation/
  index.ts                  Evaluation-only public API
  types.ts                  Independent contracts and default tolerances
  common.ts                 Validation, statistics, one-to-one matching
  pitch.ts                  Pitch / voicing metrics
  melody.ts                 Note / timing / stability metrics
  rhythm.ts                 Tempo / beat metrics
  harmony.ts                Chord / key metrics
  confidence.ts             Reliability bins and calibration losses
  evaluate.ts               Combined scoring and domain calibration
  benchmark.ts              Dataset runner with injected Engine
  report.ts                 Deterministic Markdown renderer
  datasets/synthetic.ts     Authored PCM fixtures and truth
  tsconfig*.json            Independent checking / compilation
scripts/
  evaluation-engine.mjs     Adapter for existing Engine analysis
  evaluation-benchmark.mjs  Single benchmark CLI
tests/
  EvaluationMetrics.test.ts
  EvaluationBenchmark.test.ts
```

Build output is `dist/evaluation/`, with declarations. The existing package export map and all Engine exports remain unchanged. Use the local evaluation entry point rather than adding evaluation symbols to the Engine entry point.

## Public API

```ts
import {
  evaluate, evaluatePitch, evaluateMelody, evaluateRhythm,
  evaluateHarmony, evaluateConfidence,
  runBenchmark, renderMarkdownReport, DEFAULT_OPTIONS,
} from './evaluation/index.ts';
// Compiled local entry point: ./dist/evaluation/index.js
```

- `evaluate(truth, prediction, options?) → EvaluationResult`
- `evaluatePitch(referenceFrames, predictedFrames, options?) → PitchMetrics`
- `evaluateMelody(referenceNotes, predictedNotes, options?) → MelodyMetrics`
- `evaluateRhythm(referenceRhythm, predictedRhythm, options?) → RhythmMetrics`
- `evaluateHarmony(referenceHarmony, predictedHarmony, options?) → HarmonyMetrics`
- `evaluateConfidence(observations, binCount = 10) → ConfidenceMetrics`
- `await runBenchmark(datasets, engine, options?) → BenchmarkResult`
- `renderMarkdownReport(result) → string`

Exported contracts include `PitchFrame`, `Note`, `Rhythm`, `LabelSegment`, `Harmony`, `EvaluationData`, `ConfidenceObservation`, `EvaluationOptions`, `BenchmarkCase<Input>`, and `BenchmarkDataset<Input>`. Inputs are readonly; evaluation does not mutate them. The runner invokes the supplied engine once per case, sequentially, and identifies dataset/case failures. It never writes files itself.

Times are seconds and pitch is fractional MIDI (a semitone is 100 cents). A null pitch means unvoiced. Null harmony labels explicitly mean no chord/key; missing predictions remain distinguishable. Labels use exact string equality; the PCM adapter normalizes chords/keys to `rootPitchClass:major|minor`, such as `0:major`. The evaluator does not guess enharmonic aliases.

Omit unannotated domains from truth. An omitted prediction for an annotated domain is a miss. Empty annotations explicitly assert no events within the supplied case. Undefined denominators and conditional errors without matches return `null` (rendered N/A). In particular, precision without predictions is N/A, recall with known truth but no predictions is zero, F1 is zero if only one side has events, and both-empty F1 is N/A. No zero-support score is promoted to perfect accuracy.

Invalid numeric values, confidence outside [0,1], nonpositive durations, overlapping label intervals, unsorted/duplicate pitch frame times, and invalid tolerances are rejected. Event arrays may be unsorted; local copies are sorted. Duplicate detections remain separate predictions and reduce precision.

## Metric definitions

### Pitch

Reference frames define the scoring grid. Each uses the nearest prediction within **25 ms**, choosing the earlier frame on a tie. A predicted state may serve more than one reference frame when annotation and Engine rates differ. Missing frames act as unvoiced; coverage explicitly counts aligned frames, including unvoiced frames. Predictions outside the annotated grid are not scored. Annotate silence as well as voiced audio to measure false positives.

- **Pitch Accuracy:** reference-voiced frames with a voiced estimate within **50 cents**, divided by all reference-voiced frames. Octave errors count as wrong.
- **Cent Error:** mean absolute MIDI difference × 100 on jointly voiced frames only.
- **Octave Error Rate:** jointly voiced frames within 50 cents of a nonzero integer octave error, divided by jointly voiced frames. Includes upward and downward multi-octave errors.
- **Voiced Precision / Recall / F1:** binary detection metrics, irrespective of pitch correctness.
- **Confusion matrix:** truth rows, prediction columns; missing predictions occupy the unvoiced column.

Read conditional cent/octave errors alongside pitch accuracy and coverage: abstention must not be mistaken for accurate tracking.

### Melody

Maximum-cardinality one-to-one matching requires pitch within 50 cents, onset within **50 ms**, and offset within **max(50 ms, 20% of reference duration)**. Matching is deterministic using sorted event order; equally large matchings are not optimized for minimum timing error. These are explicit v0.1 conventions, not a claim of equivalence to an external benchmark protocol.

- **Note Precision / Recall / F1:** matched notes against predicted/reference counts.
- **Onset / Offset Error:** mean absolute seconds on a separate onset-and-pitch matching, *without* the offset constraint. Bad offsets therefore remain visible. Timing match support is reported.
- **Pitch-path Continuity:** fraction of adjacent reference-note pairs for which both notes have full matches, predictions are consecutive in sorted order, and the predicted melodic interval differs by at most 50 cents. Fewer than two reference notes yields N/A. This is a monophonic note-path proxy; missing notes and inserted notes break continuity.
- **Track Fragmentation:** sum of excess same-pitch predictions overlapping each reference note, divided by reference-note count. A note split into two predictions contributes one excess fragment. Duplicate notes also contribute. Zero fragmentation alone does not imply good listening; read it with note recall. This does not infer voice assignments in polyphonic audio.

### Rhythm

- **Tempo Error:** absolute BPM difference; no half/double-tempo equivalence. Missing tempo returns N/A with explicit reference/prediction availability flags.
- **Beat Precision / Recall / F1:** maximum-cardinality one-to-one matches within **70 ms**.
- **Beat Alignment Error:** mean absolute seconds of matched beats.
- **Median Beat Offset:** median signed `(prediction − truth)` seconds on the same matches; positive means late.

Timing errors are conditional on matching; missed and spurious beats are captured by F1 and support counts.

### Harmony

Chord/key intervals are half-open, nonoverlapping, and need not cover the full case. Scores integrate duration over annotated truth intervals, splitting at every prediction boundary. Unannotated gaps and predictions outside truth intervals do not contribute to chord/key accuracy. Missing coverage counts as incorrect, including for explicit no-chord truth.

- **Chord Accuracy:** correctly labeled seconds / annotated seconds.
- **Top-2 Accuracy:** seconds where truth is in the supplied ranked `top2` (up to two distinct labels) / annotated seconds. If absent, falls back to the single accepted label. The PCM adapter uses Engine frame candidates, not inferred alternatives; no-chord is not a ranked triad candidate.
- **Chord Confusion Matrix:** seconds for each truth/prediction pair, with missing predictions separately flagged.
- **Tonal Center Accuracy:** exact root-and-mode label agreement, duration weighted.
- **Key Transition Accuracy:** matched transitions / union of reference and predicted transitions. A match requires exact before/after labels and timing within **500 ms**. Both missed and spurious transitions are penalized. No transitions on either side yields N/A. Transitions only occur between touching differently labeled segments, not across annotation gaps; the supplied key track should be fully annotated when evaluating transitions.

The PCM adapter uses accepted chord frame labels and their ranked candidates; each frame covers its time to the next frame, capped at audio duration. The last frame extends at most one analysis hop, preventing unsupported extrapolation over the recording tail. Keys use emitted tonal-center segments.

### Confidence

Each observation is `{ confidence, correct, weight? }`. Default weight is 1; positive weights support duration-weighted labels. Confidence is treated as a *claimed probability* for evaluation, even if an Engine score has not yet been calibrated.

With `B = 10` equal-width bins, bins are left-inclusive/right-exclusive, except the final bin includes 1. Empty bins have null accuracy and confidence.

- **Reliability Curve:** per-bin boundaries, count, weight, mean confidence and empirical accuracy.
- **ECE:** sum of `(bin weight / total weight) × |accuracy − mean confidence|`.
- **MCE:** maximum absolute gap over occupied bins.
- **Brier Score:** weighted mean `(confidence − correctness)²`.
- **Negative Log Likelihood:** weighted binary log loss in natural-log units. A certainly wrong prediction produces `Infinity`, rendered `∞`; probabilities are not silently clipped.

Combined evaluation derives correctness independently for emitted pitch claims, fully matched notes, tempo within **2 BPM**, accepted chord labels, and key labels. Pitch is sampled on the annotated frame grid; note confidence uses one sample per predicted note, tempo one per case; chords and keys use duration weights. Missing or unvoiced pitch claims do not create confidence samples. Engine beat strength and candidate rank scores are not treated as confidence. There is no pooled cross-domain calibration metric.

For example, eight correct and two incorrect claims at confidence 0.80 produce observed accuracy 0.80, ECE 0, MCE 0, Brier 0.16, and NLL approximately 0.5004. This demonstrates the formulas, not a statistically reliable calibration estimate from ten observations.

## Additional datasets

Any genre/category can supply additional `BenchmarkDataset<PcmInput>` objects. The evaluator itself also supports arbitrary inputs with an injected engine, including precomputed output.

```ts
// fixtures/classical.ts — locally authored loader
export const datasets = [{
  id: 'classical-v1',
  description: 'Document annotation provenance and scope here.',
  cases: [{
    id: 'excerpt-001',
    input: { sampleRate: 48000, channels: [pcmSamples] },
    truth: { melody: [{ start: 0.2, end: 0.7, midi: 69 }] },
  }],
}];
```

```sh
npm run benchmark -- --dataset ./fixtures/classical.ts --dataset ./fixtures/jazz.ts --output evaluation-report.md
```

Dataset modules are executable local code and export a `datasets` array. They are responsible for loading/decoding audio and normalizing annotations. The CLI does not pretend to decode arbitrary audio formats. Use unique dataset IDs and unique case IDs within each dataset. For speech, omit unavailable musical annotations; for polyphonic material, pitch and continuity require an explicitly annotated target voice. Extra dataset arguments replace the default synthetic dataset.

## Markdown example

The generated full report has Summary, Pitch, Melody, Rhythm, Harmony, and Confidence sections with configuration, counts, coverage, both confusion matrices, and reliability bins. A perfect synthetic illustration would include:

```markdown
#### Pitch

| Metric | Value |
| --- | --- |
| Pitch Accuracy | 1.0000 |
| Cent Error (mean absolute) | 0.0000 |
| Octave Error Rate | 0.0000 |

#### Confidence

| Confidence bin | Count | Weight | Mean confidence | Observed accuracy |
| --- | --- | --- | --- | --- |
| [0.80, 0.90) | 10 | 10.0000 | 0.8000 | 0.8000 |
```

See the generated report for measured Engine results, including failures; the illustrative rows above are not measured results.
