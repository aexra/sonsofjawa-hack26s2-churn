import { http, HttpResponse } from 'msw';

type EventType = 'step' | 'text' | 'done' | 'error';

interface AssistantStream {
  send: (type: EventType, data?: object) => void;
  close: () => void;
  requests: unknown[];
}

const encoder = new TextEncoder();

const frameText = (type: EventType, data: object) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;

export const assistantStream = () => {
  const state: AssistantStream & { controller?: ReadableStreamDefaultController<Uint8Array> } = {
    requests: [],
    send: (type, data = {}) => state.controller?.enqueue(encoder.encode(frameText(type, data))),
    close: () => state.controller?.close(),
  };
  const handler = http.post('*/api/v1/assistant/messages', async ({ request }) => {
    state.requests.push(await request.json());
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        state.controller = controller;
      },
    });
    return new HttpResponse(body, { headers: { 'Content-Type': 'text/event-stream' } });
  });
  return { stream: state as AssistantStream, handler };
};

export const assistantReply = (events: [EventType, object][]) => {
  const requests: unknown[] = [];
  const handler = http.post('*/api/v1/assistant/messages', async ({ request }) => {
    requests.push(await request.json());
    const text = events.map(([type, data]) => frameText(type, data)).join('');
    return new HttpResponse(text, { headers: { 'Content-Type': 'text/event-stream' } });
  });
  return { requests, handler };
};
