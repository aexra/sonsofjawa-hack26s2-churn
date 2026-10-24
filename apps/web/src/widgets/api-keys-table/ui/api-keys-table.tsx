import { CircleCheck, CircleMinus, Clock, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

import { apiKeyStatus, useApiKeys, type ApiKey, type ApiKeyStatus } from '@/entities/api-key';
import { RevokeApiKeyDialog } from '@/features/api-key-revoke';
import { ru } from '@/shared/i18n/ru';
import { formatDate, formatDateTime } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';

const STATUS: Record<ApiKeyStatus, { icon: LucideIcon; tone: string }> = {
  active: { icon: CircleCheck, tone: 'text-positive' },
  revoked: { icon: CircleMinus, tone: 'text-ink-muted' },
  expired: { icon: Clock, tone: 'text-warning' },
};

function StatusCell({ keyItem }: { keyItem: ApiKey }) {
  const status = apiKeyStatus(keyItem);
  const { icon: Icon, tone } = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${tone}`}>
      <Icon aria-hidden="true" className="size-4" />
      {ru.access.keys.status[status]}
    </span>
  );
}

export function ApiKeysTable() {
  const keys = useApiKeys();
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  if (keys.isPending) {
    return <Skeleton className="h-60" />;
  }
  if (keys.isError) {
    return (
      <EmptyState
        kind="error"
        title={ru.common.loadFailed}
        text={ru.common.loadFailedText}
        action={<Button onClick={() => void keys.refetch()}>{ru.common.retry}</Button>}
      />
    );
  }
  if (keys.data.length === 0) {
    return <EmptyState kind="empty" title={ru.access.keys.empty} text={ru.access.keys.emptyText} />;
  }

  const columns = ru.access.keys.columns;
  return (
    <>
      <DataTable
        caption={ru.access.keys.tableCaption}
        rows={keys.data}
        rowKey={(row) => String(row.id)}
        columns={[
          { key: 'name', label: columns.name, render: (row) => row.name },
          {
            key: 'prefix',
            label: columns.prefix,
            mono: true,
            render: (row) => `ck_${row.prefix}…`,
          },
          {
            key: 'scopes',
            label: columns.scopes,
            render: (row) => (
              <span className="inline-flex flex-wrap gap-1.5">
                {row.scopes.map((scope) => (
                  <span
                    key={scope}
                    className="inline-flex h-5.5 items-center rounded-xs bg-risk-none-soft px-2 text-label text-risk-none"
                  >
                    {ru.access.keys.scopes[scope]}
                  </span>
                ))}
              </span>
            ),
          },
          {
            key: 'created',
            label: columns.created,
            mono: true,
            render: (row) =>
              row.createdBy
                ? `${formatDateTime(row.createdAt)} · ${row.createdBy}`
                : formatDateTime(row.createdAt),
          },
          {
            key: 'lastUsed',
            label: columns.lastUsed,
            mono: true,
            render: (row) =>
              row.lastUsedAt ? formatDateTime(row.lastUsedAt) : ru.common.emptyValue,
          },
          {
            key: 'expires',
            label: columns.expires,
            mono: true,
            render: (row) => (row.expiresAt ? formatDate(row.expiresAt) : ru.common.emptyValue),
          },
          { key: 'status', label: columns.status, render: (row) => <StatusCell keyItem={row} /> },
          {
            key: 'actions',
            label: columns.actions,
            render: (row) =>
              apiKeyStatus(row) === 'active' ? (
                <Button variant="ghost" size="sm" onClick={() => setRevoking(row)}>
                  {ru.access.keys.revoke}
                </Button>
              ) : null,
          },
        ]}
      />
      <RevokeApiKeyDialog apiKey={revoking} onClose={() => setRevoking(null)} />
    </>
  );
}
