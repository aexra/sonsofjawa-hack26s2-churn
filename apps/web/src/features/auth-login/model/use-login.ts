import { useMutation, useQueryClient } from '@tanstack/react-query';

import { startSession } from '@/entities/session';
import { apiClient, unwrap } from '@/shared/api/client';

import type { components } from '@/shared/api/schema';

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: components['schemas']['LoginRequest']) =>
      unwrap(apiClient.POST('/api/v1/auth/login', { body })),
    onSuccess: (user) => {
      startSession(queryClient, user);
    },
  });
}
