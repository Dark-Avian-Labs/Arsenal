import type { AppPaths } from '../shell/appShell';

export interface SearchItem {
  id: string;
  title: string;
  path: string;
  hint: string;
}

const DEFAULT_PATHS: AppPaths = {
  home: '/',
  signIn: '/sign-in',
  signUp: '/sign-up',
};

export function searchScaffoldPages(query: string, paths: AppPaths = DEFAULT_PATHS): SearchItem[] {
  const items: SearchItem[] = [
    { id: 'home', title: 'Home', path: paths.home, hint: 'Scaffold landing page' },
    { id: 'sign-in', title: 'Sign in', path: paths.signIn, hint: 'Account sign-in' },
    { id: 'sign-up', title: 'Sign up', path: paths.signUp, hint: 'Create an account' },
  ];
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return items.filter((item) => {
    return (
      item.title.toLowerCase().includes(needle) ||
      item.hint.toLowerCase().includes(needle) ||
      item.path.toLowerCase().includes(needle)
    );
  });
}
