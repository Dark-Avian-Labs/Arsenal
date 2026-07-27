import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';

import { Layout } from '../components/Layout/Layout';
import { APP_PATHS } from './paths';

const HomePage = lazy(() =>
  import('../features/home/HomePage').then((mod) => ({
    default: mod.HomePage,
  })),
);
const LegalPage = lazy(() =>
  import('../features/legal/LegalPage').then((mod) => ({
    default: mod.LegalPage,
  })),
);

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted text-sm">Loading...</p>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path={APP_PATHS.home} element={<HomePage />} />
          <Route path={APP_PATHS.legal} element={<LegalPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
