import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveEventsProvider } from '@/shared/api/live-events';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { FakeEventSource } from '@/test/fake-event-source';

import { RecalcIndicator } from './recalc-indicator';

const renderIndicator = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <LiveEventsProvider>
          <RecalcIndicator />
        </LiveEventsProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );

const emit = (type: string, data: unknown) =>
  act(() => {
    FakeEventSource.current.emit(type, data);
  });

const localIso = (hours: number, minutes: number) =>
  new Date(2026, 9, 24, hours, minutes).toISOString();

describe('recalc indicator', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date(2026, 9, 24, 9, 30));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the time of loading until the first recalculation event', () => {
    renderIndicator();

    expect(screen.getByRole('status')).toHaveTextContent('обновлено 09:30');
  });

  it('shows the recalculation and then the time it finished', () => {
    renderIndicator();

    emit('recalc.started', { runId: 1, trigger: 'manual' });
    expect(screen.getByRole('status')).toHaveTextContent('пересчёт…');

    emit('recalc.completed', { runId: 1, finishedAt: localIso(15, 4) });
    expect(screen.getByRole('status')).toHaveTextContent('обновлено 15:04');
  });

  it('shows a failed recalculation and recovers on the next one', () => {
    renderIndicator();

    emit('recalc.started', { runId: 1 });
    emit('recalc.failed', { runId: 1, error: 'нет данных' });
    expect(screen.getByRole('status')).toHaveTextContent('ошибка пересчёта');

    emit('recalc.started', { runId: 2 });
    expect(screen.getByRole('status')).toHaveTextContent('пересчёт…');
  });

  it('explains the failure in a tooltip', async () => {
    vi.useRealTimers();
    renderIndicator();

    emit('recalc.failed', { runId: 1, error: 'нет данных' });
    await userEvent.setup().hover(screen.getByRole('status'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('нет данных');
  });

  it('reports lost connection after ten seconds and resyncs when it returns', () => {
    renderIndicator();
    act(() => {
      FakeEventSource.current.open();
    });
    emit('recalc.started', { runId: 1 });

    act(() => {
      FakeEventSource.current.fail();
      vi.advanceTimersByTime(9_999);
    });
    expect(screen.getByRole('status')).toHaveTextContent('пересчёт…');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('status')).toHaveTextContent('нет связи с сервером');

    vi.setSystemTime(new Date(2026, 9, 24, 9, 45));
    act(() => {
      FakeEventSource.current.open();
    });
    expect(screen.getByRole('status')).toHaveTextContent('обновлено 09:45');
  });
});
