import { DEFAULT_OPTIONS, type EvaluationOptions } from './types.ts';

export const ratio = (numerator: number, denominator: number): number | null => denominator ? numerator / denominator : null;
export const mean = (values: readonly number[]): number | null => ratio(values.reduce((a, b) => a + b, 0), values.length);
export function median(values: readonly number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : null;
}
export function finite(value: number, name: string, min = -Infinity): void {
  if (!Number.isFinite(value) || value < min) throw new RangeError(`${name} must be finite and >= ${min}`);
}
export function confidence(value: number | undefined): void {
  if (value !== undefined) {
    finite(value, 'confidence', 0);
    if (value > 1) throw new RangeError('confidence must be <= 1');
  }
}
export function options(overrides: Partial<EvaluationOptions> = {}): EvaluationOptions {
  const result = { ...DEFAULT_OPTIONS, ...overrides };
  for (const [key, value] of Object.entries(result)) finite(value, key, 0);
  if (!Number.isInteger(result.calibrationBins) || result.calibrationBins < 1 || result.calibrationBins > 10000) {
    throw new RangeError('calibrationBins must be an integer from 1 to 10000');
  }
  return result;
}
export function detection(matches: number, reference: number, predicted: number) {
  return { precision: ratio(matches, predicted), recall: ratio(matches, reference),
    f1: ratio(2 * matches, reference + predicted), matches, referenceCount: reference, predictionCount: predicted };
}
/** Deterministic maximum-cardinality bipartite matching. Each event is used once. */
export function matchEvents<R, P>(reference: readonly R[], predicted: readonly P[], eligible: (r: R, p: P) => boolean): [number, number][] {
  const edges = reference.map(r => predicted.flatMap((p, i) => eligible(r, p) ? [i] : []));
  const owners = new Map<number, number>();
  function augment(r: number, seen: Set<number>): boolean {
    for (const p of edges[r]) {
      if (seen.has(p)) continue;
      seen.add(p);
      const owner = owners.get(p);
      if (owner === undefined || augment(owner, seen)) { owners.set(p, r); return true; }
    }
    return false;
  }
  reference.forEach((_, r) => augment(r, new Set()));
  return [...owners].map(([p, r]): [number, number] => [r, p]).sort((a, b) => a[0] - b[0]);
}
