import { useQueries } from '@tanstack/react-query';

import { INGEST_ENTITIES, sourceTotalQuery } from '@/entities/ingest';
import { ru } from '@/shared/i18n/ru';
import { formatInt } from '@/shared/lib/format';
import { AlertDialog } from '@/shared/ui/alert-dialog';

import type { Counts } from '../model/snapshot-files';

interface SnapshotConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceName: string;
  incoming: Counts;
  onConfirm: () => void;
}

export function SnapshotConfirm({
  open,
  onOpenChange,
  sourceName,
  incoming,
  onConfirm,
}: SnapshotConfirmProps) {
  const totals = useQueries({
    queries: INGEST_ENTITIES.map((entity) => sourceTotalQuery(entity, open)),
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={onOpenChange}
      title={ru.ingest.snapshot.confirmTitle}
      confirmLabel={ru.ingest.snapshot.confirm}
      cancelLabel={ru.ingest.snapshot.cancel}
      onConfirm={onConfirm}
    >
      <span className="flex flex-col gap-3">
        <span>
          {ru.ingest.snapshot.confirmText} <span className="font-mono text-ink">{sourceName}</span>.
        </span>
        <span
          role="table"
          aria-label={ru.ingest.snapshot.countsCaption}
          className="grid grid-cols-[auto_auto_auto] justify-start gap-x-6 gap-y-1 text-data"
        >
          <span role="row" className="contents text-ink-muted">
            <span role="columnheader" />
            <span role="columnheader">{ru.ingest.snapshot.current}</span>
            <span role="columnheader">{ru.ingest.snapshot.incoming}</span>
          </span>
          {INGEST_ENTITIES.map((entity, index) => {
            const total = totals[index];
            return (
              <span key={entity} role="row" className="contents">
                <span role="rowheader" className="text-ink">
                  {ru.ingest.entities[entity]}
                </span>
                <span role="cell" className="font-mono text-ink">
                  {total?.data === undefined ? ru.common.emptyValue : formatInt(total.data)}
                </span>
                <span role="cell" className="font-mono text-ink">
                  {formatInt(incoming[entity])}
                </span>
              </span>
            );
          })}
        </span>
        <span>{ru.ingest.snapshot.confirmNote}</span>
      </span>
    </AlertDialog>
  );
}
