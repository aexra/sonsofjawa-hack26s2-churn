import { describeError } from '@/entities/ingest';

import type { DraftRow } from './draft';
import type { components } from '@/shared/api/schema';

type FieldError = components['schemas']['FieldError'];

export const describeFieldError = (
  rows: readonly DraftRow[],
  errors: readonly FieldError[],
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const error of errors) {
    const row = error.row === undefined ? undefined : rows[error.row - 1];
    if (row && error.field) result[`${row.key}:${error.field}`] = describeError(error);
  }
  return result;
};
