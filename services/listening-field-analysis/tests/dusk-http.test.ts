import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { performance } from 'node:perf_hooks';
import type { ListeningFieldRecordV1 } from '../../../adapters/listening-field/index.ts';
import { createNativeMediaDecoder } from '../src/ffmpegDecode.ts';
import { analyzeUpload } from '../src/analyzeUpload.ts';
import { createListeningFieldServer } from '../src/server.ts';

const duskPath = process.env.LISTENING_FIELD_DUSK_MP3;
const fixturePath = process.env.LISTENING_FIELD_DUSK_FIXTURE;
const ffmpegPath = process.env.LISTENING_FIELD_FFMPEG_PATH;
const ffprobePath = process.env.LISTENING_FIELD_FFPROBE_PATH;

test('Dusk asynchronous jobs exactly match fixture and reuse completed record', {
  skip: !duskPath || !fixturePath || !ffmpegPath || !ffprobePath,
  timeout: 120_000,
}, async context => {
  const { mkdtemp, rm, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'dusk-v1-'));
  let analyses = 0;
  const server = createListeningFieldServer({ dataDirectory: directory,
    analyzeFile: async (path, signal) => {
      analyses++;
      return analyzeUpload(path, {
        decoder: createNativeMediaDecoder({ ffmpegPath, ffprobePath }), signal,
      });
    },
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const bytes = await readFile(duskPath!);
  async function submit(): Promise<{ jobId: string; latencyMs: number }> {
    const form = new FormData();
    form.append('audio', new Blob([Uint8Array.from(bytes).buffer]), 'dusk.mp3');
    const started = performance.now();
    const response = await fetch(`${origin}/v1/jobs`, { method: 'POST', body: form,
      headers: { connection: 'close' } });
    assert.equal(response.status, 202);
    const value = await response.json() as { jobId: string; status: string };
    assert.equal(value.status, 'queued');
    return { jobId: value.jobId, latencyMs: performance.now() - started };
  }
  try {
    const expected = JSON.parse(await readFile(fixturePath!, 'utf8')) as ListeningFieldRecordV1;
    const totalStarted = performance.now();
    const first = await submit();
    let state: { status: string; recordUrl?: string };
    do {
      await new Promise(resolve => setTimeout(resolve, 50));
      state = await (await fetch(`${origin}/v1/jobs/${first.jobId}`,
        { headers: { connection: 'close' } })).json() as typeof state;
    } while (state.status === 'queued' || state.status === 'analyzing');
    assert.equal(state.status, 'ready');
    const readyMs = performance.now() - totalStarted;
    const record = await (await fetch(origin + state.recordUrl,
      { headers: { connection: 'close' } })).json() as ListeningFieldRecordV1;
    assert.equal(JSON.stringify(record), JSON.stringify(expected));
    const metadata = JSON.parse(await readFile(join(directory, 'jobs', `${first.jobId}.json`), 'utf8'));
    const second = await submit();
    const secondState = await (await fetch(`${origin}/v1/jobs/${second.jobId}`,
      { headers: { connection: 'close' } })).json() as typeof state;
    assert.equal(secondState.status, 'ready');
    assert.equal(secondState.recordUrl, state.recordUrl);
    assert.equal(analyses, 1);
    const counts = Object.fromEntries(['voiced', 'selected-unvoiced', 'range-rejected'].map(name => [
      name, record.melody.filter(event => event.state === name).length,
    ]));
    context.diagnostic(JSON.stringify({ postLatencyMs: first.latencyMs,
      queuedMs: Date.parse(metadata.timings.startedAt) - Date.parse(metadata.timings.queuedAt),
      analysisMs: metadata.timings.analysisMs, totalReadyMs: readyMs,
      probeMs: metadata.timings.probeMs, decodeMs: metadata.timings.decodeMs,
      cacheHitLatencyMs: second.latencyMs, events: record.melody.length,
      stateCounts: counts, exactEquality: true, analyses,
      maxRssBytes: process.resourceUsage().maxRSS * 1024 }));
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

async function postFile(origin: string, path: string): Promise<Readonly<{
  response: Response;
  body: ListeningFieldRecordV1;
  wallMs: number;
}>> {
  const bytes = await readFile(path);
  return postBytes(origin, bytes);
}

async function postBytes(origin: string, bytes: Uint8Array): Promise<Readonly<{
  response: Response;
  body: ListeningFieldRecordV1;
  wallMs: number;
}>> {
  const form = new FormData();
  form.append('audio', new Blob([Uint8Array.from(bytes).buffer]), 'client-name-is-not-used');
  const started = performance.now();
  const response = await fetch(`${origin}/v1/listening-field`, { method: 'POST', body: form });
  const body = await response.json() as ListeningFieldRecordV1;
  return { response, body, wallMs: performance.now() - started };
}

test('Dusk MP3 HTTP response exactly equals the known-good fixture', {
  skip: !duskPath || !fixturePath || !ffmpegPath || !ffprobePath,
  timeout: 60_000,
}, async context => {
  const server = createListeningFieldServer({ analysisOptions: {
    decoder: createNativeMediaDecoder({ ffmpegPath, ffprobePath }),
  } });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const expected = JSON.parse(await readFile(fixturePath!, 'utf8')) as ListeningFieldRecordV1;
    const result = await postFile(origin, duskPath!);
    assert.equal(result.response.status, 200);
    assert.equal(JSON.stringify(result.body), JSON.stringify(expected));
    const stateCounts = Object.fromEntries(['voiced', 'selected-unvoiced', 'range-rejected'].map(state => [
      state,
      result.body.melody.filter(event => event.state === state).length,
    ]));
    context.diagnostic(JSON.stringify({
      sourceDuration: result.body.sourceDuration,
      events: result.body.melody.length,
      stateCounts,
      exactEquality: true,
      wallMs: result.wallMs,
      serverTiming: result.response.headers.get('server-timing'),
      maxRssBytes: Number(result.response.headers.get('x-listening-field-max-rss-bytes')),
    }));
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('native HTTP path rejects non-audio and truncated media with structured 4xx errors', {
  skip: !duskPath || !ffmpegPath || !ffprobePath,
  timeout: 30_000,
}, async () => {
  const server = createListeningFieldServer({ analysisOptions: {
    decoder: createNativeMediaDecoder({ ffmpegPath, ffprobePath }),
  } });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const source = await readFile(duskPath!);
    for (const bytes of [Buffer.from('not an audio container'), source.subarray(0, 256)]) {
      const result = await postBytes(origin, bytes);
      assert.ok(result.response.status >= 400 && result.response.status < 500);
      const error = result.body as unknown as { error?: { code?: string; message?: string } };
      assert.equal(typeof error.error?.code, 'string');
      assert.equal(typeof error.error?.message, 'string');
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

const smokeFiles = [
  process.env.LISTENING_FIELD_SMOKE_WAV,
  process.env.LISTENING_FIELD_SMOKE_M4A,
  process.env.LISTENING_FIELD_SMOKE_OGG,
].filter((path): path is string => Boolean(path));

test('WAV, M4A/AAC, and OGG smoke files pass through the HTTP endpoint', {
  skip: smokeFiles.length !== 3 || !ffmpegPath || !ffprobePath,
  timeout: 60_000,
}, async () => {
  const server = createListeningFieldServer({ analysisOptions: {
    decoder: createNativeMediaDecoder({ ffmpegPath, ffprobePath }),
  } });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const path of smokeFiles) {
      const result = await postFile(origin, path);
      assert.equal(result.response.status, 200);
      assert.equal(result.body.version, 1);
      assert.ok(result.body.sourceDuration > 0);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
