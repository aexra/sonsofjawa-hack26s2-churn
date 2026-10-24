import { ru } from '@/shared/i18n/ru';
import { EmptyState } from '@/shared/ui/empty-state';

export function ModelPage() {
  return <EmptyState kind="empty" title={ru.stub.title} text={ru.stub.text} />;
}
