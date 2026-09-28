# Drum Evidence Real-Audio Gate A v0.1

Gate A applies the existing Drum Evidence Probe v0 to two real-audio calibration files. The supplied labels are human-confirmed section boundaries with intentional second-level precision. They are weak section labels, not event annotations, so this report does not calculate event precision, recall, F1, or missed-hit counts.

No listening threshold, feature, classifier, evidence semantic, production path, or public API was changed.

## Inputs

The audio remains outside the repository in the iCloud Drive root.

| File | SHA-256 | Duration | Format |
| --- | --- | ---: | --- |
| `Kit Calibration.wav` | `c4960207cee841517e4a95f581cdf9be6f719aeae93016513f0a483b9687e2d1` | 119.640 s | 48 kHz, 16-bit PCM, stereo |
| `Calibration Sections.wav` | `f22b738d3f89c74dbc5e558dbcb62737b9939545767dcfb0f9fed76667355f55` | 109.880 s | 48 kHz, 16-bit PCM, stereo |

The analysis runs each complete file once, preserving the production file-level p95 normalization and temporal context. Events are assigned to a section by onset timestamp. Descriptor tails may cross a weak section boundary.

## Funnel definitions

- **Peak**: a positive local maximum in the normalized full-band positive spectral-difference curve. This is an acoustic opportunity count, not a count of audible or annotated drum hits.
- **Floor**: a local peak at or above the existing fixed onset floor of `0.2`.
- **Adaptive**: a floor peak also satisfying `onset >= max(0.2, previous-eight-frame mean * 1.35 + 0.06)`.
- **Candidate**: an adaptive survivor with normalized RMS at least `0.025`. This exactly reconstructs the production `candidateIndices` set.
- **Scored**: a production candidate that passes the right-edge and sustained/non-percussive gates and reaches the existing class scorer.
- **Selected**: an accepted named-class Drum decision.
- **Abstain**: accepted `other-percussion` ambiguity or insufficient class evidence.
- **Rejected**: sustained/non-percussive, incomplete-right-edge, or refractory rejection.
- **Published**: an event present in the public `ListeningMap.percussion` representation. Both complete-file Percussion tracks were available.

Each funnel cell is `count @ density/second`.

## Per-section funnel

| File/section | Peak | Floor | Adaptive | Candidate | Scored | Selected | Abstain | Rejected | Published |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Kit / kick | 352 @ 14.08/s | 334 @ 13.36/s | 145 @ 5.8/s | 139 @ 5.56/s | 86 @ 3.44/s | 62 @ 2.48/s | 13 @ 0.52/s | 64 @ 2.56/s | 75 @ 3/s |
| Kit / snare | 435 @ 14.032/s | 428 @ 13.806/s | 130 @ 4.194/s | 130 @ 4.194/s | 90 @ 2.903/s | 69 @ 2.226/s | 20 @ 0.645/s | 41 @ 1.323/s | 89 @ 2.871/s |
| Kit / hi-hat | 314 @ 13.083/s | 281 @ 11.708/s | 152 @ 6.333/s | 152 @ 6.333/s | 59 @ 2.458/s | 35 @ 1.458/s | 20 @ 0.833/s | 97 @ 4.042/s | 55 @ 2.292/s |
| Kit / tom | 302 @ 15.1/s | 281 @ 14.05/s | 90 @ 4.5/s | 90 @ 4.5/s | 28 @ 1.4/s | 23 @ 1.15/s | 5 @ 0.25/s | 62 @ 3.1/s | 28 @ 1.4/s |
| Kit / full-drums | 250 @ 14.741/s | 207 @ 12.205/s | 90 @ 5.307/s | 90 @ 5.307/s | 12 @ 0.708/s | 10 @ 0.59/s | 2 @ 0.118/s | 78 @ 4.599/s | 12 @ 0.708/s |
| Sections / kick | 224 @ 14/s | 107 @ 6.688/s | 80 @ 5/s | 80 @ 5/s | 9 @ 0.563/s | 9 @ 0.563/s | 0 @ 0/s | 71 @ 4.438/s | 9 @ 0.563/s |
| Sections / snare | 182 @ 13/s | 124 @ 8.857/s | 97 @ 6.929/s | 97 @ 6.929/s | 17 @ 1.214/s | 13 @ 0.929/s | 1 @ 0.071/s | 83 @ 5.929/s | 14 @ 1/s |
| Sections / hi-hat | 201 @ 12.563/s | 138 @ 8.625/s | 107 @ 6.688/s | 107 @ 6.688/s | 10 @ 0.625/s | 7 @ 0.438/s | 3 @ 0.188/s | 97 @ 6.063/s | 10 @ 0.625/s |
| Sections / tom | 228 @ 12/s | 161 @ 8.474/s | 140 @ 7.368/s | 140 @ 7.368/s | 9 @ 0.474/s | 6 @ 0.316/s | 2 @ 0.105/s | 132 @ 6.947/s | 8 @ 0.421/s |
| Sections / full-drums | 171 @ 11.4/s | 128 @ 8.533/s | 101 @ 6.733/s | 101 @ 6.733/s | 10 @ 0.667/s | 6 @ 0.4/s | 4 @ 0.267/s | 91 @ 6.067/s | 10 @ 0.667/s |
| Sections / monophonic-piano | 97 @ 12.933/s | 53 @ 7.067/s | 49 @ 6.533/s | 49 @ 6.533/s | 0 @ 0/s | 0 @ 0/s | 0 @ 0/s | 49 @ 6.533/s | 0 @ 0/s |
| Sections / bass | 94 @ 12.533/s | 62 @ 8.267/s | 53 @ 7.067/s | 53 @ 7.067/s | 4 @ 0.533/s | 4 @ 0.533/s | 0 @ 0/s | 49 @ 6.533/s | 4 @ 0.533/s |
| Sections / piano+drums | 183 @ 14.432/s | 78 @ 6.151/s | 66 @ 5.205/s | 66 @ 5.205/s | 4 @ 0.315/s | 4 @ 0.315/s | 0 @ 0/s | 62 @ 4.89/s | 4 @ 0.315/s |

## Rejection and abstention accounting

| File/section | Sustained/non-percussive | Refractory | Incomplete edge | Other rejection | Ambiguous class | Insufficient evidence |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Kit / kick | 53 | 11 | 0 | 0 | 13 | 0 |
| Kit / snare | 40 | 1 | 0 | 0 | 20 | 0 |
| Kit / hi-hat | 93 | 4 | 0 | 0 | 20 | 0 |
| Kit / tom | 62 | 0 | 0 | 0 | 5 | 0 |
| Kit / full-drums | 78 | 0 | 0 | 0 | 2 | 0 |
| Sections / kick | 71 | 0 | 0 | 0 | 0 | 0 |
| Sections / snare | 80 | 3 | 0 | 0 | 1 | 0 |
| Sections / hi-hat | 97 | 0 | 0 | 0 | 3 | 0 |
| Sections / tom | 131 | 1 | 0 | 0 | 2 | 0 |
| Sections / full-drums | 91 | 0 | 0 | 0 | 4 | 0 |
| Sections / monophonic-piano | 49 | 0 | 0 | 0 | 0 | 0 |
| Sections / bass | 49 | 0 | 0 | 0 | 0 | 0 |
| Sections / piano+drums | 62 | 0 | 0 | 0 | 0 | 0 |

Across the 196.96 seconds carrying drum section labels, there were 2,659 raw local peaks, 2,189 peaks above the fixed onset floor, 1,132 adaptive-onset survivors, 1,126 production candidates, 330 scored candidates, and 310 published events. Candidate density was 5.717/s; scored density was 1.675/s; published density was 1.574/s.

The RMS gate removed only 6 adaptive-onset survivors. The sustained/non-percussive rule removed 796 of 1,126 production candidates, or 70.7%. Refractory policy removed 20, or 1.8%. No labeled-section candidate was lost to the incomplete-edge guard, insufficient-confidence check, or an unaccounted reason.

Of 330 scored candidates, 240 became named selections, 70 became accepted `other-percussion` ambiguity abstentions, and 20 were refractory duplicates. Therefore 310 of 330 scored candidates, or 93.9%, were published. The Engine's public representation did not discard valid accepted decisions.

## Class behavior under weak labels

| Section label | Published role counts across both files |
| --- | --- |
| Kick | 31 kick, 27 tom, 13 other, 11 open-hat, 2 closed-hat |
| Snare | 44 kick, 25 tom, 21 other, 13 open-hat, 0 snare |
| Hi-hat | 20 tom, 19 kick, 23 other, 2 open-hat, 1 closed-hat |
| Tom | 14 kick, 9 tom, 7 other, 5 open-hat, 1 closed-hat |
| Full drums | 13 kick, 3 tom, 6 other |

These are section-level correspondence observations rather than event accuracy measurements. The labels do, however, expose weak class separation: no event in either snare section was labeled snare, and only 3 of 65 published events in the hi-hat sections were assigned a hat class.

### Kick versus tom

In the Kit kick section, 48 scored candidates favored kick over tom and 38 favored tom; their mean scores were both `0.450`. Public output contained 30 kick and 19 tom events. In the Sections kick segment, tom won 8 of 9 scored candidates and public output contained 8 tom events and 1 kick. The current evidence does not separate kick and resonant tom reliably on these sections.

### Hi-hat

The Kit hi-hat segment published 1 closed-hat, 2 open-hat, 20 ambiguous other, 14 kick, and 18 tom events. The Sections hi-hat segment published no named hats: 5 kick, 2 tom, and 3 ambiguous other. All 23 aggregate ambiguity decisions included `LOW_CLASS_MARGIN`; ambiguity is present, but most lost candidates were rejected by the sustained/non-percussive gate before hat scoring.

### Tom and pitch overlap

The Kit tom segment contained 1,421 retained Melody candidates across 1,226 Melody-candidate frames; 196 Melody frames were voiced, with a median final voiced pitch of 137.88 Hz. The Sections tom segment contained 3,563 candidates across 1,179 candidate frames; 665 frames were voiced, with a median final voiced pitch of 249.26 Hz. Bass also selected frames in both regions. Drum, Melody, Bass, and Rhythm remained independent; no pitch evidence was suppressed because a section was labeled tom.

### Pitched controls and mixture

- Monophonic piano: 49 production percussion candidates, all rejected as sustained/non-percussive; zero class scores and zero published false Drum events.
- Bass: 53 candidates; 49 sustained rejections and 4 scored/published false kick selections (`0.533/s`).
- Piano plus drums: 66 candidates; 62 sustained rejections and 4 named selections, comprising 1 kick and 3 tom (`0.315/s`). There were no ambiguity abstentions because nearly all candidates were rejected before class scoring.

## Interpretation of perceived sparsity

The data does not support describing every loss as low sensitivity.

- **Candidate detection:** production candidate density remained high in every drum-labeled section, from 4.194/s to 7.368/s. Adaptive onset gating reduced 2,189 fixed-floor peaks to 1,132 survivors, but raw peaks are not annotated drum hits, so event-level annotations are required to determine whether audible hits are lost here.
- **Gating:** the dominant observed post-candidate loss is the sustained/non-percussive rule. It removed 70.7% of production candidates across drum-labeled sections and 86.7–93.9% in both full-drum sections and the piano-plus-drums section.
- **Classification ambiguity:** 70 of 330 scored candidates were accepted as ambiguous `other-percussion`. This is material but smaller than the pre-scoring sustained rejection. Named outputs also correspond poorly to the weak section labels, particularly snare and hi-hat.
- **Publication:** every accepted named or ambiguous decision reached the public Percussion event list. Publication does not explain Engine-side sparsity on these two files.
- **RMS and refractory gates:** RMS removed 6 candidates; refractory policy removed 20. Neither is the dominant source.

The sustained gate also correctly removed every piano candidate and 49 of 53 bass candidates. Any later investigation must preserve that protection rather than simply relaxing the threshold.

## Gate A decision

For this corpus, **gating is overly conservative** is the closest supported outcome. The sustained/non-percussive gate is the principal measured source of sparse public events, especially in full drums and piano plus drums. This is a diagnosis, not authorization to tune it.

The next measurement should add event-level onset annotations for a small subset of kick, snare, hat, tom, full-drum, piano, bass, and mixed material. That will determine which adaptive-onset and sustained-gate rejects correspond to audible drum hits and allow sensitivity to be separated from necessary pitched-instrument rejection.

Both complete runs were deterministic after excluding wall-clock timings. Full analysis took approximately 2.8 seconds for `Kit Calibration.wav` and 3.7 seconds for `Calibration Sections.wav` in this Node run; these figures are descriptive and are not a performance claim.
