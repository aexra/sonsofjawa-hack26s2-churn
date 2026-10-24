import { useQuery } from '@tanstack/react-query';

import { apiClient, unwrap } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

import type { components } from '@/shared/api/schema';

type Schemas = components['schemas'];

export type CustomerDetails = Schemas['CustomerDetails'];
export type CustomerScore = Schemas['CustomerScore'];
export type CustomerService = Schemas['ServiceView'];
export type CustomerTransaction = Schemas['Transaction'];
export type CustomerAnomaly = Schemas['Anomaly'];
export type ScoreHistoryPoint = Schemas['ScoreHistoryPoint'];

const HISTORY_LIMIT = 5000;

export const useCustomer = (id: number) =>
  useQuery({
    queryKey: [...queryKeys.customer, id],
    queryFn: () => unwrap(apiClient.GET('/api/v1/customers/{id}', { params: { path: { id } } })),
  });

export const useCustomerHistory = (id: number) =>
  useQuery({
    queryKey: [...queryKeys.customer, id, 'history'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/api/v1/customers/{id}/history', {
          params: { path: { id }, query: { limit: HISTORY_LIMIT } },
        }),
      ),
  });
