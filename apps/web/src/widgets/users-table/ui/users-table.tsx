import { CircleCheck, CircleMinus, Info } from 'lucide-react';
import { useState } from 'react';

import { useSession } from '@/entities/session';
import { useUsers, type User } from '@/entities/user';
import { DeleteUserDialog, EditUserDialog, ToggleUserButton } from '@/features/user-edit';
import { ru } from '@/shared/i18n/ru';
import { formatDateTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tooltip } from '@/shared/ui/tooltip';

function RoleCell({ user }: { user: User }) {
  const label = ru.roles[user.role];
  if (user.authProvider !== 'oidc') return label;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {label}
      <Tooltip content={ru.access.users.roleManagedByProvider}>
        <button
          type="button"
          aria-label={ru.access.users.roleManagedByProvider}
          className="inline-flex cursor-help rounded-xs text-ink-muted"
        >
          <Info aria-hidden="true" className="size-4" />
        </button>
      </Tooltip>
    </span>
  );
}

function ActiveCell({ user }: { user: User }) {
  return (
    <Badge tone={user.enabled ? 'low' : 'none'} icon={user.enabled ? CircleCheck : CircleMinus}>
      {user.enabled ? ru.access.users.yes : ru.access.users.no}
    </Badge>
  );
}

export function UsersTable() {
  const users = useUsers();
  const { user: current } = useSession();
  const [editing, setEditing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);

  if (users.isPending) {
    return <Skeleton className="h-60" />;
  }
  if (users.isError) {
    return (
      <EmptyState
        kind="error"
        title={ru.common.loadFailed}
        text={ru.common.loadFailedText}
        action={<Button onClick={() => void users.refetch()}>{ru.common.retry}</Button>}
      />
    );
  }

  const columns = ru.access.users.columns;
  const dash = ru.common.emptyValue;
  return (
    <>
      <DataTable
        caption={ru.access.users.tableCaption}
        rows={users.data}
        rowKey={(row) => String(row.id)}
        columns={[
          {
            key: 'login',
            label: columns.login,
            mono: true,
            render: (row) => (
              <span className="inline-flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  data-letter={row.login.charAt(0)}
                  className="grid size-7 flex-none place-items-center rounded-sm border border-line bg-tile font-sans text-label text-on-tile before:content-[attr(data-letter)]"
                />
                <span className="font-semibold">{row.login}</span>
                {row.id === current?.id && <Badge size="sm">{ru.access.users.you}</Badge>}
              </span>
            ),
          },
          { key: 'name', label: columns.name, render: (row) => row.displayName ?? dash },
          { key: 'email', label: columns.email, mono: true, render: (row) => row.email ?? dash },
          { key: 'role', label: columns.role, render: (row) => <RoleCell user={row} /> },
          {
            key: 'method',
            label: columns.method,
            render: (row) => (
              <Badge tone="none">
                {row.authProvider === 'oidc'
                  ? ru.access.users.methodSso
                  : ru.access.users.methodLocal}
              </Badge>
            ),
          },
          { key: 'active', label: columns.active, render: (row) => <ActiveCell user={row} /> },
          {
            key: 'lastLogin',
            label: columns.lastLogin,
            mono: true,
            render: (row) => (row.lastLoginAt ? formatDateTime(row.lastLoginAt) : dash),
          },
          {
            key: 'actions',
            label: columns.actions,
            render: (row) => {
              const self = row.id === current?.id;
              return (
                <span className="inline-flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(row)}>
                    {ru.access.users.edit}
                  </Button>
                  {self ? (
                    <>
                      <Tooltip content={ru.access.users.cannotDisableSelf}>
                        <ToggleUserButton user={row} blocked />
                      </Tooltip>
                      <Tooltip content={ru.access.users.cannotDeleteSelf}>
                        <Button variant="ghost-danger" size="sm" blocked>
                          {ru.access.users.delete}
                        </Button>
                      </Tooltip>
                    </>
                  ) : (
                    <>
                      <ToggleUserButton user={row} />
                      <Button variant="ghost-danger" size="sm" onClick={() => setDeleting(row)}>
                        {ru.access.users.delete}
                      </Button>
                    </>
                  )}
                </span>
              );
            },
          },
        ]}
      />
      <EditUserDialog user={editing} onClose={() => setEditing(null)} />
      <DeleteUserDialog user={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}
