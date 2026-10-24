import { Label } from 'radix-ui';

import type { ReactNode } from 'react';

interface FieldProps {
  label: string;
  id: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, id, hint, error, children }: FieldProps) {
  const message = error ?? hint;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label.Root htmlFor={id} className="text-label text-ink-muted">
        {label}
      </Label.Root>
      {children}
      {message && (
        <p
          id={`${id}-message`}
          className={error ? 'text-caption text-negative' : 'text-caption text-ink-muted'}
        >
          {message}
        </p>
      )}
    </div>
  );
}
