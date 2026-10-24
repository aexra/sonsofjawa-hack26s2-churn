import { useModelSettings } from '@/entities/model-settings';
import { ru } from '@/shared/i18n/ru';
import { formatDateTime } from '@/shared/lib/format';

export function ModelClock() {
  const settings = useModelSettings();
  if (!settings.data) return null;
  const { mode, asOf } = settings.data.clock;
  return (
    <span className="inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-caption whitespace-nowrap text-ink-muted">
      {ru.clock.moment}&nbsp;
      <b className="font-semibold text-ink tabular-nums">{formatDateTime(asOf)}</b>
      &nbsp;·&nbsp;{ru.clock[mode]}
    </span>
  );
}
