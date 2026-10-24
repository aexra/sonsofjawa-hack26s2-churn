import { Controller } from 'react-hook-form';

import { ClockEditor } from '@/features/model-clock-edit';
import { describeImpact, PreviewCard, useModelPreview } from '@/features/model-preview';
import {
  SettingsBar,
  UnsavedChangesGuard,
  useSettingsEditor,
} from '@/features/model-settings-edit';
import { ru } from '@/shared/i18n/ru';
import { Button } from '@/shared/ui/button';

import { HorizonCard } from './horizon-card';
import { ThresholdsCard } from './thresholds-card';
import { WeightsCard } from './weights-card';

import type { ModelSettings } from '@/entities/model-settings';

interface SettingsFormProps {
  settings: ModelSettings;
  canEdit: boolean;
}

const groupSettings = (settings: ModelSettings, ...keys: string[]) =>
  settings.groups.filter((group) => keys.includes(group.key)).flatMap((group) => group.settings);

export function SettingsForm({ settings, canEdit }: SettingsFormProps) {
  const editor = useSettingsEditor(settings);
  const { form, baseline, draft, changes } = editor;
  const preview = useModelPreview(baseline, draft.values, canEdit);
  const formulas = new Map(
    baseline.features.map((feature) => [feature.weightKey, feature.description]),
  );
  const scoringKeys = new Set(
    groupSettings(baseline, 'weights', 'levels').map((setting) => setting.key),
  );
  const outsidePreview =
    changes.clock || changes.values.some((change) => !scoringKeys.has(change.key));
  const disabled = !canEdit;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (editor.dirty && editor.valid) void editor.save();
      }}
      className="flex flex-col gap-4"
    >
      {canEdit ? (
        <>
          <SettingsBar editor={editor} impact={describeImpact(preview)} />
          <UnsavedChangesGuard dirty={editor.dirty} />
        </>
      ) : (
        <p role="note" className="m-0 rounded-sm bg-surface-sunken px-3 py-2.5 text-ink-muted">
          {ru.model.readOnly}
        </p>
      )}
      {editor.externalChange && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-risk-medium-soft px-3 py-2.5 text-risk-medium"
        >
          <span>{ru.model.external.text}</span>
          <Button size="sm" onClick={editor.refresh}>
            {ru.model.external.refresh}
          </Button>
        </div>
      )}
      {editor.serverMessage && (
        <div role="alert" className="rounded-sm bg-risk-high-soft px-3 py-2.5 text-risk-high">
          {editor.serverMessage}
        </div>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <WeightsCard
          settings={groupSettings(baseline, 'weights')}
          formulas={formulas}
          control={form.control}
          draft={draft.values}
          saved={editor.saved.values}
          error={editor.weightsError}
          disabled={disabled}
        />
        <div className="flex min-w-0 flex-col gap-4">
          {canEdit && <PreviewCard state={preview} outsidePreview={outsidePreview} />}
          <ThresholdsCard
            settings={groupSettings(baseline, 'levels')}
            control={form.control}
            draft={draft.values}
            disabled={disabled}
          />
          <HorizonCard
            settings={groupSettings(baseline, 'horizon', 'quality')}
            control={form.control}
            disabled={disabled}
          />
          <Controller
            control={form.control}
            name="clock"
            render={({ field }) => (
              <ClockEditor
                mode={field.value.mode}
                asOf={field.value.asOf}
                currentAsOf={baseline.clock.asOf}
                onModeChange={(mode) => field.onChange({ ...field.value, mode })}
                onAsOfChange={(asOf) => field.onChange({ ...field.value, asOf })}
                disabled={disabled}
                error={form.formState.errors.clock?.asOf?.message}
              />
            )}
          />
        </div>
      </div>
    </form>
  );
}
