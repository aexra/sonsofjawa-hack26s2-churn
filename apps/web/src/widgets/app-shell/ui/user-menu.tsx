import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { type CurrentUser } from '@/entities/session';
import { useLogout } from '@/features/auth-logout';
import { ru } from '@/shared/i18n/ru';
import { applyTheme, getStoredTheme, type ThemeMode } from '@/shared/lib/theme';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: ru.header.themeSystem },
  { value: 'light', label: ru.header.themeLight },
  { value: 'dark', label: ru.header.themeDark },
];

interface UserMenuProps {
  login: string;
  role: 'admin' | 'user' | undefined;
  authProvider: CurrentUser['authProvider'];
}

export function UserMenu({ login, role, authProvider }: UserMenuProps) {
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme);
  const { mutate: logout } = useLogout();
  const roleLabel = role ? ru.roles[role] : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={ru.header.userMenu}
        className="inline-flex h-control-md cursor-pointer items-center gap-2.5 rounded-sm pr-1.5 pl-1 text-body-strong font-medium text-ink hover:bg-surface-sunken"
      >
        <span
          aria-hidden="true"
          className="grid size-7 place-items-center rounded-sm bg-accent font-display text-[13px] font-bold text-on-accent"
        >
          {login.charAt(0)}
        </span>
        <span>
          {login}
          {roleLabel && ` · ${roleLabel}`}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 text-ink-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          {ru.header.authMethod(
            authProvider === 'oidc' ? ru.access.users.methodSso : ru.access.users.methodLocal,
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{ru.header.theme}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            const mode = value as ThemeMode;
            applyTheme(mode);
            setTheme(mode);
          }}
        >
          {THEMES.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logout()}>{ru.header.logout}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
