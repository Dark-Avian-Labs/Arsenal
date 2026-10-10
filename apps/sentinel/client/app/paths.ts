export const APP_PATHS = {
  home: '/',
  appDetail: '/apps/:appId',
  legal: '/legal',
  signIn: '/sign-in',
  signUp: '/sign-up',
} as const;

export function appDetailPath(appId: string): string {
  return `/apps/${encodeURIComponent(appId)}`;
}
