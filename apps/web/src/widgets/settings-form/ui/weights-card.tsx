import { Info } from 'lucide-react';
import { Controller, type Control } from 'react-hook-form';

import { ru } from '@/shared/i18n/ru';
import { formatPercent } from '@/shared/lib/format';
import { formatNumber } from '@/shared/lib/format-number';
import { Input } from '@/shared/ui/input';
import { Slider } from '@/shared/ui/slider';
import { Tooltip } from '@/shared/ui/tooltip';

import { displayNumber, parseNumber } from './number-field';

import type { DraftValues, ModelSetting } from '@/features/model-settings-edit';

interface WeightRowProps {
  setting: ModelSetting;
  control: Control<DraftValues>;
  formula: string | undefined;
  total: number;
  changed: boolean;
  disabled: boolean;
}

function WeightRow({ setting, control, formula, total, changed, disabled }: WeightRowProps) {
  return (
    <Controller
      control={control}
      name={`values.${setting.key}`}
      render={({ field, fieldState }) => {
        const share = total > 0 && Number.isFinite(field.value) ? field.value / total : null;
        return (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-line py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_4.5rem]">
            <div className="col-span-2 flex min-w-0 flex-col gap-0.5 md:col-span-1">
              <span className="flex items-center gap-1.5 text-body-strong">
                {setting.title}
                {changed && (
                  <span
                    role="img"
                    aria-label={ru.model.weights.changed}
                    className="size-1.5 rounded-full bg-accent"
                  />
                )}
                {formula !== undefined && (
                  <Tooltip content={formula}>
                    <button
                      type="button"
                      aria-label={ru.model.weights.formula(setting.title)}
                      className="inline-grid size-5 cursor-help place-items-center rounded-full text-ink-faint hover:text-ink"
                    >
                      <Info aria-hidden="true" className="size-3.5" />
                    </button>
                  </Tooltip>
                )}
              </span>
              <span className="text-caption text-ink-muted">{setting.description}</span>
              <span className="text-caption text-ink-faint">
                {ru.model.weights.defaultValue(formatNumber(setting.defaultValue))}
              </span>
            </div>
            <Slider
              label={setting.title}
              value={field.value}
              min={setting.min}
              max={setting.max}
              disabled={disabled}
              onValueChange={field.onChange}
            />
            <Input
              type="number"
              inputMode="decimal"
              mono
              aria-label={ru.model.weights.inputLabel(setting.title)}
              className="w-20 text-right"
              min={setting.min}
              max={setting.max}
              disabled={disabled}
              invalid={Boolean(fieldState.error)}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={displayNumber(field.value)}
              onChange={(event) => field.onChange(parseNumber(event.target.value))}
            />
            <span className="col-span-full text-caption text-ink-muted tabular-nums md:col-span-1 md:text-right">
              {share === null ? ru.common.emptyValue : ru.model.weights.share(formatPercent(share))}
            </span>
            {fieldState.error && (
              <span className="col-span-full text-caption text-negative">
                {fieldState.error.message}
              </span>
            )}
          </div>
        );
      }}
    />
  );
}

interface WeightsCardProps {
  settings: ModelSetting[];
  formulas: ReadonlyMap<string, string>;
  control: Control<DraftValues>;
  draft: Record<string, number>;
  saved: Record<string, number>;
  error: string | undefined;
  disabled: boolean;
}

export function WeightsCard({
  settings,
  formulas,
  control,
  draft,
  saved,
  error,
  disabled,
}: WeightsCardProps) {
  const total = settings.reduce((sum, setting) => {
    const value = draft[setting.key];
    return sum + (value !== undefined && Number.isFinite(value) ? value : 0);
  }, 0);
  return (
    <section
      aria-labelledby="model-weights-title"
      className="flex min-w-0 flex-col gap-1 rounded-md border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="model-weights-title" className="m-0 font-display text-heading">
          {ru.model.weights.title}
        </h2>
        <span className="text-caption text-ink-muted">
          {ru.model.weights.relative(formatNumber(total))}
        </span>
      </div>
      {error && (
        <p role="alert" className="m-0 text-caption text-negative">
          {error}
        </p>
      )}
      <div className="flex flex-col">
        {settings.map((setting) => (
          <WeightRow
            key={setting.key}
            setting={setting}
            control={control}
            formula={formulas.get(setting.key)}
            total={total}
            changed={!Object.is(draft[setting.key], saved[setting.key])}
            disabled={disabled}
          />
        ))}
      </div>
    </section>
  );
}
