import { Tabs as TabsPrimitive } from 'radix-ui';

import type { ReactNode } from 'react';

interface TabsProps {
  items: { id: string; label: string }[];
  value: string;
  onValueChange: (id: string) => void;
  label: string;
  children?: ReactNode;
}

export function Tabs({ items, value, onValueChange, label, children }: TabsProps) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange}>
      <TabsPrimitive.List aria-label={label} className="inline-flex gap-1 border-b border-line">
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.id}
            value={item.id}
            className="-mb-px h-control-md cursor-pointer rounded-t-sm border-b-2 border-transparent px-3 text-body-strong text-ink-muted transition-colors duration-120 ease-out hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink"
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}

export const TabsPanel = TabsPrimitive.Content;
