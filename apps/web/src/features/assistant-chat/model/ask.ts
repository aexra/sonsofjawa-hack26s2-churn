import { postEventStream, problemOf } from '@/shared/api/client';

import { readSse } from './sse';

import type { AssistantEvent, AssistantRequest } from './types';

const EVENT_TYPES = new Set<AssistantEvent['type']>(['step', 'text', 'done', 'error']);

const parseEvent = (name: string, data: string): AssistantEvent | null => {
  let payload: Partial<AssistantEvent>;
  try {
    payload = JSON.parse(data) as Partial<AssistantEvent>;
  } catch {
    return null;
  }
  const type = (EVENT_TYPES.has(name as AssistantEvent['type']) ? name : payload.type) as
    AssistantEvent['type'] | undefined;
  return type && EVENT_TYPES.has(type) ? { ...payload, type } : null;
};

export async function* askAssistant(
  request: AssistantRequest,
  signal: AbortSignal,
): AsyncGenerator<AssistantEvent> {
  const response = await postEventStream('/api/v1/assistant/messages', request, signal);
  if (!response.ok) throw await problemOf(response);
  if (!response.body) return;
  for await (const message of readSse(response.body, signal)) {
    const event = parseEvent(message.event, message.data);
    if (event) yield event;
  }
}
