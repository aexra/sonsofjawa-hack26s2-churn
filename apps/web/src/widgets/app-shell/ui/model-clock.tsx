import { useModelSettings } from '@/entities/model-settings';
import { ru } from '@/shared/i18n/ru';
import { formatDateTime } from '@/shared/lib/format';

export function ModelClock() {
  const settings = useModelSettings();
  if (!settings.data) return null;
  const { mode, asOf } = settings.data.clock;
  return (
    <span className="text-caption text-ink-muted">
      {ru.clock.moment} <b className="font-medium text-ink tabular-nums">{formatDateTime(asOf)}</b>{' '}
      · {ru.clock[mode]}
    </span>
  );
}
