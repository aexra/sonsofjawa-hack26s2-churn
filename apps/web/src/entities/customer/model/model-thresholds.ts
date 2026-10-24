import { useQuery } from '@tanstack/react-query';

import { apiClient, unwrap } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

import type { components } from '@/shared/api/schema';

interface ModelThresholds {
  graceDays: number | undefined;
  levelHigh: number | undefined;
  levelMedium: number | undefined;
}

const settingValue = (settings: components['schemas']['ModelSettings'], key: string) =>
  settings.groups.flatMap((group) => group.settings).find((setting) => setting.key === key)?.value;

export const useModelThresholds = (): ModelThresholds => {
  const { data } = useQuery({
    queryKey: queryKeys.modelSettings,
    queryFn: () => unwrap(apiClient.GET('/api/v1/model/settings')),
  });
  return {
    graceDays: data && settingValue(data, 'grace_days'),
    levelHigh: data && settingValue(data, 'level_high'),
    levelMedium: data && settingValue(data, 'level_medium'),
  };
};
