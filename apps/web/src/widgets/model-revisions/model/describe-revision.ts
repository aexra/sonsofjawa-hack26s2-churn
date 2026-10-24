import { allSettings, isWeight, type ModelSettings } from '@/entities/model-settings';
import { ru } from '@/shared/i18n/ru';
import { formatDateTime } from '@/shared/lib/format';
import { formatNumber } from '@/shared/lib/format-number';

import type { components } from '@/shared/api/schema';

type Revision = components['schemas']['ModelRevision'];
type Change = Revision['changes'][number];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asText = (value: unknown): string =>
  typeof value === 'number' ? formatNumber(value) : String(value);

const settingChange = (change: Change, settings: ModelSettings): string | null => {
  const { key, from, to } = change;
  if (typeof key !== 'string') return null;
  const title = allSettings(settings).find((setting) => setting.key === key)?.title ?? key;
  return isWeight(settings, key)
    ? ru.model.revisions.weight(title, asText(from), asText(to))
    : ru.model.revisions.setting(title, asText(from), asText(to));
};

const clockState = (state: unknown): string => {
  if (!isRecord(state)) return ru.model.revisions.clockReal;
  if (state.mode === 'frozen') {
    return typeof state.frozenAt === 'string'
      ? ru.model.revisions.clockFrozenAt(formatDateTime(state.frozenAt))
      : ru.model.revisions.clockFrozen;
  }
  return state.mode === 'shifted' ? ru.model.revisions.clockShifted : ru.model.revisions.clockReal;
};

const clockChange = (change: Change): string =>
  ru.model.revisions.clock(clockState(change.from), clockState(change.to));

export const describeRevision = (revision: Revision, settings: ModelSettings): string => {
  const parts = revision.changes.flatMap((change) => {
    if (revision.source === 'migration') return [ru.model.revisions.migration];
    if (revision.source === 'clock') return [clockChange(change)];
    return settingChange(change, settings) ?? [];
  });
  return parts.length > 0 ? parts.join('; ') : ru.model.revisions.unknown;
};
