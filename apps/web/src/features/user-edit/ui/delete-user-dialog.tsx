import { toast } from 'sonner';

import { errorMessage } from '@/shared/api/error-message';
import { ru } from '@/shared/i18n/ru';
import { AlertDialog } from '@/shared/ui/alert-dialog';

import { useDeleteUser } from '../model/use-user-mutations';

import type { User } from '@/entities/user';

interface DeleteUserDialogProps {
  user: User | null;
  onClose: () => void;
}

export function DeleteUserDialog({ user, onClose }: DeleteUserDialogProps) {
  const { mutate } = useDeleteUser();
  const confirm = () => {
    if (!user) return;
    mutate(user.id, {
      onSuccess: () => toast.success(ru.access.users.deleted),
      onError: (error) => toast.error(errorMessage(error)),
    });
  };
  return (
    <AlertDialog
      open={user !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={ru.access.users.deleteTitle(user?.login ?? '')}
      confirmLabel={ru.access.users.deleteConfirm}
      cancelLabel={ru.access.cancel}
      onConfirm={confirm}
    >
      {ru.access.users.deleteText}
    </AlertDialog>
  );
}
