import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';

import { sessionQueryOptions } from '@/entities/session';
import { setSessionExpiredHandler } from '@/shared/api/client';
import { Toaster } from '@/shared/ui/toaster';
import { TooltipProvider } from '@/shared/ui/tooltip';

import { createQueryClient } from './query-client';
import { createRouter } from './router';

const queryClient = createQueryClient();
const router = createRouter();

setSessionExpiredHandler(() => {
  if (!queryClient.getQueryData(sessionQueryOptions.queryKey)) return;
  queryClient.setQueryData(sessionQueryOptions.queryKey, null);
  const { pathname, search } = window.location;
  const next = encodeURIComponent(`${pathname}${search}`);
  void router.navigate(`/login?expired=1&next=${next}`, { replace: true });
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
