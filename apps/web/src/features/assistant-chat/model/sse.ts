interface SseMessage {
  event: string;
  data: string;
}

const parseBlock = (block: string): SseMessage | null => {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split(/\r?\n|\r/)) {
    if (line === '' || line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    if (field === 'data') data.push(value);
  }
  return data.length > 0 ? { event, data: data.join('\n') } : null;
};

const BLOCK_END = /\r?\n\r?\n|\r\r/;

export async function* readSse(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const cancel = () => {
    reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let match = BLOCK_END.exec(buffer);
      while (match) {
        const message = parseBlock(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
        if (message) yield message;
        match = BLOCK_END.exec(buffer);
      }
      if (done || signal.aborted) break;
    }
    if (signal.aborted) return;
    const tail = parseBlock(buffer);
    if (tail) yield tail;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}
