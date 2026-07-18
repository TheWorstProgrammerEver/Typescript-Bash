import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'ts-bash-smoke-'));

try {
  const packOutput = execFileSync('npm', ['pack', '--json', '--pack-destination', root], {
    encoding: 'utf8',
  });
  const [{ filename }] = JSON.parse(packOutput);
  const tarball = join(root, filename);

  writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], {
    cwd: root,
    stdio: 'pipe',
  });

  const manifest = JSON.parse(readFileSync(join(root, 'node_modules', 'ts-bash', 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}), []);
  assert.deepEqual(manifest.engines, { node: '>=22.0.0' });

  const result = execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    "import { bash } from 'ts-bash'; console.log(await bash('printf smoke'))",
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(result, 'smoke\n');
} finally {
  rmSync(root, { force: true, recursive: true });
}
