import { WOR_PIPELINE_STEPS, type WorPipelineStepKey } from '../../../shared/worPipelineSteps.ts';

export { WOR_PIPELINE_STEPS, type WorPipelineStepKey };

export const WOR_PIPELINE_STEP_LABELS: Record<WorPipelineStepKey, string> = {
  schema: 'Schema',
  fastidiousCatalog: 'Fastidious catalog',
  prospectorCatalog: 'Prospector catalog',
  fandomImages: 'Wiki images',
  fandomHeroStats: 'Wiki hero stats',
  manualOverrides: 'Manual overrides',
  seedValidation: 'Validation',
  sync_accounts: 'Sync accounts',
};
