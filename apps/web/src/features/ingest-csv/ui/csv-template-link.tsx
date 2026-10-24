import { ru } from '@/shared/i18n/ru';

import { templateFileName, templateHref } from '../model/template';

import type { IngestEntity } from '@/entities/ingest';

export function CsvTemplateLink({ entity }: { entity: IngestEntity }) {
  return (
    <a
      href={templateHref(entity)}
      download={templateFileName(entity)}
      className="text-[13px] font-medium text-accent underline hover:text-ink"
    >
      {ru.ingest.csv.template}
    </a>
  );
}
