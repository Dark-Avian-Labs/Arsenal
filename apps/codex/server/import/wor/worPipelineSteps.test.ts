import { describe, expect, it } from 'vitest';

import { WOR_PIPELINE_STEPS as serverSteps } from './worPipelineSteps.ts';
import { WOR_PIPELINE_STEPS as sharedSteps } from '../../../shared/worPipelineSteps.ts';

describe('WoR pipeline step lists', () => {
  it('keeps shared and server step keys identical', () => {
    expect(serverSteps).toEqual(sharedSteps);
  });
});
