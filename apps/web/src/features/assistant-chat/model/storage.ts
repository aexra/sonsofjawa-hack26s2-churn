import type { ChatTurn } from './types';

export const MAX_MESSAGES = 20;

const HISTORY_KEY = 'assistant.history';
const MCP_KEY = 'assistant.mcpKey';

const read = (key: string): string | null => {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string | null): void => {
  try {
    if (value === null) {
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, value);
    }
  } catch {
    return;
  }
};

const isTurn = (value: unknown): value is ChatTurn => {
  if (typeof value !== 'object' || value === null) return false;
  const turn = value as Partial<ChatTurn>;
  return (
    typeof turn.id === 'string' &&
    (turn.role === 'user' || turn.role === 'assistant') &&
    typeof turn.content === 'string' &&
    Array.isArray(turn.steps) &&
    typeof turn.state === 'string'
  );
};

export const loadHistory = (): ChatTurn[] => {
  const raw = read(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isTurn)
      .slice(-MAX_MESSAGES)
      .map((turn) => (turn.state === 'streaming' ? { ...turn, state: 'stopped' } : turn));
  } catch {
    return [];
  }
};

export const saveHistory = (turns: ChatTurn[]): void => {
  write(HISTORY_KEY, turns.length > 0 ? JSON.stringify(turns.slice(-MAX_MESSAGES)) : null);
};

export const loadMcpKey = (): string => read(MCP_KEY) ?? '';

export const saveMcpKey = (key: string): void => {
  write(MCP_KEY, key === '' ? null : key);
};
