import { act, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { FakeEventSource } from '@/test/fake-event-source';
import { server } from '@/test/setup';

import { admin, problem, renderAt, signedInAs } from './test-utils';

describe('live updates in the app shell', () => {
  it('opens the stream after sign-in and shows the recalculation in the header', async () => {
    server.use(...signedInAs(admin));
    renderAt('/');

    const indicator = await screen.findByRole('status');
    expect(indicator).toHaveTextContent(/^обновлено \d{2}:\d{2}$/);
    expect(FakeEventSource.instances).toHaveLength(1);

    act(() => {
      FakeEventSource.current.emit('recalc.started', { runId: 1, trigger: 'manual' });
    });
    expect(indicator).toHaveTextContent('пересчёт…');
  });

  it('does not open the stream for an anonymous visitor', async () => {
    server.use(
      http.get('*/api/v1/auth/me', () => problem(401, 'unauthenticated')),
      http.post('*/api/v1/auth/refresh', () => problem(401, 'refresh_invalid')),
      http.get('*/api/v1/auth/providers', () =>
        HttpResponse.json({ local: { enabled: true }, oidc: { enabled: false } }),
      ),
    );
    renderAt('/');

    expect(await screen.findByRole('heading', { name: 'вход' })).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});
