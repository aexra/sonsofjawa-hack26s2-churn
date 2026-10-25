import { ru } from '@/shared/i18n/ru';
import { formatMoney } from '@/shared/lib/format';
import { KeyValueList } from '@/shared/ui/key-value-list';

import type { components } from '@/shared/api/schema';

type Account = components['schemas']['Account'];

const text = ru.customer.balance;

export function BalanceCard({ account }: { account: Account }) {
  const locked = account.bonusState === 'locked';
  return (
    <section
      aria-labelledby="customer-balance"
      className="flex flex-col gap-3 rounded-md border border-line bg-surface p-5"
    >
      <h2 id="customer-balance" className="m-0 font-display text-heading">
        {text.title}
      </h2>
      <KeyValueList
        rows={[
          { label: text.balance, value: formatMoney(account.balance), strong: true },
          { label: text.withdraw, value: formatMoney(account.withdrawBalance) },
          {
            label: locked ? text.bonusLocked : text.bonusUnlocked,
            value: formatMoney(account.bonusBalance),
          },
          { label: text.replenished, value: formatMoney(account.totalReplenished) },
        ]}
      />
      {locked && <p className="m-0 text-caption text-ink-muted">{text.lockedNote}</p>}
    </section>
  );
}
