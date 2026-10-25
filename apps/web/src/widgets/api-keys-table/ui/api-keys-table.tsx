import { CircleCheck, CircleMinus, Clock, KeyRound, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

import { apiKeyStatus, useApiKeys, type ApiKey, type ApiKeyStatus } from '@/entities/api-key';
import { RevokeApiKeyDialog } from '@/features/api-key-revoke';
import { ru } from '@/shared/i18n/ru';
import { formatDate, formatDateTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import { EmptyState } from '@/shared/ui/empty-state';
import { IconTile } from '@/shared/ui/icon-tile';
import { Skeleton } from '@/shared/ui/skeleton';

const STATUS: Record<ApiKeyStatus, { icon: LucideIcon; tone: 'low' | 'medium' | 'none' }> = {
  active: { icon: CircleCheck, tone: 'low' },
  revoked: { icon: CircleMinus, tone: 'none' },
  expired: { icon: Clock, tone: 'medium' },
};

function StatusCell({ keyItem }: { keyItem: ApiKey }) {
  const status = apiKeyStatus(keyItem);
  const { icon, tone } = STATUS[status];
  return (
    <Badge tone={tone} icon={icon}>
      {ru.access.keys.status[status]}
    </Badge>
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
          {
            key: 'name',
            label: columns.name,
            render: (row) => (
              <span className="inline-flex items-center gap-2.5 font-semibold">
                <IconTile icon={KeyRound} />
                {row.name}
              </span>
            ),
          },
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
                  <Badge key={scope}>{ru.access.keys.scopes[scope]}</Badge>
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
                <Button variant="ghost-danger" size="sm" onClick={() => setRevoking(row)}>
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
