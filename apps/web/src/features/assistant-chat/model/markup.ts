export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'customer'; id: string };

export type Block =
  | { kind: 'paragraph'; lines: Inline[][] }
  | { kind: 'heading'; content: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'table'; header: Inline[][]; rows: Inline[][][] };

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|(?<![\p{L}\p{N}_&/])#(\d{1,18})(?![\p{L}\p{N}_])/gu;

const parseInline = (text: string): Inline[] => {
  const result: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) result.push({ kind: 'text', text: text.slice(last, match.index) });
    const [, strong, code, customer] = match;
    if (strong !== undefined) result.push({ kind: 'strong', children: parseInline(strong) });
    else if (code !== undefined) result.push({ kind: 'code', text: code });
    else if (customer !== undefined) result.push({ kind: 'customer', id: customer });
    last = match.index + match[0].length;
  }
  if (last < text.length) result.push({ kind: 'text', text: text.slice(last) });
  return result;
};

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const cells = (line: string): Inline[][] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => parseInline(cell.trim()));

export const parseMarkup = (source: string): Block[] => {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (line.trim() === '') {
      index += 1;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', content: parseInline(heading[1] ?? '') });
      index += 1;
      continue;
    }
    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[index + 1] ?? '')) {
      const header = cells(line);
      const rows: Inline[][][] = [];
      index += 2;
      while (index < lines.length && TABLE_ROW.test(lines[index] ?? '')) {
        rows.push(cells(lines[index] ?? ''));
        index += 1;
      }
      blocks.push({ kind: 'table', header, rows });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet ?? numbered) {
      const ordered = Boolean(numbered);
      const pattern = ordered ? NUMBERED : BULLET;
      const items: Inline[][] = [];
      let item = pattern.exec(lines[index] ?? '');
      while (index < lines.length && item) {
        items.push(parseInline(item[1] ?? ''));
        index += 1;
        item = pattern.exec(lines[index] ?? '');
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    const paragraph: Inline[][] = [];
    while (index < lines.length) {
      const current = lines[index] ?? '';
      if (
        current.trim() === '' ||
        HEADING.test(current) ||
        BULLET.test(current) ||
        NUMBERED.test(current) ||
        (TABLE_ROW.test(current) && TABLE_RULE.test(lines[index + 1] ?? ''))
      ) {
        break;
      }
      paragraph.push(parseInline(current));
      index += 1;
    }
    blocks.push({ kind: 'paragraph', lines: paragraph });
  }
  return blocks;
};
