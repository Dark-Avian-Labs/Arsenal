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

const HomePage = lazy(() =>
  import('../features/home/HomePage').then((mod) => ({
    default: mod.HomePage,
  })),
);
const AppDetailPage = lazy(() =>
  import('../features/fleet/AppDetailPage').then((mod) => ({
    default: mod.AppDetailPage,
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
      <Route element={<Layout />}>
        <Route
          path={APP_PATHS.home}
          element={
            <ProtectedRoute requireAdmin>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path={APP_PATHS.appDetail}
          element={
            <ProtectedRoute requireAdmin>
              <AppDetailPage />
            </ProtectedRoute>
          }
        />
        <Route path={`${APP_PATHS.signIn}/*`} element={<SignInPage />} />
        <Route path={`${APP_PATHS.signUp}/*`} element={<SignUpPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Route>,
  ),
);
