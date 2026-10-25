import { z } from 'zod';

import {
  allSettings,
  type ClockMode,
  type ModelSettings,
  type ModelSettingsPatch,
} from '@/entities/model-settings';
import { ru } from '@/shared/i18n/ru';
import { fromLocalInput, toLocalInput } from '@/shared/lib/local-datetime';

export interface DraftValues {
  values: Record<string, number>;
  clock: { mode: ClockMode; asOf: string };
}

interface ValueChange {
  key: string;
  from: number;
  to: number;
}

interface DraftChanges {
  values: ValueChange[];
  clock: boolean;
  count: number;
}

export const WEIGHTS_SUM_KEY = '$weights';
const LEVEL_HIGH = 'level_high';
const LEVEL_MEDIUM = 'level_medium';

export const toDraft = (settings: ModelSettings): DraftValues => ({
  values: Object.fromEntries(allSettings(settings).map((setting) => [setting.key, setting.value])),
  clock: { mode: settings.clock.mode, asOf: toLocalInput(settings.clock.asOf) },
});

export const defaultsDraft = (settings: ModelSettings, current: DraftValues): DraftValues => ({
  ...current,
  values: Object.fromEntries(
    allSettings(settings).map((setting) => [setting.key, setting.defaultValue]),
  ),
});

export const buildSchema = (settings: ModelSettings) => {
  const shape = Object.fromEntries(
    allSettings(settings).map((setting) => {
      let value = z
        .number({ error: ru.model.fieldErrors.number })
        .min(setting.min, ru.model.fieldErrors.range(setting.min, setting.max))
        .max(setting.max, ru.model.fieldErrors.range(setting.min, setting.max));
      if (setting.unit === 'count') value = value.int(ru.model.fieldErrors.integer);
      return [setting.key, value];
    }),
  );
  const weightKeys = settings.groups
    .filter((group) => group.key === 'weights')
    .flatMap((group) => group.settings.map((setting) => setting.key));

  return z
    .object({
      values: z.object(shape),
      clock: z.object({
        mode: z.enum(['real', 'frozen', 'shifted']),
        asOf: z.string(),
      }),
    })
    .superRefine((draft, context) => {
      const values: Record<string, number> = draft.values;
      const weights = weightKeys.map((key) => values[key]);
      if (weights.every((weight) => weight !== undefined && Number.isFinite(weight))) {
        const sum = weights.reduce<number>((total, weight) => total + (weight ?? 0), 0);
        if (sum <= 0) {
          context.addIssue({
            code: 'custom',
            path: ['values', WEIGHTS_SUM_KEY],
            message: ru.model.fieldErrors.weightsSum,
          });
        }
      }
      const medium = values[LEVEL_MEDIUM];
      const high = values[LEVEL_HIGH];
      if (
        medium !== undefined &&
        high !== undefined &&
        Number.isFinite(medium) &&
        Number.isFinite(high) &&
        medium >= high
      ) {
        context.addIssue({
          code: 'custom',
          path: ['values', LEVEL_MEDIUM],
          message: ru.model.fieldErrors.mediumBelowHigh,
        });
      }
      if (draft.clock.mode !== 'real' && fromLocalInput(draft.clock.asOf) === null) {
        context.addIssue({
          code: 'custom',
          path: ['clock', 'asOf'],
          message: ru.model.clock.asOfRequired,
        });
      }
    });
};

export const diffDraft = (saved: DraftValues, draft: DraftValues): DraftChanges => {
  const values = Object.entries(draft.values)
    .filter(([key, value]) => !Object.is(saved.values[key], value))
    .map(([key, to]) => ({ key, from: saved.values[key] ?? Number.NaN, to }));
  const clock =
    draft.clock.mode !== saved.clock.mode ||
    (draft.clock.mode !== 'real' && draft.clock.asOf !== saved.clock.asOf);
  return { values, clock, count: values.length + (clock ? 1 : 0) };
};

export const toPatch = (changes: DraftChanges, draft: DraftValues): ModelSettingsPatch => {
  const patch: ModelSettingsPatch = {};
  if (changes.values.length > 0) {
    patch.values = Object.fromEntries(changes.values.map((change) => [change.key, change.to]));
  }
  if (changes.clock) {
    const asOf = fromLocalInput(draft.clock.asOf);
    patch.clock =
      draft.clock.mode === 'real' || asOf === null
        ? { mode: draft.clock.mode }
        : { mode: draft.clock.mode, asOf };
  }
  return patch;
};
