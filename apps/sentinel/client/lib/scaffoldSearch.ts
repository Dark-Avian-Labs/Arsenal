import { APP_PATHS } from '../app/paths';

export interface SearchItem {
  id: string;
  title: string;
  path: string;
  hint: string;
}

export const SCAFFOLD_SEARCH_ITEMS: SearchItem[] = [
  { id: 'home', title: 'Fleet', path: APP_PATHS.home, hint: 'Monitored apps overview' },
  { id: 'sign-in', title: 'Sign in', path: APP_PATHS.signIn, hint: 'Account sign-in' },
  { id: 'sign-up', title: 'Sign up', path: APP_PATHS.signUp, hint: 'Create an account' },
];

export function searchScaffoldPages(query: string): SearchItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return SCAFFOLD_SEARCH_ITEMS.filter((item) => {
    return (
      item.title.toLowerCase().includes(needle) ||
      item.hint.toLowerCase().includes(needle) ||
      item.path.toLowerCase().includes(needle)
    );
  });
}
