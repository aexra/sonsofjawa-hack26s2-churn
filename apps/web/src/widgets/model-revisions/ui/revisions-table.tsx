import { type ModelSettings } from '@/features/model-settings-edit';
import { ru } from '@/shared/i18n/ru';
import { formatDateTime } from '@/shared/lib/format';
import { DataTable } from '@/shared/ui/data-table';
import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';

import { describeRevision } from '../model/describe-revision';
import { useModelRevisions } from '../model/use-model-revisions';

export function RevisionsTable({ settings }: { settings: ModelSettings }) {
  const { data, isPending, isError } = useModelRevisions();
  return (
    <section aria-labelledby="model-revisions-title" className="flex flex-col gap-3">
      <h2 id="model-revisions-title" className="m-0 font-display text-heading">
        {ru.model.revisions.title}
      </h2>
      {isPending && <Skeleton className="h-24" />}
      {isError && <EmptyState kind="error" title={ru.model.revisions.loadFailed} />}
      {data &&
        (data.length === 0 ? (
          <EmptyState kind="empty" title={ru.model.revisions.empty} />
        ) : (
          <DataTable
            caption={ru.model.revisions.caption}
            rows={data}
            rowKey={(revision) => String(revision.version)}
            columns={[
              {
                key: 'version',
                label: ru.model.revisions.version,
                align: 'right',
                mono: true,
                render: (revision) => revision.version,
              },
              {
                key: 'when',
                label: ru.model.revisions.when,
                mono: true,
                render: (revision) => formatDateTime(revision.changedAt),
              },
              {
                key: 'who',
                label: ru.model.revisions.who,
                mono: true,
                render: (revision) => revision.changedBy,
              },
              {
                key: 'what',
                label: ru.model.revisions.what,
                render: (revision) => describeRevision(revision, settings),
              },
            ]}
          />
        ))}
    </section>
  );
}
