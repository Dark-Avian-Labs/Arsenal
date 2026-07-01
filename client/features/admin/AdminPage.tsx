import { Link } from 'react-router-dom';

import { APP_DISPLAY_NAME, AUTH_ADMIN_URL } from '../../app/config';
import { APP_PATHS } from '../../app/paths';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';

export function AdminPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-foreground text-2xl font-bold">Admin Panel</h1>
        <div className="flex gap-2">
          <Link to={APP_PATHS.home} className="btn btn-secondary">
            Back to App
          </Link>
          <Button href={AUTH_ADMIN_URL} target="_blank" rel="noreferrer" variant="secondary">
            User Management
          </Button>
        </div>
      </div>

      <GlassCard className="p-6">
        <h2 className="text-foreground text-lg font-semibold">Scaffold Admin Area</h2>
        <p className="text-muted mt-2 text-sm">
          {APP_DISPLAY_NAME} keeps only shell-level admin navigation. Use Auth Admin for user and
          permission management, and add app-specific admin tools here as your new project evolves.
        </p>
      </GlassCard>
    </div>
  );
}
