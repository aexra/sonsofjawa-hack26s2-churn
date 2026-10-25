import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { runtimeConfig } from '@/shared/config/runtime';

import { createLiveConnection } from './events';
import { bindInvalidation } from './invalidation';

import type { ConnectionStatus, LiveConnection, LiveEventOf, LiveEventType } from './events';

const LiveConnectionContext = createContext<LiveConnection | null>(null);

export function LiveEventsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [connection] = useState(() => createLiveConnection(`${runtimeConfig.apiBaseUrl}/events`));

  useEffect(() => {
    const unbind = bindInvalidation(connection, queryClient);
    connection.connect();
    return () => {
      unbind();
      connection.close();
    };
  }, [connection, queryClient]);

  return <LiveConnectionContext value={connection}>{children}</LiveConnectionContext>;
}

export function useLiveEvent<T extends LiveEventType>(
  type: T,
  handler: (event: LiveEventOf<T>) => void,
): void {
  const connection = useContext(LiveConnectionContext);
  const latest = useRef(handler);

  useEffect(() => {
    latest.current = handler;
  }, [handler]);

  useEffect(
    () => connection?.subscribe(type, (event) => latest.current(event)),
    [connection, type],
  );
}

export function useLiveReconnect(handler: () => void): void {
  const connection = useContext(LiveConnectionContext);
  const latest = useRef(handler);

  useEffect(() => {
    latest.current = handler;
  }, [handler]);

  useEffect(() => connection?.onReconnect(() => latest.current()), [connection]);
}

const subscribeNothing = () => () => undefined;
const connectingStatus = (): ConnectionStatus => 'connecting';

export function useLiveStatus(): ConnectionStatus {
  const connection = useContext(LiveConnectionContext);
  return useSyncExternalStore(
    connection ? connection.onStatus : subscribeNothing,
    connection ? connection.getStatus : connectingStatus,
  );
}
