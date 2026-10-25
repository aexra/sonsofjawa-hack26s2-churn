import { queryOptions, useQuery } from '@tanstack/react-query';

import { apiClient, unwrap } from '@/shared/api/client';

import type { components } from '@/shared/api/schema';
import type { ru } from '@/shared/i18n/ru';

export type ApiKey = components['schemas']['ApiKey'];
export type ApiKeyScope = components['schemas']['ApiKeyScope'];
export type ApiKeyStatus = keyof typeof ru.access.keys.status;

export const API_KEY_SCOPES: ApiKeyScope[] = ['read', 'ingest', 'metrics'];

export const apiKeysQueryOptions = queryOptions({
  queryKey: ['admin', 'api-keys'],
  queryFn: () => unwrap(apiClient.GET('/api/v1/admin/api-keys')),
});

export const useApiKeys = () => useQuery(apiKeysQueryOptions);

export const apiKeyStatus = (key: ApiKey, now = new Date()): ApiKeyStatus => {
  if (key.revokedAt) return 'revoked';
  if (key.expiresAt && new Date(key.expiresAt) <= now) return 'expired';
  return 'active';
};
