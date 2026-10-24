import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { buildInfo } from '@/shared/config/build';
import { ru } from '@/shared/i18n/ru';

import './styles/index.css';

document.documentElement.dataset.version = buildInfo.version;

const root = document.getElementById('root');

if (root) {
  createRoot(root).render(
    <StrictMode>
      <h1>{ru.app.title}</h1>
    </StrictMode>,
  );
}
