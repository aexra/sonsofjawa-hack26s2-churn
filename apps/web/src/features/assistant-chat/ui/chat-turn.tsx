import { AlertCircle } from 'lucide-react';

import { ru } from '@/shared/i18n/ru';

import { chatErrorText } from '../model/errors';

import { MessageText } from './message-text';
import { StepChips } from './step-chips';

import type { ChatTurn } from '../model/types';

interface ChatTurnViewProps {
  turn: ChatTurn;
  onNavigate?: () => void;
}

export function ChatTurnView({ turn, onNavigate }: ChatTurnViewProps) {
  if (turn.role === 'user') {
    return (
      <article aria-label={ru.assistant.you} className="flex justify-end">
        <p className="m-0 max-w-[85%] rounded-md rounded-br-xs bg-accent-soft px-3.5 py-2.5 text-body break-words whitespace-pre-wrap text-ink">
          {turn.content}
        </p>
      </article>
    );
  }
  const streaming = turn.state === 'streaming';
  return (
    <article
      aria-label={ru.assistant.answer}
      aria-busy={streaming || undefined}
      className="flex flex-col gap-2"
    >
      <StepChips steps={turn.steps} collapsed={!streaming} />
      {turn.content !== '' && (
        <MessageText text={turn.content} streaming={streaming} onNavigate={onNavigate} />
      )}
      {streaming && turn.content === '' && (
        <p className="m-0 flex items-center gap-2 text-caption text-ink-muted">
          <span
            aria-hidden="true"
            className="size-2 animate-pulse rounded-full bg-accent motion-reduce:animate-none"
          />
          {ru.assistant.thinking}
        </p>
      )}
      {turn.state === 'stopped' && (
        <p className="m-0 text-caption text-ink-faint">{ru.assistant.stopped}</p>
      )}
      {turn.state === 'failed' && turn.error && (
        <p
          role="alert"
          className="m-0 flex items-start gap-2 rounded-sm border border-line bg-risk-high-soft px-3 py-2 text-body text-negative"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {chatErrorText(turn.error)}
        </p>
      )}
    </article>
  );
}
