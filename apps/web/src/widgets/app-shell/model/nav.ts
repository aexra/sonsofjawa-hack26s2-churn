import {
  BookOpen,
  Database,
  KeyRound,
  LayoutGrid,
  SlidersHorizontal,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { ru } from '@/shared/i18n/ru';

interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
}

interface NavGroup {
  id: string;
  label?: string;
  adminOnly?: boolean;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'main',
    items: [
      { id: 'overview', label: ru.nav.overview, to: '/', icon: LayoutGrid },
      { id: 'customers', label: ru.nav.customers, to: '/customers', icon: Users },
      { id: 'model', label: ru.nav.model, to: '/model', icon: SlidersHorizontal },
    ],
  },
  {
    id: 'admin',
    label: ru.nav.adminGroup,
    adminOnly: true,
    items: [
      { id: 'data', label: ru.nav.data, to: '/data', icon: Database },
      { id: 'keys', label: ru.nav.apiKeys, to: '/access/keys', icon: KeyRound },
      { id: 'users', label: ru.nav.users, to: '/access/users', icon: UserCog },
    ],
  },
];

export const helpIcon = BookOpen;
