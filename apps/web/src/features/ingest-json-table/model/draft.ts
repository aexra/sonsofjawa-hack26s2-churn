import {
  ENTITY_FIELDS,
  type FieldSpec,
  type IngestEntity,
  type RowValues,
} from '@/entities/ingest';

export interface DraftRow {
  key: string;
  values: RowValues;
}

let sequence = 0;
const nextKey = (): string => {
  sequence += 1;
  return `row-${String(sequence)}`;
};

const defaultValue = (spec: FieldSpec): string => {
  if (spec.kind === 'boolean') return 'false';
  if (spec.kind === 'select' && spec.required) return spec.options?.[0] ?? '';
  return '';
};

export const newRow = (entity: IngestEntity): DraftRow => ({
  key: nextKey(),
  values: Object.fromEntries(ENTITY_FIELDS[entity].map((spec) => [spec.key, defaultValue(spec)])),
});

const cellText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

export const rowFromValues = (entity: IngestEntity, values: Record<string, unknown>): DraftRow => {
  const draft = newRow(entity);
  for (const spec of ENTITY_FIELDS[entity]) {
    if (spec.key in values) draft.values[spec.key] = cellText(values[spec.key]);
  }
  return draft;
};

export const mergeById = (current: DraftRow[], incoming: DraftRow[]): DraftRow[] => {
  const result = [...current];
  for (const row of incoming) {
    const id = row.values.id;
    const index = id ? result.findIndex((item) => item.values.id === id) : -1;
    if (index >= 0) {
      const existing = result[index];
      if (existing) result[index] = { key: existing.key, values: row.values };
    } else {
      result.push(row);
    }
  }
  return result;
};
