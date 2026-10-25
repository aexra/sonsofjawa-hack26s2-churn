import { useId, type ReactNode } from 'react';

import {
  EMPTY_FILTER,
  hasActiveFilter,
  useCustomersListParams,
  type CustomerRiskLevel,
} from '@/entities/customer';
import { useDebouncedField } from '@/shared/hooks/use-debounced-field';
import { ru } from '@/shared/i18n/ru';
import { Button } from '@/shared/ui/button';
import { Field } from '@/shared/ui/field';
import { FilterChip } from '@/shared/ui/filter-chip';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';

const LEVELS: CustomerRiskLevel[] = ['high', 'medium', 'low'];

const parseScore = (raw: string): number | null => {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
};

const scoreText = (value: number | null) => (value === null ? '' : String(value));

export function CustomersFilter({ children }: { children: ReactNode }) {
  const [params, update] = useCustomersListParams();
  const searchId = useId();
  const levelId = useId();
  const [q, setQ] = useDebouncedField(params.q, (value) => {
    update({ q: value.trim() });
  });
  const [min, setMin] = useDebouncedField(scoreText(params.minScore), (value) => {
    update({ minScore: parseScore(value) });
  });
  const [max, setMax] = useDebouncedField(scoreText(params.maxScore), (value) => {
    update({ maxScore: parseScore(value) });
  });
  const noScore = params.status.includes('no_score');

  const toggleLevel = (level: CustomerRiskLevel, pressed: boolean) => {
    update({
      level: pressed ? [...params.level, level] : params.level.filter((item) => item !== level),
      status: [],
    });
  };

  return (
    <section
      aria-label={ru.customers.filters}
      className="flex flex-col gap-3.5 rounded-md border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="min-w-65 flex-[1_1_280px]">
          <Field label={ru.customers.search} id={searchId}>
            <Input
              id={searchId}
              type="search"
              adornment="search"
              value={q}
              placeholder={ru.customers.searchPlaceholder}
              onChange={(event) => {
                setQ(event.target.value);
              }}
            />
          </Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <span id={levelId} className="text-label text-ink-muted">
            {ru.customers.levelGroup}
          </span>
          <div role="group" aria-labelledby={levelId} className="flex flex-wrap gap-1.5">
            {LEVELS.map((level) => (
              <FilterChip
                key={level}
                tone={level}
                pressed={params.level.includes(level)}
                onPressedChange={(pressed) => {
                  toggleLevel(level, pressed);
                }}
              >
                {ru.risk[level]}
              </FilterChip>
            ))}
            <FilterChip
              tone="none"
              pressed={noScore}
              onPressedChange={(pressed) => {
                update({ level: [], status: pressed ? ['no_score'] : [] });
              }}
            >
              {ru.risk.none}
            </FilterChip>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-label text-ink-muted">{ru.customers.score}</span>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              mono
              min={0}
              max={100}
              inputMode="decimal"
              className="w-19"
              aria-label={ru.customers.scoreFrom}
              placeholder={ru.customers.scoreFromPlaceholder}
              value={min}
              onChange={(event) => {
                setMin(event.target.value);
              }}
            />
            <span aria-hidden="true" className="text-ink-faint">
              {ru.common.emptyValue}
            </span>
            <Input
              type="number"
              mono
              min={0}
              max={100}
              inputMode="decimal"
              className="w-19"
              aria-label={ru.customers.scoreTo}
              placeholder={ru.customers.scoreToPlaceholder}
              value={max}
              onChange={(event) => {
                setMax(event.target.value);
              }}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-3">
        <Switch
          label={ru.customers.anomalies}
          checked={params.hasAnomalies}
          onCheckedChange={(checked) => {
            update({ hasAnomalies: checked });
          }}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </section>
  );
}

export function CustomersFilterReset() {
  const [params, update] = useCustomersListParams();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={!hasActiveFilter(params)}
      onClick={() => {
        update(EMPTY_FILTER);
      }}
    >
      {ru.customers.resetFilters}
    </Button>
  );
}
