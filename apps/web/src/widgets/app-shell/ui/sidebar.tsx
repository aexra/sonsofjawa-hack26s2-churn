import { Activity, ExternalLink } from 'lucide-react';
import { Fragment } from 'react';
import { NavLink } from 'react-router';

import { runtimeConfig } from '@/shared/config/runtime';
import { ru } from '@/shared/i18n/ru';
import { BrandLogo } from '@/shared/ui/brand-logo';
import { IconTile } from '@/shared/ui/icon-tile';

import { helpIcon, NAV_GROUPS } from '../model/nav';

const itemClass =
  'flex h-10 flex-none items-center gap-2.5 rounded-sm border border-transparent px-2 text-body-strong font-medium whitespace-nowrap text-ink-muted no-underline transition-colors duration-120 ease-out hover:bg-surface-sunken hover:text-ink aria-[current=page]:border-accent/35 aria-[current=page]:bg-accent-soft aria-[current=page]:text-ink';

const groupLabelClass = 'mx-2.5 mt-3.5 mb-1.5 hidden text-label text-ink-faint md:block';

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const HelpIcon = helpIcon;
  return (
    <nav
      aria-label={ru.nav.main}
      className="box-border flex w-full flex-none items-center gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2 md:sticky md:top-0 md:h-screen md:w-sidebar md:flex-col md:items-stretch md:overflow-x-visible md:overflow-y-auto md:border-r md:border-b-0 md:px-3.5 md:py-5"
    >
      <div className="flex flex-none flex-col gap-2 pr-2 pl-1 whitespace-nowrap md:px-2 md:pt-0.5 md:pb-4.5">
        <BrandLogo size={26} />
        <span className="hidden font-display text-[15px] leading-[18px] font-bold md:block">
          {ru.app.productName}
        </span>
      </div>
      {NAV_GROUPS.filter((group) => !group.adminOnly || isAdmin).map((group) => (
        <Fragment key={group.id}>
          {group.label && <div className={groupLabelClass}>{group.label}</div>}
          {group.items.map((item) => (
            <NavLink key={item.id} to={item.to} end={item.to === '/'} className={itemClass}>
              {({ isActive }) => (
                <>
                  <IconTile icon={item.icon} tone={isActive ? 'active' : 'default'} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </Fragment>
      ))}
      <div className={groupLabelClass}>{ru.nav.helpGroup}</div>
      <a href={runtimeConfig.docsUrl} target="_blank" rel="noreferrer" className={itemClass}>
        <IconTile icon={HelpIcon} />
        {ru.nav.apiDocs}
        <ExternalLink aria-hidden="true" className="ml-auto size-3.5 text-ink-faint" />
      </a>
      {runtimeConfig.grafanaUrl && (
        <a href={runtimeConfig.grafanaUrl} target="_blank" rel="noreferrer" className={itemClass}>
          <IconTile icon={Activity} />
          {ru.nav.grafana}
          <ExternalLink aria-hidden="true" className="ml-auto size-3.5 text-ink-faint" />
        </a>
      )}
    </nav>
  );
}
