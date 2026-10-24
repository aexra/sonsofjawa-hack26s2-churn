import {
  INGEST_ENTITIES,
  fieldKeys,
  requiredFieldKeys,
  type IngestEntity,
} from '@/entities/ingest';
import { CsvTemplateLink, CsvUploader } from '@/features/ingest-csv';
import { ru } from '@/shared/i18n/ru';
import { Badge } from '@/shared/ui/badge';
import { FilterChip } from '@/shared/ui/filter-chip';

interface IngestUploaderProps {
  entity: IngestEntity;
  onEntityChange: (entity: IngestEntity) => void;
}

export function IngestUploader({ entity, onEntityChange }: IngestUploaderProps) {
  const required = requiredFieldKeys(entity);
  const optional = fieldKeys(entity).filter((key) => !required.includes(key));
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-label text-ink-muted">{ru.ingest.entityGroup}</span>
          <div
            role="group"
            aria-label={ru.ingest.entityGroup}
            className="flex flex-wrap gap-1 self-start rounded-sm border border-line bg-surface-sunken p-0.5"
          >
            {INGEST_ENTITIES.map((item) => (
              <FilterChip
                key={item}
                segmented
                pressed={item === entity}
                onPressedChange={(pressed) => {
                  if (pressed) onEntityChange(item);
                }}
              >
                {ru.ingest.entities[item]}
              </FilterChip>
            ))}
          </div>
        </div>
        <CsvUploader key={entity} entity={entity} />
      </div>
      <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-2.5 rounded-md bg-surface-sunken p-4">
        <h2 className="m-0 font-display text-heading">{ru.ingest.csv.requiredTitle}</h2>
        <p className="m-0 flex flex-wrap gap-1.5">
          {required.map((key) => (
            <Badge key={key} mono>
              {key}
            </Badge>
          ))}
        </p>
        {optional.length > 0 && (
          <p className="m-0 text-caption text-ink-muted">
            {ru.ingest.csv.optionalColumns(optional.join(', '))}
          </p>
        )}
        <p className="m-0 text-caption text-ink-muted">{ru.ingest.csv.format}</p>
        <CsvTemplateLink entity={entity} />
      </aside>
    </div>
  );
}
