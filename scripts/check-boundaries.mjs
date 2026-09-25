import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

const sourceRoot = resolve('src');
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs']);
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const forbiddenProduct = /\b(?:Zland|ZoeApp|SignalConsole|SignalPlayer|AudioWorld|PhysicsWorld|Carousel|FerrisWheel|DropTower|RollerCoaster|ParkMap)\b/;
const forbiddenBrowser = /\b(?:AudioBuffer|MediaStream|AudioContext|AudioWorklet|MediaDevices|navigator|document)\b/;
const violations = [];

function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) { inspect(file); continue; }
    if (!sourceExtensions.has(extname(file))) continue;
    const text = readFileSync(file, 'utf8');
    const name = relative(sourceRoot, file);
    if (forbiddenProduct.test(text)) violations.push(`${name}: product-owned symbol`);
    if (forbiddenBrowser.test(text)) violations.push(`${name}: browser-owned API`);
    for (const match of text.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2];
      if (!specifier.startsWith('.')) {
        violations.push(`${name}: external import ${specifier}`);
      } else {
        const target = resolve(dirname(file), specifier);
        const escaped = relative(sourceRoot, target);
        if (escaped === '..' || escaped.startsWith('../')) violations.push(`${name}: source escape ${specifier}`);
      }
    }
  }
}

inspect(sourceRoot);
if (violations.length) {
  console.error(['Engine boundary violations:', ...violations.map(item => `- ${item}`)].join('\n'));
  process.exitCode = 1;
} else {
  console.log('Engine product, browser, and import boundaries passed.');
}
