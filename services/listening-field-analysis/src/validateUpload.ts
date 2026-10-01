import type { IncomingMessage } from 'node:http';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import busboy from 'busboy';
import type { PcmAudio } from '../../../src/index.ts';
import { ServiceError } from './errors.ts';
import type { AudioProbe } from './types.ts';

export const UPLOAD_LIMITS = Object.freeze({
  maximumEncodedBytes: 25 * 1024 * 1024,
  maximumDurationSeconds: 10 * 60,
  maximumChannels: 8,
  maximumSampleRate: 384_000,
  maximumDecodedBytes: 512 * 1024 * 1024,
});

export type UploadedAudio = Readonly<{ path: string; byteLength: number }>;

export async function receiveAudioUpload(request: IncomingMessage, temporaryDirectory: string,
  signal?: AbortSignal): Promise<UploadedAudio> {
  let parser: ReturnType<typeof busboy>;
  try {
    parser = busboy({
      headers: request.headers,
      limits: {
        fileSize: UPLOAD_LIMITS.maximumEncodedBytes,
        files: 2,
        fields: 10,
        parts: 12,
      },
    });
  } catch (error) {
    throw new ServiceError('INVALID_MULTIPART', 'Expected multipart/form-data', 400,
      error instanceof Error ? { cause: error } : undefined);
  }

  const path = join(temporaryDirectory, 'audio-upload.bin');
  let audioFiles = 0;
  let byteLength = 0;
  let oversized = false;
  const writes: Promise<void>[] = [];

  parser.on('file', (fieldName, stream) => {
    if (fieldName !== 'audio') {
      stream.resume();
      return;
    }
    audioFiles += 1;
    if (audioFiles > 1) {
      stream.resume();
      return;
    }
    stream.on('limit', () => { oversized = true; });
    stream.on('data', (chunk: Buffer) => { byteLength += chunk.byteLength; });
    writes.push(pipeline(stream, createWriteStream(path, { flags: 'wx', mode: 0o600 }), { signal }));
  });

  const completed = new Promise<void>((resolve, reject) => {
    parser.once('close', resolve);
    parser.once('error', reject);
    parser.once('filesLimit', () => reject(
      new ServiceError('MULTIPLE_AUDIO_FILES', 'Exactly one audio file is required', 400)));
    request.once('error', reject);
  });

  request.pipe(parser);
  try {
    await completed;
    await Promise.all(writes);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (signal?.aborted) {
      throw new ServiceError('REQUEST_ABORTED', 'The request was cancelled', 499,
        error instanceof Error ? { cause: error } : undefined);
    }
    throw new ServiceError('INVALID_MULTIPART', 'The multipart upload could not be read', 400,
      error instanceof Error ? { cause: error } : undefined);
  }

  if (oversized) {
    throw new ServiceError('UPLOAD_TOO_LARGE',
      `The audio upload exceeds ${UPLOAD_LIMITS.maximumEncodedBytes} bytes`, 413);
  }
  if (audioFiles === 0) {
    throw new ServiceError('MISSING_AUDIO', 'Multipart field "audio" is required', 400);
  }
  if (audioFiles > 1) {
    throw new ServiceError('MULTIPLE_AUDIO_FILES', 'Exactly one audio file is required', 400);
  }
  if (byteLength === 0) throw new ServiceError('EMPTY_AUDIO', 'The audio file is empty', 400);
  return { path, byteLength };
}

export function validateAudioProbe(probe: AudioProbe): AudioProbe {
  if (!Number.isFinite(probe.sampleRate) || !Number.isInteger(probe.sampleRate)
    || probe.sampleRate <= 0 || probe.sampleRate > UPLOAD_LIMITS.maximumSampleRate) {
    throw new ServiceError('INVALID_SAMPLE_RATE', 'The audio sample rate is invalid', 422);
  }
  if (!Number.isInteger(probe.channelCount) || probe.channelCount <= 0) {
    throw new ServiceError('NO_AUDIO_STREAM', 'The upload contains no usable audio stream', 422);
  }
  if (probe.channelCount > UPLOAD_LIMITS.maximumChannels) {
    throw new ServiceError('TOO_MANY_CHANNELS',
      `Audio with more than ${UPLOAD_LIMITS.maximumChannels} channels is not supported`, 422);
  }
  if (!Number.isFinite(probe.duration) || probe.duration <= 0) {
    throw new ServiceError('INVALID_AUDIO', 'The audio duration is invalid', 422);
  }
  if (probe.duration > UPLOAD_LIMITS.maximumDurationSeconds) {
    throw new ServiceError('AUDIO_TOO_LONG',
      `Audio longer than ${UPLOAD_LIMITS.maximumDurationSeconds} seconds is not supported`, 422);
  }
  const estimatedDecodedBytes = Math.ceil(probe.duration * probe.sampleRate)
    * probe.channelCount * Float32Array.BYTES_PER_ELEMENT;
  if (!Number.isSafeInteger(estimatedDecodedBytes)
    || estimatedDecodedBytes > UPLOAD_LIMITS.maximumDecodedBytes) {
    throw new ServiceError('DECODED_AUDIO_TOO_LARGE',
      'The decoded audio would exceed the service memory limit', 422);
  }

  const formats = new Set(probe.formatNames.map(value => value.toLowerCase()));
  const codec = probe.codecName.toLowerCase();
  const supported = (codec === 'mp3' && formats.has('mp3'))
    || (codec.startsWith('pcm_') && formats.has('wav'))
    || (codec === 'aac' && [...formats].some(format =>
      ['aac', 'mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'].includes(format)))
    || (codec === 'vorbis' && formats.has('ogg'));
  if (!supported) {
    throw new ServiceError('UNSUPPORTED_AUDIO_FORMAT',
      'Supported audio formats are MP3, WAV, M4A/AAC, and OGG/Vorbis', 415);
  }
  return probe;
}

export function validatePcmAudio(audio: PcmAudio): PcmAudio {
  if (!Number.isFinite(audio.sampleRate) || audio.sampleRate <= 0) {
    throw new ServiceError('INVALID_SAMPLE_RATE', 'Decoded audio has an invalid sample rate', 422);
  }
  if (!audio.channels.length || audio.channels.some(channel => channel.length === 0)) {
    throw new ServiceError('INVALID_AUDIO', 'Decoded audio is empty', 422);
  }
  if (audio.channels.length > UPLOAD_LIMITS.maximumChannels) {
    throw new ServiceError('TOO_MANY_CHANNELS', 'Decoded audio has too many channels', 422);
  }
  for (const channel of audio.channels) {
    for (const sample of channel) {
      if (!Number.isFinite(sample)) {
        throw new ServiceError('NON_FINITE_PCM', 'Decoded audio contains a non-finite sample', 422);
      }
    }
  }
  const duration = Math.min(...audio.channels.map(channel => channel.length)) / audio.sampleRate;
  if (duration > UPLOAD_LIMITS.maximumDurationSeconds) {
    throw new ServiceError('AUDIO_TOO_LONG', 'Decoded audio exceeds the duration limit', 422);
  }
  return audio;
}
