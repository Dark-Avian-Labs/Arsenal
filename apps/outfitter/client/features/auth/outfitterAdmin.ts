export function clerkUserIsOutfitterAdmin(publicMetadata: unknown): boolean {
  if (!publicMetadata || typeof publicMetadata !== 'object') return false;
  const apps = (publicMetadata as { apps?: unknown }).apps;
  if (!apps || typeof apps !== 'object') return false;
  for (const [key, value] of Object.entries(apps)) {
    if (key.toLowerCase() === 'outfitter' && value === 'admin') return true;
  }
  return false;
}
