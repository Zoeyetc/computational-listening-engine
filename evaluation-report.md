# Computational Listening Engine — Evaluation v0.1

Metrics only. Higher accuracy, precision, recall, F1 and continuity are better; lower error, fragmentation and calibration loss are better. Times are seconds. Rates are 0–1. N/A means no applicable denominator or annotation, not a perfect score.

## Summary

Datasets: 1. Cases: 4. Results are shown per case; no average mixes unrelated domains or datasets.

Synthetic fixtures exercise the pipeline; they do not establish real-world accuracy or calibrated probabilities. Continuity and fragmentation measure output stability proxies, not robustness to recording changes. Missing predictions are scored as misses where defined; inspect coverage and tempo availability alongside conditional errors.

Confidence evaluates emitted claims against ground truth, separately by domain. Pitch/note/tempo observations have unit weight; chord/key observations are duration weighted. No confidence is inferred for missing predictions, beat strength, or candidate scores. Sparse bins do not establish calibration.

| Dataset / case | Pitch accuracy | Note F1 | Beat F1 | Chord accuracy | Continuity | Fragmentation |
| --- | --- | --- | --- | --- | --- | --- |
| synthetic-v0.1 / monophonic-phrase | 1.0000 | 1.0000 | N/A | N/A | 1.0000 | 0.0000 |
| synthetic-v0.1 / 120-bpm-clicks | N/A | N/A | 0.0000 | N/A | N/A | N/A |
| synthetic-v0.1 / major-triads-key-change | N/A | N/A | N/A | 0.9293 | N/A | N/A |
| synthetic-v0.1 / silence | N/A | N/A | N/A | 1.0000 | N/A | N/A |

### Evaluation configuration

| Parameter | Value |
| --- | --- |
| pitchToleranceCents | 50 |
| frameToleranceSeconds | 0.025 |
| onsetToleranceSeconds | 0.05 |
| offsetToleranceSeconds | 0.05 |
| offsetToleranceRatio | 0.2 |
| beatToleranceSeconds | 0.07 |
| keyTransitionToleranceSeconds | 0.5 |
| tempoToleranceBpm | 2 |
| calibrationBins | 10 |

## Dataset: synthetic-v0.1

Deterministic authored tones, clicks, triads and silence at 12 kHz. Smoke benchmark only; nominal key labels describe the composed progression, not perceptual certainty.

### Case: monophonic-phrase

#### Pitch

| Metric | Value |
| --- | --- |
| Pitch Accuracy | 1.0000 |
| Cent Error (mean absolute) | 1.7383 |
| Octave Error Rate | 0.0000 |
| Voiced Precision | 0.9484 |
| Voiced Recall | 1.0000 |
| Voiced F1 | 0.9735 |
| Reference frames | 219.0000 |
| Aligned frames | 212.0000 |
| Alignment coverage | 0.9680 |
| Jointly voiced frames | 147.0000 |

Voiced/Unvoiced Confusion Matrix (frame counts):

| Truth \ Prediction | Voiced | Unvoiced / missing |
| --- | --- | --- |
| Voiced | 147 | 0 |
| Unvoiced | 8 | 64 |

#### Melody

| Metric | Value |
| --- | --- |
| Note Precision | 1.0000 |
| Note Recall | 1.0000 |
| Note F1 | 1.0000 |
| Reference notes | 3.0000 |
| Predicted notes | 3.0000 |
| Matched notes | 3.0000 |
| Onset Error (mean absolute) | 0.0247 |
| Offset Error (mean absolute) | 0.0187 |
| Timing matched notes | 3.0000 |
| Pitch-path Continuity | 1.0000 |
| Track Fragmentation | 0.0000 |

#### Rhythm

N/A — no rhythm annotation.

#### Harmony

N/A — no harmony annotation.

#### Confidence

##### pitch

| Metric | Value |
| --- | --- |
| Observations | 155.0000 |
| Weight | 155.0000 |
| ECE | 0.2189 |
| MCE | 0.8773 |
| Brier Score | 0.0905 |
| Negative Log Likelihood | 0.3526 |

| Confidence bin | Count | Weight | Mean confidence | Observed accuracy |
| --- | --- | --- | --- | --- |
| [0.00, 0.10) | 0 | 0.0000 | N/A | N/A |
| [0.10, 0.20) | 0 | 0.0000 | N/A | N/A |
| [0.20, 0.30) | 0 | 0.0000 | N/A | N/A |
| [0.30, 0.40) | 0 | 0.0000 | N/A | N/A |
| [0.40, 0.50) | 0 | 0.0000 | N/A | N/A |
| [0.50, 0.60) | 0 | 0.0000 | N/A | N/A |
| [0.60, 0.70) | 0 | 0.0000 | N/A | N/A |
| [0.70, 0.80) | 153 | 153.0000 | 0.7505 | 0.9608 |
| [0.80, 0.90) | 2 | 2.0000 | 0.8773 | 0.0000 |
| [0.90, 1.00] | 0 | 0.0000 | N/A | N/A |

##### melody

| Metric | Value |
| --- | --- |
| Observations | 3.0000 |
| Weight | 3.0000 |
| ECE | 0.2469 |
| MCE | 0.2469 |
| Brier Score | 0.0610 |
| Negative Log Likelihood | 0.2836 |

| Confidence bin | Count | Weight | Mean confidence | Observed accuracy |
| --- | --- | --- | --- | --- |
| [0.00, 0.10) | 0 | 0.0000 | N/A | N/A |
| [0.10, 0.20) | 0 | 0.0000 | N/A | N/A |
| [0.20, 0.30) | 0 | 0.0000 | N/A | N/A |
| [0.30, 0.40) | 0 | 0.0000 | N/A | N/A |
| [0.40, 0.50) | 0 | 0.0000 | N/A | N/A |
| [0.50, 0.60) | 0 | 0.0000 | N/A | N/A |
| [0.60, 0.70) | 0 | 0.0000 | N/A | N/A |
| [0.70, 0.80) | 3 | 3.0000 | 0.7531 | 1.0000 |
| [0.80, 0.90) | 0 | 0.0000 | N/A | N/A |
| [0.90, 1.00] | 0 | 0.0000 | N/A | N/A |

##### tempo

N/A — no scored confidence claims.

##### chords

N/A — no scored confidence claims.

##### keys

N/A — no scored confidence claims.

### Case: 120-bpm-clicks

#### Pitch

N/A — no pitch annotation.

#### Melody

N/A — no melody annotation.

#### Rhythm

| Metric | Value |
| --- | --- |
| Tempo Error (BPM) | 0.0000 |
| Tempo reference available (0/1) | 1.0000 |
| Tempo prediction available (0/1) | 1.0000 |
| Beat Precision | 0.0000 |
| Beat Recall | 0.0000 |
| Beat F1 | 0.0000 |
| Reference beats | 16.0000 |
| Predicted beats | 17.0000 |
| Matched beats | 0.0000 |
| Beat Alignment Error | N/A |
| Median Beat Offset (prediction − truth) | N/A |

#### Harmony

N/A — no harmony annotation.

#### Confidence

##### pitch

N/A — no scored confidence claims.

##### melody

N/A — no scored confidence claims.

##### tempo

| Metric | Value |
| --- | --- |
| Observations | 1.0000 |
| Weight | 1.0000 |
| ECE | 0.0941 |
| MCE | 0.0941 |
| Brier Score | 0.0089 |
| Negative Log Likelihood | 0.0988 |

| Confidence bin | Count | Weight | Mean confidence | Observed accuracy |
| --- | --- | --- | --- | --- |
| [0.00, 0.10) | 0 | 0.0000 | N/A | N/A |
| [0.10, 0.20) | 0 | 0.0000 | N/A | N/A |
| [0.20, 0.30) | 0 | 0.0000 | N/A | N/A |
| [0.30, 0.40) | 0 | 0.0000 | N/A | N/A |
| [0.40, 0.50) | 0 | 0.0000 | N/A | N/A |
| [0.50, 0.60) | 0 | 0.0000 | N/A | N/A |
| [0.60, 0.70) | 0 | 0.0000 | N/A | N/A |
| [0.70, 0.80) | 0 | 0.0000 | N/A | N/A |
| [0.80, 0.90) | 0 | 0.0000 | N/A | N/A |
| [0.90, 1.00] | 1 | 1.0000 | 0.9059 | 1.0000 |

##### chords

N/A — no scored confidence claims.

##### keys

N/A — no scored confidence claims.

### Case: major-triads-key-change

#### Pitch

N/A — no pitch annotation.

#### Melody

N/A — no melody annotation.

#### Rhythm

N/A — no rhythm annotation.

#### Harmony

| Metric | Value |
| --- | --- |
| Chord Accuracy | 0.9293 |
| Top-2 Accuracy | 0.9453 |
| Chord reference seconds | 16.0000 |
| Chord coverage | 1.0000 |
| Tonal Center Accuracy | 0.5000 |
| Key reference seconds | 16.0000 |
| Key coverage | 1.0000 |
| Key Transition Accuracy (intersection / union) | 0.0000 |
| Reference key transitions | 1.0000 |
| Predicted key transitions | 1.0000 |
| Matched key transitions | 0.0000 |

Chord Confusion Matrix (duration in seconds):

| Truth | Prediction | Seconds |
| --- | --- | --- |
| 0:major | 0:major | 3.6800 |
| 0:major | 7:major | 0.2347 |
| 7:major | 7:major | 3.6907 |
| 7:major | (no chord) | 0.1707 |
| 7:major | 0:major | 0.0747 |
| 0:major | (no chord) | 0.0853 |
| 7:major | 2:major | 0.0640 |
| 2:major | 2:major | 3.6373 |
| 2:major | (no chord) | 0.1707 |
| 2:major | 9:major | 0.1920 |
| 9:major | 9:major | 3.8613 |
| 9:major | (no chord) | 0.0853 |
| 9:major | 2:major | 0.0533 |

#### Confidence

##### pitch

N/A — no scored confidence claims.

##### melody

N/A — no scored confidence claims.

##### tempo

N/A — no scored confidence claims.

##### chords

| Metric | Value |
| --- | --- |
| Observations | 189.0000 |
| Weight | 15.4880 |
| ECE | 0.0364 |
| MCE | 0.7321 |
| Brier Score | 0.0301 |
| Negative Log Likelihood | 0.1122 |

| Confidence bin | Count | Weight | Mean confidence | Observed accuracy |
| --- | --- | --- | --- | --- |
| [0.00, 0.10) | 0 | 0.0000 | N/A | N/A |
| [0.10, 0.20) | 0 | 0.0000 | N/A | N/A |
| [0.20, 0.30) | 0 | 0.0000 | N/A | N/A |
| [0.30, 0.40) | 0 | 0.0000 | N/A | N/A |
| [0.40, 0.50) | 0 | 0.0000 | N/A | N/A |
| [0.50, 0.60) | 1 | 0.0853 | 0.5209 | 1.0000 |
| [0.60, 0.70) | 2 | 0.1707 | 0.6604 | 0.5000 |
| [0.70, 0.80) | 2 | 0.1707 | 0.7321 | 0.0000 |
| [0.80, 0.90) | 9 | 0.5973 | 0.8544 | 0.6250 |
| [0.90, 1.00] | 175 | 14.4640 | 0.9743 | 0.9904 |

##### keys

| Metric | Value |
| --- | --- |
| Observations | 3.0000 |
| Weight | 16.0000 |
| ECE | 0.3261 |
| MCE | 0.3261 |
| Brier Score | 0.3725 |
| Negative Log Likelihood | 1.0287 |

| Confidence bin | Count | Weight | Mean confidence | Observed accuracy |
| --- | --- | --- | --- | --- |
| [0.00, 0.10) | 0 | 0.0000 | N/A | N/A |
| [0.10, 0.20) | 0 | 0.0000 | N/A | N/A |
| [0.20, 0.30) | 0 | 0.0000 | N/A | N/A |
| [0.30, 0.40) | 0 | 0.0000 | N/A | N/A |
| [0.40, 0.50) | 0 | 0.0000 | N/A | N/A |
| [0.50, 0.60) | 0 | 0.0000 | N/A | N/A |
| [0.60, 0.70) | 0 | 0.0000 | N/A | N/A |
| [0.70, 0.80) | 0 | 0.0000 | N/A | N/A |
| [0.80, 0.90) | 3 | 16.0000 | 0.8261 | 0.5000 |
| [0.90, 1.00] | 0 | 0.0000 | N/A | N/A |

### Case: silence

#### Pitch

| Metric | Value |
| --- | --- |
| Pitch Accuracy | N/A |
| Cent Error (mean absolute) | N/A |
| Octave Error Rate | N/A |
| Voiced Precision | N/A |
| Voiced Recall | N/A |
| Voiced F1 | N/A |
| Reference frames | 63.0000 |
| Aligned frames | 55.0000 |
| Alignment coverage | 0.8730 |
| Jointly voiced frames | 0.0000 |

Voiced/Unvoiced Confusion Matrix (frame counts):

| Truth \ Prediction | Voiced | Unvoiced / missing |
| --- | --- | --- |
| Voiced | 0 | 0 |
| Unvoiced | 0 | 63 |

#### Melody

| Metric | Value |
| --- | --- |
| Note Precision | N/A |
| Note Recall | N/A |
| Note F1 | N/A |
| Reference notes | 0.0000 |
| Predicted notes | 0.0000 |
| Matched notes | 0.0000 |
| Onset Error (mean absolute) | N/A |
| Offset Error (mean absolute) | N/A |
| Timing matched notes | 0.0000 |
| Pitch-path Continuity | N/A |
| Track Fragmentation | N/A |

#### Rhythm

| Metric | Value |
| --- | --- |
| Tempo Error (BPM) | N/A |
| Tempo reference available (0/1) | 0.0000 |
| Tempo prediction available (0/1) | 0.0000 |
| Beat Precision | N/A |
| Beat Recall | N/A |
| Beat F1 | N/A |
| Reference beats | 0.0000 |
| Predicted beats | 0.0000 |
| Matched beats | 0.0000 |
| Beat Alignment Error | N/A |
| Median Beat Offset (prediction − truth) | N/A |

#### Harmony

| Metric | Value |
| --- | --- |
| Chord Accuracy | 1.0000 |
| Top-2 Accuracy | 0.0000 |
| Chord reference seconds | 1.0000 |
| Chord coverage | 1.0000 |
| Tonal Center Accuracy | N/A |
| Key reference seconds | 0.0000 |
| Key coverage | N/A |
| Key Transition Accuracy (intersection / union) | N/A |
| Reference key transitions | 0.0000 |
| Predicted key transitions | 0.0000 |
| Matched key transitions | 0.0000 |

Chord Confusion Matrix (duration in seconds):

| Truth | Prediction | Seconds |
| --- | --- | --- |
| (no chord) | (no chord) | 1.0000 |

#### Confidence

##### pitch

N/A — no scored confidence claims.

##### melody

N/A — no scored confidence claims.

##### tempo

N/A — no scored confidence claims.

##### chords

N/A — no scored confidence claims.

##### keys

N/A — no scored confidence claims.
