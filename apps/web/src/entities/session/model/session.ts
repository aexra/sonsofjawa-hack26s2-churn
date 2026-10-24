import { queryOptions, useQuery } from '@tanstack/react-query';

import { ApiError } from '@/shared/api/api-error';
import { apiClient, unwrap } from '@/shared/api/client';

import type { components } from '@/shared/api/schema';

export type CurrentUser = components['schemas']['CurrentUser'];

export const sessionQueryOptions = queryOptions({
  queryKey: ['session'],
  staleTime: Infinity,
  retry: false,
  queryFn: async (): Promise<CurrentUser | null> => {
    try {
      return await unwrap(apiClient.GET('/api/v1/auth/me'));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
});

export function useSession() {
  const query = useQuery(sessionQueryOptions);
  const user = query.data ?? null;
  return {
    user,
    isAdmin: user?.role === 'admin',
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  };
}
