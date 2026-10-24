import { queryOptions } from '@tanstack/react-query';

import { apiClient, unwrap } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

import type { IngestEntity } from './fields';

export const MAX_IDS = 500;

const idsSerializer = { array: { style: 'form', explode: false } } as const;

export const listSourceRows = async (
  entity: IngestEntity,
  ids: number[],
  size: number,
): Promise<{ items: Record<string, unknown>[]; totalItems: number }> => {
  const options = { params: { query: { ids, size } }, querySerializer: idsSerializer };
  switch (entity) {
    case 'accounts':
      return unwrap(apiClient.GET('/api/v1/source/accounts', options));
    case 'services':
      return unwrap(apiClient.GET('/api/v1/source/services', options));
    case 'transactions':
      return unwrap(apiClient.GET('/api/v1/source/transactions', options));
  }
};

export const sourceTotalQuery = (entity: IngestEntity, enabled: boolean) =>
  queryOptions({
    queryKey: [...queryKeys.source, entity, 'total'],
    queryFn: async () => (await listSourceRows(entity, [], 1)).totalItems,
    enabled,
  });
