import { AlertCircle, Check, ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';

import { ru } from '@/shared/i18n/ru';
import { cn } from '@/shared/lib/cn';

import type { ChatStep } from '../model/types';

const stepLabel = (step: ChatStep): string => {
  const action = ru.assistant.tools[step.tool] ?? ru.assistant.toolFallback(step.tool);
  const summary =
    step.status === 'failed' ? (step.summary ?? ru.assistant.stepFailed) : step.summary;
  return summary ? ru.assistant.step(action, summary) : action;
};

function StepChip({ step }: { step: ChatStep }) {
  const failed = step.status === 'failed';
  return (
    <li
      data-status={step.status}
      className={cn(
        'inline-flex h-control-sm max-w-full items-center gap-1.5 rounded-full border px-2.5 text-caption',
        failed
          ? 'border-negative bg-risk-high-soft text-negative'
          : 'border-line bg-surface-sunken text-ink-muted',
      )}
    >
      {step.status === 'started' && (
        <span
          aria-hidden="true"
          className="size-2 shrink-0 animate-pulse rounded-full bg-accent motion-reduce:animate-none"
        />
      )}
      {step.status === 'done' && (
        <Check aria-hidden="true" className="size-3.5 shrink-0 text-positive" />
      )}
      {failed && <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />}
      <span className="truncate">{stepLabel(step)}</span>
    </li>
  );
}

interface StepChipsProps {
  steps: ChatStep[];
  collapsed: boolean;
}

export function StepChips({ steps, collapsed }: StepChipsProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (steps.length === 0) return null;
  const visible = !collapsed || expanded;
  const hasFailure = steps.some((step) => step.status === 'failed');
  return (
    <div className="flex flex-col gap-1.5">
      {collapsed && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((value) => !value)}
          className={cn(
            'inline-flex w-fit cursor-pointer items-center gap-1 rounded-sm text-caption hover:text-ink',
            hasFailure ? 'text-negative' : 'text-ink-muted',
          )}
        >
          {ru.assistant.steps(steps.length)}
          <ChevronDown
            aria-hidden="true"
            className={cn('size-3.5 transition-transform duration-120', expanded && 'rotate-180')}
          />
        </button>
      )}
      {visible && (
        <ul
          id={listId}
          aria-label={ru.assistant.stepsList}
          className="m-0 flex list-none flex-wrap gap-1.5 p-0"
        >
          {steps.map((step) => (
            <StepChip key={step.id} step={step} />
          ))}
        </ul>
      )}
    </div>
  );
}
