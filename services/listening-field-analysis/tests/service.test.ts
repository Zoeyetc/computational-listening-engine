import assert from 'node:assert/strict';
import test from 'node:test';
import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { ListeningFieldRecordV1 } from '../../../adapters/listening-field/index.ts';
import { analyzeUpload } from '../src/analyzeUpload.ts';
import { ServiceError } from '../src/errors.ts';
import { createNativeMediaDecoder } from '../src/ffmpegDecode.ts';
import { createListeningFieldServer, type ListeningFieldServerOptions } from '../src/server.ts';
import type { AudioProbe, MediaDecoder } from '../src/types.ts';
import { UPLOAD_LIMITS, validateAudioProbe, validatePcmAudio } from '../src/validateUpload.ts';
import { validateListeningFieldRecordV1 } from '../src/validateResult.ts';

const validRecord: ListeningFieldRecordV1 = {
  version: 1,
  sourceDuration: 1,
  melody: [
    { id: 'melody-voiced-000001', start: 0, end: 0.5, midi: 60, state: 'voiced' },
  ],
};

const validProbe: AudioProbe = {
  sampleRate: 48_000,
  channelCount: 2,
  duration: 1,
  codecName: 'mp3',
  formatNames: ['mp3'],
};

async function withServer(options: ListeningFieldServerOptions,
  run: (origin: string) => Promise<void>): Promise<void> {
  const server = createListeningFieldServer(options);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function errorBody(response: Response): Promise<{ error: { code: string; message: string } }> {
  return await response.json() as { error: { code: string; message: string } };
}

test('result validation accepts only finite plain ListeningFieldRecordV1 data', () => {
  assert.deepEqual(validateListeningFieldRecordV1(validRecord), validRecord);
  assert.throws(() => validateListeningFieldRecordV1({
    ...validRecord,
    melody: [...validRecord.melody, { ...validRecord.melody[0] }],
  }), (error: unknown) => error instanceof ServiceError && error.code === 'INVALID_ANALYSIS_RESULT');
  assert.throws(() => validateListeningFieldRecordV1({
    ...validRecord,
    sourceDuration: Number.NaN,
  }), (error: unknown) => error instanceof ServiceError && error.code === 'INVALID_ANALYSIS_RESULT');
  assert.throws(() => validateListeningFieldRecordV1({
    ...validRecord,
    extra: new Float32Array([1]),
  }), (error: unknown) => error instanceof ServiceError && error.code === 'INVALID_ANALYSIS_RESULT');
});

test('upload validation enforces duration, channels, format, and finite PCM', () => {
  assert.throws(() => validateAudioProbe({
    ...validProbe,
    duration: UPLOAD_LIMITS.maximumDurationSeconds + 0.001,
  }), (error: unknown) => error instanceof ServiceError && error.code === 'AUDIO_TOO_LONG');
  assert.throws(() => validateAudioProbe({ ...validProbe, channelCount: 0 }),
    (error: unknown) => error instanceof ServiceError && error.code === 'NO_AUDIO_STREAM');
  assert.throws(() => validateAudioProbe({ ...validProbe, codecName: 'flac', formatNames: ['flac'] }),
    (error: unknown) => error instanceof ServiceError && error.code === 'UNSUPPORTED_AUDIO_FORMAT');
  assert.throws(() => validatePcmAudio({ sampleRate: 48_000,
    channels: [new Float32Array([0, Number.NaN])] }),
  (error: unknown) => error instanceof ServiceError && error.code === 'NON_FINITE_PCM');
});

test('analyzeUpload maps analysis failure without changing the engine', async () => {
  const decoder: MediaDecoder = {
    probe: async () => validProbe,
    decode: async () => ({ sampleRate: 48_000, channels: [new Float32Array([0])] }),
  };
  await assert.rejects(analyzeUpload('/unused', {
    decoder,
    analyzeAudio: () => { throw new Error('private diagnostic'); },
  }), (error: unknown) => error instanceof ServiceError && error.code === 'ANALYSIS_FAILED'
    && !error.message.includes('private diagnostic'));
});

test('native decoder maps FFmpeg process failure without exposing stderr', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'listening-field-ffmpeg-failure-'));
  const path = join(directory, 'input.bin');
  await writeFile(path, Buffer.from([1]));
  try {
    const decoder = createNativeMediaDecoder({ ffmpegPath: process.execPath, decodeTimeoutMs: 5_000 });
    await assert.rejects(decoder.decode(path, validProbe),
      (error: unknown) => error instanceof ServiceError && error.code === 'AUDIO_DECODE_FAILED'
        && error.message === 'Audio decoding failed');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('HTTP endpoint accepts audio multipart, returns JSON, and removes its temporary file', async () => {
  let temporaryPath = '';
  await withServer({
    analyzeFile: async path => {
      temporaryPath = path;
      assert.equal((await stat(path)).size, Buffer.byteLength('encoded-audio'));
      return { record: validRecord, timings: { probeMs: 1, decodeMs: 2, analysisMs: 3 } };
    },
  }, async origin => {
    const form = new FormData();
    form.append('audio', new Blob([Buffer.from('encoded-audio')]), 'ignored-user-name.mp3');
    const response = await fetch(`${origin}/v1/listening-field`, { method: 'POST', body: form });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
    assert.match(response.headers.get('server-timing') ?? '', /decode;dur=2\.000/);
    assert.deepEqual(await response.json(), validRecord);
  });
  await assert.rejects(access(temporaryPath));
});

test('HTTP endpoint returns structured upload and processing errors', async () => {
  await withServer({
    analyzeFile: async path => {
      const bytes = await readFile(path, 'utf8');
      if (bytes === 'plain text') throw new ServiceError('INVALID_AUDIO', 'Invalid audio upload', 422);
      if (bytes === 'truncated') throw new ServiceError('AUDIO_DECODE_FAILED', 'Audio decoding failed', 422);
      if (bytes === 'no stream') throw new ServiceError('NO_AUDIO_STREAM', 'No audio stream', 422);
      if (bytes === 'analysis') throw new ServiceError('ANALYSIS_FAILED', 'Listening Field analysis failed', 500);
      throw new Error('unexpected fixture');
    },
  }, async origin => {
    const cases = [
      ['plain text', 'INVALID_AUDIO', 422],
      ['truncated', 'AUDIO_DECODE_FAILED', 422],
      ['no stream', 'NO_AUDIO_STREAM', 422],
      ['analysis', 'ANALYSIS_FAILED', 500],
    ] as const;
    for (const [content, code, status] of cases) {
      const form = new FormData();
      form.append('audio', new Blob([content]), 'untrusted-name');
      const response = await fetch(`${origin}/v1/listening-field`, { method: 'POST', body: form });
      assert.equal(response.status, status);
      assert.equal((await errorBody(response)).error.code, code);
    }

    const missing = new FormData();
    missing.append('other', 'value');
    const missingResponse = await fetch(`${origin}/v1/listening-field`, { method: 'POST', body: missing });
    assert.equal(missingResponse.status, 400);
    assert.equal((await errorBody(missingResponse)).error.code, 'MISSING_AUDIO');

    const empty = new FormData();
    empty.append('audio', new Blob([]), 'empty.mp3');
    const emptyResponse = await fetch(`${origin}/v1/listening-field`, { method: 'POST', body: empty });
    assert.equal(emptyResponse.status, 400);
    assert.equal((await errorBody(emptyResponse)).error.code, 'EMPTY_AUDIO');
  });
});

test('HTTP endpoint rejects encoded uploads beyond 25 MiB', async () => {
  await withServer({
    analyzeFile: async () => { throw new Error('oversized upload reached analysis'); },
  }, async origin => {
    const form = new FormData();
    form.append('audio', new Blob([new Uint8Array(UPLOAD_LIMITS.maximumEncodedBytes + 1)]), 'large.mp3');
    const response = await fetch(`${origin}/v1/listening-field`, { method: 'POST', body: form });
    assert.equal(response.status, 413);
    assert.equal((await errorBody(response)).error.code, 'UPLOAD_TOO_LARGE');
  });
});
