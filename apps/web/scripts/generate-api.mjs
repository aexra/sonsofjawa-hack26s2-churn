import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';
import ts from 'typescript';

export const generateApi = async () => {
  const ast = await openapiTS(new URL('../../../openapi.yaml', import.meta.url));
  const source = ts.createSourceFile(
    'schema.d.ts',
    astToString(ast),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  return ts.createPrinter({ removeComments: true }).printFile(source);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL('../src/shared/api/schema.d.ts', import.meta.url), await generateApi());
}
