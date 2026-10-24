import { useMutation, useQueryClient } from '@tanstack/react-query';

import { usersQueryOptions } from '@/entities/user';
import { apiClient, unwrap } from '@/shared/api/client';

import type { components } from '@/shared/api/schema';

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: components['schemas']['UserPatch'] }) =>
      unwrap(
        apiClient.PATCH('/api/v1/admin/users/{id}', { params: { path: { id } }, body: patch }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersQueryOptions.queryKey }),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(apiClient.DELETE('/api/v1/admin/users/{id}', { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersQueryOptions.queryKey }),
  });
}
