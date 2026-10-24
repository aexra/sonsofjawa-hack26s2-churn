import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

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

const expiredQueryKey = ['session-expired'] as const;

export const startSession = (queryClient: QueryClient, user: CurrentUser): void => {
  queryClient.removeQueries({ queryKey: expiredQueryKey });
  queryClient.setQueryData(sessionQueryOptions.queryKey, user);
};

export const hasSession = (queryClient: QueryClient): boolean =>
  Boolean(queryClient.getQueryData(sessionQueryOptions.queryKey));

export const markSessionExpired = (queryClient: QueryClient): void => {
  queryClient.setQueryData(expiredQueryKey, true);
  queryClient.setQueryData(sessionQueryOptions.queryKey, null);
};

export function useSession() {
  const queryClient = useQueryClient();
  const query = useQuery(sessionQueryOptions);
  const user = query.data ?? null;
  return {
    user,
    isAdmin: user?.role === 'admin',
    expired: queryClient.getQueryData(expiredQueryKey) === true,
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  };
}
