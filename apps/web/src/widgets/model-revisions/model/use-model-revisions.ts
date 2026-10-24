import { useQuery } from '@tanstack/react-query';

import { apiClient, unwrap } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

export const useModelRevisions = () =>
  useQuery({
    queryKey: queryKeys.modelRevisions,
    queryFn: () => unwrap(apiClient.GET('/api/v1/model/revisions')),
  });
