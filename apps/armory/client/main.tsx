import './styles/input.css';

import { ThemeProvider } from '@dark-avian-labs/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';

import { router } from './app/router';
import { AtragraphModsProvider } from './context/AtragraphModsContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider appStorageKey="armory.theme.mode">
      <AtragraphModsProvider>
        <RouterProvider router={router} />
      </AtragraphModsProvider>
    </ThemeProvider>
  </StrictMode>,
);
