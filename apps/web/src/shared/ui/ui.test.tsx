import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AlertDialog } from './alert-dialog';
import { Button } from './button';
import { DataTable, type SortState } from './data-table';
import { Dialog } from './dialog';
import { EmptyState } from './empty-state';
import { Field } from './field';
import { FilterChip } from './filter-chip';
import { Input } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Select } from './select';
import { Skeleton } from './skeleton';
import { Switch } from './switch';
import { Tabs, TabsPanel } from './tabs';
import { Tooltip, TooltipProvider } from './tooltip';

interface Row {
  id: string;
  email: string;
}

const rows: Row[] = [
  { id: '1', email: 'user-0001@example.test' },
  { id: '2', email: 'user-0002@example.test' },
];

function SortableTable({ onSort }: { onSort: (key: string, dir: string | null) => void }) {
  const [sort, setSort] = useState<SortState>(null);
  return (
    <DataTable
      caption="клиенты"
      rows={rows}
      rowKey={(row) => row.id}
      sort={sort}
      onSort={(key, dir) => {
        onSort(key, dir);
        setSort(dir ? { key, dir } : null);
      }}
      onRowClick={() => undefined}
      isChanged={(row) => row.id === '2'}
      columns={[
        { key: 'email', label: 'email', sortable: true, mono: true, render: (row) => row.email },
        { key: 'id', label: 'ID', align: 'right', render: (row) => row.id },
      ]}
    />
  );
}

describe('Button', () => {
  it('blocks clicks and announces busy state while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        сохранение…
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'сохранение…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Field and Input', () => {
  it('links the label to the control and marks it invalid', () => {
    render(
      <Field label="логин" id="login" error="укажите логин">
        <Input id="login" invalid />
      </Field>,
    );
    expect(screen.getByLabelText('логин')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('укажите логин')).toBeInTheDocument();
  });
});

describe('DataTable', () => {
  it('cycles sort direction ascending, descending, none', async () => {
    const onSort = vi.fn();
    render(<SortableTable onSort={onSort} />);
    const header = screen.getByRole('columnheader', { name: 'email' });
    expect(header).toHaveAttribute('aria-sort', 'none');

    await userEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'descending');
    await userEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'none');

    expect(onSort.mock.calls).toEqual([
      ['email', 'asc'],
      ['email', 'desc'],
      ['email', null],
    ]);
  });

  it('renders rows and the caption', () => {
    render(<SortableTable onSort={() => undefined} />);
    expect(screen.getByRole('table', { name: 'клиенты' })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });
});

describe('Dialog', () => {
  it('shows the title and calls the action', async () => {
    const onAction = vi.fn();
    render(
      <Dialog
        open
        onOpenChange={() => undefined}
        title="выпустить ключ?"
        actions={<Button onClick={onAction}>выпустить</Button>}
      >
        ключ будет показан один раз
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'выпустить ключ?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'выпустить' }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});

describe('AlertDialog', () => {
  it('confirms a destructive action', async () => {
    const onConfirm = vi.fn();
    render(
      <AlertDialog
        open
        onOpenChange={() => undefined}
        title="заменить все данные?"
        confirmLabel="заменить"
        cancelLabel="отмена"
        onConfirm={onConfirm}
      >
        прежние данные будут удалены
      </AlertDialog>,
    );
    expect(screen.getByRole('alertdialog', { name: 'заменить все данные?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'заменить' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe('Tabs, FilterChip, Switch', () => {
  it('switches tabs', async () => {
    function Example() {
      const [value, setValue] = useState('csv');
      return (
        <Tabs
          label="способ загрузки"
          items={[
            { id: 'csv', label: 'файлы csv' },
            { id: 'table', label: 'таблица' },
          ]}
          value={value}
          onValueChange={setValue}
        >
          <TabsPanel value="csv">панель csv</TabsPanel>
          <TabsPanel value="table">панель таблицы</TabsPanel>
        </Tabs>
      );
    }
    render(<Example />);
    expect(screen.getByText('панель csv')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'таблица' }));
    expect(screen.getByText('панель таблицы')).toBeInTheDocument();
  });

  it('toggles a filter chip and shows its count', async () => {
    const onChange = vi.fn();
    render(
      <FilterChip count={3} onPressedChange={onChange}>
        высокий
      </FilterChip>,
    );
    const chip = screen.getByRole('button', { name: /высокий/ });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('toggles a switch', async () => {
    const onChange = vi.fn();
    render(<Switch label="только с аномалиями" onCheckedChange={onChange} />);
    await userEvent.click(screen.getByRole('switch', { name: 'только с аномалиями' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Select', () => {
  it('shows the selected option label', () => {
    render(
      <Select
        aria-label="сущность"
        defaultValue="services"
        options={[
          { value: 'accounts', label: 'клиенты' },
          { value: 'services', label: 'услуги' },
        ]}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'сущность' })).toHaveTextContent('услуги');
  });
});

describe('Tooltip and Popover', () => {
  it('shows tooltip content on focus', async () => {
    render(
      <TooltipProvider>
        <Tooltip content="нельзя отключить последнего администратора">
          <button type="button">отключить</button>
        </Tooltip>
      </TooltipProvider>,
    );
    await userEvent.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'нельзя отключить последнего администратора',
    );
  });

  it('opens a popover', async () => {
    render(
      <Popover>
        <PopoverTrigger>колонки</PopoverTrigger>
        <PopoverContent>выбор колонок</PopoverContent>
      </Popover>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'колонки' }));
    expect(screen.getByText('выбор колонок')).toBeInTheDocument();
  });
});

describe('EmptyState and Skeleton', () => {
  it('announces errors as alerts', () => {
    render(<EmptyState kind="error" title="не удалось загрузить данные" text="повторите" />);
    expect(screen.getByRole('alert')).toHaveTextContent('не удалось загрузить данные');
  });

  it('hides skeletons from assistive technology', () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
