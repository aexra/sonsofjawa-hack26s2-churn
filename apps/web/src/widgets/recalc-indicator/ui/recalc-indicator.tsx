import { ru } from '@/shared/i18n/ru';
import { cn } from '@/shared/lib/cn';
import { Tooltip } from '@/shared/ui/tooltip';

import { useRecalcIndicator, type IndicatorState } from '../model/use-recalc-indicator';

const time = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const label = (state: IndicatorState): string => {
  switch (state.kind) {
    case 'idle':
      return ru.recalc.updated(time.format(state.updatedAt));
    case 'running':
      return ru.recalc.running;
    case 'error':
      return ru.recalc.failed;
    case 'offline':
      return ru.recalc.offline;
  }
};

export function RecalcIndicator() {
  const state = useRecalcIndicator();

  const pill = (
    <span
      role="status"
      aria-live="polite"
      tabIndex={state.kind === 'error' ? 0 : undefined}
      data-state={state.kind}
      className={cn(
        'inline-flex h-7 items-center gap-2 rounded-full border border-line bg-surface px-3 text-caption whitespace-nowrap text-ink-muted',
        state.kind === 'error' && 'border-negative text-negative',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-2 rounded-full',
          state.kind === 'idle' && 'bg-positive',
          state.kind === 'running' && 'animate-pulse bg-accent',
          state.kind === 'error' && 'bg-negative',
          state.kind === 'offline' && 'bg-ink-faint',
        )}
      />
      {label(state)}
    </span>
  );

  return state.kind === 'error' ? (
    <Tooltip content={state.message ?? ru.recalc.failedUnknown}>{pill}</Tooltip>
  ) : (
    pill
  );
}
