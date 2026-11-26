import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PROJECT_ROOT } from '../../config.ts';
import {
  hashWarframeRankExceptionsSource,
  isWarframeRankExceptionsSourceAvailable,
  WARFRAME_RANK_EXCEPTIONS_OUT_PATH,
} from './warframeRankExceptions.ts';

const SOURCE_JSON_PATH = path.join(
  PROJECT_ROOT,
  '../../packages/warframe-catalog/scripts/warframe-rank-exceptions.json',
);

describe('warframeRankExceptions', () => {
  it('keeps committed generated TS registry in sync with source JSON without mutating disk', () => {
    expect(isWarframeRankExceptionsSourceAvailable()).toBe(true);
    const hash = hashWarframeRankExceptionsSource();
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashWarframeRankExceptionsSource()).toBe(hash);

    const sourceRows = JSON.parse(fs.readFileSync(SOURCE_JSON_PATH, 'utf8')) as Array<{
      uniqueName: string;
    }>;
    const generatedTs = fs.readFileSync(WARFRAME_RANK_EXCEPTIONS_OUT_PATH, 'utf8');
    expect(sourceRows.length).toBeGreaterThan(0);
    for (const row of sourceRows) {
      expect(generatedTs).toContain(row.uniqueName);
    }
  });
});
