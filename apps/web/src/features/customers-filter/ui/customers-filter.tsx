import { useId } from 'react';

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

export function CustomersFilter() {
  const [params, update] = useCustomersListParams();
  const searchId = useId();
  const minId = useId();
  const maxId = useId();
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
    <>
      <div className="w-full max-w-90 min-w-65 flex-1">
        <Field label={ru.customers.search} id={searchId}>
          <Input
            id={searchId}
            type="search"
            value={q}
            placeholder={ru.customers.searchPlaceholder}
            onChange={(event) => {
              setQ(event.target.value);
            }}
          />
        </Field>
      </div>
      <div role="group" aria-label={ru.customers.levelGroup} className="flex flex-wrap gap-2">
        {LEVELS.map((level) => (
          <FilterChip
            key={level}
            pressed={params.level.includes(level)}
            onPressedChange={(pressed) => {
              toggleLevel(level, pressed);
            }}
          >
            {ru.risk[level]}
          </FilterChip>
        ))}
        <FilterChip
          pressed={noScore}
          onPressedChange={(pressed) => {
            update({ level: [], status: pressed ? ['no_score'] : [] });
          }}
        >
          {ru.risk.none}
        </FilterChip>
      </div>
      <Switch
        label={ru.customers.anomalies}
        checked={params.hasAnomalies}
        onCheckedChange={(checked) => {
          update({ hasAnomalies: checked });
        }}
      />
      <div className="flex items-end gap-2">
        <Field label={ru.customers.scoreFrom} id={minId}>
          <Input
            id={minId}
            type="number"
            mono
            min={0}
            max={100}
            inputMode="decimal"
            className="w-16"
            value={min}
            onChange={(event) => {
              setMin(event.target.value);
            }}
          />
        </Field>
        <Field label={ru.customers.scoreTo} id={maxId}>
          <Input
            id={maxId}
            type="number"
            mono
            min={0}
            max={100}
            inputMode="decimal"
            className="w-16"
            value={max}
            onChange={(event) => {
              setMax(event.target.value);
            }}
          />
        </Field>
      </div>
    </>
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
