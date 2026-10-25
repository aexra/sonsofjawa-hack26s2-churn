import { ru } from '@/shared/i18n/ru';

import { Button } from './button';
import { EmptyState } from './empty-state';

export function BlockError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-md border border-line bg-surface">
      <EmptyState
        kind="error"
        title={ru.common.loadFailed}
        text={ru.common.loadFailedText}
        action={<Button onClick={onRetry}>{ru.common.retry}</Button>}
      />
    </div>
  );
}
