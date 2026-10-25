import { Link } from 'react-router';

import { ru } from '@/shared/i18n/ru';
import { buttonVariants } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';

export function ForbiddenPage() {
  return (
    <EmptyState
      kind="forbidden"
      title={ru.forbidden.title}
      text={ru.forbidden.text}
      action={
        <Link to="/" className={buttonVariants()}>
          {ru.forbidden.action}
        </Link>
      }
    />
  );
}
