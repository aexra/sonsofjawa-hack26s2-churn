import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXCEPTIONS = new Set([
  'ID',
  'API',
  'SSO',
  'OIDC',
  'JWT',
  'URL',
  'HTTP',
  'SSE',
  'KPI',
  'ISO',
  'Authorization',
  'PostgreSQL',
  'Keycloak',
  'Prometheus',
  'Grafana',
  'Swagger',
]);

const UPPER = /^[A-ZА-ЯЁ]/;
const ATTRIBUTE = /\b(?:aria-label|placeholder|alt)\s*=\s*(?:\{\s*)?(["'])((?:(?!\1).)*)\1/g;
const JSX_TEXT = /[>}]([^<>{}]+)(?=[<{])/g;
const STRING_LITERAL = /(['"])((?:\\.|(?!\1)[^\\\n])*)\1(\s*:)?/g;

const lineOf = (source, index) => source.slice(0, index).split('\n').length;

const violates = (text) => {
  const trimmed = text.trim();
  if (!UPPER.test(trimmed)) return false;
  const word = /^[\p{L}\p{N}_-]+/u.exec(trimmed)?.[0] ?? '';
  return !EXCEPTIONS.has(word);
};

const collect = (source, pattern, pick) => {
  const found = [];
  for (const match of source.matchAll(pattern)) {
    const text = pick(match);
    if (text !== null && violates(text)) {
      found.push({ line: lineOf(source, match.index), text: text.trim() });
    }
  }
  return found;
};

export const findViolations = (source, file) => {
  if (file.endsWith('.tsx')) {
    return [
      ...collect(source, ATTRIBUTE, (m) => m[2]),
      ...collect(source, JSX_TEXT, (m) =>
        m[0].startsWith('>') && source[m.index - 1] === '=' ? null : m[1],
      ),
    ];
  }
  return collect(source, STRING_LITERAL, (m) => (m[3] ? null : m[2]));
};

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const main = () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dictionary = path.join(root, 'src/shared/i18n/ru.ts');
  const files = walk(path.join(root, 'src')).filter(
    (file) => (file.endsWith('.tsx') && !file.endsWith('.test.tsx')) || file === dictionary,
  );
  let failed = false;
  for (const file of files) {
    for (const { line, text } of findViolations(readFileSync(file, 'utf8'), file)) {
      failed = true;
      console.error(
        `${path.relative(root, file)}:${String(line)}: "${text}" starts with a capital letter`,
      );
    }
  }
  process.exit(failed ? 1 : 0);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
