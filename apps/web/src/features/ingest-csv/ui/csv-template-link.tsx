import { Download } from 'lucide-react';

import { ru } from '@/shared/i18n/ru';

import { templateFileName, templateHref } from '../model/template';

import type { IngestEntity } from '@/entities/ingest';

export function CsvTemplateLink({ entity }: { entity: IngestEntity }) {
  return (
    <a
      href={templateHref(entity)}
      download={templateFileName(entity)}
      className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-accent underline hover:text-ink"
    >
      <Download aria-hidden="true" className="size-4" />
      {ru.ingest.csv.template}
    </a>
  );
}
