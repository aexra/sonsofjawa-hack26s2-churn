import { useState } from 'react';

import { fieldKeys, type IngestEntity } from '@/entities/ingest';
import { SnapshotReplace } from '@/features/ingest-snapshot';
import { RecalcTrigger } from '@/features/recalc-trigger';
import { ru } from '@/shared/i18n/ru';
import { Tabs, TabsPanel } from '@/shared/ui/tabs';
import { IngestLog } from '@/widgets/ingest-log';
import { IngestTableEditor } from '@/widgets/ingest-table-editor';
import { IngestUploader } from '@/widgets/ingest-uploader';

type TabId = 'csv' | 'table' | 'snapshot';

const TABS: { id: TabId; label: string }[] = [
  { id: 'csv', label: ru.ingest.tabs.csv },
  { id: 'table', label: ru.ingest.tabs.table },
  { id: 'snapshot', label: ru.ingest.tabs.snapshot },
];

const isTab = (value: string): value is TabId => TABS.some((tab) => tab.id === value);

export function DataPage() {
  const [tab, setTab] = useState<TabId>('csv');
  const [entity, setEntity] = useState<IngestEntity>('accounts');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <section
          aria-label={ru.ingest.cardLabel}
          className="flex min-w-0 flex-[999_1_560px] flex-col gap-4 rounded-md border border-line bg-surface p-4"
        >
          <Tabs
            label={ru.ingest.tabsLabel}
            items={TABS}
            value={tab}
            onValueChange={(value) => {
              if (isTab(value)) setTab(value);
            }}
          >
            <TabsPanel value="csv" forceMount className="pt-4 data-[state=inactive]:hidden">
              <IngestUploader entity={entity} onEntityChange={setEntity} />
            </TabsPanel>
            <TabsPanel value="table" forceMount className="pt-4 data-[state=inactive]:hidden">
              <IngestTableEditor entity={entity} onEntityChange={setEntity} />
            </TabsPanel>
            <TabsPanel value="snapshot" forceMount className="pt-4 data-[state=inactive]:hidden">
              <SnapshotReplace />
            </TabsPanel>
          </Tabs>
        </section>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <RecalcTrigger />
          {tab === 'table' && (
            <section
              aria-labelledby="fields-heading"
              className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4"
            >
              <h2 id="fields-heading" className="m-0 font-display text-heading">
                {ru.ingest.fieldsTitle[entity]}
              </h2>
              <p className="m-0 font-mono text-caption text-ink-muted">
                {fieldKeys(entity).join(', ')}
              </p>
              <p className="m-0 text-caption text-ink-muted">{ru.ingest.fieldsHint}</p>
            </section>
          )}
        </div>
      </div>
      <section aria-labelledby="log-heading" className="flex flex-col gap-3">
        <h2 id="log-heading" className="m-0 font-display text-heading">
          {ru.ingest.log.title}
        </h2>
        <IngestLog />
      </section>
    </div>
  );
}
