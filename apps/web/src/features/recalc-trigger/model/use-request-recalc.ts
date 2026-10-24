import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiClient, unwrap } from '@/shared/api/client';
import { errorMessage } from '@/shared/api/error-message';
import { queryKeys } from '@/shared/api/query-keys';
import { ru } from '@/shared/i18n/ru';

type RecalcScope = 'pending' | 'all';

export function useRequestRecalc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scope: RecalcScope) =>
      unwrap(apiClient.POST('/api/v1/recalc', { params: { query: { scope } } })),
    onSuccess: () => {
      toast.success(ru.ingest.recalc.requested);
      void queryClient.invalidateQueries({ queryKey: queryKeys.recalcStatus });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
