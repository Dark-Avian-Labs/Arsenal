import { APP_DISPLAY_NAME } from '../../app/config';
import { GlassCard } from '../../components/ui/GlassCard';

export function HomePage() {
  return (
    <div className="mx-auto max-w-5xl">
      <GlassCard className="p-8">
        <p className="text-xs uppercase tracking-[0.25em] text-muted">
          {APP_DISPLAY_NAME}
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">
          Scaffold Ready
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          This starter keeps shared auth, session security, theming, and the
          shell layout in place. Add your feature routes and domain UI in this
          content area.
        </p>
      </GlassCard>
    </div>
  );
}
