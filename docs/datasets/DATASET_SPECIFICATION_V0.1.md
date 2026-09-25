# Ground Truth Dataset Specification v0.1

Status: design specification. Schema version: **0.1.0**. No dataset assets, loaders, validators, algorithms, or evaluation changes are implemented by this document.

The datasets belong to Computational Listening Engine. They provide independently established reference annotations for measuring Engine behavior. They never change that behavior. An evaluation result must not write back into audio, annotations, confidence values, thresholds, evidence, or runtime settings.

## 1. Deliverables and scope

Define five reusable collections: **Pitch**, **Melody**, **Rhythm**, **Harmony**, and **Confidence**. Collections reference shared immutable audio cases; the same recording need not be copied into five folders. Confidence is a selection of annotated cases, not an additional musical truth field.

The first release targets predominantly monophonic pitch/melody, constant-tempo rhythm, major/minor triads, and major/minor tonal centers. It includes silence and agreed negative examples. Genres describe material; they do not imply annotation availability. Synthetic and recorded material are always reported separately.

The existing [evaluation contracts](../../evaluation/types.ts) and [metric definitions](../../evaluation/README.md) remain authoritative for scoring. This specification describes storage and annotation conventions. The current benchmark accepts executable local dataset modules; it does **not** already load the file layout proposed here. A future, separately authorized data loader would translate stored references to those existing contracts without altering scoring.

The [example dataset](EXAMPLE_DATASET_V0.1.md) is a human-readable design example, not a released or runnable benchmark.

## 2. File and folder structure

The following is a proposed release layout, not folders created by this task.

```text
datasets/
  cle-ground-truth/
    0.1.0/
      README.md
      manifest.json
      checksums.sha256
      CHANGELOG.md
      LICENSES/
        audio-rights.md
        annotation-rights.md
      splits/
        development.json
        calibration.json
        test.json
      collections/
        pitch.json
        melody.json
        rhythm.json
        harmony.json
        confidence.json
      cases/
        cle-syn-000001/
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

| File | Format and responsibility |
| --- | --- |
| `manifest.json` | UTF-8 JSON object: collection identity, schema/release versions, case index, split policy, evaluation profile, annotation guideline version, and release status. |
| `audio.wav` | Uncompressed RIFF/WAVE, signed 24-bit PCM, 48,000 Hz, one or two channels for the canonical v0.1 benchmark asset. Audio is committed to the dataset release as fixed bytes, regardless of how it was produced. |
| `metadata.json` | UTF-8 JSON object describing one case, its source, exact sample count, provenance, rights, strata, and domain eligibility. |
| `truth.json` | UTF-8 JSON object containing only annotated `pitch`, `melody`, `rhythm`, and/or `harmony` domains in the existing evaluation shapes. No comments, NaN, Infinity, or undefined values. |
| `annotations.json` | UTF-8 JSON object containing annotation status, sample-index anchors, annotator/reviewer identifiers, uncertainty, and exclusions. This is provenance, not an additional evaluator input. |
| Collection files | UTF-8 JSON objects containing collection ID/version, scope, sampling policy, and unique case references. No copied annotations or predictions. |
| Split files | UTF-8 JSON objects listing case IDs and source-group IDs assigned to that split. |
| `checksums.sha256` | SHA-256 digest plus relative path for every released file except the checksum file itself. Covers audio and annotations. |
| Markdown files | Human-readable scope, license, review, validation, and release records. |

Retain original source properties in provenance. Any channel conversion, resampling, crop, gain change, or quantization used to make the canonical WAV must be documented, with the source digest and conversion recipe/version. Do not normalize away quiet recordings or clipping silently. Original masters may remain in a separately identified archive; the canonical WAV defines what is evaluated.

PCM channel samples are delivered to the Engine in their stored order. A future loader must neither resample the canonical WAV again nor introduce a time shift. Float decoding uses signed sample value divided by 8,388,608. Record the decoder/version used for each benchmark run outside the ground-truth release.

### Naming convention

- Dataset ID: `cle-ground-truth`; release directory: semantic version, initially `0.1.0`.
- Collection IDs: `cle-gt-pitch`, `cle-gt-melody`, `cle-gt-rhythm`, `cle-gt-harmony`, `cle-gt-confidence`.
- Case IDs: `cle-<origin>-<six-digit-sequence>`, such as `cle-syn-000001` or `cle-rec-000001`. Origin is `syn` for synthetic and `rec` for recorded. IDs are immutable and never reused.
- Annotation references: `<case-id>/<domain>/<six-digit-index>`, stored only in the annotation sidecar.
- Relative paths use lowercase ASCII, digits, hyphens, and forward slashes. No spaces, absolute paths, or parent-directory traversal.
- Identifiers do not encode genre, pitch, split, score, or correctness. These are metadata and can evolve without renaming a case.
- Benchmark identity is dataset ID + release version + case ID. Case membership in several collections must not cause duplicate counting within a confidence collection.

## 3. Shared metadata and annotation semantics

### Release metadata

Required fields: dataset ID, title, release version, schema version, description, creation date, maintainers, rights summary, case count, collection index, split assignments, sampling policy/version, annotation guideline/version, evaluation profile/version, and SHA-256 file inventory.

The evaluation profile records the actual settings used for comparison: 50-cent pitch tolerance; 25-ms frame alignment; 50-ms onset tolerance; offset tolerance of the larger of 50 ms or 20% of reference duration; 70-ms beat tolerance; 500-ms key-transition tolerance; 2-BPM tempo-correctness tolerance; and ten confidence bins. These are the existing v0.1 defaults, not newly introduced behavior. Record any separately selected profile under a different profile ID; do not change truth to make a profile pass.

### Case metadata

| Field group | Required contents |
| --- | --- |
| Identity | Case ID; case revision; source ID; source-group ID; audio and truth relative paths and digests. |
| Audio | Sample rate; channel count and meaning; frame count per channel; duration derived from frame count / sample rate; source start/end samples; transformation history. |
| Provenance | Synthetic recipe/parameters/seed if applicable, or recording/session/work/performer identifiers; acquisition method/date; original file digest. |
| Rights | Source license or permission reference; annotation license; redistribution restrictions. A distributable release requires appropriate rights for both. |
| Content | Origin; content category; genre if applicable; instrument/voice; mono/polyphonic texture; target source; tuning reference; intended pitch/tempo ranges; acoustic conditions. Unknown metadata is explicitly unknown, not inferred from Engine results. |
| Annotation | Available domains; per-domain status; annotated coverage; exclusions/reasons; guideline version; annotator/reviewer identifiers; adjudication reference. |
| Selection | Split; source-group membership; selection stratum; selection method; inclusion probability when known; synthetic/recorded flag. |

Related crops, stems, transpositions, mixes, renders, performers/sessions where applicable, and alternate versions of a musical work must be grouped conservatively to avoid cross-split leakage. For synthesis, use the musical template and recipe family, not an individual render seed, as the starting group. Record why groups are independent.

### Common time and missingness rules

Time zero is the first stored sample. All scoring times are finite nonnegative seconds relative to that point. Intervals are **start inclusive, end exclusive**. No event starts at or after audio duration; interval endpoints may equal duration. Store authoritative boundary anchors as integer sample indices in `annotations.json`. Derive scoring seconds from those indices without millisecond rounding; serialize sufficient precision to round-trip to the same sample (absolute discrepancy less than half a sample).

Truth represents the rendered or recorded audio, not merely a score or MIDI instruction. Known synthesis parameters need independent verification that rendering preserves pitch, timing, and channel alignment. Recorded annotations use listening and reference tools independent of Engine output. Annotators and reviewers must not see the Engine prediction or confidence for the case before adjudication.

| Representation | Meaning |
| --- | --- |
| Omitted domain | Not annotated or not eligible; never interpreted as absent musical content. |
| Empty note or beat array | Entire case reviewed; no target notes or beats exist. Do not use for unknown labels. |
| Pitch `midi: null` | Reviewed unvoiced sample, including silence or nonperiodic sound. |
| Chord/key `label: null` | Explicitly reviewed absence of a supported chord/key. Not uncertainty or an out-of-vocabulary label. |
| Rhythm `bpm: null` | No reference scalar BPM is scored. Metadata distinguishes no pulse, variable tempo, and unresolved tempo. Beats still require complete annotation if rhythm is included. |
| Unknown/ambiguous region | Recorded in the sidecar; never coerced to unvoiced, no chord, or a negative event label. |

Per-domain status is `draft`, `reviewed`, `adjudicated`, or `excluded`. Primary release cases require adjudicated truth for each scored domain. Annotation uncertainty is stored separately as `exact` or a boundary uncertainty interval plus disagreement notes. It is never stored as Engine-style `confidence`, never used as a target probability, and never passed to the evaluator as a weight.

Only fully annotated cases enter the v0.1 primary collections. Retain ambiguous or partially labeled material in an explicitly excluded archive, or make a newly identified, independently reviewed crop with complete labels. The current evaluator has no general unknown-region mask; this specification does not add one. Do not remove difficult but resolvable material; report exclusion counts and reasons.

## 4. Pitch dataset

**Purpose:** pitch identity, cent error, octave errors, and voiced/unvoiced detection.

**Ground truth and file format:** `truth.json` contains a `pitch` array. Each frame has `time` in seconds and `midi`, a finite fractional MIDI value or null. At 440 Hz the MIDI value is 69; convert independently measured fundamental frequency using 69 + 12 × log₂(frequency / 440). Do not round to semitones. Optional reference frequency in Hz belongs in the sidecar; if present it must agree with MIDI to serialization precision. No truth confidence field.

**Annotation format:** a complete 10-ms grid anchored at sample 0: every 480 samples while the sample index is strictly less than frame count. Each entry describes the target's instantaneous/reference fundamental at that time. Boundary ownership follows the half-open interval rule. The sidecar records target identity, reference measurement method, and voicing decisions. Polyphonic cases require a designated source with separately verified reference truth; mixtures without a resolvable target are outside the primary collection.

**Metadata:** shared fields plus target source, tuning reference, reference-F0 method, pitch span, vibrato/glide descriptors, voiced proportion, instrument/voice family, SNR if independently known, and accompaniment relationship.

**Sampling rules:** proposed seed inventory of at least 60 cases from at least 30 source groups, generally 2–12 seconds. Include low/mid/high target registers, detuned tones, sustained notes, vibrato, glides, voiced boundaries, competing harmonics, quiet signals, and explicit silence/noise negatives. Select pitch and difficulty strata before running the Engine. Declare material outside the current Engine's operating range separately rather than silently excluding its failures. Include both synthetic and recorded cases, with at least 20 recorded source groups for any claim about recordings.

**Validation rules:** exact grid completeness; strictly increasing unique times; legal sample bounds; positive finite reference Hz when voiced; agreement of Hz/MIDI; independently reviewed voicing; no Engine-derived labels. Synthetic harmonic tests must distinguish oscillator fundamental from the loudest overtone. Do not shorten truth coverage to match missing Engine frames.

**Versioning:** timing, pitch, or voicing corrections create a new immutable patch release and affected case revision. Grid or voicing-definition changes are a breaking schema/protocol change.

**Future expansion:** additional sample-rate assets as linked cases; singing/speech strata; extended register; polyphonic multi-F0 truth with explicit source identities. These must not be flattened into the current single-target representation.

## 5. Melody dataset

**Purpose:** note precision/recall, onset/offset error, note-path continuity, and fragmentation.

**Ground truth and file format:** `truth.json` contains a `melody` array of objects with `start`, `end`, and fractional `midi`. Records are sorted by start. Empty means a reviewed negative case.

**Annotation format:** one record per intended audible note event of a designated melody source. Annotate onset at the audible attack/pitch establishment, and offset at the end of the target note's audible pitched body; reverb-only tails are excluded. Record ambiguous attacks/releases as boundary intervals in the sidecar and adjudicate a single anchor. A repeated same-pitch articulation remains a new note. Vibrato does not create new notes. Rests remain gaps. For stable notes, reference pitch is the adjudicated central pitch, not an Engine estimate. Continuous glissandi without agreed note identities are eligible for pitch but excluded from note metrics in v0.1.

**Metadata:** shared fields plus melody source, instrument, articulation, note count, register, note-duration distribution, repeated-note count, rest coverage, accompaniment, and annotation-boundary convention.

**Sampling rules:** at least 60 cases / 30 source groups, usually 5–20 seconds. Include repeated pitches, short/long notes, rests, legato/staccato, vibrato, register jumps, and simple accompaniment. At least half the positive cases contain three or more notes so continuity is observable. Include silence/nonmelodic negatives. Reuse pitch cases where appropriate, preserving their source groups and split. The first release evaluates one target voice per case.

**Validation rules:** finite pitch; strictly positive duration; sample-aligned boundaries; no duplicates; no overlapping target notes for the primary monophonic collection. Review that every audible target note is represented and rests contain no target notes. Boundary uncertainty over 20 ms requires adjudication or exclusion from the primary note collection, with the exclusion reported. A score/MIDI file alone is insufficient proof of acoustic timing.

**Versioning:** corrected note segmentation, articulation, or pitch creates a patch release with a case revision. Changing what counts as a note, onset, or offset is a breaking annotation-protocol change.

**Future expansion:** ornamentation, portamento conventions, multiple melody voices, source-to-track identity, and aligned notation. Polyphonic note overlap needs a separately defined track-aware profile.

## 6. Rhythm dataset

**Purpose:** tempo error, beat detection, and beat timing.

**Ground truth and file format:** `truth.json` contains `rhythm` with `bpm` and a sorted `beats` array of times in seconds. For the primary positive set, BPM is a finite positive constant describing the annotated pulse level, and every beat in the case is labeled. Negative cases use null BPM and an empty beat list after review.

**Annotation format:** beat times mark the perceived/constructed reference pulse, not every acoustic onset. The sidecar records beat ordinal, pulse level (for example quarter-note), meter if known, and sample anchor. There is no downbeat or meter field passed to evaluation. For exact synthetic clicks, use the authored pulse anchor and verify the renderer; for recordings, two listeners independently tap/mark beats and adjudicate. Half/double tempo is a label decision made before evaluation, not a post-hoc equivalent answer.

**Metadata:** shared fields plus reference BPM, BPM derivation method, pulse level, meter, groove/swing, onset-to-beat relationship, duration, pulse regularity, and beat-boundary uncertainty.

**Sampling rules:** at least 60 cases / 30 source groups; positives generally 8–30 seconds with at least 12 beats. Cover slow, medium, and fast tempi; varied beat phase relative to time zero; straight/swing; syncopation; sparse pulse; and different percussion timbres. Include at least ten no-pulse cases. Constant-tempo references are the primary v0.1 profile. Do not select or realign cases to fit the Engine's detected beat grid.

**Validation rules:** positive BPM; unique increasing beat times within duration; known pulse-level choice; complete labeling including quiet beats. For exact synthetic constant-tempo positives, expected interval is 60/BPM and anchor differences agree to within one sample after quantization. For recordings, preserve performance timing rather than forcing a perfect grid; document nominal tempo estimation. Beat-boundary uncertainty above 20 ms or unresolved metrical level requires adjudication or primary-set exclusion.

**Versioning:** corrected beat anchors or BPM create a patch release. Changing pulse-level convention or introducing tempo curves is a breaking annotation schema/protocol change.

**Future expansion:** expressive tempo maps, rubato, meter/downbeats, polyrhythm, multiple valid pulse interpretations. Variable-tempo assets may later support beat-only scoring with null scalar BPM under a separately identified profile; do not assign an arbitrary average BPM now.

## 7. Harmony dataset

**Purpose:** chord/top-2 accuracy, chord confusion, tonal-center accuracy, and key-transition accuracy.

**Ground truth and file format:** `truth.json` contains `harmony` with `chords` and `keys`, each an ordered array of `{start, end, label}` records. Both tracks cover the entire case in the primary collection. Non-null labels are exactly `rootPitchClass:major` or `rootPitchClass:minor`, with integer roots 0–11 (C = 0). Use the same canonical labels as the existing Engine adapter. Ground truth contains one adjudicated label, never `top2`; ranked candidates belong to predictions.

**Annotation format:** chord boundaries mark audible harmonic changes; inversions keep the same root/quality. Adjacent identical labels are merged. Key describes tonal center, not the current chord root. Record harmonic rationale, score/reference support, alternative interpretations, and boundary uncertainty in the sidecar. Explicit absence may use null; ambiguous or unsupported seventh/suspended/extended harmony is not automatically a major/minor triad or no chord.

**Metadata:** shared fields plus chord/key vocabulary, chord inventory, inversions, progression identity, key sequence, modulation count, transition type, tuning, instrumentation, and annotator agreement.

**Sampling rules:** at least 60 cases / 30 source groups, generally 12–40 seconds. Include at least one positively reviewed example of each of the 24 triad labels and each of the 24 key labels; record that sparse label coverage is not enough for precise per-label accuracy claims. Cover inversions, same-key chord changes, and at least 12 clearly localized key-change cases plus 12 stable-key cases. Use several chords and sufficient context when asserting a key; a lone major/minor triad does not establish a uniquely correct tonal center. Include reviewed no-chord/no-key material separately.

**Validation rules:** positive nonoverlapping half-open intervals; canonical labels; exact adjacency and full coverage from 0 to audio duration; merged identical neighbors. Independent harmonic review must establish key separately from chord. Reference transitions derive from adjacent differing key labels. Diffuse modulations without an agreed single boundary are excluded from transition benchmarks rather than forced into precision the annotation cannot support. Chord-boundary uncertainty above 50 ms or key-boundary uncertainty above 200 ms requires adjudication or exclusion from the primary collection.

**Existing compatibility limit:** do not load chord-only truth with `keys: []` and call resulting key metrics valid. The combined evaluator can count predicted transitions against that empty reference. Partially annotated harmony therefore remains archival in v0.1. This restriction requires no evaluation change. Explicit no-key intervals and unknown key regions remain different concepts.

**Versioning:** corrected labels/boundaries create a patch release. Vocabulary, key-identity, or boundary-definition changes are breaking schema/protocol changes. Never silently simplify old labels to a new vocabulary.

**Future expansion:** jazz/extended chords, modal centers, ambiguous keys, local tonicizations, tuning systems, soft reference distributions, and partially annotated domain views. Each requires an explicit compatibility profile before scoring.

## 8. Confidence dataset

**Purpose:** assess whether the confidence attached to an emitted claim agrees with its observed correctness, using the existing reliability curve, ECE, MCE, Brier score, and binary NLL.

**Ground truth and file format:** `collections/confidence.json` references adjudicated cases from the four musical domains and identifies which domains are eligible. It contains no target Engine confidence, no fabricated correctness labels, and no desired reliability histogram. Musical truth remains in each case's immutable `truth.json`.

**Annotation format:** independent musical annotations establish truth. Correctness is derived only after a specific Engine version produces predictions, using the pinned evaluation profile. Binary correctness and prediction confidence are run artifacts, not reusable ground truth. Annotation uncertainty never substitutes for Engine confidence. Reference notes/chords do not receive probability 1 merely because annotators agree.

| Claim domain | Correctness source and current evaluation weighting |
| --- | --- |
| Pitch | Emitted voiced pitch within the pinned cents tolerance at a reference frame; unit weight per scored reference frame. |
| Melody | Predicted note receives a full one-to-one note match; unit weight per predicted note. |
| Tempo | Predicted scalar BPM is within the pinned BPM tolerance; one claim per eligible case. |
| Chords | Accepted chord label agrees with reference; duration weight. Candidate ranks are not confidence. |
| Keys | Emitted key label agrees with reference; duration weight. |

Missing predictions, unvoiced pitch states, beat strength, and unsupported no-chord abstention confidence are not assigned invented confidence observations. Read calibration alongside accuracy, recall, and coverage; abstaining more must not be described as stronger calibration evidence. Reuse the existing domain-separated calculations. No combined musical-probability score is defined.

**Metadata:** shared fields plus confidence-cohort ID/version, target population and exclusions, inclusion policy/probability, eligible domains, partition role, source groups, and links to musical truth. A separate run record identifies Engine/evaluator versions, profile, dataset checksum, and resulting claim support; it must not edit this release.

**Sampling rules:** distinguish two frozen views. A **diagnostic view** uses the balanced challenge collections; conclusions apply to that constructed mix. A **population view** selects recordings uniformly by source group and a prespecified crop procedure from a declared source registry; conclusions apply only to that registry and crop distribution. Synthetic material is a separate view. Never select cases by Engine confidence, observed errors, or a wish to fill a confidence bin. Do not pool the views or silently add importance weights the current evaluator does not support.

A population confidence collection needs at least 50 independently grouped recordings eligible for each domain claimed. Cases may overlap domains. This is a pilot support floor, not a statistical guarantee. Report source-group counts as well as frames/events and duration. Empty/sparse confidence bins stay empty/sparse. In particular, do not claim that 0.80 is well calibrated merely because eight out of ten correlated frames are correct. The existing runner reports per-case calibration; population-wide aggregation or uncertainty intervals are not promised by this design and would require separate authorization if unavailable.

**Validation rules:** frozen cohort before evaluation; musical truth blind to predictions; disjoint source groups across development/calibration/test; no duplicate case references; correct per-domain eligibility; absent/uncertain annotation not treated as incorrect prediction. Any derived observation must trace to case, truth release, prediction, domain, and profile. Recompute correctness for each Engine version rather than reusing an old run's binary labels.

**Versioning:** membership/selection changes create a new collection release. Corrected underlying truth pins a new dependency and collection patch. Changes to the target population or correctness semantics require a new profile/version. Predictions are versioned separately from datasets.

**Future expansion:** larger independent cohorts, speaker/instrument/genre subgroups, group-based uncertainty estimates, selective prediction, and multiclass calibration. A partition named `calibration` reserves data for a possible future study; it does not authorize fitting, applying, or changing Engine confidence.

## 9. Shared selection, review, and release rules

The inventory numbers above are acquisition targets, not completed assets. Do not claim a v0.1 release meets them until the manifest demonstrates coverage. A smaller illustrative release must be labeled `example` or `pilot`, with unmet targets listed.

1. Define source registry, domain scope, quotas, exclusions, and crop procedure before observing Engine results. Choose crops from deterministic sample anchors recorded in metadata; no adaptive cherry-picking.
2. Assign related source groups to development/calibration/test in approximately 60/20/20 proportions, stratified where possible. Freeze the assignment and selection seed/method. Counts are group counts; rounding is disclosed. A locked test set cannot be mined repeatedly to redesign the same benchmark while retaining its identity.
3. Perform primary annotation and independent review. Resolve disagreements in the adjudication log without Engine output. A missing reviewer or unresolved label keeps a case out of primary scoring.
4. Validate files, dimensions, digests, rights, sample bounds, domain schemas, and annotation rules. Cross-check pitch versus note identity only on applicable stable note interiors; do not require instantaneous vibrato pitch to equal the note center.
5. Audit coverage by origin, domain, label, difficulty, source group, and split. Record negative examples, exclusions, and underrepresented strata. No pass/fail rule depends on the Engine's score.
6. Freeze the bytes, publish the manifest and validation record, and pin release/version in every result. Keep all Engine outputs outside ground-truth case folders.

The split names organize possible studies; this task authorizes no training, calibration, or Engine modification. Held-out benchmark results measure the selected material only. A small synthetic or balanced challenge set must not be presented as population performance.

## 10. Versioning and expansion

Schema version, annotation guideline version, collection release, case revision, and evaluation profile are separate identifiers.

| Change | Required treatment |
| --- | --- |
| Typo, provenance clarification, or corrected annotation | New immutable patch release; semantic label changes also increment case revision and enumerate affected metrics/cases. Never overwrite a published file. |
| Added cases or a new compatible collection | New minor dataset release; freeze a new manifest and membership list. Retain old cases and splits unless the release explicitly describes a new study. |
| Changed audio, crop, synthesis parameters, or processing | New case ID linked to its parent/source group; new dataset release. |
| Changed truth meaning, schema, grid, ontology, or sampling population | New incompatible specification/profile; during 0.x, advance the specification minor version and identify the break explicitly. |
| Different Engine or evaluator build | New run identity, not a truth edit. |
| Detected leakage or invalid labels | Publish an erratum and superseding release; invalidate affected comparisons explicitly. |

Future Classical, Jazz, Speech, Single Instrument, Polyphonic, and Synthetic collections reuse source IDs, provenance, rights, and immutable case references. Genre expansion can be compatible; representational expansion may not be. For example, speech can provide pitch truth without invented melody/chord labels, while jazz seventh chords require a new vocabulary profile and polyphony requires designated voices or a future multi-source schema.

Reproducing a result requires the same dataset bytes, case membership, split, Engine build, evaluator build, and evaluation profile. Evaluation remains a reader of those inputs and a producer of measurements only.
