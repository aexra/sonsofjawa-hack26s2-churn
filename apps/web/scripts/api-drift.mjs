import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const committed = path.join(root, 'src/shared/api/schema.d.ts');
const dir = mkdtempSync(path.join(tmpdir(), 'api-drift-'));
const generated = path.join(dir, 'schema.d.ts');

try {
  execFileSync(
    path.join(root, 'node_modules/.bin/openapi-typescript'),
    [path.join(root, '../../openapi.yaml'), '-o', generated],
    { stdio: 'ignore' },
  );
  if (readFileSync(generated, 'utf8') !== readFileSync(committed, 'utf8')) {
    process.stderr.write('schema.d.ts отличается от openapi.yaml: выполните npm run gen:api\n');
    process.exitCode = 1;
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
