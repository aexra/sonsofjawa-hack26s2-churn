import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useRef } from 'react';

import { CUSTOMER_FIELDS, type CustomerField } from '@/entities/customer';
import { ru } from '@/shared/i18n/ru';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

interface CustomersColumnsProps {
  fields: readonly CustomerField[];
  onChange: (fields: CustomerField[]) => void;
  onReset: () => void;
}

const move = (fields: readonly CustomerField[], from: number, to: number): CustomerField[] => {
  const next = [...fields];
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(to, 0, item);
  return next;
};

export function CustomersColumns({ fields, onChange, onReset }: CustomersColumnsProps) {
  const dragged = useRef<number | null>(null);
  const hidden = CUSTOMER_FIELDS.map((field) => field.key).filter((key) => !fields.includes(key));
  const label = (field: CustomerField) => ru.customers.fields[field];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" aria-haspopup="dialog">
          {ru.customers.columnsButton}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={ru.customers.columnsTitle} className="w-80">
        <div className="flex flex-col gap-3">
          <ul
            aria-label={ru.customers.columnsList}
            className="m-0 flex list-none flex-col gap-1 p-0"
          >
            {fields.map((field, index) => (
              <li
                key={field}
                draggable
                onDragStart={(event) => {
                  dragged.current = index;
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', field);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = dragged.current;
                  dragged.current = null;
                  if (from !== null && from !== index) onChange(move(fields, from, index));
                }}
                className="flex items-center gap-2 rounded-xs py-0.5 hover:bg-surface-sunken"
              >
                <GripVertical
                  aria-label={ru.customers.columnDrag(label(field))}
                  role="img"
                  className="size-4 shrink-0 cursor-grab text-ink-faint"
                />
                <span className="min-w-0 flex-1">
                  <Checkbox
                    label={label(field)}
                    checked
                    disabled={fields.length === 1}
                    onCheckedChange={() => {
                      onChange(fields.filter((item) => item !== field));
                    }}
                  />
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-control-sm px-0"
                  aria-label={ru.customers.columnMoveUp(label(field))}
                  disabled={index === 0}
                  onClick={() => {
                    onChange(move(fields, index, index - 1));
                  }}
                >
                  <ArrowUp aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-control-sm px-0"
                  aria-label={ru.customers.columnMoveDown(label(field))}
                  disabled={index === fields.length - 1}
                  onClick={() => {
                    onChange(move(fields, index, index + 1));
                  }}
                >
                  <ArrowDown aria-hidden="true" className="size-4" />
                </Button>
              </li>
            ))}
            {hidden.map((field) => (
              <li key={field} className="flex items-center gap-2 py-0.5 pl-6">
                <Checkbox
                  label={label(field)}
                  checked={false}
                  onCheckedChange={() => {
                    onChange([...fields, field]);
                  }}
                />
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" onClick={onReset}>
            {ru.customers.columnsDefault}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
