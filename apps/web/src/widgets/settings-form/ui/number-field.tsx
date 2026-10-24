import { useId } from 'react';
import { Controller, type Control } from 'react-hook-form';

import { ru } from '@/shared/i18n/ru';
import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';

import type { DraftValues, ModelSetting } from '@/features/model-settings-edit';

const unitSuffix = (setting: ModelSetting): string => {
  const unit = ru.model.units[setting.unit];
  return unit === '' ? '' : `, ${unit}`;
};

export const parseNumber = (raw: string): number => (raw === '' ? Number.NaN : Number(raw));

export const displayNumber = (value: number): number | '' => (Number.isNaN(value) ? '' : value);

interface NumberFieldProps {
  setting: ModelSetting;
  control: Control<DraftValues>;
  disabled: boolean;
}

export function NumberField({ setting, control, disabled }: NumberFieldProps) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={`values.${setting.key}`}
      render={({ field, fieldState }) => (
        <Field
          label={`${setting.title}${unitSuffix(setting)}`}
          id={id}
          hint={setting.description}
          error={fieldState.error?.message}
        >
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            mono
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
        </Field>
      )}
    />
  );
}
