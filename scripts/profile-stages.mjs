/** Development-only source-copy instrumentation. No src/ file or published artifact is modified. */
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir, cpus, platform, arch } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'cle-stage-profile-'));
cpSync(join(root, 'src'), join(temporary, 'src'), { recursive: true });
writeFileSync(join(temporary, 'package.json'), '{"type":"module"}\n');

function replaceOnce(source, target, replacement, name) {
  const first = source.indexOf(target);
  if (first < 0 || source.indexOf(target, first + target.length) >= 0) {
    throw new Error(`Instrumentation anchor missing or ambiguous: ${name}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + target.length);
}
function instrument(relative, transform) {
  const path = join(temporary, 'src', relative);
  writeFileSync(path, transform(readFileSync(path, 'utf8')));
}

instrument('analysis/AudioAnalysis.ts', original => {
  let source = original;
  source = replaceOnce(source,
    'function finalize(frames: RawFrame[], mono: Float32Array, pcm: PcmAudio): ListeningMap {\n',
    'function finalize(frames: RawFrame[], mono: Float32Array, pcm: PcmAudio): ListeningMap {\n  const __p = globalThis.__CLE_STAGE_PROFILE__;\n  const __prepStart = performance.now();\n', 'finalize entry');
  source = replaceOnce(source,
    '  const rhythmAnalysis = analyzeRhythm(\n',
    "  __p.add('general_map_preparation', performance.now() - __prepStart);\n  const rhythmAnalysis = __p.time('rhythm', () => analyzeRhythm(\n", 'rhythm entry');
  source = replaceOnce(source,
    '    REAL_AUDIO_ANALYSIS.hopSize / pcm.sampleRate,\n  );\n  const percussionAnalysis = analyzePercussion(',
    "    REAL_AUDIO_ANALYSIS.hopSize / pcm.sampleRate,\n  ));\n  const percussionAnalysis = __p.time('percussion', () => analyzePercussion(", 'rhythm exit and percussion entry');
  source = replaceOnce(source,
    '  })), duration, pcm.sampleRate, REAL_AUDIO_ANALYSIS.hopSize / pcm.sampleRate);\n  const rhythm: RhythmSection[] | null',
    '  })), duration, pcm.sampleRate, REAL_AUDIO_ANALYSIS.hopSize / pcm.sampleRate));\n  const rhythm: RhythmSection[] | null', 'percussion exit');
  source = replaceOnce(source,
    '  const melodyResult = analyzeMelodyWithEvidence({ mono, sampleRate: pcm.sampleRate });',
    "  const melodyResult = __p.time('melody_total', () => analyzeMelodyWithEvidence({ mono, sampleRate: pcm.sampleRate }));", 'melody');
  source = replaceOnce(source,
    '  const harmonyAnalysis = analyzeHarmony({ mono, sampleRate: pcm.sampleRate });',
    "  const harmonyAnalysis = __p.time('harmony', () => analyzeHarmony({ mono, sampleRate: pcm.sampleRate }));", 'harmony');
  source = replaceOnce(source,
    '  const tonalCenterAnalysis = analyzeTonalCenter(harmonyAnalysis, duration);',
    "  const tonalCenterAnalysis = __p.time('tonal_center', () => analyzeTonalCenter(harmonyAnalysis, duration));", 'tonal center');
  source = replaceOnce(source,
    '  const structuralFrames = normalized.map(frame => {',
    "  const structureAnalysis = __p.time('structure', () => {\n  const structuralFrames = normalized.map(frame => {", 'structure preparation');
  source = replaceOnce(source,
    '  const structureAnalysis = analyzeStructure(\n    structuralFrames, duration, rhythmAnalysis.available ? rhythmAnalysis.beats : null,\n  );\n  const metadata:',
    '  return analyzeStructure(\n    structuralFrames, duration, rhythmAnalysis.available ? rhythmAnalysis.beats : null,\n  );\n  });\n  const __finalStart = performance.now();\n  const metadata:', 'structure exit');
  source = replaceOnce(source,
    '  return {\n    version: 1, duration,\n',
    '  const __result = {\n    version: 1, duration,\n', 'final map entry');
  source = replaceOnce(source,
    '    analysis: metadata,\n  };\n}\n\nfunction validatePcm',
    "    analysis: metadata,\n  };\n  __p.add('final_map_assembly', performance.now() - __finalStart);\n  return __result;\n}\n\nfunction validatePcm", 'final map exit');
  const asyncAnchor = 'export async function analyzePcmListeningAsync(pcm: PcmAudio): Promise<ListeningMap> {';
  const split = source.indexOf(asyncAnchor);
  if (split < 0) throw new Error('Missing async analysis entry');
  let asynchronous = source.slice(split);
  asynchronous = replaceOnce(asynchronous,
    '  const mono = downmixToMono(pcm.channels);',
    "  const mono = globalThis.__CLE_STAGE_PROFILE__.time('pcm_downmix', () => downmixToMono(pcm.channels));", 'async downmix');
  asynchronous = replaceOnce(asynchronous,
    '  const frames: RawFrame[] = [];',
    '  const frames: RawFrame[] = [];\n  const __frameStart = performance.now();\n  let __yieldWall = 0;', 'frame loop entry');
  asynchronous = replaceOnce(asynchronous,
    '    if (index % 24 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));',
    "    if (index % 24 === 0) {\n      const __yieldStart = performance.now();\n      await new Promise<void>(resolve => setTimeout(resolve, 0));\n      const __elapsed = performance.now() - __yieldStart;\n      __yieldWall += __elapsed;\n      globalThis.__CLE_STAGE_PROFILE__.add('async_yield_wall', __elapsed);\n      globalThis.__CLE_STAGE_PROFILE__.count('async_yield_count');\n    }", 'async yield');
  asynchronous = replaceOnce(asynchronous,
    '  return finalize(frames, mono, pcm);',
    "  globalThis.__CLE_STAGE_PROFILE__.add('pcm_general_frames', performance.now() - __frameStart - __yieldWall);\n  return finalize(frames, mono, pcm);", 'frame loop exit');
  return source.slice(0, split) + asynchronous;
});

instrument('analysis/MelodyAnalysis.ts', original => {
  const split = original.indexOf('function runMelodyAnalysis(');
  if (split < 0) throw new Error('Missing Melody analysis entry');
  let source = original.slice(split);
  source = replaceOnce(source,
    '  const signal = resampleForAnalysis(input.mono, input.sampleRate);',
    "  const __p = globalThis.__CLE_STAGE_PROFILE__;\n  const signal = __p.time('melody_resampling', () => resampleForAnalysis(input.mono, input.sampleRate));", 'Melody resampling');
  source = replaceOnce(source,
    '  const frames = candidateFrames(signal, collectDpDiagnostics);',
    "  const frames = __p.time('melody_candidates', () => candidateFrames(signal, collectDpDiagnostics));", 'Melody candidates');
  source = replaceOnce(source,
    '  const pathResult = choosePath(frames, collectDpDiagnostics, localObjectiveVariant, ambiguityPenalty);',
    "  const pathResult = __p.time('melody_path', () => choosePath(frames, collectDpDiagnostics, localObjectiveVariant, ambiguityPenalty));", 'Melody path');
  source = replaceOnce(source,
    '  const contourResult = contourFromPath(frames, path);',
    "  const contourResult = __p.time('melody_contour', () => contourFromPath(frames, path));", 'Melody contour');
  source = replaceOnce(source,
    '  const segmented = segmentNotes(contour, frames, duration);',
    "  const segmented = __p.time('melody_notes', () => segmentNotes(contour, frames, duration));", 'Melody note segmentation');
  source = replaceOnce(source,
    '  const evidenceFrames: MelodyEvidenceBuildFrame[] = frames.map((frame, index) => {',
    '  const __evidenceStart = performance.now();\n  const evidenceFrames: MelodyEvidenceBuildFrame[] = frames.map((frame, index) => {', 'Melody evidence entry');
  source = replaceOnce(source,
    '  return { analysis, evidence, dpDiagnostics: pathResult.diagnostics };',
    "  __p.add('melody_evidence_packing', performance.now() - __evidenceStart);\n  return { analysis, evidence, dpDiagnostics: pathResult.diagnostics };", 'Melody evidence exit');
  return original.slice(0, split) + source;
});

const measurements = new Map();
globalThis.__CLE_STAGE_PROFILE__ = {
  add(name, elapsed) { measurements.set(name, (measurements.get(name) ?? 0) + elapsed); },
  count(name) { measurements.set(name, (measurements.get(name) ?? 0) + 1); },
  time(name, run) {
    const start = performance.now();
    try { return run(); } finally { this.add(name, performance.now() - start); }
  },
};
const instrumented = await import(pathToFileURL(join(temporary, 'src/analysis/AudioAnalysis.ts')).href);
const original = await import(new URL('../src/analysis/AudioAnalysis.ts', import.meta.url));

function signal(seconds) {
  const sampleRate = 48_000;
  const samples = new Float32Array(seconds * sampleRate);
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const root = Math.floor(time / 2) % 2 === 0 ? 110 : 146.8323839587038;
    const melody = Math.floor(time / 0.75) % 3 === 0 ? 440 : Math.floor(time / 0.75) % 3 === 1 ? 523.2511306011972 : 659.2551138257398;
    const clickPhase = time % 0.5;
    const click = clickPhase < 0.012 ? 0.22 * Math.sin(2 * Math.PI * 1200 * clickPhase) * (1 - clickPhase / 0.012) : 0;
    samples[index] = 0.20 * Math.sin(2 * Math.PI * root * time)
      + 0.16 * Math.sin(2 * Math.PI * melody * time)
      + 0.10 * Math.sin(2 * Math.PI * root * 1.5 * time) + click;
  }
  return { sampleRate, channels: [samples] };
}
const inputs = new Map([2, 6, 12].map(seconds => [seconds, signal(seconds)]));
const clear = () => measurements.clear();
const snapshot = () => Object.fromEntries(measurements);
async function run(pcm) {
  clear();
  const start = performance.now();
  const map = await instrumented.analyzePcmListeningAsync(pcm);
  const wall = performance.now() - start;
  return { map, wall, stages: snapshot() };
}
// A semantic check guards source-copy instrumentation against accidental output changes.
for (const [seconds, pcm] of inputs) {
  const reference = await original.analyzePcmListeningAsync(pcm);
  const check = await run(pcm);
  if (!isDeepStrictEqual(reference, check.map)) throw new Error(`Instrumented output differs at ${seconds} seconds`);
}
const warmups = 3;
const repetitions = 25;
for (let i = 0; i < warmups; i += 1) for (const pcm of inputs.values()) await run(pcm);
const samples = Object.fromEntries([...inputs.keys()].map(seconds => [seconds, []]));
for (let repetition = 0; repetition < repetitions; repetition += 1) {
  for (const [seconds, pcm] of inputs) {
    const { map, wall, stages } = await run(pcm);
    const melodyPieces = ['melody_resampling', 'melody_candidates', 'melody_path',
      'melody_contour', 'melody_notes', 'melody_evidence_packing'];
    const nonOverlapping = ['pcm_downmix', 'pcm_general_frames', 'general_map_preparation',
      'rhythm', 'percussion', 'melody_total', 'harmony', 'tonal_center', 'structure', 'final_map_assembly'];
    stages.compute_total = wall - (stages.async_yield_wall ?? 0);
    stages.melody_other = stages.melody_total - melodyPieces.reduce((sum, name) => sum + (stages[name] ?? 0), 0);
    stages.melody_temporal = stages.melody_total - stages.melody_resampling
      - stages.melody_candidates - stages.melody_evidence_packing;
    stages.unattributed = stages.compute_total - nonOverlapping.reduce((sum, name) => sum + (stages[name] ?? 0), 0);
    if (stages.melody_other < -1e-9 || stages.unattributed < -1e-9) throw new Error('Stage timings overlap');
    samples[seconds].push({ wall, stages, structureFrames: map.structureAnalysis?.frames.length ?? 0,
      structureMatrixSize: map.structureAnalysis?.selfSimilarity.size ?? 0 });
  }
}
const quantile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
};
const names = [...new Set(Object.values(samples).flatMap(runs => runs.flatMap(run => Object.keys(run.stages))))].sort();
const summary = Object.fromEntries(Object.entries(samples).map(([seconds, runs]) => [seconds, {
  wall: { median: quantile(runs.map(run => run.wall), 0.5), p95: quantile(runs.map(run => run.wall), 0.95) },
  stages: Object.fromEntries(names.map(name => [name, {
    median: quantile(runs.map(run => run.stages[name] ?? 0), 0.5),
    p95: quantile(runs.map(run => run.stages[name] ?? 0), 0.95),
  }])),
  structureFrames: runs[0].structureFrames, structureMatrixSize: runs[0].structureMatrixSize,
}]));
console.log(JSON.stringify({ method: 'temporary source-copy wall-clock instrumentation',
  node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model,
  warmups, repetitions, sampleRate: 48_000, channels: 1, durations: [2, 6, 12],
  semanticEqualityCheck: true, summary }, null, 2));
