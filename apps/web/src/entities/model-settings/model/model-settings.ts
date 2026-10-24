import { queryOptions, useQuery } from '@tanstack/react-query';

import { apiClient, unwrap } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

import type { components } from '@/shared/api/schema';

export type ModelSettings = components['schemas']['ModelSettings'];
export type ModelClock = components['schemas']['ModelClock'];
export type ClockMode = components['schemas']['ClockMode'];

export const modelSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.modelSettings,
  queryFn: () => unwrap(apiClient.GET('/api/v1/model/settings')),
});

export const useModelSettings = () => useQuery(modelSettingsQueryOptions);

export const findSettingValue = (settings: ModelSettings | undefined, key: string) =>
  settings?.groups.flatMap((group) => group.settings).find((setting) => setting.key === key)?.value;
