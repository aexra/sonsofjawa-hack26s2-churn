import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { sessionQueryOptions } from '@/entities/session';
import { apiClient, unwrap } from '@/shared/api/client';

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => unwrap(apiClient.POST('/api/v1/auth/logout')),
    onSettled: async () => {
      queryClient.setQueryData(sessionQueryOptions.queryKey, null);
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== sessionQueryOptions.queryKey[0],
      });
      await navigate('/login', { replace: true });
    },
  });
}
