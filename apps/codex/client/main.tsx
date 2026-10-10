import './styles/input.css';

import { ThemeProvider } from '@dark-avian-labs/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';

import { router } from './app/routes';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element "#root" was not found in the document.');
}

createRoot(rootEl).render(
  <StrictMode>
    <ThemeProvider appStorageKey="codex.theme.mode">
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
);
