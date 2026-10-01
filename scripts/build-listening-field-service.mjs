import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const outputDirectory = resolve(root, 'services/listening-field-analysis/dist');
await rm(outputDirectory, { recursive: true, force: true });
await build({
  entryPoints: [resolve(root, 'services/listening-field-analysis/src/server.ts')],
  outfile: resolve(outputDirectory, 'server.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['busboy'],
  sourcemap: true,
  legalComments: 'external',
});
