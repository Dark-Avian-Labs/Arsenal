import { describe, expect, it } from 'vitest';

import { searchScaffoldPages } from './scaffoldSearch';

describe('searchScaffoldPages', () => {
  it('returns nothing for an empty query', () => {
    expect(searchScaffoldPages('   ')).toEqual([]);
  });

  it('matches title, hint, and path', () => {
    expect(searchScaffoldPages('legal').map((item) => item.id)).toEqual(['legal']);
    expect(searchScaffoldPages('privacy').map((item) => item.id)).toEqual(['legal']);
    expect(searchScaffoldPages('/sign-in').map((item) => item.id)).toEqual(['sign-in']);
  });
});
