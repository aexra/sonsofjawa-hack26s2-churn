import { ru } from '@/shared/i18n/ru';
import { BrandLogo } from '@/shared/ui/brand-logo';

import { NavPanel } from './nav-panel';

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  return (
    <nav
      aria-label={ru.nav.main}
      className="box-border sticky top-0 hidden h-screen w-sidebar flex-none flex-col items-stretch overflow-y-auto border-r border-line bg-surface px-3.5 py-5 md:flex"
    >
      <div className="flex flex-none flex-col gap-2 px-2 pt-0.5 pb-4.5">
        <BrandLogo size={26} />
        <span className="font-display text-[15px] leading-[18px] font-bold">
          {ru.app.productName}
        </span>
      </div>
      <NavPanel isAdmin={isAdmin} />
    </nav>
  );
}
