import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FakeEventSource } from '@/test/fake-event-source';

import { LiveEventsProvider, useLiveEvent, useLiveStatus } from './live-events';
import { queryKeys } from './query-keys';

import type { ReactNode } from 'react';

const setup = () => {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <LiveEventsProvider>{children}</LiveEventsProvider>
    </QueryClientProvider>
  );
  return { queryClient, wrapper };
};

const seed = (queryClient: QueryClient) => {
  const keys = {
    customers: [...queryKeys.customers, { level: 'high' }],
    customer: [...queryKeys.customer, 5],
    analytics: [...queryKeys.analytics, 'summary'],
    recalcStatus: [...queryKeys.recalcStatus],
    modelSettings: [...queryKeys.modelSettings],
    modelRevisions: [...queryKeys.modelRevisions],
    ingestLog: [...queryKeys.ingestLog],
    source: [...queryKeys.source, 'customers'],
    session: ['session'],
    users: ['admin', 'users'],
  };
  for (const key of Object.values(keys)) queryClient.setQueryData(key, 1);
  return keys;
};

const invalidated = (queryClient: QueryClient, keys: Record<string, unknown[]>) =>
  Object.entries(keys)
    .filter(([, key]) => queryClient.getQueryState(key)?.isInvalidated)
    .map(([name]) => name)
    .sort();

describe('live updates', () => {
  it('keeps one credentialed stream for the whole provider lifetime and closes it on unmount', () => {
    const { wrapper } = setup();

    const { unmount } = render(<span />, { wrapper });
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.current.url).toBe('http://localhost:3000/api/v1/events');
    expect(FakeEventSource.current.withCredentials).toBe(true);

    unmount();
    expect(FakeEventSource.current.readyState).toBe(FakeEventSource.CLOSED);
  });

  it('invalidates customers, customer, analytics and recalc status after a finished recalculation', () => {
    const { queryClient, wrapper } = setup();
    const keys = seed(queryClient);
    render(<span />, { wrapper });

    act(() => {
      FakeEventSource.current.emit('recalc.completed', { runId: 1 });
    });

    expect(invalidated(queryClient, keys)).toEqual(
      ['analytics', 'customer', 'customers', 'recalcStatus'].sort(),
    );
  });

  it('invalidates model queries after the model changes', () => {
    const { queryClient, wrapper } = setup();
    const keys = seed(queryClient);
    render(<span />, { wrapper });

    act(() => {
      FakeEventSource.current.emit('model.updated', { modelVersion: 3 });
    });

    expect(invalidated(queryClient, keys)).toEqual(['modelRevisions', 'modelSettings']);
  });

  it('invalidates journal and source queries after an upload', () => {
    const { queryClient, wrapper } = setup();
    const keys = seed(queryClient);
    render(<span />, { wrapper });

    act(() => {
      FakeEventSource.current.emit('ingest.completed', { entity: 'customers' });
    });

    expect(invalidated(queryClient, keys)).toEqual(['ingestLog', 'source']);
  });

  it('leaves queries alone when a recalculation only starts or fails', () => {
    const { queryClient, wrapper } = setup();
    const keys = seed(queryClient);
    render(<span />, { wrapper });

    act(() => {
      FakeEventSource.current.emit('recalc.started', { runId: 1 });
      FakeEventSource.current.emit('recalc.failed', { runId: 1, error: 'boom' });
    });

    expect(invalidated(queryClient, keys)).toEqual([]);
  });

  it('invalidates every live query, but not the session or admin lists, once the stream recovers', () => {
    const { queryClient, wrapper } = setup();
    const keys = seed(queryClient);
    render(<span />, { wrapper });
    act(() => {
      FakeEventSource.current.open();
      FakeEventSource.current.fail();
      FakeEventSource.current.open();
    });

    expect(invalidated(queryClient, keys)).toEqual(
      [
        'analytics',
        'customer',
        'customers',
        'ingestLog',
        'modelRevisions',
        'modelSettings',
        'recalcStatus',
        'source',
      ].sort(),
    );
  });

  it('passes events to a component through useLiveEvent', () => {
    const { wrapper } = setup();
    const handler = vi.fn();
    const { unmount } = renderHook(() => useLiveEvent('model.updated', handler), { wrapper });

    act(() => {
      FakeEventSource.current.emit('model.updated', { modelVersion: 4, source: 'settings' });
    });
    expect(handler).toHaveBeenCalledExactlyOnceWith({
      type: 'model.updated',
      modelVersion: 4,
      source: 'settings',
    });

    unmount();
  });

  it('always calls the latest handler without resubscribing', () => {
    const { wrapper } = setup();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ handler }) => useLiveEvent('model.updated', handler), {
      wrapper,
      initialProps: { handler: first },
    });

    rerender({ handler: second });
    act(() => {
      FakeEventSource.current.emit('model.updated', {});
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('reports the connection status', () => {
    vi.useFakeTimers();
    const { wrapper } = setup();
    const { result } = renderHook(() => useLiveStatus(), { wrapper });
    expect(result.current).toBe('connecting');

    act(() => {
      FakeEventSource.current.open();
    });
    expect(result.current).toBe('open');

    act(() => {
      FakeEventSource.current.fail();
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current).toBe('offline');
    vi.useRealTimers();
  });
});
