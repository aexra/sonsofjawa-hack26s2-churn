import { ENTITY_FIELDS, fieldKeys, parseCsv, type IngestEntity } from '@/entities/ingest';

import { newRow, type DraftRow } from './draft';

type PasteResult = { rows: DraftRow[] } | { tooWide: true } | { empty: true };

const normalize = (value: string, kind: string): string => {
  const trimmed = value.trim();
  return kind === 'boolean' ? trimmed.toLowerCase() : trimmed;
};

export const rowsFromClipboard = (entity: IngestEntity, text: string): PasteResult => {
  const parsed = parseCsv(text);
  const table = [parsed.columns, ...parsed.records].filter((cells) =>
    cells.some((cell) => cell !== ''),
  );
  const [first] = table;
  if (!first) return { empty: true };

  const specs = ENTITY_FIELDS[entity];
  const keys = fieldKeys(entity);
  const hasHeader = first.every((cell) => keys.includes(cell.trim()));
  const names = hasHeader ? first.map((cell) => cell.trim()) : keys;
  const body = hasHeader ? table.slice(1) : table;
  if (body.length === 0) return { empty: true };
  if (body.some((cells) => cells.length > names.length)) return { tooWide: true };

  const rows = body.map((cells) => {
    const draft = newRow(entity);
    cells.forEach((cell, index) => {
      const spec = specs.find((item) => item.key === names[index]);
      if (spec) draft.values[spec.key] = normalize(cell, spec.kind);
    });
    return draft;
  });
  return { rows };
};
