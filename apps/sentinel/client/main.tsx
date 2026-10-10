import './styles/app.css';
import '@dark-avian-labs/ui/clerk-auth.css';

import { ThemeProvider } from '@dark-avian-labs/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';

import { router } from './app/routes';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root is missing');
}

createRoot(root).render(
  <StrictMode>
    <ThemeProvider appStorageKey="sentinel.theme.mode">
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
);
