import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiKeysQueryOptions } from '@/entities/api-key';
import { apiClient, unwrap } from '@/shared/api/client';

import type { components } from '@/shared/api/schema';

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: components['schemas']['ApiKeyCreate']) =>
      unwrap(apiClient.POST('/api/v1/admin/api-keys', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiKeysQueryOptions.queryKey }),
  });
}
