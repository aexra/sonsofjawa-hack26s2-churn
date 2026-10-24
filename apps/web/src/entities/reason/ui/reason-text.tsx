import { ru } from '@/shared/i18n/ru';
import { formatScore } from '@/shared/lib/format';
import { Tooltip } from '@/shared/ui/tooltip';

import type { components } from '@/shared/api/schema';

export type Reason = components['schemas']['Reason'];

interface ReasonTextProps {
  reason: Reason;
}

export function ReasonText({ reason }: ReasonTextProps) {
  return (
    <Tooltip
      content={
        <span className="flex flex-col gap-1">
          <span className="font-medium">{reason.title}</span>
          <span>{reason.text}</span>
          <span className="font-mono tabular-nums">
            {ru.reason.contribution} +{formatScore(reason.contribution)} · {ru.reason.weight}{' '}
            {formatScore(reason.weight)} · {ru.reason.value} {formatScore(reason.value)}
          </span>
        </span>
      }
    >
      <span className="block max-w-65 truncate">{reason.text}</span>
    </Tooltip>
  );
}
