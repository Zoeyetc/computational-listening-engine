import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runBenchmark, renderMarkdownReport } from '../evaluation/index.ts';
import { createSyntheticDataset } from '../evaluation/datasets/synthetic.ts';
import { evaluatePcmWithEngine } from './evaluation-engine.mjs';

// Additional local dataset modules export `datasets` with the same PCM input contract.
// Example: npm run benchmark -- --dataset ./fixtures/classical.ts --output ./evaluation-report.md
const args = process.argv.slice(2);
let output = 'evaluation-report.md';
const paths = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output' && args[i + 1]) output = args[++i];
  else if (args[i] === '--dataset' && args[i + 1]) paths.push(args[++i]);
  else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
}
const datasets = paths.length ? [] : [createSyntheticDataset()];
for (const path of paths) {
  const module = await import(pathToFileURL(resolve(path)).href);
  if (!Array.isArray(module.datasets)) throw new TypeError(`${path} must export a datasets array`);
  datasets.push(...module.datasets);
}
const result = await runBenchmark(datasets, evaluatePcmWithEngine);
await writeFile(resolve(output), renderMarkdownReport(result), 'utf8');
console.log(`Generated ${output}: ${result.datasets.length} dataset(s), ${result.datasets.reduce((n, dataset) => n + dataset.cases.length, 0)} case(s).`);
