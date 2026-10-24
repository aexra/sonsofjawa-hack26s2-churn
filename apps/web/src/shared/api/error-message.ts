import { ru } from '@/shared/i18n/ru';

import { ApiError } from './api-error';

export const errorMessage = (error: unknown): string => {
  if (error instanceof ApiError && error.code) {
    return ru.errors[error.code];
  }
  return ru.errors.network;
};
