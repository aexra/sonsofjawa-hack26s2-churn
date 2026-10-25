import { queryOptions, useQuery } from '@tanstack/react-query';

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

export const churnChartQueryOptions = queryOptions({
  queryKey: [...queryKeys.analytics, 'churn-chart', CHART_PARAMS],
  queryFn: () =>
    unwrap(apiClient.GET('/api/v1/analytics/churn-chart', { params: { query: CHART_PARAMS } })),
});

export const useAnalyticsSummary = () => useQuery(analyticsSummaryQueryOptions);

export const useChurnChart = () => useQuery(churnChartQueryOptions);
