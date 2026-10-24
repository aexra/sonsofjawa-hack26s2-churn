import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient, unwrap } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

import type { ModelSettingsPatch } from './settings';

export function useUpdateModelSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ModelSettingsPatch) =>
      unwrap(apiClient.PATCH('/api/v1/model/settings', { body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.modelRevisions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.recalcStatus });
    },
  });
}
