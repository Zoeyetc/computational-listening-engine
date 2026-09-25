import { evaluate } from './evaluate.ts';
import { options } from './common.ts';
import type { BenchmarkDataset, EvaluationData, EvaluationOptions } from './types.ts';

/** Engine injection keeps evaluation independent of PCM, algorithms, and products. */
export async function runBenchmark<Input>(datasets: readonly BenchmarkDataset<Input>[],
  engine: (input: Input) => EvaluationData | Promise<EvaluationData>, overrides: Partial<EvaluationOptions> = {}) {
  const config = options(overrides);
  const ids = new Set<string>();
  // Validate identifiers before executing any engine work.
  for (const dataset of datasets) {
    if (!dataset.id.trim() || ids.has(dataset.id)) throw new Error('Dataset IDs must be nonempty and unique');
    ids.add(dataset.id);
    const cases = new Set<string>();
    for (const item of dataset.cases) {
      if (!item.id.trim() || cases.has(item.id)) throw new Error(`Case IDs must be nonempty and unique in ${dataset.id}`);
      cases.add(item.id);
    }
  }
  const results = [];
  for (const dataset of datasets) {
    const cases = [];
    for (const item of dataset.cases) {
      try {
        const prediction = await engine(item.input);
        cases.push({ id: item.id, metrics: evaluate(item.truth, prediction, config) });
      } catch (cause) { throw new Error(`Benchmark failed at ${dataset.id}/${item.id}`, { cause }); }
    }
    results.push({ id: dataset.id, description: dataset.description, cases });
  }
  return { version: '0.1' as const, options: config, datasets: results };
}
export type BenchmarkResult = Awaited<ReturnType<typeof runBenchmark>>;
