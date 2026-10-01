import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { ListeningFieldRecordV1 } from '../../../adapters/listening-field/index.ts';
import { ServiceError } from '../src/errors.ts';
import { LocalStorage, type AnalysisVersions } from '../src/jobs.ts';
import { createListeningFieldServer, type ListeningFieldServerOptions } from '../src/server.ts';
import { UPLOAD_LIMITS } from '../src/validateUpload.ts';

const record: ListeningFieldRecordV1 = {
  version: 1, sourceDuration: 1,
  melody: [{ id: 'm1', start: 0, end: 1, midi: 60, state: 'voiced' }],
};
const timings = { probeMs: 1, decodeMs: 2, analysisMs: 3 };

async function withServer(options: ListeningFieldServerOptions,
  run: (origin: string, directory: string) => Promise<void>): Promise<void> {
  const directory = options.dataDirectory ?? await mkdtemp(join(tmpdir(), 'lf-jobs-test-'));
  const server = createListeningFieldServer({ ...options, dataDirectory: directory });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, directory); }
  finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (!options.dataDirectory) await rm(directory, { recursive: true, force: true });
  }
}

async function submit(origin: string, content: string): Promise<{ jobId: string; status: string; httpStatus: number }> {
  const form = new FormData();
  form.append('audio', new Blob([content]), 'audio.mp3');
  const response = await fetch(`${origin}/v1/jobs`, { method: 'POST', body: form });
  return { ...await response.json() as { jobId: string; status: string }, httpStatus: response.status };
}

async function job(origin: string, id: string): Promise<{ status: string; recordUrl?: string;
  error?: { code: string } }> {
  const response = await fetch(`${origin}/v1/jobs/${id}`);
  assert.equal(response.status, 200);
  return await response.json() as { status: string; recordUrl?: string; error?: { code: string } };
}

async function until(origin: string, id: string, status: string): Promise<void> {
  for (let n = 0; n < 100; n++) {
    if ((await job(origin, id)).status === status) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Job did not reach ${status}`);
}

test('POST returns 202 before analysis, then queued → analyzing → ready with immutable record', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  await withServer({ analyzeFile: async () => { calls++; await gate; return { record, timings }; } },
    async (origin, directory) => {
      const submitted = await submit(origin, 'a');
      assert.equal(submitted.httpStatus, 202);
      assert.equal(submitted.status, 'queued');
      await until(origin, submitted.jobId, 'analyzing');
      for (let n = 0; calls === 0 && n < 100; n++) await new Promise(resolve => setTimeout(resolve, 1));
      assert.equal(calls, 1);
      release();
      await until(origin, submitted.jobId, 'ready');
      const state = await job(origin, submitted.jobId);
      assert.equal(state.recordUrl?.startsWith('/v1/records/'), true);
      assert.deepEqual(await (await fetch(origin + state.recordUrl)).json(), record);
      const saved = JSON.parse(await readFile(join(directory, 'jobs', `${submitted.jobId}.json`), 'utf8'));
      assert.equal(saved.timings.probeMs, 1);
      assert.equal(saved.timings.decodeMs, 2);
      assert.equal(saved.timings.analysisMs, 3);
      assert.ok(saved.timings.queuedAt && saved.timings.startedAt && saved.timings.completedAt);
      assert.ok(saved.timings.totalMs >= 0);
    });
});

test('single worker executes FIFO, failed job does not block next job', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started: string[] = [];
  let active = 0;
  let peak = 0;
  await withServer({ analyzeFile: async path => {
    const content = await readFile(path, 'utf8');
    started.push(content);
    active++;
    peak = Math.max(peak, active);
    try {
      if (content === 'first') { await gate; throw new ServiceError('INVALID_AUDIO', 'Bad audio', 422); }
      return { record, timings };
    } finally { active--; }
  } }, async origin => {
    const first = await submit(origin, 'first');
    await until(origin, first.jobId, 'analyzing');
    const second = await submit(origin, 'second');
    const third = await submit(origin, 'third');
    assert.equal((await job(origin, second.jobId)).status, 'queued');
    assert.equal((await job(origin, third.jobId)).status, 'queued');
    release();
    await until(origin, first.jobId, 'failed');
    await until(origin, second.jobId, 'ready');
    await until(origin, third.jobId, 'ready');
    assert.equal((await job(origin, first.jobId)).recordUrl, undefined);
    assert.equal((await job(origin, first.jobId)).error?.code, 'INVALID_AUDIO');
    assert.deepEqual(started, ['first', 'second', 'third']);
    assert.equal(peak, 1);
  });
});

test('concurrent duplicates share work and completed duplicate reuses immutable record', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  await withServer({ analyzeFile: async () => { calls++; await gate; return { record, timings }; } },
    async origin => {
      const [a, b] = await Promise.all([submit(origin, 'same'), submit(origin, 'same')]);
      assert.equal(a.jobId, b.jobId);
      await until(origin, a.jobId, 'analyzing');
      release();
      await until(origin, a.jobId, 'ready');
      const prior = await job(origin, a.jobId);
      const c = await submit(origin, 'same');
      assert.equal(c.jobId, a.jobId);
      assert.equal((await job(origin, c.jobId)).recordUrl, prior.recordUrl);
      assert.equal(calls, 1);
    });
});

test('version identity change misses cache', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lf-version-test-'));
  const versions: AnalysisVersions = {
    engineVersion: 'test-a', listeningRecordProjectionVersion: '1',
    listeningFieldProjectorVersion: '1', decoderIdentity: 'test',
  };
  let calls = 0;
  try {
    let first = '';
    await withServer({ dataDirectory: directory, analysisVersions: versions,
      analyzeFile: async () => { calls++; return { record, timings }; } }, async origin => {
      first = (await submit(origin, 'same')).jobId;
      await until(origin, first, 'ready');
    });
    await withServer({ dataDirectory: directory,
      analysisVersions: { ...versions, engineVersion: 'test-b' },
      analyzeFile: async () => { calls++; return { record, timings }; } }, async origin => {
      const second = (await submit(origin, 'same')).jobId;
      assert.notEqual(second, first);
      await until(origin, second, 'ready');
      assert.notEqual((await job(origin, second)).recordUrl, (await job(origin, first)).recordUrl);
    });
    assert.equal(calls, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('unknown IDs return 404 and V0 upload limits remain on jobs', async () => {
  await withServer({ analyzeFile: async () => { throw new Error('unexpected'); } }, async origin => {
    assert.equal((await fetch(`${origin}/v1/jobs/00000000-0000-0000-0000-000000000000`)).status, 404);
    assert.equal((await fetch(`${origin}/v1/records/${'0'.repeat(64)}`)).status, 404);
    const missing = await fetch(`${origin}/v1/jobs`, { method: 'POST', body: new FormData() });
    assert.equal(missing.status, 400);
    const form = new FormData();
    form.append('audio', new Blob([new Uint8Array(UPLOAD_LIMITS.maximumEncodedBytes + 1)]));
    const oversized = await fetch(`${origin}/v1/jobs`, { method: 'POST', body: form });
    assert.equal(oversized.status, 413);
  });
});

test('startup marks interrupted analysis failed and removes its source', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lf-recovery-test-'));
  try {
    const store = new LocalStorage(directory);
    await store.initialize();
    const id = '00000000-0000-0000-0000-000000000001';
    const source = join(directory, 'uploads', 'orphan', 'audio-upload.bin');
    const { mkdir, writeFile, access } = await import('node:fs/promises');
    await mkdir(join(directory, 'uploads', 'orphan'));
    await writeFile(source, 'source');
    await store.put({ jobId: id, identity: 'identity', recordId: 'record', status: 'analyzing',
      sourcePath: source, timings: { queuedAt: new Date().toISOString(), startedAt: new Date().toISOString() } });
    await withServer({ dataDirectory: directory }, async origin => {
      const state = await job(origin, id);
      assert.equal(state.status, 'failed');
      assert.equal(state.error?.code, 'PROCESS_RESTARTED');
      await assert.rejects(access(source));
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
