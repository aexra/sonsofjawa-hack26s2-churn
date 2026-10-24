import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { ErrorTable, useIngestLog, type IngestLogEntry } from '@/entities/ingest';
import { ru } from '@/shared/i18n/ru';
import { formatDateTime, formatInt } from '@/shared/lib/format';
import { plural } from '@/shared/lib/plural';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';

const PAGE_SIZE = 10;

function ResultCell({
  entry,
  expanded,
  onToggle,
}: {
  entry: IngestLogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (entry.status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-positive">
        <CircleCheck aria-hidden="true" className="size-4" />
        {ru.ingest.log.ok}
      </span>
    );
  }
  const count = entry.errors.length;
  return (
    <div className="flex flex-col gap-2 py-2">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="inline-flex cursor-pointer items-center gap-1.5 self-start whitespace-nowrap text-negative"
      >
        <TriangleAlert aria-hidden="true" className="size-4" />
        {count > 0
          ? ru.ingest.log.rejectedWith(count, plural(count, ru.ingest.failure.errorForms))
          : ru.ingest.log.rejected}
      </button>
      {expanded && count > 0 && <ErrorTable errors={entry.errors} />}
    </div>
  );
}

export function IngestLog() {
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const log = useIngestLog(page, PAGE_SIZE);

  const toggle = (id: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  if (log.isPending) return <Skeleton className="h-40" />;
  if (log.isError) {
    return (
      <EmptyState
        kind="error"
        title={ru.common.loadFailed}
        text={ru.common.loadFailedText}
        action={<Button onClick={() => void log.refetch()}>{ru.common.retry}</Button>}
      />
    );
  }
  if (log.data.items.length === 0 && page === 0) {
    return <EmptyState kind="empty" title={ru.ingest.log.empty} text={ru.ingest.log.emptyText} />;
  }

  const columns = ru.ingest.log.columns;
  const { totalPages } = log.data;
  return (
    <div className="flex flex-col gap-3">
      <DataTable
        caption={ru.ingest.log.title}
        rows={log.data.items}
        rowKey={(row) => String(row.id)}
        columns={[
          {
            key: 'receivedAt',
            label: columns.when,
            mono: true,
            render: (row) => formatDateTime(row.receivedAt),
          },
          { key: 'actor', label: columns.who, mono: true, render: (row) => row.actor },
          {
            key: 'channel',
            label: columns.channel,
            render: (row) => ru.ingest.log.channels[row.channel],
          },
          {
            key: 'entity',
            label: columns.entity,
            render: (row) => ru.ingest.log.entities[row.entity],
          },
          { key: 'format', label: columns.format, render: (row) => row.format },
          {
            key: 'rows',
            label: columns.rows,
            align: 'right',
            mono: true,
            render: (row) => `${formatInt(row.rowsReceived)} / ${formatInt(row.rowsApplied)}`,
          },
          {
            key: 'result',
            label: columns.result,
            render: (row) => (
              <ResultCell
                entry={row}
                expanded={expanded.has(row.id)}
                onToggle={() => toggle(row.id)}
              />
            ),
          },
        ]}
      />
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-3 text-caption text-ink-muted">
          <span>{ru.ingest.log.pageOf(page + 1, totalPages)}</span>
          <Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            {ru.ingest.log.prev}
          </Button>
          <Button size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>
            {ru.ingest.log.next}
          </Button>
        </div>
      )}
    </div>
  );
}
