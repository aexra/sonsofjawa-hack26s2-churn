import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';

import { ru } from '@/shared/i18n/ru';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

interface McpKeyFieldProps {
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onForget: () => void;
}

export function McpKeyField({ value, error, onChange, onForget }: McpKeyFieldProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label text-ink-muted">
        {ru.assistant.key.title}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          mono
          invalid={Boolean(error)}
          autoComplete="off"
          spellCheck={false}
          placeholder={ru.assistant.key.placeholder}
          aria-describedby={hintId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1"
        />
        <Button
          variant="ghost"
          size="sm"
          aria-label={visible ? ru.assistant.key.hide : ru.assistant.key.show}
          aria-pressed={visible}
          className="size-9 shrink-0 px-0"
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="size-4" />
          ) : (
            <Eye aria-hidden="true" className="size-4" />
          )}
        </Button>
      </div>
      <p
        id={hintId}
        className={error ? 'm-0 text-caption text-negative' : 'm-0 text-caption text-ink-muted'}
      >
        {error ?? (value === '' ? ru.assistant.key.hint : ru.assistant.key.active)}
      </p>
      {value !== '' && (
        <Button variant="ghost-danger" size="sm" className="w-fit px-2" onClick={onForget}>
          {ru.assistant.key.forget}
        </Button>
      )}
    </div>
  );
}
