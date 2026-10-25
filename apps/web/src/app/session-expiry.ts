import { hasSession, markSessionExpired } from '@/entities/session';
import { setSessionExpiredHandler } from '@/shared/api/client';

import type { QueryClient } from '@tanstack/react-query';

export const bindSessionExpiry = (queryClient: QueryClient): void => {
  setSessionExpiredHandler(() => {
    if (hasSession(queryClient)) markSessionExpired(queryClient);
  });
};
