import { ru } from '@/shared/i18n/ru';
import { formatMoney } from '@/shared/lib/format';

import type { PreviewState } from '../model/use-model-preview';

export const describeImpact = (state: PreviewState): string => {
  switch (state.kind) {
    case 'loading':
      return ru.model.bar.previewLoading;
    case 'error':
    case 'too-many':
      return ru.model.bar.previewLater;
    case 'invalid':
      return '';
    case 'ready': {
      const { preview } = state;
      const loss = ru.model.bar.loss(
        formatMoney(preview.lossBefore),
        formatMoney(preview.lossAfter),
      );
      return preview.levelChanges > 0
        ? `${ru.model.bar.levelChanges(preview.levelChanges)} · ${loss}`
        : loss;
    }
  }
};
