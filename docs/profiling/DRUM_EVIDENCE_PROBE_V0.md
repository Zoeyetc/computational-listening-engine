# Drum Evidence Probe v0

Drum v0 is an internal evidence probe over the existing Percussion implementation. It does not add a classifier, change ListeningMap behavior, create a temporal Drum path, or expose a package-root API.

## Existing Percussion architecture

Percussive events originate in the shared general-analysis frame stream. The Engine downmixes PCM, applies a 2048-sample Hann-windowed FFT every 1024 samples, and computes positive spectral difference, RMS, spectral energy bands, centroid, spread, and flatness. Rhythm and Percussion receive separate projections of these shared frames; neither depends on the other.

Percussion first finds local onset peaks. A candidate must be after frame zero, have normalized onset strength at least `max(0.2, local eight-frame onset mean * 1.35 + 0.06)`, be at least as strong as the adjacent frames, and have normalized RMS of at least `0.025`. Candidates in the final 300 ms are excluded because their decay is incomplete.

For each remaining candidate, the analyzer derives unit-energy ratios for 20–160 Hz, 160–600 Hz, 600–2500 Hz, 2500–8000 Hz, and the remaining band to Nyquist. It retains normalized centroid, spread, flatness, onset, RMS, decay duration, decay, and low/high persistence. A long stable pitched body is rejected before classification unless sustained high-frequency evidence can represent an open hat or cymbal.

The classifier is deterministic and heuristic. It computes comparable named scores for `kick`, `snare`, `closed-hat`, `open-hat`, and `tom`. The formulas use weighted spectral ratios, centroid, flatness, duration, and persistence. It then calculates the top named score, second named score, margin, transient quality, consistency, and a non-calibrated confidence. `other-percussion` is an ambiguity fallback when evidence is mixed, the named margin is below `0.075`, or the top named score is below `0.38`; its support is not treated by the probe as a sixth calibrated class probability.

| Named score | Existing rule inputs |
| --- | --- |
| Kick | `0.52 sub + 0.18 low persistence + 0.16 low centroid + 0.14 shortness` |
| Snare | `0.22 mid + 0.18 high + 0.34 flatness + 0.12 broadband + 0.14 shortness + 0.18 centroid`, plus `0.18` for the existing high-flatness/mid/low-mid condition |
| Closed hat | `0.45 high+air + 0.23 centroid + 0.20 shortness + 0.12 low high-band persistence`, attenuated by flatness |
| Open hat | `0.38 high+air + 0.20 centroid + 0.25 sustained duration + 0.17 high-band persistence`, attenuated more strongly by flatness |
| Tom | `0.42 low-mid + 0.20 mid + 0.16 low-band sum + 0.14 low flatness + 0.08 low-band persistence` |

The event confidence combines `0.38 top score`, `0.56 margin`, `0.20 transient quality`, and `0.14 consistency`, then clamps to `[0,1]`; it is evidence strength, not a calibrated class probability. Public hit strength is a separate physical-intensity value: `0.5 onset + 0.3 RMS + 0.2 sqrt(onset * RMS)`. Track confidence is the mean accepted-event confidence.

The fixed thresholds are onset `0.2`, event confidence `0.34`, and track capability confidence `0.42`. Per-role refractory periods are 75 ms kick, 65 ms snare, 35 ms closed hat, 80 ms open hat, 75 ms tom, and 50 ms other percussion, with an additional 30 ms global event separation. Track capability requires at least three accepted events spanning 500 ms, mean confidence at least `0.42`, and density no greater than 28 events/second.

This is an event-level rule system. Its only temporal state is the local onset baseline, a decay/persistence window of at most 24 frames, and refractory timestamps inside one analysis. It has no learned model, source separation, dynamic program, HMM, retained rolling Drum state, or cross-analysis revision history.

## Evidence retained and discarded before v0

Accepted public `PercussionHit` values already retain time, selected label, physical strength, classifier confidence, top named score, second named score, margin, and all acoustic descriptors. `PercussionAnalysis` retains candidate and accepted counts, per-class counts, density, aggregate confidence, thresholds, bands, and refractory policy.

Before this probe, the full named score vector, ambiguity reasons, and every rejected onset candidate were discarded. The map did not reveal candidates excluded by the right-edge guard, sustained non-percussive rule, insufficient confidence, or refractory policy. `candidateCount` was the only surviving evidence that those candidates had existed.

Honest named-class competition therefore already existed, but was only partially retained. The probe exposes those five scores and keeps `other-percussion` separate as ambiguity fallback evidence.

## Internal v0 contract

`probeDrumEvidence` runs the normal full analysis while collecting evidence from the same Percussion pass. Each onset candidate contains:

- time, source frame, RMS, onset strength, local baseline, and actual onset threshold;
- the existing descriptor vector where production reached descriptor extraction;
- five ranked named hypotheses with the exact existing scores;
- separate ambiguity-fallback support and reasons when production chose `other-percussion`;
- the production disposition, role, confidence, margin, and accepted event ID;
- a Drum decision of `SELECTED`, `ABSTAINED`, or `REJECTED`.

The probe selects only an accepted named class. Accepted `other-percussion` becomes `ABSTAINED / AMBIGUOUS_CLASS_EVIDENCE`. Below-threshold classified evidence becomes `ABSTAINED / INSUFFICIENT_EVIDENCE`. Sustained non-percussive candidates, incomplete right-edge candidates, and refractory duplicates are explicit rejections. No candidate means no event record and an onset candidate count of zero.

This representation is in `src/experiments` and is removed from the npm build. The shared trace seam is not exported from the package root.

## Controlled observations

The fixtures are deterministic synthetic proxies. They establish code paths and cross-domain behavior; they do not establish real-world drum-classification accuracy. In particular, the piano, bass, cymbal, and mixed fixtures omit microphone, room, articulation, and production variability.

The table reports the representative Drum-event time, total retained Melody candidates across the input, global track availability, existing Percussion accepted labels, and Drum candidate outcomes as selected/abstained/rejected.

| Input | Observed pitch | Melody candidates / track | Bass at probe time | Rhythm | Existing Percussion | Drum v0 S/A/R |
| --- | --- | --- | --- | --- | --- | --- |
| Kick solo | 79.73 Hz, below Melody range | 1 range-rejected candidate; unavailable | unavailable | unavailable | kick event; track unavailable | 1 / 0 / 2 |
| Snare solo | none | 32 retained; unavailable | unavailable | unavailable | snare event; track unavailable | 1 / 0 / 2 |
| Hat/cymbal solo | none | 60 retained; unavailable | 100.00 Hz selected | unavailable | other-percussion, closed-hat; track unavailable | 1 / 1 / 1 |
| Tom solo | none at event lookup | 14 retained; unavailable | unavailable | unavailable | tom event; track unavailable | 1 / 0 / 1 |
| Full drum solo | 230.04 Hz | 591 retained; Melody available | unavailable at representative event | 130.5 BPM | 14 events; track available | 8 / 6 / 3 |
| Piano melody | 261.69 Hz | 891 retained; Melody available | 84.16 Hz selected | 119.5 BPM | no events | 0 / 0 / 12 |
| Bass line | 82.42 Hz | 241 retained; Melody available | 84.93 Hz selected | 121 BPM | no events | 0 / 0 / 11 |
| Piano + drums | 259.55 Hz | 771 retained; Melody available | 98.07 Hz selected | 130.5 BPM | 12 events, mostly other-percussion; track unavailable | 1 / 11 / 12 |

The gated Tom fixture is the requested overlap case: resonant acoustic frames contain 14 Melody candidates, Melody does not establish an available track, and Drum selects tom. The full-drum fixture demonstrates the other valid outcome: a 230 Hz tom resonance survives as an active Melody while Drum and Rhythm remain independently available. The probe does not suppress either interpretation.

The piano and bass controls generate strong regular onset evidence, so Rhythm reports approximately 120 BPM. Percussion accepts no event and Drum makes no named selection because the existing sustained-pitched-body rule rejects the candidates. This demonstrates the current Rhythm/Drum boundary. In the piano-plus-drums mixture, class evidence degrades sharply: Drum selects one snare, abstains on eleven ambiguous candidates, and rejects twelve. This is evidence for caution on mixtures, not proof of robust transcription.

## Performance and retained state

Twelve measured probe runs followed one warm-up per fixture. The incremental timing covers trace construction plus Drum-contract assembly and excludes the existing FFT, feature extraction, descriptors, classifier, and other full-analysis work. These sub-0.1 ms measurements are close to timer noise and should be treated as scale estimates.

| Input | Incremental median / p95 | Median per candidate | Median per general frame | Numeric payload |
| --- | ---: | ---: | ---: | ---: |
| Kick solo | 0.009 / 0.027 ms | 0.002889 ms | 0.000184 ms | 704 B |
| Snare solo | 0.007 / 0.008 ms | 0.002236 ms | 0.000143 ms | 816 B |
| Hat/cymbal solo | 0.008 / 0.011 ms | 0.002723 ms | 0.000174 ms | 824 B |
| Tom solo | 0.004 / 0.006 ms | 0.001979 ms | 0.000084 ms | 544 B |
| Full drum solo | 0.024 / 0.030 ms | 0.001431 ms | 0.000129 ms | 4,224 B |
| Piano melody | 0.011 / 0.012 ms | 0.000903 ms | 0.000058 ms | 1,808 B |
| Bass line | 0.009 / 0.018 ms | 0.000807 ms | 0.000047 ms | 1,648 B |
| Piano + drums | 0.027 / 0.031 ms | 0.001125 ms | 0.000144 ms | 4,824 B |

Numeric payload excludes JavaScript object, array, and string overhead. The probe retains no state after the returned result is released. It reuses the existing normalized general frames, descriptors, and classifier pass and duplicates no FFT, transient, or spectral computation.

## Finding and recommendation

No temporal Drum solver is required to expose the present evidence honestly. The existing short decay/persistence window is required for open/closed and sustained-body decisions, and refractory state is required for event deduplication, but neither justifies a retained 12-second Drum path.

The evidence model is strong enough to proceed to a gated Drum v1 design, provided the next gate uses annotated real kick, snare, hat/cymbal, tom, pitched-instrument, and mixed recordings. The high ambiguity rate in the synthetic piano-plus-drums mixture should be measured before any public API or UI integration. A new classifier or source-separation foundation is not justified by v0 alone, and v0 makes no accuracy or novelty claim.
