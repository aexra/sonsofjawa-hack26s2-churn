import { allSettings, isWeight } from '@/entities/model-settings';
import { ru } from '@/shared/i18n/ru';
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

interface SettingsBarProps {
  editor: SettingsEditor;
  impact: ReactNode;
}

export function SettingsBar({ editor, impact }: SettingsBarProps) {
  const clean = !editor.dirty;
  return (
    <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-accent-soft px-6 py-2.5">
      <p
        role="status"
        aria-label={ru.model.bar.label}
        className="m-0 min-w-0 flex-1 basis-60 text-body"
      >
        <b className="font-semibold">{dirtyText(editor)}</b>
        <span className="text-ink-muted"> · {clean ? ru.model.bar.cleanImpact : impact}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
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
          disabled={clean || !editor.valid}
          loading={editor.saving}
        >
          {editor.saving ? ru.model.bar.saving : ru.model.bar.save}
        </Button>
      </div>
    </div>
  );
}
