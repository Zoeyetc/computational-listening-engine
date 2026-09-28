# Drum Evidence v1

Status: **EXPERIMENTAL** and **UNCALIBRATED**.

Drum Evidence v1 exposes how the existing deterministic Percussion pass forms an event-level interpretation. It preserves the named hypotheses, their competition, the decision, and the decision reason. It does not change candidate detection, gates, class weights, thresholds, refractory policy, public Percussion events, or any other listening domain.

## Purpose and boundary

The contract lets a consumer inspect whether the Engine selected a named class, abstained from naming an accepted percussive event, or rejected an opportunity. It is an additive `ListeningMap.drumEvidence` sibling to `percussionAnalysis`; the established `ListeningMap.percussion` and `PercussionAnalysis` projections remain unchanged.

Production evidence is assembled during the normal Percussion pass from the same normalized general-analysis frames. It does not run a second classifier or duplicate FFT/transient analysis. Human annotation matching, weak section labels, reconstructed candidates, counterfactual gate bypass, and research reports remain outside production and the npm artifact.

## Taxonomy

The five named hypotheses are:

- `kick`
- `snare`
- `closed-hat`
- `open-hat`
- `tom`

When classification occurs, `DrumClassifierEvidence.hypotheses` contains all five, sorted by comparative score with ranks 1 through 5. A score is a bounded heuristic value used to compare these five rules for the same candidate. It is not a probability, likelihood, accuracy estimate, or certainty percentage.

`other-percussion` is not a sixth hypothesis. It is the ambiguity fallback for an accepted physical event whose named-class evidence does not justify a named selection.

## Contract shape

`DrumEvidence` is a status union:

- `UNAVAILABLE`: Drum analysis was not run. The current PCM analyzers run Drum analysis, so this state primarily gives other or future map producers an explicit representation. A missing or null additive field also means the producer did not provide Drum Evidence v1.
- `NO_EVENT`: analysis ran, but no percussive onset candidate entered the decision pass.
- `OBSERVED`: at least one candidate entered the decision pass. Its `attempts` tuple is non-empty.

Every status separately exposes `trackCapability`. A snapshot may contain inspectable attempts while the established Percussion capability remains unavailable because its event count, span, aggregate evidence, or density requirements were not met. Track capability therefore does not erase event-level evidence.

Each observed attempt contains:

- a deterministic snapshot-scoped attempt ID;
- event time and source frame index;
- normalized RMS, normalized onset strength, local onset baseline, and applied onset threshold;
- one discriminated decision.

## Decisions

### `SELECTED`

`SELECTED / NAMED_CLASS_ACCEPTED` contains the selected named class, all five ranked hypotheses, comparison summaries, uncalibrated classifier diagnostics, normalized physical event strength, and the corresponding `PercussionAnalysis.events` ID.

### `ABSTAINED`

`ABSTAINED / AMBIGUOUS_CLASS_EVIDENCE` means a physical percussion event was accepted into `PercussionAnalysis.events` as the existing `other-percussion` fallback, but no named class was justified. It contains the ambiguity reasons, all five named hypotheses, physical event strength, and Percussion event ID. It has no fabricated selected class. Whether the track-level `ListeningMap.percussion` projection is available remains explicit in `trackCapability`.

`ABSTAINED / INSUFFICIENT_EVIDENCE` means classification occurred but the existing acceptance requirements were not met. It retains the classifier evidence that existed at that boundary, but has no selected class, Percussion event ID, or accepted-event strength.

### `REJECTED`

`REJECTED / NON_PERCUSSIVE_SUSTAINED` and `REJECTED / INCOMPLETE_RIGHT_EDGE` happen before classification. Their contract variants cannot contain class hypotheses or classifier evidence.

`REJECTED / TEMPORAL_DEDUPLICATION` happens after classification. It retains the existing classifier evidence but has no selected class or Percussion event ID.

An incomplete right-edge candidate is an observed and rejected opportunity. It is not `NO_EVENT`, because the candidate existed, and it is not `UNAVAILABLE`, because analysis ran.

## Physical strength and classifier evidence

`physicalEventStrength` is the existing normalized event-intensity value based on onset strength and RMS. It describes the accepted acoustic event. It is not class evidence.

`uncalibratedConfidence`, `transientQuality`, `consistency`, the five comparative scores, and the top/second/margin summaries are deterministic classifier diagnostics in the range 0 through 1. Their bounded range does not make them probabilities. `calibration: "UNCALIBRATED"` is part of both the enclosing contract and classifier evidence.

## Descriptor exposure

V1 exposes only the acoustic quantities needed to identify the onset opportunity and understand its adaptive threshold: RMS, onset strength, local baseline, and applied threshold. It does not duplicate detailed band ratios, spectral centroid/spread/flatness, duration/decay, or low/high persistence into the new Drum contract. The pre-existing optional `PercussionHit.descriptors` compatibility surface remains unchanged, and internal traces retain those values for developer diagnostics.

Those detailed descriptors are useful for classifier and gate research, but exposing them would enlarge the production contract without giving a stable end-user meaning. Rejection reasons communicate the current production boundary without publishing every internal float. Counterfactual scores are never included.

## FILE lifecycle

Every valid FILE PCM analysis runs the existing Percussion pass once and returns either `NO_EVENT` or `OBSERVED`. Attempt times are relative to the analyzed file, and `analyzedWindow` is `[0, duration]`. Accepted Drum decisions reference the unchanged `PercussionAnalysis.events` IDs. Existing Melody, Bass, Rhythm, Harmony, Tonal Center, and Structure computation remains independent.

## Rolling/LIVE lifecycle

Rolling analysis uses the same Percussion computation as FILE analysis over the bounded PCM snapshot. The rolling mapper shifts attempt times and `analyzedWindow` into session time and aligns `trackCapability` with the rolling readiness/capability result.

`drumEvidence` is a bounded snapshot, not a stream of newly published decisions. A previously observed attempt may remain visible in successive snapshots. The existing `RollingListeningUpdate.events` channel remains the publication stream and retains its existing deduplication; Drum Evidence adds no new event type and does not republish rejected or abstained attempts there. Accepted decisions carry the existing `PercussionAnalysis.events` ID. Attempt IDs and source-frame indices are snapshot-scoped because the general rolling frame grid is currently rebuilt from each bounded PCM snapshot.

No Drum evidence is retained beyond the existing rolling history, and no temporal Drum solver or cross-update Drum state is introduced.

## Known limitations

The current classifier is a deterministic heuristic baseline:

- Kick/Tom discrimination was unstable in the tested real-audio material.
- Snare section-level correspondence was poor.
- Hi-hat class correspondence was weak.
- The sustained/non-percussive gate is conservative and rejects some useful kick evidence.
- That gate also protects strongly against piano and bass false positives; a blanket bypass is not supported.
- Mixed audio remains difficult.
- The small human-onset study contained likely duplicate taps and does not establish general onset recall.
- No general class accuracy has been established.
- No score or confidence value is calibrated as a probability.

Drum Evidence v1 does not claim source separation, arbitrary polyphonic Drum tracking, a temporal Drum path, event-level accuracy, or semantic-version stability beyond the package's normal policy for this explicitly experimental addition.

## Consumer guidance

An inspection UI should render the decision state first, then the reason. It may show the ranked named hypotheses and comparison margin only when classifier evidence exists. It should label classifier diagnostics as uncalibrated evidence and display physical strength separately. It should never turn `other-percussion` into a selected named class or infer missing hypotheses for a pre-classification rejection.
