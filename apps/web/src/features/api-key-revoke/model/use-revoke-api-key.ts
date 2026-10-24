import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiKeysQueryOptions } from '@/entities/api-key';
import { apiClient, unwrap } from '@/shared/api/client';

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(apiClient.DELETE('/api/v1/admin/api-keys/{id}', { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiKeysQueryOptions.queryKey }),
  });
}
