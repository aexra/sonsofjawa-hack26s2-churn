import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/setup';

import { ApiError } from './api-error';
import { createApiClient, setSessionExpiredHandler, unwrap } from './client';

const BASE = 'http://api.test/api/v1';
const user = { id: 1, login: 'admin', role: 'admin', authProvider: 'local' };
const problem = (status: number, code: string) =>
  HttpResponse.json(
    { type: 'about:blank', title: code, status, code },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );

afterEach(() => {
  setSessionExpiredHandler(() => undefined);
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('api client', () => {
  it('adds the csrf header to unsafe methods only', async () => {
    document.cookie = 'XSRF-TOKEN=token-1';
    const seen: Record<string, string | null> = {};
    server.use(
      http.get(`${BASE}/auth/me`, ({ request }) => {
        seen.get = request.headers.get('X-XSRF-TOKEN');
        return HttpResponse.json(user);
      }),
      http.post(`${BASE}/auth/logout`, ({ request }) => {
        seen.post = request.headers.get('X-XSRF-TOKEN');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const client = createApiClient(BASE);

    await unwrap(client.GET('/api/v1/auth/me'));
    await unwrap(client.POST('/api/v1/auth/logout'));

    expect(seen).toEqual({ get: null, post: 'token-1' });
  });

  it('refreshes the session once and repeats the request after a 401', async () => {
    let refreshes = 0;
    let attempts = 0;
    server.use(
      http.get(`${BASE}/auth/me`, () => {
        attempts += 1;
        return attempts === 1 ? problem(401, 'unauthenticated') : HttpResponse.json(user);
      }),
      http.post(`${BASE}/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json(user);
      }),
    );

    const result = await unwrap(createApiClient(BASE).GET('/api/v1/auth/me'));

    expect(result).toMatchObject({ login: 'admin' });
    expect(refreshes).toBe(1);
    expect(attempts).toBe(2);
  });

  it('shares one refresh between parallel requests', async () => {
    let refreshes = 0;
    const calls = new Map<string, number>();
    server.use(
      http.get(`${BASE}/auth/me`, ({ request }) => {
        const key = request.url;
        calls.set(key, (calls.get(key) ?? 0) + 1);
        return refreshes === 0 ? problem(401, 'unauthenticated') : HttpResponse.json(user);
      }),
      http.post(`${BASE}/auth/refresh`, async () => {
        refreshes += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return HttpResponse.json(user);
      }),
    );
    const client = createApiClient(BASE);

    await Promise.all([
      unwrap(client.GET('/api/v1/auth/me')),
      unwrap(client.GET('/api/v1/auth/me')),
      unwrap(client.GET('/api/v1/auth/me')),
    ]);

    expect(refreshes).toBe(1);
  });

  it('replays a request with a body after refreshing', async () => {
    let attempts = 0;
    let lastBody: unknown;
    server.use(
      http.post(`${BASE}/auth/logout`, async ({ request }) => {
        attempts += 1;
        lastBody = await request.text();
        return attempts === 1
          ? problem(401, 'unauthenticated')
          : new HttpResponse(null, { status: 204 });
      }),
      http.post(`${BASE}/auth/refresh`, () => HttpResponse.json(user)),
    );

    await unwrap(createApiClient(BASE).POST('/api/v1/auth/logout'));

    expect(attempts).toBe(2);
    expect(lastBody).toBe('');
  });

  it('reports an expired session when refresh fails', async () => {
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    server.use(
      http.get(`${BASE}/auth/me`, () => problem(401, 'unauthenticated')),
      http.post(`${BASE}/auth/refresh`, () => problem(401, 'refresh_invalid')),
    );

    await expect(unwrap(createApiClient(BASE).GET('/api/v1/auth/me'))).rejects.toMatchObject({
      status: 401,
      code: 'unauthenticated',
    });
    expect(expired).toHaveBeenCalledOnce();
  });

  it('does not refresh after a failed login', async () => {
    let refreshes = 0;
    server.use(
      http.post(`${BASE}/auth/login`, () => problem(401, 'invalid_credentials')),
      http.post(`${BASE}/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json(user);
      }),
    );

    const request = unwrap(
      createApiClient(BASE).POST('/api/v1/auth/login', { body: { login: 'a', password: 'b' } }),
    );

    await expect(request).rejects.toMatchObject({ status: 401, code: 'invalid_credentials' });
    expect(refreshes).toBe(0);
  });

  it('turns problem+json into an ApiError with field errors', async () => {
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'validation',
            status: 400,
            code: 'validation_failed',
            errors: [{ code: 'required', message: 'login is required', field: 'login' }],
          },
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );

    const error = await unwrap(
      createApiClient(BASE).POST('/api/v1/auth/login', { body: { login: '', password: '' } }),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'validation_failed',
      errors: [{ field: 'login' }],
    });
  });
});
