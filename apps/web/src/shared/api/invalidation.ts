import { queryKeys } from './query-keys';

import type { LiveConnection, LiveEventType } from './events';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

const INVALIDATION: Record<LiveEventType, readonly QueryKey[]> = {
  'recalc.started': [],
  'recalc.completed': [
    queryKeys.customers,
    queryKeys.customer,
    queryKeys.analytics,
    queryKeys.recalcStatus,
  ],
  'recalc.failed': [],
  'model.updated': [queryKeys.modelSettings, queryKeys.modelRevisions],
  'ingest.completed': [queryKeys.ingestLog, queryKeys.source],
};

const liveRoots = new Set<unknown>(Object.values(queryKeys).map((key) => key[0]));

const invalidate = (queryClient: QueryClient, keys: readonly QueryKey[]) => {
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
};

export const bindInvalidation = (connection: LiveConnection, queryClient: QueryClient) => {
  const unsubscribe = (Object.keys(INVALIDATION) as LiveEventType[]).map((type) =>
    connection.subscribe(type, () => invalidate(queryClient, INVALIDATION[type])),
  );
  unsubscribe.push(
    connection.onReconnect(() => {
      void queryClient.invalidateQueries({
        predicate: (query) => liveRoots.has(query.queryKey[0]),
      });
    }),
  );
  return () => unsubscribe.forEach((off) => off());
};
