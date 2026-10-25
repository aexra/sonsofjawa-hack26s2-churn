import { toast } from 'sonner';

import { ApiError } from '@/shared/api/api-error';
import { errorMessage } from '@/shared/api/error-message';
import { ru } from '@/shared/i18n/ru';
import { formatDateTime } from '@/shared/lib/format';
import { plural } from '@/shared/lib/plural';

import type { IngestResult } from './upload';
import type { components } from '@/shared/api/schema';

type FieldError = components['schemas']['FieldError'];

export type UploadFailure =
  { kind: 'rejected'; errors: FieldError[] } | { kind: 'too-large' } | { kind: 'unsupported' };

const toFailure = (error: unknown): UploadFailure | null => {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 413) return { kind: 'too-large' };
  if (error.status === 415) return { kind: 'unsupported' };
  if (error.status === 422 || error.status === 400) {
    return { kind: 'rejected', errors: error.errors };
  }
  return null;
};

export const reportUploadError = (error: unknown): UploadFailure | null => {
  const failure = toFailure(error);
  if (!failure) toast.error(errorMessage(error));
  return failure;
};

export const notifyUploaded = (result: IngestResult, label: string): void => {
  toast.success(
    ru.ingest.uploaded(result.rowsApplied, plural(result.rowsApplied, ru.ingest.rowForms)),
    {
      description: `${label} · ${formatDateTime(new Date())}`,
    },
  );
};
