import { matchPath } from 'react-router';

import { ru } from '@/shared/i18n/ru';

import type { AssistantPage } from './types';

const ROUTE_LIMIT = 200;

export const pageContext = (pathname: string): AssistantPage => {
  const route = pathname.slice(0, ROUTE_LIMIT);
  const id = matchPath('/customers/:id', pathname)?.params.id;
  const customerId = id && /^\d{1,15}$/.test(id) ? Number(id) : undefined;
  return customerId === undefined ? { route } : { route, customerId };
};

export const suggestionsFor = (page: AssistantPage): readonly string[] => {
  if (page.customerId !== undefined) return ru.assistant.suggestions.customer;
  if (page.route === '/') return ru.assistant.suggestions.overview;
  if (page.route === '/customers') return ru.assistant.suggestions.customers;
  return ru.assistant.suggestions.other;
};
