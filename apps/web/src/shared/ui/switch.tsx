import { Switch as SwitchPrimitive } from 'radix-ui';
import { useId } from 'react';

interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label: string;
  hideLabel?: boolean;
  disabled?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

export function Switch({ label, hideLabel = false, ...props }: SwitchProps) {
  const id = useId();
  return (
    <span className="inline-flex items-center gap-2">
      <SwitchPrimitive.Root
        id={id}
        className="relative box-border h-5 w-9 cursor-pointer rounded-full border border-line-strong bg-surface-sunken transition-colors duration-120 ease-out aria-invalid:border-negative aria-invalid:bg-risk-high-soft data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        {...props}
      >
        <SwitchPrimitive.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-ink-muted transition-transform duration-120 ease-out data-[state=checked]:translate-x-4.5 data-[state=checked]:bg-on-accent" />
      </SwitchPrimitive.Root>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'cursor-pointer text-body text-ink'}>
        {label}
      </label>
    </span>
  );
}
