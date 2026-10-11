import { describe, expect, it } from 'vitest';

import {
  isStepForced,
  shouldRebuildSqliteFromExports,
  wantsOverframeScrape,
} from './pipelineStepControl.ts';

describe('shouldRebuildSqliteFromExports', () => {
  it('reloads an empty catalog even when the export hashes match', () => {
    expect(
      shouldRebuildSqliteFromExports({
        forceImport: false,
        hashChanged: false,
        catalogEmpty: true,
      }),
    ).toBe(true);
  });

  it('skips when the catalog has rows and the hashes match', () => {
    expect(
      shouldRebuildSqliteFromExports({
        forceImport: false,
        hashChanged: false,
        catalogEmpty: false,
      }),
    ).toBe(false);
  });

  it('keeps Overframe off during a force import unless that scrape is requested', () => {
    expect(isStepForced('overframe', { forceImport: true })).toBe(false);
    expect(isStepForced('wiki', { forceImport: true })).toBe(true);
    expect(wantsOverframeScrape({ forceImport: true })).toBe(false);
    expect(wantsOverframeScrape({ forceSteps: ['overframe'] })).toBe(true);
    expect(isStepForced('overframe', { forceSteps: ['overframe'] })).toBe(true);
  });

  it('reloads when a force import or a hash change asks for it', () => {
    expect(
      shouldRebuildSqliteFromExports({
        forceImport: true,
        hashChanged: false,
        catalogEmpty: false,
      }),
    ).toBe(true);
    expect(
      shouldRebuildSqliteFromExports({
        forceImport: false,
        hashChanged: true,
        catalogEmpty: false,
      }),
    ).toBe(true);
  });
});
