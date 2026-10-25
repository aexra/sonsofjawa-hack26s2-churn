import { useId } from 'react';

import { ru } from '@/shared/i18n/ru';
import { formatDateTime } from '@/shared/lib/format';
import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';

import type { components } from '@/shared/api/schema';

type ClockMode = components['schemas']['ClockMode'];

const MODES: readonly ClockMode[] = ['real', 'frozen', 'shifted'];

const hints = {
  real: ru.model.clock.realHint,
  frozen: ru.model.clock.frozenHint,
  shifted: ru.model.clock.shiftedHint,
} as const;

interface ClockEditorProps {
  mode: ClockMode;
  asOf: string;
  currentAsOf: string;
  onModeChange: (mode: ClockMode) => void;
  onAsOfChange: (asOf: string) => void;
  disabled: boolean;
  error?: string | undefined;
}

export function ClockEditor({
  mode,
  asOf,
  currentAsOf,
  onModeChange,
  onAsOfChange,
  disabled,
  error,
}: ClockEditorProps) {
  const titleId = useId();
  const inputId = useId();
  const name = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-md border border-line bg-surface p-5"
    >
      <h2 id={titleId} className="m-0 font-display text-heading">
        {ru.model.clock.title}
      </h2>
      <div role="radiogroup" aria-labelledby={titleId} className="flex flex-col gap-1">
        {MODES.map((option) => (
          <label key={option} className="flex min-h-7 cursor-pointer items-center gap-2">
            <input
              type="radio"
              name={name}
              value={option}
              checked={mode === option}
              disabled={disabled}
              onChange={() => onModeChange(option)}
              className="m-0 size-4 accent-accent"
            />
            {ru.model.clock[option]}
          </label>
        ))}
      </div>
      {mode !== 'real' && (
        <div className="max-w-65">
          <Field
            label={mode === 'frozen' ? ru.model.clock.frozenLabel : ru.model.clock.shiftedLabel}
            id={inputId}
            error={error}
          >
            <Input
              id={inputId}
              type="datetime-local"
              mono
              value={asOf}
              disabled={disabled}
              invalid={Boolean(error)}
              onChange={(event) => onAsOfChange(event.target.value)}
            />
          </Field>
        </div>
      )}
      <p className="m-0 text-caption text-ink-muted">{hints[mode](formatDateTime(currentAsOf))}</p>
    </section>
  );
}
