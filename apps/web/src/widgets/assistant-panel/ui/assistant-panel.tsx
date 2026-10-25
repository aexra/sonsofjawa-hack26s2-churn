import { MessageCircle, Plus, Settings, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';

import { useSession } from '@/entities/session';
import {
  ChatTurnView,
  isKeyError,
  McpKeyField,
  pageContext,
  useAssistantChat,
  useMcpKey,
} from '@/features/assistant-chat';
import { ru } from '@/shared/i18n/ru';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

import { Composer } from './composer';
import { Suggestions } from './suggestions';

const MOBILE_QUERY = '(max-width: 767px)';

const isMobile = () =>
  typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_QUERY).matches;

const isToggleShortcut = (event: KeyboardEvent) =>
  (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k';

export function AssistantPanel() {
  const { user } = useSession();
  if (!user?.assistantEnabled) return null;
  return <AssistantPanelFrame />;
}

function AssistantPanelFrame() {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dismissedKeyError, setDismissedKeyError] = useState<string>();
  const { pathname } = useLocation();
  const page = useMemo(() => pageContext(pathname), [pathname]);
  const chat = useAssistantChat();
  const mcpKey = useMcpKey();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const settingsId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isToggleShortcut(event)) return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [chat.turns]);

  const lastTurn = chat.turns.at(-1);
  const keyErrorTurn = isKeyError(chat.lastError) ? lastTurn?.id : undefined;
  const keyErrorActive = keyErrorTurn !== undefined && keyErrorTurn !== dismissedKeyError;
  const keyFieldError = !mcpKey.wellFormed
    ? ru.assistant.errors.keyFormat
    : keyErrorActive && chat.lastError
      ? ru.assistant.errors[chat.lastError]
      : undefined;
  const settingsVisible = settingsOpen || keyErrorActive;

  const ask = (question: string) => {
    if (!mcpKey.wellFormed) {
      setSettingsOpen(true);
      return false;
    }
    void chat.send(question, { page, mcpKey: mcpKey.key || undefined });
    return true;
  };

  const toggleSettings = () => {
    if (settingsVisible) {
      setSettingsOpen(false);
      setDismissedKeyError(keyErrorTurn);
    } else {
      setSettingsOpen(true);
    }
  };

  const onNavigate = () => {
    if (isMobile()) setOpen(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen} modal={false}>
      <DialogPrimitive.Trigger asChild>
        <Button aria-keyshortcuts="Control+K" className="gap-2">
          <MessageCircle aria-hidden="true" className="size-4" />
          {ru.assistant.open}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onInteractOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            composerRef.current?.focus();
          }}
          className="fixed inset-0 z-40 box-border flex flex-col bg-surface outline-none md:left-auto md:w-105 md:border-l md:border-line md:shadow-pop"
        >
          <header className="flex h-header flex-none items-center gap-1 border-b border-line px-4">
            <div className="mr-auto flex min-w-0 items-center gap-2">
              <DialogPrimitive.Title className="m-0 font-display text-heading text-ink">
                {ru.assistant.title}
              </DialogPrimitive.Title>
              {mcpKey.key !== '' && <Badge size="sm">{ru.assistant.key.badge}</Badge>}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 px-2"
              disabled={chat.turns.length === 0}
              onClick={() => {
                chat.reset();
                setDismissedKeyError(undefined);
                composerRef.current?.focus();
              }}
            >
              <Plus aria-hidden="true" className="size-4" />
              {ru.assistant.newDialog}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={ru.assistant.settings}
              aria-expanded={settingsVisible}
              aria-controls={settingsId}
              className="size-9 shrink-0 px-0"
              onClick={toggleSettings}
            >
              <Settings aria-hidden="true" className="size-4" />
            </Button>
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label={ru.assistant.close}
                className="size-9 shrink-0 px-0"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </header>
          {settingsVisible && (
            <section
              id={settingsId}
              className="flex-none border-b border-line bg-surface-sunken px-4 py-3"
            >
              <McpKeyField
                value={mcpKey.key}
                error={keyFieldError}
                onChange={(value) => {
                  mcpKey.setKey(value);
                  setDismissedKeyError(keyErrorTurn);
                }}
                onForget={() => {
                  mcpKey.forget();
                  setDismissedKeyError(keyErrorTurn);
                }}
              />
            </section>
          )}
          <div
            ref={scrollRef}
            role="log"
            aria-label={ru.assistant.dialogLabel}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto px-4 py-4"
          >
            {chat.turns.length === 0 ? (
              <Suggestions page={page} onPick={(question) => ask(question)} />
            ) : (
              chat.turns.map((turn) => (
                <ChatTurnView key={turn.id} turn={turn} onNavigate={onNavigate} />
              ))
            )}
          </div>
          <footer className="flex flex-none flex-col gap-2 border-t border-line px-4 pt-3 pb-4">
            <Composer
              ref={composerRef}
              streaming={chat.streaming}
              onSubmit={ask}
              onStop={chat.stop}
            />
            <p className="m-0 text-caption text-ink-faint">{ru.assistant.disclaimer}</p>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
