import type { Arcane } from '../components/ModBuilder/ArcaneSlots';
import { sanitizeDisplayTextKeepDamageTokens } from './damageTypeTokens';

export function getMaxRank(arcane: Arcane): number {
  try {
    if (arcane.level_stats) {
      const stats = JSON.parse(arcane.level_stats);
      return Array.isArray(stats) && stats.length > 0 ? stats.length - 1 : 5;
    }
  } catch {
    // ignore
  }
  return 5;
}

export function getArcaneDescription(arcane: Arcane, rank?: number): string {
  try {
    if (arcane.level_stats) {
      const stats = JSON.parse(arcane.level_stats);
      if (Array.isArray(stats) && stats.length > 0) {
        const idx = rank != null ? Math.min(rank, stats.length - 1) : stats.length - 1;
        const entry = stats[idx];
        if (typeof entry === 'object' && entry.stats) {
          return sanitizeDisplayTextKeepDamageTokens((entry.stats as string[]).join(' '));
        }
        if (typeof entry === 'string') return sanitizeDisplayTextKeepDamageTokens(entry);
      }
    }
  } catch {
    // ignore
  }
  return '';
}
