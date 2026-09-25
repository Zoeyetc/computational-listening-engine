import type { BenchmarkResult } from './benchmark.ts';
import type { ConfidenceMetrics } from './confidence.ts';

const value = (v: number | null) => v === null ? 'N/A' : Number.isFinite(v) ? v.toFixed(4) : '∞';
const escape = (v: string) => v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '&#124;').replace(/[\r\n]/g, ' ').replaceAll('`', '&#96;').replaceAll('*', '&#42;').replaceAll('_', '&#95;');
const table = (headers: string[], rows: string[][]) => ['| ' + headers.join(' | ') + ' |', '| ' + headers.map(() => '---').join(' | ') + ' |', ...rows.map(row => '| ' + row.join(' | ') + ' |'), ''].join('\n');
const metrics = (rows: [string, number | null][]) => table(['Metric', 'Value'], rows.map(([name, v]) => [name, value(v)]));
function calibration(name: string, result: ConfidenceMetrics) {
  if (!result.count) return `##### ${name}\n\nN/A — no scored confidence claims.\n`;
  return [`##### ${name}`, '', metrics([['Observations', result.count], ['Weight', result.weight], ['ECE', result.ece], ['MCE', result.mce], ['Brier Score', result.brierScore], ['Negative Log Likelihood', result.negativeLogLikelihood]]),
    table(['Confidence bin', 'Count', 'Weight', 'Mean confidence', 'Observed accuracy'], result.reliabilityCurve.map((bin, i, bins) => [
      `[${bin.lower.toFixed(2)}, ${bin.upper.toFixed(2)}${i === bins.length - 1 ? ']' : ')'}`, String(bin.count), value(bin.weight), value(bin.meanConfidence), value(bin.accuracy),
    ]))].join('\n');
}
export function renderMarkdownReport(result: BenchmarkResult): string {
  const lines = ['# Computational Listening Engine — Evaluation v0.1', '',
    'Metrics only. Higher accuracy, precision, recall, F1 and continuity are better; lower error, fragmentation and calibration loss are better. Times are seconds. Rates are 0–1. N/A means no applicable denominator or annotation, not a perfect score.', '',
    '## Summary', '',
    `Datasets: ${result.datasets.length}. Cases: ${result.datasets.reduce((n, dataset) => n + dataset.cases.length, 0)}. Results are shown per case; no average mixes unrelated domains or datasets.`, '',
    'Synthetic fixtures exercise the pipeline; they do not establish real-world accuracy or calibrated probabilities. Continuity and fragmentation measure output stability proxies, not robustness to recording changes. Missing predictions are scored as misses where defined; inspect coverage and tempo availability alongside conditional errors.', '',
    'Confidence evaluates emitted claims against ground truth, separately by domain. Pitch/note/tempo observations have unit weight; chord/key observations are duration weighted. No confidence is inferred for missing predictions, beat strength, or candidate scores. Sparse bins do not establish calibration.', '',
    table(['Dataset / case', 'Pitch accuracy', 'Note F1', 'Beat F1', 'Chord accuracy', 'Continuity', 'Fragmentation'], result.datasets.flatMap(dataset => dataset.cases.map(item => [escape(`${dataset.id} / ${item.id}`), value(item.metrics.pitch?.pitchAccuracy ?? null), value(item.metrics.melody?.notes.f1 ?? null), value(item.metrics.rhythm?.beats.f1 ?? null), value(item.metrics.harmony?.chordAccuracy ?? null), value(item.metrics.melody?.pitchPathContinuity ?? null), value(item.metrics.melody?.trackFragmentation ?? null)]))),
    '### Evaluation configuration', '', table(['Parameter', 'Value'], Object.entries(result.options).map(([key, v]) => [key, String(v)]))];
  for (const dataset of result.datasets) {
    lines.push(`## Dataset: ${escape(dataset.id)}`, '', escape(dataset.description), '');
    for (const item of dataset.cases) {
      const { pitch: p, melody: m, rhythm: r, harmony: h, confidence: c } = item.metrics;
      lines.push(`### Case: ${escape(item.id)}`, '', '#### Pitch', '');
      lines.push(p ? metrics([['Pitch Accuracy', p.pitchAccuracy], ['Cent Error (mean absolute)', p.centError], ['Octave Error Rate', p.octaveErrorRate], ['Voiced Precision', p.voiced.precision], ['Voiced Recall', p.voiced.recall], ['Voiced F1', p.voiced.f1], ['Reference frames', p.referenceFrames], ['Aligned frames', p.alignedFrames], ['Alignment coverage', p.alignmentCoverage], ['Jointly voiced frames', p.jointlyVoicedFrames]]) : 'N/A — no pitch annotation.\n');
      if (p) lines.push('Voiced/Unvoiced Confusion Matrix (frame counts):', '', table(['Truth \\ Prediction', 'Voiced', 'Unvoiced / missing'], [['Voiced', String(p.confusionMatrix.voicedVoiced), String(p.confusionMatrix.voicedUnvoiced)], ['Unvoiced', String(p.confusionMatrix.unvoicedVoiced), String(p.confusionMatrix.unvoicedUnvoiced)]]));
      lines.push('#### Melody', '', m ? metrics([['Note Precision', m.notes.precision], ['Note Recall', m.notes.recall], ['Note F1', m.notes.f1], ['Reference notes', m.notes.referenceCount], ['Predicted notes', m.notes.predictionCount], ['Matched notes', m.notes.matches], ['Onset Error (mean absolute)', m.onsetError], ['Offset Error (mean absolute)', m.offsetError], ['Timing matched notes', m.timingMatchedNotes], ['Pitch-path Continuity', m.pitchPathContinuity], ['Track Fragmentation', m.trackFragmentation]]) : 'N/A — no melody annotation.\n');
      lines.push('#### Rhythm', '', r ? metrics([['Tempo Error (BPM)', r.tempoErrorBpm], ['Tempo reference available (0/1)', Number(r.tempoReferenceAvailable)], ['Tempo prediction available (0/1)', Number(r.tempoPredictionAvailable)], ['Beat Precision', r.beats.precision], ['Beat Recall', r.beats.recall], ['Beat F1', r.beats.f1], ['Reference beats', r.beats.referenceCount], ['Predicted beats', r.beats.predictionCount], ['Matched beats', r.beats.matches], ['Beat Alignment Error', r.beatAlignmentError], ['Median Beat Offset (prediction − truth)', r.medianBeatOffset]]) : 'N/A — no rhythm annotation.\n');
      lines.push('#### Harmony', '', h ? metrics([['Chord Accuracy', h.chordAccuracy], ['Top-2 Accuracy', h.top2Accuracy], ['Chord reference seconds', h.chordReferenceSeconds], ['Chord coverage', h.chordCoverage], ['Tonal Center Accuracy', h.tonalCenterAccuracy], ['Key reference seconds', h.keyReferenceSeconds], ['Key coverage', h.keyCoverage], ['Key Transition Accuracy (intersection / union)', h.keyTransitionAccuracy], ['Reference key transitions', h.keyTransitions.referenceCount], ['Predicted key transitions', h.keyTransitions.predictionCount], ['Matched key transitions', h.keyTransitions.matches]]) : 'N/A — no harmony annotation.\n');
      if (h) lines.push('Chord Confusion Matrix (duration in seconds):', '', table(['Truth', 'Prediction', 'Seconds'], h.chordConfusionMatrix.map(row => [escape(row.reference ?? '(no chord)'), escape(row.missing ? '(missing)' : row.predicted ?? '(no chord)'), value(row.seconds)])));
      lines.push('#### Confidence', '', ...Object.entries(c).map(([name, data]) => calibration(name, data)));
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}
