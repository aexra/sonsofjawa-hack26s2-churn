import { ApiError } from '@/shared/api/api-error';
import { ru } from '@/shared/i18n/ru';

import type { AssistantEvent, ChatErrorKind } from './types';

export const fromEventCode = (code: AssistantEvent['code']): ChatErrorKind => {
  switch (code) {
    case 'assistant_key_invalid':
      return 'keyInvalid';
    case 'assistant_key_forbidden':
      return 'keyForbidden';
    case 'assistant_step_limit':
      return 'stepLimit';
    default:
      return 'unavailable';
  }
};

export const fromRequestError = (error: unknown): ChatErrorKind => {
  if (!(error instanceof ApiError)) return 'network';
  if (error.status === 429) return 'rateLimited';
  if (error.status === 403) return 'forbidden';
  if (error.status === 400 || error.status === 422) return 'validation';
  return 'unavailable';
};

export const isKeyError = (kind: ChatErrorKind | undefined): boolean =>
  kind === 'keyInvalid' || kind === 'keyForbidden';

export const chatErrorText = (kind: ChatErrorKind): string => ru.assistant.errors[kind];
