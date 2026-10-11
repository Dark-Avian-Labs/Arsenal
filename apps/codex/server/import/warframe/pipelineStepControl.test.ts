import { describe, expect, it } from 'vitest';

import { shouldRebuildSqliteFromExports } from './pipelineStepControl.ts';

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
