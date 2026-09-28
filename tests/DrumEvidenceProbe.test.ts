import assert from 'node:assert/strict';
import test from 'node:test';
import * as engine from '../src/index.ts';
import { classifyPercussion } from '../src/analysis/PercussionAnalysis.ts';
import { probeDrumEvidence } from '../src/experiments/DrumEvidenceProbe.ts';
import { analyzeBassFromMelodyEvidence } from '../src/bass/BassAnalysis.ts';
import { readCompactMelodyEvidenceStorage } from '../src/melody-evidence/compactTimeline.ts';
import { ambiguousClap } from './percussionFixtures.ts';
import {
  DRUM_PROBE_CONTROLLED_FIXTURES,
  drumProbeBassLine,
  drumProbePianoMelody,
  drumProbeTomSolo,
} from './drumProbeFixtures.ts';

test('Drum probe reuses the production pass without changing any ListeningMap output', () => {
  for (const fixture of DRUM_PROBE_CONTROLLED_FIXTURES) {
    const pcm = fixture.create();
    const ordinary = engine.analyzePcmListening(pcm);
    const probed = probeDrumEvidence(pcm);
    assert.deepStrictEqual(probed.map, ordinary, fixture.id);
    assert.equal(probed.drum.performance.reusedGeneralFftAndTransientFeatures, true);
    assert.equal(probed.drum.performance.duplicatedAcousticComputation, false);
  }
});

test('named hypotheses expose the exact existing deterministic class scores', () => {
  for (const fixture of DRUM_PROBE_CONTROLLED_FIXTURES.slice(0, 5)) {
    const result = probeDrumEvidence(fixture.create());
    const classified = result.drum.events.filter(event => event.descriptors && event.hypotheses.length);
    assert.ok(classified.length > 0, fixture.id);
    for (const event of classified) {
      const existing = classifyPercussion(event.descriptors!);
      assert.equal(event.hypotheses.length, 5);
      assert.deepStrictEqual(event.hypotheses.map(item => item.rank), [1, 2, 3, 4, 5]);
      assert.equal(new Set(event.hypotheses.map(item => item.role)).size, 5);
      for (const hypothesis of event.hypotheses) {
        assert.equal(hypothesis.score, existing.scores[hypothesis.role]);
      }
      assert.equal(event.production.role, existing.role);
      assert.equal(event.production.confidence, existing.confidence);
    }
  }
});

test('accepted production events map exactly to trace dispositions', () => {
  for (const fixture of DRUM_PROBE_CONTROLLED_FIXTURES) {
    const result = probeDrumEvidence(fixture.create());
    const tracedIds = result.drum.events
      .filter(event => event.production.accepted)
      .map(event => event.production.eventId);
    const productionIds = result.map.percussionAnalysis!.events.map(event => event.id);
    assert.deepStrictEqual(tracedIds, productionIds, fixture.id);
    assert.equal(result.drum.onsetCandidateCount, result.map.percussionAnalysis!.candidateCount);
  }
});

test('ambiguous Other Percussive output is an explicit Drum abstention', () => {
  const result = probeDrumEvidence(ambiguousClap());
  const ambiguous = result.drum.events.filter(event => event.production.accepted
    && event.production.role === 'other-percussion');
  assert.ok(ambiguous.length > 0);
  for (const event of ambiguous) {
    assert.deepStrictEqual(event.decision,
      { state: 'ABSTAINED', role: null, reason: 'AMBIGUOUS_CLASS_EVIDENCE' });
    assert.equal(event.ambiguityFallback?.role, 'other-percussion');
    assert.ok((event.ambiguityFallback?.reasons.length ?? 0) > 0);
  }
});

test('short resonant TOM keeps pitch candidates while Melody abstains and Drum selects TOM', () => {
  const result = probeDrumEvidence(drumProbeTomSolo());
  const storage = readCompactMelodyEvidenceStorage(result.map.melodyEvidence!);
  assert.ok(storage.candidatePitchHz.length > 0);
  assert.equal(result.map.melodyAnalysis?.available, false);
  assert.ok(result.drum.events.some(event => event.decision.state === 'SELECTED'
    && event.decision.role === 'tom'));
  assert.ok(result.map.percussionAnalysis?.events.some(event => event.type === 'tom'));
});

test('piano and bass transients are rejected without a named Drum selection', () => {
  for (const pcm of [drumProbePianoMelody(), drumProbeBassLine()]) {
    const result = probeDrumEvidence(pcm);
    assert.equal(result.drum.selectedCount, 0);
    assert.ok(result.drum.events.some(event => event.decision.reason === 'NON_PERCUSSIVE_SUSTAINED'));
    assert.equal(result.map.percussionAnalysis?.events.length, 0);
    assert.equal(result.map.melodyAnalysis?.available, true);
    assert.ok(analyzeBassFromMelodyEvidence(result.map.melodyEvidence!).frames
      .some(frame => frame.selectedPitchHz !== null));
  }
});

test('probe state is per-analysis, bounded, and absent from the public package root', () => {
  const first = probeDrumEvidence(drumProbeTomSolo());
  const second = probeDrumEvidence(drumProbeTomSolo());
  assert.deepStrictEqual(first.drum.events, second.drum.events);
  assert.ok(first.drum.retainedNumericPayloadBytes > 0);
  assert.ok(first.drum.retainedNumericPayloadBytes < 16_384);
  assert.equal(first.drum.onsetCandidateCount, first.drum.events.length);
  assert.equal('probeDrumEvidence' in engine, false);
  assert.equal(Object.keys(engine).length, 62);
});
