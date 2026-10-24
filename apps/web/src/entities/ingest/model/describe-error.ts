import { ru } from '@/shared/i18n/ru';

import type { components } from '@/shared/api/schema';

type FieldError = components['schemas']['FieldError'];

const REFERENCE_FIELDS: Record<string, string> = {
  ownerId: ru.ingest.errorCodes.unknownOwner,
  serviceId: ru.ingest.errorCodes.unknownService,
};

export const describeError = (error: FieldError): string => {
  if (error.code === 'unknown_reference') {
    return REFERENCE_FIELDS[error.field ?? ''] ?? error.message;
  }
  const codes: Record<string, string | undefined> = ru.ingest.errorCodes;
  return codes[error.code] ?? error.message;
};
