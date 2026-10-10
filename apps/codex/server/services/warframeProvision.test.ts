import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_CLERK_ID = 'user_test123';

const mocks = vi.hoisted(() => ({
  getWorksheets: vi.fn<typeof import('../games/warframe/index.ts').warframeQueries.getWorksheets>(),
  provisionUserFromCatalogMaster: vi.fn<(db: Database.Database, clerkUserId: string) => boolean>(),
  ensureWarframeWorksheetsForUser: vi.fn(),
}));

vi.mock('../games/warframe/index.ts', () => ({
  warframeQueries: { getWorksheets: mocks.getWorksheets },
}));

vi.mock('./warframeSync.ts', () => ({
  provisionUserFromCatalogMaster: mocks.provisionUserFromCatalogMaster,
  ensureWarframeWorksheetsForUser: mocks.ensureWarframeWorksheetsForUser,
}));

vi.mock('../logger.ts', () => ({
  log: vi.fn(),
}));

import { provisionWarframeUserIfNeeded } from './warframeProvision.ts';

const codexDb = {
  transaction(fn: (...args: unknown[]) => unknown) {
    const runner = (...args: unknown[]) => fn(...args);
    runner.immediate = (...args: unknown[]) => fn(...args);
    runner.deferred = (...args: unknown[]) => fn(...args);
    runner.exclusive = (...args: unknown[]) => fn(...args);
    return runner;
  },
} as unknown as Database.Database;

describe('provisionWarframeUserIfNeeded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when the user already has worksheets', () => {
    mocks.getWorksheets.mockReturnValue([{ id: 1, name: 'Warframes', display_order: 0 }]);
    provisionWarframeUserIfNeeded(codexDb, TEST_CLERK_ID);
    expect(mocks.provisionUserFromCatalogMaster).not.toHaveBeenCalled();
    expect(mocks.ensureWarframeWorksheetsForUser).not.toHaveBeenCalled();
  });

  it('provisions from the Codex master catalog when available', () => {
    mocks.getWorksheets.mockReturnValue([]);
    mocks.provisionUserFromCatalogMaster.mockReturnValue(true);
    provisionWarframeUserIfNeeded(codexDb, TEST_CLERK_ID);
    expect(mocks.provisionUserFromCatalogMaster).toHaveBeenCalledWith(codexDb, TEST_CLERK_ID);
    expect(mocks.ensureWarframeWorksheetsForUser).not.toHaveBeenCalled();
  });

  it('creates empty worksheet shells when the master catalog is empty', () => {
    mocks.getWorksheets.mockReturnValue([]);
    mocks.provisionUserFromCatalogMaster.mockReturnValue(false);
    provisionWarframeUserIfNeeded(codexDb, TEST_CLERK_ID);
    expect(mocks.provisionUserFromCatalogMaster).toHaveBeenCalledWith(codexDb, TEST_CLERK_ID);
    expect(mocks.ensureWarframeWorksheetsForUser).toHaveBeenCalledWith(codexDb, TEST_CLERK_ID);
  });
});
