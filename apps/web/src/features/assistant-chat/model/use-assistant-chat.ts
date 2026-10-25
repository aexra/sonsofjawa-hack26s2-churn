import { useCallback, useEffect, useRef, useState } from 'react';

import { askAssistant } from './ask';
import { fromEventCode, fromRequestError } from './errors';
import { loadHistory, MAX_MESSAGES, saveHistory } from './storage';

import type { AssistantEvent, AssistantPage, ChatStep, ChatTurn } from './types';

export const MAX_QUESTION_LENGTH = 4000;

let sequence = 0;
const nextId = () => {
  sequence += 1;
  return `${Date.now().toString(36)}-${String(sequence)}`;
};

const toRequestMessages = (turns: ChatTurn[]) =>
  turns
    .filter((turn) => turn.content.trim() !== '')
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, MAX_QUESTION_LENGTH) }))
    .slice(-MAX_MESSAGES);

const applyStep = (steps: ChatStep[], event: AssistantEvent): ChatStep[] => {
  const id = event.id ?? event.tool ?? String(steps.length);
  const step: ChatStep = {
    id,
    tool: event.tool ?? steps.find((item) => item.id === id)?.tool ?? '',
    status: event.status ?? 'started',
    summary: event.summary,
  };
  return steps.some((item) => item.id === id)
    ? steps.map((item) =>
        item.id === id ? { ...item, ...step, tool: step.tool || item.tool } : item,
      )
    : [...steps, step];
};

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

interface SendOptions {
  page?: AssistantPage;
  mcpKey?: string;
}

export function useAssistantChat() {
  const [turns, setTurns] = useState<ChatTurn[]>(loadHistory);
  const controller = useRef<AbortController | null>(null);
  const turnsRef = useRef(turns);

  useEffect(() => {
    turnsRef.current = turns;
    saveHistory(turns);
  }, [turns]);

  useEffect(() => () => controller.current?.abort(), []);

  const updateTurn = useCallback((id: string, update: (turn: ChatTurn) => ChatTurn) => {
    setTurns((current) => current.map((turn) => (turn.id === id ? update(turn) : turn)));
  }, []);

  const send = useCallback(
    async (question: string, { page, mcpKey }: SendOptions = {}) => {
      const text = question.trim().slice(0, MAX_QUESTION_LENGTH);
      if (text === '' || controller.current) return;
      const userTurn: ChatTurn = {
        id: nextId(),
        role: 'user',
        content: text,
        steps: [],
        state: 'done',
      };
      const answerId = nextId();
      const answer: ChatTurn = {
        id: answerId,
        role: 'assistant',
        content: '',
        steps: [],
        state: 'streaming',
      };
      const messages = toRequestMessages([...turnsRef.current, userTurn]);
      setTurns((current) => [...current, userTurn, answer].slice(-MAX_MESSAGES));

      const abort = new AbortController();
      controller.current = abort;
      let finished = false;
      try {
        for await (const event of askAssistant(
          { messages, ...(page && { page }), ...(mcpKey && { mcpKey }) },
          abort.signal,
        )) {
          if (abort.signal.aborted) break;
          if (event.type === 'text') {
            updateTurn(answerId, (turn) => ({
              ...turn,
              content: turn.content + (event.delta ?? ''),
            }));
          } else if (event.type === 'step') {
            updateTurn(answerId, (turn) => ({ ...turn, steps: applyStep(turn.steps, event) }));
          } else if (event.type === 'done') {
            finished = true;
            updateTurn(answerId, (turn) => ({ ...turn, state: 'done' }));
          } else {
            finished = true;
            updateTurn(answerId, (turn) => ({
              ...turn,
              state: 'failed',
              error: fromEventCode(event.code),
            }));
          }
        }
        if (!finished) {
          updateTurn(answerId, (turn) =>
            abort.signal.aborted
              ? { ...turn, state: 'stopped' }
              : { ...turn, state: 'failed', error: 'unavailable' },
          );
        }
      } catch (error) {
        updateTurn(answerId, (turn) =>
          isAbort(error) || abort.signal.aborted
            ? { ...turn, state: 'stopped' }
            : { ...turn, state: 'failed', error: fromRequestError(error) },
        );
      } finally {
        if (controller.current === abort) controller.current = null;
      }
    },
    [updateTurn],
  );

  const stop = useCallback(() => {
    controller.current?.abort();
  }, []);

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setTurns([]);
  }, []);

  const last = turns.at(-1);
  return {
    turns,
    streaming: last?.state === 'streaming',
    lastError: last?.role === 'assistant' ? last.error : undefined,
    send,
    stop,
    reset,
  };
}
