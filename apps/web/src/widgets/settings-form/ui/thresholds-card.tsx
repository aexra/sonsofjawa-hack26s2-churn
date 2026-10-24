import { ru } from '@/shared/i18n/ru';
import { formatNumber } from '@/shared/lib/format-number';

import { NumberField } from './number-field';

import type { ModelSetting } from '@/entities/model-settings';
import type { DraftValues } from '@/features/model-settings-edit';
import type { Control } from 'react-hook-form';

const LEVEL_HIGH = 'level_high';
const LEVEL_MEDIUM = 'level_medium';

function Scale({ medium, high }: { medium: number; high: number }) {
  return (
    <>
      <div aria-hidden="true" className="flex h-2 overflow-hidden rounded-full">
        <span className="bg-risk-low" style={{ flex: medium }} />
        <span className="bg-risk-medium-fill" style={{ flex: high - medium }} />
        <span className="bg-risk-high" style={{ flex: 100 - high }} />
      </div>
      <div className="flex justify-between font-mono text-caption text-ink-muted">
        <span>{`0 · ${ru.model.levels.low}`}</span>
        <span>{`${formatNumber(medium)} · ${ru.model.levels.medium}`}</span>
        <span>{`${formatNumber(high)} · ${ru.model.levels.high}`}</span>
        <span>100</span>
      </div>
    </>
  );
}

interface ThresholdsCardProps {
  settings: ModelSetting[];
  control: Control<DraftValues>;
  draft: Record<string, number>;
  disabled: boolean;
}

export function ThresholdsCard({ settings, control, draft, disabled }: ThresholdsCardProps) {
  const medium = draft[LEVEL_MEDIUM];
  const high = draft[LEVEL_HIGH];
  const ordered =
    medium !== undefined &&
    high !== undefined &&
    Number.isFinite(medium) &&
    Number.isFinite(high) &&
    medium >= 0 &&
    medium < high &&
    high <= 100;
  return (
    <section
      aria-labelledby="model-levels-title"
      className="flex flex-col gap-3 rounded-md border border-line bg-surface p-5"
    >
      <h2 id="model-levels-title" className="m-0 font-display text-heading">
        {ru.model.levels.title}
      </h2>
      <div className="grid grid-cols-1 items-start gap-x-3 gap-y-3 sm:grid-cols-2">
        {settings.map((setting) => (
          <NumberField key={setting.key} setting={setting} control={control} disabled={disabled} />
        ))}
      </div>
      {ordered && <Scale medium={medium} high={high} />}
    </section>
  );
}
