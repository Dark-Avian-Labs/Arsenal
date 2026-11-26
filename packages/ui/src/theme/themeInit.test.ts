import { describe, expect, it } from 'vitest';

import themeInitSource from '../../public/theme-init.js?raw';

function runThemeInit(opts: { cookie?: string; storage?: Record<string, string> } = {}) {
  const classes = new Set<string>(['ui-plate']);
  const style: Record<string, string> = {};
  const storage = opts.storage ?? {};
  const mockDocument = {
    cookie: opts.cookie ?? '',
    documentElement: {
      style,
      classList: {
        add: (c: string) => classes.add(c),
        remove: (c: string) => classes.delete(c),
      },
    },
  };
  const mockLocalStorage = {
    getItem: (key: string) => storage[key] ?? null,
  };
  // oxlint-disable-next-line no-new-func
  const run = new Function('document', 'localStorage', themeInitSource) as (
    doc: typeof mockDocument,
    ls: typeof mockLocalStorage,
  ) => void;
  run(mockDocument, mockLocalStorage);
  return { classes: [...classes], colorScheme: style.colorScheme };
}

describe('theme-init.js', () => {
  it('defaults to dark + ui-ink when nothing is stored', () => {
    const res = runThemeInit();
    expect(res.colorScheme).toBe('dark');
    expect(res.classes).toContain('dark');
    expect(res.classes).toContain('ui-ink');
    expect(res.classes).not.toContain('ui-plate');
  });

  it('normalizes legacy UI styles to ink and honors cookie precedence over localStorage', () => {
    for (const legacy of ['plate', 'folio', 'bronze', 'prism', 'shadow', 'clear']) {
      const res = runThemeInit({ cookie: `dal.ui.style=${legacy}; dal.theme.mode=light` });
      expect(res.colorScheme).toBe('light');
      expect(res.classes).not.toContain('dark');
      expect(res.classes).toContain('ui-ink');
    }

    const acrylic = runThemeInit({
      cookie: 'dal.ui.style=acrylic',
      storage: { 'dal.ui.style': 'ink', 'dal.theme.mode': 'light' },
    });
    expect(acrylic.colorScheme).toBe('light');
    expect(acrylic.classes).toContain('ui-acrylic');
  });
});
