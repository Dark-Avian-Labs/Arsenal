import type { IncarnonEvolutionTier } from '@dark-avian-labs/warframe-catalog';

export type {
  IncarnonData,
  IncarnonEvolutionTier,
  IncarnonPerkOption,
  IncarnonStatModifier,
  IncarnonStatName,
} from '@dark-avian-labs/warframe-catalog';

export interface ParsedGenesisPage {
  compatibleWeaponNames: string[];
  weaponColumnNames: string[];
  overview?: string;
  tiers: IncarnonEvolutionTier[];
}

export interface ParsedIntrinsicPage {
  weaponName: string;
  overview?: string;
  tiers: IncarnonEvolutionTier[];
}
