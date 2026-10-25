import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';

import { apiClient, unwrap } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

import type { components } from '@/shared/api/schema';

export type AnalyticsSummary = components['schemas']['AnalyticsSummary'];
export type ChurnChart = components['schemas']['ChurnChart'];
export type ChurnChartPoint = components['schemas']['ChurnChartPoint'];
export type RecalcRun = components['schemas']['RecalcRun'];

const CHART_PARAMS = { pastDays: 90 };

export const analyticsSummaryQueryOptions = queryOptions({
  queryKey: [...queryKeys.analytics, 'summary'],
  queryFn: () => unwrap(apiClient.GET('/api/v1/analytics/summary')),
});

export const useAnalyticsSummary = () => useQuery(analyticsSummaryQueryOptions);

export const useForecastComparison = (includeMl: boolean) =>
  useQuery({
    queryKey: [...queryKeys.analytics, 'model-comparison', CHART_PARAMS, includeMl],
    queryFn: ({ signal }) =>
      unwrap(
        apiClient.GET('/api/v1/analytics/model-comparison', {
          params: { query: { ...CHART_PARAMS, includeMl } },
          signal,
        }),
      ),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      includeMl && query.state.data?.mlState !== 'ready' ? 10000 : false,
  });
