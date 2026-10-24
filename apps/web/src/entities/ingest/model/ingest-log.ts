import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiClient, unwrap } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

import type { components } from '@/shared/api/schema';

export type IngestLogEntry = components['schemas']['IngestLogEntry'];

export const useIngestLog = (page: number, size: number) =>
  useQuery({
    queryKey: [...queryKeys.ingestLog, { page, size }],
    queryFn: () =>
      unwrap(apiClient.GET('/api/v1/source/ingest-log', { params: { query: { page, size } } })),
    placeholderData: keepPreviousData,
  });
