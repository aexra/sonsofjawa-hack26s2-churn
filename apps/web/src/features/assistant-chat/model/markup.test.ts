import { describe, expect, it } from 'vitest';

import { parseMarkup } from './markup';
import { readSse } from './sse';

const streamOf = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });

describe('assistant markup', () => {
  it('splits paragraphs, lists and tables and finds customer ids', () => {
    const blocks = parseMarkup(
      [
        'первый абзац с **#42**',
        '',
        '- один',
        '- два',
        '',
        '| клиент | потери |',
        '|---|---:|',
        '| #7 | 10 € |',
        '',
        'цвет #fff и a#5 — не ссылки, а &#38; — тоже',
      ].join('\n'),
    );

    expect(blocks.map((block) => block.kind)).toEqual(['paragraph', 'list', 'table', 'paragraph']);
    expect(blocks[0]).toEqual({
      kind: 'paragraph',
      lines: [
        [
          { kind: 'text', text: 'первый абзац с ' },
          { kind: 'strong', children: [{ kind: 'customer', id: '42' }] },
        ],
      ],
    });
    expect(blocks[2]).toMatchObject({
      kind: 'table',
      rows: [[[{ kind: 'customer', id: '7' }], [{ kind: 'text', text: '10 €' }]]],
    });
    expect(JSON.stringify(blocks[3])).not.toContain('customer');
  });

  it('keeps markup-looking text as plain text', () => {
    const blocks = parseMarkup('<img src=x onerror=alert(1)>');
    expect(blocks).toEqual([
      { kind: 'paragraph', lines: [[{ kind: 'text', text: '<img src=x onerror=alert(1)>' }]] },
    ]);
  });
});

describe('event stream reader', () => {
  it('joins events split across chunks', async () => {
    const events = [];
    for await (const event of readSse(
      streamOf(['event: text\ndata: {"del', 'ta":"а"}\n\n: ping\n\nevent: done\ndata: {}\n\n']),
      new AbortController().signal,
    )) {
      events.push(event);
    }
    expect(events).toEqual([
      { event: 'text', data: '{"delta":"а"}' },
      { event: 'done', data: '{}' },
    ]);
  });
});
