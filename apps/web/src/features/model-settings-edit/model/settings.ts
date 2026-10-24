import { useQuery } from '@tanstack/react-query';

import { apiClient, unwrap } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

import type { components } from '@/shared/api/schema';

export type ModelSettings = components['schemas']['ModelSettings'];
export type ModelSetting = components['schemas']['ModelSetting'];
export type SettingsGroup = components['schemas']['SettingsGroup'];
export type ClockMode = components['schemas']['ClockMode'];
export type ModelSettingsPatch = components['schemas']['ModelSettingsPatch'];

export const useModelSettings = () =>
  useQuery({
    queryKey: queryKeys.modelSettings,
    queryFn: () => unwrap(apiClient.GET('/api/v1/model/settings')),
  });

export const allSettings = (settings: ModelSettings): ModelSetting[] =>
  settings.groups.flatMap((group) => group.settings);

export const isWeight = (settings: ModelSettings, key: string): boolean =>
  settings.groups.some(
    (group) => group.key === 'weights' && group.settings.some((setting) => setting.key === key),
  );
