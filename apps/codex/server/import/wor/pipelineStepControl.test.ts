import { describe, expect, it } from 'vitest';

import {
  shouldFetchFastidiousCatalog,
  shouldFetchProspectorCatalog,
  shouldRunWorStep,
  worImagesOnlyMissing,
} from './pipelineStepControl.ts';

describe('WoR pipeline step control', () => {
  it('controls Fastidious and Prospector fetches by live, cache hash, and forceImport flags', () => {
    expect(shouldFetchFastidiousCatalog({ live: true, sourcesChanged: false, forceImport: false })).toBe(true);
    expect(shouldFetchFastidiousCatalog({ live: false, sourcesChanged: false, forceImport: false })).toBe(false);
    expect(shouldFetchFastidiousCatalog({ live: false, sourcesChanged: true, forceImport: false })).toBe(true);
    expect(shouldFetchFastidiousCatalog({ live: false, sourcesChanged: false, forceImport: true })).toBe(true);

    expect(shouldFetchProspectorCatalog({ live: true, forceImport: false })).toBe(true);
    expect(shouldFetchProspectorCatalog({ live: false, forceImport: true })).toBe(true);
    expect(shouldFetchProspectorCatalog({ live: false, forceImport: false })).toBe(false);
  });

  it('honors forceSteps, forceImport, and forceImages overrides in shouldRunWorStep and worImagesOnlyMissing', () => {
    expect(shouldRunWorStep('fastidiousCatalog', false, { forceImport: true })).toBe(true);
    expect(shouldRunWorStep('prospectorCatalog', false, { forceImport: true })).toBe(true);
    expect(shouldRunWorStep('fandomImages', false, { forceImport: true })).toBe(false);
    expect(shouldRunWorStep('fandomImages', false, { forceImages: true })).toBe(true);
    expect(shouldRunWorStep('manualOverrides', false, { forceSteps: ['manualOverrides'] })).toBe(true);
    expect(shouldRunWorStep('manualOverrides', true, {})).toBe(true);

    expect(worImagesOnlyMissing({})).toBe(true);
    expect(worImagesOnlyMissing({ forceImages: true })).toBe(false);
    expect(worImagesOnlyMissing({ forceSteps: ['fandomImages'] })).toBe(false);
  });
});
