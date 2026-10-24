import { Activity, ExternalLink } from 'lucide-react';
import { Fragment } from 'react';
import { NavLink } from 'react-router';

import { runtimeConfig } from '@/shared/config/runtime';
import { ru } from '@/shared/i18n/ru';
import { cn } from '@/shared/lib/cn';
import { IconTile } from '@/shared/ui/icon-tile';

import { helpIcon, NAV_GROUPS } from '../model/nav';

const itemClass =
  'flex h-10 flex-none items-center gap-2.5 rounded-sm border border-transparent px-2 text-body-strong font-medium whitespace-nowrap text-ink-muted no-underline transition-colors duration-120 ease-out hover:bg-surface-sunken hover:text-ink aria-[current=page]:border-accent/35 aria-[current=page]:bg-accent-soft aria-[current=page]:text-ink';

interface NavPanelProps {
  isAdmin: boolean;
  onNavigate?: () => void;
  groupLabelClassName?: string;
}

export function NavPanel({ isAdmin, onNavigate, groupLabelClassName }: NavPanelProps) {
  const HelpIcon = helpIcon;
  const groupClass = cn('mx-2.5 mt-3.5 mb-1.5 text-label text-ink-faint', groupLabelClassName);

  return (
    <>
      {NAV_GROUPS.filter((group) => !group.adminOnly || isAdmin).map((group) => (
        <Fragment key={group.id}>
          {group.label && <div className={groupClass}>{group.label}</div>}
          {group.items.map((item) => (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.to === '/'}
              className={itemClass}
              onClick={onNavigate}
            >
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
      <div className={groupClass}>{ru.nav.helpGroup}</div>
      <a
        href={runtimeConfig.docsUrl}
        target="_blank"
        rel="noreferrer"
        className={itemClass}
        onClick={onNavigate}
      >
        <IconTile icon={HelpIcon} />
        {ru.nav.apiDocs}
        <ExternalLink aria-hidden="true" className="ml-auto size-3.5 text-ink-faint" />
      </a>
      {runtimeConfig.grafanaUrl && (
        <a
          href={runtimeConfig.grafanaUrl}
          target="_blank"
          rel="noreferrer"
          className={itemClass}
          onClick={onNavigate}
        >
          <IconTile icon={Activity} />
          {ru.nav.grafana}
          <ExternalLink aria-hidden="true" className="ml-auto size-3.5 text-ink-faint" />
        </a>
      )}
    </>
  );
}
