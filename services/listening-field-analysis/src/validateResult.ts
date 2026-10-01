import { isDeepStrictEqual } from 'node:util';
import type {
  ListeningFieldMelodyState,
  ListeningFieldRecordV1,
} from '../../../adapters/listening-field/index.ts';
import { ServiceError } from './errors.ts';

const STATES = new Set<ListeningFieldMelodyState>([
  'voiced',
  'selected-unvoiced',
  'range-rejected',
]);

function invalid(message: string, cause?: unknown): never {
  throw new ServiceError('INVALID_ANALYSIS_RESULT', message, 500,
    cause instanceof Error ? { cause } : undefined);
}

function verifyPlain(value: unknown, seen: Set<object>): void {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid('Analysis result contains a non-finite number');
    return;
  }
  if (typeof value !== 'object') invalid('Analysis result contains a non-JSON value');
  if (seen.has(value)) invalid('Analysis result contains a cycle');
  seen.add(value);
  if (ArrayBuffer.isView(value)) invalid('Analysis result contains a typed array');
  if (Array.isArray(value)) {
    for (const item of value) verifyPlain(item, seen);
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      invalid('Analysis result contains a non-plain object');
    }
    for (const item of Object.values(value)) verifyPlain(item, seen);
  }
  seen.delete(value);
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === [...expected].sort()[index]);
}

export function validateListeningFieldRecordV1(value: unknown): ListeningFieldRecordV1 {
  verifyPlain(value, new Set());
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid('Analysis result must be an object');
  }
  if (!hasExactKeys(value, ['version', 'sourceDuration', 'melody'])) {
    invalid('Analysis result has an invalid top-level schema');
  }
  const candidate = value as Partial<ListeningFieldRecordV1>;
  if (candidate.version !== 1) invalid('Analysis result version must be 1');
  if (!Number.isFinite(candidate.sourceDuration) || candidate.sourceDuration! < 0) {
    invalid('Analysis result sourceDuration must be finite and non-negative');
  }
  if (!Array.isArray(candidate.melody)) invalid('Analysis result melody must be an array');

  const identifiers = new Set<string>();
  for (const event of candidate.melody!) {
    if (event === null || typeof event !== 'object' || Array.isArray(event)
      || !hasExactKeys(event, ['id', 'start', 'end', 'midi', 'state'])) {
      invalid('Analysis result contains an invalid melody event');
    }
    if (typeof event.id !== 'string' || event.id.length === 0 || identifiers.has(event.id)) {
      invalid('Analysis result melody event IDs must be nonempty and unique');
    }
    identifiers.add(event.id);
    if (!Number.isFinite(event.start) || !Number.isFinite(event.end) || !Number.isFinite(event.midi)) {
      invalid('Analysis result melody values must be finite');
    }
    if (!STATES.has(event.state)) invalid('Analysis result contains an invalid melody state');
    if (event.start < 0 || event.start > event.end || event.end > candidate.sourceDuration!) {
      invalid('Analysis result melody interval is outside sourceDuration');
    }
  }

  let roundTrip: unknown;
  try {
    roundTrip = JSON.parse(JSON.stringify(value));
  } catch (error) {
    invalid('Analysis result is not JSON serializable', error);
  }
  if (!isDeepStrictEqual(roundTrip, value)) invalid('Analysis result does not survive JSON round-trip');
  return value as ListeningFieldRecordV1;
}
