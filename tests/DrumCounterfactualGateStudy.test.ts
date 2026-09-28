import assert from 'node:assert/strict';
import test from 'node:test';
import {
  counterfactualClassification,
  DRUM_EVENT_WINDOWS,
  MATCH_TOLERANCE_SECONDS,
  matchOnsets,
} from '../scripts/drum-counterfactual-gate-study.mjs';

const descriptor = (overrides = {}) => ({
  subRatio: 0.1, lowMidRatio: 0.15, midRatio: 0.25, highRatio: 0.25, airRatio: 0.25,
  centroid: 0.45, spread: 0.3, flatness: 0.35, duration: 0.1, decay: 0.8,
  onsetStrength: 0.9, highPersistence: 0.2, lowPersistence: 0.2, rms: 0.8, ...overrides,
});

test('counterfactual onset matching is one-to-one, maximum-cardinality, and minimum-offset', () => {
  const result = matchOnsets([0.1, 0.2], [0.05, 0.12], 0.1);
  assert.equal(result.pairs.length, 2);
  assert.deepEqual(result.pairs.map(pair => [pair.humanIndex, pair.engineIndex]), [[0, 0], [1, 1]]);
  assert.deepEqual(matchOnsets([0.1, 0.11], [0.105], 0.02).pairs.map(pair => pair.humanIndex), [0]);
  assert.deepEqual(matchOnsets([0.1], [0.02], 0.07).pairs, []);
  const empty = matchOnsets([], [0.1, 0.2], 0.07);
  assert.deepEqual(empty.pairs, []);
  assert.deepEqual(empty.unmatchedHumanIndexes, []);
  assert.deepEqual(empty.unmatchedEngineIndexes, [0, 1]);
});

test('counterfactual classification exposes the unchanged named score competition', () => {
  const result = counterfactualClassification(descriptor({ subRatio: 0.72, lowMidRatio: 0.16,
    midRatio: 0.06, highRatio: 0.04, airRatio: 0.02, centroid: 0.08,
    flatness: 0.08, lowPersistence: 0.7 }));
  assert.equal(result.decision, 'NAMED_CLASS');
  assert.equal(result.role, 'kick');
  assert.equal(result.topHypothesis.role, 'kick');
  assert.equal(result.hypotheses.length, 5);
});

test('annotation windows and tolerance remain fixed evaluation inputs', () => {
  assert.deepEqual(DRUM_EVENT_WINDOWS.map(window => [window.label, window.start, window.end]), [
    ['kick', 7.5, 17.5], ['snare', 35.5, 45.5], ['hi-hat', 63, 73], ['tom', 85, 95],
  ]);
  assert.equal(MATCH_TOLERANCE_SECONDS, 0.07);
});
