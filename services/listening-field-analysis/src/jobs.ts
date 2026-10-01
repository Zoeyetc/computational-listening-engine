import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ListeningFieldRecordV1 } from '../../../adapters/listening-field/index.ts';
import type { AnalyzeUploadResult } from './types.ts';
import { asServiceError } from './errors.ts';
import { validateListeningFieldRecordV1 } from './validateResult.ts';

export const DEFAULT_ANALYSIS_VERSIONS = Object.freeze({
  engineVersion: '0.4.0',
  listeningRecordProjectionVersion: '1',
  listeningFieldProjectorVersion: '1',
  decoderIdentity: 'native-ffprobe-ffmpeg-pcm_f32le-a0-v1',
});
export type AnalysisVersions = Readonly<{
  engineVersion: string;
  listeningRecordProjectionVersion: string;
  listeningFieldProjectorVersion: string;
  decoderIdentity: string;
}>;

export type Job = {
  jobId: string;
  identity: string;
  recordId: string;
  status: 'queued' | 'analyzing' | 'ready' | 'failed';
  sourcePath?: string;
  recordUrl?: string;
  error?: { code: string; message: string };
  timings: {
    queuedAt: string;
    startedAt?: string;
    completedAt?: string;
    probeMs?: number;
    decodeMs?: number;
    analysisMs?: number;
    totalMs?: number;
  };
};

export interface JobStore {
  initialize(): Promise<Job[]>;
  put(job: Job): Promise<void>;
  get(jobId: string): Job | undefined;
  findByIdentity(identity: string): Job | undefined;
}

export interface ObjectStore {
  putRecord(recordId: string, record: ListeningFieldRecordV1): Promise<void>;
  getRecord(recordId: string): Promise<ListeningFieldRecordV1 | undefined>;
  removeSource(path: string): Promise<void>;
}

export interface AnalysisQueue {
  enqueue(jobId: string): void;
}

export type AnalysisWorker = (path: string, signal: AbortSignal) => Promise<AnalyzeUploadResult>;

async function atomicJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export class LocalStorage implements JobStore, ObjectStore {
  private jobs = new Map<string, Job>();
  private identities = new Map<string, string>();
  readonly directory: string;
  constructor(directory: string) { this.directory = directory; }

  async initialize(): Promise<Job[]> {
    await mkdir(join(this.directory, 'jobs'), { recursive: true });
    await mkdir(join(this.directory, 'records'), { recursive: true });
    await mkdir(join(this.directory, 'uploads'), { recursive: true });
    const files = await readdir(join(this.directory, 'jobs'));
    const queued: Job[] = [];
    for (const file of files.filter(name => /^[0-9a-f-]{36}\.json$/.test(name))) {
      const job = JSON.parse(await readFile(join(this.directory, 'jobs', file), 'utf8')) as Job;
      if (job.status === 'analyzing') {
        job.status = 'failed';
        job.error = { code: 'PROCESS_RESTARTED', message: 'Analysis was interrupted by a service restart' };
        job.timings.completedAt = new Date().toISOString();
        job.timings.totalMs = Date.parse(job.timings.completedAt) - Date.parse(job.timings.queuedAt);
        await this.put(job);
        if (job.sourcePath) await this.removeSource(job.sourcePath);
      } else if (job.status === 'queued') {
        if (!job.sourcePath) {
          job.status = 'failed';
          job.error = { code: 'SOURCE_UNAVAILABLE', message: 'Queued source audio is unavailable' };
          job.timings.completedAt = new Date().toISOString();
          await this.put(job);
        } else queued.push(job);
      }
      this.jobs.set(job.jobId, job);
      if (job.status !== 'failed') this.identities.set(job.identity, job.jobId);
    }
    return queued.sort((a, b) => a.timings.queuedAt.localeCompare(b.timings.queuedAt));
  }

  async put(job: Job): Promise<void> {
    await atomicJson(join(this.directory, 'jobs', `${job.jobId}.json`), job);
    this.jobs.set(job.jobId, job);
    if (job.status === 'failed') {
      if (this.identities.get(job.identity) === job.jobId) this.identities.delete(job.identity);
    } else this.identities.set(job.identity, job.jobId);
  }
  get(jobId: string): Job | undefined { return this.jobs.get(jobId); }
  findByIdentity(identity: string): Job | undefined {
    const id = this.identities.get(identity);
    return id ? this.jobs.get(id) : undefined;
  }
  async putRecord(recordId: string, record: ListeningFieldRecordV1): Promise<void> {
    const path = join(this.directory, 'records', `${recordId}.json`);
    try {
      await writeFile(path, JSON.stringify(validateListeningFieldRecordV1(record)), { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await this.getRecord(recordId);
      if (JSON.stringify(existing) !== JSON.stringify(record)) throw new Error('Immutable record collision');
    }
  }
  async getRecord(recordId: string): Promise<ListeningFieldRecordV1 | undefined> {
    try {
      return validateListeningFieldRecordV1(JSON.parse(await readFile(
        join(this.directory, 'records', `${recordId}.json`), 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
  async removeSource(path: string): Promise<void> { await rm(dirname(path), { recursive: true, force: true }); }
}

export async function sourceHash(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export function analysisIdentity(sourceContentHash: string, versions: AnalysisVersions): string {
  return createHash('sha256').update(JSON.stringify({ sourceContentHash, ...versions })).digest('hex');
}

export class LocalJobService {
  private pending: string[] = [];
  private running = false;
  private admission: Promise<void> = Promise.resolve();
  readonly ready: Promise<void>;
  readonly store: LocalStorage;
  private worker: AnalysisWorker;
  private versions: AnalysisVersions;
  private onInternalError?: (error: unknown) => void;
  constructor(store: LocalStorage, worker: AnalysisWorker,
    versions: AnalysisVersions = DEFAULT_ANALYSIS_VERSIONS,
    onInternalError?: (error: unknown) => void) {
    this.store = store;
    this.worker = worker;
    this.versions = versions;
    this.onInternalError = onInternalError;
    this.ready = store.initialize().then(jobs => {
      for (const job of jobs) this.enqueue(job.jobId);
    });
  }
  enqueue(jobId: string): void {
    this.pending.push(jobId);
    setImmediate(() => { void this.drain(); });
  }
  async submit(uploadPath: string): Promise<Job> {
    await this.ready;
    const hash = await sourceHash(uploadPath);
    const identity = analysisIdentity(hash, this.versions);
    const previous = this.admission;
    let release!: () => void;
    this.admission = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      const existing = this.store.findByIdentity(identity);
      if (existing) {
        await this.store.removeSource(uploadPath);
        return existing;
      }
      const jobId = randomUUID();
      const job: Job = {
        jobId, identity, recordId: identity, status: 'queued', sourcePath: uploadPath,
        timings: { queuedAt: new Date().toISOString() },
      };
      await this.store.put(job);
      this.enqueue(jobId);
      return job;
    } finally { release(); }
  }
  get(jobId: string): Job | undefined { return this.store.get(jobId); }
  getRecord(recordId: string): Promise<ListeningFieldRecordV1 | undefined> {
    return this.store.getRecord(recordId);
  }
  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.length) {
        const id = this.pending.shift()!;
        const job = this.store.get(id);
        if (!job || job.status !== 'queued') continue;
        job.status = 'analyzing';
        job.timings.startedAt = new Date().toISOString();
        try {
          await this.store.put(job);
          const result = await this.worker(job.sourcePath!, new AbortController().signal);
          await this.store.putRecord(job.recordId, result.record);
          job.status = 'ready';
          job.recordUrl = `/v1/records/${job.recordId}`;
          Object.assign(job.timings, result.timings);
        } catch (error) {
          const mapped = asServiceError(error);
          job.status = 'failed';
          job.error = { code: mapped.code, message: mapped.message };
          delete job.recordUrl;
          this.onInternalError?.(error);
        } finally {
          job.timings.completedAt = new Date().toISOString();
          job.timings.totalMs = Date.parse(job.timings.completedAt) - Date.parse(job.timings.queuedAt);
          try { await this.store.put(job); }
          catch (error) { this.onInternalError?.(error); }
          if (job.sourcePath) {
            try { await this.store.removeSource(job.sourcePath); }
            catch (error) { this.onInternalError?.(error); }
          }
        }
      }
    } finally {
      this.running = false;
      if (this.pending.length) setImmediate(() => { void this.drain(); });
    }
  }
}
