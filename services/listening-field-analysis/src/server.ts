import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeUpload, type AnalyzeUploadOptions } from './analyzeUpload.ts';
import { asServiceError, ServiceError } from './errors.ts';
import { DEFAULT_ANALYSIS_VERSIONS, LocalJobService, LocalStorage,
  type AnalysisVersions, type Job } from './jobs.ts';
import type { AnalyzeUploadResult } from './types.ts';
import { receiveAudioUpload } from './validateUpload.ts';

type AnalyzeFile = (path: string, signal: AbortSignal) => Promise<AnalyzeUploadResult>;

export type ListeningFieldServerOptions = Readonly<{
  analyzeFile?: AnalyzeFile;
  analysisOptions?: Omit<AnalyzeUploadOptions, 'signal'>;
  onInternalError?: (error: unknown) => void;
  dataDirectory?: string;
  analysisVersions?: AnalysisVersions;
}>;

function sendJson(response: ServerResponse, status: number, value: unknown,
  headers: Readonly<Record<string, string>> = {}): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body).toString(),
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(body);
}

function sendError(response: ServerResponse, error: ServiceError): void {
  sendJson(response, error.status, { error: { code: error.code, message: error.message } });
}

async function handleAnalysis(request: IncomingMessage, response: ServerResponse,
  options: ListeningFieldServerOptions): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.once('aborted', abort);
  response.once('close', () => {
    if (!response.writableFinished) abort();
  });
  const directory = await mkdtemp(join(tmpdir(), 'listening-field-analysis-'));
  let result: AnalyzeUploadResult;
  try {
    const upload = await receiveAudioUpload(request, directory, controller.signal);
    const analyzeFile = options.analyzeFile ?? ((path, signal) =>
      analyzeUpload(path, { ...options.analysisOptions, signal }));
    result = await analyzeFile(upload.path, controller.signal);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  const timings = result.timings;
  const maxRssBytes = process.resourceUsage().maxRSS * 1024;
  sendJson(response, 200, result.record, {
    'Server-Timing': [
      `probe;dur=${timings.probeMs.toFixed(3)}`,
      `decode;dur=${timings.decodeMs.toFixed(3)}`,
      `analysis;dur=${timings.analysisMs.toFixed(3)}`,
    ].join(', '),
    'X-Listening-Field-Max-RSS-Bytes': String(maxRssBytes),
  });
}

function publicJob(job: Job): unknown {
  if (job.status === 'ready') return { jobId: job.jobId, status: 'ready', recordUrl: job.recordUrl };
  if (job.status === 'failed') return { jobId: job.jobId, status: 'failed', error: job.error };
  return { jobId: job.jobId, status: job.status };
}

async function handleJobSubmission(request: IncomingMessage, response: ServerResponse,
  jobs: LocalJobService): Promise<void> {
  await jobs.ready;
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.once('aborted', abort);
  response.once('close', () => { if (!response.writableFinished) abort(); });
  const directory = await mkdtemp(join(jobs.store.directory, 'uploads', 'upload-'));
  let retained = false;
  try {
    const upload = await receiveAudioUpload(request, directory, controller.signal);
    const job = await jobs.submit(upload.path);
    retained = job.sourcePath === upload.path;
    sendJson(response, 202, { jobId: job.jobId, status: 'queued' });
  } finally {
    if (!retained) await rm(directory, { recursive: true, force: true });
  }
}

async function route(request: IncomingMessage, response: ServerResponse,
  options: ListeningFieldServerOptions, jobs: LocalJobService): Promise<void> {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (path === '/v1/listening-field' || path === '/v1/jobs') {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      throw new ServiceError('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
    }
    if (path === '/v1/listening-field') await handleAnalysis(request, response, options);
    else await handleJobSubmission(request, response, jobs);
    return;
  }
  const jobMatch = /^\/v1\/jobs\/([0-9a-f-]{36})$/.exec(path);
  const recordMatch = /^\/v1\/records\/([0-9a-f]{64})$/.exec(path);
  if (!jobMatch && !recordMatch) throw new ServiceError('NOT_FOUND', 'Route not found', 404);
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    throw new ServiceError('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }
  await jobs.ready;
  if (jobMatch) {
    const job = jobs.get(jobMatch[1]!);
    if (!job) throw new ServiceError('NOT_FOUND', 'Job not found', 404);
    sendJson(response, 200, publicJob(job));
  } else {
    const record = await jobs.getRecord(recordMatch![1]!);
    if (!record) throw new ServiceError('NOT_FOUND', 'Record not found', 404);
    sendJson(response, 200, record);
  }
}

export function createListeningFieldServer(options: ListeningFieldServerOptions = {}): Server {
  const analyzeFile = options.analyzeFile ?? ((path: string, signal: AbortSignal) =>
    analyzeUpload(path, { ...options.analysisOptions, signal }));
  const dataDirectory = options.dataDirectory ?? join(tmpdir(), `listening-field-analysis-v1-${process.getuid?.() ?? 'user'}`);
  const nativeDecoderIdentity = JSON.stringify({
    implementation: 'ffprobe-ffmpeg-pcm_f32le-a0-v1',
    ffprobePath: process.env.LISTENING_FIELD_FFPROBE_PATH ?? 'ffprobe',
    ffmpegPath: process.env.LISTENING_FIELD_FFMPEG_PATH ?? 'ffmpeg',
    probeTimeoutMs: 15_000,
    decodeTimeoutMs: 120_000,
  });
  const jobs = new LocalJobService(new LocalStorage(dataDirectory), analyzeFile,
    options.analysisVersions ?? { ...DEFAULT_ANALYSIS_VERSIONS, decoderIdentity: nativeDecoderIdentity },
    options.onInternalError);
  const server = createServer((request, response) => {
    void route(request, response, options, jobs).catch(error => {
      const serviceError = asServiceError(error);
      if (serviceError.status >= 500) options.onInternalError?.(error);
      if (response.destroyed || response.headersSent) {
        response.destroy();
        return;
      }
      if (serviceError.code !== 'REQUEST_ABORTED') sendError(response, serviceError);
      else response.destroy();
    });
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = 180_000;
  return server;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && fileURLToPath(import.meta.url) === resolve(entry!);
}

if (isMainModule()) {
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error('PORT must be an integer from 0 through 65535');
  }
  const server = createListeningFieldServer({
    onInternalError: error => console.error(error instanceof Error ? error.message : 'Service failure'),
  });
  server.listen(port, host, () => console.log(`Listening Field analysis service on http://${host}:${port}`));
}
