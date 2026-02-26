import { Link } from 'react-router-dom';

const AUTH_ADMIN_URL_RAW = import.meta.env.VITE_AUTH_ADMIN_URL as
  | string
  | undefined;
const AUTH_ADMIN_URL =
  typeof AUTH_ADMIN_URL_RAW === 'string' && AUTH_ADMIN_URL_RAW.trim().length > 0
    ? AUTH_ADMIN_URL_RAW.trim()
    : 'http://localhost:3010/admin';

export function AdminPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
        <div className="flex gap-2">
          <Link to="/" className="btn btn-secondary">
            Back to App
          </Link>
          <a
            href={AUTH_ADMIN_URL}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
          >
            User Management
          </a>
        </div>
      </div>

      <div className="glass-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Scaffold Admin Area
        </h2>
        <p className="mt-2 text-sm text-muted">
          AppBase keeps only shell-level admin navigation. Use Auth Admin for
          user and permission management, and add app-specific admin tools here
          as your new project evolves.
        </p>
      </div>
    </div>
  );
}
