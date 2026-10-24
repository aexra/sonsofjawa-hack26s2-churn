import { Activity, ExternalLink } from 'lucide-react';
import { Fragment } from 'react';
import { NavLink } from 'react-router';

import { runtimeConfig } from '@/shared/config/runtime';
import { ru } from '@/shared/i18n/ru';
import { cn } from '@/shared/lib/cn';

import { helpIcon, NAV_GROUPS } from '../model/nav';

const MARK = [
  'bg-risk-high',
  'bg-risk-medium-fill',
  'bg-risk-low',
  'bg-accent',
  'bg-accent',
  'bg-risk-low',
  'bg-accent',
  'bg-accent',
  'bg-accent',
];

const itemClass =
  'flex h-control-md flex-none items-center gap-2 rounded-sm px-3 text-body-strong text-ink-muted no-underline transition-colors duration-120 ease-out hover:bg-surface-sunken hover:text-ink aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent';

const groupLabelClass = 'mx-2 mt-3 mb-1 hidden text-label text-ink-faint md:block';

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const HelpIcon = helpIcon;
  return (
    <nav
      aria-label={ru.nav.main}
      className="box-border flex w-full flex-none items-center gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2 md:sticky md:top-0 md:h-screen md:w-sidebar md:flex-col md:items-stretch md:overflow-x-visible md:overflow-y-auto md:border-r md:border-b-0 md:px-3 md:py-4"
    >
      <div className="flex flex-none items-center gap-2 pr-2 pl-1 font-display text-heading whitespace-nowrap md:px-2 md:pb-4">
        <span
          aria-hidden="true"
          className="box-border grid size-6 grid-cols-3 gap-0.5 rounded-xs bg-ink p-1"
        >
          {MARK.map((color, index) => (
            <i key={index} className={cn('block rounded-[1px]', color)} />
          ))}
        </span>
        {ru.app.productName}
      </div>
      {NAV_GROUPS.filter((group) => !group.adminOnly || isAdmin).map((group) => (
        <Fragment key={group.id}>
          {group.label && <div className={groupLabelClass}>{group.label}</div>}
          {group.items.map((item) => (
            <NavLink key={item.id} to={item.to} end={item.to === '/'} className={itemClass}>
              <item.icon aria-hidden="true" className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </Fragment>
      ))}
      <div className={groupLabelClass}>{ru.nav.helpGroup}</div>
      <a href={runtimeConfig.docsUrl} target="_blank" rel="noreferrer" className={itemClass}>
        <HelpIcon aria-hidden="true" className="size-4" />
        {ru.nav.apiDocs}
        <ExternalLink aria-hidden="true" className="ml-auto size-3.5 opacity-60" />
      </a>
      {runtimeConfig.grafanaUrl && (
        <a href={runtimeConfig.grafanaUrl} target="_blank" rel="noreferrer" className={itemClass}>
          <Activity aria-hidden="true" className="size-4" />
          {ru.nav.grafana}
          <ExternalLink aria-hidden="true" className="ml-auto size-3.5 opacity-60" />
        </a>
      )}
    </nav>
  );
}
