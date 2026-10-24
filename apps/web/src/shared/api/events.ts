import { z } from 'zod';

export const RECONNECT_RETRY_MS = 3000;
export const OFFLINE_AFTER_MS = 10_000;

const payloads = {
  'recalc.started': z.object({
    runId: z.number().optional(),
    trigger: z.string().optional(),
  }),
  'recalc.completed': z.object({
    runId: z.number().optional(),
    trigger: z.string().optional(),
    accountsProcessed: z.number().optional(),
    modelVersion: z.number().optional(),
    asOf: z.string().optional(),
    finishedAt: z.string().optional(),
  }),
  'recalc.failed': z.object({
    runId: z.number().optional(),
    trigger: z.string().optional(),
    error: z.string().optional(),
  }),
  'model.updated': z.object({
    modelVersion: z.number().optional(),
    source: z.string().optional(),
  }),
  'ingest.completed': z.object({
    entity: z.string().optional(),
    mode: z.string().optional(),
    rowsApplied: z.number().optional(),
  }),
} as const;

export type LiveEventType = keyof typeof payloads;

export type LiveEvent = {
  [T in LiveEventType]: { type: T } & z.infer<(typeof payloads)[T]>;
}[LiveEventType];

export type LiveEventOf<T extends LiveEventType> = Extract<LiveEvent, { type: T }>;

export type ConnectionStatus = 'connecting' | 'open' | 'offline';

const LIVE_EVENT_TYPES = Object.keys(payloads) as LiveEventType[];

type Listener<T extends LiveEventType> = (event: LiveEventOf<T>) => void;

export interface LiveConnection {
  connect: () => void;
  subscribe: <T extends LiveEventType>(type: T, listener: Listener<T>) => () => void;
  onReconnect: (listener: () => void) => () => void;
  onStatus: (listener: () => void) => () => void;
  getStatus: () => ConnectionStatus;
  close: () => void;
}

const parseEvent = <T extends LiveEventType>(type: T, raw: unknown): LiveEventOf<T> => {
  let data: unknown = {};
  try {
    data = JSON.parse(String(raw));
  } catch {
    data = {};
  }
  const parsed = payloads[type].safeParse(data);
  return { type, ...(parsed.success ? parsed.data : {}) } as LiveEventOf<T>;
};

export const createLiveConnection = (url: string): LiveConnection => {
  const listeners = new Map<LiveEventType, Set<(event: LiveEvent) => void>>();
  const reconnectListeners = new Set<() => void>();
  const statusListeners = new Set<() => void>();
  let status: ConnectionStatus = 'connecting';
  let source: EventSource | null = null;
  let offlineTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let needsResync = false;
  let closed = true;

  const setStatus = (next: ConnectionStatus) => {
    if (status === next) return;
    status = next;
    statusListeners.forEach((listener) => listener());
  };

  const handleOpen = () => {
    clearTimeout(offlineTimer);
    offlineTimer = undefined;
    setStatus('open');
    if (needsResync) {
      needsResync = false;
      reconnectListeners.forEach((listener) => listener());
    }
  };

  const handleError = (current: EventSource) => {
    needsResync = true;
    offlineTimer ??= setTimeout(() => setStatus('offline'), OFFLINE_AFTER_MS);
    if (current.readyState === EventSource.CLOSED) {
      current.close();
      retryTimer = setTimeout(open, RECONNECT_RETRY_MS);
    }
  };

  function open() {
    if (closed) return;
    const current = new EventSource(url, { withCredentials: true });
    source = current;
    current.addEventListener('open', handleOpen);
    current.addEventListener('error', () => handleError(current));
    for (const type of LIVE_EVENT_TYPES) {
      current.addEventListener(type, (message) => {
        const event = parseEvent(type, message.data);
        listeners.get(type)?.forEach((listener) => listener(event));
      });
    }
  }

  return {
    connect: () => {
      closed = false;
      needsResync = false;
      setStatus('connecting');
      open();
    },
    subscribe: (type, listener) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener as (event: LiveEvent) => void);
      listeners.set(type, set);
      return () => set.delete(listener as (event: LiveEvent) => void);
    },
    onReconnect: (listener) => {
      reconnectListeners.add(listener);
      return () => reconnectListeners.delete(listener);
    },
    onStatus: (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    getStatus: () => status,
    close: () => {
      closed = true;
      clearTimeout(offlineTimer);
      clearTimeout(retryTimer);
      offlineTimer = undefined;
      source?.close();
    },
  };
};
