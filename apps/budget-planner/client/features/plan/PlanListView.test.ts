import { describe, expect, it } from 'vitest';

import { reorderFromBoard } from './PlanListView';

const before = {
  categories: ['cat:a', 'cat:b'],
  'entries:a': ['entry:1', 'entry:2'],
  'entries:b': ['entry:3'],
};

describe('reorderFromBoard', () => {
  it('writes category sort order when categories move', () => {
    expect(reorderFromBoard(before, { ...before, categories: ['cat:b', 'cat:a'] }, ['a', 'b'])).toEqual({
      categories: [
        { id: 'b', sort_order: 0 },
        { id: 'a', sort_order: 1 },
      ],
    });
  });

  it('rewrites both entry lists when an entry changes category', () => {
    expect(
      reorderFromBoard(
        before,
        {
          ...before,
          'entries:a': ['entry:2'],
          'entries:b': ['entry:1', 'entry:3'],
        },
        ['a', 'b'],
      ),
    ).toEqual({
      entries: [
        { id: '2', sort_order: 0, category_id: 'a' },
        { id: '1', sort_order: 0, category_id: 'b' },
        { id: '3', sort_order: 1, category_id: 'b' },
      ],
    });
  });

  it('returns null when nothing moved', () => {
    expect(reorderFromBoard(before, before, ['a', 'b'])).toBeNull();
  });
});
