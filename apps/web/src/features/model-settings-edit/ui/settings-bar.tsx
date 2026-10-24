import { CircleCheck, CircleDot } from 'lucide-react';

import { allSettings, isWeight, type ModelSettings } from '@/entities/model-settings';
import { ru } from '@/shared/i18n/ru';
import { cn } from '@/shared/lib/cn';
import { formatDateTime } from '@/shared/lib/format';
import { formatNumber } from '@/shared/lib/format-number';
import { Button } from '@/shared/ui/button';

import type { useSettingsEditor } from '../model/use-settings-editor';
import type { ReactNode } from 'react';

export type SettingsEditor = ReturnType<typeof useSettingsEditor>;

const dirtyText = (editor: SettingsEditor): string => {
  const { changes, baseline } = editor;
  if (changes.count === 0) return ru.model.bar.clean;
  const [only] = changes.values;
  if (changes.count === 1 && only) {
    const title =
      allSettings(baseline).find((setting) => setting.key === only.key)?.title ?? only.key;
    const from = formatNumber(only.from);
    const to = formatNumber(only.to);
    return `${ru.model.bar.dirty} ${
      isWeight(baseline, only.key)
        ? ru.model.bar.weightChange(title, from, to)
        : ru.model.bar.settingChange(title, from, to)
    }`;
  }
  if (changes.count === 1) return `${ru.model.bar.dirty} ${ru.model.bar.clockChange}`;
  return `${ru.model.bar.dirty} ${ru.model.bar.manyChanges(changes.count)}`;
};

const frame =
  'sticky top-0 z-10 -mx-4 -mt-4 mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line bg-surface px-4 py-3 md:-mx-8 md:-mt-7 md:mb-6 md:px-8';

function VersionLine({ settings }: { settings: ModelSettings }) {
  return (
    <span className="text-caption text-ink-faint">
      {ru.model.version(settings.modelVersion)}
      {settings.updatedAt &&
        ` · ${ru.model.changedAt(formatDateTime(settings.updatedAt), settings.updatedBy ?? ru.common.emptyValue)}`}
    </span>
  );
}

interface ReadOnlyBarProps {
  settings: ModelSettings;
}

export function ReadOnlyBar({ settings }: ReadOnlyBarProps) {
  return (
    <div className={frame}>
      <div className="flex min-w-0 flex-col gap-1">
        <p role="note" className="m-0 text-ink-muted">
          {ru.model.readOnly}
        </p>
        <VersionLine settings={settings} />
      </div>
    </div>
  );
}

interface SettingsBarProps {
  editor: SettingsEditor;
  impact: ReactNode;
}

export function SettingsBar({ editor, impact }: SettingsBarProps) {
  const clean = !editor.dirty;
  const Icon = clean ? CircleCheck : CircleDot;
  return (
    <div className={frame}>
      <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1">
        <p
          role="status"
          aria-label={ru.model.bar.label}
          className="m-0 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-body"
        >
          <span
            className={cn(
              'inline-flex min-h-6 items-center gap-1.5 rounded-xs py-0.5 pr-2 pl-1.5 text-label',
              clean ? 'bg-risk-low-soft text-risk-low' : 'bg-risk-medium-soft text-risk-medium',
            )}
          >
            <Icon aria-hidden="true" className="size-3.5 shrink-0" />
            {dirtyText(editor)}
          </span>
          <span className="text-ink-muted">{clean ? ru.model.bar.cleanImpact : impact}</span>
        </p>
        <VersionLine settings={editor.baseline} />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={editor.resetDefaults}>
          {ru.model.bar.resetDefaults}
        </Button>
        <Button size="sm" onClick={editor.revert} disabled={clean || editor.saving}>
          {ru.model.bar.revert}
        </Button>
        <Button
          variant="primary"
          size="sm"
          type="submit"
          disabled={clean || !editor.valid || editor.saving}
          loading={editor.saving}
        >
          {editor.saving ? ru.model.bar.saving : ru.model.bar.save}
        </Button>
      </div>
    </div>
  );
}
