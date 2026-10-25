import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { FakeEventSource } from './fake-event-source';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.assign(globalThis, { ResizeObserver: ResizeObserverStub, EventSource: FakeEventSource });

export const server = setupServer();

Object.assign(window, {
  __APP_CONFIG__: {
    apiBaseUrl: 'http://localhost:3000/api/v1',
    docsUrl: '/api/v1/docs',
    grafanaUrl: '',
    demoUser: '',
  },
});

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});

afterEach(() => {
  FakeEventSource.reset();
  server.resetHandlers();
  cleanup();
});

afterAll(() => {
  server.close();
});
