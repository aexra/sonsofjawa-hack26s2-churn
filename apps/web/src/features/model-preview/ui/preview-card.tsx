import { Link } from 'react-router';

import { RiskBadge } from '@/entities/risk-level';
import { ru } from '@/shared/i18n/ru';
import { formatMoney } from '@/shared/lib/format';
import { DataTable } from '@/shared/ui/data-table';
import { Skeleton } from '@/shared/ui/skeleton';

import type { PreviewRow } from '../model/compute';
import type { PreviewState } from '../model/use-model-preview';

const columns = [
  {
    key: 'id',
    label: ru.model.preview.customer,
    align: 'right' as const,
    mono: true,
    render: (row: PreviewRow) => (
      <Link to={`/customers/${String(row.id)}`} className="text-accent hover:text-ink">
        {row.id}
      </Link>
    ),
  },
  {
    key: 'before',
    label: ru.model.preview.current,
    render: (row: PreviewRow) => <RiskBadge level={row.levelBefore} score={row.scoreBefore} />,
  },
  {
    key: 'after',
    label: ru.model.preview.next,
    render: (row: PreviewRow) => <RiskBadge level={row.levelAfter} score={row.scoreAfter} />,
  },
];

interface PreviewCardProps {
  state: PreviewState;
  outsidePreview: boolean;
}

function Body({ state }: Pick<PreviewCardProps, 'state'>) {
  switch (state.kind) {
    case 'loading':
      return <Skeleton className="h-40" />;
    case 'error':
      return <p className="m-0 text-negative">{ru.model.preview.failed}</p>;
    case 'too-many':
      return <p className="m-0 text-ink-muted">{ru.model.preview.tooMany}</p>;
    case 'invalid':
      return null;
    case 'ready': {
      const { preview } = state;
      if (preview.rows.length === 0) {
        return <p className="m-0 text-ink-muted">{ru.model.preview.noChanges}</p>;
      }
      return (
        <>
          <DataTable
            caption={ru.model.preview.caption}
            columns={columns}
            rows={preview.rows}
            rowKey={(row) => String(row.id)}
            isChanged={(row) => row.levelBefore !== row.levelAfter}
          />
          <div className="flex items-baseline justify-between gap-3 rounded-sm bg-surface-sunken px-3.5 py-3">
            <span className="text-body-strong">{ru.model.preview.expectedLoss}</span>
            <span className="font-mono text-data whitespace-nowrap tabular-nums">
              {formatMoney(preview.lossBefore)} →{' '}
              <b className="font-semibold">{formatMoney(preview.lossAfter)}</b>
            </span>
          </div>
        </>
      );
    }
  }
}

export function PreviewCard({ state, outsidePreview }: PreviewCardProps) {
  return (
    <section
      aria-labelledby="model-preview-title"
      className="flex flex-col gap-3 rounded-md border border-line bg-surface p-5"
    >
      <h2 id="model-preview-title" className="m-0 font-display text-heading">
        {ru.model.preview.title}
      </h2>
      <Body state={state} />
      {outsidePreview && (
        <p className="m-0 text-caption text-ink-muted">{ru.model.preview.onlyScoring}</p>
      )}
      <p className="m-0 text-caption text-ink-muted">{ru.model.preview.note}</p>
    </section>
  );
}
