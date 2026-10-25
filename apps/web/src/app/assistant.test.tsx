import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { assistantReply, assistantStream } from '@/test/assistant-stream';
import { server } from '@/test/setup';

import { analyst, problem, renderAt, signedInAs } from './test-utils';

const KEY = 'ck_a1b2c3d4_0123456789abcdefghijABCDEFGHIJ01';
const withAssistant = { ...analyst, assistantEnabled: true };
const quietApi = http.get('*/api/v1/*', () => problem(404, 'not_found'));

const openPanel = async () => {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'ассистент' }));
  return { user, panel: await screen.findByRole('dialog', { name: 'ассистент' }) };
};

const ask = async (user: ReturnType<typeof userEvent.setup>, question: string) => {
  await user.type(screen.getByRole('textbox', { name: 'вопрос ассистенту' }), question);
  await user.click(screen.getByRole('button', { name: 'отправить' }));
};

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('assistant panel', () => {
  it('has no header button when the assistant is not configured', async () => {
    server.use(...signedInAs({ ...analyst, assistantEnabled: false }), quietApi);
    renderAt('/model');

    expect(await screen.findByRole('button', { name: 'меню пользователя' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ассистент' })).not.toBeInTheDocument();
  });

  it('opens with ctrl+k, shows page suggestions and closes with escape', async () => {
    server.use(...signedInAs(withAssistant), quietApi);
    renderAt('/customers/7');
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'ассистент' });

    await user.keyboard('{Control>}k{/Control}');
    const panel = await screen.findByRole('dialog', { name: 'ассистент' });
    expect(within(panel).getByText('чем помочь?')).toBeInTheDocument();
    expect(
      within(panel).getByRole('button', { name: 'почему у клиента такой риск?' }),
    ).toBeInTheDocument();
    expect(within(panel).getByText(/ответы готовит внешний сервис/)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('streams the answer with step chips and links to customers', async () => {
    const { stream, handler } = assistantStream();
    server.use(...signedInAs(withAssistant), handler, quietApi);
    const router = renderAt('/customers/7');
    const { user, panel } = await openPanel();

    await user.click(within(panel).getByRole('button', { name: 'почему у клиента такой риск?' }));
    await waitFor(() => expect(stream.requests).toHaveLength(1));
    expect(stream.requests[0]).toEqual({
      messages: [{ role: 'user', content: 'почему у клиента такой риск?' }],
      page: { route: '/customers/7', customerId: 7 },
    });

    act(() => {
      stream.send('step', { id: 's1', tool: 'get_customers', status: 'started' });
    });
    expect(await within(panel).findByText('смотрю рейтинг клиентов')).toBeInTheDocument();
    act(() => {
      stream.send('step', { id: 's1', tool: 'get_customers', status: 'done', summary: '10 строк' });
      stream.send('text', { delta: 'выше всех — **#42**, ' });
    });
    expect(
      await within(panel).findByText('смотрю рейтинг клиентов · 10 строк'),
    ).toBeInTheDocument();
    expect(await within(panel).findByText(/выше всех/)).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'стоп' })).toBeInTheDocument();

    act(() => {
      stream.send('text', { delta: 'затем #7.' });
      stream.send('done', { steps: 1 });
      stream.close();
    });
    expect(await within(panel).findByRole('button', { name: 'отправить' })).toBeInTheDocument();
    expect(within(panel).queryByText('смотрю рейтинг клиентов · 10 строк')).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: '1 шаг' }));
    expect(within(panel).getByText('смотрю рейтинг клиентов · 10 строк')).toBeInTheDocument();

    const link = within(panel).getByRole('link', { name: 'клиент 42' });
    expect(link).toHaveAttribute('href', '/customers/42');
    expect(within(panel).getByRole('link', { name: 'клиент 7' })).toBeInTheDocument();
    await user.click(link);
    expect(router.state.location.pathname).toBe('/customers/42');
  });

  it('stops the answer on demand', async () => {
    const { stream, handler } = assistantStream();
    server.use(...signedInAs(withAssistant), handler, quietApi);
    renderAt('/');
    const { user, panel } = await openPanel();

    await ask(user, 'кто в самом высоком риске?');
    await waitFor(() => expect(stream.requests).toHaveLength(1));
    act(() => {
      stream.send('text', { delta: 'начинаю' });
    });
    expect(await within(panel).findByText('начинаю')).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'стоп' }));
    expect(await within(panel).findByText('ответ остановлен')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'отправить' })).toBeInTheDocument();
    expect(within(panel).getByText('начинаю')).toBeInTheDocument();
  });

  it('sends the mcp key and keeps it until forgotten', async () => {
    const reply = assistantReply([
      ['text', { delta: 'готово' }],
      ['done', { steps: 0 }],
    ]);
    server.use(...signedInAs(withAssistant), reply.handler, quietApi);
    renderAt('/');
    const { user, panel } = await openPanel();

    await user.click(within(panel).getByRole('button', { name: 'ключ mcp и настройки' }));
    expect(within(panel).getByText('без ключа ассистент работает с вашими правами')).toBeVisible();
    const field = within(panel).getByLabelText('ключ mcp');
    expect(field).toHaveAttribute('type', 'password');
    await user.type(field, KEY);
    await user.click(within(panel).getByRole('button', { name: 'показать ключ' }));
    expect(field).toHaveAttribute('type', 'text');
    expect(window.sessionStorage.getItem('assistant.mcpKey')).toBe(KEY);

    await ask(user, 'сводка');
    expect(await within(panel).findByText('готово')).toBeInTheDocument();
    expect(reply.requests[0]).toMatchObject({ mcpKey: KEY });

    await user.click(within(panel).getByRole('button', { name: 'забыть ключ' }));
    expect(field).toHaveValue('');
    expect(window.sessionStorage.getItem('assistant.mcpKey')).toBeNull();
  });

  it('highlights the key field when the key is rejected', async () => {
    window.sessionStorage.setItem('assistant.mcpKey', KEY);
    const reply = assistantReply([['error', { code: 'assistant_key_invalid' }]]);
    server.use(...signedInAs(withAssistant), reply.handler, quietApi);
    renderAt('/');
    const { user, panel } = await openPanel();

    await ask(user, 'сводка');
    const field = await within(panel).findByLabelText('ключ mcp');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(within(panel).getAllByText('ключ не принят').length).toBeGreaterThan(0);
  });

  it('explains rate limits and outages while the page keeps working', async () => {
    let status = 429;
    server.use(
      ...signedInAs(withAssistant),
      http.post('*/api/v1/assistant/messages', () =>
        status === 429 ? problem(429, 'rate_limited') : problem(503, 'assistant_disabled'),
      ),
      quietApi,
    );
    renderAt('/model');
    const { user, panel } = await openPanel();

    await ask(user, 'первый');
    expect(
      await within(panel).findByText('слишком много вопросов, подождите минуту'),
    ).toBeInTheDocument();

    status = 503;
    await ask(user, 'второй');
    expect(
      await within(panel).findByText('ассистент недоступен, попробуйте позже'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'модель' })).toBeInTheDocument();
  });

  it('asks to narrow a question that hits the step limit', async () => {
    const reply = assistantReply([['error', { code: 'assistant_step_limit' }]]);
    server.use(...signedInAs(withAssistant), reply.handler, quietApi);
    renderAt('/');
    const { user, panel } = await openPanel();

    await ask(user, 'всё обо всех');
    expect(await within(panel).findByText('вопрос слишком широкий, уточните его')).toBeVisible();
  });

  it('keeps the dialog in the tab session and starts a new one on demand', async () => {
    const reply = assistantReply([
      ['text', { delta: 'ответ' }],
      ['done', { steps: 0 }],
    ]);
    server.use(...signedInAs(withAssistant), reply.handler, quietApi);
    renderAt('/');
    const { user, panel } = await openPanel();

    await ask(user, 'первый вопрос');
    expect(await within(panel).findByText('ответ')).toBeInTheDocument();
    const stored = JSON.parse(window.sessionStorage.getItem('assistant.history') ?? '[]');
    expect(stored).toHaveLength(2);

    await ask(user, 'второй вопрос');
    await waitFor(() => expect(reply.requests).toHaveLength(2));
    expect(reply.requests[1]).toMatchObject({
      messages: [
        { role: 'user', content: 'первый вопрос' },
        { role: 'assistant', content: 'ответ' },
        { role: 'user', content: 'второй вопрос' },
      ],
    });

    await user.click(within(panel).getByRole('button', { name: 'новый диалог' }));
    expect(within(panel).getByText('чем помочь?')).toBeInTheDocument();
    expect(window.sessionStorage.getItem('assistant.history')).toBeNull();
  });
});
