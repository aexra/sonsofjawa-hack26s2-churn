import { Send, Square } from 'lucide-react';
import { useId, useState } from 'react';

import { MAX_QUESTION_LENGTH } from '@/features/assistant-chat';
import { ru } from '@/shared/i18n/ru';
import { Button } from '@/shared/ui/button';

import type { Ref } from 'react';

interface ComposerProps {
  ref: Ref<HTMLTextAreaElement>;
  streaming: boolean;
  onSubmit: (question: string) => boolean;
  onStop: () => void;
}

export function Composer({ ref, streaming, onSubmit, onStop }: ComposerProps) {
  const [draft, setDraft] = useState('');
  const id = useId();
  const empty = draft.trim() === '';

  const submit = () => {
    if (streaming || empty) return;
    if (onSubmit(draft)) setDraft('');
  };

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {ru.assistant.question}
      </label>
      <textarea
        ref={ref}
        id={id}
        rows={2}
        maxLength={MAX_QUESTION_LENGTH}
        placeholder={ru.assistant.placeholder}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        className="box-border max-h-40 min-h-control-md min-w-0 flex-1 resize-none rounded-sm border border-line-strong bg-canvas px-3 py-2 text-body text-ink placeholder:text-ink-faint"
      />
      {streaming ? (
        <Button className="shrink-0 gap-1.5" onClick={onStop}>
          <Square aria-hidden="true" className="size-3.5" />
          {ru.assistant.stop}
        </Button>
      ) : (
        <Button type="submit" variant="primary" className="shrink-0 gap-1.5" disabled={empty}>
          <Send aria-hidden="true" className="size-4" />
          {ru.assistant.send}
        </Button>
      )}
    </form>
  );
}
