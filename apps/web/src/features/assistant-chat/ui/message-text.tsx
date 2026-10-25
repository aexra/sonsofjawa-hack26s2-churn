import { useMemo } from 'react';
import { Link } from 'react-router';

import { ru } from '@/shared/i18n/ru';

import { parseMarkup, type Block, type Inline } from '../model/markup';

interface InlineProps {
  content: Inline[];
  onNavigate?: () => void;
}

function InlineContent({ content, onNavigate }: InlineProps) {
  return content.map((part, index) => {
    switch (part.kind) {
      case 'text':
        return <span key={index}>{part.text}</span>;
      case 'strong':
        return (
          <strong key={index} className="font-semibold text-ink">
            <InlineContent content={part.children} onNavigate={onNavigate} />
          </strong>
        );
      case 'code':
        return (
          <code key={index} className="rounded-xs bg-surface-sunken px-1 font-mono text-data">
            {part.text}
          </code>
        );
      case 'customer':
        return (
          <Link
            key={index}
            to={`/customers/${part.id}`}
            aria-label={ru.assistant.customerLink(part.id)}
            className="font-mono text-data text-accent underline-offset-2 hover:underline"
            onClick={onNavigate}
          >
            #{part.id}
          </Link>
        );
    }
  });
}

function BlockView({ block, onNavigate }: { block: Block; onNavigate?: () => void }) {
  switch (block.kind) {
    case 'heading':
      return (
        <p className="m-0 text-body-strong text-ink">
          <InlineContent content={block.content} onNavigate={onNavigate} />
        </p>
      );
    case 'paragraph':
      return (
        <p className="m-0">
          {block.lines.map((line, index) => (
            <span key={index}>
              {index > 0 && <br />}
              <InlineContent content={line} onNavigate={onNavigate} />
            </span>
          ))}
        </p>
      );
    case 'list': {
      const items = block.items.map((item, index) => (
        <li key={index}>
          <InlineContent content={item} onNavigate={onNavigate} />
        </li>
      ));
      return block.ordered ? (
        <ol className="m-0 flex list-decimal flex-col gap-1 pl-5">{items}</ol>
      ) : (
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5">{items}</ul>
      );
    }
    case 'table':
      return (
        <div className="max-w-full overflow-x-auto rounded-sm border border-line">
          <table className="w-full border-collapse text-caption">
            <thead className="bg-surface-sunken">
              <tr>
                {block.header.map((cell, index) => (
                  <th
                    key={index}
                    scope="col"
                    className="border-b border-line px-2 py-1.5 text-left text-label whitespace-nowrap text-ink-muted"
                  >
                    <InlineContent content={cell} onNavigate={onNavigate} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-line last:border-b-0">
                  {row.map((cell, index) => (
                    <td key={index} className="px-2 py-1.5 align-top tabular-nums">
                      <InlineContent content={cell} onNavigate={onNavigate} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

interface MessageTextProps {
  text: string;
  streaming?: boolean;
  onNavigate?: () => void;
}

export function MessageText({ text, streaming = false, onNavigate }: MessageTextProps) {
  const blocks = useMemo(() => parseMarkup(text), [text]);
  return (
    <div className="flex min-w-0 flex-col gap-2 text-body break-words text-ink">
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} onNavigate={onNavigate} />
      ))}
      {streaming && (
        <span
          aria-hidden="true"
          className="inline-block h-4 w-1.5 animate-pulse rounded-xs bg-accent motion-reduce:animate-none"
        />
      )}
    </div>
  );
}
