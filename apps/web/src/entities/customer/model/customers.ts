import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';

import { apiClient, unwrap } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

import { readListParams, writeListParams, type ListParams } from './list-params';

import type { CustomerField } from './fields';

const REQUIRED_FIELDS: readonly CustomerField[] = ['id', 'scoreStatus', 'noScoreReason'];

export const customersSearch = (
  params: ListParams,
  fields: readonly CustomerField[],
  paged: boolean,
): URLSearchParams => {
  const search = new URLSearchParams();
  search.set('fields', fields.join(','));
  if (params.sort) search.set('sort', `${params.sort.field},${params.sort.dir}`);
  if (params.level.length > 0) search.set('level', params.level.join(','));
  if (params.status.length > 0) search.set('status', params.status.join(','));
  if (params.q !== '') search.set('q', params.q);
  if (params.minScore !== null) search.set('minScore', String(params.minScore));
  if (params.maxScore !== null) search.set('maxScore', String(params.maxScore));
  if (params.hasAnomalies) search.set('hasAnomalies', 'true');
  if (paged) {
    search.set('page', String(params.page));
    search.set('size', String(params.size));
  }
  return search;
};

export const useCustomers = (params: ListParams, fields: readonly CustomerField[]) => {
  const requested = [...fields, ...REQUIRED_FIELDS.filter((field) => !fields.includes(field))];
  const search = customersSearch(params, requested, true).toString();
  return useQuery({
    queryKey: [...queryKeys.customers, search],
    queryFn: () => unwrap(apiClient.GET('/api/v1/customers', { querySerializer: () => search })),
    placeholderData: keepPreviousData,
  });
};

export const useCustomersListParams = () => {
  const [search, setSearch] = useSearchParams();
  const params = useMemo(() => readListParams(search), [search]);
  const latest = useRef(search);
  useEffect(() => {
    latest.current = search;
  }, [search]);
  const update = useCallback(
    (patch: Partial<ListParams>) => {
      const next = writeListParams({ ...readListParams(latest.current), page: 0, ...patch });
      latest.current = next;
      setSearch(next, { replace: true });
    },
    [setSearch],
  );
  return [params, update] as const;
};
