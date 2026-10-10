import {
  ErrorBoundary,
  Layout,
  NotFoundPage,
  ProtectedRoute,
  SignInPage,
  SignUpPage,
} from '@dark-avian-labs/ui';
import { lazy } from 'react';
import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router';

import { App } from '../App';
import { APP_PATHS } from './paths';

const OutfitterPage = lazy(() =>
  import('../features/outfitter/OutfitterPage').then((mod) => ({
    default: mod.OutfitterPage,
  })),
);
const AdminPage = lazy(() =>
  import('../features/admin/AdminPage').then((mod) => ({
    default: mod.AdminPage,
  })),
);

export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route
      element={
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      }
    >
      <Route element={<Layout showSearch={false} adminPath={APP_PATHS.admin} />}>
        <Route
          path={APP_PATHS.home}
          element={
            <ProtectedRoute>
              <OutfitterPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_PATHS.admin}
          element={
            <ProtectedRoute requireAdmin>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={`${APP_PATHS.signIn}/*`}
          element={<SignInPage subtitle="Use your Dark Avian Labs account." />}
        />
        <Route path={`${APP_PATHS.signUp}/*`} element={<SignUpPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Route>,
  ),
);
