import { useQuery } from '@tanstack/react-query';

import { apiClient, unwrap } from '@/shared/api/client';

export function useAuthProviders() {
  return useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: () => unwrap(apiClient.GET('/api/v1/auth/providers')),
    staleTime: 60_000,
    retry: false,
  });
}
