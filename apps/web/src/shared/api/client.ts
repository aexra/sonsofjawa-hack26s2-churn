import createClient, { type Middleware } from 'openapi-fetch';

import { runtimeConfig } from '@/shared/config/runtime';

import { ApiError } from './api-error';

import type { components, paths } from './schema';

const API_PREFIX = '/api/v1';
const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'X-XSRF-TOKEN';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const NO_REFRESH_PATHS = [`${API_PREFIX}/auth/login`, `${API_PREFIX}/auth/refresh`];

const serverOrigin = (apiBaseUrl: string): string =>
  apiBaseUrl.endsWith(API_PREFIX) ? apiBaseUrl.slice(0, -API_PREFIX.length) : apiBaseUrl;

const readCookie = (name: string): string | undefined => {
  for (const part of document.cookie.split('; ')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator) === name) {
      return decodeURIComponent(part.slice(separator + 1));
    }
  }
  return undefined;
};

const applyCsrf = (request: Request): void => {
  if (SAFE_METHODS.has(request.method)) return;
  const token = readCookie(CSRF_COOKIE);
  if (token) request.headers.set(CSRF_HEADER, token);
};

let sessionExpiredHandler: (() => void) | undefined;
let refreshing: Promise<boolean> | null = null;

export const setSessionExpiredHandler = (handler: () => void): void => {
  sessionExpiredHandler = handler;
};

const refreshSession = (origin: string): Promise<boolean> => {
  refreshing ??= fetch(`${origin}${API_PREFIX}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
};

export const createApiClient = (apiBaseUrl: string) => {
  const origin = serverOrigin(apiBaseUrl);
  const replayable = new WeakMap<Request, Request>();

  const middleware: Middleware = {
    onRequest({ request }) {
      applyCsrf(request);
      replayable.set(request, request.clone());
      return request;
    },
    async onResponse({ request, response }) {
      const path = new URL(request.url, window.location.origin).pathname;
      if (response.status !== 401 || NO_REFRESH_PATHS.includes(path)) return response;
      const original = replayable.get(request);
      if (!original) return response;
      if (await refreshSession(origin)) {
        applyCsrf(original);
        return fetch(original, { credentials: 'include' });
      }
      sessionExpiredHandler?.();
      return response;
    },
  };

  const client = createClient<paths>({
    baseUrl: origin,
    credentials: 'include',
    fetch: (request) => globalThis.fetch(request),
  });
  client.use(middleware);
  return client;
};

export const apiClient = createApiClient(runtimeConfig.apiBaseUrl);

type StreamPath = keyof paths & `${typeof API_PREFIX}/${string}`;

export const postEventStream = async (
  path: StreamPath,
  body: unknown,
  signal: AbortSignal,
): Promise<Response> => {
  const origin = serverOrigin(runtimeConfig.apiBaseUrl);
  const send = () => {
    const request = new Request(`${origin}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
    applyCsrf(request);
    return globalThis.fetch(request);
  };
  const response = await send();
  if (response.status !== 401) return response;
  if (await refreshSession(origin)) return send();
  sessionExpiredHandler?.();
  return response;
};

export const problemOf = async (response: Response): Promise<ApiError> => {
  let problem: Partial<components['schemas']['Problem']> | undefined;
  try {
    problem = (await response.json()) as Partial<components['schemas']['Problem']>;
  } catch {
    problem = undefined;
  }
  return new ApiError(response.status, problem);
};

interface Settled {
  data?: unknown;
  error?: unknown;
  response: Response;
}

export const unwrap = async <R extends Settled>(
  request: Promise<R>,
): Promise<Extract<R, { error?: never }>['data']> => {
  const result = await request;
  if (result.error !== undefined) {
    throw new ApiError(
      result.response.status,
      result.error as Partial<components['schemas']['Problem']>,
    );
  }
  return result.data;
};
