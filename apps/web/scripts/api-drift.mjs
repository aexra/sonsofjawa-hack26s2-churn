import { readFileSync } from 'node:fs';

import { generateApi } from './generate-api.mjs';

const committed = new URL('../src/shared/api/schema.d.ts', import.meta.url);
if ((await generateApi()) !== readFileSync(committed, 'utf8')) {
  process.stderr.write('schema.d.ts отличается от openapi.yaml: выполните npm run gen:api\n');
  process.exitCode = 1;
}
