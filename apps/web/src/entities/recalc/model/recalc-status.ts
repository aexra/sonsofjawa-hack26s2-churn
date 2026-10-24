import { useQuery } from '@tanstack/react-query';

import { apiClient, unwrap } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

import type { components } from '@/shared/api/schema';

export type RecalcStatus = components['schemas']['RecalcStatus'];
export type RecalcRun = components['schemas']['RecalcRun'];

export const useRecalcStatus = () =>
  useQuery({
    queryKey: queryKeys.recalcStatus,
    queryFn: () => unwrap(apiClient.GET('/api/v1/recalc/status')),
  });
