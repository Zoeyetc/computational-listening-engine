import assert from 'node:assert/strict';
import test from 'node:test';
import { makeRollingPublications } from './rollingEquivalenceHarness.ts';

// An optimistic upper bound for overlap-based reuse: an aligned frame begins
// at the same absolute source sample. This ignores phase, remaining samples,
// and edge padding. Content-identical frames at different positions are a
// different, content-addressed experiment and are not counted here.
function alignedStartHitRate(sampleRate: number, blockSizes: readonly number[]) {
  const publications = makeRollingPublications(new Float32Array(sampleRate * 36), sampleRate, blockSizes);
  const seen = new Map<number, number>();
  let hits = 0;
  let frames = 0;
  for (const publication of publications) {
    const signalLength = Math.max(1, Math.floor(publication.pcm.length / (sampleRate / 12_000)));
    for (let start = 0; start < signalLength; start += 192) {
      if (start + 2048 <= signalLength) {
        const absoluteSourceStart = publication.snapshotStartSample
          + Math.floor(start * sampleRate / 12_000);
        if (publication.publicationSample >= sampleRate * 24) {
          frames += 1;
          if (seen.has(absoluteSourceStart)) hits += 1;
        }
        seen.set(absoluteSourceStart, publication.publicationSample);
      }
      if (start + 2048 >= signalLength && start > 0) break;
    }
    for (const [start, lastSeen] of seen) {
      if (lastSeen < publication.publicationSample - sampleRate * 12) seen.delete(start);
    }
  }
  return { hits, frames, rate: hits / frames };
}

test('44.1 kHz 128-sample rolling publications have no source-aligned frame reuse after rollover', () => {
  const result = alignedStartHitRate(44_100, [128]);
  assert.ok(result.frames > 10_000);
  assert.equal(result.hits, 0);
});

test('source-aligned opportunities depend on publication boundaries', () => {
  const exactHalfSecond = alignedStartHitRate(44_100, [22_050]);
  const awkwardBlocks = alignedStartHitRate(48_000, [127, 211, 379]);
  assert.ok(exactHalfSecond.rate > 0.8);
  assert.equal(awkwardBlocks.hits, 0);
});
