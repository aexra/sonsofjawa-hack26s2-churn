import { Check } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { useId } from 'react';

interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Checkbox({ label, ...props }: CheckboxProps) {
  const id = useId();
  return (
    <span className="inline-flex items-center gap-2">
      <CheckboxPrimitive.Root
        id={id}
        className="grid size-4.5 cursor-pointer place-items-center rounded-xs border border-line-strong bg-surface text-on-accent transition-colors duration-120 ease-out data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        {...props}
      >
        <CheckboxPrimitive.Indicator>
          <Check aria-hidden="true" className="size-3.5" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <label htmlFor={id} className="cursor-pointer text-body text-ink">
        {label}
      </label>
    </span>
  );
}
