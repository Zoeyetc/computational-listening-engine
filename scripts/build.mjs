import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');

// Start clean so removed source modules cannot remain in the published package.
rmSync(dist, { recursive: true, force: true });
const result = spawnSync(process.execPath, [
  join(root, 'node_modules/typescript/bin/tsc'),
  '-p', join(root, 'tsconfig.build.json'),
], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

// TypeScript rewrites runtime imports but retains .ts paths in declarations.
// Match the emitted JavaScript paths without changing any exported symbols.
for (const file of readdirSync(dist, { recursive: true })) {
  if (!file.endsWith('.d.ts')) continue;
  const path = join(dist, file);
  const declaration = readFileSync(path, 'utf8');
  writeFileSync(path, declaration.replace(/(['"])(\.{1,2}\/[^'"\r\n]+)\.ts\1/g, '$1$2.js$1'));
}
