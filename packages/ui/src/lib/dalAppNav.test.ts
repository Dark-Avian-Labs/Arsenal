import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  appIdsMatch,
  isSentinelAdmin,
  loadDalAppNav,
  parseDalAppNavDocument,
  visibleDalAppNavApps,
} from './dalAppNav.js';

describe('loadDalAppNav cache', () => {
  const doc = { version: 1, updatedAt: 'x', apps: [] };

  function stubStorage(fetchedAt: number) {
    const store = new Map([['dal.app-nav.cache.v2', JSON.stringify({ fetchedAt, document: doc })]]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
  }

  afterEach(() => vi.unstubAllGlobals());

  it('skips the network while fresh and refreshes in the background when stale', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ...doc, updatedAt: 'y' }));
    vi.stubGlobal('fetch', fetchMock);

    stubStorage(Date.now() - 60_000);
    expect(await loadDalAppNav()).toEqual(doc);
    expect(fetchMock).not.toHaveBeenCalled();

    stubStorage(Date.now() - 25 * 60 * 60 * 1000);
    expect(await loadDalAppNav()).toEqual(doc);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('parseDalAppNavDocument', () => {
  it('accepts a valid catalog', () => {
    const parsed = parseDalAppNavDocument({
      version: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
      apps: [
        {
          id: 'codex',
          name: 'Codex',
          icon: 'menu_book',
          href: 'https://codex.darkavianlabs.com',
        },
      ],
    });

    expect(parsed).toEqual({
      version: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
      apps: [
        {
          id: 'codex',
          name: 'Codex',
          icon: 'menu_book',
          href: 'https://codex.darkavianlabs.com',
        },
      ],
    });
  });

  it('rejects missing version, bad href, or non-array apps', () => {
    expect(parseDalAppNavDocument({ version: 2, updatedAt: 'x', apps: [] })).toBeNull();
    expect(
      parseDalAppNavDocument({
        version: 1,
        updatedAt: 'x',
        apps: [{ id: 'a', name: 'A', icon: 'home', href: 'javascript:alert(1)' }],
      }),
    ).toBeNull();
    expect(parseDalAppNavDocument({ version: 1, updatedAt: 'x', apps: 'nope' })).toBeNull();
  });
});

describe('appIdsMatch', () => {
  it('ignores hyphens and case', () => {
    expect(appIdsMatch('budget-planner', 'budgetplanner')).toBe(true);
    expect(appIdsMatch('Codex', 'codex')).toBe(true);
    expect(appIdsMatch('armory', 'codex')).toBe(false);
  });
});

describe('visibleDalAppNavApps', () => {
  const apps = [
    {
      id: 'codex',
      name: 'Codex',
      icon: 'menu_book',
      href: 'https://codex.darkavianlabs.com',
    },
    {
      id: 'Sentinel',
      name: 'Sentinel',
      icon: 'monitor_heart',
      href: 'https://sentinel.darkavianlabs.com',
    },
  ];

  it('drops Sentinel unless the account is a Sentinel admin', () => {
    expect(isSentinelAdmin({ apps: { Sentinel: 'admin' } })).toBe(true);
    expect(isSentinelAdmin({ apps: { codex: 'admin' } })).toBe(false);
    expect(isSentinelAdmin(undefined)).toBe(false);
    expect(visibleDalAppNavApps(apps, false).map((app) => app.id)).toEqual(['codex']);
    expect(visibleDalAppNavApps(apps, true)).toHaveLength(2);
  });
});
