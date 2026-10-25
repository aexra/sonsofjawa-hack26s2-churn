import { ru } from '@/shared/i18n/ru';

import { NumberField } from './number-field';

import type { ModelSetting } from '@/entities/model-settings';
import type { DraftValues } from '@/features/model-settings-edit';
import type { Control } from 'react-hook-form';

interface HorizonCardProps {
  settings: ModelSetting[];
  control: Control<DraftValues>;
  disabled: boolean;
}

export function HorizonCard({ settings, control, disabled }: HorizonCardProps) {
  return (
    <section
      aria-labelledby="model-horizon-title"
      className="flex min-w-0 flex-col gap-3 rounded-md border border-line bg-surface p-5"
    >
      <h2 id="model-horizon-title" className="m-0 font-display text-heading">
        {ru.model.horizon.title}
      </h2>
      <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        {settings.map((setting) => (
          <NumberField key={setting.key} setting={setting} control={control} disabled={disabled} />
        ))}
      </div>
    </section>
  );
}
