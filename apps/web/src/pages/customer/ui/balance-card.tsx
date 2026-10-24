import { ru } from '@/shared/i18n/ru';
import { formatMoney } from '@/shared/lib/format';

import type { components } from '@/shared/api/schema';

type Account = components['schemas']['Account'];

const text = ru.customer.balance;

export function BalanceCard({ account }: { account: Account }) {
  const locked = account.bonusState === 'locked';
  const rows: [string, number][] = [
    [text.balance, account.balance],
    [text.withdraw, account.withdrawBalance],
    [locked ? text.bonusLocked : text.bonusUnlocked, account.bonusBalance],
    [text.replenished, account.totalReplenished],
  ];
  return (
    <section
      aria-labelledby="customer-balance"
      className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4"
    >
      <h2 id="customer-balance" className="m-0 font-display text-heading">
        {text.title}
      </h2>
      <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="m-0 text-right font-mono tabular-nums whitespace-nowrap">
              {formatMoney(value)}
            </dd>
          </div>
        ))}
      </dl>
      {locked && <p className="m-0 text-caption text-ink-muted">{text.lockedNote}</p>}
    </section>
  );
}
