import { Check, ChevronDown } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';

interface SelectProps {
  options: { value: string; label: string }[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
}

export function Select({ options, id, 'aria-label': ariaLabel, disabled, ...props }: SelectProps) {
  return (
    <SelectPrimitive.Root disabled={disabled} {...props}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className="box-border inline-flex h-control-md min-w-0 cursor-pointer items-center justify-between gap-2 rounded-sm border border-line-strong bg-surface px-3 text-body text-ink disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-faint"
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown aria-hidden="true" className="size-4" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 min-w-(--radix-select-trigger-width) rounded-sm border border-line bg-surface p-1 shadow-pop"
        >
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="flex h-control-md cursor-pointer items-center justify-between gap-2 rounded-xs px-3 text-body text-ink outline-none data-highlighted:bg-surface-sunken data-[state=checked]:text-accent"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check aria-hidden="true" className="size-4" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
