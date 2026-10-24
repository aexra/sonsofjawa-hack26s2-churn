import { useId } from 'react';

import { ru } from '@/shared/i18n/ru';
import { cn } from '@/shared/lib/cn';
import { Switch } from '@/shared/ui/switch';
import { Tooltip } from '@/shared/ui/tooltip';

import type { FieldSpec } from '@/entities/ingest';

interface CellEditorProps {
  spec: FieldSpec;
  rowNumber: number;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}

const inputClass =
  'box-border h-8 w-full min-w-0 rounded-xs border border-transparent bg-transparent px-2 font-mono text-data text-ink hover:border-line aria-invalid:border-negative aria-invalid:bg-risk-high-soft';

const optionsFor = (spec: FieldSpec, value: string): string[] => {
  const base = [...(spec.options ?? [])];
  const withBlank = spec.required ? base : ['', ...base];
  return value !== '' && !base.includes(value) ? [...withBlank, value] : withBlank;
};

export function CellEditor({ spec, rowNumber, value, error, onChange }: CellEditorProps) {
  const messageId = useId();
  const label = ru.ingest.table.cellLabel(spec.key, rowNumber);

  if (spec.kind === 'boolean') {
    return (
      <Switch
        label={label}
        hideLabel
        checked={value === 'true'}
        onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')}
      />
    );
  }

  const common = {
    'aria-label': label,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? messageId : undefined,
  } as const;

  const control =
    spec.kind === 'select' ? (
      <select
        {...common}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(inputClass, 'cursor-pointer')}
      >
        {optionsFor(spec, value).map((option) => (
          <option key={option} value={option}>
            {option === '' ? ru.common.emptyValue : option}
          </option>
        ))}
      </select>
    ) : (
      <input
        {...common}
        type="text"
        value={value}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    );

  return (
    <>
      <Tooltip content={error} open={error ? undefined : false}>
        {control}
      </Tooltip>
      {error && (
        <span id={messageId} className="sr-only">
          {error}
        </span>
      )}
    </>
  );
}
