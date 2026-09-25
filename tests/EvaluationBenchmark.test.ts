import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { evaluate, renderMarkdownReport, runBenchmark } from '../evaluation/index.ts';
import { createSyntheticDataset } from '../evaluation/datasets/synthetic.ts';
import { evaluatePcmWithEngine } from '../scripts/evaluation-engine.mjs';

test('benchmark injects an async engine, supports multiple datasets and keeps stable reports', async () => {
  const datasets = ['classical', 'jazz'].map(id => ({ id, description: id, cases: [{ id: 'a', input: 60, truth: { pitch: [{ time: 0, midi: 60 }] } }] }));
  const calls: number[] = [];
  const engine = async (input: number) => { calls.push(input); return { pitch: [{ time: 0, midi: input, confidence: 0.8 }] }; };
  const result = await runBenchmark(datasets, engine);
  assert.deepEqual(calls, [60, 60]);
  assert.equal(result.datasets[0].cases[0].metrics.pitch!.pitchAccuracy, 1);
  const markdown = renderMarkdownReport(result);
  for (const heading of ['Pitch', 'Melody', 'Rhythm', 'Harmony', 'Confidence', 'Summary']) assert.ok(markdown.includes(heading));
  assert.ok(markdown.includes('N/A')); assert.ok(markdown.includes('Mean confidence'));
  assert.equal(renderMarkdownReport(await runBenchmark(datasets, engine)), markdown);
});

test('benchmark validates identities before calling Engine and surfaces case failures', async () => {
  let called = false;
  const dataset = { id: 'x', description: '', cases: [{ id: 'a', input: 0, truth: {} }] };
  await assert.rejects(runBenchmark([dataset, dataset], () => { called = true; return {}; }), /unique/);
  assert.equal(called, false);
  await assert.rejects(runBenchmark([dataset], () => { throw new Error('analysis failed'); }), (error: Error) => error.message === 'Benchmark failed at x/a' && error.cause instanceof Error && error.cause.message === 'analysis failed');
});

test('report escapes dataset text and preserves infinite NLL', async () => {
  const result = await runBenchmark([{ id: 'a|<b>', description: '<script>', cases: [{ id: 'case', input: 0, truth: { pitch: [{ time: 0, midi: 60 }] } }] }], () => ({ pitch: [{ time: 0, midi: 72, confidence: 1 }] }));
  const markdown = renderMarkdownReport(result);
  assert.ok(markdown.includes('a&#124;&lt;b&gt;')); assert.ok(markdown.includes('∞')); assert.ok(!markdown.includes('<script>'));
});

test('real Engine adapter consumes deterministic PCM without mutating it', () => {
  const dataset = createSyntheticDataset();
  const item = dataset.cases.find(item => item.id === 'monophonic-phrase')!;
  const original = item.input.channels[0].slice();
  const first = evaluatePcmWithEngine(item.input);
  const second = evaluatePcmWithEngine(item.input);
  assert.deepEqual(first, second);
  assert.deepEqual(item.input.channels[0], original);
  const result = evaluate(item.truth, first);
  assert.ok(result.pitch!.referenceFrames > 0);
  assert.ok(result.confidence.pitch.count > 0);
});

test('evaluation core has no dependency on listening implementation', () => {
  for (const file of readdirSync(new URL('../evaluation/', import.meta.url), { recursive: true })) {
    if (!String(file).endsWith('.ts')) continue;
    const source = readFileSync(new URL(`../evaluation/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?:from\s*|import\s*\()\s*['"][^'"]*(?:src\/|analysis\/)/);
  }
});
