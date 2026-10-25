import { queryOptions, useQuery } from '@tanstack/react-query';

import {
  customersSearch,
  EMPTY_FILTER,
  type CustomerField,
  type ListParams,
} from '@/entities/customer';
import { apiClient, unwrap } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

const TOP_SIZE = 10;

const TOP_PARAMS: ListParams = {
  ...EMPTY_FILTER,
  level: ['high', 'medium'],
  sort: { field: 'expectedLoss', dir: 'desc' },
  page: 0,
  size: 25,
};

const TOP_FIELDS: readonly CustomerField[] = [
  'id',
  'email',
  'riskScore',
  'riskLevel',
  'topReason',
  'expectedLoss',
  'scoreStatus',
];

const topSearch = () => {
  const search = customersSearch(TOP_PARAMS, TOP_FIELDS, false);
  search.set('size', String(TOP_SIZE));
  return search.toString();
};

const topCustomersQueryOptions = queryOptions({
  queryKey: [...queryKeys.customers, 'top-loss'],
  queryFn: () => unwrap(apiClient.GET('/api/v1/customers', { querySerializer: () => topSearch() })),
});

export const useTopCustomers = () => useQuery(topCustomersQueryOptions);
