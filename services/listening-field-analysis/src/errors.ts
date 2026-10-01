export type ServiceErrorCode =
  | 'METHOD_NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'INVALID_MULTIPART'
  | 'MISSING_AUDIO'
  | 'MULTIPLE_AUDIO_FILES'
  | 'EMPTY_AUDIO'
  | 'UPLOAD_TOO_LARGE'
  | 'INVALID_AUDIO'
  | 'UNSUPPORTED_AUDIO_FORMAT'
  | 'NO_AUDIO_STREAM'
  | 'AUDIO_TOO_LONG'
  | 'DECODED_AUDIO_TOO_LARGE'
  | 'TOO_MANY_CHANNELS'
  | 'INVALID_SAMPLE_RATE'
  | 'NON_FINITE_PCM'
  | 'AUDIO_DECODE_FAILED'
  | 'MEDIA_TOOL_UNAVAILABLE'
  | 'MEDIA_TOOL_TIMEOUT'
  | 'ANALYSIS_FAILED'
  | 'INVALID_ANALYSIS_RESULT'
  | 'REQUEST_ABORTED'
  | 'INTERNAL_ERROR';

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly status: number;

  constructor(code: ServiceErrorCode, message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ServiceError';
    this.code = code;
    this.status = status;
  }
}

export function asServiceError(error: unknown): ServiceError {
  if (error instanceof ServiceError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return new ServiceError('REQUEST_ABORTED', 'The request was cancelled', 499, { cause: error });
  }
  return new ServiceError('INTERNAL_ERROR', 'The analysis service failed', 500,
    error instanceof Error ? { cause: error } : undefined);
}
