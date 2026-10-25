import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { buildInfo } from '@/shared/config/build';
import { applyTheme, getStoredTheme } from '@/shared/lib/theme';

import { App } from './app';

import './styles/index.css';

document.documentElement.dataset.version = buildInfo.version;
applyTheme(getStoredTheme());

const root = document.getElementById('root');

if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
