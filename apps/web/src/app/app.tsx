import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';

import { Toaster } from '@/shared/ui/toaster';
import { TooltipProvider } from '@/shared/ui/tooltip';

import { createQueryClient } from './query-client';
import { createRouter } from './router';
import { bindSessionExpiry } from './session-expiry';

const queryClient = createQueryClient();
const router = createRouter();

bindSessionExpiry(queryClient);

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
