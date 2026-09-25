import assert from 'node:assert/strict';
import { RollingPcmBuffer } from '../src/streaming/RollingPcmBuffer.ts';

export type RollingPublication = Readonly<{
  sampleRate: number;
  publicationSample: number;
  snapshotStartSample: number;
  pcm: Float32Array;
}>;

/** Reproduce the existing sample-count cadence without invoking a UI clock. */
export function makeRollingPublications(samples: Float32Array, sampleRate: number,
  blockSizes: readonly number[], historySeconds = 12, cadenceSeconds = 0.5): RollingPublication[] {
  if (!blockSizes.length || blockSizes.some(size => !Number.isInteger(size) || size < 1)) {
    throw new RangeError('Block sizes must be positive integers');
  }
  const ring = new RollingPcmBuffer(sampleRate, historySeconds);
  const publications: RollingPublication[] = [];
  let cursor = 0, blockIndex = 0, lastScheduledAt = Number.NEGATIVE_INFINITY;
  while (cursor < samples.length) {
    const end = Math.min(samples.length, cursor + blockSizes[blockIndex % blockSizes.length]);
    ring.push([samples.subarray(cursor, end)]);
    cursor = end; blockIndex += 1;
    if (ring.totalDuration - lastScheduledAt >= cadenceSeconds) {
      lastScheduledAt = ring.totalDuration;
      publications.push({ sampleRate, publicationSample: cursor,
        snapshotStartSample: cursor - ring.length, pcm: ring.snapshot() });
    }
  }
  return publications;
}

/** Compares every publication, including revisions of the same historical time. */
export async function verifyRollingEquivalence<T>(publications: readonly RollingPublication[],
  baseline: (publication: RollingPublication) => Promise<T> | T,
  candidate: (publication: RollingPublication) => Promise<T> | T): Promise<number> {
  for (let index = 0; index < publications.length; index += 1) {
    const publication = publications[index];
    const expected = await baseline(publication);
    const actual = await candidate(publication);
    assert.deepStrictEqual(actual, expected,
      `Rolling publication ${index} at sample ${publication.publicationSample} diverged`);
  }
  return publications.length;
}
