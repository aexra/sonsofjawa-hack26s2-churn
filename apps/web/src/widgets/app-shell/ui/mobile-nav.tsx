import { Menu, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useState } from 'react';

import { ru } from '@/shared/i18n/ru';
import { BrandLogo } from '@/shared/ui/brand-logo';
import { Button } from '@/shared/ui/button';
import { dialogOverlayClass } from '@/shared/ui/dialog';

import { NavPanel } from './nav-panel';

export function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="flex flex-none items-center gap-3 border-b border-line bg-surface px-3 py-2 md:hidden">
      <BrandLogo size={26} />
      <span className="min-w-0 flex-1 truncate font-display text-[15px] leading-[18px] font-bold">
        {ru.app.productName}
      </span>
      <Button
        variant="ghost"
        size="sm"
        aria-label={ru.nav.openMenu}
        className="size-10 shrink-0 px-0"
        onClick={() => setOpen(true)}
      >
        <Menu aria-hidden="true" className="size-5" />
      </Button>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className={dialogOverlayClass} />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 flex w-sidebar max-w-[calc(100%-48px)] flex-col overflow-y-auto border-r border-line bg-surface px-3.5 py-4 shadow-pop outline-none"
          >
            <DialogPrimitive.Title className="sr-only">{ru.nav.menu}</DialogPrimitive.Title>
            <div className="mb-3 flex items-start justify-between gap-2 px-2">
              <div className="flex min-w-0 flex-col gap-2">
                <BrandLogo size={26} />
                <span className="font-display text-[15px] leading-[18px] font-bold">
                  {ru.app.productName}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={ru.nav.closeMenu}
                className="size-10 shrink-0 px-0"
                onClick={close}
              >
                <X aria-hidden="true" className="size-5" />
              </Button>
            </div>
            <nav aria-label={ru.nav.main} className="flex flex-col">
              <NavPanel isAdmin={isAdmin} onNavigate={close} />
            </nav>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
