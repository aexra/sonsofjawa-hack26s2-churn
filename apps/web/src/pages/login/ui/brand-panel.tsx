import logoWhite from '@/shared/assets/brand/aeza-logo-white.svg';
import { ru } from '@/shared/i18n/ru';

export function BrandPanel() {
  return (
    <div className="relative box-border flex h-40 flex-none flex-col justify-between overflow-hidden bg-brand-black p-6 md:h-auto md:w-150 md:p-14">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-y-0 left-115.5 hidden gap-3 md:flex">
          <span className="block w-2.5 bg-brand-white" />
          <span className="block w-2.5 bg-brand-white" />
          <span className="block w-2.5 bg-brand-white" />
        </div>
        <div className="absolute -top-2.5 -right-5 left-131 hidden h-75 rounded-bl-[56px] border-10 border-t-0 border-r-0 border-brand-cyan md:block" />
        <div className="absolute -top-2.5 -right-5 left-141 hidden h-55 rounded-bl-[56px] border-10 border-t-0 border-r-0 border-brand-white md:block" />
        <div className="absolute inset-x-0 bottom-6 flex flex-col gap-3 md:bottom-46.5">
          <span className="block h-2.5 bg-brand-cyan" />
          <span className="block h-2.5 bg-brand-cyan" />
          <span className="block h-2.5 bg-brand-cyan" />
        </div>
      </div>
      <img src={logoWhite} alt="aéza" className="relative h-8 w-auto self-start md:h-16" />
      <div className="relative hidden flex-col gap-3.5 pb-75 md:flex">
        <span className="max-w-[8.5em] font-display text-[52px] leading-14 font-extrabold tracking-tight text-brand-white">
          {ru.app.title}
        </span>
        <span className="max-w-90 text-[15px] leading-[22px] text-brand-white/70">
          {ru.login.tagline}
        </span>
      </div>
    </div>
  );
}
