import type { components } from '@/shared/api/schema';

export type AssistantEvent = components['schemas']['AssistantEvent'];
export type AssistantRequest = components['schemas']['AssistantRequest'];
export type AssistantPage = components['schemas']['AssistantPage'];

export type ChatErrorKind =
  | 'unavailable'
  | 'rateLimited'
  | 'stepLimit'
  | 'keyInvalid'
  | 'keyForbidden'
  | 'forbidden'
  | 'validation'
  | 'network';

export interface ChatStep {
  id: string;
  tool: string;
  status: 'started' | 'done' | 'failed';
  summary?: string;
}

export type TurnState = 'streaming' | 'done' | 'stopped' | 'failed';

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  steps: ChatStep[];
  state: TurnState;
  error?: ChatErrorKind;
}
