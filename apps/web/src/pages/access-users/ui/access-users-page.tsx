import { CreateUser } from '@/features/user-create';
import { ru } from '@/shared/i18n/ru';
import { UsersTable } from '@/widgets/users-table';

export function AccessUsersPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-180 text-ink-muted">{ru.access.users.intro}</p>
        <CreateUser />
      </div>
      <UsersTable />
    </div>
  );
}
