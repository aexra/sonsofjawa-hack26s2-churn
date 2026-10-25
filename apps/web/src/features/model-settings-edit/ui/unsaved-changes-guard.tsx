import { useRef } from 'react';
import { useBlocker } from 'react-router';

import { ru } from '@/shared/i18n/ru';
import { AlertDialog } from '@/shared/ui/alert-dialog';

export function UnsavedChangesGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  const confirmed = useRef(false);
  return (
    <AlertDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (open) return;
        if (confirmed.current) {
          confirmed.current = false;
          return;
        }
        if (blocker.state === 'blocked') blocker.reset();
      }}
      title={ru.model.leave.title}
      confirmLabel={ru.model.leave.confirm}
      cancelLabel={ru.model.leave.cancel}
      onConfirm={() => {
        if (blocker.state !== 'blocked') return;
        confirmed.current = true;
        blocker.proceed();
      }}
    >
      {ru.model.leave.text}
    </AlertDialog>
  );
}
