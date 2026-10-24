import { useReducer } from 'react';

import { useLiveEvent, useLiveReconnect, useLiveStatus } from '@/shared/api/live-events';

import type { LiveEventOf } from '@/shared/api/events';

export type IndicatorState =
  | { kind: 'idle'; updatedAt: Date }
  | { kind: 'running' }
  | { kind: 'error'; message: string | undefined }
  | { kind: 'offline' };

type Action =
  | { type: 'started' }
  | { type: 'completed'; at: Date }
  | { type: 'failed'; message: string | undefined }
  | { type: 'resynced'; at: Date };

const reduce = (_state: IndicatorState, action: Action): IndicatorState => {
  switch (action.type) {
    case 'started':
      return { kind: 'running' };
    case 'completed':
    case 'resynced':
      return { kind: 'idle', updatedAt: action.at };
    case 'failed':
      return { kind: 'error', message: action.message };
  }
};

const finishedAt = (event: LiveEventOf<'recalc.completed'>): Date => {
  const parsed = event.finishedAt ? new Date(event.finishedAt) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

export function useRecalcIndicator(): IndicatorState {
  const [state, dispatch] = useReducer(reduce, undefined, (): IndicatorState => ({
    kind: 'idle',
    updatedAt: new Date(),
  }));
  const status = useLiveStatus();

  useLiveEvent('recalc.started', () => dispatch({ type: 'started' }));
  useLiveEvent('recalc.completed', (event) =>
    dispatch({ type: 'completed', at: finishedAt(event) }),
  );
  useLiveEvent('recalc.failed', (event) => dispatch({ type: 'failed', message: event.error }));
  useLiveReconnect(() => dispatch({ type: 'resynced', at: new Date() }));

  return status === 'offline' ? { kind: 'offline' } : state;
}
