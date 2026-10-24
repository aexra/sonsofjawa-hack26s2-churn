import { useQuery } from '@tanstack/react-query';

import { apiClient, unwrap } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

import type { PreviewCustomer } from './compute';
import type { CustomerRow } from '@/entities/customer';

const FIELDS = 'id,riskScore,riskLevel,reasons,revenueHorizon,securedAmount';
const PAGE_SIZE = 500;
const PREVIEW_CUSTOMER_LIMIT = 5000;

const fetchPage = (page: number) => {
  const search = new URLSearchParams({
    status: 'scored',
    fields: FIELDS,
    size: String(PAGE_SIZE),
    page: String(page),
  }).toString();
  return unwrap(apiClient.GET('/api/v1/customers', { querySerializer: () => search }));
};

const toPreviewCustomer = (row: CustomerRow): PreviewCustomer[] =>
  row.id === undefined ||
  typeof row.riskScore !== 'number' ||
  !row.riskLevel ||
  row.revenueHorizon == null
    ? []
    : [
        {
          id: row.id,
          riskScore: row.riskScore,
          riskLevel: row.riskLevel,
          reasons: row.reasons ?? [],
          gap: Math.max(row.revenueHorizon - (row.securedAmount ?? 0), 0),
        },
      ];

export const usePreviewCustomers = (enabled: boolean) =>
  useQuery({
    queryKey: [...queryKeys.customers, 'model-preview'],
    enabled,
    queryFn: async () => {
      const first = await fetchPage(0);
      if (first.totalItems > PREVIEW_CUSTOMER_LIMIT) {
        return { tooMany: true as const, customers: [] };
      }
      const rest = await Promise.all(
        Array.from({ length: Math.max(first.totalPages - 1, 0) }, (_, index) =>
          fetchPage(index + 1),
        ),
      );
      return {
        tooMany: false as const,
        customers: [first, ...rest].flatMap((page) => page.items.flatMap(toPreviewCustomer)),
      };
    },
  });
