import { Link } from 'react-router';

import { ru } from '@/shared/i18n/ru';
import { buttonVariants } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';

export function NotFoundPage() {
  return (
    <EmptyState
      kind="empty"
      title={ru.notFound.title}
      text={ru.notFound.text}
      action={
        <Link to="/" className={buttonVariants()}>
          {ru.notFound.action}
        </Link>
      }
    />
  );
}
