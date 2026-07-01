import { APP_DISPLAY_NAME } from '../../app/config';
import { GlassCard } from '../../components/ui/GlassCard';

export function HomePage() {
  return (
    <div className="mx-auto max-w-5xl">
      <GlassCard className="p-8">
        <p className="text-muted text-xs tracking-[0.25em] uppercase">{APP_DISPLAY_NAME}</p>
        <h1 className="text-foreground mt-2 text-3xl font-semibold">Scaffold Ready</h1>
        <p className="text-muted mt-3 max-w-2xl text-sm leading-relaxed">
          This starter keeps shared auth, session security, theming, and the shell layout in place.
          Add your feature routes and domain UI in this content area.
        </p>
      </GlassCard>
    </div>
  );
}
