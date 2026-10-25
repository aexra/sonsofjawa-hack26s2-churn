import { MessageCircle } from 'lucide-react';

import { suggestionsFor } from '@/features/assistant-chat';
import { ru } from '@/shared/i18n/ru';
import { IconTile } from '@/shared/ui/icon-tile';

import type { ComponentProps } from 'react';

type Page = Parameters<typeof suggestionsFor>[0];

interface SuggestionsProps {
  page: Page;
  onPick: (question: string) => void;
}

export function Suggestions({ page, onPick }: SuggestionsProps) {
  return (
    <div className="my-auto flex flex-col items-start gap-4">
      <div className="flex items-center gap-3">
        <IconTile icon={MessageCircle} />
        <p className="m-0 font-display text-heading text-ink">{ru.assistant.greeting}</p>
      </div>
      <ul
        aria-label={ru.assistant.suggestionsLabel}
        className="m-0 flex list-none flex-col gap-2 p-0"
      >
        {suggestionsFor(page).map((question) => (
          <li key={question}>
            <SuggestionButton onClick={() => onPick(question)}>{question}</SuggestionButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SuggestionButton(props: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className="cursor-pointer rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-left text-body text-ink transition-colors duration-120 ease-out hover:bg-surface-sunken"
      {...props}
    />
  );
}
