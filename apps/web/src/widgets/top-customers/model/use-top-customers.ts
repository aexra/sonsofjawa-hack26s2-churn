import { queryOptions, useQuery } from '@tanstack/react-query';

import { apiClient, unwrap } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

const TOP_SIZE = 10;

const topCustomersQueryOptions = queryOptions({
  queryKey: [...queryKeys.customers, 'top-loss'],
  queryFn: () =>
    unwrap(
      apiClient.GET('/api/v1/customers', {
        params: {
          query: {
            size: TOP_SIZE,
            sort: ['expectedLoss,desc'],
            level: ['high', 'medium'],
            fields: ['id', 'email', 'riskScore', 'riskLevel', 'topReason', 'expectedLoss'],
          },
        },
        querySerializer: { array: { style: 'form', explode: false } },
      }),
    ),
});

export const useTopCustomers = () => useQuery(topCustomersQueryOptions);
