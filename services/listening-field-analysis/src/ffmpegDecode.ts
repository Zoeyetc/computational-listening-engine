import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { PcmAudio } from '../../../src/index.ts';
import { ServiceError } from './errors.ts';
import type { AudioProbe, MediaDecoder } from './types.ts';
import { UPLOAD_LIMITS, validateAudioProbe } from './validateUpload.ts';

const PROBE_TIMEOUT_MS = 15_000;
const DECODE_TIMEOUT_MS = 120_000;
const MAX_TOOL_OUTPUT_BYTES = 1024 * 1024;

export type NativeMediaDecoderOptions = Readonly<{
  ffmpegPath?: string;
  ffprobePath?: string;
  probeTimeoutMs?: number;
  decodeTimeoutMs?: number;
}>;

type CapturedProcess = Readonly<{ stdout: Buffer; stderr: Buffer; exitCode: number | null }>;

function unavailable(error: unknown, tool: string): ServiceError {
  if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    return new ServiceError('MEDIA_TOOL_UNAVAILABLE', `${tool} is not available`, 503,
      error instanceof Error ? { cause: error } : undefined);
  }
  return new ServiceError('INTERNAL_ERROR', `${tool} could not be started`, 500,
    error instanceof Error ? { cause: error } : undefined);
}

function runCaptured(command: string, args: readonly string[], timeoutMs: number,
  signal?: AbortSignal): Promise<CapturedProcess> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ServiceError('REQUEST_ABORTED', 'The request was cancelled', 499));
      return;
    }
    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) {
      reject(unavailable(error, command));
      return;
    }
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let settled = false;
    const stop = () => {
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 1_000);
      force.unref();
    };
    const onAbort = () => stop();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    timer.unref();

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes <= MAX_TOOL_OUTPUT_BYTES) stdout.push(chunk);
      else stop();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes <= MAX_TOOL_OUTPUT_BYTES) stderr.push(chunk);
    });
    child.once('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(unavailable(error, command));
    });
    child.once('close', exitCode => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) {
        reject(new ServiceError('REQUEST_ABORTED', 'The request was cancelled', 499));
      } else if (timedOut) {
        reject(new ServiceError('MEDIA_TOOL_TIMEOUT', 'Media inspection timed out', 504));
      } else if (stdoutBytes > MAX_TOOL_OUTPUT_BYTES) {
        reject(new ServiceError('INVALID_AUDIO', 'Media inspection returned excessive data', 422));
      } else {
        resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), exitCode });
      }
    });
  });
}

type ProbeJson = Readonly<{
  streams?: readonly Readonly<{
    sample_rate?: string;
    channels?: number;
    codec_name?: string;
    duration?: string;
  }>[];
  format?: Readonly<{ duration?: string; format_name?: string }>;
}>;

async function probeWithFfprobe(path: string, command: string, timeoutMs: number,
  signal?: AbortSignal): Promise<AudioProbe> {
  const result = await runCaptured(command, [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=sample_rate,channels,codec_name,duration:format=duration,format_name',
    '-of', 'json',
    path,
  ], timeoutMs, signal);
  if (result.exitCode !== 0) {
    throw new ServiceError('INVALID_AUDIO', 'The upload could not be inspected as audio', 422);
  }
  let parsed: ProbeJson;
  try {
    parsed = JSON.parse(result.stdout.toString('utf8')) as ProbeJson;
  } catch (error) {
    throw new ServiceError('INVALID_AUDIO', 'The audio metadata is invalid', 422,
      error instanceof Error ? { cause: error } : undefined);
  }
  const stream = parsed.streams?.[0];
  if (!stream) throw new ServiceError('NO_AUDIO_STREAM', 'The upload contains no audio stream', 422);
  const duration = Number(stream.duration ?? parsed.format?.duration);
  const probe: AudioProbe = {
    sampleRate: Number(stream.sample_rate),
    channelCount: Number(stream.channels),
    duration,
    codecName: stream.codec_name ?? '',
    formatNames: (parsed.format?.format_name ?? '').split(',').filter(Boolean),
  };
  return validateAudioProbe(probe);
}

function decodeWithFfmpeg(path: string, probe: AudioProbe, command: string, timeoutMs: number,
  signal?: AbortSignal): Promise<PcmAudio> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ServiceError('REQUEST_ABORTED', 'The request was cancelled', 499));
      return;
    }
    const maximumFrames = Math.floor(UPLOAD_LIMITS.maximumDecodedBytes
      / (probe.channelCount * Float32Array.BYTES_PER_ELEMENT));
    const estimatedFrames = Math.max(1, Math.ceil(probe.duration * probe.sampleRate));
    let capacity = Math.min(maximumFrames, estimatedFrames + Math.min(probe.sampleRate, maximumFrames));
    let channels: Float32Array[];
    try {
      channels = Array.from({ length: probe.channelCount }, () => new Float32Array(capacity));
    } catch (error) {
      reject(new ServiceError('DECODED_AUDIO_TOO_LARGE',
        'The decoded audio could not fit in service memory', 422,
        error instanceof Error ? { cause: error } : undefined));
      return;
    }

    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(command, [
        '-hide_banner', '-loglevel', 'error', '-nostdin',
        '-i', path,
        '-map', '0:a:0', '-vn', '-sn', '-dn',
        '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1',
      ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) {
      reject(unavailable(error, command));
      return;
    }

    let frames = 0;
    let remainder = Buffer.alloc(0);
    let stderrBytes = 0;
    let timedOut = false;
    let processingError: ServiceError | undefined;
    let settled = false;
    const frameBytes = probe.channelCount * Float32Array.BYTES_PER_ELEMENT;
    const stop = () => {
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 1_000);
      force.unref();
    };
    const fail = (error: ServiceError) => {
      if (!processingError) processingError = error;
      child.stdout.pause();
      stop();
    };
    const grow = (required: number) => {
      if (required > maximumFrames) {
        throw new ServiceError('DECODED_AUDIO_TOO_LARGE',
          'Decoded audio exceeds the service memory limit', 422);
      }
      let nextCapacity = Math.min(maximumFrames,
        Math.max(required, Math.ceil(Math.max(1, capacity) * 1.25)));
      if (nextCapacity <= capacity) nextCapacity = required;
      channels = channels.map(channel => {
        const next = new Float32Array(nextCapacity);
        next.set(channel);
        return next;
      });
      capacity = nextCapacity;
    };
    const onAbort = () => stop();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    timer.unref();

    child.stdout.on('data', (incoming: Buffer) => {
      if (processingError) return;
      try {
        const chunk = remainder.length ? Buffer.concat([remainder, incoming]) : incoming;
        const completeBytes = chunk.length - (chunk.length % frameBytes);
        const chunkFrames = completeBytes / frameBytes;
        if (frames + chunkFrames > capacity) grow(frames + chunkFrames);
        let offset = 0;
        for (let frame = 0; frame < chunkFrames; frame += 1) {
          for (let channel = 0; channel < probe.channelCount; channel += 1) {
            const sample = chunk.readFloatLE(offset);
            if (!Number.isFinite(sample)) {
              throw new ServiceError('NON_FINITE_PCM',
                'Decoded audio contains a non-finite sample', 422);
            }
            channels[channel]![frames + frame] = sample;
            offset += Float32Array.BYTES_PER_ELEMENT;
          }
        }
        frames += chunkFrames;
        remainder = completeBytes === chunk.length ? Buffer.alloc(0) : Buffer.from(chunk.subarray(completeBytes));
      } catch (error) {
        fail(error instanceof ServiceError ? error : new ServiceError(
          'AUDIO_DECODE_FAILED', 'Audio decoding failed', 422,
          error instanceof Error ? { cause: error } : undefined));
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > MAX_TOOL_OUTPUT_BYTES) fail(new ServiceError(
        'AUDIO_DECODE_FAILED', 'Audio decoding failed', 422));
    });
    child.once('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(unavailable(error, command));
    });
    child.once('close', exitCode => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) {
        reject(new ServiceError('REQUEST_ABORTED', 'The request was cancelled', 499));
      } else if (timedOut) {
        reject(new ServiceError('MEDIA_TOOL_TIMEOUT', 'Audio decoding timed out', 504));
      } else if (processingError) {
        reject(processingError);
      } else if (exitCode !== 0 || remainder.length !== 0) {
        reject(new ServiceError('AUDIO_DECODE_FAILED', 'Audio decoding failed', 422));
      } else if (frames === 0) {
        reject(new ServiceError('INVALID_AUDIO', 'Decoded audio is empty', 422));
      } else {
        resolve({ sampleRate: probe.sampleRate, channels: channels.map(channel => channel.subarray(0, frames)) });
      }
    });
  });
}

export function createNativeMediaDecoder(options: NativeMediaDecoderOptions = {}): MediaDecoder {
  const ffmpegPath = options.ffmpegPath ?? process.env.LISTENING_FIELD_FFMPEG_PATH ?? 'ffmpeg';
  const ffprobePath = options.ffprobePath ?? process.env.LISTENING_FIELD_FFPROBE_PATH ?? 'ffprobe';
  const probeTimeoutMs = options.probeTimeoutMs ?? PROBE_TIMEOUT_MS;
  const decodeTimeoutMs = options.decodeTimeoutMs ?? DECODE_TIMEOUT_MS;
  return {
    probe: (path, signal) => probeWithFfprobe(path, ffprobePath, probeTimeoutMs, signal),
    decode: (path, probe, signal) => decodeWithFfmpeg(path, probe, ffmpegPath, decodeTimeoutMs, signal),
  };
}
