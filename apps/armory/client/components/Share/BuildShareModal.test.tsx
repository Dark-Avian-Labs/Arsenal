import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AtragraphModsProvider } from '../../context/AtragraphModsContext';
import type { ModSlot, Warframe } from '../../types/warframe';
import type { ArcaneSlot } from '../ModBuilder/ArcaneSlots';
import { BuildShareModal } from './BuildShareModal';

const warframe: Warframe = {
  unique_name: '/wf/uriel',
  name: 'Uriel',
  mastery_req: 0,
  health: 100,
  shield: 100,
  armor: 100,
  power: 100,
  sprint_speed: 1,
};

function slots(count: number): ModSlot[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    type: 'general',
    rank: 0,
    mod: { unique_name: `/mod/${index}`, name: `Mod ${index}` },
  }));
}

const arcanes: ArcaneSlot[] = [
  { rank: 0, arcane: { unique_name: '/arcane/1', name: 'Molt Augmented' } },
  { rank: 0, arcane: { unique_name: '/arcane/2', name: 'Arcane Bellicose' } },
];

function renderShare(modCount: number) {
  return render(
    <AtragraphModsProvider>
      <BuildShareModal
        open
        onClose={() => {}}
        buildName="Uriel"
        equipment={warframe}
        equipmentName="Uriel"
        equipmentType="warframe"
        slots={slots(modCount)}
        arcaneSlots={arcanes}
        shardSlots={[]}
        shardTypes={[]}
        orokinReactor
      />
    </AtragraphModsProvider>,
  );
}

function modColumnCounts(root: HTMLElement): number[] {
  return [...root.querySelectorAll('div')]
    .filter((el) => {
      const className = el.className;
      const parentClass = el.parentElement?.className ?? '';
      return (
        typeof className === 'string' &&
        className.includes('flex-col') &&
        className.includes('gap-1') &&
        parentClass.includes('gap-1') &&
        !parentClass.includes('flex-col')
      );
    })
    .map((el) => el.childElementCount);
}

describe('BuildShareModal', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404 })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('uses a shorter canvas and splits a 10-mod build into two columns of five', () => {
    renderShare(10);
    const root = document.querySelector<HTMLElement>('.share-export-root');
    expect(root).not.toBeNull();
    expect(root?.style.width).toBe('840px');
    expect(root?.style.height).toBe('820px');
    expect(modColumnCounts(root!)).toEqual([5, 5]);
    expect(document.body.textContent).toContain('Molt Augmented');
    expect(document.body.textContent).toContain('Arcane Bellicose');
  });

  it('keeps extra mods by adding a sixth row per column', () => {
    renderShare(12);
    const root = document.querySelector<HTMLElement>('.share-export-root');
    expect(modColumnCounts(root!)).toEqual([6, 6]);
  });
});
