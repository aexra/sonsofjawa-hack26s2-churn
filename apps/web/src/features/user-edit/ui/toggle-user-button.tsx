import { toast } from 'sonner';

import { errorMessage } from '@/shared/api/error-message';
import { ru } from '@/shared/i18n/ru';
import { Button } from '@/shared/ui/button';

import { useUpdateUser } from '../model/use-user-mutations';

import type { User } from '@/entities/user';

export function ToggleUserButton({ user, blocked = false }: { user: User; blocked?: boolean }) {
  const { mutate, isPending } = useUpdateUser();
  const toggle = () => {
    mutate(
      { id: user.id, patch: { enabled: !user.enabled } },
      {
        onSuccess: () =>
          toast.success(user.enabled ? ru.access.users.disabled : ru.access.users.enabled),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };
  return (
    <Button variant="ghost" size="sm" blocked={blocked} disabled={isPending} onClick={toggle}>
      {user.enabled ? ru.access.users.disable : ru.access.users.enable}
    </Button>
  );
}
