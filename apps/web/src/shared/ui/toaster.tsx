import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { Toaster as Sonner } from 'sonner';

import type { ReactNode } from 'react';

const tile = (glyph: ReactNode) => (
  <span className="grid size-7 flex-none place-items-center rounded-sm border border-line bg-surface-sunken">
    {glyph}
  </span>
);

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      icons={{
        success: tile(<CircleCheck aria-hidden="true" className="size-4 text-positive" />),
        error: tile(<CircleAlert aria-hidden="true" className="size-4 text-negative" />),
        info: tile(<Info aria-hidden="true" className="size-4 text-accent" />),
        warning: tile(<TriangleAlert aria-hidden="true" className="size-4 text-warning" />),
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-90 max-w-full items-start gap-3 rounded-sm border border-line bg-surface px-4 py-3 text-body text-ink shadow-pop',
          title: 'font-medium',
          description: 'text-caption text-ink-muted',
        },
      }}
    />
  );
}
