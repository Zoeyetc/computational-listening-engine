# Example Ground Truth Dataset v0.1

This is a specification example for [Ground Truth Dataset Specification v0.1](DATASET_SPECIFICATION_V0.1.md). Tables describe proposed assets and annotations; no audio files, JSON files, executable loader, or measured results are supplied. All annotations remain **draft** until rendered audio receives independent review.

## Example manifest

| Property | Example value |
| --- | --- |
| Dataset ID | `cle-ground-truth-example` |
| Schema version | `0.1.0` |
| Dataset release | `0.1.0`, proposed; not published |
| Release class | `example` |
| Origin | Synthetic only |
| Case count | 4 |
| Canonical audio | 48,000 Hz, mono, signed 24-bit PCM WAV |
| Timing origin | First stored audio sample |
| Annotation guidelines | Ground Truth Dataset Specification v0.1 |
| Evaluation profile | Existing Evaluation Suite v0.1 default settings |
| Source group | `syn-example-family-001` for all four cases |
| Split | Development only; no calibration/test split claimed |
| Checksums | Must be computed from actual assets before release; no placeholder digest is valid |
| Rights | Original synthesis and annotations; owner and redistribution license must be recorded before release |
| Review status | Draft; independent reviewer and adjudication record not yet assigned |

The example's single source group and small size do not meet primary collection or population-confidence release requirements. Treat all related future renders as members of the same source group. There is no test-set performance claim.

## Proposed folder placement

```text
datasets/cle-ground-truth-example/0.1.0/
  manifest.json
  checksums.sha256
  README.md
  CHANGELOG.md
  LICENSES/
  splits/development.json
  splits/calibration.json
  splits/test.json
  collections/pitch.json
  collections/melody.json
  collections/rhythm.json
  collections/harmony.json
  collections/confidence.json
  cases/cle-syn-000001/
    audio.wav
    metadata.json
    truth.json
    annotations.json
  cases/cle-syn-000002/
    audio.wav
    metadata.json
    truth.json
    annotations.json
  cases/cle-syn-000003/
    audio.wav
    metadata.json
    truth.json
    annotations.json
  cases/cle-syn-000004/
    audio.wav
    metadata.json
    truth.json
    annotations.json
  provenance/
    source-register.json
    annotation-guidelines.md
    adjudication-log.json
    validation-report.md
```

Calibration and test membership files would explicitly contain no members. That is not evidence of completed calibration or test coverage. The diagram specifies a future layout; this task creates only Markdown documentation.

## Collection membership

| Collection | Referenced case IDs | Eligible truth |
| --- | --- | --- |
| Pitch | `cle-syn-000001`, `cle-syn-000002` | Pitch frames, including unvoiced regions |
| Melody | `cle-syn-000002` | Three note events |
| Rhythm | `cle-syn-000003` | Constant BPM and authored pulse anchors |
| Harmony | `cle-syn-000004` | Full chord and key tracks, subject to independent key review |
| Confidence | All four, once adjudicated | Only the eligible musical domains above; each case appears once |

Confidence membership is the **diagnostic** view. No population view or Engine output is included. The same source audio is referenced, not copied across collections.

## Case 1 — gated A4 reference

| Metadata | Value |
| --- | --- |
| Case ID / revision | `cle-syn-000001` / 1 |
| Source ID | `syn-example-a4` |
| Duration / frame count | 2.000 seconds / 96,000 |
| Channels | One target oscillator, no accompaniment |
| Synthesis design | 440 Hz sine with a documented short amplitude envelope; gate from 0.250 to 1.750 seconds |
| Target / tuning | Oscillator fundamental; A4 = 440 Hz, MIDI 69 |
| Annotated domain | Pitch only |
| Omitted domains | Melody, rhythm, harmony; omission does not assert absence |

The complete pitch annotation has **200 frames** at 0.000, 0.010, …, 1.990 seconds. Each frame has only `time` and `midi` in scoring truth.

| Grid times | Sample-index span on the grid | MIDI truth | Number of frames |
| --- | --- | --- | --- |
| 0.000–0.240 seconds | 0–11,520, step 480 | null: unvoiced | 25 |
| 0.250–1.740 seconds | 12,000–83,520, step 480 | 69.0000 | 150 |
| 1.750–1.990 seconds | 84,000–95,520, step 480 | null: unvoiced | 25 |

The sidecar records gate boundary samples 12,000 and 84,000, the oscillator frequency, envelope specification, renderer version, and independent verification. These are authored reference rules; renderer latency or a longer tail discovered during review must be resolved before release, never corrected using an Engine prediction.

Validation expectation: complete uniform grid; 150 voiced and 50 unvoiced reference samples; no timestamp at 2.000 seconds; exact pitch independent of Engine behavior. No accuracy result is asserted.

## Case 2 — three-note melody with rests

| Metadata | Value |
| --- | --- |
| Case ID / revision | `cle-syn-000002` / 1 |
| Source ID | `syn-example-phrase` |
| Duration / frame count | 4.000 seconds / 192,000 |
| Target | One independently rendered melody voice |
| Annotated domains | Melody and pitch |
| Synthesis design | Three equal-gain pitched notes with verified attack/release timing, no reverb or accompaniment |

### Melody annotation

| Annotation reference | Start | End | Start sample | End sample | MIDI |
| --- | --- | --- | --- | --- | --- |
| `cle-syn-000002/melody/000001` | 0.500 | 1.250 | 24,000 | 60,000 | 69 |
| `cle-syn-000002/melody/000002` | 1.500 | 2.250 | 72,000 | 108,000 | 72 |
| `cle-syn-000002/melody/000003` | 2.500 | 3.250 | 120,000 | 156,000 | 76 |

Only start/end/MIDI go into `truth.json`; references and sample anchors are sidecar fields. Frequency follows the MIDI tuning relation, preserving fractional precision when rendered.

### Pitch annotation

The complete 10-ms grid contains 400 frames. MIDI is 69 during [0.500, 1.250), 72 during [1.500, 2.250), and 76 during [2.500, 3.250). All other grid entries are explicitly null. This yields 225 voiced and 175 unvoiced samples. Rest gaps are preserved rather than bridged.

Validation expectation: three distinct nonoverlapping notes, two adjacent note-pair opportunities for continuity, matching stable-interior frame pitches, and complete silence/rest annotation. A correct Engine output is not part of this dataset.

## Case 3 — 120 BPM pulse train

| Metadata | Value |
| --- | --- |
| Case ID / revision | `cle-syn-000003` / 1 |
| Source ID | `syn-example-clicks` |
| Duration / frame count | 9.000 seconds / 432,000 |
| Annotated domain | Rhythm only |
| Reference BPM | 120 |
| Pulse level | Authored quarter-note pulse |
| Pulse-active interval | [0.500, 8.500) seconds; silence outside the authored train |
| Reference method | Authored pulse times verified against the rendered click onset anchors |

### Beat annotation

| Beat ordinals | Times in seconds | Sample anchors |
| --- | --- | --- |
| 1–4 | 0.500, 1.000, 1.500, 2.000 | 24,000; 48,000; 72,000; 96,000 |
| 5–8 | 2.500, 3.000, 3.500, 4.000 | 120,000; 144,000; 168,000; 192,000 |
| 9–12 | 4.500, 5.000, 5.500, 6.000 | 216,000; 240,000; 264,000; 288,000 |
| 13–16 | 6.500, 7.000, 7.500, 8.000 | 312,000; 336,000; 360,000; 384,000 |

Scoring truth consists of BPM 120 and those 16 times. Pulse-active interval and ordinals belong in metadata/sidecar. There is no implied seventeenth reference beat at 8.500 seconds, where the authored pulse has ended. The click renderer must be fixed and reviewed; no beat is shifted to improve agreement with the Engine.

Validation expectation: 16 unique anchors spaced by 24,000 samples, within duration, and no unannotated pulses. Subdivision onsets, if later added, would require a new audio case ID while keeping this reference pulse-level convention explicit.

## Case 4 — composed key-change progression

| Metadata | Value |
| --- | --- |
| Case ID / revision | `cle-syn-000004` / 1 |
| Source ID | `syn-example-progression` |
| Duration / frame count | 32.000 seconds / 1,536,000 |
| Annotated domain | Harmony: complete chords and keys |
| Synthesis design | Fixed-voicing major/minor triads, each held for two seconds; continuous harmonic content without unannotated gaps |
| Intended keys | C major followed by D major |
| Critical review condition | Independent harmonic review must confirm the proposed keys and localized boundary in the rendered audio; compositional intent alone is insufficient |

### Chord annotation

| Start | End | Human label | Canonical truth label |
| --- | --- | --- | --- |
| 0 | 2 | C major | `0:major` |
| 2 | 4 | F major | `5:major` |
| 4 | 6 | G major | `7:major` |
| 6 | 8 | C major | `0:major` |
| 8 | 10 | A minor | `9:minor` |
| 10 | 12 | D minor | `2:minor` |
| 12 | 14 | G major | `7:major` |
| 14 | 16 | C major | `0:major` |
| 16 | 18 | D major | `2:major` |
| 18 | 20 | G major | `7:major` |
| 20 | 22 | A major | `9:major` |
| 22 | 24 | D major | `2:major` |
| 24 | 26 | B minor | `11:minor` |
| 26 | 28 | E minor | `4:minor` |
| 28 | 30 | A major | `9:major` |
| 30 | 32 | D major | `2:major` |

Every boundary sample is its displayed seconds × 48,000. Human chord names are explanatory text; only the canonical labels enter scoring truth. Voicing details, oscillator parameters, and boundary uncertainty go in provenance.

### Key annotation

| Start | End | Canonical truth label | Sidecar rationale |
| --- | --- | --- | --- |
| 0 | 16 | `0:major` | Composed C-major progression with repeated cadence |
| 16 | 32 | `2:major` | Composed D-major progression with repeated cadence |

The intended transition is at sample 768,000. If review cannot localize it sufficiently, this case is not eligible for the primary complete-harmony collection. Do not invent a key from each chord root, keep an uncertain key as null, or interpret an empty key array as an unknown key track.

Validation expectation: two complete nonoverlapping label tracks, 16 chord intervals, two key intervals, and one proposed key transition. No ground-truth ranked candidates or confidence values exist.

## Confidence view

The example confidence collection references the four case IDs once and specifies eligible domains:

| Case | Claim families eligible after adjudication |
| --- | --- |
| `cle-syn-000001` | Voiced pitch |
| `cle-syn-000002` | Voiced pitch; fully matched melody notes |
| `cle-syn-000003` | Scalar tempo |
| `cle-syn-000004` | Accepted chord labels; emitted keys |

No confidence observation can be filled in before an Engine run. The release cannot assert that the Engine will emit a certain number of claims or populate any confidence bin.

For a later prediction at 0.80 confidence, the reference annotations above determine whether the associated pitch/note/tempo/chord/key claim is correct under the pinned evaluator. A collection of such run observations can support a reliability calculation. The reference dataset itself contains neither “0.80 should be correct” nor an invented 80% correctness target.

## Release checklist for this example

Before treating these tables as an actual dataset, render and freeze all four WAV files; supply all metadata and JSON annotations; independently review the audio and labels; resolve the proposed key boundary; document rights and provenance; compute real digests; and record validation results. Keep the release marked `example`, since its source count and coverage do not satisfy the primary v0.1 inventory targets.

None of those asset-production steps is performed or authorized implicitly by this documentation task. No Engine or evaluation changes are required by this example.
