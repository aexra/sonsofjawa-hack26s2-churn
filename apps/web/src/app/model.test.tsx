import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { FakeEventSource } from '@/test/fake-event-source';
import { modelSettings, previewListing, revisions } from '@/test/model-fixtures';
import { server } from '@/test/setup';

import { admin, analyst, problem, renderAt, signedInAs } from './test-utils';

const flat = (text: string | null) => (text ?? '').replace(/\s/gu, ' ');

const modelHandlers = (
  options: { prolongWait?: number; version?: number } = {},
  patches: unknown[] = [],
) => [
  http.get('*/api/v1/model/settings', () => HttpResponse.json(modelSettings(options))),
  http.get('*/api/v1/model/revisions', () => HttpResponse.json(revisions)),
  http.patch('*/api/v1/model/settings', async ({ request }) => {
    patches.push(await request.json());
    return HttpResponse.json({
      ...modelSettings({ prolongWait: 40, version: 3 }),
      recalc: { state: 'scheduled' },
    });
  }),
];

const weightInput = () => screen.findByRole('spinbutton', { name: /услуги в ожидании оплаты/u });
const bar = () => screen.getByRole('status', { name: 'изменения модели' });

const setValue = async (input: HTMLElement, value: string) => {
  await userEvent.clear(input);
  await userEvent.type(input, value);
};

describe('model page', () => {
  it('builds the form from the api and shows the revision history', async () => {
    server.use(...signedInAs(admin), ...modelHandlers(), previewListing());
    renderAt('/model');

    expect(await weightInput()).toHaveValue(30);
    expect(screen.getByText('по умолчанию 30', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/версия модели 2/u)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /порог высокого риска/u })).toHaveValue(50);
    expect(screen.getByLabelText(/горизонт прогноза, дн\./u)).toHaveValue(30);
    expect(screen.getByLabelText(/максимальный возраст оценки, ч/u)).toHaveValue(6);

    const history = await screen.findByRole('table', { name: 'ревизии модели' });
    expect(
      within(history).getByText('вес «услуги в ожидании оплаты»: 30 → 40'),
    ).toBeInTheDocument();
    expect(within(history).getByText('формула обновлена')).toBeInTheDocument();
    expect(bar()).toHaveTextContent('изменений нет');
  });

  it('previews the reference losses before saving', async () => {
    server.use(...signedInAs(admin), ...modelHandlers(), previewListing());
    renderAt('/model');

    await setValue(await weightInput(), '40');

    await waitFor(() => {
      expect(flat(bar().textContent)).toContain('потери 6 819,05 € → 6 626,52 €');
    });
    expect(flat(bar().textContent)).toContain(
      'не сохранено: вес «услуги в ожидании оплаты» 30 → 40',
    );
    expect(flat(bar().textContent)).not.toContain('уровень сменится');
    const table = await screen.findByRole('table', { name: 'клиенты, у которых изменится оценка' });
    expect(within(table).getAllByRole('row')).toHaveLength(7);
    expect(flat(screen.getByText('ожидаемые потери').parentElement?.textContent ?? '')).toContain(
      '6 819,05 € → 6 626,52 €',
    );
  });

  it('sends only the changed key and reports the new version', async () => {
    const patches: unknown[] = [];
    server.use(...signedInAs(admin), ...modelHandlers({}, patches), previewListing());
    renderAt('/model');

    await setValue(await weightInput(), '40');
    await userEvent.click(screen.getByRole('button', { name: 'сохранить' }));

    expect(
      await screen.findByText('сохранено, версия модели 3 — идёт пересчёт'),
    ).toBeInTheDocument();
    expect(patches).toEqual([{ values: { weight_prolong_wait: 40 } }]);
    await waitFor(() => {
      expect(bar().textContent).toContain('изменений нет');
    });
    expect(await weightInput()).toHaveValue(40);
  });

  it('sends the clock together with the values', async () => {
    const patches: unknown[] = [];
    server.use(...signedInAs(admin), ...modelHandlers({}, patches), previewListing());
    renderAt('/model');

    await weightInput();
    await userEvent.click(screen.getByRole('radio', { name: 'смещённое время' }));
    expect(bar().textContent).toContain('изменён момент расчёта');
    await userEvent.click(screen.getByRole('button', { name: 'сохранить' }));

    await waitFor(() => {
      expect(patches).toHaveLength(1);
    });
    expect(patches[0]).toEqual({
      clock: { mode: 'shifted', asOf: new Date('2026-10-19T15:00:00Z').toISOString() },
    });
  });

  it('rejects thresholds in the wrong order', async () => {
    server.use(...signedInAs(admin), ...modelHandlers(), previewListing());
    renderAt('/model');

    await weightInput();
    await setValue(screen.getByRole('spinbutton', { name: /порог среднего риска/u }), '60');

    expect(
      await screen.findByText('порог среднего риска должен быть ниже порога высокого'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'сохранить' })).toBeDisabled();
  });

  it('rejects a value outside the api range', async () => {
    server.use(...signedInAs(admin), ...modelHandlers(), previewListing());
    renderAt('/model');

    await setValue(await weightInput(), '500');

    expect(await screen.findByText('значение от 0 до 100')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'сохранить' })).toBeDisabled();
  });

  it('shows server field errors from a 422', async () => {
    server.use(
      ...signedInAs(admin),
      http.patch('*/api/v1/model/settings', () =>
        problem(422, 'validation_failed', {
          errors: [{ field: 'values.weight_prolong_wait', code: 'out_of_range', message: 'range' }],
        }),
      ),
      ...modelHandlers(),
      previewListing(),
    );
    renderAt('/model');

    await setValue(await weightInput(), '40');
    await userEvent.click(screen.getByRole('button', { name: 'сохранить' }));

    expect(await screen.findByText('значение вне допустимого диапазона')).toBeInTheDocument();
  });

  it('resets values to the defaults and reverts the draft', async () => {
    server.use(...signedInAs(admin), ...modelHandlers({ prolongWait: 40 }), previewListing());
    renderAt('/model');

    expect(await weightInput()).toHaveValue(40);
    await userEvent.click(
      screen.getByRole('button', { name: 'сбросить к значениям по умолчанию' }),
    );
    expect(await weightInput()).toHaveValue(30);
    expect(flat(bar().textContent)).toContain(
      'не сохранено: вес «услуги в ожидании оплаты» 40 → 30',
    );

    await userEvent.click(screen.getByRole('button', { name: 'отменить изменения' }));
    expect(await weightInput()).toHaveValue(40);
    expect(bar().textContent).toContain('изменений нет');
  });

  it('shows a read-only form to an analyst without the preview', async () => {
    server.use(...signedInAs(analyst), ...modelHandlers());
    renderAt('/model');

    const input = await weightInput();
    expect(input).toBeDisabled();
    expect(screen.getByText('изменять модель может администратор')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'сохранить' })).not.toBeInTheDocument();
    expect(screen.queryByText('что изменится после сохранения')).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /порог высокого риска/u })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'реальное время' })).toBeDisabled();
  });

  it('skips the preview for a large customer base', async () => {
    server.use(...signedInAs(admin), ...modelHandlers(), previewListing([], 5001));
    renderAt('/model');

    await setValue(await weightInput(), '40');

    expect(
      await screen.findByText('оценённых клиентов больше 5 000: оценка появится после пересчёта'),
    ).toBeInTheDocument();
    expect(bar().textContent).toContain('оценка появится после пересчёта');
  });

  it('asks before leaving with unsaved changes', async () => {
    server.use(
      ...signedInAs(admin),
      ...modelHandlers(),
      previewListing(),
      http.get('*/api/v1/analytics/*', () => HttpResponse.json({})),
    );
    const router = renderAt('/model');

    await setValue(await weightInput(), '40');
    await userEvent.click(screen.getByRole('link', { name: 'клиенты' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('уйти без сохранения?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'остаться' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(router.state.location.pathname).toBe('/model');
    expect(await weightInput()).toHaveValue(40);

    await userEvent.click(screen.getByRole('link', { name: 'клиенты' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'уйти' }),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/customers');
    });
  });

  it('refreshes an untouched form when another user changes the model', async () => {
    let current = modelSettings();
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/model/settings', () => HttpResponse.json(current)),
      http.get('*/api/v1/model/revisions', () => HttpResponse.json(revisions)),
      previewListing(),
    );
    renderAt('/model');
    expect(await weightInput()).toHaveValue(30);

    current = modelSettings({ prolongWait: 45, version: 3 });
    act(() => {
      FakeEventSource.current.emit('model.updated', { modelVersion: 3 });
    });

    await waitFor(() => {
      expect(screen.getByRole('spinbutton', { name: /услуги в ожидании оплаты/u })).toHaveValue(45);
    });
    expect(screen.queryByText('модель изменена другим пользователем')).not.toBeInTheDocument();
  });

  it('warns about a concurrent change when the form is touched', async () => {
    let current = modelSettings();
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/model/settings', () => HttpResponse.json(current)),
      http.get('*/api/v1/model/revisions', () => HttpResponse.json(revisions)),
      previewListing(),
    );
    renderAt('/model');
    await setValue(await weightInput(), '35');

    current = modelSettings({ prolongWait: 45, version: 3 });
    act(() => {
      FakeEventSource.current.emit('model.updated', { modelVersion: 3 });
    });

    expect(await screen.findByText('модель изменена другим пользователем')).toBeInTheDocument();
    expect(await weightInput()).toHaveValue(35);

    await userEvent.click(screen.getByRole('button', { name: 'обновить' }));
    await waitFor(() => {
      expect(screen.getByRole('spinbutton', { name: /услуги в ожидании оплаты/u })).toHaveValue(45);
    });
    expect(screen.queryByText('модель изменена другим пользователем')).not.toBeInTheDocument();
  });
});
