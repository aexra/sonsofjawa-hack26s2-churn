import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

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
}

export function UserMenu({ login, role }: UserMenuProps) {
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme);
  const { mutate: logout } = useLogout();
  const roleLabel = role ? ru.roles[role] : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={ru.header.userMenu}
        className="inline-flex h-control-md cursor-pointer items-center gap-2 rounded-sm px-2 text-body text-ink-muted hover:text-ink"
      >
        <span>
          {login}
          {roleLabel && ` · ${roleLabel}`}
        </span>
        <ChevronDown aria-hidden="true" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
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
