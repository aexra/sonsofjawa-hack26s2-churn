import { cn } from '@/shared/lib/cn';

import type { ReactNode } from 'react';

interface KeyValueRow {
  label: string;
  value: ReactNode;
  operator?: string;
  strong?: boolean;
}

export function Operator({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className="inline-block w-[18px] font-mono text-ink-faint">
      {children}
    </span>
  );
}

export function KeyValueList({ rows }: { rows: KeyValueRow[] }) {
  return (
    <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] [&>div:last-child>*]:border-b-0">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="m-0 border-b border-dashed border-line py-2 text-ink-muted">
            {row.operator !== undefined && <Operator>{row.operator}</Operator>}
            {row.label}
          </dt>
          <dd
            className={cn(
              'm-0 border-b border-dashed border-line py-2 pl-4 text-right font-mono tabular-nums whitespace-nowrap',
              row.strong && 'font-semibold',
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
