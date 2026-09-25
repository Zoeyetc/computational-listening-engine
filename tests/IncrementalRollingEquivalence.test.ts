import assert from 'node:assert/strict';
import test from 'node:test';
import { makeRollingPublications, verifyRollingEquivalence } from './rollingEquivalenceHarness.ts';

for (const sampleRate of [48_000, 44_100, 32_000]) {
  test(`rolling oracle visits initial fill, overlap, and rollover at ${sampleRate} Hz`, async () => {
    const samples = Float32Array.from({ length: Math.floor(sampleRate * 13.5) }, (_, index) => {
      const time = index / sampleRate;
      if (time < 1) return 0;
      const bass = 0.3 * Math.sin(2 * Math.PI * 110 * time);
      const melody = time < 6 ? 0.25 * Math.sin(2 * Math.PI * 440 * time)
        : 0.25 * Math.sin(2 * Math.PI * 523.2511306011972 * time);
      const transient = index % Math.round(sampleRate * 0.5) < 16 ? 0.3 : 0;
      return bass + melody + transient;
    });
    const publications = makeRollingPublications(samples, sampleRate, [127, 211, 379]);
    assert.ok(publications.some(item => item.snapshotStartSample === 0));
    assert.ok(publications.some(item => item.snapshotStartSample > 0));
    assert.ok(publications.some(item => item.publicationSample / sampleRate > 12));
    assert.ok(publications.some(item => item.publicationSample % 192 !== 0));
    const project = ({ pcm, snapshotStartSample, publicationSample }: typeof publications[number]) => ({
      snapshotStartSample, publicationSample, first: pcm[0], last: pcm[pcm.length - 1], length: pcm.length,
    });
    assert.equal(await verifyRollingEquivalence(publications, project, project), publications.length);
    const mismatchAt = Math.floor(publications.length / 2);
    let seen = 0;
    await assert.rejects(verifyRollingEquivalence(publications, project, publication => {
      const result = project(publication);
      return seen++ === mismatchAt ? { ...result, last: result.last + 1 } : result;
    }), /Rolling publication/);
  });
}
