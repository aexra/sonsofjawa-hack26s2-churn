import { Link } from 'react-router';

import { ReasonList } from '@/entities/reason';
import { ru } from '@/shared/i18n/ru';
import { formatScore } from '@/shared/lib/format';

import type { CustomerScore } from '@/entities/customer';

interface CustomerReasonsProps {
  score: CustomerScore;
}

const text = ru.customer.reasons;

export function CustomerReasons({ score }: CustomerReasonsProps) {
  return (
    <section
      aria-labelledby="customer-reasons"
      className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="customer-reasons" className="m-0 font-display text-heading">
          {text.title}
        </h2>
        <span className="text-caption text-ink-muted">
          {text.hint} ·{' '}
          <Link to="/model" className="text-accent hover:text-ink">
            {text.modelLink}
          </Link>
        </span>
      </div>
      {score.reasons.length > 0 ? (
        <ReasonList reasons={score.reasons} />
      ) : (
        <p className="m-0 text-ink-muted">{text.empty}</p>
      )}
      <details className="group border-t border-line pt-3">
        <summary className="w-fit cursor-pointer text-body-strong text-accent hover:text-ink">
          {text.all}
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <caption className="sr-only">{text.allCaption}</caption>
            <thead>
              <tr className="text-left text-label text-ink-muted">
                <th scope="col" className="py-2 pr-3 font-medium">
                  {text.feature}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {text.value}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {text.weight}
                </th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">
                  {text.contribution}
                </th>
              </tr>
            </thead>
            <tbody>
              {score.features.map((feature) => (
                <tr key={feature.key} className="border-t border-line">
                  <td className="py-2 pr-3">{feature.title}</td>
                  <td className="px-3 py-2 text-right font-mono text-data tabular-nums">
                    {formatScore(feature.value)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-data tabular-nums">
                    {formatScore(feature.weight)}
                  </td>
                  <td className="py-2 pl-3 text-right font-mono text-data-strong tabular-nums">
                    {formatScore(feature.contribution)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
