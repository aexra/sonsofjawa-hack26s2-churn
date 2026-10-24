import { queryOptions, useQuery } from '@tanstack/react-query';

import { apiClient, unwrap } from '@/shared/api/client';

import type { components } from '@/shared/api/schema';

export type User = components['schemas']['User'];
export type Role = components['schemas']['Role'];

export const ROLES: Role[] = ['admin', 'user'];

export const usersQueryOptions = queryOptions({
  queryKey: ['admin', 'users'],
  queryFn: () => unwrap(apiClient.GET('/api/v1/admin/users')),
});

export const useUsers = () => useQuery(usersQueryOptions);
