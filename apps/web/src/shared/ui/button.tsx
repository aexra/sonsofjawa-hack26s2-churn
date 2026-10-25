import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/lib/cn';

import type { ComponentProps } from 'react';

export const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-sm border text-body-strong whitespace-nowrap no-underline transition-colors duration-120 ease-out disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-sunken disabled:text-ink-faint aria-disabled:cursor-not-allowed aria-disabled:border-line aria-disabled:bg-surface-sunken aria-disabled:text-ink-faint',
  {
    variants: {
      variant: {
        primary: 'border-accent bg-accent text-on-accent hover:brightness-110',
        secondary: 'border-line-strong bg-surface text-ink hover:bg-surface-sunken',
        ghost:
          'border-transparent bg-transparent text-ink-muted hover:text-ink disabled:border-transparent disabled:bg-transparent aria-disabled:border-transparent aria-disabled:bg-transparent',
        'ghost-danger':
          'border-transparent bg-transparent text-negative hover:bg-risk-high-soft disabled:border-transparent disabled:bg-transparent aria-disabled:border-transparent aria-disabled:bg-transparent',
        danger: 'border-negative bg-surface text-negative hover:bg-risk-high-soft',
      },
      size: {
        md: 'h-control-md px-4',
        sm: 'h-control-sm px-3 text-[13px]',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { loading?: boolean; blocked?: boolean };

export function Button({
  variant,
  size,
  loading = false,
  blocked = false,
  disabled,
  onClick,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
      aria-disabled={blocked || undefined}
      onClick={blocked ? undefined : onClick}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      )}
      {children}
    </button>
  );
}
