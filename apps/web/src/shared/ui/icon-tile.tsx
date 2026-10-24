import { cva } from 'class-variance-authority';

import type { LucideIcon } from 'lucide-react';

const tile = cva('grid flex-none place-items-center border', {
  variants: {
    tone: {
      default: 'border-line bg-tile text-on-tile',
      active: 'border-on-tile-active bg-tile text-on-tile-active',
      accent: 'border-line bg-accent text-on-accent',
      danger: 'border-line bg-tile text-risk-high',
    },
    size: {
      28: 'size-7 rounded-sm',
      48: 'size-12 rounded-md',
    },
  },
  defaultVariants: { tone: 'default', size: 28 },
});

interface IconTileProps {
  icon: LucideIcon;
  tone?: 'default' | 'active' | 'accent' | 'danger';
  size?: 28 | 48;
}

export function IconTile({ icon: Icon, tone, size = 28 }: IconTileProps) {
  return (
    <span aria-hidden="true" className={tile({ tone, size })}>
      <Icon className={size === 48 ? 'size-5.5' : 'size-4'} />
    </span>
  );
}
