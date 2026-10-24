import { ru } from '@/shared/i18n/ru';

import { ENTITY_FIELDS, type FieldSpec, type IngestEntity } from './fields';

export type RowValues = Record<string, string>;
export type RowIssues = Record<string, string>;

const INTEGER = /^-?\d+$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

export const isBlank = (raw: string | undefined): boolean => (raw ?? '').trim() === '';

const parseDateTime = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!DATETIME.test(trimmed)) return null;
  const time = Date.parse(trimmed);
  return Number.isNaN(time) ? null : time;
};

const validateInteger = (spec: FieldSpec, raw: string): string | null => {
  const trimmed = raw.trim();
  if (!INTEGER.test(trimmed)) return ru.ingest.cell.integer;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) return ru.ingest.cell.tooBig;
  if (spec.min !== undefined && spec.max !== undefined && (value < spec.min || value > spec.max)) {
    return ru.ingest.cell.range(spec.min, spec.max);
  }
  if (spec.min !== undefined && value < spec.min) return ru.ingest.cell.min(spec.min);
  if (spec.max !== undefined && value > spec.max) return ru.ingest.cell.max(spec.max);
  return null;
};

const validateText = (spec: FieldSpec, raw: string): string | null => {
  if (spec.maxLength !== undefined && raw.length > spec.maxLength) {
    return ru.ingest.cell.tooLong(spec.maxLength);
  }
  if (spec.pattern && !spec.pattern.test(raw)) return ru.ingest.cell.pattern;
  return null;
};

export const validateCell = (spec: FieldSpec, raw: string | undefined): string | null => {
  if (isBlank(raw)) return spec.required ? ru.ingest.cell.required : null;
  const value = raw ?? '';
  switch (spec.kind) {
    case 'integer':
      return validateInteger(spec, value);
    case 'text':
      return validateText(spec, value);
    case 'select':
      return spec.options?.includes(value) ? null : ru.ingest.cell.option;
    case 'boolean':
      return value === 'true' || value === 'false' ? null : ru.ingest.cell.boolean;
    case 'datetime':
      return parseDateTime(value) === null ? ru.ingest.cell.datetime : null;
  }
};

const crossCheckService = (values: RowValues, issues: RowIssues): void => {
  const created = parseDateTime(values.createdAt ?? '');
  const expires = parseDateTime(values.expiresAt ?? '');
  if (created !== null && expires !== null && expires < created && !issues.expiresAt) {
    issues.expiresAt = ru.ingest.cell.beforeCreated;
  }
};

const crossCheckTransaction = (values: RowValues, issues: RowIssues): void => {
  const status = values.status ?? '';
  const performed = parseDateTime(values.performedAt ?? '');
  const hasPerformed = !isBlank(values.performedAt);
  if (status === 'not_performed' && hasPerformed && !issues.performedAt) {
    issues.performedAt = ru.ingest.cell.performedMustBeEmpty;
  } else if (status === 'performed' && !hasPerformed && !issues.performedAt) {
    issues.performedAt = ru.ingest.cell.performedRequired;
  } else if (status === '' && hasPerformed && !issues.status) {
    issues.status = ru.ingest.cell.statusMustBePerformed;
  } else if (hasPerformed && !issues.performedAt) {
    const created = parseDateTime(values.createdAt ?? '');
    if (performed !== null && created !== null && performed < created) {
      issues.performedAt = ru.ingest.cell.performedBeforeCreated;
    }
  }
};

export const validateRow = (entity: IngestEntity, values: RowValues): RowIssues => {
  const issues: RowIssues = {};
  for (const spec of ENTITY_FIELDS[entity]) {
    const message = validateCell(spec, values[spec.key]);
    if (message) issues[spec.key] = message;
  }
  if (entity === 'services') crossCheckService(values, issues);
  if (entity === 'transactions') crossCheckTransaction(values, issues);
  return issues;
};

const payloadValue = (spec: FieldSpec, raw: string): unknown => {
  switch (spec.kind) {
    case 'integer':
      return Number(raw.trim());
    case 'boolean':
      return raw === 'true';
    case 'datetime':
    case 'select':
      return raw.trim();
    case 'text':
      return raw;
  }
};

export const toPayload = (entity: IngestEntity, values: RowValues): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};
  for (const spec of ENTITY_FIELDS[entity]) {
    const raw = values[spec.key];
    if (isBlank(raw)) {
      if (spec.nullable) payload[spec.key] = null;
      continue;
    }
    payload[spec.key] = payloadValue(spec, raw ?? '');
  }
  return payload;
};
