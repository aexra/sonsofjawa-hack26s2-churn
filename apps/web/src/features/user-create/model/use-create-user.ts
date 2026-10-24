import { useMutation, useQueryClient } from '@tanstack/react-query';

import { usersQueryOptions } from '@/entities/user';
import { apiClient, unwrap } from '@/shared/api/client';

import type { components } from '@/shared/api/schema';

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: components['schemas']['UserCreate']) =>
      unwrap(apiClient.POST('/api/v1/admin/users', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersQueryOptions.queryKey }),
  });
}
